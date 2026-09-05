# PLAN 2026-09-05 — gruntowy audyt kart Batcha 53 (589–598)

**Zlecenie właściciela:** audyt 10 kart batcha 53 w trzech warstwach:
(a) diff kodu vs CR/rulingi, (b) zachowanie na stole (Żywy Tester),
(c) scoring heurystyki bota.
**Nośnik:** PR #97 (`arena/01a07073-mtg` → `main`), commity przyrostowe.
**Raport:** `docs/audits/AUDYT_BATCH53_2026-09-05.md`.

## Warstwa (a) — kod vs CR/rulingi (per karta)

- [ ] 589 Acidic Slime — ETB niszczy artifact/enchantment/land (filtr celu).
- [ ] 590 Keep Out — modal: 4 dmg w tapped stwora | zniszcz enchantment.
- [ ] 591 Rust-Shield Rampager — Offspring {2} + nieblokowalność (moc ≤2).
- [ ] 592 Glorifier of Suffering — refleksyjna ofiara → liczniki (2 etapy).
- [ ] 593 Inspiring Captain — anthem ETB (zbiór zamrożony, CR 611.2c).
- [ ] 594 Ironclad Slayer — ETB wraca Aurę/Equipment z grobu na rękę.
- [ ] 595 Óin the Brave — Storied + premia warunkowa + loot (po F1).
- [ ] 596 Ghirapur Gearcrafter — ETB token Thopter 1/1.
- [ ] 597 Ichorclaw Myr — Infect + becomes_blocked: +2/+2.
- [ ] 598 Sheriff of Safe Passage — wchodzi z licznikami 1+N.

Źródła prawdy: `docs/cards/scryfall-*.json` (Oracle + rulingi), CR.
Metoda: definicja + MANA_COSTS + mechanika silnika + testy + reprobe.

## Warstwa (b) — stół (Żywy Tester, artefakt z HEAD)

Talie-nosiciele: warhammer-wg (Acidic, Glorifier, Inspiring), wiedzmin
(Keep Out, Ironclad), srodziemie (Óin, Sheriff), kaladesh (Ghirapur),
mirrodin-brg (Ichorclaw), worek-basni (Rust-Shield).

- [ ] G1: srodziemie × wiedzmin (4 karty) + G2: rewanż.
- [ ] G3: warhammer-wg × warhammer-ubr (3 karty) + G4: rewanż.
- [ ] G5: kaladesh × mirrodin-brg (Ghirapur × Ichorclaw).
- [ ] G6: worek-basni × theros (Rust-Shield).
- [ ] Analiza trafień (10 nazw) w transkryptach: zachowanie, kafle, log.
- [ ] Detektory + `scan.mjs` czyste (klasy false-positive spisane).

## Warstwa (c) — scoring bota (per karta)

- [ ] Odczyt wycen: cast/tryb/aktywacja/ofiara/cele/walka (heuristic-bot).
- [ ] Mikrosondy decyzji bota w scenariuszach batch53 (headless).
- [ ] Ocena taktyczna: czy gra sensownie i optymalnie; lista luk.

## Domknięcie

- [ ] Raport audytu + znaleziska (reguły → fix w tym PR; heurystyka →
      fix tylko gdy mały/bezpieczny, reszta jako rekomendacje).
- [ ] Bramy: `npm test`, `test:all`, `build`, benchmark 10/10.
- [ ] PROJECT_HISTORY + handoff + opis PR #97; `git status` czysty.
