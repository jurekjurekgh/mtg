# PMSSB-6: odrzut wroga (foe-side discard gain) — plan

Petla Manualnego Strojenia Scoringu Bota (hub: `docs/PMSSB.md`, procedura
krokow 0-7). Re-audyt rodziny "POKRYTEJ" (M202/M408) z NOWYM dowodem
z PMSSB-5: gain foe-side = 0 w cascie (divest/mindstab = czysta baza
50.00; M202 to self-harm, M408 to koszt-odrzutu). M429: jedna rodzina +
fale + piny. Nie tuning maszynowy (ADR 0018).

## Wybor celu (uzasadnienie)

Rejestr BACKLOG pusty (PMSSB-5 zamknela kontry). Cel z forwardow PMSSB-5
(Aneks B/C, hub §PMSSB-5 pkt 7): zysk-foe-side hand-rip NIEWYCENIONY.
Dowod: divest MV1 = 50.00, mindstab MV6 (discard-3!) = 50.00 — bot nie
roznia odrzutu-1 od odrzutu-3, exilu od discardu, pelnej reki od pustej.
PELNA petla (nie mikro): 13 nosicieli, 6 kanalow (spell / ETB /
activated / triggered / rider / loot-self), pytanie o MODEL CENY
(0/3/15/45 — cztery liczby na jeden efekt w roznych kontekstach),
strazniki-fizzle, repricing ridera delusion (hipoteza z dowodem
kasowania PMSSB-5 jako hipoteza zerowa).
Odrzucone: X-na-stosie (mikro, plumbing silnika), lethal-proliferate
(mikro, rzadkie), urgencja-okna (aneks H1, mniejsze).

## Inwentarz (13 nosicieli, weryfikacja programowa)

Spell-rip (5): divest MV1 (reveal, MANDATORY, filtr artifact-or-creature —
fizzle bez celu!), dreams-of-steel-and-oil MV1 (EXILE z reki!), mindstab
MV6 (discard-3, applyTo target), nightsnare MV4 (UP-TO-2, declineAmount 2 —
M299!), toll-of-the-invasion MV3 (mandatory + AMASS-1 rider).
ETB-rip (1): hecteyes MV2 (discard_each_opponent-1; ETB-tabela: +3!).
Activated-rip (2): dementia-bat MV5 ({5}+sac-self: discard-2), immersturm-
skullcairn MV0 ({4}{B}{R}{R}+tap+sac: dmg-3 + discard-1).
Self-loot (4): civilized-scholar MV3 (activated tap: draw-then-discard-1),
murder-of-crows MV5 (triggered on-death: draw-then-discard-1),
quicksilver-fisher MV5 (ETB: draw-then-discard-1), talions-messenger MV3
(triggered on-faerie-attack: draw-1 + discard-1 + reflexive +1/+1).
Rider (1): frightful-delusion discardCount-1 (bezwarunkowy; po PMSSB-5 = 0).
Pokryte-guardy: M408 (koszt-odrzutu), M202/G (self-harm 45+2x).

## Rozpoznanie kodu (krok-0)

Cast-leg: 0-dodane (divest/mindstab = 50.00; self-mindstab = -1 = 50-51
= selfHarmPenalty 45+2x3 — matematyka domknieta). ETB-tabela:
discard_each_opponent = +3 (1457), discard_cards = -4x (SELF-koszt!).
Free-cast triage (suspend/rebound/??: 4797/5002/5022): discard_cards =
+15 (proxy-wplywu, jak damage/destroy/mill), draw/gain = +5. Ability-leg:
brak linii discard (prognoza: 0 jak cast). effectIsInertNow: ZERO klauzul
discard/reveal (brak straznikow fizzle!). HOSTILE_PLAYER (45+2x) = TYLKO
selfHarmPenalty (3548) + klatwy-aury (3826) — strona grozby, nie zysku.

## Hipotezy H1-H9 (status po krok-1)

- H1: cast-rip = baza-only dla 5 czarow: divest == dreams == mindstab
  == nightsnare == 50 (toll = 50 + amass?).
- H2: brak straznikow: divest vs reka-bez-celu (same landy) = 50 (slepy
  fizzle!); mindstab vs pusta = 50; nightsnare vs same-landy = 50.
- H3: brak premii exilu (dreams == divest mimo wygnania).
- H4: brak skali ilosci (mindstab-3 == divest-1).
- H5: ability-rip (bat/skullcairn): koszt-ignorowany albo 0-dodane
  (nietoperz-sac za nic?) — pomiar.
- H6: balagan L41: ETB-rip +3 vs cast-rip 0 vs free-cast +15 (3 liczby!).
- H7: self-loot (scholar/crows/fisher/talions): draw + (-4)? M67? — pomiar,
  potem decyzja IN/OUT (draw-side = rodzina draw DONE).
- H8: rider-delusion = 0 (konsystencja PMSSB-5; repricing = decyzja krok-2,
  hipoteza zerowa = dowod kasowania: hold/fire bez zmian).
- H9: nightsnare up-to-2 bez skali; rider-amass tolla wyceniony? — pomiar.

## Zakres swiadomie OUT

