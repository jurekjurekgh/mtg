# Plan: M89 — audyt bugów właściciela (1–5)

Sesja `arena/019ffd38-mtg`. Kontynuacja audytu M89 — pięć kolejnych
bugów z testów właściciela na iPhonie (2026-08-14, po M89 A+B+C
wypchniętych jako 2 commity).

## START TUTAJ (stan po 9adf9b3 + fdcef37)

- `npm test` → **1531/0** zielonych.
- `npm run build` → 50 modułów / 1621.1 kB.
- Gałąź: `arena/019ffd38-mtg` (HEAD = fdcef37, czysty).
- CI zielone (PR #51).
- Bot nietknięty (B0 niewymagany po poprawkach UI/UX/engine bez zmian bota).

## Zgłoszenia właściciela (5)

### A. Pierwsze przesunięcie strony (swipe w górę) → dziwne zwężenie do ⅔ ekranu

**Objaw:** po nowym seedzie i rozpoczęciu partii, pierwsze przesunięcie
strony (swipe w górę) zwęża widok do ~⅔ szerokości ekranu z pustą
przestrzenią po prawej. Co i raz strona „skacze" do pełnej szerokości
i z powrotem. Bardzo denerwujące.

**Możliwe root causes (do zbadania):**
- `body.style.zoom` lub `transform: scale(...)` uruchamiane gestem
  (gestures.js — `installTapGesture` śledzi ruch palca);
- brakujący `min-width: 100vw` na `.app` / `.topbar` przy viewport
  mniejszym od oczekiwanego (Safari iOS raportuje szerokość różną
  po pierwszym scroll);
- pinch-zoom handler zostawiający `transform: scale(0.66)` po
  błędnym rozpoznaniu swipe jako pinch (touch-action nie wyłącza
  default browser zoom);
- safe-area-inset nie uwzględniony przy dynamicznym toolbarze
  (Safari raportuje różne width po scroll).

**Fix (plan):** odtworzyć objaw w testerze (symulacja scroll/swipe
jsdom), znaleźć konkretny handler, naprawić u root cause.

### B. Forever Young z zaznaczonym ptaszkiem pomijania → pętla "Poddaj walkę"

**Objaw:** mam sorcery Forever Young, zaznaczam ptaszkiem „nie przerywaj
auto-passu", klikam pass. Ląduję na ekranie z jedyną opcją "Poddaj
walkę" (concede). Brak tekstu o błędzie (który był wcześniej).
Odświeżenie strony naprawia (ale kasuje ptaszki).

**Możliwe root cause:**
- Zaznaczony ptaszek powoduje, że `hasMeaningfulDecision` pomija
  Forever Young (cast_spell). Ale na stosie/turnie jest inna
  decyzja (np. `resolve_graveyard_top_choice`, które Forever Young
  kolejkuje w środku rozstrzygania). Gdy ptaszek kasuje cast_spell,
  w widoku nie ma już żadnej „nie-wyciszonej" opcji — ale wciąż
  jest `concede` i `pass_priority`, i gra się zapętla.
- `recheckAutoPass` po wyciszeniu wywołuje `advance()`, ale pass
  cykluje (pass → resolve → kolejna decyzja → loop).
- "Tekst o błędzie" mógł być efektem wcześniejszego raportu
  o `pass_rejected` — M75 wprowadził tłumienie, stąd brak.

**Fix (plan):** reprodukować, znaleźć dlaczego pętla pass+decision.

### C. Carrion Call — brak okna na instant w odpowiedzi; brak raportu o tokenach

**Objaw:**
1. Bot rzucił Carrion Call (tworzy 2 tokeny Soldier). Nie dostałem
   okna na rzucenie instanta w odpowiedzi (mam manę).
2. W raporcie "Ruch przeciwnika" nie ma wzmianki o wejściu tokenów
   na stół.

**Możliwe root cause:**
1. Carrion Call nie jest instantem (sorcery M13), bot rzuca go
   w main phase. Przeciwnik (ja) ma priorytet po rzucie — powinienem
   dostać okno na instant. Sprawdzić czy faktycznie jest.
2. `permanent_entered_battlefield` dla tokenów wchodzi przez
   `permanent_cast` + efekt `create_token` — `BOT_MOVE_CARD_EVENTS`
   zawiera `permanent_entered_battlefield` (było w M18). Sprawdzić
   czy event trafia do `noteBotMove`.

**Fix (plan):** reprodukować (bot rzuca Carrion Call), zweryfikować
dwa kanały.

### D. Fake Your Own Death nie ma pola ptaszka

**Objaw:** instant z wyborem celu — w ogóle nie ma pola ptaszka
„nie przerywaj auto-passu", wyskakuje co fazę.

**Możliwe root cause:** `commandOptionKey` nie generuje klucza dla
`cast_spell` z `targets` (M75)? Albo UI filtruje opcje z `targets`
jako „wymagające decyzji" i pomija ptaszka?

**Fix (plan):** reprodukować, znaleźć warunek pomijający ptaszka.

### E. Bot atakuje ⅔ w moje ⅚ — bez sensu (przegrywa)

**Objaw:** mam stwora ⅚, bot atakuje swoim ⅔. Ginie bez efektu.
Bot nie powinien tego robić (pozycja przegrywająca).

**Możliwe root cause:** heurystyka bota — ocena ataku ⅔ w moje ⅚
z ignorancją survivalu (CR: ⅔ ginie w bloku z ⅚ bez żadnych
zdolności). Sprawdzić `bot.attackScore`/`attackBonus` — czy w ogóle
uwzględnia utratę własnego stwora.

**Fix (plan):** reprodukować (seed), znaleźć ścieżkę kodu.

## Etapy

- [ ] E0 — ten plan w repo
- [ ] E1 — reprodukacja bugu A w testerze (symulacja scroll/swipe)
- [ ] E2 — reprodukacja bugu B w testerze
- [ ] E3 — reprodukacja bugu C w testerze
- [ ] E4 — reprodukacja bugu D w testerze
- [ ] E5 — reprodukacja bugu E w testerze
- [ ] E6 — RED test na każdy reprodukowany bug
- [ ] E7 — fix każdego buga u root cause
- [ ] E8 — `npm test` + `npm run build`
- [ ] E9 — commit zbiorczy (M89: 5 bugów z testów właściciela) + push
- [ ] E10 — docs: PROJECT_STATE (M89 cd.) + plan odhacz

## Kolejność commitów

1. ten plan
2. reprodukcja + RED + GREEN + commit zbiorczy dla 5 bugów
3. docs (M89 cd.)

## Ryzyka

- Bugi w UI mogą być niepowtarzalne w testerze jsdom (scroll/swipe
  iOS) — wtedy trzeba zrekonstruować ścieżkę kodu z inspekcji
  zamiast z reprodukcji.
- "Tekst o błędzie" znikał — może być efektem ubocznym wcześniejszej
  naprawy (M75), bez sensu odtwarzać — naprawić tylko pętlę.
- Bot attack scoring wymaga pełnego B0 (13500 meczów) do weryfikacji
  braku regresji — po zmianie heurystyki bota.

## Kryterium ukończenia

- Każdy z 5 bugów ma RED→GREEN test + widoczny fix w UI/logice.
- `npm test` i `npm run build` zielone.
- Bot nietknięty w bugach A, B, C, D; w E (jeśli zmiana bota) — benchmark.
- Brak regresji w innych zgłoszeniach.
