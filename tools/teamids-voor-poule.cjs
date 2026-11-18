// Maakt voor een poule (back-up-JSON of testdata) de koppeling team → FotMob-code (config.teamIds),
// en optioneel de omzetting van de oude namen naar de namen uit de logobank.
// Bron voor de oude namen: de vaste lijsten FOTMOB_TEAM_CODES en FOTMOB_NAMES uit de JSX van vóór punt 12 (--oud),
// daarna de logobank (competities/**.csv: fotmob_id, fotmob_naam, naam, land).
// Gebruik: node tools/teamids-voor-poule.cjs --oud <poule-fotmob.cjs> --data <back-up.json> [--uit <koppeling.json>]
// Schrijft { teamIds: { <oude naam>: <code> }, nieuweNaam: { <oude naam>: <nieuwe naam> }, onbekend: [...] }.
const fs = require("fs");
const path = require("path");
const LANDEN = require("./landen.cjs");
const ROOT = path.join(__dirname, "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };

function leesCsv(bestand) {
  const regels = fs.readFileSync(bestand, "utf8").trim().split("\n");
  const splits = (r) => { const uit = []; let v = "", q = false; for (const ch of r) { if (q) { if (ch === '"') q = false; else v += ch; } else if (ch === '"') q = true; else if (ch === ",") { uit.push(v); v = ""; } else v += ch; } uit.push(v); return uit; };
  const kop = splits(regels[0]);
  return regels.slice(1).filter(Boolean).map((r) => Object.fromEntries(splits(r).map((v, i) => [kop[i], v])));
}
const vlak = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const landNaam = Object.fromEntries(Object.values(LANDEN).map((l) => [vlak(l.nl).replace(/ /g, "-"), l.nl]));

function categorieenUit(data) {
  // Back-up-JSON (config.categories) of testdata (shared: [[sleutel, waarde]] of { config: … }).
  if (data.config && data.config.categories) return data.config.categories;
  const shared = data.shared;
  const zoek = (v) => (typeof v === "string" ? JSON.parse(v) : v);
  if (Array.isArray(shared)) { const c = shared.find(([k]) => k === "config"); return c ? zoek(c[1]).categories : null; }
  if (shared && shared.config) return zoek(shared.config).categories;
  throw new Error("Geen config.categories gevonden");
}

const oud = require(path.resolve(arg("--oud")));
const data = JSON.parse(fs.readFileSync(arg("--data"), "utf8"));
const bank = [];
for (const land of fs.readdirSync(path.join(ROOT, "competities"))) for (const f of fs.readdirSync(path.join(ROOT, "competities", land)).filter((x) => x.endsWith(".csv"))) for (const r of leesCsv(path.join(ROOT, "competities", land, f))) bank.push({ ...r, land });
const perId = new Map(bank.map((r) => [r.fotmob_id, r]));
const fmNaam = {};
for (const lijst of Object.values(oud.FOTMOB_NAMES)) for (const [n, f] of Object.entries(lijst)) if (f) fmNaam[n] = f;

// Optioneel: oude namen → pagina op football-logos.cc (de koppeling uit de logometing van 17 november), voor oudere testdata.
const viaFl = new Map();
if (arg("--koppeling")) {
  const CORRECTIE = { "Stade rennais FC (Frankrijk)": "rennes", "Sporting de Braga (Portugal)": "sc-braga", "F.C. København (Denemarken)": "copenhagen" };
  for (const k of JSON.parse(fs.readFileSync(arg("--koppeling"), "utf8"))) { const slug = CORRECTIE[k.club] || k.slug; if (slug) viaFl.set(k.club, `${k.land}/${slug}`); }
}
const teamIds = {}, nieuweNaam = {}, onbekend = [];
const cats = categorieenUit(data);
for (const [cat, teams] of Object.entries(cats)) {
  for (const team of teams) {
    if (teamIds[team]) continue;
    const nl = team.endsWith(" (Nederland)");
    const kaal = nl ? team.slice(0, -" (Nederland)".length) : team;
    let code = oud.FOTMOB_TEAM_CODES[kaal] || oud.FOTMOB_TEAM_CODES[team];
    let rij = code ? perId.get(String(code)) : null;
    if (!rij) {
      const f = fmNaam[team] || fmNaam[kaal];
      rij = (f && bank.find((r) => r.fotmob_naam === f)) || bank.find((r) => vlak(r.naam) === vlak(kaal.replace(/ \([^)]*\)$/, "")));
    }
    if (!rij && (viaFl.has(team) || viaFl.has(kaal))) { const fl = viaFl.get(team) || viaFl.get(kaal); rij = bank.find((r) => r.football_logos === fl && !/^Jong /.test(r.naam)); }
    if (team === "Amateurclub") rij = perId.get("amateurclub");
    if (!rij) { onbekend.push(`${cat}: ${team}`); continue; }
    teamIds[team] = rij.fotmob_id;
    const europees = cat !== "eredivisie" && cat !== "nederland_extra";
    nieuweNaam[team] = europees ? `${rij.naam} (${nl ? "Nederland" : landNaam[rij.land] || rij.land})` : rij.naam;
  }
}
const uit = { teamIds, nieuweNaam, onbekend };
if (arg("--uit")) fs.writeFileSync(arg("--uit"), JSON.stringify(uit, null, 1));
console.log(`${Object.keys(teamIds).length} teams gekoppeld, ${Object.values(nieuweNaam).filter((n, i) => n !== Object.keys(nieuweNaam)[i]).length} krijgen een andere naam, ${onbekend.length} onbekend${onbekend.length ? ": " + onbekend.join("; ") : ""}`);
