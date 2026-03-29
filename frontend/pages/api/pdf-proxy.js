// frontend/pages/api/pdf-proxy.js
//
// Fetches ANY Azure Blob URL (PDF or image) server-side and returns
// the bytes to the browser.
//
// Why: Azure Blob PDFs trigger Chrome auto-download when opened directly.
//      Images from Azure Blob are cross-origin so html2canvas blanks them.
//      This proxy solves both — browser only talks to localhost.
//
// Usage:
//   GET /api/pdf-proxy?url=https://xxx.blob.core.windows.net/xxx/file.pdf
//   GET /api/pdf-proxy?url=https://xxx.blob.core.windows.net/xxx/file.jpg

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing ?url param" });
  }

  // Validate — only allow Azure Blob / CDN hostnames
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const ALLOWED = [
    ".blob.core.windows.net",
    ".azureedge.net",
    ".azurefd.net",
    ".azurewebsites.net",
  ];
  if (!ALLOWED.some((h) => parsed.hostname.endsWith(h))) {
    return res.status(403).json({ error: "Host not allowed" });
  }

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "GYAANI-Proxy/1.0" },
    });

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ error: `Upstream ${upstream.status}` });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";

    // Tell browser: read it inline, never download it
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "public, max-age=3600");
    // Allow the canvas compositor to read cross-origin data
    res.setHeader("Access-Control-Allow-Origin", "*");

    return res.status(200).send(buffer);
  } catch (err) {
    console.error("[pdf-proxy]", err);
    return res.status(500).json({ error: "Fetch failed" });
  }
}
