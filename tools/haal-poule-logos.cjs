// De logo's van de poule die geen club zijn (bond, competities, toernooien, bekers, vlag): poule-logos.csv.
// Kolommen: sleutel, naam, football_logos (land/slug, ook varianten als 'tournaments/uefa-champions-league--no-text'),
// eigen_logo (link naar een bestand, gaat voor), eigen_pagina, logo, logo_versie.
// Per logo: WebP lossless 384×384 in logos/poule/<sleutel>.webp, bron in bron/poule/<sleutel>.webp.
// Gebruik: node tools/haal-poule-logos.cjs [--opnieuw]
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const BESTAND = path.join(ROOT, "poule-logos.csv");
const KOLOMMEN = ["sleutel", "naam", "football_logos", "eigen_logo", "eigen_pagina", "logo", "logo_versie"];
const UA = { "user-agent": "voetbalpoule-logobank/1.0 (niet-commerciële poule)" };
const MAAT = 384;
const BRONMAAT = 1500;
const MATEN = [3000, 1500, 700, 512, 256, 128, 64];
const opnieuw = process.argv.includes("--opnieuw");
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

function leesCsv(bestand) {
  const regels = fs.readFileSync(bestand, "utf8").trim().split("\n");
  const splits = (r) => { const uit = []; let v = "", q = false; for (const ch of r) { if (q) { if (ch === '"') q = false; else v += ch; } else if (ch === '"') q = true; else if (ch === ",") { uit.push(v); v = ""; } else v += ch; } uit.push(v); return uit; };
  const kop = splits(regels[0]);
  return regels.slice(1).filter(Boolean).map((r) => Object.fromEntries(splits(r).map((v, i) => [kop[i], v])));
}
const csvVeld = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
async function haal(url, soort) {
  for (let poging = 1; poging <= 3; poging++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return soort === "tekst" ? res.text() : Buffer.from(await res.arrayBuffer());
    if (res.status === 404 || res.status === 403) return null;
    await wacht(2000 * poging);
  }
  return null;
}

// Bestand van football-logos.cc: de hoofdpagina heeft per logo (ook per variant) een veld 'h' met per maat
// (3000, 1500, 700, 512, 256, 128, 64) een code van 8 tekens. Neem de grootste maat tot en met 1500, minstens 384.
async function footballLogos(ref) {
  const [land, slug] = ref.split("/");
  const basis = slug.split("--")[0];
  // Sommige logo's (zoals UEFA) staan op een pagina zonder land in het adres.
  const html = (await haal(`https://football-logos.cc/${land}/${basis}/`, "tekst")) || (await haal(`https://football-logos.cc/${basis}/`, "tekst"));
  if (!html) return null;
  if (slug === basis) {
    // Het hoofdlogo: de keuzelijst met maten op de pagina ('<maat>::<code>').
    const opties = [...html.matchAll(/<option value="([0-9]+)::([0-9a-f]+)">/g)].map((o) => ({ maat: +o[1], code: o[2] })).filter((o) => o.maat <= BRONMAAT && o.maat >= MAAT).sort((a, b) => b.maat - a.maat);
    for (const o of opties) {
      const beeld = await haal(`https://assets.football-logos.cc/logos/${land}/${o.maat}x${o.maat}/${slug}.${o.code}.png`, "buffer");
      if (beeld) return { beeld, versie: `${o.maat}:${o.code}` };
    }
    return null;
  }
  const tekst = html.replace(/&quot;/g, '"');
  const m = tekst.match(new RegExp(`"id":\\[0,"${slug.replace(/[-]/g, "\\-")}"\\],"name":\\[0,"[^"]*"\\],"h":\\[0,"([0-9a-f]+)"\\]`));
  if (!m) return null;
  const codes = m[1].match(/.{8}/g);
  for (let i = 0; i < MATEN.length; i++) {
    if (MATEN[i] > BRONMAAT || MATEN[i] < MAAT) continue;
    const url = `https://assets.football-logos.cc/logos/${land}/${MATEN[i]}x${MATEN[i]}/${slug}.${codes[i]}.png`;
    const beeld = await haal(url, "buffer");
    if (beeld) return { beeld, versie: `${MATEN[i]}:${codes[i]}` };
  }
  return null;
}

(async () => {
  const rijen = leesCsv(BESTAND);
  let nieuw = 0;
  const mislukt = [];
  for (const r of rijen) {
    const uit = path.join(ROOT, "logos", "poule", r.sleutel + ".webp");
    if (fs.existsSync(uit) && !opnieuw) { r.logo = path.relative(ROOT, uit).replace(/\\/g, "/"); continue; }
    let bron = null;
    if (r.eigen_logo) {
      const beeld = await haal(r.eigen_logo, "buffer");
      if (beeld) bron = { beeld, versie: "sha256:" + crypto.createHash("sha256").update(beeld).digest("hex").slice(0, 16) };
    } else if (r.football_logos) bron = await footballLogos(r.football_logos);
    await wacht(400);
    if (!bron) { mislukt.push(r.sleutel); continue; }
    const svg = bron.beeld.slice(0, 200).toString().includes("<svg");
    const invoer = () => sharp(bron.beeld, { limitInputPixels: false, ...(svg ? { density: 600 } : {}) });
    fs.mkdirSync(path.join(ROOT, "bron", "poule"), { recursive: true });
    fs.mkdirSync(path.dirname(uit), { recursive: true });
    await invoer().webp({ lossless: true, effort: 6 }).toFile(path.join(ROOT, "bron", "poule", r.sleutel + ".webp"));
    await invoer().resize(MAAT, MAAT, { kernel: "lanczos3", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ lossless: true, effort: 6 }).toFile(uit);
    r.logo = path.relative(ROOT, uit).replace(/\\/g, "/");
    r.logo_versie = bron.versie;
    nieuw++;
  }
  fs.writeFileSync(BESTAND, [KOLOMMEN.join(","), ...rijen.map((r) => KOLOMMEN.map((k) => csvVeld(r[k])).join(","))].join("\n") + "\n");
  console.log(`Poule-logo's: ${nieuw} nieuw, ${mislukt.length} mislukt${mislukt.length ? ": " + mislukt.join(", ") : ""}`);
})();
