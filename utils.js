/**
 * =============================================================================
 * FILE: utils.js
 * CHỨC NĂNG: Các hàm tiện ích dùng chung (Helpers/Utils).
 * LƯU Ý: 
 * 1. File này phải được nhúng trước các file script logic chính.
 * 2. Biến toàn cục 'API_URL' cần được định nghĩa trước khi gọi hàm sendToServer.
 * =============================================================================
 */
// --- CẤU HÌNH KẾT NỐI ---
const API_URL = 'https://script.google.com/macros/s/AKfycbxplJCtu7hzAm32o1GUpG2o0FfGk-O7C1VtsLojPOYs9vY8H_4CMxvgekX4Ngr_99AW/exec';

let userFingerprint = null;

// 5. Quản lý LocalStorage
const STORAGE_KEY = 'social_memory_profile';

// --- DỮ LIỆU RANDOM ---
const randomAnimals = ['Gấu', 'Hổ', 'Sư Tử', 'Voi', 'Hươu', 'Cá', 'Vẹt', 'Mèo', 'Chó', 'Rùa', 'Khỉ', 'Thỏ', 'Sói', 'Cáo', 'Heo', 'Bò', 'Gà', 'Vịt', 'Cú', 'Dê', 'Cừu', 'Kiến', 'Tép', 'Tôm'];
const randomColors = ['Xanh', 'Đỏ', 'Tím', 'Vàng', 'Cam', 'Hồng', 'Đen', 'Trắng'];

const defaultConfig = {
   app_title: 'Love Story',
   welcome_message: 'Lưu giữ kỷ niệm đẹp'
};

const themes = {
   green: {
      primary: '#006B68',
      secondary: '#FFC62F',
      text: '#212529',
      bg: '#f8f9fa',
      surface: '#ffffff'
   },
   purple: {
      primary: '#667eea',
      secondary: '#764ba2',
      text: '#1f2937',
      bg: '#f8f9fa',
      surface: '#ffffff'
   },
   blue: {
      primary: '#1e3a8a',
      secondary: '#3b82f6',
      text: '#000000',
      bg: '#f0f9ff',
      surface: '#ffffff'
   },
   red: {
      primary: '#dc2626',
      secondary: '#fb923c',
      text: '#000000',
      bg: '#fef2f2',
      surface: '#ffffff'
   }
};

const defaultStatsLayout = [{
   id: 'bike',
   column: 0,
   size: 'medium'
},
{
   id: 'days',
   column: 0,
   size: 'medium'
},
{
   id: 'memory',
   column: 0,
   size: 'medium'
},
{
   id: 'event',
   column: 0,
   size: 'medium'
},
{
   id: 'gold',
   column: 0,
   size: 'medium'
}
];

let allData = [];
let currentProfile = null;
let currentTab = 'home';
let currentPostId = null;
let pendingDeleteId = null;
let pendingDeleteType = null;
let currentImages = [];
let currentImagePreviews = [];
let memoryImageData = null;
let recordCount = 0;
let currentTheme = 'green';
let selectedLayout = 'grid-2x2';
let isEditMode = false;
let statsLayout = [...defaultStatsLayout];
let draggedElement = null;
let draggedId = null;

let serverFeedData = [];
let feedPage = 1;
let feedLoading = false;
let feedHasMore = true;
let isLoadingFeed = false;
let currentHashFilter = null;
let feedObserver = null;

let loadingToast, successToast;
let createPostModal, commentModal, profileModal, postOptionsModal, deleteConfirmModal, bikeStatsModal, addBikeEntryModal, goldStatsModal, addGoldEntryModal, notificationsModal;

let isEditingPost = false;
let currentEditPostId = null;

let bikeHistoryPage = 1;
let bikeHistoryLoading = false;
let bikeHistoryHasMore = true;

// --- BIẾN QUẢN LÝ PHÂN TRANG FEED ---

// --- HASHTAG LOGIC START ---


// --- BIẾN QUẢN LÝ PHÂN TRANG notifPage ---
let notifPage = 1;
let notifLoading = false;
let notifHasMore = true;
let serverNotifications = [];
// [MỚI] Thời điểm cuối cùng người dùng thực hiện thao tác ghi
let pendingTasksCount = 0;
let lastUserActionTime = 0;

let isEditingGold = false;
let currentEditGoldId = null;
// Thêm dòng này vào danh sách biến global (cùng chỗ với createPostModal...)
let imageViewerModal;

// Biến toàn cục lưu dữ liệu vàng
let goldMarketData = [];
let goldPortfolioData = [];
// --- BIẾN TOÀN CỤC MỚI CHO COMMENT ---
let currentCommentId = null;
let currentCommentContent = '';
let commentOptionsModal = new bootstrap.Modal(document.getElementById('commentOptionsModal'));
let editCommentContentModal = new bootstrap.Modal(document.getElementById('editCommentContentModal'));

