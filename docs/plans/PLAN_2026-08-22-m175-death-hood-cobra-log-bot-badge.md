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

- [x] 1. Plan (ten plik) — commit.
- [x] 2. A1: `grantKeywords` na zdarzeniu `ability_activated` (obie emisje w
  abilities.js); session.js — opis aktywacji z konkretnymi keywordami
  („nadanie do końca tury: zasięg", słownik KEYWORD_EVENT_LABELS). Test
  RED→GREEN. Commit.
- [x] 3. A2: widok stosu eksponuje `sourceId` aktywowanej zdolności (informacja
  publiczna — ogłaszana przy kładzeniu na stos, ADR 0017); wycena grantu w
  heuristic-bot: identyczna aktywacja (sourceId+abilityIndex+kontroler) już na
  stosie ⇒ duplikat (kara jak za posiadany keyword). Test RED→GREEN. Commit.
- [x] 4. A3: playerView liczy `entry.grantedKeywords` = efektywne − wydrukowane
  (`object.keywords` ze STANU — działa też dla tokenów/kopii bez rejestru);
  render `cardInfo` czyta pole widoku zamiast martwej różnicy. Test RED→GREEN
  (widok + badge przez buildStateOverlay). Commit.
- [x] 5. `npm test` + build przy każdym commicie; na koniec aktualizacja
  PROJECT_STATE + opis PR #69 (sekcja M175) + push + CI.

## Wynik

- Commity: 9e87c88 (plan), 23467eb (A1), 5e9e24d (A2), 5e4408f (A3).
- A1: `ability_activated.grantKeywords` (obie emisje w abilities.js); log
  „nadanie do końca tury: zasięg”.
- A2: widok stosu z `sourceId`; wycena grantu w heuristic-bot traktuje
  identyczną aktywację wiszącą na stosie jak posiadany keyword (kara −10).
- A3: `entry.grantedKeywords` w playerView (efektywne − wydrukowane ze stanu);
  cardInfo czyta pole widoku (stara różnica była ZAWSZE pusta — badge grantów
  nigdy nie działał); przy okazji naprawia badge statyk warunkowych (Gray
  Slaad) w realnym stole.
- Testy: test/m175-uwagi-wlasciciela.test.js (8, RED→GREEN przez git stash).
- `npm test` 2645/2645 · test:all 2654/2654 · build 52 moduły / 2267.9 kB.
