const SUPABASE_URL = process.env.SUPABASE_URL || "https://gutkkcorybzyiievocli.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1dGtrY29yeWJ6eWlpZXZvY2xpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NTI0MjksImV4cCI6MjA5NjMyODQyOX0.eMieGnmOli4eXw3celGIRLN2A4luV0ZWQVMKIHQJvYM";

function getSupabasePath(event) {
  const rawPath = event.rawUrl
    ? new URL(event.rawUrl).pathname
    : event.path;

  return rawPath
    .replace(/^\/supabase\/?/, "")
    .replace(/^\/\.netlify\/functions\/supabase-proxy\/?/, "");
}

function getForwardHeaders(headers) {
  const forwarded = {};
  const skipped = new Set([
    "connection",
    "content-length",
    "host",
    "origin",
    "referer",
  ]);

  Object.entries(headers || {}).forEach(([key, value]) => {
    if (!skipped.has(key.toLowerCase())) {
      forwarded[key] = value;
    }
  });

  forwarded.apikey = forwarded.apikey || SUPABASE_ANON_KEY;
  forwarded.authorization = forwarded.authorization || `Bearer ${SUPABASE_ANON_KEY}`;

  return forwarded;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Origin": "*",
      },
      body: "",
    };
  }

  const supabasePath = getSupabasePath(event);
  const query = event.rawUrl ? new URL(event.rawUrl).search : "";
  const targetUrl = `${SUPABASE_URL.replace(/\/$/, "")}/${supabasePath}${query}`;
  const hasBody = !["GET", "HEAD"].includes(event.httpMethod);

  try {
    const response = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: getForwardHeaders(event.headers),
      body: hasBody ? event.body : undefined,
    });

    return {
      statusCode: response.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": response.headers.get("cache-control") || "no-store",
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
      body: await response.text(),
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: `Supabase proxy failed: ${error.message}` }),
    };
  }
};
