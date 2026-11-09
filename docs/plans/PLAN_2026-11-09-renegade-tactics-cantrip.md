# Plan 2026-11-09 — Renegade Tactics: cantrip nie niesie jałowego ridera

## Problem i zakres

Zgłoszenie właściciela (**U** w rozmowie; prefiks pinów **RT**, bo `U/1–3`
i `U/A–C` są już zajęte): bot rzuca **Renegade Tactics**, mimo że przeciwnik
nie ma żadnej kreatury na stole — „rzuca tylko po to, żeby dobrać kartę.
To trochę marnowanie potencjału tej karty”.

Oczekiwane: bot **trzyma** czar, gdy `cant_block` nie kupuje realnej wartości
w oknie walki (brak wrogich stworów, cel własny/tapnięty/już z zakazem,
brak własnego ataku, main2, bloker nie może blokować atakującego). Nadal
rzuca, gdy wyłączenie blokera realnie pomaga atakowi. Naprawa wyłącznie
w wycenie bota, generyczna po deskryptorze (ADR 0002); bez zmiany legalności,
silnika, katalogu i stołu. Bez nowych kart (ADR 0029), bez pełnego B0
(ADR 0018), bez scalania. PR sesji **#184** otwarty; ten plan jest pushowany
osobnym commitem **przed** edycją `src/` i testów.

## Rozpoznanie przed kodem (read-only)

### Karta, Oracle, ruling

`src/cards/card-data.js` (`renegade-tactics`, CMR, {R}, Sorcery):
`targets: [{ type: 'creature' }]`, efekty `cant_block` + `draw_cards: 1`.
Oracle (`docs/cards/scryfall-renegade-tactics.json`):

> Target creature can't block this turn.
> Draw a card.

Ruling WotC 2020-11-10 (dosłownie, ze snapshotu):

> If the target creature is an illegal target by the time Renegade Tactics
> tries to resolve, the spell doesn't resolve. You don't draw a card.

Cel „creature” jest **legalny także we własnego stwora** — to nie jest błąd
silnika. Błędem jest wycena, która każe botowi palić ridera dla samego doboru.

### CR (wydanie 2026-11-06, mirror `nwgarne/mtg-data`)

SHA-256 `d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`,
pobrany do `.arena/cr-current.txt` w tej sesji. Numery sprawdzone w
`test/helpers/cr-numery-tabela.js`.

- **509.1b**: „The defending player checks each creature they control to see
  whether it’s affected by any restrictions (effects that say a creature
  can’t block, or that it can’t block unless some condition is met). If any
  restrictions are being disobeyed, the declaration of blockers is illegal.”
- **307.1**: „A player who has priority may cast a sorcery card from their
  hand during a main phase of their turn when the stack is empty. Casting a
  sorcery as a spell uses the stack. (See rule 601, “Casting Spells.”)”
- **117.1a**: „A player may cast an instant spell any time they have priority.
  A player may cast a noninstant spell during their main phase any time they
  have priority and the stack is empty.”
- **608.2b** (fragment o wszystkich celach nielegalnych): „If all its targets,
  for every instance of the word “target,” are now illegal, the spell or
  ability doesn’t resolve. It’s removed from the stack and, if it’s a spell,
  put into its owner’s graveyard.”

Wniosek: zakaz blokowania ma wartość tylko wtedy, gdy w tej turze bot
deklaruje atak, a cel mógłby realnie zablokować któregoś atakującego.
Sorcery rzucamy w main1 przed walką; okna `beginning_of_combat` /
po deklaracji dotyczą instantów/zdolności, nie legalnego rzutu Renegade
z ręki (307.1/117.1a). Nie zmieniamy timingu silnika.

### Sonda `.arena/probe-renegade.mjs` → `.arena/u-probe-3.log`

Prawdziwa karta + rejestr, bot p1, main1 chyba że podano. Scena G z pierwszego
przebiegu (tura wroga) zwróciła `concede` — artefakt harnessu, usunięta
z dowodów. Scena K pierwszego przebiegu była niemiarodajna (`cantBlock`
podany do `addObject` został cicho zrzucony); poprawiona flaga **po**
dodaniu obiektu. Wynik końcowy:

| Scena | Wybór PRZED | Score |
|---|---|---:|
| A wróg 0 stworów, ja 3/3 | cast → **własny** `me-0` | 36 |
| B pusty stół obu stron | pass (brak legalnego celu) | 0 |
| C wróg tapnięty 4/4 | cast → foe | 36 |
| D wróg 3/3, ja bez stworów | cast → foe | 36 |
| E wróg 3/3, ja 3/3 | cast → foe (**poprawnie**) | 62 |
| F main2 | cast → foe | 36 |
| H chump 1/1 + killer 5/5 | cast → killer (**poprawnie**) | 71 vs 59 |
| I biblioteka 1 | pass (deck-out guard) | wariant −90 |
| J darmowy rzut z ręki, wróg 0 | free-cast → własny | 45 > skip 4 |
| K wróg już z `cantBlock` | cast → foe | 36 |
| L ja flying, wróg naziemny | cast → foe | 36 |
| N własny stwór z chorobą przywołania | cast → foe | 36 |
| O własny 0/3 | cast → foe | 36 |
| Epic Experiment, wróg 0 | cast z wygnania | 75 > done 0 |
| Discover, wróg 0 | cast za darmo | 60 > ręka 20 |

