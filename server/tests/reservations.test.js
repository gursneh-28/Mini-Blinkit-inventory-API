
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const db = require("../db");

let productId;
let concurrencyProductId;

async function createProduct(name, stockQty) {
  const result = await db.query(
    `INSERT INTO products (name, category, price, stock_qty)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [name, "Automated Test", 10, stockQty]
  );

  return result.rows[0].id;
}

before(async () => {
  const unique = Date.now();

  productId = await createProduct(
    `API Test Product ${unique}`,
    10
  );

  concurrencyProductId = await createProduct(
    `Concurrency Test Product ${unique}`,
    5
  );
});

after(async () => {
  try {
    const ids = [productId, concurrencyProductId].filter(Boolean);

    if (ids.length > 0) {
      await db.query(
        "DELETE FROM reservations WHERE product_id = ANY($1::int[])",
        [ids]
      );

      await db.query(
        "DELETE FROM products WHERE id = ANY($1::int[])",
        [ids]
      );
    }
  } finally {
    await db.pool.end();
  }
});

// 1. Invalid quantity
test("rejects reservation with zero quantity", async () => {
  const response = await request(app)
    .post("/api/reservations")
    .send({ product_id: productId, quantity: 0 });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

// 2. Non-existent product
test("returns 404 for non-existent product", async () => {
  const result = await db.query(
    "SELECT COALESCE(MAX(id), 0) + 1000 AS id FROM products"
  );

  const missingId = Number(result.rows[0].id);

  const response = await request(app)
    .post("/api/reservations")
    .send({ product_id: missingId, quantity: 1 });

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "PRODUCT_NOT_FOUND");
});

// 3. Insufficient stock
test("prevents reservation when stock is insufficient", async () => {
  const response = await request(app)
    .post("/api/reservations")
    .send({ product_id: productId, quantity: 11 });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "INSUFFICIENT_STOCK");
});

// 4. Successful reservation and release
test("creates reservation and updates available stock", async () => {
  const response = await request(app)
    .post("/api/reservations")
    .send({ product_id: productId, quantity: 3 });

  assert.equal(response.status, 201);
  assert.equal(response.body.status, "HELD");

  const products = await request(app)
    .get("/api/products")
    .query({ category: "Automated Test" });

  const product = products.body.find(p => p.id === productId);

  assert.equal(product.stock_qty, 10);
  assert.equal(product.reserved_qty, 3);
  assert.equal(product.available_qty, 7);

  const release = await request(app)
    .post(`/api/reservations/${response.body.id}/release`);

  assert.equal(release.status, 200);
  assert.equal(release.body.status, "RELEASED");
});

// 5. Successful confirmation and duplicate confirmation
test("confirms reservation and prevents duplicate confirmation", async () => {
  const created = await request(app)
    .post("/api/reservations")
    .send({ product_id: productId, quantity: 2 });

  const id = created.body.id;

  const confirmed = await request(app)
    .post(`/api/reservations/${id}/confirm`);

  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.status, "CONFIRMED");

  const duplicate = await request(app)
    .post(`/api/reservations/${id}/confirm`);

  assert.equal(duplicate.status, 409);
  assert.equal(
    duplicate.body.error.code,
    "INVALID_RESERVATION_STATUS"
  );
});

// 6. Successful release and duplicate release
test("releases reservation and prevents duplicate release", async () => {
  const created = await request(app)
    .post("/api/reservations")
    .send({ product_id: productId, quantity: 2 });

  const id = created.body.id;

  const released = await request(app)
    .post(`/api/reservations/${id}/release`);

  assert.equal(released.status, 200);
  assert.equal(released.body.status, "RELEASED");

  const duplicate = await request(app)
    .post(`/api/reservations/${id}/release`);

  assert.equal(duplicate.status, 409);
  assert.equal(
    duplicate.body.error.code,
    "INVALID_RESERVATION_STATUS"
  );
});

// 7. Invalid reservation ID
test("rejects invalid reservation ID", async () => {
  const response = await request(app)
    .post("/api/reservations/0/confirm");

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

// 8. Non-existent reservation
test("returns 404 for non-existent reservation", async () => {
  const result = await db.query(
    "SELECT COALESCE(MAX(id), 0) + 1000 AS id FROM reservations"
  );

  const missingId = Number(result.rows[0].id);

  const response = await request(app)
    .post(`/api/reservations/${missingId}/confirm`);

  assert.equal(response.status, 404);
  assert.equal(
    response.body.error.code,
    "RESERVATION_NOT_FOUND"
  );
});

// 9. Automatic expiry
test("expires old reservations and restores available stock", async () => {
  const created = await request(app)
    .post("/api/reservations")
    .send({ product_id: productId, quantity: 2 });

  const id = created.body.id;

  // Move expiry time into the past to avoid waiting 10 minutes.
  await db.query(
    `UPDATE reservations
     SET expires_at = NOW() - INTERVAL '1 minute'
     WHERE id = $1`,
    [id]
  );

  // Product GET triggers expired reservation cleanup.
  const products = await request(app)
    .get("/api/products")
    .query({ category: "Automated Test" });

  assert.equal(products.status, 200);

  const reservation = await db.query(
    "SELECT status FROM reservations WHERE id = $1",
    [id]
  );

  assert.equal(reservation.rows[0].status, "EXPIRED");

  const product = products.body.find(p => p.id === productId);

  assert.equal(product.stock_qty, 8);
  assert.equal(product.reserved_qty, 0);
  assert.equal(product.available_qty, 8);

  const confirm = await request(app)
    .post(`/api/reservations/${id}/confirm`);

  assert.equal(confirm.status, 409);
  assert.equal(
    confirm.body.error.code,
    "INVALID_RESERVATION_STATUS"
  );
});

// 10. Concurrent reservation requests
test("prevents overselling during concurrent reservations", async () => {
  const results = await Promise.all([
    request(app)
      .post("/api/reservations")
      .send({ product_id: concurrencyProductId, quantity: 4 }),

    request(app)
      .post("/api/reservations")
      .send({ product_id: concurrencyProductId, quantity: 4 })
  ]);

  const statuses = results.map(r => r.status).sort((a, b) => a - b);

  assert.deepEqual(statuses, [201, 409]);

  const products = await request(app)
    .get("/api/products")
    .query({ category: "Automated Test" });

  const product = products.body.find(
    p => p.id === concurrencyProductId
  );

  assert.equal(product.stock_qty, 5);
  assert.equal(product.reserved_qty, 4);
  assert.equal(product.available_qty, 1);
});
