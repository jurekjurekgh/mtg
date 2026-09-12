/**
 * Wstrzymujące grę decyzje, które NIE mają własnej, ręcznie projekowanej
 * pozycji w fingerprint (M103/A1). Do czasu tej naprawy fingerprint je
 * pomijał, więc dwa stany różniące się oczekującą decyzją (np. craft
 * bez wybranego artefaktu) były „identyczne" — to myliło sondę „oferta bez
 * skutku" i osłabiało weryfikację replayów. Nowe pole wstrzymujące grę
 * MUSI trafić na tę listę (lekcja z M101/B2: zamrożony stan jest częścią
 * stanu gry, ADR 0005).
 */
// Eksportowane dla strażnika pokrycia (test/b2-odcisk-straznik-pokrycia.test.js).
export const PENDING_DECISION_FIELDS = Object.freeze([
  'pendingAbilityActivation', 'pendingAmass', 'pendingColorChoice',
  'pendingEscapeExile',
  'madnessQueue',
  // B2 (audyt PR #113, F1): `madnessQueue` to KOLEJKA odroczonych decyzji
  // madness (M258 — wpis zamiast natychmiastowego `pendingMadnessCast`, bo
  // decyzja otwiera się po całej sekwencji odrzuceń). Wpis kolejki zmienia
  // przyszłe możliwości (rzut z exile), więc należy do odcisku; strażnik B2/2
  // wykrył brak automatycznie — dokładnie po to powstał.
  // Audyt PR #92 (2026-09-02, znalezisko 2): te dwie decyzje blokują grę
  // w firstPendingDecision, ale nie było ich w odcisku — strażnik L16 był
  // wtedy vacuous (delegat), więc luka nie świeciła. `pendingWardPay` żyje
  // od M157, `pendingExileCast` wszedł w batchu 52 (Vaan, Street Thief).
  'pendingWardPay', 'pendingExileCast',
  // Audyt PR #86 (N1, klasa L16 — skan firstPendingDecisionPlayerId ×
  // fingerprint): te decyzje blokowały grę, ale nie były w odcisku.
  // Strażnik: test/fingerprint-pending-decisions.test.js.
  'pendingManifestDread', 'pendingSuspendCast', 'pendingOpponentTarget',
  'pendingFabricate', 'pendingCopyTargets',
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
// B2 (audyt PR #113, F1; klasy L15/L55/L70): liczniki i flagi tury, które
// zmieniają PRZYSZŁE możliwości albo są warunkiem zdolności (threshold,
// „jeśli w tej turze…", landfall, devour, soulbond, moonlit). Bez nich odcisk
// był ślepy na ich zmianę, a sonda „oferta bez skutku" nie widziała realnego
// skutku (ADR 0005). `objectSequence` to licznik utworzonych obiektów
// (token/kopia) — jego wzrost jest skutkiem, nie szumem.
// Stan efektów/udzieleń obowiązujących w turze: zapobieganie obrażeniom, tarcze,
// powiązane animacje, udzielone zdolności „do końca tury", ostatni wydatek many.
// Mierzone strażnikiem B2/2 — wszystkie były poza odciskiem (F1).
const STATE_EFFECT_FIELDS = Object.freeze([
  'preventDamageThisTurn', 'damageShields', 'linkedAnimations',
  'turnAbilityGrants', 'lastManaSpend',
]);

const STATE_COUNTER_FIELDS = Object.freeze([
  'spellsCastThisTurn', 'spellsCastThisTurnByPlayer',
  'lastTurnSpellsCastByPlayer', 'lastTurnSpellsCast', 'mulliganCounts',
  'cardsDrawnThisTurn', 'lifeGainedThisTurn', 'creatureDiedThisTurn',
  'landEnteredThisTurn', 'damageTakenByPlayerThisTurn',
  'speedIncreasedThisTurn', 'moonlitUsedThisTurn',
  'preventCombatExceptEnchanted',
]);

// B2: pola-ETYKIETY świadomie poza odciskiem. Granica z M323/D
// (test/m323-cloak-odcisk.test.js): odcisk pokazuje pola WARUNKUJĄCE
// możliwości, nie nośniki nazw. Każdy wpis ma powód i jest przypięty testem
// (B2/7), żeby granica nie przesuwała się po cichu w żadną stronę.
export const OBJECT_FINGERPRINT_EXCLUSIONS = Object.freeze({
  // M323/D: numer kopii/zakrycia nie zmienia żadnej legalnej komendy.
  copyNumber: 'etykieta kopii (pin M323/D — „sam numer kopii nie jest faktem gry")',
});

export const STATE_FINGERPRINT_EXCLUSIONS = Object.freeze({
  objectSequence: 'generator id/etykiet (abilities.js: `exile-${objectSequence++}`); fakt „obiekt powstał/zmienił strefę" widać w objects/zones',
  commands: 'dziennik poleceń do replayu (createReplay) — pochodna wejść, nie stan',
  events: 'dziennik rozgrywki — pochodna stanu, nie sam stan (ADR 0005)',
  starterId: 'stała rozgrywki: nie zmienia się po starcie, nie jest skutkiem decyzji',
  isDraw: 'stała rozgrywki: znacznik „remis", ustawiany tylko na końcu gry',
  objects: 'rzutowane osobno per obiekt (parsed.objects)',
  zones: 'rzutowane jako parsed.zones',
  players: 'rzutowane jako parsed.players',
  turn: 'rzutowane jako parsed.turn',
  combat: 'rzutowane jako parsed.combat',
});

// Projekcja dowolnej wartości stanu (Map/Set/tablica/obiekt/liczba) w formie
// stabilnej — ten sam mechanizm co `pendingDecisions`.
function projectValue(value) {
  return value === undefined ? null : JSON.parse(stableStringify(value));
}

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
    .map(({ id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, abilities, plot, plotted, tapped, summoningSickness, damage, powerModifier, toughnessModifier, chosenTargets, counters, faceDown, keywords, keywordGrants, abilityGrants, typeGrant, subtypes, transformTo, frontFaceId, untapLockedBy, untapVersion, untapLockVersions, types, entersTapped, attachedTo, baseKind, bestow, aura, equipment, backup, colors, phyrexianManaCost, goaded, goadedUntilTurn, detained, detainedUntilTurn, hexproofUntilTurn, enchantPlayer, enchantedPlayerId, cantBlock, cantBlockPrinted, cantBeBlocked, lostKeywordsUntilEOT, subtypesBeforeOverride, madnessReady, manifestReady, abilityResolvedThisTurn, cloakReady, ward, ...rest }) => ({
      // B2 (audyt PR #113, F1): reszta pól obiektu w całości. Lista jawna była
      // rejestrem ręcznym: 51 ze 100 pól fabryki nie było rzutowanych
      // (ownerId, isToken, name, dontUntapNextUntapStep, saga, station,
      // formerCounters, formerZone, toxic, echo, devour, endure, exploit,
      // suspend/warp/rebound/madness/echo-ready, enteredOnTurn…), czyli odcisk
      // nie zmieniał się po ich zmianie. Teraz nowe pole trafia do odcisku
      // samo; jawne normalizacje poniżej nadpisują wartości surowe.
      ...projectValue(Object.fromEntries(Object.entries(rest)
        .filter(([key]) => !(key in OBJECT_FINGERPRINT_EXCLUSIONS)))),
      id, instanceId, cardId, controllerId, zone, kind, power, toughness, manaCost, spell, plot, plotted, tapped, summoningSickness, damage, powerModifier, toughnessModifier, chosenTargets,
      abilities: abilities ?? [],
      counters: { ...(counters ?? {}) }, faceDown: Boolean(faceDown),
      keywords: [...(keywords ?? [])], keywordGrants: [...(keywordGrants ?? [])], abilityGrants: abilityGrants ?? [], typeGrant: typeGrant ? { subtypes: [...typeGrant.subtypes] } : null, subtypes: [...(subtypes ?? [])],
      types: [...(types ?? [])], entersTapped: Boolean(entersTapped),
      enchantPlayer: Boolean(enchantPlayer), enchantedPlayerId: enchantedPlayerId ?? null,
      attachedTo: attachedTo ?? null, baseKind: baseKind ?? null,
      bestow: bestow ? { cost: bestow.cost } : null,
      aura: aura ? { ...aura, keywords: [...(aura.keywords ?? [])] } : null,
      // M257 r3 (Greatsword of Tyr, „Equip {W}"): pipy kolorów kosztu są
      // częścią stanu (dwa sprzęty {1} vs {W} muszą się różnić w odcisku).
      equipment: equipment
        ? { equip: equipment.equip, colors: [...(equipment.colors ?? [])] }
        : null,
      backup: backup ? { counters: backup.counters } : null,
      transformTo: transformTo ? { cardId: transformTo.cardId, power: transformTo.power, toughness: transformTo.toughness } : null,
      frontFaceId: frontFaceId ?? null,
      untapLockedBy: [...(untapLockedBy ?? [])],
      untapVersion: untapVersion ?? 0, untapLockVersions: untapLockVersions ?? null,
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
      // M265 (Żywy Tester, worek-mroczny vs alara seed 331): licznik
      // rozstrzygnięć zdolności z `onNthResolve` (Soulbright Flamekin —
      // „if this is the THIRD time this ability has resolved this turn").
      // Postęp do trzeciej rezolucji jest realnym skutkiem gry (ADR 0005),
      // a bez niego sonda „oferta bez skutku" zgłaszała fałszywy no-op dla
      // drugiej aktywacji na cel, który już ma trample (klasa L16/M122/#1).
      abilityResolvedThisTurn: abilityResolvedThisTurn ?? 0,
      // M159/Z1 (Żywy Tester, klasa M122/#1): stan „do końca tury” i madness
      // na obiekcie też są częścią stanu gry (Wishful Merfolk — utrata
      // keywordów; Revolutionist — gotowość rzutu za madness z exile).
      lostKeywordsUntilEOT: [...(lostKeywordsUntilEOT ?? [])],
      subtypesBeforeOverride: subtypesBeforeOverride ? [...subtypesBeforeOverride] : null,
      madnessReady: Boolean(madnessReady),
      manifestReady: Boolean(manifestReady),
      // M323 (audyt PR #102, F3; klasa L16/M122#1 i M187/N1): pole stanu,
      // które zmienia PRZYSZŁE możliwości, należy do odcisku. Zmierzone sonką
      // na prawdziwym cloaku: zdjęcie `cloakReady` przełącza liczbę legalnych
      // komend `turn_cloak_face_up` z 1 na 0, a fingerprint pozostawał
      // identyczny — sonda „oferta bez skutku" i weryfikacja replayów były na
      // ten stan ślepe. Rodzeństwo (`manifestReady`, `madnessReady`) jest tu od
      // dawna, cloak wszedł bez niego.
      cloakReady: Boolean(cloakReady),
      // Kwota warda (CR 702.21) to cecha permanentu, nie tylko keyword:
      // decyduje, ile kosztuje celowanie, a po M322 wraca z migawki zakrycia.
      // Sam keyword jest w `keywords`, więc bez tego pola dwa stany z wardem
      // {1} i {2} miałyby ten sam odcisk.
      ward: ward ?? null,
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
    exileIfDiesThisTurn: (state.exileIfDiesThisTurn ?? []).map((entry) => ({ ...entry })),
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
      optional: Boolean(state.pendingSacrifice.optional),
      sourceId: state.pendingSacrifice.sourceId ?? null,
      reflexiveEvent: state.pendingSacrifice.reflexiveEvent ?? null,
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
    // B2 (audyt PR #113, F1): liczniki/flagi tury i stan efektów z list powyżej.
    counters: Object.fromEntries([...STATE_COUNTER_FIELDS, ...STATE_EFFECT_FIELDS]
      .map((key) => [key, projectValue(state[key])])),
    // M103/A1: wstrzymujące decyzje bez własnej pozycji wyżej — pełna
    // projekcja przez stableStringify (puste tablice pomijamy: brak decyzji).
    pendingDecisions: Object.fromEntries(PENDING_DECISION_FIELDS
      .filter((key) => state[key] != null && !(Array.isArray(state[key]) && state[key].length === 0))
      .map((key) => [key, JSON.parse(stableStringify(state[key]))])),
  });
}
