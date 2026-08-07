# ADR 0015: Kolorowa pula many (MtG-correct)

- **Status:** Proponowana (decyzja właściciela 2026-08-06: „zdecydowanie 1")
- **Data:** 2026-08-06
- **Kontekst:** [ADR 0013](0013-agent-arena-sessions-and-mandatory-handoff.md),
  historia milestone'ów (M2 → M41)

## Kontekst

Od M2 pula many w engine była **bezbarwna** (`player.mana` = liczba; udokumentowane
uproszczenie w komentarzach `card-data.js`: „pula many engine jest bezbarwna").
Konsekwencja: engine nie wiedział, że mana z Wyspy jest niebieska, więc kolory
sprawdzał **statycznie** (`hasColorForObject` → `allControlledManaSources`) —
liczył wszystkie kontrolowane źródła zdolne wyprodukować kolor, **wliczając
tapnięte/zużyte**. Stąd nonsens: do rzutu czaru {U} „wystarczało posiadać"
Wyspę, nawet tapniętą. Rzucenie czaru powinno wymagać **źródeł, których można
użyć** (untapped), sprawdzonych **przed** tapnięciem (zgodnie z CR 601.2).

Kreator many (M37/M40) próbował obejść ten nonsens ręcznym śledzeniem
„committed" (kolory tapniętych w sesji źródeł) — podejście wsteczne i mylące.

## Decyzja

Pula many staje się **kolorowa**. `player.mana` zostaje liczbą (total — dla
amount, widoku, fingerprintu, botów), a **rownolegle** `player.manaPool`
śledzi jednostki many po profilu kolorów (mapa kluczowana
`manaUnitKey`: `'U'`, `'UR'` dla dwubarwnego landu, `'WUBRG'` dla dowolnego,
`''` dla bezbarwnego). Suma wartości == `player.mana`.

- **Castability (MtG, PRZED tapnięciem):** `canPayColoredCost` — pip(y) kolorowe
  dopasowalne do jednostek many (kolorowa pula + **NIETAPNIĘTE** źródła).
- **Płatność:** `spendMana(amount, requirements)` konsumuje z puli po pipach
  (każdy pip → pasująca jednostka), reszta (generic) od bezbarwnych; auto-tap
  tapuje **kolorowopasujące** źródła najpierw, by wyprodukowana mana miała
  właściwe kolory.
- **Produkcja:** `tapLandForMana` / `add_mana` produkują **kolor** źródła
  (Wyspa → {U}, dwubarwny → U|R, „dowolny" → dowolny, bezbarwny → generic).
- **Pełna poprawność:** jednostki-sety (dwubarwny land opłaca U LUB R, nie G;
  Skarb/dowolny opłaca dowolny pip).

## Konsekwencje

- **(+) MtG-poprawność:** do rzutu trzeba użytecznych (untapped) źródeł; tapnięcie
  płaci właściwy kolor. Nonsens „posiadanie = pokrycie" usunięty. Kreator many
  czyta kolorową pulę (bandaż „committed" usunięty).
- **(+) Mały blast radius:** `player.mana` (liczba) zachowany — amount, widok,
  fingerprint, boty i większość testów bez zmian. `manaPool` równoległa.
- **(±) Bot rzuca mniej czarów:** MtG-correct mana wymaga nietapniętych
  kolorowych źródeł; bot heurystyczny (priorytet stworów, tap-out) rzuci mniej
  instantów/sorcery'ów (poprzednio „działo" to dzięki tapniętym źródłom).
  Pełny B0 (6300 meczów, 0 niedokończonych): heuristic **86.8% vs random,
  63.9% vs aggro** — progi 0.78/0.57 utrzymane (lekki spadek vs random
  88.0→86.8).
- **(±) `addMana` bez `colors` → default „dowolny kolor"** (wygoda TESTÓW; realna
  gra ZAWSZE podaje jawny `colors` z `tapLandForMana`/efektów; jawne `colors:[]`
  = bezbarwna).
- **(+) Poboczna naprawa:** `drawPlayerCards` chroni teraz karty wstrzymane przez
  pending scry/surveil/explore/clash (jak `mill_cards`) — pre-istniejący utajony
  błąd odsłonięty przez inne trajektorie.

## Powiązane

- Zastępuje uproszczenie „pula bezbarwna" z komentarzy `card-data.js` (M2+).
- Kreator many: `src/table/mana-wizard.js` czyta pulę (M40/M41).
- Roadmapa: `docs/plans/PLAN_2026-08-06-kolorowa-pula-many.md`.