// Trong hàm initApp hoặc (async () => { ... })();
// Thêm dòng này vào phần khởi tạo:
imageViewerModal = new bootstrap.Modal(document.getElementById('imageViewerModal'));
// --- BIẾN QUẢN LÝ TIẾN TRÌNH UPLOAD ---
// --- LOGIC XỬ LÝ VUỐT (SWIPE) & CLICK THÔNG MINH ---
let touchStartX = 0;
let currentSwipedId = null;
let isSwiping = false; // Biến cờ để chặn click nhầm khi đang vuốt
// --- LOGIC XỬ LÝ VUỐT (SWIPE) & CLICK THÔNG MINH (ĐÃ FIX LỖI CUỘN TRANG) ---
let touchStartY = 0; // [MỚI] Thêm biến lưu tọa độ Y
let isScrolling = false; // [MỚI] Biến cờ xác định đang cuộn trang
// --- BIẾN QUẢN LÝ PHÂN TRANG FEED ---
let currentMarketPrice_GoldData = null;

/* ==========================================================================
   1. XỬ LÝ CHUỖI & DỮ LIỆU CƠ BẢN (STRING & DATA PARSING)
   ========================================================================== */

// Chuẩn hóa tiếng Việt (Xóa dấu để tìm kiếm)
function normalizeStr(str) {
    if (!str) return '';
    return str.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d").replace(/Đ/g, "D")
        .toLowerCase().trim();
}

// Chống XSS khi hiển thị text
function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Parse chuỗi JSON Comments an toàn
function parseComments(commentsStr) {
    if (!commentsStr) return [];
    try {
        return JSON.parse(commentsStr);
    } catch {
        return [];
    }
}

// Parse chuỗi JSON Images (xử lý cả trường hợp chuỗi đơn)
function parseImages(imageStr) {
    if (!imageStr) return [];
    try {
        return JSON.parse(imageStr);
    } catch {
        return imageStr ? [imageStr] : [];
    }
}

/* ==========================================================================
   2. ĐỊNH DẠNG HIỂN THỊ (FORMATTING UI)
   ========================================================================== */

// Định dạng tiền tệ (VND)
const formatCurrency = (value) => {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(value);
};

// Định dạng Lãi/Lỗ (Màu sắc + Dấu)
const formatPNL = (value) => {
    if (value > 0) return `<span class="text-success">+${formatCurrency(value)}</span>`;
    if (value < 0) return `<span class="text-danger">${formatCurrency(value)}</span>`;
    return `<span class="text-muted">${formatCurrency(value)}</span>`;
};

// Xử lý Hashtag trong văn bản (Thêm thẻ span và sự kiện click)
function processTextWithHashtags(text) {
    if (!text) return '';
    const safeText = escapeHtml(text); // Luôn escape trước khi xử lý HTML
    return safeText.replace(/(^|\s)(#[\w\p{L}]+)/gu, '$1<span class="hashtag" onclick="filterByHashtag(\'$2\')">$2</span>');
}

// Định dạng thời gian thông minh (Vừa xong, x phút trước...)
function formatTimeSmart(dateStr) {
    if (!dateStr) return '';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);

    // Xử lý logic hiển thị relative
    if (diffSeconds < 60) return `${Math.max(1, diffSeconds)} giây`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} phút`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} giờ`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays <= 7) return `${diffDays} ngày`;

    // Quá 7 ngày -> Hiện Full ngày giờ
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();

    return `${hh}:${mm} ${dd}/${mo}/${yyyy}`;
}

/* ==========================================================================
   3. XỬ LÝ FILE & ẢNH (FILE & IMAGE PROCESSING)
   ========================================================================== */

// Đọc file dưới dạng Base64
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// Nén ảnh thông thường (Resize + Quality)
function compressImage(file, maxWidth = 1920, quality = 0.8) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Resize thông minh
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        };
    });
}

// Nén ảnh cực mạnh (<20KB) để lưu vào Cell của Google Sheet
function compressImageTo20KB(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width,
                    h = img.height;
                const MAX = 600; // Bắt đầu resize từ kích thước này

                if (w > h && w > MAX) {
                    h *= MAX / w;
                    w = MAX;
                } else if (h > MAX) {
                    w *= MAX / h;
                    h = MAX;
                }

                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                let quality = 0.8;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                
                // Giảm chất lượng lặp lại cho đến khi dưới 20KB
                while (dataUrl.length > 20000 && quality > 0.1) { 
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                }
                resolve(dataUrl);
            }
        }
    });
}

/* ==========================================================================
   4. GIAO TIẾP SERVER (NETWORK / API)
   ========================================================================== */

// Hàm gửi dữ liệu chung (POST)
async function sendToServer(payload) {
    if (typeof API_URL === 'undefined') {
        console.error("Chưa cấu hình biến API_URL");
        return { status: 'error', message: 'Missing API Configuration' };
    }

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (e) {
        console.error("Lỗi API:", e);
        return {
            status: 'error',
            message: e.message
        };
    }
}