# Mini Blinkit Inventory API

A small inventory-management application inspired by Blinkit. Users can add products, view available stock, reserve items, confirm reservations, and release reservations. Reservations expire automatically after 10 minutes.

The goal of this project is to demonstrate Docker, GitHub collaboration, CI/CD, and deployment. The application itself is intentionally kept simple.

GitHub repository: https://github.com/gursneh-28/Mini-Blinkit-inventory-API.git

## Live Deployment

| Component | URL |
|---|---|
| Frontend Application | https://YOUR-FRONTEND-URL.vercel.app |
| Backend API | https://mini-blinkit-backend.vercel.app |
| Backend Health Check | https://mini-blinkit-backend.vercel.app/api/health |
| GitHub Repository | https://github.com/gursneh-28/Mini-Blinkit-inventory-API |

## Quick start (about 5 minutes)

Follow these steps to run the backend on your computer.

### 1. Install the tools

- Node.js, version 22 or newer (`node --version`)
- Git
- Docker Desktop (needed from Step 4 onwards)

### 2. Clone the repository and install dependencies

```bash
git clone https://github.com/gursneh-28/Mini-Blinkit-inventory-API.git
cd Mini-Blinkit-inventory-API/server
npm install
```

### 3. Create your environment file

From the `server/` directory, run:

```bash
cp .env.example .env
```

On Windows Command Prompt, use:

```bash
copy .env.example .env
```

PowerShell also accepts `cp`.

### 4. Configure the database connection

The backend uses PostgreSQL for persistent product and reservation data.

1. Obtain the development database connection details from the team member managing the database.
2. Open `server/.env`.
3. Configure `DATABASE_URL` with the direct PostgreSQL connection string.
4. Configure `DATABASE_URL_POOLED` with the pooled connection string, if provided.

The application prefers `DATABASE_URL_POOLED` and falls back to `DATABASE_URL`.

Keep database credentials private. Never commit `.env` or share connection strings publicly.

### 5. Initialize the database

Run this from the `server/` directory:

```bash
npm run db:init
```

This creates the required tables if they do not already exist.

Expected output:

```text
Database schema is ready. Tables:
- products
- reservations
```

### 6. Start the API

```bash
npm run dev
```

Open:

http://localhost:3000/api/health

Expected response:

```json
{
  "status": "OK",
  "message": "Mini Blinkit API is running"
}
```

### 7. Try the API

**Windows PowerShell**

Add a product:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/api/products" `
  -ContentType "application/json" `
  -Body '{"name":"Amul Milk 500ml","category":"Dairy","price":29,"stock_qty":100}'
```

List products:

```powershell
Invoke-RestMethod "http://localhost:3000/api/products"
```

**macOS / Linux / Git Bash**

