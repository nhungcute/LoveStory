
// --- HÀM TẢI FEED
async function loadFeedData(page = 1, isBackgroundRefresh = false) {
   const container = document.getElementById('posts-container');
   if (feedLoading) return;
   feedLoading = true;
   if (page === 1 && !isBackgroundRefresh && (!serverFeedData || serverFeedData.length === 0)) {
      container.innerHTML = '<div class="d-flex justify-content-center align-items-center py-5"><div class="spinner-border text-primary" role="status"></div></div>';
   }
   try {
      const payload = {
         action: 'get_feed',
         page: page,
         limit: 10,
         username: currentProfile ? currentProfile.username : ''
      };
      if (typeof currentHashFilter !== 'undefined' && currentHashFilter) {
         payload.hashtag = currentHashFilter;
      }
      const res = await sendToServer(payload);

      if (res.status === 'success') {
         if (page === 1) {
            mergeServerDataToView(res.data);
            try {
               localStorage.setItem('cached_feed_data', JSON.stringify(serverFeedData.slice(0, 20)));
            } catch (e) {
               console.warn("Cache đầy, bỏ qua lưu feed");
            }
            if (serverFeedData.length === 0) {
               container.innerHTML = `
								<div class="text-center py-5">
									<i class="bi bi-newspaper theme-text-primary" style="font-size: 4rem;"></i>
									<p class="fw-semibold fs-5 mt-3">Chưa có bài đăng</p>
									<p class="text-muted">Nhấn + để tạo bài viết đầu tiên</p>
								</div>`;
            }

         } else {
            const newItems = res.data.filter(newItem =>
               !serverFeedData.some(existing => existing.__backendId === newItem.__backendId)
            );

            serverFeedData = serverFeedData.concat(newItems);
            renderPostsPaged(newItems, page);
         }

         // Cập nhật trạng thái "Còn dữ liệu không?"
         feedHasMore = res.hasMore;

         // Xử lý Trending Tags (nếu không đang lọc)
         if (typeof currentHashFilter === 'undefined' || !currentHashFilter) {
            if (typeof renderTrendingTags === 'function') renderTrendingTags();
         }

      } else {
         // Lỗi từ Server trả về
         if (page === 1 && serverFeedData.length === 0) {
            container.innerHTML = '<div class="text-center py-5 text-muted">Không tải được dữ liệu</div>';
         }
      }
   } catch (e) {
      console.error("Lỗi tải feed:", e);
      if (page === 1 && serverFeedData.length === 0) {
         container.innerHTML = '<div class="text-center py-5 text-danger">Lỗi kết nối mạng</div>';
      }
   } finally {
      feedLoading = false;

      // Ẩn spinner "Pull to refresh" nếu có
      const ptrElement = document.getElementById('ptr-element');
      if (ptrElement && ptrElement.classList.contains('ptr-loading')) {
         // Logic đóng ptr nằm ở event listener, nhưng ta đảm bảo trạng thái ở đây
         // (Code UI PullToRefresh sẽ tự đóng khi thấy xong)
      }
   }
}

// --- HÀM PHỤ TRỢ: TRỘN DỮ LIỆU THÔNG MINH (SMART MERGE) ---
function mergeServerDataToView(newServerPosts) {
   const container = document.getElementById('posts-container');
   if (!newServerPosts || newServerPosts.length === 0) return;

   // 1. Tạo Map dữ liệu cũ để tra cứu nhanh (Tăng tốc độ)
   const localMap = new Map(serverFeedData.map(p => [p.__backendId, p]));
   for (let i = newServerPosts.length - 1; i >= 0; i--) {
      const serverPost = newServerPosts[i];
      const localPost = localMap.get(serverPost.__backendId);

      if (localPost) {
         // A. ĐÃ CÓ -> CẬP NHẬT (UPDATE)
         // Chỉ cập nhật nếu có thay đổi quan trọng
         const isChanged =
            localPost.content !== serverPost.content ||
            localPost.imageData !== serverPost.imageData ||
            localPost.likes !== serverPost.likes ||
            localPost.comments !== serverPost.comments;

         if (isChanged) {
            Object.assign(localPost, serverPost);
            const existingEl = document.getElementById(`post-${serverPost.__backendId}`);
            if (existingEl) {
               const tempDiv = document.createElement('div');
               tempDiv.innerHTML = createPostHtml(serverPost);
               const newContent = tempDiv.firstElementChild.innerHTML;
               existingEl.innerHTML = newContent;
            }
         }
      } else {
         serverFeedData.unshift(serverPost);
         const html = createPostHtml(serverPost);
         const emptyMsg = container.querySelector('.text-center.py-5');
         if (emptyMsg && emptyMsg.innerText.includes('Chưa có bài')) emptyMsg.remove();

         container.insertAdjacentHTML('afterbegin', html);
         const newEl = document.getElementById(`post-${serverPost.__backendId}`);
         if (newEl) {
            newEl.style.backgroundColor = '#f0fdf4';
            setTimeout(() => newEl.style.backgroundColor = '', 2000);
         }
      }
   }
}


