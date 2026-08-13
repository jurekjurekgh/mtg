# Plan: audyt PR #46 + kolejka sesji (2026-08-13)

## Cel
Obowiązkowy audyt scalonego PR #46 (zasada A / ADR 0016) bez pełnego B0.
Potem: platinum hunt / UX phone-verify w kodzie, jeśli Batch 32 nie ma listy.

## Etapy
- [ ] E0 — plan w repo (ten plik)
- [ ] E1 — `npm test` = 1458/0; `node --test test/bot-benchmark.test.js`; `npm run build`
- [ ] E2 — engine: M80–M84, Jill/Shiva, bot Station/re-equip
- [ ] E3 — Batch 31 vs Oracle/Scryfall (10 kart, 3 talie), ADR 0002
- [ ] E4 — wnioski w PROJECT_STATE; dalsza praca wg kolejki

## Ryzyka
- edit_file psuje polskie znaki → python3 Path
- nie commituj bez npm test