Add a product:

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Amul Milk 500ml","category":"Dairy","price":29,"stock_qty":100}'
```

List products:

```bash
curl http://localhost:3000/api/products
```

### 8. Try the frontend (Step 6)

In a second terminal, starting from the repository root (keep the API from Step 6 running):

```bash
cd client
npm install
npm run dev
```

Open the link Vite prints (usually http://localhost:5173). See the [Frontend](#frontend-react--vite) section below for details.

## Troubleshooting

| Problem | Fix |
|---|---|
| `getaddrinfo ENOTFOUND ...neon.tech` or DNS errors | Your network may not be resolving Neon. Try another network or your phone's hotspot. You can also try DNS servers 8.8.8.8 and 1.1.1.1, then run `ipconfig /flushdns` on Windows. |
| `password authentication failed` | Check that the connection string is correct and up to date. |
| `relation "products" does not exist` | Run `npm run db:init` from `server/`. |
| Environment variable is undefined | Run commands from the `server/` directory and check that `server/.env` exists. |
| `EADDRINUSE` | Port 3000 is already in use. Stop the other process or change `PORT` in `.env`. |
| PostgreSQL SSL warning about `sslmode` | This may be an informational warning from the `pg` library. It does not necessarily mean the connection failed. |
| `docker is not recognized` | Close and reopen VS Code (or the terminal) after installing Docker Desktop. |
| `error during connect` / `Cannot connect to the Docker daemon` | Docker Desktop is not running yet. Open it and wait for the "Engine running" status. |
| `port is already allocated` | Another process is using port 3000. Stop it with Ctrl + C or use a different port. |
| Container cannot connect to the database | Check the connection string, database network access, and environment file formatting. See the Docker heads-up below. |

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React + Vite (done, Step 6) |
| Backend | Node.js 22 + Express |
| Database | PostgreSQL (Neon) |
| Testing | Node.js built-in test runner + Supertest |
| Containerization | Docker (done, Step 4) |
| CI/CD | GitHub Actions (done, Step 5) |
| Deployment | Vercel (planned) |
| Version control | Git + GitHub |

**Deployment note:** Docker is used to run and test the application locally and to build the image in CI. The planned Vercel deployment uses two separate projects: one for the Express backend and one for the React frontend. The Docker image is not the deployment artifact for these Vercel projects.

**Why PostgreSQL instead of in-memory data?** Vercel functions can run in separate, short-lived instances. In-memory data is not shared between requests. PostgreSQL ensures that every request works with the same inventory and reservation data.

## Main features

- Add products with a name, category, price, and stock quantity.
- View products and their available quantities.
- Filter products by category.
- Reserve stock only when enough unreserved stock is available.
- Confirm a reservation to complete the stock deduction.
- Release a reservation to make reserved stock available again.
- Automatically expire reservations after 10 minutes.
- Prevent overselling through atomic database updates and transactions.
- Web page to list products, add products, reserve stock, and confirm or release reservations, with success and error messages (for example "Only 3 units available").

## Reservation logic

Available stock is calculated as:

```text
available_qty = stock_qty - reserved_qty
```

| Operation | What happens |
|---|---|
| Add product | Creates a product with `stock_qty` and `reserved_qty = 0`. |
| Reserve | Increases `reserved_qty` only if enough stock is available. Creates a reservation with status `HELD` and an expiry time. |
| Confirm | Decreases both `stock_qty` and `reserved_qty`. Reservation becomes `CONFIRMED`. |
| Release | Decreases `reserved_qty` only. `stock_qty` remains unchanged. Reservation becomes `RELEASED`. |
| Expire | A reservation that is still `HELD` after its expiry time is released automatically. Reservation becomes `EXPIRED`. |

### Atomic reservation

The stock check and stock update happen in a single SQL statement. This prevents two concurrent requests from reserving the same available stock.

```sql
UPDATE products
SET reserved_qty = reserved_qty + $2,
    updated_at = NOW()
WHERE id = $1
  AND stock_qty - reserved_qty >= $2
RETURNING id;
```

If no row is updated, there is insufficient stock and the API returns:

```text
409 INSUFFICIENT_STOCK
```

The product update and reservation insertion run inside the same database transaction.

## How reservation expiry works

Vercel functions are stateless, so background timers such as `setInterval()` are not used.

Instead, the `expireReservations()` function runs before:

- Product reads.
- New reservation requests.
- Reservation confirmation.
- Reservation release.

It finds reservations that are still `HELD` and whose `expires_at` time has passed. It then:

- Marks those reservations as `EXPIRED`.
- Decreases the corresponding products' `reserved_qty`.
- Performs the changes within a database transaction.

Only `HELD` reservations can expire. Confirmed reservations are never released by the expiry process.

The expiry duration is configurable using `RESERVATION_TTL_MINUTES`, which defaults to 10 minutes.

## Database schema

The schema is defined in `server/db/schema.sql` and initialized using:

```bash
npm run db:init
```

The command is safe to run more than once for the existing schema because it uses `CREATE TABLE IF NOT EXISTS`.

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

CREATE INDEX IF NOT EXISTS idx_products_category
    ON products(category);

CREATE INDEX IF NOT EXISTS idx_products_name
    ON products(name);

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

The database constraints provide an additional safety layer:

- Product price cannot be negative.
- Stock quantity cannot be negative.
- Reserved quantity cannot be negative.
- Reserved quantity cannot exceed total stock.
- Reservation quantity must be greater than zero.
- Reservation status must be one of the permitted values.

**Schema note:** `CREATE TABLE IF NOT EXISTS` does not modify an existing table. If the schema changes, coordinate with the team and use an appropriate migration or `ALTER TABLE` statement.

## API overview

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/health` | Check whether the API is running | Done |
| GET | `/api/products` | List products and available stock | Done |
| GET | `/api/products?category=Dairy` | 	Filter products by category | Done |
| POST | `/api/products` | Add a product | Done |
| POST | `/api/reservations` | Reserve product stock | Done |
| POST | `/api/reservations/:id/confirm` | Confirm a reservation | Done |
| POST | `/api/reservations/:id/release` | Release a reservation | Done |

