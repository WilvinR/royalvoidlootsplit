const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clearSid();
        window.location.href = '/logout';
    });
}
const balanceValue = document.getElementById('balanceValue');
const historyTableBody = document.getElementById('historyTableBody');
const userPill = document.getElementById('userPill');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const serverPill = document.getElementById('serverPill');
const membersGrid = document.getElementById('membersGrid');
const modOpenBtn = document.getElementById('modOpenBtn');

const splitsList = document.getElementById('splitsList');
const splitsBadge = document.getElementById('splitsBadge');

const selCount = document.getElementById('selCount');
const selTotal = document.getElementById('selTotal');
const distBtn = document.getElementById('distBtn');

const detailBack = document.getElementById('detailBack');
const dTitle = document.getElementById('dTitle');
const dDate = document.getElementById('dDate');
const dBadgeWrap = document.getElementById('dBadgeWrap');
const dTotal = document.getElementById('dTotal');
const dCount = document.getElementById('dCount');
const dEach = document.getElementById('dEach');
const dParticipants = document.getElementById('dParticipants');

const balanceList = document.getElementById('balanceList');
const nsDate = document.getElementById('f-fecha');
const nsName = document.getElementById('f-nombre');
const nsTotal = document.getElementById('f-monto');
const nsCreateBtn = document.getElementById('nsCreateBtn');
const nsHint = document.getElementById('nsHint');
const nsMembersList = document.getElementById('member-list');
const nsMemberSearch = document.getElementById('search-member');
const nsCountBadge = document.getElementById('count-badge');
const nsMontoHint = document.getElementById('monto-hint');
const nsPreviewContent = document.getElementById('preview-content');
const nsMainForm = document.getElementById('nsMainForm');
const nsSuccessScreen = document.getElementById('success-screen');
const nsSuccessDetail = document.getElementById('success-detail');
const nsSuccessSummary = document.getElementById('success-summary');
const nsResetBtn = document.getElementById('nsResetBtn');
const nsBackLink = document.getElementById('nsBackLink');
const nsDebug = document.getElementById('nsDebug');

const ownerDashboard = document.getElementById('ownerDashboard');
const guildDebtIndicator = document.getElementById('guildDebtIndicator');
const guildDebtStatusText = document.getElementById('guildDebtStatusText');
const guildBalanceValue = document.getElementById('guildBalanceValue');
const guildDebtValue = document.getElementById('guildDebtValue');
const guildDebtRatio = document.getElementById('guildDebtRatio');
const guildBalanceInput = document.getElementById('guildBalanceInput');
const guildBalanceSetBtn = document.getElementById('guildBalanceSetBtn');
const guildBalanceAddBtn = document.getElementById('guildBalanceAddBtn');
const guildWeeklyChart = document.getElementById('guildWeeklyChart');

let selectedGuildId = '';

let _splitsCache = [];

const navItems = Array.from(document.querySelectorAll('.nav-item[data-view]'));

let lastVoiceMembers = [];

const API_BASE_URL = 'https://royalvoidlootsplit.discloud.app';

// Inject repartir styles if not already present
(function () {
    if (document.getElementById('repartir-styles')) return;
    const s = document.createElement('style');
    s.id = 'repartir-styles';
    s.textContent = `
        .rep-member-row{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid var(--border);}
        .rep-member-row:last-child{border-bottom:none;}
        .rep-m-ava{width:36px;height:36px;border-radius:9px;background:var(--bg4,#161d2e);border:1px solid var(--border2,#243048);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--text2,#7c8aaa);flex-shrink:0;}
        .rep-m-ava.guild{color:var(--gold-dim,#6b5a25);border-color:rgba(200,168,75,0.3);background:rgba(200,168,75,0.08);}
        .rep-m-name{font-size:15px;font-weight:600;color:var(--white,#eef2ff);}
        .rep-m-sub{font-size:11px;color:var(--text2,#7c8aaa);margin-top:2px;}
        .rep-m-amount{font-family:'Cinzel',serif;font-size:18px;color:var(--gold,#c8a84b);margin-left:auto;}
        .activity-row-done{opacity:0.55;cursor:pointer;pointer-events:auto;}
        .activity-row-done:hover{opacity:0.75;}
    `;
    document.head.appendChild(s);
})();



const SID_STORAGE_KEY = 'lootsplit_sid';

function getSid() {
    return localStorage.getItem(SID_STORAGE_KEY) || '';
}

function _setDistBar(count, total) {
    if (selCount) selCount.textContent = String(count);
    if (selTotal) selTotal.textContent = Number(total || 0).toLocaleString('es');
    if (distBtn) distBtn.disabled = count <= 0;
}

function _readSelectedSplits() {
    if (!splitsList) return [];
    const out = [];
    const rows = Array.from(splitsList.querySelectorAll('.activity-row.selected'));
    for (const r of rows) {
        if (!(r instanceof HTMLElement)) continue;
        const idRaw = String(r.getAttribute('data-activity-id') || '').trim();
        if (!idRaw) continue;
        const id = parseInt(idRaw, 10);
        if (!Number.isFinite(id)) continue;
        const total = parseInt(String(r.getAttribute('data-total') || '0'), 10) || 0;
        out.push({ activity_id: id, total });
    }
    return out;
}

function _updateDistBarFromSelection() {
    const sel = _readSelectedSplits();
    const total = sel.reduce((acc, x) => acc + (Number(x.total) || 0), 0);
    _setDistBar(sel.length, total);
}

function _toggleSplitRowSelected(rowEl) {
    if (!(rowEl instanceof HTMLElement)) return;
    rowEl.classList.toggle('selected');
    const check = rowEl.querySelector('.act-check');
    if (check) check.textContent = rowEl.classList.contains('selected') ? '✓' : '';
    _updateDistBarFromSelection();
}

function _statusBadgeHtml(status) {
    const s = String(status || 'pending').toLowerCase();
    if (s === 'deposited') return '<span class="badge badge-done">Depositado</span>';
    if (s === 'in_process') return '<span class="badge badge-process">En Proceso</span>';
    return '<span class="badge badge-pending">Pendiente</span>';
}

async function openActivityDetail(activityId) {
    if (!selectedGuildId) return;
    const act = _splitsCache.find(x => Number(x.id) === Number(activityId));
    if (!act) return;
    showView('detail');

    if (dTitle) dTitle.textContent = String(act.name || '');
    if (dDate) dDate.textContent = String(act.date || act.created_at || '');
    if (dBadgeWrap) dBadgeWrap.innerHTML = _statusBadgeHtml(act.status);
    const total = Number(act.total_amount || 0);
    const per = Number(act.per_person_amount || 0);
    if (dTotal) dTotal.textContent = `${Number(total).toLocaleString('es')} 🪙`;
    if (dEach) dEach.textContent = `${Number(per).toLocaleString('es')} 🪙`;
    if (dCount) dCount.textContent = '-';

    if (dParticipants) {
        dParticipants.innerHTML = '<div style="padding:18px;color:var(--text2);">Cargando participantes...</div>';
    }

    try {
        const res = await apiFetch(`/api/activity_detail?guild_id=${encodeURIComponent(selectedGuildId)}&activity_id=${encodeURIComponent(String(activityId))}`, { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            if (dParticipants) dParticipants.innerHTML = '<div style="padding:18px;color:var(--text2);">No se pudieron cargar participantes.</div>';
            return;
        }
        const parts = Array.isArray(data.participants) ? data.participants : [];
        if (dCount) dCount.textContent = String(parts.length || 0);

        if (dParticipants) {
            if (parts.length === 0) {
                dParticipants.innerHTML = '<div style="padding:18px;color:var(--text2);">Sin participantes.</div>';
            } else {
                let html = '';
                for (const p of parts) {
                    // FIX: comparar como string para no truncar IDs de Discord
                    const uidStr = String(p.user_id ?? '');
                    const isGuild = uidStr === '0';
                    const nm = String(p.user_name || p.name || (isGuild ? 'Guild' : uidStr) || '').trim();
                    const amt = Number(p.amount || 0);
                    const initial = nm ? nm[0].toUpperCase() : '?';
                    html += `
                        <div class="p-row">
                            <div class="p-ava ${isGuild ? 'guild-ava' : ''}">${isGuild ? '⚔️' : escapeHtml(initial)}</div>
                            <div class="p-info">
                                <div class="p-name" style="color:${isGuild ? 'var(--gold-dim)' : 'var(--white)'};">${isGuild ? 'Guild' : escapeHtml(nm)}</div>
                                <div class="p-role">${isGuild ? 'Parte del Gremio' : ''}</div>
                            </div>
                            <div class="p-amount" style="color:${isGuild ? 'var(--gold-dim)' : 'var(--gold)'};">${escapeHtml(Number(amt).toLocaleString('es'))} 🪙</div>
                        </div>
                    `;
                }
                dParticipants.innerHTML = html;
            }
        }
    } catch (e) {
        console.error(e);
        if (dParticipants) dParticipants.innerHTML = '<div style="padding:18px;color:var(--text2);">Error cargando participantes.</div>';
    }
}

async function loadMembersView() {
    if (!membersGrid) return;
    if (!selectedGuildId) {
        membersGrid.innerHTML = '<div style="padding:18px;color:var(--text2);">Inicia sesión para ver miembros.</div>';
        return;
    }
    membersGrid.innerHTML = '<div style="padding:18px;color:var(--text2);">Cargando...</div>';
    try {
        const qs = new URLSearchParams({ guild_id: selectedGuildId, filter: 'role' });
        const res = await apiFetch(`/api/members?${qs.toString()}`, { method: 'GET' });
        if (!res.ok) {
            membersGrid.innerHTML = '<div style="padding:18px;color:var(--text2);">No se pudo cargar miembros.</div>';
            return;
        }
        const data = await res.json().catch(() => ({}));
        const members = Array.isArray(data.members) ? data.members : [];
        members.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        if (members.length === 0) {
            membersGrid.innerHTML = '<div style="padding:18px;color:var(--text2);">Sin miembros para mostrar.</div>';
            return;
        }

        membersGrid.innerHTML = '';
        for (const m of members) {
            const card = document.createElement('div');
            card.className = 'member-card';
            const name = String(m.name || m.id || '').trim();
            const initial = name ? name[0].toUpperCase() : '?';
            card.innerHTML = `
                <div class="mc-ava">${escapeHtml(initial)}</div>
                <div class="mc-name">${escapeHtml(name)}</div>
            `;
            membersGrid.appendChild(card);
        }
    } catch (e) {
        console.error(e);
        membersGrid.innerHTML = '<div style="padding:18px;color:var(--text2);">Error cargando miembros.</div>';
    }
}

async function refreshOwnerAccessUI(guildId) {
    if (!ownerDashboard) return false;
    try {
        const res = await apiFetch(`/api/owner/can_manage?guild_id=${encodeURIComponent(guildId)}`, { method: 'GET' });
        if (!res.ok) {
            ownerDashboard.style.display = 'none';
            return false;
        }
        const data = await res.json().catch(() => ({}));
        const can = !!(data && data.success && data.can_manage === true);
        ownerDashboard.style.display = can ? 'block' : 'none';
        return can;
    } catch (e) {
        console.error(e);
        ownerDashboard.style.display = 'none';
        return false;
    }
}

function _setDebtIndicatorColor(color) {
    if (!guildDebtIndicator) return;
    guildDebtIndicator.classList.remove('status-red', 'status-yellow', 'status-green');
    const c = String(color || '').toLowerCase();
    if (c === 'red') guildDebtIndicator.classList.add('status-red');
    else if (c === 'yellow') guildDebtIndicator.classList.add('status-yellow');
    else guildDebtIndicator.classList.add('status-green');
}

async function refreshOwnerFinance(guildId) {
    if (!ownerDashboard || ownerDashboard.style.display === 'none') return;
    const res = await apiFetch(`/api/owner/finance?guild_id=${encodeURIComponent(guildId)}`, { method: 'GET' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
        if (guildBalanceValue) guildBalanceValue.textContent = '-';
        if (guildDebtValue) guildDebtValue.textContent = '-';
        if (guildDebtRatio) guildDebtRatio.textContent = '-';
        if (guildDebtStatusText) guildDebtStatusText.textContent = '-';
        _setDebtIndicatorColor('green');
        return;
    }

    const gb = Number(data.guild_balance || 0);
    const td = Number(data.total_debt || 0);
    const color = String(data.status_color || 'green');
    const ratio = Number(data.debt_ratio_pct || 0);

    if (guildBalanceValue) guildBalanceValue.textContent = formatAmount(gb);
    if (guildDebtValue) guildDebtValue.textContent = formatAmount(td);
    if (guildDebtRatio) guildDebtRatio.textContent = `Deuda / Balance: ${ratio.toFixed(2)}%`;
    if (guildDebtStatusText) guildDebtStatusText.textContent = color.toUpperCase();
    _setDebtIndicatorColor(color);
}

function _drawWeeklyChart(days) {
    if (!guildWeeklyChart || !(guildWeeklyChart instanceof HTMLCanvasElement)) return;
    const ctx = guildWeeklyChart.getContext('2d');
    if (!ctx) return;

    const w = guildWeeklyChart.width = guildWeeklyChart.clientWidth || 600;
    const h = guildWeeklyChart.height;
    ctx.clearRect(0, 0, w, h);

    const items = Array.isArray(days) ? days : [];
    const labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const deposits = items.map(x => Number(x.deposits || 0));
    const payments = items.map(x => Number(x.payments || 0));
    const maxVal = Math.max(1, ...deposits, ...payments);

    const padX = 18;
    const padY = 18;
    const usableW = w - padX * 2;
    const usableH = h - padY * 2;
    const groupW = usableW / 7;
    const barW = Math.max(6, groupW * 0.26);

    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, h - padY - 1, w, 1);

    for (let i = 0; i < 7; i++) {
        const x0 = padX + i * groupW;
        const dep = deposits[i] || 0;
        const pay = payments[i] || 0;

        const depH = Math.round((dep / maxVal) * (usableH - 22));
        const payH = Math.round((pay / maxVal) * (usableH - 22));

        const depX = x0 + groupW * 0.18;
        const payX = x0 + groupW * 0.56;

        ctx.fillStyle = 'rgba(38, 222, 129, 0.85)';
        ctx.fillRect(depX, h - padY - depH, barW, depH);

        ctx.fillStyle = 'rgba(255, 71, 87, 0.85)';
        ctx.fillRect(payX, h - padY - payH, barW, payH);

        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i] || '', x0 + groupW / 2, h - 4);
    }
}

