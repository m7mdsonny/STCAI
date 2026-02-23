const API = '/api';

async function api(path, options = {}, retries = 1) {
  const doFetch = async () => {
    const res = await fetch(API + path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    let data = {};
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => ({}));
    }
    if (!res.ok) {
      const errMsg = data.detail || data.error || data.message || res.statusText || `خطأ ${res.status}`;
      const err = new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
      err.status = res.status;
      throw err;
    }
    return data;
  };
  try {
    return await doFetch();
  } catch (e) {
    const method = (options.method || 'GET').toUpperCase();
    const isRetryable = (e.status >= 500 || e.status === 408) && retries > 0 && method === 'GET';
    if (isRetryable) {
      await new Promise(r => setTimeout(r, 1500));
      return api(path, options, retries - 1);
    }
    throw e;
  }
}

let config = { cameras: [], hardware: {}, armed: false, site: {}, system_settings: null };
let license = { within_trial: true, trial_ends_at: null };
let cameraStatus = {};
let camerasStatusInterval = null;
let liveInterval = null;

const THEME_KEY = 'riskintel_theme';
const DEFAULT_THEME = 'dark';
const DISMISSED_ALERTS_KEY = 'riskintel_dismissed_alerts';
const ALERT_POLL_INTERVAL_MS = 5000;
let currentEventId = null;

let lastSeenEventIds = new Set();
let activeAlerts = [];
let alertPollTimer = null;
let firstAlertPollDone = false;

function getDismissedAlerts() {
  try {
    const raw = localStorage.getItem(DISMISSED_ALERTS_KEY) || '[]';
    return new Set(JSON.parse(raw));
  } catch (_) { return new Set(); }
}
function saveDismissedAlerts(ids) {
  try { localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify([...ids])); } catch (_) {}
}
function dismissAlert(eventId) {
  const d = getDismissedAlerts();
  d.add(eventId);
  saveDismissedAlerts(d);
  activeAlerts = activeAlerts.filter(a => a.id !== eventId);
  renderAlertTray();
  updateNotificationsBadge();
  renderNotificationsDropdown();
}

function getTheme() { return localStorage.getItem(THEME_KEY) || DEFAULT_THEME; }
function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
  const btn = $('themeToggle');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
}

function $(id) { return document.getElementById(id); }
function qs(s, el = document) { return el.querySelector(s); }
function qsa(s, el = document) { return el.querySelectorAll(s); }

const titles = { dashboard: 'لوحة التحكم', cameras: 'الكاميرات', live: 'البث المباشر', events: 'الأحداث', analytics: 'تحليلات الأشخاص', modules: 'ضبط الموديولات', settings: 'الإعدادات', license: 'الترخيص' };

function showPage(pageId) {
  if (pageId !== 'cameras' && camerasStatusInterval) {
    clearInterval(camerasStatusInterval);
    camerasStatusInterval = null;
  }
  if (pageId !== 'live') {
    if (liveInterval) { clearInterval(liveInterval); liveInterval = null; }
    liveObjectURLs.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} });
    liveObjectURLs = [];
  }
  qsa('.nav-item').forEach(n => n.classList.remove('active'));
  qs(`.nav-item[data-page="${pageId}"]`)?.classList.add('active');
  $('pageTitle').textContent = titles[pageId] || pageId;
  if (pageId === 'dashboard') renderDashboard();
  else if (pageId === 'events') renderEvents();
  else if (pageId === 'analytics') renderAnalytics();
  else if (pageId === 'modules') renderModules();
  else if (pageId === 'settings') renderSettings();
  else if (pageId === 'license') renderLicense();
  else if (pageId === 'cameras') renderCameras();
  else if (pageId === 'live') renderLive();
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function updateNotificationsBadge() {
  const badge = $('notificationsBadge');
  if (!badge) return;
  const n = activeAlerts.length;
  badge.textContent = n;
  badge.style.display = n ? 'flex' : 'none';
  badge.setAttribute('aria-label', n ? `عدد التنبيهات الجديدة: ${n}` : '');
}

function renderAlertTray() {
  const tray = $('alertTray');
  if (!tray) return;
  const priorityAr = { critical: 'حرج', high: 'عالي', medium: 'متوسط', low: 'منخفض' };
  const cameraName = (id) => (config.cameras || []).find(c => c.id === id)?.name || id;
  tray.innerHTML = activeAlerts.slice(0, 5).map(a => `
    <div class="alert-card alert-priority-${a.priority}" data-event-id="${escapeAttr(a.id)}">
      <div class="alert-card-header"><span class="badge badge-${a.type === 'fire' ? 'fire' : a.type === 'smoke' ? 'smoke' : a.type === 'person' ? 'person' : 'theft'}">${eventTypeAr[a.type] || a.type}</span><span class="alert-priority">${priorityAr[a.priority] || a.priority}</span></div>
      <div class="alert-card-body">${escapeHtml(cameraName(a.camera_id))} · ${new Date(a.occurred_at).toLocaleString('ar-SA')}</div>
      <div class="alert-card-actions">
        <button type="button" class="btn btn-ghost btn-sm alert-btn-dismiss">إيقاف</button>
        <button type="button" class="btn btn-primary btn-sm alert-btn-details">التفاصيل</button>
      </div>
    </div>
  `).join('');
  tray.querySelectorAll('.alert-card').forEach(card => {
    const eventId = card.dataset.eventId;
    card.querySelector('.alert-btn-dismiss')?.addEventListener('click', () => dismissAlert(eventId));
    card.querySelector('.alert-btn-details')?.addEventListener('click', () => { openEventDetailPage(eventId); dismissAlert(eventId); });
  });
}

function renderNotificationsDropdown() {
  const dd = $('notificationsDropdown');
  if (!dd) return;
  if (activeAlerts.length === 0) {
    dd.innerHTML = '<div class="notifications-dropdown-empty">لا تنبيهات جديدة</div>';
    return;
  }
  const priorityAr = { critical: 'حرج', high: 'عالي', medium: 'متوسط', low: 'منخفض' };
  const cameraName = (id) => (config.cameras || []).find(c => c.id === id)?.name || id;
  dd.innerHTML = activeAlerts.map(a => `
    <div class="notifications-dropdown-item" data-event-id="${escapeAttr(a.id)}">
      <div><strong>${eventTypeAr[a.type] || a.type}</strong> · ${priorityAr[a.priority] || a.priority}</div>
      <div class="text-muted">${escapeHtml(cameraName(a.camera_id))} · ${new Date(a.occurred_at).toLocaleString('ar-SA')}</div>
      <div class="notifications-dropdown-item-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-action="dismiss">إيقاف</button>
        <button type="button" class="btn btn-primary btn-sm" data-action="details">التفاصيل</button>
      </div>
    </div>
  `).join('');
  dd.querySelectorAll('.notifications-dropdown-item').forEach(item => {
    const eventId = item.dataset.eventId;
    item.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => { dismissAlert(eventId); });
    item.querySelector('[data-action="details"]')?.addEventListener('click', () => { openEventDetailPage(eventId); const dd = $('notificationsDropdown'); if (dd) dd.style.display = 'none'; const b = $('notificationsBell'); if (b) b.setAttribute('aria-expanded', 'false'); });
  });
}

async function pollNewEvents() {
  try {
    const data = await api('/events?limit=8');
    const events = data.events || [];
    if (!firstAlertPollDone) {
      events.forEach(e => lastSeenEventIds.add(e.id));
      firstAlertPollDone = true;
      return;
    }
    const dismissed = getDismissedAlerts();
    for (const e of events) {
      if (dismissed.has(e.id)) continue;
      if (lastSeenEventIds.has(e.id)) continue;
      lastSeenEventIds.add(e.id);
      if (!activeAlerts.find(a => a.id === e.id)) {
        activeAlerts.unshift(e);
        if (activeAlerts.length > 20) activeAlerts.pop();
        renderAlertTray();
        updateNotificationsBadge();
        renderNotificationsDropdown();
      }
    }
  } catch (_) {}
}

const payloadLabelsAr = { confidence: 'مستوى الثقة', count: 'العدد', age_range: 'الفئة العمرية', gender: 'الجنس', model: 'النموذج', status: 'الحالة', last_error: 'آخر خطأ' };
const ageRangeAr = { child: 'طفل', teen: 'مراهق', adult: 'بالغ', senior: 'كبير سن' };
const genderAr = { male: 'ذكر', female: 'أنثى', unknown: 'غير محدد' };

function formatPayloadAsReadable(payload) {
  if (!payload || !Object.keys(payload).length) return '';
  const parts = [];
  for (const [k, v] of Object.entries(payload)) {
    const label = payloadLabelsAr[k] || k;
    let val = v;
    if (k === 'age_range') val = ageRangeAr[v] || v;
    else if (k === 'gender') val = genderAr[v] || v;
    parts.push(`<div class="payload-row"><span class="payload-key">${escapeHtml(label)}</span><span class="payload-val">${escapeHtml(String(val))}</span></div>`);
  }
  return parts.join('');
}

function buildEventDescription(ev) {
  const p = ev.payload || {};
  if (ev.type === 'person') {
    const n = p.count != null ? p.count : 1;
    const age = ageRangeAr[p.age_range] || p.age_range || '—';
    const g = genderAr[p.gender] || p.gender || '—';
    return `اكتشاف ${n} شخص/أشخاص. الفئة العمرية: ${age}، الجنس: ${g}.`;
  }
  if (ev.type === 'camera_status') return p.status === 'connected' ? 'تم استعادة الاتصال بالكاميرا.' : (p.last_error ? `انقطع الاتصال: ${p.last_error}` : 'انقطع الاتصال بالكاميرا.');
  if (ev.type === 'fire' || ev.type === 'smoke') return `تم رصد ${ev.type === 'fire' ? 'حريق أو لهب' : 'دخان'} في المشهد.`;
  if (ev.type === 'intrusion') return 'تم رصد تسلل أو دخول غير مصرح.';
  if (ev.type === 'loitering') return 'تم رصد تجمهر أو تواجد مشبوه.';
  return '';
}

function openEventDetailPage(eventId) {
  currentEventId = eventId;
  if (document.querySelector('.nav-item[data-page="events"]')) document.querySelector('.nav-item[data-page="events"]')?.classList.add('active');
  $('pageTitle').textContent = 'تفاصيل الحدث';
  const url = new URL(window.location.href);
  url.searchParams.set('event_id', eventId);
  window.history.pushState({ page: 'events', eventId }, '', url.toString());
  renderEventDetailPage();
}

