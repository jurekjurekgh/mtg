# PLAN 2026-09-16a — Challenge: brązowa odznaka wyłapywacza (5 bugów vs MtG)

Wyzwanie właściciela (2026-09-16): przejrzeć karty i mechaniki, znaleźć
i naprawić 5 UNIKALNYCH błędów/uproszczeń vs zasady MtG. Twardy wymóg:
CR i rulings sprawdzane ONLINE (mtg.wiki / Scryfall), nie z pamięci
treningowej — przed każdą zmianą.

## Metoda (Sherlock)

1. Zbierz kandydatów: oznaczone uproszczenia w kodzie + mechaniki złożone
   (koszty, timing, warstwy, triggery, walka, wygnanie, kopiowanie).
2. Per kandydat: (a) kod + karty z katalogu, które go potrzebują (bez karty
   = brak dowodu, odrzuć); (b) cytat CR/rulingu ONLINE; (c) repro RED;
   (d) fix root-cause; (e) GREEN + mutacja (L13).
3. Każdy bug: osobny test-strażnik, wpis w ENGINE_MILESTONES (jak M57/M62),
   cytat online w komentarzu koda (ADR 0030).

## Tropy (E0, do weryfikacji — żaden nie jest jeszcze „bugiem")

- L1: discard losowy („at random") — czy katalog ma taką kartę i czy silnik
  nie podstawia wyboru gracza.
- L2: timing rzutu z exile (impuls: sorcery tylko w main? Vaan/plot/warp?).
- L3: „unless you pay" (Rupture Spire / Echo) — auto-pay zabrania
  dobrowolnej rezygnacji (wybór istnieje w CR?).
- L4: tokeny a triggery „dies" (CR 700.4).
- L5: kolejność warstw P/T (CR 613) — setting vs modyfikatory vs liczniki.
- L6: kontroler triggera madnessu przy odrzucie przez przeciwnika.
- L7: trample + deathtouch (lethal = 1, CR 510.1c/702.2c).
- L8: Discover/kaskada a ograniczenia timingu przy rzucie w rozstrzyganiu.
- L9: „can't be countered" + fizzle kontry po zniknięciu celu.
- L10: cumulative upkeep (wybór zapłać/poświęć).
- L11: Crew — choroba przywoływania załogowanego pojazdu.
- L12: fight + deathtouch; L13: bestow/overload/monstrosity; L14: regenerate
  (tap + zdejmij z walki + tarcza); L15: kopie (Clone tokenu?);
- L16: flashback/recast z grób a timing; L17: Faerie „when you discard
  this way" (card-data.js:7216); L18: hybrid/phyrexian (do sprawdzenia,
  pewnie OK); L19: first strike + triggery; L20: „only as sorcery".

## Mini-roadmapa

- [x] E0: tropy + plan.
- [ ] E1–E5: pięć bugów, każdy: cytat online → RED → fix → GREEN + mutacja.
- [ ] E6: bramki (`npm test`, `test:all`, build, quick) + domknięcie
      (milestone, PH, handoff, PR #123 komentarzem, lekcja przy nowej klasie).

Commity: per bug (`16a/B1` … `16a/B5`) + `16a/E6`. Gałąź ta sama (sesja).
Ryzyka: bug architektoniczny (trigggery bez okna priorytetu) — za duży na
odznakę, wtedy dokumentuj jako znane ograniczenie i bierz następny trop;
fale na fixture po zmianach silnika (procedura jak 15e/15g).
