// --------------------------------------------------------------------------
// COMMENTS — display, load, render, submit
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
    const post = feedState.postMap.get(String(postId));
    if (!post) return;
    const comments = post.commentsData || [];
    list.innerHTML = comments.length === 0 ? '' : comments.map(c => renderCommentHtml(c, postId)).join('');
}

// Hashtags and mentions are formatted via formatPostContent (feed-hashtag.js)
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
            <img src="${c.avatar || getDefaultAvatar(c.fullname)}"
                 class="rounded-circle mt-1" width="28" height="28" style="object-fit:cover; flex-shrink:0;">
            <div class="comment-bubble w-100 position-relative p-2 rounded" style="background: rgba(0,0,0,0.04);">
                <div class="d-flex align-items-center gap-2 mb-0">
                    <span class="fw-semibold" style="font-size:0.85rem;">${escapeHtml(c.fullname || c.username)}</span>
                    <span class="text-muted" style="font-size:0.72rem;">• ${formatTimeSmart(c.time || c.formattedTime)}</span>
                    ${actionsHtml}
                </div>
                <div class="comment-text" style="font-size:0.9rem; line-height: 1.3;">${formatPostContent(c.content)}</div>
            </div>
        </div>
    `;
}

async function submitComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input?.value?.trim();
    if (!content) return;

    const post = feedState.postMap.get(String(postId));
    if (!post) return;

    const optimisticComment = {
        _optimisticId: Date.now(),
        username: state.profile.username,
        fullname: state.profile.fullname || state.profile.username,
        avatar: state.profile.avaUrl || '',
        content,
        time: new Date().toISOString()
    };

    if (!post.commentsData) post.commentsData = [];
    post.commentsData.push(optimisticComment);
    post.commentCount = (parseInt(post.commentCount) || 0) + 1;

    const commentBtn = document.querySelector(`.post-card[data-post-id="${postId}"] .post-actions button:nth-child(2)`);
    if (commentBtn) commentBtn.innerHTML = `<i class="bi bi-chat me-1"></i> ${post.commentCount > 0 ? post.commentCount : 'Bình luận'}`;

    input.value = '';
    await loadComments(postId);

    input.disabled = true;
    try {
        const res = await sendToServer({ action: 'comment_action', type: 'add', postId, username: state.profile.username, content }, true);
        if (res.status === 'error') throw new Error(res.message);
        if (res.id) {
            optimisticComment.id = res.id;
            await loadComments(postId);
        }
    } catch (e) {
        console.error('Comment failed, rolling back.', e);
        input.value = content;
        post.commentsData = post.commentsData.filter(c => c._optimisticId !== optimisticComment._optimisticId);
        post.commentCount = Math.max(0, (parseInt(post.commentCount) || 0) - 1);
        if (commentBtn) commentBtn.innerHTML = `<i class="bi bi-chat me-1"></i> ${post.commentCount > 0 ? post.commentCount : 'Bình luận'}`;
        await loadComments(postId);
    } finally {
        input.disabled = false;
        input.focus();
    }
}
