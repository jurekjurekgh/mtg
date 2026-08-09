import { event } from '../protocol/types.js';
import { effectiveKeywords, effectivePower, tapObject } from './permanents.js';
import { producibleMana, spendMana, canPayColoredCost } from './resources.js';
import { moveObjectDirectly } from './objects.js';
import { addCounter, removeCounter } from './counters.js';
import { applyEffect } from './effects.js';
import { validateTargets, hasHexproofAgainst } from './spells.js';
import { attachEquipmentToCreature } from './attachments.js';
import { shuffle } from './shuffle.js';
import { addRegenerationShield } from './state-based.js';

/**
 * Framework activated / triggered / static abilities.
 *
 * Część danych (definicje zdolności, deskryptory) jest we frameworku,
 * a część wykonawcza (aktywacja w stanie gry) tu. Typy zdolności i fabryki
 * definicji pozostają wielokrotnego użytku; efekt zdolności używa tego samego
 * deskryptora co czary (damage / pump / create_token / gain_life / liczniki),
 * więc interpretację zapewnia wspólny `applyEffect`.
 */
export const ABILITY_TYPE = Object.freeze({ activated: 'activated', triggered: 'triggered', static: 'static' });

/** Speed gracza (DFT „Start your engines!"): 0..4. */
function playerSpeed(state, playerId) {
  return state.players.find((pl) => pl.id === playerId)?.speed ?? 0;
}

/**
 * Warunek zdolności „Max speed" (Glitch Ghost Surveyor): zdolność można
 * aktywować dopiero przy speed 4. Wspólne dla oferty i walidacji.
 */
function maxSpeedHolds(state, playerId, ability) {
  if (ability?.condition?.maxSpeed !== true) return true;
  return playerSpeed(state, playerId) >= 4;
}

/**
 * Efektywny koszt many zdolności aktywowanej z redukcją (Deepwood Denizen:
 * "This ability costs {1} less to activate for each +1/+1 counter on
 * creatures you control"). Redukcja dotyczy części generycznej, nie
 * schodzi poniżej liczby kolorowych pipów.
 */
export function effectiveAbilityManaCost(state, playerId, ability, sourceObject) {
  const base = ability?.cost?.mana ?? 0;
  const reduction = ability?.costReduction;
  if (!reduction) return base;
  if (reduction.perCounter === '+1/+1') {
    let counters = 0;
    for (const id of state.zones.battlefield) {
      const obj = state.objects.get(id);
      if (!obj || obj.zone !== 'battlefield' || obj.kind !== 'creature' || obj.controllerId !== playerId) continue;
      counters += (obj.counters?.['+1/+1'] ?? 0);
    }
    const totalReduction = counters * (reduction.amount ?? 1);
    const colored = (ability.cost?.colors ?? []).length;
    return Math.max(colored, base - totalReduction);
  }
  return base;
}

export function createAbility({ type, cost = null, effect, trigger, keyword = null, targets = null, cycling = null, channel = null, condition = null, pump = null, keywords = null, timing = 'instant', oncePerTurn = false, mustAttack = false, scope = null, costModifier = null, costReduction = null, fromGraveyard = false, cantAttackAlone = false, cantBlockAlone = false, cantAttackUnlessDefenderHasFlying = false }) {
  if (!Object.values(ABILITY_TYPE).includes(type)) throw new TypeError('Nieprawidłowy typ zdolności');
  if (!['instant', 'sorcery'].includes(timing)) throw new RangeError('Nieprawidłowa szybkość zdolności');
  const effects = Array.isArray(effect)
    ? Object.freeze(effect.map((entry) => Object.freeze({ ...entry })))
    : Object.freeze(effect ?? {});
  return Object.freeze({
    type,
    timing,
    keyword: keyword ?? null,
    cost: cost ? Object.freeze({ ...cost }) : null,
    effect: effects,
    trigger: trigger ? Object.freeze(trigger) : null,
    targets: targets ? Object.freeze(targets.map((spec) => Object.freeze({ ...spec }))) : null,
    // Cycling (CR 702.28): deskryptor kwalifikacji poszukiwanej karty
    // ({ types: [...] } albo { subtypes: [...] }); obecność oznacza zdolność
    // aktywowaną z ręki — koszt many + odrzucenie tej karty (koszt).
    cycling: cycling ? Object.freeze({ ...cycling }) : null,
    // Zdolność statyczna (CR 604): warunek + buff, przeliczane przy każdym
    // odczycie statystyk (permanents.staticBonuses) — nie „do końca tury".
    condition: condition ? Object.freeze({ ...condition }) : null,
    pump: pump ? Object.freeze({ ...pump }) : null,
    keywords: keywords ? Object.freeze([...keywords]) : null,
    // „Activate only once each turn\" (Snarling Wolf): limit aktywacji tej
    // zdolności do raz na turę na źródło (tracking w state.abilityActivatedThisTurn).
    oncePerTurn: Boolean(oncePerTurn),
    // „This creature attacks each combat if able\" (Ramroller, Juggernaut):
    // statyczny wymóg ataku — combat traktuje go jak stały goad (CR 508.1c).
    mustAttack: Boolean(mustAttack),
    cantAttackUnlessDefenderHasFlying: Boolean(cantAttackUnlessDefenderHasFlying),
    // „This creature can't attack/block alone" (Ember Beast, CR 508.1d/509.1c):
    // statyczne ograniczenia deklaracji — walidacja w declareAttackers/
    // declareBlockers (inny atakujący/blokujący tego samego celu wymagany).
    cantAttackAlone: Boolean(cantAttackAlone),
    cantBlockAlone: Boolean(cantBlockAlone),
    // Zasięg zdolności statycznej (CR 604): domyślnie (brak scope) buff
    // dotyczy samego źródła. `scope: { affects: 'other_creatures_you_control' }`
    // to hymn (Trostani Discordant: „Other creatures you control get +1/+1\")
    // — buff liczy permanents.anthemBonuses dla każdego objektu pasującego
    // do predykatu (inny stwór tego samego kontrolera).
    scope: scope ? Object.freeze({ ...scope }) : null,
    // Modyfikator kosztu czarów (CR 601.2f, Etherium Sculptor: „Artifact
    // spells you cast cost {1} less to cast"): statyczny deskryptor
    // { spellTypes: ['Artifact'], amount: 1 } — obniżka dotyczy klasy czarów
    // kontrolera źródła i redukuje WYŁĄCZNIE część generyczną kosztu
    // (mana-cost.costReductionForSpell/reduceGenericCost).
    costModifier: costModifier ? Object.freeze({ ...costModifier }) : null,
    costReduction: costReduction ? Object.freeze({ ...costReduction }) : null,
    channel: channel ? Object.freeze({ ...channel }) : null,
    fromGraveyard: Boolean(fromGraveyard),
  });
}

export function isActivated(ability) { return ability?.type === ABILITY_TYPE.activated; }
export function isTriggered(ability) { return ability?.type === ABILITY_TYPE.triggered; }
export function isStatic(ability) { return ability?.type === ABILITY_TYPE.static; }

