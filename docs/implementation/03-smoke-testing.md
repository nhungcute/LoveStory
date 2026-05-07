# Bước 3: Kiểm Thử Smoke Test

## Trạng Thái

Chưa thực hiện đầy đủ.

## Mục Tiêu

Xác nhận app chạy được các luồng chính trên trình duyệt thật trước khi deploy.

## Chạy Local

```powershell
python -m http.server 8080
```

Mở:

```text
http://localhost:8080
```

## Checklist Luồng Chính

- App mở không có lỗi console nghiêm trọng.
- Chuyển tab Home, Feed, Document.
- Tạo, sửa, xóa bài viết.
- Upload ảnh/video.
- Mở media viewer đúng ảnh/video được chọn.
- Like, comment, sửa comment, xóa comment.
- Mở profile, đổi theme, đổi avatar.
- Mở notification modal, mark read, delete.
- Upload tài liệu.
- Dùng autocomplete tài liệu trong AI chat.
- Mở widget vàng và lưu giao dịch.

## Khuyến Nghị

Thêm Playwright smoke test tối thiểu cho:

- app load
- tab navigation
- modal open/close
- không có lỗi console nghiêm trọng