async function handlePostSubmit() {
   const contentInput = document.getElementById('post-input');
   const content = contentInput.value;
   const postBtn = document.getElementById('post-btn');
   const isHD = document.getElementById('hd-quality-switch').checked;
   const finalLayout = selectedLayout;
   const imagesToProcess = [...currentImages];
   const previewsToSave = [...currentImagePreviews];

   const isUpdateMode = isEditingPost;
   const postIdToUpdate = currentEditPostId;

   if (!content && imagesToProcess.length === 0) {
      showToast('Vui lòng viết gì đó hoặc thêm ảnh!');
      return;
   }

   lastUserActionTime = Date.now();
   pendingTasksCount++;
   postBtn.disabled = true;
   let tempId;

   if (isUpdateMode && postIdToUpdate) {
      tempId = postIdToUpdate;
      const postIndex = serverFeedData.findIndex(p => p.__backendId === tempId);
      if (postIndex !== -1) {
         serverFeedData[postIndex] = {
            ...serverFeedData[postIndex],
            content: content,
            imageData: JSON.stringify(previewsToSave),
            layout: finalLayout,
            isUploading: true,
            uploadStatus: 'Đang lưu...'
         };
      }
   } else {
      tempId = 'temp_' + Date.now();
      const now = new Date();
      const newOptimisticPost = {
         __backendId: tempId,
         username: currentProfile ? currentProfile.username : 'AnDanh',
         fullname: currentProfile ? currentProfile.fullName : 'Ẩn Danh',
         avatar: currentProfile ? currentProfile.avatarData : '',
         content: content,
         imageData: JSON.stringify(previewsToSave),
         createdAt: "Vừa xong",
         timestamp: now.getTime(),
         layout: finalLayout,
         likes: 0,
         liked: false,
         comments: '[]',
         isUploading: true,
         uploadStatus: 'Đang xử lý...'
      };
      serverFeedData.unshift(newOptimisticPost);
   }

   renderPosts();

   if (currentTab !== 'feed') document.querySelector('[data-tab="feed"]').click();
   createPostModal.hide();

   try {
      let finalImageData = [];
      if (imagesToProcess.length > 0) {
         for (let i = 0; i < imagesToProcess.length; i++) {
            const item = imagesToProcess[i];
            if (typeof item === 'string') {
               finalImageData.push(item);
               continue;
            }
            const file = item;
            const qualityText = isHD ? "HD" : "SD";
            updatePostStatus(tempId, `Send ${i + 1}/${imagesToProcess.length} (${qualityText})`);

            if (isHD) {
               if (i > 0) await new Promise(r => setTimeout(r, 500));
               const base64Data = await readFileAsBase64(file);
               const fileName = new Date().getTime() + "_" + i;

               const res = await sendToServer({
                  action: 'upload_single_image',
                  image: base64Data,
                  name: fileName
               });
               if (res.status === 'success') finalImageData.push(res.url);
               else throw new Error("Lỗi ảnh số " + (i + 1));
            } else {
               const compressedBase64 = await compressImage(file, 1920, 0.8);
               finalImageData.push(compressedBase64);
            }
         }
      }
      updatePostStatus(tempId, 'Post...');

      const res = await sendToServer({
         action: 'feed_action',
         type: isUpdateMode ? 'update' : 'create',
         id: isUpdateMode ? postIdToUpdate : undefined,
         username: currentProfile ? currentProfile.username : 'Anonymous',
         content: content,
         image: JSON.stringify(finalImageData),
         layout: finalLayout,
         fingerprint: userFingerprint
      });

      if (res.status === 'success') {
         const targetId = isUpdateMode ? postIdToUpdate : tempId;
         const finalPost = serverFeedData.find(p => p.__backendId === targetId);

         if (finalPost) {
            if (!isUpdateMode && res.id) finalPost.__backendId = res.id;
            if (res.time) finalPost.createdAt = res.time;
            if (res.images && res.images.length > 0) finalPost.imageData = JSON.stringify(res.images);

            delete finalPost.isUploading;
            delete finalPost.uploadStatus;

            renderPosts();
            showToast(isUpdateMode ? 'Đã cập nhật bài viết!' : 'Đã đăng thành công!');
         }
      } else {
         throw new Error(res.message);
      }

   } catch (err) {
      console.error("Lỗi:", err);
      showToast('Lỗi: ' + err.message);
      const badgeEl = document.getElementById(`status-badge-${tempId}`);
      if (badgeEl) {
         badgeEl.className = "badge bg-danger text-white ms-auto";
         badgeEl.innerHTML = `<i class="bi bi-exclamation-triangle me-1"></i> Lỗi`;
      }
   } finally {
      postBtn.disabled = false;
      postBtn.innerHTML = '<i class="bi bi-send me-2"></i>Đăng bài';
      pendingTasksCount--;

      if (contentInput) contentInput.value = '';
      currentImages = [];
      currentImagePreviews = [];
      document.getElementById('hd-quality-switch').checked = true;
   }
}

// Hàm phụ trợ cập nhật trạng thái UI cho gọn code
function updatePostStatus(tempId, text) {
   const tempPost = serverFeedData.find(p => p.__backendId === tempId);
   if (tempPost) tempPost.uploadStatus = text;

   const badgeEl = document.getElementById(`status-badge-${tempId}`);
   if (badgeEl) {
      badgeEl.innerHTML = `
      					<span class="spinner-border spinner-border-sm me-1" style="width: 0.7rem; height: 0.7rem;"></span>
      					${text}
      				`;
   }
}

// --- HÀM XÓA BÀI VIẾT ---
async function deletePost(postId) {
   if (!confirm('Bạn có chắc chắn muốn xóa bài viết này?')) return;
   const postEl = document.getElementById(`post-${postId}`);
   if (postEl) {
      postEl.style.transition = "opacity 0.5s";
      postEl.style.opacity = "0";
      setTimeout(() => postEl.remove(), 500);
   }

   try {
      const res = await sendToServer({
         action: 'feed_action',
         type: 'delete',
         id: postId
      });

      if (res.status === 'success' || res.result === 'success') {
         showToast('Đã xóa bài viết');
      } else {
         showToast('Lỗi xóa server: ' + res.message);
         loadFeedData();
      }
   } catch (e) {
      console.error(e);
      showToast('Lỗi kết nối!');
   }
}

function openEditPost(id) {
   let post = null;
   if (typeof serverFeedData !== 'undefined' && serverFeedData.length > 0) {
      post = serverFeedData.find(d => d.__backendId === id);
   }
   if (!post) post = allData.find(d => d.__backendId === id);

   if (!post) {
      showToast("Không tìm thấy dữ liệu bài viết!");
      return;
   }
   isEditingPost = true;
   currentEditPostId = id;
   const contentInput = document.getElementById('post-input');
   if (contentInput) contentInput.value = post.content || '';
   currentImages = parseImages(post.imageData);
   currentImagePreviews = [...currentImages];
   let postLayout = post.layout;
   if (!postLayout || postLayout === 'auto') postLayout = 'grid-2x2';

   selectedLayout = postLayout;

   if (currentImages.length >= 3) {
      document.getElementById('layout-selector').classList.remove('d-none');
      updateLayoutSelectionUI(selectedLayout);
   } else {
      document.getElementById('layout-selector').classList.add('d-none');
      updateLayoutSelectionUI('grid-2x2');
   }
   updateImagePreview();
   const modalTitle = document.querySelector('#createPostModal .modal-title');
   if (modalTitle) modalTitle.textContent = "Chỉnh sửa bài viết";

   const modalBtn = document.querySelector('#createPostModal .btn-primary');
   if (modalBtn) modalBtn.innerHTML = '<i class="bi bi-check-circle me-2"></i>Lưu thay đổi';
   createPostModal.show();
   postOptionsModal.hide();
}

const createPostModalEl = document.getElementById('createPostModal');
if (createPostModalEl) {
   createPostModalEl.addEventListener('hidden.bs.modal', function () {
      isEditingPost = false;
      currentEditPostId = null;
      const contentInput = document.getElementById('post-input');
      if (contentInput) contentInput.value = '';
      currentImages = [];
      updateImagePreview();
      document.querySelector('#createPostModal .modal-title').textContent = "Tạo bài viết";
      const modalBtn = document.querySelector('#createPostModal .btn-primary');
      if (modalBtn) modalBtn.innerHTML = '<i class="bi bi-send me-2"></i>Đăng bài';
      selectedLayout = 'grid-2x2';
   });
}

