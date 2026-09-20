const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

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

function toMysql(sql) {
  return sql
    .replaceAll("INSERT OR IGNORE", "INSERT IGNORE")
    .replaceAll("datetime('now', 'localtime')", "NOW()");
}

function sqliteApi(sqlite) {
  return {
    dialect: "sqlite",
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
    await db.run(
      "INSERT OR IGNORE INTO services (id, category, name, layout_json, sort_order) VALUES (?, ?, ?, ?, ?)",
      [item[0], item[1], item[2], item[3] ? JSON.stringify(item[3]) : null, index]
    );
  }

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
        status VARCHAR(32) NOT NULL DEFAULT 'New',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
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
      status TEXT NOT NULL DEFAULT 'New',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);
  const columns = sqlite.prepare("PRAGMA table_info(orders)").all().map(column => column.name);
  if (!columns.includes("file_data")) sqlite.exec("ALTER TABLE orders ADD COLUMN file_data BLOB");
  if (!columns.includes("file_mime")) sqlite.exec("ALTER TABLE orders ADD COLUMN file_mime TEXT");
  const db = sqliteApi(sqlite);
  await seed(db);
  return db;
}

module.exports = { openDatabase };
