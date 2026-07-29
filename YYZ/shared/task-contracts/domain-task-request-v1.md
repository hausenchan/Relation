# YYZ DomainTaskRequest v1

组织中台尚无统一 Agent 任务协议时，YYZ 先使用本协议在总调度员和领域 Agent 之间传递任务。后续
Relation 建立统一协议时，优先做字段映射，不在多个 Agent 中各自发明格式。

## 状态

`draft -> submitted -> accepted -> in_progress -> blocked|completed|rejected|cancelled`

## 请求结构

```yaml
schema: yyz.domain-task-request.v1
task_id: YYZ-20260729-001
parent_task_id: YYZ-ROOT-001
project: YYZ
requested_agent: yyz-data-intelligence
business_goal: 提升爱奇艺极速版毛利ARPU
scope:
  date_range: latest-complete-day
  media: 爱奇艺极速版
  budgets: [支小]
inputs:
  source_refs: []
expected_output: 媒体x预算归因和P0机会
acceptance_criteria:
  - 财务数据与维度数据完成对账
  - 关键数字附来源
priority: P1
deadline: null
permissions: read_only
requested_by: YYZ项目负责人
callback_to: YYZ-ROOT-001
```

## 结果结构

```yaml
schema: yyz.domain-task-result.v1
task_id: YYZ-20260729-001
status: completed
summary: 结果摘要
facts: []
inferences: []
actions: []
artifacts: []
source_refs: []
limitations: []
confidence: null
completed_at: null
```

任务和结果不得内嵌生产凭据或未经脱敏的用户数据。跨 Agent 只传必要事实、引用和产物，不复制完整
聊天记录。
