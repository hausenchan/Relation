const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  appendLog,
  copyProjectDirectory,
  extractCommandFailureReason,
  getUploadScriptPath,
  isShortDramaTemplate,
  normalizeDomain,
  prepareReleaseProject,
  runCommand,
  runUploadScript,
  sanitizeLogText,
  stripAnsiText,
  validateReleaseDomains,
  validateReleasePayload,
  validateRelativeProjectPath,
  validateTemplatePayload,
} = require('./productTemplateRelease');
const uploadScript = require('../../utils/upload');

test('template validation rejects unsafe paths and invalid states', () => {
  assert.equal(validateRelativeProjectPath('../outside').error, '项目目录不能越过仓库根目录');
  assert.equal(validateRelativeProjectPath('/absolute/path').error, '项目目录不能是绝对路径');
  assert.equal(validateRelativeProjectPath('src\\index.js').error, '项目目录必须是安全的相对路径');
  assert.equal(validateRelativeProjectPath('').value, 'zfb-mini-tools/playlet/player-A');
  assert.ok(validateTemplatePayload({ name: '模版', template_type: 'unknown', status: 'enabled' }).errors.includes('模版类型不合法'));
});

test('short drama detection follows explicit template type', () => {
  assert.equal(isShortDramaTemplate({
    name: '短剧入口',
    code: 'short-drama-template',
    template_type: 'mini_program',
    project_path: 'zfb-mini-tools/playlet/player-A',
  }), false);
  assert.equal(isShortDramaTemplate({
    name: '资讯入口',
    template_type: 'short_drama',
    project_path: 'zfb-mini-tools/offer-wall/newsWall',
  }), true);
  assert.equal(isShortDramaTemplate({ name: '短剧入口' }), true);
});

test('release domain validation rejects non-https and private destinations', () => {
  assert.equal(normalizeDomain('http://localhost', { required: true }).error, '域名只允许 HTTPS');
  assert.equal(normalizeDomain('https://127.0.0.1', { required: true }).error, '域名不能指向本机或内网地址');
  assert.equal(normalizeDomain('https://api.example.com///').value, 'https://api.example.com');
  const result = validateReleaseDomains({
    api_domain: 'https://api.example.com',
    analytics_domain: 'https://analytics.example.com',
    cdn_domain: 'https://cdn.example.com',
  }, { required: true });
  assert.deepEqual(result.errors, undefined);
  assert.equal(result.values.short_drama_domain, '');
  const completeResult = validateReleaseDomains({
    api_domain: 'https://api.example.com',
    analytics_domain: 'https://analytics.example.com',
    cdn_domain: 'https://cdn.example.com',
    short_drama_domain: 'https://drama.example.com',
  }, { required: true, requireAll: true });
  assert.deepEqual(completeResult.errors, undefined);
  assert.match(validateReleaseDomains({
    api_domain: 'https://api.example.com',
    analytics_domain: 'https://analytics.example.com',
    cdn_domain: 'https://cdn.example.com',
  }, { required: true, requireAll: true }).errors.join(';'), /short_drama_domain/);
  assert.equal(validateReleaseDomains({
    api_domain: 'https://api.example.com',
    analytics_domain: 'https://analytics.example.com',
    cdn_domain: 'https://cdn.example.com',
  }, { required: true, requireShortDrama: false }).errors, undefined);
  const releasePayload = validateReleasePayload({
    app_id: '2021004122678367',
    template_id: 1,
    api_domain: 'https://manual.example.com',
  });
  assert.deepEqual(releasePayload.errors, undefined);
  assert.equal(releasePayload.values.api_domain, undefined);
});

test('template payload no longer accepts removed link and attachment fields', () => {
  const result = validateTemplatePayload({
    name: '模版',
    template_type: 'mini_program',
    project_path: 'src',
    template_url: 'https://example.com/template',
    attachment_note: 'legacy field',
  });
  assert.deepEqual(result.errors, undefined);
  assert.equal(result.values.template_url, undefined);
  assert.equal(result.values.attachment_note, undefined);
});

