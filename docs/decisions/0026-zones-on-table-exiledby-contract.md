# ADR 0026: Strefy dodatkowe na stole — kontrakt `meta.exiledBy` i boksy zamiast inspektora

- **Status:** Zaakceptowana
- **Data:** 2026-08-31
- **Decydenci:** właściciel projektu (zlecenie „reforma stref”, M262)

## Kontekst

Do M262 cmentarze i wygnanie były dostępne wyłącznie przez modal
„Pokaż karty w strefach” (przycisk pod boksami graczy), a karty
„czekające” w wygnaniu (suspend/plot/impuls/rebound/madness, wygnanie
tymczasowe, wygnanie zakryte) rysowała osobna „poczekalnia” nad polem
bitwy bota. Właściciel nie akceptował tego układu: skutek widoczny w
grze (karta w grobie/wygnaniu) powinien być widoczny NA STOLE, a nie
za kliknięciem; źródło wygnania („Wygnane: Pandemonium”) jest informacją
użyteczną przy czytaniu stołu.

Kluczowy problem danych: wygnanie powstawało w ~22 miejscach silnika
i nikt nie zapamiętywał, CO wygnało kartę. Jedyna istniejąca etykieta
(`temporaryExile.byCardId`, M254/D) obejmowała wygnanie tymczasowe.

## Decyzja

1. **Trzy boksy na stole, pod ręką Bota** (kolejność od lewej):
   CMENTARZ GRACZA (czarne tło) → WYGNANIE (niebieskie tło) →
   CMENTARZ BOTA (czarne tło). Boks znika, gdy strefa jest pusta.
   Karty w rozmiarze stołowym z pełnym kontraktem kafla (hover,
   menu kontekstowe, pełny ekran) — NIE miniatury 88px. Inspektor
   stref (przycisk + modal) i poczekalnia są USUNIĘTE na stałe.
2. **Cmentarze bez etykiet grup**, kolejność przyrostowa od najstarszych
   (lewa) do najnowszych (prawa) — wprost kolejność arraya
   `state.zones.graveyard` (array push). Silnik bez zmian.
3. **`meta.exiledBy` — stempel źródła wygnania** zakładany w JEDNYM
   choke poincie zmian stref (`moveObjectDirectly`, objects.js):
   - jawny argument `opts.exiledBy` przekazywany przez witryny, które
     znają źródło (efekty, koszty, craft, plot/suspend/escape/madness/
     warp, delayed triggery);
   - auto-deriwacja dla ścieżek CR, które źródła nie przekazują:
     `temporaryExile.byCardId`, redirecty `unearthExile`/`flashedBack`,
     licznik `finality`, znacznik `exileIfDiesThisTurn` (od teraz wpisy
     `{id, byCardId}`);
   - centralny fallback `effect` → „efekt” (obejmuje stare autosave'y
     bez meta).
   Domena wartości: **cardId karty-źródła** (nazwa przez `nameOf`,
   ADR 0002), **keyword mechaniki** (`plot`, `suspend`, `warp`,
   `madness`, `escape`, `flashback`, `unearth`, `craft`, `finality`)
   albo `effect`. Self-exile (escape/craft/koszt exile) daje KARTĘ
   wyganiającą, czyli tę samą kartę (decyzja właściciela).
   `meta` istnieje **wyłącznie w exile** — opuszczenie strefy je czyści
   (CR 400.7), więc ponowne wygnanie dostaje świeże źródło.
4. **Badge'e w boksie wygnania** (kolejność): obowiązkowy
   „Właściciel: Gracz/Bot” (etykiety panelu, nie „Ty/Nieprzyaciel”),
   obowiązkowe „Wygnane: <źródło>”, opcjonalny stan (liczniki
   suspend/plot, impuls, rebound, madness, zakrycie, powrót).
   Agregacja właściciel → źródło (stabilne sortowanie). Zakryta karta
   pozostaje zamaskowana (M260/B1 — CR 406.3 zakrywa KARTĘ), ale
   badge'e są jawne — fakt, KTO wygnał, jest publiczny.

## Konsekwencje

- `PlayerView` niesie `exiledBy` we wszystkich wpisach `zones.exile`,
  także w minimalnym (zakrytym) kształcie — ADR 0017.
- `waitingExileEntries`/`renderWaitingExile` przestają istnieć;
  `waitingExileStatus` zostaje helperem statusu badge'a.
- Słowo „Unearth” trafia do SŁOWNIKA_REGUL w strażniku m212 (keyword
  mechaniki koliguje z nazwą karty — analogicznie do Treasure/Island).
- Stare autosave'y i replaye bez meta wyświetlają „Wygnane: efekt”.

**Strażnik:** `test/m262-strefy-na-stole.test.js` (10 testów: choke
point, auto-deriwacja, widok, render boksów, badge'e, kolejność,
widoczność, HTML/main.js bez inspektora i poczekalni).
