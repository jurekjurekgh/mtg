import { createRng } from '../engine/rng.js';
import { sourceHasProtectionQuality } from '../engine/attachments.js';
import { getSourceForObject, manaSourceOfCardDefinition } from '../engine/mana-sources.js';
import { coloredPipsOf } from '../engine/mana-cost.js';
import { createCardRegistry } from '../cards/card-data.js';
import { probAtLeastOne } from '../engine/hypergeom.js';
import { normalizeHeuristicWeights } from './heuristic-weights.js';
import { normalizeHeuristicParams } from './heuristic-params.js';

/**
 * Bot heurystyczny (Etap 4, B1): punktuje wszystkie legalne komendy z PlayerView
 * prostymi regułami i wybiera najlepszą; `randomness` steruje odchyleniem
 * od optimum przez seedowane RNG (ADR 0005 — brak Math.random).
 *
 * Ślad decyzji jest dostępny przez `trace()` — do debugowania i benchmarków.
 * Bot nie widzi nic poza PlayerView; deskryptory zdolności czyta z rejestru
 * kart po `cardId` (koszty tap/mana, typ efektu) — to wciąż OGÓLNE deskryptory
 * (abilities/keywords/typy), zero znajomości nazw kart (ADR 0002).
 *
 * B1 (2026-08-02) dodał względem pierwotnej heurystyki:
 * - świadomość kroków: w własnym untap/upkeep/draw/end/cleanup nie tapuje się
 *   many ani nie aktywuje zdolności kosztem tapu (mana wyparuje na końcu
 *   kroku, stwór zostaje zatapiany całą turę) — likwiduje patologię
 *   „wypalania własnej biblioteki\" przez stanie w miejscu;
 * - zegar (tury do zabicia / do śmierci): bonusy za bliskość lethal,
 *   groźbę śmierci w następnej turze (wyścig) i pustą bibliotekę (deck-out);
 * - ocenę planszy: evasion (flying), parytet liczby stworów;
 * - wycenę zdolności wg efektu (pump = przyrost siły minus koszt tapu,
 *   neutralizacja Liry = wartość celu, equip/evasion, cycling jak dotąd);
 * - blokowanie świadome ceny: nie chumpuje cennymi atakującymi bez presji.
 */

// M173/D: liczniki-keywordy (deathtouch, flying...) traktujemy jak
// statystyczne — dają trwałą zdolność, nie zasób do konsumpcji.
/**
 * M202/H+N: czy którykolwiek z blokerów MOŻE zablokować tego atakującego
 * (CR 509.1b). Wycena ataku porównywała atakującego z WSZYSTKIMI nietapniętymi
 * stworami wroga, więc latający 4/4 przy zwykłym 5/5 dostawał karę „chump”
 * (-10), choć nie może zostać zablokowany — a na plus wyciągała go dopiero
 * premia wyścigu. Reguła generyczna po keywordach i `cantBeBlocked` z widoku.
 */
function attackerCanBeBlocked(attacker, blockers) {
  if (!attacker) return false;
  if (attacker.cantBeBlocked === true) return false;
  const keywords = attacker.keywords ?? [];
  const flying = keywords.includes('flying');
  // Audyt Batch53/C (Rust-Shield Rampager): ewazja mocowa („can't be blocked
  // by creatures with power N or less") — blokerzy o mocy ≤ progu nie liczą
  // się do obrony. Próg z PlayerView (efektywna statyka, ADR 0017); moc
  // blokera efektywna (power + grantedPower, jak equipValuation).
  const powerCap = attacker.cantBeBlockedByPower;
  const able = (blockers ?? []).filter((b) => {
    const kw = b?.keywords ?? [];
    if (flying && !kw.includes('flying') && !kw.includes('reach')) return false;
    if (powerCap != null && ((b?.power ?? 0) + (b?.grantedPower ?? 0)) <= powerCap) return false;
    return true;
  });
  if (keywords.includes('menace') && able.length < 2) return false;
  return able.length > 0;
}

/**
 * M221/E (zgłoszenie właściciela): czy `attacker` jest bezradny wobec obrony,
 * bo przeciwnik ma NIETAPNIĘTEGO blokera z ochroną od koloru atakującego
 * (CR 702.16e), który MOŻE go zablokować. Taki bloker zablokuje bez strat:
 * atakujący nie zada obrażeń (ani graczowi, ani blokerowi) i nie zginie —
 * atak, pump, equipment na tym atakującym są jałowe, dopóki protekcja żyje.
 *
 * Reguła po deskryptorach z PlayerView (kolory atakującego + qualities
 * ochrony blokera z effectiveProtectionQualities), bez nazw kart (ADR 0002).
 * `blockers` to nietapnięci wrodzy stwory z widoku.
 */
function attackerNeutralizedByProtection(attacker, blockers) {
  if (!attacker) return false;
  const attackerColors = attacker.colors ?? [];
  if (attackerColors.length === 0) return false; // bezbarwny — protekcja koloru nie działa
  return (blockers ?? []).some((b) => {
    if (!b || b.tapped || b.cantBlock) return false;
    // Bloker musi móc zablokować tego atakującego (flying/menace, CR 509.1b).
    if (!attackerCanBeBlocked(attacker, [b])) return false;
    const qualities = b.protection ?? [];
    // Bloker chroniony od któregokolwiek koloru atakującego = atak jałowy:
    // obrażenia bojowe od atakującego są zapobiegane (CR 702.16c), a bloker
    // przeżywa. `sourceHasProtectionQuality` liczy kolory ze `source`.
    if (!qualities.some((q) => sourceHasProtectionQuality(q, attacker))) return false;
    // M239/1 (audyt PR #83, CR 702.19b + 702.16c): ale TRAMPLE przebija blok
    // z ochroną. Podział obrażeń wymaga od atakującego z trample tylko lethal
    // na blokerach, a test lethal ignoruje prewencję — nadmiar mocy wpada
    // w gracza, który protekcji NIE ma (chroni się tylko bloker). Czyli atak
    // tramplerem, którego moc przekracza „lethal" bloka (wytrzymałość, albo 1
    // przy deathtouch atakującego), nie jest jałowy: zada różnicę obrońcy.
    // Bloker nadal przeżywa — neutralizuje tylko samą wymianę obiektów.
    const attackerKeywords = attacker.keywords ?? [];
    if (attackerKeywords.includes('trample')) {
      const lethalNeeded = attackerKeywords.includes('deathtouch') ? 1 : (b.toughness ?? Number.POSITIVE_INFINITY);
      if ((attacker.power ?? 0) > lethalNeeded) return false;
    }
    return true;
  });
}

/**
 * M202/N: czy atakujący pada, ZANIM cokolwiek zada, bo bloker ma first strike.
 * CR 702.7/510.4: obrażenia first strike są w osobnym, wcześniejszym kroku —
 * 2/1 w nietapniętego 3/1 z first strike to 0 obrażeń i strata stwora
 * (zgłoszenie właściciela: „0% szans na sukces”).
 */
function diesBeforeDealingDamage(attacker, blockers) {
  const kw = attacker?.keywords ?? [];
  if (kw.includes('first_strike') || kw.includes('double_strike')) return false;
  const toughness = attacker?.toughness ?? 0;
  return (blockers ?? []).some((b) => {
    const bkw = b?.keywords ?? [];
    if (!bkw.includes('first_strike') && !bkw.includes('double_strike')) return false;
    return (b?.power ?? 0) >= toughness;
  });
}

/**
 * M297/B (uwaga właściciela 2026-09-03): czy atakujący GINIE przy bloku, bo
 * bloker ma deathtouch (CR 702.4 — każde ≥1 obrażenie jest śmiertelne).
 * Nie dotyczy niezniszczalnych; bloker musi realnie móc zablokować tego
 * atakującego (flying/reach, menace) i mieć moc > 0 (0 mocy = brak obrażeń).
 */
function diesToDeathtouchBlocker(attacker, blockers) {
  const kw = attacker?.keywords ?? [];
  if (kw.includes('indestructible')) return false;
  return (blockers ?? []).some((b) => {
    if (!b || !(b.keywords ?? []).includes('deathtouch')) return false;
    if ((b.power ?? 0) <= 0) return false;
    return attackerCanBeBlocked(attacker, [b]);
  });
}

/** Atakujący zadaje obrażenia PRZED blokerem (first/double strike, CR 702.7). */
function attackerStrikesFirst(attacker, blockers) {
  const kw = attacker?.keywords ?? [];
  if (!kw.includes('first_strike') && !kw.includes('double_strike')) return false;
  return !(blockers ?? []).some((b) => {
    const bkw = b?.keywords ?? [];
    return bkw.includes('first_strike') || bkw.includes('double_strike');
  });
}

/**
 * M218/1 (zlecenie właściciela 2026-08-26): czy `recipient` REALNIE bierze
 * udział w walce — atakuje (deklaracja atakujących, CR 508) albo blokuje
 * (deklaracja blokujących, CR 509). To jest STAN, nie nazwa kroku: bramka
 * `phase === 'combat'` obejmuje beginning_of_combat i end_of_combat, gdzie
 * nikt nie walczy (L64 — M206 naprawił to tylko w activate_ability; L41:
 * bliźniacza gałąź cast_spell zachowała stary warunek).
 * Odczyt wyłącznie z `view.combat` (ADR 0017): `state.combat` tworzy się przy
 * deklaracji atakujących i gaśnie po rozstrzygnięciu obrażeń, więc nie-null
 * = deklaracje istnieją. UWAGA: widok NIE wystawia `entry.blocking` — M206
 * czytał `recipient?.blocking`, które jest zawsze undefined; blokerów czytamy
 * z mapy `combat.blockers` (jak w keywordGrantWindowValue).
 */
function combatTrickWindow(view, recipient) {
  const combat = view.combat ?? null;
  if (!combat) return false;
  const id = recipient?.id;
  if (!id) return false;
  if ((combat.attackers ?? []).includes(id)) return true;
  return Object.values(combat.blockers ?? {}).some((ids) => (ids ?? []).includes(id));
}

/**
 * M218/2 (kryterium właściciela: „jeśli atakuje kreatura 1/1 i blokuje ją
 * kreatura 5/5, to pompowanie atakującego +2/+2 nie ma żadnego sensu bo nie
 * zmienia wyniku walki ani o jotę”): wynik POJEDYNCZEJ walki stwora z widoku
 * combat, przed i po modyfikacji statystyk.
 *
 * Czytamy WYŁĄCZNIE PlayerView (ADR 0017): atakujących z `combat.attackers`,
 * blokerów z mapy `combat.blockers`, statystyki/keywordy z kafli pola bitwy.
 * Zero stanu silnika, zero nazw kart (ADR 0002).
 *
 * Model CR 510 w wymiarze minimalnym, wystarczającym do porównania „czy
 * wynik walki się zmienia”:
 *  - dwa przebiegi obrażeń: first/double strike (CR 702.7), potem regularny,
 *    z SBA między przebiegami (CR 510.2 — martwy nie zadaje w następnym);
 *  - deathtouch (CR 702.4): każde zadane ≥1 obrażenie jest śmiertelne —
 *    dotyczy progu śmierci ODBIORCY (dającego źródła), nie ilości zadanej;
 *  - atakujący rozdziela moc lethal-first (CR 510.1b), nadmiar: trample →
 *    twarz (CR 702.19), inaczej → ostatni bloker (overkill);
 *  - lifelink (CR 702.15) liczony jako obrażenia zadane;
 *  - niezablokowany atakujący zadaje pełną moc na twarz w każdym przebiegu,
 *    w którym uczestniczy (double strike = dwie fale).
 *
 * Wynik to SUFICJENTNA statystyka: przeżycie, lista zabitych po stronie
 * przeciwnika, obrażenia na twarz, przyrost życia z lifelinku. Dwa wyniki
 * są równoważne, gdy wszystkie te składowe są identyczne — wtedy pump/debuff
 * nie zmienia gry i wartość = 0.
 */

/** Statystyki bojowe stwora z widoku + delta (pump/debuff) do symulacji. */
function duelStats(object, { power = 0, toughness = 0 } = {}) {
  const kw = object?.keywords ?? [];
  return {
    id: object?.id,
    power: Math.max(0, (object?.power ?? 0) + power),
    // Efektywna wytrzymałość: bazowa minus już zadane obrażenia.
    toughness: Math.max(0, (object?.toughness ?? 0) - (object?.damage ?? 0) + toughness),
    deathtouch: kw.includes('deathtouch'),
    trample: kw.includes('trample'),
    firstStrike: kw.includes('first_strike'),
    doubleStrike: kw.includes('double_strike'),
    lifelink: kw.includes('lifelink'),
  };
}

/**
 * Symulacja walki atakującego z blokerami (CR 510). Wynik wg kontraktu
 * `combatOutcome` — porównywany przed/po pumpie.
 */
function simulateCombat(attacker, blockers) {
  const fighters = (blockers ?? []).map((b) => ({ ...b, damageTaken: 0, hitByDeathtouch: false, alive: true }));
  const a = { ...attacker, damageTaken: 0, hitByDeathtouch: false, alive: true };
  const unblocked = fighters.length === 0;
  let faceDamage = 0;
  let attackerLifeGain = 0;
  let blockerLifeGain = 0;
  // lane 0 = first/double strike, lane 1 = regularny (double strike w obu).
  const inLane = (s, lane) => (lane === 0
    ? (s.firstStrike || s.doubleStrike)
    : (!s.firstStrike || s.doubleStrike));
  for (const lane of [0, 1]) {
    if (!a.alive) break; // CR 510.2 — martwy nie zadaje w następnym kroku
    const aActive = inLane(a, lane);
    if (aActive) {
      let remaining = a.power;
      const aliveFighters = fighters.filter((b) => b.alive);
      let dealt = 0;
      for (const b of aliveFighters) {
        if (remaining <= 0) break;
        // Lethal-first (CR 510.1b): deathtouch czyni 1 obrażenie śmiertelnym.
        const give = Math.min(remaining, a.deathtouch ? 1 : b.toughness);
        b.damageTaken += give;
        if (a.deathtouch && give > 0) b.hitByDeathtouch = true;
        dealt += give;
        remaining -= give;
      }
      if (unblocked) {
        faceDamage += a.power;
        dealt += a.power;
      } else if (a.trample) {
        // CR 702.19 — nadmiar po przydziale lethal idzie na twarz.
        faceDamage += Math.max(0, remaining);
        dealt += Math.max(0, remaining);
      } else if (aliveFighters.length > 0 && remaining > 0) {
        // CR 510.1b — bez trample nadmiar wpada w ostatniego blokera (overkill).
        aliveFighters[aliveFighters.length - 1].damageTaken += remaining;
        dealt += remaining;
      }
      if (a.lifelink) attackerLifeGain += dealt;
    }
    for (const b of fighters) {
      if (!b.alive || !inLane(b, lane)) continue;
      a.damageTaken += b.power;
      if (b.deathtouch && b.power > 0) a.hitByDeathtouch = true;
      if (b.lifelink) blockerLifeGain += b.power;
    }
    // SBA po przebiegu (CR 510.2): śmiertelność wg źródła z deathtouch.
    if (a.damageTaken > 0 && (a.hitByDeathtouch || a.damageTaken >= a.toughness)) a.alive = false;
    for (const b of fighters) {
      if (b.alive && b.damageTaken > 0 && (b.hitByDeathtouch || b.damageTaken >= b.toughness)) b.alive = false;
    }
  }
  return {
    attackerDies: !a.alive,
    deadBlockers: fighters.filter((b) => !b.alive).map((b) => b.id),
    faceDamage,
    attackerLifeGain,
    blockerLifeGain,
  };
}

/**
 * Wynik walki, w której bierze udział `recipient`, z uwzględnieniem delty
 * (pump/debuff) na tym stworze. Null, gdy stwór nie uczestniczy w walce.
 */
function combatOutcome(view, recipient, delta = {}) {
  const combat = view.combat ?? null;
  const id = recipient?.id;
  if (!combat || !id) return null;
  const battlefield = view.zones.battlefield ?? [];
  const viewObject = (oid) => battlefield.find((o) => o.id === oid) ?? null;
  const blockersOf = (attackerId) => (combat.blockers ?? {})[attackerId] ?? [];
  const attackerId = (combat.attackers ?? []).includes(id) ? id : null;
  if (attackerId) {
    const attacker = viewObject(attackerId);
    if (!attacker) return null;
    const blockers = blockersOf(attackerId)
      .map((oid) => viewObject(oid))
      .filter(Boolean)
      .map((b) => duelStats(b));
    const stats = duelStats(attacker, attackerId === id ? delta : {});
    return simulateCombat(stats, blockers);
  }
  // Bloker: znajdujemy atakującego, dla którego został zadeklarowany.
  const blockedFor = Object.keys(combat.blockers ?? {})
    .find((aid) => (blockersOf(aid) ?? []).includes(id));
  if (!blockedFor) return null;
  const foe = viewObject(blockedFor);
  if (!foe) return null;
  const blockers = blockersOf(blockedFor)
    .map((oid) => viewObject(oid))
    .filter(Boolean)
    .map((b) => duelStats(b, b.id === id ? delta : {}));
  return simulateCombat(duelStats(foe), blockers);
}

/**
 * M218/2 — czy pump/debuff o delcie { power, toughness } ZMIENIA wynik
 * walki, w której recipient bierze udział. True oznacza „ma wartość"
 * (albo natychmiastowa śmierć z SBA przy wytrzymałości ≤0 — CR 704.5f,
 * niezależnie od walki); false = okno jest, ale skutek będzie zerowy.
 */
function pumpChangesOutcome(view, recipient, delta = {}) {
  if (!recipient) return false;
  const stats = duelStats(recipient, delta);
  // Natychmiastowa SBA (CR 704.5f): wytrzymałość spada do 0 — cel umiera
  // zaraz po rozstrzygnięciu, to realna zmiana stanu gry.
  if (stats.toughness <= 0) return true;
  const before = combatOutcome(view, recipient, {});
  const after = combatOutcome(view, recipient, delta);
  if (!before || !after) return false;
  return JSON.stringify(before) !== JSON.stringify(after);
}

/** Rozmiar pumpu wg deskryptora (dynamiczne X z widoku — ADR 0017). */
function pumpDelta(view, effect) {
  if (effect.type === 'pump_by_creature_count') {
    const n = (view.zones.battlefield ?? [])
      .filter((o) => o.controllerId === view.playerId && o.kind === 'creature').length
      * (effect.perCreature ?? 1);
    return { power: n, toughness: n };
  }
  if (effect.type === 'pump_by_gates') {
    const n = (view.zones.battlefield ?? [])
      .filter((o) => o.controllerId === view.playerId && (o.subtypes ?? []).includes('Gate')).length;
    return { power: n, toughness: n };
  }
  return { power: effect.power ?? 0, toughness: effect.toughness ?? 0 };
}

/**
 * M218/3 — wynik walki z dodatkowymi keywordami na recipient (np. first_strike, flying, reach, deathtouch).
 * Model jak w pumpChangesOutcome, ale zamiast delty P/T dodajemy keywordy.
 */
function duelStatsWithExtraKeywords(object, extraKeywords = [], delta = {}) {
  if (!object) return null;
  const baseKw = object.keywords ?? [];
  const merged = extraKeywords.length ? [...new Set([...baseKw, ...extraKeywords])] : baseKw;
  const copy = { ...object, keywords: merged };
  return duelStats(copy, delta);
}

function combatOutcomeWithKeywords(view, recipient, extraKeywords = []) {
  const combat = view.combat ?? null;
  const id = recipient?.id;
  if (!combat || !id) return null;
  const battlefield = view.zones.battlefield ?? [];
  const viewObject = (oid) => battlefield.find((o) => o.id === oid) ?? null;
  const blockersOf = (attackerId) => (combat.blockers ?? {})[attackerId] ?? [];
  const attackerId = (combat.attackers ?? []).includes(id) ? id : null;
  if (attackerId) {
    const attacker = viewObject(attackerId);
    if (!attacker) return null;
    const blockers = blockersOf(attackerId)
      .map((oid) => viewObject(oid))
      .filter(Boolean)
      .map((b) => (b.id === id ? duelStatsWithExtraKeywords(b, extraKeywords, {}) : duelStats(b)));
    const stats = duelStatsWithExtraKeywords(attacker, extraKeywords, {});
    return simulateCombat(stats, blockers);
  }
  const blockedFor = Object.keys(combat.blockers ?? {}).find((aid) => (blockersOf(aid) ?? []).includes(id));
  if (!blockedFor) return null;
  const foe = viewObject(blockedFor);
  if (!foe) return null;
  const blockers = blockersOf(blockedFor)
    .map((oid) => viewObject(oid))
    .filter(Boolean)
    .map((b) => (b.id === id ? duelStatsWithExtraKeywords(b, extraKeywords, {}) : duelStats(b)));
  return simulateCombat(duelStats(foe), blockers);
}

function keywordChangesOutcome(view, recipient, extraKeywords = []) {
  if (!recipient || !extraKeywords.length) return false;
  const before = combatOutcome(view, recipient, {});
  const after = combatOutcomeWithKeywords(view, recipient, extraKeywords);
  if (!before || !after) return false;
  return JSON.stringify(before) !== JSON.stringify(after);
}

function enemyHasUntappedFlyingOrReachBlocker(view) {
  return (view.zones.battlefield ?? []).some(
    (o) =>
      o.controllerId !== view.playerId &&
      !o.tapped &&
      !o.cantBlock &&
      ((o.keywords ?? []).includes('flying') || (o.keywords ?? []).includes('reach')),
  );
}

function enemyHasFlyingAttackers(view) {
  const combat = view.combat ?? null;
  if (!combat || combat.attackingPlayerId === view.playerId) return false;
  const battlefield = view.zones.battlefield ?? [];
  return (combat.attackers ?? []).some((attackerId) => {
    const obj = battlefield.find((o) => o.id === attackerId);
    return obj && (obj.keywords ?? []).includes('flying');
  });
}

const KEYWORD_COUNTERS = new Set(['deathtouch', 'flying', 'first_strike', 'double_strike', 'lifelink', 'trample', 'vigilance', 'menace', 'reach', 'haste', 'hexproof', 'indestructible']);

const NEVER = Number.NEGATIVE_INFINITY;

/**
 * M179/B (zlecenie właściciela): efekty IDEMPOTENTNE „do końca tury” —
 * znaczniki/Sety, których druga IDENTYCZNA aktywacja wisząca na stosie nic
 * nie doda (grant keywordów, flagi cant-block/cant-be-blocked, animacja,
 * zmiana podtypu…). Bot nie dubluje takich aktywacji na stosie (uogólnienie
 * M175/A2 z samych grantów). NIE dotyczy „pakowania” (pump, liczniki,
 * obrażenia, tarcze regeneracji — kumulują się).
 */
export const IDEMPOTENT_EOT_EFFECTS = new Set([
  'grant_keywords_until_end_of_turn', 'cant_be_blocked', 'cant_block',
  'becomes_subtype_until_end_of_turn', 'animate_permanent_until_end_of_turn',
  'lock_untap', 'dont_untap_next_untap_step', 'tap_permanent', 'untap_permanent',
  'set_saddled',
  // Batch 52 (Jolrael): bazowe X/X do końca tury — ponowna aktywacja nie
  // kumuluje (set, nie suma), więc idempotentne.
  'set_base_pt_creatures_you_control',
]);

/**
 * M211/A1 (zgłoszenie właściciela, Seer's Lantern): efekty, których cała treść
 * to „obejrzyj/ułóż wierzch WŁASNEJ biblioteki”. Nie zmieniają planszy ani
 * życia — wpływają wyłącznie na to, co dobierzemy w najbliższym dobraniu.
 * Skutek jest niezależny od chwili aktywacji, więc opłaca się je odkładać na
 * moment, w którym mana i tak przepadnie (end step przeciwnika).
 */
export const DECK_ARRANGING_EFFECTS = new Set([
  'scry', 'surveil', 'look_top_n', 'explore',
]);

/**
 * M179/B: efekty KUMULUJĄCE w zdolnościach aktywowanych bez {T} — dublowanie
 * na stosie jest legalne i bywa sensowne (pump +1/+0 ×N, liczniki, mana).
 * Strażnik test/m179 wymaga klasyfikacji KAŻDEGO typu efektu występującego
 * w zdolności aktywowanej bez tapa — nowy typ bez przydziału = czerwony test.
 */
export const STACKING_ACTIVATED_EFFECTS = new Set([
  'pump', 'pump_enchanted_creature', 'add_counter', 'add_mana', 'damage',
  'damage_each_opponent', 'draw_cards', 'discard_cards', 'create_token',
  'create_copy_token', 'station_counters', 'scry', 'regenerate',
  'search_library_to_battlefield', 'search_library_to_battlefield_tapped',
  'put_graveyard_card_on_bottom', 'return_to_battlefield_tapped',
  'return_to_battlefield_under_control_at_upkeep', 'unearth_return',
  'attach_equipment_to_source', 'craft_transform', 'gain_life',
]);

/**
 * M106/Z6: rozwiązanie DYNAMICZNEJ liczby tokenów z widoku gracza (deskryptor
 * niesie klucz źródła zamiast liczby). Nieznane klucze traktujemy zachowawczo
 * jako 1 (jak dotąd), znane liczymy — 0 znaczy „czar nic nie zrobi".
 */
function dynamicTokenCount(view, amountKey) {
  if (amountKey === 'attacking_creatures_count') {
    // M107: widok ma pełną sekcję walki (ADR 0017). Fallback na znacznik
    // `attacking` z kafli zostaje dla widoków sprzed tej zmiany (replaye).
    if (view.combat) return (view.combat.attackers ?? []).length;
    return (view.zones.battlefield ?? []).filter((o) => o.attacking).length;
  }
  if (amountKey === 'lands_with_subtype_you_control') {
    return (view.zones.battlefield ?? []).filter((o) => o.controllerId === view.playerId
      && (o.types ?? []).includes('Land')).length;
  }
  if (amountKey === 'commander_casts') return 0; // brak command zone w tym formacie
  return 1;
}

/**
 * M106/Z2b (decyzja właściciela 2026-08-16): „jeśli jedynym albo najważniejszym
 * działaniem czaru/zdolności jest skutek, który w chwili rzucania jest pusty,
 * bot nie powinien go używać. Chyba że cel istnieje przy rzucaniu, a znika
 * później" — czyli patrzymy WYŁĄCZNIE na stan w chwili decyzji; późniejszy
 * fizzle (CR 608.2b) jest normalnym ryzykiem gry i nie jest tu karany.
 *
 * Zwraca true, gdy efekt na pewno nic nie zrobi TERAZ: brak obiektów, w które
 * mógłby uderzyć, albo zerowa liczba (tokeny, mielenie, liczniki).
 */
function effectIsInertNow(view, effect, cmd) {
  if (!effect) return false;
  // Helpery zasięgowe (myCreatures/enemyCreatures żyją w domknięciu bota) —
  // tutaj liczymy wprost z widoku, żeby funkcja była czysta i testowalna.
  const creatures = (mine) => (view.zones.battlefield ?? [])
    .filter((o) => o.kind === 'creature' && (mine ? o.controllerId === view.playerId : o.controllerId !== view.playerId));
  const enemyCount = creatures(false).length;
  const mineCount = creatures(true).length;
  switch (effect.type) {
    case 'create_token': {
      const count = Number.isInteger(effect.amount) ? effect.amount : dynamicTokenCount(view, effect.amount);
      return count === 0;
    }
    case 'buff_opponents_creatures': return enemyCount === 0;
    // M109 (Spare from Evil): ochrona dla „creatures you control" bez
    // własnych stworów nie robi nic.
    case 'grant_protection_until_end_of_turn': return mineCount === 0;
    // M109 (Sagittars' Volley): fala obrażeń w stwory przeciwnika z danym
    // keywordem — bez takich stworów efekt jest pusty.
    case 'damage_creatures_with_keyword':
      return !creatures(false).some((o) => (o.keywords ?? []).includes(effect.keyword));
    case 'buff_creatures_you_control': return mineCount === 0;
    case 'buff_land_creatures':
      return !(view.zones.battlefield ?? []).some((o) => o.controllerId === view.playerId
        && o.kind === 'creature' && (o.types ?? []).includes('Land'));
    case 'mill_cards':
    case 'mill_from_bottom':
      return (effect.amount ?? 1) === 0;
    // M126/#10 (Żywy Tester): efekty czytające WŁASNĄ bibliotekę są jałowe,
    // gdy nie ma z czego czytać (CR 701.54a — explore bez karty nic nie robi;
    // analogicznie scry/surveil/look). Bot aktywował Guidestone Compass
    // i Seer's Lantern przy pustej bibliotece, płacąc manę i tapnięcie za nic.
    case 'explore':
    case 'scry':
    case 'surveil':
    case 'look_top_n':
      return !(view.zones.library ?? []).some((o) => o.controllerId === view.playerId);
    // Dragon Arch: „put a multicolored creature card from your hand" — bez
    // takiej karty w ręce zdolność zabiera {2} i tapnięcie bez skutku.
    case 'put_multicolored_creature_from_hand':
      return !(view.zones.hand ?? []).some((o) => o.controllerId === view.playerId
        && o.kind === 'creature' && (o.colors ?? []).length >= 2);
    case 'add_counter':
      return (effect.amount ?? 1) <= 0;
    // M233 (audyt Żywym Testerem, Wrap in Flames): wrapper „każdemu z max N
    // celów" aplikuje efekty wewnętrzne do KAŻDEGO celu — zero celów = zero
    // efektu. Gdy variableTargets ma min:0, a na stole nie ma żadnego stwora,
    // jedyny legalny wariant rzutu idzie BEZ celów: 4 many i cała karta za nic.
    // Generycznie po pustej liście celów komendy (ADR 0002), nie po nazwie.
    case 'apply_to_each_target':
      return (cmd?.targets ?? []).length === 0;
    case 'reanimate_under_your_control': {
      // Puppeteer Clique: „put target creature card from an OPPONENT'S
      // graveyard onto the battlefield". Cel jawny w komendzie znaczy, że
      // w chwili decyzji istnieje (późniejszy fizzle to normalne ryzyko).
      if ((cmd?.targets ?? []).length > 0) return false;
      return !(view.zones.graveyard ?? []).some((o) => o.controllerId !== view.playerId
        && (o.kind === 'creature' || (o.types ?? []).includes('Creature')));
    }
    default:
      return false;
  }
}

/**
 * Czy CAŁA treść czaru/zdolności jest teraz pusta (wszystkie efekty jałowe)?
 * Wtedy zagranie to wyrzucenie karty albo many — bot ma tego nie robić.
 */
function allEffectsInertNow(view, effects, cmd) {
  const list = (effects ?? []).filter(Boolean);
  if (list.length === 0) return false;
  return list.every((effect) => effectIsInertNow(view, effect, cmd));
}

/**
 * M190/B: mapa dróg lochu (Oracle tclb/20) — kontroler nie importuje silnika
 * (ADR 0004: bot dostaje widok), więc trzyma własną, jawną kopię do WYCENY.
 * Zgodność z silnikiem pilnuje test m190 (jedno źródło prawdy = dane pokoi).
 */
export const UNDERCITY_ROOM_LINKS = Object.freeze({
  'Secret Entrance': ['Forge', 'Lost Well'],
  Forge: ['Trap!', 'Arena'],
  'Lost Well': ['Arena', 'Stash'],
  'Trap!': ['Archives'],
  Arena: ['Archives', 'Catacombs'],
  Stash: ['Catacombs'],
  Archives: ['Throne of the Dead Three'],
  Catacombs: ['Throne of the Dead Three'],
  'Throne of the Dead Three': [],
});

/**
 * M241: wycena jednej karty grobu dla kosztu wygnania Escape. Stwór wyceniany
 * wyżej niż inny typ karty (jak dawniej w M103/D: +10 + 2×P + T), inny typ
 * karty to stałe 6. Dane po deskryptorze rejestru, nie nazwie (ADR 0002),
 * bo widok grobu redaguje pola obiektów.
 */
function escapeExileCostOf(view, object) {
  const def = object?.cardId ? createCardRegistry().get(object.cardId) : undefined;
  const isCreature = (def?.types ?? []).includes('Creature')
    || (def?.power != null && def?.toughness != null);
  if (isCreature) return 10 + 2 * (def.power ?? 0) + (def.toughness ?? 0);
  return 6;
}

/**
 * WSPÓLNY MIANOWNIK efektów „pump" (zlecenie właściciela, Batch 51).
 *
 * Łączy je nie nazwa typu, tylko ROLA: efekt nadaje P/T na OGRANICZONY czas
 * (do końca tury), więc jego wartość zależy od OKNA tricku bojowego (M96 —
 * poza nim mana przepada w cleanup) i od tego, po czyjej stronie stoi cel
 * (M179/E). Rozpoznawanie po łańcuchu `type === 'pump' || type === '...'`
 * oznaczało, że każdy nowy typ efektu startował bez wyceny i czekał na
 * zgłoszenie (L28) — stąd tabela + jedna funkcja egzekwująca.
 *
 * Wartość wpisu = skąd wziąć P/T:
 *   'descriptor' — z pól `power`/`toughness` efektu;
 *   'gateCount'  — X = liczba kontrolowanych bram (Basilisk Gate; X nie siedzi
 *                  w deskryptorze, liczymy z widoku).
 * Odbiorcę (cel / zaczarowany stwór / źródło) ustala `pumpRecipientOf`.
 */
export const TEMPORARY_PUMP_EFFECTS = new Map([
  ['pump', 'descriptor'],
  ['pump_enchanted_creature', 'descriptor'],
  ['pump_by_gates', 'gateCount'],
  ['pump_by_creature_count', 'creatureCount'],
  ['buff_creature_until_end_of_turn', 'descriptor'],
  // M255/E (pętla jakości Żywym Testerem, Thunderstaff): „atakujące stwory
  // dostają +1/+0 do końca tury” ma ten sam kształt co pump — bez wpisu
  // zdolność nie miała wyceny (gołe score = 2) i bot aktywowała ją w Głównej
  // 1, gdy nikt nie atakował (2 many + tap na efekt, który wygasa w cleanup).
  ['buff_attacking_creatures', 'descriptor'],
]);

/**
 * Wspólny mianownik: `{ power, toughness }` nadawane przez efekt typu pump
 * (null = to nie jest pump). Ujemne wartości są tu NA MIEJSCU — to ten sam
 * efekt, tylko ze znakiem minus (M202/G: debuff to efekt WROGI, nie mniejszy
 * przyjazny).
 */
export function temporaryPumpOf(effect, view = null) {
  if (!TEMPORARY_PUMP_EFFECTS.has(effect?.type)) return null;
  // Liczby bierze `pumpDelta` — JEDNO źródło prawdy dla P/T efektów pump
  // (X = liczba stworów/bram liczy się z widoku, nie z deskryptora).
  if (view?.zones) return pumpDelta(view, effect);
  return { power: effect.power ?? 0, toughness: effect.toughness ?? 0 };
}

/**
 * M202/G (uwaga właściciela, Fleeting Distraction): efekt pump jest PRZYJAZNY
 * tylko przy dodatnich wartościach — „Target creature gets -1/-0 until end of
 * turn” to efekt WROGI. Klasyfikacja wyłącznie po TYPIE efektu karała rzucenie
 * debuffu we wroga i premiowała rzucenie go we WŁASNEGO stwora — dokładnie
 * zgłoszenie: „Bot ma na stole kreatury, gracz nie ma. Bot rzuca ten czar na
 * swoją kreaturę i debuffuje ją. Bez sensu.” Reguła generyczna po ZNAKU
 * deskryptora (ADR 0002) i po WSPÓLNYM MIANOWNIKU (L28), nie po nazwie typu:
 * debuff „-1/-1 do końca tury” (Downwind Ambusher) jest wrogi tak samo jak
 * debuff typu `pump`.
 */
export function isNegativePump(effect) {
  const pump = temporaryPumpOf(effect);
  if (!pump) return false;
  return pump.power < 0 || pump.toughness < 0;
}

export function createHeuristicBot({ seed, randomness = 0, lookahead = 0, opponentDeck = null, weights = undefined, params = undefined, registry: registryOverride = undefined }) {
  if (!Number.isInteger(seed)) throw new TypeError('Bot wymaga całkowitego seeda');
  if (typeof randomness !== 'number' || randomness < 0 || randomness > 1) throw new RangeError('randomness ma być w [0, 1]');
  const rng = createRng(seed);
  const registry = registryOverride ?? createCardRegistry();
  const history = [];
  const enabled = lookahead > 0;
  const scoreWeights = normalizeHeuristicWeights(weights);
  // B6 T1 — parametry deskryptorowe wyceny (dawne „magiczne liczby"). Wartości
  // domyślne == dawne stałe, więc golden-master (bot-scoring-snapshot) zostaje
  // zielony po ekstrakcji; tuner offline zmienia je świadomie.
  const P = normalizeHeuristicParams(params);

  // B3 — modelowanie przeciwnika: znana talia przeciwnika (decks/*.txt) +
  // hipergeometria. Klasyfikujemy karty przeciwnika generycznie po efektach
  // (damage = removal, pump = combat trick), zero nazw kart (ADR 0002).
  const opponentCounts = new Map();
  for (const id of (Array.isArray(opponentDeck) ? opponentDeck : [])) {
    opponentCounts.set(id, (opponentCounts.get(id) ?? 0) + 1);
  }
  const removalSpells = new Map(); // cardId → { cost, amount, copies }
  const pumpSpells = new Map();    // cardId → { cost, copies }
  for (const [id, copies] of opponentCounts) {
    const def = registry.get(id);
    // Kind liczy materialize z linii typów — na definicji sprawdzamy types.
    const isSpell = (def?.types ?? []).includes('Instant') || (def?.types ?? []).includes('Sorcery');
    if (!def || !isSpell) continue;
    const spell = def.spell;
    if (!spell || spell.timing !== 'instant') continue; // tylko instant zagra w nasz atak/blok
    const effects = spell.effects ?? [];
    const damage = effects.find((e) => e.type === 'damage');
    if (damage) removalSpells.set(id, { cost: def.manaCost ?? 0, amount: damage.amount ?? 0, copies });
    if (effects.some((e) => e.type === 'pump')) pumpSpells.set(id, { cost: def.manaCost ?? 0, copies });
  }
  const minRemovalCost = removalSpells.size ? Math.min(...[...removalSpells.values()].map((r) => r.cost)) : Number.POSITIVE_INFINITY;
  const minPumpCost = pumpSpells.size ? Math.min(...[...pumpSpells.values()].map((p) => p.cost)) : Number.POSITIVE_INFINITY;
  // M297/B (uwaga właściciela 2026-09-03): „kupowany deathtouch" — instant
  // dający deathtouch do końca tury (klasa Coat with Venom). Obrońca z maną
  // i DOWOLNYM blokerem wymienia taniego stwora za naszego drogiego
  // atakującego (CR 702.4). Model jak B3 (deck + hipergeometria).
  const deathtouchTricks = new Map(); // cardId → { cost, copies }
  for (const [id, copies] of opponentCounts) {
    const def = registry.get(id);
    const isSpell = (def?.types ?? []).includes('Instant') || (def?.types ?? []).includes('Sorcery');
    if (!def || !isSpell) continue;
    const spell = def.spell;
    if (!spell || spell.timing !== 'instant') continue;
    const grantsDeathtouch = (spell.effects ?? []).some((e) => e?.type === 'grant_keywords_until_end_of_turn'
      && (e?.keywords ?? []).includes('deathtouch'));
    if (grantsDeathtouch) deathtouchTricks.set(id, { cost: def.manaCost ?? 0, copies });
  }
  const minDeathtouchTrickCost = deathtouchTricks.size
    ? Math.min(...[...deathtouchTricks.values()].map((t) => t.cost)) : Number.POSITIVE_INFINITY;

  // B2 — lookahead: ograniczony koszt symulacji i waga poprawy ewaluacji.
  const LOOKAHEAD_TOP_K = 3;
  const LOOKAHEAD_MAX_COMMANDS = 12;
  const LOOKAHEAD_WEIGHT = 3;
  // Lookahead koryguje tylko przy wyraźnej różnicy ewaluacji (|delta| >= próg)
  // — neutralne wymiany (delta ~0) zostawiają decyzję heurystyce B1.
  const LOOKAHEAD_EVAL_THRESHOLD = 1;
  const LOOKAHEAD_TYPES = ['play_land', 'cast_permanent', 'cast_spell', 'cast_cleave', 'activate_ability', 'declare_attackers'];

  const byType = (view, type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const objectOnBoard = (view, objectId) => view.zones.battlefield.find((o) => o.id === objectId);

  /**
   * C-R1 (audyt Batch53): premia za TRIGGERY WEJŚCIA karty-permanentu —
   * tabela po TYPACH efektów (generycznie, ADR 0002). Warunki rzutu
   * (wasKicked/wasOffspring) bramkują per WARIANT rzutu; ifCast przy rzucie
   * z ręki jest zawsze spełniony. Wartości celowane pod skalę gałęzi
   * cast_permanent (ciało ~70, removal ~18-20, karta ~9) — celowo
   * konserwatywne: to sterowanie KOLEJNOŚCIĄ rzutów, nie symulacja.
   * Nieznane typy → 0 (zachowanie bez zmian; L28: tabela, nie if-y).
   */
  /**
   * C-R4 (audyt Batch53): pump z triggera „whenever this creature becomes
   * blocked" (Ichorclaw Myr 1/1 — zablokowany 3/3). Sim walki liczył staty
   * drukowane, więc bot chował stwora, który realnie WYGRYWA blok. Generycznie
   * po deskryptorach (ADR 0002): triggered + event becomes_blocked + pump.
   */
  const becomesBlockedPump = (object) => {
    const def = object?.cardId ? cardDef(object.cardId) : undefined;
    let power = 0;
    let toughness = 0;
    for (const ability of def?.abilities ?? []) {
      if (ability?.type !== 'triggered' || ability.trigger?.event !== 'becomes_blocked') continue;
      const effs = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
      for (const e of effs) {
        if (e?.type !== 'pump') continue;
        power += e.power ?? 0;
        toughness += e.toughness ?? 0;
      }
    }
    return { power, toughness };
  };

  const enemyNonlandPermanents = (view) => (view.zones.battlefield ?? [])
    .filter((o) => o.controllerId !== view.playerId && o.kind !== 'land' && (o.types ?? []).every((t) => t !== 'Land'));
  const etbEnemyHasTarget = (view, spec) => {
    const raw = typeof spec === 'string' ? spec : spec?.type;
    if (!raw) return true; // bez wymogu celu — efekt bezwarunkowy
    const foes = enemyNonlandPermanents(view);
    if (raw === 'opponent' || raw === 'player') return true;
    if (raw === 'artifact_or_enchantment') {
      return foes.some((o) => o.kind === 'artifact' || o.kind === 'enchantment' || (o.types ?? []).some((t) => t === 'Artifact' || t === 'Enchantment'));
    }
    if (raw === 'artifact_or_enchantment_or_land') {
      return (view.zones.battlefield ?? []).some((o) => o.controllerId !== view.playerId);
    }
    // pozostałe cele wymagają stwora/permanentu przeciwnia (creature,
    // creature_opponent_controls, artifact_or_creature, nonland_permanent…)
    return foes.length > 0;
  };
  const ETB_EFFECT_BONUS = Object.freeze({
    draw_cards: (e) => 9 * (e.amount ?? 1),
    draw_then_discard: () => 6,
    discard_cards: (e) => -4 * (e.amount ?? 1),
    scry: () => 4,
    discover: () => 10,
    gain_life: (e) => Math.min(2 * (e.amount ?? 1), 8),
    create_token: () => 12,
    create_offspring_token: () => 12,
    living_weapon: () => 12,
    destroy_permanent: (e, view, req) => (etbEnemyHasTarget(view, req) ? 18 : 0),
    exile_opponent_creature: (e, view, req) => (etbEnemyHasTarget(view, req) ? 20 : 0),
    exile_target_creature: (e, view, req) => (etbEnemyHasTarget(view, req) ? 20 : 0),
    exile_nonland_permanent_linked: (e, view, req) => (etbEnemyHasTarget(view, req) ? 18 : 0),
    bounce_permanent: (e, view, req) => (etbEnemyHasTarget(view, req) ? 12 : 0),
    tap_permanent: (e, view, req) => (etbEnemyHasTarget(view, req) ? 8 : 0),
    lock_untap: (e, view, req) => (etbEnemyHasTarget(view, req) ? 12 : 0),
    detain: (e, view, req) => (etbEnemyHasTarget(view, req) ? 8 : 0),
    damage: (e, view, req) => (etbEnemyHasTarget(view, req) ? Math.min(3 * (e.amount ?? 1), 15) : 0),
    damage_divided: (e, view, req) => (etbEnemyHasTarget(view, req) ? 15 : 0),
    damage_each_opponent: (e) => 4,
    each_player_loses_life_fraction: () => 3,
    buff_creatures_you_control: () => 8, // wchodzący stwór też jest odbiorcą
    grant_keywords_until_end_of_turn: () => 4,
    buff_creature_until_end_of_turn: (e, view, req) => ((view.zones.battlefield ?? []).some((o) => o.controllerId === view.playerId && o.kind === 'creature') ? 5 : 0),
    add_counter: (e, view, req) => (req ? (etbEnemyHasTarget(view, req) ? 6 : 0) : 5),
    search_library_to_hand: () => 9,
    search_library_to_battlefield: () => 10,
    return_card_from_graveyard_to_hand: (e, view) => ((view.zones.graveyard ?? []).some((o) => o.controllerId === view.playerId) ? 7 : 0),
    return_permanent_from_graveyard: (e, view) => ((view.zones.graveyard ?? []).some((o) => o.controllerId === view.playerId) ? 10 : 0),
    put_graveyard_card_on_top: () => 4,
    reveal_top_pick_land_rest_grave: () => 5,
    opponent_hand_card_to_top: () => 3,
    discard_each_opponent: () => 3,
    take_initiative: () => 6,
    amass: () => 6,
    fabricate: () => 8,
    untap_all_creatures_you_control: () => 3,
    animate_linked: (e, view) => ((view.zones.battlefield ?? []).some((o) => o.controllerId === view.playerId && (o.kind === 'artifact' || (o.types ?? []).includes('Artifact'))) ? 10 : 0),
    prevent_damage_this_turn: () => 3,
    exile_own_land: () => -6,
    // C-R1 (domkniecie, sesja arena/01a071d1): typy ETB jawnie korzystne,
    // nieobsluzone w dedykowanych galezich `cast_permanent` (attach/reanimate/
    // reflexive/conditional sa tam), a w katalogu uzytkowe przez realne karty.
    // Konserwatywne wartosci (skala = sterowanie kolejnoscia rzutow, nie
    // symulacja): odkrecenie celu i ramp sa realna korzyscia planszy.
    untap_permanent: (e, view, req) => (etbEnemyHasTarget(view, req) ? 8 : 6),
    springbloom_sacrifice_search: () => 10,
    fertile_thicket_reveal: () => 5,
  });
  const etbEnterBonusValue = (view, def, { kicked = false, offspring = false } = {}) => {
    if (!def) return 0;
    let total = 0;
    for (const ability of def.abilities ?? []) {
      if (ability?.type !== 'triggered' || ability.trigger?.event !== 'enter_battlefield') continue;
      const cond = ability.trigger.condition ?? {};
      if (cond.wasKicked && !kicked) continue;
      if (cond.wasOffspring && !offspring) continue;
      if (cond.delirium || cond.descendedThisTurn || cond.controlsCreatureWithCounter) continue; // zbyt sytuacyjne — bez zmian
      const req = ability.trigger.requiresTarget ?? null;
      const effs = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
      for (const e of effs) {
        const fn = e?.type ? ETB_EFFECT_BONUS[e.type] : null;
        if (!fn) continue;
        total += fn(e, view, req);
      }
    }
    return total;
  };
  const handCard = (view, objectId) => view.zones.hand.find((o) => o.id === objectId);
  // Karta w DOWOLNEJ strefie widoku (M103/D: Escape/Flashback grają z grobu —
  // handCard nie widział karty i czar spadał do wyceny 60 „na ślepo").
  // Indeks per widok (WeakMap): wycena iteruje setki wariantów jednego okna,
  // więc skan stref per id byłby kwadratowy.
  const zoneIndexByView = new WeakMap();
  const zoneCard = (view, objectId) => {
    let index = zoneIndexByView.get(view);
    if (!index) {
      index = new Map();
      for (const zone of ['hand', 'battlefield', 'graveyard', 'stack', 'exile', 'library']) {
        for (const o of view.zones?.[zone] ?? []) index.set(o.id, o);
      }
      zoneIndexByView.set(view, index);
    }
    return index.get(objectId) ?? null;
  };
  const myLife = (view) => view.players.find((p) => p.id === view.playerId)?.life ?? 0;
  const enemy = (view) => view.players.find((p) => p.id !== view.playerId);
  const myCreatures = (view) => view.zones.battlefield.filter((o) => o.controllerId === view.playerId && o.kind === 'creature');
  const enemyCreatures = (view) => view.zones.battlefield.filter((o) => o.controllerId !== view.playerId && o.kind === 'creature');
  const untappedEnemyBlockers = (view) => enemyCreatures(view).filter((o) => !o.tapped);
  const myTurn = (view) => view.turn.activePlayerId === view.playerId;
  // Kroki własnej tury, w których tapowanie (many albo stworów) nie ma sensu:
  // mana wyparuje na końcu kroku, a stwór zostaje zatapiany całą turę.
  const wastefulStep = (view) => myTurn(view) && ['untap', 'upkeep', 'draw', 'end', 'cleanup'].includes(view.turn.step);
  const myLibraryCount = (view) => view.zones.library.filter((o) => o.controllerId === view.playerId).length;
  /**
   * D (zgłoszenie właściciela, Deepwood Denizen): dobieranie kart, które
   * OPRÓŻNIA własną bibliotekę, to wyrok — CR 121.4/704.5b: próba dobrania
   * z pustej biblioteki przegrywa partię, a dobranie OSTATNIEJ karty zostawia
   * gracza bez szansy na najbliższe dobranie. Kara przebija wartość karty
   * (P.drawCardValue), więc wariant schodzi poniżej passu i bot nie
   * deck-outuje się „od razu". Reguła po liczbie kart w bibliotece
   * (informacja publiczna, ADR 0017), bez nazw kart (ADR 0002).
   */
  const drawDeckingPenalty = (view, amount = 1) => {
    const remaining = myLibraryCount(view) - amount;
    return remaining <= 0 ? -(P.drawCardValue * amount + 40) : 0;
  };
  const myLandCount = (view) => view.zones.battlefield.filter((o) => o.controllerId === view.playerId && o.kind === 'land').length;

  /**
   * M218/4, M257/F — czy stwór jest ZAGROŻONY PEWNĄ śmiercią w tej turze
   * (regenerate jako combat trick).
   *
   * M257/F (znalezisko pętli jakości): usunięto gałąź 3 M218/4 — „przeciwnik
   * ma otwartą manę i removal, który MOŻE go zabić” (B3, hipergeometria).
   * To spekulacja ręki, nie pewna śmierć: regeneracja trwa do końca tury
   * (CR 702.14), a wróg mógłby nie rzucić (albo mieć countera po drugiej
   * stronie — tarcza byłaby stratą). Reguła repo (M236/2,
   * permanentDoomedThisTurn): spekulacja „removal w ręce” jest „za mało
   * pewna”, by uznać permanent za skazany. Regenerate w G1 bez nadchodzącej
   * śmierci = czyste marnotrawstwo; sense ma W MOMENCIE LETHALU:
   *   1. walka zadeklarowana, stwór ginie (symulacja CR 510, M218/2),
   *   2. obrażenia śmiertelne JUŻ zadane (SBA 704.5g czeka).
   * Zero nazw kart (ADR 0002), czytamy wyłącznie PlayerView (ADR 0017).
   */
  const isCreatureThreatened = (view, creature) => {
    if (!creature) return false;
    // 1. Walka — wynik symulacji przed/po (M218/2)
    const outcome = combatOutcome(view, creature, {});
    if (outcome) {
      if (outcome.attackerDies) return true;
      if (outcome.deadBlockers?.includes(creature.id)) return true;
    }
    // 2. Obrażenia śmiertelne już zadane (SBA 704.5g) — „moment lethalu”.
    if ((creature.damage ?? 0) >= (creature.toughness ?? 0)) return true;
    return false;
  };

  // M236/2 (KOREKTA właściciela): permanent jest „skazany w tej turze" — więc
  // poświęcenie go (np. za życie) jest praktycznie DARMOWE — gdy:
  //  (a) to zadeklarowany BLOKER, który i tak zginie w tej walce, NIE zabijając
  //      atakującego (blok zostaje, permanent i tak pada), ALBO
  //  (b) jest CELEM czaru/zdolności PRZECIWNIKA na stosie, który go zniszczy/
  //      wygna/zada mu śmiertelne obrażenia (usunięcie i tak nastąpi).
  // Czytamy WYŁĄCZNIE PlayerView (ADR 0017): combat + stos z celami; zero nazw
  // kart (ADR 0002). NIE używamy spekulacji „removal w ręce" (B3) — to za mało
  // pewne, by uznać permanent za skazany.
  const permanentDoomedThisTurn = (view, obj) => {
    if (!obj) return false;
    // (a) bloker ginący w walce
    const outcome = combatOutcome(view, obj);
    if (outcome && (outcome.deadBlockers ?? []).includes(obj.id) && !outcome.attackerDies) return true;
    // (b) cel wrogiego czaru/zdolności usuwającej na stosie
    const REMOVE_ON_STACK = new Set(['destroy_permanent', 'exile_permanent', 'exile_target_creature',
      'destroy_if_least_power', 'destroy_artifact_gain_life_mana_value']);
    for (const entry of (view.zones.stack ?? [])) {
      if (entry.controllerId === view.playerId) continue;
      const targets = entry.targets ?? [];
      if (!targets.includes(obj.id)) continue;
      const effs = [
        ...((entry.spell?.effects) ?? []),
        ...((entry.spell?.modes ?? []).flatMap((m) => m.effects ?? [])),
      ];
      if (effs.some((e) => REMOVE_ON_STACK.has(e?.type))) return true;
      // obrażenia śmiertelne z czaru na stosie
      const dmg = effs.find((e) => e?.type === 'damage');
      if (dmg && Number.isInteger(dmg.amount)
        && dmg.amount >= ((obj.toughness ?? 0) - (obj.damage ?? 0))) return true;
    }
    return false;
  };

  // M234 (zlecenie właściciela — efektywność removalu). Kolory MOICH stworów
  // z pola bitwy: potrzebne, by ocenić, czy wrogi stwór ma protekcję od koloru,
  // którym mógłbym w niego uderzyć w walce (wtedy jest „nie do przejścia" i wart
  // zdjęcia czarem nawet przy niskich statystykach). Czytamy wyłącznie widok
  // (ADR 0017): kolory własnych stworów są publiczne.
  const myCreatureColors = (view) => {
    const colors = new Set();
    for (const o of myCreatures(view)) for (const c of (o.colors ?? [])) colors.add(c);
    return colors;
  };

  /**
   * M234 — czy wrogi stwór jest „nie do przejścia" w walce moimi stworami:
   * ma protekcję od koloru któregokolwiek z moich stworów (CR 702.16 — mój
   * atakujący/bloker nie zada mu obrażeń, on przeżyje). Reguła po deskryptorach
   * z PlayerView (protection quality celu + kolory moich stworów), zero nazw
   * kart (ADR 0002). Gdy nie mam stworów w danym kolorze — protekcja nie ma
   * znaczenia dla walki, więc nie premiujemy.
   */
  const enemyCreatureUnbeatableInCombat = (view, creature) => {
    const qualities = creature?.protection ?? [];
    if (qualities.length === 0) return false;
    const myColors = myCreatureColors(view);
    if (myColors.size === 0) return false;
    for (const color of myColors) {
      // sourceHasProtectionQuality liczy kolory ŹRÓDŁA (mojego stwora) —
      // symulujemy jednokolorowe źródło, by sprawdzić każdy mój kolor osobno.
      if (qualities.some((q) => sourceHasProtectionQuality(q, { kind: 'creature', types: ['Creature'], colors: [color] }))) {
        return true;
      }
    }
    return false;
  };

  /**
   * M234 — dodatkowa wartość zdjęcia CZAREM konkretnego wrogiego stwora,
   * ponad bazę+statystyki. Realizuje model właściciela:
   *  - preferuj DROŻSZE cele (TMC = publiczny proxy „ma unikalne zdolności",
   *    bo PlayerView nie niesie `abilities` — ADR 0017);
   *  - przy tanich celach premiuj te NIE DO PRZEJŚCIA w walce: deathtouch
   *    (każde obrażenie śmiertelne — wymiana zawsze na jego korzyść) oraz
   *    protekcja od mojego koloru (mój stwór go nie tknie).
   * Zwraca liczbę punktów do DODANIA (0 dla celu własnego — obsługuje go kara
   * wyżej). Deskryptory z widoku, zero nazw kart (ADR 0002).
   */
  // M234/3 — czy TANI wrogi stwór jest już „ogarnięty walką": mam nietapniętego
  // stwora, który zablokuje go i zabije, sam przeżywając (czysta wymiana na moją
  // korzyść). Wtedy zdejmowanie go CZAREM marnuje kartę — model właściciela:
  // „jeśli mogę zabić w walce, może nie warto zużywać removalu". Wykluczenia
  // liczone są WYŻEJ (nie wołamy tego dla ewazji/deathtouch/protekcji/drogich).
  // Czytamy wyłącznie widok (ADR 0017), reguła po statystykach/keywordach, zero
  // nazw kart (ADR 0002).
  const enemyCreatureHandledByCombat = (view, target) => {
    if (!target || target.kind !== 'creature') return false;
    const myBlockers = myCreatures(view).filter((o) => !o.tapped);
    if (myBlockers.length === 0) return false;
    if (!attackerCanBeBlocked(target, myBlockers)) return false; // jego ewazja
    const enemyStats = duelStats(target);
    for (const blocker of myBlockers) {
      if (!attackerCanBeBlocked(target, [blocker])) continue; // ten bloker musi go dosięgnąć
      // Modelujemy: wrogi stwór ATAKUJE, mój go blokuje (CR 509/510).
      const outcome = simulateCombat(enemyStats, [duelStats(blocker)]);
      const killsEnemy = outcome.attackerDies; // pierwszy arg = atakujący (wróg)
      const myBlockerDies = (outcome.deadBlockers ?? []).includes(blocker.id);
      if (killsEnemy && !myBlockerDies) return true; // czysta wymiana na moją korzyść
    }
    return false;
  };

  // Uwaga L39: gałąź `return_to_hand` niżej jest od dawna martwa (żaden
  // producent efektu w src/); realne odbicia jadą typem `bounce_permanent`
  // (modal Steel Sabotage) i dostają tę regułę z REMOVAL_EFFECTS.
  //
  // M247 (audyt Żywym Testerem, 2026-08-28 — Banishment Decree za 5 many
  // rzucane w Great Furnace): czysty LĄD (typ `Land`, nie Creature, więc
  // nie zagraża/nie broni) jako cel efektu niszczącego albo odbijającego to
  // stracona karta — przeciwnikowi nie ginie nic bojowego, ląd wraca
  // za darmo (a z „wierzchu biblioteki" wręcz przy następnym doborze).
  // Deskryptor po typach z widoku (ADR 0002/0017); ląd-stwór (Dryad-Arbor
  // class) wykluczony jawnie — ten ginie „naprawdę" w walce.
  const pureLandTarget = (t) => t && (t.types ?? []).includes('Land')
    && !(t.types ?? []).includes('Creature');

  const enemyRemovalTargetBonus = (view, target) => {
    if (!target || target.controllerId === view.playerId) return 0;
    let bonus = P.removalTmcWeight * (target.manaCost ?? 0);
    const kw = target.keywords ?? [];
    const deathtouch = kw.includes('deathtouch');
    const unbeatable = enemyCreatureUnbeatableInCombat(view, target);
    if (deathtouch) bonus += P.removalDeathtouchBonus;
    if (unbeatable) bonus += P.removalProtectionBonus;
    // M234/3 — kara „ogarnięte walką" TYLKO dla taniego, zwykłego celu: bez
    // deathtouch/protekcji (te są nie do przejścia — wykluczone wyżej) i o
    // niskim TMC (drogie cele = potencjalne zdolności, zawsze warte removalu).
    // Próg TMC 3 to granica „taniego" stwora (model właściciela: 1/1, drobiazg).
    if (!deathtouch && !unbeatable && (target.manaCost ?? 0) <= 3
      && enemyCreatureHandledByCombat(view, target)) {
      bonus -= P.removalCombatHandledPenalty;
    }
    return bonus;
  };

  /**
   * M139 (uwaga właściciela) — WARTOŚĆ TAPNIĘCIA ZALEŻY OD MOMENTU.
   *
   * „Najefektywniejsze jest tapowanie kreatur przeciwnika po jego fazie untap
   * — wtedy taka kreatura jest nieczynna i w ataku, i w obronie.”
   *
   * Dotąd wycena znała tylko CEL (`8 + 2*power`), nie znała CHWILI, więc każde
   * okno było warte tyle samo. Pomiar (/tmp/tapmeasure.mjs) pokazał, że bot
   * tapował w najgorszych momentach, a najlepszy pomijał.
   *
   * Dlaczego okna różnią się wartością (CR 502/508/509):
   *
   * - `untap` przeciwnika ODKRĘCA jego permanenty (untapControlled dotyczy
   *   wyłącznie aktywnego gracza). Tapnięcie ZANIM to nastąpi — czyli w mojej
   *   turze — zostanie skasowane kilka chwil później. To wyrzucona mana.
   * - Tuż PO jego untap (upkeep/draw/main1 przeciwnika, przed deklaracją
   *   ataku) stwór nie zaatakuje w tej turze ANI nie zablokuje w mojej
   *   następnej — jedno tapnięcie wyłącza go z obu stron. To okno optymalne.
   * - Po deklaracji atakujących tapnięcie NIE wycofuje stwora z walki
   *   (CR 506.4) — obrażenia i tak zostaną zadane. Zysk jest wyłącznie taki,
   *   że stwór nie odblokuje w mojej turze, więc dużo mniejszy.
   * - W MOJEJ turze przed atakiem tapowanie ma sens defensywny odwrotny:
   *   usuwa potencjalnego BLOKERA (CR 509.1a — tapnięty stwór nie blokuje),
   *   ale efekt kończy się na jego untap stepie.
   *
   * Zwraca mnożnik-premię doliczaną do wartości celu; skala dobrana tak, by
   * różnica między oknami była odczuwalna, ale nie przebijała kar za
   * tapowanie WŁASNYCH permanentów (HOSTILE_PERMANENT_EFFECTS: 45–55).
   */
  const tapTimingBonus = (view, target, { canWait = true } = {}) => {
    if (!target || target.controllerId === view.playerId) return 0;
    const step = view.turn.step;
    const attackers = view.combat?.attackers ?? [];
    const alreadyAttacking = attackers.includes(target.id);
    if (myTurn(view)) {
      // Moja tura: tapnięcie przetrwa tylko do JEGO untap stepu. Wartość ma
      // jedynie zdjęcie blokera przed moim atakiem — i tylko dopóki blok jest
      // jeszcze możliwy (po deklaracji blokujących jest już za późno).
      if (['beginning_of_combat', 'declare_attackers'].includes(step)) return 6;
      // M202/F (uwaga właściciela, Twiddle): `step === 'main'` obejmuje ZARÓWNO
      // fazę PRZED walką, jak i PO walce — TURN_STEPS ma dwa kroki o nazwie
      // 'main' (precombat_main i postcombat_main). Tapnięcie zdąży zdjąć
      // blokera tylko w precombat; po walce efekt wyparuje przy jego untapie,
      // więc to okno „main2/end” z karami poniżej.
      if (view.turn.phase === 'precombat_main' && step === 'main1'
        && (view.combat?.attackers?.length ?? 0) === 0) return 3;
      // main2/end: efekt wyparuje przy jego untapie, nic nie kupuje. Karzemy
      // TYLKO wtedy, gdy poczekanie na lepsze okno jest w ogóle wykonalne.
      // Sorcery (Aerith Rescue Mission) da się zagrać wyłącznie we własnej
      // głównej fazie — kara zamieniłaby ją w kartę nie do zagrania NIGDY,
      // a to gorsze niż tapnięcie o słabym timingu (ADR 0002: decyduje
      // deskryptor „kiedy wolno zagrać”, nie nazwa karty).
      return canWait ? -4 : 0;
    }
    // Tura przeciwnika PO jego untap: stwór traci atak TERAZ i blok U MNIE.
    if (['upkeep', 'draw'].includes(step)) return 14;
    // M202/F: jak wyżej — tylko faza PRZED walką (po walce już zaatakował).
    if (view.turn.phase === 'precombat_main' && step === 'main1' && attackers.length === 0) return 12;
    // Po deklaracji atakujących tapnięcie nie cofa ataku (CR 506.4) —
    // zostaje sam zysk „nie zablokuje w mojej turze”.
    if (alreadyAttacking) return 1;
    return 5;
  };

  /**
   * M139: pełna wycena „tapnij wrogi permanent”, wspólna dla czarów i zdolności
   * (L41 — dwie kopie tej samej logiki rozjeżdżają się cicho).
   * `locking` = efekt trzyma cel zatapniętego dłużej niż jeden untap
   * (lock_untap / dont_untap_next_untap_step), więc kara za złe okno znika:
   * blokada przetrwa jego untap step.
   */
  const tapTargetValue = (view, target, { locking = false, canWait = true } = {}) => {
    if (!target || target.controllerId === view.playerId) return 0;
    // Tapnięcie już tapniętego permanentu nic nie zmienia — poza efektem
    // blokującym odkręcanie, który dopiero wtedy pokazuje swoją wartość.
    if (target.tapped && !locking) return -12;
    // M202/F (uwaga właściciela, Twiddle): tapnięcie LANDU nie jest „zdjęciem
    // stworu z gry” — land nie atakuje i nie blokuje, a jego tapnięcie odbiera
    // wyłącznie manę, i to tylko do najbliższego untapu. Dotąd dostawał bazę +8
    // jak stwór, więc bot tapował ląd przeciwnika w swojej turze, choć ten nie
    // miał jak tej many wydać („mimo, że nie mam many, żeby wykorzystać tą
    // kartę”). Wartość landu wyznacza SAMO okno (tapTimingBonus): upkeep
    // przeciwnika +14, main przed deklaracją +12, main2/end we własnej turze -4.
    const isLand = target.kind === 'land' || (target.types ?? []).includes('Land');
    const base = isLand ? 0 : 8 + 2 * (target.power ?? 0);
    const timing = tapTimingBonus(view, target, { canWait });
    // Efekt trzymający cel (Entrancing Lyre / Spectral Prison) działa przez
    // kolejne untapy, więc nie karzemy go za „złe” okno — ale premia za okno
    // optymalne wciąż mu się należy.
    return base + (locking ? Math.max(0, timing) + 4 : timing);
  };
  /**
   * M128 (uwaga B właściciela, 2026-08-17): mana, którą DA SIĘ wydać w tej
   * chwili BEZ aktywowania dodatkowych zdolności — pula gracza plus lądy, które
   * engine i tak do-tapuje sam przy płatności (`producibleMana` w resources.js).
   *
   * Liczone z PlayerView (bot nie ma dostępu do stanu gry), więc odwzorowuje
   * regułę silnika: auto-produkcja obejmuje WYŁĄCZNIE źródła lądowe. Mana
   * z artefaktów i stworów (Seer's Lantern, Apprentice Wizard) wymaga jawnej
   * aktywacji — i to jest dokładnie ta różnica, którą trzeba wycenić.
   */
  const manaAvailableNow = (view) => {
    const pool = view.players.find((p) => p.id === view.playerId)?.mana ?? 0;
    const fromLands = view.zones.battlefield.filter((o) => o.controllerId === view.playerId
      && (o.kind === 'land' || (o.types ?? []).includes('Land')) && !o.tapped).length;
    return pool + fromLands;
  };
  const myBoardPower = (view) => myCreatures(view).reduce((sum, o) => sum + (o.power ?? 0), 0);
  /**
   * M135 — CZY TĘ KARTĘ CHCEMY DOBRAĆ? Wspólna wycena dla wszystkich decyzji
   * „zostaw na wierzchu albo odłóż/zmiel" (scry, surveil, clash).
   *
   * Powód istnienia (backlog właściciela, „wycena decyzji bota"): dotąd każda
   * z tych gałęzi liczyła osobno jeden warunek — „land przy przesycie lądów".
   * Wszystko inne dostawało tę samą liczbę (20), więc warianty remisowały
   * i bot brał PIERWSZĄ ofertę z listy. Zmierzone: przy scry 1 z Highland Game
   * (2/1 za {2}) bot odkładał dobrego, taniego stwora na spód biblioteki.
   *
   * Skala: dodatnia = chcemy dobrać, ujemna = wolimy się pozbyć. Reguły są
   * generyczne (deskryptory kind/manaCost/power — ADR 0002), zero nazw kart.
   */
  const cardKeepValue = (view, card) => {
    if (!card) return 0;
    const landsInHand = view.zones.hand.filter((o) => o.kind === 'land').length;
    const landsOnBoard = myLandCount(view);
    const isLand = (card.kind ?? '') === 'land' || (card.types ?? []).includes('Land');
    if (isLand) {
      // Land jest cenny, dopóki budujemy manabazę, i zbędny przy przesycie.
      // Próg jak dotąd (>=3 w ręce albo >=6 na stole) — zmienia się WARTOŚĆ,
      // nie próg, żeby nie ruszać sprawdzonej granicy przy okazji.
      if (landsInHand >= 3 || landsOnBoard >= 6) return -6;
      return landsOnBoard <= 3 ? 8 : 3;
    }
    // Karta niegruntowa: liczy się, czy DA SIĘ ją zagrać w rozsądnym czasie.
    // Koszt daleko poza zasięgiem to karta martwa na wiele tur.
    const cost = card.manaCost ?? 0;
    const reach = landsOnBoard + 1;            // realistycznie: +1 land na turę
    if (cost > reach + 2) return -3;           // poza zasięgiem — chętnie oddamy
    const bodyValue = 2 * (card.power ?? 0) + (card.toughness ?? 0);
    // Tani stwór z ciałem jest najlepszym dobraniem; czar bez P/T ma wartość
    // bazową (nie znamy jego treści z widoku, ale to wciąż realna karta).
    return 4 + Math.min(bodyValue, 8) - Math.max(0, cost - reach);
  };
  const enemyBoardPower = (view) => enemyCreatures(view).reduce((sum, o) => sum + (o.power ?? 0), 0);
  // M91 (A2): moc stworów przeciwnika, które JUŻ atakują — miara realnego
  // zagrożenia w tej turze (fog ratuje życie tylko wtedy, gdy coś nadlatuje).
  // M92 (audyt PlayerView): publiczne efekty prewencji/regeneracji z widoku.
  // Reguły generyczne (ADR 0002) — filtr typów jak w engine (permanents.js
  // isDamagePrevented), bez rozpoznawania kart po nazwie.
  const damageFullyPrevented = (view, object) => {
    if (!object) return false;
    for (const filter of view.preventDamageThisTurn ?? []) {
      const typesOk = (filter.typesInclude ?? []).every((type) => (object.types ?? []).includes(type));
      const kindOk = !filter.isCreature || object.kind === 'creature' || (object.types ?? []).includes('Creature');
      if (typesOk && kindOk) return true;
    }
    return false;
  };
  // Suma tarcz „prevent the next N damage" dla celu (Withstand).
  const shieldedAmount = (view, targetId) => (view.damageShields ?? [])
    .filter((shield) => shield.targetId === targetId)
    .reduce((sum, shield) => sum + (shield.remaining ?? 0), 0);
  /**
   * M237/4 (model właściciela) — WARTOŚĆ zadania `amount` obrażeń w cel
   * (stwór/gracz). JEDNO źródło prawdy dla czarów i zdolności (L41).
   *
   * `scaling` = czar SKALUJĄCY X z maną (Fireball, Consume Spirit): premium
   * zasób, którego nie wolno marnować. Reguła właściciela: rzucamy go (X≥1,
   * nigdy 0) TYLKO gdy zabija stwora o TMC ≥ 3 (albo nie-do-przejścia:
   * deathtouch/protekcja) ALBO zdejmuje ≥ 25% życia gracza (albo dobija).
   *
   * Czar/zdolność o STAŁYCH obrażeniach (Shock, Blazing Torch): prostszy model
   * — dobicie dowolnego stwora = removal; obrażenia w gracza proporcjonalne do
   * % zjedzonego życia (generalnie OK); nieletalny chip w stwora poza walką =
   * czysta strata (zakaz).
   *
   * Wspólne: „letalność" liczona z POZOSTAŁEGO życia (toughness − damage) —
   * dobicie pod-rannego małym ciosem premiowane. SIEBIE/własny stwór = zakaz.
   * Pełna prewencja / tarcza pochłaniająca cios = 0 zadanych → strata.
   */
  const damageTargetValue = (view, targetId, amount, scaling = false) => {
    const amt = Number.isInteger(amount) ? amount : 0;
    const foe = enemy(view);
    if (targetId === view.playerId) return -60 - 2 * amt;   // w SIEBIE — zakaz
    if (foe && targetId === foe.id) {
      if (amt <= 0) return -60;
      const foeLife = foe.life ?? 20;
      if (amt >= foeLife) return 1000;                      // dobicie gracza
      const pct = amt / foeLife;
      if (scaling) {
        // Skalujący: wart tylko przy ≥25% życia (inaczej trzymaj na dobicie).
        return pct >= 0.25 ? Math.round(10 + 40 * pct) : -60;
      }
      // Stały: proporcjonalnie do % zjedzonego życia (generalnie pozytywne).
      return Math.round(6 + 40 * pct);
    }
    const t = objectOnBoard(view, targetId);
    if (!t) return 0;
    if (t.controllerId === view.playerId) return -90;       // WŁASNY stwór — zakaz
    if (damageFullyPrevented(view, t) || (amt > 0 && shieldedAmount(view, t.id) >= amt)) return -70;
    const remaining = (t.toughness ?? 0) - (t.damage ?? 0); // POZOSTAŁE życie
    const lethal = amt >= remaining && remaining > 0;
    if (lethal) {
      if (scaling) {
        // Skalujący zasób (Fireball, Consume Spirit) marnujemy tylko na TANIEGO
        // chumpa BEZ znaczenia. Wart zabicia (model właściciela), gdy:
        //  - TMC ≥ 2 (obniżony próg), ALBO
        //  - deathtouch (blokuje/odstrasza mój atak), ALBO
        //  - protekcja od mojego koloru (nie do przejścia w walce), ALBO
        //  - flying/reach, a JA mam latacza, którego ten stwór może blokować.
        const tmc = t.manaCost ?? cardDef(t.cardId)?.manaCost ?? 0;
        const kw = t.keywords ?? [];
        const blocksMyFlyers = (kw.includes('flying') || kw.includes('reach'))
          && (view.zones.battlefield ?? []).some((o) => o.controllerId === view.playerId
            && o.kind === 'creature' && (o.keywords ?? []).includes('flying'));
        const worth = tmc >= 2 || kw.includes('deathtouch')
          || enemyCreatureUnbeatableInCombat(view, t) || blocksMyFlyers;
        // Kara musi PRZEBIĆ bazę czaru (spellBase ~50) + ewentualny rider
        // (gain_life przy drenach), żeby wariant zszedł poniżej passu — bot
        // trzyma skalujący zasób zamiast marnować go na tani chumpa.
        if (!worth) return -90;
      }
      return P.removalEnemyBase + P.removalWorthWeight * ((t.power ?? 0) + (t.toughness ?? 0))
        + enemyRemovalTargetBonus(view, t);
    }
    // Nieletalny cios: w oknie walki neutralny (może zmienić wynik — liczone
    // osobno); poza walką CZYSTA STRATA — zakaz.
    return combatTrickWindow(view, t) ? 0 : -80;
  };

  // Cel przeżyje „destroy", bo ma tarczę regeneracji, której nic nie blokuje.
  const willRegenerate = (view, targetId) => (view.regenerationShields ?? []).includes(targetId)
    && !(view.cantBeRegeneratedThisTurn ?? []).includes(targetId);
  // M112: siła atakujących WROGA z sekcji `combat` widoku (ADR 0017) —
  // znacznik `attacking` na kaflach zostaje wyłącznie jako fallback dla
  // starych widoków/replayów.
  const attackingEnemyPower = (view) => {
    const attackers = view.combat && view.combat.attackingPlayerId !== view.playerId
      ? (view.combat.attackers ?? [])
      : null;
    if (attackers) {
      return attackers
        .map((id) => (view.zones.battlefield ?? []).find((o) => o.id === id))
        .filter((o) => o && o.controllerId !== view.playerId)
        .reduce((sum, o) => sum + (o.power ?? 0), 0);
    }
    if (view.combat) return 0; // trwa MOJA walka — wróg nie atakuje
    return enemyCreatures(view)
      .filter((o) => o.attacking)
      .reduce((sum, o) => sum + (o.power ?? 0), 0);
  };
  const cardDef = (cardId) => (cardId ? registry.get(cardId) : undefined);

  /**
   * Który ląd z ręki zagrać, gdy jest ich więcej niż jeden (audyt bota, PR #93 t. 5).
   *
   * Przed tą zmianą `play_land` miał wycenę PŁASKĄ 90, więc przy dwóch ziemiach
   * w ręce bot brał pierwszą z listy `legalCommands`. Wybór manabazy to jedna z
   * ważniejszych decyzji w Magic, a tu była arbitralna. Skala zmierzona przez
   * `tools/bot-tie-audit.mjs` (12 partii, 1025 decyzji z alternatywami): 34,1%
   * to remis na maksimum punktów, a `play_land` był drugi co wielkość (75
   * remisów). Po naprawie: 30,4% ogólem i 39 dla lądu — wszystkie 39 to pary
   * lądów o IDENTYCZNEJ projekcji danych (dwa lasy), czyli remis uczciwy.
   *
   * Delta NIE rusza bazowej wartości grania lądu (90 — ląd nadal bije większość
   * innych akcji), tylko porusza wybór miedzy lądami. Zamienne lądy pozostaja w
   * remisie: sztuczne rozsanianie identycznych wariantów byłoby kłamstwem wyceny,
   * a strażnik ma mierzyć regułe, nie szum (L5).
   *
   * Dane wyłączenie deklaratywne (ADR 0002 — zero nazw kart w bocie): kolory
   * kandydata z DEFINICJI karty przez `manaSourceOfCardDefinition` (CR 305.6 +
   * deskryptor zdolności), kolory lądów na polu bitwy przez TE SAME rozwiazanie
   * co silnik (`getSourceForObject`), zapotrzebowanie reki przez `coloredPipsOf`
   * (tabela kosztów). `landAnaliza` liczy dane, `landPlayDelta` przekłada je na
   * punkty, `tieProjection` wystawia je do śladu — jeden źródło prawdy, inaczej
   * bramka remisów stalaby na innej arytmetyce niz wycena i milczała przy błedzie.
   */
  const manaOnlyAbility = (ability) => {
    // Zdolność, której jedyne efekty to „Add …" — czysto manowa (CR 605.1b).
    const efekty = Array.isArray(ability?.effect) ? ability.effect
      : (ability?.effect ? [ability.effect] : []);
    return efekty.length > 0 && efekty.every((e) => e?.type === 'add_mana');
  };

  /** Stan faktów o lądzie i rekem, potrzebny do wyboru (bez punktów). */
  function landAnaliza(view, objectId) {
    const ja = view.playerId;
    const karta = (view.zones.hand ?? []).find((o) => o?.id === objectId);
    const def = cardDef(karta?.cardId);
    const pola = (view.zones.battlefield ?? [])
      .filter((o) => o?.controllerId === ja && o.kind === 'land');
    const dostepne = new Map();
    for (const o of pola) {
      for (const kolor of getSourceForObject(o, null)?.colors ?? []) {
        dostepne.set(kolor, (dostepne.get(kolor) ?? 0) + 1);
      }
    }
    // Czego brakuje do zagrania kart z ręki: pip nieopłacony żadnym kolorem
    // dostepnym stale. Liczymy zapotrzebowanie (ile pipów koloru), nie liste
    // zyczen — ląd placący DWA takie pipy jest wart dwa razy wiecej.
    const potrzeby = new Map();
    for (const o of view.zones.hand ?? []) {
      if (!o || o.kind === 'land' || o.id === objectId) continue;
      for (const jednostka of coloredPipsOf(o.cardId)) {
        if (jednostka.some((k) => (dostepne.get(k) ?? 0) > 0)) continue;
        for (const k of jednostka) potrzeby.set(k, (potrzeby.get(k) ?? 0) + 1);
      }
    }
    const zrodlo = manaSourceOfCardDefinition(karta?.cardId, def, null);
    const kolory = zrodlo?.colors ?? [];
    let pokrywa = 0;
    for (const k of kolory) pokrywa += potrzeby.get(k) ?? 0;
    return {
      def, pola, potrzeby, kolory, pokrywa,
      ilosc: zrodlo?.amount ?? 1,
      nowyKolor: kolory.length > 0 && !kolory.some((k) => dostepne.get(k)),
      dodatkowaZdolnosc: (def?.abilities ?? []).some((a) => a?.type === 'activated'
        && !manaOnlyAbility(a)),
      entersTapped: Boolean(def?.entersTapped),
    };
  }

  function landPlayDelta(view, objectId) {
    const a = landAnaliza(view, objectId);
    let delta = 0;
    // Pokrycie zapotrzebowania: satysfakcja ROSNĄCA, ale nasycana poniżej sufitu
    // delty. Wcześniejsza postać (10 + min(6, n−1) DLA KAŻDEGO koloru, potem
    // wspólna klampa) zgrywała do jednego wyniku ląd pokrywający 2 i 3 kolory —
    // audyt remisorów złapał to jako remis przy różnych danych (16 takich
    // decyzji na 12 partiach). Sumaryczne pokrycie mapowane monotonicznie: 1→10, 2→12,
    // 3→14, 4→15, ≥5→16. Od 5 pipów różnica przestaje być widoczna — świadomie,
    // bo ląd nie ma prawa przeskoczyć przez to np. śmiertelnego ataku ( baza 90).
    const sygnaly = [];
    for (const k of a.kolory) if (a.potrzeby.get(k)) sygnaly.push(a.potrzeby.get(k));
    const lacznePokrycie = sygnaly.reduce((x, y) => x + y, 0);
    if (lacznePokrycie > 0) delta += [10, 12, 14, 15, 16][Math.min(4, lacznePokrycie - 1)];
    if (a.potrzeby.size > 0 && a.kolory.length === 0) delta -= 3;  // bezbarwny przy brakach koloru
    if (a.nowyKolor) delta += 3;                                    // pierwszy takiego koloru
    if (a.ilosc >= 2) delta += 4;                                   // {T}: Add {C}{C} i podobne
    if (a.entersTapped) delta -= 8;                                 // mana dopiero w nastepnej turze
    // Ląd z zdolnościa poza manową (cykl, token, tarcza) zyskuje, gdy manabaza
    // jest juz wystarczajaca — wtedy liczy sie uzytecznosc, nie kolor.
    if (a.pola.length >= 2 && a.dodatkowaZdolnosc) delta += 2;
    return Math.max(-14, Math.min(16, delta));
  }

  // ===========================================================================
  // M121 — EFEKTY OFENSYWNE WYMIERZONE WE WŁASNE PERMANENTY / W SIEBIE.
  //
  // Polecenie właściciela po audycie M120: „wszelkie efekty uszkadzające,
  // zabijające, tapujące itp. powinny mieć penalty za użycie na własne
  // permanenty i siebie. Podobnie discard/mielenie/exile na siebie.”
  //
  // Dotąd kary były dopisywane punktowo, przy okazji kolejnych zgłoszeń
  // (destroy/exile/bounce w M91, damage w M92, mill/lose_life w M96). Skutek:
  // każdy nowo dodany efekt ofensywny startował BEZ kary i bot potrafił nim
  // uderzyć w siebie (zmierzone: `tap_permanent` czarem i zdolnością,
  // `lock_untap`, aura unieruchamiająca własnego stwora).
  //
  // Tabela poniżej odwraca domyślność: efekt jest OFENSYWNY z definicji,
  // a wycena musi udowodnić, że cel należy do przeciwnika. Klucz to typ
  // efektu (deskryptor), nigdy nazwa karty (ADR 0002).
  // ===========================================================================

  /** Efekty szkodzące PERMANENTOWI — kara, gdy cel jest nasz. */
  const HOSTILE_PERMANENT_EFFECTS = new Map([
    ['damage', 60],
    ['damage_from_target_power', 60],
    // M177/A (Agate Assault): znacznik „exile zamiast śmierci” towarzyszy
    // obrażeniom — wrogi dla celu (odcina grave-recursion), nigdy we własnych.
    ['exile_if_dies_this_turn', 30],
    ['destroy_permanent', 90],
    ['destroy_if_least_power', 90],
    // M156/F2 (audyt PR #65, Divine Offering): niszczenie artefaktu z riderem
    // życia to nadal usunięcie permanentu — bez wpisu remis wariantów = baza
    // 50 i bot rzucał czar we WŁASNY artefakt-źródło many (klasa L50/M147-F1).
    ['destroy_artifact_gain_life_mana_value', 90],
    ['exile_permanent', 90],
    ['exile_target_creature', 90],
    ['exile_all', 40],
    ['bounce_permanent', 70],
    ['bounce_to_library_top', 70],
    // Batch 43 (Forced Landing): odesłanie na SPÓD biblioteki jest mocniejsze
    // od wierzchu (właściciel nie dobierze karty od razu) — 75.
    ['bounce_to_library_bottom', 75],
    // M177/D (Vanish from Sight): odesłanie na wierzch/spód biblioteki
    // właściciela — tempo-removal jak bounce_to_library_top.
    ['owner_library_top_or_bottom', 70],
    ['sacrifice_permanent', 90],
    ['player_sacrifices_creature', 90],
    ['tap_permanent', 45],
    ['tap_permanents', 45],
    ['lock_untap', 55],
    ['dont_untap_next_untap_step', 45],
    ['shrink', 45],
    ['pump_negative', 45],
  ]);

  /** Efekty szkodzące GRACZOWI — kara, gdy celem jesteśmy my sami. */
  const HOSTILE_PLAYER_EFFECTS = new Map([
    ['mill_cards', 25],
    ['mill_from_bottom', 25],
    ['discard_cards', 45],
    ['discard_each_opponent', 45],
    ['reveal_hand_choose_discard', 45],
    ['reveal_hand_choose_exile', 45],
    ['lose_life', 35],
    ['damage', 40],
    ['poison_counters_added', 45],
    ['add_poison_counters', 45],
  ]);

  /**
   * Kara za skierowanie efektu ofensywnego we własne rzeczy.
   * Zwraca liczbę punktów DO ODJĘCIA (0 = nic podejrzanego).
   *
   * Uwaga na wyjątki, które NIE są błędem i muszą przejść bez kary:
   *  - własny permanent bywa kosztem/celem świadomie (sacrifice jako koszt
   *    rzucenia obsługuje osobna gałąź `castSacrificePenalty`),
   *  - „tap” własnego stwora bywa kosztem aktywacji (crew, station) — to
   *    koszt, nie efekt, i nie przechodzi tą ścieżką,
   *  - efekt bez celu (globalny) nie jest tu oceniany.
   */
  // `isNegativePump` i `temporaryPumpOf` żyją na poziomie modułu (wspólny
  // mianownik efektów pump — patrz komentarz przy `TEMPORARY_PUMP_EFFECTS`).

  function selfHarmPenalty(view, effects, cmd, target) {
    let penalty = 0;
    const targets = cmd.targets ?? [];
    const meId = view.playerId;
    const targetsMe = targets.includes(meId);
    for (const effect of effects) {
      if (!effect?.type) continue;
      // 1. Efekt wymierzony w PERMANENT — sprawdzamy kontrolera celu.
      const permCost = HOSTILE_PERMANENT_EFFECTS.get(effect.type);
      if (permCost != null) {
        const slot = effect.targetIndex != null ? targets[effect.targetIndex] : null;
        const victim = slot ? objectOnBoard(view, slot) : target;
        if (victim && victim.controllerId === meId) {
          // Im cenniejszy własny permanent, tym gorzej.
          penalty += permCost + (victim.power ?? 0) + (victim.toughness ?? 0);
        }
      }
      // M202/G: `pump` z ujemnymi wartościami jest efektem WROGIM, a mapa
      // HOSTILE_PERMANENT_EFFECTS zna tylko `pump_negative` i `shrink` — więc
      // debuff własnego stwora (Fleeting Distraction) był bezkarny.
      if (isNegativePump(effect)) {
        const slot = effect.targetIndex != null ? targets[effect.targetIndex] : null;
        const victim = slot ? objectOnBoard(view, slot) : target;
        if (victim && victim.controllerId === meId) {
          penalty += 45 + (victim.power ?? 0) + (victim.toughness ?? 0);
        }
      }
      // 2. Efekt wymierzony w GRACZA — sprawdzamy, czy to my.
      const playerCost = HOSTILE_PLAYER_EFFECTS.get(effect.type);
      if (playerCost != null && targetsMe) {
        const amount = Number.isInteger(effect.amount) ? effect.amount : 1;
        penalty += playerCost + 2 * amount;
      }
      // 3. Efekty bez celu, które z definicji biją w nas (applyTo: self).
      if (playerCost != null && effect.applyTo === 'self') penalty += playerCost;
    }
    return penalty;
  }

  /**
   * M179/E (zlecenie właściciela): efekty PRZYJAZNE celowi — pozytywny efekt
   * wymierzony we WROGA to symetryczny błąd do selfHarmPenalty (wzmacniamy/
   * ratujemy przeciwnika własną kartą i maną). Centralna klamra: działa
   * nawet, gdy konkretna gałąź wyceny zapomni o karze (dotąd kary były
   * rozsiane po gałęziach: pump −60, add_counter −90, grant −12…).
   */
  const FRIENDLY_TARGET_EFFECTS = new Map([
    ['pump', 50], ['pump_by_creature_count', 50], ['pump_enchanted_creature', 50],
    // `buff_creature_until_end_of_turn` (Savage Surge) i `pump_by_gates`
    // nie mają tu wpisu — wpadają przez WSPÓLNY MIANOWNIK niżej
    // (`temporaryPumpOf`), żeby kolejny typ efektu o tym samym kształcie nie
    // potrzebował dopisku w trzech miejscach (zlecenie właściciela, L28).
    ['pump_by_gates', 50], ['grant_keywords_until_end_of_turn', 40],
    ['cant_be_blocked', 40], ['regenerate', 40], ['prevent_damage_this_turn', 40],
    ['set_base_pt_until_end_of_turn', 40], ['untap_permanent', 25],
  ]);
  const BENEFICIAL_COUNTERS = new Set(['+1/+1', '+1/+0', '+0/+1', 'shield']);

  /** Kara za skierowanie efektu PRZYJAZNEGO we wrogie rzeczy (M179/E). */
  function friendlyMisaimPenalty(view, effects, cmd, target) {
    let penalty = 0;
    const targets = cmd.targets ?? [];
    const enemyId = enemy(view)?.id ?? null;
    for (const effect of effects) {
      if (!effect?.type) continue;
      // M202/G: ujemny pump NIE jest efektem przyjaznym — bez tego wykluczenia
      // rzucenie debuffu we wroga dostawało karę jak wzmacnianie przeciwnika.
      // Wspólny mianownik: każdy efekt o kształcie pumpa jest przyjazny
      // (chyba że niesie ujemne P/T — M202/G), niezależnie od nazwy typu.
      const friendCost = isNegativePump(effect)
        ? null
        : (FRIENDLY_TARGET_EFFECTS.get(effect.type)
          ?? (temporaryPumpOf(effect) ? 50 : null)
          ?? (effect.type === 'add_counter' && BENEFICIAL_COUNTERS.has(effect.counter ?? '+1/+1') ? 50 : null));
      if (friendCost != null) {
        const slot = effect.targetIndex != null ? targets[effect.targetIndex] : null;
        const beneficiary = (slot ? objectOnBoard(view, slot) : null) ?? target;
        if (beneficiary && beneficiary.controllerId && beneficiary.controllerId !== view.playerId) {
          penalty += friendCost + (beneficiary.power ?? 0);
        }
      }
      // Życie dla PRZECIWNIKA (gain_life_target w cel-gracza).
      if (effect.type === 'gain_life_target' && enemyId != null) {
        const slot = targets[effect.targetIndex ?? 0] ?? null;
        if (slot === enemyId) penalty += 30 + (effect.amount ?? 1);
      }
    }
    return penalty;
  }

  /**
   * M212/Z7 (audyt Żywym Testerem): kara za CEL przy rzucie DARMOWYM
   * (suspend / rebound — CR 702.62a, 702.97).
   *
   * Root cause zgłoszenia: obie gałęzie wyceniały wyłącznie TYP efektu
   * („czy czar jest ofensywny"), a silnik enumeruje ofertę PER ZESTAW CELÓW.
   * Każda oferta dostawała więc identyczny wynik i bot brał pierwszą z brzegu
   * — zmierzone (dominaria vs tarkir): rebound Ojutai's Breath tapnął
   * WŁASNEGO Trade Route Envoy, choć na stole stał stwór przeciwnika.
   * Ścieżka `cast_spell` liczy to od M121; te dwie były jej ślepą kopią
   * (klasa L41 — bliźniacze gałęzie rozjeżdżają się w ciszy).
   *
   * Reguła generyczna po deskryptorze efektu (ADR 0002): efekt wrogi we
   * własny permanent oraz efekt przyjazny we wrogi permanent są karane
   * dokładnie tymi samymi tabelami co przy zwykłym rzucie.
   */
  /**
   * Wartość wrappera „apply to each target” (Wrap in Flames: „1 damage to
   * each of up to three target creatures”) — liczona PER CEL, bo warianty
   * różnią się ICH LICZBĄ (CR 601.2c: „up to N targets” wybiera gracz).
   * Wyciągnięte z wyceny `cast_spell` w audycie PR #93 (znalezisko F), żeby
   * okna rzutu spoza ręki (`resolve_grave_free_cast`, `resolve_madness_cast`,
   * `resolve_exile_cast`) liczyły to SAMO — inaczej wszystkie warianty
   * remisowały i bot brał pierwszy z brzegu, w tym jałowy (L74/M233).
   */
  function wrapTargetsValue(view, effect, cmd) {
    let score = 0;
    if (effect?.type !== 'apply_to_each_target') return 0;
    const inner = Array.isArray(effect.effects) ? effect.effects : [];
    const hasDamage = inner.some((x) => x?.type === 'damage');
    const hasCantBlock = inner.some((x) => x?.type === 'cant_block');
    // M233/2 (audyt Żywym Testerem, Sea God's Scorn): wrapper może nieść
    // efekt USUWAJĄCY permanent (bounce/destroy/exile). Bez wyceny celu
    // odbicie WŁASNEGO stwora zostawało na bazie 50 i bot odbijał
    // swojego stwora na rękę (strata tempa). Reguła jak górny
    // REMOVAL_EFFECTS: cel własny = strata, wroga = zysk (ADR 0002).
    const WRAP_REMOVAL = new Set([
      'bounce_permanent', 'bounce_to_library_top', 'bounce_to_library_bottom',
      'destroy_permanent', 'exile_permanent', 'exile_target_creature',
    ]);
    const hasRemoval = inner.some((x) => WRAP_REMOVAL.has(x?.type));
    if (hasDamage || hasCantBlock || hasRemoval) {
      for (const slot of cmd.targets ?? []) {
        const t3 = objectOnBoard(view, slot);
        if (!t3) continue;
        const mine = t3.controllerId === view.playerId;
        if (hasDamage) score += mine ? -60 : 12 + (t3.power ?? 0) * 2;
        else if (hasCantBlock) score += mine ? -10 : 8;
        if (hasRemoval) {
          // Uwaga L39/L48: wrappery z removal-efektami wewnętrznymi
          // celują wyłącznie w stwory/enchantmenty (spec z deskryptora,
          // np. creature_or_enchantment), więc „czysty ląd" nigdy nie
          // staje się celem — reguła M247 jest tu z założenia pusta.
          score += mine
            ? -90
            : P.removalEnemyBase + P.removalWorthWeight * ((t3.power ?? 0) + (t3.toughness ?? 0))
              + enemyRemovalTargetBonus(view, t3); // M234
        }
      }
    }
  
    return score;
  }

  /**
   * Efekty WYBRANEGO wariantu czaru w oknie rzutu spoza ręki: tryb modalny
   * niesie własne efekty (`modes[i].effects`), a czar niemodalny — listę z
   * deskryptora. Bez tego okna wyceniały `spell.effects` (puste dla czarów
   * modalnych) i nie odróżniały wariantów (audyt PR #93, znalezisko F).
   */
  function freeCastVariantEffects(card, cmd) {
    const spell = card?.spell ?? null;
    if (!spell) return [];
    if (cmd?.modeIndex != null) return spell.modes?.[cmd.modeIndex]?.effects ?? [];
    return spell.effects ?? [];
  }

  /**
   * Wspólna wycena wariantu czaru w oknie „rzutu spoza ręki": baza (karta
   * za darmo albo za {X}) − kara za nieprzyjazny cel + wartość per cel
   * (wrapper „each target”) oraz odmowa, gdy czar jest TERAZ jałowy (M233:
   * „up to three targets” bez celów to wyrzucona karta).
   */
  function freeCastVariantScore(view, effects, cmd, base) {
    if (effects.length > 0 && allEffectsInertNow(view, effects, cmd)) return -40;
    let score = base - freeCastTargetPenalty(view, effects, cmd);
    for (const effect of effects) score += wrapTargetsValue(view, effect, cmd);
    return score;
  }

  function freeCastTargetPenalty(view, effects, cmd) {
    const target = objectOnBoard(view, (cmd.targets ?? [])[0]) ?? null;
    return selfHarmPenalty(view, effects, cmd, target)
      + friendlyMisaimPenalty(view, effects, cmd, target);
  }

  /**
   * Czy AURA/załącznik jest wrogą kotwicą (unieruchamia, blokuje atak)?
   * Taka aura na WŁASNYM stworze to strzał we własną stopę — a wycena
   * `cast_permanent` premiowała ją jak buff (+66), bo patrzyła tylko na to,
   * czy gospodarz jest nasz.
   */
  function auraIsHostile(descriptor, def) {
    if (descriptor) {
      if (descriptor.cantAttack || descriptor.cantBlock) return true;
      if (descriptor.locksUntap || descriptor.doesntUntap) return true;
      const pump = descriptor.pump;
      if (pump && ((pump.power ?? 0) < 0 || (pump.toughness ?? 0) < 0)) return true;
      if ((descriptor.losesKeywords ?? []).length > 0) return true;
    }
    // Wrogość bywa zapisana nie w deskryptorze aury, lecz w jej TRIGGERZE
    // wejścia (Spectral Prison: `enter_battlefield` → `lock_untap`, czyli
    // „enchanted creature doesn't untap"). Bez tego aura-kotwica wyglądała
    // dla bota jak zwykły buff za +66 pkt.
    const abilities = def?.abilities ?? [];
    if (abilities.some((ability) => {
      if (ability?.type !== 'triggered') return false;
      if (ability.trigger?.event !== 'enter_battlefield') return false;
      const effs = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
      return effs.some((e) => e?.type && HOSTILE_PERMANENT_EFFECTS.has(e.type));
    })) return true;
    // M206 (audyt Zywym Testerem, Chronic Flooding): aura bywa wroga przez
    // trigger DZIALAJACY POZNIEJ, ktory bije w KONTROLERA GOSPODARZA -
    // „Whenever enchanted land becomes tapped, its controller mills three
    // cards". Warunki wyzej patrza wylacznie na trigger wejscia i na efekty
    // wrogie PERMANENTOWI, wiec taka aura wygladala jak zwykly buff:
    // zmierzone (dominaria vs ravnica, seed 19) bot zaczarowal WLASNY Island
    // i mielil sobie po 3 karty przy kazdym tapnieciu tego landu - piec razy
    // w jednej partii („Nieprzyjaciel mieli Forced Landing do grobu",
    // „... mieli Forest do grobu").
    //
    // Rozpoznajemy to po deskryptorze, nie po nazwie karty (ADR 0002):
    // `applyTo: 'enchanted_controller'` mowi wprost, ze skutek spadnie na
    // kontrolera zaczarowanego permanentu, a HOSTILE_PLAYER_EFFECTS zna liste
    // efektow szkodzacych graczowi (mill, discard, utrata zycia...).
    return abilities.some((ability) => {
      if (ability?.type !== 'triggered') return false;
      const effs = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
      return effs.some((e) => e?.applyTo === 'enchanted_controller'
        && e?.type && HOSTILE_PLAYER_EFFECTS.has(e.type));
    });
  }
  const hasKeyword = (object, keyword) => (object?.keywords ?? []).includes(keyword);
  const canAttackNow = (object) => Boolean(object) && !object.tapped && !object.summoningSickness;

  /**
   * M288/C (uwaga właściciela z żywej gry, 2026-09-02): JEDNA definicja tego,
   * co equipment REALNIE daje danemu nosicielowi.
   *
   * Zgłoszenie: „Bot w jednej turze przełożył Thieves' Tools dwukrotnie — raz
   * wyposażył jednego swojego stwora, a zaraz po chwili drugiego. To bez sensu:
   * po co wydawał manę na wyposażenie pierwszego, skoro zaraz chciał go
   * przełożyć na drugiego? To trzeba ukrócić."
   *
   * Zmierzone repro (ta para kart, `attachedTo` na własnym stworze):
   * przeniesienie sprzętu na Maruta (7/7) wyceniało się na +11,00, bo gałąź
   * przeniesienia liczyła WYŁĄCZNIE `delta = power(cel) − power(nosiciel)`.
   * Thieves' Tools nie ma pompy, a jego warunkowa ewazja
   * (`cantBeBlockedMaxPower: 3`) jest na 7/7 martwa — czyli zapłacone {2} za
   * nic. Wycena M244 (D/G/F) już to umiała, ale była wgałęziona tylko przy
   * PIERWSZYM założeniu sprzętu. Stąd wspólny predykat dla obu gałęzi (L28).
   *
   * `value` to tylko porządek wielkości (do porównania nosicieli); liczby,
   * które trafiają do scoringu, są w wywołaniach — jedno źródło faktów, nie
   * jedno źródło wagi (patrz L119 o metryce gorszej od modelu).
   */
  function equipValuation(view, source, creature) {
    const def = source?.equipment;
    if (!def || !creature) return { value: 0, nothingAdded: true };
    const grants = def.keywords ?? [];
    const keywords = new Set([...(creature.keywords ?? []), ...(creature.grantedKeywords ?? [])]);
    const freshGrants = grants.filter((kw) => !keywords.has(kw));
    const pumpPower = def.pump?.power ?? 0;
    const pumpToughness = def.pump?.toughness ?? 0;
    const hasteAdds = freshGrants.includes('haste') && creature.summoningSickness === true;
    const blockers = untappedEnemyBlockers(view);
    const effectivePower = (creature.power ?? 0) + (creature.grantedPower ?? 0);
    const conditionalEvasion = def.cantBeBlockedMaxPower != null
      && effectivePower <= def.cantBeBlockedMaxPower;
    const grantsEvasion = (freshGrants.includes('flying')
      && blockers.every((o) => !hasKeyword(o, 'flying') && !hasKeyword(o, 'reach')))
      || conditionalEvasion;
    // F (M244): nosiciel, który nie może atakować, nie wyciąga nic z grantu
    // ofensywnego — zostaje mu tylko P/T do obrony.
    const ofensywne = creature.cantAttackStatic === true ? 0 : ((grantsEvasion ? 8 : 0) + (hasteAdds ? 6 : 0));
    // M289 (tura 10, dopowiedzenie do tej samej zasady): „ile warta jest pompa"
    // zależy od tego, czy nosiciel umie ją spożytkować. Ciało, które legalnie NIE
    // atakuje (defender/detain/aura), albo takie, którego obrażenia są zapobiegane
    // przez ochronę blokerów (CR 702.16c — jałowy atak), liczy tylko część
    // obronną siły: +1 siły wciąż zabija atakującego w bloku, ale nie robi
    // krzywdy graczowi. Bez tego gałąź przeniesienia stała jak zaklęta: równy co
    // do siły defender zatrzymywał sprzęt u siebie, choć przeniesienie za {1}
    // było poprawką planszy (pytanie kontrolne właściciela, tura 10).
    const atakJałowy = creature.cantAttackStatic === true
      || (!grantsEvasion && attackerNeutralizedByProtection(creature, blockers));
    // M290 (tura 11): ten sam haczyk, tylko o stopień wyżej — pompa na ciele,
    // ktorego cios i tak dojdzie, jest warte wiecej niz pompa na ciele, ktorego
    // cios trzeba najpierw przebic przez sciane. Nosiciel z lataniem (albo
    // „nie do zablokowania") wbrew blokerom bez latania/reacha zbiera +1 do wagi
    // kazdego punktu sily. To NIE jest nowe „premiowanie latania" — to ta sama
    // zasada co ewazja GRANTOWANA przez sprzet (linia wyzej), tylko tym razem
    // czytana ze stanu nosiciela. Antysymetria drabiny nietknieta: wartosc wciaz
    // jest funkcja pary (sprzet, nosiciel, widok), a nie kierunku ruchu.
    const bearingEvasion = creature.cantBeBlocked === true
      || (hasKeyword(creature, 'flying')
        && blockers.every((o) => !hasKeyword(o, 'flying') && !hasKeyword(o, 'reach')));
    const wagaSily = atakJałowy ? 1 : (2 + (bearingEvasion ? 1 : 0));
    const value = wagaSily * pumpPower + pumpToughness + ofensywne;
    const nothingAdded = pumpPower === 0 && pumpToughness === 0 && !grantsEvasion && !hasteAdds
      && freshGrants.every((kw) => kw === 'haste');
    return { value, nothingAdded };
  }

  /**
   * Kara za rzucenie czaru/zagranie permanentu, gdy kontroler ma na polu bitwy
   * stwora z triggerem „when you cast a spell" (Illusory Demon — poświęcenie
   * źródła). Wartość stracimy przy każdym czarze — generyczny deskryptor.
   */
  function castSacrificePenalty(view) {
    let penalty = 0;
    for (const object of myCreatures(view)) {
      const def = cardDef(object.cardId);
      const hasTrigger = (def?.abilities ?? []).some((a) => a?.trigger?.event === 'when_you_cast_spell');
      if (hasTrigger) penalty += 4 + 2 * (object.power ?? 0) + (object.toughness ?? 0);
    }
    return penalty;
  }

  function enemyAttackPower(view) {
    // Podczas własnego okna bloków przeciwnik ma już zadeklarowanych atakujących
    // na planszy jako tapped — przybliżamy zagrożenie sumą siły wrogich stworów.
    return enemyCreatures(view).reduce((sum, o) => sum + (o.power ?? 0), 0);
  }

  /** Otwarta mana przeciwnika: pula + nietapnięte landy (land creatures też). */
  function opponentOpenMana(view) {
    const foe = enemy(view);
    const untapped = view.zones.battlefield.filter((o) => o.controllerId !== view.playerId
      && (o.kind === 'land' || (o.types ?? []).includes('Land')) && !o.tapped).length;
    return (foe?.mana ?? 0) + untapped;
  }

  /**
   * M297/B (uwaga właściciela): WIDOCZNE „kupno deathtouch" — nietapnięty
   * stwór przeciwnika z aktywowaną zdolnością dającą sobie deathtouch do
   * końca tury (klasa Death-Hood Cobra). Zdolność celuje w siebie, więc
   * aktywować może się tylko sam bloker — stąd wymóg „nietapnięty" (bloker
   * musi przeżyć do walki). Zwraca najtańszy koszt many takiej zdolności
   * albo null. Bez nazw kart (ADR 0002) — po deskryptorach zdolności.
   */
  function visibleDeathtouchActivatorCost(view) {
    let best = null;
    for (const object of view.zones.battlefield) {
      if (object.controllerId === view.playerId || object.tapped) continue;
      if (object.kind !== 'creature' && !(object.types ?? []).includes('Creature')) continue;
      for (const ability of cardDef(object.cardId)?.abilities ?? []) {
        if (ability?.type !== 'activated') continue;
        const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
        const grantsDeathtouch = effects.some((e) => e?.type === 'grant_keywords_until_end_of_turn'
          && (e?.keywords ?? []).includes('deathtouch'));
        if (!grantsDeathtouch) continue;
        const cost = ability.cost?.mana ?? 0;
        if (best === null || cost < best) best = cost;
      }
    }
    return best;
  }

  /**
   * P(przeciwnik trzyma w ręce ≥1 karty z mapy czarów). Model hipergeometryczny
   * (B3): N = nieznane karty przeciwnika (biblioteka + ręka), K = kopie
   * „odpowiedzi" jeszcze niewidziane (tal − kopie w strefach publicznych:
   * pole bitwy, grób, exile, stos — adaptacja do obserwowanego zachowania),
   * n = ręka przeciwnika.
   */
  function probOpponentHolds(view, spellMap) {
    if (!spellMap.size) return 0;
    const foeHand = view.zones.hand.filter((o) => o.controllerId !== view.playerId).length;
    const foeLib = view.zones.library.filter((o) => o.controllerId !== view.playerId).length;
    const N = foeLib + foeHand;
    if (N <= 0 || foeHand <= 0) return 0;
    let totalCopies = 0;
    let visible = 0;
    for (const [id, info] of spellMap) {
      totalCopies += info.copies;
      for (const zone of ['battlefield', 'graveyard', 'exile', 'stack']) {
        visible += view.zones[zone]?.filter((o) => o.controllerId !== view.playerId && o.cardId === id).length ?? 0;
      }
    }
    return probAtLeastOne(N, Math.max(0, totalCopies - visible), foeHand);
  }

  const commandFamily = (type) => {
    if (type === 'play_land') return 'land';
    if (type === 'tap_for_mana') return 'mana';
    if (type === 'cast_permanent' || type === 'cast_adventure_creature') return 'permanent';
    if (type === 'cast_spell' || type === 'cast_cleave' || type === 'cast_adventure' || type === 'plot_card' || type === 'suspend_card' || type === 'warp_card' || type === 'draw_card') return 'spell';
    if (type === 'activate_ability' || type === 'resolve_backup' || type === 'resolve_scry' || type === 'resolve_surveil' || type === 'resolve_clash_choice' || type === 'resolve_room_target' || type === 'resolve_undercity_route' || type === 'resolve_fabricate' || type === 'resolve_sacrifice_choice' || type === 'resolve_food_choice' || type === 'resolve_discover_choice' || type === 'resolve_explore_choice' || type === 'resolve_craft_exile' || type === 'resolve_hand_creature' || type === 'resolve_devour_choice' || type === 'resolve_endure_choice' || type === 'resolve_delirium_target' || type === 'resolve_mentor_target' || type === 'resolve_graveyard_top_choice' || type === 'resolve_legend_choice' || type === 'resolve_reveal_order' || type === 'resolve_proliferate' || type === 'resolve_damage_target' || type === 'resolve_modal_choice' || type === 'resolve_redirect_choice' || type === 'resolve_discard_choice' || type === 'resolve_hand_top_choice' || type === 'resolve_land_type_choice' || type === 'resolve_library_placement' || type === 'resolve_search_choice' || type === 'resolve_fertile_thicket' || type === 'resolve_springbloom' || type === 'resolve_pay_or_sacrifice' || type === 'resolve_optional_pay_choice' || type === 'resolve_counter_pay_choice' || type === 'resolve_ward_pay_choice' || type === 'resolve_trigger_target' || type === 'resolve_optional_trigger_choice' || type === 'resolve_moonlit_choice' || type === 'resolve_mulligan_choice' || type === 'resolve_mulligan_bottom_choice' || type === 'resolve_damage_assignment' || type === 'resolve_optional_draw' || type === 'resolve_exploit_choice' || type === 'resolve_reveal_exile_hand' || type === 'resolve_reveal_exile_grave' || type === 'resolve_look_top_choice' || type === 'resolve_satyr_look_choice' || type === 'resolve_epic_choice' || type === 'resolve_suspend_cast' || type === 'resolve_rebound_cast' || type === 'resolve_enter_as_copy' || type === 'resolve_destroy_equipment_choice' || type === 'resolve_replacement_choice' || type === 'resolve_copy_targets' || type === 'resolve_opponent_target' || type === 'resolve_damage_division' || type === 'resolve_grave_free_cast' || type === 'resolve_exile_cast') return 'ability';
    if (type === 'declare_attackers' || type === 'resolve_combat') return 'attack';
    if (type === 'declare_blockers') return 'block';
    return null;
  };

  /**
   * M179/A1 + M218/3 (zlecenie właściciela 2026-08-26): wartość grantu
   * keywordów-do-EOT dla WŁASNEGO stwora — WSPÓLNE dla zdolności i czarów.
   *
   * Kryteria właściciela (etap 3):
   * - flying na atakujących, gdy przeciwnik NIE MA latających/reach (wtedy
   *   stwór staje się nieblokowalny — CR 509.1b);
   * - reach tylko na blokujących PRZED ustaleniem bloków, gdy nadlatuje
   *   atak z flying, i tylko gdy stwór MOŻE blokować (nie tapped, nie
   *   cantBlock);
   * - first_strike/double_strike/deathtouch tylko gdy zmienia wynik walki
   *   (helper keywordChangesOutcome z Etapu 2).
   */
  function keywordGrantWindowValue(view, recipient, fresh) {
    const combat = view.combat ?? null;
    const attacking = Boolean(combat?.attackers?.includes(recipient.id));
    const blocking = Object.values(combat?.blockers ?? {}).some((ids) => (ids ?? []).includes(recipient.id));
    const hasFlyingAttackers = enemyHasFlyingAttackers(view);
    const hasUntappedFlyingBlocker = enemyHasUntappedFlyingOrReachBlocker(view);
    let value = 0;
    for (const kw of fresh) {
      if (kw === 'reach') {
        // M218/3: reach ma sens wyłącznie defensywnie, PRZED blokami,
        // gdy przeciwnik atakuje z powietrza, a nasz stwór MOŻE blokować.
        // M173/E2 już to sprawdzał, ale pomijał `cantBlock` (l. 827 tylko
        // `tapped`). Teraz generycznie po deskryptorze (ADR 0002).
        const canBlock = !recipient.tapped && !recipient.cantBlock;
        value += (hasFlyingAttackers && canBlock
          && view.turn.step === 'declare_blockers' && !blocking) ? 8 : -10;
      } else if (kw === 'flying') {
        // M218/3: flying na ATAKUJĄCYCH gdy wróg NIE MA latających/reach —
        // wtedy atakujący staje się nieblokowalny (CR 702.9 + 509.1b).
        // Na BLOKUJĄCYCH — jak reach: tylko gdy nadlatuje flying.
        if (attacking) {
          // Już atakuje: jeśli wróg ma flyera/reach, który może zablokować,
          // latanie nie czyni go nieblokowalnym — brak wartości (kara, żeby
          // nie palić many na efekt jałowy — L3).
          value += hasUntappedFlyingBlocker ? -10 : 2 + (recipient.power ?? 0);
        } else if (blocking) {
          // Już blokuje — za późno na nadanie reach/flying.
          value += -10;
        } else if (view.turn.step === 'declare_blockers' && hasFlyingAttackers) {
          // Okno obrony: nie jest jeszcze blokerem, ale może nim zostać.
          const canBlock = !recipient.tapped && !recipient.cantBlock;
          value += canBlock ? 8 : -10;
        } else if (myTurn(view) && canAttackNow(recipient)
          && ['precombat_main', 'combat'].includes(view.turn.phase)) {
          // Przed własnym atakiem: latanie ma sens tylko gdy wróg nie ma
          // odpowiedzi w powietrzu.
          value += hasUntappedFlyingBlocker ? -2 : 2 + (recipient.power ?? 0);
        } else {
          value -= 10;
        }
      } else if (['first_strike', 'double_strike', 'deathtouch', 'trample'].includes(kw)) {
        // M218/3: first strike / double strike / deathtouch / trample mają
        // wartość tylko gdy ZMIENIAJĄ wynik toczącej się wymiany (helper
        // z Etapu 2). Np. 2/1 w 3/1 z FS — bez FS ginie przed zadaniem
        // obrażeń (CR 510.4), z FS zabija i przeżywa.
        if (!(attacking || blocking)) {
          value += -10;
        } else if (keywordChangesOutcome(view, recipient, [kw])) {
          value += kw === 'deathtouch' ? 8 : kw === 'trample' ? 2 + (recipient.power ?? 0) : 6;
        } else {
          // Okno jest, ale skutek zerowy — jak pump 1/1 vs 5/5 (kryterium
          // właściciela). Kara musi przebić premię, żeby nie remisować z
          // passem (L3).
          value += -10;
        }
      } else if (['lifelink', 'indestructible'].includes(kw)) {
        // Trick starcia: dopiero gdy stwór bierze udział w walce.
        // Dla lifelink/indestructible nie liczymy meaningfulness tak
        // rygorystycznie (lifelink zawsze daje życie przy obrażeniach),
        // ale okno musi być bojowe.
        value += (attacking || blocking) ? (kw === 'lifelink' ? 4 : 6) : -10;
      } else if (['menace', 'haste'].includes(kw)) {
        // Evasion/agresja: nasz atak — zadeklarowany albo tuż przed.
        if (attacking) value += 2 + (recipient.power ?? 0);
        else if (myTurn(view) && canAttackNow(recipient)
          && ['precombat_main', 'combat'].includes(view.turn.phase)) value += 2 + (recipient.power ?? 0);
        else value -= 10;
      } else if (kw === 'vigilance') {
        // M221/D (zgłoszenie właściciela, Bladed Sentinel „{W}: vigilance do
        // końca tury"): vigilance = „nie tapuje się, gdy atakuje" (CR 702.21).
        // Ma sens WYŁĄCZNIE, gdy stwór zaraz zaatakuje w MOJEJ turze i jest
        // odkręcony — wtedy zachowa blok po ataku. Bot wykupywał ją w turze
        // przeciwnika (gdzie nie atakuje) i nawet na ZATAPNIĘTYM stworze —
        // podwójne marnotrawstwo many. Reguła po STANIE (moja tura + zaraz
        // atak + odkręcony), nie po nazwie kroku (L42/L64), bez nazw kart.
        if (attacking) {
          // Już atakuje — jeśli jeszcze nietapnięty, vigilance zatrzyma go
          // odkręconego do obrony; wartość rośnie z jego wytrzymałością.
          value += !recipient.tapped ? 2 + (recipient.toughness ?? 0) : -10;
        } else if (myTurn(view) && canAttackNow(recipient)
          && ['precombat_main', 'combat'].includes(view.turn.phase)
          && ['main1', 'beginning_of_combat', 'declare_attackers'].includes(view.turn.step)) {
          // Przed własnym atakiem, stwór gotowy — vigilance kupuje blok po ataku.
          value += 2 + (recipient.toughness ?? 0);
        } else {
          value -= 10;
        }
      } else {
        // Pozostałe (hexproof...): tylko w oknach walki.
        value += ['declare_attackers', 'declare_blockers', 'combat_damage'].includes(view.turn.step) ? 1 : -8;
      }
    }
    return value;
  }

  function weightedScore(commandType, score) {
    if (!Number.isFinite(score)) return score;
    const family = commandFamily(commandType);
    return family ? score * scoreWeights[family] : score;
  }

  // C-R2 (audyt Batch53): cele triggerów spoza pola bitwy (grób/wygnanie —
  // strefy jawne, CR 400.2/406.3; widok niesie kind/types/P/T/manaCost, M274).
  // Wcześniej karty-grobu wypadały z objectOnBoard → 0 pkt → remis → bot
  // brał PIERWSZĄ kartę grobu (Ironclad, Mystic Sanctuary, Circle Druid).
  // Wartość: stwór po P/T (jak na stole), reszta po koszcie (wzorzec
  // craft_exile); znak jak dla celów na stole — friendly premiuje WŁASNE
  // karty (zwracamy własną), wroga gałąź wroga.
  const openZoneCard = (view, id) => (view.zones.graveyard ?? []).find((o) => o.id === id)
    ?? (view.zones.exile ?? []).find((o) => o.id === id) ?? null;
  const offBoardCardValue = (o) => {
    const def = o?.cardId ? cardDef(o.cardId) : undefined;
    const types = o?.types ?? def?.types ?? [];
    if ((o?.kind ?? def?.kind) === 'creature' || types.includes('Creature')) {
      return ((o?.power ?? def?.power ?? 0) ?? 0) * 2 + ((o?.toughness ?? def?.toughness ?? 0) ?? 0);
    }
    return (o?.manaCost ?? def?.manaCost ?? 0) * 2;
  };
  const offBoardTargetScore = (view, o, friendly) => {
    const v = offBoardCardValue(o);
    const own = o.controllerId === view.playerId;
    return friendly ? (own ? 30 + v : -20 - v) : (own ? -20 - v : 30 + v);
  };

  function scoreCommand(view, cmd) {
    const finish = (score) => weightedScore(cmd.type, score);
    // M111: TRYB modalnego triggera („At the beginning of your upkeep,
    // choose one —" Etherwrought Page). Widok niesie tylko nazwy trybów,
    // więc treść bierzemy z rejestru po cardId (jak przy czarach) i wyceniamy
    // generycznie po TYPACH efektów — bez nazw kart (ADR 0002). Wcześniej
    // wszystkie tryby miały tę samą wycenę i bot brał pierwszy z listy.
    if (cmd.type === 'resolve_modal_choice' && cmd.modeIndex != null) {
      const pending = view.pendingModalTrigger;
      const def = pending?.cardId ? cardDef(pending.cardId) : undefined;
      const ability = (def?.abilities ?? []).find((entry) => Array.isArray(entry?.trigger?.modes));
      const modeEffects = ability?.trigger?.modes?.[cmd.modeIndex]?.effects ?? [];
      if (modeEffects.length === 0) return finish(0);
      if (allEffectsInertNow(view, modeEffects, cmd)) return finish(-40);
      const foe = enemy(view);
      const self = view.players.find((p) => p.id === view.playerId);
      let modeScore = 10;
      for (const effect of modeEffects) {
        const amount = effect.amount ?? 1;
        if (effect.type === 'lose_life' || effect.type === 'damage_each_opponent') {
          // Dobicie przeciwnika kończy partię — to zawsze najlepszy tryb.
          modeScore += amount >= (foe?.life ?? 20) ? 80 : 4 * amount;
        } else if (effect.type === 'gain_life') {
          modeScore += (self?.life ?? 20) <= 5 ? 4 * amount : amount;
        } else if (effect.type === 'draw_cards') {
          modeScore += 6 * amount;
        } else if (effect.type === 'damage') {
          modeScore += 5 + 2 * amount;
        } else if (effect.type === 'surveil' || effect.type === 'scry') {
          modeScore += 3;
        } else if (effect.type === 'create_token') {
          modeScore += 8;
        }
      }
      return finish(modeScore);
    }
    switch (cmd.type) {
      case 'concede': return finish(NEVER);
      case 'draw_card': return finish(100);
      case 'play_land': return finish(90 + landPlayDelta(view, cmd.objectId));
      case 'tap_for_mana': {
        // Własne kroki początkowe/końcowe: mana wyparuje na końcu kroku,
        // a land zostaje zatapiany całą turę — gorzej niż pass.
        if (wastefulStep(view)) return finish(-15);
        // Tap ma sens tylko przy czymś do zagrania w ręce; inaczej zostaw priorytet.
        const hasPlayable = view.zones.hand.some((o) => (o.manaCost ?? 0) > 0 && o.kind !== 'land');
        return finish(hasPlayable ? 80 : 1);
      }
      case 'resolve_suspend_cast': {
        // Jednorazowa decyzja po zdjęciu ostatniego licznika: rzut ZA DARMO
        // (ignorując timing) jest niemal zawsze lepszy niż zostawienie karty
        // w exile na stałe — chyba że czar nie ma sensownego celu.
        if (!cmd.cast) return finish(0);
        const exiled = cmd.cardId ? view.zones.exile.find((o) => o.id === cmd.cardId) : null;
        const effects = exiled?.spell?.effects ?? [];
        let score = 70;
        for (const effect of effects) {
          if (['damage', 'discard_cards', 'destroy_permanent', 'mill_cards'].includes(effect?.type)) score += 15;
          if (['draw_cards', 'gain_life'].includes(effect?.type)) score += 5;
        }
        score -= freeCastTargetPenalty(view, effects, cmd);
        return finish(score);
      }
      case 'resolve_rebound_cast': {
        // Rebound (CR 702.97): jednorazowa decyzja na początku następnego
        // upkeepu — rzuć wygnany czar ZA DARMO (ignorując timing) albo zostaw
        // w exile na stałe. Jak suspend: rzut niemal zawsze lepszy niż strata
        // karty — chyba że czar nie ma sensownego celu.
        if (!cmd.cast) return finish(0);
        const exiled = cmd.cardId ? view.zones.exile.find((o) => o.id === cmd.cardId) : null;
        const effects = exiled?.spell?.effects ?? [];
        let score = 70;
        for (const effect of effects) {
          if (['damage', 'discard_cards', 'destroy_permanent', 'mill_cards'].includes(effect?.type)) score += 15;
          if (['draw_cards', 'gain_life'].includes(effect?.type)) score += 5;
        }
        score -= freeCastTargetPenalty(view, effects, cmd);
        return finish(score);
      }
      case 'warp_card': {
        // Warp (EOE): alternatywny koszt rzutu z ręki (niższy od normalnego).
        // Wartość jak zwykły rzut permanentu, ale bez many normalnej — za koszt
        // warp. Bot porównuje z cast_permanent i wybiera tańszy wariant.
        const card = handCard(view, cmd.objectId) ?? zoneCard(view, cmd.objectId);
        const def = card ? cardDef(card.cardId) : undefined;
        if (!card?.warp) return finish(-20);
        let score = P.creatureBase + (card?.power ?? 0) * P.creaturePowerWeight + (card?.toughness ?? 0) * P.creatureToughnessWeight;
        // Wygnanie w końcowym kroku to realna wada (stracimy stwora zaraz
        // potem) — kara za tymczasowość, niższa od zysku z wejścia (ETB).
        score -= 15;
        // ETB licznik (jeśli definicja ma taki trigger) — mały bonus.
        if ((def?.abilities ?? []).some((a) => a?.trigger?.event === 'enter_battlefield')) score += 5;
        if (wastefulStep(view)) return finish(-30);
        return finish(score);
      }
      case 'suspend_card': {
        const card = handCard(view, cmd.objectId);
        if (!card?.suspend) return finish(-20);
        // Suspend to ODROCZENIE czaru o N tur: wartościowe dopiero, gdy nie
        // da się rzucić od razu (za mało many) — wtedy koszt {B} za 4 tury
        // czekania to inwestycja. Przy wystarczającej manie zwykły rzut jest
        // lepszy — suspen dostaje wyraźnie niższy score niż cast_spell.
        const manaNeeded = card.manaCost ?? 0;
        return finish(manaNeeded > manaAvailableNow(view) ? 30 : 8);
      }
      case 'plot_card': {
        const card = handCard(view, cmd.objectId);
        if (!card?.plot) return finish(-20);
        // Plot to odroczenie czaru: wartość bazowa jest niższa niż natychmiastowe
        // zagranie, ale dodatnia, gdy karta ma efekt tokenowy/board-building.
        let score = 55;
        for (const effect of card.spell?.effects ?? []) {
          if (effect.type === 'create_token') score += 12;
          if (effect.type === 'mill_cards') score += 2;
        }
        return finish(score);
      }
      case 'cast_permanent': {
        const card = handCard(view, cmd.objectId);
        if (cmd.bestow || cmd.targets?.length) {
          // Czar aury (bestow albo czysta aura): +N/+N i keywordy na stworze.
          // Opłaca się tym bardziej, im większy gospodarz; stwór PRZECIWNIKA
          // wzmacniany własnym zaczarowaniem jest błędem — wariant odrzucany.
          const target = cmd.targets?.[0] ? objectOnBoard(view, cmd.targets[0]) : null;
          const descriptor = cmd.bestow ? card?.bestow : card?.aura;
          // M121: aura bywa KOTWICĄ, nie buffem (Spectral Prison — „doesn't
          // untap"; Hobble — „can't attack"). Taką zakładamy PRZECIWNIKOWI;
          // na własnym stworze to strzał we własną stopę, a wycena
          // premiowała ją jak każdą aurę, bo patrzyła tylko na to, czy
          // gospodarz jest nasz.
          if (auraIsHostile(descriptor, card ? cardDef(card.cardId) : undefined)) {
            if (!target) return finish(-P.auraNoTargetPenalty);
            const worth = (target.power ?? 0) + (target.toughness ?? 0);
            // M200/H (uwaga właściciela, Grounded): aura, KTÓRA ODBIERA
            // keyword (losesKeywords), na stworze bez niego jest jałowa —
            // bot marnował Grounded na stwora bez latania („karta służy
            // do uziemiania latających”). Sprawdzamy efektywne keywordy
            // celu (widok niesie granty — spójnie z warstwą odbioru, patrz
            // notes karty). Żaden usunięty keyword nieobecny = kara
            // miażdżąca (L3: kara musi przebić premię); gdy żaden cel go
            // nie ma, bot nie rzuca czaru w ogóle.
            const lostKeywords = descriptor?.losesKeywords ?? [];
            if (lostKeywords.length > 0
              && !lostKeywords.some((k) => (target.keywords ?? []).includes(k))) {
              return finish(-P.auraLosesKeywordsWastedPenalty - P.auraHostileWorthWeight * worth);
            }
            return finish(target.controllerId === view.playerId
              ? -P.auraHostileOwnPenalty - P.auraHostileWorthWeight * worth      // unieruchamiam własnego stwora
              : P.auraHostileEnemyBase + P.auraHostileEnemyWorthWeight * worth); // unieruchamiam stwora wroga
          }
          if (!target || target.controllerId !== view.playerId) return finish(-P.auraNoTargetPenalty);
          // M209 (audyt M207, Guildscorn Ward): aura, ktorej CALA wartoscia
          // jest OCHRONA przed konkretna jakoscia (CR 702.16b-e), jest jalowa,
          // gdy przeciwnik nie ma czym w nia uderzyc. Bot rzucal „protection
          // from multicolored" przy przeciwniku majacym 1 karte wielokolorowa
          // na 48 — placil karte i mane za nic. To ta sama klasa co M200/H
          // (Grounded na stworze bez latania).
          //
          // Generycznie po deskryptorze (ADR 0002): reguła dotyczy aur BEZ
          // pump i BEZ keywordow, o STAŁEJ jakosci ochrony. `chooseColor`
          // (Benevolent Blessing) jest wykluczony — tam kolor dobiera sie pod
          // przeciwnika przy wejsciu, wiec aura nigdy nie jest jalowa.
          //
          // Zasieg wiedzy = FoW bota (bez oszukiwania): pole bitwy przeciwnika
          // + jego grob i wygnanie (strefy jawne, CR 400.2) — czyli to, co
          // przeciwnik JUZ pokazal. Reka i biblioteka pozostaja ukryte.
          const protectionQuality = descriptor?.protection ?? null;
          const pumpDesc = descriptor?.pump ?? { power: 0, toughness: 0 };
          const isPureProtection = protectionQuality
            && !descriptor?.chooseColor
            && (pumpDesc.power ?? 0) === 0 && (pumpDesc.toughness ?? 0) === 0
            && (descriptor?.keywords ?? []).length === 0;
          // M235 (zlecenie właściciela): aura FLASH, której cała wartość jest
          // OCHRONNĄ sztuczką bojową — pure-protection (stała jakość) ALBO
          // chooseColor-protection (Benevolent Blessing, kolor dobierany przy
          // wejściu) — bez pumpa i keywordów. Taka aura NIC nie robi poza walką
          // (nikt nie atakuje/blokuje), więc rzucona w upkeepie/kroku bez walki
          // marnuje elastyczność instanta. Reguła po deskryptorze (ADR 0002).
          const cardIsFlash = (cardDef(card?.cardId)?.keywords ?? card?.keywords ?? []).includes('flash');
          // Ochrona pochodzi z jawnej `protection` (stała jakość) ALBO z
          // `chooseColor` (Benevolent Blessing — kolor dobierany przy wejściu).
          const grantsProtection = Boolean(protectionQuality) || Boolean(descriptor?.chooseColor);
          const isProtectionTrick = grantsProtection
            && (pumpDesc.power ?? 0) === 0 && (pumpDesc.toughness ?? 0) === 0
            && (descriptor?.keywords ?? []).length === 0;
          // Okno użyteczne dla aury-sztuczki ochronnej:
          //  - walka z udziałem gospodarza (atakuje/blokuje teraz), LUB
          //  - moja Główna 1 z gospodarzem gotowym do ataku (ustawiam atak).
          const protectionTrickHasWindow = combatTrickWindow(view, target)
            || (myTurn(view) && view.turn.phase === 'precombat_main' && canAttackNow(target));
          const offWindowFlashProtectionPenalty = (cardIsFlash && isProtectionTrick && !protectionTrickHasWindow)
            ? P.flashProtectionAuraOffWindowPenalty : 0;
          if (isPureProtection) {
            const known = [
              ...(view.zones.battlefield ?? []),
              ...(view.zones.graveyard ?? []),
              ...(view.zones.exile ?? []),
            ].filter((o) => o.controllerId !== view.playerId);
            // `sourceHasProtectionQuality` to ta sama funkcja, ktorej uzywa
            // silnik przy rozstrzyganiu ochrony (L41: jedna reguła, jeden
            // odczyt) — bot nie ma wlasnej kopii semantyki „multicolored".
            const threats = known.filter((o) => sourceHasProtectionQuality(protectionQuality, o)).length;
            // Kara musi PRZEBIC baze aury (~P.auraBase) — inaczej jest
            // dekoracja (L3/L54). Brak zagrozen = nie rzucaj, trzymaj karte w rece.
            if (threats === 0) return finish(-P.auraProtectionNoThreatPenalty);
            // Sa zagrozenia: wartosc rosnie z ich liczba, ale ochrona bez
            // pumpa nie jest tempem — zostaje ponizej zwyklego buffa.
            // M235: flash-aura ochronna poza oknem walki — kara (trzymaj kartę).
            return finish(P.auraProtectionBase + P.auraProtectionThreatWeight * threats + (target.power ?? 0) - offWindowFlashProtectionPenalty);
          }
          const pump = pumpDesc;
          // M235: chooseColor-protection (Benevolent Blessing) trafia tu (nie do
          // isPureProtection) — kara okna dotyczy też jej, gdy jest flash i poza walką.
          return finish(P.auraBase + P.auraBuffWorthWeight * ((target.power ?? 0) + pump.power) + ((target.toughness ?? 0) + pump.toughness)
            - offWindowFlashProtectionPenalty);
        }
        const def = card ? cardDef(card.cardId) : undefined;
        let score = P.creatureBase + (card?.power ?? 0) * P.creaturePowerWeight + (card?.toughness ?? 0) * P.creatureToughnessWeight;
        // AUDYT REMISÓW (tura 6, `tools/bot-tie-audit.mjs`): gałąź wyceniała
        // CIAŁO, ale nie CENĘ — stwór 2/2 za {2} i ten sam 2/2 za {6} miały
        // identyczny wynik, więc przy dwóch stworach w ręce wybór zapadał
        // w kolejności `legalCommands`. To nie subtelność, tylko brak danych:
        // mana wydana na ciało to mana, której nie wydasz na drugie ciało ani
        // na kontrę, a „tempo" jest podstawową miarą wartości w Magic.
        // Waga 1/pt many jest celowo mniejsza niż waga siły (2/pt): płacenie za
        // większy korpus pozostaje opłacalne, dopóki korpus jest większy.
        score -= P.creatureManaCostWeight
          * ((card?.manaCost ?? 0) + coloredPipsOf(card?.cardId ?? '').length);
        // M258/A (uwaga właściciela, Squire's Lightblade): wartość equipmentu
        // żyje na NOSICIELU. Rzut przy braku własnych kreatur to marnowanie:
        // ETB „attach za darmo" fizzluje (CR 603.4b), a karta czeka na stole
        // za koszt equipu (tu {3} zamiast 0). Baza P.creatureBase (70 — tyle
        // co stwór 0/0) nie zna tego kontekstu, więc bot rzucał flash-equipment
        // na pusty stół. Reguła generyczna po deskryptorze (ADR 0002):
        //  - bez nosiciela: kara PONIŻEJ passu (trzymaj kartę; gdy stwór jest
        //    w ręce — grany jest PRZED equipmentem, bo ma wyższy score, a
        //    wtedy ETB znajdzie legalny cel),
        //  - z nosicielem: premia za pompę na stwora (attach sam wycenia
        //    scoring Equip — M244 — więc tu tylko P/T, bez podwójnego
        //    liczenia keywordów).
        if (card?.equipment) {
          const etbAttach = (def?.abilities ?? []).some((a) => a?.type === 'triggered'
            && a.trigger?.event === 'enter_battlefield'
            && a.trigger?.requiresTarget?.type === 'creature_you_control'
            && (Array.isArray(a.effect) ? a.effect : [a.effect]).some((e) => e?.type === 'attach_self_to_target'));
          if (myCreatures(view).length === 0) {
            score -= etbAttach ? 100 : 75;
          } else {
            const pump = card.equipment.pump ?? {};
            score += (pump.power ?? 0) * P.creaturePowerWeight + (pump.toughness ?? 0) * P.creatureToughnessWeight;
          }
        }
        // M146 (Jwari Shapeshifter): enterAsCopy bez celu na stole = 0/0,
        // który ginie od SBA zanim ETB się odpali (CR 704.5e). Nie zagrywaj.
        if (def?.enterAsCopy?.subtype) {
          const targets = view.zones.battlefield.filter((o) => (o.subtypes ?? []).includes(def.enterAsCopy.subtype));
          if (targets.length === 0) return finish(-60);
        }
        // M103/A (zgłoszenie właściciela): obowiązkowy ETB trigger „obrażenia
        // celowemu stworowi + obrażenia kontrolerowi" (Forge Devil) przy
        // PUSTYM stole ma jedyny legalny cel — samego wchodzącego stwora:
        // stwór ginie, kontroler traci życie, karta i mana zmarnowane.
        // Generycznie (ADR 0002): trigger wejścia z requiresTarget creature
        // i efektami damage + damage_to_controller.
        const etbPingAndSelfPain = (def?.abilities ?? []).some((a) => {
          if (a?.type !== 'triggered' || a.trigger?.event !== 'enter_battlefield') return false;
          if (a.trigger?.requiresTarget?.type !== 'creature') return false;
          const effs = Array.isArray(a.effect) ? a.effect : [a.effect];
          return effs.some((e) => e?.type === 'damage') && effs.some((e) => e?.type === 'damage_to_controller');
        });
        const anyCreatureOnBoard = [...myCreatures(view), ...enemyCreatures(view)].length > 0;
        if (etbPingAndSelfPain && !anyCreatureOnBoard) score -= 80;
        // M169/K (uwaga właściciela, Phyrexian Rager): ETB „you lose N life"
        // poniżej progu życia to samookaleczenie — przy 2 życia bot schodził
        // do 1 „przy okazji". Generycznie: skan triggerów wejścia pod kątem
        // utraty życia/obrażeń kontrolera (scope controller / applyTo self /
        // damage_to_controller). Poniżej progu — kara miażdżąca; powyżej —
        // symboliczna (karta ma być grywalna przy zdrowym życiu).
        let etbSelfDmg = 0;
        for (const ability of def?.abilities ?? []) {
          if (ability?.type !== 'triggered' || ability.trigger?.event !== 'enter_battlefield') continue;
          const effs = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
          for (const e of effs) {
            if (e?.type === 'damage_to_controller') etbSelfDmg += e.amount ?? 0;
            if (e?.type === 'lose_life' && (e.scope === 'controller' || e.applyTo === 'self')) etbSelfDmg += e.amount ?? 0;
          }
        }
        if (etbSelfDmg > 0) {
          const life = myLife(view);
          // Twarde progi: zejście do <= 2 życia lub poniżej zera = odmowa
          // (bazowe 70 za stwora nie może wygrać z ryzykiem); przy zdrowym
          // życiu koszt symboliczny (karta pozostaje grywalna).
          if (life - etbSelfDmg <= 0) return finish(-1000); // samobójstwo
          if (life <= 5 && life - etbSelfDmg <= 2) return finish(-80);
          else if (life <= 5) score -= 15 * etbSelfDmg;
          else score -= 2 * etbSelfDmg;
        }
        // Stwór, który wraca po śmierci (persist) albo reanimuje z grobu
        // przeciwnika, jest wart więcej niż same statystyki — deskryptory
        // generyczne (keyword/trigger), zero nazw kart.
        if (hasKeyword(def, 'persist')) score += 5;
        const reanimates = (def?.abilities ?? []).some((a) => a?.trigger?.event === 'enter_battlefield'
          && (Array.isArray(a.effect) ? a.effect : [a.effect]).some((e) => e?.type === 'reanimate_under_your_control'));
        if (reanimates) {
          const bestInFoeGraveyard = view.zones.graveyard
            .map((o) => o)
            .filter((o) => o.controllerId !== view.playerId && o.kind === 'creature')
            .reduce((max, o) => Math.max(max, (o.power ?? 0)), 0);
          score += 2 * bestInFoeGraveyard;
        }
        // Evasion (flying) realnie zwiększa szanse zadania obrażeń.
        if (hasKeyword(def, 'flying')) score += 3;
        // Rozwój do parytetu liczby stworów — obrona przed aggro.
        if (myCreatures(view).length < enemyCreatures(view).length) score += 4;
        // Zagranie kolejnego permanentu poświęci własnego demona (Illusory
        // Demon: „when you cast a spell" obejmuje też stwory) — kara.
        score -= castSacrificePenalty(view);
        // Phyrexian mana (CR 118.9): każdy symbol opłacony życiem kosztuje
        // 2 życia — bot woli manę (wariant k=0 jest najtańszy), a warianty
        // życiowe w ogóle nie są oferowane, gdy życie ich nie wytrzymuje.
        if (cmd.phyrexianPayWithLife != null && cmd.phyrexianPayWithLife > 0) {
          score -= 2 * cmd.phyrexianPayWithLife;
        }
        // C-R1 (audyt Batch53, zlecenie właściciela 2026-09-05): gałąź
        // wyceniała CIAŁO − koszt, ale nie PREMIĘ ETB — stwór z „When this
        // creature enters, draw/destroy/token/anthem" remisował z gołym
        // ciałem (i przegrywał z tańszym). Tabela po TYPACH efektów
        // (ADR 0002); cele wymagane (requiresTarget) premiowane tylko, gdy
        // przeciwnik ma pasujący permanent (przybliżenie z widoku — FoW).
        // Świadome wykluczenia (przeciw podwójnemu liczeniu): reanimate
        // (premia +2×moc wyżej), attach_self_to_target (gałąź equipment),
        // damage_to_controller/lose_life (kary M169/K). Typy poza tabelą → 0
        // (zachowanie bez zmian).
        score += etbEnterBonusValue(view, def, { kicked: cmd.kicked === true, offspring: cmd.offspring === true });
        // C-R7 (audyt Batch53): warianty kicker/offspring dopiero co zdobyły
        // WARTOŚĆ (warunkowe ETB liczone wyżej), więc teraz uczciwie liczymy
        // ich KOSZT — dopłata opłacalna, tylko gdy premia przewyższa manę.
        if (cmd.kicked === true) {
          const kk = def?.kicker ?? {};
          score -= P.creatureManaCostWeight * ((kk.cost ?? 0) + (kk.colors?.length ?? 0));
        }
        if (cmd.offspring === true) {
          const oo = def?.offspring ?? {};
          score -= P.creatureManaCostWeight * ((oo.cost ?? 0) + (oo.colors?.length ?? 0));
        }
        // Grzechotka remisów (audyt-bot-walka-remisy, tura 6): przy EX AEQUO
        // rzutów różnica gęstości wartości („waluta" z tieProjection:
        // ciało − waga×koszt, z pumpą equipment) MUSI przechodzić na wynik —
        // inaczej remis „przy różnych danych" wygląda jak przeoczenie wyceny.
        // Epsilon rozstrzyga TYLKO idealne remisy (kroki wyceny są ≥ 0.1,
        // więc 0.001 nigdy nie odwraca realnej różnicy) na korzyść karty
        // gęstszej w przeliczeniu na manę. Koszt z REJESTRU (def) zamiast z
        // obiektu: pin arytmetyczny ceny-stwora różnicuje manaCost POZIOMO
        // OBIEKTU tej samej karty — epsilon ma być ślepy na to, co jest
        // sztuczką testu, a widoczne na to, co różni karty naprawdę; dopłaty
        // kicker/offspring dokładamy, by warianty TEJ SAMEJ karty (identyczna
        // waluta w projekcji, różne flagi) też nie remisowały.
        const epsKoszt = (def?.manaCost ?? 0) + coloredPipsOf(card?.cardId ?? '').length
          + (cmd.kicked === true ? ((def?.kicker?.cost ?? 0) + (def?.kicker?.colors?.length ?? 0)) : 0)
          + (cmd.offspring === true ? ((def?.offspring?.cost ?? 0) + (def?.offspring?.colors?.length ?? 0)) : 0);
        const epsPump = (myCreatures(view).length > 0 && card?.equipment) ? (card.equipment.pump ?? {}) : {};
        const epsCialo = (def?.power ?? 0) * P.creaturePowerWeight + (def?.toughness ?? 0) * P.creatureToughnessWeight
          + (epsPump.power ?? 0) * P.creaturePowerWeight + (epsPump.toughness ?? 0) * P.creatureToughnessWeight;
        score += 0.001 * (epsCialo - P.creatureManaCostWeight * epsKoszt);
        return finish(score);
      }
      case 'resolve_escape_exile': {
        const costSum = (cmd.exileIds ?? []).reduce((sum, exId) => {
          const o = view.zones.graveyard.find((entry) => entry.id === exId);
          return sum + (o ? escapeExileCostOf(view, o) : 0);
        }, 0);
        return finish(-costSum);
      }
      case 'cast_spell':
      case 'cast_cleave':
      case 'cast_escape':
      case 'cast_flashback':
      case 'cast_adventure': {
        // M103/D: Escape/Flashback grają kartę z GROBU — handCard jej nie
        // widzi, a bez deskryptora czar dostawał 60 pkt „na ślepo" (bot
        // mielił samego siebie i wyganiał własne karty za darmo w wycenie).
        const card = handCard(view, cmd.objectId) ?? zoneCard(view, cmd.objectId);
        // Strefy „jawne" widoku (grób, wygnanie) potrafią nieść tylko id+cardId
        // — deskryptor czaru bierzemy wtedy wprost z rejestru (ADR 0002).
        // M173/A (Gray Slaad): PRZYGODA to czar z deskryptora adventure —
        // dotąd cast_adventure w ogóle nie trafiał do tej gałęzi (bez wyceny
        // efektów bot nigdy nie wybierał przygody — klasa L50).
        const spell = cmd.type === 'cast_adventure'
          ? (card?.adventure?.spell ?? (card?.cardId ? cardDef(card.cardId)?.adventure?.spell : undefined))
          : (card?.spell ?? (card?.cardId ? cardDef(card.cardId)?.spell : undefined));
        if (!spell) return finish(60);
        const target = cmd.targets?.[0] ? objectOnBoard(view, cmd.targets[0]) : null;
        // M111: czar MODALNY trzyma treść w `spell.modes[i].effects`, a górne
        // `spell.effects` jest puste — bez tego każdy wariant trybu dostawał
        // te same 50 pkt i bot brał pierwszy z listy (Selesnya Charm zawsze
        // „Pump"). Wyceniamy efekty WYBRANEGO trybu, więc reszta wyceny
        // (usunięcie permanentu, tokeny, obrażenia) działa bez zmian.
        const modalEffects = (cmd.modeIndex != null && Array.isArray(spell.modes))
          ? (spell.modes[cmd.modeIndex]?.effects ?? [])
          : null;
        const effects = modalEffects
          ?? ((cmd.type === 'cast_cleave' && spell.cleave ? spell.cleave.effects : spell.effects) ?? []);
        // M247 anti-overfix (Vandalize „Zniszcz ląd"): kara „czysty ląd jako
        // cel removalu" NIE obejmuje efektów ZAPROJEKTOWANYCH pod niszczenie
        // lądów — rozpoznajemy je po specu celu z deskryptora: slot typu
        // 'land' (i tylko 'land') oznacza nienawiść intencjonalną.
        const modalTargets = modalEffects ? (spell.modes[cmd.modeIndex]?.targets ?? []) : null;
        const targetSpecAt = (idx) => (modalTargets ?? spell.targets ?? [])[idx]?.type ?? null;
        const removalAtLandByDesign = (idx) => targetSpecAt(idx) === 'land';
        // M106/Z2b: czar, którego CAŁA treść jest teraz pusta (0 tokenów, brak
        // stworów do osłabienia, pusty grób), to wyrzucona karta — nie rzucamy.
        if (allEffectsInertNow(view, effects, cmd)) return finish(-70);
        let score = P.spellBase;
        // Phyrexian mana (CR 118.9): jak gałąź cast_permanent — bot woli manę
        // (wariant k=0 jest najtańszy; życiowe dostępne, gdy życie wytrzymuje).
        if (cmd.phyrexianPayWithLife != null && cmd.phyrexianPayWithLife > 0) {
          score -= 2 * cmd.phyrexianPayWithLife;
        }
        // M146 (Twiddle — czysto-utylitarny czar): tap/untap nie ma „bazowej
        // wartości" jak obrażenia czy tokeny — cała jego wartość siedzi w
        // EFEKCIE na konkretnym celu. Przy bazie 50 bot rzucał Twiddle na
        // górę wroga w swoim upkeepie (50 - 12 = 38 nadal > pass), bo kara
        // za zły cel nie miała jak przebić domyślnej premii. Czysto-utylitarny
        // czar startuje od zera: wariant z dobrym celem sam się wynagradza,
        // wariant z bezcelowym celem schodzi poniżej passu.
        const isUtilityOnly = effects.length > 0 && effects.every((e) => e?.type
          && ['tap_permanent', 'tap_permanents', 'untap_permanent', 'lock_untap',
            'dont_untap_next_untap_step', 'cant_be_blocked', 'cant_block',
            'creatures_cant_block_this_turn',
            'buff_opponents_creatures', 'buff_creatures_you_control'].includes(e.type));
        // Start PONIŻEJ passu (0): czysto-utylitarny czar z bezcelowym celem
        // (tap własnego landa, tap już zatapniętego, odkręcenie wroga) ma
        // przegrać z passem — przy starcie od 0 remis szedł w rzut (sort
        // stabilny, czary przed passem w legalCommands).
        if (isUtilityOnly) score = -1;
        score -= castSacrificePenalty(view);
        // M103/D: koszt Escape — wygnanie własnych kart z grobu to realna
        // strata (stworami więcej niż landami/innymi). Bez tego bot uciekał
        // wariantem niszczącym własny cmentarz, bo wszystkie warianty miały
        // ten sam wynik wyceny.
        if (cmd.type === 'cast_escape') {
          // M241/M103/D: koszt kosztu wygnania nie leci już W komendzie
          // (zgłoszenie J — enumeracja podzbiorów zniknęła), więc kary liczymy
          // od PLANOWANEGO wyboru kosztu: N najtańszych kandydatów z własnego
          // grobu. Bot, który miałby wypłacić 4 dobrych stworów za mill 4,
          // nadal schodzi poniżej passu (anti-over-fix antyD).
          const escapeDef = spell?.escape ?? null;
          const candidates = view.zones.graveyard
            .filter((o) => o.id !== cmd.objectId && o.controllerId === view.playerId);
          const values = candidates.map((o) => escapeExileCostOf(view, o)).sort((a, b) => a - b);
          const need = escapeDef?.exileCount ?? 0;
          if (need > 0 && values.length >= need) {
            score -= values.slice(0, need).reduce((sum, v) => sum + v, 0);
          }
        }
        // M120 (decyzja właściciela po audycie M119/Z7): kontrczar wycelowany
        // we WŁASNY czar to samobójstwo — bot płaci manę, żeby unieważnić
        // własną, już opłaconą kartę (koszty rzucenia kontrowanego czaru
        // przepadają, CR 701.5a). Oferta zostaje legalna dla CZŁOWIEKA
        // (są niszowe powody, np. odcięcie triggera przeciwnika), ale bot
        // nie ma jej brać.
        //
        // Rozpoznanie jest generyczne (ADR 0002): patrzymy na efekt
        // `counter_spell` i na kontrolera CELU na stosie, nie na nazwę karty.
        // Batch 44 (Frightful Delusion): „counter unless pays" to słabszy
        // kontrczar (przeciwnik może się wykupić za {1}), ale ta sama klasa
        // decyzji — nigdy we własny czar; premia jak counter_spell.
        // Audyt PR #93: `counter_ability` (Stifle) to ta sama klasa decyzji —
        // nigdy we własną zdolność (koszt już zapłacony, CR 118.12 nie zwraca
        // nic), a cel bez wpływu oznacza „trzymaj kontrę".
        if (effects.some((effect) => effect?.type === 'counter_spell' || effect?.type === 'counter_spell_unless_pays'
          || effect?.type === 'counter_ability')) {
          const stack = view.zones.stack ?? [];
          const targets = cmd.targets ?? [];
          const ownTarget = targets.some((id) => {
            const entry = stack.find((item) => item.id === id);
            return entry && entry.controllerId === view.playerId;
          });
          const foeTarget = targets.some((id) => {
            const entry = stack.find((item) => item.id === id);
            return entry && entry.controllerId !== view.playerId;
          });
          if (ownTarget && !foeTarget) return finish(-90);
          if (ownTarget) score -= 60;
          // M237/2 (audyt Żywym Testerem): kontrujemy WROGI czar, ale wartość
          // kontry zależy od tego, CO powstrzymuje. Bot kontrował trywialne
          // czary 1-many (Twiddle, Dream Twist — self-mill, samotny tap) tak
          // samo chętnie jak Fireball czy removal — marnował kontrę, która
          // mogłaby zatrzymać realne zagrożenie. Reguła: gdy kontrowany czar
          // NISKIEGO WPŁYWU (brak groźnych efektów wg deskryptora), trzymaj
          // kontrę (schodzi poniżej passu). Deskryptor z widoku stosu
          // (spell.effects/modes), zero nazw kart (ADR 0002).
          if (foeTarget && !ownTarget) {
            const HIGH_IMPACT = new Set([
              'destroy_permanent', 'destroy_if_least_power', 'exile_permanent',
              'exile_target_creature', 'bounce_permanent', 'return_to_hand',
              'damage', 'fireball_resolve', 'draw_cards', 'create_token',
              'gain_control_until_end_of_turn', 'counter_spell', 'discard_cards',
              'pump', 'apply_to_each_target', 'reanimate_under_your_control',
            ]);
            const targetImpactful = targets.some((id) => {
              const entry = stack.find((item) => item.id === id && item.controllerId !== view.playerId);
              if (!entry) return false;
              // Duży czar (TMC ≥ 3) uznajemy za wart kontry niezależnie od efektu.
              if ((entry.manaCost ?? 0) >= 3) return true;
              const effs = [
                ...((entry.spell?.effects) ?? []),
                ...((entry.spell?.modes ?? []).flatMap((m) => m.effects ?? [])),
                // Zdolność na stosie nie ma `spell` — jej deskryptor mieszka w
                // `abilityEffects` (playerView, audyt PR #93). [x].flat() bo
                // efekt zdolności bywa pojedynczym obiektem, nie tablicą.
                ...[entry.abilityEffects].flat().filter(Boolean),
              ];
              // Sam tap/untap/self-mill/scry jednego permanentu = niski wpływ.
              return effs.some((e) => HIGH_IMPACT.has(e?.type));
            });
            if (!targetImpactful) score -= 60; // trywialny cel — trzymaj kontrę
          }
        }
        if (spell.fireball) {
          // M236/4 (audyt + KOREKTA właściciela): Fireball to zasób SKALUJĄCY
          // z maną — dzieli X po równo (zaokr. w dół) między cele. Zasada jak
          // przy zwykłym spaleniu (M236/5): trzymaj go na cel, który DOBIJESZ
          // (stwór ginie / gracz umiera), albo na gracza gdy zadasz ISTOTNĄ
          // ilość obrażeń. Trywialny chip = trzymaj (schodzi poniżej passu).
          // Wycena per-cel z widoku (ADR 0017), zero nazw kart (ADR 0002).
          // M237/4: Fireball dzieli X po równo (zaokr. w dół) między cele —
          // każdy cel wyceniamy wspólnym damageTargetValue (stwór wg pozostałego
          // życia, gracz proporcjonalnie do %, SIEBIE/własny = zakaz). Jedno
          // źródło prawdy z czarami/zdolnościami (L41).
          const ids = cmd.targets ?? [];
          const perTarget = Math.floor((cmd.xValue ?? 0) / Math.max(1, ids.length));
          for (const tid of ids) score += damageTargetValue(view, tid, perTarget, true);
        }
        // M121: generyczna bramka „nie strzelaj do siebie" — obejmuje KAŻDY
        // efekt ofensywny z tabeli, także te dodane w przyszłości.
        score -= selfHarmPenalty(view, effects, cmd, target);
        // M179/E: symetria — efekt przyjazny wycelowany we wroga.
        score -= friendlyMisaimPenalty(view, effects, cmd, target);
        // M149/A3 (uwaga właściciela): dodatkowy koszt „poświęć stwora"
        // (Bone Splinters, Village Rites) — poświęcenie WŁASNEGO stwora to
        // strata. Czar niszczący (destroy) opłaca się tylko, gdy niszczymy
        // cenniejszego stwora (por. TMC — właściciel: „porównać Total Mana
        // Cost; opłaca się tylko gdy TMC zabijanej jest wyższy"). Dla czarów
        // bez destroy (Village Rites) pomniejszamy po prostu o wartość ofiary.
        if (cmd.sacrificeTargetId) {
          const victim = objectOnBoard(view, cmd.sacrificeTargetId);
          if (victim) {
            const sacValue = (victim.power ?? 0) * 2 + (victim.toughness ?? 0) + (victim.manaCost ?? 0);
            const hasDestroy = effects.some((e) => e?.type && ['destroy_permanent', 'destroy_if_least_power'].includes(e.type));
            const targetCreature = target && target.kind === 'creature';
            const tmc = (targetCreature ? target.manaCost ?? 0 : 0);
            const tmcSac = victim.manaCost ?? 0;
            if (hasDestroy && targetCreature) {
              // Wymiana TMC (uwaga właściciela): poświęcenie opłaca się TYLKO,
              // gdy TMC zabijanej kreatury jest WYŻSZE niż TMC poświęcanej.
              // Przy TMC równym albo niższym to zła wymiana — kara tak duża,
              // żeby cały wariant zszedł poniżej passu (0).
              if (tmc > tmcSac) {
                score -= Math.max(0, sacValue - (2 * (target.power ?? 0) + (target.toughness ?? 0)));
              } else {
                // TMC celu NIE jest wyższe — to zła wymiana. Wystarczająco duża
                // kara, żeby PRZEBIĆ bazowe 50 + premię za destroy: bez
                // poświęcenia czar jest bezwartościowy.
                score -= 120;
              }
            } else {
              score -= sacValue; // czysta strata (np. Village Rites dobiera za poświęcenie)
            }
          }
        }
        // M237/1 (audyt Żywym Testerem, Consume Spirit): czar X-cost niesie
        // efekty z dynamiczną ilością `amount: 'X'` (damage/gain_life). Wycena
        // czytała `effect.amount` jako nie-liczbę → traktowała jako 0, więc
        // WSZYSTKIE warianty X miały tę samą ocenę i bot brał X=0 (0 obrażeń,
        // 0 życia — 2 many za nic). Rozwiązujemy `'X'` do wybranego `cmd.xValue`
        // ZANIM efekty trafią do wyceny (damage/gain_life same policzą lethal/
        // wartość). Generycznie po deskryptorze X (ADR 0002), nie po nazwie.
        const xResolved = cmd.xValue ?? 0;
        const scoredEffects = (effects ?? []).map((e) => (
          e && e.amount === 'X' ? { ...e, amount: xResolved } : e
        ));
        for (const effect of scoredEffects) {
          // M91 (uwaga C właściciela): efekty USUWAJĄCE permanent (destroy,
          // exile, bounce) nie miały ŻADNEJ wyceny — czar dostawał domyślne
          // 50 pkt niezależnie od tego, czyj jest cel, więc bot niszczył
          // Shatterem własny Great Furnace. Reguła generyczna (ADR 0002):
          // usunięcie WŁASNEGO permanentu to strata, usunięcie permanentu
          // PRZECIWNIKA — zysk skalowany jego wartością.
          const REMOVAL_EFFECTS = new Set([
            'destroy_permanent', 'destroy_if_least_power',
            'destroy_artifact_gain_life_mana_value',
            'exile_permanent', 'exile_target_creature',
            'bounce_permanent', 'bounce_to_library_top',
            'bounce_to_library_bottom',
          ]);
          if (REMOVAL_EFFECTS.has(effect.type) && target) {
            // M92: „destroy" w cel z aktywną tarczą regeneracji tylko ją
            // zużyje — permanent zostaje na stole, a my tracimy kartę.
            if (effect.type === 'destroy_permanent' && willRegenerate(view, target.id)) {
              // Zagranie jałowe: tarcza regeneracji zostanie zużyta, permanent
              // zostaje na stole, a my tracimy kartę. Nie tylko karzemy, ale
              // POMIJAMY premię za „usunięcie permanentu wroga" — inaczej
              // premia przebijała karę i bot i tak rzucał czar.
              score -= 70;
              continue;
            }
            if (target.controllerId === view.playerId) {
              // Niszczenie własnego permanentu bez powodu to czysta strata
              // (karta + zasób ze stołu); kara musi przebić bazowe 50 pkt,
              // żeby „bo nie ma innego celu" nie wygrywało z passem.
              score -= 90;
            } else if (pureLandTarget(target) && !removalAtLandByDesign(effect.targetIndex ?? 0)) {
              // M247: bez premii removalu i z karą przebijającą bazę czaru —
              // pass musi wygrać z „rzucam, bo jest dowolny cel".
              score -= P.removalPureLandPenalty;
            } else {
              const worth = (target.power ?? 0) + (target.toughness ?? 0);
              score += P.removalEnemyBase + P.removalWorthWeight * worth;
              // M234 — efektywność removalu: TMC (proxy zdolności) + cele „nie
              // do przejścia" w walce (deathtouch, protekcja od mojego koloru).
              score += enemyRemovalTargetBonus(view, target);
            }
          }
          // M91 (uwaga A2): globalna prewencja obrażeń bojowych („fog" —
          // Inspire Awe) działa na obrażenia OBU stron. We własnej turze
          // kasuje więc własny atak; wartość ma wyłącznie w turze przeciwnika,
          // kiedy to on atakuje. Zgłoszenie właściciela: bot rzucił Inspire
          // Awe w swojej turze, po czym zaatakował w tę prewencję.
          if (effect.type === 'prevent_combat_damage_except_enchanted') {
            const myTurn = view.turn.activePlayerId === view.playerId;
            // M167/F: kara musi przebić WSZYSTKO (baza + wycena scry przy
            // pełnej bibliotece dawały remis z passem, a remis wybierał
            // czar — bot rzucał fog we własnej turze).
            if (myTurn) score -= 300;
            // M236 (audyt Żywym Testerem, Inspire Awe): „fog" to instant —
            // wartość ma DOPIERO gdy przeciwnik ZADEKLAROWAŁ atakujących
            // (attackingEnemyPower liczy z view.combat). Rzucony w upkeepie/
            // przed deklaracją (albo gdy wróg nie ma czym atakować) prewencja
            // nic nie zapobiega — to przedwczesne spalenie instanta. Kara musi
            // przebić bazę czaru + ewentualny scry, żeby bot POCZEKAŁ na okno
            // deklaracji (wtedy attackingEnemyPower>0 → premia). Zgłoszenie:
            // bot rzucił Inspire Awe w turze gracza, który nie miał stworów.
            else score += attackingEnemyPower(view) > 0 ? 15 : -75;
          }
          // M109 (Spare from Evil): ochrona do końca tury to SZTUCZKA BOJOWA.
          // Poza walką (brak atakujących po którejkolwiek stronie) rzucenie
          // jej to wyrzucona karta i mana — reguła generyczna po treści
          // efektu, bez nazw kart (ADR 0002).
          if (effect.type === 'grant_protection_until_end_of_turn') {
            const combatOn = (view.combat?.attackers?.length ?? 0) > 0;
            score += combatOn ? 12 : -45;
          }
          // M257-r5b/C (zgłoszenie właściciela, Awaken the Sleeper): czasowe
          // przejęcie kreatury to SZTUCZKA BOJOWA — po rozstrzygnięciu cel
          // jest odtapnięty i ma haste (generyczny efekt), więc atakuje W
          // TEJ turze właściciela. Wcześniejsza usterka: efekt nie miał ŻADNEJ
          // wyceny — wszystkie warianty celu dostawały bazę 50 i wygrywał
          // pierwszy z enumeracji (bot przejmował pierwszą kreaturę, nie tę
          // z equipmentem). Właściciel: „najlepiej przejąć kreaturę z
          // założonym equipmentem… i go zniszczył” — decyzja o zniszczeniu
          // (resolve_destroy_equipment_choice) idzie w ślad za wyborem celu.
          if (effect.type === 'gain_control_until_end_of_turn') {
            if (!target || target.controllerId === view.playerId) {
              // Efekt musi uderzyć w kreaturę PRZECIWNIKA — własna kontrola
              // nic nie daje (kara musi przebić bazę czaru).
              score -= 40;
            } else {
              // Baza: 3 * power — atak, który stanie się w tej turze
              // (obrażenia bojowe na właściciela).
              const power = target.power ?? 0;
              score += 3 * power;
              // Equipment założone na celu: preferencja celu wyposażonego.
              // M257-r5b/C: equipment = artefakt z deskryptorem `equipment`
              // (widok: attachedTo + entry.equipment) — ADR 0002, bez nazw.
              const equipmentCount = (view.zones.battlefield ?? []).filter(
                (o) => o.attachedTo === target.id && o.equipment).length;
              if (equipmentCount > 0) score += 25 + 5 * equipmentCount;
            }
          }
          if (effect.type === 'creatures_cant_block_this_turn') {
            // M257-r5b/D (zgłoszenie właściciela, Ruthless Invasion): czar
            // jest wart TYLKO tyle, ile obrażeń realnie przepuści — i tylko
            // gdy bot ZAMIERZA atakować w tej turze. D2: „Bot rzuca Ruthless
            // Invasion po czym kończy turę bez ataku. No to już jest
            // kompletny bezsens. Skoro nie zamierza atakować to ten czar to
            // czyste marnotrawstwo.” D1: płatność życiem za {R/P} jest
            // uzasadniona wyłącznie, gdy atak zabija przeciwnika W TEJ turze
            // („chyba, że naprawdę policzy, że jego atak zabije
            // przeciwnika w tej turze dzięki temu zakazowi blokowania”).
            // Reguła po deskryptorze efektu (ADR 0002); baza czaru to −1
            // (czysto-utylitarny, M146) — kara −90 musi go przebić.
            const except = effect.exceptTypes ?? [];
            // Okno: moja tura + krok PRZED walką (main1 / beginning_of_combat
            // przed deklaracją). W main2 (po combacie) efekt już nic nie
            // zmieni — „this turn” kończy się z moją turą.
            const attackingWindow = myTurn(view)
              && ['main1', 'beginning_of_combat'].includes(view.turn.step);
            // Gotowi atakujący: nietapnięci, bez choroby (albo haste), moc > 0.
            const attackers = myCreatures(view).filter((c) => !c.tapped
              && (!c.summoningSickness || hasKeyword(c, 'haste')) && (c.power ?? 0) > 0);
            const totalPower = attackers.reduce((sum, c) => sum + (c.power ?? 0), 0);
            // Blokerzy, których czar faktycznie usuwa: nietapnięte stworы
            // przeciwnika POZA wyjątkami (Ruthless: artifact-creatures
            // blokują mimo zakazu). Zbiór ustala się przy rozstrzygnięciu —
            // stwór wchodzący później blokuje normalnie (nota karty).
            const blockers = enemyCreatures(view).filter((c) => !c.tapped
              && !except.some((t) => (c.types ?? []).includes(t)));
            const enemyLife = enemy(view)?.life ?? 0;
            const lethal = totalPower >= enemyLife;
            if (!attackingWindow || totalPower === 0) {
              // D2: brak ataku w tej turze = karta na nic (karą −90 czar
              // spada poniżej passu, w wariancie manowym i życiowym).
              score -= 90;
            } else if (blockers.length === 0) {
              // Otwarte pole / tylko artifact-blokerzy: czar nie usuwa
              // NICZEGO — atak i tak przechodzi albo i tak chumpuje.
              // Wyjątek: LETHAL w tej turze (D1) — jedyny uzasadniony
              // powód zapłacenia życiem za {R/P}.
              if (lethal) score += 2 * totalPower + 50;
              else score -= 90;
            } else {
              // Czar usuwa blokerów — obrażenia, które dzięki niemu
              // przechodzą: 2*power za gotowego atakującego.
              score += 2 * totalPower;
              if (lethal) score += 50; // D1: premia lethal
            }
          }
          // M109 (Sagittars' Volley): fala obrażeń w stwory przeciwnika
          // z keywordem — wartość rośnie z liczbą trafionych i zabitych.
          if (effect.type === 'damage_creatures_with_keyword') {
            const amount = effect.amount ?? 1;
            const hit = (view.zones.battlefield ?? []).filter((o) => o.kind === 'creature'
              && o.controllerId !== view.playerId && (o.keywords ?? []).includes(effect.keyword));
            const lethal = hit.filter((o) => amount >= (o.toughness ?? 0) - (o.damage ?? 0)).length;
            score += 4 * hit.length + 10 * lethal;
          }
          // M109 (Diplomatic Relations): stwór zadaje obrażenia równe swojej
          // mocy — liczy się moc NASZEGO stwora (slot 0) i to, czy zabija.
          if (effect.type === 'damage_from_target_power') {
            const dealer = objectOnBoard(view, cmd.targets?.[effect.sourceTargetIndex ?? 0]);
            const victim = objectOnBoard(view, cmd.targets?.[effect.targetIndex ?? 1]);
            const power = (dealer?.power ?? 0) + (effects.some((e) => e.type === 'pump') ? (effects.find((e) => e.type === 'pump').power ?? 0) : 0);
            if (!dealer || !victim) score -= 40;
            else {
              const lethal = power >= (victim.toughness ?? 0) - (victim.damage ?? 0);
              score += 8 + 2 * power + (lethal ? 15 : 0);
            }
          }
          // Batch 45 (Malamet Battle Glyph, CR 701.12): fight to wymiana —
          // premia, gdy nasz stwór (slot A) zabija wroga; kara, gdy sam ginie.
          if (effect.type === 'fight') {
            const mine = objectOnBoard(view, cmd.targets?.[effect.targetIndexA ?? 0]);
            const theirs = objectOnBoard(view, cmd.targets?.[effect.targetIndexB ?? 1]);
            if (!mine || !theirs) score -= 40;
            else {
              const counterBonus = effects.some((e) => e.type === 'add_counter' && e.onlyIfTargetEnteredThisTurn) ? 1 : 0;
              const myPower = (mine.power ?? 0) + counterBonus;
              const myToughness = (mine.toughness ?? 0) + counterBonus;
              const killsTheirs = myPower >= (theirs.toughness ?? 0) - (theirs.damage ?? 0);
              const losesMine = (theirs.power ?? 0) >= myToughness - (mine.damage ?? 0);
              score += (killsTheirs ? 25 + 2 * (theirs.power ?? 0) : 5) - (losesMine ? 20 : 0);
            }
          }
          // Batch 49 (Time to Feed): znacznik „gdy ten stwór zginie w tej turze,
          // zyskujesz N życia" jest DODATKIEM do walki z tego samego czaru —
          // wart tyle, ile szansa, że cel faktycznie zginie. Nie karzemy braku
          // celu (robi to już wycena fightu), żeby nie liczyć kary dwa razy.
          if (effect.type === 'gain_life_if_target_dies_this_turn') {
            const victim = objectOnBoard(view, cmd.targets?.[effect.targetIndex ?? 0]);
            if (victim) score += Math.min(effect.amount ?? 1, 3);
          }
          // Batch 49 (Dead Ringers): podwójne removal, ale TYLKO gdy oba cele
          // mają identyczne zbiory kolorów — inaczej czar nie robi NIC (kara
          // musi przebić bazę, żeby bot nie palił karty na jałowy układ).
          if (effect.type === 'destroy_pair_if_same_colors') {
            const first = objectOnBoard(view, cmd.targets?.[effect.targetIndexA ?? 0]);
            const second = objectOnBoard(view, cmd.targets?.[effect.targetIndexB ?? 1]);
            if (!first || !second) score -= 60;
            else {
              const colorsA = [...(first.colors ?? [])].sort().join('');
              const colorsB = [...(second.colors ?? [])].sort().join('');
              if (colorsA !== colorsB) score -= 80;
              else {
                // Punktujemy każdy cel osobno: wrogi = zysk, własny = strata.
                for (const victim of [first, second]) {
                  score += victim.controllerId === view.playerId
                    ? -90
                    : 22 + 2 * ((victim.power ?? 0) + (victim.toughness ?? 0));
                }
              }
            }
          }
          if (effect.type === 'return_to_hand' && target && target.controllerId !== view.playerId) {
            score += P.bounceEnemyBase + (target.power ?? 0) * P.bounceEnemyPowerWeight;
            score += enemyRemovalTargetBonus(view, target); // M234
          }
          if (effect.type === 'damage') {
            // M237/4 (model właściciela) — JEDNO źródło prawdy wyceny obrażeń
            // (damageTargetValue): stwór wroga dobity wg POZOSTAŁEGO życia,
            // nieletalny chip poza walką = zakaz; gracz proporcjonalnie do %
            // życia (dobicie najwyżej); SIEBIE/własny stwór = zakaz. Efekt
            // celuje WŁASNY slot (`targetIndex`, domyślnie 0) — nie wszystkie
            // cele czaru (spell może mieć osobne sloty per efekt damage).
            const slot = cmd.targets?.[effect.targetIndex ?? 0];
            const amount = Number.isInteger(effect.amount) ? effect.amount : 0;
            const scaling = Boolean(spell?.xCost); // Consume Spirit itp. — X z maną
            if (slot != null) score += damageTargetValue(view, slot, amount, scaling);
            else score -= 60; // efekt obrażeń bez celu — nic nie robi
          }
          // M139 (uwaga właściciela): CZAR tapujący nie miał wyceny pozytywnej
          // w ogóle — ścieżka zdolności ją miała, ścieżka czarów nie (kolejny
          // rozjazd bliźniaczych gałęzi, L41). Bez tego czar tapujący dostawał
          // gołą wartość bazową i bot rzucał go w dowolnym momencie, także
          // w swojej turze, gdzie efekt kasuje się przy najbliższym untapie.
          if (['tap_permanent', 'tap_permanents', 'lock_untap', 'dont_untap_next_untap_step'].includes(effect.type)) {
            const locking = effect.type === 'lock_untap' || effect.type === 'dont_untap_next_untap_step';
            // Czekać na lepsze okno może tylko czar grywalny w cudzej turze
            // (instant / flash). Sorcery zagramy WYŁĄCZNIE we własnej głównej
            // fazie, więc „zły timing” jest tam jedyną dostępną opcją.
            const cardTypes = card?.types ?? cardDef(card?.cardId)?.types ?? [];
            const canWait = cardTypes.includes('Instant') || Boolean(card?.flash) || Boolean(cardDef(card?.cardId)?.flash);
            const victims = effect.type === 'tap_permanents'
              ? (cmd.targets ?? []).map((id) => objectOnBoard(view, id)).filter(Boolean)
              : [objectOnBoard(view, cmd.targets?.[effect.targetIndex ?? 0]) ?? target].filter(Boolean);
            for (const victim of victims) score += tapTargetValue(view, victim, { locking, canWait });
          }
          // M146 (Twiddle — tryb Odkręcenie): `untap_permanent` odkręca CEL.
          // Wartość ma wyłącznie odkręcenie WŁASNEGO zatapniętego stwora
          // (bloker/atakujący wraca do gry). Odkręcenie permanentu PRZECIWNIKA
          // to pomoc wrogowi (oddajemy mu manę/bloker) — kara. Zanim wycena
          // istniała, bot rzucał Twiddle-Odkręcenie na górę przeciwnika
          // w swoim upkeepie (audyt Żywym Testerem M146).
          if (effect.type === 'untap_permanent') {
            const victim = objectOnBoard(view, cmd.targets?.[effect.targetIndex ?? 0]) ?? target;
            if (victim) {
              const isLand = victim.kind === 'land' || (victim.types ?? []).includes('Land');
              if (victim.controllerId === view.playerId) {
                // Land odkręca się sam w untap step — ręczne odkręcenie go
                // (np. Twiddle na własnej górze po zapłaceniu many) to
                // marnowanie czaru. Wartość ma wyłącznie STWÓR (bloker/
                // atakujący wraca do gry).
                score += (!isLand && victim.tapped) ? 8 + 2 * (victim.power ?? 0) : -4;
              } else {
                score -= 25; // odkręcanie wroga — zawsze złe
              }
            }
          }
          if (effect.type === 'create_token') {
            // Tokeny to realny przyrost planszy (Gather the Townsfolk).
            // Warunek „fateful hour" (ifLifeAtMost) podnosi liczbę tokenów,
            // gdy naprawdę zachodzi — deskryptor generyczny, zero nazw kart.
            // M106/Z6 (audyt stołu): liczba tokenów bywa DYNAMICZNA
            // („X = liczba atakujących" — Flurry of Wings). Wcześniej każdy
            // nieliczbowy `amount` liczył się jak 1, więc bot rzucał Flurry
            // of Wings we WŁASNYM upkeepie (0 atakujących = 0 tokenów) i
            // wyrzucał kartę. Rozwiązujemy znane źródła z widoku.
            let count = Number.isInteger(effect.amount) ? effect.amount : dynamicTokenCount(view, effect.amount);
            if (effect.ifLifeAtMost != null && myLife(view) <= effect.ifLifeAtMost) {
              count = effect.amountIfCondition ?? count;
            }
            if (count === 0) score -= 25; // czar bez skutku = karta w błoto
            const greatestPower = myCreatures(view).reduce((max, object) => Math.max(max, object.power ?? 0), 0);
            const tokenPower = effect.power === 'greatest_power_you_control' ? greatestPower : (effect.power ?? 1);
            const tokenToughness = effect.toughness === 'greatest_power_you_control' ? greatestPower : (effect.toughness ?? 1);
            score += 10 * count * (2 * tokenPower + tokenToughness) / 3;
          }
          // Mill (Sweet Oblivion / Cellar Door): cel to gracz. Mielenie
          // własnej biblioteki to deck-out — kara; mielenie przeciwnika to zysk.
          if (effect.type === 'mill_cards' || effect.type === 'mill_from_bottom') {
            const playerTargets = (cmd.targets ?? []).filter((id) => typeof id === 'string' && (id === view.playerId || id === enemy(view)?.id));
            const millsSelf = playerTargets.includes(view.playerId);
            const millsFoe = enemy(view)?.id != null && playerTargets.includes(enemy(view).id);
            if (millsSelf && !millsFoe) score -= 80;
            else if (millsSelf) score -= 50;
            else if (millsFoe) score += 20 + 3 * (effect.amount ?? 1);
            // M173/A (Gray Slaad — Entropic Decay „Mill four cards"): mill
            // BEZ celu mieli WŁASNĄ bibliotekę. Wartość zależy od synergii
            // grobu (deskryptory zależne od liczby kart w grobie — np.
            // minCreatureCardsInGraveyard, ADR 0002) i wyścigu bibliotek.
            // M200/R (uwaga właściciela): biblioteka jest UKRYTA w widoku
            // (FoW) — bot nie zna, CO mieli. Stałe +18 zakładało, że
            // zmielone karty pomogą synergii grobu, więc przygoda (50+18=68)
            // wygrywała z postawieniem 4/1 na planszy (79*0.9=71.1) z
            // przewagą 3 pkt, a w scenariuszu z karami kontekstowymi (np.
            // castSacrificePenalty) odwracała wybór — bot „millował się”
            // zamiast postawić blokera. Synergia to MOŻLIWOŚĆ, nie pewność:
            // premia konserwatywna (+6), a ryzyko deck-outu stopniowane
            // im bliżej dna biblioteki.
            else if (playerTargets.length === 0) {
              const n = effect.amount ?? 1;
              const myLib = view.zones.library.filter((o) => o.controllerId === view.playerId).length;
              if (myLib - n <= 0) score -= 120; // deck-out — nigdy
              else {
                const ownCardIds = [
                  ...view.zones.battlefield.filter((o) => o.controllerId === view.playerId),
                  ...view.zones.hand.filter((o) => o.controllerId === view.playerId),
                ].map((o) => o.cardId).filter(Boolean);
                const graveSynergy = ownCardIds.some((cid) => (cardDef(cid)?.abilities ?? [])
                  .some((a) => a?.condition?.minCreatureCardsInGraveyard != null));
                const deckOutRisk = myLib - n <= 4 ? -20 : myLib - n <= 8 ? -10 : 0;
                score += (graveSynergy ? 6 : -25) + deckOutRisk;
              }
            }
          }
          // M174/B (Toll of the Invasion — strażnik L51): amass buduje WŁASNĄ
          // Armię niezależnie od celu czaru — stały zysk (token/licznik).
          if (effect.type === 'amass') {
            score += 6 + 3 * (effect.amount ?? 1);
          }
          // M162/B (uwaga właściciela): symetryczny mill (Ghoulcaller's Bell —
          // „each player mills") — wycena WYŚCIGU bibliotek. Bez tej gałęzi
          // efekt nie miał ŻADNEJ wyceny, więc aktywacja {T} warta bazowe +2
          // wygrywała z passem i bot dzwonił CO TURĘ także przegrywając wyścig
          // o karty (deck-out). Reguła: symetryczny mill opłaca się tylko
          // PROWADZĄC w kartach. Liczniki bibliotek są w PlayerView (ADR 0017).
          if (effect.type === 'mill_both_players') {
            const n = effect.amount ?? 1;
            const myLib = view.zones.library.filter((o) => o.controllerId === view.playerId).length;
            const foeLib = view.zones.library.filter((o) => o.controllerId !== view.playerId).length;
            if (myLib - n <= 0) score -= 120; // milduję własną ostatnią kartę — samobójstwo
            else if (foeLib - n <= 0) score += 80; // przeciwnik dobiera z pustej = wygrana
            else if (myLib <= foeLib) score -= 40; // nie prowadzę — dzwonienie szkodzi bardziej mnie
            else score += 6 + Math.min(10, myLib - foeLib); // prowadzę: mały zysk rosnący z przewagą
          }
          // M149/D (uwaga właściciela): „target player sacrifices a creature"
          // (Grave Exchange, Liliana's Triumph) — cel to GRACZ. Gdy celujemy
          // w SIEBIE, to MY poświęcamy własnego stwora (strata); w przeciwnika —
          // to on traci stwora (zysk). Osobno od selfHarmPenalty, bo cel to
          // gracz (id), nie permanent.
          if (effect.type === 'player_sacrifices_creature') {
            const idx = effect.targetIndex != null ? effect.targetIndex : 0;
            const playerId = cmd.targets?.[idx];
            const hitsSelf = playerId === view.playerId;
            const hitsFoe = playerId != null && playerId === enemy(view)?.id;
            // Im więcej stworów gracza-celu, tym mniejsza strata pojedynczego —
            // ale nadal strata, jeśli cel to my.
            if (hitsSelf) {
              const mySacrificeable = myCreatures(view).length;
              if (mySacrificeable === 0) score += 10; // nic nie tracimy
              else score -= 40 + 2 * (mySacrificeable - 1); // strata ofiary
            } else if (hitsFoe) {
              const foeCreatures = enemyCreatures(view).length;
              score += foeCreatures > 0 ? 20 + 3 * foeCreatures : 5; // wróg traci stwora
            }
          }
          // M106/Z7 (audyt stołu): masowe „do końca tury" (Hysterical
          // Blindness −4/−0, Turn the Tide, Angel of the Dawn +1/+1) to
          // SZTUCZKI BOJOWE — poza walką wygasają, zanim cokolwiek zrobią.
          // Bot rzucał je we własnym upkeepie (audyt: 2 partie z 7).
          // M218/1: bramka `phase === 'combat'` obejmowała też początek
          // i koniec walki (L64 — M206 naprawił tylko activate_ability);
          // okno liczymy z UCZESTNICTWA (combatTrickWindow na dowolnym
          // dotkniętym stworze — atakuje albo blokuje). Sorcery (Rush of
          // Battle) nie poczeka na combat: jedyne sensowne okno to Główna 1
          // przed własnym atakiem (jak M179/C dla pojedynczego pumpu).
          if (effect.type === 'buff_opponents_creatures' || effect.type === 'buff_creatures_you_control') {
            const targetsOpponents = effect.type === 'buff_opponents_creatures';
            const pool = targetsOpponents ? enemyCreatures(view) : myCreatures(view);
            const affected = pool.length;
            // M218/2: uczestnictwo w walce to warunek konieczny, nie
            // wystarczający — masowy pump/debuff, który nie zmienia wyniku
            // ŻADNEJ toczącej się wymiany (np. −4/−0 na 5/5 blokowanym po
            // cichu przez 1/1), jest skutkiem zerowym.
            const anyChange = pool.some((entry) => pumpChangesOutcome(view, entry, pumpDelta(view, effect)));
            if (affected === 0) score -= 30;          // nie ma na kogo działać
            else if (card?.spell?.timing === 'sorcery') {
              score += (myTurn(view) && view.turn.phase === 'precombat_main'
                && pool.some((entry) => canAttackNow(entry))) ? 6 * affected : -60;
            } else if (!anyChange) score -= 25;       // wygaśnie przed walką / nic nie zmieni
            else score += 6 * affected;
          }
          // Dobranie kart z czaru to przewaga kartowa.
          if (effect.type === 'draw_cards' || effect.type === 'draw_cards_both_players') {
            const drawAmount = Number.isInteger(effect.amount) ? effect.amount : 1;
            score += P.drawCardValue * drawAmount + drawDeckingPenalty(view, drawAmount);
          }
          // M218/4 — scry/surveil jako CZAR: okno jak przy zdolności (M211/A1).
          // Dla czystego scry/surveil (np. Index) kara musi przebić bazę 50 (L3),
          // więc -60; dla mieszanych (Curate: surveil+draw) kara łagodna -12,
          // żeby nie blokować gry i nie psuć testów modalu (E4).
          if (DECK_ARRANGING_EFFECTS.has(effect.type)) {
            const isPureDeckArranging = effects.every((e) => DECK_ARRANGING_EFFECTS.has(e?.type));
            const isSorcery = card?.spell?.timing === 'sorcery';
            if (isSorcery) {
              score += (view.turn.phase === 'postcombat_main' && view.turn.step === 'main2') ? 6 : (isPureDeckArranging ? -60 : -12);
            } else {
              score += (!myTurn(view) && view.turn.step === 'end') ? 10 : (isPureDeckArranging ? -60 : -12);
            }
          }
          // M218/4 — regenerate jako efekt czaru (jeśli kiedyś pojawi się taki czar):
          // wartość tylko gdy cel zagrożony, inaczej kara.
          if (effect.type === 'regenerate') {
            const victim = objectOnBoard(view, cmd.targets?.[effect.targetIndex ?? 0]) ?? target ?? null;
            const alreadyShielded = victim && (view.regenerationShields ?? []).includes(victim.id);
            if (alreadyShielded) score -= 25;
            else score += victim && isCreatureThreatened(view, victim) ? 30 : -20;
          }
          // Audyt PR #93 (znalezisko F): wycena wrappera „each of up to N
          // targets” wyciągnięta do `wrapTargetsValue` — to samo liczenie
          // mają teraz okna rzutu spoza ręki (grób/madness/Vaan), które
          // dotąd BRAŁY pierwszy wariant z brzegu, w tym jałowy (0 celów).
          score += wrapTargetsValue(view, effect, cmd);
          // M157/L28 (inwentaryzacja): kradzież stwora do końca tury (Spreading
          // Insurrection, Awaken the Sleeper) — warianty różnią się celem;
          // wartość = tymczasowy zysk najsilniejszego stwora wroga.
          if (effect.type === 'gain_control_until_end_of_turn') {
            const foe2 = enemy(view);
            if (target && foe2 && target.controllerId === foe2.id) {
              score += 12 + (target.power ?? 0) * 2 + (target.toughness ?? 0);
            } else if (target && target.controllerId === view.playerId) {
              // M231 (audyt Żywym Testerem, Awaken the Sleeper): przejęcie
              // kontroli nad WŁASNYM stworem jest jałowe — już go kontrolujesz,
              // „kradzież" nic nie daje (marginalny haste nie wart karty). Kara
              // przebija bazę 50, żeby wariant zszedł poniżej passu; rzut w cel
              // wroga (wyżej) pozostaje premiowany. Generycznie po kontrolerze
              // celu (ADR 0002), nie po nazwie karty.
              score -= 70;
            }
          }
          // M157/L28: efekty celujące KARTĘ we WŁASNYM grobie (Unbreakable
          // Bond) — remis wariantów zwracał pierwszą kartę; premiujemy
          // najcenniejszego stwora w grobie (P/T z widoku grobu).
          if (effect.type === 'return_permanent_from_graveyard') {
            const slot = cmd.targets?.[effect.targetIndex ?? 0] ?? null;
            const gyCard = slot ? (view.zones.graveyard ?? []).find((o) => o.id === slot) : null;
            if (gyCard) {
              const gyDef = cardDef(gyCard.cardId);
              const gyValue = ((gyCard.power ?? gyDef?.power ?? 0) * 2)
                + (gyCard.toughness ?? gyDef?.toughness ?? 0);
              score += 10 + gyValue;
            }
          }
          // Batch 52 (Cemetery Recruitment): zwrot karty STWORA z grobu do
          // RĘKI to card advantage (jak dobranie) + ciało karty. Bez wyceny
          // warianty remisowały na bazie 50 i bot brał PIERWSZĄ kartę z grobu
          // (najgorszą), nie najcenniejszą — „remis wariantów przez brak
          // case'a" (L50). Zombie → dodatkowe dobranie (CR 608.2g — podtyp
          // sprawdzany z odzyskanej karty). Generycznie po deskryptorze
          // (ADR 0002), zero nazw kart.
          if (effect.type === 'return_card_from_graveyard_to_hand') {
            const slot = cmd.targets?.[effect.targetIndex ?? 0] ?? null;
            const gyCard = slot ? (view.zones.graveyard ?? []).find((o) => o.id === slot) : null;
            if (gyCard) {
              const gyDef = cardDef(gyCard.cardId);
              const gyValue = ((gyCard.power ?? gyDef?.power ?? 0) * 2)
                + (gyCard.toughness ?? gyDef?.toughness ?? 0);
              score += P.drawCardValue + gyValue;
              const gySubtypes = gyCard.subtypes ?? gyDef?.subtypes ?? [];
              if ((effect.drawIfSubtypes ?? []).some((s) => gySubtypes.includes(s))) {
                score += P.drawCardValue; // Zombie → dobranie
              }
            }
          }
          // M156/Q1 (pętla jakości, Withstand — cantrip z prewencją „any
          // target"): prewencja bez wyceny = remis wariantów → bot rzucał
          // „prevent the next 3 damage" na STWORA PRZECIWNIKA (czysta strata
          // karty + tarcza dla wroga). Generycznie (ADR 0002): prewencja po
          // WŁASNEJ stronie = skromny plus (sytuacyjna), po stronie wroga =
          // kara przebijająca bazę 50.
          if (effect.type === 'prevent_next_damage') {
            const slot = cmd.targets?.[effect.targetIndex ?? 0] ?? null;
            const victim = slot ? objectOnBoard(view, slot) : null;
            const amount = effect.amount ?? 1;
            if (slot === view.playerId || (victim && victim.controllerId === view.playerId)) {
              score += 2 + amount; // własny stwór/gracz — tarcza na przyszłość
            } else if (slot != null && (slot === enemy(view)?.id
              || (victim && victim.controllerId === enemy(view)?.id))) {
              score -= 60; // osłanianie strony przeciwnika — bezsensowne zagranie
            }
          }
          // M155 (audyt żywym testerem, Ruinous Rampage): „deals N damage to
          // each opponent\" (i lose_life każdego przeciwnika) nie miało wyceny
          // w pętli czarów (było tylko w modalnym triggerze, linia 582). Bot
          // porównywał więc ten tryb z „wygnaj artefakty\" na równi i wybierał
          // tryb bezsensowny (wygnanie własnego Angel's Feather zamiast 3
          // obrażeń przeciwnikowi). Reguła generyczna: wartość = 4×N (jak
          // modalny trigger), dobicie = bonus.
          if (effect.type === 'damage_each_opponent' || effect.type === 'lose_life_each_opponent') {
            const amount = effect.amount ?? 1;
            const foe = enemy(view);
            score += (foe && amount >= (foe.life ?? 20)) ? 80 : 4 * amount;
          }
          // M103/B (zgłoszenie właściciela): „cel nie może być blokowany"
          // (Enter the Enigma) — ewazja ma wartość WYŁĄCZNIE na własnym
          // atakującym; dana stworowi PRZECIWNIKA to realna strata (wróg
          // przechodzi przez nasze bloki). Dotąd efekt nie miał wyceny
          // i czar wyglądał na dobry niezależnie od celu.
          if (effect.type === 'cant_be_blocked') {
            if (target && target.controllerId !== view.playerId) score -= 60;
            else if (!target) score -= 90;
            else {
              // M257-r5b/D (symetrycznie z Ruthless Invasion, zgłoszenie
              // D2/D1 właściciela): „nie może być blokowany” na WŁASNYM
              // stworze ma wartość tylko, gdy ten stwór realnie zaatakuje W
              // TEJ turze — inaczej czar to czyste marnotrawstwo (bot rzucał
              // i kończył turę bez ataku). Płatność życiem (phyrexian)
              // uzasadnia wyłącznie lethal w tej turze (D1).
              const attackingWindow = myTurn(view)
                && ['main1', 'beginning_of_combat'].includes(view.turn.step);
              const canAttack = !target.tapped
                && (!target.summoningSickness || hasKeyword(target, 'haste'))
                && (target.power ?? 0) > 0;
              if (!attackingWindow || !canAttack) {
                score -= 90;
              } else {
                const power = target.power ?? 0;
                const blockers = enemyCreatures(view).filter((c) => !c.tapped);
                const strongestToughness = blockers.reduce((m, c) => Math.max(m, c.toughness ?? 0), 0);
                score += 2 * power;
                // Atak „przechodzi”: brak blokerów albo stwór zabija
                // najsilniejszego (power >= jego wytrzymałość).
                if (blockers.length === 0 || power >= strongestToughness) score += P.attackThroughBonus;
                // D1: LETHAL — atak zabija przeciwnika w tej turze.
                if (power >= (enemy(view)?.life ?? 0)) score += 50;
              }
            }
          }
          // Uwaga B (2026-08-12): pumpy (pump, pump_by_creature_count — Might of
          // the Masses, pump_enchanted_creature) wzmacniają stwora-CELU. Wzmacnianie
          // stwora PRZECIWNIKA to marnotrawstwo — kara, nie dotyczy własnych.
          // WSPÓLNY MIANOWNIK (zlecenie właściciela, L28): tabela typów +
          // jedna funkcja, bez łańcucha `type === '...'`.
          const isPumpEffect = Boolean(temporaryPumpOf(effect, view));
          // M202/G: ujemny pump na WROGIM stworze to debuff przeciwnika —
          // realny zysk (Fleeting Distraction: „-1/-0 until end of turn”).
          // Bez tej gałęzi efekt nie dostawał ŻADNEJ wartości (dodatnie pumpy
          // wyceniała gałąź poniżej, a klamra M179/E tylko karała), więc bot
          // w ogóle nie rzucał czaru.
          if (isPumpEffect && isNegativePump(effect) && target
            && target.controllerId !== view.playerId) {
            // M218/2 (kryterium właściciela): debuff „do końca tury" jest
            // sensowny wyłącznie w sytuacji bojowej, w której realnie zmienia
            // wynik — 5/5 atakujący po −1/−0 ginie od 4/4, a 5/5 vs 1/1
            // dalej zabija i przeżywa (skutek zerowy). Symulujemy przed/po.
            const changes = pumpChangesOutcome(view, target, pumpDelta(view, effect));
            if (changes) {
              score += 25 + 4 * Math.abs(effect.power ?? 0) + 4 * Math.abs(effect.toughness ?? 0);
            } else {
              score -= 75; // karta na nic — kara klasy „okno poza walką" (L3)
            }
          }
          if (isPumpEffect && !isNegativePump(effect) && target && target.controllerId === view.playerId) {
            // M146 (uwaga właściciela): pump „do końca tury" ma wartość tylko
            // w oknie, w którym zdąży pomóc. Bot rzucał Fake Your Own Death
            // w swoim upkeepie i passował — czysta strata. Okna:
            //  combat          → 18 (trick na atakującym/blokującym),
            //  tura przeciwnika → 12 (pump blokera na jego atak — trwa do
            //                     końca JEGO tury),
            //  moja main przed atakiem → 6 (pump na atak),
            //  upkeep/draw/end/main2  → -20 (pump nie zdąży pomóc).
            const inCombat = combatTrickWindow(view, target);
            const myTurnNow = myTurn(view);
            let trick;
            // M96: pump „do końca tury" sensowny TYLKO w combacie (po deklaracji
            // atakujących/blokujących) albo na tura przeciwnika (bloker na jego
            // atak). W mojej fazie głównej wróg zdąży zareagować, a efekt może
            // wygasnąć bez skutku — M146 (Fake Your Own Death w upkeepie).
            // M218/1 (zlecenie właściciela): okno liczone z UCZESTNICTWA
            // (combatTrickWindow — view.combat), nie z nazwy fazy. Stary
            // `phase === 'combat'` przepuszczał beginning_of_combat
            // i end_of_combat (L64 — M206 naprawił tylko activate_ability),
            // a bezwarunkowe `!myTurnNow → 12` trzymało przy życiu pump
            // w upkeepie/draw przeciwnika na stwora, który nikogo nie
            // blokuje (M206/A1c dla zdolności wykazał ten sam błąd).
            if (inCombat) trick = 18;
            else if (['upkeep', 'draw', 'end', 'cleanup'].includes(view.turn.step)) trick = -60;
            else if (card?.spell?.timing === 'sorcery') {
              // M179/C (zlecenie właściciela): SORCERY nie poczeka na combat
              // — jedyne sensowne okno to GŁÓWNA 1 przed własnym atakiem;
              // postcombat = strata klasy „upkeep” (efekt wyparuje w cleanup,
              // a następnego okna dla sorcery w tej turze nie będzie).
              trick = (view.turn.phase === 'precombat_main' && canAttackNow(target)) ? 10 : -75;
            } else {
              // M179/A1: kara we własnej main musi PRZEBIĆ bazową wartość
              // czaru (~50–65, zależnie od karty) — przy −20 bot i tak rzucał
              // trik w Głównej 1 zamiast poczekać na deklaracje walki
              // (właściwe okno instantów — zlecenie A1 właściciela).
              trick = -75;
            }
            // M218/2 (kryterium właściciela: „1/1 atakująca blokowana przez
            // 5/5 — pompowanie +2/+2 nie ma żadnego sensu, bo nie zmienia
            // wyniku walki ani o jotę"): okno walki to warunek konieczny,
            // nie wystarczający. Po kaskadzie okien symulujemy wynik walki
            // przed/po — bez zmiany pump dostaje karę klasy „okno poza
            // walką" (−75), bo karta i mana idą na nic. Inne efekty tego
            // czaru (dober, keywordy) wyceniają się w swoich gałęziach —
            // kara dotyczy tylko samego pumpu.
            if (inCombat && !pumpChangesOutcome(view, target, pumpDelta(view, effect))) trick = -75;
            score += trick + (target.power ?? 0);
          } else if (isPumpEffect) {
            score -= 60; // wzmacnianie przeciwnika bez powodu jest błędem
          }
          // M179/A1 (zlecenie właściciela): grant keywordów z CZARU — ta sama
          // logika okien walki co przy zdolnościach (M173/E). Dotąd czary
          // grantujące keywordy nie miały wyceny okna wcale (liczył się tylko
          // towarzyszący pump), więc czyste granty szły w pierwszy legalny cel.
          if (effect.type === 'grant_keywords_until_end_of_turn') {
            const recipient = target ?? null;
            const grantedKw = effect.keywords ?? [];
            if (recipient && recipient.controllerId !== view.playerId) {
              score -= 12 + 2 * (recipient.power ?? 0);
            } else if (recipient) {
              const alreadyHasKw = new Set(recipient.keywords ?? []);
              const freshKw = grantedKw.filter((k) => !alreadyHasKw.has(k));
              if (freshKw.length === 0) {
                score -= 10; // duplikat keywordu: zero zmiany w grze
              } else if (card?.spell?.timing === 'sorcery') {
                // M179/C: sorcery-grant — jedyne okno to Główna 1 przed atakiem.
                score += (myTurn(view) && view.turn.phase === 'precombat_main' && canAttackNow(recipient))
                  ? 4 + 2 * freshKw.length : -40;
              } else {
                score += keywordGrantWindowValue(view, recipient, freshKw);
              }
            }
          }
          // M155 (audyt żywym testerem, Courage in Crisis): `add_counter` z
          // POZYTYWNYM licznikiem statystyk (+1/+1 itp.) wzmacnia stwora.
          // Brak wyceny = bot brał dowolny cel (pierwszy legalny = często
          // stwór PRZECIWNIKA — buforował wroga, płacąc za jego korzyść).
          // Reguła generyczna (ADR 0002): pozytywny licznik na WŁASNYM stworze
          // = zysk, na stworze przeciwnika = strata (wzmacniamy wroga).
          if (effect.type === 'add_counter') {
            const counterName = effect.counter ?? '+1/+1';
            const beneficial = counterName === '+1/+1' || counterName === '+1/+0'
              || counterName === '+0/+1' || counterName === 'shield';
            const amount = Math.max(1, effect.amount ?? 1);
            if (beneficial && target) {
              if (target.controllerId === view.playerId) {
                score += 8 + 4 * amount;
              } else if (target.kind === 'creature' || (target.types ?? []).includes('Creature')) {
                score -= 90; // wzmacnianie stwora przeciwnika — mocna kara
              }
            }
          }
        }
        return finish(score);
      }
      case 'activate_ability': {
        // Ninjutsu (z ręki, zwraca nieblokowanego atakującego): wartość =
        // ile lepszy nowy stwór od zastępowanego, plus evasion.
        if (cmd.attackerId != null) {
          const hand = handCard(view, cmd.objectId);
          const oldAttacker = objectOnBoard(view, cmd.attackerId);
          if (!hand || !oldAttacker) return finish(0);
          let score = 25;
          score += ((hand.power ?? 0) - (oldAttacker.power ?? 0)) * 2;
          score += (hand.toughness ?? 0) - (oldAttacker.toughness ?? 0);
          if (hasKeyword(hand, 'flying') && untappedEnemyBlockers(view).every((o) => !hasKeyword(o, 'flying') && !hasKeyword(o, 'reach'))) score += 8;
          return finish(score);
        }
        const source = cmd.objectId ? objectOnBoard(view, cmd.objectId) : null;
        // M279 (Batch 52, Leonin Surveyor): zdolności aktywowane Z GROBU
        // (fromGraveyard — Leonin „{3} exile: dobierz", Glitch Ghost Surveyor,
        // Reassembling Skeleton, Survivor of Korlis…) nie były rozpoznawane —
        // `source` (pola bitwy) i `handCard` (ręka) ich nie widzą, więc `ability`
        // było undefined i pętla efektów nie wyceniała NICZEGO (gołe score=2).
        // `zoneCard` skanuje wszystkie strefy widoku — ta sama reguła co w
        // gałęzi czarów (Escape/Flashback, M103/D); L41: bliźniacze gałęzie.
        const abilityObject = source ?? handCard(view, cmd.objectId) ?? zoneCard(view, cmd.objectId);
        const def = abilityObject ? cardDef(abilityObject.cardId) : undefined;
        // M237/3 (audyt Żywym Testerem, Blazing Torch): zdolność NADANA przez
        // equipment (grantedFromEquipment) ma index względem
        // `equipment.grantedAbilities`, NIE `abilities` — inaczej ability było
        // undefined i efekty (np. „{T},poświęć: 2 obrażenia") w ogóle nie były
        // wyceniane (każdy cel dostawał gołe score=2, bot celował w twarz/siebie
        // zamiast zabić stwora). Spójnie z silnikiem (abilities.js).
        // M243/E (zgłoszenie właściciela, Treasure): treść zdolności bierzemy
        // NAJPIERW z obiektu (view.activatableAbilities — M243 dodaje, tokeny
        // typu Skarb mają zdolność w deskryptorze obiektu, a nie w rejestrze).
        // Bez tego token spoza card-data dostawał `ability = undefined` →
        // pętla efektów nie karyzowała niczego → goła baza 2 → bot poświęcał
        // Skarb na manę przy trzech nietapniętych lądach. Silnik indeksuje po
        // activatableAbilities (L48), więc widok niesie tę samą listę.
        const viewAbilities = abilityObject?.activatableAbilities;
        const ability = cmd.grantedFromEquipment
          ? (def?.equipment?.grantedAbilities ?? [])[cmd.abilityIndex ?? 0]
          : (viewAbilities ?? def?.abilities ?? [])[cmd.abilityIndex ?? 0];
        const taps = Boolean(ability?.cost?.tap);
        const tapsCreature = Boolean(ability?.cost?.tapCreature);
        const effects = Array.isArray(ability?.effect) ? ability.effect : ability?.effect ? [ability.effect] : [];
        const abilityEffectTypes = effects.map((e) => e?.type).filter(Boolean);
        // M179/B (uogólnienie M175/A2): IDENTYCZNA aktywacja (źródło +
        // zdolność + cele) już WISI na stosie, a wszystkie efekty są
        // idempotentne do EOT — drugi egzemplarz nic nie zmieni w grze.
        if (abilityEffectTypes.length > 0
          && abilityEffectTypes.every((type) => IDEMPOTENT_EOT_EFFECTS.has(type))) {
          const sameTargets = (entry) => JSON.stringify(entry.targets ?? []) === JSON.stringify(cmd.targets ?? []);
          const pendingTwin = (view.zones.stack ?? []).some((entry) => entry.controllerId === view.playerId
            && entry.sourceId === cmd.objectId && entry.abilityIndex === (cmd.abilityIndex ?? 0)
            && sameTargets(entry));
          if (pendingTwin) return finish(-10);
          // M219 (pętla jakości Żywym Testerem, h9 zendikar vs worek-legend
          // s=44): pendingTwin łapie tylko drugą kopię NA STOSIE. Gdy pierwsza
          // aktywacja już się ROZSTRZYGNĘŁA i nadała trwały-do-EOT stan
          // (saddled), źródło nosi go na polu bitwy, a bot i tak aktywował
          // Trained Arynx (Saddle 2) 3× z rzędu w jednej turze — każde
          // kolejne osiodłanie tapuje inny stwór za nic (L51: efekt
          // idempotentny już zastosowany). Generycznie po flagach STANU
          // czytanych z PlayerView (ADR 0017), nie po nazwie karty (ADR 0002).
          if (abilityEffectTypes.includes('set_saddled') && source?.saddled === true) {
            return finish(-10);
          }
          // M230 (audyt Żywym Testerem, Bomat Bazaar Barge): crew animuje pojazd
          // do EOT (animate_permanent_until_end_of_turn). Gdy pojazd JUŻ jest
          // animowany (source.animatedUntilEOT z PlayerView), kolejne załogowanie
          // niczego nie zmienia, a TAPUJE kolejne stwory za nic — bot crewował
          // Bomat do 11× w jednej turze. Flaga stanu z widoku (ADR 0017), nie
          // nazwa karty (ADR 0002).
          if (abilityEffectTypes.includes('animate_permanent_until_end_of_turn') && source?.animatedUntilEOT === true) {
            return finish(-10);
          }
        }
        // Patologia B1: aktywacja kosztem tapu we własnym untap zostawiłaby
        // stwora zatapianego całą turę (bot stał w miejscu i deck-outował).
        if (wastefulStep(view)) return finish(taps || tapsCreature ? -30 : -5);
        // M167/D (Apprentice Wizard): zdolność produkująca MANĘ bez niczego
        // zagrawalnego w ręce to marnotrawstwo — mana wyparuje, a artefakt/
        // stwór zostaje zatapowany (ta sama reguła co tap_for_mana, M127).
        // Z10 (Batch 38): Pristine Talisman „{T}: add {C}, gain 1 life" —
        // rider ŻYCIA ma wartość sam w sobie; kara tylko gdy mana jest
        // JEDYNYM efektem zdolności.
        const producesManaOnly = effects.length > 0 && effects.every((e) => e?.type === 'add_mana');
        if (producesManaOnly) {
          const hasPlayableInHand = view.zones.hand.some((o) => (o.manaCost ?? 0) > 0 && o.kind !== 'land');
          if (!hasPlayableInHand) return finish(taps || tapsCreature ? -30 : -5);
        }
        // M106/Z8 (audyt stołu, CR 608.2b): jeżeli moja zdolność Z TEGO
        // SAMEGO źródła już czeka na stosie z tym samym celem, kolejna kopia
        // niemal zawsze fizzluje (pierwsza zabiera cel ze strefy). Bot
        // aktywował tak Barkform Harvester 4× w jednej turze — 6 many w błoto.
        if ((cmd.targets ?? []).length > 0) {
          const duplicate = (view.zones.stack ?? []).some((entry) => entry.kind === 'activated'
            && entry.controllerId === view.playerId
            && entry.cardId === abilityObject?.cardId
            && (entry.targets ?? []).some((id) => cmd.targets.includes(id)));
          if (duplicate) return finish(-40);
        }
        // M106/Z2b: zdolność, której cała treść jest teraz pusta, marnuje manę.
        if (allEffectsInertNow(view, effects, cmd)) return finish(-40);
        let score = 2; // drobna wartość za legalne zagranie rozwijające planszę
        const target = cmd.targets?.[0] ? objectOnBoard(view, cmd.targets[0]) : null;
        // M121: ta sama bramka co dla czarów — zdolność aktywowana potrafi
        // tapować/niszczyć/mielić dokładnie tak samo (Entrancing Lyre,
        // Sterling Keykeeper, Cellar Door).
        score -= selfHarmPenalty(view, effects, cmd, target);
        // M179/E: symetria — efekt przyjazny wycelowany we wroga.
        score -= friendlyMisaimPenalty(view, effects, cmd, target);
        // M211/A1 (zgłoszenie właściciela, Seer's Lantern): zdolność, której
        // CAŁY efekt to „ułóż wierzch własnej biblioteki” (scry/surveil/
        // look_top_n/explore), zmienia tylko to, co dobierzemy w NAJBLIŻSZYM
        // dobraniu. Kiedy ją odpalić, jest więc obojętne dla skutku, ale NIE
        // dla kosztu: mana wydana wcześniej mogła w międzyczasie opłacić czar.
        //
        // Optymalne okno to KOŃCÓWKA TURY PRZECIWNIKA (jego end step, tuż przed
        // moim untapem): cała moja mana i tak wyparuje niewykorzystana, a scry
        // zdąży ustawić moje najbliższe dobranie. Bot odpalał zdolność w
        // pierwszym możliwym oknie (upkeep przeciwnika), przepalając manę,
        // której potem brakowało na odpowiedź w jego turze.
        //
        // Reguła generyczna po treści efektu, bez nazw kart (ADR 0002).
        // Zdolność sorcery-speed (Guidestone Compass) NIE może czekać na turę
        // przeciwnika — dla niej najlepsze okno to własna main2, po walce,
        // gdy wiadomo, że mana nie jest już potrzebna (wzorzec `canWait`
        // z tapTimingBonus, M139/M202F).
        const looksAtOwnLibraryOnly = effects.length > 0
          && effects.every((e) => DECK_ARRANGING_EFFECTS.has(e?.type));
        if (looksAtOwnLibraryOnly) {
          const sorcerySpeed = ability?.timing === 'sorcery';
          const step = view.turn.step;
          if (sorcerySpeed) {
            const manaContested = view.zones.hand
              .some((o) => (o.manaCost ?? 0) > 0 && o.kind !== 'land');
            if (view.turn.phase === 'postcombat_main' && step === 'main2') score += 6;
            else if (manaContested) score -= 12;
          } else if (!myTurn(view) && step === 'end') {
            score += 10;
          } else {
            score -= 12;
          }
        }
        // M218/4 — regenerate: wartość tylko gdy stwór ZAGROŻONY w tej turze.
        // Bez zagrożenia — kara (przedwczesny wydatek, jak M146).
        // Obsługuje zarówno keyword `regenerate` (Drudge Skeletons), jak i efekt
        // `{type:'regenerate'}` (Exterminator Magmarch).
        const isRegenerateAbility = ability?.keyword === 'regenerate'
          || abilityEffectTypes.includes('regenerate')
          || effects.some((e) => e?.type === 'regenerate');
        if (isRegenerateAbility) {
          const regenTarget = target ?? source;
          // Jeśli cel ma już tarczę regeneracji, druga jest zbędna (idempotentna
          // w sensie M179/B — druga tarcza nic nie dodaje, bo pierwsza już chroni).
          const alreadyShielded = regenTarget && (view.regenerationShields ?? []).includes(regenTarget.id);
          if (alreadyShielded) {
            score -= 25;
          } else {
            const threatened = isCreatureThreatened(view, regenTarget);
            if (threatened) {
              // M257/F: krok combat_damage = OSTATNIA szansa — krok domyka
              // `resolve_combat` (stała 50), a tarcza musi stać PRZED nim.
              // 2 + 60 = 62 > 50: bot stawia tarczę w tym oknie, a walkę
              // rozstrzyga w następnej decyzji (wtedy alreadyShielded −25).
              score += view.turn.step === 'combat_damage' ? 60 : 30;
            } else {
              score -= 20;
            }
          }
        }
        for (const effect of effects) {
          // M221/A (zgłoszenie właściciela, Panic Spellbomb): „{T}, poświęć:
          // docelowy stwór nie może blokować w tej turze" to COMBAT TRICK
          // ofensywny — ma sens WYŁĄCZNIE, gdy bot realnie atakuje w tej turze
          // i cel MÓGŁBY zablokować któregoś z jego atakujących. Bot wystawiał
          // Spellbomba i w tej samej głównej fazie (bez ani jednego atakującego)
          // poświęcał go, zabierając blok mojemu stworowi — efekt jałowy. Bez
          // własnej deklaracji ataku `cant_block` niczego nie kupuje (L42:
          // efekt „do końca tury" wyceniamy z oknem; L3: kara przebija bazę +2).
          // Reguła generyczna po TYPIE efektu i STANIE walki z PlayerView
          // (ADR 0002/0017), nie po nazwie karty.
          if (effect.type === 'cant_block') {
            const victim = target ?? (cmd.targets?.[0] ? objectOnBoard(view, cmd.targets[0]) : null);
            const combat = view.combat ?? null;
            const botAttacks = Boolean(combat) && combat.attackingPlayerId === view.playerId
              && (combat.attackers ?? []).length > 0;
            const victimIsEnemy = Boolean(victim) && victim.controllerId !== view.playerId;
            const victimCouldBlock = victimIsEnemy && !victim.tapped && !victim.cantBlock;
            const removesRealBlocker = botAttacks && victimCouldBlock
              && (combat.attackers ?? []).some((aid) => {
                const attacker = objectOnBoard(view, aid);
                return attacker && attackerCanBeBlocked(attacker, [victim]);
              });
            score += removesRealBlocker ? 8 : -20;
          }
          // M96 (audyt Żywym Testerem): `pump_enchanted_creature`
          // (firebreathing — Shiv's Embrace) NIE wpadało do tej gałęzi, więc
          // zdolność dostawała gołe `score = 2` i bot pompował ją 10× w Głównej
          // 1, zanim zadeklarował atak. Efekt „until end of turn" wygasa
          // w cleanup, więc mana wydana przed combatem przepada.
          //
          // Batch 51 (Savage Surge — „+2/+2 i odkręcenie do końca tury"):
          // gałąź rozpoznaje efekt po WSPÓLNYM MIANOWNIKU (nadanie P/T do
          // końca tury — `temporaryPumpOf`), nie po łańcuchu nazw typów.
          const pump = temporaryPumpOf(effect, view);
          if (pump) {
            const pGain = pump.power;
            const tGain = pump.toughness;
            // Pump bez jawnych celów działa na samo źródło (np. Warboar);
            // aura firebreathing pompuje zaczarowanego stwora.
            const enchantedId = effect.type === 'pump_enchanted_creature' ? source?.attachedTo : null;
            // M255/E: „atakujące stwory dostają +X/+0” — odbiorcą jest ZBIÓR
            // atakujących (CR 611.2c), nie cel i nie źródło. Bez
            // reprezentanta zbioru `recipient` był artefaktem-źródłem, więc
            // `combatTrickWindow` nie zachodził i bot dostawał karę „poza
            // oknem walki” ZAWSZE (również w walce) albo (przed wpisem do
            // tabeli) gołą bazę 2. Reprezentant = własny atakujący z
            // PlayerView (ADR 0017); dalej obowiązują te same reguły co dla
            // pumpa z pojedynczym celem (L28 — wspólny mianownik).
            const attackingRecipientId = effect.type === 'buff_attacking_creatures'
              ? (view.combat?.attackers ?? []).find((id) => objectOnBoard(view, id)?.controllerId === view.playerId)
              : null;
            const recipient = target ?? (enchantedId ? objectOnBoard(view, enchantedId) : null)
              ?? (attackingRecipientId ? objectOnBoard(view, attackingRecipientId) : null) ?? source;
            // Savage Surge: ODKRĘCENIE celu obok pumpu („Untap that creature")
            // — premia tylko, gdy cel naprawdę jest zatapnięty (odkręcenie
            // nietapniętego stwora nic nie kupuje).
            const untapsTarget = effects.some((e) => e?.type === 'untap_permanent');
            let value = pGain + (tGain > 0 ? 1 : 0);
            // Savage Surge: „Untap that creature" — odkręcenie ZATAPNIĘTEGO
            // stwora to realna wartość (odzyskany bloker), odkręcenie
            // nie-tapniętego nie kupuje nic (reguła po treści efektu, ADR 0002).
            if (untapsTarget && recipient?.tapped) value += 4;
            // Pump „do końca tury" ma sens dopiero, gdy obrażenia są przesądzone:
            // w combacie (po deklaracjach) albo w obronie. W main/upkeep to
            // wyrzucanie many — gracz i tak zdąży zareagować.
            // M96: pump poza walką ma wartość tylko w turze przeciwnika
            // (bloker na jego atak). W mojej turze poza combatem to strata
            // (M146 — Fake Your Own Death w upkeepie).
            // M206 (audyt Zywym Testerem): `beginning_of_combat` NALEZY do fazy
            // `combat` (TURN_STEPS), wiec sam warunek `phase === 'combat'`
            // przepuszczal pump ZANIM ktokolwiek zadeklarowal atak - dokladnie
            // to, czemu komentarz wyzej mial zapobiegac („po deklaracji
            // atakujacych/blokujacych").
            //
            // Zmierzone (warhammer vs innistrad, seed 8): bot aktywowal
            // Snarling Wolf („{1}{G}: +2/+2, raz na ture") w poczatku walki
            // i NIE atakowal - dwie many na efekt, ktory wygasl w cleanup.
            // Powtorzone w turach 9 i 16 tej samej partii.
            //
            // W poczatku walki pump jest zawsze co najmniej przedwczesny:
            // atakujacy nie sa zadeklarowani, wiec przyrost sily niczego nie
            // przesadza, a przeciwnik dostaje priorytet i widzi powiekszonego
            // stwora, zanim zdecyduje o blokach (CR 508.1). Czekanie nic nie
            // kosztuje - te sama zdolnosc mozna aktywowac po deklaracjach.
            //
            // Ten sam pomiar pokazal dwa dalsze jalowe okna (te same partie,
            // tury 14 i 17): pump w KONCU WALKI, gdy wilk w tej walce nie
            // bral udzialu, i pump w PODTRZYMANIU przeciwnika, gdy nikt
            // jeszcze nie atakowal. Regula generyczna, wspolna dla wszystkich
            // trzech: „+X/+X do konca tury" kupuje cos tylko wtedy, gdy stwor
            // REALNIE bierze udzial w walce (atakuje albo blokuje) - inaczej
            // wygasa w cleanup (CR 514.2), a mana przepada. Dopoki
            // deklaracji nie ma, zawsze mozna poczekac: zdolnosc pozostaje
            // dostepna w kroku blokujacych i pozniej.
            // M218/1 (L41): M206 czytał tu `recipient?.attacking || recipient?.blocking`,
            // a playerView NIE wystawia `blocking` (game-state.js zna tylko
            // `entry.attacking` z state.combat.attackers) — bloker wyglądał
            // na nieuczestniczącego i pump w obronie wymiany był tłumiony.
            // Wspólny helper czyta obie strony z `view.combat` (ADR 0017):
            // atakujących z listy, blokerów z mapy — jedna reguła dla czarów
            // i zdolności (L41).
            const participatesInCombat = combatTrickWindow(view, recipient);
            const inCombat = view.turn.phase === 'combat'
              && view.turn.step !== 'beginning_of_combat'
              && participatesInCombat;
            // M218/2 (kryterium właściciela): ta sama meaningfulność co dla
            // czarów — zdolność pompująca w oknie walki, ale bez zmiany
            // wyniku (1/1 vs 5/5), nie kupuje nic. Kara proporcjonalna do
            // wagi (L3 — musi przebić bazę ~2–10), nie karze pustych pomp.
            if (inCombat && !pumpChangesOutcome(view, recipient, pumpDelta(view, effect))) value -= 26 + pGain;
            if (!inCombat && myTurn(view)) value -= 26;
            // Tura przeciwnika: pump poza walka byl dotad darmowy (kara wyzej
            // dotyczy tylko wlasnej tury), wiec bot palil mane w jego upkeepie
            // na stwora, ktory nikogo nie blokowal.
            if (!inCombat && !myTurn(view)) value -= 26;
            if (recipient && recipient.controllerId === view.playerId) {
              // Combat trick tylko przy OBRONIE (declare_blockers w turze
              // przeciwnika): tam zatapiany bloker wciąż blokuje. W NASZYM
              // combacie pump kosztem tapu przed deklaracją odbiera atak —
              // patologia B1: bot pumpował w beginning_of_combat i stał
              // z zatapianymi stworem, przegrywając deck-outem.
              if (view.turn.step === 'declare_blockers' && !myTurn(view)) value += 2 * pGain;
              // Pump kosztem tapu na stworze gotowym do ataku (main/combat
              // własnej tury) kosztuje utratę tego ataku — zwykle się nie opłaca.
              if (source?.kind === 'creature' && taps && canAttackNow(recipient)) value -= (recipient.power ?? 0) + 3;
              // M195/B (uwaga właściciela, Ghost Warden): trick bojowy użyty
              // NA SAMYM SOBIE kosztem {T}. Bot tapował Ghost Wardena w swojej
              // fazie walki, żeby dać sobie +1/+1 — stwór i tak nie atakował
              // (nie był zadeklarowany), a tapnięcie odbierało mu blok w turze
              // przeciwnika. Cytat: „jeśli tapnę tą kartę to już nią nie
              // zaatakuję, więc buffowanie jest bez sensu".
              //
              // Kara wyżej tego nie łapała: sprawdzała `canAttackNow(recipient)`,
              // a Ghost Warden JEST już wykluczony z ataku w kroku blokujących
              // (atakujący są zadeklarowani), więc warunek nie zachodził.
              // Reguła generyczna (ADR 0002 — bez nazw kart): pump na SIEBIE
              // kosztem tapu ma wartość tylko wtedy, gdy to źródło realnie
              // bierze udział w walce (atakuje albo blokuje). Inaczej +X/+X
              // wygaśnie w cleanup, a stwór zostanie zatapiany.
              const selfPump = source && recipient && source.id === recipient.id;
              const fightsNow = combatTrickWindow(view, recipient);
              if (selfPump && taps && !fightsNow) value -= 30;
            } else {
              value -= 4; // pump na wrogu bez powodu
            }
            score += value;
          }
          if (effect.type === 'tap_permanent' || effect.type === 'tap_permanents'
            || effect.type === 'lock_untap' || effect.type === 'dont_untap_next_untap_step') {
            // Neutralizacja wrogiego stwora (Lira): im większy cel, tym cenniej.
            // M139 (uwaga właściciela): liczy się też MOMENT — tapnięcie po
            // untap stepie przeciwnika wyłącza stwora z ataku i z obrony,
            // a we własnej turze wyparuje przy jego najbliższym odkręceniu.
            const locking = effect.type === 'lock_untap' || effect.type === 'dont_untap_next_untap_step';
            // Jak przy czarach: czekać na okno po untapie przeciwnika może
            // tylko zdolność o szybkości instanta. Zdolność „activate only as
            // a sorcery” zagramy wyłącznie we własnej głównej fazie.
            const canWait = ability?.timing !== 'sorcery';
            score += tapTargetValue(view, target, { locking, canWait });
          }
          // M202/L (uwaga właściciela, Wishful Merfolk): „{1}{U}: This creature
          // loses defender and becomes a Human until end of turn” ma wartość
          // WYŁĄCZNIE we własnej turze PRZED walką i tylko gdy stwór jest
          // odkręcony i może atakować — efekt wyparuje w cleanup, więc
          // aktywowany w turze przeciwnika to czyste marnowanie many
          // (klasa L42: efekt „do końca tury” wycenia się razem z zegarkiem).
          // Reguła generyczna po deskryptorze `losesKeywords` (ADR 0002).
          if ((effect.losesKeywords ?? []).includes('defender')) {
            const self = objectOnBoard(view, cmd.objectId) ?? target;
            const beforeCombat = myTurn(view)
              && ['main1', 'main2', 'beginning_of_combat', 'declare_attackers'].includes(view.turn.step);
            const canAttackNow2 = Boolean(self) && !self.tapped && !self.summoningSickness;
            score += (beforeCombat && canAttackNow2) ? 10 + 2 * (self?.power ?? 0) : -20;
          }
          // M202/J (uwaga właściciela, Merfolk Mesmerist): „{U}, {T}: Target
          // player mills two cards” TAPUJE źródło, więc mill za cenę blokera ma
          // sens tylko, gdy (a) jest kim blokować BEZ niego i (b) przeciwnik
          // realnie mieści się w wyścigu bibliotek. Bez bramek bot millował co
          // turę swoim JEDYNYM stworem, mając 18 kart przy 30 u przeciwnika —
          // „bot prędzej zginie niż opróżni mi bibliotekę”. Liczba kart
          // w bibliotece jest informacją jawną (CR 402.1), więc oba warunki są
          // policzalne z widoku (FoW nienaruszone). Kary muszą PRZEBIĆ premię
          // za mill — inaczej są martwe (klasa L3); warunki właściciela są
          // łącznikiem „i”, więc niespełnienie KTÓREGOKOLWIEK gasi zdolność.
          if ((effect.type === 'mill_cards' || effect.type === 'mill_from_bottom')
            && (cmd.targets ?? []).includes(enemy(view)?.id)) {
            const source = objectOnBoard(view, cmd.objectId);
            const otherBlockers = myCreatures(view).filter((o) => o.id !== cmd.objectId
              && !o.tapped && (o.power ?? 0) > 0).length;
            if (source && !source.tapped && otherBlockers === 0) score -= 60;
            const foeLibrary = view.zones.library.filter((o) => o.controllerId !== view.playerId).length;
            if (foeLibrary > myLibraryCount(view)) score -= 60;
          }
          // M146 (Twiddle — tryb Odkręcenie jako zdolność): jak przy czarach —
          // odkręcenie WŁASNEGO zatapniętego stwora ma wartość, cudzego to kara.
          if (effect.type === 'untap_permanent') {
            const victim = objectOnBoard(view, cmd.targets?.[effect.targetIndex ?? 0]) ?? target;
            if (victim) {
              const isLand = victim.kind === 'land' || (victim.types ?? []).includes('Land');
              if (victim.controllerId === view.playerId) {
                // Land sam się odkręca w untap step — wartość ma tylko stwór.
                score += (!isLand && victim.tapped) ? 8 + 2 * (victim.power ?? 0) : -4;
              } else {
                score -= 25; // odkręcanie wroga — zawsze złe
              }
            }
          }
          // M138/Z1 (audyt Żywym Testerem): nadanie keywordu do końca tury nie
          // było w ogóle wyceniane, więc każdy cel dostawał to samo `score = 2`
          // i bot brał pierwszy z brzegu — 24× z rzędu dał Zadeptywanie MOIM
          // stworom (Soulbright Flamekin, green vs red, seed 101). Płacił {2}
          // za wzmocnienie przeciwnika, i to keywordem użytecznym wyłącznie
          // w ataku NA NIEGO. Ta sama klasa co M96 (cele-gracze) i M135 (scry):
          // efekt spoza listy = remis wariantów = „pierwsza oferta”.
          if (effect.type === 'grant_keywords_until_end_of_turn') {
            const recipient = target ?? source;
            const granted = effect.keywords ?? [];
            if (recipient && recipient.controllerId !== view.playerId) {
              // Wzmacnianie CUDZEGO stwora to czysta strata: mana wydana na
              // korzyść przeciwnika. Kara rośnie z siłą obdarowanego.
              score -= 12 + 2 * (recipient.power ?? 0);
            } else if (recipient) {
              // Własny stwór: keyword „do końca tury” ma wartość tylko wtedy,
              // gdy zdąży zadziałać w tej turze — i tylko taki, którego stwór
              // jeszcze nie ma (CR 702.x — duplikat nie robi nic).
              const alreadyHas = new Set(recipient.keywords ?? []);
              // M175/A2 (uwaga właściciela, Death-Hood Cobra): keywordy z
              // IDENTYCZNEJ aktywacji już WISZĄCEJ na stosie liczą się jak
              // posiadane — bot aktywował ten sam grant dwa razy pod rząd,
              // bo między aktywacją a rozstrzygnięciem stwór keywordu
              // jeszcze nie miał (widok stosu niesie sourceId + abilityIndex).
              const pendingSameGrant = (view.zones.stack ?? []).some((entry) => (
                entry.controllerId === view.playerId
                && entry.sourceId === cmd.objectId
                && entry.abilityIndex === cmd.abilityIndex
              ));
              const fresh = pendingSameGrant ? [] : granted.filter((k) => !alreadyHas.has(k));
              if (fresh.length === 0) {
                score -= 10; // duplikat keywordu (na stworze albo na stosie): zero zmiany w grze
              } else {
                // M173/E: grant „until EOT" to TRICK BOJOWY — wspólna wycena
                // okien walki (M179/A1: helper dzielony z gałęzią czarów).
                score += keywordGrantWindowValue(view, recipient, fresh);
              }
            }
          }
          if (effect.type === 'gain_life') {
            // M236/2+3 (audyt Żywym Testerem + KOREKTA właściciela): życie
            // POWYŻEJ 20 NIE marnuje się — to bufor (21, 22…). Zysk życia jest
            // więc ZAWSZE małą wartością dodatnią, większą gdy nisko/pod
            // naciskiem. Różnica jest w KOSZCIE:
            //  - „{T}: zyskaj życie" (tap, bez poświęcenia) jest praktycznie
            //    DARMOWE → rób to w nieskończoność (bufor), CHYBA że stwór jest
            //    potrzebny do bloku w tej turze (wtedy trzymaj go nietapniętego);
            //  - „poświęć permanent: zyskaj życie" to realna STRATA karty →
            //    opłaca się tylko gdy (a) życie krytyczne (ratunek), (b)
            //    poświęcany permanent i tak zginie w tej turze (zadeklarowany
            //    bloker ginący bez zabicia atakującego / cel removalu na stosie
            //    — „darmowe" poświęcenie), albo (c) permanent jest bardzo tani
            //    (TMC ≤ 1). Inaczej trzymaj.
            const amount = effect.amount ?? 0;
            const life = myLife(view);
            const pressure = enemyAttackPower(view);
            // Bufor życia: zawsze dodatni, skalowany sytuacją (krytyczne życie
            // albo realny nacisk podnoszą wartość).
            let lifeValue;
            if (life <= 5) lifeValue = 2 + amount;                       // ratunek
            else if (life <= 10 || pressure >= life - 5) lifeValue = 1 + Math.min(amount, 3);
            else lifeValue = Math.min(1 + Math.floor(amount / 2), 3);    // bufor — mała, ale dodatnia
            score += lifeValue;
            if (ability?.cost?.sacrificeSelf) {
              // Poświęcenie permanentu za życie: strata karty. Uzasadnione tylko
              // gdy ratunek / permanent i tak ginie w tej turze / bardzo tani.
              const lifeCritical = life <= 5 || pressure >= life;
              const doomedAnyway = permanentDoomedThisTurn(view, source);
              const cheapPermanent = (source?.manaCost ?? cardDef(source?.cardId)?.manaCost ?? 99) <= 1;
              if (!(lifeCritical || doomedAnyway || cheapPermanent)) {
                // Kara przebija bufor + bazę zdolności, żeby wariant zszedł
                // poniżej passu (trzymaj permanent na później).
                score -= lifeValue + (source?.kind === 'creature' ? 12 : 8) + 6;
              }
            } else if (ability?.cost?.tap && source?.kind === 'creature') {
              // Tap-za-życie DARMOWY: zostaw stwora nietapniętego, jeśli jest
              // realnie potrzebny do bloku w tej turze (przeciwnik atakuje
              // i ten stwór mógłby zablokować). Inaczej bufor jest OK.
              const attackers = view.combat && view.combat.attackingPlayerId !== view.playerId
                ? (view.combat.attackers ?? []) : [];
              const neededToBlock = attackers.length > 0 && !source.tapped && canAttackNow(source);
              if (neededToBlock) score -= lifeValue + 8; // trzymaj bloker
            }
          }
          // M157/L28 (Mournful Zombie „{W},{T}: Target player gains 1 life"):
          // cel-gracz bez wyceny = remis → bot mógł LECZYĆ PRZECIWNIKA.
          // Życie sobie = plus, przeciwnikowi = kara.
          if (effect.type === 'gain_life_target') {
            const slot = cmd.targets?.[effect.targetIndex ?? 0] ?? null;
            const amount2 = effect.amount ?? 1;
            if (slot === view.playerId) score += 2 + amount2;
            else if (slot != null && slot === enemy(view)?.id) score -= 25 + amount2;
          }
          // M157/L28: zwrot karty z grobu w upkeep (Plague Reaver) — jak
          // w pętli czarów: premiujemy najcenniejszego stwora z grobu.
          if (effect.type === 'return_to_battlefield_under_control_at_upkeep') {
            const slot = cmd.targets?.[effect.targetIndex ?? 0] ?? null;
            const gyCard = slot ? (view.zones.graveyard ?? []).find((o) => o.id === slot) : null;
            if (gyCard) {
              const gyDef = cardDef(gyCard.cardId);
              score += 10 + ((gyCard.power ?? gyDef?.power ?? 0) * 2)
                + (gyCard.toughness ?? gyDef?.toughness ?? 0);
            }
          }
          // M96 (audyt Żywym Testerem): zdolności celujące w GRACZA nie były
          // w ogóle wyceniane — każdy cel dostawał to samo `score = 2`, więc
          // bot 7× z rzędu zmielił WŁASNĄ bibliotekę Cellar Door („Target
          // player mills 1", token Zombie i tak dostaje kontroler). Ta sama
          // logika co w scoringu `cast_spell` (mill/damage per cel) — tu
          // brakowało jej dla ścieżki zdolności aktywowanych.
          // M96 (audyt Żywym Testerem): mielenie celujące w GRACZA — mielenie
          // siebie przybliża deck-out, wroga to zysk.
          const playerTarget = (cmd.targets ?? []).find((id) => id === view.playerId || id === enemy(view)?.id);
          if (playerTarget && (effect.type === 'mill_cards' || effect.type === 'mill_from_bottom')) {
            score += playerTarget === view.playerId ? -25 : 6 + 2 * (effect.amount ?? 1);
          }
          // M237/3+4 (Blazing Torch + model właściciela): obrażenia/utrata życia
          // z AKTYWOWANEJ zdolności — ta sama wycena co czary (damageTargetValue):
          // stwór wroga wg pozostałego życia (dobicie = removal, nieletalny chip
          // poza walką = zakaz), gracz proporcjonalnie do % życia, SIEBIE/własny
          // stwór = zakaz. Jedno źródło prawdy (L41).
          if (effect.type === 'damage' || effect.type === 'lose_life') {
            const slot = cmd.targets?.[effect.targetIndex ?? 0];
            const amount = Number.isInteger(effect.amount) ? effect.amount : 0;
            // Zdolność, która POŚWIĘCA źródło/permanent, by zadać obrażenia
            // (Blazing Torch: {T},poświęć: 2 dmg), to zasób LIMITOWANY — traktuj
            // jak skalujący (dobij wartościowy cel albo ≥25% życia gracza, nie
            // marnuj na chip w zdrową twarz). Zwykła zdolność bez poświęcenia
            // (np. wielorazowy ping) używa prostszego modelu.
            const scaling = Boolean(ability?.cost?.sacrificeSelf || ability?.cost?.sacrifice);
            if (slot != null) score += damageTargetValue(view, slot, amount, scaling);
          }
          // M162/B (uwaga właściciela, Ghoulcaller's Bell): symetryczny mill
          // bez celu („each player mills") — ta sama wycena wyścigu bibliotek
          // co w gałęzi cast_spell (L41: bliźniacze gałęzie trzymamy razem).
          if (effect.type === 'mill_both_players') {
            const n = effect.amount ?? 1;
            const myLib = view.zones.library.filter((o) => o.controllerId === view.playerId).length;
            const foeLib = view.zones.library.filter((o) => o.controllerId !== view.playerId).length;
            if (myLib - n <= 0) score -= 120; // milduję własną ostatnią kartę — samobójstwo
            else if (foeLib - n <= 0) score += 80; // przeciwnik dobiera z pustej = wygrana
            else if (myLib <= foeLib) score -= 40; // nie prowadzę — dzwonienie szkodzi bardziej mnie
            else score += 6 + Math.min(10, myLib - foeLib); // prowadzę: mały zysk rosnący z przewagą
          }
          // M173/D (uwaga właściciela, Rustvine Cultivator): add_counter nie
          // miał wyceny w ścieżce zdolności (klasa L50) — bot tapował się CO
          // TURĘ na licznik oil (nawet w upkeepie) i nigdy go nie konsumował.
          // Liczniki STATYSTYCZNE: jak w ścieżce czarów (własny +, wrogi −).
          // Liczniki ZASOBOWE (oil itd.): wartość tylko, gdy INNA zdolność
          // źródła je konsumuje (cost.removeCounter) i zapas < potrzeb;
          // uzupełnianie po walce (postcombat), nie kosztem ataku/bloku.
          if (effect.type === 'add_counter') {
            const counterName = effect.counter ?? '+1/+1';
            // M221/F (zgłoszenie właściciela, Trigon of Corruption): licznik
            // DEBUFF (`-1/-1`, `-1/0`, `-0/-1`) na WROGIM stworze to czysty zysk
            // (osłabienie/zabicie), a wycena traktowała go jak licznik zasobowy
            // bez konsumenta → kara −25, więc bot NIGDY nie używał zdolności
            // „{2},{T},usuń charge: -1/-1 na cel". Rozpoznanie po deskryptorze
            // (minus w nazwie licznika, CR 122), bez nazw kart (ADR 0002).
            const DEBUFF_COUNTERS = new Set(['-1/-1', '-1/0', '-0/-1', 'stun']);
            const statCounter = ['+1/+1', '+1/+0', '+0/+1', 'shield'].includes(counterName)
              || KEYWORD_COUNTERS.has(counterName);
            const tgt = cmd.targets?.[0] ? objectOnBoard(view, cmd.targets[0]) : source;
            const amount = Math.max(1, effect.amount ?? 1);
            if (DEBUFF_COUNTERS.has(counterName)) {
              // Debuff na wrogim stworze = wartość; kill (toughness ≤ amount)
              // premiowany. Na WŁASNYM to samobój — twarda kara (L3).
              if (tgt && tgt.controllerId !== view.playerId) {
                // Tylko liczniki obniżające WYTRZYMAŁOŚĆ mogą zabić (CR 704.5f).
                // `stun`/`-1/0` nie zmniejszają toughness — osłabiają/blokują,
                // ale nie liczymy ich jako lethal.
                const reducesToughness = counterName === '-1/-1' || counterName === '-0/-1';
                const toughLeft = (tgt.toughness ?? 0) - (tgt.damage ?? 0);
                const kills = reducesToughness && toughLeft <= amount;
                score += kills ? 30 + (tgt.power ?? 0) * 2 : 10 + 4 * amount;
              } else {
                score -= 90;
              }
            } else if (statCounter) {
              if (tgt?.controllerId === view.playerId) score += 8 + 4 * amount;
              else score -= 90;
            } else if (counterName !== 'charge') { // charge wycenia station_counters
              const consumers = (source?.cardId ? (cardDef(source.cardId)?.abilities ?? []) : [])
                .filter((a) => a?.cost?.removeCounter?.name === counterName);
              const need = consumers.length > 0
                ? Math.max(...consumers.map((a) => a.cost.removeCounter.amount ?? 1))
                : 0;
              const current = (tgt?.counters ?? {})[counterName] ?? 0;
              if (need === 0 || current >= need) {
                score -= 25; // nikt nie konsumuje / zapas pełny — tap za nic
              } else {
                const ownPostcombat = view.turn.activePlayerId === view.playerId
                  && view.turn.phase === 'postcombat_main';
                score += ownPostcombat ? 6 : -8; // uzupełnij zapas PO walce
              }
            }
          }
          if (effect.type === 'station_counters') {
            // Station (Wedgelight Rammer / Warmaker Gunship): cenne tylko do
            // osiągnięcia progu charge, po którym artefakt staje się stworem.
            // Dalej aktywacja jest bezwartościowa — bot pompował charge w kółko.
            const charge = (source?.counters?.charge ?? 0);
            // Próg jest CECHĄ KARTY (Wedgelight Rammer 9+, Warmaker Gunship
            // 6+) i przychodzi w deskryptorze `station` przez PlayerView.
            // Gdyby go zabrakło, bierzemy próg z definicji karty zamiast
            // zgadywać „9” — inaczej bot pompowałby Gunshipa trzy liczniki
            // za daleko (uwaga właściciela, M120).
            const threshold = source?.station?.threshold
              ?? cardDef(source?.cardId)?.station?.threshold
              ?? 9;
            // M153/A2 (uwaga właściciela): bot tapował WSZYSTKIE stwory ASAP,
            // żeby osiągnąć próg charge, i potem nie miał kim atakować ani
            // blokować. Station tapuje INNEGO stwora (tapOtherCreature), który
            // zostaje zatapiany do następnego untapu — to marnotrawstwo poza
            // własną Główną 2. Strategia: budujemy charge WYŁĄCZNIE po własnym
            // ataku (postcombat_main). Poza tym oknem kara schodzi poniżej passu.
            const stationWindow = myTurn(view) && view.turn.phase === 'postcombat_main';
            if (charge >= threshold) {
              score -= 15; // próg osiągnięty — dalsze pumpowanie bez sensu
            } else if (stationWindow) {
              score += 4 + Math.max(0, threshold - charge);
            } else {
              // Poza własną Główną 2 tapujemy stwora, którego moglibyśmy
              // użyć do ataku/bloku — czysta strata tempa.
              score -= 30;
            }
            if (tapsCreature) score -= 3;
            // M120 (audyt żywym testerem, seria E): przy 1 życia przeciwnika
            // bot tapował Soldiera i Robota na liczniki charge zamiast nimi
            // zaatakować po wygraną. Station daje do +13 pkt, a kara za
            // tapnięcie atakującego wynosiła −3, więc „budowanie statku”
            // wygrywało z zakończeniem partii.
            //
            // Rozwiązanie generyczne (ADR 0002): jeśli tapowany stwór MOŻE
            // dziś atakować, a nasza armia i tak przebija życie przeciwnika,
            // aktywacja odbiera nam zwycięstwo. Liczymy realny potencjał
            // ataku bez tego stwora.
            // Koszt „tapnij stwora” przychodzi w trzech polach komendy
            // (tapCreatureId / tapOtherCreatureId / crewCreatureIds) —
            // sprawdzamy wszystkie, inaczej Station wymyka się bramce.
            const tappedIds = [
              cmd.tapCreatureId,
              cmd.tapOtherCreatureId,
              ...(cmd.crewCreatureIds ?? []),
            ].filter(Boolean);
            const tappedForCost = tappedIds.map((id) => objectOnBoard(view, id)).find(Boolean);
            if (myTurn(view) && tappedForCost && canAttackNow(tappedForCost)) {
              const foeLife = enemy(view)?.life ?? Infinity;
              const readyPower = myCreatures(view)
                .filter((creature) => canAttackNow(creature))
                .reduce((sum, creature) => sum + (creature.power ?? 0), 0);
              if (readyPower >= foeLife) score -= 60;      // atak wygrywa partię TERAZ
              else if (readyPower - (tappedForCost.power ?? 0) < foeLife
                && readyPower >= foeLife - 2) score -= 12; // blisko wygranej
            }
          }
          // ---- Batch 47 (L50/L51): wycena nowych efektow ----------------
          // Bez wyceny kazdy wariant remisuje i bot gra losowo — w partii
          // widac to jako bezsensowne aktywacje.
          if (effect.type === 'each_player_exiles_top_face_down') {
            // Pyxis of Pandemonium ({T}): efekt SYMETRYCZNY — wygania wierzch
            // KAZDEMU. Sam w sobie nic nie daje (karty leza zakryte), wartosc
            // pojawia sie dopiero przy drugiej zdolnosci za {7}. Lekko na
            // plus, bo buduje zasob; mocno w dol, gdy nie stac nas na wyplate.
            const canAffordPayoff = (view.player?.mana ?? 0) >= 7
              || (view.zones.battlefield ?? []).filter((o) => o.controllerId === view.playerId
                && (o.types ?? []).includes('Land') && !o.tapped).length >= 7;
            score += canAffordPayoff ? 6 : 2;
          }
          if (effect.type === 'turn_up_exiled_and_put_permanents') {
            // Wyplata Pyxis: im wiecej wygnanych kart, tym lepiej, ale efekt
            // jest SYMETRYCZNY (przeciwnik tez dostaje swoje permanenty),
            // wiec liczymy WLASNE karty na plus, cudze na minus.
            const source = cmd.objectId ? objectOnBoard(view, cmd.objectId) : null;
            const linked = source?.exiledCardIds ?? [];
            let mine = 0;
            let theirs = 0;
            for (const id of linked) {
              const card = (view.zones.exile ?? []).find((o) => o.id === id);
              if (!card) continue;
              if (card.controllerId === view.playerId) mine += 1; else theirs += 1;
            }
            score += mine * 8 - theirs * 6;
          }
          if (effect.type === 'graveyard_card_to_library_top_choice') {
            // Sequestered Stash: odzysk artefaktu z grobu. Wartosc rosnie
            // z liczba artefaktow w grobie; bez nich zostaje sam mill (na
            // wlasnej bibliotece — raczej szkodliwy).
            const artifactsInGrave = (view.zones.graveyard ?? []).filter((o) => o.controllerId === view.playerId
              && (o.types ?? []).includes('Artifact')).length;
            score += artifactsInGrave > 0 ? 10 + artifactsInGrave * 3 : -8;
          }
          // M236/6 (audyt Żywym Testerem, Barkform Harvester): „{2}: włóż kartę
          // z grobu na SPÓD biblioteki". Zakopanie własnej karty na spód to
          // near-zero wartość — bot robił to 3×/turę w main2, paląc po 2 many za
          // nic. To zdolność niszowa (odpowiedź na grób-hate/synergia biblioteki,
          // której bot nie modeluje), nie proaktywne zagranie. Kara schodzi
          // poniżej passu — bot trzyma manę. Reguła po typie efektu (ADR 0002).
          if (effect.type === 'put_graveyard_card_on_bottom') {
            score -= 10;
          }
          // ---- Batch 48 (L50/L51): wycena nowych efektow -----------------
          if (effect.type === 'your_creatures_gain_keywords_until_end_of_turn') {
            // Formidable (Stampeding Elk Herd): trample dla druzyny ma wartosc
            // tylko przy realnym ataku — trigger i tak odpala sie przy ataku,
            // wiec liczymy liczbe wlasnych stworow.
            score += Math.min(30, myCreatures(view).length * 6);
          }
          if (effect.type === 'sacrifice_self_if_counters_then_treasure') {
            // Contested Game Ball: to rider zdolnosci „dobierz karte" —
            // poswiecenie po piatym liczniku jest KORZYSTNE (Skarb), wiec
            // nie karzemy; sama wycena dobrania wystarczy.
            score += 0;
          }
          if (effect.type === 'subtype_spells_gain_flash_and_etb_fight_this_turn') {
            // Cherished Hatchling: warte tyle, ile Dinozaurow zostalo w rece.
            const inHand = (view.zones.hand ?? [])
              .filter((o) => (o.subtypes ?? []).includes(effect.subtype)).length;
            score += inHand * 8;
          }
          if (effect.type === 'attacker_gains_control_and_untaps') {
            // Trigger obronny — nie jest wyborem bota (odpala sie sam);
            // wycena zerowa, zeby nie zaburzac rankingu.
            score += 0;
          }
          if (effect.type === 'lose_life_enchanted_permanent_controller') {
            // Clawing Torment: powolne obcinanie zycia przeciwnika.
            score += 6;
          }
          if (effect.type === 'add_mana') {
            // Dodatkowa mana (Holdout Settlement, Apprentice Wizard, Treasure):
            // cenna tylko, gdy jest co zagrać. Liczy się BILANS: produkcja
            // minus koszt many zdolności (Wizard: 3 − 1 = +2).
            const hasPlayable = view.zones.hand.some((o) => (o.manaCost ?? 0) > 0 && o.kind !== 'land');
            // M155 (audyt żywym testerem, Pristine Talisman): zdolność many
            // z riderem gain_life — tap NIGDY nie jest zmarnowany (daje
            // życie), więc kara M128 („tapowanie na zapas") nie ma sensu.
            const manaWithLifeRider = abilityEffectTypes.includes('gain_life');
            const net = (effect.amount ?? 0) - (ability?.cost?.mana ?? 0);
            // =================================================================
            // M128 — uwaga B właściciela (2026-08-17):
            //   „Przeciwnik wystawił Seer's Lantern po czym od razu ją tapnął
            //    dla many, której nie zużył i się zmarnowała. Po co tapował
            //    latarnię? Nie lepiej poczekać aż mana będzie potrzebna?"
            //
            // Root cause: wycena pytała WYŁĄCZNIE „czy w ręce jest cokolwiek
            // płatnego" (hasPlayable), a nie „czy ta mana COKOLWIEK zmienia".
            // Tymczasem engine auto-tapuje przy płatności same LĄDY
            // (producibleMana) — więc gdy lądy już pokrywają wszystko, co bot
            // zamierza rzucić, aktywacja latarni nie odblokowuje NICZEGO.
            // Wyprodukowana mana ginie w cleanup (CR 500.4): czysta strata
            // tempa, a przy Seer's Lantern dodatkowo blokada drugiej zdolności
            // ({2},{T}: Scry 1), bo źródło jest już tapnięte.
            //
            // Reguła generyczna (ADR 0002), po deskryptorach kosztu — zero
            // nazw kart: mana ma wartość, gdy PRZESUWA PRÓG opłacalności,
            // czyli istnieje w ręce karta, której NIE stać nas zagrać teraz,
            // a stać po tej aktywacji. To ta sama myśl co L28: jedna reguła
            // dla wszystkich źródeł many zamiast kolejnego `if` per karta.
            // =================================================================
            const availableNow = manaAvailableNow(view);
            const availableAfter = availableNow + net;
            // Koszt karty czytamy z widoku (manaCost); pomijamy lądy (nie są
            // czarami) i karty, których i tak nie stać nas po aktywacji.
            const unlocksSomething = view.zones.hand.some((o) => {
              if (o.kind === 'land') return false;
              const cost = o.manaCost ?? 0;
              if (cost <= 0) return false;
              return cost > availableNow && cost <= availableAfter;
            });
            // Wartość wyłącznie za realne odblokowanie zagrania.
            score += unlocksSomething ? 4 * Math.max(0, net) : 0;
            // M119/Z5 + M150/C1 (audyt żywym testerem + uwaga właściciela):
            // zdolność o bilansie <= 0 (filtr koloru — Jeskai Devotee
            // „{1}: Add {U}, {R} or {W}”) nie dawała ANI punktu, ani kary,
            // więc bot aktywował ją w każdej swojej turze — także wtedy, gdy
            // nie rzucał potem żadnego czaru. Przy net<=0 pula liczbowo się nie
            // zmienia, więc `unlocksSomething` (progi liczbowe) JEST ZAWSZE
            // fałszem — a tapnięty ląd + spent many zostaje (mana wyparuje
            // w cleanup, CR 500.4). Kara musi być mocna NIEZALEŻNIE od
            // hasPlayable: „coś w ręce istnieje” nie znaczy, że filtrowanie
            // many cokolwiek odblokowuje (bot nie modeluje kolorów liczbowej
            // puli). Zostawiamy jawnie ujemną, żeby nie remisowała z passem.
            if (net <= 0) score -= manaWithLifeRider ? 0 : (hasPlayable ? 10 : 16);
            // M128: „tapowanie na zapas" — produkcja, która niczego nie
            // odblokowuje, musi zejść PONIŻEJ passu (0), inaczej bazowe
            // `score = 2` za legalne zagranie i tak wygra z czekaniem.
            // Kara jest łagodniejsza, gdy w ręce coś czeka (mana bywa wtedy
            // krokiem do zagrania w tej samej turze przez kolejne aktywacje),
            // i ostra, gdy ręka nie ma czego zagrać w ogóle.
            else if (!unlocksSomething) score -= manaWithLifeRider ? 0 : (hasPlayable ? 6 : 14);
            if (tapsCreature) score -= 3;
            // M155 (audyt żywym testerem, Pristine Talisman): z riderem
            // gain_life dodajemy wartość darmowego życia (2 + ilość) — przy
            // braku odblokowania czaru tap za leczenie wciąż wygrywa z passem.
            if (!unlocksSomething && manaWithLifeRider) {
              const lifeAmt = effects.find((e) => e?.type === 'gain_life')?.amount ?? 1;
              score += 2 + (lifeAmt ?? 0);
            }
            // Poświęcenie źródła jako koszt (Treasure) jest jednorazowe —
            // trzymamy token, dopóki mana nie jest realnie potrzebna.
            if (ability?.cost?.sacrificeSelf && !unlocksSomething) score -= 6;
            // Poświęcenie źródła jako koszt (Treasure) jest jednorazowe —
            // trzymamy token, dopóki mana nie jest realnie potrzebna.
            if (ability?.cost?.sacrificeSelf && !unlocksSomething) score -= 6;
          }
          if (effect.type === 'create_token') {
            // Zdolność produkująca token (np. Dragonbroods' Relic) jest
            // oceniana tym samym generycznym deskryptorem co czar-token.
            const amount = Number.isInteger(effect.amount) ? effect.amount : 1;
            const tokenPower = effect.power === 'source_power' ? (source?.power ?? 0) : (effect.power ?? 1);
            const tokenToughness = effect.toughness === 'source_power' ? (source?.power ?? 0) : (effect.toughness ?? 1);
            score += 10 * amount * (2 * tokenPower + tokenToughness) / 3;
            if (ability?.cost?.sacrificeSelf) score -= source?.kind === 'creature' ? 4 : 1;
            // M243/C (zgłoszenie właściciela, Heap Gate #3): token będący
            // WYŁĄCZNIE bankiem many (Treasure/Powerstone — token-def albo
            // deskryptor efektu: jedyną funkcją jest add_mana, brak ciała)
            // za KOSZT many i tapnięć w turze, w której nie ma co rzucić,
            // to przeniesienie many na przyszłość — bot nie planuje portfela
            // na nast. turę, więc mierzymy TYLKO bieżącą turę: zapłata many
            // + tapowane źródła (tu: DWA lądy) a token dopiero poświęci się
            // jutro za tę samą manę. Bilans zerowy co do liczby, ujemny co
            // do tempa. Kara przebija premię „10 pkt za token" (L3: kara ma
            // przenosić wariant PONIŻEJ passa).
            const tokenDef = effect.cardId ? cardDef(effect.cardId) : null;
            const tokenAbilities = effect.abilities ?? tokenDef?.abilities ?? [];
            const tokenEffects = tokenAbilities.flatMap((a) => {
              const fx = a?.effect;
              return Array.isArray(fx) ? fx : fx ? [fx] : [];
            });
            const tokenOnlyManaBank = (effect.power ?? tokenDef?.power ?? 0) <= 0
              && tokenEffects.length > 0
              && tokenEffects.every((fx) => fx?.type === 'add_mana');
            if (tokenOnlyManaBank) {
              const hasPlayable = view.zones.hand.some((o) => (o.manaCost ?? 0) > 0 && o.kind !== 'land');
              score -= hasPlayable ? 13 : 14;
            }
          }
          if (effect.type === 'become_basic_land_type') {
            // Pętla jakości Żywym Testerem (2026-08-26, g9): bot aktywował
            // Unstable Frontier ({T}: cel — twój ląd staje się podstawowym
            // typem do końca tury) CO TURĘ, bo wynik wychodził 0 — baza +2 za
            // „legalne zagranie" i kara −2 znosiły się dokładnie, więc zdolność
            // remisowała z passem i wygrywała po kolejności (L3: kara MUSI
            // przebić premię, inaczej jest martwa). Bot nie modeluje jedynej
            // realnej korzyści z tej zmiany (mana-fixing pod kolor, którego
            // nie umie wyprodukować — pula jest kolorowa od ADR 0015), więc
            // domyślnie to zmarnowany tap. Kara musi zepchnąć wariant poniżej
            // passu (0): baza 2 − 8 = −6.
            // NOTE: wycena „zmiana typu odblokowuje rzut czaru pod brakujący
            // kolor" to możliwe przyszłe usprawnienie (wymaga modelu
            // castability po kolorze); dziś bez niej — deskryptorem, nie nazwą
            // karty (ADR 0002).
            score -= 8;
          }
          // Batch 52 (audyt Żywym Testerem, Leonin Surveyor „{3}, exile z
          // grobu: dobierz"): `draw_cards` ze zdolności AKTYWOWANEJ nie miało
          // wyceny w tej ścieżce (bliźniacza gałąź czarów ją ma — L41). Bot
          // widział gołe score=2 i potrafił przełożyć dobranie karty na pass
          // albo inny trywialny wariant. Wartość = karta (P.drawCardValue),
          // jak w cast_spell — generycznie po typie efektu (ADR 0002).
          if (effect.type === 'draw_cards' || effect.type === 'draw_cards_both_players') {
            const drawAmount = Number.isInteger(effect.amount) ? effect.amount : 1;
            score += P.drawCardValue * drawAmount + drawDeckingPenalty(view, drawAmount);
          }
          // Batch 52 (Jolrael, Mwonvuli Recluse): „{4}{G}{G}: twoje stwory
          // mają bazowe X/X do końca tury (X = karty w ręce)". Bez wyceny
          // zdolność dostawała gołe score=2 i bot aktywował ją nawet, gdy
          // OSŁABIAŁA własną planszę (6/6 → 2/2 przy 2 kartach w ręce).
          // Wartość = suma zmian P/T po własnej stronie; kara, gdy netto nie
          // wzmacnia albo okno jest złe (efekt wygasa w cleanup — CR 514.2).
          if (effect.type === 'set_base_pt_creatures_you_control') {
            const handCount = (view.zones.hand ?? []).filter((o) => o.controllerId === view.playerId).length;
            const ownCreatures = (view.zones.battlefield ?? [])
              .filter((o) => o.kind === 'creature' && o.controllerId === view.playerId);
            if (ownCreatures.length === 0) {
              score -= 20; // nie ma kogo zmienić — 6 many za nic
            } else {
              let net = 0;
              for (const c of ownCreatures) {
                net += (handCount - (c.power ?? 0)) * 2 + (handCount - (c.toughness ?? 0));
              }
              if (net <= 0) {
                // Nie zmienia albo OSŁABIA własną planszę — kara przebija bazę.
                score -= 30;
              } else {
                const precombat = myTurn(view) && view.turn.phase === 'precombat_main';
                const defends = !myTurn(view)
                  && (view.turn.step === 'declare_attackers' || view.turn.step === 'declare_blockers');
                if (precombat || defends) score += Math.min(net, 30);
                else score -= 12; // X/X wyparuje w cleanup bez udziału w walce
              }
            }
          }
        }
        if (cmd.xValue != null) score -= Math.min(cmd.xValue ?? 0, 2) * 0.5; // koszt {X} — drobna kara
        // Equip: załączenie na własnym stworze jest tym lepsze, im większy
        // nosiciel; evasion z grantowanych keywordów (flying) i haste dla
        // świeżych stworów mają realną cenę — bez tego bot nigdy nie wyposaża.
        const sourceEquip = source?.equipment && target && target.controllerId === view.playerId;
        if (sourceEquip) {
          const grants = source.equipment.keywords ?? [];
          // Patologia M83 (żywy tester): re-equip do stwora, który JUŻ nosi ten
          // sprzęt, to bezczynny no-op — bot zapętlał się wyposażając ten sam
          // stwór w kółko (stos pęczniał, gra utykała). Equip do nowego nosiciela
          // premiujemy; do obecnego nosiciela — kara.
          if (target.attachedTo === cmd.objectId || source.attachedTo === target.id) {
            score -= 40;
          } else {
            // M100/E13 (zgłoszenie A właściciela, żywy log): straż M83 łapała
            // tylko no-op na TEN SAM obiekt — bot przestawiał sprzęt między
            // RÓWNYMI nosicielami (flat bonus ponosił pass), co wyglądało jak
            // „wyposaża Apprentice Wizard" po dwa razy z rzędu. Przepięcie
            // między SWOIMI nosicielami ma sens dopiero przy wyraźnym zysku
            // (≥2 siły różnicy); inaczej to wyrzucenie many.
            const wearer = source.attachedTo ? objectOnBoard(view, source.attachedTo) : null;
            const wornByMine = Boolean(wearer) && wearer.controllerId === view.playerId;
            if (wornByMine) {
              const delta = (target.power ?? 0) - (wearer.power ?? 0);
              // M288/C (sedno zgłoszenia): PRZENIESIENIE sprzętu było wyceniane
              // po samej sile nosiciela, więc bot płacił {2} za ruch, który nic
              // nie zmieniał — a potem płacił {2} jeszcze raz, za ruch z powrotem.
              // Dziś przeniesienie przechodzi TE SAME badania co pierwsze założenie:
              //  - jeśli celowi sprzęt niczego nie dodaje (brak pompy, martwa
              //    warunkowa ewazja, granty już obecne) — kara jak za rzut w próżnię;
              //  - jeśli dodaje, ale MNIJEJ niż obecnemu nosicielowi, przeprowadzka
              //    jest pogorszeniem planszy, nie poprawą.
              const payload = equipValuation(view, source, target);
              const wornPayload = equipValuation(view, source, wearer);
              if (payload.nothingAdded) score -= 12;
              else if (payload.value > wornPayload.value) {
                // NAPRAWA, nie kaprys: na obecnym nosicielu efekt sprzętu jest
                // martwy, a na celu żyje (np. warunkowa ewazja progu 3 na 3/2
                // zamiast na 7/7). Taka przeprowadzka kupuje realną wartość i
                // nie może być blokowana regułą „większy nosiciel" (M100/E13).
                score += 4 + (payload.value - wornPayload.value);
              }
              else if (delta >= 2 && payload.value >= wornPayload.value) score += 4 + delta;
              else score -= 6;
            } else {
              // M221/E (zgłoszenie właściciela): equipment zwiększający siłę
              // ofensywną stwora, który jest NEUTRALIZOWANY przez blokera
              // z ochroną od jego koloru, to marnotrawstwo — obrażenia i tak
              // nie przejdą (bot nakładał equipment na 7/7 blokowanego przez
              // token 1/1 z protection). Chyba że equipment daje EWAZJĘ, która
              // omija tego blokera (flying, gdy blokery nie latają). Reguła po
              // deskryptorach (ADR 0002): kolory celu vs protekcja blokera.
              const blockersNow = untappedEnemyBlockers(view);
              // M243/D-G (Batch zgłoszeń właściciela 2026-08-27): wartość
              // Equip = WARTOŚĆ REALNIE DODANA nosicielowi, a nie „działa
              // dokładnie". Trzy zgłoszenia = jedna zasada (L28):
              //   D (Cloak of the Bat na latającym): keyword, który cel JUŻ
              //     ma, niczego nie dodaje — grant skopiowany jest no-opem;
              //   G (Thieves' Tools na power 4): ewazja warunkowa
              //     „cantBeBlockedMaxPower: 3" na stworze powyżej progu jest
              //     martwa (kryterium ze stanu, nie nazwy karty);
              //   F (Lurking Green Dragon bez latania u obrońcy): stwór,
              //     który legalnie NIE MOŻE atakować (cantAttackStatic z
              //     PlayerView), nie wyciąga niczego z grantu ofensywnego.
              const equipmentDef = source.equipment ?? {};
              const targetKeywords = new Set([...(target.keywords ?? []), ...(target.grantedKeywords ?? [])]);
              const freshGrants = grants.filter((kw) => !targetKeywords.has(kw));
              const hasteAdds = freshGrants.includes('haste') && target.summoningSickness === true;
              const pumpPower = equipmentDef.pump?.power ?? 0;
              const pumpToughness = equipmentDef.pump?.toughness ?? 0;
              const effectiveTargetPower = (target.power ?? 0) + (target.grantedPower ?? 0);
              const conditionalEvasion = equipmentDef.cantBeBlockedMaxPower != null
                && effectiveTargetPower <= equipmentDef.cantBeBlockedMaxPower;
              const grantsEvasion = (freshGrants.includes('flying')
                && blockersNow.every((o) => !hasKeyword(o, 'flying') && !hasKeyword(o, 'reach')))
                || conditionalEvasion;
              const neutralized = attackerNeutralizedByProtection(target, blockersNow);
              // „Nic nie dodaje" (D/G): bez pompy, bez nowych użytecznych
              // keywordów (haste liczymy tylko przy chorobie), bez ewazji.
              // M288/C: definicja „nic nie dodaje" mieszka w `equipValuation`
              // (ta sama, którą bada gałąź przeniesienia) — inaczej dwie gałęzie
              // equipu miałyby dwa modele świata (L28).
              const nothingAdded = equipValuation(view, source, target).nothingAdded;
              if (target.cantAttackStatic === true) {
                // F: sprzęt na stworze, który NIE MOŻE atakować (obrońca bez
                // latającego / defender / detain / aura Hobble) — premia
                // ofensywna (siła nosiciela, ewazja, haste) niczego nie kupuje;
                // zostałaby tylko wartość z P/T pompy do obrony.
                score += 2 + 2 * pumpPower + pumpToughness;
                if (nothingAdded) score -= 14;
              } else if (nothingAdded) {
                // D/G: Equipment niczego nie dodaje nosicielowi — czysta
                // strata many i tempa (bot wyposażał i wyrzucał 2 many co
                // turę). Kara przebija dotychczasową premię 10+2·power (L3).
                score -= 12;
              } else if (neutralized && !grantsEvasion) {
                score -= 8; // pompowanie bezradnego atakującego — nic nie zmienia
              } else {
                score += 10 + 2 * (target.power ?? 0);
                if (grantsEvasion) score += 8;
                if (grants.includes('haste') && target.summoningSickness) score += 6;
              }
            }
          }
        }
        // Cycling: rotacja ma sens tylko dla kart, których nie da się
        // wkrótce wyrzucić (koszt > landy+1). Tanie cyklowanie karty, którą
        // za turę-dwie można rzucić, dewastuje grę — z taką wolimy poczekać.
        const cycled = handCard(view, cmd.objectId);
        if (cycled) {
          // Zwykły cycling landa (np. Secluded Steppe) jest generyczną
          // zamianą niepotrzebnego land dropu na kartę — nie stosujemy do niego
          // kary „tanią kartę da się rzucić", bo land nie jest czarem.
          if (ability?.cycling?.drawCards != null) {
            score += cycled.kind === 'land' ? 8 : 2;
          } else {
            if ((cycled.manaCost ?? 0) <= myLandCount(view) + 1) return finish(-5);
            score += 2;
          }
        }
        return finish(score);
      }
      case 'declare_attackers': {
        const attackers = cmd.attackerIds;
        const blockers = untappedEnemyBlockers(view);
        // Trigger „attacks" z drenażem (Delta Bloodflies): bezwarunkowe
        // obrażenia poza walką, o ile spełniony jest warunek deskryptora.
        const drainOnAttack = (id) => {
          const object = objectOnBoard(view, id);
          const def = cardDef(object?.cardId);
          let drain = 0;
          for (const ability of def?.abilities ?? []) {
            if (ability?.trigger?.event !== 'attacks') continue;
            const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
            const lose = effects.find((e) => e?.type === 'lose_life');
            if (!lose) continue;
            if (ability.trigger.condition?.controlsCreatureWithCounter) {
              const hasCounter = myCreatures(view).some((o) => Object.values(o.counters ?? {}).some((c) => c > 0));
              if (!hasCounter) continue;
            }
            drain += lose.amount ?? 0;
          }
          return drain;
        };
        // M91 (uwaga A1): przy aktywnej prewencji obrażeń bojowych (Inspire
        // Awe) atakujący, który NIE jest zaczarowany ani nie jest
        // enchantment-creature, zada 0 obrażeń — a i tak zostanie tapnięty
        // i wystawiony na bloki. Taki atak nie ma wartości NIGDY (także
        // w wyścigu), więc zerujemy jego ocenę do wartości gorszej niż pass.
        // Reguła generyczna: warunek identyczny jak w engine (combat.js),
        // czytany z PlayerView — bez nazw kart (ADR 0002).
        if (view.preventCombatExceptEnchanted && attackers.length > 0) {
          const damageGetsThrough = attackers.some((id) => {
            const object = objectOnBoard(view, id);
            if (!object) return false;
            const isEnchantmentCreature = (object.types ?? []).includes('Enchantment');
            const isEnchanted = (view.zones.battlefield ?? []).some((other) => other?.attachedTo === id && other?.kind === 'aura');
            return isEnchantmentCreature || isEnchanted;
          });
          if (!damageGetsThrough) return finish(-100);
        }
        const strongestBlockerPower = blockers.reduce((max, o) => Math.max(max, o.power ?? 0), 0);
        const strongestBlockerToughness = blockers.reduce((max, o) => Math.max(max, o.toughness ?? 0), 0);
        // M167/I (uwaga właściciela): GANG dwóch blokerów — atakujący 2/4
        // „przeżywa" najsilniejszego pojedynczego blokera (3/4? nie: 3 < 4),
        // ale para 1/3 + 3/3 zabija go łącznymi obrażeniami. Suma top-2 mocy
        // blokerów + najniższa wytrzymałość (czy atakujący COKOLWIEK zabije).
        const blockerPowersDesc = blockers.map((o) => o.power ?? 0).sort((a, b) => b - a);
        const gangPower = (blockerPowersDesc[0] ?? 0) + (blockerPowersDesc[1] ?? 0);
        const weakestBlockerToughness = blockers.reduce((min, o) => Math.min(min, o.toughness ?? 0), Number.POSITIVE_INFINITY);
        const enemyLife = enemy(view)?.life ?? 0;
        let score = 0;
        // M188/C (uwaga właściciela): ilu atakujących nie osiąga NICZEGO —
        // nie zada obrażeń (obrońca ma czym zablokować bez straty) i nie
        // zabije blokera. Taki atak tylko tapuje własnego stwora.
        let futileAttackers = 0;
        for (const id of attackers) {
          const object = objectOnBoard(view, id);
          if (!object) continue;
          const power = object.power ?? 0;
          const toughness = object.toughness ?? 0;
          // Wartość ataku jednym stworem: obrażenia, które przejdą, minus
          // strata stwora. Wymiana (power ≥ wytrzymałość blockerów) to
          // realny zysk — bez tego bot nigdy nie atakuje w równą planszę
          // i przegrywa długie gry deck-outem.
          let perAttacker;
          // M92 (audyt PlayerView): atakujący objęty pełną prewencją obrażeń
          // (np. Ethersworn Shieldmage chroni artefaktowe stwory) NIE MOŻE
          // zginąć w bloku w tej turze — atak jest darmowy niezależnie od
          // wielkości blockerów. Bez tej informacji bot chował 2/2 przed 5/5
          // i tracił pewne obrażenia.
          const attackerImmuneThisTurn = damageFullyPrevented(view, object);
          // M155 (audyt żywym testerem): stwór o MOCY 0 (np. token Wizard 0/1
          // z Mysidian Elder) zadaje 0 obrażeń, a mimo to dostawał +3 za
          // „otwartą presję" — bot atakował bezsensownym 0/1. Wyjątek: atak
          // ma sens, gdy stwór ma drenaż z triggera ataku (Delta Bloodflies)
          // albo ewazję, która realnie coś zmienia. Reguła generyczna (ADR
          // 0002): 0 mocy = 0 obrażeń bojowych.
          const dealsNoCombatDamage = (power ?? 0) <= 0 && drainOnAttack(id) === 0;
          const canBeBlocked = attackerCanBeBlocked(object, blockers);
          // C-R4: staty EFEKTYWNE w bloku — pump „becomes blocked" jest aktywny
          // tylko, gdy atakujący realnie zostanie zablokowany (są blokerzy i
          // da się zablokować); w otwartym ataku liczy się druk.
          const bbPump = becomesBlockedPump(object);
          const blockedStats = blockers.length > 0 && canBeBlocked
            ? { power: power + bbPump.power, toughness: toughness + bbPump.toughness }
            : { power, toughness };
          const combatObject = blockedStats.power === power && blockedStats.toughness === toughness
            ? object : { ...object, power: blockedStats.power, toughness: blockedStats.toughness };
          // M221/E (zgłoszenie właściciela): przeciwnik ma nietapniętego blokera
          // z ochroną od koloru atakującego (np. token 1/1 z protection from
          // black blokujący 7/7 czarnego). Taki bloker zablokuje bez strat —
          // atakujący zada 0 obrażeń (CR 702.16c), nie zginie, tylko tapnie się.
          // Atak co turę w tego blokera to marnotrawstwo (dokładnie objaw E).
          // Jałowy niezależnie od wyścigu (jak M188/C), więc premia go nie ratuje.
          const neutralizedByProtection = attackerNeutralizedByProtection(object, blockers);
          if (neutralizedByProtection) {
            perAttacker = -2;
            futileAttackers += 1;
          } else if (!canBeBlocked && blockers.length > 0) {
            // M202/H: nie może zostać zablokowany (flying bez odpowiedzi,
            // menace przy jednym blokerze, cantBeBlocked) — atak jest warty
            // tyle co atak w otwartego, a nie „chump”.
            perAttacker = power + P.attackThroughBonus;
          } else if (attackerImmuneThisTurn) {
            perAttacker = power + P.attackThroughBonus;
          } else if (dealsNoCombatDamage) {
            // 0/1 w otwartego: 0 obrażeń bojowych, a stwór tapnięty i wystawiony
            // na bloki — wartość NIE może zostać podratowana premią „otwartej
            // presji" (+8), dlatego tak nisko (poniżej passu).
            perAttacker = -12;
          } else if (object.tempControlUntilEOT) {
            // M257-r5b/C (zgłoszenie właściciela, Awaken the Sleeper):
            // stwór POŻYCZONY — czasowa kontrola (generyczna flaga widoku z
            // efektu gain_control_until_end_of_turn; po rozstrzygnięciu cel
            // jest odtapnięty i ma haste). JEGO śmierć to NIE jest koszt
            // bota: przeżyje → wraca do właściciela, zginie → WŁAŚCICIEL
            // traci permanent. Właściciel: „jak już przejął to powinien
            // zaatakować właściciela” — gałęzie downside'u go nie dotyczą.
            if (canBeBlocked && blockers.length > 0) {
              if (power >= strongestBlockerToughness) {
                // Zabija najsilniejszego blokera — właściciel traci ten
                // permanent; atakujący wraca do właściciela (przeżyje) albo
                // ginie (strata właściciela) — w żadnym razie nie bota.
                perAttacker = P.attackThroughBonus + strongestBlockerPower + strongestBlockerToughness;
              } else {
                // Chump: atakujący ginie (strata WŁAŚCICIELA), 0 obrażeń —
                // neutralna wartość + bonus presji (atak to co najmniej
                // groźba wymuszenia bloku), nigdy kara jak dla własnego.
                perAttacker = P.attackThroughBonus;
              }
            } else {
              perAttacker = power + P.attackThroughBonus; // otwarty / nie do zablokowania
            }
          } else if (blockers.length === 0) {
            perAttacker = power + P.attackThroughBonus; // otwarty — czysta presja
          } else if (object.cantBlock && attackers.length > blockers.length) {
            // M221/G (zgłoszenie właściciela, token Phyrexian Mite „can't
            // block"): stwór, który NIE MOŻE blokować, nie ma wartości
            // obronnej — trzymanie go w tyle to zmarnowany potencjał. W ataku
            // liczniejszym niż blokerzy przeciwnika obrońca blokuje większe
            // zagrożenia, więc mały cantBlock (zwykle token 1/1) przechodzi
            // i dokłada obrażenia (tu jeszcze toxic). Brak kosztu alternatywy:
            // i tak nigdy nie zablokuje. Reguła po deskryptorze cantBlock
            // z PlayerView (ADR 0002/0017), nie po nazwie karty.
            perAttacker = power + P.attackThroughBonus;
          } else if (diesBeforeDealingDamage(combatObject, blockers)) {
            // M202/N: bloker z first strike zabija atakującego, zanim ten zada
            // cokolwiek (CR 510.4) — atak ma 0% szans: 0 obrażeń i strata
            // stwora. Jałowy, więc premia wyścigu go nie uratuje.
            perAttacker = -(toughness + 8);
            futileAttackers += 1;
          } else if (attackerStrikesFirst(combatObject, blockers) && blockedStats.power >= strongestBlockerToughness) {
            // M202/N (symetrycznie): first strike atakującego zabija blokera,
            // zanim ten odpowie — atakujący PRZEŻYWA, więc to nie wymiana
            // (power - 1), a czysty zysk jak przy ataku w otwartego.
            perAttacker = power + P.attackThroughBonus;
          } else if (blockedStats.toughness > strongestBlockerPower && blockedStats.power >= strongestBlockerToughness) {
            perAttacker = blockedStats.power + P.attackThroughBonus; // przeżyje I zabija blokera — realny zysk
          } else if (blockers.length >= 2 && blockedStats.toughness <= gangPower && blockedStats.power < weakestBlockerToughness) {
            // M167/I: ginie od GANGU blokerów i nie zabija ŻADNEGO — czysta
            // strata stwora (2/4 w 1/3 + 3/3). Kara ponad wagę wyścigu.
            perAttacker = -(toughness + 8);
          } else if (blockedStats.toughness > strongestBlockerPower) {
            // Przeżyje, ale NIE zabije blokera (2/3 vs 2/3): nic nie zyskuje,
            // a tapnięty atakujący nie zablokuje w następnej turze — netto
            // strata, poniżej passu (uwaga właściciela z testów).
            perAttacker = -2;
            // M188/C: ten atak jest JAŁOWY — obrońca zablokuje bez straty,
            // więc nie przejdą obrażenia ani nie zginie żaden bloker.
            futileAttackers += 1;
          } else if (blockedStats.power >= strongestBlockerToughness) {
            perAttacker = power - 1; // wymiana: obrażenia + usunięcie blockerów
          } else {
            // Chump do większego blokera: atakujący ginie, 0 obrażeń. Nawet
            // w wyścigu (racing) to strata — atak nie zada obrażeń i nie
            // zabija blokera, więc waga +8 z wyścigu nie wyrównuje wagi
            // -10. Bez tego bot atakował ⅔ w ⅚ w wyścigu (zgłoszenie
            // właściciela, 2026-08-14).
            perAttacker = -10;
            // M202/H (zgłoszenie właściciela: „4/4 w moją nietapniętą 5/5,
            // 0% szans — PO CO?”): kara -10 istniała, ale przy wrogim życiu
            // <= 5 premia wyścigu wynosiła +20 i PRZEBIJAŁA karę (klasa L3:
            // kara musi być liczona względem premii, inaczej jest martwa).
            // Zgodnie z L3 POMIJAMY premię dla ataku jałowego — tak jak
            // M188/C dla gałęzi „przeżyje, ale nic nie zabije”.
            futileAttackers += 1;
          }
          score += perAttacker;
          // Evasion: latający atakujący omija blockerów bez flying/reach.
          if (hasKeyword(object, 'flying') && blockers.every((o) => !hasKeyword(o, 'flying') && !hasKeyword(o, 'reach'))) score += P.attackEvasionBonus;
          // Drenaż z triggera ataku przechodzi niezależnie od bloków.
          score += 3 * drainOnAttack(id);
        }
        // Presja: atak w otwartego, lethal i przewaga liczebna premiowane.
        if (blockers.length === 0 && attackers.length > 0) score += P.attackOpenBoardBonus;
        const totalPower = attackers.reduce((sum, id) => sum + (objectOnBoard(view, id)?.power ?? 0), 0);
        // M169/J+L (uwaga właściciela): lethal musi przejść PRZEZ blokerów.
        // Surowy totalPower premiował atak 6/7 w samotnego 7/10 (+100 za
        // „lethal") i odwrotnie — karzełki chowane za blokery nie dopinały
        // all-in. Blokerzy wchłaniają co najwyżej tyle obrażeń, ile wynosi
        // suma ich wytrzymałości (każdy blokuje jednego atakującego);
        // jeśli PO absorpcji zostaje >= życia wroga — atak wygrywa grę.
        const blockerAbsorb = blockers.reduce((sum, o) => sum + (o.toughness ?? 0), 0);
        const penetratingPower = Math.max(0, totalPower - blockerAbsorb);
        if (attackers.length > 0 && penetratingPower >= enemyLife) score += 1000;
        else if (totalPower >= enemyLife && blockers.length === 0) score += 100;
        // C-R5 (audyt Batch53): wygrana TRUCIZNĄ to drugi zegar — liczniki
        // przeciwnika są w widoku (players.poison), a infect w twarz liczy
        // się do 10 − poison, nie do życia. Przenikająca moc infect ≥ brakują
        // liczników = lethal jak życiowy (+1000), nawet przy pełnym życiu.
        const enemyPoison = enemy(view)?.poison ?? 0;
        const infectTotalPower = attackers.reduce((sum, id) => {
          const o = objectOnBoard(view, id);
          return sum + (hasKeyword(o, 'infect') ? (o.power ?? 0) : 0);
        }, 0);
        const penetratingInfect = Math.max(0, infectTotalPower - blockerAbsorb);
        if (attackers.length > 0 && enemyPoison < 10 && penetratingInfect >= 10 - enemyPoison) score += 1000;
        // Zegar (B1): gramy o czas, gdy wróg jest blisko śmierci, może nas
        // zabić w następnej turze albo nasza biblioteka się kończy — wtedy
        // atakujemy nawet kosztem wymiany. (strażnik „> 0" odróżnia realną
        // partię od stanów testowych bez biblioteki)
        const libraryExists = view.zones.library.length > 0;
        const racing = enemyLife <= 10
          // C-R5: zegar trucizny — przy 6+ licznikach wróg jest dwa ataki
          // infect od przegranej; wyścig ma się odpalić także przy pełnym
          // życiu (wycisza kary ryzyka B3/M297 i dokłada dopłatę).
          || enemyPoison >= 6
          || enemyBoardPower(view) >= myLife(view)
          || (libraryExists && myLibraryCount(view) <= 4);
        // M188/C (uwaga właściciela: „bot atakuje 2/2 mimo mojej 1/5 —
        // jedynym efektem jest tapnięcie jego stwora"): atak, w którym ŻADEN
        // atakujący nic nie osiąga, nie może być ratowany premią wyścigu.
        // Klasa L3: kara −2 istniała, ale premia (+8/+20) ją przebijała, więc
        // była martwa. Zgodnie z L3 POMIJAMY premię zamiast dokładać karę —
        // presja bez obrażeń nie jest presją. Lethal (penetratingPower) jest
        // wyżej i nie przechodzi przez tę gałąź, bo wtedy atak nie jest jałowy.
        const wholeAttackFutile = attackers.length > 0 && futileAttackers === attackers.length;
        if (racing && attackers.length > 0 && !wholeAttackFutile) {
          score += (totalPower >= enemyLife - 5 || enemyPoison + infectTotalPower >= 6) ? 20 : 8;
          if (libraryExists && myLibraryCount(view) <= 2) score += 15;
        }
        // B3 — EV ataku: gdy przeciwnik może mieć removal (instant z damage)
        // i ma otwartą manę, atak wartościowym stworem traci na wartości —
        // kara proporcjonalna do prawdopodobieństwa i wartości stwora.
        // W wyścigu presja jest ważniejsza od ryzyka (lekcja B2: zbyt
        // ostrożny bot przegrywa deck-outem).
        if (!racing && removalSpells.size && opponentOpenMana(view) >= minRemovalCost) {
          const removalProb = probOpponentHolds(view, removalSpells);
          // Selektywność: kara tylko przy realnym zagrożeniu (>45%) — drobne
          // prawdopodobieństwo nie powinno gasić presji (lekcja B2).
          if (removalProb > 0.45) {
            for (const id of attackers) {
              const object = objectOnBoard(view, id);
              if (!object) continue;
              // M257-r5b/C: stwór pożyczony (tempControlUntilEOT) — jego
              // zniszczenie to strata WŁAŚCICIELA, nie koszt bota.
              if (object.tempControlUntilEOT) continue;
              const killable = [...removalSpells.values()].some((r) => r.amount >= (object.toughness ?? 0) - (object.damage ?? 0));
              // Kara ~ wartość stwora × prawdopodobieństwo: atak 2/2 przy 70%
              // ryzyka removalu to strata (0 obrażeń i stwór w grobie).
              if (killable) score -= removalProb * (14 + 2 * (object.power ?? 0) + (object.toughness ?? 0));
            }
          }
        }
        // M297/B (uwaga właściciela 2026-09-03): „kupowany deathtouch".
        // Obrońca z nietapniętym blokerem, maną i trikiem (instant w ręce
        // ALBO aktywowana zdolność widocznego stwora) daje blokerowi
        // deathtouch w oknie walki — wtedy KAŻDY bloker zabija naszego
        // atakującego (CR 702.4). Bot ma nie atakować wartościowych stworów
        // w takim oknie — dokładnie scenariusz właściciela (4/4 vs mały
        // stwór + Coat with Venom/Death-Hood Cobra + mana). Model ryzyka jak
        // B3 (hipergeometria dla ukrytego triku; pewność dla widocznej
        // aktywacji), próg obniżony względem removalu: trick deathtouch jest
        // tani i rozstrzyga wymianę na korzyść obrońcy nawet przy niskiej
        // szansie trzymania.
        if (!racing && blockers.length > 0) {
          const trickProb = deathtouchTricks.size && opponentOpenMana(view) >= minDeathtouchTrickCost
            ? probOpponentHolds(view, deathtouchTricks) : 0;
          const activatorCost = visibleDeathtouchActivatorCost(view);
          const activatorReady = activatorCost !== null && opponentOpenMana(view) >= activatorCost;
          const dtProb = Math.max(trickProb > 0.15 ? trickProb : 0, activatorReady ? 1 : 0);
          if (dtProb > 0) {
            for (const id of attackers) {
              const object = objectOnBoard(view, id);
              if (!object || object.tempControlUntilEOT) continue;
              if (!attackerCanBeBlocked(object, blockers)) continue;
              if (damageFullyPrevented(view, object)) continue;
              if ((object.keywords ?? []).includes('indestructible')) continue;
              // Bloker już MA deathtouch — dokupienie triku nic by nie zmieniło,
              // więc kara za „kupowany" deathtouch byłaby podwójnym liczeniem.
              if (diesToDeathtouchBlocker(object, blockers)) continue;
              // First strike zabija blokera, zanim ten zada obrażenia.
              if (attackerStrikesFirst(object, blockers)
                && (object.power ?? 0) >= strongestBlockerToughness) continue;
              score -= dtProb * (10 + 2 * (object.power ?? 0) + (object.toughness ?? 0));
            }
          }
        }
        return finish(score);
      }
      case 'declare_blockers': {
        const assignments = cmd.assignments ?? {};
        const blockingSomething = Object.keys(assignments).length > 0;
        // Zagrożenie (suma siły wrogich stworów) — kara za NIEblokowanie pod
        // presją śmiertelną dotyczy wyłącznie wariantu pustego; warianty
        // blokujące oceniamy bez tej kary.
        const threat = enemyAttackPower(view);
        const lethalThreat = threat >= myLife(view);
        // M146 (znalezisko właściciela): atakujący z combat.attackers to realne
        // zagrożenie tej walki (enemyAttackPower liczy wszystkie wrogie stwory);
        // blok, który POZOSTAWIA nas przy życiu po śmiertelnym ataku, jest
        // wart partii — premia, inaczej pass (0) wygrywał z blokiem (-1).
        const attackThreat = (view.combat?.attackers ?? [])
          .reduce((sum, id) => sum + (objectOnBoard(view, id)?.power ?? 0), 0);
        let score = 0;
        let stoppedDamage = 0;
        for (const [attackerId, blockerIds] of Object.entries(assignments)) {
          const attackerObj = objectOnBoard(view, attackerId);
          if (!attackerObj) continue;
          // M153/B (uwaga właściciela): bot nie blokował, bo per-bloker
          // `killsAttacker` nie widział, że DWĄ blokerami można ZABIĆ atakującego,
          // a utrata blokera była karana mocniej niż przepuszczone obrażenia.
          // Teraz sumujemy moc blokerów vs wytrzymałość atakującego (multi-block
          // kill, CR 510.1), nagradzamy zablokowane obrażenia i usunięte
          // zagrożenie, a karzemy tylko realną stratę blokerów.
          const attackerPower = attackerObj.power ?? 0;
          const attackerToughness = (attackerObj.toughness ?? 0) - (attackerObj.damage ?? 0);
          let totalBlockerPower = 0;
          let blockerValueLost = 0;
          let blockersUsed = 0;
          for (const blockerId of blockerIds) {
            const blocker = objectOnBoard(view, blockerId);
            if (!blocker) continue;
            blockersUsed += 1;
            totalBlockerPower += (blocker.power ?? 0);
            const blockerDies = attackerPower >= (blocker.toughness ?? 0) - (blocker.damage ?? 0);
            if (blockerDies) blockerValueLost += (blocker.power ?? 0) + (blocker.toughness ?? 0);
          }
          // Zablokowane obrażenia = uratowane życie.
          score += attackerPower;
          stoppedDamage += attackerPower;
          // Multi-block: atakujący ginie, gdy łączna moc blokerów >= jego
          // wytrzymałość — to wartość usuniętego zagrożenia.
          const attackerDies = totalBlockerPower >= attackerToughness;
          if (attackerDies) score += attackerPower * 2 + attackerToughness;
          // Koszt: utracone blokery.
          score -= blockerValueLost;
          // Koszt zaangażowania blokera (zatapiany; nie pomoże innemu atakowi).
          score -= blockersUsed;
          // B3 — combat trick: gdy nasz blok ZABIJA atakującego, a przeciwnik
          // może mieć pump-instant i otwartą manę, blok jest ryzykowny (pump
          // ratuje atakującego i zabija nasz bloker). Pod presją śmiertelną
          // blokujemy mimo ryzyka.
          if (attackerDies && !lethalThreat && pumpSpells.size && opponentOpenMana(view) >= minPumpCost) {
            const pumpProb = probOpponentHolds(view, pumpSpells);
            if (pumpProb > 0) score -= pumpProb * 12;
          }
          // Blokery z flying/reach łapią latającego atakującego.
          if (hasKeyword(attackerObj, 'flying')) {
            for (const blockerId of blockerIds) {
              const blocker = objectOnBoard(view, blockerId);
              if (blocker && (hasKeyword(blocker, 'flying') || hasKeyword(blocker, 'reach'))) score += 4;
            }
          }
        }
        // Pod presją śmiertelną warto blokować nawet kosztem stwora.
        if (!blockingSomething && lethalThreat) score -= 40;
        // M146: blok ratujący życie (po zablokowaniu obrażenia < nasze życie)
        // przebija pass — bot wcześniej passował z blokerem na stole i ginął.
        if (blockingSomething && lethalThreat && (attackThreat - stoppedDamage) < myLife(view)) {
          score += 30;
        }
        // M257-r5 (uwaga z testów): wycena nie znała PRESJI ŻYCIA — przy 5
        // życiach przepuszczenie ataku 3/3 zostawiało 2 życia, a wymiana 2/2
        // za 3 obrażenia wyceniana była na -2, czyli gorzej niż pass (0).
        // Ratunek życia pod presją jest warty więcej niż koszt bloku — płaska
        // premia zależna od życia PO zablokowaniu REALNIE PRZEŻYTEGO wariantu.
        // Warunek lifeAfter >= 1: premii nie daje blok, po którym i tak
        // giniemy (3× 3/3 przy 5 życiu — M146 „nie marnuj blokera”).
        if (blockingSomething) {
          const lifeAfter = myLife(view) - (attackThreat - stoppedDamage);
          if (lifeAfter >= 1 && lifeAfter <= 2) score += 6;
          else if (lifeAfter >= 1 && lifeAfter <= 5) score += 4;
          else if (lifeAfter >= 1 && lifeAfter <= 8) score += 2;
        }
        return finish(score);
      }
      case 'resolve_combat': return finish(50);
      case 'resolve_backup': {
        // Backup: liczniki + grant keywordów idą na najsilniejszego WŁASnego
        // stwora (wzmocnienie przeciwnika tylko, gdy brak własnych — wybór
        // wymuszony, bierzemy najsłabszy cel obcy). Samo źródło też jest
        // legalne (wtedy bez grantu) — traktowane jak każdy własny stwór.
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        if (target.controllerId === view.playerId) return finish(40 + 2 * (target.power ?? 0) + (target.toughness ?? 0));
        return finish(5 - (target.power ?? 0));
      }
      case 'resolve_scry': {
        // Scry: na spód kładziemy wyłącznie to, co raczej zbędne — land przy
        // przesycie landów (≥3 w ręce albo ≥6 na stole). W przeciwnym razie
        // zostawiamy na wierzchu. Generyczne deskryptory (kind), zero nazw kart.
        // M135 (backlog „wycena decyzji bota"): każdy wariant wyceniamy przez
        // SUMĘ wartości kart, których się pozbywamy. Dotąd wszystko poza
        // „zbędnym landem" dostawało równe 20, więc warianty remisowały i bot
        // brał pierwszą ofertę — potrafił odłożyć na spód dobrego stwora.
        const bottoms = cmd.bottomIds ?? [];
        const cards = view.pendingScry?.cards ?? [];
        // Wariant „zostaw wszystko na wierzchu" to punkt odniesienia (0);
        // odkładanie karty opłaca się dokładnie wtedy, gdy jej wartość jest
        // ujemna (nie chcemy jej dobrać).
        const delta = cards
          .filter((card) => bottoms.includes(card.id))
          .reduce((sum, card) => sum - cardKeepValue(view, card), 0);
        return finish(20 + delta);
      }
      case 'resolve_surveil': {
        // Surveil (Curate): jak scry — mielimy tylko zbędne lądy przy
        // przesycie, resztę zostawiamy na wierzchu do dobrania. Kolejność
        // reszty („in any order") bot trzyma pierwotną — zero powodów do
        // przetasowania, więc wariant z topOrder != oryginał punktujemy niżej.
        // M135: ta sama wycena co przy scry, ale z WAŻNĄ różnicą semantyczną —
        // przy surveil karta nie idzie na spód biblioteki, tylko do GROBU
        // (CR 701.44). To decyzja nieodwracalna: kartę stracimy z talii
        // zamiast odsunąć ją w czasie. Dlatego mielimy ostrożniej — próg
        // opłacalności jest wyższy niż przy scry (bufor `MILL_CAUTION`).
        const milled = cmd.millIds ?? [];
        const surveilCards = view.pendingSurveil?.cards ?? [];
        const MILL_CAUTION = 2;
        const millDelta = surveilCards
          .filter((card) => milled.includes(card.id))
          .reduce((sum, card) => sum - cardKeepValue(view, card) - MILL_CAUTION, 0);
        const originalOrder = (view.pendingSurveil?.cards ?? [])
          .filter((card) => !milled.includes(card.id))
          .map((card) => card.id);
        const keepsOrder = JSON.stringify(cmd.topOrder ?? originalOrder) === JSON.stringify(originalOrder);
        return finish(20 + millDelta + (keepsOrder ? 1 : 0));
      }
      case 'resolve_clash_choice': {
        // Clash (CR 701.40): „na spód albo zostaw" — ta sama decyzja co scry,
        // więc ta sama wycena (M135, L28: jedna reguła zamiast trzech kopii
        // warunku „land przy przesycie"). Widok clash niesie cardId (karta
        // odsłonięta = informacja publiczna), więc deskryptory bierzemy
        // z rejestru i składamy kartę w kształcie, jakiego oczekuje wycena.
        const cardId = view.pendingClash?.cards?.[view.playerId] ?? null;
        const def = cardId ? cardDef(cardId) : undefined;
        const card = def ? {
          kind: (def.types ?? []).includes('Land') ? 'land' : 'spell',
          types: def.types ?? [],
          manaCost: def.manaCost ?? 0,
          power: def.power ?? null,
          toughness: def.toughness ?? null,
        } : null;
        const keep = cardKeepValue(view, card);
        // Na spód odkładamy dokładnie wtedy, gdy karty nie chcemy dobrać.
        if (cmd.putOnBottom) return finish(20 - keep);
        return finish(20 + keep);
      }
      // M190/B: wybór ŚCIEŻKI w lochu (Oracle „Leads to: …"). Bez wyceny
      // wszystkie warianty remisują i bot bierze pierwszą ofertę (klasa L50).
      // Wartość pokoju = jego realny wpływ na partię; przy równych wartościach
      // preferujemy krótszą drogę do Throne (najsilniejszy pokój końcowy).
      case 'resolve_undercity_route': {
        const ROOM_VALUE = {
          'Trap!': 34,            // 5 życia w przeciwnika
          Catacombs: 30,          // 4/1 menace
          Forge: 22,              // 2× +1/+1
          Archives: 18,           // dobranie karty
          Arena: 14,              // goad (sytuacyjny)
          Stash: 12,              // Treasure
          'Lost Well': 8,         // scry 2
          'Throne of the Dead Three': 40,
        };
        const base = ROOM_VALUE[cmd.roomName] ?? 10;
        // Krótsza droga do końca lochu jest warta premii: Trap!/Archives
        // domykają trasę szybciej niż pętla przez Arenę i Catacombs.
        const room = (cmd.room ?? 0) - 1;
        const leadsTo = UNDERCITY_ROOM_LINKS[cmd.roomName] ?? [];
        const closesFast = leadsTo.includes('Throne of the Dead Three') ? 6 : 0;
        return finish(base + closesFast + (room >= 0 ? 0 : 0));
      }
      case 'resolve_room_target': {
        // Wybór celu pokoju lochu (M24): Trap! → przeciwnik; Throne →
        // najsilniejszy odsłonięty stwór; Forge/Arena → własny najsilniejszy
        // (goad własnego = gwarantowany atak; goad wroga w 1v1 zmusza go do
        // ataku na nas — szkodliwy).
        const pending = view.pendingRoomTarget;
        if (!pending) return finish(20);
        if (pending.kind === 'player') {
          return finish(cmd.targetId === view.playerId ? -40 : 30);
        }
        if (pending.kind === 'revealed_creature') {
          const card = (pending.cards ?? []).find((c) => c.id === cmd.targetId);
          if (!card) return finish(0);
          return finish(10 + (card.power ?? 0) * 2 + (card.toughness ?? 0));
        }
        const target = objectOnBoard(view, cmd.targetId);
        if (!target) return finish(0);
        const isOwn = target.controllerId === view.playerId;
        const value = (target.power ?? 0) * 2 + (target.toughness ?? 0);
        return finish(isOwn ? 30 + value : 0);
      }
      case 'resolve_sacrifice_choice': {
        // Grave Exchange: cel poświęca stwora WŁASNEGO wyboru. Minimalizujemy
        // stratę — najsłabszy własny stwór (najniższa wartość) punktujemy
        // najwyżej; gwarantowana odpowiedź, by partia nie stanęła.
        // C-R3a (audyt Batch53): refleks jałowy (reflexReady=false — brak
        // kandydata dla „When you do") → poświęcenie kupuje NIC, rezygnacja
        // wygrywa. Flaga tylko przy decyzjach refleksowych (Grave Exchange
        // bez flagi = stara polityka).
        if (cmd.skip === true) return finish(cmd.reflexReady === false ? 40 : 0);
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        // C-R3b: artefakty/nie-stwory wyceniane po KOSZCIE (wzorzec
        // craft_exile), nie jako 0 — cenny artefakt przestaje być „darmową
        // ofiarą" przed tokenem 1/1.
        const value = target.kind === 'creature' || (target.types ?? []).includes('Creature')
          ? (target.power ?? 0) * 2 + (target.toughness ?? 0)
          : (target.manaCost ?? 0) * 2;
        return finish(cmd.reflexReady === false ? 5 - value : 40 - value);
      }
      case 'resolve_food_choice': {
        // Insatiable Appetite: poświęć Food (+5/+5) albo nie (+3/+3).
        // Bot poświęca Food, jeśli ma (większy buff).
        return finish(cmd.sacrifice ? 50 : 30);
      }
      // M258/B (uwaga właściciela, Rupture Spire): „sacrifice it unless you
      // pay {N}" (ETB) i ECHO. Silnik prezentuje decyzję TYLKO gdy jest
      // opłacalna (queuePayOrSacrifice: producibleMana >= amount), a w trakcie
      // decyzji blokuje WSZYSTKIE inne akcje (tylko ta komenda, produkcja
      // many i CONCEDE). Płacenie jest więc zawsze co najmniej tak dobre jak
      // poświęcenie: koszt idzie z puli albo auto-tapem (spendMana), a mana
      // i tak by wyparowała na końcu kroku (CR 106.4) — permanent zostaje.
      //
      // Root cause błędu: komenda nie miała case'u (domyślnie 0) → remis z
      // „poświęć" (również 0), a stabilny sort w greedyChoice bierze PIERWSZĄ
      // ofertę — w enumeracji (game-state.js) na czele stało pay:false. Bot
      // ZAWSZE poświęcał. L41: wybór z intencji, nie z pozycji w ofercie.
      case 'resolve_pay_or_sacrifice':
        return finish(cmd.pay ? 90 : 5);
      // Batch 44 (Frightful Delusion): zapłać {N} i czar zostaje, albo pozwól
      // skontrować. Silnik oferuje pay:true tylko gdy opłacalne; czar już na
      // stosie jest niemal zawsze warty więcej niż koszt.
      case 'resolve_counter_pay_choice':
        return finish(cmd.pay ? 85 : 10);
      // M258/F3 — ward (CR 702.21): dopłata ratuje czar/zdolność, którą bot
      // właśnie wybrał jako wartą kosztu; rezygnacja to stracona mana.
      case 'resolve_ward_pay_choice':
        return finish(cmd.pay ? 80 : 20);
      // „You may pay ... When you do, ..." (Panic Spellbomb, Zoraline):
      // trigger jest kolejkowany tylko gdy opłacalny (canPayTrigger) — efekt
      // jest sensem karty, zapłata niemal zawsze na plusie.
      case 'resolve_optional_pay_choice':
        return finish(cmd.pay ? 75 : 15);
      case 'resolve_discover_choice': {
        // Geological Appraiser: rzuć bez kosztu albo weź do ręki.
        // Bot rzuca bez kosztu (darmowa karta na stole).
        return finish(cmd.castFree ? 60 : 20);
      }
      case 'resolve_explore_choice': {
        // Guidestone Compass: karta na wierzch albo do grobu.
        // Bot odkłada na wierzch (zachowuje kartę).
        return finish(cmd.putInGraveyard ? 10 : 40);
      }
      case 'resolve_craft_exile': {
        // Lodestone Needle: exile artifact do craft. Bot wybiera
        // najsłabszy artefakt (minimalizuje stratę).
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        const value = (target.power ?? 0) * 2 + (target.toughness ?? 0) + (target.manaCost ?? 0);
        return finish(40 - value);
      }
      case 'resolve_devour_choice': {
        // Devour (Gorger Wurm): poświęcenie własnego stwora kupuje trwały
        // bonus na źródle — bot jest konserwatywny i zachowuje planszę:
        // domyślnie kończy (you may), poświęca tylko pozbawionego wartości
        // słabeusza (wartość 0–1: np. goły token 1/1 bez keywordów).
        if (cmd.done === true) return finish(40);
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        const value = (target.power ?? 0) * 2 + (target.toughness ?? 0) + (target.keywords?.length ?? 0);
        return finish(value <= 3 ? 45 : 5 - value);
      }
      case 'resolve_endure_choice': {
        // Endure (Kin-Tree Nurturer): dwa ciała (token Spirit) są generycznie
        // nieco cenniejsze niż jeden licznik (drugi chump-blocker/atakujący).
        return finish(cmd.mode === 'token' ? 42 : 40);
      }
      case 'resolve_delirium_target': {
        // Delirium (Fear of Burning Alive): cel to stwór przeciwnika —
        // obieramy najsilniejszego kandydata (najwyższa wartość).
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        return finish(30 + (target.power ?? 0) * 2 + (target.toughness ?? 0));
      }
      case 'resolve_mentor_target': {
        // Mentor (CR 702.133): licznik +1/+1 na WŁASNYM atakującym o mniejszej
        // sile — najsilniejszy kandydat zyskuje najwięcej (twardszy napastnik).
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        return finish(30 + (target.power ?? 0) * 2 + (target.toughness ?? 0));
      }
      case 'resolve_trigger_target': {
        // Temat 2 — cel triggera. Domyślnie (Forge Devil, Jill, Reclusive
        // Artificer): obrażenia / usunięcie na własnym stworze to błąd, na
        // przeciwniku premiujemy siłę. „Brak celu" (allowNone) = 0.
        // M150/A (Battle-Rattle Shaman): trigger PRZYJAZNY (pump +2/+0,
        // licznik +1/+1) celuje WłASNY stwór — `cmd.friendly` niesie flagę
        // wyliczoną z deskryptora efektu (generycznie, ADR 0002).
        // M157/F4(a): wariant wielocelowy — suma wycen po celach (pusty = 0).
        if (Array.isArray(cmd.targetIds)) {
          let score = 0;
          for (const id of cmd.targetIds) {
            const t2 = objectOnBoard(view, id);
            if (!t2) {
              // C-R2: karta z grobu/wygnania — wartość po P/T albo koszcie
              // (ta sama polityka co w gałęzi jednocelowej, L41).
              const openCard2 = openZoneCard(view, id);
              if (openCard2) {
                score += offBoardTargetScore(view, openCard2, cmd.friendly);
                continue;
              }
              // M171/Z3 (audyt Żywym Testerem, klasa L50): cel-GRACZ w
              // wariancie wielocelowym był pomijany (0 pkt) — kombinacje
              // remisowały i bot dzielił obrażenia Tytana we WŁASNĄ twarz.
              // Ta sama polityka co w gałęzi jednocelowej (świadoma friendly).
              if (id === view.playerId) score += cmd.friendly ? 25 : -40;
              else if (id === enemy(view)?.id) score += cmd.friendly ? -40 : 25;
              continue;
            }
            const v2 = (t2.power ?? 0) * 2 + (t2.toughness ?? 0);
            // M167/A (Voice of the Vermin): przyjazny buff celuje
            // WSPÓŁATAKUJĄCEGO (atak trwa do końca tury — buff „on orbit").
            const attackingNow2 = (view.combat?.attackers ?? []).includes(t2.id);
            score += (cmd.friendly
              ? (t2.controllerId === view.playerId ? 30 + v2 + (attackingNow2 ? 25 : 0) : -20 - v2)
              : (t2.controllerId === view.playerId ? -20 - v2 : 30 + v2));
          }
          return finish(score);
        }
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) {
          // C-R2: karta z grobu/wygnania — wybieramy NAJLEPSZĄ, nie pierwszą.
          const openCard = openZoneCard(view, cmd.targetId);
          if (openCard) return finish(offBoardTargetScore(view, openCard, cmd.friendly));
          // M171/Z3: gałąź bliźniacza z wielocelową (L41) — friendly odwraca.
          const playerId = cmd.targetId;
          if (playerId === view.playerId) return finish(cmd.friendly ? 25 : -40);
          if (playerId && playerId === enemy(view)?.id) return finish(cmd.friendly ? -40 : 25);
          return finish(0);
        }
        const value = (target.power ?? 0) * 2 + (target.toughness ?? 0);
        // M167/A: buff idzie na współatakującego, nie na stojącego.
        const attackingNow = (view.combat?.attackers ?? []).includes(target.id);
        if (cmd.friendly) {
          if (target.controllerId === view.playerId) return finish(30 + value + (attackingNow ? 25 : 0));
          return finish(-20 - value);
        }
        if (target.controllerId === view.playerId) return finish(-20 - value);
        return finish(30 + value);
      }
      case 'resolve_optional_trigger_choice': {
        // M167/B (Circle of the Land Druid): opcjonalny SELF-MILL tylko przy
        // przewadze w wyścigu bibliotek (wzór Bella, M162/B) — przegrywając
        // liczebnie, mill oneself przybliża własny deck-out.
        if (cmd.fire && cmd.selfMill != null) {
          const myLib = view.zones.library.filter((o) => o.controllerId === view.playerId).length;
          const foeLib = view.zones.library.filter((o) => o.controllerId !== view.playerId).length;
          if (myLib - cmd.selfMill <= 0) return finish(-60); // ostatnie karty — nigdy
          return finish(myLib > foeLib ? 45 : -35);
        }
        // „You may" bez celu (Angel's Feather — +1 życie): „tak" jak dotąd.
        return finish(cmd.fire ? 50 : 0);
      }
      case 'resolve_mulligan_choice': {
        // Mulligan londyński (CR 103.4): bot zatrzymuje rękę (keep) —
        // pierwsza oferta; mulligan to decyzja strategiczna człowieka.
        return finish(cmd.keep ? 50 : 0);
      }
      case 'resolve_mulligan_bottom_choice': {
        // Odłożenie N kart na spód: pierwsza oferta (najtańsze karty).
        return finish(10);
      }
      case 'resolve_graveyard_top_choice': {
        // Forever Young: odkupienie stwora z grobu na wierzch biblioteki.
        // Bot bierze tylko naprawdę wartościowe stwory (i kończy, gdy reszta
        // nie jest warta zatykania dobrań). Widok grobu niesie statystyki
        // własnych kart — powerOf polega na polach widoku.
        if (cmd.done === true) return finish(15);
        const card = view.zones.graveyard.find((o) => o.id === cmd.targetId) ?? null;
        const def = card ? cardDef(card.cardId) : undefined;
        const value = (def?.power ?? 0) * 2 + (def?.toughness ?? 0);
        return finish(value >= 5 ? 10 + value : 5);
      }
      case 'resolve_legend_choice': {
        // Prawo legend (CR 704.5j): bot zostawia najsilniejszą kopię (ta
        // z licznikami może być mocniejsza niż sugeruje druk — wyceniamy
        // faktyczny obiekt widoku, nie definicję).
        const kept = cmd.keepId ? objectOnBoard(view, cmd.keepId) : null;
        if (!kept) return finish(0);
        return finish(30 + (kept.power ?? 0) * 2 + (kept.toughness ?? 0));
      }
      case 'resolve_fertile_thicket': {
        // Odkrycie basic landu na wierzch ≈ dojście do many; samo oglądanie
        // nic nie kosztuje, więc całkowity skip jest najsłabszą opcją.
        if (cmd.skip) return finish(2);
        return finish(cmd.chosenCardId != null ? 40 : 30);
      }
      case 'resolve_springbloom': {
        // Ramp: poświęcenie landa → 2 basic landy tapped (od M70 trigger żyje).
        return finish(cmd.sacrificeLandId != null ? 40 : 10);
      }
      case 'resolve_damage_division': {
        // M166/D (Inferno Titan): kwoty na wrogie cele/gracza = zysk
        // (twarza najcenniejsza), na własne = kara.
        const pending = view.pendingDamageDivision;
        const targetIds = pending?.targetIds ?? [];
        let score = 0;
        (cmd.amounts ?? []).forEach((amount, index) => {
          const targetId = targetIds[index];
          if (targetId == null) return;
          const creature = (view.zones.battlefield ?? []).find((o) => o.id === targetId);
          if (creature) {
            const mine = creature.controllerId === view.playerId;
            const lethal = amount >= (creature.toughness ?? 0) - (creature.damage ?? 0);
            score += mine ? -8 * amount : 6 * amount + (lethal ? 12 : 0);
          } else {
            // Gracz: twarz przeciwnika najcenniejsza, własna — kara.
            score += targetId === view.playerId ? -10 * amount : 10 * amount;
          }
        });
        return finish(score);
      }
      case 'resolve_library_placement': {
        // M177/D (Vanish from Sight): decyzja WŁAŚCICIELA odsyłanego
        // permanentu — wierzch = odzyskasz kartę najbliższym dobraniem
        // (zwykle lepsze), spód = świeża karta zamiast odzyskiwania.
        return finish(cmd.placement === 'top' ? 10 : 4);
      }
      case 'resolve_grave_free_cast': {
        // M174/E (Halo Forager): darmowy czar z grobu za {X} = zwykle zysk
        // (karta + efekt za samą manę); tanie czary lepsze. Rezygnacja przy
        // braku budżetu/sensu ma niski dodatni score (nie blokuje decyzji).
        if (cmd.decline) return finish(4);
        // M265 (Żywy Tester, theros vs worek-basni seed 332): oferta jest
        // enumerowana PER ZESTAW CELÓW (epicCastOffers), więc stała wartość
        // kazała botu brać pierwszy zestaw z brzegu — zmierzone: rzucił
        // Sleep of the Dead (tap + „doesn't untap") we WŁASNEGO
        // Blade-Blizzard Kitsune, który w tej samej turze miał atakować.
        // Bliźniacza gałąź suspend/rebound/madness liczy tę karę od M212/Z7;
        // ta jedna z rodziny jej nie miała (klasa L41). Deskryptor czaru
        // wisi na karcie w GROBIE (strefa jawna, CR 400.2).
        const graveCard = cmd.objectId
          ? (view.zones.graveyard ?? []).find((o) => o.id === cmd.objectId)
          : null;
        // Audyt PR #93 (znalezisko F): efekty WYBRANEGO trybu i wycena per cel.
        const effects = freeCastVariantEffects(graveCard, cmd);
        return finish(freeCastVariantScore(view, effects, cmd, Math.max(6, 40 - 3 * (cmd.xValue ?? 0))));
      }
      case 'resolve_madness_cast': {
        // M158/Batch 39: rzut za koszt madness to niemal zawsze zysk (karta
        // za pół ceny); odmowa tylko gdy many brak.
        if (!cmd.cast) return finish(0);
        // M212/Z7 (ta sama klasa co suspend/rebound): madness też enumeruje
        // ofertę PER ZESTAW CELÓW (epicCastOffers), więc stała wartość
        // kazałaby botu brać pierwszy cel z brzegu — także własny stwór.
        // Uwaga: oferta niesie objectId (obiekt w wygnaniu) ORAZ cardId
        // (identyfikator karty) — deskryptor czaru wisi na OBIEKCIE.
        const madnessCard = cmd.objectId
          ? view.zones.exile.find((o) => o.id === cmd.objectId)
          : null;
        // Audyt PR #93 (znalezisko F): ta sama wycena co w oknie grobu.
        return finish(freeCastVariantScore(view, freeCastVariantEffects(madnessCard, cmd), cmd, 60));
      }
      case 'resolve_exile_cast': {
        // Vaan, Street Thief: rzut ukradzionej karty za normalny koszt to
        // zwykle czysta przewaga (karta + efekt, gracz nie traci własnej);
        // rezygnacja daje tylko Treasure (mały zysk). Penalizujemy rzut
        // z nieprzyjaznym celem (freeCastTargetPenalty — ta sama reguła co
        // suspend/rebound/madness/grave free cast).
        if (!cmd.cast) return finish(6);
        const exiledCard = cmd.objectId
          ? view.zones.exile.find((o) => o.id === cmd.objectId)
          : null;
        // Audyt PR #93 (znalezisko F): jw. — Vaan wycenia wybrany tryb i cele.
        return finish(freeCastVariantScore(view, freeCastVariantEffects(exiledCard, cmd), cmd, 52));
      }
      case 'resolve_reveal_choice': {
        // M158/Batch 39 (Invasion of the Giants II): ujawnij Olbrzyma za 2
        // obrażenia przeciwnika — darmowy damage, prawie zawsze warto.
        return finish(cmd.cardId != null ? 40 + (cmd.amount ?? 2) * 4 : 0);
      }
      case 'resolve_discard_choice': {
        // M202/I (uwaga właściciela, Nightsnare): „Target opponent reveals
        // their hand. You may choose a nonland card from it. If you do, that
        // player discards that card. If you don't, that player discards two
        // cards.” Bot nie miał ŻADNEJ wyceny tej decyzji, więc wszystkie
        // warianty remisowały i brał pierwszą ofertę z listy — „wybrał jakąś
        // bezsensowną kartę z mojej ręki, miałem dużo lepsze”.
        // Zgodnie ze wskazówką właściciela: gdy wybór jednej karty jest
        // loterią, lepsza jest druga opcja (przeciwnik odrzuca dwie).
        // Rozróżnienie, czyja to ręka, jest policzalne z widoku: karty MOJEJ
        // ręki są w view.zones.hand (odrzucone jako koszt — wolę najtańsze),
        // karty odsłoniętej ręki przeciwnika nie.
        if (cmd.cardId == null) return finish(40);
        const mine = (view.zones.hand ?? []).some((o) => o.id === cmd.cardId);
        const value = view.zones.library.find((o) => o.id === cmd.cardId)?.manaCost
          ?? (view.zones.hand ?? []).find((o) => o.id === cmd.cardId)?.manaCost ?? 0;
        // Moja ręka (koszt): im tańsza karta, tym lepiej ją oddać.
        if (mine) return finish(20 - Math.min(10, value));
        // Ręka przeciwnika: wybranie drogiej karty ma wartość, ale dwie karty
        // odrzucone bez wyboru są warte więcej — stąd poniżej progu rezygnacji.
        return finish(10 + 3 * value);
      }
      case 'resolve_satyr_look_choice': {
        // Satyr Wayfinder: wzięcie lądu do ręki = pewna mana (zawsze lepsze niż
        // rezygnacja, bo reszta i tak idzie do grobu). Ląd premiami za manabazę.
        if (cmd.pickId == null) return finish(-5);
        const card = view.zones.library.find((o) => o.id === cmd.pickId) ?? null;
        let score = 30;
        if (card) score += (card.kind === 'land' ? 30 : 0) + (card.power ?? 0) * 2 + (card.toughness ?? 0);
        return finish(score);
      }
      case 'resolve_search_choice': {
        // Szukanie w bibliotece (Temat 6; Secret Entrance/cyclying/channel/
        // Kor Cartographer): znalezienie karty jest ZAWSZE lepsze niż
        // fail-to-find (found: null). Bez tego bot brał pierwszą ofertę
        // (rezygnację) i „skipował szukanie" — zgłoszenie właściciela B.
        if (cmd.found == null) return finish(-40);
        const card = view.zones.library.find((o) => o.id === cmd.found) ?? null;
        if (!card) return finish(0);
        let score = 25;
        // Land do ręki/na pole bitwy = pewna mana; stwory wg statystyk.
        if (card.kind === 'land') score += 30;
        score += (card.power ?? 0) * 2 + (card.toughness ?? 0);
        return finish(score);
      }
      case 'pass_priority': return finish(0);
      default: return finish(0);
    }
  }

  /** Czysty, zachłanny wybór (bez side effectów) — używany też jako polityka symulacji B2. */
  function greedyChoice(view) {
    const scored = view.legalCommands.map((cmd) => ({ cmd, score: scoreCommand(view, cmd) }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].cmd;
  }
  // Simpler opponent policy for lookahead: plays lands, casts creatures,
  // blocks if can kill attacker, otherwise passes. More realistic than
  // full greedy (which blocks optimally and makes attacks look bad).
  function simpleChoice(view) {
    const ofType = (type) => view.legalCommands.filter((c) => c.type === type);
    const first = (type) => ofType(type)[0] ?? null;
    // Always play land if available
    const land = first('play_land');
    if (land) return land;
    // Cast creatures (first available)
    const perm = first('cast_permanent');
    if (perm) return perm;
    // Block if can kill attacker (simple: assign all blockers to first attacker)
    // M203/2: „pierwsza oferta bloku" była zależna od KOLEJNOŚCI enumeracji
    // (przy konwencji unshift pierwsza = ostatnio wyliczona), więc ta polityka
    // symulacji raz blokowała, raz nie — a lookahead wyceniał ten sam atak
    // raz na −5, raz na +19 (zmierzone). Wybór musi wynikać z ZAMIARU
    // polityki („blokuj, gdy możesz"), nie z pozycji na liście (L41/L48):
    // preferujemy wariant, który faktycznie przypisuje blokery.
    const blockers = ofType('declare_blockers');
    if (blockers.length > 0) {
      const blocking = blockers.find((c) => Object.keys(c.assignments ?? {}).length > 0);
      return blocking ?? blockers[0];
    }
    // Resolve combat
    const resolve = first('resolve_combat');
    if (resolve) return resolve;
    // Resolve pending decisions (take first option)
    const resolveAny = view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (resolveAny) return resolveAny;
    // Pass
    return first('pass_priority');
  }

  /**
   * Ewaluacja liścia symulacji (B2): wygrana/przegrana dominuje, dalej życie,
   * siła i liczba stworów na planszy, przewaga kart i biblioteki. Działa na
   * PlayerView — czysta funkcja widoku, zero wiedzy o ukrytych kartach (FoW).
   */
  function evalView(view) {
    if (view.winnerId === view.playerId) return 10000;
    if (view.winnerId) return -10000;
    const me = view.players.find((p) => p.id === view.playerId);
    const foe = view.players.find((p) => p.id !== view.playerId);
    const myLife = me?.life ?? 0;
    const foeLife = foe?.life ?? 0;
    const mine = view.zones.battlefield.filter((o) => o.controllerId === view.playerId);
    const foeBoard = view.zones.battlefield.filter((o) => o.controllerId !== view.playerId);
    const myCreatures = mine.filter((o) => o.kind === 'creature');
    const foeCreatures = foeBoard.filter((o) => o.kind === 'creature');
    const myPower = myCreatures.reduce((sum, o) => sum + Math.max(0, o.power ?? 0), 0);
    const foePower = foeCreatures.reduce((sum, o) => sum + Math.max(0, o.power ?? 0), 0);
    const myHand = view.zones.hand.filter((o) => o.controllerId === view.playerId).length;
    const foeHand = view.zones.hand.filter((o) => o.controllerId !== view.playerId).length;
    const myLib = view.zones.library.filter((o) => o.controllerId === view.playerId).length;
    const foeLib = view.zones.library.filter((o) => o.controllerId !== view.playerId).length;
    // Creature quality: keywords add value
    let myQuality = 0;
    let foeQuality = 0;
    for (const c of myCreatures) {
      if ((c.keywords ?? []).includes('flying')) myQuality += 2;
      if ((c.keywords ?? []).includes('deathtouch')) myQuality += 2;
      if ((c.keywords ?? []).includes('lifelink')) myQuality += 1;
      if ((c.keywords ?? []).includes('trample')) myQuality += 1;
      if ((c.keywords ?? []).includes('vigilance')) myQuality += 1;
      if ((c.keywords ?? []).includes('menace')) myQuality += 1;
      if ((c.keywords ?? []).includes('first_strike') || (c.keywords ?? []).includes('double_strike')) myQuality += 2;
    }
    for (const c of foeCreatures) {
      if ((c.keywords ?? []).includes('flying')) foeQuality += 2;
      if ((c.keywords ?? []).includes('deathtouch')) foeQuality += 2;
      if ((c.keywords ?? []).includes('lifelink')) foeQuality += 1;
      if ((c.keywords ?? []).includes('trample')) foeQuality += 1;
      if ((c.keywords ?? []).includes('vigilance')) foeQuality += 1;
      if ((c.keywords ?? []).includes('menace')) foeQuality += 1;
      if ((c.keywords ?? []).includes('first_strike') || (c.keywords ?? []).includes('double_strike')) foeQuality += 2;
    }
    // Evasion power: flying creatures are harder to block
    const myEvasion = myCreatures.filter((c) => (c.keywords ?? []).includes('flying')).reduce((s, c) => s + Math.max(0, c.power ?? 0), 0);
    const foeEvasion = foeCreatures.filter((c) => (c.keywords ?? []).includes('flying')).reduce((s, c) => s + Math.max(0, c.power ?? 0), 0);
    // Deck-out pressure: when library is small, every turn counts
    const myDeckPressure = myLib <= 5 ? (5 - myLib) * 3 : 0;
    const foeDeckPressure = foeLib <= 5 ? (5 - foeLib) * 3 : 0;
    // Life advantage (more weight when close to lethal)
    const lifeScore = (myLife - foeLife) * (foeLife <= 8 ? 1.5 : 1.0);
    // Board presence
    const boardScore = 2 * (myCreatures.length - foeCreatures.length);
    // Power advantage (include evasion bonus)
    const powerScore = 1.5 * (myPower - foePower) + 2 * (myEvasion - foeEvasion);
    // Creature quality
    const qualityScore = myQuality - foeQuality;
    // Card advantage
    const handScore = myHand - foeHand;
    // Library advantage (more important when low)
    const libScore = myLib - foeLib + myDeckPressure - foeDeckPressure;
    return lifeScore + powerScore + boardScore + qualityScore + handScore + libScore;
  }

  /**
   * Punktacja z lookahead (B2): top-K kandydatów strategicznych (wg B1) jest
   * dogrywana na klonie stanu przez `simulate` (helper engine). Wynik kandydata
   * = ocena B1 + waga × (ewaluacja liścia − ewaluacja obecna). „Zrobienie nic"
   * jest naturalnym punktem odniesienia (pusty atak / pass w innych typach).
   * Deterministyczne: klon + polityka greedyChoice, zero losowości.
   */
  function scoredWithLookahead(view, simulate) {
    const scored = view.legalCommands.map((cmd) => ({ cmd, score: scoreCommand(view, cmd) }));
    scored.sort((a, b) => b.score - a.score);
    const base = evalView(view);
    // W wyścigu (mała biblioteka / bliski lethal wroga) atak jest presją, nie
    // „opcją do ewaluacji" — lookahead pokazał, że ostrożna ewaluacja zbyt
    // często rezygnuje z ataku i przegrywa deck-outem (małe talie benchmarku).
    const racing = view.zones.library.length > 0 && myLibraryCount(view) <= 4
      || (enemy(view)?.life ?? 20) <= 8;
    const candidates = scored
      .filter((s) => LOOKAHEAD_TYPES.includes(s.cmd.type) && !(racing && s.cmd.type === 'declare_attackers'))
      .slice(0, LOOKAHEAD_TOP_K);
    for (const entry of candidates) {
      // Horyzont wg typu decyzji: atak — do rozstrzygnięcia walki; zagrania
      // w main — do końca własnej fazy main (sekwencjonowanie).
      const horizon = entry.cmd.type === 'declare_attackers' ? 'combat' : 'main_phase';
      const sim = simulate(entry.cmd, { policy: simpleChoice, maxCommands: LOOKAHEAD_MAX_COMMANDS, horizon });
      if (sim.rejected) continue;
      const delta = evalView(sim.view) - base;
      if (Math.abs(delta) < LOOKAHEAD_EVAL_THRESHOLD) continue;
      entry.score += LOOKAHEAD_WEIGHT * delta;
    }
    return scored;
  }

  /**
   * Projekcja DANYCH, na których bot oparł decyzję — wyłącznie dla audytu
   * (`tools/bot-tie-audit.mjs`). Same punkty nie odpowiadaja na pytanie, czy ex
   * aequo bylo uczciwe: 93 = 93 moze znac „dwa lasy, nic do rozstrzygniecia"
   * albo „ktoś przestał patrzec przed druga cecha". Projekcja zwraca to, co
   * `landPlayDelta` realnie wzielo pod uwage (te same dane, ta sama funkcja),
   * wiec bramka lapie regresje: usuniecie delty ⇒ roznica w projekcji przy
   * rownych punktach ⇒ RED. Zwraca null dla komend bez zdefiniowanej projekcji —
   * audyt liczy je jako „bez danych" i nie udaje, ze je ocenil.
   */
  function tieProjection(view, cmd) {
    if (!view) return null;
    if (cmd?.type === 'declare_attackers') {
      const atak = cmd.attackerIds ?? [];
      // Projekcja WYNIKU kroku bojowego (CR 509/510 na poziomie faktów, bez
      // wag): ile obrażeń realnie dojdzie po absorpcji blockerów, ilu naszych
      // ginie, ilu ich blokerów ginie. To są dane, które decyzja o ataku musi
      // rozstrzygać; punkty dorzucają do tego presję, zegar i ryzyko removalu.
      //
      // Świadomie NIE ma tu „obrony zostawionej w domu". Pierwsza wersja
      // projekcji pytała o sumę wytrzymałości stworów, które nie atakują, i
      // findingi na tym polu okazały się artefaktem metryki, nie ślepotą bota:
      // stwór tapnięty atakiem odświeża się w NASZYM kroku odświeżania, czyli
      // zdąży zablokować w turze wroga (CR 502.3 + 702.21 dla vigilance —
      // wyjątek „doesn't untap" obsługuje osobna gałąź wyceny). Pytanie
      // „co zostaje w obronie" jest więc w Magic pytaniem o efekt, nie o
      // tapnięcie; metryka, która o tym zapomina, produkuje szum (L118).
      const blokerzy = untappedEnemyBlockers(view);
      const absorpcja = blokerzy.reduce((a, o) => a + (o.toughness ?? 0), 0);
      const najsilniejszy = blokerzy.reduce((a, o) => Math.max(a, o.power ?? 0), 0);
      let sila = 0;
      let ginie = 0;
      for (const id of atak) {
        const o = objectOnBoard(view, id);
        sila += o?.power ?? 0;
        if ((o?.toughness ?? 99) <= najsilniejszy) ginie += 1;
      }
      const zycieWroga = enemy(view)?.life ?? 999;
      const zabici = blokerzy.filter((b) => atak.some((id) => (objectOnBoard(view, id)?.power ?? 0) >= (b.toughness ?? 99))).length;
      return {
        atakuje: atak.length,
        trafienie: Math.min(Math.max(0, sila - absorpcja), zycieWroga),
        ginie,
        zabici,
        smiertelny: sila > 0 && Math.max(0, sila - absorpcja) >= zycieWroga ? 1 : 0,
      };
    }
    if (String(cmd?.type ?? '').startsWith('cast_')) {
      // Rzucanie czaru: audyt pyta o dane, które różnią WARIANTY tego samego
      // typu komendy (tę kartę czy tamtą, z kickerem czy bez, na ile celów).
      // Bez projekcji 13 remisów `cast_*` było „bez danych" — pomiar o nich
      // milczał, a milczenie łatwo pomylić z brakiem problemu.
      //
      // Sygnaturą jest WARTOŚĆ, nie surowe pola. Pierwsza wersja niosła osobno
      // `koszt` i `materialna = power + toughness`; to drugie okazało się
      // modelem gorszym niż sama wycena (Magic waży siłę inaczej niż
      // wytrzymałość — patżej `creaturePowerWeight` vs `creatureToughnessWeight`),
      // więc flagała pary słusznie uznane za zamienne. Osobny `koszt` był z kolei
      // podwójnym liczeniem tej samej różnicy. Została jedna liczba: ile ta karta
      // realnie dokłada do wyniku w przeliczeniu na manę, którą zajmuje.
      const o = handCard(view, cmd.objectId);
      if (!o) return null;
      const koszt = (o.manaCost ?? 0) + coloredPipsOf(o.cardId).length;
      // Equipment: wartość rzutu żyje na NOSICIELU (M258/A), więc projekcja
      // musi liczyć pompę tak jak scoreCommand — inaczej audyt widzi
      // „różne dane” tam, gdzie wycena faktycznie widzi warianty zamienne
      // (Steelfin Whale 3/4 za 6 vs Strandwalker tworzący 2/4 Germ za 5).
      const pump = (myCreatures(view).length > 0 && o.equipment) ? (o.equipment.pump ?? {}) : {};
      const cialo = (o.power ?? 0) * P.creaturePowerWeight + (o.toughness ?? 0) * P.creatureToughnessWeight
        + (pump.power ?? 0) * P.creaturePowerWeight + (pump.toughness ?? 0) * P.creatureToughnessWeight;
      return {
        waluta: cialo - P.creatureManaCostWeight * koszt,
        cele: (cmd.targets ?? []).length,
        kicker: cmd.kicked ? 1 : 0,
        // Audyt Batch53/C: wariant offspring (Rust-Shield Rampager) remisował
        // z rzutem naturalnym (ten sam score), a projekcja nie niosła różnicy
        // — remis wyglądał na „uczciwy", choć warianty się różnią (jak kicker).
        offspring: cmd.offspring ? 1 : 0,
        tryb: cmd.mode ?? cmd.modeIndex ?? null,
      };
    }
    if (cmd?.type === 'activate_ability') {
      // Aktywacja zdolności: czy płacimy maną/tapnięciem, ile ma celów i czy to
      // w ogóle zdolność nie-manowa (mana to osobna komenda `tap_for_mana`).
      const o = (view.zones.battlefield ?? []).find((x) => x.id === cmd.objectId)
        ?? handCard(view, cmd.objectId);
      const zdolnosc = o?.abilities?.[cmd.abilityIndex ?? 0] ?? cardDef(o?.cardId)?.abilities?.[cmd.abilityIndex ?? 0];
      if (!zdolnosc) return null;
      return {
        tap: zdolnosc.cost?.tap ? 1 : 0,
        mana: zdolnosc.cost?.mana ?? zdolnosc.cost?.generic ?? 0,
        manowa: manaOnlyAbility(zdolnosc) ? 1 : 0,
        cele: (cmd.targets ?? []).length,
        kosztem: zdolnosc.cost?.sacrificeSelf ? 1 : 0,
      };
    }
    if (cmd?.type === 'declare_blockers') {
      // Ile obrażeń realnie znika i iloma własnymi stwarami się za to płaci.
      const przypisania = cmd.assignments ?? {};
      let zablokowane = 0;
      let ofiary = 0;
      for (const [atakujacyId, blokerzy] of Object.entries(przypisania)) {
        const atakujacy = objectOnBoard(view, atakujacyId);
        zablokowane += atakujacy?.power ?? 0;
        for (const blokerId of blokerzy ?? []) {
          const b = objectOnBoard(view, blokerId);
          if (b && (atakujacy?.power ?? 0) >= (b.toughness ?? 99)) ofiary += 1;
        }
      }
      return { zablokowane, ofiary, blokuje: Object.keys(przypisania).length };
    }
    if (cmd?.type !== 'play_land') return null;
    const o = (view.zones.hand ?? []).find((x) => x?.id === cmd.objectId);
    if (!o) return null;
    const a = landAnaliza(view, cmd.objectId);
    return {
      karta: o.cardId ?? null,
      kolory: [...a.kolory].sort().join(''),   // do raportu, NIE do sygnatury
      pokrywa: a.pokrywa,
      tapped: a.entersTapped,
      zdolnosc: a.dodatkowaZdolnosc,
      ilosc: a.ilosc,
      nowyKolor: a.nowyKolor,
    };
  }

  function summarize(cmd, view = null) {
    // M203/2: warianty scry/surveil były w śladzie nieodróżnialne (oba
    // streszczały się do `resolve_scry`), więc diagnostyka i test wyceny
    // musiały parować opcje z `legalCommands` PO INDEKSIE — a opcje w śladzie
    // są SORTOWANE po punktach, więc takie parowanie przechodziło przypadkiem
    // (klasa L34/L40). Ta sama lekcja co M195/B: opis w śladzie ma nazywać
    // wariant, nie tylko typ decyzji.
    if (cmd.type === 'resolve_scry') {
      return `resolve_scry(${(cmd.bottomIds ?? []).length ? `bottom:${cmd.bottomIds.join('+')}` : 'keep'})`;
    }
    if (cmd.type === 'resolve_surveil') {
      return `resolve_surveil(${(cmd.millIds ?? []).length ? `mill:${cmd.millIds.join('+')}` : 'keep'})`;
    }
    if (cmd.type === 'declare_attackers') return `attack[${cmd.attackerIds.join(',')}]`;
    if (cmd.type === 'declare_blockers') return `block[${Object.entries(cmd.assignments ?? {}).map(([a, b]) => `${a}<${b.join('+')}`).join(' ')}]`;
    // Świadomie BEZ karty w śladzie (próba z tury 6 odwrócona): ~19 testów
    // (m234, m235, m247, m257, batch52) parsuje format `cast_*(objectId)`, a
    // wariant i tak jest w nim rozstrzygalny — `objectId` jest unikalny w ręce,
    // a od tury 6 różnicę niosą projekcje (`waluta`, `cele`, `kicker`). Zysk
    // czytelności nie był wart przepisania pinsów, które sami pilnują wyceny.
    if (cmd.type === 'cast_spell' || cmd.type === 'cast_cleave' || cmd.type === 'cast_permanent' || cmd.type === 'cast_adventure' || cmd.type === 'cast_adventure_creature') return `${cmd.type}(${cmd.objectId}${cmd.targets ? '->' + cmd.targets.join('+') : ''})`;
    // M195/B: aktywacja zdolności bez ŹRÓDŁA i CELU była w śladzie nieczytelna
    // („activate_ability" × N) — nie dało się odróżnić buffu sojusznika od
    // tapnięcia samego siebie ani w diagnostyce, ani w teście wyceny.
    if (cmd.type === 'activate_ability') {
      return `activate_ability(${cmd.objectId}#${cmd.abilityIndex ?? 0}${(cmd.targets ?? []).length ? '->' + cmd.targets.join('+') : ''})`;
    }
    if (cmd.type === 'play_land') {
      // Ślad ma nazywać WARIANT (lekcja M195/B i M203/2, ta sama co wyżej): przy
      // dwóch ziemiach w ręce oba warianty streszczały się do `play_land`, więc
      // audyt remisorów (`tools/bot-tie-audit.mjs`) nie odróżniał „dwa lasy —
      // remis uczciwy" od „góra i las — bot nie ocenił". Karta w śladzie czyni
      // remis rozstrzygalnym dla bramki.
      const o = (view?.zones?.hand ?? []).find((x) => x?.id === cmd.objectId);
      return `play_land(${cmd.objectId}${o?.cardId ? ':' + o.cardId : ''})`;
    }
    return cmd.type;
  }

  return Object.freeze({
    chooseCommand(view, helpers) {
      if (!view?.legalCommands?.length) throw new Error('Widok nie zawiera legalnych komend');
      const scored = enabled && helpers?.simulate
        ? scoredWithLookahead(view, helpers.simulate)
        : view.legalCommands.map((cmd) => ({ cmd, score: scoreCommand(view, cmd) }));
      scored.sort((a, b) => b.score - a.score);
      let pick = scored[0];
      if (randomness > 0 && scored.length > 1 && rng() < randomness) {
        const pool = scored.slice(0, Math.min(3, scored.length));
        pick = pool[Math.floor(rng() * pool.length)];
      }
      const wpis = {
        turn: view.turn.number, step: view.turn.step,
        chosen: summarize(pick.cmd, view), score: pick.score,
        options: scored.map((entry) => ({ cmd: summarize(entry.cmd, view), score: entry.score })),
      };
      // Ex aequo na maksimum: doklej projekcję danych wszystkich wariantów z
      // górnej półki, żeby audyt mógł ocenić, czy remis był uczciwy (tieProjection).
      // Koszt: tylko przy remisach, a wpis i tak powstaje.
      if (scored.length > 1 && Number.isFinite(pick.score)) {
        const naMaks = scored.filter((x) => x.score === pick.score);
        if (naMaks.length > 1) {
          wpis.tie = naMaks.map((x) => ({ cmd: summarize(x.cmd, view), proj: tieProjection(view, x.cmd) }));
        }
      }
      history.push(wpis);
      return pick.cmd;
    },
    /** Ślad uzasadnień punktowych — diagnostyka decyzji bota. */
    trace() {
      return history.map((entry) => ({ ...entry, options: entry.options.map((o) => ({ ...o })) }));
    },
  });
}
