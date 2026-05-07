// --------------------------------------------------------------------------
// WIDGET STATE
// --------------------------------------------------------------------------
const HOME_CONFIG = {
    dueDate: new Date(localStorage.getItem('ls_due_date') || '2026-04-26T00:00:00'),
    dueDateDisplay: localStorage.getItem('ls_due_date_display') || '26/04/2026',
};
const PREGNANCY_WEEKS_TOTAL = 40;

let kickState = {
    count: 0,
    today: getTodayKey(),
    history: JSON.parse(localStorage.getItem('ls_kick_history') || '{}'),
};

function renderHomeWidgets() {
    const container = document.getElementById('homeWidgets');
    if (!container) return;
    container.innerHTML = '';
    if (state.profile.widgetPregnancy !== false) container.appendChild(buildPregnancyWidget());
    if (state.profile.widgetKick !== false) container.appendChild(buildKickWidget());
    if (state.profile.widgetGold !== false) container.appendChild(buildGoldWidget());
    fetchGoldPrices();
    loadKickState();
}

// --------------------------------------------------------------------------
// PREGNANCY WIDGET
// --------------------------------------------------------------------------
function buildPregnancyWidget() {
    const { weeks, days, totalDays, daysLeft } = getPregnancyInfo();
    const progress = Math.min(100, Math.round((totalDays / (PREGNANCY_WEEKS_TOTAL * 7)) * 100));
    const card = document.createElement('div');
    card.className = 'widget-card mb-3';
    card.innerHTML = `
        <div class="widget-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                    <div class="widget-title"><i class="bi bi-person-hearts me-1 text-danger"></i>Baby</div>
                    <div class="text-muted" style="font-size:0.8rem;">Ngày dự sinh: ${HOME_CONFIG.dueDateDisplay}</div>
                </div>
                <div class="text-center">
                    <div class="pregnancy-weeks-circle">
                        <span class="weeks-num">${weeks}</span>
                        <span class="weeks-label">tuần</span>
                    </div>
                </div>
            </div>
            <div class="d-flex justify-content-between text-muted small mb-2">
                <span>${totalDays} ngày tuổi</span>
                <span>${weeks} tuần ${days} ngày</span>
                <span>Còn ${daysLeft} ngày</span>
            </div>
            <div class="progress rounded-pill" style="height:8px;">
                <div class="progress-bar rounded-pill theme-bg-primary" style="width:${progress}%" role="progressbar"></div>
            </div>
        </div>`;
    return card;
}

function getPregnancyInfo() {
    const now = new Date();
    const conception = new Date(HOME_CONFIG.dueDate.getTime() - 280 * 24 * 60 * 60 * 1000);
    const msPerDay = 24 * 60 * 60 * 1000;
    const totalDays = Math.max(0, Math.floor((now - conception) / msPerDay));
    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;
    const daysLeft = Math.max(0, Math.floor((HOME_CONFIG.dueDate - now) / msPerDay));
    return { weeks, days, totalDays, daysLeft };
}

// --------------------------------------------------------------------------
// KICK COUNTER WIDGET
// --------------------------------------------------------------------------
function buildKickWidget() {
    const todayCount = kickState.history[kickState.today] || 0;
    const card = document.createElement('div');
    card.className = 'widget-card mb-3';
    card.innerHTML = `
        <div class="widget-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="widget-title"><i class="bi bi-activity text-primary me-1"></i>Đếm Lượt</div>
                <button class="btn btn-link btn-sm text-muted p-0" onclick="openKickDashboard()">
                    <i class="bi bi-bar-chart-fill"></i> Thống kê
                </button>
            </div>
            <div class="d-flex align-items-center justify-content-between gap-3">
                <div class="text-center flex-grow-1">
                    <div class="kick-count-display" id="kickCountDisplay">${todayCount}</div>
                    <div class="text-muted small">lần hôm nay</div>
                </div>
                <div class="d-flex flex-column gap-2">
                    <button class="btn btn-kick theme-bg-primary text-white rounded-pill px-4 py-2 fw-semibold"
                            onclick="recordKick()" id="kickBtn">
                        <i class="bi bi-play-circle-fill me-1"></i>Run
                    </button>
                </div>
            </div>
        </div>`;
    return card;
}

function loadKickState() {
    const today = getTodayKey();
    if (kickState.today !== today) {
        kickState.today = today;
        kickState.count = 0;
    } else {
        kickState.count = kickState.history[today] || 0;
    }
    const display = document.getElementById('kickCountDisplay');
    if (display) display.textContent = kickState.count;
}

function recordKick() {
    const today = getTodayKey();
    kickState.today = today;
    kickState.count = (kickState.history[today] || 0) + 1;
    kickState.history[today] = kickState.count;
    localStorage.setItem('ls_kick_history', JSON.stringify(kickState.history));

    const display = document.getElementById('kickCountDisplay');
    if (display) {
        display.textContent = kickState.count;
        display.style.willChange = 'transform';
        display.classList.add('kick-pulse');
        setTimeout(() => {
            display.classList.remove('kick-pulse');
            display.style.willChange = 'auto';
        }, 400);
    }

    sendToServer({ action: 'log_babyrun', username: state.profile?.username || 'Guest' })
        .catch(e => console.error("Lỗi đồng bộ Run:", e));
}

async function openKickDashboard() {
    const btn = document.querySelector('button[onclick="openKickDashboard()"]');
    if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    try {
        const res = await sendToServer({ action: 'get_bike_stats', page: 1, limit: 100 });
        if (btn) btn.innerHTML = '<i class="bi bi-bar-chart-fill"></i> Thống kê';
        if (res.status === 'success' && res.history) {
            const labels = [];
            const data = [];
            res.history.forEach(item => { labels.push(item.date.substring(0, 5)); data.push(item.count); });
            const labelsEl = document.getElementById('kickChartLabels');
            const dataEl = document.getElementById('kickChartData');
            if (labelsEl) labelsEl.textContent = JSON.stringify(labels);
            if (dataEl) dataEl.textContent = JSON.stringify(data);
            openModal('kickDashboardModal');
            setTimeout(() => renderKickChart(labels, data), 300);
            setTimeout(() => { requestAnimationFrame(() => { if (window._kickChart) window._kickChart.resize(); }); }, 350);
        } else {
            showAlert("Không thể lấy thống kê.");
        }
    } catch (e) {
        if (btn) btn.innerHTML = '<i class="bi bi-bar-chart-fill"></i> Thống kê';
        showAlert("Có lỗi xảy ra: " + e.toString());
    }
}

function renderKickChart(labels, data) {
    const canvas = document.getElementById('kickChart');
    if (!canvas) return;
    const container = document.getElementById('kickChartContainer');
    if (container) {
        const minWidth = Math.max(container.parentElement.offsetWidth || 100, labels.length * 40);
        container.style.minWidth = minWidth + 'px';
    }
    if (window._kickChart) window._kickChart.destroy();
    if (typeof Chart === 'undefined') {
        canvas.parentElement.innerHTML = '<div class="text-center text-muted">Không hỗ trợ biểu đồ</div>';
        return;
    }
    window._kickChart = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Số lượt', data, borderColor: '#2D9CDB', backgroundColor: 'rgba(45, 156, 219, 0.15)', borderWidth: 2, tension: 0.3, fill: true }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
    if (container && container.parentElement) container.parentElement.scrollLeft = container.parentElement.scrollWidth;
}

function getTodayKey(d = new Date()) {
    return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}
