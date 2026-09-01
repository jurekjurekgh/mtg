# ADR 0015: Kolorowa pula many (MtG-correct)

- **Status:** Zaakceptowana
- **Wdrożona:** M41+ (`player.manaPool`, `canPayColoredCost`, `spendMana`
  w `src/engine/resources.js`); status „Proponowana" wisiał do 2026-09-01
  mimo decyzji właściciela z 2026-08-06 („zdecydowanie 1") i wdrożenia.
- **Data:** 2026-08-06
- **Kontekst:** [ADR 0013](0013-agent-arena-sessions-and-mandatory-handoff.md),
  historia milestone'ów (M2 → M41)

## Kontekst

Od M2 pula many była **bezbarwna** (`player.mana` = liczba; uproszczenie
udokumentowane w komentarzach `card-data.js`). Engine nie wiedział, że mana z
Wyspy jest niebieska, więc kolory sprawdzał **statycznie**
(`hasColorForObject` → `allControlledManaSources`) — liczył wszystkie
kontrolowane źródła zdolne wyprodukować kolor, **wliczając tapnięte/zużyte**.
Stąd nonsens: do rzutu czaru {U} „wystarczało posiadać" Wyspę, nawet tapniętą.
Rzucenie czaru wymaga **źródeł, których można użyć** (untapped), sprawdzonych
**przed** tapnięciem (CR 601.2).

Kreator many (M37/M40) obchodził to ręcznym śledzeniem „committed" (kolory
tapniętych w sesji źródeł) — podejście wsteczne i mylące.

## Decyzja

Pula many staje się **kolorowa**. `player.mana` zostaje liczbą (total — amount,
widok, fingerprint, boty), a **równolegle** `player.manaPool` śledzi jednostki
many po profilu kolorów (mapa kluczowana `manaUnitKey`: `'U'`, `'UR'` dla
dwubarwnego landu, `'WUBRG'` dla dowolnego, `''` dla bezbarwnego). Suma
wartości == `player.mana`.

- **Castability (MtG, PRZED tapnięciem):** `canPayColoredCost` — pipy kolorowe
  dopasowalne do jednostek many (kolorowa pula + **NIETAPNIĘTE** źródła).
- **Płatność:** `spendMana(amount, requirements)` konsumuje z puli po pipach
  (każdy pip → pasująca jednostka), reszta (generic) od bezbarwnych; auto-tap
  tapuje **kolorowopasujące** źródła najpierw.
- **Produkcja:** `tapLandForMana` / `add_mana` produkują **kolor** źródła
  (Wyspa → {U}, dwubarwny → U|R, „dowolny" → dowolny, bezbarwny → generic).
- **Pełna poprawność:** jednostki-sety (dwubarwny land opłaca U LUB R, nie G;
  Skarb/dowolny opłaca dowolny pip).

## Konsekwencje

- **(+) MtG-poprawność:** do rzutu trzeba użytecznych (untapped) źródeł;
  tapnięcie płaci właściwy kolor. Nonsens „posiadanie = pokrycie" usunięty;
  bandaż „committed" w kreatorze many usunięty.
- **(+) Mały blast radius:** `player.mana` (liczba) zachowany — amount, widok,
  fingerprint, boty i większość testów bez zmian.
- **(±) Bot rzuca mniej czarów:** MtG-correct mana wymaga nietapniętych
  kolorowych źródeł; bot heurystyczny (priorytet stworów, tap-out) rzuci mniej
  instantów/sorcery'ów. Pełny B0 (6300 meczów, 0 niedokończonych): heuristic
  **86.8% vs random, 63.9% vs aggro** — progi 0.78/0.57 utrzymane (spadek vs
  random 88.0→86.8).
- **(±) `addMana` bez `colors` → domyślnie „dowolny kolor"** (wygoda testów;
  realna gra ZAWSZE podaje jawny `colors`; jawne `colors: []` = bezbarwna).
- **(+) Naprawa poboczna:** `drawPlayerCards` chroni karty wstrzymane przez
  pending scry/surveil/explore/clash (jak `mill_cards`) — utajony błąd
  odsłonięty przez inne trajektorie.

## Powiązania

- Zastępuje uproszczenie „pula bezbarwna" z komentarzy `card-data.js` (M2+).
- Kreator many: `src/table/mana-wizard.js` czyta pulę (M40/M41).
- Roadmapa: `docs/plans/PLAN_2026-08-06-kolorowa-pula-many.md`.
