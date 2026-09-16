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
- [x] E1/B1 (`465e0e4`): exploit — źródło własnym kandydatem + trigger LKI
      przy samopoświęceniu (CR 702.110, VOW Notes). MARTWE z E0: G1 (brak
      silnika+kart), G4 (set+add OK, brak 7e), G5 (brak silnika+kart),
      G6-timing (sorcery-window OK), G7-timing (rzut bez czeku OK), G6-róg
      (flashedBack redirect OK), echo-control (tylko kradzieże do EOT —
      nietestowalne).
- [x] E2/B2 (`d987fa4`): Talion's Messenger — dwa triggery, refleks
      reflexive_discard (cel po odrzucie, okno odpowiedzi, brak odrzutu =
      brak licznika; Scryfall ruling 2023-09-01).
- [x] E3/B3 (`2421ec0`): land drop z exile w oknie impulsu (Gila Courser;
      CR 701.18a/b „from the zone it's in").
- [x] E4/B4 (`f082bef`): speed przy utracie życia, nie tylko damage
      (mtg.wiki/Speed) — jeden hook life_changed; lekcja L146. MARTWE:
      renown-inline (brak Stifle — nietestowalne), shroud/changeling
      (audytowane), manifest/embalm/buyback/landfall/fail-to-find (poprawne),
      koszty ataku/fear/devotion/monarch (luki), intimidate (OK).
- [x] E5/B5 (`30e4991`): modalne cele przez validateTargets przy rezolucji
      (CR 608.2b) — tryb stały + gałąź per-cel „up to N" (regresja 7 testów
      naprawiona w B5). MARTWE: landwalk (brak zmian podtypów), menace,
      bestow-fizzle, fateful-hour, domain, phyrexian (obie ścieżki),
      forecast, unearth, kopie-707.2, trample-deathtouch (poprawne).
- [x] E6: bramki (`npm test` 5610/5610, `test:all` 5620/5620, build
      63/3742,6kB, quick 672: heuristic 82,0%) + domknięcie (milestone
      M361, PH, lekcja L146).

Commity: per bug (`16c/B1` … `16c/B5`) + `16c/E6`. Gałąź ta sama (sesja).
Ryzyka: jak w 16a/16b (bug architektoniczny → dokumentuj i bierz następny).
