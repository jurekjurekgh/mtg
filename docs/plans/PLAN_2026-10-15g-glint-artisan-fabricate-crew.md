# Plan 2026-10-15g — Glint-Sleeve Artisan (fabricate) i Bomat Bazaar Barge (crew)

Zgłoszenia właściciela (tura 12):
- **K** — Glint-Sleeve Artisan: bot ZAWSZE wybiera token Servo 1/1; właściciel:
  +1/+1 na Artisanie ma większy sens w zwykłej grze. Servo ma sens dopiero przy
  kartach na ręce wymagających ofiary kreatury (lub podobnych sytuacjach).
- **L** — Bomat Bazaar Barge (Crew 3): bot tapuje 1/1, 1/1, 2/1 (moc 4, trzy
  stwory) zamiast 2/1 + 1/1 (moc 3, dwa stwory). Przyczyna: domyślny podzbiór
  załogi zaczyna od NAJSŁABSZYCH. Właściciel już raz to zgłaszał; ma być od
  największych do najmniejszych.

## Rozpoznanie

- **K:** `src/controllers/heuristic-bot.js` ≈15102 — `resolve_fabricate`:
  `tokens` = 15, `counters` = 10, na stałe. Komentarz obiecuje „preferuj tokeny,
  gdy mniej własnych stworów”, czego kod nie robi. Sygnał ofiary: w rejestrze
  `spell.additionalCost.sacrificeCreature` (Village Rites, Bone Splinters, Lash
  of the Balrog, Severed Strands) i `abilities[].cost.sacrificeCreature` na
  polu (Angel's Herald, Kheru Dreadmaw).
- **L:** `src/engine/abilities.js` ≈570 — `defaultCrewSubset` sortuje
  `powerOf(a) - powerOf(b)` (rosnąco). Ta sama funkcja liczy domyślny podzbiór
  dla saddle. Bot i kreator człowieka biorą wariant z oferty, więc jedna zmiana
  wystarcza.
- Testy przypinające starą kolejność: `test/zaloga-domyslny-podzbior.test.js`
  (E2/1, E2/7, E2/8, E2/9 — A2/A3, komentarz „chaff, nie bomba 5/5”).
  Ta zmiana świadomie je odwraca, bo właściciel wprost zlecił kolejność
  od największych.

## Decyzje projektowe

1. **K:** domyślnie liczniki (wycena 15), tokeny (8). Tokeny rosną do 20 tylko
   wtedy, gdy bot ma synergię z ofiarą: karta na ręce z kosztem dodatkowym
   „ofiara kreatury” albo własna „wyrzutnia” na polu z kosztem ofiary kreatury.
   Reguła klasy (ADR 0002), bez nazw kart.
2. **L:** `defaultCrewSubset` sortuje malejąco po mocy (stabilnie, remis = kolejność
   pola, ADR 0005). Zachłannie aż do progu daje najmniejszą liczbę stworów.
   Zmiana dotyczy też saddle (ta sama funkcja, ten sam kształt kosztu) — flaga
   w raporcie. Konsekwencja znana: przy 5/5 i małych stworach domyślnie tapowana
   jest sama 5/5 (wcześniej „chaff”). Wybór ręczny w kreatorze nadal działa.

## Zakres

1. `test/uwaga-k-l-fabricate-crew-2026-10-15.test.js` — RED: K (4 testy bota),
   L (testy oferty załogi, 1/1+1/1+2/1 i inne progi).
2. Poprawka K w `heuristic-bot.js` (wycena fabricate + helper `sacrificeSynergyOf`).
3. Poprawka L w `abilities.js` (`defaultCrewSubset` malejąco) + aktualizacja
   przypiętych testów w `zaloga-domyslny-podzbior.test.js` z opisem zmiany.
4. `npm test > .arena/tests-fast-k-l.log 2>&1` z kodem wyjścia; `npm run build`.

## Wynik (wykonanie)

- K: `d8c6148` (wycena fabricate + `sacrificeSynergyOf`). RED 3/5 → GREEN 5/5.
  K/3 i K/4 przechodziły już przed zmianą (bot brał zawsze token): strażniki
  przed nadpoprawką. Poprawka K/4: koszt wyrzutni Angel's Herald zapisany jako
  `sacrificeCreaturesByColors`, nie `sacrificeCreature` — helper czyta oba.
- L: `548ae41` (`defaultCrewSubset` malejąco + komentarz). RED 3/3 → GREEN.
  Przypięte testy E2/1, E2/7, E2/8, E2/9 zaktualizowane (intencja zachowana).
- Audyt: `npm test` 8265/8265 rc=0 (`.arena/tests-fast-k-l.log`); `npm run build` rc=0;
  `node --test test/bot-benchmark.test.js` 10/10; `node tools/benchmark.mjs`:
  heurystyka 90,6% (609/672), identycznie jak baza `255fbe8` (benchmark nie
  zawiera tych kart).

## Mini-roadmapa

- [x] Rozpoznanie obu kart i kodu (wyżej).
- [x] Commit planu.
- [x] RED testów K i L (`.arena/red-k-l.log`).
- [x] GREEN K, potem GREEN L (osobne commity).
- [x] Testy powiązane, `npm test` rc=0, build rc=0, benchmark bez zmiany.
- [ ] Push i opis PR #166 przez REST. Bez scalania.