/**
 * Legalne aktywacje dla gracza: każda zdolność aktywowana na kontrolowanym
 * permanencie, której koszt da się opłacić. Zwraca { objectId, abilityIndex,
 * ability, targets?, xValue? } — `targets` dla zdolności z jawnymi celami,
 * `xValue` dla kosztów zmiennych ({X}).
 *
 * Dwa szczególne przypadki:
 * - **Ninjutsu** — zdolność aktywowana karty w RĘCE; dostępna w oknie combat
 *   (krok combat_damage, przed rozstrzygnięciem), gdy gracz kontroluje
 *   nieblokowanego atakującego. Zwraca dodatkowo `attackerId` do zwrotu.
 * - **Megamorph** — zdolność aktywowana face-down permanentu (obrócenie
 *   twarzą do góry za koszt megamorph); wpięta w obiekt przy zagraniu
 *   twarzą w dół (resources.castPermanent).
 */

/**
 * Mana dostępna na daną aktywację: produkowalna pula MINUS 1, gdy źródło jest
 * nietapniętym landowym źródłem many i koszt zawiera {T} — land nie może dać
 * many na własny koszt tapu (CR 601.2h: stała musi być odkręcona w chwili
 * płatności; np. Prismari Campus „{4}, {T}: Scry 1" nie płaci sam sobie).
 * Wspólna funkcja oferty (legalActivatedAbilities) i walidacji (activateAbility),
 * żeby oferowana komenda zawsze była akceptowana.
 */
function manaForActivation(state, playerId, object, ability, baseMana = producibleMana(state, playerId)) {
  const isLandManaSource = object.kind === 'land' || (object.types ?? []).includes('Land');
  if (ability.cost?.tap && !object.tapped && isLandManaSource) return baseMana - 1;
  return baseMana;
}

/**
 * Kolorowe wymagania kosztu zdolności aktywowanej (CR 118.2/601.2f): deskryptor
 * `cost.colors` niesie pipy kolorów (Boros Challenger {2}{R}{W} → ['R','W']).
 * Zwraca listę wymagań w formacie spendMana (każdy pip = [kolor]).
 */
function colorRequirementsOf(cost) {
  return (cost?.colors ?? []).map((color) => [color]);
}

/**
 * CR 302.6 (choroba przywołania): stwór, który nie jest pod kontrolą gracza
 * od początku jego ostatniej tury (albo nie ma haste), nie może aktywować
 * zdolności z {T} w koszcie. Dotyczy WSZYSTKICH zdolności — także many
 * (land creature, Apprentice Wizard). Artefakty/enchantmenty nie są stworami.
 */
function tapBlockedBySummoningSickness(state, object, ability) {
  if (!ability?.cost?.tap) return false;
  const isCreature = object.kind === 'creature' || (object.types ?? []).includes('Creature');
  if (!isCreature) return false;
  if (!object.summoningSickness) return false;
  return !effectiveKeywords(object, state).includes('haste');
}

/** Limit oferowanych podzbiorów crew (jak COMBAT_OPTION_CAP w combacie). */
const CREW_OPTION_CAP = 32;

/**
 * Legalne podzbiory stworów do kosztu crew (CR 701.36): „Tap any number of
 * creatures you control with total power N or more". Deterministycznie
 * (ADR 0005): pierwszy jest minimalny zachłanny podzbiór (najsłabsze stwory
 * w kolejności bitwiska — boty biorą najtańszy tap), potem pozostałe
 * podzbiory (maski bitowe w kolejności rosnącej liczności) do limitu.
 */
function legalCrewSubsets(state, crewableIds, neededPower) {
  if (crewableIds.length === 0) return [];
  const powerOf = (id) => effectivePower(state.objects.get(id), state) ?? 0;
  const ordered = [...crewableIds].sort((a, b) => powerOf(a) - powerOf(b));
  const totalPower = ordered.reduce((sum, id) => sum + powerOf(id), 0);
  if (totalPower < neededPower) return [];
  const out = [];
  // Minimalny zachłanny podzbiór — zawsze pierwszy.
  const greedy = [];
  let acc = 0;
  for (const id of ordered) {
    if (acc >= neededPower) break;
    greedy.push(id);
    acc += powerOf(id);
  }
  if (acc >= neededPower) out.push(greedy);
  const key = (subset) => JSON.stringify(subset);
  const seen = new Set(out.map(key));
  const n = ordered.length;
  if (n <= 6) {
    for (let mask = 1; mask < (1 << n) && out.length < CREW_OPTION_CAP; mask += 1) {
      const subset = [];
      let sum = 0;
      for (let i = 0; i < n; i += 1) {
        if (mask & (1 << i)) {
          subset.push(ordered[i]);
          sum += powerOf(ordered[i]);
        }
      }
      if (sum >= neededPower && !seen.has(key(subset))) {
        seen.add(key(subset));
        out.push(subset);
      }
    }
  }
  return out;
}

