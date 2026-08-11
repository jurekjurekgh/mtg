# Żywy tester stołu (`tools/table-tester`)

Automatyczny **gracz** na prawdziwym artefakcie `dist/mtg-table.html` (headless
DOM przez jsdom). Uruchamia partię człowiek-vs-bot i gra rolę człowieka:
klika akcje w panelu „Twoje działania", odpowiada na modale (mulligan,
szukanie, scry/surveil, wizardy walki), zamyka modal „Ruch przeciwnika".

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
`--snapshot-every <n>`, `--help`.

## Transkrypt

Co N kroków zapisywany jest stan stołu: wskaźnik tury, stos, panel akcji,
ręka, pola gracza i wroga, ogon logu. `[STOP] brak akcji` = gra utknęła —
sygnał do zbadania. `== KONIEC PARTII ==` = naturalny koniec.

## Pułapki i ograniczenia

- jsdom nie renderuje obrazów ani layoutu — audyt dotyczy **treści DOM**,
  nie wyglądu (wygląd: testy na telefonie).
- Wymagany świeży `npm run build` przed uruchomieniem.
- Sterownik nie testuje: hover, pełnego ekranu, gestów dotyku, kreatora talii.
- Długie partie — limit kroków (`--steps`), przy przekroczeniu `== LIMIT ==`.

Pełna dokumentacja: [`docs/setup/TESTER_STOLU.md`](../../docs/setup/TESTER_STOLU.md).
