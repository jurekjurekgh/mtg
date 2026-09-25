# Plan sesji 2026-09-25d — audyt scalonego PR #137 + pętla jakości (ADR 0020 B / ADR 0021)

**Gałąź:** `arena/01a0d870-mtg` · **Baza:** `main` = `7ccc440` (squash PR #137)
**Zlecenie:** „Kontynuujemy projekt." — prompt nie nazywa tematu, więc obowiązuje
pętla domyślna ADR 0021: PR na starcie → audyt poprzedniego scalonego PR →
niedokończony plan → pętla jakości (Żywy Tester + łowy CR inną ścieżką).
**Bez nowego batcha kart** (ADR 0021 §4c, ADR 0029) i **bez pełnego B0**
(ADR 0018 — wyłącznie na wyraźną komendę właściciela).

## Etap 0 — rozpoznanie (przed tym plikiem)

- [x] Lektura obowiązkowa do ostatniej linii: `AGENTS.md` (373), wszystkie ADR-y
      0001–0030 + README (0008 w archiwum, poza lekturą), `docs/LESSONS.md`
      (2574 linii, L1–L171), `docs/setup/ENVIRONMENT.md` (189), najnowszy handoff
      `docs/setup/HANDOFF_2026-09-24f.md` (110). Handoffu 25a/b/c **nie ma** —
      sesje te weszły do PR #137 bez własnego pliku przekazania.
- [x] `npm test` na `main` (`7ccc440`): **6587/6587**, 0 fail, 211 s — zgodne
      z opisem PR #137 po M433 („6587/6587, start M432: 6582 → +5").
      `npm run build`: **61 modułów / 4292,3 kB** — zgodne z tym samym opisem.
- [x] `gh pr list`: brak otwartych PR; ostatni scalony to **#137**
      (`mergedAt` 2026-09-25T12:00:44Z, 18 commitów, 53 pliki, +4456/−231,
      diff `0b2f771..7ccc440`). Cel audytu (ADR 0020 B). Sesje w PR: 24f
      (audyt #136 + F-1…F-5, M430), 25a (M431: decyzja odkręcania + wycena
      keywordów aur), 25b/c (M432 uwagi C/D, M433 odmiana + reguła „naprawiaj
      od razu").
- [x] Plan z nieodhaczonymi kryteriami: `PLAN_2026-09-25a` ma checkboxy `[ ]`,
      ale treść „Status po sesji" mówi, że A–D i część E są zrobione, a otwarte
      **świadomie** zostaje E2 (phasing 502.1, stun 122.1d, zmiana kontrolera
      400.3, odkręcenie efektem) oraz pełna lektura transkryptu Żywego Testera.
      To nie jest martwy plan sprzed dwóch tygodni — następna sesja (ta) ma
      zacząć od E2 **po** audycie, nie zamiast niego (ADR 0020 nadrzędny).
- [x] Katalog nie rósł (ADR 0029): w diffie `card-data.js` tylko flaga
      `untapChoice` na istniejącej karcie i korekta cytatu CR w nocie.

## Etap A — PR na starcie (ADR 0020 A)

- [ ] A1: ten plan jako osobny commit, wypchnięty na gałąź sesji.
- [ ] A2: `gh pr create` (base `main`) — opis z szablonu: zakres audytu, bramy,
      znaleziska; uzupełniany kumulatywnie. Agent nie scala.

## Etap B — audyt PR #137 (ADR 0020 B / ADR 0016), 53 pliki, 8 osi

Metoda: diff `0b2f771..7ccc440` czytany plik po pliku (silnik i dane najpierw).
Każde twierdzenie regułowe weryfikowane wobec **dosłownego** CR (ADR 0030 —
pamięć treningowa nie jest źródłem; lustro bieżącego wydania, nie pierwsze
znalezione — L164). Każde „przypięte testem" sprawdzone mutacją w kierunku
PRZED naprawą (L13/L34/L159: mutacja, która się nie wykonała, nie jest zielona).
Zero zgłoszeń detektorów = pomiar narzędzia, nie czystość (L27).

- [ ] B0 — co PR #137 zostawił otwarte vs co jest świadomą granicą (E2 z planu
      25a, brak handoffu 25a/b/c, `PROJECT_HISTORY` kończy się na M430 mimo
      wpisów M431–M433 w `ENGINE_MILESTONES`).
- [ ] B1 — **M431 / decyzja odkręcania (CR 502.3)**. Pliki: `permanents.js`
      (`untapChoiceCandidates`, `untapControlled(keepTappedIds)`, usunięte
      `isActiveLockSource`), `resources.js` (`beginTurn`), `game-state.js`
      (oferta, walidacja, bramka `execute`, kontynuacja tury, widok),
      `identity.js` / `deck.js` / `materialize.js` / `registry.js` (L21: cztery
      warstwy pola `untapChoice`), `fingerprint.js` (`pendingUntapChoice`),
      `protocol/types.js`, oba boty, `render.js` / `session.js`.
      Pytania: czy Pass = odkręcenie wszystkiego (standard CR), czy decyzja
      stoi PRZED oknem priorytetu (CR 502.4), czy enumeracja jest kombinacją
      z capem 32 i porządkiem kanonicznym (L19/L151), czy oferta i walidacja
      czytają jeden predykat (L48), czy widok niesie to, czego bot potrzebuje
      (ADR 0017), czy nie ma przypadku po nazwie karty (ADR 0002), czy
      zdublowany klucz `pendingUntapChoice` w `createGameState` to tylko szum.
- [ ] B2 — **M431 / wycena keywordów aur** (`heuristic-bot.js`,
      `heuristic-params.js`, `test/audyt-m431-wycena-keywordow-aur.test.js`,
      fixture `bot-scoring-snapshot.json`). Czy wymiar jest ze świeżości grantu
      w widoku, nie z ciała gospodarza (L169), czy pokrętło nie jest atrapą
      (L5), czy zmiana fixture'a jest przypisana (L124), czy aggro-bot nie ma
      no-opowej gałęzi (L159).
- [ ] B3 — **M430 w tym samym squashu**: predykat „karta w grobie przeciwnika"
      (`zones.js` + `triggers.js`, F-2), kreator celów (`multi-target.js`, F-4),
      kombinacje zamiast permutacji (`spells.js`, F-5, CR 601.2c), cytat
      602.5d. Czy późniejsze commity (M431–M433) ich nie ruszyły i czy testy
      naprawdę czerwienieją po cofnięciu (nie tylko istnieją).
- [ ] B4 — **M432 / gest pressa** (`gestures.js`, `picker.js`, `main.js`).
      Czy wyspa `data-press-exempt` zamyka `pointerdown`, `pointerup` i `click`
      (także klawiatura `detail === 0`), czy nie wyłącza całej akcji przycisku,
      czy modal wyboru (bez pressa) został nietknięty, czy testy C1–C7 mierzą
      sekwencję zdarzeń a nie tekst CSS (L125/L170).
- [ ] B5 — **M432 / życie bufora „Rozgrywka"** (`session.js`:
      `consumeBotMoves`, `botMovesPaintedUpdate`, `PUBLIC_INFO_EVENTS`).
      Czy discover bota dochodzi do modala (CR 701.20 — informacja publiczna),
      czy nie wycieka strefa zakryta (ADR 0003), czy re-render nie zapętla się
      (pin w `table-ui`), czy konsumpcja zjada tylko pokazany prefiks.
