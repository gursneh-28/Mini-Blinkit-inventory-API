
const express = require("express");
const db = require("../db");
const expireReservations = require("../utils/expireReservations");

const router = express.Router();

const configuredTtl = Number(process.env.RESERVATION_TTL_MINUTES);
const RESERVATION_TTL_MINUTES =
  Number.isFinite(configuredTtl) && configuredTtl > 0
    ? configuredTtl
    : 10;

// POST /api/reservations
router.post("/", async (req, res, next) => {
  const { product_id, quantity } = req.body || {};

  const errors = [];

  if (!Number.isInteger(product_id) || product_id <= 0) {
    errors.push("product_id must be a positive integer");
  }

  if (
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    quantity > 1000000
  ) {
    errors.push("quantity must be a positive integer");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: errors.join("; "),
      },
    });
  }

  let client;
  let transactionStarted = false;

  try {
    client = await db.pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Clean up expired reservations first
    await expireReservations(client);

    // Atomically reserve stock only if enough is available
    const productResult = await client.query(
      `UPDATE products
       SET reserved_qty = reserved_qty + $1,
           updated_at = NOW()
       WHERE id = $2
         AND stock_qty - reserved_qty >= $1
       RETURNING id`,
      [quantity, product_id]
    );

    if (productResult.rowCount === 0) {
      const existingProduct = await client.query(
        "SELECT id FROM products WHERE id = $1",
        [product_id]
      );

      // Commit so that any expired reservations stay cleaned up
      await client.query("COMMIT");
      transactionStarted = false;

      if (existingProduct.rowCount === 0) {
        return res.status(404).json({
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: "Product not found",
          },
        });
      }

      return res.status(409).json({
        error: {
          code: "INSUFFICIENT_STOCK",
          message: "Not enough available stock",
        },
      });
    }

    // Create the reservation with a 10-minute expiry
    const reservationResult = await client.query(
      `INSERT INTO reservations (product_id, quantity, expires_at)
       VALUES (
         $1,
         $2,
         NOW() + ($3 * INTERVAL '1 minute')
       )
       RETURNING id, product_id, quantity, status, created_at, expires_at`,
      [product_id, quantity, RESERVATION_TTL_MINUTES]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json(reservationResult.rows[0]);
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


// POST /api/reservations/:id/confirm
router.post("/:id/confirm", async (req, res, next) => {
  const reservationId = Number(req.params.id);

  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Reservation ID must be a positive integer",
      },
    });
  }

  let client;
  let transactionStarted = false;

  try {
    client = await db.pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Expire old reservations first
    await expireReservations(client);

    // Lock the reservation to prevent simultaneous confirmation
    const reservationResult = await client.query(
      `SELECT *
       FROM reservations
       WHERE id = $1
       FOR UPDATE`,
      [reservationId]
    );

    if (reservationResult.rowCount === 0) {
      await client.query("COMMIT");
      transactionStarted = false;

      return res.status(404).json({
        error: {
          code: "RESERVATION_NOT_FOUND",
          message: "Reservation not found",
        },
      });
    }

    const reservation = reservationResult.rows[0];

    if (reservation.status !== "HELD") {
      await client.query("COMMIT");
      transactionStarted = false;

      return res.status(409).json({
        error: {
          code: "INVALID_RESERVATION_STATUS",
          message: `Cannot confirm a reservation with status ${reservation.status}`,
        },
      });
    }

    // Deduct the reserved quantity from actual stock
    await client.query(
      `UPDATE products
       SET stock_qty = stock_qty - $1,
           reserved_qty = reserved_qty - $1,
           updated_at = NOW()
       WHERE id = $2`,
      [reservation.quantity, reservation.product_id]
    );

    // Mark the reservation as confirmed
    const result = await client.query(
      `UPDATE reservations
       SET status = 'CONFIRMED'
       WHERE id = $1
       RETURNING id, product_id, quantity, status, created_at, expires_at`,
      [reservationId]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json(result.rows[0]);
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


 // POST /api/reservations/:id/release
router.post("/:id/release", async (req, res, next) => {
  const reservationId = Number(req.params.id);

  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Reservation ID must be a positive integer",
      },
    });
  }

  let client;
  let transactionStarted = false;

  try {
    client = await db.pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Expire old reservations first
    await expireReservations(client);

    // Lock the reservation to prevent simultaneous release
    const reservationResult = await client.query(
      `SELECT *
       FROM reservations
       WHERE id = $1
       FOR UPDATE`,
      [reservationId]
    );

    if (reservationResult.rowCount === 0) {
      await client.query("COMMIT");
      transactionStarted = false;

      return res.status(404).json({
        error: {
          code: "RESERVATION_NOT_FOUND",
          message: "Reservation not found",
        },
      });
    }

    const reservation = reservationResult.rows[0];

    if (reservation.status !== "HELD") {
      await client.query("COMMIT");
      transactionStarted = false;

      return res.status(409).json({
        error: {
          code: "INVALID_RESERVATION_STATUS",
          message: `Cannot release a reservation with status ${reservation.status}`,
        },
      });
    }

    // Return the reserved quantity to available stock
    await client.query(
      `UPDATE products
       SET reserved_qty = reserved_qty - $1,
           updated_at = NOW()
       WHERE id = $2`,
      [reservation.quantity, reservation.product_id]
    );

    // Mark the reservation as released
    const result = await client.query(
      `UPDATE reservations
       SET status = 'RELEASED'
       WHERE id = $1
       RETURNING id, product_id, quantity, status, created_at, expires_at`,
      [reservationId]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json(result.rows[0]);
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
