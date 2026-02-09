
function updateValueWithEffect(id, newValue) {
    const el = document.getElementById(id);
    if (!el) return; 
    el.classList.remove('data-stale'); 
    // 2. Kích hoạt hiệu ứng Rung
    el.classList.remove('anim-update'); 
    void el.offsetWidth;
    el.classList.add('anim-update');
 
    setTimeout(() => {
        el.classList.remove('anim-update');
    }, 400);
}

  // Set ngày mặc định
   const today = new Date();
   if (document.getElementById('bike-entry-date')) document.getElementById('bike-entry-date').valueAsDate = today;
   if (document.getElementById('gold-entry-date')) document.getElementById('gold-entry-date').valueAsDate = today;


function calculateGoldStats() {
   const goldEntries = allData.filter(d => d.type === 'gold_entry');

   if (goldEntries.length === 0) {
      return {
         highest: null,
         lowest: null,
         highestDate: null,
         lowestDate: null
      };
   }

   let highest = goldEntries[0];
   let lowest = goldEntries[0];

   goldEntries.forEach(entry => {
      if (entry.sellPrice > highest.sellPrice) highest = entry;
      if (entry.buyPrice < lowest.buyPrice) lowest = entry;
   });

   return {
      highest: highest.sellPrice,
      highestDate: highest.date,
      lowest: lowest.buyPrice,
      lowestDate: lowest.date
   };
}

function updateGoldStats(historyData) {
   if (!historyData || historyData.length === 0) return;

   // Filter valid sell prices
   const sellData = historyData.filter(d => Number(d.sell) > 0);
   if (sellData.length === 0) return;

   // Find Max
   const maxEntry = sellData.reduce((prev, curr) => Number(curr.sell) > Number(prev.sell) ? curr : prev);
   // Find Min
   const minEntry = sellData.reduce((prev, curr) => Number(curr.sell) < Number(prev.sell) ? curr : prev);

   // Helper to format currency
   const fmt = (val) => Number(val).toLocaleString('vi-VN');

   // Update DOM
   const maxPriceEl = document.getElementById('gold-highest-price');
   const maxDateEl = document.getElementById('gold-highest-date');
   const minPriceEl = document.getElementById('gold-lowest-price');
   const minDateEl = document.getElementById('gold-lowest-date');

   if (maxPriceEl) maxPriceEl.innerText = fmt(maxEntry.sell);
   if (maxDateEl) maxDateEl.innerText = maxEntry.date;

   if (minPriceEl) minPriceEl.innerText = fmt(minEntry.sell);
   if (minDateEl) minDateEl.innerText = minEntry.date;
}

