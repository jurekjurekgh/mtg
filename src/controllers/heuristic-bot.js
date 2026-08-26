import { createRng } from '../engine/rng.js';
import { sourceHasProtectionQuality } from '../engine/attachments.js';
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
  const able = (blockers ?? []).filter((b) => {
    const kw = b?.keywords ?? [];
    return !flying || kw.includes('flying') || kw.includes('reach');
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
    return qualities.some((q) => sourceHasProtectionQuality(q, attacker));
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
  const myLandCount = (view) => view.zones.battlefield.filter((o) => o.controllerId === view.playerId && o.kind === 'land').length;

  /**
   * M218/4 — czy stwór jest zagrożony w tej turze (regenerate).
   * Zagrożenie = walka (ginie w symulacji CR 510) albo przeciwnik ma otwartą
   * manę i removal (damage) który może go zabić (B3 model).
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
    // 2. Obrażenia śmiertelne już zadane (SBA 704.5g)
    if ((creature.damage ?? 0) >= (creature.toughness ?? 0)) return true;
    // 3. Removal w zasięgu many wroga (B3 — hipergeometria)
    if (removalSpells.size && opponentOpenMana(view) >= minRemovalCost) {
      const toughness = (creature.toughness ?? 0) - (creature.damage ?? 0);
      for (const info of removalSpells.values()) {
        if (info.cost <= opponentOpenMana(view) && info.amount >= toughness) return true;
      }
    }
    return false;
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
  /**
   * M202/G (uwaga właściciela, Fleeting Distraction): efekt `pump` jest
   * PRZYJAZNY tylko przy dodatnich wartościach — „Target creature gets -1/-0
   * until end of turn” to efekt WROGI. Klasyfikacja wyłącznie po TYPIE efektu
   * (`pump` = przyjazny, +50) karała rzucenie debuffu we wroga i premiowała
   * rzucenie go we WŁASNEGO stwora — dokładnie zgłoszenie: „Bot ma na stole
   * kreatury, gracz nie ma. Bot rzuca ten czar na swoją kreaturę i debuffuje
   * ją. Bez sensu.” Reguła generyczna po ZNAKU deskryptora (ADR 0002).
   */
  function isNegativePump(effect) {
    if (effect?.type !== 'pump') return false;
    return (effect.power ?? 0) < 0 || (effect.toughness ?? 0) < 0;
  }

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
      const friendCost = isNegativePump(effect)
        ? null
        : (FRIENDLY_TARGET_EFFECTS.get(effect.type)
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
    if (type === 'activate_ability' || type === 'resolve_backup' || type === 'resolve_scry' || type === 'resolve_surveil' || type === 'resolve_clash_choice' || type === 'resolve_room_target' || type === 'resolve_undercity_route' || type === 'resolve_fabricate' || type === 'resolve_sacrifice_choice' || type === 'resolve_food_choice' || type === 'resolve_discover_choice' || type === 'resolve_explore_choice' || type === 'resolve_craft_exile' || type === 'resolve_hand_creature' || type === 'resolve_devour_choice' || type === 'resolve_endure_choice' || type === 'resolve_delirium_target' || type === 'resolve_mentor_target' || type === 'resolve_graveyard_top_choice' || type === 'resolve_legend_choice' || type === 'resolve_reveal_order' || type === 'resolve_proliferate' || type === 'resolve_damage_target' || type === 'resolve_modal_choice' || type === 'resolve_redirect_choice' || type === 'resolve_discard_choice' || type === 'resolve_hand_top_choice' || type === 'resolve_land_type_choice' || type === 'resolve_library_placement' || type === 'resolve_search_choice' || type === 'resolve_fertile_thicket' || type === 'resolve_springbloom' || type === 'resolve_pay_or_sacrifice' || type === 'resolve_optional_pay_choice' || type === 'resolve_counter_pay_choice' || type === 'resolve_trigger_target' || type === 'resolve_optional_trigger_choice' || type === 'resolve_moonlit_choice' || type === 'resolve_mulligan_choice' || type === 'resolve_mulligan_bottom_choice' || type === 'resolve_damage_assignment' || type === 'resolve_optional_draw' || type === 'resolve_exploit_choice' || type === 'resolve_reveal_exile_hand' || type === 'resolve_reveal_exile_grave' || type === 'resolve_look_top_choice' || type === 'resolve_satyr_look_choice' || type === 'resolve_epic_choice' || type === 'resolve_suspend_cast' || type === 'resolve_rebound_cast' || type === 'resolve_enter_as_copy' || type === 'resolve_destroy_equipment_choice' || type === 'resolve_replacement_choice' || type === 'resolve_copy_targets' || type === 'resolve_opponent_target' || type === 'resolve_damage_division' || type === 'resolve_grave_free_cast') return 'ability';
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
      case 'play_land': return finish(90);
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
            if (!target) return finish(-50);
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
              return finish(-80 - worth);
            }
            return finish(target.controllerId === view.playerId
              ? -70 - worth              // unieruchamiam własnego stwora
              : 55 + 2 * worth);         // unieruchamiam stwora wroga
          }
          if (!target || target.controllerId !== view.playerId) return finish(-50);
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
            // Kara musi PRZEBIC baze aury (~66) — inaczej jest dekoracja
            // (L3/L54). Brak zagrozen = nie rzucaj, trzymaj karte w rece.
            if (threats === 0) return finish(-40);
            // Sa zagrozenia: wartosc rosnie z ich liczba, ale ochrona bez
            // pumpa nie jest tempem — zostaje ponizej zwyklego buffa.
            return finish(20 + 12 * threats + (target.power ?? 0));
          }
          const pump = pumpDesc;
          return finish(66 + 2 * ((target.power ?? 0) + pump.power) + ((target.toughness ?? 0) + pump.toughness));
        }
        const def = card ? cardDef(card.cardId) : undefined;
        let score = P.creatureBase + (card?.power ?? 0) * P.creaturePowerWeight + (card?.toughness ?? 0) * P.creatureToughnessWeight;
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
        return finish(score);
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
          for (const exId of cmd.escapeExileIds ?? []) {
            const exiled = zoneCard(view, exId) ?? view.zones.graveyard.find((o) => o.id === exId);
            if (!exiled) continue;
            // Widok grobu redaguje pola — cechy wygnanej karty bierzemy
            // z rejestru po cardId (jak wyżej przy deskryptorze czaru).
            const def = exiled.cardId ? cardDef(exiled.cardId) : undefined;
            const isCreature = (def?.types ?? []).includes('Creature')
              || (def?.power != null && def?.toughness != null);
            if (isCreature) score -= 10 + 2 * (def.power ?? 0) + (def.toughness ?? 0);
            else score -= 6;
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
        if (effects.some((effect) => effect?.type === 'counter_spell' || effect?.type === 'counter_spell_unless_pays')) {
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
        }
        if (spell.fireball) {
          const ids = cmd.targets ?? [];
          const foeId = enemy(view)?.id;
          const hitsSelf = ids.includes(view.playerId);
          const hitsFoe = foeId != null && ids.includes(foeId);
          if (hitsSelf && !hitsFoe) return finish(-80);
          if (hitsSelf) score -= 50;
          if (hitsFoe) score += 25 + (cmd.xValue ?? 0);
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
        for (const effect of effects) {
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
            } else {
              const worth = (target.power ?? 0) + (target.toughness ?? 0);
              score += 22 + 2 * worth;
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
            else score += attackingEnemyPower(view) > 0 ? 15 : -20;
          }
          // M109 (Spare from Evil): ochrona do końca tury to SZTUCZKA BOJOWA.
          // Poza walką (brak atakujących po którejkolwiek stronie) rzucenie
          // jej to wyrzucona karta i mana — reguła generyczna po treści
          // efektu, bez nazw kart (ADR 0002).
          if (effect.type === 'grant_protection_until_end_of_turn') {
            const combatOn = (view.combat?.attackers?.length ?? 0) > 0;
            score += combatOn ? 12 : -45;
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
            score += 25 + (target.power ?? 0) * 2;
          }
          if (effect.type === 'damage' && target && target.controllerId !== view.playerId) {
            // M92 (audyt PlayerView): obrażenia w cel objęty pełną prewencją
            // (Ethersworn Shieldmage) albo pochłonięte w całości przez tarczę
            // (Withstand) to zmarnowana karta — 0 zadanych obrażeń.
            const amount = Number.isInteger(effect.amount) ? effect.amount : 0;
            const absorbed = shieldedAmount(view, target.id);
            if (damageFullyPrevented(view, target) || (amount > 0 && absorbed >= amount)) {
              score -= 70;
              continue;
            }
            const lethal = (effect.amount ?? 0) >= (target.toughness ?? 0) - (target.damage ?? 0);
            score += 10 + 3 * (target.power ?? 0) + (lethal ? 15 : 0);
          } else if (effect.type === 'damage') {
            score -= 60; // lanie we własne stwory bez powodu jest marnotrawstwem
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
          if (effect.type === 'draw_cards' || effect.type === 'draw_cards_both_players') score += 6 * (effect.amount ?? 1);
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
          // M158/Batch 39 (Wrap in Flames): wrapper „each of up to N targets"
          // różnicuje warianty celami — wyceniamy KAŻDY cel wg efektów
          // wewnętrznych (damage: wróg +, własny −; cant_block: drobny plus
          // na wrogu). Bez tego remis wariantów brał pierwsze 3 kreatury
          // z pola bitwy — także WŁASNE.
          if (effect.type === 'apply_to_each_target') {
            const inner = Array.isArray(effect.effects) ? effect.effects : [];
            const hasDamage = inner.some((x) => x?.type === 'damage');
            const hasCantBlock = inner.some((x) => x?.type === 'cant_block');
            if (hasDamage || hasCantBlock) {
              for (const slot of cmd.targets ?? []) {
                const t3 = objectOnBoard(view, slot);
                if (!t3) continue;
                const mine = t3.controllerId === view.playerId;
                if (hasDamage) score += mine ? -60 : 12 + (t3.power ?? 0) * 2;
                else if (hasCantBlock) score += mine ? -10 : 8;
              }
            }
          }
          // M157/L28 (inwentaryzacja): kradzież stwora do końca tury (Spreading
          // Insurrection, Awaken the Sleeper) — warianty różnią się celem;
          // wartość = tymczasowy zysk najsilniejszego stwora wroga.
          if (effect.type === 'gain_control_until_end_of_turn') {
            const foe2 = enemy(view);
            if (target && foe2 && target.controllerId === foe2.id) {
              score += 12 + (target.power ?? 0) * 2 + (target.toughness ?? 0);
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
            else score += 10;
          }
          // Uwaga B (2026-08-12): pumpy (pump, pump_by_creature_count — Might of
          // the Masses, pump_enchanted_creature) wzmacniają stwora-CELU. Wzmacnianie
          // stwora PRZECIWNIKA to marnotrawstwo — kara, nie dotyczy własnych.
          const isPumpEffect = effect.type === 'pump'
            || effect.type === 'pump_by_creature_count'
            || effect.type === 'pump_enchanted_creature'
            || effect.type === 'pump_by_gates';
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
        const abilityObject = source ?? handCard(view, cmd.objectId);
        const def = abilityObject ? cardDef(abilityObject.cardId) : undefined;
        const ability = def?.abilities?.[cmd.abilityIndex ?? 0];
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
          // M219 (pętla jakości Żywym Testerem, h9 zendikar vs worek-legend
          // s=44): pendingTwin łapie tylko drugą kopię NA STOSIE. Gdy pierwsza
          // aktywacja już się ROZSTRZYGNĘŁA i nadała trwały-do-EOT stan
          // (saddled), źródło nosi go na polu bitwy, a bot i tak aktywował
          // Trained Arynx (Saddle 2) 3× z rzędu w jednej turze — każde
          // kolejne osiodłanie tapuje inny stwór za nic (L51: efekt
          // idempotentny już zastosowany). Generycznie po flagach STANU
          // czytanych z PlayerView (ADR 0017), nie po nazwie karty (ADR 0002).
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
            score += threatened ? 30 : -20;
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
          if (effect.type === 'pump' || effect.type === 'pump_enchanted_creature' || effect.type === 'pump_by_gates') {
            // Basilisk Gate: +X/+X, X = liczba kontrolowanych bram (Gate) —
            // liczymy z widoku, bo X nie siedzi w deskryptorze efektu.
            const gates = effect.type === 'pump_by_gates'
              ? view.zones.battlefield.filter((o) => o.controllerId === view.playerId && (o.subtypes ?? []).includes('Gate')).length
              : 0;
            const pGain = effect.type === 'pump_by_gates' ? gates : (effect.power ?? 0);
            const tGain = effect.type === 'pump_by_gates' ? gates : (effect.toughness ?? 0);
            let value = pGain + (tGain > 0 ? 1 : 0);
            // Pump bez jawnych celów działa na samo źródło (np. Warboar);
            // aura firebreathing pompuje zaczarowanego stwora.
            const enchantedId = effect.type === 'pump_enchanted_creature' ? source?.attachedTo : null;
            const recipient = target ?? (enchantedId ? objectOnBoard(view, enchantedId) : null) ?? source;
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
          if (effect.type === 'gain_life') score += 2 + (effect.amount ?? 0);
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
          const playerTarget = (cmd.targets ?? []).find((id) => id === view.playerId || id === enemy(view)?.id);
          if (playerTarget) {
            const hitsSelf = playerTarget === view.playerId;
            if (effect.type === 'mill_cards' || effect.type === 'mill_from_bottom') {
              // Mielenie siebie przybliża własny deck-out; mielenie wroga to zysk.
              score += hitsSelf ? -25 : 6 + 2 * (effect.amount ?? 1);
            }
            if (effect.type === 'damage' || effect.type === 'lose_life') {
              const amount = effect.amount ?? 0;
              score += hitsSelf ? -30 - 2 * amount : 10 + 3 * amount;
            }
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
          // ---- Batch 48 (L50/L51): wycena nowych efektow -----------------
          if (effect.type === 'creatures_cant_block_this_turn') {
            // Ruthless Invasion: warte tyle, ile obrazen przepusci. Liczymy
            // moc GOTOWYCH atakujacych minus to, co i tak jest nieblokowalne;
            // bez wlasnych atakujacych czar jest bezuzyteczny.
            const except = effect.exceptTypes ?? [];
            const readyPower = myCreatures(view)
              .filter((c) => canAttackNow(c))
              .reduce((sum, c) => sum + (c.power ?? 0), 0);
            const blockersRemoved = enemyCreatures(view)
              .filter((c) => !c.tapped && !except.some((t) => (c.types ?? []).includes(t))).length;
            score += readyPower > 0 && blockersRemoved > 0
              ? Math.min(40, readyPower * 3 + blockersRemoved * 4)
              : -25;
          }
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
              if (delta >= 2) score += 4 + delta;
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
              const grantsEvasion = grants.includes('flying')
                && blockersNow.every((o) => !hasKeyword(o, 'flying') && !hasKeyword(o, 'reach'));
              const neutralized = attackerNeutralizedByProtection(target, blockersNow);
              if (neutralized && !grantsEvasion) {
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
            perAttacker = power + 3;
          } else if (attackerImmuneThisTurn) {
            perAttacker = power + 3;
          } else if (dealsNoCombatDamage) {
            // 0/1 w otwartego: 0 obrażeń bojowych, a stwór tapnięty i wystawiony
            // na bloki — wartość NIE może zostać podratowana premią „otwartej
            // presji" (+8), dlatego tak nisko (poniżej passu).
            perAttacker = -12;
          } else if (blockers.length === 0) {
            perAttacker = power + 3; // otwarty — czysta presja
          } else if (object.cantBlock && attackers.length > blockers.length) {
            // M221/G (zgłoszenie właściciela, token Phyrexian Mite „can't
            // block"): stwór, który NIE MOŻE blokować, nie ma wartości
            // obronnej — trzymanie go w tyle to zmarnowany potencjał. W ataku
            // liczniejszym niż blokerzy przeciwnika obrońca blokuje większe
            // zagrożenia, więc mały cantBlock (zwykle token 1/1) przechodzi
            // i dokłada obrażenia (tu jeszcze toxic). Brak kosztu alternatywy:
            // i tak nigdy nie zablokuje. Reguła po deskryptorze cantBlock
            // z PlayerView (ADR 0002/0017), nie po nazwie karty.
            perAttacker = power + 3;
          } else if (diesBeforeDealingDamage(object, blockers)) {
            // M202/N: bloker z first strike zabija atakującego, zanim ten zada
            // cokolwiek (CR 510.4) — atak ma 0% szans: 0 obrażeń i strata
            // stwora. Jałowy, więc premia wyścigu go nie uratuje.
            perAttacker = -(toughness + 8);
            futileAttackers += 1;
          } else if (attackerStrikesFirst(object, blockers) && power >= strongestBlockerToughness) {
            // M202/N (symetrycznie): first strike atakującego zabija blokera,
            // zanim ten odpowie — atakujący PRZEŻYWA, więc to nie wymiana
            // (power - 1), a czysty zysk jak przy ataku w otwartego.
            perAttacker = power + 3;
          } else if (toughness > strongestBlockerPower && power >= strongestBlockerToughness) {
            perAttacker = power + 3; // przeżyje I zabija blokera — realny zysk
          } else if (blockers.length >= 2 && toughness <= gangPower && power < weakestBlockerToughness) {
            // M167/I: ginie od GANGU blokerów i nie zabija ŻADNEGO — czysta
            // strata stwora (2/4 w 1/3 + 3/3). Kara ponad wagę wyścigu.
            perAttacker = -(toughness + 8);
          } else if (toughness > strongestBlockerPower) {
            // Przeżyje, ale NIE zabije blokera (2/3 vs 2/3): nic nie zyskuje,
            // a tapnięty atakujący nie zablokuje w następnej turze — netto
            // strata, poniżej passu (uwaga właściciela z testów).
            perAttacker = -2;
            // M188/C: ten atak jest JAŁOWY — obrońca zablokuje bez straty,
            // więc nie przejdą obrażenia ani nie zginie żaden bloker.
            futileAttackers += 1;
          } else if (power >= strongestBlockerToughness) {
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
          if (hasKeyword(object, 'flying') && blockers.every((o) => !hasKeyword(o, 'flying') && !hasKeyword(o, 'reach'))) score += 3;
          // Drenaż z triggera ataku przechodzi niezależnie od bloków.
          score += 3 * drainOnAttack(id);
        }
        // Presja: atak w otwartego, lethal i przewaga liczebna premiowane.
        if (blockers.length === 0 && attackers.length > 0) score += 8;
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
        // Zegar (B1): gramy o czas, gdy wróg jest blisko śmierci, może nas
        // zabić w następnej turze albo nasza biblioteka się kończy — wtedy
        // atakujemy nawet kosztem wymiany. (strażnik „> 0" odróżnia realną
        // partię od stanów testowych bez biblioteki)
        const libraryExists = view.zones.library.length > 0;
        const racing = enemyLife <= 10
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
          score += totalPower >= enemyLife - 5 ? 20 : 8;
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
              const killable = [...removalSpells.values()].some((r) => r.amount >= (object.toughness ?? 0) - (object.damage ?? 0));
              // Kara ~ wartość stwora × prawdopodobieństwo: atak 2/2 przy 70%
              // ryzyka removalu to strata (0 obrażeń i stwór w grobie).
              if (killable) score -= removalProb * (14 + 2 * (object.power ?? 0) + (object.toughness ?? 0));
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
        const target = cmd.targetId ? objectOnBoard(view, cmd.targetId) : null;
        if (!target) return finish(0);
        const value = (target.power ?? 0) * 2 + (target.toughness ?? 0);
        return finish(40 - value);
      }
      case 'resolve_food_choice': {
        // Insatiable Appetite: poświęć Food (+5/+5) albo nie (+3/+3).
        // Bot poświęca Food, jeśli ma (większy buff).
        return finish(cmd.sacrifice ? 50 : 30);
      }
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
        return finish(Math.max(6, 40 - 3 * (cmd.xValue ?? 0)));
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
        return finish(60 - freeCastTargetPenalty(view, madnessCard?.spell?.effects ?? [], cmd));
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

  function summarize(cmd) {
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
    if (cmd.type === 'cast_spell' || cmd.type === 'cast_cleave' || cmd.type === 'cast_permanent' || cmd.type === 'cast_adventure' || cmd.type === 'cast_adventure_creature') return `${cmd.type}(${cmd.objectId}${cmd.targets ? '->' + cmd.targets.join('+') : ''})`;
    // M195/B: aktywacja zdolności bez ŹRÓDŁA i CELU była w śladzie nieczytelna
    // („activate_ability" × N) — nie dało się odróżnić buffu sojusznika od
    // tapnięcia samego siebie ani w diagnostyce, ani w teście wyceny.
    if (cmd.type === 'activate_ability') {
      return `activate_ability(${cmd.objectId}#${cmd.abilityIndex ?? 0}${(cmd.targets ?? []).length ? '->' + cmd.targets.join('+') : ''})`;
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
      history.push({
        turn: view.turn.number, step: view.turn.step,
        chosen: summarize(pick.cmd), score: pick.score,
        options: scored.map((entry) => ({ cmd: summarize(entry.cmd), score: entry.score })),
      });
      return pick.cmd;
    },
    /** Ślad uzasadnień punktowych — diagnostyka decyzji bota. */
    trace() {
      return history.map((entry) => ({ ...entry, options: entry.options.map((o) => ({ ...o })) }));
    },
  });
}
