# PMSSB-71 v2 — riot: wybór pośpiech/licznik zależy od kontekstu stołu

Data: 2026-10-20. Gałąź `arena/3ce2ec34-mtg` (PR #168). Procedura: `docs/PMSSB.md`
(PMSSB = Pętla Manualnego Strojenia Scoringu Bota: ręczne określanie warunków kontekstowych,
nie jedna stała ani ważenie na dużej próbie).

## Problem

Poprzednia wersja (PMSSB-71 F1/F2) wyceniała pośpiech i licznik stałymi: pośpiech = `creatureKwHaste · moc/ref`,
licznik = wartość ciała. Wynik: bot wybierał pośpiech w każdej sytuacji.

## Pomiar PRZED

`.arena/probe-riot-ctx.mjs`, wynik w `.arena/pmssb71v2-pre.txt`: 64 sytuacje (faza main1/main2, życie
wroga 20/4, życie moje 20/5, blokery wroga 0/2, moje świeże stwory 0/2, siła ataku wroga 0/6).
Wynik we WSZYSTKICH 64: pośpiech 14, licznik 13.

## Audyt (warunki kontekstowe)

- Faza i tura: pośpiech daje atak tylko w mojej turze przed deklaracją atakujących (`main1` / `beginning_of_combat`), CR 302.6.
  Po walce albo na cudzej turze wartość pośpiechu = 0.
- Blokery wroga: każdy niezablokowany udział dzieli atak (CR 509.1a). Moje inne świeże stwory przyjmują
  część blokerów (`blockersOnMe = max(0, blokery − moje stwory)`).
- Letal: wróg bez blokerów i życie ≤ moc → bonus `riotHasteLethalBonus` (jak utrata życia wroga).
- Presja: `siła ataku wroga / moje życie`, ograniczona do 1 → licznik zyskuje `riotCounterPressureWeight · presja`.
  Przy zerowej presji licznik = dawna wartość ciała.

## Wdrożenie

- `heuristic-bot.js`: `riotHasteValue(view, body)`, `riotCounterValue(view, amount)`; gałęzie
  `grant_keyword_permanent` (haste) i `add_counter` w trybie modalnym.
- `heuristic-params.js`: `riotHasteDamageWeight` 4, `riotHasteLethalBonus` 80, `riotCounterPressureWeight` 6.
  Wagi trzymają skalę już używaną: 4 za punkt obrażeń (jak `lose_life`), 80 za letal (jak `lose_life`).
  Presja 6 to dwa razy wartość ciała 2/2, więc przy pełnej presji licznik wygrywa z pośpiechem bez letalu.

## Testy

`test/audyt-pmssb71-riot.test.js`:
- Przepisane piny stałych: L41 (różnica 5) i pokrętło (`riotHasteDamageWeight = 0` → licznik).
- RED (na kodzie sprzed zmiany, `heuristic-bot.js` z HEAD): main2 → licznik; presja → licznik; dwóch blokerów → licznik. Te 3 padają.
- Anti-over-fix (przechodzą przed i po): dwóch blokerów + dwa moje stwory → pośpiech; pusty stół przed walką → pośpiech.

## Ewaluacja

- `npm test`: 8586/8586. `test:all`: 8853/8853, golden bez zmian (talie golden nie mają Beastmastera).
- Sparowane A/B (`.arena/pmssb71v2-ab.mjs`, baza `151bd09`, talie `ravnica-rg` vs `ravnica-wub`, 40 seedów, 80 partii):
  decyzje rozeszły się w 23 partiach; zwycięzcy po obu stronach identyczni (p1 36/44 w obu drzewach).
  Próba NIE wykazuje poprawy wyniku. Zmiana jest zgodna z logiką kontekstową, nie z dowodem siły.
  Wniosek dla kolejnej pętli: większa próba (mirror per talia) przed twierdzeniem o sile.
