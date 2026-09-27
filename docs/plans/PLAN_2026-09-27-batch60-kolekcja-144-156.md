# PLAN batch60 — kolekcja 144–156 (10 kart), 2026-09-27

Zlecenie dnia: analiza → plan → kod do wyczerpania budżetu. User testuje AI.
Branch: `arena/01a0d980-mtg`. Baseline: `b18e793` (562 karty, FULL 6641 fast + slow).

## 0. Dane źródłowe (KOMPLET 10/10, set-specyficzne, `set=` obowiązkowe)

| # | Karta | Set | Nr | Rar | Oracle (skrót) | Świat (`plan`) |
|---|-------|-----|----|-----|----------------|----------------|
| 144 | Stensia Innkeeper | EMN | 145 | C | {3}{R} 3/3 Vampire. ETB: tap target land; nie odkręca się w następnym untap | Innistrad |
| 145 | Clone Shell | SOM | 143 | U | {5} 2/2 Shapeshifter. Imprint ETB: obejrzyj top 4, wygnaj 1 zakrytą, reszta na spód w dowolnej kolejności. Dies: odkryj; jeśli stwór → na pole bitwy | The Edge |
| 147 | Renegade Tactics | CMR | 195 | C | {R} Sorcery. Target creature can't block + draw | Kaladesh |
| 148 | Xu-Ifit, Osteoharmonist | EOE | 127 | R | {1}{B}{B} 2/3 Leg. Human Wizard. {T} (sorcery): reanimuj stwora; Skeleton dodatkowo; bez zdolności | The Edge |
| 149 | Blossoming Sands | M20 | 243 | C | Land. Wchodzi tapped. ETB: +1 life. {T}: {G}/{W} | Amonkhet |
| 151 | Revealing Wind | DTK | 197 | C | {2}{G} Instant. Fog + możesz obejrzeć zakryte atakujące/blokujące | Tarkir |
| 152 | Timely Interference | DMU | 70 | C | {U} Instant. Kicker {1}{R}. -1/-0; jeśli kicked → blocks if able; draw | Dominaria |
| 154 | Trigon of Thought | SOM | 217 | U | {5} Artifact. ETB 3 charge. {U}{U},{T}: +counter. {2},{T},-counter: draw | Mirrodin |
| 155 | Demolish | WAR | 123 | C | {3}{R} Sorcery. Destroy target artifact or land | Ravnica |
| 156 | Summary Judgment | RNA | 24 | C | {1}{W} Instant. 3 tapped creature; Addendum (main phase) → 5 | Ravnica |

Rulingi (fetch_page, do pola `rulings` snapshotów):
- Stensia: [] · Sands: [] · Trigon: [] · Demolish: []
- Clone Shell (3): musisz wygnać 1 nawet nie-stwora; nie-stwór zostaje w exile odkryty; cudzy Shell pod Twoją kontrolą — dies działa dla Ciebie, podglądu brak.
- Renegade (1): fizzle celu = brak doboru (standard).
- Xu-Ifit (2): ETB/„as enters" wracającego giną PRZED zastosowaniem; zdolności zyskane PÓŹNIEJ zostają.
- Revealing Wind (1): rzucona też bez zakrytych; fog działa.
- Timely (6): generyczne zasady kickera.
- Summary (2): Addendum sprawdzane PRZY ROZSTRZYGANIU (nie przy rzucie); kopia nigdy nie dostaje bonusu.

`artId`: ŻADNA z 10 nie występuje w `tools/collection-art-ids.csv` → wszystkie BEZ `artId`
(tory FOT/KON spadają na Scryfall; HOW_TO Krok 2 — świadomy brak).

## 1. Rekonesans silnika (co istnieje, czego brakuje)

ISTNIEJE (gotowe do użycia):
- `tap_permanent` + `dont_untap_next_untap_step` (Wavecrash Triton) → Stensia
- `cant_block` (Panic Spellbomb) + `draw_cards` → Renegade
- `entersTapped` + ETB `gain_life` + dual `{T}: Add X or Y` (land ~l.250) → Sands
- Trigon of Corruption = SZABLON 1:1 (entersWithCounters/charge, koszt B,B→U,U, removeCounter) → Trigon (2. efekt: `draw_cards`)
- `destroy_permanent` + cel `artifact_or_land` → Demolish
- Kicker: `kicker: {cost, colors}` + `condition: {wasKicked}` (warunek przy efekcie i triggerze) → Timely (kicker {1}{R} = cost 2, colors ['R'])
- `pump` ujemny, cel `tapped_creature`, efekt `damage` → Timely/Summary
- Exile zakryty + `exiledCardIds` na źródle (Pyxis, batch47) → Clone Shell (wzorzec)
- `reveal_top_to_bottom_order` + `pendingRevealOrder` (Stomping Slabs) → Clone Shell (wzorzec decyzji)
- Trigger `dies`, `reanimate_under_your_control` → Clone Shell / Xu-Ifit (wzorzec)
- Fog częściowy: flaga `preventCombatExceptEnchanted` (game-state init + cleanup + combat.js + fingerprint) → Revealing Wind (wzorzec do sklonowania na pełny fog)
- Main-phase check w spells.js (3 miejsca, bramki sorcery) → Addendum (wzorzec)

