# 预算管理相关 SQL

## 1. budgets 表结构

```sql
CREATE TABLE IF NOT EXISTS budgets (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL,
  source                TEXT,
  platform              TEXT,
  method                TEXT,
  target                TEXT,
  has_monetization_bd   INTEGER DEFAULT 0,
  ad_format             TEXT,
  market_size           TEXT,
  competitor_scale      TEXT,
  potential_level       TEXT DEFAULT 'medium',
  test_start_date       TEXT,
  status                TEXT DEFAULT 'new_entry',
  update_notes          TEXT,
  created_by            INTEGER NOT NULL,
  team_id               INTEGER,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 2. 菜单权限表（已存在）

```sql
CREATE TABLE IF NOT EXISTS user_menu_perms (
  user_id INTEGER NOT NULL,
  menu_key TEXT NOT NULL,
  PRIMARY KEY (user_id, menu_key)
);
```

## 3. 为商务预算组成员配置菜单权限（示例）

```sql
-- 为指定用户添加预算管理菜单权限
INSERT INTO user_menu_perms (user_id, menu_key) VALUES (?, '/budgets');

-- 查询某用户的菜单权限
SELECT menu_key FROM user_menu_perms WHERE user_id = ?;
```

## 权限说明

- **admin 角色**：自动拥有所有菜单权限
- **CEO/CMO/COO/CTO 角色**：代码中硬编码，自动可见预算管理菜单
- **其他用户**：需要管理员在"菜单权限管理"页面为其配置 `/budgets` 权限
