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

Pomiar PRZED (25 scenariuszy) dał findingi F1–F6 → trzy fale. Pełny opis
w `docs/PMSSB.md` §PMSSB-32; skrót:

| # | Finding (PRZED) | Fala |
|---|---|---|
| F1 | Apprentice Wizard + 3 lądy + karta z `{W}`: aktywacja **+10 = WYBÓR** (próg liczbowy nie zna kolorów) | A |
| F2 | Powerstone (`spendOnly: artifact`) „odblokowywał" stwora; pula ograniczona drukiem liczona jako „już stać" | A |
| F3 | filtr koloru nie odblokowywał niczego, choć po aktywacji czar staje się płatny (−10 → powinno być dodatnie) | A + C |
| F4 | tap ciała bez ceny bojowej: main1 == main2 (6,0 = 6,0), `tapCreature` 0/1 == 4/4 (3 = 3) | B |
| F5 | reguła E6/A1 (instant) MARTWA w produkcji — wpis ręki bez `types` | A |
| F6 | bramka „chcę to rzucić" pytała komendę BEZ celu (Shock bez celu = −10) | A3 |

Fale: **A** — model jednostek many (kolory, `{C}`, `spendOnly`, pula ograniczona,
podwójne liczenie lądu) + `types` w widoku ręki + wycena celu; **B** — cena
tapnięcia CIAŁA (`manaTapBodyPerStat: 2`, `manaTapBodyMax: 8`: main1 = moc,
cudza tura = wytrzymałość, main2/po blokach/choroba/czujność/obrońca = 0);
**C** — bramka „silnik już oferuje rzut ⇒ aktywacja zbędna" (`castOfferedNow`).

## 5. Bramy i higiena

- Piny: `test/audyt-pmssb32-mana.test.js` (RED→GREEN + mutacje).
- `npm test`, `npm run build`, `npm run test:all`; `bot-scoring-snapshot`
  (cel: bez regeneracji), tie-audit, mirror-eval, Żywy Tester PO.
- Sondy poza repo (`/home/user/scratch`, `/tmp`) — repo zostaje czyste.

## 6. Wynik (pomiar PO)

- Piny `test/audyt-pmssb32-mana.test.js`: **19/19 GREEN**; 7 mutacji czerwieni
  właściwe piny (M3 — 9 pinów, M2 — 6).
- Bramy: `npm test` **7270/7270**, `npm run test:all` **7541/7541**, build
  **70 / 4697,0 kB**; golden-master zregenerowany (świadomy dryf wycen, te same
  decyzje: hashe „bez zmian").
- tie-audit PO: 27,0% remisów / 9,7% realnych (było 28,3% / 10,8%).
- mirror-eval (wymiar ciała ON vs OFF): 24:24 (0,5000) na 48 meczach — brak
  sygnału w lustrze; dowodem piny + mutacje.
- Żywy Tester PO: 6 partii (bot `innistrad-brg` ×3, `srodziemie`, `wiedzmin-wur`,
  `tarkir-wur`) — 6× „DETEKTORY: brak zgłoszeń", 6× „NIEWYCENIONE: brak";
  w transkryptach widać rodzinę w akcji (Werewolf: 3× mana, Lantern: 1× mana
  vs 5× scry).
- Kolejka: remisy wyboru celu/ataku z tie-audytu (PMSSB-33), `tap_for_mana`
  poza decyzjami silnika, koszt okazji drugiego trybu źródła.
