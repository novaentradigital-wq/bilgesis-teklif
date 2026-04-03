/* ============================================
   BİLGESİS TEKLİF YÖNETİM SİSTEMİ
   Ana Uygulama JavaScript v2.0
   ============================================ */

// ============ XSS KORUMASI ============
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ============ VERİ YÖNETİMİ (PostgreSQL API + Local Cache) ============
const API_BASE = window.location.origin + '/api';
const _cache = {};

const DB = {
    get(key) {
        // Önce cache'den oku (senkron)
        if (_cache[key]) return JSON.parse(JSON.stringify(_cache[key]));
        try {
            // Güvenlik: users verisi sessionStorage'da tutulur
            const storage = key === 'users' ? sessionStorage : localStorage;
            return JSON.parse(storage.getItem('bilgesis_' + key)) || [];
        } catch { return []; }
    },
    set(key, data) {
        // Hem local cache hem storage güncelle (senkron)
        _cache[key] = data;
        const storage = key === 'users' ? sessionStorage : localStorage;
        storage.setItem('bilgesis_' + key, JSON.stringify(data));
        // Arka planda API'ye kaydet (asenkron)
        DB._syncToServer(key, data);
    },
    getSettings() {
        if (_cache._settings) return JSON.parse(JSON.stringify(_cache._settings));
        try {
            return JSON.parse(localStorage.getItem('bilgesis_settings')) || {};
        } catch { return {}; }
    },
    setSettings(data) {
        _cache._settings = data;
        localStorage.setItem('bilgesis_settings', JSON.stringify(data));
        DB._syncSettingsToServer(data);
    },

    // Sunucudan tüm verileri çek ve cache'e yaz
    async loadFromServer() {
        try {
            const endpoints = { proposals: '/proposals', customers: '/customers', products: '/products', users: '/users' };
            const promises = Object.entries(endpoints).map(async ([key, path]) => {
                const resp = await fetch(API_BASE + path, { headers: getAuthHeaders() });
                if (resp.ok) {
                    const data = await resp.json();
                    _cache[key] = data;
                    const storage = key === 'users' ? sessionStorage : localStorage;
                    storage.setItem('bilgesis_' + key, JSON.stringify(data));
                }
            });
            promises.push((async () => {
                const resp = await fetch(API_BASE + '/settings', { headers: getAuthHeaders() });
                if (resp.ok) {
                    const data = await resp.json();
                    _cache._settings = data;
                    localStorage.setItem('bilgesis_settings', JSON.stringify(data));
                }
            })());
            await Promise.all(promises);
            console.log('✓ Veriler sunucudan yüklendi');
        } catch (err) {
            console.warn('Sunucu bağlantısı yok, localStorage kullanılıyor:', err.message);
        }
    },

    async _syncToServer(key, data) {
        try {
            const endpoints = { proposals: '/proposals', customers: '/customers', products: '/products', users: '/users' };
            const path = endpoints[key];
            if (!path) return;
            for (const item of data) {
                await fetch(API_BASE + path, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(item)
                });
            }
        } catch (err) {
            console.warn('Sunucu sync hatası (' + key + '):', err.message);
        }
    },

    async deleteFromServer(key, id) {
        try {
            const endpoints = { proposals: '/proposals', customers: '/customers', products: '/products', users: '/users' };
            const path = endpoints[key];
            if (!path) return;
            await fetch(API_BASE + path + '/' + id, { method: 'DELETE', headers: getAuthHeaders() });
        } catch (err) {
            console.warn('Sunucu silme hatası:', err.message);
        }
    },

    async _syncSettingsToServer(data) {
        try {
            await fetch(API_BASE + '/settings', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(data)
            });
        } catch (err) {
            console.warn('Ayarlar sync hatası:', err.message);
        }
    }
};

// ============ KULLANICI SİSTEMİ ============
function getDefaultUsers() {
    return [
        { id: 'admin1', name: 'Yönetici', username: 'admin', password: '', role: 'admin', email: '' }
    ];
}

function getUsers() {
    const users = DB.get('users');
    if (users.length === 0) {
        const defaults = getDefaultUsers();
        DB.set('users', defaults);
        return defaults;
    }
    return users;
}

function getCurrentUser() {
    try {
        return JSON.parse(sessionStorage.getItem('bilgesis_user')) || null;
    } catch { return null; }
}

function setCurrentUser(user) {
    sessionStorage.setItem('bilgesis_user', JSON.stringify(user));
}

let _authToken = sessionStorage.getItem('bilgesis_token') || '';

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + _authToken
    };
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');

    try {
        const resp = await fetch(API_BASE + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const result = await resp.json();
        if (result.success) {
            _authToken = result.token || '';
            sessionStorage.setItem('bilgesis_token', _authToken);
            setCurrentUser(result.user);
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('appWrapper').style.display = 'flex';
            initApp();
            return false;
        }
        errEl.textContent = result.message || 'Kullanıcı adı veya şifre hatalı!';
        errEl.style.display = 'block';
    } catch (err) {
        errEl.textContent = 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.';
        errEl.style.display = 'block';
    }
    return false;
}

function handleLogout() {
    const token = sessionStorage.getItem('bilgesis_token');
    if (token) {
        fetch(API_BASE + '/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        }).catch(() => {});
    }
    sessionStorage.removeItem('bilgesis_user');
    sessionStorage.removeItem('bilgesis_token');
    location.reload();
}

function checkAuth() {
    const user = getCurrentUser();
    if (user) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appWrapper').style.display = 'flex';
        return true;
    }
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appWrapper').style.display = 'none';
    return false;
}

function toggleUserDropdown() {
    document.getElementById('userDropdown').classList.toggle('show');
}

function closeUserDropdown() {
    document.getElementById('userDropdown').classList.remove('show');
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu') && !e.target.closest('.user-dropdown')) {
        closeUserDropdown();
    }
});

// ============ SAYFA YÖNETİMİ ============
document.addEventListener('DOMContentLoaded', () => {
    // Migrate old data
    migrateOldData();

    if (checkAuth()) {
        initApp();
    }
});

function migrateOldData() {
    // Migrate from novaentra_ prefix to bilgesis_ prefix
    const keys = ['proposals', 'customers', 'products', 'settings'];
    keys.forEach(key => {
        const old = localStorage.getItem('novaentra_' + key);
        const curr = localStorage.getItem('bilgesis_' + key);
        if (old && !curr) {
            localStorage.setItem('bilgesis_' + key, old);
        }
    });
}

async function initApp() {
    const user = getCurrentUser();
    if (!user) return;

    // Sunucudan verileri yükle (arka planda)
    await DB.loadFromServer();

    // Set user info in UI
    const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    document.getElementById('userAvatar').textContent = initials;
    document.getElementById('userName').textContent = user.name;
    document.getElementById('dropdownUserInfo').innerHTML = `<strong>${user.name}</strong><br><small>${user.role === 'admin' ? 'Yönetici' : 'Personel'}</small>`;

    // Show/hide admin-only elements
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = user.role === 'admin' ? '' : 'none';
    });

    setupNavigation();
    setupForm();
    loadSettings();
    setDefaultDate();

    // Başlangıç sayfasını history'ye kaydet
    const initialPage = location.hash.replace('#', '') || 'dashboard';
    history.replaceState({ page: initialPage }, '', '#' + initialPage);
    if (initialPage !== 'dashboard') {
        navigateTo(initialPage, false);
    } else {
        renderDashboard();
    }

    populateCustomerSelect();
    populateProductSelect();
    addProductRow();
    checkReminders();
}

function setupNavigation() {
    document.querySelectorAll('[data-page]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(el.dataset.page);
        });
    });

    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function closeSidebar() {
        sidebar.classList.remove('open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('show');
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            const isOpen = sidebar.classList.toggle('open');
            if (sidebarOverlay) sidebarOverlay.classList.toggle('show', isOpen);
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }

    // Menü linkine tıklanınca mobilde sidebar kapat
    document.querySelectorAll('.sidebar .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) closeSidebar();
        });
    });

    document.getElementById('globalSearch').addEventListener('input', (e) => {
        if (e.target.value.length >= 2) {
            navigateTo('proposals');
            document.getElementById('proposalSearch').value = e.target.value;
            renderProposals();
        }
    });
}

function navigateTo(page, pushState = true) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

    const titles = {
        'dashboard': 'Gösterge Paneli',
        'new-proposal': 'Yeni Teklif Oluştur',
        'proposals': 'Teklifler',
        'reminders': 'Hatırlatmalar',
        'customers': 'Müşteriler',
        'products': 'Ürünler',
        'personnel': 'Personel Yönetimi',
        'settings': 'Ayarlar'
    };
    document.getElementById('pageTitle').textContent = titles[page] || page;

    if (page === 'dashboard') renderDashboard();
    if (page === 'proposals') renderProposals();
    if (page === 'reminders') renderReminders();
    if (page === 'customers') renderCustomers();
    if (page === 'products') renderProducts();
    if (page === 'personnel') renderPersonnel();

    // Browser history desteği
    if (pushState) {
        history.pushState({ page: page }, '', '#' + page);
    }

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
}

