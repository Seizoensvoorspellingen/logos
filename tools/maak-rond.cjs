// Maakt per logo een versie die helemaal binnen een rondje past en daarin gecentreerd staat (Kalle, 18 november 2026):
// de poule toont logo's in een wit rondje. Een logo dat het hele vierkant vult, werd aan de randen afgesneden, en een
// logo dat niet symmetrisch in zijn vierkant staat (bijv. een schild met een kroon erboven) stond scheef in het rondje.
// Per logo: de zichtbare pixels (niet doorzichtig en niet bijna wit, want wit valt weg tegen het witte rondje), daarvan
// de kleinste omsluitende cirkel. Die cirkel komt precies in het midden en krijgt straal RAND (deel van de straal van
// het rondje); een logo wordt daarbij nooit groter dan het origineel (hooguit MAX_SCHAAL), alleen kleiner waar nodig.
// Gemaakt uit het bronbestand (bron/…, tot 1500 px), dus geen extra kwaliteitsverlies. Uitvoer: logos/rond/<code>.webp
// en logos/poule/rond/<sleutel>.webp, 384×384, WebP bijna-lossless 60.
// Draait na tools/maak-overzicht.cjs (gebruikt logos.json); maakt alleen opnieuw wat nieuwer is dan de ronde versie.
// Gebruik: node tools/maak-rond.cjs [--alles] [--alleen <code of poule-sleutel> …]
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const ROOT = path.join(__dirname, "..");
const MAAT = 384;
const RAND = 0.94;
const MAX_SCHAAL = 1;
const alles = process.argv.includes("--alles");
const alleenIdx = process.argv.indexOf("--alleen");
const alleen = alleenIdx > 0 ? new Set(process.argv.slice(alleenIdx + 1)) : null;
const LEEG = { r: 0, g: 0, b: 0, alpha: 0 };

// Zichtbare pixels als punten (in pixels van een MAAT×MAAT-beeld).
async function zichtbarePunten(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const punten = [];
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] > 40 && !(data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235)) punten.push([x + 0.5, y + 0.5]);
    }
  return punten;
}

// Kleinste omsluitende cirkel (benadering van Bădoiu-Clarkson; ruim nauwkeurig genoeg op 384 px).
function omsluitendeCirkel(punten) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of punten) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  // Alleen de randpunten van de bounding box-hull zijn nodig; voor de eenvoud: alle punten, iteratief.
  for (let i = 1; i <= 400; i++) {
    let ver = null, d = -1;
    for (const p of punten) { const e = (p[0] - cx) ** 2 + (p[1] - cy) ** 2; if (e > d) { d = e; ver = p; } }
    cx += (ver[0] - cx) / (i + 1);
    cy += (ver[1] - cy) / (i + 1);
  }
  let r = 0;
  for (const [x, y] of punten) r = Math.max(r, Math.hypot(x - cx, y - cy));
  return { cx, cy, r };
}

async function maakRond(bron, uit) {
  const opties = { limitInputPixels: false, density: 200 };
  const vierkant = await sharp(bron, opties).resize(MAAT, MAAT, { kernel: "lanczos3", fit: "contain", background: LEEG }).png().toBuffer();
  const punten = await zichtbarePunten(vierkant);
  fs.mkdirSync(path.dirname(uit), { recursive: true });
  if (!punten.length) { await sharp(vierkant).webp({ nearLossless: true, quality: 60, effort: 6 }).toFile(uit); return { schaal: 1, verschuiving: 0 }; }
  const { cx, cy, r } = omsluitendeCirkel(punten);
  const schaal = Math.min(MAX_SCHAAL, (RAND * MAAT) / 2 / r);
  const m = Math.round(MAAT * schaal);
  const klein = await sharp(bron, opties).resize(m, m, { kernel: "lanczos3", fit: "contain", background: LEEG }).png().toBuffer();
  // Het midden van de cirkel (cx, cy op MAAT-schaal) moet op het midden van het nieuwe beeld komen.
  const links = Math.round(MAAT / 2 - cx * (m / MAAT));
  const boven = Math.round(MAAT / 2 - cy * (m / MAAT));
  // Ruim uitbreiden met doorzichtig en dan het vierkant eruit snijden (werkt ook als het plaatje buiten het vierkant valt).
  const P = MAAT;
  // Twee aparte stappen: binnen één bewerking voert sharp 'extract' vóór 'extend' uit.
  const ruim = await sharp(klein).extend({ top: P, left: P, bottom: P, right: P, background: LEEG }).png().toBuffer();
  const beeld = await sharp(ruim).extract({ left: P - links, top: P - boven, width: MAAT, height: MAAT }).png().toBuffer();
  await sharp(beeld).webp({ nearLossless: true, quality: 60, effort: 6 }).toFile(uit);
  return { schaal, verschuiving: Math.hypot(cx - MAAT / 2, cy - MAAT / 2) / MAAT };
}

(async () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, "logos.json"), "utf8"));
  const taken = [
    ...Object.entries(index.clubs).map(([code, b]) => [code, path.join(ROOT, "bron", b), path.join(ROOT, "logos", "rond", `${code}.webp`)]),
    ...Object.entries(index.poule).map(([s, b]) => [s, path.join(ROOT, "bron", b), path.join(ROOT, "logos", "poule", "rond", `${s}.webp`)])
  ];
  let gemaakt = 0, kleiner = 0, verschoven = 0, overgeslagen = 0;
  for (const [naam, bron, uit] of taken) {
    if (alleen && !alleen.has(naam)) continue;
    if (!fs.existsSync(bron)) { console.log("Geen bron:", path.relative(ROOT, bron)); continue; }
    if (!alles && !alleen && fs.existsSync(uit) && fs.statSync(uit).mtimeMs >= fs.statSync(bron).mtimeMs) { overgeslagen++; continue; }
    const { schaal, verschuiving } = await maakRond(bron, uit);
    gemaakt++;
    if (schaal < 0.999) kleiner++;
    if (verschuiving > 0.01) verschoven++;
  }
  console.log(`${gemaakt} ronde logo's gemaakt (${kleiner} kleiner gemaakt, ${verschoven} meer dan 1% verschoven naar het midden), ${overgeslagen} ongewijzigd.`);
})();
