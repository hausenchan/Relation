# AI训练台前端开发稿

> 版本：v0.1  
> 日期：2026-07-06  
> 技术栈：React + Ant Design + 现有 `client/src` 结构  
> 目标：将 `AI训练台原型设计稿.html` 拆成当前项目可直接开发的前端页面方案。

---

## 1. 页面定位

建议将 `AI训练台` 作为 `Agent 中台` 下的二级模块，但在当前项目里实现为一个独立页面，便于后续扩展：

- 一级菜单：`/agents`
- 二级页面：`/agents/ai-training`

如果想减少首期改动，也可以先挂在 `AgentOperations` 页内做顶层 Tab。

我的建议是：

**正式开发用独立路由 `/agents/ai-training`，同时保留 `/agents` 作为 Agent 中台总览页。**

原因：

- 聊天工作台信息密度高，不适合塞到当前 Agent 页面的单个 Tab 里；
- 后续案例库、Skill工坊、评测中心都会持续扩展；
- 独立页面更利于后续接快捷入口、收藏页、工作台入口。

---

## 2. 路由与菜单调整

## 2.1 App 路由

建议新增：

- `client/src/pages/AiTrainingWorkbench.js`

并在 `client/src/App.js` 中新增路由：

```jsx
<Route path="/agents/ai-training" element={<PrivateRoute><AiTrainingWorkbench /></PrivateRoute>} />
```

## 2.2 菜单入口

建议在 `Agent 中台` 下增加子入口或页面内顶部切换：

- Agent 总览
- AI训练台

如保持当前左侧菜单结构简洁，建议只保留一个 `/agents` 菜单，然后在 Agent 页面内显示：

- `预算研究`
- `AI训练台`
- `通知规则`

---

## 3. 页面结构建议

## 3.1 页面级 Tabs

`AiTrainingWorkbench` 顶部建议 5 个 Tab：

1. `会话工作台`
2. `优秀案例库`
3. `Skill工坊`
4. `评测中心`
5. `训练统计`

建议使用 Ant Design `Tabs`，并配合 URL query 持久化：

- `/agents/ai-training?tab=sessions`
- `/agents/ai-training?tab=cases`

---

## 4. 文件拆分建议

建议不要把整页都写进一个文件里，首期至少拆成下面结构：

```text
client/src/pages/
  AiTrainingWorkbench.js

client/src/components/aiTraining/
  SessionSidebar.js
  SessionChatPanel.js
  SessionInspector.js
  CaseCandidateDrawer.js
  CaseLibraryList.js
  SkillEditorPanel.js
  HookBindingPanel.js
  EvalRunTable.js
  UserTrainingRanking.js
```

API 统一放入：

- `client/src/api/index.js`
  - `aiTrainingApi`

---

## 5. 各页面详细拆分

## 5.1 会话工作台

### 5.1.1 页面目标

让运营人员在这里完成：

- 新建会话
- 发送消息
- 调用 Skill
- 挂载上下文
- 给回答打分
- 沉淀案例 / Skill

### 5.1.2 布局

建议三栏：

#### 左栏：会话列表

宽度建议：`280px`

内容：

- `新建会话` 按钮
- 搜索框
- 筛选项
- 会话列表

建议组件：

- `Input.Search`
- `Select`
- `List`

每条会话卡片显示：

- 标题
- 业务线
- 场景
- 最近更新时间
- 质量分
- 是否收藏

#### 中栏：聊天主区域

自适应主宽区。

内容：

- 顶部上下文条
- 聊天消息流
- 动作按钮
- 输入区

建议组件：

- `Card`
- `List`
- `Space`
- `Input.TextArea`
- `Button`
- `Tag`
- `Drawer`（移动端或详情抽屉）

#### 右栏：训练面板

宽度建议：`320px`

内容：

- 当前上下文
- 当前 Skill
- Hook 执行情况
- 会话质量分
- 沉淀动作