// Tarayıcı geri/ileri tuşu desteği
window.addEventListener('popstate', function(e) {
    if (e.state && e.state.page) {
        navigateTo(e.state.page, false);
    } else {
        // Hash'ten sayfa belirle veya dashboard'a dön
        const hash = location.hash.replace('#', '');
        navigateTo(hash || 'dashboard', false);
    }
});

// ============ KART FİLTRELEME ============
function filterProposalsByStatus(status) {
    navigateTo('proposals');
    const statusFilter = document.getElementById('statusFilter');
    if (status === 'bekleyen') {
        // Bekleyen = taslak + gönderildi, "all" seçip özel filtre uygula
        statusFilter.value = 'gönderildi';
    } else {
        statusFilter.value = status;
    }
    renderProposals();
}

// ============ GÖSTERGE PANELİ ============
function renderDashboard() {
    let proposals = DB.get('proposals');
    const user = getCurrentUser();
    if (user && user.role !== 'admin') {
        proposals = proposals.filter(p => p.createdBy === user.username);
    }

    const total = proposals.length;
    const pending = proposals.filter(p => p.status === 'taslak' || p.status === 'gönderildi').length;
    const accepted = proposals.filter(p => p.status === 'kabul').length;
    const rejected = proposals.filter(p => p.status === 'red').length;

    document.getElementById('totalProposals').textContent = total;
    document.getElementById('pendingProposals').textContent = pending;
    document.getElementById('acceptedProposals').textContent = accepted;
    document.getElementById('rejectedProposals').textContent = rejected;

    // Recent proposals
    const tbody = document.getElementById('recentProposalsBody');
    const recent = proposals.slice(-5).reverse();

    if (recent.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">
            <i class="fas fa-inbox"></i><p>Henüz teklif bulunmuyor</p></td></tr>`;
    } else {
        const users = getUsers();
        tbody.innerHTML = recent.map(p => {
            const repUser = users.find(u => u.username === p.createdBy);
            const repName = repUser ? repUser.name : (p.salesRep || '-');
            return `
            <tr>
                <td><strong>${escapeHtml(p.proposalNo)}</strong></td>
                <td>${escapeHtml(p.customerName)}</td>
                <td style="font-size:0.82rem"><i class="fas fa-user" style="font-size:0.65rem;color:var(--text-muted);margin-right:2px"></i>${escapeHtml(repName)}</td>
                <td><strong>${formatMoney(p.grandTotal)} ${getCurrencySymbol(p.currency)}</strong></td>
                <td><span class="status-badge status-${p.status}">${getStatusText(p.status)}</span></td>
                <td>${formatDate(p.date)}</td>
            </tr>`;
        }).join('');
    }

    // Dashboard reminders
    renderDashboardReminders();

    // Notification badge
    const overdueCount = getOverdueReminders().length;
    const todayCount = getTodayReminders().length;
    const totalReminders = overdueCount + todayCount;
    document.getElementById('notifBadge').textContent = totalReminders;

    const navBadge = document.getElementById('reminderNavBadge');
    if (totalReminders > 0) {
        navBadge.style.display = '';
        navBadge.textContent = totalReminders;
    } else {
        navBadge.style.display = 'none';
    }
}

function renderDashboardReminders() {
    const overdue = getOverdueReminders();
    const today = getTodayReminders();
    const card = document.getElementById('dashReminderCard');
    const body = document.getElementById('dashReminderBody');

    const all = [...overdue, ...today];
    if (all.length === 0) {
        card.style.display = 'none';
        return;
    }
    card.style.display = '';

    body.innerHTML = all.slice(0, 5).map(p => {
        const isOverdue = overdue.includes(p);
        const cls = isOverdue ? 'ri-overdue' : 'ri-today';
        const icon = isOverdue ? 'fa-exclamation-circle' : 'fa-clock';
        const label = isOverdue ? 'GECİKMİŞ' : 'BUGÜN';
        const callCount = (p.callLogs || []).length;
        const lastCall = callCount > 0 ? p.callLogs[callCount - 1] : null;
        const callInfo = callCount === 0 ? '<span style="color:var(--danger);font-weight:600">ARANMADI</span>' :
            `Son: ${getCallStatusText(lastCall.status)}`;
        return `
        <div class="reminder-item ${cls}">
            <div class="ri-icon"><i class="fas ${icon}"></i></div>
            <div class="ri-info">
                <strong>${escapeHtml(p.customerName)}</strong> - ${escapeHtml(p.proposalNo)} - ${formatMoney(p.grandTotal)} ${getCurrencySymbol(p.currency)}
                <small>${label} | ${formatDate(p.reminderDate)} | ${callInfo}</small>
            </div>
            <button class="btn btn-xs btn-primary" onclick="openCallResultModal('${p.id}')"><i class="fas fa-phone"></i> Sonuç Gir</button>
        </div>`;
    }).join('');
}

// ============ HATIRLATMA SİSTEMİ ============
function getUserProposals() {
    let proposals = DB.get('proposals');
    const user = getCurrentUser();
    if (user && user.role !== 'admin') {
        proposals = proposals.filter(p => p.createdBy === user.username);
    }
    return proposals;
}

function getOverdueReminders() {
    const proposals = getUserProposals();
    const today = new Date().toISOString().split('T')[0];
    return proposals.filter(p =>
        p.reminderDate && p.reminderDate < today &&
        !p.reminderCompleted &&
        p.status !== 'kabul' && p.status !== 'red'
    );
}

function getTodayReminders() {
    const proposals = getUserProposals();
    const today = new Date().toISOString().split('T')[0];
    return proposals.filter(p =>
        p.reminderDate && p.reminderDate === today &&
        !p.reminderCompleted &&
        p.status !== 'kabul' && p.status !== 'red'
    );
}

function checkReminders() {
    const overdue = getOverdueReminders();
    const today = getTodayReminders();
    const total = overdue.length + today.length;

    const banner = document.getElementById('reminderBanner');
    if (total > 0) {
        let msg = '';
        if (overdue.length > 0) msg += `${overdue.length} gecikmiş hatırlatma`;
        if (overdue.length > 0 && today.length > 0) msg += ' ve ';
        if (today.length > 0) msg += `${today.length} bugünkü hatırlatma`;
        msg += ' bulunuyor!';

        document.getElementById('reminderBannerText').textContent = msg;
        banner.style.display = '';
    } else {
        banner.style.display = 'none';
    }
}

function renderReminders() {
    const proposals = getUserProposals();
    const filter = document.getElementById('reminderFilter').value;
    const today = new Date().toISOString().split('T')[0];
    const container = document.getElementById('remindersContainer');

    let filtered = proposals.filter(p => p.reminderDate);

    if (filter === 'active') {
        filtered = filtered.filter(p => !p.reminderCompleted && p.status !== 'kabul' && p.status !== 'red');
    } else if (filter === 'overdue') {
        filtered = filtered.filter(p => p.reminderDate < today && !p.reminderCompleted && p.status !== 'kabul' && p.status !== 'red');
    } else if (filter === 'today') {
        filtered = filtered.filter(p => p.reminderDate === today && !p.reminderCompleted);
    } else if (filter === 'completed') {
        filtered = filtered.filter(p => p.reminderCompleted || p.status === 'kabul' || p.status === 'red');
    }

    filtered.sort((a, b) => (a.reminderDate || '').localeCompare(b.reminderDate || ''));

    if (filtered.length === 0) {
        container.innerHTML = `<div class="card"><div class="card-body"><div class="empty-state">
            <i class="fas fa-bell-slash"></i><p>Hatırlatma bulunamadı</p></div></div></div>`;
        return;
    }

    const users = getUsers();

    container.innerHTML = filtered.map(p => {
        const isOverdue = p.reminderDate < today && !p.reminderCompleted && p.status !== 'kabul' && p.status !== 'red';
        const isToday = p.reminderDate === today && !p.reminderCompleted;
        const isCompleted = p.reminderCompleted || p.status === 'kabul' || p.status === 'red';

        const cardCls = isOverdue ? 'rc-overdue' : isToday ? 'rc-today' : isCompleted ? 'rc-completed' : 'rc-upcoming';
        const dateBadgeCls = isOverdue ? 'overdue' : isToday ? 'today' : isCompleted ? 'completed' : 'upcoming';
        const dateLabel = isOverdue ? 'GECİKMİŞ' : isToday ? 'BUGÜN ARANACAK' : isCompleted ? 'TAMAMLANDI' : formatDate(p.reminderDate);

        // Temsilci
        const repUser = users.find(u => u.username === p.createdBy);
        const repName = repUser ? repUser.name : (p.salesRep || '-');

        // Görüşme geçmişi timeline
        const logs = p.callLogs || [];
        let timelineHtml = '';
        if (logs.length > 0) {
            timelineHtml = '<div class="rc-timeline">' + logs.map(log => {
                const logUser = log.user || '-';
                const dotCls = log.status === 'kabul' ? 'dot-success' :
                               log.status === 'red' ? 'dot-danger' :
                               log.status === 'ulaşılamadı' ? 'dot-warning' :
                               log.status === 'tekrar_ara' ? 'dot-info' : 'dot-gray';
                const dotIcon = log.status === 'kabul' ? 'fa-check' :
                                log.status === 'red' ? 'fa-times' :
                                log.status === 'ulaşılamadı' ? 'fa-phone-slash' :
                                log.status === 'tekrar_ara' ? 'fa-redo' : 'fa-phone';
                const statusLabel = getCallStatusText(log.status);
                return `
                <div class="rc-timeline-item">
                    <div class="rc-timeline-dot ${dotCls}"><i class="fas ${dotIcon}"></i></div>
                    <div class="rc-timeline-date">${formatDateTime(log.date)}</div>
                    <div class="rc-timeline-status">${statusLabel}</div>
                    ${log.note ? `<div class="rc-timeline-note">"${escapeHtml(log.note)}"</div>` : ''}
                    <div class="rc-timeline-user"><i class="fas fa-user"></i> ${escapeHtml(logUser)}</div>
                </div>`;
            }).join('') + '</div>';
        } else {
            timelineHtml = `<div class="rc-no-calls"><i class="fas fa-exclamation-triangle"></i> Henüz görüşme yapılmamış - Müşteri aranmadı!</div>`;
        }

        // Butonlar
        const canAct = !isCompleted;
        const actionsHtml = canAct ? `
            <button class="btn btn-sm btn-primary" onclick="openCallResultModal('${p.id}')"><i class="fas fa-phone"></i> Görüşme Sonucu Gir</button>
            <button class="btn btn-sm btn-success" onclick="updateProposalStatus('${p.id}','kabul')"><i class="fas fa-check"></i> Kabul</button>
            <button class="btn btn-sm btn-danger" onclick="updateProposalStatus('${p.id}','red')"><i class="fas fa-times"></i> Red</button>
            <button class="btn btn-sm btn-outline" onclick="openSendModal('${p.id}')" style="color:var(--info);border-color:var(--info)"><i class="fas fa-share-alt"></i> Gönder</button>
            <button class="btn btn-sm btn-outline" onclick="openReminderDetail('${p.id}')" style="color:var(--secondary);border-color:var(--secondary)"><i class="fas fa-eye"></i> Detay</button>
        ` : `
            <button class="btn btn-sm btn-outline" onclick="openReminderDetail('${p.id}')" style="color:var(--secondary);border-color:var(--secondary)"><i class="fas fa-eye"></i> Detay</button>
            <button class="btn btn-sm btn-outline" onclick="viewProposalPDF('${p.id}')"><i class="fas fa-file-pdf"></i> PDF</button>
        `;

        return `
        <div class="reminder-card ${cardCls}">
            <div class="rc-header">
                <div class="rc-header-left">
                    <span class="rc-customer">${escapeHtml(p.customerName)}</span>
                    <span class="rc-date-badge ${dateBadgeCls}"><i class="fas fa-calendar-alt"></i> ${dateLabel}</span>
                    <span class="status-badge status-${p.status}">${getStatusText(p.status)}</span>
                </div>
                <div class="rc-actions">${actionsHtml}</div>
            </div>
            <div class="rc-body">
                <div class="rc-info-row">
                    <div class="rc-info-item"><i class="fas fa-file-invoice"></i> <strong>${escapeHtml(p.proposalNo)}</strong></div>
                    <div class="rc-info-item"><i class="fas fa-money-bill"></i> <strong>${formatMoney(p.grandTotal)} ${getCurrencySymbol(p.currency)}</strong></div>
                    <div class="rc-info-item"><i class="fas fa-phone"></i> ${escapeHtml(p.customerPhone || '-')}</div>
                    <div class="rc-info-item"><i class="fas fa-envelope"></i> ${escapeHtml(p.customerEmail || '-')}</div>
                    <div class="rc-info-item"><i class="fas fa-user-tie"></i> ${escapeHtml(repName)}</div>
                    <div class="rc-info-item"><i class="fas fa-calendar"></i> Teklif: ${formatDate(p.date)}</div>
                </div>
                <div style="font-size:0.82rem;font-weight:700;color:var(--primary);margin-bottom:8px">
                    <i class="fas fa-history"></i> Görüşme Geçmişi ${logs.length > 0 ? '(' + logs.length + ' kayıt)' : ''}
                </div>
                ${timelineHtml}
            </div>
        </div>`;
    }).join('');
}

function openReminderDetail(proposalId) {
    const proposals = DB.get('proposals');
    const p = proposals.find(x => x.id === proposalId);
    if (!p) return;

    const users = getUsers();
    const repUser = users.find(u => u.username === p.createdBy);
    const repName = repUser ? repUser.name : (p.salesRep || '-');
    const currSym = getCurrencySymbol(p.currency);

    // Başlık
    document.getElementById('rdTitle').textContent = p.customerName + ' — ' + p.proposalNo;

    // Ürün tablosu
    const items = p.items || [];
    let itemsHtml = '';
    if (items.length > 0) {
        itemsHtml = `<table class="rd-table">
            <thead><tr><th>#</th><th>Ürün / Hizmet</th><th>Miktar</th><th>Birim Fiyat</th><th>Toplam</th></tr></thead>
            <tbody>` + items.map((it, i) => {
                const qty = parseFloat(it.quantity) || 0;
                const price = parseFloat(it.unitPrice) || 0;
                return `<tr>
                    <td>${i + 1}</td>
                    <td>${escapeHtml(it.name || it.description || '-')}</td>
                    <td>${qty}</td>
                    <td>${formatMoney(price)} ${currSym}</td>
                    <td>${formatMoney(qty * price)} ${currSym}</td>
                </tr>`;
            }).join('') + `</tbody></table>`;
    } else {
        itemsHtml = '<p style="color:var(--text-muted);padding:12px">Ürün bilgisi yok</p>';
    }

    // Görüşme geçmişi
    const logs = p.callLogs || [];
    let logsHtml = '';
    if (logs.length > 0) {
        logsHtml = logs.map(log => {
            const dotCls = log.status === 'kabul' ? 'dot-success' :
                           log.status === 'red' ? 'dot-danger' :
                           log.status === 'ulaşılamadı' ? 'dot-warning' :
                           log.status === 'tekrar_ara' ? 'dot-info' : 'dot-gray';
            const dotIcon = log.status === 'kabul' ? 'fa-check' :
                            log.status === 'red' ? 'fa-times' :
                            log.status === 'ulaşılamadı' ? 'fa-phone-slash' :
                            log.status === 'tekrar_ara' ? 'fa-redo' : 'fa-phone';
            return `
            <div class="rc-timeline-item">
                <div class="rc-timeline-dot ${dotCls}"><i class="fas ${dotIcon}"></i></div>
                <div class="rc-timeline-date">${formatDateTime(log.date)}</div>
                <div class="rc-timeline-status">${getCallStatusText(log.status)}</div>
                ${log.note ? `<div class="rc-timeline-note">"${escapeHtml(log.note)}"</div>` : ''}
                <div class="rc-timeline-user"><i class="fas fa-user"></i> ${escapeHtml(log.user || '-')}</div>
            </div>`;
        }).join('');
        logsHtml = `<div class="rc-timeline">${logsHtml}</div>`;
    } else {
        logsHtml = `<div class="rc-no-calls"><i class="fas fa-exclamation-triangle"></i> Henüz görüşme yapılmamış</div>`;
    }

    document.getElementById('rdBody').innerHTML = `
        <div class="rd-section">
            <div class="rd-section-title"><i class="fas fa-building"></i> Firma Bilgileri</div>
            <div class="rd-grid">
                <div class="rd-field"><span class="rd-label">Firma Adı</span><span class="rd-value">${escapeHtml(p.customerName || '-')}</span></div>
                <div class="rd-field"><span class="rd-label">Telefon</span><span class="rd-value">${escapeHtml(p.customerPhone || '-')}</span></div>
                <div class="rd-field"><span class="rd-label">E-posta</span><span class="rd-value">${escapeHtml(p.customerEmail || '-')}</span></div>
                <div class="rd-field"><span class="rd-label">Adres</span><span class="rd-value">${escapeHtml(p.customerAddress || '-')}</span></div>
                <div class="rd-field"><span class="rd-label">Vergi Dairesi</span><span class="rd-value">${escapeHtml(p.taxOffice || '-')}</span></div>
                <div class="rd-field"><span class="rd-label">Vergi No</span><span class="rd-value">${escapeHtml(p.taxNumber || '-')}</span></div>
                <div class="rd-field"><span class="rd-label">Temsilci</span><span class="rd-value">${escapeHtml(repName)}</span></div>
                <div class="rd-field"><span class="rd-label">Teklif Tarihi</span><span class="rd-value">${formatDate(p.date)}</span></div>
            </div>
        </div>

        <div class="rd-section">
            <div class="rd-section-title"><i class="fas fa-boxes"></i> Teklif Edilen Ürünler / Hizmetler</div>
            ${itemsHtml}
        </div>

        <div class="rd-section">
            <div class="rd-section-title"><i class="fas fa-calculator"></i> Tutar Bilgileri</div>
            <div class="rd-totals">
                <div class="rd-total-row"><span>Ara Toplam</span><span>${formatMoney(p.subtotal || 0)} ${currSym}</span></div>
                ${p.discountAmount ? `<div class="rd-total-row"><span>İskonto</span><span>-${formatMoney(p.discountAmount)} ${currSym}</span></div>` : ''}
                <div class="rd-total-row"><span>KDV (%${p.vatRate || 0})</span><span>${formatMoney(p.vatAmount || 0)} ${currSym}</span></div>
                <div class="rd-total-row rd-grand-total"><span>Genel Toplam</span><span>${formatMoney(p.grandTotal || 0)} ${currSym}</span></div>
            </div>
        </div>

        <div class="rd-section">
            <div class="rd-section-title"><i class="fas fa-history"></i> Görüşme Geçmişi (${logs.length} kayıt)</div>
            ${logsHtml}
        </div>
    `;

    // Footer butonları
    const isCompleted = p.reminderCompleted || p.status === 'kabul' || p.status === 'red';
    document.getElementById('rdFooter').innerHTML = `
        <button class="btn btn-outline" onclick="closeModal('reminderDetailModal')">Kapat</button>
        <button class="btn btn-primary" onclick="viewProposalPDF('${p.id}')"><i class="fas fa-file-pdf"></i> PDF Görüntüle</button>
        ${!isCompleted ? `<button class="btn btn-success" onclick="closeModal('reminderDetailModal');openCallResultModal('${p.id}')"><i class="fas fa-phone"></i> Görüşme Gir</button>` : ''}
        <button class="btn btn-info" onclick="closeModal('reminderDetailModal');openSendModal('${p.id}')"><i class="fas fa-share-alt"></i> Gönder</button>
    `;

    openModal('reminderDetailModal');
}

function getCallStatusText(status) {
    const map = {
        'arandı': 'Arandı - Görüşüldü',
        'ulaşılamadı': 'Ulaşılamadı',
        'tekrar_ara': 'Tekrar Aranacak',
        'kabul': 'Teklif Kabul Edildi',
        'red': 'Teklif Reddedildi'
    };
    return map[status] || status;
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
               ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
}

function openCallResultModal(proposalId) {
    document.getElementById('callResultProposalId').value = proposalId;
    document.getElementById('callResultStatus').value = 'arandı';
    document.getElementById('callResultNote').value = '';
    document.getElementById('nextCallDate').value = '';
    toggleNextCallDate();
    openModal('callResultModal');
}

function toggleNextCallDate() {
    const status = document.getElementById('callResultStatus').value;
    const group = document.getElementById('nextCallDateGroup');
    if (status === 'kabul' || status === 'red') {
        group.style.display = 'none';
    } else {
        group.style.display = '';
    }
}

function saveCallResult() {
    const proposalId = document.getElementById('callResultProposalId').value;
    const status = document.getElementById('callResultStatus').value;
    const note = document.getElementById('callResultNote').value;
    const nextDate = document.getElementById('nextCallDate').value;

    // Kabul ve red hariç, sonraki arama tarihi zorunlu
    if (status !== 'kabul' && status !== 'red' && !nextDate) {
        showToast('Sonraki arama tarihi zorunludur! Müşteriyi tekrar ne zaman arayacaksınız?', 'error');
        document.getElementById('nextCallDate').focus();
        document.getElementById('nextCallDate').style.borderColor = 'var(--danger)';
        setTimeout(() => { document.getElementById('nextCallDate').style.borderColor = ''; }, 3000);
        return;
    }

    const proposals = DB.get('proposals');
    const idx = proposals.findIndex(p => p.id === proposalId);
    if (idx < 0) return;

    const user = getCurrentUser();

    if (!proposals[idx].callLogs) proposals[idx].callLogs = [];
    proposals[idx].callLogs.push({
        date: new Date().toISOString(),
        status: status,
        note: note,
        user: user ? user.name : ''
    });

    if (status === 'kabul') {
        proposals[idx].status = 'kabul';
        proposals[idx].reminderCompleted = true;
    } else if (status === 'red') {
        proposals[idx].status = 'red';
        proposals[idx].reminderCompleted = true;
    } else {
        // Her durumda sonraki tarihi güncelle (kabul/red hariç)
        proposals[idx].reminderDate = nextDate;
        proposals[idx].reminderCompleted = false;
    }

    proposals[idx].updatedAt = new Date().toISOString();
    DB.set('proposals', proposals);

    closeModal('callResultModal');
    showToast('Görüşme sonucu kaydedildi.', 'success');
    renderReminders();
    renderDashboard();
    checkReminders();
}

// ============ TEKLİF FORMU ============
function setupForm() {
    document.getElementById('proposalForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveProposal('gönderildi');
    });

    document.getElementById('customerSelect').addEventListener('change', (e) => {
        if (!e.target.value) return;
        const customers = DB.get('customers');
        const c = customers.find(c => c.id === e.target.value);
        if (c) {
            document.getElementById('customerName').value = c.name || '';
            document.getElementById('contactPerson').value = c.contact || '';
            document.getElementById('customerPhone').value = c.phone || '';
            document.getElementById('customerEmail').value = c.email || '';
            document.getElementById('customerFax').value = c.fax || '';
            document.getElementById('taxOffice').value = c.taxOffice || '';
            document.getElementById('taxNumber').value = c.taxNo || '';
            document.getElementById('customerAddress').value = c.address || '';
        }
    });

    document.getElementById('productSelect').addEventListener('change', (e) => {
        if (!e.target.value) return;
        const products = DB.get('products');
        const p = products.find(pr => pr.id === e.target.value);
        if (p) {
            addProductRow(p.name, p.price, 1);
        }
        e.target.value = '';
    });

    document.getElementById('kdvRate').addEventListener('input', (e) => {
        document.getElementById('kdvRateDisplay').textContent = e.target.value;
        calculateTotals();
    });
}

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('proposalDate').value = today;
    // Auto sipariş no
    const proposals = DB.get('proposals');
    const nextNo = generateProposalNo(proposals);
    document.getElementById('orderNo').value = nextNo;
}

function addProductRow(name = '', price = '', qty = 1) {
    const tbody = document.getElementById('productTableBody');
    const rowCount = tbody.rows.length + 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="row-number">${rowCount}</td>
        <td><input type="text" placeholder="Ürün adı / açıklaması" value="${escapeHtml(name)}" class="prod-name" required></td>
        <td><input type="number" placeholder="0,00" value="${escapeHtml(String(price))}" step="0.01" min="0" class="prod-price" oninput="calculateRow(this)"></td>
        <td><input type="number" value="${escapeHtml(String(qty))}" min="1" class="prod-qty" oninput="calculateRow(this)"></td>
        <td><input type="text" value="${price ? formatMoney(price * qty) : '0,00'}" class="prod-total" readonly style="background:#f5f5f5;font-weight:600"></td>
        <td><button type="button" class="btn-remove" onclick="removeProductRow(this)" title="Satırı Sil"><i class="fas fa-times"></i></button></td>
    `;
    tbody.appendChild(tr);
    calculateTotals();
}

function removeProductRow(btn) {
    const tbody = document.getElementById('productTableBody');
    if (tbody.rows.length <= 1) {
        showToast('En az bir ürün satırı olmalıdır.', 'warning');
        return;
    }
    btn.closest('tr').remove();
    updateRowNumbers();
    calculateTotals();
}

function updateRowNumbers() {
    const rows = document.querySelectorAll('#productTableBody tr');
    rows.forEach((row, i) => {
        row.querySelector('.row-number').textContent = i + 1;
    });
}

function calculateRow(input) {
    const tr = input.closest('tr');
    const price = parseFloat(tr.querySelector('.prod-price').value) || 0;
    const qty = parseInt(tr.querySelector('.prod-qty').value) || 0;
    const total = price * qty;
    tr.querySelector('.prod-total').value = formatMoney(total);
    calculateTotals();
}

function calculateTotals() {
    const rows = document.querySelectorAll('#productTableBody tr');
    let subtotal = 0;

    rows.forEach(row => {
        const price = parseFloat(row.querySelector('.prod-price').value) || 0;
        const qty = parseInt(row.querySelector('.prod-qty').value) || 0;
        subtotal += price * qty;
    });

    const discount = parseFloat(document.getElementById('discountAmount').value) || 0;
    const kdvRate = parseFloat(document.getElementById('kdvRate').value) || 0;
    const discountedSubtotal = subtotal - discount;
    const kdv = discountedSubtotal * (kdvRate / 100);
    const grandTotal = discountedSubtotal + kdv;

    const sym = getCurrencySymbol(document.getElementById('currency').value);

    document.getElementById('subtotal').textContent = formatMoney(subtotal) + ' ' + sym;
    document.getElementById('discountDisplay').textContent = '-' + formatMoney(discount) + ' ' + sym;
    document.getElementById('discountedSubtotal').textContent = formatMoney(discountedSubtotal) + ' ' + sym;
    document.getElementById('kdvAmount').textContent = formatMoney(kdv) + ' ' + sym;
    document.getElementById('grandTotal').textContent = formatMoney(grandTotal) + ' ' + sym;
}

// ============ TEKLİF KAYDETME ============
function getFormData() {
    const rows = document.querySelectorAll('#productTableBody tr');
    const items = [];
    rows.forEach(row => {
        const name = row.querySelector('.prod-name').value;
        const price = parseFloat(row.querySelector('.prod-price').value) || 0;
        const qty = parseInt(row.querySelector('.prod-qty').value) || 0;
        if (name) {
            items.push({ name, price, qty, total: price * qty });
        }
    });

    const discount = parseFloat(document.getElementById('discountAmount').value) || 0;
    const kdvRate = parseFloat(document.getElementById('kdvRate').value) || 0;
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discountedSubtotal = subtotal - discount;
    const kdv = discountedSubtotal * (kdvRate / 100);
    const grandTotal = discountedSubtotal + kdv;

    const user = getCurrentUser();

    return {
        customerName: document.getElementById('customerName').value,
        contactPerson: document.getElementById('contactPerson').value,
        customerPhone: document.getElementById('customerPhone').value,
        customerEmail: document.getElementById('customerEmail').value,
        customerFax: document.getElementById('customerFax').value,
        taxOffice: document.getElementById('taxOffice').value,
        taxNumber: document.getElementById('taxNumber').value,
        customerAddress: document.getElementById('customerAddress').value,
        deliveryDate: document.getElementById('deliveryDate').value,
        orderNo: document.getElementById('orderNo').value,
        date: document.getElementById('proposalDate').value,
        currency: document.getElementById('currency').value,
        kdvRate,
        usdRate: '',
        eurRate: '',
        paymentPlan: document.getElementById('paymentPlan').value,
        reminderDate: document.getElementById('reminderDate').value,
        items,
        discount,
        subtotal,
        discountedSubtotal,
        kdv,
        grandTotal,
        additionalServices: document.getElementById('additionalServices').value,
        notes: document.getElementById('proposalNotes').value,
        salesRep: user ? user.name : '',
        createdBy: user ? user.username : ''
    };
}

function saveProposal(status = 'gönderildi') {
    const data = getFormData();

    if (!data.customerName) {
        showToast('Müşteri adı zorunludur!', 'error');
        return;
    }
    if (data.items.length === 0) {
        showToast('En az bir ürün eklemelisiniz!', 'error');
        return;
    }

    // Hatırlatma tarihi zorunlu (kabul/red hariç)
    if (!data.reminderDate && status !== 'kabul' && status !== 'red') {
        showToast('Hatırlatma tarihi zorunludur! Müşteriyi ne zaman arayacağınızı belirleyin.', 'error');
        document.getElementById('reminderDate').focus();
        document.getElementById('reminderDate').style.borderColor = 'var(--danger)';
        setTimeout(() => { document.getElementById('reminderDate').style.borderColor = ''; }, 3000);
        return;
    }

    const proposals = DB.get('proposals');
    const editId = document.getElementById('editProposalId').value;

    if (editId) {
        const idx = proposals.findIndex(p => p.id === editId);
        if (idx >= 0) {
            data.id = editId;
            data.proposalNo = proposals[idx].proposalNo;
            data.status = status;
            data.createdAt = proposals[idx].createdAt;
            data.updatedAt = new Date().toISOString();
            data.callLogs = proposals[idx].callLogs || [];
            data.reminderCompleted = proposals[idx].reminderCompleted || false;
            data.acceptToken = proposals[idx].acceptToken || generateId();
            proposals[idx] = data;
        }
    } else {
        data.id = generateId();
        data.proposalNo = generateProposalNo(proposals);
        data.status = status;
        data.createdAt = new Date().toISOString();
        data.updatedAt = new Date().toISOString();
        data.callLogs = [];
        data.reminderCompleted = false;
        data.acceptToken = generateId();
        proposals.push(data);
    }

    DB.set('proposals', proposals);
    autoSaveCustomer(data);

    showToast(`Teklif ${editId ? 'güncellendi' : 'kaydedildi'}: ${data.proposalNo}`, 'success');
    resetForm();
    navigateTo('proposals');
}

function saveAsDraft() {
    saveProposal('taslak');
}

function autoSaveCustomer(data) {
    if (!data.customerName) return;
    const customers = DB.get('customers');
    const exists = customers.find(c => c.name.toLowerCase() === data.customerName.toLowerCase());
    if (!exists) {
        customers.push({
            id: generateId(),
            name: data.customerName,
            contact: data.contactPerson,
            phone: data.customerPhone,
            email: data.customerEmail,
            fax: data.customerFax,
            taxOffice: data.taxOffice,
            taxNo: data.taxNumber,
            address: data.customerAddress
        });
        DB.set('customers', customers);
        populateCustomerSelect();
    }
}

function resetForm() {
    document.getElementById('proposalForm').reset();
    document.getElementById('editProposalId').value = '';
    document.getElementById('productTableBody').innerHTML = '';
    addProductRow();
    setDefaultDate();
    document.getElementById('kdvRate').value = '20';
    document.getElementById('kdvRateDisplay').textContent = '20';
    calculateTotals();
    document.getElementById('pageTitle').textContent = 'Yeni Teklif Oluştur';
}

// ============ TEKLİF LİSTESİ ============
function renderProposals() {
    const proposals = DB.get('proposals');
    const statusFilter = document.getElementById('statusFilter').value;
    const search = (document.getElementById('proposalSearch')?.value || '').toLowerCase();
    const tbody = document.getElementById('proposalsTableBody');
    const user = getCurrentUser();

    // Personel sadece kendi tekliflerini görür, admin hepsini görür
    let filtered = proposals;
    if (user && user.role !== 'admin') {
        filtered = filtered.filter(p => p.createdBy === user.username);
    }
    if (statusFilter === 'bekleyen') {
        filtered = filtered.filter(p => p.status === 'taslak' || p.status === 'gönderildi');
    } else if (statusFilter !== 'all') {
        filtered = filtered.filter(p => p.status === statusFilter);
    }
    if (search) {
        filtered = filtered.filter(p =>
            p.proposalNo.toLowerCase().includes(search) ||
            p.customerName.toLowerCase().includes(search)
        );
    }

    filtered = filtered.reverse();

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">
            <i class="fas fa-search"></i><p>Teklif bulunamadı</p></td></tr>`;
        return;
    }

    const users = getUsers();

    tbody.innerHTML = filtered.map(p => {
        const repUser = users.find(u => u.username === p.createdBy);
        const repName = repUser ? repUser.name : (p.salesRep || '-');
        return `
        <tr>
            <td><strong>${escapeHtml(p.proposalNo)}</strong></td>
            <td>
                <div><strong>${escapeHtml(p.customerName)}</strong></div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(p.contactPerson || '')}</div>
            </td>
            <td>
                <div style="font-size:0.82rem"><i class="fas fa-user" style="font-size:0.7rem;color:var(--text-muted);margin-right:3px"></i>${escapeHtml(repName)}</div>
            </td>
            <td>${formatDate(p.date)}</td>
            <td><strong>${formatMoney(p.grandTotal)} ${getCurrencySymbol(p.currency)}</strong></td>
            <td><span class="status-badge status-${p.status}">${getStatusText(p.status)}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-xs btn-primary" onclick="viewProposalPDF('${p.id}')" title="PDF Görüntüle">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                    <button class="btn btn-xs btn-outline" onclick="editProposal('${p.id}')" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-xs btn-outline" onclick="openSendModal('${p.id}')" title="Gönder" style="color:var(--info);border-color:var(--info)">
                        <i class="fas fa-share-alt"></i>
                    </button>
                    ${p.status !== 'kabul' ? `
                    <button class="btn btn-xs btn-outline" onclick="updateProposalStatus('${p.id}','kabul')" title="Kabul Et" style="color:var(--success);border-color:var(--success)">
                        <i class="fas fa-check"></i>
                    </button>` : ''}
                    ${p.status !== 'red' ? `
                    <button class="btn btn-xs btn-outline" onclick="updateProposalStatus('${p.id}','red')" title="Reddet" style="color:var(--danger);border-color:var(--danger)">
                        <i class="fas fa-times"></i>
                    </button>` : ''}
                    <button class="btn btn-xs btn-danger" onclick="deleteProposal('${p.id}')" title="Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function editProposal(id) {
    const proposals = DB.get('proposals');
    const p = proposals.find(pr => pr.id === id);
    if (!p) return;

    navigateTo('new-proposal');
    document.getElementById('pageTitle').textContent = `Teklif Düzenle: ${p.proposalNo}`;

    document.getElementById('editProposalId').value = p.id;
    document.getElementById('customerName').value = p.customerName || '';
    document.getElementById('contactPerson').value = p.contactPerson || '';
    document.getElementById('customerPhone').value = p.customerPhone || '';
    document.getElementById('customerEmail').value = p.customerEmail || '';
    document.getElementById('customerFax').value = p.customerFax || '';
    document.getElementById('taxOffice').value = p.taxOffice || '';
    document.getElementById('taxNumber').value = p.taxNumber || '';
    document.getElementById('customerAddress').value = p.customerAddress || '';
    document.getElementById('deliveryDate').value = p.deliveryDate || '';
    document.getElementById('orderNo').value = p.orderNo || p.proposalNo;
    document.getElementById('proposalDate').value = p.date || '';
    document.getElementById('currency').value = p.currency || 'USD';
    document.getElementById('kdvRate').value = p.kdvRate || 20;
    document.getElementById('kdvRateDisplay').textContent = p.kdvRate || 20;
    document.getElementById('paymentPlan').value = p.paymentPlan || 'PEŞİN';
    document.getElementById('discountAmount').value = p.discount || 0;
    document.getElementById('additionalServices').value = p.additionalServices || '';
    document.getElementById('proposalNotes').value = p.notes || '';
    document.getElementById('reminderDate').value = p.reminderDate || '';

    const tbody = document.getElementById('productTableBody');
    tbody.innerHTML = '';
    if (p.items && p.items.length > 0) {
        p.items.forEach(item => {
            addProductRow(item.name, item.price, item.qty);
        });
    } else {
        addProductRow();
    }

    calculateTotals();
}

