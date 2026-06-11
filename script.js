const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const balanceValue = document.getElementById('balanceValue');
const historyTableBody = document.getElementById('historyTableBody');
const userPill = document.getElementById('userPill');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const serverPill = document.getElementById('serverPill');
const membersTableBody = document.getElementById('membersTableBody');
const membersVoiceBar = document.getElementById('membersVoiceBar');
const membersVoiceTrigger = document.getElementById('membersVoiceTrigger');
const membersVoicePanel = document.getElementById('membersVoicePanel');
const membersVoiceLabel = document.getElementById('membersVoiceLabel');
const membersVoiceApplyBtn = document.getElementById('membersVoiceApplyBtn');
const membersVoiceHint = document.getElementById('membersVoiceHint');
const modOpenBtn = document.getElementById('modOpenBtn');
const modModal = document.getElementById('modModal');
const modCloseBtn = document.getElementById('modCloseBtn');
const modAction = document.getElementById('modAction');
const memberFilter = document.getElementById('memberFilter');
const memberSelect = document.getElementById('memberSelect');
const memberCheckboxList = document.getElementById('memberCheckboxList');
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
const modApplyBtn = document.getElementById('modApplyBtn');
const modSuccess = document.getElementById('modSuccess');
const modHint = document.getElementById('modHint');
const auditTable = document.getElementById('auditTable');
const auditTableBody = document.getElementById('auditTableBody');

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

const splitsTableBody = document.getElementById('splitsTableBody');
const nsDate = document.getElementById('nsDate');
const nsName = document.getElementById('nsName');
const nsTotal = document.getElementById('nsTotal');
const nsChannelSelect = document.getElementById('nsChannelSelect');
const nsCreateBtn = document.getElementById('nsCreateBtn');
const nsHint = document.getElementById('nsHint');
const nsVoiceSelect = document.getElementById('nsVoiceSelect');
const nsVoiceTrigger = document.getElementById('nsVoiceTrigger');
const nsVoicePanel = document.getElementById('nsVoicePanel');
const nsVoiceLabel = document.getElementById('nsVoiceLabel');
const nsChannelTrigger = document.getElementById('nsChannelTrigger');
const nsChannelPanel = document.getElementById('nsChannelPanel');
const nsChannelLabel = document.getElementById('nsChannelLabel');
const nsMemberSearch = document.getElementById('nsMemberSearch');
const nsSelectAllBtn = document.getElementById('nsSelectAllBtn');
const nsClearAllBtn = document.getElementById('nsClearAllBtn');
const nsMembersList = document.getElementById('nsMembersList');
const nsPreviewMeta = document.getElementById('nsPreviewMeta');
const nsPreviewList = document.getElementById('nsPreviewList');

let selectedGuildId = '';

const navItems = Array.from(document.querySelectorAll('.nav-item[data-view]'));

let lastVoiceMembers = [];

const API_BASE_URL = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? ''
    : 'https://royalvoidlootsplit.discloud.app';

