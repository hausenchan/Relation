# 幂动组织中台 Android

Android 商务移动端首版工程，定位给商务人员在手机上处理高频工作。

## 功能范围

- 登录：复用 Web 端 `/api/auth/login`，本地保存 token 和用户信息。
- 任务：聚合 `/api/tasks` 与 `/api/follow-up-tasks`，支持未完成、我的、已完成筛选，以及开始、完成操作。
- 商机：读取 `/api/opportunities`，支持状态筛选。
- 人脉：读取 `/api/persons`，支持搜索，以及对方预算分类、自有流量场景、代理流量场景多选筛选。
- 新增人脉：姓名、公司、城市，以及对方预算分类、自有流量场景、代理流量场景，多选字段与 Web 端保持一致。
- 公司：读取 `/api/companies`。
- 其他：保留目标、周报、策略、需求、文档中心入口，读取对应列表接口。

## 打开方式

1. 用 Android Studio 打开本目录 `android/`。
2. 等待 Gradle 同步完成。
3. 启动后直接使用线上账号登录。

移动端固定连接线上服务：`https://relation.midongtech.com/api`，与 Web 端同一套后端 API。

## 构建

本工程首版使用原生 Java + Android SDK，不依赖 AndroidX / Material 等第三方库。

有 Android SDK 和 Gradle 后可执行：

```bash
gradle :app:assembleDebug
```

或在 Android Studio 中点击 Run。

## 当前限制

- 本仓库所在机器当前能找到 Android SDK `android-35/android.jar`，但没有可用的 `gradle`、`adb`；缓存 Gradle 启动时缺 native library，因此 APK 使用 Android SDK 工具链手工打包。
- 新增商机、公司、其他模块的完整编辑表单尚未展开，首版先提供列表、筛选和入口。
- 任务新增暂用负责人用户 ID，后续应接入 `/api/users/simple` 做人员选择器。
