/**
 * Mapowanie źródeł many -> jakie kolory mogą wyprodukować.
 * Na podstawie Oracle text kart (uproszczone, ale dokładniejsze niż „non-basic = any”).
 *
 * Każdy wpis: cardId -> { colors: ['W','U',...], amount: number }
 * - colors puste = tylko bezbarwna (C)
 * - colors = ['W','U','B','R','G'] = any-color
 * - amount = ile many daje (domyślnie 1, Apprentice Wizard daje 3)
 *
 * Dla lądów, które mają dwie zdolności (np. Holdout Settlement: {T}: Add {C} oraz
 * {T}, Tap creature: Add any), traktujemy je jako any-color, bo druga zdolność
 * pozwala na dowolny kolor (wymaga stworа, ale dla checku kolorów przyjmujemy
 * że może dać any).
 */

const MANA_SOURCE_MAP = Object.freeze({
  // Basic lands
  'basic-plains': { colors: ['W'], amount: 1 },
  'basic-island': { colors: ['U'], amount: 1 },
  'basic-swamp': { colors: ['B'], amount: 1 },
  'basic-mountain': { colors: ['R'], amount: 1 },
  'basic-forest': { colors: ['G'], amount: 1 },

  // Non-basic lands
  'rupture-spire': { colors: ['W', 'U', 'B', 'R', 'G'], amount: 1 }, // any
  'prismari-campus': { colors: ['U', 'R'], amount: 1 },
  'holdout-settlement': { colors: ['W', 'U', 'B', 'R', 'G'], amount: 1 }, // ma any via druga zdolność
  'unstable-frontier': { colors: [], amount: 1 }, // tylko {C}
  'secluded-steppe': { colors: ['W'], amount: 1 },
  'raucous-carnival': { colors: ['R', 'W'], amount: 1 },

  // Mana artifacts / creatures
  'dragonbroods-relic': { colors: ['W', 'U', 'B', 'R', 'G'], amount: 1 },
  'scorned-villager': { colors: ['G'], amount: 1 },
  'moonscarred-werewolf': { colors: ['G'], amount: 2 }, // {T}: Add {G}{G}
  'apprentice-wizard': { colors: [], amount: 3 }, // {C}{C}{C}
  'seers-lantern': { colors: [], amount: 1 }, // {T}: Add {C}
  'token_treasure': { colors: ['W', 'U', 'B', 'R', 'G'], amount: 1 },
  'token_food': { colors: [], amount: 0 }, // nie daje many
  'token_robot': { colors: [], amount: 0 },
  'token_wolf': { colors: [], amount: 0 },
  // Inne tokeny nie dają many
});

export function getManaSourceInfo(cardId) {
  return MANA_SOURCE_MAP[cardId] ?? null;
}

/**
 * Dla danego obiektu gry (land, token, permanent) zwraca info o produkcji many,
 * jeśli jest źródłem many.
 */
export function getSourceForObject(gameObject) {
  if (!gameObject) return null;
  const cardId = gameObject.cardId;
  const info = getManaSourceInfo(cardId);
  if (info) return { id: gameObject.id, cardId, colors: info.colors, amount: info.amount };
  // Fallback: jeśli obiekt jest landem i nie ma go w mapie, spróbuj wywnioskować z typów
  // Basic land już pokryte, ale inne lądy nieznane – traktujemy jako any? Nie, lepiej jako nieznane -> nie daje kolorowej many
  // Dla bezpieczeństwa: jeśli land i nieznany, zwróć colorless (nie pomaga w kolorach)
  const isLand = gameObject.kind === 'land' || (gameObject.types ?? []).includes('Land');
  if (isLand) {
    // Jeśli ma kolory w definicji (np. Forest Dryad token ma G), użyj ich
    if ((gameObject.colors ?? []).length > 0) {
      return { id: gameObject.id, cardId, colors: [...gameObject.colors], amount: 1 };
    }
    // Nieznany non-basic – zachowawczo nie zakładamy any, tylko colorless
    return { id: gameObject.id, cardId, colors: [], amount: 1 };
  }
  return null;
}

/**
 * Wszystkie kontrolowane źródła many gracza (tapped i untapped) – do checku kolorów.
 * Filtruje źródła o amount 0 (np. token_food, które nie daje many).
 */
export function allControlledManaSources(state, playerId) {
  const sources = [];
  for (const id of state.zones.battlefield) {
    const obj = state.objects.get(id);
    if (!obj || obj.controllerId !== playerId) continue;
    const src = getSourceForObject(obj);
    if (src && (src.amount ?? 1) > 0) sources.push(src);
  }
  return sources;
}

/**
 * Nietapnięte źródła many (do liczenia producibleMana, ale z kolorami).
 * Używane do liczenia dostępnej many (pool + untapped).
 */
export function untappedManaSources(state, playerId) {
  const sources = [];
  for (const id of state.zones.battlefield) {
    const obj = state.objects.get(id);
    if (!obj || obj.controllerId !== playerId || obj.tapped) continue;
    const src = getSourceForObject(obj);
    if (src && (src.amount ?? 1) > 0) sources.push(src);
  }
  return sources;
}
