# Handoff 2026-11-05 — zgłoszenie D: combat triki z instantów (K1 zamknięte)

## Stan

- Zgłoszenie D (Dragonscale Boon rzucany „jak tylko jest mana”) naprawione
  dla klasy K1 (trwałe liczniki statystyk z instantu). Bramka trzymania:
  `counterInstantHoldPenalty` (120) w `src/controllers/heuristic-params.js`,
  logika okien w gałęzi `cast_spell` w `src/controllers/heuristic-bot.js`.
- Dozwolone okna rzutu: cel już walczy; wróg zadeklarował atakujących,
  a cel może blokować (tapnięty tylko z odkręceniem z tego samego czaru);
  licznik domyka grę w tym ataku. Sorcery i zdolności aktywowane bez zmian.
- Roadmapa audytu K1–K6 i wyniki pomiarów: `docs/plans/PLAN_2026-11-05-d-combat-tricki.md`.

## Dowody

- `test/zgloszenie-d-dragonscale-okno.test.js` — D/1–D/5, 5/5; mutacja
  (kara 120→0) przywraca błąd.
- Pakiet pokrewny 103/103; `npm test` 9981/9981; build 77 modułów / 5707,4 kB;
  `npm run test:all` 10249/10249.
- Commity: plan `660146b`, naprawa K1 `fcb8a83` (gałąź `arena/5d931b5a-mtg`, PR #179).

## Następne kroki (kolejne sesje, po kolei)

1. Diplomatic Relations (`pump + damage_from_target_power`): potwierdzona
   luka — bot rzuca w podtrzymaniu (oferta 11). Bramka okna dla ugryzienia.
2. K4: removal i obrażenia z instantu (okna odpowiedzi, rzuty w twarz).
3. K5: kontrczary. K6: dobieranie, tokeny, tutorzy, prewencje (Fog).

Sonda audytowa: `.arena/checkpoint/d-audit-probe.mjs` (podtrzymanie, wolna
mana — rzut = luka). Bez scalania PR bez decyzji właściciela.
