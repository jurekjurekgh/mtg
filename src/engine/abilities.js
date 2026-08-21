import { event } from '../protocol/types.js';
import { effectiveKeywords, effectivePower, tapObject } from './permanents.js';
import { producibleMana, spendMana, canPayColoredCost } from './resources.js';
import { moveObjectDirectly } from './objects.js';
import { addCounter, removeCounter } from './counters.js';
import { changeLife } from './players.js';
import { applyEffect, queueSearchChoice } from './effects.js';
import { validateTargets, hasHexproofAgainst, legalTargetCandidates } from './spells.js';
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
 * M150/C2: kolory many, które zdolność DODAJE (efekty `add_mana` z listą
 * kolorów — Jeskai Devotee „{1}: Add {U}, {R}, or {W}”). W logu stołu opis
 * aktywacji pokaże „dodanie many do puli ({U}, {R}, {W})” zamiast milczeć
 * o kolorze (uwaga właściciela 2026-08-19).
 */
function collectManaColors(effects) {
  const colors = [];
  for (const effect of effects ?? []) {
    if (effect?.type !== 'add_mana') continue;
    for (const color of effect.colors ?? []) {
      if (!colors.includes(color)) colors.push(color);
    }
  }
  return colors;
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

export function createAbility({ type, cost = null, effect, trigger, keyword = null, targets = null, cycling = null, channel = null, reinforce = null, forecast = false, grantsExtraBlockWithCounter = null, condition = null, pump = null, keywords = null, timing = 'instant', oncePerTurn = false, mustAttack = false, scope = null, costModifier = null, costReduction = null, fromGraveyard = false, cantAttackAlone = false, cantBlockAlone = false, cantAttackUnlessDefenderHasFlying = false, cantAttackUnlessDefenderPoisoned = false, opponentChoosesTarget = null, faceDownEnterFlyingCounter = false, cantBeBlockedExceptByColors = null, cantBeBlockedBySubtypes = null, landwalk = null, onNthResolve = null }) {
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
    onNthResolve: onNthResolve ? Object.freeze({
      n: onNthResolve.n ?? 3,
      may: Boolean(onNthResolve.may),
      effect: Object.freeze({ ...onNthResolve.effect }),
    }) : null,
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
    cantAttackUnlessDefenderPoisoned: Boolean(cantAttackUnlessDefenderPoisoned),
    // M116 (Cuombajj Witches): DRUGI cel zdolności wskazuje PRZECIWNIK
    // (CR 601.2c — „a target of an opponent's choice"). Deskryptor nosi
    // specyfikację tego celu; aktywacja czeka na jego decyzję.
    opponentChoosesTarget: opponentChoosesTarget ? Object.freeze({ ...opponentChoosesTarget }) : null,
    // „can't be blocked except by [kolor]" (Dread Warlock): statyczna restrykcja
    // blokowania — canBlock/declareBlockers wymagają blokera tego koloru.
    cantBeBlockedExceptByColors: cantBeBlockedExceptByColors ? Object.freeze([...cantBeBlockedExceptByColors]) : null,
    // „can't be blocked by [podtypy]" (Blazing Torch — nadawane nosicielowi):
    // statyczna restrykcja blokowania — canBlock odrzuca blokerów o tych
    // podtypach. Zdarza się w `equipment.grantedAbilities`, więc trafia do
    // combat przez attachmentsAttachedTo.
    cantBeBlockedBySubtypes: cantBeBlockedBySubtypes ? Object.freeze([...cantBeBlockedBySubtypes]) : null,
    // Landwalk (CR 702.33, Emerald Oryx — forestwalk): „This creature can't be
    // blocked as long as defending player controls a [podtyp]". { subtype } —
    // generyczny (inne landwalki w przyszłości). Sprawdzane w canBlock.
    landwalk: landwalk ? Object.freeze({ ...landwalk }) : null,
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
    // M166/B (Reinforce, CR 702.29a): zdolność karty w RĘCE — koszt mana +
    // odrzucenie karty; efekt: liczniki +1/+1 na celu stworze.
    reinforce: reinforce ? Object.freeze({ ...reinforce }) : null,
    // M166/E (Cenn's Tactician): statyka „Each creature you control with
    // a +1/+1 counter on it can block an additional creature each combat"
    // — licznik uprawniający do dodatkowego slotu bloku.
    grantsExtraBlockWithCounter,
    // Forecast (CR 702.94, Piercing Rays): „[koszt], Reveal this card from
    // your hand: [efekt]. Activate only during your upkeep and only once each
    // turn." Zdolność aktywowana z RĘKI; karta zostaje w ręce (ujawniona).
    forecast: Boolean(forecast),
    fromGraveyard: Boolean(fromGraveyard),
    // Veiled Ascension (MKC): „Face-down creatures you control enter with a
    // flying counter on them." — statyczna zdolność, która modyfikuje wejście
    // zakrytych stworów kontrolera (jak Day/Night). Przenoszona na obiekt.
    faceDownEnterFlyingCounter: Boolean(faceDownEnterFlyingCounter),
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

/**
 * M170/C (uwaga właściciela, Incubator): zdolność „{N}: Transform this
 * permanent" jest JEDNORAZOWA — jeśli jej aktywacja CZEKA już na stosie,
 * ponowna aktywacja (możliwa płatnościowo, bo koszt nie zawiera {T}) robi
 * transform→re-transform i gracz płaci podwójnie za zero efektu. Oferta
 * chowa zdolność, a aktywacja ją odrzuca — spójnie (L48).
 */
function transformActivationPending(state, objectId) {
  return state.zones.stack.some((stackId) => {
    const entry = state.objects.get(stackId);
    const activated = entry?.activatedEntry;
    if (!activated || entry.kind !== 'activated') return false;
    if (activated.objectId !== objectId) return false;
    const effects = Array.isArray(activated.ability?.effect) ? activated.ability.effect : [activated.ability?.effect];
    return effects.length === 1 && effects[0]?.type === 'transform';
  });
}

function tapBlockedBySummoningSickness(state, object, ability) {
  if (!ability?.cost?.tap) return false;
  const isCreature = object.kind === 'creature' || (object.types ?? []).includes('Creature');
  if (!isCreature) return false;
  if (!object.summoningSickness) return false;
  return !effectiveKeywords(object, state).includes('haste');
}

/**
 * M103/A2 (wzorzec U9, L15) + M104: OFERTA BEZ SKUTKU — aktywacja, po której
 * stan gry jest identyczny, a gracz zapłacił koszt. Klasę zapoczątkował equip
 * na obecnego nosiciela (M102/U9) i nadanie keywordów, które cel już ma
 * (M103/A2); M104 dokłada „tap/untap target" na celu w docelowym stanie oraz
 * znaczniki jednorazowe („nie może blokować", „nie może być blokowany").
 *
 * Ofertę chowa `legalActivatedAbilities`; `execute` nadal przyjmuje komendę —
 * jest legalna wg CR 602.2b (świadomy rozjazd oferty i walidacji, jak U9).
 *
 * Predykaty patrzą wyłącznie na deskryptor efektu (ADR 0002 — żadnych nazw
 * kart). `target` to cel wariantu oferty; dla zdolności bez celów podmiotem
 * jest samo źródło („this creature gains…").
 */
function effectIsNoOpOnTarget(state, effect, target, source = null) {
  if (!effect || typeof effect !== 'object') return false;
  // Efekt sięgający po INNY cel z listy (tap_permanent z targetIndex —
  // Greatsword of Tyr) nie jest oceniany: sonda oferty zna jeden cel.
  if (effect.targetIndex != null && effect.targetIndex !== 0) return false;
  switch (effect.type) {
    case 'grant_keywords_until_end_of_turn': {
      // grantKeywordsUntilEndOfTurn składa keywordy do Setu, więc powtórne
      // nadanie nie zmienia stanu (M103/A2).
      const keywords = effect.keywords ?? [];
      if (!target || keywords.length === 0) return false;
      return keywords.every((kw) => effectiveKeywords(target, state).includes(kw));
    }
    // Tapnięcie tapniętego / odkręcenie odkręconego (CR 701.20b): efekt widzi
    // permanent już w docelowym stanie i nic nie robi. Uwaga: odkręcenie
    // TAPNIĘTEGO permanentu z licznikiem stun realnie zdejmuje licznik
    // (CR 122.1b) — dlatego bramka patrzy wyłącznie na `tapped`.
    case 'tap_permanent':
      return Boolean(target && target.zone === 'battlefield' && target.tapped);
    case 'untap_permanent':
      return Boolean(target && target.zone === 'battlefield' && !target.tapped);
    // Znaczniki jednorazowe „do końca tury": drugie nadanie nie kumuluje się.
    case 'cant_block':
      return Boolean(target?.cantBlock);
    case 'cant_be_blocked':
      return Boolean(target?.cantBeBlocked);
    // Liczniki KUMULUJĄ się (także stun — CR 122.1b), więc no-opem jest
    // wyłącznie zerowa (albo ujemna) liczba liczników.
    case 'add_counter':
      return (effect.amount ?? 1) <= 0;
    // M108 (Kazuul's Toll Collector, wzorzec U9): przypięcie sprzętu, który
    // JUŻ wisi na tym stworze, niczego nie zmienia — a przy koszcie {0} bot
    // potrafił aktywować to w nieskończoność (próbka benchmarku przestawała
    // kończyć mecze). Oferta chowana; execute nadal przyjmuje (CR 602.2b).
    case 'attach_equipment_to_source':
      return Boolean(target && target.attachedTo === source?.id);
    default:
      return false;
  }
}

/**
 * Koszt, który ma wartość SAM W SOBIE — poświęcenie/wygnanie/odrzucenie karty
 * napędza inne mechaniki (sac outlet, trigger „dies", cmentarz). Przy takim
 * koszcie jałowy efekt NIE czyni aktywacji no-opem, więc oferta zostaje
 * (anty-over-fix: Panic Spellbomb „{T}, poświęć: cel nie może blokować"
 * z triggerem „gdy trafi do grobu, możesz zapłacić {R}: dobierz kartę").
 */
function costHasOwnValue(cost) {
  if (!cost) return false;
  return Boolean(cost.sacrificeSelf || cost.sacrificeLand || cost.discardCard
    || cost.discardCards || cost.exileFromGraveyard);
}

function abilityEffectIsNoOp(state, source, ability, target) {
  if (!ability) return false;
  // Zdolność z DOŁOŻONYM skutkiem (Soulbright Flamekin: przy trzecim
  // rozstrzygnięciu w turze onNthResolve dodaje {R}×8) nie jest no-opem —
  // jej efekt wykracza poza sam deskryptor i oferta musi zostać.
  if (ability.onNthResolve) return false;
  if (costHasOwnValue(ability.cost)) return false;
  const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
  if (effects.length === 0 || effects.some((effect) => !effect)) return false;
  const subject = target ?? source;
  return effects.every((effect) => effectIsNoOpOnTarget(state, effect, subject, source));
}

/** Limit oferowanych podzbiorów crew (jak COMBAT_OPTION_CAP w combacie). */
const CREW_OPTION_CAP = 32;

/**
 * Legalne podzbiory stworów do kosztu crew (CR 701.36): „Tap any number of
 * creatures you control with total power N or more". Deterministycznie
 * (ADR 0005): pierwszy jest minimalny zachłanny podzbiór (najsłabsze stwory
 * w kolejności pola bitwy — boty biorą najtańszy tap), potem pozostałe
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
  // CR 502.4: w kroku odkręcania nikt nie dostaje priorytetu, więc ŻADNEJ
  // zdolności nie da się aktywować. Normalnie gra w ogóle nie zatrzymuje się
  // w untapie (untapStepTurnBasedAction przewija do upkeepu), ale oferta
  // musi być odporna sama z siebie — inaczej dowolna ścieżka ustawiająca
  // stan na untapie znów pokaże graczowi „Aktywuj: …" (M102/U1).
  if (state.turn?.step === 'untap') return out;
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
      // graveyard") działa WYŁĄCZNIE z grobu — na polu bitwy nie jest oferowana
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
      // Ninjutsu działa wyłącznie z ręki — na polu bitwy nie ma czego aktywować.
      if (ability.keyword === 'ninjutsu') continue;
      // M170/C: transform już czeka na stosie — druga aktywacja to
      // transform→re-transform i podwójna płatność bez efektu.
      {
        const effs = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
        if (effs.length === 1 && effs[0]?.type === 'transform' && transformActivationPending(state, id)) continue;
      }
      // Cycling również działa wyłącznie z ręki (CR 702.28a) — na polu bitwy
      // ta zdolność jest martwa; oferowanie jej kończy się odrzuceniem legalnej
      // z pozoru komendy (execute krzyczy „Cycling aktywuje się z ręki").
      if (ability.cycling) continue;
      // Channel (CR 702.85a, Greater Tanuki) — jak cycling: zdolność karty
      // w RĘCE; na polu bitwy jest martwa. Bez tego bota oferowano channel z
      // pola bitwy i execute odrzucał „Channel aktywuje się z ręki" (regresja
      // benchmarku B0 po dodaniu Greater Tanuki do talii green).
      if (ability.channel) continue;
      // M166/B fix (regresja benchmarku CI): Reinforce (CR 702.29a, Mosquito
      // Guard) — jak channel/cycling: zdolność karty w RĘCE; na polu bitwy
      // jest martwa. Bez pominięcia bot dostawał ofertę z pola bitwy i
      // execute odrzucał „Reinforce aktywuje się z ręki" (crash sesji).
      if (ability.reinforce) continue;
      // Megamorph (obrócenie twarzą do góry) działa tylko, póki permanent
      // leży twarzą w dół; po obrocie zdolność wygasa.
      if ((ability.keyword === 'megamorph' || ability.keyword === 'morph') && !object.faceDown) continue;
      // Craft (CR 702.9? — Lodestone Needle // Guidestone Compass): wymaga
      // drugiej strony (transformTo). Kopia bez drugiej strony (enterAsCopy
      // skopiował zdolność craft, ale transformTo jest warunkowe) nie ma czego
      // przywrócić — nie oferujemy (no-op zamiast crasha, jak efekty.js).
      if (ability.keyword === 'craft' && !object.transformTo) continue;
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
      // Equip (CR 702.6b): „Equip only as a sorcery" jest CZĘŚCIĄ definicji
      // słowa kluczowego — koszt equip aktywuje się wyłącznie w oknie sorcery
      // (swoja faza main aktywnego gracza, pusty stos). M101/B1: audyt PR #41
      // (B7.2) pomylił 702.6a (opis „attach to target creature you control")
      // z 702.6b i zrobił z equipu zdolność instant speed — mimo że WSZYSTKIE
      // sprzęty katalogu mają w Oracle text „Equip only as a sorcery".
      // Koszt pochodzi z deskryptora equipment — jednego źródła napędzającego
      // buff nosiciela.
      if (ability.keyword === 'equip') {
        if (!object.equipment) continue;
        if (!sorcerySpeed) continue;
        if ((object.equipment.equip ?? 0) > mana) continue;
        if (!canPayColoredCost(state, playerId, colorRequirementsOf({ colors: object.equipment.colors ?? [] }))) continue;
        for (const targetId of state.zones.battlefield) {
          const target = state.objects.get(targetId);
          // CR 702.6a: equipment nie może wyposażyć SAMEGO SIEBIE — oferta
          // i walidacja muszą być spójne (animowany artefakt-sprzęt bywa
          // stworzeniem, więc sam mógłby trafić do kandydatów).
          // M102/U9 (Żywy Tester, azorius vs black): pomijamy też OBECNEGO
          // nosiciela. „Attach to target creature you control" wykonane na
          // stworze, do którego sprzęt już jest przypięty, jest legalne, ale
          // to czysty no-op — gracz płaci koszt equip i nic nie zmienia
          // (tester kliknął to dwa razy z rzędu, tracąc manę i całą turę).
          // Przepięcie na INNEGO stwora pozostaje pełnoprawną ofertą.
          if (target?.zone === 'battlefield' && target.kind === 'creature'
            && target.controllerId === playerId && target.id !== id
            && object.attachedTo !== target.id) {
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
      // Koszt „Sacrifice a land" (Seismic Monstrosaur): zdolność dostępna,
      // gdy gracz ma własnego landa do poświęcenia; oferujemy każdy land
      // (także land creature — typ Land) osobno (sacrificeLandId).
      if (ability.cost?.sacrificeLand) {
        const lands = state.zones.battlefield.filter((objectId) => {
          const candidate = state.objects.get(objectId);
          return candidate?.controllerId === playerId
            && (candidate.kind === 'land' || (candidate.types ?? []).includes('Land'));
        });
        if (lands.length === 0) continue;
        if ((ability.cost?.mana ?? 0) > mana) continue;
        if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
        for (const landId of lands) {
          out.push({ objectId: id, abilityIndex: index, ability, sacrificeLandId: landId });
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
      // Saddle (CR 702.171): jak crew, ale tylko jako sorcery; efekt set_saddled.
      if (ability.cost?.saddlePower) {
        const saddlers = state.zones.battlefield.filter((objectId) => {
          const candidate = state.objects.get(objectId);
          return candidate && candidate.id !== id && candidate.controllerId === playerId
            && candidate.kind === 'creature' && !candidate.tapped;
        });
        for (const subset of legalCrewSubsets(state, saddlers, ability.cost.saddlePower)) {
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
          // M104: wariant bez skutku (np. odkręcenie nietapniętego lądu) —
          // ta sama bramka co w pozostałych gałęziach enumeracji celów.
          if (isLand && target.controllerId === playerId
            && !abilityEffectIsNoOp(state, object, ability, target)) {
            out.push({ objectId: id, abilityIndex: index, ability, targets: [targetId] });
          }
        }
        continue;
      }
      // M115 (Krumar Initiate): „{X}{B}, {T}, Pay X life: endures X" — zdolność
      // BEZ celów, ale z wyborem X. Musi wyprzedzić gałąź „bez celów", inaczej
      // oferta ma jeden wariant bez xValue (i endure 0 = brak skutku). X
      // ogranicza dostępna mana po odjęciu stałej części kosztu ORAZ ŻYCIE
      // (CR 118.4: nie zapłacisz więcej życia, niż masz).
      if (targetSpec.length === 0 && ability.cost?.manaX && ability.cost?.payLifeX) {
        const fixed = ability.cost.mana ?? 0;
        const life = state.players.find((entry) => entry.id === playerId)?.life ?? 0;
        const maxX = Math.min(Math.max(0, mana - fixed), life, 20);
        if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
        for (let x = 1; x <= maxX; x += 1) {
          out.push({ objectId: id, abilityIndex: index, ability, xValue: x });
        }
        continue;
      }
      if (targetSpec.length === 0) {
        // M103/A2 + M104: aktywacja, po której stan jest identyczny („zdobądź
        // keyword", który źródło już ma; „odkręć" nietapnięte źródło), nic nie
        // zmienia — oferta no-opu jest chowana (jak U9).
        if (abilityEffectIsNoOp(state, object, ability, object)) continue;
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
            if (abilityEffectIsNoOp(state, object, ability, target)) continue; // M104
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
      // Dla celów pole bitwywych (creature, artifact, artifact_or_creature, ...)
      // używamy wspólnej legalTargetCandidates — inaczej enumeracja oferuje
      // TYLKO stwory i bot dostaje cel, który validateTargets odrzuca (M82:
      // Cogwork Assembler — cel 'artifact' oferował zwykłe stwory).
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
        : legalTargetCandidates(state, playerId, targetSpec[0], object)
          .filter((targetId) => {
            if (state.players.some((p) => p.id === targetId)) return true;
            const target = state.objects.get(targetId);
            if (!target) return false;
            if (ownCreatureTarget && target.controllerId !== playerId) return false;
            return true;
          });
      if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
      for (const targetId of candidates) {
        const target = state.objects.get(targetId);
        // M103/A2 + M104: wariant, po którym cel zostaje w tym samym stanie
        // (keywordy, które już ma — Stirring Bard; odkręcenie odkręconego lądu
        // — Rustvine Cultivator; ewazja, którą cel już ma — Coralhelm Guide),
        // nic nie zmienia — chowany jak no-op equip (U9).
        if (abilityEffectIsNoOp(state, object, ability, target)) continue;
        // M155 (audyt żywym testerem, Sterling Keykeeper): zdolność z kosztem
        // {T} już TAPUJE źródło (object). Oferta, która celuje w SAME ŹRÓDŁO
        // efektem tap_permanent („{2},{T}: tap target creature" na sobie),
        // jest czystym no-opem — źródło jest już tapnięte przez koszt, więc
        // efekt nic nie zmienia. Chowany (gracz zachowuje legalność wg CR 602,
        // ale UI nie sugeruje bezsensownego tapnięcia własnego źródła).
        if (ability.cost?.tap && target?.id === object?.id
          && (Array.isArray(ability.effect) ? ability.effect : [ability.effect])
            .some((e) => e?.type === 'tap_permanent')) continue;
        const xValue = ability.cost?.manaX && target ? (effectivePower(target, state) ?? 0) : undefined;
        const cost = xValue !== undefined ? xValue : (ability.cost?.mana ?? 0);
        if (cost > mana) continue;
        out.push({ objectId: id, abilityIndex: index, ability, targets: [targetId], xValue });
      }
    }
  }
  // Equipment ze zdolnościami NADANYMI nosicielowi (Blazing Torch: „Equipped
  // creature has '{T}, Sacrifice Blazing Torch: Blazing Torch deals 2 damage
  // to any target.'") — zdolność aktywuje kontroler sprzętu, gdy sprzęt jest
  // przypięty do jego stwora. {T} tapuje NOSICIELA (CR 302.6 — choroba
  // przywołania dotyczy stwora), a poświęcenie obejmuje sam sprzęt
  // (cost.sacrificeSelf — poniżej).
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId || !object.equipment?.grantedAbilities) continue;
    if (!object.attachedTo) continue;
    const host = state.objects.get(object.attachedTo);
    if (!host || host.zone !== 'battlefield' || host.controllerId !== playerId
      || (host.kind !== 'creature' && !(host.types ?? []).includes('Creature'))) continue;
    if (host.tapped) continue; // {T} w koszcie — nosiciel musi być odkręcony
    if (tapBlockedBySummoningSickness(state, host, { cost: { tap: true } })) continue;
    for (let index = 0; index < object.equipment.grantedAbilities.length; index += 1) {
      const ability = object.equipment.grantedAbilities[index];
      if (ability?.type !== ABILITY_TYPE.activated) continue;
      if (ability.timing === 'sorcery' && !sorcerySpeed) continue;
      if ((ability.cost?.mana ?? 0) > baseMana) continue;
      if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
      const targetSpec = ability.targets ?? [];
      if (targetSpec.length === 0) {
        out.push({ objectId: id, abilityIndex: index, ability, grantedFromEquipment: true });
        continue;
      }
      if (targetSpec.length === 1 && targetSpec[0].type === 'any_target') {
        // „any target": gracze + stwory na polu bitwy (spójnie z validateTargets).
        const candidates = [...state.players.map((entry) => entry.id),
          ...state.zones.battlefield.filter((bfId) => state.objects.get(bfId)?.kind === 'creature')];
        for (const targetId of candidates) {
          out.push({ objectId: id, abilityIndex: index, ability, grantedFromEquipment: true, targets: [targetId] });
        }
        continue;
      }
      const candidates = legalTargetCandidates(state, playerId, targetSpec[0], object);
      for (const targetId of candidates) {
        out.push({ objectId: id, abilityIndex: index, ability, grantedFromEquipment: true, targets: [targetId] });
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
  // Reinforce (CR 702.29a, Mosquito Guard) — zdolność karty w RĘCE,
  // dowolny moment z priorytetem (jak cycling); koszt mana + DISCARD;
  // efekt celuje w stwora (enumeracja celów jak forecast, L48).
  for (const id of state.zones.hand) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId) continue;
    for (let index = 0; index < (object.abilities ?? []).length; index += 1) {
      const ability = object.abilities[index];
      if (ability?.type !== ABILITY_TYPE.activated || !ability.reinforce) continue;
      const effManaReinforce = effectiveAbilityManaCost(state, playerId, ability, object);
      if (effManaReinforce > baseMana) continue;
      if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
      const targetSpec = ability.targets ?? [];
      if (targetSpec.length === 0) {
        out.push({ objectId: id, abilityIndex: index, ability });
        continue;
      }
      const candidates = legalTargetCandidates(state, playerId, targetSpec[0], object);
      for (const targetId of candidates) {
        out.push({ objectId: id, abilityIndex: index, ability, targets: [targetId] });
      }
    }
  }
  // Forecast (CR 702.94, Piercing Rays) — zdolność z RĘKI, tylko w swoim
  // upkeepie, raz na turę. Karta zostaje w ręce (koszt to UJAWNIENIE).
  if (state.turn?.step === 'upkeep' && state.turn.activePlayerId === playerId) {
    for (const id of state.zones.hand) {
      const object = state.objects.get(id);
      if (object?.controllerId !== playerId) continue;
      for (let index = 0; index < (object.abilities ?? []).length; index += 1) {
        const ability = object.abilities[index];
        if (ability?.type !== ABILITY_TYPE.activated || !ability.forecast) continue;
        // „Only once each turn" — jak oncePerTurn (Snarling Wolf).
        if (state.abilityActivatedThisTurn?.[`${id}:${index}`]) continue;
        const mana = effectiveAbilityManaCost(state, playerId, ability, object);
        if (mana > baseMana) continue;
        if (!canPayColoredCost(state, playerId, colorRequirementsOf(ability.cost))) continue;
        const targetSpec = ability.targets ?? [];
        if (targetSpec.length === 0) {
          out.push({ objectId: id, abilityIndex: index, ability });
          continue;
        }
        const candidates = legalTargetCandidates(state, playerId, targetSpec[0], object);
        for (const targetId of candidates) {
          out.push({ objectId: id, abilityIndex: index, ability, targets: [targetId] });
        }
      }
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
export function activateAbility(state, playerId, objectId, abilityIndex, attackerId, targets, xValue, crewCreatureIds, tapCreatureId, tapOtherCreatureId, sacrificeLandId, opponentTargetIdArg, grantedFromEquipmentArg) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId) throw new Error('Nielegalny obiekt zdolności');
  // Zdolność NADANA nosicielowi przez przypięty sprzęt (Blazing Torch) żyje
  // w `equipment.grantedAbilities` — index liczony względem tej listy
  // (spójnie z ofertą legalActivatedAbilities, komenda niesie flagę
  // grantedFromEquipment). Zwykłe zdolności (np. equip samego sprzętu)
  // czytamy z object.abilities — rozróżnienie PO FLADZE, bo obie listy
  // mogą istnieć na tym samym obiekcie (equip + granted).
  const ability = grantedFromEquipmentArg
    ? (object.equipment?.grantedAbilities ?? [])[abilityIndex]
    : (object.abilities ?? [])[abilityIndex];
  if (!ability || ability.type !== ABILITY_TYPE.activated) throw new Error('Nieznana zdolność aktywowana');
  if (ability.timing === 'sorcery') {
    const sorcerySpeed = state.turn.activePlayerId === playerId
      && ['precombat_main', 'postcombat_main'].includes(state.turn.phase)
      && state.zones.stack.length === 0;
    if (!sorcerySpeed) throw new Error('Zdolność tylko w swoją fazę main przy pustym stosie');
  }

  // M170/C: transform one-shot — odrzuca przed płatnością, gdy aktywacja
  // tego samego źródła czeka już na stosie (spójnie z ofertą, L48).
  {
    const effs = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
    if (effs.length === 1 && effs[0]?.type === 'transform' && transformActivationPending(state, objectId)) {
      throw new Error('Transform już czeka na stosie');
    }
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
  if (ability.reinforce) {
    return activateReinforce(state, playerId, object, abilityIndex, ability, targets);
  }
  if (ability.forecast) {
    return activateForecast(state, playerId, object, abilityIndex, ability, targets);
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
  // na polu bitwy taka zdolność nie istnieje (CR 113.6: zdolność karty działa
  // w strefie, z której jej tekst to przewiduje). Zwykłe zdolności aktywowane
  // wymagają permanenta na polu bitwy.
  if (ability.fromGraveyard) {
    if (object.zone !== 'graveyard') throw new Error('Zdolność z grobu wymaga źródła w grobie');
  } else if (object.zone !== 'battlefield') {
    throw new Error('Zdolność wymaga permanenta na polu bitwy');
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
    chosenTargets = validateTargets(state, targetSpec, targets, playerId, object.colors ?? [], object).map((entry) => entry.id);
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
  // M116 (Cuombajj Witches): „and 1 damage to any target of an OPPONENT'S
  // choice" — drugi cel wskazuje przeciwnik, a cele wybiera się PRZED zapłatą
  // kosztów (CR 601.2c przed 601.2h). Wstrzymujemy więc całą aktywację
  // (pendingAbilityActivation, jak przy koszcie „odrzuć kartę") i oddajemy
  // priorytet przeciwnikowi.
  if (ability.opponentChoosesTarget && opponentTargetIdArg === undefined) {
    const opponentId = state.players.find((entry) => entry.id !== playerId)?.id ?? null;
    if (opponentId) {
      state.pendingOpponentTarget = {
        playerId: opponentId,
        activatingPlayerId: playerId,
        sourceId: objectId,
        cardId: object.cardId ?? null,
        spec: Object.freeze({ ...ability.opponentChoosesTarget }),
        restorePriorityTo: state.turn.priorityPlayerId,
      };
      state.pendingAbilityActivation = {
        playerId, objectId, abilityIndex, attackerId, targets, xValue,
        crewCreatureIds, tapCreatureId, tapOtherCreatureId, sacrificeLandId,
        grantedFromEquipment: grantedFromEquipmentArg ?? false,
      };
      state.turn.priorityPlayerId = opponentId;
      const e = event('opponent_target_required', {
        playerId: opponentId, activatingPlayerId: playerId,
        sourceId: objectId, cardId: object.cardId ?? null,
      });
      state.events.push(e);
      return e;
    }
  }
  const discardCount = cost.discardCard ? 1 : (cost.discardCards ?? 0);
  if (discardCount > 0) {
    const handIds = state.zones.hand.filter((handId) => state.objects.get(handId)?.controllerId === playerId);
    state.pendingDiscardChoice = {
      playerId, count: discardCount, handIds, purpose: 'cost',
      sourceCardId: object.cardId, restorePriorityTo: state.turn.priorityPlayerId,
    };
    state.pendingAbilityActivation = {
      playerId, objectId, abilityIndex, attackerId, targets, xValue, crewCreatureIds, tapCreatureId, tapOtherCreatureId, sacrificeLandId,
      grantedFromEquipment: grantedFromEquipmentArg ?? false,
    };
    state.turn.priorityPlayerId = playerId;
    const e = event('discard_choice_required', {
      playerId, count: discardCount, cardIds: [...handIds], purpose: 'cost',
      sourceCardId: object.cardId,
    });
    state.events.push(e);
    return e;
  }
  return performActivation(state, { playerId, objectId, abilityIndex, attackerId, targets, xValue, crewCreatureIds, tapCreatureId, tapOtherCreatureId, sacrificeLandId, opponentTargetId: opponentTargetIdArg, grantedFromEquipment: grantedFromEquipmentArg ?? false });
}

/**
 * Wykonuje aktywację po walidacji (używane też po dokończeniu blokującej
 * decyzji kosztu-discard — Temat 4): płaci koszty atomowo (CR 601.2h),
 * aplikuje efekty i emituje ability_activated. Źródło/cel czyta ŚWIEŻO ze
 * stanu (między walidacją a wykonaniem mogła zajść decyzja gracza). Zwraca
 * zdarzenie ability_activated (albo null).
 */
export function performActivation(state, ctx) {
  const { playerId, objectId, abilityIndex, attackerId, targets, xValue, crewCreatureIds, tapCreatureId, tapOtherCreatureId, sacrificeLandId } = ctx;
  const opponentTargetId = ctx.opponentTargetId;
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId) throw new Error('Nielegalny obiekt zdolności');
  // Zdolność NADANA nosicielowi przez przypięty sprzęt (Blazing Torch) żyje
  // w `equipment.grantedAbilities` — spójnie z activateAbility i ofertą;
  // rozróżnienie po fladze grantedFromEquipment (jak wyżej).
  const ability = ctx.grantedFromEquipment
    ? (object.equipment?.grantedAbilities ?? [])[abilityIndex]
    : (object.abilities ?? [])[abilityIndex];
  if (!ability || ability.type !== ABILITY_TYPE.activated) throw new Error('Nieznana zdolność aktywowana');
  if (ability.fromGraveyard) {
    if (object.zone !== 'graveyard') throw new Error('Zdolność z grobu wymaga źródła w grobie');
  } else if (object.zone !== 'battlefield') {
    throw new Error('Zdolność wymaga permanenta na polu bitwy');
  }
  const cost = ability.cost ?? {};
  const colorReqs = colorRequirementsOf(cost);
  const targetSpec = (ability.targets ?? []).map((spec) => (spec.type === 'land_you_control'
    ? { ...spec, controllerId: playerId } : spec));
  let chosenTargets = [];
  if (targetSpec.length > 0) {
    if (!Array.isArray(targets) || targets.length !== targetSpec.length) throw new Error('Nieprawidłowa liczba celów zdolności');
    chosenTargets = validateTargets(state, targetSpec, targets, playerId, object.colors ?? [], object).map((entry) => entry.id);
    // M116: cel wskazany przez PRZECIWNIKA dochodzi jako kolejny slot celów
    // (drugi efekt obrażeń czyta go przez targetIndex).
    if (ability.opponentChoosesTarget && opponentTargetId !== undefined) {
      validateTargets(state, [ability.opponentChoosesTarget], [opponentTargetId], playerId, object.colors ?? [], object);
      chosenTargets = [...chosenTargets, opponentTargetId];
    }
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
  const saddleOrCrew = cost.crewPower ?? cost.saddlePower;
  if (saddleOrCrew) {
    if (!Array.isArray(crewCreatureIds) || crewCreatureIds.length === 0) throw new Error('Crew/Saddle wymaga stworów do tapnięcia');
    if (new Set(crewCreatureIds).size !== crewCreatureIds.length) throw new Error('Stwór crew/saddle nie może wystąpić więcej niż raz');
    let crewPowerSum = 0;
    for (const crewId of crewCreatureIds) {
      const candidate = state.objects.get(crewId);
      if (!candidate || candidate.zone !== 'battlefield' || candidate.controllerId !== playerId
        || candidate.kind !== 'creature' || candidate.tapped || candidate.id === objectId) {
        throw new Error('Nielegalny stwór do crew/saddle');
      }
      crewPowerSum += effectivePower(candidate, state) ?? 0;
    }
    if (crewPowerSum < saddleOrCrew) throw new Error('Za mała łączna moc stworów do crew/saddle');
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
  // Koszt „{T}" zdolności NADANEJ nosicielowi (Blazing Torch): tapuje się
  // NOSICIEL (stwór ze sprzętem), nie sam sprzęt — zdolność ma nosiciel
  // („Equipped creature has ..."), więc CR 302.6 (choroba przywołania)
  // dotyczy stwora, nie artefaktu. Spójnie z ofertą (legalActivatedAbilities).
  if (cost.tapHost) {
    const host = object.attachedTo ? state.objects.get(object.attachedTo) : null;
    if (!host || host.zone !== 'battlefield' || host.controllerId !== playerId
      || (host.kind !== 'creature' && !(host.types ?? []).includes('Creature'))) {
      throw new Error('Brak nosiciela sprzętu (koszt tap)');
    }
    if (host.tapped) throw new Error('Nosiciel jest już tapped');
    if (tapBlockedBySummoningSickness(state, host, { cost: { tap: true } })) {
      throw new Error('Choroba przywołania: nosiciel bez haste nie aktywuje {T} w turze wejścia');
    }
    tapObject(state, host.id, playerId);
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
  // M115: {X}{B} — X PLUS stała część kosztu (Entrancing Lyre ma samo {X},
  // więc `cost.mana` jest tam zerowe i zachowanie się nie zmienia).
  const manaCost = cost.manaX ? (xValue ?? 0) + (cost.mana ?? 0) : effManaSpend;
  if (manaCost > 0) {
    spendMana(state, playerId, manaCost, colorReqs);
  }
  // M115 (Krumar Initiate): „Pay X life" to KOSZT (CR 601.2h) — płacony
  // przed efektem i niezwracalny, także gdy zdolność później fizzluje.
  if (cost.payLifeX) {
    const x = xValue ?? 0;
    const player = state.players.find((entry) => entry.id === playerId);
    if (!player || (player.life ?? 0) < x) throw new Error('Za mało życia na koszt (Pay X life)');
    if (x > 0) changeLife(state, playerId, -x);
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
    // dostają obiekt z GROBU, nie dawny obiekt z pola bitwy.
    const sacrificed = state.events.slice(sacrificeMarker).find((entry) => entry.type === 'permanent_sacrificed');
    effectSource = (sacrificed && state.objects.get(sacrificed.objectId)) ?? object;
  }
  // Koszt „Sacrifice a land" (Seismic Monstrosaur): poświęcenie własnego
  // landa (wybór gracza niesie komenda sacrificeLandId) — następuje PRZED
  // efektem (CR 601.2h), jak sacrificeSelf.
  if (cost.sacrificeLand) {
    const land = sacrificeLandId ? state.objects.get(sacrificeLandId) : null;
    if (!land || land.zone !== 'battlefield' || land.controllerId !== playerId
      || (land.kind !== 'land' && !(land.types ?? []).includes('Land'))) {
      throw new Error('Nielegalny land do poświęcenia (koszt)');
    }
    const toZone = (land.counters ?? {}).finality > 0 ? 'exile' : 'graveyard';
    const destId = `${toZone}-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, sacrificeLandId, toZone, destId);
    state.events.push(event('permanent_sacrificed', {
      fromId: sacrificeLandId, objectId: destId, playerId, cardId: moved.cardId, additionalCost: true, toZone,
    }));
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
  // „Activate only once each turn\" (Snarling Wolf): zapisujemy aktywację,
  // żeby legalActivatedAbilities ją wycofała do końca tury.
  if (ability.oncePerTurn) {
    state.abilityActivatedThisTurn = {
      ...(state.abilityActivatedThisTurn ?? {}),
      [`${objectId}:${abilityIndex}`]: true,
    };
  }
  // D (2026-08-11, MTG rules CR 602.2a): NIEmany zdolności aktywowane idą NA
  // STOS (przeciwnik może odpowiedzieć instanitem). WYJĄTKI (rozstrzygają się
  // od razu): zdolności many (isActivatedManaAbility — add_mana bez celów) oraz
  // morph/megamorph twarzą do góry (specjalna akcja, CR 702.36e — nie używa
  // stosu). Koszty (tap/mana/poświęcenie) już zapłacone — kolejkujemy wpis na
  // stos; efekty zastosuje resolveTopOfStack.
  const isFaceUpAction = ability.keyword === 'morph' || ability.keyword === 'megamorph';
  if (!isActivatedManaAbility(ability) && !isFaceUpAction) {
    return queueActivatedAbilityToStack(state, {
      playerId, objectId, abilityIndex, ability,
      effectSourceId: effectSource.id,
      effectTargets,
      // M115: X to WARTOŚĆ WYBRANA przez gracza, nie łączna zapłacona mana —
      // przy koszcie {X}{B} te liczby się różnią (X=2 → 3 many).
      xValue: cost.manaX ? (xValue ?? 0) : undefined,
      crewCreatureIds: crewCreaturesToTap ?? undefined,
      // M153/A1: Station — id zatapianego INNEGO stwora (koszt tapOtherCreature),
      // żeby log podał jego nazwę.
      stationTappedCreatureId: otherCreatureToTap ?? undefined,
    });
  }
  for (const effect of effectList) applyEffect(state, effect, effectSource, effectTargets);
  // cardId jedzie w evencie, bo źródło mogło zniknąć w trakcie kosztu
  // (Sacrifice this — Panic Spellbomb: obiekt grobu ma nowe id, a log/UI
  // ma nadal podać nazwę karty). effectTypes = krótki opis „co robi
  // zdolność" dla logu stołu (zamiast „?\" po nazwach funkcji).
  const manaColors = collectManaColors(effectList);
  const activated = event('ability_activated', {
    playerId, objectId, abilityIndex,
    cardId: effectSource.cardId ?? object.cardId,
    // M158/A (zgłoszenie właściciela): nazwa zdolności kluczowej (Morph,
    // Megamorph) — bez tego log mówił tylko „aktywuje zdolność: Woolly
    // Loxodon", nie mówiąc JAKĄ zdolność.
    keyword: ability.keyword ?? null,
    effectTypes: effectList.map((e) => e?.type).filter(Boolean),
    // M150/C2: kolory wyprodukowanej many (Jeskai Devotee) w logu.
    ...(manaColors.length ? { manaColors } : {}),
    // M73d (F): targets tylko dla zdolności z celami (spójnie z queue...).
    targets: (ability.targets?.length ? chosenTargets : []),
    // M115: X to WARTOŚĆ WYBRANA przez gracza, nie łączna zapłacona mana —
      // przy koszcie {X}{B} te liczby się różnią (X=2 → 3 many).
      xValue: cost.manaX ? (xValue ?? 0) : undefined,
    // Crew (CR 701.36): zatapnięte stwory widoczne w logu.
    ...(crewCreaturesToTap ? { crewCreatureIds: [...crewCreaturesToTap] } : {}),
    // M153/A1: Station — id zatapianego INNEGO stwora w logu.
    ...(otherCreatureToTap ? { stationTappedCreatureId: otherCreatureToTap } : {}),
  });
  state.events.push(activated);
  return activated;
}

/** Czy to zdolność many (CR 605.1a): dodaje manę i nie ma celów. */
function isActivatedManaAbility(ability) {
  if ((ability.targets ?? []).length > 0) return false;
  const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
  // M154 (Batch 38, Pristine Talisman): „{T}: Add {C}. You gain 1 life." —
  // zdolność many z dojazdem zysku życia. Mana abilities rozstrzygają się
  // natychmiast bez stosu (CR 605.1a). Zysk życia dopuszczamy TYLKO jako
  // rider obok add_mana (sam gain_life — Soulmender {T}: zyskaj 1 życia — to
  // zwykła zdolność na stosie, nie mana ability).
  return effects.length > 0 && effects.some((e) => e?.type === 'add_mana')
    && effects.every((e) => e?.type === 'add_mana' || e?.type === 'gain_life');
}

/**
 * D (2026-08-11, MTG rules): NIEmany zdolności aktywowane idą NA STOS
 * (CR 602.2a) — przeciwnik może odpowiedzieć instanitem przed rozstrzygnięciem
 * (Soulmender {T}: zyskaj 1 życia — zgłoszenie właściciela). Zdolność many
 * (add_mana, CR 605.1a) i specjalne akcje (morph twarzą do góry) rozstrzygają
 * się od razu. Tutaj: koszty są już zapłacone, kolejkujemy wpis na stos z LKI
 * źródła (CR 603.10), a efekty zastosuje resolveTopOfStack.
 */
export function queueActivatedAbilityToStack(state, { playerId, objectId, abilityIndex, ability, effectSourceId, effectTargets, xValue, crewCreatureIds, stationTappedCreatureId = null, eventExtra = {} }) {
  const source = state.objects.get(effectSourceId) ?? state.objects.get(objectId) ?? {
    id: effectSourceId, controllerId: playerId, cardId: null, zone: 'none', kind: null,
  };
  const sourceLki = Object.freeze({
    power: source.power, toughness: source.toughness,
    powerModifier: source.powerModifier ?? 0, toughnessModifier: source.toughnessModifier ?? 0,
    faceDown: source.faceDown ?? false,
  });
  const id = `ability-${state.objectSequence++}`;
  const entry = Object.freeze({
    id, zone: 'stack', controllerId: playerId,
    cardId: source.cardId ?? (state.objects.get(objectId)?.cardId ?? null),
    kind: 'activated',
    activatedEntry: Object.freeze({
      playerId, objectId, abilityIndex,
      ability: Object.freeze({ ...ability }),
      sourceId: effectSourceId,
      targets: [...(effectTargets ?? [])],
      xValue: xValue ?? undefined,
      crewCreatureIds: crewCreatureIds ? [...crewCreatureIds] : undefined,
      sourceLki,
    }),
  });
  state.objects.set(id, entry);
  state.zones.stack.push(id);
  const stackManaColors = collectManaColors(Array.isArray(ability.effect) ? ability.effect : [ability.effect]);
  const activated = event('ability_activated', {
    playerId, objectId: effectSourceId, cardId: entry.cardId, abilityIndex,
    keyword: ability.keyword ?? null,
    effectTypes: (Array.isArray(ability.effect) ? ability.effect : [ability.effect]).map((e) => e?.type).filter(Boolean),
    // M150/C2: kolory wyprodukowanej many w logu.
    ...(stackManaColors.length ? { manaColors: stackManaColors } : {}),
    // M73d (F): „targets" tylko gdy zdolność MA cele — bezcelowe aktywacje
    // (Soulmender, crew, Cellar Door) nie logują „→ cel: <źródło>" (audyt
    // żywym testerem). effectTargets dla bezcelowych to [objectId] — szum.
    targets: (ability.targets?.length ? [...(effectTargets ?? [])] : []),
    xValue: xValue ?? undefined,
    onStack: true,
    ...(crewCreatureIds ? { crewCreatureIds: [...crewCreatureIds] } : {}),
    // M153/A1: Station tapuje INNEGO stwora (koszt tapOtherCreature) — jego id
    // musi trafić do logu, żeby gracz wiedział, kogo bot zatapiał. Ten sam
    // wzorzec co crewCreatureIds.
    ...(stationTappedCreatureId ? { stationTappedCreatureId } : {}),
    ...eventExtra,
  });
  state.events.push(activated);
  return entry;
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
  // Odrzucenie karty to KOSZT (CR 702.28: „Discard this card: ...") —
  // następuje przed wejściem zdolności na stos (CR 601.2h).
  const graveId = `grave-${state.objectSequence++}`;
  const discarded = moveObjectDirectly(state, cardObject.id, 'graveyard', graveId);
  // Audyt PR #41 (B7.2, CR 602.2a): cycling to aktywowana zdolność NA STOSIE —
  // dobranie (zwykły) albo szukanie (typecycling) następuje przy rozstrzyganiu,
  // po pełnej rundzie passów (przeciwnik może odpowiedzieć instanitem).
  const cyclingAbility = Object.freeze({
    type: 'activated',
    cycling: Object.freeze({ ...qualifier }),
    effect: Object.freeze({ type: '__cycling_resolve__' }),
    cost: Object.freeze({ mana: ability.cost?.mana ?? 0, colors: Object.freeze([...(ability.cost?.colors ?? [])]) }),
  });
  return queueActivatedAbilityToStack(state, {
    playerId, objectId: discarded.id, abilityIndex,
    ability: cyclingAbility,
    effectSourceId: discarded.id,
    effectTargets: [],
    eventExtra: { cycling: true },
  });
}
/**
 * M166/B (Reinforce, CR 702.29a, Mosquito Guard): „{1}{W}, Discard this
 * card: Put a +1/+1 counter on target creature." Zdolność karty w RĘCE:
 * koszt = mana + ODRZUCENIE karty (przed wejściem zdolności na stos,
 * CR 117.11/601.2h jak cycling), efekt przez stos z wybranym celem —
 * przeciwnik może odpowiedzieć (cel może zniknąć → efekt fizzluje).
 */
function activateReinforce(state, playerId, cardObject, abilityIndex, ability, targets) {
  if (cardObject.zone !== 'hand') throw new Error('Reinforce aktywuje się z ręki');
  const reinforceReqs = colorRequirementsOf(ability.cost);
  if (reinforceReqs.length > 0 && !canPayColoredCost(state, playerId, reinforceReqs)) {
    throw new Error('Brak kolorowego źródła many na reinforce');
  }
  const effMana = effectiveAbilityManaCost(state, playerId, ability, cardObject);
  spendMana(state, playerId, effMana, reinforceReqs);
  // Odrzucenie karty to KOSZT (przed stosem) — karta do grobu.
  const graveId = `grave-${state.objectSequence++}`;
  const discarded = moveObjectDirectly(state, cardObject.id, 'graveyard', graveId);
  state.events.push(event('card_discarded', {
    playerId, fromId: cardObject.id, objectId: graveId, cardId: discarded.cardId,
    cost: true, reinforce: true,
  }));
  // Kopia zdolności do kolejki (źródło poleci do grobu — licznik celuje dalej).
  const reinforceAbility = Object.freeze({
    type: 'activated',
    reinforce: Object.freeze({ ...ability.reinforce }),
    effect: Array.isArray(ability.effect) ? Object.freeze(ability.effect.map((e) => Object.freeze({ ...e }))) : Object.freeze({ ...ability.effect }),
    targets: ability.targets ? Object.freeze(ability.targets.map((t) => Object.freeze({ ...t }))) : null,
    cost: Object.freeze({ mana: effMana, colors: Object.freeze([...(ability.cost?.colors ?? [])]) }),
  });
  let chosenTargets = [];
  const targetSpec = ability.targets ?? [];
  if (targetSpec.length > 0) {
    if (!Array.isArray(targets) || targets.length !== targetSpec.length) throw new Error('Nieprawidłowa liczba celów reinforce');
    chosenTargets = validateTargets(state, targetSpec, targets, playerId, cardObject.colors ?? [], cardObject).map((e) => e.id);
  }
  return queueActivatedAbilityToStack(state, {
    playerId, objectId: cardObject.id, abilityIndex,
    ability: reinforceAbility,
    effectSourceId: graveId,
    effectTargets: chosenTargets,
    eventExtra: { reinforce: true },
  });
}

function activateChannel(state, playerId, cardObject, abilityIndex, ability) {
  if (cardObject.zone !== 'hand') throw new Error('Channel aktywuje się z ręki');
  const channelReqs = colorRequirementsOf(ability.cost);
  if (channelReqs.length > 0 && !canPayColoredCost(state, playerId, channelReqs)) {
    throw new Error('Brak kolorowego źródła many na channel');
  }
  const effMana = effectiveAbilityManaCost(state, playerId, ability, cardObject);
  spendMana(state, playerId, effMana, channelReqs);
  // Odrzucenie karty to koszt (CR 702.85: „Discard [card]: ...").
  const graveId = `grave-${state.objectSequence++}`;
  const discarded = moveObjectDirectly(state, cardObject.id, 'graveyard', graveId);
  // Audyt PR #41 (B7.2, CR 602.2a): channel to aktywowana zdolność NA STOSIE —
  // szukanie (wybór gracza, resolve_search_choice) następuje przy rozstrzyganiu.
  const channelAbility = Object.freeze({
    type: 'activated',
    channel: Object.freeze({ types: ['Basic', 'Land'] }),
    effect: Object.freeze({ type: '__channel_resolve__' }),
    cost: Object.freeze({ mana: effMana, colors: Object.freeze([...(ability.cost?.colors ?? [])]) }),
  });
  return queueActivatedAbilityToStack(state, {
    playerId, objectId: discarded.id, abilityIndex,
    ability: channelAbility,
    effectSourceId: discarded.id,
    effectTargets: [],
    eventExtra: { channel: true },
  });
}

/**
 * Forecast (CR 702.94, Piercing Rays): zdolność z RĘKI. Koszt: mana +
 * UJAWNIENIE karty (karta zostaje w ręce); tylko w swoim upkeepie, raz na
 * turę. Efekt idzie na stos (CR 602.2a) — przeciwnik może odpowiedzieć.
 */
function activateForecast(state, playerId, cardObject, abilityIndex, ability, targets) {
  if (cardObject.zone !== 'hand') throw new Error('Forecast aktywuje się z ręki');
  if (state.turn?.step !== 'upkeep' || state.turn.activePlayerId !== playerId) {
    throw new Error('Forecast tylko w swoim upkeepie');
  }
  if (state.abilityActivatedThisTurn?.[`${cardObject.id}:${abilityIndex}`]) {
    throw new Error('Forecast tylko raz na turę');
  }
  const forecastReqs = colorRequirementsOf(ability.cost);
  if (forecastReqs.length > 0 && !canPayColoredCost(state, playerId, forecastReqs)) {
    throw new Error('Brak kolorowego źródła many na forecast');
  }
  const effMana = effectiveAbilityManaCost(state, playerId, ability, cardObject);
  spendMana(state, playerId, effMana, forecastReqs);
  // „Only once each turn": zapisujemy aktywację (jak oncePerTurn).
  state.abilityActivatedThisTurn = {
    ...(state.abilityActivatedThisTurn ?? {}),
    [`${cardObject.id}:${abilityIndex}`]: true,
  };
  // Ujawnienie karty (koszt) — wróg widzi, co ujawniono (jawne dane).
  state.events.push(event('card_revealed', {
    playerId, cardId: cardObject.cardId, objectId: cardObject.id, fromHand: true,
  }));
  const forecastAbility = Object.freeze({
    type: 'activated',
    forecast: true,
    effect: Array.isArray(ability.effect) ? Object.freeze(ability.effect.map((e) => Object.freeze({ ...e }))) : Object.freeze({ ...ability.effect }),
    targets: ability.targets ? Object.freeze(ability.targets.map((t) => Object.freeze({ ...t }))) : null,
    cost: Object.freeze({ mana: effMana, colors: Object.freeze([...(ability.cost?.colors ?? [])]) }),
  });
  // Cele: walidacja jak w głównej ścieżce (spójnie z ofertą — L48).
  let chosenTargets = [];
  const targetSpec = ability.targets ?? [];
  if (targetSpec.length > 0) {
    if (!Array.isArray(targets) || targets.length !== targetSpec.length) throw new Error('Nieprawidłowa liczba celów forecast');
    chosenTargets = validateTargets(state, targetSpec, targets, playerId, cardObject.colors ?? [], cardObject).map((e) => e.id);
  }
  return queueActivatedAbilityToStack(state, {
    playerId, objectId: cardObject.id, abilityIndex,
    ability: forecastAbility,
    effectSourceId: cardObject.id,
    effectTargets: chosenTargets,
    eventExtra: { forecast: true },
  });
}

/**
 * Equip (CR 702.6): zapłać koszt equip i załóż equipment na własnego stwora.
 * Szybkość sorcery (faza main aktywnego gracza, pusty stos). Equip może też
 * przełożyć equipment między własnymi stworami (attachEquipmentToCreature
 * przepina obiekt, który już był załączony).
 */
function activateEquip(state, playerId, object, abilityIndex, targets) {
  if (object.zone !== 'battlefield' || !object.equipment) throw new Error('Equip działa tylko na equipment na polu bitwy');
  // M101/B1 (CR 702.6b): „Equip only as a sorcery" — walidacja spójna z ofertą
  // (legalActivatedAbilities). Bez tego execute przyjmowałby komendę spoza
  // okna sorcery, mimo że widok jej nie proponuje.
  const sorceryWindow = state.turn.activePlayerId === playerId
    && ['precombat_main', 'postcombat_main'].includes(state.turn.phase)
    && state.zones.stack.length === 0;
  if (!sorceryWindow) throw new Error('Equip tylko w swoją fazę main przy pustym stosie (CR 702.6b)');
  if (!Array.isArray(targets) || targets.length !== 1) throw new Error('Equip wymaga dokładnie jednego celu');
  // Walidacja celu przy aktywacji (CR 601.2h — przed jakąkolwiek mutacją);
  // przy rozstrzyganiu cel jest rewalidowany (CR 608.2b).
  const target = validateTargets(state, [Object.freeze({ type: 'creature' })], targets, playerId, object.colors ?? [], object)[0];
  if (target.controllerId !== playerId) throw new Error('Equip celuje wyłącznie we własne stwory');
  spendMana(state, playerId, object.equipment.equip ?? 0);
  // Audyt PR #41 (B7.2, CR 602.2a): equip trafia na STOS jako zdolność
  // aktywowana — przeciwnik może odpowiedzieć (np. zniszczyć cel); założenie
  // następuje przy rozstrzyganiu (resolveEquipEntry), a cel nielegalny przy
  // rozstrzyganiu = fizzle (equipment zostaje odłączony). Samo OKNO aktywacji
  // jest sorcery-speed (CR 702.6b — M101/B1).
  const equipAbility = Object.freeze({
    type: 'activated', keyword: 'equip',
    targets: Object.freeze([Object.freeze({ type: 'creature' })]),
    effect: Object.freeze({ type: '__equip_attach__' }),
    cost: Object.freeze({ mana: object.equipment.equip ?? 0, colors: object.equipment.colors ?? [] }),
  });
  return queueActivatedAbilityToStack(state, {
    playerId, objectId: object.id, abilityIndex,
    ability: equipAbility,
    effectSourceId: object.id,
    effectTargets: [target.id],
    eventExtra: { keyword: 'equip' },
  });
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
  // Zwrot atakującego do ręki to KOSZT (CR 702.48: „Return an unblocked
  // attacker you control to hand: ...") — następuje przed wejściem zdolności
  // na stos (CR 601.2h). Atakujący znika z combat PRZED zmianą strefy, żeby
  // inwariant combat (odwołania tylko do battlefield) był spełniony w trakcie.
  state.combat.attackers = state.combat.attackers.filter((id) => id !== attackerId);
  const handId = `hand-${state.objectSequence++}`;
  moveObjectDirectly(state, attackerId, 'hand', handId);
  // Audyt PR #41 (B7.2, CR 702.48a + 602.2a): ninjutsu to aktywowana zdolność
  // NA STOSIE — karta wchodzi na pole bitwy zatapnięta i atakująca przy
  // rozstrzyganiu (po pełnej rundzie passów; przeciwnik może odpowiedzieć
  // instanitem, np. zniszczyć kartę z ręki nie zdąży — ale może kontrować).
  const ninjutsuAbility = Object.freeze({
    type: 'activated', keyword: 'ninjutsu',
    effect: Object.freeze({ type: '__ninjutsu_enter__' }),
    cost: Object.freeze({ mana: ability.cost?.mana ?? 0, colors: Object.freeze([...(ability.cost?.colors ?? [])]) }),
  });
  return queueActivatedAbilityToStack(state, {
    playerId, objectId: cardObject.id, abilityIndex,
    ability: ninjutsuAbility,
    effectSourceId: cardObject.id,
    effectTargets: [attackerId],
    eventExtra: { attackerId },
  });
}
