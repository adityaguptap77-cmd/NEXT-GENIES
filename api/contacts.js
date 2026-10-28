import app from "../backend/server.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Length", "0");
    return res.status(200).end();
  }

  req.url = "/api/contacts";
  return app(req, res);
}
