# Plan sesji 2026-09-29b — audyt scalonego PR #145 i dalsza pętla jakości

## Zlecenie i stan początkowy

- Prompt właściciela: „Kontynuujemy projekt." — brak nazwanego tematu ⇒
  **ADR 0021** (pętla domyślna): PR na starcie (ADR 0020 A) → **audyt
  poprzedniego scalonego PR** (ADR 0020 B / ADR 0016) → pętla jakości.
- Poprzedni PR: **[#145](https://github.com/jurekjurekgh/mtg/pull/145)** „Audyt
  PR #144 + batch 61 (kolekcja 157-174, 10 kart) — sesja 2026-09-29", scalony
  `2026-09-29T16:09:19Z` jako `6a47c35` (squash). To ostatni commit `main`
  i baza tej gałęzi (`arena/01a0eded-mtg`).
- Zakres #145 (**78 plików, +3827/−276, 21 commitów**), dwa tematy:
  1. **audyt PR #144** (F1 martwy odczyt `view.pendingEffects`, F2/F2b wspólny
     czytnik `stackEntryEffects` w 6 miejscach, F3 `holdsReanimation` +
     `return_creature_card_to_hand`) oraz **PMSSB-21** (mikro-pętla
     `resolve_opponent_target`: `opponentTargetFoeBase`/`ThreatWeight`/
     `ThreatCap`),
  2. **batch 61 — 10 kart kolekcji właściciela** (157 ORI→Kaldheim, 158 OGW,
     160 M11→Dominaria, 161 KTK→Tarkir, 162 DMR→Eldraine, 164 VOW, 165 M20→
     Amonkhet, 167 ISD→Eldraine, 170 MKM→Ravnica, 174 RTR) + token Griffin,
     z czterema nowymi obszarami silnika: **Training** (CR 702.149),
     **Disguise** (CR 702.168a) z **kosztem hybrydowym** `{R/G}` (CR 107.4e),
     **pip bezbarwny {C}** w koszcie zdolności (CR 107.4c), trigger
     `enchanted_creature_dies` z LKI (CR 603.10a) i `aura.mustAttack`
     (CR 508.1c).
- Baseline zmierzony na starcie tej sesji: `npm test` fast **7078/7078**,
  0 fail, ~97 s (zgodny z handoffem `HANDOFF_2026-09-29.md`, sekcja batch 61).

## Roadmapa: etapy, kryteria ukończenia, kolejność commitów

### 0. PR na starcie (ADR 0020 A)

- [x] Plan (ten plik) jako pierwszy commit gałęzi → push → PR do `main`.
- [x] PR zawiera na starcie plan audytu i listę punktów kontrolnych.

### 1. Audyt PR #145 (ADR 0020 B; bez pełnego B0 — ADR 0018)

Kryteria wspólne: każdy zmieniony plik przeczytany w diffie; twierdzenia
regułowe potwierdzone dosłownym tekstem CR/rulingów ze źródła online
(ADR 0030) — nie z pamięci; zero przypadków specjalnych po nazwie/ID karty
w core (ADR 0002); piny potwierdzone mutacyjnie (L13); „stan po PR"
skonfrontowany ze „stanem na starcie PR"; chirurgiczność patchy (ADR 0016 B).

- [ ] **1a. Karty batcha vs Oracle** — porównanie mechaniczne 10 definicji
  z `src/cards/card-data.js` ze snapshotami `docs/cards/scryfall-*.json`
  (koszt many, typy, podtypy, kolory, P/T, `manaCost` = suma symboli — L168,
  pełny Oracle text, `support.limitations` puste wg ADR 0022) oraz wpisami
  `MANA_COSTS`; plan/`artId` wobec `tools/collection-art-ids.csv` (ADR 0029).
- [ ] **1b. Nowe mechaniki silnika** — Training (`conditionHolds`
  + zamrożony wynik w kontekście zdarzenia), Disguise (przyczyna zakrycia,
  2/2 z ward {2}, specjalna akcja bez stosu, `disguiseHybrid`), koszt
  hybrydowy (`colorRequirementsOf`, render w 3 warstwach), `{C}`
  (`unitCoversRequirement`/`unitCoversAnyRequirement` w 5 miejscach
  `resources.js` + kreator), `enchanted_creature_dies` (skan po zdarzeniu aury,
  współzgony, odbicie ≠ śmierć), `aura.mustAttack` (registry → identity →
  `attachmentRestrictions` → `mandatoryAttackerIds`), `targetIndex`
  (counter/bounce), `draw_then_discard` z `discardCount`,
  `trigger.payAfterTarget` (cel przed płatnością).