- [ ] B6 — **M433 / odmiana** (`polish-plural.js`, re-eksport w `render.js`,
      `session.js`, `deck-builder.js`). Czy re-eksport wiąże nazwę lokalnie
      (L171), czy strażnik J skanuje sztywną formę `${…} kart` i czy zostały
      miejsca poza skanem, czy cykl importów nie wrócił (`module-graph`).
- [ ] B7 — **testy deklarują to, co mierzą** (RED→GREEN, L13). Próbka mutacji
      na co najmniej jednej gałęzi z każdej osi B1–B6, nie na wszystkich
      naraz. Mutacja przywracana zakresem, nie `replace()` na całym pliku
      (incydent 24f). Po mutacji `git diff` pusty poza zamierzonym.
- [ ] B8 — **E2 z planu 25a** jako oś audytu, nie jako „kiedyś": phasing
      (502.1), stun (122.1d) wobec `keepTappedIds`, zmiana kontrolera (400.3),
      odkręcenie efektem (nie podlega blokadzie kroku). Jeśli kod już to
      robi — pin. Jeśli kłamie wobec CR — naprawa u root cause w etapie C,
      nie wpis „świadoma granica" bez pomiaru (L105: „dziś to ryzyko" zamyka
      się skanem w tej samej sesji).

## Etap C — naprawy znalezisk (tylko to, co audyt pokaże)

- [ ] C1: każde znalezisko = test RED → naprawa u root cause (ADR 0002, L57:
      zgłoszenie ≠ reguła; tu źródłem jest CR, nie pamięć) → mutacja → commit
      osobno, push od razu.
