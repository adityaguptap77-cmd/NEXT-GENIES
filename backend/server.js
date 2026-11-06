import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import multer from "multer";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { ROUTE_META } from "../src/seo/routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(projectRoot, ".env") });

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const SITE_URL = (process.env.VITE_SITE_URL || process.env.SITE_URL || "https://nextgenies.com").replace(/\/$/, "");
const distPath = path.join(projectRoot, "dist");
const indexPath = path.join(distPath, "index.html");
const sitemapPath = path.join(distPath, "sitemap.xml");
const frontendReady = existsSync(indexPath);
const JWT_ISSUER = "nextgenies.com";
const JWT_AUDIENCE = "nextgenies-admin";
const BLOG_COLUMNS = "id, title, slug, description, content, author, alt_text, categories, tags, meta_title, meta_description, focus_keywords, additional_keywords, robots_meta, canonical_url, faq_schema, is_published, image_url, image_mime_type, created_at, published_at, updated_at";

if (!frontendReady) {
  console.warn("[frontend] dist/index.html is missing. The API will run, but the website needs `npm run build` before startup.");
}

const configuredOrigins = [...new Set((process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean))];
const allowedOrigins = new Set(configuredOrigins);

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  error.code = code;
  return error;
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) return callback(null, true);
    return callback(httpError(403, "This website origin is not allowed."));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Retry-After", "RateLimit", "RateLimit-Policy"],
  maxAge: 86400,
}));
app.use(express.json({ limit: "1mb" }));

let pool;
let schemaReady;

function getPool() {
  const required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw httpError(503, `Database configuration is incomplete (${missing.join(", ")}).`, "DB_CONFIG_MISSING");
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      waitForConnections: true,
      connectionLimit: 8,
      queueLimit: 0,
      connectTimeout: 10000,
      timezone: "Z",
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
    });
  }
  return pool;
}

