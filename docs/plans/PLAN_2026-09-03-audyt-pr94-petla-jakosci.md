# PLAN 2026-09-03 — audyt PR #94 + pętla jakości (sesja `arena/01a067e2-mtg`)

Prompt właściciela: „kontynuujemy projekt” → tryb domyślny ADR 0020/0021:
**PR na starcie → audyt ostatniego scalonego PR (#94) → naprawy u root cause →
pętla jakości**. Raport będzie lądował w `docs/audits/AUDYT_PR94_2026-09-03.md`.

## Pomiar startowy (wykonany przed kodowaniem)

- baza: `main` @ `aa62134` (squash PR #94, merged 2026-09-03T10:55Z);
- `npm test` (szybki rdzeń): **4336/4336 pass**, 0 fail (~130 s); drzewo czyste;
- zgodne z handoffem `HANDOFF_2026-09-03-audyt-pr93-rzut-z-exile.md`.

## Zakres audytu PR #94 (ADR 0020 B)

29 plików, +3370 −306. Pliki inżynieryjne do przeglądu per plik:

1. `src/engine/game-state.js` (+320) — oferty `outsideHandCastScope`,
   `legalModeCasts`, `legalXCostCasts`, `legalFireballCasts`,
   `legalAuraCastsForObject`, limit `VARIABLE_TARGET_OPTION_CAP`;
2. `src/engine/spells.js` (+254) — `castModalSpell`, `castXCostSpell`,
   `castFireball`, `castAuraSpell`, `payFreeCastAdditionalCost`,
   `validateVariableTargets`;
3. `src/engine/resources.js` (223) — okna rzutu spoza ręki
   (Vaan/Discover/grave) i ich walidacja;
4. `src/controllers/heuristic-bot.js` (130) — `freeCastVariantScore`,
   `wrapTargetsValue`, jałowość wariantów;
5. `src/engine/impulse-window.js` (34) — `plottedTurnReached`,
   `warpTurnReached`;
6. `src/engine/effects.js` (3), `src/engine/identity.js` (5),
   `src/engine/triggers.js` (5), `src/table/render.js` (25) — etykiety.

Kryteria audytu: zgodność z CR MtG i Oracle, brak przypadków specjalnych po
nazwie karty w rdzeniu (ADR 0002), spójność oferta↔walidacja (L48), testy
testują to, co deklarują (L13). Audyt bez pełnego B0 (ADR 0018).

## Etap 1 — plan + raport + PR (ADR 0020 A/B) ✅

- ten plan;
- PR sesji otwarty PRZED pierwszą zmianą w kodzie;
- raport audytu uzupełniany w miarę przeglądu.

## Etap 2 — przegląd per plik i znaleziska ✅

Przegląd 29 plików zakończony (raport §2-§3). Znaleziska: **K1** (grób gubi
`stunTargetId` — klasa otwarta przez fix F) i **K2** (etykiety nie nazywają
wyboru stun celu — klasa M91 rozszerzona przez ten PR). Oba naprawione:
testy RED (`50b8ae3`, 5 RED) → naprawa + 2 testy etykiet (`646b49a`, 7/7
zielonych) → 5 mutacji RED.

## Etap 3 — pętla jakości (ADR 0021 §4) ✅

Żywy Tester: 6 partii `worek-basni` × `final-fantasy` (i odwrotnie), profile
greedy/explorer/random, 600 kroków → 0 zgłoszeń detektorów; okno Halo
Foragera wystąpiło (seed 802), ARM z etykietą trybu (seed 811). Bramy:
`npm test` 4343/4343, `test:all` 4353/4353, build 59 modułów / 3190,1 kB,
`family-audit`/`event-contract-audit` bez naruszeń, benchmark szybki bez
wyjątków (heuristic 83,9% — równy bazie). Macierz okien „rzutu spoza ręki”
sprawdzona per okno (raport §4c); luka utajona suspend/`modeName` przypięta
w raporcie (L52).

## Pierwotni kandydaci pętli (niewybrani — kontekst dla następnych sesji)

Kandydaci (wybór wg znalezisk audytu, kolejność wstępna):

- (a) Żywy Tester na zbudowanym artefakcie (`npm run build`, L76) — partie
  na taliach, których nie kryją testy jednostkowe;
- (b) polowanie na niezgodności z CR INNĄ ścieżką niż sesja poprzednia
  (sesja #94 eksploatowała okna „you may cast it”; kandydat: metody skanu
  katalogu z handoffu pkt 6 — madness/darmowy rzut z grobu z celami
  zmiennymi, albo ścieżki dotąd nienaruszone: kopie czarów, Day/Night,
  transform, stempel „po turze” na innych mechanikach);
- (c) NIE wymyślam nowego batcha kart (ADR 0021 §4c).

## Kolejność commitów (wykonana)

1. `e6b6b22` — plan sesji (PR #95 otwarty przed kodem);
2. `93408a2` — raport audytu PR #94;
3. `50b8ae3` — testy RED (K1, 5 czerwonych);
4. `646b49a` — naprawa K1/K2 (7/7 zielonych, 5 mutacji RED);
5. (ten commit) — dokumentacja: M295, L129 (zmieściła się w budżecie
   ~3,4k wolnego), raport zaktualizowany, PROJECT_HISTORY, handoff,
   liczby README **na końcu** (L92).

## Ryzyka i pułapki (z LESSONS/ENVIRONMENT)

- **L5/L44:** test odziedziczony może cementować odchyłkę — odwrócenie tylko
  z jawnym uzasadnieniem;
- **L48:** oferta i walidacja to jeden filtr — zmiana zakresu w dwóch
  miejscach naraz;
- **L8:** mutacje na kopiach (`cp` do /tmp), jedna mutacja = jeden bieg;
- **L13:** każdy nowy test musi dać RED po cofnięciu naprawy;
- **ENVIRONMENT §2:** sandbox potrafi zresetować workspace — push po każdym
  zielonym kroku; przed `reset --hard` backup `git diff > ~/backup.patch`;
- **ENVIRONMENT §4:** Żywy Tester mierzy `dist/mtg-table.html` — rebuild po
  każdej zmianie `src/`.
