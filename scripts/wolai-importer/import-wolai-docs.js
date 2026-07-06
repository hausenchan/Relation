#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const repoRoot = path.resolve(__dirname, '..', '..');
const defaultDbPath = path.join(repoRoot, 'server', 'data.db');
const defaultUploadsDir = path.join(repoRoot, 'server', 'uploads');
const defaultReportDir = path.join(repoRoot, 'tmp', 'wolai-import-reports');

const supportedInputExts = new Set(['.md', '.markdown', '.html', '.htm', '.json', '.jsonl']);
const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const textPreviewExts = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'xml', 'yaml', 'yml']);
const domainCodes = {
  domestic_project: 'CN',
  overseas_project: 'OS',
  executive_management: 'MGT',
  general: 'GEN',
  cross_region: 'CR',
};

const docTypeKeywords = [
  { type: 'SOP', patterns: [/sop/i, /流程/, /操作手册/, /操作规范/] },
  { type: 'RULE', patterns: [/规则/, /制度/, /规范/] },
  { type: 'TPL', patterns: [/模板/, /表单/] },
  { type: 'MEET', patterns: [/会议/, /纪要/] },
  { type: 'REVIEW', patterns: [/复盘/, /总结/] },
  { type: 'PLAN', patterns: [/计划/, /方案/] },
  { type: 'RPT', patterns: [/报告/, /周报/, /月报/] },
  { type: 'SPEC', patterns: [/需求/, /prd/i, /技术/] },
];

function parseArgs(argv) {
  const args = {
    db: defaultDbPath,
    uploadsDir: defaultUploadsDir,
    reportDir: defaultReportDir,
    batch: `wolai_${formatDateToken(new Date())}`,
    workspace: 'wolai',
    rootFolder: 'Wolai迁移区',
    targetFolderPath: '',
    preserveSourceFolders: false,
    domain: 'general',
    department: 'ALL',
    docType: 'TMP',
    widthMode: 'full',
    createdBy: 'admin',
    dryRun: false,
    force: false,
    limit: 0,
    share: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[++index];
    if (token === '--input' || token === '-i') args.input = next();
    else if (token === '--db') args.db = next();
    else if (token === '--uploads-dir') args.uploadsDir = next();
    else if (token === '--report-dir') args.reportDir = next();
    else if (token === '--batch') args.batch = next();
    else if (token === '--workspace') args.workspace = next();
    else if (token === '--root-folder') args.rootFolder = next();
    else if (token === '--target-folder-path') args.targetFolderPath = next();
    else if (token === '--preserve-source-folders') args.preserveSourceFolders = true;
    else if (token === '--domain') args.domain = next();
    else if (token === '--project-group-id') args.projectGroupId = Number(next()) || null;
    else if (token === '--project-code') args.projectCode = next();
    else if (token === '--department') args.department = next();
    else if (token === '--doc-type') args.docType = next();
    else if (token === '--width-mode') args.widthMode = next();
    else if (token === '--created-by') args.createdBy = next();
    else if (token === '--limit') args.limit = Number(next()) || 0;
    else if (token === '--share') args.share.push(next());
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--force') args.force = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`未知参数: ${token}`);
  }

  args.db = path.resolve(repoRoot, args.db);
  args.uploadsDir = path.resolve(repoRoot, args.uploadsDir);
  args.reportDir = path.resolve(repoRoot, args.reportDir);
  if (args.input) args.input = path.resolve(repoRoot, args.input);
  return args;
}

function printHelp() {
  console.log(`
Wolai 文档中心导入器

用法:
  npm run wolai:import -- --input ./tmp/wolai-export --batch wolai_20260706_01

常用参数:
  --input <path>          必填。Wolai 导出目录、单个 .md/.html/.json/.jsonl 文件
  --dry-run              只解析和生成报告，不写数据库、不复制附件
  --force                内容哈希未变化时也强制更新
  --limit <n>            只处理前 n 篇，试迁移时有用
  --batch <batch_no>     批次号，默认 wolai_YYYYMMDD_HHmmss
  --workspace <name>     Wolai 空间名，默认 wolai
  --root-folder <name>   文档中心根目录，默认 Wolai迁移区
  --target-folder-path <path>
                         直接指定文档中心目标目录，如 "3_产运/03_项目资料"
  --preserve-source-folders
                         配合 target-folder-path 使用时，保留 Wolai 原始子目录
  --domain <key>         归属域，默认 general
  --department <key>     部门编码，默认 ALL
  --doc-type <key>       默认文档类型，默认 TMP；脚本也会按标题/路径粗略识别
  --project-group-id <id>
  --project-code <code>
  --created-by <user>    创建人用户名、展示名或用户ID，默认 admin
  --share <rule>         共享范围，可重复。例: department:OPS / user:3 / team:2 / project_group:1
  --db <path>            SQLite 路径，默认 server/data.db
  --uploads-dir <path>   附件目录，默认 server/uploads
  --report-dir <path>    报告目录，默认 tmp/wolai-import-reports

JSON 输入支持数组、单对象，或 { "documents": [...] } / { "pages": [...] }。
单篇记录字段建议: title/pageTitle, pageUrl/sourceUrl, folderPath, workspaceName,
plainText/markdown/html/blocks, tags, updatedAt, attachments, images。
`);
}