async function refreshOwnerWeekly(guildId) {
    if (!ownerDashboard || ownerDashboard.style.display === 'none') return;
    const res = await apiFetch(`/api/owner/weekly?guild_id=${encodeURIComponent(guildId)}`, { method: 'GET' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
        _drawWeeklyChart([]);
        return;
    }
    _drawWeeklyChart(Array.isArray(data.days) ? data.days : []);
}

async function refreshOwnerDashboard(guildId) {
    const can = await refreshOwnerAccessUI(guildId);
    if (!can) return;
    await Promise.all([refreshOwnerFinance(guildId), refreshOwnerWeekly(guildId)]);
}

async function applyGuildBalance(mode) {
    if (!selectedGuildId) return;
    const amountStr = String(guildBalanceInput?.value || '').trim();
    if (!amountStr || isNaN(Number(amountStr))) {
        showNotification('Monto inválido.', 'error');
        return;
    }
    const amount = parseInt(amountStr, 10);
    if (!Number.isFinite(amount)) {
        showNotification('Monto inválido.', 'error');
        return;
    }

    const btn = mode === 'add' ? guildBalanceAddBtn : guildBalanceSetBtn;
    if (btn) btn.disabled = true;
    try {
        const res = await apiFetch(`/api/owner/guild_balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guild_id: selectedGuildId, mode, amount }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            showNotification((data && data.error) ? String(data.error) : 'No se pudo aplicar.', 'error');
            return;
        }
        showNotification('Listo.', 'success');
        await refreshOwnerDashboard(selectedGuildId);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function setSid(sid) {
    if (!sid) return;
    localStorage.setItem(SID_STORAGE_KEY, sid);
}

function clearSid() {
    localStorage.removeItem(SID_STORAGE_KEY);
}

async function apiFetch(path, options = {}) {
    const sid = getSid();
    const headers = new Headers(options.headers || {});
    if (sid) {
        headers.set('Authorization', `Bearer ${sid}`);
    }
    return fetch(`${API_BASE_URL}${path}`, {
        credentials: 'include',
        ...options,
        headers,
    });
}

document.addEventListener('DOMContentLoaded', function () {
    zvzInit();
    actInit();
    init();
});

function showView(id) {
    const viewId = `view-${id}`;
    for (const v of Array.from(document.querySelectorAll('.view'))) {
        v.classList.toggle('active', v.id === viewId);
    }
    for (const n of Array.from(document.querySelectorAll('.nav-item'))) {
        n.classList.remove('active');
    }
    const nav = document.getElementById(`nav-${id}`);
    if (nav) nav.classList.add('active');

    if (id === 'members') {
        loadMembersView();
    } else if (id === 'new-split') {
        loadNewSplitView();
    } else if (id === 'splits') {
        loadSplitsView();
    } else if (id === 'balances') {
        if (selectedGuildId) refreshLeaderboard(selectedGuildId);
    } else if (id === 'audit') {
        loadAuditView();
    } else if (id === 'zvz') {
        zvzRefresh();
    } else if (id === 'actividad') {
        actRefreshLeaderboard();
        if (actIsMod) actRenderActiveCodes();
    } else if (id === 'admin') {
        adminLoadView();
    }
}

for (const n of navItems) {
    n.addEventListener('click', () => {
        const id = String(n.getAttribute('data-view') || '').trim();
        if (!id) return;
        showView(id);
    });
}

async function init() {
    // Capture sid after OAuth callback (fallback auth when cookies are blocked)
    const urlParams = new URLSearchParams(window.location.search);
    const sid = urlParams.get('sid');
    if (sid) {
        setSid(sid);
    }
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code || state) {
        // We're in OAuth callback, wait a bit then refresh
        console.log('OAuth callback detected, waiting for session...');
        // Clear the params from URL
        window.history.replaceState({}, document.title, window.location.pathname);
        // Wait a moment for cookie to be set, then check session
        setTimeout(async () => {
            await refreshSessionState();
        }, 500);
    } else {
        if (sid) {
            // Clear the sid param from URL as well
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        await refreshSessionState();
    }
}

async function refreshSessionState() {
    try {
        const meRes = await apiFetch(`/api/me`, { method: 'GET' });
        if (!meRes.ok) {
            setLoggedOutUI();
            return;
        }
        const me = await meRes.json();
        if (!me.success) {
            setLoggedOutUI();
            return;
        }
        setLoggedInUI();
        const user = me.user || {};
        const name = user.global_name || user.username || '';
        if (userName) userName.textContent = name;
        // Guardar user id numérico para el módulo Actividad
        actMyUserId = parseInt(String(user.id || 0)) || 0;
        const avatarUrl = getDiscordAvatarUrl(user);
        if (userAvatar) {
            if (avatarUrl) userAvatar.src = String(avatarUrl);
            else userAvatar.removeAttribute('src');
        }
        if (userPill) userPill.style.display = 'inline-flex';
        await loadGuilds();
    } catch (e) {
        console.error(e);
        setLoggedOutUI();
    }
}

function getDiscordAvatarUrl(user) {
    const u = user || {};
    const direct = u.avatar_url || u.avatarURL;
    if (direct) return String(direct);

    const id = u.id || u.user_id;
    const hash = u.avatar;
    if (id && hash) {
        return `https://cdn.discordapp.com/avatars/${encodeURIComponent(String(id))}/${encodeURIComponent(String(hash))}.png?size=64`;
    }

    const disc = String(u.discriminator || '').trim();
    let idx = 0;
    if (/^\d+$/.test(disc)) {
        idx = parseInt(disc, 10) % 5;
    } else if (id && /^\d+$/.test(String(id))) {
        idx = parseInt(String(id).slice(-3), 10) % 5;
    }
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function setLoggedOutUI() {
    loginBtn.style.display = 'flex';
    logoutBtn.style.display = 'none';
    if (balanceValue) balanceValue.textContent = '-';
    historyTableBody.innerHTML = '';
    if (userPill) userPill.style.display = 'none';
    if (userName) userName.textContent = '';
    if (userAvatar) userAvatar.removeAttribute('src');
    if (serverPill) serverPill.style.display = 'none';
    if (modOpenBtn) modOpenBtn.style.display = 'none';
    const _navAuditLogout = document.getElementById('nav-audit');
    if (_navAuditLogout) _navAuditLogout.style.display = 'none';
    const _navAdminLogout = document.getElementById('nav-admin');
    if (_navAdminLogout) _navAdminLogout.style.display = 'none';
    selectedGuildId = '';
}

function setLoggedInUI() {
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'flex';
}

async function loadGuilds() {
    const res = await apiFetch(`/api/guilds`, { method: 'GET' });
    if (!res.ok) {
        setLoggedOutUI();
        return;
    }
    const data = await res.json();
    if (!data.success) {
        setLoggedOutUI();
        return;
    }

    const guilds = Array.isArray(data.guilds) ? data.guilds : [];
    guilds.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    const preferred = pickPreferredGuild(guilds);
    if (preferred) {
        selectedGuildId = String(preferred.id);
        serverPill.textContent = preferred.name ? preferred.name : String(preferred.id);
        serverPill.style.display = 'inline-flex';
        await refreshData(selectedGuildId);
    } else {
        serverPill.style.display = 'none';
        selectedGuildId = '';
        if (modOpenBtn) modOpenBtn.style.display = 'none';
        if (balanceValue) balanceValue.textContent = '-';
        historyTableBody.innerHTML = '';
        showNotification('No se encontró el servidor RoyalVoid en tu cuenta.', 'error');
    }
}

function pickPreferredGuild(guilds) {
    if (!Array.isArray(guilds) || guilds.length === 0) return null;
    if (guilds.length === 1) return guilds[0];
    const byName = guilds.find(g => String(g.name || '').toLowerCase().includes('royalvoid'));
    return byName || null;
}

async function refreshModAccessUI(guildId) {
    if (!modOpenBtn) return false;
    const navAudit = document.getElementById('nav-audit');
    const navAdmin = document.getElementById('nav-admin');
    try {
        const res = await apiFetch(`/api/admin/can_manage?guild_id=${encodeURIComponent(guildId)}`, { method: 'GET' });
        if (!res.ok) {
            modOpenBtn.style.display = 'none';
            if (navAudit) navAudit.style.display = 'none';
            if (navAdmin) navAdmin.style.display = 'none';
            actIsMod = false; actIsOwner = false; actApplyRole();
            return false;
        }
        const data = await res.json();
        const can = !!(data && data.success && data.can_manage === true);
        modOpenBtn.style.display = can ? 'inline-flex' : 'none';
        if (navAudit) navAudit.style.display = can ? 'flex' : 'none';
        if (navAdmin) navAdmin.style.display = can ? 'flex' : 'none';
        if (!can && document.getElementById('view-audit')?.classList.contains('active')) {
            showView('balances');
        }
        if (!can && document.getElementById('view-admin')?.classList.contains('active')) {
            showView('balances');
        }
        actIsMod = can;
        try {
            const ownerRes = await apiFetch(`/api/owner/can_manage?guild_id=${encodeURIComponent(guildId)}`);
            if (ownerRes.ok) {
                const ownerData = await ownerRes.json().catch(() => ({}));
                actIsOwner = !!(ownerData.can_manage);
            } else { actIsOwner = false; }
        } catch(_) { actIsOwner = false; }
        actApplyRole();
        return can;
    } catch (e) {
        console.error(e);
        modOpenBtn.style.display = 'none';
        if (navAudit) navAudit.style.display = 'none';
        if (navAdmin) navAdmin.style.display = 'none';
        actIsMod = false; actIsOwner = false; actApplyRole();
        return false;
    }
}

function _setNsHint(msg, type = 'error') {
    if (!nsHint) return;
    const m = String(msg || '').trim();
    if (!m) {
        nsHint.style.display = 'none';
        nsHint.textContent = '';
        return;
    }
    nsHint.textContent = m;
    nsHint.style.display = 'block';
    nsHint.style.color = type === 'success' ? 'rgba(38, 222, 129, 0.95)' : 'rgba(255, 107, 107, 0.95)';
}

function _nsDebugLog(title, data) {
    try {
        const t = String(title || '').trim();
        let body = '';
        if (typeof data === 'string') body = data;
        else body = JSON.stringify(data ?? null, null, 2);

        const line = `[${new Date().toISOString()}] ${t}${body ? `\n${body}` : ''}`;
        console.log('[NewSplit]', t, data);
        if (!nsDebug) return;
        nsDebug.style.display = 'block';
        nsDebug.textContent = nsDebug.textContent ? `${nsDebug.textContent}\n\n${line}` : line;
    } catch (e) {
        console.log('[NewSplit] debug log failed', e);
    }
}

function _parseAmountText(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return null;
    const m = s.match(/^(-?\d+(?:[\.,]\d+)?)([kmb])?$/i);
    if (!m) return null;
    const num = parseFloat(String(m[1]).replace(',', '.'));
    if (!Number.isFinite(num)) return null;
    const suffix = String(m[2] || '').toLowerCase();
    let mult = 1;
    if (suffix === 'k') mult = 1_000;
    if (suffix === 'm') mult = 1_000_000;
    if (suffix === 'b') mult = 1_000_000_000;
    return Math.round(num * mult);
}

function _selectedNewSplitParticipants() {
    if (!nsMembersList) return [];
    const out = [];
    const items = Array.from(nsMembersList.querySelectorAll('.member-item.checked[data-user-id]'));
    for (const it of items) {
        if (!(it instanceof HTMLElement)) continue;
        const uidRaw = String(it.getAttribute('data-user-id') || '').trim();
        if (!uidRaw) continue;
        // FIX: conservar user_id como string para evitar pérdida de precisión en IDs de Discord (>53 bits)
        // Solo usamos 0 (número) para el caso especial Guild
        const uid = uidRaw === '0' ? 0 : uidRaw;
        const name = String(it.getAttribute('data-user-name') || '').trim();
        out.push({ user_id: uid, name });
    }
    return out;
}

function _renderNewSplitPreview() {
    if (!nsPreviewContent) return;

    const total = _parseAmountText(nsTotal?.value);
    const parts = _selectedNewSplitParticipants();

    const nonGuildCount = parts.filter(p => p.user_id !== 0 && p.user_id !== '0').length;
    if (nsCountBadge) {
        nsCountBadge.textContent = `${nonGuildCount} seleccionado${nonGuildCount !== 1 ? 's' : ''}`;
    }

    if (nsMontoHint) {
        if (total && total > 0) {
            nsMontoHint.style.display = 'block';
            nsMontoHint.textContent = `= ${Number(total).toLocaleString('es')} 🪙`;
        } else {
            nsMontoHint.style.display = 'none';
            nsMontoHint.textContent = '';
        }
    }

    if (!total || total <= 0 || parts.length <= 0) {
        nsPreviewContent.textContent = 'Completa los campos arriba';
        return;
    }

    const per = Math.floor(total / parts.length);
    let remainder = total - per * parts.length;

    let html = '';
    for (const p of parts) {
        let amt = per;
        const isGuild = p.user_id === 0 || p.user_id === '0';
        if (isGuild && remainder > 0) {
            amt += remainder;
            remainder = 0;
        }
        html += `<div class="preview-row"><span>${isGuild ? '⚔️ ' : ''}${escapeHtml(p.name || String(p.user_id))}</span><span>${escapeHtml(Number(amt).toLocaleString('es'))} 🪙</span></div>`;
    }
    nsPreviewContent.innerHTML = html;
}

function _filterNewSplitMembers() {
    if (!nsMembersList || !nsMemberSearch) return;
    const q = String(nsMemberSearch.value || '').trim().toLowerCase();
    const items = Array.from(nsMembersList.querySelectorAll('.member-item'));
    for (const it of items) {
        if (!(it instanceof HTMLElement)) continue;
        if (it.classList.contains('guild-row')) continue;
        const name = String(it.getAttribute('data-user-name') || it.getAttribute('data-name') || '').toLowerCase();
        it.style.display = name.includes(q) ? '' : 'none';
    }
}

function _toggleMemberItem(itemEl) {
    if (!(itemEl instanceof HTMLElement)) return;
    if (itemEl.classList.contains('guild-row')) return;
    itemEl.classList.toggle('checked');
    const check = itemEl.querySelector('.m-check');
    if (check) check.textContent = itemEl.classList.contains('checked') ? '✓' : '';
    _renderNewSplitPreview();
}

function _resetNewSplitUI() {
    _setNsHint('');
    if (nsDebug) {
        nsDebug.textContent = '';
        nsDebug.style.display = 'none';
    }
    if (nsName) nsName.value = '';
    if (nsTotal) nsTotal.value = '';
    if (nsDate) {
        try {
            const d = new Date();
            nsDate.value = d.toISOString().split('T')[0];
        } catch (_) { }
    }
    if (nsMemberSearch) nsMemberSearch.value = '';
    if (nsMembersList) {
        for (const it of Array.from(nsMembersList.querySelectorAll('.member-item'))) {
            if (!(it instanceof HTMLElement)) continue;
            if (it.classList.contains('guild-row')) continue;
            it.classList.remove('checked');
            const check = it.querySelector('.m-check');
            if (check) check.textContent = '';
            it.style.display = '';
        }
    }
    if (nsSuccessScreen) nsSuccessScreen.classList.remove('show');
    if (nsMainForm) nsMainForm.classList.remove('hide');
    _renderNewSplitPreview();
}

async function loadNewSplitView() {
    if (!selectedGuildId) {
        _setNsHint('Inicia sesión para crear un split.');
        return;
    }
    _setNsHint('');
    if (nsDebug) {
        nsDebug.textContent = '';
        nsDebug.style.display = 'none';
    }

    if (nsDate && !nsDate.value) {
        try {
            const d = new Date();
            nsDate.value = d.toISOString().split('T')[0];
        } catch (_) { }
    }

    if (nsMembersList) {
        nsMembersList.innerHTML = '<div style="padding:10px;color:var(--text2);">Cargando miembros...</div>';
    }

    if (nsSuccessScreen) nsSuccessScreen.classList.remove('show');
    if (nsMainForm) nsMainForm.classList.remove('hide');

    try {
        const mRes = await apiFetch(`/api/members?${new URLSearchParams({ guild_id: selectedGuildId, filter: 'role' }).toString()}`, { method: 'GET' });
        if (!mRes.ok) {
            if (nsMembersList) nsMembersList.innerHTML = '<div style="padding:10px;color:var(--text2);">No se pudieron cargar miembros.</div>';
        } else {
            const mData = await mRes.json().catch(() => ({}));
            const members = Array.isArray(mData.members) ? mData.members : [];
            members.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

            if (nsMembersList) {
                nsMembersList.innerHTML = '';

                const guildRow = document.createElement('div');
                guildRow.className = 'member-item guild-row checked';
                guildRow.setAttribute('data-user-id', '0');
                guildRow.setAttribute('data-user-name', 'Guild');
                guildRow.innerHTML = `
                    <div class="m-check">✓</div>
                    <div class="m-ava">⚔️</div>
                    <div class="m-name">Guild (automático)</div>
                `;
                nsMembersList.appendChild(guildRow);

                for (const m of members) {
                    const uid = String(m.id || '').trim();
                    if (!uid) continue;
                    const name = String(m.name || uid).trim();
                    const row = document.createElement('div');
                    row.className = 'member-item';
                    row.setAttribute('data-user-id', uid);
                    row.setAttribute('data-user-name', name);
                    row.setAttribute('data-name', name);
                    const initial = name ? name[0].toUpperCase() : '?';
                    row.innerHTML = `
                        <div class="m-check"></div>
                        <div class="m-ava">${escapeHtml(initial)}</div>
                        <div class="m-name">${escapeHtml(name)}</div>
                    `;
                    row.addEventListener('click', () => _toggleMemberItem(row));
                    nsMembersList.appendChild(row);
                }
            }
        }
    } catch (e) {
        console.error(e);
        _setNsHint('Error cargando datos del split.');
    }

    _renderNewSplitPreview();
}

async function createNewSplit() {
    _nsDebugLog('Click Crear Loot Split', {
        selectedGuildId,
        hasDateEl: !!nsDate,
        hasNameEl: !!nsName,
        hasTotalEl: !!nsTotal,
        hasMembersListEl: !!nsMembersList,
    });

    if (!selectedGuildId) {
        _setNsHint('Inicia sesión primero.');
        _nsDebugLog('Abort: no selectedGuildId', { selectedGuildId });
        return;
    }
    const date = String(nsDate?.value || '').trim();
    const name = String(nsName?.value || '').trim();
    const total = _parseAmountText(nsTotal?.value);
    const parts = _selectedNewSplitParticipants();

    _nsDebugLog('Fields read', { date, name, total, participantsCount: parts.length, participants: parts });

    if (!date) {
        _setNsHint('Ingresa una fecha.');
        _nsDebugLog('Validation failed: missing date', { date });
        return;
    }
    if (!name) {
        _setNsHint('Ingresa el nombre de la actividad.');
        _nsDebugLog('Validation failed: missing name', { name });
        return;
    }
    if (!total || total <= 0) {
        _setNsHint('Ingresa un monto total válido.');
        _nsDebugLog('Validation failed: invalid total', { total, raw: String(nsTotal?.value || '') });
        return;
    }
    if (parts.length <= 0) {
        _setNsHint('Selecciona participantes.');
        _nsDebugLog('Validation failed: no participants', { parts });
        return;
    }

    const per = Math.floor(total / parts.length);
    let remainder = total - per * parts.length;
    const participants = parts.map(p => {
        let amt = per;
        const isGuild = p.user_id === 0 || p.user_id === '0';
        if (isGuild && remainder > 0) {
            amt += remainder;
            remainder = 0;
        }
        // FIX: enviar user_id como string al backend para preservar precisión completa
        return { user_id: String(p.user_id), amount: amt };
    });

    const payload = {
        guild_id: selectedGuildId,
        date,
        created_at: date,
        name,
        activity_name: name,
        total_amount: total,
        status: 'pending',
        channel_id: '0',
        participants,
    };

    _nsDebugLog('POST /api/activities payload', payload);

    _setNsHint('');
    if (nsCreateBtn) nsCreateBtn.disabled = true;
    try {
        const res = await apiFetch(`/api/activities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const text = await res.text().catch(() => '');
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch (_) {
            data = { raw: text };
        }

        _nsDebugLog('POST /api/activities response', {
            ok: res.ok,
            status: res.status,
            data,
        });

        if (!res.ok || !data.success) {
            _setNsHint((data && data.error) ? String(data.error) : 'No se pudo crear.');
            return;
        }

        if (nsSuccessDetail) {
            nsSuccessDetail.textContent = `${name} · ${date} · ${Number(total).toLocaleString('es')} 🪙 entre ${parts.length} participantes`;
        }
        if (nsSuccessSummary) {
            let html = '';
            for (const p of parts) {
                const isGuild = p.user_id === 0 || p.user_id === '0';
                const amt = participants.find(x => String(x.user_id) === String(p.user_id))?.amount || 0;
                html += `<div class="preview-row"><span style="color:${isGuild ? 'var(--gold-dim)' : 'var(--text)'};">${isGuild ? '⚔️ ' : ''}${escapeHtml(p.name || String(p.user_id))}</span><span>${escapeHtml(Number(amt).toLocaleString('es'))} 🪙</span></div>`;
            }
            nsSuccessSummary.innerHTML = html;
        }
        if (nsMainForm) nsMainForm.classList.add('hide');
        if (nsSuccessScreen) nsSuccessScreen.classList.add('show');
        showNotification('Loot Split creado.', 'success');
        await loadSplitsView();
    } finally {
        if (nsCreateBtn) nsCreateBtn.disabled = false;
    }
}

async function loadSplitsView() {
    if (!splitsList) return;
    if (!selectedGuildId) {
        splitsList.innerHTML = '<div style="padding:18px;color:var(--text2);">Inicia sesión para ver splits.</div>';
        if (splitsBadge) splitsBadge.textContent = '0 pendientes';
        return;
    }
    splitsList.innerHTML = '<div style="padding:18px;color:var(--text2);">Cargando...</div>';
    try {
        const res = await apiFetch(`/api/activities?guild_id=${encodeURIComponent(selectedGuildId)}&limit=200`, { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            splitsList.innerHTML = '<div style="padding:18px;color:var(--text2);">No se pudieron cargar splits.</div>';
            if (splitsBadge) splitsBadge.textContent = '0 pendientes';
            return;
        }
        const items = Array.isArray(data.activities) ? data.activities : [];
        _splitsCache = items;
        if (items.length === 0) {
            splitsList.innerHTML = '<div style="padding:18px;color:var(--text2);">Sin splits.</div>';
            if (splitsBadge) splitsBadge.textContent = '0 pendientes';
            return;
        }

        // Separar activas (pending/in_process) de depositadas
        const activeItems = items.filter(x => String(x.status || '').toLowerCase() !== 'deposited');
        const depositedItems = items.filter(x => String(x.status || '').toLowerCase() === 'deposited');

        const pendingCount = items.filter(x => String(x.status || '').toLowerCase() === 'pending').length;
        if (splitsBadge) splitsBadge.textContent = `${pendingCount} pendientes`;

        splitsList.innerHTML = '';
        _setDistBar(0, 0);

        // Función auxiliar para crear una fila de actividad
        const buildRow = (a, isDeposited) => {
            const total = Number(a.total_amount || 0);
            const status = String(a.status || 'pending').toLowerCase();
            const badgeClass = status === 'deposited' ? 'badge-done' : (status === 'in_process' ? 'badge-process' : 'badge-pending');
            const badgeText = status === 'deposited' ? 'Depositado' : (status === 'in_process' ? 'En Proceso' : 'Pendiente');

            const row = document.createElement('div');
            // Las depositadas tienen clase especial: sin checkbox, opacidad reducida
            row.className = isDeposited ? 'activity-row activity-row-done' : 'activity-row';
            row.setAttribute('data-activity-id', String(a.id || ''));
            row.setAttribute('data-total', String(total));

            row.innerHTML = `
                ${isDeposited ? '' : '<div class="act-check"></div>'}
                <div class="act-info">
                    <div class="act-name">${escapeHtml(String(a.name || a.activity_name || ''))}</div>
                    <div class="act-meta"><span>📅 ${escapeHtml(String(a.date || a.created_at || ''))}</span></div>
                </div>
                <div class="act-right">
                    <div class="act-amount">${escapeHtml(formatAmount(total))} 🪙</div>
                    <div style="margin-top:4px;"><span class="badge ${badgeClass}">${badgeText}</span></div>
                </div>
            `;

            // Solo las activas tienen checkbox seleccionable
            if (!isDeposited) {
                const check = row.querySelector('.act-check');
                if (check) {
                    check.addEventListener('click', (ev) => {
                        try { ev.preventDefault(); ev.stopPropagation(); } catch (_) { }
                        _toggleSplitRowSelected(row);
                    });
                }
            }

            // Todas se pueden cliquear para ver detalles
            row.addEventListener('click', () => {
                const idRaw = String(row.getAttribute('data-activity-id') || '').trim();
                const id = parseInt(idRaw, 10);
                if (!Number.isFinite(id)) return;
                openActivityDetail(id);
            });

            return row;
        };

        // Renderizar actividades activas primero
        if (activeItems.length > 0) {
            for (const a of activeItems) {
                splitsList.appendChild(buildRow(a, false));
            }
        } else {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:14px 18px;color:var(--text2);font-size:13px;';
            empty.textContent = 'No hay splits pendientes.';
            splitsList.appendChild(empty);
        }

        // Sección separadora para las depositadas
        if (depositedItems.length > 0) {
            const sep = document.createElement('div');
            sep.style.cssText = 'padding:12px 18px 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--text2);border-top:1px solid var(--border);margin-top:8px;display:flex;align-items:center;gap:8px;';
            sep.innerHTML = `<span style="color:var(--green,#26de81);">✓</span> Actividades Repartidas (${depositedItems.length})`;
            splitsList.appendChild(sep);

            for (const a of depositedItems) {
                splitsList.appendChild(buildRow(a, true));
            }
        }

    } catch (e) {
        console.error(e);
        splitsList.innerHTML = '<div style="padding:18px;color:var(--text2);">Error.</div>';
        if (splitsBadge) splitsBadge.textContent = '0 pendientes';
    }
}

if (modOpenBtn) {
    const handler = (e) => {
        try {
            e.preventDefault();
            e.stopPropagation();
        } catch (_) { }
        showView('new-split');
    };
    modOpenBtn.addEventListener('pointerup', handler);
    modOpenBtn.addEventListener('click', handler);
}

if (nsTotal) nsTotal.addEventListener('input', _renderNewSplitPreview);
if (nsTotal) nsTotal.addEventListener('change', _renderNewSplitPreview);
if (nsName) nsName.addEventListener('input', () => _setNsHint(''));
if (nsCreateBtn) nsCreateBtn.addEventListener('click', createNewSplit);
if (nsMemberSearch) nsMemberSearch.addEventListener('input', _filterNewSplitMembers);
if (nsResetBtn) nsResetBtn.addEventListener('click', _resetNewSplitUI);
if (nsBackLink) {
    nsBackLink.addEventListener('click', (e) => {
        try {
            e.preventDefault();
            e.stopPropagation();
        } catch (_) { }
        showView('splits');
    });
}

if (detailBack) {
    detailBack.addEventListener('click', () => showView('splits'));
}

if (distBtn) {
    distBtn.addEventListener('click', async () => {
        const sel = _readSelectedSplits();
        if (sel.length <= 0) return;
        await startRepartir(sel);
    });
}

// ── REPARTIR FLOW ──────────────────────────────────────────────────

// Saved channel key in localStorage
const CHANNEL_KEY = 'guild_loot_channel';

function getSavedChannel() {
    try { return localStorage.getItem(CHANNEL_KEY) || ''; } catch (_) { return ''; }
}
function saveChannel(ch) {
    try { if (ch) localStorage.setItem(CHANNEL_KEY, ch); } catch (_) { }
}

async function startRepartir(selectedSplits) {
    if (!selectedGuildId || !selectedSplits.length) return;

    // 1. Change selected rows to "En Proceso" visually and call API
    const activityIds = selectedSplits.map(x => x.activity_id);
    for (const row of Array.from(splitsList.querySelectorAll('.activity-row.selected'))) {
        const badge = row.querySelector('.badge');
        if (badge && !badge.classList.contains('badge-done')) {
            badge.className = 'badge badge-process';
            badge.textContent = 'En Proceso';
        }
    }

    try {
        await apiFetch('/api/activities', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guild_id: selectedGuildId, activity_ids: activityIds, status: 'in_process' }),
        });
    } catch (e) { console.error('PATCH activities failed', e); }

    // 2. Fetch detail for each selected activity to get participants
    const memberTotals = {}; // user_id -> { name, total }
    let grandTotal = 0;
    for (const { activity_id, total } of selectedSplits) {
        grandTotal += total;
        try {
            const res = await apiFetch(`/api/activity_detail?guild_id=${encodeURIComponent(selectedGuildId)}&activity_id=${encodeURIComponent(activity_id)}`, { method: 'GET' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) continue;
            const parts = Array.isArray(data.participants) ? data.participants : [];
            for (const p of parts) {
                // FIX: usar el user_id como string (ya viene como string del backend) para evitar truncamiento
                const uid = String(p.user_id ?? '');
                const amt = Number(p.amount || 0);
                const nm = String(p.user_name || p.name || (uid === '0' ? 'Guild' : uid));
                if (!memberTotals[uid]) memberTotals[uid] = { name: nm, total: 0 };
                memberTotals[uid].total += amt;
            }
        } catch (e) { console.error('detail fetch failed', e); }
    }

    // 3. Show repartir view
    showRepartirView(activityIds, memberTotals, grandTotal, selectedSplits.length);
}

function showRepartirView(activityIds, memberTotals, grandTotal, actCount) {
    // Build or reuse the repartir view
    let view = document.getElementById('view-repartir');
    if (!view) {
        view = document.createElement('div');
        view.id = 'view-repartir';
        view.className = 'view';
        document.querySelector('.main')?.appendChild(view);
    }

    const savedCh = getSavedChannel();

    // Build member rows HTML
    let membersHtml = '';
    // Guild first
    if (memberTotals[0]) {
        const g = memberTotals[0];
        membersHtml += `<div class="rep-member-row">
            <div class="rep-m-ava guild">⚔️</div>
            <div style="flex:1;"><div class="rep-m-name" style="color:var(--gold-dim);">Guild</div><div class="rep-m-sub">Parte del Gremio</div></div>
            <div class="rep-m-amount" style="color:var(--gold-dim);">${Number(g.total).toLocaleString('es')} 🪙</div>
        </div>`;
    }
    for (const [uid, d] of Object.entries(memberTotals)) {
        if (uid === '0' || Number(uid) === 0) continue;
        membersHtml += `<div class="rep-member-row">
            <div class="rep-m-ava">${escapeHtml(d.name[0]?.toUpperCase() || '?')}</div>
            <div style="flex:1;"><div class="rep-m-name">${escapeHtml(d.name)}</div></div>
            <div class="rep-m-amount">${Number(d.total).toLocaleString('es')} 🪙</div>
        </div>`;
    }

    view.innerHTML = `
        <div class="detail-back" id="repBack">← Cancelar y volver</div>
        <div class="page-header">
            <div>
                <div class="page-title"><div class="page-title-dot"></div>Repartiendo Split</div>
                <div class="page-sub">${actCount} actividad${actCount > 1 ? 'es' : ''} en proceso · Total: ${Number(grandTotal).toLocaleString('es')} 🪙</div>
            </div>
            <span class="badge badge-process">🔵 En Proceso</span>
        </div>

        <div class="panel" style="margin-bottom:18px;">
            <div class="panel-hdr">
                <div class="panel-hdr-title">👥 Distribución por Miembro</div>
                <span class="badge badge-process">Total: ${Number(grandTotal).toLocaleString('es')} 🪙</span>
            </div>
            <div id="repMembersList">${membersHtml}</div>
        </div>

        <div class="panel">
            <div class="panel-hdr"><div class="panel-hdr-title">⚙️ Finalizar Split</div></div>
            <div class="rep-form-grid">
                <div class="form-grp" style="border-bottom:none;border-right:1px solid var(--border);">
                    <label class="form-lbl">📍 Isla donde está disponible el loot</label>
                    <input type="text" class="form-input" id="repIsland" placeholder="Ej: Isla de Marlok...">
                </div>
                <div class="form-grp" style="border-bottom:none;">
                    <label class="form-lbl">📢 Canal de Discord</label>
                    <div style="display:flex;gap:8px;">
                        <input type="text" class="form-input" id="repChannel" placeholder="ID del canal" style="flex:1;" value="${escapeHtml(savedCh)}">
                        <button class="btn btn-ghost btn-sm" id="repSaveChannel" style="white-space:nowrap;">💾 Guardar</button>
                    </div>
                    <div id="repChannelSaved" style="font-size:11px;color:var(--green);margin-top:5px;display:${savedCh ? 'block' : 'none'};">✓ Canal guardado</div>
                </div>
            </div>
            <div style="padding:16px 18px;display:flex;justify-content:flex-end;gap:10px;">
                <div id="repError" style="color:var(--orange);font-size:13px;align-self:center;display:none;"></div>
                <button class="btn btn-gold" id="repFinalizeBtn">✅ Finalizar Split</button>
            </div>
        </div>
    `;

    // Store activity ids on the view for finalize
    view._activityIds = activityIds;
    view._memberTotals = memberTotals;

    // Events
    document.getElementById('repBack')?.addEventListener('click', () => {
        // Revert En Proceso back to Pendiente for rows still selected
        for (const row of Array.from(splitsList?.querySelectorAll('.activity-row.selected') || [])) {
            const badge = row.querySelector('.badge');
            if (badge && badge.classList.contains('badge-process')) {
                badge.className = 'badge badge-pending';
                badge.textContent = 'Pendiente';
            }
        }
        showView('splits');
    });

    document.getElementById('repSaveChannel')?.addEventListener('click', () => {
        const ch = String(document.getElementById('repChannel')?.value || '').trim();
        if (ch) {
            saveChannel(ch);
            const savedEl = document.getElementById('repChannelSaved');
            if (savedEl) { savedEl.style.display = 'block'; }
            showNotification('Canal guardado.', 'success');
        }
    });

    document.getElementById('repFinalizeBtn')?.addEventListener('click', () => finalizeRepartir(view));

    showView('repartir');
    // Keep splits nav active
    const navSplits = document.getElementById('nav-splits');
    if (navSplits) navSplits.classList.add('active');
}

async function finalizeRepartir(view) {
    const island = String(document.getElementById('repIsland')?.value || '').trim();
    const channel = String(document.getElementById('repChannel')?.value || '').trim();
    const errorEl = document.getElementById('repError');
    const finalizeBtn = document.getElementById('repFinalizeBtn');

    if (errorEl) errorEl.style.display = 'none';

    if (!island) {
        if (errorEl) { errorEl.textContent = 'Ingresa la isla de depósito.'; errorEl.style.display = 'block'; }
        document.getElementById('repIsland')?.focus();
        return;
    }
    if (!channel) {
        if (errorEl) { errorEl.textContent = 'Ingresa el canal de Discord.'; errorEl.style.display = 'block'; }
        document.getElementById('repChannel')?.focus();
        return;
    }

    // Save channel for next time
    saveChannel(channel);

    if (finalizeBtn) finalizeBtn.disabled = true;

    try {
        const activityIds = view._activityIds || [];
        const memberTotals = view._memberTotals || {};

        const res = await apiFetch('/api/activities/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                guild_id: selectedGuildId,
                activity_ids: activityIds,
                island,
                channel_id: channel,
            }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
            const msg = (data && data.error) ? String(data.error) : 'Error al finalizar.';
            if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
            showNotification(msg, 'error');
            return;
        }

        // Show success screen
        showSuccessScreen(island, channel, data.results || [], activityIds.length, memberTotals);

    } catch (e) {
        console.error(e);
        if (errorEl) { errorEl.textContent = 'Error de conexión.'; errorEl.style.display = 'block'; }
        showNotification('Error de conexión.', 'error');
    } finally {
        if (finalizeBtn) finalizeBtn.disabled = false;
    }
}

function showSuccessScreen(island, channel, results, actCount, memberTotals) {
    let view = document.getElementById('view-success');
    if (!view) {
        view = document.createElement('div');
        view.id = 'view-success';
        view.className = 'view';
        document.querySelector('.main')?.appendChild(view);
    }

    let summaryHtml = `<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--text2);margin-bottom:12px;">📍 ${escapeHtml(island)}</div>`;
    const displayResults = results.length > 0 ? results : Object.entries(memberTotals)
        .filter(([uid]) => uid !== '0' && Number(uid) !== 0)
        .map(([uid, d]) => ({ user_id: uid, user_name: d.name, amount_deposited: d.total, new_balance: null }));

    for (const r of displayResults) {
        if (String(r.user_id) === '0' || Number(r.user_id) === 0) continue;
        const newBal = r.new_balance !== null ? ` | Balance: ${Number(r.new_balance).toLocaleString('es')} 🪙` : '';
        summaryHtml += `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:13px;">
            <span style="color:var(--text);">${escapeHtml(String(r.user_name || r.user_id))}</span>
            <span style="color:var(--gold);font-family:Cinzel,serif;">${Number(r.amount_deposited || 0).toLocaleString('es')} 🪙${escapeHtml(newBal)}</span>
        </div>`;
    }

    view.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:65vh;text-align:center;gap:18px;">
            <div style="font-size:60px;">✅</div>
            <div style="font-family:'Cinzel',serif;font-size:26px;color:var(--white);letter-spacing:1px;">Split Depositado</div>
            <div style="font-size:13px;color:var(--text2);max-width:440px;">
                Loot depositado en <strong>${escapeHtml(island)}</strong>. Notificación enviada al canal ${escapeHtml(channel)}.
            </div>
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:20px 32px;min-width:320px;text-align:left;">
                ${summaryHtml}
            </div>
            <button class="btn btn-gold" id="successBackBtn" style="margin-top:6px;">← Volver a Loot Splits</button>
        </div>
    `;

    showView('success');
    const navSplits = document.getElementById('nav-splits');
    if (navSplits) navSplits.classList.add('active');

    document.getElementById('successBackBtn')?.addEventListener('click', async () => {
        await loadSplitsView();
        showView('splits');
    });
}

async function refreshData(guildId) {
    zvzInvalidateCache();
    await Promise.all([refreshBalance(guildId), refreshLeaderboard(guildId), refreshModAccessUI(guildId)]);
    await refreshOwnerDashboard(guildId);

    const membersViewActive = !!document.getElementById('view-members')?.classList.contains('active');
    if (membersViewActive) {
        loadMembersView();
    }

    const splitsViewActive = !!document.getElementById('view-splits')?.classList.contains('active');
    if (splitsViewActive) {
        loadSplitsView();
    }

    const newSplitViewActive = !!document.getElementById('view-new-split')?.classList.contains('active');
    if (newSplitViewActive) {
        loadNewSplitView();
    }
}

async function refreshBalance(guildId) {
    const res = await apiFetch(`/api/balance?guild_id=${encodeURIComponent(guildId)}`, { method: 'GET' });
    if (!res.ok) {
        if (balanceValue) balanceValue.textContent = '-';
        return;
    }
    const data = await res.json();
    if (!data.success) {
        if (balanceValue) balanceValue.textContent = '-';
        return;
    }
    if (balanceValue) balanceValue.textContent = formatAmount(data.balance || 0);

    if (Array.isArray(data.leaderboard)) {
        renderLeaderboard(data.leaderboard);
    }
}

async function refreshLeaderboard(guildId) {
    const res = await apiFetch(`/api/leaderboard?guild_id=${encodeURIComponent(guildId)}&limit=50`, { method: 'GET' });
    if (!res.ok) {
        if (balanceList) balanceList.innerHTML = '';
        return;
    }
    const data = await res.json();
    if (!data.success) {
        if (balanceList) balanceList.innerHTML = '';
        return;
    }
    const rows = Array.isArray(data.leaderboard) ? data.leaderboard : [];
    if (!balanceList) return;

    if (rows.length === 0) {
        balanceList.innerHTML = '<div style="padding:18px;color:var(--text2);">Sin datos.</div>';
        return;
    }

    const balances = rows.map(x => ({
        name: String(x.user_name || x.user_id || ''),
        balance: Number(x.balance || 0),
        acts: Number(x.activities || x.activity_count || 0) || 0,
    }));
    const maxBal = Math.max(1, ...balances.map(b => Math.abs(b.balance || 0)));

    balanceList.innerHTML = '';
    balances.forEach((b, idx) => {
        const pct = Math.round((Math.abs(b.balance) / maxBal) * 100);
        const item = document.createElement('div');
        item.className = 'balance-row';
        const rankTop = idx < 3 ? 'top' : '';
        item.innerHTML = `
            <div class="br-rank ${rankTop}">#${idx + 1}</div>
            <div class="br-info">
                <div class="br-name">${escapeHtml(b.name)}</div>
                <div class="br-acts">${escapeHtml(String(b.acts || 0))} actividades</div>
            </div>
            <div class="br-bar-wrap">
                <div class="br-bar"><div class="br-bar-fill" style="width:${pct}%;"></div></div>
            </div>
            <div class="br-amount">${escapeHtml(formatAmount(b.balance))} 🪙</div>
        `;
        balanceList.appendChild(item);
    });
}

function formatAmount(n) {
    const num = Number(n || 0);
    return num.toLocaleString('en-US');
}

function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Add styles
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '15px 20px',
        borderRadius: '10px',
        color: 'white',
        fontWeight: '500',
        zIndex: '2000',
        opacity: '0',
        transform: 'translateX(100%)',
        transition: 'all 0.3s ease'
    });

    // Set background color based on type
    switch (type) {
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #26de81, #20bf6b)';
            break;
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #ff4757, #ee5a24)';
            break;
        default:
            notification.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
    }

    // Add to DOM
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

window.RoyalBotLootSplit = {
    showNotification,
    refreshSessionState,
};

if (guildBalanceSetBtn) guildBalanceSetBtn.addEventListener('click', () => applyGuildBalance('set'));
if (guildBalanceAddBtn) guildBalanceAddBtn.addEventListener('click', () => applyGuildBalance('add'));

// ── AUDITORÍA ─────────────────────────────────────────────────────────

const _DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const _MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function _fmtDateShort(isoDate) {
    if (!isoDate) return '—';
    try {
        const [y, m, d] = isoDate.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return `${_DAYS_ES[dt.getDay()]} ${d} ${_MONTHS_ES[m - 1]}`;
    } catch (_) { return isoDate; }
}

function _statusBadgeSmall(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'deposited') return `<span style="font-size:10px;background:#26de8122;color:#26de81;padding:2px 7px;border-radius:5px;">✅ Depositado</span>`;
    if (s === 'in_process') return `<span style="font-size:10px;background:#fd964422;color:#fd9644;padding:2px 7px;border-radius:5px;">🔵 En proceso</span>`;
    return `<span style="font-size:10px;background:#c8a84b22;color:#c8a84b;padding:2px 7px;border-radius:5px;">⏳ Pendiente</span>`;
}

async function loadAuditView() {
    if (!selectedGuildId) return;
    const wrap = document.getElementById('auditMemberList');
    if (wrap) wrap.innerHTML = '<div style="padding:24px 18px;color:var(--text2);text-align:center;">Cargando semana actual...</div>';

    try {
        const res = await apiFetch(`/api/audit/week?guild_id=${encodeURIComponent(selectedGuildId)}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
            if (wrap) wrap.innerHTML = '<div style="padding:24px 18px;color:var(--text2);text-align:center;">No se pudo cargar la auditoría.</div>';
            return;
        }

        // Label de la semana
        const weekLabel = document.getElementById('auditWeekLabel');
        if (weekLabel && data.week_start && data.week_end) {
            weekLabel.textContent = `Semana del ${_fmtDateShort(data.week_start)} al ${_fmtDateShort(data.week_end)}`;
        }

        // Tarjetas
        const el = id => document.getElementById(id);
        if (el('auditCardDeposited')) el('auditCardDeposited').textContent = Number(data.total_deposited || 0).toLocaleString('es') + ' 🪙';
        if (el('auditCardEarned')) el('auditCardEarned').textContent = Number(data.total_earned || 0).toLocaleString('es') + ' 🪙';
        if (el('auditCardActivities')) el('auditCardActivities').textContent = String(data.activity_count || 0) + ' actividad' + (data.activity_count !== 1 ? 'es' : '');

        const members = Array.isArray(data.members) ? data.members : [];
        const countBadge = document.getElementById('auditMemberCount');
        if (countBadge) countBadge.textContent = `${members.length} miembro${members.length !== 1 ? 's' : ''}`;

        if (!wrap) return;

        if (members.length === 0) {
            wrap.innerHTML = '<div style="padding:36px 18px;color:var(--text2);text-align:center;">Sin actividades esta semana.</div>';
            return;
        }

        wrap.innerHTML = '';

        for (const m of members) {
            const rowId = `audit-member-${m.user_id}`;

            const memberRow = document.createElement('div');
            memberRow.style.cssText = 'border-bottom:1px solid var(--border);';

            // Fila principal clicable
            memberRow.innerHTML = `
                <div id="${rowId}-hdr" style="display:flex;align-items:center;gap:14px;padding:14px 18px;cursor:pointer;user-select:none;">
                    <div style="width:36px;height:36px;border-radius:9px;background:var(--bg4,#161d2e);border:1px solid var(--border2,#243048);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:var(--text2);flex-shrink:0;">
                        ${escapeHtml((m.user_name || '?')[0].toUpperCase())}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600;color:var(--white);font-size:14px;">${escapeHtml(m.user_name || m.user_id)}</div>
                        <div style="font-size:11px;color:var(--text2);margin-top:2px;">${(m.activities || []).length} actividad${(m.activities || []).length !== 1 ? 'es' : ''} esta semana</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-family:'Cinzel',serif;font-size:16px;color:var(--gold);">${Number(m.total_earned || 0).toLocaleString('es')} 🪙</div>
                        <div style="font-size:10px;color:var(--text2);margin-top:2px;">ganado total</div>
                    </div>
                    <div id="${rowId}-arrow" style="margin-left:10px;color:var(--text2);font-size:12px;transition:transform 0.2s;">▶</div>
                </div>
                <div id="${rowId}-detail" style="display:none;border-top:1px solid var(--border);background:var(--bg2,#0d1321);">
                    ${_buildMemberActivityDetail(m.activities || [])}
                </div>
            `;

            // Toggle detalle
            const hdr = memberRow.querySelector(`#${rowId}-hdr`);
            const detail = memberRow.querySelector(`#${rowId}-detail`);
            const arrow = memberRow.querySelector(`#${rowId}-arrow`);
            if (hdr && detail && arrow) {
                hdr.addEventListener('click', () => {
                    const open = detail.style.display !== 'none';
                    detail.style.display = open ? 'none' : 'block';
                    arrow.style.transform = open ? '' : 'rotate(90deg)';
                });
            }

            wrap.appendChild(memberRow);
        }

    } catch (e) {
        console.error('loadAuditView error', e);
        const wrap = document.getElementById('auditMemberList');
        if (wrap) wrap.innerHTML = '<div style="padding:24px 18px;color:var(--text2);text-align:center;">Error al cargar la auditoría.</div>';
    }
}

function _buildMemberActivityDetail(activities) {
    if (!activities.length) return '<div style="padding:14px 18px;color:var(--text2);">Sin actividades.</div>';
    let html = '';
    for (const a of activities) {
        html += `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 24px;border-bottom:1px solid var(--border);">
                <div style="flex:1;">
                    <div style="font-size:13px;color:var(--white);font-weight:500;">${escapeHtml(a.name || '—')}</div>
                    <div style="font-size:11px;color:var(--text2);margin-top:2px;">📅 ${escapeHtml(_fmtDateShort(a.date))}</div>
                </div>
                <div style="margin-right:12px;">${_statusBadgeSmall(a.status)}</div>
                <div style="font-family:'Cinzel',serif;font-size:14px;color:var(--gold);white-space:nowrap;">
                    ${Number(a.amount || 0).toLocaleString('es')} 🪙
                </div>
            </div>`;
    }
    // Subtotal al final del detalle
    const subtotal = activities.reduce((s, a) => s + Number(a.amount || 0), 0);
    html += `
        <div style="display:flex;justify-content:flex-end;padding:10px 24px;font-size:12px;color:var(--text2);">
            Subtotal: <span style="font-family:'Cinzel',serif;color:var(--gold);margin-left:8px;">${Number(subtotal).toLocaleString('es')} 🪙</span>
        </div>`;
    return html;
}

// ── ZVZ COMPOSITION ────────────────────────────────────────────────────────

const ZVZ_PALETTE = [
    '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
    '#3498db', '#9b59b6', '#e91e63', '#ff5722', '#8bc34a',
    '#00bcd4', '#673ab7', '#ff9800', '#4caf50', '#03a9f4',
    '#f06292', '#aed581', '#4dd0e1', '#ce93d8', '#ffb74d',
    '#a5d6a7', '#80cbc4', '#90caf9', '#f48fb1', '#ffe082',
    '#c8a84b', '#ff4757', '#2ecc71', '#4a9eff', '#ffffff',
];

let _zvzColor = ZVZ_PALETTE[5];
let _zvzEditingRole = null;
let _zvzAddingTo = null;

// State persisted in server DB (shared across all users)
let zvzState = { roles: {} };
let _zvzIsMod = false;

async function zvzLoadState() {
    if (!selectedGuildId) return;
    try {
        const res = await apiFetch(`/api/zvz?guild_id=${encodeURIComponent(selectedGuildId)}`);
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data.success && data.state) zvzState = data.state;
        }
    } catch (e) { console.error('zvzLoadState error', e); }
}

