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