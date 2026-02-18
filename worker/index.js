/**
 * Cloudflare Worker — CORS Proxy for Airtable API
 *
 * This worker forwards browser requests to the Airtable API,
 * adding the necessary CORS headers so client-side JS can make calls.
 *
 * Deploy:
 *   cd worker && npx wrangler deploy
 *
 * Security:
 *   - Only forwards to https://api.airtable.com/*
 *   - Origin allowlist (configure ALLOWED_ORIGINS below)
 *   - Student API keys pass through but are never stored or logged
 */

// Configure allowed origins. Add your GitHub Pages URL, LMS domain, etc.
// Use ["*"] to allow any origin (less secure, but fine for classroom use).
const ALLOWED_ORIGINS = ["*"];

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handlePreflight(request);
    }

    // Only accept POST (the client always POSTs to the proxy)
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
    }

    // Check origin
    const origin = request.headers.get("Origin") || "";
    if (!isOriginAllowed(origin)) {
      return jsonResponse({ error: "Origin not allowed" }, 403);
    }

    // Get the target Airtable URL and method from headers
    const targetUrl = request.headers.get("X-Airtable-Target-Url");
    const airtableMethod = request.headers.get("X-Airtable-Method") || "POST";

    if (!targetUrl || !targetUrl.startsWith("https://api.airtable.com/")) {
      return jsonResponse(
        { error: "Invalid or missing X-Airtable-Target-Url. Must start with https://api.airtable.com/" },
        400
      );
    }

    // Forward to Airtable
    const authHeader = request.headers.get("Authorization");
    const fetchHeaders = {
      "Content-Type": "application/json",
    };
    if (authHeader) {
      fetchHeaders["Authorization"] = authHeader;
    }

    const fetchOpts = {
      method: airtableMethod,
      headers: fetchHeaders,
    };

    // Include body for POST/PATCH/PUT
    if (["POST", "PATCH", "PUT"].includes(airtableMethod.toUpperCase())) {
      fetchOpts.body = await request.text();
    }

    try {
      const airtableRes = await fetch(targetUrl, fetchOpts);
      const responseBody = await airtableRes.text();

      return new Response(responseBody, {
        status: airtableRes.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin || "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Airtable-Target-Url, X-Airtable-Method",
        },
      });
    } catch (err) {
      return jsonResponse({ error: `Proxy fetch failed: ${err.message}` }, 502, origin);
    }
  },
};

function handlePreflight(request) {
  const origin = request.headers.get("Origin") || "";
  if (!isOriginAllowed(origin)) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Airtable-Target-Url, X-Airtable-Method",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function isOriginAllowed(origin) {
  if (ALLOWED_ORIGINS.includes("*")) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

function jsonResponse(body, status = 200, origin = "*") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
    },
  });
}
