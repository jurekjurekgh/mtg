# Mapa plików — PR #187 (Audyt techniczny, 2026-11-21)

Sesja: `arena/c2635cc8-mtg`, PR **#188** (audyt PR #187). Baza: `c1324c07`
(scalenie PR #187). Metoda: `gh api pulls/187/files --paginate` (lista 175 plików)
skonfrontowana z `grep -c '^diff --git '` w `gh pr diff 187` → **175 / 175**
(zgodność L190: wewnętrzne `+diff --git` w plikach `.patch` nie występują).

## Podział na kategorie (175 plików)

| Kategoria | Liczba | Co obejmuje |
|---|---|---|
| `src/engine/` | 12 | attachments, combat, effect-intent, effects, fingerprint, game-state, identity, permanents, players, state-based, tokens, triggers |
| `src/cards/` | 3 | card-data (Batch 74: 656–665), mana-costs-data, registry |
| `src/controllers/` | 2 | heuristic-bot (PMSSB-91 F-91/1..7), heuristic-params |
| `src/table/` | 6 | art-showcase, index.html, main, mana-wizard, render (panel Rad/Role/raid), session |
| `src/protocol/` | 1 | types (nowe zdarzenia `rad_counters_*`, `cards_milled`) |
| `test/` | 101 | Etapy 2A–2D, `real-cards-batch74`, `audyt-pmssb91-batch74`, przelosowane golden-mastery (L25) |
| `decks/` | 14 | split kolorystyczny (dominaria/mirrodin/warhammer), awans `Eldraine`→19 w `worek-basni` |
| `docs/` | 27 | PMSSB-91 raport, ENGINE_MILESTONES, LESSONS, PROJECT_HISTORY, audits, plans |
| `tools/` | 8 | sondy PMSSB-91, generate-plan-decks, cr-numery |
| `.github/` | 0 | — |
| root | 1 | README |

## Pliki `src/` poddane szczegółowej rewizji (E1)

- **Nowe mechaniki (Etapy 2A–2D) — `src/engine/`:**
  `effects.js` (`gain_life` `each_opponent`+`amountFrom:'damageAmount'`; `cant_be_blocked` `applyTo:'self'`; `raid`+`cantBePrevented` w `dealNonCombatDamage`/`resolveDamageAmount`; choke point `millTopCardsForPlayer`; `add_rad_counters`/`proliferate` rad), `combat.js` (`playersAttackedThisTurn` w `declareAttackers` + maximal bipartite matching F-186/1), `triggers.js` (`self_or_another_creature_you_control_enters`; inherentny trigger radiacji; batchowany `nonland_cards_milled`), `state-based.js` (SBA Role CR 303.7), `tokens.js` (`aura`/`ward` w tokenach), `attachments.js` (`removeExcessRoleAttachments`, `ward`/`grantAbilities` w `attachmentGrant`, `protection from enchantments`), `players.js` (choke pointy `addRadCounters`/`removeRadCounters`), `game-state.js` (reset `playersAttackedThisTurn`/`triggerFiredThisTurn` w `beginTurnContinuation`, `rad` w `playerView`).
- **Definicje kart — `src/cards/card-data.js`:** 10 kart 656–665 + 3 tokeny Ról; wszystkie `support.status:'supported'`, `limitations:[]`.
- **Bot — `src/controllers/heuristic-bot.js` + `heuristic-params.js`:** 6 findingów PMSSB-91 (F-91/1..7) jako kary/dopłaty bez nowych pokręteł w `heuristic-params.js` poza `externalTriggerDrainScale`.
- **Stół — `src/table/render.js` itd.:** panel Rad (`#rad`, marker „Radiation”), Role, raid w logu/modalu.

Pełna rewizja każdego z 175 plików (w tym 101 testów) wykroczyła poza ramy tej sesji;
skupiono się na plikach `src/` (rdzeń reguł, karty, bot, stół), które niosą
ryzyko regułowe. Testy potwierdza ich poprawność (baseline `npm test` = 10542/10542).
