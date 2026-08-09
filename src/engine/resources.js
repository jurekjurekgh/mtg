import { event } from '../protocol/types.js';
import { moveObjectDirectly } from './objects.js';
import { effectiveKeywords, untapControlled } from './permanents.js';
import { addCounter } from './counters.js';
import { changeLife } from './players.js';
import { MANA_COSTS } from '../cards/mana-costs-data.js';
import { parseManaCost, canPayManaCost, costReductionForSpell, reduceGenericCost, matchColorRequirements, coloredPipsOf } from './mana-cost.js';
import { allControlledManaSources, getSourceForObject, manaUnitKey } from './mana-sources.js';

/** Idempotentna inicjalizacja zasobów; createGameState wykonuje ją automatycznie. */
export function initializeResources(state) {
  for (const player of state.players) {
    player.mana = 0;
    // KOLOROWA PULA many: mapa jednostek po profilu kolorów (klucz =
    // manaUnitKey, np. 'U', 'UR', 'WUBRG' dowolny, '' bezbarwna). Suma wartości
    // == player.mana. player.mana zostaje liczbą (total) dla amount/widoku.
    player.manaPool = {};
    // Pula many pochodzącej ze Skarbów (Marut: „mana from a Treasure was
    // spent to cast it"). Zeruje się razem z maną na starcie tury.
    player.treasureMana = 0;
    player.landPlays = 1;
  }
  return state;
}

export function addMana(state, playerId, amount, { colors = ['W', 'U', 'B', 'R', 'G'], fromTreasure = false } = {}) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Mana musi być nieujemną liczbą całkowitą');
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) throw new Error('Nieznany gracz');
  if (!player.manaPool) player.manaPool = {};
  player.mana += amount;
  // KOLOROWA PULA: jednostka many niesie profil kolorów (colors). Default
  // (brak colors) = dowolny kolor — wygoda TESTÓW (realna gra ZAWSZE podaje
  // jawny colors z tapLandForMana/efektów; jawne colors:[] = bezbarwna).
  const key = manaUnitKey(colors);
  player.manaPool[key] = (player.manaPool[key] ?? 0) + amount;
  // Mana wytworzona przez Skarb jest identyfikowalna w puli (CR 106 i Marut) —
  // śledzimy ją oddzielnym licznikiem, żeby spendMana mogła ją wydać w sposób
  // jawny dla efektów „if mana from a Treasure was spent".
  if (fromTreasure && amount > 0) player.treasureMana = (player.treasureMana ?? 0) + amount;
  const e = event('mana_changed', { playerId, amount, total: player.mana, colors, fromTreasure: Boolean(fromTreasure) });
  state.events.push(e);
  return e;
}

/** Rozwija kolorową pulę do listy jednostek (każda = tablica kolorów do pip). */
export function expandManaPool(manaPool) {
  const units = [];
  for (const [key, count] of Object.entries(manaPool ?? {})) {
    const colors = key === '' ? [] : key.split('');
    for (let i = 0; i < count; i += 1) units.push(colors);
  }
  return units;
}

/**
 * Konsumpcja z kolorowej puli: pipy kolorowe (`requirements`) dopasowuje do
 * jednostek o przecinającym się zbiorze kolorów (backtracking — hasColor
 * gwarantuje pokrycie), resztę (`amount` − pipy) konsumuje od jednostek o
 * NAJMNIEJSZEJ liczbie kolorów (bezb. najpierw — zachowuje kolorowe na później).
 * Mutuje player.manaPool (nie player.mana — tym zajmuje się spendMana).
 */
export function consumeManaPool(player, amount, requirements) {
  const units = expandManaPool(player.manaPool);
  const n = units.length;
  const pipUsed = new Array(n).fill(false);
  if (requirements.length > 0) {
    const matchPips = (pos) => {
      if (pos >= requirements.length) return true;
      for (let i = 0; i < n; i += 1) {
        if (pipUsed[i]) continue;
        if (requirements[pos].some((c) => units[i].includes(c))) {
          pipUsed[i] = true;
          if (matchPips(pos + 1)) return true;
          pipUsed[i] = false;
        }
      }
      return false;
    };
    // Asercja dopasowania (root cause M40/M41): nieudane pokrycie pipów to
    // BŁĄD, nie cicha zła płatność ({U} z {W}) — rzucamy przed konsumpcją,
    // więc stan puli pozostaje nietknięty.
    if (!matchPips(0)) throw new Error('Brak kolorowej many w puli');
  }
  const consume = new Array(n).fill(false);
  let toConsume = amount;
  for (let i = 0; i < n && toConsume > 0; i += 1) if (pipUsed[i]) { consume[i] = true; toConsume -= 1; }
  const genericOrder = [];
  for (let i = 0; i < n; i += 1) if (!pipUsed[i]) genericOrder.push(i);
  genericOrder.sort((a, b) => units[a].length - units[b].length);
  for (const i of genericOrder) {
    if (toConsume <= 0) break;
    consume[i] = true;
    toConsume -= 1;
  }
  const newPool = {};
  for (let i = 0; i < n; i += 1) {
    if (consume[i]) continue;
    const key = manaUnitKey(units[i]);
    newPool[key] = (newPool[key] ?? 0) + 1;
  }
  player.manaPool = newPool;
}

