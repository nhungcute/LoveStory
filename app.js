// ==========================================
// CÔNG CỤ GỠ LỖI (VCONSOLE) - Có lưu trạng thái
// ==========================================
let myVConsole = null;
const VCONSOLE_STORAGE_KEY = 'vconsole_enabled';

function toggleVConsole(isEnable) {
   if (isEnable) {
      if (!myVConsole && window.VConsole) {
         myVConsole = new window.VConsole();
      }
   } else {
      if (myVConsole) {
         myVConsole.destroy();
         myVConsole = null;
      }
   }
   // Lưu trạng thái vào localStorage
   localStorage.setItem(VCONSOLE_STORAGE_KEY, isEnable ? '1' : '0');
}

// Lắng nghe thao tác gạt công tắc (Phản hồi tức thì)
const vconsoleToggle = document.getElementById('vconsole-toggle');
if (vconsoleToggle) {
   vconsoleToggle.addEventListener('change', (e) => {
      toggleVConsole(e.target.checked);
   });
}

// Tự động khôi phục trạng thái từ localStorage khi tải trang
window.addEventListener('load', () => {
   if (localStorage.getItem(VCONSOLE_STORAGE_KEY) === '1') {
      toggleVConsole(true);
      const btn = document.getElementById('vconsole-toggle');
      if (btn) btn.checked = true;
   }
});


function saveLocalData(data) {
   try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
   } catch (e) {
      if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
         console.warn("Bộ nhớ đầy, đang dọn dẹp để lưu dữ liệu mới...");

         localStorage.removeItem('cached_feed_data');
         localStorage.removeItem('cached_notifications');

         try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
         } catch (err) {
            console.error("Vẫn không đủ bộ nhớ sau khi dọn dẹp:", err);
         }
      }
   }
}

function getLocalData() {
   const data = localStorage.getItem(STORAGE_KEY);
   return data ? JSON.parse(data) : null;
}

// 1. Tạo Fingerprint (Định danh thiết bị)
async function getBrowserFingerprint() {
   try {
      const str = navigator.userAgent + navigator.language + screen.width + 'x' + screen.height;

      // KIỂM TRA: Nếu Safari chặn crypto.subtle (do HTTP), dùng cách tạo ID dự phòng
      if (!window.crypto || !window.crypto.subtle) {
         console.warn("Safari/HTTP chặn crypto.subtle, đang dùng định danh dự phòng...");
         // Tạo chuỗi base64 ngẫu nhiên từ thông tin thiết bị thay thế cho crypto
         return btoa(unescape(encodeURIComponent(str))).substring(0, 32);
      }

      const msgBuffer = new TextEncoder().encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

   } catch (e) {
      console.error("Lỗi tạo Fingerprint:", e);
      // Trả về ID ngẫu nhiên nếu tất cả đều thất bại, giúp app không bị sập
      return "fallback_id_" + Math.random().toString(36).substring(2, 15);
   }
}

// 4. Hàm sinh tên ngẫu nhiên
function generateIdentity() {
   const animal = randomAnimals[Math.floor(Math.random() * randomAnimals.length)];
   const color = randomColors[Math.floor(Math.random() * randomColors.length)];
   const fullname = `${animal} ${color}`;
   // Tạo username không dấu: Gấu Đỏ -> gaudo123
   const username = fullname.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s/g, '').toLowerCase() + Math.floor(Math.random() * 999);
   return {
      fullname,
      username
   };
}

const globalScrollObserver = new IntersectionObserver((entries) => {
   entries.forEach(entry => {
      if (entry.isIntersecting) {
         // Lấy hàm callback từ thuộc tính của phần tử
         const callback = entry.target._onIntersect;
         if (typeof callback === 'function') {
            callback();
         }
      }
   });
}, { threshold: 0.1 });

window.addEventListener('beforeunload', (e) => {
   if (pendingTasksCount > 0) {
      e.preventDefault();
      e.returnValue = 'Dữ liệu đang được gửi lên máy chủ. Bạn có chắc muốn rời đi?';
      return 'Dữ liệu đang được gửi lên máy chủ. Bạn có chắc muốn rời đi?';
   }
});

function applyTheme(themeName) {
   const theme = themes[themeName];
   if (!theme) return;

   document.documentElement.style.setProperty('--primary-color', theme.primary);
   document.documentElement.style.setProperty('--secondary-color', theme.secondary);
   document.documentElement.style.setProperty('--text-color', theme.text);
   document.documentElement.style.setProperty('--bg-color', theme.bg);
   document.documentElement.style.setProperty('--surface-color', theme.surface);

   document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('selected'));
   const selected = document.querySelector(`[data-theme="${themeName}"]`);
   if (selected) selected.classList.add('selected');

   currentTheme = themeName;
}

if (window.elementSdk) {
   window.elementSdk.init({
      defaultConfig,
      onConfigChange: async (config) => {
         document.getElementById('welcome-message').textContent = config.welcome_message || defaultConfig.welcome_message;
      },
      mapToCapabilities: () => ({
         recolorables: [],
         borderables: [],
         fontEditable: undefined,
         fontSizeable: undefined
      }),
      mapToEditPanelValues: (config) => new Map([
         ['app_title', config.app_title || defaultConfig.app_title],
         ['welcome_message', config.welcome_message || defaultConfig.welcome_message]
      ])
   });
}

function manageCacheSize() {
   let total = 0;
   for (let x in localStorage) {
      if (localStorage.hasOwnProperty(x)) {
         total += ((localStorage[x].length * 2) / 1024 / 1024);
      }
   }
   console.log(`Dung lượng LocalStorage đang dùng: ${total.toFixed(2)} MB`);
   // Nếu dùng quá 4.5MB (gần mức giới hạn 5MB), 
   if (total > 4.5) {
      console.warn("Bộ nhớ gần đầy, đang dọn dẹp...");
      localStorage.removeItem('cached_feed_data');
      localStorage.removeItem('cached_notifications');
   }
}

function openAvatarImage(event, imgUrl) {
   // Ngăn chặn sự kiện click lan truyền lên thẻ cha (tránh mở post)
   if (event) {
      event.stopPropagation();
   }

   if (!imgUrl || imgUrl.trim() === '') return;

   // Tìm thẻ modal Image Viewer và hiển thị avatar
   const modalEl = document.getElementById('imageViewerModal');
   if (!modalEl) return;

   const container = document.getElementById('carousel-items-container');
   if (container) {
      container.innerHTML = `
         <div class="carousel-item active">
            <div class="zoom-container d-flex align-items-center justify-content-center h-100" style="overflow: auto;">
               <img src="${imgUrl}" class="d-block w-100" style="object-fit: contain; max-height: 100vh; cursor: default;">
            </div>
         </div>
      `;
   }

   const docTotal = document.getElementById('viewer-total-count');
   const docCurrent = document.getElementById('viewer-current-index');
   if (docTotal) docTotal.textContent = 1;
   if (docCurrent) docCurrent.textContent = 1;

   const modal = new bootstrap.Modal(modalEl);
   modal.show();
}

