# PLAN 2026-09-21b — audyt PR #132 + pętla jakości (ADR 0020 / ADR 0021)

Sesja startuje z promptu „Kontynuujemy projekt." → ADR 0021: bez pytania
o kolejkę, pętla domyślna (PR → audyt poprzedniego scalonego PR → naprawy
u root cause → pętla jakości). Gałąź `arena/01a0c390-mtg`, baza `351126a`
(squash PR #132).

## Rozpoznanie (zmierzone w tej sesji, nie przepisane — L56/L92)

- `git log --oneline -1` → `351126a Sesja 2026-09-20e + 2026-09-21: …
  (#132)`; drzewo czyste; klon płytki — `git fetch --deepen=50 origin main`
  wykonany PRZED liczeniem diffu (inaczej `git show --stat` pokazuje cały
  świat: 2014 plików zamiast zakresu PR).
- `npm test` (szybki rdzeń) → **6079/6079, 0 fail** (~226 s) — zgodne
  z `docs/setup/HANDOFF_2026-09-21.md`.
- `npm run build` → **59 modułów / 3987,2 kB** — zgodne z handoffem.
- `gh pr list --state all` → ostatni scalony PR to **#132** (MERGED
  2026-09-20 21:24 UTC — data merge'a w GitHubie; squash `351126a`), zakres
  audytu **114 plików, +4379 / −733** (`614613e..351126a`) — liczba
  commitów po squashu jest nie do odzyskania i nie jest kryterium zakresu.
- Lektura obowiązkowa (AGENTS.md §0) wykonana PRZED tym commitem:
  `AGENTS.md` (368 linii), rejestr ADR + **wszystkie ADR-y 0001–0030**
  (w całości), `docs/LESSONS.md` (2380 linii, L1–L163 w całości — czytane
  zakresami `sed -n` po `stdout_truncated`, L78), `docs/setup/ENVIRONMENT.md`
  (189 linii), opis i diff PR #132, `docs/setup/HANDOFF_2026-09-21.md`.

## Zakres audytu (114 plików PR #132) — pięć tematów

| Temat | Pliki | Ryzyko |
|---|---|---|
| T1. Gospodarz-GRACZ aury (CR 303.4f „object or player") + granica aura–host (krok 1) | `attachments.js`, `effects.js`, `game-state.js`, `protocol/types.js`, `heuristic-bot.js`, `aggro-bot.js`, `render.js`, `session.js`, `permanents.js`, `destruction.js` | nowa klasa kandydata decyzji = wszystkie warstwy naraz (L163), kształt obiektu po obu drogach wejścia, re-walidacja CR 608.2b, odcisk stanu (L16), dwaj bliźniaczy predykaty gospodarza |
| T2. Piny audytu PR #131 (F1–F15) i ich podłoże w silniku | `test/audyt-pr131-piny-nowych-bramek.test.js`, `abilities.js`, `resources.js`, `spells.js`, `tokens.js`, `identity.js`, `triggers.js`, `card-data.js`, `registry.js`, `e6-pula-blokerow-ponad-cap.test.js` | piny mierzące NIEZMIENNIK vs implementację dnia (L160), Delve/atomowość kosztu, kontrakty zdarzeń (L112/L153) |
| T3. Uwagi właściciela A/B/C | `render.js` (A: ikony many w panelu), `choice-request.js` (B: klik w nazwę z odkrytej ręki — FoW, CR 401.2), renamy „tapnięcie" w 80+ plikach + regex `detectors.mjs` (C) | wycieki FoW przez podgląd (L30/L141), renam bez utraty reguł (chirurgicznie, ADR 0016 B), regex detektora sprzężony z tekstem (L27/L73) |
| T4. Audyt dokumentacji startowej + cięcie lekcji | `AGENTS.md`, `LESSONS.md`, `LESSONS_ARCHIWUM.md`, `LESSONS_PRZYPADKI.md`, `docs-decisions.test.js`, noty stanu ADR 0012/0014/0023/0029 | twierdzenia o danych vs stan kodu (L56), numery lekcji jako API (~1150 cytowań), budżet lektury 100k |
| T5. Milestones/historia/handy | `ENGINE_MILESTONES.md`, `PROJECT_HISTORY.md`, `HANDOFF_2026-09-20e/21`, `README.md` | liczby „bieżącego stanu" mierzone, nie przepisane (L92) |

## Etapy

### E1 — PR na starcie (ADR 0020 A)

- [x] ten plik jako osobny commit + push gałęzi `arena/01a0c390-mtg`;
- [x] otwarcie PR do `main` PRZED kodowaniem (PR #133).

### E2 — audyt PR #132 (ADR 0020 B / 0016 / 0030)

Przegląd każdego zmienionego pliku `src/` pod kątem logiki, zgodności z CR
(twierdzenia regułowe weryfikowane u źródła — ADR 0030), generyczności
(ADR 0002), kompletności widoku (ADR 0017), determinizmu (ADR 0005),
kontraktów zdarzeń (L112/L153) i testów RED→GREEN (L13). Każde znalezisko:
test RED → naprawa u root cause → GREEN → mutacja → bramy → commit → push.

- [x] E2.1 T1: ścieżka gospodarza-GRACZA — predykaty bliźniacze,
      `legalAuraHosts` jako JEDNO źródło kandydatów, kształt obiektu po obu
      drogach wejścia, re-walidacja przy wykonaniu, wycena obu botów,
      etykiety i narracja (L163 — sześć warstw jednego dnia).
- [x] E2.2 T2: piny F1–F15 mierzą niezmienniki; silnik pod pinami bez
      przypadków specjalnych po nazwie/ID karty (ADR 0002).
- [x] E2.3 T3: A/B/C — ikony many bez wycieku do kanałów tekstowych,
      podgląd karty z cudzej odkrytej ręki wg CR 401.2 (biblioteka zawsze
      zakazana), renamy C bez zmiany reguł (porównanie semantyczne diffu).
- [x] E2.4 T4/T5: twierdzenia dokumentacji sprawdzone grepem, numery
      lekcji nienaruszone, budżet lektury pod progiem.
- [x] E2.5 raport `docs/audits/AUDYT_PR132_2026-09-21.md` + wpis w opisie PR.

### E3 — niedokończone plany + pętla jakości (ADR 0021 pkt 3–4)

- [x] kontrola kryteriów najnowszych planów (`PLAN_2026-09-20e-*` i nowszych)
      — podjęcie w miejscu urwania, jeśli coś zostało;
- [x] Żywy Tester na aktualnym `dist/` (≥8 partii, różne talie/seedy —
      handoff 2026-09-21 wskazuje, że pełnej pętli nie powtarzano), ręczna
      lektura transkryptów (L27), każde znalezisko → naprawa u root cause
      + nowy detektor/pin;
- [x] polowanie na niezgodności z CR INNYMI ścieżkami niż PR #132 (odznaka);
- [x] **bez** nowego batcha kart (ADR 0029) — katalog rośnie tylko
      z list właściciela.

### E4 — domknięcie

- [x] bramy końcowe: `node tools/run-tests.mjs all`, `npm run build`,
      `node --test test/bot-benchmark.test.js`;
- [x] aktualizacja planu (odhaczenie + podsumowanie), `PROJECT_HISTORY.md`,
      `docs/setup/HANDOFF_2026-09-21b.md`, ewentualne lekcje (budżet!);
- [x] opis PR zaktualizowany kumulatywnie; blok przekazania w czacie.

## Ryzyka / pułapki

- **L163 (świeża):** nowa klasa kandydata decyzji rozjeżdża się między
  warstwami cicho — audituję WSZYSTKIE sześć (oferta, widok, etykieta,
  wycena, projekcja, narracja) dla obu rodzajów gospodarza.
- **L136/ENVIRONMENT §2:** workspace potrafi zresetować się w trakcie —
  commit + push po każdym zielonym kroku; `git status` przed każdym
  `git checkout`/`git restore`.
- **L57/ADR 0030:** każde twierdzenie regułowe w audycie weryfikuję
  wobec CR/Oracle U ŹRÓDŁA (fetch_page), nie z pamięci treningowej.
- **Budżet lektury ~95 819/100 000** (~4,2 tys. zapasu): nowa lekcja
  wymaga kondensacji prozy do `LESSONS_PRZYPADKI` (M284); progu nie podnosimy.
- **Nazewnictwo C obejmuje też `tools/` i `test/`** — regex detektora
  sprzężony z tekstem logu; zmiana etykiet bez reguł (porównanie diffu).
- **Klon płytki:** po resecie workspace `git fetch --deepen=50` przed
  liczeniem jakiegokolwiek diffu względem historii.

## Kryteria ukończenia

1. `docs/audits/AUDYT_PR132_2026-09-21.md` istnieje i pokrywa 114 plików
   (pięć tematów), z weryfikacją mutacyjną kluczowych pinów.
2. Znaleziska naprawione u root cause, każde z pinem RED→GREEN i mutacją
   (albo świadomy wpis „bez zmian" z uzasadnieniem).
3. `node tools/run-tests.mjs all` zielone; `npm run build` zielone;
   `node --test test/bot-benchmark.test.js` zielone (bez pełnego B0 — ADR 0018).
4. Pętla jakości wykonana (≥8 partii Żyweym Testerem + lektura transkryptów
   + min. jedna nowa ścieżka polowania na CR).
5. Dokumentacja domknięta: plan odhaczony, PROJECT_HISTORY, handoff,
   opis PR kumulatywny, blok przekazania w czacie.

## Podsumowanie (2026-09-21b)

Wszystkie etapy zamknięte. Audyt 114 plików PR #132: werdykt APPROVE, 0 defektów
w PR, 4 notki nie-defektowe (Z-1…Z-4, każda z uzasadnieniem braku zmiany), pokrycie
maszynowe 114/114, mutacje 5/5 (M1–M4 + M-H). Pętla jakości: 8/8 partii Żywym
Testerem bez zgłoszeń + ręczna lektura transkryptów; łowy CR (704.5m, ścieżka SBA
poza tematami PR) wykryły i naprawiły **H-1** (trzeci przypadek reguły — pin
`granica-7045m-aura-sba` H/1–H/4, RED→GREEN, mutacja M-H; fixture B43/11
zalegalizowany `attachAuraToPlayer`). Bramy: `node tools/run-tests.mjs all`
**6093/6093**, build **59/3988,2 kB**, bot-benchmark **10/10**, budżet lektury
**95 819/100 000**. Bez nowej lekcji (klasa L5/L107) i bez nowych kart (ADR 0029).
Dokumentacja: raport `docs/audits/AUDYT_PR132_2026-09-21.md`, milestone M404,
`PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-09-21b.md`, README.

## Dodatek 2 (uwagi z gry, 2026-09-21): A — Twiddle, B — Jeskai Devotee

Właściciel z żywej gry (potwierdzone w czacie):

**A. Twiddle.** Karta ma dwa użycia: (a) combat trick — tapnięcie potencjalnych
blokerów przeciwnika na początku fazy walki; (b) odkręcenie własnej kreatury
po ataku, żeby mogła blokować (wycenione — M146). Bot rzucił ją w Głównej 1 na
ląd przeciwnika, który odkręcił się w untapie właściciela — „kompletne
marnotrastwo”. Żądanie: **surowo scoringowo penalizowane**.

- [x] A1. Pin RED→GREEN `test/uwaga-z-gry-twiddle-2026-09-21.test.js` T/1–T/4
      (T/1 ląd wroga = NIGDY + ślad mierzy ocenę, T/1b ląd własny, T/2 okna
      walki +20, T/3 denial +14, T/4 klasa po `kind` — ADR 0002) — `7300c6b`;
- [x] A2. Naprawa u źródła (`tapTimingBonus` ≤ −10 na mój obieg dla celu
      spoza walki/blokowania; `tapTimingValue` wcześnie zwraca) + mutacje
      M-T1/M-T2 czerwienią T/1(+1b)/T/2/T/3.

**B. Jeskai Devotee.** Na stole: Devotee (przekształca jedną dowolną manę na
U/R/W), 1 Plains + 4 Mountains. Rzut za {W} powinien OTWORZYĆ „Mana Wizard”
z wyborem: tapnąć Plains ALBO przekształcić czerwoną manę Devotee na białą.
Silnik sam tapuje Plains — brak wyboru. Do naprawy.

- [x] B1. Rozpoznanie: `getSourceForObject` (mana-sources.js) czytał tylko
      `data.spell.abilities`, a zdolność many Devotee to `kind: 'mana'` w
      `data.abilities` — konwerter nie był źródłem dla wizarda płatności;
- [x] B2. Piny D/1–D/4 (`test/uwaga-z-gry-jeskai-devotee-mana-wizard-
      2026-09-21.test.js`) + naprawa `manaAbilityProductionOf` (paritet M67)
      i `abilityInfo`; anty-over-fix D/2 (Pardic Wanderer, M195/A); mutacje
      M-B1/M-B2 czerwienią D/1+D/2 / D/4 — `2b2a8a8`.

**C. Vandalize „Choose one or both” (dopisane po zgłoszeniu właściciela,
„POWAŻNE”).** Zgłoszenie: „Zamiast multi-target modal z możliwością wybrania
0-1 artefaktu ze wszystkich możliwych oraz 0-1 lądu ze wszystkich możliwych
dostałem jakiś bezsensowny modal wyboru z trzema opcjami — a. jednym losowym
artefaktem, b. jednym losowym lądem albo c=a+b. Wybrał sobie pierwszy z
brzegu.” Klasa: modal wyboru ma pokazywać WSZYSTKICH kandydatów w pickerach
0–1, a cel wiązać wyborem gracza — nigdy „pierwszy z brzegu”.

- [x] C1. Rozpoznanie: `castModePlanOf` = 3 wiersze trybów z celami
      repów; `multiTargetPlanOf` = worek bez gniazd (`targetSlotsOf`
      umiera na zmiennych arnościach trybów) — `test/uwaga-z-gry-
      vandalize-2026-09-21.test.js` V/1–V/4 — `8c184e7`;
- [x] C2. Naprawa: `chooseOneOrBothPlanOf` (gniazda z trybu „oba”, tryby
      1-celowe wiążą gniazdo po zawartości — Great Furnace w obu) +
      `commandForChooseOneOrBoth` (mapa WYBÓR→KOMENDA, L48) + gałąź kaskady
      PRZED `castModePlanOf` (M300/1); mutacje M-C1/M-C2 czerwienią V/1+V/2;
- [x] C3. Model 3-mody katalogu bez zmian (piny `audit-batch23-fixes`).

Wspólne (wykonane): bramy `run-tests all` **6106/6106**, build **59 modułów /
3997,8 kB**, `tools/benchmark.mjs --quick` 672 mecze / heuristic 85,9%;
docs: milestone **M405**, `PROJECT_HISTORY` (sekcja 2026-09-21c), README
(„Bieżący stan”), korpus PR #133; blok przekazania w podsumowaniu.