const SID_STORAGE_KEY = 'lootsplit_sid';

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getSid() {
    return localStorage.getItem(SID_STORAGE_KEY) || '';
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

const MEMBER_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const MEMBER_DAY_LABELS = { mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes' };
let membersRosterWeek = '';
let canManageMembersRoster = false;
let selectedMembersVoiceChannelId = '';
let selectedMembersVoiceChannelName = '';

function getTodayMemberDay() {
    const map = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' };
    return map[new Date().getDay()] || null;
}

function getTodayMemberDayLabel() {
    const day = getTodayMemberDay();
    return day ? (MEMBER_DAY_LABELS[day] || day) : null;
}

function getIsoWeekKey(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function cycleAttendanceMark(current) {
    if (!current || current === '') return 'check';
    if (current === 'check') return 'x';
    return '';
}

function renderAttendanceCell(mark) {
    if (mark === 'check') return '<span class="att-mark att-check" aria-label="Presente">✓</span>';
    if (mark === 'x') return '<span class="att-mark att-x" aria-label="Ausente">✗</span>';
    return '<span class="att-mark att-empty" aria-hidden="true">·</span>';
}

async function saveMemberRosterUpdate(payload) {
    const res = await apiFetch('/api/members/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: selectedGuildId, week: membersRosterWeek, ...payload }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo guardar');
    }
}

function renderMembersTable(members, weekKey, canManage) {
    if (!membersTableBody) return;
    try {
        canManageMembersRoster = !!canManage;
        membersRosterWeek = weekKey;
        membersTableBody.innerHTML = '';

        if (membersVoiceBar) {
            membersVoiceBar.hidden = !canManage;
        }
        if (canManage) {
            loadMembersVoiceChannels();
            updateMembersVoiceHint();
        }

        const todayDay = getTodayMemberDay();
        const dayClassMap = { mon: 'col-day-mon', tue: 'col-day-tue', wed: 'col-day-wed', thu: 'col-day-thu', fri: 'col-day-fri' };
        document.querySelectorAll('#membersTable thead .col-day').forEach((th) => th.classList.remove('col-day-today'));
        if (todayDay && dayClassMap[todayDay]) {
            const thToday = document.querySelector(`#membersTable thead .${dayClassMap[todayDay]}`);
            if (thToday) thToday.classList.add('col-day-today');
        }

        if (!members.length) {
            membersTableBody.innerHTML = '<tr><td colspan="9" class="members-empty">Sin miembros para mostrar.</td></tr>';
            return;
        }

        members.forEach((m, index) => {
        const userId = String(m.user_id || m.id || '');
        const name = String(m.name || userId || '').trim();
        const primaryRole = String(m.primary_role || '');
        const secondaryRole = String(m.secondary_role || '');
        const att = m.attendance && typeof m.attendance === 'object' ? m.attendance : {};

        const tr = document.createElement('tr');
        tr.dataset.userId = userId;
        if (!canManage) tr.classList.add('members-row-readonly');

        let dayCells = '';
        for (const day of MEMBER_DAYS) {
            const mark = att[day] || '';
            const title = canManage ? 'Clic: ✓ / ✗ / vacío' : 'Solo mods pueden editar';
            const isToday = day === todayDay;
            const cls = [
                canManage ? 'att-cell' : 'att-cell att-cell-readonly',
                isToday ? 'att-cell-today' : '',
            ].filter(Boolean).join(' ');
            dayCells += `<td class="${cls}" data-day="${day}" data-mark="${mark}" title="${title}">${renderAttendanceCell(mark)}</td>`;
        }

        tr.innerHTML = `
            <td class="col-num">${index + 1}</td>
            <td class="col-player">
                <div class="member-player">
                    <span class="member-player-ava">${escapeHtml(name ? name[0].toUpperCase() : '?')}</span>
                    <span class="member-player-name">${escapeHtml(name)}</span>
                </div>
            </td>
            <td class="col-role">
                <input type="text" class="member-role-input" data-field="primary_role" value="${escapeHtml(primaryRole)}" placeholder="—" autocomplete="off" ${canManage ? '' : 'readonly disabled'}>
            </td>
            <td class="col-role">
                <input type="text" class="member-role-input" data-field="secondary_role" value="${escapeHtml(secondaryRole)}" placeholder="—" autocomplete="off" ${canManage ? '' : 'readonly disabled'}>
            </td>
            ${dayCells}
        `;

        if (canManage) {
            tr.querySelectorAll('.member-role-input').forEach((input) => {
                input.addEventListener('change', async () => {
                    const field = input.getAttribute('data-field');
                    const prev = input.defaultValue;
                    try {
                        await saveMemberRosterUpdate({
                            user_id: tr.dataset.userId,
                            [field]: String(input.value || '').trim(),
                        });
                        input.defaultValue = input.value;
                    } catch (e) {
                        input.value = prev;
                        alert(e.message || 'Error al guardar el rol');
                    }
                });
            });

            tr.querySelectorAll('.att-cell').forEach((cell) => {
                cell.addEventListener('click', async () => {
                    const day = cell.getAttribute('data-day');
                    const current = cell.getAttribute('data-mark') || '';
                    const next = cycleAttendanceMark(current);
                    const prevHtml = cell.innerHTML;
                    const prevMark = current;
                    cell.setAttribute('data-mark', next);
                    cell.innerHTML = renderAttendanceCell(next);
                    try {
                        await saveMemberRosterUpdate({ user_id: tr.dataset.userId, day, mark: next });
                    } catch (e) {
                        cell.setAttribute('data-mark', prevMark);
                        cell.innerHTML = prevHtml;
                        alert(e.message || 'Error al guardar asistencia');
                    }
                });
            });
        }

        membersTableBody.appendChild(tr);
    });

    const sub = document.getElementById('membersPageSub');
    if (sub) {
        sub.textContent = canManage
            ? 'Roles y asistencia semanal (Lun–Vie) — edición de mods'
            : 'Roles y asistencia semanal (Lun–Vie) — solo lectura';
    }
    } catch (renderErr) {
        console.error('renderMembersTable error:', renderErr);
        membersTableBody.innerHTML = '<tr><td colspan="9" class="members-empty">Error al mostrar miembros.</td></tr>';
    }
}

function updateMembersVoiceHint(extra) {
    if (!membersVoiceHint) return;
    const dayLabel = getTodayMemberDayLabel();
    if (!dayLabel) {
        membersVoiceHint.textContent = 'Hoy no es día laboral (Lun–Vie). La asistencia automática no aplica sábado/domingo.';
        if (membersVoiceApplyBtn) membersVoiceApplyBtn.disabled = true;
        return;
    }
    if (membersVoiceApplyBtn) membersVoiceApplyBtn.disabled = false;
    const base = `Día actual: ${dayLabel} · En canal = ✓ · Fuera = ✗`;
    membersVoiceHint.textContent = extra ? `${base} · ${extra}` : base;
}

async function loadMembersVoiceChannels() {
    if (!membersVoicePanel || !selectedGuildId || !canManageMembersRoster) return;
    membersVoicePanel.innerHTML = '<div class="picker-empty">Cargando canales…</div>';
    selectedMembersVoiceChannelId = '';
    selectedMembersVoiceChannelName = '';
    if (membersVoiceLabel) {
        membersVoiceLabel.textContent = 'Selecciona un canal de voz…';
        membersVoiceLabel.classList.add('is-placeholder');
    }
    try {
        const qs = new URLSearchParams({ guild_id: selectedGuildId, filter: 'voice' });
        const res = await apiFetch(`/api/members?${qs.toString()}`, { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        const channels = res.ok && Array.isArray(data.channels) ? data.channels : [];
        _renderPickerOptions(membersVoicePanel, channels.map((ch) => ({
            id: ch.id,
            name: String(ch.name || ch.id || ''),
        })), { placeholder: 'Sin canales de voz', prefix: '🔊' });
    } catch (e) {
        console.error(e);
        if (membersVoicePanel) {
            membersVoicePanel.innerHTML = '<div class="picker-empty">Error cargando canales</div>';
        }
    }
}

async function applyMembersVoiceAttendance() {
    if (!canManageMembersRoster || !selectedGuildId) return;
    const day = getTodayMemberDay();
    const dayLabel = getTodayMemberDayLabel();
    if (!day || !dayLabel) {
        alert('La asistencia automática solo aplica de lunes a viernes.');
        return;
    }
    if (!selectedMembersVoiceChannelId) {
        alert('Selecciona un canal de voz primero.');
        return;
    }
    const ok = confirm(
        `¿Aplicar asistencia de ${dayLabel} según el canal "${selectedMembersVoiceChannelName}"?\n\n` +
        '✓ Presentes: miembros conectados en ese canal\n' +
        '✗ Ausentes: el resto del roster'
    );
    if (!ok) return;

    if (membersVoiceApplyBtn) membersVoiceApplyBtn.disabled = true;
    updateMembersVoiceHint('Aplicando…');
    try {
        const res = await apiFetch('/api/members/roster/apply-voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                guild_id: selectedGuildId,
                week: membersRosterWeek || getIsoWeekKey(),
                voice_channel_id: selectedMembersVoiceChannelId,
                day,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'No se pudo aplicar la asistencia');
        }
        const present = Number(data.present_count || 0);
        const absent = Number(data.absent_count || 0);
        showNotification(`Asistencia de ${dayLabel}: ${present} presentes, ${absent} ausentes.`, 'success');
        updateMembersVoiceHint(`${present} ✓ · ${absent} ✗`);
        await loadMembersView();
    } catch (e) {
        console.error(e);
        alert(e.message || 'Error al aplicar asistencia');
        updateMembersVoiceHint();
    } finally {
        if (membersVoiceApplyBtn) membersVoiceApplyBtn.disabled = !getTodayMemberDay();
    }
}

async function loadMembersView() {
    if (!membersTableBody) return;
    if (membersVoiceBar) membersVoiceBar.hidden = true;
    if (!selectedGuildId) {
        membersTableBody.innerHTML = '<tr><td colspan="9" class="members-empty">Inicia sesión para ver miembros.</td></tr>';
        return;
    }
    membersTableBody.innerHTML = '<tr><td colspan="9" class="members-empty">Cargando...</td></tr>';

    const weekKey = getIsoWeekKey();

    try {
        let usedRoster = false;
        try {
            const qs = new URLSearchParams({ guild_id: selectedGuildId, week: weekKey });
            const rosterRes = await apiFetch(`/api/members/roster?${qs.toString()}`, { method: 'GET' });
            if (rosterRes.ok) {
                const data = await rosterRes.json().catch(() => ({}));
                if (data && data.success !== false) {
                    const members = Array.isArray(data.members) ? data.members : [];
                    renderMembersTable(members, String(data.week || weekKey), !!data.can_manage);
                    usedRoster = true;
                }
            }
        } catch (rosterErr) {
            console.warn('Roster API no disponible, usando fallback:', rosterErr);
        }
        if (usedRoster) return;

        const [mRes, modRes] = await Promise.all([
            apiFetch(`/api/members?${new URLSearchParams({ guild_id: selectedGuildId, filter: 'role' }).toString()}`, { method: 'GET' }),
            apiFetch(`/api/admin/can_manage?guild_id=${encodeURIComponent(selectedGuildId)}`, { method: 'GET' }),
        ]);

        if (mRes.status === 401) {
            membersTableBody.innerHTML = '<tr><td colspan="9" class="members-empty">Sesión expirada. Vuelve a iniciar sesión.</td></tr>';
            return;
        }
        if (!mRes.ok) {
            membersTableBody.innerHTML = '<tr><td colspan="9" class="members-empty">No se pudo cargar miembros.</td></tr>';
            return;
        }

        const mData = await mRes.json().catch(() => ({}));
        const raw = Array.isArray(mData.members) ? mData.members : [];
        let canManage = false;
        if (modRes.ok) {
            const modData = await modRes.json().catch(() => ({}));
            canManage = !!(modData && modData.success && modData.can_manage);
        }
        const members = raw.map((m) => ({
            user_id: String(m.id || m.user_id || ''),
            name: String(m.name || m.id || ''),
            primary_role: '',
            secondary_role: '',
            attendance: { mon: '', tue: '', wed: '', thu: '', fri: '' },
        }));
        renderMembersTable(members, weekKey, canManage);
    } catch (e) {
        console.error('loadMembersView error:', e);
        membersTableBody.innerHTML = '<tr><td colspan="9" class="members-empty">Error de conexión. Recarga la página.</td></tr>';
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

document.addEventListener('DOMContentLoaded', function() {
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
    }

    if (id === 'splits') {
        loadSplitsView();
    }

    if (id === 'new-split') {
        loadNewSplitView();
    }
}

function _setNsHint(msg) {
    if (!nsHint) return;
    const m = String(msg || '').trim();
    if (!m) {
        nsHint.style.display = 'none';
        nsHint.textContent = '';
        return;
    }
    nsHint.textContent = m;
    nsHint.style.display = 'block';
}

function _parseAmountText(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return null;
    const m = s.match(/^\s*([0-9]+(?:\.[0-9]+)?)\s*([kmb])?\s*$/i);
    if (!m) {
        const digits = s.replace(/,/g, '');
        if (/^\d+$/.test(digits)) return parseInt(digits, 10);
        return null;
    }
    const num = Number(m[1]);
    if (!Number.isFinite(num) || num < 0) return null;
    const suffix = (m[2] || '').toLowerCase();
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
        const uidRaw = String(it.getAttribute('data-user-id') || '').trim();
        if (!uidRaw) continue;
        const uid = parseInt(uidRaw, 10);
        if (!Number.isFinite(uid)) continue;
        const name = String(it.getAttribute('data-user-name') || '').trim();
        out.push({ user_id: uid, name });
    }
    return out;
}

function _toggleMemberItem(itemEl) {
    if (!itemEl || !itemEl.classList.contains('member-item')) return;
    itemEl.classList.toggle('checked');
    const check = itemEl.querySelector('.m-check');
    if (check) check.textContent = itemEl.classList.contains('checked') ? '✓' : '';
    _renderNewSplitPreview();
}

function _filterNewSplitMembers() {
    if (!nsMembersList || !nsMemberSearch) return;
    const q = String(nsMemberSearch.value || '').trim().toLowerCase();
    for (const it of Array.from(nsMembersList.querySelectorAll('.member-item'))) {
        if (it.classList.contains('guild-row')) {
            it.style.display = q ? 'none' : '';
            continue;
        }
        const name = String(it.getAttribute('data-user-name') || '').toLowerCase();
        it.style.display = !q || name.includes(q) ? '' : 'none';
    }
}

function _setAllMembersChecked(checked) {
    if (!nsMembersList) return;
    for (const it of Array.from(nsMembersList.querySelectorAll('.member-item'))) {
        if (it.classList.contains('guild-row')) continue;
        if (it.style.display === 'none') continue;
        it.classList.toggle('checked', checked);
        const check = it.querySelector('.m-check');
        if (check) check.textContent = checked ? '✓' : '';
    }
    _renderNewSplitPreview();
}

function _closeAllPickers(exceptPanel) {
    for (const panel of [nsChannelPanel, nsVoicePanel]) {
        if (!panel || panel === exceptPanel) continue;
        panel.hidden = true;
    }
    for (const btn of [nsChannelTrigger, nsVoiceTrigger]) {
        if (!btn) continue;
        const panel = btn === nsChannelTrigger ? nsChannelPanel : nsVoicePanel;
        if (panel === exceptPanel) continue;
        btn.setAttribute('aria-expanded', 'false');
        btn.classList.remove('is-open');
    }
}

function _bindPicker(trigger, panel, onPick) {
    if (!trigger || !panel) return;
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = panel.hidden;
        _closeAllPickers(willOpen ? panel : null);
        panel.hidden = !willOpen;
        trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        trigger.classList.toggle('is-open', willOpen);
    });
    panel.addEventListener('click', (e) => {
        e.stopPropagation();
        const opt = e.target.closest('.picker-option');
        if (!opt) return;
        const value = String(opt.getAttribute('data-value') || '');
        const label = String(opt.getAttribute('data-label') || opt.textContent || '').trim();
        onPick(value, label, opt);
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        trigger.classList.remove('is-open');
    });
}

function _renderPickerOptions(panel, items, { placeholder, prefix = '' }) {
    if (!panel) return;
    panel.innerHTML = '';
    if (!items.length) {
        panel.innerHTML = `<div class="picker-empty">${escapeHtml(placeholder || 'Sin opciones')}</div>`;
        return;
    }
    for (const item of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'picker-option';
        btn.setAttribute('data-value', String(item.id || ''));
        btn.setAttribute('data-label', String(item.name || item.id || ''));
        btn.innerHTML = `
            <span class="picker-option-prefix">${escapeHtml(prefix)}</span>
            <span class="picker-option-label">${escapeHtml(String(item.name || item.id || ''))}</span>
        `;
        panel.appendChild(btn);
    }
}

function _setChannelSelection(channelId, channelName) {
    if (nsChannelSelect) nsChannelSelect.value = channelId;
    if (nsChannelLabel) {
        nsChannelLabel.textContent = channelName || 'Selecciona un canal';
        nsChannelLabel.classList.toggle('is-placeholder', !channelId);
    }
    _setNsHint('');
}

function _resetVoicePickerLabel() {
    if (nsVoiceLabel) {
        nsVoiceLabel.textContent = 'Auto-seleccionar miembros conectados…';
        nsVoiceLabel.classList.add('is-placeholder');
    }
    if (nsVoiceSelect) nsVoiceSelect.value = '';
}

function _renderNewSplitPreview() {
    if (!nsPreviewMeta || !nsPreviewList) return;

    const total = _parseAmountText(nsTotal?.value);
    const parts = _selectedNewSplitParticipants();

    if (!total || total <= 0) {
        nsPreviewMeta.textContent = 'Ingresa un monto total válido.';
        nsPreviewList.innerHTML = '';
        return;
    }
    if (parts.length <= 0) {
        nsPreviewMeta.textContent = 'Selecciona participantes.';
        nsPreviewList.innerHTML = '';
        return;
    }

    const per = Math.floor(total / parts.length);
    let remainder = total - per * parts.length;

    nsPreviewMeta.textContent = `${parts.length} participantes · ${formatAmount(total)} total · ${formatAmount(per)} por persona`;
    nsPreviewList.innerHTML = '';

    for (const p of parts) {
        let amt = per;
        if (p.user_id === 0 && remainder > 0) {
            amt += remainder;
            remainder = 0;
        }
        const row = document.createElement('div');
        row.className = 'split-preview-row';
        row.innerHTML = `
            <div class="spr-name">${escapeHtml(p.name || String(p.user_id))}</div>
            <div class="spr-amt">${escapeHtml(formatAmount(amt))}</div>
        `;
        nsPreviewList.appendChild(row);
    }
}

async function nsImportFromVoiceChannel(channelId, channelName) {
    if (!nsMembersList || !selectedGuildId || !channelId) return;
    try {
        const qs = new URLSearchParams({
            guild_id: selectedGuildId,
            filter: 'voice',
            voice_channel_id: String(channelId),
        });
        const res = await apiFetch(`/api/members?${qs.toString()}`, { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        const members = Array.isArray(data.members) ? data.members : [];

        if (!members.length) {
            showNotification(`No hay miembros conectados en ${channelName || 'ese canal'}.`, 'error');
            return;
        }

        for (const cb of Array.from(nsMembersList.querySelectorAll('.member-item'))) {
            cb.classList.remove('checked');
            const check = cb.querySelector('.m-check');
            if (check) check.textContent = '';
        }

        let imported = 0;
        for (const m of members) {
            const uid = String(m.id || m.user_id || '').trim();
            if (!uid) continue;
            const row = nsMembersList.querySelector(`.member-item[data-user-id="${uid}"]`);
            if (row) {
                row.classList.add('checked');
                const check = row.querySelector('.m-check');
                if (check) check.textContent = '✓';
                imported++;
            }
        }

        _renderNewSplitPreview();
        showNotification(`${imported} miembro${imported !== 1 ? 's' : ''} seleccionado${imported !== 1 ? 's' : ''} desde 🔊 ${channelName || 'canal de voz'}.`, 'success');
    } catch (e) {
        console.error(e);
        showNotification('Error al importar miembros del canal de voz.', 'error');
    }
}

async function loadNewSplitView() {
    if (!selectedGuildId) {
        _setNsHint('Inicia sesión para crear un split.');
        return;
    }
    _setNsHint('');

    if (nsDate && !nsDate.value) {
        try {
            const d = new Date();
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            nsDate.value = `${yyyy}-${mm}-${dd}`;
        } catch (_) {}
    }

    if (nsChannelSelect) {
        nsChannelSelect.innerHTML = '';
        _setChannelSelection('', '');
    }
    if (nsChannelPanel) {
        nsChannelPanel.innerHTML = '<div class="picker-empty">Cargando canales…</div>';
        nsChannelPanel.hidden = true;
    }
    if (nsChannelTrigger) {
        nsChannelTrigger.setAttribute('aria-expanded', 'false');
        nsChannelTrigger.classList.remove('is-open');
    }

    if (nsVoicePanel) {
        nsVoicePanel.innerHTML = '<div class="picker-empty">Cargando canales…</div>';
        nsVoicePanel.hidden = true;
    }
    if (nsVoiceTrigger) {
        nsVoiceTrigger.setAttribute('aria-expanded', 'false');
        nsVoiceTrigger.classList.remove('is-open');
    }
    _resetVoicePickerLabel();
    if (nsMemberSearch) nsMemberSearch.value = '';

    if (nsMembersList) {
        nsMembersList.innerHTML = '<div class="split-members-loading">Cargando miembros…</div>';
    }
    if (nsPreviewMeta) nsPreviewMeta.textContent = '-';
    if (nsPreviewList) nsPreviewList.innerHTML = '';

    if (nsVoiceSelect) nsVoiceSelect.innerHTML = '';

    try {
        const [chRes, mRes, vRes] = await Promise.all([
            apiFetch(`/api/channels?guild_id=${encodeURIComponent(selectedGuildId)}`, { method: 'GET' }),
            apiFetch(`/api/members?${new URLSearchParams({ guild_id: selectedGuildId, filter: 'role' }).toString()}`, { method: 'GET' }),
            apiFetch(`/api/members?${new URLSearchParams({ guild_id: selectedGuildId, filter: 'voice' }).toString()}`, { method: 'GET' }),
        ]);

        if (!chRes.ok) {
            _setNsHint('No se pudieron cargar los canales.');
        } else {
            const chData = await chRes.json().catch(() => ({}));
            const chans = Array.isArray(chData.channels) ? chData.channels : [];
            if (nsChannelSelect) {
                nsChannelSelect.innerHTML = '';
                for (const c of chans) {
                    const o = document.createElement('option');
                    o.value = String(c.id || '');
                    o.textContent = String(c.name || c.id || '');
                    nsChannelSelect.appendChild(o);
                }
            }
            _renderPickerOptions(nsChannelPanel, chans.map(c => ({
                id: c.id,
                name: String(c.name || c.id || ''),
            })), { placeholder: 'Sin canales de texto' });
            if (nsChannelLabel) nsChannelLabel.classList.add('is-placeholder');
        }

        if (vRes.ok) {
            const vData = await vRes.json().catch(() => ({}));
            const voiceChans = Array.isArray(vData.channels) ? vData.channels : [];
            if (nsVoiceSelect) {
                nsVoiceSelect.innerHTML = '';
                for (const ch of voiceChans) {
                    const o = document.createElement('option');
                    o.value = String(ch.id || '');
                    o.textContent = String(ch.name || ch.id || '');
                    nsVoiceSelect.appendChild(o);
                }
            }
            _renderPickerOptions(nsVoicePanel, voiceChans.map(ch => ({
                id: ch.id,
                name: String(ch.name || ch.id || ''),
            })), { placeholder: 'Sin canales de voz', prefix: '🔊' });
        } else {
            _renderPickerOptions(nsVoicePanel, [], { placeholder: 'Sin canales de voz' });
        }

        if (!mRes.ok) {
            if (nsMembersList) nsMembersList.innerHTML = '<div class="split-members-loading">No se pudieron cargar miembros.</div>';
        } else {
            const mData = await mRes.json().catch(() => ({}));
            const members = Array.isArray(mData.members) ? mData.members : [];
            members.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

            if (nsMembersList) {
                nsMembersList.innerHTML = '';

                const guildRow = document.createElement('div');
                guildRow.className = 'member-item guild-row';
                guildRow.setAttribute('data-user-id', '0');
                guildRow.setAttribute('data-user-name', 'Guild');
                guildRow.innerHTML = `
                    <div class="m-check"></div>
                    <div class="m-ava guild-ava">⚔️</div>
                    <div class="m-name">Guild <span class="m-sub">(opcional)</span></div>
                `;
                guildRow.addEventListener('click', () => _toggleMemberItem(guildRow));
                nsMembersList.appendChild(guildRow);

                for (const m of members) {
                    const uid = String(m.id || '').trim();
                    if (!uid) continue;
                    const name = String(m.name || uid).trim();
                    const initial = name ? name[0].toUpperCase() : '?';
                    const row = document.createElement('div');
                    row.className = 'member-item';
                    row.setAttribute('data-user-id', uid);
                    row.setAttribute('data-user-name', name);
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
    if (!selectedGuildId) {
        _setNsHint('Inicia sesión primero.');
        return;
    }
    const date = String(nsDate?.value || '').trim();
    const name = String(nsName?.value || '').trim();
    const total = _parseAmountText(nsTotal?.value);
    const channelIdRaw = String(nsChannelSelect?.value || '').trim();
    const parts = _selectedNewSplitParticipants();
    if (!date) {
        _setNsHint('Selecciona una fecha.');
        return;
    }
    if (!name) {
        _setNsHint('Escribe el nombre de la actividad.');
        return;
    }
    if (!total || total <= 0) {
        _setNsHint('Monto inválido.');
        return;
    }
    if (!channelIdRaw || !/^\d+$/.test(channelIdRaw)) {
        _setNsHint('Selecciona un canal.');
        return;
    }
    if (parts.length <= 0) {
        _setNsHint('Selecciona participantes.');
        return;
    }

    const per = Math.floor(total / parts.length);
    const remainder = total - per * parts.length;
    const participants = parts.map(p => ({
        user_id: p.user_id,
        amount: p.user_id === 0 ? (per + remainder) : per,
    }));

    if (nsCreateBtn) nsCreateBtn.disabled = true;
    try {
        const res = await apiFetch(`/api/activities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                guild_id: selectedGuildId,
                name,
                date,
                total_amount: total,
                per_person_amount: per,
                status: 'pending',
                channel_id: channelIdRaw,
                participants,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            _setNsHint((data && data.error) ? String(data.error) : 'No se pudo crear.');
            return;
        }
        showNotification('Loot Split creado.', 'success');
        showView('splits');
    } finally {
        if (nsCreateBtn) nsCreateBtn.disabled = false;
    }
}

async function loadSplitsView() {
    if (!splitsTableBody) return;
    if (!selectedGuildId) {
        splitsTableBody.innerHTML = '<tr><td colspan="5" style="color:var(--text2);">Inicia sesión para ver splits.</td></tr>';
        return;
    }
    splitsTableBody.innerHTML = '<tr><td colspan="5" style="color:var(--text2);">Cargando...</td></tr>';
    try {
        const res = await apiFetch(`/api/activities?guild_id=${encodeURIComponent(selectedGuildId)}`, { method: 'GET' });
        if (!res.ok) {
            splitsTableBody.innerHTML = '<tr><td colspan="5" style="color:var(--text2);">No se pudo cargar.</td></tr>';
            return;
        }
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data.activities) ? data.activities : [];
        splitsTableBody.innerHTML = '';
        if (rows.length === 0) {
            splitsTableBody.innerHTML = '<tr><td colspan="5" style="color:var(--text2);">Sin splits.</td></tr>';
            return;
        }
        for (const a of rows) {
            const tr = document.createElement('tr');
            const status = String(a.status || 'pending');
            tr.innerHTML = `
                <td>${escapeHtml(String(a.date || ''))}</td>
                <td>${escapeHtml(String(a.name || ''))}</td>
                <td style="text-align:right;">${escapeHtml(formatAmount(a.total_amount || 0))}</td>
                <td style="text-align:right;">${escapeHtml(formatAmount(a.per_person_amount || 0))}</td>
                <td>${escapeHtml(status)}</td>
            `;
            splitsTableBody.appendChild(tr);
        }
    } catch (e) {
        console.error(e);
        splitsTableBody.innerHTML = '<tr><td colspan="5" style="color:var(--text2);">Error.</td></tr>';
    }
}

if (nsTotal) nsTotal.addEventListener('input', _renderNewSplitPreview);
if (nsTotal) nsTotal.addEventListener('change', _renderNewSplitPreview);
if (nsName) nsName.addEventListener('input', () => _setNsHint(''));
if (nsChannelSelect) nsChannelSelect.addEventListener('change', () => _setNsHint(''));
_bindPicker(nsChannelTrigger, nsChannelPanel, (value, label) => {
    _setChannelSelection(value, label);
});
_bindPicker(nsVoiceTrigger, nsVoicePanel, async (value, label) => {
    if (!value) return;
    if (nsVoiceSelect) nsVoiceSelect.value = value;
    if (nsVoiceLabel) {
        nsVoiceLabel.textContent = label;
        nsVoiceLabel.classList.remove('is-placeholder');
    }
    await nsImportFromVoiceChannel(value, label);
    _resetVoicePickerLabel();
});
if (nsMemberSearch) nsMemberSearch.addEventListener('input', _filterNewSplitMembers);
if (nsSelectAllBtn) nsSelectAllBtn.addEventListener('click', () => _setAllMembersChecked(true));
if (nsClearAllBtn) nsClearAllBtn.addEventListener('click', () => _setAllMembersChecked(false));
document.addEventListener('click', () => _closeAllPickers(null));
_bindPicker(membersVoiceTrigger, membersVoicePanel, (value, label) => {
    selectedMembersVoiceChannelId = value;
    selectedMembersVoiceChannelName = label;
    if (membersVoiceLabel) {
        membersVoiceLabel.textContent = label;
        membersVoiceLabel.classList.remove('is-placeholder');
    }
});
if (membersVoiceApplyBtn) membersVoiceApplyBtn.addEventListener('click', applyMembersVoiceAttendance);
if (nsCreateBtn) nsCreateBtn.addEventListener('click', createNewSplit);

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
        if (userPill) {
            if (userName) userName.textContent = name;
            const avatarUrl = getDiscordAvatarUrl(user);
            if (userAvatar && avatarUrl) {
                userAvatar.src = String(avatarUrl);
                userAvatar.style.display = 'inline-block';
                userPill.style.display = 'inline-flex';
            } else if (userAvatar) {
                userAvatar.removeAttribute('src');
                userAvatar.style.display = 'none';
                userPill.style.display = 'none';
            }
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
    if (balanceValue) balanceValue.textContent = '-';
    historyTableBody.innerHTML = '';
    if (userPill) userPill.style.display = 'none';
    if (userName) userName.textContent = '';
    if (userAvatar) {
        userAvatar.removeAttribute('src');
        userAvatar.style.display = 'none';
    }
    if (serverPill) serverPill.style.display = 'none';
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
    hideModSuccess();
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
    hideModSuccess();
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

function showModSuccess() {
    if (!modSuccess) return;
    modSuccess.style.display = 'flex';
    window.clearTimeout(modSuccess.__hideT);
    modSuccess.__hideT = window.setTimeout(() => {
        modSuccess.style.display = 'none';
    }, 1200);
}

function hideModSuccess() {
    if (!modSuccess) return;
    modSuccess.style.display = 'none';
    window.clearTimeout(modSuccess.__hideT);
}

function resetModFields() {
    if (modAmount) modAmount.value = '';
    if (splitTotal) splitTotal.value = '';
    if (splitRepair) splitRepair.value = '';
    if (splitPercent) splitPercent.value = '';
    if (announceChannelSelect) announceChannelSelect.value = '';
    if (memberCheckboxList) {
        for (const cb of memberCheckboxList.querySelectorAll('input[type="checkbox"]')) {
            cb.checked = false;
        }
    }
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
        announceChannelField.style.display = (action === 'load' || action === 'autosplit') ? 'block' : 'none';
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
    if (memberSelect) memberSelect.style.display = 'none';
}

function _enableClickToggleMultiSelect(selectEl) {
    if (!selectEl || selectEl.__clickToggleBound) return;
    selectEl.__clickToggleBound = true;

    // Allow multi-select without requiring Ctrl (works for mouse/touch)
    selectEl.addEventListener('mousedown', (e) => {
        if (!selectEl.multiple) return;
        const opt = e.target && e.target.tagName === 'OPTION' ? e.target : null;
        if (!opt) return;
        e.preventDefault();
        opt.selected = !opt.selected;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    });

    selectEl.addEventListener('touchstart', (e) => {
        if (!selectEl.multiple) return;
        const opt = e.target && e.target.tagName === 'OPTION' ? e.target : null;
        if (!opt) return;
        e.preventDefault();
        opt.selected = !opt.selected;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }, { passive: false });
}

async function loadMemberOptions() {
    if (!selectedGuildId) return;
    const filt = String(memberFilter?.value || 'role');
    const qs = new URLSearchParams({ guild_id: selectedGuildId, filter: filt });
    if (filt === 'voice' && voiceChannelSelect && voiceChannelSelect.value) {
        qs.set('voice_channel_id', String(voiceChannelSelect.value));
    }
    const res = await apiFetch(`/api/members?${qs.toString()}`, { method: 'GET' });
    if (!res.ok) {
        if (memberSelect) memberSelect.innerHTML = '';
        if (memberCheckboxList) memberCheckboxList.innerHTML = '';
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

    if (memberSelect) {
        memberSelect.innerHTML = members
            .map(m => `<option value="${escapeHtml(String(m.id || ''))}">${escapeHtml(String(m.name || m.id || ''))}</option>`)
            .join('');
    }

    if (memberCheckboxList) {
        memberCheckboxList.innerHTML = '';
        for (const m of members) {
            const id = String(m.id || '').trim();
            const name = String(m.name || m.id || '').trim();
            if (!/^\d{5,}$/.test(id)) continue;

            const item = document.createElement('label');
            item.className = 'member-checkbox-item';
            item.innerHTML = `
                <input type="checkbox" value="${escapeHtml(id)}">
                <span class="member-checkbox-name">${escapeHtml(name)}</span>
            `;
            memberCheckboxList.appendChild(item);
        }

        if (filt === 'voice') {
            for (const cb of memberCheckboxList.querySelectorAll('input[type="checkbox"]')) {
                cb.checked = true;
            }
        }
    }
}

function getSelectedUserIds() {
    if (memberCheckboxList) {
        const ids = Array.from(memberCheckboxList.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => String(cb.value || '').trim());
        const clean = ids.filter(x => /^\d{5,}$/.test(x));
        if (clean.length > 0) return clean;
    }
    if (!memberSelect) return [];
    const ids = Array.from(memberSelect.selectedOptions || []).map(o => String(o.value || '').trim());
    return ids.filter(x => /^\d{5,}$/.test(x));
}

function _parseNumberOrZero(v) {
    const s = String(v ?? '').trim();
    if (!s) return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
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
    hideModSuccess();
    if (!selectedGuildId) return;
    const action = String(modAction?.value || 'audit');
    const userIds = getSelectedUserIds();
    if (userIds.length === 0) {
        showModHint('Selecciona al menos un usuario válido.');
        return;
    }

    const needsAnnounce = action === 'load' || action === 'autosplit';
    const announce_channel_id = needsAnnounce ? String(announceChannelSelect?.value || '').trim() : '';
    if (needsAnnounce && !announce_channel_id) {
        showModHint('Selecciona un canal para enviar mensaje.');
        return;
    }

    if (action === 'audit') {
        if (userIds.length !== 1) {
            showModHint('Para auditar selecciona solo 1 usuario.');
            return;
        }
        await runAudit(userIds[0]);
        return;
    }

    if (action === 'autosplit') {
        const total = Math.floor(_parseNumberOrZero(splitTotal?.value));
        const repair = Math.floor(_parseNumberOrZero(splitRepair?.value));
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
                    announce_channel_id,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                showModHint((data && data.error) ? String(data.error) : 'No se pudo aplicar el auto split.');
                return;
            }
            showModHint(`Auto split listo. Total: ${formatAmount(total)} | Reparación: ${formatAmount(repair)} | %: ${pct}% (${formatAmount(fee)}) | Neto: ${formatAmount(net)} | Por persona: ${formatAmount(perUser)} | Usuarios: ${userIds.length}`);
            showModSuccess();
            resetModFields();
            await refreshData(selectedGuildId);
        } finally {
            modApplyBtn.disabled = false;
        }
        return;
    }

    const amountStr = String(modAmount?.value || '').trim();
    if (!amountStr || isNaN(Number(amountStr))) {
        showModHint('Monto inválido.');
        return;
    }
    let amount = parseInt(amountStr, 10);
    if (!Number.isFinite(amount)) {
        showModHint('Monto inválido.');
        return;
    }
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

        if (action === 'pay') {
            const perUser = Math.abs(amount);
            const totalPaid = perUser * userIds.length;
            if (Number.isFinite(totalPaid) && totalPaid > 0) {
                const gres = await apiFetch(`/api/owner/guild_balance`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ guild_id: selectedGuildId, mode: 'add', amount: -totalPaid }),
                });
                const gdata = await gres.json().catch(() => ({}));
                if (!gres.ok || !gdata.success) {
                    showModHint('Pago aplicado a usuarios, pero no se pudo descontar del balance del gremio.');
                }
            }
        }
        if (Array.isArray(data.results)) {
            showModHint(`Listo. Aplicado a ${data.results.length} usuarios.`);
        } else {
            showModHint(`Listo. Nuevo balance: ${formatAmount(data.new_balance)}`);
        }
        showModSuccess();
        resetModFields();
        await refreshData(selectedGuildId);
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
        showView('new-split');
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
    await refreshOwnerDashboard(guildId);

    const membersViewActive = !!document.getElementById('view-members')?.classList.contains('active');
    if (membersViewActive) {
        loadMembersView();
    }

    const splitsViewActive = !!document.getElementById('view-splits')?.classList.contains('active');
    if (splitsViewActive) {
        loadSplitsView();
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
