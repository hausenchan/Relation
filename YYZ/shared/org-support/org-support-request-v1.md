# YYZ OrgSupportRequest v1

组织中台暂无统一协议时，YYZ 先使用本协议生成组织支持请求。Relation Agent 中台接入后，应将本
协议映射到统一任务模型，并保留 `source_task_id` 和状态回调。

## 状态

`draft -> submitted -> accepted -> in_progress -> blocked|completed|rejected|cancelled`

## 请求结构

```yaml
schema: yyz.org-support-request.v1
request_id: ORG-YYZ-20260729-001
source_project: YYZ
source_task_id: YYZ-20260729-001
request_type: software_copyright | domain | platform_account | legal | finance | engineering
business_goal: 为什么需要该组织支持
deliverable: 需要交付的成果
inputs: []
priority: P0 | P1 | P2
deadline: null
approver: null
data_classification: internal
acceptance_criteria: []
requested_by: YYZ项目负责人
callback_to: YYZ-ROOT-001
```

## 结果结构

```yaml
schema: yyz.org-support-result.v1
request_id: ORG-YYZ-20260729-001
status: completed
owner: null
summary: 结果摘要
deliverables: []
limitations: []
completed_at: null
```

YYZ 总调度员负责确认结果是否满足业务目标；组织中台负责权限检查、路由、状态和组织侧执行审计。