export function legalActivatedAbilities(state, playerId) {
  const out = [];
  const player = state.players.find((p) => p.id === playerId);
  // Oferta po manie produkowalnej (pula + nietapnięte landy): zdolność jest
  // dostępną akcją od razu, a aktywacja sama do-tapuje landy (spendMana).
  const baseMana = producibleMana(state, playerId);
  const sorcerySpeed = state.turn.activePlayerId === playerId
    && ['precombat_main', 'postcombat_main'].includes(state.turn.phase)
    && state.zones.stack.length === 0;
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId) continue;
    for (let index = 0; index < (object.abilities ?? []).length; index += 1) {
      const ability = object.abilities[index];
      if (ability?.type !== ABILITY_TYPE.activated) continue;
      // Zdolność „z grobu" (Goldmeadow Nomad: „Exile this card from your
      // graveyard") działa WYŁĄCZNIE z grobu — na bitwisku nie jest oferowana
      // (oferta z grobu jest niżej; spójność oferty i walidacji).
      if (ability.fromGraveyard) continue;
      // Mana dostępna na TĘ aktywację: koszt {T} wyklucza samo źródło z
      // auto-tapu (CR 601.2h — stała musi być odkręcona w chwili płatności,
      // więc land-źródło z kosztem {T} nie może dać many na własną aktywację,
      // np. Prismari Campus „{4}, {T}: Scry 1").
      const mana = manaForActivation(state, playerId, object, ability, baseMana);
      // „Activate only once each turn\" (Snarling Wolf): po aktywacji zdolność
      // znika z legalnych akcji do końca tury (stan resetowany przy zmianie tury).
      if (ability.oncePerTurn && state.abilityActivatedThisTurn?.[`${id}:${index}`]) continue;
      if (ability.timing === 'sorcery' && !sorcerySpeed) continue;
      // Ninjutsu działa wyłącznie z ręki — na bitwisku nie ma czego aktywować.
      if (ability.keyword === 'ninjutsu') continue;
      // Cycling również działa wyłącznie z ręki (CR 702.28a) — na bitwisku
      // ta zdolność jest martwa; oferowanie jej kończy się odrzuceniem legalnej
      // z pozoru komendy (execute krzyczy „Cycling aktywuje się z ręki").
      if (ability.cycling) continue;
      // Channel (CR 702.85a, Greater Tanuki) — jak cycling: zdolność karty
      // w RĘCE; na bitwisku jest martwa. Bez tego bota oferowano channel z
      // bitwiska i execute odrzucał „Channel aktywuje się z ręki" (regresja
      // benchmarku B0 po dodaniu Greater Tanuki do talii green).
      if (ability.channel) continue;
      // Megamorph (obrócenie twarzą do góry) działa tylko, póki permanent
      // leży twarzą w dół; po obrocie zdolność wygasa.
      if ((ability.keyword === 'megamorph' || ability.keyword === 'morph') && !object.faceDown) continue;
      // Craft wymaga innego artefaktu do wygnania (z battlefield lub graveyard).
      if (ability.keyword === 'craft') {
        const hasOtherArtifact = state.zones.battlefield.some((bfId) => {
          const bf = state.objects.get(bfId);
          return bf && bf.id !== id && bf.controllerId === playerId
            && (bf.kind === 'artifact' || (bf.types ?? []).includes('Artifact'));
        }) || state.zones.graveyard.some((gId) => {
          const g = state.objects.get(gId);
          return g && g.controllerId === playerId
            && (g.kind === 'artifact' || (g.types ?? []).includes('Artifact'));
        });
        if (!hasOtherArtifact) continue;
      }
      // Equip aktywuje się jako sorcery (CR 702.6b) i celuje we własne stwory
      // (CR 702.6a). Koszt pochodzi z deskryptora equipment — jednego źródła,
      // które napędza też buff nosiciela.
      if (ability.keyword === 'equip') {
        if (!object.equipment || !sorcerySpeed) continue;
        if ((object.equipment.equip ?? 0) > mana) continue;
        if (!canPayColoredCost(state, playerId, colorRequirementsOf({ colors: object.equipment.colors ?? [] }))) continue;
        for (const targetId of state.zones.battlefield) {
          const target = state.objects.get(targetId);
          // CR 702.6a: equipment nie może wyposażyć SAMEGO SIEBIE — oferta
          // i walidacja muszą być spójne (animowany artefakt-sprzęt bywa
          // stworzeniem, więc sam mógłby trafić do kandydatów).
          if (target?.zone === 'battlefield' && target.kind === 'creature'
            && target.controllerId === playerId && target.id !== id) {
            out.push({ objectId: id, abilityIndex: index, ability, targets: [targetId] });
          }
        }
        continue;
      }
      if (ability.cost?.tap && object.tapped) continue;
      // Choroba przywołania (CR 302.6): stwór bez haste nie aktywuje {T}
      // w turze wejścia — oferta i walidacja spójne.
      if (tapBlockedBySummoningSickness(state, object, ability)) continue;
      // Dodatkowy koszt „Tap an untapped creature you control" (Holdout
      // Settlement): zdolność dostępna tylko, gdy gracz ma nietapniętego
      // stwora do tapnięcia (nie może to być samo źródło-land).
      if (ability.cost?.tapCreature) {
        const candidates = state.zones.battlefield.filter((objectId) => {
          const candidate = state.objects.get(objectId);
          return candidate?.controllerId === playerId && candidate.kind === 'creature' && !candidate.tapped;
        });
        if (candidates.length === 0) continue;
        if ((ability.cost?.mana ?? 0) > mana) continue;
        if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
        for (const tapId of candidates) {
          out.push({ objectId: id, abilityIndex: index, ability, tapCreatureId: tapId });
        }
        continue;
      }
      // Koszt „Tap ANOTHER creature you control" (Station, Wedgelight
      // Rammer): jak wyżej, ale zatapniany stwór NIE może być źródłem —
      // odróżnia go „another\" w tekście karty (CR 601.2h).
      if (ability.cost?.tapOtherCreature) {
        const candidates = state.zones.battlefield.filter((objectId) => {
          const candidate = state.objects.get(objectId);
          return candidate?.controllerId === playerId && candidate.id !== id
            && candidate.kind === 'creature' && !candidate.tapped;
        });
        if (candidates.length === 0) continue;
        if ((ability.cost?.mana ?? 0) > mana) continue;
        if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
        for (const tapId of candidates) {
          out.push({ objectId: id, abilityIndex: index, ability, tapOtherCreatureId: tapId });
        }
        continue;
      }
      // Crew (CR 701.36, Irontread Crusher): „Tap any number of creatures you
      // control with total power N or more: This Vehicle becomes an artifact
      // creature until end of turn." Koszt to wybór stworów (crewCreatureIds);
      // oferujemy podzbiory o łącznej mocy >= N, a efekt animuje źródło.
      if (ability.cost?.crewPower) {
        const crewables = state.zones.battlefield.filter((objectId) => {
          const candidate = state.objects.get(objectId);
          return candidate && candidate.id !== id && candidate.controllerId === playerId
            && candidate.kind === 'creature' && !candidate.tapped;
        });
        for (const subset of legalCrewSubsets(state, crewables, ability.cost.crewPower)) {
          out.push({ objectId: id, abilityIndex: index, ability, crewCreatureIds: subset });
        }
        continue;
      }
      // Dodatkowy koszt „Discard a card" (Goblin Picker): wymaga karty w ręce.
      if (ability.cost?.discardCard) {
        const hasHandCard = state.zones.hand.some((handId) => state.objects.get(handId)?.controllerId === playerId);
        if (!hasHandCard) continue;
      }
      // Dodatkowy koszt „Discard N cards" (Plague Reaver: „Discard two
      // cards"): wymaga co najmniej N kart w ręce.
      if (ability.cost?.discardCards) {
        const handCount = state.zones.hand.filter((handId) => state.objects.get(handId)?.controllerId === playerId).length;
        if (handCount < ability.cost.discardCards) continue;
      }
      // Dodatkowy koszt „Remove a counter" (Trigon of Corruption): źródło musi
      // mieć odpowiedni licznik (np. charge).
      if (ability.cost?.removeCounter) {
        const rc = ability.cost.removeCounter;
        if ((object.counters?.[rc.name] ?? 0) < (rc.amount ?? 1)) continue;
      }
      const targetSpec = ability.targets ?? [];
      if (targetSpec.length === 1 && targetSpec[0].type === 'land_you_control') {
        // Cel „land you control": wszystkie własne landy (także land creatures).
        if ((ability.cost?.mana ?? 0) > mana) continue;
        if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
        for (const targetId of state.zones.battlefield) {
          const target = state.objects.get(targetId);
          const isLand = target && (target.kind === 'land' || (target.types ?? []).includes('Land'));
          if (isLand && target.controllerId === playerId) {
            out.push({ objectId: id, abilityIndex: index, ability, targets: [targetId] });
          }
        }
        continue;
      }
      if (targetSpec.length === 0) {
        const effManaNoTarget = effectiveAbilityManaCost(state, playerId, ability, object);
        if (effManaNoTarget > mana) continue;
        if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
        out.push({ objectId: id, abilityIndex: index, ability });
        continue;
      }
      // {X} z warunkiem „target creature with power X or less" (Entrancing
      // Lyre — Temat 10): X wybiera GRACZ. Oferujemy każdy X od 1 do
      // dostępnej many (cap 20), a dla każdego X — wszystkie stwory o mocy
      // ≤ X. Wcześniej X było sztywno równe mocy celu (najtańsze legalne).
      if (ability.cost?.manaX && ability.cost?.maxPowerX) {
        // X ograniczony dostępną maną (mana = manaForActivation — z kosztem
        // {T} źródła-landa odjętym). Z zerową maną brak ofert.
        const maxX = Math.min(mana, 20);
        for (let x = 1; x <= maxX; x += 1) {
          for (const targetId of state.zones.battlefield) {
            const target = state.objects.get(targetId);
            if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') continue;
            if (target.controllerId !== playerId && targetSpec[0]?.type !== 'creature') continue;
            const power = effectivePower(target, state) ?? 0;
            if (power > x) continue;
            out.push({ objectId: id, abilityIndex: index, ability, targets: [targetId], xValue: x });
          }
        }
        continue;
      }
      // Zdolność z celami: enumerujemy legalne cele. Dla kosztu {X} X to
      // minimalna wartość pozwalająca na dany cel (np. moc stwora u Liry).
      const graveTarget = targetSpec.length === 1 && ['card_in_graveyard', 'creature_card_in_graveyard'].includes(targetSpec[0].type);
      const ownCreatureTarget = targetSpec.length === 1 && targetSpec[0].type === 'creature_you_control';
      // Cel „target opponent" (Plague Reaver — ping-pong pod kontrolę):
      // kandydatem jest każdy gracz poza kontrolerem źródła; „target player"
      // (Cellar Door — „Target player mills 1") obejmuje OBU graczy. Bez tego
      // zdolność z celem-graczem nigdy nie była oferowana (soft-gap: batch22
      // aktywował Cellar Door tylko bezpośrednimi komendami w testach).
      const opponentTarget = targetSpec.length === 1 && targetSpec[0].type === 'opponent';
      const anyPlayerTarget = targetSpec.length === 1 && targetSpec[0].type === 'player';
      const candidates = opponentTarget
        ? state.players.filter((entry) => entry.id !== playerId).map((entry) => entry.id)
        : anyPlayerTarget
        ? state.players.map((entry) => entry.id)
        : graveTarget
        ? state.zones.graveyard.filter((objectId) => {
          const target = state.objects.get(objectId);
          if (!target || target.controllerId !== playerId) return false;
          return targetSpec[0].type === 'card_in_graveyard' || target.kind === 'creature';
        })
        : state.zones.battlefield.filter((objectId) => {
          const target = state.objects.get(objectId);
          if (target?.zone !== 'battlefield' || target.kind !== 'creature') return false;
          // „Target creature you control\" (Guidestone Compass): only own creatures.
          if (ownCreatureTarget && target.controllerId !== playerId) return false;
          // Hexproof (CR 702.11): zdolność nie może celować w permanent przeciwnika
          // z hexproof — oferta spójna z walidacją (validateTargets).
          if (!ownCreatureTarget && hasHexproofAgainst(state, target, playerId)) return false;
          return true;
        });
      if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
      for (const targetId of candidates) {
        const target = state.objects.get(targetId);
        const xValue = ability.cost?.manaX && target ? (effectivePower(target, state) ?? 0) : undefined;
        const cost = xValue !== undefined ? xValue : (ability.cost?.mana ?? 0);
        if (cost > mana) continue;
        out.push({ objectId: id, abilityIndex: index, ability, targets: [targetId], xValue });
      }
    }
  }
  // Cycling (CR 702.28) — zdolność aktywowana karty w RĘCE z szybkością
  // instanta (dostępna z priorytetem, niezależnie od fazy). Koszt: mana;
  // odrzucenie karty jest częścią kosztu rozpatrywaną przy aktywacji.
  for (const id of state.zones.hand) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId) continue;
    for (let index = 0; index < (object.abilities ?? []).length; index += 1) {
      const ability = object.abilities[index];
      if (ability?.type !== ABILITY_TYPE.activated || !ability.cycling) continue;
      if ((ability.cost?.mana ?? 0) > baseMana) continue;
      if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
      out.push({ objectId: id, abilityIndex: index, ability });
    }
  }
  // Channel (CR 702.85, Greater Tanuki) — jak cycling: zdolność karty w RĘCE,
  // koszt many + discard, efekt search. Rozpatrywane tak samo (priorytet instant).
  for (const id of state.zones.hand) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId) continue;
    for (let index = 0; index < (object.abilities ?? []).length; index += 1) {
      const ability = object.abilities[index];
      if (ability?.type !== ABILITY_TYPE.activated || !ability.channel) continue;
      const effManaChannel = effectiveAbilityManaCost(state, playerId, ability, object);
      if (effManaChannel > baseMana) continue;
      if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
      out.push({ objectId: id, abilityIndex: index, ability });
    }
  }
  // Aktywowane z GROBU (Goldmeadow Nomad: "{W}, Exile this card from your
  // graveyard: Create a 1/1 Kithkin token. Activate only as a sorcery.").
  for (const id of state.zones.graveyard) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId) continue;
    for (let index = 0; index < (object.abilities ?? []).length; index += 1) {
      const ability = object.abilities[index];
      if (ability?.type !== ABILITY_TYPE.activated || !ability.fromGraveyard) continue;
      if (ability.timing === 'sorcery' && !sorcerySpeed) continue;
      if (!maxSpeedHolds(state, playerId, ability)) continue;
      if ((ability.cost?.mana ?? 0) > baseMana) continue;
      if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
      out.push({ objectId: id, abilityIndex: index, ability });
    }
  }
  const ninjutsuWindow = state.turn.step === 'combat_damage' && state.combat
    && state.turn.activePlayerId === playerId && state.turn.priorityPlayerId === playerId;
  if (ninjutsuWindow) {
    const unblocked = state.combat.attackers.filter((id) => {
      const object = state.objects.get(id);
      const blocked = state.combat.blockedAttackers?.has(id)
        ?? ((state.combat.blockers.get(id)?.length ?? 0) > 0);
      return object?.controllerId === playerId && !blocked;
    });
    for (const id of state.zones.hand) {
      const object = state.objects.get(id);
      if (object?.controllerId !== playerId || object.kind !== 'creature') continue;
      for (let index = 0; index < (object.abilities ?? []).length; index += 1) {
        const ability = object.abilities[index];
        if (ability?.type !== ABILITY_TYPE.activated || ability.keyword !== 'ninjutsu') continue;
        if ((ability.cost?.mana ?? 0) > baseMana) continue;
        for (const attackerId of unblocked) out.push({ objectId: id, abilityIndex: index, attackerId });
      }
    }
  }
  return out;
}

