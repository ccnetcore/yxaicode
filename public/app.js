// ========== 意心Code 前端 ==========
marked.setOptions({
  highlight: (code, lang) => {
    try {
      if (typeof hljs !== 'undefined') {
        if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
        return hljs.highlightAuto(code).value;
      }
    } catch(e) { console.warn('[hljs]', e); }
    return code;
  }, breaks: true, gfm: true,
});

const $ = s => document.querySelector(s);
const modelSelectDisplay=$('#modelSelectDisplay'), modelSelectDropdown=$('#modelSelectDropdown'),
  setModelSearch=$('#setModelSearch'), setModelDropdown=$('#setModelDropdown'),
  advancedToggle=$('#advancedToggle'), advancedContent=$('#advancedContent'),
  permSelect=$('#permSelect'), girlfriendMode=$('#girlfriendMode'), cwdInput=$('#cwdInput'),
  cwdDropdown=$('#cwdDropdown'),
  connStatus=$('#connStatus'), messagesEl=$('#messages'), permBanner=$('#permBanner'),
  promptInput=$('#promptInput'), sendBtn=$('#sendBtn'), abortBtn=$('#abortBtn'),
  newBtn=$('#newBtn'), sessionInfo=$('#sessionInfo'),
  settingsBtn=$('#settingsBtn'), settingsOverlay=$('#settingsOverlay'),
  setApiKey=$('#setApiKey'),
  setBaseUrl=$('#setBaseUrl'), testBaseUrlBtn=$('#testBaseUrlBtn'), testResult=$('#testResult'),
  settingsSaveBtn=$('#settingsSaveBtn'),
  settingsCloseBtn=$('#settingsCloseBtn'), settingsSaved=$('#settingsSaved'),
  clearPermissionsBtn=$('#clearPermissionsBtn'), permissionCount=$('#permissionCount'),
  sidebar=$('#sidebar'), sidebarBody=$('#sidebarBody'),
  sidebarToggle=$('#sidebarToggle'), sidebarCloseBtn=$('#sidebarCloseBtn'),
  newSessionSideBtn=$('#newSessionSideBtn'),
  locateSessionBtn=$('#locateSessionBtn'),
  filePanel=$('#filePanel'), fileTreeBody=$('#fileTreeBody'),
  filePanelToggle=$('#filePanelToggle'),
  fileRefreshBtn=$('#fileRefreshBtn'),
  fileViewer=$('#fileViewer'), fvPath=$('#fvPath'), fvContent=$('#fvContent'), fvCloseBtn=$('#fvCloseBtn'),
  fvInsertBtn=$('#fvInsertBtn'), fvCopyBtn=$('#fvCopyBtn'),
  cwdBrowseBtn=$('#cwdBrowseBtn'),
  cwdOpenBtn=$('#cwdOpenBtn'),
  folderBrowser=$('#folderBrowser'), fbPath=$('#fbPath'), fbBody=$('#fbBody'),
  fbSelectBtn=$('#fbSelectBtn'), fbCancelBtn=$('#fbCancelBtn'), fbCloseBtn=$('#fbCloseBtn'),
  sidebarSearch=$('#sidebarSearch'),
  cmdDropdown=$('#cmdDropdown');

// 加载提示文本
let tips = [];
fetch('/prompt/LOADING_TIPS.md').then(r=>r.text()).then(t=>{
  tips = t.split('\n').filter(l=>l.trim());
}).catch(()=>{});

// --- Theme Switching ---
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIconSun = document.getElementById('themeIconSun');
const themeIconMoon = document.getElementById('themeIconMoon');
const hljsThemeLink = document.getElementById('hljs-theme');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'light') {
    themeIconSun.style.display = 'none';
    themeIconMoon.style.display = '';
    if (hljsThemeLink) hljsThemeLink.href = '/vendor/github.min.css';
  } else {
    themeIconSun.style.display = '';
    themeIconMoon.style.display = 'none';
    if (hljsThemeLink) hljsThemeLink.href = '/vendor/github-dark.min.css';
  }
  localStorage.setItem('yxcode_theme', theme);
}

themeToggleBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
});

// Sync toggle icon with saved theme on load
(function() {
  const saved = localStorage.getItem('yxcode_theme') || 'dark';
  if (saved === 'light') {
    themeIconSun.style.display = 'none';
    themeIconMoon.style.display = '';
  }
})();

// --- Fullscreen Toggle ---
const fullscreenBtn = document.getElementById('fullscreenBtn');
const fullscreenIconExpand = document.getElementById('fullscreenIconExpand');
const fullscreenIconCompress = document.getElementById('fullscreenIconCompress');

function applyFullscreenIcon(isFs) {
  if (isFs) {
    fullscreenIconExpand.style.display = 'none';
    fullscreenIconCompress.style.display = '';
  } else {
    fullscreenIconExpand.style.display = '';
    fullscreenIconCompress.style.display = 'none';
  }
}

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

document.addEventListener('fullscreenchange', () => {
  applyFullscreenIcon(!!document.fullscreenElement);
});

let ws=null, sessionId=null, isStreaming=false, streamingEl=null, streamBuf='', flushTimer=null;
let currentGroup=null; // 当前活跃的 .msg-group 容器
let activeBtwId=null, btwStreamBuf=''; // /btw 快速补充状态
let expandedProjects = new Set(); // Fix 6: track expanded sidebar projects
let expandedFolders = new Set(); // Track expanded file tree folders
let selectedModel = null; // Current selected model object
let selectedSettingsModel = null; // Settings model selection
let modelsData = []; // All available models
let customModels = []; // User-added custom models
let rememberedPermissions = new Set(); // Remembered permission rules
let cwdHistory = []; // Working directory history (max 10)
let planModeEnabled = false; // 计划模式状态
// 图片粘贴相关
let pendingImages = []; // 待发送的图片 [{data, mediaType, name}]
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// ========== CWD History Management ==========
function loadCwdHistory() {
  try {
    const saved = localStorage.getItem('yxcode_cwdHistory');
    if (saved) {
      cwdHistory = JSON.parse(saved);
    }
  } catch(e) {
    console.error('[loadCwdHistory]', e);
    cwdHistory = [];
  }
}

function saveCwdToHistory(path) {
  if (!path || !path.trim()) return;

  const trimmedPath = path.trim();
  // Remove duplicates
  cwdHistory = cwdHistory.filter(p => p !== trimmedPath);
  // Add to beginning
  cwdHistory.unshift(trimmedPath);
  // Keep max 10 items
  if (cwdHistory.length > 10) {
    cwdHistory = cwdHistory.slice(0, 10);
  }

  try {
    localStorage.setItem('yxcode_cwdHistory', JSON.stringify(cwdHistory));
  } catch(e) {
    console.error('[saveCwdToHistory]', e);
  }
}

function deleteCwdFromHistory(path) {
  cwdHistory = cwdHistory.filter(p => p !== path);
  try {
    localStorage.setItem('yxcode_cwdHistory', JSON.stringify(cwdHistory));
  } catch(e) {
    console.error('[deleteCwdFromHistory]', e);
  }
  renderCwdDropdown();
}

function renderCwdDropdown() {
  cwdDropdown.innerHTML = '';

  if (cwdHistory.length === 0) {
    cwdDropdown.innerHTML = '<div class="cwd-dropdown-empty">暂无历史记录</div>';
    return;
  }

  cwdHistory.forEach(path => {
    const item = document.createElement('div');
    item.className = 'cwd-dropdown-item';
    item.innerHTML = `
      <span class="cwd-dropdown-item-icon">📁</span>
      <span class="cwd-dropdown-item-text">${escHtml(path)}</span>
      <button class="cwd-dropdown-delete" title="删除">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    `;

    // Click path to select
    const pathSpan = item.querySelector('.cwd-dropdown-item-text');
    pathSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      cwdInput.value = path;
      cwdDropdown.classList.remove('show');
      localStorage.setItem('yxcode_cwd', path);
      loadFileTree();
    });

    // Click delete button
    const deleteBtn = item.querySelector('.cwd-dropdown-delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCwdFromHistory(path);
    });

    cwdDropdown.appendChild(item);
  });
}

function initCwdHistory() {
  loadCwdHistory();

  // Load most recent path if exists
  const lastCwd = localStorage.getItem('yxcode_cwd') || '';
  if (lastCwd) {
    cwdInput.value = lastCwd;
  } else if (cwdHistory.length > 0) {
    cwdInput.value = cwdHistory[0];
    localStorage.setItem('yxcode_cwd', cwdHistory[0]);
  }

  // Show dropdown on focus
  cwdInput.addEventListener('focus', () => {
    renderCwdDropdown();
    cwdDropdown.classList.add('show');
  });

  // Hide dropdown on blur (with delay for click)
  cwdInput.addEventListener('blur', () => {
    setTimeout(() => cwdDropdown.classList.remove('show'), 200);
  });

  // Hide dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!cwdInput.contains(e.target) && !cwdDropdown.contains(e.target)) {
      cwdDropdown.classList.remove('show');
    }
  });
}

// ========== Slash Commands & File Mentions ==========
let fileListCache = null;
let fileListCwd = null;
let dropdownItems = [];
let dropdownIndex = -1;

const SLASH_COMMANDS = [
  { cmd: '/clear', label: '/clear', desc: '清空聊天记录', icon: '🗑️', handler: () => { messagesEl.innerHTML=''; currentGroup=null; hideDropdown(); } },
  { cmd: '/new', label: '/new', desc: '新建会话', icon: '✨', handler: () => { newSession(); hideDropdown(); } },
  { cmd: '/rewind', label: '/rewind', desc: '撤销最后一条消息', icon: '⏪', handler: () => { rewindLastMessage(); hideDropdown(); } },
  { cmd: '/help', label: '/help', desc: '显示所有命令', icon: '❓', handler: () => { showHelp(); hideDropdown(); } },
  { cmd: '/model', label: '/model', desc: '显示当前模型信息', icon: '🤖', handler: () => { showModelInfo(); hideDropdown(); } },
  { cmd: '/init', label: '/init', desc: '分析项目并生成 CLAUDE.md', icon: '📋', handler: () => { runInit(); hideDropdown(); } },
  { cmd: '/commit', label: '/commit', desc: 'Git 提交助手', icon: '📝', handler: () => { runCommit(); hideDropdown(); } },
  { cmd: '/girlfriend', label: '/girlfriend', desc: '切换女友模式开关显示', icon: '💕', handler: () => { toggleGirlfriendSwitch(); hideDropdown(); } },
  { cmd: '/btw', label: '/btw <内容>', desc: '快速补充（不中断当前任务）', icon: '💬', handler: () => { appendSystemMsg('用法: /btw <补充内容>\n在任务执行中也可使用'); hideDropdown(); } },
  { cmd: '/compact', label: '/compact', desc: '压缩会话上下文，释放 token 空间', icon: '📦', handler: () => { runCompact(); hideDropdown(); } },
];

function showHelp() {
  const helpText = SLASH_COMMANDS.map(c => `${c.cmd} - ${c.desc}`).join('\n');
  appendSystemMsg('可用命令:\n' + helpText);
}

function showModelInfo() {
  if (!selectedModel) {
    appendSystemMsg('未选择模型');
    return;
  }
  const info = `${selectedModel.label}${selectedModel.provider ? ' (' + selectedModel.provider + ')' : ''}`;
  appendSystemMsg('当前模型: ' + info);
}

// ========== /btw 快速补充 ==========
function handleBtwCommand(question) {
  const apiKey = localStorage.getItem('yxcode_apiKey')||'';
  if(!apiKey) { appendSystemMsg('请先在设置中配置 API Key', 'error'); return; }
  if(!selectedModel) { appendSystemMsg('请先选择模型', 'error'); return; }
  // 自动关闭旧面板，开启新查询
  if(activeBtwId) closeBtwPanel();

  activeBtwId = 'btw-' + Date.now();
  btwStreamBuf = '';
  showBtwPanel(question);

  const baseUrl = localStorage.getItem('yxcode_baseUrl') || '';
  wsSend({ type:'btw-command', btwId:activeBtwId, prompt:question,
    model:selectedModel.value, cwd:cwdInput.value||null, apiKey, baseUrl });
}

function showBtwPanel(question) {
  const panel = document.getElementById('btwPanel');
  document.getElementById('btwQuestion').textContent = question;
  document.getElementById('btwContent').innerHTML = '';
  document.getElementById('btwStatus').textContent = '思考中...';
  panel.classList.remove('hidden');
}

function closeBtwPanel() {
  document.getElementById('btwPanel').classList.add('hidden');
  activeBtwId = null;
  btwStreamBuf = '';
}

function handleBtwResponse(msg) {
  if (msg.btwId !== activeBtwId) return;
  const data = msg.data?.message || msg.data;
  if (!data) return;
  // 流式 delta
  if (data.type === 'content_block_delta' && data.delta?.text) {
    btwStreamBuf += data.delta.text;
    document.getElementById('btwContent').innerHTML = marked.parse(btwStreamBuf);
  }
  // 完整 content 块
  if (Array.isArray(data.content)) {
    for (const p of data.content) {
      if (p.type === 'text' && p.text?.trim()) {
        btwStreamBuf += p.text;
        document.getElementById('btwContent').innerHTML = marked.parse(btwStreamBuf);
      }
    }
  }
  // 滚动到底部
  const el = document.getElementById('btwContent');
  el.scrollTop = el.scrollHeight;
}