function createAvatarHtml(entity, sizeClass = 'avatar-circle-sm') {
   // 1. Xác định dữ liệu (Hỗ trợ nhiều tên trường khác nhau trong code cũ)
   // Ưu tiên avatar -> avatarData -> avaurl
   const imgUrl = entity.avatar || entity.avatarData || entity.avaurl || '';
   // Ưu tiên fullname -> fullName -> username
   const name = entity.fullname || entity.fullName || entity.username || '?';

   // 2. Nội dung bên trong (Ảnh hoặc Chữ cái đầu)
   const innerContent = (imgUrl && imgUrl.trim() !== '')
      ? `<img src="${imgUrl}" class="w-100 h-100 object-fit-cover" loading="lazy" alt="${name}">`
      : `<span class="small fw-bold theme-text-primary" style="font-size: 1.2em;">${name.charAt(0).toUpperCase()}</span>`;

   // Gán sự kiện onclick để xem avatar, phòng trường hợp không có ảnh thì không click
   const onClickAttr = (imgUrl && imgUrl.trim() !== '') ? `onclick="openAvatarImage(event, '${imgUrl}')"` : `onclick="if(event) event.stopPropagation();"`;

   // 3. Trả về khung HTML chuẩn
   return `
        <div class="avatar-circle ${sizeClass} flex-shrink-0 overflow-hidden border d-flex align-items-center justify-content-center bg-white" 
            style="cursor: pointer;" ${onClickAttr}>
           ${innerContent}
        </div>
   `;
}

function createLoaderHtml(id, text = 'Đang tải...', extraClasses = 'text-center py-3 text-muted small fade-in') {
   return `
			<div id="${id}" class="${extraClasses} w-100 d-flex align-items-center justify-content-center">
				 <div class="spinner-border spinner-border-sm theme-text-primary me-2" role="status"></div>
				 <span>${text}</span>
			</div>
		`;
}

// --- KHỞI TẠO ỨNG DỤNG ---_---

async function syncUserProfile() {
   try {
      // 1. LẤY FINGERPRINT HIỆN TẠI
      userFingerprint = await getBrowserFingerprint();
      console.log("Device Fingerprint:", userFingerprint);

      // 2. [QUAN TRỌNG] LOAD TỪ LOCAL STORAGE TRƯỚC (HIỆN NGAY LẬP TỨC)
      const localData = getLocalData();

      // Kiểm tra xem Fingerprint này đã gắn với User nào chưa
      const res = await sendToServer({
         action: 'get_profile',
         fingerprint: userFingerprint
      });

      if (res && res.status === 'success' && res.data) {
         // A. SERVER CÓ DỮ LIỆU
         console.log("Server synced:", res.data);

         // So sánh xem dữ liệu Server có khác Local không
         if (!localData || localData.username !== res.data.username || localData.avatarData !== res.data.avaurl) {
            currentProfile = {
               username: res.data.username,
               fullName: res.data.fullname,
               avatarData: res.data.avaurl,
               themeName: res.data.theme
            };
            saveLocalData(currentProfile); // Lưu đè Local
            applyTheme(currentProfile.themeName);
            updateAvatarDisplays();
            showToast(`Đồng bộ thành công: ${res.data.fullname}`);
         }

      } else if (!localData) {
         // B. MÁY MỚI TINH  
         console.log("New Device -> Generated Guest Identity");
         const identity = generateIdentity();
         currentProfile = {
            username: identity.username,
            fullName: identity.fullname,
            avatarData: '',
            themeName: 'green'
         };
         // Không lưu Server vội, chỉ lưu Local để dùng tạm
         saveLocalData(currentProfile);
         applyTheme(currentProfile.themeName);
         updateAvatarDisplays();
      }
   } catch (err) {
      console.error("Lỗi sync profile:", err);
   }
}

// Hàm 2: Đồng bộ Baby Run  
async function syncBabyRunStats() {
   try {
      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

      // Gọi API lấy số liệu Home
      const res = await sendToServer({
         action: 'get_babyrun_count',
         date: dateStr
      });

      if (res && (res.status === 'success' || res.result === 'success')) {
         // 1. Cập nhật Lượt đạp (chỉ khi widget bike bật)
         console.log("Stats loaded:", res);
         localStorage.setItem('cached_babyrun_count', res.count);
         if (widgetSettings.bike) {
            const bikeCountEl = document.getElementById('bike-count');
            if (bikeCountEl) bikeCountEl.textContent = res.count;
         }

         // 2. Cập nhật Giá Vàng (chỉ khi widget gold bật)
         if (res.gold) {
            localStorage.setItem('cached_gold_buy', res.gold.buy);
            localStorage.setItem('cached_gold_sell', res.gold.sell);
            if (widgetSettings.gold) {
               const goldBuyEl = document.getElementById('gold-buy');
               const goldSellEl = document.getElementById('gold-sell');
               if (goldBuyEl) goldBuyEl.textContent = formatCurrency(res.gold.buy);
               if (goldSellEl) goldSellEl.textContent = formatCurrency(res.gold.sell);
            }
         }
      }
   } catch (err) {
      console.error("Lỗi sync home stats:", err);
   }
}

let hasCacheData = false;

