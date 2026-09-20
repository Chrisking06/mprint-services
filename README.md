# MPrint Services

Local-network ordering, admin tracking, pricing, image upload, and automatic A4 photo layout system.

## Setup

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set a strong admin password and session secret.
3. Run:
  ```powershell
   npm install
   npm start
  ```
4. Open `http://localhost:3000` on the shop computer.
5. Open the **Local network** URL printed in the terminal (for example, `http://192.168.1.20:3000`) on another device connected to the same Wi-Fi/LAN.

Allow Node.js through Windows Defender Firewall for **Private networks** if Windows asks.

## Live website (iPad, no PC)

The shop can run on the internet so Safari on iPhone/iPad can open it.

1. Create a free MySQL database at [TiDB Cloud](https://tidbcloud.com/) (Starter). Copy the connection string. It looks like `mysql://...`.
2. Open this deploy link and sign in with GitHub:

   https://render.com/deploy?repo=https://github.com/Chrisking06/mprint-services

3. Paste:
   - `ADMIN_PASSWORD` — a strong password
   - `DATABASE_URL` — the TiDB connection string
4. After deploy, Render shows a URL such as `https://mprint-services.onrender.com`.
5. Customer page: that URL. Admin: `/admin.html`.

The free Render web service sleeps after idle time. The first open after sleep can take about a minute. Without `DATABASE_URL`, orders are not kept after restart.

## First login

- Admin page: `http://localhost:3000/admin.html`
- Default username: `admin`
- Default password: `mprint123`

The defaults are only used when `.env` is absent. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` before the first start. Once the database is created, changing those environment variables does not replace the existing admin.

## Printing a layout

Open an order in the admin dashboard and click **Print PDF**. The generated PDF uses exact physical dimensions on A4 paper. In the print dialog:

- Choose the Epson L5390.
- Set paper to A4.
- Use **Actual size / 100%**.
- Turn off “Fit to page”.

Prices start at zero because no price amounts were provided. Update them under **Services & prices** in the admin page.

## Suggested prices

On a new database, the app adds mid-market Philippine suggested prices. Existing
non-zero prices edited in the admin panel are preserved. The starting rates were
benchmarked against 2025–2026 listings from Darling Prints/PakiPrint, ZoomOut
Studio, MS Prints, CRXTINA Printing, and Digibili's Philippine lamination guide.
Actual rates vary by location, paper brand, ink, editing work, and finish.

## Branding

The logo lives in `public/img/`:

- `logo.png` — original artwork with white background.
- `logo-full.png` — transparent full logo with wordmark (login page, hero card).
- `icon.png` — transparent monogram only (header, sidebar, browser tab icon).

If you replace `logo.png` with new artwork, regenerate the variants:

```powershell
node tools/make-logo-assets.js
```

## Clearing test orders

```powershell
node tools/reset-orders.js
```

This deletes every order and its uploaded image. Prices and the admin account are kept.