// --------------------------------------------------------------------------
// SUBMIT POST - create/update with optimistic UI and background upload
// --------------------------------------------------------------------------
async function submitPost() {
    const content = document.getElementById('postTextarea').value.trim();
    const modalEl = document.getElementById('createPostModal');

    let editId = modalEl ? modalEl.getAttribute('data-edit-id') : null;
    if (!editId || editId === 'undefined' || editId === 'null') editId = null;

    const filesToUpload = [...selectedFiles];
    const retainedImages = existingImages.map(img => typeof img === 'string' ? { url: img, type: 'image' } : { ...img });
    const totalFiles = filesToUpload.length;
    const quality = uploadQuality;
    if (!content && retainedImages.length === 0 && totalFiles === 0) return;

    const submitBtn = document.getElementById('bottomSubmitPostBtn') || document.getElementById('submitPostBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Dang dang...';
    }

    try {
        const localPreviews = filesToUpload.map(file => ({
            type: file.type.startsWith('video/') ? 'video' : 'image',
            url: URL.createObjectURL(file)
        }));
        const combinedPreviews = [...retainedImages, ...localPreviews];
        const finalLayout = resolvePostLayout(selectedLayout, combinedPreviews.length);
        const optId = editId || ('opt-' + Date.now());
        const previousPostIndex = editId ? feedState.posts.findIndex(p => p.id === editId) : -1;
        const previousPost = previousPostIndex > -1 ? { ...feedState.posts[previousPostIndex] } : null;

        const optimisticPost = {
            id: optId,
            type: editId ? 'update' : 'create',
            username: state.profile.username,
            fullname: state.profile.fullname || state.profile.username,
            avaUrl: state.profile.avaUrl || '',
            content,
            imageURLs: JSON.stringify(combinedPreviews),
            layout: finalLayout,
            createdAt: previousPost?.createdAt || new Date().toISOString(),
            likeCount: previousPost?.likeCount || 0,
            commentCount: previousPost?.commentCount || 0,
            likedBy: previousPost?.likedBy || '',
            commentsData: previousPost?.commentsData || []
        };

        if (editId && previousPostIndex > -1) {
            feedState.posts[previousPostIndex] = optimisticPost;
            feedState.postMap.set(String(editId), optimisticPost);
        } else if (!editId) {
            feedState.posts.unshift(optimisticPost);
            feedState.postMap.set(String(optId), optimisticPost);
        }

        rerenderFeedList();

        if (modalEl) {
            bootstrap.Modal.getInstance(modalEl)?.hide();
            modalEl.removeAttribute('data-edit-id');
        }

        syncPostInBackground({
            editId,
            optId,
            previousPostIndex,
            previousPost,
            content,
            finalLayout,
            filesToUpload,
            retainedImages,
            totalFiles,
            quality
        });
    } catch (e) {
        console.error(e);
        showAlert('Dang bai that bai! Loi: ' + (e.message || 'Khong xac dinh'));
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-send me-1"></i>Dang bai';
        }
    }
}

function resolvePostLayout(layout, mediaCount) {
    if (layout !== 'auto') return layout;
    if (mediaCount < 3) return 'grid';
    if (mediaCount === 3) return 'three';
    if (mediaCount === 4) return 'four';
    return 'mosaic';
}

function rerenderFeedList() {
    const feedList = document.getElementById('feedList');
    if (feedList) feedList.innerHTML = '';
    renderFeedPosts(feedState.posts, false);
}

