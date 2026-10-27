# Plan: batch 70 — kolekcja 426–624 (10 kart)

Data: 2026-10-27. Gałąź: `arena/3e188a7c-mtg`, PR #176 (osobne, samodzielnie
zielone commity w tym samym PR — ADR 0020).

Numer batcha 70 jest kolejny po 69 (kolekcja 412–425). Lista pochodzi od
właściciela (2026-10-27), pole `Plan` jest **wiążące** i przepisywane 1:1.

## Zakres i zasady (wiążące)

- Lista kart wyłącznie od właściciela (ADR 0029); zero kart z inwencji agenta.
- Każda karta `supported` = **100% Oracle** (ADR 0022). Karta, której pełnego
  Oracle nie da się dziś zaimplementować, dostaje `unsupported` — nie wchodzi
  do talii (decyzja o takim statusie jest zgłaszana właścicielowi, bo w
  katalogu nie ma dziś ANI JEDNEJ karty `unsupported`).
- `support.limitations` puste; opis zachowania wyłącznie w `notes`.
- `artId` ze słownika `tools/collection-art-ids.csv`; talie wyłącznie przez
  `node tools/generate-plan-decks.mjs` (nie edytujemy `decks/*.txt` ręcznie).
- Dane: snapshoty Scryfall `docs/cards/scryfall-<slug>.json` pobrane `set=`-em
  z kodu artId (ADR 0010 §2a) + `rulings` (ADR 0028).

## Lista (kolekcja → karta → plan)

| artId | Karta | Set | Plan (wiążący) |
|---|---|---|---|
| 426DSK | Paranormal Analyst | DSK | Duskmourn |
| 427APC | Jilt | APC | Dominaria |
| 429MRD | Vault of Whispers | MRD | Mirrodin |
| 618MH2 | Kaleidoscorch | MH2 | Arcavios |
| 619LCI | Orazca Puzzle-Door | LCI | Ixalan |
| 620AER | Fen Hauler | AER | Kamigawa |
| 621VOW | Moldgraf Millipede | VOW | Innistrad |
| 622VOW | Magma Pummeler | VOW | Kaldheim |
| 623SOM | Trigon of Rage | SOM | Mirrodin |
| 624WAR | Arlinn's Wolf | WAR | Ravnica |

ArtId 428ISD (Curiosity) jest już w katalogu i nie należy do tej partii.
Żaden z 10 artId nie występował w słowniku — wszystkie wiersze są nowe.

## Inwentarz mechanik (stan kodu zmierzony 2026-10-27, `cf4d9ef`)

| Karta | Mechaniki z Oracle | Stan w silniku |
|---|---|---|
| Paranormal Analyst | „Whenever you manifest dread, put a card you put into your graveyard this way into your hand" | `manifest_dread` **istnieje** (effects.js, `resolve_manifest_dread`); **brak** triggera na to zdarzenie i przekazania karty z grobu → **nowe** (trigger + kontekst) |
| Jilt | Kicker `{1}{R}`; bounce; kicked → 2 obrażenia na **inny** cel | kicker i bounce **istnieją**; **brak** celu warunkowego („jeśli kicked") i relacji „another" → **nowe** |
| Vault of Whispers | Artifact Land, `{T}: Add {B}` | landy z abilities **istnieją** (np. Holdout Settlement); do sprawdzenia generator talii dla artefakt-landu |
| Kaleidoscorch | Converge (X = liczba **kolorów** many wydanej), Flashback `{4}{R}` | `manaColorsSpent` zapisywane przy rzucie (resources.js) i `cast_flashback` **istnieją**; **brak** deskryptora Converge → **nowe (cienkie)** |
| Orazca Puzzle-Door | `{1}, {T}, Sacrifice:`, look top 2 → jedna do ręki, druga do grobu | efekt `look_top_put_one_hand_rest_grave` **istnieje** (podpiąć) |
| Fen Hauler | Improvise; „can't be blocked by artifact creatures" | **brak** improvise (convoke jest, ale to inna płatność) i **brak** ewazji po typie blokera → **nowe (dwa)** |
| Moldgraf Millipede | ETB: mill 3, potem licznik +1/+1 za **każdą** kartę stwora w grobu (także sprzed milla — ruling 2021-11-19) | mill **istnieje**; **brak** `amountFrom` liczącego karty stworów w grobu → **nowe (cienkie)** |
| Magma Pummeler | Wchodzi z X licznikami; **efekt zastępczy**: obrażenia → prewencja + zdejmij tyle liczników; „when counters are removed this way" → tyle obrażeń na dowolny cel | `amountFrom: 'X'` **istnieje**; **brak** prewencji zdejmującej liczniki P/T i **brak** triggera odruchowego z celem → **nowe (najcięższe)** |
| Trigon of Rage | trzy charge counters; `{R}{R}, {T}`: dołóż; `{2}, {T}, remove`: +3/+0 do EOT | wzorzec Trigon of Thought/Corruption **istnieje** (reuse) |
| Arlinn's Wolf | „can't be blocked by creatures with power 2 or less" | `cantBeBlockedMaxPower` **istnieje tylko dla equipment** (identity.js/combat.js) → rozszerzyć na statykę stwora |

Nowe mechaniki generyczne (ADR 0002, bez nazw kart): trigger „you manifest
dread" z kontekstem karty z grobu, cel warunkowy od kickera + relacja
„another", Improvise, ewazja „bloker ma typ X", ewazja po mocy blokera dla
statyki stwora, `amountFrom` karty danego typu w grobu, prewencja obrażeń
zdejmująca liczniki + trigger odruchowy, Converge (X z kolorów wydanej many).

## Kolejność wdrożenia (każdy krok = zielony commit + push)

1. **E0 (ten commit)** — plan. Wiersze `tools/collection-art-ids.csv` NIE
   wchodzą tutaj: artId bez definicji katalogowej czerwieni strażników
   (`test/art-ids-tool.test.js`, `catalog-coverage`, `proweniencja` — zmierzone
   2026-10-27 na 8880/8885), więc idą razem z definicjami w E3.
2. **E1** — snapshoty Scryfall (`set=`) + `rulings` (pobrane 2026-10-27); do E3
   nazwy plików są jawymi sierotami na trzech allowlistach strażników.
3. **E2 — mechaniki od najtańszej do najdroższej**, każda z pinem RED→GREEN
   na karcie SYNTERETYCZNEJ w pliku testu (ADR 0029), potem definicja karty:
   a. statyka „can't be blocked by creatures with power ≤ N" (Arlinn's Wolf);
   b. ewazja „can't be blocked by artifact creatures" (Fen Hauler);
   c. Converge (Kaleidoscorch) + Flashback;
   d. `amountFrom: 'creature_cards_in_your_graveyard'` (Moldgraf Millipede);
   e. trigger „whenever you manifest dread" + zwrot konkretnej karty z grobu
      (Paranormal Analyst);
   f. cel warunkowy od kickera + „another target" (Jilt);
   g. Improvise (Fen Hauler) — płatność jak convoke (pętla PMSSB-72 jako wzorzec);
   h. Magma Pummeler — prewencja zdejmująca liczniki + trigger odruchowy
      „any target" (dowiezione w TRZECH miejscach zadawania obrażeń: walka ×2,
      efekt obrażeń), z LKI źródła po śmierci (ruling 2021-11-19).
