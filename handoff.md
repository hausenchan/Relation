# 开发交接

最后更新：2026-07-30

## Agent 中台业务日报 MVP（2026-07-30）

### 已完成

- 新增 Agent 中台“业务日报”菜单与`/agents/business-daily-reports`列表、详情和编辑路由；页面支持指定
  日期生成、状态/日期/回收站筛选、七阶段进度、HTML 详情、机器原稿、修订历史、执行与产物查看、
  重新生成、文字修订、提交/审核、软删除和恢复，桌面与移动端均使用统一业务页样式。
- 日报入口已扩展为“YYZ项目总览 / 业务线 / 媒体”范围树：业务线覆盖支小、H5/百度JS、CPA及三个
  子类、淘小、微小、宝箱/签到，媒体首期覆盖媒体大盘和爱奇艺极速版；桌面使用左侧树，窄屏使用
  树形选择器，范围保存在 URL，生成、去重、版本号、列表和重跑均按范围隔离。
- 新增`server/lib/businessDailyReports.js`领域模块和`ai_business_daily_*`六张表，机器原稿不可覆盖，
  人工修订只接受叙述字段、使用`base_revision_no + lock_version`防并发覆盖；产物、修订和运行摘要使用
  现有 AES-GCM 字段加密，HTML 经服务端清洗后在无脚本 sandbox iframe 中展示。
- 接口同时校验`/agents/business-daily-reports`菜单权限和`business_daily_report`敏感模块成员；
  `readonly/guest`只读，审核/恢复要求`manage`权限，所有写操作进入统一操作日志。
- 支持通过`RELATION_AI_DISTILL_MYSQL_DATABASE`及同前缀连接变量使用独立
  `relation_ai_distill`逻辑库；未配置时只回退当前线上 MySQL 的独立表族，不读取本地 DB。日报库不建
  跨库用户外键，展示名从 Relation 主库批量补齐。
- 生成接口已返回`202`并异步记录阶段。当前若 Skill 未发布、Mid-Max 未配置或`source-v2`执行器未完成，
  会以明确错误码失败并保留记录，不生成伪报告或把缺失值写成 0。
- 支小业务范围`business_line:ZHIXIAO`已支持导入本机 zhixiao-ai 生成的固定 HTML 日报：后端默认读取
  `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/支小数据new.html`，可用`ZHIXIAO_REPORT_HTML_PATH`
  覆盖；导入 Relation 时移除本地`zfb666`密码门并保存为`zhixiao_html_report`产物，原始本地 HTML
  不改动，访问由业务日报菜单与敏感模块权限控制。
- 支小业务“生成日报”按钮已接入本机生成器执行链路：选中`business_line:ZHIXIAO`时，runtime status
  不再使用`yyz-dashboard-analysis`发布与 Mid-Max connector blocker，而是检查支小生成器、8 份固定
  源报表和 HTML 输出状态；创建日报会先运行`generate_multi3_report_project.py`编译检查与生成，再导入
  去密码门后的 HTML。前端状态和运行步骤只展示文件名、缺失清单、数量和时间，不暴露本机完整路径。
- 日报详情在存在`zhixiao_html_report`产物时显示独立“支小业务”Tab，通过受限 sandbox iframe 展示
  可交互 HTML；普通“当前日报 / 机器原稿”继续走无脚本清洗展示边界，不向前端暴露本地文件路径。

### 待办

- 完成`yyz-dashboard-analysis`的`source-v2/normalized-v2`确定性执行器、完整分页、缺失值、财务事实源和
  质量门禁，在 AI 训练台发布 Skill 后替换当前受控失败执行器。
- 阶段 2 再实现数字结构化纠错与派生指标重算、质量评分、错误分类、训练候选和新旧 Skill 回放；当前
  MVP 已建 annotations/training_links 表，但尚未开放对应 UI 与 API。
- 生产部署前创建`relation_ai_distill`库和最小权限账号，配置 Mid-Max 只读数据源，并使用隔离 MySQL
  完成登录、权限、生成失败/成功、修订并发、删除恢复和审计回归。
- 将支小业务本地 HTML 导入链路接入隔离 MySQL 的 HTTP 回归，覆盖创建`business_line:ZHIXIAO`日报、
  产物读取、无密码门展示和日期不一致 warning。
- 后续再把“从 Mid-Max 导出 8 份 XLS”接为受控前置自动化；当前 Web 按钮不操作 Chrome，不索要或保存
  Mid-Max 密码，源文件缺失时任务以明确错误码失败。

### 验证

- `node --test server/lib/businessDailyReports.test.js`通过，8/8；覆盖日期门禁、范围目录、旧表范围版本迁移、
  范围级生成版本、活动任务识别、七阶段失败、机器指标不可被文字修订覆盖、修订并发冲突、软删除恢复
  和 HTML 清洗；新增覆盖支小 HTML 密码门移除及额外 HTML 产物入库读取。
- `node --check server/index.js`、`server/lib/businessDailyReports.js`、`server/lib/database.js`通过。
- `BUILD_PATH=/tmp/relation-business-daily-scope-build-final npm run build`通过。
- `BUILD_PATH=/tmp/relation-business-daily-scope-build-final npm run performance:budget`通过：首屏 JavaScript
  `329.5KB / 400KB`，79 个异步 chunk，最大`420.8KB / 500KB`。
- `BUILD_PATH=/tmp/relation-business-daily-zhixiao-build npm run build`通过。
- `BUILD_PATH=/tmp/relation-business-daily-zhixiao-build npm run performance:budget`通过：首屏 JavaScript
  `329.5KB / 400KB`，79 个异步 chunk，最大`420.8KB / 500KB`。
- `BUILD_PATH=/tmp/relation-business-daily-zhixiao-runner-build npm run build`通过。
- `BUILD_PATH=/tmp/relation-business-daily-zhixiao-runner-build npm run performance:budget`通过：首屏 JavaScript
  `329.5KB / 400KB`，79 个异步 chunk，最大`420.8KB / 500KB`。
- `npm run skill:check:yyz-dashboard-analysis`通过，权威目录与运行时镜像 checksum 均为
  `bac0f55df986f900c108d004ed3f8dd9a3471cca27af4a882f8c95c8dccb5d08`。
- 未连接生产或共享 MySQL 执行启动/接口集成测试，避免在未确认隔离库时自动建表；仍需隔离 MySQL 回归。

## Agent 中台业务日报训练与蒸馏 PRD（2026-07-30）

### 已完成

- 新增`Agent中台-业务日报训练与蒸馏PRD.md`，定义 Agent 中台“业务日报”独立菜单、列表页、详情页、
  编辑页、异步生成状态、权限和 API 设计；MVP 固定为 YYZ 项目日报并调用已发布的
  `yyz-dashboard-analysis`版本。
- 明确日报的主要目的为 Skill 训练和蒸馏：机器原稿不可覆盖，人工编辑形成版本化修订，自动保留字段级
  和段落级差异、错误类型、证据、评分和审核结果，再进入现有 AI 训练台案例候选与评测体系。
- 明确数字纠错和文字编辑分离：结论、原因和策略可直接修订；收入、成本、毛利、UV、订单等核心指标
  必须通过结构化纠错修改并重新计算派生指标，不开放任意 HTML 源码编辑。
- 明确日报删除使用可恢复软删除；来源日报删除不会级联破坏已审核案例或评测题。详情页使用鉴权接口、
  受限 iframe 和 CSP 展示持久化 HTML，打开详情不重新运行 Skill。

### 待办

- 在真实接入前先完成 `yyz-dashboard-analysis` 的`source-v2/normalized-v2`数据契约、缺失值、全量分页、
  财务事实源和质量门禁，修复实际来源数据运行旧生成器时输出全 0 的问题。
- PRD 阶段 1 已实现，后续按本文件顶部“Agent 中台业务日报 MVP”的待办推进真实执行器、数字纠错、
  评分和训练候选；联调不生成脱敏合成报告，运行条件不足时保留明确失败记录。

## 业务中台 UI 统一规范（2026-07-30）

### 已完成

- 新增 `Relation业务中台UI规范.md`，将工作台、媒体管理、人脉管理、互动记录、商机、公司研究、
  策略、需求、产品资产、主体管理、产品模版等页面纳入统一业务列表页规范。
- 明确统一页面结构、字体层级、基础色和状态色、间距尺寸、页面治理栏、轻量指标卡、筛选工具条、
  表格、Tag、按钮、移动端卡片、详情/编辑抽屉和禁止项。
- 在 `AGENTS.md` 增加长期约束：后续新增或改造同类业务页必须优先遵守该 UI 规范，不再新增零散
  页面级视觉风格。
- 商机页 `/leads` 已完成第一版视觉改造：新增可复用 `client/src/styles/businessPage.css`，商机页面接入
  统一页面治理栏、白底轻量指标卡、筛选工具条、表格密度、状态标签和移动端卡片样式；未改变接口、
  筛选语义、列顺序或新增/编辑/详情业务流程。
- 根据验收反馈，商机页继续保留统计卡区域，仅把统计卡、筛选区和表格的字号、颜色、间距、主字段
  链接色收敛到更接近媒体管理台账的克制风格。
- 根据二次验收反馈，商机页进一步向媒体管理台账风格靠拢：去掉顶部刷新按钮，统计区从大卡片压缩为
  轻摘要条，筛选区补充搜索与商机类型筛选，表格操作列改为左侧弱化 `···` 菜单，支持查看详情、
  编辑商机和删除商机；详情抽屉右上角同步使用更多菜单。
- 根据截图细化，商机页状态改为工作台同款 `Badge` 圆点加文本，不再使用带边框的状态胶囊；表格列
  标题、主标题、副描述、空值和 Tag 字号/颜色/字重继续贴近媒体管理；“互动/竞研”从“商机”列拆出为
  独立“来源”列展示。
- 工作台顶部统计卡从大渐变卡片调整为媒体管理式轻量白底卡：保留原图标并左置在标题前，数字下方
  舒展展示，激活筛选态使用浅蓝边框和轻阴影；AI 建议页顶部统计同步复用该轻量样式。
- 人脉管理列表按互动记录和媒体管理台账风格细化：姓名列改为黑色主标题、灰色职位副标题，移除突兀
  蓝色链接感；外部人才的潜力评级、转化阶段、意向程度合并为“人才状态”一列，非人才记录仅弱化显示
  `-`，避免三列大面积空白。

### 待办

- 第一批视觉改造建议继续处理策略、需求、产品资产，重点把大面积渐变统计卡、筛选条、表格密度和
  操作按钮收敛到统一风格；商机页可先由业务验收视觉方向。
- 第二批再处理工作台、媒体管理、人脉管理、互动记录、公司研究；第三批处理主体管理、产品模版。

### 验证

- 商机页关联测试命令未找到对应测试文件，未执行断言。
- `BUILD_PATH=/tmp/relation-leads-ui-build npm run build` 通过。
- `BUILD_PATH=/tmp/relation-leads-ui-build npm run performance:budget` 通过：首屏 JavaScript
  `329.8KB / 400KB`，77 个异步 chunk，最大 `420.8KB / 500KB`。
- `BUILD_PATH=/tmp/relation-leads-media-style-build npm run build` 通过。
- `BUILD_PATH=/tmp/relation-leads-media-style-build npm run performance:budget` 通过：首屏 JavaScript
  `329.8KB / 400KB`，77 个异步 chunk，最大 `420.8KB / 500KB`。
- `BUILD_PATH=/tmp/relation-leads-ledger-style-build npm run build` 通过。
- `BUILD_PATH=/tmp/relation-leads-ledger-style-build npm run performance:budget` 通过：首屏 JavaScript
  `329.8KB / 400KB`，77 个异步 chunk，最大 `420.8KB / 500KB`。
- `BUILD_PATH=/tmp/relation-leads-final-style-build npm run build` 通过。
- `BUILD_PATH=/tmp/relation-leads-final-style-build npm run performance:budget` 通过：首屏 JavaScript
  `329.8KB / 400KB`，77 个异步 chunk，最大 `420.8KB / 500KB`。
- `CI=true ./node_modules/.bin/react-scripts test --watchAll=false --runInBand --testPathPattern=Dashboard`
  通过，1 个套件、4 条测试。
- `BUILD_PATH=/tmp/relation-dashboard-light-stats-build npm run build` 通过。
- `BUILD_PATH=/tmp/relation-dashboard-light-stats-build npm run performance:budget` 通过：首屏 JavaScript
  `329.8KB / 400KB`，77 个异步 chunk，最大 `420.8KB / 500KB`。
- `BUILD_PATH=/tmp/relation-persons-ledger-style-build npm run build` 通过。
- `BUILD_PATH=/tmp/relation-persons-ledger-style-build npm run performance:budget` 通过：首屏 JavaScript
  `329.8KB / 400KB`，77 个异步 chunk，最大 `420.8KB / 500KB`；仓库内未找到人脉页专项测试文件。

## 工作台商机任务描述与通知类型枚举（2026-07-30）

### 已完成

- 商机生成/同步待跟进任务时，工作台“任务描述”改为来源记录“描述”和“结果”两行组合：
  `描述：xxx`、`结果：xxx`，空值显示 `-`；富文本输入会转为纯文本，避免 HTML 标签进入任务详情。
- 普通任务新建并指派给他人时发送 `task_assigned` 通知；商机待跟进任务新建或改派给他人时发送
  `opportunity_task_assigned` 通知；内容 @ 继续使用统一 `content_mention`。
- 通知铃铛新增“普通任务 / 商机任务”类型标签；`系统需求与权限设计PRD.md` 补充通知类型枚举、
  触发条件、接收人、自通知跳过规则和商机任务描述口径。

### 验证

- `node --check server/index.js`、`node --check server/lib/businessContactSearch.js` 通过。
- `node --test server/lib/opportunityTypeIntegration.test.js` 在外部权限下通过，2/2；覆盖商机任务描述
  和 B 收到 `opportunity_task_assigned`。
- `node --test server/lib/taskSharingIntegration.test.js` 在默认沙箱下因 `listen EPERM: operation not permitted 127.0.0.1`
  失败；外部权限重跑被安全策略拒绝，未绕行。
- `CI=true npx react-scripts test --watchAll=false --runInBand src/components/DocumentBodyEditor.test.js` 通过，26/26；
  仅有既有 React `act(...)` 警告。
- `BUILD_PATH=/tmp/relation-task-notification-build npm run build` 通过。
- `BUILD_PATH=/tmp/relation-task-notification-build npm run performance:frontend` 通过：首屏 JavaScript
  `329.8KB / 400KB`，77 个异步 chunk，最大 `420.8KB / 500KB`。

## 互动来源商机叙述字段统一富文本（2026-07-30）

### 已完成

- 商机统一新增/编辑弹窗中，互动来源的“商机说明 / 跟进结果 / 描述 / 结果 / 下一步行动”全部复用
  `RichTextEditor`；竞研来源继续维持现有普通文本口径，避免改变其既有数据格式。
- 互动记录主页面，以及人脉、客户、人才详情复用的 `InteractionForm` 同步使用相同五个富文本字段；
  存量纯文本无需迁移即可继续编辑。
- 互动列表和移动摘要统一通过 `richTextToPlain` 去除标签，互动与商机详情统一使用 `RichTextView`
  白名单渲染，避免富文本 HTML 源码直接暴露给用户。
- 服务端新增统一富文本转纯文本逻辑；下一步行动生成提前 3 天提醒时仅使用纯文本标题和备注，
  `<p><br></p>` 等语义空内容不再创建空提醒，搜索仍可命中富文本中的可见文字。

### 验证

- `node --check server/index.js`、`node --test server/lib/businessContactSearch.test.js` 通过；服务端全量中
  129 条单元测试通过，受沙箱回环监听限制的 11 条集成测试改在允许监听的隔离环境重跑并全部通过。
- `Interactions.test.js` 8/8 通过，新增覆盖五个叙述字段同时使用富文本编辑器；前端全量 44 个套件、
  269 条测试全部通过，在线表格底栏专项 32/32 通过。
- 隔离生产构建 `/tmp/relation-interaction-richtext-build` 成功；性能门禁通过，首屏 JavaScript gzip
  `329.8KB / 400KB`，77 个异步 chunk，最大 `420.8KB / 500KB`。
- 真实页面检查覆盖默认桌面视口与 `390x844`：五个字段均显示同一套富文本工具栏；窄屏弹窗宽度
  `390px`、编辑器宽度 `342px`，页面横向溢出为 `0`。视觉检查使用的临时本地身份入口已删除，
  `AuthContext.js` 与基线无差异，未调用写接口或改动业务数据。

## 在线表格石墨式底部 Sheet 栏（2026-07-29）

### 已完成

- 底部 Sheet 区统一为 `44px` 浅灰工具带，消除非紧凑场景被撑高的问题；活动 Sheet 改为 `38px`
  白底灰色描边标签，非活动标签采用平面文字与竖向分隔线，不再使用蓝色下划线主色态。
- 左侧新增工作表列表入口并保留新增按钮，活动标签下拉和右键菜单继续支持重命名、移动、删除；右侧
  补齐普通视图、全屏、缩小、百分比选择和放大控件，原选区统计和清除筛选能力保持不变。
- 响应式按可用宽度逐级隐藏视图、选区统计和全屏，Sheet 标签在自身区域横向滚动；缩放与核心 Sheet
  操作始终可用，底栏不换行、不增高，也不制造页面级横向滚动。

### 验证

- `SpreadsheetDocumentEditor.test.js` 32 条全部通过，新增覆盖底栏控件、Sheet 列表切换、全屏调用和
  `75% / 100% / 125% / 150%` 缩放步进；前端全量 44 个套件、267 条测试全部通过。
- 本地真实渲染覆盖 `1440x800`、`1920x800` 和 `390x844`：三种视口底栏均为 `44px`，活动标签
  均为 `38px`，页面横向溢出为 `0`；手机宽度下 Sheet 标签独立滚动，视图和全屏按规则收起，无控件
  重叠或 runtime overlay。临时可视入口已删除，不进入正式代码。
- 隔离生产构建 `/tmp/relation-spreadsheet-footer-build` 成功；性能门禁通过，首屏 JavaScript gzip
  `329.7KB / 400KB`，77 个异步 chunk，最大 `420.8KB / 500KB`。

## 在线表格连续选区、整行排序与底栏统计（2026-07-29）

### 已完成

- 连续多格选区改为石墨式单一蓝色外框：活动格保持原始背景，不再叠加独立粗框；其他选中格统一
  浅蓝底色，范围右下角显示填充柄，普通矩形与整行整列继续复用同一选区模型。
- 选择单列或点击列头执行升降序时，选中列只作为排序键，实际排序范围自动扩展到当前 Sheet 已用
  数据区全部列；日期、名称和其他字段按整行一起移动，标题、空白尾部、公式、样式和撤销事务保留。
- Sheet 底栏新增选区统计，默认展示总和，点击可查看并切换平均、最大、最小、计数和数值计数；公式
  使用当前计算结果，整行整列范围只遍历稀疏非空单元格，切换指标不触发工作簿保存或历史。

### 验证

- 在线表格目标测试 4 个套件、71 条全部通过，覆盖整列排序时关联日期/备注联动、连续选区活动格/
  浅蓝填充/外框填充柄、六项统计和主指标切换；前端全量 44 个套件、266 条全部通过。
- 隔离生产构建 `/tmp/relation-spreadsheet-selection-summary-build-final` 成功；性能门禁通过，首屏 JavaScript
  gzip `328.0KB / 400KB`，75 个异步 chunk，最大 `420.8KB / 500KB`。
- 本地真实渲染在 `1280x800` 验证三格总和 `12,357`、平均 `4,119` 等六项；B 列升序后日期和备注
  按整行同步。`390x844` 下统计与缩放控件间保留 `4px`，统计弹层完整位于视口内；两种宽度均无
  横向溢出或 runtime overlay，临时测试入口已删除。

## 在线表格编辑、公式、右键菜单与数据治理三批增强（2026-07-29）

### 已完成

- 批次 A：填充色、粗体、斜体等格式操作已进入工作簿撤销/重做；升降序共用稳定排序，空白在两个
  方向都位于有效数据之后；公式栏保留原始公式，同 Sheet 单格/区域引用显示彩色虚线框；修复字符串
  `"-"` 被误识别为一元负号的问题，并将 `TODAY/NOW` 统一为 `Asia/Shanghai`。
- 批次 B：网格右键菜单新增剪切、复制、粘贴、插入复制单元格、清除、插入/删除单元格及行列、
  升降序/自定义排序、合并、数字格式等入口；菜单在桌面和手机宽度下做视口碰撞处理。结构化剪贴板
  保留值、公式、样式、合并、条件格式和数据验证，并兼容 HTML/TSV 及石墨类 `data-formula`；锁定
  规则不随复制扩散，公式引用在粘贴时相对迁移。
- 批次 C：工作簿新增 `protectedRanges`、`conditionalFormats`、`dataValidations` 三类持久化规则；
  已提供锁定成员、条件格式和数据验证弹窗，列表验证支持单元格下拉。直接输入、公式栏、粘贴和清空
  复用验证链路，锁定范围会阻止输入、格式、排序、调宽高及结构修改。
- 服务端 operation API 和整本保存均校验规则结构、锁定权限和拒绝型数据验证；越权或无效输入返回
  明确错误码，整批在写库和历史记录前原子拒绝。文档外壳向表格组件传入当前用户、可授权成员和管理
  权限，`readonly/guest` 继续保持只读。
- 两份在线表格 PRD 已补充本轮交付顺序、公式矩阵、右键菜单语义、数据模型、权限、保存和验收口径。

