# PostgreSQL MCP Server (Secure)

A secure MCP (Model Context Protocol) server for PostgreSQL that allows executing SQL queries in read-only mode by default, with strict validation and comprehensive logging.

## Features

- ✅ **Read-only mode by default** : Only SELECT, EXPLAIN, SHOW, WITH, and DESCRIBE queries are allowed
- ✅ **Strict SQL query validation** : Regex-based validation to block dangerous commands and multiple statements
- ✅ **Block dangerous commands** : DROP, DELETE, UPDATE, INSERT, TRUNCATE, ALTER, etc.
- ⚠️ **Optional write mode** : Enabled via `ALLOW_WRITE_OPS=true` — disables SQL validation entirely (use with caution)
- ✅ **Query timeout** : 30 seconds maximum per query
- ✅ **Result limitation** : Maximum 1000 rows returned
- ✅ **Jupyter export** : Generate and open interactive `.ipynb` visualizations from query results
- ✅ **Comprehensive logging** : All operations are logged with timestamp
- ✅ **Robust error handling** : Secure error messages without information leakage

## Installation

```bash
bun install
```

## Configuration

Environment variables can be provided in two ways:

- **MCP client config (recommended)** : define them in the `env` block of your MCP configuration. When the MCP client spawns the server, only these variables are guaranteed to be visible.
- **`.env` file (manual runs only)** : Bun automatically loads `.env` from the current working directory. It is **not** loaded when the server is spawned by an MCP client from a different working directory.

### Environment Variables

- `DB_HOST` (required) : PostgreSQL server host (e.g., `localhost`)
- `DB_PORT` (required) : PostgreSQL server port (e.g., `5432`)
- `DB_NAME` (required) : Database name
- `DB_USERNAME` (required) : Database user
- `DB_PWD` (required) : Database password
- `ALLOW_WRITE_OPS` (optional) : Set to `true` to allow write operations (INSERT, UPDATE, DELETE). Default: `false` (read-only mode)

> `DATABASE_URL` is still supported as an alternative (it takes precedence when set), but the individual `DB_*` variables are the recommended configuration.

#### SSL/TLS Certificate Configuration (optional)

For secure connections with SSL certificates:

- `PATH_TO_CA` (optional) : Path to the CA certificate file (e.g., `/path/to/ca.crt`)
- `PATH_TO_CLIENT_CERTIFICATE` (optional) : Path to the client certificate file (e.g., `/path/to/client.crt`)
- `PATH_TO_CLIENT_KEY` (optional) : Path to the client private key file (e.g., `/path/to/client.key`)
- `SSL_REJECT_UNAUTHORIZED` (optional) : Set to `false` to allow self-signed certificates. Default: `true`

