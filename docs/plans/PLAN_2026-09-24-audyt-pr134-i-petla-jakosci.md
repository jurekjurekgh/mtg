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

- [ ] B1 — **batch 58 (7 kart)**: definicje vs snapshoty Scryfall
      (`docs/cards/scryfall-{boulder-salvo,grazing-gladehart,polluted-dead,
      scroll-of-avacyn,resurrected-cultist,prishes-wanderings,gond-gate}.json`),
      rulingi WotC online, `MANA_COSTS`, `limitations`/`notes` (ADR 0022),
      talie z generatora (ADR 0023/0024), piny w `test/real-cards-batch58.test.js`
      (770 linii) — czy testy mierzą regułę, czy implementację.
- [ ] B2 — **silnik**: surge na ścieżce czarów (CR 702.111), `entersUntapped`
      jako efekt zastępczy wejścia (CR 614.1d), `colorsFrom` (mana „kolorów,
      jakie może dać kontrolowana Brama"), kwalifikator `anyOf` + cel
      refleksyjny po przeszukaniu, bramka `delirium`, powrót SIEBIE z grobu
      z licznikiem finality, trigger śmierci celujący w ląd, landfall „możesz",
      warunek „kontrolujesz stwora o podtypie" — generyczność (ADR 0002: zero
      rozgałęzień po nazwie/ID karty), kompletność `PlayerView` (ADR 0017),
     FoW (ADR 0003), determinizm (ADR 0005).
- [ ] B3 — **dane i statusy (M417–M419)**: usunięcie 71 wierszy `STO`
      (573→502), strażnik `KODY_SPOZA_KOLEKCJI`, usunięcie legacy viewera
      (9258 linii, zgoda właściciela), likwidacja statusu `limited` →
      `token`/`back` + `test/statusy-wpisow-katalogu.test.js`; spójność
      `decks/*.txt` z generatorem (ADR 0029 §4).
- [ ] B4 — **heurystyki bota (sesja c + F1 v2)**: nowe pokrętła
      (`morbidMain1Penalty`, `morbidMain2Bonus`, `graveReturnManaWeight`,
      `libraryTapSafeMargin`, `cloakLibraryFloor`, `cloakThinLibraryPenalty`) —
      czy wycena idzie po TYPIE efektu/deskryptorze (ADR 0002), czy próg 10
      nie koliduje z drabiną `libraryDrainTax` (watchlista handoffu),
      golden-master `test/fixtures/bot-scoring-snapshot.json` (+22/−21) —
      czy zmiana śladu wynika ze zmiany wag, a nie z regresji (L124).
- [ ] B5 — **warstwa stołu**: koszty w ofertach (`cardCostHtml`,
      `abilityCostHtmlOf`, `abilityCostSuffix`, `manaCostHtml`, `uncoverCostOf`
      czytany ze STANU — FoW), multiselect „up to two" (detain), Mana Wizard
      (pokrycie pipów per grupa), `installPressActivation` (klik bez reflow),
      kolejność panelu (deklaracje pod „Dalej (Pass)"), badge „zatrzymany",
      etykieta Cloak z kosztem rzucenia, zakryta Aura jako 2/2 (CR 708.2).
- [ ] B6 — **testy**: RED→GREEN dla każdego nowego pinu (mutacje), anty-over-fix,
      brak pinów utrwalających błędną regułę (L13 §6), strażniki klasowe zamiast
      egzemplarzowych (L5, L39).
- [ ] B7 — **werdykt** + znaleziska F-n w `docs/audits/AUDYT_PR134_2026-09-24.md`
      (pokrycie plików, matryca mutacji, cytaty CR z datą pobrania).

Kryterium ukończenia: raport w `docs/audits/` z jawnym werdyktem
(APPROVE / APPROVE z zastrzeżeniami / REQUEST CHANGES), bramy odtworzone
(`npm test` + `node --test test/bot-benchmark.test.js`; **bez pełnego B0** —
ADR 0018), każde znalezisko z repro i propozycją naprawy u root cause.

## Etap C — naprawy znalezisk audytu (osobne, zielone commity)

- [ ] C1..Cn: każde znalezisko = test RED → naprawa u root cause → mutacja
      dowodząca, że pin czerwienieje → `npm test` + `npm run build` → commit
      + push (ADR 0020 C/D). Zakaz force push; przed pushem `git fetch` i
      porównanie `HEAD..FETCH_HEAD` / `FETCH_HEAD..HEAD`.

## Etap D — pętla jakości (ADR 0021 §4): pozycje otwarte z PR #134 + nowe łowy

Pozycje jawnie zostawione przez poprzednią sesję („Otwarte" w opisie PR #134):

- [ ] D1 — **Z-1**: klasa `power + grantedPower` w trzech miejscach
      `heuristic-bot.js` (F-4 naprawił jedno — `cantBeBlockedTargetValue`):
      sprawdzić każde miejsce wobec kontraktu widoku (czy `power` jest już
      efektywny, a `grantedPower` tym samym dodatkiem — L55 §3) i domknąć
      klasę jednym helperem + strażnikiem.
- [ ] D2 — **Z-2**: klauzula `bestow == null` w guardzie CR 704.5m
      (`attachments.js:541`) bez pinu — zweryfikować wobec dosłownego CR
      (ADR 0030) i dopisać pin (mutacja czerwieni).
- [ ] D3 — **Żywy Tester** (`tools/table-tester`): partie na taliach z kartami
      batcha 58 i z mechanikami sesji c (detain, Epic Experiment, Mana Wizard,
      cloak) — trzy osie audytu z `TESTER_STOLU.md`; braki narzędzia naprawiane
      w narzędziu (L12/L27); każda klasa znaleziona ręcznie → nowy detektor.
- [ ] D4 — **łowy CR** inną ścieżką niż poprzednie sesje (M404/M416 szły przez
      cleanup i restrykcje bloku): kandydaci — efekty zastępcze wejścia
      (614.1d) vs inne ścieżki wejścia, `colorsFrom` vs warstwy 613.4/613.5,
      surge na ścieżce czarów vs kopie/`spell_cast`, finality vs `exile`
      w kosztach, cel refleksyjny vs CR 608.2b/608.2h.

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

_(dopisywane na końcu sesji)_
