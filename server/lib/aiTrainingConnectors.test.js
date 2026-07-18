const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createAiTrainingExternalConnectorRuntime,
  __test,
} = require('./aiTrainingConnectors');

function jsonResponse(payload, options = {}) {
  return {
    ok: options.ok !== false,
    status: options.status || 200,
    statusText: options.statusText || 'OK',
    headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : '') },
    text: async () => JSON.stringify(payload),
  };
}

test('connector permissions default to denied unless explicitly granted', () => {
  assert.equal(__test.isConnectorAllowed({ enabled: true }, { id: 3, role: 'member' }), false);
  assert.equal(__test.isConnectorAllowed({ public: true }, { id: 3, role: 'member' }), true);
  assert.equal(__test.isConnectorAllowed({ allowed_roles: ['admin'] }, { id: 3, role: 'admin' }), true);
  assert.equal(__test.isConnectorAllowed({ allowed_user_ids: [3] }, { id: 3, role: 'member' }), true);
});

test('MCP tools require an explicit allowlist', () => {
  const tools = [{ name: 'page_read', description: 'read page content' }];
  assert.deepEqual(__test.filterMcpTools({
    allowed_tools: [],
    blocked_tools: [],
    read_only: true,
  }, tools), []);
});

test('MCP browser URLs are restricted to configured origins', () => {
  const server = { allowed_url_origins: ['https://relation.example.com'] };
  assert.doesNotThrow(() => __test.validateMcpToolArguments(server, {
    url: 'https://relation.example.com/documents?doc=245',
  }));
  assert.throws(() => __test.validateMcpToolArguments(server, {
    url: 'https://untrusted.example.com/',
  }), /无权访问页面域名/);
  assert.throws(() => __test.validateMcpToolArguments({ allowed_url_origins: [] }, {
    target_url: 'https://relation.example.com/',
  }), /未配置可访问页面域名白名单/);
});

test('Mid-Max connector only calls configured read-only source URLs', async () => {
  const requests = [];
  const runtime = createAiTrainingExternalConnectorRuntime({
    user: { id: 7, role: 'member' },
    env: {
      AI_AGENT_MIDMAX_SOURCES_JSON: JSON.stringify([{
        source_code: 'zhixiao_daily',
        name: '支小日报',
        base_url: 'https://midmax.example.com/agent-api',
        path: '/reports/zhixiao/daily',
        token: 'secret-token',
        public: true,
      }]),
    },
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return jsonResponse({ rows: [{ date: '2026-07-18', gross_profit: 50000 }] });
    },
  });

  const result = await runtime.execute('midmax_source_query', {
    source_code: 'zhixiao_daily',
    params: { date: '2026-07-18' },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://midmax.example.com/agent-api/reports/zhixiao/daily?date=2026-07-18');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer secret-token');
  assert.equal(result.result.rows[0].gross_profit, 50000);
});

test('Gitee connector enforces project allowlist and decodes file content', async () => {
  const runtime = createAiTrainingExternalConnectorRuntime({
    user: { id: 1, role: 'admin' },
    env: {
      AI_AGENT_GITEE_PROJECTS_JSON: JSON.stringify([{
        project_code: 'gcad',
        name: 'Gcad',
        owner: 'mdtec',
        repo: 'gcad',
        branch: 'main',
        token: 'gitee-token',
        allowed_roles: ['admin'],
      }]),
    },
    fetchImpl: async (url) => {
      assert.match(String(url), /\/api\/v5\/repos\/mdtec\/gcad\/contents\/README\.md\?ref=main$/);
      return jsonResponse({
        sha: 'abc123',
        encoding: 'base64',
        content: Buffer.from('# Gcad\n能力仓库').toString('base64'),
      });
    },
  });

  const result = await runtime.execute('gitee_file_read', {
    project_code: 'gcad',
    path: 'README.md',
  });

  assert.match(result.result.content, /能力仓库/);
  await assert.rejects(
    runtime.execute('gitee_file_read', { project_code: 'relation', path: 'README.md' }),
    /无权访问/
  );
});

test('MCP connector exposes only allowed read-only tools', async () => {
  const calls = [];
  const runtime = createAiTrainingExternalConnectorRuntime({
    user: { id: 1, role: 'admin' },
    env: {
      AI_AGENT_MCP_SERVERS_JSON: JSON.stringify([{
        server_code: 'browser',
        name: 'Browser MCP',
        endpoint: 'https://mcp.example.com/rpc',
        token_env: 'BROWSER_MCP_TOKEN',
        allowed_tools: ['page_read', 'page_delete'],
        allowed_url_origins: ['https://relation.example.com'],
        allowed_roles: ['admin'],
        read_only: true,
      }]),
      BROWSER_MCP_TOKEN: 'mcp-token',
    },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body || '{}');
      calls.push(body.method);
      if (body.method === 'initialize') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26' } });
      }
      if (body.method === 'notifications/initialized') return jsonResponse({});
      if (body.method === 'tools/list') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            tools: [
              { name: 'page_read', description: 'read page content', inputSchema: { type: 'object' } },
              { name: 'page_delete', description: 'delete page', inputSchema: { type: 'object' } },
            ],
          },
        });
      }
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: {} });
    },
  });

  const result = await runtime.execute('mcp_tools_list', { server_code: 'browser' });
  assert.deepEqual(result.result.tools.map(item => item.name), ['page_read']);
  assert.ok(calls.includes('initialize'));
  assert.ok(calls.includes('tools/list'));
});
