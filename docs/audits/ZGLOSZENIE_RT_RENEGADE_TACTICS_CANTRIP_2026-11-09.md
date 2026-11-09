# Zgłoszenie RT — Renegade Tactics: cantrip nie przepala ridera `cant_block`

Data: 2026-11-09 · PR sesji: **#184** · gałąź: `arena/76d4141f-mtg`
Prefiks pinów: **RT** (litera U zajęta: `U/1–3` vestige, `U/A–C` audit).
Plan: `docs/plans/PLAN_2026-11-09-renegade-tactics-cantrip.md`.

## 1. Zgłoszenie właściciela

> Bot rzuca ją mimo, że przeciwnik nie ma żadnej kreatury na stole.
> Rzuca tylko po to, żeby dobrać kartę. To trochę marnowanie potencjału
> tej karty.

Oczekiwane: bot trzyma Renegade Tactics, gdy rider `cant_block` nie kupuje
realnej wartości w oknie walki; nadal rzuca, gdy wyłączenie blokera pomaga
atakowi. Zakres: wyłącznie wycena bota, generycznie po deskryptorze
(ADR 0002). Bez zmiany legalności/silnika/katalogu/stołu.

## 2. Karta i podstawa regułowa

`renegade-tactics` (CMR, {R}, Sorcery): `targets: [{ type: 'creature' }]`,
efekty `cant_block` + `draw_cards: 1`. Oracle:

> Target creature can't block this turn.
> Draw a card.

Ruling WotC 2020-11-10 (`docs/cards/scryfall-renegade-tactics.json`):

> If the target creature is an illegal target by the time Renegade Tactics
> tries to resolve, the spell doesn't resolve. You don't draw a card.

CR (wydanie 2026-11-06, mirror `nwgarne/mtg-data`, SHA-256
`d7cdcc11f2b7ab88b1164791dd0cafb6bf0c4e1f0863e0ee6abca2d3a7fb7674`):

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
- **608.2b** (fragment): „If all its targets, for every instance of the word
  “target,” are now illegal, the spell doesn’t resolve. It’s removed from
  the stack and, if it’s a spell, put into its owner’s graveyard.”

Wniosek: cel „creature” obejmuje także własnego stwora (legalność poprawna).
Zakaz blokowania ma wartość tylko przy realnym ataku bota i celu, który mógł
by zablokować któregoś atakującego. Sorcery z ręki rzucamy w main1; okna
BoC/po deklaracji pinujemy syntetykiem instant/zdolności, nie Renegade.

## 3. Diagnoza (sonda przed fixem)

`.arena/probe-renegade.mjs` → `.arena/u-probe-3.log` (prawdziwa karta +
rejestr). Scena K pierwszego przebiegu była niemiarodajna (`cantBlock`
zrzucony przez kontrakt `addObject`); poprawiona flaga po dodaniu obiektu.
Scena G (tura wroga) zwróciła `concede` — artefakt harnessu, usunięta
z dowodów.

| Scena | Wybór PRZED | Score | Wybór PO | Score PO |
|---|---|---:|---|---:|
| A wróg 0 stworów, ja 3/3 | cast → **własny** | 36 | pass | −84 |
| B pusty stół obu stron | pass (brak celu) | 0 | pass | 0 |
| C wróg tapnięty 4/4 | cast → foe | 36 | pass | −84 |
| D wróg 3/3, ja bez stworów | cast → foe | 36 | pass | −84 |
| E wróg 3/3, ja 3/3 | cast → foe | 62 | cast → foe | **62** |
| F main2 | cast → foe | 36 | pass | −84 |
| H chump 1/1 + killer 5/5 | cast → killer | 71/59 | cast → killer | **71/59** |
| I biblioteka 1 | pass (deck-out) | −90 | pass | −210 |
| J free-cast z ręki, wróg 0 | cast → własny | 45 > 4 | decline | −75 < 4 |
| K wróg już z `cantBlock` | cast → foe | 36 | pass | −84 |
| L flying vs naziemny | cast → foe | 36 | pass | −84 |
| N choroba przywołania | cast → foe | 36 | pass | −84 |
| O własny 0/3 | cast → foe | 36 | pass | −84 |
| Epic Experiment, wróg 0 | cast z wygnania | 75 > 0 | cast z wygnania | **75 > 0** |
| Discover, wróg 0 | cast za darmo | 60 > 20 | do ręki | **20 > −60** |

**Root cause:** `UTILITY_EFFECT_TYPES` zna `cant_block`, ale obecność
`draw_cards` wyklucza bazę utylitarną → `spellBase` 50. Gałąź `cant_block`
dodaje `removalValue ?? -20`; draw ~+6. Przy jałowym riderze
`50 + 6 − 20 = 36 > pass 0`. Komentarz Batch60 („cantrip za 1 manę i tak
grywalny”) cementował zgłoszone zachowanie (L181). Bliźniak
`activate_ability` miał ten sam fallback; `resolve_hand_free_cast` nie
wyceniał ridera wcale (45 > skip 4). Okno ataku było duplikowane inline
w `cast_spell` zamiast czytać `attackWindowAttackerIds` (L41).

Skan katalogu: jedyna karta z `cant_block` + `draw_cards` w jednej liście
efektów to `renegade-tactics`. Reguła pozostaje generyczna po kształcie.

## 4. Naprawa (commit `fae5ffb`)

Wyłącznie `src/controllers/heuristic-bot.js` + `heuristic-params.js`:

1. `cantBlockTargetValue(view, victim, attackerIds)` — jedna miara celu:
   wróg, nietapnięty, bez `cantBlock`, realny bloker któregoś atakującego
   (`cantBlockRemovalValue`). `null` = rider jałowy.
