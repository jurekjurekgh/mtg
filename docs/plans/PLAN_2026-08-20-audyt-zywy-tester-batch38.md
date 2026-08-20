# PLAN — Audyt Żywym Testerem: Batch 38 (2026-08-20)

## Cel

Audyt rozgrywki „z perspektywy gracza" narzędziem Żywego Testera
(`tools/table-tester/`, `docs/setup/TESTER_STOLU.md`) w sesji ciągłej na PR #65.
Wcielam się w gracza konkretną talią i rozgrywam partie przeciwko botowi —
obserwuję interfejs, oferty akcji, modale, log, zachowanie stosu/tur i nowych
kart Batch 38 w prawdziwych kombinacjach (nowe + stare karty).

Cel: zebrać **10 unikalnych błędów / usterek / niejasności / uproszczeń /
głupich zachowań bota**, naprawić je u root cause i (gdzie się da) dodać do
Testera nowe reguły automatycznego wykrywania (detektory).

## Talie z kartami Batch 38 (do audytu)

- **azorius** — Divine Offering, Fortify, Lotusguard Disciple, Weftblade
  Enhancer, Talion's Messenger (5/10)
- **green** — Colossodon Yearling, Chatter of the Squirrel, Silken Strength (3/10)
- **red** — Mysidian Elder (1/10)
- **mechanicy** — Pristine Talisman (1/10)

Matchy do rozegrania (człowiek = Batch38-talii):
- azorius vs red, azorius vs black, azorius vs green
- green vs red, green vs black
- red vs green, red vs azorius
- mechanicy vs azorius, mechanicy vs red

## Osie audytu (TESTER_STOLU.md)

1. Bezsensowne działania bota (Oś 1)
2. Kompletność informacji w logu/modalu (Oś 2)
3. Ptaszki wyciszenia auto-pass (Oś 3)
4. Oferty bez skutku / pewna strata (Oś 4, automatyczna)
5. Klasy błędów M138 (Oś 5)
6. Przeciek szumu do logu (Oś 6)

Plus: nowe karty Batch 38 — czy zachowują się poprawnie w grze, czy kombinacje
nowych+starych efektów są rozstrzygane dobrze, czy bot gra efektywnie.

## Plan commitów (każdy zielony: `npm test` + `npm run build`)

1. Plan audytu + rozpoznanie.
2. Partia 1–N (transkrypty w tools/table-tester/audyt-*batch38*).
3. Zbiór 10 znalezisk → mini-roadmapa napraw (AUDYT_BATCH38_ZYWTESTER).
4. Naprawy (inkrementalne commity, każdy zielony):
   - Z1/Z2 (log): targetCardId w delirium damage_dealt; polishPluralCount w logu.
   - Z5 (ui): kolejność trybów modalnych.
   - Z7 (ui): nazwa tokenu zamiast raw id.
   - Z6 (tester): obsługa „Rzuć za warp:".
   - Z8 (engine): no-op self-tap oferta.
   - Z3/Z4/Z9/Z10 (bot): add_counter własny stwór; damage_each_opponent
     w pętli czaru; brak ataku 0/1 bez evasion; gain_life rider Pristine.
5. Nowe detektory Testera (jeśli wyjdą z logów).
6. Raport audytu docs/audits/ + opis PR.

## Znaleziska (10) — docs/audits/AUDYT_BATCH38_ZYWTESTER_2026-08-20.md

- Z1 [log] Fear of Burning Alive „(?)" — brak targetCardId w delirium damage_dealt
- Z2 [log] „4 liczników czasu" — sztywna odmiana (session.js:788)
- Z3 [bot] Courage in Crisis buforuje stwora przeciwnika (add_counter)
- Z4 [bot] Ruinous Rampage zły tryb (damage_each_opponent w pętli czaru)
- Z5 [ui] odwrócona kolejność trybów modalnych (unshift)
- Z6 [tester] warp „Rzuć za warp:" nie łapane przez pickAction
- Z7 [ui] nazwa tokenu = raw id (token_squirrel/token_wizard)
- Z8 [engine] Sterling Keykeeper no-op self-tap
- Z9 [bot] atak 0/1 tokenem Wizard
- Z10 [bot] Pristine Talisman darmowe życie ignorowane
