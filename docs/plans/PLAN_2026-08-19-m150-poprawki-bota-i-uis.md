# PLAN sesji M150 — nowe uwagi właściciela (bot + UI)

Gałąź: `arena/01a01a7b-mtg` (PR #65).

## Uwagi z testów (2026-08-19)

- **A1-refinacja.** Poprzednio: bot aktywował Treasure (mana) bez celu.
  Teraz: Bone Splinters opłacony tapnięciem Swampa, a Treasure poświęcony
  DOPIERO POTEM jako ostatnie działanie tury — wyprodukowana mana przepada
  w cleanup (CR 500.4). To wciąż marnowanie zasobu, choć inny wariant
  („coś w ręce istnieje”, ale bot i tak tego nie zagra).
- **A.** Battle-Rattle Shaman (trigger „you may have target creature get
  +2/+0” na początku combat) — bot wybiera WROGIEGO stwora zamiast własnego.
- **B.** Przydział obrażeń bojowych: atakujący 2/2 blokowany przez dwóch
  stworków, gracz NIE może w ogóle przydzielić obrażeń drugiemu blokerowi
  (reguła kolejności CR 510.1d pilnowana na sztywno, a nie ma jak zmienić
  KOLEJNOŚCI blokerów — czyli ustawić śmiertelny cel pierwszego).
- **C.** Jeskai Devotee — (1) bot aktywuje zdolność zamiany many bez potrzeby
  (tapuje ląd, manę marnuje); (2) log/UI nie podaje, JAKĄ manę wyprodukowała
  ta zdolność („dodanie many do puli” bez kolorów).

## Rozpoznanie (fakty z kodu)

- A: `src/controllers/heuristic-bot.js` — `resolve_trigger_target` wycenia
  KAŻDY trigger celowany jako wrogi (cel wroga = +30+value, własny =
  −20−value). Battle-Rattle Shaman (beneficial pump +2/+0) dostaje więc cel
  wrogi. Root cause: brak rozróżnienia „trigger przyjazny” (pump/licznik na
  własnym) vs „wrogi” (obrażenia/usuniecie). Rozwiązanie generyczne (ADR 0002):
  komenda `resolve_trigger_target` niesie flagę `friendly` wyliczaną
  z deskryptora efektu triggera (zero nazw kart).
- B: `src/table/choice-request.js` — `renderDamageWizard` — `canIncrease(idx)`
  wymaga `amounts[idx-1] >= lethal` dla wcześniejszego blokera, a KOLEJNOŚĆ
  blokerów jest sztywna (kolejność deklaracji). Brakuje możliwości zmiany
  kolejności (CR 510.1c — atakujący wybiera kolejność przydziału). Rozwiązanie:
  przyciski ↑/↓ przy wierszu blokera + przebudowa wierszy.
- C1: `src/controllers/heuristic-bot.js` — gałąź `add_mana` z `net <= 0`
  (filtr koloru, Jeskai Devotee `{1}: Add {U}/{R}/{W}`) dostaje tylko
  `score -= hasPlayable ? 2 : 12`; z ręką „coś jest” wynik ~0 i bot remisuje
  z czekaniem → aktywuje na zapas. Kara za bezcelowe aktywowanie musi być
  mocniejsza (mana i tak przepada, a `oncePerTurn` blokuje późniejszy użytek).
- C2: `src/engine/abilities.js` — `ability_activated` niesie `effectTypes`,
  ale nie kolory `add_mana`. `src/table/session.js` loguje tylko „dodanie many
  do puli”. Rozwiązanie: w evencie `ability_activated` dodać `manaColors`
  (unia kolorów z efektów `add_mana`), w logu dopisać „({U}, {R} lub {W})”.
- A1-refinacja: `add_mana` (Treasure sacrificeSelf) — `unlocksSomething`
  patrzy tylko „czy istnieje karta w zasięgu liczbowo”, nie „czy bot JĄ
  zagra”. Kara/wartość ma uwzględniać, że wyprodukowana mana musi być faktycznie
  wydana w tej turze; poświęcenie trwałego zasobu na manę-w-miot to strata.

## Kryteria ukończenia (commit po commit, zielone: `npm test` + `npm run build`)

- [x] A: trigger przyjazny (pump/licznik) celuje WŁASNY stwór; wrogi —
      przeciwnika. Test regresyjny (Battle-Rattle Shaman → własny stwór).
      Rozwiązanie: `resolve_trigger_target` niesie `friendly` (deskryptor
      efektu, ADR 0002); bot odwraca cel dla przyjaznych pumpów.
- [x] B: w wizardze obrażeń można zmienić kolejność blokerów (↑/↓) i zabić
      „pierwszego wg nowej kolejności”. Test (choice-request-ui).
- [x] C1: `add_mana` net<=0 bez realnego odblokowania → kara mocniejsza
      (bot nie aktywuje Jeskai Devotee na zapas). Test.
- [x] C2: log aktywacji `add_mana` podaje kolory many. Test (session log).
- [x] A1-refinacja: bot nie poświęca Treasure (mana-źródła), gdy manę i tak
      nie wyda — test po opłaconym czarze (tapnięty Swamp). Nota: wariant
      „float-and-waste PO rzucie czaru” (bot ma w ręce coś w zasięgu, ale
      tego nie zagra) to ograniczenie sekwencyjnego planowania heurystyki —
      m149 A1 + tutejsza kara pokrywają główne przypadki; pełne dogranie
      sekwencji („sprawdź, czy bot JĄ zagra”) do osobnej pętli jakości.
- [x] `npm run test:all` zielony (2390/2390); push; CI zielony.