function updateProposalStatus(id, status) {
    const proposals = DB.get('proposals');
    const idx = proposals.findIndex(p => p.id === id);
    if (idx < 0) return;

    const p = proposals[idx];
    const isAccept = status === 'kabul';

    showConfirmModal({
        type: isAccept ? 'success' : 'danger',
        icon: isAccept ? 'fa-check-circle' : 'fa-times-circle',
        title: isAccept ? 'Teklifi Kabul Et' : 'Teklifi Reddet',
        desc: isAccept
            ? 'Bu teklifi kabul etmek istediğinizden emin misiniz? Durum "Kabul Edildi" olarak güncellenecektir.'
            : 'Bu teklifi reddetmek istediğinizden emin misiniz? Durum "Reddedildi" olarak güncellenecektir.',
        info: {
            'Teklif No': p.proposalNo,
            'Müşteri': p.customerName,
            'Tutar': formatMoney(p.grandTotal) + ' ' + getCurrencySymbol(p.currency),
            'Tarih': formatDate(p.date)
        },
        okText: isAccept ? '<i class="fas fa-check"></i> Evet, Kabul Et' : '<i class="fas fa-times"></i> Evet, Reddet',
        onConfirm: function() {
            const fresh = DB.get('proposals');
            const i = fresh.findIndex(pr => pr.id === id);
            if (i < 0) return;
            fresh[i].status = status;
            fresh[i].updatedAt = new Date().toISOString();
            fresh[i].reminderCompleted = true;
            DB.set('proposals', fresh);

            const statusText = getStatusText(status);
            showToast('Teklif durumu güncellendi: ' + statusText, 'success');

            if (isAccept) {
                showConfirmModal({
                    type: 'success',
                    icon: 'fa-envelope',
                    title: 'Müşteriye Bildir',
                    desc: 'Teklif başarıyla kabul edildi! Müşteriye bilgilendirme göndermek ister misiniz?',
                    info: { 'Müşteri': fresh[i].customerName, 'E-posta': fresh[i].customerEmail || '-' },
                    okText: '<i class="fas fa-paper-plane"></i> Bilgilendirme Gönder',
                    cancelText: '<i class="fas fa-check"></i> Hayır, Kapat',
                    onConfirm: function() { openSendModal(id); }
                });
            }

            renderProposals();
            renderReminders();
            renderDashboard();
            checkReminders();
        }
    });
}

