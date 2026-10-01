# PLAN 2026-10-01d — PMSSB-33 (mikro-pętla): triage remisów wyboru

Pętla z **procedury `docs/PMSSB.md`** (krok 0), tryb mikro: obiekt pętli to nie
jedna rodzina efektów, a **konkretny zestaw remisów decyzyjnych** zgłoszony
przez pomiar poprzedniej pętli. Zlecenie właściciela bez zmian: audyt
przyczynowo-skutkowy wyceny (kiedy zysk jest realny, a kiedy zerowy) i wdrożenie
wniosków — **bez strojenia maszynowego** (ADR 0018).

Wejście: `860c8b5` (koniec sesji 01c) + tie-audit PO pętli PMSSB-32.

## 1. Obiekt pętli (dlaczego remisy, a nie rodzina)

Tie-audit (`tools/bot-tie-audit.mjs --gry=2`, 24 partie / 12 785 decyzji) dał
po PMSSB-32 poprawę (28,3% → **27,0%** remisów; 10,8% → **9,7%** realnych), ale
zostawił **16 „GROZY"** — remisy przy RÓŻNYCH danych wejściowych decyzji:

| Kind | Ile | Wzorzec z audytu |
|---|---|---|
| `attack` | 9 | „+1 trafienie i +1 ginie" (m.in. dwa razy 0, raz 1030, raz 30) |
| `block` | 2 | permutacje przypisania blokerów |
| `activate_ability` | 2 | dwa równie dobre źródła |
| `cast_spell` | 1 | cel/wariant o równej wartości |
| `resolve_color_choice` | 1 | dwa równie dobre kolory |
| `resolve_discard_choice` | 1 | dwie równie dobre karty |

To klasyczna praca mikro-pętli: ustalić, czy któraś z tych równości jest
**ślepotą wyceny** (nieczytywanym wymiarem — wtedy fala zmian), czy
**świadomą równością wartości** (wtedy werdykt + piny, żeby następna pętla nie
zaczynała od zera).

## 2. Metoda: projekcja danych, nie wynik partii

`--json` audytu drukuje dla każdej pary remisowej **PROJEKCJĘ decyzji** — dane,
które faza wyceny realnie czyta (dla ataku `{atakuje, trafienie, ginie, zabici,
smiertelny}`). Sposób rozstrzygania:

1. różna projekcja + różny wynik w sondzie ⇒ wymiar czytany i wyceniany
   (równość może być granicą formuły),
2. różna projekcja + identyczny wynik w sondzie ⇒ wymiar pominięty (kandydat na
   falę),
3. identyczna projekcja ⇒ duplikat/no-op (nie problem wyceny).

Sondy (`/tmp/pmssb33-probe.mjs`, `/tmp/pmssb33-probe-blok.mjs`) używają tego
samego harnessu co piny PMSSB-31/32 (fixture z DRUKIEM karty), więc pomiar jest
przenośny do pinu 1:1.

## 3. Rozstrzygnięcie (szczegóły w `docs/PMSSB.md` §PMSSB-33)

- **`attack` = granica świadomej formuły.** Gałąź wymiany (`power ≥ wytrz.
  blokera`, stwór ginie) to `power − 1` — przy power 1 daje **dokładnie 0**,
  czyli tyle, ile brak ataku; przy power 2 → +1, przy 3/3 w 1/1 → +6, a na
  pustym stole → 12. Wycena ROZRÓŻNIA; remisy 0/0 to atak bez zysku, 1030 to
  przecięcie progu przy wygrywającej już decyzji.
- **`block` = permutacje.** Dwa identyczne przypisania (te same zgony, te same
  obrażenia) dają ten sam wynik — przy różnych ciałach wycena rozróżnia
  (zmierzone 4 > 2).
- **cel (`activate_ability`/`cast_spell`/`color`/`discard`)** = wybór równie
  dobrych celów/źródeł; brak dowodu złej decyzji z partii ⇒ bez zmian.

**Werdykt: 0 zmian kodu** (żadna z 16 równości nie jest ślepotą; zmiana
„naprawiająca" remisy byłaby over-fixem — łamałaby anty-over-fix z procedury).

## 4. Trwałość werdyktu

- piny: `test/audyt-pmssb33-remisy-wyboru.test.js` (7) — zamrażają równość
  ORAZ zdolność rozróżniania (A2/A3/A5/B2),
- mutacje: `power − 1 → power` czerwieni A1/A2/A4; `attackOpenBoardBonus: 0`
  czerwieni A5,
- wniosek proceduralny: per-kind `--gate=attack|block` jest narzędziem
  POLOWANIA, nie bramką CI (na zamrożonym drzewie czerwony z definicji).

## 5. Bramy

`npm test` 7277/7277 · `npm run test:all` 7548/7548 · build 70 / 4697,0 kB.