async function addMissingColumns(table, definitions) {
  const db = getPool();
  const [rows] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
  const present = new Set(rows.map((row) => row.Field));
  for (const [column, definition] of Object.entries(definitions)) {
    if (!present.has(column)) await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const db = getPool();
    await db.query(`CREATE TABLE IF NOT EXISTS contacts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL DEFAULT '',
      company VARCHAR(150) NOT NULL DEFAULT '',
      service VARCHAR(180) NOT NULL DEFAULT '',
      need_option VARCHAR(180) NOT NULL DEFAULT '',
      scope_preference VARCHAR(180) NOT NULL DEFAULT '',
      timeline VARCHAR(180) NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_contacts_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await db.query(`CREATE TABLE IF NOT EXISTS blogs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(180) NOT NULL,
      slug VARCHAR(180) NOT NULL,
      description VARCHAR(320) NOT NULL,
      content MEDIUMTEXT NOT NULL,
      author VARCHAR(100) NOT NULL DEFAULT 'NextGenies',
      alt_text VARCHAR(180) NOT NULL DEFAULT '',
      categories JSON NULL,
      tags JSON NULL,
      meta_title VARCHAR(180) NOT NULL DEFAULT '',
      meta_description VARCHAR(320) NOT NULL DEFAULT '',
      focus_keywords VARCHAR(500) NOT NULL DEFAULT '',
      additional_keywords VARCHAR(500) NOT NULL DEFAULT '',
      robots_meta VARCHAR(40) NOT NULL DEFAULT 'index, follow',
      canonical_url VARCHAR(2048) NOT NULL DEFAULT '',
      faq_schema JSON NULL,
      is_published TINYINT(1) NOT NULL DEFAULT 0,
      image_data MEDIUMBLOB NULL,
      image_url VARCHAR(2048) NOT NULL DEFAULT '',
      image_mime_type VARCHAR(40) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at DATETIME NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_blogs_slug (slug),
      KEY idx_blogs_visibility (is_published, published_at, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    // Add newer CMS fields to an existing installation without replacing its content.
    await addMissingColumns("contacts", {
      full_name: "VARCHAR(100) NOT NULL DEFAULT ''",
      email: "VARCHAR(255) NOT NULL DEFAULT ''",
      phone: "VARCHAR(50) NOT NULL DEFAULT ''",
      company: "VARCHAR(150) NOT NULL DEFAULT ''",
      service: "VARCHAR(180) NOT NULL DEFAULT ''",
      need_option: "VARCHAR(180) NOT NULL DEFAULT ''",
      scope_preference: "VARCHAR(180) NOT NULL DEFAULT ''",
      timeline: "VARCHAR(180) NOT NULL DEFAULT ''",
      message: "TEXT NULL",
      created_at: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    });
    await addMissingColumns("blogs", {
      title: "VARCHAR(180) NOT NULL DEFAULT ''",
      slug: "VARCHAR(180) NOT NULL DEFAULT ''",
      description: "VARCHAR(320) NOT NULL DEFAULT ''",
      content: "MEDIUMTEXT NULL",
      author: "VARCHAR(100) NOT NULL DEFAULT 'NextGenies'",
      alt_text: "VARCHAR(180) NOT NULL DEFAULT ''",
      categories: "JSON NULL",
      tags: "JSON NULL",
      meta_title: "VARCHAR(180) NOT NULL DEFAULT ''",
      meta_description: "VARCHAR(320) NOT NULL DEFAULT ''",
      focus_keywords: "VARCHAR(500) NOT NULL DEFAULT ''",
      additional_keywords: "VARCHAR(500) NOT NULL DEFAULT ''",
      robots_meta: "VARCHAR(40) NOT NULL DEFAULT 'index, follow'",
      canonical_url: "VARCHAR(2048) NOT NULL DEFAULT ''",
      faq_schema: "JSON NULL",
      is_published: "TINYINT(1) NOT NULL DEFAULT 0",
      image_data: "MEDIUMBLOB NULL",
      image_url: "VARCHAR(2048) NOT NULL DEFAULT ''",
      image_mime_type: "VARCHAR(40) NULL",
      created_at: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
      published_at: "DATETIME NULL",
      updated_at: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    });
    const [blogIndexes] = await db.query("SHOW INDEX FROM blogs");
    if (!blogIndexes.some((row) => row.Key_name === "idx_blogs_slug" || row.Key_name === "uq_blogs_slug")) {
      await db.query("CREATE INDEX idx_blogs_slug ON blogs (slug)");
    }
    const [contactIndexes] = await db.query("SHOW INDEX FROM contacts");
    if (!contactIndexes.some((row) => row.Key_name === "idx_contacts_created_at")) {
      await db.query("CREATE INDEX idx_contacts_created_at ON contacts (created_at)");
    }
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function databaseCheck() {
  await ensureSchema();
  await getPool().query("SELECT 1");
}

function safeEqual(candidate, expected) {
  const left = Buffer.from(String(candidate ?? ""));
  const right = Buffer.from(String(expected ?? ""));
  if (left.length !== right.length) {
    timingSafeEqual(Buffer.alloc(right.length), right);
    return false;
  }
  return timingSafeEqual(left, right);
}

function jwtSecret() {
  const secret = process.env.ADMIN_JWT_SECRET || "";
  if (Buffer.byteLength(secret) < 32) throw httpError(503, "Admin JWT signing is not configured safely. Set ADMIN_JWT_SECRET to at least 32 characters.", "JWT_CONFIG_MISSING");
  return secret;
}

function requireAdmin(req, _res, next) {
  try {
    const secret = jwtSecret();
    const token = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "")?.[1];
    if (!token) throw httpError(401, "Admin sign-in is required.");
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"], issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    if (payload.role !== "admin" || payload.sub !== process.env.ADMIN_USERNAME) throw httpError(401, "Admin session is invalid.");
    req.admin = { username: payload.sub };
    next();
  } catch (error) {
    if (error.status) return next(error);
    return next(httpError(401, "Admin session is invalid or expired."));
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many sign-in attempts. Please wait before trying again." },
});
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many submissions. Please wait and try again." },
});

const smtpRecipients = () => [process.env.EMAIL_TO, process.env.EMAIL_TO2, process.env.EMAIL_TO3]
  .flatMap((value) => (value || "").split(/[;,]/))
  .map((value) => value.trim())
  .filter(Boolean);

function smtpConfiguration() {
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];
  const missing = required.filter((key) => !process.env[key]);
  if (!smtpRecipients().length) missing.push("EMAIL_TO");
  const port = Number(process.env.SMTP_PORT) || 587;
  return {
    configured: missing.length === 0,
    missing,
    host: process.env.SMTP_HOST || "",
    port,
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465,
    username: process.env.SMTP_USER || "",
    from: process.env.EMAIL_FROM || "",
    recipientCount: smtpRecipients().length,
  };
}