All endpoints are available through the deployed backend base URL:

https://mini-blinkit-backend.vercel.app

For example, the products endpoint is:

https://mini-blinkit-backend.vercel.app/api/products

The products endpoint supports an optional category filter:

```text
GET /api/products?category=Dairy
```

### Request and response examples

**GET /api/health**

```json
{
  "status": "OK",
  "message": "Mini Blinkit API is running"
}
```

**POST /api/products**

Request:

```json
{
  "name": "Amul Milk 500ml",
  "category": "Dairy",
  "price": 29,
  "stock_qty": 100
}
```

Successful response: `201 Created`

```json
{
  "id": 1,
  "name": "Amul Milk 500ml",
  "category": "Dairy",
  "price": 29,
  "stock_qty": 100,
  "reserved_qty": 0,
  "available_qty": 100,
  "created_at": "2026-11-12T07:31:40.323Z"
}
```

Validation error: `400 VALIDATION_ERROR`

Product validation rules:

- `name` and `category` are required text fields.
- Maximum `name` length: 150 characters.
- Maximum `category` length: 100 characters.
- `price` must be a number from 0 to 99,999,999.99.
- `stock_qty` must be a whole number from 0 to 1,000,000.

**GET /api/products**

Example response:

```json
[
  {
    "id": 1,
    "name": "Amul Milk 500ml",
    "category": "Dairy",
    "price": 29,
    "stock_qty": 100,
    "reserved_qty": 5,
    "available_qty": 95,
    "created_at": "2026-11-12T07:31:40.323Z"
  }
]
```

**POST /api/reservations**

Request:

```json
{
  "product_id": 1,
  "quantity": 5
}
```

Successful response: `201 Created`

The response contains the reservation ID, product ID, quantity, `HELD` status, and expiry timestamp.

Possible errors:

| HTTP status | Error code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid input |
| 404 | `PRODUCT_NOT_FOUND` | Product does not exist |
| 409 | `INSUFFICIENT_STOCK` | Not enough available stock |

**POST /api/reservations/:id/confirm**

Confirms a reservation and deducts the reserved quantity from stock.

Successful response: `200 OK`, with reservation status `CONFIRMED`.

**POST /api/reservations/:id/release**

Releases a reservation and makes the reserved quantity available again.

Successful response: `200 OK`, with reservation status `RELEASED`.

For confirmation and release, possible errors include:

| HTTP status | Error code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid reservation ID |
| 404 | `RESERVATION_NOT_FOUND` | Reservation does not exist |
| 409 | `INVALID_RESERVATION_STATUS` | Reservation is no longer `HELD` |

### Error response format

All API errors use a consistent response structure:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Only 3 units available"
  }
}
```

Other error codes:

| Code | HTTP status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Missing or invalid input, or invalid JSON |
| `NOT_FOUND` | 404 | Unknown route |
| `PRODUCT_NOT_FOUND` | 404 | Product ID does not exist |
| `RESERVATION_NOT_FOUND` | 404 | Reservation ID does not exist |
| `INSUFFICIENT_STOCK` | 409 | Not enough stock available |
| `INVALID_RESERVATION_STATUS` | 409 | Reservation is no longer active |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Frontend (React + Vite)

The `client/` folder contains a single-page React app (Step 6) that talks to the Express API.

**What it does:**

- Lists products with their available quantity.
- Adds new products (name, category, price, stock).
- Has a quantity field and a **Reserve** button for each product.
- Shows a green success message or a red error message (for example "Only 3 units available" when stock is insufficient).
- Shows reservations made in the current session with **Confirm** and **Release** buttons.

**Run it locally** (two terminals):

```bash
# Terminal 1: backend
cd server
npm run dev
```

```bash
# Terminal 2: frontend
cd client
npm install
npm run dev
```

Open the link Vite prints (usually http://localhost:5173).

**How it connects to the API:**

During local development, `client/vite.config.js` proxies `/api` requests to `http://localhost:3000`.