// Hàm Render chính (Hỗ trợ Append)
function renderPostsPaged(newPosts, page) {
   const container = document.getElementById('posts-container');

   // Xóa trigger cũ
   const oldTrigger = document.getElementById('feed-load-more');
   if (oldTrigger) oldTrigger.remove();

   // Nếu trang 1: Xóa trắng container và check rỗng
   if (page === 1) {
      container.innerHTML = '';
      if (!newPosts || newPosts.length === 0) {
         container.innerHTML = `
      						<div class="text-center py-5">
      							<i class="bi bi-newspaper theme-text-primary" style="font-size: 4rem;"></i>
      							<p class="fw-semibold fs-5 mt-3">Chưa có bài đăng</p>
      							<p class="text-muted">Nhấn + để tạo bài viết đầu tiên</p>
      						</div>
      					`;
         return;
      }
   }

   // Append bài mới
   let html = newPosts.map(post => createPostHtml(post)).join('');
   container.insertAdjacentHTML('beforeend', html);
   if (feedHasMore) {
      const trigger = document.createElement('div');
      trigger.id = 'feed-load-more';
      trigger.className = 'py-4 text-center text-muted small';
      trigger.innerHTML = `<div class="spinner-border spinner-border-sm text-secondary" role="status"></div> Đang tải thêm tin...`;

      // Gán hàm callback trực tiếp vào element
      trigger._onIntersect = () => {
         if (!feedLoading) {
            feedPage++;
            loadFeedData(feedPage);
         }
      };

      container.appendChild(trigger);

      // Yêu cầu Observer toàn cục theo dõi phần tử này
      globalScrollObserver.observe(trigger);
   } else if (page > 1) {
      // Đã hết tin để load
      container.insertAdjacentHTML('beforeend', '<div class="text-center py-4 text-muted small">--- Bạn đã xem hết tin ---</div>');
   }
}
function renderPosts() {
   renderPostsPaged(serverFeedData, 1);
}

function renderComments(postId) {
   const post = allData.find(d => d.__backendId === postId);
   if (!post) return;

   const comments = parseComments(post.comments);
   const container = document.getElementById('comments-list');

   if (comments.length === 0) {
      container.innerHTML = `<p class="text-center text-muted py-5">Chưa có bình luận</p>`;
      return;
   }

   container.innerHTML = comments.map(comment => `
      			<div class="card mb-2">
      			  <div class="card-body p-3">
      				<div class="d-flex align-items-center mb-2">
      				  <div class="avatar-circle avatar-circle-sm me-2" style="width: 32px; height: 32px;">
      					<span class="small theme-text-primary fw-bold">${comment.author?.[0]?.toUpperCase() || 'U'}</span>
      				  </div>
      				  <div>
      					<p class="fw-bold small mb-0">${comment.author || 'Người dùng'}</p>
      					<small class="text-muted">${formatDate(comment.time)}</small>
      				  </div>
      				</div>
      				<p class="mb-0 ms-5">${comment.text}</p>
      			  </div>
      			</div>
      		  `).join('');
}

function updateImagePreview() {
   const previewContainer = document.getElementById('image-preview-container');
   const imageOptions = document.getElementById('image-options');
   const layoutSelector = document.getElementById('layout-selector');
   const postBtn = document.getElementById('post-btn');
   const imageCount = document.getElementById('image-count');
   const gridContainer = document.getElementById('images-preview-grid');

   if (currentImages.length === 0) {
      previewContainer.classList.add('d-none');
      imageOptions.classList.add('d-none');
      layoutSelector.classList.add('d-none');
      postBtn.disabled = !document.getElementById('post-input').value.trim();
      return;
   }
   previewContainer.classList.remove('d-none');
   imageCount.textContent = currentImages.length;
   postBtn.disabled = false;

   imageOptions.classList.remove('d-none');

   if (currentImages.length >= 3) {
      layoutSelector.classList.remove('d-none');
   } else {
      layoutSelector.classList.add('d-none');
   }

   gridContainer.innerHTML = renderPostImages(currentImagePreviews, selectedLayout);
}

// Sửa thêm: Nút xóa tất cả
document.getElementById('clear-all-images').addEventListener('click', () => {
   currentImages = [];
   currentImagePreviews = [];
   updateImagePreview();
});


// Layout Selection 
document.querySelectorAll('.layout-preview-box').forEach(opt => {
   opt.addEventListener('click', () => {
      const layout = opt.dataset.layout;
      updateLayoutSelectionUI(layout);
      updateImagePreview();
   });
});

// Create Post
const postInput = document.getElementById('post-input');
const postBtn = document.getElementById('post-btn');
const imageInput = document.getElementById('image-input');

postInput.addEventListener('input', () => {
   postBtn.disabled = !postInput.value.trim() && currentImages.length === 0;
});

// --- SỬA LẠI SỰ KIỆN CHỌN ẢNH ---
imageInput.addEventListener('change', async (e) => {
   const files = Array.from(e.target.files);
   if (files.length === 0) return;
   // [THÊM DÒNG NÀY] Luôn tự động bật HD khi người dùng chọn ảnh mới
   document.getElementById('hd-quality-switch').checked = true;
   // Giới hạn 50 ảnh
   if (currentImages.length + files.length > 50) {
      showToast('Chỉ được chọn tối đa 50 ảnh!');
      return;
   }
   showLoading();
   for (const file of files) {
      // 1. Lưu file gốc vào mảng
      currentImages.push(file);
      // Dùng hàm nén cũ để tạo thumbnail hiển thị cho đỡ lag máy
      const previewBase64 = await compressImage(file, 300, 0.6);
      currentImagePreviews.push(previewBase64);
   }

   if (currentImages.length >= 3) {
      updateLayoutSelectionUI('1-wide');
   } else {
      updateLayoutSelectionUI('grid-2x2');
   }
   hideLoading();
   updateImagePreview();
   e.target.value = '';
});

document.getElementById('images-preview-grid').addEventListener('click', (e) => {
   const removeBtn = e.target.closest('.remove-preview-img');
   if (removeBtn) {
      const index = parseInt(removeBtn.dataset.index);
      currentImages.splice(index, 1);
      updateImagePreview();
   }
});

document.getElementById('clear-all-images').addEventListener('click', () => {
   currentImages = [];
   updateImagePreview();
});

// Reset lại modal về chế độ "Tạo mới" khi đóng
document.getElementById('createPostModal').addEventListener('hidden.bs.modal', function () {
   isEditingPost = false;
   currentEditPostId = null;
   const postInputEl = document.getElementById('post-input');
   if (postInputEl) postInputEl.value = '';
   currentImages = [];
   updateImagePreview();
   document.querySelector('#createPostModal .modal-title').textContent = "Tạo bài viết";
   const postBtn = document.getElementById('post-btn');
   if (postBtn) postBtn.innerHTML = '<i class="bi bi-send me-2"></i>Đăng bài';
   document.getElementById('hd-quality-switch').checked = true;
   updateLayoutSelectionUI('1-wide');
});

