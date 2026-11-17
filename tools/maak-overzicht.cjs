// Maakt index.html: alle clubs met hun logo en koppeling, per land en competitie, alfabetisch,
// met bovenaan een zoekbalk en een landfilter. Gebruik: node tools/maak-overzicht.cjs
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

function leesCsv(bestand) {
  const regels = fs.readFileSync(bestand, "utf8").trim().split("\n");
  const splits = (r) => { const uit = []; let v = "", q = false; for (const ch of r) { if (q) { if (ch === '"') q = false; else v += ch; } else if (ch === '"') q = true; else if (ch === ",") { uit.push(v); v = ""; } else v += ch; } uit.push(v); return uit; };
  const kop = splits(regels[0]);
  return regels.slice(1).map((r) => Object.fromEntries(splits(r).map((v, i) => [kop[i], v])));
}
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LANDNAAM = Object.fromEntries(Object.values(require("./landen.cjs")).map((l) => [l.nl.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-"), l.nl]));
const titel = (s) => s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const vergelijk = (a, b) => a.localeCompare(b, "nl", { sensitivity: "base" });
// Volgorde van de competities binnen een land: de hoogste divisie eerst, 'overige clubs' altijd onderaan.
const VOLGORDE = { "eerste-divisie": 2, amateurclubs: 8, "overige-clubs": 9 };
const compNaam = (bestand, land) => (bestand === "overige-clubs" ? `${land} overige clubs` : bestand === "amateurclubs" ? "Amateurclubs" : titel(bestand));

const landen = fs.readdirSync(path.join(ROOT, "competities")).map((map) => ({ map, naam: LANDNAAM[map] || titel(map) })).sort((a, b) => vergelijk(a.naam, b.naam));
let totaal = 0, metLogo = 0;
const delen = landen.map(({ map, naam }) => {
  const comps = fs.readdirSync(path.join(ROOT, "competities", map)).filter((f) => f.endsWith(".csv")).sort((a, b) => (VOLGORDE[a.replace(".csv", "")] || 1) - (VOLGORDE[b.replace(".csv", "")] || 1) || vergelijk(a, b));
  return `<section data-land="${esc(map)}"><details open><summary><h2>${esc(naam)}</h2></summary>${comps.map((c, i) => {
    const rijen = leesCsv(path.join(ROOT, "competities", map, c)).sort((a, b) => vergelijk(a.naam, b.naam));
    totaal += rijen.length;
    metLogo += rijen.filter((r) => r.logo).length;
    return `<details class="comp" data-standaard="${i === 0 ? 1 : 0}"${i === 0 ? " open" : ""}><summary><h3>${esc(compNaam(c.replace(".csv", ""), naam))} <small>(${rijen.length})</small></h3></summary><ul>${rijen.map((r) => {
      const logoLink = r.eigen_logo ? r.eigen_pagina || r.eigen_logo : r.football_logos ? `https://football-logos.cc/${r.football_logos}/` : "";
      const links = [/^[0-9]+$/.test(r.fotmob_id) ? `<a href="https://www.fotmob.com/teams/${esc(r.fotmob_id)}">FotMob</a>` : "", logoLink ? `<a href="${esc(logoLink)}">logo</a>` : "geen logo gevonden"].filter(Boolean).join(" · ");
      const zoek = [r.naam, r.fotmob_naam, r.fl_naam, naam].join(" ").toLowerCase();
      return `<li data-zoek="${esc(zoek)}" data-koppeling="${esc(r.zekerheid)}" class="${r.logo ? "" : "leeg"}">${r.logo ? `<img src="${esc(r.logo)}" alt="" loading="lazy" width="48" height="48">` : `<span class="geen">?</span>`}<span><b>${esc(r.naam)}</b><br><small>${links}</small></span></li>`;
    }).join("")}</ul></details>`;
  }).join("")}</details></section>`;
});

// Onderaan: de logo's van de poule die geen club zijn (poule-logos.csv).
const pouleLogos = fs.existsSync(path.join(ROOT, "poule-logos.csv")) ? leesCsv(path.join(ROOT, "poule-logos.csv")) : [];
const pouleDeel = pouleLogos.length ? `<section data-land="poule-logos"><details open><summary><h2>Poule logo's</h2></summary><ul class="poule">${pouleLogos.map((r) => {
  const bron = r.eigen_logo ? r.eigen_pagina || r.eigen_logo : r.football_logos ? `https://football-logos.cc/${r.football_logos.replace(/^tournaments[/]uefa$/, "uefa").replace(/--.*$/, "")}/` : "";
  return `<li data-zoek="${esc((r.naam + " poule").toLowerCase())}" class="${r.logo ? "" : "leeg"}">${r.logo ? `<img src="${esc(r.logo)}" alt="" loading="lazy" width="48" height="48">` : `<span class="geen">?</span>`}<span><b>${esc(r.naam)}</b><br><small>${bron ? `<a href="${esc(bron)}">logo</a>` : "nog geen logo"}</small></span></li>`;
}).join("")}</ul><p><small>Via Wikimedia Commons: <a href="https://commons.wikimedia.org/wiki/File:Landskampioen_Schaal.png">schaal</a> (Forzaruvo94, CC BY-SA 3.0), <a href="https://commons.wikimedia.org/wiki/File:Trofeo_Eredivisie.svg">gouden schaal</a>, <a href="https://commons.wikimedia.org/wiki/File:Coppa_Campioni.svg">Champions League-beker</a> en <a href="https://commons.wikimedia.org/wiki/File:Trofeo_UEFA_Europa_Conference_League.svg">Conference League-beker</a> (MacMoreno; CC BY-SA 4.0, publiek domein, CC BY 4.0), <a href="https://commons.wikimedia.org/wiki/File:Coppa_dei_Paesi_Bassi.svg">KNVB Beker</a> (MacMoreno, CC BY-SA 4.0), <a href="https://commons.wikimedia.org/wiki/File:Flag_of_the_Netherlands.svg">vlag</a> (publiek domein). Europa League-beker: <a href="https://favpng.com/png_view/european-cup-uefa-europa-league-europe-tottenham-hotspur-fc-uefa-super-cup-201617-uefa-champions-league-png/KPAFZFUp">favpng.com</a> (achtergrond verwijderd). Overige logo's: football-logos.cc.</small></p></details></section>` : "";

