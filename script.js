const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const balanceValue = document.getElementById('balanceValue');
const historyTableBody = document.getElementById('historyTableBody');
const userPill = document.getElementById('userPill');
const serverPill = document.getElementById('serverPill');
const modOpenBtn = document.getElementById('modOpenBtn');
const modModal = document.getElementById('modModal');
const modCloseBtn = document.getElementById('modCloseBtn');
const modAction = document.getElementById('modAction');
const memberFilter = document.getElementById('memberFilter');
const memberList = document.getElementById('memberList');
const voiceChannelField = document.getElementById('voiceChannelField');
const voiceChannelSelect = document.getElementById('voiceChannelSelect');
const announceChannelField = document.getElementById('announceChannelField');
const announceChannelSelect = document.getElementById('announceChannelSelect');
const amountField = document.getElementById('amountField');
const modAmount = document.getElementById('modAmount');
const splitTotalField = document.getElementById('splitTotalField');
const splitTotal = document.getElementById('splitTotal');
const splitRepairField = document.getElementById('splitRepairField');
const splitRepair = document.getElementById('splitRepair');
const splitPercentField = document.getElementById('splitPercentField');
const splitPercent = document.getElementById('splitPercent');
const txSuccess = document.getElementById('txSuccess');
const modApplyBtn = document.getElementById('modApplyBtn');
const modHint = document.getElementById('modHint');
const auditTable = document.getElementById('auditTable');
const auditTableBody = document.getElementById('auditTableBody');

let selectedGuildId = '';

let lastVoiceMembers = [];

const API_BASE_URL = 'https://royalvoidlootsplit.discloud.app';

const SID_STORAGE_KEY = 'lootsplit_sid';

function getSid() {
    return localStorage.getItem(SID_STORAGE_KEY) || '';
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

document.addEventListener('DOMContentLoaded', function() {
    init();
});

async function init() {
    bindMoneyAutoFormat(modAmount);
    bindMoneyAutoFormat(splitTotal);
    bindMoneyAutoFormat(splitRepair);

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
        if (name) {
            userPill.textContent = name;
            userPill.style.display = 'inline-flex';
        }
        await loadGuilds();
    } catch (e) {
        console.error(e);
        setLoggedOutUI();
    }
}

function setLoggedOutUI() {
    loginBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'none';
    balanceValue.textContent = '-';
    historyTableBody.innerHTML = '';
    userPill.style.display = 'none';
    serverPill.style.display = 'none';
    if (modOpenBtn) modOpenBtn.style.display = 'none';
    closeModModal();
    selectedGuildId = '';
}

function setLoggedInUI() {
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
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
        balanceValue.textContent = '-';
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
    if (!modOpenBtn) return;
    try {
        const res = await apiFetch(`/api/admin/can_manage?guild_id=${encodeURIComponent(guildId)}`, { method: 'GET' });
        if (!res.ok) {
            modOpenBtn.style.display = 'none';
            return false;
        }
        const data = await res.json();
        const can = !!(data && data.success && data.can_manage === true);
        modOpenBtn.style.display = can ? 'inline-flex' : 'none';
        if (can) {
            syncActionUI();
        }
        return can;
    } catch (e) {
        console.error(e);
        modOpenBtn.style.display = 'none';
        return false;
    }
}

function openModModal() {
    if (!modModal) return;
    modModal.classList.add('is-open');
    console.log('mod modal open');
    hideModHint();
    syncActionUI();
    syncMemberUI();
    loadAnnounceChannels();
    loadMemberOptions();
}

async function loadAnnounceChannels() {
    if (!selectedGuildId || !announceChannelSelect) return;
    const res = await apiFetch(`/api/channels?guild_id=${encodeURIComponent(selectedGuildId)}`, { method: 'GET' });
    if (!res.ok) {
        announceChannelSelect.innerHTML = '';
        return;
    }
    const data = await res.json().catch(() => ({}));
    const channels = Array.isArray(data.channels) ? data.channels : [];
    announceChannelSelect.innerHTML = '<option value="">Selecciona un canal...</option>' + channels
        .map(ch => `<option value="${escapeHtml(String(ch.id || ''))}">#${escapeHtml(String(ch.name || ch.id || ''))}</option>`)
        .join('');
}

function closeModModal() {
    if (!modModal) return;
    modModal.classList.remove('is-open');
    hideModHint();
    setAuditVisible(false);
}

function showModHint(msg) {
    if (!modHint) return;
    modHint.style.display = 'block';
    modHint.textContent = msg;
}

