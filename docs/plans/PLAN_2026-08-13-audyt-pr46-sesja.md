# Plan: audyt PR #46 + kolejka sesji (2026-08-13)

## Cel
Obowiązkowy audyt scalonego PR #46 (zasada A / ADR 0016) bez pełnego B0.
Potem: platinum hunt / UX phone-verify w kodzie, jeśli Batch 32 nie ma listy.

## Etapy
- [x] E0 — plan w repo (ten plik)
- [x] E1 — `npm test` = 1458/0; `node --test test/bot-benchmark.test.js`; `npm run build`
- [x] E2 — engine: M80–M84, Jill/Shiva, bot Station/re-equip
- [x] E3 — Batch 31 vs Oracle/Scryfall (10 kart, 3 talie), ADR 0002
- [x] E4 — wnioski w PROJECT_STATE; dalsza praca wg kolejki

## Ryzyka
- edit_file psuje polskie znaki → python3 Path
- nie commituj bez npm test


## Wykonanie
- `npm test` 1459/0; `bot-benchmark.test.js` 7/0 (bez pełnego B0).
- PR #46 scalony na `main` (`464c3d9`); ADR 0016 na main.
- Batch 31: 10 kart + Scryfall + testy; mechaniki generyczne (ADR 0002).
- Audyt znalazł i naprawił: (1) hexproof w ofercie celów artifact/aura (CR 702.11);
  (2) Fear of Abduction ETB — cel gracza zamiast najsilniejszego (CR 115.1b).
- Świadome reszty: Jwari „you may" auto-kopiuje najsilniejszego Ally; Awaken
  „you may destroy equipment" deterministycznie TAK; Batch 32 czeka na listę.
