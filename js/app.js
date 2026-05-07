/**
 * app.js
 * Core application logic: routing, gestures, theming, identity.
 */

// --------------------------------------------------------------------------
// GLOBAL STATE
// --------------------------------------------------------------------------
let state = {
    currentTab: 'tabHome',
    deviceFingerprint: null,
    profile: {
        username: 'Guest',
        fullname: 'Người yêu',
        theme: 'green',
        avaUrl: '',
        widgetPregnancy: true,
        widgetKick: true,
        widgetGold: true,
        devTools: false,
    },
    unreadCount: 0,
};

// --------------------------------------------------------------------------
// INITIALIZATION
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    console.log("LoveStory App Initializing...");
    // Setup core UI interactions
    setupBottomNavigation();
    setupPullToRefresh();
    setupSwipeToClose();

    // Identity & Theme
    await initDeviceIdentity();
    loadUserPreferences();
    applyTheme(state.profile.theme);
    updateProfileUI();

    // Wire up top bar buttons
    document.getElementById('btnProfile')?.addEventListener('click', () => openModal('profileModal'));
    document.getElementById('btnNotifications')?.addEventListener('click', () => openModal('notificationModal'));
    document.getElementById('btnSearch')?.addEventListener('click', () => openModal('aiSearchModal'));

    // Bootstrap modals: setup on-show hooks
    document.getElementById('notificationModal')?.addEventListener('show.bs.modal', loadNotifications);
    document.getElementById('profileModal')?.addEventListener('show.bs.modal', renderProfileModal);

    // Dev Tools (Eruda) toggle
    toggleEruda(state.profile.devTools);

    // Start listening to DOM to load first tab content
    switchTab('tabHome');

    // Setup pull-to-refresh for notification modal
    setupNotifPullToRefresh();

    // Prefetch data for other tabs in parallel (non-blocking) so they are instant when visited
    Promise.all([
        // Badge count
        fetchNotifBadge(),
        // Prefetch feed in background silently
        (async () => {
            try {
                if (typeof prefetchFeed === 'function') await prefetchFeed();
            } catch(e) {}
        })(),
        // Prefetch notifications list silently (for faster open)
        (async () => {
            try {
                if (typeof prefetchNotifications === 'function') await prefetchNotifications();
            } catch(e) {}
        })(),
        // Prefetch documents silently for AI autocomplete mapping
        (async () => {
            try {
                if (typeof loadDocuments === 'function') await loadDocuments();
            } catch(e) {}
        })(),
    ]).catch(() => {});
    // Refresh badge every 2 minutes
    setInterval(fetchNotifBadge, 2 * 60 * 1000);
});

// --------------------------------------------------------------------------
// NOTIFICATION BADGE PREFETCH
// --------------------------------------------------------------------------
async function fetchNotifBadge() {
    try {
        const res = await sendToServer({ action: 'get_unread_count' }, true);
        if (res && res.status === 'success') {
            updateNotificationBadge(res.count || 0);
        }
    } catch (e) {
        // Silent - badge will update naturally when notifications modal opens
    }
}

