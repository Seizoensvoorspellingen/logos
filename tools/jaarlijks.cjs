// Jaarlijkse update van de logobank (aan het begin van het seizoen, of vaker als je wilt).
// 1. Per UEFA-land de hoogste divisie (en de competities in EXTRA) opnieuw ophalen bij FotMob en samenvoegen met wat er al staat:
//    - een bekende club (zelfde fotmob_id) houdt zijn regel met alle gegevens (naam, koppeling, eigen logo, versie);
//    - een nieuwe club komt erbij, met een automatische koppeling met football-logos.cc (tools/correcties.json gaat voor);
//    - een club die niet meer in die competitie speelt, verhuist naar competities/<land>/overige-clubs.csv;
//    - clubs in amateurclubs.csv en overige-clubs.csv blijven daar, tenzij ze in een opgehaalde competitie staan;
//    - er wordt nooit een club weggegooid.
// 2. Namencheck: verschilt de naam op FotMob of op football-logos.cc van vorig jaar, dan staat de club in het verslag
//    (de kolom 'naam' blijft staan tot Kalle een nieuwe naam goedkeurt). Nieuwe clubs krijgen eerst de FotMob-naam.
// 3. Daarna: node tools/haal-logos.cjs (logo's van nieuwe clubs), node tools/controleer-logos.cjs --bijwerken
//    (nieuwe logo's van bestaande clubs) en node tools/maak-overzicht.cjs.
// Gebruik: node tools/jaarlijks.cjs [--droog]   (--droog: alleen het verslag, niets wegschrijven)
// Verslag: tmp/jaarverslag.md
const fs = require("fs");
const path = require("path");
const LANDEN = require("./landen.cjs");

const ROOT = path.join(__dirname, "..");
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36" };
const UA_FL = { "user-agent": "Mozilla/5.0 (voetbalpoule-logobank)" };
const PAUZE_MS = 400;
const OVERIG = "overige-clubs.csv";
// Extra competities naast de hoogste divisie (UEFA-landcode → FotMob-competitie). De Eerste divisie hoort bij de poule (KNVB Beker).
const EXTRA = [{ code: "NED", competitie: { id: 111, name: "Eerste Divisie" } }];
const KOLOMMEN = ["naam", "fotmob_id", "fotmob_naam", "football_logos", "fl_naam", "zekerheid", "eigen_logo", "eigen_pagina", "logo", "logo_versie"];
const droog = process.argv.includes("--droog");
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

async function haal(url, soort, kop = UA) {
  for (let poging = 1; poging <= 3; poging++) {
    const res = await fetch(url, { headers: kop });
    if (res.ok) return soort === "json" ? res.json() : res.text();
    if (res.status === 404) return null;
    await wacht(1500 * poging);
  }
  throw new Error("Ophalen mislukt: " + url);
}

function leesCsv(bestand) {
  const regels = fs.readFileSync(bestand, "utf8").trim().split("\n");
  const splits = (r) => { const uit = []; let v = "", q = false; for (const ch of r) { if (q) { if (ch === '"') q = false; else v += ch; } else if (ch === '"') q = true; else if (ch === ",") { uit.push(v); v = ""; } else v += ch; } uit.push(v); return uit; };
  const kop = splits(regels[0]);
  return regels.slice(1).filter(Boolean).map((r) => Object.fromEntries(splits(r).map((v, i) => [kop[i], v])));
}
const csvVeld = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const schrijfCsv = (bestand, rijen) => { fs.mkdirSync(path.dirname(bestand), { recursive: true }); fs.writeFileSync(bestand, [KOLOMMEN.join(","), ...rijen.map((r) => KOLOMMEN.map((k) => csvVeld(r[k])).join(","))].join("\n") + "\n"); };

