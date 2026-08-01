/**
 * Rozwiązywanie adresu ilustracji karty — bez dotykania sieci.
 */
export const IMAGE_MODE = Object.freeze({ localFirst: 'local-first', remoteFirst: 'remote-first' });

export function imageFileName(cardName) {
  if (typeof cardName !== 'string' || !cardName.trim()) throw new TypeError('Nazwa karty musi być niepustym tekstem');
  return cardName.trim().toLowerCase()
    .replace(/['",.:;!()?/]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
}

export function localImagePath(card) {
  if (!card?.set || !card?.name) throw new TypeError('Karta musi mieć set i nazwę');
  return `img/${card.set}/${imageFileName(card.name)}.jpg`;
}

export function scryfallImageUrl(card, { version = 'normal' } = {}) {
  if (!card?.name) throw new TypeError('Karta musi mieć nazwę');
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=${version}`;
}

export function cardImageSources(card, { mode = IMAGE_MODE.localFirst } = {}) {
  const local = localImagePath(card);
  const remote = scryfallImageUrl(card);
  return mode === IMAGE_MODE.remoteFirst ? [remote, local] : [local, remote];
}

export function detectImageMode(protocol) {
  return protocol === 'file:' ? IMAGE_MODE.localFirst : IMAGE_MODE.remoteFirst;
}
