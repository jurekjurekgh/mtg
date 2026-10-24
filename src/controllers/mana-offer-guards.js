import { expandManaPool } from '../engine/resources.js';
import { coloredPipsOf, matchColorRequirements } from '../engine/mana-cost.js';
import { isActivatedManaAbility, manaAbilityHasManualCost } from '../engine/mana-sources.js';

/**
 * N (korekta właściciela): oferta rzutu w silniku obejmuje czary osiągalne
 * jedynie po ręcznej aktywacji zdolności many (poświęcenie Eldrazi Scion;
 * CR 605.3a) — kliknięcie człowieka otwiera KREATOR MANY, który te źródła
 * aktywuje przed płatnością. Kontrolery botów wywołują jednak komendy
 * WPROST z legalCommands — wykonanie castu bez wyprodukowanej many jest
 * przez silnik odrzucane (żadnego auto-poświęcenia, jak przy płatnościach
 * K). Ten moduł jest wspólną miarą „automatu płatności" dla wszystkich
 * kontrolerów (heuristic/random/aggro): cast, którego kwoty lub pipów
 * automat (pula + lądy + czyste źródła many, które silnik do-tapuje sam)
 * nie pokrywa, wraca do gry dopiero po aktywacji źródła many.
 *
 * Miary liczy się wyłącznie z danych WIDOKU (publiczna informacja,
 * ADR 0017); przy spreparowanych widokach bez ofert aktywacji many filtr
 * śpi (sygnał z K — oferta legalna bez aktywacji jest automatyczna).
 */

const CAST_TYPES = new Set([
  'cast_permanent', 'cast_spell', 'cast_cleave', 'cast_escape', 'cast_flashback',
  'cast_adventure', 'cast_adventure_creature',
]);

export function hasManaActivationOffer(view) {
  return (view?.legalCommands ?? []).some((cmd) => cmd.type === 'activate_ability');
}

const isLandObject = (object) => object?.kind === 'land'
  || (object?.types ?? []).includes('Land');

/**
 * Jednostki automatu: pula kolorowa + nietapnięte lądy (z `manaSource`
 * widoku) + netto LEGALNIE oferowanych aktywacji czystej many bez kosztu
 * ręcznego (Lantern/Druid/konwertery). Skarb (token aktywowalny kosztem
 * poświęcenia, opłacany automatem — M179/E) wchodzi jako dowolny kolor.
 * Aktywacje o koszcie ręcznym (Scion, tapCreature, życie, liczniki…) nie
 * wchodzą — to jest właśnie część many osiągalnej.
 */
