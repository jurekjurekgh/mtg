import { event } from '../protocol/types.js';
import { producibleMana, spendMana, canPayColoredCost } from './resources.js';
import { moveObjectDirectly } from './objects.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from './permanents.js';
import { applyEffect } from './effects.js';
import { resolveTriggerEntry } from './triggers.js';
import { attachAuraToCreature, isLegalAuraHost } from './attachments.js';
import { effectiveProtectionFromColors } from './attachments.js';
import { addCounter } from './counters.js';
import { MANA_COSTS } from '../cards/mana-costs-data.js';
import { parseManaCost, canPayManaCost, costReductionForSpell, reduceGenericCost, coloredPipsOf } from './mana-cost.js';
import { allControlledManaSources } from './mana-sources.js';

function hasColorForSpell(state, playerId, cardId) {
  const costStr = MANA_COSTS[cardId];
  if (!costStr) return true;
  const parsed = parseManaCost(costStr);
  if (!parsed) return true;
  if (parsed.colored.length === 0 && parsed.hybrid.length === 0 && parsed.phyrexian.length === 0) return true;
  // Kolorowa pula (cz. 7): MtG-castability z UŻYTECZNYCH źródeł (pula + untapped).
  return canPayColoredCost(state, playerId, coloredPipsOf(cardId));
}

function hasColorForObject(state, playerId, object) {
  if (!object) return true;
  if (object.kind === 'land') return true;
  return hasColorForSpell(state, playerId, object.cardId);
}

/**
 * Czary (instants/sorceries) przechodzą przez stos: rzucenie kładzie obiekt
 * na stos, a rozstrzygnięcie następuje po rundzie passów (LIFO). To jest
 * centralna pętla MtG — w przeciwieństwie do uproszczonej ścieżki permanentów
 * (cast_permanent), która na razie nie korzysta ze stosu.
 *
 * Deskryptor czaru na obiekcie (`object.spell`):
 * { timing: 'instant'|'sorcery', targets: [{ type: 'creature' }],
 *   effects: [{ type: 'damage', amount } | { type: 'pump', power, toughness }] }
 * Deskryptory buduje warstwa kart; core zna wyłącznie ogólne typy efektów,
 * nigdy nazwy kart.
 */

function requireSpell(state, playerId, objectId, targets, cleaved) {
  const object = state.objects.get(objectId);
  const plotted = object?.zone === 'exile' && object.plotted;
  if (!object || object.controllerId !== playerId || (!['hand', 'exile'].includes(object.zone)) || object.kind !== 'spell' || (object.zone === 'exile' && !plotted)) {
    throw new Error('To nie jest rzucalny czar z ręki albo zaplotowany z exile');
  }
  if (!object.spell || !object.spell.effects?.length) throw new Error('Obiekt nie ma deskryptora czaru');
  const { timing } = object.spell;
  const targetSpec = cleaved && object.spell.cleave ? (object.spell.cleave.targets ?? []) : (object.spell.targets ?? []);
  if (timing === 'sorcery') {
    const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
    if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) {
      throw new Error('Czar sorcery tylko w swoją fazę main przy pustym stosie');
    }
  } else if (timing !== 'instant') {
    throw new Error(`Nieznany timing czaru: ${timing}`);
  }
  const expected = targetSpec?.length ?? 0;
  const chosen = targets ?? [];
  if (!Array.isArray(chosen) || chosen.length !== expected) throw new Error('Nieprawidłowa liczba celów');
  return { object, targetSpec, chosen };
}

/**
 * Hexproof (CR 702.11): permanent kontrolowany przez INNEGO gracza nie może
 * być celem czarów ani zdolności (także triggerowanych). Efektywne keywordy
 * obejmują tymczasowy hexproofUntilTurn (Throne of the Dead Three).
 */
export function hasHexproofAgainst(state, object, casterId) {
  if (!object || object.zone !== 'battlefield') return false;
  if (object.controllerId === casterId) return false; // hexproof nie chroni przed własnymi czarami
  return effectiveKeywords(object, state).includes('hexproof');
}

