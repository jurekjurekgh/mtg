# Handoff — PMSSB-90: pętla RĘCZNEGO strojenia scoringu bota, Batch 73 (2026-11-16)

Sesja: `arena/4fa65e47-mtg`, PR **#186** (baza `main`: `5df0e96` = scalenie PR #185). Ta sesja
dokończyła audyt PR #185 (handoff `HANDOFF_2026-11-15.md`, kamień audytu `9bf036b`) i wykonała
zleconą przez właściciela pętlę **PMSSB-90**. Punkt zaczepienia dla następnej sesji: co zostało
zmierzone i naprawione, jakie decyzje właściciela są otwarte, jakie są aktualne wyniki bram i co
zostało w kolejce. Nie jest źródłem zasad — zasady: `AGENTS.md`, ADR-y, `docs/LESSONS.md`,
`docs/setup/ENVIRONMENT.md`.

## 0. Zlecenie właściciela (dosłownie) i jak zostało wykonane

> „Nie potrzebuję ani pełnego B0 ani tuningu. Wystarczy mi uczciwy PMSSB, czyli Pętla MANUALNEGO
> Strojenia Scoringu Bota. Czyli weryfikacja z punktu widzenia pro-playera MtG czy karta jest
> rzucana przez Bota w optymalnym momencie (tura, faza), w optymalny cel, w kontekście aktualnego
> stanu gry (co na stole, jaka ręka, jaka biblioteka, jaki cmentarz) itd."

Wykonane procedurą 0–7 z `docs/PMSSB.md` (finding → root cause → naprawa generyczna → pin RED→GREEN
→ mutacje → ewaluacja → bramy) na **11 realnych kartach batcha 73** (kolekcja 645–655), w czterech
wymiarach: **S** (stan: stół, ręka, biblioteka, grób, mana, próg), **C** (cel), **T** (timing: tura,
faza, krok), **K** (koszt czaru/aktywacji). **`src/controllers/heuristic-params.js` nietknięty** —
pętla nie dodała żadnego pokrętła (`git diff 5df0e96..HEAD -- src/controllers/heuristic-params.js`
jest pusty); każda zmiana to struktura modelu (delegacja do istniejącej skali, brakująca wartość,
brakująca oferta). To jest właśnie różnica między PMSSB a tuningiem wag.

Dokumenty: plan `docs/plans/PLAN_2026-11-16-pmssb90-batch73-petla-reczna.md` (§0–§9, §9 = wynik
pętli), raport `docs/PMSSB.md` → **§PMSSB-90** (tabela 12 wierszy PRZED→PO + granice i rezydua) i
wiersz rejestru rodzin @72, kamień **M465** w `docs/ENGINE_MILESTONES.md`, wpis sesji w
`docs/PROJECT_HISTORY.md` (na górze).

## 1. Co ta sesja zrobiła

1. **Krok 1 — sonda i pomiar PRZED.** `tools/pmssb90-batch73-petla-sonda.mjs` (81 329 B): 53
   scenariusze / **189 rekordów** / 11 kart, eksporty
   `pomiarPrzed/SCENARIUSZE/stan/put/decyzja/opisStanu/pt`, CLI `--scen|--karta|--json|--przebieg`.
   Audyt wierności harnessa H-1…H-7 **podważył dwie przesłanki planu**: pusta biblioteka wyłączała
   `hardRemovalHeldForWorthierTarget` przez `myLibraryCount <= 10`, więc cały pomiar removalu był
   niewierny (H-2 → `ROZMIAR_BIBLIOTEKI = 20`), a `rozliczStos()` ze score w przebiegu (H-3)
   pokazał, że „bot nie atakuje po crew" to artefakt pomiaru, nie defekt. Zrzuty:
   `.arena/pmssb90-{przed,po}.{json,log}` + `.arena/pmssb90-tabela-{przed,po}.txt`
   (konwerter `.arena/tabela-pmssb90.py`).
2. **Krok 2 — audyt macierzowy:** 9 findingów do naprawy, 1 zmierzony bez zmiany kodu, 3 otwarte
   (w tym **F-90/12 nowe**, znalezione w pomiarze BC-03/BC-04 — patrz §3). Kontrole obowiązkowe
   procedury: (a) L41 — sześć rozjazdów znalezionych i zamkniętych, cztery pary zmierzone jako
   POPRAWNE; (b) S11 — koszt czaru różnicuje (Plummet 98 vs Get the Point 86 na ten sam cel);
   (c) M429 — najsłabszy realny wariant wraca do dawnej wartości (SD-01 grób 6 kart = 72,00 =
   dokładnie stan sprzed naprawy).
