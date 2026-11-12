require("dotenv").config({
    path: require("path").join(__dirname, ".env"),
});
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL,
  max: 5,
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};