- [ ] C2: drobiazgi złapane przy audycie (literówka cytatu, zdublowane pole,
      brak wpisu w dzienniku) idą w tej samej turze co odkrycie — nie pytam,
      czy naprawić (AGENTS.md, M433).
- [ ] C3: nowa lekcja tylko po skróceniu innego wpisu. Budżet lektury był na
      progu 100k po M433; progu nie podnoszę. Klasa już opisana (L48, L95,
      L169, L170, L171) nie dostaje nowego numeru.

## Etap D — pętla jakości (ADR 0021 §4), inną ścieżką niż 24f/25a

Poprzednie sesje mierzyły: batch 59 (seed 78, kreator celów), theros+Lyra
(seedy 77–82, oferta odkręcania), innistrad-brg vs ixalan seed 43 (discover).
Ta sesja nie powtarza tych seedów jako „dowodu czystości".

- [ ] D1: Żywy Tester na parach talii, których 25a/b nie czytały ręcznie
      (oś: bezsensowne działania bota, kompletność logu i „Ruchu przeciwnika",
      ptaszki auto-pass — `TESTER_STOLU.md`). Braki testera naprawiam w
      testerze (L12). Rebuild `dist/` przed pomiarem (L76). Talia chwilowa
      poza repo albo usunięta przed bramą.
- [ ] D2: łowy CR ścieżką „krok odkręcania i efekty ciągłe blokady", nie
      ścieżką numerów 702 (to robiła 24b/24f). Cytat dosłowny w pinie.
- [ ] D3: zero zgłoszeń detektorów czytam jako dolną granicę i czytam
      transkrypt ręcznie (L27). Klasa znaleziona ręcznie kończy się detektorem,
      jeśli da się ją skodyfikować bez fałszywych alarmów (L12).

## Etap E — domknięcie (ADR 0013)

- [ ] E1: bramy na gotowym drzewie: `npm test`, `npm run build`, przy zmianie
      silnika/wyceny także `npm run test:all` i szybki `node tools/benchmark.mjs`
      (672 mecze). Pełnego B0 nie odpalam. Progu regresji nie ruszam bez pełnej
      macierzy (ADR 0018).
- [ ] E2: raport `docs/audits/AUDYT_PR137_2026-09-25d.md`, wpis w
      `PROJECT_HISTORY` + `ENGINE_MILESTONES` (dopiero gdy jest co zapisać),
      handoff `docs/setup/HANDOFF_2026-09-25d.md`, opis PR kumulatywnie.
      Liczby „bieżącego stanu" mierzone na końcu (L92).
- [ ] E3: blok przekazania w czacie. Scalenie = decyzja właściciela.

## Ryzyka i pułapki

- **Klon płytki** — przed diffnem `git fetch --depth=3 origin main` (zrobione:
  rodzic `0b2f771` jest lokalnie). `git show HEAD` bez rodzica kłamie całym
  drzewem.
- **`GH_TOKEN` wygasa w trakcie** (24f, ENVIRONMENT §3) — push po każdym
  zielonym commicie; odrzucony push = fetch i porównanie, nigdy `--force`
  (ADR 0020 D).
- **Reset sandboxa** (ENVIRONMENT §2) — przed `reset --hard` sprawdzić, czy
  drzewo nie niesie niecommitowanej tury. Nieśledzony plik w `decks/` czerwieni
  strażniki talii.
- **Mutacja `replace()` na całym pliku** przywraca wzorzec w sąsiednich
  funkcjach; `npm test` tego nie widzi, gdy plik jest w manifeście `slow`.
  Restauracja zakresem + `git diff`.
- **Polskie znaki:** `edit_file` psuje typografię; pliki z „ą/„" edytuję
  `python3` i liczę trafienia przed podmianą (L159).
- **Tester mierzy `dist/`** — bez `npm run build` mierzę stary kod (L76).
- **Nowa decyzja ma ~10 bramek** (L95) i 7 mutacji (L48 pkt 8). Zielony test
  „szczęśliwej ścieżki" nie zamyka audytu.
- **Zmiana wyceny** rusza golden-master (L124). Jeśli audyt nie rusza wag,
  fixture zostaje.

## Commity (planowane, każdy zielony i pushowany osobno)

1. ten plan (A1) — przed kodowaniem.
2. raport audytu (B), nawet jeśli werdykt to „bez napraw" — zanim C.
3. każda naprawa osobno (C).
4. pętla jakości: detektor / pin / naprawa osobno (D).
5. domknięcie: dziennik + handoff (E), wolno dołączyć do ostatniego commitu
   funkcjonalnego, jeśli testy nadal zielone (ADR 0020 C).
