# Mini Blinkit Inventory API

A small inventory-management application inspired by Blinkit. Users can add products, view available stock, reserve items, confirm reservations and release reservations. Reservations expire automatically after 10 minutes.

The goal of this project is to demonstrate **Docker, GitHub collaboration, CI/CD and deployment**. The application itself is intentionally kept simple.

- **GitHub repository:** _to be added_
- **Live application (Vercel):** _to be added_

---

## Quick start (about 5 minutes)

Follow these steps to run the backend on your own computer.

### 1. Install the tools

- [Node.js](https://nodejs.org) **22 or newer** (check with `node --version`)
- [Git](https://git-scm.com)
- Docker Desktop (only needed for Step 4 onwards)

### 2. Clone the repository and install

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd Mini-Blinkit-inventory-API/server
npm install
```

### 3. Create your environment file

```bash
cp .env.example .env
```

On Windows Command Prompt use `copy .env.example .env` instead. PowerShell accepts either.

### 4. Add the database connection

The whole team uses **one shared Neon database**, and the tables already exist.

1. Ask Member 1 for the connection strings **privately** (direct message). Never post them in GitHub issues, pull requests, commits or the README.
2. Open `server/.env` and paste them in as `DATABASE_URL` (direct) and `DATABASE_URL_POOLED` (pooled; the host contains `-pooler`). If you only received one string, put it in `DATABASE_URL` and leave `DATABASE_URL_POOLED` empty. The app uses the pooled one when it is set.
3. Keep the other lines (`PORT`, `RESERVATION_TTL_MINUTES`) as they are.

> Everyone shares the same data, so products you add are visible to the whole team. Please do not drop, truncate or delete tables.

### 5. Check the database connection

```bash
npm run db:init
```

This creates the tables if they are missing and does nothing if they already exist, so it is safe to run. You should see:

```
Database schema is ready. Tables:
 - products
 - reservations
```

### 6. Start the API

```bash
npm run dev
```

Open <http://localhost:3000/api/health>. You should see:

```json
{ "status": "OK", "message": "Mini Blinkit API is running" }
```

### 7. Try it

PowerShell:

```powershell
# Add a product
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/products -ContentType "application/json" -Body '{"name":"Amul Milk 500ml","category":"Dairy","price":29,"stock_qty":100}'

# List products
Invoke-RestMethod http://localhost:3000/api/products
```

macOS / Linux / Git Bash:

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Amul Milk 500ml","category":"Dairy","price":29,"stock_qty":100}'

curl http://localhost:3000/api/products
```

### Troubleshooting

| Problem | Fix |
|---|---|
| `getaddrinfo ENOTFOUND ...neon.tech` or `DNS operation refused` | Your network's DNS cannot resolve Neon. Switch your DNS to `8.8.8.8` and `1.1.1.1` (or use your phone's hotspot), run `ipconfig /flushdns`, and try again. |
| `password authentication failed` | The connection string is wrong or outdated. Copy a fresh one from the Neon dashboard. |
| `relation "products" does not exist` | Run `npm run db:init`. |
| Environment variable is `undefined` | Run commands from the `server/` folder and check that `server/.env` exists. |
| `EADDRINUSE` (port already in use) | Change `PORT` in `.env`, or stop the other program using port 3000. |
| A long SSL warning about `sslmode` | Harmless. It is a notice about a future version of the `pg` library. |

---

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js 22 + Express |
| Database | PostgreSQL (Neon) |
| Testing | Jest + Supertest (backend) |
| Containerization | Docker |
| CI/CD | GitHub Actions |
| Deployment | Vercel |
| Version control | Git + GitHub |

> **Deployment note:** Docker is used to run and test the application container locally and to build the image in CI. Vercel does not deploy a Docker image directly, so the frontend and API use a Vercel-compatible setup (static frontend build plus the Express app running as a serverless function under `/api`).
>
> **Why a real database and not in-memory data:** Vercel runs functions in separate, short-lived instances, so in-memory data is not shared between requests. Inventory is stored in PostgreSQL so every request sees the same stock.

---

## Main features

- Add products with a name, category, price and stock quantity.
- View products and their available quantities.
- Reserve stock only when enough unreserved stock is available.
- Confirm a reservation to complete the stock deduction.
- Release a reservation to make the reserved quantity available again.
- Automatically expire reservations after 10 minutes.

---

## Reservation logic

Available stock is calculated as:

```
available_qty = stock_qty - reserved_qty
```

| Operation | What happens |
|---|---|
| **Add product** | Create the product with `stock_qty` and `reserved_qty = 0`. |
| **Reserve** | Increase `reserved_qty` only if enough stock is available. Creates a reservation with status `HELD` and `expires_at = now + 10 minutes`. |
| **Confirm** | Decrease both `stock_qty` and `reserved_qty`. Reservation becomes `CONFIRMED`. |
| **Release** | Decrease `reserved_qty` only (`stock_qty` is unchanged). Reservation becomes `RELEASED`. |
| **Expire** | Reservations still `HELD` after `expires_at` are released automatically. Reservation becomes `EXPIRED`. |

### Atomic reservation

The stock check and the update happen in a **single SQL statement**, so two requests can never reserve the same stock:

```sql
UPDATE products
SET reserved_qty = reserved_qty + $2,
    updated_at = NOW()
WHERE id = $1
  AND stock_qty - reserved_qty >= $2
RETURNING id;
```

If no row is updated, there was not enough stock and the API returns `409 INSUFFICIENT_STOCK`. The product update and the reservation insert run in the same database transaction.

### How expiry works (important on Vercel)

Vercel functions are stateless, so background timers such as `setInterval()` are **not** used. Instead, an `expireReservations()` function runs **before every product read and every reservation request** (reserve, confirm, release). It finds reservations that are still `HELD` and past `expires_at`, marks them `EXPIRED` and decrements `reserved_qty` in one transaction. Only `HELD` reservations are ever expired, so a confirmed reservation is never released.

---

## Database schema

Defined in `server/db/schema.sql` and created with `npm run db:init` (safe to run more than once).

```sql
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    reserved_qty INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_reserved_qty
        CHECK (reserved_qty >= 0 AND reserved_qty <= stock_qty)
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'HELD'
        CHECK (status IN ('HELD', 'CONFIRMED', 'RELEASED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reservations_status_expiry
    ON reservations(status, expires_at);
```

The `CHECK` constraints are a second safety net: the database itself refuses negative stock or `reserved_qty > stock_qty`. `updated_at` is not automatic, so every query that changes a product sets `updated_at = NOW()`.

> `CREATE TABLE IF NOT EXISTS` never changes a table that already exists. If you edit a column in `schema.sql`, tell the team and drop and recreate the tables (or add an `ALTER TABLE`).

---

## API overview

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/health` | Check whether the API is running | Done |
| GET | `/api/products` | List products and available stock (optional `?category=`) | Done |
| POST | `/api/products` | Add a product | Done |
| POST | `/api/reservations` | Reserve product stock | Step 3 |
| POST | `/api/reservations/:id/confirm` | Confirm a reservation | Step 3 |
| POST | `/api/reservations/:id/release` | Release a reservation | Step 3 |

### Request and response examples

**`GET /api/health`**

```json
200 { "status": "OK", "message": "Mini Blinkit API is running" }
```

**`POST /api/products`**

```json
Request  { "name": "Amul Milk 500ml", "category": "Dairy", "price": 29, "stock_qty": 100 }
201      { "id": 1, "name": "Amul Milk 500ml", "category": "Dairy", "price": 29,
           "stock_qty": 100, "reserved_qty": 0, "available_qty": 100,
           "created_at": "2026-11-12T07:31:40.323Z" }
400      VALIDATION_ERROR
```

Validation rules: `name` and `category` are required text (max 150 and 100 characters), `price` is a number from 0 to 99999999.99, and `stock_qty` is a whole number from 0 to 1000000.

**`GET /api/products`** (optional filter: `/api/products?category=Dairy`)

```json
200 [ { "id": 1, "name": "Amul Milk 500ml", "category": "Dairy", "price": 29,
        "stock_qty": 100, "reserved_qty": 5, "available_qty": 95,
        "created_at": "2026-11-12T07:31:40.323Z" } ]
```

**`POST /api/reservations`** (Step 3)

```json
Request  { "product_id": 1, "quantity": 5 }
201      { "id": 12, "product_id": 1, "quantity": 5, "status": "HELD",
           "expires_at": "2026-11-12T10:30:00Z" }
400      VALIDATION_ERROR
404      PRODUCT_NOT_FOUND
409      INSUFFICIENT_STOCK
```

**`POST /api/reservations/:id/confirm`** and **`POST /api/reservations/:id/release`** (Step 3)

```json
200      { "id": 12, "status": "CONFIRMED" }     (or "RELEASED")
404      RESERVATION_NOT_FOUND
409      RESERVATION_NOT_ACTIVE   (already confirmed, released or expired)
```

### Error format

All errors use the same shape:

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Only 3 units available" } }
```

| Code | HTTP status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Missing or invalid input, or invalid JSON |
| `NOT_FOUND` | 404 | Unknown route |
| `PRODUCT_NOT_FOUND` / `RESERVATION_NOT_FOUND` | 404 | Unknown id |
| `INSUFFICIENT_STOCK` / `RESERVATION_NOT_ACTIVE` | 409 | Not enough stock, or the reservation is no longer `HELD` |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Project structure

Items marked "(planned)" are created in later steps.

```
Mini-Blinkit-inventory-API/
├── .github/workflows/ci.yml       # CI pipeline (planned, Step 5)
├── api/index.js                   # Exports the Express app for Vercel (planned, Step 7)
├── client/                        # React + Vite frontend (planned, Step 6)
├── server/
│   ├── app.js                     # Express app (exported, used by tests and Vercel)
│   ├── index.js                   # Starts the server locally
│   ├── db.js                      # PostgreSQL connection pool
│   ├── routes/
│   │   └── products.js            # Products endpoints
│   ├── db/schema.sql              # Database schema
│   ├── scripts/init-db.js         # Creates the tables (npm run db:init)
│   ├── .env.example               # Environment variable template
│   └── package.json
├── Dockerfile                     # (planned, Step 4)
├── .dockerignore                  # (planned, Step 4)
├── vercel.json                    # (planned, Step 7)
├── .gitignore
└── README.md
```

---

## Environment variables

Set in `server/.env` (never commit this file). `server/.env.example` is the template.

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Neon connection string (direct). Used when the pooled one is empty. | none |
| `DATABASE_URL_POOLED` | Neon pooled connection string (host contains `-pooler`). Preferred when set, and used on Vercel. | empty |
| `TEST_DATABASE_URL` | Connection string of the separate Neon `test` branch. Used only by the tests and CI. | none |
| `PORT` | Port the API listens on | `3000` |
| `RESERVATION_TTL_MINUTES` | Minutes before a reservation expires | `10` |

On Vercel, set `DATABASE_URL_POOLED` under **Project Settings → Environment Variables**. In GitHub, add `TEST_DATABASE_URL` under **Settings → Secrets and variables → Actions**.

---

## Team and ownership

| Member | Name | Steps | Responsibility |
|---|---|---|---|
| Member 1 | Gursneh Kaur | 1-3 | Application and backend |
| Member 2 | _name_ | 4-6 | Docker, CI/CD and frontend |
| Member 3 | _name_ | 7-9 | Deployment, documentation and final checks |

**Hand-off rule:** each member finishes their block, makes sure `main` is up to date and working, ticks their boxes below, and tells the next member before they start.

**Database access:** Member 1 owns the Neon project and shares the connection strings privately.

---

## Project completion checklist

Tick each box on GitHub as the work is completed.

### Member 1: Application and backend (Steps 1-3)

- [x] **Step 1: Repository and project setup**
  - [x] Create the GitHub repository and add both teammates as collaborators.
  - [x] Work directly on `main` (single-branch workflow).
  - [x] Set up the Express app in `server/` and the `/api/health` endpoint.
  - [x] Add `.gitignore`, `.env.example` and the initial README.
- [ ] **Step 2: Products API**
  - [x] Create the Neon database and run `server/db/schema.sql` (`npm run db:init`).
  - [x] Implement `POST /api/products` to add a product.
  - [x] Implement `GET /api/products` to list products with `available_qty`.
  - [x] Store product name, category, price, `stock_qty` and `reserved_qty`.
  - [ ] Add tests for the product endpoints (done together with the Step 3 tests).
- [ ] **Step 3: Reservation logic**
  - [ ] Implement stock reservation, confirmation and release (atomic, as described above).
  - [ ] Implement `expireReservations()` and call it before reads and reservation requests.
  - [ ] Add tests for successful reservation, insufficient stock, confirmation, release and expiry.
  - [ ] Add a concurrency test: two simultaneous requests for the last available unit, where exactly one succeeds and the other gets `409`.

### Member 2: Docker, CI/CD and frontend (Steps 4-6)

- [ ] **Step 4: Docker**
  - [ ] Create a `Dockerfile` (Node 22) and `.dockerignore`.
  - [ ] Build the Docker image and run the application in a container locally.
  - [ ] Verify that the application works inside the container (`/api/health` and a product request).
- [ ] **Step 5: GitHub Actions CI pipeline**
  - [ ] Add a workflow under `.github/workflows/`.
  - [ ] Run the workflow on pushes and pull requests.
  - [ ] Add the `TEST_DATABASE_URL` secret (Neon `test` branch) so the tests have a database.
  - [ ] Install dependencies, run tests and build the Docker image.
  - [ ] Verify that the workflow completes successfully (green check).
- [ ] **Step 6: Simple frontend**
  - [ ] Build a React page to list products and add new products.
  - [ ] Add a quantity field and a Reserve button.
  - [ ] Show reservation success and error messages, including out-of-stock errors.
  - [ ] Add controls to confirm or release a reservation.

### Member 3: Deployment, documentation and final checks (Steps 7-9)

- [ ] **Step 7: Vercel deployment**
  - [ ] Configure the frontend and API for Vercel (`vercel.json` and `api/index.js`).
  - [ ] Connect the GitHub repository to Vercel and add `DATABASE_URL_POOLED` as an environment variable.
  - [ ] Deploy the application and test the live frontend and API.
  - [ ] Verify that pushes to `main` trigger a deployment.
- [ ] **Step 8: Complete the README**
  - [ ] Check that the quick start still matches the final scripts.
  - [ ] Add commands to run the tests and the Docker container.
  - [ ] Add the GitHub repository and live Vercel URL.
  - [ ] Document the reservation expiry behavior and database setup.
- [ ] **Step 9: Final verification and release**
  - [ ] Test the live application from another browser or device.
  - [ ] Verify product creation, reservation, confirmation, release and expiry.
  - [ ] Check that all three members have contributed commits.
  - [ ] Confirm that `main` has passing CI checks.
  - [ ] Create the `v1.0` Git tag/release and tidy the repository.

---

## Git workflow

We work directly on `main`.

1. Before you start, and before every push, run `git pull`.
2. Make small, focused commits with a prefix: `feat:`, `fix:`, `test:`, `ci:`, `docs:` or `chore:`.
3. Push with `git push`. If it is rejected, run `git pull --rebase` and push again.
4. Only change files that belong to your step, to avoid merge conflicts.
5. Never commit `.env` files or database credentials.

---

## Running tests

Tests (Jest + Supertest) are added in the testing step, and the commands will be listed here.

Neon is the only database we use. Tests run against a separate Neon branch named `test` (a free copy of the main database) through `TEST_DATABASE_URL`. The tests empty the tables they use, so **never** point `TEST_DATABASE_URL` at the main database.

---

## Docker

```bash
# From the repository root
docker build -t blinkit-inventory-api .
docker run --env-file server/.env -p 3000:3000 blinkit-inventory-api
```

Then open `http://localhost:3000/api/health`. The exact commands are finalised in Step 4.

> **Heads-up:** Docker's `--env-file` keeps quote characters as part of the value. If the values in your `.env` are wrapped in double quotes (the Neon dashboard and CLI add them), remove the quotes for Docker or the database connection will fail.

---

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:

1. Check out the code and set up Node 22.
2. Read the Neon `test` branch connection string from the `TEST_DATABASE_URL` GitHub secret.
3. Install dependencies (`npm ci`) and run the tests.
4. Build the Docker image.

Deployment to Vercel happens automatically when changes are pushed to `main`.

---

## Architecture

The React frontend sends HTTP requests to the Node.js/Express API. The API validates requests and uses PostgreSQL to store products and reservations. PostgreSQL performs stock reservations atomically. GitHub Actions runs tests and builds the Docker image whenever code is pushed or a pull request is opened. Vercel hosts the live application using a Vercel-compatible frontend and API deployment.

```
React (Vite)  --HTTP-->  Express API  --SQL-->  PostgreSQL (Neon)
                              |
                  expireReservations() before
                  reads and reservation requests

GitHub push / PR  -->  GitHub Actions (tests + Docker build)
GitHub main       -->  Vercel (live deployment)
```

---

## Links

- **GitHub repository:** _to be added_
- **Live application:** _to be added_