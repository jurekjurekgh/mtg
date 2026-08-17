# M104 — sonda „noop" w MODALACH + wzorzec U9/A2 dla liczników i tapnięć

Sesja: gałąź `arena/01a00b7e-mtg` · kontynuacja handoffu M103
(`docs/setup/HANDOFF_2026-08-16-m103.md`, sekcja „Następne kroki").
Baseline startowy: `npm run test:all` **1892/1892**, build 51 modułów.

## Zakres (z handoffu M103)

| # | Krok z handoffu | Status w tej sesji |
|---|---|---|
| 1 | Pełne B0 po A–D (`node tools/benchmark.mjs --full`) | **NIE** — ADR 0018: tylko na wyraźną komendę właściciela. Robimy profil szybki po zmianie enumeracji ofert |
| 2 | Sonda `noop` na opcje MODALI (dziś tylko panel) | **TAK** — etap E2 |
| 3 | Wzorzec U9/A2 dla „połóż licznik" i „tap target" (cel już tapnięty itd.) | **TAK** — etap E3 |
| 4 | Domknięcie `ci.yml` (`node tools/run-tests.mjs all`) | **TAK** — etap E5 (próba pushu; przy blokadzie App-a → jawny opis) |

## E0 — audyt poprzedniego PR (#55, M103) — OBOWIĄZKOWY (ADR 0016)

Zakres: sonda `noop-probe.js`, mostek `__mtgDebug`, detektor
`detectNoEffectOffers`, bramka A2 (`keywordGrantIsNoOp`), `pendingDecisions`
w fingerprint, wycena A/B/D bota, `syncStationKind` (C3).
Kryterium: wnioski spisane w tym planie (§E0 — wynik) i w `PROJECT_STATE.md`.

## E1 — plan + PR (ten commit)

Roadmapa w repo przed kodowaniem, PR sesji otwarty (1 sesja = 1 gałąź = 1 PR).

## E2 — sonda `noop` w opcjach MODALI

**Problem:** sonda mierzy dziś WYŁĄCZNIE kliknięcia w panelu „Twoje działania"
(`data-option-key` na `button.action`). Opcje wewnątrz modala wyboru
(`renderChoiceRequest` — warianty celu, tryby, wybór karty) nie są sondowane,
a to właśnie tam ląduje większość wariantów: panel pokazuje jeden przycisk
grupy, a gracz wybiera wariant w modalu. Sonda widzi więc tylko wariant
PIERWSZY (klucz opcji `options[0]`).

**Projekt:**

- `src/table/choice-request.js` — każdy przycisk opcji dostaje
  `data-option-key` (`commandOptionKey(option)`), tak samo jak przyciski
  panelu. Opcje modala to te same komendy z `legalCommands`, więc mostek
  `session.probeCommandEffect(optionKey)` znajdzie je bez zmian w protokole.
- `tools/table-tester/run-game.mjs` — `resolveModal` sonduje WYBRANĄ opcję
  przed kliknięciem i zapisuje rekord `{ label, applied, probe, source:'modal' }`.
- `tools/table-tester/detectors.mjs` — `detectNoEffectOffers` rozróżnia
  źródło (panel/modal) w treści zgłoszenia; nowe bramki fałszywych alarmów
  dla modali: opcja „nic nie rób" jest w modalu LEGALNĄ i potrzebną opcją
  (`Pomiń`, `Nie`, `Zrezygnuj`, `Zostaw`, `Brak`, `Bez ...`, `Nie płacę`) —
  wybór „nie robię nic" nie jest ofertą bez skutku.

**Testy:** `test/table-tester-detectors.test.js` (rekordy modalne + bramki),
`test/choice-request-ui.test.js` (klucz opcji na przycisku modala).

**Kryterium ukończenia:** pakiet zielony; Żywy Tester na zbudowanym artefakcie
raportuje sondy modalne (`sondy noop: N` rośnie, w rozbiciu panel/modal).

## E3 — wzorzec U9/A2: oferty aktywacji, które nic nie zmieniają

**Metoda:** przegląd KAŻDEJ zdolności aktywowanej katalogu pod kątem
„czy istnieje cel, dla którego efekt jest idempotentny?" (skan rejestru,
nie czytanie transkryptów).