// ============ ONAY MODALI ============
function showConfirmModal(opts) {
    const iconEl = document.getElementById('confirmModalIcon');
    iconEl.className = 'confirm-modal-icon icon-' + opts.type;
    iconEl.innerHTML = '<i class="fas ' + opts.icon + '"></i>';

    document.getElementById('confirmModalTitle').textContent = opts.title;
    document.getElementById('confirmModalDesc').textContent = opts.desc;

    const infoEl = document.getElementById('confirmModalInfo');
    if (opts.info) {
        let html = '';
        for (const key in opts.info) {
            html += '<div class="info-row"><span>' + escapeHtml(key) + '</span><strong>' + escapeHtml(opts.info[key]) + '</strong></div>';
        }
        infoEl.innerHTML = html;
        infoEl.style.display = '';
    } else {
        infoEl.style.display = 'none';
    }

    const okBtn = document.getElementById('confirmModalOk');
    okBtn.innerHTML = opts.okText || 'Onayla';
    okBtn.className = 'btn btn-confirm-' + opts.type;

    const cancelBtn = document.getElementById('confirmModalCancel');
    cancelBtn.innerHTML = opts.cancelText || '<i class="fas fa-arrow-left"></i> Vazgeç';

    // Eski listener'ları temizle
    const newOk = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    newOk.addEventListener('click', function() {
        closeConfirmModal();
        if (opts.onConfirm) opts.onConfirm();
    });

    window._confirmModalCallback = null;
    openModal('confirmModal');
}

