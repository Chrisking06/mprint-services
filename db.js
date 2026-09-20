const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const catalog = [
  ["lam-2r", "Lamination", "2R / Wallet Size", null],
  ["lam-3r", "Lamination", "3R Size", null],
  ["lam-4r", "Lamination", "4R Size", null],
  ["lam-5r", "Lamination", "5R Size", null],
  ["lam-6r", "Lamination", "6R Size", null],
  ["lam-a4", "Lamination", "A4 Size", null],
  ["lam-a5", "Lamination", "A5 Size", null],
  ["lam-nametag", "Lamination", "Nametag", null],
  ["photo-1x1", "Photo Printing", "1×1 ID Photo", {
    pieces: [{ width: 1, height: 1, count: 1 }],
    papers: ["2r", "3r", "4r", "5r", "a5", "a4"],
    paper: "4r",
    unit: "pcs"
  }],
  ["photo-2x2", "Photo Printing", "2×2 ID Photo", {
    pieces: [{ width: 2, height: 2, count: 1 }],
    papers: ["3r", "4r", "5r", "a5", "a4"],
    paper: "4r",
    unit: "pcs"
  }],
  ["photo-passport", "Photo Printing", "Passport Size", {
    pieces: [{ width: 1.38, height: 1.77, count: 1 }],
    papers: ["3r", "4r", "5r", "a5", "a4"],
    paper: "4r",
    unit: "pcs"
  }],
  ["photo-2r", "Photo Printing", "2R / Wallet Size", { fill: true, papers: ["2r"], paper: "2r", unit: "sheet" }],
  ["photo-3r", "Photo Printing", "3R Size", { fill: true, papers: ["3r"], paper: "3r", unit: "sheet" }],
  ["photo-4r", "Photo Printing", "4R Size", { fill: true, papers: ["4r"], paper: "4r", unit: "sheet" }],
  ["photo-5r", "Photo Printing", "5R Size", { fill: true, papers: ["5r"], paper: "5r", unit: "sheet" }],
  ["photo-a5", "Photo Printing", "A5 Size", { fill: true, papers: ["a5"], paper: "a5", unit: "sheet" }],
  ["photo-a4", "Photo Printing", "A4 Size", { fill: true, papers: ["a4"], paper: "a4", unit: "sheet" }],
  ["rush-a", "Rush ID Packages", "SET A: 2×2 (2pcs), 1×1 (4pcs)", {
    pieces: [{ width: 2, height: 2, count: 2 }, { width: 1, height: 1, count: 4 }],
    papers: ["3r", "4r", "5r", "a5", "a4"],
    paper: "4r",
    unit: "set"
  }],
  ["rush-b", "Rush ID Packages", "SET B: 1×1 (6pcs)", {
    pieces: [{ width: 1, height: 1, count: 6 }],
    papers: ["2r", "3r", "4r", "5r", "a5", "a4"],
    paper: "3r",
    unit: "set"
  }],
  ["rush-c", "Rush ID Packages", "SET C: 2×2 (6pcs)", {
    pieces: [{ width: 2, height: 2, count: 6 }],
    papers: ["4r", "5r", "a5", "a4"],
    paper: "4r",
    unit: "set"
  }],
  ["rush-d", "Rush ID Packages", "SET D: Passport (4pcs), 1×1 (3pcs)", {
    pieces: [{ width: 1.38, height: 1.77, count: 4 }, { width: 1, height: 1, count: 3 }],
    papers: ["3r", "4r", "5r", "a5", "a4"],
    paper: "4r",
    unit: "set"
  }],
  ["instax-mini", "Instax — Polaroid Inspired", "Mini (10pcs)", {
    pieces: [{ width: 2.13, height: 3.39, count: 10 }],
    papers: ["a4", "a5", "5r"],
    paper: "a4",
    unit: "set"
  }],
  ["instax-square", "Instax — Polaroid Inspired", "Square (8pcs)", {
    pieces: [{ width: 2.83, height: 3.39, count: 8 }],
    papers: ["a4", "a5"],
    paper: "a4",
    unit: "set"
  }],
  ["instax-wide", "Instax — Polaroid Inspired", "Wide (5pcs)", {
    pieces: [{ width: 4.25, height: 3.39, count: 5 }],
    papers: ["a4", "a5"],
    paper: "a4",
    unit: "set"
  }],
  ["sticker-a4", "Sticker Printing", "Print Only (A4)", { fill: true, papers: ["a4"], paper: "a4", unit: "sheet" }]
];

function toMysql(sql) {
  return sql
    .replaceAll("INSERT OR IGNORE", "INSERT IGNORE")
    .replaceAll("datetime('now', 'localtime')", "NOW()");
}

