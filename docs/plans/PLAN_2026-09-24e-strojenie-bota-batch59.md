# Plan sesji 2026-09-24e — taktyczna wycena kart batcha 59 (Strojenie Bota)

**Gałąź:** `arena/01a0d408-mtg` · **PR:** #136 (ten sam PR sesji, opis kumulatywnie)
**Baza:** `1f42a3f` (sesja 24d zamknięta: bramy `npm test` 6519/6519, `test:all`
6529/6529, build 60/4241,6 kB) — **UWAGA:** przed pomiarem trzeba przebudować
`dist/` (reset środowiska wyczyścił katalog) i odtworzyć `tools/table-tester/
node_modules` (`npm i`).

**Zlecenie właściciela (2026-09-24, po raporcie z Żywego Testera):**

> „Nie chodzi o sprzeczność z CR — tego pilnuje engine. Chodzi o OPTYMALNE
> TAKTYCZNIE wykorzystanie tych czarów, czyli takie strojenie scoringu, żeby nie
> korzystał z tych czarów wtedy gdy ma to mały sens i korzystał wtedy gdy ma
> największy uzysk taktyczny. Nie chodzi o automatyczne strojenie wag tylko
> o PRZEMYŚLANE ustawienie ich. Weź przykład z innych podobnych kart o podobnych
> efektach."

Zakres = **trzy karty z raportu 24d**, dla których pomiar pokazał złą decyzję
(pozostałe zachowania batcha 59 wypadły poprawnie: Boulder Salvo wybierał tańszy
surge 95 vs 92, Savage Hunger/cycling, Kumano's Blessing, Join the Dance,
daybound — bez zmian).

## Pomiar PRZED (deterministyczny, ADR 0005)

Narzędzie: skrypt pomiarowy na silniku (`runSimulation` + `setupCardMatch`,
talia audytowa `decks/audyt-batch59.txt` jako talia bota vs `ravnica`), 6 seedów
(59, 61–65), zapis decyzji z pełnymi punktami wariantów. Dodatkowo 4 partie
Żywym Testerem (`--quiet`, 700 kroków) i `tools/bot-tie-audit.mjs` jako pomiar
klasy.

| # | karta / decyzja | zmierzony stan PRZED | problem |
| --- | --- | --- | --- |
| P1 | `token_mutagen` — `add_counter` +1/+1 na CEL | **remis punktowy wszystkich gospodarzy**: `14 activate_ability(token→permanent-21) \| 14 →permanent-27 \| 14 →token-41 \| 14 →token-42`; 6/6 aktywacji w `main1`, m.in. na tokenach 1/1 | brak różnicowania gospodarza — wybór pada w kolejności `legalCommands` (L50-owa „decyzja bez treści"), licznik marnowany na najsłabsze ciało |
| P2 | `memory-s-journey` — `shuffle_graveyard_cards_into_library` na WŁASNY grób | 11/11 decyzji rzutu przy bibliotece **20–31 kart** (bez presji), w tym rzuty z `targets: [p1, null, null, null]` = **czysta zmiana kolejności biblioteki** (0 kart wraca) i powtórki z flashbacku | czar wydawany bez zysku taktycznego; instant trzymany w ręce nic nie kosztuje |
| P3 | `charismatic-vanguard` — `buff_creatures_you_control` z AKTYWOWANEJ zdolności | **`2 activate_ability(permanent-51#0)`** — ta sama wartość co „nic", w `main1`, wielokrotnie w tej samej turze (seed 59: 6 aktywacji po {4}{W}) | brak jakiejkolwiek wyceny w ścieżce zdolności → bot przepala 5 many na rzut, który przeciwnik widzi przed deklaracją bloków (teza M206/M218) |

**Wniosek metodyczny:** to nie „magiczne liczby do podkręcenia", a BRAK REGUŁ
w trzech ścieżkach wyceny. Każda reguła ma precedens w kartach o tym samym
efekcie (L28 — wspólny mianownik): aura-buff (`auraBuffWorthWeight`),
pump/okna walki (M206/M218), leczenie-deck-outu (`drawDeckingPenalty`),
„zdolność przepalana w nieskończoność" (M173/D, M376).

## Etapy

- [ ] **A0** — ten plan (commit przed kodowaniem, ADR 0020) + `npm run build`
      i `npm i` w testerze (odtworzenie środowiska po resecie).
- [ ] **A1** — **rodzina `counter*`** (licznik na wskazanym celu): gospodarz
      wybierany po WARTOŚCI BOJOWEJ (moc ×2 + wytrzymałość, wzorzec aury),
      premia gdy zmienia wynik toczonej walki, premia „może atakować teraz",
      kara gdy gospodarz i tak ginie w tej turze (M236/2
      `permanentDoomedThisTurn`). Rodzina dopięta w `tune-card.mjs` pod nowym
      deskryptorem `counter`.
- [ ] **A2** — **rodzina `graveyardShuffle*`** (wtasowanie kart z grobu do
      biblioteki): wartość tylko przy PRESJI DECK-OUTU (biblioteka ≤ próg),
      zero-kartowe wtasowanie = poniżej passu (M146 — remis 0:0 idzie w rzut),
      cel-przeciwnik nadal −60. Rodzina pod deskryptorem `graveyardShuffle`.
- [ ] **A3** — **rodzina `teamPump*`** (masowy pump z AKTYWOWANEJ zdolności):
      okno decyzyjne — po deklaracji atakujących własnej walki albo w obronie
      (M206/M218), lethal-przed-atakiem jako wyjątek, poza oknem kara
      przebijająca wartość (L3). Rodzina pod deskryptorem `teamPump`.
- [ ] **A4** — dowody i domknięcie: pomiar PO (te same seedy + tester),
      próbka szybka benchmarku (`node tools/benchmark.mjs`, ADR 0018 pkt 2),
      `tools/b1-final-2026-09-24e.{json,txt}` jako bieżący stan bota, M429
      w dziennikach, lekcja **L169**, handoff 24e, opis PR kumulatywnie,
      sprzątanie (usunięcie `decks/audyt-batch59.txt`, rebuild `dist/`).

## Bramy i ryzyka

- Bramy po KAŻDYM etapie: `npm test` + `npm run build` (inkrementalne commity),
  na koniec `npm run test:all`.
- **Golden-master** (`bot-scoring-snapshot`) obejmuje pary bez kart batcha —
  jeśli zmiany nie ruszą tych partii, fixture zostaje (mocniejszy dowód, że
  zmiana jest ZAWĘŻONA do nowych reguł); jeśli ruszy — regeneracja świadoma
  (`--write`) z uzasadnieniem.
- **Progi regresji** (`test/bot-benchmark.test.js`, reguła „zmierzone −15 p.p.,
  tylko w górę"): po zmianach uruchomić próbkę; progi podnosi się wyłącznie po
  pełnym przebiegu B0 (ADR 0018 pkt 3) — bez pełnego przebiegu zostaje zapis
  próbki szybkiej.
- **ADR 0002**: nowe reguły czytają wyłącznie deskryptory i `PlayerView`
  (moc/wytrzymałość, `kind`, fazy/kroki, `combat`, liczba kart w bibliotece) —
  zero nazw kart, zero ID w warunkach.
- Każda nowa reguła: test RED→GREEN z dowodem, że cofnięcie wpięcia czerwieni
  (L61) + pin „pokrętło nie jest atrapą" (wzorzec `bot-params.test.js`).
- Tymczasowa talia `decks/audyt-batch59.txt` **nie wchodzi do żadnego commita**
  (łamie 4 strażniki talii) — po pomiarze PO usunąć i przebudować `dist/`.
