// Logo's ophalen bij football-logos.cc voor alle clubs in competities/**.csv met een koppeling en nog zonder logo.
// Per club: de PNG van 1500 px (grootste openbare maat; heeft de club die niet, dan de grootste die er is, minstens 384) → bron/<land>/<slug>.webp (lossless, zelfde pixels)
// en logos/<fotmob_id>.webp (WebP bijna-lossless (kwaliteit 60) 384×384, lanczos3). Vult ook de kolom fl_naam (naam op football-logos.cc).
// Gebruik: node tools/haal-logos.cjs [--opnieuw]
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const UA = { "user-agent": "Mozilla/5.0 (voetbalpoule-logobank)" };
const PAUZE_MS = 400;
const MAAT = 384;
const BRONMAAT = 1500;
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const opnieuw = process.argv.includes("--opnieuw");

function leesCsv(bestand) {
  const regels = fs.readFileSync(bestand, "utf8").trim().split("\n");
  const splits = (r) => { const uit = []; let v = "", q = false; for (const ch of r) { if (q) { if (ch === '"') q = false; else v += ch; } else if (ch === '"') q = true; else if (ch === ",") { uit.push(v); v = ""; } else v += ch; } uit.push(v); return uit; };
  const kop = splits(regels[0]);
  return { kop, rijen: regels.slice(1).map((r) => Object.fromEntries(splits(r).map((v, i) => [kop[i], v]))) };
}
const csvVeld = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
function schrijfCsv(bestand, kop, rijen) {
  fs.writeFileSync(bestand, [kop.join(","), ...rijen.map((r) => kop.map((k) => csvVeld(r[k])).join(","))].join("\n") + "\n");
}
async function haal(url, soort) {
  for (let poging = 1; poging <= 3; poging++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return soort === "tekst" ? res.text() : Buffer.from(await res.arrayBuffer());
    if (res.status === 404 || res.status === 403) return null;
    await wacht(2000 * poging);
  }
  return null;
}

(async () => {
  const bestanden = fs.readdirSync(path.join(ROOT, "competities"), { recursive: true }).filter((f) => f.endsWith(".csv")).map((f) => path.join(ROOT, "competities", f));
  const verslag = { gedaan: 0, overgeslagen: 0, mislukt: [] };
  const klaar = new Map();
  for (const bestand of bestanden) {
    const { kop, rijen } = leesCsv(bestand);
    if (!kop.includes("fl_naam")) kop.splice(kop.indexOf("football_logos") + 1, 0, "fl_naam");
    if (!kop.includes("logo")) kop.push("logo");
    for (const r of rijen) {
      if (!r.football_logos && !r.eigen_logo) continue;
      const uit = path.join(ROOT, "logos", r.fotmob_id + ".webp");
      if (fs.existsSync(uit) && !opnieuw) { verslag.overgeslagen++; r.logo = "logos/" + r.fotmob_id + ".webp"; continue; }
      const [land, slug] = r.football_logos.split("/");
      let gegevens = klaar.get(r.eigen_logo || r.football_logos);
      if (!gegevens && r.eigen_logo) {
        const beeld = await haal(r.eigen_logo, "buffer");
        await wacht(PAUZE_MS);
        if (!beeld) { verslag.mislukt.push(r.eigen_logo); continue; }
        const bron = path.join(ROOT, "bron", "eigen", r.fotmob_id + ".webp");
        fs.mkdirSync(path.dirname(bron), { recursive: true });
        const svg = beeld.slice(0, 300).toString().includes("<svg");
        const opties = { limitInputPixels: false, ...(svg ? { density: 200 } : {}) };
        await sharp(beeld, opties).webp({ lossless: true, effort: 6 }).toFile(bron);
        const logo = await sharp(beeld, opties).resize(MAAT, MAAT, { kernel: "lanczos3", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ nearLossless: true, quality: 60, effort: 6 }).toBuffer();
        gegevens = { naam: "", logo };
        klaar.set(r.eigen_logo, gegevens);
      }
      if (!gegevens) {
        const html = await haal(`https://football-logos.cc/${land}/${slug}/`, "tekst");
        await wacht(PAUZE_MS);
        const maten = html ? [...html.matchAll(/<option value="(\d+)::([0-9a-f]+)">/g)].map((m) => ({ maat: +m[1], hash: m[2] })).filter((m) => m.maat <= BRONMAAT && m.maat >= MAAT).sort((a, b) => b.maat - a.maat) : [];
        const hash = maten[0] && maten[0].hash;
        const bronmaat = maten[0] && maten[0].maat;
        const naam = html && ((html.match(/data-logo-id="[^"]+"[^>]*>[\s\S]{0,2000}?aria-label="Download (.+?) svg logo"/) || [])[1] || (html.match(/<title>(.+?) Logo PNG/) || [])[1]);
        const png = hash && (await haal(`https://assets.football-logos.cc/logos/${land}/${bronmaat}x${bronmaat}/${slug}.${hash}.png`, "buffer"));
        await wacht(PAUZE_MS);
        if (!png) { verslag.mislukt.push(r.football_logos); continue; }
        const bron = path.join(ROOT, "bron", land, slug + ".webp");
        fs.mkdirSync(path.dirname(bron), { recursive: true });
        await sharp(png, { limitInputPixels: false }).webp({ lossless: true, effort: 6 }).toFile(bron);
        const logo = await sharp(png, { limitInputPixels: false }).resize(MAAT, MAAT, { kernel: "lanczos3", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ nearLossless: true, quality: 60, effort: 6 }).toBuffer();
        gegevens = { naam: (naam || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'"), logo };
        klaar.set(r.football_logos, gegevens);
      }
      fs.mkdirSync(path.dirname(uit), { recursive: true });
      fs.writeFileSync(uit, gegevens.logo);
      r.fl_naam = gegevens.naam;
      r.logo = "logos/" + r.fotmob_id + ".webp";
      verslag.gedaan++;
      process.stdout.write(".");
    }
    schrijfCsv(bestand, kop, rijen);
  }
  fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "tmp", "haal-verslag.json"), JSON.stringify(verslag, null, 1));
  console.log(`\nKlaar: ${verslag.gedaan} nieuw, ${verslag.overgeslagen} al aanwezig, ${verslag.mislukt.length} mislukt`);
})();
