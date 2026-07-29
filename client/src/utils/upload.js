#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT_DIR = __dirname;
const TEMP_PROJECT_NAME = 'uploadTemplate';
const TEMP_PROJECT_DIR = path.resolve(process.env.UPLOAD_TEMP_PROJECT_DIR || path.join(ROOT_DIR, TEMP_PROJECT_NAME));
const CODE_TEMPLATES_REPO = 'https://gitee.com/mdtec/zfb-mini-tools.git';
const DEFAULT_CODE_TEMPLATES_DIR = '/app/codeTemplates';
const HTTP_URL_LITERAL = /(['"])(https?:\/\/[^'"\s]+)\1/g;
const DOMAIN_CONFIG_KEYS = {
  ADS_SERVER_API: 'apiDomain',
  AD_SERVER_API: 'apiDomain',
  ADS_DOT_SERVER_API: 'analyticsDomain',
  CDN_DOMAIN: 'cdnDomain',
  DJ_CDN_DOMAIN: 'shortDramaDomain',
};
const VALUE_OPTIONS = new Set([
  '--project',
  '--template',
  '--domain',
  '--api-domain',
  '--analytics-domain',
  '--cdn-domain',
  '--short-drama-domain',
  '--short-drama-template',
  '--app-id',
  '--identity-key-path',
  '--version',
  '--version-description',
]);

function printHelp() {
  console.log(`
支付宝小程序快速上传脚本

用法:
  node upload.js <项目目录> <域名> <AppID>
  node upload.js --project <项目目录> --api-domain <API域名> \
    --analytics-domain <埋点域名> --cdn-domain <CDN域名> \
    --short-drama-domain <短剧域名> --app-id <AppID> \
    --identity-key-path <身份密钥文件路径>

示例:
  node upload.js --project playlet/player-A --template 短剧模版 \
    --api-domain https://api.example.com \
    --analytics-domain https://analytics.example.com \
    --cdn-domain https://cdn.example.com \
    --app-id 2021004122678367 \
    --identity-key-path /tmp/alipay-identity-key.json

可选参数:
  --version <version>                    指定上传版本号
  --version-description <description>   指定版本描述
  --template <name-or-id>                传入产品模版标识
  --identity-key-path <path>             身份密钥文件路径，不传密钥明文
  --short-drama-template <0|1>           是否为短剧模版；短剧模版必须传短剧域名
  --help                                显示帮助

环境变量:
  ALIPAY_APP_ID                         未传 --app-id 时使用
  MINIDEV_BIN                           指定 minidev 可执行文件路径
  CODE_TEMPLATES_REPO                   代码模版仓库地址，默认 https://gitee.com/mdtec/zfb-mini-tools.git
  CODE_TEMPLATES_DIR                    代码模版目录，默认 /app/codeTemplates

说明:
  主体域名会按配置项替换临时项目 config/index.js，源项目不会被修改。
`);
}

function getCodeTemplatesDir() {
  return path.resolve(process.env.CODE_TEMPLATES_DIR || DEFAULT_CODE_TEMPLATES_DIR);
}

function getCodeTemplatesRepo() {
  return process.env.CODE_TEMPLATES_REPO || CODE_TEMPLATES_REPO;
}

function cloneCodeTemplates() {
  const targetDir = getCodeTemplatesDir();
  if (fs.existsSync(targetDir)) {
    if (!fs.statSync(targetDir).isDirectory()) {
      throw new Error(`代码模版目录不是目录: ${targetDir}`);
    }
    const entries = fs.readdirSync(targetDir);
    if (fs.existsSync(path.join(targetDir, '.git'))) {
      console.log(`代码模版目录已存在，复用: ${targetDir}`);
      return targetDir;
    }
    if (entries.length > 0) {
      throw new Error(`代码模版目录已存在但不是 Git 仓库: ${targetDir}`);
    }
  } else {
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  }

  console.log(`开始拉取代码模版: ${getCodeTemplatesRepo()}`);
  const result = spawnSync('git', ['clone', '--depth', '1', getCodeTemplatesRepo(), targetDir], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim().slice(-2000);
    throw new Error(`git clone 代码模版失败${detail ? `: ${detail}` : ''}`);
  }
  console.log(`代码模版已拉取到: ${targetDir}`);
  return targetDir;
}

function parseArgs(argv) {
  const options = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }

    if (!argument.startsWith('--')) {
      positional.push(argument);
      continue;
    }

    const equalIndex = argument.indexOf('=');
    const name = equalIndex === -1 ? argument : argument.slice(0, equalIndex);
    const inlineValue = equalIndex === -1 ? undefined : argument.slice(equalIndex + 1);

    if (!VALUE_OPTIONS.has(name)) {
      throw new Error(`未知参数: ${name}`);
    }

    const value = inlineValue === undefined ? argv[++index] : inlineValue;
    if (!value || value.startsWith('--')) {
      throw new Error(`参数 ${name} 需要一个值`);
    }
    options[name.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }

  const project = options.project || positional[0];
  const legacyDomain = options.domain || positional[1];
  const apiDomain = options.apiDomain || legacyDomain;
  const analyticsDomain = options.analyticsDomain || apiDomain;
  const cdnDomain = options.cdnDomain || apiDomain;
  const shortDramaDomain = options.shortDramaDomain;
  const appId = options.appId || positional[2] || process.env.ALIPAY_APP_ID;
  const identityKeyPath = options.identityKeyPath || process.env.ALIPAY_IDENTITY_KEY_PATH;
  const template = options.template || project;
  const shortDramaTemplate = options.shortDramaTemplate === '1'
    || (options.shortDramaTemplate === undefined && /(短剧|short[\s_-]*drama)/i.test(String(template)));

  if (options.help) {
    return { help: true };
  }

  if (!project || !template || !apiDomain || !analyticsDomain || !cdnDomain || (shortDramaTemplate && !shortDramaDomain) || !appId || !identityKeyPath || positional.length > 3) {
    throw new Error('项目目录、产品模版标识、四类主体域名、AppID 和身份密钥文件路径都是必填参数');
  }

  if (!/^\d{16}$/.test(String(appId))) {
    throw new Error(`AppID 格式不正确，应为 16 位数字: ${appId}`);
  }

  return {
    project,
    template: options.template || project,
    domains: {
      apiDomain: normalizeDomain(apiDomain),
      analyticsDomain: normalizeDomain(analyticsDomain),
      cdnDomain: normalizeDomain(cdnDomain),
      shortDramaDomain: shortDramaDomain ? normalizeDomain(shortDramaDomain) : '',
    },
    appId: String(appId),
    identityKeyPath: resolveIdentityKeyPath(identityKeyPath),
    template,
    shortDramaTemplate,
    version: options.version,
    versionDescription: options.versionDescription,
  };
}

function normalizeDomain(value) {
  const input = String(value).trim();
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);

  if (url.protocol !== 'https:') {
    throw new Error(`仅支持 HTTPS 域名: ${value}`);
  }
  if (!url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`请输入不带路径、查询参数或片段的域名: ${value}`);
  }

  return `${url.protocol}//${url.host}`;
}

