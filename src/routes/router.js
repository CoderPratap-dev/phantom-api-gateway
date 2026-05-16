"use strict";

const config = require("../config/gateway.config");

/**
 * Match an incoming request to a configured route.
 * Returns the matched route object or null.
 */
function match(method, url) {
  // Strip query string for matching
  const pathname = url.split("?")[0];

  for (const route of config.routes) {
    const methodMatch = route.method === method || route.method === "*";
    const pathMatch   = pathname.startsWith(route.prefix);
    if (methodMatch && pathMatch) return route;
  }

  return null;
}

module.exports = { match };
