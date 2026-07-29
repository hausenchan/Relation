# YYZ Skill 管理

业务专属 Skill 的权威源码优先放在对应领域 Agent 的 `skills/`，跨领域 Skill 才放在本目录。

推荐的三层关系：

1. `YYZ/<领域>/skills/<skill-code>/`：权威源码、引用、脚本、评测和版本记录。
2. `.codex/skills/<skill-code>/`：由权威源码构建或同步的 Codex 运行镜像，不单独编辑。
3. Relation Agent 中台：通过 API 发布的不可变 Skill 版本，记录来源路径、提交号、校验值和评测结果。

`yyz-dashboard-analysis` 已迁移至权威源码：

`YYZ/intelligence/data-intelligence/skills/yyz-dashboard-analysis/`

其 `manifest.json` 记录版本、归属 Agent、源码路径、镜像路径、评测和发布状态。只修改权威源码，
然后执行：

```bash
npm run skill:sync:yyz-dashboard-analysis
npm run skill:check:yyz-dashboard-analysis
```

第一条命令将权威源码同步到 `.codex/skills/yyz-dashboard-analysis`，第二条命令校验文件清单、内容和
SHA-256 树校验值。提交前必须保证检查无 `missing`、`changed` 或 `extra`。Relation 发布包后续也必须
从权威源码构建，不得从员工机器上的临时修改镜像发布。
