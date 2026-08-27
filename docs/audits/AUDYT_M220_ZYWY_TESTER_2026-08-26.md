# Audyt pętli jakości Żywym Testerem — M220 (2026-08-26)

- **Sesja:** `arena/01a03e9e-mtg` (PR #83)
- **Narzędzie:** `tools/table-tester/` na artefakcie `dist/mtg-table.html` (ADR 0011)
- **Zlecenie właściciela:** kontynuacja pętli jakości, tym razem taliami SPOZA
  benchmarku (mniej „przeczesane"), z priorytetem dla talii ze świeżymi kartami.

## Priorytet doboru talii (nowa reguła)

Dopisano do `docs/setup/TESTER_STOLU.md` regułę właściciela: audyt idzie tam,
gdzie błędy najmniej przeczesane — najpierw talie ze świeżymi kartami, potem
talie spoza `BENCH_DECKS` (próbka benchmarku jest przeczesywana w KAŻDEJ
regresji bota, więc mniej podatna na świeży błąd). `BENCH_DECKS` =
dominaria, innistrad, mirrodin, ravnica, tarkir, warhammer — wszystkie
pominięte w tym audycie.

Świeże karty (wg `git log -- decks/*.txt`): #78 (2026-08-26) dał nową talię
final-fantasy (+21), przebudował worek-basni/worek-mroczny, +1 alara/theros.
Te talie ustawiono jako gracza w pierwszej kolejności.

## Macierz 10 partii (wyłącznie talie spoza benchmarku)

| # | gracz | bot | seed | profil | wynik | detektory |
|---|---|---|---|---|---|---|
| h1 | final-fantasy | theros | 31 | explorer | Bot | 0 |
| h2 | worek-basni | alara | 14 | greedy | Bot | 0 |
| h3 | worek-mroczny | final-fantasy | 27 | defensive | Bot | 0 |
| h4 | alara | worek-basni | 6 | random (tick 0.25) | Bot | 0 |
| h5 | theros | worek-mroczny | 19 | explorer | Bot | 0 |
| h6 | worek-legend | zendikar | 8 | defensive | Bot | 0 |
| h7 | forgotten-realms | srodziemie | 23 | greedy | Gracz | 0 |
| h8 | srodziemie | wiedzmin | 12 | random | Bot | 0 |
| h9 | zendikar | worek-legend | 44 | impatient | Gracz | 0 |
| h10 | wiedzmin | forgotten-realms | 15 | explorer (tick 0.2) | Bot | 1* |

Wszystkie partie zakończone naturalnie (`== KONIEC PARTII ==`), zero `[STOP]`,
zero limitów kroków. *h10: 1 zgłoszenie detektora — okazało się fałszywym
alarmem (patrz Znalezisko 3).

## Znaleziska (3, wszystkie naprawione u root cause z testami RED→GREEN)

### Znalezisko 1 (oś 1 — bezsensowne działania bota) — ponowne osiodłanie Mounta

**Objaw (h9):** bot aktywował Saddle na Trained Arynx (Saddle 2) **3× z rzędu
w jednej turze** (17× w całej partii), tapując kolejne stwory za nic — Mount
był już `saddled` do końca tury.
**Przyczyna (L51/M179B):** `set_saddled` jest w `IDEMPOTENT_EOT_EFFECTS`, ale
strażnik `pendingTwin` łapał tylko drugą kopię NA STOSIE. Po rozstrzygnięciu
pierwszej aktywacji stan `saddled` jest na polu bitwy, a bot i tak aktywował
kolejny raz.
**Naprawa:** dla `set_saddled`, gdy `source.saddled === true` → kara −10
(poniżej passu). Flaga stanu czytana z PlayerView (ADR 0017), bez nazw kart
(ADR 0002). Anty-over-fix: pierwsze osiodłanie wciąż legalne. Commit `e362084`.
Test: `test/m219-bot-resaddle-noop.test.js`. Na artefakcie: 17→3 aktywacji,
0 ponownych osiodłań.

### Znalezisko 2 (oś 4 — detektor noop) — fałszywy alarm na obrażeniach we własną twarz

**Objaw (h10):** detektor `noop` zgłosił „Cel zdolności: Ballista Watcher
(7 opcji)" jako „jedyna zmiana to zapłacony koszt".
**Przyczyna (L18/L75):** Ballista Watcher („{2}{R},{T}: 1 obrażenie dowolnemu
celowi") wycelowany we WŁASNĄ twarz zabiera 1 życia — to SKUTEK, nie koszt.
Detektor liczył `humanLifeDelta <= 0` jako koszt NIEZALEŻNIE od tego, czy
zdolność ma koszt życiowy. Koszt {2}{R},{T} nie ma składnika `life`.
**Naprawa:** strata życia gracza jest kosztem tylko gdy `costSignature.life`.
Commit `2afac04`. Test: `test/table-tester-detectors.test.js` (M219).
To był fałszywy alarm narzędzia (L75) — sam wybór „strzel we własną twarz"
zrobił PROFIL testera (explorer), nie bot.

### Znalezisko 3 — patrz Znalezisko 2 (to samo zgłoszenie)

## Tropy sprawdzone i ODRZUCONE

- Bot repeated: Heap Gate ×4 (h10), Soulmender ×5 (h7), Release the Ants ×4
  (h5) — na RÓŻNYCH turach, sensowne powtarzalne zdolności (nie no-op).
- Adjacent „duplikaty" ROZGRYWKA (Angelic Benediction, Zoraline, Battle-Rattle
  Shaman) — poprawny multi-line render triggera (linia triggera + „wybierz
  cel"/skutek + rozstrzygnięcie), nie dubel jak land_type z M219.
- Brak placeholderów (`?`/`undefined`/`null`), surowych slugów, „0 obrażeń",
  przecieku szumu do logu.

## Weryfikacja po naprawach (L76 — tester mierzy dist/)

`npm run build` → 54 / 2722.0 kB. Powtórka h9 (17→3 aktywacji, 0 ponownych
osiodłań) i h10 (0 zgłoszeń detektora). `npm test` 3384/3384,
`node --test test/bot-benchmark.test.js` 9/9 (bez regresji siły bota).
