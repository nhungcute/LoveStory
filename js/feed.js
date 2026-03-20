/**
 * feed.js
 * Handles the Newsfeed tab: loading posts, rendering, pagination (infinite scroll),
 * image grid layouts, like, comment, and create post functionality.
 */

// --------------------------------------------------------------------------
// FEED STATE
// --------------------------------------------------------------------------
const feedState = {
    posts: [],
    page: 1,
    limit: 20,
    isLoading: false,
    hasMore: true,
    observer: null,
    currentHashtag: '', // Active hashtag filter
};

// --------------------------------------------------------------------------
// LOAD FEED
// --------------------------------------------------------------------------
async function loadFeed(reset = false) {
    if (feedState.isLoading) return;
    if (reset) {
        feedState.posts = [];
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

/**
 * Prefetch feed data into state without rendering to DOM.
 * When user switches to Feed tab, onTabChanged detects _loaded=true and renders from state.
 */
async function prefetchFeed() {
    if (feedState.isLoading || feedState._prefetched) return;
    feedState._prefetched = true;
    try {
        const res = await sendToServer({ action: 'get_feed', username: state.profile.username, page: 1, limit: feedState.limit }, true);
        const newPosts = (res.data || []);
        if (newPosts.length > 0) {
            feedState.posts = newPosts;
            feedState.page = 2;
            feedState.hasMore = newPosts.length >= feedState.limit;
            feedState._loaded = true; // Signal onTabChanged that data is ready
            // Render if the feed tab is already visible
            const feedEl = document.getElementById('feedList');
            if (feedEl && !feedEl.closest('.d-none')) {
                renderFeedPosts(newPosts, true);
            }
        }
    } catch (e) {
        feedState._prefetched = false; // Allow retry
        console.error('prefetchFeed failed', e);
    }
}


// --------------------------------------------------------------------------
// RENDER POSTS
// --------------------------------------------------------------------------
function renderFeedPosts(posts, reset = false) {
    const list = document.getElementById('feedList');
    if (!list) return;
    posts.forEach(post => {
        const card = createPostCard(post);
        list.appendChild(card);
    });
    if (!feedState.hasMore) {
        const end = document.createElement('div');
        end.className = 'text-center text-muted py-4 small';
        end.textContent = '— Hết bài viết —';
        list.appendChild(end);
    }
}

function createPostCard(post) {
    const div = document.createElement('div');
    div.className = 'post-card mb-2';
    div.dataset.postId = post.id;

    // Filter media into images and videos
    const allMedia = parseJSON(post.imageURLs, []);
    let images = [];
    let videos = [];
    allMedia.forEach(item => {
        const url = (typeof item === 'string') ? item : (item.url || '');
        const type = (typeof item === 'object' && item.type) ? item.type : (url.match(/\.(mp4|webm|ogg)$/i) ? 'video' : 'image');

        if (type === 'video') videos.push(url);
        else images.push(item);
    });

    const layout = post.layout || 'solo';
    const contentHtml = formatPostContent(post.content || '');
    const timeStr = formatTimeSmart(post.createdAt);
    const likeCount = parseInt(post.likeCount || 0);
    const commentCount = parseInt(post.commentCount || 0);
    // Robust check for liked state
    const likedUsers = (post.likedBy || '').split(',').map(u => u.trim());
    const isLiked = likedUsers.includes(state.profile.username);

    // Initial Comments Render (up to 2 latest comments)
    let initialCommentsHtml = '';
    const commentsData = post.commentsData || [];
    if (commentsData.length > 0) {
        // Assume commentsData is sorted older to newer by backend
        const recentComments = commentsData.slice(-2);
        initialCommentsHtml = recentComments.map(c => renderCommentHtml(c, post.id)).join('');

        if (commentsData.length > 2) {
            initialCommentsHtml = `<div class="mb-2"><button class="btn btn-sm btn-link p-0 text-muted" onclick="loadComments('${post.id}')" style="font-size:0.8rem;text-decoration:none;">Tải thêm bình luận (${commentsData.length - 2})</button></div>` + initialCommentsHtml;
        }
    }

    div.innerHTML = `
        <div class="post-header d-flex align-items-center px-3 pt-3 pb-2 gap-2">
            <img src="${post.avaUrl || post.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.fullname || 'U')}&background=FFC62F&color=006B68&bold=true`}"
                 class="rounded-circle post-avatar" width="42" height="42" style="object-fit:cover;">
            <div class="flex-grow-1">
                <div class="fw-semibold d-flex align-items-center gap-1" style="font-size:0.95rem;">
                    ${escapeHtml(post.fullname || post.username || 'Người dùng')}
                    <i class="bi bi-patch-check-fill theme-text-primary" style="font-size:0.8rem;"></i>
                </div>
                <div class="text-muted post-timestamp" data-timestamp="${post.createdAt}" style="font-size:0.78rem;">${timeStr}</div>
            </div>
            <div class="dropdown">
                <button class="btn btn-link text-muted p-0" data-bs-toggle="dropdown">
                    <i class="bi bi-three-dots"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                    <li><a class="dropdown-item" href="#" onclick="openEditPost('${post.id}'); return false;"><i class="bi bi-pencil me-2"></i>Chỉnh sửa</a></li>
                    <li><a class="dropdown-item text-danger" href="#" onclick="confirmDeletePost('${post.id}'); return false;"><i class="bi bi-trash me-2"></i>Xóa bài</a></li>
                </ul>
            </div>
        </div>
        ${contentHtml ? `<div class="post-content px-3 pb-2" style="white-space:pre-wrap;line-height:1.5;">${contentHtml}</div>` : ''}
        ${videos.length > 0 ? `<div class="post-videos mb-1 px-1 flex-column d-flex gap-2">
            ${videos.map((vUrl, idx) => {
        const driveMatch = vUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) || vUrl.match(/file\/d\/([a-zA-Z0-9_-]+)/);
        const driveId = driveMatch ? driveMatch[1] : null;
        const thumbUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w400` : '';
        const globalIdx = images.length + idx;
        return `
                    <div class="w-100 rounded overflow-hidden video-thumb-card"
                         style="background:#111; min-height:200px; position:relative; overflow:hidden; cursor:pointer;"
                         onclick="openImageViewer('${post.id}', ${globalIdx})">
                        ${thumbUrl ? `<img src="${thumbUrl}"
                             style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;"
                             onerror="this.remove()" alt="video thumbnail">` : ''}
                        <div style="position:absolute;top:0;left:0;width:100%;height:100%;
                                    background:rgba(0,0,0,0.3);
                                    display:flex;flex-direction:column;align-items:center;justify-content:center;">
                            <div style="width:60px;height:60px;border-radius:50%;
                                        background:rgba(255,255,255,0.25);
                                        display:flex;align-items:center;justify-content:center;
                                        backdrop-filter:blur(5px);">
                                <i class="bi bi-play-fill" style="font-size:40px;color:white;margin-left:4px;"></i>
                            </div>
                            <span class="mt-2 text-white-50 small font-monospace">VIDEO</span>
                        </div>
                    </div>`;
    }).join('')}
        </div>` : ''}
        ${images.length > 0 ? `<div class="post-images">${buildImageGrid(images, post.id, layout)}</div>` : ''}
        <div class="post-actions d-flex gap-4 px-3 py-2 border-top border-bottom" style="border-color:#f0f0f0!important;">
            <button class="btn btn-sm btn-link p-0 text-decoration-none like-btn ${isLiked ? 'liked' : 'text-muted'}" 
                    onclick="toggleLike('${post.id}', this)" data-post-id="${post.id}">
                <i class="bi ${isLiked ? 'bi-heart-fill' : 'bi-heart'} me-1"></i>
                <span class="like-count">${likeCount > 0 ? likeCount : ''}</span>
                <span class="like-label">${likeCount > 0 ? '' : 'Thích'}</span>
            </button>
            <button class="btn btn-sm btn-link p-0 text-muted text-decoration-none" onclick="toggleCommentBox('${post.id}')">
                <i class="bi bi-chat me-1"></i> ${commentCount > 0 ? commentCount : 'Bình luận'}
            </button>
        </div>
        <div class="comment-section px-3 pb-2" id="comments-${post.id}" style="${commentsData.length > 0 ? 'display:block;' : 'display:none;'}">
            <div class="comment-list mb-2 mt-2" id="comment-list-${post.id}">${initialCommentsHtml}</div>
            <div class="d-flex gap-2 mt-1 align-items-center">
                <img src="${state.profile.avaUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(state.profile.fullname || 'U')}&background=FFC62F&color=006B68&bold=true`}"
                     class="rounded-circle" width="32" height="32" style="object-fit:cover;">
                <input type="text" class="form-control form-control-sm rounded-pill comment-input" id="comment-input-${post.id}"
                       placeholder="Viết bình luận..." onkeydown="if(event.key==='Enter') submitComment('${post.id}')">
                <button class="btn btn-sm btn-link p-0 theme-text-primary" onclick="submitComment('${post.id}')">
                    <i class="bi bi-send-fill"></i>
                </button>
            </div>
        </div>
    `;
    return div;
}

// --------------------------------------------------------------------------
// IMAGE GRID LAYOUTS
// --------------------------------------------------------------------------
function buildImageGrid(images, postId, layout) {
    if (images.length === 0) return '';
    
    if (!document.getElementById('layout-scroll-style')) {
        const style = document.createElement('style');
        style.id = 'layout-scroll-style';
        style.textContent = '.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }';
        document.head.appendChild(style);
    }

    if (images.length === 1) {
        return `<div class="d-flex justify-content-center w-100">${imgTag(images[0], postId, 0, 'w-100 h-100 object-fit-cover rounded')}</div>`;
    }

    if (layout === 'grid') {
        if (images.length === 2) {
            return `<div class="d-flex w-100" style="gap: 2px;">
                <div style="flex: 1; aspect-ratio: 1/1;">${imgTag(images[0], postId, 0, 'w-100 h-100 object-fit-cover rounded-start')}</div>
                <div style="flex: 1; aspect-ratio: 1/1;">${imgTag(images[1], postId, 1, 'w-100 h-100 object-fit-cover rounded-end')}</div>
            </div>`;
        }
        if (images.length === 3) {
            return `<div class="d-flex w-100" style="gap: 2px;">
                <div style="flex: 1; aspect-ratio: 1/1;">${imgTag(images[0], postId, 0, 'w-100 h-100 object-fit-cover rounded-start')}</div>
                <div style="flex: 1; aspect-ratio: 1/1;">${imgTag(images[1], postId, 1, 'w-100 h-100 object-fit-cover')}</div>
                <div style="flex: 1; aspect-ratio: 1/1;">${imgTag(images[2], postId, 2, 'w-100 h-100 object-fit-cover rounded-end')}</div>
            </div>`;
        }
        if (images.length === 4) {
            return `<div class="d-flex flex-wrap w-100 rounded overflow-hidden" style="gap: 2px;">
                ${images.map((img, i) => `<div style="flex: 0 0 calc(50% - 1px); aspect-ratio: 1/1;">${imgTag(img, postId, i, 'w-100 h-100 object-fit-cover')}</div>`).join('')}
            </div>`;
        }
        // > 4 images (grid 2x2 wrapping with +N overlay)
        const firstThree = images.slice(0, 3);
        const fourth = images[3];
        const extraCount = images.length - 4;
        return `<div class="d-flex flex-wrap w-100 rounded overflow-hidden" style="gap: 2px;">
            ${firstThree.map((img, i) => `<div style="flex: 0 0 calc(50% - 1px); aspect-ratio: 1/1;">${imgTag(img, postId, i, 'w-100 h-100 object-fit-cover')}</div>`).join('')}
            <div style="flex: 0 0 calc(50% - 1px); aspect-ratio: 1/1; position: relative; cursor: pointer;">
                ${imgTag(fourth, postId, 3, 'w-100 h-100 object-fit-cover')}
                <div style="position: absolute; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.5); color: white; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold; pointer-events: none;">
                    +${extraCount}
                </div>
            </div>
        </div>`;
    }
    else if (layout === 'top-bottom') {
        const rest = images.slice(1);
        return `<div class="d-flex flex-column w-100 rounded overflow-hidden" style="gap: 2px;">
            <div style="width: 100%; aspect-ratio: 16/9;">${imgTag(images[0], postId, 0, 'w-100 h-100 object-fit-cover')}</div>
            <div class="d-flex w-100 hide-scrollbar" style="gap: 2px; overflow-x: auto; scroll-snap-type: x mandatory;">
                ${rest.map((img, i) => `<div style="flex: ${rest.length >= 3 ? '0 0 calc(33.333% - 1.34px)' : '1'}; scroll-snap-align: start; aspect-ratio: 1/1;">${imgTag(img, postId, i + 1, 'w-100 h-100 object-fit-cover')}</div>`).join('')}
            </div>
        </div>`;
    }
    else if (layout === 'left-right') {
        const rest = images.slice(1);
        return `<div class="d-flex w-100 rounded overflow-hidden" style="gap: 2px; aspect-ratio: 4/5;">
            <div style="width: calc(50% - 1px); height: 100%;">
                ${imgTag(images[0], postId, 0, 'w-100 h-100 object-fit-cover')}
            </div>
            <div class="d-flex flex-column hide-scrollbar" style="width: calc(50% - 1px); gap: 2px; height: 100%; overflow-y: auto; scroll-snap-type: y mandatory;">
                ${rest.map((img, i) => `<div style="flex: ${rest.length >= 3 ? '0 0 calc(33.333% - 1.34px)' : '1'}; scroll-snap-align: start;">${imgTag(img, postId, i + 1, 'w-100 h-100 object-fit-cover')}</div>`).join('')}
            </div>
        </div>`;
    }

    // Default Fallbacks for auto or older posts
    // Always side-by-side for exactly 2 images
    if (images.length === 2) {
        return `<div class="d-flex w-100" style="gap:2px;">
            <div style="flex:1;min-width:0;aspect-ratio:1/1;">${imgTag(images[0], postId, 0, 'w-100 h-100 object-fit-cover')}</div>
            <div style="flex:1;min-width:0;aspect-ratio:1/1;">${imgTag(images[1], postId, 1, 'w-100 h-100 object-fit-cover')}</div>
        </div>`;
    }
    if (images.length === 3) {
        return `<div class="grid-three">
            <div class="grid-main">${imgTag(images[0], postId, 0)}</div>
            <div class="grid-side">${imgTag(images[1], postId, 1)}${imgTag(images[2], postId, 2)}</div>
        </div>`;
    }
    if (images.length === 4) {
        return `<div class="grid-four">${images.map((img, i) => imgTag(img, postId, i)).join('')}</div>`;
    }
    // 5+ images: mosaic (first big + rest scroll)
    const rest = images.slice(1);
    return `<div class="grid-mosaic">
        <div class="grid-mosaic-main">${imgTag(images[0], postId, 0)}</div>
        <div class="grid-mosaic-strip">${rest.map((img, i) => imgTag(img, postId, i + 1)).join('')}</div>
    </div>`;
}

function imgTag(imgObj, postId, index, customClass = 'grid-img') {
    // Extract url whether imgObj is an object ({type, url}) or just a string
    const url = (typeof imgObj === 'string') ? imgObj : (imgObj.url ? imgObj.url : '');

    // Use smaller preview for feed, but robustly handle different suffix patterns
    const previewUrl = url.includes('lh3.googleusercontent.com')
        ? url.replace(/=s\d+$/, '=s400') // Force s400 for feed thumbnails
        : url;
    return `<img src="${previewUrl}" class="${customClass}" loading="lazy" style="object-fit:cover;"
                 onclick="openImageViewer('${postId}', ${index})"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'%3E%3C/svg%3E'">`;
}