3. **Kroki 3–4 — naprawy u root cause, każda RED → przyczyna → GREEN → mutacje → bramy → osobny
   zielony commit (ADR 0020 A–D):** `41407d3` (F-90/1, SILNIK), `c402ee5` (F-90/9), `f3ca0af`
   (F-90/2), `70b0fe7` (F-90/3), `7d422f1` (F-90/4), `69be35f` (F-90/5), `0816c42` (F-90/7+8),
   `1c34b4e` (F-90/11), `bc58123` (F-90/10 — piny-kotwice, bez kodu). Silnik: `abilities.js` +116,
   `effects.js` +45, `game-state.js` +23 linii (`git diff --stat 5df0e96..HEAD`).
4. **Krok 5 — ewaluacja:** `bot-scoring-snapshot` **4/4 bez regeneracji** (golden-master bit w bit),
   `bot-tie-audit --gry=2` RC=0 z profilem remisów identycznym jak przed pętlą, Żywy Tester 3 partie
   × 400 kroków bez zgłoszeń. `tools/mirror-eval.mjs` **nieuruchamiany osobno, z podanym powodem**:
   lustro porównuje kandydata (nowe parametry) z baseline (domyślne), a ta pętla nie dodaje klucza
   parametrów; test `bot-mirror-eval.test.js` leci w bramce `all` i jest zielony.
5. **Krok 6–7 — dokumentacja i bramy:** §PMSSB-90 + rejestr + M465 + dziennik + §9 planu + ten
   handoff + opis PR #186; talie chwilowe z etapu E3 audytu usunięte PRZED bramkami + rebuild (M331).

## 2. Bramy na drzewie końcowym (pomiar 2026-11-16, po `bc58123` + dokumentacja)

- `npm test` (fast) — **10 437 / 10 437**, `fail 0`, `skipped 0`, EXIT 0 — zmierzone
  dwukrotnie: po `bc58123` (`.arena/f90-10b-fast.log`) i ponownie na HEAD `695727c`
  (commit dokumentacyjny, `.arena/dok-fast.log`); PRZED pętlą 10 390 — przybyło 46 pinów
  pętli + 1 z fali F-90/9
- `npm run test:slow` — **282 / 282**, EXIT 0
- `npm run test:all` (brama PR) — **10 719 / 10 719**, `fail 0`, EXIT 0 (`.arena/pmssb90-all.log`;
  PRZED pętlą 10 672)
- `npm run build` — **79 modułów / 5920,2 kB**, EXIT 0 (PRZED pętlą 5900,7 kB)
- `node tools/bot-tie-audit.mjs --gry=2` — EXIT 0: 24 partie, 11 364 decyzje, `single 0`,
  `tie_top 569`, **`tie_all 0`**, 2055 decyzji akcyjnych z 569 remisami (27,7%), 172 remisów między
  realnymi wariantami (10,4%), GROZY block=2 / attack=9 / cast_spell=3 — **profil identyczny jak
  przed pętlą** (bazowy stan PMSSB-89, zmierzony, nie naprawiony)
- `node tools/cr-numery.mjs` — OK (561 unikalnych numerów w 6805 cytatach wobec 581 zweryfikowanych;
  w pętli poprawiony jeden cytat: explore to **CR 701.44a**, bo 701.40 w wydaniu CR 2026-11-06 to
  manifest). Uwaga: narzędzie daje EXIT 0 także przy „do poprawy" — **czytać stdout**.
- `test/dokumentacja-budzet-lektury.test.js` — zielony, ale **zapas stopniał do 220 tokenów**
  (~0,6 kB): 99 780 / 100 000 po dopisaniu **L194**. Budżet liczy wyłącznie `AGENTS.md` + ADR-y +
  `docs/LESSONS.md` + `docs/setup/ENVIRONMENT.md`, więc raporty pętli (PMSSB.md, ENGINE_MILESTONES.md,
  PROJECT_HISTORY.md, plany, handoffy) go NIE obciążają. **Następna sesja: przed dopisaniem czegokolwiek
  do `docs/LESSONS.md` najpierw kondensacja** (PR #93/L66 — miejsce robi się streszczeniem, NIE
  podnoszeniem progu); narrację wynosi się do `docs/LESSONS_PRZYPADKI.md` (poza budżetem)
