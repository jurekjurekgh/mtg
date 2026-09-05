# Handoff — batch 53 materializacyjny (589–598), 2026-09-04

Gałąź sesji: `arena/01a06dd7-mtg` · PR: **https://github.com/jurekjurekgh/mtg/pull/96**
(open, NIE scalony — scalenie to decyzja właściciela, preferowane „Squash and merge”).
Baza sesji: `bf615b1` (squash PR #95); baza commitów batcha `c85a25f` (transza 5).

## Cel

Batch 53 — 10 kart z listy właściciela: 589–598. Zasady: ADR 0010 §2a
(Scryfall → artId → `defineCard` → talie → testy → dokumentacja), ADR 0002
(mechaniki generyczne), ADR 0022 (supported = 100% Oracle), ADR 0020
(inkrementalne zielone commity), ADR 0028 (rulingi przy kartach).

**Decyzja właściciela „accept-migrate”:** gdy realna karta przepchnie
Warhammer Fantasy ponad próg 30 nielandowych, akceptujemy nowy split
(`warhammer-ubr` + `warhammer-wg`, ADR 0024) i migrujemy wszystkie odwołania
w ramach batcha; nie odkładamy kart Warhammera.

## Wynik

- **Wszystkie 10 kart batcha 53 zaimplementowane i `supported`.**
  | ID | Karta | Status |
  |---|---|---|
  | 589M3C | Acidic Slime | ✅ transza 7 |
  | 590ECL | Keep Out | ✅ transza 1 |
  | 591BLB | Rust-Shield Rampager | ✅ transza 3 |
  | 592LCI | Glorifier of Suffering | ✅ transza 6 |
  | 593SOI | Inspiring Captain | ✅ transza 7 |
  | 594EMN | Ironclad Slayer | ✅ transza 1 |
  | 595HOB | Óin the Brave | ✅ transza 4 |
  | 596ORI | Ghirapur Gearcrafter | ✅ transza 1 |
  | 597SOM | Ichorclaw Myr | ✅ transza 5 |
  | 598OTJ | Sheriff of Safe Passage | ✅ transza 2 |
- **Nowe mechaniki generyczne:** Offspring (Rust-Shield), Storied (Óin),
  `becomes_blocked` (Ichorclaw), reflexive sacrifice „When you do”
  (Glorifier), `cantBeBlockedByPower`, filtry
  `aura_or_equipment_card_in_graveyard` i `artifact_or_enchantment_or_land`.
- **Split Warhammera (ADR 0024):** 38 nielandowych →
  `warhammer-ubr` 21 + `warhammer-wg` 17 [leak 0, imbalance 4].
  Wszystkie odwołania `warhammer-brg`/`warhammer-wu` zmigrowane.
- **Dokumentacja kart:** 10 × `docs/cards/scryfall-<slug>.json`, słownik
  `tools/collection-art-ids.csv` 598 pozycji, 455 kart z artId.

## Commity po `c85a25f` (każdy zielony)

| commit | treść |
|---|---|
| `6f91045` | transza 6: Glorifier of Suffering + podział Warhammera (ubr/wg) i migracja odwołań |
| `54da590` | transza 7: Acidic Slime i Inspiring Captain (domknięcie batcha 53) |

## Bramki na HEAD `54da590`

- `npm test` **4432/4432**
- `npm run test:all` **4442/4442**
- `npm run build` **59 modułów / 3257,4 kB**
- `node --test test/bot-benchmark.test.js` **10/10** (profil szybki, ADR 0018)
- Pełny B0 NIE uruchamiany (ADR 0018 — tylko na wyraźną komendę właściciela).

## Gdzie szukać dalej

1. **Scalenie PR #96** — PR kumuluje audyt PR #95 + batch 53 (7 transz).
   Zgodnie z ADR 0013 scalenie wykonuje właściciel; preferowane
   „Squash and merge”.
2. **Następny batch materializacyjny** — ADR 0020: otwórz PR przed pierwszą
   zmianą w kodzie; pracuj na nowej gałęzi sesji (1 sesja = 1 gałąź = 1 PR).
3. **Żywy Tester po scaleniu** — nowe karty (zwłaszcza Glorifier z
   refleksyjnym poświęceniem i Rust-Shield z Offspringiem) warto przećwiczyć
   na przebudowanym `dist/`; tester ładuje `dist/`, więc najpierw
   `npm run build`.
4. **L84 / 4 dowiązania** — nowe deskryptory (offspring, storied,
   becomes_blocked, reflexive_sacrifice) mają EVENT_TYPES, etykiety PL,
   wycenę bota i `gameObjectDataOf`; strażniki pilnują braków osobno.

## Pułapki napotkane w tej sesji

- **Sandbox resetował workspace** (ENVIRONMENT §2) — do odzyskania `git fetch`
  + `git reset --mixed FETCH_HEAD`; nie używać `git reset --hard`.
- **Transza 6 nie może być zielona bez migracji:** dodanie Glorifiera
  przepycha Warhammer ponad próg, a generator usuwa stare talie; dlatego
  transza 6 + split + migracja poszły w jednym zielonym commicie.
- **`git add -p`** pozwala rozdzielić zmiany w jednym pliku (render.js:
  etykieta/skip dla Glorifiera vs komentarz z nową nazwą talii).
- **Złoty-master bot-scoring-snapshot** — po zmianie talii uruchamiać
  `node tools/bot-scoring-snapshot.mjs --write`; w tym batchu hash się nie
  zmienił, bo próbkuje parę `tarkir-bg|warhammer-ubr` (bez `warhammer-wg`).
