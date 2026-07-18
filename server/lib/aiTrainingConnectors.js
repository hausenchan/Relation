const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_RESPONSE_CHARS = 60000;
const MCP_PROTOCOL_VERSIONS = ['2025-03-26', '2024-11-05'];

function normalizeText(value) {
  return String(value || '').trim();
}

function parseJsonConfig(value, fallback = []) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeIdentifier(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9_.-]+/g, '_');
}

function isConnectorAllowed(config, user) {
  if (!config || config.enabled === false) return false;
  if (config.public === true) return true;
  const userId = Number(user?.id || 0);
  const allowedUserIds = normalizeArray(config.allowed_user_ids).map(Number);
  if (userId && allowedUserIds.includes(userId)) return true;
  const roles = new Set([
    normalizeText(user?.role),
    normalizeText(user?.executive_role),
  ].filter(Boolean));
  return normalizeArray(config.allowed_roles).some(role => roles.has(normalizeText(role)));
}

function normalizeConfiguredUrl(value, label) {
  const raw = normalizeText(value);
  if (!raw) throw new Error(`${label}未配置地址`);
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${label}仅支持 HTTP/HTTPS`);
  url.username = '';
  url.password = '';
  url.hash = '';
  return url;
}

function buildUrl(baseUrl, pathValue, query = {}) {
  const base = normalizeConfiguredUrl(baseUrl, '连接器');
  const pathText = normalizeText(pathValue || '/');
  const basePath = base.pathname === '/' ? '' : base.pathname.replace(/\/+$/, '');
  const requestedPath = pathText.startsWith('/') ? pathText : `/${pathText}`;
  const url = new URL(`${basePath}${requestedPath}`, `${base.origin}/`);
  if (url.origin !== base.origin) throw new Error('连接器请求地址越过了配置的服务域名');
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach(item => url.searchParams.append(key, String(item)));
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url;
}

function clipValue(value, maxLength = 12000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n[结果过长，已截断]` : text;
}

function parseResponsePayload(rawText, contentType = '') {
  const text = String(rawText || '').trim();
  if (!text) return null;
  if (String(contentType).toLowerCase().includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return { text: text.slice(0, 12000) };
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return { text: text.slice(0, 12000) };
  }
}

async function fetchConnectorPayload(url, options = {}, runtime = {}) {
  const fetchImpl = runtime.fetchImpl || fetch;
  const timeoutMs = Math.max(3000, Number(runtime.timeoutMs || DEFAULT_TIMEOUT_MS));
  const response = await fetchImpl(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const rawText = await response.text();
  if (rawText.length > Number(runtime.maxResponseChars || DEFAULT_MAX_RESPONSE_CHARS)) {
    throw new Error(`连接器响应超过 ${runtime.maxResponseChars || DEFAULT_MAX_RESPONSE_CHARS} 字符上限`);
  }
  const payload = parseResponsePayload(rawText, response.headers.get('content-type') || '');
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || payload?.text || `${response.status} ${response.statusText}`;
    throw new Error(`连接器请求失败：${String(detail).slice(0, 500)}`);
  }
  return payload;
}

function getBearerHeaders(token, extraHeaders = {}) {
  const normalizedToken = normalizeText(token);
  return {
    Accept: 'application/json',
    ...(normalizedToken ? { Authorization: `Bearer ${normalizedToken}` } : {}),
    ...extraHeaders,
  };
}

function getGiteeHeaders(token) {
  const normalizedToken = normalizeText(token);
  return {
    Accept: 'application/json',
    ...(normalizedToken ? { Authorization: `token ${normalizedToken}` } : {}),
  };
}

function normalizeMidmaxSources(env, user) {
  const baseUrl = normalizeText(env.AI_AGENT_MIDMAX_BASE_URL || 'https://mid-max.midongtech.com');
  const token = normalizeText(env.AI_AGENT_MIDMAX_API_TOKEN);
  return normalizeArray(parseJsonConfig(env.AI_AGENT_MIDMAX_SOURCES_JSON, []))
    .map((source) => ({
      ...source,
      source_code: normalizeIdentifier(source.source_code || source.code),
      name: normalizeText(source.name || source.source_code || source.code),
      description: normalizeText(source.description),
      path: normalizeText(source.path),
      base_url: normalizeText(source.base_url || baseUrl),
      token: normalizeText(source.token || token),
      method: 'GET',
    }))
    .filter(source => source.source_code && source.path && isConnectorAllowed(source, user));
}

