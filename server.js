require("dotenv").config();

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const sharp = require("sharp");
const { PDFDocument, rgb } = require("pdf-lib");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "mprint.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    layout_json TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT UNIQUE NOT NULL,
    customer_name TEXT,
    contact TEXT,
    service_id TEXT NOT NULL,
    service_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total REAL NOT NULL,
    notes TEXT,
    file_name TEXT,
    original_name TEXT,
    status TEXT NOT NULL DEFAULT 'New',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(service_id) REFERENCES services(id)
  );
`);

const catalog = [
  ["doc-text-bw-short", "Document Printing — Text Only", "B&W · Short", null],
  ["doc-text-bw-long", "Document Printing — Text Only", "B&W · Long", null],
  ["doc-text-partial-short", "Document Printing — Text Only", "Partially Colored · Short", null],
  ["doc-text-partial-long", "Document Printing — Text Only", "Partially Colored · Long", null],
  ["doc-text-full-short", "Document Printing — Text Only", "Fully Colored · Short", null],
  ["doc-text-full-long", "Document Printing — Text Only", "Fully Colored · Long", null],
  ["doc-picture-bw-short", "Document Printing — Text with Picture", "B&W · Short", null],
  ["doc-picture-bw-long", "Document Printing — Text with Picture", "B&W · Long", null],
  ["doc-picture-partial-short", "Document Printing — Text with Picture", "Partially Colored · Short", null],
  ["doc-picture-partial-long", "Document Printing — Text with Picture", "Partially Colored · Long", null],
  ["doc-picture-full-short", "Document Printing — Text with Picture", "Fully Colored · Short", null],
  ["doc-picture-full-long", "Document Printing — Text with Picture", "Fully Colored · Long", null],
  ["picture-bw-short", "Document Printing — Picture Only", "B&W · Short", null],
  ["picture-bw-long", "Document Printing — Picture Only", "B&W · Long", null],
  ["picture-partial-short", "Document Printing — Picture Only", "Partially Colored · Short", null],
  ["picture-partial-long", "Document Printing — Picture Only", "Partially Colored · Long", null],
  ["picture-full-short", "Document Printing — Picture Only", "Fully Colored · Short", null],
  ["picture-full-long", "Document Printing — Picture Only", "Fully Colored · Long", null],
  ["copy-bw-short", "Photocopy / Xerox", "B&W · Short", null],
  ["copy-bw-long", "Photocopy / Xerox", "B&W · Long", null],
  ["copy-partial-short", "Photocopy / Xerox", "Partially Colored · Short", null],
  ["copy-partial-long", "Photocopy / Xerox", "Partially Colored · Long", null],
  ["copy-full-short", "Photocopy / Xerox", "Fully Colored · Short", null],
  ["copy-full-long", "Photocopy / Xerox", "Fully Colored · Long", null],
  ["scan-partial-short", "Scan", "Partially Colored · Short", null],
  ["scan-partial-long", "Scan", "Partially Colored · Long", null],
  ["scan-full-short", "Scan", "Fully Colored · Short", null],
  ["scan-full-long", "Scan", "Fully Colored · Long", null],
  ["lam-2r", "Lamination", "2R / Wallet Size", null],
  ["lam-3r", "Lamination", "3R Size", null],
  ["lam-4r", "Lamination", "4R Size", null],
  ["lam-5r", "Lamination", "5R Size", null],
  ["lam-6r", "Lamination", "6R Size", null],
  ["lam-a4", "Lamination", "A4 Size", null],
  ["lam-a5", "Lamination", "A5 Size", null],
  ["lam-nametag", "Lamination", "Nametag", null],
  ["photo-1x1", "Photo Printing", "1×1 ID Photo", [{ width: 1, height: 1, count: 1 }]],
  ["photo-2x2", "Photo Printing", "2×2 ID Photo", [{ width: 2, height: 2, count: 1 }]],
  ["photo-passport", "Photo Printing", "Passport Size", [{ width: 1.38, height: 1.77, count: 1 }]],
  ["photo-2r", "Photo Printing", "2R / Wallet Size", [{ width: 2.5, height: 3.5, count: 1 }]],
  ["photo-3r", "Photo Printing", "3R Size", [{ width: 3.5, height: 5, count: 1 }]],
  ["photo-4r", "Photo Printing", "4R Size", [{ width: 4, height: 6, count: 1 }]],
  ["photo-5r", "Photo Printing", "5R Size", [{ width: 5, height: 7, count: 1 }]],
  ["photo-a4", "Photo Printing", "A4 Size", [{ width: 8.0, height: 11.3, count: 1 }]],
  ["rush-a", "Rush ID Packages", "SET A: 2×2 (2pcs), 1×1 (4pcs)", [{ width: 2, height: 2, count: 2 }, { width: 1, height: 1, count: 4 }]],
  ["rush-b", "Rush ID Packages", "SET B: 1×1 (6pcs)", [{ width: 1, height: 1, count: 6 }]],
  ["rush-c", "Rush ID Packages", "SET C: 2×2 (6pcs)", [{ width: 2, height: 2, count: 6 }]],
  ["rush-d", "Rush ID Packages", "SET D: Passport (4pcs), 1×1 (3pcs)", [{ width: 1.38, height: 1.77, count: 4 }, { width: 1, height: 1, count: 3 }]],
  ["instax-mini", "Instax — Polaroid Inspired", "Mini (10pcs)", [{ width: 2.13, height: 3.39, count: 10 }]],
  ["instax-square", "Instax — Polaroid Inspired", "Square (8pcs)", [{ width: 2.83, height: 3.39, count: 8 }]],
  ["instax-wide", "Instax — Polaroid Inspired", "Wide (5pcs)", [{ width: 4.25, height: 3.39, count: 5 }]],
  ["sticker-a4", "Sticker Printing", "Print Only (A4)", [{ width: 8.0, height: 11.3, count: 1 }]]
];

const insertService = db.prepare(`
  INSERT OR IGNORE INTO services (id, category, name, layout_json, sort_order)
  VALUES (?, ?, ?, ?, ?)
