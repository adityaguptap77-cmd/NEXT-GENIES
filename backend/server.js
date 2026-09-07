
import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });
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
console.log("DB_PASSWORD =", process.env.DB_PASSWORD ? "[CONFIGURED]" : "[MISSING]");

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

const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER;
const emailRecipients = [
  process.env.EMAIL_TO,
  process.env.EMAIL_TO2,
  process.env.EMAIL_TO3,
].filter(Boolean);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: (process.env.SMTP_PORT || "587") === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendContactEmails({ fullName, email, phone, service, message }) {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS ||
    !emailRecipients.length
  ) {
    throw new Error(
      "Email configuration is missing. Please configure SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_TO."
    );
  }

  const userSubject = `Thanks for reaching out, ${fullName}!`;
  const userHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="color: #111827;">Hi ${fullName},</h2>
      <p>Thanks for reaching out to NextGenies.</p>
      <p>We have received your message and will connect with you shortly.</p>
      <p>Here is a quick summary of your request:</p>
      <ul>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Phone:</strong> ${phone}</li>
        <li><strong>Service:</strong> ${service}</li>
      </ul>
      <p>We’ll get back to you soon.</p>
      <p>Best regards,<br />NextGenies Team</p>
    </div>
  `;

  const adminHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="color: #111827;">New contact form submission</h2>
      <p><strong>Name:</strong> ${fullName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Service:</strong> ${service}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, "<br />")}</p>
    </div>
  `;

  await transporter.sendMail({
    from: emailFrom,
    to: email,
    replyTo: email,
    subject: userSubject,
    html: userHtml,
  });

  await transporter.sendMail({
    from: emailFrom,
    to: emailRecipients,
    subject: `New inquiry from ${fullName}`,
    html: adminHtml,
  });
}

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
    const phone = req.body?.phone?.trim();
    const service = req.body?.service?.trim();
    const message = req.body?.message?.trim();

    if (!fullName || !email || !phone || !service || !message) {
      return res.status(400).json({
        message: "All fields are required.",
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO contacts 
      (full_name, email, phone, service, message)
      VALUES (?, ?, ?, ?, ?)`,
      [fullName, email, phone, service, message]
    );

    await sendContactEmails({ fullName, email, phone, service, message });

    res.status(201).json({
      message: "Message received",
      id: result.insertId,
    });
// Serve static SPA files
app.use(express.static(path.join(__dirname, "..", "dist")));

// SPA fallback for non‑API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "dist", "index.html"));
});
  } catch (error) {
    next(error);
  }
});

// Error Handler
// eslint-disable-next-line no-unused-vars
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
        phone VARCHAR(30) NOT NULL,
        service VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NOT NULL DEFAULT ''
    `);

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await transporter.verify();
        console.log("✅ SMTP Connected");
      } catch (smtpError) {
        console.error("❌ SMTP ERROR");
        console.error(smtpError);
      }
    } else {
      console.log("⚠️ SMTP is not configured. Contact emails will not be sent.");
    }

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