function normalizeGiteeProjects(env, user) {
  const token = normalizeText(env.AI_AGENT_GITEE_TOKEN);
  const apiBaseUrl = normalizeText(env.AI_AGENT_GITEE_API_BASE_URL || 'https://gitee.com/api/v5');
  return normalizeArray(parseJsonConfig(env.AI_AGENT_GITEE_PROJECTS_JSON, []))
    .map((project) => ({
      ...project,
      project_code: normalizeIdentifier(project.project_code || project.code),
      name: normalizeText(project.name || project.project_code || project.code),
      owner: normalizeText(project.owner),
      repo: normalizeText(project.repo),
      branch: normalizeText(project.branch || 'main'),
      api_base_url: normalizeText(project.api_base_url || apiBaseUrl),
      token: normalizeText(project.token || token),
    }))
    .filter(project => project.project_code && project.owner && project.repo && isConnectorAllowed(project, user));
}

function normalizeMcpServers(env, user) {
  return normalizeArray(parseJsonConfig(env.AI_AGENT_MCP_SERVERS_JSON, []))
    .map((server) => {
      const tokenEnvName = normalizeText(server.token_env);
      return {
        ...server,
        server_code: normalizeIdentifier(server.server_code || server.code),
        name: normalizeText(server.name || server.server_code || server.code),
        description: normalizeText(server.description),
        endpoint: normalizeText(server.endpoint),
        token: normalizeText(server.token || (tokenEnvName ? env[tokenEnvName] : '')),
        token_env: tokenEnvName,
        allowed_tools: normalizeArray(server.allowed_tools).map(normalizeText).filter(Boolean),
        blocked_tools: normalizeArray(server.blocked_tools).map(normalizeText).filter(Boolean),
        allowed_url_origins: normalizeArray(server.allowed_url_origins).map((value) => {
          try {
            return normalizeConfiguredUrl(value, 'MCP 允许域名').origin;
          } catch {
            return '';
          }
        }).filter(Boolean),
        read_only: server.read_only !== false,
      };
    })
    .filter(server => server.server_code && server.endpoint && isConnectorAllowed(server, user));
}

function isReadOnlyMcpTool(tool = {}) {
  const text = `${tool.name || ''} ${tool.description || ''}`.toLowerCase();
  if (/(create|update|delete|remove|write|edit|move|rename|upload|publish|send|新增|修改|删除|写入|发送|发布)/.test(text)) return false;
  return /(get|read|list|search|find|query|fetch|inspect|open|navigate|screenshot|snapshot|查看|读取|查询|搜索|打开|截图)/.test(text);
}

function filterMcpTools(server, tools) {
  return normalizeArray(tools).filter((tool) => {
    const name = normalizeText(tool?.name);
    if (!name || server.blocked_tools.includes(name)) return false;
    if (server.allowed_tools.length === 0 || !server.allowed_tools.includes(name)) return false;
    if (server.read_only && !isReadOnlyMcpTool(tool)) return false;
    return true;
  });
}

function validateMcpToolArguments(server, args) {
  const allowedOrigins = new Set(server.allowed_url_origins || []);
  const visit = (value, key = '', depth = 0) => {
    if (depth > 6 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach(item => visit(item, key, depth + 1));
      return;
    }
    if (typeof value === 'object') {
      Object.entries(value).slice(0, 100).forEach(([childKey, childValue]) => {
        visit(childValue, childKey, depth + 1);
      });
      return;
    }
    if (typeof value !== 'string' || !/(?:^|_)(?:url|uri|href|endpoint|target)(?:$|_)/i.test(key)) return;
    let url;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('MCP 工具仅允许 HTTP/HTTPS 页面地址');
    if (allowedOrigins.size === 0) throw new Error('MCP 服务器未配置可访问页面域名白名单');
    if (!allowedOrigins.has(url.origin)) throw new Error(`MCP 工具无权访问页面域名：${url.origin}`);
  };
  visit(args || {});
}

function parseSsePayload(rawText, expectedId) {
  const payloads = [];
  String(rawText || '').split(/\r?\n/).forEach((line) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    try {
      payloads.push(JSON.parse(data));
    } catch {}
  });
  return payloads.find(item => item?.id === expectedId) || payloads[payloads.length - 1] || null;
}