function closeConfirmModal() {
    closeModal('confirmModal');
}

function deleteProposal(id) {
    const proposals = DB.get('proposals');
    const p = proposals.find(pr => pr.id === id);
    if (!p) return;

    showConfirmModal({
        type: 'danger',
        icon: 'fa-trash-alt',
        title: 'Teklifi Sil',
        desc: 'Bu teklif kalıcı olarak silinecektir. Bu işlem geri alınamaz.',
        info: { 'Teklif No': p.proposalNo, 'Müşteri': p.customerName },
        okText: '<i class="fas fa-trash"></i> Evet, Sil',
        onConfirm: function() {
            let fresh = DB.get('proposals');
            fresh = fresh.filter(pr => pr.id !== id);
            DB.set('proposals', fresh);
            DB.deleteFromServer('proposals', id);
            showToast('Teklif silindi.', 'info');
            renderProposals();
            renderDashboard();
        }
    });
}

// ============ GÖNDERME SİSTEMİ (E-posta / WhatsApp) ============
function openSendModal(proposalId) {
    const proposals = DB.get('proposals');
    const p = proposals.find(pr => pr.id === proposalId);
    if (!p) return;

    document.getElementById('sendProposalId').value = proposalId;

    const settings = DB.getSettings();
    const subject = (settings.emailSubject || 'BİLGESİS - Sipariş & Teklif Formu - {proposalNo}')
        .replace('{proposalNo}', p.proposalNo);
    const body = (settings.emailBody || '')
        .replace('{customerName}', p.customerName)
        .replace('{proposalNo}', p.proposalNo);

    document.getElementById('sendEmailTo').value = p.customerEmail || '';
    document.getElementById('sendEmailSubject').value = subject;
    document.getElementById('sendEmailBody').value = body;

    // WhatsApp
    const phone = (p.customerPhone || '').replace(/[\s()-]/g, '');
    document.getElementById('sendWhatsappPhone').value = phone;
    document.getElementById('sendWhatsappMsg').value = `Sayın ${p.customerName},\n\n${p.proposalNo} numaralı teklifimizi bilgilerinize sunarız.\n\nTutar: ${formatMoney(p.grandTotal)} ${getCurrencySymbol(p.currency)}\n\nSaygılarımızla,\nBİLGESİS`;

    switchSendTab('email');
    openModal('sendModal');
}

