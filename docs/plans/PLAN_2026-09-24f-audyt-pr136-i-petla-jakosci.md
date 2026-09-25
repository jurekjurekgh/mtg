# Plan sesji 2026-09-24f — audyt scalonego PR #136 + pętla jakości (ADR 0020 B / ADR 0021)

**Gałąź:** `arena/01a0d532-mtg` · **Baza:** `main` = `0b2f771` (squash PR #136)
**Zlecenie:** „Kontynuujemy projekt." — prompt nie nazywa tematu, więc obowiązuje
pętla domyślna ADR 0021: PR na starcie → audyt poprzedniego scalonego PR →
nieodhaczone pozycje planów → pętla jakości (Żywy Tester + łowy CR).
**Bez nowego batcha kart** (ADR 0021 §4c, ADR 0029) i **bez pełnego B0**
(ADR 0018 — wyłącznie na wyraźną komendę właściciela).

## Etap 0 — rozpoznanie (wykonane przed tym plikiem)

- [x] Lektura obowiązkowa AGENTS.md §0, całość, do ostatniej linii:
      `AGENTS.md` (369 linii), **wszystkie** ADR-y 0001–0030 + README rejestru
      (0008 w archiwum), `docs/LESSONS.md` (2568 linii, **L1–L169** — czytana
      zakresami 1–700 / 700–1400 / 1400–2100 / 2100–2568),
      `docs/setup/ENVIRONMENT.md` (190 linii), najnowszy handoff
      `docs/setup/HANDOFF_2026-09-24e.md`.
- [x] `npm test` na `main` (`0b2f771`): **6534/6534**, 0 fail, 214 s — zgodne
      z handoffem 24e („6534/6534, 24d: 6519 → +15 testów M429").
- [x] `npm run build`: **60 modułów / 4254,4 kB** — zgodne z handoffem 24e.
- [x] `gh pr list`: **brak otwartych PR**; ostatni scalony to **#136**
      (96 plików, +6318/−239, `mergedAt` 2026-09-24T20:54:06Z, head
      `arena/01a0d408-mtg`) — cel audytu (ADR 0020 B). Sesje w PR: 24b (audyt
      #135 + naprawy F-1/F-2/F-3), 24c (batch 59, 10 kart), 24d (Żywy Tester →
      M428, kwota alt-kosztu), 24e (M429, taktyczna wycena 3 rodzin).
- [x] Katalog: **562** wpisy rejestru, **509** `supported`, **1** z niepustym
      `limitations` (Jyoti, Moag Ancient) — pomiar `createCardRegistry()`.
- [x] Plany z nieodhaczonymi pozycjami: wyłącznie
      `PLAN_2026-09-10-audyt-pr111-petla-jakosci.md` (E5/E6) — sesja zamknięta
      handoffem `2026-09-10b`, a pętle jakości E5/E6 wykonywały kolejne sesje
      (m.in. 24b D1, 24d). Pozycje są więc zastąpione, nie otwarte; sprawdzam
      to w B0 i odnotowuję w raporcie zamiast wskrzeszać plan sprzed 14 dni.

## Etap A — PR na starcie (ADR 0020 A)

- [x] A1: ten plan jako OSOBNY commit wypchnięty na gałąź sesji.
- [x] A2: `gh pr create` (base `main`) — opis z szablonem: zakres audytu,
      bramy, znaleziska; uzupełniany kumulatywnie.

## Etap B — audyt PR #136 (ADR 0020 B / ADR 0016): 96 plików, 8 osi

Metoda: diff `f9bc44b..0b2f771` czytany PLIK PO PLIKU (silnik i dane najpierw),
każde twierdzenie regułowe weryfikowane wobec dosłownego CR/Oracle (ADR 0030 —
pamięć treningowa nie jest źródłem), każde „przypięte testem" sprawdzone
mutacją w kierunku PRZED naprawą (L13/L34/L159), każde „0 zgłoszeń" traktowane
jako pomiar narzędzia (L27).

- [x] B0 — rozpoznanie stanu: czy PR #136 nie zostawił pozycji otwartych
      (plany 24b–24e odhaczone do końca; ryzyka 1–5 z handoffu 24e: co z nich
      jest długiem, a co świadomą granicą).
- [x] B1 — **warstwa adresowania CR z sesji 24b** (F-1: 16 martwych numerów /
      55 wystąpień w 30 plikach; F-2: 3 rozjazdy pary „mechanika ↔ numer";
      F-3: strażnik istnienia — `tools/cr-numery.mjs`,
      `test/helpers/cr-numery-tabela.js`, `test/cr-numery-istnienie-straznik.test.js`).
      Czy tabela 482 numerów odpowiada dosłownemu CR 2026-09-25 (L164: lustro
      bywa o wydanie do tyłu), czy strażnik mierzy REGUŁĘ, nie tekst źródła
      (L5), i czy dowody RED są prawdziwe (mutacja w kierunku PRZED naprawą).
- [x] B2 — **batch 59 (10 kart)** wobec snapshotów Scryfall w repo: dosłowny
      Oracle text, koszt druku, typy/podtypy, P/T, słowa-klucze, koszty
      alternatywne (flashback {G} i {3}{G}{W}, cycling {2}, {4}{W}, {2}{R}),
      tokeny (Human 1/1, Mutagen), DFC `bird-admirer`/`wing-shredder`,
      `limitations`/`notes` (ADR 0022), proweniencja (ADR 0029: nowe wiersze
      `tools/collection-art-ids.csv`, strażnik `proweniencja-katalogu`),
      talie z generatora (ADR 0023/0024).
- [x] B3 — **silnik** (`spells.js` +255/−72, `effects.js`, `zones.js` +63,
      `tokens.js`, `permanents.js`, `triggers.js`, `game-state.js` −40/+19,
      `objects.js`, `identity.js`, `fingerprint.js`, `resources.js`,
      `mana-sources.js`, `abilities.js`, `combat.js`, `effect-intent.js`):
      generyczność (ADR 0002 — zero przypadków po nazwie/ID karty), zgodność
      z CR (ADR 0030), brak regresji, determinizm i nowe pola w odcisku
      (ADR 0005).
- [x] B4 — **M429 (taktyczna wycena, L169)**: trzy rodziny (`add_counter` na
      celu, `shuffle_graveyard_cards_into_library`, `buff_creatures_you_control`
      z AKTYWOWANEJ zdolności) — czy wymiar różnicowania jest czytany
      z `PlayerView` (ADR 0017, nie zgadywanie w bocie), czy stałe są pod
      nazwami + deskryptory tunera (`counter`, `graveyardShuffle`, `teamPump`),
      czy kalibracja T0 trzyma (gospodarz 1/1 = dawna stała), czy golden-master
      `bot-scoring-snapshot` zielenieje BEZ regeneracji, i czy pin dowodzi, że
      „pokrętło nie jest atrapą" (L5 pkt 6, L169 §6).
- [x] B5 — **M428 (kwota alt-kosztu, L168)**: Join the Dance `flashback
      {3}{G}{W}` i Boulder Salvo `surge {1}{R}` — czy `cost` = SUMA symboli
      w całej rodzinie alt-kosztów, czy skan Oracle↔definicja porównuje CAŁY
      napis (nie tylko pipy), czy etykieta ma jedno źródło składanki
      (`costSymbols`).
- [x] B6 — **warstwy prezentacji i protokołu** (`render.js` +81/−10,
      `session.js`, `protocol/types.js`): etykiety, FoW (ADR 0003/0017),
      kompletność informacji jawnych, brak globali Node w kodzie artefaktu
      (L58).
- [x] B7 — **testy** (`real-cards-batch59.test.js` 958 linii,
      `audyt-m428-kwota-alt-kosztu.test.js` 214, `audyt-m429-…` 331,
      `cr-numery-istnienie-straznik.test.js`, zmiany w ~35 istniejących
      plikach testów): RED→GREEN przez mutację, anty-over-fix, brak pinów
      utrwalających błędną regułę (L13 §6), strażniki klasowe (L5/L39),
      a przy zmianach w istniejących testach — czy zmieniono OCZEKIWANIE
      dlatego, że reguła była błędna (i z cytatem CR), nie żeby zazielenić.
- [x] B8 — **werdykt** + znaleziska F-n w `docs/audits/AUDYT_PR136_2026-09-24f.md`
      (pokrycie plików, matryca mutacji, cytaty CR z datą pobrania, jawny
      werdykt APPROVE / APPROVE z zastrzeżeniami / REQUEST CHANGES).

Bramy audytu: `npm test` + `node --test test/bot-benchmark.test.js`
(**bez pełnego B0**, ADR 0018).

## Etap C — naprawy znalezisk audytu (osobne, zielone commity)

- [x] C-n: dla każdego znaleziska — test RED → naprawa u root cause → mutacja
      dowodząca, że pin czerwienieje → `npm test` + `npm run build` → push.
      **Wykonane dla pięciu znalezisk** (raport §3 i §9): F-2 `981a6ed`
      (RED 3/5 na starym kodzie, po naprawie 6539/6539), F-1 `a97e7ee`
      (mutacja przywracająca stary adres = 1/32 RED w strażniku numerów),
      F-3 `1d8690a` (piny przepisane na pomiar 14/22/26), F-4+F-5 `3ecdbb8`
      (5 testów, mutacje: 1/5 i 4 RED). F-5 wymagał korekty dwóch pinów, które
      same liczyły permutacje — zapisane w raporcie, żeby nie wyglądało to na
      obejście.

Zasada (ADR 0020 C/D): każdy samodzielnie zielony krok to OSOBNY commit i push;
zakaz force push; przed pushem `git fetch` + porównanie `HEAD..FETCH_HEAD`
i `FETCH_HEAD..HEAD`.

## Etap D — pętla jakości (ADR 0021 §4)

- [x] D1 — **Żywy Tester** (`tools/table-tester/`): audyt z perspektywy gracza
      wzdłuż trzech osi (bezsensowne działania bota, kompletność logu/modala,
      ptaszki auto-passu), z naciskiem na karty batcha 59 i wyceny M429
      (mutant na najlepszym ciele, Memory's Journey tylko przy presji deck-outu,
      Vanguard tylko w oknie walki). `npm run build` PRZED pomiarem (L76),
      braki naprawiane W TESTERZE (L12). **Wynik:** 4 partie (seedy 77–80);
      seed 78 przerwał się na martwej pętli kreatora celów i to jest źródło
      F-4/F-5 — pętla zadziałała dokładnie tak, jak powinna. Po naprawie partie
      78 i 77 dokończone, 0 zgłoszeń detektorów, 0 ruchów niewycenionych,
      transkrypt przeczytany ręcznie wzdłuż osi (L27). Chwilowa talia audytowa
      usunięta z `decks/` + rebuild (patrz raport §9.3).
- [x] D2 — **łowy CR inną ścieżką niż poprzednia sesja**: poprzednie sesje
      szły po numerach (701/702/tabela istnienia) — teraz ścieżka SEMANTYCZNA:
      tezy regułowe w komentarzach `src/` wobec dosłownego CR (nie numer, a
      sens), szczególnie w nowych kodach batcha 59 i M428/M429. **Wynik:** trzy
      znalezione tezy-pomyłki to F-1 (adres reguły), F-3 (liczby w komentarzu) i
      F-5 (601.2c wyliczony z dosłownego zdania, nie z tabeli numerów) — ścieżka
      semantyczna okazała się skuteczniejsza niż chodzenie po tabelach numerów;
      trzy odrzucone hipotezy (K-1…K-3) zapisane z kontr-pomiarem w raporcie §4,
      żeby nie wracały do kolejnych sesji.
- [x] D3 — **sondy własne**: piny na warstwy/kontrakty, które audyt uzna za
      niepilnowane. **Zrobione w granicach sesji:** zamiast sond „na wszelki
      wypadek" pinami skończyły tam, gdzie audyt znalazł realną dziurę —
      `test/audyt-pr136-kopia-w-grobie-jest-karta.test.js` (5 testów: status
      karty w grobie, pula triggera, bliźniak Puppeteer) i
      `test/audyt-pr136-kreator-up-to-three.test.js` (5 testów: cztery warstwy
      wektora celów). `exiledBy` i FoW zakrytej strony DFC zostały bez zmian —
      ich pokrycie istniało już w `real-cards-batch59` (przegląd B7), a dodanie
      pinu bez znalezionej dziury byłoby szumem w manifeście. 
- [x] D4 — pozycje otwarte z handoffów 24b–24e (ryzyka 1–5 z 24e): co da się
      domknąć bez decyzji właściciela, co zostaje z adnotacją. **Domknięte:**
      ryzyka 1–5 z 24e pozostają **świadomymi granicami** z adnotacją w raporcie
      §6/§8 i handoffie: ewazja liczona poza wartością gospodarza aury, rzut
      czarem na skazanym gospodarzu, progi regresji bota i pełne B0 — dwie
      ostatnie wymagają decyzji właściciela (ADR 0018), nie pracy agenta.

## Etap E — domknięcie sesji (ADR 0013)

- [x] E1 — bramy na koniec: `npm test`, `npm run test:all`, `npm run build`,
      `node --test test/bot-benchmark.test.js`; przy zmianach bota także
      szybki profil `node tools/benchmark.mjs` (672 mecze) i ewaluacja
      lustrzana, jeśli wyceny się ruszą.
- [x] E2 — `docs/PROJECT_HISTORY.md` + `docs/ENGINE_MILESTONES.md` (kolejny
      numer M), `docs/setup/HANDOFF_2026-09-24f.md`, plan odhaczony
      + podsumowanie wykonania, README tylko jeśli liczby „bieżącego stanu"
      się zmieniają (L92: liczby odświeżamy na KONIEC i mierzymy). **Zmierzone:**
      `npm test` 6545/6545, `npm run test:all` 6555/6555, build 60 modułów /
      4257,9 kB, `bot-benchmark` 10/10, szybka macierz 78,3 % / 97,9 % (bez
      regresji), katalog 562/509/1. Wpisy M430 w obu dziennikach, lekcji
      świadomie brak (budżet lektury ~99,9k/100k, a klasy noszą już
      L41/L129/L135/L151/L163), handoff `docs/setup/HANDOFF_2026-09-24f.md`.
- [x] E3 — checklista końca sesji (ENVIRONMENT §7) zrobiona; **opis PR #137
      wymagał odświeżenia autha GitHuba** — `GH_TOKEN` wygasł w trakcie sesji i
      `git push`/`gh pr edit` były odrzucane. Treść opisu (kumulatywna: §3, §9,
      werdykt + bramy + tabela szybkiej próbki bota) jest w raporcie, wciśnięcie
      jej na PR to jedna operacja `gh api -X PATCH` po reconnectcie. Uwaga z
      realizacji: sandbox zresetował workspace w trakcie Etapu E — lokalne `HEAD`
      wróciło na bazę, praca przeżyła w drzewie roboczym i na zdalnym refie;
      przebieg rekonstrukcji w raporcie §9.7. Ryzyko „push po każdym zielonym
      kroku" z tego planu potwierdzone praktycznie.

## Ryzyka i pułapki (z lektur)

- **„Zero zgłoszeń" to pomiar narzędzia** (L27) — po audycie Żywym Testerem
  czytam transkrypt RĘCZNIE wzdłuż osi, a każda klasa znaleziona ręcznie
  kończy się nowym detektorem; weryfikacja dwustronna detektora obowiązkowa.
- **Mutacja, która nie zaszła, kłamie tak samo jak ta, która zaszła w no-op**
  (L159) — mutuję dokładny blok i sprawdzam `git diff`; zielona mutacja =
  pytanie, czy droga była w ogóle wykonywana.
- **Remis wariantów to brak WYMIARU** (L169) — przy wycenach sprawdzam, czy
  wymiar jest w `PlayerView`, nie dokładam wagi „na oko".
- **Kwota alt-kosztu to SUMA symboli** (L168) — przy każdym koszcie
  alternatywnym porównuję CAŁY napis z Oracle.
- **Katalog rośnie tylko z listy właściciela** (ADR 0029) — w tej sesji nie
  dodaję żadnej karty; brak nośnika mechaniki = karta syntetyczna w teście.
- **Sandbox potrafi zresetować workspace** (ENVIRONMENT §2) — commit i push po
  każdym zielonym kroku; `git checkout <plik>` kasuje niezacommitowaną pracę
  (L136) — mutacje testowe na kopiach; plik klonu jest płytki (`git fetch
  --depth=200` przed diffem historycznym).
- **Żywy Tester mierzy `dist/`, nie `src/`** (L76) — przebudować przed audytem.