建议组件：

- `Descriptions`
- `Card`
- `Collapse`
- `Button`

### 5.1.3 关键状态

```js
const [sessionList, setSessionList] = useState([]);
const [activeSession, setActiveSession] = useState(null);
const [messages, setMessages] = useState([]);
const [sessionFilters, setSessionFilters] = useState({...});
const [composerText, setComposerText] = useState('');
const [contextRefs, setContextRefs] = useState([]);
const [selectedSkillId, setSelectedSkillId] = useState(null);
const [selectedSkillVersionId, setSelectedSkillVersionId] = useState(null);
const [sending, setSending] = useState(false);
const [inspectorOpen, setInspectorOpen] = useState(true);
```

### 5.1.4 交互要求

1. 点击左侧会话，加载右侧消息
2. 发送消息时：
   - 先乐观插入用户消息
   - 再请求后端
   - 成功后补 assistant 消息
3. 点“加入案例候选”：
   - 弹出确认框
   - 默认带上当前消息摘要
4. 点“转 Skill 候选”：
   - 打开 Skill 草稿抽屉

---

## 5.2 优秀案例库

### 5.2.1 页面目标

用于查看、筛选、审核和复用高质量案例。

### 5.2.2 结构建议

左侧筛选 + 中间列表 + 右侧详情抽屉。

### 5.2.3 列表字段

- 标题
- 贡献人
- 业务线
- 场景
- 标签
- 复用次数
- 状态

### 5.2.4 建议组件

- `Table` 或 `List`
- `Drawer`
- `Tag`
- `Segmented`

### 5.2.5 关键操作

- 审核通过
- 退回补充
- 查看原会话
- 转 Skill 候选

---

## 5.3 Skill工坊

### 5.3.1 页面目标

用于编辑 Skill、维护版本、绑定案例、绑定 Hook。

### 5.3.2 布局建议

左右双栏：

- 左边：Skill 基本信息与结构配置
- 右边：案例、Hook、评测摘要、版本历史

### 5.3.3 表单字段

建议分 4 组：

1. 基础信息
2. 输入结构
3. 输出结构
4. 推理步骤与约束

### 5.3.4 建议组件

- `Form`
- `Input`
- `Select`
- `TextArea`
- `Tabs`
- `Table`

### 5.3.5 关键交互

- 切换版本时提示未保存
- 发布前强制查看评测结果
- 绑定 Hook 时显示顺序和必选状态

---

## 5.4 评测中心

### 5.4.1 页面目标

用于运行 Skill 评测、查看总分、对比版本。

### 5.4.2 页面结构

顶部统计卡 + 中部单题表格 + 右侧失败原因摘要。

### 5.4.3 建议组件

- `Card`
- `Statistic`
- `Table`
- `Drawer`
- `Progress`

### 5.4.4 核心功能

- 发起评测
- 查看单题结果
- 对比两个版本
- 查看失败样本

---

## 5.5 训练统计

### 5.5.1 页面目标

给负责人看：

- 谁在高质量使用 AI
- 哪些案例最有价值
- 哪些 Skill 复用最好

### 5.5.2 页面结构

建议上方统计卡，下面分两块：

- 人员榜
- Skill 榜

### 5.5.3 建议组件

- `Table`
- `Card`
- `Tabs`
- `Select`

---

## 6. API 对接建议

在 `client/src/api/index.js` 中新增：

