# Audyt Żywym Testerem — Batch 38 (2026-08-20)

## Cel i metoda

Audyt „z perspektywy gracza" narzędziem `tools/table-tester/` na PR #65.
Wcieliłem się w gracza konkretnymi taliami z kartami Batch 38 i rozegrałem
partie przeciwko botowi, obserwując interfejs, oferty akcji, modale, log,
stos i zachowanie nowych kart w prawdziwych kombinacjach (nowe + stare).

Rozegrane partie (transkrypty w `tools/table-tester/audyt-batch38-zywy/`):

- azorius vs red (seeds 1,2,3,42,51,81) — Divine Offering, Fortify, Lotusguard,
  Talion's Messenger, Weftblade
- azorius vs black/mechanicy/green/spellslinger (20,21,50,52,53)
- green vs red/black/tokens/wiedzmin/spellslinger (7,9,30,31,32,33,42,60,90,91,92,93)
- red vs green/mechanicy/azorius (11,43,61,70,90,101)
- mechanicy vs azorius/red/spellslinger/green (13,15,22,40,41,63,103)

## Co działa poprawnie (Batch 38)

- **Mysidian Elder**: token Wizard (0/1) tworzony poprawnie; trigger
  `you_cast_noncreature_spell` → 1 dmg każdemu przeciwnikowi działa
  (zielono-czerwona 7).
- **Pristine Talisman**: `{T}: add mana + gain 1 life` jako mana ability bez
  stosu, z życia logowane poprawnie (mechanicy-spellslinger 41).
- **Chatter of the Squirrel**: token Squirrel 1/1 tworzony poprawnie
  (green-azorius 60, green-spellslinger 42).
- **Colossodon Yearling**: vanilla 2/4 (green-azorius 60).
- **Silken Strength**: aura creature_or_vehicle, +1/+2 reach; ETB untap
  enchanted (green-black 31).
- **Lotusguard Disciple**: ETB lifelink+indestructible na celu
  (azorius-red 51, wiedzmin-azorius 111).
- **Fortify**: modal +2/+0 / +0/+2 (azorius-red 51).
- **Weftblade Enhancer**: ETB +1/+1 counter; normalny rzut działa
  (mechanicy-azorius 103). Warp pokryty testem engine
  (`test/real-cards-batch38.test.js`), ale tester go nie klika (znalezisko 6).

## Znaleziska (10)

Poniższe 10 znalezisk. Każde zweryfikowane w kodzie (root cause) i/lub
odtworzone w transkrypcie.

1. **[log] Fear of Burning Alive „zadaje 4 obrażenia (?)"** — damage_dealt
   z `resolve_delirium_target` nie niesie `targetCardId`, więc gdy cel ginie
   w SBA tego samego rozstrzygnięcia, log pokazuje „(?)" zamiast nazwy.
   Transkrypt: green-red-30.
