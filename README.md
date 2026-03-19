# 💖 LoveStory - Social Memory App

LoveStory (Social Memory) là một ứng dụng Web di động (Web App) được thiết kế để lưu giữ, chia sẻ những khoảnh khắc và kỷ niệm đáng nhớ. Ứng dụng kết hợp giữa mạng xã hội cá nhân và sức mạnh trí tuệ nhân tạo (AI) để mang lại trải nghiệm độc đáo và tiện lợi.

## 🚀 Tính năng chính

### 📱 Bảng tin (Newsfeed)
-   **Đăng bài**: Chia sẻ trạng thái bằng văn bản kèm theo hình ảnh hoặc video.
-   **Tương tác mạnh mẽ**: Thích (Like) và Bình luận (Comment) bài viết. Hỗ trợ chỉnh sửa và xóa bình luận của cá nhân.
-   **Hashtag (#)**: Gắn hashtag vào bài viết và dễ dàng lọc tìm các kỷ niệm có cùng chủ đề chỉ với một cú chạm.
-   **Infinite Scroll**: Cuộn vô tận giúp trải nghiệm xem bảng tin mượt mà.
-   **Trình xem đa phương tiện**: Xem ảnh chất lượng cao (HD) và video trực tiếp từ Google Drive với giao diện chuyên nghiệp.

### 🤖 Tìm kiếm Thông minh (AI Search)
-   **Chat AI**: Trò chuyện với trợ lý AI thân thiện, am hiểu về các kỷ niệm đã được lưu giữ trong ứng dụng.
-   **Phân tích tài liệu (RAG)**: Sử dụng cú pháp `@tên_file` để yêu cầu AI phân tích và trả lời dựa trên nội dung tài liệu (PDF, Text, v.v.) đã tải lên.
-   **Gemini 1.5 Flash**: Tích hợp mô hình AI mới nhất của Google để phản hồi nhanh chóng và chính xác.

### 🔔 Thông báo (Notifications)
-   **Thông báo thời gian thực**: Nhận thông báo khi có người thích hoặc bình luận vào bài viết của bạn.
-   **Quản lý thông minh**: Đánh dấu đã đọc, xóa từng thông báo hoặc quản lý tất cả chỉ với vài thao tác.
-   **Pull-To-Refresh**: Vuốt xuống để cập nhật thông báo mới nhất ngay lập tức.

### 🛠️ Các Tiện ích khác
-   **Baby Run Tracker**: Theo dõi các số liệu quan trọng hàng ngày.
-   **Biểu đồ giá Vàng**: Theo dõi biến động giá vàng thị trường và quản lý giao dịch cá nhân.
-   **Cá nhân hóa**: Thay đổi biệt danh, ảnh đại diện và chủ đề màu sắc ứng dụng.

## 🛠️ Công nghệ sử dụng

-   **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Custom Design System).
-   **Framework**: [Bootstrap 5](https://getbootstrap.com/) & [Bootstrap Icons](https://icons.getbootstrap.com/).
-   **Backend**: [Google Apps Script](https://www.google.com/script/start/) (GAS).
-   **Database**: [Google Sheets](https://www.google.com/sheets/about/) (Sử dụng bảng tính làm cơ sở dữ liệu).
-   **AI Engine**: [Google Gemini API](https://ai.google.dev/).
-   **Storage**: [Google Drive API](https://developers.google.com/drive) (Lưu trữ ảnh và video).

## 📦 Cấu trúc thư mục

```text
├── css/
│   └── style.css          # Hệ thống style và biến theme toàn cục
├── js/
│   ├── app.js             # Logic khởi tạo và quản lý tab
│   ├── feed.js            # Xử lý bảng tin, hashtag và media
│   ├── search.js          # Giao diện AI Search & Chat
│   ├── notifications.js   # Quản lý thông báo và modal
│   ├── home.js            # Logic cho các Widget và Tiện ích
│   ├── document.js        # Quản lý tài liệu và Vector Embedding
│   └── utils.js           # Các hàm bổ trợ và kết nối API
├── code.gs                # Toàn bộ mã nguồn Backend (chạy trên GAS)
├── index.html             # Tệp tin chính của ứng dụng
└── README.md              # Tài liệu hướng dẫn này
```

## ⚙️ Cài đặt & Triển khai

1.  **Backend**: Sao chép nội dung tệp `code.gs` vào một dự án Google Apps Script mới.
2.  **Database**: Tạo một Google Spreadsheet và liên kết với dự án script. Đảm bảo các sheet như `feed`, `profiles`, `logs`, `dtdlike`, `dtdcomment` được khởi tạo.
3.  **Config**: Cập nhật `DRIVE_FOLDER_ID` và `API Key` (Gemini) trong tệp `code.gs`.
4.  **Frontend**: Cập nhật hằng số `API_URL` trong tệp `js/utils.js` bằng đường dẫn Web App đã triển khai từ GAS.
5.  **Deployment**: Triển khai GAS Web App ở chế độ "Anyone" và truy cập `index.html` để trải nghiệm.

---
*Phát triển với ❤️ cho những kỷ niệm đáng nhớ.*