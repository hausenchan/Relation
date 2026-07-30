# zhixiao-ai Skill 迁移配置指南

这份指南用于交给另一台电脑上的 Codex。目标是让 Codex 帮用户把 `zhixiao-ai` skill 安装到本机、修正本机路径、准备运行依赖，并确认 `$zhixiao-ai` 可以正常执行。

## 一句话提示词

把下面这段话连同本指南一起交给对方 Codex：

```text
我收到一个 zhixiao-ai Codex skill 文件夹，请你按这份指南帮我安装到本机，检查并替换硬编码路径，准备运行依赖，验证 helper 和生成脚本，然后试跑 $zhixiao-ai。不要向我索要密码；需要登录时让我在 Chrome 手动登录。任何写入 .codex/skills、移动 Downloads 文件、写入 D/E 盘或安装依赖时，请按 Codex 授权流程请求权限。
```

## 需要随 skill 一起发送的文件

必须发送完整文件夹，而不是只发送 `SKILL.md`：

```text
zhixiao-ai/
  SKILL.md
  scripts/
    move_latest_download.py
  agents/
    openai.yaml
```

如果对方机器没有报表生成项目，还需要同时发送或部署这些业务文件：

```text
/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/generate_multi3_report_project.py
/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/serve_report_lan.py        可选，仅局域网访问需要
```

如果希望生成完整历史和投放成本，还应提供或在对方机器准备这些数据：

```text
/Users/chenhaozan/Documents/AI/Gcad/adOpt/支小应用数据报表/支小应用收入_历史缓存.xlsx
/Users/chenhaozan/Documents/AI/Gcad/adOpt/支小应用数据报表/旧后台订单.xlsx 或 旧后台订单.xls
/Users/chenhaozan/Documents/AI/Gcad/adsOperation/outputs\denghuo_ad_report_*merged_with_rebate.csv
```

不要发送浏览器 Cookie、账号密码或后台 token。需要登录时让用户本人在 Chrome 手动登录。

## 安装位置

在对方电脑上，将整个 `zhixiao-ai` 文件夹放到 Codex skills 目录：

```text
/Users/chenhaozan/.codex/skills/zhixiao-ai
```

如果对方设置了 `CODEX_HOME`，则放到：

```text
$CODEX_HOME/skills/zhixiao-ai
```

安装后应存在：

```text
/Users/chenhaozan/.codex/skills/zhixiao-ai\SKILL.md
/Users/chenhaozan/.codex/skills/zhixiao-ai\scripts\move_latest_download.py
/Users/chenhaozan/.codex/skills/zhixiao-ai\agents\openai.yaml
```

## 需要 Codex 检查并替换的路径

这个 skill 当前来自原电脑环境，里面有一些硬编码路径。对方 Codex 必须先读取并检查这些文件：

```text
/Users/chenhaozan/.codex/skills/zhixiao-ai\SKILL.md
/Users/chenhaozan/.codex/skills/zhixiao-ai\scripts\move_latest_download.py
/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/generate_multi3_report_project.py
```

重点替换以下路径为对方本机实际路径：

| 原路径 | 用途 | 处理方式 |
| --- | --- | --- |
| `/Users/chenhaozan/Downloads` | Chrome 下载目录 | 改成对方 Windows 用户的下载目录，或在 helper 中改成 `Path.home() / "Downloads"` |
| `/Users/chenhaozan/.codex/skills/zhixiao-ai/scripts/move_latest_download.py` | 下载文件归档 helper | 改成对方 skill 安装后的真实路径 |
| `/Users/chenhaozan/Documents/AI/Gcad/adOpt/支小应用数据报表` | 导出的 XLS 报表归档目录 | 创建同名目录，或改成对方指定的数据目录 |
| `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis` | HTML 报表生成项目目录 | 创建同名目录，或改成对方项目目录 |
| `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis/generate_multi3_report_project.py` | 主生成脚本 | 确认存在；不存在则从原机器复制 |
| `/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis\支小数据new.html` | 固定 HTML 输出文件 | 确认输出路径可写 |
| `/Users/chenhaozan/Documents/AI/Gcad/adsOperation/outputs` | 灯火返点后 CSV 目录 | 没有则创建；缺数据时生成器会提示成本缺失 |
| `/Users/chenhaozan/Documents/AI/Gcad/adOpt/.codex-tmp/pydeps` | 生成器额外 Python 依赖目录 | 若生成器中写死该路径，需要一并改成本机路径或准备该目录 |

建议对方 Codex 用 `rg` 搜索所有旧路径：

```powershell
rg "C:\\Users\\midong|D:\\weineng_work|E:\\gcad" "/Users/chenhaozan/.codex/skills/zhixiao-ai" "/Users/chenhaozan/Documents/AI/Gcad/dataAnalysis"
```

## Python 依赖准备

对方 Codex 需要确认 Python 可运行，并检查常用依赖：

```powershell
python -c "import pandas, xlrd, openpyxl; print('python deps ok')"
```

如果缺依赖，需要在对方同意后安装，例如：

```powershell
python -m pip install pandas xlrd openpyxl
```

如果 `generate_multi3_report_project.py` 还依赖其他包，以脚本实际报错为准补齐。

## Chrome 与后台登录准备

