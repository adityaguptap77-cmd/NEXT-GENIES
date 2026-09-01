import "dotenv/config";
import cors from "cors";
import express from "express";
import mysql from "mysql2/promise";

const app = express();
const port = process.env.PORT || 5000;

const requiredDatabaseVariables = [
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
];
console.log("DB_HOST =", process.env.DB_HOST);
console.log("DB_NAME =", process.env.DB_NAME);
console.log("DB_USER =", process.env.DB_USER);
console.log("DB_PASSWORD LENGTH =", process.env.DB_PASSWORD?.length);

// MySQL Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// CORS
const allowedOrigins = [
  "https://nextgenies.com",
  "https://www.nextgenies.com",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));

// Health Check
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected",
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      database: "disconnected",
      message: err.message,
    });
  }
});

// Contact Form
app.post("/api/contacts", async (req, res, next) => {
  try {
    const fullName = req.body?.fullName?.trim();
    const email = req.body?.email?.trim().toLowerCase();
    const service = req.body?.service?.trim();
    const message = req.body?.message?.trim();

    if (!fullName || !email || !service || !message) {
      return res.status(400).json({
        message: "All fields are required.",
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO contacts 
      (full_name, email, service, message)
      VALUES (?, ?, ?, ?)`,
      [fullName, email, service, message]
    );

    res.status(201).json({
      message: "Message received",
      id: result.insertId,
    });
  } catch (error) {
    next(error);
  }
});

// Error Handler
app.use((error, _req, res, _next) => {
  console.error("SERVER ERROR:", error);

  res.status(500).json({
    message: error.message || "Something went wrong",
  });
});

async function startServer() {
  const missing = requiredDatabaseVariables.filter(
    (key) => !process.env[key]
  );

  if (missing.length) {
    throw new Error(`Missing env variables: ${missing.join(", ")}`);
  }

  try {
    await pool.query("SELECT 1");
    console.log("✅ MySQL Connected");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        service VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  } catch (err) {
    console.error("❌ DATABASE ERROR");
    console.error(err);
    process.exit(1);
  }
}

startServer();
