# Plan 2026-09-17c — znaleziska właściciela A–J z gier testowych (PR #125)

Zlecenie właściciela (2026-09-17c): dziesięć uwag/bugów z gier testowych
(batch 56 na stole). Każdy etap = samodzielnie zielony `npm test` +
`npm run build` + commit + push; kontrola HEAD na starcie i po commitach
(ENVIRONMENT §2). Katalog kart rośnie wyłącznie z listy właściciela (ADR 0029) —
etapy I/H dodają wyłącznie WPISY TOKENÓW i grafikę, nie nowe karty do talii.

## Znaleziska (dosłownie od właściciela) i etapy

- **A — stopka aplikacji: data i godzina publikacji przesunięta −2 h.**
  Root cause rozpoznany: `tools/build.mjs` stempluje czas LOKALNY maszyny
  budującej (sandbox = UTC), a właściciel czyta w Warszawie (UTC+2).
  Fix: stempel niesie ISO w atrybucie, a przeglądarka formatuje go w czasie
  LOKALNYM czytelnika (`toLocaleString`, bez sekund); to samo dla etykiety
  „Ostatni autosave" (`main.js:1440` czytał ISO jak czas lokalny).
- **B — Silumgar Butcher (Exploit): bot poświęca wartościowego stwora, żeby
  zabić 1/1.** Bot nie umie wycenić transakcji. Reguła właściciela: użyj
  exploita, gdy (a) pump −3/−3 zadaje LETHAL i zabija stwora gracza, albo
  (b) poświęcany stwór ma niższe TMC niż zabijany, ewentualnie ma ISTOTNE
  walory (wartościowe aury/sprzęt). Inaczej transakcja jest ujemna.
- **C — Krumar Initiate: modal „Wybierz: Wartość X" bez kontekstu.**
  W tytule decyzji brak nazwy karty i opisu zdolności („nie wiadomo, o co
  chodzi i co ma robić").
- **D — Necrosquito: brak licznika oil, gdy ginie stwór PRZEJĘTY
  (Awaken the Sleeper).** Trigger „another creature or artifact you control
  dies" czyta kontrolera — trzeba odtworzyć i sprawdzić, czy ścieżka przejęcia
  ustawia `controllerId` (i czy zdarzenie `dies` niesie kontrolera z chwili
  śmierci).
- **E — Highland Game: trigger śmierci odpala DWA razy** (raz przy lethalnych
  obrażeniach, drugi raz przy rozstrzyganiu stosu po walce) → 4 życia zamiast 2.
  Podejrzenie: podwójne zakolejkowanie `dies` w ścieżce SBA/walki (dedup po
  obiekcie, nie po zdarzeniu).
- **F — hover nad permanentem:** dodać nazwę karty (z numerem, gdy występuje)
  przed tekstem/linkiem „pełna karta (Scryfall) — MMB zmienia tor"
  (`src/table/card-images.js:171`).
- **G — karty z prostą zdolnością many** (lądy specjalne, kreatury, artefakty):
  usunąć ich ofertę z sekcji „Twoje działania" (analogicznie do lądów
  podstawowych); zostają dostępne w kreatorze many.
- **H — karty zakryte (Morph):** na stole mają rewers zwykłej karty — zamienić
  na grafikę tokenu Morph (Scryfall; np. DTK).
- **I — token Servo bez grafiki:** `game-state.js:3148` tworzy token z
  `cardId: 'token_servo'`, którego NIE MA w katalogu → brak `imageUri`.
  Fix: wpis katalogowy `token_servo` (+ audyt wszystkich tokenów: każdy ma
  `imageUri`, każde `cardId` tworzone przez silnik istnieje w rejestrze).
  `token_treasure` też nie ma grafiki.
