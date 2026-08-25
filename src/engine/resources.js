import { event } from '../protocol/types.js';
import { moveObjectDirectly } from './objects.js';
import { effectiveKeywords, untapControlled } from './permanents.js';
import { effectiveProtectionFromColors, isProtectedFromSource } from './attachments.js';
import { addCounter } from './counters.js';
import { changeLife } from './players.js';
import { MANA_COSTS } from '../cards/mana-costs-data.js';
import { parseManaCost, canPayManaCost, costReductionForSpell, conditionalCostReduction, reduceGenericCost, reduceAlternativeCost, matchColorRequirements, coloredPipsOf, consumePendingSpellDiscount } from './mana-cost.js';
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
    player.artifactOnlyMana = 0;
    player.landPlays = 1;
  }
  return state;
}

export function addMana(state, playerId, amount, { colors = ['W', 'U', 'B', 'R', 'G'], fromTreasure = false, spendOnly = null } = {}) {
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
  // M201 (znalezisko #3): mana OGRANICZONA drukiem (Powerstone — „only to cast
  // artifact spells") musi być rozpoznawalna także PO trafieniu do puli:
  // gracz może tapnąć źródło ręcznie (kreator many), a dopiero potem wybrać
  // czar. Licznik działa jak `treasureMana` — jedna rodzina rozwiązania.
  if (spendOnly === 'artifact' && amount > 0) {
    player.artifactOnlyMana = (player.artifactOnlyMana ?? 0) + amount;
  }
  const e = event('mana_changed', { playerId, amount, total: player.mana, colors, fromTreasure: Boolean(fromTreasure), spendOnly: spendOnly ?? null });
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
  // M166/C (Adamant) + M171/N1 (audyt PR #68): kolory MANY WYDANEJ.
  // Jednostka dopasowana do PIPA została wydana w kolorze pipa (przecięcie
  // profilu jednostki z wymaganiem); jednostka WIELOKOLOROWA wydana na
  // generic to wildcard (CR 106.7 — kolor „dowolnej" many wybiera gracz
  // przy produkcji; silnik odracza wybór, więc wildcard = kolor mógł być
  // dowolny z profilu). Wpisy wielokolorowe kodujemy stringiem >1 znaku.
  // ZWROT zamiast pola na playerze — księgowanie tymczasowe nie może
  // zostawiać śladu w stanie (sonda no-op vs koszt, klasa U9).
  // M171/N1: przypisanie jednostka -> pozycja wymagania (kolor wydany
  // na pip = przecięcie profilu jednostki z tym wymaganiem).
  const pipAssignment = new Array(n).fill(-1);
  if (requirements.length > 0) {
    const matchPips = (pos) => {
      if (pos >= requirements.length) return true;
      for (let i = 0; i < n; i += 1) {
        if (pipUsed[i]) continue;
        if (requirements[pos].some((c) => units[i].includes(c))) {
          pipUsed[i] = true;
          pipAssignment[i] = pos;
          if (matchPips(pos + 1)) return true;
          pipUsed[i] = false;
          pipAssignment[i] = -1;
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
  const consumedColors = [];
  for (let i = 0; i < n; i += 1) {
    if (consume[i]) {
      // M171/N1: pip — kolor wydany to przecięcie z wymaganiem; generic —
      // mono jednoznacznie, wielokolorowa jako wildcard (string >1 znaku).
      if (pipAssignment[i] >= 0) {
        const overlap = units[i].filter((c) => requirements[pipAssignment[i]].includes(c));
        if (overlap.length >= 1) consumedColors.push(overlap.join(''));
      } else if (units[i].length >= 1) {
        consumedColors.push(units[i].join(''));
      }
      continue;
    }
    const key = manaUnitKey(units[i]);
    newPool[key] = (newPool[key] ?? 0) + 1;
  }
  player.manaPool = newPool;
  return consumedColors;
}

/**
 * M202/N1 (audyt PR #73): cel wydania many dla RZUTU CZARU. Druk many
 * ograniczonej (Powerstone: "This mana can't be spent to cast a nonartifact
 * spell") zabrania WYŁĄCZNIE płacenia za czar nie-artefaktowy. Zdolności
 * aktywowane, koszty specjalne (plot, suspend) i czary-artefakty płacą nią
 * normalnie, więc `castingSpell` musi być jawne — bez niego ograniczenie
 * rozlewało się na każdą płatność i odbierało graczowi legalne aktywacje
 * (klasa L44).
 */
export function spellManaPurpose(object) {
  return { castingSpell: true, artifactSpell: (object?.types ?? []).includes('Artifact') };
}

/** Czy dla tego celu wydania mana ograniczona drukiem jest niedostępna. */
function restrictedManaBlocked(purpose) {
  return purpose?.castingSpell === true && purpose?.artifactSpell !== true;
}

/**
 * `purpose` opisuje, NA CO idzie mana (M201, znalezisko #3). Domyślnie pusty =
 * płatność NIE jest rzutem czaru, więc mana ograniczona drukiem jest dostępna
 * (M202/N1 — wcześniej domyślnie blokowaliśmy ją dla każdej płatności).
 */
export function spendMana(state, playerId, amount, requirements = [], purpose = {}) {
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
    const grantPlan = planGrantManaColors(state, playerId, requirements);
    if (!grantPlan) throw new Error('Brak kolorowej many');
    const grantColorById = new Map(grantPlan.map((row) => [row.id, row.color]));
    const pipSources = untappedLandManaSources(state, playerId).slice();
    pipSources.sort((a, b) => {
      const ga = grantColorById.has(a.id) ? 0 : 1;
      const gb = grantColorById.has(b.id) ? 0 : 1;
      if (ga !== gb) return ga - gb;
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
      // nieudanej płatności. Grant: kolor z planu (ten sam backtracking
      // co oferta), nie „pierwszy pip".
      const srcColors = getSourceForObject(source)?.colors ?? [];
      const plannedGrant = grantColorById.get(source.id) ?? null;
      if (!srcColors.some((c) => reqColors.has(c)) && !plannedGrant) continue;
      tapLandForMana(state, playerId, source.id, { grantColor: plannedGrant });
      covered = matchColorRequirements(expandManaPool(player.manaPool), requirements);
    }
    // M179/D: pipy niedomknięte landami pokrywają nielandowe źródła
    // czystej many (kolor efektu, np. Scorned Villager → {G}).
    if (!covered) {
      for (const entry of untappedFreeManaSources(state, playerId)) {
        if (covered) break;
        if (!entry.colors.some((c) => reqColors.has(c))) continue;
        tapFreeManaSource(state, playerId, entry);
        covered = matchColorRequirements(expandManaPool(player.manaPool), requirements);
      }
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
  // M201 (znalezisko #3): mana ograniczona w puli nie jest dostępna dla
  // niedozwolonego celu — auto-tap musi dobrać brakującą manę z innych źródeł.
  const restrictedInPool = restrictedManaBlocked(purpose) ? (player.artifactOnlyMana ?? 0) : 0;
  if (((player.mana ?? 0) - restrictedInPool) < amount) {
    if (producibleMana(state, playerId, null, purpose) < amount) throw new Error('Niewystarczająca mana');
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
      const grant = grantManaOnLand(state, source.id);
      const need = [...reqColors].find((c) => ['W', 'U', 'B', 'R', 'G'].includes(c));
      const srcColors = getSourceForObject(source)?.colors ?? [];
      const grantColor = grant > 0 ? (need ?? srcColors[0] ?? 'G') : null;
      tapLandForMana(state, playerId, source.id, { grantColor });
    }
    // M179/D: landy nie starczyły — dopłacamy z nielandowych źródeł
    // czystej many (producibleMana je liczy, więc oferta = płatność, L48).
    for (const entry of untappedFreeManaSources(state, playerId, null, purpose)) {
      if ((player.mana ?? 0) >= amount) break;
      tapFreeManaSource(state, playerId, entry);
    }
  }
  // Konsumpcja z kolorowej puli: pipy do pasujących jednostek, reszta (generic)
  // od bezbarwnych — MtG: każdy pip koloru opłacony maną tego koloru.
  // Przy koszcie 0 pomijamy konsumpcję (nic nie jest wydawane).
  const consumedColors = payNothing ? [] : consumeManaPool(player, amount, requirements);
  player.mana -= amount;
  // M166/C: kolory wydanej many (Adamant — „at least three <color> mana was
  // spent to cast this spell"). Czytane przez castPermanent/castSpell
  // NATYCHNIAST po spendMana (przed inną płatnością).
  const spentColors = consumedColors;
  // Mana ze Skarba wydaje się w pierwszej kolejności (deterministycznie, ADR
  // 0005): Marut pyta, ILE many ze Skarba wydano na jego rzut.
  const treasure = Math.min(player.treasureMana ?? 0, amount);
  if (treasure > 0) player.treasureMana = (player.treasureMana ?? 0) - treasure;
  // M201 (znalezisko #3): rozliczenie many OGRANICZONEJ po płatności.
  // • czar-artefakt: wydajemy ją w pierwszej kolejności (deterministycznie,
  //   ADR 0005) — inaczej zostawałaby w puli i blokowała kolejne rzuty;
  // • inny czar: licznik nie może przekroczyć tego, co realnie zostało
  //   w puli, bo `producibleMana` odejmuje go od stanu puli (bez tego
  //   oferta i płatność rozjeżdżają się — L48, złapane benchmarkiem).
  if ((player.artifactOnlyMana ?? 0) > 0) {
    player.artifactOnlyMana = restrictedManaBlocked(purpose)
      ? Math.min(player.artifactOnlyMana ?? 0, Math.max(0, player.mana ?? 0))
      : Math.max(0, (player.artifactOnlyMana ?? 0) - amount);
  }
  state.lastManaSpend = { playerId, amount, treasure, colors: spentColors };
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
  player.artifactOnlyMana = 0;
  player.landPlays = 1;
  return player;
}

export function beginTurn(state, playerId) {
  const player = resetTurnResources(state, playerId);
  const before = state.events.length;
  // M106/Z4 (CR 500.1/502.1): tura zaczyna się KROKIEM ODKRĘCANIA, więc
  // `turn_started` musi poprzedzać zdarzenia odkręcania. Wcześniej kolejność
  // była odwrotna i log/panel przypisywały je do POPRZEDNIEJ tury — gracz
  // widział „Hunter's Blowgun traci 1 licznik stun” pod nagłówkiem tury
  // przeciwnika, a nie pod swoją (audyt stołu, wiedzmin vs mechanicy).
  const started = event('turn_started', { playerId, untapped: [] });
  state.events.push(started);
  const untapped = untapControlled(state, playerId);
  // Lista odkręconych obiektów jest znana dopiero po odkręceniu — zdarzenie
  // jest zamrożone, więc podmieniamy je w miejscu na wersję z listą.
  state.events[state.events.indexOf(started)] = event('turn_started', {
    playerId, untapped: untapped.map((object) => object.id),
  });
  // Zdarzenia zagnieżdżone (odkręcenia + start tury) wracają do wywołującego,
  // żeby trafiły do strumienia wynikowego komendy, nie tylko do state.events.
  return { player, untapped, events: state.events.slice(before) };
}

/** Aura grantująca lądowi dodatkową zdolność many (Nature's Embrace). */
export function grantManaOnLand(state, objectId) {
  let amount = 0;
  for (const att of state.objects.values()) {
    if (att.zone === 'battlefield' && att.attachedTo === objectId && att.aura?.grantMana) {
      amount += att.aura.grantMana.amount ?? 0;
    }
  }
  return amount;
}

export function tapLandForMana(state, playerId, objectId, { grantColor = null } = {}) {
  const object = state.objects.get(objectId);
  const isLandSource = object?.kind === 'land' || (object?.types ?? []).includes('Land');
  if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId || !isLandSource) throw new Error('Nielegalne źródło many');
  if (object.tapped) throw new Error('Land jest już tapped');
  const updated = Object.freeze({ ...object, tapped: true });
  state.objects.set(objectId, updated);
  // M114 (CR 701.21a): tapnięcie za manę to TAKŻE „becomes tapped" — zdarzenie
  // musi powstać, inaczej triggery reagujące na tapnięcie (Chronic Flooding:
  // „whenever enchanted land becomes tapped") nigdy nie odpalą. Dotąd ta
  // ścieżka mutowała `tapped` po cichu (lekcja L24: brak zdarzenia = brak
  // skutku dla reszty systemu).
  const tappedEvent = event('object_tapped', { objectId, playerId, forMana: true });
  state.events.push(tappedEvent);
  const grant = grantManaOnLand(state, objectId);
  const useGrant = grant > 0 && grantColor && ['W', 'U', 'B', 'R', 'G'].includes(grantColor);
  const src = getSourceForObject(object);
  const amount = useGrant ? grant : 1;
  const colors = useGrant ? [grantColor] : (src?.colors ?? []);
  const mana = addMana(state, playerId, amount, { colors });
  const produced = event('mana_produced', { playerId, source: objectId, amount, colors, grantMana: useGrant });
  state.events.push(produced);
  // Zdarzenie tapnięcia wraca w strumieniu komendy — skan triggerów (execute)
  // czyta zdarzenia zwrócone przez handler, nie całe state.events.
  return [tappedEvent, mana, produced];
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
/**
 * M179/D (zlecenie właściciela): nielandowe źródła CZYSTEJ many — permanent
 * z aktywowaną zdolnością o koszcie SAMEGO {T} i efekcie SAMEGO add_mana
 * (Scorned Villager, Seer's Lantern). Liczą się do producibleMana i są
 * auto-tapowane w płatności (L48: oferta = płatność). Świadomie POZA:
 * źródła z kosztem many (Apprentice Wizard, Jeskai Devotee), z kosztem
 * dodatkowym (Dragonbrood's Relic — tapCreature) i ze skutkami ubocznymi
 * (Pristine Talisman — życie): ich użycie to decyzja strategiczna gracza
 * (ręczna aktywacja jak dotąd). Stwór z chorobą przywołania nie użyje
 * {T} (CR 302.6).
 */
export function untappedFreeManaSources(state, playerId, excludeSourceId = null, purpose = {}) {
  const excludedFree = excludeSourceId == null
    ? null
    : new Set(Array.isArray(excludeSourceId) ? excludeSourceId : [excludeSourceId]);
  const out = [];
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId || object.tapped) continue;
    if (excludedFree != null && excludedFree.has(object.id)) continue;
    const isLandSource = object.kind === 'land' || (object.types ?? []).includes('Land');
    if (isLandSource) continue; // landy liczy untappedLandManaSources
    for (const ability of object.abilities ?? []) {
      if (ability?.type !== 'activated') continue;
      const cost = ability.cost ?? {};
      const costKeys = Object.keys(cost).filter((key) => cost[key]);
      if (!(cost.tap === true && costKeys.length === 1)) continue;
      const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
      if (effects.length !== 1 || effects[0]?.type !== 'add_mana') continue;
      const isCreature = object.kind === 'creature' || (object.types ?? []).includes('Creature');
      if (isCreature && object.summoningSickness && !effectiveKeywords(object, state).includes('haste')) continue;
      const src = getSourceForObject(object);
      // M201 (znalezisko #3): mana OGRANICZONA (druk Powerstone: „This mana
      // can't be spent to cast a nonartifact spell") liczy się WYŁĄCZNIE, gdy
      // płatność ma dozwolony cel. Deskryptor `spendOnly` zamiast warunku po
      // nazwie karty (ADR 0002); brak deskryptora = mana bez ograniczeń.
      const spendOnly = effects[0].spendOnly ?? null;
      if (spendOnly === 'artifact' && restrictedManaBlocked(purpose)) break;
      if (spendOnly != null && spendOnly !== 'artifact') break; // nieznane ograniczenie = nie oferujemy
      out.push({ object, amount: effects[0].amount ?? 1, colors: effects[0].colors ?? src?.colors ?? [], spendOnly });
      break;
    }
  }
  return out;
}

/** M179/D: auto-tap nielandowego źródła czystej many (zdolność many — bez stosu, CR 605.3). */
export function tapFreeManaSource(state, playerId, entry) {
  const object = state.objects.get(entry.object.id);
  if (!object || object.zone !== 'battlefield' || object.tapped) throw new Error('Nielegalne źródło many (auto-tap)');
  state.objects.set(object.id, Object.freeze({ ...object, tapped: true }));
  const tappedEvent = event('object_tapped', { objectId: object.id, playerId, forMana: true });
  state.events.push(tappedEvent);
  const mana = addMana(state, playerId, entry.amount, { colors: entry.colors, spendOnly: entry.spendOnly ?? null });
  const produced = event('mana_produced', { playerId, source: object.id, amount: entry.amount, colors: [...entry.colors] });
  state.events.push(produced);
  return [tappedEvent, mana, produced];
}

export function producibleMana(state, playerId, excludeSourceId = null, purpose = {}) {
  // M174/B (Immersturm Skullcairn, klasa L48): koszt zdolności z {T}
  // WŁASNEGO źródła many — źródło tapnięte kosztem nie zapłaci już many,
  // więc oferta liczy zdolność BEZ niego (excludeSourceId); płatność i tak
  // je pomija (jest tapnięte przed spendMana).
  // Batch 44 (Heap Gate): koszt może tapować WIĘCEJ źródeł naraz ({T} źródła
  // + „tap an untapped Gate") — excludeSourceId przyjmuje też tablicę id.
  const excluded = excludeSourceId == null
    ? null
    : new Set(Array.isArray(excludeSourceId) ? excludeSourceId : [excludeSourceId]);
  const player = state.players.find((entry) => entry.id === playerId);
  let fromLands = 0;
  for (const land of untappedLandManaSources(state, playerId)) {
    if (excluded != null && excluded.has(land.id)) continue;
    const grant = grantManaOnLand(state, land.id);
    fromLands += grant > 0 ? grant : 1;
  }
  // M179/D: nielandowe źródła czystej many liczą się do oferty rzutów.
  let fromFree = 0;
  for (const entry of untappedFreeManaSources(state, playerId, excludeSourceId, purpose)) fromFree += entry.amount;
  // Pula: mana ograniczona liczy się WYŁĄCZNIE, gdy cel wydania jest dozwolony.
  const restrictedInPool = restrictedManaBlocked(purpose) ? (player?.artifactOnlyMana ?? 0) : 0;
  return Math.max(0, (player?.mana ?? 0) - restrictedInPool) + fromLands + fromFree;
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
/**
 * Przypisanie koloru zdolności grant (Nature's Embrace: dwa many JEDNEGO
 * koloru) spójne z canPayColoredCost. spendMana nie może brać „pierwszego
 * pipa" — wtedy oferta (backtracking) mówi TAK, a płatność pada
 * (Island + Plains+Embrace vs {U}{G}).
 */
export function planGrantManaColors(state, playerId, requirements, excludeSourceId = null) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return null;
  const units = expandManaPool(player.manaPool);
  const grantLands = [];
  for (const obj of untappedLandManaSources(state, playerId)) {
    // M174/B (L48): źródło tapowane kosztem zdolności nie płaci jej pipów.
    if (excludeSourceId != null && obj.id === excludeSourceId) continue;
    const grant = grantManaOnLand(state, obj.id);
    if (grant > 0) grantLands.push({ id: obj.id, grant });
    else {
      const src = getSourceForObject(obj);
      units.push(src?.colors ?? []);
    }
  }
  // M179/D: jednostki z nielandowych źródeł czystej many (kolor efektu).
  for (const entry of untappedFreeManaSources(state, playerId, excludeSourceId)) {
    for (let i = 0; i < entry.amount; i += 1) units.push([...entry.colors]);
  }
  if (grantLands.length === 0) {
    return matchColorRequirements(units, requirements) ? [] : null;
  }
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const assignment = [];
  const tryAssign = (idx) => {
    if (idx >= grantLands.length) return matchColorRequirements(units, requirements);
    const n = grantLands[idx].grant;
    for (const c of COLORS) {
      for (let i = 0; i < n; i += 1) units.push([c]);
      assignment[idx] = c;
      if (tryAssign(idx + 1)) return true;
      for (let i = 0; i < n; i += 1) units.pop();
    }
    return false;
  };
  if (!tryAssign(0)) return null;
  return grantLands.map((g, i) => ({ id: g.id, color: assignment[i], grant: g.grant }));
}

export function canPayColoredCost(state, playerId, requirements, excludeSourceId = null) {
  // MtG-castability KOLORÓW: czy pip(y) kolorowe da się dopasować do dostępnych
  // jednostek many (kolorowa pula + NIETAPNIĘTE źródła — da się tapnąć). Sprawd-
  // zane PRZED tapnięciem (do rzutu trzeba źródeł, których można UŻYĆ). AMOUNT
  // (efektywny koszt vs producibleMana) jest sprawdzany OSOBNO na ścieżkach
  // rzutów — tu rozłączamy kolor od sumy (m.in. Metalcraft/Sculptor redukują
  // generic, więc nie liczymy go tu). excludeSourceId — patrz producibleMana
  // (koszt z {T} własnego źródła many, M174/B).
  return planGrantManaColors(state, playerId, requirements, excludeSourceId) !== null;
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

/**
 * M69 (Security Rhox): dostępna mana ze Skarbów — pula (treasureMana, śledzona
 * per jednostka przy addMana fromTreasure) + nietapnięte tokeny Treasure na
 * polu bitwy. Koszt alternatywny „Spend only mana produced by Treasures".
 */
export function treasureManaAvailable(state, playerId) {
  const player = state.players.find((p) => p.id === playerId);
  let total = player?.treasureMana ?? 0;
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (!object || object.controllerId !== playerId || object.tapped) continue;
    if (object.cardId !== 'token_treasure') continue;
    total += 1;
  }
  return total;
}

/**
 * M159/F2 (audyt PR #66, L48 oferta=walidacja): czy gracza STAĆ na rzut karty
 * za koszt madness. Lustro bramek płatności castPermanent(madnessCast:true)/
 * castMadnessSpell: redukcje generyczne, producibleMana i pipy KOSZTU
 * MADNESS (M161/O2 — nie pipy karty; dla karty o innych kolorach kosztu
 * madness niż bazowy to jedyna słuszna bramka). PlayerView oferuje
 * resolve_madness_cast { cast: true } wyłącznie, gdy ta funkcja zwraca
 * true — inaczej oferta bez skutku kończy się rejectem, a bot
 * (cast=60 > odmowa=0) crashuje sesję.
 */
export function canPayMadnessCost(state, playerId, object) {
  if (!object?.madness) return false;
  let cost = object.madness.cost ?? object.manaCost ?? 0;
  cost = reduceGenericCost(object.cardId, cost, costReductionForSpell(state, object) + conditionalCostReduction(state, object));
  const phyrexian = object.phyrexianManaCost ?? 0;
  // M202/N1: madness to alternatywny koszt RZUCENIA czaru (CR 702.71).
  if (producibleMana(state, playerId, null, spellManaPurpose(object)) < cost + phyrexian) return false;
  const requirements = (object.madness.colors ?? []).map((color) => [color]);
  return hasColorRequirements(state, playerId, requirements);
}

export function castPermanent(state, playerId, objectId, { faceDown = false, phyrexianPayWithLife = 0, exileTargetId = null, kicked = false, treasureAlt = false, warpCast = false, madnessCast = false } = {}) {
  const player = state.players.find((entry) => entry.id === playerId);
  const object = state.objects.get(objectId);
  // Zaplotowana karta leży w exile (plotted: true) i rzuca się BEZ kosztu many
  // (CR 702.136 — „Cast it as a sorcery on a later turn without paying its
  // mana cost"). Batch 24: Spinewoods Paladin — plot dla permanentów.
  const plotted = object?.zone === 'exile' && object.plotted;
  // Batch 47 (Caves of Chaos Adventurer, CR 701.51b): karta wygnana impulse
  // po UKOŃCZONYM lochu gra się „without paying its mana cost" — tak jak
  // plot. Flagę ustawia efekt wygnania (exile_top_playable_until_next_turn),
  // tutaj tylko ZERUJEMY koszt; bez tego pole byłoby martwe (L48: oferta
  // i płatność muszą znać tę samą regułę).
  const freeImpulse = object?.zone === 'exile' && object.playableWithoutPaying === true;
  // M158/Batch 39 (CR 702.34): rzut za koszt madness z exile (karta
  // odrzucona z madnessReady) — timing ignorowany (rzut w rozstrzyganiu
  // zdolności, jak rebound/suspend).
  const madnessLive = object?.zone === 'exile' && object.madnessReady;
  // M154 (Batch 38, Warp): karta z warpReady (wygnana po warp-caście w końcowym
  // kroku) można rzucić w późniejszej turze ZA KOSZT WARP (nie za darmo).
  const warpReady = object?.zone === 'exile' && object.warpReady;
  // CR 702.136: "on a later turn" — can't cast the same turn you plotted.
  if (plotted && object.plottedAtTurn != null && state.turn.number <= object.plottedAtTurn) {
    throw new Error('Plot: można rzucić dopiero w późniejszej turze');
  }
  // Batch 47 (Gila Courser, Caves of Chaos Adventurer): PERMANENT wygnany
  // impulsem jest grywalny z exile do konca wskazanej tury (CR 601.2b).
  // Bez tej bramki oferta pokazywala ruch, ktorego walidacja nie przyjmowala.
  const impulseLive = object?.zone === 'exile' && object.playableUntilTurn != null
    && state.turn.number <= object.playableUntilTurn;
  if (!player || !object || object.controllerId !== playerId || (object.zone !== 'hand' && !plotted && !warpReady && !madnessLive && !impulseLive)) throw new Error('Nielegalny permanent');
  if (object.kind !== 'creature' && object.kind !== 'artifact' && object.kind !== 'enchantment') throw new Error('Ten obiekt nie jest zagrywalnym permanentem');
  // Flash (CR 702.8): permanent z flash można zagrać w każdej fazie (jak instant);
  // bez flash — tylko w swojej main phase (plot też rzuca się jako sorcery).
  const hasFlash = (object.keywords ?? []).includes('flash');
  // M159/F1 (audyt PR #66, CR 702.34e): rzut za koszt madness następuje przy
  // rozstrzyganiu jednorazowej decyzji (jak suspend/rebound) i IGNORUJE
  // timing — także w cleanup (odrzucenie ponad limit ręki) i w turze
  // przeciwnika. Bez wyjątku bramka odrzucała rzut, a heuristic-bot zawsze
  // wybierał cast:true → crash sesji „Bot wybrał nielegalną komendę".
  if (!hasFlash && !madnessCast && (state.turn.activePlayerId !== playerId || !['precombat_main', 'postcombat_main'].includes(state.turn.phase))) throw new Error('Zagranie poza main phase');
  // Timing sorcery (CR 307.1/117.1a): rzut permanenta bez flash wymaga
  // PUSTEGO stosu — czar idzie na stos i rozstrzyga się po rundzie passów.
  if (!hasFlash && !madnessCast && state.zones.stack.length > 0) throw new Error('Zagranie przy niepustym stosie');
  if (warpCast && !object.warp) throw new Error('Ta karta nie ma mechaniki warp');
  if (madnessCast && !object.madness) throw new Error('Ta karta nie ma mechaniki madness');
  if (warpCast && (faceDown || kicked || treasureAlt || phyrexianPayWithLife > 0)) throw new Error('Koszt warp wyklucza morph/kicker/phyrexian/skarby');
  let cost = (plotted || freeImpulse) ? 0 : (warpCast ? (object.warp?.cost ?? object.manaCost ?? 0)
    : (madnessCast ? (object.madness?.cost ?? object.manaCost ?? 0) : (object.manaCost ?? 0)));
  if (faceDown) {
    if (!object.morph || object.morph.cost == null) throw new Error('Ta karta nie może być zagrana twarzą w dół');
    // M111 (CR 601.2f + 708.2): rzut zakryty to czar-STWÓR bez innych typów,
    // więc obniżki „artifact spells cost {1} less" go nie dotyczą, ale
    // obniżki bez filtru typu — owszem. Modyfikatory liczymy na cechach
    // czaru zakrytego, nie karty.
    cost = reduceAlternativeCost(
      state,
      { ...object, types: ['Creature'], subtypes: [], colors: [] },
      object.morph.cost,
    );
  } else {
    // Modyfikatory kosztu z permanentów (Etherium Sculptor: artefakty tańsze
    // o {1}, CR 601.2f) — redukcja wyłącznie części generycznej, nie obejmuje
    // symboli phyrexian (doliczanych niżej) ani kosztu morph (alternatywnego).
    // M113: obniżka z permanentów ORAZ warunkowa obniżka samej karty
    // (Academy Journeymage: „{1} less if you control a Wizard").
    cost = reduceGenericCost(object.cardId, cost, costReductionForSpell(state, object) + conditionalCostReduction(state, object));
  }
  // Kicker (CR 702.33, Kor Sanctifiers): „You may pay an additional {W} as
  // you cast this spell" — wariant kicked dodaje koszt i pipy kolorów do
  // wymagań, a na permanencie ląduje flaga wasKicked (triggery „if it was
  // kicked" czytają condition). Kicker nie podlega obniżkom (koszt
  // dodatkowy, CR 601.2f — jak koszty alternatywne).
  if (kicked && !object.kicker) throw new Error('Ta karta nie ma mechaniki kicker');
  const kicker = kicked ? (object.kicker ?? null) : null;
  // M69 (Security Rhox): „You may pay {R}{G} rather than pay this spell's mana
  // cost. Spend only mana produced by Treasures to cast it this way." — koszt
  // ALTERNATYWNY (CR 601.2b), bez redukcji generycznej; wyklucza morph/kicker/
  // phyrexian. Walidacja i płatność tylko maną ze Skarbów.
  const treasureAltCost = treasureAlt ? (object.treasureAltCost ?? null) : null;
  if (treasureAltCost) {
    if (faceDown || kicked || phyrexianPayWithLife > 0) throw new Error('Koszt alternatywny ze Skarbów wyklucza morph/kicker/phyrexian');
    cost = treasureAltCost.mana ?? 0;
  }
  // Plot – rzut bez kosztu many (bez koloru) – pomijamy walidację kolorową
  // (jak legalSpellCasts dla zaplotowanych czarów). Koszt alternatywny ze
  // Skarbów walidujemy osobno niżej.
  // M161/O2 (zasada właściciela 2026-08-20 — gotowość kodu na przyszłe karty):
  // przy koszcie alternatywnym madness/warp bramka kolorów sprawdza pipy
  // AKTYWNEGO kosztu alternatywnego, a nie pipy karty (dotąd
  // hasColorManaForObject → coloredPipsOf(cardId)). Dla dzisiejszego katalogu
  // tożsame (Revolutionist {5}{R} vs {3}{R}, Weftblade {5}{W} vs {2}{W}) —
  // pierwsza karta o innych kolorach kosztu madness/warp przechodzi przez
  // właściwą bramkę (obserwacja audytu PR #66).
  const altCostColors = madnessCast
    ? (object.madness?.colors ?? []).map((color) => [color])
    : warpCast
      ? (object.warp?.colors ?? []).map((color) => [color])
      : null;
  if (!plotted && !freeImpulse && !faceDown && !treasureAltCost) {
    const colorGateOk = altCostColors
      ? hasColorRequirements(state, playerId, altCostColors)
      : hasColorManaForObject(state, playerId, object, phyrexianPayWithLife);
    if (!colorGateOk) throw new Error('Brak kolorowego źródła many');
  }
  // Phyrexian mana (CR 118.9): każdy symbol {W/P} można opłacić maną ({W})
  // albo 2 życiem — wybór NALEŻY DO GRACZA (parametr phyrexianPayWithLife
  // komendy cast_permanent; PlayerView wylicza wszystkie opłacalne warianty,
  // UI grupuje je w ChoiceRequest). Podstawa kosztu (tu {2}) zawsze z many.
  const phyrexian = treasureAltCost ? 0 : (object.phyrexianManaCost ?? 0);
  const lifePaid = phyrexian > 0 ? (phyrexianPayWithLife ?? 0) : 0;
  if (lifePaid < 0 || lifePaid > phyrexian) throw new Error('Nieprawidłowa liczba symboli phyrexian płaconych życiem');
  if (faceDown && lifePaid !== 0) throw new Error('Morph nie ma kosztu phyrexian');
  const totalMana = cost + (phyrexian - lifePaid) + (kicker?.cost ?? 0);
  // Opłacalność liczona po MANIE PRODUKOWALNEJ (pula + nietapnięte landy) —
  // spendMana sam do-tapuje brakujące landy. Koszt alternatywny ze Skarbów
  // ma własną walidację (treasureManaAvailable) poniżej.
  // M201 (znalezisko #3): cel wydania many — druk Powerstone pozwala płacić
  // wyłącznie za czary-ARTEFAKTY (typ liczony z danych obiektu, nie z nazwy).
  const manaPurpose = spellManaPurpose(object);
  if (!treasureAltCost && producibleMana(state, playerId, null, manaPurpose) < totalMana) throw new Error('Niewystarczająca mana');
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
  // M177/B (Makeshift Mauler): „exile a creature card from your graveyard”
  // — walidacja PRZED mutacją (CR 601.2h), kandydat z WŁASNEGO grobu.
  const exileGraveCost = object.additionalCost?.exileCreatureFromGraveyard;
  if (exileGraveCost) {
    const exileObj = state.objects.get(exileTargetId);
    if (!exileObj || exileObj.zone !== 'graveyard' || exileObj.kind !== 'creature' || exileObj.controllerId !== playerId) {
      throw new Error('Nielegalny cel dodatkowego kosztu (exile a creature card from your graveyard)');
    }
  }
  // Kicker dodaje pipy kolorów do wymagań (Kor Sanctifiers: {W} + kicker {W}
  // = dwa pipy białe); walidacja dotyczy całej sumy PRZED mutacją.
  const kickerPips = (kicker?.colors ?? []).map((color) => [color]);
  // Morph face-down (CR 702.36): koszt {3} jest BEZBARWNY — pipy karty nie
  // obowiązują (root cause: face-down Monastery Flock wymagał {U} z powodu
  // pipów karty; cicha zła płatność w consumeManaPool to maskowała).
  // Plot – rzut bez kosztu many – nie ma też wymagań kolorowych (CR 702.136).
  // M161/O2: przy madness/warp pipy AKTYWNEGO kosztu alternatywnego
  // (altCostColors — ta sama lista co bramka kolorów wyżej).
  const requirements = (faceDown || plotted || freeImpulse) ? [] : altCostColors
    ? altCostColors
    : treasureAltCost
      ? (treasureAltCost.colors ?? []).map((color) => [color])
      : [...coloredPipsOf(object.cardId, lifePaid), ...kickerPips];
  if (!faceDown && !plotted && !freeImpulse && !warpCast && !madnessCast && !treasureAltCost && !hasColorRequirements(state, playerId, requirements)) {
    throw new Error('Brak kolorowego źródła many');
  }
  if (treasureAltCost) {
    // „Spend only mana produced by Treasures" — dostępne Skarby (pula +
    // nietapnięte tokeny) muszą pokryć sumę i pipy (jednostki dowolnego koloru).
    const available = treasureManaAvailable(state, playerId);
    if (available < totalMana) throw new Error('Koszt alternatywny wymaga many ze Skarbów');
    const treasureUnits = Array.from({ length: available }, () => ['W', 'U', 'B', 'R', 'G']);
    if (!matchColorRequirements(treasureUnits, requirements)) throw new Error('Brak kolorowej many ze Skarbów');
    // Dołóż Skarby z pola bitwy do puli (koszt: poświęć token, dodaj manę any
    // fromTreasure) — spendMana wyda manę skarbową w pierwszej kolejności.
    let need = totalMana - (player.treasureMana ?? 0);
    for (const id of [...state.zones.battlefield]) {
      if (need <= 0) break;
      const object = state.objects.get(id);
      if (!object || object.controllerId !== playerId || object.tapped || object.cardId !== 'token_treasure') continue;
      const graveId = `grave-${state.objectSequence++}`;
      moveObjectDirectly(state, id, 'graveyard', graveId);
      addMana(state, playerId, 1, { colors: ['W', 'U', 'B', 'R', 'G'], fromTreasure: true });
      need -= 1;
    }
    if ((player.treasureMana ?? 0) < totalMana) throw new Error('Niewystarczająca mana ze Skarbów');
  }
  spendMana(state, playerId, totalMana, requirements, manaPurpose);
  if (lifePaid > 0) changeLife(state, playerId, -2 * lifePaid);
  state.spellsCastThisTurn += 1;
  if (exileCost) {
    const exileId = `exile-${state.objectSequence++}`;
    const exiled = moveObjectDirectly(state, exileTargetId, 'exile', exileId);
    state.events.push(event('object_exiled', { fromId: exileTargetId, objectId: exileId, object: exiled, cardId: exiled.cardId, additionalCost: true }));
  }
  if (exileGraveCost) {
    const exileId = `exile-${state.objectSequence++}`;
    const exiled = moveObjectDirectly(state, exileTargetId, 'exile', exileId);
    // object_moved grób→exile: wspólna ścieżka zdarzeń dla triggera
    // „cards are put into exile from your graveyard” (Rakshasa Vizier) —
    // ta sama, którą emituje escape (spells.js).
    state.events.push(event('object_moved', { fromId: exileTargetId, object: exiled, fromZone: 'graveyard', toZone: 'exile', additionalCost: true }));
  }
  const manaSpent = totalMana;
  // Rzut permanenta to rzut CZARU (CR 601): obiekt ląduje na STOSIE, a na
  // pole bitwy wchodzi dopiero przy rozstrzygnięciu (spells.resolveTopOfStack
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
    // M101/B4 (CR 708.2): karta zagrana twarzą w dół to „a 2/2 creature with
    // no name, no supertypes, no subtypes, no card types other than creature,
    // no rules text, no mana cost and no colors". Dotąd zakryty obiekt niósł
    // KOMPLET cech karty (kolory, podtypy, koszt, nazwę), więc np. zakryty
    // Monastery Flock był niebieskim Birdem o koszcie 2: protection from blue
    // go zatrzymywało, „can't be blocked except by black" oceniało kolor
    // karty, a efekty patrzące na podtyp/mana value widziały wartości spod
    // rewersu. Oryginał chowamy obok abilities i przywracamy przy obrocie.
    patch.faceDownOriginal = Object.freeze({
      colors: Object.freeze([...(object.colors ?? [])]),
      subtypes: Object.freeze([...(object.subtypes ?? [])]),
      types: Object.freeze([...(object.types ?? [])]),
      keywords: Object.freeze([...(object.keywords ?? [])]),
      manaCost: object.manaCost ?? 0,
      cardName: object.cardName ?? null,
    });
    patch.colors = [];
    patch.subtypes = [];
    patch.types = ['Creature'];
    patch.keywords = [];
    patch.manaCost = 0;
    patch.cardName = null;
  }
  // Ile many ze Skarba wydano na TEN rzut (Marut, CR: „if mana from a
  // Treasure was spent to cast it"). spendMana zużywa mana Skarbową jako
  // pierwszą; wpis wędruje z obiektem stosu na permanent przy rozstrzygnięciu
  // (LKI wejścia — ETB czyta go przy rozstrzyganiu triggera).
  const treasureSpent = totalMana > 0 && state.lastManaSpend?.playerId === playerId
    ? (state.lastManaSpend.treasure ?? 0)
    : 0;
  // M166/C (Adamant): breakdown kolorów many wydanej na TEN rzut — idzie
  // z obiektem stosu do permanentu (entersWithCountersIf.adamant czyta go
  // przy wejściu, jak manaFromTreasureSpent dla Maruta).
  const manaColorsSpent = totalMana > 0 && state.lastManaSpend?.playerId === playerId
    ? Object.freeze([...(state.lastManaSpend.colors ?? [])])
    : Object.freeze([]);
  consumePendingSpellDiscount(state, object);
  const stacked = Object.freeze({
    ...moved, ...patch, wasCast: true, manaFromTreasureSpent: treasureSpent, manaColorsSpent,
    // M154 (Warp): permanent rzucony za koszt warp — przy wejściu zbroimy
    // opóźniony trigger wygnania w końcowym kroku (resolvePermanentSpell).
    ...(warpCast ? { warped: true } : {}),
    // M158: rzut za madness — traci gotowość (jednorazowa).
    ...(madnessCast ? { madnessReady: false } : {}),
    // M158/Batch 39: jednorazowy rabat na następny czar podtypu (III Sagi)
    // konsumuje też rzut permanentu-spell („Giant spell" obejmuje stwory).
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
  // entersWithCounters i bloodthirst to cechy WEJŚCIA na pole bitwy — aplikuje
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

/**
 * Audyt PR #41 (B6, CR 702.16b): aura to czar z celem — permanent z protection
 * od koloru czaru nie może być jej celem (jak w validateTargets dla innych
 * czarów). Kolory źródła = kolory karty aury/bestow. Używane w ofercie
 * (legalAuraCasts), walidacji (castAuraSpell) i przy rozstrzyganiu
 * (resolveAuraSpell — gospodarz mógł zyskać protection na stosie).
 */
function auraTargetProtected(state, host, sourceObject) {
  if (!host || host.zone !== 'battlefield') return false;
  // M110 (CR 702.16c): ochrona przed JAKOŚCIĄ (np. „protection from
  // Auras"/„from non-Human creatures" dla aur-stworów z bestow).
  if (isProtectedFromSource(state, host, sourceObject)) return true;
  const protColors = effectiveProtectionFromColors(state, host);
  if (protColors.length === 0) return false;
  return (sourceObject.colors ?? []).some((c) => protColors.includes(c));
}

export function castAuraSpell(state, playerId, objectId, { targetId, bestow = false } = {}) {
  const player = state.players.find((entry) => entry.id === playerId);
  const object = state.objects.get(objectId);
  if (!player || !object || object.controllerId !== playerId || object.zone !== 'hand') throw new Error('Nielegalna karta aury');
  if (bestow && !object.bestow) throw new Error('Ta karta nie ma mechaniki bestow');
  if (!bestow && !object.aura) throw new Error('Tę kartę można rzucić jako aurę tylko za koszt bestow');
  // Flash (CR 702.8): aura z flash rzucana jest jak instant — jak permanent
  // z flash w castPermanent. Bez flash obowiązuje timing sorcery (CR 307.1).
  const hasFlashAura = (object.keywords ?? []).includes('flash');
  if (!hasFlashAura && (state.turn.activePlayerId !== playerId || !['precombat_main', 'postcombat_main'].includes(state.turn.phase))) throw new Error('Czar aury tylko w swoją fazę main');
  if (!hasFlashAura && state.zones.stack.length > 0) throw new Error('Czar aury tylko przy pustym stosie');
  // Czysta aura płaci zwykły koszt many (z ewentualną obniżką z permanentów
  // — Etherium Sculptor dla aur-artefaktów, CR 601.2f); bestow — koszt bestow.
  // M111 (CR 601.2f): obniżka działa też na koszt bestow (koszt alternatywny).
  const cost = bestow
    ? reduceAlternativeCost(state, object, object.bestow.cost ?? 0)
    : reduceGenericCost(object.cardId, object.manaCost ?? 0, costReductionForSpell(state, object));
  // M202/N1: czar aury to rzut czaru — cel wydania liczony z danych karty.
  const manaPurpose = spellManaPurpose(object);
  if (producibleMana(state, playerId, null, manaPurpose) < cost) throw new Error('Niewystarczająca mana');
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
      if (!host || host.zone !== 'battlefield') throw new Error('Czarem aury trzeba celować w permanent na polu bitwy');
      const isArtOrCreature = host.kind === 'creature' || host.kind === 'artifact' || (host.types ?? []).includes('Artifact');
      if (!isArtOrCreature) throw new Error('Czarem aury trzeba celować w artefakt lub stwora');
      // Batch 48: „you control" tylko gdy Oracle tak mówi (ownControlOnly).
      if (object.aura?.ownControlOnly !== false && host.controllerId !== playerId) {
        throw new Error('Czarem aury trzeba celować we własny permanent');
      }
    } else if (object.aura?.enchant === 'enchantment' || object.aura?.enchantType === 'enchantment') {
      // Batch 23: Feedback — „Enchant enchantment". Legalność gospodarza
      // wspólna z attach/SBA (attachments.isLegalAuraHost): enchantment na
      // polu bitwy (także enchantment creature, CR 303.4a).
      if (!host || host.zone !== 'battlefield'
        || (host.kind !== 'enchantment' && !(host.types ?? []).includes('Enchantment'))) {
        throw new Error('Celem czaru aury musi być enchantment na polu bitwy');
      }
    } else if (object.aura?.enchantType === 'creature_or_land') {
      const isLand = host && (host.kind === 'land' || (host.types ?? []).includes('Land'));
      if (!host || host.zone !== 'battlefield' || (host.kind !== 'creature' && !isLand)) {
        throw new Error('Celem czaru aury musi być stwór albo ląd');
      }
    } else if (object.aura?.enchantType === 'creature_you_control') {
      // Batch 45 (Pain for All): „Enchant creature you control" — host musi
      // być stworem POD KONTROLĄ rzucającego (walidacja spójna z ofertą, M82).
      if (!host || host.zone !== 'battlefield' || host.kind !== 'creature' || host.controllerId !== playerId) {
        throw new Error('Celem czaru aury musi być własny stwór');
      }
    } else if (object.aura?.enchantType === 'creature_or_vehicle') {
      // M154 (Batch 38): Silken Strength — „Enchant creature or Vehicle".
      const isVehicle = host && (host.subtypes ?? []).includes('Vehicle');
      if (!host || host.zone !== 'battlefield' || (host.kind !== 'creature' && !isVehicle)) {
        throw new Error('Celem czaru aury musi być stwór albo Vehicle');
      }
    } else if (object.aura?.enchant === 'land' || object.aura?.enchantType === 'land') {
      // Chronic Flooding: „Enchant land" — walidacja spójna z ofertą.
      const isLand = host && (host.kind === 'land' || (host.types ?? []).includes('Land'));
      if (!host || host.zone !== 'battlefield' || !isLand) {
        throw new Error('Celem czaru aury musi być ląd na polu bitwy');
      }
    } else {
      if (!host || host.zone !== 'battlefield' || host.kind !== 'creature') throw new Error('Celem czaru aury musi być stwór na polu bitwy');
    }
    // Hexproof (CR 702.11b): aura to czar z celem — nie może zaczarować
    // cudzego permanenta z hexproof. Oferta i walidacja spójne.
    if (auraTargetHexproof(state, host, playerId)) {
      throw new Error('Celem czaru aury nie może być permanent z hexproof');
    }
    // Audyt PR #41 (B6, CR 702.16b): permanent z protection od koloru czaru
    // nie może być celem czaru aury tego koloru (np. Curiosity {U} vs stwór
    // z protection od blue). Wcześniej sprawdzany był tylko hexproof.
    if (auraTargetProtected(state, host, object)) {
      throw new Error('Celem czaru aury nie może być permanent z protection od koloru czaru');
    }
    const auraHostType = (object.aura?.enchant === 'enchantment' || object.aura?.enchantType === 'enchantment')
      ? 'enchantment'
      : (object.aura?.enchantType === 'creature_or_vehicle' ? 'creature_or_vehicle' : 'creature');
    spellTargets = Object.freeze([Object.freeze({ type: auraHostType })]);
  }
  spendMana(state, playerId, cost, coloredPipsOf(object.cardId), manaPurpose);
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  // Deskryptor czaru aury (jak czar): rozstrzygnięcie = wejście na pole bitwy
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
 * Warianty rzucenia aury (karta w ręce × legalny cel-stwór na polu bitwy).
 * Cel to DOWOLNY stwór („enchant creature" bez ograniczenia kontrolera).
 * Karty z bestow dają warianty bestow:true; czyste aury — warianty zwykłe
 * (bestow:false, koszt many karty). Aury wymagają celu już przy rzuceniu
 * (CR 601.2c) — bez stwora na polu bitwy nie da się jej w ogóle rzucić.
 */
export function legalAuraCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const out = [];
  if (!player) return out;
  // Oferta po manie produkowalnej — czar aury widać przed tapowaniem landów.
  // + walidacja kolorowa (Sweet Oblivion bug: 2 Plains nie mogą rzucić U)
  for (const id of state.zones.hand) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId) continue;
    // M202/N1 (L48): budżet PER KARTA z celem wydania many — mana ograniczona
    // drukiem nie opłaci czaru nie-artefaktowego, więc jedna wspólna liczba
    // rozjeżdżałaby ofertę z walidacją.
    const manaAvailable = producibleMana(state, playerId, null, spellManaPurpose(object));
    const options = [];
    if (object.aura && reduceGenericCost(object.cardId, object.manaCost ?? 0, costReductionForSpell(state, object)) <= manaAvailable && hasColorManaForObject(state, playerId, object, 0)) options.push(false);
    if (object.bestow && reduceAlternativeCost(state, object, object.bestow.cost ?? 0) <= manaAvailable && hasColorManaForObject(state, playerId, object, 0)) options.push(true);
    if (options.length === 0) continue;
    // Aura „Enchant player" (Curse): celem jest GRACZ, nie stwór — wybór celu
    // przez gracza (każdy gracz jest legalnym celem; przeciwnik zwykle cenniejszy).
    if (object.enchantPlayer) {
      for (const targetId of state.players.map((p) => p.id)) {
        for (const isBestow of options) out.push({ objectId: id, targetId, bestow: isBestow });
      }
      continue;
    }
    // Protection (CR 702.16b) — spójnie z castAuraSpell: cel z protection od
    // koloru aury nie jest oferowany (oferta = walidacja).
    const protectedTarget = (target) => auraTargetProtected(state, target, object);
    if (object.aura?.enchantType === 'artifact_or_creature') {
      // Batch 48 (Clawing Torment, NEO): Oracle bywa DWOJAKI — „Enchant
      // artifact or creature YOU CONTROL" (Moonlit Meditation) albo bez tego
      // ograniczenia (Clawing Torment: aura-debuff rzucana na przeciwnika).
      // Ograniczenie jest DESKRYPTOREM (`ownControlOnly`), nie stałą w kodzie.
      const ownOnly = object.aura?.ownControlOnly !== false;
      for (const targetId of state.zones.battlefield) {
        const target = state.objects.get(targetId);
        const isArtOrCreature = target && (target.kind === 'creature' || target.kind === 'artifact' || (target.types ?? []).includes('Artifact'));
        if (isArtOrCreature && (!ownOnly || target.controllerId === playerId) && !auraTargetHexproof(state, target, playerId) && !protectedTarget(target)) {
          out.push({ objectId: id, targetId, bestow: false });
        }
      }
    } else if (object.aura?.enchant === 'enchantment' || object.aura?.enchantType === 'enchantment') {
      // Batch 23: Feedback — Enchant enchantment
      for (const targetId of state.zones.battlefield) {
        const target = state.objects.get(targetId);
        const isEnchantment = target && (target.kind === 'enchantment' || (target.types ?? []).includes('Enchantment'));
        if (isEnchantment && target.zone === 'battlefield' && !auraTargetHexproof(state, target, playerId) && !protectedTarget(target)) {
          for (const bestow of options) out.push({ objectId: id, targetId, bestow });
        }
      }
    } else if (object.aura?.enchant === 'land' || object.aura?.enchantType === 'land') {
      // Chronic Flooding: „Enchant land" — gospodarzem jest dowolny land na
      // polu bitwy (także przeciwnika; ta aura nie jest „przyjazna").
      for (const targetId of state.zones.battlefield) {
        const target = state.objects.get(targetId);
        if (!target || target.zone !== 'battlefield') continue;
        const isLand = target.kind === 'land' || (target.types ?? []).includes('Land');
        if (isLand && !auraTargetHexproof(state, target, playerId) && !protectedTarget(target)) {
          out.push({ objectId: id, targetId, bestow: false });
        }
      }
    } else if (object.aura?.enchantType === 'creature_or_land') {
      for (const targetId of state.zones.battlefield) {
        const target = state.objects.get(targetId);
        if (!target || target.zone !== 'battlefield') continue;
        const isLand = target.kind === 'land' || (target.types ?? []).includes('Land');
        if ((target.kind === 'creature' || isLand) && !auraTargetHexproof(state, target, playerId) && !protectedTarget(target)) {
          for (const bestow of options) out.push({ objectId: id, targetId, bestow });
        }
      }
    } else if (object.aura?.enchantType === 'creature_you_control') {
      // Batch 45 (Pain for All): „Enchant creature you control" — oferta
      // tylko WŁASNYCH stworów (oferta = walidacja, pułapka M82).
      for (const targetId of state.zones.battlefield) {
        const target = state.objects.get(targetId);
        if (target && target.zone === 'battlefield' && target.kind === 'creature'
          && target.controllerId === playerId
          && !auraTargetHexproof(state, target, playerId) && !protectedTarget(target)) {
          out.push({ objectId: id, targetId, bestow: false });
        }
      }
    } else if (object.aura?.enchantType === 'creature_or_vehicle') {
      // M154 (Batch 38): Silken Strength — stwór albo Vehicle.
      for (const targetId of state.zones.battlefield) {
        const target = state.objects.get(targetId);
        if (!target || target.zone !== 'battlefield') continue;
        const isVehicle = (target.subtypes ?? []).includes('Vehicle');
        if ((target.kind === 'creature' || isVehicle) && !auraTargetHexproof(state, target, playerId) && !protectedTarget(target)) {
          for (const bestow of options) out.push({ objectId: id, targetId, bestow });
        }
      }
    } else {
      for (const targetId of state.zones.battlefield) {
        const target = state.objects.get(targetId);
        if (target && target.zone === 'battlefield' && target.kind === 'creature' && !auraTargetHexproof(state, target, playerId) && !protectedTarget(target)) {
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
    // more other Islands" — wchodzący land NIE jest jeszcze na polu bitwy, więc
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
    // Kishla Village (TDM): „enters tapped unless you control an Island or a
    // Swamp" — wystarczy JEDEN land o KTÓRYMKOLWIEK z wymienionych podtypów.
    // Wariant ogólny (lista podtypów, próg `amount`), nie karto-specyficzny:
    // Oracle nie mówi „other", ale wchodzący land i tak nie ma tych podtypów.
    if (cond.type === 'controls_land_subtype_any') {
      const wanted = cond.subtypes ?? [];
      const matching = state.zones.battlefield.filter((id) => {
        if (id === newId) return false;
        const obj = state.objects.get(id);
        if (!obj || obj.zone !== 'battlefield' || obj.controllerId !== player.id) return false;
        if (!(obj.kind === 'land' || (obj.types ?? []).includes('Land'))) return false;
        return (obj.subtypes ?? []).some((subtype) => wanted.includes(subtype));
      }).length;
      if (matching >= (cond.amount ?? 1)) shouldEnterTapped = false;
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
  // M168/A (uwaga właściciela, Idyllic Grange): entersTapped w zdarzeniu ma
  // być WYNIKIEM (shouldEnterTapped), nie deskryptorem karty — Grange przy
  // 3+ Plains wchodzi ODTAPIONY, a log mówił „wchodzi zatapnięty".
  const e = event('land_played', { playerId, fromId: objectId, object: placed, entersTapped: Boolean(shouldEnterTapped) });
  state.events.push(e);
  return e;
}