/** Waliduje cele zgodnie ze specyfikacją deskryptora; zwraca obiekty celów. */
export function validateTargets(state, targetSpec, chosen, casterId, sourceColors = null) {
  return chosen.map((targetId, index) => {
    const spec = targetSpec[index];
    const object = state.objects.get(targetId);
    // Hexproof (CR 702.11): cel-permanent przeciwnika z hexproof jest nielegalny
    // dla WSZYSTKICH typów celów obiektowych (stwór, artefakt, aura, land...).
    // Cel-gracz (kind 'player') nie jest permanentem — hexproof go nie chroni.
    if (object && object.zone === 'battlefield' && object.kind !== 'player' && hasHexproofAgainst(state, object, casterId)) {
      throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
    }
    // Protection (CR 702.16): cel nie może być celem czaru/zdolności źródła
    // chronionego koloru. Sprawdzamy kolory rzucającego (casterId → objects).
    // Protection from color (CR 702.16): cel nie może być celem czaru/zdolności
    // źródła chronionego koloru. Sprawdzamy _effectiveProtectionFromColors
    // (obliczane przez effectiveKeywords z załączników i pól obiektu).
    if (object) {
      const protColors = effectiveProtectionFromColors(state, object);
      if (protColors.length > 0) {
        // BUG 2026-08-11 (CR 702.16b): „A permanent with protection from a
        // quality can't be the target of spells or abilities with that quality".
        // Wcześniej brano kolory GRACZA (zawsze puste) — check był martwy,
        // a czar/zdolność źródła chronionego koloru mógł celować w chronionego
        // permanentu. Teraz `sourceColors` niesie kolory ŹRÓDŁA (czaru na
        // stosie / zdolności permanentu) z miejsca wywołania; fallback na
        // obiekt-castera, a ostatecznie gracza (kompatybilność).
        let srcColors = Array.isArray(sourceColors) ? sourceColors : null;
        if (!srcColors) {
          const caster = state.objects.get(casterId) ?? state.players.find(p => p.id === casterId);
          srcColors = caster?.colors ?? [];
        }
        if (srcColors.some((c) => protColors.includes(c))) {
          throw new Error(`Nielegalny cel: ${targetId} (protection)`);
        }
      }
    }
    if (spec?.type === 'creature') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „artifact" (Shatter, CR 701.7): artefakt na bitwisku (kind artifact
    // albo typ Artifact — uwzględnia artefaktowe stwory, np. Esper Stormblade).
    if (spec?.type === 'artifact') {
      const isArtifact = object && object.zone === 'battlefield'
        && (object.kind === 'artifact' || (object.types ?? []).includes('Artifact'));
      if (!isArtifact) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „artifact_or_enchantment" (Expose to Daylight, M69): artefakt albo
    // enchantment na bitwisku (typy — obejmuje artifact/enchantment creatures).
    if (spec?.type === 'artifact_or_enchantment') {
      const isAoE = object && object.zone === 'battlefield'
        && ((object.types ?? []).includes('Artifact') || (object.types ?? []).includes('Enchantment'));
      if (!isAoE) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „any target" (Release the Ants): gracz albo stwór — oba są legalne.
    if (spec?.type === 'any_target') {
      if (state.players.some((player) => player.id === targetId)) return { id: targetId, kind: 'player', controllerId: targetId };
      if (object && object.zone === 'battlefield' && object.kind === 'creature') return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „creature you control" (Guidestone Compass) — własny stwór na bitwisku.
    if (spec?.type === 'creature_you_control') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      if (object.controllerId !== casterId) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „land you control" (Unstable Frontier) — land albo land creature
    // (typ Land) kontrolowany przez gracza aktywującego zdolność.
    if (spec?.type === 'land_you_control') {
      const isLand = object && (object.kind === 'land' || (object.types ?? []).includes('Land'));
      if (!object || object.zone !== 'battlefield' || !isLand) throw new Error(`Nielegalny cel: ${targetId}`);
      if (spec.controllerId && object.controllerId !== spec.controllerId) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „player" (Grave Exchange) — dowolny gracz (przedmiot celowania).
    if (spec?.type === 'player') {
      // M69 (Dreams of Steel and Oil — „Target opponent"): spec.opponent
      // ogranicza do przeciwnika rzucającego.
      if (spec?.opponent && targetId === casterId) throw new Error(`Nielegalny cel: ${targetId} (nie przeciwnik)`);
      if (state.players.some((player) => player.id === targetId)) {
        return { id: targetId, kind: 'player', controllerId: targetId };
      }
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „creature_with_subtypes" (Lunar Rejection) — stwór z jednym ze spec.subtypes.
    if (spec?.type === 'creature_with_subtypes') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      const hasSubtype = (spec.subtypes ?? []).some((sub) => (object.subtypes ?? []).includes(sub));
      if (!hasSubtype) throw new Error(`Nielegalny cel: ${targetId}`);
      return object;
    }
    // Cel „creature card from your graveyard" (Grave Exchange) — stwór-karta
    // w grobie rzucającego.
    if (spec?.type === 'creature_card_in_graveyard') {
      if (object && object.zone === 'graveyard' && object.kind === 'creature'
        && object.controllerId === casterId) return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „card from your graveyard" (Barkform Harvester) — dowolna karta
    // w grobie kontrolera źródła.
    if (spec?.type === 'card_in_graveyard') {
      if (object && object.zone === 'graveyard' && object.controllerId === casterId) return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „noncreature spell on the stack" (Negate) — czar na stosie, który
    // NIE jest stworzeniem (instants/sorceries oraz czyste aury). Stwory
    // zagrywane przez cast_permanent nie trafiają na stos w tym engine;
    // cast bestow (kind 'creature') jest stworem i NIE jest celem Negate.
    if (spec?.type === 'noncreature_spell_on_stack') {
      // Zdolności triggerowane (kind 'trigger') to nie czary — Negate ich nie
      // kontruje (CR 701.5a: „counter target spell").
      if (object && object.zone === 'stack' && object.kind !== 'creature' && object.kind !== 'trigger') return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „spell on the stack" (Stoic Rebuttal — „Counter target spell\"):
    // DOWOLNY czar na stosie — także czar będący stworem (aura z bestow ma
    // na stosie kind 'creature') i czar aury. Czar nigdy nie jest legalnym
    // celem samego siebie: w chwili walidacji rzucający obiekt wciąż jest
    // w ręce (przenosi się na stos dopiero po walidacji).
    if (spec?.type === 'spell_on_stack') {
      // T6: zdolności triggerowane to nie czary — nie są celem „counter
      // target spell" (Stoic Rebuttal).
      if (object && object.zone === 'stack' && object.kind !== 'trigger') return object;
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „target opponent" (Plague Reaver): gracz inny niż aktywujący.
    if (spec?.type === 'opponent') {
      if (targetId && targetId !== casterId && state.players.some((player) => player.id === targetId)) {
        return { id: targetId, kind: 'player', controllerId: targetId };
      }
      throw new Error(`Nielegalny cel: ${targetId}`);
    }
    // Cel „creature with power N or greater" (Selesnya Charm tryb Exile):
    // stwór na bitwisku z mocą efektywną >= spec.min (uwzględnia bufy, hymn,
    // pumosfery). Sprawdzenie MOCY EFEKTYWNEJ (effectivePower), nie bazowej
    // — w MtG moc liczy się z modyfikatorami (CR 613) w chwili rzutu i
    // ponownie w chwili rozstrzygania (CR 608.2b w collectLegalTargets).
    // Wcześniej ten typ celu był obsługiwany tylko w legalTargetCandidates
    // (oferta) — validateTargets rzucał „Nieznany typ celu", co powodowało
    // akceptację celu o mocy < N w castModalSpell (który pomija
    // validateTargets dla trybów). Teraz validateTargets spójnie sprawdza
    // minimalną moc i heksproof.
    if (spec?.type === 'creature_with_power_at_least') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') {
        throw new Error(`Nielegalny cel: ${targetId}`);
      }
      const min = spec.min ?? 5;
      if (hasHexproofAgainst(state, object, casterId)) {
        throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
      }
      if ((effectivePower(object, state) ?? 0) < min) {
        throw new Error(`Nielegalny cel: ${targetId} (moc < ${min})`);
      }
      return object;
    }
    if (spec?.type === 'land') {
      if (!object || object.zone !== 'battlefield') throw new Error(`Nielegalny cel: ${targetId}`);
      const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
      if (!isLand) throw new Error(`Nielegalny cel: ${targetId} (nie jest landem)`);
      if (hasHexproofAgainst(state, object, casterId)) throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
      return object;
    }
    if (spec?.type === 'enchantment') {
      if (!object || object.zone !== 'battlefield') throw new Error(`Nielegalny cel: ${targetId}`);
      const isEnchantment = object.kind === 'enchantment' || (object.types ?? []).includes('Enchantment');
      if (!isEnchantment) throw new Error(`Nielegalny cel: ${targetId} (nie jest enchantment)`);
      if (hasHexproofAgainst(state, object, casterId)) throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
      return object;
    }
    if (spec?.type === 'nonartifact_nonblack_creature') {
      if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') throw new Error(`Nielegalny cel: ${targetId}`);
      const isArtifact = object.kind === 'artifact' || (object.types ?? []).includes('Artifact');
      if (isArtifact) throw new Error(`Nielegalny cel: ${targetId} (artifact)`);
      const isBlack = (object.colors ?? []).includes('B');
      if (isBlack) throw new Error(`Nielegalny cel: ${targetId} (black)`);
      if (hasHexproofAgainst(state, object, casterId)) throw new Error(`Nielegalny cel: ${targetId} (hexproof)`);
      return object;
    }
    throw new Error(`Nieznany typ celu: ${spec?.type}`);
  });
}

/**
 * Efektywny koszt many czaru z warunkową obniżką (Metalcraft, Stoic Rebuttal,
 * CR 702.80): „this spell costs {1} less to cast if you control three or
 * more artifacts\". Warunek oceniany w chwili rzucenia; koszt nigdy nie
 * spadnie poniżej 0. Zwraca liczbę (bez zmian, gdy brak deskryptora).
 */
export function effectiveSpellManaCost(state, object) {
  const base = object?.manaCost ?? 0;
  let totalReduction = 0;
  const reduction = object?.spell?.costReduction;
  // Modyfikatory z permanentów na bitwisku (Etherium Sculptor, CR 601.2f):
  // redukują część generyczną niezależnie od warunku Metalcraft karty.
  totalReduction += costReductionForSpell(state, object);
  if (!reduction && totalReduction === 0) return base;
  const condition = reduction?.condition ?? {};
  if (condition.controlsArtifactsAtLeast != null) {
    const artifacts = [...(state?.objects?.values?.() ?? [])].filter((candidate) => candidate.zone === 'battlefield'
      && candidate.controllerId === object.controllerId
      && (candidate.kind === 'artifact' || (candidate.types ?? []).includes('Artifact'))).length;
    if (artifacts >= condition.controlsArtifactsAtLeast) {
      totalReduction += reduction.amount ?? 0;
    }
  }
  return reduceGenericCost(object?.cardId, base, totalReduction);
}

/** Rzuca czar: płaci koszt, kładzie obiekt na stos z wybranymi celami. */
export function castSpell(state, playerId, objectId, targets, sacrificeTargetId, modeIndex, stunTargetId, buyback = false, payAltCost = false, xValue) {
  const preObject = state.objects.get(objectId);
  // Modal „Choose one" (Aerith Rescue Mission): osobna ścieżka walidacji —
  // cele i efekty pochodzą z wybranego trybu, a nie z nadrzędnego deskryptora.
  if (preObject?.spell?.modes && modeIndex != null) {
    return castModalSpell(state, playerId, objectId, modeIndex, targets, stunTargetId);
  }
  // Fireball (X-cost, „any number of targets", divided damage): osobna ścieżka —
  // X wybiera gracz, cele to dowolna liczba (stwory i/lub gracze), koszt {X}{R}+
  // {1} za każdy cel ponad pierwszy, obrażenia X dzielone po równo w dół.
  if (preObject?.spell?.fireball) {
    return castFireball(state, playerId, objectId, targets, xValue);
  }
  const { object, targetSpec, chosen } = requireSpell(state, playerId, objectId, targets);
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId, object.colors ?? []);
  // Dodatkowy koszt „sacrifice a creature" (Village Rites): walidacja celu-
  // poświęcenia PRZED jakąkolwiek mutacją (CR 601.2h) — nieudany rzut nie może
  // utracić many ani zostawić karty na stosie.
  const sacrificeCost = object.spell.additionalCost?.sacrificeCreature;
  const orPayMana = object.spell.additionalCost?.orPayMana;
  // Lash of the Balrog (LTR): „As an additional cost to cast this spell,
  // sacrifice a creature OR pay {4}." — caster wybiera: poświęcić (wariant
  // z sacrificeTargetId) albo zapłacić dodatkową manę (payAltCost). Walidacja
  // spójna z enumeracją oferty (legalSpellCasts).
  if (sacrificeCost && !payAltCost) {
    const sacObject = state.objects.get(sacrificeTargetId);
    if (!sacObject || sacObject.zone !== 'battlefield' || sacObject.kind !== 'creature' || sacObject.controllerId !== playerId) {
      throw new Error('Nielegalny cel dodatkowego kosztu (sacrifice a creature)');
    }
  }
  if (sacrificeCost && payAltCost) {
    if (orPayMana == null || effectiveSpellManaCost(state, object) + orPayMana > producibleMana(state, playerId)) {
      throw new Error('Za mało many na alternatywny koszt Lash of the Balrog');
    }
  }
  // Kolorowa walidacja many (Sweet Oblivion: 2 Plains nie mogą rzucić U)
  // Plot – rzut bez kosztu many (bez koloru) – pomijamy walidację kolorową, jak w legalSpellCasts.
  if (!object.plotted && !hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  // Warunkowa obniżka kosztu (Metalcraft, Stoic Rebuttal) oraz modyfikatory
  // z permanentów (Etherium Sculptor): płacimy efektywny koszt wyliczony
  // w chwili rzutu (warunki i modyfikatory oceniane na bieżącej planszy).
  const baseMana = object.plotted ? 0 : effectiveSpellManaCost(state, object);
  const altManaExtra = (sacrificeCost && payAltCost) ? (orPayMana ?? 0) : 0;
  const manaSpent = baseMana + altManaExtra;
  spendMana(state, playerId, manaSpent, coloredPipsOf(object.cardId));
  state.spellsCastThisTurn += 1;
  // Poświęcenie stwora jest KOSZTEM rzutu — następuje, zanim czar trafi na stos
  // (nawet przy późniejszym kontrczarze stwór pozostaje poświęcony — CR 601.2h).
  // Lash: przy wariantcie payAlt nie poświęcamy (zapłaciliśmy maną).
  if (sacrificeCost && !payAltCost) {
    const sacObject = state.objects.get(sacrificeTargetId);
    // Finality (CR 122.1b): koszt poświęcenia to też śmierć — obiekt z finality
    // idzie do exile zamiast do grobu (spójnie z sacrifice_permanent).
    const toZone = (sacObject.counters ?? {}).finality > 0 ? 'exile' : 'graveyard';
    const destId = `${toZone}-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, sacrificeTargetId, toZone, destId);
    state.events.push(event('permanent_sacrificed', {
      fromId: sacrificeTargetId, objectId: destId, playerId, cardId: moved.cardId, additionalCost: true, toZone,
    }));
  }
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
    // Buyback (CR 702.26): jeśli gracz wybrał wariant z buyback, czar po
  // rozstrzygnięciu wraca do ręki zamiast do grobu. Flaga na obiekcie stosu.
  const wasBuyback = Boolean(object.spell?.buyback && buyback);
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets: chosen.slice(), wasBuyback });
  state.objects.set(stackId, stacked);
  if (wasBuyback) {
    // Buyback koszt many jest dodatkowy do bazowego — płacimy różnicę
    const bbCost = object.spell.buyback.cost ?? 0;
    if (bbCost > 0) spendMana(state, playerId, bbCost, []);
  }
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: targetObjects.map((entry) => entry.id), plotted: Boolean(object.plotted),
    // Mana wydana na ten rzut (publiczna) — progi triggerów „if four or more
    // mana was spent to cast that spell" (Tellah, Great Sage) czytają ją
    // z kontekstu zdarzenia.
    manaSpent,
    // Kolory rzucanego czaru (publiczne) — trigger „a player casts a white
    // spell" (Angel's Feather) filtruje po nich generycznie.
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

/**
 * Fireball (X-cost, „any number of targets"): X wybiera gracz (komenda niesie
 * xValue), cele to dowolna liczba legalnych stworów i/lub graczy (najpierw
 * stworów, potem graczy — mogą się powtarzać). Koszt = {X} + {R} + {1} za każdy
 * cel ponad pierwszy. Obrażenia X dzielone po równo (zaokr. w dół) między
 * wszystkie cele; reszta z dzielenia przepada (CR 119.4 „divided evenly").
 */
function castFireball(state, playerId, objectId, targets, xValue) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || object.zone !== 'hand' || object.kind !== 'spell' || !object.spell?.fireball) {
    throw new Error('To nie jest rzucalny Fireball z ręki');
  }
  if (object.spell.timing === 'sorcery') {
    const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
    if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) {
      throw new Error('Czar sorcery tylko w swoją fazę main przy pustym stosie');
    }
  }
  const X = Number.isInteger(xValue) && xValue >= 0 ? xValue : 0;
  const chosen = Array.isArray(targets) ? targets : [];
  if (chosen.length === 0) throw new Error('Fireball wymaga co najmniej jednego celu');
  // Walidacja celów: stwory na bitwisku (nie hexproof) i/lub gracze (bez
  // wykluczeń). Fireball celuje „any number of targets" — nie ma górnego
  // limitu poza opłacalnością.
  const seen = new Set();
  for (const tId of chosen) {
    if (seen.has(tId)) throw new Error('Cel Fireball nie może się powtarzać');
    seen.add(tId);
    const target = state.objects.get(tId);
    const isPlayer = state.players.some((p) => p.id === tId);
    if (isPlayer) continue;
    if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') throw new Error(`Nielegalny cel Fireball: ${tId}`);
    if (hasHexproofAgainst(state, target, playerId)) throw new Error(`Nielegalny cel Fireball (hexproof): ${tId}`);
  }
  // Koszt: {X} + {R} + {1} za każdy cel ponad pierwszy.
  const extraTargets = Math.max(0, chosen.length - 1);
  const totalCost = X + (object.manaCost ?? 0) + extraTargets;
  if (!object.plotted && totalCost > producibleMana(state, playerId)) throw new Error('Niewystarczająca mana na Fireball');
  if (!object.plotted && !hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  const manaSpent = object.plotted ? 0 : totalCost;
  spendMana(state, playerId, manaSpent, coloredPipsOf(object.cardId));
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets: chosen.slice(), fireballX: X });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: chosen.slice(), plotted: Boolean(object.plotted), manaSpent,
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

export function castCleave(state, playerId, objectId, targets, sacrificeTargetId) {
  const preObject = state.objects.get(objectId);
  if (!preObject || !preObject.spell || !preObject.spell.cleave) {
    throw new Error('Ten czar nie ma alternatywnego kosztu cleave');
  }
  const { object, targetSpec, chosen } = requireSpell(state, playerId, objectId, targets, true);
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId, object.colors ?? []);
  const sacrificeCost = object.spell.additionalCost?.sacrificeCreature;
  if (sacrificeCost) {
    const sacObject = state.objects.get(sacrificeTargetId);
    if (!sacObject || sacObject.zone !== 'battlefield' || sacObject.kind !== 'creature' || sacObject.controllerId !== playerId) {
      throw new Error('Nielegalny cel dodatkowego kosztu (sacrifice a creature)');
    }
  }
  if (!object.plotted && !hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  const manaSpent = object.plotted ? 0 : (object.spell.cleave.manaCost ?? 0);
  spendMana(state, playerId, manaSpent, coloredPipsOf(object.cardId));
  state.spellsCastThisTurn += 1;
  if (sacrificeCost) {
    const sacObject = state.objects.get(sacrificeTargetId);
    const toZone = (sacObject.counters ?? {}).finality > 0 ? 'exile' : 'graveyard';
    const destId = `${toZone}-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, sacrificeTargetId, toZone, destId);
    state.events.push(event('permanent_sacrificed', {
      fromId: sacrificeTargetId, objectId: destId, playerId, cardId: moved.cardId, additionalCost: true, toZone,
    }));
  }
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets: chosen.slice(), cleaved: true });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: targetObjects.map((entry) => entry.id), plotted: Boolean(object.plotted),
    manaSpent,
    colors: [...(object.colors ?? [])], cleaved: true,
  });
  state.events.push(e);
  return e;
}

/**
 * Lista legalnych kandydatów dla pojedynczej pozycji specyfikacji celów.
 * Generyczna — nie zna nazw kart; decydują wyłącznie typy celów (ADR 0002).
 * Eksportowana, bo efekty engine (Batch 22: Stomping Slabs damage target)
 * korzystają z niej do wyliczenia oferty „any target" po reveal.
 */
export function legalTargetCandidates(state, playerId, spec) {
  const players = state.players.map((entry) => entry.id);
  const battlefieldCreatures = state.zones.battlefield.filter((objectId) => {
    const target = state.objects.get(objectId);
    return target?.kind === 'creature' && target.zone === 'battlefield'
      && !hasHexproofAgainst(state, target, playerId);
  });
  switch (spec.type) {
    case 'creature': return battlefieldCreatures;
    // Cel „creature with subtypes\" (Lunar Rejection — Wolf/Werewolf):
    // stwór na bitwisku mający co najmniej jeden z podtypów deskryptora.
    // validateTargets sprawdza to samo, więc oferta i walidacja są spójne.
    case 'creature_with_subtypes':
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        return (spec.subtypes ?? []).some((sub) => (object.subtypes ?? []).includes(sub));
      });
    case 'artifact': return state.zones.battlefield.filter((objectId) => {
      const object = state.objects.get(objectId);
      return object?.zone === 'battlefield'
        && (object.kind === 'artifact' || (object.types ?? []).includes('Artifact'));
    });
    case 'artifact_or_enchantment': {
      // M69 (Expose to Daylight): artefakt albo enchantment na bitwisku.
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'battlefield'
          && ((object.types ?? []).includes('Artifact') || (object.types ?? []).includes('Enchantment'));
      });
    }
    case 'any_target': return [...players, ...battlefieldCreatures];
    case 'player': {
      // M69 (Dreams of Steel and Oil — „Target opponent"): spec.opponent
      // ogranicza kandydatów do przeciwników rzucającego.
      if (spec?.opponent) return players.filter((id) => id !== playerId);
      return players;
    }
    case 'creature_card_in_graveyard': {
      return state.zones.graveyard.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'graveyard' && object.kind === 'creature' && object.controllerId === playerId;
      });
    }
    case 'card_in_graveyard': {
      return state.zones.graveyard.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'graveyard' && object.controllerId === playerId;
      });
    }
    case 'noncreature_spell_on_stack': {
      // Negate: czary na stosie, które nie są stworami (instants/sorceries,
      // czyste aury). Bestow (kind 'creature') wykluczony — Negate liczy
      // wyłącznie czary nie-stworowe; triggery (kind 'trigger') to nie czary.
      return state.zones.stack.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'stack' && object.kind !== 'creature' && object.kind !== 'trigger';
      });
    }
    case 'spell_on_stack': {
      // Stoic Rebuttal („Counter target spell\"): dowolny czar na stosie,
      // także czar-stwór (bestow) czy czar aury — ale nie zdolność
      // triggerowana (kind 'trigger').
      return state.zones.stack.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'stack' && object.kind !== 'trigger';
      });
    }
    case 'opponent': {
      // „Target opponent\" (Plague Reaver): każdy gracz poza rzucającym.
      return players.filter((id) => id !== playerId);
    }
    case 'land_you_control': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        const isLand = object && (object.kind === 'land' || (object.types ?? []).includes('Land'));
        return isLand && object.zone === 'battlefield' && object.controllerId === playerId;
      });
    }
    case 'creature_you_control': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        return object?.zone === 'battlefield' && object.kind === 'creature' && object.controllerId === playerId;
      });
    }
    // Batch 22: Selesnya Charm tryb 2 — stwór z mocą ≥ N na bitwisku.
    case 'creature_with_power_at_least': {
      const min = spec.min ?? 5;
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        return (effectivePower(object, state) ?? 0) >= min;
      });
    }
    // Batch 22: Thistledown Players — dowolny NIE-land na bitwisku (stwór,
    // artefakt, enchantment, planeswalker; engine: każy nonland permanent
    // to obiekt strefy battlefield inny niż land).
    case 'nonland_permanent': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
        return !isLand;
      });
    }
    // Batch 23: Vandalize — dowilny land na bitwisku.
    case 'land': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        const isLand = object.kind === 'land' || (object.types ?? []).includes('Land');
        return isLand;
      });
    }
    // Batch 23: Feedback — dowolny enchantment na bitwisku.
    case 'enchantment': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        const isEnchantment = object.kind === 'enchantment' || (object.types ?? []).includes('Enchantment');
        return isEnchantment;
      });
    }
    // Batch 23: Expunge — nonartifact, nonblack creature (CR 205.1, 300.1).
    case 'nonartifact_nonblack_creature': {
      return state.zones.battlefield.filter((objectId) => {
        const object = state.objects.get(objectId);
        if (!object || object.zone !== 'battlefield' || object.kind !== 'creature') return false;
        if (hasHexproofAgainst(state, object, playerId)) return false;
        const isArtifact = object.kind === 'artifact' || (object.types ?? []).includes('Artifact');
        if (isArtifact) return false;
        const isBlack = (object.colors ?? []).includes('B');
        if (isBlack) return false;
        return true;
      });
    }
    default: return [];
  }
}