function renderEventDetailPage() {
  if (!currentEventId) return;
  const el = $('pageContent');
  if (!el) return;
  el.innerHTML = '<div class="page-content"><div class="card"><p>جاري التحميل...</p></div></div>';
  api('/events/' + encodeURIComponent(currentEventId)).then(ev => {
    const priorityAr = { critical: 'حرج', high: 'عالي', medium: 'متوسط', low: 'منخفض' };
    const cameraName = (config.cameras || []).find(c => c.id === ev.camera_id)?.name || ev.camera_id;
    const badgeClass = ev.type === 'fire' ? 'fire' : ev.type === 'smoke' ? 'smoke' : ev.type === 'person' ? 'person' : (ev.type === 'intrusion' || ev.type === 'loitering') ? ev.type : 'theft';
    const desc = buildEventDescription(ev);
    const payloadHtml = ev.payload && Object.keys(ev.payload).length ? `<div class="event-detail-section"><h4>تفاصيل إضافية</h4><div class="payload-readable">${formatPayloadAsReadable(ev.payload)}</div></div>` : '';
    const imgHtml = ev.type === 'person' ? `<div class="event-detail-section"><h4>صورة الحدث</h4><div class="event-detail-img-wrap"><img id="eventDetailImg" src="${API}/events/${encodeURIComponent(ev.id)}/snapshot" alt="لقطة الحدث" onerror="this.style.display='none'"></div></div>` : '';
    el.innerHTML = `
      <div class="page-content" role="main" aria-labelledby="eventDetailHeading">
        <div class="event-detail-back"><button type="button" class="btn btn-ghost" id="eventDetailBack">← العودة إلى الأحداث</button></div>
        <div class="card event-detail-card" aria-labelledby="eventDetailHeading">
          <h2 id="eventDetailHeading" class="sr-only">تفاصيل الحدث: ${escapeHtml(eventTypeAr[ev.type] || ev.type)} — ${escapeHtml(cameraName)}</h2>
          <div class="event-detail-header">
            <span class="badge badge-${badgeClass}">${eventTypeAr[ev.type] || ev.type}</span>
            <span class="priority-${ev.priority}">${priorityAr[ev.priority] || ev.priority}</span>
          </div>
          <dl class="event-detail-dl">
            <dt>الكاميرا</dt><dd>${escapeHtml(cameraName)}</dd>
            <dt>الوقت</dt><dd>${new Date(ev.occurred_at).toLocaleString('ar-SA')}</dd>
            <dt>درجة المخاطر</dt><dd>${ev.risk_score != null ? Math.round(ev.risk_score) : '-'}</dd>
          </dl>
          ${desc ? `<div class="event-detail-description">${escapeHtml(desc)}</div>` : ''}
          ${imgHtml}
          ${payloadHtml}
          <div class="modal-actions" style="margin-top:20px">
            <button type="button" class="btn btn-secondary" id="eventDetailDismiss">إيقاف التنبيه</button>
          </div>
        </div>
      </div>`;
    $('eventDetailBack').onclick = () => { currentEventId = null; const u = new URL(window.location.href); u.searchParams.delete('event_id'); window.history.replaceState({}, '', u.toString()); $('pageTitle').textContent = titles.events; renderEvents(); };
    $('eventDetailDismiss').onclick = () => { dismissAlert(ev.id); toast('تم إيقاف التنبيه.', 'success'); };
    $('eventDetailBack').focus();
  }).catch(() => {
    currentEventId = null;
    const u = new URL(window.location.href);
    u.searchParams.delete('event_id');
    window.history.replaceState({}, '', u.toString());
    el.innerHTML = '<div class="page-content"><div class="card"><p>تعذر تحميل الحدث. قد يكون الحدث محذوفاً أو الرابط غير صحيح.</p><button type="button" class="btn btn-ghost" id="eventDetailBack2">← العودة إلى الأحداث</button></div></div>';
    $('eventDetailBack2').onclick = () => { $('pageTitle').textContent = titles.events; renderEvents(); };
    setTimeout(() => $('eventDetailBack2')?.focus(), 0);
  });
}

const eventTypeAr = { fire: 'حريق', smoke: 'دخان', intrusion: 'تسلل', loitering: 'تجمهر', anti_theft: 'سرقة', person: 'أشخاص', camera_status: 'حالة الكاميرا' };

function renderDashboard() {
  const lic = license.within_trial
    ? (license.trial_ends_at ? 'تجربة حتى ' + new Date(license.trial_ends_at).toLocaleDateString('ar-SA') : '14 يوم')
    : (license.expires_at ? 'تنتهي ' + new Date(license.expires_at).toLocaleDateString('ar-SA') : 'نشط');
  $('pageContent').innerHTML = `
    <div class="page-content">
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-icon">📷</div>
          <div class="stat-value">${config.cameras.length}</div>
          <div class="stat-label">الكاميرات</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">${config.armed ? '🔒' : '🔓'}</div>
          <div class="stat-value">${config.armed ? 'مُفعّل' : 'غير مُفعّل'}</div>
          <div class="stat-label">حالة النظام</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🔑</div>
          <div class="stat-value">${lic}</div>
          <div class="stat-label">الترخيص</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">أحدث الأحداث</div>
        <div class="card-subtitle">آخر اكتشافات وحدات الذكاء الاصطناعي</div>
        <div class="table-wrap">
          <table aria-label="أحدث الأحداث">
            <thead><tr><th scope="col">النوع</th><th scope="col">الأولوية</th><th scope="col">الكاميرا</th><th scope="col">الوقت</th></tr></thead>
            <tbody id="dashboardEvents"></tbody>
          </table>
        </div>
        <div id="dashboardEventsEmpty" class="empty-state" style="display:none"><span class="icon">🔔</span><p>لا أحداث بعد</p></div>
      </div>
    </div>`;
  loadDashboardEvents();
}

async function loadDashboardEvents() {
  try {
    const data = await api('/events?limit=10');
    const tbody = $('dashboardEvents');
    const empty = $('dashboardEventsEmpty');
    if (!data.events || data.events.length === 0) {
      if (tbody) tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    const badgeClass = (t) => t === 'fire' ? 'fire' : t === 'smoke' ? 'smoke' : (t === 'intrusion' || t === 'loitering') ? t : t === 'camera_status' ? 'camera_status' : t === 'person' ? 'person' : 'theft';
    const priorityAr = { critical: 'حرج', high: 'عالي', medium: 'متوسط', low: 'منخفض' };
    tbody.innerHTML = data.events.map(e => `
      <tr class="event-row" data-event-id="${escapeAttr(e.id)}" role="button" tabindex="0" title="انقر للتفاصيل">
        <td><span class="badge badge-${badgeClass(e.type)}">${escapeHtml(eventTypeAr[e.type] || e.type)}</span></td>
        <td class="priority-${e.priority}">${escapeHtml(priorityAr[e.priority] || e.priority)}</td>
        <td>${escapeHtml(e.camera_id || '-')}</td>
        <td>${new Date(e.occurred_at).toLocaleString('ar-SA')}</td>
      </tr>
    `).join('');
    tbody.querySelectorAll('.event-row').forEach(row => {
      row.addEventListener('click', () => openEventDetailPage(row.dataset.eventId));
      row.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEventDetailPage(row.dataset.eventId); } });
    });
  } catch (err) {
    const empty = $('dashboardEventsEmpty');
    if (empty) {
      empty.innerHTML = `<span class="icon">⚠️</span><p>${escapeHtml(err.message)}</p>`;
      empty.style.display = 'block';
    }
    if ($('dashboardEvents')) $('dashboardEvents').innerHTML = '';
  }
}

function renderCameras() {
  $('pageContent').innerHTML = `
    <div class="page-content">
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">
        <div>
          <div class="card-title" style="margin:0">الكاميرات ووحدات الذكاء الاصطناعي</div>
          <div class="card-subtitle">حريق، دخان، منع السرقة. التجربة تبدأ بكاميرتين.</div>
        </div>
        <button type="button" class="btn btn-primary" id="addCameraBtn">+ إضافة كاميرا</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table aria-label="قائمة الكاميرات">
            <thead><tr><th scope="col">الاسم</th><th scope="col">الوحدات</th><th scope="col">الحساسية</th><th scope="col">الاتصال</th><th scope="col">الحالة</th><th scope="col">إجراءات</th></tr></thead>
            <tbody id="camerasTable"></tbody>
          </table>
        </div>
        <div id="camerasEmpty" class="empty-state"><span class="icon">📷</span><p>لا توجد كاميرات. أضف واحدة للبدء.</p></div>
      </div>
    </div>`;
  fillCamerasTable();
  $('addCameraBtn').onclick = () => openCameraModal();
  loadCameraStatus();
  if (camerasStatusInterval) clearInterval(camerasStatusInterval);
  camerasStatusInterval = setInterval(loadCameraStatus, 10000);
}

function fillCamerasTable() {
  const tbody = $('camerasTable');
  const empty = $('camerasEmpty');
  if (!config.cameras || config.cameras.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  const modAr = { fire: 'حريق', smoke: 'دخان', anti_theft: 'منع السرقة', person: 'أشخاص' };
  const connLabel = (c) => {
    const s = cameraStatus[c.id];
    if (!s) return '<span style="color:var(--text-muted)">—</span>';
    return s.connected ? '<span style="color:var(--success)">متصل</span>' : '<span style="color:var(--danger)">غير متصل</span>';
  };
  tbody.innerHTML = config.cameras.map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${(c.modules || ['fire']).map(m => `<span class="badge badge-${m === 'fire' ? 'fire' : m === 'smoke' ? 'smoke' : 'theft'}">${modAr[m] || m}</span>`).join(' ')}</td>
      <td>${Math.round((c.sensitivity || 0.7) * 100)}%</td>
      <td>${connLabel(c)}</td>
      <td>${c.enabled !== false ? 'تشغيل' : 'إيقاف'}</td>
      <td>
        <button type="button" class="btn btn-secondary" style="padding:6px 12px;font-size:0.8rem" data-edit="${c.id}">تعديل</button>
        <button type="button" class="btn btn-danger" style="padding:6px 12px;font-size:0.8rem" data-delete="${c.id}">حذف</button>
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openCameraModal(b.dataset.edit));
  tbody.querySelectorAll('[data-delete]').forEach(b => b.onclick = () => deleteCamera(b.dataset.delete));
}

async function loadCameraStatus() {
  try {
    const data = await api('/cameras/status');
    cameraStatus = data.status || {};
    if ($('camerasTable')) fillCamerasTable();
  } catch (_) {
    cameraStatus = {};
  }
}

