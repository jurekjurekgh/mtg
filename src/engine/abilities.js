/**
 * Framework activated / triggered / static abilities — syntetyczny szkielet.
 * Każda zdolność ma typ, koszt (opcjonalny), efekt i warunek wyzwalania.
 */
export const ABILITY_TYPE = Object.freeze({ activated: 'activated', triggered: 'triggered', static: 'static' });

export function createAbility({ type, cost = null, effect, trigger }) {
  if (!Object.values(ABILITY_TYPE).includes(type)) throw new TypeError('Nieprawidłowy typ zdolności');
  return Object.freeze({ type, cost: cost ? Object.freeze({ ...cost }) : null, effect: Object.freeze(effect ?? {}), trigger: trigger ? Object.freeze(trigger) : null });
}

export function isActivated(ability) { return ability?.type === ABILITY_TYPE.activated; }
export function isTriggered(ability) { return ability?.type === ABILITY_TYPE.triggered; }
export function isStatic(ability) { return ability?.type === ABILITY_TYPE.static; }