/**
 * Aktywuje zdolność: płaci koszt (tap / mana, w tym zmienne {X}) i wykonuje
 * efekt na sobie (lub na jawnych celach, gdy deskryptor je niesie). Rzuca
 * błąd przy nielegalnym obiekcie lub nieopłacalnym koszcie — execute zamienia
 * go na maszynowe odrzucenie. `attackerId` jest wymagany wyłącznie dla
 * Ninjutsu; `targets` i `xValue` dla zdolności celowanych/{X}.
 */
export function activateAbility(state, playerId, objectId, abilityIndex, attackerId, targets, xValue, crewCreatureIds, tapCreatureId, tapOtherCreatureId) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId) throw new Error('Nielegalny obiekt zdolności');
  const ability = (object.abilities ?? [])[abilityIndex];
  if (!ability || ability.type !== ABILITY_TYPE.activated) throw new Error('Nieznana zdolność aktywowana');
  if (ability.timing === 'sorcery') {
    const sorcerySpeed = state.turn.activePlayerId === playerId
      && ['precombat_main', 'postcombat_main'].includes(state.turn.phase)
      && state.zones.stack.length === 0;
    if (!sorcerySpeed) throw new Error('Zdolność tylko w swoją fazę main przy pustym stosie');
  }

  if (ability.keyword === 'ninjutsu') {
    return activateNinjutsu(state, playerId, object, abilityIndex, ability, attackerId);
  }
  if (ability.cycling) {
    return activateCycling(state, playerId, object, abilityIndex, ability);
  }
  if (ability.channel) {
    return activateChannel(state, playerId, object, abilityIndex, ability);
  }
  if (ability.keyword === 'equip') {
    return activateEquip(state, playerId, object, abilityIndex, targets);
  }
  // Max speed (DFT, Glitch Ghost Surveyor): zdolność z grobu aktywna dopiero
  // przy speed 4 — spójnie z ofertą (legalActivatedAbilities).
  if (!maxSpeedHolds(state, playerId, ability)) {
    throw new Error('Zdolność wymaga max speed (4)');
  }

  // Zdolność „z grobu" (Goldmeadow Nomad) wymaga, by źródło było W GROBIE —
  // na bitwisku taka zdolność nie istnieje (CR 113.6: zdolność karty działa
  // w strefie, z której jej tekst to przewiduje). Zwykłe zdolności aktywowane
  // wymagają permanenta na bitwisku.
  if (ability.fromGraveyard) {
    if (object.zone !== 'graveyard') throw new Error('Zdolność z grobu wymaga źródła w grobie');
  } else if (object.zone !== 'battlefield') {
    throw new Error('Zdolność wymaga permanenta na bitwisku');
  }
  // Morph/megamorph (CR 702.36/702.37): obrót twarzą do góry działa tylko,
  // póki permanent leży twarzą w dół — po obrocie zdolność wygasa. Walidacja
  // spójna z ofertą legalCommands (wcześniej lukę maskował throw w
  // turnFaceUp — „nielegalność" wychodziła dopiero z aplikacji efektu).
  if ((ability.keyword === 'morph' || ability.keyword === 'megamorph') && !object.faceDown) {
    throw new Error('Karta nie leży twarzą w dół');
  }
  const cost = ability.cost ?? {};
  // Specyfikacja celu „land you control" niesie kontrolera dopiero w chwili
  // aktywacji (deskryptor karty nie zna graczy — ADR 0002).
  const targetSpec = (ability.targets ?? []).map((spec) => (spec.type === 'land_you_control'
    ? { ...spec, controllerId: playerId } : spec));
  let chosenTargets = [];
  if (targetSpec.length > 0) {
    if (!Array.isArray(targets) || targets.length !== targetSpec.length) throw new Error('Nieprawidłowa liczba celów zdolności');
    chosenTargets = validateTargets(state, targetSpec, targets, playerId).map((entry) => entry.id);
  }
  // Koszty płacimy atomowo (CR 601.2h): najpierw sprawdzamy wykonalność
  // WSZYSTKICH części, dopiero potem mutujemy stan. Bez tego nieudana
  // aktywacja (np. brak many na {U}) zostawiała permanent zatapniony.
  const effManaPreview = effectiveAbilityManaCost(state, playerId, ability, object);
  const manaCostPreview = cost.manaX ? (xValue ?? 0) : effManaPreview;
  const player = state.players.find((entry) => entry.id === playerId);
  // Opłacalność po manie produkowalnej (z wyłączeniem źródła przy koszcie {T}
  // — jak w ofercie) — spendMana sam do-tapuje pozostałe landy.
  if (manaCostPreview > manaForActivation(state, playerId, object, ability)) throw new Error('Niewystarczająca mana');
  // Kolorowe wymagania kosztu (CR 118.2): pipy muszą być pokryte kolorową pulą
  // lub nietapniętymi źródłami PRZED mutacją (CR 601.2h — jak czary).
  const colorReqs = colorRequirementsOf(cost);
  if (colorReqs.length > 0 && !canPayColoredCost(state, playerId, colorReqs)) {
    throw new Error('Brak kolorowego źródła many');
  }
  if (cost.tap && object.tapped) throw new Error('Obiekt jest już tapped');
  // Atomowa weryfikacja dodatkowych kosztów (CR 601.2h): discard a card +
  // remove a counter — sprawdzane PRZED mutacją, żeby nieudana aktywacja nie
  // zostawiła źródła zatapniętego/bez licznika. Koszty tap-other/crew są
  // walidowane i wykonywane w performActivation (wspólna ścieżka aktywacji).
  if (cost.discardCard) {
    const hasHandCard = state.zones.hand.some((handId) => state.objects.get(handId)?.controllerId === playerId);
    if (!hasHandCard) throw new Error('Brak karty do odrzucenia (koszt)');
  }
  if (cost.discardCards) {
    const handCount = state.zones.hand.filter((handId) => state.objects.get(handId)?.controllerId === playerId).length;
    if (handCount < cost.discardCards) throw new Error(`Brak ${cost.discardCards} kart do odrzucenia (koszt)`);
  }
  if (cost.removeCounter) {
    const rc = cost.removeCounter;
    if ((object.counters?.[rc.name] ?? 0) < (rc.amount ?? 1)) throw new Error(`Brak licznika ${rc.name} (koszt)`);
  }
  // Koszt „Discard a card" (Goblin Picker) / „Discard N cards" (Plague
  // Reaver) — Temat 4 (CR 701.18): KONTROLER wybiera karty z ręki. Blokująca
  // decyzja resolve_discard_choice; cała aktywacja czeka (pendingAbilityActivation)
  // i wykonuje się po dokończeniu wyborów (koszty atomowo, jak dotąd).
  const discardCount = cost.discardCard ? 1 : (cost.discardCards ?? 0);
  if (discardCount > 0) {
    const handIds = state.zones.hand.filter((handId) => state.objects.get(handId)?.controllerId === playerId);
    state.pendingDiscardChoice = {
      playerId, count: discardCount, handIds, purpose: 'cost',
      sourceCardId: object.cardId, restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.pendingAbilityActivation = {
      playerId, objectId, abilityIndex, attackerId, targets, xValue, crewCreatureIds, tapCreatureId, tapOtherCreatureId,
    };
    state.turn.priorityPlayerId = playerId;
    const e = event('discard_choice_required', {
      playerId, count: discardCount, cardIds: [...handIds], purpose: 'cost',
      sourceCardId: object.cardId,
    });
    state.events.push(e);
    return e;
  }
  return performActivation(state, { playerId, objectId, abilityIndex, attackerId, targets, xValue, crewCreatureIds, tapCreatureId, tapOtherCreatureId });
}

