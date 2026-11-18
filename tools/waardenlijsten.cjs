// Waardenlijsten voor de poule: welke clubs in de keuzelijsten staan en in welke volgorde.
// Schrijft waardenlijsten/<seizoen>/<nr>-<lijst>.csv (kolommen: plek, naam, reden, vast, fotmob_id).
// fotmob_id koppelt de regel vast aan de club in de logobank (en dus aan het logo), ook als de naam later verandert.
// Staat in een lijst bij minstens één regel vast=ja, dan blijft die lijst ongewijzigd.
// Regels (Kalle, 17 november 2026):
// - eredivisie: de clubs van dit seizoen; volgorde = eindstand vorig seizoen; promovendi onderaan, op hun eindstand in de Eerste divisie.
// - extra-punten (topscorer, assist-koning, meeste goals): als eredivisie; extra-punten-omgekeerd (minste goals, meeste gele en rode kaarten): omgedraaid.
// - knvb-beker: de eredivisielijst, dan de Eerste divisie zonder Jong-teams (degradanten bovenaan op hun eindstand in de Eredivisie,
//   daarna de rest op eindstand in de Eerste divisie, nieuwkomers onderaan), en 'Amateurclub' helemaal onderaan.
// - champions-league, europa-league, conference-league: de clubs van de League Phase; de titelhouder van dat toernooi bovenaan
//   (als die meedoet), daarna op UEFA-clubcoëfficiënt (ranglijst van het beginjaar van het seizoen; minstens 20% van de
//   landencoëfficiënt, en voor clubs zonder eigen coëfficiënt precies dat landdeel, zoals UEFA bij de loting).
// Namen komen uit de logobank (kolom naam); in de Europese lijsten met ' (<land>)' erachter.
// Gebruik: node tools/waardenlijsten.cjs [--seizoen 2026/2027] [--alleen eredivisie,knvb-beker,…]
const fs = require("fs");
const path = require("path");
const LANDEN = require("./landen.cjs");

const ROOT = path.join(__dirname, "..");
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36" };
const COMP = { eredivisie: 57, eersteDivisie: 111, champions_league: 42, europa_league: 73, conference_league: 10216 };
const EUROPA = { "champions-league": COMP.champions_league, "europa-league": COMP.europa_league, "conference-league": COMP.conference_league };
const KOLOMMEN = ["plek", "naam", "reden", "vast", "fotmob_id"];
// Bestandsnamen met een nummer, zodat GitHub en het overzicht ze in deze volgorde tonen.
const BESTAND = { eredivisie: "1-eredivisie", "extra-punten": "2-extra-punten", "extra-punten-omgekeerd": "3-extra-punten-omgekeerd", "knvb-beker": "4-knvb-beker", "champions-league": "5-champions-league", "europa-league": "6-europa-league", "conference-league": "7-conference-league" };
// Clubs die bij UEFA een andere naam hebben dan in de logobank: FotMob-id → UEFA-id.
const UEFA_KOPPELING = { 7978: "64125", 8391: "52709", 480291: "2605905" };
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };

function huidigSeizoen() {
  const d = new Date();
  const j = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${j}/${j + 1}`;
}
const vorig = (s) => s.split("/").map((j) => +j - 1).join("/");

async function json(url) {
  for (let p = 1; p <= 3; p++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.json();
    await wacht(1500 * p);
  }
  throw new Error("Ophalen mislukt: " + url);
}
// Stand van een competitie in een seizoen: [{ id, naam, plek }] (bij meerdere tabellen: de eerste, de hoofdstand).
// Let op: tltable negeert 'season' en geeft altijd de huidige stand; daarom de competitiebron (leagues), die het seizoen wel volgt.
async function stand(leagueId, seizoen) {
  const j = await json(`https://www.fotmob.com/api/data/leagues?id=${leagueId}&season=${encodeURIComponent(seizoen)}`);
  await wacht(400);
  const gekregen = j.details && (j.details.selectedSeason || j.details.latestSeason);
  if (gekregen && gekregen !== seizoen) throw new Error(`FotMob gaf seizoen ${gekregen} in plaats van ${seizoen} (competitie ${leagueId})`);
  const blok = (Array.isArray(j.table) ? j.table[0] : j.table).data;
  const tabel = blok.table ? blok.table.all : blok.tables[0].table.all;
  return tabel.map((r, i) => ({ id: String(r.id), naam: r.name, plek: r.idx || i + 1 }));
}
async function alleTeams(leagueId, seizoen) {
  const j = await json(`https://www.fotmob.com/api/data/leagues?id=${leagueId}&season=${encodeURIComponent(seizoen)}`);
  await wacht(400);
  const teams = new Map();
  (function loop(v) {
    if (Array.isArray(v)) return v.forEach(loop);
    if (!v || typeof v !== "object") return;
    if ((typeof v.id === "number" || typeof v.id === "string") && typeof v.name === "string" && (v.pageUrl || "").includes("/teams/")) teams.set(String(v.id), v.name);
    Object.values(v).forEach(loop);
  })(j.table);
  return [...teams].map(([id, naam]) => ({ id, naam }));
}
async function titelhouder(leagueId, seizoen) {
  const j = await json(`https://www.fotmob.com/api/data/leagues?id=${leagueId}&season=${encodeURIComponent(seizoen)}`);
  await wacht(400);
  const rondes = (j.playoff && j.playoff.rounds) || [];
  const finale = rondes.find((r) => r.stage === "final");
  const m = finale && finale.matchups && finale.matchups[0];
  return m && m.winner ? String(m.winner) : null;
}

