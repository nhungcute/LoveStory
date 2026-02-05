 
function updateNotificationBadge() {
   const notifications = allData.filter(d => d.type === 'notification');
   const unreadCount = notifications.filter(n => !n.isRead).length;
   const badge = document.getElementById('notification-badge');

   if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.classList.remove('d-none');
   } else {
      badge.classList.add('d-none');
   }
}

function renderNotifications() {
   const notifications = allData.filter(d => d.type === 'notification').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
   const container = document.getElementById('notifications-list');

   if (notifications.length === 0) {
      container.innerHTML = `
      			  <div class="text-center py-5">
      				<i class="bi bi-bell-slash theme-text-primary" style="font-size: 4rem;"></i>
      				<p class="fw-semibold fs-5 mt-3">Chưa có thông báo</p>
      				<p class="text-muted">Các thông báo mới sẽ hiển thị ở đây</p>
      			  </div>
      			`;
      return;
   }

   container.innerHTML = notifications.map(notif => {
      const iconMap = {
         like: 'heart-fill text-danger',
         comment: 'chat-fill text-primary',
         system: 'info-circle-fill theme-text-primary'
      };

      const icon = iconMap[notif.notifType] || iconMap.system;

      return `
      			  <div class="notification-item p-2 ${notif.isRead ? '' : 'unread'}" data-id="${notif.__backendId}">
      				<div class="d-flex align-items-start">
      				  <div class="me-3">
      					<i class="bi bi-${icon} fs-6"></i>
      				  </div>
      				  <div class="flex-grow-1">
      					<p class="mb-1 fw-semibold">${notif.title}</p>
      					<p class="mb-1 text-muted small">${notif.message}</p>
      					<small class="text-muted">${formatDate(notif.createdAt)}</small>
      				  </div>
      				  ${!notif.isRead ? '<div class="notification-dot ms-2"></div>' : ''}
      				  <button class="btn btn-sm btn-link text-danger delete-notification" data-id="${notif.__backendId}">
      					<i class="bi bi-x-lg"></i>
      				  </button>
      				</div>
      			  </div>
      			`;
   }).join('');
}


// Notifications
document.getElementById('mark-all-read').addEventListener('click', async () => {
   const unreadItems = document.querySelectorAll('.notification-content-box.unread');
   unreadItems.forEach(el => {
      el.classList.remove('unread');
      const dot = el.querySelector('.notification-dot');
      if (dot) dot.remove();
   });
   const badge = document.getElementById('notification-badge');
   if (badge) badge.classList.add('d-none');

   showToast('Đã đánh dấu tất cả đã đọc');
   try {
      await sendToServer({
         action: 'notification_action',
         type: 'mark_all_read'
      });
   } catch (e) {
      console.error("Lỗi sync:", e);
   }
});

// 2. Nút Xóa tất cả thông báo
document.getElementById('clear-all-notifications').addEventListener('click', async () => {
   showDeleteConfirm('Bạn có chắc muốn xóa sạch lịch sử thông báo không?', null, 'all-notifications');
});


// --- XỬ LÝ NÚT CHUÔNG
document.getElementById('notification-btn').addEventListener('click', () => {
   closeAllModals();
   notificationsModal.show();
   // 1. Ẩn badge đỏ ngay (UI phản hồi tức thì)
   const badge = document.getElementById('notification-badge');
   badge.classList.add('d-none');
   badge.textContent = '0';
   const container = document.getElementById('notifications-list');
   // 2. KIỂM TRA & HIỂN THỊ DỮ LIỆU TỪ CACHE
   if (serverNotifications.length > 0) {
      container.innerHTML = '';
      renderNotificationsPaged(serverNotifications, container);
   } else {
      container.innerHTML = '<div class="d-flex justify-content-center align-items-center py-5"><div class="spinner-border text-primary" role="status"></div></div>';
   }
   loadNotifications(1);
});

