# Plan: audyt PR #47 + naprawy CR (2026-08-13)

Sesja `arena/019ffc52-mtg`. Obowiązkowy audyt scalonego PR #47
(Batch 32 + brązowa odznaka ×5) bez pełnego B0 (ADR 0016 A).

## Etapy

- [ ] E0 — plan w repo (ten plik)
- [ ] E1 — `npm test` (bez pełnego B0) + `node --test test/bot-benchmark.test.js` + `npm run build`
- [ ] E2 — audyt engine Batch 32 vs Oracle/Scryfall (10 kart), ADR 0002
- [ ] E3 — znalezione twarde błędy vs CR: RED testy + root-cause
- [ ] E4 — docs PROJECT_STATE + handoff

## Wstępne ustalenia audytu (przed kodem)

1. **CR 502.2 / 730.2 day/night** — `processTriggers` na `spell_cast`
   od razu robi noc, gdy jest daybound na stole. Comprehensive Rules:
   zmiana dnia/nocy to turn-based action na początku tury (przed untapem)
   wg liczby czarów poprzedniego aktywnego (0 przy dniu → noc; ≥2 przy nocy → dzień).
   Ballista Watcher jest pierwszą realną kartą daybound (`supported`).

2. **Soulbright Flamekin** — `onNthResolve.effect` to `{ type: add_mana, amount: 8 }`
   bez `colors: ['R']`. Oracle: „add {R}{R}{R}{R}{R}{R}{R}{R}”.

3. **`abilityResolvedThisTurn`** — inkrement przy KAŻDYM resolve zdolności
   (nie tylko `onNthResolve`); w cleanup jest zdublowany klucz w `replaceObject`.

## Ryzyka

- `edit_file` psuje polskie znaki → python3 Path
- nie commituj bez `npm test`
- nie pełne B0 (limit sesji)

## Kolejność commitów

1. ten plan
2. testy RED + fixy
3. docs
