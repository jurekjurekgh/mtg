# PLAN M141 — głębokie interakcje wielokartowe + fuzzer semantyczny + audyt stołu

**Data:** 2026-08-18
**Gałąź sesji:** `arena/01a01517-mtg`
**Kontekst handoff:** M140 zamknięty (5/5 znalezisk: craft/transform P/T=null, token w grobie, goad-blok, morph-FoW, token-kopia animacji). PR #58 (30 commitów) scalony. Pozostałe błędy siedzą na **stykach mechanik**, nie w pojedynczych mechanikach (handoff § „Sugerowane kierunki”). Tester stołu po M138 ma 3 nowe detektory, ale wciąż wyłapuje mniej niż ręczne czytanie (L40). Fuzzer `/tmp/fz/fuzz.mjs` jest najskuteczniejszym narzędziem ostatniej rundy, ale sprawdza inwarianty **strukturalne**, nie semantyczne.

**Cel sesji:** znaleźć i naprawić **≥5 unikalnych błędów** na stykach mechanik (ADR 0002 — generycznie po deskryptorach, nigdy po nazwach kart) oraz domknąć luki narzędziowe, które je dotąd ukrywały. Każdy błąd: repro → root cause → test RED→GREEN → weryfikacja mutacyjna.

---

## 1. Metoda — trzy niezależne osie (żeby nie powielać cudzych tropów)

### Oś A — fuzzer semantyczny (rozszerzenie M140)
- **Baza:** headless mecze `setupCardMatch({seed, decks, registry})` bot vs bot (jak M140) — po **każdej komendzie** kontrola inwariantów.
- **Rozszerzenie vs M140:** dotąd inwarianty były *strukturalne* (CR 704.5f/g, 122.3, 208.1, bilans obiektów). Teraz doklejamy **semantyczne — zgodność zdarzeń ze zmianą stanu**:
  - `damage_dealt.amount` == delta `life` / `poison` / `damage` / `counters -1/-1` (CR 119.3, 120.3).
  - `card_drawn` / `card_milled` / `token_created` == delta stref (`library`, `graveyard`, `battlefield`).
  - `permanent_entered_battlefield` / `permanent_destroyed` / `permanent_exiled` == zmiana `zones.battlefield`.
  - `counter_added` / `counter_removed` == delta `counters`.
  - `object_tapped` / `object_untapped` == zmiana `tapped`.
  - Przyrost `state.events` nie może zawierać `undefined` pól (`total`, `cardId`).
- **Przy każdym trafieniu:** reprodukcja w izolacji przed zgłoszeniem (checki na stanie PO komendzie dają fałszywe alarmy — handoff § Pułapki).
- **Starter seedy:** od 9000 (jak dotąd), docelowo 300+ partii; narzędzie odtworzyć w `/tmp/fz/fuzz.mjs` (ginie z sandboxem).

### Oś B — audyt deskryptorów na stykach (systemowy skan, nie sonda punktowa)
- **Teza handoffu:** błędy siedzą w interakcjach `aura+transform`, `equipment+zmiana kontroli`, `station+animacja`, `token+aura`, `morph+aura`, `bestow+typed`, `craft+flicker` itd. — obszary pojedynczych mechanik są przeorane.
- **Skan:** dla każdej karty z `src/cards/card-data.js` wypisać deskryptory efektów /**triggerów */ kosztów i przeciąć z drugą mechaniką występującą na tym samym obiekcie (np. karta ma `aura` + w talii jest karta z `transform`; `station` + karta z `animatePermanent`).
- **Dla każdego styku:** test izolowany headless — stworzyć stan, nałożyć oba efekty, sprawdzić CR (np. `704.5m/n` dla aur, `301.5` dla equipment, `613` dla warstw, `110.2a` dla kontroli).
- **Kryterium:** błąd generyczny po deskryptorze, nie po nazwie karty (ADR 0002). Jeśli styk wymaga nowej flagi deskryptora (jak `isToken` w M140), flaga musi być jawna i testowana przez nierozróżnialność.

### Oś C — audyt warstwy stołu/UI (src/table) — „czy gracz widzi stan zgodny z zasadami?”
- **Motywacja:** bug #4 M140 pokazał, że FoW wycieka polami pobocznymi (`subtypes`, `morph.cost`). Żaden test `engine` tego nie złapie — wycieki są w `playerView` → `render.js` / `overlays`.
- **Zakres:** porównać `playerView` (to, co dostaje kontroler) z `state` (prawda) dla każdego styku z osi B + dla stanów z fuzzerem: czy stół pokazuje P/T, keywords, typy, koszty, nazwy zgodnie z CR 707/708/613 i czy nie zdradza ukrytego (ręka, biblioteka, morph).
- **Detektor:** rozszerzyć `tools/table-tester/detectors.mjs` o regułę „widok stołu vs stan” (jak `detectHiddenCardLeak` w M123), ale dla P/T i typów — jeśli istnieje, wyłapie przyszłe wycieki bez czytania transkryptu.

---

## 2. Zakres — styki do pierwszego przeszukania (priorytet wg ryzyka)

