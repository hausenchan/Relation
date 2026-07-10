const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');

const OSS_PATH_PREFIX = 'oss:';
const DEFAULT_BUCKET = 'mid-relation-test';
const DEFAULT_ENDPOINT = 'oss-cn-shenzhen.aliyuncs.com';

let cachedClient = null;
let cachedConfigKey = '';

function getOssConfig() {
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID || process.env.OSS_ACCESS_KEY_ID || '';
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || process.env.OSS_ACCESS_KEY_SECRET || '';
  const bucket = process.env.ALIYUN_OSS_BUCKET || process.env.OSS_BUCKET || DEFAULT_BUCKET;
  const endpoint = process.env.ALIYUN_OSS_ENDPOINT || process.env.OSS_ENDPOINT || DEFAULT_ENDPOINT;
  const secure = process.env.ALIYUN_OSS_SECURE !== 'false';
  return { accessKeyId, accessKeySecret, bucket, endpoint, secure };
}

function isOssConfigured() {
  const config = getOssConfig();
  return Boolean(config.accessKeyId && config.accessKeySecret && config.bucket && config.endpoint);
}

function getOssClient() {
  const config = getOssConfig();
  if (!isOssConfigured()) {
    throw new Error('OSS 未配置，请设置 ALIYUN_OSS_ACCESS_KEY_ID 和 ALIYUN_OSS_ACCESS_KEY_SECRET');
  }
  const configKey = JSON.stringify(config);
  if (!cachedClient || cachedConfigKey !== configKey) {
    cachedClient = new OSS({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      endpoint: config.endpoint,
      secure: config.secure,
      timeout: '120s',
    });
    cachedConfigKey = configKey;
  }
  return cachedClient;
}

function isOssPath(value) {
  return typeof value === 'string' && value.startsWith(OSS_PATH_PREFIX);
}

function getOssKey(value) {
  return isOssPath(value) ? value.slice(OSS_PATH_PREFIX.length) : '';
}

function toOssPath(key) {
  return key ? `${OSS_PATH_PREFIX}${key}` : '';
}

function normalizeObjectPrefix(prefix = 'attachments') {
  return String(prefix || 'attachments')
    .trim()
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9/_-]+/g, '-')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/') || 'attachments';
}

function buildObjectKey(file = {}, prefix = 'attachments') {
  const originalName = file.originalname || file.filename || '';
  const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9_-]/g, '');
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = crypto.randomBytes(10).toString('hex');
  return `${normalizeObjectPrefix(prefix)}/${year}/${month}/${day}/${Date.now()}-${random}${ext}`;
}

function encodeOssKey(key) {
  return Buffer.from(String(key || ''), 'utf8').toString('base64url');
}

function decodeOssKey(encoded) {
  return Buffer.from(String(encoded || ''), 'base64url').toString('utf8');
}

function getStoredFileUrl(filepath) {
  if (!filepath) return '';
  if (isOssPath(filepath)) {
    const key = getOssKey(filepath);
    return key ? `/oss/${encodeOssKey(key)}` : '';
  }
  return `/uploads/${filepath}`;
}

async function uploadLocalFileToOss(file, prefix = 'attachments') {
  if (!isOssConfigured()) return null;
  const localPath = file.path;
  if (!localPath || !fs.existsSync(localPath)) {
    throw new Error('上传临时文件不存在');
  }
  const key = buildObjectKey(file, prefix);
  const headers = {};
  if (file.mimetype) headers['Content-Type'] = file.mimetype;
  await getOssClient().put(key, localPath, { headers });
  return { key, filepath: toOssPath(key), url: getStoredFileUrl(toOssPath(key)) };
}

async function deleteOssObjectByPath(filepath) {
  if (!isOssPath(filepath) || !isOssConfigured()) return;
  const key = getOssKey(filepath);
  if (!key) return;
  await getOssClient().delete(key);
}

async function pipeOssObjectToResponse(res, key, options = {}) {
  if (!key) {
    const error = new Error('OSS 文件不存在');
    error.statusCode = 404;
    throw error;
  }
  const result = await getOssClient().getStream(key);
  const headers = result?.res?.headers || {};
  const filename = options.filename || '';
  const disposition = options.disposition || 'attachment';
  const contentType = options.mimetype || headers['content-type'] || 'application/octet-stream';
  const contentLength = options.size || headers['content-length'];

  res.setHeader('Content-Type', contentType);
  if (filename) {
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`);
  }
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }
  result.stream.pipe(res);
  result.stream.on('error', (err) => {
    console.error('OSS 文件流错误:', err);
    if (!res.headersSent) res.status(500).json({ error: '文件读取失败' });
  });
}

module.exports = {
  decodeOssKey,
  deleteOssObjectByPath,
  getOssKey,
  getStoredFileUrl,
  isOssConfigured,
  isOssPath,
  pipeOssObjectToResponse,
  uploadLocalFileToOss,
};