**Example `.env` file (manual runs only):**

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mydb
DB_USERNAME=readonly_user
DB_PWD=password
ALLOW_WRITE_OPS=false
PATH_TO_CA=/path/to/ca.crt
PATH_TO_CLIENT_CERTIFICATE=/path/to/client.crt
PATH_TO_CLIENT_KEY=/path/to/client.key
SSL_REJECT_UNAUTHORIZED=true
```

### MCP Configuration Example

In your MCP configuration (e.g., `~/.cursor/mcp.json` or similar):

**Basic configuration:**

```json
{
  "mcpServers": {
    "postgres": {
      "command": "bun",
      "args": ["/path/to/postgres-mcp/index.ts"],
      "env": {
        "DB_HOST": "localhost",
        "DB_PORT": "5432",
        "DB_NAME": "mydb",
        "DB_USERNAME": "readonly_user",
        "DB_PWD": "password",
        "ALLOW_WRITE_OPS": "false"
      }
    }
  }
}
```

**With SSL certificates:**

```json
{
  "mcpServers": {
    "postgres": {
      "command": "bun",
      "args": ["/path/to/postgres-mcp/index.ts"],
      "env": {
        "DB_HOST": "localhost",
        "DB_PORT": "5432",
        "DB_NAME": "mydb",
        "DB_USERNAME": "readonly_user",
        "DB_PWD": "password",
        "ALLOW_WRITE_OPS": "false",
        "PATH_TO_CA": "/path/to/ca.crt",
        "PATH_TO_CLIENT_CERTIFICATE": "/path/to/client.crt",
        "PATH_TO_CLIENT_KEY": "/path/to/client.key",
        "SSL_REJECT_UNAUTHORIZED": "true"
      }
    }
  }
}
```

## Usage

### MCP Tools

#### `execute_query`

Executes a SQL query against the PostgreSQL database.

**Parameters:**

- `query` (string, required) : The SQL query to execute

**Example:**

```json
{
  "name": "execute_query",
  "arguments": {
    "query": "SELECT * FROM users LIMIT 10"
  }
}
```

#### `query_to_jupyter`

Executes a SELECT query, generates an interactive Jupyter notebook (`.ipynb`) with a chart, writes it to the current working directory, and tries to open it in Cursor/VS Code.

**Parameters:**

- `query` (string, required) : The SELECT query to execute
- `chartType` (string, required) : One of `line`, `bar`, `pie`, `area`, `scatter`, `multi` (`multi` creates multiple visualizations)
- `xColumn` (string, required) : Column name for the X-axis (labels)
- `yColumn` (string, required) : Column name for the Y-axis (values)
- `title` (string, optional) : Analysis title (also used for the filename)
- `filename` (string, optional) : Custom filename, without the `.ipynb` extension

**Notes:**

- The notebook file is written to `process.cwd()`.
- Requires Python with `pandas`, `matplotlib`, `seaborn`, `plotly`, `jupyter`, and `ipykernel` to run the notebook cells.

## Security

### Commands blocked in read-only mode

The following commands are blocked by default:

- `DROP` - Object deletion
- `DELETE` - Data deletion
- `UPDATE` - Data modification
- `INSERT` - Data insertion
- `TRUNCATE` - Table truncation
- `ALTER` - Structure modification
- `CREATE` - Object creation
- `GRANT` / `REVOKE` - Permission management
- `EXECUTE` / `CALL` - Function/procedure execution

Queries must also start with `SELECT`, `EXPLAIN`, `SHOW`, `WITH`, `DESCRIBE`, or `DESC`, and multiple statements in a single query (more than one `;`) are rejected.

### Write mode

When `ALLOW_WRITE_OPS=true`, **all SQL validation is disabled**: any command — including `DROP`, `TRUNCATE`, and `ALTER` — is executed as-is. Protect the database at the PostgreSQL level instead (see recommendations below).

### Security Recommendations

1. **Use a PostgreSQL read-only user** : Create a dedicated PostgreSQL role with SELECT permissions only:

```sql
CREATE ROLE readonly_user WITH LOGIN PASSWORD 'secure_password';
ALTER ROLE readonly_user SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE your_database TO readonly_user;
GRANT USAGE ON SCHEMA public TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;
```

2. **PostgreSQL-level timeout** : Also configure a timeout at the database level:

```sql
ALTER ROLE readonly_user SET statement_timeout = '30s';
```

3. **Limit connections** : Use a limited connection pool in your PostgreSQL configuration.

## Logging

All operations are logged with:

- ISO 8601 timestamp
- Operation type (INFO, WARN, ERROR)
- Query details (truncated to 200 characters for security)
- Execution duration
- Number of rows returned
- Errors (without exposing sensitive details)

Logs are written to `stderr` to avoid interfering with MCP communication on `stdout`.

## Development

```bash
# Install dependencies
bun install

# Run the server
bun run index.ts
```

## Technical Specifications

- **Runtime**: Bun
- **MCP SDK**: @modelcontextprotocol/sdk v1.25.2+
- **PostgreSQL Client**: postgres (porsager/postgres) v3.4.8+
- **Validation**: Zod v4.3.5+
- **SQL Parser**: Regex-based validation (no external parser dependency)

## License

Private project