/**
 * Wykonuje aktywację po walidacji (używane też po dokończeniu blokującej
 * decyzji kosztu-discard — Temat 4): płaci koszty atomowo (CR 601.2h),
 * aplikuje efekty i emituje ability_activated. Źródło/cel czyta ŚWIEŻO ze
 * stanu (między walidacją a wykonaniem mogła zajść decyzja gracza). Zwraca
 * zdarzenie ability_activated (albo null).
 */
export function performActivation(state, ctx) {
  const { playerId, objectId, abilityIndex, attackerId, targets, xValue, crewCreatureIds, tapCreatureId, tapOtherCreatureId } = ctx;
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId) throw new Error('Nielegalny obiekt zdolności');
  const ability = (object.abilities ?? [])[abilityIndex];
  if (!ability || ability.type !== ABILITY_TYPE.activated) throw new Error('Nieznana zdolność aktywowana');
  if (ability.fromGraveyard) {
    if (object.zone !== 'graveyard') throw new Error('Zdolność z grobu wymaga źródła w grobie');
  } else if (object.zone !== 'battlefield') {
    throw new Error('Zdolność wymaga permanenta na bitwisku');
  }
  const cost = ability.cost ?? {};
  const colorReqs = colorRequirementsOf(cost);
  const targetSpec = (ability.targets ?? []).map((spec) => (spec.type === 'land_you_control'
    ? { ...spec, controllerId: playerId } : spec));
  let chosenTargets = [];
  if (targetSpec.length > 0) {
    if (!Array.isArray(targets) || targets.length !== targetSpec.length) throw new Error('Nieprawidłowa liczba celów zdolności');
    chosenTargets = validateTargets(state, targetSpec, targets, playerId).map((entry) => entry.id);
    // {X} z warunkiem „power X or less" (Entrancing Lyre, Temat 10): cel musi
    // mieć moc ≤ wybranego X — oferta i walidacja spójne.
    if (cost.manaX && cost.maxPowerX) {
      const x = xValue ?? 0;
      for (const targetId of chosenTargets) {
        const target = state.objects.get(targetId);
        const power = target ? (effectivePower(target, state) ?? 0) : Number.POSITIVE_INFINITY;
        if (power > x) throw new Error(`X (${x}) za małe dla mocy celu (${power})`);
      }
    }
  }
  // Sprawdzamy dodatkowy koszt przed jakąkolwiek mutacją (CR 601.2h):
  // nieudana aktywacja nie może zostawić źródła zatapniętego.
  const creatureToTap = cost.tapCreature
    ? (ctx.tapCreatureId ?? state.zones.battlefield.find((objectId) => {
      const candidate = state.objects.get(objectId);
      return candidate?.controllerId === playerId && candidate.kind === 'creature' && !candidate.tapped;
    }))
    : null;
  if (cost.tapCreature && !creatureToTap) throw new Error('Brak nietapniętego stwora do kosztu tap');
  if (cost.tapCreature && ctx.tapCreatureId) {
    const chosen = state.objects.get(ctx.tapCreatureId);
    if (!chosen || chosen.controllerId !== playerId || chosen.kind !== 'creature' || chosen.tapped) throw new Error('Nielegalny stwór do tapnięcia (koszt)');
  }
  // Koszt „Tap ANOTHER creature you control" (Station): zatapniany stwór nie
  // może być źródłem; jego id trafia do efektu station_counters jako cel.
  const otherCreatureToTap = cost.tapOtherCreature
    ? (ctx.tapOtherCreatureId ?? state.zones.battlefield.find((candidateId) => {
      const candidate = state.objects.get(candidateId);
      return candidate?.controllerId === playerId && candidate.id !== objectId
        && candidate.kind === 'creature' && !candidate.tapped;
    }))
    : null;
  if (cost.tapOtherCreature && !otherCreatureToTap) throw new Error('Brak innego nietapniętego stwora do kosztu tap');
  if (cost.tapOtherCreature && ctx.tapOtherCreatureId) {
    const chosen = state.objects.get(ctx.tapOtherCreatureId);
    if (!chosen || chosen.controllerId !== playerId || chosen.id === objectId || chosen.kind !== 'creature' || chosen.tapped) throw new Error('Nielegalny inny stwór do tapnięcia (koszt)');
  }
  // Crew (CR 701.36): koszt „Tap any number of creatures you control with
  // total power N or more" — walidacja wyboru PRZED jakąkolwiek mutacją.
  let crewCreaturesToTap = null;
  if (cost.crewPower) {
    if (!Array.isArray(crewCreatureIds) || crewCreatureIds.length === 0) throw new Error('Crew wymaga stworów do tapnięcia');
    if (new Set(crewCreatureIds).size !== crewCreatureIds.length) throw new Error('Stwór crew nie może wystąpić więcej niż raz');
    let crewPowerSum = 0;
    for (const crewId of crewCreatureIds) {
      const candidate = state.objects.get(crewId);
      if (!candidate || candidate.zone !== 'battlefield' || candidate.controllerId !== playerId
        || candidate.kind !== 'creature' || candidate.tapped || candidate.id === objectId) {
        throw new Error('Nielegalny stwór do crew');
      }
      crewPowerSum += effectivePower(candidate, state) ?? 0;
    }
    if (crewPowerSum < cost.crewPower) throw new Error('Za mała łączna moc stworów do crew');
    crewCreaturesToTap = crewCreatureIds;
  }
  if (cost.removeCounter) {
    const rc = cost.removeCounter;
    if ((object.counters?.[rc.name] ?? 0) < (rc.amount ?? 1)) throw new Error(`Brak licznika ${rc.name} (koszt)`);
  }
  if (tapBlockedBySummoningSickness(state, object, ability)) {
    throw new Error('Choroba przywołania: stwór bez haste nie aktywuje {T} w turze wejścia');
  }
  if (cost.tap) {
    tapObject(state, objectId, playerId);
  }
  if (creatureToTap) {
    const tapId = ctx.tapCreatureId ?? creatureToTap;
    tapObject(state, tapId, playerId);
  }
  if (otherCreatureToTap) {
    const tapId = ctx.tapOtherCreatureId ?? otherCreatureToTap;
    tapObject(state, tapId, playerId);
  }
  // Koszt crew: tapujemy wybrane stwory (każdy osobny koszt, CR 701.36a).
  if (crewCreaturesToTap) {
    for (const crewId of crewCreaturesToTap) tapObject(state, crewId, playerId);
  }
  const effManaSpend = effectiveAbilityManaCost(state, playerId, ability, object);
  const manaCost = cost.manaX ? (xValue ?? 0) : effManaSpend;
  if (manaCost > 0) {
    spendMana(state, playerId, manaCost, colorReqs);
  }
  // Koszt „Sacrifice this token/permanent" (Treasure): poświęcenie źródła
  // jest częścią kosztu, więc następuje PRZED efektem (mana wpada do puli
  // mimo że permanent już jest w grobie — CR 601.2h).
  let effectSource = object;
  if (cost.sacrificeSelf) {
    const sacrificeMarker = state.events.length;
    applyEffect(state, { type: 'sacrifice_permanent' }, object, []);
    // Zmiana strefy = nowy obiekt (CR 400.7): efekty referencjonujące źródło
    // PO jego poświęceniu (Plague Reaver — powrót z grobu w upkeep przeciwnika)
    // dostają obiekt z GROBU, nie dawny obiekt z bitwiska.
    const sacrificed = state.events.slice(sacrificeMarker).find((entry) => entry.type === 'permanent_sacrificed');
    effectSource = (sacrificed && state.objects.get(sacrificed.objectId)) ?? object;
  }
  // Koszt „Exile this card from your graveyard" (Goldmeadow Nomad):
  // wygnanie źródła z grobu jest kosztem — następuje PRZED efektem.
  if (cost.exileFromGraveyard) {
    const exileId = `exile-${state.objectSequence++}`;
    const exiled = moveObjectDirectly(state, objectId, 'exile', exileId);
    state.events.push(event('object_exiled', { fromId: objectId, objectId: exileId, object: exiled, cardId: exiled.cardId, fromGraveyard: true }));
    effectSource = exiled;
  }
  // Koszt „Remove a counter" (Trigon of Corruption): zdjęcie licznika jest
  // częścią kosztu, następuje PRZED efektem.
  if (cost.removeCounter) {
    removeCounter(state, objectId, cost.removeCounter.name, cost.removeCounter.amount ?? 1);
  }
  // Koszt discard (Goblin Picker / Plague Reaver) został już opłacony przez
  // resolve_discard_choice (Temat 4) — tutaj nie ma już nic do odrzucenia.
  // Po poświęceniu źródła (koszt) efekt nie może wskazywać nieistniejącego już
  // obiektu — dla add_mana i tak liczy się wyłącznie kontroler. Koszt
  // „tap another creature" (Station) podaje zatapniętego stwora jako cel
  // efektu (station_counters czyta jego moc).
  // Regeneracja (CR 701.12): zdolność „regenerate" po opłaceniu kosztu
  // zakłada tarczę na źródle („the next time it would be destroyed this turn").
  if (ability.keyword === 'regenerate') {
    addRegenerationShield(state, objectId);
  }
  let effectTargets = chosenTargets.length > 0 ? chosenTargets : (cost.sacrificeSelf ? [] : [objectId]);
  if (otherCreatureToTap) effectTargets = [ctx.tapOtherCreatureId ?? otherCreatureToTap];
  const effectList = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
  for (const effect of effectList) applyEffect(state, effect, effectSource, effectTargets);
  // „Activate only once each turn\" (Snarling Wolf): zapisujemy aktywację,
  // żeby legalActivatedAbilities ją wycofała do końca tury.
  if (ability.oncePerTurn) {
    state.abilityActivatedThisTurn = {
      ...(state.abilityActivatedThisTurn ?? {}),
      [`${objectId}:${abilityIndex}`]: true,
    };
  }
  // cardId jedzie w evencie, bo źródło mogło zniknąć w trakcie kosztu
  // (Sacrifice this — Panic Spellbomb: obiekt grobu ma nowe id, a log/UI
  // ma nadal podać nazwę karty). effectTypes = krótki opis „co robi
  // zdolność" dla logu stołu (zamiast „?\" po nazwach funkcji).
  const activated = event('ability_activated', {
    playerId, objectId, abilityIndex,
    cardId: effectSource.cardId ?? object.cardId,
    effectTypes: effectList.map((e) => e?.type).filter(Boolean),
    targets: chosenTargets,
    xValue: cost.manaX ? manaCost : undefined,
    // Crew (CR 701.36): zatapnięte stwory widoczne w logu.
    ...(crewCreaturesToTap ? { crewCreatureIds: [...crewCreaturesToTap] } : {}),
  });
  state.events.push(activated);
  return activated;
}