function formatDateToken(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function shortHash(value, length = 10) {
  return sha256(value).slice(0, length);
}

function safeJson(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isHiddenPath(filePath) {
  return path.basename(filePath).startsWith('.');
}

function walkInputFiles(inputPath) {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) {
    const ext = path.extname(inputPath).toLowerCase();
    return supportedInputExts.has(ext) ? [inputPath] : [];
  }
  const files = [];
  const stack = [inputPath];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach(entry => {
      const fullPath = path.join(current, entry.name);
      if (isHiddenPath(fullPath) || entry.name === 'node_modules') return;
      if (entry.isDirectory()) {
        stack.push(fullPath);
        return;
      }
      if (entry.isFile() && supportedInputExts.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    });
  }
  return files.sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

function normalizeCode(value, fallback = 'GEN', maxLength = 16) {
  const code = String(value || fallback || 'GEN')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return (code || fallback).slice(0, maxLength);
}

function normalizeDomain(value) {
  return domainCodes[value] ? value : 'general';
}

function getProjectCode(options) {
  if (options.projectCode) return normalizeCode(options.projectCode, 'GEN');
  return domainCodes[normalizeDomain(options.domain)] || 'GEN';
}

function getMimeType(filePath) {
  const ext = path.extname(filePath || '').slice(1).toLowerCase();
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    json: 'application/json',
    html: 'text/html',
    htm: 'text/html',
    xml: 'application/xml',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

function getPreviewStatus(mimetype, filename) {
  const mime = String(mimetype || '').toLowerCase();
  const ext = path.extname(filename || '').slice(1).toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('text/')) return 'supported';
  if (mime === 'application/pdf' || ext === 'pdf') return 'supported';
  if (textPreviewExts.has(ext)) return 'supported';
  return 'unsupported';
}

function stripHtmlTags(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeInlineHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function parseFrontMatter(raw) {
  const text = String(raw || '');
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return { meta: {}, body: text };
  }
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  match[1].split(/\r?\n/).forEach(line => {
    const index = line.indexOf(':');
    if (index < 0) return;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    value = value.replace(/^["']|["']$/g, '');
    if (value.startsWith('[') && value.endsWith(']')) {
      meta[key] = value.slice(1, -1).split(',').map(item => item.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      meta[key] = value;
    }
  });
  return { meta, body: text.slice(match[0].length) };
}

function makeBlockFactory(seed) {
  let index = 0;
  const prefix = `b_wolai_${shortHash(seed, 8)}`;
  return (type = 'paragraph', content = '', extra = {}) => {
    index += 1;
    return {
      id: `${prefix}_${String(index).padStart(4, '0')}`,
      type,
      content: type === 'divider' ? '' : String(content || ''),
      highlight: '',
      checked: Boolean(extra.checked),
      meta: extra.meta || {},
      ...extra,
    };
  };
}

function markdownLinkToCandidate(url, baseDir, label) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return null;
  if (/^(https?:)?\/\//i.test(cleanUrl)) {
    return {
      sourceUrl: cleanUrl,
      displayName: label || path.basename(cleanUrl.split('?')[0]) || cleanUrl,
      isRemote: true,
    };
  }
  const withoutAnchor = cleanUrl.split('#')[0].split('?')[0];
  const decoded = decodeURIComponent(withoutAnchor);
  return {
    sourcePath: path.resolve(baseDir, decoded),
    sourceUrl: cleanUrl,
    displayName: label || path.basename(decoded),
    isRemote: false,
  };
}

function splitMarkdownTable(lines, startIndex) {
  const tableLines = [];
  let index = startIndex;
  while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
    tableLines.push(lines[index]);
    index += 1;
  }
  if (tableLines.length < 2 || !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(tableLines[1])) {
    return null;
  }
  const rows = tableLines
    .filter((_, rowIndex) => rowIndex !== 1)
    .map(line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim()));
  return { rows, nextIndex: index };
}

function parseMarkdown(raw, filePath, sourceKeySeed) {
  const { meta, body } = parseFrontMatter(raw);
  const lines = body.split(/\r?\n/);
  const makeBlock = makeBlockFactory(sourceKeySeed || filePath);
  const blocks = [];
  const attachmentRefs = [];
  let title = meta.title || meta.page_title || meta.pageTitle || '';
  let firstHeadingConsumed = false;
  let inCode = false;
  let codeLines = [];
  let paragraphLines = [];

  const flushParagraph = () => {
    const text = paragraphLines.join('\n').trim();
    paragraphLines = [];
    if (!text) return;
    pushMarkdownInlineBlocks(text);
  };

  const pushMarkdownInlineBlocks = (text) => {
    let remaining = text;
    const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    let cursor = 0;
    const pieces = [];
    while ((match = imagePattern.exec(text))) {
      if (match.index > cursor) pieces.push({ type: 'text', value: text.slice(cursor, match.index) });
      pieces.push({ type: 'image', alt: match[1], url: match[2] });
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) pieces.push({ type: 'text', value: text.slice(cursor) });
    if (!pieces.length) pieces.push({ type: 'text', value: remaining });

    pieces.forEach(piece => {
      if (piece.type === 'image') {
        const candidate = markdownLinkToCandidate(piece.url, path.dirname(filePath), piece.alt || '');
        if (!candidate) return;
        const block = makeBlock('image', candidate.sourceUrl || '', {
          meta: {
            url: candidate.isRemote ? candidate.sourceUrl : '',
            filename: candidate.displayName || '',
            attachment_id: null,
          },
        });
        attachmentRefs.push({ blockId: block.id, blockType: 'image', candidate });
        blocks.push(block);
        return;
      }
      const value = piece.value.trim();
      if (!value) return;
      const linkOnly = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkOnly) {
        const candidate = markdownLinkToCandidate(linkOnly[2], path.dirname(filePath), linkOnly[1]);
        if (candidate?.isRemote) {
          blocks.push(makeBlock('external-link', candidate.sourceUrl, {
            meta: { url: candidate.sourceUrl, filename: candidate.displayName || '' },
          }));
        } else if (candidate) {
          const block = makeBlock('attachment', '', {
            meta: {
              attachment_id: null,
              filename: candidate.displayName || '',
              display_name: candidate.displayName || '',
              url: '',
              filepath: '',
              mimetype: '',
              file_ext: path.extname(candidate.displayName || '').slice(1),
              size: 0,
              preview_status: 'unsupported',
            },
          });
          attachmentRefs.push({ blockId: block.id, blockType: 'attachment', candidate });
          blocks.push(block);
        }
        return;
      }
      blocks.push(makeBlock('paragraph', sanitizeInlineHtml(value)));
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      if (inCode) {
        blocks.push(makeBlock('code', codeLines.join('\n')));
        codeLines = [];
        inCode = false;
      } else {
        flushParagraph();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const table = splitMarkdownTable(lines, index);
    if (table) {
      flushParagraph();
      const [header = [], ...rows] = table.rows;
      blocks.push(makeBlock('table-simple', '', {
        meta: {
          columns: header.map((_, columnIndex) => `字段 ${columnIndex + 1}`),
          rows: [header, ...rows],
          mergedCells: [],
        },
      }));
      index = table.nextIndex - 1;
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(4, heading[1].length);
      const content = sanitizeInlineHtml(heading[2].trim());
      if (!title && level === 1) {
        title = stripHtmlTags(content);
        firstHeadingConsumed = true;
        continue;
      }
      if (firstHeadingConsumed && level === 1 && stripHtmlTags(content) === title) continue;
      blocks.push(makeBlock(`heading${level}`, content));
      continue;
    }

    const todo = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/);
    if (todo) {
      flushParagraph();
      blocks.push(makeBlock('todo', sanitizeInlineHtml(todo[2].trim()), { checked: todo[1].toLowerCase() === 'x' }));
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      blocks.push(makeBlock('bullet', sanitizeInlineHtml(bullet[1].trim()), { meta: { indent: 0 } }));
      continue;
    }

    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      blocks.push(makeBlock('numbered', sanitizeInlineHtml(numbered[1].trim()), { meta: { indent: 0 } }));
      continue;
    }

    const quote = line.match(/^\s*>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      blocks.push(makeBlock('quote', sanitizeInlineHtml(quote[1].trim())));
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraphLines.push(line);
  }

  if (inCode && codeLines.length) blocks.push(makeBlock('code', codeLines.join('\n')));
  flushParagraph();

  return {
    title: title || path.basename(filePath, path.extname(filePath)),
    blocks: blocks.length ? blocks : [makeBlock('paragraph', body.trim())],
    attachmentRefs,
    meta,
    rawText: body,
    rawPayload: { frontmatter: meta, markdown: body },
  };
}

function parseHtmlTable(html, makeBlock) {
  const rows = [];
  const rowMatches = String(html || '').match(/<tr[\s\S]*?<\/tr>/gi) || [];
  rowMatches.forEach(rowHtml => {
    const cells = [];
    const cellMatches = rowHtml.match(/<(td|th)[^>]*>[\s\S]*?<\/\1>/gi) || [];
    cellMatches.forEach(cellHtml => cells.push(stripHtmlTags(cellHtml)));
    if (cells.length) rows.push(cells);
  });
  if (!rows.length) return null;
  const columnCount = Math.max(...rows.map(row => row.length), 1);
  const normalizedRows = rows.map(row => Array.from({ length: columnCount }, (_, index) => row[index] || ''));
  return makeBlock('table-simple', '', {
    meta: {
      columns: Array.from({ length: columnCount }, (_, index) => `字段 ${index + 1}`),
      rows: normalizedRows,
      mergedCells: [],
    },
  });
}

function parseHtml(raw, filePath, sourceKeySeed) {
  const clean = sanitizeInlineHtml(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const makeBlock = makeBlockFactory(sourceKeySeed || filePath);
  const title = stripHtmlTags(clean.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1])
    || stripHtmlTags(clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])
    || path.basename(filePath, path.extname(filePath));
  const body = clean.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || clean;
  const blocks = [];
  const attachmentRefs = [];
  const tokenPattern = /<(h[1-6]|p|li|blockquote|pre|table|img|a)\b[^>]*>[\s\S]*?(?:<\/\1>|$)|<img\b[^>]*\/?>/gi;
  let match;
  while ((match = tokenPattern.exec(body))) {
    const html = match[0];
    const tag = (match[1] || 'img').toLowerCase();
    if (tag === 'table') {
      const tableBlock = parseHtmlTable(html, makeBlock);
      if (tableBlock) blocks.push(tableBlock);
      continue;
    }
    if (tag === 'img') {
      const src = html.match(/\ssrc=["']([^"']+)["']/i)?.[1];
      if (!src) continue;
      const alt = html.match(/\salt=["']([^"']*)["']/i)?.[1] || '';
      const candidate = markdownLinkToCandidate(src, path.dirname(filePath), alt || path.basename(src));
      const block = makeBlock('image', candidate?.sourceUrl || src, {
        meta: {
          url: candidate?.isRemote ? candidate.sourceUrl : src,
          filename: candidate?.displayName || alt || '',
          attachment_id: null,
        },
      });
      if (candidate && !candidate.isRemote) attachmentRefs.push({ blockId: block.id, blockType: 'image', candidate });
      else attachmentRefs.push({ blockId: block.id, blockType: 'image', candidate: { ...(candidate || {}), isRemote: true, sourceUrl: src } });
      blocks.push(block);
      continue;
    }
    if (tag === 'a') {
      const href = html.match(/\shref=["']([^"']+)["']/i)?.[1];
      const label = stripHtmlTags(html) || href || '';
      if (!href) continue;
      const candidate = markdownLinkToCandidate(href, path.dirname(filePath), label);
      if (candidate?.isRemote) {
        blocks.push(makeBlock('external-link', candidate.sourceUrl, {
          meta: { url: candidate.sourceUrl, filename: label },
        }));
      } else if (candidate) {
        const block = makeBlock('attachment', '', {
          meta: { filename: label, display_name: label, attachment_id: null, url: '', filepath: '' },
        });
        attachmentRefs.push({ blockId: block.id, blockType: 'attachment', candidate });
        blocks.push(block);
      }
      continue;
    }
    const text = stripHtmlTags(html);
    if (!text) continue;
    if (/^h[1-6]$/.test(tag)) {
      const level = Math.min(4, Number(tag.slice(1)));
      if (level === 1 && text === title) continue;
      blocks.push(makeBlock(`heading${level}`, text));
    } else if (tag === 'li') {
      blocks.push(makeBlock('bullet', text, { meta: { indent: 0 } }));
    } else if (tag === 'blockquote') {
      blocks.push(makeBlock('quote', text));
    } else if (tag === 'pre') {
      blocks.push(makeBlock('code', text));
    } else {
      blocks.push(makeBlock('paragraph', text));
    }
  }
  if (!blocks.length) {
    stripHtmlTags(body).split(/\n{2,}/).filter(Boolean).forEach(text => blocks.push(makeBlock('paragraph', text)));
  }
  return {
    title,
    blocks: blocks.length ? blocks : [makeBlock('paragraph', stripHtmlTags(body))],
    attachmentRefs,
    meta: {},
    rawText: stripHtmlTags(body),
    rawPayload: { html: raw },
  };
}

function normalizeBlocksFromJson(blocks, sourceKeySeed) {
  const makeBlock = makeBlockFactory(sourceKeySeed);
  if (!Array.isArray(blocks)) return [];
  return blocks.map(rawBlock => {
    if (!rawBlock || typeof rawBlock !== 'object') return null;
    const type = normalizeBlockType(rawBlock.type || rawBlock.blockType);
    return makeBlock(type, rawBlock.content ?? rawBlock.text ?? rawBlock.title ?? '', {
      checked: Boolean(rawBlock.checked),
      highlight: rawBlock.highlight || '',
      meta: rawBlock.meta || rawBlock.attrs || {},
    });
  }).filter(Boolean);
}

function normalizeBlockType(value) {
  const type = String(value || '').toLowerCase();
  if (['heading_1', 'heading1', 'h1'].includes(type)) return 'heading1';
  if (['heading_2', 'heading2', 'h2'].includes(type)) return 'heading2';
  if (['heading_3', 'heading3', 'h3'].includes(type)) return 'heading3';
  if (['heading_4', 'heading4', 'h4'].includes(type)) return 'heading4';
  if (['bulleted_list_item', 'bullet', 'list'].includes(type)) return 'bullet';
  if (['numbered_list_item', 'numbered', 'ordered'].includes(type)) return 'numbered';
  if (['to_do', 'todo'].includes(type)) return 'todo';
  if (['quote'].includes(type)) return 'quote';
  if (['code'].includes(type)) return 'code';
  if (['table', 'table-simple'].includes(type)) return 'table-simple';
  if (['image'].includes(type)) return 'image';
  if (['file', 'attachment'].includes(type)) return 'attachment';
  return 'paragraph';
}

function parseJsonRecords(raw, filePath) {
  if (path.extname(filePath).toLowerCase() === '.jsonl') {
    return raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => JSON.parse(line));
  }
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.documents)) return parsed.documents;
  if (Array.isArray(parsed.pages)) return parsed.pages;
  if (Array.isArray(parsed.items)) return parsed.items;
  return [parsed];
}

