# PLAN sesji M151 — audyt żywym testerem (role gracza)

Gałąź: `arena/01a01a7b-mtg` (PR #65).

## Zlecenie właściciela

Wciel się w rolę gracza przy pomocy Żywego Testera stołu
(`tools/table-tester/`): rozegraj partie konkretnymi istniejącymi taliami
przeciw botowi, obserwuj stół (interfejs, opcje, czary, zdolności,
interakcje, efekty, stos, tury) i zbierz **10 unikalnych błędów/usterek/
niejasności/uproszczeń/głupich zachowań bota**. Potem napraw znalezione błędy.
Jeśli jedna partia nie wystarczy — rozegraj kilka kombinacji. Z analizy logu
dodaj do Testera nowe reguły automatycznego wykrywania nowych klas błędów.
Szczególnie patrz na **nowo dodane karty** (Batch 35/36/37) — czy w prawdziwej
grze zachowują się poprawnie, czy kombinacje nowych i starych efektów są
poprawnie rozstrzygane, czy bot nie marnuje many i czarów.

## Kontekst — nowo dodane karty w taliach

- **black**: Returned Centaur (ETB mill), Liliana's Triumph (sacrifice each
  opponent), Wretched Banquet (destroy_if_least_power), Mindstab (suspend).
- **azorius**: Static Net (linked exile + powerstone), Ojutai's Breath
  (tap + dont_untap + rebound), Village Bell-Ringer (untap all), Piercing Rays
  (forecast), Palace Familiar (dies draw), Survivor of Korlis (scry z grobu).
- **green**: Satyr Wayfinder (reveal top 4 pick land), Thornhide Wolves,
  Feral Invocation (flash aura), Grizzled Leotau, Trade Route Envoy.
- **mechanicy**: Strandwalker (living weapon), Urza's Mine (tron),
  Steelfin Whale (affinity), Basilisk Gate (pump_by_gates).
- **red**: Molten Nursery (devoid colorless trigger).
- **spellslinger**: Mysteries of the Deep (draw 2/3), Omenspeaker (scry 2),
  Twiddle (tap/untap modal).
- **graveyard**: Ghoulcaller's Bell (mill both), Emerald Oryx (forestwalk).

## Metoda / kolejność

1. Uruchom tester (`npm run build` + `npm i` w `tools/table-tester`) — zrobione.
2. Rozegraj partie w kombinacjach maksymalizujących obecność nowych kart:
   `black vs green`, `green vs black`, `azorius vs black`, `mechanicy vs red`,
   `spellslinger vs green`, `graveyard vs azorius`, ewentualnie `ostrza`,
   `sojusznicy`. Różne seed-y i profile gracza.
3. Zbierz znaleziska (osi 1–5 + nowe klasy), potwierdź każde w kodzie.
4. Dodaj nowe detektory, jeśli z logu wynikną nowe klasy błędów.
5. Napraw błędy u root cause + testy regresyjne (RED→GREEN).
6. `npm test` + `npm run build` po każdym commicie; push; aktualizacja PR.

## Kryteria ukończenia

- [ ] Co najmniej 10 unikalnych znalezisk udokumentowanych z transkryptu.
- [ ] Znaleziska potwierdzone w kodzie (nie artefakty jsdom).
- [ ] Naprawy u root cause + testy regresyjne.
- [ ] Nowe reguły detektorów (jeśli nowe klasy).
- [ ] `npm run test:all` zielony; push; CI zielony; opis PR zaktualizowany.
