# Bước 7: Migration Database Sang PostgreSQL

## Trạng Thái

Đề xuất kiến trúc. Chưa triển khai.

## Kết Luận Ngắn

Không nên để GitHub Pages hoặc trình duyệt kết nối trực tiếp PostgreSQL. GitHub Pages chỉ host web tĩnh, không có server runtime để giữ `DATABASE_URL` bí mật. Nếu đặt user/password PostgreSQL trong JavaScript thì ai mở DevTools cũng lấy được.

Phương án đúng:

```text
GitHub Pages SPA
  -> HTTPS API backend
  -> PostgreSQL
```

Nếu muốn đặt PostgreSQL trên máy trạm và public ra internet, vẫn nên public API backend, không public cổng PostgreSQL `5432` trực tiếp.

## Mục Tiêu Migration

- Thay Google Sheets bằng PostgreSQL cho dữ liệu nghiệp vụ.
- Giữ frontend gọi một API thống nhất qua `sendToServer(payload)`.
- Giảm phụ thuộc Google Apps Script quota.
- Có schema rõ ràng, migration versioned, backup/restore được.
- Chuẩn bị khả năng mở rộng: search, pagination, indexes, audit log.

## Đánh Giá Thay Đổi

### Phạm Vi Ảnh Hưởng

- Frontend:
  - Có thể giữ phần lớn UI hiện tại.
  - `js/utils.js` cần đổi `API_URL` sang backend API mới.
  - Có thể cần chuẩn hóa payload/response nếu backend mới không mô phỏng GAS.
- Backend:
  - Cần viết API mới thay Google Apps Script.
  - Cần auth/rate limit/CORS/logging.
  - Cần xử lý upload ảnh/tài liệu sang object storage hoặc local storage.
- Database:
  - Thiết kế schema PostgreSQL.
  - Import dữ liệu từ Google Sheets.
  - Tạo indexes, constraints, backup.
- Deploy:
  - GitHub Pages chỉ host frontend.
  - API backend phải host riêng: máy trạm public, VPS, Render, Railway, Fly.io, Cloud Run, hoặc server nội bộ qua tunnel.

### Rủi Ro Chính

- Public database trực tiếp gây rủi ro lộ dữ liệu và brute force.
- Máy trạm có thể mất điện, đổi IP, sleep, hoặc bị router/firewall chặn.
- Upload media nếu lưu local trên máy trạm sẽ khó backup và scale.
- CORS và HTTPS bắt buộc nếu frontend chạy trên GitHub Pages.
- Migration dữ liệu từ Google Sheets cần mapping cẩn thận vì dữ liệu hiện có thể không chuẩn kiểu.

## Kiến Trúc Khuyến Nghị

### Phương Án A: Managed PostgreSQL Và Hosted API

Khuyến nghị cho production.

```text
GitHub Pages
  -> API backend on Render/Railway/Fly/Cloud Run/VPS
  -> Managed PostgreSQL
  -> S3/R2/Cloudinary/Google Drive for media
```

Ưu điểm:

- Ổn định hơn máy trạm.
- Có HTTPS, domain, logs, restart policy.
- Dễ backup database.
- Không cần mở port nhà/máy cá nhân.

Nhược điểm:

- Có chi phí.
- Cần học thêm deploy backend.

### Phương Án B: PostgreSQL Và API Trên Máy Trạm

Chỉ nên dùng cho dev/staging hoặc demo nhỏ.

```text
GitHub Pages
  -> Public HTTPS tunnel/domain
  -> API backend on workstation
  -> PostgreSQL on localhost/private network
```

Ưu điểm:

- Chủ động, rẻ.
- Dễ debug local.

Nhược điểm:

- Phụ thuộc máy luôn bật.
- IP mạng nhà có thể thay đổi.
- Cần cấu hình HTTPS/tunnel/firewall.
- Không nên mở cổng PostgreSQL trực tiếp.

## Thiết Kế Backend API Mới