For production deployment, the frontend must use the deployed backend URL. Configure `VITE_API_BASE_URL` in the Vercel frontend project only after verifying that the frontend code reads this variable when constructing API requests.

**Build for production:**

```bash
cd client
npm run build
```

## Project Structure

The repository is organized into separate frontend and backend applications, with Docker and GitHub Actions configuration at the root.

```text
Mini-Blinkit-inventory-API/
├── .github/
│   └── workflows/
│       └── ci.yml
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── main.jsx
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
├── server/
│   ├── db/
│   │   └── schema.sql
│   ├── routes/
│   │   ├── products.js
│   │   └── reservations.js
│   ├── scripts/
│   │   └── init-db.js
│   ├── tests/
│   │   ├── products.test.js
│   │   └── reservations.test.js
│   ├── utils/
│   │   └── expireReservations.js
│   ├── .env.example
│   ├── app.js
│   ├── db.js
│   ├── index.js
│   ├── test_db.js
│   ├── package.json
│   └── package-lock.json
├── .dockerignore
├── .gitignore
├── Dockerfile
└── README.md
```

**Security note:** Actual `.env` and `.env.test` files are excluded from version control. Only example templates are included.

## Environment variables

The main application configuration is stored in `server/.env`. Use `server/.env.example` as the template.

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Direct Neon PostgreSQL connection string | None |
| `DATABASE_URL_POOLED` | Pooled Neon connection string. Preferred when configured. | Empty |
| `PORT` | Port on which the API runs | 3000 |
| `RESERVATION_TTL_MINUTES` | Minutes before a reservation expires | 10 |

### Test database configuration

Automated tests must use a database isolated from the shared application database.

Create `server/.env.test`:

```env
DATABASE_URL_POOLED=YOUR_TEST_DATABASE_CONNECTION_STRING
RESERVATION_TTL_MINUTES=10
```

The test command automatically loads this file.

The GitHub Actions workflow uses a temporary PostgreSQL 16 service container for testing. It creates the schema and test environment automatically. CI does not use the shared application database or require its credentials.

## Running Automated Tests

The backend uses Node.js's built-in test runner and Supertest.

### Local execution

1. Configure `server/.env.test` with an isolated test database connection.
2. Ensure the test database has the schema from `server/db/schema.sql`.
3. Run the following commands:

```bash
cd server
npm ci
npm test
```

The test script is:

```json
"test": "node --env-file=.env.test --test"
```

### Test coverage

The suite currently contains 15 tests:

**Products API: 5 tests**

- Product creation and stock details.
- Invalid product data.
- Product name and category length validation.
- Product listing and available stock.
- Category filtering.

**Reservations API: 10 tests**

- Invalid reservation quantity.
- Non-existent product.
- Insufficient stock.
- Successful reservation.
- Reservation confirmation and duplicate confirmation.
- Reservation release and duplicate release.
- Invalid reservation ID.
- Non-existent reservation.
- Expiry and stock restoration.
- Concurrent reservation protection.

Latest local result: 15 passed, 0 failed.

CI uses its own temporary PostgreSQL database. Local tests must also use an isolated test database.

## Team and ownership

| Member | Name | Steps | Responsibility |
|---|---|---|---|
| Member 1 | Gursneh Kaur | 1-3 | Application and backend |
| Member 2 | Pakhi Sharma | 4-6 | Docker, CI/CD and frontend |
| Member 3 | Kanishk Jain | 7-9 | Deployment, documentation and final checks |

**Hand-off rule:** Each member finishes their assigned work, checks that `main` is up to date and working, updates the completion checklist, and informs the next member before they begin.

**Database access:** Member 1 manages the Neon project and shares the required connection strings privately.

## Project completion checklist

Tick each box on GitHub as the work is completed.

### Member 1: Application and backend (Steps 1-3)

- [x] **Step 1: Repository and project setup**
  - [x] Create the GitHub repository and add both teammates as collaborators.
  - [x] Establish the feature branch and pull request workflow.
  - [x] Set up the Express application in `server/`.
  - [x] Implement the `/api/health` endpoint.
  - [x] Add `.gitignore`, `.env.example`, and the initial README.

