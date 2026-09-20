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
const { plan, paperChoices } = require("./layouts");

const INCH = 72;

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const ORDER_COLUMNS = `
  id, reference, customer_name, contact, service_id, service_name, quantity,
  unit_price, total, notes, file_name, original_name, file_mime, paper, sheets,
  status, created_at
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

function parseLayout(value) {
  if (!value) return null;
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function createPhotoLayout(imageInput, spec, paperId, units) {
  const layout = plan(spec, paperId, units);
  const pdf = await PDFDocument.create();
  const imageBytes = await sharp(imageInput).rotate().jpeg({ quality: 95 }).toBuffer();
  const image = await pdf.embedJpg(imageBytes);
  const pageWidth = layout.pageWidth * INCH;
  const pageHeight = layout.pageHeight * INCH;
  const margin = layout.margin * INCH;

  for (const sheet of layout.sheets) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    for (const slot of sheet) {
      const width = slot.width * INCH;
      const height = slot.height * INCH;
      const x = margin + slot.x * INCH;
      const yTop = pageHeight - margin - slot.top * INCH;

      const sourceRatio = image.width / image.height;
      const targetRatio = width / height;
      const drawHeight = sourceRatio > targetRatio ? height : width / sourceRatio;
      const drawWidth = sourceRatio > targetRatio ? height * sourceRatio : width;
      const cropX = (drawWidth - width) / 2;
      const cropY = (drawHeight - height) / 2;

      page.pushOperators(pushGraphicsState());
      page.pushOperators(
        moveTo(x, yTop - height),
        lineTo(x + width, yTop - height),
        lineTo(x + width, yTop),
        lineTo(x, yTop),
        closePath(),
        clip(),
        endPath()
      );
      page.drawImage(image, {
        x: x - cropX,
        y: yTop - height - cropY,
        width: drawWidth,
        height: drawHeight
      });
      page.pushOperators(popGraphicsState());
      page.drawRectangle({
        x,
        y: yTop - height,
        width,
        height,
        borderColor: rgb(0.72, 0.72, 0.72),
        borderWidth: 0.4
      });
    }
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
      res.json(rows.map(({ layout_json, ...row }) => {
        const spec = parseLayout(layout_json);
        return {
          ...row,
          hasLayout: Boolean(spec),
          unit: spec?.unit || "pcs",
          papers: spec ? paperChoices(spec) : [],
          paper: spec?.paper || null
        };
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/layout-estimate", async (req, res, next) => {
    try {
      const service = await db.get("SELECT * FROM services WHERE id = ? AND active = 1", [req.query.serviceId]);
      const spec = parseLayout(service?.layout_json);
      if (!spec) return res.json({ hasLayout: false });
      const quantity = Math.min(Math.max(Number.parseInt(req.query.quantity, 10) || 1, 1), 500);
      const layout = plan(spec, req.query.paper, quantity);
      res.json({
        hasLayout: true,
        paper: layout.paper.id,
        paperName: layout.paper.name,
        sheets: layout.sheetCount,
        pieces: layout.pieceCount,
        perSheet: layout.perSheet,
        landscape: layout.landscape,
        unit: spec.unit || "pcs"
      });
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
      const spec = parseLayout(service.layout_json);
      if (spec && !req.file) throw new Error("An image is required for this print layout.");
      const layout = spec ? plan(spec, req.body.paper, quantity) : null;

      const reference = `MP-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomInt(1000, 9999)}`;
      const total = Number(service.price) * quantity;
      const result = await db.run(`
        INSERT INTO orders
        (reference, customer_name, contact, service_id, service_name, quantity, unit_price, total, notes, file_name, original_name, file_mime, file_data, paper, sheets)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        req.file?.buffer || null,
        layout?.paper.id || null,
        layout?.sheetCount || null
      ]);
      res.status(201).json({
        id: result.lastInsertId,
        reference,
        total,
        hasLayout: Boolean(spec),
        paperName: layout?.paper.name || null,
        sheets: layout?.sheetCount || null
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
        .map(({ layout_json, ...service }) => {
          const spec = parseLayout(layout_json);
          return {
            ...service,
            hasLayout: Boolean(spec),
            unit: spec?.unit || null,
            papers: spec ? paperChoices(spec) : []
          };
        });
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
        SELECT o.reference, o.quantity, o.paper, o.file_name, o.file_data, s.layout_json
        FROM orders o JOIN services s ON s.id = o.service_id WHERE o.id = ?
      `, [req.params.id]);
      const image = order?.file_data
        ? Buffer.from(order.file_data)
        : order?.file_name
          ? path.join(__dirname, "data", "uploads", order.file_name)
          : null;
      const spec = parseLayout(order?.layout_json);
      if (!image || !spec) return res.status(404).send("No printable layout is available.");
      const pdf = await createPhotoLayout(image, spec, order.paper, order.quantity);
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
