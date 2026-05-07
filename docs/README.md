# LoveStory Documentation

LoveStory là một web app mobile-first để lưu, chia sẻ và tìm lại kỷ niệm cá nhân. Ứng dụng hiện là SPA tĩnh, không có bước build, dùng HTML/CSS/Vanilla JavaScript ở frontend. Backend hiện tại là Google Apps Script; kế hoạch dài hạn có thể chuyển database sang PostgreSQL thông qua một backend API riêng.

## Tài Liệu Chính

- [Kế hoạch triển khai](./implementation/00-overview.md)
- [Kế hoạch migration PostgreSQL](./implementation/07-postgresql-migration.md)
- [Hướng dẫn agent và quy ước phát triển](./AGENT_GUIDE.md)

## Các Bước Triển Khai

1. [Dọn tài liệu và cấu trúc](./implementation/01-docs-and-structure.md)
2. [Ổn định frontend](./implementation/02-frontend-stabilization.md)
3. [Kiểm thử smoke test](./implementation/03-smoke-testing.md)
4. [Đồng bộ backend Google Apps Script](./implementation/04-backend-sync.md)
5. [Triển khai frontend](./implementation/05-frontend-deploy.md)
6. [Triển khai backend](./implementation/06-backend-deploy.md)
7. [Migration database sang PostgreSQL](./implementation/07-postgresql-migration.md)

## Kiến Trúc Hiện Tại

```text
Browser SPA
  -> js/utils.js sendToServer(payload)
  -> Google Apps Script Web App
  -> Google Sheets + Google Drive
  -> Gemini API / Telegram Bot
```

## Kiến Trúc Mục Tiêu Khi Dùng PostgreSQL

```text
Browser SPA on GitHub Pages
  -> HTTPS API backend
  -> PostgreSQL
  -> Object storage for images/documents
  -> Gemini API / Telegram Bot
```

Trình duyệt không kết nối trực tiếp PostgreSQL. Cần có backend API đứng giữa để bảo vệ credentials, validate dữ liệu, phân quyền và xử lý CORS.

## Nguyên Tắc Vận Hành

- Không dùng bundler; script và CSS được load trực tiếp trong `index.html`.
- Khi đổi JS/CSS, tăng query version `?v=` trong `index.html` để tránh cache cũ.
- Mỗi file JS/CSS nên giữ dưới 200 dòng.
- `API_URL` trong `js/utils.js` phải trỏ đúng backend API đang dùng.
- Database production không nên public trực tiếp ra internet.

