# Bước 6: Triển Khai Backend

## Trạng Thái

Cần thao tác trong Google Apps Script.

## Mục Tiêu

Deploy `code.gs` tương thích frontend hiện tại và cập nhật URL nếu cần.

## Checklist

1. Mở project Google Apps Script.
2. Cập nhật `code.gs` theo API contract hiện tại.
3. Cấu hình biến:
   - Drive folder ID
   - Gemini API keys
   - Telegram bot token/chat ID nếu dùng
4. Deploy Web App.
5. Copy Web App URL mới.
6. Nếu URL thay đổi, cập nhật `API_URL` trong `js/utils.js`.
7. Smoke test lại các luồng có gọi API.

## Lưu Ý

- Backend không nằm trong repo này, nên mọi thay đổi API contract cần ghi lại trong `04-backend-sync.md`.
- Sau khi đổi `API_URL`, nhớ bump version `js/utils.js` trong `index.html`.