/** Iloczyn kartezjański list kandydatów (warianty celów czaru). */
function cartesian(pools) {
  if (pools.length === 0) return [[]];
  const [first, ...rest] = pools;
  const tails = cartesian(rest);
  const out = [];
  for (const head of first) {
    for (const tail of tails) out.push([head, ...tail]);
  }
  return out;
}

/**
 * Ponowna walidacja celów w momencie rozstrzygania (CR 608.2b w uproszczeniu):
 * cele, które przestały być legalne, są pomijane; czar bez żadnego
 * legalnego celu rozstrzyga się bez efektów („fizzle").
 */
function collectLegalTargets(state, targetSpec, chosen, casterId, sourceColors = null) {
  // Tablica indeksowana JAK targetSpec: na miejscu celu, który przestał być
  // legalny, jest null (efekt odnoszący się do niego nic nie robi — CR 608.2b).
  // Dzięki temu czary wielocelowe (Grave Exchange) mapują efekty na właściwe
  // cele nawet, gdy jeden z nich zniknął przed rozstrzygnięciem.
  return targetSpec.map((spec, index) => {
    try {
      return validateTargets(state, [spec], [chosen[index]], casterId, sourceColors)[0];
    } catch {
      return null;
    }
  });
}

/**
 * Rozstrzyga wierzchni czar stosu (LIFO): efekty, potem obiekt do graveyard.
 * Zwraca pełny przyrost zdarzeń z rozstrzygnięcia (w tym damage_dealt,
 * stats_modified, token_created), żeby trafiły do strumienia wynikowego komendy
 * i logu UI — nie tylko do state.events.
 *
 * Czar AURY (spell.aura — bestow albo czysta aura) rozstrzyga się inaczej:
 * przy legalnym celu aura WCHODZI na bitwisko załączona do stwora (przestaje
 * być stworem). Gdy cel stał się nielegalny: karta z bestow wchodzi jako
 * zwykły stwór (wyjątek CR 702.103b), a czysta aura — jak każdy czar
 * bez legalnego celu — idzie do grobu, nie wchodząc na bitwisko (CR 608.2b).
 */
