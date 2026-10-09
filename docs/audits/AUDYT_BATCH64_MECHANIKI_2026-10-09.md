# Audyt mechanik batcha 64 — karta po karcie (sesja 2026-10-09, PR #159)

Zlecenie właściciela: „szczegółowy audyt każdej mechaniki kart z ostatniego
batcha — poprzedni agent zrobił to strasznie szybko". Zakres: 10 kart batcha 64
(PR #158, M439). Raport PR #158 (`PMSSB59_BATCH64_2026-10-08.md`) mierzył
**jakość wyceny bota**, nie zgodność z Oracle — ten audyt mierzy zgodność.

## 0. Metoda

1. **Źródło kart:** snapshoty właściciela `docs/cards/scryfall-<id>.json`
   (ADR 0029 — katalog rośnie wyłącznie z jego kolekcji). Dla każdej karty
   porównane: `name`, `set`, `type_line` (typy + podtypy), `mana_cost`/`cmc`,
   `colors`, `power`/`toughness`, `keywords`, dosłowny `oracle_text` i `rulings`.
2. **Źródło reguł:** plik CR pobrany w tej sesji z mirroru `nwgarne/mtg-data`
   (`rules/cr-raw.txt`) przez API GitHuba — 977 752 bajty, SHA-256
   `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca`, wydanie
   **2026-09-25** (identyczne z tym, na którym stoi tabela cytatów; ADR 0030).
   Każdy cytat poniżej ma numer linii w pobranym pliku.
3. **Pomiary:** uruchomione na żywym silniku (`createGameState` + `applyEffect` +
   `playerView` + `runStateBasedActions`), nie wyczytane z kodu. Skrypty w
   `/tmp` (poza repo).

## 1. Werdykt zbiorczy

| Karta | Dane vs Oracle | Mechanika | Werdykt |
|---|---|---|---|
| Brave-Kin Duo (BLB) | zgodne | `{1},{T}` +1/+1 do EOT, sorcery-speed | **OK** |
| Bog Hoodlums (LRW) | zgodne | `cantBlock` + clash z licznikiem | **OK** |
| Druid of the Cowl (M19) | zgodne | `{T}: Add {G}` | **OK** |
| **Man-o'-War (MH1)** | **ROZJAZD** | ETB bounce | **B-1 — zmyślone `flying`**, naprawione |
| Narset's Rebuke (TDM) | zgodne | 5 obrażeń + {U}{R}{W} + exile zamiast grobu | **OK** |
| Quandrix Campus (STX) | zgodne | enters tapped, {G}/{U}, {4}{T} scry 1 | **OK** |
| Scouting Hawk (CLB) | zgodne | Keen Sight (warunek z liczby lądów) | **OK** (mylący `notes` — B-4) |
| Spineseeker Centipede (DSK) | zgodne | tutor landu + delirium statyczne | **OK** |
| Sultai Scavenger (KTK) | zgodne | delve + flying | **OK** |
| Universal Solvent (CMR) | zgodne | `{7},{T}`, poświęcenie: zniszcz permanent | **OK** |

Dodatkowo: **„Keen Sight" nie jest kartą** — to ability word na Scouting Hawk.
W PR #158 figurował w wyliczeniu „Keen Sight (`condition.opponentControlsMoreLands`)",
co dało się czytać jako osobna karta; w rejestrze `keen-sight` nie istnieje
(sprawdzone: `registry.get('keen-sight')` → brak, `/keen/i` po 616 kartach → brak).

## 2. B-1 — Man-o'-War miał zmyślone `flying` (naprawione)

Definicja: `keywords: ['flying']`. Snapshot: `keywords: []`,
`type_line: "Creature — Jellyfish"`, Oracle bez słowa flying. **Karta w grze
latała**: obiekt niesie `keywords: ["flying"]` (pomiar), PlayerView wystawia je
dalej, więc bot nie brał go pod uwagę jako blokera naziemnego ataku, a walidacja
bloków puszczała go tylko przy ataku z flying/reach.

Dlaczego przetrwało audyt PR #158: pin „dane Oracle" przypisywał lot jako fakt —
`test/real-cards-batch64.test.js:197`:
`assert.deepEqual(def.keywords, ['flying'], 'lot')`. To klasa **L181** (pin
skopiowany z definicji cementuje błąd). Naprawa: definicja bez `flying`, pin na
pustą listę, nowa straż katalogowa (§3). Mutacja sprawdzona wykonaniem — po
przywróceniu `flying` straż czerwieni się komunikatem wskazującym kartę i pole.

Ruling MH1 2019-06-14 (ze snapshotu) działa poprawnie: gdy Man-o'-War jest
jedynym stworem na polu, `legalTargetCandidates` zwraca `["mow"]` — celuje
w siebie (pomiar).

## 3. Nowa straż: definicja ↔ snapshot dla CAŁEGO katalogu

`test/audyt-katalog-dane-vs-snapshoty.test.js` — porównuje każdą kartę mającą
snapshot (561 z 616; pomiar w §3) w siedmiu polach plus `oracleText`. Granice oznaczone
uczciwie, nie „zielone":

* 55 kart bez snapshotu — pomijane (licznik w komunikacie);
* 21 snapshotów kart dwustronnych bez `oracle_text` (np.
  `scryfall-lodestone-needle.json`: `oracle_text: null`, `type_line: "Artifact //
  Artifact"`) — porównanie tekstu/typów pomijane;
* reminder text (CR 207.2a, linia 1496: „Reminder text is italicized text within
  parentheses that summarizes a rule that applies to that card.") wycinany przed
  porównaniem — definicje raz go mają (Merfolk Falconer), raz nie (Courage in
  Crisis), a regułą nie jest (CR 207.2, linia 1494: „The text box may also
  contain italicized text that has no game function.");
* tokeny: `set` i mana value nieporównywane (snapshot niesie kod dodatku wydruku
  i koszt druku tokenu, np. Tarmogoyf token `{1}{G}`); P/T zmienne (`*/1+*`)
  pomijane; typ `Token` znormalizowany po obu stronach; podtypy wielowyrazowe
  („Urza's Mine") łączone.

Wynik po naprawie B-1: **2/2 zielone, zero rozjazdów**. Liczniki (pomiar):
616 kart w rejestrze, **561 ma snapshot** (55 bez — pomijane), z 562 plików
snapshotów **10 nie ma `oracle_text`** i 9 to karty dwustronne — dla nich
porównanie tekstu i typów jest pomijane, reszta pól i tak porównana.

## 4. Mechanika po mechanice — dowody

**Brave-Kin Duo** — `{1}, {T}: Target creature gets +1/+1 until end of turn.
Activate only as a sorcery.` → `cost: { mana: 1, tap: true }`,
`timing: 'sorcery'`, `buff_creature_until_end_of_turn` +1/+1. Bramka sorcery
egzekwowana w `abilities.js:625/1071/1203` (`ability.timing === 'sorcery' &&
!sorcerySpeed → continue`) — zdolność znika z oferty, gdy na stosie jest czar.

**Bog Hoodlums** — clash (CR 701.30). Pomiar kodu: obaj gracze odsłaniają
wierzchnią kartę (`card_revealed` z `clash: true`), wygrywa **ściśle wyższa**
mana value (`won = myValue > opponentValue` — remis = brak wygranej, zgodnie
z „A player wins if their card had a greater mana value"), pusta biblioteka = −1
(przegrana), decyzja „wierzch albo spód" to blokująca komenda
`resolve_clash_choice` per gracz w kolejności caster → przeciwnik, a licznik
+1/+1 ląduje **po** obu decyzjach i tylko gdy źródło wciąż jest na polu bitwy
(`counterTarget.zone === 'battlefield'`). Zakaz blokowania: `cantBlock: true` →
`cantBlockPrinted` (łańcuch L21 + kopiowanie domknięte w F-1/F-8 tej sesji).

**Druid of the Cowl** — `{T}: Add {G}` → `add_mana { amount: 1, colors: ['G'] }`,
bez wpisu w `MANA_SOURCE_MAP` (mana z deskryptora karty, M193/A). Pomiar:
aktywacja daje dokładnie `{G}: 1`.

**Narset's Rebuke** — „deals 5 damage to target creature. Add {U}{R}{W}. If that
creature would die this turn, exile it instead." → trzy osobne `add_mana`
(po jednej jednostce każdego koloru, ADR 0015) + `exile_if_dies_this_turn`.
Pomiar end-to-end: znacznik na `state.exileIfDiesThisTurn`, po 5 obrażeniach
i `runStateBasedActions` ofiara ma `zone = undefined` (nowy obiekt `exile-0`),
**grób p2 pusty**, `zones.exile: ["exile-0"]`.

**Quandrix Campus** — `entersTapped: true`; produkcja z `MANA_SOURCE_MAP`
(`mana-sources.js:34`: `{ colors: ['G','U'], amount: 1 }`) + pusty wpis
`mana-costs-data.js:602` (wzorzec Prismari Campus); `{4},{T}` → `scry 1`.
Pomiar: `{G}` → pula `{"G":1}`, `{U}` → `{"U":1}`, `scry` → `pendingScry`
z decyzją dla kontrolera.

**Scouting Hawk** — Keen Sight: `condition: { opponentControlsMoreLands: true }`
liczone w `triggers.js:125–133` jako liczba WSZYSTKICH lądów (predykat
`kind === 'land' || types.includes('Land')`) po obu stronach, warunek
`landsOf(przeciwnik) > mine` — zgodne z „if an opponent controls more lands than
you". Efekt `search_library_to_battlefield` z kwalifikatorem Basic Land Plains
i `entersTapped: true`; brak słowa „target" → zdolność nie wybiera celu
(CR 608.2b).

**Spineseeker Centipede** — delirium (CR 207.2c) jako warunek STATYCZNY
(`condition: { delirium: true }`, `pump: {1,2}` + `keywords: ['vigilance']`).
Licznik typów: liść `graveyard-types.js` (`countGraveyardCardTypes`) — wyłącznie
karty (`isCardObject`, bez tokenów), wyłącznie własny grób, typy z `CARD_TYPES`
(CR 205.2a). Pomiar: 4 typy w grobie → widok **3/3** z `vigilance`; 3 typy →
**2/1** bez słowa kluczowego.

**Sultai Scavenger** — delve. `delveExileLimit` (`spells.js:3899`) liczy
`min(część generyczna kosztu CAŁKOWITEGO po obniżkach, liczba własnych kart
w grobie)`, z wyłączeniem samej rzucanej karty. Pomiar: MV 6, część generyczna
**5**, 8 kart w grobie → limit **5** — dokładnie ruling KTK 2021-03-19
(„You can exile cards to pay only for generic mana, and you can't exile more
cards than the generic mana requirement").

**Universal Solvent** — `{7}, {T}, Sacrifice this artifact: Destroy target
permanent.` → `cost: { mana: 7, tap: true, sacrificeSelf: true }`, cel
`{ type: 'permanent' }`. Pomiar: przy własnym artefakcie, wrogim lądzie i wrogim
stworze na polu kandydaci to `["us","las1","stwor"]` — wszystkie trzy legalne.

## 5. Zgłoszenia bez naprawy (decyzja właściciela)

**B-3 — WYCOFANE w całości; audyt orzekał wobec kryterium, którego nie ma.**
Pierwsza wersja twierdziła, że trzy karty batcha mają `plan` „niezgodny
z faktycznym planem" (Druid of the Cowl M19 → Kaladesh, Scouting Hawk CLB →
Kaldheim, Universal Solvent CMR → Kaladesh), druga wersja szukała „kryterium
właściciela". Obie były błędne: przyjęły, że `plan` ma wynikać z dodatku.

**Reguła właściciela (2026-10-09):** `plan` to **fabularne przyporządkowanie
karty**, przekazane przy dostawie batcha i zapisane w katalogu jako prawda
obowiązująca — z setem/drukiem ma niewiele wspólnego, a skrypt układa z niego
talię. Dlatego:

* Druid of the Cowl (M19) i Universal Solvent (CMR) **są** z Kaladeshu — Cowl to
  dzielnica/fragment Ghirapur; obie karty leżą w `decks/kaladesh.txt` poprawnie;
* talie Wiedźmina i Warhammer Fantasy w ogóle by nie powstały, gdyby `plan`
  miał być setem — w vanilla MtG nie ma takich setów ani planów;
* grupa „Kaldheim" (9 kart: KHM ×2, ALA ×2, ORI, 2XM, 2X2, MOM) i „Warhammer
  Fantasy" (42 karty z 30 dodatków) są spójne fabularnie, nie dodatkami.

Druga część reguły: bez planu zostają **wyłącznie** basic landy, tokeny, karty
specjalne i tylne strony DFC — żadna regularna karta nie ma prawa nie mieć planu.
Pomiar katalogu to potwierdza: 53 karty bez planu = 5 basic landów
(`basic-plains`…`basic-forest`) + 48 tokenów (`token_*`), zero innych; wśród kart
`supported` bez planu są tylko basic landy, które generator i tak odsiewa.

Wdrożone: reguła w `AGENTS.md` §„Dodawanie kart" + strażnik
`test/katalog-pole-plan.test.js` (2 testy: brak regularnych kart bez planu oraz
pin, że grupy planowe mieszają dodatki — żeby nikt nie „naprawił" pola setem).

**B-4 — mylący wpis `notes` w Scouting Hawk.** Uwaga brzmi „warunek liczony ZE
STANU w conditionHolds (tylko lądów w kolorze karty, nie wszystkich lądów)",
a implementacja liczy **wszystkie** lądy (poprawnie wobec Oracle). Czytelnik
dostaje sprzeczną informację; sam kod jest dobry.

**B-5 — niekonsekwentny reminder text w `oracleText`.** Siedem kart ma tekst bez
nawiasów wyjaśniających (Courage in Crisis, Spread the Sickness, Dunland Crebain,
Voice of the Vermin, Somberwald Spider, Time to Feed), a Merfolk Falconer —
z nawiasami. Reminder text nie jest regułą (CR 207.2a), więc to wyłącznie spójność
wyświetlania; straż katalogowa porównuje tekst po jego wycięciu.

## 6. Bramki

| Brama | Wynik |
|---|---|
| `npm test` (fast) | **7920/7920**, EXIT 0 |
| `node tools/cr-numery.mjs --cr /tmp/cr.txt` | OK, 518 numerów / wydanie 2026-09-25 |
| straż katalogowa definicja ↔ snapshot | 2/2, 561 kart z snapshotem, 0 rozjazdów |
| `test/real-cards-batch64.test.js` | 34/34 (pin lotu poprawiony) |