function resolveIdentityKeyPath(value) {
  const identityKeyPath = path.resolve(process.cwd(), value);
  if (!fs.existsSync(identityKeyPath) || !fs.statSync(identityKeyPath).isFile()) {
    throw new Error(`身份密钥文件不存在: ${identityKeyPath}`);
  }
  return identityKeyPath;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveProjectDir(project, codeTemplatesDir = getCodeTemplatesDir()) {
  const normalizedProject = String(project).replace(/^zfb-mini-tools[\\/]/, '');
  const candidates = [
    path.isAbsolute(project) ? path.resolve(project) : null,
    path.resolve(codeTemplatesDir, normalizedProject),
    path.resolve(process.cwd(), project),
  ].filter(Boolean);
  const projectDir = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());

  if (!projectDir) {
    throw new Error(`项目目录不存在或不是目录: ${project}`);
  }

  const configPath = path.join(projectDir, 'config', 'index.js');
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    throw new Error(`项目缺少 config/index.js: ${configPath}`);
  }

  const relativeToTemp = path.relative(path.resolve(TEMP_PROJECT_DIR), path.resolve(projectDir));
  if (!relativeToTemp || (!relativeToTemp.startsWith('..') && !path.isAbsolute(relativeToTemp))) {
    throw new Error(`项目目录不能是临时目录: ${TEMP_PROJECT_DIR}`);
  }

  return projectDir;
}

