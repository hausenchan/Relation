# AI训练台后端 API 设计

> 版本：v0.1  
> 日期：2026-07-06  
> 适用范围：`server/index.js` / SQLite 运行时 / Agent 中台扩展

---

## 1. 设计目标

本设计用于将 `AI训练台` 从 PRD 和原型稿落到当前项目的后端接口层。

目标不是一次性做完全部 AI 能力，而是先完成一条能跑通的链路：

**会话 -> 消息 -> 反馈 -> 案例候选 -> Skill 草稿 -> 评测 -> 发布**

---

## 2. 路由命名建议

建议沿用当前 `Agent 中台` 的命名方式，统一挂在：

`/api/agents/ai-training/*`

好处：

- 与现有 `/api/agents/*` 风格统一；
- 权限和审计日志更容易复用；
- 前端也更容易放到 `/agents` 菜单体系下。

---

## 3. 权限建议

复用现有登录态与 `req.user`，在接口层做以下控制：

- 普通用户：默认仅可访问自己的会话、自己提交的候选、已授权案例、已发布 Skill
- 团队负责人：可访问团队会话、团队候选、团队统计
- AI训练管理员：可访问全部会话、案例、Skill、评测
- 超级管理员：全权限

建议新增辅助函数：

- `canManageAiTraining(user)`
- `buildAiTrainingVisibilityFilter(user, alias)`
- `canReviewAiTrainingAsset(user)`

---

## 4. 模块拆分

## 4.1 会话模块

### 4.1.1 获取会话列表

`GET /api/agents/ai-training/sessions`

查询参数：

- `status`
- `scene_code`
- `business_line`
- `owner_user_id`
- `keyword`
- `mine=1`
- `starred=1`
- `limit`

返回建议：

```json
[
  {
    "id": 101,
    "title": "支小收入回撤分析：乐响热闻口袋",
    "scene_code": "revenue_diagnosis",
    "business_line": "zhixiao",
    "owner_user_id": 12,
    "owner_user_name": "张三",
    "last_message_at": "2026-07-06 21:43:00",
    "quality_score": 92,
    "starred": 1,
    "status": "active",
    "message_count": 8
  }
]
```

### 4.1.2 创建会话

`POST /api/agents/ai-training/sessions`

请求体建议：

```json
{
  "title": "支小收入回撤分析",
  "scene_code": "revenue_diagnosis",
  "scene_label": "收入异常诊断",
  "business_line": "zhixiao",
  "business_side": "预算侧",
  "budget_side": "C端",
  "role_scope": "budget_strategy",
  "skill_id": 3,
  "skill_version_id": 8,
  "visibility_scope": "private"
}
```

返回：

```json
{ "id": 101, "session_code": "aits_20260706_0001" }
```

### 4.1.3 获取会话详情

`GET /api/agents/ai-training/sessions/:id`

返回：

- 会话信息
- 最近消息
- 绑定上下文
- 当前反馈摘要

### 4.1.4 更新会话

`PUT /api/agents/ai-training/sessions/:id`

支持修改：

- `title`
- `summary`
- `visibility_scope`
- `starred`
- `pinned`
- `status`

### 4.1.5 归档会话

`POST /api/agents/ai-training/sessions/:id/archive`

### 4.1.6 复制会话

`POST /api/agents/ai-training/sessions/:id/duplicate`

作用：

- 复制会话元信息
- 默认不复制全部消息，可选复制最近 N 条

---

## 4.2 消息模块

### 4.2.1 获取会话消息

`GET /api/agents/ai-training/sessions/:id/messages`

返回：

- message list
- hook run 摘要
- feedback 摘要

### 4.2.2 发送消息

`POST /api/agents/ai-training/sessions/:id/messages`

说明：

一期可先不直接接入真实大模型编排，接口职责先设计清楚。

请求体建议：

```json
{
  "content_text": "帮我分析乐响热闻口袋最近 7 天收入为什么掉了",
  "message_type": "text",
  "context_refs": [
    { "ref_type": "document", "ref_id": "15" },
    { "ref_type": "case", "ref_id": "8" }
  ],
  "skill_id": 3,
  "skill_version_id": 8,
  "enable_hooks": true,
  "output_mode": "structured"
}
```

