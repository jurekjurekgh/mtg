# PLAN M257 E/F — znaleziska pętli jakości (mulligan-bottom auto-rozstrzygnięcie, regenerate jako combat trick) (2026-08-30)

**Sesja:** `arena/01a04e98-mtg` (PR #88 — kontynuacja; 1 sesja = 1 gałąź = 1 PR).
**Baza:** `8b4c8a9` (po r5b: bramka 3805/3805, build 2932.3 kB).

## Źródło zlecenia

Znaleziska mojej pętli jakości (rundy 4/5) — lista „do zdiagnozowania” z
notatek sesji, potwierdzone diagnostyką w kodzie przed tym planem:

- **E.** Auto-rozstrzyganie wyboru odrzuceń (odłożenie kart na spód po
  mulliganie), gdy liczba kart w ręce = wymagana liczba — wybór nie istnieje,
  bo jedyna legalna decyzja to „wszystkie na spód”.
- **F.** Regenerate: bot rzucał go w Głównych 1 (G1) bez nadchodzącej śmierci
  kreatury; to combat trick — ma sens w momencie lethalu.

## Rozpoznanie (root cause przed kodowaniem)

### E — wymuszony wybór mulligan-bottom wystawiany jako decyzja

`execute()` → mulligan (CR 103.4), gałąż `keep: false`
(`game-state.js` ≈:1360–1397): po wrzuceniu ręki na spód i tasowaniu gracz
dobiera 7 — ale z małej biblioteki mniej (bramka `M100/E10` — po 7.
mulliganie ręka może mieć 0 kart). Potem:

```js
state.pendingMulliganBottom = { playerId, count, handIds: newHand, ... };
```

a walidacja (`resolve_mulligan_bottom_choice`, ≈:1314) liczy
`expected = Math.min(pending.count, pending.handIds.length)`. Gdy
`newHand.length <= count` (mała biblioteka — dobiora się nie więcej niż
`count` kart), `expected = newHand.length` — **jedyna legalna kombinacja to
CAŁA ręka**. Wybór nie istnieje, a silnik/UI (wizard `mulliganBottomPlanOf`,
enumeracja podzbiorów ≈:5244) wystawia go jako decyzję — bezsensowna
ekranówka (w skrajnym wariancie: „wybierz 0 kart” przy pustej ręce).

Wzorzec fixu: auto-akcja turowa — `declare_attackers` z pustym zbiorem
auto-deklaruje (r4/A, CR 508.1; `game-state.js` ≈:4213) i `drawStepTurnBasedAction`
(CR 504.1). Tu: w gałęzi `keep: false`, po wyliczeniu `newHand` — jeśli
`newHand.length <= count`, wykonać odłożenie inline (te same ruchy + eventy
co w `resolve_mulligan_bottom_choice`) i NIE stawiać `pendingMulliganBottom`.

### F — regenerate wyceniany „zagrożeniem” spekulacyjnym (B3)

`isCreatureThreatened` (M218/4, `heuristic-bot.js` ≈:714) — trzy gałęzie:

1. **Wojna zadeklarowana** — `combatOutcome(view, creature, {})`:
   `attackerDies` albo `creature.id ∈ deadBlockers`. W G1 (brak `view.combat`)
   zwraca `null` — nie strzela.
2. **Lethal już zadany** — `damage >= toughness` (SBA 704.5g czeka).
   „Moment lethalu” — dokładnie window, o które prosi właściciel.
3. **B3 — spekulacja** — `removalSpells.size && opponentOpenMana >= minRemovalCost`
   i w ręce wroga spell o `amount >= toughness` w otwartej mani. Model
   hipergeometryczny ręki — **może** zabić, nie **zabija**.

Jedyne użycia: dwa miejsca wyceny regenerate (efekt czaru ≈:2476 — Exterminator
Magmarch; zdolność/keyword ≈:2882 — Drudge Skeletons). W G1 strzela WYŁĄCZNIE
gałąź 3 — bot rzuca Regenerate „na wszelki wypadek” (premia +30 nad bazą).
Regeneracja trwa do końca tury (CR 702.14) — zagrożenie z następnej tury
tarczę nie złapie, a zagrożenie „z ręki wroga” jest spekulacją. Reguła
repo (M236/2, `permanentDoomedThisTurn`): spekulacja B3 jest „za mało pewna”,
by uznać permanent za skazany. Fix: usunąć gałąź 3 — regenerate = combat
trick tylko przy pewnej śmierci w tej turze (gałęzie 1+2).

**Znane ograniczenie (udokumentowane, nie fix):** lethal spell NA STOSIE
wystawiony na stwór (obrażenia nie zadane jeszcze) gałęzi 1/2 nie łapie —
ale tarcza pod kontraktowalny threat to też zakład (właściciel może mieć
counter — regenerate byłby stratą); minimalny zakres = pewna śmierć.

## Etapy (każdy = osobny zielony commit)

Kolejność: E → F (E = silnik, F = bot; F po E, bo E zmienia stan mulliganów
w testach, których F by nie ruszał, a bramka jest wspólna). Bramka każdego
etapu: `node tools/run-tests.mjs all` (brama CI) + `node tools/build.mjs`;
F dodatkowo benchmark quick przed/po (ADR 0018, bez `--full`).

### Etap E — auto-rozstrzygnięcie mulligan-bottom przy wymuszonej liczbie ✅ DONE (38dc74c)
1. `game-state.js`, gałąź `keep: false` (mulligan londyński): po
   `const newHand = ...` — jeśli `newHand.length <= count`: ruchy
   `newHand` na spód (`moveObjectDirectly` + `object_moved` z
   `mulliganBottom: true`) + event `mulligan_bottom_resolved`,
   priorytet dla `playerId` (gracz decyduje dalej: keep albo kolejny
   mulligan) — NIE stawiać `pendingMulliganBottom`. Komentarz z CR 103.4
   („equal to that many”) + powiązanie z r4/A (auto-akcja turowa, CR 508.1).
2. Testy `test/m257ef-znalezione-petla.test.js`:
   - E1: mała biblioteka (talie 1-kartowe przez `setupCardMatch`) —
     `keep: false` → `pendingMulliganBottom === null`, karta na spodzie,
     `mulliganCounts.p1 === 1`, kolejka `pendingMulligans` poszła dalej,
     gra dalej legalna (keep obu → `game_started`).
   - E2 (anti-overfix): talie 60-kartowe — `keep: false` →
     `pendingMulliganBottom` STAWIANY (count 1, 7 kart), oferta
     `resolve_mulligan_bottom_choice` istnieje (7 wariantów nazw).
   - E3 (anti-overfix): biblioteka 3 karty (dobiera 3 > count 1) →
     wybór wystawiany (nie wymuszony).
   - RED→GREEN dowiedzione `git stash`.
3. Bramka: `node tools/run-tests.mjs all` + `node tools/build.mjs`.

### Etap F — regenerate: tylko pewna śmierć w tej turze ✅ DONE (6a390ef)
1. `heuristic-bot.js` `isCreatureThreatened`: usunąć gałąź 3 (B3
   `removalSpells`); aktualizacja docblocka (M218/4 → M257/F: pewna śmierć =
   walka zadeklarowana albo lethal już zadany; spekulacja ręki wyjęta —
   M236/2 „za mało pewne”).
2. Benchmark quick PRZED (bazą `8b4c8a9`).
3. Testy (dopisane do `test/m257ef-znalezione-petla.test.js`):
   - F1: G1 (main1), stwór 1/1 zdrowy (damage 0, bez walki), wróg z otwartą
     maną i `Lightning Bolt` w ręce (B3 strzelałby) — bot NIE rzuca
     Regenerate (score < threshold / komenda nie wygrywa nad pass) —
     reprodukcja zgłoszenia.
   - F2 (anti-overfix — „moment lethalu”): ten sam stwór z `damage = 1`
     (lethal zadany, SBA czeka) — bot RZUCA (premia +30).
   - F3 (anti-overfix — walka): stwór zadeklarowany atakującym/blokerem
     ginącym w `combatOutcome` — bot RZUCA.
   - RED→GREEN dowiedzione `git stash` (F1 fail na starym kodzie).
4. Benchmark quick PO — porównanie; bramka: `node tools/run-tests.mjs all`
   + `node tools/build.mjs`.

### Etap G — dokumentacja — commit ✅ IN PROGRESS
- Opis PR #88: sekcja „Etap 10” (E/F) + „Jak sprawdzono” (bramki +
  benchmark); `docs/PROJECT_HISTORY.md` (wpis sesji); aktualizacja planu
  (odhaczenia). Push.

