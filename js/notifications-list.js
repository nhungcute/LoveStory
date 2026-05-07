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

    if (reset && !manualRefresh && notifState.items.length > 0) {
        const listEl = document.getElementById('notificationList');
        if (listEl && listEl.children.length === 0) {
            renderNotifications(notifState.items);
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
        const listEl = document.getElementById('notificationList');
        if (listEl) listEl.innerHTML = renderErrorState('Không tải được thông báo', 'loadNotifications(true, true)');
    } finally {
        notifState.isLoading = false;
        setupNotifInfiniteScroll();
    }
}

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
        notifState._prefetched = false;
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
        iconBg = '#1e3a8a';
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

            <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 me-3"
                 style="width: 44px; height: 44px; background-color: ${iconBg};">
                <i class="bi ${iconClass}"></i>
            </div>

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
