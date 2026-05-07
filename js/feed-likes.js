// --------------------------------------------------------------------------
// LIKES
// --------------------------------------------------------------------------
async function toggleLike(postId, btn) {
    const post = feedState.postMap.get(String(postId));
    if (!post) return;

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
        const res = await sendToServer({ action: 'like_post', postId, username: state.profile.username }, true);
        if (res.status === 'error') throw new Error(res.message);
        const serverLiked = res.liked;
        const serverCount = res.likeCount || 0;
        post.likeCount = serverCount;
        btn.classList.toggle('liked', serverLiked);
        btn.innerHTML = `<i class="bi ${serverLiked ? 'bi-heart-fill' : 'bi-heart'} me-1"></i><span class="like-count">${serverCount > 0 ? serverCount : ''}</span> <span class="like-label">${serverCount > 0 ? '' : 'Thích'}</span>`;
        const currentLikedUsers = (post.likedBy || '').split(',').map(u => u.trim());
        if (serverLiked) {
            if (!currentLikedUsers.includes(state.profile.username)) post.likedBy = (post.likedBy || '') + state.profile.username + ',';
        } else {
            post.likedBy = (post.likedBy || '').replace(new RegExp(state.profile.username + '[,\\s]*', 'g'), '');
        }
    } catch (e) {
        console.error('Like failed, rolling back', e);
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
