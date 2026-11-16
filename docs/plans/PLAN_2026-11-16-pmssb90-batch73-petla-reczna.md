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

- [ ] **0. Plan** — ten plik; commit + push PRZED jakimkolwiek kodem (ADR 0020 A).
- [ ] **1. POMIAR PRZED** — nowa sonda macierzowa `tools/pmssb90-batch73-petla-sonda.mjs`
      (commitowana, nie w `/tmp`: L24 — skutek bez śladu nie istnieje; wzór harnessa:
      `tools/pmssb89-batch73-scoring-sonda.mjs` po naprawie F-20). Per karta ≥4 scenariusze
      zmieniające JEDEN wymiar, z realistyczną maną (nie `richMana`), z ≥2 kandydatami na cel
      i z wydrukiem: wybranej komendy, jej score, score alternatyw, fazy/tury, stanu
      (stół/ręka/biblioteka/grób/życie). Wynik: tabela `karta × scenariusz → decyzja /
      FINDING`. Log: `.arena/pmssb90-przed.log`.
- [ ] **2. AUDYT** — macierz **kierunek × cel × timing × stan** → findingi (numeracja Fx pętli,
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
