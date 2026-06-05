import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const root = dirname(fileURLToPath(import.meta.url));
const PORT = 5173;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

createServer(async (req, res) => {
  let path = (req.url || "/").split("?")[0];
  if (path === "/") path = "/index.html";

  try {
    const file = join(root, path);
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 — not found");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("  LexiLoop ready");
  console.log("  Open: http://localhost:" + PORT);
  console.log("  Ctrl+C to stop");
  console.log("");
});