function sqliteApi(sqlite) {
  return {
    dialect: "sqlite",
    async upsertService(row) {
      sqlite.prepare(`
        INSERT INTO services (id, category, name, layout_json, sort_order)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          category = excluded.category,
          name = excluded.name,
          layout_json = excluded.layout_json,
          sort_order = excluded.sort_order
      `).run(...row);
    },
    async get(sql, params = []) {
      return sqlite.prepare(sql).get(...params);
    },
    async all(sql, params = []) {
      return sqlite.prepare(sql).all(...params);
    },
    async run(sql, params = []) {
      const result = sqlite.prepare(sql).run(...params);
      return { lastInsertId: result.lastInsertRowid, changes: result.changes };
    }
  };
}

function mysqlApi(pool) {
  return {
    dialect: "mysql",
    async upsertService(row) {
      await pool.query(`
        INSERT INTO services (id, category, name, layout_json, sort_order)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          category = VALUES(category),
          name = VALUES(name),
          layout_json = VALUES(layout_json),
          sort_order = VALUES(sort_order)
      `, row);
    },
    async get(sql, params = []) {
      const [rows] = await pool.query(toMysql(sql), params);
      return rows[0];
    },
    async all(sql, params = []) {
      const [rows] = await pool.query(toMysql(sql), params);
      return rows;
    },
    async run(sql, params = []) {
      const [result] = await pool.query(toMysql(sql), params);
      return { lastInsertId: result.insertId, changes: result.affectedRows };
    }
  };
}

async function seed(db) {
  for (const [index, item] of catalog.entries()) {
    await db.upsertService([item[0], item[1], item[2], item[3] ? JSON.stringify(item[3]) : null, index]);
  }
  const keep = catalog.map(item => item[0]);
  const placeholders = keep.map(() => "?").join(", ");
  await db.run(`DELETE FROM services WHERE id NOT IN (${placeholders})`, keep);

  const adminCount = await db.get("SELECT COUNT(*) AS count FROM admins");
  if (!adminCount.count) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "mprint123";
    await db.run("INSERT INTO admins (username, password_hash) VALUES (?, ?)", [
      username,
      bcrypt.hashSync(password, 12)
    ]);
    console.log(`Initial admin created: ${username}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log("Set ADMIN_PASSWORD before going live.");
    }
  }
}

async function openDatabase() {
  const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (databaseUrl) {
    const mysql = require("mysql2/promise");
    const pool = mysql.createPool({
      uri: databaseUrl,
      waitForConnections: true,
      connectionLimit: 5,
      ssl: { rejectUnauthorized: false }
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id VARCHAR(64) PRIMARY KEY,
        category VARCHAR(120) NOT NULL,
        name VARCHAR(180) NOT NULL,
        price DECIMAL(10,2) NOT NULL DEFAULT 0,
        layout_json TEXT,
        active TINYINT NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT PRIMARY KEY AUTO_INCREMENT,
        reference VARCHAR(40) UNIQUE NOT NULL,
        customer_name VARCHAR(100),
        contact VARCHAR(100),
        service_id VARCHAR(64) NOT NULL,
        service_name VARCHAR(255) NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        notes VARCHAR(500),
        file_name VARCHAR(255),
        original_name VARCHAR(255),
        file_mime VARCHAR(80),
        file_data LONGBLOB,
        paper VARCHAR(20),
        sheets INT,
        crop_mode VARCHAR(20),
        status VARCHAR(32) NOT NULL DEFAULT 'New',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const [existing] = await pool.query(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders'"
    );
    const names = existing.map(column => column.name || column.NAME);
    if (!names.includes("paper")) await pool.query("ALTER TABLE orders ADD COLUMN paper VARCHAR(20)");
    if (!names.includes("sheets")) await pool.query("ALTER TABLE orders ADD COLUMN sheets INT");
    if (!names.includes("crop_mode")) await pool.query("ALTER TABLE orders ADD COLUMN crop_mode VARCHAR(20)");
    const db = mysqlApi(pool);
    await seed(db);
    console.log("Using MySQL database.");
    return db;
  }

  const Database = require("better-sqlite3");
  const dataDir = path.join(__dirname, "data");
  fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });
  const sqlite = new Database(path.join(dataDir, "mprint.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
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
      file_mime TEXT,
      file_data BLOB,
      paper TEXT,
      sheets INTEGER,
      crop_mode TEXT,
      status TEXT NOT NULL DEFAULT 'New',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
  const columns = sqlite.prepare("PRAGMA table_info(orders)").all().map(column => column.name);
  if (!columns.includes("file_data")) sqlite.exec("ALTER TABLE orders ADD COLUMN file_data BLOB");
  if (!columns.includes("file_mime")) sqlite.exec("ALTER TABLE orders ADD COLUMN file_mime TEXT");
  if (!columns.includes("paper")) sqlite.exec("ALTER TABLE orders ADD COLUMN paper TEXT");
  if (!columns.includes("sheets")) sqlite.exec("ALTER TABLE orders ADD COLUMN sheets INTEGER");
  if (!columns.includes("crop_mode")) sqlite.exec("ALTER TABLE orders ADD COLUMN crop_mode TEXT");
  const db = sqliteApi(sqlite);
  await seed(db);
  return db;
}

module.exports = { openDatabase };
