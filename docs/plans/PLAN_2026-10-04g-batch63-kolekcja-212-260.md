# PLAN batch63 — kolekcja 212–260 (10 kart), 2026-10-04

Zlecenie: lista właściciela (10 kart, wklejona w czacie 2026-10-04). Gałąź
`arena/01a102f7-mtg` (PR #154 — kolejny batch to nowe commity, nie nowy PR;
AGENTS.md „1 sesja = 1 gałąź = 1 PR”). Procedura: `docs/cards/HOW_TO_ADD_CARD.md`,
ADR 0010 §2a, ADR 0014, ADR 0022 (pełny Oracle, `support.limitations` pusty),
ADR 0029 (tylko karty z listy właściciela), ADR 0030 (CR/rulingi dosłownie
z sieci przed zmianą reguł), ADR 0002 (zero przypadków specjalnych po
nazwie/ID karty), ADR 0020 (commit per transza, bez force push).

## 0. Dane źródłowe — lista właściciela (Plan WIĄŻĄCY, 1:1)

Format wejścia: `Ilustracja`, nazwa, set druku, **Plan**. Kolumna „Ilustracja”
(np. `212VOW`) to `artId` = 212 + kod setu; numer wiersza arkusza ≠ numer
kolekcjonerski. Braki w słowniku potwierdzone: żaden z 10 numerów
(212/239/241/244/247/250/254/255/259/260) nie ma wiersza w
`tools/collection-art-ids.csv`, żadna z 10 nazw nie jest w katalogu.

| artId | Karta | Set | Plan (wiążący) |
|-------|-------|-----|----------------|
| 212 | Bloodtithe Harvester | VOW | **Innistrad** |
| 239 | Dig Site Inventory | SOS | **Arcavios** |
| 241 | News Helicopter | SPM | **Marvel** |
| 244 | Natural Connection | BFZ | **Zendikar** |
| 247 | Subterranean Scout | ORI | **Lorwyn** |
| 250 | Loxodon Mender | MRD | **Mirrodin** |
| 254 | Snarespinner | DMU | **Dominaria** |
| 255 | Urborg Uprising | APC | **Dominaria** |
| 259 | Kozilek's Predator | 2XM | **Zendikar** |
| 260 | Etched Host Doombringer | MOM | **Kaldheim** |

Uwaga proceduralna: Plan przepisywany 1:1 do `plan:` i wyboru talii — także tam,
gdzie świat planu „nie pasuje” do druku (np. Subterranean Scout ORI → Lorwyn,
Urborg Uprising APC → Dominaria). Nie kwestionować.

## 1. Środowisko: sieć tylko przez `fetch_page`

Egress z bash/node/python jest ZABLOKOWANY w tej sesji (curl → HTTP 000,
`fetch` → „fetch failed”, `urllib` → TLS EOF). Krok 1 i rulingi wykonujemy
`fetch_page`:
- karta: `https://api.scryfall.com/cards/named?exact=<Nazwa>&set=<set>&format=json`
  (`set=` OBOWIĄZKOWE — inaczej Scryfall zwraca domyślny reprint),
- rulingi: `https://api.scryfall.com/cards/<set>/<collector_number>/rulings`,
- snapshot: pola jak w `docs/cards/scryfall-chocobo-kick.json` (m.in. `source`
  z `set=`, `print` == `set`, `image_uris.large`, `pobrano`, `rulings`,
  `rulingsPobrano`, `rulingsSource`); brak rulingów = `rulings: []` (ADR 0028).

## 2. Transze (commit per transza: snapshot + wiersz CSV + definicja + piny + talie)

- **T1** — karty bez nowych mechanik (czyste dane/trigger).
- **T2**, **T3** — karty wymagające nowych mechanik generycznych (nazwy mechanik
  dopisane po Kroku 1, gdy znamy Oracle).
- **T4** — karty z deskryptorami istniejącymi (tokeny/liczniki/zdolności).
- **T5** — talie: `node tools/generate-plan-decks.mjs` po wszystkich definicjach
  (ADR 0023/M178 — plan ≥15 kart = talia, mniejsze do worków; auto-awans M181).
- **T6** — dokumentacja: ten plan, `ENGINE_MILESTONES.md` (nowy milestone),
  `PROJECT_HISTORY.md`, handoff.