const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Logobank</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--ink:#1a1a1a;--muted:#666;--line:#e3e3e3;--card:#f7f7f7}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--ink:#eee;--muted:#aaa;--line:#333;--card:#1e1e1e}}
body{margin:0;padding:16px;font:15px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--ink);max-width:1100px;margin-inline:auto}
h1{margin:0 0 4px}h2{margin:0;display:inline;font-size:1.4em}summary{margin:28px 0 4px;border-bottom:1px solid var(--line);padding-bottom:4px;cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px}summary::-webkit-details-marker{display:none}summary::before{content:"▸";width:1em;text-align:center;font-size:1.1em}details[open]>summary::before{content:"▾"}h3{margin:0;display:inline;font-size:15px}
details.comp{margin-left:22px;padding-left:12px;border-left:2px solid var(--line)}details.comp>summary{margin:12px 0 6px;border:0;padding:0}details.comp>summary::before{content:"+";width:18px;height:18px;line-height:16px;font-size:14px;font-weight:700;border:1px solid var(--muted);border-radius:4px;color:var(--muted)}details.comp[open]>summary::before{content:"−"}small{color:var(--muted)}
.balk{position:sticky;top:0;background:var(--bg);padding:10px 0;display:flex;gap:8px;flex-wrap:wrap;z-index:1;border-bottom:1px solid var(--line)}
.landen{flex:1 1 260px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:4px 6px}.landen input{border:0;flex:1 1 120px;padding:4px;background:transparent}.chip{display:inline-flex;gap:4px;align-items:center;background:var(--line);border-radius:999px;padding:2px 4px 2px 10px}.chip button{border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;padding:0 6px}
.balk input,.balk select{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)}
.balk input{flex:1 1 220px;min-width:0}
ul{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px}
li{display:flex;gap:8px;align-items:center;background:var(--card);border-radius:8px;padding:6px}
img{width:48px;height:48px;object-fit:contain;flex:none;background:#fff;border-radius:8px;padding:3px;box-sizing:border-box}.geen{width:48px;height:48px;display:grid;place-items:center;flex:none;border:1px dashed var(--muted);border-radius:50%;color:var(--muted)}
li img{cursor:zoom-in}
#groot{border:0;padding:0;background:transparent;max-width:none;max-height:none}#groot::backdrop{background:rgba(0,0,0,.72);backdrop-filter:blur(2px)}#groot figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:12px}#groot img{width:min(384px,80vw);height:min(384px,80vw);background:#fff;border-radius:24px;padding:24px;cursor:zoom-out;animation:opkomen .18s ease-out}#groot figcaption{color:#fff;font-size:18px;font-weight:600;text-align:center}#groot button{position:fixed;top:12px;right:16px;font-size:28px;line-height:1;border:0;background:transparent;color:#fff;cursor:pointer}@keyframes opkomen{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
li.leeg{outline:1px dashed #d08a00}a{color:inherit}[hidden]{display:none!important}#niets{margin-top:16px}
</style></head><body>
<h1>Logobank Seizoensvoorspellingen</h1>
<p><small>${totaal} clubs, ${metLogo} met logo. Clublogo's: <a href="https://football-logos.cc/">football-logos.cc</a>; bij 'eigen logo' de officiële site van de club of bond, <a href="https://www.footylogos.com/">FootyLogos</a> of Wikipedia. De logo's zijn eigendom van de clubs. Bijgewerkt: ${new Date().toISOString().slice(0, 10)}.</small></p>
<div class="balk"><input id="zoek" type="search" placeholder="Zoek een club…" aria-label="Zoek een club"><span class="landen"><span id="gekozen"></span><input id="land" list="landlijst" placeholder="Filter op land…" aria-label="Filter op land (typ en kies, meerdere mogelijk)"></span><datalist id="landlijst">${landen.map((l) => `<option value="${esc(l.naam)}" data-map="${esc(l.map)}"></option>`).join("")}</datalist></div>
<p id="niets" hidden>Geen clubs gevonden.</p>
${delen.join("\n")}
${pouleDeel}
<dialog id="groot" aria-label="Logo vergroot"><button type="button" aria-label="Sluiten">×</button><figure><img alt=""><figcaption></figcaption></figure></dialog>
<script>
const groot=document.getElementById("groot");
document.addEventListener("click",e=>{const img=e.target.closest("li img");if(img){const li=img.closest("li");groot.querySelector("img").src=img.src;groot.querySelector("img").alt=li.querySelector("b").textContent;groot.querySelector("figcaption").textContent=li.querySelector("b").textContent;groot.showModal();return}if(groot.open&&(e.target===groot||e.target.closest("#groot img")||e.target.closest("#groot button")))groot.close()});
const zoek=document.getElementById("zoek"),land=document.getElementById("land"),niets=document.getElementById("niets"),gekozenEl=document.getElementById("gekozen");
const kaart=new Map([...document.querySelectorAll("#landlijst option")].map(o=>[o.value.toLowerCase(),{naam:o.value,map:o.dataset.map}]));const gekozen=new Map();
function toonChips(){gekozenEl.innerHTML="";for(const [m,n] of gekozen){const c=document.createElement("span");c.className="chip";c.textContent=n;const b=document.createElement("button");b.type="button";b.textContent="×";b.setAttribute("aria-label",n+" weghalen");b.onclick=()=>{gekozen.delete(m);toonChips();filter()};c.append(b);gekozenEl.append(c)}}
function kies(){const k=kaart.get(land.value.trim().toLowerCase());if(k){gekozen.set(k.map,k.naam);land.value="";toonChips();filter()}}
function filter(){const q=zoek.value.trim().toLowerCase();let n=0;
for(const s of document.querySelectorAll("section")){let zs=0;

if(!s.querySelector(".comp")){let z=0;for(const li of s.querySelectorAll("li")){const t=!gekozen.size&&(!q||li.dataset.zoek.includes(q));li.hidden=!t;if(t)z++}s.hidden=!z;n+=z;continue}
for(const c of s.querySelectorAll(".comp")){let zc=0;for(const li of c.querySelectorAll("li")){const t=(!gekozen.size||gekozen.has(s.dataset.land))&&(!q||li.dataset.zoek.includes(q));li.hidden=!t;if(t)zc++}c.hidden=!zc;c.open=q?zc>0:c.dataset.standaard==="1";zs+=zc}
s.hidden=!zs;n+=zs}niets.hidden=n>0}
zoek.addEventListener("input",filter);land.addEventListener("input",kies);land.addEventListener("change",kies);land.addEventListener("keydown",e=>{if(e.key==="Backspace"&&!land.value&&gekozen.size){gekozen.delete([...gekozen.keys()].pop());toonChips();filter()}});
</script>
</body></html>
`;
fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log("index.html:", totaal, "clubs,", metLogo, "met logo");
