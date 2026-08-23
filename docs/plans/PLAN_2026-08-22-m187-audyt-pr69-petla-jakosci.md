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

---

## M188 — uwagi właściciela z testów (A, B, C, K)

Zlecenie w czacie (2026-08-22, po audycie PR #69). Rozpoznanie wykonane
sondami headless PRZED kodowaniem; każda uwaga = osobny zielony commit
z testem RED→GREEN.

### A — Evangel of Synthesis bez badge'a +1/+0

**Rozpoznanie:** silnik liczy POPRAWNIE (repro: 1 dobranie z draw stepu
+ 1 z ETB = `cardsDrawnThisTurn = 2` → `effectivePower = 3`, keyword
`menace`; widok niesie `power: 3` i `grantedKeywords: ['menace']`).
Brakuje wyłącznie BADGE'a `+1/+0`: kafel liczy go z `powerModifier`
(licznikowy modyfikator „until EOT"), a statyka warunkowa (CR 604.3)
jest read-time — modyfikator zostaje 0. Klasa M175/A3, ale dla P/T
zamiast keywordów: badge nadanej mocy nie działał dla ŻADNEJ statyki
warunkowej (Crew Captain, Esper Stormblade, Evangel…).

- [x] widok niesie różnicę „efektywne − wydrukowane" P/T jawnym polem
- [x] kafel pokazuje badge z tego pola (bez zmian dla liczników/pumpów)
- **Zrobione** (a8a0744): `grantedStatBonus()` w permanents.js +
  `grantedPower`/`grantedToughness` w playerView + badge „+1/+0" na kaflu.
  Naprawa obejmuje KAŻDĄ statykę warunkową, aurę, equipment i anthem —
  nie tylko Evangela. Testy: 5 (w tym pełna ścieżka widok→cardInfo→kafel
  i kontrole: brak warunku, licznik +1/+1 bez dubla).

### B — surowe `token_squirrel` w logu Rozgrywki

**Rozpoznanie:** `nameOfObject` obsługuje tokeny (`object.name`), ale gdy
obiektu już nie ma (token zginął — CR 111.7 usuwa go ze stanu), opis
spada do `nameOf(cardId)`, a `token_*` nie istnieje w rejestrze kart →
zwracany jest surowy identyfikator.

- [x] `nameOf` tłumaczy `token_*` na czytelną nazwę („Squirrel")
- **Zrobione** (889cd00): `collectTokenNames(registry)` skanuje deskryptory
  katalogu i uzupełnia mapę nazw sesji — generycznie (ADR 0002), bez
  ręcznej listy. Testy: 3, w tym STRAŻNIK „każdy z 29 tokenów katalogu ma
  nazwę" (nowy token bez nazwy = czerwony test przed merge).

### C — bot atakuje 2/2 w nietapnięte 1/5

**Rozpoznanie:** gałąź „przeżyje, NIE zabije" daje −2, ale premia
`racing` (+8/+20) ją przebija → atak wychodzi na +6 przy passie 0.
Dokładnie klasa L3 (kara musi przebić premię) i L54 (kara mierzona
względem BAZY). Atak jałowy: 0 obrażeń, stwór tapnięty, nie zablokuje.

- [x] atak, który nie zada obrażeń ani nikogo nie zabije, nie może być
      ratowany premią presji/wyścigu (pomiń premię, nie „dołóż karę")
- **Zrobione** (b0ca2d5): licznik `futileAttackers`; gdy CAŁY atak jest
  jałowy, premia wyścigu nie jest naliczana. Sonda potwierdziła zgłoszenie:
  przy życiu obrońcy 8 score ataku = +6, przy 5 = +18, pass = 0.
  Testy: 6 (2 odtwarzające + 4 kontrole anty-over-fix: zabija blokera,
  pusta plansza, lethal przez blokera). **Benchmark: bot SILNIEJSZY** —
  80.1% vs aggro (było 75.3%), 91.1% vs random.

### K — „Przebieg tur (dla AI)": select zamiast 1/2 ostatnich tur

Zlecenie: lista WSZYSTKICH tur od początku gry w `<select>`, wybór
pokazuje jedną turę, przycisk kopiuje ją do schowka. Dwie naraz zbędne.

- [x] `<select>` z turami; render + kopiowanie wybranej tury
- **Zrobione** (b8a8b49): `turnHistoryEntries()` + `turnHistoryTextFor(n)`
  w sesji, `<select>` w renderze (lista przebudowywana tylko przy zmianie
  zestawu tur — nie zamyka się pod palcem), HTML z celem dotyku 36 px,
  kopiowanie wybranej tury. Testy: 3 nowe + zaktualizowane 2 opisujące
  stare zachowanie (przełącznik 1/2 już nie istnieje).

## Wynik M188

`npm test` **2772/2772** · build **52 moduły / 2400.5 kB** ·
benchmark regresji **9/9**, pomiar szybki **85.6%** (575/672) ·
Żywy Tester po zmianach: 0 zgłoszeń.

---

## M190 — uwagi właściciela: Heap Gate (A/A2) + rozgałęzienia lochu (B)

### A/A2 — Heap Gate: dwie zdolności many nie do odróżnienia

Panel pokazuje „(koszt 1, T) — dodaj manę" i „(koszt T) — dodaj manę";
log po aktywacji: „dodanie many do puli ({W}, {U}, {B}, {R}, {G})", co
sugeruje PIĘĆ many zamiast jednej dowolnego koloru.

Root cause: `add_mana` ma jedną etykietę bez względu na `colors`, a log
wypisuje listę dostępnych kolorów jako listę wyprodukowanej many.
Reguła generyczna (ADR 0002): opis czyta deskryptor efektu — 5 kolorów =
„dowolny kolor", brak `colors` = mana bezbarwna, jeden kolor = ten kolor.

- [x] etykieta oferty rozróżnia warianty (any color / bezbarwna / konkretny)
- [x] log mówi „1 mana dowolnego koloru" zamiast listy pięciu symboli
- **Zrobione** (113f3e5): `isAnyColorMana` + `manaEffectLabel` w session.js
  (jedno źródło dla panelu i logu); zdarzenie niesie `manaAmount`.

### B — Undercity: loch to GRAF, nie lista

Zgłoszenie: po Secret Entrance gra sama przenosi do pokoju 2 (Forge),
a wg Oracle gracz WYBIERA ścieżkę. Dane ze Scryfalla (tclb/20):

```
Secret Entrance → Forge, Lost Well
Forge → Trap!, Arena
Lost Well → Arena, Stash
Trap! → Archives
Arena → Archives, Catacombs
Stash → Catacombs
Archives → Throne of the Dead Three
Catacombs → Throne of the Dead Three
Throne of the Dead Three (koniec)
```

Obecnie `ventureIntoUndercity` robi `current + 1` — czyli JEDNĄ ścieżkę
1→2→3…→9, co jest niezgodne z CR 309.4 (gracz wybiera następny pokój
spośród wskazanych strzałkami) i pomija fakt, że loch kończy się po
4–5 pokojach, nie po 9.

- [x] mapa przejść w danych (jedno źródło prawdy, z Oracle)
- [x] wybór następnego pokoju jako blokująca decyzja gracza
- [x] bot wybiera sensownie (wycena pokoi + strażnik zgodności map)
- [x] widok/render: aktualny pokój + dostępne ścieżki
- **Zrobione** (730b705): `leadsTo` w danych, `pendingUndercityRoute` +
  `resolve_undercity_route`, pełne okablowanie warstw, render „Dalsza droga".

### C — Thieves' Tools nie dawało się założyć

- **Zrobione** (a7ff1ec): brakowała zdolność `keyword: 'equip'` (deskryptor
  `equipment` opisuje tylko skutek). Strażnik na cały katalog.

### D — wizard many proponował zapłatę tapnięciem opłacanego źródła

- **Zrobione** (4cbdd67): `manaSourcesOf({ excludeSourceId })` +
  `selfTapExclusionFor` w main.js — wyłącznie dla zdolności z `cost.tap`.

## Wynik M190

`npm test` **2808/2808** · build **52 moduły / 2414.0 kB** ·
benchmark **9/9** · Żywy Tester: 0 zgłoszeń.