export function resolveTopOfStack(state) {
  if (state.zones.stack.length === 0) throw new Error('Stos jest pusty');
  const before = state.events.length;
  const stackId = state.zones.stack[state.zones.stack.length - 1];
  const object = state.objects.get(stackId);
  // T6 — zdolność triggerowana na stosie (pseudo-obiekt kind 'trigger'):
  // rozstrzyga się jak czar, po pełnej rundzie passów (intervening-if
  // sprawdzany ponownie — CR 603.4).
  if (object.triggerEntry) return resolveTriggerEntry(state, object);
  // Czar PERMANENTU (stwór/artefakt/enchantment rzucony przez cast_permanent,
  // cast_adventure_creature albo Discover): nie ma deskryptora czaru —
  // rozstrzygnięcie to wejście na bitwisko (CR 608.2a), patrz niżej.
  if (!object.spell) return resolvePermanentSpell(state, stackId, object, before);
  // Fireball (X-cost, divided damage): osobne rozstrzygnięcie — X obrażeń
  // podzielone po równo (zaokr. w dół) między wybrane cele (stworzenia i/lub
  // gracze). CR 119.4 „divided evenly, rounded down" — reszta przepada.
  if (object.spell?.fireball) {
    return resolveFireball(state, stackId, object, before);
  }
  // Cleave (CR 701.33): rzucony z kosztem cleave czar rozstrzyga się z celami
  // i efektami z deskryptora cleave (wykreślony fragment tekstu zmienia legalne
  // cele — np. Lunar Rejection zamiast stwora Wolf/Werewolf celuje dowolnego).
  const targetSpec = (object.cleaved && object.spell.cleave)
    ? (object.spell.cleave.targets ?? [])
    : (object.spell.targets ?? []);
  const chosen = object.chosenTargets ?? [];
  if (object.spell.aura && (object.bestow || object.aura)) {
    return resolveAuraSpell(state, stackId, object, chosen, before);
  }
  // Modal „Choose one" (Aerith Rescue Mission): rozstrzygamy wybrany tryb —
  // efektry trybu aplikujemy do jego celów (wszystkich celowanych albo
  // dodatkowego, np. celu stun). Tryby tu używane nie blokują rozstrzygania.
  if (object.chosenMode != null && object.spell.modes) {
    const mode = object.spell.modes[object.chosenMode];
    const liveChosen = (object.chosenTargets ?? []).filter((tId) => {
      // Cel-gracz (np. „target opponent\" trybu modalnego) nie jest obiektem w
      // strefie — zostawiamy go, żeby efekty „draw_cards_both_players\" dostały
      // prawidłowy cel (bez tego filtr bitwiska upuszczałby id gracza).
      if (state.players.some((p) => p.id === tId)) return true;
      const target = state.objects.get(tId);
      return target && target.zone === 'battlefield';
    });
    for (const effect of mode.effects ?? []) {
      const effTargets = resolveModalEffectTargets(state, effect, object, liveChosen);
      if (effTargets === null) continue;
      applyEffect(state, effect, object, effTargets);
    }
    const graveId = `grave-${state.objectSequence++}`;
    moveObjectDirectly(state, stackId, 'graveyard', graveId);
    state.events.push(event('spell_resolved', { fromId: stackId, toId: graveId, cardId: object.cardId, controllerId: object.controllerId, fizzled: false, modal: true, modeIndex: object.chosenMode }));
    return state.events.slice(before);
  }
  const legalTargets = collectLegalTargets(state, targetSpec, chosen, object.controllerId, object.colors ?? []).map((entry) => entry?.id ?? null);
  const fizzled = targetSpec.length > 0 && legalTargets.every((entry) => entry === null);
  if (!fizzled) {
    const effects = object.cleaved && object.spell.cleave ? (object.spell.cleave.effects ?? object.spell.effects) : object.spell.effects;
    for (let i = 0; i < effects.length; i += 1) {
      // Blokująca decyzja w środku listy efektów (surveil/scry — np. Curate:
      // „Surveil 2, then draw a card") wstrzymuje rozstrzyganie: pozostałe
      // efekty dokończy komenda resolve_* (patrz finishPendingSpell), a czar
      // zostaje na stosie do tego czasu (jawna strefa publiczna).
      const blocked = applyEffect(state, effects[i], object, legalTargets);
      if (blocked) {
        state.pendingSpell = { stackId, effects: effects.slice(i + 1) };
        return state.events.slice(before);
      }
    }
  }
  // Buyback (CR 702.26): jeśli czar miał zapłacony buyback, wraca do ręki
  // właściciela zamiast do grobu (analogicznie do clash — pendingSpellReturnToHand).
  if (object.wasBuyback) {
    state.pendingSpellReturnToHand = true;
  }
  const returnToHand = state.pendingSpellReturnToHand;
  state.pendingSpellReturnToHand = false;
  // Clash (Release the Ants): wygrany czar wraca do ręki WŁAŚCICIELA
  // („If you win, return Release the Ants to its owner's hand").
  if (returnToHand) {
    const handId = `hand-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, stackId, 'hand', handId);
    state.events.push(event('object_moved', { fromId: stackId, object: moved, fromZone: 'stack', toZone: 'hand', returnedByClash: true }));
    const resolved = event('spell_resolved', { fromId: stackId, toId: handId, cardId: object.cardId, controllerId: object.controllerId, fizzled, returnToHand: true });
    state.events.push(resolved);
    return state.events.slice(before);
  }
  // Adventure (CR 715.3): rozstrzygnięty czar przygody idzie do EXILE
  // („on an adventure\"), nie do grobu — stamtąd można rzucić stronę-stwora
  // (cast_adventure_creature). Kontrczar (counter_spell) wysyła kartę do
  // grobu jak każdy czar — to inna ścieżka, bez flagi adventure w zdarzeniu.
  const adventure = Boolean(object.adventure);
  const zoneAfterResolve = adventure ? 'exile' : 'graveyard';
  const afterId = `${zoneAfterResolve}-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, stackId, zoneAfterResolve, afterId);
  const resolved = event('spell_resolved', {
    fromId: stackId, toId: afterId, cardId: object.cardId,
    controllerId: object.controllerId, fizzled, adventure,
    ...(adventure ? { object: moved } : {}),
  });
  state.events.push(resolved);
  return state.events.slice(before);
}

