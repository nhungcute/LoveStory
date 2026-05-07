# Bước 2: Ổn Định Frontend

## Trạng Thái

Cần làm tiếp.

## Mục Tiêu

Ổn định SPA sau khi tách module, giảm rủi ro XSS, lỗi cache, lỗi optimistic UI và lỗi encoding.

## Checklist

- Sửa toàn bộ chuỗi tiếng Việt bị lỗi encoding trong `index.html`, `js/`, `css/`.
- Rà soát các nơi còn dùng `innerHTML` với dữ liệu từ user hoặc backend.
- Chuẩn hóa helper render an toàn cho:
  - feed content
  - comment
  - notification
  - document list
  - gold history
  - autocomplete
- Kiểm tra lại optimistic UI:
  - like
  - comment
  - edit/delete comment
  - notification read/delete
  - document delete
  - post create/edit/delete
- Khi đổi file JS/CSS, cập nhật query `?v=` trong `index.html`.

## Kiểm Tra Bắt Buộc

```powershell
Get-ChildItem js -Filter *.js | ForEach-Object { node --check $_.FullName }
```

