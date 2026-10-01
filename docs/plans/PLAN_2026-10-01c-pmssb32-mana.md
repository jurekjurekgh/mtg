# PLAN 2026-10-01c — PMSSB-32: produkcja many (`add_mana`)

Pętla z **procedury `docs/PMSSB.md`** (krok 0). Zlecenie właściciela: wybrać
JEDNĄ rodzinę i przeprowadzić audyt przyczynowo-skutkowy scoringu bota — kiedy
efekt jest taktycznie najsilniejszy, w jakich fazach i turach, na czym polega
zysk, a kiedy jest on zerowy albo ujemny — i tak ustawić wycenę, by premiowała
momenty sensowne, a karała bezsensowne. Bez strojenia maszynowego (ADR 0018).

## 1. Wybór rodziny (inwentarz katalogu × rejestr PMSSB)

Inwentarz typów efektów katalogu (`createCardRegistry().all()`, 136 typów,
skrypt `/tmp/pmssb-inventory.mjs`) skonfrontowany z rejestrem `docs/PMSSB.md`.
Największa rodzina **spoza rejestru**: **`add_mana` — 25 kart / 28 wystąpień**
(dalej `transform` 7, `animate_permanent_until_end_of_turn` 5,
`return_permanent_from_graveyard` 3). Rodziny większe od `add_mana` są już
DONE (`create_token` 28, `draw_cards` 26, `add_counter` 26, `gain_life` 20,
`pump` 19) albo POKRYTE (`grant_keywords_until_end_of_turn` w „pump/grant",
`tap_permanent`/`untap_permanent` w „tap/untap M139").

Rodzina `add_mana` nie była nigdy audytowana pętlą — jej wycena narosła
z **ośmiu łatek z gier** (M128 „tapowanie na zapas", M155 rider życia
Pristine Talisman, M119/Z5 + M150/C1 filtr Jeskai Devotee, B54/s4008 podwójne
liczenie lądu, F 2026-09-19b „Skarb zużyty, nic się nie stało", M243/C bank
many z tokenów, E6/A1 timing kandydatów, M167/D early-return). To klasyczny
materiał na konsolidację po L41 (jedna miara) + audyt brakujących wymiarów.

## 2. Inwentarz okien (co bot realnie decyduje)

Klasyfikacja 28 wystąpień (`/tmp/pmssb32-klasyfikacja.mjs`); **landy** (16 kart)
silnik auto-tapuje przy płatności (`producibleMana`), więc ręczna aktywacja
liczy się tylko w nietypowych stanach (kreator koloru, brak legalnego czaru) —
decyzyjne są pozostałe:

| Klasa kosztu | Wystąpień | Nosiciele nie-lądowi |
|---|---|---|
| `{T}` | 20 (16 lądów) | Scorned Villager (1/G), Moonscarred Werewolf (2/G), Seer's Lantern (1/C), Pristine Talisman (1/C + 1 życie), Powerstone (1/C, `spendOnly:artifact`) |
| `{mana}+{T}` | 3 | Apprentice Wizard ({U},{T} → 3/C), Mana Cylix ({1},{T} → 1/WUBRG), Heap Gate ({1},{T} → 1/WUBRG) |
| `{T}+tapCreature` | 2 | Holdout Settlement (ląd), Dragonbroods' Relic |
| `sacrificeSelf` | 2 | Treasure (1/WUBRG, `fromTreasure`), Eldrazi Scion (1/C) |
| bez tapu, raz na turę | 1 | Jeskai Devotee ({1} → 1/URW) |

Wymiary decyzji do audytu (macierz):

1. **Cel/przeznaczenie many**: czy istnieje karta w ręce, którą ta mana
   *realnie* odblokowuje (próg LICZBOWY) i czy **kolory** się zgadzają
   (pipy — dziś bot porównuje tylko liczby; pula widoku ma `manaPool`
   i `manaSource` per obiekt, a `coloredPipsOf` daje wymagania).
2. **Restrykcja druku** (`spendOnly:artifact` — Powerstone; pula widoku ma
   `restrictedPool`): mana, której nie wolno wydać na odblokowaną kartę, nie
   odblokowuje niczego.
3. **Koszt realny źródła**: {T} samego artefaktu (mało szkodzi), {T} STWORA
   (traci atak w main1 / blok w turze przeciwnika), `tapCreature` (traci atak
   DRUGIEGO stwora), `sacrificeSelf` (jednorazówka + wartość ciała),
   „Bank many" (Treasure = opcja na przyszłą turę).
4. **Timing**: main1 vs main2 (przed/po deklaracji atakujących), tura
   przeciwnika (tylko instanty — E6/A1), własny untap/upkeep/draw/end/cleanup
   (`wastefulStep`, CR 500.4).
5. **Stan gry**: nic do zagrania, jest co zagrać ale i tak stać (mana
   redundantna), jest co zagrać i nie stać (odblokowanie realne), brak blokera
   (bot tapuje obrońcę w cudzej turze).
6. **Koszt okazji**: ta sama zdolność ma drugi tryb (Seer's Lantern → scry 1,
   Balamb Garden → transform, Immersturm Skullcairn → 3 dmg + discard,
   Sequestered Stash → mill 5 + artifact), więc tap w tym oknie zamyka tamten.

## 3. Pomiar PRZED

Sonda `/home/user/scratch/pmssb32-mana-przed.mjs` (scenariusze → tabela
wynik/wybór). Realne karty katalogu; drugi gracz jako właściciel pola bitwy
tam, gdzie trzeba (tura przeciwnika). Każdy scenariusz wypisuje także `pass`
jako kotwicę „0" i wybór bota.

## 4. Findingi i fale

Wypełniane po pomiarze (§5-6 raportu w `docs/PMSSB.md`).

## 5. Bramy i higiena

- Piny: `test/audyt-pmssb32-mana.test.js` (RED→GREEN + mutacje).
- `npm test`, `npm run build`, `npm run test:all`; `bot-scoring-snapshot`
  (cel: bez regeneracji), tie-audit, mirror-eval, Żywy Tester PO.
- Sondy poza repo (`/home/user/scratch`, `/tmp`) — repo zostaje czyste.