function renderGoldChart(historyData) {
   const chartContainer = document.getElementById('gold-chart');
   if (!chartContainer) return;

   if (!historyData || historyData.length === 0) {
      chartContainer.innerHTML = '<div class="text-center py-5 text-muted small">Chưa có dữ liệu biểu đồ</div>';
      return;
   }

   // 1. Parse Data
   const parseDateVal = (dateStr) => {
      if (!dateStr) return 0;
      try {
         const parts = dateStr.trim().split('/');
         if (parts.length < 3) return 0;
         return new Date(parts[2], parseInt(parts[1]) - 1, parts[0]).getTime();
      } catch (e) { return 0; }
   };

   const sortedData = [...historyData].sort((a, b) => parseDateVal(a.date) - parseDateVal(b.date));
   const validData = sortedData.filter(d => (Number(d.buy) > 0 || Number(d.sell) > 0));

   if (validData.length === 0) {
      chartContainer.innerHTML = '<div class="text-center py-5 text-muted small">Dữ liệu giá không hợp lệ</div>';
      return;
   }

   // 2. Cấu hình kích thước
   const itemWidth = 70;
   const chartHeight = 300; // Tăng chiều cao lên 300px cho thoáng
   const totalWidth = Math.max(chartContainer.parentElement.offsetWidth, validData.length * itemWidth);

   // 3. Tính toán tỷ lệ (Scale)
   let allPrices = [];
   validData.forEach(d => {
      if (Number(d.buy) > 0) allPrices.push(Number(d.buy));
      if (Number(d.sell) > 0) allPrices.push(Number(d.sell));
   });

   if (allPrices.length === 0) return;

   let minVal = Math.min(...allPrices);
   let maxVal = Math.max(...allPrices);

   // Padding 5% (Giảm xuống để Zoom vào biến động giá kỹ hơn)
   const paddingVal = (maxVal - minVal) * 0.05 || (minVal * 0.005) || 50;
   minVal = minVal - paddingVal;
   maxVal = maxVal + paddingVal;
   const range = maxVal - minVal || 1;

   // Padding vẽ (pixel)
   const padTop = 40;
   const padBottom = 50;
   const effectiveHeight = chartHeight - padTop - padBottom;

   const getY = (val) => {
      return padTop + effectiveHeight - ((val - minVal) / range) * effectiveHeight;
   };

   // 4. Map Points
   const points = validData.map((d, i) => {
      const x = (i * itemWidth) + (itemWidth / 2);
      return {
         x,
         date: d.date,
         buy: Number(d.buy),
         sell: Number(d.sell),
         yBuy: Number(d.buy) > 0 ? getY(Number(d.buy)) : null,
         ySell: Number(d.sell) > 0 ? getY(Number(d.sell)) : null
      };
   });

   // 5. Bezier
   const getControlPoint = (p_curr, p_prev, p_next, reverse, key) => {
      const getCoord = (p) => p ? { x: p.x, y: p[key] } : null;
      const current = getCoord(p_curr);
      const previous = getCoord(p_prev) || current;
      const next = getCoord(p_next) || current;
      if (!current || !previous || !next) return current;
      const smoothing = 0.2;
      const oX = next.x - previous.x;
      const oY = next.y - previous.y;
      const length = Math.sqrt(Math.pow(oX, 2) + Math.pow(oY, 2)) * smoothing;
      const angle = Math.atan2(oY, oX) + (reverse ? Math.PI : 0);
      return {
         x: current.x + Math.cos(angle) * length,
         y: current.y + Math.sin(angle) * length
      };
   };

   const generatePath = (key) => {
      const validPoints = points.filter(p => p[key] !== null);
      if (validPoints.length < 2) return "";
      let d = `M ${validPoints[0].x} ${validPoints[0][key]}`;
      for (let i = 0; i < validPoints.length - 1; i++) {
         const p0 = validPoints[i - 1];
         const p1 = validPoints[i];
         const p2 = validPoints[i + 1];
         const p3 = validPoints[i + 2];
         const cp1 = getControlPoint(p1, p0, p2, false, key);
         const cp2 = getControlPoint(p2, p1, p3, true, key);
         d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2[key]}`;
      }
      return d;
   };

   const pathBuy = generatePath('yBuy');
   const pathSell = generatePath('ySell');
   const colorBuy = '#006B68'; // Xanh lá
   const colorSell = '#ff0000'; // Đỏ

   // 6. Render SVG
   chartContainer.innerHTML = `
            <svg width="${totalWidth}" height="${chartHeight}" xmlns="http://www.w3.org/2000/svg">
               <defs>
                  <filter id="shadowBuy" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="${colorBuy}" flood-opacity="0.3"/></filter>
                  <filter id="shadowSell" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="${colorSell}" flood-opacity="0.3"/></filter>
               </defs>
               
               <line x1="0" y1="${padTop}" x2="${totalWidth}" y2="${padTop}" stroke="#eee" stroke-width="1" stroke-dasharray="4"/>
               <line x1="0" y1="${chartHeight - padBottom}" x2="${totalWidth}" y2="${chartHeight - padBottom}" stroke="#eee" stroke-width="1" />

               ${pathBuy ? `<path d="${pathBuy}" fill="none" stroke="${colorBuy}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#shadowBuy)" />` : ''}
               ${pathSell ? `<path d="${pathSell}" fill="none" stroke="${colorSell}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#shadowSell)" />` : ''}

               ${points.map(p => p.yBuy !== null ? `
                  <g class="chart-point">
                     <text x="${p.x}" y="${p.yBuy + 20}" fill="${colorBuy}" font-size="10" text-anchor="middle" font-weight="bold">${(p.buy / 1000).toFixed(2)}</text>
                     <circle cx="${p.x}" cy="${p.yBuy}" r="3" fill="#fff" stroke="${colorBuy}" stroke-width="2" />
                  </g>
               ` : '').join('')}

               ${points.map(p => p.ySell !== null ? `
                  <g class="chart-point">
                     <text x="${p.x}" y="${p.ySell - 15}" fill="${colorSell}" font-size="10" text-anchor="middle" font-weight="bold">${(p.sell / 1000).toFixed(2)}</text>
                     <circle cx="${p.x}" cy="${p.ySell}" r="3" fill="#fff" stroke="${colorSell}" stroke-width="2" />
                  </g>
               ` : '').join('')}

               ${points.map(p => `
                   <text x="${p.x}" y="${chartHeight - 15}" fill="#999" font-size="10" text-anchor="middle">${p.date.substring(0, 5)}</text>
               `).join('')}
            </svg>
         `;

   setTimeout(() => {
      const wrapper = chartContainer.parentElement;
      if (wrapper) wrapper.scrollLeft = wrapper.scrollWidth;
   }, 100);
}


function renderGoldHistory() {
   const goldEntries = allData.filter(d => d.type === 'gold_entry').sort((a, b) => new Date(b.date) - new Date(a.date));
   const container = document.getElementById('gold-history-list');

   if (goldEntries.length === 0) {
      container.innerHTML = '<p class="text-center text-muted py-3">Chưa có dữ liệu</p>';
      return;
   }

   container.innerHTML = goldEntries.map(entry => {
      const date = new Date(entry.date);
      const dateStr = date.toLocaleDateString('vi-VN', {
         day: '2-digit',
         month: '2-digit',
         year: 'numeric'
      });
      return `
      			  <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      				<div>
      				  <div class="d-flex gap-3 mb-1">
      					<span class="text-success fw-semibold">${entry.buyPrice?.toLocaleString('vi-VN')}</span>
      					<span class="text-danger fw-semibold">${entry.sellPrice?.toLocaleString('vi-VN')}</span>
      				  </div>
      				  <small class="text-muted">${dateStr}</small>
      				  ${entry.note ? `<p class="small text-muted mb-0 mt-1">${entry.note}</p>` : ''}
      				</div>
      				<button class="btn btn-sm btn-outline-danger delete-gold-entry" data-id="${entry.__backendId}">
      				  <i class="bi bi-trash"></i>
      				</button>
      			  </div>
      			`;
   }).join('');
}

async function showGoldStats() {
   goldStatsModal.show();
   document.getElementById('gold-history-list').innerHTML = createLoaderHtml('gold-history-loader', 'Đang tải giao dịch vàng...');
   try {
      const res = await sendToServer({
         action: 'get_gold_data'
      });

      if (res.status === 'success') {
         goldPortfolioData = res.portfolio;
         if (res.chartData)
            renderGoldChart(res.chartData);
         updateGoldStats(res.chartData);
         loadGoldPortfolio();
      }
   } catch (e) {
      console.error(e);
      showToast('Lỗi tải dữ liệu vàng');
   }
}
// --- LOGIC TÍNH TOÁN
function loadGoldPortfolio() {
   const listEl = document.getElementById('gold-history-list');
   listEl.innerHTML = '';

   if (goldPortfolioData.length === 0) {
      listEl.innerHTML = '<p class="text-center text-muted py-3">Chưa có giao dịch nào</p>';
      return;
   }

   // 1. Sắp xếp giao dịch
   const transactions = [...goldPortfolioData].sort((a, b) => new Date(a.date) - new Date(b.date));

   let totalHolding = 0;
   let avgCost = 0;
   let totalRealizedPNL = 0;

   const enrichedTransactions = [];

   // 2. PASS 1: Tính toán
   for (let i = 0; i < transactions.length; i++) {
      const tx = {
         ...transactions[i],
         quantity_chi: Number(transactions[i].quantity_chi),
         price_per_chi: Number(transactions[i].price_per_chi)
      };
      let realizedPNL = 0;

      if (tx.type === 'buy') {
         const newTotalValue = (totalHolding * avgCost) + (tx.quantity_chi * tx.price_per_chi);
         const newTotalQty = totalHolding + tx.quantity_chi;
         avgCost = (newTotalQty > 0) ? (newTotalValue / newTotalQty) : 0;
         totalHolding = newTotalQty;
      } else if (tx.type === 'sell') {
         realizedPNL = (tx.price_per_chi - avgCost) * tx.quantity_chi;
         totalRealizedPNL += realizedPNL;
         totalHolding -= tx.quantity_chi;
      }

      enrichedTransactions.push({
         ...tx,
         avgCostAtTx: avgCost,
         realizedPNL_for_this_tx: realizedPNL
      });
   }

   // 3. PASS 2: Backward pass
   let currentBlockAvgCost = 0;
   if (enrichedTransactions.length > 0) {
      currentBlockAvgCost = enrichedTransactions[enrichedTransactions.length - 1].avgCostAtTx;
   }
   for (let i = enrichedTransactions.length - 1; i >= 0; i--) {
      const tx = enrichedTransactions[i];
      if (tx.type === 'sell') currentBlockAvgCost = tx.avgCostAtTx;
      tx.avgCostAtTx = currentBlockAvgCost;
   }

   // 4. TÍNH CHỈ SỐ TỔNG KẾT
   // a. Tổng vốn mua (Capital)
   const totalInvestedCapital = totalHolding * avgCost;

   // b. Lãi hiện tại (Unrealized PNL) - SỬA ĐỔI Ở ĐÂY
   let currentMarketBuyPrice = 0;
   if (currentMarketPrice_GoldData) {
      currentMarketBuyPrice = parseInt(currentMarketPrice_GoldData);
   }

   let unrealizedPNL = 0;
   if (totalHolding > 0 && currentMarketBuyPrice > 0) {
      // Công thức: (Giá trị thị trường hiện tại - Tổng vốn bỏ ra)
      unrealizedPNL = (currentMarketBuyPrice * 1000 * totalHolding) - totalInvestedCapital;
   }

   // 5. HIỂN THỊ DANH SÁCH (ĐÃ SỬA CSS TẠI ĐÂY)
   enrichedTransactions.reverse().forEach(tx => {
      const isBuy = tx.type === 'buy';
      const titleClass = isBuy ? 'text-success' : 'text-danger';
      const icon = isBuy ? 'bi-plus-circle' : 'bi-dash-circle';
      const titleText = isBuy ? 'MUA' : 'BÁN';
      const dateStr = new Date(tx.date).toLocaleDateString('vi-VN');

      let col4Html = '';
      if (!isBuy) {
         // [SỬA]: Bỏ fw-bold, thêm font-size: 0.8rem
         col4Html = `
      						<div class="text-center border-start">
      							<span class="text-muted" style="font-size: 0.65rem;">Lãi/Lỗ</span>
      							<p class="mb-0 ${tx.realizedPNL_for_this_tx >= 0 ? 'text-success' : 'text-danger'}" style="font-size: 0.8rem;">
      								${formatPNL(tx.realizedPNL_for_this_tx)}
      							</p>
      						</div>`;
      } else {
         col4Html = `<div class="text-center border-start"><span class="text-muted" style="font-size: 0.65rem;">-</span></div>`;
      }

      // [SỬA]: Bỏ fw-bold, thêm font-size: 0.8rem cho các cột giá trị
      listEl.innerHTML += `
      					<div class="card mb-2 shadow-sm border-0">
      						<div class="card-body p-2">
      							<div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
      								<div>
      									<span class="fw-bold ${titleClass}"><i class="bi ${icon} me-1"></i>${titleText}</span>
      									<span class="text-muted small ms-2">${dateStr}</span>
      								</div>
      								<div class="d-flex gap-3">
      									<button class="btn btn-sm text-warning p-0" onclick="openEditGoldTx('${tx.id}')"><i class="bi bi-pencil-square"></i></button>
      									<button class="btn btn-sm text-danger p-0" onclick="deleteGoldTx('${tx.id}')"><i class="bi bi-trash"></i></button>
      								</div>
      							</div>
      							<div class="row g-0">
      								<div class="col-3 text-center">
      									<span class="text-muted" style="font-size: 0.65rem;">Số lượng</span>
      									<p class="mb-0 text-dark" style="font-size: 0.8rem;">${tx.quantity_chi} chỉ</p>
      								</div>
      								<div class="col-3 text-center border-start">
      									<span class="text-muted" style="font-size: 0.65rem;">Giá GD</span>
      									<p class="mb-0 text-dark" style="font-size: 0.8rem;">${formatCurrency(tx.price_per_chi)}</p>
      								</div>
      								<div class="col-3 text-center border-start">
      									<span class="text-muted" style="font-size: 0.65rem;">Giá Vốn</span>
      									<p class="mb-0 text-dark" style="font-size: 0.8rem;">${formatCurrency(tx.avgCostAtTx)}</p>
      								</div>
      								<div class="col-3">${col4Html}</div>
      							</div>
      							${tx.note ? `<div class="mt-2 small text-muted fst-italic border-top pt-1">${tx.note}</div>` : ''}
      						</div>
      					</div>
      				`;
   });

   // 6. SUMMARY CARD
   const summaryHtml = `
      				<div class="card bg-light mb-3 border-primary shadow-sm">
      					<div class="card-body p-2">
      						<div class="row text-center mb-2">
      							<div class="col-6 border-end">
      								<small class="text-muted text-uppercase" style="font-size: 0.7rem;">Tổng số lượng</small>
      								<div class="fw-bold theme-text-primary fs-5">${totalHolding.toFixed(2)} chỉ</div>
      							</div>
      							<div class="col-6">
      								 <small class="text-muted text-uppercase" style="font-size: 0.7rem;">Tổng vốn mua</small>
      								 <div class="fw-bold text-dark fs-5">${formatCurrency(totalInvestedCapital)}</div>
      							</div>
      						</div>
      						<div class="row text-center border-top pt-2">
      							<div class="col-6 border-end">
      								<small class="text-muted text-uppercase" style="font-size: 0.7rem;">Lãi hiện tại</small>
      								<div class="fw-bold fs-6">${formatPNL(unrealizedPNL)}</div>
      							</div>
      							<div class="col-6">
      								<small class="text-muted text-uppercase" style="font-size: 0.7rem;">Lãi đã chốt</small>
      								<div class="fw-bold fs-6">${formatPNL(totalRealizedPNL)}</div>
      							</div>
      						</div>
      					</div>
      				</div>
      			`;
   listEl.insertAdjacentHTML('afterbegin', summaryHtml);
}

// Hàm xóa giao dịch
async function deleteGoldTx(id) {
   if (!confirm("Xóa giao dịch này?")) return;
   showLoading();
   try {
      await sendToServer({
         action: 'delete_gold_transaction',
         id: id
      });
      showToast('Đã xóa');
      showGoldStats(); // Reload lại
   } catch (e) {
      showToast('Lỗi xóa');
   }
   hideLoading();
}

// Bike stats
document.getElementById('stats-container').addEventListener('click', (e) => {
   const chartBtn = e.target.closest('.bike-chart-btn');
   if (chartBtn) {
      e.stopPropagation();
      showBikeStats();
   }

   const goldChartBtn = e.target.closest('.gold-chart-btn');
   if (goldChartBtn) {
      e.stopPropagation();
      showGoldStats();
   }
});

document.getElementById('add-bike-entry').addEventListener('click', () => {
   addBikeEntryModal.show();
});

document.getElementById('bike-history-list').addEventListener('click', async (e) => {
   const deleteBtn = e.target.closest('.delete-bike-entry');
   if (deleteBtn) {
      const entryId = deleteBtn.dataset.id;
      const entry = allData.find(d => d.__backendId === entryId);
      if (entry) {
         showLoading();
         await window.dataSdk.delete(entry);
         hideLoading();
         showToast('Đã xóa!');
         showBikeStats();
      }
   }
});

// Gold stats 
document.getElementById('add-gold-entry').addEventListener('click', () => {
   isEditingGold = false;
   currentEditGoldId = null;
   document.getElementById('gold-trans-qty').value = '';
   document.getElementById('gold-trans-price').value = '';
   document.getElementById('gold-trans-note').value = '';
   document.getElementById('gold-trans-date').valueAsDate = new Date();
   document.querySelector('#addGoldEntryModal .modal-title').innerHTML = '<i class="bi bi-plus-lg me-2"></i>Thêm Giao Dịch Mới';
   document.getElementById('save-gold-transaction').textContent = 'Lưu Giao Dịch';
   // 4. Mở Modal (Dùng biến toàn cục đã khai báo ở đầu script)
   if (addGoldEntryModal) {
      addGoldEntryModal.show();
   } else {
      const modal = new bootstrap.Modal(document.getElementById('addGoldEntryModal'));
      modal.show();
   }
});

// --- XỬ LÝ LƯU GIAO DỊCH VÀNG
document.getElementById('save-gold-transaction').addEventListener('click', async () => {
   // 1. Lấy dữ liệu
   const date = document.getElementById('gold-trans-date').value;
   const type = document.getElementById('gold-trans-type').value;
   const qty = parseFloat(document.getElementById('gold-trans-qty').value);
   const price = parseFloat(document.getElementById('gold-trans-price').value);
   const note = document.getElementById('gold-trans-note').value;

   if (!date || !qty || !price) {
      showToast('Vui lòng nhập đủ thông tin!');
      return;
   }
   // Đóng Modal
   const modalEl = document.getElementById('addGoldEntryModal');
   const modalInstance = bootstrap.Modal.getInstance(modalEl);
   if (modalInstance) modalInstance.hide();
   const isEdit = isEditingGold;
   const targetId = isEdit ? currentEditGoldId : ('temp_' + Date.now());
   const newTxData = {
      id: targetId,
      date: date,
      type: type,
      quantity_chi: qty,
      price_per_chi: price,
      note: note
   };

   if (isEdit) {
      // Sửa: Tìm và thay thế trong mảng
      const index = goldPortfolioData.findIndex(x => x.id === targetId);
      if (index !== -1) {
         goldPortfolioData[index] = {
            ...goldPortfolioData[index],
            ...newTxData
         };
      }
      showToast('Đã cập nhật (Đang đồng bộ...)');
   } else {
      // Thêm: Push vào mảng
      goldPortfolioData.push(newTxData);
      showToast('Đã thêm mới (Đang đồng bộ...)');
   }
   loadGoldPortfolio();

   // 3. GỬI SERVER (BACKGROUND SYNC)
   try {
      const actionName = isEdit ? 'update_gold_transaction' : 'log_gold_transaction';

      const res = await sendToServer({
         action: actionName,
         id: isEdit ? targetId : undefined, // Nếu sửa thì gửi ID
         date: date,
         type: type,
         quantity: qty,
         price: price,
         note: note
      });

      if (res.status === 'success') {
         console.log('Đồng bộ thành công');
         // Nếu là Thêm mới -> Cập nhật ID thật từ server trả về
         if (!isEdit && res.id) {
            const tempItem = goldPortfolioData.find(x => x.id === targetId);
            if (tempItem) tempItem.id = res.id;
         }
      } else {
         throw new Error(res.message);
      }
   } catch (e) {
      console.error(e);
      showToast('Lỗi đồng bộ! Đang hoàn tác...');

      // 4. HOÀN TÁC NẾU LỖI (ROLLBACK)
      if (isEdit) {
         showGoldStats();
      } else {
         // Thêm lỗi thì xóa dòng tạm đi
         const idx = goldPortfolioData.findIndex(x => x.id === targetId);
         if (idx > -1) {
            goldPortfolioData.splice(idx, 1);
            loadGoldPortfolio();
         }
      }
   }
});

// Set ngày mặc định khi mở modal
document.getElementById('addGoldEntryModal').addEventListener('show.bs.modal', function () {
   if (!document.getElementById('gold-trans-date').value) {
      document.getElementById('gold-trans-date').valueAsDate = new Date();
   }
});

document.getElementById('gold-history-list').addEventListener('click', async (e) => {
   const deleteBtn = e.target.closest('.delete-gold-entry');
   if (deleteBtn) {
      const entryId = deleteBtn.dataset.id;
      const entry = allData.find(d => d.__backendId === entryId);
      if (entry) {
         showLoading();
         await window.dataSdk.delete(entry);
         hideLoading();
         showToast('Đã xóa!');
         showGoldStats();
      }
   }
});


// --- XỬ LÝ CLICK BABY RUN
document.getElementById('stats-container').addEventListener('click', async (e) => {
   const btn = e.target.closest('.baby-run-btn');
   if (btn) {
      lastUserActionTime = Date.now();
      // 1. Hiệu ứng click (Thu nhỏ nhẹ tạo cảm giác bấm thật)
      btn.style.transition = "transform 0.1s";
      btn.style.transform = "scale(0.85)";
      setTimeout(() => btn.style.transform = "scale(1)", 150);

      // 2. Cập nhật UI ngay lập tức
      const countEl = document.getElementById('bike-count');
      const currentVal = parseInt(countEl.textContent) || 0;
      countEl.textContent = currentVal + 1;
	  localStorage.setItem('cached_babyrun_count', currentVal + 1);
      // Rung nhẹ số đếm
      countEl.style.transition = "color 0.2s";
      countEl.style.color = "var(--secondary-color)";
      setTimeout(() => countEl.style.color = "", 300);
      // 3. Gửi Server (Background)
      const username = currentProfile ? currentProfile.username : 'anonymous';
      // Không dùng await để không chặn luồng
      sendToServer({
         action: 'log_babyrun',
         username: username,
         fingerprint: userFingerprint
      }).then(res => {
         if (res.status !== 'success' && res.result !== 'success') {
            throw new Error('Lỗi server');
         }
      }).catch(err => {
         console.error('Lỗi babyrun:', err);
         // Hoàn tác nếu lỗi
         countEl.textContent = currentVal;
		 localStorage.setItem('cached_babyrun_count', currentVal);
         showToast('Lỗi mạng! Không lưu được.');
      });

      return;
   }
});

// --- HÀM LƯU LƯỢT ĐẠP THỦ CÔNG --- 
async function saveManualBikeEntry() {
   lastUserActionTime = Date.now(); // [MỚI]
   // 1. Lấy dữ liệu Input
   const dateInput = document.getElementById('manual-bike-date');
   const timeInput = document.getElementById('manual-bike-time');

   if (!dateInput || !timeInput || !dateInput.value || !timeInput.value) {
      showToast('Vui lòng chọn đầy đủ Ngày và Giờ');
      return;
   }
   // 2. Chuẩn bị dữ liệu
   const [year, month, day] = dateInput.value.split('-');
   const formattedDate = `${day}/${month}/${year}`; // dd/MM/yyyy
   const formattedTime = timeInput.value + ':00'; // HH:mm:ss
   const modalEl = document.getElementById('addBikeEntryModal');
   const modalInstance = bootstrap.Modal.getInstance(modalEl);
   if (modalInstance) modalInstance.hide();

   // B. Hiển thị thông báo thành công ngay ("Giả vờ" là đã xong)
   showToast('Đã ghi nhận lượt đạp!');

   // C. Cập nhật số liệu trên giao diện NGAY (Nếu ngày chọn là "Hôm nay")
   const today = new Date();
   const isToday = (parseInt(day) === today.getDate() &&
      parseInt(month) === (today.getMonth() + 1) &&
      parseInt(year) === today.getFullYear());

   let oldTodayCount = 0; // Lưu lại để rollback nếu lỗi
   const countEl = document.getElementById('bike-count'); // Số ở màn hình chính
   const statsTodayEl = document.getElementById('stats-today'); // Số ở trong Modal thống kê

   if (isToday) {
      // Cập nhật màn hình chính
      if (countEl) {
         oldTodayCount = parseInt(countEl.textContent) || 0;
         countEl.textContent = oldTodayCount + 1;

         // Hiệu ứng nhún nhảy cho số
         countEl.style.transition = "transform 0.2s";
         countEl.style.transform = "scale(1.3)";
         setTimeout(() => countEl.style.transform = "scale(1)", 200);
      }
      // Cập nhật modal thống kê (nếu đang mở)
      if (statsTodayEl) {
         const val = parseInt(statsTodayEl.textContent) || 0;
         statsTodayEl.textContent = val + 1;
      }
   }
   try {
      const res = await sendToServer({
         action: 'log_babyrun',
         username: currentProfile ? currentProfile.username : 'anonymous',
         customDate: formattedDate,
         customTime: formattedTime
      });

      if (res.status !== 'success' && res.result !== 'success') {
         throw new Error(res.message || 'Lỗi server');
      }

   } catch (e) {
      console.error("Lỗi lưu server:", e);
      if (isToday && countEl) countEl.textContent = oldTodayCount;
      if (isToday && statsTodayEl) statsTodayEl.textContent = parseInt(statsTodayEl.textContent) - 1;

      showToast('Lỗi kết nối! Đã hoàn tác dữ liệu.');
   }
}
const addBikeModalEl = document.getElementById('addBikeEntryModal');
if (addBikeModalEl) {
   addBikeModalEl.addEventListener('show.bs.modal', function () {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');

      const dateInput = document.getElementById('manual-bike-date');
      if (dateInput) dateInput.value = `${yyyy}-${mm}-${dd}`;
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');

      const timeInput = document.getElementById('manual-bike-time');
      if (timeInput) timeInput.value = `${hh}:${min}`;
   });
}

// Hàm mở form sửa giao dịch
function openEditGoldTx(id) {
   const tx = goldPortfolioData.find(t => t.id === id);
   if (!tx) {
      showToast("Không tìm thấy dữ liệu!");
      return;
   }

   // 1. Set trạng thái sang Sửa
   isEditingGold = true;
   currentEditGoldId = id;

   // 2. Điền dữ liệu cũ vào Form
   document.getElementById('gold-trans-date').value = tx.date; // yyyy-MM-dd
   document.getElementById('gold-trans-type').value = tx.type;
   document.getElementById('gold-trans-qty').value = tx.quantity_chi;
   document.getElementById('gold-trans-price').value = tx.price_per_chi;
   document.getElementById('gold-trans-note').value = tx.note || '';

   // 3. Đổi tiêu đề Modal và Nút bấm cho dễ hiểu
   document.querySelector('#addGoldEntryModal .modal-title').innerHTML = '<i class="bi bi-pencil-square me-2"></i>Sửa Giao Dịch';
   document.getElementById('save-gold-transaction').textContent = 'Cập nhật';

   // 4. Mở Modal
   const modal = new bootstrap.Modal(document.getElementById('addGoldEntryModal'));
   modal.show();
}
 
function calculateBikeStats() {
   const bikeEntries = allData.filter(d => d.type === 'bike_entry');
   const today = new Date();
   const todayStr = today.toISOString().split('T')[0];

   const todayCount = bikeEntries.filter(e => e.date === todayStr).reduce((sum, e) => sum + (e.count || 0), 0);

   const weekStart = new Date(today);
   weekStart.setDate(today.getDate() - today.getDay());
   weekStart.setHours(0, 0, 0, 0);
   const weekCount = bikeEntries.filter(e => {
      const entryDate = new Date(e.date);
      return entryDate >= weekStart;
   }).reduce((sum, e) => sum + (e.count || 0), 0);

   const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
   const monthCount = bikeEntries.filter(e => {
      const entryDate = new Date(e.date);
      return entryDate >= monthStart;
   }).reduce((sum, e) => sum + (e.count || 0), 0);

   return {
      todayCount,
      weekCount,
      monthCount
   };
}

function renderBikeChart() {
   const bikeEntries = allData.filter(d => d.type === 'bike_entry');
   const chartContainer = document.getElementById('bike-chart');

   const days = [];
   for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split('T')[0]);
   }

   const counts = days.map(day => {
      return bikeEntries.filter(e => e.date === day).reduce((sum, e) => sum + (e.count || 0), 0);
   });

   const maxCount = Math.max(...counts, 1);

   chartContainer.innerHTML = `
      			<div class="d-flex align-items-end justify-content-between" style="height: 100%;">
      	 ${days.map((day, i) => {
      const height = (counts[i] / maxCount) * 100;
      const date = new Date(day);
      const dayName = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][date.getDay()];
      return `
      				  <div class="d-flex flex-column align-items-center" style="flex: 1;">
      					<div class="mb-2 small fw-bold theme-text-primary">${counts[i]}</div>
      					<div class="w-100 theme-bg-primary rounded-top" style="height: ${height}%; min-height: 5px; max-width: 40px; margin: 0 auto;"></div>
      					<div class="mt-2 small text-muted">${dayName}</div>
      				  </div>
      				`;
   }).join('')}
      			</div>
      		  `;
}

function renderBikeHistory() {
   const bikeEntries = allData.filter(d => d.type === 'bike_entry').sort((a, b) => new Date(b.date) - new Date(a.date));
   const container = document.getElementById('bike-history-list');

   if (bikeEntries.length === 0) {
      container.innerHTML = '<p class="text-center text-muted py-3">Chưa có dữ liệu</p>';
      return;
   }

   container.innerHTML = bikeEntries.map(entry => {
      const date = new Date(entry.date);
      const dateStr = date.toLocaleDateString('vi-VN', {
         day: '2-digit',
         month: '2-digit',
         year: 'numeric'
      });
      return `
      			  <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      				<div>
      				  <p class="mb-0 fw-semibold">${entry.count} lượt</p>
      				  <small class="text-muted">${dateStr}</small>
      				  ${entry.note ? `<p class="small text-muted mb-0 mt-1">${entry.note}</p>` : ''}
      				</div>
      				<button class="btn btn-sm btn-outline-danger delete-bike-entry" data-id="${entry.__backendId}">
      				  <i class="bi bi-trash"></i>
      				</button>
      			  </div>
      			`;
   }).join('');
}

async function showBikeStats() {
   bikeStatsModal.show();

   // Reset trạng thái phân trang
   bikeHistoryPage = 1;
   bikeHistoryHasMore = true;
   bikeHistoryLoading = false;

   // Reset UI Loading
   document.getElementById('stats-today').textContent = '...';
   document.getElementById('stats-week').textContent = '...';
   document.getElementById('stats-month').textContent = '...';

   const historyContainer = document.getElementById('bike-history-list');
   if (historyContainer) {
      // Sử dụng hàm chung
      historyContainer.innerHTML = createLoaderHtml('bike-history-loader', 'Đang tải lịch sử...', 'py-3');
   }
   loadBikeHistoryData(1);
}

async function loadBikeHistoryData(page) {
   if (bikeHistoryLoading) return;
   bikeHistoryLoading = true;

   try {
      const res = await sendToServer({
         action: 'get_bike_stats',
         page: page,
         limit: 15
      });

      if (res.status === 'success') {
         if (page === 1) {
            if (res.stats) {
               document.getElementById('stats-today').textContent = res.stats.today;
               document.getElementById('stats-week').textContent = res.stats.week;
               document.getElementById('stats-month').textContent = res.stats.month;
            }
            if (res.history) renderBikeChartFromServer(res.history);
         }
         bikeHistoryHasMore = res.hasMore;
         renderBikeHistoryPaged(res.logs, page);
      }
   } catch (e) {
      console.error("Lỗi tải lịch sử:", e);
   } finally {
      bikeHistoryLoading = false;
   }
}


// --- HÀM PHỤ TRỢ:
function createLogItemHtml(log) {
   // Sử dụng hàm chung, ép kiểu size nhỏ
   const avatarHtml = createAvatarHtml(log, 'avatar-circle-sm');

   return `
				<div class="list-group-item border-0 p-2 d-flex justify-content-between align-items-center mb-1 rounded hover-bg-light">
					<div class="d-flex align-items-center">
						 <div class="me-2" style="width: 32px; height: 32px;">
							${avatarHtml}
						 </div>
						 <div class="d-flex flex-column">
							 <span class="small fw-bold text-dark">${log.username || 'Ẩn danh'}</span>
						 </div>
					</div>
					<div class="text-end">
						<span class="badge bg-light text-secondary border fw-normal font-monospace">${log.time || '--:--'}</span>
					</div>
				</div>
			`;
}

// --- HÀM RENDER CHÍNH
function renderBikeHistoryPaged(logsData, page) {
   const container = document.getElementById('bike-history-list');
   if (!container) return;

   const oldTrigger = document.getElementById('load-more-trigger');
   if (oldTrigger) oldTrigger.remove();

   // 2. Nếu là trang 1 thì reset toàn bộ
   if (page === 1) {
      container.innerHTML = '';
      if (!logsData || logsData.length === 0) {
         container.innerHTML = '<p class="text-center text-muted py-3 small">Chưa có dữ liệu chi tiết</p>';
         return;
      }
   }

   // 3. Gom nhóm dữ liệu mới theo ngày
   const groups = {};
   logsData.forEach(item => {
      if (!item.date) return;
      if (!groups[item.date]) groups[item.date] = [];
      groups[item.date].push(item);
   });

   // Lấy danh sách các ngày trong lô dữ liệu mới (Thứ tự: Mới -> Cũ)
   const dates = Object.keys(groups);

   // 4. XỬ LÝ GỘP (MERGE) NẾU TRÙNG NGÀY
   if (page > 1 && dates.length > 0) {
      // Lấy ngày đầu tiên của lô mới
      const firstDateOfNewBatch = dates[0];

      // Tìm nhóm ngày cuối cùng đang hiển thị trên màn hình
      const lastRenderedGroup = container.querySelector('.history-group:last-child');

      if (lastRenderedGroup) {
         const lastRenderedDate = lastRenderedGroup.getAttribute('data-date');

         // Nếu ngày cuối cùng của lô cũ TRÙNG với ngày đầu tiên của lô mới
         if (lastRenderedDate === firstDateOfNewBatch) {
            // -> GỘP VÀO
            const itemsToAppend = groups[firstDateOfNewBatch];
            const listGroup = lastRenderedGroup.querySelector('.list-group');
            const badge = lastRenderedGroup.querySelector('.badge');

            // a. Thêm các dòng log mới vào nhóm cũ
            let itemsHtml = '';
            itemsToAppend.forEach(log => {
               itemsHtml += createLogItemHtml(log);
            });
            listGroup.insertAdjacentHTML('beforeend', itemsHtml);

            // b. Cập nhật số lượng trên Badge (Số cũ + Số mới thêm)
            if (badge) {
               // Lấy số từ text "15 lượt" -> 15
               const currentCount = parseInt(badge.textContent) || 0;
               badge.textContent = `${currentCount + itemsToAppend.length} lượt`;
            }

            // c. Xóa ngày này khỏi danh sách cần render mới (để không bị lặp lại header)
            delete groups[firstDateOfNewBatch];
            const idx = dates.indexOf(firstDateOfNewBatch);
            if (idx > -1) dates.splice(idx, 1);
         }
      }
   }

   // 5. RENDER CÁC NHÓM CÒN LẠI (BÌNH THƯỜNG)
   let htmlContent = '';
   dates.forEach(date => {
      const items = groups[date];
      // Thêm class 'history-group' và thuộc tính 'data-date' để hỗ trợ việc tìm kiếm sau này
      htmlContent += `
      					<div class="mb-3 history-group fade-in" data-date="${date}">
      						<div class="d-flex align-items-center justify-content-between bg-light px-3 py-2 rounded mb-2 shadow-sm sticky-top" style="top: -1px; z-index: 5;">
      							<span class="fw-bold text-dark small"><i class="bi bi-calendar-check me-1"></i> ${date}</span>
      							<span class="badge theme-bg-primary rounded-pill" style="font-weight: normal;">${items.length} lượt</span>
      						</div>
      						<div class="list-group list-group-flush px-2">
      							${items.map(log => createLogItemHtml(log)).join('')}
      						</div>
      					</div>
      				`;
   });

   // Chèn HTML mới vào cuối container
   container.insertAdjacentHTML('beforeend', htmlContent);

   // 6. TẠO LẠI NÚT LOAD MORE (NẾU CÒN DỮ LIỆU)
   if (bikeHistoryHasMore) {
      const trigger = document.createElement('div');
      trigger.id = 'load-more-trigger';
      trigger.className = 'py-3 text-center text-muted small cursor-pointer';
      trigger.innerHTML = `<span class="spinner-border spinner-border-sm me-1 d-none" id="load-spinner"></span> <span id="load-text">Vuốt lên hoặc nhấn để xem thêm cũ hơn</span>`;

      trigger.addEventListener('click', () => triggerLoadMore());
      container.appendChild(trigger);

      // Auto Scroll
      setupInfiniteScroll(trigger);
   } else {
      const endMsg = document.createElement('div');
      endMsg.className = 'text-center py-3 text-muted small';
      endMsg.innerHTML = '--- Hết lịch sử ---';
      container.appendChild(endMsg);
   }
}

function triggerLoadMore() {
   if (bikeHistoryLoading || !bikeHistoryHasMore) return;

   // Hiệu ứng loading
   const spinner = document.getElementById('load-spinner');
   if (spinner) spinner.classList.remove('d-none');

   bikeHistoryPage++;
   loadBikeHistoryData(bikeHistoryPage);
}

function setupInfiniteScroll(target) {
   const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
         triggerLoadMore();
      }
   }, {
      threshold: 0.1
   });
   observer.observe(target);
}

// --- HÀM VẼ BIỂU ĐỒ (Đã sửa sắp xếp Tăng dần chuẩn xác) ---
function renderBikeChartFromServer(historyData) {
   const chartContainer = document.getElementById('bike-chart');
   if (!chartContainer) return;

   if (!historyData || historyData.length === 0) {
      chartContainer.innerHTML = '<div class="text-center py-5 text-muted small">Chưa có dữ liệu biểu đồ</div>';
      return;
   }

   // 1. Sắp xếp dữ liệu TĂNG DẦN (Cũ -> Mới)
   // Sử dụng hàm helper để parse ngày an toàn
   const parseDateVal = (dateStr) => {
      if (!dateStr) return 0;
      try {
         // dateStr dạng "15/01/2026"
         const parts = dateStr.trim().split('/');
         if (parts.length < 3) return 0;
         // Trả về Timestamp: Năm, Tháng (0-11), Ngày
         return new Date(parts[2], parseInt(parts[1]) - 1, parts[0]).getTime();
      } catch (e) {
         return 0;
      }
   };

   const sortedData = [...historyData].sort((a, b) => {
      return parseDateVal(a.date) - parseDateVal(b.date);
   });

   // 2. Cấu hình kích thước
   const itemWidth = 60;
   const chartHeight = 160;
   // Độ rộng tổng = số lượng cột * 60px (hoặc tối thiểu bằng chiều rộng màn hình)
   const totalWidth = Math.max(chartContainer.parentElement.offsetWidth, sortedData.length * itemWidth);

   const counts = sortedData.map(d => parseInt(d.count) || 0);
   // Tính giá trị lớn nhất để chia tỉ lệ chiều cao (thêm 20% đệm cho đẹp)
   const maxVal = Math.max(...counts, 5) * 1.2;

   // 3. Tính tọa độ X, Y cho từng điểm
   const points = sortedData.map((d, i) => {
      const x = (i * itemWidth) + (itemWidth / 2);
      const count = parseInt(d.count) || 0;
      const y = chartHeight - ((count / maxVal) * chartHeight);
      return {
         x,
         y,
         count,
         date: d.date
      };
   });

   // 4. Tạo đường cong mềm mại (Bezier Curve)
   const getControlPoint = (current, previous, next, reverse) => {
      const p = previous || current;
      const n = next || current;
      const smoothing = 0.2;
      const oX = n.x - p.x;
      const oY = n.y - p.y;
      const length = Math.sqrt(Math.pow(oX, 2) + Math.pow(oY, 2)) * smoothing;
      const angle = Math.atan2(oY, oX) + (reverse ? Math.PI : 0);
      return {
         x: current.x + Math.cos(angle) * length,
         y: current.y + Math.sin(angle) * length
      };
   };

   let pathD = `M ${points[0].x} ${points[0].y}`;
   for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2];
      const cp1 = getControlPoint(p1, p0, p2, false);
      const cp2 = getControlPoint(p2, p1, p3, true);
      pathD += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
   }

   // Tạo vùng màu bên dưới đường biểu đồ
   const areaPathD = `${pathD} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`;

   const strokeColor = 'var(--primary-color)';
   const circleColor = 'var(--surface-color, #fff)';

   // 5. Render SVG
   chartContainer.innerHTML = `
      				<svg width="${totalWidth}" height="200" xmlns="http://www.w3.org/2000/svg">
      					<defs>
      						<linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
      							<stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.4"/>
      							<stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"/>
      						</linearGradient>
      						<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      							<feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="${strokeColor}" flood-opacity="0.3"/>
      						</filter>
      					</defs>
      
      					<line x1="0" y1="${chartHeight}" x2="${totalWidth}" y2="${chartHeight}" stroke="#eee" stroke-width="1" />
      					<line x1="0" y1="${chartHeight / 2}" x2="${totalWidth}" y2="${chartHeight / 2}" stroke="#eee" stroke-width="1" stroke-dasharray="4" />
      
      					<path d="${areaPathD}" fill="url(#chartGradient)" stroke="none" style="transition: fill 0.3s;" />
      
      					<path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#shadow)" style="transition: stroke 0.3s;" />
      
      					${points.map((p, i) => `
      						<g class="chart-point">
      							${(p.count > 0) ?
         `<text x="${p.x}" y="${p.y - 12}" fill="${strokeColor}" font-size="11" text-anchor="middle" font-weight="bold">${p.count}</text>`
         : ''
      }
      							<circle cx="${p.x}" cy="${p.y}" r="5" fill="${strokeColor}" stroke="${circleColor}" stroke-width="2" />
      							<text x="${p.x}" y="${chartHeight + 25}" fill="#999" font-size="10" text-anchor="middle">${p.date.substring(0, 5)}</text>
      						</g>
      					`).join('')}
      				</svg>
      			`;

   // 6. Tự động cuộn sang phải (Right) để xem ngày mới nhất
   setTimeout(() => {
      const wrapper = chartContainer.parentElement; // div cha có overflow-x: auto
      if (wrapper) {
         wrapper.scrollLeft = wrapper.scrollWidth; // Cuộn hết cỡ sang phải
      }
   }, 100);
}

// --- HÀM RENDER LỊCH SỬ
function renderBikeHistoryFromServer(logsData) {
   const container = document.getElementById('bike-history-list');
   if (!container) return;

   if (!logsData || logsData.length === 0) {
      container.innerHTML = '<p class="text-center text-muted py-3 small">Chưa có dữ liệu chi tiết gần đây</p>';
      return;
   }

   // 1. Nhóm dữ liệu theo ngày
   const groups = {};
   logsData.forEach(item => {
      if (!item.date) return;
      if (!groups[item.date]) groups[item.date] = [];
      groups[item.date].push(item);
   });

   // 2. Tạo HTML
   let htmlContent = '';
   const dates = Object.keys(groups); // Danh sách các ngày

   // Lưu ý: logsData từ server thường đã được sort mới nhất -> cũ nhất
   // nên keys(groups) cũng sẽ theo thứ tự đó.

   dates.forEach(date => {
      const items = groups[date];

      // Header Ngày
      htmlContent += `
      					<div class="mb-3">
      						<div class="d-flex align-items-center justify-content-between bg-light px-3 py-2 rounded mb-2 shadow-sm sticky-top" style="top: 0px; z-index: 5;">
      							<span class="fw-bold text-dark small"><i class="bi bi-calendar-check me-1"></i> ${date}</span>
      							<span class="badge theme-bg-primary rounded-pill" style="font-weight: normal;">${items.length} lượt</span>
      						</div>
      						<div class="list-group list-group-flush px-2">
      				`;

      // Items trong ngày
      items.forEach(log => {
         // Lấy chữ cái đầu của tên để làm Avatar
         const firstLetter = log.username ? log.username.charAt(0).toUpperCase() : '?';

         htmlContent += `
      						<div class="list-group-item border-0 p-2 d-flex justify-content-between align-items-center mb-1 rounded hover-bg-light">
      							<div class="d-flex align-items-center">
      								 <div class="rounded-circle theme-bg-primary d-flex align-items-center justify-content-center text-white me-2 shadow-sm" style="width: 32px; height: 32px; font-size: 12px; font-weight: bold;">
      									${firstLetter}
      								 </div>
      								 <div class="d-flex flex-column">
      									 <span class="small fw-bold text-dark">${log.username || 'Ẩn danh'}</span>
      								 </div>
      							</div>
      							<div class="text-end">
      								<span class="badge bg-light text-secondary border fw-normal font-monospace">${log.time || '--:--'}</span>
      							</div>
      						</div>
      					`;
      });

      htmlContent += `
      						</div>
      					</div>
      				`;
   });

   container.innerHTML = htmlContent;
}

function renderStats() {
   const container = document.getElementById('stats-container');
   const leftColumn = statsLayout.filter(s => s.column === 0);
   const rightColumn = statsLayout.filter(s => s.column === 1);
   const hasRightColumn = rightColumn.length > 0;

   if (hasRightColumn) container.classList.add('two-columns');
   else container.classList.remove('two-columns');

   const renderCard = (stat) => {
      const sizeClass = `size-${stat.size}`;
 
      if (stat.id === 'bike') {
         const dueDate = new Date('2026-04-26');
         const today = new Date();

         // Reset giờ về 0h để tính ngày cho chuẩn
         dueDate.setHours(0, 0, 0, 0);
         today.setHours(0, 0, 0, 0);

         // Tính ngày bắt đầu thai kỳ (Dự sinh - 280 ngày)
         const startDate = new Date(dueDate);
         startDate.setDate(dueDate.getDate() - 280);

         // Tính số ngày đã qua
         const diffTime = today - startDate;
         const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

         // Đổi ra tuần và ngày lẻ
         const weeks = Math.floor(diffDays / 7);
         const days = diffDays % 7;

         const babyAgeText = `Em bé ${weeks} tuần ${days} ngày`;
		 const staleClass = babyAgeText ? 'data-stale' : '';
		
         // ----------------------------------------

         return `
      				<div class="stat-card p-3 ${sizeClass}" data-stat-id="bike" draggable="${isEditMode}">
      				  <div class="drag-handle"><i class="bi bi-arrows-move"></i></div>
      				  <div class="size-toggle"><i class="bi bi-arrows-fullscreen"></i></div>
      				  <button class="btn btn-link p-0 position-absolute top-0 end-0 m-2 text-muted bike-chart-btn" style="z-index: 5;">
      					<i class="bi bi-bar-chart-fill fs-5"></i>
      				  </button>
      				  <div class="text-center">
      					<div class="icon-box theme-bg-primary text-white mx-auto mb-2 baby-run-btn" style="cursor: pointer; transition: transform 0.1s;">
      					  <span style="font-size: 32px; filter: brightness(0) invert(1);">👣</span>
      					</div>
      					
      					<p class="text-muted small mb-1 fw-bold theme-text-primary">${babyAgeText}</p>
      					
      					<p id="bike-count" class="fs-2 fw-bold theme-text-primary mb-0 ${staleClass}">0</p>
      				  </div>
      				</div>
      			  `;
      } else if (stat.id === 'gold') {
		  
		const cachedBuy = localStorage.getItem('cached_gold_buy'); 
		const cachedSell = localStorage.getItem('cached_gold_sell');
 
		const displayBuy = cachedBuy ? Number(cachedBuy).toLocaleString('vi-VN') : '-';
		const displaySell = cachedSell ? Number(cachedSell).toLocaleString('vi-VN') : '-';
		const staleClass = cachedBuy ? 'data-stale' : '';

         return `
				<div class="stat-card p-3 ${sizeClass}" data-stat-id="gold" draggable="${isEditMode}">
      				  <div class="drag-handle"><i class="bi bi-arrows-move"></i></div>
      				  <div class="size-toggle"><i class="bi bi-arrows-fullscreen"></i></div>
      				  <button class="btn btn-link p-0 position-absolute top-0 end-0 m-2 text-muted gold-chart-btn" style="z-index: 5;">
      					<i class="bi bi-bar-chart-fill fs-5"></i>
      				  </button>
      				  <div class="d-flex align-items-center mb-2">
      					<div class="icon-box text-white me-3" style="background: #f59e0b;">
      					  <i class="bi bi-coin fs-4"></i>
      					</div>
      					<div>
      					  <p class="text-muted small mb-1">Giá vàng</p>
      					</div>
      				  </div>
      				  <div class="row g-2 ms-5 ps-2">
      					<div class="col-6">
      					  <small class="text-muted">Giá mua</small>
						   <p id="gold-buy" class="fs-5 fw-bold text-success mb-0 ${staleClass}">
							   ${displayBuy}
						   </p>
						</div>
						<div class="col-6">
						   <small class="text-muted">Giá bán</small>
						   <p id="gold-sell" class="fs-5 fw-bold text-danger mb-0 ${staleClass}">
							   ${displaySell}
						   </p>
						</div>
					 </div>
				  </div>
			   </div>
      			  `;
      }
      return '';
   };

   if (hasRightColumn) {
      container.innerHTML = leftColumn.map(renderCard).join('') + rightColumn.map(renderCard).join('');
   } else {
      container.innerHTML = leftColumn.map(renderCard).join('');
   }

   if (isEditMode) {
      container.classList.add('layout-edit-mode');
      setupDragAndDrop();
   } else {
      container.classList.remove('layout-edit-mode');
   }
}