Nên viết backend Node.js đơn giản để thay GAS, ví dụ:

```text
api/
  src/
    server.js
    db.js
    routes/
      feed.js
      comments.js
      notifications.js
      documents.js
      profile.js
      gold.js
      ai.js
    services/
      storage.js
      gemini.js
      telegram.js
  migrations/
  package.json
  .env
```

API có thể giữ contract hiện tại:

```json
{
  "action": "get_feed",
  "username": "Guest",
  "page": 1,
  "limit": 20
}
```

Hoặc chuyển dần sang REST:

```text
GET /api/feed?page=1&limit=20
POST /api/feed
POST /api/comments
GET /api/notifications
```

Khuyến nghị giai đoạn đầu: giữ `action` để frontend ít thay đổi. Sau khi ổn định, mới refactor sang REST.

## Schema PostgreSQL Đề Xuất

Tối thiểu:

```sql
create table profiles (
  username text primary key,
  fullname text,
  avatar_url text,
  theme text default 'green',
  widget_pregnancy boolean default true,
  widget_kick boolean default true,
  widget_gold boolean default true,
  dev_tools boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  username text references profiles(username),
  fullname text,
  avatar_url text,
  content text,
  media jsonb default '[]'::jsonb,
  layout text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table post_likes (
  post_id uuid references posts(id) on delete cascade,
  username text references profiles(username),
  created_at timestamptz default now(),
  primary key (post_id, username)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  username text references profiles(username),
  fullname text,
  avatar_url text,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  username text,
  actor_username text,
  action text,
  title text,
  message text,
  post_id uuid,
  is_read boolean default false,
  created_at timestamptz default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  username text,
  name text not null,
  mime_type text,
  size_bytes bigint,
  storage_url text,
  extracted_text text,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding jsonb,
  created_at timestamptz default now()
);

create table gold_transactions (
  id uuid primary key default gen_random_uuid(),
  username text,
  date date not null,
  type text check (type in ('buy', 'sell')),
  quantity_chi numeric(12, 3) not null,
  price_per_chi numeric(18, 2) not null,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Indexes cần có:

```sql
create index idx_posts_created_at on posts(created_at desc) where deleted_at is null;
create index idx_comments_post_id_created_at on comments(post_id, created_at);
create index idx_notifications_username_created_at on notifications(username, created_at desc);
create index idx_documents_username_created_at on documents(username, created_at desc);
create index idx_gold_transactions_username_date on gold_transactions(username, date desc);
```

## Setup PostgreSQL Trên Máy Trạm

### 1. Cài PostgreSQL

Cách đơn giản trên Windows:

- Cài PostgreSQL từ installer chính thức.
- Ghi lại password user `postgres`.
- Mở `pgAdmin` hoặc dùng `psql`.

Hoặc dùng Docker:

```powershell
docker run --name lovestory-postgres `
  -e POSTGRES_USER=lovestory `
  -e POSTGRES_PASSWORD=change_me_strong_password `
  -e POSTGRES_DB=lovestory `
  -p 127.0.0.1:5432:5432 `
  -v lovestory_pgdata:/var/lib/postgresql/data `
  -d postgres:16
```

Lưu ý: bind `127.0.0.1:5432` để database chỉ nghe local.

### 2. Tạo `.env` Cho Backend API

```text
DATABASE_URL=postgres://lovestory:change_me_strong_password@127.0.0.1:5432/lovestory
PORT=3000
CORS_ORIGIN=https://your-github-username.github.io
```

### 3. Chạy Backend API Local

Ví dụ Node.js:

```powershell
cd api
npm install
npm run migrate
npm run dev
```

API local:

```text
http://localhost:3000
```

Frontend local trỏ:

```js
const API_URL = "http://localhost:3000/api";
```

## Public Máy Trạm An Toàn

### Nguyên Tắc Chính

Nếu PostgreSQL chạy trên máy trạm, chỉ nên để PostgreSQL nghe nội bộ, ví dụ `127.0.0.1:5432` hoặc mạng LAN riêng. Phần public ra internet phải là backend API qua HTTPS.

Luồng đúng:

```text
User browser
  -> GitHub Pages frontend
  -> HTTPS request to public API URL
  -> tunnel/domain routes request to workstation
  -> backend API on localhost:3000
  -> PostgreSQL on localhost:5432
