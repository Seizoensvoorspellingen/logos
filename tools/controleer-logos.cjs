// Jaarlijkse controle: heeft een club een nieuw logo?
// football-logos.cc geeft elk bestand een code (hash) in de link; verandert het logo, dan verandert die code.
// Per club staat de code in de kolom logo_versie (van de bron die gebruikt is); bij een eigen logo de sha256 van het bestand.
// Gebruik:
//   node tools/controleer-logos.cjs            alleen melden (tmp/controle-verslag.json)
//   node tools/controleer-logos.cjs --vul      lege logo_versie invullen zonder te melden (eerste keer)
//   node tools/controleer-logos.cjs --bijwerken  gewijzigde logo's opnieuw ophalen (het oude logo blijft terug te vinden in de git-geschiedenis)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const UA = { "user-agent": "Mozilla/5.0 (voetbalpoule-logobank)" };
const PAUZE_MS = 400;
const MAAT = 384;
const BRONMAAT = 1500;
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const vul = process.argv.includes("--vul");
const bijwerken = process.argv.includes("--bijwerken");

function leesCsv(bestand) {
  const regels = fs.readFileSync(bestand, "utf8").trim().split("\n");
  const splits = (r) => { const uit = []; let v = "", q = false; for (const ch of r) { if (q) { if (ch === '"') q = false; else v += ch; } else if (ch === '"') q = true; else if (ch === ",") { uit.push(v); v = ""; } else v += ch; } uit.push(v); return uit; };
  const kop = splits(regels[0]);
  return { kop, rijen: regels.slice(1).map((r) => Object.fromEntries(splits(r).map((v, i) => [kop[i], v]))) };
}
const csvVeld = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const schrijfCsv = (bestand, kop, rijen) => fs.writeFileSync(bestand, [kop.join(","), ...rijen.map((r) => kop.map((k) => csvVeld(r[k])).join(","))].join("\n") + "\n");
async function haal(url, soort) {
  for (let poging = 1; poging <= 3; poging++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return soort === "tekst" ? res.text() : Buffer.from(await res.arrayBuffer());
    if (res.status === 404 || res.status === 403) return null;
    await wacht(2000 * poging);
  }
  return null;
}

async function huidigeVersie(r) {
  if (r.eigen_logo) {
    const b = await haal(r.eigen_logo, "buffer");
    return b && { versie: "sha256:" + crypto.createHash("sha256").update(b).digest("hex").slice(0, 16), beeld: b };
  }
  const [land, slug] = r.football_logos.split("/");
  const html = await haal(`https://football-logos.cc/${land}/${slug}/`, "tekst");
  if (!html) return null;
  const maten = [...html.matchAll(/<option value="(\d+)::([0-9a-f]+)">/g)].map((m) => ({ maat: +m[1], hash: m[2] })).filter((m) => m.maat <= BRONMAAT && m.maat >= MAAT).sort((a, b) => b.maat - a.maat);
  if (!maten[0]) return null;
  return { versie: `${maten[0].maat}:${maten[0].hash}`, url: `https://assets.football-logos.cc/logos/${land}/${maten[0].maat}x${maten[0].maat}/${slug}.${maten[0].hash}.png` };
}

(async () => {
  const sharp = bijwerken ? require("sharp") : null;
  const bestanden = fs.readdirSync(path.join(ROOT, "competities"), { recursive: true }).filter((f) => f.endsWith(".csv")).map((f) => path.join(ROOT, "competities", f));
  const verslag = { gecontroleerd: 0, gevuld: 0, gewijzigd: [], bijgewerkt: [], mislukt: [] };
  const gezien = new Map();
  for (const bestand of bestanden) {
    const { kop, rijen } = leesCsv(bestand);
    if (!kop.includes("logo_versie")) kop.push("logo_versie");
    for (const r of rijen) {
      if (!r.football_logos && !r.eigen_logo) continue;
      const sleutel = r.eigen_logo || r.football_logos;
      let nu = gezien.get(sleutel);
      if (!nu) { nu = await huidigeVersie(r); gezien.set(sleutel, nu); await wacht(PAUZE_MS); }
      verslag.gecontroleerd++;
      if (!nu) { verslag.mislukt.push(`${r.naam} (${sleutel})`); continue; }
      if (!r.logo_versie) { if (vul) { r.logo_versie = nu.versie; verslag.gevuld++; } continue; }
      if (r.logo_versie === nu.versie) continue;
      verslag.gewijzigd.push({ naam: r.naam, fotmob_id: r.fotmob_id, bron: sleutel, oud: r.logo_versie, nieuw: nu.versie });
      if (bijwerken) {
        const beeld = nu.beeld || (await haal(nu.url, "buffer"));
        if (!beeld) { verslag.mislukt.push(`${r.naam} (${sleutel})`); continue; }
        const uit = path.join(ROOT, "logos", r.fotmob_id + ".webp");
        await sharp(beeld, { limitInputPixels: false }).resize(MAAT, MAAT, { kernel: "lanczos3", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ lossless: true, effort: 6 }).toFile(uit);
        r.logo_versie = nu.versie;
        verslag.bijgewerkt.push(r.naam);
      }
    }
    schrijfCsv(bestand, kop, rijen);
  }
  fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "tmp", "controle-verslag.json"), JSON.stringify(verslag, null, 1));
  console.log(`Gecontroleerd: ${verslag.gecontroleerd}, ingevuld: ${verslag.gevuld}, nieuw logo: ${verslag.gewijzigd.length}, bijgewerkt: ${verslag.bijgewerkt.length}, mislukt: ${verslag.mislukt.length}`);
  for (const g of verslag.gewijzigd) console.log("Nieuw logo:", g.naam, g.bron);
})();