function parseJsonRecord(record, filePath, sourceKeySeed) {
  const markdown = record.markdown || record.md;
  const html = record.html || record.rawHtml;
  const plainText = record.plainText || record.text || record.rawText || '';
  let parsed;
  if (Array.isArray(record.blocks)) {
    const blocks = normalizeBlocksFromJson(record.blocks, sourceKeySeed);
    parsed = {
      title: record.title || record.pageTitle || record.page_title || path.basename(filePath, path.extname(filePath)),
      blocks: blocks.length ? blocks : parsePlainTextBlocks(plainText, sourceKeySeed),
      attachmentRefs: [],
      meta: record,
      rawText: plainText,
      rawPayload: record,
    };
    return appendJsonMediaBlocks(parsed, record, filePath, sourceKeySeed);
  }
  if (markdown) {
    parsed = parseMarkdown(markdown, filePath, sourceKeySeed);
    return appendJsonMediaBlocks(parsed, record, filePath, sourceKeySeed);
  }
  if (html) {
    parsed = parseHtml(html, filePath, sourceKeySeed);
    return appendJsonMediaBlocks(parsed, record, filePath, sourceKeySeed);
  }
  parsed = {
    title: record.title || record.pageTitle || record.page_title || path.basename(filePath, path.extname(filePath)),
    blocks: parsePlainTextBlocks(plainText, sourceKeySeed),
    attachmentRefs: [],
    meta: record,
    rawText: plainText,
    rawPayload: record,
  };
  return appendJsonMediaBlocks(parsed, record, filePath, sourceKeySeed);
}

