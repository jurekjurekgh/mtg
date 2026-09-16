# PLAN 2026-09-16b — Challenge: srebrna odznaka wyłapywacza (5 bugów vs MtG)

Wyzwanie właściciela (2026-09-16, ciąg dalszy Brązu M359): kolejne
5 UNIKALNYCH błędów/uproszczeń vs zasady MtG. Twardy wymóg jak w Brązie:
CR i rulings sprawdzane ONLINE (mtg.wiki / Scryfall), nie z pamięci
treningowej — przed każdą zmianą.

## Metoda (Sherlock, jak 16a)

1. Zbierz kandydatów: tropy E0 z 16a (L1–L20, nietknięte) + nowe z kodu.
2. Per kandydat: (a) kod + karta z katalogu (bez karty = odrzuć);
   (b) cytat CR/rulingu ONLINE; (c) repro RED; (d) fix root-cause;
   (e) GREEN + mutacja (L13).
3. Każdy bug: osobny test-strażnik, wpis w ENGINE_MILESTONES (M360),
   cytat online w komentarzu kodu (ADR 0030).
4. Unikalność vs: M359 (cleanup 514, mentor/backup/delirium 603),
   milestone'y M1–M358, audyty PR, seria 15, łowy 2026-08-11.

## Tropy (E0 — do weryfikacji)

Z 16a (priorytet: mechaniki z kartą w katalogu):
- S1: trample + deathtouch (lethal = 1, CR 510.1c/702.2c).
- S2: discard „at random" (wybór gracza zamiast losu?).
- S3: tokeny a triggery „dies" (CR 700.4).
- S4: regenerate (tap + zdejmij z walki + tarcza — pełny pakiet?).
- S5: fight + deathtouch.
- S6: warstwy P/T (CR 613) — setting vs modyfikatory vs liczniki.
- S7: „unless you pay" — auto-pay vs dobrowolny wybór.
- S8: Crew — choroba przywoływania pojazdu.
- S9: first strike + triggery „deals combat damage" (dwa okna?).
- S10: „only as sorcery" / timing rzutów z exile.

## Mini-roadmapa

- [ ] E0: tropy + plan (ten plik).
- [ ] E1–E5: pięć bugów, każdy: cytat online → RED → fix → GREEN + mutacja.
- [ ] E6: bramki (`npm test`, `test:all`, build, quick) + domknięcie
      (milestone M360, PH, PR komentarzem, lekcja przy nowej klasie).

Commity: per bug (`16b/B1` … `16b/B5`) + `16b/E6`. Gałąź ta sama (sesja).
Ryzyka: jak w 16a (bug architektoniczny → dokumentuj i bierz następny trop).
