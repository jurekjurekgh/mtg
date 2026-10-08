# Plan 2026-10-08 — zgłoszenie F: trigger obrażeniowy marnuje lethal (Warmaker Gunship)

- **Gałąź:** `arena/6b9bb8b8-mtg`, PR #158
- **Zgłoszenie właściciela (dosłownie):** „Karta Warmaker Gunship. When this
  Spacecraft enters, it deals damage equal to the number of artifacts you
  control to target creature an opponent controls. Bot wprowadza go do gry. Ma
  1 artefakt, więc zada 1 obrażenie. Powinien wybrać taką moją kreaturę, dla
  której będzie to lethal damage (ma 4 do wyboru, w tym dwie 1/1). Mimo to bot
  wybiera kreaturę 2/4 i nie robi mu żadnej krzywdy, marnując tą zdolność.
  Scoring do poprawy."

## Diagnoza (przed kodem)

Pomiar sondą (`.arena/probe-f-warmaker.mjs`, prawdziwa karta z katalogu,
1 artefakt → kwota 1, cele: dwie 1/1, 2/4, 3/3):

| oferta | score (przed fixem) | uwaga |
|---|---|---|
| `resolve_trigger_target(c33)` (3/3) | **39** | wybór bota |
| `resolve_trigger_target(c24)` (2/4) | 38 | największe ciało |
| `resolve_trigger_target(c11a/c11b)` (1/1) | 33 | **lethal** — najniższa nota |

Przyczyna: gałąź `resolve_trigger_target` w `heuristic-bot.js` wycenia cel wrogi
jako `30 + wartość` (`wartość = 2P + T`), a świadomość śmiertelności (`kill`)
pochodzi WYŁĄCZNIE z `debuffKills()` (wymaga `cmd.debuff`). Efekt `damage` nie
nosił kwoty w komendzie, więc większe ciało zawsze wygrywało — niezależnie od
tego, czy kwota je zabija.

Kwantytatywnie: 2/4 → 30 + 2·2 + 4 = **38**, 1/1 → 30 + 2·1 + 1 = **33**.
Dokładnie jak w zgłoszeniu.

Brak kwoty to sama przyczyna: komenda `resolve_trigger_target` (budowana w
`src/engine/game-state.js`) niesie flagi `friendly` / `removesTarget` /
`debuff` / `pump` / `evasionGrant`, ale **nie** ilości obrażeń; widok
`pendingTriggerTarget` ma `effectType` i `divisionTotal` (tylko dla
`damage_divided`). Karty z tym efektem w katalogu (sonda
`.arena/probe-f3.mjs`): `warmaker-gunship`, `reclusive-artificer` (obie z kwotą
dynamiczną `artifacts_you_control`), `forge-devil`, `token_reliquary_dragon`,
`molten-nursery` (kwota stała). Wszystkie JEDNOCELOWE — nie ma triggera
obrażeniowego wielocelowego.

## Fix

1. **Jeden resolver kwoty (L41).** `src/engine/effects.js`: wydzielony i
   wyeksportowany `resolveDamageAmount(state, effect, sourceObject, targetId)`
   — dokładnie ten blok, który rozstrzygał kwotę w `applyEffect` (warianty
   `artifacts_you_control` / `basic_land_types_you_control` /
   `amountIfTargetHasCounter` / `amountIfAddendum`). Rozstrzyganie efektu
   korzysta z helpera — zero kopii logiki.