- [x] **Step 2: Products API**
  - [x] Create the Neon database and initialize the schema using `npm run db:init`.
  - [x] Implement `POST /api/products` to add a product.
  - [x] Implement `GET /api/products` to list products with `available_qty`.
  - [x] Store product name, category, price, `stock_qty`, and `reserved_qty`.
  - [x] Add automated tests for the product endpoints.

- [x] **Step 3: Reservation logic**
  - [x] Implement stock reservation, confirmation, and release.
  - [x] Use atomic database updates to prevent overselling.
  - [x] Implement `expireReservations()` and call it before relevant product and reservation operations.
  - [x] Add tests for successful reservation, insufficient stock, confirmation, release, and expiry.
  - [x] Add a concurrency test to verify that only one of two competing reservations succeeds when stock is insufficient for both.

### Member 2: Docker, CI/CD and frontend (Steps 4-6)

**Step 4: Docker**

- [x] Create a Dockerfile using Node.js 22 and a `.dockerignore`.
- [x] Build the Docker image.
- [x] Run the application inside a Docker container locally.
- [x] Verify `/api/health` and a product request inside the container.

**Step 5: GitHub Actions CI pipeline**

- [x] Add a workflow under `.github/workflows/`.
- [x] Configure the workflow to run on pushes and pull requests.
- [x] Configure a temporary PostgreSQL service for testing.
- [x] Install dependencies using `npm ci`.
- [x] Run automated tests.
- [x] Build the Docker image.
- [x] Build the frontend.
- [ ] Verify the latest GitHub Actions workflow run successfully.

**Step 6: Simple frontend**

- [x] Build a React page to list products and add new products.
- [x] Add a quantity field and a Reserve button.
- [x] Show reservation success and error messages, including out-of-stock errors.
- [x] Add controls to confirm or release a reservation.

### Member 3: Deployment, documentation and final checks (Steps 7-9)

**Step 7: Vercel deployment**

- [x] Prepare the Express backend entry point for Vercel.
- [ ] Verify frontend API base URL support in the actual frontend code.
- [x] Add frontend and backend environment example files.
- [x] Connect the GitHub repository to Vercel.
- [ ] Configure production environment variables.
- [x] Deploy the frontend and backend.
- [ ] Verify live API connectivity and application functionality.

**Step 8: Complete the README**

- [x] Document local setup and database initialization.
- [x] Document environment variables and test database configuration.
- [x] Document API endpoints and reservation expiry.
- [x] Document automated tests and test coverage.
- [x] Document Docker execution.
- [x] Document GitHub Actions CI/CD.
- [x] Document project architecture and team responsibilities.
- [ ] Verify the README against the final repository.
- [ ] Add the live Vercel URLs after deployment.

**Step 9: Final verification and release**

- [ ] Test the live application from another browser or device.
- [ ] Verify product creation, reservation, confirmation, release, and expiry.
- [ ] Check that all three members have contributed commits.
- [ ] Confirm that `main` has passing CI checks.
- [ ] Create the v1.0 Git tag/release and tidy the repository.

## Git Workflow

The project follows a feature branch workflow.

1. `main` contains the integrated project.
2. New work is developed in separate feature branches.
3. Changes are pushed to GitHub.
4. Pull requests are created against `main`.
5. GitHub Actions runs the CI pipeline.
6. Changes are merged after review and successful checks.

Example:

```bash
git checkout main
git pull origin main
git checkout -b feat/your-feature
git add .
git commit -m "feat: describe your changes"
git push -u origin feat/your-feature
```

## Docker

Docker support has been added (Step 4). The `Dockerfile` and `.dockerignore` are in the repository root.

Build the image from the repository root:

```bash
docker build -t blinkit-inventory-api .
```

Run the container:

```bash
docker run --env-file server/.env -p 3000:3000 blinkit-inventory-api
```

Then open:

http://localhost:3000/api/health

**Heads-up:** Docker's `--env-file` handles quoted values differently from Node.js dotenv. If your connection string values contain surrounding double quotes, remove those quotes before running the container.

### Docker step by step