function handleBtwComplete(msg) {
  if (msg.btwId !== activeBtwId) return;
  document.getElementById('btwStatus').textContent = '完成';
  // 代码高亮
  document.querySelectorAll('#btwContent pre code').forEach(b => hljs.highlightElement(b));
  // 将 btw 问答注入主聊天流，补充到主会话上下文
  injectBtwToMainChat();
}

function handleBtwError(msg) {
  if (msg.btwId !== activeBtwId) return;
  document.getElementById('btwContent').innerHTML = '<span style="color:var(--red)">错误: ' + escHtml(msg.error) + '</span>';
  document.getElementById('btwStatus').textContent = '出错';
}

// 将 btw 问答插入主聊天流，让主会话上下文能看到
function injectBtwToMainChat() {
  const question = document.getElementById('btwQuestion').textContent;
  const answer = btwStreamBuf;
  if (!question || !answer) return;

  const d = document.createElement('div');
  d.className = 'msg assistant btw-injected';
  d.style.borderColor = 'var(--accent-primary)';
  d.style.opacity = '0.85';
  d.innerHTML = `<div class="role" style="color:var(--accent-primary)">💬 /btw 插队提问</div>`
    + `<div class="content"><div style="color:var(--text-secondary);margin-bottom:8px;font-size:13px"><strong>问：</strong>${escHtml(question)}</div>`
    + `<div>${marked.parse(answer)}</div></div>`;
  messagesEl.appendChild(d);
  scrollBottom();
  // 代码高亮
  d.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
}

function toggleGirlfriendSwitch() {
  const switchWrapper = document.querySelector('.switch-wrapper');
  if (!switchWrapper) return;
  const isHidden = switchWrapper.style.display === 'none';
  switchWrapper.style.display = isHidden ? '' : 'none';
  localStorage.setItem('yxcode_girlfriendSwitchHidden', isHidden ? 'false' : 'true');
  appendSystemMsg(isHidden ? '已显示女友模式开关' : '已隐藏女友模式开关');
}

function runInit() {
  const apiKey = localStorage.getItem('yxcode_apiKey') || '';
  if (!apiKey) { appendSystemMsg('请先在设置中配置 API Key', 'error'); return; }
  if (!selectedModel) { appendSystemMsg('请先选择模型', 'error'); return; }
  if (!cwdInput.value.trim()) { appendSystemMsg('请先设置工作目录', 'error'); cwdInput.focus(); return; }
  if (isStreaming) { appendSystemMsg('请等待当前任务完成', 'error'); return; }

  fetch('/prompt/INIT_PROJECT.md').then(res => res.text()).then(initPrompt => {
    appendUserMsg('/init');
    promptInput.value = '';
    const baseUrl = localStorage.getItem('yxcode_baseUrl') || '';
    wsSend({ type: 'claude-command', prompt: initPrompt, sessionId, cwd: cwdInput.value || null,
      model: selectedModel.value, permissionMode: permSelect.value, apiKey, baseUrl });
    setStreaming(true);
  }).catch(e => appendSystemMsg('加载提示词失败: ' + e.message, 'error'));
}

async function runCommit() {
  const apiKey = localStorage.getItem('yxcode_apiKey') || '';
  if (!apiKey) { appendSystemMsg('请先在设置中配置 API Key', 'error'); return; }
  if (!selectedModel) { appendSystemMsg('请先选择模型', 'error'); return; }
  if (!cwdInput.value.trim()) { appendSystemMsg('请先设置工作目录', 'error'); cwdInput.focus(); return; }
  if (isStreaming) { appendSystemMsg('请等待当前任务完成', 'error'); return; }

  try {
    const res = await fetch(`/api/git/status?cwd=${encodeURIComponent(cwdInput.value)}`);
    const data = await res.json();
    if (!res.ok) { appendSystemMsg('获取 git 状态失败: ' + data.error, 'error'); return; }

    const promptRes = await fetch('/prompt/GIT_COMMIT.md');
    const promptText = await promptRes.text();
    const commitPrompt = `${promptText}\n\n当前 git 状态和变更:\n\`\`\`\n${data.output}\n\`\`\`\n\n请分析以上变更，生成符合规范的 commit 信息。只输出 commit 信息内容，不要有其他说明文字。`;

    appendUserMsg('/commit');
    promptInput.value = '';
    const baseUrl = localStorage.getItem('yxcode_baseUrl') || '';
    wsSend({ type: 'claude-command', prompt: commitPrompt, sessionId, cwd: cwdInput.value,
      model: selectedModel.value, permissionMode: permSelect.value, apiKey, baseUrl });
    setStreaming(true);
  } catch(e) {
    appendSystemMsg('执行失败: ' + e.message, 'error');
  }
}

function runCompact() {
  if (!sessionId) { appendSystemMsg('当前没有活跃会话，无需压缩', 'error'); return; }
  const apiKey = localStorage.getItem('yxcode_apiKey') || '';
  if (!apiKey) { appendSystemMsg('请先在设置中配置 API Key', 'error'); return; }
  if (!selectedModel) { appendSystemMsg('请先选择模型', 'error'); return; }
  if (!cwdInput.value.trim()) { appendSystemMsg('请先设置工作目录', 'error'); cwdInput.focus(); return; }
  if (isStreaming) { appendSystemMsg('请等待当前任务完成', 'error'); return; }

  appendUserMsg('/compact');
  promptInput.value = '';
  appendSystemMsg('正在压缩会话上下文…');
  const baseUrl = localStorage.getItem('yxcode_baseUrl') || '';
  wsSend({ type: 'claude-command', prompt: '/compact', sessionId, cwd: cwdInput.value || null,
    model: selectedModel.value, permissionMode: permSelect.value, apiKey, baseUrl });
  setStreaming(true);
}

function rewindLastMessage() {
  // Get all message elements (including tool cards, ask panels, etc.)
  const allElements = messagesEl.children;
  if (allElements.length === 0) {
    appendSystemMsg('没有消息可以撤销', 'error');
    return;
  }

  // Find last user message
  let lastUserIndex = -1;
  for (let i = allElements.length - 1; i >= 0; i--) {
    const el = allElements[i];
    if (el.classList.contains('msg') && el.classList.contains('user')) {
      lastUserIndex = i;
      break;
    }
  }

  if (lastUserIndex === -1) {
    appendSystemMsg('没有用户消息可以撤销', 'error');
    return;
  }

  // Get user message content
  const userMsg = allElements[lastUserIndex];
  const content = userMsg.querySelector('.content')?.textContent || '';

  // Remove all elements from last user message onwards (including tool cards, ask panels, loading indicators, etc.)
  const elementsToRemove = [];
  for (let i = lastUserIndex; i < allElements.length; i++) {
    elementsToRemove.push(allElements[i]);
  }
  elementsToRemove.forEach(el => el.remove());
  currentGroup = null; // 清理可能被移除的分组引用

  // Restore content to input
  promptInput.value = content;
  promptInput.focus();
  appendSystemMsg('已回退到上次输入');
}

function showDropdown(items) {
  dropdownItems = items;
  dropdownIndex = items.length > 0 ? 0 : -1;
  cmdDropdown.innerHTML = '';
  items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'cmd-dropdown-item' + (i === 0 ? ' active' : '');
    el.innerHTML = `<span class="cmd-icon">${item.icon || '·'}</span><span class="cmd-label">${escHtml(item.label)}</span><span class="cmd-desc">${escHtml(item.desc || '')}</span>`;
    el.addEventListener('click', () => selectDropdownItem(i));
    cmdDropdown.appendChild(el);
  });
  cmdDropdown.classList.add('visible');
}

function hideDropdown() {
  cmdDropdown.classList.remove('visible');
  cmdDropdown.innerHTML = '';
  dropdownItems = [];
  dropdownIndex = -1;
}

function setDropdownIndex(i) {
  if (i < 0 || i >= dropdownItems.length) return;
  dropdownIndex = i;
  const items = cmdDropdown.querySelectorAll('.cmd-dropdown-item');
  items.forEach((el, idx) => el.classList.toggle('active', idx === i));
  items[i]?.scrollIntoView({ block: 'nearest' });
}

function selectDropdownItem(i) {
  if (i < 0 || i >= dropdownItems.length) return;
  const item = dropdownItems[i];
  if (item.onSelect) item.onSelect();
  hideDropdown();
}

function checkSlashCommand() {
  const val = promptInput.value;
  if (!val.startsWith('/')) { hideDropdown(); return; }
  const query = val.slice(1).toLowerCase();
  const matches = SLASH_COMMANDS.filter(c => c.cmd.slice(1).startsWith(query));
  if (matches.length) {
    showDropdown(matches.map(c => ({
      label: c.label,
      desc: c.desc,
      icon: c.icon,
      onSelect: () => { promptInput.value = ''; c.handler(); }
    })));
  } else {
    hideDropdown();
  }
}

async function loadFileListFlat() {
  const cwd = cwdInput.value || '';
  if (!cwd) return [];
  if (fileListCache && fileListCwd === cwd) return fileListCache;
  try {
    const res = await fetch('/api/files-flat?cwd=' + encodeURIComponent(cwd));
    const data = await res.json();
    fileListCache = data;
    fileListCwd = cwd;
    return data;
  } catch (e) {
    console.error('[loadFileListFlat]', e);
    return [];
  }
}

function getMentionContext() {
  const val = promptInput.value;
  const pos = promptInput.selectionStart;
  const before = val.slice(0, pos);
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return null;
  const afterAt = before.slice(atIdx + 1);
  if (/\s/.test(afterAt)) return null; // space closes mention
  return { start: atIdx, query: afterAt };
}

async function checkFileMention() {
  const ctx = getMentionContext();
  if (!ctx) { hideDropdown(); return; }
  const files = await loadFileListFlat();
  const query = ctx.query.toLowerCase();
  const filtered = files.filter(f => f.path.toLowerCase().includes(query));
  // 优先显示文件名匹配的结果（而非仅路径中间匹配）
  filtered.sort((a, b) => {
    const aName = a.path.split('/').pop().toLowerCase();
    const bName = b.path.split('/').pop().toLowerCase();
    const aNameMatch = aName.includes(query);
    const bNameMatch = bName.includes(query);
    if (aNameMatch && !bNameMatch) return -1;
    if (!aNameMatch && bNameMatch) return 1;
    // 文件名以 query 开头的更优先
    const aStarts = aName.startsWith(query);
    const bStarts = bName.startsWith(query);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.path.length - b.path.length; // 短路径优先
  });
  const matches = filtered.slice(0, 50);
  if (matches.length) {
    showDropdown(matches.map(f => ({
      label: f.path,
      desc: f.type === 'dir' ? '目录' : '文件',
      icon: f.type === 'dir' ? '📁' : '📄',
      onSelect: () => {
        const val = promptInput.value;
        const pos = promptInput.selectionStart;
        const newVal = val.slice(0, ctx.start) + '@' + f.path + ' ' + val.slice(pos);
        promptInput.value = newVal;
        promptInput.selectionStart = promptInput.selectionEnd = ctx.start + f.path.length + 2;
        promptInput.focus();
      }
    })));
  } else {
    hideDropdown();
  }
}

function isDropdownVisible() {
  return cmdDropdown.classList.contains('visible');
}

// ========== Model Select ==========
function selectModel(model) {
  selectedModel = model;
  const icon = modelSelectDisplay.querySelector('.model-icon');
  const label = modelSelectDisplay.querySelector('.model-label');
  if (model.icon) {
    icon.src = model.icon;
    icon.style.display = 'block';
  } else {
    icon.style.display = 'none';
  }
  label.textContent = model.label;
  modelSelectDropdown.classList.remove('visible');
  localStorage.setItem('yxcode_model', model.value);
}

function selectSettingsModel(model) {
  selectedSettingsModel = model;
  setModelSearch.value = model.label;
  setModelSearch._selectedLabel = model.label; // 记住选中时的文本
  setModelDropdown.classList.remove('visible');
}

// 加载自定义模型
function loadCustomModels() {
  try {
    const saved = localStorage.getItem('yxcode_customModels');
    if (saved) customModels = JSON.parse(saved);
  } catch(e) { customModels = []; }
}

function saveCustomModels() {
  localStorage.setItem('yxcode_customModels', JSON.stringify(customModels));
}

function addCustomModel(modelId) {
  modelId = modelId.trim();
  if (!modelId) return null;
  // 检查是否已存在于意心AI模型或自定义模型中
  const allModels = getAllModels();
  const existing = allModels.find(m => m.value === modelId);
  if (existing) return existing;
  const newModel = { value: modelId, label: modelId, description: '', icon: '', provider: '自定义', isCustom: true };
  customModels.push(newModel);
  saveCustomModels();
  return newModel;
}

