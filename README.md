# 💖 LoveStory - Social Memory App

LoveStory (Social Memory) là một ứng dụng Web di động (Web App) được thiết kế để lưu giữ, chia sẻ những khoảnh khắc và kỷ niệm đáng nhớ. Ứng dụng kết hợp giữa mạng xã hội cá nhân và sức mạnh trí tuệ nhân tạo (AI) để mang lại trải nghiệm độc đáo, tốc độ cao và tối ưu dung lượng.

## 🚀 Tính năng nổi bật

### 📱 Bảng tin (Newsfeed) & Trình Quản Lý Đa Phương Tiện
-   **Đăng bài Đa Nền Tảng**: Chia sẻ trạng thái bằng văn bản kèm theo hình ảnh hoặc video lưu trữ trực tiếp trên Google Drive.
-   **Bố cục Ảnh Thông Minh (Smart Layouts)**: Hỗ trợ tự động hiển thị ảnh theo nhiều bố cục chuyên nghiệp như `Grid (Lưới)`, `Top-Bottom (Trên-Dưới)`, `Left-Right (Trái-Phải)` và `Mosaic`. Thumbnail được tối ưu hóa ở độ phân giải s600 siêu nét.
-   **Trình xem Ảnh Chuyên Nghiệp**: Image Viewer được thiết kế dưới dạng Modal khung nổi tinh tế, tự động giữ nguyên tỷ lệ ảnh gốc (Aspect-ratio) bằng công nghệ `object-fit`, mang lại trải nghiệm xem HD liền mạch mà không che khuất thanh điều hướng.
-   **Tương tác mạnh mẽ**: Thích (Like) và Bình luận (Comment) bài viết. Hỗ trợ chỉnh sửa/xóa bình luận của cá nhân.
-   **Infinite Scroll**: Cuộn vô tận giúp trải nghiệm xem bảng tin mượt mà, tối ưu hóa RAM cho thiết bị di động.

### 🤖 Trí tuệ Nhân tạo & Tìm kiếm (LoveStory AI)
-   **Chat AI**: Trò chuyện với trợ lý ảo bằng mô hình **Gemini 1.5 Flash**. AI có khả năng truy xuất trực tiếp các Kỷ niệm trong bảng tin để trò chuyện như một người bạn.
-   **Phân tích tài liệu (RAG Vector Embedding)**: Hệ thống cho phép upload các file Text/PDF nặng, tự động "băm nhỏ" văn bản (Chunking) và nén thành Vector Indexes lưu vào Google Sheets. Tính năng Bypass Rate Limit được tích hợp để chống lỗi `429 Quota Exceeded` từ Google API.
-   **Truy vấn Tài Liệu**: Dùng cú pháp `***tên_file*** <câu hỏi>` để trò chuyện trực tiếp với tài liệu.

### 🔔 Quản lý Thông báo & Hồ sơ (Profile)
-   **Profiles & Clean Storage**: Tùy biến thông tin cá nhân, Avatar và Theme màu (Green, Purple, Blue, Red, v.v.). Cơ chế dọn rác tự động (Auto-Trash) xóa vĩnh viễn Avatar cũ trên Drive khi cập nhật ảnh mới, giúp tiết kiệm dung lượng lưu trữ tuyệt đối.
-   **Thông báo Real-time**: Pull-To-Refresh để làm mới thông báo. Tự động nhóm các thông báo đọc/chưa đọc. Hỗ trợ cảnh báo bảo mật qua Bot Telegram độc lập.

### 🛠️ Các Tiện ích Bổ sung (Widgets)
-   **Baby Run Tracker / Kick Counter**: Tích hợp các Widget theo dõi chu kỳ, nhịp độ hàng ngày (có hỗ trợ Chart.js vẽ biểu đồ trực quan).
-   **Biểu đồ Vàng (Gold Price)**: Kết nối dữ liệu ngoại vi để lưu trữ và hiển thị biểu đồ giao dịch Vàng cá nhân.

## ⚙️ Kiến trúc Hệ thống (Architecture)

-   **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Custom Design System, Variable Themes).
-   **UI Framework**: Bootstrap 5.3.3 & Bootstrap Icons.
-   **Backend Core**: Google Apps Script (GAS) - Đã được Clean Code, loại bỏ 100% Dead Code và tối ưu hóa hiệu suất API.
-   **Database**: Google Sheets (Cơ sở dữ liệu NoSQL-like) + LockService chống ghi đè dữ liệu.
-   **Storage**: Google Drive API (Chỉ mục thư mục LoveStory_Documents và LoveStory_Images).

## 📦 Cấu trúc Thư mục Code

```text
├── css/
│   └── style.css          # Hệ thống CSS Variables và Core App Styling
├── js/
│   ├── app.js             # Vòng đời ứng dụng, quản lý Routing & Tabs
│   ├── feed.js            # Xử lý Bảng tin, Smart Image Layouts & Media Viewer
│   ├── search.js          # Giao diện LoveStory AI Chat & Autocomplete
│   ├── notifications.js   # Quản lý Inbox, Badge và Modal Thông báo
│   ├── home.js            # Logic cho các Mini-Widgets (Gold, Baby Tracker)
│   ├── document.js        # File Uploader & Client-Side RAG Chunking Module
│   ├── profile.js         # Lưu hồ sơ, validation & dọn rác Drive Storage
│   └── utils.js           # Fetch API Wrappers & Các hàm format toàn cục
├── code.gs                # Toàn bộ mã nguồn Backend GAS (API Controller)
├── index.html             # Tệp tin gốc (Single Page Application Hub)
└── README.md              # File tài liệu kỹ thuật
```

## 🚀 Hướng dẫn Cài đặt & Triển khai

1.  **Backend (Google Apps Script)**: Copy toàn bộ nội dung tệp `code.gs` vào một dự án GAS mới.
2.  **Database (Google Sheets)**: Tạo các sheet: `feed`, `profiles`, `logs`, `dtdlike`, `dtdcomment`, `Gold Data`, `EmbeddingIndex`, `gold_entries` (hoặc `goldmb`).
3.  **Config variables**: Vào `code.gs` cập nhật `DRIVE_FOLDER_ID` (ID Thư mục lưu ảnh), `GA_K1` & `GA_K2` (Cặp khóa API Gemini), `TELEGRAM_BOT_TOKEN`, và `TELEGRAM_CHAT_ID`.
4.  **Triển khai (Deploy)**: Build GAS dưới dạng Web App (Quyền truy cập: *Anyone* / *Bất kỳ ai*). Lấy URL Web App dán vào biến `API_URL` nằm trên cùng của tệp `js/utils.js`.
5.  **Hosting Frontend**: Đưa các tệp HTML/CSS/JS lên bất kỳ Hosting/CDN nào (Vercel, GitHub Pages, Netlify) và tận hưởng!

---
*Phát triển với ❤️ cho những kỷ niệm đáng nhớ. Luôn được bảo trì và tối ưu định kỳ.*