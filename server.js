#!/usr/bin/env node
/**
 * 意心Code (yxcode) - Claude Code 可视化交互界面
 *
 * 极简架构：Express 静态服务 + WebSocket + Claude Agent SDK
 * 仅依赖 Node.js，无需构建工具
 */

import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { query } from '@anthropic-ai/claude-agent-sdk';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CLI Arguments ---
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
意心Code (yxcode) - Claude Code 可视化交互界面

用法:
  yxai [选项]

选项:
  -h, --help     显示帮助信息
  -v, --version  显示版本号
  -p, --port     指定端口号 (默认: 6060)

环境变量:
  PORT           自定义端口号

示例:
  yxai
  yxai --port 8080
  PORT=8080 yxai
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = JSON.parse(await fs.readFile(path.join(__dirname, 'package.json'), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

// --- Config ---
let PORT = parseInt(process.env.PORT, 10) || 6060;
const portIndex = args.findIndex(arg => arg === '--port' || arg === '-p');
if (portIndex !== -1 && args[portIndex + 1]) {
  PORT = parseInt(args[portIndex + 1], 10);
}
const API_BASE_URL = 'https://yxai.chat';

// --- Session & Permission State ---
const activeSessions = new Map();
const pendingApprovals = new Map();

// --- Helpers ---
function uid() {
  return crypto.randomUUID?.() ?? crypto.randomBytes(16).toString('hex');
}

function wsSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// --- Tool Approval ---
function waitForApproval(requestId, signal) {
  return new Promise((resolve) => {
    let settled = false;
    const finalize = (v) => {
      if (settled) return;
      settled = true;
      pendingApprovals.delete(requestId);
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve(v);
    };
    const onAbort = () => finalize({ cancelled: true });
    if (signal) {
      if (signal.aborted) return finalize({ cancelled: true });
      signal.addEventListener('abort', onAbort, { once: true });
    }
    pendingApprovals.set(requestId, finalize);
  });
}

function resolveApproval(requestId, decision) {
  const fn = pendingApprovals.get(requestId);
  if (fn) fn(decision);
}

// --- Check Claude CLI ---
function checkClaudeInstalled() {
  return new Promise((resolve) => {
    exec('claude --version', (err) => {
      resolve(!err);
    });
  });
}

// --- Claude SDK Query ---
async function runQuery(prompt, options, ws) {
  let sessionId = options.sessionId || null;

  // Always use fixed base URL, only inject API Key from options
  const prevBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const prevApiKey = process.env.ANTHROPIC_API_KEY;

  process.env.ANTHROPIC_BASE_URL = API_BASE_URL;
  console.log(`[config] ANTHROPIC_BASE_URL = ${API_BASE_URL}`);

  if (options.apiKey) {
    process.env.ANTHROPIC_API_KEY = options.apiKey;
    console.log(`[config] ANTHROPIC_API_KEY = ***${options.apiKey.slice(-6)}`);
  }

  const sdkOpts = {
    model: options.model || 'sonnet',
    cwd: options.cwd || process.cwd(),
    tools: { type: 'preset', preset: 'claude_code' },
    system: { type: 'preset', preset: 'claude_code' },
    settingSources: ['project', 'user', 'local'],
  };

  if (options.permissionMode && options.permissionMode !== 'default') {
    sdkOpts.permissionMode = options.permissionMode;
  }
  if (sessionId) {
    sdkOpts.resume = sessionId;
  }

  // Load MCP servers from ~/.claude.json
  const mcpServers = await loadMcpConfig(sdkOpts.cwd);
  if (mcpServers) sdkOpts.mcpServers = mcpServers;

  // Permission callback
  sdkOpts.canUseTool = async (toolName, input, context) => {
    if (sdkOpts.permissionMode === 'bypassPermissions') {
      return { behavior: 'allow', updatedInput: input };
    }
    const requestId = uid();
    wsSend(ws, {
      type: 'permission-request',
      requestId, toolName, input,
      sessionId,
    });
    const decision = await waitForApproval(requestId, context?.signal);
    if (!decision || decision.cancelled) {
      wsSend(ws, { type: 'permission-cancelled', requestId, sessionId });
      return { behavior: 'deny', message: 'Permission denied or cancelled' };
    }
    if (decision.allow) {
      return { behavior: 'allow', updatedInput: decision.updatedInput ?? input };
    }
    return { behavior: 'deny', message: decision.message ?? 'User denied' };
  };

  // Start query
  const prev = process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT;
  process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT = '300000';

  const qi = query({ prompt, options: sdkOpts });

  if (prev !== undefined) process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT = prev;
  else delete process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT;

  if (sessionId) activeSessions.set(sessionId, qi);

  try {
    for await (const msg of qi) {
      // Debug: log message types for streaming analysis
      console.log('[SDK msg]', msg.type, msg.subtype || '', msg.role || '', Array.isArray(msg.content) ? `content[${msg.content.length}]` : '');
      // Capture session id
      if (msg.session_id && !sessionId) {
        sessionId = msg.session_id;
        activeSessions.set(sessionId, qi);
        wsSend(ws, { type: 'session-created', sessionId });
      }
      wsSend(ws, { type: 'claude-response', data: msg, sessionId });

      // Token usage
      if (msg.type === 'result' && msg.modelUsage) {
        const mk = Object.keys(msg.modelUsage)[0];
        const md = msg.modelUsage[mk];
        if (md) {
          const used = (md.cumulativeInputTokens || md.inputTokens || 0)
            + (md.cumulativeOutputTokens || md.outputTokens || 0)
            + (md.cumulativeCacheReadInputTokens || md.cacheReadInputTokens || 0)
            + (md.cumulativeCacheCreationInputTokens || md.cacheCreationInputTokens || 0);
          wsSend(ws, { type: 'token-usage', used, sessionId });
        }
      }
    }
    wsSend(ws, { type: 'claude-complete', sessionId });
  } catch (err) {
    console.error('SDK error:', err.message);
    wsSend(ws, { type: 'claude-error', error: err.message, sessionId });
  } finally {
    if (sessionId) activeSessions.delete(sessionId);
    // Restore env vars
    if (prevBaseUrl !== undefined) process.env.ANTHROPIC_BASE_URL = prevBaseUrl;
    else delete process.env.ANTHROPIC_BASE_URL;
    if (prevApiKey !== undefined) process.env.ANTHROPIC_API_KEY = prevApiKey;
    else delete process.env.ANTHROPIC_API_KEY;
  }
}

// --- Load MCP Config ---
async function loadMcpConfig(cwd) {
  try {
    const cfgPath = path.join(os.homedir(), '.claude.json');
    const raw = await fs.readFile(cfgPath, 'utf8').catch(() => null);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    let servers = {};
    if (cfg.mcpServers) servers = { ...cfg.mcpServers };
    if (cfg.claudeProjects?.[cwd]?.mcpServers) {
      servers = { ...servers, ...cfg.claudeProjects[cwd].mcpServers };
    }
    return Object.keys(servers).length ? servers : null;
  } catch { return null; }
}

// --- Parse session info (Fix 4: scan full file for meaningful title) ---
const SYSTEM_TEXT_RE = /^(<system-reminder>|<command-name>|<local-command-|Caveat:)/;

function parseSessionInfo(raw) {
  let summary = '', msgCount = 0;
  const lines = raw.split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'human' || obj.type === 'user' || obj.type === 'assistant') msgCount++;
      // Priority 1: summary type entry
      if (!summary && obj.type === 'summary' && obj.summary) {
        summary = obj.summary.slice(0, 50);
      }
      // Priority 2: first user message text (filtered)
      if (!summary && (obj.type === 'human' || obj.type === 'user') && obj.message?.content) {
        let text = '';
        if (typeof obj.message.content === 'string') {
          text = obj.message.content;
        } else if (Array.isArray(obj.message.content)) {
          text = obj.message.content
            .filter(c => c.type === 'text' && c.text && !SYSTEM_TEXT_RE.test(c.text.trim()))
            .map(c => c.text).join(' ');
        }
        text = text.trim();

        // Extract content from <user_message> tag if present
        const userMsgMatch = text.match(/<user_message>\s*([\s\S]*?)\s*<\/user_message>/);
        if (userMsgMatch) {
          const userText = userMsgMatch[1].trim();
          if (userText) {
            summary = userText.slice(0, 50);
          }
        } else {
          // Skip if starts with "# 角色设定" or contains role-play prompt patterns
          if (text.startsWith('# 角色设定') || text.startsWith('## ')) {
            continue;
          }
          // Use the text as summary if no XML tag found
          if (text) {
            summary = text.slice(0, 50);
          }
        }
      }
    } catch {}
  }
  return { summary, msgCount };
}

