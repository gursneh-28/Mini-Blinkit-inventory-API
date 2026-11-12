
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const db = require("../db");

const createdProductIds = [];

async function addProduct(product) {
  const response = await request(app)
    .post("/api/products")
    .send(product);

  if (response.status === 201) {
    createdProductIds.push(response.body.id);
  }

  return response;
}

// Clean up products created by these tests.
after(async () => {
  try {
    if (createdProductIds.length > 0) {
      await db.query(
        "DELETE FROM reservations WHERE product_id = ANY($1::int[])",
        [createdProductIds]
      );

      await db.query(
        "DELETE FROM products WHERE id = ANY($1::int[])",
        [createdProductIds]
      );
    }
  } finally {
    await db.pool.end();
  }
});

// 1. Successfully creates a product.
test("creates a product with correct stock details", async () => {
  const response = await addProduct({
    name: `Milk Test ${Date.now()}`,
    category: "Product API Test",
    price: 29,
    stock_qty: 100
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.name.startsWith("Milk Test"), true);
  assert.equal(response.body.category, "Product API Test");
  assert.equal(response.body.price, 29);
  assert.equal(typeof response.body.price, "number");
  assert.equal(response.body.stock_qty, 100);
  assert.equal(response.body.reserved_qty, 0);
  assert.equal(response.body.available_qty, 100);
  assert.ok(response.body.id);
  assert.ok(response.body.created_at);
});

// 2. Rejects invalid product data.
test("rejects invalid product data", async () => {
  const invalidProducts = [
    {
      name: "",
      category: "Dairy",
      price: 29,
      stock_qty: 10
    },
    {
      name: "Milk",
      category: "",
      price: 29,
      stock_qty: 10
    },
    {
      name: "Milk",
      category: "Dairy",
      price: "29",
      stock_qty: 10
    },
    {
      name: "Milk",
      category: "Dairy",
      price: -1,
      stock_qty: 10
    },
    {
      name: "Milk",
      category: "Dairy",
      price: 29,
      stock_qty: -1
    },
    {
      name: "Milk",
      category: "Dairy",
      price: 29,
      stock_qty: 1.5
    }
  ];

  for (const product of invalidProducts) {
    const response = await request(app)
      .post("/api/products")
      .send(product);

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
  }
});

// 3. Rejects product names and categories that exceed their limits.
test("rejects product names and categories that are too long", async () => {
  const response = await request(app)
    .post("/api/products")
    .send({
      name: "A".repeat(151),
      category: "B".repeat(101),
      price: 29,
      stock_qty: 10
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

// 4. Lists products successfully.
test("lists products with correct available stock", async () => {
  const created = await addProduct({
    name: `List Test ${Date.now()}`,
    category: "Product List Test",
    price: 50,
    stock_qty: 20
  });

  assert.equal(created.status, 201);

  const response = await request(app)
    .get("/api/products");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body));

  const product = response.body.find(
    p => p.id === created.body.id
  );

  assert.ok(product);
  assert.equal(product.stock_qty, 20);
  assert.equal(product.reserved_qty, 0);
  assert.equal(product.available_qty, 20);
});

// 5. Filters products by category.
test("filters products by category", async () => {
  const dairy = await addProduct({
    name: `Dairy Test ${Date.now()}`,
    category: "Dairy Filter Test",
    price: 30,
    stock_qty: 10
  });

  const bakery = await addProduct({
    name: `Bakery Test ${Date.now()}`,
    category: "Bakery Filter Test",
    price: 40,
    stock_qty: 15
  });

  assert.equal(dairy.status, 201);
  assert.equal(bakery.status, 201);

  const response = await request(app)
    .get("/api/products")
    .query({ category: "Dairy Filter Test" });

  assert.equal(response.status, 200);

  assert.ok(
    response.body.some(p => p.id === dairy.body.id)
  );

  assert.ok(
    response.body.every(
      p => p.category === "Dairy Filter Test"
    )
  );

  assert.ok(
    !response.body.some(p => p.id === bakery.body.id)
  );
});
