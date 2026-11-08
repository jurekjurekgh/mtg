# Plan 2026-11-08b — audyt PR #182 i pętla jakości (ADR 0020/0021)

Sesja `arena/dbe29e6d-mtg`. Wejście: „Kontynuujemy projekt" bez nazwanego
tematu → pętla domyślna ADR 0021 (PR → audyt poprzedniego scalonego PR →
niedokończony plan → pętla jakości). Bez nowych kart (ADR 0029), bez
pełnego B0 (ADR 0018), bez scalania i force push.

## Rozpoznanie (main = `12aac62`, squash #182)

- Poprzedni scalony PR #182: **17 plików, +994/−68, 3 commity** (REST
  `pulls/182/files`; inwentarz z REST, nie z parsera diffu — L190).
  Zmiany funkcjonalne: ZERO (komentarze CR + 2 nowe pliki testów +
  tabela CR + dokumenty). Kandydat do audytu szybkiego, ale pełnego.
- Niedokończony plan na main: BRAK ŻYWEGO. Kontrola:
  - `PLAN_2026-11-01-uwagi-o-p-r.md` — O/P/R wdrożone (testy
    `uwagi-2026-11-01-{o,p,r}-*.test.js` istnieją, narracja „Przyrost"
    w planie); checkboxy martwe.
  - `PLAN_2026-11-03-audyt-pr178.md` („Odłożone: granica triggerów") —
    domknięte przez ADR 0031/0032 (2026-11-04) + handoff checkpointu.
  - `PLAN_2026-11-01-zgloszenie-magma-x.md` pkt 5 (dokończyć audyt #177)
    — domknięte w PR #178.
  - `PLAN_2026-11-08-audyt-pr181.md` — E1–E4 odhaczone.
- Kolejka z handoffu 2026-11-08: (1) budżet lektury ~99,7k/100k — nowa
  lekcja wymaga passy kondensacyjnej; (2) suspend przy instant-speed
  (de-facto sorcery) do uogólnienia przy pierwszej karcie instant
  z suspend — NIE TERAZ (brak nośnika, ADR 0029); (3) `turnCheckpoints`
  bez capa — obserwacja, nie defekt; (4) zgłoszenie J „bez DFC" —
  wstrzymane decyzją właściciela.
- Bramy bazowe z handoffu: `npm test` 10 133/10 133, `test:all`
  10 402/10 402, build 78 modułów / 5 800,5 kB. Własny pomiar w toku
  (`.arena/test-fast-baseline.log`).

## E1. Audyt PR #182 (ADR 0020 B) — 17 plików

1. [ ] Mapa plików 17/17 w `docs/audits/PR182_MAPA_PLIKOW_2026-11-08.md`
   (werdykt na każdym pliku).
2. [ ] Weryfikacja 5 plików `src/` (komentarze CR: game-state, triggers,
   card-data, spells, tokens, render): numery 732.x/715.3c/712.6a/
   702.145b/502.2 SPRAWDZONE u źródła (ADR 0030 — tekst CR 2026-11-06
   z mirroru, sha256 zgodny z pinem), nie „na wiarę" audytu #182.
   Kontrola negatywna: stare numery nie znaczą tego samego.
3. [ ] Weryfikacja mutacyjna 2 nowych strażników (L13): cofnięcie
   cytatu → RED, przywrócenie → GREEN; to samo dla pinu Undo
   (`noteTurnBoundaryPause` w `apply()` → RED strażnika granicy tury).
   Kopia przez `cp` PRZED edycją, `git status` pusty po każdej (L34).
4. [ ] `tools/cr-numery.mjs` + `test/helpers/cr-numery-tabela.js`:
   unia vs „tylko użyte", nagłówek, wyłączenia strażnika z powodem.
5. [ ] Dokumenty: raport AUDYT_PR181 (jakość werdyktu, dowody mutacji
   8/8 — wiarygodność bez powtarzania całości), kondensacja LESSONS
   (czy skróty nie zgubiły reguły), handoff, PROJECT_HISTORY.
6. [ ] Raport `docs/audits/AUDYT_PR182_2026-11-08.md` z werdyktem.
   Znalezione błędy → naprawa u root cause osobnym commitem (RED→
   GREEN, mutacja, bramy).

## E2. Pętla jakości (ADR 0021 pkt 4) — innymi ścieżkami niż #182

- [ ] Żywy Tester: 2–4 partie na taliach/profilach INNYCH niż a1–a3
  z #182 (tam: theros|zendikar-rg, wiedzmin-bg|forgotten-realms-wug,
  dominaria-brg|forgotten-realms-br); lektura ręczna transkryptów
  (L27: zero zgłoszeń ≠ OK); nowe klasy → detektory.
- [ ] Polowanie CR innymi ścieżkami niż poprzednia sesja (tam:
  dzień/noc, Sagi, Undo-pokrycie): kandydaci — suspend-timing
  (ograniczony do Mindstab, bez nowej karty), checkpoint triggerów
  (ADR 0032) w scenariuszach wielo-triggerowych, ward drugi przebieg.
- [ ] `bot-tie-audit` na próbce (remisy rozróżnialne), jeśli czas
  pozwoli; BEZ pełnego B0.

## E3. Domknięcie

- [ ] `docs/PROJECT_HISTORY.md` + `docs/setup/HANDOFF_2026-11-08b.md`;
- [ ] opis PR kumulatywnie; bramy końcowe (`test:all`, build);
- [ ] budżet lektury: żadnych nowych lekcji bez passy kondensacyjnej.

## Kolejność commitów

1. plan (ten plik), 2. audyt (mapa + raport), 3. ewentualne naprawy
z audytu (kod + pin osobno), 4. pętla jakości, 5. handoff + historia.

## Ryzyka i pułapki

- Testy cicho (`> .arena/*.log 2>&1`, ogon w czat) — ENVIRONMENT §5a.
- Mutacje: kopia `cp` przed edycją (L136/L34); drzewo zamrożone na
  czas bramy (L174).
- Zmiany regułowe tylko z cytatem CR u źródła (ADR 0030); pamięć nie
  jest źródłem. Tekst CR przez `gh api` + base64 (ENVIRONMENT §CR).
- Tester mierzy `dist/` — build po każdej zmianie `src/` (L76).
- Budżet lektury na granicy: nie dopisywać lekcji „przy okazji".
