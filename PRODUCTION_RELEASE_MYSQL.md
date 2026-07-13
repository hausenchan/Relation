# 正式服 MySQL + OSS 切换发布方案

## 1. 背景

当前系统有两套部署：

- 正式服：`https://relation.midongtech.com/`
- 测试服：`https://relation-test.midongtech.com/`

当前代码分支：

- 正式服当前分支：`main`
- 测试服当前分支：`test`

测试服已完成验收：

- `test` 分支代码已部署并验证通过
- 旧测试 RDS MySQL 数据来自正式服 `data.db` 导入
- 已完成逐表行数核对：`92` 张表、`8329` 行数据一致
- 已完成加密字段抽样解密验证：失败数为 `0`

本次目标：

- 将已验收通过的 `test` 分支合并到 `main`
- 正式服部署最新 `main`
- 正式服从 SQLite `data.db` 切换到生产 RDS MySQL
- 正式服附件/图片上传使用生产 OSS

## 2. 重要说明

生产环境配置：

```text
OSS bucket：mid-relation
OSS endpoint：oss-cn-shenzhen.aliyuncs.com
应用连库地址：midongad.rwlb.rds.aliyuncs.com:3306
本地导入/核对地址：120.79.151.103:33306
数据库：relation
账号：relation
```

MySQL 密码、OSS AK、OSS SK 属于敏感信息，只通过服务器环境变量或运维密钥渠道配置，不写入 Git 仓库。

如果生产 RDS 已经完成正式数据导入并验收通过，则该库可直接作为正式数据使用。
如果生产 RDS 还是空库或旧数据，发布前必须先从当前正式数据源导入，并完成逐表行数和核心功能验收。

发布后正式服将只写入 MySQL，不再双写 `data.db`。

测试服不要继续写入生产库。如果 `relation` 库作为正式库使用，测试服后续应切到独立测试库，例如：

```text
relation_test
```

或临时停止测试服写入。

## 3. 发布前准备

### 3.1 确认代码

确认 `test` 分支为已验收版本。

将 `test` 合并到 `main`：

```bash
git checkout main
git pull gitee main
git merge test
git push gitee main
```

### 3.2 备份正式服

在正式服发布前备份以下内容：

```text
项目代码目录
data.db
.secrets/master.key
.secrets/hmac.key
server/uploads
当前进程管理配置
当前环境变量配置
```

建议备份目录示例：

```bash
mkdir -p /backup/relation/$(date +%Y%m%d-%H%M%S)
```

至少确认以下文件已备份：

```text
data.db
.secrets/master.key
.secrets/hmac.key
```

## 4. 正式服密钥配置

正式服必须使用能解开 RDS 当前数据的密钥文件。

项目默认读取路径：

```text
项目根目录/.secrets/master.key
项目根目录/.secrets/hmac.key
```

如果项目目录是：

```text
/www/wwwroot/relation
```

则密钥应放在：

```text
/www/wwwroot/relation/.secrets/master.key
/www/wwwroot/relation/.secrets/hmac.key
```

文件权限建议：

```bash
chmod 700 .secrets
chmod 600 .secrets/master.key .secrets/hmac.key
```

也可以通过环境变量指定密钥路径：

```bash
export RELATION_MASTER_KEY_PATH=/path/to/master.key
export RELATION_HMAC_KEY_PATH=/path/to/hmac.key
```

## 5. 正式服环境变量

正式服需要配置 MySQL：

```bash
export DB_CLIENT=mysql
export MYSQL_HOST=midongad.rwlb.rds.aliyuncs.com
export MYSQL_PORT=3306
export MYSQL_DATABASE=relation
export MYSQL_USER=relation
export MYSQL_PASSWORD=<生产 MySQL 密码>
```

正式服需要配置 OSS：

```bash
export ALIYUN_OSS_ACCESS_KEY_ID=<生产 OSS AccessKey ID>
export ALIYUN_OSS_ACCESS_KEY_SECRET=<生产 OSS AccessKey Secret>
```

OSS bucket 和 endpoint 已有默认值，也可以显式配置：

```bash
export ALIYUN_OSS_BUCKET=mid-relation
export ALIYUN_OSS_ENDPOINT=oss-cn-shenzhen.aliyuncs.com
```

历史本地附件的 OSS 读取目录默认是 `uploads`，也可以显式配置：

```bash
export ALIYUN_OSS_LEGACY_UPLOADS_PREFIX=uploads
```

不要把密码、AK、SK 写入 Git 仓库。

## 6. 历史附件迁移

旧版本上传文件平铺在正式服：

```text
项目根目录/server/uploads/
```

本次迁移不需要按业务类型区分历史文件。让运维将该目录里的文件内容复制到生产 OSS：

```text
oss://mid-relation/uploads/
```

示例命令：

```bash
cd /www/wwwroot/relation/server/uploads
ossutil cp -r . oss://mid-relation/uploads/
```

复制完成后的结构应为：