function removeCustomModel(modelId) {
  customModels = customModels.filter(m => m.value !== modelId);
  saveCustomModels();
  renderSettingsModelDropdown();
}

function getAllModels() {
  return [...modelsData.map(m => ({...m, isCustom: false})), ...customModels];
}

function renderSettingsModelDropdown(filter = '') {
  setModelDropdown.innerHTML = '';
  const allModels = getAllModels();
  const lowerFilter = filter.toLowerCase();
  const filtered = lowerFilter ? allModels.filter(m =>
    m.value.toLowerCase().includes(lowerFilter) ||
    m.label.toLowerCase().includes(lowerFilter) ||
    (m.provider && m.provider.toLowerCase().includes(lowerFilter))
  ) : allModels;

  if (filtered.length === 0 && filter) {
    const hint = document.createElement('div');
    hint.className = 'model-search-hint';
    hint.textContent = `按回车添加自定义模型「${filter}」`;
    setModelDropdown.appendChild(hint);
  }

  filtered.forEach(m => {
    const opt = document.createElement('div');
    opt.className = 'model-select-option';
    opt.dataset.value = m.value;
    const iconHTML = m.icon ? `<img class="model-icon" src="${m.icon}" alt="">` : '<div class="model-icon-placeholder"></div>';
    const badge = m.isCustom
      ? '<span class="model-badge model-badge-custom">自定义</span>'
      : '<span class="model-badge model-badge-yxai">意心AI</span>';
    const deleteBtn = m.isCustom
      ? '<button class="model-delete-btn" title="删除自定义模型">✕</button>'
      : '';
    opt.innerHTML = `${iconHTML}<span class="model-label">${escHtml(m.label)}</span>${badge}${m.provider && !m.isCustom ? `<span class="model-provider">${escHtml(m.provider)}</span>` : ''}${deleteBtn}`;
    opt.addEventListener('click', (e) => {
      if (e.target.classList.contains('model-delete-btn')) {
        e.stopPropagation();
        removeCustomModel(m.value);
        // 如果删除的是当前选中的模型，清空选择
        if (selectedSettingsModel && selectedSettingsModel.value === m.value) {
          selectedSettingsModel = null;
          setModelSearch.value = '';
        }
        return;
      }
      selectSettingsModel(m);
    });
    setModelDropdown.appendChild(opt);
  });
}

modelSelectDisplay.addEventListener('click', (e) => {
  e.stopPropagation();
  modelSelectDropdown.classList.toggle('visible');
});

// 设置页面模型搜索输入框事件
setModelSearch.addEventListener('focus', () => {
  // focus 时始终显示全部列表（用户还没输入新内容）
  renderSettingsModelDropdown('');
  setModelDropdown.classList.add('visible');
});

setModelSearch.addEventListener('input', () => {
  const val = setModelSearch.value;
  // 如果内容和选中时一致，说明用户没有修改，显示全部
  const filter = (val === setModelSearch._selectedLabel) ? '' : val;
  renderSettingsModelDropdown(filter);
  setModelDropdown.classList.add('visible');
});

setModelSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = setModelSearch.value.trim();
    if (!val) return;
    // 先在已有模型中查找
    const allModels = getAllModels();
    let found = allModels.find(m => m.value === val || m.label === val);
    if (!found) {
      // 添加为自定义模型
      found = addCustomModel(val);
    }
    if (found) {
      selectSettingsModel(found);
      renderSettingsModelDropdown();
    }
  }
});

// 高级设置折叠
advancedToggle.addEventListener('click', () => {
  const isHidden = advancedContent.classList.contains('hidden');
  advancedContent.classList.toggle('hidden');
  advancedToggle.querySelector('.advanced-arrow').textContent = isHidden ? '▼' : '▶';
});

document.addEventListener('click', (e) => {
  if (!modelSelectDisplay.contains(e.target) && !modelSelectDropdown.contains(e.target)) {
    modelSelectDropdown.classList.remove('visible');
  }
  const searchWrapper = setModelSearch.closest('.model-search-wrapper');
  if (searchWrapper && !searchWrapper.contains(e.target)) {
    setModelDropdown.classList.remove('visible');
  }
});

// --- Tool category map ---
const TOOL_CAT = {
  Bash:'bash', Read:'search', Grep:'search', Glob:'search',
  Edit:'edit', Write:'edit', ApplyPatch:'edit',
  TodoWrite:'todo', TodoRead:'todo',
  TaskCreate:'task', TaskUpdate:'task', TaskList:'task', TaskGet:'task',
  AskUserQuestion:'question', Task:'agent',
};
const TOOL_ICON = {
  bash:'$_', edit:'✎', search:'🔍', todo:'☑', task:'📋', question:'❓', agent:'🤖', default:'⚙',
};

// --- Init ---
(async () => {
  // Fetch version from server
  try {
    const ver = await (await fetch('/api/version')).json();
    document.getElementById('appVersion').textContent = 'v' + ver.version;
  } catch(e) { console.error('[version]', e); }

  try {
    // 始终从 yxai.chat 加载模型列表，切换自定义 URL 时不隐藏
    let models = [];
    try {
      models = await (await fetch('/api/models')).json();
    } catch(e) { console.error('[loadModels from yxai.chat]', e); }
    modelsData = models;

    // Render main model dropdown (includes custom models)
    loadCustomModels();
    modelSelectDropdown.innerHTML = '';
    const allMainModels = [...models.map(m => ({...m, isCustom: false})), ...customModels];
    allMainModels.forEach(m => {
      const opt = document.createElement('div');
      opt.className = 'model-select-option';
      opt.dataset.value = m.value;
      const iconHTML = m.icon ? `<img class="model-icon" src="${m.icon}" alt="">` : '<div class="model-icon-placeholder"></div>';
      opt.innerHTML = `${iconHTML}<span class="model-label">${escHtml(m.label)}</span>${m.provider ? `<span class="model-provider">${escHtml(m.provider)}</span>` : ''}`;
      opt.addEventListener('click', () => selectModel(m));
      modelSelectDropdown.appendChild(opt);
    });

    // Render settings model dropdown with search
    renderSettingsModelDropdown();

    // Store models data for header display
    window._yxModels = models;

    // Restore saved model
    const savedModelId = localStorage.getItem('yxcode_model');
    if (savedModelId) {
      const allModels = getAllModels();
      const savedModel = allModels.find(m => m.value === savedModelId);
      if (savedModel) {
        selectModel(savedModel);
        selectSettingsModel(savedModel);
      }
    } else if (models.length > 0) {
      selectModel(models[0]);
      selectSettingsModel(models[0]);
    }
  } catch(e) { console.error('[loadModels]', e); }
  cwdInput.value = localStorage.getItem('yxcode_cwd') || '';
  setApiKey.value = localStorage.getItem('yxcode_apiKey') || '';
  setBaseUrl.value = localStorage.getItem('yxcode_baseUrl') || '';
  girlfriendMode.checked = localStorage.getItem('yxcode_girlfriendMode') === 'true';
  if (localStorage.getItem('yxcode_girlfriendSwitchHidden') === 'true') {
    const switchWrapper = document.querySelector('.switch-wrapper');
    if (switchWrapper) switchWrapper.style.display = 'none';
  }

  // Load remembered permissions
  try {
    const saved = localStorage.getItem('yxcode_rememberedPermissions');
    if (saved) rememberedPermissions = new Set(JSON.parse(saved));
  } catch(e) { console.error('[load permissions]', e); }

  // Initialize CWD history
  initCwdHistory();

  cwdInput.addEventListener('change', () => {
    const path = cwdInput.value.trim();
    if (path) {
      saveCwdToHistory(path);
      localStorage.setItem('yxcode_cwd', path);
    }
  });
  girlfriendMode.addEventListener('change', () => {
    localStorage.setItem('yxcode_girlfriendMode', girlfriendMode.checked);
  });
  settingsBtn.addEventListener('click', () => { settingsOverlay.classList.remove('hidden'); renderPermissionList(); });
  settingsCloseBtn.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
  // 点击背景不再关闭弹窗，只能通过关闭按钮关闭
  settingsSaveBtn.addEventListener('click', saveSettings);
  clearPermissionsBtn.addEventListener('click', clearRememberedPermissions);

  // Copy API Key button
  document.getElementById('copyApiKeyBtn').addEventListener('click', () => {
    const key = setApiKey.value;
    if (!key) return;
    navigator.clipboard.writeText(key).then(() => {
      const btn = document.getElementById('copyApiKeyBtn');
      btn.textContent = '✅';
      setTimeout(() => { btn.textContent = '📋'; }, 1500);
    });
  });

  // Test Base URL connection
  testBaseUrlBtn.addEventListener('click', async () => {
    const baseUrl = setBaseUrl.value.trim();
    const apiKey = setApiKey.value.trim();
    const model = selectedSettingsModel?.value || selectedModel?.value || 'sonnet';

    testResult.className = 'test-result loading';
    testResult.textContent = '正在测试连接...';
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey, model })
      });
      const data = await res.json();
      if (data.success) {
        testResult.className = 'test-result success';
        testResult.textContent = `✓ ${data.message}`;
      } else {
        testResult.className = 'test-result error';
        testResult.textContent = `✗ 连接失败：${data.message || '未知错误'}`;
      }
    } catch (e) {
      testResult.className = 'test-result error';
      testResult.textContent = `✗ 连接失败：${e.message}`;
    }
  });

  // Update permission count when opening settings
  settingsBtn.addEventListener('click', updatePermissionCount);
  // If no API key configured, auto-open settings
  if (!localStorage.getItem('yxcode_apiKey')) settingsOverlay.classList.remove('hidden');
  connectWS();
  // Load file tree on init if cwd is set
  if (cwdInput.value) loadFileTree();
})();

function saveSettings() {
  localStorage.setItem('yxcode_apiKey', setApiKey.value.trim());
  localStorage.setItem('yxcode_baseUrl', setBaseUrl.value.trim());
  if (selectedSettingsModel) {
    localStorage.setItem('yxcode_model', selectedSettingsModel.value);
    // Update main model select and header dropdown (include custom models)
    selectModel(selectedSettingsModel);
    // Re-render main model dropdown to include any new custom models
    modelSelectDropdown.innerHTML = '';
    const allMainModels = [...modelsData.map(m => ({...m, isCustom: false})), ...customModels];
    allMainModels.forEach(m => {
      const opt = document.createElement('div');
      opt.className = 'model-select-option';
      opt.dataset.value = m.value;
      const iconHTML = m.icon ? `<img class="model-icon" src="${m.icon}" alt="">` : '<div class="model-icon-placeholder"></div>';
      opt.innerHTML = `${iconHTML}<span class="model-label">${escHtml(m.label)}</span>${m.provider ? `<span class="model-provider">${escHtml(m.provider)}</span>` : ''}`;
      opt.addEventListener('click', () => selectModel(m));
      modelSelectDropdown.appendChild(opt);
    });
  }
  // 同步设置到 ~/.claude/settings.json
  const syncPayload = {};
  if (setApiKey.value.trim()) syncPayload.apiKey = setApiKey.value.trim();
  syncPayload.baseUrl = setBaseUrl.value.trim() || 'https://yxai.chat';
  if (selectedSettingsModel) syncPayload.model = selectedSettingsModel.value;
  if (Object.keys(syncPayload).length > 0) {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syncPayload),
    }).catch(err => console.warn('[settings sync]', err));
  }
  settingsSaved.classList.add('show');
  setTimeout(() => settingsSaved.classList.remove('show'), 2000);
}

function clearRememberedPermissions() {
  if (rememberedPermissions.size === 0) {
    appendSystemMsg('没有已记住的权限规则');
    return;
  }
  const count = rememberedPermissions.size;
  rememberedPermissions.clear();
  localStorage.removeItem('yxcode_rememberedPermissions');
  updatePermissionCount();
  renderPermissionList();
  appendSystemMsg(`已清除 ${count} 条权限规则`);
}

function removePermissionRule(rule) {
  rememberedPermissions.delete(rule);
  if (rememberedPermissions.size > 0) {
    localStorage.setItem('yxcode_rememberedPermissions', JSON.stringify([...rememberedPermissions]));
  } else {
    localStorage.removeItem('yxcode_rememberedPermissions');
  }
  updatePermissionCount();
  renderPermissionList();
  appendSystemMsg(`已删除权限规则：${rule}`);
}

function renderPermissionList() {
  const list = document.getElementById('permissionList');
  if (!list) return;
  if (rememberedPermissions.size === 0) {
    list.innerHTML = '<div class="permission-empty">暂无已记住的权限规则</div>';
    return;
  }
  list.innerHTML = '';
  for (const rule of rememberedPermissions) {
    const item = document.createElement('div');
    item.className = 'permission-item';
    const label = document.createElement('span');
    label.className = 'permission-rule';
    label.textContent = rule;
    const delBtn = document.createElement('button');
    delBtn.className = 'permission-delete-btn';
    delBtn.title = '删除此权限';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => removePermissionRule(rule));
    item.appendChild(label);
    item.appendChild(delBtn);
    list.appendChild(item);
  }
}