Klasy znalezione w katalogu (skan `createCardRegistry()`):

| Efekt | Karta | Czy no-op istnieje? |
|---|---|---|
| `untap_permanent` (cel: land) | Rustvine Cultivator `{T}, zdejmij oil: odkręć docelowy ląd` | **TAK** — ląd już odkręcony: koszt (tap + licznik oil) za nic |
| `cant_be_blocked` (cel: creature) | Coralhelm Guide `{4}{U}` | **TAK** — cel już ma `cantBeBlocked` w tej turze |
| `cant_block` (cel: creature) | Panic Spellbomb `{T}, poświęć` | **NIE hidujemy** — koszt poświęca źródło, a to odpala trigger „dies → dobierz za {R}"; aktywacja ma wartość poza efektem (anty-over-fix, jak Soulbright Flamekin w A2) |
| `add_counter` | Trigon of Corruption, Kabira Vindicator, Rustvine Cultivator | licznik zawsze zmienia stan (`+1/+1`, `-1/-1`, `charge`, `oil`, `level`); liczniki `stun` KUMULUJĄ się (CR 122.1b) — klasa „licznik bez skutku" w katalogu NIE występuje. Zostaje bramka generyczna `amount <= 0` |
| `tap_permanent` (aktywowana) | — | w katalogu brak (tylko triggery: Angelic Benediction, i tryby czarów) |

**Implementacja (generycznie, ADR 0002):** `keywordGrantIsNoOp` rozrasta się
w tablicę predykatów `abilityEffectIsNoOp(state, object, ability, target)`
w `src/engine/abilities.js`:

- `grant_keywords_until_end_of_turn` — cel ma już wszystkie keywordy (A2),
- `untap_permanent` — cel nietapnięty,
- `tap_permanent` — cel już tapnięty,
- `cant_be_blocked` / `cant_block` — cel ma już ten znacznik,
- `add_counter` — `amount <= 0`,
- **warunek wspólny:** żaden gate nie działa, gdy zdolność ma `onNthResolve`
  (dołożony skutek) albo koszt o wartości samej w sobie (`sacrificeSelf`,
  `sacrifice`, `discardCard(s)`, `mill`) — wtedy aktywacja może mieć sens
  mimo jałowego efektu.

`execute` NADAL przyjmuje taką komendę (jest legalna wg CR 602.2b) — chowamy
wyłącznie OFERTĘ, dokładnie jak U9/A2.

**Testy (RED→GREEN):** `test/bug-hunt-2026-08-16-noop.test.js` (rozszerzenie)
lub nowy `test/bug-hunt-2026-08-16-noop-liczniki.test.js`:
Rustvine (ląd odkręcony → brak oferty, ląd tapnięty → oferta jest),
Coralhelm (drugie użycie na tym samym celu schowane), Panic Spellbomb
(oferta ZOSTAJE — anty-over-fix), `execute` przyjmuje ręcznie złożoną komendę.

**Kryterium:** pakiet zielony + próbka szybka benchmarku (zmiana enumeracji
ofert!) z progami `test/bot-benchmark.test.js`.

## E4 — weryfikacja Żywym Testerem (L13: mutacja)

1. `npm run build` → macierz partii (kilka par talii × profile × seedy)
   z `?tester=1`; kategoria `noop` ma milczeć (albo zgłaszać wyłącznie
   realne znaleziska, które naprawiamy u root cause).
2. Weryfikacja mutacyjna nowych bramek: cofnięcie gate'a E3 → tester zgłasza
   „odkręć docelowy ląd" jako ofertę bez skutku; po przywróceniu — cisza.
3. Oba tryby logowania (`--quiet` i `--snapshot-every 1`) — reguła z M99.

## E5 — `ci.yml` (znany rozjazd z M103)

`.github/workflows/ci.yml` odpala `node --test 'test/**/*.test.js'`
(sekwencyjnie, ~14 min), a repo ma równoległy runner (ADR 0019).
Zmiana: jedna linia → `node tools/run-tests.mjs all` (+ `pages.yml`).
Ryzyko: push plików `.github/workflows/*` bywa blokowany (App bez
uprawnienia `workflows`) — jeśli push padnie, commit zostaje wycofany
lokalnie (`git reset`), a rozjazd opisujemy w handoffie jako zadanie
dla właściciela.