async function zvzSaveState() {
    if (!selectedGuildId) return;
    try {
        await apiFetch('/api/zvz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guild_id: selectedGuildId, state: zvzState }),
        });
    } catch (e) { console.error('zvzSaveState error', e); }
}

// ── ELIGIBLE MEMBERS ─────────────────────────────────────────────
// Members fetched from the API that have more than @everyone (i.e., filter=role)
// We cache them so we don't call the API on every open
let _zvzMembersCache = null;

async function zvzGetEligibleMembers() {
    if (_zvzMembersCache !== null) return _zvzMembersCache;
    if (!selectedGuildId) return [];
    try {
        const res = await apiFetch(`/api/members?${new URLSearchParams({ guild_id: selectedGuildId, filter: 'role' })}`, { method: 'GET' });
        if (!res.ok) return [];
        const data = await res.json().catch(() => ({}));
        const members = Array.isArray(data.members) ? data.members : [];
        // filter: must have at least one role beyond @everyone (the API with filter=role already does this,
        // but we double-check: any member returned here is eligible)
        _zvzMembersCache = members.map(m => ({ id: String(m.id || ''), name: String(m.name || m.id || '') }));
        return _zvzMembersCache;
    } catch (e) { console.error(e); return []; }
}

// Invalidate cache when guild changes or when we navigate to ZvZ
function zvzInvalidateCache() { _zvzMembersCache = null; }