function updatePermissionCount() {
  permissionCount.textContent = `已记住 ${rememberedPermissions.size} 条权限规则`;
}

// --- WebSocket ---
function connectWS() {
  const proto = location.protocol==='https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = () => { connStatus.className='status-dot online'; connStatus.title='已连接'; };
  ws.onclose = () => { connStatus.className='status-dot offline'; connStatus.title='未连接'; setTimeout(connectWS,3000); };
  ws.onerror = () => {};
  ws.onmessage = e => { try { handleMsg(JSON.parse(e.data)); } catch(err) { console.error('[ws parse]', err); } };
}
function wsSend(d) { if(ws&&ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(d)); }

// --- Message dispatch ---
function handleMsg(msg) {
  switch(msg.type) {
    case 'session-created': sessionId=msg.sessionId; sessionInfo.textContent='会话: '+sessionId.slice(0,8)+'...'; updatePageTitle(); break;
    case 'claude-response': handleClaudeResponse(msg.data); break;
    case 'claude-complete': finishStreaming(); closeGroup(); setStreaming(false); loadProjects().then(() => updatePageTitle(getSessionSummary(sessionId))); break;
    case 'claude-error': finishStreaming(); closeGroup(); setStreaming(false); appendSystemMsg('错误: '+msg.error,'error'); break;
    case 'session-aborted': finishStreaming(); closeGroup(); setStreaming(false); appendSystemMsg('会话已停止'); break;
    case 'permission-request': showPermission(msg); break;
    case 'permission-cancelled': permBanner.classList.add('hidden'); break;
    case 'plan-execution-request': showPlanExecutionConfirm(msg); break;
    case 'plan-mode-updated': planModeEnabled = msg.enabled; break;
    // /btw 快速补充
    case 'btw-response': handleBtwResponse(msg); break;
    case 'btw-complete': handleBtwComplete(msg); break;
    case 'btw-error': handleBtwError(msg); break;
    case 'btw-injecting': appendSystemMsg(`💬 /btw 补充信息（${msg.count}条）已注入当前会话，AI 正在处理...`); break;
  }
}

// --- Claude response processing ---
function handleClaudeResponse(raw) {
  if(!raw) return;
  const data = raw.message || raw;
  console.log('[msg]', data.type, data.subtype||'', data.role||'');

  if(data.type==='system' && data.subtype==='init') return;

  // 压缩完成消息
  if(data.type==='system' && data.subtype==='compact_boundary') {
    finishStreaming();
    closeGroup();
    const meta = data.compact_metadata || {};
    const preTokens = meta.pre_tokens ? meta.pre_tokens.toLocaleString() : '未知';
    const trigger = meta.trigger === 'manual' ? '手动触发' : (meta.trigger || '未知');
    appendSystemMsg(`✅ 会话上下文已压缩\n压缩前 token 数: ${preTokens}\n触发方式: ${trigger}`);
    return;
  }

  // Streaming text
  if(data.type==='content_block_delta') {
    const t = data.delta?.text ?? data.delta?.text_delta ?? '';
    if(t) { feedStream(t); }
    return;
  }
  if(data.type==='content_block_stop') { finishStreaming(); return; }

  // Structured content array
  if(Array.isArray(data.content)) {
    if(data.role==='user') {
      for(const p of data.content) {
        if(p.type==='tool_result') {
          const txt = typeof p.content==='string' ? p.content
            : Array.isArray(p.content) ? p.content.map(c=>c.text||'').join('') : JSON.stringify(p.content);
          appendToolResult({ tool_use_id:p.tool_use_id, content:txt, is_error:p.is_error });
        }
      }
      return;
    }
    for(const p of data.content) {
      if(p.type==='text' && p.text?.trim()) { feedStream(p.text); }
      if(p.type==='tool_use') { finishStreaming(); handleToolUse(p); }
    }
    return;
  }

  // Plain string
  if(typeof data.content==='string' && data.content.trim()) {
    feedStream(data.content); return;
  }

  // Result
  if(data.type==='result') {
    finishStreaming();
    closeGroup();
    if(data.subtype==='error_max_turns') appendSystemMsg('已达到最大轮次');
  }
}

// --- Tool use handler (routes to special renderers) ---
function handleToolUse(part) {
  // Don't hide loading - keep it visible while tool executes
  const name = part.name || 'Tool';
  if(name==='AskUserQuestion') { renderAskUserQuestion(part); return; }
  if(name==='TodoWrite' || name==='TodoRead') { renderTodoTool(part); return; }
  if(name==='TaskList' || name==='TaskGet') { renderTaskTool(part); return; }
  appendToolCard(part);
}

// ========== AskUserQuestion ==========
function renderAskUserQuestion(part) {
  const input = part.input || {};
  const questions = input.questions || [];
  const panel = document.createElement('div');
  panel.className = 'ask-panel';
  panel.dataset.toolId = part.id || '';
  panel.dataset.toolName = 'AskUserQuestion';

  // State for multi-step
  let step = 0;
  const answers = {};

  function renderStep() {
    const q = questions[step];
    if(!q) return;
    const multi = q.multiSelect || false;
    const selected = new Set();
    let otherText = '';

    panel.innerHTML = '';
    if(q.header) { const h = document.createElement('div'); h.className='ask-header'; h.textContent=q.header; panel.appendChild(h); }
    const qEl = document.createElement('div'); qEl.className='ask-q';
    qEl.textContent = `${questions.length>1 ? `(${step+1}/${questions.length}) ` : ''}${q.question}`;
    panel.appendChild(qEl);

    const optsEl = document.createElement('div'); optsEl.className='ask-opts';
    (q.options||[]).forEach((opt, i) => {
      const el = document.createElement('div');
      el.className = 'ask-opt' + (multi ? ' multi' : '');
      el.innerHTML = `<div class="opt-radio"></div><div><div class="opt-label">${escHtml(opt.label)}</div>${opt.description ? `<div class="opt-desc">${escHtml(opt.description)}</div>` : ''}</div>`;
      el.addEventListener('click', () => {
        if(multi) { selected.has(i) ? selected.delete(i) : selected.add(i); }
        else { selected.clear(); selected.add(i); }
        optsEl.querySelectorAll('.ask-opt').forEach((o,j) => o.classList.toggle('selected', selected.has(j)));
      });
      optsEl.appendChild(el);
    });
    panel.appendChild(optsEl);

    // "Other" free text
    const otherDiv = document.createElement('div'); otherDiv.className='ask-other';
    otherDiv.innerHTML = `<input type="text" placeholder="其他 (自定义回复)..." />`;
    otherDiv.querySelector('input').addEventListener('input', e => { otherText = e.target.value; });
    panel.appendChild(otherDiv);

    // Buttons
    const btns = document.createElement('div'); btns.className='ask-btns';
    if(step > 0) {
      const backBtn = document.createElement('button'); backBtn.className='btn-secondary'; backBtn.textContent='上一步';
      backBtn.addEventListener('click', () => { step--; renderStep(); });
      btns.appendChild(backBtn);
    }
    const nextLabel = step < questions.length-1 ? '下一步' : '提交';
    const nextBtn = document.createElement('button'); nextBtn.className='btn-primary'; nextBtn.textContent=nextLabel;
    nextBtn.addEventListener('click', () => {
      // Collect answer
      const opts = q.options||[];
      const vals = [...selected].map(i => opts[i].label);
      if(otherText.trim()) vals.push(otherText.trim());
      answers[q.question] = vals.join(', ');
      if(step < questions.length-1) { step++; renderStep(); }
      else { submitAsk(); }
    });
    btns.appendChild(nextBtn);
    const skipBtn = document.createElement('button'); skipBtn.className='btn-secondary'; skipBtn.textContent='跳过';
    skipBtn.addEventListener('click', () => { submitAsk(true); });
    btns.appendChild(skipBtn);
    panel.appendChild(btns);
  }

  function submitAsk(skip) {
    const decision = { allow:true, updatedInput: { ...input, answers: skip ? {} : answers } };
    wsSend({ type:'permission-response', requestId: panel._requestId, ...decision });
    // Replace with answered display
    panel.innerHTML = '';
    panel.className = 'ask-answered';
    if(skip) { panel.innerHTML = '<div class="ans-q" style="color:var(--text-secondary)">已跳过</div>'; }
    else {
      for(const [q, a] of Object.entries(answers)) {
        const row = document.createElement('div');
        row.innerHTML = `<div class="ans-q">${escHtml(q)}</div><div class="ans-v">${escHtml(a)}</div>`;
        panel.appendChild(row);
      }
    }
    scrollBottom();
  }

  renderStep();
  getGroupBody().appendChild(panel);
  scrollBottom();
}

// ========== TodoWrite / TodoRead ==========
function renderTodoTool(part) {
  const card = createToolCard(part);
  const body = card.querySelector('.tool-body');
  const items = parseTodoItems(part.input);
  if(items.length) {
    body.innerHTML = '';
    const list = document.createElement('div'); list.className='todo-list';
    items.forEach(t => {
      const row = document.createElement('div'); row.className='todo-item';
      const icon = t.status==='completed' ? '✅' : t.status==='in_progress' ? '🔄' : '⭕';
      const iconCls = t.status==='completed' ? 'done' : t.status==='in_progress' ? 'progress' : 'pending';
      row.innerHTML = `<span class="todo-icon ${iconCls}">${icon}</span><span class="todo-text">${escHtml(t.subject||t.content||'')}</span>`;
      if(t.priority) row.innerHTML += `<span class="todo-priority ${t.priority}">${t.priority}</span>`;
      list.appendChild(row);
    });
    body.appendChild(list);
  }
  card.classList.add('open');
  getGroupBody().appendChild(card);
  scrollBottom();
}

function parseTodoItems(input) {
  if(!input) return [];
  // TodoWrite: input.todos array
  if(Array.isArray(input.todos)) return input.todos;
  if(Array.isArray(input.items)) return input.items;
  // TodoRead result: try JSON parse
  if(typeof input === 'string') { try { const d=JSON.parse(input); if(Array.isArray(d)) return d; } catch{} }
  return [];
}

// ========== TaskList / TaskGet ==========
function renderTaskTool(part) {
  const card = createToolCard(part);
  card.classList.add('open');
  getGroupBody().appendChild(card);
  scrollBottom();
}

function renderTaskResult(card, content) {
  const body = card.querySelector('.tool-body') || card;
  const items = parseTaskItems(content);
  if(!items.length) return;
  const wrap = document.createElement('div'); wrap.className='task-list';
  const done = items.filter(t=>t.status==='completed').length;
  wrap.innerHTML = `<div class="task-progress"><div class="task-progress-bar" style="width:${items.length?Math.round(done/items.length*100):0}%"></div></div>`;
  items.forEach(t => {
    const row = document.createElement('div'); row.className='task-item';
    const icon = t.status==='completed' ? '✅' : t.status==='in_progress' ? '🔄' : '⭕';
    row.innerHTML = `<span>${icon}</span><span style="flex:1">${escHtml(t.subject||t.text||'')}</span><span class="task-status ${t.status||'pending'}">${t.status||'pending'}</span>`;
    wrap.appendChild(row);
  });
  body.innerHTML = '';
  body.appendChild(wrap);
}

function parseTaskItems(content) {
  if(!content) return [];
  // Try JSON
  try { const d=JSON.parse(content); if(Array.isArray(d)) return d; if(d.tasks) return d.tasks; } catch{}
  // Try regex: #1. [completed] subject
  const items = [];
  const re = /#(\d+)\.?\s*(?:\[(\w+)\]\s*)?(.+)/g;
  let m;
  while((m=re.exec(content))) items.push({ id:m[1], status:m[2]||'pending', subject:m[3].trim() });
  if(items.length) return items;
  // Fallback: line-based
  content.split('\n').filter(l=>l.trim()).forEach(l => items.push({ subject:l.trim(), status:'pending' }));
  return items;
}

// ========== Generic tool card ==========
function createToolCard(part) {
  const name = part.name || 'Tool';
  const cat = TOOL_CAT[name] || 'default';
  const icon = TOOL_ICON[cat] || TOOL_ICON.default;
  const card = document.createElement('div');
  card.className = 'tool-card';
  card.dataset.toolId = part.id || '';
  card.dataset.toolName = name;
  card.dataset.cat = cat;

  const summary = getToolSummary(name, part.input);

  // Special rendering for Edit tool with diff view
  const formattedInput = formatToolInput(name, part.input);
  let bodyHTML;
  if (formattedInput === '__DIFF_VIEW__' && name === 'Edit') {
    bodyHTML = renderDiffView(part.input);
  } else {
    bodyHTML = `<pre>${escHtml(formattedInput)}</pre>`;
  }

  card.innerHTML = `
    <div class="tool-header" onclick="this.parentElement.classList.toggle('open')">
      <span class="tool-icon">${icon}</span>
      <span class="tool-name">${escHtml(name)}</span>
      <span class="tool-summary">${escHtml(summary)}</span>
      <span class="chevron">▼</span>
    </div>
    <div class="tool-body">${bodyHTML}</div>`;
  return card;
}

function appendToolCard(part) {
  const card = createToolCard(part);
  const body = getGroupBody();
  body.appendChild(card);
  scrollBottom();
}