## E6 — dokumentacja i zamknięcie

`docs/PROJECT_STATE.md` (sekcja M104), `docs/setup/TESTER_STOLU.md` (oś 4 —
modale), `docs/LESSONS.md` (jeśli będzie lekcja), `docs/setup/HANDOFF_2026-08-16-m104.md`,
podsumowanie wykonania w tym planie, opis PR.

## Ryzyka i pułapki (z L13/L17 i doświadczeń M103)

- **Bundler jednoplikowy**: żadnych aliasów importów, żadnych Node-globali
  w kodzie artefaktu (`choice-request.js` idzie do buildu) — weryfikacja
  wyłącznie na ZBUDOWANYM pliku (L17).
- Stuby DOM w testach stołu muszą mieć `dataset` (render zapisuje klucz).
- Detektor nie może zależeć od poziomu logowania (M99) — rekordy modalne
  zbiera sterownik, nie parser transkryptu.
- Bramka ofert zmienia enumerację → zmienia benchmark; pełne B0 wymaga
  komendy właściciela (ADR 0018), commitujemy próbkę szybką.
- Anty-over-fix: hidowanie ofert wolno stosować tylko przy PEWNYM no-opie;
  przy koszcie o własnej wartości (poświęcenie źródła z triggerem „dies")
  oferta zostaje.

## Postęp

- [x] E0 audyt PR #55
- [x] E1 plan + PR
- [x] E2 sonda w modalach
- [x] E3 bramki U9/A2 (untap/tap/cant_block/cant_be_blocked/licznik)
- [x] E4 weryfikacja Żywym Testerem (+ mutacja) — rozszerzona o skan okna
- [x] E5 ci.yml
- [x] E6 dokumentacja

## E0 — wynik audytu PR #55 (M103)

Przejrzane: `src/table/noop-probe.js`, mostek `__mtgDebug` w `main.js`,
`session.probeCommandEffect`, `detectNoEffectOffers`, `keywordGrantIsNoOp`
+ dwa miejsca wpięcia w `legalActivatedAbilities`, `PENDING_DECISION_FIELDS`
w `src/engine/fingerprint.js`, wycena A/B/D w `src/controllers/heuristic-bot.js`,
`syncStationKind` (C3) i testy A–D.

Werdykt: **merytorycznie poprawny**, bez regresji. Szczegóły:

1. **Sonda nie dotyka partii** — `cloneState` + `execute` wyłącznie na klonie;
   pętla pass ma bezpiecznik `MAX_PROBE_COMMANDS` i wychodzi, gdy obiekty
   komendy zejdą ze stosu. Determinizm (ADR 0005) zachowany.
2. **Mostek tylko z `?tester=1`** i tylko dwie funkcje odczytowe
   (fingerprint + probe) — normalna gra nie eksponuje stanu silnika.
   `try/catch` wokół `window.location` (jsdom bez `location` w testach).
3. **A2 (`keywordGrantIsNoOp`)** jest generyczna (po `effect.type`, nie po
   nazwie karty — ADR 0002), z anty-over-fixem `onNthResolve`. `execute`
   nadal przyjmuje komendę → oferta i walidacja rozjeżdżają się ŚWIADOMIE
   (jak U9); to jedyne miejsce, gdzie oferta jest węższa od walidacji.
4. **`pendingDecisions` w fingerprint** — sekcja generyczna z listą 36 pól;
   `test/fingerprint.test.js` pilnuje, że nowe pole trafia na listę.
   Zmiana fingerprintu jest addytywna (nowy klucz), więc nie unieważnia
   determinizmu replayów (replay porównuje fingerprint tej samej wersji).
5. **Wycena A/B/D bota** — kary/bonusy liczone z deskryptorów efektów
   (`damage_to_controller`, `cant_be_blocked`, `cast_escape`), bez rozpoznawania
   kart po nazwie. `ESCAPE_OPTION_CAP = 32` chroni enumerację (L19).
6. **C3 `syncStationKind`** — `stationBaseTypes` zapamiętuje bazę i cofa typy
   pod progiem; zgodne z CR 205.1.

Znalezione drobiazgi (naprawione w tej sesji, nie blokujące):

- `legalActivatedAbilities` — zdublowana linia
  `if ((object.equipment.equip ?? 0) > mana) continue;` w gałęzi equip
  (kopiuj-wklej z M101/B1; bez skutku funkcjonalnego).
- Sonda liczy `manaChanged` z pól `players[i].mana|manaPool`, ale detektor
  używa go wyłącznie razem z `costSignature.mana` — bez uwag.

## Podsumowanie wykonania

- **E0** audyt PR #55: bez zastrzeżeń merytorycznych (sonda, mostek, A1–A4,
  wycena A/B/D, C3); jeden drobiazg kosmetyczny — zdublowany warunek w gałęzi
  equip — naprawiony w E3.