function switchSendTab(tab) {
    document.querySelectorAll('.send-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.send-tab-content').forEach(c => c.classList.remove('active'));

    if (tab === 'email') {
        document.getElementById('tabEmail').classList.add('active');
        document.getElementById('sendEmailContent').classList.add('active');
    } else {
        document.getElementById('tabWhatsapp').classList.add('active');
        document.getElementById('sendWhatsappContent').classList.add('active');
    }
}

async function executeSend() {
    const proposalId = document.getElementById('sendProposalId').value;
    const proposals = DB.get('proposals');
    const p = proposals.find(pr => pr.id === proposalId);

    const isEmailTab = document.getElementById('tabEmail').classList.contains('active');

    if (isEmailTab) {
        const to = document.getElementById('sendEmailTo').value;
        const subject = document.getElementById('sendEmailSubject').value;
        let body = document.getElementById('sendEmailBody').value;

        if (!to) {
            showToast('E-posta adresi gereklidir!', 'error');
            return;
        }

        const settings = DB.getSettings();
        if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
            showToast('Önce Ayarlar sayfasından SMTP mail ayarlarını yapınız!', 'error');
            return;
        }

        // Add accept link info
        if (document.getElementById('sendAcceptLink').checked && p) {
            body += '\n\n---\nTeklifi kabul etmek için lütfen bizimle iletişime geçiniz veya bu mesaja "KABUL" yazarak yanıtlayınız.';
            body += '\nTeklif No: ' + p.proposalNo;
        }

        // Gönder butonunu devre dışı bırak
        const sendBtn = document.querySelector('#sendModal .btn-success');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gönderiliyor...';
        }

        try {
            // PDF ek olarak eklenecekse base64 olarak üret
            let pdfBase64 = null;
            let pdfFilename = null;
            if (document.getElementById('sendPdfAttach').checked && p) {
                try {
                    if (!window.jspdf) {
                        throw new Error('jsPDF kütüphanesi yüklenemedi');
                    }
                    const doc = generateProposalPDF(p, false, false);
                    pdfBase64 = doc.output('datauristring').split(',')[1];
                    pdfFilename = `bilgesis_teklif_${p.proposalNo || 'yeni'}.pdf`;
                } catch (pdfErr) {
                    showToast('PDF oluşturulamadı: ' + pdfErr.message + '. Mail PDF eksiz gönderilecek.', 'warning');
                }
            }

            const response = await fetch(API_BASE + '/send-email', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    to,
                    subject,
                    body,
                    smtpHost: settings.smtpHost,
                    smtpPort: settings.smtpPort || '587',
                    smtpUser: settings.smtpUser,
                    smtpPass: settings.smtpPass,
                    fromName: settings.companyName || settings.smtpUser,
                    pdfBase64,
                    pdfFilename
                })
            });

            const result = await response.json();
            if (result.success) {
                showToast('E-posta başarıyla gönderildi!' + (pdfBase64 ? ' (PDF ek olarak eklendi)' : ''), 'success');
            } else {
                showToast('E-posta gönderilemedi: ' + result.error, 'error');
            }
        } catch (err) {
            showToast('E-posta gönderme hatası: ' + err.message, 'error');
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gönder';
            }
        }
    } else {
        const phone = document.getElementById('sendWhatsappPhone').value.replace(/[\s()-+]/g, '');
        let msg = document.getElementById('sendWhatsappMsg').value;

        if (!phone) {
            showToast('Telefon numarası gereklidir!', 'error');
            return;
        }

        // PDF indir
        if (document.getElementById('sendWaPdf').checked && p) {
            generateProposalPDF(p, true);
        }

        // Kabul linki ekle
        if (document.getElementById('sendWaLink').checked && p) {
            msg += '\n\n---\nTeklifi kabul etmek için lütfen bu mesaja *KABUL* yazarak yanıtlayınız.';
            msg += '\nTeklif No: ' + p.proposalNo;
        }

        const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
        window.open(waUrl, '_blank');

        showToast('WhatsApp açıldı. İndirilen PDF dosyasını WhatsApp\'ta paylaşmayı unutmayın.', 'info');
    }

    // Update proposal status to sent if it was draft
    if (p && p.status === 'taslak') {
        const idx = proposals.findIndex(pr => pr.id === proposalId);
        if (idx >= 0) {
            proposals[idx].status = 'gönderildi';
            proposals[idx].updatedAt = new Date().toISOString();
            DB.set('proposals', proposals);
        }
    }

    closeModal('sendModal');
    renderProposals();
    renderDashboard();
}

