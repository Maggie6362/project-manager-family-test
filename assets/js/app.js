(() => {
  'use strict';
  const CONFIG = window.PROJECT_MANAGER_CONFIG || {};
  const hasSupabaseConfig = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = 'project-manager-demo-v1';
  const CATEGORY_COLORS = { '生活':'#ead8bc', '學習':'#d7d2e5', '旅遊':'#e7c9c8', '工作':'#c9d6c5', '投資理財':'#d7e4e6', '其他':'#e9dfd1' };
  const CATEGORY_ICONS = { '生活':'clay-life', '學習':'clay-learning', '旅遊':'clay-travel', '工作':'clay-life', '投資理財':'clay-money', '其他':'clay-other' };
  const CLAY = name => `<img class="clay-icon-img" src="assets/icons/${name}.png" alt="">`;
  const PAGE_INFO = {
    dashboard: ['專案管家', '首頁'], projects: ['把目標變成步驟', '我的專案'],
    
    settings: ['照顧好自己的資料', '帳號與備份']
  };
  const todayISO = () => { const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()); const part = type => parts.find(p => p.type === type)?.value || ''; return `${part('year')}-${part('month')}-${part('day')}`; };
  const dateLabel = (value, options = { month:'numeric', day:'numeric' }) => {
    if (!value) return '未設定日期';
    const date = new Date(`${String(value).slice(0,10)}T12:00:00+08:00`);
    if (Number.isNaN(date.getTime())) return '日期待確認';
    return new Intl.DateTimeFormat('zh-TW', { timeZone:'Asia/Taipei', ...options }).format(date);
  };
  const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00+08:00`) - new Date(`${a}T12:00:00+08:00`)) / 86400000);
  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const uid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const demoSeed = () => {
    const now = new Date().toISOString();
    const p1 = 'demo-travel', p2 = 'demo-learning', p3 = 'demo-life';
    return {
      projects: [
        {id:p1, owner_id:'demo-user', name:'福岡五天四夜旅行', category:'旅遊', custom_category:'', description:'整理交通、住宿與想慢慢走訪的景點。', start_date:'2026-11-12', due_date:'2026-11-12', status:'active', scope:'private', archived_at:null, created_at:now, updated_at:now},
        {id:p2, owner_id:'demo-user', name:'AI 工具每週學習', category:'學習', custom_category:'', description:'每週挑一個實用工具，記錄心得與應用情境。', start_date:todayISO(), due_date:null, status:'active', scope:'private', archived_at:null, created_at:now, updated_at:now},
        {id:p3, owner_id:'demo-user', name:'居家整理計畫', category:'生活', custom_category:'', description:'從一個小角落開始，逐步整理生活空間。', start_date:null, due_date:null, status:'active', scope:'private', archived_at:null, created_at:now, updated_at:now}
      ],
      tasks: [
        {id:uid(), project_id:p1, created_by:'demo-user', title:'確認住宿與取消政策', notes:'比對車站周邊交通與入住時間。', due_date:todayISO(), priority:'high', status:'todo', created_at:now, updated_at:now},
        {id:uid(), project_id:p1, created_by:'demo-user', title:'整理機場到市區的交通方式', notes:'保留一個備用方案。', due_date:null, priority:'medium', status:'in_progress', created_at:now, updated_at:now},
        {id:uid(), project_id:p2, created_by:'demo-user', title:'完成一篇 AI 工具使用筆記', notes:'記錄適用情境與限制。', due_date:todayISO(), priority:'medium', status:'todo', created_at:now, updated_at:now},
        {id:uid(), project_id:p3, created_by:'demo-user', title:'整理書桌抽屜', notes:'只整理 15 分鐘即可。', due_date:null, priority:'low', status:'todo', created_at:now, updated_at:now}
      ]
    };
  };
  let state = { projects: [], tasks: [], user: null, remote: false, loading: false, activePage: 'dashboard', activeProjectId: null, demo: false, pendingInvite: null, familyFeatureAvailable: false, familyWorkspace: null, familyMembers: [], familyInvitations: [] };
  let client = null;
  let lastInviteLink = ''; const FAMILY_INVITE_STORAGE_KEY = 'project-manager-pending-family-invite';

  function toast(message, type = 'success') {
    const el = document.createElement('div'); el.className = `toast ${type === 'error' ? 'error' : ''}`; el.textContent = message;
    $('#toast-region').appendChild(el); window.setTimeout(() => el.remove(), 3600);
  }
  function saveDemo() { /* Production/test build: local demo storage disabled; cloud login required. */ }
  function loadDemo() { return { projects: [], tasks: [] }; }
  function projectTasks(projectId) { return state.tasks.filter(t => t.project_id === projectId); }
  function progress(projectId) { const tasks = projectTasks(projectId); return tasks.length ? Math.round(tasks.filter(t => t.status === 'completed').length / tasks.length * 100) : 0; }
  function activeProjects() { return state.projects.filter(p => !p.archived_at); }
  function isOwner(project) { return Boolean(state.remote && state.user && project.owner_id === state.user.id); }
  function isFamilyWorkspaceProject(project) { return Boolean(state.remote && state.user && project.workspace_id && state.familyWorkspace?.workspace_id === project.workspace_id); }
  function canManageProject(project) { return Boolean(isOwner(project) || isFamilyWorkspaceProject(project)); }
  function canDeleteProjectTask(project) { return Boolean(isOwner(project) || isFamilyWorkspaceProject(project)); }
  function canEditTasks(project) { return Boolean(state.remote && state.user && (isOwner(project) || project.scope === 'shared')); }
  function visibleCategory(p) { return p.custom_category || p.category || '其他'; }
  function taskDueLabel(task) {
    if (!task.due_date) return '未設定期限';
    const diff = daysBetween(todayISO(), String(task.due_date).slice(0,10));
    if (diff < 0) return `逾期 ${Math.abs(diff)} 天`;
    if (diff === 0) return '今天到期';
    if (diff === 1) return '明天到期';
    return dateLabel(task.due_date);
  }
  function isOpenTask(t) { return t.status !== 'completed'; }
  function dashboardTasks() { return state.tasks.filter(isOpenTask).sort((a,b) => (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31')).slice(0,6); }
  function currentProject(id) { return state.projects.find(p => p.id === id); }

  async function initBackend() {
    if (!hasSupabaseConfig) { state.demo = false; state.remote = false; state.projects = []; state.tasks = []; updateConnection(); return; }
    try {
      client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
      const { data: { session }, error } = await client.auth.getSession(); if (error) throw error;
      state.user = session?.user || null; state.remote = Boolean(state.user); state.demo = false;
      client.auth.onAuthStateChange((_event, sessionNow) => {
        state.user = sessionNow?.user || null;
        state.remote = Boolean(state.user);
        state.demo = false;
        if (!state.user) { state.projects = []; state.tasks = []; const dlg = $('#auth-modal'); if (!dlg.open) dlg.showModal(); }
        refreshData().then(() => {
          updateConnection(); renderAll(); handlePendingInvite();
        }).catch(error => {
          console.error('登入狀態切換後讀取資料失敗：', error);
          toast('登入狀態已更新，但雲端資料讀取失敗。請確認網路或資料表權限。', 'error');
          updateConnection(); renderAll();
        });
      });
      if (state.user) {
        try {
          await fetchRemoteData();
        } catch (error) {
          // Keep authenticated mode: never make cloud data look like a fresh local demo.
          console.error('已登入，但讀取 Supabase 資料失敗：', error);
          state.projects = []; state.tasks = [];
          toast('已登入，但雲端資料讀取失敗；請稍後重試，不會切換成本機示範模式。', 'error');
        }
      } else { state.projects = []; state.tasks = []; }
    } catch (error) {
      console.error(error);
      state.demo = false; state.remote = false; state.user = null; state.projects = []; state.tasks = [];
      toast('雲端初始化失敗。請稍後重新整理或聯絡管理員；不會切換成本機示範模式。', 'error');
    }
    updateConnection();
  }
  function updateConnection() {
    const connected = Boolean(state.remote && state.user);
    $('#connection-label').textContent = connected ? '已連接雲端' : '請先登入';
    $('#backend-status').textContent = hasSupabaseConfig ? (connected ? '已登入雲端' : '已設定，尚未登入') : '尚未連接雲端';
    $('#auth-status').textContent = connected ? `已登入：${state.user.email || '使用者帳號'}。資料儲存在 Supabase。` : '請使用 Google 帳號登入後使用專案管家。';
    $('#login-open').textContent = connected ? '已登入' : 'Google 登入'; $('#login-open').disabled = connected;
    $('#logout-button').hidden = !connected;
    $('#account-button').textContent = connected ? (state.user.email?.slice(0,1).toUpperCase() || '🙂') : '🌼';
    $('#account-button').title = connected ? state.user.email : '請使用 Google 帳號登入';
  }
  async function fetchRemoteData() {
    if (!client || !state.user) return;
    state.loading = true;
    try {
      const [projectsRes, tasksRes] = await Promise.all([
        client.from('projects').select('*').order('created_at', {ascending:false}),
        client.from('tasks').select('*').order('created_at', {ascending:false})
      ]);
      if (projectsRes.error) throw projectsRes.error;
      if (tasksRes.error) throw tasksRes.error;
      // Update both collections together only after both requests succeed.
      state.projects = projectsRes.data || [];
      state.tasks = tasksRes.data || [];
      state.familyFeatureAvailable = false;
      state.familyWorkspace = null;
      state.familyMembers = [];
      state.familyInvitations = [];
      try {
        const wsRes = await client.rpc('get_my_family_workspace');
        if (wsRes.error) throw wsRes.error;
        state.familyWorkspace = wsRes.data || null;
        if (state.familyWorkspace?.workspace_id) {
          const membersRes = await client.rpc('list_family_members', {p_workspace_id: state.familyWorkspace.workspace_id});
          if (membersRes.error) throw membersRes.error;
          state.familyMembers = membersRes.data || [];
          if (state.familyWorkspace.role === 'admin') {
            const invitesRes = await client.rpc('list_family_invitations', {p_workspace_id: state.familyWorkspace.workspace_id});
            if (invitesRes.error) throw invitesRes.error;
            state.familyInvitations = Array.isArray(invitesRes.data) ? invitesRes.data : [];
          }
        }
        state.familyFeatureAvailable = true;
      } catch (familyError) {
        // Keep core project/task access working if the optional family migration is missing or unavailable.
        console.warn('家庭工作區功能尚未部署或不可用：', familyError.message);
        state.familyWorkspace = null;
        state.familyMembers = [];
        state.familyInvitations = [];
      }
    } finally {
      state.loading = false;
    }
  }
  async function refreshData() {
    if (state.remote && client) { try { await fetchRemoteData(); } catch (e) { console.error(e); toast('讀取雲端資料失敗，請檢查網路或權限設定。', 'error'); } }
    else { state.projects = []; state.tasks = []; }
  }
  async function refreshAndRender() { await refreshData(); renderAll(); }

  function setPage(page) {
    if (!PAGE_INFO[page]) page = 'dashboard'; state.activePage = page;
    $$('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
    $$('.nav-item, .bottom-nav-item').forEach(el => { const active = el.dataset.page === page; el.classList.toggle('active', active); if (el.classList.contains('bottom-nav-item')) { if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); } });
    $('.sidebar').classList.remove('open'); $('#mobile-nav-backdrop').classList.remove('show');
    if (window.innerWidth <= 760) window.scrollTo({top:0, behavior:'smooth'});
  }
  function renderAll() {
    const taipeiNow = new Date();
    const dateText = new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(taipeiNow);
    $('#today-label').textContent = new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',weekday:'short'}).format(taipeiNow);
    const nudgeDate = $('#daily-nudge-date');
    if (nudgeDate) nudgeDate.textContent = dateText;
    renderDashboard(); renderProjectGrid(); renderShared(); renderFamilyWorkspace(); renderArchive(); renderCategoryOptions(); updateConnection();
  }
  function renderDashboard() {
    const projects = activeProjects(); const openTasks = state.tasks.filter(isOpenTask); const today = todayISO(); const overdue = openTasks.filter(task => task.due_date && String(task.due_date).slice(0,10) < today).length; const dueToday = openTasks.filter(task => task.due_date && String(task.due_date).slice(0,10) === today).length;
    const isOverdueProject = p => p.status !== 'completed' && Boolean(p.due_date && String(p.due_date).slice(0,10) < todayISO());
    const inProgressCount = projects.filter(p => p.status !== 'completed').length;
    const overdueProjectCount = projects.filter(isOverdueProject).length;
    const completedProjectCount = projects.filter(p => p.status === 'completed').length;
    const stats = [
      ['進行中專案', inProgressCount, CLAY('clay-project-folder'), '#e9e2d3', 'active'],
      ['已逾期專案', overdueProjectCount, CLAY('clay-overdue-clock'), '#f2dce2', 'overdue'],
      ['已完成專案', completedProjectCount, CLAY('clay-task-clipboard'), '#dceeea', 'completed']
    ];
    $('#stats-grid').innerHTML = stats.map(([label,value,icon,color,filter]) => `<button type="button" class="overview-stat overview-stat-button" data-project-stat="${filter}" aria-label="查看${label}"><span class="overview-stat-icon clay-icon" style="--icon-bg:${color}" aria-hidden="true">${icon}</span><strong class="overview-stat-value">${value}</strong><span class="overview-stat-label">${label}</span></button>`).join('');
    const upcoming = dashboardTasks();
    $('#upcoming-list').innerHTML = upcoming.length ? upcoming.map(task => {
      const project = currentProject(task.project_id); const done = task.status === 'completed';
      return `<div class="task-preview"><button class="task-check ${done?'done':''}" data-task-toggle="${escapeHTML(task.id)}" aria-label="${done?'重新開啟':'完成'}任務">${done?'✓':''}</button><div class="task-preview-main"><div class="task-preview-title">${escapeHTML(task.title)}</div><div class="task-preview-meta">${escapeHTML(project?.name || '專案')}</div></div><span class="task-date">${escapeHTML(taskDueLabel(task))}</span></div>`;
    }).join('') : `<div class="empty-state"><span class="empty-clay-icon">${CLAY('clay-life')}</span><strong>目前沒有待辦任務</strong><p>享受一下留白的時間吧。</p><button class="secondary-button" data-page="projects">看看我的專案</button></div>`;
    const nudges = overdue > 0
      ? ['先處理一件逾期任務。','挑一件逾期事項重新安排。']
      : dueToday > 0
        ? ['今天先完成一件到期任務。','把今天的任務拆成小步驟。']
        : openTasks.length === 0
          ? ['今天留一點空白給自己。','花點時間欣賞今天的成果。']
          : ['先完成最重要的一小步。','把任務切小，就容易開始。','留一點空白給自己。','今天只要往前一小步。'];
    const dayKey = Number(todayISO().slice(-2));
    $('#daily-nudge').textContent = nudges[dayKey % nudges.length];
  }
  function renderCategoryOptions() {
    const select = $('#category-filter'); const selected = select.value || 'all';
    const categories = [...new Set(state.projects.map(visibleCategory))].filter(Boolean).sort();
    select.innerHTML = `<option value="all">所有分類</option>${categories.map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('')}`;
    if ([...select.options].some(o=>o.value===selected)) select.value = selected;
  }
  function cardHTML(project, mode = 'normal') {
    const category = visibleCategory(project); const icon = CATEGORY_ICONS[project.category] || 'clay-other'; const color = CATEGORY_COLORS[project.category] || '#e9dfd1';
    const taskCount = projectTasks(project.id).length; const pct = progress(project.id);
    const due = project.due_date ? dateLabel(project.due_date,{month:'numeric',day:'numeric'}) : '未設定期限';
    const sharedTag = project.scope === 'shared' ? `<span class="soft-tag">${CLAY('clay-shared')} 共享</span>` : `<span class="soft-tag">${CLAY('clay-lock')} 私人</span>`;
    return `<article class="project-card"><div class="project-card-top"><span class="project-art" style="background:${color}">${CLAY(icon)}</span><button class="project-more" data-project-menu="${escapeHTML(project.id)}" aria-label="專案更多選項">···</button></div><h3>${escapeHTML(project.name)}</h3><p class="project-description">${escapeHTML(project.description || '還沒有描述，點開專案新增任務吧。')}</p><div class="project-meta"><span>${escapeHTML(category)}</span><span>${taskCount} 個任務</span></div><div class="progress-track"><span style="width:${pct}%"></span></div><div class="project-meta"><span>${pct}% 完成</span><span>期限 ${escapeHTML(due)}</span></div><div class="project-card-footer">${sharedTag}<button class="project-open" data-project-open="${escapeHTML(project.id)}">${mode==='archive'?'查看／重新啟用':'查看專案'} →</button></div></article>`;
  }
  function emptyHTML(emoji,title,desc,buttonText='',action='') { return `<div class="empty-state"><span class="empty-emoji">${emoji}</span><strong>${title}</strong><p>${desc}</p>${buttonText?`<button class="primary-button" ${action}>${buttonText}</button>`:''}</div>`; }
  function renderProjectGrid() {
    const search = ($('#project-search')?.value || '').trim().toLocaleLowerCase(); const category = $('#category-filter')?.value || 'all'; const status = $('#status-filter')?.value || 'all';
    let list = activeProjects().filter(p => p.scope !== 'shared' || isOwner(p) || p.scope === 'shared');
    if (search) list = list.filter(p => p.name.toLocaleLowerCase().includes(search));
    if (category !== 'all') list = list.filter(p => visibleCategory(p) === category);
    if (status !== 'all') list = list.filter(p => p.status === status);
    $('#project-grid').innerHTML = list.length ? list.map(p=>cardHTML(p)).join('') : emptyHTML(CLAY('clay-life'),'還沒有符合條件的專案','試著調整搜尋或篩選條件，或建立一個新專案。','＋ 建立新專案','data-action="new-project"');
  }
  function renderShared() {
    const list = activeProjects().filter(p => p.scope === 'shared');
    $('#shared-grid').innerHTML = list.length ? list.map(p=>cardHTML(p)).join('') : emptyHTML(CLAY('clay-shared'),'還沒有共享專案','建立一個共享專案，再邀請家人一起完成。','＋ 建立共享專案','data-action="new-shared-project"');
  }
  function renderFamilyWorkspace() {
    const status = $('#family-workspace-status'); const role = $('#family-role-badge'); const controls = $('#family-workspace-controls');
    const membersBox = $('#family-members-list'); const invitesBox = $('#family-invitations-list');
    if (!status || !controls || !membersBox || !invitesBox) return;
    if (!state.remote || !state.user) {
      status.textContent = '請先使用 Google 帳號登入。'; role.textContent = '未登入';
      controls.innerHTML = '<p class="field-hint">登入後可建立或加入家庭工作區。</p>'; membersBox.innerHTML = ''; invitesBox.innerHTML = ''; return;
    }
    const ws = state.familyWorkspace;
    if (!state.familyFeatureAvailable) {
      status.textContent = '家庭共享服務目前不可用。'; role.textContent = '尚未連線';
      controls.innerHTML = '<p class="field-hint">請確認測試資料庫已套用開發版內的家庭共享 SQL，且權限設定正常，再重新整理頁面。</p>'; membersBox.innerHTML = ''; invitesBox.innerHTML = ''; return;
    }
    if (!ws) {
      status.textContent = '建立後可邀請已註冊的 Google 帳號加入，最多 5 人（含管理員）。'; role.textContent = '尚未加入';
      controls.innerHTML = '<form id="family-create-form" class="family-inline-form"><label>工作區名稱<input id="family-workspace-name" maxlength="80" value="我的家庭工作區" required></label><button class="primary-button" type="submit">＋ 建立家庭工作區</button></form>';
      membersBox.innerHTML = ''; invitesBox.innerHTML = ''; return;
    }
    status.textContent = `${ws.workspace_name || '家庭工作區'} · ${state.familyMembers.length}/5 位成員`;
    role.textContent = ws.role === 'admin' ? '管理員' : '一般成員';
    const members = state.familyMembers.map(m => `<div class="family-member-row"><span class="family-member-icon">${CLAY('clay-shared')}</span><div class="family-member-copy"><strong>${m.user_id === state.user.id ? '你（目前帳號）' : escapeHTML(m.display_name || '家庭成員')}</strong><small>${m.role === 'admin' ? '管理員' : '一般成員'} · 加入於 ${escapeHTML(dateLabel(m.joined_at,{year:'numeric',month:'numeric',day:'numeric'}))}</small></div>${ws.role === 'admin' && m.role !== 'admin' ? `<button type="button" class="mini-action" data-family-transfer="${escapeHTML(m.user_id)}">移交管理權</button><button type="button" class="mini-action" data-family-remove="${escapeHTML(m.user_id)}">移除</button>` : ''}</div>`).join('');
    membersBox.innerHTML = `<div class="sharing-heading"><h3>家庭成員</h3><span class="soft-tag">${state.familyMembers.length}/5</span></div>${members || '<p class="field-hint">尚無成員。</p>'}`;
    if (ws.role === 'admin') {
      controls.innerHTML = `<form id="family-invite-form" class="family-inline-form"><label>家人的 Google 帳號 Email<input id="family-invite-email" type="email" autocomplete="email" placeholder="name@gmail.com" required></label><button class="primary-button" type="submit" ${state.familyMembers.length >= 5 ? 'disabled' : ''}>建立邀請連結</button></form><p class="field-hint">只接受已使用 Google 登入註冊且已驗證的帳號。邀請連結 72 小時有效，請只傳給指定家人。</p>`;
      const invites = state.familyInvitations.map(i => { const expired = new Date(i.expires_at).getTime() <= Date.now(); const active = !i.revoked_at && !i.accepted_at && !expired; const label = i.revoked_at ? '已撤銷' : i.accepted_at ? '已加入' : expired ? '已過期' : '有效'; return `<div class="family-member-row"><span class="family-member-icon">${CLAY('clay-lock')}</span><div class="family-member-copy"><strong>${escapeHTML(i.invited_email)} · ${label}</strong><small>到期 ${escapeHTML(dateLabel(i.expires_at,{year:'numeric',month:'numeric',day:'numeric'}))}</small></div>${active ? `<button type="button" class="mini-action" data-family-invite-revoke="${escapeHTML(i.id)}">撤銷</button>` : ''}</div>`; }).join('');
      invitesBox.innerHTML = `<div class="sharing-heading sharing-heading--second"><h3>邀請紀錄</h3></div>${invites || '<p class="field-hint">尚未建立邀請。</p>'}`;
    } else {
      controls.innerHTML = '<p class="field-hint">只有家庭管理員可以邀請或移除成員。你可以建立與管理家庭共享專案及任務。</p>'; invitesBox.innerHTML = '';
    }
  }
  async function createFamilyWorkspace(event) {
    event.preventDefault(); const name = $('#family-workspace-name')?.value.trim() || '我的家庭工作區';
    try { const {error} = await client.rpc('create_family_workspace', {p_name:name}); if (error) throw error; await fetchRemoteData(); renderAll(); toast('家庭工作區已建立。'); }
    catch(e) { console.error(e); toast(e.message || '建立家庭工作區失敗。','error'); }
  }
  async function createFamilyInvitation(event) {
    event.preventDefault(); const ws = state.familyWorkspace; const email = $('#family-invite-email')?.value.trim();
    if (!ws || ws.role !== 'admin' || !email) return toast('請確認管理員權限並輸入 Email。','error');
    try { const {data,error} = await client.rpc('create_family_invitation', {p_workspace_id:ws.workspace_id, p_email:email}); if (error) throw error; if (!data) throw new Error('伺服器沒有回傳邀請連結。');
      lastInviteLink = `${location.origin}${location.pathname}?family-invite=${encodeURIComponent(data)}`;
      $('#invite-description').textContent = `已為 ${email} 建立家庭工作區邀請。連結有效 72 小時，且只能使用一次；請只傳給指定家人。`;
      $('#invite-link-box').textContent = lastInviteLink; $('#invite-modal').showModal(); await fetchRemoteData(); renderAll();
    } catch(e) { console.error(e); toast(e.message || '建立家庭邀請失敗。','error'); }
  }
  async function transferFamilyAdmin(userId) {
    const ws = state.familyWorkspace; if (!ws || ws.role !== 'admin') return toast('只有目前管理員可以移交管理權。','error');
    if (!confirm('確定將家庭工作區管理權移交給這位成員？移交後，你會成為一般成員，新的管理員將負責邀請與移除成員。')) return;
    try { const {data,error} = await client.rpc('transfer_family_admin',{p_workspace_id:ws.workspace_id,p_new_admin_user_id:userId}); if(error) throw error; if(data !== true) throw new Error('伺服器未確認管理權移交。'); await fetchRemoteData(); renderAll(); toast('家庭工作區管理權已移交。'); }
    catch(e) { console.error(e); toast(e.message || '移交管理權失敗。','error'); }
  }
  async function removeFamilyMember(userId) {
    const ws = state.familyWorkspace; if (!ws || ws.role !== 'admin') return toast('只有管理員可以移除成員。','error');
    if (!confirm('確定移除這位家庭成員？移除後對方將失去家庭共享專案的存取權。')) return;
    try { const {error} = await client.rpc('remove_family_member',{p_workspace_id:ws.workspace_id,p_user_id:userId}); if(error) throw error; await fetchRemoteData(); renderAll(); toast('家庭成員已移除。'); }
    catch(e) { console.error(e); toast(e.message || '移除家庭成員失敗。','error'); }
  }
  async function revokeFamilyInvitation(invitationId) {
    const ws = state.familyWorkspace; if (!ws || ws.role !== 'admin') return toast('只有管理員可以撤銷邀請。','error');
    if (!confirm('確定撤銷這個家庭邀請？連結將無法再使用。')) return;
    try { const {data,error} = await client.rpc('revoke_family_invitation',{p_workspace_id:ws.workspace_id,p_invitation_id:invitationId}); if(error) throw error; if(!data) throw new Error('邀請已使用、過期或已撤銷。'); await fetchRemoteData(); renderAll(); toast('家庭邀請已撤銷。'); }
    catch(e) { console.error(e); toast(e.message || '撤銷家庭邀請失敗。','error'); }
  }
  function renderArchive() {
    const list = state.projects.filter(p => p.archived_at);
    $('#archive-grid').innerHTML = list.length ? list.map(p=>cardHTML(p,'archive')).join('') : emptyHTML(CLAY('clay-archive'),'封存區還是空的','完成或暫停的專案可以封存，日後仍能重新啟用。');
  }

  function openProjectActionMenu(project) {
    const previous = $('#project-action-modal');
    if (previous) previous.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'project-action-modal';
    dialog.dataset.projectId = project.id;
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-head">
        <div><span class="tiny-label">PROJECT OPTIONS</span><h2>專案操作</h2></div>
        <button type="button" class="icon-button" data-project-choice="cancel" aria-label="關閉">×</button>
      </div>
      <p class="field-hint">${escapeHTML(project.name)}</p>
      <div class="project-action-list" style="display:grid;gap:12px;margin-top:18px">
        <button type="button" class="secondary-button" data-project-choice="details" style="width:100%;display:flex;align-items:center;gap:16px;justify-content:flex-start;padding:16px 18px;text-align:left">
          <span aria-hidden="true" style="width:52px;height:52px;flex:0 0 52px;display:grid;place-items:center;border-radius:17px;background:linear-gradient(145deg,#e5eee5,#cbdccc);box-shadow:inset 2px 2px 5px rgba(255,255,255,.9),inset -3px -4px 7px rgba(105,132,111,.16),0 4px 8px rgba(100,120,100,.10)">
            <svg viewBox="0 0 64 64" width="42" height="42" role="img" aria-label="" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="clayFolderBody" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a9c9ae"/><stop offset="1" stop-color="#6f997b"/></linearGradient><linearGradient id="clayFolderPage" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdf6"/><stop offset="1" stop-color="#e8e2d4"/></linearGradient><filter id="clayFolderShadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#58745f" flood-opacity=".25"/></filter></defs><g filter="url(#clayFolderShadow)" stroke-linejoin="round" stroke-linecap="round"><path d="M8 20a7 7 0 0 1 7-7h12l6 7h16a7 7 0 0 1 7 7v19a7 7 0 0 1-7 7H15a7 7 0 0 1-7-7Z" fill="url(#clayFolderBody)" stroke="#6c8e72" stroke-width="2.5"/><path d="M13 25h39v20a5 5 0 0 1-5 5H18a5 5 0 0 1-5-5Z" fill="#86ad8e"/><path d="M20 24a4 4 0 0 1 4-4h19a4 4 0 0 1 4 4v23H20Z" fill="url(#clayFolderPage)" stroke="#d2d4c5" stroke-width="2"/><path d="M26 31h15M26 37h15M26 43h10" stroke="#c6bca9" stroke-width="3.5"/></g><ellipse cx="20" cy="16" rx="5" ry="3" fill="#d4e5d2" opacity=".8"/></svg>
          </span><span style="flex:1;font-weight:700">查看專案詳情 <span aria-hidden="true" style="float:right;margin-left:8px">›</span></span>
        </button>
        ${canManageProject(project) ? `<button type="button" class="secondary-button" data-project-choice="edit" style="width:100%;display:flex;align-items:center;gap:16px;justify-content:flex-start;padding:16px 18px;text-align:left">
          <span aria-hidden="true" style="width:52px;height:52px;flex:0 0 52px;display:grid;place-items:center;border-radius:17px;background:linear-gradient(145deg,#f3e1d8,#e7c7b9);box-shadow:inset 2px 2px 5px rgba(255,255,255,.9),inset -3px -4px 7px rgba(159,103,78,.15),0 4px 8px rgba(130,95,78,.10)">
            <svg viewBox="0 0 64 64" width="42" height="42" role="img" aria-label="" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="clayPencilBody" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f5c5a9"/><stop offset="1" stop-color="#d98e73"/></linearGradient><linearGradient id="clayPencilMetal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0c9"/><stop offset="1" stop-color="#d7b97e"/></linearGradient><filter id="clayPencilShadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#a56f59" flood-opacity=".28"/></filter></defs><g filter="url(#clayPencilShadow)" stroke-linejoin="round" stroke-linecap="round"><g transform="rotate(42 32 32)"><rect x="24" y="9" width="16" height="39" rx="7" fill="url(#clayPencilBody)" stroke="#c77f66" stroke-width="2.5"/><path d="M24 17h16M24 39h16" stroke="#f8d7c5" stroke-width="2.5"/><rect x="24" y="42" width="16" height="7" rx="3" fill="url(#clayPencilMetal)" stroke="#c8a86e" stroke-width="2"/><path d="M24 49l8 10 8-10Z" fill="#e8d5ad" stroke="#bda77d" stroke-width="2.5"/><path d="M29 55l3 4 3-4Z" fill="#6e6658"/></g><ellipse cx="20" cy="19" rx="4" ry="2.5" fill="#f9dfd0" opacity=".9"/></g></svg>
          </span><span style="flex:1;font-weight:700">編輯專案 <span aria-hidden="true" style="float:right;margin-left:8px">›</span></span>
        </button>` : ''}
        ${canManageProject(project) ? `<button type="button" class="secondary-button" data-project-choice="archive" style="width:100%;display:flex;align-items:center;gap:16px;justify-content:flex-start;padding:16px 18px;text-align:left">
          <span aria-hidden="true" style="width:52px;height:52px;flex:0 0 52px;display:grid;place-items:center;border-radius:17px;background:linear-gradient(145deg,#eee8dc,#d9cfbe);box-shadow:inset 2px 2px 5px rgba(255,255,255,.9),inset -3px -4px 7px rgba(133,119,98,.15),0 4px 8px rgba(120,110,90,.10)">
            <svg viewBox="0 0 64 64" width="42" height="42" role="img" aria-label="" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="clayArchiveBox" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d8c7a8"/><stop offset="1" stop-color="#b59a76"/></linearGradient><linearGradient id="clayArchiveLid" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4e5c9"/><stop offset="1" stop-color="#d8bd96"/></linearGradient><filter id="clayArchiveShadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#8d7b5d" flood-opacity=".27"/></filter></defs><g filter="url(#clayArchiveShadow)" stroke-linejoin="round" stroke-linecap="round"><path d="M12 27h40l-3 25a5 5 0 0 1-5 4H20a5 5 0 0 1-5-4Z" fill="url(#clayArchiveBox)" stroke="#a78d69" stroke-width="2.5"/><path d="M8 20a4 4 0 0 1 4-4h40a4 4 0 0 1 4 4v8H8Z" fill="url(#clayArchiveLid)" stroke="#c8ae85" stroke-width="2.5"/><path d="M25 31h14a3 3 0 0 1 3 3v2H22v-2a3 3 0 0 1 3-3Z" fill="#f8f0df" stroke="#b59a76" stroke-width="2"/><path d="M25 42h14" stroke="#e9dbc2" stroke-width="3.5"/><circle cx="16" cy="20" r="2" fill="#fff6e7"/><circle cx="48" cy="20" r="2" fill="#fff6e7"/></g></svg>
          </span><span style="flex:1;font-weight:700">${project.archived_at ? '重新啟用專案' : '封存專案'} <span aria-hidden="true" style="float:right;margin-left:8px">›</span></span>
        </button>` : ''}
      </div>
      <div class="modal-actions"><button type="button" class="secondary-button" data-project-choice="cancel">取消</button></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once:true });
    dialog.showModal();
  }

  function openProjectModal(project = null, forceShared = false) {
    $('#project-form').reset(); $('#project-id').value = project?.id || ''; $('#project-modal-title').textContent = project ? '編輯專案' : '建立新專案';
    $('#project-name').value = project?.name || ''; $('#project-category').value = project?.custom_category ? 'custom' : (project?.category || '生活');
    $('#project-custom-category').value = project?.custom_category || ''; $('#custom-category-wrap').hidden = $('#project-category').value !== 'custom';
    $('#project-description').value = project?.description || ''; $('#project-start').value = project?.start_date || ''; $('#project-due').value = project?.due_date || '';
    $('#project-status').value = project?.status || 'active'; $('#project-shared').checked = forceShared || project?.scope === 'shared';
    $('#project-shared').disabled = Boolean(project && state.remote && !isOwner(project));
    $('#project-modal').showModal();
  }
  function openTaskModal(projectId, task = null) {
    $('#task-form').reset(); $('#task-id').value = task?.id || ''; $('#task-project-id').value = projectId;
    $('#task-modal-title').textContent = task ? '編輯任務' : '新增任務'; $('#task-title').value = task?.title || ''; $('#task-notes').value = task?.notes || '';
    $('#task-due').value = task?.due_date || ''; $('#task-priority').value = task?.priority || 'medium'; $('#task-status').value = task?.status || 'todo';
    $('#task-modal').showModal();
  }
  function openDetail(projectId) {
    const project = currentProject(projectId); if (!project) return;
    state.activeProjectId = projectId; $('#detail-title').textContent = project.name; $('#detail-category').textContent = visibleCategory(project).toLocaleUpperCase();
    const tasks = projectTasks(projectId).sort((a,b) => (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31'));
    const pct = progress(projectId); const owner = isOwner(project); const canTasks = canEditTasks(project);
    const canManage = canManageProject(project); const actions = [canManage ? `<button class="secondary-button" data-project-edit="${escapeHTML(project.id)}">編輯專案</button>` : '', owner && project.scope==='shared' && !project.workspace_id && !project.archived_at ? `<button class="secondary-button" data-invite="${escapeHTML(project.id)}">舊版專案邀請</button>` : '', canManage ? `<button class="secondary-button" data-project-archive="${escapeHTML(project.id)}">${project.archived_at?'重新啟用':'封存專案'}</button>` : '', canTasks && !project.archived_at ? `<button class="primary-button" data-task-new="${escapeHTML(project.id)}">＋ 新增任務</button>` : ''].filter(Boolean).join('');
    const taskRows = tasks.length ? tasks.map(task => `<div class="task-row"><button class="task-check ${task.status==='completed'?'done':''}" data-task-toggle="${escapeHTML(task.id)}" aria-label="切換任務狀態">${task.status==='completed'?'✓':''}</button><div class="task-row-body"><div class="task-row-title ${task.status==='completed'?'completed':''}">${escapeHTML(task.title)}</div>${task.notes?`<div class="task-row-notes">${escapeHTML(task.notes)}</div>`:''}<div class="task-row-meta"><span class="priority-tag ${task.priority==='high'?'high':task.priority==='low'?'low':''}"><img class="task-mini-clay" src="assets/icons/${task.priority==='high'?'clay-overdue-clock':task.priority==='low'?'clay-life':'clay-task-clipboard'}.png" alt="">${task.priority==='high'?'高優先':task.priority==='low'?'低優先':'中優先'}</span><span class="task-state-tag"><img class="task-mini-clay" src="assets/icons/${task.status==='completed'?'clay-task-clipboard':task.status==='in_progress'?'clay-project-folder':'clay-task-clipboard'}.png" alt="">${task.status==='completed'?'已完成':task.status==='in_progress'?'進行中':'待處理'}</span>${task.due_date?`<span class="task-state-tag">${escapeHTML(taskDueLabel(task))}</span>`:''}</div></div>${canTasks && !project.archived_at?`<div class="task-row-actions"><button class="mini-action" data-task-edit="${escapeHTML(task.id)}">編輯</button>${canDeleteProjectTask(project)?`<button class="mini-action" data-task-delete="${escapeHTML(task.id)}">刪除</button>`:''}</div>`:''}</div>`).join('') : emptyHTML(CLAY('clay-task-clipboard'),'這個專案還沒有任務','新增第一個小步驟，讓進度開始往前。',canTasks&&!project.archived_at?'＋ 新增任務':'','data-task-new="'+escapeHTML(project.id)+'"');
    $('#detail-content').innerHTML = `<div class="detail-summary"><div class="detail-summary-top"><span class="soft-tag">${project.scope==='shared'?CLAY('clay-shared')+' 家庭共享':CLAY('clay-lock')+' 私人專案'}</span><strong>${pct}% 完成</strong></div><div class="progress-track"><span style="width:${pct}%"></span></div><p>${escapeHTML(project.description || '還沒有專案描述。')}</p><p>開始日期：${escapeHTML(project.start_date?dateLabel(project.start_date):'未設定')}　·　截止日期：${escapeHTML(project.due_date?dateLabel(project.due_date):'未設定')}</p></div><div class="detail-actions">${actions}</div><div id="sharing-management"></div><div class="detail-section-head"><h3>任務清單 <span class="soft-tag">${tasks.length}</span></h3></div><div>${taskRows}</div>`;
    if (!$('#detail-modal').open) $('#detail-modal').showModal();
    if (state.remote && owner && project.scope === 'shared' && !project.workspace_id && !project.archived_at) loadSharingDetails(projectId);
  }

  async function saveProjectFromForm(event) {
    event.preventDefault(); const id = $('#project-id').value; const name = $('#project-name').value.trim();
    if (!name) return toast('請填寫專案名稱。','error');
    const categoryValue = $('#project-category').value; const custom = categoryValue === 'custom' ? $('#project-custom-category').value.trim() : '';
    if (categoryValue === 'custom' && !custom) return toast('請填寫自訂分類名稱。','error');
    const start = $('#project-start').value || null, due = $('#project-due').value || null;
    if (start && due && due < start) return toast('截止日期不能早於開始日期。','error');
    const wantsShared = $('#project-shared').checked;
    if (wantsShared && !state.familyWorkspace?.workspace_id) return toast('請先在「家庭共享」建立家庭工作區，再建立共享專案。','error');
    const project = {name, category:categoryValue==='custom'?'其他':categoryValue, custom_category:custom, description:$('#project-description').value.trim(), start_date:start, due_date:due, status:$('#project-status').value, scope:wantsShared?'shared':'private'};
    if (wantsShared && state.familyWorkspace?.workspace_id) project.workspace_id = state.familyWorkspace.workspace_id;
    try {
      if (state.remote) {
        if (id) {
          const old = currentProject(id); if (!old || !canManageProject(old)) throw new Error('只有專案建立者或家庭工作區成員可以編輯此專案。');
          const {data, error} = await client.from('projects').update({...project, updated_at:new Date().toISOString()}).eq('id',id).select('id').maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('專案未更新。可能是權限不足，或資料已不存在。');
        } else {
          const {data, error} = await client.from('projects').insert({...project, owner_id:state.user.id}).select('id').single();
          if (error) throw error;
          if (!data) throw new Error('雲端未確認收到這筆專案資料，請重試。');
        }
        await fetchRemoteData();
      } else {
        const now = new Date().toISOString();
        if (id) { const old = currentProject(id); Object.assign(old, project, {updated_at:now}); }
        else state.projects.unshift({id:uid(), owner_id:'demo-user', ...project, archived_at:null, created_at:now, updated_at:now});
        saveDemo();
      }
      $('#project-modal').close(); renderAll(); toast(id?'專案已更新。':'新專案已建立。');
    } catch (e) { console.error(e); toast(e.message || '儲存專案失敗，請稍後再試。','error'); }
  }
  async function saveTaskFromForm(event) {
    event.preventDefault(); const id = $('#task-id').value; const projectId = $('#task-project-id').value; const project = currentProject(projectId);
    if (!project) return toast('找不到這個專案。','error'); if (!canEditTasks(project)) return toast('你沒有編輯這個專案任務的權限。','error');
    const title = $('#task-title').value.trim(); if (!title) return toast('請填寫任務名稱。','error');
    const task = {project_id:projectId, title, notes:$('#task-notes').value.trim(), due_date:$('#task-due').value || null, priority:$('#task-priority').value, status:$('#task-status').value};
    try {
      if (state.remote) {
        if (id) {
          const {data, error} = await client.from('tasks').update({...task, updated_at:new Date().toISOString()}).eq('id',id).select('id').maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('任務未更新。可能是權限不足，或資料已不存在。');
        } else {
          const {data, error} = await client.from('tasks').insert({...task, created_by:state.user.id}).select('id').single();
          if (error) throw error;
          if (!data) throw new Error('雲端未確認收到這筆任務資料，請重試。');
        }
        await fetchRemoteData();
      } else {
        const now = new Date().toISOString(); if (id) Object.assign(state.tasks.find(t=>t.id===id),task,{updated_at:now}); else state.tasks.push({id:uid(),...task,created_by:'demo-user',created_at:now,updated_at:now}); saveDemo();
      }
      $('#task-modal').close(); renderAll(); openDetail(projectId); toast(id?'任務已更新。':'任務已新增。');
    } catch (e) { console.error(e); toast(e.message || '儲存任務失敗。','error'); }
  }
  async function toggleTask(taskId) {
    const task = state.tasks.find(t=>t.id===taskId); if (!task) return; const project = currentProject(task.project_id); if (!project || !canEditTasks(project)) return toast('你沒有權限修改這個任務。','error');
    const next = task.status === 'completed' ? 'todo' : 'completed';
    try {
      if (state.remote) {
        const {data, error} = await client.from('tasks').update({status:next,updated_at:new Date().toISOString()}).eq('id',taskId).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('任務狀態未更新。可能是權限不足，或資料已不存在。');
        await fetchRemoteData();
      }
      else { task.status = next; task.updated_at = new Date().toISOString(); saveDemo(); }
      renderAll(); if ($('#detail-modal').open) openDetail(project.id); toast(next==='completed'?'已標記完成，做得好！':'已重新開啟任務。');
    } catch (e) { console.error(e); toast('更新任務狀態失敗。','error'); }
  }
  async function deleteTask(taskId) {
    const task = state.tasks.find(t=>t.id===taskId); if (!task) return; const project = currentProject(task.project_id); if (!project || !canDeleteProjectTask(project)) return toast('你沒有權限刪除此任務。','error'); if (!confirm(`確定刪除任務「${task.title}」？此動作無法復原。`)) return;
    try { if (state.remote) {
      const {data, error} = await client.from('tasks').delete().eq('id',taskId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('任務未刪除。請確認你仍是專案或家庭工作區成員。');
      await fetchRemoteData();
    } else { state.tasks = state.tasks.filter(t=>t.id!==taskId); saveDemo(); } renderAll(); openDetail(task.project_id); toast('任務已刪除。'); }
    catch(e){ console.error(e); toast('刪除任務失敗。','error'); }
  }
  async function archiveProject(projectId) {
    const project = currentProject(projectId); if (!project || !canManageProject(project)) return toast('只有專案建立者或家庭工作區成員可以封存或重新啟用。','error');
    const restoring = Boolean(project.archived_at); if (!restoring && !confirm(`確定封存「${project.name}」？專案不會被刪除，可在封存區重新啟用。`)) return;
    try {
      const patch = restoring ? {archived_at:null} : {archived_at:new Date().toISOString()};
      if (state.remote) {
        const {data, error} = await client.from('projects').update({...patch,updated_at:new Date().toISOString()}).eq('id',projectId).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('專案狀態未更新。可能是權限不足，或資料已不存在。');
        await fetchRemoteData();
      }
      else { Object.assign(project,patch,{updated_at:new Date().toISOString()}); saveDemo(); }
      $('#detail-modal').close(); renderAll(); toast(restoring?'專案已重新啟用。':'專案已封存。');
    } catch(e) { console.error(e); toast('更新專案狀態失敗。','error'); }
  }
  async function createInvite(projectId) {
    const project = currentProject(projectId); if (!project || !isOwner(project) || project.scope!=='shared') return toast('只有共享專案的建立者可以邀請家人。','error');
    if (!state.remote || !client) return toast('安全邀請連結需要先連接 Supabase 並登入；本機示範模式不會產生可用邀請。','error');
    try {
      const {data,error} = await client.rpc('create_project_invitation',{p_project_id:projectId}); if (error) throw error;
      const token = typeof data === 'string' ? data : data?.token; if (!token) throw new Error('伺服器未回傳邀請令牌。');
      lastInviteLink = `${location.origin}${location.pathname}?invite=${encodeURIComponent(token)}`;
      $('#invite-description').textContent = `「${project.name}」的邀請連結有效 72 小時，且只能成功使用一次。請只傳給信任的家人。`;
      $('#invite-link-box').textContent = lastInviteLink; $('#invite-modal').showModal();
    } catch(e) { console.error(e); toast(e.message || '建立邀請失敗，請確認資料庫 migration 已部署。','error'); }
  }
  async function handlePendingInvite() {
    const params = new URLSearchParams(location.search);
    const familyToken = params.get('family-invite') || (() => { try { return sessionStorage.getItem(FAMILY_INVITE_STORAGE_KEY); } catch { return null; } })();
    if (familyToken && state.remote && state.user && state.pendingInvite !== familyToken) {
      state.pendingInvite = familyToken;
      const yes = confirm('你收到家庭工作區邀請。要使用目前登入的 Google 帳號確認加入嗎？');
      if (!yes) { state.pendingInvite = null; return; }
      try { const {error} = await client.rpc('accept_family_invitation',{p_token:familyToken}); if(error) throw error; try { sessionStorage.removeItem(FAMILY_INVITE_STORAGE_KEY); } catch {} history.replaceState({},'',location.pathname); await fetchRemoteData(); renderAll(); toast('已加入家庭工作區！'); }
      catch(e) { console.error(e); toast(e.message || '家庭邀請無法使用，請確認登入帳號是否與受邀 Email 相符。','error'); }
      finally { state.pendingInvite = null; }
      return;
    }
    const token = params.get('invite'); if (!token || state.pendingInvite === token) return;
    state.pendingInvite = token;
    if (!state.remote || !state.user) { toast('你收到一個專案邀請。請先登入雲端帳號，再回到邀請連結確認加入。','error'); return; }
    const yes = confirm('你收到一個專案邀請。要檢查連結並加入共享專案嗎？'); if (!yes) { state.pendingInvite = null; return; }
    try { const {data,error} = await client.rpc('accept_project_invitation',{p_token:token}); if (error) throw error; history.replaceState({},'',location.pathname); await fetchRemoteData(); renderAll(); toast('已成功加入共享專案！'); if (data) openDetail(data); }
    catch(e) { console.error(e); toast(e.message || '邀請無法使用，可能已過期、撤銷或使用過。','error'); }
    finally { state.pendingInvite = null; }
  }
  async function removeProjectMember(projectId, userId) {
    if (!confirm('確定移除此共享成員？移除後對方將立即失去存取權。')) return;
    try { const {error} = await client.rpc('remove_project_member',{p_project_id:projectId,p_user_id:userId}); if (error) throw error; toast('已移除共享成員。'); openDetail(projectId); }
    catch(e){ console.error(e); toast(e.message || '移除成員失敗。','error'); }
  }
  async function loadSharingDetails(projectId) {
    const box = $('#sharing-management'); if (!box || !client) return;
    box.innerHTML = '<div class="sharing-panel"><p class="field-hint">正在讀取共享成員與邀請狀態…</p></div>';
    try {
      const [membersRes, invitesRes] = await Promise.all([client.rpc('list_project_members',{p_project_id:projectId}), client.rpc('list_project_invitations',{p_project_id:projectId})]);
      if (membersRes.error) throw membersRes.error; if (invitesRes.error) throw invitesRes.error;
      const members = Array.isArray(membersRes.data) ? membersRes.data : []; const invites = Array.isArray(invitesRes.data) ? invitesRes.data : [];
      const membersHTML = members.map(m => `<div class="sharing-row"><div><strong>${escapeHTML(m.display_name || '家庭成員')}</strong><small>${m.is_owner?'專案建立者':`加入於 ${escapeHTML(dateLabel(m.joined_at,{year:'numeric',month:'numeric',day:'numeric'}))}`}</small></div>${!m.is_owner?`<button class="mini-action" data-member-remove="${escapeHTML(m.user_id)}" data-member-project="${escapeHTML(projectId)}">移除</button>`:''}</div>`).join('') || '<p class="field-hint">目前沒有共享成員。</p>';
      const invitesHTML = invites.map(i => { const expired = new Date(i.expires_at).getTime() <= Date.now(); const status = i.revoked_at?'已撤銷':i.accepted_at?'已使用':expired?'已過期':'有效'; const active = !i.revoked_at && !i.accepted_at && !expired; return `<div class="sharing-row"><div><strong>邀請連結 · ${status}</strong><small>建立於 ${escapeHTML(dateLabel(i.created_at,{year:'numeric',month:'numeric',day:'numeric'}))}；到期 ${escapeHTML(dateLabel(i.expires_at,{year:'numeric',month:'numeric',day:'numeric'}))}</small></div>${active?`<button class="mini-action" data-invite-revoke="${escapeHTML(i.id)}" data-invite-project="${escapeHTML(projectId)}">撤銷</button>`:''}</div>`; }).join('') || '<p class="field-hint">尚未建立邀請連結。</p>';
      box.innerHTML = `<section class="sharing-panel"><div class="sharing-heading"><h3>共享成員</h3><span class="soft-tag">${members.length}</span></div>${membersHTML}<div class="sharing-heading sharing-heading--second"><h3>最近的邀請</h3><span class="soft-tag">最多 10 筆</span></div>${invitesHTML}</section>`;
    } catch (e) { console.error(e); box.innerHTML = '<div class="sharing-panel"><p class="field-hint">無法讀取成員資訊。請確認最新資料庫 migration 已成功執行。</p></div>'; }
  }
  async function revokeInvitation(invitationId, projectId) {
    if (!confirm('確定撤銷這個邀請？連結將無法再使用。')) return;
    try { const {data,error} = await client.rpc('revoke_project_invitation',{p_invitation_id:invitationId}); if (error) throw error; if (!data) throw new Error('這個邀請可能已經使用、過期或撤銷。'); toast('邀請已撤銷。'); openDetail(projectId); }
    catch(e){ console.error(e); toast(e.message || '撤銷邀請失敗。','error'); }
  }

  function exportBackup() {
    const ownProjects = state.remote ? state.projects.filter(p=>p.owner_id===state.user?.id) : state.projects;
    const projectIds = new Set(ownProjects.map(p=>p.id)); const ownTasks = state.tasks.filter(t=>projectIds.has(t.project_id));
    const backup = {app:'project-manager',format_version:1,exported_at:new Date().toISOString(),projects:ownProjects.map(p=>({...p,owner_id:undefined,id:p.id})),tasks:ownTasks.map(t=>({...t,created_by:undefined,id:t.id}))};
    const blob = new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`專案管家備份-${todayISO()}.json`; a.style.display='none'; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(()=>URL.revokeObjectURL(url),1000); toast('已開始下載備份檔，請確認瀏覽器下載清單。');
  }
  async function importBackup(file) {
    if (!file) return; if (file.size > 10*1024*1024) return toast('備份檔超過 10 MB，請先確認檔案內容。','error');
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'project-manager' || data.format_version !== 1 || !Array.isArray(data.projects) || !Array.isArray(data.tasks)) throw new Error('檔案格式或版本不相容。');
      if (data.projects.length > 500 || data.tasks.length > 5000) throw new Error('備份資料筆數超出安全上限。');
      const projectIds = new Set(data.projects.map(p=>p.id));
      if (data.tasks.some(t=>!projectIds.has(t.project_id))) throw new Error('備份中有任務找不到所屬專案，已取消匯入。');
      if (data.projects.some(p=>typeof p.name!=='string'||!p.name.trim()||p.name.length>100)) throw new Error('備份中有無效的專案名稱。');
      if (!confirm(`將匯入 ${data.projects.length} 個專案與 ${data.tasks.length} 個任務，並建立為新的私人副本；不會覆寫現有資料。要繼續嗎？`)) return;
      if (state.remote) {
        const payload = {format_version:1,projects:data.projects.map(p=>({id:p.id,name:p.name,category:p.category||'其他',custom_category:p.custom_category||'',description:p.description||'',start_date:p.start_date||null,due_date:p.due_date||null,status:p.status==='completed'?'completed':'active',archived_at:p.archived_at||null})),tasks:data.tasks.map(t=>({id:t.id,project_id:t.project_id,title:t.title,notes:t.notes||'',due_date:t.due_date||null,priority:['high','medium','low'].includes(t.priority)?t.priority:'medium',status:['todo','in_progress','completed'].includes(t.status)?t.status:'todo'}))};
        const {data:result,error} = await client.rpc('import_my_backup',{p_payload:payload}); if (error) throw error; await fetchRemoteData(); toast(`匯入完成：${result?.projects ?? data.projects.length} 個專案、${result?.tasks ?? data.tasks.length} 個任務。`);
      } else {
        const map = new Map(); const now = new Date().toISOString();
        const newProjects = data.projects.map(p=>{const id=uid();map.set(p.id,id);return {id,owner_id:'demo-user',name:p.name,category:p.category||'其他',custom_category:p.custom_category||'',description:p.description||'',start_date:p.start_date||null,due_date:p.due_date||null,status:p.status==='completed'?'completed':'active',scope:'private',archived_at:p.archived_at||null,created_at:now,updated_at:now};});
        const newTasks = data.tasks.map(t=>({id:uid(),project_id:map.get(t.project_id),created_by:'demo-user',title:t.title,notes:t.notes||'',due_date:t.due_date||null,priority:['high','medium','low'].includes(t.priority)?t.priority:'medium',status:['todo','in_progress','completed'].includes(t.status)?t.status:'todo',created_at:now,updated_at:now}));
        state.projects.push(...newProjects); state.tasks.push(...newTasks); saveDemo();
        toast(`匯入完成：${newProjects.length} 個專案、${newTasks.length} 個任務。`);
      }
      renderAll();
    } catch(e) { console.error(e); toast(`匯入失敗：${e.message || '檔案無法讀取。'}`,'error'); }
    finally { $('#import-file').value=''; }
  }

  async function signInWithGoogle() {
    if (!client) return toast('目前尚未設定 Supabase，無法使用 Google 登入。','error');
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
    if (error) throw error;
  }
  async function signOut() { if (!client) return; const {error}=await client.auth.signOut(); if(error) return toast('登出失敗。','error'); state.user=null;state.remote=false;state.demo=false;state.projects=[];state.tasks=[];updateConnection();renderAll();const dlg=$('#auth-modal');if(!dlg.open)dlg.showModal();toast('已登出。'); }

  document.addEventListener('click', async event => {
    const target = event.target.closest('button,[data-page],[data-action],[data-close]'); if (!target) return;
    if (!state.user && !['google-login-button','login-open','account-button'].includes(target.id)) { event.preventDefault(); event.stopImmediatePropagation(); const dlg=$('#auth-modal'); if(!dlg.open) dlg.showModal(); toast('請先使用 Google 帳號登入。','error'); return; }
    if (target.dataset.projectStat) { event.preventDefault(); setPage('projects'); $('#project-search').value=''; $('#category-filter').value='all'; $('#status-filter').value=target.dataset.projectStat==='completed'?'completed':'active'; renderProjectGrid(); if(target.dataset.projectStat==='overdue') { const today=todayISO(); const filtered=activeProjects().filter(p=>p.status!=='completed' && p.due_date && String(p.due_date).slice(0,10)<today); $('#project-grid').innerHTML=filtered.length?filtered.map(p=>cardHTML(p)).join(''):emptyHTML(CLAY('clay-overdue-clock'),'目前沒有逾期專案','所有未完成專案目前都沒有逾期。'); } return; }
    if (target.dataset.page) { event.preventDefault(); setPage(target.dataset.page); return; }
    if (target.dataset.action === 'new-project') { openProjectModal(); return; }
    if (target.dataset.action === 'focus-today') { $('#upcoming-list')?.scrollIntoView({behavior:'smooth',block:'start'}); return; }
    if (target.dataset.action === 'new-shared-project') { openProjectModal(null,true); return; }
    if (target.dataset.close) { const dlg=$(`#${target.dataset.close}`); if(dlg?.open) dlg.close(); return; }
    if (target.dataset.projectOpen) { openDetail(target.dataset.projectOpen); return; }
    if (target.dataset.projectEdit) { const p=currentProject(target.dataset.projectEdit); $('#detail-modal').close(); openProjectModal(p); return; }
    if (target.dataset.projectArchive) { await archiveProject(target.dataset.projectArchive); return; }
    if (target.dataset.taskNew) { openTaskModal(target.dataset.taskNew); return; }
    if (target.dataset.taskToggle) { await toggleTask(target.dataset.taskToggle); return; }
    if (target.dataset.taskEdit) { const t=state.tasks.find(x=>x.id===target.dataset.taskEdit); if(t){const p=currentProject(t.project_id);if(p&&canEditTasks(p))openTaskModal(t.project_id,t);} return; }
    if (target.dataset.taskDelete) { await deleteTask(target.dataset.taskDelete); return; }
    if (target.dataset.memberRemove) { await removeProjectMember(target.dataset.memberProject, target.dataset.memberRemove); return; }
    if (target.dataset.familyTransfer) { await transferFamilyAdmin(target.dataset.familyTransfer); return; }
    if (target.dataset.familyRemove) { await removeFamilyMember(target.dataset.familyRemove); return; }
    if (target.dataset.familyInviteRevoke) { await revokeFamilyInvitation(target.dataset.familyInviteRevoke); return; }
    if (target.dataset.inviteRevoke) { await revokeInvitation(target.dataset.inviteRevoke, target.dataset.inviteProject); return; }
    if (target.dataset.invite) { await createInvite(target.dataset.invite); return; }
    if (target.dataset.projectMenu) { const p=currentProject(target.dataset.projectMenu); if(p) openProjectActionMenu(p); return; }
    if (target.dataset.projectChoice) {
      const choice = target.dataset.projectChoice;
      const dialog = $('#project-action-modal');
      const projectId = dialog?.dataset.projectId;
      // The selected project ID is stored on the dialog when the menu opens.
      const project = currentProject(projectId);
      if (dialog?.open) dialog.close();
      if (!project || choice === 'cancel') return;
      if (choice === 'details') openDetail(project.id);
      else if (choice === 'edit' && isOwner(project)) openProjectModal(project);
      else if (choice === 'archive' && isOwner(project)) await archiveProject(project.id);
      return;
    }
  });
  $('#project-form').addEventListener('submit', saveProjectFromForm); $('#task-form').addEventListener('submit', saveTaskFromForm);
  document.addEventListener('submit', event => { if (event.target?.id === 'family-create-form') createFamilyWorkspace(event); if (event.target?.id === 'family-invite-form') createFamilyInvitation(event); });
  $('#project-category').addEventListener('change', () => { $('#custom-category-wrap').hidden = $('#project-category').value !== 'custom'; });
  $('#project-search').addEventListener('input', renderProjectGrid); $('#category-filter').addEventListener('change', renderProjectGrid); $('#status-filter').addEventListener('change', renderProjectGrid);
  $('#export-button').addEventListener('click', exportBackup); $('#import-file').addEventListener('change', e => importBackup(e.target.files?.[0]));
  $('#login-open').addEventListener('click', () => $('#auth-modal').showModal()); $('#account-button').addEventListener('click', () => state.remote ? toast(`已登入：${state.user.email || '帳號'}`) : $('#auth-modal').showModal());
  $('#google-login-button').addEventListener('click', async () => {
    try { await signInWithGoogle(); }
    catch (err) { console.error(err); toast(err.message || 'Google 登入啟動失敗，請稍後再試。','error'); }
  });
  $('#logout-button').addEventListener('click', signOut);
  $('#copy-invite-button').addEventListener('click', async () => { try { await navigator.clipboard.writeText(lastInviteLink); toast('邀請連結已複製，可貼到 LINE 傳送。'); } catch { toast('無法自動複製，請長按連結文字手動複製。','error'); } });
  $('#mobile-menu').addEventListener('click', () => { $('.sidebar').classList.add('open'); $('#mobile-nav-backdrop').classList.add('show'); });
  $('#mobile-nav-backdrop').addEventListener('click', () => { $('.sidebar').classList.remove('open'); $('#mobile-nav-backdrop').classList.remove('show'); });
  document.addEventListener('keydown', e => { if(e.key==='Escape') { $('.sidebar').classList.remove('open'); $('#mobile-nav-backdrop').classList.remove('show'); if(!state.user && $('#auth-modal').open) e.preventDefault(); } });
  $('#auth-modal').addEventListener('cancel', e => { if(!state.user) e.preventDefault(); });
  $('#auth-modal').addEventListener('click', e => { if(!state.user && e.target.matches('dialog')) e.preventDefault(); });

  async function boot() { const familyToken = new URLSearchParams(location.search).get('family-invite'); if (familyToken) { try { sessionStorage.setItem(FAMILY_INVITE_STORAGE_KEY, familyToken); } catch {} }
    await initBackend();
    // Require Google login before exposing project/task actions; never load local demo data.
    if (!state.user) { state.demo = false; state.projects = []; state.tasks = []; $('#auth-modal').showModal(); }
    renderAll();
    const params = new URLSearchParams(location.search); const token = params.get('invite') || params.get('family-invite'); if (token) { toast('偵測到邀請；請先登入雲端帳號再確認加入。'); if (!state.remote) $('#auth-modal').showModal(); else handlePendingInvite(); }
  }
  boot();
})();
