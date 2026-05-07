# Bước 5: Triển Khai Frontend

## Trạng Thái

Sẵn sàng sau khi smoke test pass.

## Mục Tiêu

Deploy SPA tĩnh lên hosting và đảm bảo người dùng không bị cache file cũ.

## Checklist Trước Deploy

- `node --check` pass.
- Smoke test local pass.
- `API_URL` đúng môi trường cần deploy.
- Đã bump `?v=` cho JS/CSS thay đổi trong `index.html`.
- Không còn file Markdown cũ ở root.

## Deploy

Có thể dùng một trong các hosting tĩnh:

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- Hosting/CDN tĩnh khác

## Kiểm Tra Sau Deploy

- Mở production URL trên desktop.
- Mở production URL trên mobile.
- Kiểm tra tab navigation.
- Kiểm tra console.
- Kiểm tra request đến Google Apps Script.
- Kiểm tra asset JS/CSS nhận đúng version mới.