// ── RENDER ────────────────────────────────────────────────────────
function zvzRender() {
    const grid = document.getElementById('zvzGrid');
    if (!grid) return;
    grid.innerHTML = '';

    // Show/hide Mod-only header buttons
    const zvzNewRoleBtn = document.getElementById('zvzNewRoleBtn');
    const zvzClearBtn = document.getElementById('zvzClearBtn');
    if (zvzNewRoleBtn) zvzNewRoleBtn.style.display = _zvzIsMod ? '' : 'none';
    if (zvzClearBtn) zvzClearBtn.style.display = _zvzIsMod ? '' : 'none';

    for (const [name, info] of Object.entries(zvzState.roles)) {
        const members = info.members || [];
        const max = info.max || 0;
        const pct = max > 0 ? Math.min(100, Math.round((members.length / max) * 100)) : 0;
        const isFull = members.length >= max;
        const color = info.color || '#4a9eff';

        const card = document.createElement('div');
        card.className = 'zvz-card';

        const memberRows = members.map(m => {
            const safeM = escapeHtml(m);
            // Remove button only for Mods
            const rmBtn = _zvzIsMod
                ? `<div class="zvz-chip-rm" data-rm-role="${escapeHtml(name)}" data-rm-member="${safeM}" title="Quitar">×</div>`
                : '';
            return `<div class="zvz-chip">
                <div class="zvz-chip-dot" style="background:${color};"></div>
                <div class="zvz-chip-name">${safeM}</div>
                ${rmBtn}
            </div>`;
        }).join('') || '<div class="zvz-empty">Sin miembros aún</div>';

        const badgeStyle = isFull
            ? 'color:var(--gold);border-color:rgba(200,168,75,.3);background:rgba(200,168,75,.12);'
            : `color:${color};border-color:${color}44;`;

        // Footer buttons only for Mods
        const footerBtns = _zvzIsMod ? `
            <button class="btn-sm zvz-btn-add" data-add-role="${escapeHtml(name)}" ${isFull ? 'disabled' : ''}>+ Agregar</button>
            <button class="btn-sm zvz-btn-edit" data-edit-role="${escapeHtml(name)}">✏️</button>
            <button class="btn-sm zvz-btn-del" data-del-role="${escapeHtml(name)}">🗑️</button>` : '';

        card.innerHTML = `
            <div class="zvz-card-bar" style="background:${color};"></div>
            <div class="zvz-card-header">
                <div class="zvz-card-name">${escapeHtml(name)}</div>
                <div class="zvz-slot-badge" style="${badgeStyle}">${isFull ? 'LLENO' : `${members.length}/${max}`}</div>
            </div>
            <div class="zvz-progress"><div class="zvz-progress-fill" style="width:${pct}%;background:${color};"></div></div>
            <div class="zvz-members">${memberRows}</div>
            ${footerBtns ? `<div class="zvz-card-footer">${footerBtns}</div>` : ''}`;

        // Event delegation on card (Mods only)
        if (_zvzIsMod) {
            card.addEventListener('click', function (e) {
                const t = e.target;
                const addRole = t.getAttribute('data-add-role');
                const editRole = t.getAttribute('data-edit-role');
                const delRole = t.getAttribute('data-del-role');
                const rmRole = t.getAttribute('data-rm-role');
                const rmMember = t.getAttribute('data-rm-member');
                if (addRole !== null) { e.stopPropagation(); zvzOpenAddMember(addRole); }
                else if (editRole !== null) { e.stopPropagation(); zvzOpenEdit(editRole); }
                else if (delRole !== null) { e.stopPropagation(); zvzDeleteRole(delRole); }
                else if (rmRole !== null && rmMember !== null) { e.stopPropagation(); zvzRemoveMember(rmRole, rmMember); }
            });
        }

        grid.appendChild(card);
    }

    // Add new card — only for Mods
    if (_zvzIsMod) {
        const addCard = document.createElement('div');
        addCard.className = 'zvz-card-new';
        addCard.onclick = zvzOpenCreate;
        addCard.innerHTML = `<div class="zvz-card-new-icon">＋</div><div class="zvz-card-new-label">Nuevo Rol</div>`;
        grid.appendChild(addCard);
    }

    // If no roles and not Mod, show empty state
    if (Object.keys(zvzState.roles).length === 0 && !_zvzIsMod) {
        grid.innerHTML = '<div style="padding:40px 18px;color:var(--text2);text-align:center;grid-column:1/-1;">No hay composición ZvZ configurada aún.</div>';
    }
}