`beginning_of_combat` i rzut po deklaracji: brak oferty sorcery z ręki
(poprawne 307.1) — pozytywy w tych oknach pinujemy syntetykiem instant
i zdolnością aktywowaną, nie Renegade.

Skan katalogu (`createCardRegistry().all()`): **jedyna** karta z
`cant_block` + `draw_cards` w jednej liście efektów to `renegade-tactics`.
Reguła pozostaje generyczna po kształcie efektów; brak nazw/ID w kodzie.

### Przyczyna źródłowa

`UTILITY_EFFECT_TYPES` zna `cant_block`, ale obecność `draw_cards` wyklucza
bazę utylitarną → zostaje `spellBase` 50. Gałąź `cant_block` dodaje
`removalValue ?? -20`; draw dokłada ~6. Przy jałowym riderze:
`50 + 6 − 20 = 36 > pass 0`. Komentarz Batch60 („cantrip za 1 manę i tak
grywalny”) cementował dokładnie zgłoszone zachowanie (L181). Bliźniak
`activate_ability` ma ten sam fallback −20; `resolve_hand_free_cast` nie
wycenia `cant_block` wcale (45 > skip 4). Okno ataku jest dodatkowo
duplikowane inline w `cast_spell`, zamiast czytać `attackWindowAttackerIds`.

## Projekt naprawy

1. **Pokrętło strategii** `cantBlockCantripHoldPenalty` w
   `heuristic-params.js` (klucz + default **120**, ta sama rodzina co
   `instantDrawHoldPenalty`/`faceBurnHoldPenalty`; ×0 = stan sprzed fixu).
   To świadoma zmiana zachowania za zgodą zgłoszenia, nie ekstrakcja stałej.
2. **Wspólny predykat celu** `cantBlockTargetValue(view, victim, attackerIds)`:
   wróg, nietapnięty, bez `cantBlock`, realny bloker któregoś atakującego
   (`cantBlockRemovalValue`). `null` = rider jałowy.
3. **Wspólna kara** `cantBlockCantripHoldPenalty(view, effects, cmd)`:
   naliczana tylko dla listy efektów złożonej wyłącznie z `cant_block`
   i `draw_cards` (oba obecne), gdy predykat celu zwróci `null` w oknie
   `attackWindowAttackerIds`. Inne payloady (damage/removal/etc.) nie są
   objęte karą — ich własna wycena rozstrzyga.
4. **Bliźniaki L41:** `cast_spell` i `activate_ability` czytają ten sam
   predykat i okno zamiast inline duplikatów; kara odejmowana od wyniku.
   `resolve_hand_free_cast` i `resolve_discover_choice` (alternatywa
   zachowuje kartę w ręce) odejmują tę samą karę.
5. **Granica ekonomiczna (anty-over-fix):** okna, w których odmowa traci
   kartę bezpowrotnie/albo na zawsze (Epic Experiment, suspend, rebound;
   `freeCastEffectsScore`), **nie** dostają kary — tam dobór jest realnym
   odzyskiem, a nie „przepaleniem potencjału”. Nie ruszamy też grave/madness/
   Vaan bez osobnego rozpoznania ich alternatywnego kosztu.
6. Bez zmian w `src/engine/`, `src/cards/`, `src/table/`, deckach i golden
   fixture. Istniejące piny B60 (realny bloker, killer > chump) i
   `real-cards-batch60` (legalność/cantrip/mana) muszą pozostać zielone.

## Piny `test/zgloszenie-rt-renegade-tactics-cantrip.test.js` (RT/)

RED przed fixem, GREEN po fixie; świadki mutacji:

- RT/1–RT/9: hold przy pustym stole wroga (cel własny), pustym stole obu
  stron, tapniętym, już `cantBlock`, main2, bez własnych stworów, choroba
  przywołania, 0 mocy, flying vs naziemny. Każdy: pass wygrywa, wariant
  rzutu < pass, karta zostaje w ręce.
- RT/10: free-cast z ręki przy pustym stole wroga → decline; karta w ręce.
- RT/11: Discover przy pustym stole wroga → „do ręki”, nie rzut.
- RT/12: realny bloker 3/3 vs mój 3/3 w main1 → cast we wroga, > pass;
  po rozstrzygnięciu `cantBlock`, cantrip, czar w grobie.