// --- MAIN INITIALIZATION ---
(async () => {
   // 1. Khởi tạo UI/Modal (Giữ nguyên)
   loadingToast = new bootstrap.Toast(document.getElementById('loadingToast'));
   successToast = new bootstrap.Toast(document.getElementById('successToast'));
   createPostModal = new bootstrap.Modal(document.getElementById('createPostModal'));
   commentModal = new bootstrap.Modal(document.getElementById('commentModal'));
   profileModal = new bootstrap.Modal(document.getElementById('profileModal'));
   postOptionsModal = new bootstrap.Modal(document.getElementById('postOptionsModal'));
   deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
   bikeStatsModal = new bootstrap.Modal(document.getElementById('bikeStatsModal'));
   addBikeEntryModal = new bootstrap.Modal(document.getElementById('addBikeEntryModal'));
   goldStatsModal = new bootstrap.Modal(document.getElementById('goldStatsModal'));
   addGoldEntryModal = new bootstrap.Modal(document.getElementById('addGoldEntryModal'));
   notificationsModal = new bootstrap.Modal(document.getElementById('notificationsModal'));

   // 2. LOAD OFFLINE FIRST (Hiển thị ngay lập tức)
   loadWidgetSettings(); // Load cài đặt widget từ localStorage
   const localData = getLocalData();
   if (localData) {
      currentProfile = localData;
      applyTheme(currentProfile.themeName);
      updateAvatarDisplays();
   }

   if (window.dataSdk) {
      window.dataSdk.init(dataHandler).catch(err => console.warn("Lỗi SDK:", err));
   }
   // lay run count từ local
   const cachedRun = localStorage.getItem('cached_babyrun_count');
   if (cachedRun && document.getElementById('bike-count')) {
      document.getElementById('bike-count').textContent = cachedRun;
   }
   // lay gia vang tu local
   const cachedprice_buy = localStorage.getItem('cached_gold_buy');
   if (cachedprice_buy && document.getElementById('gold-buy')) {
      document.getElementById('gold-buy').textContent = cachedprice_buy;
   }
   const cachedprice_sell = localStorage.getItem('cached_gold_sell');
   if (cachedprice_sell && document.getElementById('gold-sell')) {
      document.getElementById('gold-sell').textContent = cachedprice_sell;
   }

   // D. Load Bảng tin từ Cache

   let hasCache = false;
   try {
      const cachedFeed = localStorage.getItem('cached_feed_data');
      if (cachedFeed) {
         serverFeedData = JSON.parse(cachedFeed);
         if (serverFeedData.length > 0) {
            hasCache = true;
            // Gọi hàm render để hiện bài cũ ngay lập tức
            renderPostsPaged(serverFeedData, 1);
         }
      }
   } catch (e) { }

   const tasks = [
      syncUserProfile(), //lay dữ liệu user tư server
      loadCriticalStats(), //lay số lần đạp, giá vàng từ server
      loadBackgroundInfo(),
      loadFeedData(1, true),
      loadNotifications(1),
      setupPullToRefresh(),
      renderStats()
   ];

   Promise.allSettled(tasks).then(() => {
      console.log("Initial loading sequence complete");
   });

})();

function showToast(message) {
   document.getElementById('toast-message').textContent = message;
   successToast.show();
}

function showLoading() {
   loadingToast.show();
}

function hideLoading() {
   loadingToast.hide();
}

// --- [LUỒNG 1] TẢI SỐ LIỆU QUAN TRỌNG (Ưu tiên cao nhất) ---
async function loadCriticalStats() {
   try {
      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      const res = await sendToServer({
         action: 'get_critical_stats',
         date: dateStr
      });

      if (res.status === 'success') {
         // 1. Cập nhật Số lượt đạp (chỉ khi widget bike đang bật)
         localStorage.setItem('cached_babyrun_count', res.count); // Luôn cache
         if (widgetSettings.bike) {
            const bikeCountEl = document.getElementById('bike-count');
            if (bikeCountEl) {
               bikeCountEl.textContent = res.count;
               updateValueWithEffect('bike-count');
            }
         }

         // 2. Cập nhật Giá vàng (chỉ khi widget gold đang bật)
         if (res.gold) {
            localStorage.setItem('cached_gold_buy', res.gold.buy); // Luôn cache
            localStorage.setItem('cached_gold_sell', res.gold.sell);
            currentMarketPrice_GoldData = res.gold.buy;
            if (widgetSettings.gold) {
               const goldBuyEl = document.getElementById('gold-buy');
               const goldSellEl = document.getElementById('gold-sell');
               if (goldBuyEl) {
                  goldBuyEl.textContent = formatCurrency(res.gold.buy);
                  updateValueWithEffect('gold-buy');
               }
               if (goldSellEl) {
                  goldSellEl.textContent = formatCurrency(res.gold.sell);
                  updateValueWithEffect('gold-sell');
               }
            }
         }
      }
   } catch (e) {
      console.error("Lỗi tải Critical Stats:", e);
   }
}

// --- [LUỒNG 2] TẢI THÔNG TIN NỀN ---
async function loadBackgroundInfo() {
   try {
      const fingerprint = await getBrowserFingerprint();
      const res = await sendToServer({
         action: 'get_background_info',
         fingerprint: fingerprint
      });

      if (res.status === 'success') {
         // 2. Cập nhật Badge thông báo
         const badge = document.getElementById('notification-badge');
         const count = res.unreadCount || 0;
         if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('d-none');
         } else {
            badge.classList.add('d-none');
         }
      }
   } catch (e) {
      console.error("Lỗi tải Background Info:", e);
   }
}

function updateAvatarDisplays() {
   const avatarText = currentProfile?.fullName?.[0]?.toUpperCase() || currentProfile?.username?.[0]?.toUpperCase() || 'U';
   const avatarImg = currentProfile?.avatarData;

   ['header-avatar', 'profile-avatar'].forEach(id => {
      const container = document.getElementById(id);
      if (avatarImg) {
         container.innerHTML = `<img src="${avatarImg}" class="w-100 h-100 object-fit-cover" alt="Avatar">`;
      } else {
         container.innerHTML = `<i class="bi bi-person-fill theme-text-primary ${id === 'profile-avatar' ? 'fs-1' : 'fs-4'}"></i>`;
      }
   });

   if (currentProfile) {
      document.getElementById('profile-username').value = currentProfile.username || '';
      document.getElementById('profile-fullname').value = currentProfile.fullName || '';
   }
}

// Navigation điều hướng 
document.querySelectorAll('.nav-link').forEach(btn => {
   btn.addEventListener('click', () => {
      closeAllModals();
      const targetTab = btn.dataset.tab; // feed, home
      // 1. Cập nhật UI Active cho nút bấm
      document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // 2. Ẩn/Hiện Tab Content (Chỉ thao tác CSS, không đụng vào dữ liệu)
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.add('d-none'));
      document.getElementById(`tab-${targetTab}`).classList.remove('d-none');
      currentTab = targetTab;
      // 3. Xử lý nút FAB (Nút tròn +)
      const fabBtn = document.getElementById('fab-btn');
      if (currentTab === 'feed') {
         fabBtn.classList.remove('d-none');
      }
      else
         fabBtn.classList.add('d-none');
      // 4. [TỐI ƯU] KHÔNG RESET DỮ LIỆU KHI CHUYỂN TAB
      if (currentTab === 'feed') {
         const container = document.getElementById('posts-container');
         // Chỉ render nếu container đang rỗng (chưa có bài viết nào hoặc skeleton)
         if (container && !container.querySelector('.post-card') && !container.querySelector('.post-skeleton')) {
            // A. Nếu có dữ liệu cache -> Render từ cache để hiện ngay
            if (hasCacheData && serverFeedData.length > 0) {
               // Hiển thị skeleton ngay lập tức để người dùng thấy phản hồi
               container.innerHTML = createSkeletonHtml(5); // Dùng hàm tạo skeleton
               // Dùng setTimeout để render bài viết thật sau khi UI đã chuyển tab xong
               setTimeout(() => {
                  renderPostsPaged(serverFeedData, 1); // Vẽ lại từ cache, hàm này sẽ tự xóa skeleton
               }, 50); // Delay 50ms là đủ để trình duyệt "thở"
            } else {
               // B. Nếu không có cache -> Gọi loadFeedData để hiện skeleton và tải từ server
               loadFeedData(1);
            }
         }
      } else if (currentTab === 'home') {
         // Home thì có thể update nhẹ số liệu nếu muốn 
      } else if (currentTab === 'search') {
         // Focus vào ô tìm kiếm khi mở tab
         setTimeout(() => {
            const input = document.getElementById('chat-input');
            if (input) input.focus();
         }, 100);
      }
   });
});