// ── COLOR GRID ────────────────────────────────────────────────────
function zvzBuildColorGrid() {
    const grid = document.getElementById('zvzColorGrid');
    if (!grid) return;
    grid.innerHTML = '';
    ZVZ_PALETTE.forEach(c => {
        const sw = document.createElement('div');
        sw.className = 'zvz-swatch' + (c === _zvzColor ? ' zvz-sel' : '');
        sw.style.background = c;
        sw.title = c;
        sw.onclick = () => { _zvzColor = c; zvzBuildColorGrid(); };
        grid.appendChild(sw);
    });
    const prev = document.getElementById('zvzColorPreview');
    if (prev) prev.style.background = _zvzColor;
    const nat = document.getElementById('zvzColorNative');
    if (nat) nat.value = _zvzColor;
}

function zvzOnNativeColor(c) {
    _zvzColor = c;
    document.querySelectorAll('.zvz-swatch').forEach(s => s.classList.remove('zvz-sel'));
    const prev = document.getElementById('zvzColorPreview');
    if (prev) prev.style.background = c;
}

// ── MODAL HELPERS ─────────────────────────────────────────────────
function zvzOpenModal(id) { const el = document.getElementById(id); if (el) el.classList.add('is-open'); }
function zvzCloseModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('is-open'); }

