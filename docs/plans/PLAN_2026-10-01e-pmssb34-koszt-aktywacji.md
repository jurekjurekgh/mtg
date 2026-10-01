# PLAN 2026-10-01e — PMSSB-34: koszt many aktywacji + treść sprzętu (`activate_ability`)

Pętla z **procedury `docs/PMSSB.md`** (krok 0). Wejście: `8ee8eec` (koniec
mikro-pętli PMSSB-33 — triage remisów wyboru, werdykt „0 zmian kodu").
Zlecenie właściciela bez zmian: JEDNA rodzina, audyt przyczynowo-skutkowy
(kiedy efekt jest taktycznie najmocniejszy, w jakich fazach, w czyich turach,
kiedy zysk jest zerowy), potem wycena premiująca momenty sensowne. Bez
strojenia maszynowego (ADR 0018).

## 1. Wybór rodziny (dlaczego NIE attack — i skąd dowód)

PMSSB-33 zamknęła remisy `attack` werdyktem „granica świadomej formuły"
(`power − 1` daje 0 przy power 1) z pinami i uzasadnieniem anty-over-fixowym —
**nie re-audytujemy** (procedura: rodzina rozstrzygnięta jest ZAMKNIĘTA bez
nowego dowodu).

Nowy dowód jest jednak w tej samej tabeli PMSSB-33: wiersz
`activate_ability` (2 remisy) został rozstrzygnięty hasłem „dwa równie dobre
źródła", **bez zastosowania kontroli obowiązkowej procedury (b)**: „wymiar
KOSZTU (S11: 5 vs 2 many nie mogą remisować bez uzasadnienia)". Tymczasem
projekcja tych remisów pokazuje KOSZTY: `mana` **3, 4 i 1** przy tym samym
wyniku 16 (seed 4012 t16) oraz `mana` **3 vs 4** przy 22 (t20). To nie „dwa
równie dobre źródła" — to dwa źródła o RÓŻNYM koszcie i tym samym efekcie.

Rodzina pętli: **zdolności aktywowane (`activate_ability`), wymiar KOSZTU
MANY + TREŚĆ SPRZĘTU.** Nośnik dowodu: `warhammer-wg|innistrad-brg` seed 4012.

## 2. Pomiar PRZED (sonda `/home/user/scratch/pmssb34-koszt-przed.mjs`)

Scenariusze na realnych kartach katalogu (host Hill Giant 3/3, 5 lądów):

| Scenariusz | Ofiary pomiaru | Wynik PRZED |
|---|---|---|
| A. trzy sprzęty na tym samym nosicielu | Squire's Lightblade `{3}` +1/+0 · Brawler's Plate `{4}` +2/+2 trample · Wooden Stake `{1}` +1/+0 | **18,000 · 18,000 · 18,000 — REMIS**, wybór po kolejności ofert |
| B. ten sam pump, różny koszt | Lightblade `{3}` +1/+0 vs Stake `{1}` +1/+0 | **18,000 = 18,000** (identyczny efekt za 3× manę) |
| C. 2 lądy (kontrola) | tylko Stake `{1}` w ofercie | 18,000 — bramka PŁATNOŚCI silnika działa |
| D. kontrola anty-over-fix | Apprentice Wizard `{U},{T}` (efekt `add_mana`) | −4,000 (koszt już w `net`) |

Pierwiastek (kod, `case 'activate_ability'`):

1. **Treść sprzętu nie jest wyceniana przy PIERWSZYM założeniu** — gałąź daje
   `10 + 2 × moc nosiciela`, a pompy sprzętu nie czyta; `equipValuation`
   (używane w gałęzi PRZENIESIENIA i w bramce `nothingAdded`) liczy ciało
   (`wagaSily × P + T`), ale jego wartość nie trafia do wyniku.
   Skutek: +1/+0 (`{1}`) = +2/+2 trample (`{4}`).
2. **Koszt many aktywacji jest niewidzialny** — w całej gałęzi `cost.mana`
   czyta tylko `add_mana` (jako `net`) i koszt energii; żadnej kary za many
   nie ma. Skutek: `{1}` = `{3}` = `{4}`.

Klasa: (1) to rozjazd L41 między dwiema gałęziami TEJ SAMEJ decyzji
(przeniesienie vs pierwsze założenie — komentarz M288/C sam mówi „ta sama
badania co pierwsze założenie"), (2) to kontrola obowiązkowa procedury (b).

## 3. Fale

- **A — treść sprzętu (L41):** `equipValuation` zwraca `bodyValue`
  (`wagaSily × pumpPower + pumpToughness`) — jedno źródło ciała dla obu
  gałęzi; pierwsze założenie dodaje je z pokrętłem `equipPumpBonusPerPoint`
  (1). Bonus tylko w gałęzi normalnej — gałąź „nosiciel nie może atakować"
  liczy ciało po swojemu (2×P + T, wartością obronną) i **zostaje** bez zmian.
- **B — koszt many (kontrola (b)):** `score -= P.abilityManaCostPenalty ×
  (cost.mana + cost.generic)` (1 punkt za manę — ta sama skala co
  `creatureManaCostWeight: 1`, nie nowa arytmetyka). Wyjątek: zdolności
  z efektem `add_mana` (koszt policzony w `net` — inaczej podwójne liczenie).
- **C — dowód:** piny, mutacje, tie-audit PO, sonda PO, bramy.

## 4. Anty-over-fix (M429)

- Najsłabszy realny wariant = dawna wartość: identyczne koszty i identyczne
  treści sprzętów **nadal remisują** (pin), a sprzęt „nic nie dodający" ma
  dalej −12 (`nothingAdded` nietknięte).
- Zdolność o koszcie 0 / samym `{T}` — bez zmian (kara nie ma czego pomniejszać).
- `add_mana` — bez podwójnej kary (kontrola D).

## 5. Znane granice (do raportu)

- Pompa sprzętu liczona wagą `wagaSily` z `equipValuation` (ewazja nosiciela
  podnosi wagę) — spójne z gałęzią przeniesienia, ale to wciąż model
  liniowy (brak progu „od kiedy +1 siły zmienia zegar").
- `cast_spell`: warianty (tryb/kicker) nadal wyceniane bez osobnej kary za
  koszt wariantu — pozycja w kolejce, o ile pojawi się dowód.
- Koszt okazji „ta sama zdolność ma drugi tryb" (Latarnia: scry vs mana) —
  bez zmian, brak dowodu z partii.

## 6. Bramy i higiena

- Piny: `test/audyt-pmssb34-koszt-aktywacji.test.js` (RED→GREEN + mutacje).
- `npm test`, `npm run build`, `npm run test:all`; `bot-scoring-snapshot`
  (dryf = świadomy → regeneracja z uzasadnieniem), tie-audit PO, mirror-eval,
  Żywy Tester PO.
- Sonda i dumpy poza repo (`/home/user/scratch`, `/tmp`) — repo zostaje czyste.

## 7. Zamknięcie (PO) — 2026-10-01e

Wszystkie fale wdrożone; raport w `docs/PMSSB.md` §PMSSB-34, handoff
`docs/setup/HANDOFF_2026-10-01e.md`. Bramki PO: `npm test` 7286/7286 · build
70 mod / 4700,9 kB · `npm run test:all` 7557/7557 · golden-master po świadomej
regeneracji (dowód: oba pokrętła = 0 → stary fixture bit w bit) · tie-audit PO:
`activate_ability` 0 GROZY · mirror 45:51 (96) · Żywy Tester 3/3 czyste.
17 pinów audytów przesuniętych dokładnie o koszt many (lista w raporcie).
