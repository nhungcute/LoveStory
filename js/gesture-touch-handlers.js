/**
 * gesture-touch-handlers.js
 * Pull-to-refresh and swipe-to-close modal gestures.
 */

function setupPullToRefresh() {
    const mainContent = document.getElementById('mainContent');
    const indicator = document.getElementById('pullToRefreshIndicator');
    let startY = 0;
    let pulling = false;
    const THRESHOLD = 70;
    const MAX_PULL = 110;

    const CIRCUMFERENCE = 34.56; // 2π × r5.5

    function getArc() { return document.getElementById('ptrArc'); }
    function getSvg() { return document.getElementById('ptrSvg'); }

    function resetIndicator() {
        indicator.style.display = 'none';
        indicator.style.transform = 'translateX(-50%) translateY(-28px)';
        indicator.style.opacity = '0';
        const arc = getArc();
        if (arc) {
            arc.style.strokeDashoffset = String(CIRCUMFERENCE);
            arc.style.stroke = 'var(--theme-primary)';
        }
        getSvg()?.classList.remove('ptr-spinning');
    }

    mainContent.addEventListener('touchstart', (e) => {
        if (mainContent.scrollTop === 0) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });

    mainContent.addEventListener('touchmove', (e) => {
        if (!pulling) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > 8 && diff < MAX_PULL) {
            const slideY = Math.min(diff * 0.45, 48) - 48;
            indicator.style.display = 'block';
            indicator.style.transform = `translateX(-50%) translateY(${slideY}px)`;
            indicator.style.opacity = String(Math.min(diff / THRESHOLD, 1));

            // Fill arc proportionally — full circle at THRESHOLD
            const progress = Math.min(diff / THRESHOLD, 1);
            const isReady = progress >= 1;
            const arc = getArc();
            if (arc) {
                arc.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));
                arc.style.stroke = isReady ? 'var(--theme-primary)' : '#aaa';
            }
        } else if (diff <= 8) {
            resetIndicator();
        }
    }, { passive: true });

    mainContent.addEventListener('touchend', async (e) => {
        if (!pulling) return;
        const diff = e.changedTouches[0].clientY - startY;
        pulling = false;

        if (diff > THRESHOLD) {
            // Lock visible, switch to spinning loading style
            indicator.style.transform = 'translateX(-50%) translateY(4px)';
            indicator.style.opacity = '1';
            const arc = getArc();
            if (arc) {
                // Partial arc (75%) for spinner look
                arc.style.strokeDashoffset = String(CIRCUMFERENCE * 0.25);
                arc.style.stroke = 'var(--theme-primary)';
            }
            getSvg()?.classList.add('ptr-spinning');
            await onPullRefresh();
        }

        resetIndicator();
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