// ── ROLE CRUD ─────────────────────────────────────────────────────
function zvzOpenCreate() {
    _zvzEditingRole = null;
    _zvzColor = ZVZ_PALETTE[5];
    const titleEl = document.getElementById('zvzModalTitle');
    const saveBtn = document.getElementById('zvzModalSave');
    const nameEl = document.getElementById('zvzInputName');
    const maxEl = document.getElementById('zvzInputMax');
    if (titleEl) titleEl.textContent = 'Nuevo Rol';
    if (saveBtn) saveBtn.textContent = 'Crear Rol';
    if (nameEl) nameEl.value = '';
    if (maxEl) maxEl.value = '';
    zvzBuildColorGrid();
    zvzOpenModal('zvzModalRole');
    setTimeout(() => nameEl?.focus(), 100);
}

function zvzOpenEdit(roleName) {
    _zvzEditingRole = roleName;
    const info = zvzState.roles[roleName] || {};
    _zvzColor = info.color || ZVZ_PALETTE[5];
    const titleEl = document.getElementById('zvzModalTitle');
    const saveBtn = document.getElementById('zvzModalSave');
    const nameEl = document.getElementById('zvzInputName');
    const maxEl = document.getElementById('zvzInputMax');
    if (titleEl) titleEl.textContent = 'Editar Rol';
    if (saveBtn) saveBtn.textContent = 'Guardar';
    if (nameEl) nameEl.value = roleName;
    if (maxEl) maxEl.value = info.max || '';
    zvzBuildColorGrid();
    zvzOpenModal('zvzModalRole');
    setTimeout(() => nameEl?.focus(), 100);
}

async function zvzSaveRole() {
    const name = String(document.getElementById('zvzInputName')?.value || '').trim();
    const max = parseInt(String(document.getElementById('zvzInputMax')?.value || ''), 10);
    if (!name) { showNotification('Ingresa un nombre para el rol.', 'error'); return; }
    if (!max || max < 1) { showNotification('Ingresa una cantidad válida.', 'error'); return; }

    if (_zvzEditingRole) {
        const old = zvzState.roles[_zvzEditingRole] || {};
        if (_zvzEditingRole !== name) {
            if (zvzState.roles[name]) { showNotification(`"${name}" ya existe.`, 'error'); return; }
            delete zvzState.roles[_zvzEditingRole];
        }
        zvzState.roles[name] = { ...old, max, color: _zvzColor };
        showNotification(`Rol "${name}" actualizado.`, 'success');
    } else {
        if (zvzState.roles[name]) { showNotification(`"${name}" ya existe.`, 'error'); return; }
        
        // NUEVO: Crear rol en Discord
        try {
            const res = await apiFetch('/api/zvz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ guild_id: selectedGuildId, action: 'create_role', role_name: name, color: _zvzColor }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                showNotification(`Error Discord: ${data.error || 'Desconocido'}`, 'error');
                return;
            }
        } catch(e) {
            showNotification(`Error al crear rol: ${e.message}`, 'error');
            return;
        }
        
        zvzState.roles[name] = { max, members: [], color: _zvzColor };
        showNotification(`Rol "${name}" creado en Discord.`, 'success');
    }
    await zvzSaveState();
    zvzRender();
    zvzCloseModal('zvzModalRole');
}

async function zvzDeleteRole(roleName) {
    if (!confirm(`¿Eliminar el rol "${roleName}"?`)) return;
    
    // NUEVO: Eliminar en Discord
    try {
        const res = await apiFetch('/api/zvz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guild_id: selectedGuildId, action: 'delete_role', role_name: roleName }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            showNotification(`Error: ${data.error || 'No se pudo eliminar'}`, 'error');
            return;
        }
    } catch(e) {
        showNotification(`Error: ${e.message}`, 'error');
        return;
    }
    
    delete zvzState.roles[roleName];
    await zvzSaveState();
    zvzRender();
    showNotification('Rol eliminado.', 'info');
}

async function zvzClearAll() {
    if (!confirm('¿Quitar todos los miembros de todos los roles?')) return;
    for (const k of Object.keys(zvzState.roles)) zvzState.roles[k].members = [];
    await zvzSaveState();
    zvzRender();
    showNotification('Todos los miembros removidos.', 'info');
}

// ── ADD MEMBER ────────────────────────────────────────────────────
async function zvzOpenAddMember(roleName) {
    _zvzAddingTo = roleName;
    const roleNameEl = document.getElementById('zvzMemberRoleName');
    if (roleNameEl) roleNameEl.textContent = roleName;
    const searchEl = document.getElementById('zvzMemberSearch');
    if (searchEl) searchEl.value = '';
    const listEl = document.getElementById('zvzMemberList');
    if (listEl) listEl.innerHTML = '<div class="zvz-member-item" style="color:var(--text2);cursor:default;">Cargando...</div>';
    zvzOpenModal('zvzModalMember');

    // Fetch eligible members (more than @everyone)
    const all = await zvzGetEligibleMembers();

    zvzRenderMemberList(all, '');
    setTimeout(() => searchEl?.focus(), 100);
}

function zvzRenderMemberList(allMembers, q) {
    const listEl = document.getElementById('zvzMemberList');
    if (!listEl) return;
    const roleInfo = zvzState.roles[_zvzAddingTo] || { members: [] };
    const existing = new Set((roleInfo.members || []).map(m => m.toLowerCase()));
    const matches = allMembers.filter(m =>
        !existing.has(m.name.toLowerCase()) &&
        (q === '' || m.name.toLowerCase().includes(q.toLowerCase()))
    );

    if (matches.length === 0) {
        listEl.innerHTML = '<div class="zvz-member-item" style="color:var(--text2);cursor:default;">Sin resultados</div>';
        return;
    }
    listEl.innerHTML = matches.map(m => {
        const safeName = escapeHtml(m.name);
        return `<div class="zvz-member-item" data-add-member="${safeName}">
            <div class="zvz-member-ava">${escapeHtml(m.name[0]?.toUpperCase() || '?')}</div>
            ${safeName}
        </div>`;
    }).join('');

    // Attach click handlers after render
    listEl.querySelectorAll('.zvz-member-item[data-add-member]').forEach(el => {
        el.addEventListener('click', () => zvzAddMember(el.getAttribute('data-add-member')));
    });
}

async function zvzFilterMembers() {
    const q = String(document.getElementById('zvzMemberSearch')?.value || '');
    const all = await zvzGetEligibleMembers();
    zvzRenderMemberList(all, q);
}

async function zvzAddMember(memberName) {
    if (!_zvzAddingTo) return;
    const info = zvzState.roles[_zvzAddingTo];
    if (!info) return;
    if ((info.members || []).includes(memberName)) { showNotification(`${memberName} ya está en este rol.`, 'error'); return; }
    if ((info.members || []).length >= info.max) { showNotification('Rol lleno.', 'error'); return; }
    
    // FIX: buscar el ID real del miembro en el cache para enviarlo al servidor
    if (_zvzMembersCache === null) await zvzGetEligibleMembers();
    const cachedMember = (_zvzMembersCache || []).find(m => m.name === memberName);
    const memberId = cachedMember?.id || '';

    // NUEVO: Asignar en Discord
    try {
        const res = await apiFetch('/api/zvz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guild_id: selectedGuildId, action: 'add_member', member_name: memberName, member_id: memberId, role_name: _zvzAddingTo }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            showNotification(`Error: ${data.error || 'No se pudo asignar'}`, 'error');
            return;
        }
    } catch(e) {
        showNotification(`Error: ${e.message}`, 'error');
        return;
    }
    
    info.members.push(memberName);
    await zvzSaveState();
    zvzRender();
    showNotification(`${memberName} agregado.`, 'success');
    zvzCloseModal('zvzModalMember');
}

async function zvzRemoveMember(roleName, memberName) {
    const info = zvzState.roles[roleName];
    if (!info) return;
    
    // FIX: buscar el ID real del miembro en el cache para enviarlo al servidor
    // El memberName puede incluir emojis (ej: "💀 nituil") que el servidor no puede
    // resolver como username de Discord. Enviamos el member_id para que el servidor
    // busque por ID en lugar de por nombre.
    if (_zvzMembersCache === null) await zvzGetEligibleMembers();
    const cachedMember = (_zvzMembersCache || []).find(m => m.name === memberName);
    const memberId = cachedMember?.id || '';

    // NUEVO: Quitar en Discord
    try {
        const res = await apiFetch('/api/zvz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guild_id: selectedGuildId, action: 'remove_member', member_name: memberName, member_id: memberId, role_name: roleName }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            showNotification(`Error: ${data.error || 'No se pudo quitar'}`, 'error');
            return;
        }
    } catch(e) {
        showNotification(`Error: ${e.message}`, 'error');
        return;
    }
    
    info.members = (info.members || []).filter(m => m !== memberName);
    await zvzSaveState();
    zvzRender();
    showNotification(`${memberName} removido.`, 'info');
}

// ── INIT ZVZ ──────────────────────────────────────────────────────
function zvzInit() {
    // Wire nav
    document.getElementById('zvzNewRoleBtn')?.addEventListener('click', zvzOpenCreate);
    document.getElementById('zvzClearBtn')?.addEventListener('click', zvzClearAll);
    document.getElementById('zvzModalClose')?.addEventListener('click', () => zvzCloseModal('zvzModalRole'));
    document.getElementById('zvzModalCancel')?.addEventListener('click', () => zvzCloseModal('zvzModalRole'));
    document.getElementById('zvzModalSave')?.addEventListener('click', zvzSaveRole);
    document.getElementById('zvzMemberClose')?.addEventListener('click', () => zvzCloseModal('zvzModalMember'));
    document.getElementById('zvzMemberSearch')?.addEventListener('input', zvzFilterMembers);
    document.getElementById('zvzColorNative')?.addEventListener('input', function () { zvzOnNativeColor(this.value); });
    document.getElementById('zvzColorPreview')?.addEventListener('click', () => document.getElementById('zvzColorNative')?.click());

    // Close modals on overlay click
    ['zvzModalRole', 'zvzModalMember'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', e => { if (e.target === el) zvzCloseModal(id); });
    });

    // Enter key in role modal
    document.getElementById('zvzInputName')?.addEventListener('keydown', e => { if (e.key === 'Enter') zvzSaveRole(); });
    document.getElementById('zvzInputMax')?.addEventListener('keydown', e => { if (e.key === 'Enter') zvzSaveRole(); });
}

