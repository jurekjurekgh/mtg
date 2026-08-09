# PLAN 2026-08-09 — UX walki i many: uwagi właściciela A/B/C/D/R (M66)

Data: 2026-08-09. Sesja: `arena/019fe7ec-mtg` (PR #39 — kontynuacja po audycie M65).
Zlecenie właściciela po testach na iPadzie: 5 uwag (A–D, R) + audyt wykazał 2 dodatkowe błędy.

## Uwagi właściciela → przyczyny

- **A. Spacja przed `)` w etykietach akcji.** Przycisk `.action` to `display:flex; gap:8px` —
  każda ikona many (`<span class="ms-group">`) i fragmenty tekstu stają się OSOBNYMI
  flex-itemami, więc `gap` wstawia lukę między ostatnią ikoną a `)`. Fix: `gap:0` +
  `.action::before { margin-right:8px }` (jedyna zamierzona separacja to diament od tekstu).
- **A2 (błąd wykryty): `MANA_COSTS` kończy się na Batchu 24** (142 wpisy, brak 20 kart
  Batchy 25+26). Skutki: (1) etykiety akcji pokazują surową liczbę zamiast ikon;
  (2) **walidacja kolorów przy rzucie pominięta** — `hasColorManaForCard` zwraca true bez
  wpisu, `coloredPipsOf` daje [] → np. Might of the Masses {G} da się rzucić za {U}
  (potwierdzone testem). Fix: uzupełnić MANA_COSTS o 20 kart (i sprawdzić tokeny);
  strażnik w `card-data.test.js` — każda karta `supported` ma wpis MANA_COSTS.
- **B. Atakujący/blokujący — lista kombinacji.** `legalAttackerOptions`/`legalBlockerOptions`
  enumerują podzbiory (do cap 32); przy 5 stwornach 20+ przycisków. Fix (UI): grupujemy
  WSZYSTKIE komendy `declare_attackers` w JEDEN wpis „Wybierz atakujących" → wizard
  z przełącznikami tak/nie przy każdym zdolnym stworze (union id z komend), potwierdzenie
  wysyła finalną komendę. Analogicznie `declare_blockers` (per atakujący, przełączniki
  blokerów; menace ≥2 / cantBlockAlone z partnerem pilnowane w wizardzie). Engine
  pozostaje walidatorem (execute przyjmuje dowolny legalny podzbiór); enumeracja zostaje
  dla botów/testów (b0), UI nigdy nie pokazuje kombinacji.
- **C. Log walki gubi nazwy („?").** `damage_dealt`/`attackers_declared`/`blockers_declared`
  niosą tylko ID obiektów; po śmierci w SBA obiekt znika z `state.objects` (nowe ID w
  grobie) → `nameOfObject` → „?". Fix: zdarzenia niosą `cardId` (LKI) — `sourceCardId`/
  `targetCardId` w damage_dealt, `attackerCardIds` w attackers_declared, mapa `cards`
  w blockers_declared; session.js używa `nameOf(cardId)` z fallbackiem. Dodatkowo
  **session.js myli atakującego z blokerem** w `blockers_declared` (klucz = atakujący,
  render „<atakujący> blokuje <bloker>") — poprawić kierunek.
- **D. 3/3 vs bloker 1/1 — log „zadała 1".** Engine przydzielał dokładnie lethal.
  MtG: gracz wybiera ilość. Przy JEDNYM blokerze (bez trample) naturalny wybór = CAŁA
  moc (3) — fix deterministyczny (bez wizarda). Przy wielu blokerach — decyzja gracza (R).
- **R. Rozdzielanie obrażeń przy wielu blokerach — decyzja gracza, bez kombinacji.**
  Nowa decyzja engine `pendingDamageAssignment` (CR 510.1c/d): gdy zablokowany atakujący
  ma >1 blokera ALBO trample — `resolve_combat` kolejkuje decyzję atakującego; PlayerView
  wystawia dane (moc, żywi blokerzy, lethal); `legalCommands` oferuje DOKŁADNIE JEDEN
  wariant = deterministyczny default (lethal-first w kolejności deklaracji — obecne
  zachowanie, boty biorą pierwszy wariant i B0 bez zmiany przebiegu); gracz-człowiek
  dostaje wizard (steppery +/− przy blokerach, reszta z trample do gracza), który buduje
  `resolve_damage_assignment { assignments }`; execute waliduje (permutacja żywych
  blokerów, sum ≤ moc, reguła „≥ lethal przed następnym", CR 510.1d). Pojedynczy bloker
  bez trample — auto pełna moc (D). Po decyzji pass obrażeń wznawia się.

## Etapy (commity w PR #39, każdy zielony: npm test + build)

1. **Plan** — ten plik (osobny commit PRZED kodowaniem).
2. **A2: MANA_COSTS 20 kart** + strażnik w card-data.test.js (każda `supported` ma wpis) +
   test kolorów (Might {G} za {U} odrzucone). 
3. **C: cardId w zdarzeniach walki + session.js** (mapowanie blokerów, nameOf z cardId) +
   testy logu po śmierci.
4. **D: pojedynczy bloker = pełna moc** (combat.js) + test 3/3 vs 1/1 → damage 3.
5. **R: engine pendingDamageAssignment** (combat.js + game-state.js + protocol) +
   default dla botów + walidacja + testy (multi-bloker decyzja, bot default, illegal reject).
6. **B: wizard atakujących/blokujących** (render.js grupowanie + choice-request.js wizard +
   main.js wiring) + testy UI.
7. **R: wizard obrażeń** (choice-request.js) + wiring + testy UI.
8. **A: CSS .action gap** (index.html) — bez testu headless (wizualne), udokumentowane.
9. **Benchmark + docs** — pełne B0 (13500, 0 crashy, progi 0.78/0.57), ENGINE_MILESTONES
   M66, PROJECT_STATE, ROADMAP, HANDOFF_2026-08-09e, opis PR kumulacyjnie.

## Pułapki

- `edit_file` psuje PL → python3 Path.read_text/write_text; commity z msg przez /tmp.
- resolve_damage_assignment to nowa komenda → COMMAND_TYPES/EVENT_TYPES + bramki pending
  w `decisionPlayer`/execute/legalCommands (wzorzec scry/surveil — nie zapomnieć o
  blokowaniu pass i o `restorePriorityTo`).
- Lethal przy walidacji liczyć NA ŻYWO (między kolejką a decyzją bloker mógł dostać
  buffa/zginąć); żywych blokerów filtrować w momencie rozstrzygnięcia (CR 608.2b).
- Single-blocker-full-power NIE dotyczy trample (nadmiar musi iść na gracza) ani
  wielu blokerów.
- Bots: dodać `resolve_damage_assignment` do list heuristic ('ability') i aggro ('simple');
  random bierze jedyny wariant. Zmiana przestrzeni komend bota → pełne B0.
- Wizard atakujących: goad/must-attack (w każdym wariancie) pre-check i nieodłączalne;
  cantAttackAlone (Ember Beast) — pojedynczy wybór zablokowany; menace — 0 albo ≥2.
- MANA_COSTS: puste stringi dla lądów (jak rupture-spire); nie łamać istniejących 142.
- Stare replaye z multi-bloker combat po zmianie wymagają resolve_damage_assignment —
  akceptowane (replaye diagnostyczne, ADR 0005); testy determinizmu zaktualizować.
