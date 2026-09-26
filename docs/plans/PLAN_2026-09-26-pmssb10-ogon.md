# PLAN PMSSB-10: triggery-ogon (Wave-C rodziny) (2026-09-26)

Wybór celu (krok-0): ogon PMSSB-9 (upkeep/leaves/combat-gated/end/cast/
singletons — ~40 nosicieli) + BACKLOG pusty. ETB/dies/attacks DONE.

## 0. Teza i klastry (krok-0)

MODEL (jak PMSSB-9): anticipated = likelihood × tabela-ETB (L41!).
Likelihood-per-event: combat_gated (bramka-evasion F-T2 × 0.5!),
you_cast (częstość-czarów ~0.5?), upkeep (przetrwanie ~0.5?),
leaves (usuwalność — model-removalu BRAK → ostrożnie!),
end_step (0.5?), singletons (per-event!).

Klastry (census, komenda w historii):
- combat_gated ×4: wrecker (exile!), scrollthief (draw!), robber (token!),
  disa (token!) + curiosity (aura-may-draw!);
- you_cast ×7: jester (cant_block/red!), demon (SACRIFICE-ujemny!),
  windscout/operative/devotee (pump/counters), tellah (big-mix),
  token_wizard (drain!) + guard (another_enters-untap!);
- upkeep ×8: transform ×4 (wilkołaki, warunki dzień/noc!),
  curse/feedback (damage!), page (?), goblin-construct (damage-SELF!),
  ascension (cloak-may!);
- leaves-O-ring ×3 (newt/butcher/abduction — ryzyko UJEMNE!);
- end_step ×5 (canonized/reaver/trostani/rager/brute — warunki!);
- singletons: jyoti (buff-lands!), imp (scry), sword, selhoff (mill),
  harvester, disa-reanimate, willbender, exploit ×2, triton, shaman...

OUT: ETB/dies/attacks (DONE), treść-na-rezolucji (konwencja-50),
mechaniki-silnika (transform/dzień-noc = engine).

## 1. Hipotezy (krok-1)

- **H1 (combat_gated):** bramka-evasion × 0.5 × tabela: wrecker/scrollthief/
  robber/disa/curiosity niosą +2…5 (pin-y!).
- **H2 (you_cast):** 0.5 × tabela (jester/drain/counters!) + demon-UJEMNY
  (sac-anticipacja!) + warunki-kolorów (spellColorsInclude-gate!).
- **H3 (upkeep):** transform = różnica-ciał (post-minus-pre × 0.5?);
  damage-upkeep = 0.5 × damage; SELF-damage = UJEMNE.
- **H4 (leaves):** anticipacja UJEMNA (O-ring-link-risk × usuwalność-0.3?).
- **H5 (end/singletons):** 0.5 × tabela + branki-warunków
  (descended/tapped/day-night/delirium → viewConditionalHolds!).

## 2. Macierz sond (krok-2, `tools/pmssb10-ogon-sonda.mjs`)

O01 wrecker/scrollthief/robber/disa (gated-0?), O02 curiosity-aura,
O03 jester (red-gate?), O04 demon (sac-0?), O05 tellah (big-mix-0?),
O06 outcasts/wantons (transform-0?), O07 curse/feedback (upkeep-damage-0?),
O08 butcher-leaves (risk-0?), O09 canonized/reaver/trostani (end-0?),
O10 jyoti/selhoff/harvester/willbender (singletons-0?), O11 shaman-may
(may-combat?), O12 token_wizard-token (token-bearer?).

## 3. Fale (krok-3+, do potwierdzenia sondą)

- Wave-A (kandydat): F-O1 combat_gated + F-O2 you_cast (table-covered!) +
  piny + golden (ryzyko ŚREDNIE-WYSOKIE: ~15 nosicieli!).
- Wave-B (warunkowa): upkeep-transform + leaves-negatywne + end_step.
- Wave-C (warunkowa): singletons + warunki.
- Ryzyka: (a) likelihood-upkeep/leaves bez modelu (obrona w audycie!);
  (b) transform = mechanika (ciało-post w karcie? transform-data!);
  (c) golden-churn (duży klaster — per-flip!); (d) scope-creep
  singletonów (gate: table-covered-only, reszta forward!).

## Aneks A — ślady krok-0

- Census ogona (~40 nosicieli, 6 klastrów) + treść-efektów.
- Bramka-evasion (F-T2) do reuse; viewConditionalHolds do warunków;
  imminentGain jako precedens may-gate.

## Aneks B — forwardy (WYPEŁNIĆ w closeout)

(none yet)