// --------------------------------------------------------------------------
// IMAGE VIEWER MODAL
// --------------------------------------------------------------------------
function openImageViewer(postId, startIndex) {
    const post = feedState.posts.find(p => p.id === postId);
    if (!post) return;

    // Build ordered array: images first, then videos (to align with globalIdx used in feed)
    const allMedia = parseJSON(post.imageURLs, []);
    let mediaList = [];
    allMedia.forEach(item => {
        const url = (typeof item === 'string') ? item : (item.url || '');
        const type = (typeof item === 'object' && item.type) ? item.type : (url.match(/\.(mp4|webm|ogg)$/i) ? 'video' : 'image');
        if (type !== 'video') mediaList.push({ url, type: 'image' });
    });
    allMedia.forEach(item => {
        const url = (typeof item === 'string') ? item : (item.url || '');
        const type = (typeof item === 'object' && item.type) ? item.type : (url.match(/\.(mp4|webm|ogg)$/i) ? 'video' : 'image');
        if (type === 'video') mediaList.push({ url, type: 'video' });
    });

    const modalEl = document.getElementById('imageViewerModal');
    const container = document.getElementById('carousel-items-container');
    const counter = document.getElementById('viewerCounter');
    const prevBtn = document.getElementById('carouselPrev');
    const nextBtn = document.getElementById('carouselNext');

    // Build carousel slides
    container.innerHTML = mediaList.map((item, idx) => {
        const isActive = idx === startIndex ? 'active' : '';
        let slideContent = '';
        if (item.type === 'video') {
            const driveMatch = item.url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || item.url.match(/file\/d\/([a-zA-Z0-9_-]+)/);
            if (item.url.includes('drive.google.com') && driveMatch) {
                const embedUrl = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
                slideContent = `
                    <div class="d-flex justify-content-center align-items-center h-100 w-100" style="background: black; position: relative;">
                        <!-- Đẩy toàn bộ iframe xuống dưới 60px để chừa lại khoảng trống 100% cho nút X tắt Modal ở phía trên -->
                        <div style="width: 100%; height: calc(100% - 60px); position: relative; margin-top: 60px; z-index: 1;">
                            <iframe src="${embedUrl}" width="100%" height="100%" frameborder="0" allow="autoplay; fullscreen" allowfullscreen style="border: none;"></iframe>
                            <!-- Tấm màn đen giờ chỉ bám sát viền trên của thẻ div nội bộ, tuyệt đối không đè lên nút X -->
                            <div style="position: absolute; top: 0; left: 0; right: 0; height: 56px; background: black; z-index: 2; pointer-events: none;"></div>
                        </div>
                    </div>`;
            } else {
                slideContent = `
                    <div class="d-flex justify-content-center align-items-center h-100 w-100" style="background: black;">
                        <video src="${item.url}" class="d-block" style="max-width: 100%; max-height: 100%; object-fit: contain;" controls autoplay playsinline></video>
                    </div>`;
            }
        } else {
            // Use regex to replace any =sXX suffix with =s0 for original quality
            const hdUrl = item.url.replace(/=s\d+$/, '=s0');
            slideContent = `
                <div class="d-flex justify-content-center align-items-center h-100 w-100" style="background: black;">
                    <img src="${hdUrl}" class="d-block" style="max-width: 100%; max-height: 100%; object-fit: contain;" alt="">
                </div>`;
        }
        return `<div class="carousel-item h-100 ${isActive}">${slideContent}</div>`;
    }).join('');

    // Show/hide nav arrows
    const showNav = mediaList.length > 1;
    prevBtn.style.display = showNav ? '' : 'none';
    nextBtn.style.display = showNav ? '' : 'none';

    // Counter updates
    const updateCounter = () => {
        const activeIdx = [...container.querySelectorAll('.carousel-item')].findIndex(el => el.classList.contains('active'));
        counter.textContent = `${activeIdx + 1} / ${mediaList.length}`;
    };
    updateCounter();
    modalEl.addEventListener('slide.bs.carousel', () => setTimeout(updateCounter, 50));

    // Clean up on close
    modalEl.addEventListener('hidden.bs.modal', () => { container.innerHTML = ''; }, { once: true });

    bootstrap.Modal.getOrCreateInstance(modalEl).show();

    // Jump to startIndex via carousel API
    if (startIndex > 0) {
        setTimeout(() => {
            const carousel = bootstrap.Carousel.getOrCreateInstance(document.getElementById('postImageCarousel'));
            carousel.to(startIndex);
        }, 50);
    }
}