// --- Express + WebSocket ---
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: version
const pkgJson = JSON.parse(await fs.readFile(path.join(__dirname, 'package.json'), 'utf8'));
app.get('/api/version', (_req, res) => {
  res.json({ version: pkgJson.version });
});

// API: list models (proxy from external API)
app.get('/api/models', async (_req, res) => {
  try {
    const https = await import('https');
    const url = `${API_BASE_URL}/prod-api/model?ModelApiTypes=1&SkipCount=1&MaxResultCount=100`;
    https.get(url, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        try {
          const json = JSON.parse(data);
          const models = (json.items || []).map(item => ({
            value: item.modelId,
            label: item.name,
            description: item.description,
            icon: item.iconUrl,
            provider: item.providerName,
          }));
          res.json(models);
        } catch (e) {
          console.error('[models API parse error]', e);
          res.status(500).json({ error: 'Failed to parse models' });
        }
      });
    }).on('error', (e) => {
      console.error('[models API error]', e);
      res.status(500).json({ error: e.message });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: list projects (scan ~/.claude/projects/)
app.get('/api/projects', async (_req, res) => {
  try {
    const base = path.join(os.homedir(), '.claude', 'projects');
    const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    const projects = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const projDir = path.join(base, ent.name);
      const files = await fs.readdir(projDir).catch(() => []);
      const sessions = [];
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const fp = path.join(projDir, f);
        const stat = await fs.stat(fp).catch(() => null);
        if (!stat) continue;
        const raw = await fs.readFile(fp, 'utf8').catch(() => '');
        const info = parseSessionInfo(raw);
        sessions.push({ id: f.replace('.jsonl', ''), file: f, summary: info.summary, msgCount: info.msgCount, mtime: stat.mtime });
      }
      sessions.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
      if (sessions.length) projects.push({ name: ent.name, sessions });
    }
    projects.sort((a, b) => {
      const ta = a.sessions[0]?.mtime || 0, tb = b.sessions[0]?.mtime || 0;
      return new Date(tb) - new Date(ta);
    });
    res.json(projects);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: sessions for a single project
app.get('/api/projects/:name/sessions', async (req, res) => {
  try {
    const projDir = path.join(os.homedir(), '.claude', 'projects', req.params.name);
    const files = await fs.readdir(projDir).catch(() => []);
    const sessions = [];
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const fp = path.join(projDir, f);
      const stat = await fs.stat(fp).catch(() => null);
      if (!stat) continue;
        const raw = await fs.readFile(fp, 'utf8').catch(() => '');
        const info = parseSessionInfo(raw);
        sessions.push({ id: f.replace('.jsonl', ''), file: f, summary: info.summary, msgCount: info.msgCount, mtime: stat.mtime });
      }
      sessions.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    res.json(sessions);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: messages for a session (Fix 1 + Fix 2 + Fix 7)
app.get('/api/projects/:name/sessions/:id/messages', async (req, res) => {
  try {
    const fp = path.join(os.homedir(), '.claude', 'projects', req.params.name, req.params.id + '.jsonl');
    const raw = await fs.readFile(fp, 'utf8');
    const messages = [];
    // Collect tool_results keyed by tool_use_id for association
    const toolResults = new Map();

    // First pass: collect tool_results from user messages
    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        const obj = JSON.parse(line);
        if ((obj.type === 'human' || obj.type === 'user') && Array.isArray(obj.message?.content)) {
          for (const block of obj.message.content) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              const txt = typeof block.content === 'string' ? block.content
                : Array.isArray(block.content) ? block.content.map(c => c.text || '').join('') : '';
              toolResults.set(block.tool_use_id, { tool_use_id: block.tool_use_id, content: txt, is_error: !!block.is_error });
            }
          }
        }
      } catch {}
    }

    // Second pass: build messages with parts
    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'human' || obj.type === 'user') {
          let text = '';
          if (typeof obj.message?.content === 'string') {
            text = obj.message.content;
          } else if (Array.isArray(obj.message?.content)) {
            text = obj.message.content
              .filter(c => c.type === 'text' && c.text && !SYSTEM_TEXT_RE.test(c.text.trim()))
              .map(c => c.text).join('\n');
          }
          text = text.trim();
          if (text) messages.push({ role: 'user', content: text });
        } else if (obj.type === 'assistant') {
          const content = obj.message?.content;
          const parts = [];
          if (typeof content === 'string') {
            if (content.trim()) parts.push({ type: 'text', text: content });
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text?.trim()) {
                parts.push({ type: 'text', text: block.text });
              } else if (block.type === 'tool_use') {
                parts.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
                // Attach associated tool_result
                const tr = toolResults.get(block.id);
                if (tr) parts.push({ type: 'tool_result', tool_use_id: tr.tool_use_id, content: tr.content, is_error: tr.is_error });
              }
            }
          }
          if (parts.length) messages.push({ role: 'assistant', content: parts.filter(p => p.type === 'text').map(p => p.text).join('\n'), parts });
        }
      } catch {}
    }
    res.json(messages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: browse directories (Fix 5: folder picker)
app.get('/api/browse', async (req, res) => {
  try {
    let target = req.query.path || '';
    // Windows: if empty, list drive letters
    if (!target && process.platform === 'win32') {
      const { execSync } = await import('child_process');
      try {
        // Use PowerShell Get-PSDrive (modern Windows)
        const raw = execSync('powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root"', { encoding: 'utf8' });
        const drives = raw.split('\n').map(l => l.trim()).filter(l => /^[A-Z]:\\?$/.test(l));
        return res.json({ path: '', parent: '', dirs: drives.map(d => ({ name: d.replace(/\\$/, ''), path: d })) });
      } catch (e) {
        // If PowerShell fails, fallback to home directory
        console.warn('[browse] Failed to get drive letters:', e.message);
      }
    }
    if (!target) target = os.homedir();
    const resolved = path.resolve(target);
    const parent = path.dirname(resolved);
    const entries = await fs.readdir(resolved, { withFileTypes: true }).catch(() => []);
    const dirs = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name.startsWith('.')) continue;
      dirs.push({ name: ent.name, path: path.join(resolved, ent.name) });
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ path: resolved, parent: parent !== resolved ? parent : '', dirs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: file tree
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '__pycache__', '.next', '.nuxt', 'dist', 'build', '.cache', '.claude']);
app.get('/api/files', async (req, res) => {
  try {
    const root = req.query.cwd || process.cwd();
    async function scan(dir, depth) {
      if (depth > 5) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      const items = [];
      for (const ent of entries) {
        if (ent.name.startsWith('.') && ent.name !== '.env') continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (SKIP_DIRS.has(ent.name)) continue;
          const children = await scan(full, depth + 1);
          items.push({ name: ent.name, type: 'dir', path: full, children });
        } else {
          const stat = await fs.stat(full).catch(() => null);
          items.push({ name: ent.name, type: 'file', path: full, size: stat?.size || 0 });
        }
      }
      items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
      return items;
    }
    res.json(await scan(root, 0));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: flat file list for @ mentions
app.get('/api/files-flat', async (req, res) => {
  try {
    const root = req.query.cwd || process.cwd();
    const results = [];
    const MAX = 5000;
    async function scan(dir, depth) {
      if (depth > 10 || results.length >= MAX) return;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const ent of entries) {
        if (results.length >= MAX) return;
        if (ent.name.startsWith('.') && ent.name !== '.env') continue;
        const full = path.join(dir, ent.name);
        const rel = path.relative(root, full).replace(/\\/g, '/');
        if (ent.isDirectory()) {
          if (SKIP_DIRS.has(ent.name)) continue;
          results.push({ path: rel + '/', type: 'dir' });
          await scan(full, depth + 1);
        } else {
          results.push({ path: rel, type: 'file' });
        }
      }
    }
    await scan(root, 0);
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// API: read single file (max 500KB)
app.get('/api/file', async (req, res) => {
  try {
    const fp = req.query.path;
    if (!fp) return res.status(400).json({ error: 'path required' });
    const stat = await fs.stat(fp);
    if (stat.size > 500 * 1024) return res.status(413).json({ error: 'File too large (>500KB)' });
    const content = await fs.readFile(fp, 'utf8');
    res.json({ path: fp, size: stat.size, content });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[WS] client connected');

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'claude-command': {
        const hasClaudeCli = await checkClaudeInstalled();
        if (!hasClaudeCli) {
          wsSend(ws, {
            type: 'claude-error',
            error: '意心Code 底层依赖于 Claude Code，当前未检测到 Claude 环境，请先安装 Claude Code。\n安装命令：npm install -g @anthropic-ai/claude-code',
            sessionId: msg.sessionId || null,
          });
          break;
        }
        runQuery(msg.prompt, {
          sessionId: msg.sessionId || null,
          cwd: msg.cwd || null,
          model: msg.model || 'sonnet',
          permissionMode: msg.permissionMode || 'default',
          apiKey: msg.apiKey || null,
        }, ws).catch((e) => console.error('[query error]', e.message));
        break;
      }

      case 'permission-response':
        resolveApproval(msg.requestId, {
          allow: msg.allow,
          updatedInput: msg.updatedInput,
          message: msg.message,
        });
        break;

      case 'abort-session':
        if (msg.sessionId && activeSessions.has(msg.sessionId)) {
          const qi = activeSessions.get(msg.sessionId);
          qi.interrupt().catch(() => {});
          activeSessions.delete(msg.sessionId);
          wsSend(ws, { type: 'session-aborted', sessionId: msg.sessionId });
        }
        break;
    }
  });

  ws.on('close', () => console.log('[WS] client disconnected'));
});

// Try to start server, auto-increment port if in use
const MAX_PORT_ATTEMPTS = 100;
let currentPort = PORT;
let portAttempts = 0;

function startServer(port) {
  server.listen(port, () => {
    PORT = port;
    const url = `http://localhost:${port}`;
    console.log(`\n  意心Code (yxcode) 已启动`);
    console.log(`  ${url}\n`);

    // Auto-open browser
    const open = (url) => {
      const cmd = process.platform === 'win32' ? `start ${url}`
        : process.platform === 'darwin' ? `open ${url}`
        : `xdg-open ${url}`;
      exec(cmd);
    };

    // Open browser after a short delay
    setTimeout(() => open(url), 1000);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    portAttempts++;
    if (portAttempts < MAX_PORT_ATTEMPTS) {
      const nextPort = currentPort + portAttempts;
      console.log(`  端口 ${currentPort + portAttempts - 1} 已被占用，尝试端口 ${nextPort}...`);
      startServer(nextPort);
    } else {
      console.error(`\n  错误: 无法找到可用端口 (已尝试 ${MAX_PORT_ATTEMPTS} 次)\n`);
      process.exit(1);
    }
  } else {
    console.error(`\n  服务器错误: ${err.message}\n`);
    process.exit(1);
  }
});

startServer(currentPort);
