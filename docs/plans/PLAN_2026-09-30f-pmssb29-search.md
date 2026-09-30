# PLAN_2026-09-30f — PMSSB-29: `resolve_search_choice` na wspólnej mierze

Data: 2026-09-30 · Metoda: **M429** · Gałąź: `arena/01a0eec8-mtg` · Baza: `ce3da8c`
Sonda: `scratch/pmssb29-search-przed.mjs` · Commit: `c11ff41`

## 0. Wybór celu — odświeżony audyt remisów

Log audytu z PMSSB-24 zniknął przy re-provisioningu, więc pomiar wykonany od nowa:
`node tools/bot-tie-audit.mjs --gry=40` → **480 partii, 258 317 decyzji**, z czego 3 807
remisów między realnymi wariantami (10,2 % decyzji akcyjnych).

| decyzja | dec. | remisów | rozróżnialne | równoważne |
|---|---|---|---|---|
| block | 1 136 | 8 259 | 157 | 217 |
| attack | 3 979 | 1 828 | 192 | 48 |
| **`resolve_search_choice`** | **24** | **245** | **0** | **245** |
| cast_spell | 1 848 | 218 | 13 | 203 |
| `resolve_discard_choice` | 335 | 124 | 33 | 91 |
| `resolve_color_choice` | 16 | 19 | 19 | 0 |

Wybrano `resolve_search_choice`: **wszystkie 245 remisów to remisy „równoważne"**, czyli
wycena daje wariantom identyczną liczbę i bot bierze pierwszy z listy. (Dla porównania
`resolve_color_choice` ma po PMSSB-28 same remisy *rozróżnialne* — to uczciwe remisy przy
pustym stole wroga, kotwiczone pinem PMSSB-28/B3.)

## 1. POMIAR PRZED

Wycena szukała **własną, trzecią już miarą jakości karty** obok `handCardKeepValue`
(PMSSB-25/F1) i wspólnej `cardKeepValue` (M135 + PMSSB-24/F4 + PMSSB-26):

```js
let score = 25;
if (card.kind === 'land') score += 30;
score += (card.power ?? 0) * 2 + (card.toughness ?? 0);
```

Kandydaci: land, Delta Bloodflies {1}{B} 1/2, Woolly Loxodon {5}{G}{G} 6/7, dwa czary.

| Lądy na stole | PRZED |
|---|---|
| 0 | land=55 · bomba=44 · stwór=29 · czary po 25 |
| 3 | **identycznie** |
| 8 | **identycznie** |
| 12 | **identycznie** |

Reguła nie znała drabiny lądów, zasięgu many ani koloru:
- przy **12 lądach** bot szukał kolejnego landu zamiast 6/7;
- przy **0 lądów** bomba za 7 biła grywalnego stwora za 1;
- **wszystkie czary** dostawały dokładnie 25 — stąd 245 remisów w audycie.

## 2. Wdrożenie

```js
let score = P.searchFoundBase + cardKeepValue(view, card);
```

Wspólna miara daje w jednym miejscu drabinę lądów (PMSSB-26), próg zasięgu
(`cost > reach + 2` → −3) i zniżkę za duplikaty. Pokrętło `searchFoundBase` = 25 (dawna
baza), więc relacja do −40 za „nie znajdź karty" zostaje nietknięta.

## 3. POMIAR PO

| Lądy | PO | Wygrywa |
|---|---|---|
| 0 | land **55** · stwór 32 · czar 27 · bomba 22 | land — brak manabazy bije wszystko |
| 3 | stwór **33** · czar 29 · bomba 22 · land 19 | grywalny stwór, nie kolejny land |
| 8 | bomba **37** · stwór 33 · czar 29 · land 19 | bomba wreszcie w zasięgu |
| 12 | bomba **37** · stwór 33 · czar 29 · land 19 | j.w. |

## 4. Piny i mutacja

`test/audyt-pmssb29-search.test.js` (8): A1–A3 trzy stany manabazy, **A4** kolejność zmienia
się razem z manabazą (PRZED była stała), **B1** szukanie bije rezygnację −40 (kotwica
zgłoszenia właściciela B, Temat 6; rezygnacja istnieje tylko przy szukaniu nieobowiązkowym,
CR 701.23d), B2 baza jako pokrętło, **B3** drabina dochodzi przez pokrętła PMSSB-26 (dowód
jednego źródła prawdy), **B4 granica uczciwości**.

**Granica uczciwości (B4):** czary bez P/T wciąż remisują, bo widok nie wystawia TREŚCI czaru
z biblioteki (strefa ukryta, CR 400.2). Bot nie ma danych, żeby je rozróżnić — pin kotwiczy,
że nie wymyślamy fałszywego rozróżnienia. Część z 245 remisów więc zostanie i tak ma być.

**Mutacja M1** (stara własna reguła) → RED: **{A1, A2, A3, A4, B2, B3}**; B1 i B4 zielone.

## 5. Bramki

- `npm test` **7187/7187** · `npm run build` 70 mod / **4657.6 kB**
- `npm run test:all` — bramka końcowa pętli

## 6. Stan klasy L41 (równoległe miary jakości karty)

| Miara | Gdzie | Stan |
|---|---|---|
| `cardKeepValue` | wspólna: scry, surveil, look_top, clash, mill, discard, **search** | źródło prawdy |
| `handCardKeepValue` | `discardCostPreference` (reguła ciała M408) | zostaje jako suwit dla dużych ciał; `max(ciało, wspólna)` |
| `escapeExileCostOf` | `resolve_delve_exile`, `resolve_escape_exile` | **dwugałęziowy kikut** — forward (brak kart grywalnych z grobu w rejestrze) |
