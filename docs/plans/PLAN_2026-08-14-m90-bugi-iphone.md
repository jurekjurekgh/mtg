# PLAN 2026-08-14 — M90: bugi z iPhone'a (A–E) — wznowienie po utraconej sesji

**Gałąź sesji:** `arena/01a000df-mtg` (Arena wiąże sesję z tą gałęzią; handoff
właściciela wskazywał `arena/019ffd38-mtg`, ale ta gałąź należy do zamkniętego
PR #51 — praca idzie na gałęzi bieżącej sesji).
**Baza:** `main` = `10fe8b7` (PR #51, M88).
**Baseline zmierzony na starcie:** `npm test` **1544/0**, `npm run build`
50 modułów / **1624.7 kB**.

## Rozpoznanie (co NAPRAWDĘ jest w main)

Handoff zakładał, że wszystkie fixy M89 cd. przepadły z working tree. Audyt
`main` pokazuje inaczej — część fixów i ich testy SĄ w `main` (weszły z PR #51):

| Bug | Stan w `main` | Dowód |
|-----|---------------|-------|
| A — swipe zwęża widok do ⅔ | **naprawiony** | `src/table/index.html`: `maximum-scale=1.0, user-scalable=no` + `overscroll-behavior: none`; `test/ios-viewport.test.js` (2 testy) |
| B — Forever Young → „Poddaj walkę" + `not_priority` | **NIE naprawiony** | repro headless: po odrzuconej komendzie sesja gubi pauzę bota |
| C1 — brak okna na instant w odpowiedzi (Carrion Call) | **NIE naprawiony** | repro headless: gracz nie dostaje priorytetu po czarze bota |
| C2 — brak wpisu o tokenach w modalu ruchu bota | **naprawiony** | `token_created` w `BOT_MOVE_CARD_EVENTS`; `test/bot-move-tokens.test.js` (3 testy) |
| D — brak ptaszka pomijania w wizardzie wyboru | **naprawiony** | `renderChoiceRequest` z `ignoredOptionKeys`; `test/choice-ignore.test.js` (5 testów) |
| E — bot atakuje ⅔ w ⅚ | **naprawiony** | `heuristic-bot.js`: chump `perAttacker = -10`; `test/bot-bug-chump-attack.test.js` (3 testy) |

Wniosek: realna praca tej sesji to **B i C1** + strażniki regresji dla A/C2/D/E.

## Root cause — bug B (utracona pauza bota po odrzuconej komendzie)

Repro (headless, `session.apply`):

```
pauza bota? true   prio p2
apply({pass_priority, p1}) → { ok:false, reason:'not_priority' }
pauza po odrzuceniu? false   ← BŁĄD (powinno zostać true)
legal człowieka: ['concede']   ← na stole zostaje samo „Poddaj partię"
```

`session.apply()` (src/table/session.js) kasuje `awaitingBotAck = false`
**PRZED** `execute()` — „defensywnie", zakładając, że komenda się powiedzie.
Gdy engine ją odrzuci (`not_priority` — bo priorytet ma bot wstrzymany pauzą),
sesja została bez pauzy i bez drogi wznowienia: `botPausePending` = false,
więc UI nie rysuje „▶ Wznów grę bota", a `legalCommands` człowieka to samo
`concede` → ekran „Poddaj partię". To dokładnie objaw właściciela (Forever
Young z zaptaszkowanym pomijaniem: ptaszek wywołuje `recheckAutoPass`/pass
w oknie, w którym priorytet ma już bot).

**Fix u root cause:** czyścić `awaitingBotAck` (i bufor `botMoves`) dopiero po
UDANYM `execute()`. Odrzucona komenda nie może zmieniać stanu sesji.

## Root cause — bug C1 (brak okna na instant w odpowiedzi, CR 117.3c/117.4)

Repro (headless): człowiek pasuje w main bota → bot gra ląd, rzuca Carrion Call
→ czar rozstrzyga się natychmiast, człowiek z 6 maną i instantem w ręce **nigdy
nie dostaje priorytetu**.

`state.turn.passes` rośnie w `pass_priority` i jest zerowany wyłącznie przy
zmianie kroku i po rozstrzygnięciu stosu — **nie po akcji gracza**. Sekwencja:
człowiek pass (passes=1) → bot rzuca czar (passes nadal 1!) → bot pass
(passes=2 = liczba graczy) → engine rozstrzyga wierzch stosu. Człowiek jest
pomijany, choć CR 117.3c daje priorytet graczowi po jego akcji, a CR 117.4
wymaga passów **następujących po sobie, bez akcji pomiędzy**.

**Fix u root cause:** w `accepted()` zerować `state.turn.passes` dla każdej
zaakceptowanej komendy innej niż `pass_priority` (czar, zdolność, ląd,
deklaracje, decyzje resolve_*). To generyczna reguła CR, nie warunek na kartę.

Ryzyko: zmiana dotyka rytmu priorytetu w CAŁEJ grze → pełny `npm test`
i benchmark bota obowiązkowe (bot dostaje więcej okien odpowiedzi).

## Etapy

1. **Plan** (ten plik) — commit przed kodowaniem. ✅
2. **Bug B** — RED test (`test/session-bot-pausa.test.js`: odrzucona komenda
   podczas pauzy zachowuje `botPausePending`) → fix w `session.apply` → GREEN.
3. **Bug C1** — RED test (`test/mtg-rules-fixes.test.js` lub nowy
   `test/priority-after-action.test.js`: po czarze bota człowiek dostaje
   priorytet z instantem w ofercie) → fix `accepted()` → GREEN.
4. **Strażniki A/C2/D/E** — potwierdzić, że istniejące testy pokrywają fixy
   (bez dublowania), dopisać brakujące asercje tylko jeśli luka jest realna.
5. **Weryfikacja** — `npm test` (≥1544 + nowe), `npm run build`,
   `node --test test/bot-benchmark.test.js`; przy zmianie rytmu priorytetu
   dodatkowo próbka `tools/benchmark.mjs`.
6. **Dokumentacja** — `docs/PROJECT_STATE.md`, `docs/setup/HANDOFF_2026-08-14-m90.md`,
   podsumowanie wykonania w tym pliku.
7. **PR** do `main` z gałęzi sesji + kumulacyjny opis.

## Definition of Done

- B i C1 mają test RED→GREEN i naprawę u root cause (bez maskowania).
- `npm test` zielone (≥1546), `npm run build` OK.
- Benchmark bota bez niedokończonych partii, progi win-rate utrzymane.
- `PROJECT_STATE.md` + handoff zaktualizowane, PR otwarty.

## Podsumowanie wykonania

Wykonane etapy: 1–7 (wszystkie).

**Naprawione u root cause (4 błędy, każdy RED→GREEN):**

1. **Bug B — utracona pauza bota** (`src/table/session.js`). `apply()` kasował
   `botMoves` i `awaitingBotAck` przed `execute()`; odrzucona komenda
   (`not_priority`) zostawiała gracza z samym `concede` — ekran „Poddaj partię"
   bez wyjścia. Fix: mutacja stanu sesji dopiero po udanym `execute()`.
   Test: `test/session-bot-pausa.test.js` (+1).
2. **Bug C1 — brak okna na instant w odpowiedzi** (`src/engine/game-state.js`,
   CR 117.3c/117.4). `turn.passes` nie zerował się po akcji, więc „człowiek
   pass → bot rzuca czar → bot pass" liczyło się jako pełna runda i czar
   rozstrzygał się bez okna odpowiedzi. Fix: `accepted()` zeruje licznik dla
   każdej komendy ≠ `pass_priority`. Test: `test/priority-after-action.test.js` (+3).
3. **Crash „Ta karta nie ma drugiej strony (craft)"** (`src/engine/effects.js`,
   `src/engine/tokens.js`, CR 707.8a) — obecny już w `main`, przerywał pełną
   macierz benchmarku B0. `create_copy_token` kopiował zdolność craft bez
   drugiej strony DFC. Test: `test/copy-token-dfc.test.js` (+2).
4. **Crash „Nieprawidłowy cel obrażeń"** (`src/engine/spells.js`, CR 608.2b) —
   również obecny w `main`, odsłonięty po naprawie (3). Zdolność celowana po
   utracie wszystkich celów wykonywała efekty z pustą listą. Fix: fizzle
   z `ability_resolved{fizzled:true}`. Test: `test/ability-fizzle-no-target.test.js` (+3).

**Dodatkowo:** funkcjonalne testy ptaszka pomijania (bug D) na harnessie DOM —
dotychczasowe testy sprawdzały wyłącznie obecność kodu regexami i nie łapały
regresji zachowania; weryfikacja mutacyjna potwierdziła czułość (+3).

**Potwierdzone jako już naprawione w `main`** (audyt, bez dublowania pracy):
A (viewport/overscroll), C2 (`token_created` w modalu), D (ptaszek), E (chump
attack — bot nie atakuje ⅔ w ⅚ także w wyścigu i przy kończącej się bibliotece).

**Weryfikacja końcowa:** `npm test` **1556/0** (1544 → 1556, +12),
`npm run build` 50 modułów / **1627.5 kB**, benchmark 12 seedów **bez
przerwania** (wcześniej crash): heuristic 95.8% vs random, 63.5% vs aggro,
aggro 92.0% vs random — progi 0.78/0.57 utrzymane. Żywy Tester: 5 partii
(green/red, spellslinger/red, innistrad/wiedzmin, tokens/black,
azorius/graveyard) rozegranych do końca bez odrzuceń i błędów.