### 验证

- 前端全量测试通过：44 个套件、263 条测试；在线表格目标测试 68 条通过。
- 新增服务端在线表格测试 20 条通过；后端全量非监听测试通过。10 个既有 HTTP 测试因当前沙箱禁止
  绑定 `127.0.0.1` 返回 `EPERM`，不是业务断言失败。
- 隔离生产构建成功；性能门禁通过：首屏 JavaScript gzip `328.0KB / 400KB`，最大异步 chunk
  `420.8KB / 500KB`。`node --check` 与 `git diff --check` 通过。
- 本地可视回归覆盖 `1280x800` 和 `390x844`：公式原文与引用框、锁定/条件格式标识、完整右键菜单、
  条件格式和数据验证弹窗均可见；窄屏菜单自动收进视口，弹窗左右各保留 `8px`，无横向溢出或
  runtime overlay。临时可视测试入口已删除，不进入正式代码。

### 环境说明

- 隔离 MySQL 权限集成测试已补断言，但本机没有可用测试库凭据，按仓库门禁保持跳过；尝试启动本地
  后端时默认 MySQL `root` 无密码被拒绝，未连接或修改任何业务库。后续有隔离实例凭据时再运行
  `RELATION_RUN_MYSQL_TESTS=1 node --test server/lib/spreadsheetDocumentPermissionsIntegration.test.js`。

## 在线表格石墨式格式刷（2026-07-29）

### 已完成

- 原生在线表格工具栏新增格式刷图标：单击进入单次模式，完成一个目标选区后自动退出；双击进入连续
  模式，可依次应用多个目标，再次点击或按 `Esc` 退出。激活态显示灰蓝底色，网格光标切换为复制态。
- 格式刷只复制单元格完整基础 `style`，不改变值、公式、合并关系、行高或列宽；来源多格按二维样式
  图案平铺，来源默认格式会清除目标旧格式。单格、拖拽区域、整行和整列目标复用统一选区链路。
- 每次目标应用进入现有工作簿撤销/重做、自动保存、operation 和页面历史；只读入口禁用。

### 验证

- 格式模型与原生表格组件目标测试通过，2 个套件、41 条测试全部成功；覆盖样式二维平铺、默认格式
  清除、值/公式保持、单次自动退出、连续多目标、`Esc` 退出、撤销和只读禁用。
- 前端全量测试通过，43 个套件、245 条测试全部成功；仅有既有 Ant Design 弃用、`findDOMNode` 和
  React `act(...)` 警告。
- 隔离生产构建 `/tmp/relation-spreadsheet-format-painter-build` 成功；前端性能门禁通过，首屏 JavaScript
  gzip `329.7KB / 400KB`，77 个异步 chunk，最大 `420.8KB / 500KB`。
- 使用本地假在线表格完成真实页面回归：桌面、`900x700` 窄屏和 `390x844` 移动宽度下入口可见且
  无重叠；单次模式应用后退出，连续模式可应用多个目标并由 `Esc` 退出，目标内容和公式保持不变，
  页面无新增未捕获运行时错误。

## 在线表格整行整列选择与组合冻结（2026-07-29）

### 已完成

- 点击行号选择当前 Sheet 整行，点击列字母选择整列；对应表头与可见单元格显示连续浅蓝背景和蓝色
  边界，其他方向的活动表头不再误高亮。
- 整行整列选择复用现有范围模型，可继续用于复制、清空、格式和 presence；选择本身不修改工作簿，
  行高列宽拖动手柄不会误触发选择。
- “冻结至当前行”和“冻结至当前列”改为只更新对应维度并保留另一维，支持先冻结第一行、再冻结
  第一列后同时生效；“冻结至当前行和列”快捷项继续保留。

### 验证

- 在线表格组件目标测试通过，20/20；覆盖整行整列范围、表头/单元格选中态、拖动手柄隔离、选择不
  触发工作簿保存，以及行列顺序组合冻结、撤销重做和快捷同时冻结。
- 前端全量测试通过，43 个套件、239 条测试全部成功；仅有既有 Ant Design / React 测试警告。
- 隔离生产构建 `/tmp/relation-spreadsheet-row-column-select-build` 成功；性能门禁通过：首屏 JavaScript
  `329.7KB / 400KB`，77 个异步 chunk，最大 `420.8KB / 500KB`。
- 生产构建配合本地只读假数据在 `1280x720` 完成视觉回归：点击行号 1 后 13 个可见单元格全部选中，
  点击列头 A 后 22 个可见单元格全部选中，表头为 `#dbeafe`、单元格为 `#eaf3ff` 并显示连续蓝色
  边界，页面横向溢出为 0。
- 先冻结第一行、再冻结第一列后，保存回读为 `frozen={rows:1,columns:1}`；网格滚动到
  `scrollTop=500 / scrollLeft=700` 后 A1、行号 1 和列头 A 的屏幕坐标均保持不变，页面无新增
  runtime error 或控制台错误。

## 在线表格滚动收起与专注模式（2026-07-29）

### 已完成

- 桌面非嵌入在线表格在网格纵向滚动后自动回收多文档标签与 `44px` 标题治理栏，回到顶部自动展开；
  对短内容设置最小滚动范围，避免高度回收后滚动条消失造成布局反复抖动。
- 工具栏最右侧新增固定的石墨式上下箭头；开启专注模式时额外隐藏菜单栏，工具栏直接承接全局页面
  标签，公式栏、网格和 Sheet 栏继续保留。箭头独立于横向滚动工具区，只读用户同样可切换视图。
- 移动端、嵌入式文档和普通文档不应用该布局；默认关闭的 Univer 预览路径保持原样。

### 验证

- 布局状态工具和原生在线表格组件目标测试通过，2 个套件、22 条测试全部成功；仅有既有 Ant Design
  `findDOMNode` 弃用警告。
- 前端全量测试通过，42 个套件、236 条测试全部成功；隔离生产构建
  `/tmp/relation-spreadsheet-focus-build` 成功。
- 前端性能门禁通过：首屏 JavaScript `329.7KB / 400KB`，77 个异步 chunk，最大
  `420.8KB / 500KB`。
- 本地只读假数据视觉回归通过：`1440x900` 网格滚动后文档标签和标题治理栏共回收 `82px`，专注模式
  再回收 `32px` 菜单栏，工具栏顶部从 `182px` 上移到全局页面标签下方的 `68px`；回到网格顶部后
  自动恢复完整布局。`1024x700` 下箭头保持固定在工具栏最右侧且无横向溢出。
- `390x844` 移动端继续使用原布局，不显示专注箭头，表格限制在视口内且无横向溢出；视觉回归期间
  无新增浏览器控制台错误或警告。

## 在线表格石墨式冻结菜单（2026-07-29）

### 已完成

- 复用现有 Sheet `frozen`、虚拟滚动、operation、历史和撤销底座，将工具栏单击切换按钮升级为
  “网格图标 + 下拉箭头”的石墨式冻结菜单。
- 菜单随活动单元格动态显示“冻结至当前行（N 行）”、“冻结至当前列（N 列）”、“冻结至当前行和列
  （N 行 | N 列）”和“取消冻结”；菜单栏“查看”入口同步复用同一口径。
- 单独冻结行或列只更新对应维度并保留另一维，可先后操作组合冻结；无冻结时取消项禁用，只读用户
  的冻结触发器禁用。
- 冻结上限继续保持前 100 行、50 列，超限提示、自动保存、页面历史、operation 与撤销重做沿用
  既有链路。

### 验证

- `CI=true npx react-scripts test --watchAll=false --runInBand src/components/SpreadsheetDocumentEditor.test.js`
  通过，18/18；新增回归覆盖 E5 动态菜单文案、行/列/行列三种预设、取消冻结、撤销重做和只读禁用。
- 前端全量测试通过，41 个套件、232 条测试全部成功；仅有既有 Ant Design / React 测试警告。
- 隔离生产构建 `/tmp/relation-spreadsheet-freeze-build` 成功；性能门禁通过：首屏 JavaScript
  `329.7KB / 400KB`，77 个异步 chunk，最大 `420.8KB / 500KB`。
- 生产构建配合本地只读假数据在 `1280x720` 完成视觉回归：冻结菜单宽约 `236px`、高约 `161px`，
  完整落在视口内且页面无横向溢出；选择 E5 同时冻结 5 行、5 列后，将网格滚动到
  `scrollTop=500 / scrollLeft=700`，E5 屏幕坐标保持不变，顶部 1-5 行和左侧 A-E 列持续可见。

## 在线表格桌面全高紧凑布局（2026-07-29）

### 已完成

- 桌面非嵌入在线表格从普通文档卡片壳切换为全高工作区，回收 `Content` 的 `20px` 内边距；普通文档、
  嵌入式文档与移动端继续使用原布局。
- 多文档 Tab 压缩为 `38px`；原标签组、创建人行和 `30px` 大标题合并为 `44px` 治理栏，保留可编辑
  标题、自动保存状态、文件夹路径、页面、分享、改动历史和收藏。
- 原生表格增加 `fillAvailableHeight/frameless` 模式，取消卡片边框与焦点外框；菜单栏、工具栏、公式栏
  分别收敛到约 `32px/34px/29px`，名称框收窄到 `74px`。
- 该阶段 Sheet 区先固定为 `34px` 并使用底部强调线；现行样式已在 2026-07-29 后续任务升级为上文
  `44px` 石墨式工具带和白底描边活动标签。Ant Spin 高度链已修正，网格仍是唯一纵向伸缩/滚动区域，
  不会再按工作表总行数撑高页面；Univer 预览壳同步支持满高模式。

### 验证

- 在线表格目标测试通过，2 个套件、34 条测试；前端全量 41 个套件、231 条全部通过，仅有既有 AntD
  弃用和 React `act(...)` 警告。