export function spendMana(state, playerId, amount, requirements = []) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Koszt many musi być nieujemną liczbą całkowitą');
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) throw new Error('Nieznany gracz');
  if (!player.manaPool) player.manaPool = {};
  // Koszt 0 (darmowe rzuty — plot, discover) niczego nie płaci: pipy kolorów
  // nie są wydawane, więc nie mogą blokować (root cause: spendMana(0, [[G]])
  // rzucała „Brak kolorowej many" mimo zerowego kosztu).
  const payNothing = amount === 0;
  // Płacenie pipów KOLOROWYCH właściwą maną (CR 106.4/601.2h): pipy muszą
  // być pokryte przez SAMĄ pulę — jeśli nie są, do-tapujemy kolorowopasujące
  // źródła NAWET wtedy, gdy suma many już wystarcza. Root cause M40/M41:
  // canPayColoredCost sprawdzał pulę + nietapnięte źródła, ale płatność przy
  // wystarczającej sumie nie tapowała i consumeManaPool cicho płaciła pip
  // jednostką innego koloru ({U} z {W} przy nietapniętej Wyspie).
  if (!payNothing && !matchColorRequirements(expandManaPool(player.manaPool), requirements)) {
    const reqColors = new Set(requirements.flat());
    // Atomiczność (CR 601.2h): pokrycie pipów sprawdzamy PRZED tapnięciem
    // (canPayColoredCost = pula + NIETAPNIĘTE źródła, zero mutacji) — nieudana
    // płatność nie może zostawić tapniętych źródeł.
    if (!canPayColoredCost(state, playerId, requirements)) throw new Error('Brak kolorowej many');
    const pipSources = untappedLandManaSources(state, playerId).slice();
    pipSources.sort((a, b) => {
      const ca = getSourceForObject(a)?.colors ?? [];
      const cb = getSourceForObject(b)?.colors ?? [];
      const am = ca.some((c) => reqColors.has(c)) ? 0 : 1;
      const bm = cb.some((c) => reqColors.has(c)) ? 0 : 1;
      return am - bm;
    });
    let covered = false;
    for (const source of pipSources) {
      if (covered) break;
      // Tapujemy wyłącznie źródła zdolne wyprodukować potrzebny kolor —
      // źródło generyczne nie pokryje pipa, a tapnięcie byłoby mutacją
      // nieudanej płatności.
      const srcColors = getSourceForObject(source)?.colors ?? [];
      if (!srcColors.some((c) => reqColors.has(c))) continue;
      tapLandForMana(state, playerId, source.id);
      covered = matchColorRequirements(expandManaPool(player.manaPool), requirements);
    }
    // Obrona w głąb: canPayColoredCost gwarantuje pokrycie, więc ten throw
    // jest nieosiągalny — ale NIGDY nie płacimy pipa maną innego koloru.
    if (!covered) throw new Error('Brak kolorowej many');
  }
  // Auto-tap lądów: płatność jest JEDYNYM miejscem spożywania many. Gdy pula
  // krótka, do-tapujemy brakujące lądy — NAJPIERW kolorowopasujące (dla
  // niepokrytych pipów `requirements`), potem resztę, by wyprodukowana mana
  // miała właściwe kolory (MtG: tapnięcie Wyspy daje {U}). CR 601.2h: najpierw
  // sprawdzamy produkowalną sumę — nieudana płatność nie zostawia tapniętych.
  if ((player.mana ?? 0) < amount) {
    if (producibleMana(state, playerId) < amount) throw new Error('Niewystarczająca mana');
    const reqColors = new Set(requirements.flat());
    const sources = untappedLandManaSources(state, playerId).slice();
    sources.sort((a, b) => {
      const ca = getSourceForObject(a)?.colors ?? [];
      const cb = getSourceForObject(b)?.colors ?? [];
      const am = ca.some((c) => reqColors.has(c)) ? 0 : 1;
      const bm = cb.some((c) => reqColors.has(c)) ? 0 : 1;
      return am - bm;
    });
    for (const source of sources) {
      if ((player.mana ?? 0) >= amount) break;
      tapLandForMana(state, playerId, source.id);
    }
  }
  // Konsumpcja z kolorowej puli: pipy do pasujących jednostek, reszta (generic)
  // od bezbarwnych — MtG: każdy pip koloru opłacony maną tego koloru.
  // Przy koszcie 0 pomijamy konsumpcję (nic nie jest wydawane).
  if (!payNothing) consumeManaPool(player, amount, requirements);
  player.mana -= amount;
  // Mana ze Skarba wydaje się w pierwszej kolejności (deterministycznie, ADR
  // 0005): Marut pyta, ILE many ze Skarba wydano na jego rzut.
  const treasure = Math.min(player.treasureMana ?? 0, amount);
  if (treasure > 0) player.treasureMana = (player.treasureMana ?? 0) - treasure;
  state.lastManaSpend = { playerId, amount, treasure };
  const e = event('mana_changed', { playerId, amount: -amount, total: player.mana, treasureSpent: treasure });
  state.events.push(e);
  return e;
}