```

Luồng không nên dùng:

```text
User browser
  -> GitHub Pages frontend
  -> PostgreSQL public IP:5432
```

Lý do:

- Browser không nói chuyện trực tiếp với PostgreSQL protocol theo cách an toàn/thực tế như gọi REST API.
- Nếu nhét `DATABASE_URL`, user/password vào JavaScript thì ai cũng xem được.
- PostgreSQL không nên nhận request trực tiếp từ internet cho app public.
- Backend API là nơi kiểm tra input, auth, rate limit, CORS, log lỗi và che giấu database credentials.

### Cấu Hình Đề Xuất Trên Máy Trạm

PostgreSQL:

```text
Host: 127.0.0.1
Port: 5432
Public: no
```

Backend API:

```text
Host: 127.0.0.1
Port: 3000
Public: via HTTPS tunnel/domain only
```

Frontend GitHub Pages:

```text
API_URL=https://api-your-domain.example.com/api
```

### Phương Án 1: Cloudflare Tunnel

Phù hợp nếu có domain dùng Cloudflare.

Mô hình:

```text
GitHub Pages
  -> https://api.example.com
  -> Cloudflare Tunnel
  -> http://localhost:3000
  -> PostgreSQL localhost:5432
```

Ưu điểm:

- Có HTTPS sẵn.
- Không cần mở port router.
- Không cần IP tĩnh.
- Có thể gắn domain đẹp như `api.example.com`.

Checklist:

1. Backend API chạy local ở `http://localhost:3000`.
2. Cài `cloudflared` trên máy trạm.
3. Tạo tunnel trỏ `api.example.com` về `http://localhost:3000`.
4. Cấu hình backend CORS chỉ cho GitHub Pages domain.
5. Đổi `API_URL` trong `js/utils.js` sang `https://api.example.com/api`.
6. Đảm bảo PostgreSQL vẫn chỉ bind `127.0.0.1`.

### Phương Án 2: ngrok

Phù hợp cho demo/dev nhanh.

Mô hình:

```text
GitHub Pages
  -> https://random-or-static.ngrok.app
  -> ngrok tunnel
  -> http://localhost:3000
  -> PostgreSQL localhost:5432
```

Ưu điểm:

- Setup nhanh.
- Dễ test từ internet.

Nhược điểm:

- URL miễn phí có thể thay đổi.
- Không phù hợp production lâu dài nếu không dùng static domain.

Checklist:

1. Chạy backend API local ở `localhost:3000`.
2. Chạy tunnel:

   ```powershell
   ngrok http 3000
   ```

3. Copy HTTPS forwarding URL.
4. Set `API_URL` sang URL đó.
5. Cấu hình CORS đúng GitHub Pages domain.

### Phương Án 3: VPS Reverse Proxy Về Máy Trạm

Phù hợp nếu muốn kiểm soát nhiều hơn.

Mô hình:

```text
GitHub Pages
  -> https://api.example.com
  -> VPS Nginx/Caddy
  -> WireGuard/Tailscale private link
  -> workstation localhost:3000
  -> PostgreSQL localhost:5432
```

Ưu điểm:

- Chủ động domain, TLS, logs, routing.
- Có thể thay máy backend mà không đổi frontend.

Nhược điểm:

- Setup phức tạp hơn.
- Cần vận hành VPS.

### Vì Sao Không Mở Port PostgreSQL 5432

Không nên làm:

```text
Router public IP:5432
  -> workstation PostgreSQL:5432
```

Rủi ro cụ thể:

- Credential bị brute force liên tục từ internet.
- Nếu user database có quyền rộng, mất dữ liệu rất nhanh khi lộ password.
- Khó audit request ở tầng nghiệp vụ vì request đi thẳng vào database.
- Không có CORS/auth app-level/rate limit như HTTP API.
- Khó rotate secret vì secret đã nằm trong client hoặc nhiều nơi.
- Nhiều mạng gia đình đổi IP, NAT hoặc CGNAT làm kết nối không ổn định.

Nếu bắt buộc mở cho admin/dev:

- Chỉ allowlist IP cố định của chính bạn.
- Bật SSL cho PostgreSQL.
- Dùng password mạnh và user quyền thấp.
- Tắt quyền schema nguy hiểm.
- Không dùng endpoint này cho frontend.
- Tốt hơn vẫn là dùng VPN/Tailscale thay vì public `5432`.

### Checklist Bảo Mật Tối Thiểu

- PostgreSQL bind `127.0.0.1`, không bind `0.0.0.0`.
- Không forward router port `5432`.
- Backend API là service duy nhất được public.
- API public bắt buộc HTTPS.
- Backend CORS chỉ cho phép GitHub Pages production URL.
- Secret nằm trong `.env` backend, không nằm trong `js/`.
- Có log request/error ở backend.
- Có backup database định kỳ.
- Máy trạm tắt sleep khi cần demo/public.

## Kết Nối Với Web Host GitHub Pages

GitHub Pages chỉ cần host frontend tĩnh. Flow đúng:

```text
GitHub Pages URL
  -> fetch(API_URL)
  -> API backend public HTTPS
  -> PostgreSQL private/local
```

Việc cần làm:

1. Deploy frontend lên GitHub Pages.
2. Public API backend qua HTTPS.
3. Set `API_URL` trong `js/utils.js` sang API public.
4. Cấu hình CORS backend chỉ cho phép GitHub Pages domain.
5. Bump query version cho `js/utils.js` trong `index.html`.
6. Smoke test production.

## Kế Hoạch Migration Theo Giai Đoạn

### Giai Đoạn 1: Chuẩn Bị

- Chốt schema PostgreSQL.
- Viết backend API skeleton.
- Giữ frontend contract `sendToServer(payload)` để giảm thay đổi.
- Thiết lập local PostgreSQL.
- Tạo migration SQL.

### Giai Đoạn 2: Chạy Song Song

- Frontend dev trỏ vào API mới.
- API mới đọc/ghi PostgreSQL.
- Google Apps Script vẫn giữ production.
- Export dữ liệu Google Sheets để import thử.

### Giai Đoạn 3: Import Dữ Liệu

- Export từng sheet sang CSV/JSON.
- Clean dữ liệu:
  - ID
  - timestamp
  - media JSON
  - username rỗng
  - duplicate likes/comments
- Import vào PostgreSQL.
- So sánh số lượng record.

### Giai Đoạn 4: Cutover

- Backup Google Sheets.
- Freeze ghi dữ liệu trong thời gian ngắn.
- Import dữ liệu lần cuối.
- Đổi `API_URL` sang API mới.
- Smoke test production.

### Giai Đoạn 5: Hậu Migration

- Theo dõi logs API.
- Theo dõi query chậm.
- Bổ sung indexes.
- Thiết lập backup tự động.
- Xóa hoặc đóng băng backend GAS cũ sau khi ổn định.

## Checklist Quyết Định

Trước khi triển khai thật, cần chốt:

- PostgreSQL chạy ở đâu: máy trạm, VPS, hay managed database?
- Backend API dùng Node.js, Deno, Python/FastAPI, hay nền tảng khác?
- Media lưu ở đâu: Google Drive, local disk, S3/R2, Cloudinary?
- Có cần auth thật hay tiếp tục username/localStorage?
- Có cần migrate toàn bộ dữ liệu cũ hay chỉ bắt đầu database mới?
- SLA mong muốn: demo cá nhân hay production dùng hằng ngày?