// Called when the user navigates to the ZvZ view — loads fresh data from server
async function zvzRefresh() {
    const grid = document.getElementById('zvzGrid');
    if (grid) grid.innerHTML = '<div style="padding:40px 18px;color:var(--text2);text-align:center;grid-column:1/-1;">Cargando composición...</div>';

    // Check if current user is Mod
    _zvzIsMod = false;
    if (selectedGuildId) {
        try {
            const modRes = await apiFetch(`/api/admin/can_manage?guild_id=${encodeURIComponent(selectedGuildId)}`);
            if (modRes.ok) {
                const modData = await modRes.json().catch(() => ({}));
                _zvzIsMod = !!(modData.can_manage || modData.is_mod || modData.ok);
            }
        } catch (e) { _zvzIsMod = false; }
    }

    await zvzLoadState();
    
    // NUEVO: Sincronizar automáticamente roles Y miembros que faltan en Discord
    if (_zvzIsMod && selectedGuildId && zvzState.roles) {
        console.log('[ZVZ SYNC] Iniciando sincronización automática de roles y miembros...');
        const roles = zvzState.roles;
        let createdRoles = 0;
        let assignedMembers = 0;
        
        // PASO 1: Crear roles que faltan
        for (const [roleName, roleInfo] of Object.entries(roles)) {
            try {
                console.log(`[ZVZ SYNC] Verificando rol: ${roleName}`);
                const res = await apiFetch('/api/zvz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        guild_id: selectedGuildId,
                        action: 'create_role',
                        role_name: roleName,
                        color: roleInfo.color || '#4a9eff'
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (data.success) {
                    console.log(`[ZVZ SYNC] ✅ Rol "${roleName}" sincronizado`);
                    createdRoles++;
                } else if (data.error && data.error.includes('ya existe')) {
                    console.log(`[ZVZ SYNC] ℹ️  Rol "${roleName}" ya existe en Discord`);
                } else {
                    console.log(`[ZVZ SYNC] ⚠️  Error con "${roleName}": ${data.error}`);
                }
            } catch (e) {
                console.log(`[ZVZ SYNC] ⚠️  Error sincronizando "${roleName}": ${e.message}`);
            }
        }
        
        // PASO 2: Asignar miembros a los roles
        console.log('[ZVZ SYNC] Iniciando asignación de miembros a roles...');
        // FIX: cargar el cache de miembros elegibles para poder enviar el member_id
        const eligibleMembers = await zvzGetEligibleMembers();
        for (const [roleName, roleInfo] of Object.entries(roles)) {
            const members = roleInfo.members || [];
            for (const memberName of members) {
                try {
                    // FIX: buscar el ID real del miembro para enviarlo al servidor
                    const cachedMember = eligibleMembers.find(m => m.name === memberName);
                    const memberId = cachedMember?.id || '';
                    console.log(`[ZVZ SYNC] Asignando "${memberName}" (id: ${memberId || 'desconocido'}) a rol "${roleName}"`);
                    const res = await apiFetch('/api/zvz', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            guild_id: selectedGuildId,
                            action: 'add_member',
                            role_name: roleName,
                            member_name: memberName,
                            member_id: memberId
                        }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (data.success) {
                        console.log(`[ZVZ SYNC] ✅ "${memberName}" asignado a "${roleName}"`);
                        assignedMembers++;
                    } else {
                        console.log(`[ZVZ SYNC] ⚠️  Error asignando "${memberName}": ${data.error}`);
                    }
                } catch (e) {
                    console.log(`[ZVZ SYNC] ⚠️  Error asignando "${memberName}": ${e.message}`);
                }
            }
        }
        
        if (createdRoles > 0 || assignedMembers > 0) {
            console.log(`[ZVZ SYNC] ✅ Sincronización completa: ${createdRoles} roles, ${assignedMembers} miembros`);
        }
    }
    
    zvzInvalidateCache();
    zvzRender();
}



// zvzInit is called from the main init() flow via refreshData
// and also directly when the DOM is ready. The nav click handles the rest.

// ═══════════════════════════════════════════════════════════════
// MÓDULO ACTIVIDAD — conectado al backend (SQLite via Bot)
// ═══════════════════════════════════════════════════════════════

let actIsMod    = false;
let actIsOwner  = false;
let actMyUserId = 0;
let actCodeTimerInterval = null;

// ── PERMISOS ─────────────────────────────────────────────────
function actApplyRole() {
    const genBtn   = document.getElementById('act-openGenBtn');
    const adminBtn = document.getElementById('act-openAdminBtn');
    if (genBtn)   genBtn.style.display   = actIsMod   ? 'inline-flex' : 'none';
    if (adminBtn) adminBtn.style.display = actIsOwner ? 'inline-flex' : 'none';
}

// ── LEADERBOARD (datos desde el backend) ─────────────────────
async function actRefreshLeaderboard() {
    if (!selectedGuildId) return;
    try {
        const res = await apiFetch(`/api/actividad/points?guild_id=${encodeURIComponent(selectedGuildId)}`);
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!data.success) return;
        actRenderLeaderboard(data);
    } catch(e) { console.error('actRefreshLeaderboard', e); }
}

function actRenderLeaderboard(data) {
    const lb = document.getElementById('act-leaderboard');
    if (!lb) return;

    const leaderboard    = Array.isArray(data?.leaderboard) ? data.leaderboard : [];
    const myPts          = Number(data?.my_points || 0);
    const myRank         = data?.my_rank ?? null;
    const totalPts       = Number(data?.total_points || 0);
    const participantCnt = Number(data?.participant_count || 0);

    const hdr = document.getElementById('act-hdrStats');
    if (hdr) hdr.textContent = `${totalPts.toLocaleString()} pts · ${participantCnt} participante${participantCnt !== 1 ? 's' : ''}`;

    const myPtsEl  = document.getElementById('act-myPts');
    const myRankEl = document.getElementById('act-myRank');
    if (myPtsEl)  myPtsEl.innerHTML  = `${myPts.toLocaleString()} <span>pts</span>`;
    if (myRankEl) myRankEl.innerHTML = myPts > 0 && myRank
        ? `Posición <strong>#${myRank}</strong> en el ranking`
        : 'Activa tu primer código para aparecer en el ranking';

    if (leaderboard.length === 0) {
        lb.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2);"><div style="font-size:32px;opacity:.3;margin-bottom:8px;">📊</div><div style="font-family:\'Cinzel\',serif;font-size:13px;">Sin datos aún</div></div>';
        return;
    }

    const maxPts = leaderboard[0]?.points || 1;
    lb.innerHTML = '';
    leaderboard.forEach((entry, i) => {
        const rank  = i + 1;
        const pts   = Number(entry.points || 0);
        const name  = String(entry.user_name || entry.user_id || '?');
        const isMe  = Number(entry.user_id) === actMyUserId;
        const pct   = Math.round((pts / maxPts) * 100);
        const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
        const rCls  = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';

        const row = document.createElement('div');
        row.className = 'act-lb-row' + (isMe ? ' is-me' : '');
        row.innerHTML = `
            <div class="act-rank ${rCls}">${emoji}</div>
            <div class="act-ava">${(name[0] || '?').toUpperCase()}</div>
            <div class="act-lb-info">
                <div class="act-lb-name${isMe ? ' me' : ''}">${escapeHtml(name)}${isMe ? ' <span style="font-size:10px;color:var(--text2);margin-left:4px;">(tú)</span>' : ''}</div>
                <div class="act-bar-wrap"><div class="act-bar" style="width:0" data-w="${pct}"></div></div>
            </div>
            <div>
                <div class="act-pts">${pts.toLocaleString()}</div>
                <div class="act-pts-sub">pts</div>
            </div>`;
        lb.appendChild(row);
    });

    requestAnimationFrame(() => {
        lb.querySelectorAll('.act-bar').forEach(b => { b.style.width = b.getAttribute('data-w') + '%'; });
    });
}

// ID del usuario logueado (se llena cuando carga la sesión)

// ── REDEEM ────────────────────────────────────────────────────
async function actRedeem() {
    const inp  = document.getElementById('act-codeInput');
    const fb   = document.getElementById('act-redeemFb');
    const code = (inp?.value || '').trim();

    const showFb = (msg, type) => {
        if (!fb) return;
        fb.innerHTML = (type === 'ok' ? '✅ ' : '❌ ') + msg;
        fb.className = 'act-feedback ' + type;
        setTimeout(() => { if (fb) fb.className = 'act-feedback'; }, 4000);
    };

    if (!code || code.length < 4) { showFb('Ingresa 4 dígitos', 'err'); return; }
    if (!selectedGuildId)         { showFb('No hay servidor seleccionado', 'err'); return; }

    try {
        const res = await apiFetch('/api/actividad/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guild_id: selectedGuildId, code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data.success) {
            showFb(data.error || 'Error desconocido', 'err');
            return;
        }
        if (inp) inp.value = '';
        showFb(`¡+${data.points_earned} puntos! Total: ${data.total_points}`, 'ok');
        showNotification(`🏆 +${data.points_earned} puntos de actividad`, 'success');
        await actRefreshLeaderboard();
    } catch(e) {
        showFb('Error de conexión', 'err');
    }
}

// ── GENERATE ──────────────────────────────────────────────────
async function actGenerate() {
    const uses   = parseInt(document.getElementById('act-genUsos')?.value)   || 0;
    const points = parseInt(document.getElementById('act-genPuntos')?.value) || 0;
    if (uses < 1)   { showNotification('Usos debe ser mínimo 1', 'error'); return; }
    if (points < 1) { showNotification('Puntos debe ser mínimo 1', 'error'); return; }
    if (!selectedGuildId) { showNotification('No hay servidor seleccionado', 'error'); return; }

    try {
        const res = await apiFetch('/api/actividad/gen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guild_id: selectedGuildId, uses, points }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data.success) { showNotification(data.error || 'Error al generar', 'error'); return; }

        const numEl   = document.getElementById('act-codeNum');
        const metaEl  = document.getElementById('act-codeMeta');
        const display = document.getElementById('act-codeDisplay');
        if (numEl)   numEl.textContent  = data.code;
        if (metaEl)  metaEl.textContent = `${uses} usos · ${points} pts por uso · expira en 5 min`;
        if (display) display.classList.add('show');

        actStartTimer(data.expires_at);
        await actRenderActiveCodes();
        showNotification(`Código ${data.code} generado — válido 5 minutos`, 'success');
    } catch(e) {
        showNotification('Error de conexión', 'error');
    }
}

function actStartTimer(expires_at_ms) {
    const el = document.getElementById('act-codeTimer');
    if (actCodeTimerInterval) clearInterval(actCodeTimerInterval);
    const tick = () => {
        if (!el) return;
        const rem = expires_at_ms - Date.now();
        if (rem <= 0) {
            el.textContent = 'EXPIRADO'; el.className = 'act-gen-timer urg';
            clearInterval(actCodeTimerInterval);
            const d = document.getElementById('act-codeDisplay');
            if (d) d.classList.remove('show');
            actRenderActiveCodes(); return;
        }
        const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000);
        el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        el.className = rem < 60000 ? 'act-gen-timer urg' : 'act-gen-timer';
    };
    tick();
    actCodeTimerInterval = setInterval(tick, 500);
}

async function actRenderActiveCodes() {
    const list = document.getElementById('act-activeList');
    if (!list || !selectedGuildId) return;
    try {
        const res = await apiFetch(`/api/actividad/codes?guild_id=${encodeURIComponent(selectedGuildId)}`);
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const codes = Array.isArray(data.codes) ? data.codes : [];

        if (codes.length === 0) {
            list.innerHTML = '<div style="font-size:12px;color:var(--text2);text-align:center;padding:10px;border:1px dashed var(--border);border-radius:7px;">Sin códigos activos</div>';
            return;
        }
        list.innerHTML = '';
        const now = Date.now();
        codes.forEach(info => {
            const rem = info.expires_at - now;
            const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000);
            const timeStr = rem > 0 ? `${m}:${s.toString().padStart(2, '0')}` : 'Exp.';
            const urg = rem < 60000 && rem > 0;
            const row = document.createElement('div');
            row.className = 'act-code-row';
            row.innerHTML = `
                <div class="act-code-row-num">${escapeHtml(info.code)}</div>
                <div class="act-code-row-info"><strong>${info.uses_remaining}/${info.uses_total}</strong> usos · <strong>${info.points_per_use}</strong> pts</div>
                <div class="act-code-row-timer${urg ? ' urg' : ''}">${timeStr}</div>`;
            list.appendChild(row);
        });
    } catch(e) { console.error('actRenderActiveCodes', e); }
}

setInterval(async () => {
    if (document.getElementById('act-genOverlay')?.classList.contains('is-open')) {
        await actRenderActiveCodes();
    }
}, 5000);

// ── RESET ─────────────────────────────────────────────────────
async function actConfirmReset() {
    if (!selectedGuildId) return;
    const pw = document.getElementById('act-resetPw')?.value || '';
    // La contraseña se verifica del lado del servidor (solo el dueño del guild puede resetear)
    // El campo de contraseña local queda como confirmación visual; la autorización real es OAuth.
    if (!pw) { showNotification('Ingresa la contraseña para confirmar', 'error'); return; }

    try {
        const res = await apiFetch('/api/actividad/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guild_id: selectedGuildId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data.success) {
            showNotification(data.error || 'No autorizado', 'error');
            return;
        }
        actCloseModal('act-adminOverlay');
        const pwEl = document.getElementById('act-resetPw');
        if (pwEl) pwEl.value = '';
        showNotification(`Puntos de ${data.reset_count} usuarios reiniciados`, 'success');
        await actRefreshLeaderboard();
    } catch(e) {
        showNotification('Error de conexión', 'error');
    }
}

// ── MODALS ────────────────────────────────────────────────────
function actOpenModal(id)  {
    const el = document.getElementById(id);
    if (el) { el.classList.add('is-open'); el.style.display = 'flex'; }
}
function actCloseModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('is-open'); el.style.display = 'none'; }
}

// ── INIT ──────────────────────────────────────────────────────
function actInit() {
    // Redeem
    document.getElementById('act-redeemBtn')?.addEventListener('click', actRedeem);
    document.getElementById('act-codeInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') actRedeem(); });

    // Open gen modal
    document.getElementById('act-openGenBtn')?.addEventListener('click', async () => {
        actOpenModal('act-genOverlay');
        await actRenderActiveCodes();
    });
    document.getElementById('act-genClose')?.addEventListener('click', () => actCloseModal('act-genOverlay'));
    document.getElementById('act-genOverlay')?.addEventListener('click', e => {
        if (e.target.id === 'act-genOverlay') actCloseModal('act-genOverlay');
    });

    // Generate
    document.getElementById('act-generateBtn')?.addEventListener('click', actGenerate);
    document.getElementById('act-copyBtn')?.addEventListener('click', () => {
        const code = document.getElementById('act-codeNum')?.textContent || '';
        navigator.clipboard?.writeText(code).catch(() => {});
        showNotification(`Código ${code} copiado`, 'success');
    });

    // Admin modal
    document.getElementById('act-openAdminBtn')?.addEventListener('click', () => {
        actOpenModal('act-adminOverlay');
        document.getElementById('act-resetPw')?.focus();
    });
    document.getElementById('act-adminClose')?.addEventListener('click',  () => actCloseModal('act-adminOverlay'));
    document.getElementById('act-adminCancel')?.addEventListener('click', () => actCloseModal('act-adminOverlay'));
    document.getElementById('act-adminOverlay')?.addEventListener('click', e => {
        if (e.target.id === 'act-adminOverlay') actCloseModal('act-adminOverlay');
    });
    document.getElementById('act-adminConfirm')?.addEventListener('click', actConfirmReset);
    document.getElementById('act-resetPw')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') actConfirmReset();
    });

    // ESC cierra modales
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { actCloseModal('act-genOverlay'); actCloseModal('act-adminOverlay'); }
    });

    actApplyRole();
}
// ── ADMINISTRACIÓN (gestor de deudas del gremio) ──────────────────
const ADM_CAT_CFG = {
    equipo: { label: 'Equipo', color: '#3a7bd4' },
    pago:   { label: 'Pago',   color: '#e8922a' },
    mant:   { label: 'Mant.',  color: '#2ecc71' }
};
let _admDebts = [];
let _admFilter = 'all';
let _admCatChart = null;
let _admMemberChart = null;
let _admInited = false;
let _admMaxDebt = 1;

