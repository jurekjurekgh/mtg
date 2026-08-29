# PLAN 2026-08-30 — M257 r4: uwagi z testów (A: Deklaracja atakujących) + pętla jakości bota + strojenie rodziny aura (sesja arena/01a04e98)

**Sesja:** `arena/01a04e98-mtg` (PR #88). **Baza:** `d7083e7` (stan po
M257r4: F3 ninjutsu, F1 liczniki wejścia, F4 driver; `npm test`
3755/3755, build 2910.5 kB).

**Prompt (właściciel, runda 4 „Uwagi z testów"):**
> A. Faza Deklaracja Atakujących — jeśli nie mam żadnej kreatury to nie
> powinienem w ogóle dostawać takiej opcji, a dostaję.
> Jak poprawisz to kolejna Pętla ze szczególnym uwzględnieniem
> poprawności, logiczności i optymalności działań bota. Możesz też
> przeprowadzić procedurę strojenia bota na jakiejś niestrojonej jeszcze
> rodzinie.

## Rozpoznanie

**A — root cause (potwierdzony kodem):**
- Generator legalnych komend (`game-state.js` ~6317): w kroku
  `declare_attackers` oferta = `legalAttackerOptions(state, playerId,
  COMBAT_OPTION_CAP)` (`combat.js:863`).
- Zero legalnych atakujących → `boundedSubsets([], cap)` → `[[]]` →
  generator wystawia JEDNĄ komendę `declare_attackers` z pustym zestawem —
  decyzję, która nie istnieje (CR 508.1: bez legalnych atakujących
  deklaracja jest pusta i automatyczna, gra przechodzi do kroku
  blokujących; nie ma okna decyzji).
- Przejścia w `declare_attackers` są TYLKO przez `nextTurnStep` w
  `pass_priority` (brak `jumpToStep` do tego kroku) → auto-przejście
  należy w to samo miejsce, obok istniejącej auto-akcji turowej kroku
  dobierania (`drawStepTurnBasedAction`, CR 504.1 — ten sam wzorzec:
  „aktywny gracz robi X SAM, bez decyzji").
- `declareAttackers(state, id, [])` jest legalny (wszystkie walidacje
  przechodzą na pustym zbiorze) i ustawia `state.combat` + event
  `attackers_declared` — ale pushuje event natychmiast, a `pass_priority`
  zbiera eventy lokalnie i dopisuje je na końcu (kolejność logu; patrz
  flaga `pushToState` w `untapStepTurnBasedAction` — ten sam problem,
  ten sam wzorzec rozwiązania).
- UI już obsługuje puste zdarzenie bez szumu: „Brak ataku" (session.js
  ~880) + pominięcie w modalu Rozgrywka (M80, ~2326).
- Bot: po auto-przejściu nigdy nie zobaczy kroku `declare_attackers` bez
  atakujących — brak dodatkowych zmian kontrolera (ADR 0017: oferta =
  stan; gdy decyzji nie ma, komendy nie ma).

**Strojenie — „niestrojona jeszcze rodzina":**
- Wagi rodzin (B4, 7 mnożników) — ostatnie re-strojenie M31 (74 karty);
  katalog uroósł do 478 kart, ale to jest ta sama warstwa (mnożniki).
- Parametry deskryptorowe (B6): w `tools/tune-card.mjs` jawna lista
  rodzin OCZEKUJĄCYCH na parametry: `surge`, `manifest`, `aura`
  (komentarz „kolejne sesje T1").
- `surge`/`manifest` nie mają WŁASNYCH stałych w `scoreCommand`
  (grep: brak odnośników) — nie da się z czego wyciągać.
- **`aura` ma kompletny blok wyceny z magicznymi stałymi**
  (`heuristic-bot.js` ~1662–1760): baza buffa 66, wroga aura na
  przeciwnika 55+2×worth, na własnym −70−worth, brak celu −50,
  losesKeywords jałowa −80−worth, czysta ochrona: brak zagrożeń −40,
  20+12×zagrożenia+p. **Wybór: rodzina `aura`** (T1 + T4).
- Aury w taliach (pula T4): Hobble (warhammer-wu), Moonlit Meditation
  (worek-legend), Grounded (innistrad-brg), Nature's Embrace (wiedzmin),
  Shiv's Embrace (dominaria-brg), Serra's Embrace (dominaria-wu).

## Etapy i kryteria ukończenia

### Etap 1 — Fix A (root cause) — commit `M257 r4/A: …`
1. Test RED: pełna runda passów `beginning_of_combat` → aktywny gracz
   bez kreatur → silnik MUSI sam przejść do `declare_blockers`
   (`state.combat.attackers = []`, event `attackers_declared` z pustą
   listą w dobrej kolejności), a `playerView` (gracz I bot) NIE
   wystawia żadnej `declare_attackers`.
2. Anti-overfix: gracz z legalnym atakującym dostaje ofertę jak dotąd
   (wszystkie podzbiory); gracz z TYLKO wymuszonym atakującym (goad)
   dostaje pojedynczą ofertę z nim.
3. Fix: `combat.js` — `declareAttackers(state, playerId, attackerIds,
   { pushToState = true } = {})` (domyślnie jak dotąd; `pass_priority`
   pushuje lokalnie); `game-state.js` — w `pass_priority`, po
   `drawStepTurnBasedAction`: krok `declare_attackers` i zero nie-pustych
   opcji ataku → auto-deklaracja `[]` + `jumpToStep(declare_blockers,
   obrońca)` + event `step_advanced`.
4. Bramy: `npm test` (cały pakiet — m.in. golden-master
   `bot-scoring-snapshot`: jeśli partia snapshotowa dotykała pustego
   kroku, ślad się skróci → świadoma regeneracja `--write` + notatka w
   commicie) + `npm run build`. Push.

### Etap 2 — T1: rodzina parametrów `aura` (refaktor) — commit `M257 r4/B6 T1: …`
1. Wyciągnąć stałe bloku aury do `heuristic-params.js` (domyślne =
   dawne stałe co do punktu): `auraBase` 66, `auraBuffWorthWeight` 2,
   `auraHostileEnemyBase` 55, `auraHostileEnemyWorthWeight` 2,
   `auraHostileOwnPenalty` 70, `auraNoTargetPenalty` 50,
   `auraLosesKeywordsWastedPenalty` 80, `auraProtectionNoThreatPenalty`
   40, `auraProtectionBase` 20, `auraProtectionThreatWeight` 12.
2. `scoreCommand`: literały → `P.<klucz>`; zero zmian logiki (ADR 0016 B).
3. `tools/tune-card.mjs`: `DESCRIPTOR_PARAMS.aura = [klucze]` (odmrozić
   rodzynę).
4. Golden-master ZIELONY (domyślne nic nie zmieniły).
5. `test/bot-params.test.js`: niedomyślna wartość REALNIE zmienia wycenę
   (RED→GREEN: cofnięcie wpięcia → czerwony).
6. Bramy: `npm test` + `npm run build`. Push.

### Etap 3 — T4: strojenie rodziny `aura` — commit (tylko jeśli adopcja)
1. Plan: `node tools/tune-card.mjs --card hobble --seeds 2 --rounds 1`
   (plan: deskryptory, tunableParams, talie).
2. Strojenie: `--seeds 12 --rounds 2 --json wynik.json` (pula ≥12 seedów
   — anti-overfitting); plateau win-rate → `--proxy-weight 0.5`; sygnał
   lustrzany `tools/mirror-eval.mjs` (kandydat vs baseline, obaj
   heuristic) — najczulszy.
3. **Adopcja TYLKO z dowodem**: benchmark `node tools/benchmark.mjs
   --seeds 50` przed/po (nowy wariant nie słabszy na próbce regresji) +
   tabela „przed/po" w opisie PR + zmiana `DEFAULT_HEURISTIC_PARAMS` +
   `bot-scoring-snapshot.mjs --write` + progi `bot-benchmark.test.js`
   („zmierzone −15 p.p., tylko w górę") + commit.
4. Brak dowodu → dokumentacja wyniku w raporcie, domyślne NIE ruszane
   (pułapka z docs: „tuner podniósł wynik" na małej próbce to hipoteza).

### Etap 4 — Pętla jakości: oś BOTA (poprawność, logika, optymalność) — commity po znaleziskach
1. 6 partii Żywym Testerem (seeds 3001–3006), talie z aurami + BENCH:
   warhammer-wu ↔ worek-legend, worek-legend ↔ warhammer-wu,
   innistrad-brg ↔ innistrad-wu, wiedźmin ↔ tarkir-bg, theros ↔
   worek-basni, (6.) warhammer-brg ↔ alara. Profile: greedy ×2,
   explorer, defensive, random, greedy.
2. Odczyt: oś 1 (bezsensowne działania bota) + nowa oś wzmocniona:
   poprawność (CR), logika (spójność celu/środków), optymalność
   (wymiany, timing ataku/bloku, użycie many, CELE aur/removalu).
3. Znaleziska → root cause + testy RED→GREEN + anti-overfix; bramki po
   każdym.
4. Jeśli fixy ruszają wyceny bota → szybki profil `node
   tools/benchmark.mjs` (regresja; pełne B0 tylko na komendę).

### Etap 5 — dokumentacja — commit
- `docs/audits/AUDYT_M257R4B_BOT_2026-08-30.md`: fix A (root cause,
  CR 508.1), T1 (lista parametrów, golden-master), T4 (wynik strojenia,
  adopcja/nie), pętla (macierz, znaleziska, zamknięte fałszywe alarmy).
- `docs/PROJECT_HISTORY.md` (etap 6), opis PR #88 (sekcje Etap 6/7 +
  bramki), push.

## Ryzyka / pułapki

- **Kolejność eventów** w `pass_priority` — stąd `pushToState` (wzorzec
  `untapStepTurnBasedAction`); natychmiastowy push przestawiałby log.
- **Golden-master**: auto-przejście może skrócić ślad bota w partiach
  snapshotowych (świadoma regeneracja, nie regresja).
- **T1**: domyślne parametry = stare stałe co do punktu (anti-drift:
  golden-master).
- **T4**: overfitting (pula seedów), nasycony win-rate (proxy/mirror),
  „plateau nawet w lustrze = parametr nie jest dźwignią" — wtedy nie
  adoptować.
- **Scope fixu A**: auto-przejście tylko przy wejściu w krok; edge case
  (atakujący legalni przy wejściu, znikają przed deklaracją) zachowuje
  działający przycisk pustej deklaracji (ścieżka awaryjna, legalna).
- Bash ucina długie wyjścia (L78); pliki z polską treścią edytuj przez
  python3 (ENVIRONMENT §4).
