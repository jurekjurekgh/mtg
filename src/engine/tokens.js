/** Tokeny: uproszczone stałe obiekty gry, tworzone z reguły (np. efekt czaru). */
export function createToken({ name = 'Token', kind = 'creature', power = 1, toughness = 1, colors = [] }) {
  if (!name || !kind) throw new TypeError('Token musi mieć nazwę i rodzaj');
  return Object.freeze({
    kind, cardId: 'token_' + name.toLowerCase().replace(/\s+/g, '_'),
    name, colors, power, toughness, summoningSickness: true,
    tapped: false, damage: 0, zone: 'battlefield', controllerId: null,
  });
}
