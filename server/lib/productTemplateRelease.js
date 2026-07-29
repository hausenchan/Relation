'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { spawn, spawnSync } = require('node:child_process');

const DEFAULT_PROJECT_PATH = 'zfb-mini-tools/playlet/player-A';
const TEMPLATE_TYPES = new Set(['landing_page', 'mini_program', 'short_drama', 'app_page', 'h5', 'other']);
const TEMPLATE_STATUSES = new Set(['enabled', 'disabled']);
const PLATFORMS = new Set(['android', 'ios', 'h5', 'mini_program', 'quick_app', 'other']);
const RELEASE_STATUSES = new Set(['pending', 'running', 'success', 'failed', 'cancelled']);
const RELEASE_DOMAIN_FIELDS = ['api_domain', 'analytics_domain', 'cdn_domain', 'short_drama_domain'];
const RELEASE_CONFIG_KEYS = {
  ADS_SERVER_API: 'api_domain',
  AD_SERVER_API: 'api_domain',
  ADS_DOT_SERVER_API: 'analytics_domain',
  CDN_DOMAIN: 'cdn_domain',
  DJ_CDN_DOMAIN: 'short_drama_domain',
};
const DEFAULT_UPLOAD_SCRIPT_PATH = path.resolve(__dirname, '../../utils/upload.js');

function text(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateRelativeProjectPath(value, fallback = DEFAULT_PROJECT_PATH) {
  const input = text(value) || fallback;
  if (!input || input.includes('\0') || input.includes('\\')) {
    return { error: '项目目录必须是安全的相对路径' };
  }
  if (path.posix.isAbsolute(input)) return { error: '项目目录不能是绝对路径' };
  const normalized = path.posix.normalize(input);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    return { error: '项目目录不能越过仓库根目录' };
  }
  return { value: normalized };
}

function validateTemplatePayload(payload = {}, { partial = false } = {}) {
  const errors = [];
  const next = {};
  const fields = ['name', 'code', 'template_type', 'budget_type', 'platform', 'version', 'status',
    'project_path', 'description', 'remark'];

  fields.forEach(field => {
    if (partial && !Object.prototype.hasOwnProperty.call(payload, field)) return;
    next[field] = text(payload[field]);
  });

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'name')) {
    if (!next.name) errors.push('模版名称必填');
    if (next.name && next.name.length > 200) errors.push('模版名称不能超过 200 个字符');
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'template_type')) {
    if (!TEMPLATE_TYPES.has(next.template_type)) errors.push('模版类型不合法');
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'status') && !TEMPLATE_STATUSES.has(next.status)) {
    errors.push('模版状态不合法');
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'platform') && next.platform && !PLATFORMS.has(next.platform)) {
    errors.push('平台不合法');
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'project_path') || !partial) {
    const projectPath = validateRelativeProjectPath(next.project_path);
    if (projectPath.error) errors.push(projectPath.error);
    else next.project_path = projectPath.value;
  }
  if (next.code && next.code.length > 100) errors.push('模版编码不能超过 100 个字符');
  return errors.length ? { errors, values: next } : { values: next };
}

function isPrivateIp(hostname) {
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    const parts = hostname.split('.').map(Number);
    return parts[0] === 10 || parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0;
  }
  if (ipVersion === 6) return hostname === '::1' || hostname.toLowerCase().startsWith('fc') || hostname.toLowerCase().startsWith('fd');
  return false;
}

function normalizeDomain(value, { required = false } = {}) {
  const input = text(value).replace(/\/+$/, '');
  if (!input) return required ? { error: '域名不能为空' } : { value: '' };
  if (/[\s\u0000-\u001f]/.test(input)) return { error: '域名不能包含空格或控制字符' };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input) && !/^https:\/\//i.test(input)) return { error: '域名只允许 HTTPS' };
  let url;
  try {
    url = new URL(/^https:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { error: '域名格式不合法' };
  }
  if (url.protocol !== 'https:') return { error: '域名只允许 HTTPS' };
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || isPrivateIp(hostname)) {
    return { error: '域名不能指向本机或内网地址' };
  }
  if (url.username || url.password) return { error: '域名不能包含账号密码' };
  return { value: url.toString().replace(/\/+$/, '') };
}

