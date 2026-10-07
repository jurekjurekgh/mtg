# PLAN 2026-10-07b — Audyt PR #157 + pętla jakości

> Sesja: gałąź `arena/6b9bb8b8-mtg`, tryb ADR 0020 (PR → audyt poprzedniego
> PR → inkrementalne commity), pętla domyślna ADR 0021 (prompt
> „Kontynuujemy projekt", bez nazwanego tematu).

## Rozpoznanie (wykonane)

- Lektura obowiązkowa kompletna: AGENTS.md (382/382 linii), wszystkie ADR-y
  (README + 0001–0030, każdy do końca), LESSONS.md (L1–L180, 2437/2437 linii),
  ENVIRONMENT.md (§1–§7).
- Bazowy stan `main` = `1222754` (squash PR #157, zmergowany 2026-10-07
  17:03 UTC). Zmierzone na starcie tego drzewa:
  `npm test` **7775/7775** EXIT 0 (116,5 s), `npm run build` **72 moduły /
  4902,2 kB** EXIT 0 — zgodnie z handoffem `HANDOFF_2026-10-07.md`
  (suplement: fast 7775 po fixie D1-mirror).
- Poprzedni scalony PR: **#157** (19 plików, +1278/−56, 15 commitów
  presquash). Uwaga weryfikacyjna: commit `81e5fa4` (suplement handoffu)
  nie istnieje jako obiekt — jego treść (fix D1-mirror + test
  `zgloszenie-d1-mirror-bot-blok-aura-odbijajaca.test.js`) jest W squashie
  1222754, czyli praca nie zaginęła; sam hash zniknął przy squashu.

## Etapy i kryteria ukończenia

- [x] E0. Lektura obowiązkowa + baseline (fast 7775/7775, build 72/4902,2 kB).
- [x] E1. Ten plan wypchnięty jako osobny commit + PR sesji otwarty PRZED
  kodem (ADR 0020 A).