/**
 * Cycling (CR 702.28): zapłać koszt many, odrzuć kartę (odrzut jest kosztem)
 * i przeszukaj bibliotekę pod kątem deskryptora kwalifikacji (np. typ
 * „Swamp" u swampcyclingu). Trafienie — karta jawna (reveal) — trafia do ręki,
 * po czym biblioteka jest tasowana deterministycznym RNG (ADR 0005).
 * Szukanie kart o zadanej jakości pozwala świadomie nie znaleźć (fail to
 * find, CR 701.19b) — wybór deterministyczny: pierwsza pasująca karta w
 * kolejności biblioteki (jak deterministyczny cel triggera Kap-py).
 */
function matchesCyclingQualifier(object, qualifier) {
  // Basic landcycling (Fiery Fall): karta musi mieć WSZYSTKIE wskazane typy
  // naraz (Basic ∧ Land) — inaczej niż typy alternatywne (OR) zwykłego
  // typecyclingu. Koniunkcja jest osobną właściwością deskryptora.
  const allTypes = qualifier?.allTypes ?? [];
  if (allTypes.length > 0) {
    return allTypes.every((type) => (object.types ?? []).includes(type));
  }
  const types = qualifier?.types ?? [];
  const subtypes = qualifier?.subtypes ?? [];
  if (types.some((type) => (object.types ?? []).includes(type))) return true;
  return subtypes.some((subtype) => (object.subtypes ?? []).includes(subtype));
}