function shouldCopy(sourcePath, sourceDir) {
  const relativePath = path.relative(sourceDir, sourcePath);
  if (!relativePath) return true;

  return !relativePath.split(path.sep).some((part) => (
    part === 'node_modules' || part === '.git' || part === '.mini-ide'
  ));
}

function createTemporaryProject(sourceDir) {
  fs.rmSync(TEMP_PROJECT_DIR, { recursive: true, force: true });
  fs.cpSync(sourceDir, TEMP_PROJECT_DIR, {
    recursive: true,
    filter: (sourcePath) => shouldCopy(sourcePath, sourceDir),
  });
}

function replaceDomainsInConfig(projectDir, domains) {
  const configPath = path.join(projectDir, 'config', 'index.js');
  const original = fs.readFileSync(configPath, 'utf8');
  let replacements = 0;

  let updated = original;
  Object.entries(DOMAIN_CONFIG_KEYS).forEach(([key, domainKey]) => {
    const domain = domains[domainKey];
    if (!domain) return;
    const pattern = new RegExp(`((?:['"]?${escapeRegExp(key)}['"]?)\\s*:\\s*)(['"])(.*?)\\2`, 'g');
    updated = updated.replace(pattern, (_match, prefix, quote) => {
      replacements += 1;
      return `${prefix}${quote}${domain}${quote}`;
    });
  });

  if (replacements === 0) {
    updated = original.replace(HTTP_URL_LITERAL, (match, quote, oldUrl) => {
      const oldParsedUrl = new URL(oldUrl);
      const suffix = `${oldParsedUrl.pathname === '/' ? '' : oldParsedUrl.pathname}${oldParsedUrl.search}${oldParsedUrl.hash}`;
      replacements += 1;
      return `${quote}${domains.apiDomain}${suffix}${quote}`;
    });
  }

  if (replacements === 0) {
    throw new Error(`config/index.js 中没有找到 HTTP(S) 域名配置: ${configPath}`);
  }

  fs.writeFileSync(configPath, updated, 'utf8');
  fs.writeFileSync(path.join(projectDir, 'release.domains.json'), JSON.stringify({
    api_domain: domains.apiDomain,
    analytics_domain: domains.analyticsDomain,
    cdn_domain: domains.cdnDomain,
    short_drama_domain: domains.shortDramaDomain || '',
  }, null, 2), { mode: 0o600 });
  console.log(`已替换临时项目域名配置 ${replacements} 处`);
}

function writeReleaseMetadata(projectDir, { template, appId }) {
  fs.writeFileSync(path.join(projectDir, 'release.template.json'), JSON.stringify({
    template,
    app_id: appId,
  }, null, 2), { mode: 0o600 });
}

function getMinidevClient() {
  const candidates = [
    process.env.MINIDEV_MODULE,
    'minidev',
    path.join(ROOT_DIR, 'node_modules', 'minidev'),
    path.join(ROOT_DIR, '..', 'node_modules', 'minidev'),
    path.join(ROOT_DIR, 'auditTool', 'node_modules', 'minidev'),
    path.join(ROOT_DIR, '..', 'auditTool', 'node_modules', 'minidev'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const loaded = require(candidate);
      const client = loaded?.minidev || loaded?.default || loaded;
      if (client && typeof client.upload === 'function') return client;
    } catch {
      // Try the next supported installation location.
    }
  }
  return null;
}

