import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import postgres from "postgres";
import { z } from "zod";
import { Logger } from "./utils/logger.js";
import { SQLValidator } from "./validators/sql-validator.js";
import { QueryToJupyterHandler } from "./handlers/query-to-jupyter.js";
import { SSLConfigBuilder } from "./utils/ssl-config.js";
const QUERY_TIMEOUT_MS = 30000;
const MAX_ROWS = 1000;
const ALLOW_WRITE_OPS = process.env.ALLOW_WRITE_OPS === "true";

export class PostgresMCPServer {
  private server: Server;
  private sql: ReturnType<typeof postgres> | null = null;
  private validator: SQLValidator;
  private jupyterHandler: QueryToJupyterHandler;

  constructor() {
    this.server = new Server(
      {
        name: "postgres-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.validator = new SQLValidator(MAX_ROWS, ALLOW_WRITE_OPS);
    this.jupyterHandler = new QueryToJupyterHandler(
      this.validator,
      (query) => this.executeQuery(query),
      ALLOW_WRITE_OPS
    );
    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "execute_query",
            description:
              "Execute a SQL query against the PostgreSQL database. In read-only mode, only SELECT, EXPLAIN, and SHOW queries are allowed.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The SQL query to execute",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "query_to_jupyter",
            description:
              "Execute a SQL query and automatically create and open a Jupyter notebook (.ipynb) with interactive visualizations. The notebook will be created in the current directory and opened in Cursor/VS Code.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The SQL query to execute (SELECT only)",
                },
                chartType: {
                  type: "string",
                  enum: ["line", "bar", "pie", "area", "scatter", "multi"],
                  description:
                    "Type of chart to generate ('multi' creates multiple visualizations)",
                },
                xColumn: {
                  type: "string",
                  description: "Column name for X-axis (labels)",
                },
                yColumn: {
                  type: "string",
                  description: "Column name for Y-axis (values)",
                },
                title: {
                  type: "string",
                  description:
                    "Title of the analysis (will be used for filename)",
                },
                filename: {
                  type: "string",
                  description:
                    "Optional custom filename (without .ipynb extension)",
                },
              },
              required: ["query", "chartType", "xColumn", "yColumn"],
            },
          },
        ],
      };
    });

    // Execute tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "execute_query") {
        return await this.handleExecuteQuery(request.params.arguments);
      }

      if (request.params.name === "query_to_jupyter") {
        return await this.jupyterHandler.handle(request.params.arguments);
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }

  /**
   * Handle execute_query tool
   */
  private async handleExecuteQuery(args: any) {
    const QueryInputSchema = z.object({
      query: z.string().min(1, "Query cannot be empty"),
    });

    const { query } = QueryInputSchema.parse(args);
    Logger.info("Executing SQL query", { query: query.substring(0, 200) });

    // Validate query
    const validation = this.validator.validate(query);
    if (!validation.isValid) {
      Logger.warn("Query validation failed", {
        error: validation.error,
        query: query.substring(0, 200),
      });
      throw new Error(validation.error || "Query validation failed");
    }

    // Add LIMIT if needed
    let finalQuery = query;
    if (!ALLOW_WRITE_OPS || query.trim().toUpperCase().startsWith("SELECT")) {
      finalQuery = this.validator.addLimitIfNeeded(query);
    }

    const startTime = Date.now();
    try {
      const result = await this.executeQuery(finalQuery);
      const duration = Date.now() - startTime;

      Logger.info("Query executed successfully", {
        duration: `${duration}ms`,
        rowCount: result.length,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      Logger.error("Query execution failed", {
        error: error.message,
        duration: `${duration}ms`,
      });
      throw error;
    }
  }

  /**
   * Ensure database connection
   */
  private async ensureConnection() {
    if (this.sql) {
      return;
    }

    let databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      const password: string = process.env.DB_PWD || "";
      const encodedPassword = encodeURIComponent(password);
      const host: string = process.env.DB_HOST || "";
      const port: string = process.env.DB_PORT || "";
      const database: string = process.env.DB_NAME || "";
      const username: string = process.env.DB_USERNAME || "";
      databaseUrl = `postgresql://${username}:${encodedPassword}@${host}:${port}/${database}`;
    }

    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL or individual database connection variables must be set."
      );
    }

    Logger.info("Connecting to PostgreSQL database");

    try {
      const sslConfig = SSLConfigBuilder.build();

      this.sql = postgres(databaseUrl, {
        ssl: sslConfig,
        max: 1,
        idle_timeout: 20,
        connect_timeout: 10,
      });

      await this.sql`SELECT 1`;
      Logger.info("Successfully connected to PostgreSQL database");
    } catch (error: any) {
      Logger.error("Failed to connect to PostgreSQL", {
        error: error.message,
      });
      throw new Error(`Failed to connect to database: ${error.message}`);
    }
  }

  /**
   * Execute query with timeout
   */
  private async executeQuery(query: string): Promise<any[]> {
    await this.ensureConnection();

    if (!this.sql) {
      throw new Error("Database connection not established");
    }

    try {
      const result = await Promise.race([
        this.sql.unsafe(query),
        new Promise<any[]>((_, reject) =>
          setTimeout(
            () => reject(new Error("Query timeout: exceeded 30 seconds")),
            QUERY_TIMEOUT_MS
          )
        ),
      ]);

      if (Array.isArray(result) && result.length > MAX_ROWS) {
        Logger.warn("Query result exceeds MAX_ROWS, truncating", {
          returned: result.length,
          max: MAX_ROWS,
        });
        return result.slice(0, MAX_ROWS);
      }

      return result;
    } catch (error: any) {
      const safeError = error.message || "Database query failed";
      throw new Error(safeError);
    }
  }

  /**
   * Start the MCP server
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    Logger.info("PostgreSQL MCP Server started and ready");
  }
}