function getToolSummary(name, input) {
  if(!input) return '';
  if(name==='Bash') return input.command ? input.command.slice(0,60) : '';
  if(name==='Read') return input.file_path ? input.file_path.split(/[/\\]/).pop() : '';
  if(name==='Edit'||name==='Write') return input.file_path ? input.file_path.split(/[/\\]/).pop() : '';
  if(name==='Grep') return input.pattern || '';
  if(name==='Glob') return input.pattern || '';
  if(name==='TaskCreate') return input.subject || '';
  if(name==='TaskUpdate') return `#${input.taskId||'?'} → ${input.status||''}`;
  if(name==='TaskList') return '列出任务';
  if(name==='TaskGet') return `#${input.taskId||'?'}`;
  return '';
}

function formatToolInput(name, input) {
  if(!input) return '';
  if(typeof input==='string') return input;
  if(name==='Bash') return input.command || JSON.stringify(input,null,2);
  if(name==='Edit') return '__DIFF_VIEW__';
  if(name==='Write') return `文件: ${input.file_path||''}\n${input.content||''}`;
  return JSON.stringify(input, null, 2);
}

function renderDiffView(input) {
  if (!input || !input.old_string || !input.new_string) {
    return `<pre>${escHtml(JSON.stringify(input, null, 2))}</pre>`;
  }

  const filePath = input.file_path || '(unknown file)';

  // 根据文件扩展名推断高亮语言
  const ext = filePath.split('.').pop().toLowerCase();
  const langMap = {
    js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    css: 'css', scss: 'scss', less: 'less',
    html: 'xml', htm: 'xml', xml: 'xml', vue: 'xml',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
    java: 'java', kt: 'kotlin', swift: 'swift',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini',
    md: 'markdown', sh: 'bash', bash: 'bash', zsh: 'bash',
    sql: 'sql', php: 'php', cs: 'csharp', cpp: 'cpp', c: 'c',
  };
  const lang = langMap[ext] || 'plaintext';

  function highlightLine(line) {
    if (!window.hljs || lang === 'plaintext') return escHtml(line);
    try {
      return hljs.highlight(line, { language: lang, ignoreIllegals: true }).value;
    } catch(e) {
      return escHtml(line);
    }
  }

  // 使用 diff-match-patch 做精确 LCS 行级 diff
  let diffs;
  if (window.diff_match_patch) {
    const dmp = new diff_match_patch();
    const a = dmp.diff_linesToChars_(input.old_string, input.new_string);
    const linesDiff = dmp.diff_main(a.chars1, a.chars2, false);
    dmp.diff_charsToLines_(linesDiff, a.lineArray);
    dmp.diff_cleanupSemantic(linesDiff);
    diffs = linesDiff;
  } else {
    // fallback: 简单行对比
    diffs = [[-1, input.old_string], [1, input.new_string]];
  }

  let html = `<div class="diff-view">`;
  html += `<div class="diff-file"><span class="diff-file-icon">📄</span>${escHtml(filePath)}</div>`;
  html += `<div class="diff-body">`;

  let lineNum = 1;
  for (const [op, text] of diffs) {
    const lines = text.split('\n');
    const effectiveLines = lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;

    for (const line of effectiveLines) {
      if (op === 0) {
        html += `<div class="diff-line context"><span class="diff-ln">${lineNum}</span><span class="diff-prefix"> </span><code>${highlightLine(line)}</code></div>`;
        lineNum++;
      } else if (op === -1) {
        html += `<div class="diff-line removed"><span class="diff-ln"></span><span class="diff-prefix">-</span><code>${highlightLine(line)}</code></div>`;
      } else if (op === 1) {
        html += `<div class="diff-line added"><span class="diff-ln">${lineNum}</span><span class="diff-prefix">+</span><code>${highlightLine(line)}</code></div>`;
        lineNum++;
      }
    }
  }

  html += '</div></div>';
  return html;
}

function appendToolResult(block) {
  const cards = messagesEl.querySelectorAll('.tool-card, .ask-panel');
  let target = null;
  if(block.tool_use_id) {
    for(const c of cards) { if(c.dataset.toolId===block.tool_use_id) { target=c; break; } }
  }
  if(!target && cards.length) target = cards[cards.length-1];

  const text = typeof block.content==='string' ? block.content : JSON.stringify(block.content);

  // Special rendering for task tools
  if(target && (target.dataset.toolName==='TaskList' || target.dataset.toolName==='TaskGet')) {
    renderTaskResult(target, text);
    target.classList.add('open');
    scrollBottom();
    if(isStreaming && !streamingEl) showLoading();
    return;
  }
  // Special rendering for TodoRead result
  if(target && target.dataset.toolName==='TodoRead') {
    const items = parseTodoItems(text);
    if(items.length) {
      const body = target.querySelector('.tool-body');
      body.innerHTML = '';
      const list = document.createElement('div'); list.className='todo-list';
      items.forEach(t => {
        const row = document.createElement('div'); row.className='todo-item';
        const icon = t.status==='completed'?'✅':t.status==='in_progress'?'🔄':'⭕';
        const cls = t.status==='completed'?'done':t.status==='in_progress'?'progress':'pending';
        row.innerHTML = `<span class="todo-icon ${cls}">${icon}</span><span class="todo-text">${escHtml(t.subject||t.content||'')}</span>`;
        list.appendChild(row);
      });
      body.appendChild(list);
      target.classList.add('open');
      scrollBottom();
      if(isStreaming && !streamingEl) showLoading();
      return;
    }
  }

  const truncated = text.length>3000 ? text.slice(0,3000)+'\n... (truncated)' : text;
  if(target) {
    const res = document.createElement('div');
    res.className = 'tool-result' + (block.is_error ? ' error' : '');
    res.innerHTML = `<pre>${escHtml(truncated)}</pre>`;
    target.appendChild(res);
    // Keep query tool results collapsed by default
    const queryTools = ['Read', 'Grep', 'Glob', 'Bash'];
    if(!queryTools.includes(target.dataset.toolName)) {
      target.classList.add('open');
    }
  }
  scrollBottom();

  // Show loading indicator after tool result, waiting for next response
  if(isStreaming && !streamingEl) {
    showLoading();
  }
}

// ========== Permission UI (enhanced) ==========
function showPermission(msg) {
  // AskUserQuestion gets its own panel, not the permission banner
  if(msg.toolName === 'AskUserQuestion') {
    // Find the ask-panel we already rendered and bind requestId
    const panels = messagesEl.querySelectorAll('.ask-panel');
    for(const p of panels) {
      if(!p._requestId) { p._requestId = msg.requestId; scrollBottom(); return; }
    }
    // Fallback: render inline
    const fakeInput = msg.input || {};
    renderAskUserQuestion({ id: msg.requestId, name:'AskUserQuestion', input: fakeInput });
    const newPanels = messagesEl.querySelectorAll('.ask-panel');
    const last = newPanels[newPanels.length-1];
    if(last) last._requestId = msg.requestId;
    return;
  }

  const inputStr = typeof msg.input==='string' ? msg.input
    : msg.input?.command || msg.input?.file_path || JSON.stringify(msg.input,null,2);
  const rule = getPermRule(msg.toolName, msg.input);

  // ExitPlanMode 永远不自动放行，必须用户每次确认
  const neverRememberTools = ['ExitPlanMode'];
  const canAutoAllow = !neverRememberTools.includes(msg.toolName);

  // Check if this rule is already remembered
  if (canAutoAllow && rule && rememberedPermissions.has(rule)) {
    console.log('[auto-allow]', rule);
    wsSend({ type:'permission-response', requestId:msg.requestId, allow:true });
    return;
  }

  permBanner.innerHTML = `
    <div class="perm-title">🔒 权限请求</div>
    <div class="perm-tool">工具: <code>${escHtml(msg.toolName)}</code></div>
    ${rule ? `<div class="perm-rule">${escHtml(rule)}</div>` : ''}
    <details><summary style="font-size:12px;color:var(--text-secondary);cursor:pointer;margin:4px 0">查看详情</summary>
      <div class="perm-input-detail">${escHtml(inputStr)}</div>
    </details>
    <div class="perm-btns">
      <button class="btn-allow" data-rid="${msg.requestId}" data-act="once">允许一次</button>
      ${canAutoAllow ? `<button class="btn-allow-remember" data-rid="${msg.requestId}" data-act="remember" data-rule="${escAttr(rule||msg.toolName)}">允许并记住</button>` : ''}
      <button class="btn-deny" data-rid="${msg.requestId}" data-act="deny">拒绝</button>
    </div>`;
  permBanner.classList.remove('hidden');
  permBanner.querySelectorAll('.perm-btns button').forEach(btn => {
    btn.addEventListener('click', () => {
      const rid = btn.dataset.rid, act = btn.dataset.act;
      if(act==='once') {
        wsSend({ type:'permission-response', requestId:rid, allow:true });
      } else if(act==='remember') {
        const ruleToRemember = btn.dataset.rule;
        rememberedPermissions.add(ruleToRemember);
        localStorage.setItem('yxcode_rememberedPermissions', JSON.stringify([...rememberedPermissions]));
        wsSend({ type:'permission-response', requestId:rid, allow:true });
        appendSystemMsg(`已记住权限规则: ${ruleToRemember}`);
      } else {
        wsSend({ type:'permission-response', requestId:rid, allow:false, message:'User denied' });
      }
      permBanner.classList.add('hidden');
    });
  });
  scrollBottom();
}

function getPermRule(toolName, input) {
  if(toolName==='Bash' && input?.command) {
    const cmd = input.command.trim();
    const first = cmd.split(/\s/)[0];
    return `Bash(${first}:*)`;
  }
  return toolName;
}