function hideModHint() {
    if (!modHint) return;
    modHint.style.display = 'none';
    modHint.textContent = '';
}

function setAuditVisible(visible) {
    if (!auditTable) return;
    auditTable.style.display = visible ? 'table' : 'none';
    if (!visible && auditTableBody) auditTableBody.innerHTML = '';
}

function syncActionUI() {
    const action = String(modAction?.value || 'audit');
    const needsAmount = action === 'load' || action === 'pay' || action === 'set';
    if (amountField) amountField.style.display = needsAmount ? 'block' : 'none';
    setAuditVisible(action === 'audit');
    if (announceChannelField) {
        announceChannelField.style.display = action === 'load' ? 'block' : 'none';
    }

    const isSplit = action === 'autosplit';
    if (splitTotalField) splitTotalField.style.display = isSplit ? 'block' : 'none';
    if (splitRepairField) splitRepairField.style.display = isSplit ? 'block' : 'none';
    if (splitPercentField) splitPercentField.style.display = isSplit ? 'block' : 'none';
}

function syncMemberUI() {
    const filt = String(memberFilter?.value || 'role');
    const isVoice = filt === 'voice';
    if (voiceChannelField) voiceChannelField.style.display = isVoice ? 'block' : 'none';
}

function renderMemberCheckboxes(members, { autoSelectAll = false } = {}) {
    if (!memberList) return;
    memberList.innerHTML = '';

    for (const m of Array.isArray(members) ? members : []) {
        const uid = String(m?.id ?? '').trim();
        const name = String(m?.name ?? uid).trim();
        if (!/^\d{5,}$/.test(uid)) continue;

        const row = document.createElement('label');
        row.className = 'member-item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'member-item-checkbox';
        cb.value = uid;
        cb.checked = !!autoSelectAll;

        const text = document.createElement('span');
        text.className = 'member-item-label';
        text.textContent = name;

        row.appendChild(cb);
        row.appendChild(text);
        memberList.appendChild(row);
    }
}

async function loadMemberOptions() {
    if (!selectedGuildId || !memberList) return;
    const filt = String(memberFilter?.value || 'role');
    const qs = new URLSearchParams({ guild_id: selectedGuildId, filter: filt });
    if (filt === 'voice' && voiceChannelSelect && voiceChannelSelect.value) {
        qs.set('voice_channel_id', String(voiceChannelSelect.value));
    }
    const res = await apiFetch(`/api/members?${qs.toString()}`, { method: 'GET' });
    if (!res.ok) {
        memberList.innerHTML = '';
        return;
    }
    const data = await res.json();
    const members = Array.isArray(data.members) ? data.members : [];
    const channels = Array.isArray(data.channels) ? data.channels : [];

    if (filt === 'voice' && voiceChannelSelect) {
        const existing = String(voiceChannelSelect.value || '');
        voiceChannelSelect.innerHTML = channels
            .map(ch => `<option value="${escapeHtml(String(ch.id || ''))}">${escapeHtml(String(ch.name || ch.id || ''))}</option>`)
            .join('');

        if (existing && Array.from(voiceChannelSelect.options).some(o => o.value === existing)) {
            voiceChannelSelect.value = existing;
        }
    }

    lastVoiceMembers = members;
    renderMemberCheckboxes(members, { autoSelectAll: filt === 'voice' });
}

function getSelectedUserIds() {
    if (!memberList) return [];
    const cbs = Array.from(memberList.querySelectorAll('input[type="checkbox"]'));
    const ids = cbs.filter(cb => cb.checked).map(cb => String(cb.value || '').trim());
    return ids.filter(x => /^\d{5,}$/.test(x));
}

function _parseNumberOrZero(v) {
    const s = String(v ?? '').trim();
    if (!s) return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}

function parseMoneyInt(value) {
    // Accept formats like: 100000, 100,000, 100 000
    const s = String(value ?? '').trim();
    if (!s) return 0;
    const cleaned = s.replace(/[^0-9\-]/g, '');
    if (!cleaned || cleaned === '-' ) return 0;
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) ? n : 0;
}

function formatMoneyInput(el) {
    if (!el) return;
    const n = parseMoneyInt(el.value);
    if (!n) {
        el.value = '';
        return;
    }
    el.value = formatAmount(n);
}

function bindMoneyAutoFormat(el) {
    if (!el || el.__moneyBound) return;
    el.__moneyBound = true;
    el.addEventListener('blur', () => formatMoneyInput(el));
}