// --- SỰ KIỆN TƯƠNG TÁC BÀI VIẾT (LIKE, COMMENT, MENU) ---
document.getElementById('posts-container').addEventListener('click', async (e) => {

   // A. XỬ LÝ LIKE (CẬP NHẬT LẠC QUAN)
   const likeBtn = e.target.closest('.like-btn');
   if (likeBtn) {
      // Chặn click liên tục
      if (likeBtn.disabled) return;

      // 1. Lấy trạng thái hiện tại từ giao diện
      const icon = likeBtn.querySelector('i');
      const textSpan = likeBtn.querySelector('span');
      const isCurrentlyLiked = icon.classList.contains('bi-heart-fill');
      const postId = likeBtn.dataset.id;

      // 2. Cập nhật UI NGAY LẬP TỨC (Không chờ Server)
      if (isCurrentlyLiked) {
         // Đang thích -> Bỏ thích
         icon.className = 'bi bi-heart fs-5'; // Trái tim rỗng
         icon.classList.remove('text-danger');

         let currentCount = parseInt(textSpan.textContent) || 0;
         // Nếu đang là chữ 'Thích' thì coi là 0
         if (isNaN(currentCount)) currentCount = 0;

         const newCount = Math.max(0, currentCount - 1);
         textSpan.textContent = newCount > 0 ? newCount : 'Thích';

         likeBtn.classList.remove('active');
      } else {
         // Chưa thích -> Thích
         icon.className = 'bi bi-heart-fill text-danger fs-5'; // Trái tim đặc đỏ

         let currentCount = parseInt(textSpan.textContent) || 0;
         if (isNaN(currentCount)) currentCount = 0;

         textSpan.textContent = currentCount + 1;

         // Thêm hiệu ứng nhún nhảy
         likeBtn.classList.add('active');
      }

      // 3. Gửi lệnh lên Server (Chạy ngầm)
      try {
         const username = currentProfile ? currentProfile.username : 'anonymous';
         const res = await sendToServer({
            action: 'like_post',
            postId: postId,
            username: username
         });

         // Nếu server trả về số lượng chính xác, cập nhật lại cho chuẩn
         if (res.status === 'success' && res.newCount !== undefined) {
            textSpan.textContent = res.newCount > 0 ? res.newCount : 'Thích';
         }
      } catch (e) {
         console.error("Lỗi like:", e);
         // Nếu lỗi mạng nghiêm trọng thì có thể revert UI lại ở đây (tùy chọn)
      }
      return;
   }

   // B. XỬ LÝ MỞ COMMENT
   const commentBtn = e.target.closest('.comment-btn');
   if (commentBtn) {
      currentPostId = commentBtn.dataset.id;
      // Load comment từ server thay vì từ dữ liệu post cũ
      loadCommentsForPost(currentPostId);
      commentModal.show();
      return;
   }

   // C. XỬ LÝ MENU 3 CHẤM (Sửa/Xóa)
   const menuBtn = e.target.closest('.post-menu-btn');
   if (menuBtn) {
      currentPostId = menuBtn.dataset.id;
      postOptionsModal.show();
   }
});

// Post Options 
document.getElementById('edit-post-option').addEventListener('click', () => {
   openEditPost(currentPostId);
});

document.getElementById('delete-post-option').addEventListener('click', () => {
   postOptionsModal.hide();
   showDeleteConfirm('Xóa bài đăng này?', currentPostId, 'post');
});

// Comments
document.getElementById('commentModal').addEventListener('hidden.bs.modal', () => {
   currentPostId = null;
});

// --- GỬI COMMENT ---
document.getElementById('send-comment').addEventListener('click', async () => {
   const input = document.getElementById('comment-input');
   const text = input.value.trim();
   if (!text || !currentPostId) return;

   const container = document.getElementById('comments-list');
   // 1. Tạo dữ liệu giả lập (Optimistic Data)
   const tempId = 'temp_' + Date.now();
   const tempComment = {
      id: tempId,
      username: currentProfile.username,
      fullname: currentProfile.fullName,
      avatar: currentProfile.avatarData,
      content: text,
      formattedTime: "Đang gửi..."
   };
   // 2. Hiển thị ngay lập tức
   if (container.querySelector('.bi-chat-dots')) {
      container.innerHTML = '';
   }
   const html = createCommentHtml(tempComment);
   container.insertAdjacentHTML('beforeend', html);
   // Cuộn xuống cuối
   const newItem = document.getElementById(`comment-${tempId}`);
   if (newItem) newItem.scrollIntoView({
      behavior: 'smooth',
      block: 'end'
   });
   input.value = '';

   // 3. Gửi Server (Background)
   try {
      const res = await sendToServer({
         action: 'comment_action',
         type: 'add',
         postId: currentPostId,
         username: currentProfile.username,
         content: text
      });

      if (res.status === 'success') {
         if (newItem) {
            // 1. SỬA LỖI HIỂN THỊ: Cập nhật text thời gian
            const timeEl = newItem.querySelector('small.text-muted');
            if (timeEl) timeEl.textContent = "Vừa xong";

            // 2. CẬP NHẬT ID THẬT
            if (res.id) {
               // Đổi ID của dòng comment
               newItem.id = `comment-${res.id}`;

               // Cập nhật data-id cho nút 3 chấm (Menu tùy chọn)
               const optionBtn = newItem.querySelector('.comment-options-btn');
               if (optionBtn) {
                  optionBtn.dataset.id = res.id;
                  // Cập nhật lại nội dung gốc vào data-content để tính năng Sửa hoạt động đúng
                  optionBtn.dataset.content = text;
               }
            }
         }
      } else {
         throw new Error("Server error");
      }
   } catch (e) {
      // Lỗi: Xóa comment giả đi và báo lỗi, trả lại nội dung vào ô nhập
      if (newItem) newItem.remove();
      input.value = text;
      showToast('Lỗi gửi bình luận! Vui lòng thử lại.');
   }
});

// --- XÓA COMMENT 
document.getElementById('comments-list').addEventListener('click', async (e) => {
   const deleteBtn = e.target.closest('.delete-comment-btn');
   if (deleteBtn) {
      if (!confirm("Xóa bình luận này?")) return;
      const cmtId = deleteBtn.dataset.id;
      const commentItem = document.getElementById(`comment-${cmtId}`);
      if (commentItem) {
         commentItem.style.transition = "opacity 0.3s, height 0.3s";
         commentItem.style.opacity = "0";
         setTimeout(() => commentItem.style.display = "none", 300);
      }
      // 2. Gửi Server (Background)
      try {
         const res = await sendToServer({
            action: 'comment_action',
            type: 'delete',
            commentId: cmtId,
            username: currentProfile.username
         });

         if (res.status !== 'success') {
            throw new Error("Lỗi xóa");
         }
      } catch (e) {
         if (commentItem) {
            commentItem.style.display = "flex";
            setTimeout(() => commentItem.style.opacity = "1", 50);
         }
         showToast('Không thể xóa bình luận!');
      }
   }
});

