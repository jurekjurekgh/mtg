# Handoff: zgłoszenia H + I (2026-11-07, PR #181)

Gałąź: `arena/b2771170-mtg` (PR #181, inkrementalnie). Komity tej sesji:
`c5b641f` (plan), `80c4893` (piny + fixy), plus docs zamknięcia i fix
warstwy ogłoszeń (kontynuacja H po odpowiedzi właściciela).
Plan: `docs/plans/PLAN_2026-11-07-zgloszenia-h-i.md`.

## Kontynuacja H po odpowiedzi właściciela („zawieszenie nastąpiło w Podtrzymaniu")

- Właściciel odrzucił wyjaśnienie „misreading linii triggera". Zweryfikowano
  jego build (7a18659, po PR #179): piny H1 w worktree — 5/5 zielone; bramki
  fazy w silniku istnieją od PR #36/#64; diff session.js (7a18659→HEAD) to
  tylko etykieta attacks_you_control + F-OGŁ. Akt zawieszenia w upkeep był
  niemożliwy także na jego drzewie.
- **Ale jego obserwacja była realna — wada warstwy ogłoszeń:**
  `card_suspended`/`card_plotted` nie było w `BOT_PAUSE_EVENTS` (specjalne
  akcje idą cichym `moveObjectDirectly`, bez `object_moved`), więc ogłoszenie
  „Nieprzyaciel zawiesza Mindstab" czekało w buforze modala „Rozgrywka"
  do następnego przystanku — zwykle granicy tury — i pokazywało się, gdy
  stół był już w Podtrzymaniu następnej tury. Czytający modal gracz
  widział zawieszenie ogłoszone w upkeep.
- Fix (decyzja właściciela 2026-08-05: pauza po zmianie strefy karty bota):
  `card_suspended` + `card_plotted` w `BOT_PAUSE_EVENTS` — modal pauzuje
  przy SAMYM akcie, we właściwej fazie, z nagłówkiem „Faza: Główna 2" tuż
  nad ogłoszeniem.
- Piny: `test/zgloszenie-h-ogloszenie-zawieszenia.test.js` — H-ogł/1
  (ogłoszenie w fazie głównej; RED bez fixu: faza beginning — doświadczenie
  właściciela), H-ogł/2 (kontekst „Faza: Główna 2" nad ogłoszeniem; przy okazji
  integracja H2 — akt wypada w Głównej 2).
- Benchmark NIE uruchamiany ponownie (zmiana warstwy ogłoszeń/pauz, nie
  wyceny bota — ADR 0018; ścieżka decyzji bota bez zmian: pauza nie wpływa
  na wybory, tylko na moment pokazania ogłoszenia).

## Co zostało zrobione

### H1 — „bot zawiesza Mindstab w podtrzymaniu" → rozpoznanie: NIEMOŻLIWE

- Silnik bramkuje **akt zawieszenia** w dwóch miejscach jednakowo (klasa L48):
  oferta w `legalCommands` (game-state.js, rodzina plot/suspend/warp:
  aktywny gracz + `precombat_main`/`postcombat_main` + pusty stos) i
  `execute` → `suspendCard` (spells.js; to samo + karta z `suspend` w RĘCE).
- CR 702.62a: timing zawieszenia = timing rzutu tej karty z ręki (307.1 dla
  sorceryka). Zdjęcie licznika w upkeep to WYZWALANA zdolność (drugie zdanie
  702.62a) — linia logu „Mindstab — trigger (suspend — zdjęcie licznika czasu
  w podtrzymaniu)" jest LEGALNA i nie jest aktem zawieszenia.
- W katalogu JEDYNA karta z `suspend` to Mindstab (sorcery {1}{B},
  Suspend 4—{B}). Gdyby przyszły karty instant-speed z suspend, bramkę trzeba
  uogólnić o timing rzutu — dziś brak takich kart.
- Zrobione: **piny gwarancyjne** `test/zgloszenie-h1-suspend-timing.test.js`
  (upkeep: brak oferty + odrzucenie execute `illegal_suspend:` + karta w ręce;
  main1/main2: oferta jest; main ze stosiem: brak; cudza main: brak).
- **Wyjaśnienie dla właściciela:** jeśli w przyszłości zobaczy „zawieszenie
  w upkeep" jako REALNY akt (nie linia triggera), potrzebny transkrypt partii.

### H2 — dodatni scoring suspend TYLKO w Głównej 2 (decyzja właściciela)

- Nowy parametr `suspendMain1Penalty` (domyślnie **40**) w
  `heuristic-params.js`; stosowany w `case 'suspend_card'`
  (heuristic-bot.js) po koszcie i zwłoce, gdy `myTurn(view)` i faza
  `precombat_main` (wzorzec `morbidMain1Penalty`). Baza rodziny ≤ 30 → każda
  Główna 1 strictly pod pasowaniem; Główna 2 bez zmian.
- Piny: sekcja H2 w `test/audyt-pmssb35-odroczenie.test.js` (main1 → NIE
  zawiesza / main2 → zawiesza / pokrętło 0 → 24 / kotwica 24−40=−16).
  Sceny B (baza/koszt/zwłoka — bezfazowe) przeniesione do main2.
  Zależność: `test/pmssb6-discard-wave-a.test.js` F-A2 → scena w main2.
- Golden master: świadoma regeneracja `abc4017e…` → `83ee50de…` + wpis
  w rejestrze (zmierzona różnica: tylko dominaria-brg|mirrodin-wu@1001,
  decyzje/scoreSum/chosenKinds bitowo identyczne — wyceny niewybranych
  opcji suspend_card w main1).
- Dowód na partii: Żywy Tester, `--bot dominaria-brg --seed 100` —
  „Nieprzyjaciel zawiesza Mindstab" w T12 PO obrażeniach w walce (Główna 2).

### I — hover trasy Undercity

- `previewCardIdOfOption` (choice-request.js): `resolve_undercity_route` →
  pseudo-id `'undercity'` (karta specjalna spoza rejestru — celowo przed
  pętlą `resolveCardId`).
- `main.js`: `modalHoverInfoByCardId('undercity')` → info lochu
  (`UNDERCITY_DUNGEON`, types: Dungeon — ten sam druk co panel);
  `openCardFullscreenByCardId('undercity')` → `openUndercityFullscreen()`
  (ścieżka dotykowa); `cardNameOfOption` → nazwa lochu na awaryjnej ścianie.
- Piny: `test/zgloszenie-i-undercity-podglad-trasy.test.js` — 3 warstwy
  (czysta funkcja / instalacja w modalu z hoverem nazwy / skan drutu
  main.js, wzorzec L16).
- Efekt w UI: hover nazwy ścieżki („Podziemia — idź do: Forge") w modalu
  wyboru pokazuje kartę Undercity; tap otwiera pełny ekran lochu.

## Bramy (wszystkie zielone)

- `npm run test:all`: **10 352 pass / 0 fail / 0 skip** (10 339 + 13 pinów).
- `npm run build`: 78 modułów / 5 766,4 kB.
- Golden master: zielony po świadomej regeneracji (wpis w rejestrze).
- `npm run benchmark`: heuristic 89,1% (599/672), vs random 97,6%,
  vs aggro 80,7% — bez regresji.

## Incydent git (naprawiony, zero strat)

Trzeci reset workspace w PR #181 — pierwszy raz W TRAKCIE tury: lokalna
historia .git cofnęła się do d2e0d61 (baza), pliki .arena i node_modules
testera zniknęły. Odzyskanie: `git fetch origin` (zdalny miał pełną historię,
HEAD 6ada667) → `git reset origin/arena/b2771170-mtg` → rekommit tych samych
zmian (diff zweryfikowany 1:1: 8 plików) → push fast-forward. Lekcja: pushować
po KAŻDYM commicie natychmiast; przy jakimkolwiek anomalnym `git status`
sprawdzić `git log` przed `git add -A`.

## Otwarte pozycje (następna sesja)

1. Standard: po scaleniu PR #181 — audyt wg ADR 0020 (audyt #181).
2. Ewentualne kolejne zgłoszenia właściciela z testów H/I.
3. Gdy pojawi się karta instant-speed z suspend: uogólnić bramkę timingu
   (oferta + `suspendCard`) o timing rzutu tej karty (dziś de-facto sorcery).