// ============ MÜŞTERİ YÖNETİMİ ============
function renderCustomers() {
    const customers = DB.get('customers');
    const proposals = DB.get('proposals');
    const search = (document.getElementById('customerSearch')?.value || '').toLowerCase();
    const tbody = document.getElementById('customersTableBody');

    let filtered = customers;
    if (search) {
        filtered = filtered.filter(c =>
            c.name.toLowerCase().includes(search) ||
            (c.contact || '').toLowerCase().includes(search)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">
            <i class="fas fa-users"></i><p>Müşteri bulunamadı</p></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        const count = proposals.filter(p => p.customerName === c.name).length;
        return `
        <tr>
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td>${escapeHtml(c.contact || '-')}</td>
            <td>${escapeHtml(c.phone || '-')}</td>
            <td>${escapeHtml(c.email || '-')}</td>
            <td>${count}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-xs btn-outline" onclick="editCustomer('${c.id}')" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-xs btn-danger" onclick="deleteCustomer('${c.id}')" title="Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function showCustomerModal(id = null) {
    document.getElementById('editCustomerId').value = '';
    document.getElementById('customerModalTitle').textContent = 'Yeni Müşteri';
    document.getElementById('modalCustName').value = '';
    document.getElementById('modalCustContact').value = '';
    document.getElementById('modalCustPhone').value = '';
    document.getElementById('modalCustEmail').value = '';
    document.getElementById('modalCustFax').value = '';
    document.getElementById('modalCustTaxOffice').value = '';
    document.getElementById('modalCustTaxNo').value = '';
    document.getElementById('modalCustAddress').value = '';
    openModal('customerModal');
}

function editCustomer(id) {
    const customers = DB.get('customers');
    const c = customers.find(cu => cu.id === id);
    if (!c) return;

    document.getElementById('editCustomerId').value = c.id;
    document.getElementById('customerModalTitle').textContent = 'Müşteri Düzenle';
    document.getElementById('modalCustName').value = c.name || '';
    document.getElementById('modalCustContact').value = c.contact || '';
    document.getElementById('modalCustPhone').value = c.phone || '';
    document.getElementById('modalCustEmail').value = c.email || '';
    document.getElementById('modalCustFax').value = c.fax || '';
    document.getElementById('modalCustTaxOffice').value = c.taxOffice || '';
    document.getElementById('modalCustTaxNo').value = c.taxNo || '';
    document.getElementById('modalCustAddress').value = c.address || '';
    openModal('customerModal');
}

function saveCustomer() {
    const name = document.getElementById('modalCustName').value.trim();
    if (!name) {
        showToast('Firma adı zorunludur!', 'error');
        return;
    }

    const customers = DB.get('customers');
    const editId = document.getElementById('editCustomerId').value;
    const customerData = {
        name,
        contact: document.getElementById('modalCustContact').value,
        phone: document.getElementById('modalCustPhone').value,
        email: document.getElementById('modalCustEmail').value,
        fax: document.getElementById('modalCustFax').value,
        taxOffice: document.getElementById('modalCustTaxOffice').value,
        taxNo: document.getElementById('modalCustTaxNo').value,
        address: document.getElementById('modalCustAddress').value
    };

    if (editId) {
        const idx = customers.findIndex(c => c.id === editId);
        if (idx >= 0) {
            customerData.id = editId;
            customers[idx] = customerData;
        }
    } else {
        customerData.id = generateId();
        customers.push(customerData);
    }

    DB.set('customers', customers);
    populateCustomerSelect();
    closeModal('customerModal');
    renderCustomers();
    showToast('Müşteri kaydedildi.', 'success');
}

function deleteCustomer(id) {
    if (!confirm('Bu müşteriyi silmek istediğinizden emin misiniz?')) return;
    let customers = DB.get('customers');
    customers = customers.filter(c => c.id !== id);
    DB.set('customers', customers);
    DB.deleteFromServer('customers', id);
    populateCustomerSelect();
    renderCustomers();
    showToast('Müşteri silindi.', 'info');
}

function populateCustomerSelect() {
    const select = document.getElementById('customerSelect');
    const customers = DB.get('customers');
    select.innerHTML = '<option value="">Kayıtlı müşteri seçin...</option>';
    customers.forEach(c => {
        select.innerHTML += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`;
    });
}

