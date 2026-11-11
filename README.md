# Mini Blinkit Inventory API

A small inventory-management application inspired by Blinkit. Users can add products, view available stock, reserve items, confirm reservations and release reservations. Reservations expire automatically after 10 minutes.

The goal of this project is to demonstrate **Docker, GitHub collaboration, CI/CD and deployment**. The application itself is intentionally kept simple.

- **GitHub repository:** _to be added_
- **Live application (Vercel):** _to be added_

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

- Add products with a name, price and stock quantity.
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
SET reserved_qty = reserved_qty + $2
WHERE id = $1
  AND stock_qty - reserved_qty >= $2
RETURNING id;
```

If no row is updated, there was not enough stock and the API returns `409 INSUFFICIENT_STOCK`. The product update and the reservation insert run in the same database transaction.

### How expiry works (important on Vercel)

Vercel functions are stateless, so background timers such as `setInterval()` are **not** used. Instead, an `expireReservations()` function runs **before every product read and every reservation request** (reserve, confirm, release). It finds reservations that are still `HELD` and past `expires_at`, marks them `EXPIRED` and decrements `reserved_qty` in one transaction. Only `HELD` reservations are ever expired, so a confirmed reservation is never released.

---

## Database schema

Defined in `server/db/schema.sql`.

```sql
CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  name          TEXT           NOT NULL,
  price         NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  stock_qty     INTEGER        NOT NULL CHECK (stock_qty >= 0),
  reserved_qty  INTEGER        NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CHECK (reserved_qty <= stock_qty)
);