4. **E3** — definicje 10 kart + `mana-costs-data.js` + `artId` + generator talii.
5. **E4** — `test/real-cards-batch70.test.js`: sanity danych + scenariusz
   legalny i nielegalny dla każdej karty + weryfikacja, że każda nowa
   mechanika realnie pojawia się w `legalCommands` (lekcja batcha 69: convoke
   bez oferty rzutu wyszło dopiero w pętli PMSSB-72).
6. **E5** — „4 dowiązania" nowych deskryptorów/zdarzeń: `EVENT_TYPES` +
   `describeGameEventRaw`, etykieta PL (`render.js`), wycena bota albo
   `REVIEWED_UNVALUED`, `gameObjectDataOf` **i** `installDeck`.
7. **E6** — wycena bota nowych efektów (decyzje: cel „another", Improvise,
   Magma Pummeler) + pomiar quick.
8. **E7** — bramy: `npm test`, `npm run test:slow`, `npm run build`,
   benchmark quick; golden-master tylko przy świadomej zmianie talii.
9. **E8** — `PROJECT_HISTORY.md`, `ENGINE_MILESTONES.md` (przy okazji
   uzupełnić brakujący wpis batcha 69), handoff.

## Ryzyka i pułapki

- **Magma Pummeler** to jedyne miejsce, gdzie „100% Oracle" może kosztować
  więcej, niż wygląda: efekt zastępczy musi zadziałać w KAŻDEJ ścieżce
  obrażeń, a trigger odruchowy ma cel „any target" wybierany już po zdarzeniu
  (i działa, gdy stwór zginął — LKI). Jeśli implementacja okaże się
  niepełna, karta idzie jako `unsupported` **po decyzji właściciela**.
- **Improvise** i **Converge** dotykają płatności/rzutu — tam każda zmiana
  musi przejść `test/bot-scoring-snapshot.test.js` albo świadomie
  regenerować fixture (ADR 0024).
- **Vault of Whispers** to artefakt-land: generator talii liczy landy po
  typie, więc sprawdzić, czy nie zmienia proporcji w talii Mirrodin
  (`git diff decks/` musi pokazać tylko nowe karty).
- **Trigger „you manifest dread"** wymaga kontekstu karty zesłanej do grobu
  TĄ decyzją; bez niego Paranormal Analyst zwracałby dowolną kartę z grobu.
- Zasada L61: każdy pin musi mieć mutację RED; „pass z innego powodu" nie
  jest dowodem.

## Kryteria akceptacji

- 10 kart: definicja, snapshot z `rulings`, `artId`, plan 1:1, `limitations: []`.
- Talie wyłącznie z generatora; `pip`-y zdolności mają źródło w talii (D/5).
- Każda nowa mechanika: pin RED→GREEN + mutacja, bez warunków po nazwie karty.
- Bramy E7 zielone; brak zmian zachowania istniejących kart poza zamierzonymi.
