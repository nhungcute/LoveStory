// --------------------------------------------------------------------------
// COMMENT ACTIONS — edit and delete
// --------------------------------------------------------------------------
async function editComment(postId, commentId, btn) {
    const post = feedState.postMap.get(String(postId));
    if (!post || !post.commentsData) return;
    const comment = post.commentsData.find(c => String(c.id) === String(commentId));
    if (!comment) return;

    const commentEl = document.getElementById(`comment-${commentId}`);
    if (!commentEl) return;
    const textEl = commentEl.querySelector('.comment-text');
    if (!textEl || textEl.querySelector('input')) return;

    const oldContent = comment.content;
    textEl.innerHTML = `
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
    const input = document.getElementById(`edit-input-${commentId}`);
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveEditedComment(postId, commentId);
        if (e.key === 'Escape') cancelEditComment(postId, commentId, oldContent);
    });
}

function cancelEditComment(postId, commentId, originalContent) {
    const commentEl = document.getElementById(`comment-${commentId}`);
    if (commentEl) {
        const textEl = commentEl.querySelector('.comment-text');
        if (textEl) textEl.innerHTML = formatPostContent(originalContent);
    }
}

async function saveEditedComment(postId, commentId) {
    const post = feedState.postMap.get(String(postId));
    const comment = post?.commentsData?.find(c => String(c.id) === String(commentId));
    const input = document.getElementById(`edit-input-${commentId}`);
    const newContent = input?.value?.trim();

    if (!comment || !newContent || newContent === comment.content) {
        cancelEditComment(postId, commentId, comment ? comment.content : '');
        return;
    }

    const oldContent = comment.content;
    comment.content = newContent;
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
        const post = feedState.postMap.get(String(postId));
        if (!post || !post.commentsData) return;
        const idx = post.commentsData.findIndex(c => String(c.id) === String(commentId));
        if (idx === -1) return;

        const deletedComment = post.commentsData[idx];
        post.commentsData.splice(idx, 1);
        post.commentCount = Math.max(0, (parseInt(post.commentCount) || 0) - 1);
        document.getElementById(`comment-${commentId}`)?.remove();

        const commentBtn = document.querySelector(`.post-card[data-post-id="${postId}"] .post-actions button:nth-child(2)`);
        if (commentBtn) commentBtn.innerHTML = `<i class="bi bi-chat me-1"></i> ${post.commentCount > 0 ? post.commentCount : 'Bình luận'}`;

        try {
            const res = await sendToServer({ action: 'comment_action', type: 'delete', postId, commentId, username: state.profile.username }, true);
            if (res.status === 'error') throw new Error(res.message);
        } catch (e) {
            console.error('Delete comment failed', e);
            post.commentsData.splice(idx, 0, deletedComment);
            post.commentCount++;
            if (commentBtn) commentBtn.innerHTML = `<i class="bi bi-chat me-1"></i> ${post.commentCount > 0 ? post.commentCount : 'Bình luận'}`;
            await loadComments(postId);
            showAlert('Xóa thất bại. Vui lòng thử lại.');
        }
    });
}
