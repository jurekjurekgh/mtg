/**
 * Wstrzymujące grę decyzje, które NIE mają własnej, ręcznie projekowanej
 * pozycji w fingerprint (M103/A1). Do czasu tej naprawy fingerprint je
 * pomijał, więc dwa stany różniące się oczekującą decyzją (np. craft
 * bez wybranego artefaktu) były „identyczne" — to myliło sondę „oferta bez
 * skutku" i osłabiało weryfikację replayów. Nowe pole wstrzymujące grę
 * MUSI trafić na tę listę (lekcja z M101/B2: zamrożony stan jest częścią
 * stanu gry, ADR 0005).
 */
const PENDING_DECISION_FIELDS = Object.freeze([
  'pendingAbilityActivation', 'pendingAmass', 'pendingColorChoice',
  'pendingEscapeExile',
  'pendingCraftExile', 'pendingDamageAssignment', 'pendingDamageTarget',
  'pendingDestroyEquipment', 'pendingDiscardChoice', 'pendingDiscover',
  'pendingEnterAsCopy', 'pendingEpicExperiment', 'pendingExploits',
  'pendingDevourEtbs',
  'pendingExplore', 'pendingFertileThicket', 'pendingFoodChoice',
  'pendingHandCreature', 'pendingHandTopChoice', 'pendingIndex',
  'pendingLandTypeChoice', 'pendingLibraryPlacement', 'pendingLookTopN', 'pendingSatyrLook', 'pendingRevealChoice', 'pendingMadnessCast', 'pendingModalTrigger',
  'pendingMoonlitChoice', 'pendingMulliganBottom', 'pendingMulligans', 'pendingReplacementChoice',
  'pendingOptionalDraw', 'pendingOptionalPay', 'pendingCounterPay', 'pendingOptionalTrigger',
  'pendingPayOrSacrifice', 'pendingProliferate', 'pendingRedirectChoice',
  'pendingRevealExile', 'pendingRevealOrder', 'pendingSearchChoice',
  'pendingSpellReturnToHand', 'pendingSpringbloom', 'pendingReboundCast',
  'pendingTriggerTargets', 'pendingSpellDiscounts',
]);

/** Serializacja odporna na Map/Set wewnątrz struktur decyzji. */
function stableStringify(value) {
  return JSON.stringify(value, (key, v) => {
    if (v instanceof Map) return { __mtgMap: [...v.entries()] };
    if (v instanceof Set) return { __mtgSet: [...v] };
    return v;
  });
}

/**
 * Stabilna, czytelna reprezentacja stanu do porównywania replayów.
 * Nie jest mechanizmem bezpieczeństwa ani skrótem kryptograficznym.
 */