function candidateFromJsonMedia(item, filePath) {
  if (!item || typeof item !== 'object') return null;
  const displayName = item.name || item.filename || item.displayName || item.display_name || '';
  const localPath = item.localPath || item.local_path || item.filePath || item.file_path || item.path || '';
  const sourceUrl = item.sourceUrl || item.source_url || item.url || item.href || '';
  if (localPath) {
    return {
      sourcePath: path.isAbsolute(localPath) ? localPath : path.resolve(path.dirname(filePath), localPath),
      sourceUrl: sourceUrl || localPath,
      displayName: displayName || path.basename(localPath),
      isRemote: false,
    };
  }
  if (sourceUrl) {
    return {
      sourceUrl,
      displayName: displayName || path.basename(String(sourceUrl).split('?')[0]) || sourceUrl,
      isRemote: true,
    };
  }
  return null;
}

function appendJsonMediaBlocks(parsed, record, filePath, sourceKeySeed) {
  const makeBlock = makeBlockFactory(`${sourceKeySeed}:json-media`);
  const attachmentRefs = [...(parsed.attachmentRefs || [])];
  const blocks = [...(parsed.blocks || [])];
  const images = Array.isArray(record.images) ? record.images : [];
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];
  const seenMediaKeys = new Set();

  attachmentRefs.forEach(ref => {
    const candidate = ref.candidate || {};
    const key = candidate.sourceUrl || candidate.sourcePath || '';
    if (key) seenMediaKeys.add(key);
  });
  blocks.forEach(block => {
    const meta = block?.meta || {};
    [block?.content, meta.url, meta.sourceUrl, meta.source_url, meta.localPath, meta.local_path].forEach(value => {
      if (value) seenMediaKeys.add(String(value));
    });
  });

  const shouldAppendCandidate = (candidate) => {
    const key = candidate?.sourceUrl || candidate?.sourcePath || '';
    if (!key || seenMediaKeys.has(key)) return false;
    seenMediaKeys.add(key);
    return true;
  };

  images.forEach(item => {
    const candidate = candidateFromJsonMedia(item, filePath);
    if (!candidate || !shouldAppendCandidate(candidate)) return;
    const block = makeBlock('image', candidate.sourceUrl || '', {
      meta: {
        url: candidate.isRemote ? candidate.sourceUrl : '',
        filename: candidate.displayName || '',
        attachment_id: null,
      },
    });
    attachmentRefs.push({ blockId: block.id, blockType: 'image', candidate });
    blocks.push(block);
  });

  attachments.forEach(item => {
    const candidate = candidateFromJsonMedia(item, filePath);
    if (!candidate || !shouldAppendCandidate(candidate)) return;
    const block = makeBlock('attachment', '', {
      meta: {
        attachment_id: null,
        filename: candidate.displayName || '',
        display_name: candidate.displayName || '',
        url: candidate.isRemote ? candidate.sourceUrl : '',
        filepath: '',
        mimetype: '',
        file_ext: path.extname(candidate.displayName || '').slice(1),
        size: 0,
        preview_status: 'unsupported',
      },
    });
    attachmentRefs.push({ blockId: block.id, blockType: 'attachment', candidate });
    blocks.push(block);
  });

  return { ...parsed, blocks, attachmentRefs };
}

function parsePlainTextBlocks(text, sourceKeySeed) {
  const makeBlock = makeBlockFactory(sourceKeySeed);
  const blocks = String(text || '')
    .split(/\n{2,}|\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => makeBlock('paragraph', line));
  return blocks.length ? blocks : [makeBlock('paragraph', '')];
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(/[,，]/).map(item => item.trim()).filter(Boolean);
}

function inferDocType(title, folderPath, fallback) {
  const haystack = `${title || ''} ${folderPath || ''}`;
  const matched = docTypeKeywords.find(item => item.patterns.some(pattern => pattern.test(haystack)));
  return matched?.type || normalizeCode(fallback, 'TMP', 12);
}

function collectBlocksText(blocks) {
  const parts = [];
  const visit = value => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string' || typeof value === 'number') {
      const text = stripHtmlTags(String(value)).trim();
      if (text) parts.push(text);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      ['content', 'text', 'title', 'columns', 'rows', 'cells', 'body'].forEach(key => {
        if (Object.prototype.hasOwnProperty.call(value, key)) visit(value[key]);
      });
    }
  };
  visit(blocks);
  return parts.join('\n').slice(0, 20000);
}

