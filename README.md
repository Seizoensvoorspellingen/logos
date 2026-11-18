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
- `logos/<fotmob_id>.webp`: het logo, WebP lossless 384×384 px.
- `bron/<land>/<slug>.webp`: de bron, de PNG van 1500×1500 px van football-logos.cc, lossless als WebP bewaard.
- `tools/`: de scripts (`koppel.cjs`: competities ophalen bij FotMob en koppelen; `haal-logos.cjs`: logo's ophalen en omzetten).

Clubs worden nooit weggegooid. Een club die degradeert, gaat naar `competities/<land>/overige-clubs.csv`.

## Waardenlijsten

`waardenlijsten/<seizoen>/<lijst>.csv`: welke clubs in de keuzelijsten van de poule staan en in welke volgorde (kolommen: plek, naam, fotmob_id, reden, vast). Maken of bijwerken: `node tools/waardenlijsten.cjs --seizoen 2027/2028` (de Eredivisie, Extra punten en KNVB Beker zodra het nieuwe schema op FotMob staat; de Europese toernooien na de loting van de League Phase). Zet je in een lijst bij een regel `vast` op `ja`, dan blijft die lijst ongewijzigd. De regels staan bovenaan `tools/waardenlijsten.cjs`.