// --------------------------------------------------------------------------
// POST CONTENT FORMATTER (hashtags, mentions)
// --------------------------------------------------------------------------
function formatPostContent(text) {
    return escapeHtml(text)
        .replace(/#(\w+)/g, '<a href="#" class="text-decoration-none theme-text-primary fw-semibold" onclick="filterByHashtag(\'#$1\'); return false;">#$1</a>')
        .replace(/@(\w+)/g, '<a href="#" class="text-decoration-none theme-text-primary fw-semibold">@$1</a>');
}

/**
 * Filter feed by hashtag
 */
function filterByHashtag(tag) {
    feedState.currentHashtag = tag;

    // Update UI
    const indicator = document.getElementById('hashtagFilterIndicator');
    const label = document.getElementById('activeHashtag');
    if (indicator && label) {
        label.textContent = tag;
        indicator.classList.remove('d-none');
        indicator.classList.add('d-flex');
    }

    // Reset and reload
    loadFeed(true);
}

/**
 * Clear hashtag filter
 */
function clearHashtagFilter() {
    feedState.currentHashtag = '';

    // Update UI
    const indicator = document.getElementById('hashtagFilterIndicator');
    if (indicator) {
        indicator.classList.add('d-none');
        indicator.classList.remove('d-flex');
    }

    // Reset and reload
    loadFeed(true);
}

// --------------------------------------------------------------------------
// LIKES
// --------------------------------------------------------------------------
async function toggleLike(postId, btn) {
    const post = feedState.posts.find(p => p.id === postId);
    if (!post) return;

    // Optimistic Update
    const wasLiked = btn.classList.contains('liked');
    const isLiked = !wasLiked;
    const previousLikeCount = parseInt(post.likeCount || 0);
    const newLikeCount = isLiked ? previousLikeCount + 1 : Math.max(0, previousLikeCount - 1);

    btn.classList.toggle('liked', isLiked);
    btn.innerHTML = `<i class="bi ${isLiked ? 'bi-heart-fill' : 'bi-heart'} me-1"></i><span class="like-count">${newLikeCount > 0 ? newLikeCount : ''}</span> <span class="like-label">${newLikeCount > 0 ? '' : 'Thích'}</span>`;
    post.likeCount = newLikeCount;
    if (isLiked) {
        post.likedBy = (post.likedBy || '') + state.profile.username + ',';
    } else {
        post.likedBy = (post.likedBy || '').replace(state.profile.username, '');
    }

    try {
        const res = await sendToServer({ action: 'like_post', postId, username: state.profile.username }, true); // silent
        if (res.status === 'error') throw new Error(res.message);
        // Sync with server truth (server now returns .liked and .likeCount)
        const serverLiked = res.liked;
        const serverCount = res.likeCount || 0;
        post.likeCount = serverCount;
        btn.classList.toggle('liked', serverLiked);
        btn.innerHTML = `<i class="bi ${serverLiked ? 'bi-heart-fill' : 'bi-heart'} me-1"></i><span class="like-count">${serverCount > 0 ? serverCount : ''}</span> <span class="like-label">${serverCount > 0 ? '' : 'Thích'}</span>`;

        // Sync local likedBy string
        const currentLikedUsers = (post.likedBy || '').split(',').map(u => u.trim());
        if (serverLiked) {
            if (!currentLikedUsers.includes(state.profile.username)) post.likedBy = (post.likedBy || '') + state.profile.username + ',';
        } else {
            post.likedBy = (post.likedBy || '').replace(new RegExp(state.profile.username + '[,\\s]*', 'g'), '');
        }
    } catch (e) {
        console.error('Like failed, rolling back', e);
        // Rollback
        post.likeCount = previousLikeCount;
        if (wasLiked) {
            post.likedBy = (post.likedBy || '') + state.profile.username + ',';
        } else {
            post.likedBy = (post.likedBy || '').replace(state.profile.username, '');
        }
        btn.classList.toggle('liked', wasLiked);
        btn.innerHTML = `<i class="bi ${wasLiked ? 'bi-heart-fill' : 'bi-heart'} me-1"></i><span class="like-count">${previousLikeCount > 0 ? previousLikeCount : ''}</span> <span class="like-label">${previousLikeCount > 0 ? '' : 'Thích'}</span>`;
    }
}

// --------------------------------------------------------------------------
// COMMENTS
// --------------------------------------------------------------------------
function toggleCommentBox(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (!section) return;
    const isOpen = section.style.display !== 'none';
    section.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
        loadComments(postId);
        document.getElementById(`comment-input-${postId}`)?.focus();
    }
}

