/** Zwraca wyłącznie karty, które kreator może legalnie zaproponować. */
export function querySupportedCards(registry, { plan = '', set = '', name = '', color = '' } = {}) {
  const normalized = (value) => value.trim().toLocaleLowerCase();
  const filters = { plan: normalized(plan), set: normalized(set), name: normalized(name), color: normalized(color) };
  return registry.supported().filter((card) => {
    return (!filters.plan || normalized(card.plan ?? '').includes(filters.plan))
      && (!filters.set || normalized(card.set ?? '').includes(filters.set))
      && (!filters.name || normalized(card.name).includes(filters.name))
      && (!filters.color || matchesColor(card, filters.color));
  });
}

function matchesColor(card, color) {
  const cardColors = card.colors ?? [];
  if (color === 'colorless') return cardColors.length === 0;
  return cardColors.map((c) => c.toLocaleLowerCase()).includes(color);
}
