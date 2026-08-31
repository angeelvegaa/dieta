/* Genera los PNG de icono a partir de un SVG, usando el Chromium de Playwright
   (ya instalado en la máquina). No añade dependencias al proyecto.
   Uso:  node scripts/make-icons.mjs   */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const BG = "#1B2A24";
const FG = "#EEF0E9";

const rounded = (rx, stroke, d) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="0" y="0" width="512" height="512" rx="${rx}" ry="${rx}" fill="${BG}"/>
  <path d="${d}" fill="none" stroke="${FG}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const CHECK_ANY = "M132 262 L214 344 L380 168";
const CHECK_MASK = "M150 262 L222 334 L360 186";

const jobs = [
  { name: "icon-192.png", size: 192, svg: rounded(116, 46, CHECK_ANY) },
  { name: "icon-512.png", size: 512, svg: rounded(116, 46, CHECK_ANY) },
  { name: "icon-180.png", size: 180, svg: rounded(0, 46, CHECK_ANY) },
  { name: "icon-maskable-192.png", size: 192, svg: rounded(0, 40, CHECK_MASK) },
  { name: "icon-maskable-512.png", size: 512, svg: rounded(0, 40, CHECK_MASK) }
];

const browser = await chromium.launch();
for (const job of jobs){
  const page = await browser.newPage({ viewport: { width: job.size, height: job.size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8">
     <style>html,body{margin:0;padding:0}svg{display:block;width:${job.size}px;height:${job.size}px}</style>
     ${job.svg}`,
    { waitUntil: "load" }
  );
  const buf = await page.locator("svg").screenshot({ omitBackground: true });
  await writeFile(join(root, "icons", job.name), buf);
  await page.close();
  console.log("wrote icons/" + job.name);
}
await browser.close();
