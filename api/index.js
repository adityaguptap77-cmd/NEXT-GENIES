import app from "../backend/server.js";

export default function handler(req, res) {
  const allowedOrigins = new Set((process.env.FRONTEND_ORIGINS || "").split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean));
  const origin = String(req.headers.origin || "").replace(/\/$/, "");
  if (origin && allowedOrigins.has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "Retry-After, RateLimit, RateLimit-Policy");

  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) return res.status(403).end();
    res.setHeader("Content-Length", "0");
    return res.status(204).end();
  }

  // Ensure leading slash and fallback for root
  if (!req.url || req.url === "/" || req.url === "") {
    req.url = req.method === "POST" ? "/api/contacts" : "/api/ping";
  }

  return app(req, res);
}
