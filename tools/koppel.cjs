// Stap 2 van punt 12: de hoogste divisie van elk UEFA-land ophalen bij FotMob en elke club koppelen aan football-logos.cc.
// Gebruik: node tools/koppel.cjs [--poule <poule-fotmob.cjs>] [--koppeling <koppeling.json>]
// Schrijft competities/<land>/<competitie>.csv en tmp/koppel-verslag.json. Downloadt nog geen logo's (zie haal-logos.cjs).
const fs = require("fs");
const path = require("path");
const LANDEN = require("./landen.cjs");

const ROOT = path.join(__dirname, "..");
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36" };
const UA_FL = { "user-agent": "Mozilla/5.0 (voetbalpoule-logobank)" };
const PAUZE_MS = 400;
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (naam) => { const i = process.argv.indexOf(naam); return i > 0 ? process.argv[i + 1] : null; };

async function json(url) {
  for (let poging = 1; poging <= 3; poging++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.json();
    await wacht(1500 * poging);
  }
  throw new Error("Ophalen mislukt: " + url);
}
async function tekst(url) {
  for (let poging = 1; poging <= 3; poging++) {
    const res = await fetch(url, { headers: UA_FL });
    if (res.ok) return res.text();
    if (res.status === 404) return "";
    await wacht(1500 * poging);
  }
  throw new Error("Ophalen mislukt: " + url);
}

const STOP = new Set(["fc", "cf", "sc", "afc", "ac", "as", "fk", "sk", "nk", "bk", "if", "cd", "sv", "vv", "club", "de", "the", "c", "f", "s", "a", "k", "ks", "kv", "rc", "cs", "ud", "sd", "ca", "us", "ss", "ssc", "pfc", "fcs"]);
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss").replace(/ı/g, "i").replace(/ł/g, "l").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
const toks = (s) => norm(s).split(" ").filter((t) => t && !STOP.has(t));
function score(a, b) {
  const ta = toks(a), tb = toks(b);
  if (!ta.length || !tb.length) return 0;
  const past = (t, u) => t === u || (t.length > 3 && u.length > 3 && (u.startsWith(t) || t.startsWith(u)));
  const gedeeld = ta.filter((t) => tb.some((u) => past(t, u))).length;
  return gedeeld / Math.max(ta.length, tb.length);
}

function teamsUit(tabel) {
  const teams = new Map();
  (function loop(v) {
    if (Array.isArray(v)) return v.forEach(loop);
    if (!v || typeof v !== "object") return;
    if (typeof v.id === "number" && typeof v.name === "string" && (v.pageUrl || "").includes("/teams/")) teams.set(v.id, v.name);
    Object.values(v).forEach(loop);
  })(tabel);
  return [...teams].map(([id, naam]) => ({ id: String(id), naam }));
}

