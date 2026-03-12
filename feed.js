// --- QUẢN LÝ TRẠNG THÁI PHÂN TRANG ---
let currentPage = 1;       // Trang hiện tại
let hasMorePosts = true;   // Server còn dữ liệu để tải không?
let feedLoading = false;   // Đang tải dở hay không?
// Hàm sắp xếp dữ liệu (Mới nhất lên đầu)
function sortDataByTime(data) {
   return data.sort((a, b) => {
      // Ưu tiên bài Pin (nếu có logic ghim bài)
      // Sau đó đến thời gian
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
   });
}

// --- [MỚI] HỆ THỐNG LAZY LOAD ẢNH ---
const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
let lazyImageObserver = null;

function initLazyImageObserver() {
   if (lazyImageObserver) return;

   lazyImageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(async (entry) => {
         if (entry.isIntersecting) {
            const img = entry.target;
            // Ngừng theo dõi ngay để tiết kiệm tài nguyên
            observer.unobserve(img);

            const idbKey = img.dataset.idbKey;
            const realSrc = img.dataset.src;

            // TRƯỜNG HỢP 1: Ảnh lưu trong IndexedDB (Cache)
            if (idbKey && typeof imageDB !== 'undefined') {
               try {
                  const blobUrl = await imageDB.getImage(idbKey);
                  if (blobUrl) {
                     img.src = blobUrl;
                     // Class 'loaded' sẽ được thêm bởi sự kiện onload (hoặc thêm ngay nếu blob sẵn sàng)
                     requestAnimationFrame(() => img.classList.add('loaded'));
                  } else if (realSrc) {
                     // Fallback nếu không tìm thấy trong DB
                     img.src = realSrc;
                  }
               } catch (e) { console.warn("Lỗi load ảnh IDB", e); }
            }
            // TRƯỜNG HỢP 2: Ảnh URL thường hoặc Base64
            else if (realSrc) {
               img.src = realSrc;
               img.onload = () => img.classList.add('loaded');
            }
         }
      });
   }, { rootMargin: "200px 0px" }); // Tải trước khi cuộn tới 200px
}


// --- HÀM TẢI FEED (LOGIC CHÍNH) ---
async function loadFeedData(page = 1, isBackgroundRefresh = false) {
   const container = document.getElementById('posts-container');
   if (!container) return;

   // 1. Chặn gọi trùng
   if (feedLoading) return;
   if (!isBackgroundRefresh && page > 1 && !hasMorePosts) return;

   feedLoading = true;

   // 2. Xử lý giao diện lúc bắt đầu tải
   if (page === 1) {
      currentPage = 1;
      hasMorePosts = true;
      if (!isBackgroundRefresh) {
         // Load Cache (Giữ nguyên logic cache cũ của bạn)
         const cachedJSON = localStorage.getItem('cached_feed_data');
         if (cachedJSON) {
            try {
               const cachedData = sortDataByTime(JSON.parse(cachedJSON));
               if (container.children.length > 0)
                  smartSyncFeed(cachedData, container);
               else
                  mergeServerDataToView(cachedData);
            } catch (e) { }
         }
         if (container.children.length === 0) container.innerHTML = createSkeletonHtml(3);
      }
   }
   // Lưu ý: Không cần tạo loader thủ công ở đây nữa, hàm updateFeedFooter sẽ lo

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
         const newData = res.data;

         // Kiểm tra xem còn tin tiếp theo không
         hasMorePosts = (newData && newData.length >= 10);

         if (page === 1) {
            const sortedData = sortDataByTime(newData);

            // 1. Hiển thị dữ liệu lên màn hình (Ưu tiên UX chạy trước)
            if (container.children.length > 0 && !container.querySelector('.post-skeleton')) {
               // Nếu đã có hàm smartSyncFeed thì dùng, không thì fallback về render lại
               if (typeof smartSyncFeed === 'function') {
                  smartSyncFeed(sortedData, container);
               } else {
                  container.innerHTML = '';
                  mergeServerDataToView(sortedData);
               }
            } else {
               container.innerHTML = '';
               mergeServerDataToView(sortedData);
            }

            // 2. [THAY ĐỔI QUAN TRỌNG] Lưu Cache thông minh (Ảnh -> IndexedDB, Text -> LocalStorage)
            // Code cũ: localStorage.setItem('cached_feed_data', JSON.stringify(sortedData));
            processAndCacheFeed(sortedData);

            // 3. Cập nhật biến toàn cục
            serverFeedData = sortedData;
            currentPage = 1;

         } else {
            // Logic trang 2 trở đi
            if (newData.length > 0) {
               mergeServerDataToView(newData);

               // Nối dữ liệu global (lọc trùng)
               const uniqueNewPosts = newData.filter(newP =>
                  !serverFeedData.some(existP => (existP.__backendId || existP.id) === (newP.__backendId || newP.id))
               );
               serverFeedData = serverFeedData.concat(uniqueNewPosts);
               currentPage = page;
            }
         }
      } else {
         if (!isBackgroundRefresh) showToast('Lỗi: ' + res.message);
         // Nếu lỗi ở trang > 1, ta cho phép thử lại bằng cách giữ nguyên currentPage
      }
   } catch (error) {
      console.error("Lỗi connection:", error);
      if (page === 1 && container.children.length === 0) {
         container.innerHTML = '<div class="text-center p-3 text-muted">Lỗi kết nối.</div>';
      }
   } finally {
      feedLoading = false;
      updateFeedFooter();
   }
}

// 3. Dọn dẹp khi đóng modal (để tiết kiệm bộ nhớ)
const imageModalEl = document.getElementById('imageViewerModal');
if (imageModalEl) {
   imageModalEl.addEventListener('hidden.bs.modal', function () {
      // 1. Xóa nội dung ảnh để giải phóng bộ nhớ
      const container = document.getElementById('carousel-items-container');
      if (container) container.innerHTML = '';

      // 2. [QUAN TRỌNG] Xóa cưỡng bức lớp phủ mờ (Backdrop) nếu nó bị kẹt
      const backdrops = document.querySelectorAll('.modal-backdrop');
      backdrops.forEach(backdrop => backdrop.remove());

      // 3. Xóa class khóa cuộn chuột trên body
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
   });
}

