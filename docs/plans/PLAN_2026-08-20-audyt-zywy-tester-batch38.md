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
3. Zbiór 10 znalezisk → mini-roadmapa napraw.
4. Naprawy (inkrementalne commity, każdy zielony).
5. Nowe detektory Testera (jeśli wyjdą z logów).
6. Raport audytu docs/audits/ + opis PR.
