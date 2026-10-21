# PLAN 2026-10-20h — PMSSB-71 v3: licznik +1/+1 na sobie zamiast stałej 5

Status: DONE (2026-10-20). Rejestr: `docs/PMSSB.md` §PMSSB-71 v3.

> Odstępstwo od procedury: ten plik spisano PO wdrożeniu (pomiar PRZED i RED były wykonane wcześniej, w tej samej sesji). Kolejność z `docs/PMSSB.md` (plan → pomiar → audyt → RED → GREEN → ewaluacja → dokumentacja) została zachowana co do treści, ale nie co do czasu zapisu planu.

## Cel

Zamiast stałej 5 dla licznika +1/+1 na samym sobie, który nie ma celu (wyzwalacze „gdy X wejdzie”, „gdy umrze”, „na końcu tury”, ETB z warunkiem), wycena zależy od stołu:

- ciało: 3 za licznik (jak w riot od PMSSB-71 v1, parytet L41),
- presja: `min(1, siła ataku wroga / moje życie)` × `counterPressureWeight` (6),
- przewaga liczebna wroga: `max(0, wrogie − moje) / (wrogie + moje)` × `counterBoardWeight` (2).

Neutralny stół (brak presji, brak przewagi wroga) daje samo ciało.

## Zakres

- W zakresie: licznik `+1/+1` bez celu na sobie (gałąź `ETB_EFFECT_BONUS.add_counter` z `req` puste, używana przez wyzwalacze z opłatą, „umiera”, zdarzenia lądów/artefaktów, end-step) oraz riot (wspólna funkcja `counterValue`).
- Poza zakresem (zostaje 5, do osobnej pętli): inne liczniki bez celu (quest, stun, …) i liczniki z celem (osobna gałąź 6/0).

## Pomiar PRZED

Sonda `.arena/probe-counter-nsh.mjs` na HEAD `c8f3a96`, karta Nightshade Harvester (licznik na sobie, wyzwalacz na wejście lądu wroga), wynik `.arena/pmssb71v3-pre.txt`: wycena rzutu 69,57 we wszystkich scenach z życiem 5 i 20 (stała). Faza `main1` i `main2` bez różnicy.

Ślepa uliczka (zapisane, nie powtarzać): sonda na Oreplate Pangolin nie pokazała zmiany przy zmianie gałęzi, bo jego wyzwalacz ma `another: true` (nie reaguje na własny rzut). Wartość 999 w gałęzi nie zmieniła wyniku. Dlatego karta testowa to Nightshade.

## Audyt

- L41: riot i ETB muszą liczyć licznik tą samą miarą (`counterValue`), inaczej piny riot rozjadą się z wyzwalaczami.
- Wymiar kosztu: licznik nie kosztuje many; `payMana` jest już liczony w ścieżce opłaty.
- Anty-over-fix: neutralna wartość zmienia się z 5 na 3 świadomie (wartość ciała). Nie zmieniono wag innych rodzin.

## RED → GREEN

- `test/audyt-pmssb71v3-licznik.test.js`:
  - presja podnosi licznik (RED na HEAD: 69,57 = 69,57),
  - przewaga wroga (pin, NIE RED: przechodzi też na HEAD, bo różnicę niesie część wyceny),
  - neutralny stół = wartość ciała (68,3109),
  - pokrętła `counterPressureWeight = 0` i `counterBoardWeight = 0` wyłączają kontekst.
- Stare piny przepisane z powodem (nie osłabione): `pmssb10-ogon-wave-a` (harvester 69,6 → 68,3), `pmssb10-ogon-wave-b2` (frontline-war-rager +2,25 → +1,35), `pmssb3-draw-wave-b` (Trade Route Envoy bez licznika u kolegi 72,9054 → 71,1054).

## Ewaluacja

- `npm test`: 8589/8589.
- `npm run test:all`: 8856/8856 (`.arena/pmssb71v3-testall.log`).
- Golden (`bot-scoring-snapshot`): hash bez zmian (`9017a46b8bf6298d…`). Zastrzeżenie: talie golden (`ravnica-wub`, `dominaria-brg`, `tarkir-bg`, …) nie zawierają Nightshade, Pangolina ani Frontline; Trade Route Envoy jest w `tarkir-bg`, ale hash golden (6 partii: 3 pary × 2 seedy) nie zmienił się, więc żadna wycena w tych partiach nie zmieniła się bit w bit. Golden nie jest dowodem dla tej zmiany.
- Tie-audit (`--gry=40`, 480 partii, `.arena/pmssb71v3-tie-base.json` vs `.arena/pmssb71v3-tie-now.json`): `tie_top` 12758 → 12755 (−3); akcyjne 3460 → 3459. Zastrzeżenie: zestaw benchmarku nie zawiera talii z tymi kartami, więc wynik mówi tylko o braku szerokiego regresu.
- Sparowane A/B kodu (`.arena/pmssb71v3-ab.mjs`, baza `.arena/head-v2-tree` = HEAD `c8f3a96`, talie `wiedzmin-bg` i `the-edge`, 40 seedów = 80 partii): 10 partii z rozjechanymi decyzjami; zwycięzcy p1 36 → 37, p2 44 → 43. Nie stwierdzono poprawy siły. Próba za mała na twierdzenia o sile (ADR 0018).
- Mirror-eval nie dotyczy: porównuje zestawy parametrów, nie kod (procedura PMSSB, krok 5 — do zmiany kodu używamy A/B).
- Żywy Tester: nie wykonano osobnego przebiegu; sparowane A/B obejmuje partie z tymi kartami.

## Otwarte (poza tym PR)

- Faza tury: dla tych wyzwalaczy faza nie zmienia wyceny (zmierzone). Osobna decyzja, czy licznik „w obronie” w turze wroga powinien ważyć presję mocniej.
- Liczniki inne niż +1/+1 bez celu (quest, stun, …) zostają przy 5.
- Wartość ciała licznika nie zależy od ciała gospodarza (to samo w riot).
