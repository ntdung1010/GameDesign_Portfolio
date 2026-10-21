# Báo lượt xem portfolio về Telegram

Mỗi lần có người mở portfolio, bạn nhận **một tin nhắn Telegram**. Tin nhắn đó tự cập nhật khi người xem cuộn trang, chuyển tab hay bấm link:

```
🔁 Returning visitor · 14:32 · 21/10/2026
📱 SM-S918B · Android 14 · LinkedIn app
🖥 412×915 · vi-VN · Asia/Ho_Chi_Minh
🔗 From linkedin.com
🗓 Visit #3, last time 2 days ago
📄 Opened Home

⏱ Stayed 2 min · scrolled 85%
🧭 Home → Portfolio → Play the map
🖱 Chaos Drink Sort (Google Play), LinkedIn
```

Cách hoạt động: web gửi dữ liệu tới một Google Apps Script (miễn phí, chạy trên tài khoản Google của bạn), và script đó gửi tin qua bot Telegram. Mã bot (token) chỉ nằm trong script, không bao giờ có trên web.

---

## Bước 1: Tạo bot Telegram (2 phút)

1. Trong Telegram, mở **@BotFather** (có dấu tích xanh).
2. Gửi `/newbot`, đặt tên (ví dụ `Dung Portfolio Alerts`), rồi đặt username kết thúc bằng `bot` (ví dụ `dungnt_portfolio_bot`).
3. BotFather gửi lại một **token** dạng `1234567890:AAH...`. Hãy giữ kín token này, **không gửi cho ai, kể cả Claude**.
4. Mở bot vừa tạo, bấm **Start** và gửi một tin bất kỳ, ví dụ `hi`. Bước này cần làm để script tìm được chat của bạn.

## Bước 2: Tạo Apps Script (3 phút)

1. Vào https://script.google.com và bấm **New project**. Đặt tên dự án, ví dụ `Portfolio alerts`.
2. Xoá hết nội dung có sẵn trong `Code.gs`, rồi dán toàn bộ file `visit-alerts.gs` vào.
3. Bấm **Save** (biểu tượng đĩa mềm).
4. Mở **Project Settings** (bánh răng bên trái), kéo xuống **Script properties** và bấm **Add script property**:
   - Property: `TELEGRAM_TOKEN`
   - Value: token ở Bước 1
   - Bấm **Save script properties**.
5. Quay lại **Editor**. Ở thanh trên cùng, chọn hàm **`setup`** rồi bấm **Run**.
   - Google sẽ xin quyền: bấm **Review permissions**, chọn tài khoản của bạn.
   - Nếu hiện "Google hasn't verified this app", bấm **Advanced**, rồi **Go to Portfolio alerts (unsafe)**. Đây là script của chính bạn nên an toàn.
   - Bấm **Allow**.
   - Telegram sẽ nhận tin: *✅ Portfolio visit alerts are connected.*

## Bước 3: Deploy thành Web app (1 phút)

1. Bấm **Deploy**, chọn **New deployment**, bấm bánh răng cạnh "Select type" và chọn **Web app**.
2. Cài đặt:
   - **Execute as:** Me
   - **Who has access:** **Anyone**. Phải chọn đúng "Anyone", không chọn "Anyone with Google account".
3. Bấm **Deploy** và copy **Web app URL** (dạng `https://script.google.com/macros/s/AKfy.../exec`).

## Bước 4: Gắn vào web

Gửi URL `/exec` đó cho Claude, hoặc tự dán vào `portfolio.html` trong phần `PROFILE`:

```js
visitLog: "https://script.google.com/macros/s/AKfy.../exec",
```

Sau đó deploy web như bình thường.

---

## Không đếm lượt của chính bạn

Trên mỗi trình duyệt hay điện thoại bạn dùng, mở web **một lần** với `?notrack` ở cuối, ví dụ:

`https://<tên-site>.netlify.app/?notrack`

Trình duyệt đó sẽ không bị đếm nữa. Muốn bật lại thì mở với `?track`.

## Biết người xem đến từ đâu

Khi gửi link cho ai, thêm `?utm_source=...` để tin nhắn ghi rõ nguồn, ví dụ:

- Link trong CV: `https://<tên-site>.netlify.app/?utm_source=cv`
- Link gửi riêng một công ty: `https://<tên-site>.netlify.app/?utm_source=vng`

## Lưu ý

- **Không biết tên người xem**: web chỉ biết loại máy, trình duyệt, màn hình, ngôn ngữ, múi giờ (thay cho vị trí), trang đã đến và các link đã bấm. Không lưu IP. Riêng tên máy cụ thể (ví dụ `SM-S918B`) chỉ hiện khi người xem dùng Chrome hoặc Edge trên Android hay Windows.
- **Không chạy trên link Claude và localhost**, chỉ chạy trên web thật.
- **Chống spam**: URL Web app là công khai, nên script giới hạn tối đa 40 tin mới mỗi giờ.
- **Sửa script**: nếu sửa `visit-alerts.gs`, vào **Deploy → Manage deployments → Edit (bút chì) → Version: New version → Deploy**. Làm vậy thì URL được giữ nguyên.
- **Tắt hẳn**: để `visitLog: ""` trong `portfolio.html`, hoặc xoá deployment trong Apps Script.