- [ ] E2. **Audyt PR #157** (19 plików) — przegląd KAŻDEGO zmienionego pliku
  pod kątem logiki i sensowności zmiany (ADR 0020 B / ADR 0016):
  - engine: `src/engine/game-state.js` (+30/−51), `effects.js` (+4/−1),
    `resources.js` (+7/−1), `triggers.js` (+24) — zgłoszenie D (Pain for All:
    CR 603.10 looks-back aury, LKI ze zdarzenia odejścia z `attachedTo`,
    CR 608.2h — korekta audytu: 608.2g to mana/rzuty podczas resolution);
  - kontrolery: `heuristic-bot.js` (+50/−1), `heuristic-params.js` (+14) —
    zgłoszenie D1 (koszt odbicia przez drabinę `selfLifeLossPenalty`,
    progi `reflectedDamageLifeRatio: 0.25` / `reflectedDamageDeterrent: 25`)
    + D1-mirror (`declare_blockers`);
  - `src/table/session.js` (+13/−2) — warstwa logu/narracji;
  - 8 plików testowych (4 nowe + 4 zmienione) — czy testują to, co deklarują
    (RED→GREEN, L13): wyrywkowa weryfikacja mutacyjna co najmniej jednego
    pinu na rodzinę (D, D1, D1M);
  - zgodność z CR wg ADR 0030 (cytaty dosłowne ze źródeł online przez
    `fetch_page`; gdy źródło niedostępne — adnotacja „do weryfikacji u
    źródła", bez zmian regułowych), generyczność (ADR 0002), kompletność
    widoku (ADR 0017), FoW.
  - Kryterium: `docs/audits/AUDYT_PR157_2026-10-07.md` z werdyktem i listą
    znalezisk, każde z dowodem (mutacja lub pomiar).
- [ ] E3. **Pętla jakości** (ADR 0021 §4), dopóki właściciel nie wskaze
  inaczej:
  - (a) audyt Żywym Testerem z perspektywy gracza (osie: bezsensowne akcje
    bota, kompletność logu/modalu, ptaszki auto-pass) + naprawy u root cause
    + nowe detektory; talie nastawne na batch 63 / the-edge (Pain for All)
    zgodnie z rekomendacją handoffu;
  - (b) polowanie na niezgodności z CR innymi ścieżkami niż poprzednia sesja
    (strażniki `cr-numery.mjs`, `event-contract-audit.mjs`);
  - bez nowych kart (ADR 0029), bez pełnego B0 (ADR 0018); szybka próbka
    benchmarku tylko gdy zmieniony jest bot.
- [x] E4. Domknięcie: końcowa brama `npm run test:all` na zamrożonym drzewie
  (L174) = **8048/8048** EXIT 0 (474,9 s), build 72 moduły / 4904,0 kB EXIT 0,
  handoff `docs/setup/HANDOFF_2026-10-07b.md`, wpis PROJECT_HISTORY,
  kumulatywny opis PR #158. Otwarta pozostaje JEDNA pozycja pętli jakości:
  **E3(a) — audyt Żywym Testerem** (rekomendacja: tali the-edge, seedy na
  regenerację; wymaga `npm i` w `tools/table-tester` + `npm run build`).

## Zgłoszenie E właściciela (2026-10-07): regeneracja jednorazowo

Skarga: bot aktywował `{1}{B}: Regenerate this creature` (Exterminator
Magmarch 5/3) TRZY RAZY w jednej walce z Ballista Watcher 4/3, wypalając całą
dostępną manę. Mechanizm (odkryty przy reprodukcji): w `session.js` bot
dostaje priorytet, a aktywacja go NIE oddaje — stół pyta go ponownie, gdy
pierwsza tarcza wisi jeszcze NA STOSIE (puste `view.regenerationShields`),
więc każda kolejna aktywacja wyglądała na pierwszą (+60 urgent, M218/4).
Reguła (CR 701.19a, dosłownie): „creates a replacement effect that protects
the permanent **the next time** it would be destroyed this turn" — kopia na
stosie nic nie zmienia dla tego zniszczenia.

- [x] Test reprodukujący `test/zgloszenie-e-regeneracja-jednorazowo.test.js`
  (piny E/1–E/5). BEZ fixa: E/5 (tarcza na stosie) i E/4 (pełny przepływ w
  architekturze session.js) są RED — E/4 pokazuje `aktywacje=3`, dokładnie jak
  log właściciela. Z fixem: 5/5 GREEN.
- [x] Fix w `src/controllers/heuristic-bot.js` (guard E, wzorzec M179/M219/
  M230): tarcza regeneracji JUŻ na celu (`view.regenerationShields`) LUB
  identyczna regeneracja wisi na stosie → `finish(-30)`. Cytat CR 701.19a ze
  źródła online (ADR 0030). Bez nazw kart (ADR 0002), wyłącznie PlayerView
  (ADR 0017).
- [x] Bramka fast po fixie: 7784/7784 (było 7775 przed sesją).
- [x] Cenzus cytatów (E3/b, znalezisko L164): komentarz przy M218/4 cytuje
  „CR 702.14" jako numer regeneracji — 702.14 to Landwalk, poprawne 701.19
  (commit `7033da4`).
- [x] Cenzus horyzontalny (skrypt `.arena/cenzus-cr.mjs`, źródła: mtg.wiki
  `Keyword_ability` 702.1–702.195 + `Keyword_action` 701.1–701.71, CR
  2026-09-25): 210 różnych numerów 701/702 w repo, po recznym przeględzie
  wszystkich trafień **0 nowych rozjazdów** — jedyny był ten naprawiony.
- [x] Utwardzenie strażników (żeby klasa nie wróciła): para
  „regener ↔ 702.14" w `cr-numery-mechanik-straznik.test.js` + **naprawa
  aliasu Landwalk** (`'walk'` → `'walk\b'`) — polskie „walka" (combat)
  dopasowywało się pod alias i wygaszało detektor okna. Dowód RED: powrót
  starego cytatu świeci na `heuristic-bot.js:3135` (ta sama linia, co
  oryginalny bug).
- [ ] Świadoma granica (pin E/3): druga tarcza przy DWÓCH niezależnych
  groźbach niszczenia w tej turze nie jest wartościowana (kryterium
  właściciela: „tylko gdy tarcza jeszcze nie ma"). Wycena zachowawcza —
  bot nie marnuje many, ale rezygnuje z teoretycznie poprawnej drugiej
  tarczy; zmiana wymaga osobnej decyzji.

## Ryzyka i pułapki

- Reset workspace w trakcie sesji (ENVIRONMENT §2): commit + push po każdym
  samodzielnie zielonym kroku, `git log --oneline -1` po każdym commicie.
- Zalewanie wyjścia testów (ENVIRONMENT §5a): logi do `.arena/*.log`
  (wyłączone z gita przez `.git/info/exclude`), tylko podsumowanie do czatu.
- Żywy Tester mierzy `dist/`, nie `src/` (L76): po zmianie w `src/` najpierw
  `npm run build`; pierwsze użycie wymaga `npm i` w `tools/table-tester`.
- `gh pr view/edit` pada na GraphQL Projects (classic) — obchodzę przez
  `gh api` (ENVIRONMENT §3).
- Polskie znaki: edycje plików z polskim tekstem przez `python3`
  (ENVIRONMENT §4).
- `git checkout <plik>` kasuje niezacommitowane zmiany (L136): przed
  checkout/restore sprawdzić `git diff --stat -- <plik>`.
