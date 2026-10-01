# PLAN_2026-09-30b — PMSSB-25 (mikro-pętla): koszt „odrzuć" a wspólna miara karty

Data: 2026-09-30 · Metoda: **M429** · Gałąź: `arena/01a0eec8-mtg` · Baza: `aa27111` (main) + PR #147
Sonda pomiarowa: `/home/user/scratch/pmssb25-discard-przed.mjs`

## 0. Wybór celu

Audyt remisów PO (`scratch/tie-pmssb24-po.log`) posortowany po klasach, które mają
zarówno remisy, jak i decyzje o różnej punktacji (czyli takie, gdzie ocena realnie działa):

| decyzja | dec. | remisy |
|---|---|---|
| attack | 19 614 | 191 |
| block | 17 253 | 150 |
| **`resolve_discard_choice`** | **1 176** | **24** |
| cast_spell | 60 881 | 14 |
| activate_ability | 85 827 | 12 |

Wybrano `resolve_discard_choice`, bo przy czytaniu oceny okazało się, że pracuje na
**drugiej, równoległej mierze jakości karty** (L41 — `handCardKeepValue`) obok wspólnej
`cardKeepValue` używanej przez scry/surveil/mill/look_top/clash. To nie jest nowy pomysł,
tylko domknięcie tej samej luki, którą PMSSB-24/F4 znalazł w `resolve_clash_choice`.

## 1. POMIAR PRZED (sonda, nie teoria)

| # | Stan | PRZED | Czytanie |
|---|---|---|---|
| D1 | 6 lądów na stole, ręka = 2× Secluded Steppe + Highland Game | land **19**, stwór 14 | land odrzucany, ale z powodu „land ma `manaCost` 0", nie przesycenia |
| D2 | 3× Highland Game + Illusory Demon (3 lasy) | demon **40**, kopie 14 | **POPRAWNE** — reguła właściciela M408 (brak koloru). Podejrzenie o duplikaty obalone pomiarem |
| D3 | 2 lądy, Woolly Loxodon {7} + Highland Game | bomba **−1**, stwór 14 | **BŁĄD** — trzyma kartę niedostępną przez ~5 tur |
| D4 | 0 lądów, land + Highland Game | stwór **42**, land 19 | reguła koloru dominuje (bez lądów nic nie jest grywalne) — zostaje, forward |
| D5 | 3× Highland Game + Zoraline (3 lasy) | Zoraline **40** | j.w. — reguła koloru |
| D6 | 2 lądy, Woolly Loxodon + 2× Highland Game | bomba **−1**, kopie 14 | **BŁĄD** — jak D3 |

**Znajdowanie (F1, L41):** `discardCostPreference` dla kart grywalnych zwraca
`−min(30, handCardKeepValue)` — miarę opartą na ciele (`2·moc + wytrzymałość`, bez limitu)
i keywordach, która **nie zna zasięgu many, nasycenia lądów ani duplikatów**. Wspólna
`cardKeepValue` o Woolly Loxodonie przy 2 lasach mówi −3 (koszt 7 > zasięg+2), a o zbędnym
landzie przy 6 lądach −6.

## 2. Fale

**Fala A — karta, której wspólna miara nie chce, idzie na pierwszy ogień**
`discardCostPreference`: nowa gałąź przed regułą ciała —
`if (cardKeepValue(view, karta) < 0) return -cardKeepValue(view, karta) + P.discardUnwantedBonus;`
Pokrętło: `discardUnwantedBonus: 5` (×0 = sama wartość wspólnej miary).
Piny `test/audyt-pmssb25-discard.test.js` (5): A1 bomba poza zasięgiem 28 > 14 (i wybór),
A2 land z powodu przesycenia 31 > 14, **A3 kotwica M408** (karta bez koloru 40, wybór `h3`),
**A4 anty-over-fix** (karta grywalna 14 = PRZED), A5 ×0 → 23 (kierunek bez zmian).
Mutacja **A-M1** (gałąź usunięta) → RED: **A1 + A2 + A5**; A3/A4 zielone.

**Nie otwieramy (forward):** D4 — przy 0 lądów reguła koloru właściciela każe odrzucić
stwora zamiast landu. To konsekwencja M408, nie nowej luki; wymaga decyzji właściciela, czy
reguła koloru ma ustępować przed budową manabazy.

## 3. Bramki

- Fala A: `npm test` **7157/7157**, `npm run build` 70 mod / **4649.2 kB** (bez zmian modułów)
- `npm run test:all` — bramka końcowa pętli

## 4. Rejestry

- Nowe: `scratch/pmssb25-discard-przed.mjs`, `test/audyt-pmssb25-discard.test.js`
- Pokrętła: `discardUnwantedBonus` (rejestrowane w `heuristic-params.js` — strażnik rejestru)