function openCameraModal(editId = null) {
  const cam = editId ? config.cameras.find(c => c.id === editId) : null;
  const modulesList = ['fire', 'smoke', 'anti_theft', 'person'];
  const modLabels = { fire: 'حريق', smoke: 'دخان', anti_theft: 'منع السرقة', person: 'أشخاص (عدّ وعمر ونوع)' };
  const div = document.createElement('div');
  div.className = 'modal-overlay';
  div.innerHTML = `
    <div class="modal">
      <h2>${cam ? 'تعديل الكاميرا' : 'إضافة كاميرا'}</h2>
      <form id="cameraForm">
        <div class="form-group">
          <label>الاسم</label>
          <input type="text" name="name" value="${cam ? cam.name : ''}" placeholder="مثال: المدخل" required>
        </div>
        <div class="form-group">
          <label>رابط RTSP</label>
          <input type="text" name="rtsp_url" value="${cam ? cam.rtsp_url : ''}" placeholder="rtsp://user:pass@ip:554/stream" required>
        </div>
        <div class="form-group">
          <label>وحدات الذكاء الاصطناعي</label>
          <div class="modules-checkboxes">
            ${modulesList.map(m => `
              <label><input type="checkbox" name="modules" value="${m}" ${(cam ? cam.modules : ['fire']).includes(m) ? 'checked' : ''}> ${modLabels[m]}</label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>الحساسية (0–100%)</label>
          <input type="number" name="sensitivity" min="10" max="100" value="${cam ? Math.round((cam.sensitivity || 0.7) * 100) : 70}">
        </div>
        <div class="form-group">
          <label>معدل أخذ العينات (FPS)</label>
          <input type="number" name="fps_sample" min="1" max="10" value="${cam ? (cam.fps_sample || 2) : 2}">
        </div>
        ${cam ? `<div class="form-group"><label><input type="checkbox" name="enabled" ${cam.enabled !== false ? 'checked' : ''}> مفعّلة</label></div>` : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-cancel>إلغاء</button>
          <button type="submit" class="btn btn-primary">${cam ? 'حفظ' : 'إضافة'}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(div);
  div.querySelector('[data-cancel]').onclick = () => div.remove();
  div.querySelector('#cameraForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const modules = fd.getAll('modules').length ? fd.getAll('modules') : ['fire'];
    const sensitivity = (Number(fd.get('sensitivity')) || 70) / 100;
    const fps_sample = Number(fd.get('fps_sample')) || 2;
    try {
      if (cam) {
        await api(`/cameras/${cam.id}`, { method: 'PUT', body: JSON.stringify({ name: fd.get('name'), rtsp_url: fd.get('rtsp_url'), modules, sensitivity, fps_sample, enabled: fd.get('enabled') === 'on' }) });
      } else {
        await api('/cameras', { method: 'POST', body: JSON.stringify({ name: fd.get('name'), rtsp_url: fd.get('rtsp_url'), modules, sensitivity, fps_sample, enabled: true }) });
      }
      await loadConfig();
      fillCamerasTable();
      div.remove();
      toast(cam ? 'تم تحديث الكاميرا.' : 'تمت إضافة الكاميرا.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

async function deleteCamera(id) {
  if (!confirm('حذف هذه الكاميرا؟')) return;
  try {
    await api(`/cameras/${id}`, { method: 'DELETE' });
    await loadConfig();
    fillCamerasTable();
    toast('تم حذف الكاميرا.', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

const LIVE_PLACEHOLDER_SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect fill="%23111827" width="320" height="180"/><text x="160" y="85" fill="%2394a3b8" font-size="16" text-anchor="middle" font-family="sans-serif">لا بث</text><text x="160" y="105" fill="%2364748b" font-size="12" text-anchor="middle" font-family="sans-serif">أضف كاميرا RTSP أو فعّل الأحداث التجريبية</text></svg>');

let liveRefreshSec = 2;
let liveZoom = 100;
let liveObjectURLs = [];

function renderLive() {
  const cameras = config.cameras || [];
  const list = cameras.filter(c => c.enabled !== false);
  if (liveInterval) { clearInterval(liveInterval); liveInterval = null; }
  liveObjectURLs.forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} });
  liveObjectURLs = [];
  $('pageContent').innerHTML = `
    <div class="page-content">
      <div class="card">
        <div class="card-title">البث المباشر</div>
        <div class="card-subtitle">تحديث تلقائي للصورة من كل كاميرا. اختر فترة التحديث والتكبير. للكاميرات الحقيقية (RTSP) تظهر الصورة الفعلية.</div>
        <div class="live-controls">
          <div class="form-group">
            <label>تحديث الصورة كل (ثانية)</label>
            <select id="liveRefreshSelect">
              <option value="1" ${liveRefreshSec === 1 ? 'selected' : ''}>1</option>
              <option value="2" ${liveRefreshSec === 2 ? 'selected' : ''}>2</option>
              <option value="3" ${liveRefreshSec === 3 ? 'selected' : ''}>3</option>
              <option value="5" ${liveRefreshSec === 5 ? 'selected' : ''}>5</option>
            </select>
          </div>
          <div class="form-group">
            <label>تكبير العرض</label>
            <select id="liveZoomSelect">
              <option value="75" ${liveZoom === 75 ? 'selected' : ''}>75%</option>
              <option value="100" ${liveZoom === 100 ? 'selected' : ''}>100%</option>
              <option value="125" ${liveZoom === 125 ? 'selected' : ''}>125%</option>
              <option value="150" ${liveZoom === 150 ? 'selected' : ''}>150%</option>
            </select>
          </div>
          <div class="form-group">
            <label>آخر تحديث</label>
            <span id="liveLastUpdate" class="live-meta">—</span>
          </div>
        </div>
        <div id="liveGrid" class="live-grid"></div>
        <div id="liveEmpty" class="empty-state" style="display:${list.length ? 'none' : 'block'}"><span class="icon">📺</span><p>لا توجد كاميرات مفعّلة. أضف كاميرا من قسم الكاميرات.</p></div>
      </div>
    </div>`;
  const grid = $('liveGrid');
  if (!grid || !list.length) return;

  function updateOneCamera(card, cameraId, cameraName) {
    const img = card.querySelector('.live-img');
    if (!img) return;
    if (img.src && img.src.startsWith('blob:')) {
      try { URL.revokeObjectURL(img.src); } catch (_) {}
      const i = liveObjectURLs.indexOf(img.src);
      if (i !== -1) liveObjectURLs.splice(i, 1);
    }
    const url = API + '/cameras/' + encodeURIComponent(cameraId) + '/snapshot?t=' + Date.now();
    fetch(url, { credentials: 'same-origin' })
      .then(r => r.ok ? r.blob() : Promise.reject(new Error(r.status)))
      .then(blob => {
        if (blob.size >= 500) {
          const u = URL.createObjectURL(blob);
          liveObjectURLs.push(u);
          img.src = u;
          img.alt = cameraName;
        } else {
          img.src = LIVE_PLACEHOLDER_SVG;
          img.alt = 'لا بث';
        }
        const lu = $('liveLastUpdate');
        if (lu) lu.textContent = new Date().toLocaleTimeString('ar-SA');
      })
      .catch(() => {
        img.src = LIVE_PLACEHOLDER_SVG;
        img.alt = 'لا بث أو خطأ اتصال';
      });
  }

  function refreshAll() {
    if (!grid) return;
    grid.querySelectorAll('.live-card').forEach(card => {
      const cid = card.dataset.cameraId;
      const cname = card.dataset.cameraName || cid;
      updateOneCamera(card, cid, cname);
    });
  }

  grid.innerHTML = list.map(c => `
    <div class="live-card" data-camera-id="${c.id}" data-camera-name="${escapeAttr(c.name || c.id)}">
      <div class="live-card-inner" style="transform:scale(${liveZoom / 100})">
        <div class="live-card-title">${escapeHtml(c.name || c.id)}</div>
        <img class="live-img" src="${LIVE_PLACEHOLDER_SVG}" alt="جاري التحميل..." style="width:100%;aspect-ratio:16/10;object-fit:contain;background:var(--bg-primary);display:block">
      </div>
    </div>`).join('');

  refreshAll();
  liveInterval = setInterval(refreshAll, liveRefreshSec * 1000);

  $('liveRefreshSelect').onchange = function () {
    liveRefreshSec = Number(this.value) || 2;
    if (liveInterval) clearInterval(liveInterval);
    liveInterval = setInterval(refreshAll, liveRefreshSec * 1000);
  };
  $('liveZoomSelect').onchange = function () {
    liveZoom = Number(this.value) || 100;
    grid.querySelectorAll('.live-card-inner').forEach(inner => { inner.style.transform = 'scale(' + (liveZoom / 100) + ')'; inner.style.transformOrigin = 'center center'; });
  };
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

async function loadCustomSounds() {
  const ids = ['soundFireSelect', 'soundTheftSelect', 'soundPersonSelect'];
  const keys = ['sound_fire_smoke', 'sound_theft', 'sound_person'];
  try {
    const data = await api('/sounds');
    const list = data.sounds || [];
    const hw = config.hardware || {};
    ids.forEach((id, i) => {
      const sel = $(id);
      if (!sel) return;
      const currentVal = hw[keys[i]] || (i === 0 ? 'preset1' : 'preset1');
      while (sel.options.length > 8) sel.remove(8);
      list.forEach(f => {
        const opt = document.createElement('option');
        opt.value = 'custom:' + f;
        opt.textContent = 'مخصص: ' + f;
        if (currentVal === 'custom:' + f) opt.selected = true;
        sel.appendChild(opt);
      });
      if (currentVal && currentVal.startsWith('custom:') && list.some(f => currentVal === 'custom:' + f)) sel.value = currentVal;
    });
  } catch (_) {}
}

function renderEvents() {
  const eventIdFromUrl = new URLSearchParams(window.location.search).get('event_id');
  if (eventIdFromUrl) {
    currentEventId = eventIdFromUrl;
    openEventDetailPage(currentEventId);
    return;
  }
  if (currentEventId) {
    renderEventDetailPage();
    return;
  }
  $('pageContent').innerHTML = `
    <div class="page-content">
      <div class="card">
        <div class="card-title">سجل الأحداث</div>
        <div class="card-subtitle">انقر على أي حدث لفتح صفحة التفاصيل مع الصورة والوصف</div>
        <div class="form-group" style="max-width:220px;margin-bottom:16px">
          <label>تصفية حسب النوع</label>
          <select id="eventsTypeFilter">
            <option value="">الكل</option>
            <option value="fire">حريق</option>
            <option value="smoke">دخان</option>
            <option value="intrusion">تسلل</option>
            <option value="loitering">تجمهر</option>
            <option value="person">أشخاص</option>
            <option value="camera_status">حالة الكاميرا (اتصال/فصل)</option>
          </select>
        </div>
        <div class="table-wrap">
          <table aria-label="سجل الأحداث">
            <thead><tr><th scope="col">النوع</th><th scope="col">الأولوية</th><th scope="col">المخاطر</th><th scope="col">الكاميرا</th><th scope="col">الوقت</th><th scope="col">مُزامَن</th></tr></thead>
            <tbody id="eventsTable"></tbody>
          </table>
        </div>
        <div id="eventsEmpty" class="empty-state"><span class="icon">🔔</span><p>لا أحداث</p></div>
      </div>
    </div>`;
  loadEventsTable();
  $('eventsTypeFilter').onchange = loadEventsTable;
}

async function loadEventsTable() {
  const type = $('eventsTypeFilter')?.value || '';
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), 15000);
  try {
    const data = await api('/events?limit=50' + (type ? '&type=' + encodeURIComponent(type) : ''), { signal: ac.signal });
    clearTimeout(timeoutId);
    const tbody = $('eventsTable');
    const empty = $('eventsEmpty');
    if (!data.events || data.events.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    const badgeClass = (t) => t === 'fire' ? 'fire' : t === 'smoke' ? 'smoke' : (t === 'intrusion' || t === 'loitering') ? t : t === 'camera_status' ? 'camera_status' : t === 'person' ? 'person' : 'theft';
    const priorityAr = { critical: 'حرج', high: 'عالي', medium: 'متوسط', low: 'منخفض' };
    tbody.innerHTML = data.events.map(e => `
      <tr class="event-row" data-event-id="${escapeAttr(e.id)}" role="button" tabindex="0" title="انقر للتفاصيل">
        <td><span class="badge badge-${badgeClass(e.type)}">${eventTypeAr[e.type] || e.type}</span></td>
        <td class="priority-${e.priority}">${priorityAr[e.priority] || e.priority}</td>
        <td>${e.risk_score != null ? Math.round(e.risk_score) : '-'}</td>
        <td>${e.camera_id || '-'}</td>
        <td>${new Date(e.occurred_at).toLocaleString('ar-SA')}</td>
        <td>${e.synced_at ? 'نعم' : 'لا'}</td>
      </tr>
    `).join('');
    tbody.querySelectorAll('.event-row').forEach(row => {
      row.addEventListener('click', () => openEventDetailPage(row.dataset.eventId));
      row.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEventDetailPage(row.dataset.eventId); } });
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const empty = $('eventsEmpty');
    const tbody = $('eventsTable');
    if (tbody) tbody.innerHTML = '';
    if (empty) {
      empty.innerHTML = `<span class="icon">⚠️</span><p>${escapeHtml(err.name === 'AbortError' ? 'انتهت مهلة الطلب. جرّب تحديث الصفحة.' : err.message)}</p>`;
      empty.style.display = 'block';
    }
  }
}

let analyticsCharts = [];

function renderAnalytics() {
  const cameras = config.cameras || [];
  $('pageContent').innerHTML = `
    <div class="page-content">
      <div class="card">
        <div class="card-title">تحليلات الأشخاص</div>
        <div class="card-subtitle">إحصائيات حسب العدد والعمر والجنس مع فلترة ذكية</div>
        <div class="analytics-filters">
          <div class="form-group">
            <label>الكاميرا</label>
            <select id="analyticsCamera">
              <option value="">الكل</option>
              ${cameras.map(c => `<option value="${c.id}">${(c.name || c.id)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>الفئة العمرية</label>
            <select id="analyticsAge">
              <option value="">الكل</option>
              <option value="child">طفل</option>
              <option value="teen">مراهق</option>
              <option value="adult">بالغ</option>
              <option value="senior">كبير سن</option>
            </select>
          </div>
          <div class="form-group">
            <label>الجنس</label>
            <select id="analyticsGender">
              <option value="">الكل</option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
              <option value="unknown">غير محدد</option>
            </select>
          </div>
          <div class="form-group">
            <label>من تاريخ</label>
            <input type="date" id="analyticsDateFrom" title="اختياري">
          </div>
          <div class="form-group">
            <label>إلى تاريخ</label>
            <input type="date" id="analyticsDateTo" title="اختياري">
          </div>
          <button type="button" class="btn btn-primary" id="analyticsApply">تطبيق الفلترة</button>
        </div>
        <div id="analyticsSummary" class="analytics-summary"></div>
        <div class="analytics-charts">
          <div class="chart-wrap" style="height:260px;position:relative"><canvas id="chartCount"></canvas></div>
          <div class="chart-wrap" style="height:260px;position:relative"><canvas id="chartAge"></canvas></div>
          <div class="chart-wrap" style="height:260px;position:relative"><canvas id="chartGender"></canvas></div>
        </div>
        <div id="analyticsChartsFallback" style="display:none;margin-top:16px;padding:16px;background:var(--bg-glass);border-radius:var(--radius-sm);color:var(--text-muted)"></div>
        <div id="analyticsEmpty" class="empty-state" style="display:none"><span class="icon">📊</span><p>لا توجد بيانات أشخاص. فعّل موديول "أشخاص" و"أحداث تجريبية" من ضبط الموديولات ثم انتظر الأحداث.</p></div>
        <hr style="margin:28px 0;border:0;border-top:1px solid var(--border)">
        <div class="card-title" style="margin-bottom:12px">بحث صور الأشخاص المُكتشفين</div>
        <div class="card-subtitle" style="margin-bottom:16px">لقطات تُحفظ تلقائياً عند اكتشاف شخص (حد أقصى 20 جيجا، الأقدم يُستبدل)</div>
        <div class="analytics-filters" style="margin-bottom:16px">
          <div class="form-group">
            <label>الكاميرا</label>
            <select id="snapshotsCamera">
              <option value="">الكل</option>
              ${cameras.map(c => `<option value="${c.id}">${escapeHtml(c.name || c.id)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>من تاريخ</label>
            <input type="date" id="snapshotsDateFrom">
          </div>
          <div class="form-group">
            <label>إلى تاريخ</label>
            <input type="date" id="snapshotsDateTo">
          </div>
          <button type="button" class="btn btn-primary" id="snapshotsSearchBtn">بحث</button>
        </div>
        <div id="personSnapshotsGrid" class="person-snapshots-grid"></div>
        <div id="personSnapshotsEmpty" class="empty-state" style="display:none"><span class="icon">🖼️</span><p>لا توجد لقطات أشخاص. تأكد من كاميرا متصلة وموديول أشخاص مفعّل.</p></div>
      </div>
    </div>`;
  analyticsCharts.forEach(ch => { if (ch) ch.destroy(); });
  analyticsCharts = [];
  $('analyticsApply').onclick = () => loadAnalyticsData();
  $('snapshotsSearchBtn').onclick = () => loadPersonSnapshots();
  loadPersonSnapshots();
  setTimeout(function () { loadAnalyticsData(); }, 150);
}

async function loadPersonSnapshots() {
  const cameraId = $('snapshotsCamera')?.value || '';
  const fromDate = $('snapshotsDateFrom')?.value || '';
  const toDate = $('snapshotsDateTo')?.value || '';
  const grid = $('personSnapshotsGrid');
  const emptyEl = $('personSnapshotsEmpty');
  if (!grid) return;
  const cameraNames = {};
  (config.cameras || []).forEach(c => { cameraNames[c.id] = c.name || c.id; });
  try {
    let path = '/person-snapshots?limit=50';
    if (cameraId) path += '&camera_id=' + encodeURIComponent(cameraId);
    if (fromDate) path += '&from_date=' + encodeURIComponent(fromDate);
    if (toDate) path += '&to_date=' + encodeURIComponent(toDate);
    const data = await api(path);
    const list = data.snapshots || [];
    if (list.length) {
      if (emptyEl) emptyEl.style.display = 'none';
      grid.innerHTML = list.map(s => `
        <div class="person-snapshot-card" data-event-id="${escapeAttr(s.event_id)}">
          <img src="${API}/person-snapshots/${s.id}/image" alt="" loading="lazy" onerror="this.onerror=null;this.src='${LIVE_PLACEHOLDER_SVG}'">
          <div class="person-snapshot-info">${escapeHtml(cameraNames[s.camera_id] || s.camera_id)} · ${new Date(s.occurred_at).toLocaleString('ar-SA')}</div>
        </div>
      `).join('');
      grid.querySelectorAll('.person-snapshot-card').forEach(card => {
        const eid = card.dataset.eventId;
        if (eid) card.addEventListener('click', () => openEventDetailPage(eid));
      });
      return;
    }
    const eventsRes = await api('/events?limit=30&type=person');
    const events = (eventsRes.events || []).filter(e => !cameraId || e.camera_id === cameraId);
    if (events.length) {
      if (emptyEl) emptyEl.style.display = 'none';
      grid.innerHTML = events.map(e => `
        <div class="person-snapshot-card" data-event-id="${escapeAttr(e.id)}" role="button" tabindex="0" title="انقر للتفاصيل">
          <img src="${API}/events/${encodeURIComponent(e.id)}/snapshot" alt="" loading="lazy" onerror="this.onerror=null;this.src='${LIVE_PLACEHOLDER_SVG}'">
          <div class="person-snapshot-info">${escapeHtml(cameraNames[e.camera_id] || e.camera_id)} · ${new Date(e.occurred_at).toLocaleString('ar-SA')}</div>
        </div>
      `).join('');
      grid.querySelectorAll('.person-snapshot-card').forEach(card => {
        card.addEventListener('click', () => openEventDetailPage(card.dataset.eventId));
        card.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEventDetailPage(card.dataset.eventId); } });
      });
      return;
    }
    grid.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
  } catch (err) {
    grid.innerHTML = '';
    if (emptyEl) { emptyEl.innerHTML = '<span class="icon">⚠️</span><p>' + escapeHtml(err.message) + '</p>'; emptyEl.style.display = 'block'; }
  }
}

function renderAnalyticsCharts(countBuckets, ageBuckets, genderBuckets) {
  analyticsCharts.forEach(ch => { try { if (ch) ch.destroy(); } catch (_) {} });
  analyticsCharts = [];
  const ChartLib = typeof window !== 'undefined' && window.Chart;
  const fallbackEl = $('analyticsChartsFallback');
  if (fallbackEl) fallbackEl.style.display = 'none';
  if (!ChartLib) {
    if (fallbackEl) { fallbackEl.textContent = 'لم تُحمّل مكتبة الرسوم (Chart.js). تحقق من اتصال الشبكة وأعد تحميل الصفحة.'; fallbackEl.style.display = 'block'; }
    return;
  }
  const countLabels = Object.keys(countBuckets).sort((a, b) => Number(a) - Number(b));
  const ageLabels = Object.keys(ageBuckets);
  const genderLabels = Object.keys(genderBuckets);
  const hasCount = countLabels.length > 0;
  const hasAge = ageLabels.length > 0;
  const hasGender = genderLabels.length > 0;
  const opts = { responsive: true, maintainAspectRatio: true };
  try {
    const el = $('chartCount');
    if (el) {
      const labels = hasCount ? countLabels.map(k => k + ' أشخاص') : ['لا بيانات'];
      const data = hasCount ? countLabels.map(k => countBuckets[k]) : [0];
      analyticsCharts.push(new ChartLib(el, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'عدد المرات', data, backgroundColor: 'rgba(59, 130, 246, 0.7)', borderColor: 'rgb(59, 130, 246)', borderWidth: 1 }] },
        options: { ...opts, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      }));
    }
  } catch (e) { if (fallbackEl) { fallbackEl.textContent = 'خطأ في رسم «العدد»: ' + e.message; fallbackEl.style.display = 'block'; } }
  try {
    const el = $('chartAge');
    if (el) {
      const labels = hasAge ? ageLabels.map(k => ageRangeAr[k] || k) : ['لا بيانات'];
      const data = hasAge ? ageLabels.map(k => ageBuckets[k]) : [1];
      analyticsCharts.push(new ChartLib(el, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'], borderWidth: 1 }] },
        options: { ...opts, plugins: { legend: { position: 'bottom' } } }
      }));
    }
  } catch (e) { if (fallbackEl && !fallbackEl.textContent) { fallbackEl.textContent = 'خطأ في رسم «العمر»: ' + e.message; fallbackEl.style.display = 'block'; } }
  try {
    const el = $('chartGender');
    if (el) {
      const labels = hasGender ? genderLabels.map(k => genderAr[k] || k) : ['لا بيانات'];
      const data = hasGender ? genderLabels.map(k => genderBuckets[k]) : [1];
      analyticsCharts.push(new ChartLib(el, {
        type: 'pie',
        data: { labels, datasets: [{ data, backgroundColor: ['#06b6d4', '#ec4899', '#64748b'], borderWidth: 1 }] },
        options: { ...opts, plugins: { legend: { position: 'bottom' } } }
      }));
    }
  } catch (e) { if (fallbackEl && !fallbackEl.textContent) { fallbackEl.textContent = 'خطأ في رسم «الجنس»: ' + e.message; fallbackEl.style.display = 'block'; } }
}