// --- TÍNH NĂNG XEM ẢNH FULL (LIGHTBOX) ---

// Gắn sự kiện click cho container chứa bài viết
document.getElementById('posts-container').addEventListener('click', (e) => {
   // Tìm xem người dùng có click vào khung ảnh (.img-box) không
   const imgBox = e.target.closest('.img-box');

   if (imgBox) {
      // Tìm bài viết tương ứng
      const postCard = imgBox.closest('.post-card');
      if (postCard) {
         // Lấy ID bài viết (dạng post-UID -> lấy UID)
         const postId = postCard.id.replace('post-', '');
         openImageViewer(postId);
      }
   }
});

function openImageViewer(postId) {
   // 1. Tìm dữ liệu bài viết
   const post = serverFeedData.find(p => p.__backendId === postId);
   if (!post) return;

   // 2. Lấy danh sách ảnh
   const images = parseImages(post.imageData);
   if (!images || images.length === 0) return;

   // 3. Render ảnh vào Modal
   const container = document.getElementById('full-image-list');
   const counter = document.getElementById('viewer-counter');

   container.innerHTML = '';
   counter.textContent = `Chi tiết (${images.length} ảnh)`;

   images.forEach((imgUrl, index) => {
      // Tạo container wrapper
      const wrapper = document.createElement('div');
      wrapper.className = "lightbox-item"; // Sử dụng class CSS mới tạo

      // Tạo thẻ ảnh
      const img = document.createElement('img');
      img.src = imgUrl;
      img.className = "lightbox-image"; // Sử dụng class CSS mới tạo
      img.alt = `Ảnh chi tiết ${index + 1}`;

      // Lazy load để mở modal nhanh hơn
      img.loading = "lazy";

      wrapper.appendChild(img);
      container.appendChild(wrapper);
   });

   // 4. Hiển thị Modal
   imageViewerModal.show();
}

document.getElementById('imageViewerModal').addEventListener('hidden.bs.modal', function () {
   document.getElementById('full-image-list').innerHTML = '';
});

function processNewFeedData(newPosts) {
   if (!serverFeedData) return;

   const container = document.getElementById('posts-container');

   if (newPosts.length > 0) {
      const oldestFetchedTime = newPosts[newPosts.length - 1].timestamp;
      [...serverFeedData].forEach((localPost) => {
         if (localPost.timestamp >= oldestFetchedTime) {
            const stillExists = newPosts.some(p => p.__backendId === localPost.__backendId);

            if (!stillExists) {
               const el = document.getElementById(`post-${localPost.__backendId}`);
               if (el) {
                  el.style.transition = "all 0.5s";
                  el.style.opacity = "0";
                  el.style.height = "0";
                  setTimeout(() => el.remove(), 500);
               }
               const realIndex = serverFeedData.findIndex(p => p.__backendId === localPost.__backendId);
               if (realIndex > -1) serverFeedData.splice(realIndex, 1);

               console.log("Đã đồng bộ: Xóa bài", localPost.__backendId);
            }
         }
      });
   }
   for (let i = newPosts.length - 1; i >= 0; i--) {
      const serverPost = newPosts[i];
      const localIndex = serverFeedData.findIndex(p => p.__backendId === serverPost.__backendId);

      // --- TRƯỜNG HỢP 1: BÀI VIẾT MỚI (ADD) ---
      if (localIndex === -1) {
         serverFeedData.unshift(serverPost);

         if (container) {
            // Xóa thông báo rỗng nếu có
            const emptyMsg = container.querySelector('.text-center.py-5');
            if (emptyMsg && emptyMsg.innerText.includes('Chưa có bài')) emptyMsg.remove();

            const postHtml = createPostHtml(serverPost);
            container.insertAdjacentHTML('afterbegin', postHtml);

            // Hiệu ứng highlight màu xanh nhẹ
            const newEl = document.getElementById(`post-${serverPost.__backendId}`);
            if (newEl) {
               newEl.style.backgroundColor = "#f0fdf4";
               setTimeout(() => newEl.style.backgroundColor = "", 2000);
            }
         }
      }
      // --- TRƯỜNG HỢP 2: BÀI VIẾT ĐÃ CÓ (UPDATE) ---
      else {
         const localPost = serverFeedData[localIndex];

         // So sánh xem có gì thay đổi không (Nội dung, Ảnh, Layout, Like...)
         const isChanged =
            localPost.content !== serverPost.content ||
            localPost.imageData !== serverPost.imageData ||
            localPost.layout !== serverPost.layout ||
            localPost.likes !== serverPost.likes;

         if (isChanged) {
            console.log("Đã đồng bộ: Cập nhật bài", serverPost.__backendId);

            // A. Cập nhật dữ liệu vào bộ nhớ (Merge đè lên cái cũ)
            serverFeedData[localIndex] = {
               ...localPost,
               ...serverPost
            };

            // B. Vẽ lại giao diện (Render lại HTML)
            const existingEl = document.getElementById(`post-${serverPost.__backendId}`);
            if (existingEl) {
               // Tạo HTML mới từ dữ liệu mới
               const newHtmlFull = createPostHtml(serverPost);

               // Mẹo: Tạo div tạm để lấy nội dung bên trong, giữ nguyên thẻ bao ngoài cũ
               const tempDiv = document.createElement('div');
               tempDiv.innerHTML = newHtmlFull;
               const newContent = tempDiv.firstElementChild.innerHTML;

               // Gán nội dung mới vào
               existingEl.innerHTML = newContent;

               // Hiệu ứng nháy vàng nhẹ báo hiệu vừa update
               existingEl.style.transition = "background-color 0.5s";
               existingEl.style.backgroundColor = "#fffbeb";
               setTimeout(() => existingEl.style.backgroundColor = "", 1000);
            }
         }
      }
   }
}

// Hàm cập nhật giao diện ô chọn Layout (Highlight ô được chọn)
function updateLayoutSelectionUI(layoutName) {
   // Cập nhật biến toàn cục
   selectedLayout = layoutName;

   // Cập nhật giao diện (xóa class selected cũ, thêm vào ô mới)
   document.querySelectorAll('.layout-preview-box').forEach(opt => {
      opt.classList.remove('selected');
      if (opt.dataset.layout === layoutName) {
         opt.classList.add('selected');
      }
   });
}