function flClubs(html, land) {
  const clubs = new Map();
  const re = new RegExp(`<a href="/${land}/([a-z0-9-]+)/"[^>]*>\\s*<img[^>]*alt="([^"]+) logo"`, "g");
  for (const m of html.matchAll(re)) if (!m[1].includes("--")) clubs.set(m[1], m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'"));
  return [...clubs].map(([slug, naam]) => ({ slug, naam }));
}

const slugVan = (s) => norm(s).replace(/ /g, "-");
const csvVeld = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const KOLOMMEN = ["naam", "fotmob_id", "fotmob_naam", "football_logos", "zekerheid", "eigen_logo", "eigen_pagina"];

(async () => {
  const poule = arg("--poule") ? require(path.resolve(arg("--poule"))) : { FOTMOB_TEAM_CODES: {}, FOTMOB_NAMES: {} };
  const handmatig = arg("--koppeling") ? JSON.parse(fs.readFileSync(arg("--koppeling"), "utf8")) : [];
  const pouleNaamPerId = new Map(Object.entries(poule.FOTMOB_TEAM_CODES).map(([n, id]) => [String(id), n]));
  const pouleNaamPerFotmob = new Map();
  for (const lijst of Object.values(poule.FOTMOB_NAMES)) for (const [n, f] of Object.entries(lijst)) if (f) pouleNaamPerFotmob.set(f, n.replace(/ \([^)]*\)$/, ""));
  const vasteSlug = new Map(handmatig.filter((k) => k.slug).map((k) => [k.club.replace(/ \([^)]*\)$/, ""), k.slug]));
  const correcties = JSON.parse(fs.readFileSync(path.join(__dirname, "correcties.json"), "utf8"));
  const sitemap = await tekst("https://football-logos.cc/sitemap-0.xml");
  const slugsPerLand = {};
  for (const m of sitemap.matchAll(/<loc>https:\/\/football-logos\.cc\/([^/<]+)\/([^/<]+)\/<\/loc>/g)) if (!m[2].includes("--")) (slugsPerLand[m[1]] ||= []).push(m[2]);

  const uefa = await json("https://comp.uefa.com/v2/coefficients?coefficientRange=OVERALL&coefficientType=MEN_ASSOCIATION&language=EN&page=1&pagesize=100&seasonYear=2026");
  const rijen = (uefa.data.members || Object.values(uefa.data).find(Array.isArray)).map((r) => ({ code: r.member.countryCode, plek: r.overallRanking.position }));
  const fotmob = await json("https://www.fotmob.com/api/data/allLeagues");
  const perCode = new Map(fotmob.countries.map((c) => [c.ccode, c]));

  const verslag = { landen: [], zonderFotmob: [], twijfel: [], geen: [] };
  for (const { code, plek } of rijen.sort((a, b) => a.plek - b.plek)) {
    const land = LANDEN[code];
    if (!land) throw new Error("Onbekend UEFA-land: " + code);
    const fm = land.fotmob === null ? null : perCode.get(land.fotmob || code);
    if (!fm) { verslag.zonderFotmob.push(land.nl); continue; }
    const comp = fm.leagues[0];
    const tabel = await json(`https://www.fotmob.com/api/data/tltable?leagueId=${comp.id}`);
    await wacht(PAUZE_MS);
    const teams = teamsUit(tabel);
    const metNaam = flClubs(await tekst(`https://football-logos.cc/${land.fl}/`), land.fl);
    await wacht(PAUZE_MS);
    const bekend = new Set(metNaam.map((k) => k.slug));
    const fl = [...metNaam, ...(slugsPerLand[land.fl] || []).filter((s) => !bekend.has(s)).map((slug) => ({ slug, naam: slug.replace(/-/g, " ") }))];
    const regels = teams.map((t) => {
      const naam = pouleNaamPerId.get(t.id) || pouleNaamPerFotmob.get(t.naam) || t.naam;
      let beste = null;
      const vast = vasteSlug.get(naam);
      if (t.naam in correcties) {
        const c = correcties[t.naam];
        const eigen = typeof c === "object" && c !== null;
        return { naam, fotmob_id: t.id, fotmob_naam: t.naam, football_logos: eigen ? "" : c, zekerheid: c ? "handmatig" : "geen", eigen_logo: eigen ? c.logo : "", eigen_pagina: eigen ? c.pagina || "" : "" };
      }
      if (vast) beste = { slug: vast, s: 1 };
      else for (const k of fl) {
        const s = Math.max(score(t.naam, k.naam), score(naam, k.naam), score(t.naam, k.slug.replace(/-/g, " ")));
        if (!beste || s > beste.s || (s === beste.s && k.slug.length < beste.slug.length)) beste = { slug: k.slug, s };
      }
      const zekerheid = !beste || beste.s === 0 ? "geen" : beste.s >= 0.99 ? "zeker" : beste.s >= 0.5 ? "twijfel" : "geen";
      const r = { naam, fotmob_id: t.id, fotmob_naam: t.naam, football_logos: zekerheid === "geen" ? "" : `${land.fl}/${beste.slug}`, zekerheid, eigen_logo: "" };
      if (zekerheid === "twijfel") verslag.twijfel.push({ land: land.nl, ...r, flNaam: (fl.find((k) => k.slug === beste.slug) || {}).naam });
      if (zekerheid === "geen") verslag.geen.push({ land: land.nl, naam, fotmob_naam: t.naam });
      return r;
    });
    const map = path.join(ROOT, "competities", slugVan(land.nl));
    fs.mkdirSync(map, { recursive: true });
    const bestand = path.join(map, slugVan(comp.name) + ".csv");
    fs.writeFileSync(bestand, [KOLOMMEN.join(","), ...regels.map((r) => KOLOMMEN.map((k) => csvVeld(r[k])).join(","))].join("\n") + "\n");
    verslag.landen.push({ plek, land: land.nl, competitie: comp.name, fotmob: comp.id, clubs: regels.length, zeker: regels.filter((r) => r.zekerheid === "zeker").length, flClubs: fl.length });
    console.log(plek, land.nl, comp.name, regels.length, "clubs,", regels.filter((r) => r.zekerheid === "zeker").length, "zeker");
  }
  fs.mkdirSync(path.join(ROOT, "tmp"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "tmp", "koppel-verslag.json"), JSON.stringify(verslag, null, 1));
  console.log("zonder FotMob:", verslag.zonderFotmob.join(", "), "| twijfel", verslag.twijfel.length, "| geen", verslag.geen.length);
})();