function buildSummary(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function sourceKeyFromRecord(record, filePath, inputRoot, options) {
  const url = record.pageUrl || record.page_url || record.sourceUrl || record.source_url || record.url || '';
  const pageId = record.pageId || record.page_id || record.id || '';
  const workspace = record.workspaceName || record.workspace_name || options.workspace;
  if (pageId) return `wolai:${workspace}:${pageId}`;
  if (url) return `wolai:${workspace}:${shortHash(url, 20)}`;
  const inputIsFile = fs.existsSync(inputRoot) && fs.statSync(inputRoot).isFile();
  const rel = inputIsFile ? path.basename(filePath) : path.relative(inputRoot, filePath);
  const recordSuffix = record.__recordIndex === undefined ? '' : `:${record.__recordIndex}`;
  return `wolai:${workspace}:file:${shortHash(`${rel || filePath}${recordSuffix}`, 20)}`;
}

function normalizeImportedPage(parsed, record, filePath, inputRoot, options) {
  const sourceRecordKey = sourceKeyFromRecord(record, filePath, inputRoot, options);
  const sourceUrl = record.pageUrl || record.page_url || record.sourceUrl || record.source_url || record.url || parsed.meta.page_url || parsed.meta.source_url || '';
  const workspaceName = record.workspaceName || record.workspace_name || parsed.meta.workspace_name || options.workspace;
  const folderPath = record.folderPath || record.folder_path || parsed.meta.folder_path || path.dirname(path.relative(inputRoot, filePath));
  const cleanFolderPath = folderPath === '.' ? '' : folderPath;
  const title = String(record.title || record.pageTitle || record.page_title || parsed.title || '').trim() || '未命名文档';
  const tags = normalizeTags(record.tags || parsed.meta.tags);
  const docType = inferDocType(title, cleanFolderPath, record.docType || record.doc_type || options.docType);
  const contentText = collectBlocksText(parsed.blocks);
  const rawPayload = {
    source_system: 'wolai',
    workspace_name: workspaceName,
    folder_path: cleanFolderPath,
    page_url: sourceUrl,
    page_title: title,
    source_file: path.relative(repoRoot, filePath),
    author_name: record.authorName || record.author_name || parsed.meta.author_name || '',
    created_at: record.createdAt || record.created_at || parsed.meta.created_at || '',
    updated_at: record.updatedAt || record.updated_at || parsed.meta.updated_at || '',
    tags,
    ...parsed.rawPayload,
  };
  const payloadHash = sha256(JSON.stringify({
    title,
    content: parsed.blocks,
    sourceUrl,
    updatedAt: rawPayload.updated_at,
  }));
  const qualityFlags = [];
  if (!contentText.trim()) qualityFlags.push('EMPTY_TEXT');
  if (!title || title === '未命名文档') qualityFlags.push('NO_TITLE');
  if (parsed.blocks.some(block => block.type === 'table-simple')) qualityFlags.push('HAS_TABLE');
  return {
    sourceRecordKey,
    sourceUrl,
    workspaceName,
    folderPath: cleanFolderPath,
    title,
    blocks: parsed.blocks,
    attachmentRefs: parsed.attachmentRefs || [],
    tags,
    docType,
    contentText,
    summary: buildSummary(contentText),
    rawText: parsed.rawText || contentText,
    rawPayload,
    payloadHash,
    sourceUpdatedAt: rawPayload.updated_at || null,
    sourceCreatedAt: rawPayload.created_at || null,
    qualityFlags,
  };
}

function loadPages(inputPath, options) {
  const files = walkInputFiles(inputPath);
  const pages = [];
  files.forEach(filePath => {
    const ext = path.extname(filePath).toLowerCase();
    const raw = fs.readFileSync(filePath, 'utf8');
    if (ext === '.json' || ext === '.jsonl') {
      const records = parseJsonRecords(raw, filePath);
      records.forEach((record, index) => {
        const recordWithIndex = { ...record, __recordIndex: index };
        const sourceSeed = sourceKeyFromRecord(recordWithIndex, filePath, inputPath, options);
        const parsed = parseJsonRecord(recordWithIndex, filePath, sourceSeed);
        const page = normalizeImportedPage(parsed, recordWithIndex, filePath, inputPath, options);
        page.filePath = filePath;
        pages.push(page);
      });
      return;
    }
    const sourceSeed = sourceKeyFromRecord({}, filePath, inputPath, options);
    const parsed = ext === '.html' || ext === '.htm'
      ? parseHtml(raw, filePath, sourceSeed)
      : parseMarkdown(raw, filePath, sourceSeed);
    const page = normalizeImportedPage(parsed, {}, filePath, inputPath, options);
    page.filePath = filePath;
    pages.push(page);
  });
  return options.limit > 0 ? pages.slice(0, options.limit) : pages;
}

function tableColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
}