服务端职责建议：

1. 写入用户消息
2. 挂载上下文
3. 触发前置 Hook
4. 调用模型 / Skill runtime
5. 写入 AI 回复
6. 触发后置 Hook
7. 更新会话质量分与最近时间

返回：

```json
{
  "user_message_id": 1001,
  "assistant_message_id": 1002,
  "hook_runs": [
    { "hook_code": "preload_recent_reports", "status": "success" }
  ]
}
```

### 4.2.3 对消息打分/反馈

`POST /api/agents/ai-training/messages/:id/feedback`

请求体建议：

```json
{
  "feedback_type": "helpful",
  "rating": 5,
  "note_text": "结构稳定，适合沉淀给新人",
  "adopted": 1
}
```

### 4.2.4 消息动作接口

`POST /api/agents/ai-training/messages/:id/actions`

动作类型建议：

- `save_as_case_candidate`
- `create_task_draft`
- `create_skill_draft`
- `quote_to_session`

---

## 4.3 上下文模块

### 4.3.1 查询可挂载上下文

`GET /api/agents/ai-training/context/search`

查询参数：

- `keyword`
- `ref_type`
- `business_line`

一期可先支持：

- 文档中心文档
- AI案例
- 已发布 Skill
- 任务
- 公司研究记录

### 4.3.2 挂载上下文到会话

`POST /api/agents/ai-training/sessions/:id/context-refs`

---

## 4.4 案例候选与案例库模块

### 4.4.1 候选池列表

`GET /api/agents/ai-training/case-candidates`

查询参数：

- `status`
- `business_line`
- `scene_code`
- `owner_user_id`
- `keyword`

### 4.4.2 创建候选

`POST /api/agents/ai-training/case-candidates`

说明：

- 一般来自消息动作；
- 也支持管理员手工创建。

### 4.4.3 审核候选

`POST /api/agents/ai-training/case-candidates/:id/review`

请求体建议：

```json
{
  "action": "approve",
  "review_note": "方法稳定，适合预算侧推广"
}
```

审核动作：

- `approve`
- `reject`
- `merge`

### 4.4.4 正式案例列表

`GET /api/agents/ai-training/cases`

### 4.4.5 正式案例详情

`GET /api/agents/ai-training/cases/:id`

### 4.4.6 更新案例

`PUT /api/agents/ai-training/cases/:id`

支持更新：

- 标题
- 摘要
- 标签
- 可见范围
- 复用说明

---

## 4.5 Skill 模块

### 4.5.1 Skill 列表

`GET /api/agents/ai-training/skills`

支持筛选：

- `status`
- `scene_code`
- `business_line`
- `role_scope`

### 4.5.2 创建 Skill 草稿

`POST /api/agents/ai-training/skills`

请求体建议：

```json
{
  "name": "收入回撤排查",
  "scene_code": "revenue_diagnosis",
  "business_line": "zhixiao",
  "role_scope": "budget_strategy",
  "source_type": "case_based",
  "source_case_ids": [11, 12, 18]
}
```

### 4.5.3 获取 Skill 详情

`GET /api/agents/ai-training/skills/:id`

建议返回：

- skill 主信息
- 最新版本
- 已发布版本
- 绑定 case
- 绑定 hook
- 最近评测

### 4.5.4 创建新版本

`POST /api/agents/ai-training/skills/:id/versions`

### 4.5.5 更新版本

`PUT /api/agents/ai-training/skill-versions/:id`

可更新字段：

- `system_prompt`
- `input_schema_json`
- `output_schema_json`
- `reasoning_steps_text`
- `output_template_text`
- `guardrails_text`
- `source_case_ids_json`

### 4.5.6 发布 Skill

`POST /api/agents/ai-training/skill-versions/:id/publish`

发布前建议校验：

1. 是否有评测记录
2. 评测是否达到门槛
3. 是否已审核通过

### 4.5.7 回滚版本

`POST /api/agents/ai-training/skill-versions/:id/rollback`

---

## 4.6 Hook 模块

### 4.6.1 Hook 列表

`GET /api/agents/ai-training/hooks`

