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

---

## Etap dodany 2026-09-03 (po uwagach A–D): audyt modali wyboru (M299)

Zlecenie właściciela: „przejrzeć silnik i wszystkie tory czarów i zdolności
z modalami wyboru czy nie mają jakichś customowych modali, które należałoby
przerobić na uniwersalny helper”.

1. Audyt: 66 typów `resolve_*`, inwentarz modali, mapa routingu
   `openChoiceRequest` → raport `docs/audits/AUDYT_MODALE_WYBORU_2026-09-03.md`.
   Wynik: customowych modali POZA torem choice-request NIE MA; luka = ~24 typy
   jednowyborowych `{targetId}`/`{cardId}`/... spadających do ściany przycisków.
2. Naprawa: generalizacja `singleTargetPlanOf` (M298) na całą rodzinę —
   plan czyta POLE wyboru z komend + wariant odmowy (`done`/`skip`/null);
   routing i kreator bez zmian (radio + Zatwierdź, L48). Wykluczenia: okna
   rzutu (exile/grave-free/madness/rebound/suspend cast), search (2 wymiary),
   małe enumeracje (2–5 przycisków = poprawne), kolejności (index/reveal).
3. Weryfikacja: testy RED na kształtach komend z silnika, mutacje, bramki,
   Żywy Tester (Forever Young [worek-basni], Springbloom [wiedzmin], discard).
4. Dokumentacja: M299, PROJECT_HISTORY, PR #95.

Poza zakresem (decyzja w raporcie §3b/§3c): przyciski dla 2–5 opcji, okna
rzutu jako przyszły osobny wizard, search_choice, undercity.

---

## Etap dodany 2026-09-03 (po decyzji o §3c): okna rzutu do wspólnego kreatora (M300)

Zlecenie właściciela: „Nie wiem co rozumiesz przez wizard dla okien rzutu —
co to znaczy? Że te efekty są nieobsłużone? Że nie korzystają ze wspólnego
helpera? W obu przypadkach trzeba to załatać."