1. Install and open **Docker Desktop**, and wait until it shows "Engine running".
2. Make sure `server/.env` exists with the database connection strings (see Quick start, steps 3 and 4).
3. From the repository root, build the image:

   ```bash
   docker build -t blinkit-inventory-api .
   ```

4. Run the container:

   ```bash
   docker run --env-file server/.env -p 3000:3000 blinkit-inventory-api
   ```

5. Open http://localhost:3000/api/health and http://localhost:3000/api/products to verify.
6. Press Ctrl + C in the terminal to stop the container.

### What the Dockerfile does

| Line | Purpose |
|---|---|
| `FROM node:22-alpine` | Uses a small Node.js 22 image, matching the version required by this project. |
| `COPY server/package*.json ./` and `RUN npm ci --omit=dev` | Installs the exact dependency versions from `package-lock.json` (production dependencies only), so the app behaves the same on every machine. |
| `COPY server/ ./` | Copies the API source code into the image. |
| `ENV NODE_ENV=production PORT=3000` and `EXPOSE 3000` | Sets production mode and the port the API listens on. |
| `CMD ["node", "index.js"]` | Starts the Express server. |

The `.dockerignore` file keeps `node_modules`, `.env` files, `.git`, `.github`, `client`, and `README.md` out of the image, so the image stays small and no credentials are copied into it.

## CI/CD Pipeline

The project uses GitHub Actions for continuous integration.

Workflow file: `.github/workflows/ci.yml`

The workflow runs automatically on every push and pull request.

### Pipeline stages

1. Starts a PostgreSQL 16 service for testing.
2. Installs backend dependencies using `npm ci`.
3. Creates the test database schema.
4. Configures the test environment.
5. Runs the backend test suite.
6. Builds the Docker image.
7. Installs frontend dependencies.
8. Builds the React frontend using Vite.

The pipeline verifies backend tests, Docker image creation and frontend production build before changes are merged.

## Architecture

The React frontend sends HTTP requests to the Node.js/Express API. The API validates requests and uses PostgreSQL to store products and reservations.

PostgreSQL performs stock reservations atomically. The `expireReservations()` utility releases expired reservations before relevant API operations.

GitHub Actions runs tests and builds the Docker image. Vercel is planned to host the frontend and backend as separate projects.

In the current setup, the React frontend (`client/`) calls the API through `/api` URLs during local development, proxied to port 3000. The API can run inside a Docker container built from the root `Dockerfile`. GitHub Actions tests the API against a temporary PostgreSQL container and builds the Docker image.

```text
React (Vite)
     |
     | HTTP
     v
Express API
     |
     | SQL
     v
PostgreSQL (Neon)

expireReservations()
runs before relevant product
and reservation operations

GitHub push / PR
     |
     v
GitHub Actions
(tests + Docker build + frontend build)

Vercel
(separate frontend and backend projects)
```

## Deployment

The application is being prepared for deployment on Vercel using two separate projects connected to the same GitHub repository.

The backend and frontend will be deployed independently, with PostgreSQL serving as the persistent database.

### Architecture

| Component | Vercel Root Directory | Technology |
|---|---|---|
| Backend | `server` | Node.js, Express |
| Frontend | `client` | React, Vite |
| Database | External PostgreSQL | PostgreSQL |

### Backend Configuration

The backend Vercel project will use the `server` directory as its root directory.

Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL_POOLED` | Production PostgreSQL pooled connection |
| `DATABASE_URL` | Direct PostgreSQL connection, if required |
| `RESERVATION_TTL_MINUTES` | `10` |

### Frontend Configuration

Build command: `npm run build`

Output directory: `dist`

Environment variable:

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Deployed backend URL, provided the frontend code reads this variable |

### Deployment Checklist

- [ ] Backend deployed
- [ ] Frontend deployed
- [ ] Database connection verified
- [ ] Frontend API connectivity verified
- [ ] Product operations tested
- [ ] Reservation operations tested
- [ ] Production deployment verified

## Current Limitations

1. Authentication and role-based access control are not implemented.
2. Reservation expiry is processed during relevant API operations rather than through a continuously running background scheduler.
3. Reservation history is not currently displayed as a persistent frontend history view.
4. Production deployment and live environment verification are pending.
