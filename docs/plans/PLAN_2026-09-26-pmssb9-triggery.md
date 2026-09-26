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

## Aneks B — forwardy (WYPEŁNIĆ w closeout)

(none yet)
