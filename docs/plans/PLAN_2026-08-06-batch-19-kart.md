# Roadmapa zadania: Batch 19 — dziesięć realnych kart (2026-08-06)

**Zadanie od właściciela (2026-08-06):** Batch 19 — dziesięć kart:
Illvoi Operative (EOE), Grounded (AVR), Ruinous Rampage (EOE),
Tellah, Great Sage (FIN), Etherium Sculptor (ALA), Boros Challenger (GRN),
Pilgrim's Eye (GNT), Dementia Bat (NPH), Seer's Lantern (OGW),
You're Confronted by Robbers (CLB).

Runbook: `docs/cards/HOW_TO_ADD_CARD.md`. Wzorzec wykonania: Batch 18
(`test/real-cards-batch18.test.js`, wpis M36). Model: 1 sesja = 1 PR
(**PR #29** — dopisujemy commity, opis kumulatywny, scalanie wyłącznie przez
właściciela metodą Squash and merge). Zasady z AGENTS.md: engine generyczny
(ADR 0002 — zero warunków na nazwę/ID karty w core), `supported` = 100%
mechaniki z Oracle + dane Scryfall PRZED kodowaniem (ADR 0010 §2a) + testy
legalny/nielegalny, wybory gracza jako blokujące decyzje, każdy commit
samodzielnie zielony (`npm test` + `npm run build`) i pushowany od razu,
zmiana bota/komend/decyzji = pełny B0, progi benchmarku tylko w górę,
losowość przez seedowane RNG, nowe karty do istniejących talii singleton
w `decks/`.

## Rozpoznanie (przed planem) — co już istnieje

Baseline: **820/820** testów, artefakt **48 modułów / 860,1 kB** (koniec M37).

Dane pobrane ze Scryfall (10 kart, jeden przebieg, set z listy właściciela;

> Uwaga: „GNT" to Game Night (box set 2018) — Pilgrim's Eye istnieje w tym
> secie, collector 55; brak pomyłki w liście):

