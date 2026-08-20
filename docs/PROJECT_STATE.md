# Bieżący stan projektu

- **Ostatnia aktualizacja:** 2026-08-20 (M161: audyt PR #67 + gotowość madness na czary — routing po kind)
- **Poprzednia:** 2026-08-20 (PR #67: M159 audyt PR #66 + pętla jakości, M160 uwagi właściciela A/B)

## M161 — audyt PR #67 + gotowość madness na czary (2026-08-20, PR #68)

Sesja wg ADR 0020; zlecenie właściciela: zasada **„nie zostawiamy
nieobsłużonych ścieżek zależnych od przyszłych kart — kod mechaniki
gotowy, ścieżka martwa dziś zasygnalizowana"** (reguła trwała: L52).
Audyt PR #67 (squash `015f715`): raport `docs/audits/AUDYT_PR67_2026-08-20.md`
— F1–F4/Z1–Z5/M160 zweryfikowane poprawne (M160/A weryfikacją mutacyjną),
znalezisko **D1** (praca M160 nie istniała w PROJECT_STATE — backfill poniżej),
obserwacje **O1/O2** = temat zadania.

**Implementacja (RED→GREEN, `test/m161-madness-spell-path.test.js`, 11 testów,
10 czerwonych przed):**
1. **O1 routing po kind** — `resolve_madness_cast`: instant/sorcery z madness
   → nowa `spells.castMadnessSpell` (wzorzec suspend/rebound: cele/tryby,
   stos, timing ignorowany CR 702.34e; koszt madness PŁACONY z redukcjami).
   Oferta playerView per legalny zestaw celów i per tryb (`epicCastOffers`);
   czary z additionalCost/xCost poza zakresem — brak oferty + jawny reject.
   Etykieta UI nazywa cel (wzorzec M151). Materialize: gałąź spell zachowuje
   deskryptor `madness` (klasa Z5/L21).
2. **O2 bramka kolorów kosztu alternatywnego** — `castPermanent` przy
   madnessCast/warpCast sprawdza pipy AKTYWNEGO kosztu
   (`altCostColors`), nie pipy karty; `canPayMadnessCost` bez redundantnej
   bramki pipów karty. Dla katalogu zachowanie tożsame (Revolutionist,
   Weftblade).
3. **Sygnał** — strażnik katalogu (S9): czerwienieje przy pierwszej karcie
   instant/sorcery z madness w katalogu, z instrukją w komunikacie
   (ścieżka gotowa — S1–S4; dopisać testy kartowe, ew. rozszerzyć zakres).

**Stan:** `npm test` **2507/2507** (fast), `test:slow` 9/9, build
**51 modułów / 2137.5 kB**. Katalog bez zmian (ADR 0001/0022 — ścieżka
martwa dla katalogu, żywa w testach syntetycznych).

## M160 — uwagi właściciela z testów (2026-08-20, PR #67; backfill M161/D1)

Backfill: praca wykonana w PR #67, ale nieopisana w PROJECT_STATE (luka
dokumentacyjna znaleziona w audycie PR #67 — D1):
- **A (Selhoff Occultist, CR 603.10a):** jednoczesne zgony (jeden przebieg
  SBA — walka, masowe -X/-X) niosą `simultaneousIds`; triggery
  `any_creature_dies` współzgony stworów patrzą wstecz i odpalają
  (weryfikacja mutacyjna w audycie PR #67). Tokeny: fallback na LKI
  zdarzenia śmierci (CR 704.5e). `test/m160-uwagi-wlasciciela.test.js` (5).
- **B1/B2 (Seismic Monstrosaur):** `sacrificeLandId` w kluczu grupowania
  panelu akcji i w etykiecie („poświęć: <ląd>") — warianty per ląd
  rozróżnialne; pola generyczne komendy (ADR 0002).

## M159 — audyt PR #66 + pętla jakości (2026-08-20, PR #67)

Sesja wg ADR 0020/0021 (prompt bez tematu → pętla domyślna). Audyt squash
`238ff70` (diff `1a5accc..238ff70`): raport `docs/audits/AUDYT_PR66_2026-08-20.md`.

**Fixy audytu (RED→GREEN, `test/pr66-audit-fixes.test.js`, 7 testów):**
1. **F1** — madness łamał CR 702.34e: bramka „Zagranie poza main phase”
   odrzucała rzut po odrzuceniu w cleanup (limit ręki!) i w turze
   przeciwnika → heuristic-bot (cast=60) crashował sesję „Bot wybrał
   nielegalną komendę”. Wyjątek `madnessCast` (wzór suspend/rebound).
2. **F2** — oferta `cast:true` bez walidacji płatności (L48):
   `canPayMadnessCost` (lustro bramek castPermanent) + oferta warunkowa.
3. **F3** — Revolutionist: cel ETB obowiązkowy (Oracle bez „you may”) —
   usunięte `optional:true` (ADR 0022).
4. **F4** — oferty madness niosą cardId/objectId; etykieta nazywa kartę.

**Pętla jakości (Żywy Tester, 9 partii g1–g8 na taliach Batch 39,
`test/m159-zywy-tester.test.js`, 9 testów):**
- **Z1** — fingerprint nie zawierał `regenerationShields`,
  `cantBeRegeneratedThisTurn` ani pól obiektu `lostKeywordsUntilEOT`/
  `subtypesBeforeOverride`/`madnessReady` (klasa M122/#1) — sonda noop
  fałszywie zgłaszała działający Regenerate (g7); dodane (Z1a–d mutacyjnie).
- **Z2** — trigger multiplayer (anotherOpponentExists) renderował
  „Gdy rzucisz czar: .” — kafel mówi teraz „nieaktywny w grze 1v1”.
- **Z3** — strażnik katalogowy: żadna karta nie renderuje opisu „: .”.
- **Z4** — kafel/podgląd Sagi nie pokazywał NIC o rozdziałach (rodzina
  M100/E10) — rulesText renderuje „Saga — I: … II: … III: …”.
- **Z5 (poważne)** — `gameObjectDataOf` kopiował `saga` tylko w gałęzi
  stworów → Invasion of the Giants (czysty Enchantment) wchodził na stół
  BEZ deskryptora: zero lore, zero rozdziałów, karta nie robiła NIC.
  Testy Batch 39 zielone, bo czytały rejestr, nie obiekt (L5/L21).
  Fix + **Z5b: generyczny strażnik łańcucha pól materialize** (wszystkie
  deskryptory mechanik, zweryfikowany mutacyjnie).

**Stan:** `npm test` **2491/2491**, `test:slow` 9/9, build **51 modułów /
2127.4 kB**. ⚠ GH_TOKEN wygasł przy ostatnim commicie (cd2b9e6 — Z5b
strażnik) — push po reconnect.

## M158 — Batch 39 (10 kart, lista właściciela 2026-08-20, PR #66)

Transze A–E (commity d5c4361…8328f4b), każda samodzielnie zielona.

1. **A — reuse:** Merfolk Mesmerist ({U},{T}: mill 2), Knight of the
   Skyward Eye (oncePerTurn +3/+3), Breaching Hippocamp (notSelf w
   creature_you_control), Squire's Lightblade (NOWY efekt
   attach_self_to_target — ETB-attach equipmentu do wybranego stwora).
2. **B — proste mechaniki:** Exterminator Magmarch (NOWY efekt regenerate —
   tarcza w istniejących regenerationShields; trigger multiplayer martwy
   w 1v1 — warunek anotherOpponentExists), Dire Fleet Ravager (NOWY
   each_player_loses_life_fraction 1/3 zaokr. w górę), Wishful Merfolk
   (NOWY becomes_subtype_until_end_of_turn: nadpisanie podtypów + utrata
   keyworda do EOT, cleanup przywraca — wzorzec originalBeforeAnimation).
3. **C:** Wrap in Flames — NOWY wrapper apply_to_each_target (efekty per
   cel) na czarach variableTargets (enumeracja 0..3 istnieje); wycena
   bota per cel (nie pali własnych stworów).
4. **D:** Invasion of the Giants (Saga): I scry 2; II NOWY
   reveal_subtype_deal_damage (pendingRevealChoice — pełna checklista
   nowego pendingu); III NOWY next_spell_discount (rabat na następny czar
   podtypu, konsumowany przy rzucie, wygasa w cleanup).
5. **E:** Revolutionist — NOWA MECHANIKA **Madness (CR 702.34)**:
   odrzucenie → exile + resolve_madness_cast (rzut za koszt madness,
   timing ignorowany, albo cmentarz); choke point resolve_discard_choice;
   łańcuch pola madness przez registry→materialize→addObject (L21).

Talie: azorius +3 (Mesmerist/Hippocamp/Wishful), green +Knight +4 Plains,
mechanicy +Lightblade +3 Plains, black +2 +4 Mountain, red +Wrap +1 M,
spellslinger +Invasion +Revolutionist +2 M. Seedy przelosowane (L25).
Strażniki wszystko złapały w trakcie: M122 (etykieta), M137 (łańcuch pól),
repo-decks (snapshoty) — naprawione od razu.

6. **Zgłoszenie A (po teście):** odkrycie Morph/Megamorph w „Rozgrywce"
   nazywa teraz zdolność — pole `keyword` w zdarzeniu ability_activated
   (obie ścieżki: natychmiastowa i stos) + gałąź etykiety
   (`test/morph-label.test.js`).

**Stan:** `npm test` **2474/2474**, `test:slow` 9/9 (test:all 2483), build
**51 modułów / 2121.4 kB**. Katalog: 318 wspieranych kart. ⚠ GH_TOKEN
wygasł przy transzy D — commity D/E czekają na push po reconnect.

## M157 — uwagi właściciela z review PR #66 (2026-08-20, PR #66)

Decyzje właściciela: **ADR 0022** (KAŻDA karta supported = 100% Oracle albo
nieobsługiwana — koniec „świadomego długu"), F4 tylko opcja (a), L28-inwentaryzacja
w tej sesji, uszkodzony plik audytu usunąć.

1. **ADR 0022** + rejestr README + AGENTS.md zaktualizowane; strażnik notes
   rozszerzony o „uproszczenie".
2. **Plik audytu Batch38** — ścieżka uszkodzona na FS sandboxa (ghost dentry);
   treść odzyskana z blobu gita → `docs/audits/AUDYT_2026-08-20-batch38-zywy-tester.md`.
3. **Fixy A–F z testów właściciela** (`test/m157-uwagi-wlasciciela.test.js`):
   - A: usunięta syntetyczna „niby-karta" z hovera i pełnego ekranu;
   - B: 8 tokenów bez obrazu dostało imageUri ze Scryfall (m.in. Bird Soldier,
     Powerstone, Germ) + invariant „każdy token ma obraz";
   - C: **Skilled Animator** — animacja trwa do zejścia ŹRÓDŁA („for as long
     as..."), nie do końca tury; cleanup pomija żywe linki; revert w
     moveObjectDirectly synchronizuje Station (L46 w ścieżce linked);
   - D: **stun** (Lodestone Needle) — zdjęcie licznika i pierwszy untap po
     stunie = pauza z renderem (kreatura „nigdy nie odkręcała się wizualnie");
   - E: „Log partii" pokazuje całą rozgrywkę (koniec okna 80 wpisów);
   - F: panel liczników trucizny (obraz „Poison Counter" tecc/13 + liczniki
     graczy); playerView niesie `poison` (ADR 0017).
4. **F4(a) — Weftblade Enhancer 100% Oracle**: wielocelowy trigger ETB
   („each of up to two target creatures") — deskryptor `count/upTo`,
   `applyTriggerEffects` per cel, `resolve_trigger_target` z `targetIds`,
   enumeracja wariantów (cap 32, L19), etykiety, klucze opcji (L32),
   wycena bota (para własnych). „Uproszczenie" usunięte z notes.
5. **L28 — inwentaryzacja wycen** (czary/zdolności celowane):
   strażnik `test/bot-targeted-effect-valuation-guard.test.js` (weryfikacja
   mutacyjna) + 4 naprawy (Mournful Zombie leczył wroga, kradzież bez wyceny,
   2× remis w wyborze karty z grobu). L51 zaktualizowana o drugi strażnik.

**Stan:** `npm test` **2458/2458**, `test:slow` 9/9 (test:all 2467), build
**51 modułów / 2088.6 kB**. ⚠ GH_TOKEN wygasł w trakcie sesji — commity
M157 czekają na push po reconnect.

## M156 — audyt PR #65 + fixy (2026-08-20, PR #66)

Sesja wg ADR 0020/0021 (prompt bez tematu → pętla domyślna). Audyt squash
`1a5accc` (diff `c536182..1a5accc`): raport `docs/audits/AUDYT_PR65_2026-08-20.md`.

**Zweryfikowane poprawne (skrót):** scry topOrder (M148), warp (Weftblade),
rebound (Ojutai's Breath), Satyr Wayfinder, Static Net (linked exile +
Powerstone), living weapon (Strandwalker), creature_or_vehicle ×4 ścieżki,
craft no-op (M155), Z5/Z8, FoW (manaCost/name/suspend w widoku — jawne),
dane kart vs Scryfall (strażniki L23/L26 zielone), oba boty obsługują nowe
decyzje (L48), wyceny większości nowych efektów (L52).

**Naprawione (RED→GREEN, `test/bot-pr65-audit-fixes.test.js`):**
1. **F1** — `triggerTargetEffectFriendly` nie znał `grant_keywords_until_end_of_turn`
   → bot obdarowywał lifelink+indestructible najlepszego stwora PRZECIWNIKA
   (Lotusguard, Batch 38). Fix: gałąź grant_keywords + zbiór
   HOSTILE_GRANTED_KEYWORDS. Piąte powtórzenie klasy L52.
2. **F2** — `destroy_artifact_gain_life_mana_value` bez wyceny → bot rzucał
   Divine Offering we WŁASNY artefakt-źródło many. Fix: wpisy w tabelach bota
   (HOSTILE_PERMANENT_EFFECTS, REMOVAL_EFFECTS, HOSTILE_TRIGGER_TARGET_EFFECTS).
3. **F3** — Divine Offering: życie przyznawane tylko przy skutecznym destroy;
   wg CR 608.2c to dwie sekwencyjne instrukcje — życie niezależne (LKI).
   Test Batch 38 odwrócony z uzasadnieniem (L44).

**Otwarte do decyzji właściciela (F4):** Weftblade Enhancer „each of up to two
target creatures" zaimplementowane jako 1 cel, odnotowane w `notes` — wg
polityki M111 to kandydat na `limitations` (nowy powód w strażniku) albo
implementacja wielocelowego triggera ETB.

**Pętla jakości (etap 5, ADR 0021):** sonda inwentaryzacji typów efektów
w kontekstach celowanych (card-data vs wyceny bota) — 2 kolejne wystąpienia
klasy L52: **Q1** Withstand (prewencja any_target bez wyceny → bot chronił
stwora PRZECIWNIKA), **Q2** Servant of the Scale (transfer liczników
nieprzyjazny → liczniki do najsłabszego własnego). Fixy + **strażnik
klasyfikacji celów triggerów** (`triggerEffectIsHostile` w game-state,
`test/bot-trigger-target-classification-guard.test.js` — nowy typ efektu
w triggerze z celem bez klasyfikacji = czerwony test przed merge; zweryfikowany
mutacyjnie). Lekcja **L51**.

**Stan:** `npm run test:all` **2451/2451** (rdzeń 2442 + slow 9), build
**51 modułów / 2075.0 kB**, próbka regresji bota 9/9 (0 crashy). Rejestr:
**308 wspieranych kart** (bez tokenów/tyłów DFC), 12 talii.

## Backfill — PR #65 (M147–M155, scalony 2026-08-20)

Squash `1a5accc`; poprzednia sesja nie zdążyła zaktualizować PROJECT_STATE
(zrekonstruowane tu z opisów commitów i planów `docs/plans/2026-08-19-m14*.md`/`m15*.md`):

- **M147:** audyt PR #64 (czysty + fix F1 Wretched Banquet — wycena
  destroy_if_least_power); **Batch 37 (10 kart):** Returned Centaur, Palace
  Familiar, Thornhide Wolves, Village Bell-Ringer (untap_all_creatures_you_control),
  Liliana's Triumph (warunek controlsPlaneswalkerWithSubtype + planeswalker
  zakodowany z wyprzedzeniem — decyzja właściciela 2026-08-19), Urza's Mine
  (tron), Ojutai's Breath (rebound), Satyr Wayfinder (reveal/pick land),
  Static Net (exile linked + Powerstone), Strandwalker (living weapon).
- **M148:** FOT/KON hover bez zaślepki; **scry — wybór kolejności kart
  na wierzchu (CR 701.18)** — topOrder w resolve_scry + wizard.
- **M149:** bot — trick poza combatem kara, Bone Splinters TMC (PlayerView
  manaCost — ADR 0017), Grave Exchange nie w siebie; UI — etykiety kolejności
  surv/scry, modal Cuombajj Witches; Treasure nie marnowane.
- **M150:** Battle-Rattle Shaman (triggerTargetEffectFriendly — friendly/hostile
  cele triggerów), przydział obrażeń, Jeskai Devotee (kolory many w logu),
  manaColors w ability_activated.
- **M151:** etykiety suspend/rebound/exploit, MAIN_LOG_NOISE (szum poza główny
  log), stos bez fałszywego celu (activatedEntry.targets tylko gdy cele),
  tester: rebound/suspend + detektory FalseNoEffect/szum.
- **M152:** audyt Żywym Testerem pozostałych kart (m.in. Satyr Wayfinder label,
  fix nameOfObject dla ukrytych stref).
- **M153:** Station — bot tapuje do progu tylko po własnym ataku (postcombat),
  log stationTappedCreatureId; karty specjalne klikalne (Day/Night fullscreen).
- **Batch 38 (10 kart):** Divine Offering, Colossodon Yearling, Fortify
  (modal +2/+0 / +0/+2), Mysidian Elder (token Wizard ping), Pristine
  Talisman (mana ability + rider życia), Chatter of the Squirrel (Squirrel),
  Silken Strength (aura creature/Vehicle + untap), Weftblade Enhancer (warp),
  Lotusguard Disciple (grant lifelink+indestructible), Talion's Messenger
  (faerie_attacks).
- **Audyt Żywym Testerem Batch 38 (Z1–Z10)** — wszystkie naprawione:
  log „(?)" delirium LKI, odmiana liczników, Courage in Crisis (bot),
  Ruinous Rampage tryb, kolejność trybów modalnych, tester warp, raw id
  tokenu w UI, no-op self-tap (Sterling Keykeeper), atak 0/1, darmowe życie
  z Pristine; nowy detektor detectTokenRawId.
- **M155:** craft no-op bez transformTo (fix flake CI benchmarku),
  detektor FalseNoEffect — dowód tego samego źródła.

## M146 — 5 znalezisk z testów właściciela (2026-08-19, PR #64)

1. **Gurmag Drowner exploit** — zweryfikowane: działa od fixa installDeck
   (deskryptor exploit przechodzi łańcuch); test regresyjny przez realną
   ścieżkę talii.
2. **[bot] Fake Your Own Death w upkeepie** — pump „do końca tury" wartościowy
   tylko w combacie albo na tura przeciwnika; własna tura poza combatem = kara
   (M96 rozszerzone: main też nie — wróg zdąży zareagować).
3. **[ui] perspektywa „twoich"** — etykiety triggerów z zaimkami 1. osoby są
   z perspektywy KONTROLERA źródła; przy źródle przeciwnika log pisze
   „(Nieprzyjaciel)" zamiast „twoich" (helper triggerEventLabel).
4. **[i18n] „bitwisko" → „pole bitwy"** — we wszystkich odmianach, 179 plików
   (src/test/docs).
5. **[bot] blokowanie** — blok ratujący życie (po zablokowaniu obrażenia <
   życie) przebija pass (+30); blok, który nie ratuje, nie jest marnowany.
   Benchmark: heuristic 81,6% vs random (wzrost po naprawach).

**Stan:** `npm run test:all` **2350/2350**, build 51 / 1983.9 kB, benchmark
0 crashy (`tools/b19-m146-2026-08-19.txt`).


- **Poprzednia:** 2026-08-19 (M146: audyt Żywym Testerem po Batch 35 — 4 naprawy bota/UI + nowy detektor)
- **Poprzednia:** 2026-08-18 (M146: Batch 35 kompletny — 10/10 kart, w tym suspend)
- **Poprzednia:** 2026-08-18 (M145: audyt PR #62 + Batch 35 transza E2 — 4 karty reuse; PR #63 scalony)
- **Poprzednia:** 2026-08-18 (M143: ADR 0021 — nie pytaj o kolejkę; pętla domyślna)
- **Poprzednia:** 2026-08-19 (M146: audyt Żywym Testerem po Batch 35 — 4 naprawy bota/UI + nowy detektor)
## M146 — Batch 36 kompletny: 10 kart (2026-08-19, PR #64)

Lista właściciela. Nowe generyczne mechaniki (ADR 0002):

1. **destroy_if_least_power** (Wretched Banquet) — zniszcz cel przy rozstrzyganiu,
   gdy ma najmniejszą moc na polu bitwy lub remisuje (reużywa destroy_permanent).
2. **Devoid + trigger bezbarwnego czaru** (Molten Nursery) — karta bezbarwna;
   nowy warunek `spellIsColorless` w triggerze when_you_cast_spell.
3. **Landfall w czarze** (Mysteries of the Deep) — tracker `landEnteredThisTurn`
   (jak creatureDiedThisTurn); warunek w generycznym `conditional`.
4. **mill_both_players** (Ghoulcaller's Bell) — każdy gracz mieli.
5. **Forestwalk / landwalk** (Emerald Oryx) — statyczna zdolność `{ subtype }`:
   nieblokowalność, gdy obrońca kontroluje taki ląd (oferta + walidacja spójne).
6. **Forecast (CR 702.94)** (Piercing Rays) — zdolność z RĘKI: tylko w swoim
   upkeepie, raz na turę, koszt many + ujawnienie karty (karta zostaje w ręce).
7. Nowe typy celów `tapped_creature` / `untapped_creature`.
8. Reuse: ETB scry 2 (Omenspeaker), flash aura +2/+2 (Feral Invocation),
   zwykły 1/5 (Grizzled Leotau), first strike + graveyard scry (Survivor).

Fix pre-existing odsłonięty benchmarkiem: tryb Schody Aerith z ZERO celów
(CR 601.2c) walidował stunTargetId mimo pustej listy celów — crash.

Talie: green +2/+1 ląd, spellslinger +2, azorius +2/+1 ląd, graveyard +2,
black +1/+1 ląd, red +1, innistrad (bez zmian), mechanicy (bez zmian).
Seedy 8 testów przelosowane hunterem (L25).

**Stan:** `npm run test:all` **2345/2345**, build 51 / 1980.0 kB, benchmark
szybki 0 crashy: heuristic **81.0%** vs random (`tools/b18-m146-2026-08-19.txt`).
Katalog: **158 wspieranych kart**.


- **Poprzednia:** 2026-08-18 (M146: Batch 35 kompletny — 10/10 kart, w tym suspend)
- **Poprzednia:** 2026-08-18 (M145: audyt PR #62 + Batch 35 transza E2 — 4 karty reuse; PR #63 scalony)
- **Poprzednia:** 2026-08-18 (M143: ADR 0021 — nie pytaj o kolejkę; pętla domyślna)
- **Poprzednia:** 2026-08-18 (M146: Batch 35 kompletny — 10/10 kart, w tym suspend)
## M146 — audyt Żywym Testerem po Batch 35 (2026-08-19, PR #64)

Zlecenie właściciela: audyt po dodaniu kart — auto-detektory, analiza logu
(czy bot gra optymalnie), nowe detektory sensowności działań bota.
Raport: `docs/audits/AUDYT_2026-08-18-m146-zywy-tester.md`.

**Znaleziska i naprawy (root cause):**
1. **Basilisk Gate** — bot aktywował +X/+X na STWORY PRZECIWNIKA
   (green vs mechanicy, seed 5). `pump_by_gates` nie miał wyceny w ścieżce
   zdolności — dodany do gałęzi pump (kara za wzmacnianie wroga).
2. **Twiddle** — bot odkręcał górę wroga w swoim upkeepie (red vs
   spellslinger, seeds 11/23). `untap_permanent` nie miał wyceny; czysto-
   utylitarny czar (tylko tap/untap) startował od 50 pkt i zły cel
   przebijał pass. Dwie reguły: wycena odkręcenia (własny stwór +, land −,
   wróg −25) + start od −1 dla czarów tylko-utylitarnych.
3. **„dostaje undefined/undefined"** — `stats_modified` bez powerModifier
   (lock_untap/skipsNextUntap/base PT) renderował śmieć; opis zna każdy
   wariant skutku.
4. **Nowy detektor** `detectBotUntapsMyPermanent` (klasa „bot odkręca TWÓJ
   permanent"), zweryfikowany dwustronnie.

Lekcja **L52** (nowy typ efektu = sprawdź wycenę w heuristic-bocie, obie
ścieżki: czary i zdolności).

**Stan:** `npm run test:all` **2310/2310**, build 51 / 1958.4 kB, benchmark
szybki 0 crashy (heuristic 80.2% vs random).


- **Poprzednia:** 2026-08-18 (M145: audyt PR #62 + Batch 35 transza E2 — 4 karty reuse; PR #63 scalony)
- **Poprzednia:** 2026-08-18 (M143: ADR 0021 — nie pytaj o kolejkę; pętla domyślna)
- **Poprzednia:** 2026-08-18 (M145: audyt PR #62 + Batch 35 transza E2 — 4 karty reuse; PR #63 scalony)
- **Poprzednia:** 2026-08-18 (M143: ADR 0021 — nie pytaj o kolejkę; pętla domyślna)
## M146 — dokończenie Batch 35: 6 kart, w tym suspend (2026-08-18, PR #64)

Kontynuacja po scalonym PR #63 (M145, 4 karty E2). Ta sesja dodała pozostałe
**6 kart Batch 35** — Batch 35 kompletny (10/10). Audyt najnowszego scalonego
PR #63: `docs/audits/AUDYT_PR63_2026-08-18.md` (czysty — 4 karty reuse zgodne
z Oracle, core nietknięty).

Nowe generyczne mechaniki (ADR 0002 — zero nazw kart w core):

1. **Twiddle** — typ celu `artifact_or_creature_or_land` (oferta + walidacja
   spójnie) + czar modalny tap/untap.
2. **Trade Route Envoy** — generyczny efekt warunkowy `conditional`
   (if/then/else po deskryptorze warunku wspólnym z triggers.js).
3. **Steelfin Whale** — **affinity for artifacts** (obniżka per artefakt,
   CR 702.42) + trigger `artifact_you_control_enters`.
4. **Blazing Torch** — `equipment.grantedAbilities`: zdolności NADANE
   nosicielowi (statyczna restrykcja blokowania po podtypie + aktywowana
   z kosztem tapHost/sacrificeSelf na stosie). Pole przepływa przez cały
   łańcuch registry → gameObject → komenda (L21/L48 — identity.js i addObject
   gubiły je, co naprawiono u źródła).
5. **Basilisk Gate** — `pump_by_gates` (+X/+X, X = liczba Gates) +
   MANA_SOURCE_MAP dla {T}: {C}.
6. **Mindstab — suspend (CR 702.62)** — pełna mechanika z jednorazową
   decyzją: `suspend_card` (specjalna akcja z ręki, jak plot) → exile
   z licznikami czasu → upkeep zdejmuje licznik → ostatni licznik odpala
   zdolność wyzwalaną na stosie → przy rozstrzyganiu gracz RZUCA czar
   za darmo (ignorując timing, CR 702.62c) albo zostawia go w exile
   NA STAŁE (bez drugiej szansy — uwaga właściciela o braku dowolności).

Poprawki root cause po drodze: rozróżnienie `grantedFromEquipment` po fladze
komendy (equip pochodni nie koliduje z grantedAbilities), harness
`playAndCollectPanel` zbierał ostatnie ruchy po zakończeniu partii
(fałszywy alarm panelu), PAUSE_TYPES zna `trigger_target_required`
(dedup ability_triggered).

Talie: green +Trade Route Envoy, spellslinger +Twiddle, mechanicy +Steelfin
Whale +Basilisk Gate, innistrad +Blazing Torch, black +Mindstab.
Seedy 8 testów przelosowane hunterem (L25).

**Stan:** `npm run test:all` **2303/2303**, build 51 modułów / 1953.8 kB,
benchmark szybki 0 crashy: heuristic **67.5%** vs aggro / **92.6%** vs random
(`tools/b17-m146-2026-08-18.txt`).


- **Poprzednia:** 2026-08-18 (M142: audyt M141 + Chittering Rats FoW + Fathom Fleet Cutthroat)
- **Poprzednia:** 2026-08-18 (M141: głębokie interakcje wielokartowe — 5 bugów na stykach mechanik)
- **Poprzednia:** 2026-08-18 (M140: challenge „brązowa odznaka wyłapywacza błędów" — 5/5 znalezisk)
  moment — okno po untap stepie przeciwnika)
- **Poprzednia:** 2026-08-18 (M138: audyt „wcielam się w gracza”
  Żywym Testerem — 11 znalezisk, 3 nowe detektory)
- **Poprzednia:** 2026-08-18 (M134–M137: cztery tematy z backlogu —
  audyt logu decyzji, wycena scry/surveil, pokrycie sondy, kontrakt `addObject`)
- **Poprzednia:** 2026-08-17 (M119: audyt „z perspektywy gracza”
  Żywym Testerem — 5 napraw + 2 nowe detektory)
- **M119 — audyt rozgrywki, nie kodu.** Dwanaście partii na prawdziwym
  artefakcie (8 kombinacji talii, 5 profili gracza). **Wszystkie zakończyły
  się „DETEKTORY: brak zgłoszeń”** — każde znalezisko pochodzi z ręcznego
  czytania transkryptu w roli gracza, co samo w sobie było wnioskiem
  (narzędzie nie pokrywało tych klas błędów).
  - **Z1/Z2 — log nie odmieniał polskich rzeczowników:** „dostaje +2 licznik”,
    „traci 2 licznik stun”, „Proliferate: 2 celów”, „odłóż 5 karty”.
    `polishPlural` istniał i był używany dla obrażeń i kart — te opisy go
    pomijały.
  - **Z3 — mulligan londyński: 35 ofert, w tym 15 nieodróżnialnych.**
    Enumeracja wszystkich podzbiorów ręki dawała piętnaście pozycji
    „Mountain, Mountain (x z 15)”, z których każda daje **ten sam stan gry**
    (CR 400.1). Naprawa: deduplikacja po składzie + cap 32 (lekcja L19).
    Zmierzone: 7→2, 21→3, ręka z 7 identycznych Gór = **1** oferta zamiast 35.
  - **Z4 — koszt zdolności jako „T2”** zamiast „{2}, {T}” (Seer's Lantern,
    Cellar Door): kolejność odwrotna do Oracle, bez separatora. Teraz
    „(koszt 2, T)”.
  - **Z5 — bot filtrował manę bez powodu.** Jeskai Devotee `{1}: Add {U},{R},{W}`
    — 16 aktywacji w partii, także w turach bez czarów. Bilans 1→1, a mana
    znika w cleanup (CR 500.4). Wycena dawała score 0 (ani punktu, ani kary).
  - **Nowe detektory:** `detectPolishPluralErrors` (odmiana wg liczebnika;
    granica wyrazu przez `(?![\p{L}])` — `\b` nie działa po polskich znakach)
    i `detectIndistinguishableOptions` (duplikaty opcji modala po normalizacji
    licznika „(x z N)”). Oba zweryfikowane wstecznie na archiwalnych
    transkryptach.
  - **Do decyzji właściciela:** Z6 („Bierzesz mulligan (1)” — brzmienie),
    Z7 (panel oferuje kontrczar we WŁASNY czar — legalne wg CR 115.4, ale to
    pewna strata; odfiltrowanie odebrałoby legalny ruch).
  - **Stan:** `npm run test:all` **2074/2074**, build 51 modułów / 1835,3 kB,
    benchmark heuristic 60,3 % vs aggro, 89,4 % vs random, 0 niedokończonych.

- **M118 — dług z `docs/TODO.md`: pliki źródłowe kart dwustronnych.**
  Strażnik tekstu Oracle z M117 pomijał sześć kart DFC, bo ich pliki miały
  **cztery różne kształty** (`card_faces`, `faces`, `oracle_text_front/back`,
  sklejony string „FRONT:/BACK:”). Wszystkie sprowadzone do kanonu Scryfalla
  (`card_faces`); strażnik porównuje teraz tekst **każdej strony osobno**
  (dopasowanie po nazwie, wyłącznie layout `transform` — `adventure` to jedna
  karta z dwiema częściami). Zweryfikowany mutacyjnie.

- **Ostatnia aktualizacja:** 2026-08-17 (M117: audyt PR #56 — cztery błędy
  znalezione i naprawione u root cause)
- **M117 — audyt poprzedniego PR (ADR 0016), polecenie właściciela:
  „audyt + naprawy, bez dużych nowych funkcji”.** Wynik: PR #56 był zielony,
  ale zawierał cztery realne błędy, z których żadnego nie łapał żaden test.
  - **B1 — zmyślony adres ilustracji.** `krumar-initiate` miał
    `…/large/front/9/1/91b1f0f3-krumar-initiate.jpg`: adres bez UUID druku,
    **404**, karta na stole bez ilustracji. Prawdziwy druk (TDM 84) to
    `bc66680f-…`. Dokładnie pułapka nr 5 z handoffu M116 („nie zmyślać
    adresów obrazków”), popełniona w tej samej sesji, która ją zapisała.
  - **B2 — dziura w strażniku (lekcja L26).** Test „imageUri zgadza się
    z plikiem Scryfall” ma klauzulę `if (!expected) continue`, a **20 kart
    batchy 33–34 nie miało pliku `docs/cards/scryfall-<id>.json`**
    (ADR 0010 §2a). Brak pliku = brak weryfikacji — i tą drogą przeszło B1.
    Pliki uzupełnione, dane każdej z 20 kart potwierdzone po UUID druku
    (koszty, typy, P/T, Oracle — zgodne).
  - **B3 — rozjazd TEKSTU reguł.** `cellar-door` mówił w katalogu „Target
    player mills 1” (wierzch biblioteki), a Oracle mówi „puts the **bottom**
    card of their library into their graveyard”. Mechanika
    (`mill_from_bottom`) była poprawna — gracz czytał w UI inną kartę.
    Plus trzy przepisane po swojemu teksty (`vow-of-wildness`,
    `trained-arynx`, `natures-embrace`).
  - **B4 — naruszenie ADR 0002.** `src/engine/effects.js` rozpoznawał kartę
    po identyfikatorze: `a?.cardId === 'moonlit-meditation'` — zachowanie
    konkretnej karty w jądrze silnika. Przeniesione do deskryptora
    `aura.replaceTokenCreation` (registry.js + identity.js — bez tego
    drugiego pole zginęłoby po cichu, lekcja L21).
  - **B5 — ciche tapnięcie (lekcja L24).** `tryRegenerate` ustawiał
    `tapped: true` (CR 701.15a) **bez** zdarzenia `object_tapped` — ta sama
    klasa błędu, którą M114 naprawił dla tapnięcia landa za manę. Głębsza
    warstwa: SBA dopisywało zdarzenia tylko do `state.events`, a
    `processTriggers` czyta listę **zwracaną** przez `runStateBasedActions`,
    więc samo dodanie zdarzenia by nie wystarczyło.
  - **Nowe strażniki** (każdy zweryfikowany na realnym błędzie):
    `test/card-sources-guard.test.js` (adres musi mieć UUID zgodny
    z katalogami, każda karta `supported` musi mieć plik źródłowy,
    `imageUri` i `oracleText` muszą się z nim zgadzać),
    `test/engine-card-agnostic-guard.test.js` (ADR 0002 — brak porównań
    `cardId`/`cardName` z literałem; zweryfikowany **mutacyjnie**),
    `test/bug-hunt-2026-08-17-tapped-events.test.js` (L24 — żadna ścieżka
    nie ustawia `tapped: true` po cichu).
  - **Stan:** `npm run test:all` **2060/2060**, build 51 modułów / 1832,4 kB.
  - Pełne B0 (ADR 0018) NIE liczone — decyzja właściciela na tę sesję.

- **Ostatnia aktualizacja:** 2026-08-17 (M116: Cuombajj Witches — batch 34 zamknięty, 10/10)
- **M116 — ostatnia karta batcha 34.** Cuombajj Witches {B}{B} 1/3:
  „{T}: 1 obrażenie dowolnemu celowi I 1 obrażenie dowolnemu celowi
  **wybranemu przez przeciwnika**":
  - nowa **blokująca decyzja PRZECIWNIKA** (`pendingOpponentTarget`,
    komenda `resolve_opponent_target`, zdarzenia `opponent_target_*`);
  - aktywacja jest **wstrzymywana przed zapłatą kosztów** — cele wybiera się
    przed kosztami (CR 601.2c przed 601.2h), więc gdy przeciwnik wskazuje cel,
    Wiedźmy nie są jeszcze zatapnięte; po decyzji dokańcza ją
    `performActivation` (ten sam wzorzec co koszt „odrzuć kartę");
  - cel przeciwnika dochodzi jako kolejny slot celów zdolności, więc drugi
    efekt obrażeń czyta go przez `targetIndex` i podlega zwykłej rewalidacji
    przy rozstrzyganiu (CR 608.2b);
  - komenda dopisana do obu botów (inaczej partia stanęłaby na decyzji).
  - **Batch 34: 10 z 10.** Katalog bez ani jednego `imageUri: null`.
  - **Stan:** `npm run test:all` **2051/2051**, build 51 modułów / 1829,5 kB,
    benchmark: heuristic 60,3 % vs aggro, 89,3 % vs random, 0 niedokończonych.


- **Ostatnia aktualizacja:** 2026-08-17 (M115: Krumar Initiate — {X} + zapłata X życia + endure X)
- **M115 — dziewiąta karta batcha 34** (+ komplet ilustracji):
  - **koszt aktywacji `{X}{B}` z zapłatą X życia** — oferta enumeruje warianty
    X ograniczone MANĄ (po odjęciu stałej części kosztu) i ŻYCIEM (CR 118.4),
    a zapłata życia jest KOSZTEM (CR 601.2h — przed efektem, bezzwrotna);
  - **endure X** (`endure_x`) — ta sama decyzja kontrolera co endure z ETB
    (liczniki albo token Spirit X/X), tylko z wartością dynamiczną;
  - **root cause przy okazji:** `xValue` przekazywany do efektów był ŁĄCZNĄ
    zapłaconą maną, a nie wybranym X — przy `{X}{B}` te liczby się różnią
    (X=2 to 3 many), więc endure dawało 3 zamiast 2;
  - **ilustracje:** katalog nie ma już ani jednego `imageUri: null`
    (6 adresów dociągniętych ze Scryfalla).
  - **Stan:** `npm run test:all` **2047/2047**, build 51 modułów / 1822,5 kB,
    benchmark: heuristic 59,5 % vs aggro, 89,1 % vs random, 0 niedokończonych.
  - Batch 34: **9 z 10**; zostaje Cuombajj Witches (decyzja przeciwnika).


- **Ostatnia aktualizacja:** 2026-08-17 (M114: Chronic Flooding — aura na land + trigger tapnięcia)
- **M114 — ósma karta batcha 34.** Chronic Flooding {1}{U} („Enchant land;
  whenever enchanted land becomes tapped, its controller mills three cards"):
  - **aura na LAND** — nowy rodzaj gospodarza (`aura.enchant: 'land'`)
    w legalności załącznika, w ofercie rzutu i w walidacji;
  - **trigger `enchanted_permanent_tapped`** — zdolność siedzi na AURZE,
    a zdarzeniem jest tapnięcie GOSPODARZA;
  - **root cause przy okazji:** tapnięcie landa za manę mutowało `tapped`
    po cichu, BEZ zdarzenia `object_tapped` (lekcja L24) — więc żaden trigger
    „becomes tapped" nie mógł zadziałać. Zdarzenie powstaje teraz także na tej
    ścieżce i wraca w strumieniu komendy;
  - mill trafia w kontrolera ZACZAROWANEGO landa (`applyTo:
    'enchanted_controller'`, CR 109.5), nie w kontrolera aury.
  - **Stan:** `npm run test:all` **2043/2043**, build 51 modułów / 1818,1 kB,
    benchmark: heuristic 59,8 % vs aggro, 88,9 % vs random, 0 niedokończonych.
  - W kolejce (`docs/TODO.md`): Krumar Initiate i Cuombajj Witches.


- **Ostatnia aktualizacja:** 2026-08-17 (M113: batch 34 — 7 z 10 kart właściciela)
- **M113 — batch 34 (lista właściciela z 2026-08-17).** Zrobione 7 kart,
  3 z nową ciężką mechaniką odłożone na górę `docs/TODO.md`:
  - **Akrasan Squire** {W} — exalted (mechanika była);
  - **Elgaud Inquisitor** {3}{W} — lifelink + dies → Spirit 1/1 **z lataniem**
    (nowy token `token_spirit_flying`; istniejący Spirit z endure jest bez lotu);
  - **Fledgling Imp** {2}{B} — koszt „{B}, odrzuć kartę" (bez tapnięcia);
  - **Chained Throatseeker** {5}{U} — infect + nowa statyczna restrykcja
    `cantAttackUnlessDefenderPoisoned` (atak tylko na zatrutego);
  - **Sterling Keykeeper** {1}{W} — nowy typ celu `creature_without_subtype`
    („target non-Mount creature", oferta i walidacja spójne);
  - **Circle of the Land Druid** {1}{G} — opcjonalny mill 4 + dies → nowy typ
    celu `land_card_in_graveyard` i efekt `return_card_from_graveyard_to_hand`;
  - **Academy Journeymage** {4}{U} — warunkowa obniżka kosztu **permanentu**
    (nowe pole karty `costReduction`, wspólna funkcja `conditionalCostReduction`
    dla czarów i permanentów) + ETB bounce stwora przeciwnika.
  - **Stan:** `npm run test:all` **2040/2040**, build 51 modułów / 1814,2 kB,
    benchmark szybki: heuristic **60,1 %** vs aggro, **91,3 %** vs random,
    0 niedokończonych (`tools/b9-m113-2026-08-17.txt`).
  - Talie: azorius +3, innistrad +1, mechanicy +1, black +1, green +1;
    przelosowane hunterem seedy 8 testów scenariuszowych (lekcja L25).


- **Handoff sesji 2026-08-17 (M109–M116): `docs/setup/HANDOFF_2026-08-17-m116.md`**
- **Backlog pomysłów: `docs/backlog.md`** (zbiór pomysłów na przyszłość, nie kolejka zadań — decyzja właściciela 2026-08-17;
  na górze to, co robimy jako następne).

- **Ostatnia aktualizacja:** 2026-08-17 (M112: walka na stole + oś „noop" wchodzi do wizardów)
- **M112 — domknięcie kolejki z handoffu:**
  - **sekcja `combat` z PlayerView użyta na stole** (ADR 0017): kafle pokazują
    „atakuje — niezablokowany / blokują: X" i „blokuje: Y". Do tej pory gracz
    widział tylko tapnięcie i musiał zgadywać układ walki. Bot czyta stamtąd
    także siłę atakujących wroga (znacznik `attacking` z kafli został jako
    fallback dla starych widoków/replayów);
  - **wizard walki i wizard scry/surveil są mierzone sondą „oferta bez
    skutku"**: przycisk „Zatwierdź atak/bloki" dostaje `data-option-key`
    liczony z BIEŻĄCEGO zaznaczenia (odświeżany po każdym przełączniku),
    a w scry/surveil klucz dostaje decyzja KOŃCZĄCA wizard (gdy po niej
    komenda jest już znana). `commandOptionKey` rozróżnia teraz warianty
    walki i podglądu (`attackerIds`, `assignments`, `bottomIds`, `millIds`,
    `topOrder`, `order`);
  - Żywy Tester (azorius vs innistrad, seed 23): **171 sond** (było 148),
    0 zgłoszeń detektorów.
  - **Stan:** `npm run test:all` **2021/2021**, build 51 modułów / 1803,0 kB.


- **Ostatnia aktualizacja:** 2026-08-17 (M111: koniec z ograniczeniami — `limitations` = realny dług wobec Oracle)
- **M111 — cztery kroki po M110** (polecenie: „te ograniczenia mają być
  wyeliminowane i gotowe na nowe karty"):
  - **obniżki kosztu działają przy KAŻDYM sposobie rzucenia** (CR 601.2f):
    escape, flashback, cleave, adventure, bestow, czar modalny i rzut zakryty
    — helper `reduceAlternativeCost`, wpięty w ofertę i płatność;
  - **kopie czarów wielocelowych** wybierają cel slot po slocie (storm);
    przy okazji efekt `damage` respektuje `targetIndex`;
  - **bot wycenia tryby modalne** (czar i trigger) — koniec „bierze pierwszy";
  - **`limitations` znaczy wyłącznie „tu NIE gramy pełnego Oracle"**: 58 kart
    dostało opisy w nowym polu `notes`, zostały **34** karty z ograniczeniem
    i każda ma jeden z trzech dopuszczonych powodów (token, tylna strona DFC,
    brak strefy dowodzenia w 1v1). Strażnik: `test/limitations-guard.test.js`,
    zasada w `AGENTS.md`.
  - **Stan:** `npm run test:all` **2018/2018**, build 51 modułów / 1796,6 kB,
    benchmark szybki: heuristic **62,3 %** vs aggro, **87,8 %** vs random,
    0 niedokończonych.


- **Ostatnia aktualizacja:** 2026-08-17 (M110: eliminacja ograniczeń — 100 % Oracle)
- **M110 — trzy PRAWDZIWE odstępstwa od Oracle zamknięte** (polecenie
  właściciela „100 % kart wg Oracle"); szczegóły:
  `docs/plans/2026-08-17-m110-eliminacja-ograniczen.md`:
  - **Spare from Evil** — ochrona przed jakością dostała brakujące litery
    DEBT: celowanie (CR 702.16b — źródło przekazywane do `validateTargets`
    i `legalTargetCandidates`, więc oferta = walidacja) oraz załączniki
    (702.16c — zakaz przypięcia i odpadanie w SBA);
  - **Spreading Insurrection** — storm jest ZDOLNOŚCIĄ TRIGGEROWANĄ (okno
    odpowiedzi, kopie przy rozstrzygnięciu triggera) i kontroler może wskazać
    kopiom NOWE cele (`resolve_copy_targets`, CR 702.40a/706.10c);
  - **Willbender** — przekierowuje cel także ZDOLNOŚCI na stosie
    (CR 115.7); ograniczenie opisywało silnik sprzed `activatedEntry`.
  - **Stan:** `npm run test:all` **2006/2006**, build 51 modułów / 1791,8 kB,
    benchmark szybki bez zmian (61,9 % vs aggro, 88,1 % vs random).
  - W kolejce świadomie zostawione: Etherium Sculptor (koszty alternatywne —
    dziś teoretyczne), Jyoti (brak strefy dowodzenia), wybór trybu przez bota.


- **Ostatnia aktualizacja:** 2026-08-17 (M109: batch 33 — transza 2, 7 kart)
- **M109 — dokończenie listy właściciela z batcha 33.** Siedem kart, każda
  z NOWĄ mechaniką silnika (Oracle ze Scryfalla, kolejność od najtańszej
  mechaniki do storma):
  - **Chill of the Grave** {2}{U} — obniżka kosztu warunkiem na PODTYPIE
    permanentu (`controlsSubtype`, CR 601.2f);
  - **Diplomatic Relations** {2}{G} — typ celu `creature_opponent_controls`
    (oferta + walidacja) i efekt `damage_from_target_power`: obrażenia zadaje
    STWÓR, mocą liczoną po buffie z tego samego czaru (CR 608.2c);
  - **Sagittars' Volley** {2}{G} — typ celu `creature_with_keyword` (keyword
    efektywny) i fala `damage_creatures_with_keyword`;
  - **Nightsnare** {3}{B} — `reveal_hand_choose_discard`: odsłonięcie ręki
    (`hand_revealed`) i decyzja RZUCAJĄCEGO o cudzej karcie (`chooserId`),
    a rezygnacja przełącza na dwa odrzucenia wybierane przez właściciela ręki
    (CR 701.8a);
  - **Tiller of Flesh** {3}{W} — trigger `you_cast_spell_targeting_permanent`
    i **incubate** (CR 701.47): dwustronny token Incubator → Phyrexian 0/0
    (liczniki zostają, CR 707.9); `transform` przenosi teraz `kind` i `types`;
  - **Spare from Evil** {1}{W} — **ochrona przed JAKOŚCIĄ** (CR 702.16), dotąd
    silnik znał tylko kolorową: bloki (702.16e) i prewencja obrażeń (702.16d);
  - **Spreading Insurrection** {4}{R} — **storm** (CR 702.40): kopie wg
    `spellsCastThisTurn`, nie są rzucane i po rozstrzygnięciu przestają
    istnieć (CR 707.10/608.2m).
  - Ograniczenia świadome (w `limitations` kart): jakościowa ochrona nie
    obejmuje celowania i odpadania aur; kopie storma zachowują cel oryginału
    i nie mają osobnego triggera do odpowiedzi.
  - Bot: wycena trzech nowych efektów (ochrona = sztuczka BOJOWA, fala
    obrażeń wg trafionych/zabitych, obrażenia z mocy stwora).
  - Poprawione dwa ZMYŚLONE adresy ilustracji z transzy 1 (Somberwald Spider,
    Kazuul's Toll Collector) — nie były prawdziwymi odnośnikami Scryfalla.
  - **Stan:** `npm run test:all` **1993/1993**, build 51 modułów / 1781.6 kB,
    benchmark szybki: heuristic **61,9 %** vs aggro, **88,1 %** vs random,
    0 niedokończonych (progi regresji 0,57 / 0,78).
  - Plan i pomiary: `docs/plans/2026-08-17-m109-batch33-transza2.md`,
    lekcja **L25** (test scenariuszowy nie może zależeć od tego, KTO zagrał).


- **Ostatnia aktualizacja:** 2026-08-16 (M106: audyt stołu Żywym Testerem)
- **M106 — audyt „z perspektywy gracza" (zlecenie właściciela): 10 znalezisk.**
  Siedem partii na artefakcie (7 par talii × 5 profili); detektory milczały —
  wszystko z czytania transkryptu jak gracz. Naprawione u root cause:
  - **Z1** masowe buffy „do końca tury" (Hysterical Blindness −4/−0, Turn the
    Tide, Angel of the Dawn, Jyoti) nie emitowały ŻADNEGO zdarzenia → nowe
    `mass_stats_modified` + opis w logu i panelu;
  - **Z3** panel przypisywał akcje bota do nieaktualnej fazy („land w
    upkeepie") — `step_advanced` wypadał z bufora poza `botActing`;
  - **Z4** `turn_started` emitowany PO odkręceniu (CR 500.1/502.1) — zdarzenia
    kroku odkręcania lądowały w poprzedniej turze;
  - **Z5** grupa equipu nazywa się „Wyposaż: X", nie „Cel zdolności: X";
  - **Z6/Z7** bot rzucał czary bez skutku poza walką (Flurry of Wings przy
    0 atakujących, masowe −N/−0 w upkeepie) — wycena zna dynamiczne liczby
    i fazę;
  - **Z8** bot kładł 4 kopie tej samej celowanej zdolności na ten sam cel
    (3 fizzle) — PlayerView nie pokazywał celów zdolności na stosie
    (ADR 0017, lekcja L1), więc bot był ślepy; widok + wycena naprawione;
  - **Z9** Żywy Tester nie obsługiwał kreatora many (cała ścieżka płatności
    poza audytem, klik wyglądał na martwy) — tapuje teraz źródła jak gracz;
  - **Z10** klik w inną akcję przy otwartym kreatorze gubił wstrzymany rzut
    i omijał kreator — teraz jawne zamknięcie z wpisem w logu.
  - **Z2 (decyzja właściciela):** trigger bez skutku MÓWI o tym graczowi
    („brak legalnych celów" / „nic się nie wydarzyło"), a bot nie używa
    czarów i zdolności, których cała treść jest pusta JUŻ w chwili decyzji
    (`allEffectsInertNow`); późniejszy fizzle celu pozostaje normalnym
    ryzykiem gry (CR 608.2b). Przy okazji ujawniona luka widoku: `PlayerView`
    nie ma sekcji `combat` — liczbę atakujących bot czyta ze znacznika
    `attacking` na kaflach (ADR 0017/L1).
  - **Stan:** `npm run test:all` **1949/1949**, build 51 modułów / 1740.2 kB.

- **Ostatnia aktualizacja:** 2026-08-16 (M105: brązowa odznaka — 6 błędów vs CR)
- **M105 — łowy na błędy vs Comprehensive Rules (wyzwanie właściciela).**
  Sześć unikalnych znalezisk, każde z testem RED→GREEN
  (`test/bug-hunt-2026-08-16-bronze.test.js`, 15 testów):
  - **B1/B2 (CR 202.1) brakujące pipy kolorowe w kosztach zdolności** —
    Trigon of Corruption „{B}{B}" i Goblin Picker „{R}" były opłacalne
    DOWOLNĄ maną (deskryptor bez `cost.colors`).
  - **B3 (CR 202.3) Monastery Flock** — koszt {2}{U} zapisany jako
    `manaCost: 2` (stwór tańszy o manę, zaniżona mana value). Dołożony
    STRAŻNIK katalogu: manaCost każdej karty = mana value stringa kosztu
    (z uwzględnieniem phyrexian).
  - **B4/B5 (CR 601.2c) „up to N targets" bez wariantu ZERO celów** —
    Aerith Rescue Mission (tryb tapowania nie istniał przy pustym stole)
    i Lodestone Needle (przymusowe tapnięcie własnego permanentu).
  - **B6 (CR 603.7b) „at the beginning of THE NEXT end step"** — opóźnione
    wygnanie czekało na krok końcowy KONTROLERA, więc token-kopia Cogwork
    Assembler stworzony w turze przeciwnika przeżywał całą jego turę
    (znacznik `anyPlayerEndStep`; Puppeteer Clique „YOUR next end step"
    bez zmian — test anty-over-fix).
  - Sprawdzone i ODRZUCONE jako poprawne (rejestr w planie sesji): pula many
    CR 500.4, tokeny CR 111.7, SBA aur CR 704.5m, deathtouch+trample,
    menace, regeneracja, indestructible, limit lądów, zdolności many
    CR 605.3a, cleanup CR 514.2, morph jako akcja specjalna (dołożony
    strażnik), P/T i kolory tokenów, Devoid, phyrexian.
  - **Stan:** `npm run test:all` **1938/1938**, build 51 modułów / 1727.1 kB,
    benchmark szybki bez zmian (heuristic 58,2% vs aggro, 92,1% vs random).

- **Ostatnia aktualizacja:** 2026-08-16 (M104: sonda „noop" w modalach i skan
  okna, wzorzec U9/A2 dla tapnięć/odkręceń, domknięcie ci.yml)
- **PR sesji:** `arena/01a00b7e-mtg` (PR #56 — M104, W TRAKCIE)
- **M104 — trzy „następne kroki" z handoffu M103 + jedno znalezisko po drodze.**
  - **E2 sonda `noop` w MODALACH:** przyciski opcji `renderChoiceRequest`
    niosą `data-option-key`, sterownik testera sonduje wybraną opcję,
    a detektor rozróżnia źródło (`panel` / `modal`) i pomija w modalu
    opcje REZYGNACJI („rezygnuję", „nie płać", „bez celów", „Bez bloków") —
    tam „nic nie rób" jest legalnym wyborem, nie ofertą bez skutku.
  - **E3 wzorzec U9/A2 dla kolejnych klas no-opów:** `abilityEffectIsNoOp`
    (tablica predykatów po `effect.type`, ADR 0002) chowa oferty
    `untap_permanent` na nietapniętym celu (Rustvine Cultivator),
    `tap_permanent` na tapniętym, `cant_block`/`cant_be_blocked` na celu
    ze znacznikiem (Coralhelm Guide), `add_counter` z `amount <= 0` oraz
    dotychczasowe `grant_keywords…` (A2). `execute` nadal przyjmuje komendę
    (CR 602.2b). Anty-over-fix: `onNthResolve` i koszt o własnej wartości
    (poświęcenie/wygnanie/odrzucenie — Panic Spellbomb) wyłączają bramkę.
    Skan katalogu: klasa „licznik bez skutku" NIE występuje (liczniki, w tym
    stun, kumulują się — CR 122.1b).
  - **E4 sonda mierzy CAŁE okno (znalezisko z weryfikacji mutacyjnej):**
    pomiar był przypięty do kliknięcia, więc no-op, którego polityka gracza
    nie wybrała, nie był mierzony nigdy (mutacja bramki E3 → 0 zgłoszeń mimo
    no-opów w panelu). Teraz `scanOffers` sonduje każdą widoczną ofertę raz
    na partię (dedupe + limit 600); dodatkowo koszt „Remove a counter" jest
    klasyfikowany jako KOSZT (`costCounterPaid`), bo zdjęty licznik maskował
    no-opa (klasa błędu jak L18). Mutacja po poprawkach: 9 zgłoszeń →
    po przywróceniu bramki cisza. Lekcje L20, L21.
  - **E4b odrzucenia komend strukturalnie (reguła M99):** `detectRuleSmells`
    czytał je wyłącznie z linii `LOG:` snapshotu (pod `--quiet` 0 zgłoszeń,
    ze snapshotami 3). Sterownik zbiera je teraz z DOM.
  - **E7 nieodświeżony panel po ptaszku wyciszenia (root cause tych trzech
    odrzuceń):** `toggleIgnoredOption` renderował PRZED `recheckAutoPass`
    i nie renderował po przewinięciu gry — gracz widział panel z minionego
    okna (kolejne tapnięcie = „Ruch odrzucony"), a ruchy bota z przewinięcia
    nie trafiały do modala „Rozgrywka". Semantyka ptaszka jest poprawna
    (decyzja właściciela 2026-08-16); naprawiona wyłącznie kolejność:
    `recheckAutoPass → autosave → rerender → showBotMoves`. Weryfikacja:
    przebieg z 3 odrzuceniami daje 0; macierz 5 partii (`--tick-rate 0.3`)
    czysta. Lekcja L22.
  - **E5 wzorzec `ci.yml`/`pages.yml`:** pakiet w CI ma iść równoległym
    runnerem (`node tools/run-tests.mjs all`, ADR 0019) zamiast sekwencyjnego
    `node --test`. Push plików `.github/workflows/*` z sesji agentowej jest
    blokowany (App bez uprawnienia `workflows`), więc commit zmienił wzorzec
    `docs/setup/workflows/`; **właściciel wgrał go ręcznie 2026-08-16**
    (commity „Update ci.yml"/„Update pages.yml", przebieg CI 31968213590
    zielony z krokiem „Testy jednostkowe (równoległy runner, ADR 0019)").
    Strażnik `test/ci-workflow-tiers.test.js` pilnuje, że wzorzec i faktyczny
    workflow nie rozjadą się w niczym poza linią uruchomienia testów.
  - **Stan:** `npm run test:all` **1923/1923**, build 51 modułów / 1725.2 kB,
    benchmark (profil szybki, ADR 0018): heuristic 58,2% vs aggro,
    92,1% vs random, 0 niedokończonych.

- **Ostatnia aktualizacja:** 2026-08-15 (M100: audyt PR #52 + panel „Rozgrywka")
- **PR sesji:** `arena/01a0046e-mtg` (PR #53 — M100, W TRAKCIE)
- **M100 — panel „Rozgrywka" (dawniej „Ruch przeciwnika") + audyt PR #52.**
  Panel nie jest już kroniką wyłącznie bota: to WSPÓLNE streszczenie rozgrywki
  obu graczy (rzuty i rozstrzygnięcia, dobrania z efektu, manipulacje
  biblioteką, walka), trzymane regułą: nagłówek tury = treść, „Faza: X" =
  szum, draw step = szum, dobranie z efektu = treść.
  - **E0 audyt PR #52:** czysto (46 plików, bez batcha kart; engine i bot
    generyczne — ADR 0002).
  - **E1 rename:** tytuł UI + marker transkryptu testera `[ROZGRYWKA]`;
    identyfikatory wewnętrzne (botMoves itd.) bez zmian.
  - **E1.5 BUG A (zgłoszenie właściciela):** wyciek nazwy karty face-down
    przeciwnika — modal pokazywał „Nieprzyjaciel zagrywa Segmented Krotiq
    twarzą w dół", atak: „zakryta kreatura Segmented Krotiq". Root cause:
    fixy M66/M74 („LKI cardId zamiast ?") nazywały po cardId nawet ŻYWE
    zakryte obiekty. Fix: nazwa z żywego obiektu ma pierwszeństwo
    (face-down ⇒ „morph"), LKI dopiero gdy obiekt zniknął ze stanu
    (CR 708.8/708.9 — nazywanie po śmierci/kontrze legalne). Obejmuje:
    rzuty, atak/blok, obrażenia, cele czarów, wejścia, attach, keywordy,
    widok podziału obrażeń (viewerId w engine), wizard podziału, skan karty
    w modalu. Test `test/fow-facedown-names.test.js` (11, RED→GREEN).
  - **E2 symetria rozstrzygnięć:** śledzenie stosu OBU graczy
    (`stackObjects`), zdarzenia komendy człowieka przez tę samą bramkę —
    rozstrzygnięcia i skutki (stats z rozstrzygnięcia) czarów człowieka w
    panelu, modalne z trybem obu graczy. Test
    `test/spell-resolution-symmetry-modal.test.js` (mutacja: kod sprzed E2
    pada objawem buga).
  - **E3 dobrania z efektu:** `card_drawn` z `source:'effect'` człowieka w
    panelu (root-fix z E2; draw step nadal szum — strażnik testowy).
  - **E4 manipulacje biblioteką — nazwy tylko FoW-legalne:** własne
    podejrzenia z treścią (scry spód+wierzch, Index kolejność, look pick),
    grób publiczny (card_milled obaj), jawne odsłonięcia (Epic Experiment,
    tutor wg kryterium = reveal, CR 701.20 — nowe pole `foundCardId`).
    Podejrzenia bota bez nazw. Emiterzy: `scry_resolved` bottom/topCardIds,
    `index_resolved` orderCardIds. Test `test/library-manipulation-modal.test.js` (8).
  - **E5 nagłówkowe zagrania człowieka:** rzut/ląd/aktywacja/wejście
    permanentu/transform w panelu (kontekst dla odpowiedzi bota). Test
    `test/human-plays-modal.test.js` (2).
  - **E6 audyt Żywym Testerem, OBIE tryby (L13):** detektor złapał i
    naprawiono: token niestworowy „(null/null)", surowy slug triggera
    `enchantment_you_control_enters`, pusty segment „na wierzchu:" przy scry
    „wszystko na spód". Żywe dowody BUG A w transkryptach (morph bota bez
    nazwy; własny — z nazwą; „Face-down creature" na stole). Transkrypty
    `tools/table-tester/audyt-m100-*` (snapshoty zzipowane).
  - **E8 własne dobranie w panelu** (zlecenie właściciela): dobranie
    standardowe w draw step człowieka jako komunikat „Ty dobierasz …"
    (nazwa dla właściciela, licznik u bota) — draw step przestał być szumem
    PO STRONIE człowieka; strona bota nadal wyciszona (FoW).
  - **E9 polowanie na 10 unikalnych błędów Żywym Testerem** (zlecenie
    właściciela): 13 partii (różne pairingi talii × wszystkie profile ×
    tick 0/1), 10 błędów z repro (P1, P3, P4, P6–P12; szczegóły w planie).
    Najcięższe: deadlock nieskończonego mulliganu (ręka pusta po 7.
    mulliganie, a oferta keep:false wieczna — CR 103.4), token Tarmogoyfa
    „(0/0)" a na stole 3/4, własny morph opisywany jako „morph" mimo
    CR 708.6. Odrzucone z dowodami: zgłoszenie [info] detektora przy
    tick 1 = celowe wyciszenie ptaszkiem; „duplikaty" celów = odrębne
    obiekty; wilkołak i kontra bota = zachowania poprawne/poza zakresem.
  - **E10 łatki P1/P3/P4/P6–P12 (4 commity, +23 testy):** limit
    mulliganów (`mulligan_below_zero_hand` + oferta tylko keep przy ≥ 7),
    token_created ze statami EFEKTYWNYMI, polishPlural w scry/surveil/Index
    („2 karty", nie „2 kart"), bestow tylko gdy `bestow:true`, opis mentora
    przy pustych efektach, deskryptor `aura` w cardInfo + rulesText aury,
    bez gołego „{4}" po opisie equip, bez pleonazmu „cel: dowolny cel",
    własny zakryty nazwany (CR 708.6; wrogi zostaje „morph" — CR 708.2),
    podtypy wg Oracle (Equipment / Turtle Ninja / Insect / Elk) + strażnik
    registry. Każdy błąd: root cause + test RED→GREEN + weryfikacja żywa
    po rebuild. Transkrypty RED `audyt-m100-e9-*` / GREEN
    `audyt-m100-e10-VERIFY-*`.
  - **E11 PRAWDZIWY audyt PR #52** (zlecenie właściciela — poprawka do
    powierzchownego E0): przegląd KODU per mechanika (nie mapowania plików).
    Werdykt: PR #52 merytorycznie poprawny — remis CR 104.4b, reset passes
    CR 117.3c, własność obiektów CR 400.3/110.2a/110.6b/400.7, fizzle
    zdolności CR 608.2b, copy-token DFC CR 707.8a, FoW face-down, parity
    bota z isDamagePrevented (ADR 0002), ptaszek grup wariantów, filtr
    „Faza:" — wszystkie zgodne z CR i bez skutków ubocznych; testy PR czysto
    adytywne (0 usuniętych asercji). Znalezione: 1 kłamiący docstring
    (zoneLabel — naprawiony tu), 4 uwagi kosmetyczne (opisane w planie,
    w tym pre-existing docstring goad) — nic blokującego. Raport: plan §E11.
  - **E12 morph własny ze znacznikiem** (pytanie właściciela): własny zakryty
    pokazuje nazwę + „(morph)" w logu/etykietach, kafel z nazwą + badge
    „zakryty (morph)" przy żywych 2/2 (tekst/art nadal rewersem — nie udaje
    pełnej karty). Wróg bez zmian („morph", „Face-down creature").
  - **E13 equip (zgłoszenie A):** koniec tryplikatu — „aktywuje Equip: X →
    cel: Y" (intencja z nazwą zdolności) + „X wyposaża Y" (skutek, dokładnie
    raz; object_attached wpuszczone do modala Rozgrywka), fizzle z etykietą
    Equip i powodem (CR 608.2b). Bot: koniec ping-ponga sprzętem między
    równymi nosicielami — re-equip tylko przy Δ siły ≥ 2 (benchmark 7/7).
  - **E14 badge choroby (zgłoszenie B):** stwór z haste nie dostaje badge
    „choroba" (CR 302.6+702.10 — Puppeteer Clique pokazywał dezinformację);
    badge liczy teraz efektywne keywordy z widoku.
  - **Stan:** `npm test` **1738/0** (1677 → 1738, +61), build 50 modułów /
    **1668.0 kB**, `bot-benchmark` 7/7.

- **Ostatnia aktualizacja:** 2026-08-14 (M99: weryfikacja mutacyjna detektorów
  Żywego Testera; wpis uzupełniony w M100 — był pominięty)
- **M99 — metoda: przywróć buga → tester sam go zgłasza → przywróć fix →
  0 zgłoszeń.** Testy jednostkowe detektorów dowodziły tylko reakcji na
  spreparowane wejście, więc weryfikację podniesiono na poziom całego
  narzędzia. Naprawione BŁĘDY NARZĘDZIA: `detectNoResponseWindow` (fałszywy
  alarm w `--quiet`), `detectDeadEndWindow` (jedno okno na partię zamiast
  wszystkich — sterownik zbiera `windowRecords` ścieżki, niewrażliwy na
  poziom logowania); nowy profil `impatient` (klika w trakcie pauzy bota —
  odtworzył ekran „tylko Poddaj partię"). Naprawione BŁĘDY PRODUKTU znalezione
  przy okazji: log „wskazuje ? z ręki przeciwnika" (Dreams of Steel and Oil);
  modal gubił ROZSTRZYSGNIĘCIE czaru bota (rozstrzyga się po passie gracza,
  gdy `botActing` już false — śledzenie `botStackObjects` po kontrolerze)
  i SKUTEK (+3/+3, stats wyciszone globalnie jako szum — dopiero rozważania
  M100 z pełnych danych). Lekcja L13 w LESSONS.md.
- **Stan (M99):** `npm test` **1677/0**, benchmark 7/7.

- **Ostatnia aktualizacja:** 2026-08-14 (M98: korekta właściciela — nagłówek
  tury to treść; wpis uzupełniony w M100 — był pominięty)
- **M98 — korekta do znaleziska M97:** początek tury jest ISTOTNY
  („Modal nie powinien być pusty, ale jeśli w środku jest informacja
  o początku mojej tury i nic więcej, to to nie jest błąd" — właściciel).
  `showBotMoves` pomija modal wyłącznie gdy niesie samą nazwę
  fazy („Faza: Główna 1"); wpis „Tura N — X" zostaje. Detektor pustych
  modali testerem zawężony odpowiednio; test pilnuje OBU stron.

- **Ostatnia aktualizacja:** 2026-08-14 (M97: rozbudowa Żywego Testera + audyt)
- **PR sesji:** `arena/01a000df-mtg` (PR #52 — M90…M97)
- **M97 — szersza polityka gracza w testerze + audyt.** Do M96 tester zawsze
  klikał „pierwszą sensowną akcję" i „pierwszą opcję modala", więc całe gałęzie
  UI nigdy nie były odwiedzane. Rozbudowa:
  - **4 profile gracza** (`--profile`): `greedy` (regresja M80–M96), `random`,
    `defensive`, `explorer`; losowość deterministyczna (`--policy-seed`,
    xorshift32 — ADR 0005), więc znaleziska są odtwarzalne;
  - **`--tick-rate`** — gracz czasem ptaszkuje akcję (oś 3 sprawdzana w ruchu);
  - **combat wizard i modale zależne od profilu** (skala ataku, liczba blokerów,
    wybór opcji) — `defensive` odwiedza ~120 akcji vs ~20 w `greedy`;
  - **detektory** (`tools/table-tester/detectors.mjs`): automatyczny przesiew
    transkryptu w kategoriach `bot`/`info`/`ui`/`rules` + raport pokrycia UI.
    Testy: `test/table-tester-detectors.test.js` (17).
  - **Znalezisko audytu (skorygowane w M98):** modal „Ruch przeciwnika"
    otwierał się także wtedy, gdy niósł wyłącznie nagłówki. **Korekta
    właściciela:** początek tury to ISTOTNA informacja — modal z wpisem
    „Tura 5 — Ty" jest poprawny i zostaje. Szumem jest tylko sama nazwa FAZY
    („Faza: Główna 1") bez zagrania. Fix w `showBotMoves` zawężony do fazy;
    test `audit-m96-tester.test.js` pilnuje OBU stron: brak modali z samą fazą
    i obecność nagłówków tury u gracza.
  - **Odrzucony fałszywy alarm:** „bot celuje w siebie" dla Inspiration
    („target player draws two cards" — na siebie to optymalne zagranie);
    detektor zawężony do efektów szkodliwych.
- **Stan:** `npm test` **1652/0** (1634 → 1652, +18), build 50 modułów /
  **1646.6 kB**. Bot nietknięty w M97 → benchmark bez zmian.

- **Ostatnia aktualizacja:** 2026-08-14 (M96: audyt Żywym Testerem — rola gracza)
- **PR sesji:** `arena/01a000df-mtg` (PR #52 — M90…M96)
- **M96 — audyt „z perspektywy gracza" (17 partii, 11 talii).** Trzy osie
  wskazane przez właściciela: bezsensowne działania bota, kompletność
  informacji w logu/modalu, ptaszki auto-pass. Naprawione 5 znalezisk:
  1. **bot mielił własną bibliotekę** (Cellar Door ×7) — scoring
     `activate_ability` nie wyceniał celu-gracza dla mill/damage/lose_life;
  2. **bot pompował firebreathing w Głównej 1** (Shiv's Embrace ×10) —
     `pump_enchanted_creature` nie wpadało do wyceny pump; dodana kara za
     pompowanie „until end of turn" poza combatem;
  3. **nadanie POŚPIECHU niewidoczne** — `keyword_granted` było wyciszone
     globalnie z powodu backupu; znacznik `viaBackup` wycisza tylko dublet;
  4. **`proliferate_resolved`** pokazywał graczowi surowy identyfikator;
  5. **angielskie nazwy stref** w modalu ruchu bota → `ZONE_LABELS`/`zoneLabel`.
  - Weryfikacja na stole po naprawach: mielenie siebie **7 → 0**, surowe
    strefy **→ 0**.
  - **Dokumentacja testera**: `docs/setup/TESTER_STOLU.md` ma teraz sekcję
    „Czego szukać — osie audytu" (checklista na przyszłość) oraz regułę
    „ograniczenie ≠ usprawiedliwienie — tester też się naprawia" (decyzje
    właściciela). Lekcja **L12** w `docs/LESSONS.md`; `test/docs-decisions.test.js`
    (14) pilnuje obu treści.
- **Stan:** `npm test` **1634/0** (1619 → 1634, +15), build 50 modułów /
  **1646.0 kB**, bot-benchmark 7/0. Benchmark 6 seedów: heuristic
  **95.2% vs random**, **66.6% vs aggro** — bez regresji.

- **Ostatnia aktualizacja:** 2026-08-14 (M95: brązowa odznaka — audyt vs CR)
- **PR sesji:** `arena/01a000df-mtg` (PR #52 — M90…M95)
- **M95 — polowanie na błędy vs Comprehensive Rules (6 znalezisk):**
  1. **CR 104.4b** — brak REMISU: pętla SBA kończyła grę na pierwszym
     przegranym i ogłaszała drugiego zwycięzcą (o wyniku decydowała kolejność
     w `state.players`). Teraz `winnerId: null` + `state.isDraw`.
  2. **CR 400.3/110.2a** — karta opuszczająca pole bitwy zachowywała
     `controllerId` złodzieja: skradziony stwór po śmierci trafiał do grobu
     ZŁODZIEJA na stałe. Niespójność: `bounce` miał korektę, `destroy`/`exile`
     nie. Fix u root cause w `moveObjectDirectly`.
  3. **CR 110.6b/400.7** — `tapped` przechodziło przez zmianę strefy:
     reanimowany/odbity stwór wracał na stół tapnięty. Ślad maskowania:
     12 miejsc ręcznie zerowało to pole.
  4. **UI remisu** — baner pokazywałby „wygrywa: ?"; dodane komunikaty
     w `render.js`, `main.js`, `session.js` + `isDraw` w PlayerView.
  5. **CR 400.7** — `damagedThisTurn` przeciekało (Fathom Fleet Cutthroat
     mógł celować w nietknięty obiekt).
  6. **CR 400.7** — `attackedThisTurn` przeciekało (Homicidal Brute nie
     transformowała się). Przy okazji: attacking, blocking, saddled,
     monstrous, damagedByDeathtouch, abilityResolvedThisTurn.
  - **Świadomy wyjątek (strażnik):** `formerCounters`, `formerZone`,
    `formerAbilityGrants`, `isBlockingThisCombat` to celowe LKI (CR 603.10).
  - **Metoda i obszary sprawdzone-poprawne:** patrz
    `docs/plans/PLAN_2026-08-14-m95-brazowa-odznaka.md` (ok. 50 sond CR +
    4 skany automatyczne) oraz lekcja **L11** w `docs/LESSONS.md`.
- **Stan:** `npm test` **1619/0** (1599 → 1619, +20), build 50 modułów /
  **1641.4 kB**, bot-benchmark 7/0. Benchmark 6 seedów: heuristic
  **95.4% vs random**, **66.6% vs aggro** — bez regresji.

- **Ostatnia aktualizacja:** 2026-08-14 (M94: ENVIRONMENT.md — pułapki środowiska jako dokument trwały)
- **PR sesji:** `arena/01a000df-mtg` (PR #52 — M90 + M91 + M92 + M93 + M94)
- **M94 — trwała wiedza o środowisku** (uwaga właściciela: „nowa sesja nie ma
  dostępu do plików lokalnych starej sesji, tylko do main i handoffa w formie
  wiadomości tekstowej"; „wszystkie pułapki — typu cofanie HEAD"):
  - **[docs/setup/ENVIRONMENT.md](setup/ENVIRONMENT.md)** — nowy dokument
    trwały zbierający to, co dotąd było powtarzane w sekcjach „Pułapki"
    kilkunastu handoffów i przepadało razem z nimi: izolacja sesji (co
    NAPRAWDĘ przetrwa: `main` + tekst pierwszego promptu), reset workspace
    w trakcie sesji wraz z procedurą odzyskania (`reflog` → `fetch` →
    `reset --hard` → `cherry-pick`), pułapki gita (`git checkout` cofający
    własne zmiany, wygasanie `GH_TOKEN`, obejście `gh pr edit`), sieć
    (zablokowany egress, Scryfall przez `fetch_page`), polskie znaki
    w `edit_file`, limity czasu operacji, checklisty startu i końca sesji.
  - **`docs/LESSONS.md`** — nowe lekcje **L9** (praca istnieje dopiero po
    `git push`) i **L10** (przy zgłoszeniu „UI GitHuba nie działa" zbierz
    twarde dane z API, zanim zmienisz konfigurację).
  - **AGENTS.md** — reguła „praca istnieje dopiero po `git push`" na czele
    zasad pracy z repozytorium + `ENVIRONMENT.md` w lekturach startowych
    i w tabeli „gdzie zapisać regułę".
  - **ADR 0013** — nota wskazująca ENVIRONMENT jako praktyczne rozwinięcie
    decyzji o izolacji sesji.
  - **`test/docs-decisions.test.js`** rozszerzony do **11 testów** (izolacja
    sesji, procedura odzyskania, pułapki narzędzi, podlinkowanie z AGENTS.md).
- **Stan:** `npm test` **1599/0** (1595 → 1599, +4), build 50 modułów /
  **1637.7 kB**. Bot nietknięty → benchmark bez zmian (96.1% / 65.2%).

- **Ostatnia aktualizacja:** 2026-08-14 (M93: ADR 0017 + rejestr lekcji)
- **PR sesji:** `arena/01a000df-mtg` (PR #52 — M90 + M91 + M92 + M93)
- **M93 — reguły trwałe zamiast zapisów w handoffie** (uwaga właściciela:
  „handoff jest jednorazowy i przepada"):
  - **[ADR 0017](decisions/0017-playerview-completeness-contract.md)** —
    kompletność informacji publicznych w `PlayerView`. Trzy reguły:
    (1) informacja jawna w MtG musi być w widoku; (2) zakaz wystawiania pól
    „na zapas" (kryterium: czy kontroler potrzebuje tego do DECYZJI);
    (3) diagnostyka braku danych PRZED strojeniem heurystyki.
  - **[docs/LESSONS.md](LESSONS.md)** — nowy, trwały rejestr lekcji (L1–L8
    z sesji M90–M92): ślepota kontrolera, ślepota benchmarku na rzadkie
    mechaniki, kara vs premia w scoringu, mutacja stanu przy odrzuconej
    komendzie, testy na źródło vs testy zachowania, dane w zdarzeniach,
    prymat repozytorium nad treścią zlecenia, pułapka `git checkout`.
  - **AGENTS.md** — tabela „gdzie zapisać regułę, żeby nie przepadła"
    (ADR / LESSONS / AGENTS / handoff / plan) + sekcja o diagnostyce
    kontrolera; `docs/LESSONS.md` dodany do listy lektur startowych.
  - **`test/docs-decisions.test.js`** (7) — pilnuje spójności rejestru ADR
    (plik ↔ tabela ↔ numer w nagłówku, statusy, wymagane sekcje) oraz formatu
    lekcji i podlinkowania z AGENTS.md. Test od razu wykrył dwie realne
    niespójności: brak wpisu 0017 w tabeli i nagłówek „Proponowana decyzja"
    w zaakceptowanym ADR 0005 (poprawione redakcyjnie, bez zmiany znaczenia).
- **Stan:** `npm test` **1595/0** (1588 → 1595, +7), build 50 modułów /
  **1637.7 kB**. Bot nietknięty w M93 → benchmark bez zmian
  (96.1% vs random, 65.2% vs aggro; progi `0.78 / 0.57`).

- **Ostatnia aktualizacja:** 2026-08-14 (M92: audyt PlayerView vs decyzje bota)
- **PR sesji:** `arena/01a000df-mtg` (PR #52 — M90 + M91 + M92)
- **M92 — audyt wzorca „bot nie widzi stanu" (z M91/A1).** Systematyczna
  inwentaryzacja pól `createGameState` vs `playerView` vs odczyty bota.
  Znalezione i naprawione **5 luk**:
  - widok: `preventDamageThisTurn`, `damageShields`, `regenerationShields`,
    `cantBeRegeneratedThisTurn` (wszystko publiczne — FoW nienaruszone);
  - widok: **`types` permanentu na polu bitwy** — linia typów widnieje na karcie,
    a widok jej NIE niósł; bez niej filtry typu („artifact creatures") były
    nierozpoznawalne po stronie kontrolera (face-down nadal ukryty, CR 708.2);
  - bot: czar obrażeniowy w cel z pełną prewencją/tarczą oraz
    `destroy_permanent` w cel z tarczą regeneracji to zagrania jałowe (−70
    i pominięcie premii); atakujący objęty prewencją nie ginie w bloku →
    atak darmowy.
  - **Świadomie poza zakresem:** liczniki turowe (`spellsCastThisTurn`,
    `creatureDiedThisTurn`, `dealtDamageToOpponentThisTurn`,
    `cardsDrawnThisTurn`) — wpływają na triggery rozstrzygane przez engine,
    nie na wybór komendy.
  - Test: `test/bot-view-prevention-gaps.test.js` (13, w tym 5 strażników
    przed nadgorliwą karą).
  - **Wniosek metodyczny:** pełny benchmark NIE wykrywa takich błędów (karty
    z prewencją są rzadkie, różnica ginie w uśrednieniu) — potrzebny jest
    audyt kontraktu widok↔kontroler. Inwentaryzację warto powtarzać po każdym
    batchu wnoszącym nowe pole stanu.
- **Stan:** `npm test` **1588/0** (1575 → 1588, +13), build 50 modułów /
  **1637.7 kB**. Benchmark 12 seedów: heuristic **96.1% vs random**,
  **65.2% vs aggro** (bez zmian — karty z prewencją tylko w jednej talii);
  benchmark ukierunkowany na talie z Withstand (20 seedów): heuristic
  **69.8% vs aggro**, **97.3% vs random**. Progi `0.78 / 0.57` utrzymane.
- **Plan:** `docs/plans/PLAN_2026-08-14-m92-audyt-playerview-bot.md`.

- **Ostatnia aktualizacja:** 2026-08-14 (M91: uwagi z testów właściciela A–D)
- **PR sesji:** `arena/01a000df-mtg` (PR #52 — M90 + M91)
- **M91 A — Inspire Awe (dwa błędy heurystyki):**
  - A1: `state.preventCombatExceptEnchanted` NIE było w PlayerView, więc bot
    (kontroler dostaje widok, nie stan) nie mógł zauważyć, że jego atak zada
    0 obrażeń — wysyłał wszystkie stwory w prewencję i tapował je. Widok niesie
    flagę; heurystyka zeruje ocenę takiego ataku.
  - A2: globalny fog działa na OBIE strony — we własnej turze kasuje własny
    atak. Kara −80 w swojej turze, premia w turze przeciwnika skalowana mocą
    atakujących. PlayerView oznacza atakujących (`attacking`, informacja
    publiczna). Test: `test/bot-combat-prevention.test.js` (7).
- **M91 B — ptaszek pomijania dla czarów z opcjami:** panel rysował ptaszek
  tylko dla pojedynczych komend, więc Village Rites / Bone Splinters / czary
  modalne (jeden przycisk „Wybierz:") nie dało się wyciszyć z panelu. Przycisk
  grupy ma ptaszek wyciszający WSZYSTKIE warianty naraz.
  Test: `test/choice-group-ignore.test.js` (4).
- **M91 C — bot niszczył własny permanent (Shatter na własny Great Furnace):**
  scoring nie miał wyceny efektów usuwających, więc czar dostawał domyślne
  50 pkt niezależnie od tego, czyj jest cel. Reguła generyczna: własny
  permanent −90, przeciwnika +22 + wartość celu.
  Test: `test/bot-no-self-removal.test.js` (4).
- **M91 D — tryb czaru modalnego w logu (Ruinous Rampage):** zdarzenia
  `spell_cast`/`spell_resolved` niosą `modeName`; log i modal „Ruch
  przeciwnika" pokazują „— tryb: X". Test: `test/modal-spell-log.test.js` (4).
- **Stan:** `npm test` **1575/0** (1556 → 1575, +19), build 50 modułów /
  **1633.6 kB**. Benchmark 12 seedów po zmianach bota (A+C): heuristic
  **96.1% vs random** (przed: 95.8%), **65.2% vs aggro** (przed: 63.5%) —
  zmiany podniosły siłę gry; progi `0.78 / 0.57` utrzymane.
- **Plan:** `docs/plans/PLAN_2026-08-14-m91-uwagi-testow.md`.
  Handoff: `docs/setup/HANDOFF_2026-08-14-m90.md` (M90) + sekcja M91 niżej.

- **Ostatnia aktualizacja:** 2026-08-14 (M90: bugi z iPhone'a A–E + 2 crashe z benchmarku)
- **PR sesji:** `arena/01a000df-mtg`
- **M90 rozpoznanie:** handoff zakładał, że wszystkie fixy „M89 cd." przepadły
  z working tree poprzedniej sesji. Audyt `main` (10fe8b7) wykazał, że A
  (viewport `maximum-scale=1.0` + `overscroll-behavior: none`), C2
  (`token_created` w `BOT_MOVE_CARD_EVENTS`), D (ptaszek w `renderChoiceRequest`)
  i E (chump `perAttacker = -10`) SĄ w `main` wraz z testami — realnie otwarte
  były tylko **B** i **C1**.
- **M90 B — Forever Young → „Poddaj walkę" / `not_priority`:** `session.apply()`
  kasował bufor modala i `awaitingBotAck` PRZED `execute()`. Odrzucona komenda
  (priorytet miał bot wstrzymany pauzą) zostawiała gracza bez pauzy i bez
  „▶ Wznów grę bota" — w `legalCommands` zostawało samo `concede`. Fix: stan
  sesji zmienia wyłącznie UDANA komenda. Test: `test/session-bot-pausa.test.js`.
- **M90 C1 — brak okna na instant w odpowiedzi (Carrion Call), CR 117.3c/117.4:**
  `state.turn.passes` zerowany był tylko przy zmianie kroku i po rozstrzygnięciu
  stosu, nie po AKCJI. Sekwencja „człowiek pass → bot rzuca instant → bot pass"
  liczyła się jako pełna runda passów i czar rozstrzygał się, zanim gracz
  dostał priorytet. Fix: `accepted()` zeruje `passes` dla każdej komendy
  ≠ `pass_priority`. Test: `test/priority-after-action.test.js`.
- **M90 crash 1 (był w `main`) — „Ta karta nie ma drugiej strony (craft)",
  CR 707.8a:** `create_copy_token` (Cogwork Assembler) kopiował zdolności
  artefaktu wraz z craftem, ale nie deskryptor drugiej strony DFC (Lodestone
  Needle) — aktywacja craftu na tokenie rzucała wyjątkiem i przerywała partię.
  Fix: `effects.js` przekazuje `transformTo`, `tokens.js` przyjmuje je
  w kontrakcie tokenu. Test: `test/copy-token-dfc.test.js`.
- **M90 crash 2 (był w `main`) — „Nieprawidłowy cel obrażeń", CR 608.2b:**
  zdolność celowana (Ballista Wielder), której cel przestał być legalny w oknie
  odpowiedzi, po rewalidacji wykonywała efekty z PUSTĄ listą celów
  (`markDamage(undefined)`). Fix: `resolveActivatedAbilityEntry` fizzluje
  (`ability_resolved{fizzled:true}`). Test: `test/ability-fizzle-no-target.test.js`.
- **M90 bug D (wzmocnienie):** dotychczasowe testy ptaszka pomijania sprawdzały
  wyłącznie OBECNOŚĆ kodu (regexy na źródle). Dodane 3 testy funkcjonalne na
  harnessie DOM (`test/choice-request-ui.test.js`); weryfikacja mutacyjna
  potwierdziła, że łapią regresję.
- **Stan:** `npm test` **1556/0** (1544 → 1556, +12), build 50 modułów /
  **1627.5 kB**. Benchmark: pełna macierz na 12 seedach przechodzi BEZ
  przerwania (wcześniej crash) — heuristic **95.8% vs random**, **63.5% vs
  aggro**, aggro **92.0% vs random**; progi `0.78 / 0.57` utrzymane. Bot
  nietknięty. Żywy Tester: 5 partii do końca, zero odrzuceń.
- **Plan:** `docs/plans/PLAN_2026-08-14-m90-bugi-iphone.md`.
  Handoff: `docs/setup/HANDOFF_2026-08-14-m90.md`.

- **Ostatnia aktualizacja:** 2026-08-13 (M89: Curate modal + overlay badges + audyt testerem)
- **PR sesji:** `arena/019ffd38-mtg`
- **M89 A. Curate:** modal „Ruch przeciwnika" pokazuje teraz dobranie z `draw_cards`
  (Curate Surveil 2 + Draw 1, Phyrexian Rager, Evangel, Curiosity itd.).
  Root cause: `card_drawn` z `BOT_MOVE_NOISE` obejmowało wszystkie dobrania
  (włącznie z krokiem draw). Fix: pole `source: 'draw_step' | 'effect'` w
  evencie `card_drawn`, `BOT_MOVE_NOISE` pomija tylko `draw_step`,
  `BOT_MOVE_CARD_EVENTS` zawiera `card_drawn` (ilustracja dobranej karty).
  Pliki: `src/engine/effects.js` `drawPlayerCards(state, playerId, amount, source = 'effect')`,
  `src/engine/game-state.js` `draw_card` ustawia `source: 'draw_step'`,
  `src/table/session.js` `isCardDrawnNoise(e)`.
- **M89 B. nakładki na karcie:** wiersze (np. „Choroba" + aury) nachodziły na siebie.
  Fix CSS: `.ovl-badges { flex-wrap: wrap; max-height: 100%; }` +
  `.ovl-badge { line-height: 1.1; }`. `buildStateOverlay` wyeksportowany
  (testowalny headless). Testy: `test/overlay-badges.test.js` (3 testy jsdom).
- **M89 C. Stomping Slabs modal „ułóż karty":** w transkrypcie modala
  były tylko pozycje (1, 2, 3...). Root cause: `cardIds` w `pendingRevealOrder`
  to objectIds (spójne z resztą engine i testami), ale commandLabel mapował
  pozycje zamiast czytać nazwy. Fix: pole `revealedNames` (cardIds kart)
  w pendingRevealOrder, commandLabel mapuje objectId→cardId i czyta
  `session.nameOf`. Pliki: `src/engine/effects.js`, `src/table/render.js`,
  `src/engine/game-state.js` (playerView). Testy: `test/stomping-slabs-order.test.js` (RED→GREEN).
- **Audyt testerem:** trwający (15+ błędów z transkryptów). Naprawione
  po 5 błędach: Stomping Slabs modal (powyżej). Pozostałe zidentyfikowane:
  Epic Experiment „zakończ" (tester nie klika), Sweet Oblivion Escape modal
  (32 warianty za dużo), Brute Force modal podczas ruchu gracza (false positive
  w streamAutoEvents), tester atakował tylko Rustwing Falcon.
- **M88 PR #51:** naprawa transkryptu modala Żywego Testera (extractBotMoves,
  extractModalChoice, extractTileText w `tools/table-tester/extract.mjs`).
  Zamknięty PR; 1524/0, build 50 modułów / 1618.8 kB.
- **Stan:** `npm test` **1531/0** (po M89 fixes: 1524 → 1531, +7 testów:
  curate-modal ×3, overlay-badges ×3, stomping-slabs-order ×1), build
  50 modułów / 1621.1 kB, bot nietknięty (B0 niewymagany).

- **Ostatnia aktualizacja:** 2026-08-13 (audyt PR #47 + CR 502.2 day/night)
- **PR sesji:** `arena/019ffc52-mtg`
- **Audyt #47:** Batch 32 zgodny z Oracle; 3 twarde błędy naprawione (day/night, Soulbright {R}×8, onNthResolve).
- **Testy:** 1485/0, build 50 / 1602.5 kB, bot-benchmark 7/0 (bez pełnego B0).
- **Kolejka:** Batch 33 czeka na listę właściciela; Jwari/Awaken „you may" nadal deterministyczne.

- **Ostatnia aktualizacja:** 2026-08-13 (Batch 32 + brązowa odznaka ×5 CR)
- **Brąz 2:** flashback exile ze stosu; search minMV; Soulbright you may; Ballista ifDealtDamage; tarcza ≠ damagedThisTurn.
- **PR sesji:** `arena/019ffb43-mtg` (#47)
- **Batch 32:** 10 kart (Dream Twist flashback, Voice shield, Constellation, Fathom damaged-this-turn, Fierce Empath search, Soulbright 3rd resolve, Rustvine oil, Arynx Saddle, Nature's Embrace creature_or_land, Ballista daybound). Testy 1464/0 bez bot-benchmark (bot nietknięty). Build 50 / 1599.5 kB.
- **Faza:** Etapy 1–4 zamknięte na katalogu syntetycznym; M5–M7 wdrożone — przez
  stołowy HTML można rozegrać pełną partię człowiek–bot. **M6: zdolności aktywowane
  i tworzenie tokenów wpięte w engine. M7: nowy układ stołu** — karty jako kolorowe
  kafelki (syntetyczna twarz), stół na całą szerokość (wróg u góry, Ty na dole, ręka
  na samym dole), strefy w modalnym inspektorze, podgląd hover i klik, rozwijane panele.
  **M8–M17: osiem batchy REALNYCH kart w katalogu** (28 kart: Highland Game, Kappa
  Tech-Wrecker, Segmented Krotiq, Grizzled Outcasts, Entrancing Lyre, Zoraline,
  Rupture Spire, Leafcrown Dryad, Prismari Campus, Gloomfang Mauler, Serra's
  Embrace, Cloak of the Bat, Midnight Guard, Holdout Settlement, Skyclave
  Geopede, Soulmender, Illusory Demon, Jyoti, Moag Ancient) — blokada braku
  prawdziwego katalogu (Etap 2/3)
  częściowo zniesiona. Batch 4 wniósł do engine: **menace, haste, backup
  (decyzja `resolve_backup`), typecycling, czyste aury i equipment** (załączniki
  uogólnione z bestow); Batch 5: **triggery wejścia (untap/landfall),
  trample, koszt „tap stwora"**; Batch 6: **trigger „when you cast a spell",
  land creatures, trigger beginning_of_combat**; Batch 7 (5 kart):
  **liczniki -1/-1, granty zdolności do końca tury, LKI, persist,
  reanimacja ze zmianą kontroli, opóźnione triggery, tokeny nie-stwory,
  koszt „Sacrifice this", atomowe koszty, zmiana typu podstawowego landa**;
  Batch 8: **dobieranie i odrzucanie kart z efektów, licznik dobrań w turze,
  zdolności statyczne warunkowe, trigger odejścia permanentów, scry poza
  własną turą, fateful hour, zwykły morph**. **B0: harness pomiarowy bota wdrożony**
  — każda kolejna zmiana bota (B1+) jest mierzona macierzą win-rate z
  `tools/benchmark.mjs` ([docs/BOT_ROADMAP.md](BOT_ROADMAP.md)).
  **M12: ilustracje realnych kart na stole** — kafle renderują druk ze Scryfalla,
  syntetyczna twarz jest fallbackiem.
- **Kod produkcyjny:** headless engine (`src/engine/`, `src/protocol/`), warstwa kart
  (`src/cards/`) z syntetycznym katalogiem i taliami w `decks/`, bot heurystyczny
  (`src/controllers/`), stół (`src/table/`) publikowany przez Pages
- **M19/B4 (2026-08-03):** dodano jawne, walidowane wagi rodzin decyzji bota
  (`mana=1.1`, `permanent=0.9`, pozostałe `1.0`) oraz offline'owy,
  deterministyczny hill-climbing (`tools/tune-bot.mjs`) na harnessie B0.
  Pełna macierz 13 talii / 50 seedów / 27 300 meczów / 0 niedokończonych:
  heuristic **77.9% vs random**, **64.0% vs aggro**, aggro **75.5% vs random**;
  próbka regresji: **75.1% / 67.6%**, progi `0.60 / 0.52`.
- **M20 (2026-08-03):** kreator talii w UI zgodny z ADR 0012: pokazuje wyłącznie
  karty `supported`, filtruje po Planie, secie i nazwie, liczy kopie, kolory,
  landy i pozostałe karty, waliduje limit 4 kopii (Basic Land bez limitu),
  generuje wspólny tekst `# nazwa talii` / `Nx Karta` oraz oferuje kopiowanie
  i pobranie pliku `.txt`. Stan kreatora nie trafia do `localStorage`.
  Po zmianie: **475/475** testów, artefakt **41 modułów / 396.5 kB**.
- **M21 (2026-08-03):** dodano modalny adapter `ChoiceRequest` w UI. Warianty
  celu, wartości X oraz scry/backup są grupowane z `legalCommands`, a po wyborze
  UI waliduje odpowiedź przez protokół i wysyła wybraną legalną komendę. Engine
  zachowuje dotychczasową enumerację komend jako świadome ograniczenie przejściowe.
  Po zmianie: **477/477** testów, artefakt **42 moduły / 401.8 kB**.
- **M22 / Batch 9 (2026-08-03):** dodano Kor Cartographer, Scorpion Sentinel,
  Dunland Crebain, Dragonbroods' Relic i Secluded Steppe. Generyczne mechaniki
  obejmują wyszukanie Plains na pole bitwy, statyczny warunek liczby landów,
  amass Orcs/Army, sorcery-speed sacrifice z tokenem ETB damage oraz zwykły
  cycling dobierający kartę. Wszystkie karty są `supported`, mają dane Scryfalla,
  artId i testy legalnych/nielegalnych interakcji. Pełna macierz B0 po Batchu 9:
  14 talii / 31 500 meczów / 0 niedokończonych — heuristic **78.9% vs random**,
  **65.4% vs aggro**, aggro **76.6% vs random**; próbka regresji **76.3% / 68.6%**,
  progi `0.61 / 0.53`. Stan: **498/498** testów, artefakt **42 moduły / 416.1 kB**.
- **M23 / Batch 10 (2026-08-03):** dodano Goblin Piker, Angel of the Dawn,
  Armored Skaab, Tumbleweed Rising i Dawntreader Elk. Generyczne mechaniki:
  globalny buff stworów do cleanup, mill, plot, dynamiczny token X/X oraz
  sacrifice/search Basic Land. Korekta combat zachowuje status „blocked" po
  opuszczeniu bitwy przez blockera; tylko trample może wtedy zadać nadmiar. Wszystkie karty mają dane Scryfalla, artId,
  testy i talię `decks/real-batch10.txt`. Pełna macierz 15 talii / 36 000 meczów
  / 0 niedokończonych: heuristic **81.0% vs random**, **64.3% vs aggro**,
  aggro **78.7% vs random**; próbka **79.1% / 67.2%**, progi `0.64 / 0.53`.
  Stan: **517/517** testów, artefakt **42 moduły / 429.3 kB**.
- **M24 / Batch 11 (2026-08-03):** dodano Underdark Explorer (CLB),
  Angel's Feather (M11), Release the Ants (MOR), Porcelain Legionnaire (NPH),
  Curate (BRO) i Canonized in Blood (LCI) — sześć kart z listy właściciela
  (odstępstwo od „5 na batch"). **Pełne mechaniki w 100% (decyzja właściciela
  2026-08-03):** **inicjatywa** (znacznik + przejmowanie przez combat damage)
  z **loch Undercity w całości wykonywanym** — wszystkie 9 pokoi działa
  (Secret Entrance szuka landa, Forge liczniki, Lost Well scry, Trap! utrata
  życia, Arena goad, Stash Treasure, Archives dobranie, Catacombs Skeleton,
  Throne stwór z 3× +1/+1 i hexproof), a **karta „The Undercity" jest na
  stole z zaznaczeniem pokoju** (druk ze Scryfalla jak w legacy — ID 990006);
  trigger **„a player casts a white spell"**, **clash** z realnym wyborem
  wierzch/spód obu graczy, **phyrexian mana z wyborem gracza** (mana albo
  2 życia — warianty cast_permanent), **first strike** (dwa przebiegi),
  **surveil** z wyborem kart do grobu ORAZ kolejności reszty, **descended**
  + trigger end step, a **wybory celów pokoi lochu (Forge/Arena/Trap!/Throne)
  są decyzjami GRACZA** (resolve_room_target z listą legalnych celów; boty
  odpowiadają deterministycznie). Wszystkie karty mają dane Scryfalla, artId
  (Curate = 302BRO po secie), testy i talię `decks/real-batch11.txt`.
  Pełna macierz 16 talii / 40 800 meczów / 0 niedokończonych: heuristic
  **83.1% vs random**, **62.3% vs aggro**, aggro **81.2% vs random**; próbka
  **81.3% / 65.9%**, progi `0.66 / 0.53` bez zmian. Stan: **563/563** testów,
  artefakt **42 moduły / 510.2 kB**.
- **M25 (2026-08-03, tylko UX):** nowy panel stołu **„Przebieg tur (dla AI)"**
  obok „Rozumowania bota" — co robili **Czarodziejka** (gracz) i
  **Nieprzyjaciel** (bot) w poprzedniej pełnej turze albo w dwóch ostatnich,
  jako gotowy blok tekstu dla modelu AI (fabularny opis partii). Przełącznik
  1/2 ostatnich tur, guzik „Kopiuj do schowka" (Clipboard API z fallbackiem
  dla `file://`), licznik ukończonych tur. Tura „pełna" = zakończona
  (`turn_started` następnej); bieżąca dołącza po końcu partii. Engine i
  protokół nietknięte. Testy `test/table-turn-history.test.js`; 551/551
  zielonych, artefakt **42 moduły / 472.8 kB**.
- **M26 (2026-08-03, tylko UX, zgłoszenie właściciela z iPada):** poprawka
  gestów dotyku — wspólny kontrakt `installTapGesture` w nowym module
  `src/table/gestures.js` (kaflе stołu i warstwa pełnego ekranu). **Double-tap
  znów otwiera pełny ekran:** iOS wysyła syntetyczny `click` po każdym
  tapnięciu i stary kod kończył zawsze „pojedynczym" (menu kontekstowe
  przykrywało pełny ekran); teraz pojedynczy klik na dotyku jest odroczony
  o okno 300 ms (double-tap może go anulować), a `click` po double-tapie jest
  tłumiony. **Pełny ekran zamyka ten sam gest:** tap albo double-tap w
  dowolnym miejscu (także na karcie), z odpryskiem gestu otwierającego
  ignorowanym (350 ms). Mysz bez zmian (click/dblclick). Testy
  `test/table-touch-gestures.test.js` (8, `mock.timers`); engine i boty
  nietknięte — bez pomiaru benchmarku. Stan: **571/571** testów, artefakt
  **43 moduły / 513.3 kB**.
- **M27 / Batch 12 (2026-08-03):** dodano Grave Exchange (AVR), Hysterical
  Blindness (ISD), Barkform Harvester (BLB), Undead Servant (ORI — druk
  Origins wg słownika kolekcji) i Rage of Purphoros (THS). Wszystkie mają
  pełne mechaniki (ADR 0010 §2a), artId ze słownika, talię
  `decks/real-batch12.txt` i testy. Nowe generyczne mechaniki: **czary
  wielocelowe** (Grave Exchange — iloczyn kartezjański celów w legalSpellCasts,
  efekty mapowane na cele po `targetIndex`, CR 608.2b), **cel „player"**,
  **cel „creature/card in your graveyard"**, **powrót stwora-karty z grobu do
  ręki**, **„target player sacrifices a creature of their choice"** — realna,
  blokująca decyzja `resolve_sacrifice_choice` (jak scry/surveil; boty
  odpowiadają deterministycznie — najsłabszy stwór), **globalny modyfikator
  stworów przeciwnika do końca tury** (Hysterical Blindness: -4/-0),
  **położenie karty z grobu na spód biblioteki** (Barkform) oraz **tokeny
  za liczbę kart o danej nazwie w grobie** (Undead Servant). Przy okazji
  naprawione dwa generyczne błędy odsłonięte przez nowe karty: (1) scry jako
  OSTATNI efekt czaru nie dokańczał czaru po `resolve_scry` (Rage of Purphoros
  zostawał na stosie z `pendingSpell` na zawsze — `pendingScry` nie wołało
  `finishPendingSpell`, jak robi to `pendingSurveil`); (2) ujemna moc (po
  -4/-0) próbowała zadać ujemne obrażenia combat — teraz moc ≤ 0 zadaje
  0 obrażeń (CR 510.1). Pełna macierz B0 (17 talii, 50 seedów, 45 900 meczów,
  0 niedokończonych): heuristic **84.2% vs random**, **62.3% vs aggro**,
  aggro **82.2% vs random**; próbka regresji **82.5% / 66.7%**, progi
  `0.66 / 0.53` bez zmian (wartości tylko w górę). Stan: **585/585** testów,
  artefakt **43 moduły / 530.2 kB**.
- **M28 / Batch 13 (2026-08-03):** dodano Scorned Villager (DKA — transform
  DFC na Moonscarred Werewolf, zdolność many {T}: Add {G} + trigger upkeep
  „if no spells were cast last turn"), Curse of the Pierced Heart (ISD — AURA
  **„Enchant player"**: zaczarowany gracz wybierany przy rzucaniu, upkeep
  zaczarowanego gracza → 1 obrażeń), Emissary Escort (EOE — statyczne
  **+X/+0**, X = największa mana value wśród INNYCH artefaktów kontrolera,
  CR 604.3), Snarling Wolf (VOW — aktywowane {1}{G}: +2/+2, **„activate only
  once each turn"**) i Negate (M20 — **counter target noncreature spell**,
  cel czaru na stosie). Wszystkie mają pełne mechaniki (ADR 0010 §2a), artId
  ze słownika, talię `decks/real-batch13.txt` i testy. Nowe generyczne
  mechaniki w engine: **aura zaczarowująca gracza** (enchantPlayer — nowy
  typ aury obok bestow/czystej; rzucanie z wyborem gracza jako celu,
  `enchantedPlayerId` na permanencie, trigger w upkeep zaczarowanego gracza),
  **kontrczar z celem na stosie** (`noncreature_spell_on_stack` — czar
  niebędący stworem; `counter_spell` usuwa go bez rozstrzygania),
  **dynamiczna statyczna moc** (`greatest_mana_among_other_artifacts`),
  **limit aktywacji „once per turn"** (`oncePerTurn` w `createAbility`,
  tracking `state.abilityActivatedThisTurn`, reset co turę). Naprawiony
  przy okazji generyczny błąd odsłonięty przez nowe mechaniki: `castAuraSpell`
  walidował cel stworа DOPIERO PO wydaniu many i przeniesieniu na stos —
  teraz walidacja celu przed jakąkolwiek mutacją (CR 601.2h). Pełna macierz
  B0 (18 talii, 50 seedów, 51 300 meczów, 0 niedokończonych): heuristic
  **84.1% vs random**, **63.0% vs aggro**, aggro **81.0% vs random**; próbka
  regresji **81.8% / 66.5%**, progi `0.66 / 0.53` bez zmian (dodanie kart,
  nie zmiana bota). Stan: **599/599** testów, artefakt **43 moduły / 543.9 kB**.
- **M29 / Batch 14 (2026-08-04):** dodano Ainok Tracker (KTK), Spectral Prison
  (AVR), Raucous Carnival (DSK), Cloudbound Moogle (FIN), Insatiable Appetite
  (ELD), Stirring Bard (CLB), Hunter's Blowgun (LCI), Geological Appraiser
  (LCI), Lodestone Needle // Guidestone Compass (LCI — DFC transform) i Panic
  Spellbomb (SOM) — dziesięć kart z listy właściciela. Nowe generyczne mechaniki:
  **defender**, **flash**, **stun counters**, **deathtouch w walce**,
  **conditional keywords wg tury**, **warunkowe entersTapped** (life ≤13),
  **Food tokens** + blokująca decyzja `resolve_food_choice`,
  **discover** (blocking choice `resolve_discover_choice`),
  **explore** (blocking choice `resolve_explore_choice`),
  **craft transform**, **„can't block this turn"** (`cantBlock`),
  **trigger „aura host targeted by spell"**, **„if you cast it"** (`wasCast`),
  **grant keywords until end of turn** effect. Karty z `artId`: **67**.
  Stan: **633/633** testów, artefakt **43 moduły / 589.5 kB**.
- **M30 / Batch 15 (2026-08-04):** dodano Howl of the Night Pack (M10),
  Goblin Picker (DMU), Dragon Arch (APC), Trigon of Corruption (SOM),
  Aerith Rescue Mission (FIN), Esper Stormblade (ARB), Forge Devil (DKA),
  Shatter (SOM), Sweet Oblivion (THB) i Village Rites (M21) — dziesięć kart
  z listy właściciela. Nowe generyczne mechaniki w engine: **tokeny za liczbę
  landów danego podtypu** (`lands_with_subtype_you_control` — Howl: Wolf za
  każdy Forest), **koszt zdolności „Discard a card"** (`discardCard`), **koszt
  zdolności „Remove a counter"** (`removeCounter` — Trigon: charge counters),
  **„destroy target artifact"** (`destroy_permanent` + cel `artifact` — Shatter),
  **obrażenia w kontrolera** (`damage_to_controller` — Forge Devil), **mill
  celu-gracza** (Sweet Oblivion: „Target player mills four"), **warunek statyczny
  „inny wielokolorowy permanent"** (`controlsAnotherMulticolored` — Esper
  Stormblade), **dodatkowy koszt rzutu „sacrifice a creature"** (Village Rites),
  **modal „Choose one"** ze zmienną liczbą celów (Aerith Rescue Mission),
  **Escape** — rzucanie czaru z cmentarza za koszt escape + wygnanie kart
  (Sweet Oblivion; komenda `cast_escape`) oraz **„put a multicolored creature
  from hand onto battlefield"** z blokującą decyzją gracza (Dragon Arch;
  `resolve_hand_creature`). Hybrid mana `{W/B}{U}` redukuje się do bezbarwnej
  puli many (jak każda karta). Karty z `artId`: **77**. Talia
  `decks/real-batch15.txt`, testy `test/real-cards-batch15.test.js`.
  Stan: **663/663** testów, artefakt **43 moduły / 627.6 kB**.
- **M31 (2026-08-04):** **(A) Używalny kreator talii** — „Dodaj po 1 (z filtrów)"
  (`addFilteredToDeck`), „Wyczyść talię" (`clearDeck`), statystyki talii
  (`deckStatistics`: typy, kolory, krzywa many, śr. mana), podstawowe landy na
  górze listy (`sortBuilderCards`) oraz **biblioteka talii w IndexedDB**
  (`src/table/deck-store.js`): load/save/save-as/delete nazwanych talii +
  wczytywanie talii z `decks/` (`REPO_DECKS`). IndexedDB to cache — trwałość
  gwarantuje eksport do `decks/` (Safari/ITP). **(B) Filtr Plan** — kolumna „Plan /
  Setting" arkusza kolekcji (setting/plane) to plan karty; wyciągnięta przez
  `tools/fetch-plans.mjs` (kompaktowy eksport `&range=A:D`, set-aware dla duplikatów
  nazw jak Curate STX/BRO), wpisana do kart (`plan:`) i jako nowa kolumna Plan do
  `tools/collection-art-ids.csv`. Filtr Plan w kreatorze grupuje teraz realne karty
  (Tarkir, Innistrad, Wiedźmin, Dominaria…). Narzędzie służy do odświeżania. **(C) Bot B0 + strojenie** — pełna
  macierz (19 talii, 50 seedów, 63 000 meczów): heuristic **83.2% vs random,
  60.8% vs aggro** (Batch 14: 84.1/63.0 — lekki spadek: nowe karty dodają
  złożoność). Diagnoza **2 niedokończonych gier** (long-game: generatory tokenów
  → board-stall + boty tapują wszystkie landy co turę; gry kończą się taliczeniem
  ~tura 60) → `maxCommands` 3000→5000 (test dopuszcza); 0 niedokończonych.
  **Strojenie B4** (`tools/tune-bot.mjs`, 15 ewaluacji): żaden kandydat nie
  poprawił wag M19 (mana=1.1, permanent=0.9) — wagi pozostają optymalne przy 74
  kartach (bez zmiany bota → progi `0.66 / 0.53` bez zmian).
  Stan: **672/672** testów, artefakt **44 moduły / 643.0 kB**.
- **M32 (2026-08-04): zmiana paradygmatu talii na singleton.** Skasowano wszystkie
  dotychczasowe talie (real-batch1..15, synthetic-*) i wprowadzono nowe zasady:
  **max 1 kopia karty** (lądy podstawowe bez limitu) + **minimum 15 kart
  nielandowych** (`validateDeck`: `maxCopies=1`, `minNonland=15`; kreator talii
  też singleton). Stworzono **6 nowych talii hybrydowych** (3 kolor + 3 plan):
  `green`, `black`, `red` (mono-kolorowe) + `innistrad`, `azorius`, `wiedzmin`
  (planowe) — każda 15–16 nielandowych + lądy podstawowe dopasowane do kolorów;
  pokrywają 69 realnych kart nielandowych. Pełny benchmark B0 (6 talii, 50 seedów,
  6300 meczów, 0 niedokończonych): heuristic **95.0% vs random, 74.1% vs aggro**,
  aggro 91.9% vs random. Format singleton wyraźnie faworyzuje heurystykę (było
  83.2/60.8 na starych taliach) — wagi M19 pozostają silne, **re-strojenie
  odkładam** (opcjonalne). Progi regresji podniesione: **0.78 / 0.53**.
  Stan: **639/639** testów, artefakt **44 moduły / 638.0 kB**.
- **M33 / Batch 16 (2026-08-04): dziesięć realnych kart — Station, Saga,
  Metalcraft i prewencja obrażeń.** Dodano Alaborn Trooper (P02), Wedgelight
  Rammer (EOE), Jill, Shiva's Dominant // Shiva, Warden of Ice (FIN — DFC),
  Ethersworn Shieldmage (ARB — druk potwierdzony przez właściciela 2026-08-05),
  Fiery Fall (MM2), Plague Reaver (CMR), Greatsword of Tyr (CLB), Ramroller
  (ORI), Marut (CLB) i Stoic Rebuttal (SOM). Generyczne mechaniki: **Station**
  (koszt „Tap another creature\", liczniki charge, próg ≥ 9 → artefaktowy
  stwór ze słowami z deskryptora + `station_status_changed`), **Saga CR 714**
  (liczniki lore przy wejściu i po kroku dobierania, rozdziały, poświęcenie
  CR 714.4, efekty „cant be blocked\", „tap all lands\", „exile + return
  transformed\" — wspólny z DFC kod transformu), **Metalcraft** (`costReduction`
  na czarze przy ≥ 3 artefaktach), **„Counter target spell\"** (cel
  `spell_on_stack` — dowolny czar), **prewencja obrażeń „this turn\"** z
  filtrem typów (flash ETB, wygasanie w cleanup, łagodzi deathtouch),
  **śledzenie many ze Skarbów** (pula `treasureMana` + znacznik
  `manaFromTreasureSpent` — ETB Maruta liczy Skarby), **must-attack
  statyczne** (CR 508.1c), **warunek „controls another artifact\"**, trigger
  na sprzęcie **„equipped creature attacks\"**, koszt **„Discard N cards\" +
  sacrifice** z efektem z obiektu w grobie i **opóźniony trigger „next
  upkeep\"** (CR 603.7, ping-pong kontroli). Naprawione bugi core: podwójne
  dopisywanie zdarzeń triggerów do logu (`processTriggers`), przesłonięty
  parametr w koszcie `tapOtherCreature`, **nieaktualni kandydaci pokoju
  lochu** (`illegal_room_target` — oferta i walidacja celu spójne; decyzja
  bez legalnych celów gaśnie zamiast blokować grę; regresja:
  `test/room-targets-staleness.test.js`). Karty dopisane do talii singleton:
  azorius +5, black +2, red +2, wiedzmin +1 (liczniki lądów podstawowe
  podniesione) — zgodnie z nowym przepływem M32 (nie tworzymy talii
  batchowych). Bot bez zmian (bez re-strojenia): pełny B0 informacyjnie
  6300 meczów, 0 niedokończonych — heuristic **89.9% vs random, 74.1% vs
  aggro** (progi 0.78/0.53 bez zmian).
  Stan: **685/685** testów, artefakt **44 moduły / 693.3 kB**.
- **M34 / UX ze stołu Pages (2026-08-05): siedem tematów właściciela z rozgrywki
  na iPadzie — wszystkie zamknięte.** (1) Tyły kart dwustronnych nie trafiają
  już do talii/ręki jako backside (CR 711.4; `parseDeckText` podmienia nazwę
  tyłu na front, 4 tyły DFC mają status `limited`). (2+3) Rzucone zostało
  wymaganie ręcznego tapowania lądów: rzuty i zdolności są OFEROWANE wg many
  **produkowalnej** (pula + nietapnięte landy), a `spendMana` — jedyny punkt
  konsumpcji many — sam do-tapuje brakujące landy w deterministycznej
  kolejności (zwykłe landy przed land creatures; Skarby zostają ręczną
  decyzją; land-źródło z kosztem `{T}` nie płaci samo sobie, CR 601.2h).
  `tap_for_mana` zniknął z oferty (bot nie tapuje już „bez powodu"), komenda
  zostaje legalna w protokole. Zmiana przestrzeni komend botów = pełny B0:
  6300 meczów, 0 niedokończonych — heuristic **87.4% vs random, 72.1% vs
  aggro** (ruch ~2 p.p. to wzmocnienie random/aggro, nie regresja heurystyki;
  progi 0.78/0.53 bez zmian). (4) Log stołu pokrywa wszystkie typy zdarzeń
  pełnymi polskimi opisami (koniec surowych identyfikatorów i „(?)";
  `ability_activated` niesie `cardId` i `effectTypes`, mapa opisów efektów).
  (5) Mirror match dozwolony — ta sama talia dla gracza i bota. (6) Pauza po
  każdym istotnym zagraniu bota (rzut, ląd, zdolność, zmiana strefy) z
  wznowieniem na klik „Rozumiem"; rozjazd `runBot`/auto-pass zastąpiony
  jedną pętlą `advance()` — fingerprint rozgrywki z pauzami == bez pauz;
  rozstrzygnięcia stosu przy auto-passie trafiają teraz do logu i przebiegu
  tur. (7) Pełnoekranowa ilustracja karuzeluje kartami strefy swipem ←/→
  (plus strzałki/Esc na desktopie, pozycja „2 / 7"); warstwa swipe
  rejestrowana przed tap — szybkie swipe'y nie zamykają podglądu.
  Stan: **699/699** testów, artefakt **44 moduły / 713.7 kB**.
- **M35 / Batch 17 — DOKOŃCZENIE (2026-08-05):** PR #26 (scalony) wniósł do
  engine'u mechaniki Batchu 17 (infect, cleave, indestructible, animacja lądu,
  `any_creature_dies`, `draw_cards` both players) i pliki Scryfall dla 10 kart,
  **ale bez definicji kart, testów, dopisania do talii i benchmarku** — liczba
  `supported` utknęła na 90. Ta sesja **dokończyła** batch: 10 kart zdefiniowanych
  w `card-data.js` (Maritime Guard, Carrion Call, Garruk's Companion, Lunar
  Rejection, Selhoff Occultist, Reclusive Artificer, Captain's Call, Your Temple
  Is Under Attack, Crested Herdcaller, Silvanus's Invoker — wszystkie w kolekcji,
  z `artId` i planem), 3 tokeny (`token_insect`/`token_soldier`/`token_dinosaur`),
  testy `test/real-cards-batch17.test.js` (24) i `test/batch17-engine-fixes.test.js` (8).
  **Generyczne naprawy engine'u** odkryte przy kompletowaniu (wszystkie ADR 0002,
  uśpione do wejścia kart do talii): `freezeSpell` zachowuje deskryptor `cleave`;
  `resolveTopOfStack` rozstrzyga cleave wg `cleave.targets`; `legalTargetCandidates`
  obsługuje `creature_with_subtypes`; modalny `liveChosen` zachowuje cel-gracza;
  `destroy_permanent` respektuje `indestructible`; `EVENT_TYPES` ←
  `permanent_animated`/`poison_counters_added`; `createBattlefieldToken` propaguje
  kolory; `mill_cards` chroni karty przeglądane przez pending scry/surveil/clash/
  explore (trigger mill mógł psuć pending-decyzje); `addCounter` toleruje 0 jak
  `markDamage` (infect o mocy 0). Karty dopisane do talii singleton (green +4,
  innistrad +3, azorius +2, wiedzmin +1 + liczniki lądów). Pełna macierz B0
  (6 talii, 50 seedów, 6300 meczów, 0 niedokończonych): heuristic **88.0% vs
  random, 70.2% vs aggro**, aggro 93.0% vs random; próbka regresji 95.2% / 67.3%;
  progi **0.78 / 0.53** bez zmian. Stan: **731/731** testów, artefakt
  **44 moduły / 740,9 kB**.
- **M36 / Batch 18 (2026-08-06): dziesięć realnych kart z listy właściciela
  2026-08-05, PR #29** — Ainok Artillerist (reach warunkowy licznikiem),
  Kin-Tree Nurturer (**endure**), Gorger Wurm (**devour**), Bone Splinters
  (koszt sacrifice + destroy), Brute Force (+3/+3), Forever Young (karty z
  grobu na wierzch biblioteki + draw), Trostani Discordant (hymn „other",
  ETB 2× Soldier lifelink, end step „kontrola do właścicieli" — `ownerId`,
  CR 108.3), Fear of Burning Alive (ETB 4 dmg przeciwnikom + **delirium**),
  Jeskai Windscout (**prowess**), Hobble (aura ograniczająca atak/blok).
  Wszystkie `supported` w 100% mechaniki z Oracle; dane Scryfall pobrane
  PRZED kodowaniem (ADR 0010 §2a). 50 testów w `test/real-cards-batch18.
  test.js` (legalny + nielegalny scenariusz każdej karty, sanity Scryfall
  z `fs.readFileSync`, interakcje, determinizm replay). Generycznie do
  engine'u: `ownerId` + `control_to_owners_all_creatures`, zakres hymnów
  (fix: `staticBonuses` nie buffuje już własnego źródła zdolności ze scope),
  warunek `hasCounter`, ograniczenia załączników cantAttack/cantBlock,
  **prowess**, **delirium** z wyborem celu i intervening-if, **devour** /
  **endure** (kolejki decyzji + auto-close), efekt `damage_each_opponent`,
  `graveyard_creatures_to_library_top_choice`. **Naprawa cz. 4a:** oferty
  decyzji w playerView to jeden łańcuch w kolejności zamykania execute() —
  dwie zakolejkowane decyzje naraz (scry + devour) wywracały wcześniej
  benchmark błędem `scry_unresolved`. Boty odpowiadają deterministycznie na
  5 nowych typów komend; pełny B0 (6 talii, 6300 meczów, 0 niedokończonych):
  heuristic **87.7% vs random, 68.2% vs aggro**, próbka 88.7% / 71.4% —
  próg vs aggro podniesiony **0.53 → 0.56**, vs random 0.78 bez zmian.
  Karty dopisane do talii singleton (green +1, black +3, red +2, azorius
  +2, innistrad +2); UI: polskie etykiety dla 9 komend decyzji (4 nowe +
  5 drive-by). Ograniczenia jawne: brak prawa legend (pre-istniejące,
  dotyczy też Trostani) i jednoprzebiegowe triggery (obrażenia ETB Fear nie
  odpalają jego delirium). Znane pre-istniejące uszkodzenie: uszkodzony
  JSON w scryfall-dunland-crebain.json. Stan: **781/781** testów, artefakt
  **47 modułów / 819,9 kB**.
- **M37 / naprawa ograniczeń silnika + poprawki UX A–E z testowania
  (2026-08-06, PR #29)** — na życzenie właściciela naprawione WSZYSTKIE
  ograniczenia jawne z wpisu M36: (1) **prawo legend CR 704.5j** — state-based
  skan duplikatów legendarnych kontroler wybiera blokującą decyzją
  `resolve_legend_choice{keepId}`, którą permanent zatrzymać (reszta do grobów);
  (2) **wieloprzebiegowe triggery CR 603.2** — `processTriggers` z kolejką FIFO
  zdarzeń (cap 512) reskanuje agregat po rozstrzygnięciu każdego triggera, więc
  obrażenia ETB Fear odpalają jego delirium; (3) uszkodzony
  `scryfall-dunland-crebain.json` odświeżony (jedyny wadliwy ze 105 plików —
  zwalidowane wszystkie). Przy okazji naprawione dwa crashe benchmarku:
  `pendingBackups` przejmuje priorytet decydenta (`restorePriorityTo`, seed
  2027) i centralne planowanie blokujących decyzji w `accepted()` — priorytet
  zawsze u gracza z pierwszą decyzją w kolejności bramek execute (seed 1020,
  regresja w real-cards-batch18). Poprawki UX artefaktu A–E: **A** double-tap
  na iOS — handler `dblclick` respektuje `ignoreClick`, pełny ekran ignoruje
  stuknięcia przez 350 ms po otwarciu, tła modali chronione `MODAL_OPEN_GUARD_MS`
  = 450 (koniec „mrugnięcia" otwórz-zamknij); **B** modal „Ruch przeciwnika"
  pokazuje ilustracje lądów (`land_played` w `BOT_MOVE_CARD_EVENTS`); **C**
  nazwy kart na stosie klikalne → pełnoekranowy podgląd tekstu; **D** pełny
  ekran z karty cmentarza renderuje się NAD modalem (z-index 2600/2601);
  **E** flow rzucania z wyborem gracza: sekwencyjny **kreator płatności many**
  (`src/table/mana-wizard.js` — przy ≥2 wariantach źródła tapowane PO JEDNYM
  „tapnij x/y/z" z doliczaniem do sumy, solver jednoznaczności
  `countPaymentVariants`, Anuluj, rewalidacja przed rzutem; jednoznaczny wybór
  zostaje auto-tapem M34) i sekwencyjny **wizard scry/surveil** (najpierw
  przeglądnięte karty, potem decyzja dla KAŻDEJ karty osobno grób/wierzch —
  bez listy wszystkich kombinacji; protokół silnika bez zmian, FINALNA komenda
  budowana po krokach). Log gry: polskie etykiety zdarzeń Batchu 18 (devour/
  endure/delirium/wierzch z grobu). Nowa zasada procesowa w AGENTS.md: każde
  zadanie = rozpoznanie + mini-roadmapa (`docs/plans/PLAN_<data>-<slug>.md`)
  jako PIERWSZY commit PR przed kodowaniem; nowa sesja obowiązkowo sprawdza
  ostatni PR i podejmuje niedokończone zadanie w miejscu odhaczenia. Testy:
  legend-rule (10), table-mana-wizard (12), +2 integracyjne mana-wizard,
  4 zamrożone seedy decyzji w table-session. Pełny B0 (6300 meczów, 0
  niedokończonych): heuristic **87.5% vs random, 67.7% vs aggro**, aggro 93.0%
  vs random; próbka regresji 88.7% / 72.6% — próg vs aggro podniesiony
  **0.56 → 0.57**, vs random 0.78 bez zmian. Stan: **820/820** testów,
  artefakt **48 modułów / 860,1 kB**.
- **M38 / Batch 19 — 10 kart (2026-08-06, PR #29)** — Illvoi Operative
  (trigger „drugi czar w turze"), Grounded (aura `losesKeywords`),
  Ruinous Rampage (sorcery modalny: dmg / pierwszy bezcelowy `exile_all`
  z filtrem MV), Tellah, Great Sage (legendary; progi WYDANEJ many 4+/8+
  na triggerze noncreature — pierwszy kontekst `manaSpent` na zdarzeniach
  rzutu), Etherium Sculptor (pierwszy statyczny modyfikator kosztu
  Z PERMANENTA, CR 601.2f — redukcja tylko generycznej z capem, jeden
  choke point `effectiveSpellManaCost`), Boros Challenger (**mentor** CR
  702.133 — 17. blokująca decyzja, cel liczony dynamicznie przy
  rozstrzygnięciu, intervening wygasza wpis), Pilgrim's Eye (ETB basic
  land do ręki), Dementia Bat (pierwszy discard NA CELU-graczu),
  Seer's Lantern (mana {C} + aktywowane scry 1), You're Confronted by
  Robbers (modalny instant; variableTargets z pustym podzbiorem). Fix
  `effectiveSpellManaCost` (guard na brak Metalcraft przy redukcji z
  permanenta). Talie singleton (azorius/green/black/red/innistrad/wiedzmin),
  4 seedy etykiet przelosowane hunterem po zmianie tasowania, polityka
  session-bot-pausa z fallbackiem na obowiązkowy krok. Boty wybierają cel
  mentora deterministycznie; **kreator many płaci koszt efektywny**
  (effectiveGeneric z pełnego stanu sesji). Pełny B0 (6300 meczów, 0
  niedokończonych): heuristic **87.3% vs random, 64.1% vs aggro** — progi
  0.78/0.57 bez zmian. Stan: **867/867** testów, artefakt
  **48 modułów / 889,2 kB**.
- **M39 / naprawa gestów dotyku na iPhonie (2026-08-06, PR #30)** — dwa
  zgłoszenia właściciela: (1) **„swipe = tap"** — `installTapGesture`
  (`src/table/gestures.js`) śledzi ruch palca (pasywne `touchstart`/
  `touchmove`): ruch > 10 px albo `touchcancel` (iOS przejmuje gest — scroll)
  oznaczają „to nie tap": kasują wiszący timer pojedynczego tapa i `lastTap`,
  a `touchend` swipa nie uzbraja timera ani nie liczy do lastTap (syntetyczne
  clicki po swipe tłumione); (2) **„double-tap nigdy nie działa"** — stan
  gestu (`lastTap`, `tapTimer`) wyniesiony z domknięcia per-element do
  modułowej mapy kluczowanej `stateKey` = objectId karty (`tile:${objectId}`
  w kaflach, `stack:${spell.id}` na stosie). `renderTableView` czyści strefy
  i odbudowuje kafle przy każdym rerenderze (tura bota = strumień), więc
  drugie tapnięcie trafiało na nowy węzeł z pustym stanem — teraz double-tap
  przeżywa podmianę węzła; timer single-tapa przed odpaleniem sprawdza
  `element.isConnected` (koniec „duchów tapnięć" po przebudowie). Do tego
  `touch-action: manipulation` na `.tile`, `.stack-item.clickable` i warstwie
  `.fullscreen` (wyłącza double-tap zoom iOS tam, gdzie działa gest; pinch
  zoom i dostępność bez zmian — twarde `user-scalable=no` zostaje decyzją
  właściciela), a `renderExile` przekazuje `onCardDoubleClick` (dwuklik
  z exile otwiera pełny ekran). Testy: 16 kontraktów gestów
  (`test/table-touch-gestures.test.js`) + regresja exile
  (`test/table-card-art.test.js`). Stan: **875/875** testów, artefakt
  **48 modułów / 893,5 kB**. Zadanie nie dotyka botów — B0 niewymagany.
- **M40 / rozszerzenie kreatora many E.3a (2026-08-06, PR #31)** — zamknięcie
  dwóch świadomych ograniczeń kreatora płatności many (M37) z handoffu
  („Co dalej"): **(B) tryby kosztu** — `paymentDescriptorOf` rozpoznaje
  `cast_cleave`, `cast_escape` i `cast_permanent` w wariantach `bestow`/`morph`,
  więc niejednoznaczna kolorowa płatność za te rzuty otwiera kreator (zamiast
  cichego auto-tapu M34). Całkowity koszt alternatywny to liczba z deskryptora
  (BEZ obniżek CR 601.2f — castCleave/castEscape/castAuraSpell z bestow nie
  redukują), wymagania kolorów z bazowego `MANA_COSTS[cardId]` (spójnie z
  `hasColorForObject`). Morph (CR 702.36) bezbarwny → puste wymagania. Escape
  czyta koszt z `session.state` (widok grobów nie niesie `spell.escape`), jak
  `effectiveGeneric`. **(A) źródła nie-lądowe** — kreator oferuje oprócz landów
  nietapnięte permanenty z aktywną zdolnością many (Apprentice Wizard,
  Seer's Lantern, Dragonbroods' Relic, Scorned Villager/Moonscarred Werewolf,
  token Treasure); gracz tapuje je jak landy, a kreator wysyła `activate_ability`
  (nie `tap_for_mana`). `manaSourcesOf` buduje połączoną listę z `legalCommands`
  (gwarancja legalności) + `abilityInfo` z pełnego stanu; każde źródło niesie
  NET zysk = produkcja − koszt aktywacji (Apprentice {U},{T}:+{C}{C}{C} → 2).
  `wizardProgress` liczy pokrycie kolorów ze źródeł TAPNIĘTYCH w sesji kreatora
  (`committed`) — manę płaci się TAPUJĄC źródło, nie samym jego kontrolowaniem
  (jak forestwalk); main.js prowadzi listę `committed`. Render pokazuje „+N"
  przy źródle o netGain ≠ 1. UWAGA (resztowe ograniczenie engine): statyczny
  check kolorów engine (`hasColorForObject`/`allControlledManaSources`, pula many
  bezbarwna) nadal liczy też źródła tapnięte — konieczne dla przepływu
  „tapuj-potem-rzuć" kreatora; auto-tap M34 może zatem opłacić pip koloru z
  generycznego źródła, gdy kolorowe nie jest pierwsze w kolejności. Kreator
  tego nie powiela (wymusza tapnięcie kolorowego źródła); naprawa auto-tapu
  (priorytetyzacja kolorowych źródeł w `spendMana`) — osobne zadanie. Naprawa poboczna (produkcyjna): `startGame`
  zamyka kreator — nowa gra resetuje wstrzymany rzut (deskryptor odnosił się do
  starej sesji). Kreator leży na ścieżce gracza (`main.js:play`); boty idą przez
  `session.apply` → **bez wpływu na benchmark B0, progi 0.78/0.57 bez zmian**.
  Testy: +12 w `test/table-mana-wizard.test.js` (tryby kosztu, `manaSourcesOf`
  z dorkami i netGain, `controlledManaSourcesOf`, dork tworzy wariant, render
  +N) + poprawka harnessu `test/table-ui.test.js` (`pickActionButton` prowadzi
  otwarty kreator — część A poszerza zbiór rzutów otwierających kreator).
  Stan: **887/887** testów, artefakt **48 modułów / 901,6 kB**. Roadmapa:
  `docs/plans/PLAN_2026-08-06-kreator-many-e3a.md`.
- **M41 / kolorowa pula many — MtG-correct (2026-08-06, PR #31)** — na wyraźną
  decyzję właściciela („zdecydowanie 1") naprawiono root cause nonsensu many:
  bezbarwną pulę (M2) zastąpiono KOLOROWĄ. `player.mana` zostaje liczbą (total),
  a równolegle `player.manaPool` śledzi jednostki many po profilu kolorów
  (`manaUnitKey`: `U`, `UR` dwubarwny, `WUBRG` dowolny, `` bezbarwna).
  **Castability (MtG, PRZED tapnięciem):** `canPayColoredCost` — pip(y) kolorowe
  dopasowalne do jednostek (kolorowa pula + NIETAPNIĘTE źródła) — do rzutu trzeba
  źródeł, których MOŻNA UŻYĆ, a nie zużytych. **Płatność:** `spendMana(amount,
  requirements)` konsumuje z puli po pipach, auto-tap tapuje kolorowopasujące
  źródła najpierw. **Produkcja:** `tapLandForMana`/`add_mana` produkują KOLOR
  źródła. Pełna poprawność dla dual-landów (U|R opłaca U lub R, nie G) i Skarbów.
  Kreator many czyta kolorową pulę (bandaż „committed" z M40 usunięty).
  **ADR 0015.** Poboczna naprawa: `drawPlayerCards` chroni karty pending
  scry/surveil/explore/clash (jak `mill_cards`) — pre-istniejący utajony błąd.
  `addMana` bez `colors` → default „dowolny kolor" (wygoda testów; realna gra
  zawsze podaje jawny `colors`). Bot rzuca mniej czarów (MtG: potrzeba
  nietapniętych kolorowych źródeł) — pełny B0 (6300 meczów, 0 niedokończonych):
  heuristic **86.8% vs random, 63.9% vs aggro**, aggro 93.4% vs random — progi
  **0.78/0.57** utrzymane. Roadmapa: `docs/plans/PLAN_2026-08-06-kolorowa-pula-many.md`.
  Stan: **894/894** testów, artefakt **48 modułów / 908,7 kB**.
- **M42 / Batch 20 — 10 kart (2026-08-06, PR #31)** — Chittering Rats (DST),
  Coralhelm Guide (BFZ), Rustwing Falcon (M19), Caravan Vigil (ISD), Gorehorn
  Minotaurs (MM2), Moonlit Meditation (EOE), Goldmeadow Nomad (ECL), Fear of
  Abduction (DSK), Monastery Flock (KTK), Death-Hood Cobra (2XM). Wszystkie
  `supported` w 100% mechaniki z Oracle. Nowe generyczne mechaniki: **cantBeBlocked**
  (Coralhelm — nowy znacznik nieblokowalności w combacie), **Morbid** (Caravan Vigil —
  creatureDiedThisTurn tracker), **Bloodthirst** (Gorehorn — dealtDamageToOpponentThisTurn
  tracker + liczniki ETB), **aktywacja z grobu** (Goldmeadow Nomad — fromGraveyard w
  legalActivatedAbilities + exileFromGraveyard), **banish+link** (Fear of Abduction —
  additionalCost.exileCreature na permanencie + exile_opponent_creature + return_banished_to_hand),
  **replacement effect + klonowanie** (Moonlit Meditation — nowy typ celu aury artifact_or_creature
  + replacement pierwszego tokenu w turze → kopie zaczarowanego permanentu + tracker
  moonlitUsedThisTurn), **opponent_hand_card_to_top** (Chittering Rats — deterministyczna),
  **findTriggerTarget type:'opponent'** (triggers.js). Karty dopisane do talii singleton
  (green +2, black +1, red +1, azorius +6). Pełny B0 (6300 meczów, 0 niedokończonych):
  heuristic **89.9% vs random, 66.1% vs aggro**, aggro 95.0% vs random — progi
  **0.78/0.57** utrzymane. 3 nowe talie tematyczne: **spellslinger** (U/R, prowess+czary), **graveyard**
  (B/G, cmentarz), **tokens** (W/G/U, generowanie tokenów+Moonlit Meditation).
  Naprawa root cause: klon Moonlit Meditation filtruje triggery transformacji
  (tokeny nie są DFC). Stan: **911/911** testów, artefakt **48 modułów / 933,4 kB**.

- **M43 / Batch 21 — 10 kart (2026-08-07, PR #32)** — Servant of the Scale
  (DTK), Gray Slaad (CLB), Ember Beast (GTC), Kor Sanctifiers (HOP),
  Irontread Crusher (AER), Skilled Animator (CMR), Withstand (GPT),
  Nightshade Harvester (CMR), True Conviction (SOM), Disa the Restless (M3C).
  Wszystkie `supported` w 100% mechaniki z Oracle; dane Scryfall pobrane
  PRZED kodowaniem (11 plików + token Tarmogoyf). Nowe generyczne mechaniki:
  **Adventure** (CR 715 — cast_adventure z ręki → exile → cast_adventure_creature
  z exile), **Kicker** (CR 702.33 — wariant `kicked` cast_permanent + wasKicked),
  **Crew/Vehicle** (CR 701.36 — tap dowolnej liczby stworów o łącznej mocy ≥ N),
  **double strike** (obrażenia w obu przebiegach combat) i **lifelink**
  (zysk życia od obrażeń), **tarcze prewencji** „prevent the next N damage"
  (Withstand — `state.damageShields`), **can't attack/block alone** (Ember
  Beast — walidacja i oferty spójne), **linked animation** „as long as this
  creature remains on the battlefield" (Skilled Animator — cofanie przy
  odejściu źródła w moveObjectDirectly), triggery `land_entered_under_opponent_control`
  (Nightshade), `card_put_into_graveyard_from_nonbattlefield` z filtrem podtypu
  i `any_combat_damage_to_player` (Disa) oraz **token Tarmogoyf** z dynamicznym
  P/T = liczba typów kart we wszystkich grobach (+1 do wytrzymałości).
  Naprawy root cause: `tryFire` przekazuje kontekst zdarzenia do efektów;
  `createGameObject`/`addObject` niosą kicker/adventure (łańcuch fieldów);
  oferta equipu wyklucza źródło (CR 702.6a — animowany sprzęt). Karty
  dopisane do talii singleton (green/black/red/azorius/graveyard/tokens;
  graveyard dostał Mountains pod Disę). Pełny B0 (9 talii, 50 seedów,
  13500 meczów, 0 niedokończonych): heuristic **90.2% vs random, 63.9% vs
  aggro**, aggro **93.2% vs random** — progi 0.78/0.57 bez zmian (dodanie
  kart, nie zmiana bota). Stan: **935/935** testów, artefakt
  **48 modułów / 985,5 kB**.

- **M44 / poprawki przed scaleniem PR #32 (2026-08-07, zgłoszenia właściciela):**
  **A** autosave partii w localStorage: wznowienie nie nadpisuje już zapisu
  świeżą grą (root cause: `startGame`→`autosave` klobrował replay PRZED
  `resumeReplayText`), a **bootstrap sam wznawia partię po odświeżeniu**
  (`resumeOrStart` — stan wraca do punktu po ostatnim ruchu; replay jest
  deterministyczny, bot deterministyczny, więc kontynuacja identyczna).
  **B** przycisk **„Tasuj talię"** obok „Rozpocznij partię" — podmienia
  seed na losowy (`crypto.getRandomValues`, fallback `Math.random`).
  **C** Goldmeadow Nomad — zdolność „z grobu" nie jest już oferowana ani
  aktywowalna na polu bitwy (root cause: `legalActivatedAbilities`/
  `activateAbility` ignorowały `fromGraveyard` dla obiektów na battlefield).
  **D** auto-pass bez fałszywych okien: `hasMeaningfulDecision` ufa
  WYŁĄCZNIE `legalCommands` engine — heurystyka „potencjału" (mana za
  nietapnięte landy BEZ kolorów) zatrzymywała grę w oknach z samym passem
  (np. biała karta w ręce przy samych górach); od M34/M41 oferty rzutów są
  kompletne (auto-tap + kolorowa walidacja), więc heurystyka była zbędna
  i szkodliwa. **D2** modal „Ruch przeciwnika" pokazuje DOKŁADNIE JEDNĄ
  ilustrację na kartę (duży skan ostatniego zagrania bez mini-kafla tej
  samej karty na liście — wcześniej ląd bota dublował się na dwa obrazy).
  **E** Porcelain Legionnaire — literówka w `imageUri` (uuid `4c63`→`4e63`
  wg pliku Scryfall) — karta znów ma grafikę ze Scryfalla. Testy: +6
  (Tasuj talię, autosave+wznowienie, świeży start, Nomad na polu bitwy,
  okna bez samych passów, jedna ilustracja w modalu). Stan: **941/941**
  testów, artefakt **48 modułów / 986,0 kB**. Bot nietknięty — B0 bez zmian
  (90.2% / 63.9% / 93.2%, progi 0.78/0.57).

- **M45 / Weryfikacja reguł MtG vs Comprehensive Rules (2026-08-07, challenge
  właściciela: „żadnych uproszczeń — traktuj Jawne Ograniczenia jako błędy").**
  Audyt 134 kart + engine znalazł i naprawił 6 tematów u root cause:
  **T1 kolorowe koszty zdolności/cykli/płatności triggerów** (CR 118.2/601.2f)
  — `cost.colors` w 14 definicjach (Boros Challenger {2}{R}{W}, Coralhelm,
  Snarling Wolf, Apprentice Wizard, Dementia Bat, Goldmeadow Nomad, Panic
  Spellbomb, Death-Hood Cobra, Dragonbroods' Relic, Canonized in Blood, Jill,
  Secluded Steppe, Fiery Fall), walidacja `canPayColoredCost` w ofercie
  i aktywacji, `spendMana` z pipami; opcjonalne płatności triggerów
  (`payMana`/`payColors`) są faktycznie WYDAWANE (Panic Spellbomb miał darmowe
  dobranie); **błąd kosztu: Dawntreader Elk {G}=1 (było 2)**.
  **T2 finality = „would die → exile" dla KAŻDEJ przyczyny** (CR 122.1b):
  destroy, sacrifice, koszty czarów, prawo legend (wcześniej tylko zgony SBA).
  **T3 triggery dies/leaves_battlefield** (CR 603.6c/700.4): dies odpala się
  przy poświęceniu i zniszczeniu efektem — root cause: handlery
  cast_spell/cleave/escape/adventure nie włączały zdarzeń zagnieżdżonych
  (koszty dodatkowe) do skanu triggerów; Fear of Abduction reaguje na
  `leaves_battlefield` (bounce/exile), nie tylko dies.
  **T4 wybory gracza przy odrzucaniu i „karta na wierzch"** (CR 701.18 „of
  their choice"): `resolve_discard_choice` (koszt — Goblin Picker/Plague
  Reaver, kontroler; efekt — Dementia Bat, cel; Evangel, kontroler;
  sekwencyjnie) i `resolve_hand_top_choice` (Chittering Rats — cel);
  aktywacja z kosztem-discard czeka (`performActivation`).
  **T5 Unstable Frontier** (CR 305.7): wybór podstawowego typu przez gracza
  (`resolve_land_type_choice`) + produkcja many z PODTYPÓW podstawowych
  (CR 305.6 — land jako Forest produkuje {G}, getSourceForObject czyta
  effectiveSubtypes).
  Usunięte limitationy 13 kart. Testy: **959/959** (18 nowych w
  `test/mtg-rules-fixes.test.js`). Pozostałe świadome luki (kolejne tematy):
  deterministyczne „you may" przy szukaniu w bibliotece (Kor Cartographer,
  Pilgrim's Eye, Dawntreader Elk, cykle z szukaniem, Caravan Vigil, Secret
  Entrance), Moonlit Meditation „you may" (replacement), Rupture Spire
  auto-płatność, deterministyczne cele triggerów bez wymogu (Forge Devil,
  Reclusive Artificer itd.), Entrancing Lyre X, Puppeteer Clique cel.
  Pełny B0 po zmianie botów (9 talii, 50 seedów, 13500 meczów, 0
  niedokończonych): heuristic **90.0% vs random, 63.8% vs aggro**, aggro
  **93.1% vs random** — progi 0.78/0.57 utrzymane.

- **M46 / Srebrna odznaka — weryfikacja reguł MtG cz. 2 (2026-08-07, Tematy
  6-10) + stały wskaźnik tury.** Kolejne uproszczenia „decyzja gracza →
  determinizm" naprawione u root cause:
  **T6 „You may search your library"** (CR 701.19b) — gracz wybiera KARTĘ
  albo rezygnuje (fail to find): nowa decyzja `resolve_search_choice` dla
  Kor Cartographer, Pilgrim's Eye, Dawntreader Elk, Caravan Vigil,
  typecycling (Fiery Fall, Cloudbound Moogle, Swampcycling) i Secret
  Entrance (loch); tasowanie po każdym przeszukaniu.
  **T7 Rupture Spire** — „zapłać {1} albo poświęć" to decyzja kontrolera
  (`resolve_pay_or_sacrifice`); wcześniej automatyczna płatność.
  **T8 opcjonalne płatności triggerów** („you may pay ... When you do ...")
  — decyzja gracza (`resolve_optional_pay_choice`): Panic Spellbomb {R},
  Zoraline {W}{B} i 2 życia (payColors dodane; wcześniej płatność celowanych
  triggerów była DARMOWA — Zoraline reanimowała bez kosztu!).
  **T9 Moonlit Meditation** — „you may instead create copies"
  (`resolve_moonlit_choice`); wcześniej automatycznie kopie.
  **T10 Entrancing Lyre** — {X} wybiera gracz (X ≥ moc celu, oferty
  X=1..mana z walidacją maxPowerX); wcześniej X = moc celu.
  **UI:** stały wskaźnik „Tura N, <gracz>, <faza>" w lewym górnym rogu
  (z-index poniżej fullscreenu — nie zasłania ilustracji kart).
  Testy: **967/967** (8 nowych); artefakt 48 modułów / 1025,4 kB.
  Pełny B0 (13500 meczów, 0 niedokończonych): heuristic **89.4% vs random,
  62.4% vs aggro**, aggro 92.8% vs random — progi 0.78/0.57 utrzymane.
  Pozostałe świadome luki:
  deterministyczne cele triggerów (Forge Devil, Reclusive Artificer,
  Puppeteer Clique itd. — wybór celu przez gracza), „you may" Moonlit przy
  triggerze Zoraline „you may pay" dla BOTA bez puli (zachowanie celowe),
  „activate only as a sorcery" Zoraline itd.

- **M47 / Złota odznaka — Tematy 11-15 (2026-08-07) + ikony many w UI.** Pięć
  RÓŻNYCH klas reguł MtG naprawionych u root cause:
  **T11 hexproof** (CR 702.11) — permanent przeciwnika z hexproof nie może być
  celem czarów, zdolności ani triggerów (wcześniej hexproof NIE DZIAŁAŁ —
  Throne of the Dead Three dawał keyword bez efektu); root fix: activateEquip
  nie przekazywał casterId do walidacji.
  **T12 choroba przywołania a {T}** (CR 302.6) — stwór bez haste nie aktywuje
  zdolności z {T} w turze wejścia (wcześniej Apprentice Wizard mógł tapnąć
  od razu); oferta i walidacja spójne.
  **T13 limit ręki 7** (CR 514.1) — cleanup odrzuca nadmiar decyzją gracza
  (purpose 'hand_size'), zanim tura przejdzie dalej (wcześniej brak limitu).
  **T14 pierwsza tura bez draw** (CR 103.7a) — startujący gracz pomija draw
  step w 1. turze (wcześniej dobierał).
  **T15 anihilacja liczników** (CR 122.3) — +1/+1 i -1/-1 na tym samym
  permanencie anihilują się w SBA (wcześniej liczone tylko jako delta).
  **UI:** ikony symboli many zamiast tekstu {U}/{B} — moduł `mana-icons.js`
  (span.ms z kolorami MtG, hybrydy, phyrexian), użyty w kreatorze many
  (intro/postęp/źródła) i etykietach akcji (koszty z MANA_COSTS); CSS w
  index.html; przyciski akcji przeszły na innerHTML (nazwy escape'owane).
  Testy: **974/974** (+8: T11-T15); artefakt 49 modułów / ~1035 kB.
  Pełny B0 (13500 meczów, 0 niedokończonych): heuristic **89.1% vs random,
  63.3% vs aggro**, aggro 92.7% vs random — progi 0.78/0.57 utrzymane.

- **M48 / Brylant — Tematy 16-20 (2026-08-07) + zgłoszenia UX A/B/C.** Pięć
  kolejnych, RÓŻNYCH klas reguł MtG:
  **T16 rozdział obrażeń w walce** (CR 510.1c) — wcześniej pełna siła trafiała
  KAŻDEGO blokera (5/5 vs dwa 3/3 = 5+5); teraz przydział po lethal
  (deathtouch = 1), nadmiar tylko z trample przechodzi na gracza.
  **T17 pula many** (CR 106.4) — opróżnia się na końcu każdego kroku/fazy
  (wcześniej trzymała do końca tury, także przez turę przeciwnika).
  **T18 tokeny** (CR 704.5d) — znikają poza polem bitwy (po triggerach dies).
  **T19 prawo legend** (CR 708.2) — face-down nie ma nazwy, nie wchodzi do
  grup duplikatów; działa po odsłonięciu.
  **T20 koszt obrotu morph/megamorph** (CR 702.37) — pipy kolorów: Monastery
  Flock {U}, Woolly Loxodon {5}{G}, Ainok Tracker {4}{R}, Segmented Krotiq
  {6}{G} (wcześniej sam bezbarwny generic).
  **UX A** etykieta obrotu face-down: morph vs megamorph z deskryptora
  obiektu (root cause: lookup w registry → fallback „megamorph").
  **UX B** etykiety akcji ZAWSZE z kosztem (ikony many): cast_spell/cleave/
  escape/adventure/adventure_creature/kicker, activate_ability (T/X/pipy),
  cycling/equip/ninjutsu, plot, flip morph.
  **UX C** własne face-down odsłaniane na pełnym ekranie (CR 708.2 —
  kontroler może patrzeć na swoje zakryte karty); cudze zostają zakryte.
  Testy: **983/983** (+9); artefakt 49 modułów / ~1040 kB. Pełny B0
  (13500 meczów, 0 niedokończonych): heuristic **89.1% vs random, 62.3% vs
  aggro**, aggro 93.0% vs random — progi 0.78/0.57 utrzymane.

Ten plik jest krótkim punktem wejścia dla właściciela, nowych współpracowników i agentów.
Powinien być aktualizowany po każdej istotnej zmianie zakresu, architektury lub etapu prac.

## Proces pracy

Gałąź `main` jest chroniona i każda zmiana wchodzi przez Pull Request: bez bezpośredniego pusha
i force pusha, z pustą bypass list, 0 wymaganymi approvals, obowiązkiem rozwiązania komentarzy
i scalaniem metodą `Squash and merge` po jawnej decyzji właściciela. Required status checks
włączymy dopiero po zbudowaniu stabilnego CI.

Praca agentska przebiega w modelu sesyjnym: **1 sesja = 1 gałąź (`arena/...`) = 1 PR**.
PR sesji żyje przez całą sesję — kolejne tematy dopisują mu osobne, zielone commity,
a opis jest aktualizowany kumulacyjnie. Scalenie lub zamknięcie PR kończy sesję;
nowa sesja startuje od aktualnego `main`. Szczegóły:
[workflow — praca z sesją agentską](WORKFLOW.md#praca-z-sesją-agentską-arena).

Projekt realizują agenci **Agent Arena** ([ADR 0013](decisions/0013-agent-arena-sessions-and-mandatory-handoff.md)):
scalenie PR kończy sesję kodowania (brak dalszych modyfikacji GitHuba), a nowa sesja
nie widzi stanu lokalnego poprzedniej — startuje z `main` i z tekstu pierwszego promptu.
Dlatego **obowiązkowym etapem zamknięcia sesji jest instrukcja przekazania**: blok tekstu
w czacie do wklejenia następnemu agentowi + trwały zapis w tym pliku i w
`docs/setup/HANDOFF_<data>.md`.

Szczegóły: [workflow](WORKFLOW.md), [polityka bezpieczeństwa](../SECURITY.md),
[ADR 0007](decisions/0007-protected-main-and-mandatory-pull-requests.md).

## Co już wiemy o istniejącej aplikacji

Właściciel wgrał do repozytorium `card_viewer_12_10_for_Github.html` — jeden plik,
9 257 linii, z wyciętymi sekretami. Aplikacja została uruchomiona i przeanalizowana.
Pełny opis: **[docs/AUDIT_LEGACY_APP.md](AUDIT_LEGACY_APP.md)**.

Najważniejsze ustalenia:

1. **Wirtualny Stół jest logicznie niezależny** — 30% kodu w dwóch blokach, sześć zależności
   od reszty aplikacji, jedno wywołanie w drugą stronę. Rozplątywanie nie jest potrzebne.
2. **Arkusz kolekcji nie zawiera danych reguł** — brak kosztu many, typów i P/T. To dlatego
   obecny prompt każe modelowi wyszukiwać statystyki kart w internecie.
3. **Stan gry jest mutowany z 105 miejsc** w handlerach UI, bez walidacji i warstwy komend.
4. **Fog of War nie istnieje** — ręka przeciwnika jest renderowana w całości, celowo.
5. **Brak determinizmu** — tasowanie przez `sort(() => Math.random() - 0.5)`, brak seeda.
6. **Kilka reguł MtG jest już poprawnie zakodowanych** (zmiana strefy czyści znaczniki,
   summoning sickness, znikanie tokenów) — to gotowa lista wymagań dla engine.

## Decyzje podjęte po audycie

| Decyzja | ADR |
|---|---|
| Czysty JavaScript (ESM) — język, testy i struktura katalogów | [0008](decisions/0008-plain-javascript-esm-no-build.md) (zastąpiona przez 0011) |
| Budujemy standalone Wirtualny Stół, nie adapter w starej aplikacji | [0009](decisions/0009-standalone-game-table-instead-of-extraction.md) |
| Dane reguł kart pobierane ze Scryfall przed kodowaniem, potem trzymane w repozytorium | [0010](decisions/0010-card-rules-data-in-repository.md) |
| Modularne źródła, jednoplikowy artefakt, dwa tryby uruchomienia | [0011](decisions/0011-modular-sources-single-file-artifact.md) |

Konsekwencja dla zakresu: repozytorium **nie utrzymuje** aplikacji kolekcjonerskiej,
mang, komiksów, teleturnieju ani rankingu modeli AI. Właściciel ma własną kopię z tymi funkcjami.

### Jak to będzie działać w praktyce

- **Właściciel nie instaluje ani nie buduje niczego.** Sklejaniem modułów w jeden plik
  zajmuje się CI przy każdej zmianie na `main`.
- **iPad:** wejście na adres GitHub Pages, ilustracje ze Scryfall.
- **Komputer:** pobrany plik HTML otwierany bezpośrednio, ilustracje z lokalnego `./img/`.
- **Reguły, talie i przebieg partii są w obu trybach identyczne** — różni je tylko warstwa obrazów.
- **Talie są plikami w repozytorium.** Świadomy koszt: nowej talii nie zbuduje się z iPada
  w trakcie grania.
- **Partie zapisują się jako seed i lista ruchów**, więc każdy błąd da się odtworzyć
  z małego pliku tekstowego.
- **Cała warstwa AI znika** — brak klucza API, brak listy modeli, brak wywołań LLM.

Ważne zastrzeżenie techniczne: Safari na iOS kasuje `localStorage` po siedmiu dniach bez
wejścia na stronę (polityka ITP Apple). Dlatego przeglądarka służy wyłącznie jako wygodny
cache, a trwałość zapewniają pliki w repozytorium i eksport zapisu partii.

## Ustalony kierunek

- Budujemy **core engine bez zakodowanych konkretnych kart**.
- Core zawiera pojęcia i procedury gry, a karty są osobnymi definicjami korzystającymi
  ze współdzielonych mechanik.
- Karty dodajemy pojedynczo lub małymi partiami wraz z testami i danymi reguł.
- Nie dążymy do obsługi wszystkich kart MtG.
- Pierwszym praktycznym celem jest rozgrywka z taliami zbudowanymi z około 20 obsługiwanych kart.
- Engine jest jedynym autorytetem stanu i legalności działań.
- Wirtualny Stół powstaje jako samodzielna aplikacja korzystająca z engine.
- Gra ma zapewniać widok gracza zgodny z Fog of War; kontroler nie dostaje ukrytych danych przeciwnika.
- Pierwszy przeciwnik jest algorytmiczny i deterministyczny. Agent LLM pozostaje opcjonalny.

Szczegóły i uzasadnienia: [rejestr decyzji](decisions/README.md).

## ~~⚠️ Wymaga działania właściciela~~ ✔ Wykonane

Właściciel wgrał workflow CI i publikacji oraz włączył GitHub Pages
(instrukcja: [docs/setup/URLOP_CHECKLISTA.md](setup/URLOP_CHECKLISTA.md)).
Oba workflow (`ci.yml`, `pages.yml`) przechodzą na `main`, więc artefakt
jednoplikowy publikuje się automatycznie po każdym scaleniu — testowanie
z iPhone'a/iPada działa.

## Najbliższe zadanie

**M1–M5 są zamknięte na katalogu syntetycznym: sandbox, zasoby, combat, warstwa danych,
bot heurystyczny i pierwsza pionowa ścieżka UI (gra człowiek–bot przez jeden plik HTML).**

Stan techniczny:

- M1: odtwarzalny headless sandbox — zamknięty, z formalnym testem pełnej ścieżki replay;
- M2: land drop, mana, creature permanent, koszt, tap/untap i summoning sickness — zamknięte;
- M3: combat syntetyczny w kontrakcie `legalCommands` (test własnościowy: każda oferowana
  komenda jest akceptowana), centralne state-based actions po każdej komendzie, spójny automat
  kroków — zamknięte; znane uproszczenia udokumentowane w `docs/ENGINE_MILESTONES.md`;
- M4: registry, statusy wsparcia, parser/writer tekstu talii, walidacja kopii, filtry
  i podsumowania — gotowe; **syntetyczny katalog testowy** (`src/cards/card-data.js`)
  z materializacją do obiektów gry i taliami wersjonowanymi w `decks/`; stos z czarami
  instant/sorcery, targetowaniem i pierwszymi efektami (damage/pump); bot heurystyczny
  ze śladem uzasadnień (`src/controllers/heuristic-bot.js`);
- M5: stół w jednym HTML (`src/table/`): sesja prowadzi partię człowiek–bot przez protokół
  (auto-ruchy bota, auto-przewijanie okien samego pasa, polski log zdarzeń); UI renderuje
  PlayerView, kliki wysyłają komendy, replay eksportuje się do pliku i importuje z walidacją;
  talie `decks/*.txt` wstrzykiwane do artefaktu przez build (ADR 0011/0012);
- artefakt jednoplikowy zawiera pełny stół: self-test w HTML uruchamia komendy przez
  `PlayerView`, a moduły źródeł są strzeżone przed cyklami importów i kolizjami nazw;
- pełna partia syntetyczna (talia z pliku → definicja → obiekt gry → symulacja → replay)
  kończy się rozstrzygnięciem w engine, także sterowana kliknięciami UI;
- UI kreatora talii — zrealizowane w M20 zgodnie z ADR 0012 (stan nietrwały,
  eksport tekstowy zamiast `localStorage`).

Rozszerzenie Etapu 5 (bez decyzji właściciela):

- inspektor grobów i menu biblioteki z nazwami z registry;
- moduł adresów ilustracji (`./img/` vs Scryfall) — Etap 0b;
- framework abilities (activated/triggered/static), tokeny i załączniki;
- podgląd karty z ilustracją, autosave (`localStorage`) i wznawianie partii
  (z zapisu pola oraz z autosave);
- **zdolności aktywowane wpięte w engine** (`activate_ability` w `legalCommands`/
  `execute`: koszt tap + efekt pump), wspólny interpreter efektów
  (`src/engine/effects.js`) dla czarów i zdolności, **tworzenie tokenów przez
  efekt `create_token`**; syntetyczne karty `syn-warboar` (zdolność {T}: +1/+1)
  i `syn-swarmsummon` (czar: 1/1 Goblin) + definicja tokenu; talia
  `decks/synthetic-abilities.txt`; log tłumaczy nowe zdarzenia na polski.
- **M7 (nowy układ stołu, praca tylko w warstwie UI):** karty jako kafelki
  wyglądające jak karty (syntetyczna kolorowa twarz: nazwa, koszt, typ, pole
  reguł, P/T) zamiast tekstowych chipów; stół na całą szerokość (pole bitwy wroga
  u góry, stos pośrodku, Twoje pole bitwy na dole, ręka na samym dole) z układem
  perspektywicznym lądów/stworów; pasek statusu i pasek graczy (życie/biblioteka);
  **strefy (groby/exile/biblioteka) w modalnym inspektorze** zamiast pionowej listy;
  **podgląd karty** — hover (desktop) i klik (menu kontekstowe / modal z pełną twarzą);
  rozwijane panele akcji/logu/zapisu. Menu kontekstowe filtruje dozwolone akcje (komendy)
  po kliknięciu karty, również z optymalizacją dla touch/mobile (nagłówek jako miniatura karty).
  Zachowane wszystkie dotychczasowe funkcje stołu; engine i protokół nietknięte.
- **M8 (pierwszy batch realnych kart, 2026-08-01):** Highland Game (KTK),
  Kappa Tech-Wrecker (NEO), Segmented Krotiq (DTK). Dane ze Scryfall (ADR 0010 §2a)
  w `docs/cards/scryfall-*.json`, definicje `supported` w `src/cards/card-data.js`
  (z polem `oracleText` i adresem ilustracji druku), talia `decks/real-batch1.txt`.
  Nowe mechaniki w engine (minimalny wymiar dla tych kart): **liczniki** (+1/+1
  i znaczniki jak deathtouch), **triggered abilities** (`dies`,
  `combat_damage_to_player`), **ninjutsu** (z ręki, zwrot nieblokowanego
  atakującego, wejście tapped/atakujące), **morph/megamorph** (zagranie 2/2
  twarzą w dół za {3}, obrót za koszt megamorph z +1/+1, FoW tożsamości).
  Nowe efekty w `applyEffect`: gain_life, add/remove_counter, exile_permanent,
  turn_face_up. Testy `test/real-cards-batch1.test.js`; fingerprint uwzględnia
  liczniki i face-down; log i render stołu obsługują nowe karty (face-down jako 2/2).
- **M9 (drugi batch realnych kart, 2026-08-01):** Grizzled Outcasts (ISD, transform DFC
  na Krallenhorde Wantons 7/7), Entrancing Lyre (THB, {X},{T} z blokadą odkręcania),
  Zoraline, Cosmos Caller (BLB, flying/vigilance, tribał nietoperzy, reanimacja z finality).
  Nowe mechaniki: **transform** (trigger upkeep wg liczby czarów poprzedniej tury),
  **artefakty jako permanenty**, **koszt {X}**, **blokada odkręcania** (`untapLockedBy`),
  **flying/vigilance** w combacie, **subtypy** i trigger `bat_attacks`, **opcjonalna
  płatność triggera** (mana/życie), **reanimacja z finality counterem** (śmierć → exile).
  Bot heurystyczny punktuje zdolności aktywowane (używa {X}). Talia `decks/real-batch2.txt`;
  testy `test/real-cards-batch2.test.js`; 227/227 zielonych.
- **M10 (trzeci batch realnych kart, 2026-08-01):** Rupture Spire (CON, land ETB
  tapped + obowiązkowe „sacrifice it unless you pay {1}" z auto-tapem innego landa),
  Leafcrown Dryad (THS, enchantment creature z PEŁNYM bestow {3}{G} — czar aury
  na stosie, załączenie (nie-stwór), odłączenie w stwora, specjalna reguła
  nielegalnego celu; załączniki wpisane w engine na zawsze), Prismari Campus
  (STX, land ETB tapped + {4},{T}: Scry 1). Nowe mechaniki: **entersTapped** i
  obowiązkowy trigger „płać albo poświęć", **linie typów (types)** na obiektach
  (predykat artefakt/enchantment Kap-py łapie enchantment creature), **reach** w
  combacie, **załączniki aury bestow** (buff +2/+2 i reach w efektywnych
  statystykach), **scry 1** z blokującą decyzją `resolve_scry` (FoW: przeciwnik
  widzi tylko fakt, nie treść). Przy okazji naprawa regresji: instalacja talii
  gubiła deskryptory (`types`/`entersTapped`/`bestow`) w prawdziwych partiach.
  Talia `decks/real-batch3.txt`; testy `test/real-cards-batch3.test.js`;
  benchmark B0 przemierzony; 279/279 zielonych.
- **M7c (UX po uwagach właściciela z iPada, 2026-08-01):** hover wyłączony na dotyku
  (tap → tylko menu kontekstowe, bez migającego podglądu); auto-pass okien bez realnej
  decyzji — sam pass, samo tapnięcie landów (chyba że po odkręceniu staje się wykonalne
  zagranie), puste deklaracje ataku/bloków i puste rozstrzygnięcie walki przewijają się
  same, więc tura bota i puste fazy nie wymagają klikania; **akcje w wysuwanym panelu**
  (szuflada z lewej na desktopie / bottom-sheet na mobile, przycisk FAB z licznikiem)
  zamiast przewijanej listy na dole strony. Testy `test/session-autopass.test.js`.
- **B0 (harness pomiarowy bota, 2026-08-01):** `tools/benchmark.mjs` mierzy macierz
  win-rate bot-vs-bot (`aggro`/`heuristic`/`random`) na wszystkich taliach
  `decks/*.txt`, na N seedach (domyślnie 50), z meczami na obu stronach stołu na
  tych samych rozdaniach; bot aggro przeniesiony do produkcyjnych kontrolerów
  (`src/controllers/aggro-bot.js`), `random` w benchmarku gra bez losowej
  kapitulacji. Test regresji `test/bot-benchmark.test.js` pilnuje progów win-rate
  na deterministycznej próbce. Od B0 każda zmiana bota jest mierzona tym harnessem
  (tabela w opisie PR). Roadmapa bota B0–B5 wraz z rozstrzygnięciami właściciela
  (max trudność, okienko rozumowania domyślnie zwinięte, warunek dla ML):
  [docs/BOT_ROADMAP.md](BOT_ROADMAP.md). Baseline (po Batchu 4, 9 talii):
  heuristic 67.4% vs random, 59.0% vs aggro, aggro 71.4% vs random
  (13 500 meczów, 0 niedokończonych).
- **M11 (czwarty batch realnych kart, 2026-08-01):** Gloomfang Mauler (DSK,
  menace + swampcycling {2}), Serra's Embrace (czysta aura: +2/+2, flying,
  vigilance), Cloak of the Bat (equipment: +1/+1, flying, haste). Nowe mechaniki:
  **menace**, **haste**, **backup 2** (blokująca decyzja `resolve_backup`),
  **typecycling** z ręki (odrzucenie → wyszukanie → reveal → tasowanie seedem),
  **załączniki uogólnione** (jedna warstwa dla bestow, czystych aur i equipmentu)
  oraz **wirtualne landy podstawowe** (`VIRTUAL_BASIC_LANDS`). Talia
  `decks/real-batch4.txt`; testy `test/real-cards-batch4.test.js`;
  313/313 zielonych.
- **M12 (ilustracje realnych kart na stole, 2026-08-02; tylko warstwa UI):**
  kafel karty z realnym drukiem renderuje obraz ze Scryfalla (`imageUri`
  przeskalowany do `normal`, `loading="lazy"`), a syntetyczna twarz zostaje
  **fallbackiem** — widocznym do czasu wczytania i na stałe po błędzie
  (404/offline). Hover (desktop) i pełny podgląd pokazują ten sam druk w
  rozmiarze `large`; **scroll nad kartą przełącza tor podglądu**
  (scryfall → FOT → KON) jak w pliku legacy, z kształtami okien 320×448 /
  900×386 / 900×550. Karty zakryte mają wspólny rewers (FoW: adres nie zależy
  od karty), DFC po transformacji pokazuje `/back/`, tapnięcie obraca cały
  kafel z obrazem, a nakładka stanu (obrażenia, choroba, aura/equipment,
  efektywne P/T) rysuje się na ilustracji. Wirtualne landy dostały „stały
  druk" — przekierowanie po nazwie (`api.scryfall.com`), jak w legacy.
  Nowe: `artId` w definicji karty + `tools/fetch-art-ids.mjs` (uzupełnia
  numery ilustracji z opublikowanego CSV arkusza kolekcji; adres wyłącznie
  ze zmiennej `MTG_COLLECTION_CSV_URL`, nigdy w repozytorium).
  Testy `test/table-card-art.test.js`, `test/art-ids-tool.test.js`,
  rozszerzony `test/card-images.test.js`; 342/342 zielonych. Instrukcja:
  [docs/setup/ILUSTRACJE_KART.md](setup/ILUSTRACJE_KART.md).
- **M13 (artId z arkusza kolekcji, 2026-08-02; dane + narzędzie):**
  `tools/fetch-art-ids.mjs` uzupełnił `artId` w definicjach **wszystkich
  13 realnych kart** (Highland Game 509, Kappa Tech-Wrecker 278, Segmented
  Krotiq 523, Grizzled Outcasts 171, Krallenhorde Wantons 486, Entrancing
  Lyre 195, Zoraline 480, Rupture Spire 448, Leafcrown Dryad 521, Prismari
  Campus 459, Gloomfang Mauler 199, Serra's Embrace 110, Cloak of the Bat 200).
  Ekstrakcja numeru obsługuje formaty `412FOT.png`, `77.png`, `9KRA.png`
  oraz `1LTR` (liczba + kod setu — aktualny format kolumny `Ilustracja`),
  a aktualizacja istniejącego `artId` zachowuje przecinek (poprawka
  idempotencji przy zmianie numeru). Tory podglądu FOT/KON używają teraz
  lokalnych `./img/<artId>FOT.png`/`KON.png`, gdy plik istnieje, z fallbackiem
  na Scryfall; bez zmian w runtime. Testy `test/art-ids-tool.test.js`,
  `test/card-images.test.js` zaktualizowane do stanu „karty mają artId";
  342/342 zielonych.
- **M13b (słownik kart kolekcji w repo, 2026-08-02; dane + narzędzie):**
  pełna lista kart z arkusza (542 karty, kolumny `Ilustracja`,`Nazwa Karty`,
  z ID setu: `1LTR` = nr 1 z LTR, `5_2XM` = nr 5 z 2XM) wersjonowana
  w `tools/collection-art-ids.csv`; **duplikaty nazw z różnych setów
  zachowane**. Logika narzędzia: 1) słownik lokalny (offline, domyślnie),
  2) karty spoza słownika → fetch z arkusza, 3) nadal bez numeru → bez
  `artId` (tory FOT/KON spadają na Scryfall). Dopasowanie rozstrzyga
  duplikaty po secie karty (`pickArtId`), inaczej pierwszym wpisem;
  `--csv` to pełne nadpisanie źródeł. Test pilnuje spójności słownika
  z `card-data.js` (każda karta z `artId` ma zgodny wpis — także po secie).
  Procedura odświeżania: docs/setup/ILUSTRACJE_KART.md. 345/345 zielonych.
- **M14 (piąty batch realnych kart, 2026-08-02):** Midnight Guard (DKA —
  trigger „another creature enters" odkręca źródło), Holdout Settlement (OGW —
  land: {T}: Add {C} + {T}, tap untapped creature: add one mana),
  Skyclave Geopede (ZNR — trample + Landfall +2/+2 do końca tury). Nowe
  mechaniki w engine: **trigger wejścia na cudze źródła** (untap i landfall),
  **trample** (nadmiar obrażeń nad blokerami na gracza), **koszt „tap
  stwora"** (`tapCreature` — deterministyczny jak płatności M10), efekty
  `untap_permanent` i `add_mana` (dowolny kolor = 1 bezbarwna). Wszystkie 3
  karty mają `artId` ze słownika (385/79/493). Talia `decks/real-batch5.txt`;
  testy `test/real-cards-batch5.test.js` (13); benchmark z 10 taliami
  (16 500 meczów): heuristic 77.1% vs random, 60.4% vs aggro, 73.5% aggro vs
  random — próbka regresji 74.8%/63.2%, progi podniesione do 0.59/0.48.
  Szczegóły: [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).
  359/359 zielonych.
- **B2 (infrastruktura lookahead, 2026-08-02):** `src/engine/lookahead.js`
  (`makeSimulate` — kandydat na `structuredClone` stanu + dogranie polityką,
  horyzonty combat/main_phase, deterministyczne), `runSimulation` przekazuje
  `helpers.simulate`, `createHeuristicBot({ lookahead: 1 })` (domyślnie 0).
  **Pomiar wykazał pogorszenie** (baseline 76.5% vs random → 70.3% z lookahead
  na próbce 10 seedów; wszystkie 4 warianty strojenia poniżej baseline) —
  lookahead zbyt często rezygnuje z ataków, a w małych taliach (deck-out)
  presja ataku jest więcej warta. Zgodnie z zasadą B0 (zakaz pogorszenia)
  funkcja **domyślnie wyłączona**; infrastruktura + testy
  (`test/bot-lookahead.test.js`, 8) zostają jako fundament pod B2-w2.
  Szczegóły i tabela pomiarów: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
  367/367 zielonych.
- **B5 (okienko rozumowania bota, 2026-08-02; decyzja właściciela
  2026-08-01 — tylko warstwa UX):** nowy panel stołu „Rozumowanie bota"
  obok Logu partii, **domyślnie zwinięty** (`<details>` bez `open`); po
  rozwinięciu pokazuje „dlaczego bot zagrał X" — ślad decyzji z `trace()`
  bota (wybrana opcja, ocena, najlepsze alternatywy, np. `T3 · Faza
  główna — Zagranie landa (ocena 90); najlepsza z 3 opcji. Alternatywy:
  Zagranie permanentu (70), Pass priorytetu (0).`). Sesja zbiera wpisy
  (bufor 60, czyszczony przy wznowieniu), boty bez trace nie psują sesji
  (panel: „Brak danych"). Engine/protokół/bot nietknięte — bez pomiaru
  benchmarku (to nie zmiana bota). Testy `test/bot-reasoning.test.js` (8);
  375/375 zielonych. Szczegóły: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
- **M15 (szósty batch realnych kart, 2026-08-02):** Soulmender (M20 — {T}:
  zysk 1 życia), Illusory Demon (ARB — flying + trigger „when you cast a
  spell" → poświęcenie źródła), Jyoti, Moag Ancient (M3C — ETB tworzy
  tokeny Forest Dryad wg liczby rzuceń commandera (tu zawsze 0 — brak
  command zone, mechanicznie poprawne) + na początku walki pompuje land
  creatures o moc Jyoti). Nowe w engine: **trigger „when you cast a spell"**
  (dla spell_cast i permanent_cast; casting samej karty nie poświęca jej —
  poprawność wg CR), **land creatures** (token Forest Dryad: typ Land +
  rodzaj creature — walczy i tapuje się na manę), **trigger
  beginning_of_combat**, dynamiczny pump `source_power`, `create_token`
  z liczbą `commander_casts`, efekt `buff_land_creatures`. Bot unika
  rzucania czarów przy własnym demonie (kara wg wartości stwora). Wszystkie
  3 karty mają `artId` ze słownika (13/305/307). Talia `decks/real-batch6.txt`;
  testy `test/real-cards-batch6.test.js` (15); benchmark z 11 taliami
  (19 800 meczów): heuristic 74.7% vs random, 58.6% vs aggro, 73.2% aggro
  vs random — próbka regresji 72.7%/62.5%, progi 0.59/0.48 bez zmian.
  Szczegóły: [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).
  391/391 zielonych.
- **M16 (siódmy batch realnych kart, 2026-08-02; od tego batcha 5 kart na
  batch — decyzja właściciela):** Fake Your Own Death (OTJ), Puppeteer
  Clique (SHM), Unstable Frontier (CON), Apprentice Wizard (2XM), Delta
  Bloodflies (TDM). Nowe w engine (generycznie, ADR 0002): **liczniki
  -1/-1** w statystykach, **granty zdolności „do końca tury"**
  (`abilityGrants` + `grant_abilities`), **LKI** (`formerCounters`,
  `formerAbilityGrants` — CR 603.10), **persist** (CR 702.79),
  **reanimacja z grobu przeciwnika ze zmianą kontroli**, **opóźnione
  triggery** (`state.delayedTriggers`, CR 603.7), **tokeny niebędące
  stworami** (Treasure z własną zdolnością), **koszt „Sacrifice this"**,
  **atomowe koszty zdolności** (naprawiony błąd: nieudana aktywacja
  zostawiała permanent zatapniony), **cel „land you control" + tymczasowa
  zmiana typu podstawowego**, **`lose_life`** i **intervening if**.
  Wszystkie 5 kart ma `artId` ze słownika (295/343/49/188/431). Talia
  `decks/real-batch7.txt`; testy `test/real-cards-batch7.test.js` (25);
  benchmark z 12 taliami (23 400 meczów): heuristic 76.9% vs random,
  61.3% vs aggro, 75.8% aggro vs random — próbka regresji 74.8%/64.6%,
  próg vs aggro podniesiony do 0.49. Szczegóły:
  [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md). 427/427 zielonych.
- **M18 (UX stołu: pełny ekran karty i modal ruchu bota; 2026-08-02, decyzje
  właściciela):** (A) **dwuklik / double-tap** na dowolnym kaflu otwiera skan
  karty na **pełnym ekranie** (`renderCardFullscreen`, warstwa
  `#card-fullscreen`), a **pojedyncze tapnięcie karty bez dostępnych akcji**
  (karta przeciwnika, grób, exile) robi to samo zamiast pokazywać puste menu
  kontekstowe. iOS nie wysyła `dblclick` dla dotyku niezawodnie, więc drugie
  tapnięcie w ciągu 300 ms rozpoznajemy sami (`touchend`) — jeden kontrakt na
  myszy i na dotyku. (B) **modal „Ruch przeciwnika"** — bot gra w tle, a jego
  czary, zdolności i triggery nie zostawiają śladu na stole; dotąd gracz
  musiał wyławiać je z logu. Sesja zbiera istotne ruchy bota
  (`session.botMoves`, bufor czyszczony przy każdym ruchu gracza, żeby modal
  pokazywał ODPOWIEDŹ, nie historię), a UI pokazuje je w modalu blokującym,
  zamykanym przyciskiem, ze **skanem ostatniej zagranej karty**. Świadomie
  pomijamy passy, tapowanie many i kroki tury (szum — decyzja właściciela).
  Testy `test/table-ux-m18.test.js` (8) + nowe id w `test/table-ui.test.js`;
  464/464 zielonych, artefakt 36 modułów / 377.0 kB.
- **Bugfix ilustracji na stole (2026-08-02, zgłoszenie właściciela):** kafle
  realnych kart na stole i w ręce pokazywały syntetyczną „twarz" zamiast skanu
  ze Scryfalla (poprawny obraz był widoczny dopiero w oknie szczegółów).
  Przyczyną NIE był wybór adresu (ten był poprawny od M12), tylko sposób
  ukrywania obrazu w trakcie ładowania: `<img>` startował z
  `style.display = 'none'`, a **przeglądarka nie pobiera obrazów ukrytych
  `display: none`** — przy `loading="lazy"` nie pobiera ich nigdy, więc
  zdarzenie `load` nie padało i fallback (twarz) zostawał na zawsze. Modal
  szczegółów używa innej ścieżki (bez `lazy`), dlatego tam skan działał.
  Naprawa: obraz w trakcie ładowania jest **przezroczystą warstwą** nad twarzą
  (klasa `is-loading`, CSS `opacity: 0` + `position: absolute`), a nie
  elementem `display: none`; po `load` warstwa staje się widoczna i twarz
  znika, po wyczerpaniu kandydatów wraca twarz (bez zmian). Dotyczy wszystkich
  kart ze skanem — realnych i wirtualnych landów podstawowych; karty
  syntetyczne i tokeny nadal (celowo) mają kolorową twarz. Testy regresyjne
  w `test/table-card-art.test.js` (2 nowe: „żaden kafel ze skanem nie startuje
  z display:none" i „wirtualny land dostaje skan"); 429/429 zielonych.
- **M17 (ósmy batch realnych kart, 2026-08-02):** Phyrexian Rager (DMU),
  Nefarious Imp (CLB), Gather the Townsfolk (DDQ), Evangel of Synthesis
  (BRO), Woolly Loxodon (KTK). Nowe w engine (generycznie, ADR 0002):
  **dobieranie kart z efektu** (`draw_cards`, wspólne z komendą draw),
  **licznik dobrań w turze** (`cardsDrawnThisTurn`), **odrzucanie kart**
  (`discard_cards`, deterministycznie najdroższa), **zdolności STATYCZNE
  warunkowe** (CR 604.3 — przeliczane przy odczycie statystyk, nie „do końca
  tury"), **trigger „one or more permanents you control leave the
  battlefield"** (raz na komendę, CR 603.2), **scry poza własną turą**
  (pendingScry oddaje i zwraca priorytet), **fateful hour** (warunkowa liczba
  tokenów), **zwykły morph** (obrót bez licznika +1/+1). Wszystkie 5 kart ma
  `artId` ze słownika (75/3/335/352/518). Talia `decks/real-batch8.txt`;
  testy `test/real-cards-batch8.test.js` (26); benchmark z 13 taliami
  (27 300 meczów): heuristic 77.8% vs random, 63.6% vs aggro, 75.5% aggro
  vs random — próbka regresji 75.0%/66.9%, próg vs aggro podniesiony do 0.51.
  Wyceny ETB w bocie odrzucone po pomiarze (pogarszały wynik — zasada B0).
  Szczegóły: [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md). 456/456 zielonych.
- **B3 (modelowanie przeciwnika, 2026-08-02; pozycja 10.4):**
  `src/engine/hypergeom.js` (deterministyczna hipergeometria) + bot zna
  talię przeciwnika (`opponentDeck` — przekazywana z benchmarku i sesji)
  i klasyfikuje jego czary generycznie (instant damage = removal, pump =
  combat trick). Model ręki: N = biblioteka+ręka, K = kopie odpowiedzi minus
  widoczne w strefach publicznych (adaptacja w trakcie partii), n = ręka.
  **EV ataku**: kara ≈ wartość stwora × P(removal) przy otwartej manie wroga
  i P>45% (nie w wyścigu — lekcja B2); **EV bloku**: kara za blok zabijający
  atakującego przy ryzyku pumpa (poza presją śmiertelną). Pomiar: pełna
  macierz 19 800 meczów — 74.5% vs random, 58.6% vs aggro (baseline
  74.7/58.6 — neutralny wobec botów benchmarku; wartość w grze z człowiekiem
  trzymającym odpowiedzi); próbka regresji 72.5%/62.5%, progi 0.59/0.48
  bez zmian. Testy `test/hypergeom.test.js` + `test/bot-opponent-model.test.js`
  (11); 402/402 zielonych. Szczegóły: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
- **B1 (lepsza heurystyka bota, 2026-08-02; pozycja 10.3 kolejki):**
  świadomość kroków tury (bez tapowania many/zdolności {T} w untap/upkeep/
  draw/end/cleanup), zegar (blisko lethal, wyścig, deck-out), ocena planszy
  (flying-evasion, parytet stworów, ceny bloków), wycena zdolności z definicji
  karty (pump − koszt tapu, neutralizacja Liry wg celu, equip, cycling,
  ninjutsu). **Naprawiona patologia deck-out** na `synthetic-abilities`
  (heuristic 0% → 100% vs random w mirrorze — bot stał z zatapianymi
  stworem i wypalał własną bibliotekę). Pełna macierz 50 seedów (13 500
  meczów): heuristic vs random **75.4%** (było 67.4%), vs aggro **60.9%**
  (było 59.0%), agregat heuristic 68.1% (było 63.2%); próbka regresji
  73.1% / 63.3%, progi w `test/bot-benchmark.test.js` podniesione do
  0.58 / 0.48. Szczegóły i tabele: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).

Następny większy pakiet: kolejny batch realnych kart (lista od właściciela; każda
karta z danymi ze Scryfall — ADR 0010 §2a). **Batch 18 czeka na listę
właściciela.** Zamknięte: ilustracje (poz. 10.1), Batche 1–17, B1, B3, B4,
B5 (UX), M20 kreatora talii, M21 ChoiceRequest, M24 (Batch 11), M25
(przebieg tur dla AI), M26 (gesty dotyku na iPadzie), M27 (Batch 12) i M28
(Batch 13); B2 — infrastruktura
lookahead (eksperyment nie przeszedł progu jakości, funkcja pozostaje
wyłączona).
Szczegóły B4 i pomiary: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md).
Świadome uproszczenia M8–M11 (brak kaskadowania triggerów,
deterministyczne „you may", wymuszana płatność „unless you pay", scry tylko na
własnej bibliotece, uproszczony model continuous effects dla aur bestow itd.)
są udokumentowane w [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).

> **Układ definicji kart (ADR 0010 §1 vs rzeczywistość):** ADR 0010 przewidywał
> „jedna karta = jeden plik" w `src/cards/definitions/`, ale repozytorium
> ewoluowało do pojedynczego modułu `src/cards/card-data.js` (sekcja `REAL_CARDS`).
> Po Batche 1–13 (54 wspieranych kart) formalizuje to **ADR 0014**
> ([definicje kart w pojedynczym module](decisions/0014-card-definitions-single-module.md)),
> który zastępuje §1 ADR 0010. Procedura dodawania karty: `docs/cards/HOW_TO_ADD_CARD.md`.

Milestone’y i kryteria są zapisane w [docs/ENGINE_MILESTONES.md](ENGINE_MILESTONES.md).

Historyczna kolejność pierwszych kroków (zrealizowana w bieżącym PR):

1. Szkielet `src/engine/`, `src/protocol/` i `test/` zgodny z ADR 0011.
2. CI uruchamiający `node --test` przy każdym PR.
3. `build.mjs` + publikacja na GitHub Pages — żeby każdy kolejny przyrost był od razu
   sprawdzalny na iPadzie, a nie dopiero na końcu projektu.
4. Tożsamość obiektów i strefy z kontrolowaną zmianą strefy.
5. Seedowane RNG i poprawne tasowanie.
6. `GameState` → `PlayerView` z testem braku wycieku ukrytych informacji.

## Otwarte pytania

Audyt zamknął większość pytań z poprzedniej wersji tego dokumentu (zob. §9 audytu).
Pozostają:

1. **Które karty wchodzą do pierwszego zestawu?** **Batche 1–17 (94 karty)
   zakodowane; kolejny batch czeka na listę właściciela.** Dostarczone
   i zamknięte (Batch 11, 2026-08-03: Underdark Explorer, Angel's Feather,
   Release the Ants, Porcelain Legionnaire, Curate, Canonized in Blood;
   Batch 12, 2026-08-03: Grave Exchange, Hysterical Blindness, Barkform
   Harvester, Undead Servant, Rage of Purphoros; Batch 13, 2026-08-03:
   Scorned Villager, Curse of the Pierced Heart, Emissary Escort,
   Snarling Wolf, Negate).
   Przed kodowaniem każdej karty obowiązkowy pobór danych ze Scryfall
   (ADR 0010 §2a). Docelowo ~20 wspieranych kart (przekroczone — katalog
   rośnie zgodnie z listami właściciela).
   *(częściowo rozstrzygnięte 2026-08-01, Batch 5 2026-08-02, Batch 11 2026-08-03)*
1a. ~~**Druk Ethersworn Shieldmage (Batch 16)**~~ **Rozstrzygnięte 2026-08-05:**
   zapis „CON\" na liście odnosił się do planu Alara; właściciel potwierdził
   druk **ARB** (Alara Reborn) — tak zakodowano (artId 536 ze słownika).
2. ~~**Jaki rozmiar talii dla pierwszych rozgrywek?**~~ **Rozstrzygnięte 2026-08-01:**
   bez minimalnej wielkości — talia ma tyle kart, ile wyjdzie z kreatora. Walidacja
   rozmiaru (`size` w `validateDeck`) pozostaje opcjonalna i domyślnie wyłączona.
3. **Jaki docelowy poziom ochrony FoW?** W aplikacji czysto klienckiej realnie osiągalne jest
   „uczciwe UI + kontroler bez dostępu do ukrytych danych". Pełna poufność wymaga backendu.
   Decyzja potrzebna dopiero przy Etapie 6.
4. **Czy stół ma zachować tryb swobodny (sandbox)** jako narzędzie diagnostyczne obok
   trybu sterowanego regułami?
5. ~~**Kreator talii**~~ **Zrobione w M20 (2026-08-03):** ADR 0012 zrealizowany
   bez `localStorage`, z filtrami `Plan`/`Set`/nazwa, walidacją talii i wspólnym
   tekstowym formatem eksportu oraz plików repozytorium.
6. ~~**Czy podnieść ADR 0005 do „Zaakceptowana"?**~~ **Rozstrzygnięte 2026-08-01:**
   [ADR 0005](decisions/0005-deterministic-replayable-execution.md) jest zaakceptowana —
   determinizm jest wymogiem działania zapisu partii.
7. ~~**Czy prawdziwe landy (Forest/Mountain…) wejdą do katalogu?**~~ **Rozstrzygnięte
   2026-08-01:** NIE. Landy podstawowe istnieją wirtualnie — do talii dobiera się
   dowolną liczbę sztuk, a ilustracje wyświetlają się ze Scryfall tak jak w pliku
   legacy HTML. **Zaimplementowane od Batchu 4 (M11):** `VIRTUAL_BASIC_LANDS`
   w `src/cards/card-data.js` (Plains/Island/Swamp/Mountain/Forest jako
   `supported`, typy `['Basic','Land']` + podtyp), `parseDeckText` przyjmuje
   dokładne nazwy, `validateDeck` nie limituje kopii, typecycling ma realny cel
   wyszukiwania; talia `decks/real-batch4.txt` używa `8x Swamp`. Pozostaje
   ilustracja: **zrobiona 2026-08-02** — stały druk landów podstawowych to
   przekierowanie po nazwie do Scryfalla (`imageUri` w `VIRTUAL_BASIC_LANDS`),
   jak w pliku legacy.
8. ~~**Docelowy poziom trudności bota i prezentacja jego rozumowania w UI.**~~
   **Rozstrzygnięte 2026-08-01:** trudność maksymalna dostępna; rozumowanie w osobnym
   okienku stołu, domyślnie zwiniętym, docelowo rozwiniętym. Szczegóły:
   [docs/BOT_ROADMAP.md](BOT_ROADMAP.md) (B5).
9. ~~**Czy wolno wprowadzić zależność ML (B4)?**~~ **Rozstrzygnięte warunkowo
   2026-08-01:** tylko jeśli stół nadal działa lokalnie (z pobranego pliku / lokalnego
   serwera HTTP) i zdalnie z GitHub Pages na iPadzie/iPhonie bez instalowania czegokolwiek
   — w praktyce czysty JS w jednoplikowym artefakcie (ADR 0011). Framework ML wymaga
   osobnej decyzji i ADR.
10. **Kolejka zadań zatwierdzona przez właściciela 2026-08-01** (priorytet malejący;
    handoff: [docs/setup/HANDOFF_2026-08-01.md](setup/HANDOFF_2026-08-01.md)):
    1. ~~**Ilustracje prawdziwych kart na stole.**~~ **Zrobione 2026-08-02**
       (M12 niżej): kafel realnej karty renderuje druk z `imageUri` (rozmiar
       `normal`, lazy-load), hover i pełny podgląd pokazują ten sam obraz w
       `large`, syntetyczna twarz jest fallbackiem. Objęte: DFC (po transformacji
       tył), tapnięcie (obrót całego kafla), rewers dla kart zakrytych, wirtualne
       landy (druk domyślny Scryfalla), tory podglądu FOT/KON przełączane
       scrollem jak w legacy. Instrukcja:
       [docs/setup/ILUSTRACJE_KART.md](setup/ILUSTRACJE_KART.md).
    2. ~~**Batch 5 realnych kart**~~ **Zrobione 2026-08-02 (M14):** Midnight
       Guard, Holdout Settlement, Skyclave Geopede (procedura ADR 0010 §2a;
       triggery wejścia, trample, koszt „tap stwora"). **Batch 6 (M15,
       2026-08-02): Soulmender, Illusory Demon, Jyoti, Moag Ancient
       (when you cast a spell, land creatures, beginning_of_combat).**
       **Batch 7 (M16, 2026-08-02, 5 kart): Fake Your Own Death, Puppeteer
       Clique, Unstable Frontier, Apprentice Wizard, Delta Bloodflies
       (granty zdolności, persist, reanimacja, opóźnione triggery).**
       **Batch 8 (M17, 2026-08-02): Phyrexian Rager, Nefarious Imp, Gather
       the Townsfolk, Evangel of Synthesis, Woolly Loxodon (dobieranie,
       zdolności statyczne, fateful hour, zwykły morph).**
    3. ~~**Etap B1 bota**~~ **Zrobione 2026-08-02** — każda zmiana mierzona
       `node tools/benchmark.mjs` (tabela przed/po w opisie PR), progi w
       `test/bot-benchmark.test.js` podniesione (0.59 / 0.48 po Batchu 5).
       Wynik: 75.4% → 77.1% vs random (9 → 10 talii), 60.9% → 60.4% vs aggro;
       patologia deck-out naprawiona. Szczegóły: [BOT_ROADMAP](BOT_ROADMAP.md).
    4. ~~**B4 — strojenie wag**~~ **Zrobione 2026-08-03 (M19)** —
       hill-climbing na tym samym harnessie B0 przyjął `mana=1.1` i
       `permanent=0.9`; pełna macierz poprawiła wynik 77.8% → 77.9% vs random
       oraz 63.6% → 64.0% vs aggro. Progi regresji: `0.60 / 0.52`.
    5. ~~**Kreator talii UI**~~ **Zrobione 2026-08-03 (M20)** — filtry
       Plan/Set/nazwa, lista kart supported, limit kopii, podsumowanie,
       kopiowanie i pobieranie wspólnego formatu tekstowego; bez localStorage.
    6. ~~**UI ChoiceRequest**~~ **Zrobione 2026-08-03 (M21)** — modal grupuje
       warianty celu/X/scry/backup, waliduje wybór przez protokół i przekazuje
       legalną komendę do sesji; engine nadal używa enumeracji jako adaptera.
    7. ~~**Batch 9 realnych kart**~~ **Zrobione 2026-08-03 (M22)** — Kor
       Cartographer, Scorpion Sentinel, Dunland Crebain, Dragonbroods' Relic,
       Secluded Steppe; dane Scryfall, artId, talia i generyczne mechaniki.
    8. ~~**Batch 10 realnych kart**~~ **Zrobione 2026-08-03 (M23)** — Goblin
       Piker, Angel of the Dawn, Armored Skaab, Tumbleweed Rising,
       Dawntreader Elk; nowe mechaniki globalnego buffa, mill, plot i dynamicznego X.
    9. ~~**Batch 11 realnych kart**~~ **Zrobione 2026-08-03 (M24)** — Underdark
       Explorer, Angel's Feather, Release the Ants, Porcelain Legionnaire,
       Curate, Canonized in Blood; inicjatywa, clash, phyrexian mana,
       first strike, surveil i descended.

## Aktualny bloker

Brak dalszej listy realnych kart — **Batche 1–21 (138 wspieranych kart) zakodowane; Batch 22 czeka na listę właściciela.**
Poz. 10.1 (ilustracje), **Batche 2–11, B1, B3, B4, B5 (UX), M20, M21 i M24
są zamknięte**;
B2 — infrastruktura lookahead (eksperyment nie przeszedł progu jakości,
wyłączona; szczegóły: [docs/BOT_ROADMAP.md](BOT_ROADMAP.md)). Nie włączamy
lookahead bez przeprojektowania i nie dodajemy kart bez danych Scryfalla.

Poboczna zaległość z poz. 10.1: **zamknięta 2026-08-02 (M13)** — `artId`
dla wszystkich 13 realnych kart uzupełniony z opublikowanego arkusza
(adres wyłącznie w `MTG_COLLECTION_CSV_URL` / `tools/collection.config.json`,
nigdy w artefakcie stołu); pełny słownik kolekcji (542 karty) wersjonowany
w `tools/collection-art-ids.csv` (M13b). Tory FOT/KON działają, gdy pliki `./img/`
istnieją; bez plików cicho spadają na Scryfall.

## Kryterium ukończenia aktualnej fazy

Etap 1 kończy się, kiedy:

- istnieje uruchamialny headless engine bez zależności od DOM-u i sieci;
- `node --test` przechodzi lokalnie i w CI;
- kontrakty `GameState`, `Command`, `Event`, `PlayerView` i `ChoiceRequest` są zaimplementowane
  i opisane w JSDoc;
- test potwierdza brak wycieku ukrytych informacji do `PlayerView`;
- ten sam seed i ta sama sekwencja komend dają identyczny przebieg symulacji;
- dwa `RandomBot`-y przechodzą przez minimalną symulację tur.


## Sesja 2026-08-07 — T1–T4 (stos permanentów, cele triggerów, auto-tap, mulligan)

Po M48 (PR #32) usunięto cztery największe świadome luki engine — wszystkie u root cause,
bez maskowania (AGENTS.md). Mini-roadmapa: `docs/plans/PLAN_2026-08-07-poprawki-stos-i-luki.md`.

- **T1 — permanenty na stosie (CR 601/608/702):** rzut stwora/artefaktu/enchantmentu kładzie
  CZAR na stosie; wejście na pole bitwy po pełnej rundzie passów (resolvePermanentSpell —
  liczniki ETB, bloodthirst, face-down). Przeciwnik odpowiada instanitem, kontrczary celują
  w czary-stwory, cast triggery przy rzucie, ETB przy rozstrzygnięciu. Timing sorcery:
  cast_permanent/play_land wymagają pustego stosu. CR 117.3b: po rozstrzygnięciu priorytet
  aktywnego gracza. Adventure creature i Discover free-cast też na stos.
- **T2 — cele triggerów jako decyzje gracza (CR 603/115.1b):** resolve_trigger_target zamiast
  deterministycznego findTriggerTarget (15 kart); „up to one"/„you may" = opcja odmowy;
  Zoraline: najpierw płatność, potem cel; Angel's Feather: „you may" tak/nie. LKI dla
  triggerów dies/leaves. Root fixy: tokeny nie są „card from graveyard" (CR 108.2b),
  ślepe wpisy nie blokują pass, exile_permanent z null = brak efektu (CR 608.2b).
- **T3 — auto-tap płaci pipy kolorów właściwą maną (CR 106.4/601.2h):** koniec cichej złej
  płatności ({U} z {W}); do-tap kolorowopasujących źródeł, atomiczność płatności;
  darmowe rzuty (plot/discover) bez wymagań kolorów; morph face-down bezbarwny (CR 702.36).
- **T4 — mulligan londyński (CR 103.4):** decyzja keep/mulligan po rozdaniu; mulligan =
  tasowanie ręki do biblioteki, dobranie 7, odłożenie N kart na spód (wybór gracza).
  Boty zatrzymują rękę (pierwsza oferta) — B0 bez zmiany przebiegu.
- **T5 — regeneracja (CR 701.12):** zdolność „regenerate" zakłada tarczę; następne
  ZNISZCZENIE (śmiertelne obrażenia / efekt destroy) jest zastępowane (odtapowanie, zdjęcie
  obrażeń, wyjście z walki, bez dies); nie chroni przed poświęceniem/prawem legend/P/T<=0.
- **T6 — TRIGGERY NA STOSIE (CR 603.3):** efekty zdolności triggerowanych rozstrzygają się
  PO pełnej rundzie passów (wspólny stos z czarami, LIFO) — przeciwnik odpowiada instanitem.
  Intervening-if przy rozstrzyganiu (CR 603.4), LKI źródła (CR 603.10), cele nieważne =
  no-op (CR 608.2b). Na stos idą: ETB/dies/attacks/landfall/prowess/cast-triggery, rozdziały
  Sag, opóźnione triggery, combat damage triggers. Bramki: declare_blockers/resolve_combat
  przy pustym stosie; pass w combat_damage dozwolony przy niepustym (okno odpowiedzi).

Testy: **1025/1025** (+4: test/trigger-vanished-target.test.js). Build: 49 modułów / ~1089 kB.
B0 finalny (13500 meczów, **0 niedokończonych**): heuristic **90.4% vs random, 61.7% vs
aggro**, aggro **95.4% vs random** — progi 0.78/0.57 utrzymane.

**Fix crasha B0 po T6 (CR 608.2b):** pełna macierz B0 wywalała się na „Modyfikować można
tylko stwora na battlefield" — pump (prowess/landfall) rozstrzygany ze stosu na źródle,
które odeszło z pola bitwy w oknie odpowiedzi. Root fix: efekty triggerów z nielegalnym
celem = no-op (pump, pump_food_result, damage, goad, grant_abilities,
grant_keywords_until_end_of_turn, sacrifice_permanent, reanimate_under_your_control,
return_permanent_from_graveyard, return_creature_card_to_hand, put_graveyard_card_on_bottom,
untap_permanent, cant_block, cant_be_blocked, turn_face_up). LKI stub źródła niesie teraz
ostatnie znane statystyki (power/toughness — CR 603.10, efekt „source_power" Jyoti).
Przy okazji wykryty maskowany bug: walidacja aktywacji morph/megamorph nie odrzucała
obrotu już odkrytej karty (throw w turnFaceUp udawał nielegalność) — root fix w
activateAbility. Weryfikacja: pełny przebieg 13500 meczów bez crasha.

**Kolejne tematy (poza tą sesją):** batch realnych kart od właściciela; resztowe
determinizmy „you may" (kolejność ofert); regeneracja czeka na pierwszą realną kartę
z tym keywordem (mechanika generyczna + testy syntetyczne gotowe).

## Sesja 2026-08-08 — UX A+B + czyszczenie luk (PR #33, 2026-08-08)

Na zgłoszenie właściciela naprawione dwa tematy UX oraz wyczyszczone przestarzałe Jawne Ograniczenia i kolejne uproszczenia niezgodne z CR:

- **A. Wskaźnik tury jako warstwa** — `#turn-indicator` przeniesiony z `.topbar` na poziom `<body>` przed `.app`, CSS `position: fixed; top:8px; left:8px; z-index:1100` (poniżej modalu 1500 i fullscreen 2600), `pointer-events:none` — zawsze widoczny przy scrollu, nie zasłania kart.
- **B. Etykiety mulligana** — `commandLabel` dla `resolve_mulligan_choice` / `resolve_mulligan_bottom_choice` zamiast technicznego `resolve_mulligan_choice` pokazuje dwie rozróżnialne polskie etykiety (`Zatrzymaj tę rękę` vs `Weź mulligana (odłożysz N kart)` z dynamicznym licznikiem oraz `Odłóż na spód (N): <nazwy>`), `ACTION_RANK -3`.
- **C. Czyszczenie Jawnych Ograniczeń cz.1 (handout T1–T6)** — 7 kart: `highland-game` (trigger dies bez stosu → T6), `rupture-spire` (płatność automatyczna → pay_or_sacrifice), `kor-cartographer` / `pilgrims-eye` / `fiery-fall` (deterministyczne szukanie → resolve_search_choice), `moonlit-meditation` (replacement deterministycznie → resolve_moonlit_choice), `rage-of-purphoros` (can't be regenerated — uściślenie).
- **D. Any-color bezbarwnie → kolorowa mana (M41)** — 10 kart: `rupture-spire`, `prismari-campus`, `holdout-settlement`, `dragonbroods-relic`, `raucous-carnival`, `fake-your-own-death`, `marut`, `porcelain-legionnaire` (phyrexian), `scorned-villager` ({G}), `esper-stormblade` (hybrid) — `MANA_SOURCE_MAP` już kolorowy, wpisy przestarzałe usunięte; `seers-lantern {C}` zostaje (słusznie bezbarwna).
- **E. Wybór stwora do tap (CR 601.2h)** — `Holdout Settlement` / `Dragonbroods Relic` (`tapCreature`) i `Wedgelight Rammer` Station (`tapOtherCreature`): `legalActivatedAbilities` enumeruje warianty per stwór (`tapCreatureId`/`tapOtherCreatureId`) zamiast deterministycznego pierwszego, `activateAbility` waliduje i tapuje wybrany (fallback dla starych replay), `game-state` przekazuje, `render` grupuje i etykietuje `tapnij X`.
- **F. Escape jako wybór (CR 702.138)** — `Sweet Oblivion`: `legalEscapeCasts` enumeruje podzbiory 4 kart z grobu (kombinacje, cap 32 jak crew) zamiast pierwszych 4, `castEscape` waliduje dowolny podzbiór, `render` grupuje i etykietuje `Ucieczka: X — wygnaj: <nazwy>`, `dragonbroods-relic` any-target deterministycznie → [] (trigger już jako pendingTriggerTargets).

Weryfikacja: `npm test` **1025/1025**, `npm run build` 49 modułów / 1090 kB, B0 0.78/0.57 bez regresji, headless testy mulligana i Escape.

## Sesja 2026-08-08 — M50 Saga Mesmerize jako wybór gracza + audyt limitations (PR #34, 2026-08-08)

Na zgłoszenie właściciela („wykonaj B a potem D z twojej listy") zrealizowane dwa tematy z listy otwartej:

- **B. Mesmerize (Shiva, Warden of Ice — Saga rozdziały I/II)** — Temat 2 dla Sag: cel „Target creature can't be blocked this turn" wybiera KONTROLER Sagi blokującą decyzją `resolve_trigger_target` (jak inne cele triggerów T2: Forge Devil, Kor Sanctifiers, Puppeteer Clique, Greatsword of Tyr). Kolejność kandydatów (`creature_you_control` z pola bitwy) = dawny determinizm, więc proste boty biorą pierwszą ofertę i zachowują dotychczasowe zachowanie „najsilniejszy własny stwór". Nowa `queueSagaChapter` w `src/engine/triggers.js` rozdziela ścieżki: rozdziały z `requiresTarget` → `queueTargetDecision` (nowa kolejka `pendingTriggerTargets` dla Sagi); bezcelowe → `queueTriggerToStack` jak dotąd. `fireSagaChapter` przyjmuje `chapterTargets` z `payload.targets`; `resolveTriggerEntry` w ścieżce `sagaChapter` przekazuje je. Usunięto martwą `findSagaChapterTargets`. Karta `shiva-warden-of-ice` chapters I/II dostały `requiresTarget: { type: 'creature_you_control' }`.
- **D. Audyt `limitations`** — z 159 wpisów `limitations` w `src/cards/card-data.js` znaleziono 3 do wyczyszczenia po naprawie Mesmerize: skopiowane wpisy o determinizmie celu Mesmerize w `krallenhorde-wantons`, `moonscarred-werewolf` (tylne strony wilkołaków — nigdy nie miały Mesmerize) i `shiva-warden-of-ice`. Reszta wpisów to aktualne komentarze implementacyjne (świadome uproszczenia, mechaniki zaimplementowane jako decyzje gracza itd.) — brak dalszych świadomych uproszczeń do wyczyszczenia. Rekomendacja dla właściciela: żadne dalsze czyszczenie `limitations` nie jest potrzebne.

Weryfikacja: `npm test` **1028/1028** (3 nowe testy Mesmerize + 2 zaktualizowane w batch16), `npm run build` 49 modułów / 1095.3 kB, B0 progi 0.78/0.57 bez zmian (boty biorą pierwszą ofertę — domyślne zachowanie niezmienione).

## Sesja 2026-08-08 — M51 UX i18n: token count, modal labels, ikony many (PR #35, 2026-08-08)

Na zgłoszenie właściciela 2026-08-08 (po testach iPada z PR #34) trzy tematy UI:

- **A. Gather the Townsfolk — opis „tworzenia 1/1"** — `describeSpellEffects` w `src/table/render.js` nie uwzględniał `amount` ani fateful hour. Teraz dla `create_token` z `amount > 1` opis zawiera `N× token P/T Name` (Gather the Townsfolk 2×, Howl 2×+, Undead Servant wg grobu); z `ifLifeAtMost` dokleja `(X przy życiu ≤ N)` (Gather the Townsfolk: 5 przy życiu ≤ 5). Analogiczna poprawka w `describeEffect` dla spójnych etykiet aktywowanych zdolności (Sailor of Means, Captain's Call). Mechanika była OK (log i stół pokazywały prawidłową liczbę), tylko opis kłamał.
- **B. Modalne Choose one — brak nazw opcji** — 4 karty modalne (aerith-rescue-mission, your-temple-is-under-attack, ruinous-rampage, youre-confronted-by-robbers) dostały pole `name` w każdym `spell.modes[i]` (nazwy z Oracle text). `commandLabel` w `src/table/render.js` dla `cast_spell` z `modeIndex` dokleja ` — {modeName}` po nazwie karty, np. „Rzuć: Your Temple Is Under Attack — Pray for Protection (koszt {2}{W})" — gracz widzi, KTÓRĄ opcję wybiera.
- **C. Ikony many łamią tekst w przyciskach** — z oryginalnego screenshotu iPada: w wąskim buttonie .action ikona `{W}` zostawała sama w linii, a `)` przeskakiwał do następnej. Przyczyna: `display: inline-flex` + `width: 1.25em` traktowały ikonę jako sztywny znak oderwany od kontekstu. Naprawa: `display: inline-block` + `white-space: nowrap` + `flex-shrink: 0` + `margin: 0 2px`. Ikona trzyma się sąsiedniego tekstu, nie wymusza własnego kontekstu łamania linii.

Weryfikacja: `npm test` **1039/1039** (+11 nowych: 5 spell-effect-description, 6 modal-mode-name), `npm run build` 49 modułów / 1098.5 kB.

## Sesja 2026-08-08 — M52 Batch 22: 10 realnych kart (PR #34, 2026-08-08)

Dziesięć realnych kart z kolejki właściciela 2026-08-08 (handoff
`HANDOFF_2026-08-08b.md`): **Thistledown Players** (BLB), **Etherwrought
Page** (ARB), **Stomping Slabs** (MOR), **Courage in Crisis** (WAR),
**Selesnya Charm** (RTR), **Wormfang Newt** (JUD), **Raise the Alarm**
(CMR), **Cellar Door** (ISD), **Healer of the Glade** (M20) i **Enter the
Enigma** (DSK). Wszystkie `supported` w 100% mechaniki z Oracle (ADR 0010
§2a — 10 plików Scryfall pobranych przed kodowaniem przez `fetch_page`
z uwagi na ograniczenie `curl` w sandboxie; artId/plan ze słownika
kolekcji). Procedura sesji: 1 sesja = 1 branch (`arena/019fe084-mtg`) =
1 PR (#34); pierwszy commit PR to plan
(`docs/plans/PLAN_2026-08-08-batch22-cards.md`), kolejne commity to
silnik → 3 feat (3+3+4 karty) → docs (M52 + HANDOFF).

**Nowe generyczne mechaniki engine (ADR 0002):** **proliferate** (CR 701.27)
— `pendingProliferate` + `resolve_proliferate` (Courage in Crisis: +1/+1
counter + proliferate; pierwsza karta z proliferate w katalogu);
**mill_from_bottom** (Cellar Door: 2 karty z dołu + conditional 2/2
Zombie token); **return_exiled_to_battlefield** (Wormfang Newt: ETB exile
own land, LTB return; LKI z `exiledCardIds`); **reveal_top_to_bottom_order**
(Stomping Slabs: odsłoń 7, ułóż w kolejności, resztę na spód, named
„Stomping Slabs" deal 7); **modal upkeep trigger** (Etherwrought Page:
3 tryby — gain 2 life / surveil 1 / opp loses 1 life) + nowa kolejka
`pendingModalTrigger` i komenda `resolve_modal_choice`; nowe typy celów
w `triggerTargetCandidates`: `creature_with_power_at_least {min:5}`,
`nonland_permanent`, `land_you_control`. Nowe kolejki pending (4),
komendy resolve_* (4), zdarzenia (11); 1 nowy token (`token_knight` 2/2
biały Knight vigilance; `token_soldier` i `token_zombie` re-używane
z wcześniejszych batchy). 4 nowe ścieżki w `tryFire` (proliferate,
reveal_order, modal_trigger, damage_target).

**Naprawy root cause (AGENTS.md — nie maskujemy):**
- `effects.js`: literówka `pendingDamageTargets` → `pendingDamageTarget`
  (commit `f786955`); kolejka w `game-state.js` bez 's' — efekt
  `damage_to_target` z `requiresTarget` gubił kandydatów. Wykryte przez
  test Stomping Slabs.
- `identity.js`: dodany parametr `name` (commit `f786955`); `addObject`
  przekazywał `name` do `createGameObject` (testy z named biblioteką).
- `game-state.js`: filtr tokenów w `accepted` zmieniony z `o.name != null`
  na `o.cardId.startsWith('token_')` (CR 704.5d — tokeny po prefiksie
  cardId, nie po `name`).

**Testy.** Nowe: `test/engine-batch22.test.js` (engine: 4 nowe efekty +
4 kolejki), `test/real-cards-batch22-first.test.js` (4: Thistledown
untap, Etherwrought modal × 3, Stomping reveal+reorder+named damage),
`test/real-cards-batch22-second.test.js` (4: Courage +1/+1+proliferate,
Selesnya Pump+Token, Wormfang ETB/LTB ping-pong) + helper
`resolveStack(state)` do rozstrzygania stosu z pełnymi rundami passów,
`test/real-cards-batch22-third.test.js` (4: Raise 2× Soldier, Cellar
mill_from_bottom+token, Healer ETB gain life, Enter cant_be_blocked+draw);
`test/art-ids-tool.test.js` `withArt.length === 148` (138 → 148).

**Plan sesji:** `docs/plans/PLAN_2026-08-08-batch22-cards.md` (253 linii,
szczegóły mechanik, decyzje, świadome uproszczenia). Handoff:
`docs/setup/HANDOFF_2026-08-08c.md` (następna sesja: kolejka
właściciela — Batch 23 czeka).

**Benchmark.** Pełny B0 (9 talii, 50 seedów, 13 500 meczów, 0
niedokończonych) zmierzony 2026-08-08: heuristic **90.4% vs random**,
**61.8% vs aggro**, aggro **95.5% vs random**. Progi `0.78 / 0.57`
utrzymane (heuristic vs aggro 61.8% > próg 57%, heuristic vs random
90.4% > próg 78%; porównanie z M51: 90.4%→90.4% vs random, 61.7%→61.8%
vs aggro, 95.4%→95.5% aggro vs random — **tylko w górę**, dodanie
kart, nie zmiana bota). Proliferate w Courage in Crisis to jedyny
spell z proliferate w katalogu — bot bierze PIERWSZEGO kandydata z
oferty (deterministycznie), więc brak dodatkowych opóźnień gry.

Weryfikacja: `npm test` **1059/1059** (+20: 4 engine + 12 kart + 4
naprawa), `npm run build` 49 modułów / 1123.8 kB, `npm run benchmark`
13500 meczów / 856.7 s (~63.5 ms/mecz).

## Sesja 2026-08-08 — M53 Batch 23: 10 realnych kart (PR #35, 2026-08-08)

Dziesięć realnych kart z kolejki właściciela (handoff `HANDOFF_2026-08-08e.md`): **Vandalize** (DTK), **Expunge** (USG), **Shiv's Embrace** (M11), **Deepwood Denizen** (MH2), **Welder Automaton** (AER), **Feedback** (5ED), **Vow of Wildness** (CMR), **Greater Tanuki** (NEO), **Scorch Spitter** (M20), **Turn the Tide** (MBS). Wszystkie `supported` w 100% Oracle (ADR 0010 §2a — 10 plików Scryfall pobranych przed kodowaniem, artId/plan ze słownika). Procedura sesji: fix B23 UI (2 bugi modalu) jako pierwszy commit PR #35, potem plan → silnik → 3 feat (3+3+4 karty) → docs (M53 + HANDOFF).

**Nowe generyczne mechaniki engine (ADR 0002):** `land`/`enchantment`/`nonartifact_nonblack_creature` target, `enchantedPermanentControllerUpkeep` (Feedback), `damage_defending_player` (Scorch), `damage_enchanted_permanent_controller` (Feedback), `pump_enchanted_creature` (Shiv's), `buff_opponents_creatures` (Turn the Tide, re-use Hysterical Blindness), `channel` z ręki (Greater Tanuki, jak cycling), `costReduction` per +1/+1 (Deepwood), `cantAttackYou` (Vow).

**Fix B23 UI (początek sesji):** `closeBotMoveModalPause` → `rerender()` + `rerender()` wstrzykuje `▶ Wznów grę bota` gdy `botPausePending`; `openCardFullscreenByCardId` nie chowa `bot-move` (fullscreen nad modalem), `closeCardFullscreen` przywraca modal.

Weryfikacja: `npm test` **1084/1084** (+17: 7 engine-batch23 + 10 kart + 3 art-ids), `npm run build` 49 modułów / 1172.0 kB, `withArt.length === 158` (148→158).

## Sesja 2026-08-08 — M54 Audyt Batch 23 + UX kosztów many (PR `arena/019fe265-mtg`, 2026-08-08)

Dwa tematy właściciela: (A) audyt implementacji Batch 23 („nie mam zaufania
do agenta, który to kodował") i (B) UX — koszty many łamiące się w HTML.

**Audyt A (runtime, nie asercje definicji):** skrypt end-to-end przez
cast/activate/triggers → 8/11 przed fixami. Trzy realne bugi silnika, które
przeszły przez testy sprawdzające tylko istnienie pól:

1. **Channel (Greater Tanuki)** — `activateChannel` w scope `activateCycling`,
   wołana z `activateAbility` → `ReferenceError` przy aktywacji; do tego
   nieistniejący event `card_searched` (usunięty). Fix: funkcja modułowa.
2. **Feedback („Enchant enchantment")** — nie do rzucenia: 4 miejsca
   (castAuraSpell, resolveAuraSpell, attachAuraToCreature, SBA
   removeIllegalAttachments) wymagały stwora. Fix: wspólny `isLegalAuraHost`.
3. **Vandalize („Destroy both")** — `destroy_permanent` ignorował
   `targetIndex` → land nigdy nie ginął. Fix: konwencja
   `targets[effect.targetIndex ?? 0]`.

**UX B:** koszty many jako niełamliwe grupy — `manaSymbolsHtml` owija
sekwencję ikon w `.ms-group` (inline-block + nowrap); poprzednia łatka M51
„C" zapobiegała łamaniu WEWNĄTRZ ikony, nie MIĘDZY ikonami. Bez zamiany
ikon na litery.

**Korekta danych (uwagi właściciela):** sety Greater Tanuki (NEO) i Turn the
Tide (MBS) pozostają zgodne z listą właściciela — poprawiono pliki Scryfall
i imageUri do właściwych wydruków (NEO #189 / MBS #35), zamiast zmieniać sety.

**Testy.** `test/audit-batch23-fixes.test.js` (12 behawioralnych),
`test/mana-icons-group.test.js` (7), `test/attachment.test.js` rozszerzony
(11). Weryfikacja: `npm test` **1104/1104**, `npm run build` 49 modułów /
1175.5 kB. Plan: `docs/plans/PLAN_2026-08-08-audit-b23-mana-ux.md`.
Handoff: `docs/setup/HANDOFF_2026-08-08f.md`.

## Sesja 2026-08-08 — M55 Batch 24: 10 realnych kart (PR `arena/019fe265-mtg`, 2026-08-08)

Kolejka właściciela: Faceless Butcher (TOR), Unbreakable Bond (IKO),
Spinewoods Paladin (OTJ), Tome Scour (M11), Goblin Battle Jester (M13),
Brawler's Plate (M15), Glitch Ghost Surveyor (DFT), Mystic Sanctuary (ELD),
Willbender (DD2), Scion Summoner (OGW). Scryfall pobrane z parametrem set=
(lekcja M54), artId ze słownika.

**Nowe mechaniki:** plot dla permanentów (pierwsza karta z plotem), linked
exile stwora, lifelink counter (CR 122.1b), speed/start-your-engines/max
speed (DFT), turned_face_up + redirect celu czaru (Willbender), sanctuary
lands. **Root cause:** warunki triggerów z kontekstem zdarzenia przy decyzji
celu, detach załączników przy usuwaniu tokenów i osieroconych aur, zachowanie
oryginalnych abilities przy face-down (morph).

**Karty w taliach:** red +Goblin Battle Jester/Brawler's Plate, black
+Faceless Butcher/Unbreakable Bond, green +Spinewoods Paladin/Scion Summoner,
graveyard +Tome Scour, azorius +Willbender/Glitch Ghost Surveyor/Mystic
Sanctuary. Weryfikacja: `npm test` **1121/1121**, build 49/1219.6 kB,
benchmark 2160 meczów 0 crashy. Plan:
`docs/plans/PLAN_2026-08-08-batch24-cards.md`.

## Sesja 2026-08-08 — M56 srebrna odznaka: 5 błędów vs zasady MtG (PR `arena/019fe265-mtg`)

Drugi przegląd mechanik (po brązowej odznace) wykrył 5 naruszeń reguł:
(1) goad wygasał w cleanup zamiast trwać do następnej tury goadującego
(CR 701.38c), (2) aury ignorowały hexproof (CR 702.11b), (3) lifelink nie
działał na obrażeniach niecombat (CR 702.15), (4) Curse of the Pierced Heart
ignorował tarcze prewencji (CR 615), (5) damage_dealt niósł kwotę przed
prewencją — delirium przeszacowywało obrażenia (CR 119.3). Wspólny helper
`dealNonCombatDamage` (prewencja tarcz+filtr, event z kwotą zadaną, infect,
lifelink) + `goadedUntilTurn` + `auraTargetHexproof`. Weryfikacja:
`npm test` **1126/1126**, build 49/1221.5 kB, benchmark 1080 meczów 0 crashy.
Testy: `test/engine-silver-badge.test.js`.

## Sesja 2026-08-08 — M57 złota odznaka: 5 błędów vs zasady MtG (PR `arena/019fe265-mtg`)

Trzeci przegląd mechanik: (1) limit ręki w cleanup tylko dla aktywnego gracza
(CR 514.1), (2) combat damage_dealt z kwotą po prewencji + brak triggerów przy
0 zadanych (CR 119.3), (3) buffy „do końca tury" jako efekty ciągłe —
`untilEndOfTurnBuffs` obejmują stwory wchodzące później (CR 611.2c),
(4) opcjonalne płatności triggerów liczą manę produkowalną (canPayTrigger),
(5) dobranie z pustej biblioteki przez efekt karty kończy grę (CR 104.3c).
Weryfikacja: `npm test` **1131/1131**, build 49/1225.8 kB, benchmark 1080
meczów 0 crashy. Testy: `test/engine-gold-badge.test.js`.

## Sesja 2026-08-09 — M58 platynowa odznaka: 5 błędów vs zasady MtG (PR `arena/019fe265-mtg`)

Czwarty przegląd mechanik (po brązowej/srebrnej/złotej odznace) — 5 naruszeń
reguł, wszystkie naprawione root-cause:

1. **CR 510.1c/702.19b** — przydział obrażeń combat (lethal/trample)
   uwzględniał prewencję: tarcze Withstand ODEJMOWANO od lethal, filtr
   „prevent all damage this turn" (Ethersworn Shieldmage) zerował lethal.
   Zasady: przy sprawdzaniu lethal IGNORUJE się efekty zmieniające faktycznie
   zadane obrażenia — trample 5/5 vs 3/3 z tarczą 2 szło na gracza 4 zamiast
   2 (bloker dostawał 0 zamiast 1 obrażenia).
2. **CR 119.3** — zdarzenia `damage_dealt` niosły kwotę PRZED prewencją w
   ścieżkach combat atakujący→bloker, bloker→atakujący oraz
   `damage_to_controller` (niespójność z konwencją złotej odznaki);
   zdarzenia `damage_prevented` trafiają teraz do strumienia wyniku komendy.
3. **CR 701.27a** — proliferate nie mógł celować w graczy ze znacznikami
   trucizny: czytał/pisał `player.counters.poison` zamiast `player.poison`
   (pole, które czytają SBA i `addPoisonCounters`).
4. **CR 401.4** — `mill_from_bottom` brał ostatni element WSPÓLNEJ listy
   biblioteki zamiast spodu biblioteki GRACZA-CELU (Cellar Door młynował
   kartę drugiego gracza po scry/mulligan-bottom pierwszego).
5. **CR 108.3/400.7** — `bounce_permanent` zwracał permanent na rękę
   DOTYCHCZASOWEGO KONTROLERA zamiast WŁAŚCICIELA (Jill, Lunar Rejection;
   `ownerId` już śledzone od Trostani).

Weryfikacja: `npm test` **1139/1139**, build 49/1228.5 kB, benchmark 1080
meczów 0 crashy (heuristic 88.1% vs random / 63.1% vs aggro — progi
0.78/0.57 utrzymane). Testy: `test/engine-platinum-badge.test.js` (8 testów);
zaktualizowany `test/engine-batch22.test.js` (proliferate: pole poison).
Plan: `docs/plans/PLAN_2026-08-09-platynowa-odznaka.md`.


## Sesja 2026-08-09 — M59 Batch 25: 10 realnych kart (PR #37, 0afe5a4)

Dziesięć realnych kart z kolejki właściciela — Scryfall pobrane **z parametrem `set=`** (lekcja M54) i `imageUri` zgodne z danymi (ADR 0010 §2a). Plan: `docs/plans/PLAN_2026-08-09-batch25-cards.md`.

**Karty:** Trestle Troll (RTR, 1/4 BG defender/reach + regenerate {1}{B}{G}), Lab Rats (STH, sorcery buyback), Anthem of Champions (FDN, anthem +1/+1), Goblin Deathraiders (ALA, 3/1 BR trample), Fertile Thicket (BFZ, land entersTapped + ETB reveal top 5), Reassembling Skeleton (M19, z grobu {1}{B} tapped), Idyllic Grange (ELD, Plains warunkowy + ETB licznik), Deadly Recluse (M10, 1/2 G reach/deathtouch), Benevolent Blessing (CMR, aura flash + choose color + protection), Springbloom Druid (MH1, ETB sacrifice-search 2 basic lands).

**Nowe mechaniki engine (generyczne, ADR 0002):**
- **Buyback CR 702.26** (Lab Rats): dopłata {4}; po rozstrzygnięciu karta wraca na rękę zamiast do grobu (`pendingSpellReturnToHand`).
- **Protection from color CR 702.16** (Benevolent Blessing): `protectionFromColors`, wybór koloru `pendingColorChoice` + `resolve_color_choice`, filtry targetowania/blokowania, prewencja obrażeń, odczepianie nielegalnych załączników.
- **Conditional entersTapped** (Idyllic Grange): `minOtherPlains` — wchodzi tapped chyba że kontroler ma ≥3 inne Plains (self nie liczy).
- **ETB reveal top N** (Fertile Thicket): `pendingFertileThicket` — obejrzyj top 5, wybierz 0-1 basic land na top, reszta na bottom (opcjonalny lookup).
- **ETB sacrifice-search** (Springbloom Druid): `pendingSpringbloom` — opcjonalnie poświęć land, jeśli tak → search up to 2 basic lands tapped.
- **Static anthem `all_creatures_you_control`** (Anthem of Champions): `staticBonuses` zakres rozszerzony.

**Root cause / pułapki:** buyback wraca PO rozstrzygnięciu; protection kierunek (atakujący vs bloker); Idyllic liczy OTHER Plains; „up to two” → 0/1/2; flash aury sprawdzane jak instant.

**Testy:** `test/real-cards-batch25.test.js` (11 testów end-to-end + Scryfall sanity + determinizm), `tools/collection-art-ids.csv` +10, talie singleton zaktualizowane. **Exit:** `npm test` **1153/1153**, build **49 modułów / 1252.9 kB**, benchmark 1080 meczów 0 crashy (heuristic 87.2% vs random / 71.4% vs aggro).

## Sesja 2026-08-09 — M60 UI A–F: choice grouping + obrazy + bot modal (PR #37, 0afe5a4)

Sześć poprawek UX zgłoszonych po Batch25 (bez zmian engine poza `choiceRequestGroupKey`):

**A.** `choiceRequestGroupKey` grupuje WSZYSTKIE `resolve_*` (nie tylko `resolve_trigger_target`) — modal pokazuje „wybierz cel / poświęć / etc.” zamiast losowej nazwy wariantu.
**B.** Klik obrazu karty w menu kontekstowym otwiera fullscreen.
**C.** 6 poprawionych `imageUri`: Wormfang Newt, Courage in Crisis, Enter the Enigma, Healer of the Glade, Raise the Alarm, Selesnya Charm — zgodne ze Scryfall.
**D.** Modal „Ruch przeciwnika” filtrowany flagą `isBotAdvancing` — ETB ludzich czarów nie trafia do listy bota (`noteBotMove`).
**E.** Badge aury/equipment pokazują nazwę gospodarza (`Aura → Host`).
**F.** ETB Kor Cartographer (i wszystkie `resolve_trigger_target`) grupowane do modala wyboru zamiast surowych nazw funkcji.

Weryfikacja: `npm test` **1153/1153**, build **49 modułów / 1259.2 kB**, benchmark 1080 meczów 0 crashy.

## Sesja 2026-08-09 — M61 B2-w2 lookahead infra (PR #37, 0afe5a4, domyślnie OFF)

Infrastruktura lookahead bota (B2) — wyłączona domyślnie (~4× wolniej), włączana `createHeuristicBot({ lookahead: 1 })`:

1. **evalView:** jakość stwora (keywords: flying/deathtouch/lifelink/trample/vigilance/menace/first_strike), evasion power, presja library ≤5, skalowanie przewagi życia.
2. **simpleChoice polityka przeciwnika:** gra landy, rzuca stwory, blokuje jeśli zabija, rozstrzyga decyzje pending — realistyczniej niż pełny greedy.
3. **LOOKAHEAD_EVAL_THRESHOLD** 2 → 1.
4. **Wiring:** `makeSimulate(state)` przekazywane jako `helpers.simulate` do `bot.chooseCommand` (wcześniej brak — lookahead nigdy nie był wołany).

Benchmark z lookahead **włączonym** (2 seedy, 540 gier vs random/aggro): vs random **84.0%** (+5.0 p.p. vs 79.0% bez), vs aggro **80.0%** (+34 p.p. vs 46.0% bez — poprzedni simple greedy blokował optymalnie i psuł ataki). Domyślnie OFF: pełny B0 1080 meczów **87.2%/71.4%** (progi 0.78/0.57).

## Sesja 2026-08-09 — M62 brązowa odznaka po Batch25: 5 błędów vs MtG (PR #37, 0afe5a4)

Drugi przegląd po Batch25 (brąz):

1. **CR 702.16a — protection a obrażenia (DEBT D):** `markDamage` nie sprawdzał `isDamagePreventedByProtection` — obrażenia od chronionego koloru przechodziły. Fix: sprawdzenie kolorów źródła vs `effectiveProtectionFromColors`.
2. **CR 702.16b — protection a odczepianie:** `removeIllegalAttachments` nie odczepiał istniejących aur/equipment chronionego koloru (wyjątek „your own” z Benevolent błędnie uogólniony). Fix: odczepia wszystkie, `effectiveProtectionFromColors` przeniesione z `permanents.js` do `attachments.js` (cykl importów).
3. **CR 514.3a — cleanup bez pętli:** gdy triggery/SBA odpalą w cleanup, dodatkowy cleanup nie następuje — udokumentowane jako jawne ograniczenie (brak karty w katalogu tego potrzebującej).
4. **declareBlockers a protection:** `canBlock` tylko w ofercie UI, brak walidacji w `execute`. Fix: walidacja w `declareBlockers`.
5. **Fertile Thicket „you may look”:** nie było opcjonalne — teraz gracz może zrezygnować (skip) lub obejrzeć i wybrać 0/1.

Weryfikacja: `npm test` **1153/1153**, build **50 modułów / 1268.3 kB** (50 przez rozdział `attachments.js`), benchmark 1080 0 crashy.

## Sesja 2026-08-09 — M63 srebrna odznaka po Batch25: 5 błędów vs MtG (PR #37, 0afe5a4)

Trzeci przegląd po Batch25 (srebro):

1. **CR 702.136 — plot „later turn”:** brak kontroli `plottedAtTurn` — plotted karta dała się rzucić w tej samej turze. Fix: `plottedAtTurn` + `state.turn.number > plottedAtTurn` w `castPermanent`/`legalCommands`.
2. **CR 702.16a — protection w combat:** `markDamage` wołane bez `sourceId`, więc ochrona nie blokowała obrażeń atakujący→bloker i bloker→atakujący. Fix: `sourceId` przekazywane.
3. **CR 702.16a — protection blocking kierunek:** `canBlock` + `declareBlockers` sprawdzały ochronę BLOKERA vs kolory atakującego — odwrotnie względem CR („can't be blocked by [quality] creatures” — sprawdza się ochronę ATAKUJĄCEGO vs kolory blokera). Fix: `attackerProt` vs `blockerColors`.
4. **CR 702.16a — protection w non-combat:** `dealNonCombatDamage` nie sprawdzał ochrony. Fix: check przed filtrem.
5. **CR 702.16b — protection odczepianie własnych:** wyjątek „nie zdejmuj własnych aur/equipment” dotyczył tylko Benevolent Blessing, nie ogólnej reguły. Fix: `removeIllegalAttachments` zdejmuje WSZYSTKIE załączniki chronionego koloru.

Weryfikacja: `npm test` **1153/1153**, build **50 modułów / 1269.6 kB**, benchmark 1080 0 crashy (87.2%/71.4%).



## Sesja 2026-08-09 — M64 Batch 26: 10 realnych kart (PR `arena/019fe7bf-mtg`)

Dziesięć realnych kart z kolejki właściciela — Scryfall pobrane **z parametrem `set=`** (lekcja M54) i `imageUri` zgodne z danymi (ADR 0010 §2a). Plan: `docs/plans/PLAN_2026-08-09-batch26-cards.md`.

**Karty:** Kabira Vindicator (ROE, 2/4 W level up {2}{W} sorcery, LEVEL 2-4 3/6 other +1/+1, LEVEL 5+ 4/8 other +2/+2), Great Furnace (MRD, artifact land {T}: Add {R}), Bomat Bazaar Barge (KLD, 5/5 Vehicle ETB draw + Crew 3), Index (APC, sorcery {U} look top 5 any order), Bladed Sentinel (MBS, 2/4 {W}: vigilance), Might of the Masses (2XM, instant {G} pump +1/+1 per creature you control), Magic Damper (FIN, instant {U} +1/+1 hexproof untap), Hecteyes (FIN, 1/1 ETB each opponent discards 1), Carapace Forger (SOM, 2/2 metalcraft +2/+2), Lurking Green Dragon (CLB, 4/4 flying cant attack unless defender has flying).

**Nowe mechaniki engine (generyczne, ADR 0002):**
- **Level Up CR 702.86** (Kabira): activated {2}{W} sorcery dodaje level counter, static progi minLevel/maxLevel (2-4 i 5+) modyfikują self P/T (+1/+2 i +2/+4) i anthem other_creatures (+1/+1 / +2/+2) via `staticConditionHolds` + `permanents.effectivePower`.
- **Index** (APC): `pendingIndex` + `resolve_index_choice` (permutacja top 5, blokuje jak scry, kończy `pendingSpell`).
- **pump_by_creature_count** (Might): +1/+1 per creature you control (liczone w effects).
- **discard_each_opponent** (Hecteyes): ETB każdy przeciwnik odrzuca 1 (pendingDiscard, 1v1 jeden).
- **Attack restriction** (Lurking): `cantAttackUnlessDefenderHasFlying` (static + `isLegalAttacker` check defender's flying via `effectiveKeywords`).
- **Artifact land** (Great Furnace): `MANA_SOURCE_MAP` R + type Artifact Land (liczy się dla metalcraft).

**Talie:** singleton 9 talii — azorius +Kabira/Bladed, green +Might/Carapace/Lurking, black +Hecteyes, red +Great Furnace/Bomat (16 landów: 15 Mountains + Great Furnace), spellslinger +Index/Magic Damper (hunter seeds przelosowane). **Testy:** `test/real-cards-batch26.test.js` (14 testów), aktualizacje `art-ids` 178→188, `repo-decks` round-trip + red 45→47, `table-session` hunter seeds (endure 1→2, delirium 19→1, graveyard-top 2→5). **Exit:** `npm test` **1167/1167**, build **50 modułów / 1284.3 kB**, benchmark 1080 0 crashy (progi 0.78/0.57).

## Sesja 2026-08-09 — M65 audyt Batchu 26: 4 błędy vs MtG + crash pełnego B0 (PR `arena/019fe7ec-mtg`)

Na zlecenie właściciela („karty mają być w 100% zgodne z MtG bez uproszczeń i ograniczeń")
przeprowadzono audyt Batchu 26 sondą behawioralną (nie testami definicyjnymi — wzorzec
M54). Plan: `docs/plans/PLAN_2026-08-09-audyt-b26.md`.

1. **Crew = instant (CR 701.36)** — Bomat Bazaar Barge (B26) i Irontread Crusher (B21)
   miały `timing: 'sorcery'` bez „Activate only as a sorcery" w Oracle; crew nie działało
   w turze przeciwnika ani w odpowiedzi na czar. Fix: domyślne 'instant'.
2. **Kolorowe koszty zdolności (CR 118.2)** — zagnieżdżone `colors: [['W']]` w 4
   definicjach (Kabira, Bladed, Trestle, Skeleton) łamały dopasowanie pipów → zdolności
   NIGDY nie były oferowane ani aktywowalne (martwe mechaniki na kartach `supported`).
   Fix: płaskie `colors: ['W']` / `['B','G']` (konwencja M45).
3. **Index (APC)** — reorder działał w engine, ale gracz-człowiek nie widział top 5
   (brak `pendingIndex` w PlayerView) ani nie mógł przestawić kart. Fix: pendingIndex
   w widoku (FoW jak scry), wizard kolejności w UI, etykiety i polskie logi.
4. **Face-down bez keywordów (CR 708.2)** — zakryty stwór (morph) zachowywał keywordy
   (np. flying) — błędnie odblokowywał Lurking Green Dragon i blokował flyery.
   Fix: `effectiveKeywords` → [] dla faceDown.
5. **Crash pełnego B0 (pre-existing)** — transform wilkołaka na LKI stub (źródło umarło
   na stosie triggera) crashował „Obiekt bez transformTo". Fix: no-op dla źródła poza
   polem bitwy (CR 608.2b).

**Weryfikacja:** `npm test` **1182/1182**, build **50 modułów / 1289.5 kB**, **pełne B0
13500 meczów / 0 crashy** — heuristic **92.0% vs random, 65.5% vs aggro**, aggro 94.2%
vs random (progi 0.78/0.57 utrzymane; wzrost vs 90.4%/61.8% po M64 dzięki działającym
zdolnościom kolorowym/crew). Testy: `test/audit-batch26-fixes.test.js` (13).

## Sesja 2026-08-09 — M66 UX walki i many: uwagi właściciela A/B/C/D/R (PR `arena/019fe7ec-mtg`)

Na uwagi z testów na iPadzie + 2 błędy wykryte rozpoznaniem (plan
`docs/plans/PLAN_2026-08-09-ux-walka-i-many.md`):

- **A** — spacja przed `)` w kosztach akcji (flex gap na `.action` z ikonami many) → `gap:0` + margin na diament.
- **A2** — MANA_COSTS kończyło się na Batchu 24 (39 kart): walidacja kolorów pominięta (Might {G} za {U}!) + etykiety bez ikon → uzupełnione ze Scryfall + strażnik.
- **B** — atakujący/blokujący: koniec list kombinacji — wizard z przełącznikami (goad/menace/cantBlockAlone pilnowane).
- **C** — log walki gubił nazwy (`?`) — zdarzenia z cardId (LKI); poprawione mapowanie blokerów.
- **D** — pojedynczy bloker dostaje pełną moc (3/3 vs 1/1 = 3, nie 1).
- **R** — rozdzielanie obrażeń przy wielu blokerach/trample = decyzja gracza (`pendingDamageAssignment`, 1 wariant dla botów, wizard bez kombinacji).
- **Fixy B0** — kolejność pending (triggery przed przydziałem obrażeń), `remove_counter` jako efekt = no-op przy braku licznika (Kappa ×2).

**Weryfikacja:** `npm test` **1197/1197**, build 50 modułów / 1317.2 kB, **pełne B0
13500 meczów / 0 crashy** — heuristic **91.7% vs random, 65.6% vs aggro**, aggro
93.7% (progi 0.78/0.57 utrzymane). Testy: `test/audit-batch26-fixes.test.js` (23),
`test/choice-request-ui.test.js` (wizardy), `test/card-data.test.js` (strażnik).

## Sesja 2026-08-09 — M67 Batch 27: 10 realnych kart (PR `arena/019fe7ec-mtg`)

Kolejka właściciela: Civilized Scholar // Homicidal Brute (ISD DFC),
Battle-Rattle Shaman (M21), Jeskai Devotee (TDM), High Stride (BLB),
Inspiration (8ED), Minotaur Abomination (M14), Guildsworn Prowler (CLB),
Giant Spider (M19), Scroll Thief (M13), Force Away (KTK). Scryfall z `set=`
przez fetch_page (api zablokowane), artId/plan ze słownika, MANA_COSTS
uzupełnione (strażnik M66).

Nowe mechaniki: **draw_then_discard z transformem** (Scholar — odrzucenie
stwora → untap+transform na Homicidal Brute), **didntAttackThisTurn**
(Homicidal Brute end step), **draw_cards applyTo target** (Inspiration),
**dies „wasn't blocking"** (Guildsworn — LKI wasBlocking w extra),
**ferocious draw/discard** (Force Away — pendingOptionalDraw tak/nie),
**add_mana z kolorami** (Jeskai {1}: add U/R/W once). Reuse:
beginning_of_combat+target, flurry, reach, combat_damage_to_player.

Talie: spellslinger +5, red +1, black +2, green +2. Testy: 16 behawioralnych
(`test/real-cards-batch27.test.js`), hunter seeds przelosowane.
**Weryfikacja:** `npm test` **1213/1213**, build 50 modułów / 1336.1 kB,
**pełne B0 13500 / 0 crashy** — heuristic 63.1% vs aggro / 92.3% vs random
(progi 0.78/0.57 utrzymane).

## Sesja 2026-08-10 — M68 daybound/nightbound: globalny znacznik dnia/nocy (PR `arena/019fe7ec-mtg`)

Na zgłoszenie właściciela („czy daybound jest w engine? globalne mechanizmy spójne"):
- **Inicjatywa + Lochy już były** (M24) — globalna karta The Undercity na stole
  (img ze Scryfall), znacznik inicjatywy, pokoje per gracz.
- **Daybound/nightbound dodane (CR 708.9)**: `state.dayNight` (globalny znacznik jak
  inicjatywa), `setDayNight` transformuje daybound↔nightbound in-place, wyzwalacze
  (wejście daybound → dzień; rzut czaru przy daybound na stole → noc; upkeep aktywnego
  bez czaru w jego poprzedniej turze → dzień), wejście nightbound w nocy.
- **Karta Day//Night na stole** (img ze Scryfall TVOW 21, front/back wg designation) —
  spójna z lochami (renderDayNight).
- Civilized Scholar to zwykły transform DFC (ISD), NIE daybound — nietknięty przez
  day/night (test).
- Testy: `test/daybound-nightbound.test.js` (9, syntetyczne); renderDayNight w table-ui.
- **Weryfikacja:** `npm test` **1223/1223**, build 50 modułów / 1343.2 kB, benchmark
  1080 0 crashy. Mechanika generyczna — realne karty daybound wejdą z przyszłymi batchami.

## Sesja 2026-08-10 — M69 Batch 28: 9 realnych kart (PR `arena/019fe7ec-mtg`)

Kolejka właściciela: Silumgar Butcher (DTK), Relic Robber (ZNR), Flurry of Wings
(ARB), Expose to Daylight (RNA), Etherium Abomination (ARB), Awaken the Bear (KTK),
Security Rhox (SNC), Dreams of Steel and Oil (BRO), Tenth District Veteran (RNA).
**Moonscarred Werewolf zostaje tyłem DFC (limited)** — decyzja właściciela (a):
klasyczny transform upkeep i day/night to osobne mechaniki MtG.

Nowe mechaniki: **Exploit** (opcjonalne poświęcenie przy wejściu + trigger
„exploits" z celem), **Unearth** (z grobu z haste, exile na end step i przy
odejściu), **koszt alternatywny ze Skarbów** (Security Rhox — tylko mana ze
Skarbów), **reveal + wybory** (Dreams — ręka i grób, obowiązkowe), **token u
ofiary** (Relic Robber — Goblin Construct cantBlock + upkeep damage), **tokeny
wg liczby atakujących** (Flurry), cele czarów artifact_or_enchantment i player
opponent. Fix: transfer_counters_on_dies no-op przy celu poza polem bitwy
(CR 608.2b).

Talie: black +3, red +1, green +2, azorius +2, tokens +1. Testy: 13 behawioralnych
(`test/real-cards-batch28.test.js`), hunter seeds przelosowane.
**Weryfikacja:** `npm test` **1236/1236**, build 50 modułów / 1375.7 kB,
**pełne B0 13500 / 0 crashy** (heuristic 78.6% ogółem, 58.3% vs aggro — progi
0.78/0.57 utrzymane).

## Sesja 2026-08-10 — M70: UX wyborów i etykiet + Idyllic Grange entersTapped (PR #40 `arena/019febbd-mtg`)

Uwagi właściciela z testów na iPhonie (Pages, screenshoty): generyczne etykiety
grup wyborów + surowy HTML many w modalu aury (A), czarne nazwy kart na ciemnych
chipach Surveil (B), Idyllic Grange nietapnięta przy <3 innych Plains (C), etykieta
akcji z kosztem many łamana na 3 kolumny (D).

Engine (C, sonda Batchu 25): `idyllic-grange` dostała brakujące `entersTapped:
true` obok warunku; trigger countera ożywiony (`enters` → `enter_battlefield`,
`requiresTarget` wewnątrz triggera). Ten sam martwy event `'enters'` naprawiony
w `fertile-thicket` i `springbloom-druid`; Fertile ogląda wierzch WŁASNEJ
biblioteki (CR 401.4, filtr kontrolera na wspólnej liście) z permutacyjnym
`bottomOrder`; Springbloom „up to two" to dwie decyzje gracza (`queueSearchChoice`
na top-level effects.js + `chain` w resolve_search_choice). Boty aggro/heuristic
nauczone `resolve_fertile_thicket` / `resolve_springbloom`.

UI: przyciski grup opisują CO wybieramy („Wybierz: Mulligan (2 opcje)", „Aura:
Benevolent Blessing (3 opcje)"), odmiana opcja/opcje/opcji, nagłówek modala =
ten sam opis; opcje modala przez innerHTML (ikony many); etykieta akcji w jednym
`span.action-label` (koniec kolumn w flexie); `.look-wizard-card` jasne.

Testy: batch25-etb-enters-fix (10 behawioralnych + 2 strażniki registry),
choice-request-ui (etykiety/innerHTML/intro), table-ui (jeden span.action-label),
look-wizard-contrast. **Weryfikacja:** `npm test` **1255/1255**, build 50 modułów /
1385.2 kB, quick B0 1080 0 crashy (heuristic 79.2% ogółem; 61.4% vs aggro / 96.9% vs random), **pełne B0 13500 0 crashy (heuristic 78.6% ogółem; 63.4% vs aggro / 93.8% vs random)** — progi 0.78/0.57
utrzymane.


## Sesja 2026-08-11 — M71: srebrna odznaka — 4 twarde błędy vs CR + zgłoszenia A–D (PR `arena/019fed61-mtg`)

Łowy błędów jak Sherlock (metoda RED→GREEN, strażniki formy, nie definicji).
Plan: `docs/plans/PLAN_2026-08-11-lowy-srebne-odznaka.md`.

**Znalezione i naprawione błędy vs CR:**
1. **CR 510.4/510.5 (combat)** — `resolveCombatDamage` używał `startPass =
   resume.pass` (boolean) jako INDEKSU `passes=[true,false]`; `passes[true]`=
   `passes[1]`=false pomijało przebieg first strike przy wznowieniu decyzji
   rozdzielania (first/double strike z trample lub wieloma blokerami nie
   zadawało), a wznawianie przebiegu zwykłego ponownie rozdawało obrażenia
   niezablokowanych atakujących (**objaw D: „walka rozstrzygnęła się dwukrotnie"**).
   Fix: numeryczny startIndex (true→0, false→1).
2. **CR 702.16d+702.15 (combat)** — lifelink/deathtouch liczyły `dealt` SPRZED
   prewencji protection w obu ścieżkach combat; kontroler źródła z lifelink
   zyskiwał życie za zapobiegnięte obrażenia (osiągalne: aura z flash
   Benevolent Blessing po deklaracji bloków). Fix: kwota po prewencji protection.
3. **CR 702.16b (celowanie)** — check protection-celowania w `validateTargets`
   brał kolory GRACZA (zawsze puste) → martwy; czar/zdolność źródła
   chronionego koloru mógł celować w chronionego permanentu. Fix: `sourceColors`
   (kolory źródła) przez wszystkie call-site validateTargets/collectLegalTargets.
4. **CR 702/704 (log)** — `creature_destroyed` nie niósł `cardId`; log walki
   pokazywał **„? ginie"** (objaw C). Fix: cardId w evencie + render przez
   nameOf (jak permanent_destroyed w M70).

**Zgłoszenia właściciela A–D z testów (naprawione):**
- **A (UI)** — karta Undercity (inicjatywa) nie dała się otworzyć na pełnym
  ekranie. Fix: `renderUndercity` klikalna + `openUndercityFullscreen()` w main.js
  (renderCardFullscreen printu lochu).
- **B (bot)** — boty „skipowały szukanie" Secret Entrance (Undercity, pokój 1):
  `resolve_search_choice` miał domyślną punktację 0, a rezygnacja (`found:null`)
  jest pierwszą ofertą. Fix: heuristic `case 'resolve_search_choice'` (znajdź >
  fail-to-find, land premiowany) + aggro (found != null).
- **C (log)** — patrz bug 4 wyżej.
- **D (engine)** — patrz bug 1 wyżej (ten sam root cause co first-strike resume).

Nowe testy: `test/bug-hunt-2026-08-11.test.js` (1a–1c, 2a–2b, 3, 4, 5, 6, 7) +
`table-ui.test.js` (renderUndercity klik). Po zmianie zachowania bota hunter seed
delirium w table-session przelosowany 25→48.

**Weryfikacja:** `npm test` **1292/1292**, build 50 modułów / 1402.0 kB,
quick B0 1080 **0 crashy** (heuristic 74.3% ogółem; 53.6% vs aggro / 95.0% vs random),
pełne B0 13500 (w toku — wynik w opisie PR).


## Sesja 2026-08-11 — M72: Batch 29 (10 kart) + generyczne rozdzielanie obrażeń (PR `arena/019fed61-mtg`)

Kolejka właściciela (plan `docs/plans/PLAN_2026-08-11-batch29-cards.md`). Scryfall
z `set=` przez fetch_page; artId/plan ze słownika; MANA_COSTS 200→210.

**Karty:** Mournful Zombie (APC), Necrosquito (ONE), Curiosity (ISD), Veiled
Ascension (MKC), Angelic Benediction (ALA), Frontline War-Rager (EOE), Lash of the
Balrog (LTR), Fireball (JVC), Spread the Sickness (MBS), Warmaker Gunship (EOE).

**Nowe mechaniki engine (generyczne):** licznik oil (P/T z liczników, dies trigger),
licznik flying (CR 122.1b), trigger aury „deals damage to opponent", exalted +
attacks_alone, cloak (face-down 2/2 z biblioteki), sacrifice-or-pay (Lash),
end_step intervening-if tapped count, station + ETB damage wg artefaktów.

**Generyczne rozdzielanie obrażeń niecombat (CR 119.4):** `pendingDamageDistribution`
+ `resolve_damage_distribution` — gracz rozdziela X między cele (każdemu tyle, ile
chce; suma <= total). `queueDamageDistribution` (effects.js) — reużywalne dla
wszystkich przyszłych czarów/zdolności. Fireball: wybór X + celów przy rzucie, czar
czeka na stosie do decyzji; wizard UI, default u botów = równy podział.

**FIX deadlocka benchmarku:** `pendingOptionalTrigger` (Curiosity may-draw, Veiled
cloak) jest PRZED celami triggerów w firstPendingDecisionPlayerId i enumeracji
(execute źródłem prawdy) — koniec `optional_trigger_unresolved` przy jednoczesnych
decyzjach.

**Weryfikacja:** `npm test` **1308/1308**, build 50 modułów / ~1443.6 kB, quick B0
1080 **0 crashy**, **pełne B0 13500 0 crashy (heuristic 78.4% ogółem; 62.7% vs aggro /
94.1% vs random)** — brak regresji vs M71; progi 0.78/0.57 utrzymane.

## Sesja 2026-08-11 — M73: audyt PR #41 (M71+M72+M72b) — 9 błędów naprawionych (PR #42 `arena/019ff0e1-mtg`)

Pełny audyt behawioralny ostatniego scalonego PR na zlecenie właściciela
(„nie ufam jakości poprzedniego agenta — sprawdź i popraw"). Sonda end-to-end na
żywym engine (wzorzec M54/M65 — testy zachowania, nie definicji). Plan:
`docs/plans/PLAN_2026-08-11-audyt-pr41.md`. **9 błędów naprawionych u root
cause (RED→GREEN), 0 maskowania:**

1. **Fireball (JVC) — podział obrażeń niezgodny z Oracle.** Oracle: „deals X
   damage divided evenly, rounded down" + „{1} more for each target beyond the
   first". Było: gracz rozdzielał X dowolnie (wizard + decyzja
   `resolve_damage_distribution`), a default bota rozdysponowywał resztę
   (wg Oracle reszta PRZEPADA). Jest: deterministyczny floor(X/n), reszta
   przepada; 0 celów i X=0 legalne („any number of targets"); protection od
   koloru czaru w walidacji; usunięta cała machineria free-distribution
   (pendingDamageDistribution, resolve_damage_distribution, wizard, wpisy
   protokołu/botów/UI) — jedyna karta używająca mechanizmu to Fireball.
2. **Angelic Benediction „attacks alone" — brak filtra kontrolera.** Cudza
   Benediction pompowała mojego stwora i dawała przeciwnikowi „you may tap"
   przy MOIM samotnym ataku. Fix: tryFire tylko gdy kontroler źródła ==
   kontroler atakującego (CR 702.82).
3. **Curiosity — tylko combat damage.** Oracle: „deals damage" (każde). Fix:
   wspólny hook combat + niecombat (`enchanted_creature_damage_to_opponent`).
4. **Veiled Ascension — flying counter tylko przy cloak.** Statyczna zdolność
   „face-down creatures you control enter with a flying counter" nie działała
   dla morph (Monastery Flock w azorius). Fix: wspólny helper
   `maybeAddFaceDownFlyingCounter` (cloak + resolvePermanentSpell) ORAZ
   `effectiveKeywords` dla faceDown zwraca keywordy z LICZNIKÓW (CR 122.1b;
   ruling cloak: „other effects can grant it characteristics") — licznik
   flying daje flying także zakrytemu; drukowane keywordy nadal zakryte
   (CR 708.2, testy D1–D3 zielone).
5. **Oil — nadmierna generalizacja.** `counterDelta` dodawał oil do P/T
   WSZĘDZIE; sam licznik nie daje P/T (daje go zdolność Necrosquito). Fix:
   statyczny pump `oil_counters` w staticBonuses + zdolność na Necrosquito.
6. **Protection — luka fixu M71 w ścieżce aury.** `castAuraSpell`/`legalAuraCasts`
   sprawdzały tylko hexproof (aura koloru X mogła zaczarować stwora z
   protection od X); brak rewalidacji w `resolveAuraSpell` (gospodarz zyskał
   protection na stosie → fizzle czystej aury, bestow jako stwór CR 702.103b).
7. **D-luki: zdolności aktywowane omijały stos.** (a) brak rewalidacji celów
   przy rozstrzyganiu zdolności ze stosu (Entrancing Lyre vs stwór, którego moc
   urosła ponad X w oknie odpowiedzi → fizzle CR 608.2b); (b) **equip** był
   sorcery-speed + poza stosem — wg CR 702.6a to aktywowana zdolność INSTANT
   speed na stosie (założenie po rundzie passów, cel rewalidowany); (c)
   **cycling/channel** — odrzut to koszt (przy aktywacji), dobranie/szukanie
   przy rozstrzyganiu (przeciwnik może odpowiedzieć); (d) **ninjutsu**
   (CR 702.48a) — koszty przy aktywacji, wejście zatapnięte i atakujące przy
   rozstrzyganiu.
8. **B8 sonda mechanik M72** — Necrosquito (artefakt/„another"), Veiled ETB,
   Warmaker station: wszystkie poprawne, utrwalone testami.
9. **B9 UI M72b** — E (właściciel w modalach) i F (badge „zaczarowana: X"/
   „wyposażona: X") utrwalone testami render.

**Weryfikacja reguły priorytetu (CR 117.3c):** po rzuceniu czaru / aktywacji
zdolności rzucający ZACHOWUJE priorytet („If a player has priority when they
cast a spell, activate an ability, or take a special action, that player
receives priority afterward") — może odpowiedzieć własnym instanitem na wierzch
stosu (LIFO), zanim przeciwnik dostanie priorytet. Engine to realizuje
poprawnie; wcześniejsze zgłoszenie w tej sesji („priorytet powinien przejść
dalej wg CR 117.4") było błędem interpretacyjnym i zostało wycofane. Testy
regresyjne B10 (engine + sesja + interakcja z ptaszkiem wyciszenia).

**Weryfikacja:** `npm test` **1334/1334** (było 1310; +24 nowe testy),
build **50 modułów / 1453.2 kB**, quick B0 1080 meczów 0 crashy, pełne B0
13500 — wynik w opisie PR #42 (progi 0.78/0.57).

## Sesja 2026-08-11 — M73b: UX A/B + feature „ptaszek wyciszenia opcji" (PR #42)

Uwagi właściciela z testów + feature request (po audycie M73):

- **A. Panel górny (wskaźnik tury)** — skrócone etykiety: „T." zamiast „Tura",
  „ż." zamiast „życia", „On" zamiast „Nieprzyjaciel"; faza bez „beginning"
  (dla kroków beginning pokazywana jest sama nazwa kroku: „Untap"/„Upkeep"/
  „Dobieranie"; fazy combat/ending → „Walka"/„—"); przy braku miejsca panel
  łamie wiersz (flex-wrap + border-radius 12px zamiast nowrap-pigułki).
- **B. Nakładka karty** (`.ovl-badges`) — każda informacja (obrażenia, choroba,
  liczniki, przypięte aury/equipmenty) w OSOBNYM wierszu (flex-direction:
  column) zamiast zlewać się w jeden rząd na ilustracji.
- **Feature: ptaszek wyciszenia opcji.** Opcje rzutów/aktywacji
  (cast_permanent/cast_spell/cast_cleave/cast_escape/cast_adventure/
  cast_adventure_creature/activate_ability/plot_card) w panelu „Twoje
  działania" mają checkbox „nie przerywaj auto-passu". Zaznaczona opcja jest
  pomijana przez `hasMeaningfulDecision` — auto-pass przewija okna, w których
  jedyną sensowną komendą jest wyciszona opcja (np. zdolność poświęcenia,
  której nie użyje się przez wiele tur). Inne opcje nadal przerywają;
  odznaczenie przywraca. Klucz opcji: `commandOptionKey` (type+objectId+
  abilityIndex+targets+xValue+modeIndex+buyback+payAltCost+bestow+faceDown+...);
  zbiór wyciszeń w pamięci strony (jak inne preferencje UI); generyczne komendy
  (pass, dobranie, ląd, deklaracje walki, resolve_*) bez ptaszka. Po zmianie
  zbioru sesja przewija grę (`recheckAutoPass`), gdy okno straciło wszystkie
  nie-wyciszone decyzje.
- **Fix (crash pełnego B0):** equip rozstrzygany ze stosu rzucał, gdy sam
  sprzęt zniknął w oknie odpowiedzi (LKI stub → attachEquipmentToCreature
  rzuca). Guard: źródło musi być nadal legalnym equipment na polu bitwy,
  inaczej fizzle (CR 608.2b) + test regresyjny.

Weryfikacja: `npm test` **1337/1337**, build **50 modułów / 1458.7 kB**,
pełne B0 13500 (cap 8000): **0 crashy, 0 niedokończonych** — heuristic
**79.2% ogółem (64.0% vs aggro / 94.4% vs random)**, aggro 64.7% — progi
0.78/0.57 utrzymane. Cap podniesiony 5000→8000: zdolności na stosie wydłużyły
grind-games (seed 1043 wiedzmin vs azorius kończył się deck-outem 2 tury po
capie 5000 — wzorzec M31).

## Sesja 2026-08-11 — M73c: brązowa odznaka — 5 błędów wykrytych żywym testerem stołu (PR #42)

Audyt „z perspektywy gracza" na prawdziwym artefakcie (`tools/table-tester`):
5 partii różnymi taliami. Znalezione i naprawione (RED→GREEN, +6 testów):

1. **„efekt." jako opis triggerów/zdolności na kaflach** — `describeEffect` miał
   fallback `'efekt'`; pełna mapa polskich opisów ~70 typów efektów (kafle
   pokazują „Gdy wejdzie na pole bitwy: poświęć ląd, szukaj 2 basic landów.").
2. **Surowe slugi efektów czaru** (`cant_be_regenerated_this_turn +
   destroy_permanent`) — `describeSpellEffects` używa wspólnych opisów
   („zniszcz + nie może być regenerowany"); fix znaków „+-" w pumpach.
3. **„cel: ? (Nieprzyjaciel)"** dla face-down celu (Expunge na morph) —
   `nameOfObject`/`commandLabel` zwracają „morph" dla obiektów faceDown
   (CR 708.2).
4. **„? — blokujący:"** w wizardze blokujących (face-down atakujący) —
   `objectName` zwraca „morph".
5. **Gołe „Koniec partii"** po zakończeniu — wskaźnik pokazuje
   „Koniec partii — wygrywa <gracz>".

Weryfikacja transkryptem testera: 0× „efekt.", 0× surowe slugi, 0× „cel: ?",
0× „? — blokujący"; „Stos — morph" dla zakrytego czaru. `npm test` **1347/1347**,
build **50 modułów / 1465.4 kB**.

## Sesja 2026-08-11 — M73d: srebrna odznaka — 10 błędów wykrytych żywym testerem stołu (PR #42)

Audyt „z perspektywy gracza": 10 partii różnymi taliami na prawdziwym
artefakcie (`tools/table-tester`). Naprawione (RED→GREEN, +7 testów):

1. **„efekt (undefined)"** na kaflach — puste `effect: {}` w zdolnościach
   statycznych/cyclyng (Anthem, Carapace, Kabira, Etherium Sculptor).
   Fix: opis pomija puste efekty; cyclyng/channel opisane jawnie.
2. **„: ."** — pusty opis triggera modalnego (Etherwrought Page — 3 tryby):
   `describeTriggered` obsługuje `modes`.
3. **Surowe typy celów** („cel: player"/„any_target") — `TARGET_TYPE_LABELS`.
4. **„rzuca Inspiration → cel: ?"** — cel-gracz jako „?" (log i stos): imię.
5. **„Trigger: X (you_cast_second_spell_each_turn)"** — surowe eventy
   triggerów: `TRIGGER_EVENT_LABELS` + render stosu.
6. **„aktywuje: Soulmender → cel: Soulmender"** — log „cel:" dla zdolności
   bez celu: event niesie targets tylko gdy zdolność ma cele.
7. **„zadaje 0 obrażeń"** w logu — pomijane (0 to brak obrażeń, CR 119.3).
8. **„choroba" na artefaktach/enchantmentach** — badge tylko dla stworów
   (CR 302.6).
9. **„wskazuje ? z ręki przeciwnika"** (Dreams reveal) — event niósł objectId
   zamiast cardId karty.
10. **„mieli 1 karty"** — odmiana `polishPlural` (1 kartę / 2 karty / 5 kart).

Weryfikacja transkryptem: 0× „efekt (undefined)", 0× surowe slugi celów,
0× „cel: ?", 0× bezcelowe „→ cel:", 0× „zadaje 0". `npm test` **1354/1354**,
build **50 modułów / 1471.0 kB**.

## Sesja 2026-08-11 — M74: Diamentowa odznaka — 16 błędów UX żywym testerem stołu (PR `arena/019ff280-mtg`)

Audyt „z perspektywy gracza" na prawdziwym artefakcie (`tools/table-tester/`,
35 partii × różne talie/seedy). Wzorzec M73c/M73d/M65 (objaw z transkryptu →
naprawa u ROOT CAUSE → test regresyjny). Plan:
`docs/plans/PLAN_2026-08-11-diamentowa-odznaka.md`.

**16 błędów naprawionych (wszystkie UI/etykiety/log — bot bez zmian):**
1. Log „X zostaje skontrowany (?)" — event `spell_countered` niósł tylko
   `counteredBy` (objectId czaru-kontrującego, który znika ze `state.objects`
   po rozstrzygnięciu). Fix: LKI `counteredByCardId` w evencie + log czyta po cardId.
2. Modal clash pokazywał surowe „p1-library-N" — `PlayerView.pendingClash.cards`
   niosło objectId, a etykieta czytała jak cardId. Fix: PlayerView konwertuje na
   cardId (odsłonięte karty clash są jawne).
3. „· ·"/„· · · ·" na kaflach — zdolności STATYCZNE (pump/condition/scope) bez
   opisu renderowały pusty string; `rulesText` sklejał bez filtra. Fix:
   `describeStatic` + filtr pustych opisów (Veiled, Kabira, Ember Beast…).
4. Etykieta aktywacji dublowała cel — `describeAbility` doklejał „cel: <typ>"
   a akcja i tak „→ cel: <nazwa>". Fix: opcja `withTarget:false` dla etykiety akcji.
5. Surowe „resolve_reveal_exile_hand/grave" (Dreams of Steel and Oil). Fix:
   `commandLabel` dla obu (+ nazwa karty po `session.nameOfObject`, bo PlayerView
   chowa cardId odsłoniętej ręki).
6. „(koszt )" puste przy zdolnościach bez many — `abilityCostHtml` znał tylko
   mana/tap; koszty „odrzuć N/poświęć" (Plague Reaver) i brak kosztu (Crew/sac)
   dawały pusty nawias. Fix: `discardCards`/`sacrificeSelf` + pominięcie pustego.
7. Odmiana „obrażeń" wg liczby — „zadaje 1 obrażeń". Fix: helper
   `obrażenie/obrażenia/obrażeń` (1/2-4/5+) w session.js i render.js.
8. Log odrzucenia „wybiera, którą odrzuca kartę z ręki (efekt)" — nieczytelna
   gramatyka + techniczny sufiks. Fix: czytelny komunikat.
9. Surowy „source_power" w opisie buffa Jyoti. Fix: `ptAmount` dla dynamicznych P/T.
10. Brak polskich etykiet keywordów — `double_strike`, `level_up`, `persist`,
    `defender`, `infect`, `exalted`, `indestructible`, `flash`, `morph`,
    `changeling`. Fix: `KEYWORD_LABELS`.
11. Surowe „token_eldrazi_scion" — token nie był zarejestrowaną kartą (tylko
    inline w create_token). Fix: `defineCard` dla tokena (jak pozostałe tokeny).
12. Surowe „(saga_chapter)" w logu triggera (Shiva saga). Fix: `TRIGGER_EVENT_LABELS`.
13. „zyskaj 1 życia" — odmiana życia (1 → „1 życie").
14. Angielskie tryby Etherwrought Page („Life Gain/Surveil/Drain"). Fix: polskie
    nazwy trybów.
15. Niespójne etykiety załączników na nakładce ilustracji — `buildStateOverlay`
    używał „aura:/equip:", a `buildFace` „zaczarowana:/wyposażona:". Fix: spójne.
16. „Bone Splinters → cel: ?" — `spell_cast` niósł tylko objectId celu; cel
    zniknięty ze `state.objects` (token/śmierć) dawał „?". Fix: LKI
    `targetCardIds` w evencie + log czyta po cardId.

**Weryfikacja:** `npm test` **1374/1374** (+16 regresyjnych „Diament N" w
`test/table-ui.test.js`), build 50 modułów / ~1481 kB, quick B0 (2160 meczów)
**0 crashy** (heuristic ~78.8% ogółem, progi 0.78/0.57 utrzymane; bot bez zmian —
pełne B0 niewymagane). Testerem: 0× „skontrowany (?)", 0× „p1-library-N",
0× surowe slugi, 0× „· ·", 0× „(koszt )", 0× „zyskaj 1 życia", 0× „zadaje
1-4 obrażeń", 0× „→ cel: ?", Etherwrought po polsku, „zaczarowana:/wyposażona:".


## Sesja 2026-08-11 — M75: poprawki z ręcznych testów A–E (PR #44)

Po diamentowej odznace (M74) właściciel wykonał ręczne testy — 5 uwag (A–E),
wszystkie naprawione u root cause. Plan:
`docs/plans/PLAN_2026-08-11-ręczne-testowanie.md`.

- **A. Cellar Door bez ilustracji** — `imageUri` (błędny UUID Scryfall) → 404
  → syntetyczna twarz. Poprawiono UUID; dodano strażnik `imageUri` = UUID z
  `docs/cards/scryfall-*.json` dla każdej karty (test).
- **B. Ptaszek wyciszenia** — za mały obszar aktywny; klik obok rzucał
  instanta. Ptaszek w `<label class="action-ignore">` z paddingiem; klik w
  label nie propaguje do przycisku.
- **C. Wizardy walki** — pokazują „(atak, obrona)" przy każdym stwórze;
  klik w nazwę otwiera pełny ekran karty (`onOpenCard`).
- **D. Odrzucenie przy limicie ręki** — (1) gramatyka komunikatu (rozróżnienie
  „jako koszt / przy limicie ręki / efektem"); (2) „Ruch przeciwnika" dla
  decyzji CZŁOWIEKA → root cause: `noteBotMove` rejestrował zdarzenia
  człowieka podczas auto-passu faz człowieka w `advance()`; fix: flaga
  `botActing` (tylko gałąź BOTA); (3) modal bez nazw kart → `commandLabel`
  dla `resolve_discard_choice` („Odrzuć: <nazwa>").
- **E. Auto-pass utykał w Głównej 2 („Brak akcji")** po wyciszeniu opcji —
  root cause: gałęzie auto-passu faz CZŁOWIEKA w `advance()` pauzowały na
  zdarzeniach (`pauseOnBotMoves && significant`) jak przy ruchu bota. Fix:
  pauza tylko w gałęzi BOTA.

Weryfikacja: `npm test` **1380/1380**, build 50 modułów / ~1484 kB, quick B0
(1620 meczów) 0 crashy (heuristic ~78.1%, próg 0.78; bot bez zmian).

## Sesja 2026-08-11 — M76: Batch 30 — 10 realnych kart (PR #44)

Kolejka właściciela (handoff po PR #43): Batch 30. Plan:
`docs/plans/PLAN_2026-08-11-batch30-kart.md`. Scryfall z `set=` przez
fetch_page; artId/plan ze słownika; MANA_COSTS +10.

**Karty:** Banishment Decree (MBS), Crew Captain (SNC), Consume Spirit (MRD),
Altar of the Goyf (MH2), Instant Ramen (FIN), Inspiring Bard (AFR),
Seismic Monstrosaur (LCI), Epic Experiment (OTC), Gurmag Drowner (DTK),
Wavecrash Triton (THS).

**Nowe mechaniki generyczne (ADR 0002):**
1. **Bounce na wierzch biblioteki** (`bounce_to_library_top`, Banishment
   Decree — CR 108.3/400.7, cel artifact_or_creature_or_enchantment).
2. **Generyczny X-cost czar** (`spell.xCost` — Consume Spirit, Epic
   Experiment; X wybiera gracz, koszt = manaCost + X, `spellX` na stosie).
3. **enteredThisTurn** statyk (Crew Captain — indestructible w turze wejścia;
   proxy summoningSickness).
4. **Statyczny grant wg podtypu** (`creatures_with_subtype`, Altar of the
   Goyf — Lhurgoyf mają trample).
5. **Koszt aktywacji sacrificeLand** (Seismic Monstrosaur — {2}{R}, poświęć
   ląd: dobierz).
6. **Modalny trigger ETB z celem** (Inspiring Bard — choose one; tryb bez
   legalnego celu niedostępny — fix crasha benchmarku).
7. **Epic Experiment** (exile top X, free-cast inst/sorc MV≤X, reszta do
   grobu; `pendingEpicExperiment`).
8. **look top N → jedna do ręki, reszta do grobu** (`pendingLookTopN`,
   Gurmag Drowner — po exploicie).
9. **Heroic** (`spell_targets_this_creature` — Wavecrash Triton: tap stwora
   przeciwnika + lock_untap).

Talie singleton +10 (azorius, black, green, red, spellslinger, tokens);
tester stołu obsługuje „Odrzuć:". Boty znają resolve_epic_choice /
resolve_look_top_choice.

**Weryfikacja:** `npm test` **1393/1393** (+13 behawioralnych w
`test/real-cards-batch30.test.js`), build 50 modułów / ~1519 kB, pełne B0
(2160 meczów, 0 crashy): heuristic **79.5% ogółem** (64.6% vs aggro / 94.4%
vs random) — progi 0.78/0.57 utrzymane.


## Sesja 2026-08-12 — M77: uwagi przed mergiem PR #44 (A–C)

Przed mergem Batchu 30 właściciel zgłosił 3 uwagi z testów na telefonie,
wszystkie naprawione u root cause. Plan:
`docs/plans/PLAN_2026-08-12-uwagi-przed-mergiem.md`.

- **A. Dublowany komunikat o tasowaniu** (Caravan Vigil) — `search_choice_resolved`
  i `library_searched` emitowane razem dawały 2 wpisy „tasuje". Fix: tłumienie
  natychmiastowego `library_searched` po `search_choice_resolved` w logu
  (`describeEvent`) i modalu bota (`noteBotMove`); inne ścieżki (typecycling,
  pokoje lochu) bez zmian.
- **B. Bot rzuca buff na stwora przeciwnika** (Might of the Masses →
  Maritime Guard) — kara „wzmacnianie przeciwnika" obejmowała tylko `pump`,
  a Might używa `pump_by_creature_count`. Fix: kara dla wszystkich pump-efektów
  (`pump`, `pump_by_creature_count`, `pump_enchanted_creature`) na cudzym.
- **C. Brak info o zmianie tury/fazy** podczas ciągłego ruchu bota — modal
  „Ruch przeciwnika" pokazuje teraz nagłówki „Tura N — <gracz>" i
  „Faza: <nazwa>" (turn_started/step_advanced, `lastBotPhaseKey`).

Weryfikacja: `npm test` **1396/1396** (+3), build 50 modułów / ~1523 kB, pełne
B0 (2160 meczów) 0 crashy — heuristic ~79.4% ogółem (progi 0.78/0.57; zmiana
bota mierzona).

## Sesja 2026-08-12 — M78: diamentowa odznaka challenge 2 — 15 błędów żywym testerem (PR #44)

Właściciel rzucił wyzwanie: 15 błędów Testerem Gracza. Rozegrano 20+ partii
(różne talie/seedy, dłuższe gry) na prawdziwym artefakcie i przeskanowano
transkrypty (tools/table-tester/scan.mjs). Plan:
`docs/plans/PLAN_2026-08-12-diamentowa-odznaka-challenge2.md`.

**15 błędów etykiet/logu, wszystkie u root cause (bez zmian bota):**
1. `bounce_to_library_top` bez polskiego opisu → „efekt (…)" (Banishment Decree).
2. Koszt Escape „?" — czyta z registry (graveyard view nie niesie spell).
3. Inspiring Bard tryby „Bardic Inspiration/Song of Rest" → polskie.
4. Ainok Artillerist „Zasięg · Zasięg" — describeStatic pokazuje keywordy tylko
   dla zdolności SCOPOWANYCH (samodziałające trafiają do keywordLine).
5. `look_top_put_one_hand_rest_grave` bez opisu (Gurmag Drowner).
6. Howl dynamiczna liczba tokenów („za każdy Forest") niewidoczna w opisie czaru.
7. `epic_experiment` bez opisu (Epic Experiment).
8. `buff_creature_until_end_of_turn` bez opisu (Altar of the Goyf).
9. Jyoti „moc źródła/moc źródła" → ptPair deduplikuje równe P/T.
10. COUNTER_LABELS deathtouch/flying/lifelink → polskie (były surowe).
11. „(koszt4U)" — brak spacji w costPart.
12. „(koszt odrzuć 2 karty)" → „(koszt: odrzuć …)" (czysty koszt pozamany).
13. Modalne tryby Choose one po angielsku (Aerith, Ruinous, Selesnya, Robbers,
    Your Temple) → polskie.
14. Dublowane „aura → Xaura"/„wyposaża" — buildStateOverlay nie powiela
    przypięcia (robi to buildFace).
15. exalted_pump „(exalted)" → „(egzaltacja)".

Weryfikacja: `npm test` **1405/1405** (+9 w `audit-diamond-challenge2.test.js`),
build 50 modułów / ~1525 kB, pełne B0 (2160 meczów) 0 crashy — heuristic 79.4%
(progi 0.78/0.57 utrzymane). Testerem: 0× „efekt (<slug>)", 0× „Zasięg · Zasięg",
0× „moc źródła/moc źródła", 0× „(koszt ?)", 0× „aura → Xaura", 0× angielskie
tryby, 0× „(exalted)", 0× „(koszt4U)".

## Sesja 2026-08-12 — M79: uwagi A/B + audyt PR #44 (PR #45)

Po merge PR #44 właściciel zgłosił dwa błędy z telefonu i zlecił audyt
jakości tamtego PR. Plan: `docs/plans/PLAN_2026-08-12-uwagi-ab-audyt-pr44.md`.

**Uwagi z testów (root cause):**
- **A.** Modal „Ruch przeciwnika” pokazywał każdą zmianę kroku (`Faza: …`).
  Nagłówek fazy jest teraz *oczekujący* — wypychany dopiero przy akcji.
  Zawsze zostaje „Tura N — <gracz>”.
- **B1.** Wynik walki znikał z „Ruch przeciwnika” (M75 `botActing` pomijał
  auto-resolve). Modal raportuje CAŁĄ fazę walki: bloki, obrażenia (także
  stwór–stwór — `combat: true`), truciznę (infect), śmierci i triggery.
  `dealCombatDamageToPlayer` niesie LKI `sourceCardId`.
- **B2.** Fullscreen z wizardu ataku/bloku chował `choice-request` — jak B23.
  Nie chowamy już tego modala (z-index 2600 > 1500).

**Audyt Batch 30 / M74–M78:**
- Consume Spirit: Oracle „Spend only black mana on X” — `xCost.black` +
  płatność X jako pipy {B} (oferta i `castXCostSpell`).
- Epic Experiment: free-cast z `chosenTargets: []` fizzlował czary z celem
  (CR 608.2b). Oferta per legalny cel/tryb; execute waliduje i ustawia cele.
  X nieopłacone = 0 (CR 107.3b).
- Crew Captain `enteredThisTurn` nie jest już proxy `summoningSickness`
  (kradzież dawała fałszywe indestructible). Flaga `enteredOnTurn` przy
  wejściu na pole bitwy (`addObject` / `moveObjectDirectly` / tokeny).
- `PROJECT_STATE.md`: usunięte znaczniki konfliktu `<<<<<<< HEAD` ze squash #44.
- Komentarz `combat.js` o „pełna siła KAŻDEMU blokerowi” zaktualizowany (M66).

Weryfikacja: `npm test` + `npm run build` (wyniki w opisie PR #45). Bot bez
zmian — B0 niewymagany.

## Sesja 2026-08-12 — M80: Jill, Shiva's Dominant — cel ETB także własne permanenty

Uwaga A z testów właściciela po merge M79:

> Karta Jill, Shiva's Dominant — celuje tylko w permanenty przeciwnika.
> Czy wśród opcji nie powinno być także własnych?

Oracle Jill: „up to one other target nonland permanent” — brak ograniczenia
do przeciwnika; celem może być dowolny permanent niebędący lądem inny niż
źródło, w tym własny kontrolera.

**Root cause:** typ celu `other_nonland_permanent` w `triggers.js`
(używany wyłącznie przez Jill) odfiltrowywał własne permanenty źródła
(`controllerId === sourceObject.controllerId`).

**Fix:** usunięto ten filtr — kandydatami są wszystkie nie-landy poza
źródłem (obu graczy), bez hexproof, najsilniejszy pierwszy (spójne
z generycznym `nonland_permanent` / Thistledown Players). Walidacja
`resolve_trigger_target` korzysta z tego samego `triggerTargetCandidates`,
więc wybór własnego permanentu jest akceptowany.

Plan: `docs/plans/PLAN_2026-08-12-jill-shiva-dominant-targeting.md`.

Weryfikacja: `npm test` **1413 pass / 0 fail**, `npm run build`
50 modułów / 1530.9 kB. Bot bez zmian → pełne B0 niewymagane.

## Sesja 2026-08-12 — M80: audyt rozgrywki żywym testerem stołu

Zlecenie właściciela: wykorzystać Żywy Tester (`tools/table-tester/run-game.mjs`),
wcielić się w rolę gracza, rozegrać partie na prawdziwym artefakcie przeciwko
botowi i zebrać ≥15 błędów/niejasności/uproszczeń z perspektywy gracza, potem
je naprawić. Plan: `docs/plans/PLAN_2026-08-12-audyt-zywy-tester.md`.

**Narzędzie rozszerzone (audyt):**
- tester loguje treść modala „Ruch przeciwnika” (`bot-move`) — wcześniej tylko
  go zamykał;
- tester deklaruje BLOKI w wizardzie (wcześniej nigdy nie blokował, więc walka
  stwór–stwór była niewidoczna).

**Naprawione (16):**
- `session.js`: „Brak ataku” (puste `attackers_declared`) nie tworzy modala —
  szum/pusta faza.
- `render.js commandLabel`: szukanie w bibliotece rozróżnia znalezione karty
  i rezygnację; mulligan pokazuje finalną rękę 7−N (London mulligan).
- `render.js describeEffect`: Reclusive Artificer „zada tyle obrażeń, ile
  artefaktów kontrolujesz” (było „za każdy twój artefakt obrażeń”); Tumbleweed
  Rising bez surowego slug `greatest_power_you_control` (dynamiczne P/T).
- `render.js describeTriggered`: czytelne opisy zamiast „Trigger <event>” dla:
  Landfall, land przeciwnika, krok końca, exploit, aura-host-celem-czaru,
  drugi czar, czar niebędący stworem, odwrócenie twarzy, niebojowe obrażenia
  przeciwnikowi, celowany ETB z obrażeniami (Forge Devil).
- `choice-request.js`: wizard obrażeń „śmiertelne N” (nie angielskie „lethal”).

Transkrypt: `tools/table-tester/audyt-m80-green-vs-red.txt`.

Weryfikacja: `npm test` **1421 pass / 0 fail**, `npm run build`
50 modułów / ~1535 kB. Bot bez zmian → pełne B0 niewymagane.

## Sesja 2026-08-13 — M81: polowanie na błędy vs CR (brązowa odznaka)

Przegląd istniejących kart i mechanik vs Comprehensive Rules; znalezienie
i naprawa 5 błędów/uproszczeń. Plan:
`docs/plans/PLAN_2026-08-13-brazowa-odznaka-bug-hunt.md`.

**Naprawione (5):**
- **`creature` trigger-target self:** filtry typu `creature` w `triggers.js`
  wykluczały źródło; karty „target creature" bez „other" (Cloudbound Moogle,
  Forge Devil, Reclusive Artificer, Goblin Battle Jester, Battle-Rattle
  Shaman, Silumgar Butcher, Angelic Benediction) nie mogły celować w siebie
  (Moogle ETB w ogóle nie odpalał, gdy był jedynym stworem). Faceless Butcher
  („another") dostał `notSelf`.
- **Goad can't block:** `canBlock`/`legalBlockerOptions`/`declareBlockers`
  nie egzekwowały CR 701.38 („goaded creatures can't block").
- **Wavecrash Triton:** `lock_untap` (trwały, jak Entrancing Lyre) zamiast
  „doesn't untap during controller's NEXT untap step" — nowy jednorazowy efekt
  `dont_untap_next_untap_step` (flaga zużywana w następnym untap).
- **Caravan Vigil Morbid:** wymuszał położenie landa na pole bitwy bez opcji
  „may" (ręka). Szukanie w bibliotece przyjmuje teraz `destinations` i gracz
  wybiera ręka/pole bitwy.
- **Amass z wieloma armiami:** engine brał pierwszą Armię bez wyboru.
  Nowa blokująca decyzja `resolve_amass_choice` (CR 701.43 „choose an Army").

**Przy okazji (root cause, ujawnione przez BUG1):** `damage_to_controller`
(Forge Devil) nie niósł `sourceCardId` — gdy źródło ginęło w SBA tego samego
rozstrzygnięcia (celowało w siebie), log walki pokazywał „? zadaje 1 obrażenie".

Weryfikacja: `npm test` **1427 pass / 0 fail** (1421 → 1427), `npm run build`
50 modułów / ~1541.5 kB. Bot bez zmian → pełne B0 niewymagane.

## Sesja 2026-08-13 — M82: Batch 31 — 10 realnych kart + 3 nowe talie

Kolejka właściciela (handoff po M81). Lista (10 kart): Furious Forebear (TDM),
Jwari Shapeshifter (WWK), Floodhound (MH2), Inspire Awe (THB),
Cogwork Assembler (2XM), Dread Warlock (M10), Steel Sabotage (2XM),
Warrior's Sword (FIN), Awaken the Sleeper (ONE), Impact Tremors (DTK).
Plan: `docs/plans/PLAN_2026-08-13-batch31-kart.md`.

**Nowe generyczne mechaniki (ADR 0002):**
- **trigger z grobu + opcjonalna płatność** (Furious Forebear): skan źródła
  w grobie na śmierć kontrolowanego stwora, `other_creature_you_control_dies`,
  `return_source_from_graveyard_to_hand`.
- **enter as copy** (Jwari): deskryptor `enterAsCopy` rozstrzygany PRZY wejściu
  (przed SBA — inaczej 0/0 ginie zanim ETB by się odpalił), kopiuje najsilniejszego
  Ally; generyczny w `spells.js`/`registry.js`.
- **investigate / token Clue** (Floodhound): efekt `investigate`, token `token_clue`.
- **prewencja combat „except by enchanted/enchantment creatures"** (Inspire Awe):
  flaga `preventCombatExceptEnchanted` + filtr w `combat.js`.
- **token-kopia artefaktu z haste + delayed exile** (Cogwork Assembler):
  `create_copy_token`.
- **„can't be blocked except by [kolor]"** (Dread Warlock): statyczna restrykcja
  blokowania.
- **counter artifact spell** (Steel Sabotage): typ celu `artifact_spell_on_stack`.
- **job select** (Warrior's Sword): `job_select` — Hero token + attach; equipment
  nadaje podtyp Warrior (`subtypes` w attachmentGrant/registry/identity).
- **czasowa kontrola do EOT + untap + haste + zniszcz equipment** (Awaken the
  Sleeper): `gain_control_until_end_of_turn` (revert w cleanup),
  `destroy_equipment_attached`.
- **„creature you control enters"** (Impact Tremors): trigger `creature_you_control_enters`.

**Błąd ujawniony (root cause):** enumeracja zdolności aktywowanych oferowała
TYKO stwory jako cele niezależnie od typu celu — Cogwork Assembler (cel
'artifact') dostawał stwory i bot wybierał nielegalny cel. Naprawa: wspólna
`legalTargetCandidates` w `abilities.js`.

**Talie (B):** nowe `decks/ostrza.txt`, `decks/mechanicy.txt`,
`decks/sojusznicy.txt` + dopiski do istniejących (azorius, green, black, red).

Weryfikacja: `npm test` **1442 pass / 0 fail** (1427 → 1442), `npm run build`
50 modułów / ~1570.3 kB. Bot bez zmian → B0 niewymagany.

## Sesja 2026-08-13 — M83: audyt rozgrywki żywym testerem (10 błędów)

Zlecenie właściciela: użyć Żywego Testera (`tools/table-tester/run-game.mjs`),
wcielić się w rolę gracza, rozegrać partie różnymi taliami i zebrać ≥15
błędów/niejasności/uproszczeń z perspektywy gracza, potem je naprawić. Plan:
`docs/plans/PLAN_2026-08-13-audyt-zywy-tester-m83.md`.

**Naprawione (10):**
- **Log walki:** „A i B i C blokuje" → „A, B i C blokują" (liczba mnoga,
  przecinki) — `blockers_declared`.
- **Nagłówek modala:** „Faza: Faza główna" → „Faza: Główna 1" (redundancja).
- **„Brak bloków" w modalu** „Ruch przeciwnika" pomijany (szum jak „Brak ataku").
- **Morph face-down:** etykieta „Obróć twarzą do góry: (morph )" miała pusty
  koszt — PlayerView battlefield nie niósł `morph`.
- **„→ cel: ?" na stosie** dla czaru celującego w gracza (Release the Ants) —
  stack-view nie rozpoznawał gracza jako celu.
- **Surowe „Trigger <event>:"** — czytelne opisy dla 13 typów triggerów
  (when_you_cast_spell, beginning_of_combat, player_casts_spell, ...).
- **Etykieta czaru X** — „Rzuć: Fireball (koszt XR)" bez wartości X → „X=N".
- **Bot zapętlał się re-equipem** tego samego stworu (Hunter's Blowgun) —
  kara za re-equip obecnego nosiciela w `heuristic-bot.js`.
- **Błędny opis Insatiable Appetite** — „poświęć Food (zyskaj 3 życia)" zamiast
  „+5/+5 albo +3/+3 do końca tury".
- **Craft bez artefaktu do wygnania crashował** („Brak artefaktu do wygnania
  (craft)") — teraz no-op (CR 608.2b).

**NIE-bugi (artefakty):** podwójne „choroba"/P/T na kaflach (jsdom nie ładuje
obrazów); re-equip przez testera-klikacza; Banishment Decree na token (token
znika poza polem bitwy — CR 704.5d).

Weryfikacja: `npm test` **1452 pass / 0 fail**, `npm run build`
50 modułów / ~1574 kB. Bot zmieniony (re-equip) → pełny B0 bez niedokończonych;
progi win-rate utrzymane.

## Sesja 2026-08-13 — M84: ostateczne wyzwanie Testera Gracza (15+ błędów)

Zlecenie właściciela: użyć Żywego Testera, wcielić się w rolę gracza i znaleźć
15 unikalnych błędów albo stwierdzić, że więcej nie da się znaleźć. Plan:
`docs/plans/PLAN_2026-08-13-audyt-zywy-tester-m84.md`.

**Nowe błędy (M84):**
- Kafel Greatsword of Tyr (equipped_creature_attacks) — surowy „Trigger atak
  wyposażonego stwora:" → czytelny opis.
- Epic Experiment — odmiana „1 kart do grobu"/„wygnano 1 kart" (powinno
  „1 karta"/„1 kartę").
- Proliferate — `counter_added` bez `total` → „(razem undefined)".
- Station over-use bota — pompował liczniki charge bez końca (brak wyceny
  progu); dodana kara + PlayerView niesie `station`.
- Index/look_top i Fertile Thicket — odmiana „kart" (powinno „kartę"/„karty").
- `damage_prevented` — „zostają zniwelowane" bez powodu; dodany powód
  (ochrona / Inspire Awe / tarcza) + flaga `inspireAwe`.
- Tester: nie klikał „pomijam" (STOP) i atakował solo (can't attack alone).

Razem z M83 (10 bugów) to 16+ unikalnych.

Weryfikacja: `npm test` **1458 pass / 0 fail**, `npm run build`
50 modułów / ~1575.9 kB. Bot zmieniony (Station + re-equip) → benchmark bez
niedokończonych, progi win-rate utrzymane.

## Sesja 2026-08-13 — M88: naprawa transkryptu Żywego Testera (PR #51, 3f3bd77)

Kontynuacja po PR #50 (M87 wykonany). Audyt Żywym Testerem wykazał, że
**transkrypt modala „Ruch przeciwnika" zlepiał sąsiednie wpisy DOM
(`<div.bot-move-line>`)** jedną spacją i obcinał kontekstem
(`slice(0, 400)`), ukrywając realne bugi UI pod szumem typu
„Faza: Główna 1G Garruk's Companion wchodzi na pole bitwy" w jednej
linii. To samo z modalami wyboru (intro + lista opcji) i kaflami
(kilka `<div>` w jednym `.tile`: `.fname`/`.fcost`/`.ftype`/`.fbox`).

**Root cause (nie maskowanie):** wydzielony moduł
`tools/table-tester/extract.mjs` z trzema czystymi ekstraktorami —
`extractBotMoves({title, entries})` zwraca listę linii (tytuł + każdy
wpis z `  • `), `extractModalChoice({intro, options, chosenIndex,
confirmText})` zwraca intro + każdą opcję osobno z markerem ▶ dla
wybranej, `extractTileText(tile)` czyta pola kafla osobno i łączy
separatorem `·`. `run-game.mjs` używa ich w `closeBotMove`, `resolveModal`
i `tiles` (snapshot).

**Testy:** 6 RED→GREEN w `test/table-tester-output.test.js`
(extractBotMoves nie zlepia, extractModalChoice oznacza ▶,
extractTileText rozdziela kafle separatorem `·`). Pełny wynik:
**1524/0** (+6), build 50 modułów / 1618.8 kB, bot nietknięty (B0 bez zmian).

**Plan:** `docs/plans/PLAN_2026-08-13-m88-tester-output.md`. Handoff:
`docs/setup/HANDOFF_2026-08-13-m88.md`. Snapshoty: `tools/table-tester/
audyt-m88-{blk-tok-66,soj-inn-44}.txt`.

## Sesja 2026-08-15 — M101: brązowa odznaka „wyłapywacza błędów" (PR #54)

**Zlecenie:** znaleźć i naprawić **10 unikalnych błędów** niezgodnych z CR,
w tym 4 zgłoszenia właściciela z realnej rozgrywki. Metoda M83/M84/M95:
objaw → repro → root cause → test RED → fix → GREEN.

**Zgłoszenia właściciela (A-D):**

- **A — autodobieranie (CR 504.1, `ed6ee77`).** Dobranie w kroku dobierania
  było jedyną akcją turową wystawioną jako OPCJONALNA komenda — dawało się
  je pominąć passem i wejść w fazę główną bez karty. Fix: akcja turowa
  `drawStepTurnBasedAction` wykonywana przy wejściu w krok, zanim ktokolwiek
  dostanie priorytet (jak untap, CR 502.1). `draw_card` zostaje w protokole
  dla replayów. **Skutek uboczny do zapamiętania:** gracz z pustą biblioteką
  przegrywa teraz SAM w swoim kroku dobierania (CR 104.3c), więc testy
  pasujące wiele tur z pustymi bibliotekami kończą się deck-outem — 8 testów
  starego kontraktu wymagało dosypania kart.
- **B — Furious Forebear (`7cf7d54`).** Dwie identyczne opcje „Dobrowolna
  dopłata". Root cause: `commandLabel` bez gałęzi dla
  `resolve_optional_pay_choice` → `default:`. Fix: silnik dokłada dane kosztu,
  render opisuje SKUTEK.
- **C — odmiana 2. osoby (`25fcb16`).** „Ty dobiera:" zamiast „Dobierasz:";
  124 opisy. Fix: wrapper `describeGameEvent` + mapa ~44 czasowników.
- **D — panel „Rozgrywka" (`25fcb16`).** Panel gubił zdarzenia tury
  przeciwnika. Root cause: `BOT_RESOLUTION_EVENTS` bez `control_changed`
  i triggerów; `trackStack` wymagało kontrolera z pola zdarzenia.

**Znaleziska własne (B1-B6):**

- **B1 equip (CR 702.6d, `a17e8fe`)** — equip aktywowalny w instant speed.
- **B2 buffy „do końca tury" (CR 611.2c, `1bbb73a`)** — zbiór obiektów nie
  zamrażał się przy rozstrzygnięciu.
- **B3 liczniki stun (CR 122.1b, `1bbb73a`)** — untap step ignorował licznik.
- **B4 morph/face-down (CR 708.2, `f0c7078`)** — zakryty permanent zachowywał
  kolory, podtypy, koszt i nazwę.
- **B5 choroba przywołania (CR 302.6, `0ca85a5`)** — stwór, który przeszedł
  untap step zatapniętny pod blokadą odkręcania (stun, untap-lock), zostawał
  chory NA ZAWSZE. Root cause: flagę kasowała wyłącznie gałąź realnego
  odkręcenia, a każdy `continue` blokady wyskakiwał przed nią. CR 302.6 wiąże
  chorobę WYŁĄCZNIE z ciągłością kontroli — nie z odkręceniem. Fix: helper
  `clearSummoningSickness` na starcie iteracji, przed blokadami.
- **B6 trample (CR 702.19b, `9b8737c` + UI `51b0f41`)** — atakujący z tramplem
  mógł dać blokerom 0 i wpakować całą moc w gracza; blok nie chronił przed
  niczym. Root cause: `validateDamageAssignment` sprawdzało sumę i kolejność
  (CR 510.1d), ale nadmiar trample nie jest jawną pozycją przydziału (liczony
  jako `remaining`), więc niedobór wyciekał na obrońcę. Fix: przy tramplu
  i sumie < moc każdy bloker musi mieć >= lethal. Wizard UI startuje od
  lethal-first i blokuje „Zatwierdź" przy nielegalnym przydziale.

- **B7 etykiety crew/saddle (CR 701.36/702.171, `ab8945c`)** — zgłoszenie
  właściciela „sprawdź czy crew/saddle działa poprawnie". Silnik okazał się
  czysty (12 zweryfikowanych aspektów: timing crew=instant / saddle=sorcery,
  stos CR 602.2a, **chore stwory MOGĄ zasilać** — crew nie używa {T}, „other
  creatures", zasilony pojazd zasila kolejny, typ Artifact, cleanup). Błąd
  siedział w UI: `set_saddled` bez wpisu w mapie opisów → „efekt (set_saddled)"
  na ekranie; `abilityCostHtml` nie znało `crewPower`/`saddlePower` → koszt
  niewidoczny; „załoga/saddle:" nie mówiło, że stwory zostaną TAPNIĘTE.
  Ten sam wzorzec co zgłoszenie B.

**Wniosek metodyczny:** „silnik zgodny z CR" nie zamyka zgłoszenia — trzeba
sprawdzić także to, co gracz *widzi* (3 z 5 zgłoszeń właściciela w tej sesji
były błędami UI, nie reguł).

**Wynik:** `npm test` **1785/0** (+47 od startu sesji), build 50 modułów /
1685.0 kB. Bot-benchmark 7/7 po zmianie combatu. Żywy Tester w OBU trybach
bez zgłoszeń — i to on wyłapał pętlę klikania w wizardzie trample.

**Benchmark — nowy baseline.** Pełne B0 (23 400 meczów) przed/po:
heuristic 81,3% → 77,6%, aggro 63,2% → 59,4%, random **5,5% → 13,0%**.
Hierarchia zachowana, 0 meczów niedokończonych. To nie regresja bota, tylko
skutek naprawy A: `draw_card` była komendą, a RandomBot losuje jednostajnie,
więc **pomijał własne dobieranie** i grał z pustą ręką (boty kierowane miały
je z najwyższym priorytetem). Para bez randoma nie drgnęła (aggro vs heuristic
33,5% → 34,6%), cały ruch jest w parach z randomem. Stary wynik 5,5% zawyżał
przewagę heurystyk, bo mierzył po części błąd silnika — `tools/b1-final-2026-08-15.*`
to uczciwy baseline dla następnych sesji.

**Plan:** `docs/plans/PLAN_2026-08-15-m101-brazowa-odznaka.md`.
Handoff: `docs/setup/HANDOFF_2026-08-15-m101.md`.

## M102 — audyt Żywym Testerem z perspektywy gracza (2026-08-16, PR #54)

**Zlecenie właściciela:** wcielić się w gracza (Żywy Tester, AGENTS.md pkt 10),
rozegrać realne partie różnymi taliami przeciw botowi i obserwować, **co
pokazuje interfejs** — opcje, czary, zdolności, stos, tury — pod kątem
zgodności z zasadami MtG *oraz intencją gracza*. Cel: 10 unikalnych błędów,
potem naprawa u root cause.

**Wynik: cel osiągnięty — 10 błędów (U1-U10), wszystkie naprawione.**

| # | Błąd | CR / typ |
|---|------|----------|
| U1 | Priorytet i aktywacje zdolności w kroku odkręcania | 502.4 |
| U2 | Job select gubił nazwę ekwipunku („? zostaje załączony") | UX |
| U3 | Nierozróżnialne opcje wyboru (17× „Szukanie: Forest") | UX |
| U4 | Duplikaty przycisków „Zagraj ląd" | UX |
| U5 | Myląca liczba przy nagłówku „Twoje działania" | UX |
| U6 | Mgła wojny morpha przy rozstrzygnięciu czaru | 708.2 |
| U7 | Kafel aury/ekwipunku nie pokazywał gospodarza | UX |
| U8 | Czar celujący w stwora poświęcanego jako własny koszt | 601.2c/608.2b |
| U9 | Equip na obecnego nosiciela — no-op za koszt | 702.6a |
| U10 | Fizzle zdolności nieodróżnialny od sukcesu w logu | 608.2b |

**Odpowiedzi na pytania kontrolne właściciela** (wszystkie twierdzące):
gracz może reagować w każdym legalnym oknie priorytetu (1970 zmierzonych okien
odpowiedzi, wyjątek: cleanup przy ręce >7 — CR 514.1); silnik nie przeskakuje
nielegalnie faz (priorytet w każdym kroku poza untapem); panel opisuje komplet
zdarzeń (164 typy, 0 bez opisu).

**Dwie lekcje metodyczne z tej sesji.** (1) Detektory Żywego Testera zamilkły
po U7 — ostatnie trzy błędy wyszły dopiero z **ręcznej analizy transkryptów**
pod kątem wzorca „oferta, która nic nie zmienia albo jest pewną stratą".
Ten wzorzec dał U8, U9 i U10. (2) Połowa tropów to fałszywe alarmy; każdy
zweryfikowany trop zapisano w planie, żeby następna sesja ich nie powtarzała
(T4′, `aura_spell_cast`, „1 opcja", dwa landy pod rząd).

**Wynik:** `npm test` **1838/1838**, build 50 modułów / 1693.9 kB, Żywy Tester
bez zgłoszeń detektorów w 14 partiach (11 kombinacji talii, 4 profile gracza).

**Plan:** `docs/plans/2026-08-16-m102-audyt-gracza.md`.
Handoff: `docs/setup/HANDOFF_2026-08-16-m102.md`.

## M103 — automatyzacja „ofert bez skutku" + benchmark po U8/U9 (2026-08-16)

Kontynuacja handoffu M102 (następne kroki 1–3) na gałęzi `arena/01a00a83-mtg`.

**1. Benchmark po U8/U9.** Pełne B0 (23 400 meczów) na silniku po M102:
aggro 59,4% → 58,8%, heuristic 77,6% → 77,5%, random 13,0% → 13,7% —
hierarchia zachowana, 0 niedokończonych. A2 (niżej) też zmienia enumerację
ofert, więc baseline przeliczony drugi raz — ostateczne liczby:
`tools/b1-final-2026-08-16.*` (następca `b1-final-2026-08-15.*`).

**2. Nowa oś detektorów `noop` — oferta bez skutku (automatyzacja L15).**
Sonda `probeCommandEffect` (`src/table/noop-probe.js`) wykonuje klikniętą
komendę na KLONIE stanu z pasywnym przeciwnikiem i porównuje fingerprint
przed/po; detektor `detectNoEffectOffers` klasyfikuje: brak zmiany /
fizzle przy pasywnym przeciwniku / jedyna zmiana to zapłacony koszt.
Mostek `window.__mtgDebug` włączany wyłącznie z `?tester=1`; przyciski
niosą `data-option-key`. Weryfikacja mutacyjna (L13): cofnięta bramka U9 →
detektor zgłasza dokładnie no-opowe equipy; po przywróceniu — cisza.
Testy: `test/noop-probe.test.js` (13) + `test/table-tester-detectors.test.js` (+11).

**3. Audyt aur i zdolności celowanych** (macierz 8×3×2 partii Żywego
Testera z nowym detektorem) — dwa znaleziska naprawione u root cause:

| # | Objaw | Root cause / naprawa |
|---|---|---|
| A1 | Fałszywy alarm sondy: craft wyglądał na „sam koszt" | fingerprint pomijał 36 pól wstrzymujących grę (m.in. `pendingCraftExile`); dodana generyczna sekcja `pendingDecisions` + obrona w głąb sondy (`blockedByChoice`) |
| A2 | Prawdziwy no-op: „{W}: zdobądź czujność" oferowane, gdy stwór już ją ma (Bladed Sentinel — 3× w jednej turze) | `legalActivatedAbilities` chowa oferty no-opowych nadań keywordów (wzorzec U9; anty-over-fix: Soulbright Flamekin z `onNthResolve` zostaje) |
| A3 | Fałszywy alarm sondy: Welder Automaton (obrażenia każdemu przeciwnikowi) wyglądał na „sam koszt" | sonda pomijała zmianę życia PRZECIWNIKA; teraz trafia do effectDiffs (życie przeciwnika to zawsze skutek) — engine bez zmian |
| A4 | Fałszywy alarm detektora `ui`: „Wybierz: Cel pokoju lochu" (decyzja obowiązkowa) bez ptaszka | regex `IGNORABLE_GROUP` łapał sam prefiks „Cel"; negative lookahead (`Cel(?! \p{L})`) — narzędzie, engine bez zmian |

Aury: w katalogu brak kart „attach target Aura" (re-pin), aury z ręki
zawsze tworzą nowy permanent — klasa nie występuje.

**Lekcje:** L16 (oczekująca decyzja to stan — musi być w fingerprint),
L17 (bundler jednoplikowy: bez aliasów importów; jsdom bez structuredClone),
L18 (życie przeciwnika to skutek, nie koszt).

**Zgłoszenia właściciela A–D (druga połowa sesji):** A (Forge Devil —
obowiązkowy ETB self-kill przy pustym stole) i B (ewazja dla wroga) i D
(Escape bez wyceny + niewidoczny koszt w logu) — naprawione w wycenie bota
i opisie zdarzeń; C2 („Wybierz: Wariant" przy Station) i C3 (brak typu
Creature po progu station) — naprawione w renderze i synchronizacji station.
C1 (brak blokowania/ataku gunshipa przy 7 licznikach) — niezreprodukowane
w silniku; dodane testy regresji, wrażenie przypisane C2/C3 na starym
buildzie. **ADR 0018 (decyzja właściciela, koniec sesji):** pełna macierz B0
uruchamiana wyłącznie na wyraźną komendę właściciela; domyślny tryb CLI
to profil szybki (`QUICK_CONFIG`, 1248 meczów, ~2,5 min). Bieżący stan
pliku `tools/b1-final-2026-08-16.*` to PRÓBKA SZYBKA po A–D: heuristic
58,2% vs aggro / 92,0% vs random. Pełna macierz po A–D czeka na komendę
(`node tools/benchmark.mjs --full`).

**ADR 0019 (decyzja właściciela, koniec sesji) — tiers testów.** Pakiet
rósł liniowo z batchami kart i liczył się kilkanaście minut (Node 22 na
2 vCPU uruchamiał pliki sekwencyjnie). Nowa organizacja:
`npm test` = szybki rdzeń (bez plików z `tools/test-manifest.json`),
`npm run test:slow` = ciężkie pliki (np. próbka regresji bota),
`npm run test:all` = pełny pakiet (brama PR) — z konkurencją plików ≥4
pełny pakiet spadł z ~14 min do **~3,3 min (1892/1892)**. Wzrost
katalogu kart nie rośnie w testy ręczne: `test/catalog-coverage.test.js`
weryfikuje każdą kartę rejestru strukturalnie. CI dalej odpala
`node --test` (sekwencyjnie) — przejście CI na runner wymaga commita
z uprawnieniem `workflows` (token agenta go nie ma).

**Wynik:** `npm test` **1869/1869** (+31 od M102), build 51 modułów /
1712.7 kB (nowy moduł noop-probe). Plan: `docs/plans/2026-08-16-m103-oferta-bez-skutku.md`.

## M120/M121 — audyt mechanik ofensywnych: bot przestaje strzelać do siebie (2026-08-17, PR #57)

**Zlecenie właściciela:** „wszelkie efekty uszkadzające, zabijające, tapujące itp.
powinny mieć penalty za użycie na własne permanenty i siebie; podobnie
discard/mielenie/exile na siebie” + „zrób detektor sytuacji, gdy bot rzuca czary
na własne stwory”. Wyraźnie zażyczono **audytu wszystkich typów**, nie łatki.

**Root cause.** Kary za „bicie we własne” narastały punktowo, przy okazji kolejnych
zgłoszeń (`destroy/exile/bounce` M91, `damage` M92, `mill/lose_life` M96). Domyślność
była odwrotna, niż być powinna: **nowy typ efektu startował bez ochrony**. Audyt
44 typów ofensywnych z `card-data.js` pokazał, że `tap_permanent`, `tap_permanents`,
`lock_untap`, `dont_untap_next_untap_step`, `discard_cards`, `sacrifice_permanent`,
`exile_all` i kilka innych nie miały ŻADNEJ kontroli właściciela celu.

**Zmierzone wpadki** (stół przeciwnika pusty): Chill of the Grave i Sterling Keykeeper
tapowały własnego stwora, Entrancing Lyre go unieruchamiała, a Spectral Prison lądował
jako aura-kotwica na własnym stworze — to ostatnie **realnie wystąpiło** w transkrypcie
serii D (`D-sojusznicy-innistrad-404.txt`, linia 504).

**Naprawa (generyczna, ADR 0002 — zero nazw kart):**
- `HOSTILE_PERMANENT_EFFECTS` / `HOSTILE_PLAYER_EFFECTS` + `selfHarmPenalty`
  w `heuristic-bot.js`, podpięte w **obu** ścieżkach wyceny (czary i zdolności).
  Odwrócona domyślność: efekt z tabeli jest ofensywny, a wycena musi udowodnić,
  że cel należy do przeciwnika.
- `auraIsHostile` — aura-kotwica przestaje być punktowana jak buff (+66). Wrogość
  czytana także z **triggera ETB** aury, bo Spectral Prison trzyma `lock_untap`
  właśnie tam, a nie w deskryptorze `aura`.
- Whitelista świadomych „na siebie”: `exile_own_land`, `sacrifice_*` jako koszt
  rzucenia, `prevent_*`, `untap_permanent` — bez kary (Bone Splinters i Village
  Rites zweryfikowane osobno).

**Detektor** `detectBotSelfHarmOnOwnPermanents` + `harmfulCardNames`: rozpoznaje
właściciela celu korelacyjnie ze snapshotów „MOJE POLA:” / „POLA WROGA:”.
Szkodliwość klasyfikowana po **deskryptorach z rejestru**, nie po polskim tekście —
w logu widać samą nazwę karty („rzuca Shatter → cel: X”). Uruchomiony wstecznie na
seriach D i E znalazł dokładnie to jedno prawdziwe znalezisko (Spectral Prison),
przy zerze fałszywych alarmów.

**Wynik:** `npm run test:all` **2092/2092** (+18 od M119), 0 failów. Benchmark
(profil szybki): heuristic vs aggro **63,3 %** (było 60,3 %), ogółem **76,3 %**
(było 74,8 %), vs random 89,3 % — naprawa nie tylko usunęła bezsens, ale
**wzmocniła grę bota**. Pomiar: `tools/b13-m121-2026-08-17.txt`.
Plan: `docs/plans/PLAN_2026-08-17-m120-audyt-mechanik-ofensywnych.md`.

## M122 — polowanie na 10 błędów Żywym Testerem (2026-08-17, PR #57)

**Zlecenie:** „z wykorzystaniem nowych detektorów znajdź i napraw 10 błędów”.

**Metoda:** 5 serii po 12 partii (60 rozgrywek) na `dist/mtg-table.html`,
wszystkie kombinacje talii × 5 profili gracza. Po każdej serii przegląd zgłoszeń
+ skany celowane na klasy, których żaden detektor nie zna (L27).

| # | Błąd | Warstwa |
|---|---|---|
| 1 | `fingerprint` gubił `cantBeBlocked`/`cantBlock` | **engine** |
| 2 | 17 identycznych „Szukanie: Forest” jako 17 ofert | **engine** |
| 3 | slug `trigger (enchanted_permanent_tapped)` w logu | UI |
| 4 | 5 fałszywych „ofert bez skutku” dla zdolności many | detektor |
| 5 | slug `efekt (attach_equipment_to_source)` w panelu | UI |
| 6 | slug `trigger (delayed)` — źródło w silniku, nie w kartach | UI |
| 7 | transkrypt gubił P/T i „zakryty (morph)” (nakładka `ovl-*`) | tester |
| 8 | `Ruch odrzucony: wrong_combat_timing` (61 kodów bez tłumaczenia) | UI |
| 9 | fałszywe „bot powtórzył akcję 4× w turze” | detektor |
| 10 | „blokuje: Armored Skaab**choroba**” — zlepione badge | tester |

**Najważniejszy wniosek (L28 w praktyce).** Trzy znaleziska (#3, #5, #6) to ta
sama rodzina: surowy identyfikator przepuszczony przez fallback `?? slug`.
Zamiast łatać zgłoszony slug, za każdym razem zinwentaryzowałem WSZYSTKIE
wartości (35 eventów triggerów, 121 typów efektów) i dodałem **strażnika**.
Tester trafił 1 z 2 i 1 z 9 braków — reszta czekała na rzadszy układ partii.
Drugi wniosek: 4 z 10 błędów były w NARZĘDZIU audytowym (L12 — tester jest
produktem); fałszywy alarm kosztuje tyle samo co przeoczony błąd.

**Odrzucone jako fałszywe tropy** (udokumentowane, żeby nie wracały): Jeskai
Devotee „21 aktywacji” i Soulmender „4× w turze” (duplikaty snapshotów / różne
tury — `oncePerTurn` działa), „1 życia”/„3 obrażeń” (poprawny dopełniacz),
„partia bez końca” (kończy się innym napisem), `-3/2` na kaflu (**poprawna**
ujemna moc: 1/2 pod dwoma efektami −2/−0).

**Wynik:** `npm run test:all` **2099/2099** (+21 od M121), 0 failów. Benchmark:
heuristic vs aggro **61,9 %**, ogółem 75,3 %, vs random 88,8 % — progi 0,57/0,78
zachowane (`tools/b14-m122-2026-08-17.txt`).
Plan: `docs/plans/PLAN_2026-08-17-m122-audyt-zywy-tester.md`.

## M123 — przeciek ukrytej informacji w modalu „Rozgrywka" (2026-08-17, PR #57)

**Zgłoszenie właściciela:** „Nieprzyjaciel rzucił Village Rites, poświęcił swoją
kreaturę. Kliknąłem Rozumiem. Pojawił się panel, a w nim obrazki MOICH kart przy
wpisach «Nieprzyjaciel dobiera kartę». Skąd tutaj te img moich kart?"

**Diagnoza poważniejsza niż zgłoszenie.** To nie były karty właściciela — to były
karty, które BOT właśnie dobrał DO RĘKI. Właściciel rozpoznał ilustracje jako
„swoje", bo obie talie zawierają te same landy podstawowe (Island). Faktycznie
modal pokazywał podgląd ukrytej ręki przeciwnika, czyli łamał **CR 400.2**.

**Root cause.** Ukrycie nazwy było zrobione w JEDNYM miejscu, a UI ma dwa:
- TEKST (`describeGameEvent`) poprawnie dawał „Nieprzyjaciel dobiera kartę" (FoW),
- MINIATURKA renderowała się niezależnie, z `e.object.cardId`, bo `card_drawn`
  jest w `BOT_MOVE_CARD_EVENTS` (dodane w M89 dla Curate, żeby gracz widział,
  że bot dobrał kartę).

**Naprawa generyczna** (nie łatka na `card_drawn`): w `noteBotMove` karta
wędrująca do UKRYTEJ strefy przeciwnika (`hand`, `library`) traci miniaturkę.
Grób i wygnanie są jawne (CR 400.2) — tam skan zostaje. Dodane pole
`hiddenDestination` jako ślad audytowy, żeby testy sprawdzały INTENCJĘ
(„skan zdjęty, bo strefa ukryta"), a nie sam brak `cardId`.

**Dlaczego 60 partii M122 tego nie znalazło:** żaden detektor nie miał reguły
dla tej klasy błędu (L27 w praktyce). Dołożony `detectHiddenCardLeak` porównuje
bezimienne wpisy z nazwami wszystkich kart z rejestru.

**Anty-over-fix (testy):** dobrania GRACZA nadal mają skan i jawną nazwę;
zagrania bota na stole (`permanent_cast`, `land_played`,
`permanent_entered_battlefield`) nadal pokazują miniaturki.

**Pułapka metodyczna zanotowana w teście:** pierwsza wersja asercji sprawdzała
„czy egzemplarz tej karty leży w ręce bota" i zapaliła się na Zoraline — bot
zagrał ją jawnie na stół, a druga kopia siedziała w ręce. Liczy się strefa
docelowa KONKRETNEGO zdarzenia, nie obecność nazwy w ręce.

**Wynik:** `npm run test:all` **2106/2106** (+7 od M122), 0 failów.
Nowy plik testów: `test/bot-hidden-draw-scan.test.js`.

## M124 — trzy zgłoszenia właściciela z testów (2026-08-17, PR #57)

**A. „Przycisk Bez bloków jest nieaktywny."** Diagnoza obaliła opis: przycisk
NIGDY nie był `disabled` (sonda w jsdom: `disabled=false`, `pointer-events:auto`).
On tylko WYGLĄDAŁ na martwy — jedyne, co robił, to czyszczenie zaznaczeń
i przerysowanie wizarda. Przy pustym wyborze (czyli w najczęstszym przypadku:
gracz od razu nie chce blokować) klik nie zmieniał NICZEGO na ekranie.
Naprawa: „Bez bloków"/„Bez ataku" to **deklaracja**, nie reset formularza —
wysyła komendę i zamyka wizard. Dwie pułapki po drodze: (1) engine reprezentuje
„brak bloków" jako pustą mapę `{}`, a nie `{atakujący: []}` — bierzemy ofertę
wprost z `options`; (2) przy stworach z przymusem ataku (CR 508.1d) pusta
deklaracja byłaby nielegalna, więc deklarujemy tylko zobowiązane i mówimy o tym.

**B. „Chronic Flooding — trigger (enchanted_permanent_tapped)."** Etykieta i
strażnik powstały w M122, ale `case 'ability_triggered'` ma **trzy ścieżki
renderu** i tylko ostatnia mapowała slug — dwie wcześniejsze (`sacrificed`,
`paid`) wstawiały `e.trigger` wprost. Strażnik sprawdzał KOMPLETNOŚĆ SŁOWNIKA,
nie MIEJSCA UŻYCIA. Dokładnie ten sam wzorzec co L30. Naprawa: etykieta liczona
raz, plus test-strażnik na samą treść `case`.

**C. „Kontr → powinno być Kontra."** Audyt wszystkich 16 nazw trybów modalnych
wykazał, że obok uciętego „Kontr" siedziały **cztery nazwy po angielsku**
(Vandalize: „Destroy artifact/land/both", Selesnya Charm: „Pump") — właściciel
ich nie zgłosił, bo te karty nie trafiły mu do ręki. Poprawione wszystkie pięć
+ strażnik na polskość nazw trybów.

**Wynik:** `npm run test:all` **2116/2116** (+10 od M123), 0 failów.
Nowy plik: `test/combat-wizard-clear-m124.test.js`.

## M125 — duplikat oferty (flash) + weryfikacja Craft (2026-08-17, PR #57)

**A. „Mam JEDNĄ Lodestone Needle, a widzę DWIE identyczne opcje «Zagraj»."**
Potwierdzone i naprawione. Permanent z FLASH jest enumerowany w DWÓCH blokach
`playerView`: raz jako „czar z flash" (dostępny przy każdym priorytecie), raz
w zwykłym bloku main-phase. Aury miały już na to bramkę
(`if (keywords.includes('flash')) continue`) — zwykłe permanenty nie.
Naprawa generyczna zamiast trzeciej bramki: **deduplikacja całej listy
`legalCommands`** po tożsamości komendy (`commandIdentityKey`, klucze
sortowane). Oferta ma odzwierciedlać liczbę RÓŻNYCH decyzji — ta sama zasada
co dedup wariantów mulligana (M119/Z3) i ofert szukania (M122/#2). Dowolne dwa
bloki enumeracji produkujące tę samą komendę są teraz pokryte, nie tylko flash.

**B. „Craft wygnał Emissary Escort, którego chyba nie miałem w grobie."**
Zgłoszenie NIE potwierdziło się jako błąd — właściciel sam skorygował
(„zmieliłem 4 karty i nie pamiętałem jakie"). Weryfikacja to potwierdza: talia
`mechanicy.txt` zawiera jednocześnie **Emissary Escort**, **Lodestone Needle**
i **Armored Skaab** („Gdy wejdzie na pole bitwy: mieli 4 karty"), więc karta
trafiła do WŁASNEGO grobu przez mielenie. Trzy sondy wykazały poprawność:
grób przeciwnika daje 0 kandydatów, a `execute` na cudzą kartę zwraca
`illegal_craft_target`.

Audyt ujawnił jednak **realną słabość obok zgłoszenia**: filtr kandydatów
sprawdzał `controllerId`, podczas gdy grób jest strefą WŁAŚCICIELA (CR 400.7),
a Craft mówi „an artifact card from YOUR graveyard". Dziś silnik przywraca
kontrolę właścicielowi przy wejściu do grobu (zweryfikowane pomiarem), więc
luka była nieosiągalna w grze — ale reguła strefy ukrytej oparta na kontrolerze
to pułapka czekająca na pierwszy efekt kradzieży kontroli. Utwardzone do
`ownerId` + test obronny.

**Wynik:** `npm run test:all` **2123/2123** (+7 od M124), 0 failów. Benchmark:
heuristic vs aggro **61,9 %**, ogółem 75,4 % — bez regresji po zmianie
w `playerView` (`tools/b15-m125-2026-08-17.txt`).
Nowy plik: `test/duplicate-offers-craft-m125.test.js`.

## M126 — polowanie na 10 nowych błędów Żywym Testerem (2026-08-17, PR #57)

**Zlecenie:** „wykorzystaj Żywy tester i znajdź 10 nowych błędów" — po
naprawach M122–M125, więc łatwe klasy były już wyczerpane.

**Metoda:** 60 partii (5 serii × 12), wszystkie kombinacje talii × 5 profili.
Detektory zgłaszały głównie znane wzorce, więc ciężar padł na **skany celowane
i audyty rodzin** (L27 w praktyce).

| # | Błąd | Warstwa |
|---|---|---|
| 1 | explore przy PUSTEJ bibliotece: koszt przepada bez skutku | UI |
| 2 | Dragon Arch bez wielokolorowego stwora w ręce — j.w. | UI |
| 3 | tester ZWIJAŁ identyczne kafle → dwa permanenty jako jeden | tester |
| 4 | surowe `creature_without_subtype` / `equipment_you_control` (51×) | UI |
| 5 | surowy licznik `stun×2` na kaflach (37×) | UI |
| 6 | „? dostaje +1 licznik -1/-1" — brak LKI dla zmarłego obiektu | UI+engine |
| 7 | „0 karty idą do grobu" — zła odmiana rzeczownika I czasownika | UI |
| 8 | „odrzuca N karty" (Nightsnare) — brak `polishPlural` | UI |
| 9 | „osiąga N liczników charge" — j.w. dla 2/3/4 | UI |
| 10 | bot marnował manę na jałowe explore/scry/Dragon Arch | bot |

**Najciekawsze: #3 zafałszował diagnozę.** Panel pokazywał dwie grupy „Cel
zdolności: Guidestone Compass", a stół w transkrypcie — jeden Compass. Wyglądało
to na błąd grupowania w UI. W rzeczywistości Compassy były DWA (token-kopia
z Cogwork Assemblera), a tester zwijał identyczne kafle po prefiksie 40 znaków
i po cichu gubił egzemplarze. Snapshot pokazuje teraz „×N".

**Rodziny, nie pojedyncze przypadki:** #1 objęło 4 karty, #4 — 6 typów celu
(tester trafił 2), #5 — 2 liczniki (trafił 1), #6 — oba zdarzenia liczników.
Dwa nowe strażniki pilnują kompletności map etykiet.

**Odrzucone fałszywe tropy:** Shiv's Embrace 5× w turze (pompowanie
NIEZABLOKOWANEGO atakującego — 9 obrażeń, optymalna gra), „1 życia"/„3 obrażeń"
(poprawny dopełniacz), Dragonbroods' Relic „only as a sorcery" (dotyczy drugiej
zdolności), Vehicle/Spacecraft z P/T bez typu Creature (zgodne z zasadami).

**Wynik:** `npm run test:all` **2133/2133** (+10 od M125), 0 failów. Benchmark:
heuristic vs aggro **61,7 %**, ogółem 75,3 % — bez regresji
(`tools/b16-m126-2026-08-17.txt`).
Plan: `docs/plans/PLAN_2026-08-17-m126-audyt-zywy-tester.md`.

## M127–M129 — uwagi właściciela A/B/C z testów (2026-08-17, PR sesji)

**Zlecenie (trzy uwagi z rozgrywki na telefonie):** pisownia „morph" w modalu
Rozgrywka, bot tapujący Seer's Lantern „na zapas", zbyt małe ptaszki wyboru
atakujących i blokujących.

| # | Uwaga | Root cause | Warstwa |
|---|---|---|---|
| A | „morph" małą literą | etykieta jako SUROWY LITERAŁ w 8 miejscach 4 modułów | UI |
| B | bot marnuje manę z latarni | wycena pytała „czy jest co zagrać", nie „czy mana coś zmienia" | bot |
| C | mikroskopijne ptaszki w walce | dla `.combat-wizard-*` NIE ISTNIAŁA żadna reguła CSS | UI |

**A (M127).** `Morph` to nazwa mechaniki (CR 702.37), a w UI zarazem zastępcza
nazwa zakrytej karty (CR 708.2) — stoi tam, gdzie normalnie stoi nazwa karty,
więc mała litera czytała się jak literówka. Naprawa nie polegała na zmianie
jednego napisu: etykieta była powtórzona ośmiokrotnie (session, render,
choice-request, main). Wprowadzono `FACE_DOWN_LABEL` + `faceDownName()`
i **niezmiennik czytający źródło** — żaden moduł stołu nie może już wpisać tej
etykiety z palca (L31). Przy okazji audyt mapy `KEYWORD_LABELS` wykazał
brakujący `megamorph` (kolejny cichy wyciek slugu — L29).

**B (M128).** Silnik auto-tapuje przy płatności wyłącznie LĄDY
(`producibleMana`), więc mana z artefaktu ma wartość tylko wtedy, gdy
odblokowuje zagranie niedostępne bez niej. Dotąd wycena patrzyła jedynie na
`hasPlayable` („czy w ręce jest cokolwiek płatnego"), przez co bot tapował
źródło, choć mana i tak ginęła w cleanup (CR 500.4) — a przy Seer's Lantern
blokował sobie drugą zdolność ({2},{T}: Scry 1). Nowa reguła jest generyczna
(ADR 0002): mana punktuje, gdy PRZESUWA PRÓG opłacalności. Benchmark bez
regresji: **61,5 %** vs aggro (było 61,7 %; ±0,2 pp to szum na 1248 meczach).

**C (M129).** Ptaszek wyciszenia w panelu akcji dostał powiększony obszar
dotyku już w M91; wizard walki został wtedy pominięty i nie miał ANI JEDNEJ
reguły CSS. Celem dotyku jest teraz cały wiersz (`<label>`, ≥ 44 px — próg
Apple HIG), ptaszek ma 24 px, a stan zaznaczenia widać na całym wierszu.
Ta sama opieka objęła steppery przydziału obrażeń (L28 — rodzina, nie łatka).

**Pułapka metodyczna tej sesji.** Pierwsza wersja testów M128 była FAŁSZYWIE
ZIELONA w obie strony: kopia „przed naprawą" powstała już po edycji pliku,
a asercja patrzyła na `abilityIndex 0`, podczas gdy bot sięgał po drugą
zdolność. Dopiero porównanie z `git show HEAD:` i wypisanie realnych decyzji
pokazało prawdę. Stąd nowa lekcja L34.

**Wynik:** `npm run test:all` **2155/2155**, 0 failów (+22 od M126: 10 testów
dla A, 6 dla B, 6 dla C). Build zielony. Każda naprawa ma test
regresyjny, test anty-over-fix i **weryfikację mutacyjną** (uszkodzenie kodu →
test pada). Plan:
`docs/plans/PLAN_2026-08-17-m127-uwagi-wlasciciela-abc.md`.

## M139 — wycena tapowania zna MOMENT (2026-08-18, PR #58)

Uwaga właściciela: „najefektywniejsze jest tapowanie kreatur przeciwnika po
jego fazie untap — wtedy taka kreatura jest nieczynna i w ataku, i w obronie”.

Wycena znała tylko CEL (`8 + 2*power`), nie znała CHWILI, więc wszystkie okna
były równe. Trace scoringu potwierdził uwagę i pokazał, że bot tapował
w oknach najsłabszych, a najlepsze pomijał.

| okno | wycena po zmianie |
|---|---|
| upkeep przeciwnika (tuż po jego untap) | **61** |
| main przeciwnika (przed deklaracją) | 57 |
| jego `declare_attackers` (już atakuje, CR 506.4) | 43 |
| moja main (samo zdjęcie blokera, CR 509.1a) | 39 |
| mój koniec tury (wyparuje przy jego untap) | **−30** — bot pasuje |

Cel JUŻ tapnięty schodzi z 61 na 21: sam lock jeszcze coś wnosi, samo
tapnięcie nic.

**Pułapka, którą trzeba było obsłużyć:** kara „nie tapuj w swojej turze”
zamieniłaby SORCERY tapujące (Aerith Rescue Mission) w kartę nie do zagrania
NIGDY — sorcery wolno rzucić wyłącznie we własnej głównej fazie. Kara działa
więc tylko tam, gdzie czekanie jest wykonalne; rozstrzyga deskryptor
(`ability.timing`, typ karty / flash), nie nazwa karty (ADR 0002).

**Przy okazji (L41):** ścieżka CZARÓW nie miała pozytywnej wyceny tapowania
w ogóle — miała ją tylko ścieżka zdolności. Obie liczą teraz przez wspólne
`tapTargetValue`/`tapTimingBonus`; objęte zostały też `tap_permanents`
i `dont_untap_next_untap_step`, dotąd pomijane mimo obecności w tabeli
efektów wrogich.

**Pakiet:** `test:all` **2231/2231**, build zielony, benchmark 63,1 % / 90,5 %
(bez regresji — w bazie jest 11 kart tapujących, więc wpływ na średnią jest
z natury mały). Mutacja: 4 z 8 testów pada przeciw kodowi sprzed zmiany.

## M138 — audyt „wcielam się w gracza” (2026-08-18, PR #58)

Zlecenie właściciela: rozegrać partie jako GRACZ przy wirtualnym stole,
obserwować interfejs i przebieg gry, zebrać 10 znalezisk, naprawić je, a nowe
klasy błędów dopisać do automatycznych detektorów Testera.

**22 partie** (12 talii, 5 profili, oba tryby logowania). Detektory zgłosiły
w nich zero nowych rzeczy — wszystkie znaleziska pochodzą z czytania
transkryptu w roli gracza. To jest główny wniosek tej rundy i powód, dla
którego powstały trzy nowe reguły wykrywania (L40).

| # | Znalezisko | Warstwa |
|---|---|---|
| Z1 | bot 24× dał Zadeptywanie MOIM stworom (płacił za korzyść przeciwnika) | bot |
| Z2 | kafel kłamał o koszcie — 8 pól bez obsługi (`{1},{T}` zamiast `{R},{T}, odrzuć kartę`) | UI |
| Z3 | warunkowy keyword bez skutku („gdy ma licznik +1/+1” i tyle) | UI |
| Z4 | log: „nic się nie wydarzyło”, a stwór zmienił się z 1/3 na 3/3 | engine |
| Z5/Z8 | etykieta celu bez parametru („stwór o sile **≥**” bez liczby) | UI |
| Z6 | Spacecraft po progu Station dalej wyglądał na zwykły artefakt | UI |
| Z7 | „korzysta z efektu «you may»” — bez nazwy karty | log |
| Z9 | aura Grounded: kafel BEZ ŻADNEJ treści reguł | UI |
| Z10 | Regenerate jako samotne „{3}” w środku kafla | UI |
| Z11 | Moonlit Meditation — kolejna aura z pustym kaflem | UI |

**Wzorzec:** 8 z 11 to jedna choroba — informacja jest w danych, ale mapa
opisów jej nie zna. Koszt zdolności liczyły TRZY niezależne kopie kodu, każda
znająca inny podzbiór pól (L41). Naprawa: jedna wspólna tabela
`NON_MANA_COST_LABELS` + strażniki dwustronne („każde pole obecne w danych ma
opis”), zamiast łatania pojedynczych kart.

**Z1 — jedyna usterka bota.** `grant_keywords_until_end_of_turn` nie istniał
w scoringu, więc warianty remisowały i bot brał pierwszy cel z brzegu. Ta sama
klasa co M96 (cele-gracze) i M135 (scry) — trzeci raz ten sam mechanizm, stąd
wpis do lekcji. Po naprawie: 10 aktywacji, wszystkie we własne stwory.

**Z4 — cisza, która kłamie.** `resolveTrigger` uznaje „0 nowych zdarzeń” za
„trigger bez efektu”, a trzy efekty mutowały stan bez emisji (L24). Efekt nie
tylko był niewidoczny — produkował AKTYWNIE fałszywy komunikat u gracza.

**Nowe detektory** (`tools/table-tester/detectors.mjs`):
`detectBotBuffsMyCreatures`, `detectFalseNoEffect`, `detectTruncatedCardText`.
Zweryfikowane dwustronnie (zgłaszają przed naprawą, milczą po). W pierwszym
audycie kontrolnym znalazły Z11 — przypadek, którego nie zauważyłem ręcznie.

**Pakiet:** `npm run test:all` **2224/2224**, `npm run build` zielony.
Weryfikacja mutacyjna: przeciw kodowi sprzed audytu pada 14 z 16 testów.
Szczegóły z cytatami: `docs/audits/AUDYT_2026-08-18-m138-zywy-tester.md`.
Lekcje: **L40** (zero zgłoszeń mierzy narzędzie), **L41** (trzy kopie logiki
rozjeżdżają się cicho).

## M134–M137 — runda 3: cztery tematy z backlogu (2026-08-18, PR #58)

Właściciel wskazał backlog jako **zbiór pomysłów**, nie zobowiązań, i zostawił
decyzję o podjęciu tematów. Wzięte wszystkie cztery. Rozkład wyników jest
pouczający: **jedna realna usterka gry, jedna luka narzędzia, jeden dług
infrastrukturalny i jeden przegląd bez znalezisk** — i każdy z nich wyszedł
ze strażnikiem, także ten czysty.

| # | Temat | Co się okazało | Strażnik |
|---|---|---|---|
| M134 | puste kolejki decyzji / opisy w logu | log **kompletny** (177/177, 50/50 `resolve_*`); efekt uboczny: 4 martwe typy zdarzeń | `test/m134-kompletnosc-zdarzen.test.js` |
| M135 | wycena decyzji bota (scry/surveil) | **realna usterka**: warianty remisowały na `score: 20` | `test/m135-wycena-scry-surveil.test.js` |
| M136 | pokrycie sondy „oferta bez skutku" | **3 luki**: krok kolejności surveil, damage wizard, wizard `index` | `test/m136-sonda-wizardow.test.js` |
| M137 | kontrakt `addObject` (L21) | 4 pola ginęły po cichu; **2 fałszywie zielone testy** | `test/m137-kontrakt-addobject.test.js` |

**M134 — przegląd, który nic nie znalazł.** Zamiast odhaczyć: skoro własność
dało się zmierzyć automatycznie, pomiar został testem. Kompletności logu nie
pilnowało dotąd NIC, a brak opisu objawia się graczowi surowym slugiem
(`describeGameEvent` ma `default: return e.type`) — tak powstały M96 i M126.
Strażnik jest dwustronny: pilnuje i opisów, i tego, że rejestr `EVENT_TYPES`
nie obiecuje zdarzeń, których nikt nie emituje (L29). Martwych było 6, cztery
usunięto (183 → **179**), dwa zostają — używa ich warstwa stołu.

**M135 — bot brał pierwszą ofertę, bo wszystkie miały tę samą cenę.** Wycena
rozpoznawała jeden przypadek („land przy przesycie"), reszta dostawała równe
`20`. Trace potwierdził remis. Zmierzony skutek: przy scry 1 bot odkładał na
spód Highland Game (2/1 za {2}) — dobrego, taniego stwora. Naprawa: JEDNA
funkcja `cardKeepValue` używana przez scry, surveil i clash, zamiast trzeciej
kopii tego samego `if` (L28). Rozróżnia semantykę: scry odkłada na SPÓD,
surveil wyrzuca do GROBU (CR 701.44 — strata nieodwracalna), więc surveil ma
wyższy próg zatrzymania. **Benchmark: 62,1 % → 63,0 % vs aggro, 89,3 % → 90,4 %
vs random.**

**M136 — luka w NARZĘDZIU, nie w grze.** Sonda audytowa mierzy tylko przyciski
z `data-option-key`; dwa ekrany decyzyjne go nie miały, więc były dla audytu
niewidzialne — a to dokładnie te miejsca, gdzie „oferta bez skutku" boli
najbardziej. Klucz liczy się z AKTUALNEGO stanu wizarda (kolejność kart,
pozycje stepperów), więc opisuje komendę, która naprawdę poleci.

**M137 — spłata długu z L21 trybem ostrzegawczym.** L21 szacowała „~40 plików";
twarda walidacja wywaliła **141 testów**, bo pola wchodzą przez `...spread`
w helperach (46 plików, żaden statyczny fixer ich nie złapie). Rozwiązanie
dwutrybowe: domyślnie ostrzeżenie z konkretną podpowiedzią naprawy (raz na
pole), `MTG_STRICT_ADD_OBJECT=1` → wyjątek. Kod w `src/` jest czysty i pilnuje
tego osobny test, więc **nowy dług jest od dziś niemożliwy**, a stary spłaca
się przy okazji. Automat posprzątał 39 wywołań w 23 plikach.

Wypłata przyszła od razu, jeszcze zanim strażnik cokolwiek zabezpieczył:
ostrzeżenia wskazały **dwa testy przechodzące z fałszywych powodów** —
`audit-m84-tester` (licznik `+1/+1` nie powstawał) i „BUG3 amass" (oczekiwał
2 liczników, bo startowy ginął; poprawnie są 3). Wniosek metodyczny: test,
który zaczyna padać po naprawie infrastruktury, bywa DOWODEM fałszywej
zieleni, nie regresją — sprawdzaj intencję, zanim przywrócisz starą liczbę.

**Pakiet:** `npm run test:all` **2196/2196**, `npm run build` zielony.
Lekcje: **L38** (strażnik na istniejący kod projektuj dwutrybowo),
**L39** (przegląd bez znalezisk wychodzi ze strażnikiem); L21 domknięta.

## M130–M133 — runda 2: decyzje właściciela i dwa zgłoszenia (2026-08-17, PR #58)

**Decyzje właściciela.** (1) Test „bot tapuje latarnię przy pustej ręce"
USUNIĘTY — scenariusz M126 opisywał zachowanie po prostu błędne, nie należało
go ratować przeredagowaniem. (2) `docs/TODO.md` → **`docs/backlog.md`**: plik
jest zbiorem pomysłów, nie kolejką zadań (nagłówek przepisany, wpis
w `AGENTS.md`, żeby kolejna sesja go tak traktowała).

| # | Zgłoszenie | Root cause | Warstwa |
|---|---|---|---|
| A (M131) | „swampcycling działa tylko na Swamp — po co modal?" | decyzja z 1 realnym wariantem otwierała modal | UI |
| B (M132) | „za mało lądów po dodaniu kart" | konwencja 2:1 żyła tylko w prozie README, bez strażnika | dane |
| — (M133) | crash silnika ujawniony przy okazji | obrażenia w cel poza polem bitwy rzucały wyjątkiem zamiast fizzlować | engine |

**A.** Po dedup z M122 typecycling zostawiał w modalu jedno bagno + „nie
znajduj karty" — pytanie „czy chcesz to, o co właśnie poprosiłeś?". W katalogu
istnieje zresztą tylko jedna karta o podtypie Swamp, więc ten modal NIGDY nie
niósł wyboru. Reguła generyczna po kształcie decyzji (opcja rezygnacji
`found: null` / `skip: true`), więc obejmuje też przyszłe decyzje opcjonalne.
Rezygnacja zostaje osobnym przyciskiem (CR 701.19b — nie odbieramy ruchu).

**B.** Intuicja właściciela potwierdzona pomiarem: green 2,52 · red 2,32 ·
black 2,25 · azorius 2,18 karty nielandowej na ląd (próg 2,00). Dosypane
lądy (+6/+3/+3/+3) i **dodany strażnik** `test/m132-proporcje-landow.test.js`,
który podaje wprost, ilu lądów brakuje — bo prawdziwą przyczyną był brak
egzekucji reguły, nie pojedynczy zapomniany batch.

**M133 (znalezione przy okazji).** Zmiana talii wywaliła benchmark:
`Error: Nieprawidłowy cel obrażeń` przerywał CAŁY proces, gdy cel zdolności
zginął przed jej rozstrzygnięciem. Błąd siedział w kodzie od dawna — talie
tylko trafiły w tę ścieżkę. Naprawione u źródła (fizzle wg CR 608.2b) + nowe
zdarzenie `damage_fizzled` z powodem i opisem w logu (L24).

**Próbka benchmarku 4 → 8 seedów.** Spadek 61,5 % → 56,3 % vs aggro (poniżej
progu 57 %) okazał się szumem 4-seedowej próbki: 8 seedów → 62,1 %,
16 seedów (4 992 mecze) → **63,6 %**, czyli bot jest po zmianach SILNIEJSZY
niż przed nimi. Progi bez zmian (zasada „tylko w górę").

**Koszt uboczny:** pięć testów z zamrożonym seedem przelosowano hunterem
(inny skład talii = inne rozdania) — to konwencja repo, nie regresja. Szósty
(mulligan) opisywał przypadek zamiast reguły i został przepisany.

**Wynik:** `npm run test:all` **2169/2169**, 0 failów. Build zielony.
Nowe lekcje: **L36** (próg na małej próbce mierzy szum — sprawdź, czy zmieniło
się to, co metryka mierzy) i **L37** (zmiana danych wejściowych to darmowy
fuzzing silnika — crash po zmianie talii to wina reguły, nie danych).

## M140 (2026-08-18) — challenge „brązowa odznaka wyłapywacza błędów”

Zlecenie właściciela: znaleźć i naprawić **pięć unikalnych** niezgodności
z zasadami MtG, własnymi ścieżkami (inne sesje przeorały już wiele obszarów).

**Metoda** — trzy niezależne narzędzia, żeby nie powielać cudzych tropów:
fuzzer regułowy (headless mecze bot vs bot, po każdej komendzie kontrola
inwariantów CR), audyt pokrycia deskryptorów (każdy efekt użyty w kartach ma
obsługę w silniku i odwrotnie) oraz testy izolowane per reguła. Każde trafienie
fuzzera reprodukowane osobno przed zgłoszeniem — checki na stanie PO komendzie
dają fałszywe alarmy.

**Znaleziska i naprawy:**

1. **Transformacja gubiła rodzaj permanentu i P/T** (CR 400.7 / 611.2c / 208.1).
   Ożywiony artefakt (Skilled Animator: 5/5) po crafcie zostawał stworem
   z `power/toughness = null` — obiekt łamiący CR 208.1, którego SBA nie
   potrafiły zabić (`null <= 0` to `false`, więc był nieśmiertelny). Ten sam
   defekt w trzech miejscach: craft, daybound→nightbound, flicker-transform.
   Naprawa: wspólny helper `transformedCharacteristics()`, a `materialize.js`
   niesie `kind` drugiej strony (wcześniej trzeba było zgadywać z linii typów).

2. **Token pozostawał w grobie i wygnaniu** (CR 111.7 / SBA 704.5e). Duch tokenu
   dawał się wskazać jako „target card in your graveyard” (Barkform Harvester)
   i wskrzesić efektem reanimacji; token-kopia wygnana przez craft zostawała
   w exile (wykryte w realnej partii, seed 9028). Naprawa: reguła stanu usuwa
   token poza polem bitwy, deskryptor tokenu jest teraz jawny (`isToken`).

3. **Goad błędnie zabraniał blokowania** (CR 701.38b). Reguła nakłada wyłącznie
   wymogi ATAKU i wprost zaznacza, że goad nie jest zdolnością; o blokowaniu nie
   mówi nic. Silnik odbierał obrońcy legalne bloki w trzech miejscach, a test
   z poprzedniej sesji utrwalał ten błąd — został odwrócony z uzasadnieniem.

4. **Zakryty permanent zdradzał tożsamość** (CR 708.2). Widok ukrywał `cardId`
   i typy, ale wysyłał `subtypes` oraz deskryptor `morph` z kosztem i KOLORAMI —
   wszystkie pięć morphów w rejestrze było jednoznacznie rozpoznawalnych, więc
   mgła wojny była pozorna. Test regresyjny wymusza NIEROZRÓŻNIALNOŚĆ zakrytych
   permanentów zamiast pilnować listy pól.

5. **Token-kopia dziedziczyła animację** (CR 707.2). Kopia ożywionego artefaktu
   rodziła się jako stwór 5/5 i po wygaśnięciu animacji oryginału zostawała
   trwałym stworem, którym karta nigdy nie była. Kopiowalne są wartości z karty
   — naprawa czyta stan sprzed animacji (`originalBeforeAnimation`).

**Wynik:** `npm run test:all` **2248/2248**, 16 nowych testów regresyjnych
(`test/m140-odznaka-wylapywacza.test.js`), wszystkie po deskryptorach (ADR 0002).
Benchmark bez regresji: heuristic 63,1 % vs aggro, 90,5 % vs random, łącznie
**76,8 %** (1918/2496). Fuzzer po naprawach: 288 partii, 0 naruszeń.

Nowe lekcje: **L43** (siła deskryptora musi odpowiadać sile skutku — do
kasowania obiektu potrzeba flagi jawnej), **L44** (komentarz z numerem reguły
nie jest dowodem; błędna interpretacja utrwala się przez test), **L45** (mgłę
wojny testuj przez nierozróżnialność, nie przez listę zasłoniętych pól).

## M141 — głębokie interakcje wielokartowe (2026-08-18, 5 bugów na stykach mechanik)

**Zlecenie:** plan M141 (styki aura+transform, equipment+kontrola, station+animacja) + fuzzer semantyczny + audyt stołu. Metoda: trzy osie — fuzzer headless z inwariantami semantycznymi (zdarzenia vs delta stanu), skan styków deskryptorów, audyt warstwy stołu (FoW). Każde znalezisko: repro → root cause → test RED→GREEN → weryfikacja mutacyjna.

**Znaleziska i naprawy (wszystkie po deskryptorach — ADR 0002, nie po nazwach kart):**

1. **Station + animacja — cleanup gubił stwora (CR 205.1 / 122.1).** Wedgelight Rammer (Spacecraft, próg 9+ charge → stwór) ożywiony przez Skilled Animator do 5/5, po osiągnięciu 9 charge i zakończeniu animacji w `clearStatModifiers` wracał do artefaktu (rodzaj z `originalBeforeAnimation`), mimo spełnionego progu station. Root cause: `clearStatModifiers` odtwarzał pierwotne cechy, ale nie resynchronizował `kind` wg liczników. Naprawa: `syncStationKind` eksportowana z `counters.js` i wołana po przywróceniu animacji. Test: `M141/A` — po animacji 5/5 i 9 charge cleanup zostaje stworem 3/4.

2. **Token-kopia traciła station/saga (CR 707.2).** Kopia Wedgelight Rammer (Cogwork Assembler) rodziła się jako artefakt bez progu 9+, nigdy nie stawała się stworem, choć kopia ma mieć WSZYSTKIE drukowane cechy (station, saga). Root cause: `create_copy_token` w `effects.js` kopiował `kind/power/types/...` ale nie `station`/`saga`; `createBattlefieldToken` w `tokens.js` nie przyjmował tych pól. Naprawa: oba miejsca niosą `station`/`saga` z `src` (stan PRZED animacją). Test: token ma `station.threshold 9`, po 9 charge staje się stworem.

3. **Benevolent Blessing zdejmowała samą siebie (CR 702.16 + L21).** Aura `Enchant creature, choose color, protection from chosen` po wyborze koloru i `runStateBasedActions` trafiała do grobu mimo klauzuli Oracle „doesn't remove Auras and Equipment you control that are already attached”. Root cause podwójny: (a) `createGameObject` (`identity.js`) odtwarzał `aura` tylko z `pump/keywords/enchant/...` bez `chooseColor` i `keepOwnAttachmentsOnProtection` — obiekt nigdy nie miał `chooseColor`, więc `pendingColorChoice` nie powstawał, a flaga keepOwn ginęła; (b) `removeIllegalAttachments` usuwał KAŻDY biały artefakt z ochrony, nie rozróżniając własnych już przypiętych. Naprawa: `registry.js` + `identity.js` zachowują oba pola, `attachments.js` sprawdza flagę `keepOwn` i kolor `chosenColor` — własna biała aura/equipment już przypięty zostaje, przeciwnika spada. Test: własna Benevolent zostaje, przeciwnika biała aura spada.

4. **Jwari Shapeshifter jako kopia tracił station/saga (CR 707.2).** `resolve_enter_as_copy` w `game-state.js` kopiował `power/toughness/types/...` ale nie `station`/`saga`. Root cause: ten sam wzorzec co #2, osobna ścieżka wejścia. Naprawa: dopisano oba pola z celu. Test: Jwari jako kopia Ally ze station zachowuje próg.

5. **Oferta czaru vs walidacja — protection od koloru (CR 702.16b).** Bot w benchmarku wybierał biały czar na cel z `protection from white` (Benevolent), `legalSpellCasts` oferował go (bo `legalTargetCandidates` filtrował tylko `isProtectedFromSource` dla jakości, nie `effectiveProtectionFromColors` dla koloru), a `validateTargets` odrzucał — crash `illegal_spell: protection` oraz `aggro-bot` nie znał `resolve_color_choice`/`resolve_index_choice`, więc `Kontroler nie znalazł ruchu`. Root cause: rozdźwięk oferta/walidacja (zaniedbanie przy wprowadzaniu ochrony) + brak obsługi nowych `resolve_*` w `aggro-bot`. Naprawa: `legalTargetCandidates` filtruje także `effectiveProtectionFromColors` vs `source.colors`; `legalSpellCasts`/`legalCleaveCasts`/… przekazują `sourceObject`; `aggro-bot` dostał brakujące `simple` i fallback `anyResolve`. Benchmark: 312 meczów z `--seeds 2` bez crashy (wcześniej 1/312).

**Weryfikacja:** `npm test` **2244/2244** (było 2239, +5 nowych `m141-...`), `npm run build` 51 modułów / 1912.8 kB, benchmark szybki `node tools/benchmark.mjs --seeds 2` 0 crashy, fuzzer azorius 200 partii 0 naruszeń (po naprawach). Testy po deskryptorach (ADR 0002), każdy z mutacją odwracającą.

Nowe lekcje: **L46** (animacja + trwały stan — cleanup musi resynchronizować trwałe cechy), **L47** (kopiowalne cechy to WSZYSTKIE drukowane deskryptory, nie tylko P/T), **L48** (flaga keepOwn musi przejść cały łańcuch `registry → gameObject → pendingChoice → SBA`, inaczej ginie po cichu — L21).

## Zasada aktualizacji

Każdy PR zmieniający kierunek projektu powinien odpowiednio aktualizować:

- ten plik — jeśli zmienia się bieżący stan lub następny krok;
- `docs/ROADMAP.md` — jeśli zmienia się kolejność etapów;
- ADR — jeśli zapada lub zmienia się decyzja architektoniczna;
- dokumentację karty/mechaniki — jeśli zmienia się zakres jej obsługi.
