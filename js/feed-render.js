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

    const allMedia = normalizePostMedia(post);
    let images = [];
    let videos = [];
    allMedia.forEach((item, mediaIndex) => {
        if (item.type === 'video') videos.push(item);
        else if (typeof item.original === 'string') images.push({ url: item.url, __viewerIndex: mediaIndex });
        else images.push({ ...item.original, __viewerIndex: mediaIndex });
    });

    const layout = post.layout || 'solo';
    const contentHtml = formatPostContent(post.content || '');
    const timeStr = formatTimeSmart(post.createdAt);
    const likeCount = parseInt(post.likeCount || 0);
    const commentCount = parseInt(post.commentCount || 0);
    const likedUsers = (post.likedBy || '').split(',').map(u => u.trim());
    const isLiked = likedUsers.includes(state.profile.username);

    let initialCommentsHtml = '';
    const commentsData = post.commentsData || [];
    if (commentsData.length > 0) {
        const recentComments = commentsData.slice(-2);
        initialCommentsHtml = recentComments.map(c => renderCommentHtml(c, post.id)).join('');
        if (commentsData.length > 2) {
            initialCommentsHtml = `<div class="mb-2"><button class="btn btn-sm btn-link p-0 text-muted" onclick="loadComments('${post.id}')" style="font-size:0.8rem;text-decoration:none;">Tải thêm bình luận (${commentsData.length - 2})</button></div>` + initialCommentsHtml;
        }
    }

    div.innerHTML = `
        <div class="post-header d-flex align-items-center px-3 pt-3 pb-2 gap-2">
            <img src="${post.avaUrl || post.avatar || getDefaultAvatar(post.fullname)}"
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
            ${videos.map((video, idx) => {
                const vUrl = video.url;
                const driveMatch = vUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) || vUrl.match(/file\/d\/([a-zA-Z0-9_-]+)/);
                const driveId = driveMatch ? driveMatch[1] : null;
                const thumbUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w400` : '';
                const globalIdx = findMediaDisplayIndex(post, vUrl, 'video', idx);
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
                <img src="${state.profile.avaUrl || getDefaultAvatar(state.profile.fullname)}"
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