document.getElementById('posts-container').addEventListener('click', async (e) => {
   const showInputBtn = e.target.closest('.show-comment-input-btn');
   if (showInputBtn) {
      const pid = showInputBtn.dataset.id;
      const box = document.getElementById(`comment-input-box-${pid}`);
      box.classList.toggle('d-none');
      if (!box.classList.contains('d-none')) {
         document.getElementById(`input-cmt-${pid}`).focus();
      }
      return;
   }
   const sendBtn = e.target.closest('.send-inline-cmt-btn');
   if (sendBtn) {
      const pid = sendBtn.dataset.id;
      const input = document.getElementById(`input-cmt-${pid}`);
      const content = input.value.trim();
      if (!content) return;

      const container = document.getElementById(`comments-container-${pid}`);
      const tempId = 'temp_' + Date.now();
      const tempCmt = {
         id: tempId,
         username: currentProfile.username,
         fullname: currentProfile.fullName,
         avatar: currentProfile.avatarData,
         content: content,
         formattedTime: "Đang gửi..."
      };

      // Nếu chưa có class padding thì thêm vào cho đẹp
      if (!container.parentElement.classList.contains('bg-light')) {
         container.parentElement.className = "comments-section bg-light rounded-3 p-2 mt-3 fade-in";
      }

      container.insertAdjacentHTML('beforeend', createCommentHtml(tempCmt));
      input.value = '';

      try {
         const res = await sendToServer({
            action: 'comment_action',
            type: 'add',
            postId: pid,
            username: currentProfile.username,
            content: content
         });

         if (res.status === 'success') {
            // 1. Tìm lại dòng bình luận vừa thêm bằng ID tạm
            const newItem = document.getElementById(`comment-${tempId}`);
            if (newItem) {
               // 2. Cập nhật thời gian: "Đang gửi..." -> "Vừa xong"
               // Tìm thẻ small có class text-muted chứa thời gian
               const timeEl = newItem.querySelector('small.text-muted');
               if (timeEl) timeEl.textContent = "Vừa xong";

               if (res.id) {
                  newItem.id = `comment-${res.id}`;
                  const optionBtn = newItem.querySelector('.comment-options-btn');
                  if (optionBtn) {
                     optionBtn.dataset.id = res.id;
                     optionBtn.dataset.content = content;
                  }
               }
            }
         }
      } catch (e) {
         console.error(e);
         const newItem = document.getElementById(`comment-${tempId}`);
         if (newItem) newItem.remove();
         showToast('Lỗi gửi bình luận!');
      }
      return;
   }

   // C. BẤM MENU 3 CHẤM CỦA COMMENT
   const optBtn = e.target.closest('.comment-options-btn');
   if (optBtn) {
      currentCommentId = optBtn.dataset.id;
      currentCommentContent = optBtn.dataset.content;
      commentOptionsModal.show();
   }
});

// 2. XỬ LÝ TRONG MODAL TÙY CHỌN COMMENT

document.getElementById('delete-comment-btn').addEventListener('click', () => {
   if (!currentCommentId) return;

   commentOptionsModal.hide();

   showDeleteConfirm('Bạn có chắc muốn xóa bình luận này?', currentCommentId, 'comment');
});

// Nút Sửa (Mở modal nhập liệu)
document.getElementById('edit-comment-btn').addEventListener('click', () => {
   commentOptionsModal.hide();
   document.getElementById('edit-comment-input').value = currentCommentContent;
   editCommentContentModal.show();
});

// Nút Lưu (Trong modal sửa)
document.getElementById('save-edit-comment').addEventListener('click', async () => {
   const newContent = document.getElementById('edit-comment-input').value.trim();
   if (!newContent || !currentCommentId) return;

   editCommentContentModal.hide();

   // UI Lạc quan: Cập nhật text ngay
   const el = document.getElementById(`comment-${currentCommentId}`);
   if (el) {
      const oldContent = currentCommentContent; // Lưu nội dung cũ
      el.querySelector('.content-text').textContent = newContent;
      // Cập nhật lại data-content cho nút 3 chấm để lần sau sửa tiếp
      const btn = el.querySelector('.comment-options-btn');
      if (btn) btn.dataset.content = newContent;
   }


   try {
      // Gửi Server
      await sendToServer({
         action: 'comment_action',
         type: 'edit',
         commentId: currentCommentId,
         username: currentProfile.username,
         content: newContent
      });
   } catch (e) {
      el.querySelector('.content-text').textContent = oldContent; // Hoàn tác nếu lỗi
      showToast('Lỗi sửa bình luận');
   }

});

async function loadCommentsForPost(postId) {
   const container = document.getElementById('comments-list');
   container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

   try {
      const res = await sendToServer({
         action: 'get_post_comments',
         postId: postId
      });

      if (res.status === 'success') {
         const comments = res.data;
         if (!comments || comments.length === 0) {
            container.innerHTML = `<div class="text-center py-5">
      							<i class="bi bi-chat-dots text-muted" style="font-size: 3rem;"></i>
      							<p class="text-muted mt-2">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
      						</div>`;
         } else {
            // Sử dụng hàm helper đã tạo ở trên
            container.innerHTML = comments.map(cmt => createCommentHtml(cmt)).join('');
         }
      } else {
         container.innerHTML = '<p class="text-center text-muted py-5">Lỗi tải bình luận</p>';
      }
   } catch (e) {
      console.error(e);
      container.innerHTML = '<p class="text-center text-muted py-5">Lỗi kết nối</p>';
   }
}



// Hàm 2: Thống kê Hashtag từ dữ liệu feed
function renderTrendingTags() {
   if (!serverFeedData || serverFeedData.length === 0) return;

   const tagCounts = {};

   // Quét toàn bộ bài viết để đếm tag
   serverFeedData.forEach(post => {
      if (!post.content) return;
      // Tìm tất cả các tag trong nội dung
      const matches = post.content.match(/#[\w\p{L}]+(?=\s|$)/gu);
      if (matches) {
         matches.forEach(tag => {
            const cleanTag = tag.trim(); // Bỏ khoảng trắng thừa
            tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
         });
      }
   });

   // Chuyển thành mảng và sắp xếp giảm dần theo số lượng
   const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1]) // Sắp xếp count giảm dần
      .slice(0, 10); // Lấy top 10

   const container = document.getElementById('trending-tags-container');
   if (!container) return;

   if (sortedTags.length === 0) {
      container.style.display = 'none'; // Ẩn nếu không có tag nào
      return;
   } else {
      container.style.display = 'flex';
   }

   // Render HTML
   container.innerHTML = sortedTags.map(([tag, count]) => `
      				<div class="trending-tag-chip" onclick="filterByHashtag('${tag}')">
      					${tag} <span class="ms-1 badge bg-secondary rounded-pill" style="font-size: 0.6rem;">${count}</span>
      				</div>
      			`).join('');
}

