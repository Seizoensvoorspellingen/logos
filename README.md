# Logobank Seizoensvoorspellingen

Clubs en logo's voor de voetbalpoule Seizoensvoorspellingen. Overzicht: https://seizoensvoorspellingen.github.io/logos/

Clublogo's: [football-logos.cc](https://football-logos.cc/). De logo's zijn eigendom van de clubs; ze worden hier alleen gebruikt voor een poule onder vrienden, zonder commercieel doel.

## Indeling

- `competities/<land>/<competitie>.csv`: per club één regel. Kolommen:
  - `naam`: naam in de poule (zonder land; de poule zet zelf ' (Land)' erachter bij de Europese toernooien)
  - `fotmob_id`, `fotmob_naam`: de club op FotMob
  - `football_logos`: de pagina op football-logos.cc (`land/slug`), leeg = geen logo gevonden
  - `fl_naam`: de naam van die pagina op football-logos.cc (ter controle)
  - `zekerheid`: `zeker` (naam komt overeen), `nagekeken` (nagekeken door Claude), `handmatig` (zie `tools/correcties.json`) of `geen`
  - `eigen_logo`: een eigen bestand of link; gaat voor op football-logos.cc
  - `logo`: het logo in deze logobank (`logos/<fotmob_id>.webp`)
- `logos/<fotmob_id>.webp`: het logo, WebP bijna-lossless (kwaliteit 60) 384×384 px.
- `logos/rond/<fotmob_id>.webp` en `logos/poule/rond/<sleutel>.webp`: hetzelfde logo, zo nodig kleiner gemaakt en gecentreerd (kleinste cirkel om het zichtbare deel) zodat het helemaal en in het midden van een rondje staat (de poule toont logo's in een wit rondje). Maken: `node tools/maak-rond.cjs` na `tools/maak-overzicht.cjs` (alleen wat nieuw of gewijzigd is; `--alles` maakt alles opnieuw).
- `bron/<land>/<slug>.webp`: de bron, de PNG van 1500×1500 px van football-logos.cc, lossless als WebP bewaard.
- `tools/`: de scripts (`koppel.cjs`: competities ophalen bij FotMob en koppelen; `haal-logos.cjs`: logo's ophalen en omzetten).

Clubs worden nooit weggegooid. Een club die degradeert, gaat naar `competities/<land>/overige-clubs.csv`.

## Waardenlijsten

`waardenlijsten/<seizoen>/<nr>-<lijst>.csv` (1 Eredivisie, 2 KNVB Beker, 3 Champions League, 4 Europa League, 5 Conference League; Extra punten Eredivisie gebruikt de Eredivisielijst, normaal en omgedraaid): welke clubs in de keuzelijsten van de poule staan en in welke volgorde (kolommen: plek, naam, reden, vast, fotmob_id; de FotMob-code koppelt de regel aan de club en het logo in de logobank, ook als de naam verandert). Ze staan ook onderaan het overzicht, onder 'Volgorde waardenlijsten clubs'. Maken of bijwerken: `node tools/waardenlijsten.cjs --seizoen 2027/2028` (de Eredivisie, Extra punten en KNVB Beker zodra het nieuwe schema op FotMob staat; de Europese toernooien na de loting van de League Phase). Zet je in een lijst bij een regel `vast` op `ja`, dan blijft die lijst ongewijzigd. De regels staan bovenaan `tools/waardenlijsten.cjs`.

## Korte namen

`korte-namen.csv` (kolommen: fotmob_id, naam, korte_naam): de korte naam die de poule toont voor een club waarvan de volledige naam niet in een invulveld past (punt 15, Kalle, 20 november 2026). Een invulveld heeft op 12 px vet ±112 px ruimte voor tekst; namen die breder zijn (of minder dan ±3 px over hebben) krijgen een korte naam, die Kalle kiest. De FotMob-code koppelt de regel aan de club, ook als de naam verandert. De poule krijgt ze als `config.korteNamen` ({ "<team in de poule>": "<korte naam>" }), via `voetbalpoule-cloudflare/tools/punt15-korte-namen.mjs`. Bij elk nieuw seizoen: de teams van de poule nameten en voor nieuwe te lange namen Kalle om een korte naam vragen.