function showTxSuccess() {
    if (!txSuccess) return;
    txSuccess.style.display = 'grid';
    setTimeout(() => {
        txSuccess.style.display = 'none';
    }, 1400);
}

function resetTxInputs() {
    formatMoneyInput(modAmount);
    formatMoneyInput(splitTotal);
    formatMoneyInput(splitRepair);
    if (modAmount) modAmount.value = '';
    if (splitTotal) splitTotal.value = '';
    if (splitRepair) splitRepair.value = '';
    if (splitPercent) splitPercent.value = '';
}

function describeTxType(tx) {
    const t = String(tx || '').toLowerCase();
    if (t === 'payment') return 'Pago';
    if (t === 'deposit') return 'Carga';
    if (t === 'set') return 'Set';
    if (t === 'removed_on_leave') return 'Salida';
    return t ? t : '-';
}

function signedAmountForAudit(item) {
    const t = String(item?.transaction_type || '').toLowerCase();
    const a = Number(item?.amount || 0);
    if (t === 'payment') return -Math.abs(a);
    if (t === 'deposit') return Math.abs(a);
    return a;
}

async function runAudit(userId) {
    const res = await apiFetch(`/api/admin/history?guild_id=${encodeURIComponent(selectedGuildId)}&user_id=${encodeURIComponent(userId)}&limit=50`, { method: 'GET' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
        showModHint((data && data.error) ? String(data.error) : 'No se pudo auditar.');
        return;
    }
    const history = Array.isArray(data.history) ? data.history : [];
    if (auditTableBody) {
        auditTableBody.innerHTML = '';
        for (const item of history) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(String(item.admin_name || ''))}</td>
                <td>${escapeHtml(String(item.paid_at || ''))}</td>
                <td>${escapeHtml(describeTxType(item.transaction_type))}</td>
                <td>${escapeHtml(formatAmount(signedAmountForAudit(item)))}</td>
            `;
            auditTableBody.appendChild(row);
        }
    }
}

async function applyModAction() {
    hideModHint();
    if (!selectedGuildId) return;
    const action = String(modAction?.value || 'audit');
    const userIds = getSelectedUserIds();
    if (userIds.length === 0) {
        showModHint('Selecciona al menos un usuario válido.');
        return;
    }

    if (action === 'audit') {
        if (userIds.length !== 1) {
            showModHint('Para auditar selecciona solo 1 usuario.');
            return;
        }
        await runAudit(userIds[0]);
        showTxSuccess();
        resetTxInputs();
        return;
    }

    if (action === 'autosplit') {
        const total = parseMoneyInt(splitTotal?.value);
        const repair = parseMoneyInt(splitRepair?.value);
        const pct = _parseNumberOrZero(splitPercent?.value);

        if (!Number.isFinite(total) || total <= 0) {
            showModHint('Monto total inválido.');
            return;
        }
        if (!Number.isFinite(repair) || repair < 0) {
            showModHint('Costo de reparación inválido.');
            return;
        }
        if (!Number.isFinite(pct) || pct < 0) {
            showModHint('Porcentaje inválido.');
            return;
        }
        if (userIds.length < 1) {
            showModHint('Selecciona al menos 1 usuario.');
            return;
        }

        const fee = Math.floor(total * (pct / 100));
        const net = total - repair - fee;
        if (net <= 0) {
            showModHint('El total no alcanza para cubrir reparación y porcentaje.');
            return;
        }
        const perUser = Math.floor(net / userIds.length);
        if (perUser <= 0) {
            showModHint('El monto por persona quedó en 0.');
            return;
        }

        const ok = window.confirm(
            `Confirmar Auto split\n\n` +
            `Usuarios: ${userIds.length}\n` +
            `Total: ${formatAmount(total)}\n` +
            `Reparación: ${formatAmount(repair)}\n` +
            `Porcentaje: ${pct}% (${formatAmount(fee)})\n` +
            `Neto a repartir: ${formatAmount(net)}\n` +
            `A cada uno: ${formatAmount(perUser)}\n\n` +
            `¿Deseas aplicar la carga?`
        );
        if (!ok) {
            showModHint('Auto split cancelado.');
            return;
        }

        modApplyBtn.disabled = true;
        try {
            const res = await apiFetch(`/api/admin/balance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    guild_id: selectedGuildId,
                    user_ids: userIds,
                    amount: Math.abs(perUser),
                    mode: 'add',
                    announce_channel_id: '',
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                showModHint((data && data.error) ? String(data.error) : 'No se pudo aplicar el auto split.');
                return;
            }
            showModHint(`Auto split listo. Total: ${formatAmount(total)} | Reparación: ${formatAmount(repair)} | %: ${pct}% (${formatAmount(fee)}) | Neto: ${formatAmount(net)} | Por persona: ${formatAmount(perUser)} | Usuarios: ${userIds.length}`);
            await refreshData(selectedGuildId);
            showTxSuccess();
            resetTxInputs();
        } finally {
            modApplyBtn.disabled = false;
        }
        return;
    }

    const amountRaw = String(modAmount?.value || '').trim();
    const parsedAmount = parseMoneyInt(amountRaw);
    if (!amountRaw || !Number.isFinite(parsedAmount) || parsedAmount === 0) {
        showModHint('Monto inválido.');
        return;
    }
    let amount = parsedAmount;
    let mode = 'add';
    if (action === 'set') {
        mode = 'set';
    } else if (action === 'pay') {
        amount = -Math.abs(amount);
    } else {
        amount = Math.abs(amount);
    }

    modApplyBtn.disabled = true;
    try {
        const announce_channel_id = action === 'load' ? String(announceChannelSelect?.value || '').trim() : '';
        if (action === 'load' && !announce_channel_id) {
            showModHint('Selecciona un canal para enviar el mensaje.');
            return;
        }
        const res = await apiFetch(`/api/admin/balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guild_id: selectedGuildId, user_ids: userIds, amount, mode, announce_channel_id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            showModHint((data && data.error) ? String(data.error) : 'No se pudo aplicar.');
            return;
        }
        if (Array.isArray(data.results)) {
            showModHint(`Listo. Aplicado a ${data.results.length} usuarios.`);
        } else {
            showModHint(`Listo. Nuevo balance: ${formatAmount(data.new_balance)}`);
        }
        await refreshData(selectedGuildId);
        showTxSuccess();
        resetTxInputs();
    } finally {
        modApplyBtn.disabled = false;
    }
}

if (modOpenBtn) {
    const handler = (e) => {
        try {
            e.preventDefault();
            e.stopPropagation();
        } catch (_) {}
        openModModal();
    };
    modOpenBtn.addEventListener('pointerup', handler);
    modOpenBtn.addEventListener('click', handler);
}
if (modCloseBtn) modCloseBtn.addEventListener('click', closeModModal);
if (modModal) {
    modModal.addEventListener('click', (e) => {
        if (e.target === modModal) closeModModal();
    });
}
if (modAction) modAction.addEventListener('change', () => {
    syncActionUI();
    syncMemberUI();
});
if (memberFilter) memberFilter.addEventListener('change', () => {
    syncMemberUI();
    loadMemberOptions();
});
if (voiceChannelSelect) voiceChannelSelect.addEventListener('change', loadMemberOptions);
if (modApplyBtn) modApplyBtn.addEventListener('click', applyModAction);

async function refreshData(guildId) {
    await Promise.all([refreshBalance(guildId), refreshLeaderboard(guildId), refreshModAccessUI(guildId)]);
}

async function refreshBalance(guildId) {
    const res = await apiFetch(`/api/balance?guild_id=${encodeURIComponent(guildId)}`, { method: 'GET' });
    if (!res.ok) {
        balanceValue.textContent = '-';
        return;
    }
    const data = await res.json();
    if (!data.success) {
        balanceValue.textContent = '-';
        return;
    }
    balanceValue.textContent = formatAmount(data.balance);
}

async function refreshLeaderboard(guildId) {
    const res = await apiFetch(`/api/leaderboard?guild_id=${encodeURIComponent(guildId)}&limit=50`, { method: 'GET' });
    if (!res.ok) {
        historyTableBody.innerHTML = '';
        return;
    }
    const data = await res.json();
    if (!data.success) {
        historyTableBody.innerHTML = '';
        return;
    }
    const rows = Array.isArray(data.leaderboard) ? data.leaderboard : [];
    historyTableBody.innerHTML = '';
    for (const item of rows) {
        const row = document.createElement('tr');
        const name = String(item.user_name || item.user_id || '');
        const bal = Number(item.balance || 0);
        row.innerHTML = `
            <td>${escapeHtml(name)}</td>
            <td style="text-align:right;">${escapeHtml(formatAmount(bal))}</td>
        `;
        historyTableBody.appendChild(row);
    }
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
