# PLAN 2026-08-26 — Paczka błędów z realnej gry (A–G)

- **Sesja:** `arena/01a03e9e-mtg`
- **PR:** #83 (bieżący, kontynuacja)
- **Baza:** `main` @ #81 (50f304f); gałąź na `be01add`. `npm test` 3384/3384,
  build 54 / 2722.0 kB.
- **Tryb:** ADR 0020 A–D (plan → commit po każdym błędzie) + ADR 0021.
- **Zlecenie:** 7 zgłoszeń właściciela z realnej gry (A–G). Commit po każdym
  naprawionym błędzie. Może nie zmieścić się w jednej sesji — plan pokazuje
  stan (odhaczanie). Dla KAŻDEGO błędu sprawdzić podobne karty/mechaniki.

## Nienegocjowalne zasady dla tej paczki
- Bot czyta WYŁĄCZNIE `PlayerView` (ADR 0017/L1) — brakujące pole dodać do
  widoku, nie sięgać do stanu.
- Reguły generyczne po deskryptorach, ZERO nazw/ID kart (ADR 0002).
- Kara musi przebić premię (L3). Efekt „do końca tury" wyceniać z oknem (L42).
- Każdy fix: test RED→GREEN (L61), potem `npm test`+`npm run build`, commit+push.
- Zmiana bota → `node --test test/bot-benchmark.test.js` (bez regresji).
- Po każdym błędzie: przegląd RODZEŃSTWA (L41/L72) — inne karty tej klasy.

## Rozpoznanie (stan kodu przed pracą)

| Błąd | Klasa | Miejsce naprawy (wstępnie) |
|---|---|---|
| A | bot: `cant_block` (Panic Spellbomb) używane bez własnego ataku | `heuristic-bot.js` — wycena `cant_block` jako combat trick tylko przy własnym realnym ataku |
| B | UI: `resolve_optional_trigger_choice` bez nazwy karty/efektu | `game-state.js` (playerView: `pendingOptionalTrigger`) + `render.js` (`choiceSourceTitle`) |
| C | UI: brak badge koloru protekcji na permanencie z aurą i na aurze | `game-state.js` (view: protectionFromColors) + `render.js` (badge) |
| D | bot: Bladed Sentinel `vigilance` wykupywane w złym oknie/na tapniętym | `heuristic-bot.js` — `keywordGrantWindowValue` gałąź „pozostałe" (vigilance) |
| E | bot: atak/buff/equip stwora blokowanego przez protection od jego koloru | `heuristic-bot.js` — attack scoring + buff/equip: wykryj blokera z protekcją koloru atakującego |
| F | bot: nie używa Trigon of Corruption (−1/−1) mimo wolnej many | `heuristic-bot.js` — wycena `add_counter` (-1/-1) na wrogu + „charge→remove" |
| G | bot: nie atakuje tokenem `cantBlock` (Phyrexian Mite) | `heuristic-bot.js` — attack scoring: `cantBlock` to CZYSTY atakujący, premia do ataku |

## Etapy (1 błąd = 1+ commit)

### Etap 0 — plan (ten commit)
- [x] Rozpoznanie kodu (cards + scoring)
- [x] Plan zapisany
- [ ] Commit + push planu (ADR 0020 A)

### Etap A — Panic Spellbomb: `cant_block` jako combat trick tylko przy realnym ataku ✅ DONE (commit M221/A)
Oracle: `{T},Sacrifice: Target creature can't block this turn.` Sens: użyć,
gdy bot ATAKUJE (po deklaracji atakujących), a cel MÓGŁBY zablokować atakującego.
- [x] Wycena `cant_block` (activated single-effect): premia +8 tylko gdy bot ma
      zadeklarowanego atakującego, którego cel mógłby zablokować; inaczej −20
      (poniżej passu). Odczyt z `view.combat` (ADR 0017), bez nazw kart.
- [x] Rodzeństwo: `creatures_cant_block_this_turn` (Ruthless Invasion) — już
      poprawne (wymaga `readyPower>0`, inaczej −8). `apply_to_each_target`→
      `cant_block` (Wrap in Flames) — wrapper z damage; +8 za wroga jest drobne
      i zdominowane wartością obrażeń, karta nie jest jałowa — zostawione.
- [x] Test RED→GREEN (`test/m221a-panic-spellbomb-cant-block.test.js`);
      `npm test` 3386, build 54/2723.6 kB, benchmark 9/9.

### Etap B — Angel's Feather: etykieta „you may" bez nazwy karty/efektu
- [ ] `playerView`: wystaw `pendingOptionalTrigger { sourceCardId, effect? }`
      właścicielowi decyzji (wzorzec `pendingHandTopChoice`).
- [ ] `render.js`: `choiceSourceTitle` gałąź `resolve_optional_trigger_choice`
      → „<Nazwa> — <opis efektu (you may)>"; etykiety opcji nazwane.
- [ ] Rodzeństwo: inne `optional_trigger_required` (spells.js, triggers.js) —
      Demon's Horn/inne „Feather", gain_life „you may".
- [ ] Test (describe/label) RED→GREEN; `npm test`+build; commit+push.

### Etap C — Benevolent Blessing: badge „Ochrona przed: <kolor>"
- [ ] `playerView`: wystaw `protectionFromColors`/jakość na kaflu permanentu
      (jeśli nieobecne) — informacja publiczna (CR 702.16).