function isShortDramaTemplate(template = {}) {
  if (typeof template === 'string') return /(短剧|short[\s_-]*drama)/i.test(template);
  if (Object.prototype.hasOwnProperty.call(template, 'template_type')) {
    return String(template.template_type || '').trim() === 'short_drama';
  }
  return [template.name, template.code]
    .filter(Boolean)
    .some(value => /(短剧|short[\s_-]*drama)/i.test(String(value)));
}

function validateReleaseDomains(payload = {}, { required = false, requireAll = false, requireShortDrama = false } = {}) {
  const errors = [];
  const values = {
    api_domain: text(payload.api_domain),
    analytics_domain: text(payload.analytics_domain),
    cdn_domain: text(payload.cdn_domain),
    short_drama_domain: text(payload.short_drama_domain),
  };
  RELEASE_DOMAIN_FIELDS.forEach(field => {
    const result = normalizeDomain(values[field], {
      required: required && (requireAll || (field !== 'short_drama_domain' || requireShortDrama)),
    });
    if (result.error) errors.push(`${field}: ${result.error}`);
    else values[field] = result.value;
  });
  return errors.length ? { errors, values } : { values };
}

function validateReleasePayload(payload = {}) {
  const errors = [];
  const values = {
    app_id: text(payload.app_id || payload.appid),
    template_id: Number(payload.template_id) || 0,
    release_version: text(payload.release_version),
    release_link: text(payload.release_link),
    release_note: text(payload.release_note),
  };
  if (!values.app_id) errors.push('appId 必填，请在提版表单填写产品资产对应的 16 位 APPID');
  if (values.app_id && !/^\d{16}$/.test(values.app_id)) errors.push('appId 必须是 16 位数字，请填写产品资产对应的 APPID');
  if (!values.template_id) errors.push('产品模版必填，请在提版表单选择启用产品模版；如无可选模版，请先到产品模版管理启用模版');
  if (values.release_version.length > 100) errors.push('提版版本不能超过 100 个字符');
  if (values.release_link.length > 500) errors.push('提版链接不能超过 500 个字符');
  if (values.release_note.length > 2000) errors.push('提版说明不能超过 2000 个字符');
  return errors.length ? { errors, values } : { values };
}

function stripAnsiText(value) {
  return String(value || '').replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, '');
}

function sanitizeLogText(value) {
  return stripAnsiText(value)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:authorization|token|cookie|password|credential|private[_ -]?key|identity[_ -]?key|secret)[^=:\n]*[=:])\s*[^\s,;]+/gi, '$1 [REDACTED]')
    .replace(/(?:\/Users\/|\/home\/|[A-Za-z]:\\)[^\s\n]+/g, '[PATH_REDACTED]');
}

