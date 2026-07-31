/** Zwraca wyłącznie karty, które kreator może legalnie zaproponować. */
export function querySupportedCards(registry, { plan = '', set = '', name = '' } = {}) {
  const normalized = (value) => value.trim().toLocaleLowerCase();
  const filters = { plan: normalized(plan), set: normalized(set), name: normalized(name) };
  return registry.supported().filter((card) => {
    return (!filters.plan || normalized(card.plan ?? '').includes(filters.plan))
      && (!filters.set || normalized(card.set ?? '').includes(filters.set))
      && (!filters.name || normalized(card.name).includes(filters.name));
  });
}