- Szybki profil benchmarku **pominięty świadomie** (ADR 0018): `test/bot-benchmark.test.js` z progiem
  vs aggro 0.69 leci w `test:slow`; pełne B0 (~2,5 h) tylko na komendę właściciela
- CI GitHub Actions (check `test` na PR #186) — **pass, 5m50s** dla HEAD `695727c`
  (run 43878458255); każdy kolejny push uruchamia go ponownie — stan sprawdzić
  `gh pr checks 186`
- Katalog: **713** `defineCard({`, **649** `supported`, **32** talie (bez zmian — pętla nie dodała kart)

## 3. Kolejka: co zostało otwarte (z root cause'em, bez cichego skipu)

1. **F-90/5b — progi grobu w `graveyardReadingCardsInHand`** (rezyduum F-90/5). Helper zna delve i
   reanimację, ale nie warunków czytających grób po **liczbie kart** (Threshold, `minGraveyardCards`)
   ani po **typach** (delirium, CR 207.2c), więc dopełnienie progu jedną zmieloną kartą nie podnosi
   wartości mielenia: RG-02 A (Angel's Feather = 4. typ i 7. karta, w ręce Seton's Desire) i B
   (Plummet = tylko 7. karta) zostają na wierzchu (20 vs 17/15). Domknięcie wymaga wyceny „co
   odblokowuje dopełniony próg" (zdolność karty **w ręce**) — to nowy model, nie druga stała. Pin 5a
   **zamraża obecną decyzję jako kotwicę anty-over-fix**, żeby przyszła naprawa przepięła go świadomie.
2. **F-90/6 — sekwencja rzutów pod progi** (Might Beyond Reason + River Herald Guide). Zmierzone:
   bot rzuca MBR pierwszy (72,00 vs Guide 67,50) i traci delirium; PRO rzuca Guide → mill → 4 typy →
   MBR z delirium 6/5. **Zablokowane przez F-90/5b**: skoro bot nie milluje pod delirium, kolejność
   nie ma czym się różnić. Nie naprawiać przed 1.
3. **F-90/12 — dwie zdolności o tym samym idempotentnym efekcie do EOT** (Bladewheel Chariot: `#0`
   `{tapOtherArtifacts: 2}` i `#1` `{crewPower: 1}`, obie `animate_permanent_until_end_of_turn`). Bot
   aktywuje jedną po drugiej (BC-03 w0: 10,00 → 10,00; BC-04 w0: 13,00 → 13,00), tapując kolejne
   permanenty za nic. Root cause: straż M179/B `pendingTwin` porównuje
   `sourceId + abilityIndex + targets` (`heuristic-bot.js` ~15403), więc **inny indeks zdolności o tym
   samym efekcie nie jest bliźniakiem**, a straż M230 (`source.animatedUntilEOT`, ~15426) działa
   dopiero PO rozliczeniu pierwszej aktywacji. Rekomendacja: `pendingTwin` po **zbiorze typów
   efektów** idempotentnych. **Bez pinu zamrażającego** — zamrożenie defektu pinem wyglądałoby jak
   regresja przy naprawie. Reprodukcja:
   `node tools/pmssb90-batch73-petla-sonda.mjs --scen=BC-03 --przebieg`.
4. **Uwaga mechaniczna (poza scoringiem) — priorytet w `declare_attackers`.** Silnik daje aktywnemu
   graczowi priorytet w tym kroku PRZED turową akcją deklaracji atakujących, więc crew w
   `declare_attackers` wciąż pozwala zaatakować (zmierzone: crew 11,00 → `attack` 8,00); w realnej
   grze (CR 508.1 — akcja turowa na początku kroku, bez stosu) byłoby za późno. Zmierzone, nie
   zmienione — decyzja o zmianie kolejności należy do właściciela (dotyka silnika, nie bota).
5. **Drobne rezydua scoringu** (zmierzone, niski priorytet): SD-05 — bot woli lotnika 4/4 (91,80)
   nad hosta lądowego (83,00), choć ściągnięcie reach-blokera przepchnęłoby 1 obrażenie więcej
   (`mustBlockEnchantedValue` nie liczy „ile obrażeń przejdzie obok bloku"); LL-04 w1 — Illusory
   Demon 4/3 (26,00) > Leonin 3/2 (24,00) przy **pierwszym** założeniu sprzętu (świadomy zakres
   właściciela T11/7: pierwsze założenie nie waży jakości nosiciela; w gałęzi przeniesienia jakość
   hosta JEST decyzją — Leonin wygrywa 8,00 > 0); SD-03 — main1 = main2 = 81,00, bo aura jest
   permanentna (brak różnicy okien to MODEL, ta sama zasada co pin 11c).

## 4. Decyzja modelowa DO PODJĘCIA PRZEZ WŁAŚCICIELA (F-90/10)

Trigger **trwały** na permanencie (`when_you_cast_spell`, `you_cast_noncreature_spell`,
`you_cast_instant_or_sorcery_spell`) jest dziś wyceniany tak samo, niezależnie od tego, czy w ręce
jest rzucalne paliwo: `cast_permanent(kessig-hand)` = **70,2018** przy Plummecie za 2, przy Get the
Point za 5 (za drogie na okno), przy samym Leoninie i przy pustej ręce. Pozorny remis z Leoninem to
nie remis: **70,2036 vs 70,2018** (Δ 0,0018, wybór deterministyczny, nie kolejność enumeracji).

Naprawa została zaimplementowana, zmutowana (mO1–mO3 RED) i **cofnięta** (`git checkout` do
`1c34b4e`; patch zachowany w `.arena/patch-f90-10.py`, mutacje w `.arena/mutacje-f90-10.py`), bo
przesuwała pięć pinów PMSSB-10 Wave-A/B1: Kulrath Mystic 64,8→63,9; Tellah 69,3→64,8; token_wizard
65,7→63,9; Goblin Battle Jester 64,8→63,9; **Illusory Demon 71,7→78,00**. Bramka „brak rzucalnego
paliwa TERAZ" wyciszała **koszt** tak samo jak wypłatę — `when_you_cast_spell` bywa poświęceniem
ciała, więc permanetna pułapka zaczęła wyglądać na darmowego lotnika 4/3.

Zasada do zatwierdzenia albo odrzucenia: **wypłata TYMCZASOWA** (pompka do EOT — prowess, PMSSB-65)
skaluje się rzucalnym paliwem z ręki; **wypłata TRWAŁA** (trigger na permanencie) nie sprowadza się
do migawki ręki — ta sama, dla której `auraKeywordValue` nie karze aury poza oknem walki
(M179/A1 + M218/3). Piny 10a/10b w `test/audyt-pmssb90-batch73.test.js` zamrażają pomiar i noszą
pełne uzasadnienie; zmiana decyzji = świadome przepięcie tych dwóch pinów.

## 5. Wiążące decyzje właściciela (nie otwierać ponownie bez polecenia)

Lista z `HANDOFF_2026-11-15.md` §3 pozostaje w mocy (m.in. `counterInstantHoldPenalty = 120`, craft
bez enumeracji wariantów, ward zakrycia jawny w widoku, badge „Storied: +1/+0" po angielsku, zakaz
`constructedTargetSet` w `execute`). Dodatkowo z tej sesji:

- **Nowa lekcja L194** (rejestr + narracja w `docs/LESSONS_PRZYPADKI.md`): pin porządku bez progu
  przechodzi bez naprawy (Δ 0,0018 drukuje się jako remis), nową zmienną wprowadza się JAKO wariant
  sondy, a pin na dosłowne wyrażenie źródła przepisuje się na licznik intencji (klasa L186/L5).
- **Zakres T11/7 (equip):** pierwsze założenie sprzętu waży treść sprzętu + `2 × moc` hosta, NIE
  waży jakości nosiciela; jakość hosta jest decyzją w gałęzi **przeniesienia**.
- **`printedBody` = `2 × pumpPower + pumpToughness`** (bez statyki hosta) — pompa hosta z
  `condition.equipped` wchodzi w `value`/`bodyValue`, nie w `printedBody`.
- **Premia ETB jest PŁASKA** (13,50) — jakość celu wycenia ścieżka WYBORU celu, nie rzut (M429).
- **Pętla bez nowych pokręteł:** PMSSB-90 nie dodał klucza do `heuristic-params.js` i następna pętla
  tego typu też nie powinna — dopóki właściciel nie zleci tuningu wag.

## 6. Pułapki tej sesji (sandbox Arena) — dopisanie do `HANDOFF_2026-11-15.md` §5

- **Stare piny na DOSŁOWNE wyrażenia/wartości padają przy rozbudowie modelu.** Przed każdą bramką:
  `grep -rln "equipValuation\|printedBody\|nothingAdded\|auraKeywordValue\|anticipatedTailValue\|prowessCastValue" test/`.
  W tej pętli przepięto `test/uwagi-tura9-bot-rowne-ciala-equip.test.js` T9/8 (regex na wyrażenie
  `equipValuation`) i `test/pmssb10-ogon-wave-{a,b1,b2}.test.js` (dokładne wyświetlane wartości).
- **Asserty „większe niż" przechodzą bez naprawy przy różnicy śladowej** (Δ 0,0018 w KF-06) — próg
  `>= 1`, jedna zmienna na scenariusz; nową zmienną wprowadzać JAKO SCENARIUSZ sondy (RG-05/06,
  LL-06/07, M-04, warianty KF-06), bo `d.opcje` są filtrowane po etykiecie bez gwarancji kolejności,
  a `playerView().legalCommands` nie zawiera `resolve_explore_choice`.
- **Sondy NIE importować z `node -e`** — `tools/pmssb90-batch73-petla-sonda.mjs` woła na końcu
  `fs.realpathSync(process.argv[1])` (@1428), więc import z `--input-type=module -e` daje
  `ENOENT lstat '/home/user/mtg/undefined'`. Używać `--scen=X --json`.
- **`git checkout -- <plik>` kasuje niezacommitowany patch** — użyte celowo przy F-90/10 (piny
  zostały, kod naprawy zniknął); patch jest w `.arena/`, więc naprawa jest odtwarzalna.
- **Mutacje nieobserwowalne zgłaszać JAWNIE** (`oczekiwana='PRZEZYWA'` + powód): mK4, mN4, mO4.
  Druga płaska stała w fallbacku łamie STRAŻNIKA L41 — nie dodawać stałych „na wszelki wypadek".
- Bramki i procesy: `start_process` z łańcuchem i znacznikami `*_RC=` + sentinel
  (`SENTINEL_KONIEC`), wynik czytać `grep`-em z logu; `pkill -9 -f run-tests.mjs` przed restartem;
  `get_process_output(wait_for=exit)` timeoutuje po 180 s. Talie chwilowe usuwać PRZED bramką +
  rebuild (M331). `tools/test-manifest.json` klucz `slow` = 31 **gołych** nazw plików.
- **Żywy Tester `--out x.txt` zapisuje względem `tools/table-tester/`**, a pliki
  `tools/table-tester/**/*.txt` są gitignore (`.gitignore:30`) — transkrypty sprzątać ręcznie.
- **`git commit -m` z backtickami okraja komunikat** → zawsze `git commit -F plik`; **`gh pr edit
  --body-file`** → `GraphQL: Projects (classic) is being deprecated` → `gh api -X PATCH
  repos/jurekjurekgh/mtg/pulls/186 -f body="$(cat plik)"`; `gh pr checks --watch` przekracza limit
  czasu → `sleep` + jednorazowy odczyt.
- Miękki dywiz **U+00AD** wślizguje się przy długich zapisach (w tej sesji znaleziono dwa w istniejącym
  wpisie F-16 w `docs/PMSSB.md` i usunięto) — po każdym zapisie dokumentu kontrola
  `s.count('\u00ad') == 0`.

## 7. Stan i następny krok

- Gałąź `arena/4fa65e47-mtg`; PR **#186** otwarty, opis zaktualizowany kumulatywnie (audyt PR #185 +
  PMSSB-90). **Autor nie scala** — merge wykonuje właściciel metodą `Squash and merge` (ADR 0007).
  HEAD odczytać z `git log -1` (commity pętli: `386bee8` → `bc58123` → dokumentacja).
- `.arena/` jest katalogiem sesji lokalnej i **NIE persistuje** — trwałe ślady pętli to sonda
  (`tools/pmssb90-batch73-petla-sonda.mjs`), piny (`test/audyt-pmssb90-batch73.test.js`), raport
  (§PMSSB-90), kamień (M465), plan (§8–§9) i ten handoff.
- Następna sesja: po scaleniu #186 — standardowy przegląd scalonego PR wg ADR 0020 albo kolejka
  właściciela (`docs/ROADMAP.md`, `docs/backlog.md`); naturalne kandydaty z tej pętli to §3 pkt 1
  (F-90/5b — nowy model progów grobu w ręce), pkt 3 (F-90/12 — `pendingTwin` po zbiorze efektów) i
  decyzja §4 (F-90/10). Ostatni kamień: **M465**.
