# Bước 4: Đồng Bộ Backend Hiện Tại

## Trạng Thái

Backend hiện tại phụ thuộc `code.gs` ngoài repo. Nếu chuyển sang PostgreSQL, xem kế hoạch riêng tại [Bước 7: Migration Database Sang PostgreSQL](./07-postgresql-migration.md).

## Mục Tiêu

Đảm bảo frontend và backend hiện tại dùng cùng payload, action và response shape. Mục tiêu ngắn hạn là ổn định Google Apps Script; mục tiêu dài hạn là có thể thay backend bằng API mới mà frontend ít phải đổi.

## Action Frontend Đang Gọi

- `get_feed`
- `feed_action`
- `upload_single_image`
- `comment_action`
- `get_notifications`
- `notification_action`
- `get_unread_count`
- `list_documents`
- `delete_document`
- `upload_file_chunk`
- `process_document_embeddings`
- `ai_chat`
- `get_critical_stats`
- `get_gold_data`
- `log_gold_transaction`
- `update_gold_transaction`
- `delete_gold_transaction`

## Response Shape Cần Thống Nhất

Các API nên trả tối thiểu:

```json
{
  "status": "success",
  "data": [],
  "message": "",
  "id": "",
  "time": ""
}
```

Với lỗi:

```json
{
  "status": "error",
  "message": "Reason"
}
```

## Checklist Google Apps Script

- Kiểm tra `API_URL` trong `js/utils.js`.
- Xác nhận Google Sheets có đủ sheet cần dùng.
- Xác nhận Drive folder cho ảnh/tài liệu.
- Kiểm tra quota upload file và Gemini embedding.
- Test từng action chính bằng frontend hoặc request thủ công.

## Ghi Chú Cho Migration PostgreSQL

- Nên giữ `sendToServer(payload)` ở frontend trong giai đoạn đầu.
- Backend mới có thể mô phỏng action contract hiện tại để giảm thay đổi UI.
- Khi API mới ổn định, mới cân nhắc chuyển dần sang REST endpoint.

