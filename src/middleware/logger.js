"use strict";

const fs   = require("fs");
const path = require("path");

const LOG_DIR  = path.join(__dirname, "../../logs");
const LOG_FILE = path.join(LOG_DIR, "access.log");

// Ensure logs dir exists
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const stream = fs.createWriteStream(LOG_FILE, { flags: "a" });

function colorCode(code) {
  if (code < 300) return `\x1b[32m${code}\x1b[0m`;
  if (code < 400) return `\x1b[33m${code}\x1b[0m`;
  return `\x1b[31m${code}\x1b[0m`;
}

function access(req, statusCode, durationMs, requestId, userId) {
  const ts    = new Date().toISOString();
  const ip    = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "-";
  const user  = userId || "-";
  const line  = `[${ts}] ${ip} ${user} "${req.method} ${req.url}" ${statusCode} ${durationMs}ms ${requestId}`;

  // Console (colorized)
  console.log(`[${ts}] ${ip} ${user} "${req.method} ${req.url}" ${colorCode(statusCode)} ${durationMs}ms`);

  // File (plain)
  stream.write(line + "\n");
}

function error(req, err) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] ERROR "${req.method} ${req.url}" ${err.message}`;
  console.error(`\x1b[31m${line}\x1b[0m`);
  stream.write(line + "\n");
}

function info(msg) {
  const ts = new Date().toISOString();
  console.log(`\x1b[36m[${ts}] INFO  ${msg}\x1b[0m`);
  stream.write(`[${ts}] INFO  ${msg}\n`);
}

module.exports = { access, error, info };
