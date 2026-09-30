import type { QueryValidationResult } from "../types/index.js";

export class SQLValidator {
  private readonly dangerousCommands = [
    "DROP",
    "DELETE",
    "UPDATE",
    "INSERT",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "GRANT",
    "REVOKE",
    "EXECUTE",
    "CALL",
  ];

  private readonly maxRows: number;
  private readonly allowWriteOps: boolean;

  constructor(maxRows: number = 1000, allowWriteOps: boolean = false) {
    this.maxRows = maxRows;
    this.allowWriteOps = allowWriteOps;
  }

  /**
   * Validates SQL query for security using strict regex-based validation
   */
  validate(sql: string): QueryValidationResult {
    const sqlUpper = sql.trim().toUpperCase();

    // Check for multiple statements
    const semicolonCount = (sql.match(/;/g) || []).length;
    if (semicolonCount > 1) {
      return {
        isValid: false,
        error:
          "Multiple statements are not allowed. Please execute one query at a time.",
      };
    }

    if (!this.allowWriteOps) {
      // Check for dangerous commands in read-only mode
      for (const cmd of this.dangerousCommands) {
        const regex = new RegExp(`\\b${cmd}\\b`, "i");
        if (regex.test(sql)) {
          return {
            isValid: false,
            error: `Command '${cmd}' is blocked in read-only mode.`,
          };
        }
      }

      // Only allow SELECT, EXPLAIN, SHOW, WITH (CTE), etc.
      const allowedStart = /^\s*(SELECT|EXPLAIN|SHOW|WITH|DESCRIBE|DESC)\s+/i;
      if (!allowedStart.test(sql)) {
        return {
          isValid: false,
          error:
            "Only SELECT, EXPLAIN, SHOW, and WITH queries are allowed in read-only mode.",
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Adds LIMIT clause if not present
   */
  addLimitIfNeeded(sql: string): string {
    const sqlUpper = sql.trim().toUpperCase();

    // Check if LIMIT already exists
    if (sqlUpper.includes("LIMIT")) {
      return sql;
    }

    // Check if it's a SELECT query
    if (sqlUpper.startsWith("SELECT") || sqlUpper.includes("SELECT")) {
      const limitRegex = /\s*;?\s*$/;
      return sql.replace(limitRegex, ` LIMIT ${this.maxRows}$&`);
    }

    return sql;
  }

  /**
   * Validate that required columns exist in query results
   */
  validateColumns(data: any[], xColumn: string, yColumn: string): void {
    if (data.length === 0) {
      return; // No data to validate
    }

    const columns = Object.keys(data[0]);

    if (!columns.includes(xColumn)) {
      throw new Error(
        `Column '${xColumn}' not found in query results. Available columns: ${columns.join(
          ", "
        )}`
      );
    }

    if (!columns.includes(yColumn)) {
      throw new Error(
        `Column '${yColumn}' not found in query results. Available columns: ${columns.join(
          ", "
        )}`
      );
    }
  }
}
