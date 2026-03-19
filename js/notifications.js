/**
 * notifications.js
 * Notification list: load, render, swipe-to-action (read/delete), mark all read, delete all.
 */

const notifState = {
    items: [],
    page: 1,
    limit: 20,
    isLoading: false,
    hasMore: true,
    observer: null,
    swipeEl: null,
};

async function loadNotifications(reset = true, manualRefresh = false) {
    if (notifState.isLoading) return;

    // Use cached data on opening (reset=true) if it's not a manual refresh
    if (reset && !manualRefresh && notifState.items.length > 0) {
        const listEl = document.getElementById('notificationList');
        if (listEl && listEl.children.length === 0) {
            renderNotifications(notifState.items);
            // Re-setup observer if we have more
            if (notifState.hasMore) setupNotifInfiniteScroll();
        }
        return;
    }

    if (reset) {
        notifState.items = [];
        notifState.page = 1;
        notifState.hasMore = true;
        const listEl = document.getElementById('notificationList');
        if (listEl) listEl.innerHTML = '';
        renderNotifSkeletons();
    }
    if (!notifState.hasMore) return;

    notifState.isLoading = true;
    try {
        const res = await sendToServer({
            action: 'get_notifications',
            username: state.profile.username,
            page: notifState.page,
            limit: notifState.limit
        });
        const items = res.data || [];
        notifState.items.push(...items);
        notifState.page++;
        if (items.length < notifState.limit) notifState.hasMore = false;
        removeNotifSkeletons();
        renderNotifications(items);
        updateNotificationBadge(res.unreadCount || 0);
    } catch (e) {
        removeNotifSkeletons();
        document.getElementById('notificationList').innerHTML = '<div class="text-muted text-center py-4">Không tải được thông báo</div>';
    } finally {
        notifState.isLoading = false;
        setupNotifInfiniteScroll();
    }
}

/**
 * Prefetch notifications into state cache so opening the modal is instant.
 */
async function prefetchNotifications() {
    if (notifState.isLoading || notifState._prefetched) return;
    notifState._prefetched = true;
    try {
        const res = await sendToServer({
            action: 'get_notifications',
            username: state.profile.username,
            page: 1,
            limit: notifState.limit
        }, true);
        const items = res.data || [];
        if (items.length > 0) {
            notifState.items = items;
            notifState.page = 2;
            notifState.hasMore = items.length >= notifState.limit;
        }
        if (res.unreadCount !== undefined) updateNotificationBadge(res.unreadCount);
    } catch(e) {
        notifState._prefetched = false; // Allow retry
    }
}


function renderNotifications(items) {
    const list = document.getElementById('notificationList');
    if (!list) return;
    if (items.length === 0 && notifState.page === 2) {
        list.innerHTML = `<div class="text-center py-5 text-muted">
            <i class="bi bi-bell-slash fs-1 d-block mb-2"></i>Chưa có thông báo nào.</div>`;
        return;
    }
    items.forEach(item => list.appendChild(createNotifItem(item)));
}

