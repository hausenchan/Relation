---
name: tapd-relation-doc-import
description: Import TAPD story, requirement, or iteration-card detail content into the Relation document center while preserving rich text, links, nested lists, and screenshots. Use when Codex is asked to copy, migrate, synchronize, or import content from a TAPD URL into a Relation document URL such as relation.midongtech.com/documents?doc=..., especially when the work must be done through Chrome with existing login sessions.
---

# TAPD Relation Doc Import

## Purpose

Use this skill to move one TAPD requirement/story detail into one Relation document-center page with formatting intact. The reliable path is not ordinary HTML paste: Relation filters `<img>` on HTML paste, and TAPD image URLs may render as broken images after import. Build Relation document blocks and embed screenshots as `data:image/...` media blocks.

## Inputs

Collect or infer:

- Source TAPD URL, usually a `tapd.cn/tapd_fe/.../iteration/card/...dialog_preview_id=story_...` page.
- Target Relation document URL, usually `https://relation.midongtech.com/documents?doc=<id>`.

Use Chrome when the user requests Chrome, logged-in TAPD/Relation sessions are needed, or the source/target pages are private. If login, CAPTCHA, or OTP blocks either page, ask the user to complete it in Chrome and continue after they confirm.

If the target document already has non-empty body content and the user did not explicitly say to replace it, ask whether to append or replace. Preserve the target document title, folder, permissions, and metadata unless the user explicitly asks to change them.

## Workflow

1. Open the TAPD URL in Chrome and wait for the story/detail drawer to render.
2. Identify the smallest TAPD body container:
   - Prefer `.cherry-editor-content.tex2jax_ignore`.
   - Confirm it contains key body text such as `【需求背景】` or `【需求内容】`.
   - Confirm it contains the expected screenshots (`img` nodes) and excludes comments, workflow, and base-info panels.
3. Extract the TAPD title, rich text body, links, lists, and image URLs from that container.
4. Build Relation clipboard blocks using the custom MIME `application/x-relation-document-blocks`.
   - Paragraphs: `{ type: "paragraph", content: "<inline html>", meta: {} }`
   - Bullet lists: `{ type: "bullet", content: "...", meta: { indent: n } }`
   - Numbered lists: `{ type: "numbered", content: "...", meta: { indent: n } }`
   - Images: `{ type: "image", content: "<filename>", meta: { url: "data:image/png;base64,...", embedOnly: true, ... } }`
5. Use the source tab `pageAssets` capability to bundle already-rendered TAPD screenshots. Match bundled assets by the image URLs extracted from the body.
6. Convert bundled image files to data URIs. Keep only one copy of the base64 data in each image block, preferably in `meta.url`; put the filename in `content`. This keeps the clipboard smaller and avoids Chrome extension disconnects.
7. Write the clipboard with:
   - `text/plain` for fallback text.
   - `application/x-relation-document-blocks` containing `JSON.stringify({ blocks })`.
   - Avoid relying on `text/html` for screenshots.
8. Focus the target editor body block (`[contenteditable="true"][id^="doc-block-input-"]`) and paste with `ControlOrMeta+V`.
9. Save with `ControlOrMeta+S`, wait for the last-edited timestamp or save state to update, then reload the Relation document.
10. Verify after reload:
    - Block count is plausible.
    - Required phrases are present, for example `【需求背景】`, `【需求内容】`, and the last section key text.
    - Image count matches TAPD.
    - Every image has `complete === true`, positive `naturalWidth`/`naturalHeight`, and visible rendered dimensions.
11. Keep the target Relation document tab open as the deliverable. Close or omit intermediate TAPD/source tabs when browser cleanup is available.

## Important Fixes

- If pasted screenshots render with `naturalWidth: 0`, undo the paste once, rebuild image blocks with embedded data URIs, and paste again.
- If Chrome control disconnects while writing or pasting a large clipboard, reconnect to Chrome, claim the existing Relation document tab, check whether the paste happened, then continue. Do not reload before checking unsaved state.
- If the target document is blank after a failed paste, retry with the compact custom payload: `text/plain` plus `application/x-relation-document-blocks`, no large `text/html`.

## References

Read `references/relation-clipboard.md` when implementing the extraction and clipboard payload. It contains the Relation block schema, browser snippets, and verification checks captured from the successful import flow.