2. **[log] „4 liczników czasu"** — session.js:788 ma sztywną odmianę
   „liczników", podczas gdy render.js (M151) używa `polishPluralCount`
   („liczniki"). Niespójność w logu. Transkrypt: green-black-31.
3. **[bot] Courage in Crisis buforuje stwora PRZECIWNIKA** — `add_counter`
   nie ma wyceny „własny stwór" w pętli czarów; bot płaci, by wzmocnić wroga.
   Transkrypt: wiedzmin-green-93 (Highland Game = gracz).
4. **[bot] Ruinous Rampage — zły tryb** — bot wybrał „Wygnaj artefakty"
   (wygnie własne Angel's Feather MV3) zamiast „3 obrażeń każdemu
   przeciwnikowi"; `damage_each_opponent` nie jest wyceniane w pętli
   modalnego czaru. Transkrypt: green-red-7.
5. **[ui] Odwrócona kolejność trybów modalnych** — unshift w playerView
   odwraca kolejność ofert; Fortify pokazuje Obronę przed Ofensywą, więc
   gracz/tester bierze zły „domyślny" tryb.
6. **[tester] warp niedostępne dla testera** — `pickAction` nie łapie
   „Rzuć za warp:" (wzorzec dodany dla nowej mechaniki Weftblade); tester
   nigdy nie ćwiczysz warp.
7. **[ui] nazwa tokenu = raw id** — kafle i cele pokazują `token_squirrel`
   / `token_wizard` zamiast „Squirrel"/„Wizard"; playerView battlefield
   pomija pole `name` tokenu.
8. **[engine] Sterling Keykeeper — no-op self-tap** — oferta tapowania
   WŁASNEGO źródła (już zapłaconego przez {T} w koszcie) — czysty no-op.
9. **[bot] atak 0/1 tokenem Wizard** — bot atakuje bezsensownym tokenem
   0/1 (brak evasion, brak triggera ataku). Transkrypt: azorius-red-51,
   red-azorius-101.
10. **[bot] Pristine Talisman — darmowe życie ignorowane** — add_mana kara
    (M128) maskuje rider gain_life; bot nigdy nie tapuje za darmowe życie.

## Naprawy i testy regresyjne

Wszystkie 10 znalezisk naprawione. Każda zielona transza (`npm test` +
`npm run build`) = osobny commit na PR #65. Testy regresyjne w
`test/batch38-audit-fixes.test.js`.

- **Z1** — `damage_dealt` z `resolve_delirium_target` niesie `sourceCardId`/
  `targetCardId` (LKI); log pokazuje nazwę celu, nie „(?)". (game-state.js)
- **Z2** — `card_suspended` używa `polishPlural` (licznik/liczniki/liczników),
  zgodnie z render.js/M151. (session.js)
- **Z3** — `add_counter` z pozytywnym licznikiem premiuje WŁASNY stwór, mocno
  karze wzmacnianie stwora przeciwnika (Courage in Crisis). (heuristic-bot.js)
- **Z4** — `damage_each_opponent` / `lose_life_each_opponent` wyceniane w
  pętli czarów (4×N, dobicie bonus); bot wybiera tryb obrażeń nad
  bezsensownym wygnaniem (Ruinous Rampage). (heuristic-bot.js)
- **Z5** — tryby modalne iterowane od końca w `legalSpellCasts`, więc po
  `unshift` w playerView pojawiają się w kolejności Oracle (mode 0 pierwszy).
  (spells.js)
- **Z6** — tester: `pickAction` łapie „Rzuć za warp:" (wzorzec nowej
  mechaniki Warp). (tools/table-tester/run-game.mjs)
- **Z7** — tokeny niosą jawną nazwę (`object.name`) w playerView battlefield;
  `nameOfObject`/`nameOfObjectId` wolą ją od `nameOf(cardId)` (raw id).
  (game-state.js, session.js, render.js)
- **Z8** — brak oferty no-op self-tap: zdolność z kosztem {T} nie celuje
  w własne źródło efektem `tap_permanent` (Sterling Keykeeper).
  (abilities.js)
- **Z9** — atakujący o mocy 0 (0/1 token) bez drenażu/ewazji nie atakuje
  (wartość poniżej passu mimo premii „otwartej presji"). (heuristic-bot.js)
- **Z10** — zdolność many z riderem `gain_life` (Pristine Talisman) nie
  dostaje kary M128 „tapowanie na zapas" — darmowe życie zawsze warte
  tapnięcia. (heuristic-bot.js)

Nowy detektor Testera (Z7, `detectTokenRawId`) — strażnik wycieku raw id
tokenu; zweryfikowany na transkrypcie sprzed naprawy (6 trafień) i po (0).

## Obserwacje poza zakresem — naprawione

- **craft na kopii bez drugiej strony** — token-kopia artefaktu z craft
  (przez enterAsCopy) niosła zdolność craft bez `transformTo`; aktywacja
  rzucała „Ta karta nie ma drugiej strony (craft)" i przerywała partię
  (async crash w `test/bot-benchmark.test.js`, failował CI od c8404c0).
  Naprawione: `craft_transform` to no-op bez `transformTo` (CR 608.2b),
  `legalActivatedAbilities` nie oferuje craft bez `transformTo`, `enterAsCopy`
  kopiuje `transformTo`. `test:all` zielone.
- **Steelfin Whale fałszywy alarm** — `detectFalseNoEffect` flagował „zerowy
  wynik" Steelfin Whale (odkręcenie i tak odkręconego) obok tokena Germ
  z living weapon Strandwalkera (inny trigger w sąsiedztwie). Naprawione:
  detektor wymaga, by dowód dotyczył TEGO SAMEGO źródła. Transkrypt
  green-mechanicy seed 170: 0 zgłoszeń (było 1).

## Nie-błąd (potwierdzone)

- **Cuombajj Witches „Cel obrażeń"** (oś 3) — obowiązkowy wybór celu
  (`resolve_damage_target`, wskazuje przeciwnik); ptaszek wyciszenia
  niepotrzebny. To nie błąd, tylko zgłoszenie detektora Oś 3.
