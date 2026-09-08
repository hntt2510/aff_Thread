# Threads Community Manager

Ứng dụng local để phát hiện trend, soạn nội dung thảo luận, duyệt/lên lịch Threads và theo dõi rule comment affiliate.

## Chạy

```powershell
cd D:\HOCTAP\latvat\crawlInsight\threadsCommunityManager
uv sync
uv run python main.py
```

Mở `http://127.0.0.1:8876`.

## Threads OAuth

Tool chỉ dùng OAuth chính thức của Meta/Threads để đăng bài và đọc dữ liệu account. Không nhập mật khẩu Threads, không nhận cookie trình duyệt, không lưu `sessionid` và không gọi private API.

1. Tạo Threads app trong Meta for Developers và thêm redirect URI HTTPS chính xác, ví dụ `https://threads-manager.local/api/v1/oauth/threads/callback`.
2. Đặt `THREADS_APP_ID`, `THREADS_APP_SECRET`, `THREADS_REDIRECT_URI` trước khi chạy. App ID/secret phải là của Threads app.
3. Cấu hình hostname HTTPS local (certificate tin cậy + reverse proxy) hoặc một HTTPS tunnel trong lúc phát triển. `localhost`/`127.0.0.1` không dùng trực tiếp làm OAuth redirect URI.
4. Trong tool, tạo hồ sơ account rồi bấm **Kết nối Threads qua Meta**. Bạn đăng nhập và chấp thuận quyền trên trang Meta; tool chỉ nhận authorization code, đổi lấy long-lived access token và tự làm mới token trước hạn.

Access token chỉ được lưu trong Windows Credential Manager. SQLite chỉ giữ mã tham chiếu, quyền và hạn token. Mặc định tool chỉ xin các quyền đọc hồ sơ, đăng bài, insights và replies; chỉ bật `THREADS_ENABLE_KEYWORD_SEARCH=true` khi app đã được Meta cấp quyền keyword search.

Các nguồn TikTok, Douyin, Bilibili chỉ hiện là đã kết nối sau khi có adapter và quyền API hợp lệ. Chức năng nhập trend/link thủ công luôn có sẵn.

# aff_Thread

