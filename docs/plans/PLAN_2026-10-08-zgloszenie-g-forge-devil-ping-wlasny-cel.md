# Plan 2026-10-08 — zgłoszenie G: bot pali własne ciało OBOWIĄZKOWYM ETB-pingiem (Forge Devil)

- **Gałąź:** `arena/6b9bb8b8-mtg`, PR #158
- **Zgłoszenie właściciela (dosłownie):** „Karta Forge Devil. Bot wystawia ją,
  mimo, że na stole ma tylko swoją kreaturę 1/1. To powoduje, że wystawienie
  Forge Devil zmusza go do zabicia swojej kreatury. Nic nie zyskuje i jeszcze
  traci 1 życia (ETB). Bez sensu. Nie powinien w tej turze wystawiać tej karty
  tylko poczekać aż przeciwnik będzie miał jakąś kartę kreatury na stole albo
  w najgorszym razie bot będzie miał kogoś kto może wchłonąć ten damage."

Oracle (`src/cards/card-data.js:2089`, Forge Devil): „When this creature
enters, it deals 1 damage to target creature and 1 damage to you." Cel
`creature` obejmuje WŁASNIE — bez wrogiego stwora ping jest skazany na własne
ciało.

## Diagnoza (przed kodem)

Pomiar sondą (`.arena/probe-g-forge.mjs`, prawdziwa karta z katalogu, manę
dostarcza `addMana`):

| scena | score PRZED | wybór | po fixie |
|---|---|---|---|
| A) własna 1/1 tylko | **62,1** | cast | **pass (−3,6)** ✓ zgłoszenie |
| B) własna 3/3 (wchłania) | 62,1 | cast | cast 62,1 ✓ (dozwolone) |
| C) wróg ma 1/1 | 64,8 | cast | cast 64,8 ✓ (pin M103/A) |
| D) pusty stół | −9,9 | pass | pass (−3,6) ✓ (pin M103/A) |

Dwie przyczyny, obie w `src/controllers/heuristic-bot.js`:

1. **Za gruba bramka M103/A.** Strażnik pytał „czy na stole jest JAKIKOLWIEK
   stwór" (`anyCreatureOnBoard`), nie „czy istnieje cel, w który ping NIE idzie
   we własne ciało". Własna 1/1 spełniała pierwszą bramkę → zero kary.
2. **Brak kary za własny cel w premii ETB.** `ETB_EFFECT_BONUS.damage` liczy
   wartość celu, ale trigger z celem `creature` (obejmuje własnych) nie odróżniał
   „biję wroga" od „muszę bić siebie".

Sonda `.arena/probe-g2.mjs` — katalog kształtu „ETB + damage + requiresTarget":

| karta | requiresTarget | kwota | mayFire |
|---|---|---|---|
| `forge-devil` | `creature` | 1 (stała) | nie |
| `reclusive-artificer` | `creature` | `artifacts_you_control` (dynamiczna) | **tak** |
| `warmaker-gunship` | `creature_opponent_controls` | dynamiczna | nie |
| `token_reliquary_dragon` | `any_target` | stała | nie |

Konsekwencja: detektor musi brać wyłącznie OBOWIĄZKOWY ping (bez `mayFire` —
odmowa jest darmowa), a kwota nie-liczbowa (wariant dynamiczny) nie jest
wyliczana z widoku — wtedy 0, bez wymyślania.

## Fix

1. **Nowy helper `etbForcedOwnPingPenalty(view, def, spec, amount)`** (tuż przed
   `etbEnterBonusValue`, ~linia 1952) — liczy OFIARY pingu, nie „czy jest
   jakikolwiek stwór":
   - cel po stronie PRZECIWNIKA (stwor albo gracz — `objectOnBoard` daje null
     dla gracza) → **0** (ping idzie w niego),
   - jest własne ciało, które N obrażeń PRZETRWA (`indestructible` też) → **0**
     (właściciel: „w najgorszym razie bot będzie miał kogoś, kto może wchłonąć
     ten damage"),
   - spłoną WSZYSCY kandydaci (własne stwory + sam wchodzący) → kara = ciało
     **najtańszej** ofiary,
   - brak legalnego celu w ogóle → kara **80** jak w M103/A (trigger fizzluje,
     karta i mana zmarnowane).

   Generycznie po deskryptorze `requiresTarget` (ADR 0002); P/T, obrażenia i
   keywordy wyłącznie z `PlayerView` (ADR 0017). Uwaga: filtr `controllerId` na
   liście własnych ciała jest bezdziedzny — wczesny return już zagwarantował,
   że wszyscy kandydaci są nasi (dlatego go nie ma; mutacja usunięcia filtra
   jest równoważna).
2. **Blok M103/A przepisany** (~linia 8420–8445): zamiast bramki „anyCreatureOn
   Board" pętla po `abilities` z detektorem przymusowego pingu
   (`triggered` + `enter_battlefield` + **brak `mayFire`** +
   `requiresTarget.type === 'creature'` + efekt `damage`), nosząca
   `etbPingSpec` / `etbPingAmount`, potem `score -= etbForcedOwnPingPenalty(...)`.

Klasa awarii to **L14** (bramka zastępcza zamiast warunku): „jest jakikolwiek
stwór na stole" jest łatwiejsze do sprawdzenia niż „ping NIE trafi we własne
ciało", i dlatego przeszło. WPIS do `docs/LESSONS.md` celowo NIE dodany (budżet
lektury startowej — ten sam rachunek co w planie F).

