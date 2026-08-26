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

### Etap B — Angel's Feather: etykieta „you may" bez nazwy karty/efektu ✅ DONE (commit M221/B)
- [x] `playerView`: wystaw `pendingOptionalTrigger { sourceCardId, effect }`
      właścicielowi decyzji (wzorzec `pendingHandTopChoice`) + FoW dla przeciwnika.
- [x] `render.js`: `choiceSourceTitle` gałąź `resolve_optional_trigger_choice`
      → „<Nazwa> — <opis efektu> (możesz)" (describeEffect, bez nazw kart).
- [x] Rodzeństwo: fix jest GENERYCZNY — każdy `optional_trigger_required`
      (dowolne źródło) dostaje etykietę z tego samego pola widoku, więc cała
      rodzina „you may" naprawiona jednym patchem.
- [x] Test RED→GREEN (`test/m221b-optional-trigger-label.test.js`, 3 testy
      + FoW); `npm test` 3389, build 54/2725.2 kB.

### Etap C — Benevolent Blessing: badge „Ochrona przed: <kolor>" ✅ DONE (commit M221/C)
- [x] `playerView`: kafel permanentu niesie `protection` (jakości z
      `effectiveProtectionQualities`) — informacja publiczna (CR 702.16),
      tylko gdy niepusta (bez szumu).
- [x] `render.js`: helper `protectionBadges` + osobny badge „Ochrona przed:
      Czarny" na kaflu (tileInfo `protection` → flags).
- [x] Rodzeństwo: badge generyczny po deskryptorze jakości — kolor, multicolored,
      subtype, notSubtype (Guildscorn Ward/Spare from Evil/morph obsłużone tym
      samym kodem).
- [x] Test RED→GREEN (`test/m221c-protection-badge.test.js`, 3 testy);
      `npm test` 3392, build 54/2727.5 kB.

### Etap D — Bladed Sentinel: `vigilance` tylko we własnym oknie ataku ✅ DONE (commit M221/D)
- [x] `keywordGrantWindowValue` — nowa gałąź `vigilance`: premia (2+toughness)
      tylko gdy atakuje ALBO moja tura + gotowy do ataku (odkręcony, main1/
      beginning_of_combat/declare_attackers); inaczej −10. Po STANIE, nie po
      nazwie kroku (L42/L64), bez nazw kart.
- [x] Rodzeństwo: gałąź `else` została dla hexproof itp.; vigilance ma teraz
      własną, bo jako jedyna z tej grupy zależy od gotowości do ATAKU. Helper
      wspólny dla czarów i zdolności (L41) — spell +1/+0+vigilance też objęty.
- [x] Test RED→GREEN (`test/m221d-vigilance-window.test.js`, 3 testy);
      `npm test` 3395, build 54/2728.7 kB, benchmark 9/9.

### Etap E — świadomość protekcji: nie atakuj/buffuj stwora blokowanego przez protection jego koloru ✅ DONE (commit M221/E)
- [x] Helper `attackerNeutralizedByProtection(attacker, blockers)`: nietapnięty
      wrogi bloker z protekcją od koloru atakującego, mogący go zablokować
      (`sourceHasProtectionQuality`, kolory z widoku). Korzysta z pola
      `protection` w PlayerView dodanego w Etapie C.
- [x] Attack scoring: taki atakujący = futile (perAttacker −2, futileAttackers++)
      — pierwsza gałąź, przed `!canBeBlocked`/immune.
- [x] Equip: kara −8 za equipment na neutralizowanym atakującym, chyba że daje
      EWAZJĘ omijającą blokera (flying vs nielatające).
- [x] Rodzeństwo: pump — `pumpChangesOutcome`/`simulateCombat` nie modelują
      protekcji; główny objaw (atak+equip) pokryty. Pump w protekcję to temat
      na osobny krok, jeśli wróci w audycie (odnotowane).
- [x] Test RED→GREEN (`test/m221e-protection-awareness.test.js`, 3 testy:
      kolor atakującego / inny kolor / brak protekcji); `npm test` 3398,
      build 54/2731.7 kB, benchmark 9/9.

### Etap F — Trigon of Corruption: używaj −1/−1 (i doładowuj) gdy wolna mana ✅ DONE (commit M221/F)
Oracle: `{2},{T},Remove charge: -1/-1 na cel` + `{B}{B},{T}: dołóż charge`.
- [x] Wycena `add_counter` DEBUFF (`-1/-1`, `-0/-1`, `-1/0`, `stun`) na WROGIM
      stworze: czysty zysk (osłabienie 10+4·amount, zabicie 30+2·power gdy
      licznik obniża toughness ≤ pozostała). Na WŁASNYM: −90. Wcześniej `-1/-1`
      wpadał w gałąź liczników zasobowych bez konsumenta → −25 (bot nigdy nie
      używał zdolności).
- [x] Doładowanie (`add_counter charge`) ma bazę +2 (nad passem) i jest jedyną
      ofertą, gdy brak wrogich celów — bot recharge'uje przy wolnej manie.
- [x] Rodzeństwo: reguła generyczna po deskryptorze (minus/stun w nazwie
      licznika) — obejmuje wszystkie karty add_counter -1/-1 i stun (1740,
      1896, 7623). `stun`/`-1/0` NIE liczone jako lethal (nie zmniejszają
      toughness).
- [x] Test RED→GREEN (`test/m221f-trigon-debuff-counter.test.js`, 2 testy);
      `npm test` 3400, build 54/2733.1 kB, benchmark 9/9.

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