- **E2** sonda `noop` w modalach: `data-option-key` na przyciskach opcji
  (`renderChoiceRequest`), wspólny helper `clickProbed` dla panelu i modala,
  `source: 'panel'|'modal'` w rekordach, bramka „opcji rezygnacji" w modalu,
  rozbicie sond w raporcie pokrycia. Testy: detektory (+4), UI modala (+1).
- **E3** bramki U9/A2 w silniku: `abilityEffectIsNoOp` (predykaty po
  `effect.type`) — `untap_permanent` (Rustvine Cultivator), `tap_permanent`,
  `cant_block`/`cant_be_blocked` (Coralhelm Guide), `add_counter <= 0`,
  `grant_keywords…`. Anty-over-fix: `onNthResolve` + koszt o własnej wartości
  (Panic Spellbomb zostaje). Test RED→GREEN (11; bez bramki pada 6).
  Przy okazji naprawione dwa MARTWE testy `real-cards-batch32` (L21).
  Klasa „licznik bez skutku" w katalogu nie występuje (CR 122.1b).
- **E4** weryfikacja mutacyjna ujawniła dwa braki NARZĘDZIA (najcenniejszy
  wynik etapu): pomiar tylko klikniętej oferty → `scanOffers` (całe okno,
  dedupe, limit 600) oraz koszt „Remove a counter" liczony jako skutek →
  `costCounterPaid`. Po poprawkach: mutacja = 9 zgłoszeń, naprawa = cisza;
  macierz 8 partii bez zgłoszeń. Dodatkowo (reguła M99) odrzucenia komend
  zbierane strukturalnie — i zdiagnozowane jako skutek ptaszka wyciszenia
  (klasyfikacja `ui`, pytanie do właściciela w handoffie). Lekcje L20, L21.
- **E5** wzorzec `docs/setup/workflows/{ci,pages}.yml` → `node tools/run-tests.mjs all`
  (ADR 0019) + strażnik `test/ci-workflow-tiers.test.js`. Push samego
  `.github/workflows/*` odbił się od GitHuba („without `workflows`
  permission") — do wgrania przez właściciela.
- **E7** (po rozstrzygnięciu właściciela): semantyka ptaszka wyciszenia jest
  poprawna, a trzy odrzucenia komend z macierzy miały węższą przyczynę —
  `toggleIgnoredOption` nie przerysowywał ekranu PO przewinięciu gry
  (`recheckAutoPass`), więc gracz klikał panel z minionego okna, a ruchy bota
  z przewinięcia nie trafiały do modala „Rozgrywka". Fix: `autosave → rerender
  → showBotMoves` (jak `playDirect`), strażnik w `test/choice-ignore.test.js`,
  weryfikacja żywa (3 odrzucenia → 0; macierz `--tick-rate 0.3` czysta).
  Lekcja L22.
- **E6** dokumentacja: `PROJECT_STATE.md` (M104), `TESTER_STOLU.md` (oś 4 +
  reguła M99), `LESSONS.md` (L20, L21), `HANDOFF_2026-08-16-m104.md`.

Stan końcowy: **1923/1923**, build 51 modułów / 1725.2 kB, benchmark szybki
heuristic 58,2% / 92,1% (0 niedokończonych). Pełne B0 — na komendę właściciela.
Wszystko wypchnięte na `arena/01a00b7e-mtg` poza `.github/workflows/*`
(blokada uprawnień App-a; wzorzec czeka w `docs/setup/workflows/`).
