/**
 * Wagi rodzin decyzji bota heurystycznego (B4).
 *
 * Są to mnożniki używane przez offline'owy tuner hill-climbing. Wartość 1
 * zachowuje dotychczasową heurystykę B1/B3 dokładnie; wartości większe od 1
 * zwiększają znaczenie danej rodziny komend, a wartości z przedziału (0, 1)
 * je zmniejszają. To parametry strategii, nie reguły gry.
 */

export const HEURISTIC_WEIGHT_KEYS = Object.freeze([
  'land',
  'mana',
  'permanent',
  'spell',
  'ability',
  'attack',
  'block',
]);

export const DEFAULT_HEURISTIC_WEIGHTS = Object.freeze({
  land: 1,
  mana: 1.1,
  permanent: 0.9,
  spell: 1,
  ability: 1,
  attack: 1,
  block: 1,
});

/**
 * Łączy nadpisania wag z domyślną konfiguracją i odrzuca literówki.
 * Zwracany obiekt jest nowy i zamrożony — tuner nie może zmienić konfiguracji
 * używanej przez inną instancję bota (ani przez caller po jego utworzeniu).
 */
export function normalizeHeuristicWeights(overrides = undefined) {
  if (overrides == null) return Object.freeze({ ...DEFAULT_HEURISTIC_WEIGHTS });
  if (typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new TypeError('Wagi heurystyki muszą być obiektem');
  }
  const unknown = Object.keys(overrides).filter((key) => !HEURISTIC_WEIGHT_KEYS.includes(key));
  if (unknown.length > 0) {
    throw new RangeError(`Nieznane wagi heurystyki: ${unknown.join(', ')}`);
  }
  for (const key of Object.keys(overrides)) {
    const value = overrides[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new RangeError(`Waga heurystyki ${key} musi być skończoną liczbą >= 0`);
    }
  }
  return Object.freeze({ ...DEFAULT_HEURISTIC_WEIGHTS, ...overrides });
}