- M408 (koszt-odrzutu) i M202/G (self-harm) — pokryte, guardy.
- Draw-side loota (P.drawCardValue, rodzina draw DONE) — tylko reuse.
- Reflexive talions (+1/+1) — rodzina counterow, tylko reuse counterHostValue.
- Transform scholara — rodzina transform, OUT.
- Nowe karty do katalogu (zakaz wlasciciela); talie bez zmian.

## Kroki 0-7 (hub)

0. Plan (ten plik) + commit + push. 1. Sonda PRZED
(`tools/pmssb6-discard-sonda.mjs`) + status H1-H9 (Aneks A). 2. Audyt:
MODEL CENY odrzutu-1 (selekcja+info+tempo vs symetria-45 vs ETB-3) +
strazniki + macierz + findingi F (Aneks B). 3. Fale + piny
`test/pmssb6-discard-wave-*.test.js`. 4. Sonda PO (diff). 5. Eval: full
suite + golden (churn TOLEROWANY z wyjasnieniem co-do-flipa jak PMSSB-4A;
alarm gdy niewyjasniony) + tie-audit. 6. Docs: Aneks C + hub (§PMSSB-6 +
rejestr) + PROJECT_HISTORY. 7. Bramy + push po kazdym kroku.

## Aneks A: pomiar PRZED (`tools/pmssb6-discard-sonda.mjs`, 25 sond)

| Sonda | Wynik | Prognoza |
|---|---|---|
| D00 widok reki wroga | [{},{},{}] — TRESC ZAKRYTA, licznosc jawna | blind TAK |
| D01 5 czarow vs reka-3 | divest/dreams/mindstab/nightsnare 50; toll 59 (+9 amass) | 50 TAK |
| D02 5 czarow vs PUSTA | WSZYSTKIE 50 (toll 59) — rzuca w pustke! | 50 TAK |
| D03 divest vs same-landy | 50 (blind-by-rules, nieuniknione) | 50 TAK |
| D04 hecteyes-rzut | 65.7 (cialo + ETB-rip +3 zyje!) | pomiar |
| D05/D05b bat ({5}+sac: rip-2) | +2 vs reka-3 == +2 vs PUSTA (sac w pustke!) | pomiar |
| D06/D06b skullcairn (dmg3+rip) | -58 vs reka == -58 vs pusta (stabilne trzymaj) | pomiar |
| D07a scholar-loot (tap) | +8 (po fillLibrary; wczesniej -118 = artefakt deckout!) | pomiar |
| D07b fisher-rzut (ETB-loot) | 74.70 (po fillLibrary; wczesniej -38.7 = artefakt) | pomiar |
| D12 self-target | divest +3 (= 50-47), mindstab -1 (= 50-51), nightsnare brak oferty self (opponent-only) | +3/-1 TAK |
| D15 divest vs 1 vs 7 kart | 50 == 50 (brak skali rozmiaru) | rowne TAK |
| D16 toll vs pusta | 59 (sam amass, poprawne) | pomiar |

Status H1-H9: H1 POTWIERDZONA (4x50 + toll 50+9). H2a POTWIERDZONA
(pustka-niewidzialna: cast I ability; mindstab MV6 w pustke!).
H2b = BLIND-BY-RULES (D00: tresc zakryta — NO-F z koniecznosci).
H3 POTWIERDZONA (dreams == divest, brak premii exilu). H4 POTWIERDZONA
(mindstab-3 == divest-1; D15: 1-karta == 7-kart). H5: bat +2 (STRZELA,
nawet w pustke!), skullcairn -58 (trzyma stabilnie). H6 POTWIERDZONA
(ETB +3 vs cast 0 vs free-cast +15 — 3 liczby + grozba-45). H7: loot
+8 (scholar) / ETB-loot w fisherze (dekompozycja w krok-2). H8: rider-
delusion = 0 (guardowany pinami PMSSB-5; repricing = decyzja krok-2).
H9: nightsnare bez skali (50); amass-tolla +9 (osobny efekt, poprawne).
## Aneks B: audyt + fale (krok-2)

MODEL CENY (jedna funkcja `foeRipValue`, L41): kotwica przeplywu-kart
(draw +6 = P.drawCardValue): blind-1 (wrog wybiera najgorsza) = +4
(lustro kosztu-self -4 z tabeli ETB!); reveal-1 (JA wybieram + info) =
+6 + 2 (info = polowa scry-4) = +8; exile-reka = reveal (8, bez stalej
premii — wyzszosc dreams NIESIE noga-grobowa +6 (wybor z jawnego grobu,
bez info)); cap: min(n, jawny-licznik-reki) (D00: licznosc jawna!).
Symetryczne-45 ODRZUCONE: 45 to strona ryzyka (awersja do straty wlasnych
kart — inna decyzja, wzorzec tap-45-vs-M237/2 z PMSSB-5). Wyniki: divest
58, dreams 58/64 (grob!), mindstab 62 (cap!), nightsnare 66, toll 67
(8+9), hecteyes +4 (zamiast +3), bat 2+8-11 = -1 (flip!), skullcairn
-58 -> -54 (stabilne), delusion-rider +4 (blind-cap!).

