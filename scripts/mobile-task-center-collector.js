#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_API_BASE = 'http://127.0.0.1:3001/api';
const DEFAULT_CONFIG = path.join(__dirname, 'mobile-task-apps.json');
const DEFAULT_EXAMPLE_CONFIG = path.join(__dirname, 'mobile-task-apps.example.json');
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'tmp', 'mobile-task-center');

function parseArgs(argv) {
  const args = {
    apiBase: process.env.RELATION_API_BASE || DEFAULT_API_BASE,
    token: process.env.RELATION_API_TOKEN || '',
    username: process.env.RELATION_USERNAME || '',
    password: process.env.RELATION_PASSWORD || '',
    config: process.env.MOBILE_TASK_CONFIG || DEFAULT_CONFIG,
    configSource: process.env.MOBILE_TASK_CONFIG_SOURCE || 'file',
    outputDir: process.env.MOBILE_TASK_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
    adbPath: process.env.ADB_PATH || 'adb',
    device: process.env.ADB_SERIAL || '',
    app: '',
    dryRun: false,
    syncApps: false,
    syncAppsOnly: false,
    submitEmpty: false,
    validateConfig: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--api') args.apiBase = next();
    else if (arg === '--token') args.token = next();
    else if (arg === '--username') args.username = next();
    else if (arg === '--password') args.password = next();
    else if (arg === '--config') args.config = next();
    else if (arg === '--config-source') args.configSource = next();
    else if (arg === '--output-dir') args.outputDir = next();
    else if (arg === '--adb') args.adbPath = next();
    else if (arg === '--device') args.device = next();
    else if (arg === '--app') args.app = next();
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--sync-apps') args.syncApps = true;
    else if (arg === '--sync-apps-only') { args.syncApps = true; args.syncAppsOnly = true; }
    else if (arg === '--submit-empty') args.submitEmpty = true;
    else if (arg === '--validate-config') args.validateConfig = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`未知参数：${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`
手机任务中心采集器

用法：
  node scripts/mobile-task-center-collector.js --config scripts/mobile-task-apps.json --token <JWT>

常用参数：
  --api <url>          后端 API 地址，默认 ${DEFAULT_API_BASE}
  --token <jwt>        登录后的 Bearer Token，也可用 RELATION_API_TOKEN
  --username <name>    没有 token 时可用账号登录
  --password <pwd>     没有 token 时可用账号登录
  --config <file>      App 规则配置，默认 scripts/mobile-task-apps.json
  --config-source <x>  配置来源：file 或 api，api 会读取后台 App 配置
  --output-dir <dir>   截图输出目录，默认 tmp/mobile-task-center
  --adb <path>         adb 可执行文件路径，也可用 ADB_PATH
  --device <serial>    指定 adb 设备序列号
  --app <name>         只采集指定 App
  --dry-run            只采集并打印结果，不上传截图、不入库
  --sync-apps          将配置里的 App 写入 /mobile-task-center/apps
  --sync-apps-only     只同步配置到后台，不连接手机、不执行采集
  --submit-empty       未抓到支付宝小程序时也上报 failed 采集日志
  --validate-config    只校验配置文件，不连接手机、不调用后端

采集逻辑：
  进入任务中心后逐个点击任务按钮，只有实际跳转到支付宝小程序后才采集。
  跳转后会尝试打开支付宝小程序右上角菜单或详情页，抓取小程序名称、主体和 deeplink。
  每个 App 会在输出目录生成 run_report JSON，记录每个按钮的跳转、跳过和入库结果。

配置模板：
  scripts/mobile-task-apps.example.json
`.trim());
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function safeParseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildAppConfigFromApiRow(row) {
  const collectorConfig = safeParseJson(row.collector_config, {});
  const entry = safeParseJson(row.task_center_entry, []);
  return {
    ...(collectorConfig && typeof collectorConfig === 'object' && !Array.isArray(collectorConfig) ? collectorConfig : {}),
    app_name: row.app_name,
    package_name: row.package_name,
    enabled: row.enabled !== 0,
    sort_order: row.sort_order || 0,
    task_center_entry: Array.isArray(entry) ? entry : [],
    remark: row.remark || '',
  };
}

function assertArrayField(app, field, errors, { required = false } = {}) {
  if (required && !Array.isArray(app[field])) {
    errors.push(`${app.app_name || '未命名 App'} 缺少数组字段 ${field}`);
    return;
  }
  if (app[field] !== undefined && !Array.isArray(app[field])) {
    errors.push(`${app.app_name || '未命名 App'} 的 ${field} 必须是数组`);
  }
}

function validateStep(step, appName, index, errors) {
  if (!step || typeof step !== 'object') {
    errors.push(`${appName} task_center_entry[${index}] 必须是对象`);
    return;
  }
  const type = step.type;
  if (!['wait', 'tap', 'text', 'keyevent', 'swipe'].includes(type)) {
    errors.push(`${appName} task_center_entry[${index}] type 不支持：${type}`);
    return;
  }
  if (type === 'tap' && (step.x === undefined || step.y === undefined)) {
    errors.push(`${appName} task_center_entry[${index}] tap 需要 x/y`);
  }
  if (type === 'text' && !step.value) {
    errors.push(`${appName} task_center_entry[${index}] text 需要 value`);
  }
  if (type === 'keyevent' && !step.value) {
    errors.push(`${appName} task_center_entry[${index}] keyevent 需要 value`);
  }
  if (type === 'swipe' && [step.x1, step.y1, step.x2, step.y2].some(value => value === undefined)) {
    errors.push(`${appName} task_center_entry[${index}] swipe 需要 x1/y1/x2/y2`);
  }
}

function validateRegexList(app, field, errors) {
  (app[field] || []).forEach((pattern, index) => {
    try {
      new RegExp(pattern);
    } catch (err) {
      errors.push(`${app.app_name || '未命名 App'} ${field}[${index}] 正则无效：${err.message}`);
    }
  });
}

function validateConfig(config, selectedApp = '') {
  const errors = [];
  if (!config || typeof config !== 'object') errors.push('配置文件必须是 JSON 对象');
  if (!Array.isArray(config?.apps)) errors.push('配置文件缺少 apps 数组');
  const apps = (config?.apps || []).filter(app => app.enabled !== false);
  if (!apps.length) errors.push('没有启用的 App');

  apps.forEach((app, index) => {
    const appName = app.app_name || `apps[${index}]`;
    if (!app.app_name) errors.push(`${appName} 缺少 app_name`);
    if (!app.package_name) errors.push(`${appName} 缺少 package_name`);
    assertArrayField(app, 'task_center_entry', errors, { required: true });
    assertArrayField(app, 'task_button_texts', errors);
    assertArrayField(app, 'task_button_patterns', errors);
    assertArrayField(app, 'alipay_package_names', errors);
    assertArrayField(app, 'alipay_more_menu_steps', errors);
    assertArrayField(app, 'alipay_about_texts', errors);
    assertArrayField(app, 'mini_program_name_patterns', errors);
    assertArrayField(app, 'company_entity_patterns', errors);
    (app.task_center_entry || []).forEach((step, stepIndex) => validateStep(step, appName, stepIndex, errors));
    (app.alipay_more_menu_steps || []).forEach((step, stepIndex) => validateStep(step, `${appName} alipay_more_menu_steps`, stepIndex, errors));
    validateRegexList(app, 'task_button_patterns', errors);
    validateRegexList(app, 'mini_program_name_patterns', errors);
    validateRegexList(app, 'company_entity_patterns', errors);
  });

  if (selectedApp && !apps.some(app => app.app_name === selectedApp)) {
    errors.push(`未找到启用的 App：${selectedApp}`);
  }

  if (errors.length) {
    const err = new Error(`配置校验失败：\n- ${errors.join('\n- ')}`);
    err.validationErrors = errors;
    throw err;
  }
  return apps.filter(app => !selectedApp || app.app_name === selectedApp);
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function safeFilePart(value) {
  return String(value || 'unknown')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function createAdb(adbPath, serial) {
  return function adb(args, options = {}) {
    const fullArgs = serial ? ['-s', serial, ...args] : args;
    return execFileSync(adbPath, fullArgs, {
      encoding: options.encoding === undefined ? 'utf8' : options.encoding,
      maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
      stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    });
  };
}

function checkDevice(adb) {
  const output = adb(['devices']);
  const devices = output
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => /\sdevice$/.test(line));
  if (!devices.length) {
    throw new Error('没有检测到可用 ADB 设备，请先连接手机并授权 USB 调试。');
  }
}

function keepDeviceAwake(adb) {
  try { adb(['shell', 'svc', 'power', 'stayon', 'true']); } catch {}
  try { adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']); } catch {}
  try { adb(['shell', 'wm', 'dismiss-keyguard']); } catch {}
}

function startApp(adb, app) {
  if (!app.package_name) {
    throw new Error(`${app.app_name} 缺少 package_name，无法自动打开 App。`);
  }
  adb(['shell', 'monkey', '-p', app.package_name, '-c', 'android.intent.category.LAUNCHER', '1']);
  sleep(Number(app.launch_wait_ms) || 5000);
}

function parseBounds(bounds) {
  const match = String(bounds || '').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return null;
  const [, left, top, right, bottom] = match.map(Number);
  return {
    left,
    top,
    right,
    bottom,
    x: Math.round((left + right) / 2),
    y: Math.round((top + bottom) / 2),
  };
}

function parseUiNodes(xml) {
  const nodes = [];
  const nodeRegex = /<node\b[^>]*>/g;
  const attrRegex = /(\w+(?:-\w+)*)="([^"]*)"/g;
  let nodeMatch;
  while ((nodeMatch = nodeRegex.exec(xml))) {
    const attrs = {};
    let attrMatch;
    while ((attrMatch = attrRegex.exec(nodeMatch[0]))) {
      attrs[attrMatch[1]] = decodeXmlEntities(attrMatch[2]);
    }
    const bounds = parseBounds(attrs.bounds);
    const text = [attrs.text, attrs['content-desc']].filter(Boolean).join(' ').trim();
    nodes.push({ ...attrs, bounds, visibleText: text });
  }
  return nodes;
}

function dumpUi(adb) {
  adb(['shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml']);
  const xml = adb(['exec-out', 'cat', '/sdcard/window_dump.xml'], { maxBuffer: 30 * 1024 * 1024 });
  return { xml, nodes: parseUiNodes(xml) };
}

function matchText(text, value, mode = 'contains') {
  const t = String(text || '').trim();
  const v = String(value || '').trim();
  if (!t || !v) return false;
  if (mode === 'exact') return t === v;
  if (mode === 'regex') return new RegExp(v).test(t);
  return t.includes(v);
}

function findNodeByStep(nodes, step) {
  if (step.type === 'tap') return { bounds: { x: Number(step.x), y: Number(step.y) } };
  if (step.type !== 'text') return null;
  return nodes.find(node => matchText(node.visibleText, step.value, step.match) && node.bounds);
}

function runEntrySteps(adb, app) {
  const steps = Array.isArray(app.task_center_entry) ? app.task_center_entry : [];
  for (const step of steps) {
    if (step.type === 'wait') {
      sleep(Number(step.wait_ms) || 1000);
      continue;
    }
    if (step.type === 'keyevent') {
      adb(['shell', 'input', 'keyevent', String(step.value)]);
      sleep(Number(step.wait_ms) || 1000);
      continue;
    }
    if (step.type === 'swipe') {
      adb(['shell', 'input', 'swipe', String(step.x1), String(step.y1), String(step.x2), String(step.y2), String(step.duration_ms || 300)]);
      sleep(Number(step.wait_ms) || 1000);
      continue;
    }

    const { nodes } = dumpUi(adb);
    const node = findNodeByStep(nodes, step);
    if (!node || !node.bounds) {
      if (step.optional) continue;
      throw new Error(`没有找到入口节点：${step.value || step.type}`);
    }
    adb(['shell', 'input', 'tap', String(node.bounds.x), String(node.bounds.y)]);
    sleep(Number(step.wait_ms) || 1500);
  }
}

function takeScreenshot(adb, outputDir, appName) {
  ensureDir(outputDir);
  const filename = `${safeFilePart(appName)}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const file = path.join(outputDir, filename);
  const png = adb(['exec-out', 'screencap', '-p'], { encoding: null, maxBuffer: 30 * 1024 * 1024 });
  fs.writeFileSync(file, png);
  return file;
}

function writeRunReport(outputDir, appName, report) {
  ensureDir(outputDir);
  const filename = `${safeFilePart(appName)}_run_report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const file = path.join(outputDir, filename);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  return file;
}

function nodeTextList(nodes) {
  return nodes
    .map(node => node.visibleText)
    .map(text => String(text || '').trim())
    .filter(Boolean);
}

function firstRegexMatch(text, patterns) {
  for (const pattern of patterns || []) {
    const regex = new RegExp(pattern, 'i');
    const match = String(text || '').match(regex);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function extractCompanyName(text, app) {
  const defaultPatterns = [
    '主体(?:名称)?[:：\\s]+([^\\n，。；;]+(?:有限责任公司|股份有限公司|有限公司|公司))',
    '开发者[:：\\s]+([^\\n，。；;]+(?:有限责任公司|股份有限公司|有限公司|公司))',
    '运营主体[:：\\s]+([^\\n，。；;]+(?:有限责任公司|股份有限公司|有限公司|公司))',
    '服务提供(?:商|方)?[:：\\s]+([^\\n，。；;]+(?:有限责任公司|股份有限公司|有限公司|公司))',
  ];
  const configured = firstRegexMatch(text, [...(app.company_entity_patterns || []), ...defaultPatterns]);
  if (configured) return configured;
  const match = String(text || '').match(/[\u4e00-\u9fa5A-Za-z0-9（）()·]{2,}(?:有限责任公司|股份有限公司|有限公司|公司)/);
  return match ? match[0].trim() : '';
}

function cleanMiniProgramName(value) {
  return String(value || '')
    .replace(/^[：:，,\s]+|[：:，,\s]+$/g, '')
    .replace(/^(打开|体验|试玩|进入|去|完成|搜索)/, '')
    .replace(/(支付宝小程序|小程序|任务|赚.*|奖励.*).*$/, '')
    .trim();
}

function extractMiniProgramName(text, app) {
  const defaultPatterns = [
    '小程序名称[:：\\s]+([^\\n，。；;]{2,30})',
    '名称[:：\\s]+([^\\n，。；;]{2,30})',
    '打开(.+?)支付宝小程序',
    '体验(.+?)支付宝小程序',
    '试玩(.+?)支付宝小程序',
    '进入(.+?)小程序',
  ];
  const configured = firstRegexMatch(text, [
    ...(app.alipay_mini_program_name_patterns || []),
    ...(app.mini_program_name_patterns || []),
    ...defaultPatterns,
  ]);
  if (configured) return cleanMiniProgramName(configured);

  const lines = String(text || '').split(/\s+/).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/(?:打开|体验|试玩|进入|搜索|去)(.{2,30}?)(?:支付宝小程序|小程序)/);
    if (match?.[1]) return cleanMiniProgramName(match[1]);
  }

  const candidate = lines.find(line => line.includes('支付宝') || line.includes('小程序'));
  return cleanMiniProgramName(candidate || '');
}

function extractDeeplink(text) {
  const match = String(text || '').match(/\b(?:alipays|alipay):\/\/[^\s"'<>）)]+/i);
  return match ? match[0].trim() : '';
}

function readLogcatForDeeplink(adb) {
  try {
    const logs = adb(['logcat', '-d', '-v', 'brief'], { maxBuffer: 50 * 1024 * 1024 });
    return extractDeeplink(logs);
  } catch {
    return '';
  }
}

function asArray(value, fallback = []) {
  return Array.isArray(value) && value.length ? value : fallback;
}

function uniqueTexts(texts) {
  return [...new Set(texts.map(text => String(text || '').trim()).filter(Boolean))];
}

function getScreenSize(adb) {
  try {
    const output = adb(['shell', 'wm', 'size']);
    const match = output.match(/Physical size:\s*(\d+)x(\d+)/i) || output.match(/Override size:\s*(\d+)x(\d+)/i);
    if (match) return { width: Number(match[1]), height: Number(match[2]) };
  } catch {}
  return { width: 1080, height: 2400 };
}

function tapBounds(adb, bounds) {
  adb(['shell', 'input', 'tap', String(bounds.x), String(bounds.y)]);
}

function runStep(adb, step) {
  if (step.type === 'wait') {
    sleep(Number(step.wait_ms) || 1000);
    return;
  }
  if (step.type === 'keyevent') {
    adb(['shell', 'input', 'keyevent', String(step.value)]);
    sleep(Number(step.wait_ms) || 1000);
    return;
  }
  if (step.type === 'swipe') {
    adb(['shell', 'input', 'swipe', String(step.x1), String(step.y1), String(step.x2), String(step.y2), String(step.duration_ms || 300)]);
    sleep(Number(step.wait_ms) || 1000);
    return;
  }
  if (step.type === 'tap') {
    adb(['shell', 'input', 'tap', String(step.x), String(step.y)]);
    sleep(Number(step.wait_ms) || 1000);
  }
}

function getCurrentFocus(adb) {
  const candidates = [];
  try { candidates.push(adb(['shell', 'dumpsys', 'window', 'windows'], { maxBuffer: 10 * 1024 * 1024 })); } catch {}
  try { candidates.push(adb(['shell', 'dumpsys', 'activity', 'activities'], { maxBuffer: 20 * 1024 * 1024 })); } catch {}
  const raw = candidates.join('\n');
  const focus = raw.match(/mCurrentFocus=.*?\s([A-Za-z0-9_.]+)\/([A-Za-z0-9_.$]+)/)
    || raw.match(/mFocusedApp=.*?\s([A-Za-z0-9_.]+)\/([A-Za-z0-9_.$]+)/)
    || raw.match(/topResumedActivity=.*?\s([A-Za-z0-9_.]+)\/([A-Za-z0-9_.$]+)/)
    || raw.match(/ACTIVITY\s+([A-Za-z0-9_.]+)\/([A-Za-z0-9_.$]+)/);
  return {
    packageName: focus?.[1] || '',
    activity: focus?.[2] || '',
    raw,
  };
}

function isAlipayFocus(focus, app) {
  const packages = asArray(app.alipay_package_names, ['com.eg.android.AlipayGphone']);
  return packages.some(packageName => focus.packageName === packageName || focus.raw.includes(`${packageName}/`));
}

function readActivityForDeeplink(adb) {
  try {
    const output = adb(['shell', 'dumpsys', 'activity', 'activities'], { maxBuffer: 50 * 1024 * 1024 });
    return extractDeeplink(output);
  } catch {
    return '';
  }
}

function waitForJump(adb, app, timeoutMs) {
  const startedAt = Date.now();
  const observed = [];
  let lastExternal = null;
  while (Date.now() - startedAt < timeoutMs) {
    const focus = getCurrentFocus(adb);
    if (focus.packageName) observed.push(`${focus.packageName}/${focus.activity}`);
    if (isAlipayFocus(focus, app)) return { type: 'alipay', focus, observed };
    if (focus.packageName && app.package_name && focus.packageName !== app.package_name && focus.packageName !== 'com.android.systemui') {
      lastExternal = focus;
    }
    sleep(800);
  }
  return lastExternal
    ? { type: 'external', focus: lastExternal, observed }
    : { type: 'none', focus: getCurrentFocus(adb), observed };
}

function isActionText(text, app) {
  const value = String(text || '').trim();
  if (!value) return false;
  const texts = asArray(app.task_button_texts, [
    '去完成', '去支付宝', '打开', '立即打开', '立即体验', '去体验',
    '去看看', '去浏览', '开始任务', '做任务', '试玩', '体验', '进入',
  ]);
  if (texts.some(item => value === item || value.includes(item))) return true;
  const patterns = asArray(app.task_button_patterns, [
    '^(去|立即|打开|开始).{0,10}$',
    '^(做任务|试玩|体验|进入).{0,10}$',
  ]);
  return patterns.some(pattern => new RegExp(pattern).test(value));
}

function findTaskActionNodes(nodes, app) {
  const seen = new Set();
  return nodes
    .filter(node => node.bounds && node['enabled'] !== 'false' && isActionText(node.visibleText, app))
    .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left)
    .filter(node => {
      const key = `${node.visibleText}|${node.bounds.left},${node.bounds.top},${node.bounds.right},${node.bounds.bottom}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildTaskContext(nodes, button) {
  const bounds = button.bounds;
  const nearby = nodes
    .filter(node => node.bounds && node.visibleText)
    .filter(node => node.bounds.top >= bounds.top - 360 && node.bounds.top <= bounds.bottom + 120)
    .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);
  const texts = uniqueTexts(nearby.map(node => node.visibleText));
  const actionText = button.visibleText;
  const title = [...texts].reverse().find(text =>
    text !== actionText && !isActionText(text, { task_button_texts: [actionText], task_button_patterns: [] })
  ) || actionText;
  return {
    title,
    description: texts.join('\n'),
    key: `${title}|${actionText}|${Math.round(bounds.top / 10)}`,
  };
}

function swipeTaskList(adb, app) {
  if (app.scan_swipe) {
    runStep(adb, app.scan_swipe);
    return;
  }
  const size = getScreenSize(adb);
  adb(['shell', 'input', 'swipe', String(Math.round(size.width / 2)), String(Math.round(size.height * 0.78)), String(Math.round(size.width / 2)), String(Math.round(size.height * 0.28)), '450']);
  sleep(Number(app.after_scan_swipe_wait_ms) || 1500);
}

function openTaskCenter(adb, app, pageIndex = 0) {
  startApp(adb, app);
  runEntrySteps(adb, app);
  for (let i = 0; i < pageIndex; i += 1) swipeTaskList(adb, app);
}

function tryTapAlipayButtonFromDetail(adb, app) {
  const { nodes } = dumpUi(adb);
  const buttons = nodes.filter(node => node.bounds && node['enabled'] !== 'false')
    .filter(node => {
      const text = String(node.visibleText || '');
      return asArray(app.alipay_button_texts, ['去支付宝', '打开支付宝', '支付宝', '去完成', '立即体验'])
        .some(keyword => text.includes(keyword));
    })
    .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.left - b.bounds.left);
  if (!buttons.length) return false;
  tapBounds(adb, buttons[0].bounds);
  sleep(Number(app.after_task_tap_wait_ms) || 2500);
  return true;
}

