# Mid-Max SelectDB SQL Templates

This directory documents the default template location only. Production SQL templates should normally be deployed by ops into `MIDMAX_SELECTDB_TEMPLATE_DIR`, not committed here.

For the full Zhixiao runtime configuration checklist, see `../zhixiao-selectdb-ops.md`.

Each template filename must match its audited `dataset_code`, for example:

```text
zhixiao_app_income_daily.sql
```

Allowed placeholders:

- `:start_date`
- `:end_date`
- `:limit`

Templates must be read-only `SELECT` or `WITH` queries. Do not commit credentials, physical table inventories, or production row samples.
