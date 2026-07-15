# Relation Clipboard Reference

## Relation Clipboard MIME

Relation document center accepts its native block clipboard payload:

```js
const documentBlocksMime = "application/x-relation-document-blocks";
await targetTab.clipboard.write([{
  entries: [
    { mimeType: "text/plain", text: plainText },
    { mimeType: documentBlocksMime, text: JSON.stringify({ blocks }) },
  ],
}]);
```

Prefer this over `text/html` for TAPD imports because Relation sanitizes ordinary HTML and forbids images.

## Block Shapes

Use these compact shapes:

```js
{ type: "paragraph", content: "<strong>【需求背景】</strong>", meta: {} }
{ type: "bullet", content: "任务列表只显示许愿星任务，默认展示3个", meta: { indent: 0 } }
{ type: "bullet", content: "官方有完成任务回调", meta: { indent: 1 } }
{
  type: "image",
  content: "tapd_21691901_base64_1782894493_766.png",
  meta: {
    url: "data:image/png;base64,...",
    filename: "tapd_21691901_base64_1782894493_766.png",
    display_name: "tapd_21691901_base64_1782894493_766.png",
    mimetype: "image/png",
    file_ext: "png",
    embedOnly: true,
    source_system: "tapd_embedded",
    alt: "TAPD截图1"
  }
}
```

For image blocks, place base64 only in `meta.url`. Keep `content` as a filename to avoid duplicating large data URIs.

## TAPD Extraction Notes

In the source tab, find the body container after the detail drawer opens:

```js
const container = Array.from(document.querySelectorAll(".cherry-editor-content.tex2jax_ignore"))
  .find(el => (el.innerText || "").includes("【需求背景】") && el.querySelectorAll("img").length > 0);
```

When converting DOM to blocks:

- Keep `strong`, `b`, `em`, `i`, `u`, `s`, `del`, `code`, `mark`, `span style`, `a[href]`, and `br`.
- Drop event handlers, scripts, iframes, and arbitrary attributes.
- Convert top-level `p`/`div` to paragraph blocks.
- Convert `ul > li` to bullet blocks and `ol > li` to numbered blocks.
- Recursively convert nested lists and increment `meta.indent`.
- Emit image blocks in the same position where image nodes appear.

## Bundling TAPD Images

Use the source tab page assets after images have rendered:

```js
const cap = await sourceTab.capabilities.get("pageAssets");
const inventory = await cap.list();
const selectedAssetIds = inventory.assets
  .filter(asset => asset.kind === "image" && extractedImageUrls.includes(asset.url))
  .map(asset => asset.id);
const bundle = await cap.bundle({ inventoryId: inventory.id, assetIds: selectedAssetIds });
```

Then read each bundled file in Node and replace the matching image block URL:

```js
const fs = await import("node:fs/promises");
const assetByUrl = new Map(bundle.assets.map(asset => [asset.url, asset]));

for (const block of blocks) {
  if (block.type !== "image") continue;
  const asset = assetByUrl.get(block.meta.original_url) || assetByUrl.get(block.meta.remote_url);
  const bytes = await fs.readFile(asset.path);
  const dataUri = `data:${asset.contentType || "image/png"};base64,${bytes.toString("base64")}`;
  block.content = block.meta.filename || asset.name;
  block.meta = {
    url: dataUri,
    filename: block.content,
    display_name: block.content,
    mimetype: asset.contentType || "image/png",
    file_ext: "png",
    embedOnly: true,
    source_system: "tapd_embedded",
    alt: block.meta.alt || "TAPD截图"
  };
}
```

If matching by `original_url` is not available, preserve the original TAPD `src` on each image block as `remote_url` before replacing it.

## Target Verification

After pasting, saving, and reloading the target Relation document, run a DOM check like:

```js
await targetTab.reload();
await targetTab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 45000 });
await targetTab.playwright.waitForTimeout(5000);

const result = await targetTab.playwright.evaluate(() => {
  const blocks = Array.from(document.querySelectorAll("#document-editor-blocks [data-doc-block-id]"));
  const text = blocks.map(b => (b.innerText || "").trim()).join("\n");
  const imgs = Array.from(document.querySelectorAll("#document-editor-blocks img")).map(img => ({
    complete: img.complete,
    width: img.naturalWidth,
    height: img.naturalHeight,
    renderedWidth: Math.round(img.getBoundingClientRect().width),
    renderedHeight: Math.round(img.getBoundingClientRect().height),
    isData: (img.currentSrc || img.src || "").startsWith("data:image/")
  }));
  return {
    blockCount: blocks.length,
    imageCount: imgs.length,
    imgs,
    hasBackground: text.includes("【需求背景】"),
    hasContent: text.includes("【需求内容】")
  };
});
```

Accept the import only when the required text is present and every image has positive natural and rendered dimensions.