function openAlipayMiniProgramMenu(adb, app) {
  const steps = Array.isArray(app.alipay_more_menu_steps) ? app.alipay_more_menu_steps : [];
  if (steps.length) {
    steps.forEach(step => runStep(adb, step));
    return true;
  }

  const { nodes } = dumpUi(adb);
  const moreNode = nodes.find(node =>
    node.bounds && /更多|菜单|more/i.test(node.visibleText || '')
  );
  if (moreNode?.bounds) {
    tapBounds(adb, moreNode.bounds);
  } else {
    const size = getScreenSize(adb);
    adb(['shell', 'input', 'tap', String(size.width - 70), String(Math.max(70, Math.round(size.height * 0.045)))]);
  }
  sleep(Number(app.after_alipay_menu_wait_ms) || 1200);
  return true;
}

function tryOpenAlipayAboutPage(adb, app) {
  const texts = asArray(app.alipay_about_texts, ['关于', '小程序详情', '小程序信息', '关于此小程序', '更多资料', '主体信息']);
  const { nodes } = dumpUi(adb);
  const node = nodes.find(item =>
    item.bounds && texts.some(text => item.visibleText === text || item.visibleText.includes(text))
  );
  if (!node?.bounds) return false;
  tapBounds(adb, node.bounds);
  sleep(Number(app.after_alipay_about_wait_ms) || 1500);
  return true;
}

