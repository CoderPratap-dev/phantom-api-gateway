"use strict";

let totalRequests = 0;
let totalErrors   = 0;
const latencies   = [];
const startedAt   = Date.now();

function incrementTotal() { totalRequests++; }
function incrementErrors() { totalErrors++; }

function recordLatency(ms) {
  latencies.push(ms);
  if (latencies.length > 1000) latencies.shift();
}

function percentile(sorted, p) {
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)] || 0;
}

function snapshot() {
  const sorted = [...latencies].sort((a, b) => a - b);
  const avg    = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;

  return {
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    total_requests: totalRequests,
    total_errors:   totalErrors,
    error_rate:     totalRequests ? (totalErrors / totalRequests).toFixed(4) : "0",
    latency: {
      avg_ms:  Math.round(avg),
      p50_ms:  percentile(sorted, 50),
      p95_ms:  percentile(sorted, 95),
      p99_ms:  percentile(sorted, 99),
      samples: latencies.length,
    },
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    timestamp: new Date().toISOString(),
  };
}

module.exports = { incrementTotal, incrementErrors, recordLatency, snapshot };