function addColumnIfMissing(db, table, column, definition) {
  const cols = tableColumns(db, table);
  if (cols.length && !cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureImporterSchema(db) {
  addColumnIfMissing(db, 'documents', 'source_system', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'documents', 'source_record_key', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'documents', 'source_url', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'documents', 'source_updated_at', 'DATETIME DEFAULT NULL');
  addColumnIfMissing(db, 'documents', 'source_payload_hash', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'documents', 'import_batch_no', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'documents', 'import_status', "TEXT DEFAULT NULL");
  addColumnIfMissing(db, 'documents', 'quality_status', "TEXT DEFAULT NULL");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_source_record
      ON documents(source_system, source_record_key);

    CREATE TABLE IF NOT EXISTS document_import_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_system TEXT NOT NULL DEFAULT 'wolai',
      batch_no TEXT NOT NULL UNIQUE,
      workspace_name TEXT,
      input_path TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      total_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      created_count INTEGER DEFAULT 0,
      updated_count INTEGER DEFAULT 0,
      skipped_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      warning_count INTEGER DEFAULT 0,
      run_log_json TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      created_by INTEGER
    );

    CREATE TABLE IF NOT EXISTS document_import_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      source_system TEXT NOT NULL DEFAULT 'wolai',
      source_record_key TEXT NOT NULL,
      document_id INTEGER,
      source_url TEXT,
      title TEXT,
      action TEXT,
      status TEXT NOT NULL,
      payload_hash TEXT,
      error_message TEXT,
      quality_flags_json TEXT,
      source_file TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_document_import_items_job
      ON document_import_items(job_id);
    CREATE INDEX IF NOT EXISTS idx_document_import_items_source
      ON document_import_items(source_system, source_record_key);
  `);
}

function resolveUserId(db, value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('created-by 不能为空');
  if (/^\d+$/.test(text)) {
    const row = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(text));
    if (row) return row.id;
  }
  const row = db.prepare(`
    SELECT id FROM users
    WHERE username = ? OR display_name = ?
    ORDER BY id ASC
    LIMIT 1
  `).get(text, text);
  if (!row) throw new Error(`找不到创建人: ${text}`);
  return row.id;
}

function getNextDocumentSequence(db) {
  const row = db.prepare('SELECT next_seq FROM document_sequence_state WHERE scope_key = ?').get('global');
  if (!row) {
    db.prepare('INSERT INTO document_sequence_state (scope_key, next_seq) VALUES (?, ?)').run('global', 2);
    return 1;
  }
  db.prepare('UPDATE document_sequence_state SET next_seq = next_seq + 1, updated_at = CURRENT_TIMESTAMP WHERE scope_key = ?').run('global');
  return row.next_seq;
}

function formatDocumentNo(seq, projectCode, departmentKey, docType, year) {
  return [
    `D${String(seq).padStart(6, '0')}`,
    normalizeCode(projectCode, 'GEN'),
    normalizeCode(departmentKey, 'ALL', 8),
    normalizeCode(docType, 'TMP', 12),
    String(year || new Date().getFullYear()),
  ].join('-');
}

function findOrCreateFolder(db, name, parentId, context, userId) {
  const row = db.prepare(`
    SELECT id FROM document_folders
    WHERE name = ?
      AND COALESCE(parent_id, 0) = COALESCE(?, 0)
      AND domain = ?
      AND COALESCE(project_group_id, 0) = COALESCE(?, 0)
      AND department_key = ?
    ORDER BY id ASC
    LIMIT 1
  `).get(name, parentId || null, context.domain, context.projectGroupId || null, context.departmentKey);
  if (row) return row.id;
  const result = db.prepare(`
    INSERT INTO document_folders (
      name, parent_id, domain, project_group_id, department_key, default_doc_type, sort_order, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    parentId || null,
    context.domain,
    context.projectGroupId || null,
    context.departmentKey,
    context.docType,
    context.sortOrder || 0,
    userId
  );
  return result.lastInsertRowid;
}

function splitFolderPath(value) {
  return String(value || '')
    .split(/[\\/]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function ensureFolderPath(db, page, options, userId) {
  const context = {
    domain: normalizeDomain(options.domain),
    projectGroupId: options.projectGroupId || null,
    departmentKey: normalizeCode(options.department, 'ALL', 8),
    docType: normalizeCode(options.docType, 'TMP', 12),
  };
  let parentId = null;
  let segments;

  if (options.targetFolderPath) {
    segments = splitFolderPath(options.targetFolderPath);
    if (options.preserveSourceFolders) {
      segments = [...segments, ...splitFolderPath(page.folderPath)];
    }
  } else {
    const root = String(options.rootFolder || 'Wolai迁移区').trim();
    segments = [
      ...splitFolderPath(root),
      ...splitFolderPath(page.folderPath),
    ];
  }

  segments.forEach((segment, index) => {
    parentId = findOrCreateFolder(db, segment, parentId, { ...context, sortOrder: (index + 1) * 10 }, userId);
  });
  return parentId;
}

function parseShareRules(rules) {
  return rules.map(raw => {
    const [type, value] = String(raw || '').split(':');
    if (!['project_group', 'department', 'team', 'user'].includes(type)) {
      throw new Error(`共享规则类型不支持: ${raw}`);
    }
    if (!value) throw new Error(`共享规则缺少值: ${raw}`);
    if (type === 'department') return { target_type: type, target_id: null, target_key: value };
    return { target_type: type, target_id: Number(value), target_key: null };
  });
}

function replaceShares(db, documentId, shares, userId) {
  if (!shares.length) return;
  db.prepare('DELETE FROM document_shares WHERE document_id = ?').run(documentId);
  const insert = db.prepare(`
    INSERT INTO document_shares (document_id, target_type, target_id, target_key, created_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  shares.forEach(share => insert.run(documentId, share.target_type, share.target_id, share.target_key, userId));
}

function copyAttachmentToUploads(sourcePath, uploadsDir, batchNo) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { error: 'ATTACHMENT_MISSING' };
  }
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) return { error: 'ATTACHMENT_NOT_FILE' };
  ensureDir(uploadsDir);
  const ext = path.extname(sourcePath);
  const filename = `${Date.now()}-${shortHash(`${batchNo}:${sourcePath}:${stat.size}:${stat.mtimeMs}`, 12)}${ext}`;
  const destPath = path.join(uploadsDir, filename);
  fs.copyFileSync(sourcePath, destPath);
  return {
    filename: path.basename(sourcePath),
    filepath: filename,
    mimetype: getMimeType(sourcePath),
    file_ext: ext.slice(1).toLowerCase(),
    size: stat.size,
    preview_status: getPreviewStatus(getMimeType(sourcePath), sourcePath),
  };
}

function insertAttachment(db, documentId, blockId, candidate, options, userId) {
  const copied = copyAttachmentToUploads(candidate.sourcePath, options.uploadsDir, options.batch);
  if (copied.error) return { error: copied.error };
  const displayName = candidate.displayName || copied.filename;
  const result = db.prepare(`
    INSERT INTO document_attachments (
      document_id, block_id, filename, display_name, filepath, mimetype, file_ext, size,
      preview_status, created_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    documentId,
    blockId,
    copied.filename,
    displayName,
    copied.filepath,
    copied.mimetype,
    copied.file_ext,
    copied.size,
    copied.preview_status,
    userId
  );
  return {
    id: result.lastInsertRowid,
    ...copied,
    display_name: displayName,
    url: `/uploads/${copied.filepath}`,
  };
}

function hydrateAttachmentBlocks(db, documentId, page, options, userId) {
  const qualityFlags = [];
  const refsByBlockId = new Map((page.attachmentRefs || []).map(ref => [ref.blockId, ref]));
  const hydratedBlocks = page.blocks.map(block => {
    const ref = refsByBlockId.get(block.id);
    if (!ref) return block;
    const candidate = ref.candidate || {};
    if (candidate.isRemote) {
      qualityFlags.push('REMOTE_ATTACHMENT_ONLY');
      return {
        ...block,
        content: candidate.sourceUrl || block.content,
        meta: {
          ...(block.meta || {}),
          url: candidate.sourceUrl || block.meta?.url || '',
          filename: candidate.displayName || block.meta?.filename || '',
        },
      };
    }
    const attachment = insertAttachment(db, documentId, block.id, candidate, options, userId);
    if (attachment.error) {
      qualityFlags.push(attachment.error);
      return {
        ...block,
        meta: {
          ...(block.meta || {}),
          filename: candidate.displayName || block.meta?.filename || '',
          display_name: candidate.displayName || block.meta?.display_name || '',
          upload_status: 'failed',
          upload_error: attachment.error,
        },
      };
    }
    if (block.type === 'image') {
      return {
        ...block,
        content: attachment.url,
        meta: {
          ...(block.meta || {}),
          attachment_id: attachment.id,
          filename: attachment.filename,
          url: attachment.url,
          filepath: attachment.filepath,
          mimetype: attachment.mimetype,
        },
      };
    }
    return {
      ...block,
      meta: {
        ...(block.meta || {}),
        attachment_id: attachment.id,
        filename: attachment.filename,
        display_name: attachment.display_name,
        url: attachment.url,
        filepath: attachment.filepath,
        mimetype: attachment.mimetype,
        file_ext: attachment.file_ext,
        size: attachment.size,
        preview_status: attachment.preview_status,
      },
    };
  });
  return { blocks: hydratedBlocks, qualityFlags };
}

function createDocument(db, page, options, userId, folderId, shares) {
  const globalSeq = getNextDocumentSequence(db);
  const year = String(page.sourceCreatedAt || page.sourceUpdatedAt || '').slice(0, 4) || new Date().getFullYear();
  const projectCode = getProjectCode(options);
  const departmentKey = normalizeCode(options.department, 'ALL', 8);
  const documentNo = formatDocumentNo(globalSeq, projectCode, departmentKey, page.docType, year);
  const tags = JSON.stringify(['wolai', ...page.tags].filter(Boolean));
  const emptyContent = JSON.stringify({ blocks: page.blocks });
  const result = db.prepare(`
    INSERT INTO documents (
      document_no, global_seq, title, content, content_text, summary, domain,
      project_group_id, project_code, department_key, doc_type, current_version,
      folder_id, tags, width_mode, created_by, updated_by,
      source_system, source_record_key, source_url, source_updated_at, source_payload_hash,
      import_batch_no, import_status, quality_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    documentNo,
    globalSeq,
    page.title,
    emptyContent,
    page.contentText,
    page.summary,
    normalizeDomain(options.domain),
    options.projectGroupId || null,
    projectCode,
    departmentKey,
    page.docType,
    'V1.0',
    folderId || null,
    tags,
    options.widthMode || 'full',
    userId,
    userId,
    'wolai',
    page.sourceRecordKey,
    page.sourceUrl || null,
    page.sourceUpdatedAt || null,
    page.payloadHash,
    options.batch,
    'imported',
    'pending'
  );
  const documentId = result.lastInsertRowid;
  replaceShares(db, documentId, shares, userId);
  return documentId;
}

function updateDocument(db, documentId, page, options, userId, folderId) {
  db.prepare(`
    UPDATE documents SET
      title = ?, content = ?, content_text = ?, summary = ?, domain = ?, project_group_id = ?,
      project_code = ?, department_key = ?, doc_type = ?, folder_id = ?, tags = ?,
      updated_by = ?, updated_at = CURRENT_TIMESTAMP,
      source_url = ?, source_updated_at = ?, source_payload_hash = ?, import_batch_no = ?,
      import_status = ?, quality_status = ?
    WHERE id = ?
  `).run(
    page.title,
    JSON.stringify({ blocks: page.blocks }),
    page.contentText,
    page.summary,
    normalizeDomain(options.domain),
    options.projectGroupId || null,
    getProjectCode(options),
    normalizeCode(options.department, 'ALL', 8),
    page.docType,
    folderId || null,
    JSON.stringify(['wolai', ...page.tags].filter(Boolean)),
    userId,
    page.sourceUrl || null,
    page.sourceUpdatedAt || null,
    page.payloadHash,
    options.batch,
    'updated',
    'pending',
    documentId
  );
}

function finalizeDocumentContent(db, documentId, page, qualityStatus, importStatus) {
  db.prepare(`
    UPDATE documents SET
      content = ?, content_text = ?, summary = ?, quality_status = ?, import_status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    JSON.stringify({ blocks: page.blocks }),
    page.contentText,
    page.summary,
    qualityStatus,
    importStatus,
    documentId
  );
}

function findExistingDocument(db, page) {
  const cols = tableColumns(db, 'documents');
  if (!cols.includes('source_system') || !cols.includes('source_record_key')) return null;
  return db.prepare(`
    SELECT id, source_payload_hash, title
    FROM documents
    WHERE source_system = 'wolai'
      AND source_record_key = ?
      AND COALESCE(is_deleted, 0) = 0
    ORDER BY id ASC
    LIMIT 1
  `).get(page.sourceRecordKey);
}

function qualityStatusFromFlags(flags) {
  if (!flags.length) return 'pass';
  if (flags.includes('EMPTY_TEXT')) return 'warning';
  if (flags.some(flag => ['ATTACHMENT_MISSING', 'ATTACHMENT_NOT_FILE'].includes(flag))) return 'warning';
  return 'warning';
}

function insertImportItem(db, jobId, page, action, status, documentId, errorMessage, flags) {
  db.prepare(`
    INSERT INTO document_import_items (
      job_id, source_system, source_record_key, document_id, source_url, title,
      action, status, payload_hash, error_message, quality_flags_json, source_file
    ) VALUES (?, 'wolai', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    jobId,
    page.sourceRecordKey,
    documentId || null,
    page.sourceUrl || null,
    page.title,
    action,
    status,
    page.payloadHash,
    errorMessage || null,
    JSON.stringify(flags || []),
    path.relative(repoRoot, page.filePath || '')
  );
}

function startImportJob(db, options, totalCount, userId) {
  const existing = db.prepare('SELECT id FROM document_import_jobs WHERE batch_no = ?').get(options.batch);
  if (existing) {
    db.prepare('DELETE FROM document_import_items WHERE job_id = ?').run(existing.id);
    db.prepare(`
      UPDATE document_import_jobs SET
        status = 'running', total_count = ?, success_count = 0, created_count = 0,
        updated_count = 0, skipped_count = 0, failed_count = 0, warning_count = 0,
        run_log_json = NULL, started_at = CURRENT_TIMESTAMP, finished_at = NULL,
        workspace_name = ?, input_path = ?, created_by = ?
      WHERE id = ?
    `).run(totalCount, options.workspace, options.input, userId, existing.id);
    return existing.id;
  }
  const result = db.prepare(`
    INSERT INTO document_import_jobs (
      source_system, batch_no, workspace_name, input_path, status, total_count, created_by
    ) VALUES ('wolai', ?, ?, ?, 'running', ?, ?)
  `).run(options.batch, options.workspace, options.input, totalCount, userId);
  return result.lastInsertRowid;
}

function finishImportJob(db, jobId, status, stats, report) {
  db.prepare(`
    UPDATE document_import_jobs SET
      status = ?, success_count = ?, created_count = ?, updated_count = ?, skipped_count = ?,
      failed_count = ?, warning_count = ?, run_log_json = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    status,
    stats.created + stats.updated,
    stats.created,
    stats.updated,
    stats.skipped,
    stats.failed,
    stats.warning,
    JSON.stringify({
      report_file: report.jsonPath,
      md_report_file: report.mdPath,
      dry_run: false,
    }),
    jobId
  );
}

function importPage(db, page, options, userId, shares, jobId) {
  const existing = findExistingDocument(db, page);
  if (existing && existing.source_payload_hash === page.payloadHash && !options.force) {
    insertImportItem(db, jobId, page, 'skip', 'skipped', existing.id, null, page.qualityFlags);
    return { action: 'skipped', documentId: existing.id, qualityFlags: page.qualityFlags };
  }

  const folderId = ensureFolderPath(db, page, options, userId);
  const action = existing ? 'updated' : 'created';
  const documentId = existing
    ? existing.id
    : createDocument(db, page, options, userId, folderId, shares);
  if (existing) {
    updateDocument(db, documentId, page, options, userId, folderId);
    replaceShares(db, documentId, shares, userId);
  }

  const hydrated = hydrateAttachmentBlocks(db, documentId, page, options, userId);
  page.blocks = hydrated.blocks;
  page.contentText = collectBlocksText(page.blocks);
  page.summary = buildSummary(page.contentText);
  const flags = [...new Set([...page.qualityFlags, ...hydrated.qualityFlags])];
  const qualityStatus = qualityStatusFromFlags(flags);
  finalizeDocumentContent(db, documentId, page, qualityStatus, action === 'created' ? 'imported' : 'updated');
  insertImportItem(db, jobId, page, action, qualityStatus === 'pass' ? 'success' : 'warning', documentId, null, flags);
  return { action, documentId, qualityFlags: flags };
}

function buildDryRunItem(page) {
  const remoteRefs = page.attachmentRefs.filter(ref => ref.candidate?.isRemote).length;
  const missingRefs = page.attachmentRefs.filter(ref => ref.candidate?.sourcePath && !fs.existsSync(ref.candidate.sourcePath)).length;
  const flags = [...page.qualityFlags];
  if (remoteRefs) flags.push('REMOTE_ATTACHMENT_ONLY');
  if (missingRefs) flags.push('ATTACHMENT_MISSING');
  return {
    source_record_key: page.sourceRecordKey,
    title: page.title,
    source_url: page.sourceUrl,
    folder_path: page.folderPath,
    block_count: page.blocks.length,
    attachment_ref_count: page.attachmentRefs.length,
    action: 'dry_run',
    status: flags.length ? 'warning' : 'success',
    quality_flags: [...new Set(flags)],
    source_file: path.relative(repoRoot, page.filePath || ''),
  };
}

function writeReport(options, stats, items) {
  ensureDir(options.reportDir);
  const report = {
    batch_no: options.batch,
    source_system: 'wolai',
    workspace_name: options.workspace,
    input_path: options.input,
    target_folder_path: options.targetFolderPath || options.rootFolder,
    preserve_source_folders: Boolean(options.preserveSourceFolders),
    dry_run: options.dryRun,
    generated_at: new Date().toISOString(),
    stats,
    items,
  };
  const jsonPath = path.join(options.reportDir, `${options.batch}.json`);
  const mdPath = path.join(options.reportDir, `${options.batch}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdownReport(report));
  return { jsonPath, mdPath };
}

function renderMarkdownReport(report) {
  const lines = [
    `# Wolai 导入报告 ${report.batch_no}`,
    '',
    `- 输入路径：${report.input_path}`,
    `- 空间：${report.workspace_name}`,
    `- 目标目录：${report.target_folder_path || '-'}`,
    `- 保留源子目录：${report.preserve_source_folders ? '是' : '否'}`,
    `- 模式：${report.dry_run ? 'dry-run' : 'write'}`,
    `- 生成时间：${report.generated_at}`,
    '',
    '## 统计',
    '',
    `- 总数：${report.stats.total}`,
    `- 新增：${report.stats.created}`,
    `- 更新：${report.stats.updated}`,
    `- 跳过：${report.stats.skipped}`,
    `- 失败：${report.stats.failed}`,
    `- 告警：${report.stats.warning}`,
    '',
    '## 明细',
    '',
    '| 状态 | 动作 | 标题 | 质量标记 | 来源文件 |',
    '| --- | --- | --- | --- | --- |',
  ];
  report.items.slice(0, 500).forEach(item => {
    lines.push([
      item.status || '',
      item.action || '',
      escapeMarkdownCell(item.title || ''),
      escapeMarkdownCell((item.quality_flags || item.qualityFlags || []).join(', ')),
      escapeMarkdownCell(item.source_file || ''),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  });
  if (report.items.length > 500) {
    lines.push('');
    lines.push(`仅展示前 500 条，完整明细见 JSON 报告。`);
  }
  return `${lines.join('\n')}\n`;
}

function escapeMarkdownCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.input) throw new Error('请通过 --input 指定 Wolai 导出目录或文件');
  if (!fs.existsSync(options.input)) throw new Error(`输入路径不存在: ${options.input}`);

  const pages = loadPages(options.input, options);
  const stats = { total: pages.length, created: 0, updated: 0, skipped: 0, failed: 0, warning: 0 };
  const items = [];

  if (options.dryRun) {
    pages.forEach(page => {
      const item = buildDryRunItem(page);
      if (item.status === 'warning') stats.warning += 1;
      items.push(item);
    });
    const report = writeReport(options, stats, items);
    console.log(`dry-run 完成：解析 ${stats.total} 篇，告警 ${stats.warning} 篇`);
    console.log(`报告：${report.mdPath}`);
    return;
  }

  const db = new Database(options.db);
  db.pragma('journal_mode = WAL');
  ensureImporterSchema(db);
  const userId = resolveUserId(db, options.createdBy);
  const shares = parseShareRules(options.share);
  const jobId = startImportJob(db, options, pages.length, userId);

  const importOne = db.transaction((page) => importPage(db, page, options, userId, shares, jobId));
  pages.forEach(page => {
    try {
      const result = importOne(page);
      if (result.action === 'created') stats.created += 1;
      else if (result.action === 'updated') stats.updated += 1;
      else if (result.action === 'skipped') stats.skipped += 1;
      if (result.qualityFlags?.length) stats.warning += 1;
      items.push({
        source_record_key: page.sourceRecordKey,
        document_id: result.documentId,
        title: page.title,
        source_url: page.sourceUrl,
        folder_path: page.folderPath,
        action: result.action,
        status: result.qualityFlags?.length ? 'warning' : 'success',
        quality_flags: result.qualityFlags || [],
        source_file: path.relative(repoRoot, page.filePath || ''),
      });
    } catch (error) {
      stats.failed += 1;
      items.push({
        source_record_key: page.sourceRecordKey,
        title: page.title,
        source_url: page.sourceUrl,
        folder_path: page.folderPath,
        action: 'failed',
        status: 'failed',
        error_message: error.message,
        quality_flags: page.qualityFlags || [],
        source_file: path.relative(repoRoot, page.filePath || ''),
      });
      try {
        insertImportItem(db, jobId, page, 'failed', 'failed', null, error.message, page.qualityFlags || []);
      } catch {}
    }
  });

  const report = writeReport(options, stats, items);
  finishImportJob(db, jobId, stats.failed ? 'partial' : 'success', stats, report);
  db.close();

  console.log(`导入完成：新增 ${stats.created}，更新 ${stats.updated}，跳过 ${stats.skipped}，失败 ${stats.failed}，告警 ${stats.warning}`);
  console.log(`报告：${report.mdPath}`);
}

try {
  run();
} catch (error) {
  console.error(`Wolai 导入失败：${error.message}`);
  process.exit(1);
}
