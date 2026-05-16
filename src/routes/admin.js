"use strict";

const metrics   = require("../services/metrics");
const rateLimit = require("../middleware/rateLimit");
const auth      = require("../middleware/auth");
const config    = require("../config/gateway.config");

function sendJSON(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

function handle(req, res) {
  const url = req.url.replace("/_admin", "") || "/";

  if (url === "/" || url === "") {
    return sendJSON(res, 200, {
      routes: [
        "GET /_admin/health",
        "GET /_admin/metrics",
        "GET /_admin/routes",
        "GET /_admin/rate-limits",
        "POST /_admin/token  (body: {sub, role})",
      ],
    });
  }

  if (url === "/health") {
    return sendJSON(res, 200, {
      status: "ok",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  }

  if (url === "/metrics") {
    return sendJSON(res, 200, metrics.snapshot());
  }

  if (url === "/routes") {
    return sendJSON(res, 200, config.routes);
  }

  if (url === "/rate-limits") {
    return sendJSON(res, 200, rateLimit.getStats());
  }

  if (url === "/token" && req.method === "POST") {
    let body = "";
    req.on("data", d => (body += d));
    req.on("end", () => {
      try {
        const { sub = "test-user", role = "user" } = JSON.parse(body || "{}");
        const token = auth.sign({ sub, role });
        return sendJSON(res, 200, { token, sub, role });
      } catch {
        return sendJSON(res, 400, { error: "Invalid JSON body" });
      }
    });
    return;
  }

  sendJSON(res, 404, { error: "Admin route not found" });
}

module.exports = { handle };