function leesCsv(bestand) {
  if (!fs.existsSync(bestand)) return [];
  const regels = fs.readFileSync(bestand, "utf8").trim().split("\n");
  const splits = (r) => { const uit = []; let v = "", q = false; for (const ch of r) { if (q) { if (ch === '"') q = false; else v += ch; } else if (ch === '"') q = true; else if (ch === ",") { uit.push(v); v = ""; } else v += ch; } uit.push(v); return uit; };
  const kop = splits(regels[0]);
  return regels.slice(1).filter(Boolean).map((r) => Object.fromEntries(splits(r).map((v, i) => [kop[i], v])));
}
const csvVeld = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const vlak = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ø/g, "o").replace(/[^a-z0-9]+/g, " ").trim();
const TOEVOEGING = new Set(["fc", "cf", "afc", "ac", "as", "sc", "fk", "sk", "nk", "bk", "if", "cd", "sv", "club", "jk", "ssc", "kv", "kaa", "rsc", "kf", "pfk", "pfc", "gnk", "hnk", "sl", "rc", "ks", "sad", "de", "fotbal", "football", "futbol", "klubu", "1", "aif", "ff"]);
const kern = (s) => vlak(s).split(" ").filter((t) => t && !TOEVOEGING.has(t)).join(" ");

(async () => {
  const seizoen = arg("--seizoen") || huidigSeizoen();
  const alleen = arg("--alleen") ? new Set(arg("--alleen").split(",")) : null;
  const map = path.join(ROOT, "waardenlijsten", seizoen.replace("/", "-"));
  fs.mkdirSync(map, { recursive: true });
  const landNaam = Object.fromEntries(Object.values(LANDEN).map((l) => [vlak(l.nl).replace(/ /g, "-"), l.nl]));
  const landCode = Object.fromEntries(Object.entries(LANDEN).map(([c, l]) => [vlak(l.nl).replace(/ /g, "-"), c]));
  // Logobank: fotmob_id → { naam, land }.
  const bank = new Map();
  for (const land of fs.readdirSync(path.join(ROOT, "competities"))) for (const f of fs.readdirSync(path.join(ROOT, "competities", land)).filter((x) => x.endsWith(".csv"))) for (const r of leesCsv(path.join(ROOT, "competities", land, f))) bank.set(r.fotmob_id, { naam: r.naam, land, fotmob: r.fotmob_naam });
  const verslag = [];
  const naamVan = (id, fotmobNaam, metLand) => {
    const b = bank.get(id);
    if (!b) verslag.push(`Niet in de logobank: ${fotmobNaam} (FotMob ${id}); FotMob-naam gebruikt.`);
    const naam = b ? b.naam : fotmobNaam;
    return metLand ? `${naam} (${b ? landNaam[b.land] || b.land : "?"})` : naam;
  };
  const schrijf = (lijst, rijen) => {
    if (alleen && !alleen.has(lijst)) return;
    const bestand = path.join(map, (BESTAND[lijst] || lijst) + ".csv");
    if (leesCsv(bestand).some((r) => r.vast === "ja")) { verslag.push(`${lijst}: vastgezet, niet bijgewerkt.`); return; }
    fs.writeFileSync(bestand, [KOLOMMEN.join(","), ...rijen.map((r, i) => KOLOMMEN.map((k) => csvVeld(k === "plek" ? i + 1 : r[k] || "")).join(","))].join("\n") + "\n");
    verslag.push(`${lijst}: ${rijen.length} clubs.`);
  };

  // Eredivisie, Extra punten en KNVB Beker.
  const vor = vorig(seizoen);
  const nu = await stand(COMP.eredivisie, seizoen);
  const eredivisieVorig = new Map((await stand(COMP.eredivisie, vor)).map((r) => [r.id, r.plek]));
  const eersteVorig = new Map((await stand(COMP.eersteDivisie, vor)).map((r) => [r.id, r.plek]));
  const ere = nu.map((r) => ({ ...r, ev: eredivisieVorig.get(r.id), dv: eersteVorig.get(r.id) }))
    .sort((a, b) => (a.ev ? 0 : 1) - (b.ev ? 0 : 1) || (a.ev || 99) - (b.ev || 99) || (a.dv || 99) - (b.dv || 99))
    .map((r) => ({ naam: naamVan(r.id, r.naam), fotmob_id: r.id, reden: r.ev ? `Eredivisie ${vor}: ${r.ev}` : r.dv ? `promovendus, Eerste divisie ${vor}: ${r.dv}` : "nieuw" }));
  schrijf("eredivisie", ere);
  schrijf("extra-punten", ere);
  schrijf("extra-punten-omgekeerd", [...ere].reverse());
  const eerste = (await stand(COMP.eersteDivisie, seizoen)).filter((r) => !/^Jong /.test(r.naam))
    .map((r) => ({ ...r, ev: eredivisieVorig.get(r.id), dv: eersteVorig.get(r.id) }))
    .sort((a, b) => (a.ev ? 0 : a.dv ? 1 : 2) - (b.ev ? 0 : b.dv ? 1 : 2) || (a.ev || 99) - (b.ev || 99) || (a.dv || 99) - (b.dv || 99))
    .map((r) => ({ naam: naamVan(r.id, r.naam), fotmob_id: r.id, reden: r.ev ? `degradant, Eredivisie ${vor}: ${r.ev}` : r.dv ? `Eerste divisie ${vor}: ${r.dv}` : "nieuw in de Eerste divisie" }));
  schrijf("knvb-beker", [...ere, ...eerste, { naam: "Amateurclub", fotmob_id: "amateurclub", reden: "vaste keuze onderaan" }]);

  // Europese toernooien.
  const beginjaar = seizoen.split("/")[0];
  const uefa = await json(`https://comp.uefa.com/v2/coefficients?coefficientRange=OVERALL&coefficientType=MEN_CLUB&language=EN&page=1&pagesize=500&seasonYear=${beginjaar}`);
  // Coëfficiënt voor de loting: de eigen clubpunten, maar minstens 20% van de landencoëfficiënt (UEFA-regel).
  const uefaClubs = (uefa.data.members || Object.values(uefa.data).find(Array.isArray)).map((r) => ({ ...r.member, punten: Math.max(r.overallRanking.totalPoints, r.overallRanking.nationalAssociationPoints || 0), plek: r.overallRanking.position }));
  // Clubs zonder eigen coëfficiënt (nieuwkomers) krijgen 20% van de landencoëfficiënt.
  const landen = await json(`https://comp.uefa.com/v2/coefficients?coefficientRange=OVERALL&coefficientType=MEN_ASSOCIATION&language=EN&page=1&pagesize=100&seasonYear=${beginjaar}`);
  const landdeel = Object.fromEntries((landen.data.members || Object.values(landen.data).find(Array.isArray)).map((r) => [r.member.countryCode, Math.floor(r.overallRanking.totalPoints * 0.2 * 1000) / 1000]));
  for (const [lijst, leagueId] of Object.entries(EUROPA)) {
    const teams = await alleTeams(leagueId, seizoen);
    const houder = await titelhouder(leagueId, vor);
    const rijen = teams.map((t) => {
      const b = bank.get(t.id);
      const code = b && landCode[b.land];
      const kandidaten = uefaClubs.filter((u) => u.countryCode === code);
      const namen = [t.naam, b && b.naam, b && b.fotmob].filter(Boolean).map(kern);
      const u = (UEFA_KOPPELING[t.id] && uefaClubs.find((x) => x.id === UEFA_KOPPELING[t.id])) || kandidaten.find((x) => [x.displayName, x.displayOfficialName, x.internationalName, x.displayNameShort].some((n) => namen.includes(kern(n))))
        || kandidaten.find((x) => namen.some((k) => { const a = kern(x.displayName); return a.length >= 4 && k.length >= 4 && (a.includes(k) || k.includes(a)); }));
      const deel = code ? landdeel[code] : undefined;
      if (!u && deel === undefined) verslag.push(`${lijst}: geen UEFA-coëfficiënt en geen land gevonden voor ${t.naam}; onderaan gezet.`);
      return { id: t.id, naam: naamVan(t.id, t.naam, true), houder: t.id === houder, punten: u ? u.punten : deel !== undefined ? deel : -1, uefaPlek: u ? u.plek : 9999, uefaNaam: u ? u.displayName : "", landdeel: !u && deel !== undefined };
    }).sort((a, b) => (b.houder - a.houder) || b.punten - a.punten || a.landdeel - b.landdeel || a.uefaPlek - b.uefaPlek);
    schrijf(lijst, rijen.map((r) => ({ naam: r.naam, fotmob_id: r.id, reden: r.houder ? `titelhouder ${vor}` : r.landdeel ? `geen eigen coëfficiënt; 20% van het land: ${r.punten}` : r.punten >= 0 ? `UEFA-coëfficiënt ${beginjaar}: ${r.punten} (plek ${r.uefaPlek})` : "geen UEFA-coëfficiënt" })));
  }
  fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "tmp", "waardenlijsten-verslag.txt"), verslag.join("\n") + "\n");
  console.log(`Seizoen ${seizoen}:\n` + verslag.join("\n"));
})();