test('upload script runner forwards template, subject domains, and identity key path', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-upload-script-test-'));
  const scriptPath = path.join(tempRoot, 'upload.js');
  const identityKeyPath = path.join(tempRoot, 'identity.json');
  fs.writeFileSync(identityKeyPath, 'test-only-identity-key', { mode: 0o600 });
  fs.writeFileSync(scriptPath, `
const args = process.argv.slice(2);
const required = [
  ['--project', '/tmp/project'],
  ['--template', '短剧入口'],
  ['--api-domain', 'https://api.example.com'],
  ['--analytics-domain', 'https://analytics.example.com'],
  ['--cdn-domain', 'https://cdn.example.com'],
  ['--short-drama-template', '0'],
  ['--short-drama-domain', 'https://drama.example.com'],
  ['--app-id', '2021004122678367'],
  ['--identity-key-path', ${JSON.stringify(identityKeyPath)}],
];
for (let index = 0; index < required.length; index += 1) {
  if (args[index * 2] !== required[index][0] || args[index * 2 + 1] !== required[index][1]) process.exit(2);
}
console.log('脚本步骤: 开始上传');
console.log('上传版本: 2.0.0');
`, 'utf8');
  const previous = process.env.PRODUCT_TEMPLATE_UPLOAD_SCRIPT;
  process.env.PRODUCT_TEMPLATE_UPLOAD_SCRIPT = scriptPath;
  const logs = [];
  try {
    const result = await runUploadScript({
      projectPath: '/tmp/project',
      template: '短剧入口',
      shortDramaTemplate: false,
      identityKeyPath,
      domains: {
        api_domain: 'https://api.example.com',
        analytics_domain: 'https://analytics.example.com',
        cdn_domain: 'https://cdn.example.com',
        short_drama_domain: 'https://drama.example.com',
      },
      appId: '2021004122678367',
      version: '1.0.0',
      versionDescription: 'test upload',
      onLog: message => logs.push(message),
    });
    assert.equal(result.uploadedVersion, '2.0.0');
    assert.ok(logs.some(line => line.includes('upload.js stdout: 脚本步骤: 开始上传')));
  } finally {
  if (previous === undefined) delete process.env.PRODUCT_TEMPLATE_UPLOAD_SCRIPT;
    else process.env.PRODUCT_TEMPLATE_UPLOAD_SCRIPT = previous;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('default upload script resolves to repository utils/upload.js', () => {
  assert.equal(path.basename(getUploadScriptPath()), 'upload.js');
  assert.match(getUploadScriptPath(), /[\\/]utils[\\/]upload\.js$/);
});

test('upload.js requires all release fields before execution', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-upload-args-test-'));
  const identityKeyPath = path.join(tempRoot, 'identity.json');
  fs.writeFileSync(identityKeyPath, '{"appId":"test"}', { mode: 0o600 });
  try {
    const options = uploadScript.parseArgs([
      '--project', 'zfb-mini-tools/playlet/player-A',
      '--template', 'template-a',
      '--api-domain', 'https://api.example.com',
      '--analytics-domain', 'https://analytics.example.com',
      '--cdn-domain', 'https://cdn.example.com',
      '--short-drama-domain', 'https://drama.example.com',
      '--app-id', '2021004122678367',
      '--identity-key-path', identityKeyPath,
    ]);
    assert.equal(options.template, 'template-a');
    assert.equal(options.domains.shortDramaDomain, 'https://drama.example.com');
    assert.equal(options.identityKeyPath, identityKeyPath);
    const standardOptions = uploadScript.parseArgs([
      '--project', 'zfb-mini-tools/playlet/player-A',
      '--template', 'template-a',
      '--api-domain', 'https://api.example.com',
      '--analytics-domain', 'https://analytics.example.com',
      '--cdn-domain', 'https://cdn.example.com',
      '--app-id', '2021004122678367',
      '--identity-key-path', identityKeyPath,
    ]);
    assert.equal(standardOptions.domains.shortDramaDomain, '');
    assert.throws(() => uploadScript.parseArgs([
      '--project', 'zfb-mini-tools/playlet/player-A',
      '--template', '短剧模版',
      '--api-domain', 'https://api.example.com',
      '--analytics-domain', 'https://analytics.example.com',
      '--cdn-domain', 'https://cdn.example.com',
      '--app-id', '2021004122678367',
      '--identity-key-path', identityKeyPath,
    ]), /四类主体域名/);
    assert.throws(() => uploadScript.parseArgs([
      '--project', 'zfb-mini-tools/playlet/player-A',
      '--template', 'template-a',
      '--api-domain', 'https://api.example.com',
      '--analytics-domain', 'https://analytics.example.com',
      '--cdn-domain', 'https://cdn.example.com',
      '--short-drama-domain', 'https://drama.example.com',
      '--app-id', '2021004122678367',
    ]), /身份密钥文件路径/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('upload.js auto-installs minidev when the upload interface is missing', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-minidev-install-test-'));
  const installCwd = path.join(tempRoot, 'install');
  const fakeNpm = path.join(tempRoot, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const previousEnv = {
    MINIDEV_INSTALL_CWD: process.env.MINIDEV_INSTALL_CWD,
    MINIDEV_PACKAGE: process.env.MINIDEV_PACKAGE,
    NPM_BIN: process.env.NPM_BIN,
    MINIDEV_MODULE: process.env.MINIDEV_MODULE,
    MINIDEV_AUTO_INSTALL: process.env.MINIDEV_AUTO_INSTALL,
  };
  fs.writeFileSync(fakeNpm, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const moduleDir = path.join(process.cwd(), 'node_modules', 'minidev');
fs.mkdirSync(moduleDir, { recursive: true });
fs.writeFileSync(path.join(moduleDir, 'index.js'), "module.exports = { upload: async () => ({ version: 'auto-installed' }) };\\n");
`, { mode: 0o700 });

  try {
    process.env.MINIDEV_INSTALL_CWD = installCwd;
    process.env.MINIDEV_PACKAGE = 'minidev';
    process.env.NPM_BIN = fakeNpm;
    delete process.env.MINIDEV_MODULE;
    delete process.env.MINIDEV_AUTO_INSTALL;
    uploadScript.installMinidevDependency();
    const client = uploadScript.getMinidevClient({ fresh: true });
    assert.equal(typeof client.upload, 'function');
    assert.equal(fs.existsSync(path.join(installCwd, 'node_modules', 'minidev', 'index.js')), true);
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('upload.js installs template project dependencies before minidev upload', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-template-npm-install-test-'));
  const projectDir = path.join(tempRoot, 'project');
  const fakeNpm = path.join(tempRoot, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const previousEnv = {
    NPM_BIN: process.env.NPM_BIN,
    UPLOAD_SKIP_NPM_INSTALL: process.env.UPLOAD_SKIP_NPM_INSTALL,
  };
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ dependencies: { 'crypto-js': '^4.2.0' } }));
  fs.writeFileSync(fakeNpm, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
fs.mkdirSync(path.join(process.cwd(), 'node_modules'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'node_modules', '.installed'), process.argv.slice(2).join(' '));
`, { mode: 0o700 });

  try {
    process.env.NPM_BIN = fakeNpm;
    delete process.env.UPLOAD_SKIP_NPM_INSTALL;
    assert.equal(uploadScript.installProjectDependencies(projectDir), true);
    const args = fs.readFileSync(path.join(projectDir, 'node_modules', '.installed'), 'utf8');
    assert.match(args, /install/);
    assert.match(args, /--legacy-peer-deps/);
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('release logs redact credentials and local paths', () => {
  const raw = 'Authorization: Bearer token-value HOME=/Users/tester/project identity_key=secret-value';
  const sanitized = sanitizeLogText(raw);
  assert.doesNotMatch(sanitized, /token-value|secret-value|\/Users\/tester/);
  assert.match(appendLog('', raw), /REDACTED|PATH_REDACTED/);
});

test('command failures extract actionable reasons from noisy script output', async () => {
  const noisyOutput = "\u001b[31mError: cannot resolve module 'crypto-js'\u001b[39m\nError: task was failed";
  assert.equal(stripAnsiText(noisyOutput), "Error: cannot resolve module 'crypto-js'\nError: task was failed");
  assert.equal(
    extractCommandFailureReason(noisyOutput),
    '缺少依赖 crypto-js，请检查代码模版项目依赖配置，安装该依赖后重试'
  );

  await assert.rejects(
    () => runCommand(process.execPath, [
      '-e',
      "console.error(\"\\u001b[31mError: cannot resolve module 'crypto-js'\\u001b[39m\"); process.exit(1);",
    ], { label: 'upload.js' }),
    /upload\.js 执行失败（1）：缺少依赖 crypto-js/
  );
});

test('project copy skips dependencies and writes release configuration', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-template-release-test-'));
  const source = path.join(tempRoot, 'source');
  const targetRoot = path.join(tempRoot, 'work');
  const target = path.join(targetRoot, 'project');
  fs.mkdirSync(path.join(source, 'config'), { recursive: true });
  fs.mkdirSync(path.join(source, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(source, 'index.js'), 'console.log(1);');
  fs.writeFileSync(path.join(source, 'node_modules', 'ignored.js'), 'ignored');
  fs.writeFileSync(path.join(source, 'config', 'index.js'), "module.exports = { ADS_SERVER_API: 'old', CDN_DOMAIN: 'old' };\n");
  const result = copyProjectDirectory(source, target, { root: targetRoot });
  assert.equal(result.files, 2);
  assert.equal(fs.existsSync(path.join(target, 'node_modules')), false);
  prepareReleaseProject(target, {
    api_domain: 'https://api.example.com',
    analytics_domain: 'https://analytics.example.com',
    cdn_domain: 'https://cdn.example.com',
    short_drama_domain: '',
  });
  const config = fs.readFileSync(path.join(target, 'config', 'index.js'), 'utf8');
  assert.match(config, /https:\/\/api\.example\.com/);
  assert.match(fs.readFileSync(path.join(target, 'release.domains.json'), 'utf8'), /analytics\.example\.com/);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
