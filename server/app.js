const express = require("express");
const cors = require("cors");
const productsRouter = require("./routes/products");

const app = express();

app.use(cors());
app.use(express.json());

// Health check API
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Mini Blinkit API is running",
  });
});

app.use("/api/products", productsRouter);

// Unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found" },
  });
});

// Error handler
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
    });
  }
  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
});

module.exports = app;