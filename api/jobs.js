// Serverless proxy for Adzuna job search.
// Keeps the API credentials server-side (Vercel env vars), so they never
// appear in the browser, the page source, or the git repo. Also avoids any
// browser CORS issues, since the page calls this same-origin endpoint.
//
// Set these in Vercel → Project → Settings → Environment Variables:
//   ADZUNA_APP_ID   = your Adzuna Application ID
//   ADZUNA_APP_KEY  = your Adzuna Application Key

module.exports = async (req, res) => {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    return res.status(500).json({
      error: "Jobs not set up yet — add ADZUNA_APP_ID and ADZUNA_APP_KEY in Vercel env vars, then redeploy.",
    });
  }

  const what = (req.query.what || "").toString().slice(0, 80);
  const type = (req.query.type || "part_time").toString();
  const where = (req.query.where || "").toString().slice(0, 80);
  const distance = Math.min(parseInt(req.query.distance, 10) || 12, 50);
  const page = Math.min(parseInt(req.query.page, 10) || 1, 10);
  if (!where) return res.status(400).json({ error: "Missing location." });

  let url =
    `https://api.adzuna.com/v1/api/jobs/gb/search/${page}` +
    `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}` +
    `&results_per_page=25&where=${encodeURIComponent(where)}&distance=${distance}&content-type=application/json`;
  if (what) url += `&what=${encodeURIComponent(what)}`;
  if (type === "part_time") url += "&part_time=1";
  else if (type === "full_time") url += "&full_time=1";

  try {
    const r = await fetch(url);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({
        error: data.exception || data.display || `Adzuna error (${r.status}) — check your keys.`,
      });
    }
    // Light edge cache so repeat searches are fast and we stay well under limits.
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ count: data.count, results: data.results || [] });
  } catch (e) {
    return res.status(502).json({ error: "Couldn't reach Adzuna: " + e.message });
  }
};
