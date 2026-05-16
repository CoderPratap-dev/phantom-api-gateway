/**
 * Basic integration tests for Phantom API Gateway
 * Run: node tests/gateway.test.js
 * (Requires gateway running on localhost:3000)
 */

"use strict";

const http = require("http");
const auth = require("../src/middleware/auth");

let passed = 0;
let failed = 0;

async function get(path, headers = {}) {
  return new Promise((resolve) => {
    http.get({ hostname: "localhost", port: 3000, path, headers }, (res) => {
      let body = "";
      res.on("data", d => (body += d));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    }).on("error", () => resolve({ status: 0, body: null }));
  });
}

async function assert(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

function eq(a, b) {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ── Tests ────────────────────────────────────────────────────────────────────

(async () => {
  console.log("\n  Phantom API Gateway — Test Suite\n");

  await assert("JWT sign + verify round-trip", async () => {
    const token = auth.sign({ sub: "user-1", role: "admin" });
    const result = auth.verify({ headers: { authorization: `Bearer ${token}` } });
    eq(result.ok, true);
    eq(result.user.sub, "user-1");
  });

  await assert("JWT rejects tampered token", async () => {
    const token = auth.sign({ sub: "user-1" });
    const tampered = token.slice(0, -3) + "xxx";
    const result = auth.verify({ headers: { authorization: `Bearer ${tampered}` } });
    eq(result.ok, false);
  });

  await assert("JWT rejects missing header", async () => {
    const result = auth.verify({ headers: {} });
    eq(result.ok, false);
  });

  // Live gateway tests (skip if not running)
  const health = await get("/_admin/health");
  if (health.status === 0) {
    console.log("\n  ⚠  Gateway not running — skipping live tests\n");
  } else {
    await assert("Admin health returns 200", async () => {
      eq(health.status, 200);
      eq(health.body.status, "ok");
    });

    await assert("Admin metrics returns stats", async () => {
      const r = await get("/_admin/metrics");
      eq(r.status, 200);
      if (!("total_requests" in r.body)) throw new Error("Missing total_requests");
    });

    await assert("Protected route without token → 401", async () => {
      const r = await get("/users");
      eq(r.status, 401);
    });

    await assert("Unknown route → 404", async () => {
      const r = await get("/totally-unknown-path-xyz");
      eq(r.status, 404);
    });
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
