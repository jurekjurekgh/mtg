# PLAN 2026-10-04d — PMSSB-55: kondensacja rejestru lekcji (batch 2)

Wejście: kolejka handoffu `2026-10-04c` poz. 1 („najgrubsze wpisy: L164, L169,
L165, L168, L163; zapas 130 t.; po każdej edycji mierzyć wpis przed/po i zapas”).

## Zakres

5 najgrubszych wpisów rejestru → postać reguła + strażnik + `→ narracja`;
proza (przypadek, pełne punkty reguły) → `docs/LESSONS_PRZYPADKI.md` pod tym
samym numerem, z markerem `**Proza z rejestru (kondensacja 2026-10-04c):**`.

Procedura bezpieczna (po incydencie slice-based z 04a): backup /tmp → podmiana
DOKŁADNEGO bloku (regex od nagłówka do następnego `## L`) → asercje (blok
nieunikalny, nagłówek identyczny, markery reguły/strażnika obecne, brak
`**Objaw:**`, proza > 400 B, stały licznik wpisów rejestru i sekcji archiwum)
→ strażnicy docs.

## Pomiar

| wpis | przed | po | proza → archiwum |
|---|---|---|---|
| L164 | 1637 B | 904 B | 1430 B |
| L163 | 1519 B | 964 B | 1301 B |
| L169 | 1369 B | 1039 B | 1226 B |
| L165 | 1367 B | 994 B | 1206 B |
| L168 | 1202 B | 948 B | 1051 B |

`docs/LESSONS.md`: **138 219 → 135 984 B** (−2235 B). Budżet lektury:
**99 870 → 99 072 t.** (zapas **130 → 928**). Żaden numer nie zniknął
(168 wpisów, stały licznik `## L\d+ (`); 5 nowych markerów w archiwum;
odsyłacze `→ narracja` bez zmian (oba końce istnieją).

## Kryteria ukończenia

1. 5 wpisów skróconych, proza w archiwum — ✅ (tabela wyżej).
2. Strażnicy docs **25/25** (kontrakt kondensacji: ≥50 odsyłaczy, adresaci,
   reguła w skrócie, brak prozy w rejestrze).
3. Bramki: `npm test` **7540/7540** EXIT 0 (117,8 s) · build 70 modułów /
   4814,2 kB · brama PR `npm run test:all` na zamrożonym tipie (liczby
   w body PR i handoffie 04d).

## Kolejna partia (gdy znów potrzebny zapas)

Najgrubsze po tym cięciu: L48 (1477 B — metodologia oferty/walidacji),
L5 (1299 B — strażnik mierzy regułę), L54 (1234 B), L59 (1218 B), L55 (1121 B).