```js
export const aiTrainingApi = {
  listSessions: (params) => api.get('/agents/ai-training/sessions', { params }).then(r => r.data),
  createSession: (data) => api.post('/agents/ai-training/sessions', data).then(r => r.data),
  getSession: (id) => api.get(`/agents/ai-training/sessions/${id}`).then(r => r.data),
  updateSession: (id, data) => api.put(`/agents/ai-training/sessions/${id}`, data).then(r => r.data),
  listMessages: (sessionId) => api.get(`/agents/ai-training/sessions/${sessionId}/messages`).then(r => r.data),
  sendMessage: (sessionId, data) => api.post(`/agents/ai-training/sessions/${sessionId}/messages`, data).then(r => r.data),
  feedbackMessage: (messageId, data) => api.post(`/agents/ai-training/messages/${messageId}/feedback`, data).then(r => r.data),
  runMessageAction: (messageId, data) => api.post(`/agents/ai-training/messages/${messageId}/actions`, data).then(r => r.data),
  listCaseCandidates: (params) => api.get('/agents/ai-training/case-candidates', { params }).then(r => r.data),
  reviewCaseCandidate: (id, data) => api.post(`/agents/ai-training/case-candidates/${id}/review`, data).then(r => r.data),
  listCases: (params) => api.get('/agents/ai-training/cases', { params }).then(r => r.data),
  listSkills: (params) => api.get('/agents/ai-training/skills', { params }).then(r => r.data),
  createSkill: (data) => api.post('/agents/ai-training/skills', data).then(r => r.data),
  getOverview: () => api.get('/agents/ai-training/overview').then(r => r.data),
};
```

---

## 7. 与现有页面复用建议

## 7.1 可复用样式和模式

### 来自 `Dashboard.js`

- 顶部统计卡样式
- Drawer 详情模式
- 列表筛选交互

### 来自 `AgentOperations.js`

- 管理台页面风格
- 统计卡 + Table + Modal 结构
- 规则配置类表单交互

### 来自文档中心/任务页

- 右侧抽屉
- 标签展示
- 共享范围与权限控制

---

## 8. 开发顺序建议

## 8.1 Phase 1：最小闭环

先开发：

1. 会话工作台
2. 会话列表
3. 消息流
4. 消息反馈
5. 案例候选池

这样先能跑通：

**聊天 -> 留痕 -> 反馈 -> 候选沉淀**

## 8.2 Phase 2：沉淀复用

再开发：

1. 正式案例库
2. Skill 草稿页
3. Hook 绑定面板

## 8.3 Phase 3：治理发布

最后开发：

1. 评测中心
2. 训练统计
3. Skill 发布流程

---

## 9. 组件级开发优先级

如果要快速开始，建议按这个顺序开发：

1. `AiTrainingWorkbench.js`
2. `SessionSidebar.js`
3. `SessionChatPanel.js`
4. `SessionInspector.js`
5. `CaseCandidateDrawer.js`
6. `CaseLibraryList.js`
7. `SkillEditorPanel.js`
8. `EvalRunTable.js`

---

## 10. 风险点与前端注意事项

1. 聊天内容会很长，必须保证输入框固定、消息区滚动；
2. 左侧会话列表要稳定宽度，不能因标题长短抖动；
3. 右侧训练面板建议可折叠；
4. Skill 编辑表单字段较多，建议分区展示，不要整屏纯表单；
5. 案例与 Skill 之间的“转化动作”要始终清晰可见；
6. 统计页不要做成营销感大屏，保持中台风格，强调扫描效率。

---

## 11. 一期前端最小文件清单

建议首批最少新增：

- `client/src/pages/AiTrainingWorkbench.js`
- `client/src/components/aiTraining/SessionSidebar.js`
- `client/src/components/aiTraining/SessionChatPanel.js`
- `client/src/components/aiTraining/SessionInspector.js`
- `client/src/components/aiTraining/CaseCandidateDrawer.js`

以及修改：

- `client/src/App.js`
- `client/src/api/index.js`
- `client/src/pages/MenuPerms.js`

---

## 12. 结论

前端开发上，最重要的不是把“聊天框”做出来，而是把下面三件事同时做出来：

1. 会话留痕
2. 沉淀动作
3. Skill 复用入口

只要这三件事在页面里成立，AI训练台就不只是一个问答工具，而会真正变成组织能力生产线。
