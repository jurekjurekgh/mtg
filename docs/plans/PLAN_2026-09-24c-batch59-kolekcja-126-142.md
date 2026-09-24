# Plan sesji 2026-09-24c — batch 59 (kolekcja 126–142), 10 kart

**Gałąź:** `arena/01a0d408-mtg` · **PR:** #136 (ten sam PR sesji, opis uzupełniany kumulatywnie)
**Zlecenie właściciela (2026-09-24):** lista 11 wpisów = **10 kart**, w tym jedna
dwustronna (`126MID`/`127MID` to przód i tył tej samej karty). Standardowy batch
to 10 kart (5 kart = „50 batchy temu", potwierdzone przez właściciela).

## Lista kart (artId z arkusza kolekcji, `tools/collection-art-ids.csv` — nowe wiersze)

| artId | karta | set | plan (arkusz) | typ | mechaniki |
| --- | --- | --- | --- | --- | --- |
| 126 MID | Bird Admirer // **Wing Shredder** | MID | Eldraine | DFC transform | reach, daybound/nightbound |
| 129 DMU | Charismatic Vanguard | DMU | Dominaria | Creature 3/2 W | {4}{W}: drużyna +1/+1 do końca tury |
| 130 THB | Scavenging Harpy | THB | Wiedźmin | Creature 2/1 B | flying, ETB: wygnaj kartę z grobu PRZECIWNIKA |
| 131 ISD | Memory's Journey | ISD | Kamigawa | Instant | tasowanie do 3 kart z grobu do biblioteki + flashback {G} |
| 134 ALA | Waveskimmer Aven | ALA | Forgotten Realms | Creature 2/4 GWU | flying, exalted |
| 135 BOK | Kumano's Blessing | BOK | Kamigawa | Aura {2}{R} | flash, enchant creature, efekt zastępczy śmierci → wygnanie |
| 138 MID | Join the Dance | MID | Eldraine | Sorcery {G}{W} | dwa tokeny 1/1 Human + flashback {3}{G}{W} |
| 139 TMT | Slithering Cryptid | TMT | Teenage Mutant Ninja Turtles | Creature 2/3 (G/U) | hybryda {2}{G/U}, ETB: token Mutagen |
| 141 RIX | Sun-Collared Raptor | RIX | Ixalan | Creature 1/2 R | trample, {2}{R}: +3/+0 do końca tury |
| 142 ALA | Savage Hunger | ALA | Kaldheim | Aura {2}{G} | +1/+0 i trample, cycling {2} |

Uwaga do arkusza: kolumna „plan" w arkuszu właściciela nie zawsze zgadza się
z krainą setu (np. `599MID Candlegrove Witch` = „Wiedźmin", `131ISD` = „Kamigawa")
— **przepisujemy ją dosłownie**, bo `plan` to etykieta organizacyjna kolekcji
(filtr katalogu w `src/table/deck-builder.js`), a nie nazwa krainy; precedens:
batch 58 (komentarz `artId: 265, plan: 'Zendikar'` dla OGW).

## Etap G0 — dane (WYKONANY przed tym plikiem)

- [x] Scryfall `named?exact` + `set=` per karta (ADR 0010 §2a, bez `set=` byłby
      zły druk — zgłoszenie A z 2026-09-12); sandbox blokuje `curl`, dane
      pobrane narzędziem `fetch_page` (jak opisuje HOW_TO_ADD_CARD).
- [x] 10 snapshotów `docs/cards/scryfall-*.json` z `pobrano: 2026-09-24`.
- [x] **Rulingi „przy kartce" (ADR 0028)** — pobrane dla każdej karty, także puste
      (`[]` = „sprawdzono, WotC nic nie ma"): Bird Admirer (9, day/night),
      Memory's Journey (11, m.in. „you must target a player", „player still
      shuffles"), Join the Dance (6, flashback), Savage Hunger (1, cycling),
      Slithering Cryptid (2, Mutagen), Waveskimmer Aven (6, exalted);
      Charismatic Vanguard / Scavenging Harpy / Kumano's Blessing /
      Sun-Collared Raptor — pustо.
- [x] Weryfikacja wstępna: które mechaniki już są w silniku (grep `src/engine/`).

## Rozpoznanie mechanik (stan silnika przed kodowaniem)

| mechanika | stan | dowód |
| --- | --- | --- |
| transform DFC + daybound/nightbound | **jest** | `tireless-hauler`/`dire-strain-brawler`, `transformTo`, `game-state` dzień/noc |
| drużyna „get +1/+1 until end of turn" | **jest** | karty 7105/8354 w `card-data.js` (efekt z `scope`) |
| pump „+3/+0 do końca tury" | **jest** | `effect.type === 'pump'` + `untilEndOfTurnBuffs` |
| flying, reach, trample, flash, enchant creature | **jest** | keywords + aury |
| exalted | **jest** | `effect.type === 'exalted_pump'` + trigger po `exalted` na źródle |
| flashback | **jest** | `flashback: { cost, colors }` (karty 5718/7184/8846) |
| cycling (w tym `{2}`) | **jest** | `cycling: { drawCards: 1 }` |
| cel „karta w grobie kontrolera" | **jest** | `card_in_graveyard` (`spells.js:341`) |
| cel „karta w grobie PRZECIWNIKA" | **BRAK** | dziś `card_in_graveyard` wymaga `controllerId === casterId` |
| „pos tasuj grób → biblioteka" | **BRAK** | są tylko `graveyard_*_to_library_top_choice` (na wierzch, nie tasowanie) |
| efekt zastępczy „wygnaj zamiast śmierci" | **część** | `exile_if_dies_this_turn` (efekt jednorazowy na obiekcie); Kumano działa CIĄGLE z aury i kluczem „obrażenia zadane przez ZACZAROWANEGO tego turnieju" |
| token z własną zdolnością aktywowaną | **część** | `TREASURE_TOKEN_ABILITY` + `createBattlefieldToken({ abilities })`; Mutagen to nowy typ predefined |
| hybrydowy pip `{G/U}` | **do sprawdzenia** | komentarz M389 w `card-data.js:11496` |

## Etap G1 — implementacja, jedna karta = jeden zielony commit (ADR 0020 C/D)

Kolejność: najpierw karty wnoszące **nowe mechaniki generyczne** (żeby nowy kod
przeszedł pełną bramę zanim dojdą zależne od niego dane), potem karty czysto
danych — każda z testem `test/real-cards-batch59.test.js` w swoim kroku.

- [ ] **G1.1 Scavenging Harpy** — nowy typ celu `card_in_opponent_graveyard`
      (generyczny, ADR 0002) + efekt `exile_graveyard_card`; pin: cel z własnego
      grobu ODRZUCONY, pusty grób przeciwnika = trigger bez celu (M106/Z2).
- [ ] **G1.2 Memory's Journey** — nowy efekt „target player tasuje do N
      wskazanych kart ze swojego grobu do biblioteki”; pin na rulingi:
      gracz-cel obowiązkowy, brak wskazanych kart → gracz i tak tasuje, karta
      nielegalna w chwili rozstrzygnięcia → nie wchodzi.
- [ ] **G1.3 Kumano's Blessing** — ciągły efekt zastępczy z aury: „stwór, któremu
      ZACZAROWANY zadał obrażenia w tej turze, zamiast umrzeć → wygnaj”.
      Wymaga znacznika „obrażenia od tego źródła w tej turze” na ścieżce
      śmierci (`destruction.js`/`deathZoneFor`) + resetu (L166/L167).
- [ ] **G1.4 Slithering Cryptid** — predefined token **Mutagen** (bezbarwny
      artefakt z `{1}, {T}, Sacrifice: +1/+1 na cel; tylko jak sorcery`),
      hybrydowy pip `{2}{G/U}`; pin: token ma zdolność, poświęcenie tylko
      w main fazie, cel = dowolny stwór.
- [ ] **G1.5 Charismatic Vanguard** — dane + test aktywacji {4}{W}.
- [ ] **G1.6 Sun-Collared Raptor** — dane + test pumpa {2}{R}.
- [ ] **G1.7 Savage Hunger** — dane + test aury i cycling {2}.
- [ ] **G1.8 Join the Dance** — dane + test dwóch tokenów i flashbacku.
- [ ] **G1.9 Waveskimmer Aven** — dane + test exalted (ruling: atakuje sam).
- [ ] **G1.10 Bird Admirer // Wing Shredder** — DFC daybound/nightbound,
      artId 126 (przód) i 127 (tył, `status: 'back'`).
- [ ] **G1.11** — talie singleton (Krok 5) + `docs/cards/*` + strażnicy katalogu.
- [ ] **G1.12** — domknięcie: `npm test` + `npm run test:all` + `npm run build`,
      wpis M427, handoff, opis PR.

## Bramy i zasady

- Po każdym kroku: `node --test test/real-cards-batch59.test.js` (nowe piny),
  `npm test`, `npm run build`; push po każdym zielonym kroku.
- Nowa mechanika = nowy test KLASOWY (nie tylko pin karty) — L5/L39.
- Każdy cytat CR wobec dosłownego tekstu wydania 2026-09-25 (ADR 0030);
  nowy numer → `node tools/cr-numery.mjs --zapisz` po weryfikacji.
- Bez `limitations` na mechanikach (decyzja właściciela 2026-08-03) — karta
  wchodzi wyłącznie w 100% gotowa; tył DFC ma status `back` (jak `tireless-hauler`).
- Sandbox: mutacje na kopiach (`/tmp`), nigdy `git checkout` na niezacommitowanej
  pracy (L136); commit + push po każdym kroku (ENVIRONMENT §2).
