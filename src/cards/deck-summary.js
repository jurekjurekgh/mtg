export function summarizeDeck(cardIds, registry) {
  const colors = new Map();
  let lands = 0;
  let spells = 0;
  for (const id of cardIds) {
    const card = registry.get(id);
    if (!card) continue;
    if (card.types.includes('Land')) lands += 1;
    else spells += 1;
    for (const color of card.colors) colors.set(color, (colors.get(color) ?? 0) + 1);
  }
  return { total: cardIds.length, lands, spells, colors };
}