const STOP = new Set(["fc", "cf", "sc", "afc", "ac", "as", "fk", "sk", "nk", "bk", "if", "cd", "sv", "vv", "club", "de", "the", "c", "f", "s", "a", "k", "ks", "kv", "rc", "cs", "ud", "sd", "ca", "us", "ss", "ssc", "pfc", "fcs"]);
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss").replace(/ı/g, "i").replace(/ł/g, "l").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
const toks = (s) => norm(s).split(" ").filter((t) => t && !STOP.has(t));
function score(a, b) {
  const ta = toks(a), tb = toks(b);
  if (!ta.length || !tb.length) return 0;
  const past = (t, u) => t === u || (t.length > 3 && u.length > 3 && (u.startsWith(t) || t.startsWith(u)));
  return ta.filter((t) => tb.some((u) => past(t, u))).length / Math.max(ta.length, tb.length);
}
const slugVan = (s) => norm(s).replace(/ /g, "-");
function teamsUit(tabel) {
  const teams = new Map();
  (function loop(v) {
    if (Array.isArray(v)) return v.forEach(loop);
    if (!v || typeof v !== "object") return;
    if (typeof v.id === "number" && typeof v.name === "string" && (v.pageUrl || "").includes("/teams/")) teams.set(String(v.id), v.name);
    Object.values(v).forEach(loop);
  })(tabel);
  return [...teams].map(([id, naam]) => ({ id, naam }));
}
function flClubs(html, land) {
  const clubs = new Map();
  const re = new RegExp(`<a href="/${land}/([a-z0-9-]+)/"[^>]*>\\s*<img[^>]*alt="([^"]+) logo"`, "g");
  for (const m of (html || "").matchAll(re)) if (!m[1].includes("--")) clubs.set(m[1], m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'"));
  return [...clubs].map(([slug, naam]) => ({ slug, naam }));
}

// Tweede bron als football-logos.cc niets heeft: footylogos.com (rechten bij de clubs, vraagt bronvermelding 'FootyLogos').
// Alleen bij een volledige naamovereenkomst, om geen verkeerd logo te koppelen. Geeft { logo, pagina } of null.
let footySlugs = null;
async function footylogos(naam) {
  if (!footySlugs) {
    const index = (await haal("https://www.footylogos.com/sitemap.xml", "tekst", UA_FL)) || "";
    let alles = index;
    for (const m of index.matchAll(/<loc>([^<]+[.]xml)<[/]loc>/g)) { alles += (await haal(m[1], "tekst", UA_FL)) || ""; await wacht(PAUZE_MS); }
    footySlugs = [...new Set([...alles.matchAll(/footylogos[.]com[/]logos[/]([a-z0-9-]+)</g)].map((m) => m[1]).filter((x) => !/-(monochrome|white|black|gold|silver)$/.test(x)))];
  }
  const kandidaat = footySlugs.find((slug) => score(naam, slug.replace(/-/g, " ")) >= 0.99);
  if (!kandidaat) return null;
  const html = await haal(`https://www.footylogos.com/logos/${kandidaat}`, "tekst", UA_FL);
  await wacht(PAUZE_MS);
  const svg = html && (html.match(/https:[/][/]assets[.]footylogos[.]com[/]logos[/][a-z0-9-]+[/][a-z0-9-]+-logo-footylogos[.]svg/) || [])[0];
  return svg ? { logo: svg, pagina: `https://www.footylogos.com/logos/${kandidaat}` } : null;
}

(async () => {
  const correcties = JSON.parse(fs.readFileSync(path.join(__dirname, "correcties.json"), "utf8"));
  // Alle bestaande regels, per fotmob_id, met hun huidige bestand.
  const bestaand = new Map();
  const perBestand = new Map();
  for (const land of fs.readdirSync(path.join(ROOT, "competities"))) {
    for (const f of fs.readdirSync(path.join(ROOT, "competities", land)).filter((x) => x.endsWith(".csv"))) {
      const bestand = path.join(ROOT, "competities", land, f);
      const rijen = leesCsv(bestand);
      perBestand.set(bestand, rijen);
      for (const r of rijen) bestaand.set(r.fotmob_id, { r, bestand });
    }
  }
  const nieuwPerBestand = new Map([...perBestand.keys()].map((b) => [b, []]));
  const geplaatst = new Set();
  const compBestanden = new Set();
  const verslag = { nieuw: [], verhuisd: [], naarOverig: [], fotmobNaam: [], flNaam: [], zonderLogo: [], zonderFotmob: [] };

  const sitemap = await haal("https://football-logos.cc/sitemap-0.xml", "tekst", UA_FL);
  const slugsPerLand = {};
  for (const m of sitemap.matchAll(/<loc>https:\/\/football-logos\.cc\/([^/<]+)\/([^/<]+)\/<\/loc>/g)) if (!m[2].includes("--")) (slugsPerLand[m[1]] ||= []).push(m[2]);
  const uefa = await haal("https://comp.uefa.com/v2/coefficients?coefficientRange=OVERALL&coefficientType=MEN_ASSOCIATION&language=EN&page=1&pagesize=100&seasonYear=" + new Date().getFullYear(), "json");
  const codes = (uefa.data.members || Object.values(uefa.data).find(Array.isArray)).map((r) => r.member.countryCode);
  const fotmob = await haal("https://www.fotmob.com/api/data/allLeagues", "json");
  const perCode = new Map(fotmob.countries.map((c) => [c.ccode, c]));

  for (const [code, extra] of [...codes.map((c) => [c, null]), ...EXTRA.map((e) => [e.code, e.competitie])]) {
    const land = LANDEN[code];
    if (!land) throw new Error("Onbekend UEFA-land: " + code + " (voeg het toe aan tools/landen.cjs)");
    const map = path.join(ROOT, "competities", slugVan(land.nl));
    const fm = land.fotmob === null ? null : perCode.get(land.fotmob || code);
    if (!fm) { verslag.zonderFotmob.push(land.nl); continue; }
    const comp = extra || fm.leagues[0];
    const bestand = path.join(map, slugVan(comp.name) + ".csv");
    compBestanden.add(bestand);
    const teams = teamsUit(await haal(`https://www.fotmob.com/api/data/tltable?leagueId=${comp.id}`, "json"));
    await wacht(PAUZE_MS);
    let fl = null;
    const lijst = nieuwPerBestand.get(bestand) || [];
    nieuwPerBestand.set(bestand, lijst);
    for (const t of teams) {
      geplaatst.add(t.id);
      const oud = bestaand.get(t.id);
      if (oud) {
        const r = { ...oud.r };
        if (r.fotmob_naam !== t.naam) { verslag.fotmobNaam.push({ naam: r.naam, oud: r.fotmob_naam, nieuw: t.naam }); r.fotmob_naam = t.naam; }
        if (oud.bestand !== bestand) verslag.verhuisd.push({ naam: r.naam, van: path.relative(ROOT, oud.bestand), naar: path.relative(ROOT, bestand) });
        lijst.push(r);
        continue;
      }
      if (!fl) {
        const metNaam = flClubs(await haal(`https://football-logos.cc/${land.fl}/`, "tekst", UA_FL), land.fl);
        await wacht(PAUZE_MS);
        const bekend = new Set(metNaam.map((k) => k.slug));
        fl = [...metNaam, ...(slugsPerLand[land.fl] || []).filter((s) => !bekend.has(s)).map((slug) => ({ slug, naam: slug.replace(/-/g, " ") }))];
      }
      const r = { naam: t.naam, fotmob_id: t.id, fotmob_naam: t.naam, football_logos: "", fl_naam: "", zekerheid: "geen", eigen_logo: "", eigen_pagina: "", logo: "", logo_versie: "" };
      const c = correcties[t.naam];
      if (c !== undefined) {
        if (c && typeof c === "object") { r.eigen_logo = c.logo; r.eigen_pagina = c.pagina || ""; r.zekerheid = "handmatig"; }
        else if (c) { r.football_logos = c; r.zekerheid = "handmatig"; }
      } else {
        let beste = null;
        for (const k of fl) {
          const s = Math.max(score(t.naam, k.naam), score(t.naam, k.slug.replace(/-/g, " ")));
          if (!beste || s > beste.s || (s === beste.s && k.slug.length < beste.slug.length)) beste = { slug: k.slug, s };
        }
        if (beste && beste.s >= 0.5) { r.football_logos = `${land.fl}/${beste.slug}`; r.zekerheid = beste.s >= 0.99 ? "zeker" : "twijfel"; }
      }
      if (!r.football_logos && !r.eigen_logo) {
        const fy = await footylogos(t.naam);
        if (fy) { r.eigen_logo = fy.logo; r.eigen_pagina = fy.pagina; r.zekerheid = "footylogos"; }
        else verslag.zonderLogo.push(`${t.naam} (${land.nl})`);
      }
      verslag.nieuw.push({ naam: t.naam, land: land.nl, koppeling: r.football_logos || r.eigen_logo || "geen", zekerheid: r.zekerheid });
      lijst.push(r);
    }
  }

  // Clubs die niet meer in een opgehaalde competitie staan: naar overige-clubs van hun land.
  // Clubs in een ander bestand (amateurclubs.csv, overige-clubs.csv) blijven waar ze staan.
  for (const [id, { r, bestand }] of bestaand) {
    if (geplaatst.has(id)) continue;
    if (!compBestanden.has(bestand)) { nieuwPerBestand.get(bestand).push(r); continue; }
    const overig = path.join(path.dirname(bestand), OVERIG);
    if (path.basename(bestand) !== OVERIG) verslag.naarOverig.push({ naam: r.naam, van: path.relative(ROOT, bestand) });
    if (!nieuwPerBestand.has(overig)) nieuwPerBestand.set(overig, []);
    nieuwPerBestand.get(overig).push(r);
  }

  // Namencheck ook voor football-logos.cc: verandert de naam van de gekoppelde pagina, dan melden.
  for (const lijst of nieuwPerBestand.values()) {
    for (const r of lijst) {
      if (!r.football_logos || !r.fl_naam) continue;
      const html = await haal(`https://football-logos.cc/${r.football_logos}/`, "tekst", UA_FL);
      await wacht(PAUZE_MS);
      const naam = html && ((html.match(/aria-label="Download (.+?) svg logo"/) || [])[1] || (html.match(/<title>(.+?) Logo PNG/) || [])[1]);
      const schoon = (naam || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'");
      if (schoon && schoon !== r.fl_naam) { verslag.flNaam.push({ naam: r.naam, oud: r.fl_naam, nieuw: schoon }); r.fl_naam = schoon; }
    }
  }

  if (!droog) {
    for (const [bestand, rijen] of nieuwPerBestand) {
      if (rijen.length) schrijfCsv(bestand, rijen);
      else if (fs.existsSync(bestand)) fs.unlinkSync(bestand);
    }
  }
  const md = [
    `# Jaarverslag logobank (${new Date().toISOString().slice(0, 10)})${droog ? " - droog, niets weggeschreven" : ""}`,
    "",
    `## Nieuwe clubs (${verslag.nieuw.length})`, ...verslag.nieuw.map((x) => `- ${x.naam} (${x.land}): ${x.koppeling}${x.zekerheid === "twijfel" ? " (koppeling nakijken)" : ""}`),
    "", `## Naar een andere competitie (${verslag.verhuisd.length})`, ...verslag.verhuisd.map((x) => `- ${x.naam}: ${x.van} → ${x.naar}`),
    "", `## Niet meer in de hoogste divisie, naar overige clubs (${verslag.naarOverig.length})`, ...verslag.naarOverig.map((x) => `- ${x.naam} (${x.van})`),
    "", `## Andere naam op FotMob (${verslag.fotmobNaam.length}) - naam in de poule nakijken`, ...verslag.fotmobNaam.map((x) => `- ${x.naam}: '${x.oud}' → '${x.nieuw}'`),
    "", `## Andere naam op football-logos.cc (${verslag.flNaam.length}) - naam in de poule nakijken`, ...verslag.flNaam.map((x) => `- ${x.naam}: '${x.oud}' → '${x.nieuw}'`),
    "", `## Nieuwe clubs zonder logo (${verslag.zonderLogo.length}) - zoek via footylogos.com, de clubsite of Wikipedia`, ...verslag.zonderLogo.map((x) => `- ${x}`),
    "", `## Landen zonder competitie op FotMob`, verslag.zonderFotmob.join(", ") || "geen",
    "", "Volgende stappen: node tools/haal-logos.cjs, node tools/controleer-logos.cjs --bijwerken, node tools/maak-overzicht.cjs",
  ].join("\n");
  fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "tmp", "jaarverslag.md"), md + "\n");
  console.log(`Nieuw ${verslag.nieuw.length}, verhuisd ${verslag.verhuisd.length}, naar overig ${verslag.naarOverig.length}, naam FotMob ${verslag.fotmobNaam.length}, naam football-logos ${verslag.flNaam.length}, zonder logo ${verslag.zonderLogo.length}. Verslag: tmp/jaarverslag.md`);
})();
