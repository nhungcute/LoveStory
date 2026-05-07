// --------------------------------------------------------------------------
// GOLD PRICE WIDGET
// --------------------------------------------------------------------------
let goldChartDataGlobal = null;

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
        if (body) body.innerHTML = renderErrorState('Không tải được giá vàng', 'fetchGoldPrices()');
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
    goldChartDataGlobal.forEach(item => {
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
    openModal('goldDashboardModal');
    setTimeout(() => {
        renderGoldChart(labels, dataBuy, dataSell);
        const outer = document.getElementById('goldChartContainer');
        if (outer && outer.parentElement) outer.parentElement.scrollLeft = outer.parentElement.scrollWidth;
        requestAnimationFrame(() => { if (window._goldChart) window._goldChart.resize(); });
    }, 300);
}

function renderGoldChart(labels, dataBuy, dataSell) {
    const canvas = document.getElementById('goldChart');
    if (!canvas) return;
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
            labels,
            datasets: [
                { label: 'Mua vào', data: dataBuy, borderColor: '#198754', backgroundColor: 'rgba(25, 135, 84, 0.1)', borderWidth: 2, tension: 0.3, fill: true },
                { label: 'Bán ra', data: dataSell, borderColor: '#dc3545', backgroundColor: 'rgba(220, 53, 69, 0.1)', borderWidth: 2, tension: 0.3, fill: true }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            let label = ctx.dataset.label ? ctx.dataset.label + ': ' : '';
                            if (ctx.parsed.y !== null) label += new Intl.NumberFormat('vi-VN').format(ctx.parsed.y) + ' ₫';
                            return label;
                        }
                    }
                }
            },
            scales: { y: { ticks: { callback: (v) => new Intl.NumberFormat('vi-VN').format(v) } } }
        }
    });
}

// Auto-refresh gold price every 15 minutes when Home tab is visible
setInterval(() => {
    if (typeof state !== 'undefined' && state.currentTab === 'tabHome') fetchGoldPrices();
}, 15 * 60 * 1000);