function escAttr(s) { return (s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// ========== 计划模式执行确认 ==========
function showPlanExecutionConfirm(msg) {
  const inputStr = typeof msg.input==='string' ? msg.input
    : msg.input?.command || msg.input?.file_path || JSON.stringify(msg.input,null,2);

  permBanner.innerHTML = `
    <div class="perm-title">📋 计划模式 - 执行确认</div>
    <div class="perm-tool">当前处于计划模式，需要确认后正式执行计划</div>
    <div class="perm-tool">工具: <code>${escHtml(msg.toolName)}</code></div>
    <details><summary style="font-size:12px;color:var(--text-secondary);cursor:pointer;margin:4px 0">查看详情</summary>
      <div class="perm-input-detail">${escHtml(inputStr)}</div>
    </details>
    <div class="perm-btns">
      <button class="btn-allow" data-rid="${msg.requestId}">确认执行</button>
      <button class="btn-deny" data-rid="${msg.requestId}">取消</button>
    </div>`;
  permBanner.classList.remove('hidden');
  permBanner.querySelectorAll('.perm-btns button').forEach(btn => {
    btn.addEventListener('click', () => {
      const rid = btn.dataset.rid;
      if(btn.classList.contains('btn-allow')) {
        wsSend({ type:'permission-response', requestId:rid, confirmed:true });
      } else {
        wsSend({ type:'permission-response', requestId:rid, cancelled:true });
      }
      permBanner.classList.add('hidden');
    });
  });
  scrollBottom();
}

// ========== Streaming helpers ==========
let typeQueue = []; // queue of text chunks to simulate typing
let typeTimer = null;
const TYPE_CHUNK = 12; // characters per tick
const TYPE_INTERVAL = 20; // ms between ticks

function feedStream(text) {
  // If it's a small delta (real streaming), render immediately
  if(text.length <= TYPE_CHUNK * 2) {
    streamBuf += text;
    ensureAssistantEl();
    scheduleFlush();
    return;
  }
  // Large block: queue it for simulated streaming
  typeQueue.push(text);
  if(!typeTimer) drainTypeQueue();
}

function drainTypeQueue() {
  if(!typeQueue.length) { typeTimer = null; return; }
  const chunk = typeQueue[0];
  const pos = typeQueue._pos || 0;
  const end = Math.min(pos + TYPE_CHUNK, chunk.length);
  streamBuf += chunk.slice(pos, end);
  ensureAssistantEl();
  flushBuf();
  if(end >= chunk.length) {
    typeQueue.shift();
    typeQueue._pos = 0;
  } else {
    typeQueue._pos = end;
  }
  typeTimer = setTimeout(drainTypeQueue, TYPE_INTERVAL);
}

function flushTypeQueue() {
  // Immediately dump all remaining queued text
  if(typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
  for(const chunk of typeQueue) {
    const pos = typeQueue._pos || 0;
    streamBuf += chunk.slice(pos);
  }
  typeQueue = [];
  typeQueue._pos = 0;
}

function scheduleFlush() { if(flushTimer) return; flushTimer=setTimeout(()=>{ flushTimer=null; flushBuf(); },30); }

// ========== 消息分组：将一次 AI 回复的所有输出合并到一个容器 ==========
function ensureGroup() {
  if(currentGroup) return currentGroup;
  hideLoading();
  const g = document.createElement('div');
  g.className = 'msg-group';
  const copyBtn = `<button class="msg-action-btn" data-action="copy" title="复制"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;
  const retryBtn = `<button class="msg-action-btn" data-action="retry" title="重试"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>`;
  g.innerHTML = `<div class="group-header"><div class="role streaming-dot">Claude</div></div><div class="group-body"></div><div class="msg-actions">${copyBtn}${retryBtn}</div>`;
  messagesEl.appendChild(g);
  currentGroup = g;
  return g;
}
function getGroupBody() { return ensureGroup().querySelector('.group-body'); }
function closeGroup() {
  if(!currentGroup) return;
  currentGroup.querySelector('.group-header .role')?.classList.remove('streaming-dot');
  currentGroup.querySelector('.msg-actions')?.classList.add('visible');
  // 聚合所有文本内容供复制按钮使用
  const allText = [...currentGroup.querySelectorAll('.group-text')]
    .map(el => el.dataset.rawContent || el.querySelector('.content')?.innerText || '')
    .join('\n\n');
  currentGroup.dataset.rawContent = allText;
  currentGroup = null;
}

function ensureAssistantEl() {
  if(!streamingEl) {
    hideLoading();
    const body = getGroupBody();
    streamingEl = document.createElement('div');
    streamingEl.className = 'group-text';
    streamingEl.innerHTML = '<div class="content"></div>';
    body.appendChild(streamingEl);
  }
}
function flushBuf() {
  if(!streamBuf) return;
  ensureAssistantEl();
  const c = streamingEl.querySelector('.content');
  c.innerHTML = marked.parse(streamBuf);
  c.querySelectorAll('pre code').forEach(el => { try { hljs.highlightElement(el); } catch(e) {} });
  scrollBottom();
}
function finishStreaming() {
  flushTypeQueue();
  if(flushTimer) { clearTimeout(flushTimer); flushTimer=null; }
  if(streamBuf) flushBuf();
  if(streamingEl) { streamingEl.dataset.rawContent=streamBuf||''; streamingEl=null; }
  streamBuf='';
  // 注意：不关闭 currentGroup，由 closeGroup() 在 turn 结束时处理
}

// ========== UI helpers ==========
function createMsgEl(role) {
  const d=document.createElement('div'); d.className='msg '+role;
  const copyBtn = `<button class="msg-action-btn" data-action="copy" title="复制"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;
  const retryBtn = `<button class="msg-action-btn" data-action="retry" title="重试"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>`;
  const actions = `<div class="msg-actions">${copyBtn}${retryBtn}</div>`;
  d.innerHTML=`<div class="role ${role==='assistant'?'streaming-dot':''}">${role==='user'?'你':'Claude'}</div><div class="content"></div>${actions}`;
  return d;
}
function appendUserMsg(t, images) {
  const e=createMsgEl('user'); const content=e.querySelector('.content');
  if (images && images.length > 0) {
    const imgHtml = images.map(img => `<img class="chat-image-thumb" src="data:${img.mediaType};base64,${img.data}" alt="图片" />`).join('');
    content.innerHTML = imgHtml + escHtml(t);
  } else {
    content.textContent = t;
  }
  e.querySelector('.msg-actions')?.classList.add('visible');
  messagesEl.appendChild(e); scrollBottom();
}
function appendSystemMsg(t,type) {
  const d=document.createElement('div'); d.className='msg assistant';
  d.style.borderColor=type==='error'?'var(--red)':'var(--orange)';
  d.innerHTML=`<div class="role" style="color:${type==='error'?'var(--red)':'var(--orange)'}">系统</div><div class="content">${escHtml(t)}</div>`;
  messagesEl.appendChild(d); scrollBottom();
}
function scrollBottom() { const a=$('#chatArea'); requestAnimationFrame(()=>{a.scrollTop=a.scrollHeight;}); }
function escHtml(s) { const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }

// ========== 消息操作：复制 / 重试 ==========
function retryFromMessage(msgEl) {
  if (isStreaming) { appendSystemMsg('请等待当前任务完成', 'error'); return; }
  const allEls = [...messagesEl.children];
  // 如果点击的元素在分组内，定位到分组
  let clickedTop = msgEl;
  if (msgEl.closest('.msg-group')) clickedTop = msgEl.closest('.msg-group');
  let targetIdx = allEls.indexOf(clickedTop);
  if (targetIdx === -1) return;
  // 如果点的是 AI 分组，往上找到对应的用户消息
  if (clickedTop.classList.contains('msg-group') || clickedTop.classList.contains('assistant')) {
    for (let i = targetIdx - 1; i >= 0; i--) {
      if (allEls[i].classList.contains('msg') && allEls[i].classList.contains('user')) {
        targetIdx = i; break;
      }
    }
  }
  const userMsgEl = allEls[targetIdx];
  if (!userMsgEl || !userMsgEl.classList.contains('user')) { appendSystemMsg('找不到对应的用户消息', 'error'); return; }
  const content = userMsgEl.querySelector('.content')?.textContent || '';
  for (let i = allEls.length - 1; i >= targetIdx; i--) allEls[i].remove();
  // 清掉 sessionId，让服务端开新会话，不带之前的上下文
  sessionId = null;
  promptInput.value = content;
  send();
}
messagesEl.addEventListener('click', function(e) {
  const btn = e.target.closest('.msg-action-btn');
  if (!btn) return;
  const msgEl = btn.closest('.msg-group') || btn.closest('.msg');
  if (!msgEl) return;
  const action = btn.dataset.action;
  if (action === 'copy') {
    const content = msgEl.dataset.rawContent || msgEl.querySelector('.content')?.innerText || '';
    navigator.clipboard.writeText(content).then(() => {
      const svg = btn.innerHTML;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      setTimeout(() => { btn.innerHTML = svg; }, 1500);
    });
  }
  if (action === 'retry') retryFromMessage(msgEl);
});

// ========== Send / Abort / New ==========
async function send() {
  const t=promptInput.value.trim();

  // /btw 快速补充 — 绕过 isStreaming 锁
  if (t.startsWith('/btw ')) {
    const question = t.slice(5).trim();
    if (question) { promptInput.value=''; handleBtwCommand(question); return; }
  }

  if((!t && pendingImages.length===0)||isStreaming) return;

  // Intercept slash commands
  if (t.startsWith('/')) {
    const cmd = SLASH_COMMANDS.find(c => c.cmd === t);
    if (cmd) {
      promptInput.value = '';
      cmd.handler();
      return;
    } else {
      appendSystemMsg('未知命令: ' + t + '\n输入 /help 查看所有命令', 'error');
      promptInput.value = '';
      return;
    }
  }

  const apiKey = localStorage.getItem('yxcode_apiKey')||'';
  if(!apiKey) { appendSystemMsg('请先在设置中配置 API Key', 'error'); settingsOverlay.classList.remove('hidden'); return; }
  if(!selectedModel) { appendSystemMsg('请先选择模型', 'error'); return; }
  if(!cwdInput.value.trim()) { appendSystemMsg('请先设置工作目录', 'error'); cwdInput.focus(); return; }

  // 女友模式：如果是新会话，从文件读取提示词
  let finalPrompt = t;
  if (girlfriendMode.checked && !sessionId) {
    try {
      const res = await fetch('/prompt/GIRLFRIEND_MODE.md');
      const promptText = await res.text();
      finalPrompt = `${promptText}\n\n---\n\n<user_message>${t}</user_message>`;
    } catch(e) {
      console.warn('[girlfriend mode] 加载提示词失败:', e);
    }
  }

  const images = pendingImages.length > 0 ? pendingImages.map(img => ({ data: img.data, mediaType: img.mediaType })) : null;
  appendUserMsg(t, images); promptInput.value='';
  const baseUrl = localStorage.getItem('yxcode_baseUrl') || '';
  wsSend({ type:'claude-command', prompt:finalPrompt, images, sessionId, cwd:cwdInput.value||null,
    model:selectedModel.value, permissionMode:permSelect.value,
    apiKey, baseUrl });
  pendingImages = []; renderImagePreviews();
  setStreaming(true);
}
function abort() { if(sessionId) wsSend({type:'abort-session',sessionId}); }
function newSession() { sessionId=null; messagesEl.innerHTML=''; sessionInfo.textContent=''; finishStreaming(); closeGroup(); setStreaming(false); pendingImages=[]; renderImagePreviews(); renderSidebar(); updatePageTitle(); }

// --- 页面标题跟随会话内容变化 ---
const DEFAULT_PAGE_TITLE = document.title || '意心Code - yxcode';
function updatePageTitle(summary) {
  if (summary) {
    document.title = summary + ' - 意心Code';
  } else {
    document.title = DEFAULT_PAGE_TITLE;
  }
}
// 从 projectsData 中查找当前会话的 summary
function getSessionSummary(sid) {
  if (!sid || !projectsData) return '';
  for (const proj of projectsData) {
    const s = proj.sessions.find(s => s.id === sid);
    if (s) return s.summary || '';
  }
  return '';
}
function setStreaming(v) {
  isStreaming=v; sendBtn.disabled=v; abortBtn.classList.toggle('hidden',!v); connStatus.className='status-dot '+(v?'busy':'online');
  if(v) showLoading(); else hideLoading();
}

let loadingStartTime = null;
let loadingTimerInterval = null;

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hrs = Math.floor(minutes / 60);
  if (hrs > 0) {
    return `${hrs} m ${String(minutes % 60).padStart(2, '0')} s`;
  }
  if (minutes > 0) {
    return `${minutes} m ${String(seconds % 60).padStart(2, '0')} s`;
  }
  return `${seconds} s`;
}

function updateLoadingTimer() {
  const el = document.getElementById('loadingIndicator');
  if (!el || !loadingStartTime) return;
  const timerEl = el.querySelector('.loading-timer');
  if (timerEl) {
    const elapsed = Date.now() - loadingStartTime;
    // Only show timer after 10 seconds
    if (elapsed < 10000) {
      timerEl.style.display = 'none';
    } else {
      timerEl.style.display = 'inline';
      timerEl.textContent = formatDuration(elapsed);
    }
  }
}

function showLoading() {
  hideLoading();
  loadingStartTime = Date.now();
  const el = document.createElement('div');
  el.className = 'loading-indicator';
  el.id = 'loadingIndicator';
  const tip = tips.length ? tips[Math.floor(Math.random()*tips.length)] : '';
  el.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div><span class="loading-text">Claude 正在思考...<span class="loading-timer" style="display:none">0s</span></span>' + (tip ? `<div class="loading-tip"><span style="margin-right:4px">💡 小提示：</span>${tip}</div>` : '');
  // 优先放入当前分组，否则放入消息容器
  if(currentGroup) {
    currentGroup.querySelector('.group-body').appendChild(el);
  } else {
    messagesEl.appendChild(el);
  }
  scrollBottom();
  // Start timer update every 100ms
  loadingTimerInterval = setInterval(updateLoadingTimer, 100);
}
function hideLoading() {
  const el = document.getElementById('loadingIndicator');
  if(el) el.remove();
  // Stop timer
  if (loadingTimerInterval) {
    clearInterval(loadingTimerInterval);
    loadingTimerInterval = null;
  }
  loadingStartTime = null;
}

sendBtn.addEventListener('click', send);
abortBtn.addEventListener('click', abort);
newBtn.addEventListener('click', newSession);

// 权限模式切换监听
permSelect.addEventListener('change', () => {
  const mode = permSelect.value;
  if (mode === 'plan' && sessionId) {
    wsSend({ type: 'plan-mode-toggle', sessionId, enabled: true });
  } else if (sessionId) {
    wsSend({ type: 'plan-mode-toggle', sessionId, enabled: false });
  }
});

// Drag-and-drop file path / image into chat input
promptInput.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
promptInput.addEventListener('drop', (e) => {
  e.preventDefault();
  // 处理拖入的图片文件
  if (e.dataTransfer.files?.length) {
    for (const file of e.dataTransfer.files) {
      if (!file.type.startsWith('image/')) continue;
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { appendSystemMsg(`不支持的图片格式: ${file.type}`, 'error'); continue; }
      if (file.size > MAX_IMAGE_SIZE) { appendSystemMsg(`图片过大 (${(file.size/1024/1024).toFixed(1)}MB)，最大 5MB`, 'error'); continue; }
      const reader = new FileReader();
      reader.onload = () => { pendingImages.push({ data: reader.result.split(',')[1], mediaType: file.type, name: file.name }); renderImagePreviews(); };
      reader.readAsDataURL(file);
    }
    if ([...e.dataTransfer.files].some(f => f.type.startsWith('image/'))) return;
  }
  const path = e.dataTransfer.getData('text/plain');
  if(path) {
    const pos = promptInput.selectionStart || promptInput.value.length;
    const val = promptInput.value;
    promptInput.value = val.slice(0, pos) + '@' + path + ' ' + val.slice(pos);
    promptInput.focus();
    promptInput.selectionStart = promptInput.selectionEnd = pos + path.length + 2;
  }
});

// 粘贴图片到输入框
promptInput.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (!item.type.startsWith('image/')) continue;
    e.preventDefault();
    const file = item.getAsFile();
    if (!file) continue;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) { appendSystemMsg(`不支持的图片格式: ${file.type}`, 'error'); continue; }
    if (file.size > MAX_IMAGE_SIZE) { appendSystemMsg(`图片过大 (${(file.size/1024/1024).toFixed(1)}MB)，最大 5MB`, 'error'); continue; }
    const reader = new FileReader();
    reader.onload = () => {
      pendingImages.push({ data: reader.result.split(',')[1], mediaType: file.type, name: file.name || `pasted-${pendingImages.length+1}.png` });
      renderImagePreviews();
    };
    reader.readAsDataURL(file);
  }
});

