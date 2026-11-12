const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Health check API
app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Mini Blinkit API is running",
  });
});

module.exports = app;