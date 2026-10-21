# PLAN 2026-10-20b — PMSSB-69: inicjatywa (`take_initiative`) w wycenie bota

**Zlecenie właściciela (2026-10-20):** kolejne pętle PMSSB (ręczne strojenie scoringu). Kolejna rodzina
z listy odrzuconej w PMSSB-68 (`docs/plans/PLAN_2026-10-20-pmssb68-amass.md`, „Odrzucone w tej fali”).

> **Korekta 2026-10-21 (audyt PR #168/A-3):** opis F1 poniżej to historyczna
> hipoteza i zapis dawnej implementacji, NIE obowiązująca reguła. CR 726.2 i
> 726.5 (wydanie 2026-09-25) mówią, że ponowne objęcie inicjatywy przez
> obecnego posiadacza też uruchamia venture do Undercity. PR #169 poprawił
> silnik i wycenę: ponowne objęcie jest warte bazowe 6 (bez dopłaty za
> kradzież i bez ponownej kary ekspozycji), a nie 0. Planowane F1 i pomiary
> PRZED/PO pozostają poniżej jako zapis historyczny, nie aktualna specyfikacja.
> Aktualne piny: `test/audyt-pr168-initiative.test.js` i
> `test/audyt-pmssb69-initiative.test.js`.

## Wybór rodziny (krok 2 procedury)

- `take_initiative` — 3 karty w katalogu i w talii `forgotten-realms` (inwentarz `inv2`, 188 typów):
  - Underdark Explorer (5/3 menace, koszt 5, ETB „you take the initiative”),
  - Stirring Bard (0/4 defender, koszt 4, ETB j.w.; zdolność tap: menace i haste),
  - Caves of Chaos Adventurer (5/3 trample, koszt 4, ETB j.w.; atak: eksploracja z biblioteki).
- Brak wiersza w rejestrze `docs/PMSSB.md` (martwy rejestr: `take_initiative` nie występuje w hubie jako rodzina).
- Dowód niespójności z kodem (L41 — ta sama miara dla wszystkich ścieżek, które dają inicjatywę):
  - wycena ETB = stała **6** (`heuristic-bot.js` ~2462, `take_initiative: () => 6`), niezależnie od stanu;
  - bot nie czyta `initiativePlayerId` (widok go wystawia, ~game-state 9774) ani w ETB, ani w walce;
  - silnik (`effects.js` ~4282): objęcie inicjatywy, którą gracz JUŻ ma, nie wywołuje venture
    (`changedHands === false`) — czyli zysk wynosi 0, a bot liczy 6;
  - venture do Podziemi co turę posiadacza (`triggers.js` ~4029) — wartość rośnie w czasie, flat 6 jej nie widzi;
  - utrata przy obrażeniach bojowych od przeciwnika (`triggers.js` ~3122) — ryzyko, którego bot nie wycenia.

## Problem (PRZED) — pomiar `tools/pmssb69-initiative-sonda.mjs` (`.arena/pmssb69-przed.txt`)

Hipoteza do obalenia: wynik kart nie zależy od stanu inicjatywy ani od stołu wroga (flat).

## Cel (model, jedna miara — L41)

`initiativeTakeValue(view, effect)` — jedna funkcja dla ETB/czaru (ta sama ścieżka co `amassValueOf`):
- **F1 (historyczna, błędna hipoteza — patrz korekta na górze):** jeśli `view.initiativePlayerId === me`,
  ówczesny silnik nie dawał venture (`changedHands === false`), więc plan zakładał ETB = 0.
  Obecnie CR wymaga venture, a bieżący silnik i bot liczą bazowe 6.
- **F2 (kradzież, gdy posiada wróg):** jeśli `view.initiativePlayerId` = przeciwnik, objęcie zabiera mu
  postęp i daje mój venture — dopłata `initiativeStealBonus` (pokrętło).
- **F3 (ryzyko, gdy wróg ma atakujących):** każdy stwór wroga, który może zaatakować (bez defendera,
  moc > 0, `canAttackNowGlobal`), zwiększa ryzyko utraty inicjatywy — kara `initiativeExposurePenalty`
  za atakującego, z limitem (nie schodzi poniżej 0 na składniku ETB).
- Najsłabszy realny wariant (nikt nie ma inicjatywy, wróg bez stworów, ja bez inicjatywy) =
  **dawna wartość 6** (anty-over-fix M429 c): nowe wymiary tylko dopłaty/kary, zero w tym wariancie.

Pokrętła w `heuristic-params.js` z domyślnymi wartościami i uzasadnieniem (0 = wyłączone).

## Kroki (procedura PMSSB 0–7)

0. Ten plan (commit przed kodem).
1. POMIAR PRZED: `tools/pmssb69-initiative-sonda.mjs` — trzy karty × pięć stanów (inicjatywa: brak / ja / wróg;
   stół wroga: 0 vs 2 stwory). Zapis `.arena/pmssb69-przed.txt`.
2. AUDYT: F1–F3 wyżej. Kontrole: (a) L41 — ETB przez tę samą funkcję co ścieżka czaru (pin);
   (b) wymiar kosztu czaru — koszt many nie zmienia się (karta kosztuje to samo); (c) anty-over-fix —
   wariant „nikt, wróg bez stworów” = 6.
3. IMPLEMENTACJA: `initiativeTakeValue` w `heuristic-bot.js` + klucze w `heuristic-params.js`.
4. TESTY: `test/audyt-pmssb69-initiative.test.js` (wzorzec PMSSB-68) RED→GREEN; pokrętła sterują (×0 = stare).
5. EWALUACJA: golden master (bez regeneracji = cel), tie-audit PRZED/PO, sparowany A/B (`tools/pmssb69-initiative-ab.mjs`
   HEAD vs robocze), Żywy Tester (talia `forgotten-realms` vs bot). Mirror-eval nie służy do zmian kodu.
6. DOKUMENTACJA: sekcja PMSSB-69 + wiersz w rejestrze (DONE) + wpis w `docs/PROJECT_HISTORY.md`.
7. Bramy (`npm test`, build, `test:all`), push po każdym kroku, aktualizacja PR #168.

## Poza zakresem tej pętli

- Wycena ataku dla kradzieży inicjatywy (F2 w walce: bot nie planuje ataku po inicjatywę). Odnotowane jako
  kandydat, bez pomiaru — pętla ograniczona do objęcia (ETB/czar) i jego ryzyka.
- Zawartość pokoi Podziemi (wartość konkretnych pokoi) — tylko stała na turę; nie modelujemy pokoi.
- `transform` (PMSSB-70, zapas).
