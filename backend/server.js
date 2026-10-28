import express from "express";
import cors from "cors";

const app = express();

// Simple middleware: open CORS and JSON body parser (no extra security / rate limits)
app.use(cors());
app.use(express.json());

// In-memory data
let contacts = [];
let blogs = [
  {
    id: 1,
    title: "Welcome to NextGenies",
    slug: "welcome-to-nextgenies",
    description: "Digital solutions, websites, and growth systems for modern businesses.",
    content: "NextGenies helps modern brands grow with fast websites, clear branding, and strategic marketing.",
    author: "NextGenies Team",
    isPublished: true,
    createdAt: new Date().toISOString(),
  },
];

// Health / Ping
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/ping", (_req, res) => res.json({ status: "ok", message: "pong" }));

// Contact Form Endpoint (used by frontend Contact page)
app.get("/api/contacts", (_req, res) => res.json(contacts));

app.post("/api/contacts", (req, res) => {
  const contact = {
    id: Date.now(),
    fullName: req.body.fullName || "",
    email: req.body.email || "",
    phone: req.body.phone || "",
    company: req.body.company || "",
    service: req.body.service || "",
    needOption: req.body.needOption || "",
    scopePreference: req.body.scopePreference || "",
    timeline: req.body.timeline || "",
    message: req.body.message || "",
    createdAt: new Date().toISOString(),
  };

  contacts.unshift(contact);
  console.log(`[Contact Form] New submission from ${contact.fullName} (${contact.email})`);
  res.status(201).json({ success: true, message: "Inquiry received!", contact });
});

// Blog Endpoints
app.get("/api/blogs", (_req, res) => {
  res.json(blogs.filter((b) => b.isPublished));
});

app.get("/api/blogs/:slug", (req, res) => {
  const blog = blogs.find((b) => b.slug === req.params.slug);
  if (!blog) return res.status(404).json({ message: "Article not found" });
  res.json(blog);
});

// Admin Endpoints (Simple mock auth & management)
app.post("/api/admin/login", (_req, res) => {
  res.json({ token: "admin-token", message: "Logged in successfully" });
});

app.get("/api/admin/contacts", (_req, res) => res.json(contacts));

app.delete("/api/admin/contacts/:id", (req, res) => {
  contacts = contacts.filter((c) => String(c.id) !== String(req.params.id));
  res.json({ success: true });
});

app.get("/api/admin/blogs", (_req, res) => res.json(blogs));

app.post("/api/admin/blogs", (req, res) => {
  const newBlog = {
    id: Date.now(),
    title: req.body.title || "Untitled",
    slug: req.body.slug || `post-${Date.now()}`,
    description: req.body.description || "",
    content: req.body.content || "",
    author: req.body.author || "NextGenies",
    isPublished: Boolean(req.body.isPublished),
    createdAt: new Date().toISOString(),
  };
  blogs.unshift(newBlog);
  res.status(201).json(newBlog);
});

app.put("/api/admin/blogs/:id", (req, res) => {
  const idx = blogs.findIndex((b) => String(b.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ message: "Blog not found" });
  blogs[idx] = { ...blogs[idx], ...req.body };
  res.json(blogs[idx]);
});

app.post("/api/admin/blogs/:id/:action", (req, res) => {
  const blog = blogs.find((b) => String(b.id) === String(req.params.id));
  if (!blog) return res.status(404).json({ message: "Blog not found" });
  if (req.params.action === "publish") blog.isPublished = true;
  if (req.params.action === "unpublish") blog.isPublished = false;
  res.json(blog);
});

app.delete("/api/admin/blogs/:id", (req, res) => {
  blogs = blogs.filter((b) => String(b.id) !== String(req.params.id));
  res.json({ success: true });
});

// Root welcome message
app.get("/", (_req, res) => res.send("NextGenies Backend is running!"));

// Start server when run directly
const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend server running at http://localhost:${PORT}`);
  });
}

export default app;