export function resetTurnResources(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) throw new Error('Nieznany gracz');
  player.mana = 0;
  player.manaPool = {};
  player.treasureMana = 0;
  player.landPlays = 1;
  return player;
}

export function beginTurn(state, playerId) {
  const player = resetTurnResources(state, playerId);
  const before = state.events.length;
  const untapped = untapControlled(state, playerId);
  state.events.push(event('turn_started', { playerId, untapped: untapped.map((object) => object.id) }));
  // Zdarzenia zagnieżdżone (odkręcenia + start tury) wracają do wywołującego,
  // żeby trafiły do strumienia wynikowego komendy, nie tylko do state.events.
  return { player, untapped, events: state.events.slice(before) };
}

export function tapLandForMana(state, playerId, objectId) {
  const object = state.objects.get(objectId);
  // Źródłem many jest land albo land creature (typ Land — token Forest Dryad).
  const isLandSource = object?.kind === 'land' || (object?.types ?? []).includes('Land');
  if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId || !isLandSource) throw new Error('Nielegalne źródło many');
  if (object.tapped) throw new Error('Land jest już tapped');
  const updated = Object.freeze({ ...object, tapped: true });
  state.objects.set(objectId, updated);
  // KOLOROWA PULA: land produkuje swój kolor (Wyspa → {U}, dwubarwny land →
  // U|R, „dowolny kolor" → dowolny, bezbarwny → generic), a nie 1 bezbarwną.
  const src = getSourceForObject(object);
  const colors = src?.colors ?? [];
  const mana = addMana(state, playerId, 1, { colors });
  const produced = event('mana_produced', { playerId, source: objectId, amount: 1, colors });
  state.events.push(produced);
  return [mana, produced];
}

/**
 * Nietapnięte lądowe źródła many gracza (obiekty, które tapLandForMana mógłby
 * zatapnąć). Kolejność deterministyczna (ADR 0005): najpierw zwykłe landy,
 * potem land creatures (token Forest Dryad) — stwora mogącego atakować i
 * blokować nie marnujemy na produkcję many, póki starczają zwykłe landy.
 * Wewnątrz grup zachowujemy kolejność pola bitwy.
 */
export function untappedLandManaSources(state, playerId) {
  const lands = [];
  const landCreatures = [];
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId || object.tapped) continue;
    const isLandSource = object.kind === 'land' || (object.types ?? []).includes('Land');
    if (!isLandSource) continue;
    (object.kind === 'land' ? lands : landCreatures).push(object);
  }
  return [...lands, ...landCreatures];
}

/**
 * Mana, którą gracz jest w stanie wyprodukować W TEJ CHWILI: pula + 1 za
 * każdy nietapnięty land. To ona decyduje o oferowaniu rzutów/zdolności —
 * gracz nie musi najpierw ręcznie tapnąć landów, żeby zobaczyć dostępny czar
 * (płatność sama do-tapuje brakujące landy, patrz spendMana).
 *
 * Świadome wyłączenie z auto-produkcji: tokeny Skarbów (mana ability z kosztem
 * poświęcenia) — ich wydatek jest nieodwracalną decyzją strategiczną, więc
 * zostaje w rękach gracza (aktywacja przez activate_ability jak dotąd).
 */
export function producibleMana(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  return (player?.mana ?? 0) + untappedLandManaSources(state, playerId).length;
}

/**
 * Czy gracz ma kolorowe źródła many potrzebne do rzucenia karty.
 * Używa mapy MANA_COSTS (Scryfall mana_cost) sparsowanej przez parseManaCost
 * oraz listy kontrolowanych źródeł (allControlledManaSources).
 *
 * Dla testów bez lądów (addMana bez źródeł) zwracamy true – testy core
 * operują pulą many bez landów, a kolorowa walidacja dotyczy realnych gier
 * z lądami na stole (bug Sweet Oblivion: 2 Plains → U1).
 */
/**
 * MtG-castability kolorów (kolorowa pula, cz. 7): czy MANY UŻYTECZNE —
 * kolorowa pula (player.manaPool) + NIETAPNIĘTE źródła (da się tapnąć) — pokryją
 * pip(y) kolorowe + część generyczną. Sprawdzane PRZED tapnięciem: do rzutu
 * trzeba źródeł, których MOŻNA UŻYĆ, a nie zużytych (tapniętych). Różnica vs
 * stary model (allControlledManaSources liczył też tapnięte = nonsens): teraz
 * tapnięte źródło nie liczy się (jego mana jest w puli jako kolorowa jednostka).
 */
export function canPayColoredCost(state, playerId, requirements) {
  // MtG-castability KOLORÓW: czy pip(y) kolorowe da się dopasować do dostępnych
  // jednostek many (kolorowa pula + NIETAPNIĘTE źródła — da się tapnąć). Sprawd-
  // zane PRZED tapnięciem (do rzutu trzeba źródeł, których można UŻYĆ). AMOUNT
  // (efektywny koszt vs producibleMana) jest sprawdzany OSOBNO na ścieżkach
  // rzutów — tu rozłączamy kolor od sumy (m.in. Metalcraft/Sculptor redukują
  // generic, więc nie liczymy go tu).
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return false;
  const units = expandManaPool(player.manaPool);
  for (const obj of untappedLandManaSources(state, playerId)) {
    const src = getSourceForObject(obj);
    units.push(src?.colors ?? []);
  }
  return matchColorRequirements(units, requirements);
}

