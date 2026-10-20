# PLAN 2026-10-20d — PMSSB-70: nieopłacona wymiana w deklaracji ataku

Zgłoszenie właściciela (PR #168, audyt remisów): remis ex aequo `ravnica-wub|innistrad-wu`
s4011 t26 p2 — bot wybiera atak `attack[81,91,108]` ALBO `attack[81,91,108,token-135]`
(oba 1033). Właściciel: „trzeba zrobić tak, żeby bot wybierał A. Wybór B jest bez sensu,
skoro nic nie daje, tylko kosztuje stwora”.

## Pomiar PRZED (`.arena/pmssb70-przed-probe.log`)

Sonda: instrumentacja tymczasowa w `scoreCommand(declare_attackers)` (cofnięta, `git checkout`).
Na pozycji s4011 t26:

- `token-135` (token 1/1), blk 1, att 1: `perAttacker = 0` — gałąź „wymiana” `power - 1`.
- `81` (2/2): 5, `91` (1/4): 4, `108` (1/4): 4 — gałąź „przeżyje i zabija blokera”.
- Wynik zestawu: 1000 (lethal przez blokery) + 33; token dokłada 0, więc B = A.

Przyczyna: wycena deklaracji sumuje wartości atakujących, a każdy z nich zakłada
zabicie TEGO SAMEGO jedynego blokera. Zabicie jest więc liczone wielokrotnie, a token
płaci za „wymianę”, która w projekcji zestawu nie daje ŻADNEGO dodatkowego zabicia
(`zabici` = 1 w obu wariantach). Projekcja potwierdza: `ginie` 0 → 1, `zabici` 1 → 1.

## Audyt (kontrole obowiązkowe)

(a) L41 — wspólna miara: zmiana dotyczy wyłącznie deklaracji ataku (`declare_attackers`);
    wycena bloku i `attack[]` nie zmieniają się.
(b) Wymiar kosztu: nie dotyczy (koszt czaru bez zmian).
(c) Anty-over-fix: wymiana, którą BLOKER ZAPŁACI za nieblokowany pierwszy atak, nadal
    jest wartością (gdy są wolne bloki). Zmiana obejmuje tylko nadmiar wymian ponad liczbę
    blokerów, które mogą zginąć (`blockers.length − przeżyjące zabójstwa`).

## Wdrożenie (planowane)

- `heuristic-params.js`: `unpaidTradeEnabled` (1 = włączone; 0 = dawna wycena) i
  `unpaidTradeLoss` (= 2, jak kara jałowego ataku `−2`).
- `heuristic-bot.js`: w pętli atakujących liczniki `survivorKillers` (gałęzie „przeżyje
  i zabija”, także first strike) i lista `tradeValues` (gałąź „wymiana”). Po pętli:
  `wolne = max(0, blockers − survivorKillers)`; wymiany ponad `wolne` (najcenniejsze
  zostają opłacone) dostają karę `−unpaidTradeLoss` na dodatek do ich wartości.
  Wynik nie zależy od kolejności atakujących (liczby i posortowane wartości).

## Testy (RED → GREEN)

`test/audyt-pmssb70-nieoplacona-wymiana.test.js`:
1. RED: s4011 t26 — decyzja bota = `attack[81,91,108]` (A), nie z tokenem.
2. Pokrętło `unpaidTradeEnabled = 0` przywraca 1033 dla B (dowód, że to ta reguła).
3. Anty-over-fix: jeden bloker, jeden atakujący-wymiana → wymiana nadal opłacona (wartość bez kary).
4. Kolejność atakujących nie zmienia decyzji.

## Ewaluacja

- golden master BEZ regeneracji (cel: bez zmian; jeśli zmiana — uzasadnić per para);
- tie-audit PO (sufit `attack` ma spaść z 12);
- mirror-eval (reguły vs off) i Żywy Tester PO — dowód, że nie psuje ogólnej gry.

## Bramy

`npm test`, `npm run build`, `npm run test:all`. Push po każdym kroku.