async function loadAnalyticsData() {
  const cameraId = $('analyticsCamera')?.value || '';
  const ageFilter = $('analyticsAge')?.value || '';
  const genderFilter = $('analyticsGender')?.value || '';
  const dateFrom = $('analyticsDateFrom')?.value || '';
  const dateTo = $('analyticsDateTo')?.value || '';
  const summaryEl = $('analyticsSummary');
  const emptyEl = $('analyticsEmpty');
  try {
    const data = await api('/events?limit=500&type=person&include_payload=1');
    let events = (data.events || []).filter(e => {
      if (cameraId && e.camera_id !== cameraId) return false;
      const p = e.payload || {};
      if (ageFilter && (p.age_range || '') !== ageFilter) return false;
      if (genderFilter && (p.gender || '') !== genderFilter) return false;
      if (dateFrom || dateTo) {
        const d = new Date(e.occurred_at);
        if (dateFrom && d < new Date(dateFrom + 'T00:00:00')) return false;
        if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false;
      }
      return true;
    });
    const totalDetections = events.reduce((s, e) => s + (e.payload?.count || 1), 0);
    if (summaryEl) summaryEl.innerHTML = `<div class="stat-card"><div class="stat-label">عدد الأحداث</div><div class="stat-value">${events.length}</div></div><div class="stat-card"><div class="stat-label">إجمالي الأشخاص المُكتشفين</div><div class="stat-value">${totalDetections}</div></div>`;
    if (emptyEl) emptyEl.style.display = events.length ? 'none' : 'block';

    const countBuckets = {};
    const ageBuckets = {};
    const genderBuckets = {};
    events.forEach(e => {
      const p = e.payload || {};
      const c = p.count || 1;
      countBuckets[c] = (countBuckets[c] || 0) + 1;
      const age = p.age_range || 'unknown';
      ageBuckets[age] = (ageBuckets[age] || 0) + 1;
      const g = p.gender || 'unknown';
      genderBuckets[g] = (genderBuckets[g] || 0) + 1;
    });
    renderAnalyticsCharts(countBuckets, ageBuckets, genderBuckets);
  } catch (err) {
    if (summaryEl) summaryEl.innerHTML = '<div class="stat-card"><div class="stat-label">عدد الأحداث</div><div class="stat-value">—</div></div>';
    if (emptyEl) { emptyEl.innerHTML = `<span class="icon">⚠️</span><p>${escapeHtml(err.message)}</p>`; emptyEl.style.display = 'block'; }
    renderAnalyticsCharts({}, {}, {});
  }
}