async function loadComments(postId) {
    const list = document.getElementById(`comment-list-${postId}`);
    if (!list) return;

    const post = feedState.posts.find(p => p.id === postId);
    if (!post) return;

    const comments = post.commentsData || [];
    list.innerHTML = comments.length === 0 ? '' : comments.map(c => renderCommentHtml(c, postId)).join('');
}

/**
 * Helper to render a single comment's HTML with edit/delete actions if owner.
 */
function renderCommentHtml(c, postId) {
    const isOwner = c.username === state.profile.username;
    const actionsHtml = isOwner ? `
        <div class="ms-auto dropdown">
            <button class="btn btn-link text-muted p-0" data-bs-toggle="dropdown" style="font-size:0.75rem;">
                <i class="bi bi-three-dots-vertical"></i>
            </button>
            <ul class="dropdown-menu shadow-sm dropdown-menu-end" style="min-width: 80px;">
                <li><a class="dropdown-item py-1" href="#" onclick="editComment('${postId}', '${c.id}', this); return false;" style="font-size:0.82rem;"><i class="bi bi-pencil me-2"></i>Sửa</a></li>
                <li><a class="dropdown-item py-1 text-danger" href="#" onclick="deleteComment('${postId}', '${c.id}'); return false;" style="font-size:0.82rem;"><i class="bi bi-trash me-2"></i>Xóa</a></li>
            </ul>
        </div>
    ` : '';

    return `
        <div class="comment-item d-flex gap-2 mb-1 align-items-start" id="comment-${c.id || c._optimisticId}">
            <img src="${c.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.fullname || 'U')}&background=eee&color=333`}"
                 class="rounded-circle mt-1" width="28" height="28" style="object-fit:cover; flex-shrink:0;">
            <div class="comment-bubble w-100 position-relative p-2 rounded" style="background: rgba(0,0,0,0.04);">
                <div class="d-flex align-items-center gap-2 mb-0">
                    <span class="fw-semibold" style="font-size:0.85rem;">${escapeHtml(c.fullname || c.username)}</span>
                    <span class="text-muted" style="font-size:0.72rem;">• ${formatTimeSmart(c.time || c.formattedTime)}</span>
                    ${actionsHtml}
                </div>
                <div class="comment-text" style="font-size:0.9rem; line-height: 1.3;">${escapeHtml(c.content)}</div>
            </div>
        </div>
    `;
}

async function editComment(postId, commentId, btn) {
    const post = feedState.posts.find(p => p.id === postId);
    if (!post || !post.commentsData) return;
    const comment = post.commentsData.find(c => String(c.id) === String(commentId));
    if (!comment) return;

    const commentEl = document.getElementById(`comment-${commentId}`);
    if (!commentEl) return;
    const textEl = commentEl.querySelector('.comment-text');
    if (!textEl || textEl.querySelector('input')) return; // Already editing

    const oldContent = comment.content;
    const inputHtml = `
        <div class="edit-comment-container d-flex gap-1 mt-1 align-items-center">
            <input type="text" class="form-control form-control-sm rounded-pill py-1 px-3" 
                   value="${escapeHtml(oldContent)}" 
                   id="edit-input-${commentId}"
                   style="font-size: 0.9rem;">
            <button class="btn btn-sm btn-link p-0 text-success" onclick="saveEditedComment('${postId}', '${commentId}')">
                <i class="bi bi-check-circle-fill"></i>
            </button>
            <button class="btn btn-sm btn-link p-0 text-muted" onclick="cancelEditComment('${postId}', '${commentId}', '${escapeHtml(oldContent)}')">
                <i class="bi bi-x-circle-fill"></i>
            </button>
        </div>
    `;
    textEl.innerHTML = inputHtml;
    const input = document.getElementById(`edit-input-${commentId}`);
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);

    // Enter to save, Esc to cancel
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveEditedComment(postId, commentId);
        if (e.key === 'Escape') cancelEditComment(postId, commentId, oldContent);
    });
}

function cancelEditComment(postId, commentId, originalContent) {
    const commentEl = document.getElementById(`comment-${commentId}`);
    if (commentEl) {
        const textEl = commentEl.querySelector('.comment-text');
        if (textEl) textEl.textContent = originalContent;
    }
}

async function saveEditedComment(postId, commentId) {
    const post = feedState.posts.find(p => p.id === postId);
    const comment = post?.commentsData?.find(c => String(c.id) === String(commentId));
    const input = document.getElementById(`edit-input-${commentId}`);
    const newContent = input?.value?.trim();

    if (!comment || !newContent || newContent === comment.content) {
        cancelEditComment(postId, commentId, comment ? comment.content : '');
        return;
    }

    const oldContent = comment.content;
    comment.content = newContent;

    // Update UI
    cancelEditComment(postId, commentId, newContent);

    try {
        const res = await sendToServer({ action: 'comment_action', type: 'edit', postId, commentId, content: newContent, username: state.profile.username }, true);
        if (res.status === 'error') throw new Error(res.message);
    } catch (e) {
        console.error('Edit failed', e);
        comment.content = oldContent;
        cancelEditComment(postId, commentId, oldContent);
        showAlert('Cập nhật thất bại. Vui lòng thử lại.');
    }
}

async function deleteComment(postId, commentId) {
    confirmAction('Xác nhận xóa', 'Bạn có chắc chắn muốn xóa bình luận này?', async () => {
        const post = feedState.posts.find(p => p.id === postId);
        if (!post || !post.commentsData) return;
        const idx = post.commentsData.findIndex(c => String(c.id) === String(commentId));
        if (idx === -1) return;

        const deletedComment = post.commentsData[idx];

        // Optimistic
        post.commentsData.splice(idx, 1);
        post.commentCount = Math.max(0, (parseInt(post.commentCount) || 0) - 1);
        const commentEl = document.getElementById(`comment-${commentId}`);
        if (commentEl) commentEl.remove();

        // Update Comment count button
        const commentBtn = document.querySelector(`.post-card[data-post-id="${postId}"] .post-actions button:nth-child(2)`);
        if (commentBtn) {
            commentBtn.innerHTML = `<i class="bi bi-chat me-1"></i> ${post.commentCount > 0 ? post.commentCount : 'Bình luận'}`;
        }

        try {
            const res = await sendToServer({ action: 'comment_action', type: 'delete', postId, commentId, username: state.profile.username }, true);
            if (res.status === 'error') throw new Error(res.message);
        } catch (e) {
            console.error('Delete comment failed', e);
            post.commentsData.splice(idx, 0, deletedComment);
            post.commentCount++;
            if (commentBtn) {
                commentBtn.innerHTML = `<i class="bi bi-chat me-1"></i> ${post.commentCount > 0 ? post.commentCount : 'Bình luận'}`;
            }
            await loadComments(postId); // Refresh UI
            showAlert('Xóa thất bại. Vui lòng thử lại.');
        }
    });
}


async function submitComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input?.value?.trim();
    if (!content) return;

    const post = feedState.posts.find(p => p.id === postId);
    if (!post) return;

    // Optimistic Update
    const optimisticComment = {
        _optimisticId: Date.now(),
        username: state.profile.username,
        fullname: state.profile.fullname || state.profile.username,
        avatar: state.profile.avaUrl || '',
        content: content,
        time: new Date().toISOString()
    };

    if (!post.commentsData) post.commentsData = [];
    post.commentsData.push(optimisticComment);
    post.commentCount = (parseInt(post.commentCount) || 0) + 1;

    // Update Comment count button
    const commentBtn = document.querySelector(`.post-card[data-post-id="${postId}"] .post-actions button:nth-child(2)`);
    if (commentBtn) {
        commentBtn.innerHTML = `<i class="bi bi-chat me-1"></i> ${post.commentCount > 0 ? post.commentCount : 'Bình luận'}`;
    }

    input.value = '';
    await loadComments(postId); // Re-render locally

    input.disabled = true;
    try {
        const res = await sendToServer({ action: 'comment_action', type: 'add', postId, username: state.profile.username, content }, true);
        if (res.status === 'error') throw new Error(res.message);

        // Cập nhật ID thật từ server để có thể Sửa/Xóa ngay lập tức
        if (res.id) {
            optimisticComment.id = res.id;
            await loadComments(postId);
        }
    } catch (e) {
        console.error('Comment failed, rolling back.', e);
        // Rollback
        input.value = content;
        post.commentsData = post.commentsData.filter(c => c._optimisticId !== optimisticComment._optimisticId);
        post.commentCount = Math.max(0, (parseInt(post.commentCount) || 0) - 1);
        if (commentBtn) {
            commentBtn.innerHTML = `<i class="bi bi-chat me-1"></i> ${post.commentCount > 0 ? post.commentCount : 'Bình luận'}`;
        }
        await loadComments(postId);
        // showAlert('Bình luận thất bại. Vui lòng thử lại.');
    } finally {
        input.disabled = false;
        input.focus();
    }
}

// --------------------------------------------------------------------------
// CREATE / EDIT POST
// --------------------------------------------------------------------------
let selectedFiles = [];
let existingImages = [];
let uploadQuality = 'hd';
let selectedLayout = 'top-bottom';

function openCreatePost() {
    selectedFiles = [];
    existingImages = [];
    uploadQuality = 'hd';
    selectedLayout = 'auto';
    const switchEl = document.getElementById('postQualitySwitch');
    if (switchEl) switchEl.checked = true;
    document.getElementById('postTextarea').value = '';
    document.getElementById('postImagePreviewList').innerHTML = '';
    const countLabel = document.getElementById('previewImageCount');
    if (countLabel) countLabel.textContent = '';
    const header = document.getElementById('previewHeader');
    if (header) header.style.display = 'none';

    // Đảm bảo data-edit-id bị xóa sạch khi tạo mới bài viết
    const modalEl = document.getElementById('createPostModal');
    if (modalEl) modalEl.removeAttribute('data-edit-id');

    toggleCreatePostUI();
    openModal('createPostModal');
}

function openEditPost(postId) {
    const post = feedState.posts.find(p => p.id === postId);
    if (!post) return;
    document.getElementById('postTextarea').value = post.content || '';
    
    selectedFiles = [];
    existingImages = (typeof post.imageURLs === 'string') ? parseJSON(post.imageURLs, []) : (post.imageURLs || []);
    
    document.getElementById('postImagePreviewList').innerHTML = '';
    selectedLayout = post.layout || 'auto';
    const switchEl = document.getElementById('postQualitySwitch');
    if (switchEl) switchEl.checked = uploadQuality === 'hd';
    
    renderPostPreviews(); // Vẽ lại ảnh cũ ngay lập tức
    toggleCreatePostUI();
    
    document.getElementById('createPostModal').dataset.editId = postId;
    openModal('createPostModal');
}

function confirmDeletePost(postId) {
    confirmAction('Xác nhận xóa', 'Bạn có chắc chắn muốn xóa bài viết này?', () => {
        deletePost(postId);
    });
}

async function deletePost(postId) {
    const postCard = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    const postIndex = feedState.posts.findIndex(p => p.id === postId);
    const postData = feedState.posts[postIndex];

    if (!postCard || postIndex === -1) return;

    // Optimistic Update
    postCard.style.display = 'none'; // Hide it temporarily
    feedState.posts.splice(postIndex, 1);

    try {
        const res = await sendToServer({ action: 'feed_action', type: 'delete', id: postId, username: state.profile.username }, true);
        if (res.status === 'error') throw new Error(res.message);
        postCard.remove(); // Permanent removal
    } catch (e) {
        console.error('Delete failed, rolling back.', e);
        // Rollback
        postCard.style.display = ''; // Restore visibility
        feedState.posts.splice(postIndex, 0, postData); // Insert back at original index
        showAlert('Xóa thất bại! Vui lòng thử lại.');
    }
}

async function submitPost() {
    const content = document.getElementById('postTextarea').value.trim();
    const modalEl = document.getElementById('createPostModal');

    // Đảm bảo editId là null nếu không phải đang sửa
    let editId = modalEl ? modalEl.getAttribute('data-edit-id') : null;
    if (!editId || editId === 'undefined' || editId === 'null' || editId === '') {
        editId = null;
    }

    if (!content && selectedFiles.length === 0) return;

    const submitBtn = document.getElementById('bottomSubmitPostBtn') || document.getElementById('submitPostBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang đăng...';
    }

    try {
        const totalFiles = selectedFiles.length;
        const quality = uploadQuality;

        // --- Bước 1: Tạo preview URL ngay từ file cục bộ (không cần chờ upload) ---
        const localPreviews = selectedFiles.map(file => ({
            type: file.type.startsWith('video/') ? 'video' : 'image',
            url: URL.createObjectURL(file)
        }));
        
        // Gộp ảnh cũ + ảnh mới sửa
        const combinedPreviews = [...existingImages, ...localPreviews];

        let finalLayout = selectedLayout;
        if (finalLayout === 'auto') {
            if (combinedPreviews.length < 3) finalLayout = 'grid';
            else if (combinedPreviews.length === 3) finalLayout = 'three';
            else if (combinedPreviews.length === 4) finalLayout = 'four';
            else if (combinedPreviews.length > 4) finalLayout = 'mosaic';
        }

        const optId = editId || ('opt-' + Date.now());
        const optimisticPost = {
            id: optId,
            type: editId ? 'update' : 'create',
            username: state.profile.username,
            fullname: state.profile.fullname || state.profile.username,
            avaUrl: state.profile.avaUrl || '',
            content: content,
            imageURLs: JSON.stringify(combinedPreviews),
            layout: finalLayout,
            createdAt: new Date().toISOString(),
            likeCount: 0, commentCount: 0, likedBy: '', commentsData: []
        };

        if (editId) {
            const idx = feedState.posts.findIndex(p => p.id === editId);
            if (idx > -1) feedState.posts[idx] = Object.assign({}, feedState.posts[idx], optimisticPost);
        } else {
            feedState.posts.unshift(optimisticPost);
        }

        const feedList = document.getElementById('feedList');
        if (feedList) feedList.innerHTML = '';
        renderFeedPosts(feedState.posts, false);

        // Đóng modal ngay sau khi đã render card tạm
        if (modalEl) {
            const modalInstance = bootstrap.Modal.getInstance(modalEl);
            if (modalInstance) modalInstance.hide();
            modalEl.removeAttribute('data-edit-id');
        }

        // --- Bước 2: Upload ảnh trong nền và hiện tiến trình trên card ---
        (async () => {
            const card = document.querySelector(`.post-card[data-post-id="${optId}"]`);

            // Gắn badge tiến trình vào đầu bài nếu có ảnh
            let progressNote = null;
            if (totalFiles > 0 && card) {
                progressNote = document.createElement('div');
                progressNote.className = 'upload-progress-note d-flex align-items-center gap-2 px-3 py-2';
                progressNote.style.cssText = 'font-size:0.82rem;color:#555;background:rgba(0,0,0,0.04);border-bottom:1px solid #f0f0f0;';
                progressNote.innerHTML = `<span class="spinner-border spinner-border-sm" style="width:14px;height:14px;"></span>
                    <span class="progress-text">Posting 0/${totalFiles} ${quality.toUpperCase()}</span>`;
                card.prepend(progressNote);
            }

            const imageURLs = [...existingImages]; // Giữ lại ảnh cũ
            for (let i = 0; i < totalFiles; i++) {
                const file = selectedFiles[i];
                if (progressNote) {
                    progressNote.querySelector('.progress-text').textContent = `Posting ${i + 1}/${totalFiles} ${quality.toUpperCase()}`;
                }
                try {
                    const b64 = await fileToBase64(file);
                    const compressed = quality === 'sd' ? await compressImage(file, 0.6, 800) : b64;
                    const res = await sendToServer({ action: 'upload_single_image', image: compressed, name: file.name });
                    if (res && res.url) {
                        imageURLs.push({ type: file.type.startsWith('video/') ? 'video' : 'image', url: res.url });
                    }
                } catch (e) {
                    console.warn('Upload one image failed:', e);
                }
            }

            // Hiện Done rồi ẩn badge
            if (progressNote) {
                progressNote.innerHTML = `<i class="bi bi-check-circle-fill text-success"></i> <span>Done</span>`;
                setTimeout(() => progressNote.remove(), 1800);
            }

            // Gửi lên server và cập nhật card với URL thật
            const payload = {
                action: 'feed_action',
                type: editId ? 'update' : 'create',
                id: editId,
                username: state.profile.username,
                fullname: state.profile.fullname || state.profile.username,
                avaUrl: state.profile.avaUrl || '',
                content: content,
                image: JSON.stringify(imageURLs),
                layout: finalLayout
            };

            try {
                const res = await sendToServer(payload);
                if (res && res.status === 'success' && !editId && res.id) {
                    const idx = feedState.posts.findIndex(p => p.id === optId);
                    if (idx > -1) {
                        feedState.posts[idx].id = res.id;
                        feedState.posts[idx].imageURLs = JSON.stringify(imageURLs.length > 0 ? imageURLs : (res.images || []));
                        if (res.time) feedState.posts[idx].createdAt = res.time;
                        const oldCard = document.querySelector(`.post-card[data-post-id="${optId}"]`);
                        if (oldCard) {
                            const newCard = createPostCard(feedState.posts[idx]);
                            oldCard.replaceWith(newCard);
                        }
                    }
                } else if (res && res.status === 'error') {
                    console.error('Server sync error:', res.message);
                    showAlert('Có lỗi khi lưu bài viết lên hệ thống: ' + res.message);
                }
            } catch (e) {
                console.error('Sync failed', e);
            }
        })();



    } catch (e) {
        console.error(e);
        showAlert('Đăng bài thất bại! Lỗi: ' + (e.message || 'Không xác định'));
    }
    finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-send me-1"></i>Đăng bài';
        }
    }
}

function handleImageSelect(input) {
    const files = Array.from(input.files);
    selectedFiles = selectedFiles.concat(files);
    renderPostPreviews();
    input.value = ''; // Reset input
}

function removePreviewFile(idx) {
    if (idx < existingImages.length) {
        existingImages.splice(idx, 1);
    } else {
        selectedFiles.splice(idx - existingImages.length, 1);
    }
    renderPostPreviews();
}

function clearAllImages() {
    selectedFiles = [];
    existingImages = [];
    renderPostPreviews();
}

function renderPostPreviews() {
    const preview = document.getElementById('postImagePreviewList');
    const countLabel = document.getElementById('previewImageCount');
    const previewHeader = document.getElementById('previewHeader');
    if (!preview) return;

    // Revoke old blob URLs memory (only ones that are actual local blobs, but revoking everything works around DOM limitations if cautious)
    if (preview.dataset.objectUrls) {
        try {
            let oldUrls = JSON.parse(preview.dataset.objectUrls);
            oldUrls.forEach(url => { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url) });
        } catch (e) { }
    }

    const totalImages = existingImages.length + selectedFiles.length;

    if (totalImages === 0) {
        preview.innerHTML = '';
        if (countLabel) countLabel.textContent = '';
        if (previewHeader) previewHeader.style.display = 'none';
        delete preview.dataset.objectUrls;
        toggleCreatePostUI();
        return;
    }

    if (countLabel) countLabel.textContent = totalImages + ' ảnh';
    if (previewHeader) previewHeader.style.display = 'flex';

    const newUrls = selectedFiles.map(f => URL.createObjectURL(f));
    const allUrls = [...existingImages.map(img => img.url), ...newUrls];
    preview.dataset.objectUrls = JSON.stringify(allUrls);

    renderPostPreviewsGridOnly(); // Force render into layout
    toggleCreatePostUI();
}

function renderPostPreviewsGridOnly() {
    const preview = document.getElementById('postImagePreviewList');
    if (!preview || !preview.dataset.objectUrls) return;
    try {
        const urls = JSON.parse(preview.dataset.objectUrls);
        preview.innerHTML = buildImageGrid(urls, 'preview', selectedLayout || 'auto');
    } catch (e) { }
}

function toggleCreatePostUI() {
    const hasImages = (existingImages.length + selectedFiles.length) > 0;
    const btnClear = document.getElementById('btnClearAllImages');
    const layoutBlock = document.getElementById('layoutSelectionBlock');
    const qualityContainer = document.getElementById('postQualityContainer');

    if (btnClear) btnClear.classList.toggle('d-none', !hasImages);
    if (layoutBlock) layoutBlock.classList.toggle('d-none', !hasImages);
    if (qualityContainer) qualityContainer.classList.toggle('d-none', !hasImages);

    if (hasImages && selectedLayout === 'auto') {
        const total = existingImages.length + selectedFiles.length;
        selectPostLayout(total < 3 ? 'grid' : 'top-bottom');
    } else if (hasImages) {
        selectPostLayout(selectedLayout);
    }
}

function selectPostLayout(layout) {
    selectedLayout = layout;
    ['grid', 'top-bottom', 'left-right'].forEach(l => {
        const el = document.getElementById('layout-opt-' + l);
        if (!el) return;
        const blocks = el.querySelectorAll('.layout-block');
        const check = el.querySelector('.layout-check');
        if (l === layout || (layout === 'auto' && l === 'top-bottom')) {
            el.classList.add('theme-text-primary');
            el.style.borderColor = 'currentColor';
            el.style.borderWidth = '2px';
            el.style.borderStyle = 'solid';
            blocks.forEach(b => {
                b.classList.remove('bg-secondary', 'opacity-25');
                b.classList.add('theme-bg-primary');
                b.style.background = '';
            });
            if (check) {
                check.classList.remove('d-none');
                check.classList.add('theme-bg-primary');
            }
        } else {
            el.classList.remove('theme-text-primary');
            el.style.borderColor = '';
            el.style.borderWidth = '';
            el.style.borderStyle = '';
            blocks.forEach(b => {
                b.classList.remove('theme-bg-primary');
                b.classList.add('bg-secondary', 'opacity-25');
                b.style.background = '#e0e0e0';
            });
            if (check) {
                check.classList.add('d-none');
                check.classList.remove('theme-bg-primary');
            }
        }
    });

    const hasImages = (existingImages.length + selectedFiles.length) > 0;
    if (hasImages) {
        renderPostPreviewsGridOnly();
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
    if (!list) return;
    list.innerHTML = `<div class="text-center py-5 text-muted">
        <i class="bi bi-wifi-off fs-1 d-block mb-2"></i>Không tải được bài viết.<br>
        <button class="btn btn-sm btn-outline-secondary mt-2" onclick="loadFeed(true)">Thử lại</button>
    </div>`;
}

// --------------------------------------------------------------------------
// HELPERS
// --------------------------------------------------------------------------
function parseJSON(str, fallback) {
    try { return JSON.parse(str) || fallback; } catch { return fallback; }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function compressImage(file, quality = 0.7, maxWidth = 1024) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, maxWidth / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = url;
    });
}

// Periodic smart-time updates
setInterval(() => {
    document.querySelectorAll('.post-timestamp[data-timestamp]').forEach(el => {
        el.textContent = formatTimeSmart(el.dataset.timestamp);
    });
}, 60000);