// --- HÀM TẢI THÔNG BÁO TỪ SERVER
async function loadNotifications(page) {
   if (notifLoading) return;
   const container = document.getElementById('notifications-list');
   const isModalOpen = document.getElementById('notificationsModal').classList.contains('show');
   if (isModalOpen && page === 1 && serverNotifications.length === 0) {
      container.innerHTML = '<div class="d-flex justify-content-center align-items-center py-5"><div class="spinner-border text-primary" role="status"></div></div>';
   }
   notifLoading = true;
   try {
      const res = await sendToServer({
         action: 'get_notifications',
         page: page,
         limit: 10
      });

      if (res.status === 'success') {
         notifHasMore = res.hasMore;

         if (page === 1) {
            serverNotifications = res.data;
         } else {
            serverNotifications = serverNotifications.concat(res.data);
         }
         if (isModalOpen) {
            if (page === 1) container.innerHTML = '';
            else {
               const oldTrigger = document.getElementById('notif-load-more');
               if (oldTrigger) oldTrigger.remove();
            }
            renderNotificationsPaged(res.data, container);
         }
      }
   } catch (e) {
      console.error(e);
      if (isModalOpen && page === 1) container.innerHTML = '<div class="text-center py-3 text-danger small">Lỗi kết nối</div>';
   } finally {
      notifLoading = false;
   }
}

// --- HÀM RENDER THÔNG BÁO 
function renderNotificationsPaged(newNotifs, container) {
   if (serverNotifications.length === 0) {
      container.innerHTML = `
				<div class="text-center py-5">
					<i class="bi bi-bell-slash theme-text-primary" style="font-size: 3rem;"></i>
					<p class="fw-semibold mt-3">Chưa có thông báo</p>
				</div>`;
      return;
   }
   const html = newNotifs.map(notif => {
      const iconMap = {
         like: 'heart-fill text-danger',
         comment: 'chat-fill text-primary',
         system: 'info-circle-fill theme-text-primary',
         create_post: 'pencil-square text-success',
         update_post: 'pencil-fill text-warning',
         delete_post: 'trash-fill text-danger'
      };

      let iconClass = iconMap.system;
      if (notif.action) {
         if (notif.action.includes('create')) iconClass = iconMap.create_post;
         else if (notif.action.includes('update')) iconClass = iconMap.update_post;
         else if (notif.action.includes('delete')) iconClass = iconMap.delete_post;
         else iconClass = iconMap[notif.action] || iconMap.system;
      }
      const dotHtml = !notif.isRead ?
         `<div class="notification-dot ms-auto me-2" style="flex-shrink: 0;"></div>` :
         `<div class="ms-auto me-2"></div>`;

      const relatedPostId = notif.relatedId || notif.postId || '';

      return `
				<div class="notification-swipe-wrapper" id="notif-wrap-${notif.__backendId}">
					<div class="notification-actions">
						<button class="notif-action-btn btn-mark-unread" onclick="handleSwipeAction('${notif.__backendId}', 'unread')">
							<i class="bi bi-envelope"></i>
						</button>
						<button class="notif-action-btn btn-mark-read" onclick="handleSwipeAction('${notif.__backendId}', 'read')">
							<i class="bi bi-envelope-open"></i>
						</button>
						<button class="notif-action-btn btn-delete-swipe" onclick="handleSwipeAction('${notif.__backendId}', 'delete')">
							<i class="bi bi-trash"></i>
						</button>
					</div>

					<div class="notification-content-box p-3 ${notif.isRead ? '' : 'unread'}" 
						 data-id="${notif.__backendId}" 
						 data-post-id="${relatedPostId}"
						 onclick="if(!isSwiping) handleNotificationClick('${notif.__backendId}')"
						 ontouchstart="handleTouchStart(event, '${notif.__backendId}')"
						 ontouchmove="handleTouchMove(event)"
						 ontouchend="handleTouchEnd(event)">
						
						<div class="d-flex align-items-center pointer-event-none">
							<div class="me-3">
								<i class="bi bi-${iconClass} fs-4"></i>
							</div>
							<div class="flex-grow-1" style="font-size: 0.9rem; line-height: 1.3;">
								<strong>${notif.fullname || 'Hệ thống'}</strong> ${notif.title}
								<div class="text-muted small">${notif.formattedTime || formatTimeSmart(notif.createdAt)}</div>
								${notif.message ? `<div class="text-muted small text-truncate" style="max-width: 220px;">${notif.message}</div>` : ''}
							</div>
							${dotHtml}
							<i class="bi bi-chevron-left text-black-50 small ms-2" style="font-size: 0.7rem;"></i>
						</div>
					</div>
				</div>
			`;
   }).join('');

   container.insertAdjacentHTML('beforeend', html);

   // Logic Load More (Giữ nguyên của bạn)
   if (notifHasMore) {
      const trigger = document.createElement('div');
      trigger.id = 'notif-load-more';
      trigger.className = 'py-3 text-center text-muted small cursor-pointer';
      trigger.innerHTML = '<span>Đang tải thêm...</span>';
      container.appendChild(trigger);

      const observer = new IntersectionObserver((entries) => {
         if (entries[0].isIntersecting && !notifLoading) {
            notifPage++;
            loadNotifications(notifPage);
         }
      }, { threshold: 0.1 });
      observer.observe(trigger);
   } else if (serverNotifications.length > 5) {
      container.insertAdjacentHTML('beforeend', '<div class="text-center py-3 text-muted small">--- Hết thông báo ---</div>');
   }
}


