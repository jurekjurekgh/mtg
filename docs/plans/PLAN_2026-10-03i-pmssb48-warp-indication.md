# Plan PMSSB-48 (2026-10-03i): Zgłoszenie A — brak oznaczenia wejścia przez Warp w rozgrywce i logu

## Kontekst (wejście)

Zgłoszenie właściciela (2026-10-03):
> Karta Weftblade Enhancer. W Rozgrywka ani w Logu nie ma informacji o tym,
> że ta karta wchodzi na stół przez Warp. Powinna być inna informacja niż przy
> normalnym wejściu.

## Diagnoza (sonda `tools/probe-a-warp-log.mjs`)

Sonda porównuje zdarzenia po `cast_permanent` (6 landów) vs `warp_card` (3 landy):

- Oba warianty emitują ten sam ciąg zdarzeń: `permanent_cast` →
  `permanent_entered_battlefield` → `spell_resolved` → trigger ETB.
- Zdarzenie `permanent_cast` NIESIE wpis `object.warped: true` (pole w
  obiekcie stosu widoczne w evencie, ustawiane w `spells.js` przy rzucie za
  warp), ale warstwa prezentacji (`session.js`/`render.js`) nie czyta tego
  pola — opis w logu brzmi identycznie jak zwykły rzut.
- Permanent po wejściu ma ustawione znaczniki warp (`warpReady: false`,
  `warpedAtTurn: <n>`) – silnik poprawnie kolejkuje opóźniony trigger
  wygnania w kroku końcowym; ale PlayerView permanentu NIE ma badge/etykiety
  „Warp", więc kafelek też nie odróżnia wejścia przez warp.

Dodatkowo zgłoszenie B (Station po 3 tapach nie oferuje dalszych aktywacji):
sondy `probe-b*` dowiodły, że silnik generuje poprawne oferty (Emissary Escort
z dynamiczną mocą i Warmaker Gunship jako artefakt-stwór po obsadzeniu są
poprawnie widziane jako kandydaci `creature`). Przyczyna leży w UX
priorytetu: po aktywacji zdolności sorcery na stosie gracz musi oddać
priorytet (pass), żeby zdolność się rozstrzygnęła. Bez tego silnik nie oferuje
KOLEJNYCH aktywacji (reguła CR 117 — sorcery tylko przy pustym stosie).
To nie jest błąd silnika, tylko brak wyraźnego wyróżnienia stanu w UI
(priorytet przy niepustym stosie, pass jest wymagany). NIE jest to luka w
silniku i nie wymaga zmian kodowych (ADR 0022 §4, kod na zapas) —
pozostawiamy jako ulepszenie UX przy innej okazji.

## Naprawa PMSSB-48 (generyczna, ADR 0002)

1. **Log (`src/table/session.js`):** gałąź `permanent_cast` sprawdza
   `event.manaCost == event.object?.warp?.cost + event.object?.warp?.colors?.length`
   i znacznik `warped` w obiekcie — dopisuje „(za Warp)" do linii rzutu w
   Rozgrywce (analogicznie jak istniejące „z kickerem", „za darmo" itp.).
2. **PlayerView (`src/engine/game-state.js`):** stała „czy wszedłem przez warp"
   (`object.warped === true`) przenoszona do widoku jako pole `enteredViaWarp`
   na stałe (publiczny fakt; do wyświetlenia na kaflu w UI).
3. **Kafelek (`src/table/render.js`):** jeśli `enteredViaWarp` prawda, badge
   „Warp" obok nazwy/typu — identyczny wzorzec co `warp` już istnieje w
   słowniku etykiet (L6276).

## Etapy

- [x] Etap 0 — sonda potwierdza brak oznaczenia, `warped: true` jest w evencie
- [ ] Etap 1 — log dopisuje „(za Warp)" przy permanent_cast
- [ ] Etap 2 — PlayerView wystawia `enteredViaWarp` dla permanentu po warp
- [ ] Etap 3 — kafelek/render pokazuje badge „Warp"
- [ ] Etap 4 — piny W1–W3 w `test/pmssb48-warp-indication.test.js`
- [ ] Etap 5 — mutacja (cofnij znaczenie → piny RED)
- [ ] Etap 6 — bramki: fast, build, event-contract-audit
- [ ] Etap 7 — docs (PMSSB §48, HISTORY, handoff)

## Piny

- W1: rzut za Warp emituje `permanent_cast` z `warped: true`, a opis w logu
  zawiera napis „Warp" (test przez event opis w describeEvent).
- W2: PlayerView permanentu, który wszedł za warp, ma `enteredViaWarp: true`.
- W3: zwykły rzut (bez warpu) nadal bez oznaczenia (regresja).
