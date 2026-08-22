# PLAN 2026-08-22 — M179: inwentaryzacja trików, many, celów (zlecenie A–F)

## Inwentaryzacja (skrypt na katalogu, 343 wspierane)

- **A. Triki bojowe:** 9 instantów (fake-your-own-death, selesnya-charm,
  brute-force, magic-damper, high-stride, awaken-the-bear,
  diplomatic-relations, titans-strength, youre-not-alone) + 10 zdolności
  aktywowanych (pump: snarling-wolf, boros-challenger,
  knight-of-the-skyward-eye, inferno-titan; grant_keywords: stirring-bard,
  death-hood-cobra ×2, bladed-sentinel, soulbright-flamekin, fledgling-imp).
- **B. Aktywowane bez {T}:** 60 zdolności (lista w skrypcie) — klasy efektów
  do podziału: IDEMPOTENTNE do EOT (grant_keywords — pokryte w M175/A2,
  cant_be_blocked, becomes_subtype_until_end_of_turn,
  animate_permanent_until_end_of_turn) vs KUMULUJĄCE (pump, add_counter,
  damage, draw…).
- **C. Sorcery:** 60+ czarów; wycena pump/grant NIE rozróżnia instant/sorcery
  — kara −20 „we własnej main” wisi też na sorcery, których NIE DA się
  rzucić kiedy indziej (bot może ich nigdy nie zagrać).
- **D. Nielandowe źródła many:** apprentice-wizard ({1}{U},{T}: 3),
  dragonbroods-relic ({T}+tapCreature: 1), scorned-villager ({T}: 1),
  seers-lantern ({T}: 1), pristine-talisman ({T}: 1 + życie),
  jeskai-devotee ({1}: 1 kolorowa) — `producibleMana` liczy TYLKO pulę
  + landy, więc oferty rzutu nie widzą tej many.
- **E. Cele:** klasyfikacje istnieją (HOSTILE_PERMANENT_EFFECTS + kary
  friendly/hostile w wycenie + 2 strażniki) — audyt kompletności i
  centralna klamra zamiast kar punktowych rozsianych po gałęziach.

## Kroki

- [x] 1. Plan (ten plik) — commit.
- [x] 2. **D:** producibleMana/canPayColoredCost/planGrantManaColors/spendMana
  liczą też nielandowe źródła many o koszcie SAMEGO {T} i efekcie SAMEGO
  add_mana (bez kosztów dodatkowych i skutków ubocznych; stwory z chorobą
  przywołania wykluczone); płatność auto-tapuje je po landach (L48:
  oferta=płatność). Źródła z kosztem many/skutkami (apprentice-wizard,
  pristine-talisman, jeskai-devotee, dragonbroods-relic) zostają ręczną
  aktywacją (jak dotąd). Testy RED→GREEN — commit.
- [x] 3. **A1+C:** wycena grant_keywords dla CZARÓW (wspólny helper okien
  walki z M173/E) + rozróżnienie timing sorcery w oknach pump/grant
  (sorcery: precombat main przed atakiem = bonus, postcombat = kara —
  „w następnym oknie już go nie rzucisz taniej”). Testy — commit.
- [x] 4. **A2:** strażnik kompletności etykiet keywordów: każdy keyword
  występujący w grantach/conditionalKeywords katalogu ma wpis w
  KEYWORD_LABELS (render, badge) i KEYWORD_EVENT_LABELS (session, log);
  uzupełnienie braków. Test end-to-end badge dla keyworda z CZARU — commit.
- [x] 5. **B:** whitelist IDEMPOTENT_EOT_EFFECTS w heuristic-bocie +
  generalizacja strażnika stosu z M175/A2 (identyczna aktywacja na stosie
  → kara, gdy WSZYSTKIE efekty idempotentne); strażnik-test: każdy typ
  efektu w aktywowanej zdolności bez {T} sklasyfikowany (idempotentny/
  kumulujący) — commit.
- [x] 6. **E:** centralna klamra celów w wycenie czarów/zdolności:
  efekt PRZYJAZNY w cel wroga / WROGI w cel własny → twarda kara
  (jedno miejsce zamiast rozsianych); audyt klasyfikacji FRIENDLY — commit.
- [x] 7. **F:** LESSONS (aktualizacja L50/L51 o nowe strażniki albo nowa
  lekcja), PROJECT_STATE, opis PR, test:all + benchmark, push, CI.

## Wynik

- Commity: 8904f48 (plan), 758722d (D), deea47c (A1+C), 4f041bc (A2+B+E).
- **D:** untappedFreeManaSources + auto-tap w spendMana — producibleMana
  widzi Lantern/Villagera; anty-over-fixy M128 zaktualizowane (próg
  osiągnięty ⇒ bot RZUCA czar wprost).
- **A1+C:** keywordGrantWindowValue wspólny dla zdolności i czarów; kara
  za trik-instant w main −75 (baza ~50–65 zjadała −20 — L54); sorcery:
  okno = Główna 1 przed atakiem (kara −75 poza nim); test M149/A2
  odwrócony zgodnie ze zleceniem.
- **A2:** strażnik kompletności KEYWORD_LABELS/KEYWORD_EVENT_LABELS
  (deep-scan grantów katalogu); intimidate uzupełniony w logu.
- **B:** IDEMPOTENT_EOT_EFFECTS / STACKING_ACTIVATED_EFFECTS + kara dubla
  identycznej aktywacji na stosie (źródło+zdolność+cele); strażnik B1.
- **E:** friendlyMisaimPenalty — centralna symetryczna klamra celowania.
- **F:** L54. Testy: test/m179-inwentaryzacja.test.js (15).
- fast 2685/2685 · benchmark 9/9 (bez regresji po zmianach wyceny).
