# PLAN 2026-10-20 — PMSSB-68: amass (Army) w wycenie bota

**Zlecenie właściciela (2026-10-20):** kolejne pętle PMSSB; mechaniki wybrane z pomiaru katalogu
(`createCardRegistry().all()`, typy efektów z pól `effect`/`effects`/`then`/`else`/`elseEffect`, 188 typów)
× rejestr `docs/PMSSB.md`. Rodziny bez wiersza w rejestrze i z wyceną płaską lub niespójną między ścieżkami.

## Wybór rodziny (krok 2 procedury)

- `amass` — 2 karty w katalogu (Dunland Crebain: ETB „amass Orcs 2”; Toll of the Invasion: czar „amass Zombies 1”),
  obie w taliach benchmarku (`srodziemie`, `ravnica`). Brak wiersza w rejestrze.
- Dowód niespójności (L41): ścieżka ETB (`ETB_EFFECT_BONUS.amass`) = stała **6** dla każdego N;
  ścieżka czaru (`cast_spell`, ok. `heuristic-bot.js:11494`) = **6 + 3·N** (9 dla N=1), bez względu na armię.
  Zapis „amass-cast9-vs-ETB6 (pre-existing!)” stoi w §PMSSB-6 („Forwardy OUT”, pkt 5) jako forward — ta pętla go zamyka.
- Odrzucone w tej fali (następne pętle): initiative (`take_initiative`, 3 karty, flat 6, bot nie czyta
  `initiativePlayerId`) → PMSSB-69; przemiana DFC (`transform`, 7 kart, bot pomija w triggerach
  „silnik-no-op”) → kandydat PMSSB-70 po sprawdzeniu, czy wycena flipu ma wpływ na decyzje.

## Problem (PRZED) — pomiar `tools/pmssb68-amass-sonda.mjs` (`.arena/pmssb68-przed.txt`)

| Karta | brak armii | armia 1/1 | armia 3/3 |
|---|---|---|---|
| Dunland Crebain (ETB amass 2) | 73.4991 | 69.8991 | 69.8991 |
| Toll of the Invasion (cast amass 1) | 59.0000 | 59.0000 | 59.0000 |

- **F1 (armia ignorowana):** wynik nie zależy od tego, czy mam Armię do podrośnięcia. Dla Dunlanda obecność
  armii obniża wynik o stałą −3.6 (efekt uboczny innej części wyceny), zamiast odzwierciedlać, że dwa liczniki
  na istniejącym stworze są warte mniej niż nowe ciało.
- **F2 (rozmiar armii ignorowany):** armia 1/1 i 3/3 dają ten sam wynik, choć dodanie dwóch liczników do 3/3
  jest wartościowo inne niż do 1/1 (wartość licznika zależy od ciała gospodarza, jak w `counterHostValue`).
- **F3 (N ignorowane w ETB):** flat 6 dla N=2 (Dunland) i tyle samo dla każdego innego N.
- **F4 (L41, dwie ścieżki, dwie formuły):** cast = `6+3N`, ETB = `6`. Ta sama mechanika, dwie wyceny.
- **Anty-over-fix (M429 c):** najsłabszy realny wariant to „brak armii, N=1” (nowe 1/1). Nowa wartość
  musi być co najmniej tak samo ważna jak dawne 9 w tym wariancie (pin, nie tylko kierunek).

## Cel (model, jedna miara)

`amassValue(view, effect)` — jedna funkcja dla ETB, czaru i zdolności (L41):
- jeśli mam Armię na polu: `counterEffectValue(view, armia, '+1/+1', N)` — najlepsza z armii (ta sama
  miara co `add_counter`; `resolve_amass_choice` już wybiera najmocniejszą);
- w przeciwnym razie: `tokenBodyValue` dla tokena N/N (ta sama miara co `create_token`, bo amass bez armii
  tworzy 0/0 Army z N licznikami = ciało N/N).

Brak nowych pokręteł (cel: 0 pokręteł, jak w PMSSB-2/4/11/12). Wartości liczone z istniejących funkcji.

## Kroki (wzór: procedura PMSSB 0–7)

0. Ten plan (commit przed kodem).
1. POMIAR PRZED: `tools/pmssb68-amass-sonda.mjs` (tabela wyżej; zapis `.arena/pmssb68-przed.txt`).
2. AUDYT: F1–F4 wyżej. Kontrole procedury: (a) L41 — ETB i cast liczą to samo (pin); (b) koszt many nie
   zmienia się (amass nie ma kosztu poza czarem); (c) anty-over-fix — wariant „brak armii, N=1”.
3. IMPLEMENTACJA: `amassValue` w `heuristic-bot.js` (jeden helper, obok `tokenBodyValue`/`counterEffectValue`);
   wpisy `ETB_EFFECT_BONUS.amass` i gałąź `effect.type === 'amass'` w cast_spell przepięte na helper.
   Bez zmian w silniku (`effects.js` amass nie jest ruszany).
4. TESTY: `test/audyt-pmssb68-amass.test.js` — RED przed zmianą (F1/F2/F4 czerwone), GREEN po; pin
   anty-over-fix; pin pokrętła-sterują (ETB = cast dla tej samej armii); mutacje (przywrócenie `6+3N`).
5. EWALUACJA: `bot-scoring-snapshot` → dump diff (`--dump`); jeśli zmiana wyboru, atrybucja i świadoma
   regeneracja fixture z uzasadnieniem; `tie-audit`; lustro (`mirror-eval`) talie z amass (`srodziemie`
   vs baseline, `ravnica`); Żywy Tester — partie z tymi taliami (sprawdzenie braku `[STOP]`).
6. DOKUMENTACJA: sekcja PMSSB-68 w `docs/PMSSB.md` + wiersz rejestru (DONE) + wpis w `PROJECT_HISTORY.md`.
7. BRAMY: `npm test`, `npm run build`, `npm run test:all` (wyjście do `.arena/*.log`), push po każdym kroku.

## Ryzyka i granice (z góry)

- Skala tokenów: `tokenBodyValue` jest w jednostkach ETB/cast, które mogą różnić się od `6+3N`.
  Jeśli wycena N/N okaże się niewspółmierna do innych kart (Raise the Alarm, Dunland), zmiana idzie
  przez wspólny helper, nie przez stałą dla amass (L41).
- Wybór armii przy 2+ armiach (`pendingAmass`) nie jest modelowany w wycenie czaru — liczymy najlepszą
  armię (jak `resolve_amass_choice`).
- Subtyp `Army` vs typ tokena (`Zombie Army`, `Orc Army`): wyszukiwanie po podtypie `Army` (CR 701.47).