```text
mid-relation/
  uploads/
    1776317940291-566rajy83rw.jpg
    1783332055087-lm99i87pv3.docx
  attachments/
    yyyy/MM/dd/...
  documents/
    yyyy/MM/dd/...
  company-subjects/
    yyyy/MM/dd/...
```

注意不要复制成：

```text
uploads/server/uploads/<旧文件名>
```

或：

```text
uploads/uploads/<旧文件名>
```

代码读取规则：

- 新上传文件仍按业务目录写入 OSS
- 数据库里 `oss:` 开头的路径直接读取对应 OSS 对象
- 数据库里的旧路径，例如 `1776317940291-566rajy83rw.jpg`，优先读取 `oss://mid-relation/uploads/1776317940291-566rajy83rw.jpg`
- 如果 OSS 没有旧文件，再兜底读取本地 `server/uploads/1776317940291-566rajy83rw.jpg`

确认历史附件都能从 OSS 访问后，`server/uploads` 可以先保留一段时间作为兜底，再归档。

## 7. 正式服部署步骤

进入正式服项目目录：

```bash
cd /www/wwwroot/relation
```

拉取最新 `main`：

```bash
git checkout main
git pull gitee main
```

安装依赖：

```bash
npm install
cd client
npm install
```

构建前端：

```bash
npm run build
cd ..
```

重启服务。

如果使用 `pm2`，示例：

```bash
pm2 restart relation
```

如果使用宝塔/系统服务，请在对应服务配置里确保已注入第 5 节环境变量。

## 8. 启动命令参考

命令行启动示例：

```bash
DB_CLIENT=mysql \
MYSQL_HOST=midongad.rwlb.rds.aliyuncs.com \
MYSQL_PORT=3306 \
MYSQL_DATABASE=relation \
MYSQL_USER=relation \
MYSQL_PASSWORD=<生产 MySQL 密码> \
ALIYUN_OSS_ACCESS_KEY_ID=<生产 OSS AccessKey ID> \
ALIYUN_OSS_ACCESS_KEY_SECRET=<生产 OSS AccessKey Secret> \
ALIYUN_OSS_LEGACY_UPLOADS_PREFIX=uploads \
NODE_ENV=production \
npm run server
```

## 9. 本地导入/核对连接

如果需要在本地通过 AI/脚本向生产 MySQL 导入或核对数据，使用公网地址和外网端口：

```bash
export DB_CLIENT=mysql
export MYSQL_HOST=120.79.151.103
export MYSQL_PORT=33306
export MYSQL_DATABASE=relation
export MYSQL_USER=relation
export MYSQL_PASSWORD=<生产 MySQL 密码>
```

导入前必须确认目标库允许覆盖。带 `--reset` 会先清空目标库已有表：

```bash
npm run db:migrate:mysql -- --sqlite data.db --reset
```

## 10. 上线后验收清单

访问正式服：

```text
https://relation.midongtech.com/
```

重点验证：

- 登录是否正常
- 工作台数据是否正常展示
- 人脉管理是否正常展示历史数据
- 公司研究是否正常展示历史数据
- 文档中心是否正常打开、编辑、保存
- 任务指派是否正常
- “我指派”的任务是否能看到
- 附件上传是否成功
- 图片/附件下载是否成功
- 历史附件是否能正常下载/预览
- 历史加密字段是否正常显示
- 服务端日志是否没有大量 `decrypt failed`
- 服务端日志是否没有 MySQL SQL 语法报错

## 11. 数据库核对命令

如需再次确认 RDS 数据，可执行只读对账脚本，检查 SQLite 和 MySQL 的表数、总行数、逐表行数。

如果仍以当前已确认的正式 `data.db` 作为源库，导入后的预期结果：

```text
SQLite 表数量：92
MySQL 表数量：92
SQLite 总行数：8329
MySQL 总行数：8329
缺失表：0
多余表：0
行数不一致表：0
```

## 12. 回滚方案

如果正式服发布后出现严重异常：

1. 停止当前新服务
2. 恢复发布前备份的代码目录，或切回旧 `main` 提交
3. 恢复发布前备份的 `.secrets/master.key` 和 `.secrets/hmac.key`
4. 去掉 `DB_CLIENT=mysql` 相关环境变量
5. 确认服务重新使用本地 `data.db`
6. 重启正式服服务

回滚后访问：

```text
https://relation.midongtech.com/
```

确认登录、核心数据、附件访问正常。

## 13. 发布后注意事项

- 正式服切到 MySQL 后，`data.db` 不再作为实时写入数据库
- 后续生产数据以 RDS MySQL 为准
- 不要让测试服继续连接正式库进行测试写入
- 历史附件已经复制到 OSS `uploads/` 后，正式服可先保留本地 `server/uploads` 作为兜底
- `.secrets` 密钥必须妥善备份，丢失后历史加密字段无法解密
- OSS AK/SK 和 MySQL 密码必须通过服务器环境变量或进程管理器配置，不要提交到代码仓库
