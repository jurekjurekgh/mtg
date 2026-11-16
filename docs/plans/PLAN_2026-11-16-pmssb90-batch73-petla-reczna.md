# PLAN 2026-11-16 — PMSSB-90: uczciwa pętla ręcznego strojenia scoringu bota dla Batcha 73

Data w nazwie z pomiaru zegara (`date -u` = 2026-11-16 09:34 UTC; API GitHuba
`updated_at` = 2026-11-16T08:23Z) — sesja audytu PR #185 zaczęła się 2026-11-15 i jej
dokumenty zachowują tamtą datę.

Gałąź: `arena/4fa65e47-mtg` (PR **#186**, status `pr_open`, HEAD `9bf036b`). Pętla idzie
na TEJ gałęzi jako kontynuacja audytu: PR #186 jest PR-em sesji, a znaleziska pętli będą
numerowane dalej (F-23…) albo jako findingi PMSSB-90 (Fx) — decyzja w kroku 2.

## 0. Zlecenie właściciela (dosłownie)

> „Nie potrzebuję ani pełnego BO ani tuningu. Wystarczy mi uczciwy PMSSB, czyli Pętla
> MANUALNEGO Strojenia Scoringu Bota. Czyli weryfikacja z punktu widzenia pro-playera MtG
> czy karta jest rzucana przez Bota w optymalnym momencie (tura, faza), w optymalny cel,
> w kontekście aktualnego stanu gry (co na stole, jaka ręka, jaka biblioteka, jaki cmentarz)
> itd."

Więc: **bez pełnego B0** (ADR 0018 — właściciel wprost wykluczył) i **bez maszynowego
tuningu** (`npm run tune-bot` / `tune-card` — metoda M429 to audyt przyczynowo-skutkowy,
nie optymalizacja parametrów). Produkt pętli to odpowiedź na trzy pytania per karta:
**(T)** czy bot gra ją w optymalnym MOMENCIE (tura, faza, okno), **(C)** czy w optymalny
CEL, **(S)** czy decyzja jest spójna z kontekstem stanu gry (stół, ręka, biblioteka, grób,
życie, mana).

## 1. Dlaczego nowa pętla, skoro §PMSSB-89 ma status DONE

Audyt PR #185 (raport `docs/audits/AUDYT_PR185_2026-11-15.md`) wykazał, że §PMSSB-89 nie
jest wiarygodnym domknięciem:

- **F-16:** dwa wiersze tabeli findingów opisywały FABRYKOWANE zdolności (Leonin Lightbringer
  i Kessig Flamebreather „mają" tap-zdolności, których nie ma w Oracle), cudze cechy
  (ward {2} przypisany Seton's Desire) i efekty nieistniejące („Messenger's Speed +1/+1",
  „Might Beyond Reason +X/+X board pump"); bramki i „otwarte" były sprzeczne z pomiarem.
- **F-20:** sonda `tools/pmssb89-batch73-scoring-sonda.mjs` miała MARTWY blok main
  (`import.meta.url === process.argv[1]`), więc deklarowany „pomiar przed→po" nie był
  odtwarzalny komendą z nagłówka pliku.
- **F-9:** reguła „tylko w upkeep" istniała wyłącznie w heurystyce bota, maskując brak reguły
  w silniku (naprawione: deskryptor `onlyInStep`, CR 602.5).
- **Zakres pomiaru:** sonda mierzy JEDEN scenariusz na kartę — `stateAt('main')` (zawsze
  własna faza główna), `richMana` = 10 many każdego koloru (wymiar KOSZTU znika, wbrew
  obowiązkowej kontroli (b) procedury PMSSB i S11), JEDEN generyczny cel (nie ma porównania
  kandydatów) i brak wymiaru ręka/biblioteka/życie. Odpowiada więc na pytanie „czy bot w
  ogóle coś wybiera", nie na pytania (T)/(C)/(S) właściciela.

Wniosek: pętla PMSSB-90 jest **re-audytem rodziny z nowym dowodem** (hub: „ponowny audyt tej
samej rodziny wymaga nowego dowodu (sonda/Żywy Tester), nie przeczucia") — dowodem jest nowa
sonda macierzowa z kroku 1.

## 2. Zakres: 11 wpisów kolekcji 645–655 (Oracle z `docs/cards/scryfall-*.json`)

| artId | Karta (`id` w katalogu) | Typ/koszt | Tekst Oracle (istotne dla decyzji) |
|---|---|---|---|
| 645 | Might Beyond Reason (`might-beyond-reason`, SOI 217) | Instant {3}{G} | 2 liczniki +1/+1 na cel; Delirium — 3 zamiast 2 przy 4+ typach kart w grobie |
| 646 | Messenger's Speed (`messengers-speed`, THS 129) | Aura {R} | Enchant creature; stworzenie ma trample i haste |
| 647 | Get the Point (`get-the-point`, RNA 176) | Instant {3}{B}{R} | Destroy target creature. Scry 1 |
| 648 | Seton's Desire (`setons-desire`, DMR 176) | Aura {2}{G} | Enchant creature; +2/+2; Threshold — przy 7+ kartach w grobie wszystkie stworzenia mogące blokować zaklętego muszą to robić |
| 649 | Spring-Loaded Sawblades (`spring-loaded-sawblades`, LCI 36) | Artifact {1}{W} | Flash; ETB: 5 obrażeń w tapniętego stwora przeciwnika; Craft with artifact {3}{W} |
| 650 | Bladewheel Chariot (`bladewheel-chariot`, tył DFC) | Artifact — Vehicle 5/5 | {T}: tap 2 inne odkręcone artefakty → staje się stworem do EOT; Crew 1 |
| 651 | Leonin Lightbringer (`leonin-lightbringer`, ONE 20) | Creature — Cat Rebel 3/2 {2}{W} | Ward {2}; +1/+1 tak długo, jak jest wyposażony |
| 652 | River Herald Guide (`river-herald-guide`, LCI 209) | Creature — Merfolk Scout 3/1 {2}{G} | Vigilance; ETB explores |
| 653 | Necrosavant (`necrosavant`, DMR 93) | Creature — Zombie Giant 5/5 {3}{B}{B}{B} | {3}{B}{B}, poświęć stwora: wróć z grobu na pole bitwy. Activate only during your upkeep |
| 654 | Kessig Flamebreather (`kessig-flamebreather`, VOW 164) | Creature — Human Shaman 1/3 {1}{R} | Gdy rzucasz czar niebędący stworem: 1 obrażenie każdemu przeciwnikowi |
| 655 | Plummet (`plummet`, M20 188) | Instant {1}{G} | Destroy target creature with flying |

(Numery artId i kolejność sprawdzone z `tools/collection-art-ids.csv` wiersze 645–655
oraz z pól `artId` w `src/cards/card-data.js` — pierwsze podejście do tej tabeli miało
przestawione numery, więc jest przepisana z pomiaru, nie z pamięci: L24.)

## 3. Kroki (procedura PMSSB z `docs/PMSSB.md`, checklist 0–7)

- [x] **0. Plan** — ten plik; commit + push PRZED jakimkolwiek kodem (ADR 0020 A).
- [x] **1. POMIAR PRZED** — nowa sonda macierzowa `tools/pmssb90-batch73-petla-sonda.mjs`
      (commitowana, nie w `/tmp`: L24 — skutek bez śladu nie istnieje; wzór harnessa:
      `tools/pmssb89-batch73-scoring-sonda.mjs` po naprawie F-20). Per karta ≥4 scenariusze
      zmieniające JEDEN wymiar, z realistyczną maną (nie `richMana`), z ≥2 kandydatami na cel
      i z wydrukiem: wybranej komendy, jej score, score alternatyw, fazy/tury, stanu
      (stół/ręka/biblioteka/grób/życie). Wynik: tabela `karta × scenariusz → decyzja /
      FINDING`. Log: `.arena/pmssb90-przed.log`.
- [x] **2. AUDYT** — macierz **kierunek × cel × timing × stan** → findingi (numeracja Fx pętli,
      powiązanie z F-audytu gdzie dotyczy) → fale A/B/C. Kontrole OBOWIĄZKOWE procedury:
      (a) **L41** — `cast_spell` / `cast_permanent` / `activate_ability` / tryb modalny /
      trigger-decyzje / `apply_to_each_target` liczą TO SAMO (rozjazdy = finding);
      (b) **wymiar kosztu (S11)** — czary za 5 many (Get the Point, Necrosavant) nie mogą
      remisować z czarami za 2 (Plummet, Messenger's Speed) bez uzasadnienia w pomiarze;
      (c) **anty-over-fix M429** — najsłabszy realny wariant = dawna wartość, nowe wymiary to
      DOPŁATY/KARY, nie nowa skala.
- [ ] **3. IMPLEMENTACJA** — rodzinowe klucze w `src/controllers/heuristic-params.js`
      (nazwa rodziny `batch73*` albo istniejące rodziny: `removal*`, `aura*`, `counter*`,
      `crew*`, `explore*`, `hold*` — preferowane rozszerzenie istniejących, ADR 0002: po
      kształcie/deskryptorze, NIGDY po `cardId`) + wspólne helpery w `heuristic-bot.js` (L41:
      jeden helper dla wszystkich gałęzi tej samej klasy).
- [ ] **4. TESTY** — `test/audyt-pmssb90-batch73.test.js` (wzorzec M429: `decide`/`trace`,
      anty-over-fix, pokrętła-sterują ×0) RED → GREEN + mutacje kontrolne (`.arena/mutacje-
      pmssb90.py`, znacznik `// MUT-x` W ŚRODKU stringa, przywracanie w `finally`,
      `assert count == 1`).
- [ ] **5. EWALUACJA** — `tools/bot-scoring-snapshot.mjs` (CEL: **bez regeneracji** fixture;
      regeneracja tylko z uzasadnieniem i śladem per para — L193), `tools/bot-tie-audit.mjs`
      PO (bramka: `play_land` 0, `tie_all` 0), mirror-eval (reguły vs off) i Żywy Tester PO
      na taliach chwilowych batcha 73 (procedura M331: talia + `npm run build`; usunąć PRZED
      bramką i przebudować artefakt — katalog ma wrócić do 32 talii).
- [ ] **6. DOKUMENTACJA** — raport **§PMSSB-90** w `docs/PMSSB.md` (z dosłownymi cytatami
      Oracle, ADR 0030/L57), wiersz w rejestrze rodzin (status DONE + numery pinów), wpis w
      `docs/PROJECT_HISTORY.md`, kamień milowy w `docs/ENGINE_MILESTONES.md` (M465), aktualizacja
      opisu PR #186 (kumulatywnie), handoff `docs/setup/HANDOFF_2026-11-16.md` na końcu sesji.
      Nowe LESSONS tylko jeśli klasa jest nowa — budżet lektury **99 443/100 000** (zapas
      557 tokenów ≈ 1,6 kB), więc każdy nowy wpis płaci kondensacją innego.
- [ ] **7. BRAMY** — `npm test` (oczekiwane ≥10 390/10 390), `npm run build` (79 modułów,
      ≥5900,7 kB), `npm run test:all` (≥10 672/10 672) jako brama PR; szybki profil
      benchmarku tylko jeśli zmienię wyceny (a zmienię — więc TAK, `node tools/benchmark.mjs`
      z zapisem per para); pełne B0 NIE (zlecenie + ADR 0018). Push po każdym kroku; każdy
      commit samodzielnie zielony (ADR 0020 A–D).

## 4. Pytania pro-playera per karta (hipotezy do ZMIERZENIA, nie do założenia)

Każde pytanie ma formę sprawdzalną sondą: „w scenariuszu X bot wybiera Y, a pro wybrałby Z".
Odpowiedź „bot wybiera Z" zamyka pytanie bez findingu (zapis w raporcie jako zweryfikowane).

**Plummet (artId 655, instant {1}{G}, destroy creature with flying):**
- T: czy trzyma go na turę przeciwnika / okno walki zamiast rzucać we własnym upkeep/main1
  (rodzina `removalUpkeepHoldPenalty`, `removalHoldLibraryFloor`)? Czy rzuca PRZED deklaracją
  blokerów (maksymalna wartość) a nie po walce?
- C: przy dwóch lotnikach (1/1 bez znaczenia vs 5/5 z lataniem) czy wybiera istotniejszego?
  Czy nie celuje własnego lotnika?
- S: czy nie rzuca przy braku legalnego celu (fizzle), czy wartość rośnie, gdy lotnik właśnie
  atakuje/blokuje (stan walki), czy maleje, gdy przeciwnik ma w ręce/na stole sposób na
  ominięcie (np. hexproof — jeśli istnieje w katalogu)?

**Get the Point (artId 647, instant {3}{B}{R} = 5 many, destroy + scry 1):**
- T: instant — czy trzyma na okno przeciwnika, czy wyrzuca w swojej turze? Czy scry wykonuje
  po zniszczeniu i czy decyzja scry jest sensowna (PMSSB-24 ma rodzinę `resolve_scry`)?
- C: czy wybiera NAJgroźniejszego legalnego stwora, a nie pierwszego/najmniejszego? Czy
  uwzględnia niezniszczalność/regenerację (jeśli cel ją ma, czar jest stratą)?
- S: czy wymiar kosztu 5 many jest widoczny w score (kontrola (b)/S11 — porównanie z Plummet
  {1}{G} na tym samym celu: różnica musi wynikać z many, nie z przypadku)? Czy wartość scry
  zależy od stanu biblioteki (pusta biblioteka, manascrew)?

**Messenger's Speed (artId 646, aura {R}: trample + haste):**
- T: haste ma wartość TYLKO przed walką i tylko dla stwora, który może jeszcze zaatakować —
  czy bot rzuca w main1, a nie w main2/po walce? Czy nie rzuca w turze przeciwnika?
- C: czy celuje stwora BEZ haste (suma sensowna) i nie marnuje na stwora, który już ma
  haste/trample (nadpisanie = strata), ani na stwora tapniętego/nieatakującego, ani na cudzego?
- S: czy wartość rośnie, gdy stwór ma summoning sickness (haste go odblokowuje) i gdy w ataku
  czeka duży blokujący (trample), a maleje przy pustym stole przeciwnika?

**Might Beyond Reason (artId 645, instant {3}{G}: 2 liczniki, delirium → 3):**
- T: pompka instant — czy bot rzuca ją w oknie walki (przed obrażeniami), a nie po walce?
- C: czy celuje WŁASNEGO stwora o najwyższej użyteczności (nie 0/1 ścianę, nie cudzego)?
- S: czy delirium jest LICZONE z własnego grobu (4+ typy kart — `condition.delirium`,
  `countGraveyardCardTypes`) i czy score różni się między 2 a 3 licznikami (to jest wymiar
  kontekstu „jaki cmentarz" z zlecenia)? Czy bot dąży do progu (np. mill/odrzuca w kierunku
  delirium) — jeśli nie, to finding klasy „brak anticipacji progu".

**River Herald Guide (artId 652, 3/1 vigilance, ETB explore):**
- T: czy wystawia ciało w main1 (tempo), a nie trzyma w ręce bez powodu?
- C/S (decyzja explore): gdy odsłoni land — do ręki (czy bot to wybiera przy manascrew?);
  gdy nie-land — licznik +1/+1 na Guide AND wierzch/grob: czy wybór „do grobu" jest świadomy
  (np. gdy karta jest bezużyteczna, a grób napędza delirium/threshold/Necrosavanta), a „na
  wierzch" gdy karta jest potrzebna w kolejnej turze? To jest dokładnie wymiar „jaka
  biblioteka / jaki cmentarz" z zlecenia.
- Czy 3/1 z vigilance jest atakowany sensownie (nie w 4/4), i czy licznik z explore (F-19)
  zmienia decyzję ataku?

**Seton's Desire (artId 648, aura {2}{G}: +2/+2, Threshold 7+ → must-block):**
- T: sorcery-speed — czy bot rzuca w main1 PRZED walką (tylko wtedy +2/+2 i wymóg bloku mają
  wartość), a nie w main2?
- C: czy zaklina atakującego, którego przeciwnik MOŻE zablokować (must-block ma wartość tylko
  wtedy, gdy istnieją stworzenia zdolne blokować — `blockingRequirementCount`,
  `declareBlockers`), i czy nie marnuje aury na stworze, który i tak przejdzie nieblokowany?
  Czy +2/+2 idzie na stwora, który po pompce WYGRYWA wymianę (nie na 1/1 ginące od wszystkiego)?
- S: czy próg Threshold jest liczony z WŁASNEGO grobu (7+ kart — F-1/F-17: silnik liczy wymóg
  jako efekt ciągły CR 611.3a, a UI drukuje próg raz), czyli czy score aury różni się przy 6 i
  przy 7 kartach w grobie? To jest wymiar „jaki cmentarz" z zlecenia. Czy bot dąży do progu
  (mill/odrzuca), gdy brakuje jednej karty — jeśli nie, to finding klasy „brak anticipacji
  progu" (jak PMSSB-9).

**Spring-Loaded Sawblades (artId 649, flash {1}{W}, ETB 5 dmg w tapniętego stwora przeciwnika, craft):**
- T: flash — czy bot rzuca w turze przeciwnika, gdy cel istnieje (okno po tapnięciu), a nie
  w swojej turze, gdy przeciwnik ma wszystko odkręcone (brak legalnego celu = fizzle)?
- C: czy wybiera tapniętego stwora o największej wartości, którego 5 obrażeń ZABIJA
  (toughness ≤5, bez regeneracji/ward), a nie tapniętego 1/1 ani stwora z toughness 8?
- S: craft ({3}{W} + drugi artefakt z pola/grobu) — czy bot craftuje świadomie (koszt vs
  Bladewheel Chariot 5/5 z dwiema zdolnościami), czy nie craftuje przy braku drugiego
  artefaktu, czy timing sorcery jest zachowany?

**Bladewheel Chariot (artId 650, tył DFC, Vehicle 5/5):**
- T: crew 1 / „tap two other untapped artifacts" — czy aktywacja jest PRZED walką
  (precedens F1 w PMSSB: crew w `precombat_main` był premiowany dokładnie tam, gdzie nie
  działa — sprawdzić obecny stan `crewValue`), a nie w main2?
- C: którą z DWÓCH zdolności wybiera i jakim kosztem (crew 1 = tap stwora z mocą ≥1, czyli
  utrata blokera/atakującego vs tap 2 artefaktów), czy wybiera tańszą/nieblokującą ataku?
- S: czy po animacji 5/5 atakuje i czy bot nie animuje, gdy nie ma ataku (strata)?

**Leonin Lightbringer (artId 651, 3/2 ward {2}, +1/+1 gdy wyposażony):**
- T/C/S: brak zdolności aktywowanej (F-16/F-10) — wymiary: atak (3/2, czy nie wchodzi pod
  większego blokera), equipowanie na niego (synergia `equipped` → 4/3; czy bot wycenia
  dopłatę do equip, gdy celem jest Lightbringer — F-21 dał mu klauzulę w UI, a silnik liczy
  bonus od F-2), oraz **ward z drugiej strony**: czy bot jako kontroler czaru celującego
  uwzględnia koszt ward {2} przy WYBORZE CELU (nie celuj w ward, jeśli nie warto płacić) —
  F-7 naprawił ścieżkę danych kwoty i płatnika, ale wymiar „czy scoring wyboru celu zna ward"
  jest do zmierzenia.

**Necrosavant (artId 653, 5/5, {3}{B}{B} + poświęć stwora, tylko w upkeep):**
- T: bramka upkeep jest w SILNIKU (F-4/F-9, `onlyInStep`, CR 602.5) — czy bot mimo to nie
  traci tempa (aktywacja w upkeep zużywa 5 many + stwora w turze, w której 5/5 ma summoning
  sickness i NIE atakuje — pro aktywuje raczej pod obronę albo gdy jest wartość z ETB/innego
  efektu; zmierzyć, czy bot to rozróżnia).
- C: czy poświęca NAJgorszego stwora (F-8/PMSSB-89 deklarują wybór najgorszego — zweryfikować
  pomiarem, nie deklaracją), i czy nie poświęca jedynego blokera przy zagrożeniu.
- S: czy wartość ciała idzie z P/T (F-8: `10 + 2P + T`), czy aktivacja nie zachodzi przy braku
  foddera, i czy bot uwzględnia własny grób (Necrosavant musi w nim być) oraz to, że po
  powrocie karta jest „nowym obiektem" (IDEMPOTENT_EOT_EFFECTS — ponowna aktywacja = fizzle).

**Kessig Flamebreather (artId 654, 1/3, trigger: rzucasz noncreature spell → 1 dmg każdemu przeciwnikowi):**
- T: czy bot SEKWENCJONUJE: najpierw wystawia Kessiga, potem rzuca czary niebędące stworami
  (trigger działa tylko na czary rzucone PO jego wejściu) — anty-cyp to klasa PMSSB-9
  (anticypacja triggerów non-ETB): sprawdzić, czy istnieje i czy obejmuje ten deskryptor.
- C/S: trigger nie wybiera celu (damage_each_opponent, F-5) — wymiar: czy chip 1 obrażenia na
  przeciwnika jest wyceniony w decyzji rzucenia czaru (każdy instant/sorcery = +1 dmg na
  opponenta), i czy bot nie atakuje 1/3 bez sensu (oraz czy broni go jako 3 toughness).

## 5. Fale (uzależnione od pomiaru; szablon z PMSSB-58/59)

- **Fala A** — decyzje rzutu/wystawienia: timing (T) i wymiar kosztu (b) dla 6 czarów
  (Plummet, Get the Point, Messenger's Speed, Might Beyond Reason, Seton's Desire,
  Spring-Loaded Sawblades).
- **Fala B** — wybór CELU (C) przy ≥2 kandydatach: removal (najgroźniejszy vs pierwszy),
  aura (host z realną wartością, bez nadpisywania), ETB z celem (Sawblades: lethalność 5 dmg),
  pompy (Might Beyond Reason: najlepszy własny stwór).
- **Fala C** — decyzje kontekstowe (S): explore (wierzch vs grób), scry po Get the Point,
  craft/crew (Bladewheel Chariot), poświęcenie pod Necrosavanta, anticipacja triggera
  Kessiga, ward w wyborze celu removalu.

Każda fala: pomiar PRZED → implementacja → piny → mutacje → ewaluacja → commit (samodzielnie
zielony). Jeśli pomiar pokaże, że fala jest pusta (bot już gra optymalnie), fala zostaje
ZAMKNIĘTA z zapisem „zweryfikowane, bez findingu" — to też jest wynik pętli (hub: „Brak
sygnału w lustrze przy wąskich stanach to wynik (B6), nie porażka").

## 6. Ryzyka i pułapki (z LESSONS i z sesji audytu)

- Bramki odpalać przez `start_process` z `*_RC=` i sentinelem; przed restartem
  `pkill -9 -f "node --test"` (osierocone procesy zafałszowują pomiar).
- Talie chwilowe: dodać + `npm run build` (lista talii jest wpięta w artefakt), USUNĄĆ przed
  bramką i przebudować — inaczej 7 faili (A30, M203/7, M338/3, round-trip ×2, M178 ×2).
- `tools/test-manifest.json` klucz `slow` = gołe nazwy plików (doklejać `test/`).
- Egress HTTPS zablokowany — dane sieciowe tylko przez `fetch_page`; Oracle już jest w
  `docs/cards/scryfall-*.json` (nie pobierać ponownie).
- Miękki dywiz U+00AD — kontrola `s.count('\u00ad') == 0` po każdym zapisie dokumentu.
- CR cytować wyłącznie z `test/helpers/cr-numery-tabela.js`; nowy numer →
  `node tools/cr-numery.mjs --zapisz`.
- Nie podnosić progów benchmarku, nie regenerować golden-mastera bez śladu per para (L193).
- Budżet lektury 99 443/100 000 — nowe LESSONS tylko z kondensacją innego wpisu.
- ADR 0002: żadnych `cardId` w heurystyce; ADR 0017: P/T z widoku; L41: jeden helper na klasę.
- Zmiany w `src/` wymagają `npm run build` przed pomiarem Żywym Testerem (L76).

## 7. Definicja ukończenia

Sonda macierzowa (krok 1) daje tabelę z odpowiedzią na (T)/(C)/(S) dla 11 wpisów; każdy
finding ma root cause, naprawę generyczną, piny RED→GREEN i mutacje; ewaluacja (snapshot bez
regeneracji, tie-audit, mirror, Żywy Tester) wykonana; §PMSSB-90 + rejestr + PROJECT_HISTORY
+ M465 + opis PR zaktualizowane; bramy zielone (fast/slow/all/build); talie chwilowe usunięte;
handoff i blok przekazania w czacie. PR #186 pozostaje do scalenia przez właściciela.

## 8. Wynik POMIARU PRZED (krok 1) i audyt macierzowy (krok 2) — stan 2026-11-16

Sonda: `tools/pmssb90-batch73-petla-sonda.mjs` (49 scenariuszy, **179 wariantów**, 11/11 kart,
wymiar T=62 / C=31 / S=47 / K=8 + kontrole). Odtworzenie: `node tools/pmssb90-batch73-petla-sonda.mjs`
(log) i `--json` (dane); `--scen=ID`, `--karta=ID`, `--przebieg` (sekwencja z rozliczeniem stosu).
Tabela tekstowa pomiaru: `.arena/pmssb90-tabela.txt` (efemeryda — sonda jest źródłem, ten rozdział
jest śladem trwałym, L24).

### 8.1 Wierność harnessa (poprawki samego pomiaru, wykonane w kroku 1)

| # | Artefakt pomiaru | Skutek | Naprawa w sondzie |
|---|---|---|---|
| H-1 | krok `untap` z wymuszonym priorytetem | bot dostawał okno decyzyjne, którego realna gra nie daje | `untap` wyłączony ze skanu timingu (P-01) |
| H-2 | **pusta biblioteka** (domyślna) | `heuristic-bot.js:5938` (`myLibraryCount(view) <= removalHoldLibraryFloor`, wartość 10) wyłączała bramkę „trzymaj hard removal na godny cel" → CAŁY pomiar removalu (Plummet, Get the Point) był mierzony z mechanizmem trzymania WYŁĄCZONYM | `ROZMIAR_BIBLIOTEKI = 20` na gracza (wierzch = wpisy scenariusza, dalej wypełniacz); po poprawce te same cele: LL-01 74/70 → GT-03 −52/−54 (pass) |
| H-3 | przebieg nie rozliczał stosu | przeciwnik w sondzie nigdy nie pasuje, więc crew/ETB/explore zostawały na stosie i pomiar sekwencji był niepełny (BC-01 „nie atakuje po crew" — fałsz) | `rozliczStos()`: dla bota wybory z heurystyki (logowane ze score), dla rywala mechaniczne |
| H-4 | decyzje `resolve_*` logowane samą etykietą | obie gałęzie explore/scry mają TĘ SAMĄ etykietę → nie było widać, którą gałąź bot wybrał | `etykietaCmd()` dokleja parametry (`putInGraveyard:false`, `bottomIds:[...]`) + lista dostępnych gałęzi i ich score'ów |
| H-5 | stan/wybór nadpisywane przez sekwencję | przy `--przebieg` raport pokazywał stan KOŃCOWY i ostatni wybór jako „decyzję bota" | zrzut PRZED sekwencją (`stanPrzed`/`wybranoPrzed`/`scorePrzed`) + `stanPo` osobno |
| H-6 | fikcyjne id kart wpisywane „z pamięci" | `put` rzucał „nieznana karta w scenariuszu" | wszystkie id z `createCardRegistry()`; rejestr to frozen `{get,has,all(),supported()}`, NIE Map; pole kosztu to `manaCost`, nie `cmc` |
| H-7 | podrabianie pola `combat` | `crewValue` czyta `view.combat` — podróbka mierzyłaby fikcję | BC-04 deklaruje atak prawdziwym `declareAttackers(state,'p2',[...])` (CR: akcja turowa) |

Parity z produkcją: sonda tworzy bota z `randomness: 0, lookahead: 0` — dokładnie tak jak
`src/table/session.js:406` (`createHeuristicBot({ seed, opponentDeck, ownDeck })`, domyślne
`randomness = 0`, `lookahead = 0`), więc pomiar opisuje bota produkcyjnego, nie wariant B2.

### 8.2 Znaleziska (Fx pętli PMSSB-90) → fale

**F-90/1 — KRYTYCZNY (silnik, L48): Necrosavant jest oferowany bez `sacrificeCreatureId`, a wykonanie odrzuca komendę.**
- Pomiar: NS-01/NS-02/NS-03/NS-04 (15 wariantów) — bot wybiera `activate_ability(necro-grave#0)`
  (score 19,00 z fodderem 1/1; 17,00 gdy poświęcany jest tylko 2/1), `execute` → **`ok=false`,
  `reason=illegal_ability:Nielegalny stwór do poświęcenia (koszt)`**.
- Root cause: pętla grobowa `legalActivatedAbilities` (`src/engine/abilities.js:1413-1425`) pcha
  wariant GOŁY `{ objectId, abilityIndex, ability }` bez enumeracji wyborów kosztu, choć pętla
  polowa dla `cost.sacrificeCreature` wystawia wariant per kandydat (`abilities.js:942-948`),
  a `performActivation` wymaga `ctx.sacrificeCreatureId ∈ sacrificeCreatureCandidates`
  (`abilities.js:1728`). To złamanie własnej niezmienniczej projektu L48/M384 („oferta = walidacja
  = WYKONANIE").
- Skutek w partii: `src/table/session.js:4009` rzuca `Bot wybrał nielegalną komendę: ...` — partia
  PRZERYWA się (nie cichy pominięcie ruchu).
- Maskowanie: `test/real-cards-batch73.test.js:586` dokleja parametr ręcznie
  (`execute(state, { ...offers[0], sacrificeCreatureId: 'fodder' })`) i pinuje `offers.length === 1`
  — pin utrwala wadliwy kształt oferty.
- Zasięg rodziny: 12 zdolności `fromGraveyard` w katalogu, z tego JEDNA z `sacrificeCreature`
  (necrosavant), żadna z `targets` — ale naprawa ma być generyczna (L41/ADR 0002): ta sama
  enumeracja co gałąź polowa, nie wyjątek per karta.
- **Fala A.**

**F-90/2 — scoring: `craft_transform` bez wyceny → bot nigdy nie craftuje (artId 649/650).**
- Pomiar: SS-03 — `activate_ability(saw#1) = −2,00` zarówno z materiałem na polu (Angel's Feather),
  jak i w grobie (Cloak of the Bat); poprawnie BRAK oferty bez drugiego artefaktu i przy manie 2.
- Root cause: `craft_transform` nie ma case'u w wycenie efektów (w `heuristic-bot.js` występuje
  wyłącznie w zbiorze efektów kumulujących się @1481) → wartość efektu 0 minus koszt.
- Kontrast wewnętrzny: ten sam bot wycenia animację powstałego Chariota na **+10** (okno ataku,
  BC-03) i **+13** (okno obrony, BC-04) — permanent PO craft jest używany chętnie, ale droga do
  niego jest zawsze ujemna.
- PRO: craft ze śmieciowego artefaktu za {3}{W} (sorcery) zamienia artefakt bez ciała w Vehicle
  5/5 z dwiema zdolnościami — to upgrade, nie strata. **Fala B.**

**F-90/3 — scoring (S/T): score rzutu Sawblades nie widzi warunku ETB „tapnięty stwór przeciwnika".**
- Pomiar: SS-04 — **77,40** we wszystkich czterech wariantach (tylko odkręcony 3/3 / tapnięty 3/3 /
  tapnięty 7/7 / tapnięty 1/1 + odkręcony 6/7); SS-01 pusty stół wroga → 60,30; SS-02 → 77,40 we
  własnym main1 (wróg odkręcony) i 77,40 w `declare_blockers`/`main2` tury rywala (wróg tapnięty).
- Czyli +17,1 za „wróg ma JAKIEGOKOLWIEK stwora", 0 za „wróg ma TAPNIĘTEGO" (deskryptor
  `requiresTarget: tapped_creature, opponentControls`) i 0 za jakość celu.
- PRO: flash + ETB na tapniętego stwora to karta na OKNO po ataku rywala; rzut w main1 na
  odkręcony stół marnuje trigger (zostaje goły artefakt za 2).
- Uściślenie: wybór CELU triggera jest poprawny (SS-01: lethal 3/3 = **44** vs nie-lethal 7/7 =
  **−80**) — rozjeżdża się decyzja rzutu, nie decyzja celu. **Fala B.**

**F-90/4 — scoring (S): Threshold Seton's Desire jest niewidzialny dla wyceny (artId 648).**
- Pomiar: SD-01 — 72,00 przy grobie 6 / 7 / 9 kart (próg 7+ nie dodaje nic); SD-05 — host lotnik
  75,60 vs host lądowy 72,00 IDENTYCZNIE z wrogim 2/2 reach (must-block ściąga go i odsłania mojego
  lotnika 4/4) i z wrogim 2/1 bez reach (wariant 3); SD-02 — pusty stół wroga 72,00 = stół z
  blokerami 72,00.
- Silnik sam wymóg egzekwuje (`combat.js:373 mustBlockHostCounts`; mutacja mA audytu PR #185 →
  6 fail) — brakuje wyłącznie wyceny po stronie bota.
- PRO: klauzula Threshold to drugi, często większy efekt aury; wartość hosta powinna zależeć od
  tego, czy jest co odsłonić (drugi atakujący) i czy wróg ma kim blokować. **Fala B.**

**F-90/5 — scoring (S): decyzja explore (wierzch vs grób) jest kontekstowo ślepa, choć scry NIE jest.**
- Pomiar: RG-02 A/B/C — zawsze `resolve_explore_choice{putInGraveyard:false}` = **40** vs mill
  **10**, identycznie przy grobie 3 typy/6 kart (mill = delirium 4 typy + Threshold 7) i 5 typów/
  12 kart (progi spełnione); RG-01 — 40/10 zarówno dla potrzebnego instantu (Plummet), jak i dla
  zbędnej drugiej kopii River Herald Guide.
- Kontrola dodatnia (ta sama klasa decyzji): GT-04 scry 1 — ląd `topOrder` **20** vs `bottomIds`
  **−10**; drugi Get the Point **23** (spód) vs 20 (wierzch); Guide 3/1 **20** vs **11**. Rodzina
  scry ma model jakości karty, explore go nie ma → rozjazd L41 w klasie „wierzch vs spód/grob".
- PRO: mill jest warty więcej, gdy karta uzupełnia delirium/Threshold albo jest zbędna; wierzch —
  gdy brakuje many/removalu. **Fala B.**

**F-90/6 — scoring (T/sekwencja): bot nie ustawia kolejności rzutów pod progi (MBR przed explore).**
- Pomiar: RG-04 — przy manie 6/7/10 pierwszy rzut to `cast_spell(mbr-hand->nasz-3-2)` = **72,00**
  (Guide 67,50); stan PO: Leonin **5/4** (2 liczniki — delirium NIE spełnione, grób 3 typy), a mill
  artefaktu z explore następuje DOPIERO potem (grób 7 kart/4 typy).
- PRO: przy manie ≥7 najpierw Guide (explore milluje Angel's Feather → 4 typy = delirium), potem
  MBR → 3 liczniki (6/5 zamiast 5/4). Stały ordering score'ów oddaje jeden licznik.
- Root cause: produkcja gra z `lookahead: 0`, a score MBR nie zawiera przewidywanego delirium
  (istniejący mechanizm `anticipated*` @3260-3416 tego przypadku nie obejmuje). **Fala C.**

**F-90/7 — L41: equip „pierwsze założenie" vs „przeniesienie" — rozjazd 28 punktów dla tej samej pary (sprzęt, host).**
- Pomiar: LL-05 — Brawler's Plate (+2/+2 trample, equip 4) NIEzałożony: `sprzet#0->leonin` = **20**,
  `->maly` = **18**; ten sam Plate ZAŁOŻONY na Highland Game → przeniesienie na Leonina = **−8**.
- Root cause: `equipValuation` (`heuristic-bot.js:10352`) jest współdzielona (PMSSB-34/A:
  `bodyValue`/`printedBody`), ale gałąź przeniesienia (16814-16840) dolicza utratę pompy na hoście
  źródłowym inną miarą — pomiar pokazuje 20 → −8 dla tego samego skutku netto (+2/+2 trample
  przeniesione z 2/1 na 3/2 z bonusem `equipped`).
- Kontrola procedury (a) L41: rozjazd gałęzi tej samej klasy = finding. **Fala C.**

**F-90/8 — scoring (S): sprzęt z korzyścią z TRIGGERA (bez `pump`/`keywords`) jest zawsze na minusie → Leonin nigdy nie jest wyposażony.**
- Pomiar: LL-04 — Greatsword of Tyr (equip {W}; trigger `equipped_creature_attacks`: licznik +1/+1
  i tapnięcie stwora) NIEzałożony: `sprzet#1->leonin` = **−11** i `->maly` = **−11** (bez
  różnicowania hosta); LL-05 wariant 1/2: −11 w obu gałęziach (spójnie, więc to NIE rozjazd L41,
  tylko brak modelu).
- Root cause: `equipValuation` czyta wyłącznie `def.pump` i `def.keywords`; Greatsword ma
  `pump: null, keywords: []` i trigger → `nothingAdded = true` → kara −12 (`heuristic-bot.js:16766`)
  na KAŻDEJ parze (sprzęt, host).
- Skutek dla batcha 73: warunek „+1/+1 as long as it is equipped" Leonina (artId 651) jest w grze
  bota nieosiągalny; kontrola dodatnia (LL-05 wariant 3: Plate → Leonin 20 > Highland Game 18)
  dowodzi, że przy `pump` equip działa i że statyka `equipped` JEST widziana. **Fala C.**

**F-90/9 — scoring (S): trigger Kessiga (`damage_each_opponent`) nie skaluje się z życiem przeciwnika i nie widzi lethal.**
- Pomiar: KF-05 — `cast_spell(plummet-hand->wrona)` = **100,00** przy życiu p2 = 20 / 6 / 2 / **1**
  (Kessig na stole; 1 obrażenie przy życiu 1 = LETHAL); KF-02 — 100 z Kessigiem vs 98 bez (trigger
  warty stałe 2 punkty).
- Kontrast: ta sama sonda mierzy lethal w decyzji ataku na **1032** (KF-04: wróg 1 życie, bloker
  tapnięty) → model lethal w ataku istnieje, w wycenie obrażeń z triggera nie.
- PRO: przy życiu 1 przeciwnika rzut czaru odpalającego Kessiga WYGRYWA partię — to musi być
  score rzędu lethal, nie +2. **Fala B.**

**F-90/10 — scoring (S): wartość Kessiga jako permanentu nie zależy od paliwa w ręce + remis 70/70 (L169).**
- Pomiar: KF-06 — `cast_permanent(kessig-hand)` = **70,20** w czterech wariantach (z Plummetem,
  z Get the Point, z samym Leoninem = brak paliwa, z pustą ręką); w wariancie „Kessig + Leonin" bot
  wybiera Leonina (70) nad Kessigiem (70) — REMIS rozstrzygany kolejnością enumeracji, nie oceną.
- PRO: 1/3 z triggerem na czary niebędące stworami jest wart więcej, gdy takie czary są w ręce
  (i gdy życie przeciwnika jest niskie — F-90/9). **Fala C.**

**F-90/11 — scoring (T/S): aura haste wyceniana tak samo po walce jak przed nią i tak samo na hoście tapniętym/chorym jak na gotowym.**
- Pomiar: M-01 — main1 **78,30** = main2 **78,30** (po walce haste nie daje już nic w tej turze);
  `beginning_of_combat`/`combat_damage`/`end` → brak oferty rzutu (aura bez flash, timing sorcery —
  poprawnie); M-04 — TEN SAM host (Leafcrown Dryad 2/2) odkręcony gotowy **79,20** = chory **79,20**
  = TAPNIĘTY **79,20**; M-02 — `->gotowy-2-2` 79,20 vs `->chory-2-1` 78,30 (różnica 0,9 pkt NA
  KORZYŚĆ gotowego, choć haste istnieje właśnie po to, by zdjąć chorobę atakową); M-03 — host
  tapnięty 78,30.
- Kontrola dodatnia: nadpisanie słów kluczowych JEST widziane — host już z haste **66,60**, host już
  z trample **67,50** (vs 78,30/79,20 na czystym hoście).
- PRO: haste jest warte najwięcej na stworze CHORYM i odkręconym (odblokowuje atak natychmiast),
  prawie zero na tapniętym i po walce. **Fala C.**

### 8.3 Zmierzone POPRAWNE (nie zmieniać; to kotwice anty-over-fix M429)

| Zachowanie | Pomiar |
|---|---|
| Trzymanie hard removalu na godny cel | GT-01: 6/7 = **100** vs 2/1 = **−52** → pass; tylko 2/1 → pass; warded 3/2 = **−54** |
| Wyjątki bramki trzymania | GT-03: życie 9 → **70** (rzuca); lotnik TMC 5 = koszt czaru → **86**; tani lotnik 1/1 bez mojej odpowiedzi w powietrzu → **68**; tani lotnik + mój reach → pass (**−52**) |
| Kara za removal we własnym upkeep/draw | P-01: cast = **−22** → pass; GT-02: cast = **−20** → pass (`removalUpkeepHoldPenalty: 120`) |
| Premia za okno EOT przeciwnika | GT-02: p2 `end` = **112** vs 100 w pozostałych oknach |
| Wybór celu removalu | P-03: 5/5 lotnik **104** > 1/1 lotnik **82** > pass 0; GT-01: 6/7 **100** > warded 3/2 **−54** |
| Brak legalnego celu | P-04: pass; cast we WŁASNEGO lotnika = **−138** |
| Ward {2} i dopłata | LL-03: mana 5 → cel z wardem **−200**, bez warda **−52**; mana 7 → **−54** (dopłata możliwa, wraca bramka trzymania) |
| Scry 1 zależny od karty | GT-04: ląd 20/**−10**; drugi Get the Point **23**/20 → spód; Guide 3/1 **20**/11 → wierzch |
| Delirium (próg 4 typów) | B-01: 3 typy **72** → 4 typy **94** → 5 typów **94** (+22 na progu) |
| Cel pompki (matematyka wymiany + ewazja) | B-04: 4/4 lotnik **80** > 3/2 **72** > 1/1 **62**; lotnik vs naziemny 3/3 **85** > ten sam lotnik vs wrogi lotnik **80** |
| Cel ETB Sawblades (lethal) | SS-01: tapnięty 3/3 **44** vs tapnięty 7/7 **−80** |
| Crew tylko w oknie walki/obrony | BC-01: main1/main2 → **−10**/pass; `beginning_of_combat`/`declare_attackers` → **+11** i potem `attack[permanent-2]`; BC-03: {T} **10** > crew z lotnikiem 4/4 **8**; BC-04: obrona **13**, atakujący lotnik → pass/**−10** |
| Bramka `onlyInStep: 'upkeep'` | NS-02: upkeep → oferta; main1/main2/end → BRAK oferty (F-4/F-9 audytu PR #185 stoi) |
| Wartość poświęcanego stwora | NS-01: fodder 1/1 → **19**, tylko 4/3 → **11** (różnica 8 = `graveyardBodyValue` 13 vs 21 — F-8 audytu PR #185 stoi); brak stwora → **−100**/pass |
| Atak ciałem 1/3 | KF-03: wrogi 2/2 → **−2**/pass; pusty stół → **12**; KF-04: lethal (bloker tapnięty) → **1032**, bloker odkręcony → **−2** |
| Kolejność stwór → instant (trigger Kessiga) | KF-01: mana 4 → `cast_permanent(kessig-hand)`; z wrogim lotnikiem → removal **98** > Kessig **70** |
| Statyka `equipped` Leonina widziana przy `pump` | LL-05 wariant 3: Plate → Leonin **20** > Highland Game **18** |

### 8.4 Kontrole OBOWIĄZKOWE procedury (krok 2)

- **(a) L41** — rozjazdy znalezione: **F-90/7** (equip: 20 vs −8 dla tej samej pary), **F-90/5**
  (klasa „wierzch vs spód/grob": scry ma model jakości karty, explore nie), **F-90/1** (oferta ≠
  wykonanie w gałęzi grobowej — ta sama klasa co M384). Trigger-decyzje liczone osobno:
  `resolve_trigger_target` (SS-01, poprawnie), `resolve_explore_choice` (F-90/5), `resolve_scry`
  (poprawnie). `damage_each_opponent` (Kessig): wartość jest (98 → 100), ale bez skali życia
  (F-90/9). Para `cast_permanent(aura->host)` vs `resolve_aura_host` (aura wchodząca z grobu)
  **NIE jest osiągalna kartami batcha 73** (brak reanimacji aur w 11 wpisach) — kontrola dla tej
  pary niewykonana, udokumentowana zamiast dorabiana syntetykiem (por. Zgłoszenie V właściciela).
- **(b) Wymiar kosztu (S11)** — P-05: Plummet (2 many) **98** vs Get the Point (5 many) **86** na
  TEN SAM cel → różnica 12 = koszt, czary NIE remisują ✓; NS-03: aktywacja za 5 many + stwór **19**
  (mana 10 i 5) vs pass przy manie 2 ✓; BC-03: {T} (dwa artefakty) **10** = crew (stwór 2/1) **10** —
  remis dwóch różnych kosztów, do oceny w kroku 3 (crew z lotnikiem 4/4 spada do **8**, więc koszt
  załogi różnicuje, koszt artefaktów nie).
- **(c) Anty-over-fix M429** — kotwice PRZED (najsłabsze realne warianty, które po naprawach mają
  wrócić do tych samych wartości, a nowe wymiary mają być DOPŁATAMI/KARAMI): SS-01 pusty stół wroga
  **60,30**; SD-02 pusty stół wroga **72,00**; M-03 host z haste **66,60** / z trample **67,50**;
  GT-03 bazowo pass (cast **−52**); KF-03 atak w odkręconego 2/2 **−2**; LL-05 Plate → Highland Game
  **18**; B-04 pompka na 1/1 **62**; RG-02 wariant C (progi spełnione) **40/10**; BC-01 crew w main1
  **−10**; NS-02 brak oferty poza upkeepem.

### 8.5 Fale

- **Fala A (krytyczna, silnik):** F-90/1 — enumeracja wyborów kosztu w gałęzi grobowej
  `legalActivatedAbilities` (wspólny helper z gałęzią polową, L41), pin oferty BEZ ręcznego
  doklejania parametru + test, że komenda WYBRANA PRZEZ BOTA się wykonuje.
- **Fala B (scoring rodzinowy):** F-90/2 (craft), F-90/3 (warunek ETB Sawblades), F-90/4 (Threshold
  must-block), F-90/5 (explore: model jakości karty jak w scry), F-90/9 (skala życia/lethal w
  `damage_each_opponent`).
- **Fala C (dopracowanie):** F-90/6 (sekwencja pod progi), F-90/7 (rozjazd equip), F-90/8 (sprzęt
  triggerowy), F-90/10 (paliwo Kessiga + remis), F-90/11 (haste: stan hosta i okno po walce).

## 9. Wynik pętli (kroki 3–7) — stan 2026-11-16, DONE

**Sonda po pętli:** 53 scenariusze / **189 rekordów** (PRZED: 49/179). Przybyły scenariusze
wprowadzające JEDNĄ nową zmienną każdy (zasada z kroku 2 — `d.opcje` są filtrowane po etykiecie bez
gwarancji kolejności, a `playerView().legalCommands` nie zawiera `resolve_explore_choice`, więc
izolacja zmiennej musi być w STANIE, nie w assertach): RG-05/RG-06 (explore: wartość karty i presja
deck-outu), LL-06/LL-07 (defender i porównanie dwóch sprzętów na tym samym hoście), warianty M-04
(cztery stany hosta + nosiciel z własnym haste), warianty KF-06 (cztery ręce). Rozmiar sondy
20 399 → 81 329 B. Pomiar PO: `.arena/pmssb90-po.{json,log}` + `.arena/pmssb90-tabela-po.txt`
(817 linii); tabela PRZED zachowana jako `.arena/pmssb90-tabela-przed.txt` (743 linie).

**Statusy findingów:** NAPRAWIONE 9 (F-90/1, F-90/2, F-90/3, F-90/4, F-90/5, F-90/7, F-90/8, F-90/9,
F-90/11 — F-90/7 i F-90/8 zamknięte jednym commitem `0816c42`); ZMIERZONE BEZ ZMIANY KODU 1
(F-90/10 — decyzja modelowa właściciela); OTWARTE 3 (F-90/5b — rezyduum F-90/5; F-90/6 — zablokowane
przez F-90/5b; **F-90/12 — NOWE z pomiaru BC-03/BC-04**). Liczby PRZED→PO i root cause'y:
`docs/PMSSB.md` → §PMSSB-90 (tabela 12 wierszy) oraz kamień **M465**.

**F-90/12 (nowe, otwarte — root cause wskazany, BEZ pinu zamrażającego):** Bladewheel Chariot ma dwie
zdolności o tym samym idempotentnym efekcie do EOT (`#0` koszt `{tapOtherArtifacts: 2}`, `#1` koszt
`{crewPower: 1}`, obie `animate_permanent_until_end_of_turn`). Bot aktywuje jedną PO DRUGIEJ
(BC-03 w0: 10,00 → 10,00; BC-04 w0: 13,00 → 13,00), tapując kolejne permanenty za nic. Straż M179/B
(`pendingTwin`) porównuje `sourceId + abilityIndex + targets`, więc INNY indeks zdolności o tym samym
efekcie nie jest bliźniakiem; straż M230 (`source.animatedUntilEOT`) działa dopiero PO rozliczeniu
pierwszej aktywacji (wtedy obie wiszą na stosie). Rekomendacja: `pendingTwin` po ZBIORZE typów
efektów idempotentnych. Defektu NIE zamrażamy pinem — zamrożenie wyglądałoby jak regresja przy
naprawie; reprodukcja `node tools/pmssb90-batch73-petla-sonda.mjs --scen=BC-03 --przebieg`.

**Wymiar T pojazdu (BC-01) zmierzony POPRAWNY** — oczekiwanie z §4 („bot nie atakuje po crew") było
artefaktem harnessa (H-3), nie defektem: main1 → pass (crew −10), `beginning_of_combat` → crew 11,00,
`declare_attackers` → crew 11,00 a po rozliczeniu stosu `attack[permanent-2]` 8,00, main2 → pass.
Obrona: wrogie 4/4 z lataniem → pass (pojazd nie zablokuje), wrogie 6/7 bez latania → crew 13,00.
**Uwaga do właściciela (mechanika, poza scoringiem):** silnik daje aktywnemu graczowi priorytet w
`declare_attackers` PRZED turową akcją deklaracji atakujących, więc crew w tym kroku wciąż pozwala
zaatakować; w realnej grze (CR 508.1 — akcja turowa na początku kroku, bez stosu) byłoby za późno.
Zmierzone, nie zmienione.

**Piny:** `test/audyt-pmssb90-batch73.test.js` = **46 testów / 46 pass** (1a–1e, 9a–9d, 2a–2e, 3a–3f,
4a–4f, 5a–5e, 7a–7b, 8a–8e, 10a–10b, 11a–11f). Każdy RED przed naprawą i GREEN po; helpery czytają
scenariusze Z SONDY (L41 — jedno źródło stanu). Mutacje: 26 w 9 skryptach `.arena/mutacje-f90-*.py`,
wszystkie zgodne z oczekiwaniem, TRZY udokumentowane jako PRZEŻYŁE z powodem nieobserwowalności
(mK4, mN4, mO4 — patrz §PMSSB-90). Re-piny świadome (wzór PMSSB-67/F2):
`test/pmssb10-ogon-wave-b2.test.js` (skala F-90/9) i
`test/uwagi-tura9-bot-rowne-ciala-equip.test.js` T9/8 (wyrażenie `equipValuation` zyskało dwa
składniki sumy; pin liczy teraz `wagaSily *` == 2, czyli pilnuje INTENCJI reguły).

**Ewaluacja (krok 5):** `bot-scoring-snapshot` **4/4 BEZ regeneracji** (golden-master bit w bit);
`bot-tie-audit --gry=2` RC=0 z profilem remisów IDENTYCZNYM jak przed pętlą (24 partie, 11 364
decyzje, single 0, tie_top 569, tie_all 0, 2055 decyzji akcyjnych z 569 remisami = 27,7%, 172 remisów
realnych = 10,4%, GROZY block=2 / attack=9 / cast_spell=3 — bazowy stan PMSSB-89, zmierzony, nie
naprawiony); `tools/mirror-eval.mjs` NIE uruchamiany osobno — lustro porównuje kandydata (nowe
parametry) z baseline (domyślne), a ta pętla nie dodaje żadnego klucza parametrów
(`heuristic-params.js` nietknięty, `git diff` pusty); test `bot-mirror-eval.test.js` jest w bramce
`all` i zielony. **Żywy Tester PO:** 3 partie × 400 kroków na artefakcie PO naprawach, karty batcha
73 po obu stronach (`ixalan`↔`innistrad-brg` s42, `ravnica-bg`↔`forgotten-realms-wug` s7,
`theros`↔`dominaria-wrg` s9): w każdej `DETEKTORY: brak zgłoszeń` i `NIEWYCENIONE == brak`, wszystkie
z naturalnym końcem partii; transkrypty poza repo (`.gitignore:30`).

**Bramy (krok 7):** fast **10 437/10 437** (`.arena/f90-10b-fast.log`, FAST_RC=0; PRZED pętlą
10 390), slow 282, `test:all` **10 719/10 719** (ALL_RC=0), `npm run build` RC=0 (79 modułów /
5920,2 kB), `node tools/cr-numery.mjs` OK (561 unikalnych numerów w 6805 cytatach; w pętli poprawiony
jeden cytat — explore to **CR 701.44a**, bo 701.40 w wydaniu CR 2026-11-06 to manifest). Talie
chwilowe z etapu E3 audytu usunięte PRZED bramkami + rebuild (M331).

**Nowa lekcja:** **L194** w `docs/LESSONS.md` (pin porządku bez progu przechodzi bez naprawy —
Δ 0,0018 drukuje się jako remis 70,20 = 70,20; jedna zmienna na wariant sondy; pin na dosłowne
wyrażenie źródła → licznik intencji, klasa L186/L5) + narracja w `docs/LESSONS_PRZYPADKI.md`.
Budżet lektury startowej po dopisaniu: **99 780 / 100 000** tokenów (zapas 220 ≈ 0,6 kB) — następna
sesja przed kolejnym wpisem do `docs/LESSONS.md` robi kondensację (PR #93/L66).

**Commity pętli (11 + dokumentacja):** `386bee8` plan → `6e98350` krok 1+2 → `41407d3` F-90/1 →
`c402ee5` F-90/9 → `f3ca0af` F-90/2 → `70b0fe7` F-90/3 → `7d422f1` F-90/4 → `69be35f` F-90/5 →
`0816c42` F-90/7+8 → `1c34b4e` F-90/11 → `bc58123` F-90/10 (piny-kotwice, bez kodu) → dokumentacja
(§PMSSB-90 + rejestr + M465 + dziennik + ten rozdział + handoff + body PR #186).

**Definicja ukończenia (§7) — odpowiedź punkt po punkcie:**

| Kryterium | Stan |
|---|---|
| Sonda macierzowa z odpowiedzią na (T)/(C)/(S) dla 11 wpisów | ✓ 53 scenariusze / 189 rekordów, wymiary S/C/T/K + kontrole; tabele PRZED/PO w `.arena/` |
| Każdy finding ma root cause, naprawę generyczną, piny RED→GREEN i mutacje | ✓ dla 9 naprawionych + 1 zmierzonego bez kodu; 3 otwarte mają root cause i JAWNY status (F-90/5b, F-90/6, F-90/12) — bez cichego skipu |
| Ewaluacja: snapshot bez regeneracji, tie-audit, mirror, Żywy Tester | ✓ 4/4; ✓ RC=0 (profil bez zmian); mirror — nieuruchamiany z podanym powodem (brak nowych parametrów); ✓ 3 partie bez zgłoszeń |
| §PMSSB-90 + rejestr + PROJECT_HISTORY + M465 + opis PR | ✓ `docs/PMSSB.md` (sekcja @4307, wiersz rejestru @72), ✓ M465, ✓ dziennik, ✓ handoff, ✓ body PR #186 |
| Bramy zielone (fast/slow/all/build) | ✓ 10 437 / 282 / 10 719 / RC=0 |
| Talie chwilowe usunięte | ✓ `rm decks/audyt-batch73*.txt` + rebuild PRZED bramką (M331) |
| Handoff i blok przekazania w czacie | ✓ `docs/setup/HANDOFF_2026-11-16-pmssb90.md` + blok w czacie |
| PR #186 do scalenia przez właściciela | ✓ autor nie scala; `Squash and merge` po decyzji właściciela (ADR 0007) |
