# Jak dodać kartę realną do engine — procedura (ADR 0010 §2a)

Ten dokument to jednorazowy, sprawdzony przepis na dodanie **karty realnej**
do katalogu. Konsoliduje procedurę z [ADR 0010](../decisions/0010-card-rules-data-in-repository.md)
(§2a — obowiązkowy pobór ze Scryfall przed kodowaniem) z praktyką Batche 1–11.
Układ definicji opisuje [ADR 0014](../decisions/0014-card-definitions-single-module.md).

> **Nienegocjowalne:** każda karta ma mieć **mechaniki w 100%** — bez ograniczeń
> „minimalnego modelu" na `support.limitations` (decyzja właściciela 2026-08-03).
> Karta nie dostaje statusu `supported` bez danych reguł ze Scryfall i testów
> (ADR 0010 §4, §2a). Engine pozostaje niezależny od nazw kart (ADR 0002) —
> nową regułę dodajesz jako generyczną mechanikę, nie jako warunek na nazwę.

## Zanim zaczniesz

- Pracujesz na gałęzi sesji (`arena/...`) i zgłaszasz zmianę jako **Pull Request**
  (ADR 0007, `AGENTS.md`). Nie commituj wprost do `main`, nie scalaj sam.
- Przeczytaj kolejno `README.md`, `docs/PROJECT_STATE.md`, `AGENTS.md`,
  ADR 0010, ADR 0014 i odpowiedni fragment `docs/ENGINE_MILESTONES.md`
  (najnowszy batch jako wzorzec).
- Ustal **listę kart od właściciela** (nazwa + set). Zwykle 5 kart na batch,
  odstępstwa możliwe na wyraźną listę właściciela.

## Krok 1 — pobierz dane ze Scryfall (obowiązkowy, pierwszy krok)

Przed wpisaniem czegokolwiek z pamięci pobierz dane każdej karty ze Scryfall
(ADR 0010 §2a). Nie przepisuj kosztu many, typów, P/T ani Oracle text z głowy.

```bash
# jeden przebieg dla całego batcha, poniżej 10 żądań/s (prośba Scryfall)
curl -s "https://api.scryfall.com/cards/named?exact=Highland+Game&format=json"
```

Zapisz wynik jako `docs/cards/scryfall-<slug>.json` (slug = identyfikator karty,
np. `scryfall-highland-game.json`). Wzorowy kształt pliku:

```json
{
  "source": "https://api.scryfall.com/cards/named?exact=Highland+Game",
  "print": "ktk",
  "name": "Highland Game",
  "mana_cost": "{1}{G}",
  "cmc": 2,
  "type_line": "Creature — Elk",
  "oracle_text": "When this creature dies, you gain 2 life.",
  "power": "2",
  "toughness": "1",
  "colors": ["G"],
  "set": "ktk",
  "set_name": "Khans of Tarkir",
  "collector_number": "135",
  "rarity": "common",
  "image_uris": { "large": "…", "normal": "…" },
  "pobrano": "2026-08-03"
}
```

Trzymaj potrzebne pola Oracle (koszt, typy, P/T, tekst) oraz `image_uris.large`
(adres druku dla `imageUri` w definicji). Pole `pobrano` = data weryfikacji tekstu
(łagodzenie ryzyka erraty z ADR 0010).

## Krok 2 — ustal `artId` ze słownika kolekcji

Numer ilustracji z arkusza właściciela (audyt §3.2 — ID jest prefiksem nazwy
pliku w kolumnie `Ilustracja`) bierz z wersjonowanego słownika
`tools/collection-art-ids.csv`:

```csv
Ilustracja,Nazwa Karty
1LTR,Dunland Crebain
```

- Dopasowanie wg nazwy; **duplikaty nazw z różnych setów** rozstrzygaj po secie
  karty (`pickArtId`), inaczej pierwszym wpisem.
- Karta spoza słownika → bez `artId` (tory FOT/KON cicho spadają na Scryfall).
- Uzupełnienie automatyczne (jeśli trzeba): `node tools/fetch-art-ids.mjs`
  (szczegóły: `docs/setup/ILUSTRACJE_KART.md`).

## Krok 3 — zdefiniuj kartę w `src/cards/card-data.js`

Dodaj wpis do sekcji `REAL_CARDS` przez `defineCard({ ... })` (sygnatura:
`src/cards/registry.js`). Nazwa sekcji kart `/ id` w kebab-case, np.:

```js
defineCard({
  id: 'wyspa-spokoju', name: 'Wyspa Spokoju', set: 'LTR',
  types: ['Enchantment'], colors: ['U'], manaCost: 2,
  oracleText: 'When this enchantment enters, draw a card.',
  imageUri: 'https://cards.scryfall.io/large/front/…/…jpg',
  abilities: [
    createAbility({
      type: ABILITY_TYPE.triggered,
      trigger: { event: 'enters' },
      effect: [{ type: 'draw_cards', amount: 1 }],
    }),
  ],
  artId: 302,
  support: { status: 'supported', limitations: [] },
})
```

Kluczowe pola (`defineCard` w `src/cards/registry.js`):

