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
    const box = document.getElementById(`notif-box-${id}`);
    if (box) {
        box.style.transform = 'translateX(0)';
        if (box.classList.contains('notif-unread')) {
            box.classList.remove('notif-unread');
            updateNotificationBadge(Math.max(0, state.unreadCount - 1));
        }
    }
    if (currentOpenNotifId === id) currentOpenNotifId = null;

    sendToServer({ action: 'notification_action', type: 'toggle_read', status: true, id, username: state.profile.username }, true)
        .catch(e => console.error('mark read failed', e));
}

function deleteNotif(id) {
    const box = document.getElementById(`notif-box-${id}`);
    if (box && box.classList.contains('notif-unread')) {
        updateNotificationBadge(Math.max(0, state.unreadCount - 1));
    }

    const wrapper = document.querySelector(`.notif-row-wrapper[data-notif-id="${id}"]`);
    if (wrapper) wrapper.remove();

    if (currentOpenNotifId === id) currentOpenNotifId = null;

    const list = document.getElementById('notificationList');
    if (list && list.children.length === 0) {
        list.innerHTML = `<div class="text-center py-5 text-muted">
            <i class="bi bi-bell-slash fs-1 d-block mb-2"></i>Chưa có thông báo nào.</div>`;
    }

    sendToServer({ action: 'notification_action', type: 'delete_one', id, username: state.profile.username }, true)
        .catch(e => console.error('delete failed', e));
}

function markAllNotifRead() {
    document.querySelectorAll('.notif-unread').forEach(el => el.classList.remove('notif-unread'));
    updateNotificationBadge(0);
    currentOpenNotifId = null;

    sendToServer({ action: 'notification_action', type: 'mark_all_read', username: state.profile.username }, true)
        .catch(e => console.error('mark all failed', e));
}

async function deleteAllNotif() {
    const ok = await showConfirm('Bạn có chắc muốn xóa tất cả thông báo?', 'Xóa tất cả');
    if (!ok) return;

    const list = document.getElementById('notificationList');
    if (list) {
        list.innerHTML = `<div class="text-center py-5 text-muted">
            <i class="bi bi-bell-slash fs-1 d-block mb-2"></i>Chưa có thông báo nào.</div>`;
    }
    updateNotificationBadge(0);
    currentOpenNotifId = null;

    sendToServer({ action: 'notification_action', type: 'delete_all', username: state.profile.username }, true)
        .catch(e => console.error('delete all failed', e));
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
            await loadNotifications(true, true);
        }
        indicator.style.display = 'none';
        indicator.style.transform = 'translateY(-20px)';
        indicator.style.opacity = '0';
    }, { passive: true });
}