`);
catalog.forEach((item, index) =>
  insertService.run(item[0], item[1], item[2], item[3] ? JSON.stringify(item[3]) : null, index)
);

const adminCount = db.prepare("SELECT COUNT(*) AS count FROM admins").get().count;
if (!adminCount) {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "mprint123";
  db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)")
    .run(username, bcrypt.hashSync(password, 12));
  console.log(`Initial admin created: ${username}`);
  if (!process.env.ADMIN_PASSWORD) console.log("Change the default password using ADMIN_PASSWORD in .env before first run.");
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    cb(allowed.includes(file.mimetype) ? null : new Error("Only JPG, PNG, and WebP images are allowed."), allowed.includes(file.mimetype));
  }
});

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: "Please log in." });
  next();
}

app.get("/api/services", (_req, res) => {
  const rows = db.prepare("SELECT * FROM services WHERE active = 1 ORDER BY sort_order").all();
  res.json(rows.map(({ layout_json, ...row }) => ({ ...row, hasLayout: Boolean(layout_json) })));
});

app.post("/api/orders", upload.single("image"), (req, res) => {
  try {
    const service = db.prepare("SELECT * FROM services WHERE id = ? AND active = 1").get(req.body.serviceId);
    if (!service) throw new Error("Please select a valid service.");
    const quantity = Number.parseInt(req.body.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) throw new Error("Quantity must be from 1 to 500.");
    if (service.layout_json && !req.file) throw new Error("An image is required for this print layout.");

    const reference = `MP-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomInt(1000, 9999)}`;
    const total = service.price * quantity;
    const result = db.prepare(`
      INSERT INTO orders
      (reference, customer_name, contact, service_id, service_name, quantity, unit_price, total, notes, file_name, original_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reference,
      String(req.body.customerName || "").trim().slice(0, 100),
      String(req.body.contact || "").trim().slice(0, 100),
      service.id,
      `${service.category} — ${service.name}`,
      quantity,
      service.price,
      total,
      String(req.body.notes || "").trim().slice(0, 500),
      req.file?.filename || null,
      req.file?.originalname || null
    );
    res.status(201).json({
      id: result.lastInsertRowid,
      reference,
      total,
      hasLayout: Boolean(service.layout_json)
    });
  } catch (error) {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/admin/login", (req, res) => {
  const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(String(req.body.username || "").trim());
  if (!admin || !bcrypt.compareSync(String(req.body.password || ""), admin.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password." });
  }
  req.session.adminId = admin.id;
  req.session.username = admin.username;
  res.json({ username: admin.username });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/session", (req, res) => {
  res.json({ authenticated: Boolean(req.session.adminId), username: req.session.username || null });
});

app.get("/api/admin/dashboard", requireAdmin, (_req, res) => {
  const summary = db.prepare(`
    SELECT COUNT(*) AS totalOrders,
      COALESCE(SUM(quantity), 0) AS totalItems,
      COALESCE(SUM(total), 0) AS revenue,
      SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) AS newOrders
    FROM orders
  `).get();
  const orders = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 500").all();
  const services = db.prepare("SELECT * FROM services ORDER BY sort_order").all()
    .map(({ layout_json, ...service }) => ({ ...service, hasLayout: Boolean(layout_json) }));
  res.json({ summary, orders, services });
});

