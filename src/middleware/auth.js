/**
 * JWT Authentication Middleware
 * Verifies Bearer tokens using HS256 without external dependencies.
 */

"use strict";

const crypto = require("crypto");
const config = require("../config/gateway.config");

// ── Pure JS JWT verify (no dependencies) ─────────────────────────────────

function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

function base64urlEncode(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function hmacSHA256(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest();
}

/**
 * @param {string} token - Raw JWT string
 * @returns {{ ok: boolean, user?: object, error?: string }}
 */
function verify(req) {
  const authHeader = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, error: "Missing or malformed Authorization header" };
  }

  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "Invalid token structure" };
  }

  const [headerB64, payloadB64, sigB64] = parts;

  // Verify signature
  const expected = base64urlEncode(hmacSHA256(`${headerB64}.${payloadB64}`, config.jwt.secret));
  if (!timingSafeEqual(expected, sigB64)) {
    return { ok: false, error: "Invalid token signature" };
  }

  // Decode payload
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, error: "Malformed token payload" };
  }

  // Check expiry
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    return { ok: false, error: "Token expired" };
  }

  return { ok: true, user: payload };
}

/**
 * Generate a signed JWT for testing / the /auth/* endpoints.
 */
function sign(payload, expiresInSeconds = 3600) {
  const header  = base64urlEncode(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const claims  = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const body    = base64urlEncode(Buffer.from(JSON.stringify(claims)));
  const sig     = base64urlEncode(hmacSHA256(`${header}.${body}`, config.jwt.secret));
  return `${header}.${body}.${sig}`;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { verify, sign };
