/**
 * Gateway configuration
 * Edit this file to define routes, upstreams, and rate limits.
 */

module.exports = {
  port: parseInt(process.env.PORT || "3000", 10),

  // ── JWT ──────────────────────────────────────────────────────────────────
  jwt: {
    secret: process.env.JWT_SECRET || "change-me-in-production-use-env-var",
    algorithm: "HS256",
    expiresIn: "1h",
  },

  // ── Rate limiting ────────────────────────────────────────────────────────
  rateLimit: {
    windowMs: 60_000,        // 1 minute
    maxRequests: 100,        // per IP per window
    skipList: ["127.0.0.1"], // IPs to never limit
  },

  // ── Upstream services ─────────────────────────────────────────────────────
  upstreams: {
    users: {
      url: process.env.UPSTREAM_USERS || "http://localhost:4001",
      timeout: 8000,
    },
    products: {
      url: process.env.UPSTREAM_PRODUCTS || "http://localhost:4002",
      timeout: 8000,
    },
    orders: {
      url: process.env.UPSTREAM_ORDERS || "http://localhost:4003",
      timeout: 12000,
    },
    echo: {
      url: process.env.UPSTREAM_ECHO || "http://httpbin.org",
      timeout: 10000,
    },
  },

  // ── Routes ───────────────────────────────────────────────────────────────
  // public: true  → skip JWT verification
  // rewrite       → strip prefix before forwarding
  routes: [
    // Auth (public)
    { method: "POST", prefix: "/auth/login",    upstream: "users",    public: true,  rewrite: "/api/auth/login" },
    { method: "POST", prefix: "/auth/register", upstream: "users",    public: true,  rewrite: "/api/auth/register" },

    // Users (protected)
    { method: "GET",   prefix: "/users",  upstream: "users",    public: false, rewrite: "/api/users" },
    { method: "PATCH", prefix: "/users",  upstream: "users",    public: false, rewrite: "/api/users" },

    // Products (protected)
    { method: "GET",  prefix: "/products", upstream: "products", public: false, rewrite: "/api/products" },
    { method: "POST", prefix: "/products", upstream: "products", public: false, rewrite: "/api/products" },

    // Orders (protected)
    { method: "GET",  prefix: "/orders", upstream: "orders", public: false, rewrite: "/api/orders" },
    { method: "POST", prefix: "/orders", upstream: "orders", public: false, rewrite: "/api/orders" },

    // Echo (public — for testing)
    { method: "GET",  prefix: "/echo",   upstream: "echo", public: true },
    { method: "POST", prefix: "/echo",   upstream: "echo", public: true },
  ],
};
