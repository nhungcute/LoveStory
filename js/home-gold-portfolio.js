// --------------------------------------------------------------------------
// GOLD PORTFOLIO — CRUD transactions + history rendering
// --------------------------------------------------------------------------
function formatCurrencyInput(input) {
    let value = input.value.replace(/\D/g, "");
    if (value === "") { input.value = ""; return; }
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
    } catch (e) {
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

    portfolio.sort((a, b) => {
        let dateA = new Date(a.date).getTime();
        let dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });

    let currentTotalQuantity = 0;
    let currentCostPrice = 0;

    for (let i = 0; i < portfolio.length; i++) {
        let tx = portfolio[i];
        let type = String(tx.type).toLowerCase();
        let qty = parseFloat(tx.quantity_chi) || 0;
        let price = parseFloat(tx.price_per_chi) || 0;
        tx.calculatedCostBasis = 0;
        tx.calculatedPnL = null;
        if (type === 'buy') {
            currentCostPrice = currentTotalQuantity === 0
                ? price
                : ((currentTotalQuantity * currentCostPrice) + (qty * price)) / (currentTotalQuantity + qty);
            currentTotalQuantity += qty;
            tx.calculatedCostBasis = currentCostPrice;
        } else if (type === 'sell') {
            tx.calculatedCostBasis = currentCostPrice;
            tx.calculatedPnL = (price - currentCostPrice) * qty;
            currentTotalQuantity = Math.max(0, currentTotalQuantity - qty);
        }
    }

    let html = '';
    [...portfolio].reverse().forEach(tx => {
        let type = String(tx.type).toLowerCase();
        let isBuy = type === 'buy';
        let typeText = isBuy ? "Mua vào" : "Bán ra";
        let bgStyle = isBuy ? "rgba(25, 135, 84, 0.05)" : "rgba(220, 53, 69, 0.05)";
        let pnlText = "";
        if (!isBuy && tx.calculatedPnL !== null) {
            let v = tx.calculatedPnL;
            if (v > 0) pnlText = `<div class="text-success small fw-semibold">Lãi: +${formatGold(v)}</div>`;
            else if (v < 0) pnlText = `<div class="text-danger small fw-semibold">Lỗ: ${formatGold(v)}</div>`;
            else pnlText = `<div class="text-muted small fw-semibold">Hòa vốn</div>`;
        }
        let dateDisp = "";
        try {
            let d = new Date(tx.date);
            dateDisp = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
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
    document.getElementById('goldFormModalTitle').innerHTML = tx
        ? '<i class="bi bi-pencil-square me-2"></i> Sửa giao dịch'
        : '<i class="bi bi-plus-circle me-2"></i> Thêm giao dịch';
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
    if (!date || !quantity || !price) { showAlert("Vui lòng nhập đầy đủ Ngày, Số lượng và Giá."); return; }
    const btn = document.getElementById('btnSaveGoldTx');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    btn.disabled = true;
    try {
        const action = id ? 'update_gold_transaction' : 'log_gold_transaction';
        const res = await sendToServer({ action, id, date, type, quantity, price, note });
        if (res.status === 'success') {
            bootstrap.Modal.getInstance(document.getElementById('goldFormModal')).hide();
            loadGoldHistory();
        } else {
            showAlert("Lỗi: " + res.message);
        }
    } catch (e) {
        showAlert("Không thể lưu giao dịch.");
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
}

async function deleteGoldTransaction(id) {
    if (!confirm("Bạn có chắc chắn muốn xóa giao dịch này?")) return;
    try {
        const res = await sendToServer({ action: 'delete_gold_transaction', id });
        if (res.status === 'success') loadGoldHistory();
        else showAlert("Lỗi: " + res.message);
    } catch (e) {
        showAlert("Không thể xóa giao dịch.");
    }
}