export function stateFingerprint(state) {
  const objects = [...state.objects.values()]
    .map(({ id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, abilities, plot, plotted, tapped, summoningSickness, damage, powerModifier, toughnessModifier, chosenTargets, counters, faceDown, keywords, keywordGrants, abilityGrants, typeGrant, subtypes, transformTo, untapLockedBy, types, entersTapped, attachedTo, baseKind, bestow, aura, equipment, backup, colors, phyrexianManaCost, goaded, goadedUntilTurn, detained, detainedUntilTurn, hexproofUntilTurn, enchantPlayer, enchantedPlayerId, cantBlock, cantBlockPrinted, cantBeBlocked, lostKeywordsUntilEOT, subtypesBeforeOverride, madnessReady, manifestReady }) => ({
      id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, plot, plotted, tapped, summoningSickness, damage, powerModifier, toughnessModifier, chosenTargets,
      abilities: abilities ?? [],
      counters: { ...(counters ?? {}) }, faceDown: Boolean(faceDown),
      keywords: [...(keywords ?? [])], keywordGrants: [...(keywordGrants ?? [])], abilityGrants: abilityGrants ?? [], typeGrant: typeGrant ? { subtypes: [...typeGrant.subtypes] } : null, subtypes: [...(subtypes ?? [])],
      types: [...(types ?? [])], entersTapped: Boolean(entersTapped),
      enchantPlayer: Boolean(enchantPlayer), enchantedPlayerId: enchantedPlayerId ?? null,
      attachedTo: attachedTo ?? null, baseKind: baseKind ?? null,
      bestow: bestow ? { cost: bestow.cost } : null,
      aura: aura ? { keywords: [...(aura.keywords ?? [])] } : null,
      equipment: equipment ? { equip: equipment.equip } : null,
      backup: backup ? { counters: backup.counters } : null,
      transformTo: transformTo ? { cardId: transformTo.cardId, power: transformTo.power, toughness: transformTo.toughness } : null,
      untapLockedBy: [...(untapLockedBy ?? [])],
      colors: [...(colors ?? [])], phyrexianManaCost: phyrexianManaCost ?? 0,
      goaded: Boolean(goaded), goadedUntilTurn: goadedUntilTurn ?? null, detained: Boolean(detained), detainedUntilTurn: detainedUntilTurn ?? null, hexproofUntilTurn: hexproofUntilTurn ?? null,
      // M122/#1: efekty „do końca tury" zmieniające MOŻLIWOŚĆ blokowania
      // (`cant_be_blocked` — Coralhelm Guide; `cantBlock` — Panic Spellbomb)
      // były pomijane w odcisku. Skutki: (a) sonda „oferta bez skutku"
      // raportowała fałszywe „brak skutku" dla legalnej, działającej
      // zdolności, (b) dwa stany różniące się prawem do blokowania miały
      // identyczny fingerprint, więc weryfikacja replayów ich nie odróżniała.
      // M187/N1: wydrukowane „can't block\" (token Mite) jest TRWAŁE i musi
      // być w odcisku niezależnie od efektu „until end of turn\".
      cantBlock: Boolean(cantBlock), cantBlockPrinted: Boolean(cantBlockPrinted), cantBeBlocked: Boolean(cantBeBlocked),
      // M159/Z1 (Żywy Tester, klasa M122/#1): stan „do końca tury” i madness
      // na obiekcie też są częścią stanu gry (Wishful Merfolk — utrata
      // keywordów; Revolutionist — gotowość rzutu za madness z exile).
      lostKeywordsUntilEOT: [...(lostKeywordsUntilEOT ?? [])],
      subtypesBeforeOverride: subtypesBeforeOverride ? [...subtypesBeforeOverride] : null,
      madnessReady: Boolean(madnessReady),
      manifestReady: Boolean(manifestReady),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const zones = Object.fromEntries(Object.entries(state.zones).map(([zone, ids]) => [zone, [...ids]]));
  const combat = state.combat
    ? {
      attackingPlayerId: state.combat.attackingPlayerId,
      attackers: [...state.combat.attackers],
      blockers: [...state.combat.blockers.entries()].map(([attackerId, blockerIds]) => [attackerId, [...blockerIds]]),
      blockedAttackers: [...(state.combat.blockedAttackers ?? [])],
    }
    : null;
  return JSON.stringify({
    seed: state.seed,
    status: state.status,
    winnerId: state.winnerId,
    dayNight: state.dayNight ?? null,
    players: state.players,
    turn: state.turn,
    combat,
    zones,
    objects,
    untilEndOfTurnBuffs: (state.untilEndOfTurnBuffs ?? []).map((b) => ({
      controllerId: b.controllerId, opponent: b.opponent,
      // CR 611.2c (M101/B2): zamrożony zbiór obiektów jest częścią stanu gry —
      // dwa stany różniące się tą listą nie są identyczne (determinizm ADR 0005).
      objectIds: Array.isArray(b.objectIds) ? [...b.objectIds] : null,
      objectId: b.objectId ?? null,
      power: b.power ?? 0, toughness: b.toughness ?? 0,
      keywords: [...(b.keywords ?? [])],
    })),
    // M109 (Spare from Evil): ochrona „do końca tury" jest
    // częścią stanu gry — dwa stany różniące się nią nie są identyczne.
    // M159/Z1 (Żywy Tester g7, klasa M122/#1): tarcze regeneracji i blokada
    // regeneracji „do końca tury” są stanem gry — bez nich sonda „oferta bez
    // skutku” fałszywie zgłaszała działający Regenerate (Exterminator
    // Magmarch), a replay nie odróżniał stanów z tarczą i bez.
    regenerationShields: [...(state.regenerationShields ?? [])],
    cantBeRegeneratedThisTurn: [...(state.cantBeRegeneratedThisTurn ?? [])],
    exileIfDiesThisTurn: [...(state.exileIfDiesThisTurn ?? [])],
    gainLifeIfDiesThisTurn: (state.gainLifeIfDiesThisTurn ?? []).map((entry) => ({ ...entry })),
    untilEndOfTurnProtections: (state.untilEndOfTurnProtections ?? []).map((g) => ({
      controllerId: g.controllerId,
      objectIds: Array.isArray(g.objectIds) ? [...g.objectIds] : null,
      quality: { ...(g.quality ?? {}) },
    })),
    pendingScry: state.pendingScry ? { playerId: state.pendingScry.playerId, objectIds: [...state.pendingScry.objectIds] } : null,
    pendingSurveil: state.pendingSurveil ? { playerId: state.pendingSurveil.playerId, objectIds: [...state.pendingSurveil.objectIds] } : null,
    // M166/D: kwoty podziału obrażeń (Inferno Titan) — stan decyzji.
    pendingDamageDivision: state.pendingDamageDivision ? {
      playerId: state.pendingDamageDivision.playerId,
      total: state.pendingDamageDivision.total,
      targetIds: [...state.pendingDamageDivision.targetIds],
      // M171/Z6: deklaracja przy umieszczaniu na stosie (CR 603.3d).
      announceStackId: state.pendingDamageDivision.announceStackId ?? null,
    } : null,
    // M174/E: darmowy rzut z grobu (Halo Forager) — stan decyzji.
    pendingGraveFreeCast: state.pendingGraveFreeCast ? { playerId: state.pendingGraveFreeCast.playerId } : null,
    pendingSpell: state.pendingSpell ? { stackId: state.pendingSpell.stackId, effects: (state.pendingSpell.effects ?? []).length } : null,
    pendingClash: state.pendingClash ? {
      choices: [...state.pendingClash.choices],
      cards: { ...state.pendingClash.cards },
      won: state.pendingClash.won,
    } : null,
    pendingRoomTargets: (state.pendingRoomTargets ?? []).map((pending) => ({
      playerId: pending.playerId, room: pending.room, kind: pending.kind,
      effectType: pending.effectType,
      candidateIds: [...pending.candidateIds],
    })),
    pendingSacrifice: state.pendingSacrifice ? {
      playerId: state.pendingSacrifice.playerId,
      candidateIds: [...state.pendingSacrifice.candidateIds],
    } : null,
    initiativePlayerId: state.initiativePlayerId ?? null,
    undercityProgress: { ...(state.undercityProgress ?? {}) },
    // M190/B: oczekujący wybór trasy jest częścią stanu (determinizm replayów).
    pendingUndercityRoute: state.pendingUndercityRoute
      ? { playerId: state.pendingUndercityRoute.playerId, fromRoom: state.pendingUndercityRoute.fromRoom }
      : null,
    descendedThisTurn: { ...(state.descendedThisTurn ?? {}) },
    abilityActivatedThisTurn: { ...(state.abilityActivatedThisTurn ?? {}) },
    triggerFiredThisTurn: { ...(state.triggerFiredThisTurn ?? {}) },
    delayedTriggers: (state.delayedTriggers ?? []).map((entry) => ({ ...entry })),
    pendingBackups: (state.pendingBackups ?? []).map((pending) => ({
      playerId: pending.playerId, sourceId: pending.sourceId, counters: pending.counters,
    })),
    pendingDevours: (state.pendingDevours ?? []).map((pending) => ({
      playerId: pending.playerId, sourceId: pending.sourceId, counters: pending.counters,
    })),
    pendingEndures: (state.pendingEndures ?? []).map((pending) => ({
      playerId: pending.playerId, sourceId: pending.sourceId, counters: pending.counters,
    })),
    pendingDeliriumTargets: (state.pendingDeliriumTargets ?? []).map((pending) => ({
      playerId: pending.playerId, sourceId: pending.sourceId, amount: pending.amount,
      opponentId: pending.opponentId,
    })),
    pendingMentorTargets: (state.pendingMentorTargets ?? []).map((pending) => ({
      playerId: pending.playerId, sourceId: pending.sourceId, sourcePower: pending.sourcePower,
      candidateIds: [...(pending.candidateIds ?? [])],
    })),
    pendingGraveyardToTop: state.pendingGraveyardToTop ? {
      playerId: state.pendingGraveyardToTop.playerId,
      candidateIds: [...state.pendingGraveyardToTop.candidateIds],
    } : null,
    pendingLegendChoice: state.pendingLegendChoice ? {
      playerId: state.pendingLegendChoice.playerId,
      name: state.pendingLegendChoice.name,
      candidateIds: [...state.pendingLegendChoice.candidateIds],
    } : null,
    // M103/A1: wstrzymujące decyzje bez własnej pozycji wyżej — pełna
    // projekcja przez stableStringify (puste tablice pomijamy: brak decyzji).
    pendingDecisions: Object.fromEntries(PENDING_DECISION_FIELDS
      .filter((key) => state[key] != null && !(Array.isArray(state[key]) && state[key].length === 0))
      .map((key) => [key, JSON.parse(stableStringify(state[key]))])),
  });
}