function extractMiniProgramNameFromAlipay(nodes, text, app) {
  const configured = extractMiniProgramName(text, app);
  if (configured && !['支付宝', '小程序'].includes(configured)) return configured;

  const blocked = /^(返回|关闭|更多|菜单|收藏|分享|设置|反馈|投诉|重新进入小程序|浮窗|添加到桌面|支付宝|小程序)$/;
  const titleCandidates = nodes
    .filter(node => node.bounds && node.visibleText && node.bounds.top < 320)
    .map(node => node.visibleText)
    .concat(nodeTextList(nodes))
    .map(cleanMiniProgramName)
    .filter(textValue => textValue && textValue.length >= 2 && textValue.length <= 30 && !blocked.test(textValue));
  return uniqueTexts(titleCandidates)[0] || '';
}

function captureAlipayMiniProgramInfo(adb, app, taskContext) {
  sleep(Number(app.after_alipay_open_wait_ms) || 3500);
  const beforeMenu = dumpUi(adb);
  const beforeTexts = nodeTextList(beforeMenu.nodes);
  const linkFromActivity = readActivityForDeeplink(adb);
  const linkFromLogs = readLogcatForDeeplink(adb);

  openAlipayMiniProgramMenu(adb, app);
  const menuDump = dumpUi(adb);
  tryOpenAlipayAboutPage(adb, app);
  const detailDump = dumpUi(adb);
  const allTexts = uniqueTexts([
    ...beforeTexts,
    ...nodeTextList(menuDump.nodes),
    ...nodeTextList(detailDump.nodes),
  ]);
  const allText = allTexts.join('\n');
  const productLink = linkFromActivity || linkFromLogs || extractDeeplink(allText);

  return {
    miniProgramName: extractMiniProgramNameFromAlipay([...beforeMenu.nodes, ...menuDump.nodes, ...detailDump.nodes], allText, app),
    companyEntityName: extractCompanyName(allText, app),
    productLink,
    captureMethod: productLink ? (linkFromActivity ? 'activity_intent' : linkFromLogs ? 'logcat' : 'alipay_menu_text') : '',
    taskDescription: [taskContext.description, allText].filter(Boolean).join('\n--- 支付宝小程序信息 ---\n').slice(0, 2000),
  };
}

