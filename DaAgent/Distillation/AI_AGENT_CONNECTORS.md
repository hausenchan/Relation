# AI 训练台外部连接器配置

AI 训练台的通用 Agent 可以通过服务端白名单访问 Mid-Max、Gitee 和 HTTP MCP。所有连接器默认拒绝访问，只有配置了 `public: true`、`allowed_roles` 或 `allowed_user_ids` 的员工才能使用。

## 安全边界

- 模型不能传入任意服务地址，只能选择服务端预先配置的数据源、项目或 MCP 服务器。
- Mid-Max 当前只支持管理员配置的 `GET` 数据源。
- Gitee 当前只支持目录树和文件读取，不提供提交、合并或删除能力。
- MCP 默认 `read_only: true`，并继续受 `allowed_tools`、`blocked_tools` 约束。
- Token 只放在部署环境变量中，不提交到仓库。
- 每次工具调用的参数摘要、结果摘要、状态和耗时都会写入 AI 训练消息轨迹。

## Mid-Max

```bash
AI_AGENT_MIDMAX_BASE_URL=https://mid-max.midongtech.com
AI_AGENT_MIDMAX_API_TOKEN=<production-token>
AI_AGENT_MIDMAX_SOURCES_JSON='[
  {
    "source_code": "zhixiao_daily",
    "name": "支小日报",
    "description": "查询支小按日经营指标",
    "path": "/replace-with-agent-readonly-api/zhixiao/daily",
    "allowed_roles": ["admin"]
  }
]'
```

`path` 必须替换成 Mid-Max 实际提供的只读 API。模型调用时只能传查询参数，例如日期范围、媒体或项目编码，不能更改请求地址和 HTTP 方法。

## Gitee

```bash
AI_AGENT_GITEE_API_BASE_URL=https://gitee.com/api/v5
AI_AGENT_GITEE_TOKEN=<read-only-personal-access-token>
AI_AGENT_GITEE_PROJECTS_JSON='[
  {
    "project_code": "relation",
    "name": "Relation",
    "owner": "mdtec",
    "repo": "relation",
    "branch": "main",
    "allowed_roles": ["admin"]
  },
  {
    "project_code": "gcad",
    "name": "Gcad",
    "owner": "mdtec",
    "repo": "gcad",
    "branch": "main",
    "allowed_roles": ["admin"]
  }
]'
```

建议使用只读 Token。员工可以让 Agent 列出授权项目、读取目录树或指定文本文件，不能执行代码仓库写操作。

## 浏览器和 MCP

浏览器能力通过支持 Streamable HTTP 的 MCP 服务接入。生产环境需要先部署可被 Relation 服务端访问的 Browser MCP，再配置端点和工具白名单。

```bash
AI_AGENT_BROWSER_MCP_TOKEN=<production-token>
AI_AGENT_MCP_SERVERS_JSON='[
  {
    "server_code": "browser",
    "name": "Browser MCP",
    "description": "读取已授权网页、导航、截图和页面检查",
    "endpoint": "https://mcp.example.com/browser",
    "token_env": "AI_AGENT_BROWSER_MCP_TOKEN",
    "read_only": true,
    "allowed_tools": ["page_open", "page_read", "page_search", "page_screenshot"],
    "allowed_url_origins": [
      "https://relation.midongtech.com",
      "https://mid-max.midongtech.com",
      "https://gitee.com"
    ],
    "allowed_roles": ["admin"]
  }
]'
```

MCP 必须明确填写 `allowed_tools`，空白名单不会开放任何工具。如果 MCP 参数包含完整页面 URL，还必须命中 `allowed_url_origins`；这样模型不能把页面导航到未授权域名。如果工具名称包含创建、修改、删除、上传、发布或发送等写操作含义，`read_only: true` 会再次过滤。

## 员工授权

每个数据源、项目或 MCP 服务均可使用以下字段：

```json
{
  "enabled": true,
  "public": false,
  "allowed_roles": ["admin"],
  "allowed_user_ids": [1, 12]
}
```

没有任何授权字段时，该连接器不会出现在员工的 Agent 工具列表中。

## 验证

部署后进入 AI 训练台，运行以下问题：

1. `检查当前可用的外部连接器。`
2. `列出我能查询的 Mid-Max 数据源。`
3. `列出我能访问的 Gitee 项目，并读取 Gcad 的 README。`
4. `列出 Browser MCP 的可用工具。`

聊天窗口会实时展示路由、模型决策、工具开始、工具完成、保存和最终完成事件。最终消息的“工作过程”中会保留持久化后的工具执行记录。
