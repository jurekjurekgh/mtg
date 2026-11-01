# Plan: batch 71 — kolekcja 625–634 (10 kart)

Data: 2026-10-30. Gałąź: `arena/d5e963c4-mtg`, PR #177 (osobne, samodzielnie
zielone commity w tym samym PR — ADR 0020).

Numer batcha 71 jest kolejny po 70 (kolekcja 618–624). Lista pochodzi od
właściciela (2026-10-30), pole `Plan` jest **wiążące** i przepisywane 1:1
(również wtedy, gdy nie pasuje do setu karty — np. „Warhammer Fantasy" przy
karcie z Exodus).

## Zakres i zasady (wiążące)

- Lista kart wyłącznie od właściciela (ADR 0029); zero kart z inwencji agenta.
  W szczególności **Sphinx Sovereign nie wchodzi do katalogu** — karta
  Sphinx's Herald działa wg Oracle (search po nazwie legalnie „fails to
  find"), dokładnie jak istniejący bliźniak Angel's Herald.
- Każda karta `supported` = **100% Oracle** (ADR 0022); `support.limitations`
  puste, opis zachowania wyłącznie w `notes`.
- `artId` ze słownika `tools/collection-art-ids.csv`; talie wyłącznie przez
  `node tools/generate-plan-decks.mjs` (nie edytujemy `decks/*.txt` ręcznie).
- Dane: snapshoty Scryfall `docs/cards/scryfall-<slug>.json` pobrane `set=`-em
  (ADR 0010 §2a) + `rulings` (ADR 0028).
- Zero zmian po nazwie karty (ADR 0002): każda nowa mechanika to deskryptor.

## Lista (kolekcja → karta → plan)

| artId | Karta | Set | Plan (wiążący) |
|---|---|---|---|
| 625EXO | Vampire Hounds | EXO | Warhammer Fantasy |
| 626ISD | Curse of the Bloody Tome | ISD | Marvel |
| 627LCI | Rumbling Rockslide | LCI | Thunder Junction |
| 628JMP | Ambassador Oak | JMP | Śródziemie |
| 629DTK | Tail Slash | DTK | Tarkir |
| 630LRW | Changeling Berserker | LRW | Kaldheim |
| 631ALA | Sphinx's Herald | ALA | Alara |
| 632DTK | Anticipate | DTK | Star Wars |
| 633M10 | Trumpet Blast | M10 | Dominaria |
| 634DSK | Violent Urge | DSK | Teenage Mutant Ninja Turtles |

Żaden z 10 artId nie występował w słowniku — wszystkie wiersze są nowe.

## Inwentarz mechanik (stan kodu zmierzony 2026-10-30, `a55693c`)

| Karta | Oracle (skrót) | Stan w silniku |
|---|---|---|
| Vampire Hounds | „Discard a **creature** card: This creature gets +2/+2 until end of turn." | koszt `discardCard` **istnieje**, ale BEZ kwalifikatora typu (bierze dowolną kartę) → **nowe (cienkie): koszt z kwalifikatorem** |
| Curse of the Bloody Tome | Aura Curse, enchant player; upkeep zaczarowanego: mill 2 | `enchant: 'player'` + `trigger.condition.enchantedPlayerUpkeep` **istnieją** (Curse of the Pierced Heart); brak efektu „mill zaczarowanego gracza" → **nowe (cienkie)** |
| Rumbling Rockslide | damage do stworu = liczba twoich lądów | `damage` **istnieje**; brak źródła kwoty „lands you control" → **nowe (cienkie)** |
| Ambassador Oak | ETB: token 1/1 zielony Elf Warrior | **istnieje** (wzorzec `create_token`) |
| Tail Slash | twój stwór zadaje obrażenia = moc stworowi przeciwnika | **istnieje** (`damage_from_target_power` + cele `creature_you_control`/`creature_opponent_controls`, wzorzec Diplomatic Relations) |
| Changeling Berserker | Changeling + Haste + **Champion a creature** | changeling/haste **istnieją**; champion **brak** → **nowe (najcięższe)** |
| Sphinx's Herald | {2}{U},{T}, poświęć białego+niebieskiego+czarnego stwora: tutor po nazwie na pole bitwy | **istnieje w całości** (`sacrificeCreaturesByColors` + `search_library_to_battlefield` z `qualifier.name`, bliźniak Angel's Herald) |
| Anticipate | look top 3 → jedna do ręki, reszta na spód | **istnieje** (`look_top_put_one_hand_rest_bottom`) |
| Trumpet Blast | attacking creatures +2/+0 do EOT | **istnieje** (`buff_attacking_creatures`) |
| Violent Urge | +1/+0 i first strike; **Delirium** → też double strike | `pump` + `grant_keywords_until_end_of_turn` **istnieją**, bramka delirium istnieje dla zdolności/statyk/triggerów, ale **nie dla pojedynczego efektu czaru** → **nowe (cienkie)** |