function returnToTaskCenter(adb, app, pageIndex) {
  for (let i = 0; i < Number(app.back_steps_after_task || 3); i += 1) {
    try { adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']); } catch {}
    sleep(500);
  }
  openTaskCenter(adb, app, pageIndex);
}

async function apiRequest(apiBase, token, method, route, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let requestBody;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }
  const res = await fetch(`${apiBase}${route}`, { method, headers, body: requestBody });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${route} ${res.status}: ${text}`);
  return data;
}

async function login(apiBase, username, password) {
  if (!username || !password) return '';
  const data = await apiRequest(apiBase, '', 'POST', '/auth/login', { username, password });
  return data.token || '';
}

async function uploadScreenshot(apiBase, token, file) {
  const form = new FormData();
  const bytes = fs.readFileSync(file);
  form.append('source_type', 'mobile_task_capture');
  form.append('source_id', '0');
  form.append('files', new Blob([bytes], { type: 'image/png' }), path.basename(file));
  const res = await fetch(`${apiBase}/attachments/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`上传截图失败 ${res.status}: ${text}`);
  return Array.isArray(data) ? data : [];
}

async function syncAppConfig(apiBase, token, app) {
  const {
    app_name,
    package_name,
    enabled,
    sort_order,
    task_center_entry,
    remark,
    ...collectorConfig
  } = app;
  return {
    app_name: app.app_name,
    package_name: app.package_name || '',
    task_center_entry: JSON.stringify(app.task_center_entry || []),
    collector_config: JSON.stringify(collectorConfig || {}),
    enabled: app.enabled !== false,
    sort_order: app.sort_order || 0,
    remark: app.remark || '',
  };
}