// FAB Button
document.getElementById('fab-btn').addEventListener('click', () => {
   if (currentTab === 'feed') createPostModal.show();
});

// Theme Selection
document.querySelectorAll('.theme-option').forEach(opt => {
   opt.addEventListener('click', () => applyTheme(opt.dataset.theme));
});


// Profile
document.getElementById('profile-btn').addEventListener('click', () => {
   closeAllModals();

   // Sync trạng thái vconsole toggle
   const toggleBtn = document.getElementById('vconsole-toggle');
   if (toggleBtn) toggleBtn.checked = (myVConsole !== null);

   // Sync trạng thái tất cả widget toggles
   ['bike', 'gold', 'days', 'memory', 'event'].forEach(id => {
      const el = document.getElementById(`widget-toggle-${id}`);
      if (el) el.checked = (widgetSettings[id] !== false);
   });

   profileModal.show();
});

// Widget Toggle Listeners - cập nhật settings và re-render ngay lập tức
['bike', 'gold', 'days', 'memory', 'event'].forEach(widgetId => {
   const el = document.getElementById(`widget-toggle-${widgetId}`);
   if (el) {
      el.addEventListener('change', (e) => {
         widgetSettings[widgetId] = e.target.checked;
         saveWidgetSettings();
         renderStats(); // Re-render home widgets ngay lập tức
         console.log(`Widget '${widgetId}' ${e.target.checked ? 'bật' : 'tắt'}`);
      });
   }
});

// 3. Đổi Ảnh Đại Diện (Sửa: Chỉ Preview, KHÔNG lưu server ngay)
document.getElementById('avatar-input').addEventListener('change', async (e) => {
   const file = e.target.files[0];
   if (file) {
      showLoading();
      try {
         const avatarData = await compressImageTo20KB(file);
         currentProfile = {
            username: '',
            fullName: '',
            avatarData: '',
            themeName: currentProfile.themeName
         };

         currentProfile.avatarData = avatarData;
         currentProfile.username = document.getElementById('profile-username').value.trim() || '';
         currentProfile.fullName = document.getElementById('profile-fullname').value.trim() || '';
         // 3. Vẽ lại ảnh lên giao diện (Header và Modal)
         updateAvatarDisplays();
         // 4. Thông báo (Không gọi sendToServer ở đây nữa)
         showToast('Đã tải ảnh (Nhấn "Lưu thay đổi" để hoàn tất)');
      } catch (err) {
         console.error(err);
         showToast('Lỗi xử lý ảnh');
      } finally {
         hideLoading();
      }
   }
});

const saveProfileBtn = document.getElementById('save-profile');
if (saveProfileBtn) {
   saveProfileBtn.addEventListener('click', () => {
      lastUserActionTime = Date.now();
      const fullnameInput = document.getElementById('profile-fullname');
      const usernameInput = document.getElementById('profile-username');

      // 1. Validate dữ liệu
      const newUsername = usernameInput.value.trim();
      const newFullname = fullnameInput.value.trim();

      if (!newUsername) {
         showToast('Vui lòng nhập Username!');
         return;
      }
      const previousProfile = {
         ...currentProfile
      };
      currentProfile = {
         ...currentProfile,
         username: newUsername,
         fullName: newFullname || newUsername,
         themeName: currentTheme,
         avatarData: currentProfile.avatarData || ''
      };
      saveLocalData(currentProfile);

      // 4. Cập nhật giao diện ngay lập tức (Header, Avatar...)
      updateAvatarDisplays();
      // 5. Đóng Modal NGAY LẬP TỨC
      const modalEl = document.getElementById('profileModal');
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();

      // 6. Báo thành công ngay
      showToast('Đã cập nhật hồ sơ!');

      renderPosts();
      sendToServer({
         action: 'save_profile',
         username: currentProfile.username,
         fullname: currentProfile.fullName,
         avaurl: currentProfile.avatarData || '',
         theme: currentProfile.themeName || 'green',
         fingerprint: userFingerprint || 'unknown'
      }).then(res => {
         if (res.status === 'success') {
            console.log('Đồng bộ Server thành công');
         } else {
            console.warn('Server chưa lưu được, nhưng Local đã lưu');
         }
      }).catch(err => {
         console.error('Lỗi đồng bộ server:', err);
      });
   });
}

// Delete confirmation
function showDeleteConfirm(message, id, type) {
   pendingDeleteId = id;
   pendingDeleteType = type;
   deleteConfirmModal.show();
}
document.getElementById('deleteConfirmModal').addEventListener('hidden.bs.modal', () => {
   pendingDeleteId = null;
   pendingDeleteType = null;
});

// --- TỰ ĐỘNG LOAD THÔNG TIN KHI NHẬP USERNAME ---
const usernameInput = document.getElementById('profile-username');

usernameInput.addEventListener('blur', async () => {
   const inputVal = usernameInput.value.trim();
   if (!inputVal || (currentProfile && inputVal === currentProfile.username)) return;

   showLoading();

   try {
      const res = await sendToServer({
         action: 'get_profile_by_username',
         username: inputVal
      });

      if (res.status === 'success' && res.data) {
         console.log("Phát hiện User cũ, đang liên kết thiết bị...", res.data);

         currentProfile = {
            username: res.data.username,
            fullName: res.data.fullname,
            avatarData: res.data.avaurl,
            themeName: res.data.theme
         };
         saveLocalData(currentProfile);

         updateAvatarDisplays();
         applyTheme(currentProfile.themeName);
         if (serverFeedData.length > 0) renderPosts();
         // ----------------------------------------------------

         await sendToServer({
            action: 'save_profile',
            username: currentProfile.username,
            fullname: currentProfile.fullName,
            avaurl: currentProfile.avatarData,
            theme: currentProfile.themeName,
            fingerprint: userFingerprint
         });

         showToast(`Đã khôi phục & Liên kết thiết bị: ${res.data.fullname}`);
      }
   } catch (e) {
      console.error(e);
   } finally {
      hideLoading();
   }
});

