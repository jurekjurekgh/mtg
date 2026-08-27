# Audyt pętli jakości Żywym Testerem — M219 (2026-08-26)

- **Sesja:** `arena/01a03e9e-mtg` (PR #83)
- **Narzędzie:** `tools/table-tester/` na artefakcie `dist/mtg-table.html` (ADR 0011)
- **Zlecenie właściciela:** 10 zróżnicowanych partii, analiza po osiach z `docs/setup/TESTER_STOLU.md`.

## Macierz 10 partii

| # | gracz | bot | seed | profil | tick | wynik | detektory |
|---|---|---|---|---|---|---|---|
| g1 | dominaria | ravnica | 42 | greedy | 0 | Gracz | 0 |
| g2 | innistrad | wiedzmin | 7 | defensive | 0 | Bot | 0 |
| g3 | mirrodin | tarkir | 13 | explorer | 0 | Bot | 0 |
| g4 | warhammer | innistrad | 5 | random | 0.25 | Bot | 0 |
| g5 | tarkir | mirrodin | 21 | greedy | 0 | Bot | 0 |
| g6 | ravnica | dominaria | 99 | explorer | 0 | Bot | 0 |
| g7 | worek-dziki | worek-mroczny | 11 | defensive | 0 | Bot | 0 |
| g8 | worek-legend | theros | 3 | explorer | 0.25 | Bot | 0 |
| g9 | zendikar | alara | 8 | random | 0 | Bot | 0 |
| g10 | final-fantasy | srodziemie | 17 | impatient | 0 | Gracz | 0 |

Dobór: 6 talii próbki benchmarku (`BENCH_DECKS`) + 4 talie i worki spoza niej,
5 profili gracza, transformy/wilkołaki (innistrad/wiedzmin), różne seedy.
Wszystkie partie zakończone naturalnie (`== KONIEC PARTII ==`), zero `[STOP]`,
zero `== LIMIT KROKÓW ==`.

## Detektory vs czytanie ręczne

Automatyczne detektory: **0 zgłoszeń** we wszystkich 10 partiach. Zgodnie
z L27/L40 (zero = „nie mam reguły na to, co się wydarzyło", nie „czysto")
transkrypty przeczytane ręcznie po osiach. Dwa znaleziska:

### Znalezisko 1 (oś 2 — kompletność logu) — DUBEL wpisu zmiany typu lądu

**Objaw (g9):** bot aktywował Unstable Frontier, a modal „Rozgrywka" i log
pokazywały ZA KAŻDYM razem dwa identyczne wiersze:
```
• Swamp staje się typem Plains do końca tury
• Swamp staje się typem Plains do końca tury
```
**Przyczyna:** `resolve_land_type_choice` emituje dwa zdarzenia —
`land_type_changed` (permanents.js:969, niska warstwa: sama mutacja typu)
oraz `land_type_choice_resolved` (game-state.js:3293, narracja decyzji) —
a `describeGameEvent` renderował OBA tym samym zdaniem (L24/L6, wariant
„dwa zdarzenia, jedna treść"). `grantBasicLandTypeUntilEndOfTurn` woła się
wyłącznie z resolve tej decyzji, więc `land_type_changed` jest zawsze
sparowany z `..._resolved`.
**Naprawa (root cause):** mechaniczny `land_type_changed` zwraca w warstwie
opisu `null` (samo zdarzenie zostaje dla determinizmu/fingerprintu i innych
konsumentów; `real-cards-batch7` sprawdza jego OBECNOŚĆ). Commit `4ed2156`.
Test: `test/m219-log-land-type-duplikat.test.js` (RED→GREEN, rewert → 2 fail).

### Znalezisko 2 (oś 1 — bezsensowne działania bota) — jałowa aktywacja co turę

**Objaw (g9):** bot aktywował Unstable Frontier ({T}: zmień typ własnego
lądu) **7× w jednej partii**, marnując tap na efekt bez korzyści, której nie
modeluje.
**Przyczyna (L3):** baza `+2` (legalne zagranie rozwijające planszę) i kara
`-2` za `become_basic_land_type` znosiły się do 0 — zdolność remisowała
z passem (0) i wygrywała po kolejności sortowania. Kara nie przebijała
premii. Komentarz przy karze mówił o „puli bezbarwnej", nieaktualnej od
ADR 0015 (pula jest kolorowa).
**Naprawa (root cause):** kara `-2` → `-8` (baza 2 − 8 = −6 < 0), więc pass
wygrywa. Reguła generyczna po TYPIE efektu (ADR 0002), nie po nazwie karty.
Komentarz poprawiony; zanotowane możliwe przyszłe usprawnienie (wycena
„zmiana typu odblokowuje rzut pod brakujący kolor" — wymaga modelu
castability po kolorze). Commit `c5e46e1`.
Test: `test/m219-bot-unstable-frontier-noop.test.js` (RED→GREEN).

## Weryfikacja po naprawie (L76 — tester mierzy dist/)

`npm run build` → 54 / 2720.7 kB. Powtórka g9 na świeżym artefakcie:
- wiersze „staje się typem": **0** (było 2× na aktywację),
- aktywacje Unstable Frontier przez bota: **0** (było 7).

`npm test` 3381/3381, `node --test test/bot-benchmark.test.js` 9/9 (bez
regresji siły bota).

## Tropy sprawdzone i ODRZUCONE (żeby następna sesja nie badała ponownie)

- Wielolinijkowe wpisy triggerów (Jyoti „trigger" + „trigger bez efektu";
  Battle-Rattle Shaman; Simian Simulacrum) — to poprawny render trigger+skutek
  w osobnych wierszach, NIE dubel.
- Nagłówek tury `T. NGraczGracz…` w transkrypcie — udokumentowany artefakt
  jsdom (brak CSS `gap`), nie błąd UI (TESTER_STOLU „Ograniczenia").
- Brak placeholderów (`?`/`undefined`/`null`), brak surowych slugów w AKCJE/LOG,
  brak przecieku szumu (`przygotowuje manę`/`— faza —`) do logu gracza (oś 6),
  brak „0 obrażeń/zerowy wynik", brak akcji wyciszalnej bez ptaszka (oś 3).