async function fetchConfiguredApps(apiBase, token) {
  const rows = await apiRequest(apiBase, token, 'GET', '/mobile-task-center/apps');
  return (Array.isArray(rows) ? rows : []).map(buildAppConfigFromApiRow);
}

async function syncAppConfigs(apiBase, token, apps) {
  const existingRows = await apiRequest(apiBase, token, 'GET', '/mobile-task-center/apps');
  const existingByName = new Map((Array.isArray(existingRows) ? existingRows : []).map(row => [row.app_name, row]));
  const results = [];

  for (const app of apps) {
    const payload = await syncAppConfig(apiBase, token, app);
    const existing = existingByName.get(app.app_name);
    const result = existing
      ? await apiRequest(apiBase, token, 'PUT', `/mobile-task-center/apps/${existing.id}`, payload)
      : await apiRequest(apiBase, token, 'POST', '/mobile-task-center/apps', payload);
    results.push({ app_name: app.app_name, id: existing?.id || result.id, updated: Boolean(existing), result });
  }

  return results;
}

async function submitCollectedPayload({ args, token, payload, screenshot }) {
  if (!args.dryRun && token && (payload.mini_program_name || args.submitEmpty)) {
    const uploaded = await uploadScreenshot(args.apiBase, token, screenshot);
    payload.screenshot_attachment_ids = uploaded.map(item => item.id);
    const result = await apiRequest(args.apiBase, token, 'POST', '/mobile-task-center/records', payload);
    console.log(JSON.stringify({ payload, result, screenshot }, null, 2));
    return result;
  }

  console.log(JSON.stringify({
    dry_run: args.dryRun || !token,
    skipped_submit_reason: !payload.mini_program_name && !args.submitEmpty ? '未抓到小程序名，未上报；可加 --submit-empty 记录 failed 日志' : '',
    payload,
    screenshot,
  }, null, 2));
  return null;
}

