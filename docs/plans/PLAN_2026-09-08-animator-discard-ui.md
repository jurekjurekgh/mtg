# Zgłoszenia właściciela A/B — Animator / wybór wielu odrzuceń

Kontynuacja tej samej sesji/PR106 OPEN na arena/01a0805b-mtg, baza d7421ec.
Audyt105 i batch54 już ukończone, nie ponawiać. Brak nowych kart.
Baza: fast4928,all4938,build60/3428,4kB,CI34262915990 SUCCESS.

## Rozpoznanie przed kodem

A: efekt animate_linked zapisuje state.linkedAnimations(sourceId,targetId),
ale PlayerView i overlay nie pokazują związku. Źródło odejścia już usuwa
animację. Badge powinien pochodzić z żywego związku, nie z wydrukowanego
tekstu/statystyk5/5 ani testu po ID karty; bez ujawnienia zakrytego źródła.

B: spell.additionalCost.discardCards=2 tworzy pendingDiscardChoice(count=2).
Oferty resolve_discard_choice niosą po jednej karcie, a singleTargetPlanOf
robi z nich wybór jednej. Silnik przesuwa kartę i ponawia decyzję count=1.
Potrzebny wspólny multiselect na całą pozostałą liczbę oraz komenda z listą
kart walidowaną W CAŁOŚCI przed pierwszym ruchem. Zachować stary pojedynczy
kształt dla replayów/botów; nie enumerować kombinacji ręki. Nie zmieniać
legalności rzutu ani odkładać kosztu na resolution. Zamknięcie pickera nie
odrzuca części zaznaczenia ani nie cofa już opłaconej many/rzutu — wraca się
do nadal oczekującej decyzji. Koszt po zatwierdzeniu jest nieodwracalny.

## Źródła sprawdzone online 2026-09-08 przed kodem

- https://api.scryfall.com/cards/named?exact=Skilled%20Animator&set=cmr
  „...with base power and toughness 5/5 for as long as this creature remains
  on the battlefield.” Zgodne z istniejącym snapshotem docs/cards.
- https://api.scryfall.com/cards/named?exact=Cathartic%20Reunion&set=2xm
  „As an additional cost to cast this spell, discard two cards. Draw three cards.”
- https://mtg.wiki/page/Discard — CR701.9a/b (wydanie2026-08-07):
  „To discard a card, move it from its owner’s hand to that player’s graveyard.”
  Domyślnie gracz odrzucający wybiera karty. UI nie zmienia właściciela wyboru.

## Etapy — osobne zielone commity/pushe

- [x] P0: rozpoznanie, źródła i ten plan wypchnięty przed kodem.
- [x] A: test prawdziwej animacji→PlayerView→render; badge „animowany przez
  Skilled Animator”, usunięcie po odejściu źródła/hosta, FoW i brak badge'a
  dla niepowiązanego5/5. Fast + build → commit/push.
- [ ] B: testy RED odrzucenia dwóch kart/invalid atomowo/madness/efekt vs
  koszt; PlayerView z liczbą dla decydenta, jeden wspólny picker z licznikiem
  i zatwierdzeniem dokładnieN, bez efektu zaznaczeń/anulowania. Test wiring
  rzeczywistego main, nie tylko helperów. Fast + build → commit/push.
- [ ] C: pełne all, golden bez zmiany wag/pinów, weryfikacja zbudowanego
  stołu (jsdom, scenariusz obu zgłoszeń), dokumentacja/handoff/PR/CI.

Ryzyka: madness czeka do końca całego odrzucenia; nie wznowić pendingSpell
ani pendingAbilityActivation po pierwszej zN kart; odrzucanie efektu przy
krótkiej ręce i opcjonalny wybór Nightsnare nadal poprawne. Nie odsłaniać
obcej ręki osobie nieuprawnionej. Pojedyncze odrzucenie pozostaje proste.

A ukończone:7/7 testów, fast4935/4935,build60/3429,1kB.
Badge czyta publiczny żywy link; source face-down ma opis bez nazwy.