CREATE TABLE IF NOT EXISTS reservations (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER     NOT NULL REFERENCES products (id),
  quantity    INTEGER     NOT NULL CHECK (quantity > 0),
  status      TEXT        NOT NULL DEFAULT 'HELD'
              CHECK (status IN ('HELD', 'CONFIRMED', 'RELEASED', 'EXPIRED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reservations_status_expiry
  ON reservations (status, expires_at);
```

The `CHECK` constraints are a second safety net: the database itself refuses negative stock or `reserved_qty > stock_qty`.

---

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Check whether the API is running |
| GET | `/api/products` | List products and available stock |
| POST | `/api/products` | Add a product |
| POST | `/api/reservations` | Reserve product stock |
| POST | `/api/reservations/:id/confirm` | Confirm a reservation |
| POST | `/api/reservations/:id/release` | Release a reservation |

### Request and response examples

**`GET /api/health`**

```json
200 { "status": "ok" }
```

**`POST /api/products`**

```json
Request  { "name": "Amul Milk 500ml", "price": 29, "stock_qty": 100 }
201      { "id": 1, "name": "Amul Milk 500ml", "price": 29,
           "stock_qty": 100, "reserved_qty": 0, "available_qty": 100 }
400      VALIDATION_ERROR   (missing name, negative price or stock)
```

**`GET /api/products`**

```json
200 [ { "id": 1, "name": "Amul Milk 500ml", "price": 29,
        "stock_qty": 100, "reserved_qty": 5, "available_qty": 95 } ]
```

**`POST /api/reservations`**

```json
Request  { "product_id": 1, "quantity": 5 }
201      { "id": 12, "product_id": 1, "quantity": 5, "status": "HELD",
           "expires_at": "2026-11-12T10:30:00Z" }
400      VALIDATION_ERROR
404      PRODUCT_NOT_FOUND
409      INSUFFICIENT_STOCK
```

**`POST /api/reservations/:id/confirm`** and **`POST /api/reservations/:id/release`**

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

---

## Project structure

```
Mini-Blinkit-inventory-API/
├── .github/workflows/ci.yml       # Step 5: CI pipeline
├── api/index.js                   # Step 7: exports the Express app for Vercel
├── client/                        # Step 6: React + Vite frontend
├── server/
│   ├── src/
│   │   ├── app.js                 # Express app (exported, used by tests and Vercel)
│   │   ├── server.js              # Starts the server locally
│   │   ├── db.js                  # PostgreSQL connection
│   │   ├── routes/                # health, products, reservations
│   │   └── services/              # reservation logic + expireReservations()
│   ├── db/schema.sql              # Database schema
│   ├── tests/                     # Jest + Supertest tests
│   ├── .env.example               # Environment variable template
│   └── package.json
├── Dockerfile                     # Step 4
├── .dockerignore                  # Step 4
├── vercel.json                    # Step 7
├── .gitignore
└── README.md
```

---

## Team and ownership

| Member | Name | Steps | Responsibility |
|---|---|---|---|
| Member 1 | Gursneh Kaur | 1-3 | Application and backend |
| Member 2 | Pakhi Sharma | 4-6 | Docker, CI/CD and frontend |
| Member 3 | Kanishk Jain | 7-9 | Deployment, documentation and final checks |

**Hand-off rule:** each member finishes their block, makes sure `dev` is passing and up to date, ticks their boxes below, and tells the next member before they start.

---

## Project completion checklist

Tick each box on GitHub as the work is completed.

### Member 1: Application and backend (Steps 1-3)

- [x] **Step 1: Repository and project setup**
  - Create the GitHub repository and add both teammates as collaborators.
  - Create `main` and `dev` branches.
  - Set up the Express app in `server/` and the `/api/health` endpoint.
  - Add `.gitignore`, `.env.example` and the initial README.
- [ ] **Step 2: Products API**
  - Create the Neon database and run `server/db/schema.sql`.
  - Implement `POST /api/products` to add a product.
  - Implement `GET /api/products` to list products with `available_qty`.
  - Store product name, price, `stock_qty` and `reserved_qty`.
  - Add tests for the product endpoints and open a feature-branch PR into `dev`.
- [ ] **Step 3: Reservation logic**
  - Implement stock reservation, confirmation and release (atomic, as described above).
  - Implement `expireReservations()` and call it before reads and reservation requests.
  - Add tests for successful reservation, insufficient stock, confirmation, release and expiry.
  - Add a concurrency test: two simultaneous requests for the last available unit, where exactly one succeeds and the other gets `409`.
  - Merge the completed backend work into `dev` after review and passing tests.

### Member 2: Docker, CI/CD and frontend (Steps 4-6)

- [ ] **Step 4: Docker**
  - Create a `Dockerfile` (Node 22) and `.dockerignore`.
  - Build the Docker image and run the application in a container locally.
  - Verify that the application works inside the container (`/api/health` and a product request).
- [ ] **Step 5: GitHub Actions CI pipeline**
  - Add a workflow under `.github/workflows/`.
  - Run the workflow on pushes and pull requests.
  - Start a PostgreSQL service container so the tests have a database.
  - Install dependencies, run tests and build the Docker image.
  - Verify that the workflow completes successfully (green check).
- [ ] **Step 6: Simple frontend**
  - Build a React page to list products and add new products.
  - Add a quantity field and a Reserve button.
  - Show reservation success and error messages, including out-of-stock errors.
  - Add controls to confirm or release a reservation.
  - Open a PR into `dev` and merge after review and successful checks.

### Member 3: Deployment, documentation and final checks (Steps 7-9)

- [ ] **Step 7: Vercel deployment**
  - Configure the frontend and API for Vercel (`vercel.json` and `api/index.js`).
  - Connect the GitHub repository to Vercel and add `DATABASE_URL` as an environment variable (use Neon's pooled connection string).
  - Deploy the application and test the live frontend and API.
  - Verify that pushes to `main` trigger a deployment.
- [ ] **Step 8: Complete the README**
  - Add installation and local setup instructions (confirm the commands below against the final scripts).
  - Add commands to run the application, tests and Docker container.
  - Add a short architecture description.
  - Add the GitHub repository and live Vercel URL.
  - Document the reservation expiry behavior and database setup.
- [ ] **Step 9: Final verification and release**
  - Test the live application from another browser or device.
  - Verify product creation, reservation, confirmation, release and expiry.
  - Check that all three members have contributed commits and PRs.
  - Confirm that `main` has passing CI checks.
  - Create the `v1.0` Git tag/release and tidy the repository.

---

## Git workflow

1. Each member creates a feature branch from `dev`, for example `feature/step-2-products-api`.
2. Make small, focused commits with a prefix: `feat:`, `fix:`, `test:`, `ci:`, `docs:` or `chore:`.
3. Push the branch and open a pull request into `dev`.
4. Review the PR and make sure GitHub Actions passes.
5. Merge completed and tested work into `dev`.
6. After integration testing, merge `dev` into `main`.
7. Vercel deploys the application from `main`.

Never push directly to `main` or `dev`, and never commit `.env` files or database credentials.

---

## Local setup

> These commands are the agreed conventions. If a script name changes, update this section.

**Prerequisites:** Node.js 22 or newer, npm, Git, Docker Desktop, and a free [Neon](https://neon.tech) account.

```bash
# 1. Clone the repository
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd Mini-Blinkit-inventory-API

# 2. Install and configure the backend
cd server
npm install
cp .env.example .env          # then fill in DATABASE_URL

# 3. Create the tables (once)
npm run db:init

# 4. Start the API (http://localhost:3000)
npm run dev
```

```bash
# Frontend (after Step 6), in a second terminal
cd client
npm install
npm run dev                   # http://localhost:5173, proxies /api to port 3000
```

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Neon). Never commit it. | none |
| `PORT` | Port the API listens on | `3000` |
| `RESERVATION_TTL_MINUTES` | Minutes before a reservation expires | `10` |

On Vercel, set these under **Project Settings → Environment Variables**. In GitHub Actions, the CI database is a temporary PostgreSQL container, so no production credentials are needed.

---

## Running tests

Tests need a PostgreSQL database. Use a separate test database, never the production one. A quick local option with Docker:

```bash
docker run --name inventory-test-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16

# In server/.env (or the shell) for tests:
# DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres

cd server
npm run db:init
npm test
```

---

## Docker

```bash
# From the repository root
docker build -t blinkit-inventory-api .
docker run --env-file server/.env -p 3000:3000 blinkit-inventory-api
```

Then open `http://localhost:3000/api/health`. The exact commands are finalised in Step 4.

---

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:

1. Check out the code and set up Node 22.
2. Start a PostgreSQL service container.
3. Install dependencies (`npm ci`) and run the tests.
4. Build the Docker image.

Deployment to Vercel happens automatically when changes are merged into `main`.

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