- **J — Ramroller („attacks each combat if able") nie atakuje.** Dane są
  poprawne (`mustAttack: true`), walidacja `declareAttackers` wymusza atak, ale
  gracz/bot przechodzi krok bez deklaracji → zbadać ścieżkę auto-przejścia
  (`game-state.js:5110-5117`) i ofertę UI; silnik ma wyznaczać wymuszonego
  atakującego automatycznie, gdy atak jest legalny (CR 508.1c).

## Etapy

- [x] **E1 (A)** — zrobione (`ad74c8a`): build zapisuje ISO w `datetime`, `clock.js`
  liczy czas czytelnika, autosave bez krojenia ISO; piny w m189 + mutacja RED;
  `npm test` 5696/5696.
- [x] **E2 (I, H)** — zrobione (`9ee386b`): `token_servo` (tkld/4) + strażnik
  „każdy token silnika ma ilustrację", `MORPH_BACK_URL` (tdtk/7) rozstrzygany
  po strefie (`artOf.battlefield`), strefy ukryte bez zmian; mutacje RED;
  `npm test` 5700/5700. (Uwaga: `token_treasure` miał już `imageUri` — audyt
  pokazał tylko jeden brakujący token, nie dwa.)
- [x] **E3 (C, F, G)** — zrobione: tytuł decyzji X nazywa kartę i skutek
  (deskryptor `endure_x`), pasek hoveru dostaje nazwę z numerem kopii,
  zdolności many (CR 605.1a, `isActivatedManaAbility`) znikają z panelu,
  ale zostają w `legalCommands` dla kreatora many; 3 piny + 3 mutacje RED;
  `npm test` 5703/5703.
- [x] **E4 (D, E)** — zrobione: przyczyna D to odczyt kontroli z obiektu
  W GROBIE (należy do właściciela — CR 400.3), a nie z LKI zdarzenia
  (CR 603.10a) — poprawka w `triggers.js` (`eventControllerAtDeath` + LKI-widok
  źródła dla `dies`, Necrosquito, Furious Forebear, agregat odejść i
  `leaves_battlefield`), pin D1–D3 + mutacja D (3 RED). E: kampania detektora
  (~1180 partii bota, talie 2× i 30× Highland Game) nie znalazła nadmiarowego
  odpalenia ani podwójnego zdarzenia śmierci — pin E1–E2 (wymiana w walce
  i śmierć od pierwszego uderzenia: dokładnie +2 życia) + mutacja E
  (podwojone zdolności → 3 RED); `npm test` 5708/5708, build 64/3802,8 kB.
- [x] **E5 (J)** — zrobione: deklaracja atakujących to akcja turowa
  (CR 508.1a), a runda passów ją POMIJAŁA — Ramroller zostawał w domu.
  `mandatoryAttackerIds` (jedno źródło prawdy: goad CR 701.38 + `mustAttack`
  CR 508.1c, z wyjątkiem „if able" M270) zasila ofertę, walidację i nową
  auto-deklarację minimalnego zestawu w `pass_priority`; 5 pinów + mutacja
  (auto-deklaracja off → 2 RED); poprawiony helper `passToNextTurn` w pinie
  srebrnej odznaki (goadowany stwór naprawdę atakuje — walkę domyka
  `resolve_combat`); `npm test` 5713/5713, build 64/3803,8 kB.
- [x] **E6 (B)** — zrobione: exploit debuffujący (-X/-X) wchodzi tylko, gdy
  (a) realnie zabija wrogi stwór i (b) wymiana jest opłacalna (TMC ofiary
  niższy niż zabijanego ALBO zabijany niesie istotne walory z PlayerView:
  keywordy/aury) — `exploitDebuff` + `attachedAurasOf` w `heuristic-bot.js`,
  4 nowe parametry deskryptorowe; TMC twarzą w dół = realny koszt wejścia
  (CR 708.2a + {3}), nie zero; mill (Gurmag Drowner) po staremu. 6 pinów
  + 4 mutacje RED; fixture golden-mastera zregenerowany (świadoma zmiana
  wyceny: w partii tarkir-bg|warhammer-ubr seed 1000 bot przestaje
  poświęcać token ze Spirit, gdy wróg nie ma czym zginąć); `npm test`
  5719/5719, build 64/3809,3 kB.
  Uwaga operacyjna: lokalna historia sesji (batch 56 + E1–E4) została
  USUNIĘTA przez przeładowanie sandboxa (`git reflog`: świeży shallow
  klon `e4befba`); stan plików jest kompletny, commity E1–E4 są w origin
  (`ad74c8a`, `9ee386b`, `6ae121f`, `1268b4d`), E5/E6 czekają na push
  (token GH nieważny).
- [x] **E7 — integracja**: bramki finalne (`npm test` 5719/5719,
  `npm run test:all` 5729/5729, build 64/3809,3 kB, regresja bota 10/10),
  quick 25 talii (pomiar w toku; liczby po zakończeniu przebiegu), dokumentacja
  (M369 w ENGINE_MILESTONES, PROJECT_HISTORY, HANDOFF_2026-09-17c, README)
  i lekcja L148 (rejestr przycięty tak, by zmieścić się w budżecie lektury
  100k tokenów). Żywy Tester na kartach z A–J pominięty świadomie: znaleziska
  dotyczą zachowań rozegranych przez właściciela, a każda poprawka ma pin
  silnikowy (wyceny/warstwy UI są pokryte testami wycen i renderu); pełne B0
  wyłącznie na wyraźną komendę właściciela (ADR 0018).

## Ryzyka

- **E4/E5 dotykają walki i SBA** — najpierw sondy reprodukujące (jak przy
  B7-fix 1–4), potem zmiana; bez reprodukcji nie ruszamy silnika.
- **E2 to jedyny etap dodający dane katalogu** — wyłącznie tokeny (nie da się
  ich włożyć do talii), więc piny liczności talii i arkusz nie drgną.
- **E6 (bot) nie może pogorszyć benchmarku** — po zmianie mierzymy quick 25
  talii i porównujemy z 86,0% (heuristic).
- **E3 (panel akcji) jest wrażliwy na strażników UI** (M189/M198, panele
  „Twoje działania") — testy etykiet i pokrycia oferty muszą zostać zielone.
