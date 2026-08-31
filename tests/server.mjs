/* Servidor estático mínimo que publica el proyecto bajo una subruta,
   igual que hará GitHub Pages (https://usuario.github.io/registro-dieta/). */

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(join(fileURLToPath(import.meta.url), "..", ".."));
export const PREFIX = "/dieta";
export const PORT = 4599;
export const BASE = `http://localhost:${PORT}${PREFIX}/`;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

export function start(){
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === PREFIX) { res.writeHead(302, { Location: PREFIX + "/" }); return res.end(); }
      if (!p.startsWith(PREFIX + "/")) { res.writeHead(404); return res.end("out of scope"); }
      p = p.slice(PREFIX.length);
      if (p === "/" || p.endsWith("/")) p += "index.html";
      const file = join(ROOT, normalize(p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": TYPES[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "Service-Worker-Allowed": PREFIX + "/"
      });
      res.end(body);
    } catch (e) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    }
  });
  return new Promise((res) => server.listen(PORT, () => res(server)));
}

if (import.meta.url === `file://${process.argv[1]}`){
  start().then(() => console.log("serving " + BASE));
}
