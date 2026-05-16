/**
 * Sliding-window rate limiter (in-memory, no Redis dependency for single-node).
 * Swap out the store for a Redis-backed one in multi-node deployments.
 */

"use strict";

const config = require("../config/gateway.config");
const { windowMs, maxRequests, skipList } = config.rateLimit;

// Map<ip, { count: number, windowStart: number }>
const store = new Map();

// Prune stale entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store.entries()) {
    if (now - val.windowStart > windowMs * 2) store.delete(key);
  }
}, 60_000);

/**
 * @returns {{ allowed: boolean, remaining: number, reset: number, retryAfter?: number, limit: number }}
 */
function check(req) {
  const ip = getIP(req);

  if (skipList.includes(ip)) {
    return { allowed: true, remaining: maxRequests, reset: 0, limit: maxRequests };
  }

  const now = Date.now();
  let entry = store.get(ip);

  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { count: 0, windowStart: now };
  }

  entry.count++;
  store.set(ip, entry);

  const remaining = Math.max(0, maxRequests - entry.count);
  const reset     = Math.ceil((entry.windowStart + windowMs) / 1000);

  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, reset, retryAfter, limit: maxRequests };
  }

  return { allowed: true, remaining, reset, limit: maxRequests };
}

function getIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function getStats() {
  const stats = {};
  for (const [ip, val] of store.entries()) {
    stats[ip] = { count: val.count, windowStart: val.windowStart };
  }
  return stats;
}

module.exports = { check, getStats };
