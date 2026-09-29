# PLAN batch61 — kolekcja 157–174 (10 kart), 2026-09-29

Zlecenie: lista właściciela (10 kart). Gałąź `arena/01a0ec8c-mtg` (PR #145).
Procedura: `docs/cards/HOW_TO_ADD_CARD.md` (Kroki 1–9), ADR 0010 §2a, ADR 0014,
ADR 0022 (pełny Oracle — `support.limitations` pusty), ADR 0029 (katalog tylko
z kolekcji), ADR 0030 (CR/rulingi dosłownie przed zmianami reguł), ADR 0002
(zero przypadków specjalnych po nazwie karty w silniku).

## 0. Dane źródłowe (KOMPLET 10/10; `set=` obowiązkowy; jedno pobranie na kartę)

| # | Karta | Set | Nr | Rar | Koszt | Oracle (skrót) | Plan (wiążący) |
|---|-------|-----|----|-----|-------|----------------|----------------|
| 157 | Infectious Bloodlust | ORI | 152 | C | {1}{R} | Aura: +2/+1, haste, „attacks each combat if able"; gdy zaczarowany stwór umiera — „you may search your library for a card named Infectious Bloodlust" | **Kaldheim** |
| 158 | Kozilek's Shrieker | OGW | 73 | C | {2}{B} | 3/2 Eldrazi Drone; Devoid; {C}: +1/+0 i menace do końca tury | **Zendikar** |
| 160 | Fiery Hellhound | M11 | 136 | C | {1}{R}{R} | 2/2 Elemental Dog; {R}: +1/+0 do końca tury | **Dominaria** |
| 161 | Dragonscale Boon | KTK | 131 | C | {3}{G} | Instant: dwa liczniki +1/+1 na celu i odkręć go | **Tarkir** |
| 162 | Griffin Guide | DMR | 8 | U | {2}{W} | Aura: +2/+2 i flying; gdy zaczarowany stwór umiera — token 2/2 biały Griffin z flying | **Eldraine** |
| 164 | Gryffwing Cavalry | VOW | 16 | U | {3}{W} | 2/2 Human Knight; Flying; Training; atak: możesz zapłacić {1}{W} → celujący atakujący bez flying zyskuje flying do końca tury | **Innistrad** |
| 165 | Captivating Gyre | M20 | 51 | U | {4}{U}{U} | Sorcery: zwróć do rąk do trzech celujących stworów | **Amonkhet** |
| 167 | Lost in the Mist | ISD | 63 | C | {3}{U}{U} | Instant: skontruj celujący czar; zwróć celujący permanent do ręki właściciela | **Eldraine** |
| 170 | Riftburst Hellion | MKM | 228 | C | {5}{R}{G} | 6/7 Hellion; Reach; Disguise {4}{R/G}{R/G} | **Ravnica** |
| 174 | Izzet Charm | RTR | 172 | U | {U}{R} | Modalny: kontruj czar nie-stwora, chyba że zapłaci {2}; 2 obrażenia dla celu-stwora; dobierz 2, odrzuć 2 | **Ravnica** |

Uwaga: wszystkie kody setów z arkusza (`157ORI` … `174RTR`) zgadzają się
z drukiem ze Scryfalla — **bez pola `uwaga`** (strażnik druków przechodzi
czysto). `artId` = prefiks z arkusza (Krok 2), bez duplikatów.

### Rulingi (pobrane `fetch_page`, wpisy w snapshotach)

- **Infectious Bloodlust** (1): „If, during its controller's declare attackers
  step, the enchanted creature is tapped or is affected by a spell or ability
  that says it can't attack, then that creature doesn't attack. If there's a
  cost associated with having that creature attack, its controller isn't forced
  to pay that cost." → wymóg ataku (CR 508.1c), nie przymus płacenia kosztów.
- **Kozilek's Shrieker** (2): menace po zablokowaniu nie cofa bloku; wielokrotny
  menace jest redundantny.
- **Fiery Hellhound / Captivating Gyre**: brak rulingów (pobrane, pusta lista).
- **Dragonscale Boon** (1): cel może być już odkręcony (untap to no-op legalny).
- **Griffin Guide** (1): „If Griffin Guide and the enchanted creature go to the
  graveyard at the same time, Griffin Guide's last ability will trigger." →
  trigger aury na śmierć gospodarza musi działać również przy równoczesnej
  śmierci aury (LKI), nie tylko gdy aura przeżyje.
- **Gryffwing Cavalry** (3): (a) cel wybiera się PRZED decyzją o płatności;
  brak legalnego celu = brak okazji do zapłaty; (b) Training triggeruje, gdy
  oba stwory są deklarowane jako atakujące (wzrost siły PO deklaracji nie
  wywołuje triggera); (c) po odpaleniu triggera śmierć/zmniejszenie siły
  drugiego atakującego nie odbiera licznika.
- **Lost in the Mist** (2): celuje czar I permanent (oba wymagane do rzutu);
  jeśli jeden cel stanie się nielegalny — czar działa na drugi (CR 608.2b).
- **Izzet Charm** (1): tryb 3 — dobranie i odrzucenie dzieją się w całości
  podczas rozstrzygania (żadnych akcji między).
- **Riftburst Hellion** (11): disguise = rzut twarzą w dół za {3} jako 2/2
  z ward {2}, bez nazwy, MV 0, bezbarwny; obrót twarzą do góry = akcja
  specjalna za koszt disguise; obrót nie wywołuje ETB.

### CR (ADR 0030 — dosłownie, przed kodowaniem mechanik)

- **Training — CR 702.149a**: „Training is a triggered ability. 'Training'
  means 'Whenever this creature and at least one other creature with power
  greater than this creature's power attack, put a +1/+1 counter on this
  creature.'" (potwierdzone: mtg.wiki/page/Training, CR 2026-06-19 — numer
  **702.149**; w komentarzu kodu zostaje dosłowny cytat + data CR).
