// Eenmalig (en bij behoefte opnieuw): de overige Nederlandse clubs van football-logos.cc/netherlands/ (niet in de
// Eredivisie of Eerste divisie) opzoeken op FotMob en toevoegen aan competities/nederland/amateurclubs.csv.
// Alleen clubs die op FotMob te vinden zijn (land NED, geen jeugd- of vrouwenteam). Twijfel → tmp/amateur-twijfel.json.
// Bestaande regels blijven staan. Gebruik: node tools/vul-amateurclubs.cjs [--droog]
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BESTAND = path.join(ROOT, "competities", "nederland", "amateurclubs.csv");
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36" };
const UA_FL = { "user-agent": "Mozilla/5.0 (voetbalpoule-logobank)" };
const KOLOMMEN = ["naam", "fotmob_id", "fotmob_naam", "football_logos", "fl_naam", "zekerheid", "eigen_logo", "eigen_pagina", "logo", "logo_versie"];
// Pagina's op football-logos.cc/netherlands/ die geen club zijn.
const GEEN_CLUB = new Set(["netherlands-national-team-logo", "eredivisie", "eerste-divisie", "tweede-divisie", "knvb", "knvb-cup", "johan-cruijff-schaal", "netherlands", "netherlands-national-team", "keuken-kampioen-divisie", "vrouwen-eredivisie", "derde-divisie"]);
const droog = process.argv.includes("--droog");
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

async function haal(url, soort, kop = UA) {
  for (let poging = 1; poging <= 3; poging++) {
    const res = await fetch(url, { headers: kop });
    if (res.ok) return soort === "json" ? res.json() : res.text();
    if (res.status === 404) return null;
    await wacht(1500 * poging);
  }
  return null;
}
function leesCsv(bestand) {
  if (!fs.existsSync(bestand)) return [];
  const regels = fs.readFileSync(bestand, "utf8").trim().split("\n");
  const splits = (r) => { const uit = []; let v = "", q = false; for (const ch of r) { if (q) { if (ch === '"') q = false; else v += ch; } else if (ch === '"') q = true; else if (ch === ",") { uit.push(v); v = ""; } else v += ch; } uit.push(v); return uit; };
  const kop = splits(regels[0]);
  return regels.slice(1).filter(Boolean).map((r) => Object.fromEntries(splits(r).map((v, i) => [kop[i], v])));
}
const csvVeld = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(["fc", "vv", "sv", "rkvv", "rksv", "afc", "sc", "hfc", "rkav", "asv", "sportclub", "club"]);
const toks = (s) => norm(s).split(" ").filter((t) => t && !STOP.has(t));
function score(a, b) {
  const ta = toks(a), tb = toks(b);
  if (!ta.length || !tb.length) return 0;
  return ta.filter((t) => tb.includes(t)).length / Math.max(ta.length, tb.length);
}

(async () => {
  const nl = path.join(ROOT, "competities", "nederland");
  const bekend = new Map();
  for (const f of fs.readdirSync(nl).filter((x) => x.endsWith(".csv"))) for (const r of leesCsv(path.join(nl, f))) { bekend.set(r.fotmob_id, r); if (r.football_logos) bekend.set(r.football_logos, r); }
  const html = await haal("https://football-logos.cc/netherlands/", "tekst", UA_FL);
  const sitemap = await haal("https://football-logos.cc/sitemap-0.xml", "tekst", UA_FL);
  const namen = new Map();
  for (const m of html.matchAll(/<a href="\/netherlands\/([a-z0-9-]+)\/"[^>]*>\s*<img[^>]*alt="([^"]+) logo"/g)) if (!m[1].includes("--")) namen.set(m[1], m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'"));
  for (const m of sitemap.matchAll(/<loc>https:\/\/football-logos\.cc\/netherlands\/([a-z0-9-]+)\/<\/loc>/g)) if (!m[1].includes("--") && !namen.has(m[1])) namen.set(m[1], m[1].replace(/-/g, " "));
  const rijen = leesCsv(BESTAND);
  const twijfel = [];
  for (const [slug, flNaam] of namen) {
    if (GEEN_CLUB.has(slug) || bekend.has(`netherlands/${slug}`)) continue;
    let teams = [];
    for (const term of [...new Set([flNaam, toks(flNaam).join(" ")])].filter(Boolean)) {
      const zoek = await haal(`https://www.fotmob.com/api/data/search/suggest?term=${encodeURIComponent(term)}&lang=en`, "json");
      await wacht(400);
      teams = ((zoek && zoek[0] && zoek[0].suggestions) || []).filter((s) => s.type === "team");
      if (teams.length) break;
    }
    teams = teams.filter((s) => s.type === "team" && !/\b(U\d\d|\(W\)|Women|Vrouwen|Jong)\b/i.test(s.name));
    let gevonden = null;
    for (const t of teams.slice(0, 3)) {
      if (bekend.has(String(t.id))) { gevonden = { al: true }; break; }
      const info = await haal(`https://www.fotmob.com/api/data/teams?id=${t.id}`, "json");
      await wacht(400);
      if (!info || !info.details || info.details.country !== "NED") continue;
      gevonden = { id: String(t.id), naam: t.name, s: score(flNaam, t.name) };
      break;
    }
    if (!gevonden) { twijfel.push({ slug, flNaam, reden: "niet gevonden op FotMob" }); continue; }
    if (gevonden.al) continue;
    if (gevonden.s < 0.5) { twijfel.push({ slug, flNaam, fotmob_id: gevonden.id, fotmob_naam: gevonden.naam, reden: "naam lijkt niet" }); continue; }
    rijen.push({ naam: gevonden.naam, fotmob_id: gevonden.id, fotmob_naam: gevonden.naam, football_logos: `netherlands/${slug}`, fl_naam: flNaam, zekerheid: gevonden.s >= 0.99 ? "zeker" : "twijfel" });
    bekend.set(gevonden.id, true);
    process.stdout.write(".");
  }
  if (!rijen.some((r) => r.fotmob_id === "amateurclub")) rijen.unshift({ naam: "Amateurclub", fotmob_id: "amateurclub", fotmob_naam: "", football_logos: "netherlands/knvb", fl_naam: "KNVB", zekerheid: "handmatig" });
  if (!droog) fs.writeFileSync(BESTAND, [KOLOMMEN.join(","), ...rijen.map((r) => KOLOMMEN.map((k) => csvVeld(r[k])).join(","))].join("\n") + "\n");
  fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "tmp", "amateur-twijfel.json"), JSON.stringify(twijfel, null, 1));
  console.log(`\n${rijen.length} regels in amateurclubs.csv; ${twijfel.length} niet toegevoegd (tmp/amateur-twijfel.json)`);
})();