- 隔离生产构建 `/tmp/relation-spreadsheet-layout-build` 成功；性能门禁通过：首屏 JavaScript
  `329.5KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。
- 生产构建配合本地只读假数据完成视觉回归：`1440x900` 网格顶部 `246px`、约 30 行可见；
  `1920x1080` 约 37 行可见；`1280x720` 短屏约 22 行可见。三种桌面尺寸 Sheet 栏均贴底可见、
  标题与操作不重叠、无横向溢出。
- `390x844` 继续走移动布局，紧凑桌面模式未串入，表格宽度限制在视口内且 Sheet 栏可见；页面无新增
  runtime error 或控制台警告。

## 产品提版失败展示与 minidev 自动安装（2026-07-29）

### 已完成

- 提版进度弹窗失败态去掉重复的任务详情和“失败原因”卡片，仅保留顶部失败摘要与脚本运行日志区域。
- 点击“确认提版”创建任务成功后，只关闭参数弹窗并展示提版进度弹窗，不再自动打开产品资产详情抽屉。
- 顶部失败摘要固定高度滚动展示，避免异常堆栈或构建输出过长时撑高整个弹窗。
- 脚本执行失败时会清洗 ANSI 颜色码，并优先提炼缺依赖、命令缺失、权限、git/npm/minidev 等具体原因；
  例如 `cannot resolve module 'crypto-js'` 会展示为缺少 `crypto-js` 依赖。
- `utils/upload.js` 在未检测到可用 `minidev.upload` 接口时，会自动执行
  `npm install --no-save --package-lock=false --no-audit --no-fund minidev` 安装依赖后继续上传。
- 测试 `offer-wall/newsWall` 时发现模版已声明 `crypto-js`，但临时项目复制时会排除 `node_modules`，
  原脚本又未安装项目依赖，导致 minidev 构建报 `cannot resolve module 'crypto-js'`；已修复为临时项目
  上传前如存在 `package.json` 自动执行 `npm install --no-audit --no-fund --legacy-peer-deps`。
- 自动安装支持 `MINIDEV_AUTO_INSTALL=0` 禁用，支持 `MINIDEV_INSTALL_CWD`、`MINIDEV_PACKAGE`、
  `MINIDEV_MODULE` 和 `NPM_BIN` 覆盖安装目录、包名、模块名和 npm 命令。
- 临时项目依赖安装支持 `UPLOAD_SKIP_NPM_INSTALL=1` 跳过，便于服务器已预置依赖或排障时使用。
- 同步更新 `client/src/utils/upload.js` 镜像，避免两份上传脚本逻辑漂移。
- 新增产品资产页面回归测试：确认提版创建任务成功后只展示执行进度弹窗，不再自动请求并弹出产品资产详情。
- 提版任务轮询到成功、失败或取消终态后，会自动刷新产品资产列表，确保最近提版模版/提版状态等字段及时更新。

### 验证

- `CI=true npx react-scripts test --watchAll=false --runInBand src/pages/ProductAssets.test.js` 通过，覆盖确认提版后不弹产品详情、
  提版完成后自动刷新产品资产列表。
- `node --check utils/upload.js`、`node --check client/src/utils/upload.js`、`node --check server/index.js`
  通过。
- `node --test server/lib/productTemplateRelease.test.js` 通过，12/12，包含 minidev 自动安装、临时项目依赖安装和
  脚本失败原因提炼回归。
- `node --test server/lib/productReleaseDomainIntegration.test.js` 通过，覆盖产品资产提版成功链路，以及 fake
  `upload.js` 返回 `cannot resolve module 'crypto-js'` 时任务 API 的失败原因提炼。
- `CI=true npx react-scripts test --watchAll=false --runInBand` 通过，41 个套件、229 条测试全部成功；
  仅有既有 Ant Design 弃用和 React `act(...)` 警告。
- `BUILD_PATH=/tmp/relation-build npm run build` 隔离生产构建成功。
- 真实外联上传测试未执行：该操作会通过 git/npm/minidev 与外部服务交互并可能传递本地代码与提版参数，
  本轮仅执行隔离安全链路测试和本地 fake npm/minidev 回归。

## 产品模版与提版功能合并 main（2026-07-29）

### 已完成

- 产品模版、模版版本、提版任务、提版记录表及主体域名/身份密钥文件能力已合并到最新 `main`。
- 产品资产页面支持模版筛选、提版参数确认、按关联主体读取 API/埋点/CDN/短剧域名和身份密钥文件。
- 普通模版仅要求 API、埋点、CDN 三类域名；`template_type=short_drama` 的短剧模版额外要求短剧域名。
- 提版校验通过后调用仓库 `utils/upload.js`；脚本负责拉取 `zfb-mini-tools` 到 `CODE_TEMPLATES_DIR`
  默认 `/app/codeTemplates`，并接收主体域名、模版标识、AppID 和身份密钥文件路径。
- 点击提版创建任务后展示执行进度弹窗，包含步骤条、当前步骤、任务 ID、AppID、执行次数、失败原因
  和脚本运行日志；后端将 `upload.js` stdout/stderr 流式追加到任务日志并继续脱敏。
- 合并时保留最新 `main` 的产品资产写权限控制：新增、导入、编辑、删除和提版入口仅对
  `product_assets` 可写用户展示；服务端接口继续有独立写权限校验。

### 验证

- 合并 `main` 时补回产品资产数据范围函数 `applyProductAssetVisibility`，避免提版任务创建时
  `getVisibleProductAsset` 抛出 500。
- `node --check server/index.js` 通过。
- `node --check server/lib/productTemplateRelease.js`、`node --check utils/upload.js`、
  `node --check client/src/utils/upload.js` 通过。
- `node --test server/lib/productTemplateRelease.test.js` 通过，9/9。
- `node --test server/lib/productReleaseDomainIntegration.test.js` 通过，1/1。
- 带临时 AES/HMAC key 执行 `node --test server/lib/*.test.js` 通过，128 条中 124 passed、4 skipped。
- `CI=true npx react-scripts test --watchAll=false --runInBand` 通过，40 个套件、227 条测试全部成功；
  仅有既有 Ant Design 弃用和 React `act(...)` 警告。
- `BUILD_PATH=/tmp/relation-build npm run build` 隔离生产构建成功。
- `git diff --check` 通过。

## 在线表格原生基础版一期实现（2026-07-29）

### 已完成

- 线上文档 `https://relation.midongtech.com/documents?doc=480` 复现到“单击单元格后直接键盘输入无效”：
  真实 printable key 只触发网格 `keydown`，旧逻辑只处理删除、方向键、Enter/Tab 和撤销重做，没有把
  普通字符转成单元格编辑。
- 已修复：可编辑状态下，普通字符键会覆盖当前选中单元格、进入单元格编辑态，并继续复用同一次
  输入事务；输入框、公式栏、组合输入和快捷键仍按原逻辑处理。
- 新增独立 PRD：`文档中心-在线表格原生基础版PRD.md`，明确近期在线表格从 Univer 验证路线调整为
  原生自研基础版路线。
- PRD 按用户截图中的范围拆解一期能力：基础录入、复制粘贴、行列增删、简单公式和常用函数、
  排序、普通筛选、冻结、合并、基础格式、Excel 简单导入导出，以及 Relation 权限、历史、协作结合。
- 用户已确认：本期保留 Univer 依赖和线上预览开关但默认关闭；原生基础版 UI 仍要求像素级对齐
  石墨表格工作区；常用函数增加 `VLOOKUP`、`XLOOKUP`、`SUMIF`、`COUNTIF`；移动端只做查看和
  轻量编辑；`.xlsm` 只保留公式和值及可解析基础样式，不处理宏。
- 明确一期不做完整 Excel 函数全集、数据透视表、图表、条件格式、复杂条件筛选、附件/图片浮动对象
  和 VBA 宏处理。
- 原生 `SpreadsheetDocumentEditor` 对齐石墨类表格工作区密度：默认行高 `24px`、列宽 `96px`、
  列头高 `24px`、行号宽 `46px`、默认字号 `13px`，弱化 Ant Design 卡片感并保持表格软件工具栏。
- 工具栏补齐基础格式能力：字体、字号、加粗、斜体、下划线、文字颜色、填充色、水平/垂直对齐、
  自动换行和基础边框；单元格渲染同步应用这些样式。
- 常用公式菜单补齐 `MAX`、`MIN`、`SUMIF`、`COUNTIF`、`VLOOKUP`、`XLOOKUP`；公式引擎新增文本、
  逻辑、条件聚合和查找函数，公式原文继续保留，不使用 `eval`。
- 正式在线表格默认继续走原生编辑器；Univer 预览入口保留本地开关，但改为外部 loader
  `window.__RELATION_LOAD_UNIVER_SPREADSHEET__`，避免常规生产构建把 Univer 大 chunk 打入包体。

### 验证

- `CI=true npx react-scripts test --watchAll=false --runInBand src/utils/spreadsheetWorkbook.test.js src/components/SpreadsheetDocumentEditor.test.js`
  通过，2 个套件、32 条测试全部成功。
- printable key 输入修复新增回归：单击选中单元格后按普通字符键会立即写入当前单元格并进入编辑态；
  `src/components/SpreadsheetDocumentEditor.test.js` 16/16 通过。
- 隔离生产构建 `/tmp/relation-native-spreadsheet-build` 成功；构建输出未出现 Univer 大 chunk。
- 前端性能预算通过：首屏 JavaScript `329.5KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。

### 注意

- 当前 UI 已按石墨密度和基础控件方向收敛，但像素级验收仍需补石墨截图基线和 Playwright
  截图/像素检查，覆盖工具栏高度、公式栏高度、网格线、选区、Sheet 标签和移动宽度。
- Univer 预览保留但默认不可用；如需再次验证 Univer，需要由单独预览包或线上脚本注册
  `window.__RELATION_LOAD_UNIVER_SPREADSHEET__`。

## 全局侧栏收起宽度优化（2026-07-29）

### 已完成

- 桌面端全局侧栏收起宽度由 `64px` 缩小为 `52px`，展开态继续保持 `180px`，为模块正文额外释放
  `12px` 横向空间。
- `32px` 折叠按钮和菜单图标点击热区保持不变；侧栏宽度、右侧正文偏移和测试统一读取共享常量，
  避免视觉宽度与内容留白不一致。移动端菜单抽屉不受影响。

### 验证

- 布局工具与共享按钮目标测试 5/5 通过；前端全量测试 41 个套件、227 条全部通过，仅有既有 Ant
  Design 弃用和 React `act(...)` 警告。
- 隔离生产构建 `/tmp/relation-compact-sidebar-build` 成功；性能门禁通过：首屏 JavaScript
  `329.5KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。
- `1024x500` 视口实测收起侧栏与正文左偏移均为 `52px`，图标和 `32px` 底部按钮均在轨道中央；
  页面滚动到 `scrollY=900` 后侧栏仍保持 `top=0 / bottom=500 / height=500`。展开后侧栏与正文偏移
  恢复为 `180px`，页面无横向溢出。
- `390x844` 移动视口继续不渲染桌面侧栏，内容区 `left=0 / width=390`，Header 菜单入口保留。

## 在线表格 Univer 线上预览开关（2026-07-29）

### 已完成

- 文档中心在线表格入口新增显式预览开关：访问 `/documents?doc=<文档ID>&univer_spreadsheet=1`
  后，当前浏览器写入 `localStorage.relation_univer_spreadsheet_preview=1`，后续在线表格走 Univer
  预览编辑器；访问 `univer_spreadsheet=0` 会移除本地开关并恢复旧编辑器。
- 默认不开启，未设置本地开关的线上用户继续使用旧 `SpreadsheetDocumentEditor`。
- Univer 预览组件使用动态加载，并由错误边界和 Suspense fallback 包裹；加载失败或运行时报错时
  回落旧编辑器，避免单个预览故障阻断文档页。

### 注意

- 该开关用于线上小范围手动验证，不是正式放量。因为 `Documents.js` 存在 Univer 动态 import，
  生产构建会包含 Univer 异步 chunk，性能门禁可能继续报最大异步 chunk 超预算。
- 真实验证仍需覆盖输入、自动保存、刷新回读、排序、筛选、冻结、Excel 导入导出和只读写入拒绝；
  验证前建议先复制一个非关键在线表格文档。

## 全局侧栏长页面滚动固定（2026-07-29）

### 根因与修复

- 全局侧栏原使用 `position: sticky`，外层布局的 `overflow` 使浏览器将其绑定到非实际滚动容器；正文
  很长并下滑时，整条侧栏会随页面上移，底部折叠按钮因此停在屏幕中部。
- 桌面侧栏改为视口固定定位，通过 `top: 0 / bottom: 0` 始终铺满可视高度；右侧内容区按当前展开或
  收起宽度同步增加左偏移，避免固定定位后覆盖正文。移动端菜单抽屉保持不变。
- 新增布局工具回归测试，覆盖固定定位、`64px/180px` 内容偏移及移动端零偏移。

### 验证

- 布局工具与共享按钮目标测试 5/5 通过；前端全量测试 41 个套件、227 条全部通过，仅有既有 Ant
  Design 弃用和 React `act(...)` 警告。
- 隔离生产构建 `/tmp/relation-fixed-sidebar-build` 成功；性能门禁通过：首屏 JavaScript
  `329.5KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。
- 本地 mock API 下以 `1024x500` 长页面滚动回归：`scrollY` 从 0 变为 900 后，展开侧栏仍保持
  `top=0 / bottom=500 / height=500 / width=180`，底部按钮保持在 `451-500px`；收起后侧栏仍铺满
  视口且宽度为 `64px`，右侧内容同步由 `left=180` 变为 `left=64`，页面无横向溢出。
- `390x844` 移动视口继续不渲染桌面侧栏，Header 菜单入口保留，内容区 `left=0 / width=390`，
  无横向溢出；视觉回归未发现侧栏、按钮或正文重叠，页面仅有既有 Ant Design 弃用警告。

## 互动记录移动端卡片与商机列优化（2026-07-29）

### 已完成

- 移动端互动记录改为 8px 圆角的紧凑信息卡：姓名、日期和 `···` 置顶，公司为空时不再显示 `-`；
  圈子、互动类型和“信息·重要程度”分组展示，城市、创建人和人脉权重合并为轻量元信息。
- 人脉权重 `high/medium/low` 在列表与详情统一映射为“高/中/低”，不再暴露英文枚举；描述、结果和
  下次跟进改为最多两行的标签化摘要。
- 整张移动卡片可点击并支持 Enter/空格键打开详情；卡片关闭文字选择和 Android 长按搜索行为，
  详情正文仍可正常选择复制。
- 移动卡片移除直出的编辑、删除按钮，`···` 打开底部“编辑记录 / 删除记录 / 取消”操作面板；删除
  保留二次确认，操作事件不再误触详情。详情弹窗同步提供同一 `···` 操作入口。
- PC 端原“商机”混排列拆为“商机标题 / 商机状态 / 商机类型”，标题使用单行省略和 Tooltip，状态、
  类型使用不换行标签，避免长标题把列表行撑高。

### 验证

- `CI=true npx react-scripts test --watchAll=false --runInBand src/pages/Interactions.test.js` 通过，6/6；覆盖
  移动卡片层级、中文权重、空公司、筛选、整卡/键盘详情、`···` 事件隔离、删除确认及 PC 商机三列。
- 前端全量测试通过，40 个套件、223 条测试全部成功；仅有既有 Ant Design 弃用和 React `act(...)`
  警告。隔离生产构建 `/tmp/relation-interaction-card-build` 成功。
- 前端性能门禁通过：首屏 JavaScript `329.4KB / 400KB`，76 个异步 chunk，最大
  `420.8KB / 500KB`。
- 生产构建配合 `/tmp` 只读假数据代理在 390x844、430x932、1280x800、1440x900 视口完成回归：
  手机端页面宽度与视口一致，无横向溢出；空公司不占位，卡片 `user-select=none`，详情正文保持可选；
  操作面板贴底且在详情上层。桌面商机标题、状态、类型连续三列，标题和标签均不换行，数据行高 44px；
  页面无新增运行时错误。临时代理未写数据库且未进入 Git。

## 出差协同手机端日程适配（2026-07-29）

### 已完成

- 手机端不再渲染桌面的多日期双向网格，默认使用单日纵向议程，按上午、中午、下午、晚上展示；
  空时段压缩显示，有日程时卡片使用完整手机宽度。
- 增加前一天、后一天按钮和原生横向惯性日期条，日期按钮同步展示周几和当日日程数量；今天位于
  行程范围内时默认选中今天，否则选中行程第一天。
- 增加“按日 / 全部”分段切换；全部模式按日期和时段纵向展示所有非空日程，避免持续横向滑动。
- 日程正文只保留原生纵向滚动，日期条独立横向滚动，从时段标题和内容区域起滑不再与嵌套双向网格
  争抢手势；桌面端日期行、时段列双向冻结网格保持不变。

### 验证

- `CI=true npx react-scripts test --watchAll=false --runInBand src/pages/TripCollaboration.test.js` 通过，5/5；
  覆盖桌面冻结网格、既有侧栏折叠边界、手机端单日日期切换及全部纵向总览。
- 前端全量测试通过，40 个套件、217 条测试全部通过；仅有既有 React `act(...)` 和 Ant Design
  弃用警告。
- 隔离生产构建 `/tmp/relation-trip-mobile-build` 成功；前端性能门禁通过：首屏 JavaScript
  `329.4KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。
- 生产构建配合临时只读 mock API 在 390x844、430x932 视口验证通过：手机端不生成桌面网格，
  按日模式日期切换准确，全部模式只渲染 3 个有日程日期和 5 个非空时段；页面宽度严格等于视口，
  无横向溢出。从时段区域纵向滑动后 `scrollY` 从 `238.5` 变为 `442.5`、`scrollX` 保持 `0`，
  控制台无错误。

## 全局与模块侧栏折叠交互统一（2026-07-29）

### 已完成

- 桌面端全局菜单折叠按钮从顶部 Header 移到全局侧栏底部；菜单内容独立滚动，按钮在短视口仍固定
  可见。移动端继续使用 Header 菜单入口和抽屉导航。
- 新增共享 `SidebarToggleButton`，统一展开/收起图标、Tooltip、可访问名称和稳定尺寸。
- 文档中心、出差协同和 AI 训练台的模块侧栏折叠按钮均移入主内容顶部；折叠后原侧栏、边框、内边距
  及栏间距完全归零，不再残留只放折叠图标的窄栏。
- AI 训练台仅在 `xl` 并排布局开放会话侧栏折叠，窄屏上下布局始终展示会话列表；出差协同移动端也
  忽略桌面折叠状态，保持原列表流程。

### 验证

- 共享按钮、出差协同和 AI 训练台目标测试 6/6 通过，覆盖桌面展开/折叠、零宽侧栏及窄屏回退。
- 前端全量测试 40 个套件、216 条全部通过；仅有既有 Ant Design 弃用和 React `act(...)` 警告。
- 隔离生产构建 `/tmp/relation-sidebar-toggle-build` 成功；性能门禁通过：首屏 JavaScript
  `329.4KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。
- 使用本地 mock API 在 `1440x900`、`1280x600`、`1024x768`、`390x844` 视口完成视觉回归：文档
  和出差侧栏折叠后的实际宽度、边框、内边距及父级间距均为零；AI 折叠后只保留 `17/24 + 7/24`
  两列；窄屏和移动端列表保持可见。各视口均无横向溢出、标题/操作重叠，短屏全局底部按钮保持可见。

## 互动记录移动端创建人及筛选（2026-07-29）

### 已完成

- 移动端互动卡片在城市信息旁展示创建人，优先使用接口返回的 `created_by_name`，并兼容本地用户列表
  回退；存量互动无需迁移。
- 移动端筛选改为与人脉管理一致的“筛选”按钮和全屏抽屉，不再把全部控件直接铺在列表上方。
- 搜索关键词和城市使用受控草稿；点击“完成”统一应用两个输入并刷新列表，“重置”清空全部筛选条件。
- 桌面端筛选布局和现有服务端筛选参数保持不变。

### 验证

- `CI=true npx react-scripts test --watchAll=false --runInBand src/pages/Interactions.test.js` 通过，1/1；
  覆盖移动卡片创建人、筛选抽屉和“完成”提交关键词/城市参数。
- 前端全量测试通过，38 个套件、211 条测试全部通过；仅有既有 React `act(...)` 警告。
- 隔离生产构建 `/tmp/relation-interactions-mobile-build` 成功；前端性能门禁通过：首屏 JavaScript
  `328.9KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。
- 390x844 移动视口配合临时只读 mock API 验证通过：列表顶部仅显示“添加记录 / 筛选”，卡片显示
  `创建人：张学成`；抽屉宽高完整覆盖视口且无横向溢出，应用关键词和城市后请求携带
  `search=小蚕&city=杭州`，重置后恢复无筛选请求。未发现新增运行时异常，仅有既有 Ant Design
  `Dropdown overlay` 弃用警告。

## 人脉与互动公司列及搜索（2026-07-29）

### 已完成

- 人脉管理前五列固定为“姓名 / 公司 / 创建人 / 城市 / 圈子”；公司优先显示 `company`，为空时回退
  `current_company`，存量数据无需迁移。
- 互动记录前四列固定为“姓名 / 公司 / 创建人 / 圈子”；创建人由互动接口关联用户一次返回，移动端
  卡片和互动详情沿用原有信息层级。
- 互动筛选区新增统一关键字搜索，服务端在可见性过滤和字段解密后匹配姓名、公司、描述、结果、
  跟进事项、礼物和商机标题，不新增逐行数据库查询。
- 人脉接口统一返回 `company_name`，并保持原有姓名、公司、手机、标签、技能和关键成事特质搜索语义。

### 验证

- `node --check server/index.js` 通过。
- `node --test server/lib/businessContactSearch.test.js server/lib/opportunityTypeIntegration.test.js` 通过，4/4；
  覆盖人脉与互动接口按公司搜索，以及 `company_name`、`created_by_name` 返回。
- 后端全量 122 条中 117 条通过、4 条隔离 MySQL 专项按开关跳过；1 条既有任务共享集成测试首次因
  临时服务时序失败，单独重跑 2/2 通过。
- 前端全量 37 个套件、210 条测试通过；仅有既有 React `act(...)` 警告。
- 隔离生产构建 `/tmp/relation-contact-column-order-build` 成功，前端性能门禁通过：首屏 JavaScript
  `328.9KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。
- 本地页面验证人脉前五列和互动前四列顺序准确，搜索入口及移动布局正常，无新增运行时异常。

## 文档中心复制到 Word 格式修复（2026-07-28）

### 根因与修复

- 原复制逻辑只输出裸 `<table>/<td>`，没有边框、合并、列宽、底色、字体和段落样式；Word 只能识别
  单元格文字矩阵，最终生成无边框、自动等宽且文字散落的表格。
- 新增统一 Office 剪贴板序列化：表格显式输出边框、合并、基础及逐行列宽、行高、底色、文字色、
  内边距和对齐，超宽表格按 624px 页面内容宽度等比缩放；正文、标题、列表、待办、引用和代码块
  输出明确字体、字号、行距和段落边距。
- 文档中心完整编辑器和目标、周报、经营周会复用的 `DocumentBodyEditor` 同步接入；Relation 自定义
  MIME 与 HTML 数据属性继续保留，站内结构化复制粘贴不变。

### 已验证

- Office 序列化、共享块工具和 `DocumentBodyEditor` 目标测试 42/42 通过，仅有既有 React `act(...)`
  警告。
- 16 行 9 列近似文档 517 的 HTML 实际转换为 DOCX 并渲染成功；DOCX 结构包含 1 张表、16 行、
  84 个带边框单元格、16 处合并、9 处底色及明确的 9 列宽度，渲染可见边框、合并、列宽比例和底色。
- 前端全量 37 个套件、210 条测试通过；隔离生产构建 `/private/tmp/relation-word-copy-build` 成功，
  性能门禁通过：首屏 JavaScript `328.9KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。

## 文档中心输入法 Enter 误换行修复（2026-07-28）

### 根因与修复

- macOS 部分输入法确认英文候选词时会先触发 `compositionend`，再把同一次 `Enter` 作为普通按键
  交给编辑器；原有组合状态已被清除，导致普通文档块被拆分，表格单元格则插入换行并可能重复字符。
- 新增统一 contenteditable 组合输入守卫：组合期间不执行编辑器快捷键，组合刚结束后的确认 Enter
  只消费一次并阻止默认换行；随后再次按 Enter 继续执行原有拆块或单元格换行逻辑。
- 文档中心完整编辑器与目标、周报、经营周会复用的 `DocumentBodyEditor` 同步接入，覆盖段落、
  标题、列表、折叠内容、普通表格和数据库表格的富文本单元格。

### 已验证

- 目标测试 28/28 通过，复现 `完成UV/申请率` 候选确认后保持单块，并验证第二次 Enter 正常拆块。
- 前端全量 36 个套件、200 条测试通过；仅有既有 React `act(...)` 警告。
- 隔离生产构建 `/tmp/relation-ime-enter-fix-build` 编译成功；性能门禁通过：首屏 JavaScript
  `328.9KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。

## 文档中心普通表格整体宽度优化（2026-07-28）

### 已完成

- 普通文档表格块不再使用固定桌面最小宽度撑满页面，默认宽度按当前列宽合计和列数最小宽度计算，
  两三列表格可按实际内容收缩，大表仍保留横向滚动。
- 编辑态表格左右外边缘新增整体宽度拖拽热区，拖动时按比例缩放全部列宽，并保持每列不低于 80px。
- 行级列宽表格同步支持整体缩放，缩放后各行右边界保持对齐；只读/演示态使用同一内容宽度口径。

### 已验证

- `cd client && CI=true npx react-scripts test --watchAll=false --runInBand src/utils/documentTable.test.js src/utils/documentTableMerge.test.js` 通过，19/19。
- `cd client && CI=true npx react-scripts test --watchAll=false --runInBand` 通过，35 个套件、197 条测试；仅有既有 `act(...)` 警告。
- `cd client && BUILD_PATH=/tmp/relation-table-width-build npm run build` 通过。
- `BUILD_PATH=/tmp/relation-table-width-build npm run performance:frontend` 通过：首屏 JavaScript `328.9KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。

## 文档中心正文链接跳转（2026-07-28）

### 已完成

- 普通文档正文和演示模式统一接管超链接点击；Relation 文档中心链接复用既有多文档 Tab 打开
  目标文档，普通 HTTP(S) 链接使用 `noopener,noreferrer` 在浏览器新标签页打开。
- 链接分类使用标准 `URL` 解析，支持当前环境相对地址、同源地址和生产域名；非法文档 ID、外站
  伪装文档路径及 `javascript:`、`data:` 等危险协议不会进入应用内文档跳转。
- 正文存在拖选文字时不会误触发链接，段落、标题、列表、折叠内容和普通表格单元格共享同一入口。

### 已验证

- 链接分类与动作测试 15/15 通过。
- 前端全量 35 个套件、193 条测试通过；仅有既有 React `act(...)` 警告。
- 隔离生产构建 `/tmp/relation-document-link-navigation-build` 编译成功；性能门禁通过：首屏
  JavaScript `328.9KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。

## 当前任务

状态：媒体管理入口用户的媒体及关联文档默认编辑权限、动态系统成员展示已实现并完成全量验证，
准备提交推送到 `gitee/main`。

目标：所有有效媒体管理入口用户在媒体关联文档“个人”和“有权限成员”中可见，可写角色默认编辑；
`readonly/guest` 只读，菜单撤销后动态授权立即失效，手工共享和媒体删除边界保持不变。

## 媒体管理入口默认编辑授权（2026-07-27）

### 根因与修复

- 上一轮仅统一了媒体及关联文档读取范围，媒体列表 `can_edit` 和文档写接口仍只认可创建人、管理员
  或普通 `document_shares`，导致有媒体管理菜单的成员只能“查看详情”。
- `canEditDocument` 与批量可编辑文档计算新增媒体入口通道：普通可写入口用户默认可编辑全部媒体及
  关联文档；正文、附件、历史、共享和媒体信息复用同一判断，`readonly/guest` 继续被写中间件拒绝。
- 关联文档共享接口动态追加所有有效入口用户，分享弹窗“个人”和“有权限成员”同步显示，并标记
  “媒体管理菜单授权”；系统成员在前端保持选中且不可移除。
- 动态授权不落 `document_shares`。菜单权限或账号状态变化会清理运行时缓存并立即重算；保存分享时
  不会把动态成员固化，菜单撤销后自动消失。原有手工共享按独立记录保留。
- 媒体删除仍只允许 CXO 或真实流量商务组长，普通入口用户未获得删除权限。

### 已验证

- 媒体路由目标测试通过，覆盖普通入口用户编辑未单篇共享媒体、菜单撤销、`readonly/guest` 只读及
  删除权限不回退。
- 隔离 HTTP 回归通过：普通成员列表/详情 `can_edit=1`，可更新媒体和关联文档正文；分享接口和权限
  成员均显示动态系统用户；取消菜单后媒体返回 `403`、无手工共享的文档返回 `404`。
- 动态成员经分享保存后未固化，取消菜单即消失；菜单撤销期间手工添加的个人共享在菜单反复开关后
  继续保留，证明两类授权互不覆盖。
- 后端全量 118 条中 114 条通过，4 条需显式开启隔离 MySQL 的专项测试按开关跳过，无失败。
- 前端全量 31 个套件、157 条全部通过；仅有既有 React `act(...)` 警告。
- 隔离生产构建输出到 `/tmp/relation-media-menu-access-build` 并编译成功；性能门禁通过：首屏
  JavaScript `328.9KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。

## 文档中心人力行政目录（2026-07-27）

### 实现范围

- 新增与国内项目、海外项目同级的 `hr_administration` 归属域，文档编号项目码使用 `HRADM`。
- 启动目录蓝图幂等创建“人力 / 行政”，并在两者下分别创建“规划 / 落地 / 沉淀 / 团队”。
- 固定节点沿用系统目录保护，禁止改名和删除；阶段目录及用户自建后代继续允许递归新增，自建目录
  维持现有改名、删除和内容上移逻辑。
- 前端归属域、部门选项、目录树顺序和初始化目录说明同步增加人力行政。

### 已验证

- 隔离接口回归 1/1 通过：新库自动生成 10 个固定节点，重复初始化不增加节点；固定节点拒绝改名、
  删除和越级新增，阶段目录与自建目录可连续新增两级子文件夹。
- 人力规划后代目录中新建文档正确派生 `hr_administration / HR / PLAN` 和
  `Dxxxxxx-HRADM-HR-PLAN-yyyy` 编号。
- 后端全量 117 条中 113 条通过，4 条需显式开启隔离 MySQL 的测试按开关跳过，无失败。
- 前端全量 31 个套件、157 条全部通过；仅有既有 React `act(...)` 警告。
- 隔离生产构建输出到 `/tmp/relation-hr-administration-folders-build` 并编译成功；性能门禁通过：
  首屏 JavaScript `328.9KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。
- 隔离临时库页面验证通过：目录树显示人力行政完整固定层级；固定阶段目录仅允许新增子文件夹，
  重命名和删除禁用；通过右键菜单创建的自定义目录立即显示。

## 上一轮：工作台 CXO 自派任务共享可见性修复

状态：COO 自派普通任务明确共享给研发成员后，成员在工作台“需关注”不可见的问题已修复并完成
后端全量回归。

目标：保留 CXO 自派任务默认隐私，仅对任务中明确指定的共享人定向放行，不扩大到同组或其他角色。

## 全系统菜单加载性能优化（2026-07-27）

状态：系统级请求竞争、列表 N+1 和首屏重复请求已完成优化，自动化回归与前端性能门禁通过。

### 根因与修复

- 后端 MySQL 使用同步 RPC 单连接语义，页面同时发出的权限、角标、列表和元数据请求会串行占用
  Node 主线程；将组织、权限等低频参考缓存默认窗口从 5 秒提高到 60 秒，相关写接口继续主动清除。
- 目标列表移除逐行子目标计数、负责人管理权限和共享权限查询；经营周会列表移除逐周参与人和准备
  统计查询，年度汇总移除逐周提纲/结论查询，统一改为批量或聚合 SQL。
- 文档列表批量计算编辑权限，媒体列表批量计算关联文档编辑权限；媒体未执行全文搜索时不再读取随后
  会被丢弃的关联文档 `content_text` 大字段。
- 全局提醒/任务/审核角标不再随每次菜单路由变化刷新，改为首屏后延迟加载并按 60-75 秒错峰；前端
  用户、小组、项目组和核减选项请求增加 60 秒单飞缓存及写后失效。
- 文档中心首屏从“全量目录文档 + 收藏文档”两次可见性查询合并为一次；目标父级选项延后到打开
  编辑器时加载；经营周会先展示记录再加载模板和参与人；媒体首屏取消无搜索时的 220ms 人为延迟，
  工作台先展示任务再补统计和提醒。主要列表初始即显示加载态，不再短暂显示“0 条/暂无数据”。
- API 性能门禁补充文档收藏、商机、媒体、产品核减等菜单接口，并分别记录端到端 p95 与服务端
  `X-Response-Time` p95。

### 已验证

- 线上改动前低负载菜单点击到列表完成基线：媒体约 0.96-1.12 秒、目标约 1.07 秒、商机约
  1.31 秒、策略约 0.89 秒、需求约 0.95 秒；本次重点消除并发和大数据量下放大到 10 秒以上的路径。
- 前端全量 31 个套件、156 条测试全部通过；仅有既有 React `act` 警告。
- 后端非监听目标测试 38/38 通过；全量 116 条中 107 条通过、4 条专用 MySQL 测试按开关跳过，
  5 条接口集成测试因当前沙盒禁止监听 `127.0.0.1` 未执行，提权请求被环境策略拒绝。
- `node --check server/index.js`、`node --check server/lib/mediaManagement.js` 和
  `node --check scripts/performance-audit.js` 通过。
- 隔离生产构建输出到 `/tmp/relation-system-performance-build` 并编译成功；前端性能门禁通过：
  首屏 JavaScript 328.9KB / 400KB，76 个异步 chunk，最大 420.8KB / 500KB。
- 未提供隔离 MySQL 性能账号，因此未连接生产库或运行 `performance:api`；上线后需使用隔离 MySQL
  账号执行完整接口 p95 门禁，并观察 `[http:slow]` 日志确认负载下结果。

## 工作台 CXO 自派任务共享可见性修复（2026-07-27）

### 根因与修复

- 普通任务可见性原本先认可 `task_shared_users`，随后又统一应用 CXO 自派任务隐私过滤；后者没有
  识别显式共享，导致 COO 已共享给研发成员的任务仍在最终 SQL 中被排除。
- CXO 自派普通任务继续默认仅本人可见；如果当前用户存在该任务的显式共享记录，则只对当前用户
  放行。商机待跟进任务没有普通任务共享关系，继续维持原隐私规则。

### 已验证

- 隔离 HTTP 回归通过：COO 自派普通任务共享给研发小组普通成员后，成员接口返回
  `shared_to_me=1`，满足工作台“需关注”聚合条件；同一研发小组内未共享成员和管理员仍不可见。
- 普通成员之间的既有任务共享、共享人编辑状态和完成时间保持逻辑均通过。
- 后端全量 116 条中 112 条通过，4 条需显式开启隔离 MySQL 的测试按开关跳过，无失败。

## 上一轮：媒体管理统一读取权限修复

状态：媒体管理不同授权用户看到的记录数不一致问题已修复并完成全量验证，准备提交推送。

目标：所有通过媒体管理入口权限校验的用户，在相同筛选条件下看到相同的全部未删除媒体记录；
关联文档读取同步打通，编辑和删除继续执行原有权限边界。

## 媒体管理统一读取权限修复（2026-07-27）

状态：权限实现、回归、生产构建、性能门禁和文档更新均已完成，准备提交推送。

### 根因与修复

- 媒体路由通过 `/media-management` 菜单权限后，又把关联文档的创建人、共享人和团队可见范围
  拼入列表与详情 SQL，导致不同用户看到的媒体记录数取决于各自收到的文档分享。
- 媒体列表和详情改为模块级统一读取：通过入口校验后读取全部未删除媒体，不再二次套用普通文档
  可见性过滤。
- 文档统一可见性增加媒体关联文档读取通道，因此媒体详情内嵌正文、附件、历史和实时读取不会再
  因缺少单篇文档分享而返回 `404`，同时这些文档在文档中心也遵循同一动态入口权限。
- 编辑边界保持不变：未被共享且不是创建人或文档管理员的用户返回 `can_edit=0`，直接更新返回
  `403`；`readonly/guest` 不可写。删除仍只允许 CXO 或真实流量商务组长。

### 已验证

- 媒体权限目标测试 14/14 通过，覆盖菜单缺失、访客模块读权限、未单独分享媒体的统一列表与详情、
  关联文档读取、不可编辑用户直接更新 `403`，以及删除权限不回退。
- 后端全量 114 条中 110 条通过，4 条需显式开启隔离 MySQL 的测试按开关跳过。
- 前端全量 30 个套件、153 条全部通过；仅有既有 React `act(...)` 警告。
- 隔离生产构建输出到 `/tmp/relation-media-visibility-build` 并编译成功；性能门禁通过：首屏
  JavaScript `328.2KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。

## 经营周会 AI 提纲网关 504 修复（2026-07-26）

状态：后台任务、前端轮询、权限隔离和兼容回归已完成，准备提交到 `gitee/main`。

### 根因与修复

- 现象中的 `Request failed with status code 504` 来自 Relation 前方反向代理：浏览器原先用一个
  POST 等待模型 120 秒，代理在模型返回前先切断连接。继续增加 Axios 或服务端请求超时无法解决
  更短的代理等待窗口。
- 新前端以 `async=true` 创建生成任务，接口在完成准备内容与权限校验后立即返回 `202`；模型生成、
  六段结构校验、敏感内容检查、提纲保存、历史写入和周会状态更新均在服务端后台继续执行。
- 页面按服务端建议间隔轮询 `pending / running / completed / failed`，最长等待 5 分钟；完成结果已经
  落库，失败结果保留原始业务错误码和状态。模型执行窗口从 120 秒调整为 180 秒。
- 同一 CXO 对同一周会的活动任务自动复用；任务绑定发起用户，匿名用户、准备人员和其他 CXO 均
  不能读取。任务仅在内存保留 15 分钟、最多 200 条，不记录提示词、准备正文或凭据。
- 未传 `async=true` 的旧页面继续使用同步兼容路径；旧前端重复保存同一结果仍按幂等成功处理。
  服务重启或任务过期时返回“生成任务已失效，请重新生成”。

### 已验证

- 慢模型接口时序回归通过：启动请求在 1 秒内返回 `202`，连续创建复用同一 `job_id`，模型完成后
  才返回已保存提纲；详情、历史和周会状态立即可读。
- 异步失败返回 `failed + AI_MODEL_UNAVAILABLE + http_status=503`，已有提纲不被覆盖；同步旧客户端
  同一路径仍返回原兼容错误。
- 后端全量 113 条中 109 条通过，4 条需显式开启隔离 MySQL 的测试按开关跳过。
- 前端全量 29 个套件、147 条全部通过；仅有既有 React `act` 警告。
- 隔离生产构建输出到 `/tmp/relation-operational-agenda-async-build` 并编译成功；性能门禁通过：
  首屏 JavaScript `328.2KB / 400KB`，76 个异步 chunk，最大 `420.8KB / 500KB`。

### 上线验证

- 发布后需硬刷新已打开的 Relation 页面，确保加载包含异步轮询的新前端包，再点击“生成提纲”。

## 经营周会 AI 提纲生成后空白修复（2026-07-26）

状态：服务端原子保存、前端持续状态和兼容回归已完成，随本次提交交付到 `gitee/main`。

### 根因与修复

- 原链路先调用 AI 生成，再由前端发起第二次 PUT 保存；两次请求之间遇到刷新、轮询竞态、网络中断
  或保存校验失败时，已生成结果只存在于浏览器内存并直接丢失，数据库仍显示“未生成”。
- 生成接口现于服务端完成生成、固定六段校验、敏感数据检查、提纲持久化、历史记录和周会状态更新，
  成功响应携带 `saved=true`、记录 ID 和 `updated_at`，前端不再追加二次保存。
- 已打开的旧前端仍可能重复 PUT；相同 `source_hash` 和提纲内容按幂等成功返回，不更新时间或重复历史。
- 页面生成期间在提纲区域显示持续进度；失败后保留明确错误和重试按钮，toast 延长到 8 秒，不再无声
  回到“暂无会议提纲”。

### 已验证

- 提纲和权限目标测试 17/17 通过。
- 经营周会接口集成测试 1/1 通过，新增覆盖生成接口返回后立即刷新详情可见、周会状态已更新、
  旧前端重复保存返回 `changed=false` 且更新时间和历史条数不变。
- 模型不可用时重新生成返回 `503 AI_MODEL_UNAVAILABLE`，已有提纲和历史保持不变。
- 后端全量测试 110 条中 106 条通过，4 条需显式开启专用 MySQL 环境的测试按开关跳过。
- 前端全量测试 28 个套件、143 条全部通过；仅有既有 React `act` 警告。
- 隔离生产构建输出到 `/tmp/relation-operational-agenda-atomic-build` 并编译成功。
- 前端性能门禁通过：首屏 JavaScript `328.1KB / 400KB`，76 个异步 chunk，最大
  `420.8KB / 500KB`。

## 经营周会 AI 提纲超时修复（2026-07-26）

状态：实现和自动化验证完成，随本次提交交付到 `gitee/main`。

### 需求与实现

- 根因是经营周会长文本结构化生成复用了系统模型 25 秒通用超时，严格六段 JSON 尚未生成完成就被
  服务端主动中断；现改为经营周会专用 120 秒服务端等待窗口，前端请求等待 135 秒。
- 真正超时返回 `504 AI_GENERATION_TIMEOUT`，并记录本次生成耗时和使用的超时窗口，区别于模型连接、
  输出格式和敏感内容错误。
- 提示词升级为 `operational-meeting-agenda-v3`，要求覆盖每份非空的已提交准备内容，保留相关负责人和
  非敏感关键数据，不错误合并不同项目，冲突数据或判断明确标记“待会上确认”。
- 目标篇幅调整为 3500-5000 个中文字符，并提供足够的模型输出 token 预算；服务端仍强制校验语义
  JSON，并统一渲染为固定六段文档块结构。
- 统一权限策略继续以真实 CXO 身份为准；新增回归证明 CEO、COO、CTO、CMO 即使参与人记录中的
  `can_generate_agenda=0` 也都可以生成，普通准备人员仍不能生成。

### 已验证

- `node --check server/lib/operationalMeetingAgenda.js` 与 `node --check server/index.js` 通过。
- 提纲和权限目标测试 17/17 通过，覆盖 v3 提示词、固定六段、120 秒窗口、504 超时映射和四种 CXO。
- 经营周会接口集成测试 1/1 通过。
- 后端全量测试 110 条中 106 条通过，4 条需显式开启专用 MySQL 环境的测试按开关跳过。
- 前端全量测试 28 个套件、142 条全部通过；仅有既有 React `act` 警告。
- 隔离生产构建输出到 `/tmp/relation-operational-agenda-timeout-build` 并编译成功。
- 前端性能门禁通过：首屏 JavaScript `328.1KB / 400KB`，76 个异步 chunk，最大
  `420.8KB / 500KB`。

### 遗留验证

- 自动化测试使用模型响应夹具，没有调用生产模型或写入真实经营周会；上线后需由任一 CXO 在真实
  已完成准备的周会上生成一次，核对公司模型网关实际耗时、内容覆盖和最终提纲质量。

## 文档块回车拆分优化（2026-07-26）

状态：实现和自动化验证完成，待提交推送 `gitee/main`。

### 需求与实现

- 在普通文档或共享块编辑器的正文中间按 `Enter`，按当前光标位置拆分内容；光标前内容保留在
  原块，光标后内容移动到新块，不再只新增空块。
- 列表项拆分后继续保留列表类型和层级，后续编号自动顺延；拆分两侧的加粗、颜色等行内格式
  跟随对应文字保留，并清理分割边界产生的空样式标签。
- 文档中心内嵌编辑器与目标、周报、经营周会复用的 `DocumentBodyEditor` 共用同一光标拆分助手。

### 已验证

- `DocumentBodyEditor.test.js` 20/20 通过，新增覆盖“许愿星|测试：”拆成同级编号项，以及拆分两侧
  行内格式保留。
- 前端全量测试 28 个套件、142 条测试全部通过；仅有既有 React `act` 警告。
- 隔离生产构建输出到 `/tmp/relation-enter-split-build` 并编译成功。
- 前端性能门禁通过：首屏 JavaScript `328.1KB / 400KB`，76 个异步 chunk，最大
  `420.8KB / 500KB`。
- 本机 `3000/3001` 未运行，未连接未知 MySQL 环境；交互主链由 contenteditable 组件回归测试覆盖。

## 工作台任务默认排序（2026-07-25）

状态：实现和目标回归完成，随本次提交交付到 `gitee/main`。

### 需求与实现

- 工作台“待执行 / 我指派 / 需关注 / 团队”统一按有效计划日期倒序，桌面表格和移动端卡片共用
  同一排序结果。
- 有计划日期时使用计划日期；无计划日期时使用创建时间对应的业务日期参与排序，不再统一沉底。
- 有效日期相同时按“进行中、未开始、已完成、挂起”排序；日期和状态都相同时按创建时间倒序，
  最后使用任务 ID 保证稳定顺序。
- 移除旧的“本周活跃任务优先”分桶；用户主动点击表头后仍可使用现有手动排序。

### 已验证

- 新增 `dashboardTaskSort.test.js`，4/4 通过，覆盖日期优先、同日状态顺序、缺失计划日期回退创建
  日期、同日同状态创建时间倒序及输入数组不变。
- `businessTime.test.js` 3/3 通过，确认排序继续复用统一业务时间解析。
- 当前共享工作区前端全量测试 28 个套件、139 条测试全部通过；仅有既有 React `act` 警告。
- 隔离生产构建输出到 `/tmp/relation-dashboard-task-sort-build` 并编译成功。
- 提交干净快照目标测试 4/4、隔离生产构建通过；性能门禁通过，首屏 JavaScript `328.2KB / 400KB`，
  76 个异步 chunk，最大 `420.8KB / 500KB`。

## 在线表格 Univer 一期接入（2026-07-25）

状态：实现完成，正式默认关闭，待产品走真实文档交互回归；暂不提交。

### 正式服发布策略

- 当前没有测试分支或灰度分支时，只建议提交 Univer 预备代码，不建议把正式在线表格入口切到
  Univer。`Documents.js` 应继续默认渲染旧 `SpreadsheetDocumentEditor`，避免未验证编辑器和
  1MB+ Univer 异步 chunk 进入正式用户路径。
- 不能只靠 `REACT_APP_ENABLE_UNIVER_SPREADSHEET` 等 CRA 环境变量做上线开关；实测只要
  `Documents.js` 存在 Univer 动态 import，生产构建仍会包含 Univer 大 chunk，并触发异步 chunk
  性能预算失败。
- 正式替换入口前，需要先补隔离 MySQL + 登录账号的真实文档端到端回归，至少覆盖输入、自动保存、
  刷新回读、排序、筛选、冻结、Excel 导入导出和只读写入拒绝。
- 回滚策略应保持简单：入口接线独立成小提交，回滚 `Documents.js` 入口即可恢复旧编辑器；任何
  新格式保存或迁移都必须保留旧工作簿可读 fallback。

### 已完成

- 安装 Univer 依赖 `@univerjs/presets`、`@univerjs/preset-sheets-core`、
  `@univerjs/preset-sheets-sort`、`@univerjs/preset-sheets-filter`，版本统一为 `0.25.1`。
- 新增 `UniverSpreadsheetDocumentEditor` 预备组件，但当前 `Documents.js` 正式入口不引用该组件，
  在线表格仍默认渲染旧 `SpreadsheetDocumentEditor`。这样代码可随主线提交，但正式构建不会打入
  Univer 运行时大包，也不会让线上用户进入未完整验证的新编辑器。
- 新增石墨风格皮肤层 `UniverSpreadsheetDocumentEditor.css`，先约束字体、工具栏/输入控件密度、
  主题色、网格线、弹层阴影和工作区高度；后续仍需基于石墨截图做像素级微调。
- 新增 `spreadsheetUniverAdapter`，把现有 `relation_spreadsheet_workbook_v1` 转成 Univer snapshot，
  并在 Univer 命令变更后 debounce 保存回旧工作簿格式，复用现有保存、历史、协作和服务端校验链路。
- 一期启用 Univer 核心、排序和筛选 preset；基础录入、公式、格式、排序、筛选、冻结行/列等能力
  由 Univer 工作区承载。

### 已验证

- `cd client && CI=true npx react-scripts test --watchAll=false --runInBand src/utils/spreadsheetUniverAdapter.test.js src/components/SpreadsheetDocumentEditor.test.js`
  通过，16/16。
- `cd client && CI=true npx react-scripts test --watchAll=false --runInBand` 通过，27 个套件、135 条测试；
  仍有既有 `act(...)` 测试警告。
- `cd client && BUILD_PATH=/tmp/relation-univer-build npm run build` 通过。
- `/tmp/relation-univer-build` 目录约 17MB，其中 `static/js` 约 16MB、`static/css` 约 144KB。
- `cd client && BUILD_PATH=/tmp/relation-univer-build npm run performance:budget` 未通过：首屏 JS gzip
  `330.0KB / 400.0KB` 达标；最大异步 chunk gzip `1279.2KB / 500.0KB` 超预算，主要来自 Univer
  Sheets 核心运行时。
- 正式安全构建 `cd client && BUILD_PATH=/tmp/relation-univer-safe-build npm run build` 通过；由于
  `Documents.js` 不引用 Univer 组件，构建产物不包含 Univer 大 chunk。
- 正式安全构建性能门禁 `cd client && BUILD_PATH=/tmp/relation-univer-safe-build npm run performance:budget`
  通过：首屏 JS gzip `328.1KB / 400.0KB`，异步 chunk 76 个，最大 `420.8KB / 500.0KB`。
- 浏览器回归：完整 `DB_CLIENT=mysql npm run dev` 提权启动被安全审核拒绝，原因是可能连接并迁移未知
  MySQL 库；只验证了当前 3000 前端可打开并跳转登录页。
- 浏览器回归：在 `/tmp` 生成一次性 Univer 静态预览页并通过本地静态 HTTP 服务打开，确认 Univer
  工作区真实浏览器渲染成功，页面含 3 个 canvas，样例工作表、公式结果、冻结行/列分隔线和 Sheet
  标签可见；在 D2 单元格输入“新增数据”后截图确认内容写入网格。

### 遗留风险

- 尚未用登录态真实在线表格文档做浏览器回归，尤其需要核对保存回读、排序、筛选、自动保存状态、
  Excel 导入导出和旧编辑器 fallback。若继续验证，需要用户明确提供/授权隔离 MySQL 测试库。
- 如果后续要真正开启 Univer，不能只靠 `REACT_APP_ENABLE_UNIVER_SPREADSHEET` 这种 CRA 环境变量
  开关；实测只要 `Documents.js` 里存在动态 import，webpack 仍会把 Univer 大 chunk 纳入构建并导致
  性能门禁失败。需要单独做入口接线 PR、构建拆包策略或正式预算例外。
- 静态预览页确认 Univer sort/filter preset 已打包加载，但受预览页工具栏折叠和无真实文档环境限制，
  未完成排序/筛选菜单的端到端点击验证。
- 当前一期为了复用既有服务端链路，仍保存为旧工作簿格式；Univer 专属高级状态可能无法完整保留，
  后续需要升级到 `relation_univer_spreadsheet_workbook_v1`。
- 石墨像素级 UI 仅完成基础 skin/token，尚未按石墨截图做 Playwright 像素差异验收。
- Univer 核心异步 chunk 超过当前性能门禁，后续需评估调整构建拆包策略、路由预算例外或进一步按
  功能拆插件。

## @ 成员选择面板加载提速（2026-07-25）

状态：实现和自动化验证完成，待提交推送 `gitee/main`。

### 已完成

- `MentionPicker` 新增候选成员缓存和预加载 API；同一页面 60 秒内复用候选结果，面板再次打开直接展示成员。
- 文档中心、共享块编辑器和在线表格在页面/对象就绪后提前预取 @ 候选人，避免用户输入 `@` 后才开始请求。
- 服务端文档候选人从“遍历所有用户逐个调用文档可见性检查”改为批量展开管理员、创建人、
  用户/部门/小组/项目组共享和组长可见范围，并保留统一候选接口权限兜底。
- 候选接口增加短 TTL 运行时缓存，降低连续输入和多编辑器场景的重复计算。

### 已验证

- `node --check server/index.js` 通过。
- `cd client && CI=true npx react-scripts test --watchAll=false --runInBand src/components/DocumentBodyEditor.test.js`
  通过，17/17，新增覆盖预加载后面板直接展示成员且不显示 loading。
- `cd client && CI=true npx react-scripts test --watchAll=false --runInBand` 通过，26 个套件、133 条测试。
- `cd client && BUILD_PATH=/tmp/relation-mention-fast-build npm run build` 通过。
- `BUILD_PATH=/tmp/relation-mention-fast-build npm run performance:frontend` 通过，首屏 JavaScript
  328.1KB gzip，76 个异步 chunk，最大异步 chunk 420.8KB gzip。
- `node --test server/lib/*.test.js` 沙盒内因 `listen EPERM 127.0.0.1` 失败；提权重跑通过，
  107 条中 103 条通过，4 条需专用 MySQL 环境的测试按开关跳过。

## 在线表格 Univer 方案文档化（2026-07-25）

状态：PRD、AGENTS 和交接文档已更新；未改业务代码，未安装依赖，未运行测试。

### 已完成

- `文档中心-在线表格文档PRD.md` 明确新版在线表格以 Univer 为目标内核，自研
  `SpreadsheetDocumentEditor` / `spreadsheetWorkbook.js` / `spreadsheetWorkbookFile.js` 仅作为旧数据
  兼容和 fallback，不再继续扩展完整石墨级能力。
- PRD 新增石墨像素级 UI 验收口径：菜单栏、工具栏、公式栏、网格、选区、Sheet 标签、右键菜单、
  筛选/条件筛选面板、附件/图片对象等均以石墨表格截图为内部验收标尺；不使用石墨 Logo、商标、
  水印或受保护素材。
- PRD 新增 Univer 数据格式 `relation_univer_spreadsheet_workbook_v1`、适配层、旧工作簿迁移、
  fallback、只读态、附件对象和操作日志脱敏约束。
- `文档中心模块PRD.md` 同步说明：当前自研在线表格是过渡能力，后续完整能力由 Univer 承载。
- `AGENTS.md` 固化长期开发约束：新增复杂公式、条件筛选、条件格式、附件/图片对象、复杂排序、
  冻结、格式刷、填充柄、查找替换、图表等能力时优先接入 Univer，不再继续堆叠自研引擎。

### 下一步建议

- 第零期先做不影响线上入口的 Univer PoC，验证输入、公式、排序、筛选、条件筛选、冻结、格式、
  Sheet、复制粘贴、撤销重做、只读模式、图片/附件对象、Excel 往返和懒加载包体。
- 建立石墨 UI token 和 Playwright 截图回归，再决定正式替换自研编辑器的迁移批次。

## @ 提及体验优化（2026-07-25）

状态：实现和自动化验证完成，待提交推送 `gitee/main`。

### 已完成

- 富文本 @ 标签新增稳定标记和不可编辑属性，兼容旧蓝底 @ 标签；光标停在 @ 标签后按 Delete
  或 Backspace 时会一次性删除整条 @ 记录。
- @ 成员选择面板新增点击外部、触发文本失效、Esc、切换在线表格单元格等关闭路径，避免面板残留。
- 候选人接口不再过滤当前用户；前端选择自己后只插入 @ 标签并提示“不发送通知”，后端 notify
  接口也对自提及做成功跳过兜底。

### 已验证

- `node --check server/index.js` 通过。
- `cd client && CI=true npx react-scripts test --watchAll=false --runInBand src/components/DocumentBodyEditor.test.js`
  通过，16/16，新增覆盖整条删除、面板关闭、自提及不通知。
- `cd client && CI=true npx react-scripts test --watchAll=false --runInBand` 通过，26 个套件、132 条测试。
- `cd client && BUILD_PATH=/tmp/relation-mention-ux-build npm run build` 通过。
- `BUILD_PATH=/tmp/relation-mention-ux-build npm run performance:frontend` 通过，首屏 JavaScript
  328.1KB gzip，76 个异步 chunk，最大异步 chunk 420.8KB gzip。
- `node --test server/lib/*.test.js` 沙盒内因 `listen EPERM 127.0.0.1` 失败；提权重跑通过，
  107 条中 103 条通过，4 条需专用 MySQL 环境的测试按开关跳过。

## @ 提及通知（2026-07-25）

状态：实现和自动化验证完成，待提交推送 `gitee/main`。

### 已完成

- 新增通用 @ 成员选择浮层，输入 `@` 后按当前对象从服务端拉取可见成员；普通富文本块插入蓝底
  `@姓名`，在线表格单元格/公式栏插入纯文本 `@姓名`。
- 支持文档中心普通文档、文档中心在线表格文档、目标、周报、经营周会准备块/会议提纲/会议结论。
- 新增统一后端接口 `/api/mentions/candidates` 与 `/api/mentions/notify`；候选人与发送通知均复用
  文档、目标、周报、经营周会现有可见/编辑权限，服务端拒绝向无当前页面权限的成员发送 @ 通知。
- 通知中心新增 `@你` 类型标签，通知标题包含发起人、模块名、页面标题，内容包含被 @ 行文本。

### 已验证

- `node --check server/index.js` 通过。
- 前端目标回归 `DocumentBodyEditor.test.js` 通过，新增覆盖 @ 成员选择、蓝底插入和 5 秒后通知。
- 前端全量测试 26 个套件、129 条测试全部通过。
- 后端全量测试提权重跑通过：107 条中 103 条通过，4 条需专用 MySQL 环境的测试按开关跳过。
- 隔离生产构建输出到 `/tmp/relation-mentions-build` 并编译成功。
- 前端性能门禁通过：首屏 JavaScript 328.1KB gzip，75 个异步 chunk，最大异步 chunk 420.8KB gzip。

## DAU查询助手菜单（2026-07-25）

状态：菜单已交付；外部页面调试浮层修复完成，随本次提交交付到 `gitee/main`。

### 需求与实现

- “常用工具”新增“DAU查询助手”，内部路由为 `/dau-query-assistant`。
- 页面不增加说明或中间层，直接以全尺寸 iframe 加载固定地址
  `https://ngwlcg9gyg3i.space.mcode.cn`。
- 菜单权限页同步新增权限节点；管理员及老板身份默认可见，其他用户按现有菜单权限授权。
- 目标地址固定在代码中，不接受 URL 参数覆盖；Relation 不代理或存储第三方页面数据。
- 外部页面在 iframe 中会自动启用 MiniMax 元素检查脚本，造成蓝色 `<div>/<span>` 标签、虚线框和
  点击拦截；Relation 在 iframe 加载完成后向固定来源发送关闭高亮和清除选中节点消息。
- 外部脚本的 `disableHighlight()` 只关闭 hover，不移除 click 监听；点击 input/div/span 时仍会调用
  `updateSelectedHighlight()` 重新生成常驻标签。Relation 现监听该 iframe 的 ready/hover/click 消息，
  严格校验 origin、source window 和 injector 标记后，再次关闭并清除选中节点。
- 右下角 `Created by MiniMax Agent` 是第三方页面自身品牌标识，不属于元素检查器；目标站点未提供
  跨域关闭接口，Relation 不使用遮罩覆盖，以免挡住查询内容和交互。

### 已验证

- DAU查询助手页面测试 1/1 通过，确认页面只渲染一个 iframe，地址、标题、立即加载和 referrer
  策略正确，并覆盖加载关闭、点击后再次清除、伪造来源忽略和组件卸载清理监听器。
- 真实跨域 iframe 回归通过：点击搜索输入框后焦点正常停留在 `INPUT`，再点击普通卡片标题，hover、
  tag、selected 和 selectedLabel 均保持 `display:none`，不再出现 `✓ <input>/<div>/<span>`。
- 前端全量测试 28 个套件、139 条测试全部通过；测试输出仅有既有 React `act` 警告。
- 隔离生产构建输出到 `/tmp/relation-dau-inspector-click-fix-build` 并编译成功。
- 目标站点响应 `200`，未返回 `X-Frame-Options` 或 CSP `frame-ancestors`，允许 iframe 嵌入。
- 前端性能门禁通过：首屏 JavaScript 328.1KB gzip，76 个异步 chunk，最大异步 chunk 420.8KB gzip。
- 本机 `3001` 后端未运行，因此未执行登录后的 Relation 菜单浏览器回归。

## 出差协同二维冻结（2026-07-25）

状态：实现和自动化验证完成，待提交推送 `gitee/main`。

### 需求与实现

- 日程网格横向滚动时固定左侧时段列，纵向滚动时固定顶部日期行。
- 左上角交叉格同时冻结并使用最高层级；日期、时段和交叉格使用不透明背景及轻分隔阴影，避免
  日程卡片滚动时遮挡标签。
- 冻结基于现有网格双向滚动容器，不改变日期列宽、时段行高或日程操作能力。

### 已验证

- 新增出差协同组件回归测试 1/1 通过，覆盖 3 个日期表头、4 个时段标签、双向滚动容器和左上角
  交叉格的冻结结构标记。
- 前端全量测试 25 个套件、127 条测试全部通过。
- 隔离生产构建输出到 `/tmp/relation-trip-collaboration-sticky-build` 并编译成功。
- 前端性能门禁通过：首屏 JavaScript 328.0KB gzip，74 个异步 chunk，最大异步 chunk 420.8KB gzip。
- 本机 `3000` 前端正在运行，但 `3001` 后端未运行且无可复用页面数据，因此未执行真实数据的
  浏览器双向滚动；未连接或启动未知数据库环境。

## 媒体列默认宽度优化（2026-07-24）

状态：实现和自动化验证完成，待提交推送 `gitee/main`。

### 需求与实现

- 移除媒体列固定 `260px` 的默认/最小宽度，默认宽度只按媒体名称估算，端描述不参与计算。
- 默认宽度限制在 `168px-240px`：短名称使用紧凑宽度，较长名称按字符宽度增加，极长名称封顶；
  用户手动拖拽并保存的宽度继续优先。
- 端描述继续单行省略并通过悬浮层展示完整内容。

### 已验证

- 媒体页面与工具目标测试 8/8 通过；覆盖短媒体名默认 `168px`、长名称按需增加、极长名称封顶
  `240px`，并确认超长端描述不参与宽度计算。
- 前端全量测试 24 个套件、126 条测试全部通过。
- 隔离生产构建输出到 `/tmp/relation-media-name-width-build` 并编译成功。
- 前端性能门禁通过：首屏 JavaScript 328.0KB gzip，75 个异步 chunk，最大异步 chunk 420.8KB gzip。

## 媒体端描述列宽优化（2026-07-24）

状态：实现和自动化验证完成，待提交推送 `gitee/main`。

### 需求与实现

- 媒体列宽不再由端描述的长文本撑开，后续“重要程度”等列保持在声明位置。
- 媒体表格使用固定列布局，继续支持现有列宽拖拽；媒体名称和端描述都不能突破媒体列边界。
- 端描述单行省略，鼠标悬停显示完整内容，交互与预算列的完整内容提示一致。

### 已验证

- 媒体页面与工具目标测试 7/7 通过；回归用超长端描述验证固定表格布局和完整 Tooltip 文案。
- 前端全量测试 24 个套件、125 条测试全部通过。
- 隔离生产构建输出到 `/tmp/relation-media-endpoint-width-build` 并编译成功。
- 前端性能门禁通过：首屏 JavaScript 328.0KB gzip，75 个异步 chunk，最大异步 chunk 420.8KB gzip。

## 媒体端描述字段（2026-07-24）

状态：实现和自动化验证完成，待提交推送 `gitee/main`。

### 需求口径

- 媒体名称只填写主体名称，例如“梦游社”；端和 CID 组合填写到独立“端描述”，例如
  “安卓-100035/iOS-100036/极速版-100047”。
- 列表媒体名称下方原“文档 #ID”位置改为端描述，不再显示内部关联文档编号。
- 端描述支持新增、编辑、详情和全文搜索，并按媒体敏感文本规则加密存储；旧记录保持原值，
  不依据连字符自动拆分媒体名称。

### 已验证

- 媒体服务端单元与路由测试 10/10 通过，覆盖输入长度、旧库增量加列、MySQL `LONGTEXT` 转换、
  新增回读、按端描述搜索和编辑更新。
- 媒体前端页面与工具测试 7/7 通过，覆盖端描述表单序列化、列表显示和移除“文档 #ID”。
- 前端全量测试 24 个套件、125 条测试全部通过。
- 后端全量测试 107 条中 103 条通过，4 条需专用 MySQL 环境的测试按开关跳过，零失败。
- 隔离生产构建输出到 `/tmp/relation-media-endpoint-description-build` 并编译成功；性能门禁通过，
  首屏 JavaScript 328.0KB gzip，75 个异步 chunk，最大异步 chunk 420.8KB gzip。

## 媒体详情抽屉偶发闪退修复（2026-07-24）

状态：实现和自动化验证完成，待提交推送 `gitee/main`。

### 根因与修复

- 用户视频显示双击媒体行后详情抽屉先正常打开并完成嵌入文档挂载，随后执行关闭动画；该现象是
  抽屉真实触发关闭，不是内容加载骨架闪烁。
- 同一媒体详情加载期间重复双击只发起一次详情请求，并阻止双击事件继续冒泡或触发默认行为。
- 详情和附件请求增加序号隔离；关闭抽屉或切换记录时立即作废旧请求，迟到响应不再回写当前详情。
- 详情抽屉关闭遮罩点击，只保留右上角关闭按钮和 `Esc`，避免双击残余点击落到遮罩后误关闭。
- 修正详情描述区列跨度并改用 Ant Design 新版样式 API，减少详情首次挂载时的布局重排和弃用警告。

### 已验证

- 媒体页面与工具目标测试：2 个套件、7 条测试全部通过；新增回归覆盖连续双击请求去重、遮罩点击
  不关闭，以及详情返回后附件和嵌入文档正常挂载。
- 前端全量测试：24 个套件、125 条测试全部通过。
- 隔离生产构建通过，输出到 `/tmp/relation-media-detail-stability-build`。
- 前端性能门禁通过：首屏 JavaScript 328.0KB gzip，75 个异步 chunk，最大异步 chunk 420.8KB gzip。
- 本机 `3001` 后端未运行，因此未执行登录态真实数据浏览器回归；故障时序由用户视频和组件测试覆盖。

## 工作台今日完成统计修复（2026-07-24）

状态：实现和自动化验证完成，随本次提交交付到 `gitee/main`。

### 根因与修复

- 工作台“今日已完成”按任务 `done_at` 统计；任务更新接口此前只要请求中的状态为 `done`，无论
  状态是否变化都会把 `done_at` 重写为当前时间，因此批量修改历史已完成任务标题后会全部计入今日。
- 新增统一任务生命周期规则：只有状态从非 `done` 迁移到 `done` 时才写入当前完成时间；已完成
  状态下编辑其他字段保留原值；重新打开任务清空完成时间，再次完成重新记录。
- 普通任务和待跟进任务两个更新接口共用该规则，避免工作台聚合来源继续出现同类偏差。
- 新增一次性 MySQL 迁移 `task-completion-transition-repair-v1`：从操作日志提取每条任务最近一次
  “非 done -> done”的成功状态迁移，并要求当前错误时间同时匹配后续无状态变化的成功编辑日志，
  仅在该编辑请求仍携带 `status=done` 时恢复为证据时间。
  没有明确状态迁移证据的任务保持不变；迁移不修改状态、标题、`updated_at` 或操作日志。

### 已验证

- 任务生命周期与证据修复纯逻辑测试 3/3 通过。
- 任务 HTTP 回归测试 5/5 通过，覆盖完成后改标题并继续提交 `status=done` 时 `done_at` 不变。
- 后端全量测试：107 条中 103 条通过，4 条需要专用 MySQL 环境的用例按开关跳过，零失败。
- 前端全量测试：24 个套件、124 条测试全部通过。
- 隔离生产构建通过，输出到 `/tmp/relation-task-completion-fix-build`；前端性能门禁通过，首屏
  JavaScript 328.0KB gzip，最大异步 chunk 420.8KB gzip。
- 本机未配置 `RELATION_TEST_MYSQL_*` 隔离实例，新增的真实 MySQL 修复迁移用例已登记但未执行；
  部署时可从启动日志 `[startup] task completion repair migration applied` 核对修复数量。

## 媒体管理行操作体验（2026-07-24）

状态：实现和自动化验证完成，随本次提交交付到 `gitee/main`。

### 已完成

- 桌面表格移除固定在右侧的“操作”列，所有屏幕宽度均可自然横向滚动查看列内容。
- “媒体”单元格增加悬浮/键盘聚焦 `···`，菜单按服务端权限展示“查看详情 / 编辑媒体 / 删除媒体”；
  触屏设备保持入口常显，按钮预留固定宽度，出现时不会挤动媒体名称。
- 媒体名称点击和行双击继续打开详情；详情抽屉保留高频“编辑信息”，低频删除移入 `···` 菜单。
- 删除统一使用二次确认，并继续以服务端 `can_delete` 为唯一前端展示依据。
- 移除表格 `1180px` 硬编码最小宽度，横向滚动宽度由 `ResizableTable` 根据当前可见列及保存列宽计算。
- 新增页面回归测试，防止“操作”列回归，并验证每条媒体记录均有上下文菜单入口；权限菜单组合由
  工具测试覆盖。

### 已验证

- 媒体页面与工具目标测试：2 个套件、6 条测试全部通过。
- 前端全量测试：24 个套件、124 条测试全部通过。
- 隔离生产构建通过，输出到 `/tmp/relation-media-row-actions-build`。
- 前端性能门禁通过：首屏 JavaScript 328.0KB gzip，75 个异步 chunk，最大异步 chunk 420.8KB gzip。
- `git diff --check` 通过。
- 前端开发服务已在 `http://localhost:3000` 启动并确认登录页可达；本机 `3001` 后端未运行，当前
  浏览器无登录态，因此未执行真实数据列表的浏览器悬浮、菜单和详情抽屉回归。

## 经营周会 AI 会前提纲 v2（2026-07-23）

### 已完成

- “生成提纲 / 重新生成提纲”改为使用完整经营分析提示词，模型返回受控语义 JSON；服务端校验
  4 项会议目标、5-8 项决策议题、120-150 分钟议程和 5-8 项会前问题后，再转换为
  `relation_document_blocks_v1`。
- 输出只保留“经营周会会前提纲”主标题、固定开场语、六段正文和固定结束语；不生成顶部眉题、
  副标题、材料来源、数据口径、会议重点、敏感数据说明、数据说明、封面或导读。
- 六段标题、业务模块、决策议题和段内标签使用 `heading1` 至 `heading4`；所有分点使用真实
  `bullet/numbered` 块，可直接在会议页签的 `DocumentBodyEditor` 中继续编辑。
- 生成接口不再采信浏览器提交的 `sections`，按选中会议 ID 读取已提交准备块；必填准备未全部提交
  返回 `409 PREPARATION_INCOMPLETE`；模型返回前及生成结果保存时均复核 `source_hash`，准备内容变化
  返回 `409 PREPARATION_CHANGED`。
- 重新生成前提示覆盖，先保存当前未保存提纲；模型不可用时不以规则兜底覆盖已有提纲。
- 输入和输出继续执行敏感信息扫描，会议提纲保存接口也独立拒绝毛利、利润和毛利率类内容。
- 旧六字段提纲继续由前端兼容转换，新生成记录使用提示词版本
  `operational-meeting-agenda-v2`，无需数据库迁移。

### 已验证

- `node --test server/lib/operationalMeetingAgenda.test.js` 通过，8/8；包含历史折叠正文和旧
  `questions[]` 准备格式兼容。
- `node --test server/lib/operationalMeetingIntegration.test.js` 通过，1/1；覆盖权限、必填准备门禁、
  服务端会议数据源、原生列表块和敏感提纲保存阻断。
- `node --check server/lib/operationalMeetingAgenda.js`、`node --check server/index.js` 通过。
- 前端全量测试通过，23 个套件、122 条测试全部通过。
- 后端全量测试通过，100 条通过，3 条显式 MySQL 环境测试按开关跳过。
- `BUILD_PATH=/tmp/relation-operational-agenda-build npm run build` 通过；首屏 JS 335.81KB gzip，
  最大异步 chunk 430.88KB gzip，仍满足性能预算。
- `BUILD_PATH=/tmp/relation-operational-agenda-build npm run performance:frontend` 通过；门禁口径下
  首屏 JS 327.9KB gzip、75 个异步 chunk、最大异步 chunk 420.8KB gzip。

## 媒体管理附件与合同有效期（2026-07-23）

### 已完成

- 新增媒体弹窗增加附件选择区，样式和限制复用互动记录附件上传：最多 10 个、单个最大 100MB；
  保存媒体成功后逐个上传到该媒体的关联文档附件表。
- 双击媒体进入详情页后新增“媒体附件”区域，展示新增媒体时上传的附件，并支持下载。
- 媒体字段新增 `contract_valid_until` 合同有效期，服务端支持旧库增量加列、日期校验、创建、
  编辑、搜索和详情返回。
- 列设置新增“合同有效期”，默认不选中，顺序位于“最新媒体发版时间”和“最新支持功能”之间；
  新增/编辑表单和详情页同步展示该日期字段。

### 已验证

- `node --check server/lib/mediaManagement.js` 通过。
- `node --check server/index.js` 通过。
- `node --test server/lib/mediaManagement.test.js` 通过，8/8。
- `cd client && BUILD_PATH=/tmp/relation-media-attachments-build npm run build` 通过。

## Wolai 剪贴板重复内容修复（2026-07-23）

### 根因与修复

- Wolai 的列表项 `<li>` 内包含用于排版的 `<div>/<p>`；文档中心先解析整个列表项，又把这些
  子节点解析成普通段落，导致同一内容出现“列表格式一份 + 纯文本一份”。
- 新增共享候选节点过滤规则：列表项已经包含的排版子节点不再二次生成块；嵌套列表项、表格、
  图片及列表外段落继续保留。
- 文档中心完整编辑器和 `DocumentBodyEditor` 共用该规则，避免目标、周报、经营周会粘贴行为漂移。

### 已验证

- Wolai 列表结构回归测试通过，确认 `<li>` 内 `div/p` 被过滤，嵌套表格和图片保留。
- 剪贴板目标测试 17/17 通过；前端全量 23 个套件、121 条测试通过。
- `BUILD_PATH=/tmp/relation-wolai-paste-fix-build npm run build` 通过。
- 本机 `3001` 后端未运行，未执行登录后的浏览器端到端粘贴；前端登录页与开发服务可正常加载。

## 全系统业务时间统一（2026-07-23）

### 根因

- MySQL `CURRENT_TIMESTAMP` 使用服务器本地时间，但 `server/lib/database.js` 将
  `new Date().toISOString()` 去掉 `Z` 后原样写入 `DATETIME`，把 UTC 钟面误当北京时间存储。
- 同一张表中因此混有正确的本地时间和少 8 小时的 UTC 时间：媒体新增记录通常正确，编辑记录、
  文档自动保存、目标、周报和经营周会等显式更新时间会显示为凌晨。
- 文档中心还单独把所有无时区数据库值当 UTC 解析，导致默认时间与显式时间的展示规则继续分裂。

### 已完成

- 新增 `server/lib/businessTime.js`：统一解析 `MYSQL_TIMEZONE`，默认 `+08:00`；`Date` 和带
  `Z`/偏移的 ISO 时间先转换为业务本地时间再写入 MySQL，无时区值保持原业务钟面。
- `mysql2SyncWorker` 建立连接后显式执行 `SET time_zone`，保证 `NOW()`、
  `CURRENT_TIMESTAMP` 和显式参数不再受 MySQL 主机全局时区影响。
- 修复在线表格 `nextDocumentUpdatedAt` 的单调递增计算：无时区 MySQL 时间按配置时区还原为绝对
  时间，避免统一写入层后再次多加 8 小时。
- 新增一次性迁移 `business-time-explicit-utc-to-local-v1`，记录在 `relation_migrations`；仅当
  编辑记录、内容版本或操作日志与业务记录相差 7-9 小时时，才校正媒体、文档、目标、周报、
  经营周会、任务、待跟进任务和手机采集时间，正确记录保持不变，重复启动不重复执行。
- 新增 `client/src/utils/businessTime.js`，统一处理无时区数据库时间和带时区实时事件；媒体管理、
  文档中心、操作日志、系统设置、主体管理、网络抓包、Agent、AI 训练台和手机采集已切换到共享
  格式化工具。文档中心移除“所有无时区时间都是 UTC”的旧兼容分支。
- 全仓检查其余时间展示：目标、周报、经营周会、预算、任务、待跟进、策略、公司、人脉等页面
  的完整时间展示均切换到共享工具；绝对 ISO 事件统一转换到 `Asia/Shanghai`。

### 已验证

- 修复前隔离 MySQL 探针：同一次操作 `CURRENT_TIMESTAMP=2026-07-23 12:14:52`，显式 ISO 参数
  存成 `2026-07-23 04:14:52`；修复后 MySQL session=`+08:00`，两者均为
  `2026-07-23 12:20:41`。
- 时间迁移隔离 MySQL 测试通过：构造 `02:29` 错值与 `10:29` 审计证据后，相关业务记录均校正；
  无偏差媒体记录保持不变，第二次执行返回 `already-applied`。
- 真实隔离 MySQL 3/3 通过：业务时间迁移、在线表格导入导出/协作权限、出差统计接口。
- 前端全量测试 23 个套件、120 条通过；后端全量测试 85 条通过、3 条按环境开关跳过；业务时间
  目标测试 6/6 通过。
- `BUILD_PATH=/tmp/relation-business-time-build-final npm run build` 通过；性能门禁实测首屏 JS
  `327.9KB gzip`、75 个异步 chunk、最大异步 chunk `419.9KB gzip`，继续满足既定预算。

## 全系统性能门禁（2026-07-22）

### 已完成

- `client/src/App.js` 将 43 个一级页面改为 `React.lazy` 路由懒加载，路由切换统一使用轻量加载态；
  首屏不再同步打包全部业务页面。
- 页面首次完成路由权限校验、异步 chunk 加载并提交渲染后，写入
  `data-relation-route-ready` / `data-relation-route-ready-ms`；首次加载超过 `1000ms` 时输出
  `[page:slow]`，SPA 后续导航不混入页面生命周期累计耗时。
- 新增前端构建体积门禁：首屏 JavaScript gzip `<=400KB`、单个异步 chunk gzip `<=500KB`、
  首屏仅一个 JS 入口且至少 10 个异步 chunk；命令为
  `BUILD_PATH=/tmp/relation-build npm run performance:frontend`。
- 新增 API 性能审计，覆盖 49 个主要只读接口，每个接口先预热再采样，任一 `5xx` 或 p95 超过
  `300ms` 即失败；命令为 `npm run performance:api`。
- 所有服务端响应增加 `Server-Timing` 和 `X-Response-Time`，超过
  `RELATION_API_RESPONSE_BUDGET_MS`（默认 `300ms`）记录 `[http:slow]`，不记录请求正文。
- 生产静态资源按内容哈希长期缓存：`static/*` 使用一年 immutable，`index.html` 禁止缓存；新增
  `RELATION_CLIENT_BUILD_DIR` 支持从 `/tmp` 挂载隔离构建。
- 修复 `/api/trips/stats/summary` 在 MySQL 使用 SQLite `julianday`、对密文
  `related_persons` 做 SQL `LIKE` 导致的稳定 `500`：改为按权限读取目标人员、解密关联人员并在
  内存计算最近出差日期。新增真实隔离 MySQL/HTTP 回归测试。

### 已验证

- 隔离 MySQL `relation_test`、独立生产服务 `3103`：49/49 个主要 API 通过 p95 `300ms` 门禁；
  最慢 `/users?limit=100` 为 `19.8ms`，`/stats` 为 `18.5ms`，
  `/trips/stats/summary` 为 `15.3ms`。
- 生产构建体积门禁通过：首屏 JS `323.6KB gzip`，75 个异步 chunk，最大异步 chunk
  `419.9KB gzip`；优化前首屏约 `1.33MB gzip`。
- 浏览器直达登录页及 44 个登录后静态路由：登录页约 `96.5ms`，登录后页面最慢约 `128ms`，
  均低于 `1000ms`；累积 44 个工作区标签后的文档中心压力复测为 `877.7ms`。该指标来自页面内
  路由可用标记，不包含浏览器控制通道的外部遥测等待。
- `index.html` 返回 `no-store, no-cache`；带哈希主包返回
  `public, max-age=31536000, immutable`；API 计时头实测正常。
- 性能单元测试 7/7、出差统计隔离 MySQL 集成测试 1/1、前端全量测试 22 个套件 117 条、
  后端全量测试 80 条通过（另 2 条显式 MySQL 测试按环境开关跳过）；生产构建和所有
  `node --check` 通过。

### 边界

- `300ms` / `1s` 是隔离 MySQL、预热服务、当前测试数据和生产构建下的工程门禁，不是对生产
  网络、冷启动、客户端硬件、第三方服务或无限数据量的绝对保证；上线后仍需持续观察慢请求日志
  和真实用户页面指标。

## 文档中心附件上传 413 修复（2026-07-22）

### 已完成

- 将服务端单文件上传默认上限从 100MB 提升到 500MB，支持通过
  `RELATION_UPLOAD_FILE_SIZE_LIMIT` 或 `RELATION_MAX_UPLOAD_FILE_SIZE` 覆盖，便于上传较大的
  APK/AAB/IPA 安装包。
- `multer` 文件超限统一返回 `413 UPLOAD_FILE_TOO_LARGE`，附带当前限制，文档中心附件块上传
  失败时显示明确中文提示，不再只展示 Axios 的 `Request failed with status code 413`。
- 文档中心附件新增分片上传兜底：超过 8MB 的附件按 768KB 顺序分片上传，再由服务端校验总大小、
  合并并写入原附件表，避免 25MB APK 因代理单请求体限制直接返回 413。
- 分片临时目录按文档、用户和上传 ID 隔离，合并成功或异常失败后自动清理。
- Wolai MCP 远程图片抓取限制从通用附件上传上限中解耦，默认继续按 100MB 兜底，避免放大服务端
  远程下载风险。

### 已验证

- `node --check server/index.js` 通过。
- `cd client && CI=true npx react-scripts test --watchAll=false --runInBand src/utils/documentHistory.test.js src/utils/documentKind.test.js` 通过。
- `cd client && BUILD_PATH=/tmp/relation-document-attachment-chunk-build npm run build` 通过。

### 本轮任务文件

- `server/index.js`
- `client/src/pages/Documents.js`
- `handoff.md`

## 媒体关联文档 Wolai MCP 导入格式修复（2026-07-22）

### 已完成

- 修复 `server/lib/wolaiMcpImport.js`：Wolai MCP 导入的折叠列表和折叠标题在缺少明确折叠状态时默认展开，避免首次导入后大量子块被隐藏。
- 新增 `server/lib/wolaiMcpImportFoldState.test.js`，覆盖 Wolai 折叠列表导入后展开、保留 `hasChildren` 和子块缩进。
- 修复 Wolai `todo_list` 父子树导入：待办块现在会按 Wolai 父子关系写入 `meta.indent`，保留 0/1/2/3 级层级。
- 修复 Wolai `callout` 导入：callout 现在映射为 Relation 强调块，并把子段落合并到同一个块内，避免灰底区域被拆散。

### 已验证

- `node --test server/lib/wolaiMcpImportFoldState.test.js server/lib/wolaiMcpImport.test.js server/lib/mediaManagement.test.js` 通过，13/13。
- `node --check server/lib/wolaiMcpImport.js` 通过。
- `node --check server/index.js` 通过。
- 使用真实 Wolai 页面只读导入摘要校验：99 个块，包含 19 个折叠列表、14 个待办、3 个强调块、8 张图片、2 个视频、1 个表格；待办缩进集合为 0/1/2/3，截图中的“媒体要求”合并为单个强调块。测试输出未记录 Token 或完整正文。

### 本轮任务文件

- `server/lib/wolaiMcpImport.js`
- `server/lib/wolaiMcpImportFoldState.test.js`
- `handoff.md`（仅记录本轮验证，不随本次提交暂存，避免混入既有未提交交接差异）

## 文档中心在线表格文档（2026-07-22）

状态：文档中心在线表格第一至四期开发和独立验收已完成；文档形态、可编辑网格、公式、排序筛选、
冻结、合并、Excel 导入导出、大表虚拟滚动、原子 operation、在线成员与 SSE 均已落地，准备随
本次提交交付到 `gitee/main`。

目标：在文档中心新增类 Excel / 石墨表格的在线表格文档形态，复用现有标题、文件夹、共享、
收藏、历史、权限和多人更新底座，并与普通文档块编辑器保持兼容。

## 响应变慢排查与修复（2026-07-22）

### 已完成

- 排查 2026-07-21 提交后全系统响应变慢，定位到操作日志中间件会对所有写请求的 `req.body`
  递归清洗并 JSON 序列化；文档/在线表格自动保存携带大 `content` 工作簿时，会在 Node 主线程
  遍历大量 `blocks/cells`，导致写请求和同进程其他响应变慢。
- 修复 `server/index.js` 的日志清洗逻辑：对 `content`、`content_json`、历史快照、workbook、
  blocks、cells、html、markdown、payload 和二进制文件字段只记录摘要，不再深度遍历正文。
- 同步处理 2026-07-21 媒体文档归档改动的启动扫描风险：`media_assets.document_id` 补充显式索引，
  降低启动归档检查和媒体文档关联查询成本。
- 继续排查本次用户反馈的工作台 3 分钟 loading 和文档中心更慢问题，定位到旧文档
  `content_text` 启动回填会同步读取并解析全部 `documents.content`，大 Wolai 文档/表格文档会阻塞
  服务启动和事件循环。
- 将文档 `content_text` 回填改为服务监听后后台小批次执行，默认每次最多 20 条，并在存在
  `document_kind` 字段时跳过在线表格工作簿，避免启动阶段全量解析大正文。
- 文档详情页编辑记录列表不再 `SELECT e.*` 读取最近 80 条完整 `content_before/content_after`；
  列表只读元数据和快照存在标记，恢复单条记录时才读取完整快照。
- 文档编辑记录对大正文快照增加 512KB 默认上限，避免每次自动保存把大文档正文复制两份写入
  `document_edit_records`，保留 diff 和正文文本用于审计展示。
- 工作台数据加载改为并发 `Promise.allSettled`，并给提醒、任务、跟进和关注任务请求加受控
  `limit`；单个接口失败或变慢不再锁住整个工作台 loading。
- 为工作台常用查询补充任务、待跟进、提醒和关注人组合索引，降低列表、关注和提醒查询成本。

### 已验证

- `node --check server/index.js` 通过。
- `node --test server/lib/mediaManagement.test.js server/lib/mediaManagementRouter.test.js` 通过，8/8。
- `cd client && CI=true npx react-scripts test --watchAll=false --runInBand` 通过，19 个套件、102 条测试。
- `cd client && BUILD_PATH=/tmp/relation-performance-build npm run build` 通过。
- `PORT=3102 NODE_ENV=test RELATION_DB_PATH=/tmp/relation-performance-smoke.db node server/index.js` 隔离库启动冒烟通过，
  约 1.1 秒开始监听。
- `git diff --check -- server/index.js server/lib/mediaManagement.js server/lib/mediaManagement.test.js` 通过。

## 文档中心在线表格文档（2026-07-22）

### 已完成

- 新增 `文档中心-在线表格文档PRD.md`，明确在线表格是独立文档形态，不是普通文档内嵌表格块。
- 更新 `文档中心模块PRD.md`，新建文档入口默认普通文档，并支持选择在线表格。
- 更新 `AGENTS.md`，固化 `document_kind=rich_text/spreadsheet` 与 `doc_type` 业务分类的边界。
- 服务端 `documents` 表新增 `document_kind`，旧数据默认 `rich_text`，并在加列后创建索引，兼容旧库增量启动。
- 新建文档接口支持 `document_kind=spreadsheet`，自动初始化
  `relation_spreadsheet_workbook_v1` 工作簿和 `工作表1`。
- 文档列表接口和序列化结果返回 `document_kind`，旧值统一规范为 `rich_text`。
- 文档中心前端新增新建下拉：主按钮仍默认普通文档，菜单可选普通文档或在线表格。
- 新建弹窗新增“文件形态”；编辑文档属性时只读展示，不允许直接切换普通文档/在线表格。
- 列表、Tab 和详情页对在线表格显示表格图标或“在线表格”标签。
- 在线表格详情页复用文档中心头部治理信息，正文区域切换为表格工作区骨架：菜单栏、工具栏、
  公式栏、网格和底部 Sheet 标签。
- 保存、标签关闭、标题自动保存和多人轮询同步对在线表格做分支保护，避免把 workbook 内容
  覆盖为普通文档 blocks。
- 在线表格支持点击单元格选中、直接编辑当前单元格，公式栏同步显示并可编辑当前单元格内容。
- 单元格内容写入 `relation_spreadsheet_workbook_v1.sheets[].cells`，并生成 `content_text` 供搜索、
  摘要和保存校验使用。
- 底部 Sheet 标签支持新增、切换、双击重命名、右键重命名和右键删除；至少保留一个工作表。
- 在线表格内容签名已加入自动保存依赖，单元格或工作表改动会进入现有自动保存链路。
- 在线表格支持从 Excel/石墨等外部表格复制 TSV 文本后，从当前单元格开始批量粘贴。
- 在线表格支持复制当前单元格，写入纯文本和 HTML table fallback。
- 工具栏支持插入行、删除行、插入列、删除列，并按 A1 坐标迁移现有单元格。
- 工具栏支持当前单元格加粗、填充浅黄色、清空内容和清除格式。
- 在线表格工作簿纯逻辑已抽到 `client/src/utils/spreadsheetWorkbook.js`，页面不再内嵌公式、
  排序筛选和行列迁移实现；网格交互抽到 `client/src/components/SpreadsheetDocumentEditor.js`。
- 支持鼠标拖拽多单元格选区、Shift 扩选、方向键移动、Delete 清空、双击编辑；复制选区输出
  TSV 和 HTML table，粘贴矩阵从当前单元格开始展开。
- 支持公式原文和计算值分离，覆盖单元格/区域及跨 Sheet 引用、四则运算、比较和常用统计函数；
  循环引用、除零、非法名称、非法引用和类型错误显示明确错误码。
- 支持按当前列对选区或已用区域升序/降序排序；文本首行自动作为标题保留；支持筛选为当前值、
  多列筛选条件叠加和清除筛选。
- 支持冻结至当前行/列、同时冻结和取消冻结，冻结上限为前 100 行、50 列；支持选区合并与
  取消合并，非左上角存在内容时二次确认。
- 支持拖拽调整列宽和行高，支持 75%/100%/125%/150% 缩放。
- 网格改为行列双向虚拟渲染，工作簿行列数量不再受原 28 行、14 列显示上限约束。
- 新增在线表格 Excel 文件接口：可编辑用户可导入 `.xlsx/.xlsm`，可见用户可导出 `.xlsx`；
  服务端沿用 JSZip，不新增前端 Excel 依赖，导入临时文件解析后立即清理。
- Excel 导入导出保留多 Sheet、普通/共享公式、基础加粗与填充色、行高列宽、冻结和合并区域；
  `.xlsm` 不保留 VBA 宏。导入限制为 10 万行、2000 列、30 万个非空单元格和解压后 200MB；
  单个公式最多展开 10 万个单元格，并限制公式长度和递归深度。
- Excel 导出前强制完成当前文档保存，避免下载到上一次已保存版本；导入后进入现有自动保存链路。
- 联调修复普通键盘编辑错误提示“已粘贴单元格”：单值输入和单值粘贴保留输入框原生行为，
  只有多行/多列矩阵进入区域粘贴与成功提示。
- 在线表格新增独立工作簿撤销/重做栈；公式栏、单元格内编辑按一次提交记录，排序、合并、
  行列增删和 Sheet 管理等离散操作也进入历史，支持 `Cmd/Ctrl+Z`、`Shift+Cmd/Ctrl+Z` 和 `Ctrl+Y`。
- 工作表名称统一限制为空值、31 字符、Excel 非法字符、首尾单引号和不区分大小写重复；
  新建 Sheet 自动选取未占用编号，前端重命名和服务端保存边界同时拒绝非法名称。
- 重命名工作表会在同一事务内迁移全部跨 Sheet 公式，兼容中文、空格、单引号、范围引用和
  多公式，并跳过字符串字面量及相似名称；撤销/重做同时恢复名称和公式。
- Sheet 切换不再占用撤销步骤；仅修改名称大小写以及旧工作簿中的原始字符串公式也会迁移。
  在线表格历史恢复复用同一服务端名称校验，非法旧快照不能重新写回数据库。
- 公式错误在算术与聚合函数中原样传播，自引用 `=E2+1` 和区域循环引用均显示 `#CYCLE!`，
  不再被错误转换为 `#VALUE!`。
- 行列插入/删除改为带 Sheet 上下文迁移整个工作簿公式，兼容绝对引用和跨 Sheet 区域引用；
  不再误改公式字符串、`Sheet1` 名称或 `Sheet10` 相似名称。名为 `TRUE/FALSE` 的 Sheet 可被
  正常引用，比较和字符串拼接也会保留上游公式错误码。
- 工作簿撤销/重做改用序列化快照，最多保留最近 30 步并限制约 24MB 历史容量；超大工作簿
  至少保留最近一步，小表仍支持多步撤销，避免 80 份完整对象放大浏览器内存。

### 已验证

- `node --check server/index.js` 通过。
- `git diff --check` 通过。
- `cd client && BUILD_PATH=/tmp/relation-spreadsheet-doc-kind-build npm run build` 通过。
- `cd client && BUILD_PATH=/tmp/relation-spreadsheet-editable-mvp-build npm run build` 通过。
- `cd client && BUILD_PATH=/tmp/relation-spreadsheet-grid-tools-build npm run build` 通过。
- 在线表格工作簿前端单元测试 9 条通过，覆盖坐标、公式、跨 Sheet、错误、排序、筛选、合并和行列迁移。
- 在线表格组件虚拟化测试 1 条通过：10 万行、500 列工作簿只渲染视口附近单元格并显示公式结果。
- Excel 工作簿服务端往返测试 1 条通过，覆盖多 Sheet、公式、样式、行高列宽、冻结和合并。
- READY-TEST-5：公式栏与单元格内编辑撤销/重做回归通过。
- READY-TEST-6：工作表命名、重命名公式迁移、迁移撤销/重做、循环引用错误传播回归通过；
  前端目标 20 条、服务端 Excel 目标 2 条全部通过。
- READY-TEST-8：Sheet 切换不占撤销步骤、大小写重命名、旧字符串公式迁移及非法历史恢复保护
  回归通过；前后端全量测试再次通过。
- READY-TEST-9：行列结构变化的跨工作簿公式迁移、绝对引用、字符串与相似 Sheet 名隔离、
  `TRUE/FALSE` Sheet 引用及比较/拼接错误传播回归通过。
- READY-TEST-10：工作簿历史改为带条数和容量上限的序列化快照，连续 35 次提交后仅保留最近
  30 步撤销的行为回归通过。
- READY-TEST-11：Chrome 真实页面完成公式栏循环引用、撤销/重做、跨 Sheet 重命名公式迁移、
  切换 Sheet 后撤销及移动端布局回归；测试数据清理并经 API/MySQL 持久化结果确认。
- READY-TEST-12：使用 `doc=2` 真实旧历史记录 31 验证重复 Sheet 名快照恢复返回 `400`；
  拒绝前后文档 `updated_at` 和完整 `content` 保持一致。
- 隔离 MySQL 与真实 HTTP 权限矩阵通过：未登录导入/导出 `401`；管理员导入/导出 `200`；
  被共享的 `readonly` 用户读取/导出 `200`、导入 `403`，导出文件回读保留 Sheet 和公式原文。
- 服务端重复 Sheet 名负向保存返回 `400 工作表名称不能重复`，原工作簿保持不变。
- 已知重复 Sheet 名的旧页面快照恢复返回
  `400 历史版本无法恢复：工作表名称不能重复`；接口调用前后当前文档更新时间、Sheet 名和完整
  工作簿 JSON 均未变化。
- Chrome 桌面页实测 `=E2+1` 显示 `#CYCLE!`，`Cmd+Z` 清空、`Shift+Cmd+Z` 恢复；源 Sheet
  从“保存测试”改为“源 数据”后，公式迁移为 `='源 数据'!A1` 且结果保持 `FIRST`，切换 Sheet
  后一次撤销直接恢复名称和公式，重做再次迁移。
- READY-TEST-13：共享 `readonly` 账号打开在线表格后，Excel 导入、行列增删、格式、排序筛选、
  冻结、清空和新增 Sheet 均不可操作，公式栏保持只读且双击单元格不进入编辑态；Excel 导出仍可用。
- READY-TEST-13：管理员在 `doc=3` 写入 `L19=AUTOSAVE_REFRESH_READY13` 后等待自动保存并刷新，
  单元格值仍存在；测试值随后清空并再次刷新确认已持久化还原。
- READY-TEST-13：通过服务端模拟另一位协作者向 `doc=3` 的 `M20` 写入唯一标记，当前页面未刷新即
  在 5 秒轮询窗口内显示远端值；服务端恢复原工作簿后，页面同样自动移除该值，测试数据已清理。
- READY-TEST-14：新增真实 MySQL 权限接口测试，每次运行创建随机临时库和临时服务，通过实际
  multipart `.xlsx` 与二进制下载覆盖未登录导入/导出 `401`、管理员导入/导出 `200`、共享
  `readonly` 用户读取/导出 `200` 和导入 `403`；导出回读继续保留 Sheet 名与公式原文。
- READY-TEST-14：权限测试清理阶段会终止临时服务并删除临时 MySQL 库；退出流程同时覆盖
  `SIGTERM` 超时后的 `SIGKILL` 兜底，测试无需 `--test-force-exit` 即可自然结束。
- READY-TEST-15：Excel 导入/导出图标按钮增加明确可访问名称；隐藏文件输入在只读状态同步禁用，
  `change` 回调再次检查 `canEdit`，组件测试覆盖可编辑用户导入/导出回调和只读用户导入拦截、
  公式栏只读、双击单元格不进入编辑态及导出仍可用。
- READY-TEST-15：修复 Sheet 重名校验抛 rejected Promise 导致开发环境整页运行时错误层；重命名
  弹窗改为手动控制关闭，重复名称时在输入框下显示“工作表名称不能重复”、保留弹窗和原工作簿，
  不再抛异常。组件回归和 `doc=2` 真实页面复现路径均通过，弹窗已取消且未写入测试数据。
- READY-TEST-16：移除 Sheet 重命名输入框先行静默截断的 `maxLength=31`，超长名称现在完整进入
  统一校验并明确显示“工作表名称不能超过 31 个字符”。组件测试连续覆盖空值、32 字符、Excel
  非法字符、首尾单引号、重复名称，以及报错后改成合法名称可正常保存和关闭弹窗。
- READY-TEST-16：`doc=2` 真实页面输入 32 字符后保留完整输入并显示明确错误，弹窗仍可操作、
  页面无运行时错误层且原 Sheet 名不变；测试弹窗已取消，没有写入测试数据。
- READY-TEST-17：修复在线表格轮询发现远端更新时无条件替换工作簿、清除本地 dirty 导致未保存
  单元格静默丢失的问题；新增基于稳定 Sheet ID 和单元格键的 workbook 三方合并，不同位置自动
  合并，同一位置冲突保留本地，Sheet 删除与另一端修改冲突时保留已修改版本并提示用户。
- READY-TEST-17：远端完整 workbook 加入协作基线；本地 dirty 合并后不再被清除，保存签名改用
  远端原始版本，现有防抖自动保存会使用远端新 `updated_at` 提交合并结果。工具函数测试覆盖
  不同单元格、同一单元格和 Sheet 删除/修改冲突。
- READY-TEST-17：修复虚拟网格 scroll state updater 延迟读取已清空 `event.currentTarget` 导致的
  `Cannot read properties of null (reading 'scrollTop')` 整页错误层；滚动偏移在事件回调内同步捕获，
  组件测试覆盖滚动后立即卸载。
- READY-TEST-18：修正三方合并中“本地清空单元格、远端修改同一单元格”错误保留远端值的语义；
  本地清空现在与普通本地输入一致，作为有效本地修改优先。Sheet 级删除/修改冲突单独保留修改侧，
  避免整表数据丢失。测试覆盖本地删单元格、远端改同单元格，以及双向 Sheet 删除/修改冲突。
- READY-TEST-18：`doc=3` 真实双写验证中远端修改 `A1`、本地同步前清空 `A1`，页面保持为空且
  API 最终不存在 `A1`；随后恢复原工作簿，页面重新显示 `FIRST`，测试标记已清理且无错误层。
- READY-TEST-19：修复快速连续新增 Sheet 时裸 `Date.now()` 可能生成重复 ID、normalize 虽修正
  第二个 ID 但 `activeSheetId` 仍错误指向前一个 Sheet 的问题；新增 ID 现在基于 `workbookRef`
  当前 Sheet 集合显式去重，新增按钮补充“新增工作表”可访问名称。
- READY-TEST-19：组件测试固定 `Date.now()` 连续触发两次新增，验证名称依次为工作表2/3、三个
  Sheet ID 全部唯一，新增 ID 分别带基础值和递增后缀，活动 Sheet 正确指向最后新增项。
- READY-TEST-20：服务端工作簿校验新增 Sheet ID 非空、同一工作簿内唯一以及 `activeSheetId`
  必须指向现有 Sheet；重启后的真实 `3001` 与独立 QA 均验证三种非法结构返回 `400`，请求前后
  `doc=2` 内容 SHA-256、原始 content 和 `updated_at` 完全不变。
- READY-TEST-20：同单元格冲突提示接入在线表格工作区 Alert，并增加 8 秒 warning toast 兜底；
  `409 DOCUMENT_CONFLICT` 直接消费响应中的 `latest` 快照，不再因轮询锁跳过合并提示，合并后的
  表格自动保存成功不再立即清空提示。组件测试覆盖提示在合并工作簿更新后继续可见。
- READY-TEST-21：本地工作簿回调改为同步标记 dirty 并更新活动编辑器快照，避免 React effect
  尚未执行时手动保存或远端轮询误判本地没有修改；提示文案按同格冲突、一般并发和纯远端同步
  分别生成。
- READY-TEST-21：冲突提示改为绑定文档 ID 的独立状态，并由 `Documents` 表格工作区稳定层直接
  渲染 Alert；网格 workbook 重建、合并后的自动保存和文档选择状态刷新不再清除提示，其他文档
  也不会误显示该提示。
- READY-TEST-21：真实 `doc=3` 联调取得外部管理员 PUT `200` 与页面本地 PUT `409` 的连续证据；
  同一 `I18` 冲突后页面及 API 均保留本地值，完整“修改了相同表格位置”提示立即出现，并在同一
  页面动作内等待 4.5 秒后仍可见。所有联调标记及临时状态码日志均已清理。
- READY-TEST-22：服务端新增在线表格检索文本生成器，按 Sheet 顺序和单元格行列顺序提取名称、
  坐标及原值并限制为 20,000 字；新建在线表格省略 `content_text` 时直接从工作簿生成。
- READY-TEST-22：`PUT /api/documents/:id` 与 `PUT /api/documents/:id/content` 在提交新工作簿但省略
  `content_text` 时不再回退旧索引；页面历史恢复也会从目标工作簿重建，避免已删除单元格继续残留
  在搜索、摘要和 AI 输入中。普通文档及显式提交当前表格计算文本的行为不变。
- READY-TEST-23：新增 `POST /api/documents/:id/spreadsheet/operations`，首期支持原子批量
  `set_cell`；每个操作使用稳定 Sheet ID、A1 坐标和 `before/after` 快照。旧文档基线修改不同单元格
  可直接合并，同格已变化时返回带冲突位置和当前快照的 `409 SPREADSHEET_OPERATION_CONFLICT`。
- READY-TEST-23：operation API 支持最终状态幂等重试；当前单元格已等于 `after` 时返回成功且不
  重复更新时间。单批限制 500 项、单格快照 16KB、坐标 10 万行 x 2000 列；操作正文从系统操作
  日志中摘要化。成功保存同步维护工作簿、检索文本、摘要和页面编辑记录。
- READY-TEST-24：前端自动保存新增工作簿差异规划。标题和结构未变、差异不超过 500 个单元格时
  调用 operation API；标题、Sheet、行列、列宽行高、冻结、筛选、合并等结构变化和超限批次继续走
  原 `PUT /documents/:id/content`，撤销、公式、导入导出和关闭前保存的既有行为保持兼容。
- READY-TEST-24：operation 成功后只校验本批目标快照已经应用，并接受服务端响应中合并的其他远端
  单元格，把响应工作簿和 `updated_at` 更新为页面及轮询基线；operation 同格 `409` 复用现有三方
  合并、本地优先和绑定文档的 10 秒冲突提示。
- READY-TEST-25：operation API 扩展 `set_sheet_property` 与 `set_workbook_property`，支持名称、
  行列数量、行高列宽、合并、筛选、冻结、活动 Sheet、样式和定义名称，并可与 `set_cell` 组成一个
  原子批次。任一属性前置值冲突时整批不落库，冲突结果明确返回操作类型、Sheet 与属性。
- READY-TEST-25：前端在标题未变且 Sheet ID/顺序稳定时，把受支持的结构差异与单元格差异一并规划
  为最多 500 项 operation；Sheet 增删/重排、未知字段、16KB 单元格快照、256KB 属性快照或批次超限
  继续回退完整文档保存。Sheet 重命名由服务端同步迁移当前工作簿的跨 Sheet 公式，兼容并发新增公式。
- READY-TEST-25：修复仅样式或结构变化不生成页面编辑记录的问题。服务端不再只依据
  `content_text` 判定记录；工作簿实际变化但检索文本不变时，仍生成 `spreadsheet_operations`、
  “表格格式或结构已更新”摘要和可恢复快照。隔离 MySQL 回归覆盖公式文字不变、仅加粗的单元格。
- READY-TEST-26：修复 operation 自动保存后改动历史继续使用旧 `selectedDoc.edit_records` 的问题。
  打开历史现在先等待当前保存完成，再主动 GET 最新文档详情；刷新失败不会打开过期历史。历史按钮
  在请求期间显示 loading，避免重复触发。
- READY-TEST-27：新增在线表格 SSE 与 presence。服务端以内存 Hub 管理浏览器标签级会话，20 秒
  无心跳失效；可见用户通过带认证的 SSE 接收 presence 和 `document_updated`，每 10 秒复查权限，
  5 秒轮询继续兜底。presence 心跳与退出不写数据库、页面历史或操作日志。
- READY-TEST-27：表格组件回传完整拖拽选区并展示最多 3 个协作者头像；当前 Sheet 的远端选区
  使用协作者颜色描边和浅色背景。只读共享用户可上报选区但 operation 仍为 `403`；工作簿初始
  Sheet ID 与旧默认选择不一致时，以组件真实活动 Sheet 和完整选区为准。
- READY-TEST-28：operation API 新增 `add_sheet`、`delete_sheet` 和 `reorder_sheets`。新增携带完整
  Sheet 快照、目标位置与相邻稳定 ID；删除以完整旧 Sheet 为前置值；重排只调整目标 ID 集合在当前
  工作簿中的顺序投影，因此不同 Sheet 并发新增和旧基线重排可以合并，远端新增项不会被覆盖。
- READY-TEST-28：删除目标 Sheet 已被远端修改、相邻锚点失效或参与重排的 Sheet 集合发生远端结构
  变化时，整批返回 `409 SPREADSHEET_OPERATION_CONFLICT` 且不部分落库。结构快照沿用 256KB 单项
  限制，未知字段、快照或 500 项批次超限继续回退文档级保存。
- READY-TEST-28：Sheet 标签右键菜单增加“向左移动 / 向右移动”，移动与新增、删除共同进入工作簿
  撤销/重做栈及 operation 自动保存；结构操作生成 `spreadsheet_operations` 页面编辑记录和可恢复
  快照，删除历史显示“删除：工作表名”。
- READY-TEST-29：`add_sheet.after` 新增完整可写快照校验。服务端为精简 Sheet 补齐行高列宽、合并、
  筛选和冻结默认值；未知字段、非规范/越界坐标、超出声明行列或单格超过 16KB 均返回 `400`，
  工作簿原文与 `updated_at` 不变，不能利用 256KB 结构快照绕过单元格边界。
- READY-TEST-29：并发默认重名三方合并后，如果同一原子批次已计划把当前占名 Sheet 改为唯一
  名称，新增操作允许使用即将释放的名称；后续改名一旦前置值冲突仍整批回滚，避免客户端在
  “新增同名 -> 远端改唯一名”的合法重试中反复 `409`。
- 浏览器测试新增 Sheet、公式和重命名均通过撤销清理；自动保存后 API 回读 `doc=3` 仅保留
  Sheet“保存测试”及 `A1=FIRST`、`B1=SECOND_DURING_SAVE`。桌面和 390 x 844 移动端截图
  无控件重叠、截断或不可达操作；控制台仅有既有 Ant Design 弃用警告，无业务异常。
- READY-TEST-13 收尾再次运行前端全量测试，18 个测试套件、92 条测试全部通过。
- READY-TEST-13 收尾再次运行后端全量测试，51 条全部通过，包含共享、权限和本地监听集成测试。
- READY-TEST-14 服务端全量测试增加至 52 条并全部通过，其中在线表格权限测试在隔离 MySQL
  临时库执行；前端全量仍为 18 个测试套件、92 条全部通过。
- READY-TEST-15 前端全量测试 18 个测试套件、95 条全部通过；服务端全量仍为 52 条全部通过。
- `node --check server/lib/spreadsheetWorkbookFile.js`、`node --check server/index.js` 通过。
- READY-TEST-10 后隔离生产构建通过，输出到 `/tmp/relation-spreadsheet-ready10-build`。
- READY-TEST-13 隔离生产构建通过，输出到 `/tmp/relation-spreadsheet-ready13-build`。
- READY-TEST-14 隔离生产构建通过，输出到 `/tmp/relation-spreadsheet-ready14-build`。
- READY-TEST-15 隔离生产构建通过，输出到 `/tmp/relation-spreadsheet-ready15-build`。
- READY-TEST-16 前端全量测试仍为 18 个测试套件、95 条全部通过；隔离生产构建通过，输出到
  `/tmp/relation-spreadsheet-ready16-build`。服务端代码未变，沿用同一快照最近一次 52/52 全量结果。
- READY-TEST-17 前端全量测试 18 个测试套件、98 条全部通过；服务端全量 52 条全部通过；隔离
  生产构建通过，输出到 `/tmp/relation-spreadsheet-ready17-build`。
- READY-TEST-18 前端全量测试 18 个测试套件、98 条全部通过；服务端全量 52 条全部通过；隔离
  生产构建通过，输出到 `/tmp/relation-spreadsheet-ready18-build`。
- READY-TEST-19 前端全量测试 18 个测试套件、99 条全部通过；服务端全量 53 条全部通过；隔离
  生产构建通过，输出到 `/tmp/relation-spreadsheet-ready19-build`。
- READY-TEST-20 前端全量测试 18 个测试套件、100 条全部通过；服务端全量 55 条全部通过，其中
  在线表格权限测试使用随机隔离 MySQL 库；隔离生产构建通过，输出到
  `/tmp/relation-spreadsheet-ready20-build`。
- READY-TEST-21 前端全量测试 19 个测试套件、104 条全部通过；服务端全量 55 条全部通过，其中
  在线表格权限接口测试使用随机隔离 MySQL 库；`node --check server/index.js` 通过，隔离生产构建
  通过并输出到 `/tmp/relation-spreadsheet-ready21-build`。
- READY-TEST-22 前端全量测试 19 个测试套件、104 条全部通过；服务端全量 57 条全部通过，其中
  隔离 MySQL 真实 HTTP 回归覆盖内容接口、完整更新接口、搜索与历史恢复；隔离生产构建通过并输出
  到 `/tmp/relation-spreadsheet-ready22-build`。
- READY-TEST-23 前端全量测试 19 个测试套件、104 条全部通过；服务端全量 61 条全部通过。隔离
  MySQL 真实 HTTP 回归覆盖匿名 `401`、管理员 operation 成功、旧基线不同单元格合并、同格冲突
  原子拒绝、重复请求幂等和共享只读用户 `403`；隔离生产构建输出到
  `/tmp/relation-spreadsheet-ready23-build`。
- READY-TEST-22/23 独立 QA 验收通过：内容接口、完整更新、新建和历史恢复均不会残留旧
  `content_text`；operation API 的 401/403、不同格旧基线合并、同格 409 原子拒绝、幂等重试、
  清空索引、参数边界和操作日志脱敏全部通过，测试文档、用户及 marker 均已清理。
- READY-TEST-24 前端全量测试 20 个套件、107 条全部通过；后端全量 61 条全部通过；隔离生产构建
  输出到 `/tmp/relation-spreadsheet-ready24-build`。真实 `doc=3` 页面验证单元格写入与清空产生
  `spreadsheet_operations`，Sheet 重命名与恢复产生 `content_update`；最终 Sheet 名、A1、C2、
  工作簿、`content_text` 和搜索结果均已恢复，无 R24 marker。
- READY-TEST-25 前端全量测试 20 个套件、110 条全部通过；后端全量 64 条全部通过；隔离生产构建
  输出到 `/tmp/relation-spreadsheet-ready25-build`。真实临时文档依次验证仅样式加粗、冻结和 A 列宽
  均持久化并生成可恢复 `spreadsheet_operations`；Sheet 从 `R25源数据` 重命名为 `R25重命名`
  后，跨 Sheet 公式同步变为 `=R25重命名!A1` 且页面计算值仍为 15；新增 Sheet 回退
  `content_update`。浏览器无业务异常，临时文档 `doc=9` 已删除并确认返回 `404`。
- READY-TEST-26 前端全量测试 21 个套件、112 条全部通过；隔离生产构建输出到
  `/tmp/relation-spreadsheet-ready26-build`。真实临时文档先完成 A1 加粗 operation，服务端生成
  `spreadsheet_operations` 后不刷新页面直接打开改动历史，页签立即显示 1 条，摘要与恢复按钮均
  可见；临时 `doc=11` 已删除并确认返回 `404`。
- READY-TEST-27 前端全量测试 22 个套件、115 条全部通过；后端全量 67 条全部通过，其中真实
  MySQL/HTTP 回归覆盖匿名 SSE `401`、管理员 connected/presence、operation 更新广播、只读共享
  presence `200` 与 operation `403`，并确认 presence 操作日志为 0。隔离生产构建输出到
  `/tmp/relation-spreadsheet-ready27-build`。
- READY-TEST-27 真实双会话验证中，外部共享用户的 B2:C3 选区在管理员页面显示 1 个头像和 4 个
  高亮单元格；远端 E5 operation 后约 1 秒内出现在页面，快于 5 秒轮询。桌面与 390 x 844 移动端
  截图无菜单、公式栏、Sheet 或内容遮挡。临时 `doc=12`、用户 4、presence 和误生成的测试日志均
  已清理，文档回读 `404`，修复后连续 9 秒观察 presence 操作日志保持 0。
- READY-TEST-27 独立 QA 验收通过：双会话头像、B2:C3 四格高亮、128ms 远端 operation 同步、
  只读 SSE/presence 与 operation `403`、20 秒失效、坐标边界、匿名 `401` 和 presence 日志为 0
  均符合预期；QA 临时文档、用户、共享和 marker 已清理。
- READY-TEST-28 前端全量测试 22 个套件、117 条全部通过；后端全量 71 条全部通过，其中隔离
  MySQL/HTTP 回归覆盖结构批次、派生文本、可恢复历史、目标 Sheet 远端修改后的删除 `409` 和整批
  原子拒绝。隔离生产构建输出到 `/tmp/relation-spreadsheet-ready28-build`。
- READY-TEST-28 真实页面验证连续新增工作表2/3、右键移动、撤销/重做和删除均持久化为
  `spreadsheet_operations`；不刷新页面打开历史立即显示 5 条，删除记录摘要正确且恢复按钮可见。
  旧基线连续新增“并发远端/并发本地”均返回 `200`，第二次 `merged_remote_update=true`；旧基线重排
  原有 Sheet 后两个并发新增 Sheet 仍完整保留。桌面与 390 x 844 移动端无重叠，临时 `doc=13` 已
  删除并回读 `404`，页面无 runtime overlay，仅有既有 Ant Design 弃用警告。
- READY-TEST-28 独立 QA 验收通过：连续新增、右键移动、撤销/重做、删除后即时历史与恢复、270KB
  Sheet 回退 `content_update`、旧基线并发新增、带远端新增的顺序投影重排、修改后删除 `409`
  原子拒绝、重复名称与 256KB 上限均符合预期；临时 `doc=14`、搜索和 marker 已清理。
- READY-TEST-29 服务端目标测试 14 条、后端全量 74 条全部通过；隔离 MySQL/HTTP 回归额外验证
  越界 `add_sheet` 返回 `400` 且 content/`updated_at` 完全不变，精简合法 Sheet 规范化后可成功
  保存。前端代码未变，沿用 READY-TEST-28 的 22 个套件 117 条和生产构建结果。
- READY-TEST-29 最新 `3001` 真实烟测中，精简 Sheet 与同批释放名称的新增返回 `200`，最终名称为
  “工作表1 / 工作表2 / 工作表2 (2)”且默认结构字段完整；越界 `A100001` 返回 `400`，前后 content
  和 `updated_at` 完全相同。临时 `doc=15` 已删除并回读 `404`。
- READY-TEST-29 独立 QA 验收通过，无 P0-P3 缺陷：未知字段、小写坐标、全局越界、超出 Sheet
  声明尺寸和 17KB 单格均返回 `400`，且 content、`updated_at`、编辑记录逐次保持不变；精简
  Sheet 自动补齐结构字段并生成可恢复的 `spreadsheet_operations` 历史。
- READY-TEST-29 同批“新增占用名称 + 原 Sheet 改名释放”返回 `200` 且名称唯一；改名 `before`
  过期时整批返回精确 `409 SPREADSHEET_OPERATION_CONFLICT`，拟新增 Sheet 未部分落库；只读共享
  用户读取 `200`、operation `403`，非法、冲突和越权请求均不生成历史。
- QA 使用全新 marker 复核 `set_cell after=null`，响应、立即回读和延迟回读的工作簿及
  `content_text` 均同步清除，排除首轮复用夹具 marker 造成的假阳性。临时 `doc=16/17`、只读账号、
  共享和搜索 marker 已全部清理，两个文档均回读 `404`、搜索命中均为 0。
- 最终完成审计基于当前未提交工作树重新执行：后端在隔离 MySQL `127.0.0.1:3307` 上全量
  `74/74` 通过，包含真实权限和 HTTP 联调；前端全量 22 个套件、117 条通过，隔离生产构建成功
  输出到 `/tmp/relation-spreadsheet-final-audit-build`。该审计未修改测试数据；本次提交只纳入在线
  表格源码、测试和文档，不包含本地数据库、构建产物或其他任务改动。
- READY-TEST-21 联调结束后精确移除 `doc=3` 中遗留的两个 `LOCAL_WINS_R20_QA3` 单元格；API
  最终递归扫描 `R20/R21/LOCAL_WINS/REMOTE_LOST` 匹配数为 0，未残留本轮测试数据。
- READY-TEST-20 真实联调已取得外部管理员 `PUT /api/documents/3/content = 200` 和浏览器旧基线
  保存命中 `409 DOCUMENT_CONFLICT` 的双端证据；用于取证的服务端/前端临时日志均已删除并重启
  干净 `3001`。该检查点尚未稳定完成提示留存，已由 READY-TEST-21 的连续页面动作回归补齐。

### 后续阶段

- 第四期单元格、属性与 Sheet 增删重排 operation、前置值原子校验、远端不同位置合并、前端自动
  保存、在线成员/选区和 SSE 实时通知均已完成；5 秒轮询保留为断线兜底，超限批次继续复用文档级
  保存。READY-TEST-29 已完成独立回归并随本次提交交付；后续再评估批量协同性能和独立表格存储。
- 当前自研公式是安全的轻量计算器，不是完整 Excel 函数引擎；数组公式、数据透视表、图表、
  条件格式、复杂排序筛选和全函数集已确定纳入后续 Univer 正式替换路线。
- 后续根据工作簿体积和 operation 数量评估是否从 `documents.content` 迁移到独立
  `document_spreadsheets` 表。
- 当前联调使用隔离 MySQL `127.0.0.1:3307/relation_test`、前端 `3000`、后端 `3001`；测试数据
  包含 `doc=1` 公式往返样本和 `doc=2` QA 基础功能样本。联调后端必须确认 `3001` 仅有一个
  最新进程，避免请求落到旧进程。
- 前端开发服务对直接 HTTP 深链 `/documents?doc=2` 返回 404，但已打开的 SPA 路由可用；
  新开测试会话从 `http://localhost:3000` 进入文档中心再打开 QA 文档。
- Chrome 自动化在文件选择器调用 `DOM.setFileInputFiles` 时返回浏览器级 `Not allowed`，因此真实
  UI 选择本地 Excel 文件仍需 QA 手工补一次；同一文件的服务端导入、导出、回读及权限矩阵已通过。

### 本轮任务文件

- `AGENTS.md`
- `handoff.md`
- `文档中心模块PRD.md`
- `文档中心-在线表格文档PRD.md`
- `server/index.js`
- `server/lib/spreadsheetWorkbookFile.js`
- `server/lib/spreadsheetWorkbookFile.test.js`
- `server/lib/spreadsheetDocumentPermissionsIntegration.test.js`
- `server/lib/spreadsheetOperations.js`
- `server/lib/spreadsheetOperations.test.js`
- `server/lib/documentCollaboration.js`
- `server/lib/documentCollaboration.test.js`
- `client/src/api/index.js`
- `client/src/components/SpreadsheetDocumentEditor.js`
- `client/src/components/SpreadsheetDocumentEditor.test.js`
- `client/src/pages/Documents.js`
- `client/src/utils/documentHistory.js`
- `client/src/utils/documentHistory.test.js`
- `client/src/utils/documentKind.js`
- `client/src/utils/documentKind.test.js`
- `client/src/utils/spreadsheetDocumentDraft.js`
- `client/src/utils/spreadsheetDocumentDraft.test.js`
- `client/src/utils/spreadsheetWorkbook.js`
- `client/src/utils/spreadsheetWorkbook.test.js`
- `client/src/utils/spreadsheetOperations.js`
- `client/src/utils/spreadsheetOperations.test.js`
- `client/src/utils/spreadsheetPresence.js`
- `client/src/utils/spreadsheetPresence.test.js`

## 上一轮：媒体管理列表体验优化

状态：媒体管理列表字段体验优化已完成，准备随本次提交交付到 `gitee/main`。

目标：媒体管理列表不再默认平铺所有长字段，改为核心列默认展示、扩展列可配置、预算标签
折叠、表格密度可切换，并优化移动端卡片信息层级。

## 媒体管理列表体验优化（2026-07-21）

### 已完成

- 默认列表仅展示核心字段：CID、媒体、重要程度、类目、YYZ版本、展示样式、预算、对接进度、
  负责人、更新时间和上线时间。
- 增加“列设置”，支持用户勾选域名、版本号、最新支持功能、任务配置要求、特殊入口信息等
  扩展字段；配置保存到 `localStorage`。
- 增加标准/紧凑两种表格密度，配置保存到 `localStorage`。
- 预算字段在列表中最多展示 2 个标签，超出显示 `+N`，鼠标悬停可查看完整预算。
- 表格横向宽度按当前可见列自动计算，不再固定为全字段超宽表格。
- 移动端卡片改为媒体名 + 对接进度优先，补充 CID、类目、负责人、YYZ版本、展示样式、预算
  摘要和更新时间。
- 长字段仍在详情抽屉完整展示，不改变媒体详情、文档编辑、共享、历史等既有链路。

### 已验证

- `git diff --check` 通过。
- `node --check client/src/pages/MediaManagement.js` 通过。

### 环境限制

- 当前执行环境没有可用 `npm`、`yarn`、`pnpm`，且仓库没有 `node_modules`；内置 Node 运行时
  也不包含 React/AntD 构建依赖，因此本轮无法执行 `npm run build` 或前端组件测试。

### 本轮任务文件

- `client/src/pages/MediaManagement.js`
- `handoff.md`

## 媒体关联文档归档优化（2026-07-21）

### 已完成

- 媒体模块启动时确保 `产运 / 落地 / YYZ / 媒体对接` 文件夹路径存在并复用已有同名目录。
- 已有媒体关联文档幂等迁移到目标目录，编号重算为
  `D{序号}-DOMESTIC-OPS-IMP-{年份}`，同时更新为国内项目、产运、落地元数据。
- 新建媒体直接使用目标目录和 `DOMESTIC-OPS-IMP` 文档属性，不再创建 `GEN-ALL-MEDIA` 文档。
- 媒体关联文档的 `icon_key` 统一为空，因此收藏后在文档中心显示普通文档默认图标，不再显示
  播放箭头。
- 媒体身份和标题保护改为依据 `media_assets.document_id` 关系，兼容旧 `doc_type=MEDIA` 数据；
  类型迁移为 `IMP` 后仍不能从文档中心绕过媒体管理改名。
- 正文、附件、共享、收藏、历史记录及文档 ID 均原位保留。

### 已验证

- 真实 MySQL 旧数据验证：`D000470-GEN-ALL-MEDIA-2026` 成功迁移为
  `D000470-DOMESTIC-OPS-IMP-2026`，完整目录路径和 `icon_key=NULL` 均正确。
- MySQL 迁移扫描 1 条、更新 1 条耗时 `21ms`，服务总启动耗时 `2.53s`。
- 媒体目标测试 8 条通过；后端全量 45 条、前端全量 70 条全部通过。
- `node --check server/index.js`、`node --check server/lib/mediaManagement.js` 通过。
- 隔离生产构建通过，输出到 `/tmp/relation-media-document-placement-build`。

### 本轮任务文件

- `AGENTS.md`
- `handoff.md`
- `server/index.js`
- `server/lib/mediaManagement.js`
- `server/lib/mediaManagement.test.js`
- `server/lib/mediaManagementRouter.test.js`
- `资产管理模块PRD.md`

## 上一轮：生产启动故障（2026-07-21）

### 根因

- `7b6545f` 将文档默认共享迁移版本从 1 提升到 2，并首次为目标、周报补默认共享。
- 旧实现发生在 `app.listen()` 之前，并按每条文档、目标、周报逐条查询、插入、更新。
  生产 MySQL 数据量下会产生数万次同步数据库往返，进程长期无法监听 `3001`。
- 因进程是阻塞而不是立即抛错，所以没有“服务器启动”日志；Kubernetes 只看到
  readiness/liveness `connection refused`，随后杀掉新 Pod，旧 Pod 继续承载流量。

### 修复

- 新增 `server/lib/defaultShareMigration.js`，用固定数量的 MySQL
  `INSERT ... SELECT ... WHERE NOT EXISTS` 和集合更新完成三类历史数据迁移。
- 默认共享迁移增加开始、结束、耗时、统计和失败降级日志；非核心回填失败不再阻止服务监听。
- 服务进程启动与监听成功均输出阶段日志及总启动耗时，后续可直接判断卡在哪一段。
- 修正新建 `goals` 表缺失 `default_shares_initialized`、却误加到 `tasks` 表的 schema 问题。
- `AGENTS.md` 已改为 MySQL 单一数据库基准，不再要求新代码兼容 SQLite。

### 验证

- 隔离 MySQL 9.7 测试库：5,000 份文档、5,000 个目标、5,000 份周报首次迁移成功；
  新增 20,000 条文档共享和 40,000 条内容共享，待迁移记录均为 0。
- 上述 1.5 万条历史记录首次迁移耗时 `450ms`，服务总启动耗时 `2.991s`。
- 再次启动迁移耗时 `67ms`，服务总启动耗时 `2.506s`，重复执行不新增共享。
- `node --check server/index.js` 通过。
- 默认共享迁移单测 3 条通过；共享、历史两组后端集成测试及差异单测共 8 条通过。

### 交付

- 已随提交 `1ae5997 修复服务启动迁移阻塞` 推送到 `gitee/main`。
- 部署观察日志顺序：`process started` -> `legacy default-share migration finished` ->
  `server listening`，并确认新 Pod 探针健康。

## 上一轮：共享与页面编辑记录

### 已完成

- [x] 文档默认共享初始化改为版本化迁移，旧文档补齐缺失的默认 CXO；用户明确移除并保存后不再自动补回。
- [x] 文档、目标和周报默认共享人按陈锦标、陈豪赞、林璐韵、贺敏顺序显示为已选标签。
- [x] 目标和周报编辑弹窗内嵌完整共享编辑器，支持默认人员、项目组、部门、小组和个人。
- [x] 目标和周报新建时随主记录一次保存共享范围；编辑、关闭和自动保存时正确等待共享保存完成。
- [x] 通用历史抽屉新增“版本记录 / 页面编辑记录”，显示编辑人、时间、字段及修改前后值。
- [x] 服务端为目标、周报、经营周会准备、会议提纲和会议结论生成可读差异，且不返回原始历史快照。
- [x] 三个模块均可恢复旧版本；恢复会生成新版本，并立即同步列表和当前编辑器。
- [x] 周报恢复按钮服从服务端 `can_restore`，避免只读共享用户误看到恢复操作。

### 交付

- 已随提交 `7b6545f 优化共享与页面编辑记录` 推送到 `gitee/main`，无代码或测试遗留项。

### 已验证

- 前端全量测试：14 个测试套件、67 条测试全部通过。
- 后端全量测试：38 条测试全部通过。
- 浏览器：文档新建并保存后页头显示“共 4 人”，共享弹窗四位默认人员均为已选状态。
- 浏览器：目标和周报新建页均直接显示四类共享对象及四位默认人员，保存后共享关系落库。
- 浏览器：目标和周报二次编辑产生可读页面编辑记录，恢复旧版本后列表与编辑器同步更新。
- 浏览器：经营周会准备、会议提纲、会议结论三个 scope 均产生可读历史并成功恢复。
- 浏览器移动端：目标共享区域与历史抽屉在 390 x 844 视口无重叠、截断或不可达控件。
- 隔离生产构建：通过，输出到 `/tmp/relation-sharing-history-final-build`。
- `node --check server/index.js`、`git diff --check`：收尾时通过。

## 工作区提醒

- 存在其他会话的未提交修改；不要纳入本任务：`client/build/*`、`data.db`、
  `documentFolderPermissions*`、`server/lib/wolaiMcpImport.test.js`、`data-local.db*`、
  `.codex/skills/yyz-dashboard-analysis/`、`dataAnalysis/` 和若干业务 Markdown。
- `client/src/pages/Documents.js` 当前差异属于其他会话的文件夹权限与 Wolai 引用改动，本轮不要暂存。
- 文档默认共享人的本轮修复位于 `server/index.js` 的版本化迁移和共享初始化逻辑。

## 共享与页面编辑记录任务文件

- `AGENTS.md`
- `handoff.md`
- `client/src/components/ContentHistoryDrawer.js`
- `client/src/pages/Goals.js`
- `client/src/pages/OperationalMeeting.js`
- `client/src/pages/WeeklyReports.js`
- `client/src/utils/contentShares.js`
- `client/src/utils/contentShares.test.js`
- `server/index.js`
- `server/lib/contentRevisionDiff.js`
- `server/lib/contentRevisionDiff.test.js`
- `server/lib/contentSharingIntegration.test.js`
- `server/lib/documentCapabilitiesIntegration.test.js`

## 资产管理-媒体管理（2026-07-21）

状态：开发和自动化验证已完成；本节随提交“增加资产管理-媒体管理”交付到 `gitee/main`。

已完成：

- 新增 `/media-management` 菜单、路由、菜单权限配置和前后端 API。
- 新增 `media_assets` SQLite/MySQL 兼容表，CID 以文本保存 1-20 位数字并保留前导零。
- 完整支持媒体字段、枚举、预算多选、负责人、日期和长文本校验；敏感自由文本走统一 AES-GCM 字段加密。
- 列表展示全部字段，支持全字段及关联文档正文搜索、所有单选字段筛选、预算多选筛选、列宽拖动和移动端列表。
- 双击记录打开约 2/3 屏宽详情，上半部分展示媒体信息，下半部分嵌入完整文档中心编辑器。
- 每条媒体自动关联真实文档，复用块编辑、目录、附件、共享、版本记录、页面编辑记录和历史恢复。
- 媒体可见和编辑权限沿用关联文档；负责人自动加入共享；访客还需 `product_assets` 模块读权限。
- 媒体名称是关联文档标题的唯一来源；文档编辑或历史恢复不会造成标题分叉，删除关联文档会同步移除媒体记录。
- 更新 `资产管理模块PRD.md` 和 `系统需求与权限设计PRD.md`。

已验证：

- 媒体后端单元/无网络路由集成测试：7 条全部通过（含 SQLite 建表与 MySQL 字段翻译）。
- 暂存区独立代码树前端全量测试：14 个测试套件、67 条测试全部通过。
- 暂存区独立代码树后端全量测试：38 条中 35 条通过；其余 3 条原有监听端口集成测试因沙箱禁止 `127.0.0.1` 监听而报 `EPERM`，无业务断言失败。
- `node --check server/index.js`、媒体模块语法检查和 `git diff --check` 通过。
- 隔离生产构建通过，输出到 `/tmp/relation-media-management-final-build`。

环境限制：

- 当前执行沙箱禁止监听本地端口，因此无法启动前后端进行浏览器截图回归；生产构建和无网络路由集成测试已覆盖本轮可执行的核心链路。

本轮任务文件：

- `client/src/App.js`
- `client/src/api/index.js`
- `client/src/pages/Documents.js`（仅嵌入模式及媒体标题只读相关增量）
- `client/src/pages/MediaManagement.js`
- `client/src/pages/MenuPerms.js`
- `client/src/utils/mediaManagement.js`
- `client/src/utils/mediaManagement.test.js`
- `server/index.js`（仅媒体模块接入、文档标题保护和删除联动增量）
- `server/lib/encryptedFields.js`
- `server/lib/mediaManagement.js`
- `server/lib/mediaManagement.test.js`
- `server/lib/mediaManagementRouter.test.js`
- `资产管理模块PRD.md`
- `系统需求与权限设计PRD.md`

## 产品资产权限优化（2026-07-21）

状态：开发和验证已完成；本节随提交“优化产品资产入口用户可见权限”交付到 `gitee/main`。

已完成：

- 产品资产路由从模块权限门调整为菜单入口门：拥有 `/product-assets` 菜单入口的登录用户可以进入页面。
- 产品资产列表和详情取消负责人、创建人、小组、跨团队范围裁剪，改为拥有产品资产菜单入口即可查看全部产品资产内容。
- 产品资产、导入、核减新增/编辑/删除等写接口补充 `/product-assets` 菜单校验和 `canWrite` 校验，`readonly/guest` 只能查看。
- 产品资产页面按写权限隐藏新增、CSV 导入、编辑、删除、新增核减和新增关联策略等按钮，只保留详情查看。

已验证：

- `node --check server/index.js` 通过。
- 前端全量测试：15 个测试套件、70 条测试全部通过。
- 隔离生产构建通过，输出到 `/tmp/relation-product-assets-permission-build`。
- 后端 `node --test server/lib/*.test.js`：45 条中 42 条通过；3 条监听本地端口的既有集成测试因沙箱禁止 `127.0.0.1` 监听报 `EPERM`，无业务断言失败。

本轮任务文件：

- `client/src/App.js`
- `client/src/pages/ProductAssets.js`
- `server/index.js`
- `handoff.md`

## 媒体管理删除权限（2026-07-23）

状态：开发和验证完成，待提交并推送。

- 媒体删除仅允许 CXO，或 `role=leader` 且在 `teams.leader_id` 中实际负责“流量商务”商务小组的用户。
- 普通管理员、媒体创建人、共享协作者、预算商务组长和其他部门组长的列表中不渲染删除入口；
  直接调用删除接口统一返回 `403`。
- 服务端列表与详情的 `can_delete` 和 DELETE 接口复用同一策略，前端仅按服务端授权展示入口。

已验证：

- 媒体权限目标测试 12/12、前端媒体工具测试 4/4 通过。
- 前端全量 23 个套件、122 条测试通过；后端 89 条已执行测试通过，3 条隔离 MySQL 测试按环境
  开关跳过。
- 隔离生产构建和前端性能门禁通过：首屏 327.9KB gzip，最大异步 chunk 420.8KB gzip。
- 生产构建页面使用 `can_delete=0` 假数据回归：编辑入口正常，删除入口数量为 0，控制台无错误。

## 工作台商机任务操作与状态通知（2026-07-30）

状态：开发和验证完成，待提交并推送。

已完成：

- 工作台“需我执行”的商机待跟进任务不再显示独立“查看”按钮，改为复用普通任务操作：开始/恢复、
  挂起、完成、编辑、删除。
- 商机任务编辑入口仅维护计划日期和任务进度/结果，结果写入 `follow_up_tasks.done_note`；完成商机
  任务同样写入该字段。
- 商机待跟进任务支持删除接口，创建人/执行人可删除未开始任务，管理员不受状态限制；普通任务删除
  权限同步修正为创建人/执行人可删除未开始任务，保持前后端菜单口径一致。
- 普通任务或商机待跟进任务状态变化时，通知原任务创建人/商机任务指派人，通知类型统一为
  `task_status_updated`，自操作不通知。
- `NotificationBell` 增加 `task_assigned`、`opportunity_task_assigned`、`task_status_updated` 展示标签。
- `系统需求与权限设计PRD.md` 已补充工作台商机任务操作口径、普通任务删除权限和通知类型枚举。

已验证：

- `node --check server/index.js` 通过。
- `node --check server/lib/businessContactSearch.js` 通过。
- `cd client && CI=true npx react-scripts test --watchAll=false --runInBand --testPathPattern=Dashboard` 通过，1 个
  测试套件、4 条测试。
- `node --test server/lib/opportunityTypeIntegration.test.js` 通过，2/2，覆盖商机任务状态通知。
- `node --test server/lib/taskSharingIntegration.test.js` 通过，2/2，覆盖普通任务状态通知。
- `cd client && BUILD_PATH=/tmp/relation-dashboard-task-actions-build npm run build` 通过。
- `BUILD_PATH=/tmp/relation-dashboard-task-actions-build npm run performance:frontend` 通过：首屏 JS gzip
  `329.8KB / 400KB`，最大异步 chunk `420.8KB / 500KB`。

本轮任务文件：

- `client/src/api/index.js`
- `client/src/components/NotificationBell.js`
- `client/src/pages/Dashboard.js`
- `server/index.js`
- `server/lib/opportunityTypeIntegration.test.js`
- `server/lib/taskSharingIntegration.test.js`
- `系统需求与权限设计PRD.md`
- `handoff.md`