function activateCycling(state, playerId, cardObject, abilityIndex, ability) {
  if (cardObject.zone !== 'hand') throw new Error('Cycling aktywuje się z ręki');
  const qualifier = ability.cycling;
  const cyclingReqs = colorRequirementsOf(ability.cost);
  if (cyclingReqs.length > 0 && !canPayColoredCost(state, playerId, cyclingReqs)) {
    throw new Error('Brak kolorowego źródła many na cycling');
  }
  const drawAmount = qualifier?.drawCards;
  if (drawAmount != null && (!Number.isInteger(drawAmount) || drawAmount < 1)) throw new RangeError('Cycling drawCards musi być dodatnią liczbą całkowitą');
  spendMana(state, playerId, ability.cost?.mana ?? 0, cyclingReqs);
  // Przy typecyclingu znalezienie karty rozstrzyga się zanim karta cyklowana
  // opuści rękę; zwykły cycling nie szuka, tylko dobiera po odrzuceniu.
  const matchId = drawAmount == null
    ? state.zones.library.find((id) => {
      const candidate = state.objects.get(id);
      return candidate?.controllerId === playerId && matchesCyclingQualifier(candidate, qualifier);
    })
    : null;
  const graveId = `grave-${state.objectSequence++}`;
  const discarded = moveObjectDirectly(state, cardObject.id, 'graveyard', graveId);
  if (drawAmount != null) {
    for (let i = 0; i < drawAmount; i += 1) {
      const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === playerId);
      if (!topId) break;
      const handId = `hand-${state.objectSequence++}`;
      const drawn = moveObjectDirectly(state, topId, 'hand', handId);
      state.cardsDrawnThisTurn[playerId] = (state.cardsDrawnThisTurn[playerId] ?? 0) + 1;
      state.events.push(event('card_drawn', { playerId, fromId: topId, object: drawn }));
    }
    const activated = event('ability_activated', {
      playerId, objectId: discarded.id, cardId: cardObject.cardId, abilityIndex, cycling: true,
    });
    state.events.push(activated);
    return activated;
  }

  // Temat 6 — typecycling („You may search your library for a [karta],
  // reveal it, put it into your hand, then shuffle"): KTÓRĄ kartę znaleźć
  // (i czy w ogóle szukać) wybiera gracz — blokująca decyzja
  // resolve_search_choice (emiter: cycling — po wyborze emitujemy
  // ability_activated). Bez pasujących kart: samo przeszukanie + tasowanie.
  const searchQualifier = {
    types: qualifier?.allTypes ?? qualifier?.types ?? [],
    subtypes: qualifier?.subtypes ?? [],
  };
  const candidates = state.zones.library.filter((id) => {
    const candidate = state.objects.get(id);
    if (!candidate || candidate.controllerId !== playerId || candidate.id === cardObject.id) return false;
    const types = searchQualifier.types;
    const subtypes = searchQualifier.subtypes;
    const typeOk = types.length === 0 || types.every((t) => (candidate.types ?? []).includes(t));
    const subtypeOk = subtypes.length === 0 || subtypes.some((s) => (candidate.subtypes ?? []).includes(s));
    return typeOk && subtypeOk;
  });
  if (candidates.length === 0) {
    const own = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === playerId);
    const shuffled = shuffle(own, state.seed + state.objectSequence);
    let cursor = 0;
    state.zones.library = state.zones.library.map((id) => {
      if (state.objects.get(id)?.controllerId !== playerId) return id;
      const replacement = shuffled[cursor];
      cursor += 1;
      return replacement;
    });
    state.events.push(event('library_searched', { playerId, foundCardId: null, shuffled: true, qualifier: searchQualifier }));
  } else {
    state.pendingSearchChoice = {
      playerId, qualifier: searchQualifier, destination: 'hand', entersTapped: false,
      sourceCardId: cardObject.cardId,
      emitter: { kind: 'cycling', playerId, objectId: discarded.id, abilityIndex, cardId: cardObject.cardId },
      restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.turn.priorityPlayerId = playerId;
    const required = event('search_choice_required', {
      playerId, candidateIds: [...candidates], destination: 'hand',
      sourceCardId: cardObject.cardId, cycling: true,
    });
    state.events.push(required);
    return required;
  }
  const activated = event('ability_activated', { playerId, objectId: discarded.id, cardId: cardObject.cardId, abilityIndex, cycling: true });
  state.events.push(activated);
  return activated;


}
function activateChannel(state, playerId, cardObject, abilityIndex, ability) {
  if (cardObject.zone !== 'hand') throw new Error('Channel aktywuje się z ręki');
  const channelReqs = colorRequirementsOf(ability.cost);
  if (channelReqs.length > 0 && !canPayColoredCost(state, playerId, channelReqs)) {
    throw new Error('Brak kolorowego źródła many na channel');
  }
  const effMana = effectiveAbilityManaCost(state, playerId, ability, cardObject);
  spendMana(state, playerId, effMana, channelReqs);
  const graveId = `grave-${state.objectSequence++}`;
  const discarded = moveObjectDirectly(state, cardObject.id, 'graveyard', graveId);
  // Szukanie basic land (kwalifikacja: typ Land + supertyp Basic)
  const candidates = state.zones.library.filter((id) => {
    const cand = state.objects.get(id);
    if (!cand || cand.controllerId !== playerId) return false;
    const isBasicLand = (cand.types ?? []).includes('Land') && (cand.supertypes ?? []).includes('Basic');
    // Fallback: jeśli karta nie ma supertypes (starsze dane), sprawdź nazwę basic landów
    if (!isBasicLand) {
      const basicNames = ['Plains','Island','Swamp','Mountain','Forest'];
      if (cand.types?.includes('Land') && basicNames.includes(cand.cardName ?? cand.name ?? '')) return true;
      // Sprawdź cardId dla basic landów
      const basicIds = ['basic-plains','basic-island','basic-swamp','basic-mountain','basic-forest'];
      if (basicIds.includes(cand.cardId)) return true;
      return false;
    }
    return true;
  });
  // Deterministycznie wybierz pierwszy w kolejności biblioteki (jak cycling)
  const foundId = candidates[0] ?? null;
  if (foundId) {
    const bfId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, foundId, 'battlefield', bfId);
    const tappedObj = Object.freeze({ ...moved, tapped: true });
    state.objects.set(bfId, tappedObj);
    state.events.push(event('library_searched', { playerId, foundCardId: moved.cardId, destination: 'battlefield', shuffled: true, qualifier: { types: ['Basic','Land'] } }));
    state.events.push(event('permanent_entered_battlefield', { fromId: foundId, objectId: bfId, object: tappedObj, cardId: tappedObj.cardId, controllerId: playerId, tapped: true, channel: true }));
  }
  // Tasowanie pozostałej biblioteki (jak po search)
  const ownLib = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === playerId);
  const shuffled = shuffle(ownLib, state.seed + state.objectSequence);
  let cursor = 0;
  state.zones.library = state.zones.library.map((id) => {
    if (state.objects.get(id)?.controllerId !== playerId) return id;
    const rep = shuffled[cursor];
    cursor += 1;
    return rep;
  });
    const activated = event('ability_activated', {
    playerId, objectId: discarded.id, cardId: cardObject.cardId, abilityIndex, channel: true,
  });
  state.events.push(activated);
  return activated;
}

