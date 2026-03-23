/**
 * home.js
 * Home tab with widgets: Pregnancy Age, Baby Kick Counter (with charts), Gold Price.
 */

// --------------------------------------------------------------------------
// WIDGET STATE
// --------------------------------------------------------------------------
const DUE_DATE = new Date('2026-04-26T00:00:00'); // Expected birth date
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

    // Load gold prices from API
    fetchGoldPrices();
    // Load today's kick count
    loadKickState();
}

// --------------------------------------------------------------------------
// PREGNANCY WIDGET
// --------------------------------------------------------------------------
function buildPregnancyWidget() {
    const { weeks, days, totalDays, daysLeft } = getPregnancyInfo();
    const progress = Math.min(100, Math.round((totalDays / (PREGNANCY_WEEKS_TOTAL * 7)) * 100));
    const iconEmoji = weeks < 12 ? '🌱' : weeks < 24 ? '🌷' : weeks < 32 ? '👶' : '💝';

    const card = document.createElement('div');
    card.className = 'widget-card mb-3';
    card.innerHTML = `
        <div class="widget-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                    <div class="widget-title"><i class="bi bi-person-hearts me-1 text-danger"></i>Baby</div>
                    <div class="text-muted" style="font-size:0.8rem;">Ngày dự sinh: 26/04/2026</div>
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
    // Conception date = due date - 280 days (40 weeks)
    const conception = new Date(DUE_DATE.getTime() - 280 * 24 * 60 * 60 * 1000);
    const msPerDay = 24 * 60 * 60 * 1000;
    const totalDays = Math.max(0, Math.floor((now - conception) / msPerDay));
    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;
    const daysLeft = Math.max(0, Math.floor((DUE_DATE - now) / msPerDay));
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
    // Check if day has changed; auto-reset if so
    const today = getTodayKey();
    if (kickState.today !== today) {
        kickState.today = today;
        kickState.count = 0;
    } else {
        kickState.count = kickState.history[today] || 0;
    }
    document.getElementById('kickCountDisplay')?.textContent && (document.getElementById('kickCountDisplay').textContent = kickState.count);
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
        display.classList.add('kick-pulse');
        setTimeout(() => display.classList.remove('kick-pulse'), 400);
    }

    // Ghi nhận lên server
    sendToServer({
        action: 'log_babyrun',
        username: state.profile?.username || 'Guest'
    }).catch(e => console.error("Lỗi đồng bộ Run:", e));
}

// Đã loại bỏ nút Reset theo yêu cầu

async function openKickDashboard() {
    const btn = document.querySelector('button[onclick="openKickDashboard()"]');
    if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    try {
        const res = await sendToServer({ action: 'get_bike_stats', page: 1, limit: 100 });
        if (btn) btn.innerHTML = '<i class="bi bi-bar-chart-fill"></i> Thống kê';

        if (res.status === 'success' && res.history) {
            const labels = [];
            const data = [];
            res.history.forEach(item => {
                labels.push(item.date.substring(0, 5));
                data.push(item.count);
            });

            const labelsEl = document.getElementById('kickChartLabels');
            const dataEl = document.getElementById('kickChartData');
            if (labelsEl) labelsEl.textContent = JSON.stringify(labels);
            if (dataEl) dataEl.textContent = JSON.stringify(data);

            if (typeof openModal === 'function') openModal('kickDashboardModal');
            else {
                const m = new bootstrap.Modal(document.getElementById('kickDashboardModal'));
                m.show();
            }
            setTimeout(() => renderKickChart(labels, data), 300);
            setTimeout(() => {
                requestAnimationFrame(() => {
                    if (window._kickChart) window._kickChart.resize();
                });
            }, 350);
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
        data: {
            labels,
            datasets: [{
                label: 'Số lượt',
                data,
                borderColor: '#2D9CDB',
                backgroundColor: 'rgba(45, 156, 219, 0.15)',
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    if (container && container.parentElement) {
        container.parentElement.scrollLeft = container.parentElement.scrollWidth;
    }
}

function getTodayKey(d = new Date()) {
    return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}

// --------------------------------------------------------------------------
// GOLD PRICE WIDGET
// --------------------------------------------------------------------------
function buildGoldWidget() {
    const card = document.createElement('div');
    card.className = 'widget-card mb-3';
    card.innerHTML = `
        <div class="widget-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div class="widget-title">🪙 Giá Vàng</div>
                <button class="btn btn-link btn-sm text-muted p-0" onclick="openGoldDashboard()">
                    <i class="bi bi-bar-chart-fill"></i> Biểu đồ
                </button>
            </div>
            <div id="goldPriceBody">
                <div class="text-muted text-center py-2"><span class="spinner-border spinner-border-sm"></span> Đang tải...</div>
            </div>
        </div>`;
    return card;
}

let goldChartDataGlobal = null;

async function fetchGoldPrices() {
    const body = document.getElementById('goldPriceBody');
    if (!body) return;

    try {
        const res = await sendToServer({ action: 'get_critical_stats' });
        const gold = res.gold || {};
        goldChartDataGlobal = res.goldHistory || [];
        body.innerHTML = `
            <div class="row g-2 text-center">
                <div class="col-6">
                    <div class="gold-price-card">
                        <div class="text-muted small mb-1">Mua vào</div>
                        <div class="fw-bold text-success" style="font-size:1.1rem;">${formatGold(gold.buy || gold.buyPrice)}</div>
                    </div>
                </div>
                <div class="col-6">
                    <div class="gold-price-card">
                        <div class="text-muted small mb-1">Bán ra</div>
                        <div class="fw-bold text-danger" style="font-size:1.1rem;">${formatGold(gold.sell || gold.sellPrice)}</div>
                    </div>
                </div>
            </div>`;
    } catch (e) {
        if (body) body.innerHTML = `<div class="text-muted text-center py-2">Không tải được giá vàng</div>`;
    }
}

function formatGold(price) {
    if (!price) return 'N/A';
    return new Intl.NumberFormat('vi-VN').format(price) + ' ₫';
}

function openGoldDashboard() {
    if (!goldChartDataGlobal || goldChartDataGlobal.length === 0) {
        showAlert("Chưa có dữ liệu biểu đồ vàng");
        return;
    }
    const labels = [];
    const dataBuy = [];
    const dataSell = [];

    // Sử dụng toàn bộ dữ liệu (bỏ giới hạn 14 ngày)
    const displayData = goldChartDataGlobal;

    displayData.forEach(item => {
        labels.push(item.date.substring(0, 5));
        dataBuy.push(item.buy);
        dataSell.push(item.sell);
    });

    const labelsEl = document.getElementById('goldChartLabels');
    const dataBuyEl = document.getElementById('goldChartDataBuy');
    const dataSellEl = document.getElementById('goldChartDataSell');

    if (labelsEl) labelsEl.textContent = JSON.stringify(labels);
    if (dataBuyEl) dataBuyEl.textContent = JSON.stringify(dataBuy);
    if (dataSellEl) dataSellEl.textContent = JSON.stringify(dataSell);

    if (typeof openModal === 'function') openModal('goldDashboardModal');
    else {
        const m = new bootstrap.Modal(document.getElementById('goldDashboardModal'));
        m.show();
    }

    setTimeout(() => {
        renderGoldChart(labels, dataBuy, dataSell);
        // Tự động cuộn sang phải (ngày hiện tại mới nhất)
        const outerContainer = document.getElementById('goldChartContainer');
        if (outerContainer && outerContainer.parentElement) {
            outerContainer.parentElement.scrollLeft = outerContainer.parentElement.scrollWidth;
        }
        // Resize sau 1 frame để flexbox settle xong
        requestAnimationFrame(() => {
            if (window._goldChart) window._goldChart.resize();
        });
    }, 300);
}

function renderGoldChart(labels, dataBuy, dataSell) {
    const canvas = document.getElementById('goldChart');
    if (!canvas) return;

    // Tính toán độ rộng của canvas container dựa trên số lượng điểm dữ liệu
    // (Mỗi điểm chiếm khoảng 40px, để đảm bảo nhìn rõ)
    const container = document.getElementById('goldChartContainer');
    if (container) {
        const minWidth = Math.max(container.parentElement.offsetWidth || 100, labels.length * 40);
        container.style.minWidth = minWidth + 'px';
    }

    if (window._goldChart) window._goldChart.destroy();

    if (typeof Chart === 'undefined') {
        canvas.parentElement.innerHTML = '<div class="text-center text-muted">Không hỗ trợ biểu đồ trên thiết bị này</div>';
        return;
    }

    window._goldChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Mua vào',
                    data: dataBuy,
                    borderColor: '#198754',
                    backgroundColor: 'rgba(25, 135, 84, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Bán ra',
                    data: dataSell,
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('vi-VN').format(context.parsed.y) + ' ₫';
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        callback: function (value) {
                            return new Intl.NumberFormat('vi-VN').format(value);
                        }
                    }
                }
            }
        }
    });
}

// --------------------------------------------------------------------------
// GOLD HISTORY WIDGET (Tabs + CRUD + Calculation)
// --------------------------------------------------------------------------

function formatCurrencyInput(input) {
    let value = input.value.replace(/\D/g, "");
    if (value === "") {
        input.value = "";
        return;
    }
    input.value = new Intl.NumberFormat('en-US').format(value);
}

let currentGoldPortfolio = [];

async function loadGoldHistory() {
    const loader = document.getElementById('goldHistoryLoader');
    const container = document.getElementById('goldHistoryContainer');
    if (!loader || !container) return;
    
    loader.classList.remove('d-none');
    container.innerHTML = '';

    try {
        const res = await sendToServer({ action: 'get_gold_data' });
        if (res.status === 'success') {
            currentGoldPortfolio = res.portfolio || [];
            renderGoldHistory(currentGoldPortfolio);
        } else {
            container.innerHTML = `<div class="text-danger text-center py-3">Lỗi: ${res.message}</div>`;
        }
    } catch(e) {
        container.innerHTML = `<div class="text-danger text-center py-3">Không tải được lịch sử.</div>`;
    } finally {
        loader.classList.add('d-none');
    }
}

function renderGoldHistory(portfolio) {
    const container = document.getElementById('goldHistoryContainer');
    if (portfolio.length === 0) {
        container.innerHTML = '<div class="text-muted text-center py-4">Chưa có giao dịch nào.</div>';
        return;
    }

    // Sort chronologically to calculate cost-basis
    portfolio.sort((a, b) => {
        let dateA = new Date(a.date).getTime();
        let dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });

    let html = '';
    let currentTotalQuantity = 0;
    let currentCostPrice = 0;

    // Loop through chronologically to calculate cost basis and PnL
    for (let i = 0; i < portfolio.length; i++) {
        let tx = portfolio[i];
        let type = String(tx.type).toLowerCase();
        let qty = parseFloat(tx.quantity_chi) || 0;
        let price = parseFloat(tx.price_per_chi) || 0;
        
        tx.calculatedCostBasis = 0;
        tx.calculatedPnL = null;

        if (type === 'buy') {
            if (currentTotalQuantity === 0) {
                currentCostPrice = price;
            } else {
                currentCostPrice = ((currentTotalQuantity * currentCostPrice) + (qty * price)) / (currentTotalQuantity + qty);
            }
            currentTotalQuantity += qty;
            tx.calculatedCostBasis = currentCostPrice;
        } else if (type === 'sell') {
            tx.calculatedCostBasis = currentCostPrice;
            tx.calculatedPnL = (price - currentCostPrice) * qty;
            currentTotalQuantity -= qty;
            if (currentTotalQuantity < 0) currentTotalQuantity = 0;
        }
    }

    // Now render them in reverse chronological order (newest first)
    let renderList = [...portfolio].reverse();

    renderList.forEach(tx => {
        let type = String(tx.type).toLowerCase();
        let isBuy = type === 'buy';
        let typeText = isBuy ? "Mua vào" : "Bán ra";
        let bgStyle = isBuy ? "rgba(25, 135, 84, 0.05)" : "rgba(220, 53, 69, 0.05)";
        
        let pnlText = "";
        if (!isBuy && tx.calculatedPnL !== null) {
            let pnlValue = tx.calculatedPnL;
            if (pnlValue > 0) pnlText = `<div class="text-success small fw-semibold">Lãi: +${formatGold(pnlValue)}</div>`;
            else if (pnlValue < 0) pnlText = `<div class="text-danger small fw-semibold">Lỗ: ${formatGold(pnlValue)}</div>`;
            else pnlText = `<div class="text-muted small fw-semibold">Hòa vốn</div>`;
        }

        let dateDisp = "";
        try {
            let d = new Date(tx.date);
            dateDisp = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth() + 1).toString().padStart(2,'0')}/${d.getFullYear()}`;
        } catch(e) { dateDisp = tx.date; }

        let txStringified = JSON.stringify(tx).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

        html += `
        <div class="p-3 border rounded-3 position-relative shadow-sm" style="background: ${bgStyle};">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="badge ${isBuy ? 'bg-success' : 'bg-danger'}">${typeText}</span>
                <span class="small text-muted fw-medium">${dateDisp}</span>
            </div>
            
            <div class="d-flex justify-content-between mt-2">
                <div>
                    <div class="small text-muted mb-1">Số lượng / Giá</div>
                    <div class="fw-bold">${tx.quantity_chi} chỉ <span class="text-muted fw-normal mx-1">x</span> ${formatGold(tx.price_per_chi)}</div>
                </div>
                <div class="text-end">
                    <div class="small text-muted mb-1">Giá vốn TB</div>
                    <div class="fw-semibold text-dark">${formatGold(tx.calculatedCostBasis)}</div>
                </div>
            </div>
            ${pnlText ? `<div class="mt-2 text-end">${pnlText}</div>` : ''}
            
            ${tx.note ? `<div class="small text-muted mt-2 fst-italic bg-white p-2 rounded border"><i class="bi bi-chat-left-text me-1 text-secondary"></i>${tx.note}</div>` : ''}
            
            <div class="mt-3 pt-2 border-top d-flex justify-content-end gap-3">
                <button class="btn btn-sm text-primary p-0 fw-semibold" onclick="openGoldFormModal(${txStringified})"><i class="bi bi-pencil me-1"></i>Sửa</button>
                <button class="btn btn-sm text-danger p-0 fw-semibold" onclick="deleteGoldTransaction('${tx.id}')"><i class="bi bi-trash me-1"></i>Xóa</button>
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
}

function openGoldFormModal(tx = null) {
    const m = new bootstrap.Modal(document.getElementById('goldFormModal'));
    document.getElementById('goldFormModalTitle').innerHTML = tx ? '<i class="bi bi-pencil-square me-2"></i> Sửa giao dịch' : '<i class="bi bi-plus-circle me-2"></i> Thêm giao dịch';
    
    document.getElementById('goldTxId').value = tx ? tx.id : '';
    document.getElementById('goldTxDate').value = tx ? tx.date : getTodayKey();
    document.getElementById('goldTxType').value = tx ? tx.type : 'buy';
    document.getElementById('goldTxQuantity').value = tx ? tx.quantity_chi : '';
    document.getElementById('goldTxPrice').value = tx ? new Intl.NumberFormat('en-US').format(tx.price_per_chi) : '';
    document.getElementById('goldTxNote').value = tx ? (tx.note || '') : '';
    
    m.show();
}

async function saveGoldTransaction() {
    const id = document.getElementById('goldTxId').value;
    const date = document.getElementById('goldTxDate').value;
    const type = document.getElementById('goldTxType').value;
    const quantity = document.getElementById('goldTxQuantity').value;
    const priceStr = document.getElementById('goldTxPrice').value.replace(/,/g, '').replace(/\./g, '');
    const price = parseFloat(priceStr);
    const note = document.getElementById('goldTxNote').value;

    if (!date || !quantity || !price) {
        showAlert("Vui lòng nhập đầy đủ Ngày, Số lượng và Giá.");
        return;
    }

    const btn = document.getElementById('btnSaveGoldTx');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    btn.disabled = true;

    try {
        const action = id ? 'update_gold_transaction' : 'log_gold_transaction';
        const payload = { action, id, date, type, quantity, price, note };
        
        const res = await sendToServer(payload);
        if (res.status === 'success') {
            bootstrap.Modal.getInstance(document.getElementById('goldFormModal')).hide();
            loadGoldHistory(); 
            // Re-fetch global gold stats if needed
        } else {
            showAlert("Lỗi: " + res.message);
        }
    } catch(e) {
        showAlert("Không thể lưu giao dịch.");
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
}

async function deleteGoldTransaction(id) {
    // Show native confirm instead of custom because custom might not blocking returns correctly or requires callbacks, standard web `confirm` works nicely in mobile
    if (!confirm("Bạn có chắc chắn muốn xóa giao dịch này?")) return;
    
    try {
        const res = await sendToServer({ action: 'delete_gold_transaction', id });
        if (res.status === 'success') {
            loadGoldHistory();
        } else {
            showAlert("Lỗi: " + res.message);
        }
    } catch (e) {
        showAlert("Không thể xóa giao dịch.");
    }
}
