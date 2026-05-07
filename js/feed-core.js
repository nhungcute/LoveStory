// --------------------------------------------------------------------------
// FEED STATE
// --------------------------------------------------------------------------
const feedState = {
    posts: [],
    postMap: new Map(),
    page: 1,
    limit: 20,
    isLoading: false,
    hasMore: true,
    observer: null,
    currentHashtag: '',
};

// --------------------------------------------------------------------------
// LOAD FEED
// --------------------------------------------------------------------------
async function loadFeed(reset = false) {
    if (feedState.isLoading) return;
    if (reset) {
        feedState.posts = [];
        feedState.postMap.clear();
        feedState.page = 1;
        feedState.hasMore = true;
        document.getElementById('feedList')?.replaceChildren();
        renderFeedSkeletons();
    }
    if (!feedState.hasMore) return;

    feedState.isLoading = true;
    try {
        const res = await sendToServer({
            action: 'get_feed',
            username: state.profile.username,
            page: feedState.page,
            limit: feedState.limit,
            hashtag: feedState.currentHashtag
        });
        const newPosts = (res.data || []);
        feedState.posts.push(...newPosts);
        newPosts.forEach(p => feedState.postMap.set(String(p.id), p));
        feedState.page++;
        if (newPosts.length < feedState.limit) feedState.hasMore = false;
        removeFeedSkeletons();
        renderFeedPosts(newPosts, reset);
    } catch (e) {
        removeFeedSkeletons();
        renderFeedError();
    } finally {
        feedState.isLoading = false;
    }

    setupInfiniteScrollFeed();
}

async function prefetchFeed() {
    if (feedState.isLoading || feedState._prefetched) return;
    feedState._prefetched = true;
    try {
        const res = await sendToServer({ action: 'get_feed', username: state.profile.username, page: 1, limit: feedState.limit }, true);
        const newPosts = (res.data || []);
        if (newPosts.length > 0) {
            feedState.posts = newPosts;
            feedState.postMap.clear();
            newPosts.forEach(p => feedState.postMap.set(String(p.id), p));
            feedState.page = 2;
            feedState.hasMore = newPosts.length >= feedState.limit;
            feedState._loaded = true;
            const feedEl = document.getElementById('feedList');
            if (feedEl && !feedEl.closest('.d-none')) {
                renderFeedPosts(newPosts, true);
            }
        }
    } catch (e) {
        feedState._prefetched = false;
        console.error('prefetchFeed failed', e);
    }
}

// --------------------------------------------------------------------------
// INFINITE SCROLL
// --------------------------------------------------------------------------
function setupInfiniteScrollFeed() {
    if (feedState.observer) feedState.observer.disconnect();
    const trigger = document.getElementById('feedLoadMoreTrigger');
    if (!trigger || !feedState.hasMore) return;
    feedState.observer = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting && !feedState.isLoading && feedState.hasMore) {
            await loadFeed(false);
        }
    }, { threshold: 0.1 });
    feedState.observer.observe(trigger);
}

// --------------------------------------------------------------------------
// SKELETONS / ERROR
// --------------------------------------------------------------------------
function renderFeedSkeletons(count = 3) {
    const list = document.getElementById('feedList');
    for (let i = 0; i < count; i++) {
        const sk = document.createElement('div');
        sk.className = 'post-card mb-2 skeleton-card';
        sk.innerHTML = `
            <div class="post-header d-flex align-items-center px-3 pt-3 pb-2 gap-2">
                <div class="skeleton-avatar rounded-circle"></div>
                <div class="flex-grow-1">
                    <div class="skeleton-line w-50 mb-1"></div>
                    <div class="skeleton-line w-25"></div>
                </div>
            </div>
            <div class="px-3 pb-3">
                <div class="skeleton-line w-100 mb-1"></div>
                <div class="skeleton-line w-75"></div>
            </div>`;
        list?.appendChild(sk);
    }
}

function removeFeedSkeletons() {
    document.querySelectorAll('.skeleton-card').forEach(el => el.remove());
}

function renderFeedError() {
    const list = document.getElementById('feedList');
    if (list) list.innerHTML = renderErrorState('Không tải được bài viết.', 'loadFeed(true)');
}
