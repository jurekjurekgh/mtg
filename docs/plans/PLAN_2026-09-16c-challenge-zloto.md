# PLAN 2026-09-16c — Challenge: złota odznaka wyłapywacza (5 bugów vs MtG)

Wyzwanie właściciela (2026-09-16, ciąg dalszy Srebra M360): kolejne
5 UNIKALNYCH błędów/uproszczeń vs zasady MtG. Twardy wymóg jak w 16a/16b:
CR i rulings sprawdzane ONLINE (mtg.wiki / Scryfall), nie z pamięci
treningowej — przed każdą zmianą.

## Metoda (Sherlock, jak 16a)

1. Zbierz kandydatów: oznaczone uproszczenia w kodzie + mechaniki złożone
   (koszty, timing, warstwy, triggery, walka, wygnanie, kopiowanie).
2. Per kandydat: (a) kod + karty z katalogu, które go potrzebują (bez karty
   = brak dowodu, odrzuć); (b) cytat CR/rulingu ONLINE; (c) repro RED;
   (d) fix root-cause; (e) GREEN + mutacja (L13).
3. Każdy bug: osobny test-strażnik, wpis w ENGINE_MILESTONES (M361),
   cytat online w komentarzu kodu (ADR 0030).
4. Unikalność vs: M360 (Negate/bestow, Aura, split first-strike, Station
   LKI, ninjutsu EOC), M359 (cleanup 514, mentor/backup/delirium 603),
   milestone'y M1–M358, audyty PR, seria 15, łowy 2026-08-11.

## Tropy (E0 — do weryfikacji)

Z 16a (niesprawdzone / niedomknięte):
- G1: cumulative upkeep (wybór zapłać/poświęć).
- G2: kontroler triggera madnessu przy odrzucie przez przeciwnika.
- G3: kopie — Clone tokenu / kopia kopii.
- G4: warstwy P/T (CR 613) — setting vs modyfikatory vs liczniki.
- G5: „can't be countered" + fizzle kontry.
- G6: flashback/recast z grobu a timing.
- G7: Discover/kaskada a ograniczenia timingu w rozstrzyganiu.
- G8: Faerie „when you discard this way" (card-data.js:7216).
- G9: hybrid/phyrexian mana.
- G10: timing rzutu z exile (impuls sorcery, Vaan/plot/warp).

Rezerwa: day/night, monarch/inicjatywa/lochy, DFC, anihilator,
„only as sorcery", banding-ish, fazowanie.

## Mini-roadmapa

- [x] E0: tropy + plan (ten plik).
- [ ] E1–E5: pięć bugów, każdy: cytat online → RED → fix → GREEN + mutacja.
- [ ] E6: bramki (`npm test`, `test:all`, build, quick) + domknięcie
      (milestone M361, PH, PR komentarzem, lekcja przy nowej klasie).

Commity: per bug (`16c/B1` … `16c/B5`) + `16c/E6`. Gałąź ta sama (sesja).
Ryzyka: jak w 16a/16b (bug architektoniczny → dokumentuj i bierz następny).
