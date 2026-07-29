# 开发交接

最后更新：2026-07-29

## 当前任务

状态：已完成

目标：按《产品模版与提版功能 PRD》实现产品模版管理、模版版本快照、项目预览、产品资产提版任务，以及主体身份密钥和域名配置的加密管理。

## 本轮已完成

- [x] 新增产品模版、模版版本、提版任务和提版记录表，支持 SQLite/MySQL 增量初始化。
- [x] 新增产品模版 CRUD、筛选、版本详情、预览和运行环境检测 API 及页面。
- [x] 产品资产列表增加最近提版模版/状态、模版筛选、提版表单、快照确认、任务进度和历史。
- [x] 提版服务端支持固定 Git 仓库/分支、任务级临时目录、域名配置替换、依赖检查、脱敏日志、失败重试和服务重启中断处理。
- [x] 主体新增/编辑支持身份密钥配置；服务端加密保存，列表/简要/详情不返回明文或密文；编辑留空保留，显式勾选后清除。
- [x] 主体身份密钥改为 JSON 文件上传；服务端写入私有目录并将缓存文件路径加密保存，编辑上传新文件会清理旧文件，提版时直接传递缓存路径给 upload.js，旧文本密钥仅在提版读取侧兼容。
- [x] 主体新增/编辑增加 API、埋点、CDN、短剧四类域名；服务端迁移并加密保存，提版接口按产品关联主体读取并固化域名快照。
- [x] 提版弹窗移除域名输入项，仅展示关联主体当前域名；主体缺少 API、埋点或 CDN 域名时由服务端拒绝提版并返回配置提示。
- [x] 产品模版新增/编辑表单移除“模版链接”和“附件说明”；服务端不再接受或返回这两个字段，新版本快照不再写入，旧数据库列保留兼容。
- [x] 提版点击后前置校验主体域名、产品模版标识、16 位 AppID、主体身份密钥文件路径和提版脚本；普通模版要求 API/埋点/CDN 三类域名，短剧模版额外要求短剧域名，校验通过后调用仓库 `utils/upload.js`。
- [x] 产品模版类型新增“短剧”；服务端、前端和 upload.js 统一以 `template_type=short_drama` 作为已选短剧模版依据，避免普通小程序模版因项目目录或名称被误判。
- [x] 提版任务执行器不再要求服务端配置 `PRODUCT_TEMPLATE_REPO_URL` 后先 clone 固定仓库；校验通过后直接把模版项目目录、主体域名、模版标识、AppID 和身份密钥文件路径传给仓库 `utils/upload.js`，由 upload.js 负责拉取 `/app/codeTemplates` 并上传。
- [x] 点击提版创建任务后展示“提版执行进度”弹窗，包含步骤条、当前步骤、任务 ID、AppID、执行次数、开始/结束时间、失败原因和脚本运行日志；弹窗支持自动轮询和手动刷新日志。
- [x] 后端运行 `utils/upload.js` 时将 stdout/stderr 流式追加到任务日志，页面可看到脚本 clone 模版、替换域名、上传和失败输出；日志继续走脱敏处理。
- [x] 提版信息不完整时，前端和服务端提示具体缺失项及补充路径：主体管理补充四类 HTTPS 域名/JSON 身份密钥，产品模版管理启用并配置可用模版。
- [x] `upload.js` 在处理提版项目的第一步将 `https://gitee.com/mdtec/zfb-mini-tools.git` 克隆到 `/app/codeTemplates`；目录已有 Git 仓库时复用，支持通过 `CODE_TEMPLATES_DIR` 和 `CODE_TEMPLATES_REPO` 覆盖部署/测试路径，模版项目优先从克隆目录解析。
- [x] 主体写接口、产品模版接口和提版接口应用菜单、模块、写权限及产品资产数据范围校验。
- [x] 新增 `server/lib/productTemplateRelease.js` 及单元回归测试。

## 已验证

