# Agent Guide

## Bối Cảnh

LoveStory là SPA tĩnh, không có build step. Mọi thay đổi runtime nằm trong `index.html`, `css/`, `js/`, hoặc backend Google Apps Script ngoài repo.

## Quy Ước Phát Triển

- Đọc `docs/README.md` và `docs/implementation/00-overview.md` trước khi triển khai thay đổi lớn.
- Ưu tiên giữ mỗi file JS/CSS dưới 200 dòng.
- Không refactor lan rộng nếu không cần cho yêu cầu hiện tại.
- Không revert thay đổi chưa rõ nguồn gốc trong working tree.
- Khi sửa JS/CSS được load bởi `index.html`, cân nhắc bump query `?v=`.
- Với dữ liệu user/backend, tránh render trực tiếp bằng `innerHTML` nếu chưa escape/allowlist.
- Sau khi sửa JS, chạy:

  ```powershell
  Get-ChildItem js -Filter *.js | ForEach-Object { node --check $_.FullName }
  ```

## Module Map

- `app.js`: khởi tạo app, profile/theme, badge prefetch.
- `tab-routing.js`: điều hướng tab.
- `feed-*.js`: feed, media layout, post form/submit, like/comment.
- `home-*.js`: widgets, vàng, dashboard.
- `document-*.js`: upload tài liệu, extract text, danh sách tài liệu.
- `search-*.js`: AI chat và autocomplete tài liệu.
- `notifications-*.js`: inbox, badge, swipe actions.
- `profile.js`: profile, avatar, theme, preferences.
- `utils*.js`: API wrapper, formatters, dialogs.

## Lưu Ý Backend

Backend `code.gs` không có trong repo. Nếu thay đổi payload/response frontend, phải cập nhật tài liệu ở `docs/implementation/04-backend-sync.md` và đồng bộ với Google Apps Script trước khi deploy.

