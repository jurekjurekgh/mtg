# PLAN PMSSB-9: anticipacja triggerów non-ETB (2026-09-26)

Wybór celu (krok-0): forward PMSSB-8 #1 (future-trigger-anticipation)
+ BACKLOG pusty. Census katalogu: 109× ETB (pokryte tabelą) + ~100
triggerów non-ETB w ~45 typach eventów, z czego bot przy cast-cenie
widzi TREŚĆ tylko 3 eventów-gain (`imminentTriggerGainValue`) i 1
upkeep-damage (token-rider); reszta = 0 (ciało-only!).
Dowód: crows/talions-cast bez anticipacji loota (PMSSB-8).

## 0. Teza i inwentarz (krok-0)

MODEL (hipoteza): anticipated-value = likelihood(event) × effect-value
(reuse tabeli ETB, L41!). Likelihood pryncypialne: dies ≈ 0.5 (stwory
głównie giną), attacks ≈ evasion-aware (0.3–0.7), upkeep ≈ model
przetrwania (istniejący kod? — sonda), ETB = 1.0 (kotwica!).

Top-clustry (content-census, poza pokryciem):
- dies::draw ×4 (spellbomb/prowler), dies::token ×4 (dissenter),
  dies::return_with_counter ×1 (clique-persist!) — 9 nosicieli;
- attacks::advantage (lose_life ×2, exile-top-play ×2, zoraline-reanimate
  ×1), attacks::untap ×3, attacks_alone::exalted ×3 — ~11 nosicieli;
- upkeep::transform ×4 (wilkołaki!), upkeep::damage-curse ×1;
- leaves::return-exiled ×3 (O-ring/banish-RISK — ujemna anticipacja!);
- combat_damage::draw/exile (curiosity/wrecker — evasion-gated!);
- ogon: end_step/cast-spells/another-enters/beginning-combat/... (~30).

OUT: ETB (DONE), gain-imminent (DONE PMSSB-4), treść-triggerów na
REZOLUCJI mayFire (konwencja-50, granica PMSSB-3/6/8 — tylko cast!),
mechaniki-silnika (exalted/transform-rozstrzyganie = engine, nie wycena).

## 1. Hipotezy (krok-1)

- **H1 (dies):** anticipacja dies = 0.5 × wartość-efektu (tabela-ETB):
  prowler/spellbomb (+3-draw!), dissenter (+token!), clique (+persist!).
  Pin: prowler-cast vs vanilla-twin (różnica = anticipacja!).
- **H2 (attacks):** anticipacja attacks = evasion-gated (flying/unblockable
  ≈ 0.7, plain ≈ 0.3?) × wartość: bloodflies/horror (drain!), courser
  (exile-play!), zoraline (reanimate!).
- **H3 (upkeep-transform):** wilkołaki niosą drugą-stronę (ciało-post-transform?).
- **H4 (leaves-O-ring):** anticipacja UJEMNA (banish-risk: strata przy
  usunięciu butchera — mirror O-ring?).
- **H5 (likelihood):** mnożniki z modelu, nie magiczne (dies-0.5 = „połowa
  stworów ginie w grze" do obrony w audycie; evasion-ladder z kodu walki).

## 2. Macierz sond (krok-2, `tools/pmssb9-triggery-sonda.mjs`)

T01 prowler-cast (brak anticipacji? vs vanilla-twin!), T02 dissenter-cast,
T03 clique-cast (persist-niewidzialny?), T04 bloodflies-cast (drain?),
T05 courser-cast (exile-play?), T06 zoraline-cast (reanimate-ETB?+attack?),
T07 outcasts-cast (transform?), T08 butcher-cast (banish-risk?),
T09 curiosity-trigger-live (draw-gated?), T10 geopede-cast (imminent-gain
DZIAŁA? kontrola-pozytywna!), T11 survival-model (istnieje? grepowanie!),
T12 modal-+5-ETB-presence (4977/5119: co to? kontekst!).

## 3. Fale (krok-3+, do potwierdzenia sondą)

- Wave-A (kandydat): F-T1 helper `anticipatedTriggerValue` (likelihood ×
  ETB-table!) + migracja cast_permanent (clustry dies/attacks/upkeep) +
  piny + golden-verify (ryzyko ŚREDNIE: ~20 nosicieli w śladach!).
- Wave-B (warunkowa): leaves-O-ring + combat_damage-gated + ogon.
- Ryzyka: (a) likelihood-magiczne (obrona-modelem w audycie!);
  (b) double-count z mayFire-50 (NIE — cast vs rezolucja, różne decyzje);
  (c) golden-churn (oczekiwany WIĘKSZY niż PMSSB-8 — wyjaśnienie per-flip!).

## Aneks A — ślady krok-0

- Census eventów (109 ETB + ~100 non-ETB / 45 typów) + content-census
  (top-30 wierszy, komenda w historii sesji).
- Pokrycie-bota: ETB (tabela + presence-+5 w modalach 4977/5119),
  gain-imminent (3 eventy), upkeep-damage (token-rider 1393),
  when_you_cast_spell-presence (4065) — reszta ZERO.
- crows/talions (PMSSB-8): body-only, faerie-inwariantne.

## Aneks A2 — wyniki sondy (krok-2/3, audyt WŁASNY)

- T01-TRÓJKA: prowler = piker = game = **64.8 IDENTYCZNE**
  (dies-draw ≡ dies-gain ≡ vanilla — anticipacja-ZERO potwierdzona!).
- T02 dissenter 63.0, T03 clique 71.1 (ETB-reanimate-miss + persist-0!),
  T04 bloodflies 66.6, T05 courser 68.4, T06 zoraline 69.3,
  T07 outcasts 68.4 (transform-0!), T09 scrollthief 63.9 — body-only.
- T08 butcher 63.9 vs oryx-twin 64.8 (−0.9: ETB-bez-celu!);
  T08c +cel = 85.5 (noga-ETB +21.6 ✓ ETB działa; leaves-risk = 0).
- T10 feather 61.2 = 61.2 (kolor-miss → 0 poprawnie; live-case w PMSSB-4).
- T11 survival-model: BRAK. T12 modal-+5 = picker-reanimacji.

Scope-gate: Wave-A = DIES-only (F-T1, najciaśniejszy!); Wave-B = attacks
(evasion-model do zaprojektowania); upkeep-transform/leaves-O-ring/ogon
= forwardy po Wave-B (warunki dzienne, model-removalu — za wcześnie!).

Wave-A-design (F-T1): `anticipatedDiesValue(view, def)` = 0.5 × wartość
efektu (reuse tabeli ETB, L41!) dla triggerów `dies` własnych;
+ nowy wpis ETB `return_with_counter` (persist-clique: rekurencja-ciała
≈ 0.5 × body? — kalibracja w fali!); integracja w cast_permanent
(obok 5398-ETB!). Likelihood-0.5: „połowa stworów ginie" (konserwatywnie;
asumpcja udokumentowana + pin na kształcie!). EXCLUDE: `any_creature_dies`
(selhoff — nie własny-dies!), reflexive-sacrifice (koszt!).
Predykcje: prowler 64.8→67.5 (+2.7 = 3×0.9!), game 64.8→66.x,
dissenter 63.0→65.x, clique 71.1→7x, piker/oryx BEZ ZMIAN.
Golden: ryzyko ŚREDNIE (9 nosicieli; wyjaśnienie per-flip!).