async function runBackgroundSync() {
   // --- [PHẦN 1: CÁC ĐIỀU KIỆN CHẶN (QUAN TRỌNG)] ---

   // 1. Nếu tab đang bị ẩn (người dùng sang tab khác), không cần sync để tiết kiệm pin/data
   if (document.hidden) return;

   // 2. Nếu đang có bất kỳ Modal nào mở (Xem ảnh, Sửa bài, Xóa bài...) -> DỪNG NGAY
   // Logic: Class .show được Bootstrap thêm vào khi modal mở
   if (document.querySelector('.modal.show')) {
      console.log("Hủy sync ngầm: Đang mở Modal/Popup");
      return;
   }

   // 3. Nếu người dùng đang gõ phím (Input/Textarea đang focus) -> DỪNG NGAY
   // Logic: Tránh việc data mới load về làm mất focus của ô nhập liệu
   if (document.activeElement &&
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      return;
   }

   // 4. Các điều kiện cũ của bạn (Giữ nguyên)
   if (typeof isEditingPost !== 'undefined' && isEditingPost) return;
   if (typeof pendingTasksCount !== 'undefined' && pendingTasksCount > 0) return;
   if (typeof lastUserActionTime !== 'undefined' && (Date.now() - lastUserActionTime < 10000)) return;

   console.log("Đang chạy đồng bộ ngầm...");

   // --- [PHẦN 2: THỰC THI SYNC NHẸ] ---
   // Các tác vụ nhẹ chạy trước
   syncUnreadCount();
   syncBabyRunStats();
   loadNotifications(1);

   // --- [PHẦN 3: THỰC THI SYNC NẶNG (FEED)] ---
   try {
      const res = await sendToServer({
         action: 'get_feed',
         page: 1,
         limit: 5 // Chỉ lấy 5 bài mới nhất để check thay đổi
      });

      // --- [PHẦN 4: KIỂM TRA LẠI TRƯỚC KHI UPDATE UI] ---
      // Trong lúc chờ server phản hồi (await), người dùng có thể đã mở Modal hoặc gõ phím.
      // Cần check lại lần nữa để đảm bảo an toàn tuyệt đối.

      if (document.querySelector('.modal.show')) return; // Check lại Modal

      if (typeof isEditingPost !== 'undefined' && isEditingPost) {
         console.log("Hủy update feed: Người dùng đang sửa bài.");
         return;
      }

      // Nếu có dữ liệu mới -> Gọi hàm xử lý (Smart Merge)
      if (res.status === 'success' && res.data.length > 0) {
         // Lưu ý: Đảm bảo bạn đang dùng hàm mergeServerDataToView (trong feed.js) 
         // hoặc processNewFeedData nếu bạn đã đổi tên.
         if (typeof mergeServerDataToView === 'function') {
            mergeServerDataToView(res.data);
         } else if (typeof processNewFeedData === 'function') {
            processNewFeedData(res.data);
         }
      }
   } catch (e) {
      console.warn("Lỗi sync ngầm:", e);
   }
}

// --- HÀM XỬ LÝ KÉO ĐỂ LÀM MỚI (PULL TO REFRESH) --- 
function setupPullToRefresh() {
   const container = document.querySelector('.main-content');
   const ptrElement = document.getElementById('ptr-element');
   const progressCircle = document.getElementById('ptr-progress-circle');

   // Cấu hình
   const threshold = 100;
   const maxPull = 160;
   const circumference = 76;

   let startY = 0;
   let isPulling = false;
   let isReadyToRefresh = false;

   // 1. CHẠM TAY (TOUCH START)
   container.addEventListener('touchstart', (e) => {
      if (container.scrollTop <= 0) {
         startY = e.touches[0].clientY;
         isPulling = true;
         isReadyToRefresh = false;

         ptrElement.classList.add('is-pulling');
         ptrElement.classList.remove('ptr-loading');

         progressCircle.style.strokeDashoffset = circumference;

         progressCircle.style.stroke = 'red';
      }
   }, {
      passive: true
   });

   // 2. KÉO TAY (TOUCH MOVE)
   container.addEventListener('touchmove', (e) => {
      if (!isPulling) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (diff > 0 && container.scrollTop <= 0) {
         if (e.cancelable) e.preventDefault();

         let pullDistance = diff * 0.5;
         if (pullDistance > maxPull) pullDistance = maxPull;

         ptrElement.style.height = `${pullDistance}px`;

         let progress = pullDistance / threshold;
         if (progress > 1) progress = 1;

         const offset = circumference - (progress * circumference);
         progressCircle.style.strokeDashoffset = offset;

         // Xử lý logic đạt ngưỡng (Chỉ rung, không đổi màu ở đây nữa để giữ màu đỏ)
         if (progress >= 1 && !isReadyToRefresh) {
            isReadyToRefresh = true;
            if (navigator.vibrate)
               try {
                  if (navigator.vibrate) navigator.vibrate(15);
               } catch (err) {
                  // Kệ nó, không rung cũng không sao
               }
         } else if (progress < 1 && isReadyToRefresh) {
            isReadyToRefresh = false;
         }
      } else {
         isPulling = false;
         ptrElement.style.height = '0px';
         ptrElement.classList.remove('is-pulling');
      }
   }, {
      passive: false
   });

   // 3. THẢ TAY (TOUCH END)
   container.addEventListener('touchend', async () => {
      if (!isPulling) return;

      isPulling = false;
      ptrElement.classList.remove('is-pulling');

      if (isReadyToRefresh) {
         // A. ĐÃ ĐẠT NGƯỠNG -> BẮT ĐẦU LOAD
         ptrElement.style.height = '60px';
         ptrElement.classList.add('ptr-loading');

         // [QUAN TRỌNG] Đổi sang màu XANH #006b68 khi bắt đầu quay
         progressCircle.style.stroke = '#006b68';

         // Tạo hình chữ C quay tròn
         progressCircle.style.strokeDashoffset = '20';

         // Gọi hàm refresh
         await handlePageRefresh();

         // B. LOAD XONG -> ĐÓNG LẠI
         setTimeout(() => {
            ptrElement.style.height = '0px';
            setTimeout(() => {
               ptrElement.classList.remove('ptr-loading');
               progressCircle.style.strokeDashoffset = circumference;
               // Reset lại màu đỏ cho lần sau (đề phòng)
               progressCircle.style.stroke = 'red';
            }, 300);
         }, 500);
      } else {
         // C. HỦY BỎ
         ptrElement.style.height = '0px';
         setTimeout(() => {
            progressCircle.style.strokeDashoffset = circumference;
            progressCircle.style.stroke = 'red';
         }, 300);
      }
   });
}