class AgentMcpHttpClient {
  constructor({ endpoint, token, fetchImpl, timeoutMs }) {
    this.endpoint = normalizeConfiguredUrl(endpoint, 'MCP').toString();
    this.token = normalizeText(token);
    this.fetchImpl = fetchImpl || fetch;
    this.timeoutMs = timeoutMs || DEFAULT_TIMEOUT_MS;
    this.sessionId = '';
    this.nextId = 1;
    this.protocolVersion = MCP_PROTOCOL_VERSIONS[0];
  }

  async send(method, params, { notification = false } = {}) {
    const id = notification ? undefined : this.nextId++;
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        'MCP-Protocol-Version': this.protocolVersion,
        ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        ...(notification ? {} : { id }),
        method,
        ...(params === undefined ? {} : { params }),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const sessionId = response.headers.get('mcp-session-id') || response.headers.get('Mcp-Session-Id') || '';
    if (sessionId) this.sessionId = sessionId;
    const rawText = await response.text();
    if (rawText.length > DEFAULT_MAX_RESPONSE_CHARS) {
      throw new Error(`MCP 响应超过 ${DEFAULT_MAX_RESPONSE_CHARS} 字符上限`);
    }
    const contentType = response.headers.get('content-type') || '';
    let payload = null;
    if (contentType.includes('text/event-stream') || rawText.includes('\ndata:')) {
      payload = parseSsePayload(rawText, id);
    } else if (rawText.trim()) {
      payload = JSON.parse(rawText);
    }
    if (!response.ok) throw new Error(payload?.error?.message || `MCP HTTP ${response.status}`);
    if (payload?.error) throw new Error(payload.error.message || 'MCP 调用失败');
    return payload?.result ?? payload ?? null;
  }

  async initialize() {
    let lastError = null;
    for (const version of MCP_PROTOCOL_VERSIONS) {
      try {
        this.protocolVersion = version;
        const result = await this.send('initialize', {
          protocolVersion: version,
          capabilities: {},
          clientInfo: { name: 'Relation AI Training Agent', version: '1.0.0' },
        });
        await this.send('notifications/initialized', {}, { notification: true }).catch(() => {});
        return result;
      } catch (error) {
        lastError = error;
        this.sessionId = '';
      }
    }
    throw lastError || new Error('MCP 初始化失败');
  }

  listTools() {
    return this.send('tools/list', {});
  }

  callTool(name, args) {
    return this.send('tools/call', { name, arguments: args || {} });
  }
}

function normalizeMcpToolList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.tools)) return result.tools;
  return [];
}

function createToolDefinition(name, description, properties = {}, required = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      },
    },
  };
}

