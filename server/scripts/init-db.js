const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

async function main() {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "db", "schema.sql"),
    "utf8"
  );
  await pool.query(sql);

  const result = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log("Database schema is ready. Tables:");
  result.rows.forEach((row) => console.log(" -", row.table_name));
  await pool.end();
}

main().catch(async (err) => {
  console.error("Failed to initialise database:", err.message);
  await pool.end();
  process.exit(1);
});