function renderModules() {
  const sys = config.system_settings || {};
  const adv = sys.advanced || {};
  const ai = adv.ai_modules || {};
  const fire = ai.fire_smoke || {};
  const theft = ai.anti_theft || {};
  const personMod = ai.person || {};
  const tw0 = (theft.time_windows && theft.time_windows[0]) ? theft.time_windows[0] : {};
  const mockEnabled = adv.mock_events_enabled === true;
  const eventTypes = theft.event_types || ['intrusion', 'loitering'];
  $('pageContent').innerHTML = `
    <div class="page-content modules-page">
      <div class="card modules-intro">
        <div class="card-title">ضبط الموديولات</div>
        <div class="card-subtitle">ضبط تفاصيل تشغيل كل موديول: التفعيل، الحساسية، الجدولة، والإعدادات الخاصة. التغييرات تُطبّق تلقائياً في النظام.</div>
      </div>
      <div class="card module-card">
        <div class="module-card-header">
          <span class="module-icon">🧪</span>
          <div>
            <div class="module-name">أحداث تجريبية (وهمية)</div>
            <div class="module-desc">تفعيلها يولد أحداثاً تجريبية (حريق، دخان، تسلل، أشخاص) لأغراض الاختبار فقط. في التشغيل الفعلي يجب إيقافها لتفادي تنبيهات وهمية.</div>
          </div>
        </div>
        <form id="moduleMockForm" class="module-form">
          <div class="form-group">
            <label><input type="checkbox" name="mock_events_enabled" ${mockEnabled ? 'checked' : ''}> تفعيل الأحداث التجريبية</label>
          </div>
          <div class="modal-actions"><button type="submit" class="btn btn-primary">حفظ</button></div>
        </form>
      </div>
      <div class="card module-card" data-module="fire_smoke">
        <div class="module-card-header">
          <span class="module-icon">🔥</span>
          <div>
            <div class="module-name">حريق ودخان</div>
            <div class="module-desc">${fire.description || 'كشف لهب ودخان وشرر'}</div>
          </div>
        </div>
        <form id="moduleFireForm" class="module-form">
          <div class="form-group">
            <label><input type="checkbox" name="enabled" ${fire.enabled !== false ? 'checked' : ''}> تفعيل الموديول</label>
          </div>
          <div class="form-group">
            <label>الحساسية الافتراضية (0.1–1)</label>
            <input type="number" name="sensitivity" min="0.1" max="1" step="0.1" value="${fire.sensitivity ?? 0.7}">
          </div>
          <div class="modal-actions"><button type="submit" class="btn btn-primary">حفظ</button></div>
        </form>
      </div>
      <div class="card module-card" data-module="anti_theft">
        <div class="module-card-header">
          <span class="module-icon">🚨</span>
          <div>
            <div class="module-name">منع السرقة</div>
            <div class="module-desc">${theft.description || 'تسلل، تجمهر، عبث'}</div>
          </div>
        </div>
        <form id="moduleTheftForm" class="module-form">
          <div class="form-group">
            <label><input type="checkbox" name="enabled" ${theft.enabled !== false ? 'checked' : ''}> تفعيل الموديول</label>
          </div>
          <div class="form-group">
            <label>أنواع الأحداث المراقبة</label>
            <div class="modules-checkboxes">
              <label><input type="checkbox" name="event_type" value="intrusion" ${eventTypes.includes('intrusion') ? 'checked' : ''}> تسلل (دخول غير مصرح)</label>
              <label><input type="checkbox" name="event_type" value="loitering" ${eventTypes.includes('loitering') ? 'checked' : ''}> تجمهر (تواجد مشبوه)</label>
            </div>
          </div>
          <div class="form-group">
            <label>الحد الأدنى لمدة الحدث (ثانية) — لتقليل الإنذارات الخاطئة</label>
            <input type="number" name="min_duration_sec" min="1" max="60" value="${theft.min_duration_sec ?? 2}">
          </div>
          <div class="form-group">
            <label>الحساسية (0.1–1)</label>
            <input type="number" name="sensitivity" min="0.1" max="1" step="0.1" value="${theft.sensitivity ?? 0.7}">
          </div>
          <div class="form-group">
            <label>جدولة التشغيل</label>
            <select name="schedule">
              <option value="always" ${(theft.schedule || 'always') !== 'custom' ? 'selected' : ''}>دائماً</option>
              <option value="custom" ${theft.schedule === 'custom' ? 'selected' : ''}>ضمن أوقات محددة</option>
            </select>
          </div>
          <div class="form-group">
            <label>من الساعة – إلى الساعة (عند اختيار «ضمن أوقات»)</label>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input type="text" name="window_start" placeholder="08:00" value="${(tw0.start || '08:00').replace(/"/g, '&quot;')}" style="width:90px">
              <span>–</span>
              <input type="text" name="window_end" placeholder="22:00" value="${(tw0.end || '22:00').replace(/"/g, '&quot;')}" style="width:90px">
            </div>
          </div>
          <div class="module-advanced-section">
            <h4 class="module-advanced-title">إعدادات متقدمة (مثل نظام إنذار السرقة)</h4>
            <div class="form-group">
              <label>تأخير الدخول (ثانية) — قبل تشغيل الإنذار عند رصد التسلل</label>
              <input type="number" name="entry_delay_sec" min="0" max="300" value="${theft.entry_delay_sec ?? 30}">
            </div>
            <div class="form-group">
              <label>تأخير الخروج (ثانية) — مهلة بعد تفعيل النظام قبل المراقبة الكاملة</label>
              <input type="number" name="exit_delay_sec" min="0" max="300" value="${theft.exit_delay_sec ?? 60}">
            </div>
            <div class="form-group">
              <label>وضع التفعيل</label>
              <select name="arm_mode">
                <option value="away" ${(theft.arm_mode || 'away') === 'away' ? 'selected' : ''}>خارج المنزل — مراقبة كاملة</option>
                <option value="stay" ${theft.arm_mode === 'stay' ? 'selected' : ''}>داخل المنزل — استثناء مناطق</option>
              </select>
            </div>
            <div class="form-group">
              <label>مدة إنذار الصفارة (ثانية)</label>
              <input type="number" name="alarm_duration_sec" min="30" max="600" value="${theft.alarm_duration_sec ?? 120}">
            </div>
            <div class="form-group">
              <label><input type="checkbox" name="silent_alarm" ${theft.silent_alarm ? 'checked' : ''}> إنذار صامت (إشعارات فقط دون تشغيل الصفارة)</label>
            </div>
          </div>
          <div class="modal-actions"><button type="submit" class="btn btn-primary">حفظ</button></div>
        </form>
      </div>
      <div class="card module-card" data-module="person">
        <div class="module-card-header">
          <span class="module-icon">👤</span>
          <div>
            <div class="module-name">أشخاص</div>
            <div class="module-desc">${personMod.description || 'اكتشاف أشخاص وعدّ وعمر وجنس'}</div>
          </div>
        </div>
        <form id="modulePersonForm" class="module-form">
          <div class="form-group">
            <label><input type="checkbox" name="enabled" ${personMod.enabled !== false ? 'checked' : ''}> تفعيل الموديول</label>
          </div>
          <div class="form-group">
            <label>الحساسية (0.1–1)</label>
            <input type="number" name="sensitivity" min="0.1" max="1" step="0.1" value="${personMod.sensitivity ?? 0.7}">
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="save_snapshots" ${personMod.save_snapshots !== false ? 'checked' : ''}> حفظ لقطة تلقائي عند اكتشاف شخص (حد 20 جيجا)</label>
          </div>
          <div class="form-group">
            <label>حد الثقة الأدنى (0.1–1)</label>
            <input type="number" name="min_confidence" min="0.1" max="1" step="0.1" value="${personMod.min_confidence ?? 0.6}">
          </div>
          <div class="modal-actions"><button type="submit" class="btn btn-primary">حفظ</button></div>
        </form>
      </div>
    </div>`;
  const form = (id, fn) => { const e = $(id); if (e) e.onsubmit = fn; };
  form('moduleMockForm', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const mock_events_enabled = fd.get('mock_events_enabled') === 'on';
    try {
      await api('/settings/system', { method: 'PUT', body: JSON.stringify({ advanced: { ...adv, mock_events_enabled } } ) });
      await loadConfig();
      toast(mock_events_enabled ? 'تم تفعيل الأحداث التجريبية.' : 'تم إيقاف الأحداث التجريبية. لن تظهر تنبيهات وهمية.', 'success');
      renderModules();
    } catch (err) { toast(err.message, 'error'); }
  });
  form('moduleFireForm', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const fire_smoke = { ...fire, enabled: fd.get('enabled') === 'on', sensitivity: Math.max(0.1, Math.min(1, Number(fd.get('sensitivity')) || 0.7)) };
    try {
      await api('/settings/system', { method: 'PUT', body: JSON.stringify({ advanced: { ...adv, ai_modules: { ...ai, fire_smoke } } }) });
      await loadConfig();
      toast('تم حفظ إعدادات حريق ودخان.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
  form('moduleTheftForm', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const window_start = (fd.get('window_start') || '08:00').toString().trim() || '08:00';
    const window_end = (fd.get('window_end') || '22:00').toString().trim() || '22:00';
    const time_windows = (theft.schedule || '') === 'custom' ? [{ start: window_start, end: window_end }] : (theft.time_windows || []);
    const event_types = fd.getAll('event_type').length ? fd.getAll('event_type') : ['intrusion', 'loitering'];
    const min_duration_sec = Math.max(1, Math.min(60, Number(fd.get('min_duration_sec')) || 2));
    const entry_delay_sec = Math.max(0, Math.min(300, Number(fd.get('entry_delay_sec')) || 30));
    const exit_delay_sec = Math.max(0, Math.min(300, Number(fd.get('exit_delay_sec')) || 60));
    const arm_mode = (fd.get('arm_mode') || 'away').toString();
    const alarm_duration_sec = Math.max(30, Math.min(600, Number(fd.get('alarm_duration_sec')) || 120));
    const silent_alarm = fd.get('silent_alarm') === 'on';
    const anti_theft = { ...theft, enabled: fd.get('enabled') === 'on', sensitivity: Math.max(0.1, Math.min(1, Number(fd.get('sensitivity')) || 0.7)), schedule: (fd.get('schedule') || 'always').toString(), time_windows, event_types, min_duration_sec, entry_delay_sec, exit_delay_sec, arm_mode, alarm_duration_sec, silent_alarm };
    try {
      await api('/settings/system', { method: 'PUT', body: JSON.stringify({ advanced: { ...adv, ai_modules: { ...ai, anti_theft } } }) });
      await loadConfig();
      toast('تم حفظ إعدادات منع السرقة.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
  form('modulePersonForm', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const person = { ...personMod, enabled: fd.get('enabled') === 'on', sensitivity: Math.max(0.1, Math.min(1, Number(fd.get('sensitivity')) || 0.7)), save_snapshots: fd.get('save_snapshots') === 'on', min_confidence: Math.max(0.1, Math.min(1, Number(fd.get('min_confidence')) || 0.6)) };
    try {
      await api('/settings/system', { method: 'PUT', body: JSON.stringify({ advanced: { ...adv, ai_modules: { ...ai, person } } }) });
      await loadConfig();
      toast('تم حفظ إعدادات أشخاص.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
}

function renderSettings() {
  const el = $('pageContent');
  if (!el) return;
  try {
  const hw = config.hardware || {};
  const site = config.site || {};
  const sys = config.system_settings || {};
  const notif = (sys && sys.notifications) ? sys.notifications : {};
  const wa = (sys && sys.whatsapp) ? sys.whatsapp : {};
  const mobile = (sys && sys.mobile_link) ? sys.mobile_link : {};
  const adv = (sys && sys.advanced) ? sys.advanced : {};
  const aiAntiTheft = (adv.ai_modules && adv.ai_modules.anti_theft) ? adv.ai_modules.anti_theft : {};
  const timeWin0 = (aiAntiTheft.time_windows && aiAntiTheft.time_windows[0]) ? aiAntiTheft.time_windows[0] : {};
  el.innerHTML = `
    <div class="page-content settings-page">
      <nav class="settings-tabs" aria-label="أقسام الإعدادات">
        <button type="button" class="settings-tab active" data-section="notifications">إشعارات وأولوية</button>
        <button type="button" class="settings-tab" data-section="whatsapp">واتساب</button>
        <button type="button" class="settings-tab" data-section="mobile">ربط الموبايل</button>
        <button type="button" class="settings-tab" data-section="aimodules">الموديولات</button>
        <button type="button" class="settings-tab" data-section="hardware">العتاد والأصوات</button>
        <button type="button" class="settings-tab" data-section="site">الموقع</button>
        <button type="button" class="settings-tab" data-section="advanced">متقدمة</button>
      </nav>
      <div class="settings-sections">
      <div class="settings-section active" id="section-notifications"><div class="card">
        <div class="card-title">إعدادات الإشعارات وأولوية التنبيهات</div>
        <div class="card-subtitle">تفعيل الإشعارات، أولوية التنبيهات، والصوت والبريد.</div>
        <form id="notificationsForm">
          <div class="form-group">
            <label><input type="checkbox" name="enabled" ${notif.enabled !== false ? 'checked' : ''}> تفعيل الإشعارات</label>
          </div>
          <div class="form-group">
            <label>أولوية التنبيهات (تُشغّل الصفّارة والإشعارات من هذه الدرجة فما فوق)</label>
            <select name="min_priority">
              <option value="critical" ${(notif.min_priority || 'medium') === 'critical' ? 'selected' : ''}>حرج فقط</option>
              <option value="high" ${notif.min_priority === 'high' ? 'selected' : ''}>عالي وما فوق</option>
              <option value="medium" ${(notif.min_priority || 'medium') === 'medium' ? 'selected' : ''}>متوسط وما فوق</option>
              <option value="low" ${notif.min_priority === 'low' ? 'selected' : ''}>جميع التنبيهات</option>
            </select>
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="sound" ${notif.sound !== false ? 'checked' : ''}> تشغيل الصوت عند التنبيه</label>
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="critical_only" ${notif.critical_only ? 'checked' : ''}> إشعار الحرجة فقط (للإيميل/واتساب)</label>
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="email_enabled" ${notif.email_enabled ? 'checked' : ''}> تفعيل الإشعار بالبريد</label>
          </div>
          <div class="form-group">
            <label>البريد الإلكتروني</label>
            <input type="email" name="email" value="${(notif.email || '').replace(/"/g, '&quot;')}" placeholder="email@example.com">
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">حفظ الإشعارات</button>
          </div>
        </form>
      </div></div>
      <div class="settings-section" id="section-whatsapp"><div class="card">
        <div class="card-title">واتساب</div>
        <div class="card-subtitle">ربط واتساب لإرسال تنبيهات الأحداث (Webhook أو رقم).</div>
        <form id="whatsappForm">
          <div class="form-group">
            <label><input type="checkbox" name="enabled" ${wa.enabled ? 'checked' : ''}> تفعيل واتساب</label>
          </div>
          <div class="form-group">
            <label>رابط Webhook (اختياري)</label>
            <input type="url" name="webhook_url" value="${(wa.webhook_url || '').replace(/"/g, '&quot;')}" placeholder="https://...">
          </div>
          <div class="form-group">
            <label>رقم واتساب (مع مفتاح الدولة)</label>
            <input type="text" name="phone" value="${(wa.phone || '').replace(/"/g, '&quot;')}" placeholder="966501234567">
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">حفظ واتساب</button>
          </div>
        </form>
      </div></div>
      <div class="settings-section" id="section-mobile"><div class="card">
        <div class="card-title">ربط الموبايل</div>
        <div class="card-subtitle">ربط أجهزة الموبايل للتنبيهات والتحكم عن بُعد. استخدم كود الربط في تطبيق الموبايل.</div>
        <form id="mobileLinkForm">
          <div class="form-group">
            <label><input type="checkbox" name="enabled" ${mobile.enabled ? 'checked' : ''}> تفعيل ربط الموبايل</label>
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="push_enabled" ${mobile.push_enabled ? 'checked' : ''}> إشعارات الدفع (Push)</label>
          </div>
          <div class="form-group">
            <button type="button" class="btn btn-primary" id="showPairingCodeBtn">عرض كود الربط</button>
            <div id="pairingCodeBox" style="margin-top:12px;padding:16px;background:var(--bg-glass);border-radius:var(--radius-sm);display:none">
              <div style="font-weight:600;margin-bottom:8px">كود الربط (صالح 10 دقائق)</div>
              <div id="pairingCodeValue" style="font-size:1.5rem;letter-spacing:0.3em;font-family:monospace"></div>
              <div id="pairingCodeExpiry" style="font-size:0.85rem;color:var(--text-muted);margin-top:8px"></div>
            </div>
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">حفظ ربط الموبايل</button>
          </div>
        </form>
      </div></div>
      <div class="settings-section" id="section-aimodules"><div class="card">
        <div class="card-title">موديولات الذكاء الاصطناعي وجدولة السرقة</div>
        <div class="card-subtitle">تفعيل الوحدات وجدولة تشغيل موديول السرقة (مثلاً ليلاً فقط).</div>
        <form id="aiModulesForm">
          <div class="form-group">
            <label>جدولة موديول السرقة</label>
            <select name="anti_theft_schedule">
              <option value="always" ${aiAntiTheft.schedule !== 'custom' ? 'selected' : ''}>دائماً</option>
              <option value="custom" ${aiAntiTheft.schedule === 'custom' ? 'selected' : ''}>ضمن أوقات محددة</option>
            </select>
          </div>
          <div class="form-group" id="timeWindowsBox">
            <label>من الساعة – إلى الساعة (مثال: 08:00 – 22:00)</label>
            <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
              <input type="text" name="window_start" placeholder="08:00" value="${(timeWin0.start || '08:00').replace(/"/g, '&quot;')}" style="width:90px">
              <span>–</span>
              <input type="text" name="window_end" placeholder="22:00" value="${(timeWin0.end || '22:00').replace(/"/g, '&quot;')}" style="width:90px">
            </div>
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">حفظ جدولة الموديولات</button>
          </div>
        </form>
      </div></div>
      <div class="settings-section" id="section-advanced"><div class="card">
        <div class="card-title">إعدادات متقدمة</div>
        <div class="card-subtitle">فاصل المزامنة، مستوى السجلات، فاصل التحليل.</div>
        <form id="advancedForm">
          <div class="form-group">
            <label>فاصل المزامنة مع السحابة (ثانية)</label>
            <input type="number" name="sync_interval_sec" min="30" max="3600" value="${adv.sync_interval_sec ?? 60}">
          </div>
          <div class="form-group">
            <label>مستوى السجلات</label>
            <select name="log_level">
              <option value="DEBUG" ${(adv.log_level || 'INFO') === 'DEBUG' ? 'selected' : ''}>DEBUG</option>
              <option value="INFO" ${(adv.log_level || 'INFO') === 'INFO' ? 'selected' : ''}>INFO</option>
              <option value="WARNING" ${adv.log_level === 'WARNING' ? 'selected' : ''}>WARNING</option>
              <option value="ERROR" ${adv.log_level === 'ERROR' ? 'selected' : ''}>ERROR</option>
            </select>
          </div>
          <div class="form-group">
            <label>فاصل دورة التحليل (ثانية)</label>
            <input type="number" name="detection_interval_sec" min="5" max="120" value="${adv.detection_interval_sec ?? 15}">
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">حفظ الإعدادات المتقدمة</button>
          </div>
        </form>
      </div></div>
      <div class="settings-section" id="section-hardware"><div class="card">
        <div class="card-title">المخرجات والصفّارة</div>
        <div class="card-subtitle">التحكم بالصفّارة: ريليه خارجي أو تشغيل الصوت من سماعات الكمبيوتر تلقائياً. أصوات احترافية عالية للحريق/الدخان والسرقة.</div>
        <div class="hw-block">
          <div class="hw-card">
            <div>
              <div class="hw-label">الصفّارة</div>
              <div class="hw-desc">${hw.siren_enabled !== false ? 'مفعّلة' : 'معطّلة'} • ${(hw.siren_output || 'hardware') === 'pc_speaker' ? 'سماعات الكمبيوتر' : 'ريليه Pin ' + (hw.siren_pin ?? 1)}</div>
            </div>
            <div class="hw-actions">
              <button type="button" class="btn btn-primary" id="testSirenBtn">اختبار الصفّارة</button>
            </div>
          </div>
        </div>
        <form id="hardwareForm">
          <div class="form-group">
            <label><input type="checkbox" name="siren_enabled" ${hw.siren_enabled !== false ? 'checked' : ''}> تفعيل الصفّارة (تشغيل تلقائي عند الأحداث)</label>
          </div>
          <div class="form-group">
            <label>مصدر الصفّارة</label>
            <div class="modules-checkboxes">
              <label><input type="radio" name="siren_output" value="hardware" ${(hw.siren_output || 'hardware') === 'hardware' ? 'checked' : ''}> ريليه (عتاد خارجي)</label>
              <label><input type="radio" name="siren_output" value="pc_speaker" ${hw.siren_output === 'pc_speaker' ? 'checked' : ''}> سماعات الكمبيوتر (أوتوماتيك)</label>
            </div>
          </div>
          <div class="form-group" id="pcSpeakerOpts">
            <label>صوت الحريق والدخان (8 خيارات + مخصص)</label>
            <select name="sound_fire_smoke" id="soundFireSelect">
              ${[1,2,3,4,5,6,7,8].map(i => `<option value="preset${i}" ${(hw.sound_fire_smoke || 'preset1') === 'preset'+i ? 'selected' : ''}>صوت ${i}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-secondary" style="margin-top:8px" id="testFireSoundBtn">اختبار صوت الحريق والدخان</button>
          </div>
          <div class="form-group" id="pcSpeakerTheftOpts">
            <label>صوت السرقة (8 خيارات + مخصص)</label>
            <select name="sound_theft" id="soundTheftSelect">
              ${[1,2,3,4,5,6,7,8].map(i => `<option value="preset${i}" ${(hw.sound_theft || 'preset1') === 'preset'+i ? 'selected' : ''}>صوت ${i}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-secondary" style="margin-top:8px" id="testTheftSoundBtn">اختبار صوت السرقة</button>
          </div>
          <div class="form-group" id="pcSpeakerPersonOpts">
            <label>صوت الأشخاص (8 خيارات + مخصص)</label>
            <select name="sound_person" id="soundPersonSelect">
              ${[1,2,3,4,5,6,7,8].map(i => `<option value="preset${i}" ${(hw.sound_person || 'preset1') === 'preset'+i ? 'selected' : ''}>صوت ${i}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-secondary" style="margin-top:8px" id="testPersonSoundBtn">اختبار صوت الأشخاص</button>
          </div>
          <div class="form-group">
            <label>رفع صوت صفّارة مخصص (WAV، حد 10 ميجا)</label>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <input type="file" id="sirenUploadInput" accept=".wav" style="max-width:220px">
              <button type="button" class="btn btn-secondary" id="sirenUploadBtn">رفع</button>
            </div>
            <div id="sirenUploadStatus" style="font-size:0.9rem;color:var(--text-muted);margin-top:6px"></div>
          </div>
          <div class="form-group">
            <label>مدة الصفّارة (ثانية، 1–30) — للكمبيوتر والموبايل</label>
            <input type="number" name="siren_duration_sec" min="1" max="30" value="${hw.siren_duration_sec ?? 3}">
          </div>
          <div class="form-group">
            <label>رقم دبوس ريليه الصفّارة (عند اختيار ريليه)</label>
            <input type="number" name="siren_pin" value="${hw.siren_pin ?? 1}" min="0" max="99">
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">حفظ العتاد</button>
          </div>
        </form>
      </div></div>
      <div class="settings-section" id="section-site"><div class="card">
        <div class="card-title">الموقع</div>
        <form id="siteForm">
          <div class="form-group">
            <label>اسم الموقع</label>
            <input type="text" name="site_name" value="${(site.name || 'الموقع').replace(/"/g, '&quot;')}" placeholder="الموقع">
          </div>
          <div class="form-group">
            <label>المنطقة الزمنية</label>
            <input type="text" name="site_timezone" value="${(site.timezone || 'UTC').replace(/"/g, '&quot;')}" placeholder="UTC, Africa/Cairo">
          </div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary">حفظ</button>
          </div>
        </form>
      </div></div>
      </div>
    </div>`;
  } catch (err) {
    console.error('renderSettings error', err);
    el.innerHTML = '<div class="page-content"><div class="card"><p class="empty-state">حدث خطأ في تحميل الإعدادات. حدّث الصفحة.</p></div></div>';
    return;
  }
  const btn = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  const form = (id, fn) => { const e = $(id); if (e) e.onsubmit = fn; };
  loadCustomSounds();
  qsa('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const section = tab.dataset.section;
      qsa('.settings-tab').forEach(t => t.classList.remove('active'));
      qsa('.settings-section').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
      tab.classList.add('active');
      const panel = $('section-' + section);
      if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
    });
  });
  qsa('.settings-section').forEach(s => { if (!s.classList.contains('active')) s.style.display = 'none'; });
  btn('sirenUploadBtn', async () => {
    const input = $('sirenUploadInput');
    const status = $('sirenUploadStatus');
    if (!input || !input.files || !input.files[0]) { if (status) status.textContent = 'اختر ملف WAV أولاً'; return; }
    if (status) status.textContent = 'جاري الرفع...';
    const fd = new FormData();
    fd.append('file', input.files[0]);
    try {
      const r = await fetch(API + '/sounds/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || data.message || r.statusText);
      if (status) status.textContent = data.message || 'تم الرفع.';
      input.value = '';
      loadCustomSounds();
      toast('تم رفع الصوت المخصص.', 'success');
    } catch (err) {
      if (status) status.textContent = err.message;
      toast(err.message, 'error');
    }
  });
  btn('testSirenBtn', async () => {
    try {
      await api('/hardware/siren/test', { method: 'POST' });
      toast('تم تشغيل اختبار الصفّارة.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  form('siteForm', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/settings/site', { method: 'PUT', body: JSON.stringify({ name: (fd.get('site_name') || 'الموقع').toString().trim() || 'الموقع', timezone: (fd.get('site_timezone') || 'UTC').toString().trim() || 'UTC' }) });
      await loadConfig();
      toast('تم حفظ إعدادات الموقع.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  form('hardwareForm', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/settings/hardware', { method: 'PUT', body: JSON.stringify({
        siren_enabled: fd.get('siren_enabled') === 'on',
        siren_pin: Number(fd.get('siren_pin')) || 1,
        siren_output: (fd.get('siren_output') || 'hardware').toString(),
        sound_fire_smoke: (fd.get('sound_fire_smoke') || 'preset1').toString(),
        sound_theft: (fd.get('sound_theft') || 'preset1').toString(),
        sound_person: (fd.get('sound_person') || 'preset1').toString(),
        siren_duration_sec: Math.max(1, Math.min(30, Number(fd.get('siren_duration_sec')) || 3))
      }) });
      await loadConfig();
      toast('تم حفظ إعدادات العتاد.', 'success');
      renderSettings();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  btn('testFireSoundBtn', async () => {
    try {
      const preset = document.querySelector('#hardwareForm select[name="sound_fire_smoke"]')?.value || 'preset1';
      await api('/hardware/siren/test-sound', { method: 'POST', body: JSON.stringify({ sound_type: 'fire_smoke', preset }) });
      toast('جاري تشغيل صوت الحريق والدخان...', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  btn('testTheftSoundBtn', async () => {
    try {
      const preset = document.querySelector('#hardwareForm select[name="sound_theft"]')?.value || 'preset1';
      await api('/hardware/siren/test-sound', { method: 'POST', body: JSON.stringify({ sound_type: 'theft', preset }) });
      toast('جاري تشغيل صوت السرقة...', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  btn('testPersonSoundBtn', async () => {
    try {
      const preset = document.querySelector('#hardwareForm select[name="sound_person"]')?.value || 'preset1';
      await api('/hardware/siren/test-sound', { method: 'POST', body: JSON.stringify({ sound_type: 'person', preset }) });
      toast('جاري تشغيل صوت الأشخاص...', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  form('notificationsForm', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/settings/system', { method: 'PUT', body: JSON.stringify({
        notifications: {
          enabled: fd.get('enabled') === 'on',
          sound: fd.get('sound') === 'on',
          critical_only: fd.get('critical_only') === 'on',
          min_priority: (fd.get('min_priority') || 'medium').toString(),
          email_enabled: fd.get('email_enabled') === 'on',
          email: (fd.get('email') || '').toString().trim()
        }
      }) });
      await loadConfig();
      toast('تم حفظ إعدادات الإشعارات.', 'success');
      renderSettings();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  form('whatsappForm', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/settings/system', { method: 'PUT', body: JSON.stringify({
        whatsapp: {
          enabled: fd.get('enabled') === 'on',
          webhook_url: (fd.get('webhook_url') || '').toString().trim(),
          phone: (fd.get('phone') || '').toString().trim()
        }
      }) });
      await loadConfig();
      toast('تم حفظ إعدادات واتساب.', 'success');
      renderSettings();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  btn('showPairingCodeBtn', async () => {
    try {
      const data = await api('/mobile/pairing-code');
      const box = $('pairingCodeBox');
      const codeEl = $('pairingCodeValue');
      const expiryEl = $('pairingCodeExpiry');
      if (data.code && codeEl) {
        codeEl.textContent = data.code;
        if (expiryEl) expiryEl.textContent = data.expires_at ? 'ينتهي: ' + new Date(data.expires_at).toLocaleString('ar-SA') : '';
        if (box) box.style.display = 'block';
      } else {
        toast(data.message || 'فعّل ربط الموبايل أولاً ثم اضغط عرض كود الربط.', 'error');
        if (box) box.style.display = 'none';
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  form('mobileLinkForm', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/settings/system', { method: 'PUT', body: JSON.stringify({
        mobile_link: {
          enabled: fd.get('enabled') === 'on',
          push_enabled: fd.get('push_enabled') === 'on'
        }
      }) });
      await loadConfig();
      toast('تم حفظ إعدادات ربط الموبايل.', 'success');
      renderSettings();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  form('aiModulesForm', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const schedule = (fd.get('anti_theft_schedule') || 'always').toString();
    const start = (fd.get('window_start') || '08:00').toString().trim() || '08:00';
    const end = (fd.get('window_end') || '22:00').toString().trim() || '22:00';
    const adv = config.system_settings?.advanced || {};
    const aiModules = { ...(adv.ai_modules || {}), anti_theft: { enabled: true, schedule, time_windows: schedule === 'custom' ? [{ start, end }] : [] } };
    try {
      await api('/settings/system', { method: 'PUT', body: JSON.stringify({ advanced: { ...adv, ai_modules: aiModules } }) });
      await loadConfig();
      toast('تم حفظ جدولة الموديولات.', 'success');
      renderSettings();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  form('advancedForm', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const adv = config.system_settings?.advanced || {};
    try {
      await api('/settings/system', { method: 'PUT', body: JSON.stringify({
        advanced: {
          ...adv,
          sync_interval_sec: Number(fd.get('sync_interval_sec')) || 60,
          log_level: (fd.get('log_level') || 'INFO').toString(),
          detection_interval_sec: Number(fd.get('detection_interval_sec')) || 15
        }
      }) });
      await loadConfig();
      toast('تم حفظ الإعدادات المتقدمة.', 'success');
      renderSettings();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function renderLicense() {
  const end = license.trial_ends_at ? new Date(license.trial_ends_at) : null;
  const daysLeft = end ? Math.max(0, Math.ceil((end - new Date()) / 86400000)) : 14;
  const linked = config.device_key_configured === true;
  const tierAr = { professional: 'احترافي', PROFESSIONAL: 'احترافي', enterprise: 'مؤسسات', ENTERPRISE: 'مؤسسات', basic: 'أساسي', BASIC: 'أساسي', trial: 'تجريبي', TRIAL: 'تجريبي' };
  const tierRaw = (license.tier || 'PROFESSIONAL').toString();
  const tierLabel = tierAr[tierRaw] || tierRaw;
  const featureLabelsAr = { fire_smoke: 'حريق ودخان', anti_theft: 'منع السرقة والتسلل', person: 'تحليل الأشخاص', analytics: 'التحليلات' };
  const activeFeatures = (license.feature_flags && Object.keys(license.feature_flags).length)
    ? Object.entries(license.feature_flags).filter(([, v]) => v).map(([k]) => featureLabelsAr[k] || k)
    : ['حريق ودخان', 'منع السرقة والتسلل', 'تحليل الأشخاص'];
  const featuresText = activeFeatures.length ? activeFeatures.join(' • ') : '—';
  $('pageContent').innerHTML = `
    <div class="page-content license-page">
      <div class="license-hero">
        <h3>${license.within_trial ? 'تجربة 14 يوم' : 'الترخيص'}</h3>
        <p>${license.within_trial
          ? 'يعمل فوراً بكاميرتين وجميع وحدات الذكاء (حريق، دخان، منع السرقة). بعد التجربة أدخل مفتاح الجهاز من سحابة STC Solutions للمتابعة.'
          : 'الترخيص نشط. المزامنة مع السحابة تستخدم المفتاح أدناه.'}</p>
        <div class="license-stats">
          <div class="license-stat">
            <span class="license-stat-value">${tierLabel}</span>
            <span class="license-stat-label">المستوى</span>
          </div>
          <div class="license-stat">
            <span class="license-stat-value">${license.within_trial ? daysLeft + ' يوم' : 'نشط'}</span>
            <span class="license-stat-label">${license.within_trial ? 'متبقي من التجربة' : 'الحالة'}</span>
          </div>
          <div class="license-stat license-stat-features">
            <span class="license-stat-value">${featuresText}</span>
            <span class="license-stat-label">الميزات المفعلة</span>
          </div>
        </div>
      </div>
      <div class="card license-card">
        <div class="card-title">التفعيل بمفتاح من السحابة</div>
        <div class="card-subtitle">بعد انتهاء التجربة، احصل على مفتاح الجهاز من سحابة STC Solutions وأدخله هنا. المزامنة مع السحابة ستستخدم هذا المفتاح.</div>
        <div class="license-activate">
          <form id="licenseLinkForm">
            <div class="form-group">
              <label>مفتاح الجهاز</label>
              <input type="password" name="device_key" id="licenseDeviceKey" placeholder="الصق المفتاح من السحابة" autocomplete="off">
            </div>
            <div class="form-group">
              <label>رابط واجهة السحابة (اختياري)</label>
              <input type="url" name="cloud_url" value="${(config.cloud_url || '').replace(/"/g, '&quot;')}" placeholder="https://api.stcsolutions.example.com">
            </div>
            <button type="submit" class="btn btn-primary">حفظ وربط</button>
          </form>
          ${linked ? '<p class="license-linked-msg">✓ تم تكوين مفتاح الجهاز. المزامنة ستستخدمه.</p>' : ''}
        </div>
      </div>
    </div>`;
  $('licenseLinkForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const device_key = (fd.get('device_key') || '').toString().trim();
    const cloud_url = (fd.get('cloud_url') || '').toString().trim();
    if (!device_key) {
      toast('أدخل مفتاح الجهاز.', 'error');
      return;
    }
    try {
      await api('/license/link', { method: 'POST', body: JSON.stringify({ device_key, cloud_url: cloud_url || null }) });
      await loadConfig();
      toast('تم حفظ المفتاح. المزامنة ستستخدمه.', 'success');
      renderLicense();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

async function loadConfig() {
  const banner = $('connectionErrorBanner');
  try {
    config = await api('/config');
    license = await api('/license');
    if (banner) banner.style.display = 'none';
    $('trialBadge').textContent = license.within_trial ? (license.trial_ends_at ? 'تجربة حتى ' + new Date(license.trial_ends_at).toLocaleDateString('ar-SA') : 'تجربة 14 يوم') : 'الترخيص';
    const siteName = config.site?.name || 'Site';
    const siteTz = config.site?.timezone || 'UTC';
    const siteEl = $('siteLabel');
    if (siteEl) {
      siteEl.textContent = `${siteName} • ${siteTz}`;
      siteEl.style.display = siteName || siteTz ? 'inline-block' : 'none';
    }
    updateArmUI();
    return true;
  } catch (e) {
    console.error(e);
    if (banner) banner.style.display = 'block';
    if (typeof toast === 'function') toast(e.message || 'خطأ في الاتصال', 'error');
    updateArmUI();
    return false;
  }
}

function updateArmUI() {
  const st = $('armStatus');
  const btn = $('armBtn');
  if (!st || !btn) return;
  st.textContent = config.armed ? 'مُفعّل' : 'غير مُفعّل';
  st.className = 'arm-status ' + (config.armed ? 'armed' : 'disarmed');
  btn.textContent = config.armed ? 'إلغاء التفعيل' : 'تفعيل';
}

async function toggleArm() {
  try {
    await api('/config/arm', { method: 'PUT', body: JSON.stringify({ armed: !config.armed }) });
    config.armed = !config.armed;
    updateArmUI();
    if (document.querySelector('[data-page="dashboard"]')?.classList.contains('active')) renderDashboard();
    toast(config.armed ? 'تم تفعيل النظام.' : 'تم إلغاء تفعيل النظام.', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function refreshCurrentPage() {
  const btn = $('refreshBtn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  try {
    const ok = await loadConfig();
    const active = document.querySelector('.nav-item.active');
    const pageId = active?.dataset?.page || 'dashboard';
    showPage(pageId);
    if (ok) toast('تم التحديث.', 'success');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  setTheme(getTheme());
  const retryBtn = $('connectionErrorRetry');
  if (retryBtn) retryBtn.addEventListener('click', () => { loadConfig().then(ok => { if (ok) toast('تم استعادة الاتصال.', 'success'); }); });
  await loadConfig();
  const eventIdFromUrl = new URLSearchParams(window.location.search).get('event_id');
  showPage(eventIdFromUrl ? 'events' : 'dashboard');
  qsa('.nav-item').forEach(n => n.addEventListener('click', (e) => { e.preventDefault(); showPage(n.dataset.page); }));
  $('armBtn').addEventListener('click', toggleArm);
  $('refreshBtn').addEventListener('click', () => refreshCurrentPage());
  const themeBtn = $('themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', () => { const next = getTheme() === 'light' ? 'dark' : 'light'; setTheme(next); });
  const bell = $('notificationsBell');
  const dropdown = $('notificationsDropdown');
  if (bell && dropdown) {
    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display !== 'none';
      dropdown.style.display = isOpen ? 'none' : 'block';
      bell.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      if (!isOpen) renderNotificationsDropdown();
    });
    document.addEventListener('click', () => {
      if (dropdown) { dropdown.style.display = 'none'; bell.setAttribute('aria-expanded', 'false'); }
    });
  }
  pollNewEvents();
  alertPollTimer = setInterval(pollNewEvents, ALERT_POLL_INTERVAL_MS);
  window.addEventListener('popstate', () => {
    const eventId = new URLSearchParams(window.location.search).get('event_id');
    if (!document.querySelector('.nav-item[data-page="events"]')?.classList.contains('active')) return;
    if (eventId) {
      currentEventId = eventId;
      $('pageTitle').textContent = 'تفاصيل الحدث';
      renderEventDetailPage();
    } else {
      currentEventId = null;
      $('pageTitle').textContent = titles.events;
      renderEvents();
    }
  });
});