| # | Styk | Przykładowe karty / deskryptory | Ryzyko wg CR |
|---|---|---|---|
| 1 | **aura + transform (craft / nightbound / flicker)** | Lodestone Needle (craft) + Benevolent Blessing / Grounded / Serra's Embrace; Grizzled Outcasts (day/night) + aura | Aura odpada po zmianie typów (704.5m), `transformedCharacteristics` gubi `aura`/`equipment`? |
| 2 | **equipment + zmiana kontroli** | Greatsword of Tyr / Hunter's Blowgun + Act of Treason-like (Gain control until EOT) | Kto kontroluje sprzęt po kradzieży nosiciela? (301.5d, 110.2a) |
| 3 | **station + animacja** | Wedgelight Rammer (station ≥9 → stwór) + Skilled Animator (animate 5/5) | Dwa efekty warstwy 7b na tym samym artefakcie — który wygrywa? Czy `originalBeforeAnimation` gubi `station`? |
| 4 | **token + aura/equipment + SBA** | token Soldier (Captain's Call) + aura/equipment; token w grobie już naprawiony, ale czy token-aura znika z bitwiska poprawnie? | Token przestaje istnieć poza bitwiskiem (111.7), ale czy aura tokena trafia do grobu? |
| 5 | **morph + aura/equipment + typy** | Monastery Flock / Ainok Tracker (morph) + aura | Face-down to 2/2 bez typów (708.2) — czy aura legalnie celuje? Czy po odkryciu aura zostaje? |
| 6 | **bestow + zmiana strefy** | Leafcrown Dryad (bestow) + bounce/destroy | Bestow jako aura vs jako stwór po nielegalnym celu (702.103b) |
| 7 | **liczniki + transform + SBA** | Skilled Animator + Lodestone + charge counters (Station) | Czy liczniki zostają po transformie? (122.2) |
| 8 | **protection + aura/equipment** | Benevolent Blessing (protection) + aura przeciwnika | Czy SBA zdejmuje aurę chronionego koloru? (702.16c) |
| 9 | **legend rule + token-kopia** | Cogwork Assembler (kopia) + legend | Czy token-kopia legendy wywołuje SBA 704.5j? |
|10 | **day/night + enter triggers** | Plakietka Day/Night + ETB stwora daybound | Czy ETB odpala się przed czy po transformie globalnym? |

*Jeśli styk okaże się czysty, zostaje wpis „sprawdzone i czyste” (jak w M140) — żeby następna sesja nie badała tego drugi raz.*

---

## 3. Dowiezienie — kryteria zakończenia

- [ ] **E0.** Plan jako osobny commit PRZED kodowaniem (ten plik).
- [ ] **E1.** Fuzzer semantyczny odtworzony i uruchomiony (≥200 partii, 0 fałszywych alarmów po repro).
- [ ] **E2.** Skan styków (tabela powyżej) — dla każdego repro headless (pliki `/tmp/repro-*.mjs`).
- [ ] **E3.** Naprawy u root cause + testy regresyjne (każdy bug: test po deskryptorach, mutacja odwracająca, `npm run test:all` zielony).
- [ ] **E4.** (jeśli dotyczy) nowy detektor w `detectors.mjs` + weryfikacja dwustronna (zgłasza przed naprawą, milczy po).
- [ ] **E5.** `npm run test:all` **2248→ zielony bez regresji** + `npm run build` zielony + szybki benchmark (`node tools/benchmark.mjs`) bez regresji vs baseline 63,1/90,5/76,8%.
- [ ] **E6.** Docs: `docs/PROJECT_STATE.md` (wnioski sesji) + `docs/LESSONS.md` (nowe lekcje, jeśli powtarzalne) + aktualizacja opisu PR.

---

## 4. Ryzyka i pułapki (z handoffu i LESSONS)

- **Pułapka M140:** checki na stanie PO komendzie dają fałszywe alarmy — każde trafienie reprodukować w izolacji.
- **L43:** do kasowania obiektu potrzebna flaga jawna (`isToken`), nie heurystyka po `name`.
- **L44:** komentarz z numerem CR nie jest dowodem — czytać treść reguły u źródła.
- **L45:** FoW testować przez nierozróżnialność, nie przez listę pól.
- **Techniczne:** `git commit -m` z nawiasami łamie bash → `git commit -F -`; `gh pr edit` pada na Projects classic → `gh api PATCH`; `parseDeckText` → `.cardIds`; `addObject` gubi pola spoza kontraktu (stderr); `playerView` klucze `assignments` nie `blocks`.
- **Benchmark:** pełna macierz B0 tylko na jawną komendę właściciela (ADR 0018) — domyślnie `node tools/benchmark.mjs` (profil szybki).

---

## 5. Co NIE jest celem tej sesji

- Nowe karty (batch) — brak listy właściciela w backlogu (sekcja 1 pusta).
- Duże feature'y bota (B4/B5) — poza progiem jakości, wymagają osobnej decyzji.
- Zmiany w `main` — praca tylko na `arena/01a01517-mtg`, PR do `main`, squash-merge decyzja właściciela.

*Plan jest punktem startu — jeśli fuzzer wskaże inny styk niż tabela, priorytet ma znalezisko fuzzerowe (dane > hipoteza).*
