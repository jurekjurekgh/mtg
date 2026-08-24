# PLAN M202 — audyt PR #73 + pętla jakości (2026-08-24)

Sesja: `arena/01a032b2-mtg` · PR: **#74**
Tryb: **ADR 0020** (PR → audyt poprzedniego PR → inkrementalne commity)
+ **ADR 0021** (prompt „kontynuujemy” = pętla domyślna, nie pytanie o kolejkę).

## 0. Rozpoznanie (wykonane przed spisaniem planu)

- Baza: `7beef4a` (squash PR #73 — M201). Klony Areny są **spłaszczone do jednego
  commita** (`git rev-list --count HEAD` = 1), więc diff PR #73 pobieramy
  z GitHuba (`gh pr diff 73`, 38 plików, +2840/−95), nie z lokalnej historii.
- `npm test` → **3096/3096 pass** (zgodnie z `PROJECT_STATE.md`).
- `npm run build` → **53 moduły / 2592.4 kB** (zgodnie).
- PR #73 scalony 2026-08-24 09:33 (M201: audyt PR #72, zgłoszenia F/M/M2, U2/O1,
  brązowa odznaka 5 błędów).

## 1. Audyt PR #73 (ADR 0020 B / ADR 0016) — etap bieżący

Przegląd każdego zmienionego pliku pod kątem: zgodności z CR, ADR 0002
(brak przypadków po nazwie/ID karty w core), ADR 0017 (kompletność widoku),
L58 (kod stołu = kod przeglądarkowy), L48 (oferta = walidacja), L21/L31
(martwe pola deskryptorów), L44 (komentarz z numerem reguły ≠ dowód).

Kryterium ukończenia: raport `docs/audits/AUDYT_PR73_2026-08-24.md` + commit.

### Znaleziska wstępne (do potwierdzenia testem RED)

