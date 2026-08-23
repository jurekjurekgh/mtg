import { effectiveSubtypes } from './permanents.js';

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
  'great-furnace': { colors: ['R'], amount: 1 },
  'basilisk-gate': { colors: [], amount: 1 }, // {T}: Add {C}
  // Urza's Mine — tron (CR 702.??): {T}: Add {C}; jeśli kontrolujesz też
  // Urza's Power-Plant i Urza's Tower → zamiast tego Add {C}{C}.
  // Intencja: oba pozostałe landy z linii Urzy pojawią się w przyszłości
  // (decyzja właściciela). Mapa nie zawiera dosłownego porównania cardId —
  // funkcja getSourceForObject czyta z tego wpisu (ADR 0002: dane, nie kod).
  'urza-s-mine': { colors: [], amount: 1, tronRequired: ['urza-s-power-plant', 'urza-s-tower'] },

  // Mana artifacts / creatures
  'dragonbroods-relic': { colors: ['W', 'U', 'B', 'R', 'G'], amount: 1 },
  'apprentice-wizard': { colors: [], amount: 3 }, // {C}{C}{C}
  'token_treasure': { colors: ['W', 'U', 'B', 'R', 'G'], amount: 1 },
  // Static Net (BRO): Powerstone — „{T}: Add {C} — Spend this mana only to
  // cast artifact spells.\" Restrykcja artefaktowa nieimplementowana (engine
  // nie zna ograniczeń użycia many poza fromTreasure); produkuje bezbarwną {C}.
  'token_powerstone': { colors: [], amount: 1 },
  // Karty Z DARMOWĄ zdolnością „{T}: Add …" NIE wchodzą do mapy —
  // kolory/ilość czytane są z deskryptora (manaAbilityColors/Amount),
  // żeby mapa nie stała się cieniem danych karty (strażnik test/m200-...).
  'token_food': { colors: [], amount: 0 }, // nie daje many
  'token_robot': { colors: [], amount: 0 },
  'token_wolf': { colors: [], amount: 0 },
  // Inne tokeny nie dają many
});

export function getManaSourceInfo(cardId) {
  return MANA_SOURCE_MAP[cardId] ?? null;
}

/**
 * M193/A (zgloszenie wlasciciela, Dismal Backwater): kolory many, ktore obiekt
 * produkuje ZA SAMO {T}, odczytane z DESKRYPTOROW jego zdolnosci.
 *
 * Root cause zgloszenia: kolory zrodel many mialy DWA zrodla prawdy — dane
 * karty (`{ type: 'add_mana', colors: [...] }`, wprost z Oracle) i reczna mapa
 * MANA_SOURCE_MAP ponizej. Silnik czytal wylacznie mape, wiec kazda karta,
 * ktorej autor do niej nie dopisal, po cichu produkowala mane BEZBARWNA:
 * koszty generyczne dzialaly, a pipy kolorowe nie mialy z czego byc oplacone
 * i oferta rzutu w ogole nie powstawala (klasa L14/L41 — dwie kopie tej samej
 * reguly rozjezdzaja sie w ciszy). Dotknelo to Dismal Backwater ({U}/{B}),
 * Balamb Garden ({G}/{U}) i Heap Gate.
 *
 * Warunek kosztu jest istotny: liczymy WYLACZNIE zdolnosci o koszcie samego
 * {T} (albo bezkosztowe), bo tylko takich uzywa auto-tap platnosci. Zdolnosc
 * z kosztem many (Heap Gate „{1},{T}: Add one mana of any color") nie moze
 * podnosic kolorow dostepnych „od reki" — inaczej silnik zaoferowalby czar,
 * ktorego nie da sie oplacic (odwrotny bug tej samej klasy, L48).
 */
export function manaAbilityColors(gameObject) {
  const colors = [];
  let found = false;
  for (const ability of gameObject?.abilities ?? []) {
    if (ability?.type !== 'activated') continue;
    const cost = ability.cost ?? {};
    // Koszt musi byc pusty albo skladac sie z samego {T} — kazdy dodatkowy
    // skladnik (mana, poswiecenie, tapniecie innego permanentu) czyni
    // produkcje warunkowa, a wiec niedostepna dla auto-tapu.
    const extraCostKeys = Object.keys(cost).filter((key) => key !== 'tap' && cost[key]);
    if (extraCostKeys.length > 0) continue;
    const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
    for (const effect of effects) {
      if (effect?.type !== 'add_mana') continue;
      found = true;
      for (const color of effect.colors ?? []) if (!colors.includes(color)) colors.push(color);
    }
  }
  return found ? colors : null;
}

/**
 * M193/A: ILE many produkuje zdolnosc o koszcie samego {T} (Moonscarred
 * Werewolf: „{T}: Add {G}{G}" → 2). Czytane z tego samego deskryptora co
 * kolory, zeby ilosc i kolor nie mogly sie rozjechac.
 */