2. `cantBlockCantripHoldPenalty(view, effects, cmd)` — kara **120**
   (nowe pokrętło `cantBlockCantripHoldPenalty`, ×0 = stan sprzed fixu)
   tylko dla listy złożonej wyłącznie z `cant_block` + `draw_cards`, gdy
   predykat celu zwróci `null` w oknie `attackWindowAttackerIds`.
   Dodatkowe payloady (damage/removal/…) nie są objęte karą.
3. `cast_spell` i `activate_ability` czytają ten sam predykat i okno
   (koniec inline duplikatu) oraz odejmują karę. `resolve_hand_free_cast`
   i `resolve_discover_choice` (alternatywa zachowuje kartę w ręce)
   odejmują tę samą karę.
4. **Granica ekonomiczna:** okna, w których odmowa traci kartę bezpowrotnie
   (Epic Experiment / suspend / rebound, `freeCastEffectsScore`), nie
   dostają kary — tam dobór jest odzyskiem, nie przepaleniem potencjału
   (pin RT/18). Grave/madness/Vaan bez zmian (osobna ekonomika alternatywy).

Bez zmian w `src/engine/`, `src/cards/`, `src/table/`, deckach i golden
fixture. Parametr 120 to świadoma zmiana strategii za zgodą zgłoszenia,
nie ekstrakcja stałej; golden fixture nie zawiera kaladesh/renegade, więc
4/4 bez regeneracji.

## 5. Piny RT/1–21 (RED → GREEN)

`test/zgloszenie-rt-renegade-tactics-cantrip.test.js`:
**RED 13 fail / 8 pass** (`.arena/rt-pins-red.log`) → **GREEN 21/21**
(`.arena/rt-pins-green.log`). Zielone od startu: anty-over-fixy
(RT/2, 12–14, 17–19, 21) i legalność silnika.

- RT/1–9: hold przy pustym stole wroga (cel własny), pustym stole obu stron,
  tapniętym, już `cantBlock`, main2, bez własnych stworów, choroba
  przywołania, 0 mocy, flying vs naziemny.
- RT/10: free-cast z ręki → decline, karta zostaje.
- RT/11: Discover → „do ręki”, nie rzut.
- RT/12–14: realny bloker cast + cantBlock + cantrip; killer > chump;
  tapnięty nie wygrywa z realnym.
- RT/15: syntetyk instant — BoC i po deklaracji cast, main2 hold.
- RT/16: syntetyk aktywowany `draw4` — hold bez ataku, aktywacja przy ataku.
- RT/17: `damage+cant_block+draw` dobija tapniętego 3/3 (kształt niekarany).
- RT/18: Epic Experiment nadal rzuca (odmowa = grób).
- RT/19: czysty cantrip draw-only nadal rzucany.
- RT/20: parametr default 120, klucz w rejestrze, ×0 przywraca dawny rzut.
- RT/21: cel we własnego stwora nadal legalny i rozstrzyga się z doborem.

## 6. Mutacje ze świadkami

`.arena/mutate-rt.py` → `.arena/mut-rt-summary.log`; kopia pliku przed
edycją, przywrócenie + sha256 + `git status` czysty po każdej mutacji.

| Mutacja | Zmiana | Świadek RED | Wynik |
|---|---|---|---|
| mRT1 | kara usunięta z `cast_spell` | RT/1 (+3–9,15,20) | RED |
| mRT2 | brak bramki kształtu (kara dla każdego `cant_block`) | RT/17 | RED |
| mRT3 | brak guardów celu (tapped/cantBlock/własny) | RT/3, RT/4 | RED |
| mRT4 | okno tylko declared-attack w casterze | RT/13 (killer>chump) | RED |
| mRT5 | kara usunięta z `resolve_hand_free_cast` | RT/10 | RED |
| mRT6 | kara usunięta z `activate_ability` | RT/16 | RED |
| mRT7 | pokrętło odcięte (stała 120 zamiast `P.…`) | RT/20 | RED |
| mRT8 | kara dodana do Epic Experiment | RT/18 | RED |

GREEN po przywróceniu: 21/21. Pierwsza wersja mRT4 celowała w RT/12 —
przy declared-only cast nadal zachodził (hold helper liczył realnego
blokera osobno), ale tracił różnicowanie celów; świadkiem jest RT/13.
Mutacja GREEN bez świadka nie była uznana za dowód.

## 7. Bramy

- `npm test`: **10231/10231**, fail 0, skipped 0 (`.arena/rt-test-fast-fix.log`).
- `npm run test:all`: **10500/10500**, fail 0, skipped 0, EXIT 0
  (~457 s; `.arena/rt-test-all.log`).
- `npm run build`: **78 modułów / 5822,4 kB** (`.arena/rt-build-final.log`).
- Sąsiednie: batch60/M221/PMSSB-40/FJ/wrap/params/golden **148/148**,
  Inspiration **16/16**; golden-master **4/4** bez `--write`.
- Strażnicy dokumentacji/CR/card-agnostic: **96/96**
  (`.arena/rt-docs-guards.log`).
- `node tools/cr-numery.mjs --cr .arena/cr-current.txt`: **OK**,
  tabela 576 numerów, kod 556 unikalnych w 6621 cytatach.

## 8. Commity i stan

- `3b4af41` — plan RT (push przed kodem).
- `fae5ffb` — fix + piny RT/1–21 + plan etapy 2–4.
- dokumentacja końcowa (ten raport, plan [x], HISTORY, HANDOFF §12)
  + kumulatywny PATCH PR #184.

PR **#184** open/mergeable; bez merge/main/force push, bez pełnego B0.
Następna sesja: po scaleniu #184 audyt #184 wg ADR 0020; kolejka
właściciela (ADR 0021). `.arena/` ulotne — dowody odtwarzać z seedów/testów.