// Hàm điều phối làm mới dữ liệu
async function handlePageRefresh() {
   console.log("Đang làm mới trang:", currentTab);
   try {
      if (currentTab === 'feed') {
         feedPage = 1;
         await loadFeedData(1, true); // true = tải ngầm
      } else if (currentTab === 'home') {
         // 1. Tải lại số liệu quan trọng trước
         await loadCriticalStats();
         // 2. Tải các thông tin phụ sau
         loadBackgroundInfo();

      }
   } catch (e) {
      console.error("Lỗi refresh:", e);
   }
}

// --- HÀM TIỆN ÍCH: ĐÓNG TẤT CẢ MODAL ---
function closeAllModals() {
   // 1. Danh sách tất cả các biến Modal đang dùng
   const allModals = [
      createPostModal,
      commentModal, profileModal, postOptionsModal, deleteConfirmModal,
      bikeStatsModal, addBikeEntryModal, goldStatsModal, addGoldEntryModal,
      notificationsModal, imageViewerModal
   ];

   // 2. Duyệt qua và ẩn từng cái nếu nó đang tồn tại
   allModals.forEach(modal => {
      if (modal) modal.hide();
   });

   // 3. Dọn dẹp sạch sẽ các lớp nền đen (backdrop) nếu còn sót lại
   // (Phòng trường hợp bấm nhanh quá Bootstrap chưa kịp xóa DOM)
   setTimeout(() => {
      document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
      document.body.classList.remove('modal-open');
      document.body.style = ''; // Reset style của body
   }, 150); // Đợi một chút cho hiệu ứng ẩn modal chạy xong
}


document.addEventListener('click', function (event) {
   const toastEl = document.getElementById('successToast');

   // 1. Kiểm tra xem Toast có đang hiện không (Bootstrap dùng class 'show')
   if (toastEl && toastEl.classList.contains('show')) {

      // 2. Kiểm tra vị trí click:
      if (!toastEl.contains(event.target)) {
         successToast.hide();
      }
   }
});

// (Tùy chọn thêm) Click thẳng vào Toast cũng cho ẩn luôn để thao tác nhanh hơn
document.getElementById('successToast').addEventListener('click', function () {
   successToast.hide();
});

async function handleSwipeAction(id, action) {
   // 1. Lấy các phần tử DOM cần thiết
   const wrap = document.getElementById(`notif-wrap-${id}`);
   const contentBox = wrap ? wrap.querySelector('.notification-content-box') : null;
   const actions = wrap ? wrap.querySelector('.notification-actions') : null;

   if (actions) {
      actions.classList.remove('active');
   }
   // 3. Đóng nắp trượt lại (trượt về 0)
   if (contentBox) {
      contentBox.style.transform = `translateX(0px)`;
   }
   currentSwipedId = null;

   // 4. Xử lý logic nghiệp vụ
   if (action === 'delete') {
      // Với hành động xóa, delay nhẹ 1 xíu để nắp trượt đóng xong mới hiện Popup
      // tạo cảm giác mượt mà hơn
      setTimeout(() => {
         showDeleteConfirm('Bạn có chắc muốn xóa thông báo này?', id, 'notification_single');
      }, 150);
   }
   else if (action === 'read' || action === 'unread') {
      const isRead = (action === 'read');

      // UI Lạc quan: Đổi màu nền và chấm đỏ ngay lập tức
      if (contentBox) {
         if (isRead) {
            contentBox.classList.remove('unread');
            const dot = contentBox.querySelector('.notification-dot');
            if (dot) dot.remove();
         } else {
            contentBox.classList.add('unread');
            // Logic thêm chấm đỏ nếu chưa có
            if (!contentBox.querySelector('.notification-dot')) {
               const flexDiv = contentBox.querySelector('.d-flex');
               const dotHtml = `<div class="notification-dot ms-auto me-2" style="flex-shrink: 0;"></div>`;

               if (typeof createRange === 'function') {
                  flexDiv.insertBefore(createRange(dotHtml), flexDiv.lastElementChild);
               } else {
                  const temp = document.createElement('div');
                  temp.innerHTML = dotHtml;
                  flexDiv.insertBefore(temp.firstChild, flexDiv.lastElementChild);
               }
            }
         }
      }

      // Gửi request lên server (chạy ngầm)
      await sendToServer({ action: 'notification_action', type: 'toggle_read', id: id, status: isRead });

      // Cập nhật Cache
      const cachedItem = serverNotifications.find(n => n.__backendId === id);
      if (cachedItem) cachedItem.isRead = isRead;
   }
}

// Helper tạo DOM từ string
function createRange(html) {
   const tpl = document.createElement('template');
   tpl.innerHTML = html;
   return tpl.content.firstChild;
}


function handleTouchStart(e, id) {
   touchStartX = e.touches[0].clientX;
   touchStartY = e.touches[0].clientY; // [MỚI] Lưu vị trí bắt đầu Y
   isSwiping = false;
   isScrolling = false; // Reset trạng thái

   // Đóng item cũ nếu đang mở cái khác
   if (currentSwipedId && currentSwipedId !== id) {
      const oldWrap = document.getElementById(`notif-wrap-${currentSwipedId}`);
      if (oldWrap) {
         const oldContent = oldWrap.querySelector('.notification-content-box');
         if (oldContent) oldContent.style.transform = `translateX(0px)`;
         const oldActions = oldWrap.querySelector('.notification-actions');
         if (oldActions) setTimeout(() => oldActions.classList.remove('active'), 200);
      }
      currentSwipedId = null;
   }
}

function handleTouchMove(e) {
   if (isScrolling) return;

   const touchCurrentX = e.touches[0].clientX;
   const touchCurrentY = e.touches[0].clientY;

   const diffX = touchCurrentX - touchStartX;
   const diffY = touchCurrentY - touchStartY;

   // Kiểm tra ưu tiên cuộn dọc
   if (Math.abs(diffY) > Math.abs(diffX)) {
      isScrolling = true;
      return;
   }

   // Vuốt ngang
   if (Math.abs(diffX) > 10) {
      if (e.cancelable) e.preventDefault();

      // Chỉ xử lý khi vuốt sang trái (Mở menu)
      if (diffX < -5) {
         isSwiping = true;
         const el = e.currentTarget;

         // --- [THÊM MỚI] KHI BẮT ĐẦU VUỐT MỚI HIỆN ACTIONS ---
         const wrap = el.parentElement; // Lấy thẻ cha wrapper
         if (wrap) {
            const actions = wrap.querySelector('.notification-actions');
            // Chỉ hiện nếu chưa hiện
            if (actions && !actions.classList.contains('active')) {
               actions.classList.add('active');
            }
         }
         // ----------------------------------------------------

         if (diffX > -200) el.style.transform = `translateX(${diffX}px)`;
      }
   }
}

