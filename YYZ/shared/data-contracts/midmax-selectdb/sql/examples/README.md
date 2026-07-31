# Zhixiao SelectDB SQL Template Examples

These files are examples for data/ops. Do not copy them into production as-is.

To enable SelectDB mode, create real `.sql` files in `MIDMAX_SELECTDB_TEMPLATE_DIR` with the same filenames but without `.example`, then replace the placeholder source names with audited SelectDB views or tables.

Rules enforced by the backend:

- Query must start with `SELECT` or `WITH`.
- Only `:start_date`, `:end_date`, and `:limit` are allowed placeholders.
- Multiple statements, DDL, DML, export statements, and unreviewed parameters are rejected.
- Output column aliases should match the legacy report headers below, because the current bridge materializes snapshots into the existing HTML generator's workbook inputs.

The default bridge writes `.xlsx` content even when the legacy filename ends with `.xls`; the current legacy generator already converts `.xls` inputs before parsing, so keep its existing `soffice` runtime available until the `source-v2 -> report_model` renderer replaces this compatibility layer.
