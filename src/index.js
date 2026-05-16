/**
 * Phantom API Gateway
 * High-throughput Node.js reverse proxy with JWT auth, rate limiting,
 * request logging, and health-check aggregation.
 */

"use strict";

const http = require("http");
const https = require("https");
const { URL } = require("url");

const config     = require("./config/gateway.config");
const logger     = require("./middleware/logger");
const auth       = require("./middleware/auth");
const rateLimit  = require("./middleware/rateLimit");
const router     = require("./routes/router");
const metrics    = require("./services/metrics");
const adminRouter = require("./routes/admin");

// ── Bootstrap ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  metrics.incrementTotal();

  // CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Request-ID");
  res.setHeader("X-Gateway", "Phantom/1.0");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // Admin panel (no auth)
  if (req.url.startsWith("/_admin")) {
    return adminRouter.handle(req, res);
  }

  try {
    // 1. Rate limiting
    const rlResult = rateLimit.check(req);
    if (!rlResult.allowed) {
      res.setHeader("Retry-After", rlResult.retryAfter);
      res.setHeader("X-RateLimit-Limit", rlResult.limit);
      res.setHeader("X-RateLimit-Remaining", 0);
      metrics.incrementErrors();
      return sendJSON(res, 429, { error: "Too Many Requests", retryAfter: rlResult.retryAfter });
    }
    res.setHeader("X-RateLimit-Limit", rlResult.limit);
    res.setHeader("X-RateLimit-Remaining", rlResult.remaining);
    res.setHeader("X-RateLimit-Reset", rlResult.reset);

    // 2. Auth (skip public routes)
    const route = router.match(req.method, req.url);
    if (!route) {
      metrics.incrementErrors();
      return sendJSON(res, 404, { error: "Route not found" });
    }

    if (!route.public) {
      const authResult = auth.verify(req);
      if (!authResult.ok) {
        metrics.incrementErrors();
        return sendJSON(res, 401, { error: authResult.error });
      }
      req.user = authResult.user;
    }

    // 3. Proxy to upstream
    const upstream = config.upstreams[route.upstream];
    if (!upstream) {
      metrics.incrementErrors();
      return sendJSON(res, 502, { error: "Upstream not configured" });
    }

    await proxy(req, res, upstream, route, start);

  } catch (err) {
    metrics.incrementErrors();
    logger.error(req, err);
    return sendJSON(res, 500, { error: "Internal Gateway Error" });
  }
});

// ── Proxy ─────────────────────────────────────────────────────────────────

function proxy(clientReq, clientRes, upstream, route, start) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(upstream.url);
    const requestId = clientReq.headers["x-request-id"] || randomId();

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
      path: rewritePath(clientReq.url, route),
      method: clientReq.method,
      headers: {
        ...clientReq.headers,
        host: targetUrl.hostname,
        "x-forwarded-for": getClientIP(clientReq),
        "x-forwarded-proto": "http",
        "x-request-id": requestId,
        "x-gateway-user": clientReq.user ? JSON.stringify(clientReq.user) : "",
      },
    };

    const transport = targetUrl.protocol === "https:" ? https : http;
    const proxyReq = transport.request(options, (proxyRes) => {
      const duration = Date.now() - start;
      metrics.recordLatency(duration);

      clientRes.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        "x-response-time": `${duration}ms`,
        "x-request-id": requestId,
      });

      proxyRes.pipe(clientRes, { end: true });
      logger.access(clientReq, proxyRes.statusCode, duration, requestId, clientReq.user?.sub);
      resolve();
    });

    proxyReq.on("error", (err) => {
      metrics.incrementErrors();
      sendJSON(clientRes, 502, { error: "Upstream unreachable", upstream: route.upstream });
      resolve();
    });

    proxyReq.setTimeout(upstream.timeout || 10_000, () => {
      proxyReq.destroy();
      metrics.incrementErrors();
      sendJSON(clientRes, 504, { error: "Gateway Timeout" });
      resolve();
    });

    clientReq.pipe(proxyReq, { end: true });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────

function sendJSON(res, code, body) {
  if (!res.headersSent) {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}

function rewritePath(url, route) {
  if (!route.rewrite) return url;
  return url.replace(new RegExp(`^${route.prefix}`), route.rewrite);
}

function getClientIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function randomId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

// ── Start ─────────────────────────────────────────────────────────────────

const PORT = config.port || 3000;
server.listen(PORT, () => {
  console.log(`\n  ██████  ██   ██  █████  ███    ██ ████████  ██████  ███    ███`);
  console.log(`  ██   ██ ██   ██ ██   ██ ████   ██    ██    ██    ██ ████  ████`);
  console.log(`  ██████  ███████ ███████ ██ ██  ██    ██    ██    ██ ██ ████ ██`);
  console.log(`  ██      ██   ██ ██   ██ ██  ██ ██    ██    ██    ██ ██  ██  ██`);
  console.log(`  ██      ██   ██ ██   ██ ██   ████    ██     ██████  ██      ██\n`);
  console.log(`  API Gateway  ·  port ${PORT}  ·  ${config.routes.length} routes loaded\n`);
});

server.on("error", (err) => {
  console.error("Server error:", err);
  process.exit(1);
});

process.on("SIGTERM", () => { server.close(() => process.exit(0)); });
process.on("SIGINT",  () => { server.close(() => process.exit(0)); });

module.exports = server;
