# PLAN batch64 — kolekcja właściciela 261–328, 10 kart (2026-10-08)

Zlecenie: lista właściciela (10 kart z jego kolekcji, wklejona w czacie). Gałąź
`arena/6b9bb8b8-mtg` (PR #158, ta sama sesja co audyt PR #157 i pętla jakości —
kolejny batch to nowe commity, nie nowy PR; AGENTS.md „1 sesja = 1 gałąź = 1 PR").
Procedura: `docs/cards/HOW_TO_ADD_CARD.md` (Kroki 1–9), ADR 0010 §2a, ADR 0014
(pełny Oracle — `support.limitations: []`), ADR 0022, ADR 0029 (katalog tylko
z kolekcji), ADR 0030 (CR/rulingi dosłownie), ADR 0002 (zero nazw kart
w silniku), ADR 0020 (commit per transza, bez force push).

Pole **Plan z listy właściciela jest wiążące** i przepisane 1:1 (także tam, gdzie
świat planu „nie pasuje" do karty, np. Universal Solvent → Kaladesh, Man-o'-War
→ Dominaria, Druid of the Cowl → Kaladesh, Scouting Hawk → Kaldheim).
Numer z kolumny „Ilustracja" to `artId`; w słowniku
`tools/collection-art-ids.csv` brakowało dokładnie tych 10 numerów (261, 263,
266, 269, 280, 323, 324, 325, 327, 328) — wiersze dochodzą na swoje miejsca.

## 0. Dane źródłowe (KOMPLET 10/10; `set=` obowiązkowy; jedno pobranie na kartę)

| artId | Karta | Set | Nr | Rar | Koszt | Oracle (skrót) | Plan (wiążący) |
|-------|-------|-----|----|-----|-------|----------------|----------------|
| 261 | Universal Solvent | CMR | 347 | C | {1} | Artifact; {7}, {T}, poświęć ten artefakt: zniszcz celowy permanent | **Kaladesh** |
| 263 | Man-o'-War | MH1 | 55 | C | {2}{U} | 2/2 Meduza; ETB: zwróć celowego stwora do ręki właściciela | **Dominaria** |
| 266 | Druid of the Cowl | M19 | 177 | C | {1}{G} | 1/3 Elf Druid; {T}: dodaj {G} | **Kaladesh** |
| 269 | Scouting Hawk | CLB | 41 | C | {2}{W} | 1/1 Ptak; latanie; Keen Sight — ETB: jeśli przeciwnik kontroluje więcej lądów niż ty, szukaj podstawowej Równiny, włóż tapniętą na pole bitwy | **Kaldheim** |
| 280 | Sultai Scavenger | KTK | 91 | C | {5}{B} | 3/3 Ptak Wojownik; Delve; latanie | **Tarkir** |
| 323 | Quandrix Campus | STX | 271 | C | — | Ląd; wchodzi tapnięty; {T}: dodaj {G} lub {U}; {4}, {T}: skrut 1 | **Arcavios** |
| 324 | Spineseeker Centipede | DSK | 199 | C | {2}{G} | 2/1 Insekt; ETB: szukaj podstawowego lądu do ręki; Delirium — +1/+2 i czujność, jeśli w twoim grobie ≥4 typy kart | **Duskmourn** |
| 325 | Narset's Rebuke | TDM | 114 | C | {4}{R} | Instant; 5 obrażeń celowemu stworowi; dodaj {U}{R}{W}; jeśli ten stwór umarłby w tej turze, wygnaj go zamiast tego | **Tarkir** |
| 327 | Brave-Kin Duo | BLB | 3 | C | {W} | 1/1 Królik Mysz; {1}, {T}: celowy stwór +1/+1 do końca tury; aktywuj tylko jako sorcery | **Bloomburrow** |
| 328 | Bog Hoodlums | LRW | 100 | C | {5}{B} | 4/1 Goblin Wojownik; nie może blokować; ETB: clash z przeciwnikiem; przy wygranej +1/+1 | **Lorwyn** |

### Rulingi (pobrane `fetch_page`, zapis w snapshotach)

- **Man-o'-War** (1): „If there are no other creatures on the battlefield when
  Man-o'-War enters the battlefield, its ability **must target itself**." —
  ruling POTWIERDZA pobrany Oracle „return target creature" (bez „you don't
  control"): przy starym brzmieniu własne wejście nie mogłoby być celem.
- **Sultai Scavenger** (3, rulingi delve): delve nie zmienia kosztu ani mana
  value; wygnane karty pokrywają WYŁĄCZNIE część generyczną; delve nie jest
  kosztem alternatywnym (łączy się z innymi kosztami dodatkowymi).
- Pozostałe 8 kart: **brak rulingów** (pobrane, pusta lista).

### Weryfikacja rozbieżności (L57/ADR 0030)

Dwa karty wróciły ze Scryfall z Oracle innym niż zapamiętany przeze mnie tekst
(Man-o'-War „target creature" zamiast „target creature you don't control";
Druid of the Cowl „{T}: Add {G}" zamiast „{G}{G} z warunkiem mocy"). Oba
zweryfikowane przed kodowaniem: ruling Man-o'-War musi celować w siebie (więc
tekst pobrany jest spójny z rulingiem), a Druida potwierdził DRUGI endpoint
(`/cards/m19/177` — identyczny Oracle). Biorę dane z pobrań.