- [ ] `render.js`: osobny badge „Ochrona przed: <kolor>" na permanencie
      (nie tylko w opisie aury), i na aurze.
- [ ] Rodzeństwo: Guildscorn Ward (multicolored), Spare from Evil (subtype),
      morph protekcje — spójność `protectionQualityLabel`.
- [ ] Test render/DOM RED→GREEN; `npm test`+build; commit+push.

### Etap D — Bladed Sentinel: `vigilance` tylko we własnym oknie ataku
Sens: wykupić w SWOJEJ turze przed deklaracją atakujących, gdy stwór ma
zaatakować i jest odkręcony. Inaczej marnotrawstwo (i bez sensu na tapniętym).
- [ ] `keywordGrantWindowValue` gałąź `vigilance` (dziś „pozostałe": +1 w każdym
      oknie walki): premia tylko `myTurn` + przed/na deklaracji atakujących +
      `canAttackNow(recipient)`; inaczej kara. Bez nazw kart.
- [ ] Rodzeństwo: pozostałe keywordy z gałęzi „else" (hexproof…) — czy nie
      dziedziczą tej samej ślepoty.
- [ ] Test RED→GREEN; `npm test`+build+benchmark; commit+push.

### Etap E — świadomość protekcji: nie atakuj/buffuj stwora blokowanego przez protection jego koloru
- [ ] Helper `attackerBlockedByProtection(view, attacker)`: istnieje nietapnięty
      wrogi bloker z protekcją od koloru atakującego, który MOŻE go zablokować
      (`sourceHasProtectionQuality`, kolory atakującego). Wymaga protekcji
      blokera w `PlayerView`.
- [ ] Attack scoring: taki atakujący = futile (0 obrażeń, tylko tapnięcie).
- [ ] Buff/equip/aura na atakującym, którego jedyny sens to obrażenia: kara,
      gdy jest zablokowany przez protekcję (dopóki protekcja żyje).
- [ ] Rodzeństwo: pump (`modify_stats`), grant keywords ofensywne, equip.
- [ ] Test RED→GREEN; `npm test`+build+benchmark; commit+push.

### Etap F — Trigon of Corruption: używaj −1/−1 (i doładowuj) gdy wolna mana
Oracle: `{2},{T},Remove charge: -1/-1 na cel` + `{B}{B},{T}: dołóż charge`.
- [ ] Wycena `add_counter` (`-1/-1`) na WROGIM stworze: czysty zysk (osłabienie/
      zabicie), premia rosnąca przy zabiciu (toughness po counterze ≤ 0).
- [ ] Gdy brak celów / brak charge: doładowanie (`{B}{B}` charge) ma wartość,
      jeśli mana wolna (nie kosztem lepszego zagrania).
- [ ] Rodzeństwo: inne `add_counter` `-1/-1`/wither/`remove charge` (Trigon
      family, Serrated Arrows itp.).
- [ ] Test RED→GREEN; `npm test`+build+benchmark; commit+push.

### Etap G — Phyrexian Mite (cantBlock token): atakuj nim (czysty atakujący)
- [ ] Attack scoring: stwór z `cantBlock` NIE ma wartości obronnej — trzymanie
      go w tyle to strata; premia do ataku (nie ma kosztu alternatywnego bloku).
- [ ] Uwaga: nie kolidować z Etapem E (jeśli Mite atakuje w protekcję —
      to inna sprawa; tu chodzi o to, że cantBlock ma atakować, gdy sensowne).
- [ ] Rodzeństwo: inne `cantBlock`/`defender`-podobne — spójność.
- [ ] Test RED→GREEN; `npm test`+build+benchmark; commit+push.

### Etap końcowy
- [ ] Audyt Żywym Testerem talii z tymi kartami (weryfikacja na artefakcie, L76).
- [ ] Aktualizacja `docs/PROJECT_HISTORY.md` + handoff; podsumowanie w PR.

## Kolejność commitów
1. `M221/0: plan paczki błędów A–G (ADR 0020 A)`
2. `M221/A: Panic Spellbomb — cant_block jako combat trick + testy`
3. `M221/B: Angel's Feather — etykieta you-may nazywa kartę/efekt + testy`
4. `M221/C: Benevolent Blessing — badge koloru protekcji + testy`
5. `M221/D: Bladed Sentinel — vigilance tylko w oknie własnego ataku + testy`
6. `M221/E: świadomość protekcji w ataku/buffie + testy`
7. `M221/F: Trigon of Corruption — używaj -1/-1 i doładowuj + testy`
8. `M221/G: token cantBlock atakuje + testy`

## Ryzyka
- E i G mogą wchodzić w interakcję (Mite atakujący w protekcję) — kolejność:
  G po E, żeby premia „cantBlock atakuje" nie znosiła kary „atak w protekcję".
- E wymaga protekcji blokera w PlayerView — sprawdzić, czy pole istnieje;
  jeśli nie, dodać (ADR 0017), z testem FoW (nie wycieka nic ukrytego).
- Benchmark: BENCH_DECKS nie zawiera większości tych kart (L2) — mierzyć też
  ukierunkowanie i przede wszystkim Żywym Testerem.
