# AUDYT — Żywy Tester po poprawkach A–F (2026-09-02, M280)

**Zlecenie:** pętla Żywym Testerem po wdrożeniu poprawek A–F (DFC, Makeshift
Mauler, Deepwood Denizen, Benevolent Blessing, Discover/noop) — potwierdzić,
że poprawki nie wprowadziły regresji na żywym stole i że znany noop Discover
(Geological Appraiser) zniknął.

**Metoda:** `docs/setup/TESTER_STOLU.md` — świeży `npm run build`
(57 modułów / 3080.2 kB), `jsdom` w `tools/table-tester`, partie
`node run-game.mjs --human <talia> --bot <talia> --seed <n> --steps 350
--profile <p> --quiet --out <plik>`; transkrypty w `/tmp/audyt-af/` (poza repo).

**Dobór talii:** talie z kartami dotkniętymi przez poprawki —
`worek-dziki` (Geological Appraiser → Discover [F] oraz Lodestone Needle —
DFC z craftem [A]), `innistrad-brg`/`innistrad-wu` (Scorned Villager,
Grizzled Outcasts, Tireless Hauler — wilkołaki [A/B]), `wiedzmin`
(Ballista — DFC [A/B]), `final-fantasy` (Balamb Garden, Jill — DFC [A/B]).

## Wynik pętli

**18 partii — 0 zgłoszeń detektorów, 0 `[STOP]`, 0 `== LIMIT KROKÓW ==`.**
Każda partia zakończyła się naturalnie (wygrana bota lub gracza).

| # | human | bot | seed | profil | detektory | koniec |
|---|---|---|---|---|---|---|
| 1 | worek-dziki | kaladesh | 705 | greedy | 0 | naturalny |
| 2 | worek-dziki | kaladesh | 504 | greedy | 0 | naturalny |
| 3 | worek-dziki | ravnica | 42 | explorer | 0 | naturalny |
| 4 | worek-dziki | mirrodin-wu | 11 | defensive | 0 | naturalny |
| 5 | innistrad-brg | innistrad-wu | 7 | greedy | 0 | naturalny |
| 6 | innistrad-wu | innistrad-brg | 11 | explorer | 0 | naturalny |
| 7 | innistrad-brg | ravnica | 22 | random | 0 | naturalny |
| 8 | wiedzmin | theros | 5 | greedy | 0 | naturalny |
| 9 | final-fantasy | worek-dziki | 9 | greedy | 0 | naturalny |
| 10 | worek-dziki | innistrad-brg | 13 | greedy | 0 | naturalny |
| 11 | innistrad-brg | wiedzmin | 17 | defensive | 0 | naturalny |
| 12 | final-fantasy | innistrad-brg | 21 | random | 0 | naturalny |
| 13 | worek-dziki | kaladesh | 705 | impatient | 0 | naturalny |
| 14 | worek-dziki | innistrad-brg | 705 | random | 0 | naturalny |
| 15 | innistrad-brg | innistrad-wu | 705 | hoarder | 0 | naturalny |
| 16 | innistrad-wu | ravnica | 33 | greedy | 0 | naturalny |
| 17 | wiedzmin | innistrad-brg | 44 | explorer | 0 | naturalny |
| 18 | final-fantasy | kaladesh | 55 | defensive | 0 | naturalny |

## Potwierdzenia osi A–F

- **F (Discover/noop):** seed 705 (`worek-dziki` vs `kaladesh`) — dokładnie
  ten sam przebieg, który w audycie batchu 52 zgłaszał 2× „Oferta pewną
  stratą: Discover — rzuć bez kosztu many" — jest teraz **czysty**. W partii
  seed 504 Appraiser wchodzi, trigger się rozstrzyga, modal „Discover —
  rzucić czy wziąć do ręki? (2 opcje)" oferuje „rzuć bez kosztu many" i „weź
  kartę do ręki"; tester rzuca znalezioną kartę za darmo (Sterling Keykeeper)
  — rzut rozstrzyga się bez fizzle. Detektor noop milczy.
- **A/B (DFC):** transformacje wilkołaków i daybound przechodzą w logu:
  „Scorned Villager przemienia się w Moonscarred Werewolf",
  „Tireless Hauler ↔ Dire-Strain Brawler" (cykl day/night),
  „Grizzled Outcasts ↔ Krallenhorde Wantons" — zdarzenia `object_transformed`
  płyną przez obserwator sesji bez wpływu na przebieg (tryb hi-gfx wyłączony
  w headless), triggery po transformie rozstrzygają się poprawnie.
- **D/E:** karty Deepwood Denizen i Benevolent Blessing nie występują w
  taliach, więc pętla ich nie ćwiczy bezpośrednio — pokryte testami
  `test/m280-uwagi-owner-a-f.test.js` (13/13) i golden-masterem bota.
  W 18 partiach bot nie deck-outował się dobieraniem (kara deck-out D).

## Skan transkryptów

`node scan.mjs` nie znalazł żadnego `undefined`/`NaN`/`null`/`[STOP]`/
`cel: ?`/`wskazuje ?`/`[object …]`. Pozostałe trafienia (217) to fałszywe
alarmy prymitywnych wzorców: „7 kart" (poprawna odmiana), „cel: X"
(poprawne etykiety celów), „?" w tytułach grup modalnych („…? (2 opcje)"),
badge „choroba" (choroba przywołania).

**Wniosek:** poprawki A–F nie wprowadziły regresji na żywym stole; noop
Discover z Geological Appraisera zniknął.
