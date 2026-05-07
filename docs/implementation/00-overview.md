# Kế Hoạch Triển Khai LoveStory

Tài liệu này là mục lục triển khai. Mỗi bước có file riêng để dễ cập nhật trạng thái, checklist và ghi chú kỹ thuật.

## Thứ Tự Thực Hiện

1. [Dọn tài liệu và cấu trúc](./01-docs-and-structure.md)
2. [Ổn định frontend](./02-frontend-stabilization.md)
3. [Kiểm thử smoke test](./03-smoke-testing.md)
4. [Đồng bộ backend Google Apps Script](./04-backend-sync.md)
5. [Triển khai frontend](./05-frontend-deploy.md)
6. [Triển khai backend](./06-backend-deploy.md)
7. [Migration database sang PostgreSQL](./07-postgresql-migration.md)

## Mục Tiêu

- Tài liệu rõ ràng, đúng với cấu trúc code hiện tại.
- Frontend không còn lỗi syntax, lỗi encoding nghiêm trọng, hoặc render dữ liệu nguy hiểm.
- Các luồng chính hoạt động với backend thật.
- Frontend và backend thống nhất API contract.
- Quy trình deploy có thể lặp lại.
- Có phương án dài hạn để chuyển dữ liệu từ Google Sheets sang PostgreSQL.

## Definition Of Done

- Markdown chỉ nằm trong `docs/`.
- `node --check` pass cho toàn bộ `js/*.js`.
- Không còn lỗi console nghiêm trọng khi mở app.
- Các luồng chính đã smoke test.
- `index.html` đã bump query `?v=` cho file đổi.
- `API_URL` trỏ đúng backend API đang deploy.
- Nếu dùng PostgreSQL, frontend chỉ gọi backend API, không kết nối trực tiếp database.

