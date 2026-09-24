# Plan sesji 2026-09-24b — audyt scalonego PR #135 + pętla jakości (ADR 0020 B / ADR 0021)

**Gałąź:** `arena/01a0d408-mtg` · **Baza:** `main` = `f9bc44b` (squash PR #135)
**Zlecenie:** „Kontynuujemy projekt." — prompt nie nazywa tematu, więc obowiązuje
pętla domyślna ADR 0021: PR na starcie → audyt poprzedniego scalonego PR →
nieodhaczone pozycje planów → pętla jakości (Żywy Tester + łowy CR).
**Bez nowego batcha kart** (ADR 0021 §4c, ADR 0029 — katalog to kolekcja
właściciela) i **bez pełnego B0** (ADR 0018).

## Etap 0 — rozpoznanie (wykonane przed tym plikiem)

- [x] Lektura obowiązkowa AGENTS.md §0: `AGENTS.md` (369 linii), **wszystkie**
      ADR-y 0001–0030 + README rejestru (0008 w archiwum), `docs/LESSONS.md`
      (2490 linii, L1–L167 — całość, czytana zakresami `sed -n`), `docs/setup/ENVIRONMENT.md`.
- [x] `npm test` na `main` (`f9bc44b`): **6455/6455**, 0 fail, ~227 s —
      zgodne z opisem PR #135 (M425).
- [x] `npm run build`: **60 modułów / 4199,5 kB** — zgodne z opisem PR #135.
- [x] `gh pr list`: ostatni scalony PR to **#135** (227 plików, +8645/−1850,
      merged 2026-09-24T15:28:21Z) — cel audytu (ADR 0020 B).
- [x] Najnowszy handoff: `docs/setup/HANDOFF_2026-09-24.md` (stan po D3, D4b,
      Etapie F i M425).

## Etap A — PR na starcie (ADR 0020 A)

- [ ] A1: ten plan jako OSOBNY commit wypchnięty na gałąź sesji.
- [ ] A2: `gh pr create` → PR tej sesji (base `main`), opis z szablonem:
      zakres audytu, bramy, znaleziska (uzupełniany kumulatywnie).

## Etap B — audyt PR #135 (ADR 0020 B / ADR 0016): 227 plików, 6 osi

Metoda: diff `4f75e22..f9bc44b` czytany PLIK PO PLIKU (silnik najpierw), każde
twierdzenie regułowe weryfikowane wobec dosłownego CR/Oracle (ADR 0030 —
pamięć treningowa nie jest źródłem), każde „przypięte testem" sprawdzone
mutacją w kierunku PRZED naprawą (L13/L34/L159).

- [ ] B1 — **D4b / warstwy CR 613** (największa nowość: `src/engine/timestamps.js`
      + `permanents.effectiveKeywords`/`baseStat`/`animationFieldsAfter`): czy
      każda ścieżka nadania/utraty ma znacznik, czy `timestamp` ustawia KAŻDA
      droga wejścia na pole bitwy (L107/L21), czy W-1…W-11 zgadzają się
      z dosłownym CR 613.4/613.7/613.9/708.2/712.18/400.7.
- [ ] B2 — **Etap F (F/1–F/5)**: zdolności słów-kluczy na stosie (backup, echo,
      suspend, rebound, exploit, endure — CR 603.3/603.4/608.2b), „may"/„unless"
      przy rozstrzyganiu (603.5/603.12), jedna ścieżka rzutu bez kosztu many
      (118.9, 107.3b, 601.2f/h), animacje jako osobne efekty (611.2).
- [ ] B3 — **pętla jakości z poprzedniej sesji (Z-1, O-1, O-2, O-3, O-6, F-1..F-7,
      M425 — 553 przenumerowania w 701)** — czy naprawy są u root cause i czy
      nie wprowadziły regresji; próbka numerów CR sprawdzona wobec bieżącego
      wydania (L164: masowe przenumerowanie bywa o wydanie do tyłu).
- [ ] B4 — **heurystyki bota + warstwa stołu**: nowe pola widoku (`manaSource`),
      wyceny po typie efektu (ADR 0002), FoW (ADR 0003/0017) i determinizm
      (ADR 0005: nowe pola w odcisku).