/**
 * Equip (CR 702.6): zapłać koszt equip i załóż equipment na własnego stwora.
 * Szybkość sorcery (faza main aktywnego gracza, pusty stos). Equip może też
 * przełożyć equipment między własnymi stworami (attachEquipmentToCreature
 * przepina obiekt, który już był załączony).
 */
function activateEquip(state, playerId, object, abilityIndex, targets) {
  if (object.zone !== 'battlefield' || !object.equipment) throw new Error('Equip działa tylko na equipment na bitwisku');
  if (state.turn.activePlayerId !== playerId || !['precombat_main', 'postcombat_main'].includes(state.turn.phase)) {
    throw new Error('Equip tylko w swoją fazę main');
  }
  if (state.zones.stack.length > 0) throw new Error('Equip tylko przy pustym stosie');
  if (!Array.isArray(targets) || targets.length !== 1) throw new Error('Equip wymaga dokładnie jednego celu');
  const target = validateTargets(state, [Object.freeze({ type: 'creature' })], targets, playerId)[0];
  if (target.controllerId !== playerId) throw new Error('Equip celuje wyłącznie we własne stwory');
  spendMana(state, playerId, object.equipment.equip ?? 0);
  attachEquipmentToCreature(state, object.id, target.id);
  const activated = event('ability_activated', { playerId, objectId: object.id, abilityIndex, targets: [target.id], keyword: 'equip' });
  state.events.push(activated);
  return activated;
}

/**
 * Ninjutsu: wróć nieblokowanego atakującego do ręki właściciela, a kartę
 * z ręki połóż na battlefield zatapniętą i atakującą (CR 702.48 w minimalnym
 * wymiarze: okno aktywacji to krok combat_damage przed rozstrzygnięciem).
 */
function activateNinjutsu(state, playerId, cardObject, abilityIndex, ability, attackerId) {
  if (cardObject.zone !== 'hand') throw new Error('Ninjutsu aktywuje się z ręki');
  if (state.turn.step !== 'combat_damage' || !state.combat || state.turn.activePlayerId !== playerId || state.turn.priorityPlayerId !== playerId) {
    throw new Error('Ninjutsu tylko w oknie combat po blokach');
  }
  const attacker = state.objects.get(attackerId);
  if (!attacker || attacker.zone !== 'battlefield' || attacker.controllerId !== playerId || attacker.kind !== 'creature') {
    throw new Error('Nielegalny atakujący do ninjutsu');
  }
  if (!state.combat.attackers.includes(attackerId) || state.combat.blockers.has(attackerId)) {
    throw new Error('Ninjutsu wymaga nieblokowanego atakującego');
  }
  spendMana(state, playerId, ability.cost?.mana ?? 0);
  // Atakujący znika z combat PRZED zmianą strefy, żeby inwariant combat
  // (odwołania tylko do battlefield) był spełniony w trakcie ruchu.
  state.combat.attackers = state.combat.attackers.filter((id) => id !== attackerId);
  const handId = `hand-${state.objectSequence++}`;
  moveObjectDirectly(state, attackerId, 'hand', handId);
  const bfId = `permanent-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, cardObject.id, 'battlefield', bfId);
  const permanent = Object.freeze({ ...moved, tapped: true, summoningSickness: true });
  state.objects.set(bfId, permanent);
  state.combat.attackers.push(bfId);
  if (permanent.entersWithCounters) {
    for (const [name, amount] of Object.entries(permanent.entersWithCounters)) {
      addCounter(state, bfId, name, amount);
    }
  }
  const activated = event('ability_activated', { playerId, objectId: cardObject.id, abilityIndex, attackerId });
  state.events.push(activated);
  return activated;
}