function createNotifItem(item) {
    const wrapper = document.createElement('div');
    wrapper.className = 'notif-row-wrapper';
    wrapper.dataset.notifId = item.id || item.__backendId;

    let iconClass = 'bi-bell-fill text-warning fs-5';
    let iconBg = '#fff3cd';

    if (item.action === 'like') {
        iconClass = 'bi-heart-fill text-danger fs-5';
        iconBg = '#f8f9fa';
    } else if (item.action === 'create_post') {
        iconClass = 'bi-pencil-square text-success fs-5';
        iconBg = '#f8f9fa';
    } else if (item.action === 'comment') {
        iconClass = 'bi-chat-fill text-primary fs-5';
        iconBg = '#f8f9fa';
    } else if (item.action === 'alert') {
        iconClass = 'bi-info text-white fs-4';
        iconBg = '#1e3a8a'; // Dark blue background similar to image
    }

    const timeDisplay = item.formattedTime || formatTimeSmart(item.time);
    const backendId = item.__backendId || item.id;
    let title = item.title || '';
    if (item.action === 'alert' && !title.includes('🔔')) {
        title += ' 🔔';
    }

    wrapper.innerHTML = `
        <div class="notif-action-bg">
            <button class="notif-action-btn border-0 text-white" 
                    style="background-color: #6c757d; width: 65px;" 
                    onclick="markNotifRead('${backendId}', true)">
                <i class="bi bi-envelope"></i>
            </button>
            <button class="notif-action-btn btn-delete border-0 text-white" 
                    style="background-color: #e53935; width: 65px;" 
                    onclick="deleteNotif('${backendId}')">
                <i class="bi bi-trash"></i>
            </button>
        </div>
        <div class="notif-content-box d-flex p-3 ${item.isRead ? '' : 'notif-unread'}" 
             id="notif-box-${backendId}"
             ontouchstart="startNotifSwipe(event, '${backendId}')"
             ontouchmove="moveNotifSwipe(event, '${backendId}')"
             ontouchend="endNotifSwipe(event, '${backendId}')">
             
            <!-- Circular Icon (Replaces Avatar) -->
            <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 me-3" 
                 style="width: 44px; height: 44px; background-color: ${iconBg};">
                <i class="bi ${iconClass}"></i>
            </div>
            
            <!-- Content Area -->
            <div class="flex-grow-1 overflow-hidden">
                <div class="text-truncate mb-1" style="font-size:0.9rem;">
                    <span class="fw-bold text-dark">${escapeHtml(item.fullname || item.username || '')}</span> 
                    <span class="text-dark">${escapeHtml(title)}</span>
                </div>
                <div class="text-muted mb-1" style="font-size:0.8rem;">
                    ${timeDisplay}
                </div>
                <div class="text-muted text-truncate" style="font-size:0.85rem;">
                    ${escapeHtml(item.message || item.content || '')}
                </div>
            </div>
        </div>`;
    return wrapper;
}

// Swipe-to-action logic for notifications
let notifSwipeStartX = {};
let currentOpenNotifId = null;

function startNotifSwipe(e, id) {
    if (currentOpenNotifId && currentOpenNotifId !== id) {
        const openBox = document.getElementById(`notif-box-${currentOpenNotifId}`);
        if (openBox) openBox.style.transform = 'translateX(0)';
        currentOpenNotifId = null;
    }
    notifSwipeStartX[id] = e.touches[0].clientX;
}

function moveNotifSwipe(e, id) {
    const diff = e.touches[0].clientX - (notifSwipeStartX[id] || 0);
    const box = document.getElementById(`notif-box-${id}`);
    if (!box) return;

    if (currentOpenNotifId === id) {
        if (diff > 0) {
            box.style.transform = `translateX(${Math.min(diff - 130, 0)}px)`;
        }
    } else {
        if (diff < 0) {
            box.style.transform = `translateX(${Math.max(diff, -130)}px)`;
        }
    }
}

function endNotifSwipe(e, id) {
    const diff = e.changedTouches[0].clientX - (notifSwipeStartX[id] || 0);
    const box = document.getElementById(`notif-box-${id}`);
    if (!box) return;

    if (currentOpenNotifId === id) {
        if (diff > 40) {
            box.style.transform = 'translateX(0)';
            currentOpenNotifId = null;
        } else {
            box.style.transform = 'translateX(-130px)';
        }
    } else {
        if (diff < -50) {
            box.style.transform = 'translateX(-130px)';
            currentOpenNotifId = id;
        } else {
            box.style.transform = 'translateX(0)';
        }
    }
}

function markNotifRead(id, singleItem = false) {
    // Optimistic Update UI
    const box = document.getElementById(`notif-box-${id}`);
    if (box) {
        box.style.transform = 'translateX(0)';
        if (box.classList.contains('notif-unread')) {
            box.classList.remove('notif-unread');
            updateNotificationBadge(Math.max(0, state.unreadCount - 1));
        }
    }
    if (currentOpenNotifId === id) currentOpenNotifId = null;

    // Send silently
    sendToServer({ action: 'notification_action', type: 'toggle_read', status: true, id, username: state.profile.username }, true).catch(e => console.error('mark read failed', e));
}

