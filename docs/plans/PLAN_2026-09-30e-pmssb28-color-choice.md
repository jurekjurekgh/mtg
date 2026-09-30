# PLAN_2026-09-30e — PMSSB-28: `resolve_color_choice` czyta cel wyboru

Data: 2026-09-30 · Metoda: **M429** · Gałąź: `arena/01a0eec8-mtg` · Baza: `e81f477`
Sonda: `scratch/pmssb28-color-przed.mjs` · Commit: `5c28560`

## 0. Wybór celu

Z audytu remisów PO (PMSSB-24): `resolve_color_choice` — 8 rozróżnialnych remisów.
Trop porzucony po drodze: rodzina „wygnaj karty z grobu" (`resolve_delve_exile` /
`resolve_escape_exile` / `resolve_reveal_exile_grave`) ma wspólną miarę
`escapeExileCostOf` w postaci dwugałęziowego kikuta (stwór = `10 + 2P + T`, każda inna
karta = stałe 6), ale **w rejestrze nie ma ani jednej karty grywalnej z grobu ani
reanimacji** (`escape`/`flashback`: brak; efekty `return_*_from_graveyard`: brak), więc
„grób jako zasób" byłby niezmierzalny na prawdziwych kartach. Zostaje jako forward na
moment, gdy takie karty wejdą do rejestru.

## 1. POMIAR PRZED

Silnik **niesie cel wyboru w pending**: `game-state.js:5762` ustawia `purpose: 'mana'`
dla lądu z `chooseColor` (Manor Gate), `spells.js:2655` — `purpose: 'protection'` dla aury.
Wycena tego pola **nie czytała** i liczyła jedną płaską sumę
`5 + needScore * 6 + enemyInColor` dla obu celów.

Scenariusz, w którym oba motywy są przeciwstawne: p2 ma 3 lasy (źródła {G}) i w ręce
Delta Bloodflies {1}{B} (potrzebuje {B}); p1 ma trzy czerwone stwory (dla ochrony liczy
się {R}).

| Cel | PRZED | Czytanie |
|---|---|---|
| `protection` | U=11, B=11, R=8, W=5, G=5 → **{U}** | **BŁĄD** — wróg nie ma ani jednego stwora {U}; aura nie chroni przed niczym |
| `mana` | U=11, B=11, R=8, W=5, G=5 → **{U}** | identyczny wynik — `purpose` jest martwym polem |

Obie gałęzie dawały **bajt w bajt te same liczby**.

## 2. Wdrożenie

```js
const purpose = view.pendingColorChoice?.purpose;
if (purpose === 'protection') return finish(5 + enemyInColor * P.colorProtectionPerCreature);
if (purpose === 'mana')       return finish(5 + needScore  * P.colorManaNeedPerCard);
return finish(5 + needScore * 6 + enemyInColor);   // cel nieznany — bez zmian
```

Motywy są przeciwstawne, więc każdy cel ma własną, **rozłączną** wagę. Nieznany cel zostaje
przy dawnej sumie — kotwica anty-over-fix: nic, czego nie zmierzyliśmy, nie zmienia
zachowania (pin B1).

**Pokrętła (2):** `colorProtectionPerCreature` 6 · `colorManaNeedPerCard` 6 — tyle, ile
dawna waga potrzeby many, więc skala się nie zmienia.

## 3. POMIAR PO

| Cel | PO | Werdykt |
|---|---|---|
| `protection` | **{R} = 23**, reszta po 5 | chroni przed kolorem, który wróg faktycznie ma |
| `mana` | **{B} = 11**, reszta po 5 | bierze kolor potrzebny w ręce |

Ten sam stan, różne wybory (pin A3). Przy pustym stole wroga ochrona remisuje po 5 i nie
wymyśla koloru z potrzeby many (B3 — PRZED wygrywało {B} = 11).

## 4. Piny i mutacja

`test/audyt-pmssb28-color-choice.test.js` (7): A1 ochrona → {R} (23 vs 5), A2 mana → {B}
(11 vs 5), A3 rozłączność celów, A4 więcej wrogich stworów w kolorze = wyżej,
**B1 anty-over-fix** (nieznany cel = dawna suma: B=11, R=8, U=5), B2 wagi jako pokrętła,
B3 pusty stół wroga = uczciwy remis po 5.

**Mutacja M1** (rozdział po `purpose` usunięty) → RED: **{A1, A2, A3, A4, B2, B3}**;
B1 zielony — dokładnie zgodnie z projektem.

## 5. Bramki

- `npm test` **7179/7179** · `npm run build` 70 mod / **4656.3 kB**
- `npm run test:all` **7450 / 7450, exit 0**, golden-master `ok 1717` **bez regeneracji**
  (+7 względem 7443 z PMSSB-27 to dokładnie nowe piny)

## 6. Forward

- Ochrona przy braku wrogich stworów remisuje po 5 — sensownym rozwinięciem byłby odczyt
  kolorów z ręki/grobu przeciwnika (strefy jawne, CR 400.2), ale to wymaga pomiaru, czy
  w partiach w ogóle występuje taka sytuacja.
- `escapeExileCostOf` (dwugałęziowy kikut) — patrz §0; wróci, gdy w rejestrze pojawią się
  karty grywalne z grobu albo reanimacja.
