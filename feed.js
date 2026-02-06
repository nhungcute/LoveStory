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
                   if (container.children.length > 0) smartSyncFeed(cachedData, container);
                   else mergeServerDataToView(cachedData);
               } catch (e) {}
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
            // Logic hiển thị trang 1
            if (container.children.length > 0 && !container.querySelector('.post-skeleton')) {
                smartSyncFeed(sortedData, container);
            } else {
                container.innerHTML = '';
                mergeServerDataToView(sortedData);
            }
            // Lưu cache
            localStorage.setItem('cached_feed_data', JSON.stringify(sortedData));
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
// 2. HÀM MỞ MODAL XEM ẢNH
function openPostImages(postId, startIndex = 0) {
    const post = serverFeedData.find(p => p.__backendId === postId || p.id === postId);
    if (!post) return;

    let images = [];
    if (post.imageData) {
        if (Array.isArray(post.imageData)) {
            images = post.imageData;
        } else {
            try { images = JSON.parse(post.imageData); } 
            catch (e) { images = [post.imageData]; }
        }
    } 
    // Fallback nếu code cũ dùng post.images
    else if (post.images && Array.isArray(post.images)) {
        images = post.images;
    }
    // Nếu không có ảnh nào thì thoát
    if (!images || images.length === 0) {
        console.warn("Bài viết không có ảnh để hiển thị");
        return;
    }
    const container = document.getElementById('carousel-items-container');
    if (!container) {
        console.error("Thiếu HTML Modal: Không tìm thấy #carousel-items-container");
        return;
    }
    container.innerHTML = '';
    // Tạo HTML cho từng slide
    images.forEach((imgUrl, index) => {
        const isActive = index === startIndex ? 'active' : '';
        // class "contain-mode" giúp ảnh không bị cắt (object-fit: contain)
        const itemHtml = `
            <div class="carousel-item h-100 ${isActive}">
                <img src="${imgUrl}" class="d-block w-100 h-100" style="object-fit: contain; background: black;" alt="Image ${index}">
            </div>
        `;
        container.insertAdjacentHTML('beforeend', itemHtml);
    });

    // Ẩn/Hiện nút Next/Prev nếu chỉ có 1 ảnh
    const controls = document.querySelectorAll('#imageViewerModal .carousel-control-prev, #imageViewerModal .carousel-control-next');
    if (images.length <= 1) {
        controls.forEach(el => el.style.display = 'none');
    } else {
        controls.forEach(el => el.style.display = 'flex');
    }

    // Mở Modal (Bootstrap 5)
    const modalEl = document.getElementById('imageViewerModal');
    if (modalEl) {
        const myModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        myModal.show();
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
// ----------------------------------------------------------------
// Hàm này đảm bảo giao diện khớp 100% với danh sách Server trả về
// mà không gây nháy màn hình, giữ nguyên vị trí cuộn.
function smartSyncFeed(newDataList, container) {
    // newDataList: Danh sách bài viết chuẩn từ Server (Đã sort)
    
    // Duyệt qua từng phần tử trong danh sách MỚI
    newDataList.forEach((postData, index) => {
        const postId = postData.__backendId || postData.id;
        const existingNode = document.getElementById(`post-${postId}`);
        
        // Vị trí hiện tại trên DOM (children[index])
        const currentNodeAtPos = container.children[index];

        if (existingNode) {
            // A. BÀI VIẾT ĐÃ TỒN TẠI TRÊN DOM
            
            // 1. Kiểm tra xem nó có đang nằm đúng vị trí thứ tự không?
            if (currentNodeAtPos !== existingNode) {
                // Nếu sai vị trí -> Chuyển nó về đúng vị trí index hiện tại
                // (Hàm insertBefore sẽ tự động "bốc" element từ chỗ cũ sang chỗ mới)
                if (currentNodeAtPos) {
                    container.insertBefore(existingNode, currentNodeAtPos);
                } else {
                    container.appendChild(existingNode);
                }
            }

            // 2. Cập nhật nội dung bên trong (Số like, comment, text...)
            updatePostContentOnly(existingNode, postData);

        } else {
            // B. BÀI VIẾT MỚI HOÀN TOÀN (Chưa có trên DOM)
            const newHtml = createPostHtml(postData);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = newHtml;
            const newNode = tempDiv.firstElementChild;
            
            // Thêm hiệu ứng xuất hiện
            newNode.classList.add('fade-in');

            // Chèn vào đúng vị trí index
            if (currentNodeAtPos) {
                container.insertBefore(newNode, currentNodeAtPos);
            } else {
                container.appendChild(newNode);
            }
        }
    });

    // C. XỬ LÝ BÀI THỪA (Đã bị xóa trên Server hoặc trôi sang trang 2)
    // Sau khi vòng lặp chạy xong, nếu DOM còn nhiều phần tử hơn Server trả về -> Xóa bớt đuôi
    while (container.children.length > newDataList.length) {
        // Kiểm tra kỹ: Chỉ xóa Element là bài post, không xóa nút Load More nếu lỡ nó nằm trong đây
        const lastEl = container.lastElementChild;
        if (lastEl && lastEl.id.startsWith('post-')) {
            lastEl.remove();
        } else {
            break; 
        }
    }
}
 
// Hàm chỉ cập nhật số liệu bên trong (tránh vẽ lại ảnh gây nháy)
function updatePostContentOnly(postEl, data) {
    // 1. Update Like Count
    const likeCountEl = postEl.querySelector('.like-count');
    // Dùng toán tử so sánh lỏng (!=) để bắt cả trường hợp '0' so với 0
    if (likeCountEl && likeCountEl.textContent != data.likeCount) {
        likeCountEl.textContent = data.likeCount || 0;
        triggerShake(likeCountEl); // Hiệu ứng rung báo thay đổi
    }

    // 2. Update Comment Count
    const cmtCountEl = postEl.querySelector('.comment-count');
    // Kiểm tra kỹ data.comments có phải mảng không
    const serverCmtCount = Array.isArray(data.comments) ? data.comments.length : 0;
    
    if (cmtCountEl && parseInt(cmtCountEl.textContent) !== serverCmtCount) {
        cmtCountEl.textContent = serverCmtCount;
        triggerShake(cmtCountEl);
    }
    
    // 3. Update trạng thái nút Like (Đỏ/Xám)
    const likeBtn = postEl.querySelector('.like-btn i');
    
    // --- [FIX QUAN TRỌNG] ---
    // Kiểm tra data.likes phải là mảng (Array) trước khi gọi .includes
    const isLiked = Array.isArray(data.likes) && 
                    currentProfile && 
                    data.likes.includes(currentProfile.username);
    
    if (likeBtn) {
        if (isLiked) {
            likeBtn.className = 'bi bi-heart-fill text-danger';
        } else {
            likeBtn.className = 'bi bi-heart';
        }
    }
}

// Helper hiệu ứng rung
function triggerShake(el) {
    el.classList.remove('anim-update');
    void el.offsetWidth;
    el.classList.add('anim-update');
}

// ----------------------------------------------------------------
// 3. CÁC HÀM HỖ TRỢ CŨ (GIỮ NGUYÊN)
// ----------------------------------------------------------------

// File: feed.js

function mergeServerDataToView(dataList) {
   const container = document.getElementById('posts-container');
   if (!container) return;

   // [FIX 1] XÓA LOADING SPINNER CŨ (Nếu có)
   // Tìm xem có cái spinner nào đang quay ở cuối không thì xóa đi
   const bottomLoader = document.getElementById('bottom-feed-loader');
   if (bottomLoader) bottomLoader.remove();

   dataList.forEach(post => {
      // [FIX 2] CHẶN TRÙNG LẶP BÀI VIẾT
      // Kiểm tra xem bài này đã có trên màn hình chưa
      const postId = post.__backendId || post.id;
      const existEl = document.getElementById(`post-${postId}`);

      if (existEl) {
         // Nếu bài viết đã tồn tại (do bị trôi từ trang 1 xuống), ta không vẽ lại nữa
         // Hoặc nếu muốn kỹ hơn: update lại nội dung cho nó (optional)
         console.log(`⚠️ Bỏ qua bài trùng lặp: ${postId}`);
         return; 
      }

      // Nếu chưa có thì mới vẽ và chèn vào cuối
      const html = createPostHtml(post);
      container.insertAdjacentHTML('beforeend', html);
   });
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
               const compressedBase64 = await compressImage(file, 1920, 0.7);
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

// Hàm Render chính (Hỗ trợ Append và Tự động dọn dẹp DOM) 
function renderPostsPaged(newPosts, page) {
   const container = document.getElementById('posts-container');
   if (!container) return;

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
   uniquePosts.forEach(post => {
       const html = createPostHtml(post);
       container.insertAdjacentHTML('beforeend', html);
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
    smartSyncFeed(serverFeedData.slice(0, 15)); // Chỉ sync 15 bài đầu
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

// --- LOGIC IMAGE CAROUSEL ---
function openPostImages(postId, startIndex = 0) {
    console.log("1. Đang mở bài viết ID:", postId); 

    // 1. Tìm bài viết trong dữ liệu
    const post = serverFeedData.find(p => p.__backendId === postId || p.id === postId);
    
    if (!post) {
        console.error("❌ Không tìm thấy bài viết trong bộ nhớ");
        return;
    } 
    let images = [];

    // Trường hợp 1: Dữ liệu chuẩn từ Server (thường tên là imageData)
    if (post.imageData) {
        if (Array.isArray(post.imageData)) {
            images = post.imageData;
        } else {
            // Nếu là chuỗi JSON string "['url1', 'url2']" -> Parse ra mảng
            try { 
                images = JSON.parse(post.imageData); 
            } catch (e) { 
                // Nếu không parse được (ví dụ link ảnh đơn) -> nhét vào mảng
                images = [post.imageData]; 
            }
        }
    } 
    // Trường hợp 2: Dữ liệu đã qua xử lý (tên là images)
    else if (post.images) {
        images = Array.isArray(post.images) ? post.images : [post.images];
    }

    console.log("2. Danh sách ảnh tìm được:", images);

    // Kiểm tra lại lần cuối
    if (!images || images.length === 0) {
        console.warn("⚠️ Bài viết này thực sự không có ảnh nào.");
        return;
    }

    // 2. Tìm khung chứa trong Modal
    const container = document.getElementById('carousel-items-container');
    if (!container) {
        console.error("❌ Lỗi HTML: Không tìm thấy div id='carousel-items-container'");
        return;
    }

    // 3. Reset và Thêm ảnh vào Carousel
    container.innerHTML = ''; 

    images.forEach((imgUrl, index) => {
        const isActive = index === startIndex ? 'active' : '';
        // Thêm style object-fit: contain để ảnh hiển thị trọn vẹn
        const itemHtml = `
            <div class="carousel-item h-100 ${isActive}">
                <div class="d-flex justify-content-center align-items-center h-100 w-100" style="background: black;">
                    <img src="${imgUrl}" class="d-block" style="max-width: 100%; max-height: 100%; object-fit: contain;" alt="Image ${index}">
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', itemHtml);
    });

    // 4. Ẩn/Hiện nút Next/Prev nếu chỉ có 1 ảnh
    const controls = document.querySelectorAll('#imageViewerModal .carousel-control-prev, #imageViewerModal .carousel-control-next');
    if (images.length <= 1) {
        controls.forEach(el => el.style.display = 'none');
    } else {
        controls.forEach(el => el.style.display = 'flex');
    }

    // 5. Mở Modal
    const modalEl = document.getElementById('imageViewerModal');
    if (modalEl) {
        const myModal = new bootstrap.Modal(modalEl);
        myModal.show();
    }
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
      const previewBase64 = await compressImage(file, 500, 0.6);
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
        if(typeof commentModal !== 'undefined') commentModal.show();
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
        if(typeof postOptionsModal !== 'undefined') postOptionsModal.show();
        else new bootstrap.Modal(document.getElementById('postOptionsModal')).show();
        
        return;
    }
});

// --- HÀM CẬP NHẬT CACHE CỤC BỘ KHI LIKE (Để đồng bộ dữ liệu) ---
function updateLocalDataLike(postId, username, isLiked) {
    const post = serverFeedData.find(p => p.__backendId === postId || p.id === postId);
    if (post) {
        // Cập nhật danh sách likes trong bộ nhớ
        if (!post.likes) post.likes = [];
        
        if (isLiked) {
            if (!post.likes.includes(username)) post.likes.push(username);
        } else {
            post.likes = post.likes.filter(u => u !== username);
        }
        post.likeCount = post.likes.length;
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


// File: feed.js

// 1. Thêm tham số postId = null
function renderPostImages(images, layout, postId = null) {
   if (!images || images.length === 0) 
		return '';
        
   const count = images.length;
   let layoutClass = '';
   
   // ... (Giữ nguyên logic chia layout cũ của bạn) ...
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
      displayLimit = 3;
   }

   const showCount = Math.min(count, displayLimit);

   for (let i = 0; i < showCount; i++) {
      // 2. [QUAN TRỌNG] Logic xử lý onclick an toàn
      // Nếu có postId (ở Feed) -> Gán hàm mở Modal
      // Nếu không có postId (ở Preview) -> Không gán onclick (hoặc làm việc khác tùy bạn)
      const clickAttr = postId 
          ? `onclick="openPostImages('${postId}', ${i})"` 
          : ''; 

      // 3. Chèn biến clickAttr vào thẻ img
      html += `<div class="img-box">`;
      html += `<img src="${images[i]}" 
              loading="lazy" 
              class="w-100 h-100 object-fit-cover cursor-pointer" 
              ${clickAttr} 
              alt="Image">`;

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
   const avatarUrl = post.avatar; // Biến này có vẻ chưa dùng, nhưng giữ lại theo code gốc
   const images = parseImages(post.imageData);
   
   // --- LOGIC 1: QUYỀN CHỦ SỞ HỮU ---
   const isOwner = currentProfile && currentProfile.username === post.username;
   const verifiedIcon = isOwner ? `<i class="bi bi-patch-check-fill text-primary ms-1"></i>` : '';
   const avatarHtml = createAvatarHtml(post, 'avatar-circle'); // Hàm này bạn đã có sẵn
   
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
   const heartIconClass = post.liked ? 'bi-heart-fill text-danger' : 'bi-heart';
   const likeCountText = post.likes > 0 ? post.likes : 'Thích';
   const likeBtnClass = post.liked ? 'active' : '';

   // --- LOGIC 4: XỬ LÝ NỘI DUNG DÀI (TÍNH NĂNG MỚI) ---
   let contentHtml = '';
   if (post.content) {
       const contentRaw = post.content;
       const MAX_LENGTH = 300; // Ngưỡng ký tự để cắt

       if (contentRaw.length > MAX_LENGTH) {
           // Tạo bản rút gọn và bản đầy đủ
           const shortText = processTextWithHashtags(contentRaw.substring(0, MAX_LENGTH) + '...');
           const fullText = processTextWithHashtags(contentRaw);
           
           contentHtml = `
               <div class="post-content-text">
                   <div id="content-short-${post.__backendId}">
                       ${shortText}
                       <span class="see-more-btn fw-bold text-primary cursor-pointer" onclick="togglePostContent(this, '${post.__backendId}')">Xem thêm</span>
                   </div>
                   <div id="content-full-${post.__backendId}" style="display: none;">
                       ${fullText}
                   </div>
               </div>`;
       } else {
           // Nếu ngắn thì hiện bình thường
           contentHtml = `<div class="post-content-text">${processTextWithHashtags(contentRaw)}</div>`;
       }
   }

   // --- LOGIC 5: XỬ LÝ ẢNH (TÍNH NĂNG MỚI) ---
   // Quan trọng: Truyền thêm post.__backendId vào tham số thứ 3
   // để hàm renderPostImages gắn sự kiện onclick mở Modal Viewer
   const imagesHtml = renderPostImages(images, post.layout || 'grid-2x2', post.__backendId);

   // --- LOGIC 6: XỬ LÝ COMMENT ---
   const timeDisplay = formatTimeSmart(post.timestamp || post.createdAt);
   let commentsHtml = '';
   const comments = post.commentsData || [];

   if (comments.length > 0) {
      const visibleComments = comments.slice(0, 2);
      const hiddenComments = comments.slice(2);
      let commentListHtml = visibleComments.map(c => createCommentHtml(c)).join('');
      
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

   // --- TRẢ VỀ HTML CUỐI CÙNG ---
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
         
         ${contentHtml} 
         ${imagesHtml}
         
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

// --- HÀM TẠO SKELETON (THÊM MỚI) ---
function createSkeletonHtml(count = 3) {
    let html = '';
    for(let i=0; i<count; i++) {
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