### 4.6.2 创建 Hook

`POST /api/agents/ai-training/hooks`

### 4.6.3 更新 Hook

`PUT /api/agents/ai-training/hooks/:id`

### 4.6.4 绑定 Hook 到 Skill 版本

`POST /api/agents/ai-training/skill-versions/:id/hooks`

请求体建议：

```json
{
  "hook_ids": [2, 5, 7]
}
```

### 4.6.5 查询 Hook 执行日志

`GET /api/agents/ai-training/hook-runs`

---

## 4.7 评测模块

### 4.7.1 评测集列表

`GET /api/agents/ai-training/eval-sets`

### 4.7.2 创建评测集

`POST /api/agents/ai-training/eval-sets`

### 4.7.3 评测题目列表

`GET /api/agents/ai-training/eval-sets/:id/cases`

### 4.7.4 创建评测运行

`POST /api/agents/ai-training/eval-runs`

请求体建议：

```json
{
  "skill_id": 3,
  "skill_version_id": 8,
  "eval_set_id": 2
}
```

### 4.7.5 评测结果详情

`GET /api/agents/ai-training/eval-runs/:id`

返回建议：

- 总分
- 通过率
- 单题结果
- 失败原因摘要

### 4.7.6 版本对比

`GET /api/agents/ai-training/eval-compare`

参数建议：

- `left_version_id`
- `right_version_id`
- `eval_set_id`

---

## 4.8 统计模块

### 4.8.1 人员训练榜

`GET /api/agents/ai-training/stats/users`

参数建议：

- `date_from`
- `date_to`
- `business_line`
- `team_id`

### 4.8.2 Skill 统计

`GET /api/agents/ai-training/stats/skills`

### 4.8.3 首页概览

`GET /api/agents/ai-training/overview`

建议返回：

- 今日会话数
- 高质量会话数
- 待审核候选数
- 已发布 Skill 数
- 本周评测数
- Top 用户 / Top Skill

---

## 5. 响应结构建议

建议与当前项目风格保持一致，默认直接返回业务对象；错误时返回：

```json
{ "error": "无权访问该会话" }
```

如需分页，建议返回：

```json
{
  "items": [],
  "total": 108,
  "page": 1,
  "page_size": 20
}
```

---

## 6. 服务端实现建议

## 6.1 推荐拆出新文件

- `server/lib/aiTrainingDao.js`
- `server/lib/aiTrainingService.js`
- `server/lib/aiTrainingScoring.js`
- `server/lib/aiTrainingHooks.js`

## 6.2 在 `server/index.js` 中落地顺序

1. 初始化表结构
2. 写基础 CRUD
3. 写候选审核逻辑
4. 写 Skill 版本逻辑
5. 写评测逻辑
6. 接日志与通知

## 6.3 建议复用能力

- `encryptRow / decryptRow`
- 通知系统 `createNotification`
- 操作日志
- 用户/团队可见范围过滤
- 任务创建能力

---

## 7. 一期最小接口集

如果希望尽快开发，建议一期先只做这 12 个接口：

1. `GET /sessions`
2. `POST /sessions`
3. `GET /sessions/:id`
4. `POST /sessions/:id/messages`
5. `POST /messages/:id/feedback`
6. `POST /messages/:id/actions`
7. `GET /case-candidates`
8. `POST /case-candidates/:id/review`
9. `GET /cases`
10. `GET /skills`
11. `POST /skills`
12. `GET /overview`

这样先把“聊天 -> 留痕 -> 案例 -> Skill”最小闭环打通。

---

## 8. 与现有模块关系

### 文档中心

- 作为上下文来源
- 支持挂载文档到会话

### 工作台 AI建议

- 后续可复用 AI训练台发布后的 Skill
- AI建议里的高质量策略也可反向进入案例库

### Agent 中台

- AI训练台作为 Agent 中台二级模块
- 复用现有权限、通知、审计和列表页风格

---

## 9. 结论

后端 API 建议优先围绕三条主链路建设：

1. 会话链路
2. 案例沉淀链路
3. Skill 发布链路

只要这三条链路先跑通，后面的 Hook、评测、统计都能平滑扩展。
