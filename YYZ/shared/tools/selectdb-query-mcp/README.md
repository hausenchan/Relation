# SelectDB Query MCP

This is a small read-only MCP server for local Codex skills that need to query Mid-Max SelectDB through the MySQL-compatible protocol.

It is intended for local development and skill helper scripts. Relation server-side business daily report generation should prefer environment variables and deterministic backend runners instead of depending on an interactive Codex MCP session.

## Configuration

Use environment variables in production:

```bash
MIDMAX_SELECTDB_HOST=<selectdb-host>
MIDMAX_SELECTDB_PORT=9030
MIDMAX_SELECTDB_DATABASE=<database>
MIDMAX_SELECTDB_USER=<readonly-user>
MIDMAX_SELECTDB_PASSWORD=<readonly-password>
MIDMAX_SELECTDB_MAX_ROWS=50000
```

For local use, a JSON config file can be provided with:

```bash
SELECTDB_QUERY_MCP_CONFIG_PATH=/path/to/.mcp.json
```

Use `.mcp.example.json` as the shape reference. Do not commit real credentials.

## Run

```bash
node YYZ/shared/tools/selectdb-query-mcp/server.mjs --check-config
node YYZ/shared/tools/selectdb-query-mcp/server.mjs
```

The server exposes one tool:

- `selectdb_query`: executes a read-only `SELECT` or `WITH` query with optional positional parameters.

The server blocks:

- Non-`SELECT/WITH` statements.
- Multiple SQL statements.
- DDL, DML, calls, load, infile and outfile statements.

Returned results include row count, columns, rows and elapsed time. Password values are never returned by the tool.
