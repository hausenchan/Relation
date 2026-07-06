#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const defaultProfileDir = path.join(repoRoot, 'tmp', 'chrome-wolai-profile');
const defaultPort = 9222;

function parseArgs(argv) {
  const args = {
    port: defaultPort,
    profileDir: defaultProfileDir,
    url: 'https://www.wolai.com/',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[++index];
    if (token === '--port') args.port = Number(next()) || defaultPort;
    else if (token === '--profile-dir') args.profileDir = path.resolve(repoRoot, next());
    else if (token === '--url') args.url = next();
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`未知参数: ${token}`);
  }
  return args;
}

function printHelp() {
  console.log(`
启动 Wolai 采集专用 Chrome

用法:
  npm run wolai:chrome

参数:
  --port <n>             调试端口，默认 9222
  --profile-dir <path>   专用 Chrome profile，默认 tmp/chrome-wolai-profile
  --url <url>            启动后打开的地址，默认 https://www.wolai.com/
`);
}

function resolveChromeExecutable() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    process.env.CHROME_PATH,
    process.platform === 'win32' ? 'chrome.exe' : null,
    process.platform === 'linux' ? 'google-chrome' : null,
    process.platform === 'linux' ? 'chromium-browser' : null,
  ].filter(Boolean);
  const found = candidates.find(candidate => candidate.includes(path.sep) && fs.existsSync(candidate));
  return found || candidates[candidates.length - 1] || 'google-chrome';
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  fs.mkdirSync(args.profileDir, { recursive: true });
  const chrome = resolveChromeExecutable();
  const chromeArgs = [
    `--remote-debugging-port=${args.port}`,
    `--user-data-dir=${args.profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    args.url,
  ];

  const child = spawn(chrome, chromeArgs, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  console.log(`已启动 Wolai 采集专用 Chrome`);
  console.log(`调试地址: http://127.0.0.1:${args.port}`);
  console.log(`Profile: ${args.profileDir}`);
  console.log(`请在打开的 Chrome 中登录 Wolai，然后再运行 npm run wolai:collect`);
}

try {
  run();
} catch (error) {
  console.error(`启动 Chrome 失败：${error.message}`);
  process.exit(1);
}
