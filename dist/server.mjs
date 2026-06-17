import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { handleClaudeHttpRequest } from "./lib/claudeProxy.mjs";

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

async function loadDotEnv() {
  try {
    const raw = await readFile(join(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* no local .env */
  }
}

await loadDotEnv();

createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  let path = url.pathname;

  if (path === "/.netlify/functions/claude-chat") {
    await handleClaudeHttpRequest(req, res);
    return;
  }

  if (path === "/demo" || path === "/demo/") path = "/demo.html";
  if (path === "/app" || path === "/app/") path = "/index.html";
  if (path === "/app.html") path = "/index.html";
  if (
    path === "/dashboard" ||
    path === "/workspace" ||
    path === "/learning" ||
    path.startsWith("/workspace/")
  ) {
    res.writeHead(302, { Location: "/index.html?auth=login" });
    res.end();
    return;
  }

  if (path === "/") path = "/index.html";

  try {
    const file = join(root, path);
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(path)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 � not found");
  }
}).listen(PORT, "127.0.0.1", () => {
  const aiReady = Boolean(process.env.ANTHROPIC_API_KEY);
  console.log("");
  console.log("  LexiCoil ready");
  console.log("  Open: http://localhost:" + PORT);
  console.log(
    aiReady
      ? "  AI proxy: ready (ANTHROPIC_API_KEY loaded)"
      : "  AI proxy: add ANTHROPIC_API_KEY to .env for local AI"
  );
  console.log("  Ctrl+C to stop");
  console.log("");
});