document.getElementById('confirm-delete').addEventListener('click', async () => {
   if (!pendingDeleteId && pendingDeleteType !== 'all-notifications') {
      deleteConfirmModal.hide();
      return;
   }
   // TRƯỜNG HỢP 1: XÓA BÀI VIẾT (POST) -> CẬP NHẬT LẠC QUAN
   if (pendingDeleteType === 'post') {
      const postId = pendingDeleteId;
      const postEl = document.getElementById(`post-${postId}`);
      deleteConfirmModal.hide();
      // 2. Backup dữ liệu (để hoàn tác nếu lỗi)
      const originalFeedData = [...serverFeedData];
      const postIndex = serverFeedData.findIndex(p => p.__backendId === postId);
      if (postIndex > -1) {
         serverFeedData.splice(postIndex, 1);
      }
      // B. Tạo hiệu ứng biến mất trên giao diện
      if (postEl) {
         postEl.style.transition = "all 0.4s ease-out";
         postEl.style.opacity = "0";
         postEl.style.transform = "translateX(50px)";
         postEl.style.height = postEl.offsetHeight + 'px';

         setTimeout(() => {
            postEl.style.height = '0';
            postEl.style.margin = '0';
            postEl.style.padding = '0';
            postEl.style.overflow = 'hidden';

            setTimeout(() => {
               postEl.remove();
               if (serverFeedData.length === 0) renderPosts();
            }, 200);
         }, 400);
      }

      showToast('Đã xóa bài viết');

      // 4. Gửi Server (Chạy ngầm)
      try {
         const res = await sendToServer({
            action: 'feed_action',
            type: 'delete',
            id: postId
         });

         if (res.status !== 'success') {
            throw new Error(res.message || 'Lỗi từ server');
         }
      } catch (e) {
         console.error("Lỗi xóa post:", e);
         // 5. Hoàn tác nếu lỗi
         showToast('Lỗi kết nối! Đang khôi phục bài viết...');
         serverFeedData = originalFeedData;
         renderPosts();
      }

      // Reset biến tạm
      pendingDeleteId = null;
      pendingDeleteType = null;
      return;
   }
   // TRƯỜNG HỢP 2: XÓA TẤT CẢ THÔNG BÁO 
   if (pendingDeleteType === 'all-notifications') {
      const list = document.getElementById('notifications-list');
      const originalContent = list.innerHTML;

      // 1. UI Lạc quan (Xóa ngay)
      list.innerHTML = `
      				  <div class="text-center py-5">
      					<i class="bi bi-bell-slash theme-text-primary" style="font-size: 3rem;"></i>
      					<p class="fw-semibold mt-3">Chưa có thông báo</p>
      				  </div>
      				`;
      document.getElementById('notification-badge').classList.add('d-none');
      showToast('Đã xóa tất cả thông báo');

      // 2. Đóng Modal
      deleteConfirmModal.hide();

      // 3. Gửi Server
      try {
         const res = await sendToServer({
            action: 'notification_action',
            type: 'delete_all'
         });
         if (res.status === 'success') serverNotifications = [];
      } catch (e) {
         console.error(e);
         showToast('Lỗi kết nối! Đang hoàn tác...');
         list.innerHTML = originalContent;
      }

      // Reset biến tạm
      pendingDeleteId = null;
      pendingDeleteType = null;
      return;
   }
   // TRƯỜNG HỢP 3: XÓA BÌNH LUẬN (COMMENT)
   if (pendingDeleteType === 'comment') {
      const cmtId = pendingDeleteId;
      const commentItem = document.getElementById(`comment-${cmtId}`);

      // 1. Đóng Modal
      deleteConfirmModal.hide();

      // 2. UI Lạc quan: Ẩn comment ngay lập tức
      if (commentItem) {
         commentItem.style.transition = "all 0.3s ease";
         commentItem.style.opacity = "0";
         commentItem.style.height = "0";
         commentItem.style.margin = "0";
         commentItem.style.padding = "0";
         setTimeout(() => commentItem.remove(), 300);
      }

      // 3. Gửi Server (Chạy ngầm)
      try {
         const res = await sendToServer({
            action: 'comment_action',
            type: 'delete',
            commentId: cmtId,
            username: currentProfile.username
         });

         if (res.status !== 'success') {
            throw new Error("Lỗi từ server");
         }
      } catch (e) {
         console.error(e);
         showToast('Không thể xóa bình luận! Đang khôi phục...');
         // Nếu lỗi thì vẽ lại comment (hoặc reload) - ở đây reload cho đơn giản
         if (currentPostId) loadCommentsForPost(currentPostId);
      }

      // Reset biến tạm
      pendingDeleteId = null;
      pendingDeleteType = null;
      return;
   }

   // [THÊM MỚI] XÓA 1 THÔNG BÁO RIÊNG LẺ
   if (pendingDeleteType === 'notification_single') {
      const notifId = pendingDeleteId;
      const wrapBox = document.getElementById(`notif-wrap-${notifId}`);

      // 1. Đóng Modal
      deleteConfirmModal.hide();

      // 2. UI Lạc quan: Ẩn dòng thông báo đi
      if (wrapBox) {
         wrapBox.style.transition = 'height 0.3s, opacity 0.3s';
         wrapBox.style.height = '0px';
         wrapBox.style.opacity = '0';
         setTimeout(() => wrapBox.remove(), 300);
      }

      // 3. Xóa khỏi Cache cục bộ (để nếu đóng mở lại không bị hiện lại)
      const idx = serverNotifications.findIndex(n => n.__backendId === notifId);
      if (idx > -1) serverNotifications.splice(idx, 1);

      // 4. Gửi Server
      try {
         await sendToServer({ action: 'notification_action', type: 'delete_one', id: notifId });
      } catch (e) {
         console.error("Lỗi xóa notification:", e);
         showToast('Lỗi kết nối!');
         // Nếu muốn kỹ tính: Reload lại danh sách thông báo để khôi phục
      }

      // Reset biến tạm
      pendingDeleteId = null;
      pendingDeleteType = null;
      return;
   }
   // TRƯỜNG HỢP 4: CÁC LOẠI KHÁC -> LOGIC CŨ (Loading)
   showLoading();

   try {
      const item = allData.find(d => d.__backendId === pendingDeleteId);
      if (item) await window.dataSdk.delete(item);
      showToast('Đã xóa!');

   } catch (e) {
      console.error(e);
      showToast('Lỗi khi xóa!');
   } finally {
      hideLoading();
      deleteConfirmModal.hide();
      pendingDeleteId = null;
      pendingDeleteType = null;
   }
});


