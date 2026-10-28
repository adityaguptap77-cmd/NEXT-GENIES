import app from "../backend/server.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Length", "0");
    return res.status(200).end();
  }

  // Ensure leading slash and fallback for root
  if (!req.url || req.url === "/" || req.url === "") {
    req.url = req.method === "POST" ? "/api/contacts" : "/api/ping";
  }

  return app(req, res);
}