- `id` / `name` / `set` — identyfikator, pełna nazwa, kod setu.
- `types`, `subtypes`, `colors` — linia typów i kolory (z Scryfall).
- `power` / `toughness` / `manaCost` — tylko dla stworów; czar (pole `spell`)
  nie może mieć statystyk.
- `oracleText` — dosłowny tekst Oracle (dane, nie kod).
- `imageUri` — `image_uris.large` konkretnego druku z pliku Scryfall.
- `abilities` — lista `createAbility(...)` (triggered/activated/static).
- `spell` — dla czarów instant/sorcery: `{ timing, targets, effects }`.
- dedykowane deskryptory mechanik: `morph`, `plot`, `entersWithCounters`,
  `phyrexianManaCost`, `transformTo`, `entersTapped`, `bestow`, `aura`,
  `equipment`, `backup` (patrz `registry.js`).
- `artId` — numer z Kroku 2.
- `support` — `{ status: 'supported', limitations: [] }`. **Lista ograniczeń
  powinna być pusta** (pełne mechaniki); jeśli jakaś świadoma luka zostaje,
  zapisuj ją jawnie, ale to wyjątek, nie reguła.

## Krok 4 — nowe mechaniki dodawaj generycznie (ADR 0002)

Jeśli karta wymaga reguły, której engine nie ma, **najpierw nazwij brakującą
ogólną regułę** (np. „trigger wejścia na cudze źródła"), potem zaimplementuj ją
w core (`src/engine/`) jako wielokrotnego użytku. Nie naprawiaj jej warunkiem
zależnym od nazwy karty. Wzorce generycznych mechanik z poprzednich batchy:
`docs/ENGINE_MILESTONES.md` (M8–M24).

## Krok 5 — dodaj talię `decks/real-batchN.txt`

Następny numer batcha (12 po Batche 11). Format (wspólny z kreatorem talii,
ADR 0012): nagłówek `# nazwa` + `Nx Karta`; landy podstawowe bez limitu kopii
(rozstrzygnięcie P7). Wzorzec: `decks/real-batch11.txt`.

```txt
# Dwunasty batch realnych kart (…)
4x NazwaKarty
4x NazwaKarty2
4x Plains
4x Island
```

## Krok 6 — napisz testy `test/real-cards-batchN.test.js`

Wzorzec: `test/real-cards-batch11.test.js`. Dla każdej karty co najmniej:

- **scenariusz legalny** (efekt działa, koszt pokryty, cel poprawny) oraz
- **scenariusz nielegalny** (za mało many / zły cel / koszt niemożliwy do pokrycia)
  — maszynowo rozpoznawalny błąd walidacji (ADR 0010 §koszty; `AGENTS.md`),
- sanity danych (Oracle zgadza się z definicją, `imageUri`/`artId` obecne),
- interakcje z istniejącym katalogiem, które mogą ujawnić brak w core.

Testy core nie używają DOM-u ani sieci (ADR 0011). Sprawdź też, że nowa talia
przechodzi walidację (`assertDeckSupported`).

## Krok 7 — bot, benchmark, progi (tylko gdy zmienia się bot)

Zmiana bota (kontrolery `src/controllers/`) wymaga obowiązkowego pomiaru B0:
`node tools/benchmark.mjs` (~9 min, pełna macierz) i aktualizacji progów
win-rate w `test/bot-benchmark.test.js` (dokumentacja: `docs/BOT_ROADMAP.md`).
Pomiar dodania kart (bez zmiany bota) — wg wzoru z `docs/ENGINE_MILESTONES.md`:
pełna macierz w opisie PR, próbka regresji w `npm test`.

## Krok 8 — aktualizacja dokumentacji

- `docs/PROJECT_STATE.md` — nowy wpis o batchu, liczby testów/artefaktu,
  aktualny stan i najbliższy krok.
- `docs/ENGINE_MILESTONES.md` — nowy milestone (M27…) z zakresem, generycznymi
  mechanikami, świadomymi ograniczeniami i wynikiem pomiaru.
- Jeśli procedura się zmieniła — ten runbook i/lub ADR 0010.

## Krok 9 — weryfikacja końcowa

```bash
npm test        # wszystkie testy zielone (baseline przed zmianą: 571/571)
npm run build   # artefakt dist/mtg-table.html (43 moduły / 513.3 kB przed zmianą)
```

Wynik podaj w opisie PR (liczba testów, liczba modułów i rozmiar artefaktu).

## Checklista na koniec batcha

- [ ] `docs/cards/scryfall-*.json` dla każdej karty (ADR 0010 §2a)
- [ ] definicje w `REAL_CARDS` (`src/cards/card-data.js`) — pełne mechaniki,
      `support.limitations` pusty
- [ ] `artId` ze słownika (lub świadomy brak z powodu spoza kolekcji)
- [ ] talia `decks/real-batchN.txt` + walidacja
- [ ] testy `test/real-cards-batchN.test.js` (legalny + nielegalny + sanity danych)
- [ ] generyczne mechaniki w engine (jeśli nowe), bez warunków na nazwę
- [ ] B0 + progi `test/bot-benchmark.test.js`, jeśli zmieniał się bot
- [ ] `PROJECT_STATE.md` i `ENGINE_MILESTONES.md` zaktualizowane
- [ ] `npm test` zielone, `npm run build` podaje liczby w opisie PR