/** Czy JAWNA lista pipów kolorów da się pokryć (pula + nietapnięte źródła). */
function hasColorRequirements(state, playerId, requirements) {
  if (requirements.length === 0) return true;
  return canPayColoredCost(state, playerId, requirements);
}

function hasColorManaForCard(state, playerId, cardId, phyrexianPayWithLife = 0) {
  const costStr = MANA_COSTS[cardId];
  if (!costStr) return true; // brak danych (landy) – nie walidujemy
  const parsed = parseManaCost(costStr);
  if (!parsed) return true;
  if (parsed.colored.length === 0 && parsed.hybrid.length === 0 && parsed.phyrexian.length === 0) return true;
  const requirements = coloredPipsOf(cardId, phyrexianPayWithLife);
  return hasColorRequirements(state, playerId, requirements);
}

function hasColorManaForObject(state, playerId, object, phyrexianPayWithLife = 0) {
  if (!object) return true;
  if (object.kind === 'land') return true;
  return hasColorManaForCard(state, playerId, object.cardId, phyrexianPayWithLife);
}

export function castPermanent(state, playerId, objectId, { faceDown = false, phyrexianPayWithLife = 0, exileTargetId = null, kicked = false } = {}) {
  const player = state.players.find((entry) => entry.id === playerId);
  const object = state.objects.get(objectId);
  // Zaplotowana karta leży w exile (plotted: true) i rzuca się BEZ kosztu many
  // (CR 702.136 — „Cast it as a sorcery on a later turn without paying its
  // mana cost"). Batch 24: Spinewoods Paladin — plot dla permanentów.
  const plotted = object?.zone === 'exile' && object.plotted;
  if (!player || !object || object.controllerId !== playerId || (object.zone !== 'hand' && !plotted)) throw new Error('Nielegalny permanent');
  if (object.kind !== 'creature' && object.kind !== 'artifact' && object.kind !== 'enchantment') throw new Error('Ten obiekt nie jest zagrywalnym permanentem');
  // Flash (CR 702.8): permanent z flash można zagrać w każdej fazie (jak instant);
  // bez flash — tylko w swojej main phase (plot też rzuca się jako sorcery).
  const hasFlash = (object.keywords ?? []).includes('flash');
  if (!hasFlash && (state.turn.activePlayerId !== playerId || !['precombat_main', 'postcombat_main'].includes(state.turn.phase))) throw new Error('Zagranie poza main phase');
  // Timing sorcery (CR 307.1/117.1a): rzut permanenta bez flash wymaga
  // PUSTEGO stosu — czar idzie na stos i rozstrzyga się po rundzie passów.
  if (!hasFlash && state.zones.stack.length > 0) throw new Error('Zagranie przy niepustym stosie');
  let cost = plotted ? 0 : (object.manaCost ?? 0);
  if (faceDown) {
    if (!object.morph || object.morph.cost == null) throw new Error('Ta karta nie może być zagrana twarzą w dół');
    cost = object.morph.cost;
  } else {
    // Modyfikatory kosztu z permanentów (Etherium Sculptor: artefakty tańsze
    // o {1}, CR 601.2f) — redukcja wyłącznie części generycznej, nie obejmuje
    // symboli phyrexian (doliczanych niżej) ani kosztu morph (alternatywnego).
    cost = reduceGenericCost(object.cardId, cost, costReductionForSpell(state, object));
  }
  // Kicker (CR 702.33, Kor Sanctifiers): „You may pay an additional {W} as
  // you cast this spell" — wariant kicked dodaje koszt i pipy kolorów do
  // wymagań, a na permanencie ląduje flaga wasKicked (triggery „if it was
  // kicked" czytają condition). Kicker nie podlega obniżkom (koszt
  // dodatkowy, CR 601.2f — jak koszty alternatywne).
  if (kicked && !object.kicker) throw new Error('Ta karta nie ma mechaniki kicker');
  const kicker = kicked ? (object.kicker ?? null) : null;
  // Plot – rzut bez kosztu many (bez koloru) – pomijamy walidację kolorową
  // (jak legalSpellCasts dla zaplotowanych czarów).
  if (!plotted && !faceDown && !hasColorManaForObject(state, playerId, object, phyrexianPayWithLife)) throw new Error('Brak kolorowego źródła many');
  // Phyrexian mana (CR 118.9): każdy symbol {W/P} można opłacić maną ({W})
  // albo 2 życiem — wybór NALEŻY DO GRACZA (parametr phyrexianPayWithLife
  // komendy cast_permanent; PlayerView wylicza wszystkie opłacalne warianty,
  // UI grupuje je w ChoiceRequest). Podstawa kosztu (tu {2}) zawsze z many.
  const phyrexian = object.phyrexianManaCost ?? 0;
  const lifePaid = phyrexian > 0 ? (phyrexianPayWithLife ?? 0) : 0;
  if (lifePaid < 0 || lifePaid > phyrexian) throw new Error('Nieprawidłowa liczba symboli phyrexian płaconych życiem');
  if (faceDown && lifePaid !== 0) throw new Error('Morph nie ma kosztu phyrexian');
  const totalMana = cost + (phyrexian - lifePaid) + (kicker?.cost ?? 0);
  // Opłacalność liczona po MANIE PRODUKOWALNEJ (pula + nietapnięte landy) —
  // spendMana sam do-tapuje brakujące landy.
  if (producibleMana(state, playerId) < totalMana) throw new Error('Niewystarczająca mana');
  if (2 * lifePaid > (player.life ?? 0)) throw new Error('Niewystarczające życie');
  // Kolorowa walidacja many: czy kontrolujesz źródła zdolne wyprodukować wymagane kolory?
  // Np. Sweet Oblivion {1}{U} nie może być rzucone z samych Plains (W).
  // Additional cost "exile a creature you control" (Fear of Abduction):
  // walidacja PRZED mutacją (CR 601.2h).
  const exileCost = object.additionalCost?.exileCreature;
  if (exileCost) {
    const exileObj = state.objects.get(exileTargetId);
    if (!exileObj || exileObj.zone !== 'battlefield' || exileObj.kind !== 'creature' || exileObj.controllerId !== playerId) {
      throw new Error('Nielegalny cel dodatkowego kosztu (exile a creature)');
    }
  }
  // Kicker dodaje pipy kolorów do wymagań (Kor Sanctifiers: {W} + kicker {W}
  // = dwa pipy białe); walidacja dotyczy całej sumy PRZED mutacją.
  const kickerPips = (kicker?.colors ?? []).map((color) => [color]);
  // Morph face-down (CR 702.36): koszt {3} jest BEZBARWNY — pipy karty nie
  // obowiązują (root cause: face-down Monastery Flock wymagał {U} z powodu
  // pipów karty; cicha zła płatność w consumeManaPool to maskowała).
  // Plot – rzut bez kosztu many – nie ma też wymagań kolorowych (CR 702.136).
  const requirements = (faceDown || plotted) ? [] : [...coloredPipsOf(object.cardId, lifePaid), ...kickerPips];
  if (!faceDown && !plotted && !hasColorRequirements(state, playerId, requirements)) {
    throw new Error('Brak kolorowego źródła many');
  }
  spendMana(state, playerId, totalMana, requirements);
  if (lifePaid > 0) changeLife(state, playerId, -2 * lifePaid);
  state.spellsCastThisTurn += 1;
  if (exileCost) {
    const exileId = `exile-${state.objectSequence++}`;
    const exiled = moveObjectDirectly(state, exileTargetId, 'exile', exileId);
    state.events.push(event('object_exiled', { fromId: exileTargetId, objectId: exileId, object: exiled, cardId: exiled.cardId, additionalCost: true }));
  }
  const manaSpent = totalMana;
  // Rzut permanenta to rzut CZARU (CR 601): obiekt ląduje na STOSIE, a na
  // bitwisko wchodzi dopiero przy rozstrzygnięciu (spells.resolveTopOfStack
  // — gałąź bez deskryptora spell). Przeciwnik może odpowiedzieć instanitem
  // albo skontrować czar-stwora (Stoic Rebuttal); ETB i cechy wejścia
  // rozstrzygają się przy wejściu, nie przy rzucie.
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const patch = { summoningSickness: true, tapped: false };
  if (faceDown) {
    // Face-down stwór: 2/2, bez nazwy/zdolności; megamorph dostaje zdolność
    // obrócenia twarzą do góry (deskryptor budowany bez importu abilities.js,
    // żeby nie tworzyć cyklu abilities -> resources -> abilities).
    patch.faceDown = true;
    patch.abilities = faceDownAbilities(object);
    // Root cause (Batch 24 — Willbender): face-down ZASTĘPUJE abilities
    // flip-ability; bez zachowania oryginału stwór po obrocie NIE MA swoich
    // zdolności (trigger „when this creature is turned face up" ginął).
    // Zapisujemy oryginał i przywracamy go w turnFaceUp (permanents.js).
    patch.originalAbilities = object.abilities ?? [];
  }
  // Ile many ze Skarba wydano na TEN rzut (Marut, CR: „if mana from a
  // Treasure was spent to cast it"). spendMana zużywa mana Skarbową jako
  // pierwszą; wpis wędruje z obiektem stosu na permanent przy rozstrzygnięciu
  // (LKI wejścia — ETB czyta go przy rozstrzyganiu triggera).
  const treasureSpent = totalMana > 0 && state.lastManaSpend?.playerId === playerId
    ? (state.lastManaSpend.treasure ?? 0)
    : 0;
  const stacked = Object.freeze({
    ...moved, ...patch, wasCast: true, manaFromTreasureSpent: treasureSpent,
    chosenTargets: [],
    // Kicker (CR 702.33): fakt opłacenia dodatkowego kosztu — triggery
    // „if it was kicked" filtrują po tej fladze (jak wasCast).
    ...(kicker ? { wasKicked: true } : {}),
  });
  state.objects.set(stackId, stacked);
  const e = event('permanent_cast', {
    playerId, fromId: objectId, object: stacked, manaCost: cost, faceDown,
    // Fakt użycia kickera (jawny w logu i dla triggerów „was kicked").
    kicked: Boolean(kicker),
    // Mana wydana na ten rzut (bez części opłaconej życiem — to nie mana) —
    // progi triggerów „if N or more mana was spent" (Tellah, Great Sage).
    manaSpent,
    // Fakt płatności phyrexian (jawny w logu: ile symboli opłacono życiem).
    phyrexianSymbols: phyrexian, phyrexianPaidWithLife: lifePaid,
    // Fakt płatności Skarbem (jawny w logu: ile jednostek many pochodziło
    // ze Skarbów) — trigger Maruta czyta tę samą liczbę z obiektu.
    manaFromTreasureSpent: treasureSpent,
    // Face-down permanent jest bezbarwny (CR 702.36) — nie jest „białym czarem".
    colors: faceDown ? [] : [...(object.colors ?? [])],
  });
  state.events.push(e);
  // entersWithCounters i bloodthirst to cechy WEJŚCIA na bitwisko — aplikuje
  // je rozstrzygnięcie stosu (spells.js), po rundzie passów (CR 608.2a).
  return e;
}