## Cytaty CR (ADR 0030 — tylko z fetch)

Plik CR: mirror `nwgarne/mtg-data` (`gh api .../contents/rules/cr-raw.txt`),
SHA-256 `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca` —
identyczny z zarejestrowanym w `test/helpers/cr-numery-tabela.js` (wydanie
2026-09-25). Dosłowne:

- **603.6a** „Enters-the-battlefield abilities trigger when a permanent enters
  the battlefield. These are written, “When [this object] enters, . . . “ or
  “Whenever a [type] enters, . . .” Each time an event puts one or more
  permanents onto the battlefield, all permanents on the battlefield (including
  the newcomers) are checked for any enters-the-battlefield triggers that match
  the event.” → sam wchodzący stwór jest legalnym celem własnego pingu, więc
  PUSTY stół też musi być karany (M103/A).
- **704.5g** „If a creature has toughness greater than 0, it has damage marked
  on it, and the total damage marked on it is greater than or equal to its
  toughness, that creature has been dealt lethal damage and is destroyed.
  Regeneration can replace this event.” → test „SPŁONIE".
- **702.12b** „A permanent with indestructible can’t be destroyed. Such
  permanents aren’t destroyed by lethal damage, and they ignore the state-based
  action that checks for lethal damage (see rule 704.5g).” → ciało
  indestructible NIGDY nie jest ofiarą.

Numery `603.6a`, `702.12b`, `704.5g` są już w tabeli — brak nowych wpisów.

## Kroki

- [x] **G/0** — diagnoza + pomiar przed fixem (sondy `.arena/probe-g-forge.mjs`,
      `.arena/probe-g2.mjs`).
- [x] **G/1** — helper `etbForcedOwnPingPenalty` + przepisany blok M103/A.
- [x] **G/2** — pomiar po fixie (sondy `.arena/probe-g3.mjs`, `.arena/probe-g4.mjs`).
- [x] **G/3** — testy G/1–G/5 w
      `test/zgloszenie-g-forge-devil-ping-wlasny-cel.test.js` (RED→GREEN + dowód
      mutacyjny).
- [x] **G/4** — bramka fast + piny zielone, commit, push, opis PR.
- [x] **G/5** — dokumentacja: ten plan, `PROJECT_HISTORY.md`, handoff sesji.

## Pomiar po fixie

- Scenariusz właściciela (własna 1/1 tylko): cast **−3,6** < pass ✓ (przed
  fixem 62,1).
- Dwie własne 1/1 (obie ofiary): pass ✓; 1/1 z już naniesionym obrażeniem:
  pass ✓.
- Własna 3/3 i 2/2 (wchłaniają 1 obrażenie): cast 62,1 ✓ — właściciel dopuszcza
  „kogoś, kto może wchłonąć ten damage".
- Wróg ma stwora: cast 64,8 (pin M103/A — ping idzie w niego).
- PUSTY stół: pass (−3,6) — pin M103/A, ale kara teraz = ciało wchodzącego
  stwora (73), nie płaskie 80.
- Wróg ma tylko artefakt (nie stwora): pass (**−0,9**) — przed fixem błędnie
  cast 64,8; to samo złamanie bramki co w zgłoszeniu, inną kartą.
- Reclusive Artificer (trigger OPCJONALNY `mayFire`): cast 63,9 — brak kary,
  odmowa jest darmowa.

## Dowód mutacyjny (testy G muszą łapać usunięcie fixa)

Sonda `.arena/probe-g5.mjs`: w katalogu tylko `forge-devil` (obowiązkowy, stała
kwota) i `reclusive-artificer` (opcjonalny, kwota dynamiczna) spełniają kształt
triggera — obie karty są STWORAMI, więc dwie gałęzie helpera są dziś defensywne.

| mutacja | pass / fail | co łapie |
|---|---|---|
| mG1: usunięcie filtra „SPŁONIE" (każde własne ciało = ofiara) | 8 / **2** | G/2, G/2b — wchłanianie obrażeń |
| mG2: usunięcie wczesnego returna „wróg ma cel" | 9 / **1** | G/2c — pin M103/A (ping w wrogie ciało) |
| mG3: płaska kara 80 zamiast min po ofiarach | 9 / **1** | G/5 — minimum po ofiarach (bot pali najtańsze ciało) |
| mG4: usunięcie filtra `controllerId` | 10 / 0 | **równoważna** — wczesny return już gwarantuje własność kandydatów |
| mG5: usunięcie filtra `mayFire` | 10 / 0 | **równoważna dla dziś** — jedyna karta `mayFire` ma kwotę dynamiczną, a nie-liczbowa kwota daje 0 |

Po przywróceniu kodu: 10/10.
