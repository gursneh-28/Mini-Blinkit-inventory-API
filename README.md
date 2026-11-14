# Mini Blinkit Inventory API

A full-stack inventory management application inspired by quick-commerce platforms. Users can add products, view available stock, reserve items, confirm reservations, and release reservations. Reservations have a configurable expiry duration of 10 minutes by default.

The goal of this project is to demonstrate Docker, GitHub collaboration, CI/CD, and deployment. The application itself is intentionally kept simple.

GitHub repository: https://github.com/gursneh-28/Mini-Blinkit-inventory-API.git

## Live Deployment

| Component | URL |
|---|---|
| Frontend Application | https://mini-blinkit-inventory-api.vercel.app/ |
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
| Frontend | React 18 + Vite 6 |
| Backend | Node.js 22 + Express 5 |
| Database | PostgreSQL (Neon) |
| Database driver | node-postgres (`pg`) |
| Testing | Node.js built-in test runner + Supertest |
| Containerization | Docker |
| CI/CD | GitHub Actions |
| Deployment | Vercel (separate frontend and backend projects) |
| Version control | Git + GitHub |

**Deployment note:** Docker is used to run and test the backend locally and to build the image in CI. The Vercel deployment uses separate projects for the Express backend and React frontend. The Docker image is not the deployment artifact for these Vercel projects.

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

The backend base URL is `https://mini-blinkit-backend.vercel.app`. The root path `/` is not defined as an API route; use `/api/health` to check API availability.

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

For production, the frontend reads `VITE_API_BASE_URL` and uses it as the backend base URL. Set this variable in the frontend Vercel project to `https://mini-blinkit-backend.vercel.app`. Do not append `/api`; the frontend appends the API paths itself. Redeploy the frontend after changing the variable.

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
- [x] Verify the latest GitHub Actions workflow run successfully (the run for merge commit `051ece9` passed, as shown in the GitHub Actions screenshot).

**Step 6: Simple frontend**

- [x] Build a React page to list products and add new products.
- [x] Add a quantity field and a Reserve button.
- [x] Show reservation success and error messages, including out-of-stock errors.
- [x] Add controls to confirm or release a reservation.

### Member 3: Deployment, documentation and final checks (Steps 7-9)

**Step 7: Vercel deployment**

- [x] Prepare the Express backend entry point for Vercel.
- [x] Verify frontend API base URL support in the frontend code (`VITE_API_BASE_URL`).
- [x] Add frontend and backend environment example files.
- [x] Deploy the backend to Vercel.
- [x] Deploy the frontend to Vercel.
- [ ] Verify production environment variables are present and correct.
- [ ] Verify live API connectivity and complete application functionality.

**Step 8: Complete the README**

- [x] Document local setup and database initialization.
- [x] Document environment variables and test database configuration.
- [x] Document API endpoints and reservation expiry.
- [x] Document automated tests and test coverage.
- [x] Document Docker execution.
- [x] Document GitHub Actions CI/CD.
- [x] Document project architecture and team responsibilities.
- [ ] Replace the frontend URL placeholder with the exact production URL.
- [ ] Verify the README against the final repository and production behavior.

**Step 9: Final verification and release**

- [ ] Test the live application from another browser or device.
- [ ] Verify product creation, reservation, confirmation, release, and expiry.
- [ ] Check that all three members have contributed commits.
- [x] Confirm that `main` has passing CI checks for the latest merged documentation commit shown in GitHub Actions.
- [ ] Create the v1.0 Git tag/release after production verification.

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

The application follows a client-server architecture. The React frontend communicates with the Express REST API over HTTPS. The backend validates requests, applies inventory and reservation business rules, and reads from or writes to PostgreSQL.

PostgreSQL is the persistent source of truth for products and reservations. Stock reservation updates are performed atomically inside database transactions to prevent overselling. The `expireReservations()` utility processes expired `HELD` reservations during relevant API operations.

GitHub Actions runs the backend test suite, builds the Docker image, and builds the frontend. Vercel hosts the frontend and backend as separate projects, while Neon hosts PostgreSQL.

### Application flow

