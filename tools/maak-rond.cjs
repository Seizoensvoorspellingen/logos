// Maakt per logo een versie die helemaal binnen een rondje past (Kalle, 18 november 2026): de poule toont logo's in een
// wit rondje, en een logo dat het hele vierkant vult, werd daardoor aan de randen afgesneden.
// Per logo wordt gemeten hoe ver de zichtbare pixels uit het midden reiken (niet doorzichtig en niet bijna wit, want wit
// valt weg tegen het witte rondje). Reikt dat verder dan RAND (deel van de straal), dan wordt het logo precies zoveel
// kleiner gemaakt; anders blijft het even groot. Gemaakt uit het bronbestand (bron/…, tot 1500 px), dus geen extra
// kwaliteitsverlies. Uitvoer: logos/rond/<code>.webp en logos/poule/rond/<sleutel>.webp, 384×384, WebP bijna-lossless 60.
// Draait na tools/maak-overzicht.cjs (gebruikt logos.json); maakt alleen opnieuw wat nieuwer is dan de ronde versie.
// Gebruik: node tools/maak-rond.cjs [--alles]
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const ROOT = path.join(__dirname, "..");
const MAAT = 384;
const RAND = 0.94;
const alles = process.argv.includes("--alles");

async function zichtbaarBereik(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const c = (info.width - 1) / 2, R = info.width / 2;
  let max = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] > 40 && !(data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235)) max = Math.max(max, Math.hypot(x - c, y - c) / R);
    }
  return max;
}

async function maakRond(bron, uit) {
  const opties = { limitInputPixels: false, density: 200 };
  const vierkant = await sharp(bron, opties).resize(MAAT, MAAT, { kernel: "lanczos3", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const bereik = await zichtbaarBereik(vierkant);
  const schaal = bereik > RAND ? RAND / bereik : 1;
  let beeld = vierkant;
  if (schaal < 1) {
    const m = Math.round(MAAT * schaal);
    const klein = await sharp(bron, opties).resize(m, m, { kernel: "lanczos3", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const rand = Math.floor((MAAT - m) / 2);
    beeld = await sharp(klein).extend({ top: rand, left: rand, bottom: MAAT - m - rand, right: MAAT - m - rand, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }
  fs.mkdirSync(path.dirname(uit), { recursive: true });
  await sharp(beeld).webp({ nearLossless: true, quality: 60, effort: 6 }).toFile(uit);
  return schaal;
}

(async () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, "logos.json"), "utf8"));
  const taken = [
    ...Object.entries(index.clubs).map(([code, b]) => [path.join(ROOT, "bron", b), path.join(ROOT, "logos", "rond", `${code}.webp`)]),
    ...Object.entries(index.poule).map(([s, b]) => [path.join(ROOT, "bron", b), path.join(ROOT, "logos", "poule", "rond", `${s}.webp`)])
  ];
  let gemaakt = 0, kleiner = 0, overgeslagen = 0;
  for (const [bron, uit] of taken) {
    if (!fs.existsSync(bron)) { console.log("Geen bron:", path.relative(ROOT, bron)); continue; }
    if (!alles && fs.existsSync(uit) && fs.statSync(uit).mtimeMs >= fs.statSync(bron).mtimeMs) { overgeslagen++; continue; }
    const schaal = await maakRond(bron, uit);
    gemaakt++;
    if (schaal < 1) kleiner++;
  }
  console.log(`${gemaakt} ronde logo's gemaakt (${kleiner} kleiner gemaakt om in het rondje te passen), ${overgeslagen} ongewijzigd.`);
})();
