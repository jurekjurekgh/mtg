# Żywy tester stołu (`tools/table-tester`)

Automatyczny **gracz** na prawdziwym artefakcie `dist/mtg-table.html` (headless
DOM przez jsdom). Uruchamia partię człowiek-vs-bot i gra rolę człowieka:
klika akcje w panelu „Twoje działania", odpowiada na modale (mulligan,
szukanie, scry/surveil, wizardy walki), zamyka modal „Rozgrywka".

Służy do audytu **rozgrywki i UI z perspektywy gracza** — etykiety, modale,
zachowanie bota, kolejność rozstrzygania — rzeczy, których testy engine nie
łapią. To NIE test reguł: źródłem reguł pozostaje engine.

## Instalacja

```bash
npm run build          # w katalogu głównym repo — zbuduj artefakt
cd tools/table-tester
npm i                  # instaluje jsdom (jedyna zależność)
```

## Użycie

```bash
node run-game.mjs --human green --bot red --seed 42 --steps 300 --out t.txt
```

Opcje: `--human <talia>`, `--bot <talia>` (nazwy z `decks/*.txt`), `--seed <n>`,
`--steps <n>`, `--out <plik>`, `--quiet` (bez snapshotów co krok),
`--snapshot-every <n>`, `--profile <p>`, `--policy-seed <n>`, `--tick-rate <0..1>`,
`--help`.

Profile gracza: `greedy` (domyślny), `random`, `defensive`, `explorer`,
`impatient` (M99 — nie czeka na zamknięcie pauzy bota, czasem stuka dwa razy;
jedyny, który odtwarza błędy stanu po odrzuconej komendzie).

## Transkrypt

Co N kroków zapisywany jest stan stołu: wskaźnik tury, stos, panel akcji,
ręka, pola gracza i wroga, ogon logu. `[STOP] brak akcji` = gra utknęła —
sygnał do zbadania. `== KONIEC PARTII ==` = naturalny koniec.

**Oś `noop` (M103, L15) — oferty bez skutku.** Tester otwiera artefakt
z `?tester=1`, przez co UI wystawia mostek `window.__mtgDebug`; przy każdym
kliknięciu panelu sonda (`src/table/noop-probe.js`) wykonuje komendę na
**klonie stanu** z pasywnym przeciwnikiem i porównuje fingerprint przed/po.
Detektor `detectNoEffectOffers` zgłasza kategorią `noop`: kliknięcie bez
zmiany stanu, fizzle przy pasywnym przeciwniku (pewna strata) i akcje,
których jedyną zmianą jest zapłacony koszt. Mostek wymaga świeżego
`npm run build` (przyciski niosą `data-option-key`).

## Pułapki i ograniczenia

- jsdom nie renderuje obrazów ani layoutu — audyt dotyczy **treści DOM**,
  nie wyglądu (wygląd: testy na telefonie).
- Wymagany świeży `npm run build` przed uruchomieniem.
- Sterownik nie testuje: hover, pełnego ekranu, gestów dotyku, kreatora talii.
- Długie partie — limit kroków (`--steps`), przy przekroczeniu `== LIMIT ==`.

Pełna dokumentacja: [`docs/setup/TESTER_STOLU.md`](../../docs/setup/TESTER_STOLU.md).
