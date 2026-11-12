const express = require("express");
const db = require("../db");
const expireReservations = require("../utils/expireReservations");

const router = express.Router();

// pg returns NUMERIC columns as strings, so convert price to a number
function toProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    stock_qty: row.stock_qty,
    reserved_qty: row.reserved_qty,
    available_qty: row.stock_qty - row.reserved_qty,
    created_at: row.created_at,
  };
}

function validateProduct(body) {
  const errors = [];
  const { name, category, price, stock_qty } = body || {};

  if (typeof name !== "string" || name.trim() === "" || name.trim().length > 150) {
    errors.push("name is required (max 150 characters)");
  }
  if (typeof category !== "string" || category.trim() === "" || category.trim().length > 100) {
    errors.push("category is required (max 100 characters)");
  }
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 99999999.99) {
    errors.push("price must be a number between 0 and 99999999.99");
  }
  if (!Number.isInteger(stock_qty) || stock_qty < 0 || stock_qty > 1000000) {
    errors.push("stock_qty must be a whole number between 0 and 1000000");
  }
  return errors;
}

// POST /api/products - add a product
router.post("/", async (req, res, next) => {
  try {
    const errors = validateProduct(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: errors.join("; ") },
      });
    }

    const { name, category, price, stock_qty } = req.body;
    const result = await db.query(
      `INSERT INTO products (name, category, price, stock_qty)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), category.trim(), price, stock_qty]
    );

    res.status(201).json(toProduct(result.rows[0]));
  } catch (err) {
    next(err);
  }
});


// GET /api/products
router.get("/", async (req, res, next) => {
  let client;
  let transactionStarted = false;

  try {
    client = await db.pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Expire old reservations before fetching products
    await expireReservations(client);

    const { category } = req.query;

    const result = category
      ? await client.query(
          "SELECT * FROM products WHERE category = $1 ORDER BY id",
          [category]
        )
      : await client.query("SELECT * FROM products ORDER BY id");

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json(result.rows.map(toProduct));
  } catch (err) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }
    }

    next(err);
  } finally {
    if (client) {
      client.release();
    }
  }
});


module.exports = router;