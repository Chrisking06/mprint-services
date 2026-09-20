// Clears every order and restores the suggested prices.
// Works on the local SQLite file, or on MySQL when DATABASE_URL is set.
require("dotenv").config();

const { openDatabase, defaultPrices } = require("../db");

(async () => {
  const db = await openDatabase();

  const before = await db.get("SELECT COUNT(*) AS count FROM orders");
  await db.run("DELETE FROM orders");
  if (db.dialect === "sqlite") await db.run("DELETE FROM sqlite_sequence WHERE name = 'orders'");
  else await db.run("ALTER TABLE orders AUTO_INCREMENT = 1");

  for (const [id, price] of Object.entries(defaultPrices)) {
    await db.run("UPDATE services SET price = ? WHERE id = ?", [price, id]);
  }

  const services = await db.all("SELECT id, category, name, price FROM services ORDER BY sort_order");
  console.log(`Database: ${db.dialect}`);
  console.log(`Orders removed: ${before.count}`);
  console.log(`Services priced: ${services.length}`);
  for (const service of services) {
    console.log(`  ${service.id.padEnd(15)} ${String(service.price).padStart(8)}  ${service.category} — ${service.name}`);
  }
  process.exit(0);
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
