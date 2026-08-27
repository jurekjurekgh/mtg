# Audyt wartości pakietu testów (M238)

- **Data:** 2026-08-27
- **Zlecenie właściciela:** pakiet ~3500 testów budzi wątpliwości — czy stare
  testy sprzed 50 PR-ów coś wnoszą, czy to martwy balast pisany przy każdej
  zmianie? Kruche testy „zamrożony seed" wymagają polowania na seed. Może
  wyciąć połowę / 3/4?
- **Metoda:** dane, nie wrażenia. (1) naprawa testów kruchych; (2) raport
  pokrycia `node --experimental-test-coverage`; (3) analiza redundancji.

## Fakty (stan wyjściowy)

- **424 pliki testowe / 3567 testów** (`node tools/run-tests.mjs fast`).
- **Zero testów bez asercji** — teza „wręcz nic nie testują" nie potwierdza
  się: każdy plik z `test()` ma `assert`.
- **Pokrycie CAŁEGO pakietu na `src/`:** linie **97.3%**, gałęzie **85.0%**,
  funkcje **92.0%**. To bardzo wysokie pokrycie realnej logiki gry.

## (1) Testy KRUCHE („zamrożony seed") — naprawione

Realna bolączka właściciela dotyczyła klasy testów, które grały EMERGENTNĄ
partię przy zaszytym seedzie i asertowały, że w logu PADNIE rzadkie zdarzenie
(aktywacja, token). Każda zmiana wyceny bota przesuwała rozgrywkę → polowanie
na nowy seed (konwencja L25). To NIE był guard tłumaczenia/reguły, tylko
losowej rozgrywki.

Zbadano wszystkie 18 plików z komentarzami „hunter/przelosowane/L25". Test
odporności (przesunięcie wszystkich seedów o +7/+13/+50) wykazał, że **tylko 3
były NAPRAWDĘ kruche** — reszta miała jedynie historyczne blizny w komentarzach,
a same testy są odporne (grają dowolną partię i asertują NEGATYW, albo wstrzykują
kontrolowany stan). Naprawiono 3 realnie kruche:

- **session-abilities-integration** → deterministyczny: syntetyczne zdarzenia
  `ability_activated`/`token_created` przez `describeGameEvent` (ten sam czytelnik
  co `session.log`). Guard MOCNIEJSZY (mutacyjnie 4/6 fail gdy tłumaczenie
  zepsute; stary łapał tylko „coś się wydarzyło"). Commit M238/1.
- **morph-label** → deterministyczny: stan z `createGameState`, obrót morpha
  przez engine, etykieta przez `describeGameEvent`. Seed-niezależny, mutacyjnie
  RED. Commit M238/2.
- **session-bot-pausa „bug B"** → SAMONAPRAWIALNY: szuka w locie seeda
  dojeżdżającego do pauzy bota (integracyjny test pętli pauz — celowo emergentny,
  ale bez ręcznego huntera). Odporny na przesunięcie +50. Commit M238/3.

Efekt: **koniec ręcznego polowania na seedy** przy przyszłych zmianach bota.

## (2) Raport pokrycia — gdzie są realne luki

Pliki `src/` poniżej 80% linii (jedyne warte uwagi):

| Plik | Linie | Powód |
|---|---|---|
| deck-store.js | 60.8% | IndexedDB — nietestowalny w jsdom (I/O przeglądarki) |
| main.js | 69.9% | bootstrap UI (wiązania DOM) — trudny do testu jednostkowego |
| deck-builder.js | 71.7% | UI kreatora talii (część ścieżek DOM) |
| aggro-bot.js | 75.6% | przeciwnik TESTOWY (benchmark), nie produkt |
| mana-cost.js | 77.2% | helper — rzadkie gałęzie kosztów |

**Rdzeń silnika (effects/spells/triggers/game-state/combat/state-based) ma
96–98%+ linii.** Reguły gry są gęsto pokryte — to jest realna wartość, która
łapie regresje przy każdej zmianie `src/engine/`.

## (3) Redundancja — wniosek

Pakiet NIE jest „balastem". Wysokie pokrycie (97%) oznacza, że testy realnie
dotykają kodu; niskie miejsca to UI/IO, których i tak nie warto ciąć (są
świadomie poza zasięgiem jsdom, ADR/ENGINE_MILESTONES). Cięcie „połowy/3/4"
usunęłoby guardy reguł gry — starość testu ≠ bezwartościowość (regresję łapie
się właśnie w rzadko ruszanych ścieżkach).

**Rekomendacja:** NIE robić rzezi. Zamiast tego utrzymywać higienę:
- nowe testy pisać deterministycznie (bez zaszytych seedów emergentnych partii);
- gdy pojawi się test kruchy — od razu przerabiać na deterministyczny/
  samonaprawialny (jak M238/1–3), a nie dopisywać kolejny wpis huntera;
- świadome UI/IO poza pokryciem zostają (weryfikowane na telefonie, nie w jsdom).

## Podsumowanie liczbowe

- Przed: 424 pliki, 3567 testów, 97.3% linii, 3 testy realnie kruche.
- Po M238: 3 kruche testy naprawione (deterministyczne/samonaprawialne),
  pokrycie bez zmian, koniec polowań na seed.
