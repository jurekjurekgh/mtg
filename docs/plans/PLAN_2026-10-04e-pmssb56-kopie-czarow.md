# PLAN 2026-10-04e — PMSSB-56: scoring bota — zapłata za redundantne KOPIE czarów

Wejście: dyrektywa właściciela z 2026-10-04 („dodawaj mechaniki i pomiary, które
są niezbędne do poprawnego scoringu bota — nie pomijaj problemów, tylko je
rozwiązuj”) + pomiar 2 z PMSSB-53 (nadpłata za kopie przy wardzie).

## Pomiar A — zdrowie scoringu (czy bot w ogóle coś „niewycenionego” wybiera)

Nowe narzędzie `tools/scoring-unvalued-audit.mjs`: partie self-play heuristic
przez harness benchmarku (obie strony niosą telemetrię `unvaluedDecisions()`)
+ raport typów spadających do `default: finish(0)` (wybór z kolejności ofert,
antywzorzec L41). Wynik na katalogu BENCH_DECKS: **12 partii / 6255 komend /
0 decyzji bez wyceny** (exit 0). Klasa „brak case” jest więc domknięta
statycznie (strażnik PMSSB-54) i mierzalnie (to narzędzie).

## Pomiar B — ward × kopie (RED)

Scena: p1 z `spreading-insurrection` (storm=2) i 14 Mountainami, p2 z zakrytym
disguise (`riftburst-hellion`, 2/2 z ward {2}).
- **PRZED:** bot płaci **3× {2}** (oryginał + 2 kopie) za JEDNO przejęcie
  kontroli — kopie i oryginał celują w ten sam stwór, efekt się nie kumuluje,
  a przegrane kopie i tak nic nie zmieniają.
- **PO:** dokładnie **1 płatność**, efekt dostarczony (przejęcie kontroli).

## Pomiar C — zapłata kontrująca × kopie (RED, ta sama klasa)

Scena: p1 rzuca stormem (bez warda), p2 w odpowiedzi celuje `frightful-delusion`
(„zapłać {1}, a czar zostanie”) w jedną z KOPII.
- **PRZED:** bot płaci {1} (pin E9 był RED: `[true]` vs `[false]`).
- **PO:** odmowa — efekt dostarcza instancja pozostawiona na stosie.

## Mechanika (generycznie, ADR 0002/0017)

1. **Widok** (`game-state.js`, wpis stosu): `copy: true` dla `isSpellCopy`
   (CR 707.10) — kopia na stosie to informacja publiczna; bez niej wycena nie
   odróżniała kopii od oryginału (luka kompletności widoku, ADR 0017).
2. **Wycena** (`heuristic-bot.js`): `NON_ACCUMULATING_SPELL_EFFECTS` (świadomie
   wąska lista efektów idempotentnych na tym samym celu: przejęcie kontroli,
   destroy/exile, bounce, kontra, tap/untap, znaczniki „nie może blokować”,
   granty słów-kluczy do końca tury; obrażenia/pumpy/dobieranie/liczniki życia
   NIE należą) + `redundantSpellCopyPayment(view, cmd)`: kara dla zapłaty tylko
   gdy ratowany wpis jest KOPIĄ, WSZYSTKIE jego efekty są w klasie
   nie-kumulującej się i na stosie wisi inna instancja tej samej karty z tym
   samym zestawem celów. Karzemy WYŁĄCZNIE kopie — oryginał zawsze może
   zapłacić (inaczej instancje odmawiałyby sobie nawzajem i efekt przepadał).
3. **Pokrętło** (`heuristic-params.js`): `redundantCopyPayPenalty: 120` —
   wynik zapłaty 80 − kara (ward) / 85 − kara (kontra); ×0 = stan sprzed
   naprawy (M429 anty-over-fix).

## Piny (`test/pmssb56-ward-kopie-redundancja.test.js`, 12)

E1 E2E storm × ward (1 płatność + efekt dostarczony); E2 pokrętło ×0
(3 płatności = dawny stan); E3 anty-over-fix: kopia `damage` ⇒ płaci;
E4 brak bliźniaka; E5 inny zestaw celów; E6 oryginał między kopiami;
E7 efekt nieznany; E8 GREEN wprost na odmowie; E9 E2E storm × kontra;
E10–E12 kontra: kumulujący się / brak bliźniaka / nie-kumulujący.

## Dowód mutacyjny (L13)

- m1 (reguła wyłączona) → E1 + E8 czerwone;
- m2 (flaga `copy` zdjęta z widoku) → E1 czerwone;
- m3 (`damage` dopisane do listy) → E3 czerwone (dowód, że pin anty-over-fix żyje);
- m4 (gałąź kontry wyłączona) → E9 + E12 czerwone;
- po każdym restorze z /tmp (`cmp`) → GREEN 12/12, `src/` bez zmian.

## Kryteria ukończenia

1. Trzy pomiary (A/B/C) z liczbami — ✅.
2. Mechanika: widok + reguła + pokrętło, bez nazw kart (ADR 0002) — ✅.
3. Bramki: `npm test` **7552/7552** EXIT 0 (+12 pinów), build 70 modułów /
   4818,8 kB, brama PR `npm run test:all` na zamrożonym tipie (liczby w body PR
   i handoffie 04e).
4. Budżet lektury: L178 (~0,4k t.) zapłacone własnym zapasem; zapas po rundzie
   320 t. — następna partia kondensacji w kolejce (L48, L5, L54).