Audyt: H1 GO (Wave-A), H2 GO (Wave-B), H3/H4 FORWARD, H5 AKCEPT
(0.5 z asumpcją + pin).

## Aneks C — wyniki Wave-A/B (closeout)

Wave-A (F-T1, dies): `anticipatedDiesValue` = 0.5 × tabela-ETB.
Prowler 64.8→67.5 DOKŁADNIE (+2.7), game 64.8→65.7 (+0.9),
dissenter 63.0→72.0 (+9: tokenBody-ducha-20, pudło-magnitudy (typowano
+1.5!), kierunek OK), clique 71.1 BEZ ZMIAN (persist-flat-+5 SKIP!),
spellbomb 62.1 (pay-gated SKIP!), selhoff 65.7 (any_dies EXCLUDE!).
Golden: 2× highland-game +0.9 (tarkir@1000 #89 + @1001 #71, score-only,
kinds-identyczne) — fixture `--write` (hash eaa233a7…).
Grzechotka: trajectory-shift s4007-t26-@90 (cross-kind land-vs-spell!) —
ścisła allowlista (max-1 + play_land-w-tie) + forward.
NO-F PMSSB-4 (highland +0) → F (+0.9, flip ZAMIERZONY).

Wave-B (F-T2, attacks): `anticipatedAttacksValue` = 0.5 × bramka-evasion
× tabela (+ impuls +3, exalted +2 — nowe wpisy z obroną!).
Wszystkie PRE-zweryfikowane stashem: bloodflies +1.8, horror +3.6,
courser/caves +1.35, veteran/thistledown +2.7, waveskimmer/benediction
+0.45, zoraline BEZ ZMIAN (pay-SKIP!). Bramka: 71.1-vs-72.0 (delta-0.9!).
E5/1: rosyjskie słowo w komentarzu (wpadka językowa!) → naprawiono.
Golden: 2× veteran +2.7 (ravnica@1000 #59-t6 + #164-t14, fingerprint
68.4027!, score-only) — `--write` (hash 7f92154f…).

Piny: wave-a (10) + wave-b (9) + flipy zamierzone (NO-F-4, guard-A,
rattle-allowlista). Suit: 6798/6798. Zero gałek (0.5/impuls/exalted
z asumpcji + piny-kształtowe).

## Aneks B — forwardy z tej pętli

1. Wave-C-ogon (upkeep-transform (wilkołaki!), leaves-O-ring (banish-risk
   UJEMNY!), combat_damage-gated (curiosity!), end_step/cast/another-enters/
   beginning_combat) — warunki i modele do osobnej pętli.
2. Persist-unification (flat-+5 vs model-0.5×ciało-3.5 — rozjazd!).
3. Pay-trigger-net-model (spellbomby/zoraline: efekt − koszt-płatności).
4. Land-90-drivers + taksonomia cross-kind-ties (rattle-allowlista!).
5. Survival-model (upkeep-likelihood) — nie istnieje w bocie.
6. Evasion-stance-0.5 (atak-co-drugą-turę) — kalibracja z gier (telemetria?).