function createAiTrainingExternalConnectorRuntime({ user, env = process.env, fetchImpl = fetch } = {}) {
  const midmaxSources = normalizeMidmaxSources(env, user);
  const giteeProjects = normalizeGiteeProjects(env, user);
  const mcpServers = normalizeMcpServers(env, user);
  const definitions = [
    createToolDefinition(
      'agent_connections_status',
      '查看当前员工可用的 Mid-Max、Gitee、浏览器/MCP 连接器状态。需要知道是否具备外部执行能力时使用。'
    ),
  ];
  if (midmaxSources.length) {
    definitions.push(
      createToolDefinition('midmax_sources_list', '列出当前员工可查询的 Mid-Max 数据源。'),
      createToolDefinition('midmax_source_query', '查询管理员预先配置且当前员工有权限的 Mid-Max 只读数据源。', {
        source_code: { type: 'string', description: 'Mid-Max 数据源编码。' },
        params: { type: 'object', description: '传给该数据源的查询参数。', additionalProperties: true },
      }, ['source_code']),
    );
  }
  if (giteeProjects.length) {
    definitions.push(
      createToolDefinition('gitee_projects_list', '列出当前员工有权访问的 Gitee 项目。'),
      createToolDefinition('gitee_repository_tree', '读取授权 Gitee 项目的目录树。', {
        project_code: { type: 'string', description: '项目编码。' },
        path_prefix: { type: 'string', description: '可选，只返回此前缀下的文件。' },
        limit: { type: 'integer', minimum: 1, maximum: 500 },
      }, ['project_code']),
      createToolDefinition('gitee_file_read', '读取授权 Gitee 项目中的文本文件。', {
        project_code: { type: 'string', description: '项目编码。' },
        path: { type: 'string', description: '仓库内文件路径。' },
        ref: { type: 'string', description: '可选，分支或提交 SHA。' },
      }, ['project_code', 'path']),
    );
  }
  if (mcpServers.length) {
    definitions.push(
      createToolDefinition('mcp_servers_list', '列出当前员工可使用的 MCP 服务器，包括浏览器类 MCP。'),
      createToolDefinition('mcp_tools_list', '读取指定 MCP 服务器允许 Agent 使用的工具列表和参数结构。', {
        server_code: { type: 'string', description: 'MCP 服务器编码。' },
      }, ['server_code']),
      createToolDefinition('mcp_tool_call', '调用指定 MCP 服务器白名单中的工具，可用于浏览器读取、页面导航、截图或其他已授权能力。', {
        server_code: { type: 'string', description: 'MCP 服务器编码。' },
        tool_name: { type: 'string', description: '通过 mcp_tools_list 获得的工具名称。' },
        arguments: { type: 'object', description: '工具参数。', additionalProperties: true },
      }, ['server_code', 'tool_name']),
    );
  }

  const findMidmaxSource = code => midmaxSources.find(item => item.source_code === normalizeIdentifier(code));
  const findGiteeProject = code => giteeProjects.find(item => item.project_code === normalizeIdentifier(code));
  const findMcpServer = code => mcpServers.find(item => item.server_code === normalizeIdentifier(code));

  return {
    definitions,
    status: {
      midmax: { enabled: midmaxSources.length > 0, source_count: midmaxSources.length },
      gitee: { enabled: giteeProjects.length > 0, project_count: giteeProjects.length },
      mcp: { enabled: mcpServers.length > 0, server_count: mcpServers.length },
    },
    execute: async (toolName, args = {}) => {
      if (toolName === 'agent_connections_status') {
        const result = {
          midmax: { enabled: midmaxSources.length > 0, sources: midmaxSources.map(item => item.source_code) },
          gitee: { enabled: giteeProjects.length > 0, projects: giteeProjects.map(item => item.project_code) },
          mcp: {
            enabled: mcpServers.length > 0,
            servers: mcpServers.map(item => ({ code: item.server_code, name: item.name, read_only: item.read_only })),
          },
        };
        return {
          display_name: '检查 Agent 外部连接器',
          result,
          result_summary: `Mid-Max ${result.midmax.enabled ? '已接入' : '未配置'}，Gitee ${result.gitee.enabled ? '已接入' : '未配置'}，MCP ${result.mcp.enabled ? '已接入' : '未配置'}。`,
        };
      }

      if (toolName === 'midmax_sources_list') {
        const sources = midmaxSources.map(item => ({
          source_code: item.source_code,
          name: item.name,
          description: item.description,
          method: 'GET',
        }));
        return {
          display_name: '查看 Mid-Max 数据源',
          result: { count: sources.length, sources },
          result_summary: `当前账号可查询 ${sources.length} 个 Mid-Max 数据源。`,
        };
      }

      if (toolName === 'midmax_source_query') {
        const source = findMidmaxSource(args.source_code);
        if (!source) throw new Error('Mid-Max 数据源不存在或当前账号无权访问');
        const url = buildUrl(source.base_url, source.path, args.params || {});
        const payload = await fetchConnectorPayload(url, {
          method: 'GET',
          headers: getBearerHeaders(source.token, source.headers || {}),
        }, { fetchImpl });
        return {
          display_name: `查询 Mid-Max：${source.name}`,
          result: payload,
          result_summary: `已从 Mid-Max 数据源 ${source.name} 返回查询结果。`,
          references: [{ id: source.source_code, title: source.name, type: 'midmax_source' }],
        };
      }

      if (toolName === 'gitee_projects_list') {
        const projects = giteeProjects.map(item => ({
          project_code: item.project_code,
          name: item.name,
          owner: item.owner,
          repo: item.repo,
          branch: item.branch,
        }));
        return {
          display_name: '查看授权 Gitee 项目',
          result: { count: projects.length, projects },
          result_summary: `当前账号可访问 ${projects.length} 个 Gitee 项目。`,
        };
      }

      if (toolName === 'gitee_repository_tree') {
        const project = findGiteeProject(args.project_code);
        if (!project) throw new Error('Gitee 项目不存在或当前账号无权访问');
        const base = normalizeConfiguredUrl(project.api_base_url, 'Gitee API').toString().replace(/\/+$/, '');
        const url = buildUrl(base, `/repos/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.repo)}/git/trees/${encodeURIComponent(project.branch)}`, { recursive: 1 });
        const payload = await fetchConnectorPayload(url, { headers: getGiteeHeaders(project.token) }, { fetchImpl });
        const prefix = normalizeText(args.path_prefix).replace(/^\/+/, '');
        const limit = Math.min(Math.max(Number(args.limit) || 200, 1), 500);
        const tree = normalizeArray(payload?.tree)
          .filter(item => !prefix || String(item.path || '').startsWith(prefix))
          .slice(0, limit)
          .map(item => ({ path: item.path, type: item.type, size: item.size || null, sha: item.sha || '' }));
        return {
          display_name: `读取 Gitee 目录：${project.name}`,
          result: { project_code: project.project_code, branch: project.branch, count: tree.length, tree },
          result_summary: `已读取 ${project.name} 的 ${tree.length} 个目录项。`,
          references: [{ id: project.project_code, title: project.name, type: 'gitee_project' }],
        };
      }

      if (toolName === 'gitee_file_read') {
        const project = findGiteeProject(args.project_code);
        if (!project) throw new Error('Gitee 项目不存在或当前账号无权访问');
        const filePath = normalizeText(args.path).replace(/^\/+/, '');
        if (!filePath || filePath.includes('..')) throw new Error('Gitee 文件路径不合法');
        const ref = normalizeText(args.ref || project.branch);
        const base = normalizeConfiguredUrl(project.api_base_url, 'Gitee API').toString().replace(/\/+$/, '');
        const url = buildUrl(base, `/repos/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.repo)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`, { ref });
        const payload = await fetchConnectorPayload(url, { headers: getGiteeHeaders(project.token) }, { fetchImpl });
        const encoding = normalizeText(payload?.encoding).toLowerCase();
        const rawContent = normalizeText(payload?.content).replace(/\s+/g, '');
        const content = encoding === 'base64'
          ? Buffer.from(rawContent, 'base64').toString('utf8')
          : normalizeText(payload?.content || payload?.text);
        return {
          display_name: `读取 Gitee 文件：${filePath}`,
          result: {
            project_code: project.project_code,
            path: filePath,
            ref,
            sha: payload?.sha || '',
            content: clipValue(content, 30000),
            truncated: content.length > 30000,
          },
          result_summary: `已读取 ${project.name}/${filePath}${content.length > 30000 ? '，内容已截断' : ''}。`,
          references: [{ id: `${project.project_code}:${filePath}`, title: filePath, type: 'gitee_file' }],
        };
      }

      if (toolName === 'mcp_servers_list') {
        const servers = mcpServers.map(item => ({
          server_code: item.server_code,
          name: item.name,
          description: item.description,
          read_only: item.read_only,
        }));
        return {
          display_name: '查看 MCP 服务器',
          result: { count: servers.length, servers },
          result_summary: `当前账号可使用 ${servers.length} 个 MCP 服务器。`,
        };
      }

      if (toolName === 'mcp_tools_list' || toolName === 'mcp_tool_call') {
        const server = findMcpServer(args.server_code);
        if (!server) throw new Error('MCP 服务器不存在或当前账号无权访问');
        const client = new AgentMcpHttpClient({ endpoint: server.endpoint, token: server.token, fetchImpl });
        await client.initialize();
        const tools = filterMcpTools(server, normalizeMcpToolList(await client.listTools()));
        if (toolName === 'mcp_tools_list') {
          const safeTools = tools.map(tool => ({
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema || tool.input_schema || { type: 'object', properties: {} },
          }));
          return {
            display_name: `查看 MCP 工具：${server.name}`,
            result: { server_code: server.server_code, count: safeTools.length, tools: safeTools },
            result_summary: `${server.name} 当前开放 ${safeTools.length} 个 Agent 工具。`,
          };
        }
        const toolNameValue = normalizeText(args.tool_name);
        if (!tools.some(tool => tool.name === toolNameValue)) throw new Error('MCP 工具不在当前服务器白名单内');
        validateMcpToolArguments(server, args.arguments || {});
        const result = await client.callTool(toolNameValue, args.arguments || {});
        return {
          display_name: `执行 MCP：${server.name}/${toolNameValue}`,
          result,
          result_summary: `已通过 ${server.name} 执行 ${toolNameValue}。`,
          references: [{ id: `${server.server_code}:${toolNameValue}`, title: toolNameValue, type: 'mcp_tool' }],
        };
      }

      throw new Error(`未注册的外部连接器工具：${toolName}`);
    },
  };
}

module.exports = {
  AgentMcpHttpClient,
  createAiTrainingExternalConnectorRuntime,
  __test: {
    buildUrl,
    filterMcpTools,
    isConnectorAllowed,
    normalizeGiteeProjects,
    normalizeMidmaxSources,
    normalizeMcpServers,
    validateMcpToolArguments,
  },
};