Stan zmierzony: silnik obsługuje okna rzutu W PEŁNI (etykiety wariantów K1/K2
z audytu PR #94: tryb, stun, numeracja duplikatów) — brakowało tylko toru UI:
wybór padał na awaryjną ścianę przycisków `renderChoiceRequest`, poza
wspólnym helperem.

1. Plan: `castWindowPlanOf` (5 typów okien, jedna opcja = jeden wiersz radio
   z `cardId` do podglądu) + `commandForCastWindowSelection` (tożsamość
   z `legalCommands`, L48); routing w `openChoiceRequest` PRZED
   `multiTargetPlanOf` (opcje okien niosą `targets`); etykiety K1/K2
   z `labelChoiceOptions`, intro z `choiceGroupTitle` + „— wybierz wariant:".
2. Klasa błędu przy okazji: `multiTargetPlanOf` budował plan z PODZBIORU
   opcji niosących `targets` — okno Vaana z czarem {X} i odmową dawało
   kreator wielocelowy BEZ wiersza odmowy (zmierzone przed naprawą). Straż:
   plan powstaje tylko gdy KAŻDA opcja niesie `targets`.
3. Weryfikacja: 7 testów (RED), 6 mutacji RED; bramki 4383/4383,
   `test:all` 4393/4393, build 3217,2 kB. Żywy Tester: Halo Forager
   (worek-basni, seedy 802/811 — okna 5 i 14 opcji z wierszem „Zrezygnuj")
   i Vaan (final-fantasy, seed 51 — dwa okna 2-opcyjne), 0 zgłoszeń
   detektorów. Odpowiedź na pytanie właściciela: audyt §3c = detekcja,
   M299 = migracja §3a, M300 = migracja okien rzutu.
4. Dokumentacja: M300, PROJECT_HISTORY, aktualizacja §3c/§4 audytu, PR #95.

Świadomy kompromis: `resolve_grave_free_cast` był w `OPTION_IGNORABLE_TYPES`
(per-opcyjne checkboxy wyciszenia) — w kreatorze wyciszenie per opcja znika;
zostaje wyciszenie grupy w panelu akcji (automatyczna odmowa w `advance()`)
i jawny wiersz odmowy.

---

## Etap dodany 2026-09-03 (po decyzji o §3b): małe enumeracje do wspólnego helpera (M301)

Decyzja właściciela: „Małe enumeracje 2-5 opcji mogą zostać przy przyciskach,
ale warto, żeby to też był element tego samego helpera. Choćby po to, żeby
ujednolicić elementy graficzne, podgląd kart targetów itp."

1. Plan: `enumButtonsPlanOf` (18 rodzin §3b, jednorodny typ, 2–5 opcji) +
   tryb `enumButtonsMode` kreatora: wiersz-przycisk (JEDEN klik = DOKŁADNA
   komenda z legalCommands, L48), wspólne intro/Anuluj/lista pickera,
   podgląd karty per `cardId` opcji, klucz sondy M104, klasa
   `choice-request-option` (prowadzenie Żywego Testera bez zmian). Routing
   ostatni z planów; rodziny odroczone (search_choice, undercity, kolejności)
   i grupy >5 opcji zostają przy dawnym rysowaniu.
2. Luki rodziny „wskaż cel (1)" zmierzone żywo i domknięte przy okazji:
   (a) `singleTargetPlanOf` znał tylko `cast_spell` z `targets[1]` — aurzy
   gospodarze (`cast_permanent`) i aktywacje z jednym celem
   (`activate_ability`, np. equip) padały na ścianę → SINGLE_TARGET_CAST_TYPES;
   (b) pola kosztów `tapCreatureId`/`tapOtherCreatureId`/`exileTargetId`
   poza SINGLE_PICK_FIELDS (Wedgelight Rammer, Makeshift Mauler) → dopisane
   + etykiety czynności („stwora do tapnięcia", „kartę do wygnania");
   gałąź pola pierwsza w `commandForSingleTargetSelection` (typy się
   nakładają).
3. Weryfikacja: 9 testów (RED), 8 mutacji; bramki 4392/4392, `test:all`
   4402/4402, build 3224,6 kB. Żywy Tester: Clawing Torment — wybór
   gospodarza w kreatorze z tagami kontrolera (worek-basni 811), Dobrowolna
   dopłata Zoraline — tryb przyciskowy helpera (811), Wedgelight Rammer —
   kreator „wskaż stwora do tapnięcia" (worek-legend 3), okno Vaana bez
   regresji (final-fantasy 51); 0 zgłoszeń detektorów. Harness `table-ui`
   zaktualizowany (pickActionButton sięga głębiej — wiersz pickera).
4. Dokumentacja: M301, PROJECT_HISTORY, aktualizacja §3b/§4 audytu, PR #95.

---

## Etap dodany 2026-09-03 (doprecyzowanie właściciela): KAŻDY modal wyboru na jednym helperze (M302)

Doprecyzowanie właściciela po M301: „Nie rozumiem pytania. Czemu te modale
wyboru, które wymieniasz wymagają mojej decyzji? Każdy modal wyboru może
i powinien mieć ten sam helper, być może z różnymi/dodatkowymi opcjami czy
parametrami. Ale podstawa powinna być jedna żeby wszelkie zmiany — np.
czcionki, ikonki podglądu itp. — były w jednym miejscu. Czemu 1 kandydat
i odmowa (2 opcje) nie mogą być z tego samego helpera na przyciskach?"

1. `enumButtonsPlanOf` (M301: lista 18 rodzin + limit 2–5) → ogólny
   `buttonsPlanOf`: KAŻDA grupa ≥2 opcji, której nie wziął wcześniejszy plan
   albo wizard typowany, dostaje wiersze-przyciski wspólnego kreatora
   (jeden klik = dokładna komenda, L48). Tryb `buttonsMode` (dawniej
   `enumButtonsMode`). Routing przeniesiony na sam KONIEC
   `openChoiceRequest` — wizardy typowane (scry/surveil/index, walka,
   podział obrażeń, escape) mają pierwszeństwo; strażnik kolejności czyta
   źródło main.js (test M302/4). `renderChoiceRequest` zostaje jako siatka
   bezpieczeństwa dla grup pustych.
2. Zmierzone żywo po naprawie: Jill (11 kandydatów → radio-wizard rodziny
   §3a; wariant 1 kandydat + odmowa → przyciski helpera), „Karta z grobu na
   wierzch biblioteki" (1 kandydat + „Gotowe — bez wyboru" → przyciski
   z 🔍), Zoraline — Dobrowolna dopłata (przyciski ze wspólnym Anuluj),
   scry/surveil — sekwencyjne wizardy BEZ regresji, okno Vaana bez regresji;
   0 zgłoszeń detektorów (final-fantasy 51, worek-basni 811, worek-legend 3,
   wiedzmin 7).
3. Weryfikacja: 4 nowe testy (RED), testy M301 zaktualizowane do ogólnej
   semantyki (razem 13/13), mutacje zabite (guard ≥2, gałąź renderu,
   kolejność routingu); bramki 4396/4396, `test:all` 4406/4406, build
   3224,2 kB.
4. Dokumentacja: M302, PROJECT_HISTORY, audyt §3b/§3c/§4 po aktualizacji,
   PR #95.