2. **Oferta niesie kwotę.** `src/engine/game-state.js`: oferty
   `resolve_trigger_target` (ścieżka jednocelowa, w tym „brak celu") dostają
   pole `damage` = kwota policzona TYM SAM resolverem (wariant zależny od celu
   dostaje inną kwotę innej ofercie). Deskryptor intencji
   `triggerTargetDamageEffectOf` w `effect-intent.js` (wzorzec
   `triggerTargetDebuffOf`).
3. **Śmiertelność obrażeń w bocie.** `src/controllers/heuristic-bot.js`:
   z `damageTargetValue` wydzielony JEDEN predykat `damageIsLethal(view,
   targetId, amount)` (CR 704.5g — naniesione wcześniej + te ≥ wytrzymałości;
   704.5i — planswalker przy lojalności 0; 615.6 — prewencja cofa; 702.12b —
   indestructible nie ginie). Gałąź triggera składa go z `debuffKills` w
   istniejącą premię `kill` (+60 na wrogim, −60 na własnym) — obie strony.

Efekt (ten sam scenariusz): 1/1 → **93**, 2/4 → 38, 3/3 → 39. Bot wybiera 1/1.

## Cytaty CR (ADR 0030 — tylko z fetch)

Plik CR: mirror `nwgarne/mtg-data` (`gh api .../contents/rules/cr-raw.txt`),
SHA-256 `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca` —
identyczny z zarejestrowanym w `test/helpers/cr-numery-tabela.js` (wydanie
2026-09-25). Dosłowne:

- **704.5g** „If a creature has toughness greater than 0, it has damage marked
  on it, and the total damage marked on it is greater than or equal to its
  toughness, that creature has been dealt lethal damage and is destroyed.
  Regeneration can replace this event."
- **704.5i** „If a planeswalker has loyalty 0, it's put into its owner's
  graveyard."
- **615.6** „If damage that would be dealt is prevented, it never happens. …"
- **702.12b** „A permanent with indestructible can't be destroyed. Such
  permanents aren't destroyed by lethal damage, and they ignore the
  state-based action that checks for lethal damage (see rule 704.5g)."
- **608.2h** „If an effect requires information from the game (such as the
  number of creatures on the battlefield), the answer is determined only once,
  when the effect is applied. …"

Numery `702.12b` i `704.5i` dopisane do tabeli (`--zapisz` na pobranym pliku).

## Kroki

- [x] **F/0** — diagnoza + pomiar przed fixem (sonda, liczby powyżej).
- [x] **F/1** — resolver kwoty w `effects.js` (L41) + oferta `damage` w
      `game-state.js` (silnik).
- [x] **F/2** — `damageIsLethal` + premia `kill` w bocie (obie gałęzie).
- [x] **F/3** — testy F/1–F/6 w
      `test/zgloszenie-f-warmaker-trigger-damage.test.js` (RED→GREEN + dowód
      mutacyjny).
- [x] **F/4** — bramka fast + build zielone, commit, push, opis PR.
- [x] **F/5** — fixture audytowy `decks/regen-audyt.txt` (sesja E3a) przeniesiony
      do `tools/table-tester/fixtures/` — w `decks/` czerwienił 6 strażników
      talii (walidacja 12/15, rejestr README, ADR 0023, proporcje lądów,
      macierz seedów). Zawartość i procedura powtórki: README fixture'ów.

## Pomiar po fixie

- Scenariusz właściciela (1 artefakt, 4 cele): wybór `c11a` (1/1, lethal),
  score 93 > 38 (2/4) > 39 (3/3).
- Reclusive Artificer (cel = dowolny stwór, kwota 1): własna 1/1 = **−63**
  (lethal na własnym), wroga 1/1 = 93, wroga 2/4 = 38 → bot bije wrogą 1/1.
- Kwota oferty = kwota efektu: `damage_dealt` amount 1 przy `damage: 1` w
  ofercie (L41 sprawdzone E2E).

## Dowód mutacyjny (testy F muszą łapać usunięcie fixa)

| mutacja | pass / fail | co łapie |
|---|---|---|
| mF1: oferta bez kwoty (`triggerDamageField` → `{}`) | 0 / **7** | cały fix — bez kwoty bot wraca do „największe ciało" |
| mF2: `kill = debuffKills(target)` (bot ignoruje `cmd.damage`) | 3 / **4** | F/2, F/3, F/4, F/6 — strona bota (F/1, F/1b, F/5 to silnik) |
| mF3: zdjęta ochrona `indestructible` z predykatu | 6 / **1** | F/6 — cytat CR 702.12b |

Po przywróceniu kodu: 7/7.