// --- [MỚI] HÀM QUẢN LÝ CHÂN TRANG (OBSERVER) ---
// Hàm này bắt chước y hệt logic trong notification.js
function updateFeedFooter() {
   const container = document.getElementById('posts-container');

   // 1. Dọn dẹp các trigger cũ (để tránh bị nhân bản)
   const oldTrigger = document.getElementById('feed-load-more');
   if (oldTrigger) oldTrigger.remove();
   const oldEnd = document.getElementById('feed-end-message');
   if (oldEnd) oldEnd.remove();

   // 2. Nếu còn dữ liệu -> Tạo trigger để Observer theo dõi
   if (hasMorePosts) {
      const trigger = document.createElement('div');
      trigger.id = 'feed-load-more';
      // Class style giống hệt notification.js
      trigger.className = 'py-3 text-center text-muted small cursor-pointer';
      trigger.innerHTML = `
            <div class="d-inline-block spinner-border spinner-border-sm text-primary me-2" role="status"></div>
            <span>Đang tải thêm...</span>
        `;

      // Gắn sự kiện click thủ công (phòng hờ)
      trigger.onclick = () => loadFeedData(currentPage + 1);

      container.appendChild(trigger);

      // [CORE] KỸ THUẬT OBSERVER (Của Notification)
      const observer = new IntersectionObserver((entries) => {
         // Nếu nhìn thấy trigger VÀ không đang tải
         if (entries[0].isIntersecting && !feedLoading) {
            console.log(`👀 Thấy đáy -> Tải trang ${currentPage + 1}`);
            loadFeedData(currentPage + 1);
         }
      }, { threshold: 0.1 }); // Chỉ cần thấy 10% là kích hoạt

      observer.observe(trigger);

   } else {
      // 3. Nếu hết dữ liệu -> Hiện thông báo kết thúc
      if (serverFeedData.length > 0) {
         container.insertAdjacentHTML('beforeend',
            '<div id="feed-end-message" class="text-center py-4 text-muted small">--- Bạn đã xem hết tin ---</div>'
         );
      }
   }
}
// ----------------------------------------------------------------
// 2. LOGIC "SMART SYNC" (ĐỒNG BỘ THÔNG MINH) 
function smartSyncFeed(newDataList, container) {
   // 1. [TỐI ƯU] Tạo Map các node hiện có để tra cứu O(1) thay vì getElementById
   const existingNodes = new Map();
   let child = container.firstElementChild;
   while (child) {
      // Chỉ map các phần tử là bài viết (có id bắt đầu bằng post-)
      if (child.id && child.id.startsWith('post-')) {
         const id = child.id.replace('post-', '');
         existingNodes.set(id, child);
      }
      child = child.nextElementSibling;
   }

   // 2. Con trỏ tham chiếu vị trí chèn (Bắt đầu từ đầu danh sách)
   let nextSibling = container.firstElementChild;

   // 3. Duyệt qua danh sách dữ liệu MỚI
   newDataList.forEach((postData) => {
      const postId = postData.__backendId || postData.id;
      const existingNode = existingNodes.get(postId);

      if (existingNode) {
         // A. BÀI VIẾT ĐÃ TỒN TẠI TRÊN DOM
         // Kiểm tra vị trí: Nếu node này không nằm đúng chỗ con trỏ đang đứng -> Di chuyển
         if (existingNode !== nextSibling) {
            container.insertBefore(existingNode, nextSibling);
         } else {
            // Nếu đã đúng chỗ, chỉ cần nhích con trỏ sang thằng tiếp theo
            nextSibling = nextSibling.nextElementSibling;
         }

         // Cập nhật nội dung (Like, Comment...)
         updatePostContentOnly(existingNode, postData);

         // Xóa khỏi Map để đánh dấu là "đã xử lý"
         existingNodes.delete(postId);

      } else {
         // B. BÀI VIẾT MỚI HOÀN TOÀN
         const newHtml = createPostHtml(postData);

         // [TỐI ƯU] Dùng insertAdjacentHTML nhanh hơn createElement + innerHTML
         if (nextSibling) {
            nextSibling.insertAdjacentHTML('beforebegin', newHtml);
            // Lấy node vừa tạo (nằm ngay trước nextSibling) để thêm hiệu ứng
            const newNode = nextSibling.previousElementSibling;
            if (newNode) newNode.classList.add('fade-in');
         } else {
            // Nếu nextSibling là null (đang ở cuối danh sách) -> Chèn vào cuối
            container.insertAdjacentHTML('beforeend', newHtml);
            const newNode = container.lastElementChild;
            if (newNode) {
               // Kiểm tra nếu node cuối cùng không phải là load-more thì mới add class
               if (newNode.id.startsWith('post-')) newNode.classList.add('fade-in');
            }
         }
         // Lưu ý: Không cần dịch chuyển nextSibling vì node mới được chèn vào TRƯỚC nó
      }
   });

   // C. DỌN DẸP BÀI THỪA
   // Những node còn lại trong Map là những bài đã bị xóa hoặc trôi sang trang sau
   existingNodes.forEach((node) => {
      node.remove();
   });

   // [MỚI] Kích hoạt Lazy Load cho các ảnh vừa vẽ
   scanLazyImages();
}

// Hàm chỉ cập nhật số liệu bên trong (tránh vẽ lại ảnh gây nháy)
function updatePostContentOnly(postEl, data) {
   // --- 1. Cập nhật nút Like ---
   const likeBtn = postEl.querySelector('.like-btn');
   if (likeBtn) {
      const icon = likeBtn.querySelector('i');
      const textSpan = likeBtn.querySelector('span');

      if (icon && textSpan) {
         const isLiked = data.liked === true;
         const likeCount = Number(data.likes) || 0;
         const likeCountText = likeCount > 0 ? likeCount : 'Thích';

         // Cập nhật icon (QUAN TRỌNG: Giữ lại class size 'fs-5')
         const newIconClass = isLiked ? 'bi bi-heart-fill text-danger fs-5' : 'bi bi-heart fs-5';
         if (icon.className !== newIconClass) {
            icon.className = newIconClass;
         }

         // Cập nhật số lượng like
         if (textSpan.textContent !== String(likeCountText)) {
            textSpan.textContent = likeCountText;
         }
      }
   }

   // --- 2. Cập nhật nút Bình luận ---
   const commentBtn = postEl.querySelector('.show-comment-input-btn');
   if (commentBtn) {
      const textSpan = commentBtn.querySelector('span');
      if (textSpan) {
         const comments = data.commentsData || [];
         const commentCountText = comments.length > 0 ? comments.length : 'Bình luận';

         // Cập nhật số lượng bình luận
         if (textSpan.textContent !== String(commentCountText)) {
            textSpan.textContent = commentCountText;
         }
      }
   }
}

// Helper hiệu ứng rung
function triggerShake(el) {
   el.classList.remove('anim-update');
   void el.offsetWidth;
   el.classList.add('anim-update');
}

function mergeServerDataToView(dataList) {
   const container = document.getElementById('posts-container');
   if (!container) return;

   const bottomLoader = document.getElementById('bottom-feed-loader');
   if (bottomLoader) bottomLoader.remove();

   // [TỐI ƯU] Gom HTML thành 1 chuỗi để chèn 1 lần (Batch Insertion)
   let htmlBuffer = '';

   dataList.forEach(post => {
      const postId = post.__backendId || post.id;
      const existEl = document.getElementById(`post-${postId}`);

      if (!existEl) {
         htmlBuffer += createPostHtml(post);
      }
   });

   // Chỉ thao tác DOM 1 lần duy nhất -> Giảm Reflow/Repaint
   if (htmlBuffer) {
      container.insertAdjacentHTML('beforeend', htmlBuffer);
   }

   // [MỚI] Kích hoạt Lazy Load
   scanLazyImages();
}


