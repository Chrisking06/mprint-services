const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "..", "data", "mprint.db"));
const removed = db.prepare("DELETE FROM orders").run().changes;
db.prepare("DELETE FROM sqlite_sequence WHERE name = 'orders'").run();
console.log(`Removed ${removed} order(s).`);
