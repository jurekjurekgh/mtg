# AUDYT — Żywy Tester na batchu 52 + wycena bota (2026-09-01, sesja arena/01a05d4f, PR #92)

**Zlecenie:** „testy Żywym Testerem na taliach z nowymi kartami i baczny
audyt poprawności kart oraz poprawności bota w ich użyciu”.

**Metoda:** `docs/setup/TESTER_STOLU.md` — świeży `npm run build`, instalacja
`jsdom` w `tools/table-tester`, partię `node run-game.mjs --human <talia>
--bot <talia> --seed <n> --steps 400 --profile greedy --out <plik>`;
transkrypty w `/tmp/audyt-b52/` (poza repo). Bot gra taliami z nowymi kartami
jako strona „Nieprzyjaciel” (heurystyka), gracz = sterownik testowy.

Karty batch 52 i ich talie: `final-fantasy` — Loporrit Scout, Vaan Street
Thief; `worek-legend` — Ulna Alley Shopkeep; `tarkir-wur` — Kill Shot;
`zendikar` — Merfolk Falconer; `dominaria-brg` — Jolrael, Mwonvuli Recluse;
`kaladesh` — Fourth Bridge Prowler; `alara` — Leonin Surveyor;
`innistrad-brg` — Cemetery Recruitment.

## 1. Poprawność kart (Oracle/efekty/triggery)

28 testów `test/batch52-kart.test.js` zielonych (dane Oracle, deskryptory,
triggery, modale, etykiety). W żywych partiach potwierdzono bezpośrednio:

- **Leonin Surveyor** (alara, seed 601): ETB start engines → speed rośnie do
  4 → po śmierci (Liliana's Triumph) bot aktywuje „{3}, exile z grobu:
  dobierz kartę” — wygnanie z grobu + dobranie. ✓
- **Cemetery Recruitment** (innistrad-brg, seed 704): bot rzuca czar na
  stwora z własnego grobu (Scorned Villager), karta wraca do ręki i zostaje
  ponownie zagrana; jedyny legalny cel — zwrot poprawny. ✓
- **Fourth Bridge Prowler** (kaladesh, seedy 504/705): ETB „you may −1/−1” —
  przy braku wrogiego stwora bot świadomie odmawia celu („cel odrzucony,
  trigger bez efektu”) zamiast debuffować własnego. ✓
- **Jolrael / Merfolk Falconer / Loporrit Scout / Ulna Alley Shopkeep** —
  triggery i statiki (token Cat po drugim doborze, scry 2 po kickerze,
  +1/+1 po wejściu innego stwora, menace + Infusion) działają; pokryte
  testami; w partiach widoczne w logach stanu (badge `+2/+0`, `+1/+1`).

**Detektory:** zero zgłoszeń dla nowych kart. Jedyne 2 zgłoszenia osi „noop”
(partia kaladesh seed 705) dotyczą **Discover** (Geological Appraiser —
`worek-dziki`, strona gracza) — „Oferta pewną stratą: Discover — rzuć bez
kosztu many”. To mechanika spoza batch 52, po stronie oferty (nie wyceny
bota heurystycznego); zanotowano jako pre-existing, do osobnego zgłoszenia.

## 2. Poprawność bota (wyceny efektów nowych kart)

Audyt `src/controllers/heuristic-bot.js` pod kątem każdego efektu 9 kart.
Większość wycen istniała: `destroy_permanent` (Kill Shot), `resolve_exile_cast`
(Vaan), `create_token`/`draw_cards`/`scry`/`pump`/`add_counter`
(triggerowe/storące), klasyfikacja `buff_creature_until_end_of_turn` po znaku
(effect-intent — Fourth Bridge Prowler). **Trzy luki zamknięte u root cause:**

### 2.1 Cemetery Recruitment — `return_card_from_graveyard_to_hand` (REVERSAL)

W batch 52 efekt wpisano do `REVIEWED_UNVALUED` („własna karta z grobu,
warianty równoważne”). Pomiar Żywym Testerem obalił to uzasadnienie:
warianty celu **remisowały na bazie 50** i bot brał **pierwszą (najgorszą)
kartę z grobu** — 2/1 zamiast 6/4 — „remis wariantów przez brak case'a”
(klasa L50). Do tego `drawIfSubtypes` (Zombie → dobranie) nie było premiowane.

**Fix:** gałąź wyceny w ścieżce `cast_spell` (ADR 0002, po deskryptorze):
`P.drawCardValue + (power·2 + toughness)` + bonus `P.drawCardValue`, gdy
podtyp odzyskanej karty ∈ `drawIfSubtypes`. Wpis usunięty z `REVIEWED_UNVALUED`.

### 2.2 Jolrael — `set_base_pt_creatures_you_control` (samodestrukcja)

Zdolność „{4}{G}{G}: bazowe X/X, X = karty w ręce” dostawała **gołe score=2**
i bot aktywował ją nawet, gdy **osłabiała** własną planszę (6/6 → 2/2 przy
2 kartach w ręce). Zmierzone wprost: `activate_ability(jolrael#1) -> 2` > pass 0.

**Fix:** wycena sumy zmian P/T po własnej stronie (`(X−power)·2 + (X−toughness)`
per stwór): kara przebijająca bazę, gdy netto ≤ 0 albo brak stworów; premia
(do 30 pkt) tylko w oknie, w którym X/X zdąży zadziałać (Główna 1 własna /
obrona w turze przeciwnika), inaczej kara za wyparowanie w cleanup (CR 514.2).

### 2.3 Zdolności aktywowane Z GROBU — `abilityObject` nie widział grobu

`activate_ability` budował `abilityObject` z `objectOnBoard` (pola bitwy) lub
`handCard` (ręka) — karta w **grobowcu** (Leonin Surveyor, Glitch Ghost
Surveyor, Survivor of Korlis, Goldmeadow Harrier, Reassembling Skeleton,
unearth) dawała `ability = undefined`, więc pętla efektów nie wyceniała
**niczego** (gołe 2 pkt za dobranie karty). Ścieżka czarów znała już `zoneCard`
(Escape/Flashback, M103/D) — bliźniacza gałąź zdolności nie (L41).

**Fix:** `abilityObject = source ?? handCard(...) ?? zoneCard(...)` — wspólny
mianownik `zoneCard` skanuje wszystkie strefy widoku.

## 3. Regresje i pomiary

- **5 testów regresyjnych** `test/batch52-bot-wycena.test.js`: Cemetery
  Recruitment (bez remisu + premia Zombie), Jolrael (nie aktywuje przy
  osłabieniu / aktywuje przy wzmocnieniu w Głównej 1), Leonin (dobranie z
  grobu ≥ wartość karty).
- **Golden-master bota** zregenerowany (`tools/bot-scoring-snapshot.mjs
  --write`) — świadoma zmiana wycen (dominaria-brg@1000 scoreSum 2444.4 →
  2456.4, od nowej wyceny Jolrael), nie refaktor.
- **Progi win-rate benchmarku bez zmian** (nie tą ścieżką).

**Wynik:** `npm test` **4118/4118**, `test:all` **4128/4128**,
build **57 modułów / 3069.2 kB**.