`zhixiao-ai` 会控制 Chrome 打开 mid-max 后台并导出报表。对方需要：

1. 本机安装 Chrome。
2. Codex 可以使用 Chrome 控制能力。
3. 用户本人在 Chrome 登录 `https://mid-max.midongtech.com`。
4. 登录账号具备以下报表页面访问和导出权限。

导出文件目标名称如下：

```text
支小大盘汇总.xls
新后台订单.xls
支小应用收入.xls
广告位维度汇总.xls
支小媒体数据.xls
支小媒体应用任务维度.xls
应用媒体数据占比 .xls
广告位维度汇总-灯火投放.xls
```

注意：部分页面即使显示 `暂无数据`，仍可能导出空表或少量数据表，Codex 应继续按 skill 流程归档并在结果中说明。

## 验证 skill 安装

对方 Codex 安装并改完路径后，先做静态检查：

```powershell
find "/Users/chenhaozan/.codex/skills/zhixiao-ai" -maxdepth 3 -type f
python3 "/Users/chenhaozan/.codex/skills/zhixiao-ai/scripts/move_latest_download.py" --help
```

如果对方机器上有 skill-creator 的 `quick_validate.py`，再执行：

```powershell
python "/Users/chenhaozan/.codex/skills/.system/skill-creator/scripts/quick_validate.py" "/Users/chenhaozan/.codex/skills/zhixiao-ai"
```

没有 `quick_validate.py` 时，手动确认：

1. `SKILL.md` 有 YAML frontmatter。
2. `name` 是 `zhixiao-ai`。
3. `description` 是一句自然语言描述。
4. `scripts/move_latest_download.py` 存在。
5. `agents/openai.yaml` 存在。
6. `SKILL.md` 内没有旧电脑路径，除非对方刻意创建了完全相同目录。

## 试跑流程

对方 Codex 可以让用户发起：

```text
[$zhixiao-ai](/Users/chenhaozan/.codex/skills/zhixiao-ai\SKILL.md) 跑一次
```

或者直接说：

```text
使用 zhixiao-ai 重新跑一次
```

试跑时 Codex 应按顺序完成：

1. 读取 `zhixiao-ai/SKILL.md`。
2. 控制 Chrome 打开 mid-max 后台。
3. 逐个导出 8 份 XLS。
4. 每导出一份，就用 `move_latest_download.py` 移动到报表归档目录，并改成固定文件名。
5. 运行 `generate_multi3_report_project.py`。
6. 验证 `支小数据new.html` 更新时间和关键内容。
7. 汇报导出的文件、HTML 输出路径、最新数据日期、生成器提示和缺失项。

## 成功标准

一次正常运行后，应满足：

1. 报表归档目录中 8 个 XLS 文件已更新。
2. `支小数据new.html` 已重新生成。
3. 生成器输出包含 `latest_date` 或同等最新数据日期。
4. HTML 中能找到核心数据块，例如 `APP_INCOME_DETAIL_DATA`、`APP_DELIVERY_DETAIL_DATA`、`AD_DETAIL_DATA`、`MEDIA_DETAIL_DATA`、`ORDER_DETAIL_DATA`。
5. 如果缺旧后台订单、历史缓存、最新灯火返点后 CSV，Codex 应明确说明为“数据缺失提示”，而不是误判为 skill 失败。

## 常见问题处理

| 问题 | 处理 |
| --- | --- |
| Codex 找不到 `$zhixiao-ai` | 确认文件夹在 `.codex\skills\zhixiao-ai`，并重启或刷新 Codex 会话 |
| 只发了 `SKILL.md` | 不能完整运行；还需要 `scripts/move_latest_download.py`，建议补发整个文件夹 |
| 下载后没有移动成功 | 检查 Chrome 下载目录、文件名、下载是否完成，以及目标目录是否可写 |
| 页面导出按钮点不到 | 让 Codex 读取页面元素；必要时按 skill 说明使用坐标点击导出按钮 |
| 页面需要展开筛选项 | 该后台常见为 Ant Design Pro 的 `展开` 链接，不一定是 button |
| Python 缺包 | 安装 `pandas`、`xlrd`、`openpyxl`，其他按生成脚本报错补齐 |
| HTML 只有很少日期 | 通常是缺 `支小应用收入_历史缓存.xlsx` |
| 灯火投放成本缺失 | 检查 `denghuo_ad_report_*merged_with_rebate.csv` 是否存在且日期匹配 |
| 旧后台订单缺失 | 可继续生成，但结果不会计入旧后台订单明细 |
| 权限被拒绝 | 让 Codex 按授权流程请求写入 `.codex\skills`、D/E 盘或安装依赖的权限 |

## 给对方 Codex 的最终检查清单

```text
[ ] zhixiao-ai 文件夹已放入本机 Codex skills 目录
[ ] SKILL.md 中所有旧 Windows 绝对路径已检查并按本机修正
[ ] move_latest_download.py 的 DOWNLOAD_DIR 和 TARGET_DIR 已修正
[ ] generate_multi3_report_project.py 存在且内部路径已修正
[ ] Python 依赖可导入
[ ] Chrome 已登录 mid-max 后台
[ ] 8 份 XLS 能导出并归档
[ ] 支小数据new.html 能生成
[ ] Codex 已向用户汇报缺失的可选数据和生成器提示
```