- [ ] **1c. Audyt #144 (F1–F3) i PMSSB-21** — czy wspólny `stackEntryEffects`
  objął WSZYSTKICH konsumentów kształtu (L72/L41: grep po
  `spell?.effects`), czy `pendingHits` po naprawie F1 liczy stwory (nie wpisy)
  i nie podwaja `saved`, czy parametry PMSSB-21 nie kolidują z progiem dobicia
  i czy `teamPumpSorceryOffWindowPenalty` wróciło do defaults bez dryfu.
- [ ] **1d. Testy z #145** — czy pinują to, co deklarują (L13): `real-cards-
  batch61.test.js` (1137 linii), `audyt-pmssb21-opponent-target.test.js`,
  `etap-f-2026-09-24-granice-katalogu.test.js` (próg {C} w koszcie karty),
  `ability-cost-pips`, `repo-decks`, `statusy-wpisow-katalogu`,
  `transpozycja-ikoria-fiora`; golden-master (dryf 73/73 linii fixture) —
  przypisać dryf do zmian wyceny/talii, nie do regresji (L124).
- [ ] **1e. Warstwa stołu** — `render.js` (etykiety `disguise`/`training`,
  `costSymbols(amount, colors, hybrid)` w 4 konsumentach, `equipPips`),
  `session.js` (`TRIGGER_EVENT_LABELS`), `mana-wizard.js` (wspólny predykat),
  brak Node-globali w grafie artefaktu (L58).
- [ ] **1f. Raport** `docs/audits/AUDYT_PR145_2026-09-29.md` + wynik w opisie
  PR; znalezione błędy naprawiane od razu, osobnymi commitami (ADR 0020 C),
  u root cause, z pinem RED→GREEN i mutacją (L13).

### 2. Pętla jakości (ADR 0021 §4) — temat po audycie

- [ ] Wybór z nowego dowodu (nie z inwencji): kandydaci z handoffu
  (`resolve_discard_choice` 49 remisów rozróżnialnych, `activate_ability` 25,
  `cast_spell` 20), otwarta uwaga **U1** z raportu audytu #144 (mutacje B-M/
  B2-M zielone w rodzinie prewencji) albo znalezisko własne z audytu #145.
- [ ] Plan `docs/plans/PLAN_2026-09-29b-<temat>.md`, sonda PRZED → finding →
  fala → pomiar PO; piny + mutacje; wpis w rejestrze (`docs/PMSSB.md`, jeśli
  to rodzina wyceny bota).
- [ ] **Nie** wymyślam nowego batcha kart (ADR 0029/ADR 0021 §4c) — lista kart
  przychodzi czatem od właściciela.

### 3. Domknięcie sesji

- [ ] Bramy: `npm test` (fast), `npm run test:all`, `npm run build`,
  golden-master 4/4; benchmark tylko profil szybki (ADR 0018).
- [ ] Dokumentacja: `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-09-29b.md`,
  opis PR kumulatywnie; liczby „stanu" mierzone na końcu (L92).

## Ryzyka i pułapki

- **ADR 0030**: każdy mój claim regułowy (Training, Disguise, {C}, LKI,
  „attacks each combat if able") wymaga dosłownego cytatu z bieżącego CR —
  lustro bywa o wydanie do tyłu (L164), a numeracja 702.x się przesuwa (L165).
- **L13/L159**: mutacja musi realnie zajść („WZORZEC NIEZNALEZIONY" = próba
  nieważna) i być wykonana w stronę PRZED naprawą (L114).
- **L5/L27**: zero zgłoszeń detektora to pomiar narzędzia, nie dowód braku
  błędu; strażnik z klauzulą „brak danych = pomijam" nie jest strażnikiem.
- **Środowisko**: sandbox potrafi cofnąć wskaźnik gałęzi, zostawiając pliki
  (leczenie: `git fetch` → `git reset --mixed FETCH_HEAD`, ENVIRONMENT §2);
  logi i sondy trzymam w `dist/logs/` (gitignored), komunikaty commitów poza
  repo; brak egressu — dane CR przez `fetch_page`.
