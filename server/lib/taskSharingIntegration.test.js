const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`server start timeout\n${output}`)), 15000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (output.includes('服务器启动在')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`server exited with ${code}\n${output}`));
    });
  });
}

async function request(baseUrl, route, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function login(baseUrl, username, password) {
  const response = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return response.payload;
}

async function createUser(baseUrl, token, input) {
  const response = await request(baseUrl, '/api/users', {
    method: 'POST',
    token,
    body: {
      password: input.password,
      role: 'member',
      ...input,
    },
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return Number(response.payload.id);
}

test('task users shared into attention can edit normal task status', { timeout: 30000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-task-sharing-'));
  const databasePath = path.join(tempDir, 'data.db');
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      RELATION_DB_PATH: databasePath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))]);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForServer(child);
  const baseUrl = `http://127.0.0.1:${port}`;
  const admin = await login(baseUrl, 'admin', 'admin123');
  const adminToken = admin.token;
  const suffix = `${process.pid}_${Date.now()}`;
  const password = 'task-share-test-123';
  const creatorUsername = `task_creator_${suffix}`;
  const sharedUsername = `task_shared_${suffix}`;
  const outsiderUsername = `task_outsider_${suffix}`;

  const creatorId = await createUser(baseUrl, adminToken, {
    username: creatorUsername,
    display_name: '任务创建人',
    password,
  });
  const sharedUserId = await createUser(baseUrl, adminToken, {
    username: sharedUsername,
    display_name: '任务共享人',
    password,
  });
  await createUser(baseUrl, adminToken, {
    username: outsiderUsername,
    display_name: '任务无关人',
    password,
  });

  const creator = await login(baseUrl, creatorUsername, password);
  const sharedUser = await login(baseUrl, sharedUsername, password);
  const outsider = await login(baseUrl, outsiderUsername, password);

  const createdTask = await request(baseUrl, '/api/tasks', {
    method: 'POST',
    token: creator.token,
    body: {
      title: '共享关注任务',
      description: '共享人需要能从工作台需关注编辑',
      date: '2026-07-23',
      estimated_completion_date: '2026-07-24',
      status: 'pending',
      priority: 'medium',
      assigned_to: creatorId,
      shared_to: [sharedUserId],
    },
  });
  assert.equal(createdTask.status, 200, JSON.stringify(createdTask.payload));
  const taskId = Number(createdTask.payload.id);

  const outsiderUpdate = await request(baseUrl, `/api/tasks/${taskId}`, {
    method: 'PUT',
    token: outsider.token,
    body: { status: 'in_progress' },
  });
  assert.equal(outsiderUpdate.status, 403, JSON.stringify(outsiderUpdate.payload));

  const sharedUpdate = await request(baseUrl, `/api/tasks/${taskId}`, {
    method: 'PUT',
    token: sharedUser.token,
    body: { status: 'in_progress' },
  });
  assert.equal(sharedUpdate.status, 200, JSON.stringify(sharedUpdate.payload));

  const sharedTasks = await request(baseUrl, '/api/tasks?parent_id=null', {
    token: sharedUser.token,
  });
  assert.equal(sharedTasks.status, 200, JSON.stringify(sharedTasks.payload));
  const updated = sharedTasks.payload.find(task => Number(task.id) === taskId);
  assert.equal(updated?.status, 'in_progress');
  assert.equal(Number(updated?.shared_to_me), 1);
});

test('mine task query is not truncated by the dashboard visible task limit', { timeout: 60000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relation-task-mine-limit-'));
  const databasePath = path.join(tempDir, 'data.db');
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      RELATION_DB_PATH: databasePath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))]);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForServer(child);
  const baseUrl = `http://127.0.0.1:${port}`;
  const admin = await login(baseUrl, 'admin', 'admin123');
  const adminToken = admin.token;
  const adminId = Number(admin.user.id);
  const suffix = `${process.pid}_${Date.now()}`;
  const password = 'task-mine-test-123';
  const workerUsername = `task_worker_${suffix}`;
  const workerId = await createUser(baseUrl, adminToken, {
    username: workerUsername,
    display_name: '自派任务用户',
    password,
  });
  const worker = await login(baseUrl, workerUsername, password);

  for (let index = 0; index < 300; index += 1) {
    const filler = await request(baseUrl, '/api/tasks', {
      method: 'POST',
      token: adminToken,
      body: {
        title: `共享占位任务 ${index + 1}`,
        description: '用于占满工作台可见任务首屏限制',
        date: '2026-07-23',
        estimated_completion_date: '2026-07-24',
        status: 'pending',
        priority: 'high',
        assigned_to: adminId,
        shared_to: [workerId],
      },
    });
    assert.equal(filler.status, 200, JSON.stringify(filler.payload));
  }

  const ownTask = await request(baseUrl, '/api/tasks', {
    method: 'POST',
    token: worker.token,
    body: {
      title: '低优先级自派任务',
      description: '即使不在普通可见任务前 300，也必须进入我执行',
      date: '2026-07-23',
      estimated_completion_date: '2026-07-24',
      status: 'pending',
      priority: 'low',
      assigned_to: workerId,
      shared_to: [],
    },
  });
  assert.equal(ownTask.status, 200, JSON.stringify(ownTask.payload));
  const ownTaskId = Number(ownTask.payload.id);

  const limitedVisibleTasks = await request(baseUrl, '/api/tasks?parent_id=null&limit=300', {
    token: worker.token,
  });
  assert.equal(limitedVisibleTasks.status, 200, JSON.stringify(limitedVisibleTasks.payload));
  assert.equal(limitedVisibleTasks.payload.length, 300);
  assert.equal(limitedVisibleTasks.payload.some(task => Number(task.id) === ownTaskId), false);

  const myTasks = await request(baseUrl, '/api/tasks?parent_id=null&mine=1', {
    token: worker.token,
  });
  assert.equal(myTasks.status, 200, JSON.stringify(myTasks.payload));
  assert.equal(myTasks.payload.some(task => Number(task.id) === ownTaskId), true);
});
