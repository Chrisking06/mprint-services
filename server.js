require("dotenv").config();

const path = require("path");
const os = require("os");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const sharp = require("sharp");
const { PDFDocument, rgb, pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath } = require("pdf-lib");
const { openDatabase } = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const ORDER_COLUMNS = `
  id, reference, customer_name, contact, service_id, service_name, quantity,
  unit_price, total, notes, file_name, original_name, file_mime, status, created_at
`;

const upload = multer({
  storage: multer.memoryStorage(),
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

function hasLayout(value) {
  return Boolean(value);
}

async function createPhotoLayout(imageInput, layout, orderQuantity) {
  const pdf = await PDFDocument.create();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 8.5;
  const gap = 8.5;
  const imageBytes = await sharp(imageInput).rotate().jpeg({ quality: 95 }).toBuffer();
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
    page.pushOperators(pushGraphicsState());
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

async function start() {
  const db = await openDatabase();

  if (isProduction) app.set("trust proxy", 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 8 * 60 * 60 * 1000
    }
  }));
  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.get("/api/services", async (_req, res, next) => {
    try {
      const rows = await db.all("SELECT * FROM services WHERE active = 1 ORDER BY sort_order");
      res.json(rows.map(({ layout_json, ...row }) => ({ ...row, hasLayout: hasLayout(layout_json) })));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/orders", upload.single("image"), async (req, res) => {
    try {
      const service = await db.get("SELECT * FROM services WHERE id = ? AND active = 1", [req.body.serviceId]);
      if (!service) throw new Error("Please select a valid service.");
      const quantity = Number.parseInt(req.body.quantity, 10);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) throw new Error("Quantity must be from 1 to 500.");
      if (service.layout_json && !req.file) throw new Error("An image is required for this print layout.");

      const reference = `MP-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomInt(1000, 9999)}`;
      const total = Number(service.price) * quantity;
      const result = await db.run(`
        INSERT INTO orders
        (reference, customer_name, contact, service_id, service_name, quantity, unit_price, total, notes, file_name, original_name, file_mime, file_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        reference,
        String(req.body.customerName || "").trim().slice(0, 100),
        String(req.body.contact || "").trim().slice(0, 100),
        service.id,
        `${service.category} — ${service.name}`,
        quantity,
        service.price,
        total,
        String(req.body.notes || "").trim().slice(0, 500),
        req.file ? `${Date.now()}-${crypto.randomUUID()}${path.extname(req.file.originalname).toLowerCase()}` : null,
        req.file?.originalname || null,
        req.file?.mimetype || null,
        req.file?.buffer || null
      ]);
      res.status(201).json({
        id: result.lastInsertId,
        reference,
        total,
        hasLayout: hasLayout(service.layout_json)
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/login", async (req, res) => {
    const admin = await db.get("SELECT * FROM admins WHERE username = ?", [String(req.body.username || "").trim()]);
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

  app.get("/api/admin/dashboard", requireAdmin, async (_req, res, next) => {
    try {
      const summary = await db.get(`
        SELECT COUNT(*) AS totalOrders,
          COALESCE(SUM(quantity), 0) AS totalItems,
          COALESCE(SUM(total), 0) AS revenue,
          SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) AS newOrders
        FROM orders
      `);
      const orders = await db.all(`SELECT ${ORDER_COLUMNS} FROM orders ORDER BY id DESC LIMIT 500`);
      const services = (await db.all("SELECT * FROM services ORDER BY sort_order"))
        .map(({ layout_json, ...service }) => ({ ...service, hasLayout: hasLayout(layout_json) }));
      res.json({
        summary: {
          ...summary,
          totalOrders: Number(summary.totalOrders || 0),
          totalItems: Number(summary.totalItems || 0),
          revenue: Number(summary.revenue || 0),
          newOrders: Number(summary.newOrders || 0)
        },
        orders,
        services
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
    const allowed = ["New", "Processing", "Ready", "Completed", "Cancelled"];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid status." });
    const result = await db.run("UPDATE orders SET status = ? WHERE id = ?", [req.body.status, req.params.id]);
    if (!result.changes) return res.status(404).json({ error: "Order not found." });
    res.json({ ok: true });
  });

  app.patch("/api/admin/services/:id", requireAdmin, async (req, res) => {
    const price = Number(req.body.price);
    if (!Number.isFinite(price) || price < 0 || price > 100000) return res.status(400).json({ error: "Invalid price." });
    const result = await db.run("UPDATE services SET price = ? WHERE id = ?", [price, req.params.id]);
    if (!result.changes) return res.status(404).json({ error: "Service not found." });
    res.json({ ok: true });
  });

  app.get("/api/admin/orders/:id/image", requireAdmin, async (req, res) => {
    const order = await db.get("SELECT original_name, file_name, file_mime, file_data FROM orders WHERE id = ?", [req.params.id]);
    const image = order?.file_data
      ? Buffer.from(order.file_data)
      : order?.file_name && require("fs").existsSync(path.join(__dirname, "data", "uploads", order.file_name))
        ? require("fs").readFileSync(path.join(__dirname, "data", "uploads", order.file_name))
        : null;
    if (!image) return res.status(404).send("No image attached.");
    res.setHeader("Content-Type", order.file_mime || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${order.original_name || "photo.jpg"}"`);
    res.send(image);
  });

  app.get("/api/admin/orders/:id/layout.pdf", requireAdmin, async (req, res, next) => {
    try {
      const order = await db.get(`
        SELECT o.reference, o.quantity, o.file_name, o.file_data, s.layout_json
        FROM orders o JOIN services s ON s.id = o.service_id WHERE o.id = ?
      `, [req.params.id]);
      const image = order?.file_data
        ? Buffer.from(order.file_data)
        : order?.file_name
          ? path.join(__dirname, "data", "uploads", order.file_name)
          : null;
      if (!image || !order.layout_json) return res.status(404).send("No printable layout is available.");
      const pdf = await createPhotoLayout(image, JSON.parse(order.layout_json), order.quantity);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${order.reference}-layout.pdf"`);
      res.send(Buffer.from(pdf));
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(400).json({ error: error.message || "Something went wrong." });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MPrint Services: http://localhost:${PORT}`);
    Object.values(os.networkInterfaces()).flat().forEach(info => {
      if (info?.family === "IPv4" && !info.internal) console.log(`Local network: http://${info.address}:${PORT}`);
    });
  });
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
