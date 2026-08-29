# AUDYT ŻYWYM TESTEREM M255 (2026-08-29) — pętla jakości po Batchu 51

**Zlecenie właściciela:** „Proponuje teraz pętlę jakości żywym testerem ze
szczególnym akcentem na nowe karty."

## Metoda

- Świeży build `dist/` (L76) + `npm i` w `tools/table-tester`.
- **18 partii**: 12 w rundzie 1, 6 kontrolnych po naprawach (te same pary talii
  i seedy, żeby porównać log przed/po). Tali dobrano wg priorytetu z
  `docs/setup/TESTER_STOLU.md` (§„Priorytet doboru talii"): najpierw te, które
  dostały karty w Batchu 51, potem te spoza próbki benchmarku
  (`worek-mroczny`), a na końcu talie zgłoszeń A–E (`dominaria-wu`).
- Profile `explorer / greedy / defensive / impatient / random`, seedy 3–71,
  `--steps 260`. Detektory (osie 1–4) + ręczna lektura transkryptów (L27/L40).
- Transkrypty: `tmp-audyt-m255/` (poza repozytorium — decyzja właściciela
  2026-08-28).

| Partia | Wynik | Detektory |
|---|---|---|
| r1: ravnica×tarkir-bg s3, tarkir-bg×ravnica s11, warhammer-brg×theros s17, theros×warhammer-brg s23, warhammer-wu×tarkir-wur s31, tarkir-wur×warhammer-wu s37 | 6× koniec partii | 0 |
| r1: worek-mroczny×ravnica s41, worek-mroczny×theros s47, dominaria-wu×warhammer-brg s53, dominaria-wu×worek-mroczny s59, tarkir-wur×theros s67, warhammer-brg×worek-mroczny s71 | 6× koniec partii | 0 |
| r2 (po naprawach): te same pary co wyżej, seedy 31/37/47/11/53/17 | 6× koniec partii | 0 |

**Pokrycie nowych kart (grep po transkryptach):** Skinbrand Goblin (1 partia),
Typhoid Rats (2), Invasive Species (3), Dromoka Warrior (3), Akroan Sergeant
(3), Thunderstaff (2), Savage Surge (2), Kulrath Mystic (3), Willbender (2),
Wormfang Newt (1), Altar of the Goyf (2). Wszystkie 11 przeszły przez stół.

**Wniosek z metody:** zero zgłoszeń detektorów przy pięciu realnych
znaleziskach — detektory łapią patologie bota i szum w etykietach, a nie
milczące skutki i nieprecyzyjne opisy. Te drugie wychodzą wyłącznie z lektury.

## Znalezisko A (silnik) — „trigger bez efektu" było KŁAMSTWEM (Kulrath Mystic)

Transkrypt `r1-wmroz-ths-s47.txt`, tura 12:

```
[ROZGRYWKA]   • Kulrath Mystic — trigger (rzucenie czaru)
[ROZGRYWKA]   • Kulrath Mystic — trigger bez efektu (nie było czego wykonać)
```

a kafel w tej samej partii:

```
Kulrath Mystic · 3 · Creature — Elemental Wizard · Gdy rzucisz czar: +2/+0 do końca tury.
  · Czujność · nie odtapuje się · +2/+0 · 4/4
```

**Root cause:** `buff_creature_until_end_of_turn` zapisuje buff w
`state.untilEndOfTurnBuffs` i nie emituje zdarzenia; `resolveTrigger` czyta
„0 nowych zdarzeń” jako „trigger bez efektu”. Masowe buffy tej samej rodziny
wołają `emitMassBuff` — jeden członek rodziny milczał (klasa M138/Z4). Ten sam
komunikat właściciel zgłosił dla Altara of the Goyf (M254/E): po naprawie celu
log nadal twierdziłby, że nic się nie stało.

**Druga bramka:** po dopisaniu zdarzenia log przestał kłamać, ale modal
„Rozgrywka” wciąż pokazywał tylko „zyskuje: czujność” — `stats_modified` jest w
`BOT_MOVE_NOISE` (M99), a wyjątek obejmował wyłącznie rozstrzygnięcia bota.
Reguła przeniesiona do czystej funkcji `isBotMoveNoise` (ADR 0011) i
rozszerzona o buffy `untilEndOfTurn`.

**Po naprawie** (`r3-wmroz-ths-s47.txt`, ten sam seed):

```
[ROZGRYWKA]   • Kulrath Mystic — trigger (rzucenie czaru)
[ROZGRYWKA]   • Kulrath Mystic dostaje +2/+0
[ROZGRYWKA]   • Kulrath Mystic zyskuje: czujność
[ROZGRYWKA]   • Kulrath Mystic — trigger się rozstrzyga
```

Nowa lekcja **L87**. Testy A1–A4 (mutacja: wycięcie zdarzenia → A1/A2 czerwone;
wycięcie wyjątku `untilEndOfTurn` → A3 czerwone).

## Znalezisko B (log) — bloodrush bez imienia i bez kosztu

`Skinbrand Goblin` (Batch 51, CR 702.63). Zdarzenia niosą `bloodrush: true`
i `card_discarded { cost: true }`, ale log drukował:

```
Odrzucasz Skinbrand Goblin
Aktywujesz zdolność: Skinbrand Goblin — zmiana statystyk celu → cel: Hill Giant
```

czyli: mechanika nienazwana, a zapłata wyglądała jak strata karty z ręki.
Po naprawie: „używa bloodrush: Skinbrand Goblin — odrzuca tę kartę z ręki → cel: …"
i „Odrzucasz Skinbrand Goblin (koszt: bloodrush)". Wzorzec M158/A (Morph).

**Ustalenie przy okazji (bez naprawy):** bezpośredni repro (bot: własny
atakujący + Goblin w ręce + {R}) pokazuje, że bot bloodrush UŻYWA — w 18
partiach nie trafiło się okno (karta w 1 partii, ręka+atak+mana naraz).

## Znalezisko C (log) — 29 typów efektów zdolności aktywowanych bez opisu

`r1-twur-whwu-s37.txt`, tura 16:

```
[ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: Thunderstaff
[ROZGRYWKA]   • Nieprzyjaciel: zdolność Thunderstaff rozstrzygnięta
```

`ABILITY_EFFECT_LABELS` (session.js) nie miało `buff_attacking_creatures`
ani `buff_creature_until_end_of_turn`. Skan katalogu poszedł dalej: **29 z 52**
typów używanych przez zdolności aktywowane nie miało opisu — tabela
dziurawiała się od dawna (Batch 51 dodał oba wpisy do etykiet PANELU w
render.js; druga tabela nie ma z nimi żadnego powiązania). Uzupełnione 31
wpisów + **strażnik M255/C1** (przejście po katalogu, wzorzec A2a/A2b z M179).
Dopisek do L84.

## Znalezisko D (panel) — dynamiczne P/T bez „+X/+X"

Kafel Altara of the Goyf (nowa etykieta po M254/E):

```
Altar of the Goyf · 5 · Kindred Artifact — Lhurgoyf
  · Gdy atakuje samotnie: liczba typów kart w grobach do końca tury.
```

Definicja X zajęła miejsce premii — gracz nie widzi, że stwór COŚ dostaje.
Ten sam kształt: Jyoti (`source_power`), Tarmogoyf, a etykieta `pump` drukowałaby
surowy slug (`signed()` nie zna wartości dynamicznych). Po naprawie (wspólny
helper `ptPair` dla `buff_*` i `pump`):

```
Gdy atakuje samotnie: +X/+X (X = liczba typów kart w grobach) do końca tury.
+X/+Y (X = liczba typów kart w grobach, Y = liczba typów kart w grobach +1) do końca tury.
```

Pin `test/bug-ptpair-description.test.js` („moc źródła” raz) zostaje zielony.

## Znalezisko E (bot) — Thunderstaff palony w Głównej 1

`r1-twur-whwu-s37.txt`, tura 16 (Główna 1 bota, brak atakujących):

```
[ROZGRYWKA]   • Nieprzyjaciel aktywuje zdolność: Thunderstaff
[ROZGRYWKA]   • Nieprzyjaciel: zdolność Thunderstaff rozstrzygnięta
```

{2} + tap na efekt, który wygasa w cleanup (klasa M96). `buff_attacking_creatures`
nie było w `TEMPORARY_PUMP_EFFECTS` → goła baza `score = 2`. Po dopisaniu typu
wspólny mianownik potrzebował jeszcze **reprezentanta zbioru** (odbiorcą był
artefakt-źródło, więc `combatTrickWindow` nie zachodził i bot dostałby karę
zawsze). Reprezentant = własny atakujący z `view.combat` (ADR 0017). Po
naprawie: w `r2-twur-whwu-s37` bot Thunderstaffa w Głównej 1 już NIE rusza, a
test E2 (anty-over-fix) potwierdza aktywację w oknie walki. Dopisek do L50.

## Znalezisko F (silnik + narzędzie) — obrońca bez pass w kroku obrażeń (martwy punkt pełnej macierzy)

**Źródło:** nie tester, tylko PRÓBA PEŁNEJ MACIERZY (wątpliwość 5 w PR #87):
`node tools/benchmark.mjs --full` (~23 400 meczów, ~50 min) kończył się

```
Błąd benchmarku: Kontroler nie znalazł ruchu mimo legalnych komend
```

bez żadnego adresu. Narzędzie dostało kontekst (L88): kontroler wymienia
krok i komendy, `runBenchmark` dokłada boty/talie/seed. Drugi bieg wskazał:

```
[tura 15 · combat/combat_damage · priorytet: p2 · komendy: activate_ability, concede]
— mecz: random(final-fantasy) vs aggro(alara), seed 1001
```

**Przyczyna (silnik, nie bot):** reguła M172/C „pass nie może domknąć kroku
obrażeń” istniała w DWÓCH KOPIACH — w `execute` (odrzucenie
`combat_unresolved`) i w budowie oferty (`blockedByCombat`) — i obie blokowały
pass KAŻDEMU graczowi, podczas gdy jedyna alternatywa (`resolve_combat`) jest
oferowana wyłącznie graczowi AKTYWNEMU. Obrońca, który dostał priorytet przy
`passes = 1` i pustym stosie (standardowo po akcji atakującego w oknie
obrażeń — CR 117.3b oddaje priorytet aktywnemu), nie miał ani pass, ani
`resolve_combat`: zostawał z samym `concede`. Dla człowieka oznacza to brak
przycisku „Dalej” w oknie obrażeń.

**Naprawa (wspólny mianownik, nie `if` po nazwie roli):**

1. Jedna funkcja `closingCombatPassBlocked(state, playerId)` — oferta i
   walidacja czytają tę samą regułę (L41/L48: kopie się rozjeżdżają).
   Zakaz dotyczy wyłącznie gracza, który MA alternatywę (aktywny).
2. Pełna runda passów w kroku obrażeń NIE domyka kroku: priorytet wraca do
   aktywnego gracza, a licznik passów zostaje domknięty — jego pass jest
   nadal odrzucany, więc obrażenia nie zostaną pominięte (regresja M172/C).
3. Narzędzie: wyjątek aggro-bota niesie krok/komendy, `runBenchmark` — adres
   meczu. Świadomie NIE dodano ślepego fallbacku w polityce bota („bierz
   pierwszą legalną komendę”): ukryłby lukę polityki, a wyjątek z adresem
   lokalizuje prawdziwą przyczynę w minutę.

**Dowód, że to był martwy punkt, nie wycena:** golden-master bota
(`test/bot-scoring-snapshot.test.js`) zmienił się w DOKŁADNIE jednej z sześciu
partii: `dominaria-brg|mirrodin-wu@1001` — decyzje **101 → 224** (partia
kończyła się przedwcześnie), `scoreSum` rośnie razem z długością partii. Fixture
zregenerowano procedurą repo (`node tools/bot-scoring-snapshot.mjs --write`).

**Testy:** F1 (obrońca ma pass), F2 (atakujący nadal nie ma — M172/C
nienaruszone), F3 (pass nie domyka kroku: obrażenia padają po
`resolve_combat`), F4 (mecz `random/final-fantasy vs aggro/alara`, seed 1001
dochodzi do końca), F5 (wyjątek bota niesie kontekst).

## Sprawdzone i UZNANE za poprawne (bez zmian)

- **Invasive Species**: cel obowiązkowy, „inny permanent", 7 opcji (bez siebie),
  lądy legalne — zgodnie z Oracle; log nazywa trigger i skutek.
- **Renown** (Akroan Sergeant): „zyskuje sławę (renown) — 1 licznik +1/+1".
- **Wormfang Newt** (M254/D): karta wraca po zniszczeniu Newta efektem.
- **Morph / Willbender**, **Typhoid Rats** (deathtouch), **Savage Surge** w oknie
  bloków, **Dromoka Warrior**, **Altar of the Goyf** (po M254/E pompuje
  atakującego).
- **Bloodrush** — mechanika działa (repro z botem), w próbce nie wyszło okno.

## Kardynały następnej rundy (rozpoznane, poza zakresem tej)

1. **Komunikat „trigger bez efektu (nie było czego wykonać)” bywa PRAWDZIWY, ale
   nieprecyzyjny**, gdy efekt nie ma odbiorców: Veiled Ascension (brak zakrytych
   stworów), Trostani Discordant (nikt nie kontroluje cudzych stworów).
   Właściwy powód to „brak legalnych celów” (M189/Z2) — wymaga, żeby efekty
   sygnalizowały „nie miałem kogo” odrębnym powodem zamiast ciszy.
2. **Bloodrush poza zasięgiem detektorów**: w 18 partiach ani jednego okna.
   Warto dołożyć profil testera albo partię z wymuszoną ręką (seedowany deck
   stacking), żeby ćwiczyć mechaniki „z ręki”.
3. Budżet lektury startowej rośnie: ~97,2k / 100k po tej sesji (+2,2k; L88
   waży ~0,5k). Zapas ~2,8k tokenów wystarczy na jedną-dwie lekcje — potem
   trzeba przenieść część starszych wpisów do archiwum poza lekturą
   obowiązkową.

## Bramy

- `npm test` **3692/3692** (było 3674; +18 nowych testów w
  `test/m255-petla-jakosci.test.js`: A–E = 13, F = 5).
- `npm run build` **56 modułów / 2884.2 kB**.
- Strażniki dokumentacji (`docs-decisions`, `dokumentacja-budzet-lektury`): 17/17.
- Weryfikacja mutacyjna: A→A1/A2/A3, B→B1/B2, C→C1/C2, D→D1/D2, E→E1,
  F→MUT1:(F1,F3,F4) / MUT2:(F2,F3) / MUT3:(F3) / MUT4:(F5) — każda naprawa
  cofnięta jedną edycją czerwieni właściwy test.
  Uwaga proceduralna: `git checkout -- <plik>` w skrypcie mutacji cofnął też
  niezatwierdzoną poprawkę F — kopie zapasowe plików zamiast checkout.
- Benchmark B0 (`npm run test:slow`) bez zmian: naprawy nie dotykają wyceny
  czarów ani punktacji poza jednym wpisem w tabeli `TEMPORARY_PUMP_EFFECTS`
  (uruchamia się wyłącznie dla zdolności typu „atakujące stwory +X/+0”).
