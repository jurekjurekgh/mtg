# Plan sesji 2026-09-24 — audyt scalonego PR #134 + pętla jakości (ADR 0020 B / ADR 0021)

**Gałąź:** `arena/01a0d024-mtg` · **Baza:** `main` = `4f75e22` (squash PR #134)
**Zlecenie:** „Kontynuujemy projekt." — prompt nie nazywa tematu, więc obowiązuje
pętla domyślna ADR 0021: PR na starcie → audyt poprzedniego scalonego PR →
nieodhaczone pozycje planów → pętla jakości (Żywy Tester + łowy CR).
**Bez nowego batcha kart** (ADR 0021 §4c, ADR 0029: katalog = kolekcja
właściciela, arkusz pokryty w 100% — 502 wiersze / 502 `artId`).

## Etap 0 — rozpoznanie (wykonane przed tym plikiem)

- [x] Lektura obowiązkowa AGENTS.md §0: `AGENTS.md` (368 linii), **wszystkie**
      ADR-y 0001–0030 + README rejestru (0008 w archiwum), `docs/LESSONS.md`
      (2380 linii, L1–L163 — całość), `docs/setup/ENVIRONMENT.md` (189 linii),
      najnowszy handoff `HANDOFF_2026-09-23d.md`, ostatni PR (#134).
- [x] `npm test` na `main`: **6304/6304**, 0 fail, ~225 s (zgadnie z handoffem).
- [x] `npm run build`: **59 modułów / 4124,0 kB** (zgadnie z handoffem).
- [x] Stan katalogu: 550 wpisów = 499 `supported` + 43 `token` + 8 `back`.
- [x] `gh pr list`: ostatni scalony PR to **#134** (100 plików, +7048/−9701,
      merged 2026-09-23T21:20:53Z). PR #135 nie istnieje.

## Etap A — PR na starcie (ADR 0020 A)

- [x] A1: ten plan jako OSOBNY commit wypchnięty na gałąź sesji.
- [x] A2: `gh pr create` → PR #135 (base `main`), opis z szablonem: zakres
      audytu, bramy, znaleziska (uzupełniany kumulatywnie).

## Etap B — audyt PR #134 (ADR 0020 B / ADR 0016): 100 plików, 6 osi

Metoda: diff `351126a..4f75e22` czytany PLIK PO PLIKU (nie „przegląd tematów"),
każde twierdzenie regułowe weryfikowane wobec dosłownego CR/Oracle z sieci
(ADR 0030 — pamięć treningowa nie jest źródłem), każde „przypięte testem"
sprawdzone mutacją w kierunku PRZED naprawą (L13/L34/L159).

- [x] B1 — **batch 58 (7 kart)**: definicje vs snapshoty Scryfall
      (`docs/cards/scryfall-{boulder-salvo,grazing-gladehart,polluted-dead,
      scroll-of-avacyn,resurrected-cultist,prishes-wanderings,gond-gate}.json`),
      rulingi WotC online, `MANA_COSTS`, `limitations`/`notes` (ADR 0022),
      talie z generatora (ADR 0023/0024), piny w `test/real-cards-batch58.test.js`
      (770 linii) — czy testy mierzą regułę, czy implementację.
- [x] B2 — **silnik**: surge na ścieżce czarów (CR 702.117 — numer bieżący,
      w repo było 702.111; patrz F-3), `entersUntapped`
      jako efekt zastępczy wejścia (CR 614.1d), `colorsFrom` (mana „kolorów,
      jakie może dać kontrolowana Brama"), kwalifikator `anyOf` + cel
      refleksyjny po przeszukaniu, bramka `delirium`, powrót SIEBIE z grobu
      z licznikiem finality, trigger śmierci celujący w ląd, landfall „możesz",
      warunek „kontrolujesz stwora o podtypie" — generyczność (ADR 0002: zero
      rozgałęzień po nazwie/ID karty), kompletność `PlayerView` (ADR 0017),
     FoW (ADR 0003), determinizm (ADR 0005).
- [x] B3 — **dane i statusy (M417–M419)**: usunięcie 71 wierszy `STO`
      (573→502), strażnik `KODY_SPOZA_KOLEKCJI`, usunięcie legacy viewera
      (9258 linii, zgoda właściciela), likwidacja statusu `limited` →
      `token`/`back` + `test/statusy-wpisow-katalogu.test.js`; spójność
      `decks/*.txt` z generatorem (ADR 0029 §4).
- [x] B4 — **heurystyki bota (sesja c + F1 v2)**: nowe pokrętła
      (`morbidMain1Penalty`, `morbidMain2Bonus`, `graveReturnManaWeight`,
      `libraryTapSafeMargin`, `cloakLibraryFloor`, `cloakThinLibraryPenalty`) —
      czy wycena idzie po TYPIE efektu/deskryptorze (ADR 0002), czy próg 10
      nie koliduje z drabiną `libraryDrainTax` (watchlista handoffu),
      golden-master `test/fixtures/bot-scoring-snapshot.json` (+22/−21) —
      czy zmiana śladu wynika ze zmiany wag, a nie z regresji (L124).
- [x] B5 — **warstwa stołu**: koszty w ofertach (`cardCostHtml`,
      `abilityCostHtmlOf`, `abilityCostSuffix`, `manaCostHtml`, `uncoverCostOf`
      czytany ze STANU — FoW), multiselect „up to two" (detain), Mana Wizard
      (pokrycie pipów per grupa), `installPressActivation` (klik bez reflow),
      kolejność panelu (deklaracje pod „Dalej (Pass)"), badge „zatrzymany",
      etykieta Cloak z kosztem rzucenia, zakryta Aura jako 2/2 (CR 708.2).
- [x] B6 — **testy**: RED→GREEN dla każdego nowego pinu (mutacje), anty-over-fix,
      brak pinów utrwalających błędną regułę (L13 §6), strażniki klasowe zamiast
      egzemplarzowych (L5, L39).
- [x] B7 — **werdykt** + znaleziska F-n w `docs/audits/AUDYT_PR134_2026-09-24.md`
      (pokrycie plików, matryca mutacji, cytaty CR z datą pobrania).

Kryterium ukończenia: raport w `docs/audits/` z jawnym werdyktem
(APPROVE / APPROVE z zastrzeżeniami / REQUEST CHANGES), bramy odtworzone
(`npm test` + `node --test test/bot-benchmark.test.js`; **bez pełnego B0** —
ADR 0018), każde znalezisko z repro i propozycją naprawy u root cause.

## Etap C — naprawy znalezisk audytu (osobne, zielone commity)

- [x] C1 — **F-1 (HIGH)** Gond Gate produkował `{U}{B}` zamiast `{C}`
      (`effects.js:3380` — `abilityColors ?? []`): piny G1/G2, commit `f19a43c`.
- [x] C2 — **F-2 (MEDIUM)** „could produce” (CR 106.7) czytało wyłącznie
      deskryptory `add_mana`: helper `manaColorsIgnoringCosts` (4 źródła kolorów),
      piny G3/G4/G4b/G4c/G5/G6 — każda gałąź ma mutację, która ją czerwieni
      (M1/M2a/M2b/M2c/M3), commit `f19a43c`.
- [x] C3 — **F-4 (LOW)** delegacja `commandForProliferateSelection` zwracała
      pierwszą komendę bez `targetIds`: jawne `{ type: 'resolve_proliferate' }`,
      piny H1/H2/H3 + mutacja M4, commit `3cf1657`.
- [x] C4 — **F-3 (MEDIUM)** przestarzałe numery CR w `src/` i `test/`
      (Surge 702.111→702.117, finality 122.1e→122.1h, cloak 701.56→701.58,
      DFC 711.x→712.x + dwie korekty wskazań 712.9→712.5 i 712.8e→712.4d) oraz
      fałszywa teza o CR 601.2b w komentarzach surge (F-3e): 131 zmian,
      strażnik `test/audyt-pr134-2026-09-24-cytaty-cr.test.js` (C1/C2/C3)
      + mutacje M5/M6, commit `8ec5dac`.
- [x] C5 — **F-3 raport**: znaleziska F-1..F-4 i obserwacje O-1..O-5 w
      `docs/audits/AUDYT_PR134_2026-09-24.md`, commit `e8cdab0`.

Zasada: każde znalezisko = test RED → naprawa u root cause → mutacja dowodząca,
że pin czerwienieje → `npm test` + `npm run build` → commit + push (ADR 0020
C/D). Zakaz force push; przed pushem `git fetch` i porównanie
`HEAD..FETCH_HEAD` / `FETCH_HEAD..HEAD`.

## Etap D — pętla jakości (ADR 0021 §4): pozycje otwarte z PR #134 + nowe łowy

Pozycje jawnie zostawione przez poprzednią sesję („Otwarte" w opisie PR #134):

- [x] D1 — **Z-1**: klasa `power + grantedPower` — zweryfikowana wobec kontraktu
      widoku i domknięta. `playerView` niesie `power` EFEKTYWNE
      (`effectivePower` = baza + `powerModifier` + liczniki + załączniki +
      statyki + anthemy + buffy EOT), a `grantedPower` to `grantedStatBonus` —
      TEN SAM dodatek z efektów ciągłych, wysłany jawnie dla badge'a (M188/A),
      więc `grantedPower ⊆ power` i suma podwaja bonus. Naprawione trzy miejsca
      w `heuristic-bot.js`: `attackerCanBeBlocked` (próg ewazji „can't be
      blocked by creatures with power N or less”, Batch53/C) oraz obie wyceny
      equipmentu (`effectivePower`, `effectiveTargetPower` przy
      `cantBeBlockedMaxPower`) — czwarte (`cantBeBlockedTargetValue`) naprawił
      audyt PR #133 (F-4). Próg dotyczy MOCY, nie obrażeń bojowych, więc celowo
      nie `combatPower` (zwraca wytrzymałość przy `combatDamageByToughness`).
      `attackerCanBeBlocked` wyeksportowana dla pinu (wzorzec `blockExchangeOf`,
      `effectiveTypesOf`, `temporaryPumpOf`). Pin
      `test/audyt-pr135-2026-09-24-moc-efektywna.test.js`: Z-1/1 (bloker 1/1
      z aurą +2/+2 mieści się pod progiem 3 — atakujący nieblokowalny), Z-1/2
      (anty-over-fix: bloker 4 i 5 nadal blokuje), Z-1/3 (menace: liczą się
      blokerzy ZDOLNI do bloku, CR 702.111b), Z-1/4 (strażnik klasy: idiom
      „power + grantedPower” zakazany w `src/` i `test/`, komentarze
      wyłączone). Mutacja M10 (przywrócona suma) czerwieni Z-1/1, Z-1/3 i Z-1/4.
      Kontraktu widoku nie duplikuję — pinuje go `m188-uwagi-wlasciciela` A1/A3
      (L41).
- [x] D2 — **Z-2**: klauzula `bestow == null` w guardzie CR 704.5m
      (`attachments.js:541`) bez pinu — zweryfikowana wobec dosłownego CR
      (ADR 0030): pobrany tekst `702.103a–g` (edhmeta, CR 2024-11-08) pokazał,
      że guard nie jest jedną regułą, tylko TRZEMA (702.103b bestow-czar staje
      się aurą, 702.103e nielegalny cel przy rozstrzyganiu → permanent-stwór,
      702.103f odłączenie/utracenie hosta → wyjątek od 704.5m, aura zostaje
      stworem). Cytaty w `attachments.js`/`spells.js`/`objects.js`/`identity.js`
      rozdzielone na właściwe podreguły (17 miejsc), a pin
      `test/granica-7045m-aura-sba-2026-09-21.test.js` rozszerzony o H/5 (aura
      bestow bez hosta ZOSTAJE na polu bitwy jako stwór — wyjątek 702.103f)
      i H/6 (czysta aura bez hosta idzie do grobu właściciela — 704.5m).
      Mutacje M7 (guard bez `bestow == null`) i M8 (guard bez `aura != null`)
      czerwienią H/5–H/6 (L13). 6/6 zielone.
- [ ] D3 — **Żywy Tester** (`tools/table-tester`): partie na taliach z kartami
      batcha 58 i z mechanikami sesji c (detain, Epic Experiment, Mana Wizard,
      cloak) — trzy osie audytu z `TESTER_STOLU.md`; braki narzędzia naprawiane
      w narzędziu (L12/L27); każda klasa znaleziona ręcznie → nowy detektor.
- [x] D4 — **łowy CR** inną ścieżką niż poprzednie sesje: poszły przez OŚ
      CYTATÓW CR (F-3 z audytu jako punkt wejścia). Pobranie dosłownego spisu
      `702. Keyword Abilities` z CR 2026-09-25 (`mtg.wiki/page/Keyword_ability`)
      i sekcji 712 (`mtg.wiki/page/Double-faced_card`) zamiast dokładania
      kolejnych par do strażnika dało **121 dalszych rozjazdów „mechanika ↔
      numer”** (F-6: 112 w dwóch falach, F-7: 9 znalezione nowym detektorem
      okna) plus JEDNO odstępstwo merytoryczne: `transformedCharacteristics`
      resetuje cechy przy transformie w miejscu, a CR 712.18 mówi, że efekty
      działające na permanent przechodzą przez transform (obserwacja **O-6**,
      do decyzji właściciela — poprawka wymaga modelu warstw 613).
      Kandydaci z listy powyżej (614.1d vs ścieżki wejścia, `colorsFrom` vs
      warstwy, cel refleksyjny vs 608.2b/2h) zostają otwarte — ich wspólnym
      mianownikiem są warstwy 613, czyli ten sam korzeń co O-6.
- [ ] D4b — **warstwy 613** jako osobna oś łowów (spadkobierca D4): silnik
      trzyma efekty jako mutacje pól obiektu, więc (a) transform gubi animację
      (O-6), (b) `colorsFrom` nie jest rozliczany warstwowo, (c) kolejność
      efektów „until end of turn” zależy od kolejności zapisu. Wymaga decyzji
      właściciela: model warstw to zmiana architektury, nie łatka.

## Etap E — domknięcie sesji

- [ ] E1: `npm test` + `npm run test:all` + `npm run build` — liczby ZMIERZONE
      (L92: stan odświeżany na koniec, nie w środku PR).
- [ ] E2: `docs/setup/HANDOFF_2026-09-24.md`, wpis w `docs/PROJECT_HISTORY.md`,
      `docs/ENGINE_MILESTONES.md` (M423+), `README.md` (sekcja Status).
- [ ] E3: lekcje trwałe → `docs/LESSONS.md` (nowy wpis płaci się skróceniem
      innego; próg 100k bez zmian — `test/dokumentacja-budzet-lektury.test.js`).
- [ ] E4: opis PR zaktualizowany kumulatywnie; podsumowanie wykonania w tym planie.

## Ryzyka i pułapki (z LESSONS/ENVIRONMENT)

- **L136/L137:** scratch (transkrypty, sondy, mutacje) w `.arena/` poza repo;
  każdy finding zamykany commitem i pushem od razu — sandbox potrafi się
  zresetować w środku sesji (ENVIRONMENT §2).
- **L76/L33:** Żywy Tester mierzy `dist/`, nie `src/` — `npm run build` po
  każdej zmianie w `src/`; przy braku efektu najpierw podejrzewaj artefakt.
- **L13/L34/L159:** mutacja = stan PRZED naprawą (`git show HEAD:<plik>`),
  kierunek mutacji sprawdzony, „WZORZEC NIEZNALEZIONY" = mutacja nie zaszła.
- **L57/ADR 0030:** zgłoszenie ≠ reguła; każda teza regułowa z dosłownym
  cytatem CR/rulingu pobranym z sieci w tej sesji (brak egressu z `bash` →
  `fetch_page`).
- **L66/L92:** budżet lektury 100k bez podnoszenia; liczby „bieżącego stanu"
  mierzone, nie przepisywane.
- **ADR 0018:** pełna macierz B0 wyłącznie na komendę właściciela; do PR
  wystarczy profil szybki (`node tools/benchmark.mjs`).

## Podsumowanie wykonania

_(stan pośredni — dopisywane na końcu sesji)_

- **Etap 0/A/B: wykonane.** Lektura obowiązkowa w całości, bramy bazowe
  odtworzone na `main` (6304/6304, 59 modułów / 4124,0 kB), PR #135 otwarty na
  starcie (`cd9def3`), audyt PR #134 (100 plików, diff `351126a..4f75e22`
  czytany plik po pliku) zamknięty raportem `e8cdab0` z werdyktem
  **APPROVE z zastrzeżeniami**: 4 znaleziska (F-1 HIGH, F-2 MEDIUM,
  F-3 MEDIUM, F-4 LOW), 5 obserwacji (O-1..O-5), 11 tez regułowych
  zweryfikowanych dosłownym tekstem CR/Oracle z sieci (ADR 0030), 14
  pozostawionych „do weryfikacji u źródła” z jawnym odroczeniem.
- **Etap C: wykonany (4 commity).** F-1 + F-2 (`f19a43c`), F-4 (`3cf1657`),
  F-3 (`8ec5dac`). Bramy po każdym commicie: 6312/6312 → 6315/6315 →
  6318/6318, build 59 modułów / 4127,9 kB. Nowe piny: 8 (G1..G6) + 3 (H1..H3)
  + 3 (C1..C3 strażnika cytatów). Dowody mutacyjne: M1, M2a, M2b, M2c, M3, M4,
  M5, M6 — każda mutacja to stan PRZED naprawą, każda czerwieni przypisany pin
  (L13).
- **Etap D: częściowo wykonany.** D2 (Z-2) zamknięty — guard 704.5m
  zweryfikowany wobec dosłownego `702.103a–g`, cytaty rozdzielone na trzy
  podreguły, piny H/5–H/6, mutacje M7/M8. D4 (łowy CR) zamknięty osią cytatów:
  F-6 (112 rozjazdów w dwóch falach), F-7 (9 rozjazdów znalezionych nowym
  detektorem okna), O-6 (odstępstwo od CR 712.18 przy transformie w miejscu)
  i D4b (warstwy 613 — nowa pozycja, wymaga decyzji właściciela). D1 (Z-1)
  zamknięty: `power` z widoku jest EFEKTYWNE, a `grantedPower` to ten sam
  dodatek dla badge'a — trzy miejsca w `heuristic-bot.js` poprawione, pin
  Z-1/1..Z-1/4 (w tym strażnik klasy na idiom), mutacja M10. Otwarte:
  D3 (Żywy Tester), D4b.
- **Nowe strażniki (Etap D):** `test/cr-numery-702-tabela-straznik.test.js`
  (tabela 702.1–702.195 z CR 2026-09-25 + aliasy + udokumentowane wyjątki;
  każdy cytat `702.<n>` musi siedzieć przy nazwie mechaniki w oknie ±8 linii;
  wbudowany dowód RED), 11 nowych par w `cr-numery-mechanik-straznik.test.js`
  (surge/finality/cloak/vigilance/flashback/plot/endure/infect/outlast/
  equipment/DFC) + wyłączenia plików-strażników ze skanu, pin
  `audyt-pr134-…-cytaty-cr.test.js` przepisany na bieżące wydanie (C1 martwe
  numery, C2 = 26 wymaganych cytatów w tym dwa „BEZ ZMIAN”, C3 bez zmian).
  Bramy po Etapie D (F-3 f2 + F-6 + F-7 + Z-2): **6334/6334** testy, build
  **59 modułów / 4129,8 kB**; po Z-1: **6338/6338** testy, build **59 / 4131,0 kB**.
  Mutacja M9 (vigilance 702.20 → 702.21) czerwieni detektor okna I parę.
- **Lekcje:** L164 (lustro CR bywa o wydanie do tyłu — potwierdzaj numer
  w BIEŻĄCYM wydaniu, cytaty „BEZ ZMIAN” w pinie), L165 (strażnik liniowy nie
  łapie rozjazdu o linię obok nazwy — detektor klasy musi mieć okno i tabelę).
- **Utrudnienia sesji (dwa, oba środowiskowe).**
  1. Token GitHub wygasł po commicie `8ec5dac` (`gh auth status`: „The
     github.com token in GH_TOKEN is no longer valid") — właściciel poproszony
     o ponowne podłączenie GitHuba w Arena (ENVIRONMENT §2: wygaśnięcie tokena
     = pytanie do właściciela, nigdy prośba o token w czacie).
  2. **Sandbox został zresetowany i sklonowany od nowa** (reflog: clone
     2026-09-24 06:31:19, HEAD = `4f75e22`), przez co LOKALNY commit `8ec5dac`
     (F-3, 122 zamiany + pin C1–C3) przestał istnieć jako obiekt gita — jego
     ZAWARTOŚĆ przetrwała w drzewie roboczym (snapshot plików). Gałąź sesji
     ustawiona z powrotem na wypchnięty czubek `3cf1657`
     (`git reset 3cf1657`, bez dotykania drzewa), więc historia jest liniowa
     i push pozostaje fast-forward (bez force push, ADR 0021). Zmiana F-3 jest
     odtworzona w kolejnym commicie razem z falą 2 (F-6/F-7) — pliki się
     pokrywają (np. `spells.js` niesie F-3, F-6 i Z-2), więc podział na commity
     per znalezisko nie był możliwy bez interaktywnego `git add -p`.
     Wniosek praktyczny (ENVIRONMENT §2 działa w drugą stronę): push od razu po
     znalezisku ratuje HISTORIĘ, nie tylko pliki.