/**
 * Rzucenie karty bestow jako czaru AURY (CR 702.103): płaci alternatywny
 * koszt, obiekt ląduje na stosie z wybranym celem-stworem i deskryptorem
 * czaru aury. Rozstrzygnięcie obsługuje spells.resolveTopOfStack: przy
 * legalnym celu aura wchodzi załączona (nie jest stworem); przy nielegalnym —
 * kartę-rodzic wchodzi jako zwykły stwór (wyjątek bestow: czar aury z bestow
 * NIE idzie do grobu, gdy cel stanie się nielegalny).
 */
/**
 * Hexproof (CR 702.11b): czar AURY celuje w gospodarza — permanent przeciwnika
 * z hexproof nie może być celem (jak każdy czar). Wspólne dla oferty
 * (legalAuraCasts) i walidacji (castAuraSpell). Własne permanenty zawsze
 * legalne (hexproof nie chroni przed własnymi czarami).
 */
function auraTargetHexproof(state, host, casterId) {
  if (!host || host.zone !== 'battlefield' || host.controllerId === casterId) return false;
  return effectiveKeywords(host, state).includes('hexproof');
}

export function castAuraSpell(state, playerId, objectId, { targetId, bestow = false } = {}) {
  const player = state.players.find((entry) => entry.id === playerId);
  const object = state.objects.get(objectId);
  if (!player || !object || object.controllerId !== playerId || object.zone !== 'hand') throw new Error('Nielegalna karta aury');
  if (bestow && !object.bestow) throw new Error('Ta karta nie ma mechaniki bestow');
  if (!bestow && !object.aura) throw new Error('Tę kartę można rzucić jako aurę tylko za koszt bestow');
  if (state.turn.activePlayerId !== playerId || !['precombat_main', 'postcombat_main'].includes(state.turn.phase)) throw new Error('Czar aury tylko w swoją fazę main');
  if (state.zones.stack.length > 0) throw new Error('Czar aury tylko przy pustym stosie');
  // Czysta aura płaci zwykły koszt many (z ewentualną obniżką z permanentów
  // — Etherium Sculptor dla aur-artefaktów, CR 601.2f); bestow — koszt bestow.
  const cost = bestow ? (object.bestow.cost ?? 0) : reduceGenericCost(object.cardId, object.manaCost ?? 0, costReductionForSpell(state, object));
  if (producibleMana(state, playerId) < cost) throw new Error('Niewystarczająca mana');
  if (!hasColorManaForObject(state, playerId, object, 0)) throw new Error('Brak kolorowego źródła many');
  // Walidacja CELU PRZED jakąkolwiek mutacją (CR 601.2h): nieudany rzut nie
  // może zostawić karty na stosie ani utraconej many.
  let spellTargets;
  let enchantPlayer = false;
  if (object.enchantPlayer) {
    // Aura „Enchant player" (Curse of the Pierced Heart): celem jest gracz.
    if (!state.players.some((p) => p.id === targetId)) throw new Error('Celem czaru aury musi być gracz');
    spellTargets = Object.freeze([Object.freeze({ type: 'player' })]);
    enchantPlayer = true;
  } else {
    const host = state.objects.get(targetId);
    if (object.aura?.enchantType === 'artifact_or_creature') {
      if (!host || host.zone !== 'battlefield') throw new Error('Czarem aury trzeba celować w permanent na bitwisku');
      const isArtOrCreature = host.kind === 'creature' || host.kind === 'artifact' || (host.types ?? []).includes('Artifact');
      if (!isArtOrCreature) throw new Error('Czarem aury trzeba celować w artefakt lub stwora');
      if (host.controllerId !== playerId) throw new Error('Czarem aury trzeba celować we własny permanent');
    } else if (object.aura?.enchant === 'enchantment' || object.aura?.enchantType === 'enchantment') {
      // Batch 23: Feedback — „Enchant enchantment". Legalność gospodarza
      // wspólna z attach/SBA (attachments.isLegalAuraHost): enchantment na
      // bitwisku (także enchantment creature, CR 303.4a).
      if (!host || host.zone !== 'battlefield'
        || (host.kind !== 'enchantment' && !(host.types ?? []).includes('Enchantment'))) {
        throw new Error('Celem czaru aury musi być enchantment na bitwisku');
      }
    } else {
      if (!host || host.zone !== 'battlefield' || host.kind !== 'creature') throw new Error('Celem czaru aury musi być stwór na bitwisku');
    }
    // Hexproof (CR 702.11b): aura to czar z celem — nie może zaczarować
    // cudzego permanenta z hexproof. Oferta i walidacja spójne.
    if (auraTargetHexproof(state, host, playerId)) {
      throw new Error('Celem czaru aury nie może być permanent z hexproof');
    }
    const auraHostType = (object.aura?.enchant === 'enchantment' || object.aura?.enchantType === 'enchantment')
      ? 'enchantment' : 'creature';
    spellTargets = Object.freeze([Object.freeze({ type: auraHostType })]);
  }
  spendMana(state, playerId, cost, coloredPipsOf(object.cardId));
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  // Deskryptor czaru aury (jak czar): rozstrzygnięcie = wejście na bitwisko
  // załączone (albo — dla curse — z enchantedPlayerId).
  const stacked = Object.freeze({
    ...moved,
    tapped: false,
    enchantPlayer,
    chosenTargets: [targetId],
    spell: Object.freeze({
      timing: 'sorcery', aura: true, enchantPlayer,
      targets: spellTargets,
      effects: Object.freeze([Object.freeze({ type: enchantPlayer ? 'attach_aura_player' : 'attach_aura' })]),
    }),
  });
  state.objects.set(stackId, stacked);
  const e = event('aura_spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    manaCost: cost, targets: [targetId], bestow, enchantPlayer,
    // Mana wydana na rzut aury — progi triggerów „mana was spent" (Tellah).
    manaSpent: cost,
    // Kolory czaru aury (publiczne) — trigger „a player casts a white spell".
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

/**
 * Warianty rzucenia aury (karta w ręce × legalny cel-stwór na bitwisku).
 * Cel to DOWOLNY stwór („enchant creature" bez ograniczenia kontrolera).
 * Karty z bestow dają warianty bestow:true; czyste aury — warianty zwykłe
 * (bestow:false, koszt many karty). Aury wymagają celu już przy rzuceniu
 * (CR 601.2c) — bez stwora na bitwisku nie da się jej w ogóle rzucić.
 */
export function legalAuraCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const out = [];
  if (!player) return out;
  // Oferta po manie produkowalnej — czar aury widać przed tapowaniem landów.
  // + walidacja kolorowa (Sweet Oblivion bug: 2 Plains nie mogą rzucić U)
  const manaAvailable = producibleMana(state, playerId);
  for (const id of state.zones.hand) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId) continue;
    const options = [];
    if (object.aura && reduceGenericCost(object.cardId, object.manaCost ?? 0, costReductionForSpell(state, object)) <= manaAvailable && hasColorManaForObject(state, playerId, object, 0)) options.push(false);
    if (object.bestow && (object.bestow.cost ?? 0) <= manaAvailable && hasColorManaForObject(state, playerId, object, 0)) options.push(true);
    if (options.length === 0) continue;
    // Aura „Enchant player" (Curse): celem jest GRACZ, nie stwór — wybór celu
    // przez gracza (każdy gracz jest legalnym celem; przeciwnik zwykle cenniejszy).
    if (object.enchantPlayer) {
      for (const targetId of state.players.map((p) => p.id)) {
        for (const isBestow of options) out.push({ objectId: id, targetId, bestow: isBestow });
      }
      continue;
    }
    if (object.aura?.enchantType === 'artifact_or_creature') {
      for (const targetId of state.zones.battlefield) {
        const target = state.objects.get(targetId);
        const isArtOrCreature = target && (target.kind === 'creature' || target.kind === 'artifact' || (target.types ?? []).includes('Artifact'));
        if (isArtOrCreature && target.controllerId === playerId && !auraTargetHexproof(state, target, playerId)) {
          out.push({ objectId: id, targetId, bestow: false });
        }
      }
    } else if (object.aura?.enchant === 'enchantment' || object.aura?.enchantType === 'enchantment') {
      // Batch 23: Feedback — Enchant enchantment
      for (const targetId of state.zones.battlefield) {
        const target = state.objects.get(targetId);
        const isEnchantment = target && (target.kind === 'enchantment' || (target.types ?? []).includes('Enchantment'));
        if (isEnchantment && target.zone === 'battlefield' && !auraTargetHexproof(state, target, playerId)) {
          for (const bestow of options) out.push({ objectId: id, targetId, bestow });
        }
      }
    } else {
      for (const targetId of state.zones.battlefield) {
        const target = state.objects.get(targetId);
        if (target && target.zone === 'battlefield' && target.kind === 'creature' && !auraTargetHexproof(state, target, playerId)) {
          for (const bestow of options) out.push({ objectId: id, targetId, bestow });
        }
      }
    }
  }
  return out;
}