Nowe mechaniki generyczne (ADR 0002): (a) koszt „odrzuć kartę o kwalifikatorze",
(b) efekt „mill zaczarowanego gracza", (c) źródło kwoty `lands_you_control`,
(d) champion (ogólna reguła CR 702.72a), (e) warunek delirium na poziomie
efektu.

## Kolejność wdrożenia (każdy krok = zielony commit + push)

1. **B0** — plan (ten plik).
2. **B1** — snapshoty Scryfall (`set=`) + `rulings`; do B3 nazwy plików są
   jawnymi sierotami na allowlistach strażników, więc idą razem z definicjami?
   **Nie** — kolejność jak w batchu 70: snapshoty wchodzą osobno (strażnicy
   allowlisty ich nie dotyczą, bo plik `docs/cards/` jest źródłem, nie
   katalogiem), definicje w B3.
3. **B2 — mechaniki od najtańszej do najdroższej**, każda z pinem RED→GREEN
   na karcie SYNTERETYCZNEJ w pliku testu (ADR 0029), potem definicja karty:
   a. źródło kwoty `amountFrom: 'lands_you_control'` (Rumbling Rockslide);
   b. koszt `discardCard` z kwalifikatorem (Vampire Hounds);
   c. warunek `condition.delirium` na efekcie czaru (Violent Urge);
   d. `mill_enchanted_player` (Curse of the Bloody Tome);
   e. champion (Changeling Berserker) — CR 702.72a, wzorzec: „sacrifice
      unless exile another creature you control" + powrót wygnanej karty.
4. **B3** — definicje 10 kart + `mana-costs-data.js` + `artId` + generator talii.
5. **B4** — `test/real-cards-batch71.test.js`: sanity danych + scenariusz
   legalny i nielegalny dla każdej karty + weryfikacja, że każda nowa
   mechanika realnie pojawia się w `legalCommands`.
6. **B5** — „4 dowiązania" nowych deskryptorów/zdarzeń: `EVENT_TYPES` +
   `describeGameEventRaw`, etykieta PL (`render.js`), wycena bota albo
   `REVIEWED_UNVALUED`, `gameObjectDataOf` **i** `installDeck`.
7. **B6–B10 — pętle PMSSB** dla każdej nowej mechaniki (osobne plany/raporty):
   PMSSB-80 (kwota z lądów w obrażeniach), PMSSB-81 (koszt „odrzuć kartę
   o kwalifikatorze"), PMSSB-82 (delirium na efekcie — trik bojowy),
   PMSSB-83 (mill zaczarowanego gracza), PMSSB-84 (champion — okno rzutu
   i wybór wygnania). Każda: sonda PRZED → audyt L41/koszt/anty-over-fix →
   pokrętła + `test/audyt-pmssb<N>-*.test.js` RED→GREEN + mutacje.
8. **B11** — bramy: `npm test`, `npm run test:slow`, `npm run build`,
   benchmark quick; golden-master tylko przy świadomej zmianie talii.
9. **B12** — `PROJECT_HISTORY.md`, `ENGINE_MILESTONES.md`, handoff, opis PR
   kumulatywnie.

## Ryzyka i pułapki

- **Champion** to jedyne miejsce, gdzie „100% Oracle" może kosztować więcej,
  niż wygląda: trigger wchodzi na stos (przeciwnik może odpowiedzieć),
  poświęcenie jest WARUNKOWE („unless you exile"), a wygnana karta wraca
  dopiero przy opuszczeniu pola bitwy (także gdy champion umrze). Model musi
  obsłużyć: brak innego stworu → natychmiastowe poświęcenie; odmowę wygnania
  → poświęcenie; powrót karty pod kontrolą WŁAŚCICIELA.
- **Koszt „odrzuć kartę o kwalifikatorze"**: oferta aktywacji musi wymagać
  karty SPEŁNIAJĄCEJ kwalifikator (inaczej komenda nielegalna w trakcie
  płatności), a picker odrzucenia nie może pokazać kart spoza kwalifikatora.
- **Delirium na efekcie**: warunek czytany przy ROZSTRZYGANIU (CR 608.2b),
  nie przy rzucie; bot musi widzieć, czy warunek zachodzi (wycena triku).
- **Rumbling Rockslide** to damage zależny od stanu — oferta celu i wycena
  muszą czytać tę samą liczbę co silnik (L41).
- **Curse of the Bloody Tome**: mill dotyczy gracza zaczarowanego — nie
  mylić z `mill_both_players`; bot musi cenić to odwrotnie niż mill siebie.
- Zasada L61: każdy pin musi mieć mutację RED; „pass z innego powodu" nie
  jest dowodem.

## Kryteria akceptacji

- 10 kart: definicja, snapshot z `rulings`, `artId`, plan 1:1, `limitations: []`.
- Talie wyłącznie z generatora; pip-y zdolności mają źródło w talii (D/5).
- Każda nowa mechanika: pin RED→GREEN + mutacja, bez warunków po nazwie karty.
- PMSSB każdej nowej mechaniki: sonda PRZED, pokrętła, raport w `docs/PMSSB.md`.
- Bramy zielone; brak zmian zachowania istniejących kart poza zamierzonymi.