BRAKUJE (nowa praca silnikowa):
1. **Addendum** (Summary): silnik nie zapisuje fazy rzutu. Dodać `castDuringMainPhase` (snapshot main-fazy + active player + pusty stos w chwili rzutu — analogicznie do `kicked`) na obiekcie czaru + warunek `{wasCastDuringMainPhase}` (nazwa do ustalenia przy implementacji) + testy: main→5, cudza tura/combat→3, kopia→3 (jeśli silnik wspiera kopie — sprawdzić, inaczej limitation? NIE — limitations ma być puste; kopie prawdopodobnie istnieją, sprawdzić).
2. **Blocks-if-able** (Timely/kicked): brak w combat.js. Nowy efekt `blocks_if_able_until_end_of_turn` (flaga na obiekcie, cleanup EOT) + walidacja w deklaracji blokerów (musi blokować jeśli może — analogia do goad/must-attack, odwrócona strona). Testy: legalny blok wymuszony, błąd przy próbie nieblokowania.
3. **Pełny fog** (Revealing Wind): nowa flaga `preventAllCombatDamage` (init/cleanup/combat/fingerprint — 5 miejsc jak ExceptEnchanted) + efekt `prevent_all_combat_damage_this_turn`.
4. **Prywatny podgląd zakrytych** (Revealing Wind): brak mechanizmu „look" (istnieje tylko reveal publiczny). Nowy efekt: dla każdego atakującego/blokującego face-down stwora zdarzenie `card_revealed` z `privateTo: controllerId` (UI/event-log pokazuje tylko właścicielowi — sprawdzić konsumentów; alternatywa: flaga `lookOnly` + filtracja w fingerprint).
5. **Strip zdolności** (Xu-Ifit): brak „loses all abilities". Nowa flaga na obiekcie (np. `abilitiesStripped`) honorowana przez `effectiveAbilities()` (tłumi PRINTED; granty nadane później działają — zgodnie z rulingiem) + czyszczenie istniejących grantów przy rozstrzygnięciu. Reanimacja: nowy wariant `reanimate_..._no_abilities_skeleton` lub kompozycja efektów (reanimate + strip + subtype). Subtyp Skeleton „in addition" na stałe — sprawdzić trwałe granty subtypu (istnieje tylko until-EOT `becomes_subtype_until_end_of_turn` → prawdopodobnie nowy efekt).
6. **Imprint Clone Shell** (największy): nowy efekt ETB `imprint_top4_exile_one_face_down` + NOWA decyzja pending (wybierz 1 z 4 do wygnania + kolejność reszty na spód) + komenda `resolve_imprint_order` (wzorzec: `resolve_reveal_order`) + dies-trigger `clone_shell_dies` (odkryj; stwór → battlefield pod kontrolą kontrolera triggera; nie-stwór zostaje odkryty w exile). Testy: pełny przepływ, top<4, pusty library?, wybór kolejności, dies ze stworem/nie-stworem, kontrola przeciwnika (ruling 3 — tylko jeśli silnik wspiera przejęcia; sprawdzić).

## 2. Kolejność implementacji (łatwe → trudne, commit per karta lub per 2)

1. Blossoming Sands (szablon) — snapshot + def + testy
2. Demolish (szablon) — jw.
3. Renegade Tactics (szablon) — jw.
4. Trigon of Thought (klon Corruption) — jw.
5. Stensia Innkeeper (2 gotowe efekty) — jw.
6. Summary Judgment (+ Addendum silnik) — jw.
7. Timely Interference (+ blocks-if-able silnik) — jw.
8. Revealing Wind (+ fog + look silnik) — jw.
9. Xu-Ifit (+ strip + subtype silnik) — jw.
10. Clone Shell (+ imprint silnik) — jw.
11. Talie: dopisać 10 kart do singletonów `decks/*.txt` + `test/repo-decks.test.js` (liczności)
12. FULL suite (`test:all`) + push + podsumowanie

Zasada KOREKTY batch59: snapshot wchodzi TYLKO w tym samym commicie co definicja
(D/14 i OW/6 czytają cały katalog — osierocony snapshot = czerwone testy).

## 3. Testy (per karta, `test/real-cards-batch60.test.js`)

Legalny + nielegalny + sanity danych (HOW_TO). Dla mechanik silnikowych (1–6)
dodatkowe testy jednostkowe silnika w tym samym pliku lub dedykowanych
(wzorzec: istniejące `test/real-cards-batchN.test.js`).

## 4. Ryzyka

- Prywatny „look" może wymagać zmian w UI/event-log (poza silnikiem) — jeśli tak, minimalny wariant: zdarzenie z flagą + test silnika; UI w follow-up.
- Kopie czarów (Addendum ruling 2) — jeśli silnik nie ma kopii, warunek „nie-kopia" jest trywialnie spełniony; odnotować w teście/dlaczego.
- Budżet: Clone Shell to ~40% pracy; jeśli budżet padnie wcześniej — dowieźć 1–9 + testy, Shell w następnej sesji.