- [ ] B5 — **dane i statusy**: `src/cards/card-data.js` (±175 linii) wobec
      snapshotów Scryfall i `limitations`/`notes` (ADR 0022), talie z generatora.
- [ ] B6 — **testy**: RED→GREEN dla nowych pinów (mutacje), anty-over-fix, brak
      pinów utrwalających błędną regułę (L13 §6), strażniki klasowe (L5/L39).
- [ ] B7 — **werdykt** + znaleziska F-n w `docs/audits/AUDYT_PR135_2026-09-24b.md`
      (pokrycie plików, matryca mutacji, cytaty CR z datą pobrania).

Kryterium ukończenia: raport w `docs/audits/` z jawnym werdyktem
(APPROVE / APPROVE z zastrzeżeniami / REQUEST CHANGES), bramy odtworzone
(`npm test` + `node --test test/bot-benchmark.test.js`; **bez pełnego B0**),
każde znalezisko z repro i propozycją naprawy u root cause.

## Etap C — naprawy znalezisk audytu (osobne, zielone commity)

- [ ] C1..Cn — po jednym commicie na znalezisko: test RED → naprawa u root cause
      → mutacja dowodząca, że pin czerwienieje → `npm test` + `npm run build` → push.

Zasada (ADR 0020 C/D): każdy samodzielnie zielony krok to OSOBNY commit i push;
zakaz force push; przed pushem `git fetch` + porównanie `HEAD..FETCH_HEAD`
i `FETCH_HEAD..HEAD`.

## Etap D — pętla jakości (ADR 0021 §4)

- [ ] D1 — **Żywy Tester** (`tools/table-tester/`): audyt z perspektywy gracza
      wzdłuż trzech osi (bezsensowne działania bota, kompletność logu/modala,
      ptaszki auto-passu), z naciskiem na mechaniki nowe w PR #135 (rzut bez
      kosztu many, zdolności-klucze na stosie, animacje, crew/pojazdy).
      Braki testera naprawiane W TESTERZE (L12).
- [ ] D2 — **łowy CR inną ścieżką niż poprzednia sesja**: weryfikacja liczb
      i tez regułowych, których poprzednia sesja nie tknęła (sekcje poza 701/702
      i „do weryfikacji u źródła" z §7 audytu PR #134).
- [ ] D3 — **sondy własne na warstwy i znaczniki** (pary efektów na prawdziwych
      kartach, kolejność 613.7, przejście przez zmianę strefy) — nowe piny.
- [ ] D4 — pozycje otwarte planu poprzedniej sesji (O-4/O-5 = karty spoza
      katalogu: bez zmian, dopóki karta nie wejdzie).

## Etap E — domknięcie sesji (ADR 0013)

- [ ] E1 — pomiar bram na koniec (`npm test`, `npm run build`,
      `node --test test/bot-benchmark.test.js`).
- [ ] E2 — `docs/PROJECT_HISTORY.md` + `docs/setup/HANDOFF_2026-09-24b.md`,
      aktualizacja `README.md` i planu (podsumowanie wykonania).
- [ ] E3 — opis PR zaktualizowany kumulatywnie + blok przekazania w czacie.

## Ryzyka i pułapki (z lektur)

- **Masowe przenumerowanie CR bywa o wydanie do tyłu** (L164) — każdy numer
  potwierdzany osobno w BIEŻĄCYM wydaniu, nie arytmetycznie.
- **Strażnik liniowy nie łapie rozjazdu o linię obok** (L165) — detektory par
  „mechanika ↔ numer" muszą mieć okno.
- **Nowe pole efektu „do końca tury" wymaga trzech miejsc** (L166): ustawienie
  ze znacznikiem, cleanup, reset w `moveObjectDirectly` (CR 400.7).
- **Warstwa stanu scalona gubi czas trwania pojedynczych efektów** (L167).
- **Sandbox potrafi zresetować workspace** (ENVIRONMENT §2) — commit i push po
  każdym zielonym kroku; `git checkout <plik>` kasuje niezacommitowaną pracę
  (L136) — mutacje testowe robić na kopiach.
- **Żywy Tester mierzy `dist/`, nie `src/`** (L76) — po każdej zmianie w `src/`
  przebudować przed audytem.