async function handlePostSubmit() {
   const contentInput = document.getElementById('post-input');
   const content = contentInput.value;
   const postBtn = document.getElementById('post-btn');
   const isHD = document.getElementById('hd-quality-switch').checked;
   const finalLayout = selectedLayout;
   const mediaToProcess = [...currentMedia]; // Sửa: images -> media

   const isUpdateMode = isEditingPost;
   const postIdToUpdate = currentEditPostId;

   if (!content && mediaToProcess.length === 0) {
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
            imageData: JSON.stringify(mediaToProcess.map(m => ({ type: m.type, url: m.previewUrl }))), // Sửa: Cấu trúc dữ liệu preview
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
         imageData: JSON.stringify(mediaToProcess.map(m => ({ type: m.type, url: m.previewUrl }))), // Sửa: Cấu trúc dữ liệu preview
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
      let finalMediaData = []; // Sửa: imageData -> mediaData
      if (mediaToProcess.length > 0) {
         for (let i = 0; i < mediaToProcess.length; i++) {
            const mediaItem = mediaToProcess[i];

            // Nếu là URL cũ (khi sửa bài) thì giữ nguyên
            if (typeof mediaItem.file === 'string') {
               finalMediaData.push({ type: mediaItem.type, url: mediaItem.file });
               continue;
            }

            const file = mediaItem.file;
            updatePostStatus(tempId, `Tải lên ${i + 1}/${mediaToProcess.length}`);

            // Xử lý upload cho từng loại file
            if (mediaItem.type === 'video') {
               // Video luôn upload file gốc
               const base64Data = await readFileAsBase64(file);
               const res = await sendToServer({ action: 'upload_single_image', image: base64Data, name: file.name });
               if (res.status === 'success') finalMediaData.push({ type: 'video', url: res.url });
               else throw new Error(`Lỗi tải lên video ${i + 1}`);

            } else { // Xử lý cho ảnh
               if (isHD) {
                  const base64Data = await readFileAsBase64(file);
                  const res = await sendToServer({ action: 'upload_single_image', image: base64Data, name: file.name });
                  if (res.status === 'success')
                     finalMediaData.push({ type: 'image', url: res.url });
                  else {
                     console.error("Lỗi upload ảnh HD:", res);
                     throw new Error(`Lỗi tải ảnh HD ${i + 1}. Hãy thử ảnh nhỏ hơn.`);
                  }

               } else {
                  const compressedBase64 = await compressImage(file, 1920, 0.7);
                  // Ảnh nén SD gửi thẳng base64
                  finalMediaData.push({ type: 'image', url: compressedBase64 });
               }
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
         image: JSON.stringify(finalMediaData), // Sửa: Gửi dữ liệu media đã xử lý
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
      currentMedia = []; // Sửa
      updateMediaPreview(); // Sửa
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
   updateMediaPreview();
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
      currentMedia = [];
      updateMediaPreview();
      document.querySelector('#createPostModal .modal-title').textContent = "Tạo bài viết";
      const modalBtn = document.querySelector('#createPostModal .btn-primary');
      if (modalBtn) modalBtn.innerHTML = '<i class="bi bi-send me-2"></i>Đăng bài';
      selectedLayout = 'grid-2x2';
   });
}

// Hàm Render chính (Hỗ trợ Append và Tự động dọn dẹp DOM) 
function renderPostsPaged(newPosts, page) {
   const container = document.getElementById('posts-container');
   if (!container) return;

   // [SỬA] Nếu là trang đầu tiên, xóa hết nội dung cũ (kể cả skeleton)
   if (page === 1) {
      container.innerHTML = '';
   }

   // 1. XÓA LOADING CŨ (Dọn dẹp kỹ càng mọi loại ID có thể xảy ra)
   // Xóa cái loader mà chúng ta tự tạo lúc gọi API
   const oldLoader = document.getElementById('bottom-feed-loader');
   if (oldLoader) oldLoader.remove();

   // Xóa cả cái nút "Xem thêm" cũ nếu có (để tạo cái mới ở dưới cùng)
   const oldTrigger = document.getElementById('feed-load-more');
   if (oldTrigger) oldTrigger.remove();

   // 2. LỌC TRÙNG BÀI VIẾT (Quan trọng nhất)
   // Chỉ lấy những bài mà trên màn hình CHƯA CÓ
   const uniquePosts = newPosts.filter(post => {
      const postId = post.__backendId || post.id;
      // Kiểm tra xem thẻ div có id="post-..." đã tồn tại chưa
      return !document.getElementById(`post-${postId}`);
   });

   // Nếu không còn bài nào mới (do trùng hết) thì thôi không vẽ nữa
   if (uniquePosts.length === 0) {
      console.log("⚠️ Tất cả bài viết trang này đã hiển thị rồi, bỏ qua.");
      return;
   }

   // 3. VẼ BÀI VIẾT MỚI
   // [TỐI ƯU] Gom HTML lại để insert 1 lần
   let htmlBuffer = '';
   uniquePosts.forEach(post => {
      htmlBuffer += createPostHtml(post);
   });

   if (htmlBuffer) {
      container.insertAdjacentHTML('beforeend', htmlBuffer);
   }

   // Kích hoạt Lazy Load và Video Thumbnail
   scanLazyImages();
   scanVideoThumbnails();
}

// ─────────────────────────────────────────────────────────────
// VIDEO THUMBNAIL: Canvas capture client-side
// ─────────────────────────────────────────────────────────────

/**
 * Capture 1 frame từ video Drive bằng Canvas, hiển thị làm thumbnail.
 * @param {string} driveId  - Google Drive file ID
 * @param {HTMLElement} card - Phần tử card chứa class video-thumb-card
 */
function generateVideoThumbnail(driveId, card) {
   // Kiểm tra cache sessionStorage trước
   const cacheKey = 'vthumb_' + driveId;
   const cached = sessionStorage.getItem(cacheKey);
   if (cached) {
      applyVideoThumbnail(card, cached);
      return;
   }

   // Tạo video ẩn để capture frame
   const video = document.createElement('video');
   video.crossOrigin = 'anonymous';
   video.preload = 'metadata';
   video.muted = true;
   video.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
   // Drive direct download stream → có thể seek được
   video.src = `https://drive.google.com/uc?export=download&id=${driveId}`;
   document.body.appendChild(video);

   // Timeout bảo vệ – nếu sau 8giây không xong → hủy
   const timeout = setTimeout(() => {
      cleanup();
   }, 8000);

   function cleanup() {
      clearTimeout(timeout);
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (video.parentNode) video.parentNode.removeChild(video);
   }

   video.addEventListener('error', cleanup);

   video.addEventListener('loadeddata', () => {
      // Seek đến 0.5giây (hoặc frame đầu nếu video ngắn)
      video.currentTime = Math.min(0.5, video.duration * 0.1 || 0.5);
   });

   video.addEventListener('seeked', () => {
      try {
         const canvas = document.createElement('canvas');
         canvas.width = 400;
         canvas.height = Math.round(400 * (video.videoHeight / video.videoWidth)) || 225;
         const ctx = canvas.getContext('2d');
         ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
         const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
         // Lưu cache
         try { sessionStorage.setItem(cacheKey, dataUrl); } catch(e) { /* full */ }
         // Áp dụng lên card
         applyVideoThumbnail(card, dataUrl);
      } catch (corsErr) {
         console.warn('Video thumbnail CORS blocked:', corsErr);
      } finally {
         cleanup();
      }
   });

   video.load();
}

/** Áp dụng thumbnail đã capture lên card */
function applyVideoThumbnail(card, dataUrl) {
   if (!card || !card.isConnected) return;
   card.setAttribute('data-thumb-loaded', '1');
   card.style.backgroundImage = `url('${dataUrl}')`;
   card.style.backgroundSize = 'cover';
   card.style.backgroundPosition = 'center';
   card.style.backgroundColor = 'transparent';
   // Thêm lớp tối nhẹ để nút play nổi rõ hơn
   card.style.backgroundBlendMode = 'unset';
   // Đổi icon sang play của video thật (thượng nổi hơn)
   const overlay = card.querySelector('.video-play-overlay');
   if (overlay) overlay.style.background = 'rgba(0,0,0,0.35)';
}

/** Quét tất cả video card chưa có thumbnail và generate */
function scanVideoThumbnails() {
   const cards = document.querySelectorAll('.video-thumb-card:not([data-thumb-loaded])');
   cards.forEach(card => {
      const driveId = card.getAttribute('data-drive-id');
      if (driveId) {
         generateVideoThumbnail(driveId, card);
      }
   });
}

function renderPosts() {
   // Nếu chưa có dữ liệu thì thôi
   if (!serverFeedData || serverFeedData.length === 0) return;

   const container = document.getElementById('posts-container');

   // TRƯỜNG HỢP 1: Nếu đang lọc Hashtag hoặc Profile riêng -> Vẽ lại từ đầu (Cách cũ)
   // Vì lúc này danh sách bài viết thay đổi hoàn toàn cấu trúc
   if (typeof currentHashFilter !== 'undefined' && currentHashFilter) {
      container.innerHTML = '';
      mergeServerDataToView(serverFeedData);
      return;
   }

   // TRƯỜNG HỢP 2: Nếu là Feed trang chủ bình thường -> Dùng Smart Sync (Cách mới)
   // Để giữ vị trí cuộn và cập nhật êm ái
   smartSyncFeed(serverFeedData.slice(0, 15), container); // Chỉ sync 15 bài đầu
}

// Hàm quét và kích hoạt observer cho các ảnh chưa tải
function scanLazyImages() {
   initLazyImageObserver();
   const lazyImages = document.querySelectorAll('img.lazy-load-img:not(.observed)');
   lazyImages.forEach(img => {
      lazyImageObserver.observe(img);
      img.classList.add('observed');
   });
}

function parseMedia(mediaData) {
   if (!mediaData) return [];
   try {
      const parsed = Array.isArray(mediaData) ? mediaData : JSON.parse(mediaData);
      return parsed.map(item => {
         if (typeof item === 'string') {
            // Dữ liệu cũ, giả định là ảnh
            return { type: 'image', url: item, file: item, previewUrl: item };
         }
         // Dữ liệu mới
         return {
            type: item.type || 'image',
            url: item.url,
            file: item.url, // Khi sửa, file chính là url
            previewUrl: item.url
         };
      });
   } catch (e) {
      return [];
   }
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

function updateMediaPreview() { // Sửa: Image -> Media
   const previewContainer = document.getElementById('image-preview-container');
   const imageOptions = document.getElementById('image-options');
   const layoutSelector = document.getElementById('layout-selector');
   const postBtn = document.getElementById('post-btn');
   const imageCount = document.getElementById('image-count');
   const gridContainer = document.getElementById('images-preview-grid');
   if (currentMedia.length === 0) {
      previewContainer.classList.add('d-none');
      imageOptions.classList.add('d-none');
      layoutSelector.classList.add('d-none');
      postBtn.disabled = !document.getElementById('post-input').value.trim();
      return;
   }
   previewContainer.classList.remove('d-none');
   imageCount.textContent = currentMedia.length;
   postBtn.disabled = false;

   imageOptions.classList.remove('d-none');

   if (currentMedia.length >= 3) {
      layoutSelector.classList.remove('d-none');
   } else {
      layoutSelector.classList.add('d-none');
   }

   gridContainer.innerHTML = renderPostMedia(currentMedia, selectedLayout);
}

// --- 1. THÊM VÀO ĐẦU FILE web/feed.js ---
function getDriveId(url) {
   if (!url || typeof url !== 'string') return null;
   // Tìm ID trong dạng .../file/d/ID...
   let match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
   if (match && match[1]) return match[1];
   // Tìm ID trong dạng ...id=ID...
   match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
   if (match && match[1]) return match[1];
   return null;
}

// ─────────────────────────────────────────────────────────────
// HÀM MỚI: Chuyển URL ảnh Drive → URL thumbnail nhỏ cho feed
// size: chiều rộng pixel muốn hiển thị (mặc định 400px)
// ─────────────────────────────────────────────────────────────
function getThumbUrl(url, size = 400) {
   if (!url || typeof url !== 'string') return url;

   // LOẠI 1: lh3.googleusercontent.com/d/FILE_ID=sXXX hoặc =wXXX
   // Đây là URL ảnh mới (upload từ tháng gần đây)
   if (url.includes('lh3.googleusercontent.com')) {
      // Xóa tham số size cũ (=s600, =w800, =s0, ...) rồi gắn =wSIZE
      return url.replace(/=[swh]\d+$/, '') + '=w' + size;
   }

   // LOẠI 2: drive.google.com/uc?export=view&id=FILE_ID
   // Đây là URL ảnh cũ — dùng thumbnail API riêng của Drive
   if (url.includes('drive.google.com/uc')) {
      const fileId = getDriveId(url);
      if (fileId) {
         return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
      }
   }

   // LOẠI 3: URL khác (blob:, data:, external) → giữ nguyên
   return url;
}

// Hàm lấy URL full-size để xem ảnh chi tiết (tap vào ảnh)
function getFullUrl(url) {
   if (!url || typeof url !== 'string') return url;
   if (url.includes('lh3.googleusercontent.com')) {
      // Xóa tham số size → Drive tự trả ảnh gốc
      return url.replace(/=[swh]\d+$/, '');
   }
   return url; // Các loại URL khác giữ nguyên
}


async function openPostImages(postId, startIndex = 0) {
   let post = null;
   if (typeof serverFeedData !== 'undefined') {
      post = serverFeedData.find(p => p.__backendId === postId || p.id === postId);
   }
   if (!post && typeof allData !== 'undefined') {
      post = allData.find(d => d.__backendId === postId);
   }

   if (!post) return;

   let mediaItems = [];
   try {
      mediaItems = parseMedia(post.imageData);
   } catch (e) { return; }

   if (!mediaItems || mediaItems.length === 0) return;

   const modalEl = document.getElementById('imageViewerModal');
   if (!modalEl) return;

   const container = document.getElementById('carousel-items-container');
   if (container) {
      container.innerHTML = '';

      mediaItems.forEach((mediaItem, index) => {
         const isActive = index === startIndex ? 'active' : '';
         let rawUrl = mediaItem.url || mediaItem.previewUrl || '';
         if (typeof mediaItem === 'string') rawUrl = mediaItem;

         let itemType = mediaItem.type || 'image';
         if (typeof mediaItem === 'string' && rawUrl.startsWith('blob:')) itemType = 'video';

         let itemHtml = '';

         // --- XỬ LÝ VIDEO ---
         if (itemType === 'video') {
            const driveId = getDriveId(rawUrl);

            if (driveId) {
               // Link chuẩn 100% cho iframe preview
               const embedUrl = `https://drive.google.com/file/d/${driveId}/preview`;
               itemHtml = `
                    <div class="carousel-item h-100 ${isActive}">
                        <div class="d-flex justify-content-center align-items-center h-100 w-100" style="background: black;">
                             <iframe src="${embedUrl}" width="100%" height="100%" frameborder="0" allow="autoplay; fullscreen" allowfullscreen style="max-width: 100%; aspect-ratio: 16/9;"></iframe>
                        </div>
                    </div>`;
            } else {
               // Fallback nếu không lấy được ID (ví dụ video upload blob)
               itemHtml = `
                    <div class="carousel-item h-100 ${isActive}">
                        <div class="d-flex justify-content-center align-items-center h-100 w-100" style="background: black;">
                            <video src="${rawUrl}" class="d-block" style="max-width: 100%; max-height: 100%;" controls autoplay playsinline></video>
                        </div>
                    </div>`;
            }
         }
         // --- XỬ LÝ ẢNH ---
         else {
            let imgUrl = rawUrl;
            // Fix link ảnh cũ
            if (imgUrl.includes('/uc?id=') && !imgUrl.includes('export=view')) {
               const id = getDriveId(imgUrl);
               if (id) imgUrl = `https://drive.google.com/uc?export=view&id=${id}`;
            }

            //if (imgUrl && typeof imgUrl === 'string') {
            //imgUrl = imgUrl.replace('=s600', '=s0');
            //}
            imgUrl = getFullUrl(imgUrl);

            itemHtml = `
                    <div class="carousel-item h-100 ${isActive}">
                        <div class="d-flex justify-content-center align-items-center h-100 w-100" style="background: black;">
                            <img src="${imgUrl}" class="d-block" style="max-width: 100%; max-height: 100%; object-fit: contain;" alt="Image">
                        </div>
                    </div>`;
         }
         container.insertAdjacentHTML('beforeend', itemHtml);
      });

      // Xử lý nút điều hướng
      const controls = document.querySelectorAll('#imageViewerModal .carousel-control-prev, #imageViewerModal .carousel-control-next');
      if (mediaItems.length <= 1) controls.forEach(el => el.style.display = 'none');
      else controls.forEach(el => el.style.display = 'flex');

      const myModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      myModal.show();
   }
}


// 5. Sự kiện dọn dẹp an toàn
const imageModalCleanup = document.getElementById('imageViewerModal');
if (imageModalCleanup) {
   // Xóa sự kiện cũ để tránh bị gọi nhiều lần (clone node trick)
   const newEl = imageModalCleanup.cloneNode(true);
   imageModalCleanup.parentNode.replaceChild(newEl, imageModalCleanup);

   newEl.addEventListener('hidden.bs.modal', function () {
      const container = document.getElementById('carousel-items-container');
      if (container) container.innerHTML = ''; // Chỉ xóa nội dung bên trong

      // Xóa backdrop kẹt
      document.querySelectorAll('.modal-backdrop').forEach(bd => bd.remove());
      document.body.classList.remove('modal-open');
      document.body.style = '';
   });
}

// Sửa thêm: Nút xóa tất cả
document.getElementById('clear-all-images').addEventListener('click', () => {
   currentMedia = [];
   updateMediaPreview();
});


// Layout Selection 
document.querySelectorAll('.layout-preview-box').forEach(opt => {
   opt.addEventListener('click', () => {
      const layout = opt.dataset.layout;
      updateLayoutSelectionUI(layout);
      updateMediaPreview();
   });
});

// Create Post
const postInput = document.getElementById('post-input');
const postBtn = document.getElementById('post-btn');
const imageInput = document.getElementById('image-input');

postInput.addEventListener('input', () => {
   postBtn.disabled = !postInput.value.trim() && currentMedia.length === 0;
});

// --- SỬA LẠI SỰ KIỆN CHỌN ẢNH ---
imageInput.addEventListener('change', async (e) => {
   const files = Array.from(e.target.files);
   if (files.length === 0) return;

   if (currentMedia.length + files.length > 50) {
      showToast('Chỉ được chọn tối đa 50 tệp!');
      return;
   }
   showLoading();
   for (const file of files) {
      let mediaType = 'image';
      let previewUrl = '';

      if (file.type.startsWith('video/')) {
         mediaType = 'video';
         previewUrl = URL.createObjectURL(file);
      } else if (file.type.startsWith('image/')) {
         mediaType = 'image';
         previewUrl = await compressImage(file, 500, 0.6); // Tạo thumbnail cho ảnh
      } else {
         continue; // Bỏ qua file không hỗ trợ
      }

      currentMedia.push({ file: file, previewUrl: previewUrl, type: mediaType });
   }

   if (currentMedia.length >= 3) {
      updateLayoutSelectionUI('1-wide');
   } else {
      updateLayoutSelectionUI('grid-2x2');
   }
   hideLoading();
   updateMediaPreview();
   e.target.value = '';
});

document.getElementById('images-preview-grid').addEventListener('click', (e) => {
   const removeBtn = e.target.closest('.remove-preview-img');
   if (removeBtn) {
      const index = parseInt(removeBtn.dataset.index);
      currentMedia.splice(index, 1);
      updateMediaPreview();
   }
});

// Reset lại modal về chế độ "Tạo mới" khi đóng
document.getElementById('createPostModal').addEventListener('hidden.bs.modal', function () {
   isEditingPost = false;
   currentEditPostId = null;
   const postInputEl = document.getElementById('post-input');
   if (postInputEl) postInputEl.value = '';
   currentMedia = [];
   updateMediaPreview();
   document.querySelector('#createPostModal .modal-title').textContent = "Tạo bài viết";
   const postBtn = document.getElementById('post-btn');
   if (postBtn) postBtn.innerHTML = '<i class="bi bi-send me-2"></i>Đăng bài';
   document.getElementById('hd-quality-switch').checked = true;
   updateLayoutSelectionUI('1-wide');
});

document.getElementById('posts-container').addEventListener('click', async (e) => {
   const likeBtn = e.target.closest('.like-btn');
   if (likeBtn) {
      if (likeBtn.disabled) return; // Chặn click liên tục

      const icon = likeBtn.querySelector('i');
      const textSpan = likeBtn.querySelector('span');
      const isCurrentlyLiked = icon.classList.contains('bi-heart-fill');
      const postId = likeBtn.dataset.id;
      const currentUsername = currentProfile ? currentProfile.username : '';

      // -- Cập nhật UI ngay lập tức --
      if (isCurrentlyLiked) {
         // Bỏ thích
         icon.className = 'bi bi-heart fs-5';
         icon.classList.remove('text-danger');

         let count = parseInt(textSpan.textContent) || 0;
         count = Math.max(0, count - 1);
         textSpan.textContent = count > 0 ? count : 'Thích';

         likeBtn.classList.remove('active');

         // Cập nhật vào bộ nhớ đệm (Local Cache) để nếu cuộn đi cuộn lại vẫn đúng
         updateLocalDataLike(postId, currentUsername, false);

      } else {
         // Thích
         icon.className = 'bi bi-heart-fill text-danger fs-5';

         let count = parseInt(textSpan.textContent) || 0;
         textSpan.textContent = count + 1;

         likeBtn.classList.add('active'); // Hiệu ứng nhún nhảy

         // Cập nhật vào bộ nhớ đệm
         updateLocalDataLike(postId, currentUsername, true);
      }

      // -- Gửi lên Server (Chạy ngầm) --
      try {
         const res = await sendToServer({
            action: 'like_post',
            postId: postId,
            username: currentUsername || 'anonymous'
         });
         // Nếu server trả về số chuẩn xác thì cập nhật lại lần nữa cho chắc
         if (res.status === 'success' && res.newCount !== undefined) {
            textSpan.textContent = res.newCount > 0 ? res.newCount : 'Thích';
         }
      } catch (err) {
         console.error("Lỗi like:", err);
         // Có thể revert UI nếu cần thiết
      }
      return;
   }

   // -----------------------------------------------------------
   // 2. XỬ LÝ CLICK VÀO ẢNH -> MỞ CAROUSEL (MỚI THÊM)
   // -----------------------------------------------------------
   // Bắt sự kiện click vào ảnh bài viết (trừ avatar)
   const imgEl = e.target.closest('.img-box img') || e.target.closest('.post-image') || (e.target.tagName === 'IMG' ? e.target : null);

   if (imgEl && !imgEl.classList.contains('avatar') && !imgEl.classList.contains('user-avatar')) {
      const postCard = imgEl.closest('.post-card');
      if (postCard) {
         const postId = postCard.id.replace('post-', '');

         // Tính toán vị trí ảnh (index) để mở đúng ảnh đó
         const allImages = Array.from(postCard.querySelectorAll('img:not(.avatar):not(.user-avatar)'));
         const clickIndex = allImages.indexOf(imgEl);

         openPostImages(postId, clickIndex >= 0 ? clickIndex : 0);
      }
      return; // Dừng lại, không xử lý tiếp
   }

   // -----------------------------------------------------------
   // 3. XỬ LÝ MỞ COMMENT
   // -----------------------------------------------------------
   const commentBtn = e.target.closest('.comment-btn');
   if (commentBtn) {
      currentPostId = commentBtn.dataset.id;
      loadCommentsForPost(currentPostId);

      // Mở Modal bình luận
      if (typeof commentModal !== 'undefined') commentModal.show();
      else new bootstrap.Modal(document.getElementById('commentsModal')).show();

      return;
   }

   // -----------------------------------------------------------
   // 4. XỬ LÝ MENU 3 CHẤM (Sửa/Xóa)
   // -----------------------------------------------------------
   const menuBtn = e.target.closest('.post-menu-btn');
   if (menuBtn) {
      currentPostId = menuBtn.dataset.id;

      // Mở Modal tùy chọn
      if (typeof postOptionsModal !== 'undefined') postOptionsModal.show();
      else new bootstrap.Modal(document.getElementById('postOptionsModal')).show();

      return;
   }
});

// --- HÀM CẬP NHẬT CACHE CỤC BỘ KHI LIKE (Để đồng bộ dữ liệu) --- [FIXED]
function updateLocalDataLike(postId, username, isLiked) {
   const post = serverFeedData.find(p => p.__backendId === postId || p.id === postId);
   if (post) {
      // Cập nhật trạng thái 'liked' của user hiện tại
      post.liked = isLiked;
      // Cập nhật tổng số 'likes'
      let currentCount = Number(post.likes) || 0;
      if (isLiked) {
         post.likes = currentCount + 1;
      } else {
         post.likes = Math.max(0, currentCount - 1);
      }
   }
}

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

// --- TÍNH NĂNG XEM ẢNH

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
      const wrapper = document.getElementById(`post-comment-wrapper-${pid}`);

      box.classList.toggle('d-none');

      // Nếu mở form bình luận thì hiện cả cục bọc ngoài (chứa padding pb-3)
      if (!box.classList.contains('d-none')) {
         wrapper.classList.remove('d-none');
         document.getElementById(`input-cmt-${pid}`).focus();
      } else {
         // Nếu đóng form bình luận, kiểm tra xem có bình luận nào đang hiện không
         // Nếu không có bình luận nào thì ẩn luôn cục bọc ngoài
         const container = document.getElementById(`comments-container-${pid}`);
         if (container && container.innerHTML.trim() === '') {
            wrapper.classList.add('d-none');
         }
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

            // Kích hoạt Lazy Load cho kết quả tìm kiếm
            scanLazyImages();

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


// File: feed.js

function renderPostMedia(mediaItems, layout, postId = null) {
   if (!mediaItems || mediaItems.length === 0) return '';

   const count = mediaItems.length;
   let layoutClass = '';

   // --- 1. XÁC ĐỊNH LAYOUT ---
   if (count === 1) {
      layoutClass = 'layout-1';
   } else if (count === 2) {
      layoutClass = 'layout-2';
   } else {
      const validLayout = layout || 'grid-2x2';
      if (validLayout === '1-wide') layoutClass = 'layout-1-wide';
      else if (validLayout === '1-tall') layoutClass = 'layout-1-tall';
      else layoutClass = 'layout-grid-2x2';
   }

   let html = `<div class="post-image-grid ${layoutClass}">`;

   // --- 2. GIỚI HẠN SỐ LƯỢNG HIỂN THỊ ---
   let displayLimit = 4;
   if (layoutClass === 'layout-1-wide' || layoutClass === 'layout-1-tall') {
      displayLimit = 3;
   }
   const showCount = Math.min(count, displayLimit);

   // --- 3. RENDER TỪNG ITEM ---
   for (let i = 0; i < showCount; i++) {
      // Xác định: Đang xem trên feed (có postId) hay đang tạo bài mới (postId = null)
      const isFeedView = (postId !== null);

      const clickAttr = isFeedView
         ? `onclick="openPostImages('${postId}', ${i})"`
         : '';
      const cursorClass = isFeedView ? 'cursor-pointer' : '';

      html += `<div class="img-box ${cursorClass}" ${clickAttr} style="position: relative; overflow: hidden; background: #000;">`;

      // Chuẩn hóa dữ liệu item
      const mediaItem = mediaItems[i];
      let mediaUrl = '';
      let mediaType = 'image';

      if (typeof mediaItem === 'string') {
         mediaUrl = mediaItem;
         // Đoán type dựa trên URL
         if (mediaUrl.startsWith('blob:') || mediaUrl.includes('/preview')) mediaType = 'video';
      } else if (mediaItem) {
         mediaType = mediaItem.type || 'image';
         mediaUrl = mediaItem.previewUrl || mediaItem.url || '';
      }

      // [PHẦN QUAN TRỌNG NHẤT: XỬ LÝ VIDEO]
      if (mediaType === 'video') {
         if (!isFeedView) {
            // A. KHI ĐANG TẠO BÀI (PREVIEW): Dùng Iframe hoặc Video tag để check
            if (mediaUrl.includes('/preview')) {
               html += `<iframe src="${mediaUrl}" class="w-100 h-100" frameborder="0" style="pointer-events: none;"></iframe>`;
            } else {
               html += `<video src="${mediaUrl}" class="w-100 h-100 object-fit-cover" controls></video>`;
            }
         } else {
         // B. KHI XEM TRÊN FEED: Dùng Drive Thumbnail API cho video
            const driveIdForThumb = getDriveId(mediaUrl);
            const thumbUrl = driveIdForThumb
               ? `https://drive.google.com/thumbnail?id=${driveIdForThumb}&sz=w400`
               : '';

            html += `
                <div class="w-100 h-100 video-thumb-card"
                     style="background:#111; min-height:200px; position:relative; overflow:hidden;">
                    ${thumbUrl ? `
                    <img src="${thumbUrl}"
                         style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;"
                         onerror="this.remove()"
                         alt="video thumbnail">` : ''}
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
                </div>
              `;
         }

      } else {
         // --- XỬ LÝ ẢNH ---

         // Fix link ảnh cũ
         if (mediaUrl && mediaUrl.includes('/uc?id=') && !mediaUrl.includes('export=view')) {
            try {
               const fileId = new URL(mediaUrl).searchParams.get('id');
               if (fileId) mediaUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
            } catch (e) { }
         }

         if (!isFeedView) {
            html += `<img src="${mediaUrl}" class="w-100 h-100 object-fit-cover" alt="Preview ${i}">`;
         } else {
            let idbKeyAttr = '';
            if (mediaItem && mediaItem.type === 'indexed_db_ref' && mediaItem.key) {
               idbKeyAttr = `data-idb-key="${mediaItem.key}"`;
            }

            const thumbUrl = getThumbUrl(mediaUrl, 400);
            html += `<img src="${BLANK_IMG}" 
                         data-src="${thumbUrl}"
                         ${idbKeyAttr}
                         class="lazy-load-img" 
                         decoding="async"
                         onload="this.classList.add('loaded')"
                         onerror="this.style.display='none'" 
                         alt="Image ${i}">`;
         }
      }

      // --- 4. LỚP PHỦ SỐ LƯỢNG ẢNH DƯ ---
      if (i === showCount - 1 && count > displayLimit) {
         html += `<div class="image-overlay d-flex align-items-center justify-content-center text-white fw-bold fs-4" 
                       style="position: absolute; inset:0; background: rgba(0,0,0,0.5); pointer-events: none;">
                       +${count - displayLimit}
                  </div>`;
      }

      html += `</div>`;
   }

   html += '</div>';
   return html;
}

function createPostHtml(post) {
   // 1. Xử lý thông tin người dùng
   const displayName = post.fullname || post.username || 'Người dùng';

   // Parse ảnh: Hỗ trợ cả mảng JSON lẫn mảng thường
   let mediaItems = [];
   try {
      mediaItems = parseMedia(post.imageData);
   } catch (e) { mediaItems = []; }

   // --- LOGIC 1: QUYỀN CHỦ SỞ HỮU (Verified & Menu) ---
   const isOwner = currentProfile && currentProfile.username === post.username;
   const verifiedIcon = isOwner ? `<i class="bi bi-patch-check-fill text-primary ms-1"></i>` : '';

   // Giả sử bạn có hàm createAvatarHtml riêng, nếu chưa có thì dùng thẻ img đơn giản
   const avatarHtml = (typeof createAvatarHtml === 'function')
      ? createAvatarHtml(post, 'avatar-circle')
      : `<img src="${post.avatar || 'https://via.placeholder.com/40'}" class="avatar-img" alt="avatar">`;

   // --- LOGIC 2: TRẠNG THÁI (SPINNER / MENU 3 CHẤM) ---
   let statusBadge = '';
   if (post.isUploading) {
      statusBadge = `
         <div id="status-badge-${post.__backendId}" class="ms-auto d-flex align-items-center text-muted small">
            <span class="spinner-border spinner-border-sm me-1" style="width: 0.8rem; height: 0.8rem;"></span>
            ${post.uploadStatus || 'Đang xử lý...'}
         </div>`;
   } else if (isOwner) {
      statusBadge = `
         <button class="btn btn-sm btn-link text-muted post-menu-btn ms-auto" data-id="${post.__backendId}">
            <i class="bi bi-three-dots"></i>
         </button>`;
   } else {
      statusBadge = '<div class="ms-auto"></div>';
   }

   // --- LOGIC 3: NÚT LIKE ---
   // [FIX] Sử dụng trường 'liked' (boolean) và 'likes' (number) từ server
   const isLiked = post.liked === true;

   const heartIconClass = isLiked ? 'bi-heart-fill text-danger' : 'bi-heart';
   const likeCount = Number(post.likes) || 0;
   const likeCountText = likeCount > 0 ? likeCount : 'Thích';
   const likeBtnClass = isLiked ? 'active' : '';

   // --- LOGIC 4: XỬ LÝ NỘI DUNG DÀI (Read More) ---
   let contentHtml = '';
   if (post.content) {
      const contentRaw = post.content;
      const MAX_LENGTH = 300; // Ngưỡng ký tự

      // Hàm xử lý hashtag (nếu bạn chưa có thì dùng text thường)
      const processText = (typeof processTextWithHashtags === 'function') ? processTextWithHashtags : (t) => t;

      if (contentRaw.length > MAX_LENGTH) {
         const shortText = processText(contentRaw.substring(0, MAX_LENGTH) + '...');
         const fullText = processText(contentRaw);

         contentHtml = `
               <div class="post-content-text mt-2">
                   <div id="content-short-${post.__backendId}">
                       ${shortText}
                       <span class="see-more-btn fw-bold text-primary cursor-pointer" onclick="togglePostContent(this, '${post.__backendId}')" style="cursor: pointer;">Xem thêm</span>
                   </div>
                   <div id="content-full-${post.__backendId}" style="display: none;">
                       ${fullText}
                   </div>
               </div>`;
      } else {
         contentHtml = `<div class="post-content-text mt-2">${processText(contentRaw)}</div>`;
      }
   }

   // --- LOGIC 5: XỬ LÝ ẢNH ---
   // Gọi hàm renderPostMedia (Cần đảm bảo hàm này hỗ trợ tham số thứ 3 là ID)
   const mediaHtml = (typeof renderPostMedia === 'function')
      ? renderPostMedia(mediaItems, post.layout || 'grid-2x2', post.__backendId)
      : '';

   // --- LOGIC 6: XỬ LÝ COMMENT ---
   // Format thời gian
   const timeDisplay = (typeof formatTimeSmart === 'function')
      ? formatTimeSmart(post.timestamp || post.createdAt)
      : new Date(post.timestamp).toLocaleDateString();

   let commentsHtml = '';
   const comments = post.commentsData || [];
   // [SỬA] Logic hiển thị số lượng bình luận
   const commentCountText = comments.length > 0 ? comments.length : 'Bình luận';

   if (comments.length > 0) {
      // Chỉ lấy 2 comment đầu
      const visibleComments = comments.slice(0, 2);
      const hiddenComments = comments.slice(2);

      // Hàm tạo HTML cho 1 comment (nếu chưa có thì phải định nghĩa)
      const renderCmt = (typeof createCommentHtml === 'function') ? createCommentHtml : (c) => `<div class="small"><b>${c.username}:</b> ${c.content}</div>`;

      let commentListHtml = visibleComments.map(c => renderCmt(c)).join('');

      if (hiddenComments.length > 0) {
         const hiddenHtml = hiddenComments.map(c => renderCmt(c)).join('');
         commentListHtml += `
            <div id="hidden-comments-${post.__backendId}" class="d-none fade-in">
               ${hiddenHtml}
            </div>
            <div class="text-start ms-5 mt-1">
               <button class="btn btn-link btn-sm p-0 text-decoration-none text-muted fw-bold" style="font-size: 0.8rem;"
                     onclick="document.getElementById('hidden-comments-${post.__backendId}').classList.remove('d-none'); this.remove();">
                  Xem thêm ${hiddenComments.length} bình luận khác...
               </button>
            </div>`;
      }
      commentsHtml = `<div class="comments-section mt-2 fade-in"><div id="comments-container-${post.__backendId}">${commentListHtml}</div></div>`;
   } else {
      commentsHtml = `<div class="comments-section" id="comments-container-${post.__backendId}"></div>`;
   }

   // Layout bình luận. Nếu chưa có cmt thì ẩn luôn khung bao ngoài này
   const wrapperClass = comments.length > 0 ? "px-3 pb-3" : "px-3 pb-3 d-none";
   const inputMarginClass = comments.length > 0 ? "mt-2" : "mt-0";

   // --- TRẢ VỀ HTML CUỐI CÙNG ---
   return `
      <div class="post-card bg-white" id="post-${post.__backendId}">
         
         <div class="d-flex align-items-center mb-2 px-3 pt-3">
            <div class="avatar-circle avatar-circle-sm me-2 overflow-hidden border">
               ${avatarHtml}
            </div>
            <div>
               <p class="mb-0 d-flex align-items-center post-author-name fw-bold text-dark"> 
                  ${displayName} ${verifiedIcon}
               </p>
               <div class="post-timestamp text-muted small"> 
                  ${timeDisplay}
               </div>
            </div>
            ${statusBadge}
         </div>
         
         <div class="px-3">
            ${contentHtml}
         </div>
         
         ${mediaHtml}
         
         <div class="d-flex gap-4 pt-1 pb-1 px-3" style="margin-left: 0 !important;">
            <button type="button" class="btn btn-sm btn-link py-0 text-decoration-none text-muted d-flex align-items-center justify-content-start ps-0 gap-2 like-btn ${likeBtnClass}" 
                  data-id="${post.__backendId}" ${post.isUploading ? 'disabled' : ''}>
               <i class="bi ${heartIconClass} fs-5"></i>
               <span>${likeCountText}</span>
            </button>
            
            <button type="button" class="btn btn-sm btn-link py-0 text-decoration-none text-muted d-flex align-items-center justify-content-start gap-2 show-comment-input-btn" 
                  data-id="${post.__backendId}" 
                  ${post.isUploading ? 'disabled' : ''}>
               <i class="bi bi-chat fs-5"></i>
               <span>${commentCountText}</span>
            </button>
         </div>

         <div class="${wrapperClass}" id="post-comment-wrapper-${post.__backendId}">
            ${commentsHtml}

            <div class="d-flex align-items-center ${inputMarginClass} gap-2 d-none" id="comment-input-box-${post.__backendId}">
               <input type="text" class="form-control form-control-sm rounded-pill bg-light border-0" 
                     id="input-cmt-${post.__backendId}" placeholder="Viết bình luận...">
               <button type="button" class="btn btn-sm btn-primary rounded-circle send-inline-cmt-btn" data-id="${post.__backendId}">
                  <i class="bi bi-send-fill"></i>
               </button>
            </div>
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
				<div class="avatar-circle avatar-circle-sm flex-shrink-0 overflow-hidden border" 
					 style="width: 32px; height: 32px; margin-right: 8px;">
				  ${avatarHtml}
				</div>
				
				<div class="flex-grow-1" style="min-width: 0;">
				  <div class="bg-light rounded-3 p-2 d-inline-block position-relative" style="width: 100%;">
					
					<div class="d-flex align-items-center justify-content-between mb-1">
					  <div class="d-flex align-items-center" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
						<span class="fw-bold small me-1 text-dark">${cmt.fullname}</span>
						<span class="text-muted mx-1" style="font-size: 0.2rem;">●</span>
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

// --- HÀM TẠO SKELETON (THÊM MỚI) ---
function createSkeletonHtml(count = 3) {
   let html = '';
   for (let i = 0; i < count; i++) {
      html += `
        <div class="post-skeleton fade-in">
            <div class="d-flex align-items-center mb-3">
                <div class="skeleton skeleton-avatar"></div>
                <div style="flex: 1">
                    <div class="skeleton skeleton-line short"></div>
                    <div class="skeleton skeleton-line" style="width: 30%"></div>
                </div>
            </div>
            
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line" style="width: 80%"></div>
            
            <div class="skeleton skeleton-img"></div>
        </div>`;
   }
   return html;
}
// ================================================================
// FILE: feed.js (Dán xuống cuối file)
// HÀM XỬ LÝ CACHE: Tách ảnh lưu vào IndexedDB, Text lưu LocalStorage
// ================================================================

async function processAndCacheFeed(posts) {
   if (!posts || posts.length === 0) return;

   // Đảm bảo imageDB đã sẵn sàng (được khai báo bên utils.js)
   if (typeof imageDB === 'undefined') {
      console.error("Thiếu imageDB trong utils.js");
      return;
   }

   const postsForLocal = [];

   for (const post of posts) {
      // Tạo bản sao bài viết để xử lý (tránh sửa trực tiếp vào biến đang hiển thị)
      const cleanPost = { ...post };

      // Nếu bài viết có ảnh dạng Base64 (data:image...)
      if (cleanPost.imageData) {
         let images = [];
         // Parse dữ liệu ảnh
         try {
            images = Array.isArray(cleanPost.imageData)
               ? cleanPost.imageData
               : JSON.parse(cleanPost.imageData);
         } catch (e) {
            images = [cleanPost.imageData];
         }

         // Duyệt từng ảnh để tách ra
         const processedImages = [];
         for (let i = 0; i < images.length; i++) {
            const imgStr = images[i];

            // Chỉ xử lý nếu là Base64 nặng
            if (typeof imgStr === 'string' && imgStr.startsWith('data:image')) {
               // 1. Tạo ID duy nhất cho ảnh (ID bài + Index)
               const imgKey = `img_${post.__backendId}_${i}`;

               // 2. Chuyển Base64 sang Blob và lưu vào IndexedDB
               try {
                  const blob = imageDB.base64ToBlob(imgStr);
                  await imageDB.saveImage(imgKey, blob);

                  // 3. Thay thế nội dung ảnh bằng KEY tham chiếu
                  processedImages.push({ type: 'indexed_db_ref', key: imgKey });
               } catch (err) {
                  console.error("Lỗi lưu ảnh IDB:", err);
                  // Nếu lỗi thì giữ nguyên ảnh gốc để không bị mất
                  processedImages.push(imgStr);
               }
            } else {
               // Nếu là URL thường thì giữ nguyên
               processedImages.push(imgStr);
            }
         }
         // Cập nhật lại imageData của bản sao bằng danh sách đã tối ưu
         cleanPost.imageData = JSON.stringify(processedImages);
      }

      // Thêm vào danh sách để lưu LocalStorage
      postsForLocal.push(cleanPost);
   }

   // CUỐI CÙNG: Lưu danh sách "nhẹ" vào LocalStorage
   try {
      localStorage.setItem('cached_feed_data', JSON.stringify(postsForLocal));
      console.log("✅ Đã cache feed thành công (Ảnh -> IndexedDB, Text -> Local)");
   } catch (e) {
      console.warn("LocalStorage bị đầy:", e);
   }

}