// 图片预览渲染
function renderImagePreviews() {
  const bar = document.getElementById('imagePreviewBar');
  if (pendingImages.length === 0) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  bar.style.display = 'flex';
  bar.innerHTML = pendingImages.map((img, i) => `
    <div class="image-preview-item" data-index="${i}">
      <img src="data:${img.mediaType};base64,${img.data}" alt="${escHtml(img.name)}" />
      <button class="image-preview-remove" onclick="window._removeImage(${i})" title="移除图片">✕</button>
    </div>
  `).join('');
}
window._removeImage = function(index) { pendingImages.splice(index, 1); renderImagePreviews(); };

// Input event handlers for slash commands and @ mentions
promptInput.addEventListener('keydown', e => {
  if (isDropdownVisible()) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDropdownIndex((dropdownIndex + 1) % dropdownItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDropdownIndex((dropdownIndex - 1 + dropdownItems.length) % dropdownItems.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (dropdownIndex >= 0) selectDropdownItem(dropdownIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideDropdown();
    }
  } else {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
});

promptInput.addEventListener('input', () => {
  const val = promptInput.value;
  if (val.startsWith('/')) {
    checkSlashCommand();
  } else if (getMentionContext()) {
    checkFileMention();
  } else {
    hideDropdown();
  }
});

// Click outside to close dropdown
document.addEventListener('click', e => {
  if (!promptInput.contains(e.target) && !cmdDropdown.contains(e.target)) {
    hideDropdown();
  }
});

// Clear file cache when cwd changes
cwdInput.addEventListener('change', () => {
  fileListCache = null;
  fileListCwd = null;
});

// ========== Input Resize Handle ==========
(function initInputResize() {
  const handle = document.getElementById('inputResizeHandle');
  const textarea = document.getElementById('promptInput');
  if (!handle || !textarea) return;
  let startY, startH, dragging = false;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startH = textarea.offsetHeight;
    handle.classList.add('dragging');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const delta = startY - e.clientY;
    const newH = Math.min(Math.max(startH + delta, 48), window.innerHeight * 0.6);
    textarea.style.height = newH + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    try { localStorage.setItem('inputHeight', textarea.style.height); } catch(e) {}
  });

  // 恢复上次保存的高度
  try {
    const saved = localStorage.getItem('inputHeight');
    if (saved) textarea.style.height = saved;
  } catch(e) {}

  // 触屏支持
  handle.addEventListener('touchstart', (e) => {
    dragging = true;
    startY = e.touches[0].clientY;
    startH = textarea.offsetHeight;
    handle.classList.add('dragging');
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const delta = startY - e.touches[0].clientY;
    const newH = Math.min(Math.max(startH + delta, 48), window.innerHeight * 0.6);
    textarea.style.height = newH + 'px';
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    try { localStorage.setItem('inputHeight', textarea.style.height); } catch(e) {}
  });
})();

// ========== Panel Resize (Sidebar & FilePanel) ==========
(function initPanelResize() {
  const sidebarHandle = document.getElementById('sidebarResizeHandle');
  const filePanelHandle = document.getElementById('filePanelResizeHandle');
  if (!sidebarHandle || !filePanelHandle) return;

  const SIDEBAR_MIN = 180, SIDEBAR_MAX = 500;
  const FILEPANEL_MIN = 200, FILEPANEL_MAX = 600;

  function setupResize(handle, panel, storageKey, minW, maxW, direction) {
    let startX, startW, dragging = false;

    function onStart(clientX) {
      dragging = true;
      startX = clientX;
      startW = panel.offsetWidth;
      handle.classList.add('dragging');
      document.body.classList.add('panel-resizing');
      panel.style.transition = 'none';
    }

    function onMove(clientX) {
      if (!dragging) return;
      const delta = clientX - startX;
      const newW = Math.min(Math.max(startW + delta * direction, minW), maxW);
      panel.style.width = newW + 'px';
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.classList.remove('panel-resizing');
      panel.style.transition = '';
      try { localStorage.setItem(storageKey, panel.style.width); } catch(e) {}
    }

    handle.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(e.clientX); });
    document.addEventListener('mousemove', (e) => onMove(e.clientX));
    document.addEventListener('mouseup', onEnd);

    handle.addEventListener('touchstart', (e) => { onStart(e.touches[0].clientX); }, { passive: true });
    document.addEventListener('touchmove', (e) => { if (dragging) onMove(e.touches[0].clientX); }, { passive: true });
    document.addEventListener('touchend', onEnd);

    // 恢复上次保存的宽度
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && !panel.classList.contains('collapsed')) panel.style.width = saved;
    } catch(e) {}
  }

  // sidebar 向右拖变宽 → direction = 1
  setupResize(sidebarHandle, sidebar, 'sidebarWidth', SIDEBAR_MIN, SIDEBAR_MAX, 1);
  // filePanel 向左拖变宽 → direction = -1
  setupResize(filePanelHandle, filePanel, 'filePanelWidth', FILEPANEL_MIN, FILEPANEL_MAX, -1);

  // filePanel collapsed 时隐藏 handle（CSS 无法用 :has 兼容所有浏览器）
  const fpObserver = new MutationObserver(() => {
    filePanelHandle.style.display = filePanel.classList.contains('collapsed') ? 'none' : '';
  });
  fpObserver.observe(filePanel, { attributes: true, attributeFilter: ['class'] });
  if (filePanel.classList.contains('collapsed')) filePanelHandle.style.display = 'none';
})();

// ========== Sidebar / File Panel Toggle ==========
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  if (!sidebar.classList.contains('collapsed')) {
    try { const w = localStorage.getItem('sidebarWidth'); if (w) sidebar.style.width = w; } catch(e) {}
  }
});
sidebarCloseBtn.addEventListener('click', () => sidebar.classList.add('collapsed'));
newSessionSideBtn.addEventListener('click', () => { newSession(); });
locateSessionBtn.addEventListener('click', locateCurrentSession);
filePanelToggle.addEventListener('click', () => {
  filePanel.classList.toggle('collapsed');
  filePanelToggle.classList.toggle('collapsed');
  if (!filePanel.classList.contains('collapsed')) {
    try { const w = localStorage.getItem('filePanelWidth'); if (w) filePanel.style.width = w; } catch(e) {}
    loadFileTree();
  }
});
fileRefreshBtn.addEventListener('click', loadFileTree);
fvCloseBtn.addEventListener('click', () => {
  fileViewer.classList.add('hidden');
  fvInsertBtn.disabled = true;
  fvCopyBtn.disabled = true;
  fvContent.querySelectorAll('.fv-line.selected').forEach(el => el.classList.remove('selected'));
});

fvInsertBtn.addEventListener('click', () => {
  const selected = Array.from(fvContent.querySelectorAll('.fv-line.selected')).map(el => parseInt(el.dataset.line)).sort((a,b) => a-b);
  if(selected.length === 0) return;
  const filePath = fvPath.textContent;
  const lineRef = selected.length === 1 ? `${filePath}:${selected[0]}` : `${filePath}:${selected[0]}-${selected[selected.length-1]}`;
  promptInput.value += (promptInput.value ? ' ' : '') + lineRef;
  promptInput.focus();
  fileViewer.classList.add('hidden');
  fvInsertBtn.disabled = true;
  fvCopyBtn.disabled = true;
  fvContent.querySelectorAll('.fv-line.selected').forEach(el => el.classList.remove('selected'));
});

fvCopyBtn.addEventListener('click', async () => {
  const selected = Array.from(fvContent.querySelectorAll('.fv-line.selected')).map(el => parseInt(el.dataset.line)).sort((a,b) => a-b);
  if(selected.length === 0) return;
  const filePath = fvPath.textContent;
  const lineRef = selected.length === 1 ? `${filePath}:${selected[0]}` : `${filePath}:${selected[0]}-${selected[selected.length-1]}`;
  try {
    await navigator.clipboard.writeText(lineRef);
    const originalText = fvCopyBtn.textContent;
    fvCopyBtn.textContent = '✓';
    setTimeout(() => { fvCopyBtn.textContent = originalText; }, 1000);
  } catch(e) { appendSystemMsg('复制失败', 'error'); }
});
  // 点击背景不再关闭弹窗，只能通过关闭按钮关闭

// Update cwd also refreshes file tree
cwdInput.addEventListener('change', () => {
  localStorage.setItem('yxcode_cwd', cwdInput.value);
  if(!filePanel.classList.contains('collapsed')) loadFileTree();
});

// ========== Sidebar: Projects & Sessions ==========
let projectsData = [];

async function loadProjects() {
  try {
    projectsData = await (await fetch('/api/projects')).json();
    renderSidebar();
  } catch(e) { console.error('[loadProjects]', e); }
}

sidebarSearch.addEventListener('input', () => renderSidebar());

function renderSidebar() {
  sidebarBody.innerHTML = '';
  const query = (sidebarSearch.value || '').trim();
  const filtered = query
    ? projectsData.filter(p => decodeProjectName(p.name).includes(query))
    : projectsData;
  if(!filtered.length) {
    sidebarBody.innerHTML = `<div style="padding:16px;color:var(--text-secondary);font-size:13px;text-align:center">${query ? '无匹配结果' : '暂无会话记录'}</div>`;
    return;
  }
  for(const proj of filtered) {
    const group = document.createElement('div');
    group.className = 'project-group';
    const displayName = decodeProjectName(proj.name);
    // Auto-expand when searching
    const isExpanded = query ? true : expandedProjects.has(proj.name);
    const arrow = isExpanded ? '▼' : '▶';
    const nameEl = document.createElement('div');
    nameEl.className = 'project-name';
    nameEl.title = displayName;
    nameEl.style.cursor = 'pointer';
    nameEl.style.userSelect = 'none';
    nameEl.innerHTML = `<span style="font-size:10px;margin-right:4px">${arrow}</span>${escHtml(displayName)} <span style="font-weight:400;opacity:.6">(${proj.sessions.length})</span>`;
    group.appendChild(nameEl);
    const sessionsWrap = document.createElement('div');
    sessionsWrap.style.display = isExpanded ? 'block' : 'none';
    for(const s of proj.sessions) {
      const item = document.createElement('div');
      item.className = 'session-item' + (s.id === sessionId ? ' active' : '');
      item.innerHTML = `<div class="session-summary">${escHtml(s.summary || s.id.slice(0,12))}</div><div class="session-meta">${s.msgCount}条消息 · ${timeAgo(s.mtime)}<button class="delete-session-btn" title="删除到回收站">🗑️</button></div>`;
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('delete-session-btn')) {
          switchSession(proj.name, s.id);
        }
      });
      const deleteBtn = item.querySelector('.delete-session-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(proj.name, s.id);
      });
      sessionsWrap.appendChild(item);
    }
    group.appendChild(sessionsWrap);
    nameEl.addEventListener('click', () => {
      if(expandedProjects.has(proj.name)) { expandedProjects.delete(proj.name); } else { expandedProjects.add(proj.name); }
      renderSidebar();
    });
    sidebarBody.appendChild(group);
  }
}

function decodeProjectName(name) {
  // ~/.claude/projects/ uses path encoding: E--code-github becomes E:\code\github
  // Pattern: drive letter + -- + path with - as separator
  const match = name.match(/^([A-Z])--(.+)$/);
  if (match) {
    const drive = match[1];
    const pathPart = match[2].replace(/-/g, '\\');
    return `${drive}:\\${pathPart}`;
  }
  return name.replace(/-/g, '\\');
}

