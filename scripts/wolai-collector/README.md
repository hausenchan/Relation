# Wolai Chrome 采集 Demo

这个 demo 用于在 Wolai 无法批量导出时，复用人工登录态采集页面内容。

链路：

```text
启动专用 Chrome
-> 登录 Wolai
-> 打开 7 个页面或准备 URL 清单
-> 采集为 JSON
-> npm run wolai:import 导入文档中心
```

## 1. 启动专用 Chrome

```bash
npm run wolai:chrome
```

这会打开一个独立 profile：

```text
tmp/chrome-wolai-profile
```

第一次需要在这个 Chrome 里登录 Wolai。后面同一个 profile 会保留登录态。

## 2. 采集方式 A：打开标签页后采集

在上一步打开的 Chrome 里，手动打开 `003-支付宝产品` 下 7 篇文档。

然后运行：

```bash
npm run wolai:collect -- \
  --from-open-tabs \
  --match-url wolai \
  --match-title 支付宝 \
  --workspace 产品运营周重点 \
  --folder-path "01-产品设计/003-支付宝产品" \
  --output tmp/wolai-export/003-支付宝产品/chrome-capture.json
```

如果标题里不一定都有“支付宝”，可以去掉：

```bash
--match-title 支付宝
```

## 3. 采集方式 B：URL 清单采集

复制模板：

```bash
cp scripts/wolai-collector/examples/alipay-product-urls.template.json \
  tmp/wolai-export/003-支付宝产品-urls.json
```

把 7 篇文档 URL 填进去，然后运行：

```bash
npm run wolai:collect -- \
  --url-file tmp/wolai-export/003-支付宝产品-urls.json \
  --workspace 产品运营周重点 \
  --folder-path "01-产品设计/003-支付宝产品" \
  --output tmp/wolai-export/003-支付宝产品/chrome-capture.json
```

## 4. Dry-Run 导入文档中心

采集成功后，先 dry-run：

```bash
npm run wolai:import -- \
  --input tmp/wolai-export/003-支付宝产品/chrome-capture.json \
  --batch wolai_alipay_product_demo_20260707 \
  --workspace 产品运营周重点 \
  --target-folder-path "3_产运/03_项目资料" \
  --domain general \
  --department OPS \
  --doc-type SPEC \
  --dry-run
```

## 5. 正式导入

确认报告没明显问题后，去掉 `--dry-run`：

```bash
npm run wolai:import -- \
  --input tmp/wolai-export/003-支付宝产品/chrome-capture.json \
  --batch wolai_alipay_product_demo_20260707 \
  --workspace 产品运营周重点 \
  --target-folder-path "3_产运/03_项目资料" \
  --domain general \
  --department OPS \
  --doc-type SPEC
```

## 输出格式

采集器会生成导入器可读的 JSON：

```json
{
  "sourceSystem": "wolai",
  "captureMode": "chrome_url_list",
  "documents": [
    {
      "title": "支付宝变现分析",
      "pageUrl": "https://...",
      "workspaceName": "产品运营周重点",
      "folderPath": "01-产品设计/003-支付宝产品",
      "plainText": "...",
      "html": "<div>...</div>",
      "images": [],
      "attachments": []
    }
  ]
}
```

## 注意

- demo 版优先保证正文、标题、表格、图片链接和附件链接被采到。
- 图片和附件第一版先保留原链接；如果 Wolai 链接需要登录态，导入后可能需要后续做附件下载归档。
- 如果页面打开后正文为空，先确认 Chrome 里是否已经登录 Wolai，页面是否完整加载。
