# PLAN batch62 — kolekcja 176–210 (10 kart), 2026-10-02

Zlecenie: lista właściciela (10 kart, wklejona w czacie). Gałąź `arena/01a0f87a-mtg`
(PR #150, ta sama sesja co audyt PR #149 i poprawka zgłoszenia A — kolejny
batch to nowe commity, nie nowy PR; AGENTS.md „1 sesja = 1 gałąź = 1 PR”).
Procedura: `docs/cards/HOW_TO_ADD_CARD.md`, ADR 0010 §2a, ADR 0014, ADR 0022
(pełny Oracle, `support.limitations` pusty), ADR 0029 (tylko karty z listy
właściciela), ADR 0030 (CR/rulingi dosłownie z sieci przed zmianą reguł),
ADR 0002 (zero przypadków specjalnych po nazwie/ID karty w silniku), ADR 0020
(commit per transza, bez force push).

Audyt poprzedniego scalonego PR (#149) — wykonany na początku sesji:
`docs/audits/AUDYT_PR149_2026-10-01.md` (wynik także w opisie PR #150).

## 0. Dane źródłowe (KOMPLET 10/10; `set=` obowiązkowy; jedno pobranie na kartę)

Pole **Plan z listy właściciela jest wiążące** i przepisane 1:1 (także tam, gdzie
świat planu „nie pasuje” do karty, np. Golem-Skin Gauntlets → Kaldheim).
Numer z kolumny „Ilustracja” (np. `176FIN`) to `artId` = 176; w słowniku
`tools/collection-art-ids.csv` brakowało dokładnie tych 10 numerów (luki
176/178/192/194/196/198/203/205/208/210) — wiersze dochodzą na swoje miejsca.

| artId | Karta | Set | Nr | Rar | Koszt | Oracle (skrót) | Plan (wiążący) |
|-------|-------|-----|----|-----|-------|----------------|----------------|
| 176 | Chocobo Kick | FIN | 178 | C | {1}{G} | Sorcery; Kicker — zwróć land do ręki; cel: twój stwór zadaje obrażenia równe mocy celującemu stworowi przeciwnika, a przy kickerze dwa razy tyle | **Final Fantasy** |
| 178 | Oreplate Pangolin | EOE | 150 | C | {1}{R} | Artifact Creature 2/2; gdy inny twój artefakt wchodzi — możesz zapłacić {1}, wtedy licznik +1/+1 | **The Edge** |
| 192 | Crumbling Vestige | OGW | 170 | C | — | Land; wchodzi tapnięty; ETB: dodaj jedną manę dowolnego koloru; {T}: {C} | **The Edge** |
| 194 | Lionheart Maverick | GPT | 11 | C | {W} | 1/1 Human Knight; Vigilance; {4}{W}: +1/+2 do końca tury | **Warhammer Fantasy** |
| 196 | Mnemonic Wall | THS | 55 | C | {4}{U} | 0/4 Wall; Defender; ETB: możesz zwrócić instant/sorcery z własnego grobu do ręki | **Theros** |
| 198 | Tackle Artist | SOS | 133 | C | {3}{R} | 4/3 Orc Sorcerer; Trample; Opus — przy rzucie instant/sorcery licznik +1/+1, a przy ≥5 wydanej many dwa | **Arcavios** |
| 203 | Golem-Skin Gauntlets | 2XM | 259 | C | {1} | Equipment; nosiciel +1/+0 za każdy przypięty do niego Equipment; Equip {2} | **Kaldheim** |
| 205 | Vulturous Aven | DTK | 126 | C | {3}{B} | 2/3 Bird Shaman; Flying; Exploit; gdy poświęcisz stwora — dobierz 2 i traćcie 2 życia | **Tarkir** |
| 208 | Jade Bearer | RIX | 134 | C | {G} | 1/1 Merfolk Shaman; ETB: licznik +1/+1 na INNYM celującym Merfolku, którego kontrolujesz | **Ixalan** |
| 210 | Fiery Justice | 2X2 | 212 | R | {R}{G}{W} | Sorcery; 5 obrażeń podzielonych dowolnie między dowolną liczbę celów; celujący przeciwnik zyskuje 5 życia | **Kaldheim** |

Uwaga o numeracji: kolumna „Ilustracja” (np. 176) to numer wiersza arkusza
właściciela, a nie numer kolekcjonerski druku (Chocobo Kick = FIN 178,
Oreplate Pangolin = EOE 150 itd.). Snapshoty zapisują oba (`collector_number`
z druku; `artId` w definicji z arkusza).

### Rulingi (pobrane `fetch_page` z `/cards/<set>/<nr>/rulings`, zapis w snapshotach)

- **Chocobo Kick** (7): karta „kicked”, gdy opłacono koszt kickera; bez rzutu
  nie ma kickera; kopia czaru kicked jest kicked; **jeśli którykolwiek cel jest
  nielegalny przy rozstrzyganiu — żadne obrażenia nie są zadane, a gdy oba —
  czar nie rozstrzyga się wcale**; koszt całkowity = baza + kicker − redukcje,
  MV bez zmian; kickera nie płaci się wielokrotnie.
- **Oreplate Pangolin**, **Crumbling Vestige**, **Lionheart Maverick**, **Mnemonic
  Wall**, **Jade Bearer**: brak rulingów (pobrane, pusta lista).
- **Tackle Artist** (1): zdolność opus rozstrzyga się PRZED czarem, który ją
  odpalił, i rozstrzyga się nawet gdy czar zostanie skontrowany/opuści stos.
- **Golem-Skin Gauntlets** (2): bonus jest dodatkiem do bonusów innych
  Equipmentów; Gauntlets liczą same siebie (min +1/+0).
- **Vulturous Aven** (5): stwór „exploits a creature”, gdy kontroler poświęca
  stwora przy rozstrzyganiu zdolności exploit; wybór poświęcenia przy
  rozstrzyganiu; może poświęcić samego siebie (wtedy druga zdolność odpala);
  jeśli Aven opuścił pole przed rozstrzygnięciem — brak bonusu; max jeden stwór.
- **Fiery Justice** (3): liczbę celów i podział ogłasza się przy rzucie; każdy
  cel obrażeń musi dostać ≥1; część nielegalnych celów — podział zostaje,
  nielegalni nie dostają obrażeń; **gdy wszystkie cele (łącznie z przeciwnikiem)
  staną się nielegalne — czar nie rozstrzyga się; gdy tylko cele obrażeń —
  przeciwnik i tak zyskuje 5 życia**; przeciwnik może być też celem obrażeń
  (zdobycie życia następuje przed SBA).

### CR do pobrania PRZED kodowaniem (ADR 0030; numerów z pamięci nie cytować)

- Kicker (koszt niemanowy, „kicked”), Opus (słowo zdolności, nie mechanika
  z regułami własnymi), podział obrażeń przy ogłaszaniu celów („divided as you
  choose”, ≥1 na cel), „dowolna liczba celów” (zero), Equipment (przypięcie,
  liczenie przypiętych), zapłata kosztu dodatkowego po wybraniu celów
  (kolejność: cele → płatność), exploit (już w kodzie, 702.110 — tylko
  potwierdzenie).

## 1. Rekonesans silnika (zrobiony przed planem)

ISTNIEJE (wystarczy dane + testy):
- Vigilance, aktywowany pump `{4}{W}: +1/+2` (wzorzec Boros Challenger);
- ETB „zwróć instant/sorcery z grobu” — Revolutionist (`requiresTarget`
  `instant_or_sorcery_card_in_graveyard`), Defender;
- Exploit z triggerem „exploits” (Silumgar Butcher, Gurmag Drowner);
- „another target <podtyp> you control” (Knight w karcie ETB z `requiresTarget`);
- opcjonalna płatność triggera `payMana` + `trigger.event` artefaktów:
  `artifact_you_control_enters` (Steelfin Whale) — brak odróżnienia „another”;
- `manaSpentAtLeast` na efekcie triggera (Tellah) i `condition: { wasKicked }`;
- `damage_from_target_power` (Diplomatic Relations) — bite jednostronny;
- dzielenie obrażeń: tor triggerów (`damage_divided`, Inferno Titan:
  `pendingDamageDivision`, 1–3 cele) i Fireball (równy podział) — brak toru
  CZARU z podziałem wybranym przez gracza i z dowolną liczbą celów;
- `variableTargets` istnieje wyłącznie w czarach modalnych.

BRAK (mechaniki do zbudowania, generycznie, ADR 0002):
1. **`another: true` na triggerze `artifact_you_control_enters`** (Pangolin
   jest sam artefaktem — „another artifact”, CR 603.2d/108.? do potwierdzenia
   przy lekturze).
2. **Mana z TRIGGERA wejścia** (Crumbling Vestige): `add_mana` w efekcie
   triggera (kolor „any color” = jednostka wielokolorowa jak Skarb); mana
   znika z pulą na końcu fazy — test, że można ją wydać w tej samej fazie
   (land zagrany w main).
3. **Opus** (Tackle Artist): trigger `you_cast_instant_or_sorcery_spell`
   (+ etykieta PL, wycena bota, opis zdarzenia) i warunek efektu
   „mniej niż N wydanej many” (`manaSpentBelow`, bliźniak `manaSpentAtLeast`).
4. **Dynamiczny bonus Equipmentu** (Gauntlets): `equipment.pumpPerAttachedEquipment`
   (+1/+0 za każdy Equipment przypięty do nosiciela, razem z samym sobą) —
   cały łańcuch deskryptora registry → identity → attachmentGrant →
   permanents (L21), render opisu sprzętu, wycena bota.
5. **Kicker o koszcie NIEMANOWYM** (Chocobo Kick): `kicker.returnLand`
   („Return a land you control to its owner’s hand”), wybór lądu przy rzucie
   (`kickerLandId` w komendzie), oferta per ląd, płatność PO kosztach manowych
   (CR: koszty płaci się po wyborze celów; wolno najpierw wytapować ten ląd na
   manę), walidacja = oferta (L48), render/kreator/bot. Spoiler ryzyka: panel
   „cel × cel × ląd” — kreator z osobnymi sekcjami jak przy poświęceniu
   (`sacrificeCastPlanOf`).
6. **Czar z podziałem obrażeń i dowolną liczbą celów** (Fiery Justice): tor
   `spell.divided` (łączna kwota, min ≥1 na cel, 0..N celów) + drugi cel
   „target opponent”; podział ogłaszany PRZY RZUCIE (CR 601.2d), zapis na
   obiekcie stosu, rozstrzyganie per cel z nielegalnymi pominiętymi i
   życiem dla przeciwnika nawet gdy cele obrażeń znikły; oferta ograniczona
   (`VARIABLE_TARGET_OPTION_CAP`), walidacja pełna; kreator wielocelowy z
   alokatorem kwot (wspólny z Inferno Titan), bot (wycena podziału).

## 2. Transze (commit per transza, każdy samodzielnie zielony: `npm test` + `npm run build`)

Każda transza zawiera: snapshot(y) `docs/cards/scryfall-<slug>.json` (+ rulings),
wiersz(e) w `tools/collection-art-ids.csv`, definicje w `REAL_CARDS`,
`mana-costs-data.js`, regenerację talii (`node tools/generate-plan-decks.mjs`)
i testy w `test/real-cards-batch62.test.js` (legalny + nielegalny + sanity
danych + interakcje), zgodnie z ADR 0023 (każda wspierana karta w dokładnie
jednej talii) i strażnikami katalogu.

- [x] **T0** (957b93c) — ten plan (sam dokument). Snapshoty i wiersze arkusza NIE idą osobno: strażnicy
  „brak sierot w docs/cards” (D/14, OW/6) i piny liczebności słownika
  (`art-ids-tool.test.js`: 533 → +1 za każdą kartę) wymagają, by snapshot, wiersz
  CSV i definicja karty weszły w TYM SAMYM commicie (zmierzone: osobny commit
  danych = 4 czerwone testy).
- [x] **T1** (npm test 7329/7329, build 70 mod. / 4715,5 kB) — Lionheart Maverick, Mnemonic Wall, Vulturous Aven, Jade Bearer (czyste dane + testy).
- [ ] **T2** — Oreplate Pangolin (`another`) + Crumbling Vestige (mana z triggera). **PRZESUNIĘTA NA KONIEC
  (po T6)**: pomiar generatora — z tymi dwiema kartami plan „The Edge” osiąga 15 kart i auto-awansuje z
  worka-legend (ADR 0023 §4); worek-legend spada do 5 kart nielandowych, a przetasowanie mapy WOREK_DECKS
  do 4 worków wymaga razem ≥60 kart nielandowych w planach workowych — dziś jest ich 58 (Lorwyn 12,
  Kamigawa 8, Bloomburrow 7, Thunder Junction 7, Amonkhet 5, Duskmourn 5, New Capenna 5, Kaldheim 4,
  Arcavios 3, TMNT 2), po T3/T4/T6 (Arcavios +1, Kaldheim +2) będzie 61 — dopiero wtedy przetasowanie jest
  wykonalne. Gotowy kod T2 (patche) czeka poza repo; każdy commit ma zostać zielony.
- [x] **T3** (npm test 7335/7335) — Tackle Artist (opus: nowe zdarzenie + `manaSpentBelow`).
- [x] **T4** — Golem-Skin Gauntlets (`pumpPerAttachedEquipment`: registry → identity → attachments → permanents, etykieta kafla, wycena bota `equipPumpOf`).
- [x] **T5** — Chocobo Kick (kicker niemanowy `returnLand` + `kickerLandId`, bite ×2 przy kickerze; kreator: wymiar kosztu `costKey` w `multiTargetPlanOf`; bot: `kickerReturnLandPenalty`).
- [ ] **T6** — Fiery Justice (czar z podziałem obrażeń; kreator; bot).
- [ ] **T7** — dokumentacja: `PROJECT_HISTORY.md`, `ENGINE_MILESTONES.md`, lekcja (jeśli
  wypadnie), opis PR #150, handoff; rekalibracja progów benchmarku i
  golden-master tylko jeśli zmienią się talie z próbki benchmarku.

## 3. Ryzyka i pułapki

- Każda nowa karta wymaga reguły talii (ADR 0023) — dopisanie do katalogu bez
  regeneracji talii wywraca strażnika z odległego pliku (AGENTS: „samodzielnie
  zielony = cały pakiet”).
- Planów „The Edge” (13 → 15 po T2) i „Kaldheim” (5 → 7 po T4/T6) dotykają
  progi awansu planu 15+/podziału talii ≥30 w generatorze — sprawdzić
  `decks/README.md` i liczby w `test/repo-decks.test.js` po KAŻDEJ transzy.
- Chocobo Kick i Fiery Justice dotykają `cast_spell`, ofert, kreatora stołu i
  bota naraz — L48 (oferta = walidacja = wycena), L21 (łańcuch deskryptora),
  pin „spoza listy nadal zakryte” NIE dotyczy (brak ukrytych informacji).
- Fiery Justice: ruling o przeciwniku jako celu obrażeń i życia — gain 5
  następuje przed SBA (kolejność efektów: obrażenia, potem życie, SBA po
  całości).
- Żywy Tester czyta `dist/`: build przed biegiem; nie uruchamiać `npm test`
  z tymczasową talią w `decks/`.
- Bash bez egressu: dane tylko przez `fetch_page`; nowy numer CR dopisać do
  `test/helpers/cr-numery-tabela.js`.