/**
 * Zdolność obrócenia twarzą do góry dla face-down permanentu.
 * Megamorph (CR 702.109) kładzie przy obrocie licznik +1/+1; zwykły morph
 * (CR 702.37, Woolly Loxodon) obraca kartę za koszt morph BEZ licznika.
 */
function faceDownAbilities(object) {
  if (!object.morph) return [];
  // CR 702.36/702.37: koszt obrotu twarza do gory to koszt many z pipami
  // kolorowymi (Morph {U}, Megamorph {6}{G}...) — deskryptor niesie colors;
  // walidacja i oferta korzystaja z kolorowej puli (jak koszty czarow).
  const morphColors = object.morph.colors ?? [];
  if (object.morph.megamorphCost != null) {
    return [Object.freeze({
      type: 'activated',
      keyword: 'megamorph',
      cost: Object.freeze({ mana: object.morph.megamorphCost, colors: morphColors }),
      effect: Object.freeze({ type: 'turn_face_up', counters: { '+1/+1': 1 } }),
      trigger: null,
    })];
  }
  if (object.morph.morphCost != null) {
    return [Object.freeze({
      type: 'activated',
      keyword: 'morph',
      cost: Object.freeze({ mana: object.morph.morphCost, colors: morphColors }),
      effect: Object.freeze({ type: 'turn_face_up' }),
      trigger: null,
    })];
  }
  return [];
}