- `node --check server/index.js`、`node --check server/lib/productTemplateRelease.js`：通过。
- `node --test server/lib/productTemplateRelease.test.js`：8 条通过。
- 前端全量测试：13 个测试套件、64 条测试通过。
- 后端全量测试：41 条测试通过，包含提版前置校验、主体域名、短剧域名条件校验、模版字段移除和 upload.js 参数传递回归；运行时使用 `/tmp` 随机测试主密钥/HMAC 密钥。
- 前端生产构建：通过，输出到 `/tmp/relation-release-validation-build-final`。
- 隔离 API 烟测：主体密钥脱敏、留空保留、显式清除、模版版本快照和非法参数校验通过。
- fake minidev 提版集成：临时 Git 仓库复制、五个域名配置替换、身份密钥临时文件清理、任务 `success/launched`、上传版本和日志落库均通过。
- 浏览器验收：产品模版新增表单、主体身份密钥输入框、产品资产模版筛选/提版入口均可正常加载。
- 浏览器验收：主体新增表单展示四类域名字段，产品资产页面正常加载；前端构建确认提版表单已移除域名输入项。
- 浏览器验收：新增产品模版表单已移除“模版链接”和“附件说明”字段。
- upload.js 端到端隔离烟测：真实执行指定脚本，fake minidev 收到主体四类域名、模版、AppID、版本和身份密钥路径，任务成功并完成临时目录清理；未连接支付宝。
- `upload.js` 语法检查和本地 `file://` Git 仓库克隆烟测通过；未在本地执行真实 Gitee 网络克隆和支付宝上传。
- 主体身份密钥 JSON 上传/替换集成测试通过，文件权限为 `0600`，服务端接口不返回文件路径或内容；后端全量测试 41 条通过，前端全量测试 64 条通过，生产构建通过。
- 提版前置校验与仓库 `utils/upload.js` 路径解析单测通过；upload.js 二次校验模版标识、AppID、身份密钥文件路径，并按模版类型条件校验短剧域名。
- 提版信息补充指引验证通过；后端全量 41 条、前端 64 条测试通过，构建输出到 `/tmp/relation-short-drama-upload-build`。
- 点击提版接口异常复现并修复：普通 `mini_program` 模版 `template_id=2` 不再要求短剧域名；同参数 `/api/product-assets/1/releases` 返回 `202 Accepted`，异步任务进入 upload.js 路径。
- 提版执行进度弹窗和脚本日志流式展示验证通过：`node --test server/lib/productTemplateRelease.test.js` 9 条通过，`node --test server/lib/productReleaseDomainIntegration.test.js` 通过，后端全量 41 条、前端 64 条测试通过，构建输出到 `/tmp/relation-release-progress-modal-build`；浏览器加载 `/product-assets` 安全重定向到登录页且无新增白屏错误。

## 遗留风险与上线配置

- 当前环境没有真实 `.secrets` 或 minidev 依赖；生产部署前必须配置 `RELATION_MASTER_KEY_PATH`、`RELATION_HMAC_KEY_PATH`、主体身份密钥文件目录和真实 minidev 运行环境。产品模版预览仍依赖 `PRODUCT_TEMPLATE_REPO_URL`、`PRODUCT_TEMPLATE_REPO_ALLOWLIST`、`PRODUCT_TEMPLATE_GIT_BRANCH`；提版上传默认由 `utils/upload.js` 克隆 `CODE_TEMPLATES_REPO` 到 `CODE_TEMPLATES_DIR`。
- 真实支付宝上传尚未执行；本轮仅使用 fake minidev 验证任务执行协议，不能视为已验证真实 appId 权限、验签和支付宝网络连通性。
- 生产部署可通过 `PRODUCT_TEMPLATE_UPLOAD_SCRIPT` 覆盖默认的仓库 `utils/upload.js`，并确保脚本目录可加载 minidev JavaScript API。
- 生产部署需为 `RELATION_IDENTITY_KEY_DIR` 配置持久化私有目录并限制为服务进程可读写；该目录不通过静态文件服务暴露，且必须纳入备份与访问审计。
- 产品模版预览返回服务端临时目录，不启动浏览器预览服务，符合本期 PRD 边界。

# 历史交接

最后更新：2026-07-21

## 当前任务

状态：已完成

目标：目标管理和周报管理复用文档中心共享逻辑，支持项目组、部门、小组、个人共享；
文档默认共享人按陈锦标、陈豪赞、林璐韵、贺敏的顺序默认选中，并允许移除后保持。

## 已完成

- [x] 新增通用 `content_shares`，目标和周报统一支持四类共享对象。
- [x] 列表、详情、历史版本、实时协作和保存接口统一应用共享可见性与编辑权限。
- [x] 共享协作者可编辑并继续授权，但不能删除记录；目标管理字段和历史恢复仍受原管理权限限制。
- [x] 文档默认人员优先按四个指定姓名匹配，角色仅作回退，显示顺序固定。
- [x] 旧文档一次性补默认共享；手动移除并保存后不会在重启时重新回填。
- [x] 新建文档、目标和周报默认共享四人，也可在保存前或共享弹窗中移除。
- [x] 删除目标、周报、用户、小组或项目组时同步清理相关共享记录。
- [x] 更新 `AGENTS.md` 的共享功能地图、权限边界和高风险耦合说明。

## 待完成

- 无代码、测试或提交遗留项。
- 本轮提交信息：`优化目标周报共享逻辑`，目标远端：Gitee `main`。

## 已验证

- 前端全量测试：14 个测试套件、66 条测试全部通过。
- 后端全量测试：35 条测试全部通过。
- 共享集成测试：个人、部门、小组、项目组可见和编辑，未共享隔离，继续授权、删除限制、
  目标管理字段及历史恢复权限均通过。
- 浏览器：文档、目标、周报共享弹窗均展示四类共享对象，四位默认人员按指定顺序选中。
- 浏览器：文档移除默认人员、保存并重新打开后保持移除状态。
- 隔离生产构建：通过，输出到 `/tmp/relation-content-sharing-final-build`。
- `node --check server/index.js`、`git diff --check`：通过。

## 工作区提醒

- 存在其他会话的未提交修改；不要纳入本任务：`client/build/*`、`data.db`、
  `documentFolderPermissions*`、`server/lib/wolaiMcpImport.test.js`、`data-local.db*`、
  `.codex/skills/yyz-dashboard-analysis/`、`dataAnalysis/` 和若干业务 Markdown。
- `client/src/pages/Documents.js` 同时含其他会话的文件夹权限与 Wolai 引用改动；本任务只暂存
  新建文档默认共享表单的精确 hunk。