// Hàm 3: Thực hiện lọc bài viết
function filterByHashtag(tag) {
   // 1. Lưu trạng thái
   currentHashFilter = tag;

   // 2. Hiện thanh thông báo
   document.getElementById('active-filter-bar').classList.remove('d-none');
   document.getElementById('current-filter-name').textContent = tag;

   const container = document.getElementById('posts-container');
   container.innerHTML = '';

   // 3. LỌC CLIENT: Lấy ngay bài có sẵn trong máy
   const localMatches = serverFeedData.filter(post => {
      return post.content && post.content.includes(tag);
   });

   // 4. Render bài Client ngay lập tức
   if (localMatches.length > 0) {
      const html = localMatches.map(post => createPostHtml(post)).join('');
      container.insertAdjacentHTML('beforeend', html);
   }

   // 5. Hiện Spinner "Đang tìm thêm..." ở dưới cùng
   const loaderHtml = createLoaderHtml('hashtag-server-loader', 'Đang tìm thêm các bài cũ hơn...', 'hashtag-loader');
   container.insertAdjacentHTML('beforeend', loaderHtml);

   // 6. Ẩn nút Load More mặc định của Feed (để tránh xung đột)
   const feedLoadMore = document.getElementById('feed-load-more');
   if (feedLoadMore) feedLoadMore.style.display = 'none';

   // Scroll lên đầu
   document.querySelector('.main-content').scrollTop = 0;

   // 7. GỌI SERVER
   const existingIds = localMatches.map(p => p.__backendId);
   loadServerHashtagResults(tag, existingIds);
}

// Hàm 4: Hủy lọc
function clearHashtagFilter() {
   currentHashFilter = null;
   document.getElementById('active-filter-bar').classList.add('d-none');

   // Render lại toàn bộ feed gốc
   renderPosts(); // Hàm cũ của bạn
}

async function loadServerHashtagResults(tag, existingIds) {
   try {
      // Gửi yêu cầu lên server: "Tìm cho tôi bài viết có tag này, lấy nhiều nhiều chút (ví dụ 50 bài)"
      const res = await sendToServer({
         action: 'get_feed',
         page: 1, // Luôn lấy từ trang 1 của kết quả lọc
         limit: 50, // Lấy số lượng lớn để quét được nhiều bài cũ
         hashtag: tag, // Server sẽ lọc theo cái này
         username: currentProfile ? currentProfile.username : ''
      });

      // Xóa Spinner loading
      const loader = document.getElementById('hashtag-server-loader');
      if (loader) loader.remove();

      if (res.status === 'success') {
         const serverPosts = res.data;
         const container = document.getElementById('posts-container');

         // 8. LỌC TRÙNG: Chỉ lấy những bài Server trả về mả Client CHƯA CÓ
         const newPosts = serverPosts.filter(p => !existingIds.includes(p.__backendId));

         if (newPosts.length > 0) {
            // Vẽ thêm bài mới vào dưới cùng
            const html = newPosts.map(post => createPostHtml(post)).join('');
            container.insertAdjacentHTML('beforeend', html);

            // Hiệu ứng báo hiệu có bài mới
            showToast(`Đã tìm thấy thêm ${newPosts.length} bài cũ`);
         } else {
            // Nếu server trả về toàn bài trùng với client
            if (existingIds.length > 0) {
               container.insertAdjacentHTML('beforeend',
                  '<div class="text-center py-4 text-muted small">--- Đã hiển thị hết bài viết ---</div>'
               );
            } else {
               // Trường hợp cả Client và Server đều không có bài nào
               container.innerHTML = `<div class="text-center py-5 text-muted">
      								<i class="bi bi-search" style="font-size: 2rem;"></i>
      								<p class="mt-2">Không tìm thấy bài viết nào chứa tag <b>${tag}</b></p>
      							</div>`;
            }
         }
      }
   } catch (e) {
      console.error(e);
      const loader = document.getElementById('hashtag-server-loader');
      if (loader) {
         loader.innerHTML = '<span class="text-danger">Lỗi tải thêm dữ liệu</span>';
      }
   }
}


// Helper: Hiệu ứng nháy sáng bài viết để gây chú ý
function highlightPost(element) {
   // Lưu lại màu nền cũ
   const originalBg = element.style.backgroundColor;

   element.style.transition = "box-shadow 0.5s, background-color 0.5s";
   element.style.boxShadow = "0 0 15px rgba(34, 197, 94, 0.5)"; // Shadow xanh
   element.style.backgroundColor = "#f0fdf4"; // Nền xanh nhạt

   // Sau 2 giây thì trả về bình thường
   setTimeout(() => {
      element.style.boxShadow = "";
      element.style.backgroundColor = originalBg || "";
   }, 2000);
}


function renderPostImages(images, layout) {
   if (!images || images.length === 0) return '';
   const count = images.length;
   let layoutClass = '';
   if (count === 1) {
      layoutClass = 'layout-1';
   } else if (count === 2) {
      layoutClass = 'layout-2';
   } else {
      const validLayout = layout || 'grid-2x2';

      if (validLayout === '1-wide') {
         layoutClass = 'layout-1-wide';
      } else if (validLayout === '1-tall') {
         layoutClass = 'layout-1-tall';
      } else {
         layoutClass = 'layout-grid-2x2';
      }
   }

   let html = `<div class="post-image-grid ${layoutClass}">`;

   let displayLimit = 4;
   if (layoutClass === 'layout-1-wide' || layoutClass === 'layout-1-tall') {
      displayLimit = 3; // Layout này chỉ đẹp khi hiện 3 ảnh (1 to 2 nhỏ)
   }

   const showCount = Math.min(count, displayLimit);

   for (let i = 0; i < showCount; i++) {
      html += `<div class="img-box">`;
      html += `<img src="${images[i]}" alt="Image">`;

      if (i === showCount - 1 && count > displayLimit) {
         html += `<div class="image-overlay">+${count - displayLimit}</div>`;
      }

      html += `</div>`;
   }

   html += '</div>';
   return html;
}

// --- HÀM RENDER POSTS 

