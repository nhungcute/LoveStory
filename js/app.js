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


// --------------------------------------------------------------------------
// ROUTING & NAVIGATION
// --------------------------------------------------------------------------
function setupBottomNavigation() {
    const navLinks = document.querySelectorAll('.nav-tab-btn');
    const tabViews = document.querySelectorAll('.tab-view');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllModals(); // Đóng tất cả modal khi chuyển tab
            const targetId = link.getAttribute('data-target');
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            tabViews.forEach(t => t.classList.add('d-none'));
            const targetView = document.getElementById(targetId);
            if (targetView) {
                targetView.classList.remove('d-none');
                state.currentTab = targetId;
                onTabChanged(targetId);
            }
        });
    });
}

function switchTab(tabId) {
    const navLink = document.querySelector(`.nav-tab-btn[data-target="${tabId}"]`);
    if (navLink) navLink.click();
}

function onTabChanged(tabId) {
    if (tabId === 'tabFeed') {
        if (feedState._loaded && feedState.posts.length > 0) {
            // Data already in state from prefetch or previous load — render directly
            const feedEl = document.getElementById('feedList');
            if (feedEl && feedEl.children.length === 0) {
                renderFeedPosts(feedState.posts, false);
                setupInfiniteScrollFeed();
            }
        } else if (!feedState._loaded) {
            feedState._loaded = true;
            loadFeed(true);
        }
    }
    if (tabId === 'tabHome' && !state._homeLoaded) {
        state._homeLoaded = true;
        renderHomeWidgets();
    }
    if (tabId === 'tabDocument' && !state._docLoaded) {
        state._docLoaded = true;
        renderDocumentTab();
    }
}

// --------------------------------------------------------------------------
// PULL TO REFRESH
// --------------------------------------------------------------------------
function setupPullToRefresh() {
    const mainContent = document.getElementById('mainContent');
    const indicator = document.getElementById('pullToRefreshIndicator');
    let startY = 0;
    let pulling = false;
    const THRESHOLD = 70;
    const MAX_PULL = 100;

    mainContent.addEventListener('touchstart', (e) => {
        if (mainContent.scrollTop === 0) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });

    mainContent.addEventListener('touchmove', (e) => {
        if (!pulling) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > 10 && diff < MAX_PULL) {
            const pullDistance = Math.min(diff * 0.5, 50);
            indicator.style.display = 'block';
            indicator.style.transform = `translateY(${pullDistance - 40}px)`;
            indicator.style.opacity = Math.min(diff / THRESHOLD, 1);
        }
    }, { passive: true });

    mainContent.addEventListener('touchend', async (e) => {
        if (!pulling) return;
        const diff = e.changedTouches[0].clientY - startY;
        pulling = false;
        if (diff > THRESHOLD) {
            indicator.style.transform = 'translateY(10px)';
            indicator.style.opacity = '1';
            await onPullRefresh();
        }
        indicator.style.display = 'none';
        indicator.style.transform = 'translateY(-40px)';
        indicator.style.opacity = '0';
    }, { passive: true });
}

async function onPullRefresh() {
    console.log("Pull to refresh triggered on:", state.currentTab);
    if (state.currentTab === 'tabFeed') {
        feedState._loaded = true;
        await loadFeed(true);
    }
    if (state.currentTab === 'tabHome') {
        state._homeLoaded = true;
        renderHomeWidgets();
    }
    if (state.currentTab === 'tabDocument') {
        state._docLoaded = true;
        renderDocumentTab();
    }
}

// --------------------------------------------------------------------------
// SWIPE-TO-CLOSE MODALS (Edge swipe from left)
// --------------------------------------------------------------------------
function setupSwipeToClose() {
    const EDGE_ZONE = 50;
    let startX = 0, startY = 0;

    document.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        const diffX = e.changedTouches[0].clientX - startX;
        const diffY = Math.abs(e.changedTouches[0].clientY - startY);
        const isHorizontalSwipe = diffX > 100 && diffY < 80;
        const isFromEdge = startX < EDGE_ZONE;

        if (isHorizontalSwipe && isFromEdge) {
            const openModal = document.querySelector('.modal.show');
            if (openModal) {
                const bsModal = bootstrap.Modal.getInstance(openModal);
                openModal.querySelector('.modal-dialog')?.classList.add('slide-out-right');
                setTimeout(() => {
                    bsModal?.hide();
                    openModal.querySelector('.modal-dialog')?.classList.remove('slide-out-right');
                }, 250);
            }
        }
    }, { passive: true });
}