## 1. Zmiany w SILNIKU (mechaniki generyczne, ADR 0002)

1. **Keen Sight** (269, CR nowego słowa kluczowego CLB): warunek triggera
   `opponentControlsMoreLands` w `conditionHolds` (`triggers.js`) — liczony
   ze stanu (lądy przeciwnika vs. lądy kontrolera źródła), bez literału nazwy.
2. **Clash z nagrodą** (328): deskryptor clash dostaje opcjonalne pole
   `counterOnWin` (nazwa licznika) — rozstrzyganie w
   `resolve_clash_choice` (`game-state.js`) kładzie licznik na źródle, gdy
   źródło wciąż na polu bitwy (CR 701.30 + LKI). Pendingu clash towarzyszy
   `sourceId`/`counterOnWin`, oba wchodzą do odcisku (`fingerprint.js`, L16).
3. **Delirium jako warunek STATYCZNY** (324, CR 207.2c): `condition.delirium`
   w ewaluatorze warunków statycznych (`permanents.js`). Licznik typów kart
   grobu ma JEDNO źródło — wyciągam `graveyardCardTypeCount` z `triggers.js`
   do liścia `src/engine/graveyard-types.js` (parametr `cardTypes`, zero
   zależności — inaczej cykl importów, ADR 0011), oba konsumenten przekazują
   `CARD_TYPES` (wzorzec L171, klasa L41/L48).
4. **Quandrix Campus** (323): wpis w `MANA_SOURCE_MAP`
   (`src/engine/mana-sources.js`) `{ colors: ['G','U'], amount: 1 }` — jak
   bliźniak Prismari Campus.
5. **Narset's Rebuke** (325): „Add {U}{R}{W}" = TRZY oddzielne jednostki many
   (jna każda innego koloru) — trzy efekty `add_mana` z `amount: 1`
   i pojedynczym kolorem; pula kolorowa trzyma je osobno (ADR 0015).
   Obrażenia + `exile_if_dies_this_turn` na celu (M177/A, Agate Assault).

Pozostałe karty nie wymagają zmian silnika: bounce celowego stwora
(`bounce_permanent`, 263), zdolność many na stworze (266, wzorzec Scorned
Villager), delve + latanie (280, wzorzec Hooting Mandrills), ląd tapnięty
+ skrut (323, wzorzec Prismari Campus), szukanie lądu do ręki (324), aktywacja
z celem „tylko jako sorcery" (327, wzorzec Basilisk Gate), „nie może blokować"
(328, pole `cantBlock`).

## 2. Kroki (HOW_TO_ADD_CARD)

1. Snapshoty `docs/cards/scryfall-<slug>.json` — pola z JEDNEGO pobrania
   (`source`, `print`, `set`, `set_name`, `collector_number`, `image_uris`)
   + `pobrano` + `rulings` + `rulingsPobrano` + `rulingsSource` (ADR 0028).
2. Zmiany silnika (§1) — każda ze strażnikiem/testem.
3. Definicje w `REAL_CARDS` (`src/cards/card-data.js`) z `artId`, `plan`
   (1:1 z listą), `set` i pełnym Oracle w `oracleText`; `MANA_COSTS` dla kart
   z kosztem.
4. Wiersze `tools/collection-art-ids.csv` (artId+set, nazwa, plan).
5. `node tools/generate-plan-decks.mjs` — talie singleton, auto-awans planu
   przy ≥15 kartach (ADR 0023/0024); sprawdzam zmiany nazw plików (L180).