| # | Klasyfikacja | Objaw (zmierzony) |
|---|---|---|
| **N1** | BŁĄD REGUŁ (CR) | Mana ograniczona drukiem (Powerstone: „This mana can't be spent to cast a nonartifact spell”) jest w silniku traktowana jak „tylko do czarów-artefaktów”: `producibleMana(state,p1,null,{})` = 0 przy puli 1, więc zdolność `{1}: Add {U/R/W}` (Jeskai Devotee) **nie jest oferowana ani nie daje się aktywować**, choć druk zabrania wyłącznie rzucania czarów nie-artefaktowych. Silnik odbiera legalną akcję (klasa L44). |
| **N2** | MARTWY DESKRYPTOR (L21/L31) | `targets: [{ type: 'player', prefer: 'opponent' }]` (Dementia Bat, M201 znalezisko #4) nie jest czytane w `targetCandidatesBySpec` — `prefer` obsługuje wyłącznie `triggerTargetCandidates` (triggery). Kolejność „przeciwnik pierwszy” jest przypadkowa (`state.players.map` = [ja, on] + `unshift` w `playerView`). Zmiana kolejności graczy albo `push` zamiast `unshift` odwróciłaby domyślny cel na WŁASNEGO gracza (odrzuć 2 własne karty). |
| **N3** | LUKA ŚCIEŻKI (L52) | `freeCastAdditionalCostVariants`/`payFreeCastAdditionalCost` czytają wyłącznie `obj.spell.additionalCost`; koszty dodatkowe na OBIEKCIE (`additionalCost.exileCreature` — Fear of Abduction, `exileCreatureFromGraveyard` — Makeshift Mauler) są dla ścieżek darmowego rzutu niewidoczne. Dziś nieosiągalne (Epic Experiment oferuje tylko `kind === 'spell'`, suspend/rebound takich kart nie ma) — potrzebny strażnik, który czerwienieje w dniu wejścia pierwszej takiej karty. |
| **O1** | OBSERWACJA | Domyślne znaczenie `beginning_of_combat` bez `eachCombat` to „on your turn”, a CR dla niekwalifikowanego „At the beginning of combat” = każdy combat. Strażnik katalogu z M201 wymusza ręczne rozstrzygnięcie (czerwienieje), więc luka jest pilnowana — zostaje notatka, nie zmiana. |
| **O2** | OBSERWACJA | `waiting` (poczekalnia wygnania) w `playerView` wysyła `kind`/`types` także dla obiektów `faceDown`; dziś w katalogu nie ma wygnania twarzą w dół, więc wycieku nie ma (L45 — do pilnowania przy pierwszej takiej karcie). |

## 2. Naprawa znalezisk (po jednym commicie na fix)

Każdy fix: test RED (weryfikacja mutacyjna — odwrócenie fixa musi dać FAIL)
→ naprawa u root cause → `npm test` + `npm run build` → commit + push.

1. **N1** — odwrócić semantykę `purpose`: ograniczenie many działa WYŁĄCZNIE
   przy płaceniu za czar nie-artefaktowy (jedno miejsce: `resources.js`),
   a ścieżki rzutów czarów dostają jawny cel wydania. Testy: zdolność za {1}
   z samej many Powerstone (oferta + wykonanie), anty-over-fix: czar
   nie-artefaktowy nadal NIE do opłacenia, czar-artefakt nadal tak.
2. **N2** — `prefer: 'opponent'` honorowane w `targetCandidatesBySpec`
   (jedno centralne miejsce, wzór `triggerTargetCandidates`) + test pinujący
   kolejność kandydatów i pierwszą ofertę.
3. **N3** — strażnik katalogu (L52 §4) + test ścieżki na obiekcie
   syntetycznym, jeśli da się ją osiągnąć bez nowej karty.

## 3. Pętla jakości projektu (ADR 0021 pkt 4)

Po domknięciu audytu, dopóki właściciel nie wskaże innego tematu:

- (a) audyt Żywym Testerem z perspektywy gracza (`tools/table-tester`, wymaga
  `npm i` w katalogu narzędzia) — trzy osie z `TESTER_STOLU.md`;
- (b) polowanie na niezgodności z CR innymi ścieżkami niż M201 (odznaka):
  obszary nietknięte w poprzedniej sesji — kolejność triggerów (CR 603.3),
  efekty ciągłe/warstwy (CR 613), koszty alternatywne vs dodatkowe (CR 118),
  zasada legendarna/planeswalkerów w 1v1;
- (c) **NIE** wymyślamy nowego batcha kart (ADR 0021 pkt 4c).

## 4. Zamknięcie sesji

`docs/PROJECT_STATE.md` + `docs/setup/HANDOFF_2026-08-24-m202.md` + opis PR
kumulatywnie + blok przekazania w czacie (ADR 0013).

## Ryzyka i pułapki

- Zmiana semantyki `purpose` dotyka każdej ścieżki płacenia maną — pominięcie
  ścieżki rzutu czaru oznaczałoby, że mana ograniczona opłaci czar
  nie-artefaktowy (złamanie druku). Mitigacja: test anty-over-fix + przegląd
  wszystkich wywołań `spendMana`/`producibleMana` w `spells.js`/`resources.js`
  + benchmark szybki (`node tools/benchmark.mjs`, ADR 0018 — bez `--full`).
- Pełna macierz B0 tylko na komendę właściciela (ADR 0018).
- Edycje plików z polskim tekstem: sprawdzać kodowanie po zapisie (ENVIRONMENT §4).

## Dziennik

- [x] 0. Rozpoznanie: testy/build bazy, diff PR #73 pobrany z GitHuba.
- [x] 1. Plan spisany i wypchnięty (ten commit) — PR otwarty.
- [x] 2. Audyt: raport `docs/audits/AUDYT_PR73_2026-08-24.md` — N1/N2/N3 + O1–O4, weryfikacja mutacyjna 3/3 RED, pomiar duplikatów zdarzeń 17 816 komend / 0.
- [ ] 3. Fix N1 + testy.
- [ ] 4. Fix N2 + testy.
- [ ] 5. Strażnik N3.
- [ ] 6. Pętla jakości.
- [ ] 7. Dokumentacja zamknięcia sesji.
