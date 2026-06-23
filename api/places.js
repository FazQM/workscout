// Serverless proxy for OpenStreetMap "Overpass" queries (the work-experience
// finder). The public Overpass servers are often overloaded and several block
// cross-site (CORS) browser calls, which made "Find places" flaky. Calling them
// from here (server-to-server) sidesteps CORS and lets us fail over across
// several mirrors until one answers. No API key needed — this is open data.

const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

module.exports = async (req, res) => {
  let query = "";
  try {
    if (req.method === "POST") {
      const b = req.body;
      query = (typeof b === "string" ? JSON.parse(b).query : (b && b.query)) || "";
    } else {
      query = (req.query.query || "").toString();
    }
  } catch (e) {
    query = "";
  }
  if (!query) return res.status(400).json({ error: "missing query", elements: [] });

  let lastErr = "";
  for (const url of MIRRORS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (!r.ok) { lastErr = "status " + r.status; continue; }
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("json")) { lastErr = "busy"; continue; }   // HTML error page
      const j = await r.json();
      if (j && j.remark && /error|timed out|runtime|load/i.test(j.remark)) { lastErr = j.remark; continue; }
      if (j && Array.isArray(j.elements)) {
        res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
        return res.status(200).json({ elements: j.elements });
      }
      lastErr = "bad response";
    } catch (e) {
      lastErr = e.message;
    }
  }
  return res.status(502).json({ error: "map service busy (" + lastErr + ")", elements: [] });
};