async function syncPostInBackground(ctx) {
    const card = document.querySelector(`.post-card[data-post-id="${ctx.optId}"]`);
    const progressNote = createUploadProgress(card, ctx.totalFiles, ctx.quality);
    const imageURLs = [...ctx.retainedImages];

    for (let i = 0; i < ctx.totalFiles; i++) {
        const file = ctx.filesToUpload[i];
        updateUploadProgress(progressNote, i + 1, ctx.totalFiles, ctx.quality);
        try {
            const b64 = await fileToBase64(file);
            const image = ctx.quality === 'sd' ? await compressImage(file, 0.6, 800) : b64;
            const res = await sendToServer({ action: 'upload_single_image', image, name: file.name });
            if (res?.url) imageURLs.push({ type: file.type.startsWith('video/') ? 'video' : 'image', url: res.url });
        } catch (e) {
            console.warn('Upload one media file failed:', e);
        }
    }

    finishUploadProgress(progressNote);

    const payload = {
        action: 'feed_action',
        type: ctx.editId ? 'update' : 'create',
        id: ctx.editId,
        username: state.profile.username,
        fullname: state.profile.fullname || state.profile.username,
        avaUrl: state.profile.avaUrl || '',
        content: ctx.content,
        image: JSON.stringify(imageURLs),
        layout: ctx.finalLayout
    };

    try {
        const res = await sendToServer(payload);
        if (res?.status === 'error') throw new Error(res.message);
        applySyncedPost(ctx, res, imageURLs);
    } catch (e) {
        console.error('Post sync failed:', e);
        rollbackOptimisticPost(ctx);
        showAlert('Khong the luu bai viet len he thong.');
    }
}

function createUploadProgress(card, totalFiles, quality) {
    if (totalFiles === 0 || !card) return null;
    const note = document.createElement('div');
    note.className = 'upload-progress-note d-flex align-items-center gap-2 px-3 py-2';
    note.style.cssText = 'font-size:0.82rem;color:#555;background:rgba(0,0,0,0.04);border-bottom:1px solid #f0f0f0;';
    note.innerHTML = `<span class="spinner-border spinner-border-sm" style="width:14px;height:14px;"></span>
        <span class="progress-text">Posting 0/${totalFiles} ${quality.toUpperCase()}</span>`;
    card.prepend(note);
    return note;
}

function updateUploadProgress(note, current, total, quality) {
    const text = note?.querySelector('.progress-text');
    if (text) text.textContent = `Posting ${current}/${total} ${quality.toUpperCase()}`;
}

function finishUploadProgress(note) {
    if (!note) return;
    note.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i> <span>Done</span>';
    setTimeout(() => note.remove(), 1800);
}

function applySyncedPost(ctx, res, imageURLs) {
    const postId = ctx.editId || res?.id;
    const idx = feedState.posts.findIndex(p => p.id === ctx.optId || p.id === ctx.editId);
    if (!postId || idx === -1) return;

    feedState.posts[idx].id = postId;
    feedState.posts[idx].imageURLs = JSON.stringify(imageURLs.length > 0 ? imageURLs : (res.images || []));
    if (res.time) feedState.posts[idx].createdAt = res.time;

    feedState.postMap.delete(String(ctx.optId));
    feedState.postMap.set(String(postId), feedState.posts[idx]);
    document.querySelector(`.post-card[data-post-id="${ctx.optId}"]`)?.replaceWith(createPostCard(feedState.posts[idx]));
}

function rollbackOptimisticPost(ctx) {
    if (ctx.editId && ctx.previousPost) {
        const idx = feedState.posts.findIndex(p => p.id === ctx.editId);
        if (idx > -1) feedState.posts[idx] = ctx.previousPost;
        else feedState.posts.splice(Math.max(0, ctx.previousPostIndex), 0, ctx.previousPost);
        feedState.postMap.set(String(ctx.editId), ctx.previousPost);
        document.querySelector(`.post-card[data-post-id="${ctx.editId}"]`)?.replaceWith(createPostCard(ctx.previousPost));
        return;
    }

    const idx = feedState.posts.findIndex(p => p.id === ctx.optId);
    if (idx > -1) feedState.posts.splice(idx, 1);
    feedState.postMap.delete(String(ctx.optId));
    document.querySelector(`.post-card[data-post-id="${ctx.optId}"]`)?.remove();
}
