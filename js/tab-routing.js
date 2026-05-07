/**
 * tab-routing.js
 * Bottom navigation, tab switching, and lazy tab content loading.
 */

function setupBottomNavigation() {
    const navLinks = document.querySelectorAll('.nav-tab-btn');
    const tabViews = document.querySelectorAll('.tab-view');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllModals();
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
