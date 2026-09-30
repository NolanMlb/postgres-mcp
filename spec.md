# Spec - Secured PostgreSQL MCP

## Objectives

- Allow DATABASE_URL to be defined via MCP configuration
- Execute read-only SQL queries by default
- Strict validation of SQL queries (blocking dangerous commands)
- Allow write operations only with ENV `ALLOW_WRITE_OPS=true`
- Access tables as `resources`
- Use Zod for schema validation
- Log all executed queries

## Security

- Block commands: DROP, DELETE, UPDATE, INSERT, TRUNCATE, ALTER (in read-only mode)
- Parse and validate all SQL queries
- Timeout on queries (30 seconds max)
- Limit the number of rows returned (1000 max)
- Connection with read-only user only