// --------------------------------------------------------------------------
// DEVICE IDENTITY & FINGERPRINTING
// --------------------------------------------------------------------------
async function initDeviceIdentity() {
    let fp = localStorage.getItem('ls_device_fp');
    if (!fp) {
        const payload = navigator.userAgent + screen.width + screen.height + navigator.language;
        fp = await sha256(payload);
        localStorage.setItem('ls_device_fp', fp);
    }
    state.deviceFingerprint = fp;
    console.log("Device FP:", fp.substring(0, 8) + '...');
}

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --------------------------------------------------------------------------
// USER PREFERENCES & THEMING
// --------------------------------------------------------------------------
function loadUserPreferences() {
    const savedProfile = localStorage.getItem('ls_profile_data');
    if (savedProfile) {
        try { state.profile = { ...state.profile, ...JSON.parse(savedProfile) }; }
        catch (e) { console.error("Failed to parse local profile:", e); }
    }
}

function saveUserPreferences() {
    localStorage.setItem('ls_profile_data', JSON.stringify(state.profile));
}

function applyTheme(themeName) {
    const root = document.documentElement;
    const themes = {
        'green':  { primary: '#006B68', secondary: '#00524e' },
        'purple': { primary: '#605DEC', secondary: '#4c49cc' },
        'blue':   { primary: '#2D9CDB', secondary: '#2486c0' },
        'red':    { primary: '#EB5757', secondary: '#d34343' },
        'orange': { primary: '#F2994A', secondary: '#d17e33' },
        'pink':   { primary: '#E74C3C', secondary: '#c0392b' }
    };
    const colorSet = themes[themeName] || themes['green'];
    root.style.setProperty('--theme-primary', colorSet.primary);
    root.style.setProperty('--theme-secondary', colorSet.secondary);
    document.querySelector("meta[name=theme-color]")?.setAttribute("content", colorSet.primary);
    state.profile.theme = themeName;
}

function updateProfileUI() {
    const avatar = document.getElementById('topAvatar');
    const feedAva = document.getElementById('feedAva');
    const src = state.profile.avaUrl
        ? state.profile.avaUrl
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(state.profile.fullname)}&background=FFC62F&color=006B68&bold=true`;
    if (avatar) avatar.src = src;
    if (feedAva) feedAva.src = src;
}

// --------------------------------------------------------------------------
// ERUDA / VCONSOLE DEBUG TOOL
// --------------------------------------------------------------------------
function toggleEruda(enabled) {
    if (enabled) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/eruda@3/eruda.min.js';
        script.onload = () => eruda.init();
        document.body.appendChild(script);
    }
}

// --------------------------------------------------------------------------
// MODAL HELPER
// --------------------------------------------------------------------------
function closeAllModals() {
    const openModals = document.querySelectorAll('.modal.show');
    openModals.forEach(modalEl => {
        const instance = bootstrap.Modal.getInstance(modalEl);
        if (instance) instance.hide();
    });
}

function openModal(modalId) {
    closeAllModals(); // Đóng các modal khác trước khi mở
    const el = document.getElementById(modalId);
    if (el) bootstrap.Modal.getOrCreateInstance(el).show();
}

// --------------------------------------------------------------------------
// NOTIFICATION BADGE
// --------------------------------------------------------------------------
function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    state.unreadCount = count;
    if (count > 0) {
        badge.style.display = '';
        badge.textContent = count > 99 ? '99+' : count;
    } else {
        badge.style.display = 'none';
    }
}

// --------------------------------------------------------------------------
// CONFIRM MODAL HELPER
// --------------------------------------------------------------------------
function confirmAction(title, message, callback) {
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalBody').textContent = message;
    const btn = document.getElementById('btnConfirmAction');
    
    // Replace button to remove old event listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.onclick = () => {
        bootstrap.Modal.getInstance(document.getElementById('confirmModal')).hide();
        callback();
    };
    openModal('confirmModal');
}