FALA A (jedyna): F-A1 helper + cast-leg (zamiast 0) + ETB discard_each
3->4; F-A2 strazniki-fizzle w effectIsInertNow (rip-w-cel + pusta-reka-
celu -> inert; dreams: pusta-reka I grob-bez-celu; self-aim symetrycznie)
-> cast -70 / ability -40 / modal -40 / suspend -40 (przeplywy ISTNIEJA,
zero nowych kar!); F-A3 galaz-discard w ability (helper + sac-self
SKALOWANY sacValue P*2+T+MV (L41-severed-5639!) — flat-4 zalamuje sie na
nietoperzu; token/draw/mana-flatow NIE ruszamy (dzialaja, spiete pinami));
F-A4 rider-delusion (helper-blind-cap; piny PMSSB-5 BEZPIECZNE: K06 ma
pusta-reke -> +0!; E7/D2 cale (90>>4); dowod kasowania zyje (X>=0)).
Toll-vs-pusta = 59 BEZ ZMIAN (amass ratuje przed inert!); dreams-vs-pusta-
reka+pelny-grob = 56 (grob ratuje!); bat-vs-pusta = -40 (guard!).

NO-F: H2b blind-by-rules (D00: tresc zakryta — sklad-reki niewidzialny
Z PRZEPISOW); loot-self (+8/+6, ordering-only, bez misfire; rozjazd
combined-+6 vs split-+2 = forward "loot-net-unification"); triage-+15
(1 nosiciel (mindstab-suspend!): znak-dobry + magnituda-inertna + guard-
automatyczny); mayFire-50 (konwencja-znaku, decking-guard -100 zyje);
crows/talions (granica PMSSB-3: tresc-triggerow = 0); transform/tap/mana
(OUT); evangel-split (forward z lootem); margines-bat -1 (cienki przez
mana-OUT — forward!). Mechaniki silnika (dreams: reka+grob, creature/
artifact; toll/nightsnare: nonland-domyslny; divest: artifact-or-creature)
POTWIERDZONE w effects.js (6464/6376) — model je szanuje.

Falsyfikator: sonda-PO diff = DOKLADNIE ruchy-modelu + holdy-guardow
(wyliczone w Aneksie C); ~20 pinow; golden: churn PRZEWIDZIANY maly-
lub-zero (para ravnica|innistrad-wu niesie TYLKO delusion (rider+4-cap!);
reszta ripow poza para) — regeneracja TYLKO z wyjasnieniem co-do-flipa
(precedens PMSSB-4A +2.0), inaczej ALARM. Benchmark bezpieczny
(determinizm, nie jakosc).
## Aneks C: wyniki (krok-3/4/5)

Fala A (`a793b91`, JEDYNA): F-A1 helper `foeRipValue` (blind-4/reveal-8/
grob-6, cap-min) + cast-leg + ETB 3->model; F-A2 guardy w
effectIsInertNow (cast -70 / ability -40 / modal -40 / suspend -40 —
przeplywy ISTNIALY); F-A3 galaz-ability (helper + sac-SKALOWANY sacValue);
F-A4 rider-delusion (blind-cap). Zero pokretel. 20 pinow
(`test/pmssb6-discard-wave-a.test.js`). Sonda PO: D01 58/58/62/66/67,
D02 -70x4 + toll-59 + mindstab->suspend(emergent!), D04 63.0 (cap-0!),
bat +2->-1 (FLIP!), skull -58->-54/-58, D07 bez zmian, D12 bez zmian,
delusion-live 54 — falsyfikator spelniony (wszystkie ruchy = model+guardy;
D06b/D04-korekty prognoz udokumentowane: cap i waga-x0.9!).
LEKCJA-x0.9: cast_permanent mnozy WYNIK x0.9 (wagi-rodzin B4,
heuristic-weights.js: permanent 0.9!) — hecteyes 63.0/66.6 (nie 70/74);
piny licza jawnie. Golden: 1 mecz (dominaria-brg|mirrodin-wu@1000):
decyzje 264=264, kinds IDENTYCZNE, scoreSum +8.0 = DOKLADNIE decyzja #14
(mindstab-t2 vs 2-karty: 50->58); 5 meczow bit-identycznych; fixture
--write z wyjasnieniem. (Przewidywano delusion/ravnica — trafiono
mindstab/dominaria: klasa ta sama (rip-delta), para inna — blad prognozy
pary odnotowany.) Tie-audit: 12709 decyzji, 660 tie_top (208 realnych,
11.1%) — ZERO tie z ripem; klasy pre-existing (block/land).
NO-F: H2b-rules, loot (forward "loot-net-unification": combined-+6 vs
split-+2 vs M67-5), triage-+15 (martwy-procz-mindstab-suspend: znak-dobry
+ guard-automatyczny!), mayFire-50 (konwencja-znaku), triggery (granica
PMSSB-3), transform/tap/mana (OUT), amass-cast9-vs-ETB6 (pre-existing,
forward-amass!), margines-bat (mana-forward).
Suit 6757/6757 GREEN. Rodzina ZAMKNIETA (re-: tylko z nowym dowodem).