app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const allowed = ["New", "Processing", "Ready", "Completed", "Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid status." });
  const result = db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(req.body.status, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Order not found." });
  res.json({ ok: true });
});

app.patch("/api/admin/services/:id", requireAdmin, (req, res) => {
  const price = Number(req.body.price);
  if (!Number.isFinite(price) || price < 0 || price > 100000) return res.status(400).json({ error: "Invalid price." });
  const result = db.prepare("UPDATE services SET price = ? WHERE id = ?").run(price, req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Service not found." });
  res.json({ ok: true });
});

app.get("/api/admin/orders/:id/image", requireAdmin, (req, res) => {
  const order = db.prepare("SELECT file_name, original_name FROM orders WHERE id = ?").get(req.params.id);
  if (!order?.file_name) return res.status(404).send("No image attached.");
  res.download(path.join(UPLOAD_DIR, order.file_name), order.original_name);
});

app.get("/api/admin/orders/:id/layout.pdf", requireAdmin, async (req, res, next) => {
  try {
    const order = db.prepare(`
      SELECT o.*, s.layout_json FROM orders o JOIN services s ON s.id = o.service_id WHERE o.id = ?
    `).get(req.params.id);
    if (!order?.file_name || !order.layout_json) return res.status(404).send("No printable layout is available.");
    const pdf = await createPhotoLayout(path.join(UPLOAD_DIR, order.file_name), JSON.parse(order.layout_json), order.quantity);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${order.reference}-layout.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (error) {
    next(error);
  }
});

async function createPhotoLayout(imagePath, layout, orderQuantity) {
  const pdf = await PDFDocument.create();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 8.5; // 3mm safe edge for A4 layouts
  const gap = 8.5; // 3mm cutting gap
  const imageBytes = await sharp(imagePath).rotate().jpeg({ quality: 95 }).toBuffer();
  const image = await pdf.embedJpg(imageBytes);
  const items = [];
  for (let set = 0; set < orderQuantity; set++) {
    layout.forEach(spec => {
      for (let i = 0; i < spec.count; i++) items.push({ width: spec.width * 72, height: spec.height * 72 });
    });
  }

  let page = pdf.addPage([pageWidth, pageHeight]);
  let x = margin;
  let yTop = pageHeight - margin;
  let rowHeight = 0;
  for (const item of items) {
    if (x + item.width > pageWidth - margin + 0.1) {
      x = margin;
      yTop -= rowHeight + gap;
      rowHeight = 0;
    }
    if (yTop - item.height < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      x = margin;
      yTop = pageHeight - margin;
      rowHeight = 0;
    }
    const sourceRatio = image.width / image.height;
    const targetRatio = item.width / item.height;
    let drawWidth;
    let drawHeight;
    if (sourceRatio > targetRatio) {
      drawHeight = item.height;
      drawWidth = drawHeight * sourceRatio;
    } else {
      drawWidth = item.width;
      drawHeight = drawWidth / sourceRatio;
    }
    const cropX = (drawWidth - item.width) / 2;
    const cropY = (drawHeight - item.height) / 2;
    page.pushOperators(require("pdf-lib").pushGraphicsState());
    const { moveTo, lineTo, closePath, clip, endPath, popGraphicsState } = require("pdf-lib");
    page.pushOperators(
      moveTo(x, yTop - item.height),
      lineTo(x + item.width, yTop - item.height),
      lineTo(x + item.width, yTop),
      lineTo(x, yTop),
      closePath(),
      clip(),
      endPath()
    );
    page.drawImage(image, {
      x: x - cropX,
      y: yTop - item.height - cropY,
      width: drawWidth,
      height: drawHeight
    });
    page.pushOperators(popGraphicsState());
    page.drawRectangle({
      x,
      y: yTop - item.height,
      width: item.width,
      height: item.height,
      borderColor: rgb(0.72, 0.72, 0.72),
      borderWidth: 0.4
    });
    x += item.width + gap;
    rowHeight = Math.max(rowHeight, item.height);
  }
  return pdf.save();
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ error: error.message || "Something went wrong." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MPrint Services: http://localhost:${PORT}`);
  const addresses = [];
  Object.values(os.networkInterfaces()).flat().forEach(info => {
    if (info?.family === "IPv4" && !info.internal) addresses.push(`http://${info.address}:${PORT}`);
  });
  addresses.forEach(address => console.log(`Local network: ${address}`));
});