/**
 * Dokańcza czar wstrzymany przez blokującą decyzję (state.pendingSpell):
 * wykonuje pozostałe efekty i opuszcza stos (grób albo — po wygranym clash —
 * ręka właściciela). Wywoływane z execute po resolve_scry/resolve_surveil.
 */
/**
 * Rozstrzyga Fireball: X obrażeń dzielone po równo (zaokr. w dół) między cele
 * (CR 119.4). Cele przestają być legalne (zniknęły z bitwiska) są pomijane
 * (CR 608.2b); każdemu pozostałemu przypada floor(X/n). Brak żywych celów =
 * fizzle (obrażenia nie są zadane).
 */
function resolveFireball(state, stackId, object, before) {
  const X = object.fireballX ?? 0;
  const chosen = object.chosenTargets ?? [];
  // Żywe cele: gracze zawsze; stwory tylko na bitwisku (CR 608.2b).
  const live = chosen.filter((tId) => {
    if (state.players.some((p) => p.id === tId)) return true;
    const target = state.objects.get(tId);
    return Boolean(target && target.zone === 'battlefield' && target.kind === 'creature');
  });
  const fizzled = live.length === 0;
  if (!fizzled && X > 0) {
    const per = Math.floor(X / live.length);
    for (const tId of live) {
      applyEffect(state, { type: 'damage', amount: per }, object, [tId]);
    }
  }
  const graveId = `grave-${state.objectSequence++}`;
  moveObjectDirectly(state, stackId, 'graveyard', graveId);
  state.events.push(event('spell_resolved', {
    fromId: stackId, toId: graveId, cardId: object.cardId,
    controllerId: object.controllerId, fizzled,
  }));
  return state.events.slice(before);
}

export function finishPendingSpell(state, stackId, remainingEffects) {
  const before = state.events.length;
  const object = state.objects.get(stackId);
  if (!object || object.zone !== 'stack') throw new Error('Wstrzymany czar nie jest na stosie');
  // Cleave: wstrzymany czar rozstrzyga się z celami deskryptora cleave (jak
  // resolveTopOfStack), żeby spójność oferty/walidacji/rozstrzygnięcia była
  // zachowana także przy blokującej decyzji w środku listy efektów cleave.
  const targetSpec = (object.cleaved && object.spell.cleave)
    ? (object.spell.cleave.targets ?? [])
    : (object.spell.targets ?? []);
  const legalTargets = collectLegalTargets(state, targetSpec, object.chosenTargets ?? [], object.controllerId, object.colors ?? []).map((entry) => entry?.id ?? null);
  for (const effect of remainingEffects ?? []) {
    const blocked = applyEffect(state, effect, object, legalTargets);
    if (blocked) {
      // Decyzja zagnieżdżona (np. surveil po surveil) — czekamy dalej.
      state.pendingSpell = { stackId, effects: remainingEffects.slice(remainingEffects.indexOf(effect) + 1) };
      return state.events.slice(before);
    }
  }
  const returnToHand = state.pendingSpellReturnToHand;
  state.pendingSpellReturnToHand = false;
  if (returnToHand) {
    const handId = `hand-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, stackId, 'hand', handId);
    state.events.push(event('object_moved', { fromId: stackId, object: moved, fromZone: 'stack', toZone: 'hand', returnedByClash: true }));
    const resolved = event('spell_resolved', { fromId: stackId, toId: handId, cardId: object.cardId, controllerId: object.controllerId, fizzled: false, returnToHand: true });
    state.events.push(resolved);
    return state.events.slice(before);
  }
  const graveId = `grave-${state.objectSequence++}`;
  moveObjectDirectly(state, stackId, 'graveyard', graveId);
  const resolved = event('spell_resolved', { fromId: stackId, toId: graveId, cardId: object.cardId, controllerId: object.controllerId, fizzled: false });
  state.events.push(resolved);
  return state.events.slice(before);
}

/** Rozstrzygnięcie czaru aury (bestow albo czystej) — patrz resolveTopOfStack. */
function resolveAuraSpell(state, stackId, object, chosen, before) {
  const targetId = chosen[0];
  // Aura „Enchant player" (Curse of the Pierced Heart): wchodzi na bitwisko
  // jako zwykły enchantment (nie 'aura') z polem `enchantedPlayerId` — gracz
  // nie opuszcza bitwiska, więc aura nie staje się osierocona (CR 704.5m
  // dotyczy tylko obiektów). Docelowego gracza wybiera się przy rzucaniu.
  if (object.enchantPlayer) {
    const newId = `permanent-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, stackId, 'battlefield', newId);
    const permanent = Object.freeze({ ...moved, kind: 'enchantment', enchantedPlayerId: targetId });
    state.objects.set(newId, permanent);
    state.events.push(event('permanent_entered_battlefield', {
      fromId: stackId, objectId: newId, object: permanent, cardId: moved.cardId,
      controllerId: moved.controllerId, aura: true, enchantPlayer: true, enchantedPlayerId: targetId,
    }));
    return state.events.slice(before);
  }
  const host = state.objects.get(targetId);
  // Legalność gospodarza wg deskryptora aury („enchant creature" /
  // „enchant enchantment" / artifact_or_creature) — wspólne z SBA
  // (attachments.isLegalAuraHost), żeby rozstrzygnięcie nie rozmijało
  // się z tym, co SBA uzna za legalne (Batch 23: Feedback).
  const hostLegal = isLegalAuraHost(object, host);
  if (!hostLegal && !object.bestow) {
    // Czysta aura przy nielegalnym celu NIE wchodzi na bitwisko — trafia
    // wprost do grobu (jak czar „fizzle", CR 608.2b + 704.5m).
    const graveId = `grave-${state.objectSequence++}`;
    moveObjectDirectly(state, stackId, 'graveyard', graveId);
    state.events.push(event('spell_resolved', {
      fromId: stackId, toId: graveId, cardId: object.cardId,
      controllerId: object.controllerId, fizzled: true,
    }));
    return state.events.slice(before);
  }
  const newId = `permanent-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, stackId, 'battlefield', newId);
  if (hostLegal) {
    // Aura wchodzi załączona — od wejścia NIE jest stworem (kind 'aura');
    // attachAuraToCreature dokleja zdarzenie object_attached.
    const attached = attachAuraToCreature(state, newId, targetId);
    state.events.push(event('permanent_entered_battlefield', {
      fromId: stackId, objectId: newId, object: attached, cardId: moved.cardId,
      controllerId: moved.controllerId, attachedTo: targetId, aura: true,
    }));
    // Benevolent Blessing (CMR): „As this Aura enters, choose a color."
    // Queue a color choice decision — protection is applied after choice.
    if (object.aura?.chooseColor) {
      state.pendingColorChoice = {
        playerId: object.controllerId,
        auraId: newId,
      };
      state.events.push(event('color_choice_required', { playerId: object.controllerId, auraId: newId }));
    }
  } else {
    // Cel nielegalny w momencie rozstrzygnięcia: karta bestow wchodzi jako
    // ZWYKŁY STWÓR (godna uwagi reguła bestow — inne aury poszłyby do grobu).
    state.events.push(event('permanent_entered_battlefield', {
      fromId: stackId, objectId: newId, object: state.objects.get(newId), cardId: moved.cardId,
      controllerId: moved.controllerId, unattached: true, aura: true,
    }));
  }
  return state.events.slice(before);
}

/**
 * Rozstrzygnięcie czaru permanentu (stwór/artefakt/enchantment rzucony przez
 * cast_permanent, cast_adventure_creature albo Discover): obiekt wchodzi na
 * bitwisko (CR 608.2a). Cechy WEJŚCIA — liczniki ETB (entersWithCounters),
 * bloodthirst (CR 702.54), face-down morph — aplikujemy TU, nie przy rzucie
 * (wcześniej castPermanent rozstrzygał je od razu, zanim przeciwnik mógł
 * odpowiedzieć instanitem na stosie).
 *
 * LKI rzutu (wasCast, wasKicked, manaFromTreasureSpent, adventureDone,
 * summoningSickness) niosła kopia na stosie; moveObjectDirectly czyści część
 * pól przy zmianie strefy (CR 400.7 — nowy obiekt), więc pola wejścia
 * przywracamy z obiektu stosu.
 */
function resolvePermanentSpell(state, stackId, object, before) {
  const newId = `permanent-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, stackId, 'battlefield', newId);
  const permanent = Object.freeze({
    ...moved,
    faceDown: Boolean(object.faceDown),
    manaFromTreasureSpent: object.manaFromTreasureSpent ?? 0,
  });
  state.objects.set(newId, permanent);
  // M68 (daybound, CR 708.9 — „Permanents enter the battlefield nightbound"):
  // gdy jest NOC, permanent z daybound wchodzi od razu na nightbound stronę —
  // transform PRZED zdarzeniem wejścia, żeby triggery ETB odpalily się na
  // właściwej stronie (jak w MtG; transform in-place — id bez zmian).
  if (state.dayNight === 'night' && (permanent.keywords ?? []).includes('daybound') && permanent.transformTo) {
    const target = permanent.transformTo;
    const nightbound = Object.freeze({
      ...permanent,
      cardId: target.cardId,
      cardName: target.cardName ?? permanent.cardName,
      power: target.power,
      toughness: target.toughness,
      abilities: target.abilities,
      keywords: target.keywords ?? [],
      subtypes: target.subtypes ?? [],
      transformTo: {
        cardId: permanent.cardId,
        cardName: permanent.cardName,
        power: permanent.power,
        toughness: permanent.toughness,
        abilities: permanent.abilities,
        keywords: permanent.keywords ?? [],
        subtypes: permanent.subtypes ?? [],
      },
    });
    state.objects.set(newId, nightbound);
    state.events.push(event('object_transformed', { objectId: newId, fromCardId: permanent.cardId, cardId: target.cardId, enteredNightbound: true }));
  }
  const enteredNow = state.objects.get(newId);
  // Wejście na bitwisko — DOKŁADNIE jedno zdarzenie wejścia (jak
  // resolveAuraSpell): triggery ETB skanują permanent_entered_battlefield;
  // dodatkowy object_moved → battlefield odpalałby je DRUGI raz.
  state.events.push(event('permanent_entered_battlefield', {
    fromId: stackId, objectId: newId, object: enteredNow, cardId: enteredNow.cardId,
    controllerId: enteredNow.controllerId, resolved: true,
  }));
  // Liczniki wejścia (CR 122.1a — Servant of the Scale) i bloodthirst — tylko
  // dla obiektów jawnych (face-down stwór 2/2 nie ma cech karty, CR 702.36).
  if (!permanent.faceDown && permanent.entersWithCounters) {
    for (const [name, amount] of Object.entries(permanent.entersWithCounters)) {
      addCounter(state, newId, name, amount);
    }
  }
  if (!permanent.faceDown && object.bloodthirst && state.dealtDamageToOpponentThisTurn?.[permanent.controllerId]) {
    addCounter(state, newId, '+1/+1', object.bloodthirst);
  }
  const resolved = event('spell_resolved', {
    fromId: stackId, toId: newId, cardId: permanent.cardId,
    controllerId: permanent.controllerId, fizzled: false, permanent: true,
  });
  state.events.push(resolved);
  return state.events.slice(before);
}