| Karta | Koszt | Typ / PT | Mechanika (Oracle) | Co już jest / czego brakuje |
| --- | --- | --- | --- | --- |
| Illvoi Operative | {1}{U} | Creature — Jellyfish Rogue 2/1 | „Whenever you cast your **second spell each turn**, +1/+1 counter on this creature" | BRAK trigger'a licznika rzutów; `spellsCastThisTurn` jest GLOBALNE → per-player potrzebne |
| Grounded | {1}{G} | Enchantment — Aura | „Enchanted creature **loses flying**" | aury istnieją (Hobble: cantAttack/cantBlock); BRAK „loses keyword" z załącznika |
| Ruinous Rampage | {1}{R}{R} | Sorcery | **Choose one**: 3 dmg każdemu przeciwnikowi / exile wszystkich artefaktów MV ≤ 3 | modal `spell.modes` ISTNIEJE (Aerith); `damage_each_opponent` istnieje; BRAK `exile_all` z filtrem (typ + mana value) |
| Tellah, Great Sage | {3}{U}{R} | Legendary Creature 3/3 | noncreature spell → token Hero 1/1; 4+ many wydane → draw 2; 8+ → poświęć Tellah i tyle obrażeń każdemu przeciwnikowi | `you_cast_noncreature_spell` ISTNIEJE (prowess), `token_hero` ISTNIEJE (Aerith); BRAK: licznik WYDANEJ many (manaSpent), warunki progowe w triggerze, obrażenia = wydana mana; prawo legend JUŻ JEST (M37) |
| Etherium Sculptor | {1}{U} | Artifact Creature 1/2 | „Artifact spells you cast cost {1} less" | `effectiveSpellManaCost` ISTNIEJE, ale tylko obniżka warunkowa WŁASNEGO czaru (Metalcraft); BRAK modyfikatorów kosztu z permanentów na bitwisku |
| Boros Challenger | {R}{W} | Creature — Human Soldier 2/3 | **Mentor** (atak → +1/+1 na atakującego o mniejszej sile); {2}{R}{W}: +1/+1 do EOT | pump aktywowany ISTNIEJE; wzorzec blokującego celu z triggera ISTNIEJE (delirium/backup); BRAK mechaniki mentor (kandydat „attacking, lesser power") |
| Pilgrim's Eye | {3} | Artifact Creature — Thopter 1/1 flying | ETB: możesz szukać basic landa → ręka, reveal, shuffle | `search_library_to_hand` z qualifier types ISTNIEJE (Secret Entrance; wybór deterministyczny wg ADR 0005); karta trywialna |
| Dementia Bat | {4}{B} | Creature — Bat 2/2 flying | {4}{B}, poświęć: **cel-gracz odrzuca 2 karty** | `cost.sacrificeSelf` ISTNIEJE; `discard_cards` ISTNIEJE ale tylko z ręki kontrolera źródła; BRAK discard na cel-gracza (wybór deterministyczny wg ADR 0005 jak przy Evangel) |
| Seer's Lantern | {3} | Artifact | {T}: Add {C}; {2},{T}: Scry 1 | scry ISTNIEJE (także aktywowany), `add_mana` ISTNIEJE; dorzucić wpis do `MANA_SOURCE_MAP` (mapa danych, jak `MANA_COSTS`) |
| You're Confronted by Robbers | {3}{W} | Instant | **Choose one**: tap do 3 celowanych stworów / trzy 1/1 białe tokeny Soldier | modal ISTNIEJE; `variableTargets` ISTNIEJE (Aerith min:1 — sprawdzić min:0 dla „up to three"); `tap_permanents` ISTNIEJE; BRAK czystego `token_soldier` (jest tylko `token_soldier_lifelink` z M36) |

- **Kolekcja:** wszystkie 10 kart w `tools/collection-art-ids.csv`
  (Tellah 15, Illvoi 53, Grounded 62, Pilgrim 132, Boros 140,
  Sculptor 285, Dementia 403, Rampage 475, Seer 489, Robbers 532) →
  test art-ids 108 → 118.
- **Talie** (kolorystyka lądów): green mono-G; black B+U/W splash; red mono-R;
  innistrad 5-kolor; azorius W/U; wiedzmin G/U+B. Wielokolorowe (Tellah UR,
  Boros RW) pasują tylko do innistrad.

Plan commitów (kolejność):
1. TA ROADMAPA (pierwszy commit zadania, przed kodowaniem).
2. Cz. 0 — dane Scryfall (10 plików JSON).
3. Cz. 1 — core: nowe generyczne mechaniki + protokół (komendy/zdarzenia).
4. Cz. 2 — definicje kart + token + dane many + artId.
5. Cz. 3 — testy `test/real-cards-batch19.test.js`.
6. Cz. 4 — talie singleton.
7. Cz. 5 — boty + UI + pełny B0.
8. Cz. 6 — dokumentacja M38 + opis PR + odhaczenie roadmapy + finał.

## Etapy

- [x] Rozpoznanie: pobranie 10× Scryfall (przez `fetch_page`), stan repo
  (820/820), mechaniki istniejące vs nowe, dopasowanie artId i talii.
- [ ] Ta roadmapa jako pierwszy commit zadania.
- [ ] **Cz. 0 — dane Scryfall** (ADR 0010 §2a): `docs/cards/scryfall-illvoi-
  operative.json`, `-grounded.json`, `-ruinous-rampage.json`, `-tellah-great-
  sage.json`, `-etherium-sculptor.json`, `-boros-challenger.json`,
  `-pilgrims-eye.json`, `-dementia-bat.json`, `-seers-lantern.json`,
  `-youre-confronted-by-robbers.json` (kształt: źródło/pola Oracle/imageUri/
  `pobrano: 2026-08-06`, jak w poprzednich batchach).
- [ ] **Cz. 1a — „drugi czar gracza w turze" (Illvoi):** licznik rzutów PER
  GRACZ (`spellsCastThisTurnByPlayer`, init/reset/fingerprint przy
  `spellsCastThisTurn`), nowe zdarzenie trigger'a w skanie rzutów
  (np. `you_cast_second_spell_each_turn`), trigger conditioner; test core.
- [ ] **Cz. 1b — mentor (Boros):** `pendingMentorTargets` wg wzorca
  `pendingDeliriumTargets` (auto-skip bez kandydatów; kolejka w chwili
  declare_attackers z kandydatami „attackujący z mniejszą siłą"; intervening
  re-check siły przy rozstrzygnięciu), komenda `resolve_mentor_target`,
  bramka w `execute()`/`playerView`/planowaniu decyzji `accepted()`
  (kolejność spójna z łańcuchem 16 bramek — dopisać jako 17.), fingerprint,
  zdarzenie `mentor_countered` (albo `_added`).
- [ ] **Cz. 1c — wydana mana (Tellah):** `manaSpent` na obiekcie stosu i w
  evencie `spell_cast` (wartość `effectiveSpellManaCost` w chwili rzutu;
  koszty dodatkowe many poza zakresem — udokumentować), kontekst triggera
  przekazywany do rozstrzygania efektu: `condition.manaSpentAtLeast` dla
  efektów oraz `amountFrom: 'manaSpent'` w `damage_each_opponent`;
  `sacrifice_permanent` już istnieje. Test core progów 4+/8+.
- [ ] **Cz. 1d — modyfikator kosztu z permanentów (Sculptor):** zdolność
  statyczna `costModifier { spellTypes: ['Artifact'], amount: 1 }`
  uwzględniana w `effectiveSpellManaCost` (skan bitwisku, kontroler),
  podłączenie w legality (spells.js:601) i rzucie (:204) — the same choke
  point; weryfikacja auto-tapu (M34) i kreatora many (E.3a) ze zredukowanym
  kosztem; kolorowe wymogi nietknięte (obniżka tylko części generycznej).
- [ ] **Cz. 1e — „tracenie" keyworda z aury (Grounded):** deskryptor
  `hostLosesKeywords: ['flying']` (registry→materialize→permanents warstwa
  keywords — tam, gdzie cantAttack/cantBlock z Hobble), usunięcie keyworda
  z efektywnego zbioru gospodarza; test interakcji z buffami „has flying".
- [ ] **Cz. 1f — discard na cel-gracza (Dementia):** `discard_cards` z
  `applyTo: 'target'` (cel z targets[0]; typ celu `player`/`opponent` w
  zdolności aktywowanej — sprawdzić walidację celów zdolności), wybór kart
  deterministyczny (najdroższa, ADR 0005 — konwencja repo, jak przy
  Evangel); mniej kart niż N → odrzuca wszystkie.
- [ ] **Cz. 1g — drobiazgi protokołu:** `exile_all` z filtrem
  `{ types: ['Artifact'], manaValueAtMost: 3 }` (Rampage); weryfikacja
  `variableTargets.min: 0` (Robbers „up to three" — Aerith miało 1);
  COMMAND_TYPES/EVENT_TYPES/Fingerprint/`describeEvent` dla nowego typu.
- [ ] **Cz. 2 — definicje:** 10× `defineCard` w `REAL_CARDS`
  (`src/cards/card-data.js`, ADR 0014), `token_soldier` (1/1 W, status
  `limited` jak tokeny M36), 10 wpisów do `src/cards/mana-costs-data.js`,
  wpis `seers-lantern` do `MANA_SOURCE_MAP`, artId z CSV,
  oracleText/imageUri z JSON Scryfall. Pełne mechaniki,
  `support.limitations` puste (konwencje repo — deterministyczny search/
  discard wg ADR 0005 — udokumentować w opisie, nie w limitations,
  konsekwentnie ze wcześniejszymi batchami).
- [ ] **Cz. 3 — testy `test/real-cards-batch19.test.js`:** legalny +
  nielegalny scenariusz każdej karty (cechy: brak many / zły cel / brak
  kandydatów mentor / próg many niespełniony), sanity Scryfall z
  `fs.readFileSync` (oracleText + image_uris.large), interakcje (Grounded
  vs buff flying; Sculptor vs auto-tap/kreator; legend rule Tellah×2 z
  M37!), determinizm replay ×2; test art-ids 108 → 118.
- [ ] **Cz. 4 — talie singleton (dopiski):** azorius: Illvoi + Sculptor +
  Robbers (+1 Island 8→9); green: Grounded + Pilgrim (+1 Forest 14→15);
  black: Dementia Bat; red: Ruinous Rampage; innistrad: Tellah + Boros
  Challenger; wiedzmin: Seer's Lantern. Walidacja `test/repo-decks.test.js`
  (aktualizacja zszytych liczności, jeśli zszywa).
- [ ] **Cz. 5 — boty/UI/benchmark:** aggro `simple` + heuristic
  `scoreCommand` dla `resolve_mentor_target` (deterministycznie: najsilniejszy
  kandydat); polskie etykiety logu/UI (oferta mentor, nowe opisy zdarzeń);
  **pełny B0 (obowiązkowy — zmiana kontrolerów i składu talii)**; progi
  `test/bot-benchmark.test.js` tylko w górę („zmierzone −15 p.p.") +
  dopisek pomiaru w komentarzu.
- [ ] **Cz. 6 — docs + finał:** wpisy M38 w `docs/PROJECT_STATE.md` i
  `docs/ENGINE_MILESTONES.md`, dopisek w `docs/setup/HANDOFF_2026-08-06.md`,
  opis PR #29 kumulatywnie, ta roadmapa odhaczona, pełne `npm test` +
  `npm run build`, raport właścicielowi po polsku.

## Ryzyka / pułapki

- **Kreator many + auto-tap ze zredukowanym kosztem** (Sculptor): solver
  jednoznaczności i walidacja sum muszą widzieć `effectiveSpellManaCost` —
  sprawdzić `mana-wizard.js` i `producibleMana`.
- **Priorytet pendingów mentor** — po niedawnych crashach B0 (seed 2027/1020)
  nowa bramka musi respektować kolejność `execute()` i planowanie z M37
  (decydent pierwszej decyzji dostaje priorytet).
- **Legend rule + Tellah** — pierwsza legenda w benchmarku; regresja
  `resolve_legend_choice` w testach interakcji.
- **Zmiana składu talii rusza benchmark** — B0 wykonać PO dopiskach.
- Środowisko: fresh clone w połowie sesji (odzyskanie: fetch + reset
  --mixed), token GH umiera epizodycznie (retry), edycje PL przez python3
  z kotwicami, pliki pomocnicze w `/home/user` (nie w repo).