- **Disguise — CR 702.168a**: „Disguise is a static ability that functions in
  any zone from which you could play the card it's on, and the disguise effect
  works any time the card is face down. 'Disguise [cost]' means 'You may cast
  this card as a 2/2 face-down creature with ward {2}, no name, no subtypes,
  and no mana cost by paying {3} rather than paying its mana cost.'"
  (potwierdzone: mtg.wiki/page/Disguise + rulingi 2024-02-02).
- **{C} — CR 107.4c**: „The colorless mana symbol {C} is used to represent one
  colorless mana, and also to represent a cost that can be paid only with one
  colorless mana." (potwierdzone: media.wizards.com MagicCompRules 2025-04-04
  + mtg.fandom/wiki/Colorless, CR 2025-11-14).
- **Wymóg ataku — CR 508.1c** (już w kodzie: `mustAttack`, Ramroller).
- **Aura na śmierć gospodarza** — CR 603.6c/603.10a (LKI triggerów) +
  ruling Griffin Guide wyżej.

## 1. Rekonesans silnika (co istnieje, czego brak)

ISTNIEJE (gotowe do użycia):
- pump aktywowany (`{R}: +1/+0`) — wzorzec wielu kart (np. Ghost Warden);
- `add_counter` + `untap_permanent` na jednym celu (Dragonscale Boon);
- `variableTargets: { type, min, max }` + `applyTo: 'allChosen'` (Aerith
  Rescue Mission — „tap up to three target creatures") → Captivating Gyre;
- dwa cele o RÓŻNYCH deskryptorach w jednym czarze + `targetIndices`
  (Vandalize „Destroy both", Grave Exchange) → Lost in the Mist
  (`spell_on_stack` + `permanent`, `counter_spell` + `bounce_permanent`);
- `counter_spell_unless_pays` z `amount` (Frightful Delusion) + deskryptor celu
  `noncreature_spell_on_stack` (spells.js) → Izzet Charm tryb 1;
- modalność `modes` + `resolve_modal_choice` (dziesiątki kart) → Izzet Charm;
- `keywords: ['devoid']` + render PL (`devoid: 'Devoid (bezbarwna)'`);
- `keywords: ['menace']` + `grant_keywords_until_end_of_turn` (pump+grant);
- aura `{ pump, keywords }` (Leafcrown Dryad), `aura.cantAttack`, ward jako
  keyword z kwotą (`wardAmountOf`), zakrycie (`morph` + `cloak` + manifest):
  `faceDownAbilities` daje obrót za koszt morpha, cloak dokłada ward {2};
- `search_library_to_hand` z `qualifier.name` (Angel's Herald) — ale po
  KONKRETNEJ nazwie;
- `payMana`/`payColors` na triggerze + `pendingOptionalPay` (Zoraline,
  Descendant of Storms);
- `attacks` + `conditionHolds` (warunki triggerów czytają `eventData`).

BRAKUJE (nowa praca silnikowa — 8 pozycji, kolejność = fale):
1. **`draw_then_discard` z liczbą > 1** (Izzet Charm tryb 3): efekt ma
   zaszyte `count: 1` przy odrzucaniu (draw_then_discard w effects.js);
   generalizacja: odrzucenie = `effect.discardCount ?? effect.amount ?? 1`
   (jedno miejsce prawdy, L41).
2. **Aura nadająca `mustAttack`** (Infectious Bloodlust): deskryptor aury
   (`aura.mustAttack`) + odczyt w combat.js tam, gdzie czytany jest
   `aura.cantAttack` (jedno miejsce; CR 508.1c + ruling ORI).
3. **Trigger aury na śmierć gospodarza** (Infectious Bloodlust + Griffin
   Guide): nowe zdarzenie triggera (nazwa robocza `enchanted_creature_dies`),
   odpalane przy śmierci stworu na aurach `attachedTo === <zmarły>` — z LKI,
   więc także gdy aura umiera równocześnie (ruling DMR 2022-12-08); + EVENT_TYPES,
   opis PL, wycena/reviewed-unvalued, materiał (L84).
4. **Nowy token Griffin** (2/2 biały flying) — `token_griffin` w katalogu
   (wyjątek ADR 0029: tokeny nie są kolekcją).
5. **Qualifier szukania „karta o tej samej nazwie co źródło"** (Infectious
   Bloodlust): generyczne kryterium (Oracle: „a card named <nazwa tej karty>"),
   rozwiązywane przy kolejkowaniu z nazwy źródła (`sameNameAsSource: true`),
   bez literału nazwy w silniku (ADR 0002).
6. **`{C}` w koszcie zdolności + bezbarwna mana** (Kozilek's Shrieker):
   (a) wymaganie „tylko bezbarwna jednostka" w `matchColorRequirements`
   (oznaczenie `'C'`); (b) produkcja bezbarwna (`add_mana` z jawnym
   `colors: []`); (c) korekta tokenu Eldrazi Scion („Add {C}") — obecnie
   produkuje manę dowolnego koloru (uproszczenie ery przed-{C}); (d) koszt
   zdolności `{ mana: 1, colors: ['C'] }` (walidacja/oferta/kreator).
7. **Training** (Gryffwing Cavalry; CR 702.149, keyword `training`):
   trigger `attacks` z warunkiem „inny atakujący o większej sile w tej samej
   deklaracji" — `conditionHolds` musi dostać listę atakujących w `eventData`
   (dziś `attacks` woła `tryFire` bez extra) + efekt `add_counter` na sobie.
8. **Disguise** (Riftburst Hellion; CR 702.168): deskryptor karty
   (`morph`-owy kształt: `cost: 3` twarzą w dół + koszt obrotu), przy zakryciu
   dokłada ward {2} (cloak ma to już w swoim tworzeniu — ujednolicić L41),
   obrót twarzą do góry za koszt disguise z **hybrydą {R/G}{R/G}** — koszt
   zdolności obrotu musi wyrazić dwa pipy hybrydowe (nowe pole kosztu, np.
   `hybrid: [['R','G'],['R','G']]`), a walidacja/oferta muszą je rozumieć.

Warunki brzegowe i pułapki:
- **L84**: każdy nowy deskryptor (trigger `enchanted_creature_dies`, keyword
  `training`, `morph.disguise`, `sameNameAsSource`, koszt `{C}`/hybryda,
  token Griffin) musi mieć wszystkie dowiązania: EVENT_TYPES + opis zdarzenia
  (session.js), etykieta PL (render.js / opisy zdolności), wycena bota albo
  `REVIEWED_UNVALUED` (M157), `gameObjectDataOf` **i** `installDeck` (M379).
- **Golden-master**: dotknięcie `add_mana` Bezb. Sciona i kosztu {C} może
  zmienić wyceny partii golden (pary: ravnica|innistrad-wu, dominaria-brg|
  mirrodin-wu, tarkir-bg|warhammer-ubr — Scion jest w taliach? sprawdzić);
  dryf tylko świadomy, udokumentowany (L124), inaczej cofnąć.
- **Zakaz nazw w silniku** (ADR 0002): nowe mechaniki opisane deskryptorami,
  testy na kartach synteretycznych tam, gdzie trzeba (ADR 0029 pkt 3).
- Progi benchmarku (`test/bot-benchmark.test.js`) — zmiany bota nie
  planowane; jeśli wycena nowych deskryptorów wymusi zmianę, B0 tylko na
  wyraźną komendę właściciela (ADR 0018).

## 2. Kolejność implementacji (łatwe → trudne; commit per karta/2 karty)

1. Fiery Hellhound (pump) — snapshot + CSV + definicja + MANA_COSTS + talia.
2. Dragonscale Boon (liczniki + untap).
3. Captivating Gyre (variableTargets max 3).
4. Lost in the Mist (dwa cele różnych typów).
5. Izzet Charm (modal + generalizacja `draw_then_discard`).
6. Griffin Guide (token Griffin + trigger aury na śmierć gospodarza).
7. Infectious Bloodlust (aura `mustAttack` + search po nazwie źródła).
8. Kozilek's Shrieker ({C} + bezbarwna mana + korekta Sciona).
9. Gryffwing Cavalry (Training + grant flying z opcjonalną płatnością).
10. Riftburst Hellion (Disguise + hybrydowy koszt obrotu).
11. Regeneracja talii (`node tools/generate-plan-decks.mjs`) + `repo-decks`.
12. Bramy (`npm test`, `npm run build`, `npm run test:all`), dokumentacja
    (`ENGINE_MILESTONES.md` M435, `PROJECT_HISTORY.md`, rejestr PMSSB jeśli
    dotknięte wyceny, opis PR), handoff.

## 3. Testy (`test/real-cards-batch61.test.js`, wzorzec batch60)

Dla każdej karty: scenariusz legalny + nielegalny (maszynowo rozpoznawalny
błąd walidacji) + sanity danych (Oracle zgodny z definicją, `imageUri`/`artId`).
Dla mechanik silnikowych dodatkowo piny: (a) `draw_then_discard` 2/2 — jedno
odrzucenie nie kończy decyzji; (b) aura mustAttack — deklaracja atakujących
wymusza atak, koszt ataku nie jest wymuszany (ruling); (c) trigger aury na
śmierć gospodarza — także przy równoczesnej śmierci aury (ruling); (d) {C} —
koszt nie do zapłacenia maną kolorową, do zapłacenia bezbarwną; (e) Training —
licznik przy drugim atakującym o większej sile, brak licznika przy mniejszej,
brak przy wzroście siły PO deklaracji (ruling); (f) disguise — 2/2 z ward {2},
obrót za {4}{R/G}{R/G} (hybryda: R,R / R,G / G,G), brak ETB przy obrocie.

## 4. Ryzyka

- **Disguise + hybryda** to najdroższa pozycja (koszt zdolności, oferta,
  kreator płatności, bot) — jeśli budżet padnie, dowieźć 1–9, a Helliona
  dokończyć w następnej sesji (plan zostaje, karta NIE wchodzi do katalogu
  częściowo — ADR 0022).
- **{C}**: zmiana produkcji Sciona dotyka istniejącej karty (Abstruse
  Interference) — sprawdzić testy pinujące i golden; bez zmiany zachowania
  „any color" tam, gdzie Oracle mówi {C}.
- **Wycena bota**: nowe deskryptory (training, disguise, aura host-dies,
  mustAttack) wymagają gałęzi wyceny albo świadomego wpisu `REVIEWED_UNVALUED`
  z uzasadnieniem (M157) — inaczej czerwony strażnik.
