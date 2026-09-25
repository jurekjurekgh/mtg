# Plan sesji 2026-09-25a — uwagi z gry: wybór „may not untap" (Entrancing Lyre) i wycena keywordów aury (Serra's Embrace)

**Gałąź:** `arena/01a0d532-mtg` · **Baza:** `0b2f771` (squash PR #136) · **PR:** #137 (ten sam — ADR 0013: 1 sesja = 1 gałąź = 1 PR; sesja 24f nie została scalona, więc jej PR jest kontynuowany)
**Zlecenie:** dwie uwagi właściciela z żywej gry (A: Entrancing Lyre, B: Serra's Embrace).
**Tryb:** ADR 0020 (PR → audyt → inkrementalne commity) + ADR 0021 (audyt poprzedniego scalonego PR już wykonany w sesji 24f — raport `docs/audits/AUDYT_PR136_2026-09-24f.md`; nie powtarzam go, tylko wykorzystuję).

## 0. Rozpoznanie (wykonane PRZED tym plikiem, zmierzone)

- Lektura obowiązkowa w całości: `AGENTS.md` (368 linii), ADR 0002/0003/0005/0016/0017/0020/0021/0022/0029/0030, `docs/LESSONS.md` L1–L169 (2567 linii, do ostatniej), `docs/setup/ENVIRONMENT.md` (189), handoff 24f.
- Bramy startu (po rekonstrukcji po resecie sandboxa, sesja 24f): `npm test` **6545/6545**, `npm run test:all` **6555/6555**, build **60 modułów / 4257,9 kB**, `bot-benchmark` **10/10**, katalog **562/509/1**.
- **Pomiar A** (sonda `.sonda.mjs` na silniku, przed jakąkolwiek zmianą):
  - definicja `entrancing-lyre` ma wyłącznie `activated: tap_permanent + lock_untap`; **żaden** deskryptor wyboru (`keys: []` dla `/untap|choice|static/i`);
  - po untapie p2 blokowany stwór zostaje tapnięty (`prey tapped = true`) — **blokada działa poprawnie**;
  - po untapie p1 lira też zostaje tapnięta (`lyra tapped = true`) — **bez pytania kogokolwiek**, bo `permanents.js:98 isActiveLockSource` decyduje deterministycznie;
  - oferty p1 w upkeep jego tury: `["concede","pass_priority"]` — **żadnego wyboru** (owner: „na dzisiaj nie ma tego wyboru" — potwierdzone).
- **Pomiar B** (sonda, bot z 6 landami + `serras-embrace` w ręce, trzej własni stwórzy 3/3: bez keywordów / `flying` / `flying+vigilance`):
  - `legalCommands` niesie **trzy** warianty `cast_permanent(aura→golus|latacz|czujny)`;
  - **wszystkie trzy = 72,9 punktu**, wybrany `golus` (kolejność enumeracji, nie ocena);
  - to **remis wariantów = brak wymiaru** (L169) — nie „bot wybrał największego", tylko „bot wybrał pierwszego".
- Podstawa regułowa, **dosłownie z bieżącego wydania CR** (lustro `cr-raw.txt`, chunk 30, ADR 0030):
  - **CR 502.3**: „Third, the active player **determines which permanents they control will untap**. Then they untap them all simultaneously. This turn-based action doesn't use the stack. Normally, all of a player's permanents untap, but effects can keep one or more of a player's permanents from untapping."
  - **CR 502.4**: „No player receives priority during the untap step, so no spells can be cast or resolve and no abilities can be activated or resolve. Any ability that triggers during this step will be held until the next time a player would receive priority, which is usually during the upkeep step."
  - **CR 503.1**: „The upkeep step has no turn-based actions. Once it begins, the active player gets priority."
  - Wniosek: decyzja 502.3 **nie jest aktywacją zdolności** (nie potrzebuje priorytetu) i musi zapaść **przed** odkręceniem, czyli wewnątrz kroku odkręcania. Trigger „whenever ~ becomes untapped" (502.4 w zw. z 503.1a) zostaje przełożony na `pendingTriggers` BEFORE upkeep priority, więc pytanie wystawione u progu upkeepu, a rozstrzygnięte PRZED przetoczeniem triggerów, daje identyczny przebieg — to nasze okno implementacyjne (kolejność względem triggerów zachowana, CR 502.4/503.1a).
- Oracle teksty potwierdzone ze snapshotów w repo (ADR 0010/0022): `docs/cards/scryfall-entrancing-lyre.json` (4 rulingi WotC, m.in. „If Entrancing Lyre becomes untapped before its activated ability resolves, the target creature is tapped, but it can untap as usual"), `docs/cards/scryfall-serras-embrace.json` (bez rulingów; czyste `+2/+2 and has flying and vigilance`).
- Rodzina mechaniki A jest SZEROKA poza katalogiem (scan Scryfall przez `web_search`): „You may choose not to untap this **artifact / creature / land**…" — Entrancing Lyre, Amber Prison, Ashnod's Battle Gear, Deserter's Quarters, Endoskeleton, Flowstone Armor, Helm of Possession, Preacher, Coffin Queen, Ice Floe, Mana Leech, Sand Squid, kuriersy (Flamestick/Everglove/Frightshroud/Ghosthelm), Thalakos Dreamsower, The Pandorica. ⇒ mechanika **nie może** być associated z „artefaktem" ani z ID karty (ADR 0002).
- Rodzina B: aury nadające keywordy w katalogu (scan `aura: {.*keywords`): `serras-embrace` (flying+vigilance), 3806 (flying), 3881 (trample), 4008 (trample), 6713 (lifelink), 7506 (reach), 10343 (flying) + equipmenty 310 (flying+haste), 4423 (trample), 7332 (reach). Wycena `descriptor.keywords` **nie istnieje** — jedyne odczyty tego pola w bocie to `(descriptor?.keywords ?? []).length === 0` (klasyfikacja pure-protection, l. 4523/4536).

## Etap A — silnik: generyczna mechanika „untap choice" (CR 502.3)

- [ ] A1 — deskryptor `untapChoice: true` na zdolności statycznej karty; przechodzi **cztery** warstwy (L21): `card-data.js` → `materialize.js`/`gameObjectDataOf` → `identity.js` (pole obiektu) → `registry.js` (normalizacja, czwarta kopia listy pól!). Test RED: karta na polu bitwy niesie deskryptor.
- [ ] A2 — `permanents.js`: `untapControlled` przyjmuje jawny zestaw „kept tapped" i **przestaje** decydować przez `isActiveLockSource`; `isActiveLockSource` usuń albo zostaw wyłącznie tam, gdzie dziś jest drugą nogą (DECYZJA: po audycie wywołań — blokada „as long as this remains tapped" wynika z `untapLockedBy`+`tapped`, nie z heurystyki).
- [ ] A3 — bramka decyzji w `game-state.js`: w bloku `state.turn.number !== previousTurnNumber` (l. 5418+) wystaw `state.pendingUntapChoice = { playerId, candidateIds }` ZANIM cokolwiek z `beginTurn` (dzień/noc 502.2 jest PRZED odkręceniem — kolejność zachowana), a kontynuację (reszta bloku 5418–5475) wydobądź do jednej funkcji wołanej z obu miejsc. Oferty: „odtapuj wszystkie" (pusty zbiór) + każdy podzbiór kandydatów do pozostawienia w tapie, **z capem 32** (L19) i kluczem kanonicznym (L151).
- [ ] A4 — komenda `resolve_untap_choice { keepTappedIds }` + walidacja jednym predykatem z ofertą (L48): właściciel decyzji, subset kandydatów, bez duplikatów, odrzucenie przy braku decyzji (`untap_choice_unresolved`). Bramka `execute`: wszystkie komendy poza `resolve_untap_choice`/`concede` odrzucane, dopóki decyzja wisi — triggerów upkeepowych NIE tłumaczymy, bo `beginTurn` jeszcze nie pobiegł.
- [ ] A5 — checklista L95 (10 punktów) dla nowej decyzji blokującej: `createGameState`, detektor decyzji, bramka `execute`, WSZYSTKIE strażniki priorytetu (grep po rodzeństwie `pendingCounterPay`/`pendingAuraHost`), `EVENT_TYPES`+`COMMAND_TYPES`, oferta `legalCommands`, klasyfikator + wycena OBU botów, `PAYMENT_DECISION_TYPES` w wizardzie płatności (tu decyzja nie płaci many, ale sprawdzam, czy lista wymaga wpisu), `describeGameEvent`, etykiety render.
- [ ] A6 — fingerprint: `pendingUntapChoice` w `PENDING_DECISION_FIELDS` (L16) + test „dwa stany różniące się tylko tym polem mają RÓŻNY odcisk" (L102 pkt 3).
- [ ] Kryterium A: `npm test` zielone; sonda A powtarzalna: przy kandydacie pojawia się decyzja, „Zostaw tapnięte" trzyma blokadę, „Odtapuj" ją zdejmuje (a stwór i tak nie odkręca się w TEJ turze — bo odkręcanie już minęło: CR 502.3 dotyczy bieżącego kroku).

## Etap B — kontrolery: wycena decyzji o odkręcaniu (bez tego bot weźmie pierwszą ofertę = L169)

- [ ] B1 — wymiar z widoku (ADR 0017, L169 pkt 1): ile cudzych/create'ów jest faktycznie zablokowanych przez ten permanent (`untapLockedBy` + wersje) oraz czy efekt „for as long as this remains tapped" działa. `PlayerView` musi to nieść — jeśli nie niesie, naprawa jest w SILNIKU (L1), nie w zgadywaniu bota.
- [ ] B2 — `heuristic-bot`: `case 'resolve_untap_choice'` z wyceną (nie 0 — L131), `summarize()`, `tieProjection`; kara za pozostawienie w tapie, gdy nie blokuje nic (brak argumentu → odtapuj).
- [ ] B3 — `aggro-bot`: wpis w `simple` (uwaga z L159: mutacja usunięcia wpisu aggro bywa no-opem — dowieść, że gałąź jest żywa).
- [ ] B4 — test na DWU kierunkach (L131/L117): różne stany (blokada aktywna / bez blokady) dają różne punkty; tool `node tools/bot-tie-audit.mjs --gate=untap_choice` jako bramka klasy.

## Etap C — prezentacja i tester

- [x] C1 — `render.js`/`session.js`: opis decyzji dla gracza („Które permanenty zostają tapnięte w tym kroku odkręcania?"), etykiety opcji nazywające SKUTEK (L154: przycisk musi mówić, co dostaję za odmowę), zdarzenie `untap_choice_resolved` w logu (L24: skutek bez zdarzenia nie istnieje).
- [x] C2 — `tools/table-tester/run-game.mjs`: sterownik obsługuje nowy modal (L12: braki naprawiamy W testerze; L63: licznik zabitych pętli), ptaszki `OPTION_IGNORABLE_TYPES` zaktualizowane razem z UI (L137).
- [x] C3 — partia celowana na CHWILOWEJ talii z Lyrą (L137 + pułapka 24f: talia audytowa w `decks/` psuje 5 strażników → trzymaj poza repo, usuń PRZED bramką, `npm run build` po usunięciu).

## Etap D — uwaga B: walidacja keywordów nadawanych przez aurę/equipment

- [ ] D1 — test RED na obecnym kodzie: trzej gospodarze 3/3 (bez kw. / flying / flying+vigilance) z `serras-embrace` w ręce dają **trzy razy ten sam wynik** (72,9 — zmierzone) → pin: `golus` (bez flying) > `latacz` (flying) ≥ `czujny`.
- [ ] D2 — wspólny helper dla CAŁEJ rodziny (L54 pkt 3, L41): świeże keywordy (brak u gospodarza) i redundancja (już ma) liczone JEDNĄ funkcją, z `IDEMPOTENT_EOT`-owego pokrewieństwa (M179/A1 ma to dla `grant_keywords_until_end_of_turn`, aury/equipmenty nie miały NICZEGO).
- [ ] D3 — wartości pod nazwami w `HEURISTIC_PARAM_KEYS` + `DEFAULT_HEURISTIC_PARAMS` (rodzina „aura", M257 r4/T1) z **kalibracją L169 pkt 3**: najsłabszy realny wariant wart dokładnie tyle co przed zmianą, redundancja schodzi PONIŻEJ remisu, ale nie pod kreskę passu dla sensownej aury (kara musi przebić premię — L54 pkt 1, L3).
- [ ] D4 — equipmenty: `card.equipment` w `cast_permanent` liczy dziś TYLKO pump (komentarz „bez podwójnego liczenia keywordów" — zweryfikować, czy `equip` też przechodzi przez nową funkcję; L72: bliźniacy).
- [ ] D5 — anty-over-fix: aura, której WSZYSTKIE keywordy są redundantne, ale pump robi różnicę, NIE spada poniżej passu; aura na wrogu nadal odrzucana.
- [ ] Kryterium D: `npm test` + `node --test test/bot-params.test.js` (pin `auraBase: 66` i test przepływu na `natures-embrace` — ta aura NIE ma keywordów, więc nie może się ruszyć) + golden-master `bot-scoring-snapshot` (L124: przy zmianie wag mierz TRZY drzewa i przypisz, zanim podniesiesz próg).

## Etap E — pętla jakości (ADR 0021 §4)

- [ ] E1 — Żywy Tester: partie na talii z Lyrą (seedy 77–80) — czy gracz DOSTAJE wybór, czy log go opisuje, czy bot nie wisi; ręczna lektura transkryptu wzdłuż trzech osi (L27).
- [~] E2 (cząść) — łowy CR po ścieżce „nowa mechanika = nowe interakcje": czy `lock_untap` + `untapChoice` nie kłamią w interakcji z: phasingiem (502.1), dniem/nocą (502.2), `dontUntapNextUntapStep` (E8/B2), stun licznikami (CR 122.1d), zmianą kontrolera (CR 400.3), `untapByEffect` (odkręcenie EFEKTEM nie podlega blokadzie kroku — pin M272).
- [~] E3 — sondy własne: decyzja wystawiana TYLKO gdy jest kandydat (nie przy każdej turze), cap 32 przy wielu kandydatach, przebieg z dwiema Lirami naraz.

## Etap F — domknięcie (ADR 0013)

- [ ] F1 — bramy: `npm test`, `npm run test:all`, `npm run build`, `node --test test/bot-benchmark.test.js`, przy zmianach wycen: szybki profil `node tools/benchmark.mjs` (672 mecze, ADR 0018 — pełnego B0 NIE odpalam).
- [ ] F2 — dokumenty: raport `docs/audits/UWAGI_Z_GRY_2026-09-25a.md`, dzienniki (M431), handoff, opis PR #137 kumulatywnie, README tylko jeśli liczby „bieżącego stanu" się zmieniły (L92: mierzyć na KONIEC).
- [ ] F3 — lekcja: budżet lektury ~99,9k/100k (poz. 1 kolejki 24f) ⇒ nowa lekcja TYLKO po skróceniu innej; kandydat do rejestru to klasa „opcja gracza z 502.3 zamodelowana heurystyką silnika" — jeśli nie wejdzie, trafia do raportu + `notes` karty (nie do `limitations`, ADR 0022).

## Ryzyka i pułapki

- **Zmiana wyceny rusza golden-master i benchmark** — L124 (trzy drzewa, atrybucja PRZED podniesieniem progu); L36 (próg na małej próbce mierzy szum).
- **`untapControlled` ma kilku konsumentów** (M429/choroba przywołania, E8/B2 zużycie flagi, M272 stun) — ruszam tylko źródło decyzji, nie semantykę blokad; po każdej podmiance `git diff` + `node --check` (L139).
- **Nowa decyzja = 10 miejsc integracji** (L95): pierwsze czerwone testy to prawie zawsze brakujący rejestr (`COMMAND_TYPES`/`EVENT_TYPES`), nie logika.
- **Tester mierzy `dist/`, nie `src/`** (L76) — rebuild przed każdym pomiarem.
- **Sandbox resetuje workspace** (ENVIRONMENT §2) — push po KAŻDYM zielonym kroku; `git branch -f` na checkoutowanej gałęzi odmawia, użyj `git reset --hard` (potwierdzone w 24f).
- **Polska typografia w `python3`**: `repr()`/licznik trafień PRZED podmianą, grep PO (24f: cyrilica w `podstawa`, literówki w `PIERWSZĄ`).
- **Cap enumeracji podzbiorów**: 2^n przy n kandydatach — cap 32 z deterministycznym porządkiem (L19/L151).

## Status po sesji 2026-09-25a (domknięcie etapu A)

Zrobione: A1–A6 (mechanika + protokół + widok + wycena bota, piny
`test/audyt-m431-untap-choice.test.js` A1–A12), B1–B4 (oś B, wypchnięta
`5d9b41c`), C1–C3 (tabela + żywy tester na „theros + 2× Lyra", seedy 77–82;
chwilowa talia usunięta PRZED bramką), D1–D5, E3 (sondy: decyzja tylko przy
kandydacie, cap ofert, dwie liry naraz — A12/A8), E1 częściowo (tester
zmechanizowany, ręczna lektura transkryptu wzdłuż trzech osi skrótowo).

**Zostaje otwarte ŚWIADOMIE (nie dług ukryty):**
- E2 poza częścią zmierzoną w A12: interakcja blokady z phasingiem (CR 502.1),
  licznikami stun (CR 122.1d) i zmianą kontrolera (CR 400.3) — wymaga
  scenariuszy, których żadna karta w katalogu nie rozgrywa przez `execute`;
  najbliższa sesja niech zacznie od tego, bo to ta sama rodzina błędu co
  `lock_untap`/`dont_untap_next_untap_step` (zakres zamiast stanu);
- E1 w pełnym kształcie (4 partie, transkrypty do `/tmp`, lektura osi
  „czy gracz DOSTAJE wybór") — seedy 77–82 dały ofertę raz na 6 partii, bo
  lira musi być na stole i tapnięta w kroku odkręcania; jeśli ma być
  powtarzalny pomiar, trzeba profilu `explorer` albo talii z samym {0}/{1}
  kosztem (bez nowego batcha kart: nie da się, więc raport ma podawać
  licznik „ofert na 6 partii", nie „0 ofert");
- budżet lektury startowej 100k jest WYCZERPANY → kondensacja
  `docs/LESSONS.md` to zadanie OBOWIĄZKOWE następnej sesji (AGENTS.md §0);
  progu nie podnosimy.