1. A user interacts with the React frontend.
2. The frontend sends an HTTP request to the Express backend.
3. Express validates the request and executes the relevant business logic.
4. The backend uses PostgreSQL to persist product and reservation data.
5. The backend returns a JSON response to the frontend.

### Architecture diagram

```text
User
 |
 v
React + Vite Frontend (Vercel)
 |
 | HTTPS REST API
 v
Node.js + Express Backend (Vercel)
 |
 | SQL queries and transactions
 v
PostgreSQL Database (Neon)

GitHub Repository
 |
 | Push / Pull Request
 v
GitHub Actions
 |
 +--> Backend automated tests
 +--> Docker image build
 +--> Frontend production build
```

### Component responsibilities

| Component | Technology | Responsibility |
|---|---|---|
| Frontend | React 18, Vite 6 | Product listing, product creation, stock reservation and reservation actions |
| Backend | Node.js 22, Express 5 | REST API, request validation and inventory business logic |
| Database | PostgreSQL, Neon | Persistent product and reservation storage |
| Database driver | `pg` | PostgreSQL connectivity and query execution |
| Containerization | Docker | Consistent backend packaging and local execution |
| CI/CD | GitHub Actions | Automated tests and build verification |
| Frontend hosting | Vercel | Frontend production hosting |
| Backend hosting | Vercel | Backend API hosting |
| Version control | Git, GitHub | Source control, branches and pull requests |

## Deployment

The application is deployed using separate Vercel projects for the frontend and backend. Neon PostgreSQL provides persistent database storage.

### Deployment architecture

| Component | Hosting | Project root / configuration | Technology |
|---|---|---|---|
| Frontend | Vercel | `client/` | React, Vite |
| Backend | Vercel | `server/` | Node.js, Express |
| Database | Neon | Managed PostgreSQL instance | PostgreSQL |

### Backend deployment

Production backend base URL:

`https://mini-blinkit-backend.vercel.app`

The backend project is configured with the `server/` directory as its root. Configure these variables in the Vercel project's Production environment:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Direct PostgreSQL connection string |
| `DATABASE_URL_POOLED` | Pooled PostgreSQL connection string; preferred by the application when present |
| `RESERVATION_TTL_MINUTES` | Reservation expiry duration in minutes; use `10` for the default project configuration |

These values must be stored as Vercel environment variables. Never put database credentials in the frontend project or commit them to GitHub. A `PORT` variable is not required for the Vercel backend deployment.

### Frontend deployment

The frontend project uses `client/` as its root directory.

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |
| Production branch | `main` |

Configure this environment variable in the frontend Vercel project's Production environment:

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://mini-blinkit-backend.vercel.app` |

Do not append `/api` to this value. The frontend constructs API paths from the base URL. Redeploy the frontend after changing the environment variable.

### Database

The production database is hosted on Neon PostgreSQL. The backend uses the pooled connection string when available and falls back to the direct connection string. Database credentials must remain server-side.

### Deployment verification

Open the following endpoints to check the deployed backend:

- Health check: <https://mini-blinkit-backend.vercel.app/api/health>
- Products API: <https://mini-blinkit-backend.vercel.app/api/products>

The backend root URL (`https://mini-blinkit-backend.vercel.app/`) is not an API route and may return a `NOT_FOUND` response. Use the `/api/health` and `/api/products` endpoints for verification.

A successful health response confirms that the API process is reachable. A successful products response additionally confirms that the products route can access the database. Complete product and reservation operations through the frontend before marking production verification complete.

### Deployment status checklist

- [x] Backend deployed to Vercel.
- [x] Frontend deployed and displaying product data in the shared screenshot.
- [ ] Confirm the production backend health endpoint returns HTTP 200.
- [ ] Confirm the production products endpoint returns HTTP 200.
- [ ] Confirm the production database connection and persistence.
- [ ] Complete live product and reservation workflow testing.

## Current limitations

1. Authentication and role-based access control are not implemented.
2. Reservation expiry is processed during relevant API operations rather than through a continuously running background scheduler.
3. Reservation history is held in the frontend's current session and is not currently presented as a persistent reservation history view.
4. The production API endpoints and complete live reservation workflow still require final verification.