// --- 1. THÊM HÀM ĐỒNG BỘ SỐ LƯỢNG CHƯA ĐỌC ---
async function syncUnreadCount() {
   try {
      const res = await sendToServer({
         action: 'get_unread_count'
      });

      if (res.status === 'success') {
         const badge = document.getElementById('notification-badge');
         const count = res.count;

         if (count > 0) {
            // Nếu > 99 thì hiện 99+ cho gọn
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('d-none');

            // Hiệu ứng rung nhẹ để gây chú ý
            badge.style.animation = "none";
            setTimeout(() => badge.style.animation = "heartBeat 0.5s", 10);
         } else {
            badge.classList.add('d-none');
         }
      }
   } catch (e) {
      console.error("Lỗi lấy số lượng noti:", e);
   }
}


// --- HÀM CLICK: ĐỌC THÔNG BÁO & MỞ BÀI VIẾT 
async function handleNotificationClick(notifId) {
   console.log("Click notif:", notifId);

   // 1. Tìm phần tử trong DOM để lấy thông tin
   const el = document.querySelector(`#notif-wrap-${notifId} .notification-content-box`);

   // Lấy ID bài viết từ data attribute
   const postId = el ? el.getAttribute('data-post-id') : null;
   console.log("Target Post ID:", postId);

   // 2. UI LẠC QUAN: Đánh dấu là đã đọc ngay lập tức (đổi màu nền)
   if (el && el.classList.contains('unread')) {
      handleSwipeAction(notifId, 'read');
   }

   // 3. KIỂM TRA DỮ LIỆU
   if (!postId || postId === 'undefined' || postId === 'null' || postId === '') {
      return;
   }

   // --- BẮT ĐẦU QUY TRÌNH MỞ BÀI VIẾT ---

   // A. ĐÓNG MODAL THÔNG BÁO (Dùng cách mạnh nhất để đảm bảo đóng được)
   const modalEl = document.getElementById('notificationsModal');
   const modalInstance = bootstrap.Modal.getInstance(modalEl);
   if (modalInstance) {
      modalInstance.hide();
   } else {
      // Fallback nếu chưa lấy được instance
      new bootstrap.Modal(modalEl).hide();
   }
   // Xóa backdrop (màn hình đen) thủ công nếu nó bị kẹt
   document.querySelectorAll('.modal-backdrop').forEach(bd => bd.remove());
   document.body.classList.remove('modal-open');
   document.body.style = '';

   // B. CHUYỂN TAB SANG BẢNG TIN (FEED)
   const feedTabBtn = document.querySelector('[data-tab="feed"]');
   if (feedTabBtn) {
      feedTabBtn.click();
   }

   // C. TÌM VÀ CUỘN TỚI BÀI VIẾT
   setTimeout(async () => {
      let postEl = document.getElementById(`post-${postId}`);

      if (postEl) {
         // TRƯỜNG HỢP 1: Bài viết ĐANG CÓ trên màn hình -> Cuộn tới
         console.log("Bài viết đã có sẵn, cuộn tới...");
         postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
         highlightPost(postEl);
      } else {
         // TRƯỜNG HỢP 2: Bài viết KHÔNG CÓ (Bài cũ chưa load tới) -> Tải từ Server
         console.log("Bài viết chưa có, đang tải từ server...", postId);
         showToast('Đang tải bài viết liên quan...');

         try {
            // Gọi API lấy bài viết cụ thể
            const res = await sendToServer({
               action: 'get_feed',
               postId: postId,
               page: 1,
               limit: 1
            });

            if (res.status === 'success' && res.data && res.data.length > 0) {
               const postData = res.data[0];

               // Kiểm tra xem đã có chưa (tránh trùng lặp do mạng lag)
               const existIndex = serverFeedData.findIndex(p => p.__backendId === postData.__backendId);

               if (existIndex === -1) {
                  // Chèn vào đầu danh sách dữ liệu Feed
                  serverFeedData.unshift(postData);
                  // Vẽ lại Bảng tin ngay lập tức
                  renderPosts();
               }

               // Đợi 1 chút cho DOM vẽ xong rồi cuộn tới
               setTimeout(() => {
                  const newEl = document.getElementById(`post-${postId}`);
                  if (newEl) {
                     newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                     highlightPost(newEl);
                  } else {
                     showToast('Không thể hiển thị bài viết');
                  }
               }, 500);

            } else {
               showToast('Bài viết này có thể đã bị xóa');
            }
         } catch (e) {
            console.error("Lỗi tải bài viết:", e);
            showToast('Lỗi kết nối khi tải bài viết');
         }
      }
   }, 300);
}