// ============ ÜRÜN YÖNETİMİ ============
function renderProducts() {
    const products = DB.get('products');
    const search = (document.getElementById('productSearch')?.value || '').toLowerCase();
    const tbody = document.getElementById('productsTableBody');

    let filtered = products;
    if (search) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">
            <i class="fas fa-box-open"></i><p>Ürün bulunamadı</p></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(p => `
        <tr>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td>${escapeHtml(p.category || '-')}</td>
            <td>${formatMoney(p.price)} ${getCurrencySymbol(p.currency)}</td>
            <td>${escapeHtml(p.currency)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-xs btn-outline" onclick="editProduct('${p.id}')" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-xs btn-danger" onclick="deleteProduct('${p.id}')" title="Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function showProductModal() {
    document.getElementById('editProductId').value = '';
    document.getElementById('productModalTitle').textContent = 'Yeni Ürün';
    document.getElementById('modalProdName').value = '';
    document.getElementById('modalProdCategory').value = 'Donanım';
    document.getElementById('modalProdPrice').value = '';
    document.getElementById('modalProdCurrency').value = 'USD';
    openModal('productModal');
}

function editProduct(id) {
    const products = DB.get('products');
    const p = products.find(pr => pr.id === id);
    if (!p) return;

    document.getElementById('editProductId').value = p.id;
    document.getElementById('productModalTitle').textContent = 'Ürün Düzenle';
    document.getElementById('modalProdName').value = p.name || '';
    document.getElementById('modalProdCategory').value = p.category || 'Donanım';
    document.getElementById('modalProdPrice').value = p.price || '';
    document.getElementById('modalProdCurrency').value = p.currency || 'USD';
    openModal('productModal');
}

function saveProduct() {
    const name = document.getElementById('modalProdName').value.trim();
    if (!name) {
        showToast('Ürün adı zorunludur!', 'error');
        return;
    }

    const products = DB.get('products');
    const editId = document.getElementById('editProductId').value;
    const productData = {
        name,
        category: document.getElementById('modalProdCategory').value,
        price: parseFloat(document.getElementById('modalProdPrice').value) || 0,
        currency: document.getElementById('modalProdCurrency').value
    };

    if (editId) {
        const idx = products.findIndex(p => p.id === editId);
        if (idx >= 0) {
            productData.id = editId;
            products[idx] = productData;
        }
    } else {
        productData.id = generateId();
        products.push(productData);
    }

    DB.set('products', products);
    populateProductSelect();
    closeModal('productModal');
    renderProducts();
    showToast('Ürün kaydedildi.', 'success');
}

function deleteProduct(id) {
    if (!confirm('Bu ürünü silmek istediğinizden emin misiniz?')) return;
    let products = DB.get('products');
    products = products.filter(p => p.id !== id);
    DB.set('products', products);
    DB.deleteFromServer('products', id);
    populateProductSelect();
    renderProducts();
    showToast('Ürün silindi.', 'info');
}

function populateProductSelect() {
    const select = document.getElementById('productSelect');
    const products = DB.get('products');
    select.innerHTML = '<option value="">Kayıtlı ürün ekle...</option>';
    products.forEach(p => {
        select.innerHTML += `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} - ${formatMoney(p.price)} ${getCurrencySymbol(p.currency)}</option>`;
    });
}

// ============ PERSONEL YÖNETİMİ ============
function renderPersonnel() {
    const users = getUsers();
    const tbody = document.getElementById('personnelTableBody');

    tbody.innerHTML = users.map(u => `
        <tr>
            <td><strong>${escapeHtml(u.name)}</strong></td>
            <td>${escapeHtml(u.username)}</td>
            <td><span class="status-badge ${u.role === 'admin' ? 'status-kabul' : 'status-gönderildi'}">${u.role === 'admin' ? 'Yönetici' : 'Personel'}</span></td>
            <td>${escapeHtml(u.email || '-')}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-xs btn-outline" onclick="editPersonnel('${u.id}')" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${u.username !== 'admin' ? `
                    <button class="btn btn-xs btn-danger" onclick="deletePersonnel('${u.id}')" title="Sil">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

function showPersonnelModal() {
    document.getElementById('editPersonnelId').value = '';
    document.getElementById('personnelModalTitle').textContent = 'Yeni Personel';
    document.getElementById('modalPersName').value = '';
    document.getElementById('modalPersUsername').value = '';
    document.getElementById('modalPersPassword').value = '';
    document.getElementById('modalPersEmail').value = '';
    document.getElementById('modalPersRole').value = 'personel';
    openModal('personnelModal');
}

function editPersonnel(id) {
    const users = getUsers();
    const u = users.find(us => us.id === id);
    if (!u) return;

    document.getElementById('editPersonnelId').value = u.id;
    document.getElementById('personnelModalTitle').textContent = 'Personel Düzenle';
    document.getElementById('modalPersName').value = u.name || '';
    document.getElementById('modalPersUsername').value = u.username || '';
    document.getElementById('modalPersPassword').value = '';
    document.getElementById('modalPersEmail').value = u.email || '';
    document.getElementById('modalPersRole').value = u.role || 'personel';
    openModal('personnelModal');
}

function savePersonnel() {
    const name = document.getElementById('modalPersName').value.trim();
    const username = document.getElementById('modalPersUsername').value.trim();
    const password = document.getElementById('modalPersPassword').value;
    const email = document.getElementById('modalPersEmail').value;
    const role = document.getElementById('modalPersRole').value;
    const editId = document.getElementById('editPersonnelId').value;

    if (!name || !username) {
        showToast('Ad ve kullanıcı adı zorunludur!', 'error');
        return;
    }

    const users = getUsers();

    if (editId) {
        const idx = users.findIndex(u => u.id === editId);
        if (idx >= 0) {
            users[idx].name = name;
            users[idx].username = username;
            if (password) users[idx].password = password;
            users[idx].email = email;
            users[idx].role = role;
        }
    } else {
        if (!password) {
            showToast('Şifre zorunludur!', 'error');
            return;
        }
        if (users.find(u => u.username === username)) {
            showToast('Bu kullanıcı adı zaten mevcut!', 'error');
            return;
        }
        users.push({
            id: generateId(),
            name, username, password, email, role
        });
    }

    DB.set('users', users);
    closeModal('personnelModal');
    renderPersonnel();
    showToast('Personel kaydedildi.', 'success');
}

function deletePersonnel(id) {
    if (!confirm('Bu personeli silmek istediğinizden emin misiniz?')) return;
    let users = getUsers();
    users = users.filter(u => u.id !== id);
    DB.set('users', users);
    DB.deleteFromServer('users', id);
    renderPersonnel();
    showToast('Personel silindi.', 'info');
}

// ============ AYARLAR ============
function loadSettings() {
    const s = DB.getSettings();
    if (s.companyName) document.getElementById('settCompanyName').value = s.companyName;
    if (s.address) document.getElementById('settAddress').value = s.address;
    if (s.phone) document.getElementById('settPhone').value = s.phone;
    if (s.fax) document.getElementById('settFax').value = s.fax;
    if (s.website) document.getElementById('settWebsite').value = s.website;
    if (s.email) document.getElementById('settEmail').value = s.email;
    if (s.smtpHost) document.getElementById('settSmtpHost').value = s.smtpHost;
    if (s.smtpPort) document.getElementById('settSmtpPort').value = s.smtpPort;
    if (s.smtpUser) document.getElementById('settSmtpUser').value = s.smtpUser;
    if (s.smtpPass) document.getElementById('settSmtpPass').value = s.smtpPass;
    if (s.emailSubject) document.getElementById('settEmailSubject').value = s.emailSubject;
    if (s.emailBody) document.getElementById('settEmailBody').value = s.emailBody;
    if (s.pdfNotes) document.getElementById('settPdfNotes').value = s.pdfNotes;
}

function saveSettings() {
    const settings = {
        companyName: document.getElementById('settCompanyName').value,
        address: document.getElementById('settAddress').value,
        phone: document.getElementById('settPhone').value,
        fax: document.getElementById('settFax').value,
        website: document.getElementById('settWebsite').value,
        email: document.getElementById('settEmail').value,
        smtpHost: document.getElementById('settSmtpHost').value,
        smtpPort: document.getElementById('settSmtpPort').value,
        smtpUser: document.getElementById('settSmtpUser').value,
        smtpPass: document.getElementById('settSmtpPass').value,
        emailSubject: document.getElementById('settEmailSubject').value,
        emailBody: document.getElementById('settEmailBody').value,
        pdfNotes: document.getElementById('settPdfNotes').value
    };
    DB.setSettings(settings);
    showToast('Ayarlar kaydedildi.', 'success');
}

// ============ DIŞA AKTARMA ============
function exportAllProposals() {
    const proposals = DB.get('proposals');
    if (proposals.length === 0) {
        showToast('Dışa aktarılacak teklif yok.', 'warning');
        return;
    }

    let csv = 'Teklif No,Müşteri,Tarih,Tutar,Para Birimi,Durum\n';
    proposals.forEach(p => {
        csv += `"${p.proposalNo}","${p.customerName}","${formatDate(p.date)}","${p.grandTotal}","${p.currency}","${getStatusText(p.status)}"\n`;
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `bilgesis_teklifler_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('Teklifler CSV olarak indirildi.', 'success');
}

// ============ YARDIMCI FONKSİYONLAR ============
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function generateProposalNo(proposals) {
    const year = new Date().getFullYear();
    const count = proposals.filter(p => p.proposalNo && p.proposalNo.startsWith('BLG-' + year)).length + 1;
    return `BLG-${year}-${String(count).padStart(4, '0')}`;
}

function formatMoney(num) {
    if (isNaN(num)) return '0,00';
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return dateStr; }
}

function getCurrencySymbol(currency) {
    const symbols = { 'USD': '$', 'EUR': '€', 'TL': '₺' };
    return symbols[currency] || currency;
}

function getStatusText(status) {
    const texts = {
        'taslak': 'Taslak',
        'gönderildi': 'Gönderildi',
        'kabul': 'Kabul Edildi',
        'red': 'Reddedildi'
    };
    return texts[status] || status;
}

// ============ MODAL ============
function openModal(id) {
    document.getElementById(id).classList.add('show');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        // sendModal ve confirmModal dışarı tıklamayla kapanmasın
        if (e.target.id === 'sendModal' || e.target.id === 'confirmModal') return;
        e.target.classList.remove('show');
    }
});

// ============ TOAST ============
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${escapeHtml(message)}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ============ PDF ============
function previewPDF() {
    const data = getFormData();
    if (!data.customerName) {
        showToast('Önizleme için müşteri adı gereklidir.', 'warning');
        return;
    }
    data.proposalNo = document.getElementById('orderNo').value || 'ÖNIZLEME';
    data.date = document.getElementById('proposalDate').value;
    generateProposalPDF(data, false, true);
}

function viewProposalPDF(id) {
    const proposals = DB.get('proposals');
    const p = proposals.find(pr => pr.id === id);
    if (p) generateProposalPDF(p, false, true);
}

function downloadProposalPdfForSend() {
    const proposalId = document.getElementById('sendProposalId').value;
    const proposals = DB.get('proposals');
    const p = proposals.find(pr => pr.id === proposalId);
    if (p) {
        generateProposalPDF(p, true);
        showToast('PDF indirildi. WhatsApp\'ta dosya olarak paylaşabilirsiniz.', 'success');
    }
}

let currentPDFBlob = null;

function downloadCurrentPDF() {
    if (currentPDFBlob) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(currentPDFBlob);
        link.download = 'bilgesis_teklif.pdf';
        link.click();
    }
}
