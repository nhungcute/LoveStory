 

// --- 1. NÚT: ĐÁNH DẤU TẤT CẢ ĐÃ ĐỌC ---
document.getElementById('mark-all-read').addEventListener('click', async () => {
   const unreadItems = document.querySelectorAll('.notification-content-box.fw-semibold');
   
   unreadItems.forEach(el => {
      el.classList.remove('fw-semibold');
      const dot = el.querySelector('.notification-dot');
      if (dot) { 
          dot.className = "notification-dot ms-auto me-2 d-none"; 
          dot.style = "width: 8px; height: 8px; flex-shrink: 0;";
      }
      
      const wrap = el.closest('.notification-swipe-wrapper');
      if (wrap) {
          const swipeBtn = wrap.querySelector('.btn-toggle-read');
          if (swipeBtn) {
              swipeBtn.className = "notif-action-btn btn-toggle-read bg-secondary text-white";
              swipeBtn.innerHTML = '<i class="bi bi-envelope-fill"></i>';
          }
      }
   });

   const badge = document.getElementById('notification-badge');
   if (badge) badge.classList.add('d-none');

   if (typeof serverNotifications !== 'undefined' && serverNotifications.length > 0) {
       serverNotifications.forEach(n => n.isRead = true);
   }
   if (typeof allData !== 'undefined' && allData.length > 0) {
       allData.forEach(n => {
           if (n.type === 'notification') n.isRead = true;
       });
   }

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

// --- 2. NÚT: XÓA TẤT CẢ THÔNG BÁO ---
document.getElementById('clear-all-notifications').addEventListener('click', () => {
   showDeleteConfirm('Bạn có chắc muốn xóa sạch lịch sử thông báo không?', null, 'all-notifications');
});

// --- 3. NÚT CHUÔNG: MỞ MODAL THÔNG BÁO ---
document.getElementById('notification-btn').addEventListener('click', () => {
   if (typeof closeAllModals === 'function') closeAllModals();
   
   const modalEl = document.getElementById('notificationsModal');
   if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
   
   const badge = document.getElementById('notification-badge');
   if (badge) {
      badge.classList.add('d-none');
      badge.textContent = '0';
   }
   
   const container = document.getElementById('notifications-list');
   if (typeof serverNotifications !== 'undefined' && serverNotifications.length > 0) {
      container.innerHTML = '';
      renderNotificationsPaged(serverNotifications, container);
   } else {
      container.innerHTML = '<div class="d-flex justify-content-center align-items-center py-5"><div class="spinner-border text-primary" role="status"></div></div>';
   }
   loadNotifications(1, true);
});

// --- 4. HÀM: TẢI THÔNG BÁO TỪ SERVER ---
async function loadNotifications(page, forceRender = false) {
    if (notifLoading) return;

    const container = document.getElementById('notifications-list');
    const isModalVisible = document.getElementById('notificationsModal').classList.contains('show');
    const shouldRender = isModalVisible || forceRender;

    if (shouldRender && page === 1 && (!serverNotifications || serverNotifications.length === 0)) {
       container.innerHTML = '<div class="d-flex justify-content-center align-items-center py-5"><div class="spinner-border text-primary" role="status"></div></div>';
    }
 
    notifLoading = true;
    try {
       const res = await sendToServer({ action: 'get_notifications', page: page, limit: 10 });
 
       if (res.status === 'success') {
          notifHasMore = res.hasMore;
          const newData = Array.isArray(res.data) ? res.data : [];
 
          if (page === 1) {
             serverNotifications = newData;
          } else {
             serverNotifications = serverNotifications.concat(newData);
          }
 
          if (shouldRender) {
             if (page === 1) {
                container.innerHTML = ''; 
             } else {
                const oldTrigger = document.getElementById('notif-load-more');
                if (oldTrigger) oldTrigger.remove();
             }
             renderNotificationsPaged(newData, container);
          }
       }
    } catch (e) {
       console.error(e);
       if (shouldRender && page === 1) container.innerHTML = '<div class="text-center py-3 text-danger small">Lỗi kết nối</div>';
    } finally {
       notifLoading = false;
    }
}

// --- 5. HÀM: RENDER HTML THÔNG BÁO ---
function renderNotificationsPaged(newNotifs, container) {
   if (!serverNotifications || serverNotifications.length === 0) {
      container.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center py-5">
                <i class="bi bi-bell-slash text-muted" style="font-size: 3rem; opacity: 0.5;"></i>
                <p class="fw-semibold mt-3 text-muted">Không có thông báo nào</p>
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

      const isReadState = String(notif.isRead).toLowerCase() === 'true' || notif.isRead === 1;
      const fwClass = isReadState ? '' : 'fw-semibold'; 
      
      // Luôn giữ thẻ Div ở góc phải để duy trì cấu trúc, dùng class 'd-none' để ẩn nếu đã đọc
      const dotHtml = `<div class="notification-dot ms-auto me-2 ${isReadState ? 'd-none' : 'bg-danger rounded-circle'}" style="width: 8px; height: 8px; flex-shrink: 0;"></div>`;
      const toggleAction = isReadState ? 'unread' : 'read'; 
      const toggleIcon = isReadState ? 'envelope-fill' : 'envelope-open';
      const toggleColor = isReadState ? 'bg-secondary' : 'bg-success';

      const relatedPostId = notif.relatedId || notif.postId || '';
      const timeStr = (typeof formatTimeSmart === 'function') ? formatTimeSmart(notif.createdAt) : notif.formattedTime || 'Vừa xong';

      return `
            <div class="notification-swipe-wrapper list-group-item border-0 p-0" id="notif-wrap-${notif.__backendId}">
                <div class="notification-actions">
                    <button class="notif-action-btn btn-toggle-read ${toggleColor} text-white" onclick="handleSwipeAction('${notif.__backendId}', '${toggleAction}', event)">
                        <i class="bi bi-${toggleIcon}"></i>
                    </button>
                    <button class="notif-action-btn btn-delete-swipe bg-danger text-white" onclick="handleSwipeAction('${notif.__backendId}', 'delete', event)">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
                
                <div class="notification-content-box p-3 bg-white w-100 border-bottom ${fwClass}" 
                     style="position: relative; z-index: 2;"
                     data-id="${notif.__backendId}" 
                     data-post-id="${relatedPostId}"
                     onclick="if(typeof isSwiping !== 'undefined' && !isSwiping) handleNotificationClick('${notif.__backendId}')">
                    <div class="d-flex align-items-center pointer-event-none">
                        <div class="me-3 position-relative">
                             <div class="rounded-circle bg-light d-flex align-items-center justify-content-center" style="width: 40px; height: 40px;">
                                <i class="bi bi-${iconClass} fs-5"></i>
                             </div>
                        </div>
                        <div class="flex-grow-1" style="font-size: 0.9rem; line-height: 1.3;">
                            <div class="mb-1">
                                <span class="fw-bold">${notif.fullname || 'Hệ thống'}</span> 
                                <span class="text-dark">${notif.title || ''}</span>
                            </div>
                            <div class="text-muted small">${timeStr}</div>
                            ${notif.message ? `<div class="text-secondary small text-truncate mt-1" style="max-width: 220px;">${notif.message}</div>` : ''}
                        </div>
                        ${dotHtml}
                    </div>
                </div>
            </div>
        `;
   }).join('');

   container.insertAdjacentHTML('beforeend', html);

   if (typeof notifHasMore !== 'undefined' && notifHasMore) {
      const trigger = document.createElement('div');
      trigger.id = 'notif-load-more';
      trigger.className = 'py-3 text-center text-muted small';
      trigger.innerHTML = '<div class="spinner-border spinner-border-sm text-secondary" role="status"></div><span class="ms-2">Đang tải thêm...</span>';
      container.appendChild(trigger);

      const observer = new IntersectionObserver((entries) => {
         if (entries[0].isIntersecting && typeof notifLoading !== 'undefined' && !notifLoading) {
            notifPage++; 
            loadNotifications(notifPage);
         }
      }, { threshold: 0.1 });
      observer.observe(trigger);
   } else if (serverNotifications && serverNotifications.length > 5) {
      container.insertAdjacentHTML('beforeend', '<div class="text-center py-4 text-muted small bg-light mt-2">--- Hết thông báo ---</div>');
   }
}

// --- 6. HÀM: CONFIRM XÓA (Tổng hợp nhiều loại) ---
document.getElementById('confirm-delete').addEventListener('click', async () => {
   if (!pendingDeleteId && pendingDeleteType !== 'all-notifications') {
      const modal = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
      if(modal) modal.hide();
      return;
   }
   
   if (pendingDeleteType === 'post') {
      const postId = pendingDeleteId;
      const postEl = document.getElementById(`post-${postId}`);
      bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
      
      const originalFeedData = [...serverFeedData];
      const postIndex = serverFeedData.findIndex(p => p.__backendId === postId);
      if (postIndex > -1) serverFeedData.splice(postIndex, 1);
      
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
      try {
         const res = await sendToServer({ action: 'feed_action', type: 'delete', id: postId });
         if (res.status !== 'success') throw new Error(res.message || 'Lỗi từ server');
      } catch (e) {
         showToast('Lỗi kết nối! Đang khôi phục bài viết...');
         serverFeedData = originalFeedData;
         renderPosts();
      }
      pendingDeleteId = null; pendingDeleteType = null; return;
   }
   
   if (pendingDeleteType === 'all-notifications') {
      const list = document.getElementById('notifications-list');
      const originalContent = list.innerHTML;
      list.innerHTML = `<div class="text-center py-5"><i class="bi bi-bell-slash theme-text-primary" style="font-size: 3rem;"></i><p class="fw-semibold mt-3">Chưa có thông báo</p></div>`;
      document.getElementById('notification-badge').classList.add('d-none');
      showToast('Đã xóa tất cả thông báo');
      bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
      try {
         const res = await sendToServer({ action: 'notification_action', type: 'delete_all' });
         if (res.status === 'success') serverNotifications = [];
      } catch (e) {
         showToast('Lỗi kết nối! Đang hoàn tác...');
         list.innerHTML = originalContent;
      }
      pendingDeleteId = null; pendingDeleteType = null; return;
   }
   
   if (pendingDeleteType === 'comment') {
      const cmtId = pendingDeleteId;
      const commentItem = document.getElementById(`comment-${cmtId}`);
      bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
      if (commentItem) {
         commentItem.style.transition = "all 0.3s ease";
         commentItem.style.opacity = "0";
         commentItem.style.height = "0";
         commentItem.style.margin = "0";
         commentItem.style.padding = "0";
         setTimeout(() => commentItem.remove(), 300);
      }
      try {
         const res = await sendToServer({ action: 'comment_action', type: 'delete', commentId: cmtId, username: currentProfile.username });
         if (res.status !== 'success') throw new Error("Lỗi từ server");
      } catch (e) {
         showToast('Không thể xóa bình luận! Đang khôi phục...');
         if (typeof currentPostId !== 'undefined') loadCommentsForPost(currentPostId);
      }
      pendingDeleteId = null; pendingDeleteType = null; return;
   }

   if (pendingDeleteType === 'notification_single') {
      const notifId = pendingDeleteId;
      const wrapBox = document.getElementById(`notif-wrap-${notifId}`);
      bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
      if (wrapBox) {
         wrapBox.style.transition = 'height 0.3s, opacity 0.3s';
         wrapBox.style.height = '0px';
         wrapBox.style.opacity = '0';
         setTimeout(() => wrapBox.remove(), 300);
      }
      const idx = serverNotifications.findIndex(n => n.__backendId === notifId);
      if (idx > -1) serverNotifications.splice(idx, 1);
      try {
         await sendToServer({ action: 'notification_action', type: 'delete_one', id: notifId });
      } catch (e) {
         showToast('Lỗi kết nối!');
      }
      pendingDeleteId = null; pendingDeleteType = null; return;
   }
   
   showLoading();
   try {
      const item = allData.find(d => d.__backendId === pendingDeleteId);
      if (item) await window.dataSdk.delete(item);
      showToast('Đã xóa!');
   } catch (e) {
      showToast('Lỗi khi xóa!');
   } finally {
      hideLoading();
      bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
      pendingDeleteId = null; pendingDeleteType = null;
   }
});

// --- 7. HÀM: ĐỒNG BỘ SỐ LƯỢNG CHƯA ĐỌC LÊN CHUÔNG ---
async function syncUnreadCount() {
   try {
      const res = await sendToServer({ action: 'get_unread_count' });
      if (res.status === 'success') {
         const badge = document.getElementById('notification-badge');
         const count = res.count;
         if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('d-none');
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

// --- 8. HÀM: CLICK VÀO 1 THÔNG BÁO -> MỞ BÀI VIẾT ---
async function handleNotificationClick(notifId) {
   const el = document.querySelector(`#notif-wrap-${notifId} .notification-content-box`);
   const postId = el ? el.getAttribute('data-post-id') : null;

   if (el && el.classList.contains('fw-semibold')) {
      el.classList.remove('fw-semibold');
      const dot = el.querySelector('.notification-dot');
      if (dot) {
          // Chỉ thêm class d-none để ẩn, giữ nguyên vị trí
          dot.className = "notification-dot ms-auto me-2 d-none";
          dot.style = "width: 8px; height: 8px; flex-shrink: 0;";
      }

      if (typeof serverNotifications !== 'undefined') {
          const n = serverNotifications.find(x => x.__backendId === notifId);
          if (n) n.isRead = true; 
      }

      if (typeof handleSwipeAction === 'function') {
          handleSwipeAction(notifId, 'read');
      } else {
          sendToServer({ action: 'notification_action', type: 'toggle_read', id: notifId, status: true }).catch(e=>e);
      }
   }

   if (!postId || postId === 'undefined' || postId === 'null' || postId === '') return;

   const modalEl = document.getElementById('notificationsModal');
   const modalInstance = bootstrap.Modal.getInstance(modalEl);
   if (modalInstance) modalInstance.hide();
   else new bootstrap.Modal(modalEl).hide();
   
   document.querySelectorAll('.modal-backdrop').forEach(bd => bd.remove());
   document.body.classList.remove('modal-open');
   document.body.style = '';

   const feedTabBtn = document.querySelector('[data-tab="feed"]');
   if (feedTabBtn) feedTabBtn.click();

   setTimeout(async () => {
      let postEl = document.getElementById(`post-${postId}`);
 
      if (postEl) {
         postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
         if (typeof highlightPost === 'function') highlightPost(postEl);
      } else {
         showToast('Đang tải bài viết liên quan...');
         try {
            const res = await sendToServer({ action: 'get_feed', postId: postId, page: 1, limit: 1 });
            if (res.status === 'success' && res.data && res.data.length > 0) {
               const postData = res.data[0];
               const existIndex = serverFeedData.findIndex(p => p.__backendId === postData.__backendId);

               if (existIndex === -1) {
                  serverFeedData.unshift(postData);
                  if (typeof currentHashFilter !== 'undefined' && !currentHashFilter) {
                        if (typeof smartSyncFeed === 'function') smartSyncFeed(serverFeedData.slice(0, 5)); 
                        else renderPosts(); 
                  } else {
                        renderPosts();
                  }
               }

               setTimeout(() => {
                  const newEl = document.getElementById(`post-${postId}`);
                  if (newEl) {
                     newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                     if (typeof highlightPost === 'function') highlightPost(newEl);
                  } else showToast('Không thể hiển thị bài viết');
               }, 500);
            } else showToast('Bài viết này có thể đã bị xóa');
         } catch (e) {
            showToast('Lỗi kết nối khi tải bài viết');
         }
      }
   }, 300);
}

// --- 9. HÀM: XỬ LÝ SWIPE (VUỐT THÔNG BÁO) ---
window.handleSwipeAction = async function(notifId, action, currentEvent) {
    // 1. Chặn click lọt xuống bài viết
    if (currentEvent) {
        currentEvent.preventDefault();
        currentEvent.stopPropagation();
    }

    window.isSwiping = true;
    setTimeout(() => { window.isSwiping = false; }, 300);
    
    // 2. Kéo thông báo đóng lại ngay lập tức
    const contentBox = document.querySelector(`#notif-wrap-${notifId} .notification-content-box`);
    if (contentBox) contentBox.style.transform = 'translateX(0)';

    if (action === 'delete') {
        pendingDeleteId = notifId;
        pendingDeleteType = 'notification_single';
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteConfirmModal'));
        modal.show();
        return;
    }

    if (action === 'read' || action === 'unread') {
        const isReading = (action === 'read'); 
        
        // 3. CẬP NHẬT GIAO DIỆN CHẤM ĐỎ NGAY LẬP TỨC
        if (contentBox) {
            let dotContainer = contentBox.querySelector('.notification-dot');
            
            if (isReading) {
                // ĐÁNH DẤU ĐÃ ĐỌC
                contentBox.classList.remove('fw-semibold');
                if (dotContainer) {
                    dotContainer.className = "notification-dot ms-auto me-2 d-none";
                    dotContainer.style.setProperty('display', 'none', 'important');
                }
            } else {
                // ĐÁNH DẤU CHƯA ĐỌC
                contentBox.classList.add('fw-semibold');
                
                if (!dotContainer) {
                    const flexBox = contentBox.querySelector('.d-flex.align-items-center');
                    if (flexBox) {
                        flexBox.insertAdjacentHTML('beforeend', '<div class="notification-dot ms-auto me-2 bg-danger rounded-circle" style="width: 8px; height: 8px; flex-shrink: 0; display: block !important;"></div>');
                    }
                } else {
                    dotContainer.className = "notification-dot ms-auto me-2 bg-danger rounded-circle";
                    dotContainer.style.setProperty('display', 'block', 'important');
                    dotContainer.style.width = "8px";
                    dotContainer.style.height = "8px";
                }
            }
        }

        // 4. [SỬA LỖI TRIỆT ĐỂ]: XÓA NÚT CŨ, THAY BẰNG NÚT MỚI TINH
        const actionBtn = document.querySelector(`#notif-wrap-${notifId} .btn-toggle-read`);
        if (actionBtn) {
            const nextAction = isReading ? 'unread' : 'read';
            const nextColor = isReading ? 'bg-secondary' : 'bg-success';
            const nextIcon = isReading ? 'envelope-fill' : 'envelope-open';
            
            // Dùng outerHTML để thay máu hoàn toàn phần tử này.
            // Nhờ đó HTML và sự kiện onclick luôn là một bản thể mới, không bao giờ bị kẹt lại lỗi cũ.
            actionBtn.outerHTML = `
                <button class="notif-action-btn btn-toggle-read ${nextColor} text-white" onclick="handleSwipeAction('${notifId}', '${nextAction}', event)">
                    <i class="bi bi-${nextIcon}"></i>
                </button>
            `;
        }

        // 5. CẬP NHẬT RAM & GỬI API SERVER
        if (typeof serverNotifications !== 'undefined') {
            const notif = serverNotifications.find(n => n.__backendId === notifId);
            if (notif) notif.isRead = isReading;
        }
        
        if (typeof allData !== 'undefined') {
            const n2 = allData.find(x => x.__backendId === notifId);
            if (n2) n2.isRead = isReading;
        }

        if (typeof syncUnreadCount === 'function') syncUnreadCount(); 
        
        try {
            sendToServer({ action: 'notification_action', type: 'toggle_read', id: notifId, status: isReading }).catch(e=>e);
        } catch (e) {
            console.error("Lỗi đồng bộ đọc/chưa đọc:", e);
        }
    }
};

// --- 10. HÀM: BẮT SỰ KIỆN CẢM ỨNG (TOUCH) ĐỂ VUỐT TRÊN MOBILE ---
window.isSwiping = false; 
let swipeStartX = 0;
let swipeCurrentX = 0;
let swipingElement = null;

document.addEventListener('touchstart', e => {
    // [SỬA LỖI TẠI ĐÂY] Nếu đang bấm vào vùng nút (actions) thì bỏ qua, không thu thẻ về
    if (e.target.closest('.notification-actions')) {
        return;
    }

    const box = e.target.closest('.notification-content-box');
    if (!box) {
        document.querySelectorAll('.notification-content-box').forEach(el => el.style.transform = 'translateX(0)');
        return;
    }
    document.querySelectorAll('.notification-content-box').forEach(el => {
        if (el !== box) el.style.transform = 'translateX(0)';
    });
    swipeStartX = e.touches[0].clientX;
    swipingElement = box;
    window.isSwiping = false;
    box.style.transition = 'none'; 
}, {passive: true});

document.addEventListener('touchmove', e => {
    if (!swipingElement) return;
    swipeCurrentX = e.touches[0].clientX;
    const diffX = swipeCurrentX - swipeStartX;
    if (Math.abs(diffX) > 10) window.isSwiping = true; 
    if (diffX < 0 && diffX > -140) swipingElement.style.transform = `translateX(${diffX}px)`;
}, {passive: true});

document.addEventListener('touchend', e => {
    if (!swipingElement) return;
    swipingElement.style.transition = 'transform 0.3s ease-out'; 
    const diffX = swipeCurrentX - swipeStartX;
    if (diffX < -50) swipingElement.style.transform = `translateX(-120px)`; 
    else swipingElement.style.transform = `translateX(0)`;
    setTimeout(() => { window.isSwiping = false; }, 300);
    swipingElement = null;
});