function createPostHtml(post) {
   const displayName = post.fullname || post.username || 'Người dùng';
   const avatarUrl = post.avatar;
   const images = parseImages(post.imageData);
   const isOwner = currentProfile && currentProfile.username === post.username;
   const verifiedIcon = isOwner ? `<i class="bi bi-patch-check-fill text-primary ms-1"></i>` : '';
   const avatarHtml = createAvatarHtml(post, 'avatar-circle');
   let statusBadge = '';
   if (post.isUploading) {
      // TRƯỜNG HỢP 1: Đang đăng bài -> Hiện Spinner + Text trạng thái
      statusBadge = `
				   <div id="status-badge-${post.__backendId}" class="ms-auto d-flex align-items-center text-muted small">
					  <span class="spinner-border spinner-border-sm me-1" style="width: 0.8rem; height: 0.8rem;"></span>
					  ${post.uploadStatus || 'Đang xử lý...'}
				   </div>
				`;
   } else if (isOwner) {
      // TRƯỜNG HỢP 2: Bài đã đăng & Là chủ bài viết -> Hiện nút 3 chấm
      statusBadge = `
					<button class="btn btn-sm btn-link text-muted post-menu-btn ms-auto" data-id="${post.__backendId}">
						<i class="bi bi-three-dots"></i>
					</button>
				`;
   } else {
      // TRƯỜNG HỢP 3: Bài người khác -> Để trống
      statusBadge = '<div class="ms-auto"></div>';
   }
   // -----------------------------------------------------------

   // Xử lý nút Like (Tim đỏ hay Tim rỗng)
   const heartIconClass = post.liked ? 'bi-heart-fill text-danger' : 'bi-heart';
   const likeCountText = post.likes > 0 ? post.likes : 'Thích';
   const likeBtnClass = post.liked ? 'active' : '';

   // Xử lý thời gian hiển thị
   const timeDisplay = formatTimeSmart(post.timestamp || post.createdAt);
   // Xử lý hiển thị Bình luận (Hiện 2 cái đầu, còn lại ẩn)
   let commentsHtml = '';
   const comments = post.commentsData || []; // Dữ liệu comment đính kèm (nếu có)

   if (comments.length > 0) {
      const visibleComments = comments.slice(0, 2);
      const hiddenComments = comments.slice(2);
      // Tạo HTML cho các comment hiển thị
      let commentListHtml = visibleComments.map(c => createCommentHtml(c)).join('');
      // Nếu còn comment ẩn -> Tạo nút "Xem thêm"
      if (hiddenComments.length > 0) {
         const hiddenHtml = hiddenComments.map(c => createCommentHtml(c)).join('');
         commentListHtml += `
						<div id="hidden-comments-${post.__backendId}" class="d-none fade-in">
							${hiddenHtml}
						</div>
						<div class="text-start ms-5">
							<button class="btn btn-link btn-sm p-0 text-decoration-none text-muted fw-bold" style="font-size: 0.8rem;"
									onclick="document.getElementById('hidden-comments-${post.__backendId}').classList.remove('d-none'); this.remove();">
								Xem thêm ${hiddenComments.length} bình luận khác...
							</button>
						</div>`;
      }
      commentsHtml = `<div class="comments-section mt-0 fade-in"><div id="comments-container-${post.__backendId}">${commentListHtml}</div></div>`;
   } else {
      commentsHtml = `<div class="comments-section mt-2" id="comments-container-${post.__backendId}"></div>`;
   }

   return `
				<div class="post-card p-3 fade-in" id="post-${post.__backendId}">
					
					<div class="d-flex align-items-center mb-2">
						<div class="avatar-circle avatar-circle-sm me-2 overflow-hidden border">
							${avatarHtml}
						</div>
						<div>
							<p class="mb-0 d-flex align-items-center post-author-name"> 
								${displayName} ${verifiedIcon}
							</p>
							<div class="post-timestamp"> 
								${timeDisplay}
							</div>
						</div>
						${statusBadge}
					</div>
					
					${post.content ? `<div class="post-content-text">${processTextWithHashtags(post.content)}</div>` : ''}
					${renderPostImages(images, post.layout || 'grid-2x2')}
					
					<div class="d-flex gap-4 my-2" style="margin-left: 15px !important;">
						<button class="btn btn-sm btn-link text-decoration-none text-muted d-flex align-items-center justify-content-start ps-0 gap-2 like-btn ${likeBtnClass}" 
								data-id="${post.__backendId}" ${post.isUploading ? 'disabled' : ''}>
							<i class="bi ${heartIconClass} fs-5"></i>
							<span>${likeCountText}</span>
						</button>
						
						<button class="btn btn-sm btn-link text-decoration-none text-muted d-flex align-items-center justify-content-start gap-2 show-comment-input-btn" 
								data-id="${post.__backendId}" ${post.isUploading ? 'disabled' : ''}>
							<i class="bi bi-chat fs-5"></i>
							<span>Bình luận</span>
						</button>
					</div>

					${commentsHtml}

					<div class="d-flex align-items-center mt-2 gap-2 d-none" id="comment-input-box-${post.__backendId}">
						<input type="text" class="form-control form-control-sm rounded-pill bg-light border-0" 
							   id="input-cmt-${post.__backendId}" placeholder="Viết bình luận...">
						<button class="btn btn-sm btn-primary rounded-circle send-inline-cmt-btn" data-id="${post.__backendId}">
							<i class="bi bi-send-fill"></i>
						</button>
					</div>
				</div>
			`;
}

function createCommentHtml(cmt) {
   const currentUser = currentProfile ? currentProfile.username : '';
   const isOwner = (currentUser && cmt.username === currentUser);

   const menuHtml = isOwner ?
      `<button class="btn btn-sm text-muted p-0 comment-options-btn" 
					 style="line-height: 1.2;"
					 data-id="${cmt.id}" data-content="${cmt.content}" data-post-id="${cmt.postId || ''}">
				 <i class="bi bi-three-dots"></i>
			   </button>` :
      '';

   const avatarHtml = createAvatarHtml(cmt, 'avatar-circle-sm');

   const timeDisplay = formatTimeSmart(cmt.time || cmt.formattedTime || new Date());

   return `
			  <div class="d-flex mb-2 comment-item" id="comment-${cmt.id}">
				<div class="avatar-circle avatar-circle-sm me-0 flex-shrink-0 overflow-hidden border" 
					 style="width: 32px; height: 32px; margin-right: 2px;">
				  ${avatarHtml}
				</div>
				
				<div class="flex-grow-1" style="min-width: 0;">
				  <div class="bg-light rounded-3 p-2 d-inline-block position-relative" style="width: 100%;">
					
					<div class="d-flex align-items-center justify-content-between mb-1">
					  <div class="d-flex align-items-center" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
						<span class="fw-bold small me-1 text-dark">${cmt.fullname}</span>
						<span class="text-muted mx-1" style="font-size: 0.3rem;">●</span>
						<small class="text-muted" style="font-size: 0.6rem;">${timeDisplay}</small>
					  </div>
					  
					  <div class="ms-2">
						 ${menuHtml}
					  </div>
					</div>

					<p class="mb-0 text-dark small content-text" style="word-wrap: break-word; word-break: break-word; white-space: pre-wrap;">${cmt.content}</p>
				  </div>
				</div>
			  </div>
			`;
}