async function collectTaskButton({ adb, app, args, token, button, taskContext, pageIndex }) {
  console.log(`[任务] 点击按钮：${taskContext.title} / ${button.visibleText}`);
  const attempt = {
    source_app: app.app_name,
    page_index: pageIndex,
    task_title: taskContext.title,
    task_description: taskContext.description,
    button_text: button.visibleText,
    button_bounds: button.bounds,
    started_at: new Date().toISOString(),
    status: 'pending',
  };
  try { adb(['logcat', '-c']); } catch {}
  tapBounds(adb, button.bounds);
  sleep(Number(app.after_task_tap_wait_ms) || 2500);

  let jump = waitForJump(adb, app, Number(app.jump_timeout_ms) || 8000);
  if (jump.type === 'none') {
    const tapped = tryTapAlipayButtonFromDetail(adb, app);
    if (tapped) jump = waitForJump(adb, app, Number(app.jump_timeout_ms) || 8000);
  }

  if (jump.type !== 'alipay') {
    console.log(`[跳过] 未跳转到支付宝：${taskContext.title}，当前=${jump.focus.packageName || 'unknown'}`);
    let skippedScreenshot = '';
    if (app.capture_skipped_screenshots) {
      try {
        skippedScreenshot = takeScreenshot(adb, args.outputDir, `${app.app_name}_${taskContext.title}_skipped`);
      } catch {}
    }
    Object.assign(attempt, {
      status: 'skipped',
      skip_reason: '未跳转到支付宝小程序',
      jump_type: jump.type,
      focus_package: jump.focus.packageName || '',
      focus_activity: jump.focus.activity || '',
      observed_focus: jump.observed,
      screenshot: skippedScreenshot,
      finished_at: new Date().toISOString(),
    });
    returnToTaskCenter(adb, app, pageIndex);
    return { result: null, attempt };
  }

  try {
    const info = captureAlipayMiniProgramInfo(adb, app, taskContext);
    const screenshot = takeScreenshot(adb, args.outputDir, `${app.app_name}_${info.miniProgramName || taskContext.title || 'alipay'}`);
    const payload = {
      source_app: app.app_name,
      mini_program_name: info.miniProgramName,
      company_entity_name: info.companyEntityName,
      task_title: taskContext.title,
      task_description: info.taskDescription,
      product_link: info.productLink,
      product_link_capture_method: info.captureMethod,
      confidence: info.miniProgramName ? (info.companyEntityName ? 0.92 : 0.82) : 0.45,
      collected_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    const result = await submitCollectedPayload({ args, token, payload, screenshot });
    Object.assign(attempt, {
      status: result ? 'submitted' : 'captured',
      jump_type: jump.type,
      focus_package: jump.focus.packageName || '',
      focus_activity: jump.focus.activity || '',
      observed_focus: jump.observed,
      mini_program_name: info.miniProgramName,
      company_entity_name: info.companyEntityName,
      product_link: info.productLink,
      product_link_capture_method: info.captureMethod,
      screenshot,
      api_result: result,
      finished_at: new Date().toISOString(),
    });
    return { result, attempt };
  } catch (err) {
    Object.assign(attempt, {
      status: 'failed',
      error_message: err.message,
      jump_type: jump.type,
      focus_package: jump.focus.packageName || '',
      focus_activity: jump.focus.activity || '',
      observed_focus: jump.observed,
      finished_at: new Date().toISOString(),
    });
    throw Object.assign(err, { attempt });
  } finally {
    returnToTaskCenter(adb, app, pageIndex);
  }
}

async function submitEmptyAppResult({ app, args, token, message }) {
  if (!args.submitEmpty || args.dryRun || !token) return null;
  return apiRequest(args.apiBase, token, 'POST', '/mobile-task-center/records', {
    source_app: app.app_name,
    mini_program_name: '',
    task_title: '未发现支付宝小程序任务',
    task_description: message,
    collected_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
  });
}

async function collectApp({ adb, app, args, token }) {
  console.log(`\n[采集] ${app.app_name}`);
  keepDeviceAwake(adb);
  openTaskCenter(adb, app);

  const results = [];
  const attempts = [];
  const visited = new Set();
  const maxPages = Number(app.max_scan_pages) || 1;
  const maxTasksPerPage = Number(app.max_tasks_per_page) || 12;
  const maxRecords = Number(app.max_records_per_app) || 20;
  let emptyResult = null;

  for (let pageIndex = 0; pageIndex < maxPages && results.length < maxRecords; pageIndex += 1) {
    if (pageIndex > 0) openTaskCenter(adb, app, pageIndex);
    let handledOnPage = 0;

    while (handledOnPage < maxTasksPerPage && results.length < maxRecords) {
      const page = dumpUi(adb);
      const buttons = findTaskActionNodes(page.nodes, app)
        .map(button => ({ button, taskContext: buildTaskContext(page.nodes, button) }))
        .filter(item => !visited.has(item.taskContext.key));

      if (!buttons.length) break;
      const { button, taskContext } = buttons[0];
      visited.add(taskContext.key);
      handledOnPage += 1;

      try {
        const outcome = await collectTaskButton({ adb, app, args, token, button, taskContext, pageIndex });
        if (outcome?.attempt) attempts.push(outcome.attempt);
        if (outcome?.result) results.push(outcome.result);
      } catch (err) {
        if (err.attempt) {
          attempts.push(err.attempt);
          console.error(`[失败] ${taskContext.title}: ${err.message}`);
          continue;
        }
        throw err;
      }
    }

    if (handledOnPage === 0) {
      console.log(`[页面] 第 ${pageIndex + 1} 页未找到可点击任务按钮`);
    }
  }

  if (!results.length) {
    emptyResult = await submitEmptyAppResult({
      app,
      args,
      token,
      message: '已遍历任务按钮，但没有验证到会跳转支付宝小程序的任务。',
    });
  }

  const reportFile = writeRunReport(args.outputDir, app.app_name, {
    source_app: app.app_name,
    started_at: attempts[0]?.started_at || new Date().toISOString(),
    finished_at: new Date().toISOString(),
    scanned_pages: maxPages,
    attempted_count: attempts.length,
    submitted_count: results.length,
    attempts,
    results,
    empty_result: emptyResult,
  });
  console.log(`[报告] ${reportFile}`);
  console.log(`[完成] ${app.app_name} 有效记录 ${results.length} 条`);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!['file', 'api'].includes(args.configSource)) {
    throw new Error('--config-source 只支持 file 或 api');
  }

  let token = args.token;
  if (!args.dryRun && !token) {
    token = await login(args.apiBase, args.username, args.password);
  }

  let configFile = '';
  let apps = [];
  if (args.configSource === 'api') {
    if (!token) throw new Error('从后台读取配置需要 RELATION_API_TOKEN，或提供 RELATION_USERNAME / RELATION_PASSWORD 登录。');
    apps = validateConfig({ apps: await fetchConfiguredApps(args.apiBase, token) }, args.app);
  } else {
    configFile = fs.existsSync(args.config) ? args.config : DEFAULT_EXAMPLE_CONFIG;
    const config = readJson(configFile);
    apps = validateConfig(config, args.app);
  }

  if (args.validateConfig) {
    console.log(`配置校验通过：${args.configSource === 'api' ? '后台 App 配置' : configFile}，启用 App ${apps.length} 个。`);
    apps.forEach(app => console.log(`- ${app.app_name} (${app.package_name})`));
    return;
  }

  if (!args.dryRun && !token) {
    throw new Error('缺少 RELATION_API_TOKEN，或提供 RELATION_USERNAME / RELATION_PASSWORD 登录。');
  }

  if (args.syncApps && !args.dryRun) {
    const syncResults = await syncAppConfigs(args.apiBase, token, apps);
    syncResults.forEach(item => {
      console.log(`[配置] 已${item.updated ? '更新' : '新增'} ${item.app_name} app_id=${item.id}`);
    });
    if (args.syncAppsOnly) return;
  }

  const adb = createAdb(args.adbPath, args.device);
  checkDevice(adb);

  const results = [];
  for (const app of apps) {
    try {
      const appResults = await collectApp({ adb, app, args, token });
      results.push(...appResults);
    } catch (err) {
      console.error(`[失败] ${app.app_name}: ${err.message}`);
      if (!args.dryRun && token && args.submitEmpty) {
        await apiRequest(args.apiBase, token, 'POST', '/mobile-task-center/records', {
          source_app: app.app_name,
          mini_program_name: '',
          task_title: '采集失败',
          task_description: err.message,
          collected_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
        });
      }
    }
  }

  console.log(`\n完成：${results.filter(Boolean).length} 条有效记录已上报或处理，覆盖 ${apps.length} 个 App。`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
