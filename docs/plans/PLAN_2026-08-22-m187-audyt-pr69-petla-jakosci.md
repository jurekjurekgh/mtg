# PLAN M187 — audyt PR #69 + pętla jakości (2026-08-22)

Sesja `arena/01a02a5f-mtg`. Prompt startowy bez nazwanego tematu
(„kontynuujemy, pytaj jeśli masz pytania") → **pętla domyślna ADR 0021**:
PR na starcie → audyt poprzedniego scalonego PR → pętla jakości.
Nie pytam właściciela o kolejkę (ADR 0021 §Decyzja).

## Baseline (zmierzony na starcie, HEAD `ec82411`)

- `npm test` (szybki rdzeń): **2745/2745**, 0 failów, ~83 s.
- `npm run build`: **52 moduły / 2390.0 kB**.
- Zgodne z `docs/PROJECT_STATE.md` (M186: `test:all` 2754/2754).

## Zakres audytu (ADR 0020 B / ADR 0016)

Poprzedni scalony PR: **#69** (squash `ec82411`, base `1565033`) —
262 pliki, +42863/−957, milestony **M171–M186**. To bardzo duży PR
(15 milestonów), więc audyt idzie warstwami, od najwyższego ryzyka:

1. **ADR 0002** — skan całego diffu `src/**` pod kątem przypadków
   specjalnych po nazwie/ID karty (`cardId === '...'`, nazwy własne).
2. **Nowe mechaniki silnika M182–M185** (największe ryzyko regresji):
   fight (CR 701.12), toxic N (CR 702.180), `optional: true` w celach
   („up to one target"), `counter_spell_unless_pays`, aura
   `enchantType: creature_you_control`, `bounce_to_library_bottom`,
   `sacrificeCreaturesByColors`, `tapUntappedSubtype`, `maxManaValue`.
3. **Karty Batch 43/44/45 (30 kart) vs Oracle** (`docs/cards/scryfall-*.json`)
   — ADR 0022: pełny Oracle albo `unsupported`; `limitations` tylko
   z trzech dozwolonych powodów.
4. **Generator talii / auto-awans (M181, ADR 0023)** — czy pliki
   `decks/*.txt` faktycznie odpowiadają generatorowi i czy każda karta
   jest w DOKŁADNIE jednej talii.
5. **Weryfikacja mutacyjna próbki testów** (min. 3 mutacje RED→GREEN):
   test bez naprawy musi czerwienieć.
6. **FoW / determinizm** nowych pendingów (`pendingCounterPay`,
   `pendingGraveFreeCast` itd.) — tylko właściciel decyzji je widzi.

Wynik → `docs/audits/AUDYT_PR69_2026-08-22.md` + opis PR.
Znaleziska naprawiam od razu, każde osobnym zielonym commitem
(ADR 0020 C), z testem RED→GREEN.

## Kroki

- [x] Lektura startowa AGENTS.md §0 (ADR-y, LESSONS, ENVIRONMENT, stan)
- [x] Baseline `npm test` + `npm run build`
- [x] Plan sesji (ten plik) + PR na starcie (ADR 0020 A)
- [ ] A1: skan ADR 0002 (przypadki po nazwie karty) w diffie PR #69
- [ ] A2: audyt nowych mechanik silnika M182–M185 vs CR
- [ ] A3: audyt kart Batch 43–45 vs Oracle (ADR 0022) + limitations
- [ ] A4: audyt talii/generatora (ADR 0023) i pokrycia katalogu
- [ ] A5: weryfikacja mutacyjna próbki testów (≥3)
- [ ] A6: raport `docs/audits/AUDYT_PR69_2026-08-22.md`
- [ ] N*: naprawy znalezisk (osobne commity, testy RED→GREEN)
- [ ] Pętla jakości (ADR 0021 §4) — Żywy Tester / polowanie na CR
- [ ] Dokumentacja: PROJECT_STATE, handoff, opis PR kumulacyjnie

## Ryzyka i pułapki (z LESSONS/ENVIRONMENT)

- **Reset workspace** (9× w historii projektu) — commituj i pushuj po
  każdym zielonym kroku, po commicie `git log --oneline -1` (L9,
  ENVIRONMENT §2).
- **Polskie znaki**: `edit_file` potrafi je uszkodzić → edycje plików
  z polskim tekstem przez `python3`/heredok (ENVIRONMENT §4).
- **Pełne B0 tylko na komendę właściciela** (ADR 0018) — w audycie
  wystarczy `npm test` + `node --test test/bot-benchmark.test.js`.
- **„Zielony" = cały szybki rdzeń**, nie pojedynczy plik (AGENTS.md, M109).
- **Żywy Tester gra na ZBUDOWANYM artefakcie** — `npm run build` przed
  każdą weryfikacją (M180).
- Audyt tak dużego PR (15 milestonów) nie zmieści się w „przejrzeniu
  każdej linii" — priorytetem są mechaniki dodane najpóźniej
  (najmniej przejrzane przez kolejne sesje) i styki między nimi.

## Wynik

(uzupełniany w trakcie sesji)
