// --------------------------------------------------------------------------
// CREATE / EDIT POST — globals, modal open/close, previews, layout picker
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

    renderPostPreviews();
    toggleCreatePostUI();

    document.getElementById('createPostModal').dataset.editId = postId;
    openModal('createPostModal');
}

function confirmDeletePost(postId) {
    confirmAction('Xác nhận xóa', 'Bạn có chắc chắn muốn xóa bài viết này?', () => deletePost(postId));
}

async function deletePost(postId) {
    const postCard = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    const postIndex = feedState.posts.findIndex(p => p.id === postId);
    const postData = feedState.posts[postIndex];
    if (!postCard || postIndex === -1) return;

    postCard.style.display = 'none';
    feedState.posts.splice(postIndex, 1);

    try {
        const res = await sendToServer({ action: 'feed_action', type: 'delete', id: postId, username: state.profile.username }, true);
        if (res.status === 'error') throw new Error(res.message);
        postCard.remove();
    } catch (e) {
        console.error('Delete failed, rolling back.', e);
        postCard.style.display = '';
        feedState.posts.splice(postIndex, 0, postData);
        showAlert('Xóa thất bại! Vui lòng thử lại.');
    }
}

function handleImageSelect(input) {
    const files = Array.from(input.files);
    selectedFiles = selectedFiles.concat(files);
    renderPostPreviews();
    input.value = '';
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

    if (preview.dataset.objectUrls) {
        try {
            JSON.parse(preview.dataset.objectUrls).forEach(url => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url); });
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

    renderPostPreviewsGridOnly();
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
    document.getElementById('btnClearAllImages')?.classList.toggle('d-none', !hasImages);
    document.getElementById('layoutSelectionBlock')?.classList.toggle('d-none', !hasImages);
    document.getElementById('postQualityContainer')?.classList.toggle('d-none', !hasImages);

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
        const isActive = l === layout || (layout === 'auto' && l === 'top-bottom');
        el.classList.toggle('theme-text-primary', isActive);
        el.style.borderColor = isActive ? 'currentColor' : '';
        el.style.borderWidth = isActive ? '2px' : '';
        el.style.borderStyle = isActive ? 'solid' : '';
        blocks.forEach(b => {
            b.classList.toggle('theme-bg-primary', isActive);
            b.classList.toggle('bg-secondary', !isActive);
            b.classList.toggle('opacity-25', !isActive);
            b.style.background = isActive ? '' : '#e0e0e0';
        });
        if (check) {
            check.classList.toggle('d-none', !isActive);
            check.classList.toggle('theme-bg-primary', isActive);
        }
    });

    if ((existingImages.length + selectedFiles.length) > 0) {
        renderPostPreviewsGridOnly();
    }
}
