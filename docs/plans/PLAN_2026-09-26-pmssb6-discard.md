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

## Aneks A: pomiar PRZED (do wpisania po krok-1)
## Aneks B: audyt + fale (do wpisania po krok-2)
## Aneks C: wyniki (do wpisania po falach)