function handleTouchEnd(e) {
   if (isScrolling) {
      isScrolling = false;
      return;
   }
   const el = e.currentTarget;
   const notifId = el.getAttribute('data-id');
   const touchEndX = e.changedTouches[0].clientX;
   const diff = touchEndX - touchStartX;

   // Lấy actions để xử lý ẩn hiện
   const wrap = el.parentElement;
   const actions = wrap ? wrap.querySelector('.notification-actions') : null;

   // 1. NẾU LÀ CLICK (Chạm nhẹ không di chuyển)
   if (Math.abs(diff) < 5 && !isSwiping) {
      handleNotificationClick(notifId);
      el.style.transform = `translateX(0px)`;

      // Ẩn actions đi nếu lỡ hiện
      if (actions) actions.classList.remove('active');
      return;
   }

   // 2. XỬ LÝ KẾT THÚC VUỐT
   if (diff < -60) {
      // Kéo đủ sâu -> MỞ RA
      el.style.transform = `translateX(-180px)`;
      currentSwipedId = notifId;
      // Giữ nguyên class 'active' cho actions
   } else {
      // Kéo ít quá -> ĐÓNG LẠI
      el.style.transform = `translateX(0px)`;
      if (currentSwipedId === notifId) currentSwipedId = null;

      // --- [THÊM MỚI] ẨN ACTIONS VÌ ĐÃ ĐÓNG ---
      if (actions) {
         // Delay nhẹ để khớp transition của transform
         setTimeout(() => actions.classList.remove('active'), 200);
      }
   }

   setTimeout(() => { isSwiping = false; }, 100);
}

// 2. TÍNH NĂNG AI CHAT (Thay thế Tìm kiếm)
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatMessages = document.getElementById('chat-messages');

let aiChatHistory = []; // Lưu trữ cuộc hội thoại tạm thời
let currentChatMode = 'memory'; // Default mode

if (chatInput && chatSendBtn) {
   // Xử lý khi bấm nút Gửi
   chatSendBtn.addEventListener('click', () => {
      handleAeChatSubmit();
   });

   // Xử lý khi nhấn Enter
   chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
         e.preventDefault();
         handleAeChatSubmit();
      }
   });
}

// -----------------------------------------------------------------------------
// CHUYỂN ĐỔI CHẾ ĐỘ CHAT (Memory vs Document)
// -----------------------------------------------------------------------------
window.switchChatMode = function (mode) {
   currentChatMode = mode;

   // Cập nhật text & icon trên button Dropdown
   const modeText = document.getElementById('chat-mode-text');
   const modeIcon = document.getElementById('chat-mode-icon');

   if (mode === 'memory') {
      modeText.textContent = 'Kỷ niệm';
      modeIcon.className = 'bi bi-clock-history';
      chatInput.placeholder = 'Nhập câu hỏi...';
   } else {
      modeText.textContent = 'Tài liệu';
      modeIcon.className = 'bi bi-file-earmark-text';
      chatInput.placeholder = 'Hỏi về tài liệu...';
   }

   // Cập nhật trạng thái Active trong Menu Dropdown
   document.querySelectorAll('#chatModeDropdown + .dropdown-menu .dropdown-item').forEach(el => {
      el.classList.remove('active');
   });
   document.querySelector(`#chatModeDropdown + .dropdown-menu .dropdown-item[data-mode="${mode}"]`).classList.add('active');

   // Thông báo cho người dùng
   addChatMessage('ai', `Đã chuyển sang chế độ <b>${mode === 'memory' ? 'Kỷ niệm' : 'Phân tích tài liệu'}</b>. Bạn muốn hỏi gì?`);
};

// -----------------------------------------------------------------------------
// XỬ LÝ UPLOAD TÀI LIỆU
// -----------------------------------------------------------------------------
const docUploadInput = document.getElementById('doc-upload-input');
if (docUploadInput) {
   docUploadInput.addEventListener('change', async function (e) {
      const file = e.target.files[0];
      if (!file) return;

      // Kiểm tra dung lượng (giới hạn 5MB)
      if (file.size > 5 * 1024 * 1024) {
         showToast('File quá lớn, vui lòng chọn file < 5MB');
         return;
      }

      showLoading();

      const reader = new FileReader();
      reader.onload = async function () {
         try {
            const base64Data = reader.result;
            const res = await sendToServer({
               action: 'upload_document',
               fileName: file.name,
               fileData: base64Data
            });

            if (res.status === 'success') {
               showToast('Tải tài liệu thành công!');
               addChatMessage('user', `<i>Đã tải lên tệp: ${file.name}</i>`);
               addChatMessage('ai', `Mình đã nhận được tệp <b>${file.name}</b>. Hãy chuyển sang chế độ <b>Phân tích tài liệu</b> để hỏi đáp nội dung nhé!`);
            } else {
               showToast('Lỗi: ' + res.message);
            }
         } catch (err) {
            console.error('Lỗi upload file:', err);
            showToast('Lỗi kết nối máy chủ khi tải file');
         } finally {
            hideLoading();
            // Reset input để chọn lại file cùng tên vẫn trigger event change
            docUploadInput.value = '';
         }
      };
      reader.readAsDataURL(file);
   });
}

// 3. LOGIC GỬI TIN NHẮN VÀ GỌI AI
async function handleAeChatSubmit() {
   const query = chatInput.value.trim();
   if (!query) return;

   // Khóa input trong lúc chờ
   chatInput.value = '';
   chatInput.disabled = true;
   chatSendBtn.disabled = true;

   // 3.1. Hiển thị tin nhắn của User
   addChatMessage('user', query);
   aiChatHistory.push({ role: 'user', text: query });

   // 3.2. Hiển thị "AI đang gõ..."
   const typingId = 'typing-' + Date.now();
   addChatMessage('ai', '<div class="typing-indicator"><span></span><span></span><span></span></div>', typingId);
   scrollToBottom();

   try {
      // 3.3. Gọi Backend
      const res = await sendToServer({
         action: 'ai_chat',
         query: query,
         history: aiChatHistory,
         chatMode: currentChatMode // Gửi chế độ hiện tại lên server
      });

      // Xóa typing indicator
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();

      if (res.status === 'success') {
         // Hiển thị tin nhắn AI
         addChatMessage('ai', res.reply);
         aiChatHistory.push({ role: 'ai', text: res.reply });
      } else {
         addChatMessage('ai', '<span class="text-danger">Xin lỗi, mình đang gặp chút trục trặc: ' + res.message + '</span>');
      }

   } catch (error) {
      console.error("Lỗi AI Chat:", error);
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
      addChatMessage('ai', '<span class="text-danger">Mất kết nối với máy chủ. Vui lòng thử lại sau.</span>');
   }

   // Mở lại input
   chatInput.disabled = false;
   chatSendBtn.disabled = false;
   chatInput.focus();
}

