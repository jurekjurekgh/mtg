# PLAN 2026-08-22 — M175: uwagi właściciela do Death-Hood Cobra (A1–A3)

Zgłoszenie właściciela (log z Rozgrywki sprzed poprawek M173/E — dwie aktywacje
zasięgu pod rząd, ogólnikowy log, brak badge):

- **A1.** Log aktywacji nie mówi, JAKI keyword zdolność nadaje — „nadanie słów
  kluczowych do końca tury" zamiast konkretnego „zasięg".
- **A2.** Bot aktywował tę samą zdolność dwa razy POD RZĄD (drugi grant tego
  samego keywordu = zero zmiany w grze).
- **A3.** Stwór nie dostał badge z nadanym keywordem na kaflu.

## Diagnoza (root cause)

- A1: `ability_activated` (abilities.js — dwie emisje: natychmiastowa i przez
  stos) niesie `effectTypes` bez keywordów; session.js ma tylko statyczną
  etykietę per typ efektu.
- A2: wycena `grant_keywords_until_end_of_turn` w heuristic-bot patrzy na
  `recipient.keywords` (efektywne PO rozstrzygnięciu), ale nie widzi grantu
  WISZĄCEGO na stosie — a widok stosu nie eksponuje `sourceId` aktywacji.
- A3: playerView wysyła w `entry.keywords` keywordy EFEKTYWNE, a render liczy
  `grantedKeywords = effectiveKeywordsOf(viewObj) − object.keywords` — obie
  strony zawierają grant, różnica zawsze pusta. Badge grantów (m168/B) w
  realnym stole nie działał (test m168 budował `info` ręcznie, z pominięciem
  `cardInfo`).

## Kroki

- [ ] 1. Plan (ten plik) — commit.
- [ ] 2. A1: `grantKeywords` na zdarzeniu `ability_activated` (obie emisje w
  abilities.js); session.js — opis aktywacji z konkretnymi keywordami
  („nadanie do końca tury: zasięg", słownik KEYWORD_EVENT_LABELS). Test
  RED→GREEN. Commit.
- [ ] 3. A2: widok stosu eksponuje `sourceId` aktywowanej zdolności (informacja
  publiczna — ogłaszana przy kładzeniu na stos, ADR 0017); wycena grantu w
  heuristic-bot: identyczna aktywacja (sourceId+abilityIndex+kontroler) już na
  stosie ⇒ duplikat (kara jak za posiadany keyword). Test RED→GREEN. Commit.
- [ ] 4. A3: playerView liczy `entry.grantedKeywords` = efektywne − wydrukowane
  (`object.keywords` ze STANU — działa też dla tokenów/kopii bez rejestru);
  render `cardInfo` czyta pole widoku zamiast martwej różnicy. Test RED→GREEN
  (widok + badge przez buildStateOverlay). Commit.
- [ ] 5. `npm test` + build przy każdym commicie; na koniec aktualizacja
  PROJECT_STATE + opis PR #69 (sekcja M175) + push + CI.

## Wynik

(uzupełnić po wykonaniu)