function createSmtpTransport() {
  const cfg = smtpConfiguration();
  if (!cfg.configured) throw httpError(503, `SMTP configuration is incomplete (${cfg.missing.join(", ")}).`, "SMTP_CONFIG_MISSING");
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
}

async function checkSmtp() {
  const cfg = smtpConfiguration();
  if (!cfg.configured) return { ...cfg, verified: false, error: "SMTP is missing required configuration." };
  try {
    await createSmtpTransport().verify();
    return { ...cfg, verified: true, error: "" };
  } catch (error) {
    return { ...cfg, verified: false, error: error.code || "SMTP connection or authentication failed." };
  }
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const raw = String(value);
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function blogFromRow(row) {
  if (!row) return null;
  const id = Number(row.id);
  const isPublished = row.is_published === true || row.is_published === 1 || String(row.is_published) === "1";
  return {
    id: Number.isSafeInteger(id) ? id : String(row.id),
    title: row.title || "",
    slug: row.slug || "",
    description: row.description || "",
    content: row.content || "",
    author: row.author || "NextGenies",
    altText: row.alt_text || "",
    categories: parseJson(row.categories, []),
    tags: parseJson(row.tags, []),
    metaTitle: row.meta_title || "",
    metaDescription: row.meta_description || "",
    focusKeywords: row.focus_keywords || "",
    additionalKeywords: row.additional_keywords || "",
    robotsMeta: row.robots_meta || "index, follow",
    canonicalUrl: row.canonical_url || "",
    faq: parseJson(row.faq_schema, []),
    isPublished,
    imageUrl: isPublished ? row.image_mime_type ? `/api/blogs/${encodeURIComponent(row.id)}/image` : row.image_url || "" : "",
    createdAt: parseDate(row.created_at),
    publishedAt: parseDate(row.published_at),
    updatedAt: parseDate(row.updated_at),
  };
}

async function getBlogById(id) {
  const db = getPool();
  const [rows] = await db.execute(`SELECT ${BLOG_COLUMNS} FROM blogs WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function getBlogBySlug(slug, publishedOnly = true) {
  const db = getPool();
  const [rows] = await db.execute(
    `SELECT ${BLOG_COLUMNS} FROM blogs WHERE slug = ?${publishedOnly ? " AND is_published = 1" : ""} LIMIT 1`,
    [slug],
  );
  return rows[0] || null;
}

async function getBlogs(publishedOnly = false) {
  await ensureSchema();
  const db = getPool();
  const [rows] = await db.query(
    `SELECT ${BLOG_COLUMNS} FROM blogs${publishedOnly ? " WHERE is_published = 1" : ""} ORDER BY COALESCE(published_at, created_at) DESC, id DESC`,
  );
  return rows.map(blogFromRow);
}

function contactFromRow(row) {
  const id = Number(row.id);
  return {
    id: Number.isSafeInteger(id) ? id : String(row.id),
    fullName: row.full_name || "",
    email: row.email || "",
    phone: row.phone || "",
    company: row.company || "",
    service: row.service || "",
    needOption: row.need_option || "",
    scopePreference: row.scope_preference || "",
    timeline: row.timeline || "",
    message: row.message || "",
    createdAt: parseDate(row.created_at),
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) {
      return callback(httpError(400, "Use a JPEG, PNG, WebP or GIF image."));
    }
    callback(null, true);
  },
});

function validImageSignature(file) {
  if (!file) return true;
  const b = file.buffer;
  if (file.mimetype === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (file.mimetype === "image/png") return b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === "image/gif") return ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("ascii"));
  if (file.mimetype === "image/webp") return b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function splitList(value, maxItems = 30, maxLength = 80) {
  const parsed = Array.isArray(value) ? value : typeof value === "string" && value.trim().startsWith("[") ? parseJson(value, null) : null;
  const values = Array.isArray(parsed) ? parsed : String(value || "").split(",");
  return [...new Set(values.map((item) => String(item).trim().slice(0, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function parseFaq(value) {
  const parsed = Array.isArray(value) ? value : parseJson(value, null);
  if (!Array.isArray(parsed)) throw httpError(400, "FAQs must be valid JSON question and answer items.");
  return parsed.slice(0, 50).map((item) => ({
    question: String(item?.question || "").trim().slice(0, 500),
    answer: String(item?.answer || "").trim().slice(0, 4000),
  })).filter((item) => item.question && item.answer);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
    .replace(/-+$/g, "");
}

function blogInput(body) {
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const content = String(body.content || "");
  if (!title || !description || !content.trim()) throw httpError(400, "Title, SEO description, and article content are required.");
  if (title.length > 180 || description.length > 320 || content.length > 50000) throw httpError(400, "One or more blog fields exceed the allowed length.");
  const slug = slugify(body.slug || title);
  if (!slug) throw httpError(400, "Enter a valid URL slug or title.");
  const robotsMeta = ["index, follow", "noindex, follow", "index, nofollow", "noindex, nofollow"].includes(body.robotsMeta)
    ? body.robotsMeta
    : "index, follow";
  const canonicalUrl = String(body.canonicalUrl || "").trim();
  if (canonicalUrl) {
    try {
      if (!["http:", "https:"].includes(new URL(canonicalUrl).protocol)) throw new Error("protocol");
    } catch { throw httpError(400, "Canonical URL must be a valid HTTP or HTTPS URL."); }
  }
  return {
    title,
    slug,
    description,
    content,
    author: String(body.author || "NextGenies").trim().slice(0, 100) || "NextGenies",
    altText: String(body.altText || "").trim().slice(0, 180),
    categories: splitList(body.categories),
    tags: splitList(body.tags),
    metaTitle: String(body.metaTitle || "").trim().slice(0, 180),
    metaDescription: String(body.metaDescription || "").trim().slice(0, 320),
    focusKeywords: String(body.focusKeywords || "").trim().slice(0, 500),
    additionalKeywords: String(body.additionalKeywords || "").trim().slice(0, 500),
    robotsMeta,
    canonicalUrl: canonicalUrl.slice(0, 2048),
    faq: parseFaq(body.faq || "[]"),
    isPublished: [true, 1, "1", "true", "on"].includes(body.isPublished),
  };
}

async function persistBlog(req, res, isUpdate) {
  await ensureSchema();
  if (!validImageSignature(req.file)) throw httpError(400, "The selected file is not a valid image of its declared type.");
  const values = blogInput(req.body || {});
  const db = getPool();
  let current = null;
  if (isUpdate) {
    if (!/^\d+$/.test(String(req.params.id))) throw httpError(404, "Blog not found.");
    current = await getBlogById(req.params.id);
    if (!current) throw httpError(404, "Blog not found.");
  }
  const [conflicts] = await db.execute("SELECT id FROM blogs WHERE slug = ? AND id <> ? LIMIT 1", [values.slug, current?.id || 0]);
  if (conflicts.length) throw httpError(409, "That URL slug is already in use. Choose a different slug.");

  const common = [
    values.title, values.slug, values.description, values.content, values.author, values.altText,
    JSON.stringify(values.categories), JSON.stringify(values.tags), values.metaTitle, values.metaDescription,
    values.focusKeywords, values.additionalKeywords, values.robotsMeta, values.canonicalUrl,
    JSON.stringify(values.faq), values.isPublished ? 1 : 0,
  ];
  let id;
  if (isUpdate) {
    const hasImage = Boolean(req.file);
    await db.execute(`UPDATE blogs SET
      title=?, slug=?, description=?, content=?, author=?, alt_text=?, categories=?, tags=?, meta_title=?,
      meta_description=?, focus_keywords=?, additional_keywords=?, robots_meta=?, canonical_url=?, faq_schema=?,
      is_published=?, image_data=IF(?, ?, image_data), image_mime_type=IF(?, ?, image_mime_type),
      published_at=CASE WHEN ?=0 THEN NULL WHEN published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END
      WHERE id=?`, [
      ...common, hasImage ? 1 : 0, req.file?.buffer || null, hasImage ? 1 : 0, req.file?.mimetype || null,
      values.isPublished ? 1 : 0, req.params.id,
    ]);
    id = req.params.id;
  } else {
    const [result] = await db.execute(`INSERT INTO blogs
      (title, slug, description, content, author, alt_text, categories, tags, meta_title, meta_description,
       focus_keywords, additional_keywords, robots_meta, canonical_url, faq_schema, is_published, image_data, image_mime_type, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(?=1, CURRENT_TIMESTAMP, NULL))`, [
      ...common, req.file?.buffer || null, req.file?.mimetype || null, values.isPublished ? 1 : 0,
    ]);
    id = result.insertId;
  }
  const saved = await getBlogById(id);
  res.status(isUpdate ? 200 : 201).json({ success: true, message: isUpdate ? "Blog updated." : values.isPublished ? "Blog published." : "Draft saved.", blog: blogFromRow(saved) });
}

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeXml(value = "") {
  return escapeHtml(value);
}

function canonicalFor(pathname) {
  return pathname === "/" ? `${SITE_URL}/` : `${SITE_URL}${pathname.replace(/\/$/, "")}/`;
}

function renderCrawlerPage({ title, description, canonical, robots = "index, follow", image, keywords, jsonLd, body }) {
  const template = readFileSync(indexPath, "utf8");
  const fullTitle = `${title} | NextGenies`;
  const imageUrl = image || `${SITE_URL}/og-image.png`;
  const ld = `<script type="application/ld+json" id="ld-page">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`;
  const head = [
    `<title>${escapeHtml(fullTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}" />` : "",
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta name="robots" content="${escapeHtml(robots)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="NextGenies" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(fullTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(fullTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`,
    ld,
  ].join("\n    ");
  const html = template
    .replace(/<!-- seo -->[\s\S]*?<!-- \/seo -->/, `<!-- seo -->\n    ${head}\n    <!-- /seo -->`)
    .replace(/<div id="root">[\s\S]*?<\/div>/, `<div id="root">${body}</div>`);
  return html;
}

function blogFallback(blog) {
  const paragraphs = String(blog.content || "").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br />")}</p>`).join("\n");
  const image = blog.imageUrl
    ? `<img src="${escapeHtml(`${SITE_URL}${blog.imageUrl}`)}" alt="${escapeHtml(blog.altText || blog.title)}" style="max-width:100%;height:auto" />`
    : "";
  return `<main style="max-width:760px;margin:0 auto;padding:96px 20px;font-family:system-ui,sans-serif"><nav><a href="/">Home</a> / <a href="/blogs/">Blogs</a></nav><article><h1>${escapeHtml(blog.title)}</h1><p>${escapeHtml(blog.description)}</p><p>By ${escapeHtml(blog.author)}</p>${image}${paragraphs}</article></main>`;
}

// Liveness is separate from readiness; /api/health reports DB readiness for deployment checks.
app.get("/api/ping", (_req, res) => res.json({ status: "ok", message: "pong" }));
app.get("/api/health", async (_req, res) => {
  try {
    await databaseCheck();
    res.json({ status: "ok", database: "mysql", frontend: frontendReady ? "ready" : "missing" });
  } catch (error) {
    console.error("[health] database check failed:", error.code || "DATABASE_ERROR");
    res.status(503).json({ status: "degraded", database: "unavailable", frontend: frontendReady ? "ready" : "missing" });
  }
});

app.post("/api/admin/login", loginLimiter, (req, res, next) => {
  try {
    const username = String(req.body?.username || "");
    const password = String(req.body?.password || "");
    const expectedUser = process.env.ADMIN_USERNAME || "";
    const expectedPassword = process.env.ADMIN_PASSWORD || "";
    if (!expectedUser || !expectedPassword) throw httpError(503, "Admin credentials are not configured.", "ADMIN_CONFIG_MISSING");
    const validUser = safeEqual(username, expectedUser);
    const validPassword = safeEqual(password, expectedPassword);
    if (!validUser || !validPassword) throw httpError(401, "Invalid username or password.");
    const token = jwt.sign({ role: "admin" }, jwtSecret(), {
      algorithm: "HS256",
      subject: expectedUser,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: "8h",
    });
    res.json({ token, message: "Logged in successfully" });
  } catch (error) { next(error); }
});

app.use("/api/admin", requireAdmin);

app.get("/api/admin/system-status", async (_req, res) => {
  const dbState = await Promise.allSettled([databaseCheck()]);
  const smtp = await checkSmtp();
  const dbMissing = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"].filter((key) => !process.env[key]);
  res.json({
    database: {
      configured: dbMissing.length === 0,
      connected: dbState[0].status === "fulfilled",
      name: process.env.DB_NAME || "",
      host: process.env.DB_HOST || "",
      missing: dbMissing,
      error: dbState[0].status === "rejected" ? (dbState[0].reason?.code || "Database connection failed.") : "",
    },
    smtp,
    cors: { allowedOrigins: configuredOrigins },
    frontend: { built: frontendReady },
    checkedAt: new Date().toISOString(),
  });
});

app.get("/api/admin/contacts", async (_req, res) => {
  await ensureSchema();
  const [rows] = await getPool().query("SELECT id, full_name, email, phone, company, service, need_option, scope_preference, timeline, message, created_at FROM contacts ORDER BY created_at DESC, id DESC");
  res.json(rows.map(contactFromRow));
});

app.delete("/api/admin/contacts/:id", async (req, res) => {
  await ensureSchema();
  if (!/^\d+$/.test(String(req.params.id))) throw httpError(404, "Contact not found.");
  const [result] = await getPool().execute("DELETE FROM contacts WHERE id = ?", [req.params.id]);
  if (!result.affectedRows) throw httpError(404, "Contact not found.");
  res.json({ success: true });
});

app.get("/api/admin/blogs", async (_req, res) => res.json(await getBlogs(false)));
app.post("/api/admin/blogs", upload.single("image"), (req, res, next) => persistBlog(req, res, false).catch(next));
app.put("/api/admin/blogs/:id", upload.single("image"), (req, res, next) => persistBlog(req, res, true).catch(next));

app.post("/api/admin/blogs/:id/:action", async (req, res) => {
  await ensureSchema();
  if (!/^\d+$/.test(String(req.params.id))) throw httpError(404, "Blog not found.");
  if (!["publish", "unpublish"].includes(req.params.action)) throw httpError(400, "Unsupported blog action.");
  const publish = req.params.action === "publish";
  const [result] = await getPool().execute(`UPDATE blogs SET is_published=?, published_at=CASE WHEN ?=0 THEN NULL WHEN published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END WHERE id=?`, [publish ? 1 : 0, publish ? 1 : 0, req.params.id]);
  if (!result.affectedRows) throw httpError(404, "Blog not found.");
  res.json({ success: true, message: publish ? "Blog published." : "Blog unpublished." });
});

app.delete("/api/admin/blogs/:id", async (req, res) => {
  await ensureSchema();
  if (!/^\d+$/.test(String(req.params.id))) throw httpError(404, "Blog not found.");
  const [result] = await getPool().execute("DELETE FROM blogs WHERE id=?", [req.params.id]);
  if (!result.affectedRows) throw httpError(404, "Blog not found.");
  res.json({ success: true });
});

app.post("/api/contacts", contactLimiter, async (req, res) => {
  await ensureSchema();
  const body = req.body || {};
  const contact = {
    fullName: String(body.fullName || "").trim(),
    email: String(body.email || "").trim(),
    phone: String(body.phone || "").trim(),
    company: String(body.company || "").trim(),
    service: String(body.service || "").trim(),
    needOption: String(body.needOption || "").trim(),
    scopePreference: String(body.scopePreference || "").trim(),
    timeline: String(body.timeline || "").trim(),
    message: String(body.message || "").trim(),
  };
  if (contact.fullName.length < 2 || contact.fullName.length > 100) throw httpError(400, "Please enter a name between 2 and 100 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) || contact.email.length > 255) throw httpError(400, "Please enter a valid email address.");
  if (contact.phone.length > 50 || contact.company.length > 150 || contact.service.length > 180 || contact.needOption.length > 180 || contact.scopePreference.length > 180 || contact.timeline.length > 180 || contact.message.length > 12000) {
    throw httpError(400, "One or more contact fields exceed the allowed length.");
  }
  const [result] = await getPool().execute(`INSERT INTO contacts
    (full_name, email, phone, company, service, need_option, scope_preference, timeline, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    contact.fullName, contact.email, contact.phone, contact.company, contact.service,
    contact.needOption, contact.scopePreference, contact.timeline, contact.message,
  ]);
  let notification = "sent";
  try {
    const cfg = smtpConfiguration();
    if (!cfg.configured) throw httpError(503, "SMTP is not configured.", "SMTP_CONFIG_MISSING");
    await createSmtpTransport().sendMail({
      from: process.env.EMAIL_FROM,
      to: smtpRecipients(),
      replyTo: contact.email,
      subject: `New website inquiry from ${contact.fullName}`,
      text: [
        `Name: ${contact.fullName}`,
        `Email: ${contact.email}`,
        `Phone: ${contact.phone || "Not provided"}`,
        `Company: ${contact.company || "Not provided"}`,
        `Service: ${contact.service || "Not provided"}`,
        `Need: ${contact.needOption || "Not provided"}`,
        `Scope: ${contact.scopePreference || "Not provided"}`,
        `Timeline: ${contact.timeline || "Not provided"}`,
        "",
        "Message:",
        contact.message || "No additional notes.",
        `Submission ID: ${result.insertId}`,
      ].join("\n"),
    });
  } catch (error) {
    notification = "failed";
    console.error("[email] contact notification failed:", error.code || "SMTP_ERROR");
  }
  res.status(201).json({ success: true, message: "Inquiry received.", id: result.insertId, notification });
});

app.get("/api/blogs", async (_req, res) => res.json(await getBlogs(true)));
app.get("/api/blogs/:id/image", async (req, res) => {
  await ensureSchema();
  if (!/^\d+$/.test(String(req.params.id))) throw httpError(404, "Image not found.");
  const [rows] = await getPool().execute("SELECT image_data, image_mime_type FROM blogs WHERE id=? AND is_published=1 LIMIT 1", [req.params.id]);
  if (!rows[0]?.image_data) throw httpError(404, "Image not found.");
  res.set({ "Content-Type": rows[0].image_mime_type || "application/octet-stream", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400", "X-Content-Type-Options": "nosniff" });
  res.send(rows[0].image_data);
});
app.get("/api/blogs/:slug", async (req, res) => {
  await ensureSchema();
  const blog = await getBlogBySlug(req.params.slug, true);
  if (!blog) throw httpError(404, "Article not found.");
  res.json(blogFromRow(blog));
});

app.use("/api", (_req, res) => res.status(404).json({ message: "API route not found." }));

app.get("/sitemap.xml", async (_req, res) => {
  try {
    const blogs = await getBlogs(true);
    const today = new Date().toISOString().slice(0, 10);
    const toDay = (value) => parseDate(value)?.slice(0, 10) || today;
    const urls = ROUTE_META.map((route) => ({ loc: canonicalFor(route.path), lastmod: today, changefreq: route.changefreq, priority: route.priority }));
    for (const blog of blogs) {
      if (String(blog.robotsMeta).toLowerCase().includes("noindex")) continue;
      urls.push({
        loc: blog.canonicalUrl || canonicalFor(`/blogs/${blog.slug}`),
        lastmod: toDay(blog.updatedAt || blog.publishedAt || blog.createdAt),
        changefreq: "monthly",
        priority: 0.7,
      });
    }
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((item) => `  <url><loc>${escapeXml(item.loc)}</loc><lastmod>${item.lastmod}</lastmod><changefreq>${item.changefreq}</changefreq><priority>${Number(item.priority).toFixed(1)}</priority></url>`).join("\n")}\n</urlset>\n`);
  } catch (error) {
    if (existsSync(sitemapPath)) return res.type("application/xml").sendFile(sitemapPath);
    throw error;
  }
});

app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(`# NextGenies crawler rules\nUser-agent: *\nAllow: /\nAllow: /api/blogs/*/image\nDisallow: /api/\nDisallow: /admin\nDisallow: /admin/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

// Serve current DB-backed post metadata/content to crawlers too, so publishing or editing a post updates SEO immediately.
app.get("/blogs/:slug", async (req, res, next) => {
  if (!frontendReady) return next();
  await ensureSchema();
  const row = await getBlogBySlug(req.params.slug, true);
  if (!row) {
    const canonical = canonicalFor(`/blogs/${req.params.slug}`);
    const html = renderCrawlerPage({
      title: "Article not found",
      description: "This article could not be found.",
      canonical,
      robots: "noindex, follow",
      jsonLd: {},
      body: `<main style="max-width:760px;margin:0 auto;padding:96px 20px;font-family:system-ui,sans-serif"><h1>Article not found</h1><p>This article may have been unpublished or removed.</p><a href="/blogs/">All articles</a></main>`,
    });
    return res.status(404).type("html").send(html);
  }
  const blog = blogFromRow(row);
  const pagePath = `/blogs/${blog.slug}`;
  const canonical = blog.canonicalUrl || canonicalFor(pagePath);
  const image = blog.imageUrl ? `${SITE_URL}${blog.imageUrl}` : `${SITE_URL}/og-image.png`;
  const faq = Array.isArray(blog.faq) ? blog.faq : [];
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: canonicalFor("/") },
      { "@type": "ListItem", position: 2, name: "Blogs", item: canonicalFor("/blogs") },
      { "@type": "ListItem", position: 3, name: blog.title, item: canonical },
    ] },
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: blog.title,
      description: blog.metaDescription || blog.description,
      image: blog.imageUrl ? [image] : undefined,
      datePublished: blog.publishedAt || blog.createdAt,
      dateModified: blog.updatedAt,
      author: { "@type": "Person", name: blog.author },
      publisher: { "@type": "Organization", name: "NextGenies", logo: { "@type": "ImageObject", url: `${SITE_URL}/ng-logo-transparent.png` } },
      mainEntityOfPage: canonical,
    },
    ...(faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((item) => ({
      "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer },
    })) }] : []),
  ];
  const html = renderCrawlerPage({
    title: blog.metaTitle || blog.title,
    description: blog.metaDescription || blog.description,
    canonical,
    robots: blog.robotsMeta || "index, follow",
    image,
    keywords: [blog.focusKeywords, blog.additionalKeywords].filter(Boolean).join(", "),
    jsonLd,
    body: blogFallback(blog),
  });
  res.set("Cache-Control", "no-cache").type("html").send(html);
});

if (frontendReady) app.use(express.static(distPath, { index: false, fallthrough: true }));
app.get(/^(?!\/api(?:\/|$)).*/, (_req, res, next) => {
  if (!frontendReady) return res.status(503).type("text/plain").send("The website frontend is not built. Run npm run build before starting the server.");
  res.sendFile(indexPath, (error) => { if (error) next(error); });
});

app.use((error, _req, res, next) => {
  const status = Number(error.status) || (error instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error("[request] failed:", error.code || error.name || "SERVER_ERROR");
  const message = error.publicMessage || (error instanceof multer.MulterError
    ? error.code === "LIMIT_FILE_SIZE" ? "Image is larger than 5 MB." : "The uploaded file could not be processed."
    : status === 500 ? "The server could not complete the request." : error.message);
  if (res.headersSent) return next(error);
  res.status(status).json({ message });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Backend server running on port ${PORT}`));
}

export default app;