## Ryzyka / pułapki

- **E:** kolejność eventów — auto-rozstrzygnięcie musi dać TEN SAM ślad
  (object_moved… + mulligan_bottom_resolved) co droga przez komendę (log
  deterministyczny, ADR 0005). `moveObjectDirectly` pilnuje spójności stref.
- **E:** po auto-rozstrzygnięciu gracz MOŻE mulliganować dalej (keep:false
  z licznikiem count+1) albo keep — kolejka `pendingMulligans` i
  `mulligan_below_zero_hand` (≥7) bez zmian; `untapStepTurnBasedAction`
  blokuje przewinięcie, dopóki `pendingMulligans` otwarte (bez zmian).
- **E:** `legalCommands` (≈:5244) i wizard `mulliganBottomPlanOf` (wymaga
  ≥2 komend grupy) — przy braku `pendingMulliganBottom` nic nie wystawia
  (droga auto = zero komend, zero UI) — zweryfikowane, test E1 pilnuje.
- **F:** usunięcie gałęzi 3 nie rusza B3 nigdzie indziej (funkcja
  `isCreatureThreatened` ma dokładnie 2 użycia — regenerate; `removalSpells`
  i `opponentOpenMana` zostają dla reszty wycen — nie usuwać).
- **F:** gałąź 2 (`damage >= toughness`) liczy wytrzymałość bazową
  (bez pumpów) — zachowanie dotychczasowe, nie zmieniam (skala fixu).
- **F:** benchmark quick — Regenerate w macierzy quick? Karta z batcha
  właściciela (Exterminator Magmarch, Drudge Skeletons) — jeśli poza
  macierzą, quick pokaże „bez zmian” i to akceptowalny dowód braku regresji
  (STROJENIE_BOTA.md: adopcja STROJENIA wymaga full — tu nie strojenie,
  lecz fix zachowania, quick = kontrola regresji).
- Bash ucina długie wyjścia (L78); pliki z polską treścią edytuj przez
  python3 (ENVIRONMENT §4); RED→GREEN przez `git stash` (wzorzec r5b C/D).
