# AUDYT ŻYWYM TESTEREM M257r4 (2026-08-29) — pętla jakości: 2 znaleziska produktowe + 1 narzędziowe

**Sesja:** `arena/01a04e98-mtg` (PR #88). **Zakres:** pętla jakości
własnym wyborem właściciela („może sam coś znajdziesz") — 6 partii
Żywym Testerem na taliiach, których nie testowały ostatnie rundy
(tarkir-bg, worek-basni, warhammer-wu, wiedzmin, theros, worek-legend) +
karty z Batchu 51 (worek-basni/legend) i mechaniki z M255/M256/M257.

**Baza:** `f97e6b5` (stan po rundzie 3 uwag: foW widokowy, kolejność menu,
Greatsword of Tyr). Bramy startowe: `npm test` 3748/3748, build 2907.7 kB.

## Metoda

- Artefakt zbudowany z bazy; 6 partii seeds 2001–2006, 400 kroków,
  profile: greedy ×3, explorer, defensive, random — `tools/table-tester`.
- Czytanie **każdego** transkryptu od deski do deski (oś czasu obiektów,
  detektory, tekst karty w kafelach vs Oracle, spójność CR).
- L57 (ADR 0022): każde podejrzenie weryfikowane najpierw z
  `docs/cards/scryfall-*.json` (a przy braku pliku — na żywo z API
  Scryfall przez fetch), zanim dotknięto kodu.

## Wynik macierzy (przed poprawkami)

| seed | talia (gracz ↔ bot) | profil | wynik | detektory |
|---|---|---|---|---|
| 2001 | tarkir-bg ↔ wiedzmin | greedy | wygrywa Gracz | 0 |
| 2002 | tarkir-bg ↔ wiedzmin | explorer | wygrywa Bot | 0 |
| 2003 | worek-basni ↔ theros | greedy | wygrywa Bot | 0 |
| 2004 | worek-basni ↔ theros | defensive | wygrywa Bot | 0 |
| 2005 | warhammer-wu ↔ worek-legend | greedy | wygrywa Bot | 0 |
| 2006 | warhammer-wu ↔ worek-legend | random | wygrywa Bot | 0 |

Każda partia kończy się naturalnie (życie). Brak: `Błąd wewnętrzny`,
`undefined`, `NaN`, `cel: ?`. Weryfikacja na żywo po fixach: ta sama
partia 2004/defensive (g2004b) — 0 detektorów, mulligan trzyma rękę (F4).

## Znalezisko F3 (dane + silnik + kafel) — Kappa Tech-Wrecker: „Ninjutsu {1}{G}" stało generycznym {2}

**Objaw (g2004, krok ~76):** kafel Kappa w ręce pokazywał
`Ninjutsu {2}: wróć nieblokowanego atakującego, wejdź zatapnięta i
atakująca` — a Oracle mówi **`Ninjutsu {1}{G}`** (NEO #198; repo
`docs/cards/scryfall-kappa-tech-wrecker.json` + potwierdzone na żywo z API
Scryfall). Pita zielona zniknęła w trzech warstwach:

1. **Dane:** `cost: { mana: 2 }` (bez `colors`) — silnik interpretował to
   jako generyczne {2}, więc ninjutsu opłacała **dowolna** 2 mana
   (np. 2×{U}, 1{W}+1{R}).
2. **Silnik (klasa ukryta):** oferta ninjutsu w oknie
   `combat_damage` i `activateNinjutsu` (płatność `spendMana`) **nie
   patrzyły na pipy kolorów wcale** — jedyne aktywowane kosztowanie bez
   koloru w całym silniku. Audyt wszystkich ścieżek: cycling, reinforce,
   bloodrush, channel, forecast, equip — wszystkie mają
   `canPayColoredCost` + `colorRequirementsOf`; 8 pozostałych wywołań
   `spendMana` niosie wymagania. Tylko ninjutsu nie (L48: oferta =
   walidacja — oferta kłamała, a płatność kłamała razem z nią).
3. **Kafel:** etykieta budowana z gołego `cost.mana` („Ninjutsu {2}") +
   gramatyka żeńska („zatapnięta i atakująca") na karcie rodzaju męskiego.

**Poprawka (root cause, 3 pliki):**
- `src/cards/card-data.js`: `cost: { mana: 2, colors: ['G'] }`
  (semantyka: suma jednostek = 2, pita G wśród nich → {1}{G}, CMC 2).
- `src/engine/abilities.js`: okno ninjutsu `+ canPayColoredCost(state,
  playerId, colorRequirementsOf(ability.cost))`; `activateNinjutsu`:
  `spendMana(…, colorRequirementsOf(ability.cost))` (atomowo — CR 601.2h).
- `src/table/render.js`: etykieta `Ninjutsu {1}{G}` (notacja pipsów jak
  M138/Z10 — generyczny w klamkach + pipy) + „wejdź zatapnięty i
  atakujący".

**Zakres audytu:** w rejestrze są tylko 2 karty z ninjutsu — Kappa (zła) i
Blade-Blizzard Kitsune (Ninjutsu {3}{W} — dane `{mana: 4, colors: ['W']}`
poprawne; koszt rzutu {2}{W} CMC 3 ✓). Koszt RZUTU Kappy {1}{G} w
`MANA_COSTS` był poprawny od początku (druga ścieżka — rzuty kolory
walidowały). Kreator many (mana-wizard) od dawna kolorowo sprawny dla
`activate_ability` (czyta `ability.cost.colors`) — bez zmian.

## Znalezisko F1 (kafel) — „enters with a counter" niewidoczne na kaflu

**Objaw (g2001):** Serwitor/Servant of the Scale (0/0), Trigon of
Corruption i inna siódemka wchodziły na pole bitwy **z licznikami**, a
opis kafla nie mówił o tym ani słowem (kafał pokazywał staty bez
kontekstu wejścia; aktualne liczniki były widoczne dopiero po ETB jako
badge „Nx …"). Klasa L1/ADR 0017: widoczny stan musi być widoczny na kaflu.

**Zakres (7 kart, Oracle-verified w repo):**

| karta | entersWithCounters | linia kafla |
|---|---|---|
| Trigon of Corruption | 3× charge | Wchodzi z 3 licznikami charge |
| Kappa Tech-Wrecker | 1× deathtouch | Wchodzi z 1 licznikiem Dotykanie śmierci |
| Servant of the Scale | 1× +1/+1 | Wchodzi z 1 licznikiem +1/+1 |
| Necrosquito | 2× oil | Wchodzi z 2 licznikami oil |
| Voice of the Vermin | 1× shield | Wchodzi z 1 licznikiem shield |
| Swooping Protector | 1× shield | Wchodzi z 1 licznikiem shield |
| Creakwood Safewright | 3× −1/−1 | Wchodzi z 3 licznikami -1/-1 |

**Poprawka:** `cardInfo` (render.js) zyskuje `entersWithCounters` (z
rejestru; ze stanu dla tokenów/kopii; ukryte przy faceDown — CR 708.2),
`rulesText` zyskuje linię `Wchodzi z 1 licznikiem X / z N licznikami X`
(etykiety `COUNTER_LABELS`, ta sama konwencja co badge i „gdy ma
licznik …"). Widok (`playerView`) nie wymagał zmian — deskryptory
działają przez `details` z rejestru.

## Znalezisko F4 (narzędzie audytu) — profil defensive mulliganował do 0 kart

**Objaw (g2004):** profil `defensive` przy każdym modalu mulligana
wybierał „Weź mulligana" — 7→6→5→…→**0 kart** — i grał partię z pustą
ręką. Legalne (mulligan do 0 jest w MtG legalny), ale nieintendowane:
profil miał być „ostrożny", nie „samobójczy".

**Root cause:** heurystyka „opcja nie rób nic/pomiń"
`/pomij|nie |brak|zostaw/` **bez granic słów** — `nie ` łapało
„zosta**nie** 5" w etykiecie `Mulligan: Weź mulligana — dobierz 7 kart i
odłóż 2 karty na spód (zostanie 5)`.

**Poprawka:** `tools/table-tester/run-game.mjs` — granice słów
`/\bpomij|\bpomiń|\bbrak\b|\bzostaw\b|\bnie\b/i`. Legitymne opcje
„pomiń" istniejące w UI (Brak ataku, Brak bloków, Zostaw w wygnaniu,
Pomiń …) dalej się łapią; „zostanie" już nie. **Weryfikacja na żywo:**
ten sam seed/profil (g2004b) — tym razem „Zatrzymaj tę rękę (keep — 7
kart)", 0 detektorów.

## Zamknięte fałszywe alarmy (L57 — zweryfikowane, NIE naprawiane)

| podejrzenie | werdykt (źródło) |
|---|---|
| Colossodon Yearling „coś działa" | vanilla 2/4 Beast — `oracle_text: ""` (DTK #178, repo JSON + API) |
| Greater Tanuki CMC 4? | {4}{G}{G} = CMC 6 ✓ (repo JSON) |
| Thistledown Players untapuje artefakt? | „untap target nonland permanent" ✓ (repo Oracle — tekst w kaflu poprawny) |
| Breaching Hippocamp „sacrifice a land" bez celu? | Oracle: „untap another target creature you control" — bot nie miał innego stwora → „trigger bez efektu" poprawne |
| {2}{G} = CMC 2? | CMC 3 (2 generyczne + pita) — błąd rachuby audytora |
| Blade-Blizzard Kitsune ninjutsu {4}? | {3}{W} — dane `{mana:4, colors:['W']}` poprawne |
| „Atak: Woolly Loxodon (Morph)" (g2001) ujawnia morph? | WŁASNY morph gracza — właściciel zna swoją kartę (CR 708.6); runda 3: „FoW dotyczy tylko zagrań bota". Bot-morph (g2002/679) poprawnie anonimowy. Zgodne z regułą — bez zmian |
| „Aktywuj: Irontread Crusher … tapnij Soldier (" (g2005) | etykieta obcięta do 90 znaków w TRANSKRYPCIE (run-game.mjs), nie w UI |

**Weryfikacja fixu z rundy 2 na żywo (g2005):** Rupture Spire —
zatapnięte wejście, okno „Zapłata albo poświęcenie", gracz zapłacił {1} —
działa zgodnie z naprawą.

## Testy (RED→GREEN dowiedzione)

- `test/m257r4-zyjwy-tester.test.js` (7 testów): F3-a dane, F3-b kafel,
  F3-c oferta bez pipa zielonego (RED: oferta się pojawiała), F3-d oferta
  + płatność z {G} i odrzucenie wymuszonej płatności 2×{U} (throw
  „Brak kolorowej many"), F1 siódemka kart + strażnik ujemny, F4 wzorzec.
- RED: `git stash` starych `abilities.js`+`card-data.js` → 4/4 F3 fail;
  stary `render.js` → F1 fail. Po fixach: 7/7.
- `test/real-cards-batch29.test.js` B7.2: pula testowa 2×{U} →
  {G}+generyczna (test opierał się o starą dowolność; intencja =
  zachowanie stosu, bez zmian).
- Bramy końcowe: `npm test` **3755/3755**, `npm run build` **2910.5 kB**
  (56 modułów).

## Bramy

| brama | przed | po |
|---|---|---|
| `npm test` | 3748/3748 | **3755/3755** |
| `npm run build` | 2907.7 kB | **2910.5 kB** |
| macierz 6/6 detektory | 0 | 0 (g2004b po fixach) |

**Commit:** `eb8246a` (na `arena/01a04e98-mtg`, PR #88).

## Kardynały następnej rundy

- Inne okna combatowe (first strike w oknie, ninjutsu na BLOKUJĄCEGO —
  CR 702.48 pozwala tylko unblocked attacker — zachowanie do sprawdzenia
  na innej talii z ninjutsu).
- Pool talii dalej nieprzetestowanych: alara, dominaria-wu, forgotten-realms
  (bot) — karty z tych talii miały mało minut w tej rundzie.