export function manaAbilityAmount(gameObject) {
  let total = null;
  for (const ability of gameObject?.abilities ?? []) {
    if (ability?.type !== 'activated') continue;
    const cost = ability.cost ?? {};
    const extraCostKeys = Object.keys(cost).filter((key) => key !== 'tap' && cost[key]);
    if (extraCostKeys.length > 0) continue;
    const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
    for (const effect of effects) {
      if (effect?.type !== 'add_mana') continue;
      total = Math.max(total ?? 0, effect.amount ?? 1);
    }
  }
  return total;
}

/**
 * Kolory podstawowych typów landów (CR 305.6): Plains → {W}, Island → {U},
 * Swamp → {B}, Mountain → {R}, Forest → {G}. Kolor produkcji lądu wynika
 * z jego PODTYPÓW podstawowych — także tymczasowo nadanych (typeGrant,
 * Unstable Frontier: land zmieniony na Forest produkuje {G}).
 */
const BASIC_SUBTYPE_COLORS = Object.freeze({
  Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G',
});

/**
 * Dla danego obiektu gry (land, token, permanent) zwraca info o produkcji many,
 * jeśli jest źródłem many.
 */
export function getSourceForObject(gameObject, state = null) {
  if (!gameObject) return null;
  const cardId = gameObject.cardId;
  const isLand = gameObject.kind === 'land' || (gameObject.types ?? []).includes('Land');
  // Kolory z PODTYPÓW podstawowych lądu (efektywne — honorują typeGrant):
  // Plains/Island/Swamp/Mountain/Forest → W/U/B/R/G. To reguła CR 305.6,
  // a nie mapa kart — land zmieniony na Forest (Unstable Frontier) produkuje {G}.
  if (isLand) {
    const subtypeColors = [];
    for (const subtype of effectiveSubtypes(gameObject)) {
      const color = BASIC_SUBTYPE_COLORS[subtype];
      if (color && !subtypeColors.includes(color)) subtypeColors.push(color);
    }
    if (subtypeColors.length > 0) {
      return { id: gameObject.id, cardId, colors: subtypeColors, amount: 1 };
    }
  }
  // M193/A: DESKRYPTOR zdolnosci karty ma pierwszenstwo przed reczna mapa —
  // to dane wprost z Oracle, wiec nie da sie ich zapomniec przy nowej karcie.
  // Mapa zostaje dla kart BEZ zdolnosci many w danych (produkcja implikowana:
  // basicki, Great Furnace „{T}: Add {R}" jako caly tekst karty) oraz dla
  // przypadkow, ktorych deskryptor nie wyraza (tron Urzy, Holdout Settlement).
  const abilityColors = manaAbilityColors(gameObject);
  if (abilityColors) {
    const amount = manaAbilityAmount(gameObject) ?? 1;
    // Kolor wybrany przy wejsciu (Manor Gate: „or one mana of the chosen
    // color") dokladamy tak samo jak w galezi mapy.
    const colors = gameObject.chosenColor
      ? [...new Set([...abilityColors, gameObject.chosenColor])]
      : abilityColors;
    return { id: gameObject.id, cardId, colors, amount };
  }
  const info = getManaSourceInfo(cardId);
  if (info) {
    let amt = info.amount ?? 1;
    // Urza's tron: {T}: Add {C}{C} zamiast {C}, gdy kontrolujesz też
    // Urza's Power-Plant i Urza's Tower (sprawdzane po cardId — ADR 0002
    // dopuszcza w danych kart, nie w core).
    // Tron (Urza's lands): sprawdza kontrolę wymaganych kart przez ID z danych
    // mapy (tronRequired) — zero literału w kodzie, ADR 0002.
    if (info.tronRequired?.length && gameObject.controllerId && state) {
      const ctrl = gameObject.controllerId;
      const allMet = info.tronRequired.every((reqId) =>
        [...state.objects.values()].some((o) => o.zone === 'battlefield' && o.controllerId === ctrl && o.cardId === reqId));
      if (allMet) amt = 2;
    }
    return { id: gameObject.id, cardId, colors: info.colors, amount: amt };
  }
  // Fallback: jeśli obiekt jest landem i nie ma go w mapie ani podtypów
  // podstawowych — zachowawczo colorless (nie pomaga w kolorach).
  if (isLand) {
    // Jeśli ma kolory w definicji (np. token Forest Dryad ma G), użyj ich.
    if ((gameObject.colors ?? []).length > 0) {
      return { id: gameObject.id, cardId, colors: [...gameObject.colors], amount: 1 };
    }
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
    const src = getSourceForObject(obj, state);
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
    const src = getSourceForObject(obj, state);
    if (src && (src.amount ?? 1) > 0) sources.push(src);
  }
  return sources;
}


const MANA_COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];

/**
 * Kanoniczny klucz jednostki many w kolorowej puli: posortowane (wg
 * MANA_COLOR_ORDER) kolory, jakie ta jednostka moze oplacic jako pip.
 * '' = jednostka bezbarwna (oplaca tylko generic). 'WUBRG' = dowolny kolor.
 * Dwubarwny land (Prismari Campus) -> 'UR' (oplaca U lub R, nie G).
 */
export function manaUnitKey(colors) {
  const set = new Set((colors ?? []).filter((c) => MANA_COLOR_ORDER.includes(c)));
  return MANA_COLOR_ORDER.filter((c) => set.has(c)).join('');
}
