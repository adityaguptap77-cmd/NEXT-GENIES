export default function handler(_req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.status(200).json({ status: "ok", message: "pong", time: new Date().toISOString() });
}