6. `test/real-cards-batch64.test.js`: scenariusz LEGALNY (pełna ścieżka:
   rzut/aktywacja → efekt), scenariusz NIEGALNY (bramki: cel, timing, koszt),
   sanity danych (Oracle ↔ definicja, artId/plan ↔ słownik kolekcji).
7. Bramki per commit (`npm test` + `npm run build`, cicho) i push po commicie
   (ADR 0020 C/D; bez force-push, bez merge, nic na `main`).
8. Domknięcie: milestone M439 w `docs/ENGINE_MILESTONES.md`, wpis historii,
   opis PR #158. Bez pełnego B0 (ADR 0018); próbka szybka benchmarku tylko
   jeśli zmieni się próba `BENCH_DECKS` (regeneracja talii).

## 4. Realizacja (2026-10-08) — stan i odstępstwa od planu


**Kroki 1–2 zrobione przed kodem** (snapshoty 10/10 + roadmapa zacommitowana
jako `8084c8f`). Poniżej to, co wypadło inaczej niż zakładano:


### 4a. Migracja nazw talii Dominaria (L180 — zadanie OSOBNE, nie wpis)


Man-o'-War (MH1 #55, U) doszedł do planu „Dominaria" (38 → 39 kart
nielandowych) i generator przeliczył PODZIAŁ (ADR 0024):
`dominaria-ub`/`dominaria-wrg` → **`dominaria-wu`/`dominaria-brg`**.
To ta sama klasa zdarzenia co w Batch 63 (L180), w drugą stronę. Migracja
wykonana razem z batchem (wg precedensu domknięcia Batch 63):


- 2 nowe pliki talii, 2 usunięte; `README.md` (tabela liczności + kolory);
- **72 referencje żywych** Ścieżek: 28 plików testów,
  `test/fixtures/bot-scoring-snapshot.json`, `tools/` (bot-scoring-snapshot,
  bot-tie-audit, scoring-pay-census, table-tester), `docs/setup/TESTER_STOLU.md`;
- rekordy historyczne (PROJECT_HISTORY, audyty, LESSONS, plany, datowane
  HANDOFFy) — bez zmian, że nie fałszują zapisu;
- następstwa: wyjątek `mournful-zombie` w
  `test/zgloszenie-d-pipy-zdolnosci-podzial.test.js` przeniesiony z `dominaria-wu`
  na `dominaria-brg` (z nowym usprawiedliwieniem) oraz **seed 1 → 3** w
  `test/m257-uwagi-runda3.test.js` (clash/morph przestał wypadać w limicie
  400 kroków — L25: „przelosowany po zmianie X”).


### 4b. Czwarty nowy element silnika (poza założeniami §1)


Bog Hoodlums potrzebował **kartowego `cantBlock`** — w katalogu nie było
pola dla wydrukowanego „This creature can't block" (były tylko aury,
sprzęt i tokeny). Dane: `registry.js` (pole karty) → `materialize.js`
(`cantBlockPrinted` na obiekcie) → `identity.js`/`game-state.js` (fabryka i
biała lista `addObject`) → `deck.js` (`installDeck`, inaczej mechanika byłaby
martwa w prawdziwych partiach — łapał to strażnik M379/C). Cztery
dowiązania + test (L84/L21).


### 4c. Wynik bramek

- `npm test`: **7887 testów / 0 fail** (baseline 7853 + 34 nowe);
- `npm run build`: **73 moduły, 4953.2 kB** (baseline 72 / 4935.8 kB);
- audyty bota: `scoring-unvalued-audit.mjs` (12 partii / 5894 komend / 0
  niewycenionych) i `scoring-pay-census.mjs --decks=all` (46 partii) — czysto.

## 3. Kryteria ukończenia

- [x] 10 snapshotów z rulingami w `docs/cards/`
- [x] 10 definicji w katalogu, wszystkie `supported` (limitations puste)
- [x] strażnik proweniencji zielony (artId + nazwa + plan = słownik kolekcji)
- [x] talie zregenerowane; zmiany nazw (jeśli będą) opisane w milestone
- [x] `test/real-cards-batch64.test.js` zielony + mutacyjna weryfikacja co
      najmniej jednego pinu na nową mechanikę (Keen Sight, clash-nagroda,
      delirium-statyczny)
- [x] `npm test` i `npm run build` zielone; push na `arena/6b9bb8b8-mtg`
- [x] milestone M439 + historia + opis PR #158