export function playLand(state, playerId, objectId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const object = state.objects.get(objectId);
  if (!player || !object || object.controllerId !== playerId || object.zone !== 'hand') throw new Error('Nielegalny land drop');
  if (object.kind !== 'land') throw new Error('Obiekt nie jest landem');
  if (state.turn.activePlayerId !== playerId || !['precombat_main', 'postcombat_main'].includes(state.turn.phase)) {
    throw new Error('Land drop poza main phase');
  }
  // CR 305.2: zagranie landa to akcja sorcery-speed — tylko przy PUSTYM stosie.
  if (state.zones.stack.length > 0) throw new Error('Land drop przy niepustym stosie');
  if (player.landPlays <= 0) throw new Error('Wykorzystano land drop w tej turze');
  const newId = `land-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'battlefield', newId);
  // Land z cechą „enters tapped" (Rupture Spire, Prismari Campus) wchodzi
  // zatapnięty — nie da się nim zatapnięć na manę w turze wejścia.
  // Czasowe entersTapped z warunkiem (Raucous Carnival): land wchodzi
  // zatapnięty, chyba że warunek jest spełniony (wtedy wchodzi untapped).
  let shouldEnterTapped = moved.entersTapped;
  if (shouldEnterTapped && moved.entersTappedCondition) {
    const cond = moved.entersTappedCondition;
    if (cond.type === 'player_life_at_most') {
      const anyPlayerLow = state.players.some((p) => (p.life ?? 0) <= cond.amount);
      if (anyPlayerLow) shouldEnterTapped = false;
    }
    // Batch 24 (Mystic Sanctuary): „enters tapped unless you control three or
    // more other Islands" — wchodzący land NIE jest jeszcze na bitwisku, więc
    // liczymy kontrolowane landy o podtypie Island (są z definicji „inne").
    if (cond.type === 'islands_you_control_at_least') {
      const islands = state.zones.battlefield.filter((id) => {
        if (id === newId) return false; // „other Islands" — wchodzący land się nie liczy
        const obj = state.objects.get(id);
        return obj && obj.zone === 'battlefield' && obj.controllerId === player.id
          && (obj.kind === 'land' || (obj.types ?? []).includes('Land'))
          && (obj.subtypes ?? []).includes('Island');
      }).length;
      if (islands >= (cond.amount ?? 3)) shouldEnterTapped = false;
    }
    // Idyllic Grange (ELD): „enters tapped unless you control three or more
    // other Plains" — wchodzący land jest Plains, ale „inne" go wykluczają.
    if (cond.minOtherPlains) {
      const plains = state.zones.battlefield.filter((id) => {
        if (id === newId) return false;
        const obj = state.objects.get(id);
        return obj && obj.zone === 'battlefield' && obj.controllerId === player.id
          && (obj.kind === 'land' || (obj.types ?? []).includes('Land'))
          && (obj.subtypes ?? []).includes('Plains');
      }).length;
      if (plains >= cond.minOtherPlains) shouldEnterTapped = false;
    }
  }
  const placed = shouldEnterTapped ? Object.freeze({ ...moved, tapped: true }) : moved;
  state.objects.set(newId, placed);
  player.landPlays -= 1;
  const e = event('land_played', { playerId, fromId: objectId, object: placed, entersTapped: Boolean(placed.entersTapped) });
  state.events.push(e);
  return e;
}