function locateCurrentSession() {
  const cwd = cwdInput.value.trim();
  if (!cwd) {
    appendSystemMsg('请先设置工作目录', 'error');
    return;
  }

  // Encode cwd to project name format (e.g., E:\code\github -> E--code-github)
  const encodedCwd = encodeProjectName(cwd);

  // Find the project matching current cwd
  let targetProject = null;
  for (const proj of projectsData) {
    if (proj.name === encodedCwd) {
      targetProject = proj;
      break;
    }
  }

  if (!targetProject) {
    appendSystemMsg('当前工作目录没有对应的会话记录', 'error');
    return;
  }

  if (targetProject.sessions.length === 0) {
    appendSystemMsg('当前项目没有会话记录', 'error');
    return;
  }

  // Determine which session to locate
  let targetSessionId = null;

  // If there's an active session and it belongs to this project, use it
  if (sessionId && targetProject.sessions.some(s => s.id === sessionId)) {
    targetSessionId = sessionId;
  } else {
    // Otherwise, use the first (latest) session
    targetSessionId = targetProject.sessions[0].id;
  }

  // Expand the project
  expandedProjects.add(targetProject.name);

  // Re-render sidebar
  renderSidebar();

  // Expand sidebar if collapsed
  sidebar.classList.remove('collapsed');

  // Scroll to the target session
  setTimeout(() => {
    const projectGroups = sidebarBody.querySelectorAll('.project-group');
    for (const group of projectGroups) {
      const nameEl = group.querySelector('.project-name');
      if (nameEl && nameEl.textContent.includes(decodeProjectName(targetProject.name))) {
        // Find the target session item
        const sessionItems = group.querySelectorAll('.session-item');
        let targetItem = null;

        for (const item of sessionItems) {
          // Check if this is the target session (either active or first)
          const summary = item.querySelector('.session-summary');
          if (summary) {
            // Match by checking if it's active or if it's the first one
            if (item.classList.contains('active') && targetSessionId === sessionId) {
              targetItem = item;
              break;
            } else if (!targetItem && targetSessionId !== sessionId) {
              // If no active match, use the first session
              targetItem = sessionItems[0];
              break;
            }
          }
        }

        if (!targetItem) {
          targetItem = sessionItems[0]; // Fallback to first
        }

        if (targetItem) {
          targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Highlight briefly
          const originalBg = targetItem.style.background;
          targetItem.style.background = 'var(--accent-primary)';
          targetItem.style.transition = 'background 0.5s';
          setTimeout(() => {
            targetItem.style.background = originalBg;
          }, 1000);
        }
        break;
      }
    }
  }, 100);
}

function encodeProjectName(cwdPath) {
  // Convert path like E:\code\github to E--code-github
  const normalized = cwdPath.replace(/\//g, '\\');
  const match = normalized.match(/^([A-Z]):\\(.+)$/);
  if (match) {
    const drive = match[1];
    const pathPart = match[2].replace(/\\/g, '-');
    return `${drive}--${pathPart}`;
  }
  return normalized.replace(/\\/g, '-');
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if(mins < 1) return '刚刚';
  if(mins < 60) return mins + '分钟前';
  const hrs = Math.floor(mins / 60);
  if(hrs < 24) return hrs + '小时前';
  const days = Math.floor(hrs / 24);
  if(days < 30) return days + '天前';
  return Math.floor(days / 30) + '个月前';
}

async function switchSession(projectName, sid) {
  try {
    const msgs = await (await fetch(`/api/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sid)}/messages`)).json();
    // Clear and replay
    messagesEl.innerHTML = '';
    finishStreaming();
    closeGroup();
    setStreaming(false);
    sessionId = sid;
    sessionInfo.textContent = '会话: ' + sid.slice(0,8) + '...';
    // 更新页面标题为会话摘要
    const summary = getSessionSummary(sid);
    updatePageTitle(summary);
    // Auto-expand the project in sidebar (Fix 6)
    for (const proj of projectsData) {
      if (proj.sessions.some(s => s.id === sid)) { expandedProjects.add(proj.name); break; }
    }
    for(const m of msgs) {
      if(m.role === 'user') {
        closeGroup(); // 遇到用户消息先关闭上一个分组
        appendUserMsg(m.content);
        continue;
      }
      // Assistant message: 使用分组容器
      ensureGroup();
      if(m.parts && m.parts.length) {
        for(const part of m.parts) {
          if(part.type === 'text' && part.text?.trim()) {
            const textEl = document.createElement('div');
            textEl.className = 'group-text';
            const content = document.createElement('div');
            content.className = 'content';
            content.innerHTML = marked.parse(part.text);
            content.querySelectorAll('pre code').forEach(c => { try { hljs.highlightElement(c); } catch(e) {} });
            textEl.dataset.rawContent = part.text;
            textEl.appendChild(content);
            getGroupBody().appendChild(textEl);
          } else if(part.type === 'tool_use') {
            const card = createToolCard(part);
            getGroupBody().appendChild(card);
          } else if(part.type === 'tool_result') {
            appendToolResult(part);
          }
        }
      } else if(m.content) {
        const textEl = document.createElement('div');
        textEl.className = 'group-text';
        const content = document.createElement('div');
        content.className = 'content';
        content.innerHTML = marked.parse(m.content);
        content.querySelectorAll('pre code').forEach(c => { try { hljs.highlightElement(c); } catch(e) {} });
        textEl.dataset.rawContent = m.content;
        textEl.appendChild(content);
        getGroupBody().appendChild(textEl);
      }
    }
    closeGroup(); // 关闭末尾分组
    scrollBottom();
    renderSidebar();
  } catch(e) { console.error('[switchSession]', e); appendSystemMsg('加载会话失败: ' + e.message, 'error'); }
}

async function deleteSession(projectName, sid) {
  if (!confirm('确定要删除此会话吗？文件将移至回收站。')) return;
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sid)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('删除失败');
    appendSystemMsg('会话已删除到回收站', 'success');
    if (sessionId === sid) { messagesEl.innerHTML = ''; sessionId = ''; sessionInfo.textContent = ''; }
    await loadProjects();
  } catch(e) { console.error('[deleteSession]', e); appendSystemMsg('删除失败: ' + e.message, 'error'); }
}

// ========== File Tree ==========
async function loadFileTree() {
  const cwd = cwdInput.value || '';
  if(!cwd) { fileTreeBody.innerHTML = '<div style="padding:16px;color:var(--text-secondary);font-size:13px;text-align:center">请先设置工作目录</div>'; return; }
  try {
    const items = await (await fetch('/api/files?cwd=' + encodeURIComponent(cwd))).json();
    fileTreeBody.innerHTML = '';
    renderFileTree(items, fileTreeBody, 0);
  } catch(e) { fileTreeBody.innerHTML = `<div style="padding:16px;color:var(--red);font-size:13px">${escHtml(e.message)}</div>`; }
}

function renderFileTree(items, container, depth) {
  for(const item of items) {
    const row = document.createElement('div');
    row.className = 'tree-item';
    row.style.paddingLeft = (8 + depth * 16) + 'px';
    row.draggable = true;
    row.dataset.path = item.path;
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', item.path);
      e.dataTransfer.effectAllowed = 'copy';
    });
    const copyBtn = document.createElement('button');
    copyBtn.className = 'tree-copy-btn';
    copyBtn.textContent = '复制路径';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(item.path).then(() => {
        copyBtn.textContent = '已复制';
        setTimeout(() => copyBtn.textContent = '复制路径', 1500);
      });
    });
    if(item.type === 'dir') {
      const wasExpanded = expandedFolders.has(item.path);
      row.innerHTML = `<span class="tree-icon">${wasExpanded ? '▼' : '▶'}</span><span class="tree-name">📁 ${escHtml(item.name)}</span>`;
      row.appendChild(copyBtn);
      container.appendChild(row);
      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children' + (wasExpanded ? ' open' : '');
      container.appendChild(childContainer);
      if(item.children?.length) renderFileTree(item.children, childContainer, depth + 1);
      row.addEventListener('click', (e) => {
        if(e.target.closest('.tree-copy-btn')) return;
        const isOpen = childContainer.classList.toggle('open');
        row.querySelector('.tree-icon').textContent = isOpen ? '▼' : '▶';
        if(isOpen) expandedFolders.add(item.path); else expandedFolders.delete(item.path);
      });
    } else {
      const sizeStr = item.size > 1024 ? (item.size / 1024).toFixed(1) + 'K' : item.size + 'B';
      row.innerHTML = `<span class="tree-icon">·</span><span class="tree-name">${escHtml(item.name)}</span><span class="tree-size">${sizeStr}</span>`;
      row.appendChild(copyBtn);
      row.addEventListener('click', (e) => { if(!e.target.closest('.tree-copy-btn')) viewFile(item.path); });
      container.appendChild(row);
    }
  }
}

async function viewFile(filePath) {
  try {
    const data = await (await fetch('/api/file?path=' + encodeURIComponent(filePath))).json();
    if(data.error) { appendSystemMsg(data.error, 'error'); return; }
    fvPath.textContent = filePath;

    const lines = data.content.split('\n');
    const ext = filePath.split('.').pop();
    let html = '';

    lines.forEach((line, i) => {
      const lineNum = i + 1;
      const numStr = lineNum.toString().padStart(4, ' ');
      let codeHtml = escHtml(line);

      try {
        if(ext && typeof hljs !== 'undefined' && hljs.getLanguage(ext)) {
          codeHtml = hljs.highlight(line, { language: ext }).value;
        }
      } catch(e) {}

      html += `<span class="fv-line" data-line="${lineNum}"><span class="line-number">${numStr}</span>  ${codeHtml}</span>\n`;
    });

    fvContent.innerHTML = html;

    // 拖拽选择逻辑
    let selectedLines = new Set();
    let isDragging = false;
    let startLine = null;

    fvContent.addEventListener('mousedown', (e) => {
      const line = e.target.closest('.fv-line');
      if(!line) return;
      startLine = parseInt(line.dataset.line);
      isDragging = true;
      e.preventDefault();
    });

    fvContent.addEventListener('mousemove', (e) => {
      if(!isDragging || !startLine) return;
      const line = e.target.closest('.fv-line');
      if(!line) return;
      const currentLine = parseInt(line.dataset.line);
      const start = Math.min(startLine, currentLine);
      const end = Math.max(startLine, currentLine);
      selectedLines.clear();
      for(let i = start; i <= end; i++) selectedLines.add(i);
      updateSelection();
    });

    fvContent.addEventListener('mouseup', () => {
      isDragging = false;
    });

    function updateSelection() {
      fvContent.querySelectorAll('.fv-line').forEach(l => {
        l.classList.toggle('selected', selectedLines.has(parseInt(l.dataset.line)));
      });
      fvInsertBtn.disabled = selectedLines.size === 0;
      fvCopyBtn.disabled = selectedLines.size === 0;
    }

    fileViewer.classList.remove('hidden');
  } catch(e) { appendSystemMsg('读取文件失败: ' + e.message, 'error'); }
}

// ========== Folder Browser (Fix 5) ==========
let fbCurrentPath = '';

cwdBrowseBtn.addEventListener('click', () => openFolderBrowser(cwdInput.value || ''));
cwdOpenBtn.addEventListener('click', () => {
  const dir = cwdInput.value || '';
  if (!dir) return;
  fetch('/api/open-folder?path=' + encodeURIComponent(dir)).catch(() => {});
});
fbCloseBtn.addEventListener('click', closeFolderBrowser);
fbCancelBtn.addEventListener('click', closeFolderBrowser);

// /btw 面板按钮事件
document.getElementById('btwCloseBtn').addEventListener('click', closeBtwPanel);
document.getElementById('btwCopyBtn').addEventListener('click', () => {
  const text = btwStreamBuf || document.getElementById('btwContent').textContent;
  if(text) navigator.clipboard.writeText(text).then(() => {
    document.getElementById('btwStatus').textContent = '已复制';
    setTimeout(() => { if(document.getElementById('btwStatus').textContent==='已复制') document.getElementById('btwStatus').textContent='完成'; }, 1500);
  });
});

  // 点击背景不再关闭弹窗，只能通过关闭按钮关闭
fbSelectBtn.addEventListener('click', () => {
  if(fbCurrentPath) {
    cwdInput.value = fbCurrentPath;
    saveCwdToHistory(fbCurrentPath);
    localStorage.setItem('yxcode_cwd', fbCurrentPath);
    if(!filePanel.classList.contains('collapsed')) loadFileTree();
  }
  closeFolderBrowser();
});

function closeFolderBrowser() { folderBrowser.classList.add('hidden'); }

async function openFolderBrowser(startPath) {
  folderBrowser.classList.remove('hidden');
  await browseTo(startPath);
}

async function browseTo(targetPath) {
  try {
    const res = await (await fetch('/api/browse?path=' + encodeURIComponent(targetPath || ''))).json();
    if(res.error) { fbBody.innerHTML = `<div style="padding:16px;color:var(--red)">${escHtml(res.error)}</div>`; return; }
    fbCurrentPath = res.path || '';
    fbPath.textContent = fbCurrentPath || '我的电脑';
    fbBody.innerHTML = '';
    // Parent directory
    if(res.parent) {
      const item = document.createElement('div'); item.className = 'folder-item';
      item.innerHTML = '<span class="fi-icon">⬆</span><span>.. 返回上级</span>';
      item.addEventListener('click', () => browseTo(res.parent));
      fbBody.appendChild(item);
    }
    // Subdirectories
    for(const dir of res.dirs) {
      const item = document.createElement('div'); item.className = 'folder-item';
      item.innerHTML = `<span class="fi-icon">📁</span><span>${escHtml(dir.name)}</span>`;
      item.addEventListener('click', () => browseTo(dir.path));
      fbBody.appendChild(item);
    }
    if(!res.dirs.length && !res.parent) {
      fbBody.innerHTML = '<div style="padding:16px;color:var(--text-secondary);text-align:center">空目录</div>';
    }
  } catch(e) { fbBody.innerHTML = `<div style="padding:16px;color:var(--red)">${escHtml(e.message)}</div>`; }
}

// ========== Token Donut ==========

// Load projects on init
loadProjects();
