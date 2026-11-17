// Namencheck, stap 1: per club de naam op FotMob, op football-logos.cc en (Europese clubs) bij UEFA naast elkaar.
// Zijn ze gelijk (los van hoofdletters, accenten en vaste toevoegingen als FC, CF, JK), dan geldt FotMob.
// Anders moet de naam worden opgezocht op de officiële site van de club. Schrijft tmp/namen.json.
// Gebruik: node tools/vergelijk-namen.cjs
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const LANDEN = require("./landen.cjs");

// Vaste toevoegingen (rechtsvorm, 'club', 'voetbal') die niet meetellen bij het vergelijken.
const TOEVOEGING = new Set(["fc", "f", "c", "cf", "afc", "ac", "as", "sc", "fk", "sk", "nk", "bk", "if", "cd", "sv", "vv", "club", "jk", "ssc", "kv", "kaa", "rsc", "krc", "kf", "pfk", "pfc", "ofk", "gnk", "hnk", "sl", "rc", "ud", "sd", "ca", "us", "ss", "ks", "fotbal", "football", "futbol", "klubu", "kulubu", "as", "a", "s", "sad", "spor", "sporting", "gks", "mks", "tsg", "vfb", "vfl", "1", "cfr", "fcsb", "osk", "sk", "ik", "ff", "aif", "bois", "fbk", "jk", "ksc", "cs", "acs", "fcv"]);
const vlak = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss").replace(/ı/g, "i").replace(/ł/g, "l").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
const kern = (s) => vlak(s).split(" ").filter((t) => t && !TOEVOEGING.has(t)).join(" ");

function leesCsv(bestand) {
  const regels = fs.readFileSync(bestand, "utf8").trim().split("\n");
  const splits = (r) => { const uit = []; let v = "", q = false; for (const ch of r) { if (q) { if (ch === '"') q = false; else v += ch; } else if (ch === '"') q = true; else if (ch === ",") { uit.push(v); v = ""; } else v += ch; } uit.push(v); return uit; };
  const kop = splits(regels[0]);
  return regels.slice(1).map((r) => Object.fromEntries(splits(r).map((v, i) => [kop[i], v])));
}

(async () => {
  const uefa = await (await fetch("https://comp.uefa.com/v2/coefficients?coefficientRange=OVERALL&coefficientType=MEN_CLUB&language=EN&page=1&pagesize=500&seasonYear=2026")).json();
  const uefaClubs = (uefa.data.members || Object.values(uefa.data).find(Array.isArray)).map((r) => r.member);
  const landCode = Object.fromEntries(Object.entries(LANDEN).map(([code, l]) => [l.nl.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-"), code]));
  const uit = [];
  for (const land of fs.readdirSync(path.join(ROOT, "competities"))) {
    for (const f of fs.readdirSync(path.join(ROOT, "competities", land)).filter((x) => x.endsWith(".csv"))) {
      for (const r of leesCsv(path.join(ROOT, "competities", land, f))) {
        const code = landCode[land];
        const kandidaten = uefaClubs.filter((u) => u.countryCode === code);
        const k = kern(r.fotmob_naam);
        const u = kandidaten.find((x) => [x.displayName, x.displayOfficialName, x.internationalName].some((n) => kern(n) === k))
          || kandidaten.find((x) => { const a = kern(x.displayName); return a && (a.includes(k) || k.includes(a)) && Math.min(a.length, k.length) >= 4; });
        const namen = { fotmob: r.fotmob_naam, football_logos: r.fl_naam || "", uefa: u ? u.displayName : "" };
        const kernen = new Set(Object.values(namen).filter(Boolean).map(kern));
        uit.push({ land, competitie: f.replace(".csv", ""), fotmob_id: r.fotmob_id, naam_nu: r.naam, ...namen, uefa_officieel: u ? u.displayOfficialName : "", gelijk: kernen.size === 1 });
      }
    }
  }
  fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "tmp", "namen.json"), JSON.stringify(uit, null, 1));
  console.log(`${uit.length} clubs: ${uit.filter((x) => x.gelijk).length} gelijk, ${uit.filter((x) => !x.gelijk).length} opzoeken (${uit.filter((x) => x.uefa).length} gevonden bij UEFA)`);
})();
