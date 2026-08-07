# Plan: Batch 20 — 10 realnych kart (lista właściciela 2026-08-06)

- **Data:** 2026-08-06
- **Sesja:** `arena/019fd8a4-mtg` (kontynuacja PR #31)
- **Karty:** Chittering Rats (DST), Coralhelm Guide (BFZ), Rustwing Falcon (M19),
  Caravan Vigil (ISD), Gorehorn Minotaurs (MM2), Moonlit Meditation (EOE),
  Goldmeadow Nomad (ECL), Fear of Abduction (DSK), Monastery Flock (KTK),
  Death-Hood Cobra (2XM).
- **Procedura:** ADR 0010 §2a — dane Scryfall pobrane PRZED kodowaniem (10 plików
  `docs/cards/scryfall-*.json`), artId + plan ze słownika kolekcji.

## Mechaniki i stopień trudności

### Łatwe (istniejące mechaniki)
- **Rustwing Falcon (M19)** {W} 1/2 Bird, **Flying** — vanilia flyier.
- **Monastery Flock (KTK)** {2}{U} 0/5 Bird, **Defender + Flying + Morph {U}** —
  morph + defender + flying (wszystko istnieje).
- **Death-Hood Cobra (2XM)** {1}{G} 2/2 Snake — `{1}{G}: reach EOT`;
  `{1}{G}: deathtouch EOT`. Aktywowane granty keywordów do końca tury na ŹRÓDLE
  (`grant_keywords_until_end_of_turn` self — Stirring Bard robi to na celu).

### Umiarkowane (nowe/rozszerzone mechaniki)
- **Coralhelm Guide (BFZ)** {1}{U} 2/1 — `{4}{U}: Target creature can't be blocked
  this turn.` Aktywowana zdolność z celem-stworem, efekt „can't be blocked"
  (nieblokowalny; efekt `cant_block` z Sagi Shiva M33 — weryfikacja nazwy).
- **Caravan Vigil (ISD)** {G} Sorcery — szukaj basic land do ręki (istnieje);
  **Morbid** — jeśli stwór zginął w tej turze, połóż na bitwisko zamiast do ręki.
  **Nowe:** warunek `creatureDiedThisTurn` (śledzenie śmierci stwora w turze).
- **Gorehorn Minotaurs (MM2)** {2}{R}{R} 3/3 — **Bloodthirst 2**: jeśli przeciwnik
  był obrażony w tej turze, wchodzi z dwoma +1/+1. **Nowe:** warunek
  `opponentDealtDamageThisTurn` + liczniki ETB.

### Umiarkowanie-trudne
- **Chittering Rats (DST)** {1}{B}{B} 2/2 — ETB: **target opponent** kładzie kartę
  z ręki na wierzch biblioteki. **Nowa blokująca decyzja** (celowany przeciwnik
  wybiera kartę z ręki → wierzch biblioteki; jak `resolve_sacrifice_choice`).
- **Goldmeadow Nomad (ECL)** {W} 1/2 — `{W}, Exile this card from your graveyard:
  Create a 1/1 green and white Kithkin creature token.` **Aktywowana zdolność z
  GROBU** (wygnanie siebie z grobu + token; nowe: activate-from-graveyard jak
  cycling z ręki, ale z grobu) + nowy token `token_kithkin`.
- **Fear of Abduction (DSK)** {4}{W}{W} 5/5 Enchantment Creature — **dodatkowy
  koszt** „exile a creature you control" (jak sacrifice-cost, ale exile); ETB:
  **wygnaj** cel-stwora przeciwnika; **opuszczenie bitwiska** → zwróć wygnane
  karty do ręki właściciela. **Nowe:** koszt-additional `exileCreatureYouControl`,
  efekt „banish" (wygnanie z linkiem powrotu przy odejściu źródła).

### Trudna (decyzja zakresu)
- **Moonlit Meditation (EOE)** {2}{U} Aura — „Enchant artifact or creature you
  control. **The first time you would create one or more tokens each turn, you may
  instead create that many tokens that are copies of enchanted permanent.**"
  Wymaga: nowy typ celu aury (artifact or creature you control), **replacement
  effect** (przechwycenie pierwszego tworzenia tokenu w turze), **klonowanie**
  (tokeny-kopie zaczarowanego permanentu), once-per-turn + „you may". To NOWY
  framework (replacement effects) w engine — **największa pozycja batcha**.
  Opcje: (a) pełna implementacja (duży engine feature), (b) odroczenie do
  osobnego zadania. **Do rozstrzygnięcia z właścicielem.**

## Kryteria ukończenia

- [ ] `npm test` zielone (+ testy legalnych/nielegalnych scenariuszy każdej karty,
  sanity Scryfall z `fs.readFileSync`, determinizm replay).
- [ ] `npm run build` przechodzi.
- [ ] Karty `supported` w 100% mechaniki (decyzja właściciela 2026-08-03).
- [ ] Dopisane do **istniejących** talii singleton (green/black/red/innistrad/
  azorius/wiedzmin), NIE pliki batchowe (M32).
- [ ] Pełny B0 informacyjnie (dodanie kart, nie zmiana bota — progi bez zmian).

## Stan prac (sesja 2026-08-06 wieczór)

- [x] cz. 0 — roadmapa + dane Scryfall (`51d549a`).
- [x] cz. 1 — **3 łatwe karty**: Rustwing Falcon, Monastery Flock, Death-Hood
  Cobra (`b339e5f`). 899/899 zielonych.
- [x] cz. 2 — Coralhelm Guide, Caravan Vigil (morbid), Gorehorn (bloodthirst).
- [x] cz. 3 — Chittering Rats, Goldmeadow Nomad, Fear of Abduction.
- [x] cz. 4 — Moonlit Meditation (replacement + clone).
- [x] cz. 5 — talie singleton + 3 nowe tematyczne + pełny B0 + docs (M42).

  WSZYSTKIE 10 KART UKOŃCZONE — 911/975 zielonych, artefakt 48 modułów / 933,4 kB.

**Uwaga środowiskowa:** w tej sesji zdarzył się fresh clone (historia lokalna
zresetowana do bazy, drzewo robocze zachowane). Odzyskano `git fetch` +
`git reset --mixed FETCH_HEAD` (handoff) — historia granularna przywrócona,
899/899 zielonych, wszystko wypchnięte. Pozostałe 7 kart (4 nowe mechaniki +
Moonlit) to kolejna sesja — clean pickup (roadmapa + dane + 3 karty są w repo).

## Kryteria ukończenia

## Ryzyka / pułapki

- **Moonlit Meditation** — replacement + clone to duży feature; może wykraczać
  poza tę sesję → odroczenie z jawnym statusem `in-development`.
- **Morbid/Bloodthirst** — trackery tur (`creatureDiedThisTurn`,
  `opponentDealtDamageThisTurn`) zerowane przy zmianie tury (jak
  `cardsDrawnThisTurn`).
- **Chittering Rats** — decyzja CELU (przeciwnik) jak `resolve_sacrifice_choice`;
  auto-skip gdy pusta ręka.
- **Goldmeadow Nomad** — activate-from-graveyard wymaga nowej ścieżki w
  `legalActivatedAbilities` (groby, nie ręka/bitwa).
- **Fear of Abduction** — banish potrzebuje linku (lista wygnanych na obiekcie);
  powrót przy `dies`/`exile`/`bounce` źródła.
- **edit_file psuje polskie znaki** → `python3`; komunikaty commitów plikiem
  w `/home/user`; commit+push po każdym fragmencie.