/**
 * Plotuje czar z ręki: płaci koszt, przenosi kartę do exile i oznacza ją jako
 * zaplotowaną. Późniejsze cast z exile nie płaci many w minimalnym modelu
 * projektu, ale nadal podlega timingowi czaru.
 */
export function plotCard(state, playerId, objectId) {
  const object = state.objects.get(objectId);
  // Batch 24 (Spinewoods Paladin — pierwsza karta z plotem w katalogu): plot
  // dotyczy także PERMANENTÓW (stwór/artefakt/enchantment), nie tylko czarów —
  // karta idzie z ręki do exile z licznikiem plot, a później rzuca się ją bez
  // kosztu many (cast_permanent z exile, patrz resources.castPermanent).
  if (!object || object.controllerId !== playerId || object.zone !== 'hand' || !object.plot) {
    throw new Error('To nie jest plotowalna karta z ręki');
  }
  if (object.kind !== 'spell' && object.kind !== 'creature' && object.kind !== 'artifact' && object.kind !== 'enchantment') {
    throw new Error('Ta karta nie jest plotowalna');
  }
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  if (state.turn.activePlayerId !== playerId || !mainPhase || state.zones.stack.length > 0) {
    throw new Error('Plot tylko w swoją fazę main przy pustym stosie');
  }
  // Koszt plot może nieść pipy kolorów (Plot {3}{G} = 4 many z {G}) — walidacja
  // kolorowa przed mutacją (CR 601.2h), jak przy rzutach.
  const plotColors = (object.plot.colors ?? []).map((c) => [c]);
  if (plotColors.length > 0 && !canPayColoredCost(state, playerId, plotColors)) {
    throw new Error('Brak kolorowego źródła many na plot');
  }
  spendMana(state, playerId, object.plot.cost ?? 0, plotColors);
  const exileId = `exile-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'exile', exileId);
  const plotted = Object.freeze({ ...moved, plotted: true, plottedAtTurn: state.turn.number });
  state.objects.set(exileId, plotted);
  const plottedEvent = event('card_plotted', {
    playerId, fromId: objectId, toId: exileId, cardId: object.cardId,
    object: plotted, cost: object.plot.cost ?? 0,
  });
  state.events.push(plottedEvent);
  return plottedEvent;
}

/**
 * Warianty rzucenia czarów dostępne graczowi (objectId × legalne cele).
 * Dla czarów bezcelowych cele to pusta tablica. Zaplotowane czary z exile
 * są castowane bez kosztu many.
 */
/**
 * Enumeracja Fireballa: podzbiory celów (stwory na bitwisku + gracze) × wartości
 * X, które gracz może zapłacić (koszt {X}+{R}+{1}/cel ≤ dostępna mana). Ograniczamy
 * podzbiory do rozsądnego limitu (jak COMBAT_OPTION_CAP w combat.js), żeby nie
 * eksplodować przy dużej planszy. Każda komenda niesie xValue i targets.
 */
function legalFireballCasts(state, playerId, objectId, object, manaAvailable) {
  const casts = [];
  const creatures = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .filter((candidate) => candidate?.zone === 'battlefield' && candidate.kind === 'creature'
      && !hasHexproofAgainst(state, candidate, playerId))
    .map((candidate) => candidate.id);
  const players = state.players.map((p) => p.id);
  const allTargets = [...creatures, ...players];
  if (allTargets.length === 0) return casts;
  // Podzbiory rozmiaru 1..min(allTargets.length, 4) — limit kombinacji.
  const maxTargets = Math.min(allTargets.length, 4);
  const subsets = (arr, k) => {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [head, ...rest] = arr;
    const withHead = subsets(rest, k - 1).map((x) => [head, ...x]);
    return [...withHead, ...subsets(rest, k)];
  };
  const base = object.manaCost ?? 0; // {R}
  for (let n = 1; n <= maxTargets; n += 1) {
    const extra = Math.max(0, n - 1);
    for (const combo of subsets(allTargets, n)) {
      // Największe X mieszczące się w manie dla tej liczby celów.
      const maxX = manaAvailable - base - extra;
      for (let X = 1; X <= maxX; X += 1) {
        casts.push({ objectId, targets: combo, xValue: X });
      }
    }
  }
  return casts;
}

export function legalSpellCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const casts = [];
  if (!player) return casts;
  // Oferta po manie produkowalnej (pula + nietapnięte landy): czar jest dostępną
  // akcją od razu, a płatność sama do-tapuje landy (spendMana).
  const manaAvailable = producibleMana(state, playerId);
  const ids = [
    ...state.zones.hand,
    ...state.zones.exile.filter((id) => state.objects.get(id)?.controllerId === playerId && state.objects.get(id)?.plotted),
  ];
  for (const id of ids) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId || object.kind !== 'spell' || !object.spell) continue;
    // Metalcraft (Stoic Rebuttal): warunkowa obniżka kosztu oceniana w chwili
    // enumeracji — przy spełnionym warunku czar pojawia się przy mniejszej puli.
    if (!object.plotted && effectiveSpellManaCost(state, object) > manaAvailable) continue;
    if (!object.plotted && !hasColorForObject(state, playerId, object)) continue;
    if (object.spell.timing === 'sorcery') {
      const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
      if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) continue;
    }
    // Modal „Choose one" (Aerith Rescue Mission): każdy tryb enumerujemy osobno.
    if (object.spell.modes) {
      for (let modeIndex = 0; modeIndex < object.spell.modes.length; modeIndex += 1) {
        for (const cast of legalModeCasts(state, playerId, id, modeIndex, object.spell.modes[modeIndex])) {
          casts.push(cast);
        }
      }
      continue;
    }
    // Fireball (X-cost, any-number-of-targets): oferujemy X od 1 do dostępnej
    // many (po pokryciu {R} + {1}/cel), dla każdego podzbioru celów (stwory +
    // gracze). Pełna enumeracja podzbiorów ograniczona do rozsądnego limitu.
    if (object.spell?.fireball) {
      casts.push(...legalFireballCasts(state, playerId, id, object, manaAvailable));
      continue;
    }
    const targetSpec = object.spell.targets ?? [];
    // Dodatkowy koszt „As an additional cost to cast this spell, sacrifice a
    // creature" (Village Rites): enumerujemy po stworach kontrolera; brak stwora
    // = czar niedostępny. Cel-poświęcenie niesie komenda (sacrificeTargetId).
    const sacrificeCost = object.spell.additionalCost?.sacrificeCreature;
    const orPayMana = object.spell.additionalCost?.orPayMana;
    // Lash of the Balrog (LTR): „sacrifice a creature OR pay {4}" — do
    // wariantów poświęcenia (per stwór) dokładamy wariant zapłaty maną
    // (payAltCost), gdy gracz ma na nią dość (koszt bazowy + {4}). Brak stwora
    // NIE czyni czaru niedostępnym — gracz może zapłacić maną.
    const sacrificePool = sacrificeCost
      ? state.zones.battlefield.filter((oid) => {
        const candidate = state.objects.get(oid);
        return candidate?.zone === 'battlefield' && candidate.kind === 'creature' && candidate.controllerId === playerId;
      })
      : [null];
    const payAltAvailable = Boolean(sacrificeCost && orPayMana != null
      && effectiveSpellManaCost(state, object) + orPayMana <= manaAvailable);
    if (sacrificeCost && sacrificePool.length === 0 && !payAltAvailable) continue;
    if (targetSpec.length === 0) {
      for (const sacId of sacrificePool) {
        const cast = { objectId: id, targets: [] };
        if (sacId !== null) cast.sacrificeTargetId = sacId;
        casts.push(cast);
      }
      if (payAltAvailable) casts.push({ objectId: id, targets: [], payAltCost: true });
      // Buyback (CR 702.26): wariant z dodatkowym kosztem — czar wraca do ręki
      // po rozstrzygnięciu zamiast do grobu. Enumerujemy osobną komendę.
      // Buyback (CR 702.26): wariant z dodatkowym kosztem — czar wraca do ręki
      // po rozstrzygnięciu zamiast do grobu. Enumerujemy osobną komendę
      // tylko gdy gracz ma dość many na bazę + buyback.
      if (object.spell.buyback && !object.plotted) {
        const baseCost = effectiveSpellManaCost(state, object);
        const bbCost = object.spell.buyback.cost ?? 0;
        if (baseCost + bbCost <= manaAvailable) {
          const cast2 = { objectId: id, targets: [], buyback: true };
          casts.push(cast2);
        }
      }
      continue;
    }
    // Kandydaci dla każdej pozycji specyfikacji celów (iloczyn kartezjański —
    // czary wielocelowe jak Grave Exchange). Każdy typ jest generyczny.
    const candidatePools = targetSpec.map((spec) => legalTargetCandidates(state, playerId, spec));
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools)) {
      for (const sacId of sacrificePool) {
        const cast = { objectId: id, targets: combo };
        if (sacId !== null) cast.sacrificeTargetId = sacId;
        casts.push(cast);
      }
      if (payAltAvailable) casts.push({ objectId: id, targets: combo, payAltCost: true });
    }
  }
  return casts;
}

export function legalCleaveCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const casts = [];
  if (!player) return casts;
  const manaAvailable = producibleMana(state, playerId);
  const ids = [
    ...state.zones.hand,
    ...state.zones.exile.filter((id) => state.objects.get(id)?.controllerId === playerId && state.objects.get(id)?.plotted),
  ];
  for (const id of ids) {
    const object = state.objects.get(id);
    if (object?.controllerId !== playerId || object.kind !== 'spell' || !object.spell || !object.spell.cleave) continue;
    const cleaveCost = object.spell.cleave.manaCost ?? 0;
    if (!object.plotted && cleaveCost > manaAvailable) continue;
    if (!object.plotted && !hasColorForObject(state, playerId, object)) continue;
    if (object.spell.timing === 'sorcery') {
      const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
      if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) continue;
    }
    const targetSpec = object.spell.cleave.targets ?? [];
    if (targetSpec.length === 0) {
      casts.push({ objectId: id, targets: [] });
      continue;
    }
    const candidatePools = targetSpec.map((spec) => legalTargetCandidates(state, playerId, spec));
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools)) {
      casts.push({ objectId: id, targets: combo });
    }
  }
  return casts;
}

/**
 * Modal „Choose one" (Aerith Rescue Mission): enumeracja wariantów pojedynczego
 * trybu. Tryb ze zwykłymi (stałej liczby) celami enumerujemy jak zwykły czar;
 * tryb z `variableTargets` („up to N target creatures") enumeruje podzbiory
 * celów o rozmiarze min..max, a `stunAmongTargets` dokłada wybór jednego z nich
 * jako celu dodatkowego (np. stun counter).
 */
function legalModeCasts(state, playerId, objectId, modeIndex, mode) {
  const casts = [];
  if (mode.variableTargets) {
    const creatures = state.zones.battlefield.filter((id) => {
      const candidate = state.objects.get(id);
      return candidate?.zone === 'battlefield' && candidate.kind === 'creature';
    });
    const min = mode.variableTargets.min ?? 1;
    const max = Math.min(mode.variableTargets.max ?? creatures.length, creatures.length);
    const subsets = (arr, k) => {
      if (k === 0) return [[]];
      if (arr.length < k) return [];
      const [head, ...rest] = arr;
      const withHead = subsets(rest, k - 1).map((s) => [head, ...s]);
      return [...withHead, ...subsets(rest, k)];
    };
    for (let k = min; k <= max; k += 1) {
      for (const combo of subsets(creatures, k)) {
        if (mode.stunAmongTargets) {
          for (const stunId of combo) casts.push({ objectId, targets: combo, modeIndex, stunTargetId: stunId });
        } else {
          casts.push({ objectId, targets: combo, modeIndex });
        }
      }
    }
    return casts;
  }
  const spec = mode.targets ?? [];
  if (spec.length === 0) {
    casts.push({ objectId, targets: [], modeIndex });
    return casts;
  }
  const pools = spec.map((s) => legalTargetCandidates(state, playerId, s));
  if (pools.some((p) => p.length === 0)) return casts;
  for (const combo of cartesian(pools)) casts.push({ objectId, targets: combo, modeIndex });
  return casts;
}

/**
 * Mapuje efektry trybu modalnego na cele rozstrzygania. `applyTo: 'allChosen'`
 * = wszystkie celeowane (np. tap), `applyTo: 'extra:<field>'` = dodatkowy cel
 * z modeExtra (np. stunTargetId); null = pomiń efekt (cel zniknął).
 */
function resolveModalEffectTargets(state, effect, object, liveChosen) {
  if (effect.applyTo === 'allChosen') return liveChosen;
  if (typeof effect.applyTo === 'string' && effect.applyTo.startsWith('extra:')) {
    const key = effect.applyTo.slice('extra:'.length);
    const val = object.modeExtra?.[key];
    if (!val) return null;
    const target = state.objects.get(val);
    if (!target || target.zone !== 'battlefield') return null;
    return [val];
  }
  // Domyślnie efekty trybu stosują się do wybranych celów (mogą być puste —
  // np. create_token nie potrzebuje celu; używa kontrolera źródła).
  return liveChosen;
}

/**
 * Rzuca czar modalny (Aerith Rescue Mission): waliduje cele wybranego trybu
 * (stałe albo zmienne) i kładzie czar na stos z wybranym trybem + celami.
 */
function castModalSpell(state, playerId, objectId, modeIndex, targets, stunTargetId) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || !['hand', 'exile'].includes(object.zone) || object.kind !== 'spell' || (object.zone === 'exile' && !object.plotted)) {
    throw new Error('To nie jest rzucalny czar z ręki albo zaplotowany z exile');
  }
  if (!object.spell?.modes) throw new Error('Ten czar nie jest modalny');
  const mode = object.spell.modes[modeIndex];
  if (!mode) throw new Error('Nieznany tryb czaru modalnego');
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('Nieznany gracz');
  // Opłacalność po manie produkowalnej — spendMana sam do-tapuje landy.
  if (!object.plotted && (object.manaCost ?? 0) > producibleMana(state, playerId)) throw new Error('Niewystarczająca mana');
  if (!object.plotted && !hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  if (object.spell.timing === 'sorcery') {
    const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
    if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) {
      throw new Error('Czar sorcery tylko w swoją fazę main przy pustym stosie');
    }
  }
  const chosen = Array.isArray(targets) ? targets : [];
  let chosenTargets = [];
  if (mode.variableTargets) {
    for (const tId of chosen) {
      const target = state.objects.get(tId);
      if (!target || target.zone !== 'battlefield' || target.kind !== 'creature') throw new Error(`Nielegalny cel: ${tId}`);
    }
    const min = mode.variableTargets.min ?? 1;
    const max = mode.variableTargets.max ?? chosen.length;
    if (chosen.length < min || chosen.length > max) throw new Error('Nieprawidłowa liczba celów trybu');
    if (mode.stunAmongTargets && !chosen.includes(stunTargetId)) {
      throw new Error('Cel stun musi być jednym z celowanych stworów');
    }
    chosenTargets = chosen.slice();
  } else {
    const spec = mode.targets ?? [];
    if (chosen.length !== spec.length) throw new Error('Nieprawidłowa liczba celów trybu');
    validateTargets(state, spec, chosen, playerId, object.colors ?? []);
    chosenTargets = chosen.slice();
  }
  const manaSpent = object.plotted ? 0 : (object.manaCost ?? 0);
  spendMana(state, playerId, manaSpent, coloredPipsOf(object.cardId));
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const modeExtra = mode.stunAmongTargets ? { stunTargetId } : {};
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets, chosenMode: modeIndex, modeExtra });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: chosenTargets, modeIndex, manaSpent,
    stunTargetId: mode.stunAmongTargets ? stunTargetId : undefined,
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

/**
 * Escape (CR 702.138, Sweet Oblivion): czar z deskryptorem spell.escape w grobie
 * można rzucić za koszt escape + wygnanie exileCount innych kart z grobu. Gracz
 * wybiera które exileCount kart wygnać (warianty podzbiorów, cap 32 jak crew).
 * Cel czaru wybiera gracz jak przy zwykłym rzucie.
 */
export function legalEscapeCasts(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  const casts = [];
  if (!player) return casts;
  const manaAvailable = producibleMana(state, playerId);
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  const sorceryWindow = state.turn.activePlayerId === playerId && mainPhase && state.zones.stack.length === 0;
  const ownGraveyard = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === playerId);
  // Helper: wszystkie podzbiory rozmiaru k z arr (cap 32, jak crew)
  const subsets = (arr, k, cap = 32) => {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const out = [];
    const n = arr.length;
    const rec = (start, chosen) => {
      if (out.length >= cap) return;
      if (chosen.length === k) { out.push([...chosen]); return; }
      for (let i = start; i < n; i += 1) {
        chosen.push(arr[i]);
        rec(i + 1, chosen);
        chosen.pop();
        if (out.length >= cap) return;
      }
    };
    rec(0, []);
    return out;
  };
  for (const id of ownGraveyard) {
    const object = state.objects.get(id);
    if (!object || object.kind !== 'spell' || !object.spell?.escape) continue;
    if (!sorceryWindow) continue;
    const escape = object.spell.escape;
    if ((escape.cost ?? 0) > manaAvailable) continue;
    if (!hasColorForObject(state, playerId, object)) continue;
    const others = ownGraveyard.filter((otherId) => otherId !== id);
    if (others.length < escape.exileCount) continue;
    const exileSubsets = subsets(others, escape.exileCount);
    const targetSpec = object.spell.targets ?? [];
    if (targetSpec.length === 0) {
      for (const escapeExileIds of exileSubsets) casts.push({ objectId: id, targets: [], escapeExileIds });
      continue;
    }
    const candidatePools = targetSpec.map((spec) => legalTargetCandidates(state, playerId, spec));
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools)) {
      for (const escapeExileIds of exileSubsets) casts.push({ objectId: id, targets: combo, escapeExileIds });
    }
  }
  return casts;
}

/**
 * Rzuca czar z grobu przez Escape (Sweet Oblivion): płaci koszt escape, wygania
 * exileCount innych kart z grobu (koszt) i kładzie czar na stos z celami.
 */
export function castEscape(state, playerId, objectId, targets, escapeExileIds) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || object.zone !== 'graveyard' || object.kind !== 'spell' || !object.spell?.escape) {
    throw new Error('To nie jest czar z Escape w twoim grobie');
  }
  const escape = object.spell.escape;
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  if (state.turn.activePlayerId !== playerId || !mainPhase || state.zones.stack.length > 0) {
    throw new Error('Escape rzuca się w swoją fazę main przy pustym stosie');
  }
  const targetSpec = object.spell.targets ?? [];
  const chosen = targets ?? [];
  if (!Array.isArray(chosen) || chosen.length !== targetSpec.length) throw new Error('Nieprawidłowa liczba celów');
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId, object.colors ?? []);
  // Walidacja kosztu wygnania PRZED mutacją (CR 601.2h).
  const ownGraveyard = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === playerId);
  const validExile = Array.isArray(escapeExileIds)
    && escapeExileIds.length === escape.exileCount
    && new Set(escapeExileIds).size === escapeExileIds.length
    && escapeExileIds.every((exId) => exId !== objectId && ownGraveyard.includes(exId));
  if (!validExile) throw new Error('Nieprawidłowy koszt Escape (exile)');
  // Opłacalność po manie produkowalnej — spendMana sam do-tapuje landy.
  if ((escape.cost ?? 0) > producibleMana(state, playerId)) throw new Error('Niewystarczająca mana na Escape');
  if (!hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  const manaSpent = escape.cost ?? 0;
  spendMana(state, playerId, manaSpent, coloredPipsOf(object.cardId));
  state.spellsCastThisTurn += 1;
  for (const exId of escapeExileIds) {
    const exileId = `exile-${state.objectSequence++}`;
    const moved = moveObjectDirectly(state, exId, 'exile', exileId);
    state.events.push(event('object_moved', { fromId: exId, object: moved, fromZone: 'graveyard', toZone: 'exile', escape: true }));
  }
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({ ...moved, tapped: false, chosenTargets: chosen.slice(), escaped: true });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: targetObjects.map((entry) => entry.id), escaped: true, manaSpent,
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

/**
 * Adventure (CR 715, Gray Slaad // Entropic Decay): legalne rzuty strony
 * przygodowej z RĘKI — sorcery-speed, koszt z deskryptora adventure
 * (liczba całkowita + pipy kolorów). Oferta po manie produkowalnej, jak
 * inne rzuty; cele bierzemy z deskryptora czaru przygody.
 */
export function legalAdventureCasts(state, playerId) {
  const casts = [];
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return casts;
  const manaAvailable = producibleMana(state, playerId);
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  const sorceryWindow = state.turn.activePlayerId === playerId && mainPhase && state.zones.stack.length === 0;
  if (!sorceryWindow) return casts;
  for (const id of state.zones.hand) {
    const object = state.objects.get(id);
    if (!object || object.controllerId !== playerId || !object.adventure) continue;
    const adventure = object.adventure;
    if ((adventure.cost ?? 0) > manaAvailable) continue;
    const requirements = (adventure.colors ?? []).map((color) => [color]);
    if (requirements.length > 0 && !canPayColoredCost(state, playerId, requirements)) continue;
    const targetSpec = adventure.spell?.targets ?? [];
    if (targetSpec.length === 0) {
      casts.push({ objectId: id, targets: [] });
      continue;
    }
    const candidatePools = targetSpec.map((spec) => legalTargetCandidates(state, playerId, spec));
    if (candidatePools.some((pool) => pool.length === 0)) continue;
    for (const combo of cartesian(candidatePools)) casts.push({ objectId: id, targets: combo });
  }
  return casts;
}

/**
 * Rzuca stronę przygodową karty z ręki (CR 715): płaci koszt przygody,
 * kładzie czar na stos (deskryptor czaru z adventure.spell); po
 * rozstrzygnięciu karta idzie do EXILE („on an adventure\"), nie do grobu.
 */
export function castAdventure(state, playerId, objectId, targets) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || object.zone !== 'hand' || !object.adventure) {
    throw new Error('To nie jest karta z przygodą w twojej ręce');
  }
  const adventure = object.adventure;
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) {
    throw new Error('Przygoda to czar sorcery — tylko w swoją fazę main przy pustym stosie');
  }
  const targetSpec = adventure.spell?.targets ?? [];
  const chosen = targets ?? [];
  if (!Array.isArray(chosen) || chosen.length !== targetSpec.length) throw new Error('Nieprawidłowa liczba celów przygody');
  const targetObjects = validateTargets(state, targetSpec, chosen, playerId, object.colors ?? []);
  const cost = adventure.cost ?? 0;
  if (cost > producibleMana(state, playerId)) throw new Error('Niewystarczająca mana');
  const requirements = (adventure.colors ?? []).map((color) => [color]);
  if (requirements.length > 0 && !canPayColoredCost(state, playerId, requirements)) {
    throw new Error('Brak kolorowego źródła many');
  }
  spendMana(state, playerId, cost, requirements);
  state.spellsCastThisTurn += 1;
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({
    ...moved,
    // Obiekt na stosie jest CZAREM (sorcery) z deskryptorem przygody;
    // flaga adventure przenosi go po rozstrzygnięciu do exile.
    kind: 'spell', spell: adventure.spell, tapped: false,
    chosenTargets: chosen.slice(), adventure: true,
  });
  state.objects.set(stackId, stacked);
  const e = event('spell_cast', {
    playerId, fromId: objectId, object: stacked, cardId: object.cardId,
    targets: targetObjects.map((entry) => entry.id), adventure: true,
    manaSpent: cost,
    colors: [...(adventure.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

/**
 * Legalne rzuty strony-stwora karty z przygodą z EXILE („on an adventure\",
 * CR 715.3): zwykły rzut permanenta — koszt many karty, kolorowe pipy z
 * MANA_COSTS, timing jak przy cast_permanent (main phase bez flash).
 */
export function legalAdventureCreatureCasts(state, playerId) {
  const casts = [];
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return casts;
  const manaAvailable = producibleMana(state, playerId);
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  if (!(state.turn.activePlayerId === playerId && mainPhase && state.zones.stack.length === 0)) return casts;
  for (const id of state.zones.exile) {
    const object = state.objects.get(id);
    if (!object || object.controllerId !== playerId || !object.adventure || object.plotted) continue;
    if ((object.manaCost ?? 0) > manaAvailable) continue;
    if (!hasColorForObject(state, playerId, object)) continue;
    casts.push({ objectId: id });
  }
  return casts;
}

/**
 * Rzuca stronę-stwora karty z przygodą z exile (CR 715.3): jak castPermanent,
 * ale źródłem jest exile „on an adventure\" — po wejściu na bitwisko karta
 * jest zwykłym permanentem (flaga adventureDone odróżnia ją od świeżej).
 */
export function castAdventureCreature(state, playerId, objectId) {
  const object = state.objects.get(objectId);
  if (!object || object.controllerId !== playerId || object.zone !== 'exile' || !object.adventure) {
    throw new Error('To nie jest karta z przygodą w twoim exile');
  }
  if (object.plotted) throw new Error('Karta zaplotowana rzuca się komendą cast_spell');
  const mainPhase = ['precombat_main', 'postcombat_main'].includes(state.turn.phase);
  if (!mainPhase || state.turn.activePlayerId !== playerId || state.zones.stack.length > 0) {
    throw new Error('Stwór z przygody — tylko w swoją fazę main przy pustym stosie');
  }
  const cost = reduceGenericCost(object.cardId, object.manaCost ?? 0, costReductionForSpell(state, object));
  if (cost > producibleMana(state, playerId)) throw new Error('Niewystarczająca mana');
  if (!hasColorForObject(state, playerId, object)) throw new Error('Brak kolorowego źródła many');
  spendMana(state, playerId, cost, coloredPipsOf(object.cardId));
  state.spellsCastThisTurn += 1;
  // Rzut strony-stwora to rzut CZARU — obiekt idzie na STOS (jak cast_permanent);
  // na bitwisko wchodzi po rozstrzygnięciu (resolvePermanentSpell). Obiekt
  // z exile „on an adventure" zachowuje deskryptor spell strony przygody —
  // WYKRESLAMY go, żeby rozstrzygnięcie potraktowało rzut jak permanent
  // (root cause: bez tego czar przygody rozstrzygał się DRUGI raz).
  const stackId = `spell-${state.objectSequence++}`;
  const moved = moveObjectDirectly(state, objectId, 'stack', stackId);
  const stacked = Object.freeze({
    ...moved,
    spell: null,
    summoningSickness: true, tapped: false, wasCast: true, adventureDone: true,
    chosenTargets: [],
  });
  state.objects.set(stackId, stacked);
  const e = event('permanent_cast', {
    playerId, fromId: objectId, object: stacked, manaCost: cost, adventure: true,
    manaSpent: cost,
    colors: [...(object.colors ?? [])],
  });
  state.events.push(e);
  return e;
}

export { effectivePower, effectiveToughness };