function normalizeFailureLine(value) {
  return sanitizeLogText(value)
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function extractCommandFailureReason(output, fallback = '脚本执行失败，请查看脚本运行日志') {
  const sanitized = sanitizeLogText(output);
  const lines = sanitized
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const content = lines.join('\n');

  const moduleMatch = content.match(/(?:cannot\s+(?:resolve|find)\s+module|module\s+not\s+found(?::|\s).*?(?:can't\s+resolve|cannot\s+resolve))\s+['"]([^'"]+)['"]/i);
  if (moduleMatch) {
    return `缺少依赖 ${moduleMatch[1]}，请检查代码模版项目依赖配置，安装该依赖后重试`;
  }

  const commandNotFound = content.match(/(?:command not found|not recognized as an internal or external command):?\s*([^\s'"]+)/i);
  if (commandNotFound) return `命令 ${commandNotFound[1]} 不存在，请在服务器安装后重试`;

  const spawnMissing = content.match(/(?:spawn\s+([^\s]+)\s+ENOENT|ENOENT.*spawn\s+([^\s]+))/i);
  if (spawnMissing) return `命令 ${spawnMissing[1] || spawnMissing[2]} 不存在，请在服务器安装后重试`;

  const permissionLine = lines.find(line => /(?:EACCES|permission denied|operation not permitted|权限不足|没有权限)/i.test(line));
  if (permissionLine) return `执行权限不足：${normalizeFailureLine(permissionLine)}`;

  const npmLine = lines.find(line => /npm ERR!|npm error/i.test(line));
  if (npmLine) return `npm 执行失败：${normalizeFailureLine(npmLine).replace(/^npm (?:ERR!|error)\s*/i, '')}`;

  const gitLine = lines.find(line => /fatal:|git .*failed|git .*失败|repository not found|could not read from remote repository/i.test(line));
  if (gitLine) return `Git 操作失败：${normalizeFailureLine(gitLine).replace(/^fatal:\s*/i, '')}`;

  const explicitUploadLine = lines.find(line => /上传失败[:：]/.test(line));
  if (explicitUploadLine) return normalizeFailureLine(explicitUploadLine).replace(/^上传失败[:：]\s*/, '');

  const minidevLine = lines.find(line => /minidev/i.test(line) && /(?:error|failed|失败|异常|not found|缺少|missing)/i.test(line));
  if (minidevLine) return `minidev 执行失败：${normalizeFailureLine(minidevLine)}`;

  const errorLine = lines.find(line => /(?:^|\s)(?:Error|TypeError|ReferenceError|SyntaxError|RangeError):\s+/i.test(line));
  if (errorLine) return normalizeFailureLine(errorLine);

  const failedLine = lines.find(line => /(?:失败|异常|failed|error)/i.test(line) && !/task was failed/i.test(line));
  if (failedLine) return normalizeFailureLine(failedLine);

  return fallback;
}

function emitCommandOutput(onOutput, streamName, chunk) {
  if (typeof onOutput !== 'function') return;
  sanitizeLogText(chunk)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .forEach(line => onOutput(`${streamName}: ${line}`));
}

function appendLog(existing, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${sanitizeLogText(message)}`;
  return [existing, line].filter(Boolean).join('\n').slice(-200000);
}

function getWorkRoot() {
  return path.resolve(process.env.PRODUCT_TEMPLATE_WORK_ROOT || path.join(__dirname, '..', 'tmp', 'product-template'));
}

function assertWithinRoot(root, candidate) {
  const rootPath = path.resolve(root);
  const candidatePath = path.resolve(candidate);
  if (candidatePath !== rootPath && !candidatePath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error('临时目录越界');
  }
  return candidatePath;
}

function copyProjectDirectory(source, target, options = {}) {
  const maxFiles = Number(options.maxFiles || process.env.PRODUCT_TEMPLATE_MAX_FILES || 5000);
  const maxBytes = Number(options.maxBytes || process.env.PRODUCT_TEMPLATE_MAX_BYTES || 200 * 1024 * 1024);
  const excluded = new Set(options.excluded || ['.git', 'node_modules', 'dist', 'build', '.cache']);
  const stats = { files: 0, bytes: 0 };
  const sourcePath = path.resolve(source);
  const targetPath = assertWithinRoot(options.root || path.dirname(path.resolve(target)), target);

  function copy(from, to) {
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) throw new Error('模版项目不能包含符号链接');
    if (stat.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      fs.readdirSync(from).forEach(name => {
        if (!excluded.has(name)) copy(path.join(from, name), path.join(to, name));
      });
      return;
    }
    stats.files += 1;
    stats.bytes += stat.size;
    if (stats.files > maxFiles) throw new Error(`项目文件数超过限制 ${maxFiles}`);
    if (stats.bytes > maxBytes) throw new Error(`项目体积超过限制 ${maxBytes} bytes`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }

  if (!fs.existsSync(sourcePath)) throw new Error('模版项目目录不存在');
  fs.rmSync(targetPath, { recursive: true, force: true });
  copy(sourcePath, targetPath);
  return { ...stats, path: targetPath };
}

function writeReleaseFiles(projectPath, domains) {
  const files = {
    'release.domains.json': JSON.stringify(domains, null, 2),
    'release.variables.json': JSON.stringify({
      ADS_SERVER_API: domains.api_domain,
      AD_SERVER_API: domains.api_domain,
      ADS_DOT_SERVER_API: domains.analytics_domain,
      CDN_DOMAIN: domains.cdn_domain,
      DJ_CDN_DOMAIN: domains.short_drama_domain || '',
    }, null, 2),
    '.env.release': Object.entries(domains).map(([key, value]) => `${key.toUpperCase()}=${value || ''}`).join('\n') + '\n',
  };
  Object.entries(files).forEach(([name, content]) => {
    fs.writeFileSync(path.join(projectPath, name), content, { mode: 0o600 });
  });

  const configPath = path.join(projectPath, 'config', 'index.js');
  const replacedKeys = [];
  if (fs.existsSync(configPath)) {
    let content = fs.readFileSync(configPath, 'utf8');
    Object.entries(RELEASE_CONFIG_KEYS).forEach(([key, field]) => {
      const pattern = new RegExp(`((?:['"]?${escapeRegExp(key)}['"]?)\\s*:\\s*)(['"])(.*?)\\2`, 'g');
      let count = 0;
      content = content.replace(pattern, (_match, prefix, quote) => {
        count += 1;
        replacedKeys.push(key);
        return `${prefix}${quote}${String(domains[field] || '').replace(new RegExp(quote, 'g'), `\\${quote}`)}${quote}`;
      });
      if (count === 0) return;
    });
    fs.writeFileSync(configPath, content);
  }
  return { files: Object.keys(files), replacedKeys: [...new Set(replacedKeys)] };
}

function getMinidevRuntime() {
  try {
    // minidev is intentionally optional in development; runtime checks explain the missing deployment dependency.
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const loaded = require(process.env.MINIDEV_MODULE || 'minidev');
    const client = loaded?.minidev || loaded?.default || loaded;
    if (!client || typeof client.upload !== 'function') {
      return { available: false, error: 'minidev 模块缺少 upload 接口' };
    }
    return { available: true, client };
  } catch (error) {
    return { available: false, error: '未安装 minidev 依赖或服务端无法加载 minidev' };
  }
}

async function uploadWithMinidev(options) {
  const runtime = getMinidevRuntime();
  if (!runtime.available) {
    const error = new Error(runtime.error);
    error.code = 'MINIDEV_UNAVAILABLE';
    throw error;
  }
  const result = await runtime.client.upload({
    appId: options.appId,
    clientType: 'alipay',
    project: options.projectPath,
    identityKeyPath: options.identityKeyPath,
    version: options.version || undefined,
    versionDescription: options.versionDescription || undefined,
    experience: false,
  });
  return {
    uploadedVersion: result?.version || result?.uploadedVersion || result?.data?.version || options.version || null,
    summary: sanitizeLogText(JSON.stringify(result || {})),
  };
}

function getUploadScriptPath() {
  const configured = text(process.env.PRODUCT_TEMPLATE_UPLOAD_SCRIPT) || DEFAULT_UPLOAD_SCRIPT_PATH;
  let scriptPath = configured;
  try {
    if (/^file:\/\//i.test(configured)) scriptPath = fileURLToPath(configured);
  } catch {
    const error = new Error('提版脚本路径不合法');
    error.code = 'UPLOAD_SCRIPT_INVALID';
    throw error;
  }
  scriptPath = path.resolve(scriptPath);
  if (!fs.existsSync(scriptPath) || !fs.statSync(scriptPath).isFile()) {
    const error = new Error(`提版脚本不存在: ${scriptPath}`);
    error.code = 'UPLOAD_SCRIPT_NOT_FOUND';
    throw error;
  }
  return scriptPath;
}

async function runUploadScript(options) {
  const scriptPath = getUploadScriptPath();
  const shortDramaTemplate = options.shortDramaTemplate === undefined
    ? isShortDramaTemplate(options.template)
    : Boolean(options.shortDramaTemplate);
  const args = [
    scriptPath,
    '--project', options.projectPath,
    '--template', options.template || '',
    '--api-domain', options.domains.api_domain,
    '--analytics-domain', options.domains.analytics_domain,
    '--cdn-domain', options.domains.cdn_domain,
  ];
  args.push('--short-drama-template', shortDramaTemplate ? '1' : '0');
  if (options.domains.short_drama_domain) args.push('--short-drama-domain', options.domains.short_drama_domain);
  args.push('--app-id', options.appId, '--identity-key-path', options.identityKeyPath);
  if (options.version) args.push('--version', options.version);
  if (options.versionDescription) args.push('--version-description', options.versionDescription);

  const result = await runCommand(process.execPath, args, {
    label: 'upload.js',
    cwd: path.dirname(scriptPath),
    timeoutMs: Number(options.timeoutMs || process.env.PRODUCT_TEMPLATE_UPLOAD_TIMEOUT_MS || 15 * 60 * 1000),
    onOutput: options.onLog
      ? message => options.onLog(`upload.js ${message}`)
      : undefined,
    env: {
      ...(options.env || process.env),
      UPLOAD_TEMP_PROJECT_DIR: options.tempProjectPath || path.join(path.dirname(options.projectPath), 'upload-project'),
    },
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').slice(-200000);
  const versionMatch = output.match(/上传版本:\s*([^\s]+)/);
  return {
    uploadedVersion: versionMatch?.[1] || options.version || null,
    summary: sanitizeLogText(output || 'upload.js 执行成功'),
  };
}

function checkRuntime() {
  const result = {};
  ['git', process.execPath].forEach(command => {
    const key = command === process.execPath ? 'node' : command;
    const checked = spawnSync(command, ['--version'], { stdio: 'pipe', timeout: 5000 });
    result[key] = { available: checked.status === 0, version: checked.status === 0 ? String(checked.stdout || '').trim() : null };
  });
  const minidev = getMinidevRuntime();
  result.minidev = { available: minidev.available, error: minidev.error || null };
  try {
    result.upload_script = { available: true, path: getUploadScriptPath() };
  } catch (error) {
    result.upload_script = { available: false, error: error.message };
  }
  const workRoot = getWorkRoot();
  try {
    fs.mkdirSync(workRoot, { recursive: true });
    fs.accessSync(workRoot, fs.constants.W_OK);
    result.work_directory = { available: true, path: workRoot };
  } catch {
    result.work_directory = { available: false, path: workRoot };
  }
  return result;
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const commandLabel = options.label || path.basename(command) || command;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = Number(options.timeoutMs || 10 * 60 * 1000);
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      const error = new Error(`${commandLabel} 执行超时，请检查脚本是否卡住或网络依赖是否无响应`);
      error.code = 'COMMAND_TIMEOUT';
      reject(error);
    }, timeout);
    child.stdout.on('data', chunk => {
      const sanitized = sanitizeLogText(chunk.toString());
      stdout += sanitized.slice(-200000);
      emitCommandOutput(options.onOutput, 'stdout', sanitized);
    });
    child.stderr.on('data', chunk => {
      const sanitized = sanitizeLogText(chunk.toString());
      stderr += sanitized.slice(-200000);
      emitCommandOutput(options.onOutput, 'stderr', sanitized);
    });
    child.once('error', error => {
      clearTimeout(timer);
      const next = new Error(`${commandLabel} 启动失败：${extractCommandFailureReason(error.message, error.message)}`);
      next.code = error.code || 'COMMAND_START_FAILED';
      reject(next);
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      const detail = [stderr, stdout].filter(Boolean).join('\n').slice(-2000);
      const reason = extractCommandFailureReason(detail, '脚本执行失败，请查看脚本运行日志');
      const error = new Error(`${commandLabel} 执行失败（${code}）：${reason}`);
      error.code = 'COMMAND_FAILED';
      error.exitCode = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

module.exports = {
  DEFAULT_PROJECT_PATH,
  PLATFORMS,
  RELEASE_STATUSES,
  TEMPLATE_STATUSES,
  TEMPLATE_TYPES,
  appendLog,
  checkRuntime,
  copyProjectDirectory,
  extractCommandFailureReason,
  getMinidevRuntime,
  getUploadScriptPath,
  getWorkRoot,
  normalizeDomain,
  isShortDramaTemplate,
  prepareReleaseProject: writeReleaseFiles,
  runCommand,
  runUploadScript,
  sanitizeLogText,
  stripAnsiText,
  uploadWithMinidev,
  validateReleaseDomains,
  validateReleasePayload,
  validateRelativeProjectPath,
  validateTemplatePayload,
};