// Hàm phụ trợ: Thêm tin nhắn vào giao diện
function addChatMessage(role, htmlContent, elementId = '') {
   if (!chatMessages) return;

   const isUser = role === 'user';
   const alignClass = isUser ? 'justify-content-end' : 'justify-content-start';
   const wrapperClass = isUser ? 'ms-auto flex-row-reverse' : 'me-auto flex-row';

   // Avatar
   let avatarHtml = '';
   if (isUser) {
      const userAva = (currentProfile && currentProfile.avatarData) ? currentProfile.avatarData : 'https://ui-avatars.com/api/?name=User&background=random';
      avatarHtml = `
         <div class="ms-2 mt-auto mb-auto">
             <img src="${userAva}" class="rounded-circle shadow-sm" style="width: 36px; height: 36px; object-fit: cover;">
         </div>`;
   } else {
      avatarHtml = `
         <div class="me-2 mt-auto mb-auto">
            <div class="bg-white rounded-circle d-flex align-items-center justify-content-center shadow-sm" style="width: 36px; height: 36px;">
               <i class="bi bi-robot theme-text-primary"></i>
            </div>
         </div>`;
   }

   // Nội dung bong bóng chat
   const bubbleStyle = isUser
      ? 'background-color: var(--theme-primary); color: var(--bs-dark); border-bottom-right-radius: 4px !important;'
      : 'background-color: white; color: var(--bs-dark); border-bottom-left-radius: 4px !important;';

   const nameHtml = !isUser ? `<p class="mb-1 fw-semibold theme-text-primary" style="font-size: 0.9rem;">Trợ lý LoveStory</p>` : '';

   const html = `
      <div class="d-flex mb-3 ${alignClass}" ${elementId ? `id="${elementId}"` : ''}>
         <div class="d-flex ${wrapperClass}" style="max-width: 85%;">
            ${avatarHtml}
            <div class="p-3 rounded-4 shadow-sm" style="${bubbleStyle}">
               ${nameHtml}
               <p class="mb-0 small" style="line-height: 1.4; word-break: break-word;">${htmlContent}</p>
            </div>
         </div>
      </div>
   `;

   chatMessages.insertAdjacentHTML('beforeend', html);
   scrollToBottom();
}

// Cố định cuộn xuống cuối
function scrollToBottom() {
   if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
   }
}
// TÍNH NĂNG: VUỐT TỪ TRÁI SANG ĐỂ ĐÓNG (SWIPE TO BACK)
(function setupSwipeToClose() {
   let touchStartX = 0;
   let touchStartY = 0;

   // Chỉ kích hoạt nếu vuốt từ vùng mép trái (tạo cảm giác như nút Back)
   // Ví dụ: 50px từ mép trái màn hình
   const EDGE_ZONE = 50;

   // Khoảng cách tối thiểu để tính là vuốt
   const MIN_SWIPE_DISTANCE = 100;

   document.addEventListener('touchstart', (e) => {
      // Chỉ xử lý khi có Modal đang mở
      const openModal = document.querySelector('.modal.show');
      if (!openModal) return;

      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
   }, { passive: true });

   document.addEventListener('touchend', (e) => {
      // Kiểm tra lại xem có modal nào đang mở không
      const openModal = document.querySelector('.modal.show');
      if (!openModal) return;

      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;

      // Tính toán khoảng cách
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      // LOGIC KIỂM TRA ĐIỀU KIỆN ĐÓNG:

      // 1. Phải là vuốt từ mép trái (để tránh vuốt nhầm khi đang xem ảnh slide ngang)
      const isFromEdge = touchStartX < EDGE_ZONE;

      // 2. Phải vuốt sang phải (diffX > 0) và đủ xa
      const isSwipeRight = diffX > MIN_SWIPE_DISTANCE;

      // 3. Phải là vuốt ngang (X) nhiều hơn vuốt dọc (Y) để tránh nhầm với cuộn trang
      const isHorizontal = Math.abs(diffX) > Math.abs(diffY) * 2;

      if (isFromEdge && isSwipeRight && isHorizontal) {

         // XỬ LÝ ĐÓNG MODAL
         // Tìm instance Bootstrap của modal đó để gọi hide() chuẩn
         const modalInstance = bootstrap.Modal.getInstance(openModal);
         if (modalInstance) {

            // (Tùy chọn) Thêm hiệu ứng trượt sang phải cho đẹp trước khi đóng
            const dialog = openModal.querySelector('.modal-dialog');
            if (dialog) {
               dialog.style.transition = 'transform 0.2s ease-out';
               dialog.style.transform = 'translateX(100%)'; // Trượt ra khỏi màn hình
            }

            // Đợi 200ms cho hiệu ứng chạy xong rồi mới đóng thật (hoặc đóng luôn cũng được)
            setTimeout(() => {
               modalInstance.hide();
               // Reset style sau khi đóng để lần sau mở lại không bị lỗi vị trí
               setTimeout(() => {
                  if (dialog) dialog.style.transform = '';
               }, 300);
            }, 150);
         }
      }
   }, { passive: true });
})();

// Thêm vào app.js
setInterval(() => {
   // 1. Quét tất cả thẻ thời gian của bài viết
   document.querySelectorAll('.post-timestamp').forEach(el => {
      // Tìm bài viết chứa nó để lấy timestamp gốc
      const postCard = el.closest('.post-card');
      if (postCard) {
         const postId = postCard.id.replace('post-', '');
         const post = serverFeedData.find(p => p.__backendId === postId);
         if (post) {
            // Tính toán lại thời gian hiển thị
            el.textContent = formatTimeSmart(post.timestamp || post.createdAt);
         }
      }
   });
}, 60000); // Chạy mỗi 60 giây

// --- XỬ LÝ XEM THÊM NỘI DUNG ---
window.togglePostContent = function (btn, postId) {
   // 1. Tìm các element liên quan
   const shortContent = document.getElementById(`content-short-${postId}`);
   const fullContent = document.getElementById(`content-full-${postId}`);

   if (shortContent && fullContent) {
      // 2. Ẩn bản rút gọn, hiện bản đầy đủ
      shortContent.style.display = 'none';
      fullContent.style.display = 'block';
      // Hiệu ứng fade-in nhẹ
      fullContent.classList.add('fade-in');
   }
};


document.addEventListener('hide.bs.modal', (event) => {
   if (document.activeElement && event.target.contains(document.activeElement)) {
      document.activeElement.blur(); // Bỏ focus ngay lập tức
   }
});

// KÍCH HOẠT ĐỊNH KỲ (Khuyên dùng 60s thay vì 10s)
setInterval(runBackgroundSync, 60000);
