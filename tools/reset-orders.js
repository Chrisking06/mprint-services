// Clears all orders and their uploaded images. Prices and the admin account are kept.
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
const uploadDir = path.join(dataDir, "uploads");
const db = new Database(path.join(dataDir, "mprint.db"));

for (const row of db.prepare("SELECT file_name FROM orders").all()) {
  if (row.file_name) fs.rmSync(path.join(uploadDir, row.file_name), { force: true });
}

const removed = db.prepare("DELETE FROM orders").run().changes;
db.prepare("DELETE FROM sqlite_sequence WHERE name = 'orders'").run();

console.log(`Removed ${removed} order(s).`);
console.log(`Files left in uploads: ${fs.readdirSync(uploadDir).length}`);
