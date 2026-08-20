# PLAN sesji M147 — audyt PR #64 (M146) + Batch 37 (2026-08-19)

Gałąź: `arena/01a01a7b-mtg`. Sesja startuje z `main` = `c536182` (PR #64 M146).

## Rozpoznanie stanu (2026-08-19)

- `main` zielony: `npm test` (szybki rdzeń) **2341/2341**, `npm run build`
  **51 modułów / 1986.4 kB**.
- Poprzedni scalony PR do audytu: **#64 (M146)** — brak jeszcze
  `docs/audits/AUDYT_PR64_*.md`.
- Batch 35 i Batch 36: **kompletne** (PROJECT_STATE, 2026-08-19).
- Najnowszy niedokończony plan na `main`: **`PLAN_2026-08-19-batch37-kart.md`**
  (lista właściciela, 0 odhaczonych etapów) — do podjęcia wg ADR 0021 pkt 3.

## Etapy (commit po commit, każdy samodzielnie zielony: `npm test` + build)

1. **Plan sesji + otwarcie PR** (ADR 0020 A) — ten plik.
2. **Audyt PR #64 (ADR 0020 B / 0016)** — `docs/audits/AUDYT_PR64_2026-08-19.md`:
   przegląd kart Batch 35/36 i zmian core pod kątem Oracle + ADR 0002,
   `npm test` na `main`. Znalezione błędy naprawiane u root cause.
3. **Batch 37** — podejmij plan `PLAN_2026-08-19-batch37-kart.md` wg jego
   `Plan commitów`:
   - 3a. Dane Scryfall (ADR 0010 §2a, przez `fetch_page` — egress zablokowany)
   - 3b. Reuse (Returned Centaur, Liliana's Triumph, Palace Familiar, Thornhide Wolves)
   - 3c. Ojutai's Breath (dont_untap + **rebound**)
   - 3d. Village Bell-Ringer + Satyr Wayfinder (untap all + reveal/pick land)
   - 3e. Static Net (linked exile + **powerstone**)
   - 3f. Strandwalker (**living weapon**) + Urza's Mine (**tron**)
   - 3g. Dokumentacja (PROJECT_STATE + handoff)
4. **Zamknięcie sesji** — handoff, PROJECT_STATE, opis PR kumulacyjnie.

## Kryteria ukończenia każdego commitu

- `npm test` (szybki rdzeń) zielony; `npm run build` zielony.
- Karty Batch 37 zgodne z Oracle (Scryfall), nowe mechaniki generyczne
  (ADR 0002 — zero nazw kart w core).
- Nowe mechaniki sprawdzone w heuristic-bocie (L50): cast_spell i
  activate_ability.

## Ryzyka / pułapki

- Egress HTTPS zablokowany — dane kart wyłącznie przez `fetch_page`.
- Nowe typy efektów (living weapon, rebound, powerstone, tron) — każdy wymaga
  wyceny w heuristic-bocie (L50) i oferty==walidacji (L48).
- Polskie znaki — edytuj przez `python3` + `pathlib` (ENVIRONMENT §4).
- GH_TOKEN potrafi wygasnąć; commituj i pushuj po każdym zielonym kroku.