- RT/13: killer 5/5 > chump 1/1 (istniejący pin B60F-2 zostaje).
- RT/14: mieszanka tapnięty + realny → cel realny (istniejący pin B60).
- RT/15: syntetyk instant `cant_block+draw` w `beginning_of_combat`
  i po deklaracji ataku → cast, gdy bloker realny; main2 → hold.
- RT/16: syntetyk aktywowany `cant_block+draw` → hold bez ataku; aktywacja
  przy zadeklarowanym ataku i realnym blokerze > pass.
- RT/17: anty-over-fix kształtu — syntetyk `damage+ cant_block + draw`
  dobija tapniętego 3/3 mimo jałowego ridera → cast (kara nie obejmuje
  dodatkowego payloadu).
- RT/18: anty-over-fix okna — Epic Experiment z Renegade przy pustym stole
  wroga nadal rzuca (odmowa = grób, dobór jest odzyskiem).
- RT/19: czysty cantrip draw-only (syntetyk sorcery) przy pustym stole
  wroga nadal rzucany.
- RT/20: parametr — default 120, klucz w rejestrze, normalize; ×0 przywraca
  dawny rzut z RT/1 (pokrętło nie jest atrapą).
- RT/21: engine bez zmian — cel we własnego stwora nadal legalny i
  rozstrzyga się z doborem (Oracle „target creature”, nie „opponent's”).

## Mutacje (`.arena/mutate-rt.py`, logi `.arena/mut-rt-*.log`)

- mRT1: usunięcie kary z `cast_spell` → RT/1–9 RED.
- mRT2: usunięcie bramki kształtu (kara dla każdego `cant_block`) → RT/17 RED.
- mRT3: pominięcie guardów celu (tapped/cantBlock/własny) → RT/3/4/1 RED.
- mRT4: okno tylko declared-attack w casterze → RT/12 RED.
- mRT5: usunięcie kary z `resolve_hand_free_cast` → RT/10 RED.
- mRT6: usunięcie kary z `activate_ability` → RT/16 RED.
- mRT7: odcięcie pokrętła (stała 120 zamiast `P.…`) → RT/20 RED.
- mRT8: kara także w oknie Epic → RT/18 RED.

Każda mutacja: kopia pliku przed edycją, RED na pinach, przywrócenie,
GREEN, `git status` czysty po przywróceniu (L34). Mutacja GREEN bez
świadka = brak dowodu, nie „sukces”.

## Etapy i kolejność commitów

1. [x] Rozpoznanie read-only: karta/Oracle/ruling, CR, skan katalogu,
   sonda A–L + Epic/Discover, istniejące piny, kolizja prefiksu U.
2. [ ] Ten plan + `npm test`/build bazy → commit/push **przed** kodem.
3. [ ] Piny RT/1–21 → RED (liczba fail zapisana w logu).
4. [ ] Fix params + bot (predykat, kara, bliźniaki, granica okien) →
   GREEN RT, sąsiednie batch60/M221/PMSSB-40/FJ/ID, golden 4/4 bez
   regeneracji, `npm test` + build → commit/push.
5. [ ] Mutacje mRT1–8 ze świadkami → raport.
6. [ ] `npm run test:all` (cicho, log + exit), build, strażnicy docs/CR,
   `cr-numery --cr`.
7. [ ] Raport `docs/audits/ZGLOSZENIE_RT_RENEGADE_TACTICS_CANTRIP_2026-11-09.md`,
   plan [x], HISTORY, HANDOFF §12, kumulatywny PATCH PR #184 (REST).

## Ryzyka i pułapki

- **L181:** stary komentarz/pin „cantrip i tak grywalny” jest treścią skargi;
  nie bronimy go. Pozytywy E/H muszą zostać.
- **L41:** trzy ścieżki (cast/activate/free) muszą czytać jedną miarę;
  inline duplikat okna w casterze jest usuwany, nie kopiowany.
- **L3:** kara musi przebić bazę+draw (120 > 56), nie tylko wyzerować rider.
- **307.1:** nie pinować rzutu sorcery w BoC/po deklaracji — tam legalnej
  oferty nie ma; pozywy syntetyków instant/ability.
- **Ekonomia okien:** Epic/suspend/rebound tracą kartę przy odmowie —
  hold tam byłby over-fiksem. Discover/hand zachowują kartę — hold.
- **Golden:** fixture nie zawiera kaladesh/renegade; spodziewane 4/4 bez
  `--write`. Przy dryfie tylko `--dump` i świadoma decyzja, nie regeneracja.
- **Sonda:** flagi bojowe ustawiać po `addObject`; scena G (concede) była
  artefaktem harnessu, nie dowodem.
- Reset workspace: backup → fetch → `reset --mixed FETCH_HEAD`; bez force.
