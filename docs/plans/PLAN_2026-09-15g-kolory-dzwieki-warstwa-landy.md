# PLAN 2026-09-15g — A: dźwięki per kolor, B: scryfall na warstwie, C: minima basic-landów

Trzy zlecenia właściciela z jednej sesji (2026-09-15), jeden plan, trzy tory.
Kolejność: B (widoczny bug) → A (ficzer) → C (ficzer z falą na talie).

## Tor B: scryfall na warstwie nie widać (stół OK)

Diagnoza (E0): `@media (max-aspect-ratio: 7/5)` chowa `.showcase-scryfall`
(`display: none`) — sensowne, gdy KON istnieje. Na preview/świeżym klonie
lokalnego artu NIE MA (FOT/KON 404 → `display: none` z handlera), więc
warstwa jest pusta Z KONSTRUKCJI na wąskich ekranach. Dodatkowo błąd ładowania
sf zostawia `is-loading` (opacity 0) — wbrew komentarzowi „MA BYĆ widoczny".
Werdykt: pre-existing (I2), ODSŁONIĘTE przez 15f (default-ON warstwy).

- [x] B1 RED: `test/m232-hi-gfx-showcase.test.js` +3: błąd KON → wiersz
      dostaje klasę `no-kon`; pin CSS (nadpisanie w media query istnieje);
      błąd sf → zdjęte `is-loading` (zbity obrazek widoczny, nie czarny).
- [x] B2 GREEN: `render.js` (`buildLocal('kon')` error → `row.className +=
      ' no-kon'`; sf error → zdejmij `is-loading`) + CSS override
      (`.showcase-row.no-kon .showcase-scryfall { display: block }`
      w tym samym media query; max-width do 90vw).
- [x] B3: m232 9/9; `m232` zielony + brak regresji suity dla render.js.

## Tor A: dźwięk per kolor (stwór/instant/sorcery × WUBRG)

- [x] A1 RED: rozszerzyć `test/owner-spell-sounds.test.js`: `soundKeyForCard`
      (mono → kolor, multi → `multi`, puste → `colorless`), macierz
      7 typów × 7 kolorów = 49 różnych sygnatur, głośność warstw ≤0,15.
- [x] A2 GREEN (mutacja koloru → 3 RED): `spell-sounds.js`: 7 warstw koloru (R: trzask ognia,
      U: woda, B: mroczny pomruk, W: chime, G: wzrost, colorless: puste
      metaliczne bicie, multi: shimmer-arpeggio); `play('typ:KOLOR')`
      = baza + warstwa (kompozycja, nie 49 receptur); zwykłe `play(typ)`
      działa jak dotąd. Basic landy zostają neutralne (`colors` puste;
      tożsamość z many to follow-up, nie ten tor).
- [x] A3: 25/25, macierz 49/49; mutacja + suita.

## Tor C: minima basic-landów z pipów (generator talii)

Cel: karta z `{R}{R}` wymusza ≥2 Góry; `landSplit` w
`tools/generate-plan-decks.mjs` dostaje minimum per kolor =
max pipów jednej karty (z `coloredPips`, ten sam odczyt).
Niedobór dobierany kosztem innych kolorów (suma stała, deterministycznie
od najmniejszych reszt, nie poniżej ICH minimów); gdy suma minimów > total
→ total rośnie (rzadkie, jawne). Regen `decks/*.txt` + triage fali
(m132, golden-master — regen tylko uzasadniona jak w 15e).

- [x] C1 RED (3 RED, 2 piny starego): testy `landSplit` (min 2 przy koszcie z 2 pipami, shift
      kosztem innego koloru, determinizm, suma minimów > total).
- [x] C2 GREEN (regen: 5 talii × ±1 land, sumy stałe): `landSplit` + regen talii + diff do oceny.
- [x] C3: 3 faile, wszystkie intended (talie): golden-master regen (4/6 partii bit w bit, pierwsze różnice = Swamp→Mountain w tym samym slocie, score te same), podłoga remisów 6→4 (kaladesh trajektoria, per-para, projekcja zielona); triage suity (werdykt per break jak w 15e/E3).

## E4 wspólne

- [x] Bramki ZMIERZONE: `npm test` 5555/5555, `test:all` 5565/5565, build
      61/3713,0 kB, quick 82,6% (555/672, −2 partie — nowe landy, nie silnik).
- [x] Domknięcie: README, PH, handoff, komentarz PR #123, BEZ nowej lekcji.
- [x] Blok przekazania w czacie (ADR 0013).

Commity: `15g/B`, `15g/A`, `15g/C`, `15g/E4`. Gałąź ta sama (sesja).
Ryzyka: C rusza decks/*.txt → fala na fixture (bufor jak 15e/E3);
B: MiniEl bez classList → operacje na stringu className; A: suma
głośności baza+warstwa (dyscyplina ≤0,4 na parametr).