function getMinidevInvocation() {
  if (process.env.MINIDEV_BIN) {
    return { command: process.env.MINIDEV_BIN, prefixArgs: [] };
  }

  const probe = spawnSync('minidev', ['--vers'], { stdio: 'ignore' });
  if (!probe.error && probe.status === 0) {
    return { command: 'minidev', prefixArgs: [] };
  }

  const localCliCandidates = [
    path.join(ROOT_DIR, 'node_modules', 'minidev', 'bin', 'minidev.js'),
    path.join(ROOT_DIR, '..', 'node_modules', 'minidev', 'bin', 'minidev.js'),
    path.join(ROOT_DIR, 'auditTool', 'node_modules', 'minidev', 'bin', 'minidev.js'),
    path.join(ROOT_DIR, '..', 'auditTool', 'node_modules', 'minidev', 'bin', 'minidev.js'),
  ];
  const localCli = localCliCandidates.find((candidate) => fs.existsSync(candidate));

  if (localCli) {
    return { command: process.execPath, prefixArgs: [localCli] };
  }

  throw new Error('找不到 minidev，请先全局安装 minidev 或在项目中安装依赖');
}

function uploadProject({ appId, template, identityKeyPath, version, versionDescription }) {
  const client = getMinidevClient();
  if (client) {
    console.log(`产品模版: ${template}`);
    console.log(`开始上传小程序，AppID: ${appId}`);
    return client.upload({
      appId,
      clientType: 'alipay',
      project: TEMP_PROJECT_DIR,
      identityKeyPath: identityKeyPath || undefined,
      version: version || undefined,
      versionDescription: versionDescription || undefined,
      experience: false,
    }, {
      onLog: (data) => console.log('upload--log:', data),
    });
  }

  if (identityKeyPath) {
    throw new Error('当前 minidev 安装未提供 JavaScript upload 接口，无法安全传入身份密钥文件');
  }
  const minidev = getMinidevInvocation();
  const args = [
    ...minidev.prefixArgs,
    'upload',
    '--project',
    TEMP_PROJECT_DIR,
    '--app-id',
    appId,
  ];

  if (version) {
    args.push('--version', version);
  }
  if (versionDescription) {
    args.push('--version-description', versionDescription);
  }

  console.log(`产品模版: ${template}`);
  console.log(`开始上传小程序，AppID: ${appId}`);
  console.log('以下为 minidev 上传日志:');

  return new Promise((resolve, reject) => {
    const child = spawn(minidev.command, args, {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      reject(new Error(`启动 minidev 失败: ${error.message}`));
    });
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(
        signal ? `minidev 被信号 ${signal} 终止` : `minidev 上传失败，退出码: ${code}`
      ));
    });
  });
}

async function main() {
  let temporaryProjectCreated = false;

  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    const codeTemplatesDir = cloneCodeTemplates();
    console.log(`代码模版目录: ${codeTemplatesDir}`);
    const sourceDir = resolveProjectDir(options.project, codeTemplatesDir);
    console.log(`源项目: ${sourceDir}`);
    console.log(`临时项目: ${TEMP_PROJECT_DIR}`);

    temporaryProjectCreated = true;
    createTemporaryProject(sourceDir);
    replaceDomainsInConfig(TEMP_PROJECT_DIR, options.domains);
    writeReleaseMetadata(TEMP_PROJECT_DIR, options);
    const uploadResult = await uploadProject(options);
    const uploadedVersion = uploadResult?.version || uploadResult?.uploadedVersion || options.version || '-';
    console.log(`上传版本: ${uploadedVersion}`);
    console.log('小程序上传成功');
  } catch (error) {
    console.error(`上传失败: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (temporaryProjectCreated) {
      try {
        fs.rmSync(TEMP_PROJECT_DIR, { recursive: true, force: true });
        console.log(`已清理临时项目: ${TEMP_PROJECT_DIR}`);
      } catch (error) {
        console.error(`清理临时项目失败: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  normalizeDomain,
  cloneCodeTemplates,
  getCodeTemplatesDir,
  getCodeTemplatesRepo,
  parseArgs,
  replaceDomainsInConfig,
  resolveProjectDir,
  resolveIdentityKeyPath,
  writeReleaseMetadata,
};
