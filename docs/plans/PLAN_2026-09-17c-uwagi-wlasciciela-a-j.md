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

- [ ] **E1 (A)** — stempel publikacji i autosave w czasie lokalnym czytelnika
  (+ strażnik na format i brak UTC).
- [ ] **E2 (I, H)** — grafiki tokenów: wpisy `token_servo`/`token_treasure`
  z `imageUri` (Scryfall, ADR 0028), rewers Morph z tokenu DTK, strażnik
  „każdy token ma grafikę i wpis w rejestrze".
- [ ] **E3 (C, F, G)** — etykiety i panel akcji: kontekst karty w decyzji
  „Wartość X", nazwa (+ numer) w hoverze, ukrycie prostych zdolności many
  w „Twoich działaniach" (kreator many bez zmian).
- [ ] **E4 (D, E)** — triggery śmierci: Necrosquito (przejęty stwór) i
  Highland Game (podwójne odpalenie) — reprodukcja, fix u root cause, piny
  + mutacje.
- [ ] **E5 (J)** — wymóg ataku (Ramroller): auto-deklaracja/egzekwowanie
  w ofercie i UI, pin + mutacja.
- [ ] **E6 (B)** — wycena exploita (Silumgar Butcher): lethal albo
  opłacalna wymiana (TMC/auras), pin + mutacje.
- [ ] **E7 — integracja**: bramki finalne (`npm test`, `npm run test:all`,
  `npm run build`, regresja bota), quick 25 talii, Żywy Tester na kartach
  z A–J, dokumentacja (ENGINE_MILESTONES/PROJECT_HISTORY/HANDOFF/README),
  lekcje; pełne B0 wyłącznie na wyraźną komendę właściciela (ADR 0018).

## Ryzyka

- **E4/E5 dotykają walki i SBA** — najpierw sondy reprodukujące (jak przy
  B7-fix 1–4), potem zmiana; bez reprodukcji nie ruszamy silnika.
- **E2 to jedyny etap dodający dane katalogu** — wyłącznie tokeny (nie da się
  ich włożyć do talii), więc piny liczności talii i arkusz nie drgną.
- **E6 (bot) nie może pogorszyć benchmarku** — po zmianie mierzymy quick 25
  talii i porównujemy z 86,0% (heuristic).
- **E3 (panel akcji) jest wrażliwy na strażników UI** (M189/M198, panele
  „Twoje działania") — testy etykiet i pokrycia oferty muszą zostać zielone.
