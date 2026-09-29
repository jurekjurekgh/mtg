# PLAN 2026-09-28 — PMSSB-17: kradzież do końca tury (gain_control_until_end_of_turn)

**Cel rodziny**: `gain_control_until_end_of_turn` — 3 karty: Act of Treason (KTK,
3R sorcery), Awaken the Sleeper (ONE, +untap+haste+niszczenie equipmentu),
Spreading Insurrection (MH2, +storm). Wspólny efekt = czasowa zmiana kontroli
(CR 110.2: właściciel ≠ kontroler; CR 506.4: zmiana kontroli usuwa z walki;
CR 514.2: „do końca tury" kończy się w cleanup — kreatura WRACA przed ich turą).

## Audyt przyczynowo-skutkowy

### R1 — patchwork dwóch epok (L41): DOUBLE-COUNTING
Dwa bloki `gain_control_until_end_of_turn` w TEJ SAMEJ pętli efektów `cast_spell`
sumują się: M257-r5b/C (`3·power + eq(25+5·n)`, kara własnego −40) + M157/L28
(`12 + 2p + t`, kara własnego −70). Pomiar PRZED (potwierdza wzór co do punktu):
4/5 wroga = 50 + 37 (=12+25!) → **87**; własna = 50 − 110 → **−60**.
→ UNIFIKACJA: `gainControlValue` (wzorzec `graveyardShuffleValue` —
„ta sama w obu gałęziach, L41").

### R2 — co kradzież REALNIE daje (drabina)
Kradzież sorcery-speed = karta na JEDEN mój atak + lukę w ich bloku:
1. **Pewny atak z haste w TWARZ WŁAŚCICIELA** (jego życie −moc): `+2·power`.
2. **Luki w bloku**: skradziony dołącza do MOICH atakujących, wypada z ich
   blokujących → `+4·min(luki, 3)`, luki = (moi gotowi + 1) − (ich gotowi − 1).
3. **Equipment (M257, cytat właściciela: „przejąć z equipmentem i go zniszczył")**:
   rider `destroy_equipment_attached` NIE ma własnej wyceny — bonus `25 + 5·n`
   jest JEGO wyceną (guard bot-targeted-effect-valuation tego pilnuje).
4. **Kradzież własna/brak celu = −70** (M231, przebija bazę 50 → poniżej passu).

### R3 — obrona/fog: OŚ NIE ISTNIEJE (werdykt z ujemnym wynikiem!)
Kradzież „do końca tury" wraca w cleanup (CR 514.2) PRZED ich turą — skradziony
napastnik znów u nich może atakować. Wartość obronna = **0** dla sorcery-speed
(wszytkie 3 karty). S07 (życie 5, ich 5/5) = tylko większa moc ataku, bez fog.
(Gdyby kiedyś powstał instant-speed steal — oś wraca w oknie walki.)

### R4 — trwałość: brak premii permanentnej
Karta wraca do właściciela (CR 110.2/514.2) — zysk trwały tylko gdy ZGINIE
(combat/sac). Nie zgadujemy bloków (L41 — jak walka); combo steal+sac obsługuje
rodzina sac-economics (PMSSB-11).

### R5 — storm (Spreading Insurrection) — POZA ZAKRESEM
Kopie kradną kolejne stwory — to rodzina storm, nie ta pętla. Notka w PMSSB.md.

## Model (6 pokręteł)
`gainControlValue(view, target)`:
- cel własny/brak/wrogi-obcy: `−gainControlOwnPenalty (70)`;
- `gainControlStealBase (5)` + `gainControlAttackWeight (2)·moc`
  + `gainControlOpenValue (4)·min(luki,3)` + eq `gainControlEquipBonus (25)
  + gainControlEquipPerItem (5)·n`.

## Kotwice (POMIAR PRZED → PO)
| | PRZED | PO |
|---|---|---|
| S01 treason→4/5 | 87 | 67 |
| S02 treason→2/2 | 74 | 63 |
| S03 treason→własna | −60 | −20 |
| S04 awaken→4/5+EQ | 117 | 97 |
| S05 awaken→4/5 | 87 | 67 |
| S06 ins big/small | 87/74 | 67/63 |
| S07 obrona @5 (5/5) | 92 | 69 |
| S08 kradzież blokera (2×3/3 vs 1/1) | 68 | 69 |

Pomiar: `/tmp/pmssb17-kradziez-przed.mjs`.
Istniejące piny (behawioralne — progi): m231 (własna < pass, wroga > pass),
m157 (cel = najsilniejszy), m257r5b (cast + destroy equipmentu = TAK).