## 3. Bramy

- Po każdej transzy: `npm test` (baseline **7552**) + `npm run build`
  (baseline **70 modułów / 4818,8 kB**), push.
- Strażniki kart: `test/zgloszenie-a-druk-karty-z-arkusza.test.js` (snapshot ↔
  katalog ↔ arkusz + zapadnia), `test/repo-decks.test.js` (singleton +
  round-trip), `test/m197-plany-kolekcji.test.js`, `test/m181-auto-awans.test.js`.
- Piny: `test/real-cards-batch63.test.js` (dla każdej karty legalna + nielegalna
  + sanity danych).
- Jeśli karta dotknie wyceny bota: `node --test test/bot-benchmark.test.js`;
  pełne B0 tylko na polecenie właściciela (ADR 0018/0025).
- Brama PR `npm run test:all` na tipie kodu po zamknięciu batcha.

## 4. Stan przy przerwaniu poprzedniej sesji (2026-10-04)

- **T1 DONE** (`3e6619c`): 255 Urborg Uprising + fix fizzle „zero wybranych celów" (CR 608.2b).
- **T2 DONE** (`4e8fe73`, `225eba0`): 239 SOS, 241 SPM, 244 BFZ, 250 MRD + token Human Citizen.
- **T3**: 247 Subterranean Scout DONE (`12d26e9`). **254 Snarespinner WSTRZYMANA** —
  wsparcie silnika (zdarzenie `blocks` + `blockedHasKeyword`, CR 613) gotowe i wypchnięte
  (`cd0858d`, piny ENG w `test/real-cards-batch63.test.js`), ale sama karta czeka na
  decyzję o migracji nazw talii: plan „Dominaria" ma 37 nielandów (>= próg 30), więc
  dodanie karty przelicza podział i zmienia nazwy plików `dominaria-wu`/`dominaria-brg`
  -> `dominaria-ub`/`dominaria-wrg`, a repo ma 596 referencji do starych nazw (fixture'y
  sesji, BENCH_DECKS, talie testera) — to migracja, nie dodanie karty (L180).
  Snapshot: `docs/cards/scryfall-snarespinner.json.pending`.
- **Pozostałe do dodania**: 212, 259, 260 (260 = GAP battle/defense).
- **Budżet lektury**: 99 974/100 000 (zapas 26 tokenów) — kolejny wpis `docs/LESSONS.md`
  wymaga kondensacji starszej sekcji.


## 5. Domknięcie po przejęciu — 2026-10-05 (PR #155)

**Batch 63: 10/10, żadna karta nie pozostaje wstrzymana.**
Plan kontynuacji: [2026-10-04h](PLAN_2026-10-04h-ci-i-dokonczenie-batch63.md).

- `05947b9`: 212 Bloodtithe Harvester, 254 Snarespinner, 259 Kozilek's
  Predator, 260 Etched Host Doombringer oraz tokeny Blood / Eldrazi Spawn.
- Użyto istniejącego `blocks` od poprzednika, dodano dane/UI/projekcję bota.
  Doombringer obsługuje oba tryby, wybór na stosie, rzeczywistą rolę protektora
  i defense. Harvester liczy Blood przy rozstrzygnięciu.
- Brakujący plik `.pending` nie był zachowany; komplet sześciu snapshotów
  exact-set z rulingami odtworzono ze źródeł, nie z pamięci.
- Generator sam przeliczył Dominarię na **UB/WRG**. Zmigrowano 40 aktywnych
  plików odwołań, raporty historyczne zachowano. Nadal **27 talii**.
- `f54e21a`: korekty ujawnione pełną bramą (dane tokenów poza rdzeniem,
  deterministyczny pin panelu Cutthroat zamiast losowej próby bez obserwacji).
- Końcowe wyniki: fast **7642/7642**, all **7905/7905**, build **72 moduły /
  4850,0 kB**, quick **672/672 ukończonych**, CI **PASS**.

Szczegóły: [raport batcha](../audits/BATCH63_DOKONCZENIE_2026-10-04.md),
[handoff](../setup/HANDOFF_2026-10-05.md). Zakaz pełnego B0 bez polecenia
właściciela oraz obowiązek wyciszania dużych pakietów pozostają w mocy.