function _admFmt(n) {
    const v = Math.round(Number(n) || 0);
    if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + 'K';
    return v.toLocaleString('es');
}

function _admParseAmount(raw) {
    let s = String(raw || '').trim().toLowerCase().replace(/\s|,|\./g, '');
    if (!s) return 0;
    let mult = 1;
    if (s.endsWith('m')) { mult = 1000000; s = s.slice(0, -1); }
    else if (s.endsWith('k')) { mult = 1000; s = s.slice(0, -1); }
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * mult);
}

function _admEscape(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

async function adminLoadView() {
    const gate = document.getElementById('adminGate');
    const content = document.getElementById('adminContent');
    if (!gate || !content) return;

    if (!selectedGuildId) {
        gate.style.display = 'block';
        gate.textContent = 'Inicia sesión para ver esta sección.';
        content.style.display = 'none';
        return;
    }

    gate.style.display = 'block';
    gate.textContent = 'Verificando permisos...';
    content.style.display = 'none';

    try {
        const res = await apiFetch(`/api/admin/can_manage?guild_id=${encodeURIComponent(selectedGuildId)}`, { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        const can = !!(data && data.success && data.can_manage === true);
        if (!can) {
            gate.textContent = 'No tienes permisos para ver esta sección.';
            return;
        }
    } catch (e) {
        gate.textContent = 'No se pudo verificar permisos.';
        return;
    }

    gate.style.display = 'none';
    content.style.display = 'block';

    if (!_admInited) {
        _admInit();
        _admInited = true;
    }

    await _admLoadMembersDatalist();
    await _admFetchDebts();
}

function _admInit() {
    const addBtn = document.getElementById('adm-addBtn');
    if (addBtn) addBtn.addEventListener('click', _admHandleAdd);

    const amtInput = document.getElementById('adm-amt');
    if (amtInput) {
        amtInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') _admHandleAdd();
        });
    }

    document.querySelectorAll('.admin-cat-tag').forEach(el => {
        el.addEventListener('click', () => {
            const f = String(el.getAttribute('data-filter') || 'all');
            _admSetFilter(f);
        });
    });
}

async function _admLoadMembersDatalist() {
    if (!selectedGuildId) return;
    const dl = document.getElementById('adm-members-list');
    if (!dl) return;
    try {
        const res = await apiFetch(`/api/members?guild_id=${encodeURIComponent(selectedGuildId)}&filter=role`, { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const members = Array.isArray(data.members) ? data.members : [];
        members.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        dl.innerHTML = members.map(m => `<option value="${_admEscape(m.name || '')}"></option>`).join('');
    } catch (_) { /* silent */ }
}

async function _admFetchDebts() {
    if (!selectedGuildId) return;
    try {
        const res = await apiFetch(`/api/admin/debts?guild_id=${encodeURIComponent(selectedGuildId)}`, { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            _admDebts = [];
        } else {
            _admDebts = Array.isArray(data.debts) ? data.debts : [];
        }
    } catch (e) {
        console.error(e);
        _admDebts = [];
    }
    _admRefresh();
}

async function _admHandleAdd() {
    if (!selectedGuildId) return;
    const nameEl = document.getElementById('adm-name');
    const descEl = document.getElementById('adm-desc');
    const catEl = document.getElementById('adm-cat');
    const amtEl = document.getElementById('adm-amt');

    const name = String(nameEl?.value || '').trim();
    const desc = String(descEl?.value || '').trim() || 'Sin descripción';
    const cat = String(catEl?.value || 'equipo').trim();
    const amount = _admParseAmount(amtEl?.value);

    if (!name) {
        if (typeof showNotification === 'function') showNotification('Falta el nombre del miembro.', 'error');
        return;
    }
    if (amount <= 0) {
        if (typeof showNotification === 'function') showNotification('Monto inválido.', 'error');
        return;
    }
    if (!['equipo', 'pago', 'mant'].includes(cat)) {
        if (typeof showNotification === 'function') showNotification('Categoría inválida.', 'error');
        return;
    }

    const addBtn = document.getElementById('adm-addBtn');
    if (addBtn) addBtn.disabled = true;
    try {
        const res = await apiFetch(`/api/admin/debts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guild_id: selectedGuildId, name, desc, cat, amount }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            if (typeof showNotification === 'function') showNotification((data && data.error) || 'No se pudo agregar.', 'error');
            return;
        }
        if (nameEl) nameEl.value = '';
        if (descEl) descEl.value = '';
        if (amtEl) amtEl.value = '';
        if (typeof showNotification === 'function') showNotification('Deuda registrada.', 'success');
        await _admFetchDebts();
    } finally {
        if (addBtn) addBtn.disabled = false;
    }
}

async function _admTogglePaid(id) {
    if (!selectedGuildId) return;
    const d = _admDebts.find(x => Number(x.id) === Number(id));
    if (!d) return;
    const nextPaid = !d.paid;
    try {
        const res = await apiFetch(`/api/admin/debts`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guild_id: selectedGuildId, id: Number(id), paid: nextPaid }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            if (typeof showNotification === 'function') showNotification((data && data.error) || 'No se pudo actualizar.', 'error');
            return;
        }
        await _admFetchDebts();
    } catch (e) {
        console.error(e);
    }
}

async function _admDelete(id) {
    if (!selectedGuildId) return;
    if (!confirm('¿Eliminar esta deuda?')) return;
    try {
        const res = await apiFetch(`/api/admin/debts?guild_id=${encodeURIComponent(selectedGuildId)}&id=${encodeURIComponent(String(id))}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            if (typeof showNotification === 'function') showNotification((data && data.error) || 'No se pudo eliminar.', 'error');
            return;
        }
        await _admFetchDebts();
    } catch (e) {
        console.error(e);
    }
}

function _admSetFilter(f) {
    _admFilter = f;
    document.querySelectorAll('.admin-cat-tag').forEach(t => {
        t.classList.toggle('active', String(t.getAttribute('data-filter') || '') === f);
    });
    _admRenderList();
}

function _admRefresh() {
    _admUpdateMetrics();
    _admRenderList();
    _admRenderCharts();
}

function _admUpdateMetrics() {
    const active = _admDebts.filter(d => !d.paid);
    const total = active.reduce((s, d) => s + Number(d.amount || 0), 0);
    const eq = active.filter(d => d.cat === 'equipo').reduce((s, d) => s + Number(d.amount || 0), 0);
    const pg = active.filter(d => d.cat === 'pago').reduce((s, d) => s + Number(d.amount || 0), 0);
    const mn = active.filter(d => d.cat === 'mant').reduce((s, d) => s + Number(d.amount || 0), 0);
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('adm-mTotal', _admFmt(total) + ' 🪙');
    set('adm-mEquipo', _admFmt(eq) + ' 🪙');
    set('adm-mPago', _admFmt(pg) + ' 🪙');
    set('adm-mMant', _admFmt(mn) + ' 🪙');
    _admMaxDebt = Math.max(1, ...active.map(d => Number(d.amount || 0)));
}

function _admRenderList() {
    const el = document.getElementById('adm-debtList');
    const badge = document.getElementById('adm-countBadge');
    if (!el) return;

    let items = _admDebts;
    if (_admFilter === 'paid') items = _admDebts.filter(d => d.paid);
    else if (_admFilter === 'all') items = _admDebts.filter(d => !d.paid);
    else items = _admDebts.filter(d => !d.paid && d.cat === _admFilter);

    if (badge) badge.textContent = items.length + ' registro' + (items.length !== 1 ? 's' : '');

    if (!items.length) {
        el.innerHTML = '<div class="admin-empty">' + (_admFilter === 'paid' ? 'Sin deudas pagadas aún.' : 'Sin deudas en esta categoría.') + '</div>';
        return;
    }

    el.innerHTML = items.map(d => {
        const cfg = ADM_CAT_CFG[d.cat] || ADM_CAT_CFG.equipo;
        const pct = Math.round((Number(d.amount || 0) / _admMaxDebt) * 100);
        const initial = (String(d.name || '?')[0] || '?').toUpperCase();
        const dateTxt = d.date ? String(d.date) : '';
        return `
            <div class="admin-debt-row${d.paid ? ' paid' : ''}">
                <div class="admin-dava" style="${d.paid ? '' : 'color:' + cfg.color + ';border-color:' + cfg.color + '44;'}">${_admEscape(initial)}</div>
                <div class="admin-dinfo">
                    <div class="admin-dname">
                        ${_admEscape(d.name)}
                        <span class="admin-dpill ${_admEscape(d.cat)}">${_admEscape(cfg.label)}</span>
                        ${d.paid ? '<span class="admin-paid-badge">Pagado</span>' : ''}
                    </div>
                    <div class="admin-dsub">${_admEscape(d.desc || 'Sin descripción')}${dateTxt ? ' · ' + _admEscape(dateTxt) : ''}</div>
                    ${!d.paid ? `<div class="admin-dbar"><div class="admin-dbar-fill" style="width:${pct}%;background:${cfg.color};"></div></div>` : ''}
                </div>
                <div class="admin-damt${d.paid ? ' paid-amt' : ''}">${_admFmt(d.amount)} 🪙</div>
                <div class="admin-actions">
                    <button class="admin-btn-xs" data-act="toggle" data-id="${Number(d.id)}" title="${d.paid ? 'Marcar como pendiente' : 'Marcar como pagada'}">${d.paid ? '↩' : '✓'}</button>
                    <button class="admin-btn-xs danger" data-act="del" data-id="${Number(d.id)}" title="Eliminar">✕</button>
                </div>
            </div>
        `;
    }).join('');

    el.querySelectorAll('button[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-id'));
            const act = String(btn.getAttribute('data-act') || '');
            if (act === 'toggle') _admTogglePaid(id);
            else if (act === 'del') _admDelete(id);
        });
    });
}

function _admRenderCharts() {
    if (typeof Chart === 'undefined') return;
    const active = _admDebts.filter(d => !d.paid);
    const eq = active.filter(d => d.cat === 'equipo').reduce((s, d) => s + Number(d.amount || 0), 0);
    const pg = active.filter(d => d.cat === 'pago').reduce((s, d) => s + Number(d.amount || 0), 0);
    const mn = active.filter(d => d.cat === 'mant').reduce((s, d) => s + Number(d.amount || 0), 0);

    const catCanvas = document.getElementById('adm-catChart');
    if (catCanvas) {
        if (_admCatChart) _admCatChart.destroy();
        _admCatChart = new Chart(catCanvas, {
            type: 'doughnut',
            data: {
                labels: ['Equipo', 'Pagos', 'Mantenimiento'],
                datasets: [{
                    data: [eq || 0.01, pg || 0.01, mn || 0.01],
                    backgroundColor: ['rgba(58,123,212,0.8)', 'rgba(232,146,42,0.8)', 'rgba(46,204,113,0.8)'],
                    borderColor: ['#3a7bd4', '#e8922a', '#2ecc71'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: l => _admFmt(l.raw) + ' 🪙' } }
                }
            }
        });
    }

    const memberCanvas = document.getElementById('adm-memberChart');
    const wrap = document.getElementById('adm-memberChartWrap');
    if (memberCanvas && wrap) {
        const memberMap = {};
        active.forEach(d => {
            const k = String(d.name || '');
            if (!memberMap[k]) memberMap[k] = { total: 0, equipo: 0, pago: 0, mant: 0 };
            memberMap[k].total += Number(d.amount || 0);
            if (memberMap[k][d.cat] != null) memberMap[k][d.cat] += Number(d.amount || 0);
        });
        const members = Object.entries(memberMap).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
        wrap.style.height = Math.max(180, members.length * 44 + 60) + 'px';

        if (_admMemberChart) _admMemberChart.destroy();
        if (!members.length) {
            _admMemberChart = null;
            const ctx = memberCanvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, 9999, 9999);
            return;
        }
        _admMemberChart = new Chart(memberCanvas, {
            type: 'bar',
            data: {
                labels: members.map(m => m[0]),
                datasets: [
                    { label: 'Equipo', data: members.map(m => m[1].equipo), backgroundColor: 'rgba(58,123,212,0.75)', borderColor: '#3a7bd4', borderWidth: 1, borderRadius: 3 },
                    { label: 'Pago',   data: members.map(m => m[1].pago),   backgroundColor: 'rgba(232,146,42,0.75)', borderColor: '#e8922a', borderWidth: 1, borderRadius: 3 },
                    { label: 'Mant.',  data: members.map(m => m[1].mant),   backgroundColor: 'rgba(46,204,113,0.75)', borderColor: '#2ecc71', borderWidth: 1, borderRadius: 3 }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: l => l.dataset.label + ': ' + _admFmt(l.raw) + ' 🪙' } }
                },
                scales: {
                    x: { stacked: true, ticks: { color: '#7c8aaa', font: { size: 10 }, callback: v => _admFmt(v) }, grid: { color: '#1c2337' } },
                    y: { stacked: true, ticks: { color: '#c8cfe0', font: { size: 11 } }, grid: { display: false } }
                }
            }
        });
    }
}