function deleteNotif(id) {
    // Optimistic Update UI
    const box = document.getElementById(`notif-box-${id}`);
    if (box && box.classList.contains('notif-unread')) {
        updateNotificationBadge(Math.max(0, state.unreadCount - 1));
    }

    const wrapper = document.querySelector(`.notif-row-wrapper[data-notif-id="${id}"]`);
    if (wrapper) wrapper.remove();

    if (currentOpenNotifId === id) currentOpenNotifId = null;

    // Show empty state if list is now empty
    const list = document.getElementById('notificationList');
    if (list && list.children.length === 0) {
        list.innerHTML = `<div class="text-center py-5 text-muted">
            <i class="bi bi-bell-slash fs-1 d-block mb-2"></i>Chưa có thông báo nào.</div>`;
    }

    // Send silently
    sendToServer({ action: 'notification_action', type: 'delete_one', id, username: state.profile.username }, true).catch(e => console.error('delete failed', e));
}

function markAllNotifRead() {
    // Optimistic Update UI
    document.querySelectorAll('.notif-unread').forEach(el => el.classList.remove('notif-unread'));
    updateNotificationBadge(0);
    currentOpenNotifId = null;

    // Send silently
    sendToServer({ action: 'notification_action', type: 'mark_all_read', username: state.profile.username }, true).catch(e => console.error('mark all failed', e));
}

async function deleteAllNotif() {
    const ok = await showConfirm('Bạn có chắc muốn xóa tất cả thông báo?', 'Xóa tất cả');
    if (!ok) return;

    // Optimistic Update UI
    const list = document.getElementById('notificationList');
    if (list) {
        list.innerHTML = `<div class="text-center py-5 text-muted">
            <i class="bi bi-bell-slash fs-1 d-block mb-2"></i>Chưa có thông báo nào.</div>`;
    }
    updateNotificationBadge(0);
    currentOpenNotifId = null;

    // Send silently
    sendToServer({ action: 'notification_action', type: 'delete_all', username: state.profile.username }, true).catch(e => console.error('delete all failed', e));
}

function renderNotifSkeletons() {
    const list = document.getElementById('notificationList');
    for (let i = 0; i < 4; i++) {
        const sk = document.createElement('div');
        sk.className = 'notif-content-box d-flex align-items-center gap-3 p-3 skeleton-card';
        sk.innerHTML = `<div class="skeleton-avatar rounded-circle"></div>
            <div class="flex-grow-1">
                <div class="skeleton-line w-75 mb-1"></div>
                <div class="skeleton-line w-50"></div>
            </div>`;
        list?.appendChild(sk);
    }
}
function removeNotifSkeletons() {
    document.querySelectorAll('#notificationList .skeleton-card').forEach(el => el.remove());
}

function setupNotifInfiniteScroll() {
    if (notifState.observer) notifState.observer.disconnect();
    const trigger = document.getElementById('notifLoadMoreTrigger');
    if (!trigger || !notifState.hasMore) return;
    notifState.observer = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting && !notifState.isLoading && notifState.hasMore) {
            await loadNotifications(false);
        }
    }, { threshold: 0.1 });
    notifState.observer.observe(trigger);
}

/**
 * Setup Pull-to-Refresh for the Notification Modal.
 */
function setupNotifPullToRefresh() {
    const modalBody = document.querySelector('#notificationModal .modal-body');
    const indicator = document.getElementById('notifPullIndicator');
    if (!modalBody || !indicator) return;

    let startY = 0;
    let pulling = false;
    const THRESHOLD = 70;
    const MAX_PULL = 100;

    modalBody.addEventListener('touchstart', (e) => {
        if (modalBody.scrollTop <= 0) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });

    modalBody.addEventListener('touchmove', (e) => {
        if (!pulling) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > 10 && diff < MAX_PULL) {
            indicator.style.display = 'block';
            const pullDistance = Math.min(diff * 0.5, 50);
            indicator.style.transform = `translateY(${pullDistance - 20}px)`;
            indicator.style.opacity = Math.min(diff / THRESHOLD, 1);
        }
    }, { passive: true });

    modalBody.addEventListener('touchend', async (e) => {
        if (!pulling) return;
        const diff = e.changedTouches[0].clientY - startY;
        pulling = false;
        if (diff > THRESHOLD) {
            indicator.style.opacity = '1';
            indicator.style.transform = 'translateY(10px)';
            await loadNotifications(true, true); // Force manual refresh
        }
        indicator.style.display = 'none';
        indicator.style.transform = 'translateY(-20px)';
        indicator.style.opacity = '0';
    }, { passive: true });
}