export function autoManaUnits(view) {
  const me = view?.players?.find((player) => player.id === view.playerId) ?? {};
  const units = [...expandManaPool(me.manaPool ?? {})];
  if ((me.mana ?? 0) > units.length) {
    for (let i = units.length; i < (me.mana ?? 0); i += 1) units.push([]);
  }
  for (const object of view?.zones?.battlefield ?? []) {
    if (!object || object.controllerId !== view.playerId || object.tapped || object.detained) continue;
    if (!isLandObject(object)) continue;
    const amount = object.manaSource?.amount ?? 1;
    const colors = object.manaSource?.colors ?? [];
    for (let i = 0; i < amount; i += 1) units.push([...colors]);
  }
  const board = new Map((view?.zones?.battlefield ?? []).map((object) => [object.id, object]));
  const seen = new Set();
  for (const cmd of view?.legalCommands ?? []) {
    if (cmd.type !== 'activate_ability' || (cmd.targets ?? []).length > 0) continue;
    const key = `${cmd.objectId}:${cmd.abilityIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const object = board.get(cmd.objectId);
    if (!object || isLandObject(object)) continue;
    const ability = object.activatableAbilities?.[cmd.abilityIndex] ?? object.abilities?.[cmd.abilityIndex];
    if (!ability || !isActivatedManaAbility(ability)) continue;
    const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
    const fromTreasure = effects.some((effect) => effect?.type === 'add_mana' && effect.fromTreasure);
    if (!fromTreasure && manaAbilityHasManualCost(ability)) continue;
    // Koszt many aktywacji płaci BAZA (pula/lądy), nie produkcja: konwerter
    // {1}: Add {U},{R}, or {W} daje nową jednostkę kosztem jednej bazowej —
    // kwota bez zmian, kolor dodatkowy. Odbieram z jednostek bazowych
    // (najpierw bezbarwne, potem najstarsze), produkcja dopisywana w pełni.
    let pendingCost = ability.cost?.mana ?? 0;
    let baselineEnd = units.length;
    for (const effect of effects) {
      if (effect?.type !== 'add_mana') continue;
      const colors = Array.isArray(effect.colors) ? effect.colors : [];
      for (let i = 0; i < (effect.amount ?? 1); i += 1) units.push([...colors]);
    }
    for (let i = 0; i < baselineEnd && pendingCost > 0;) {
      if (units[i].length === 0) { units.splice(i, 1); baselineEnd -= 1; pendingCost -= 1; } else i += 1;
    }
    while (pendingCost > 0 && baselineEnd > 0) {
      units.splice(0, 1); baselineEnd -= 1; pendingCost -= 1;
    }
  }
  return units;
}

/**
 * Kwota i pipy komendy castu z obiektu widoku (`manaCost` = MV; warianty
 * X/fireball niosą własny `cost`). Tylko do filtra — dokładność oferty
 * silnika jest rozstrzygana tam. Zwraca null, gdy costo nie da się ustalić
 * (wtedy filtr castu nie dotyka). Darmowy rzut (plot/suspendReady) zwraca
 * zerowy koszt.
 */
export function castCostOf(view, cmd) {
  const object = [
    view?.zones?.hand, view?.zones?.exile, view?.zones?.graveyard, view?.zones?.stack,
  ].flatMap((zone) => zone ?? []).find((entry) => entry.id === cmd.objectId) ?? null;
  if (!object) return Number.isFinite(cmd.cost)
    ? { amount: cmd.cost, requirements: [] }
    : null;
  if (object.plotted || object.suspendReady) return { amount: 0, requirements: [] };
  let amount = typeof object.manaCost === 'number' ? object.manaCost : null;
  if (Number.isFinite(cmd.cost)) amount = cmd.cost;
  if (amount == null) return null;
  let requirements = coloredPipsOf(object.cardId, cmd.phyrexianPayWithLife ?? 0);
  if (cmd.faceDown) { amount = object.morph?.cost ?? 0; requirements = []; }
  if (cmd.surgeCast) {
    amount = object.surge?.cost ?? amount;
    requirements = (object.surge?.colors ?? []).map((color) => [color]);
  }
  if (cmd.kicked) {
    amount += object.kicker?.cost ?? 0;
    requirements = [...requirements, ...(object.kicker?.colors ?? []).map((color) => [color])];
  }
  if (cmd.offspring) {
    amount += object.offspring?.cost ?? 0;
    requirements = [...requirements, ...(object.offspring?.colors ?? []).map((color) => [color])];
  }
  if (cmd.buyback) amount += object.spell?.buyback?.cost ?? 0;
  if ((cmd.phyrexianPayWithLife ?? 0) > 0) amount -= cmd.phyrexianPayWithLife;
  if (Array.isArray(cmd.convokePayments)) amount -= cmd.convokePayments.length;
  return { amount, requirements };
}

/**
 * True, gdy komenda castu opiera się na manie spoza automatu (kwota lub
 * pipy). Kontroler powinien taki cast pominąć — najpierw aktywacja źródła
 * many, potem cast wraca do oferty (dwufazowość z K).
 */
export function castBeyondAutoMana(view, cmd, units = autoManaUnits(view)) {
  if (!CAST_TYPES.has(cmd.type)) return false;
  const cost = castCostOf(view, cmd);
  if (cost == null) return false;
  if (cost.amount > units.length) return true;
  if (cost.requirements.length > 0 && !matchColorRequirements(units, cost.requirements)) return true;
  return false;
}
