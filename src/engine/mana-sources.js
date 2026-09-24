import { effectiveAbilities, effectiveSubtypes } from './permanents.js';

/**
 * Mapowanie źródeł many -> jakie kolory mogą wyprodukować.
 * Na podstawie Oracle text kart — wyłącznie źródła BEZ deskryptora (patrz niżej).
 *
 * Każdy wpis: cardId -> { colors: ['W','U',...], amount: number }
 * - colors puste = tylko bezbarwna (C)
 * - colors = ['W','U','B','R','G'] = any-color
 * - amount = ile many daje (domyślnie 1, Apprentice Wizard daje 3)
 *
 * UWAGA (M193, strażnik M200/N1): karty, których zdolności many są opisane
 * DESKRYPTOREM (`{ type: 'add_mana', colors: [...] }`), do tej mapy NIE
 * wchodzą — gałąź deskryptora w getSourceForObject ma pierwszeństwo, więc
 * taki wpis byłby martwym cieniem drugiej kopii tej samej reguły (L41).
 * Mapa obsługuje wyłącznie produkcję IMPLIKOWANĄ, bez deskryptora
 * (basicki, tron Urzy, tokeny).
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
  'unstable-frontier': { colors: [], amount: 1 }, // tylko {C}
  'secluded-steppe': { colors: ['W'], amount: 1 },
  'raucous-carnival': { colors: ['R', 'W'], amount: 1 },
  'great-furnace': { colors: ['R'], amount: 1 },
  'basilisk-gate': { colors: [], amount: 1 }, // {T}: Add {C}
  // Urza's Mine — tron (tekst karty, bez osobnej reguły CR): {T}: Add {C}; jeśli kontrolujesz też
  // Urza's Power-Plant i Urza's Tower → zamiast tego Add {C}{C}.
  // Intencja: oba pozostałe landy z linii Urzy pojawią się w przyszłości
  // (decyzja właściciela). Mapa nie zawiera dosłownego porównania cardId —
  // funkcja getSourceForObject czyta z tego wpisu (ADR 0002: dane, nie kod).
  'urza-s-mine': { colors: [], amount: 1, tronRequired: ['urza-s-power-plant', 'urza-s-tower'] },

  // Mana artifacts / creatures
  'dragonbroods-relic': { colors: ['W', 'U', 'B', 'R', 'G'], amount: 1 },
  'apprentice-wizard': { colors: [], amount: 3 }, // {C}{C}{C}
  // Skarb (Treasure) NIE ma tu wpisu (audyt PR #93, tura 3): jego zdolność
  // „{T}, Sacrifice this artifact: Add one mana of any color" leży w DESKRYPTORZE
  // tokena, a czyta ją `treasureManaAbilityOf` niżej. Wpis w tej mapie był dokładnie
  // tym „cieniem danych karty", przed którym ostrzega komentarz pod MANA_SOURCE_MAP:
  // trzy miejsca (mapa, resources.js, katalog tokenów) trzymały tę samą regułę i żadne
  // z nich nie musiało się z niczym liczyć — rozjazd był bezgłośny (klasa L21).
  // Static Net (BRO): token_powerstone NIE wchodzi do mapy od PR #121
  // (Żywy Tester): wpis katalogu ma teraz zdolność aktywowaną
  // ({T}: Add {C}, spendOnly:'artifact') — kolory/ilość czyta deskryptor,
  // restrykcję respektuje resources.js (restrictedPool — M214). Mapa nie
  // cieniuje deskryptora (strażnik M200/N1).
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
/**
 * Kolory many, które OBIEKT mógłby wyprodukować, IGNORUJĄC koszty aktywacji —
 * dosłownie CR 106.7: „The type of mana a permanent could produce at any time
 * includes any type of mana that an ability of that permanent would produce if
 * the ability were to resolve at that time, taking into account any applicable
 * replacement effects in any possible order. Ignore whether any costs of the
 * ability could or could not be paid."
 *
 * Źródła kolorów (audyt PR #134, F-2 — dawniej tylko punkt 1, więc „could
 * produce" gubiło resztę produkcji obiektu):
 *  1. deskryptory `add_mana` WSZYSTKICH zdolności aktywowanych (bez filtra
 *     kosztów — Heap Gate {1},{T}: any color liczy się w pełni), w tym
 *     zagnieżdżone `colorsFrom` z wykluczeniem samego obiektu;
 *  2. kolor WYBRANY przy wejściu (`chosenColor` — Manor Gate: „{T}: Add {G}
 *     or one mana of the chosen color");
 *  3. wewnętrzna zdolność many z podstawowego podtypu lądu (CR 305.6 —
 *     podtyp EFEKTYWNY, więc nadanie typu też się liczy);
 *  4. produkcja implikowana (karta bez deskryptora many w danych — mapa
 *     źródeł, np. „{T}: Add {R}" jako cały tekst karty).
 *
 * `effectiveAbilities`/`effectiveSubtypes`: nadania zdolności i zmian typu
 * honorujemy jak każdy inny odczyt na polu bitwy.
 */
function manaColorsIgnoringCosts(gameObject, state = null) {
  const colors = [];
  const push = (color) => { if (color && !colors.includes(color)) colors.push(color); };
  let hasManaAbility = false;
  for (const ability of effectiveAbilities(gameObject)) {
    if (ability?.type !== 'activated') continue;
    const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
    for (const effect of effects) {
      if (effect?.type !== 'add_mana') continue;
      hasManaAbility = true;
      const producible = effect.colorsFrom
        ? colorsProducibleBySubtype(state, gameObject.controllerId, effect.colorsFrom.controlledSubtype,
          { excludeId: gameObject.id })
        : (effect.colors ?? []);
      for (const color of producible) push(color);
    }
  }
  if (hasManaAbility && gameObject.chosenColor) push(gameObject.chosenColor);
  const isLand = gameObject.kind === 'land' || (gameObject.types ?? []).includes('Land');
  if (isLand) {
    for (const subtype of effectiveSubtypes(gameObject)) push(BASIC_SUBTYPE_COLORS[subtype]);
  }
  // Punkt 4 tylko dla obiektów BEZ deskryptora many — inaczej `getSourceForObject`
  // wszedłby z powrotem w `colorsProducibleBySubtype` (rekurencja).
  if (!hasManaAbility) {
    for (const color of getSourceForObject(gameObject, state)?.colors ?? []) push(color);
  }
  return colors;
}

/**
 * Batch 58/B7 (Gond Gate: „{T}: Add one mana of any color that a Gate you
 * control could produce"): kolory produkowalne przez KONTROLOWANE permanenty
 * o danym podtypie — unia tego, co każdy z nich „could produce" (CR 106.7,
 * koszt bez znaczenia; pełny odczyt w `manaColorsIgnoringCosts` wyżej).
 *
 * `excludeId` wyklucza samo źródło (Gond Gate nie liczy własnego {C}).
 * Jedno miejsce prawdy (L41) dla: kreatora many/auto-tapu
 * (`getSourceForObject`), rozstrzygnięcia efektu (effects.js) i bramki
 * dostępności zdolności (abilities.js `abilityConditionFailure`).
 *
 * O-5 audytu PR #134: `colorsFrom` innych źródeł grupy (drugi Gond Gate) NIE
 * jest rozwijany rekurencyjnie. Dla katalogu (stan 2026-09-24: jedyna karta
 * z `colorsFrom` to Gond Gate, grupa = Gate) wynik jest identyczny z punktem
 * stałym CR 106.7 — kolory drugiego Gond Gate to z definicji kolory
 * pozostałych Bram, a same Gond Gate poprawnie dają zero kolorów.
 * KARTY SPOZA KATALOGU: źródło z `colorsFrom` INNEJ grupy (np. „any color
 * a land you control could produce" — Reflecting Pool) obok Gond Gate
 * wymaga iteracji do punktu stałego (unia po kolejnych przebiegach, aż zbiór
 * przestanie rosnąć), z ochroną przed cyklem.
 */
export function colorsProducibleBySubtype(state, playerId, subtype, { excludeId = null } = {}) {
  const colors = [];
  if (!state || !subtype || !playerId) return colors;
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (!object || object.zone !== 'battlefield' || object.controllerId !== playerId) continue;
    if (excludeId != null && object.id === excludeId) continue;
    if (!effectiveSubtypes(object).includes(subtype)) continue;
    for (const color of manaColorsIgnoringCosts(object, state)) {
      if (!colors.includes(color)) colors.push(color);
    }
  }
  return colors;
}

export function manaAbilityColors(gameObject, state = null) {
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
      // B7 (Gond Gate): „any color that a <podtyp> you control could produce" —
      // kolory z danych grupy permanentów, nie z nazwy karty (ADR 0002).
      const producible = effect.colorsFrom
        ? colorsProducibleBySubtype(state, gameObject.controllerId, effect.colorsFrom.controlledSubtype,
          { excludeId: gameObject.id })
        : (effect.colors ?? []);
      for (const color of producible) if (!colors.includes(color)) colors.push(color);
    }
  }
  return found ? colors : null;
}

/**
 * M405/B (uwaga z gry — Jeskai Devotee): produkcja many KONKRETNEJ zdolności
 * z DESKRYPTORA `add_mana` (effect.colors / effect.amount — suma jak silnik
 * przy rozstrzyganiu, M67 i abilities.js collectManaAmount).
 *
 * To inny kontekst niż `manaAbilityColors`/`manaAbilityAmount` wyżej — tam
 * chodzi o produkcję „za samo {T}” całego obiektu i zdolności z KOSZTEM many
 * są celowo pomijane (M193/A: Heap Gate nie podnosi kolorów dostępnych
 * „od ręki”). Konwertery walut („{1}: Add {U}, {R}, or {W}”) żyją TYLKO tu:
 * kreator many musi widzieć ich produkcję, inaczej źródło wypada z solwera
 * wariantów płatności i gracz traci wybór (auto-tap pierwszego lepszego
 * źródła). Brak kolorów w deskryptorze = fallback produkcji obiektu
 * (mapa/podtypy — jak w efektach M67: effect.colors ?? src.colors).
 * Kolor wybrany przy wejściu (A3, Manor Gate) dokłada się tak samo jak
 * w getSourceForObject — jedna reguła unii (L28).
 */
export function manaAbilityProductionOf(gameObject, ability, state = null) {
  const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
  const addEffects = (effects ?? []).filter((e) => e?.type === 'add_mana');
  if (addEffects.length === 0) return null;
  // B7 (Gond Gate): ta sama unia grupowa co w `manaAbilityColors`/auto-tapie.
  const descColors = [...new Set(addEffects.flatMap((e) => (e.colorsFrom
    ? colorsProducibleBySubtype(state, gameObject?.controllerId, e.colorsFrom.controlledSubtype,
      { excludeId: gameObject?.id ?? null })
    : (e.colors ?? []))))];
  const src = getSourceForObject(gameObject, state);
  const base = descColors.length > 0 ? descColors : (src?.colors ?? []);
  const colors = gameObject?.chosenColor && !base.includes(gameObject.chosenColor)
    ? [...base, gameObject.chosenColor]
    : base;
  const amount = addEffects.reduce((acc, e) => acc + (e.amount ?? 1), 0);
  return { colors, amount };
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
/**
 * Pięć kolorów many — awaryjna odpowiedź na „Add one mana of any color"
 * (CR 105.1: {W}{U}{B}{R}{G}). To stała REGUŁOWA, nie nazwa karty.
 *
 * Definicje w katalogu podają kolory JAWNIE w deskryptora (`effect.colors`,
 * audyt PR #93 tura 3 — wcześniej szło to z MANA_SOURCE_MAP i z dwóch literałów
 * w `resources.js`, a sześć efektów `create_token` w ogóle ich nie miało), więc
 * w zwykłej grze ta awaria nie wchodzi do gry. Została tam, gdzie i w `addMana`:
 * obiekt zbudany bez kolorów produkuje manę dowolnego koloru, nie bezbarwną.
 * Strażnik `test/audyt-treasure-katalog.test.js` pilnuje, żeby nowe definicje
 * pisały fakt w danych (porównuje `effect.colors` obu definicji Skarba).
 */
export const ANY_COLOR_MANA = Object.freeze(['W', 'U', 'B', 'R', 'G']);

/**
 * Zdolność many, której kosztem jest {T} + poświęcenie SAMEGO źródła, oznaczona
 * jako skarbowa (`effect.fromTreasure`) — czyli Skarb i każdy, kto gra jego
 * rolę. `manaAbilityColors` takich zdolności celowo NIE liczy (produkcja nie
 * jest „od ręki", bo wymaga zdjęcia permanentu), a tu pytamy o coś innego: co
 * obiekt na polu bitwy JEST w stanie wyprodukować — płatność i tak musi go
 * poświęcić (CR 701.21a — poświęcenie jest kosztem zdolności, nie celem).
 *
 * Brak tu nazwy karty: predykat czyta deskryptor (cost + effect.fromTreasure),
 * więc kopia tej samej zdolności pod innym `cardId` liczy się identycznie
 * (decyzja właściciela, audyt PR #93; ADR 0002 — rdzeń jest name-agnostic).
 */
export function treasureManaAbilityOf(gameObject) {
  for (const ability of gameObject?.abilities ?? []) {
    if (ability?.type !== 'activated') continue;
    const cost = ability.cost ?? {};
    const keys = Object.keys(cost).filter((key) => cost[key]);
    if (keys.length !== 2 || !cost.tap || !cost.sacrificeSelf) continue;
    const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
    for (const effect of effects) {
      if (effect?.type !== 'add_mana' || !effect.fromTreasure) continue;
      // Brak `colors` = „dowolny kolor", dokładnie jak w domyśle `addMana`
      // (tam: „wygoda testów"). Wszystkie deskryptory w katalogu kolory
      // podają — strażnik `audyt-treasure-katalog.test.js` porównuje
      // `effect.colors` obu definicji Skarba, więc rozjazd danych RED-uje.
      return {
        colors: [...(effect.colors ?? ANY_COLOR_MANA)],
        amount: effect.amount ?? 1,
        fromTreasure: true,
      };
    }
  }
  return null;
}

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
  const abilityColors = manaAbilityColors(gameObject, state);
  if (abilityColors) {
    const amount = manaAbilityAmount(gameObject) ?? 1;
    // Kolor wybrany przy wejsciu (Manor Gate: „or one mana of the chosen
    // color") dokladamy tak samo jak w galezi mapy.
    const colors = gameObject.chosenColor
      ? [...new Set([...abilityColors, gameObject.chosenColor])]
      : abilityColors;
    return { id: gameObject.id, cardId, colors, amount };
  }
  // Zdolność skarbowa (patrz `treasureManaAbilityOf` wyżej): źródło, które
  // produkuje manę poświęcając siebie. Dawniej zastępował to wpis w
  // MANA_SOURCE_MAP — teraz fakt mieszka w danych tokena.
  const sacMana = treasureManaAbilityOf(gameObject);
  if (sacMana) {
    return { id: gameObject.id, cardId, colors: sacMana.colors, amount: sacMana.amount };
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
/**
 * Ile i jakich kolorów many da karta-ląd PO ZAGRANIU, czytane z DEFINICJI karty
 * (audyt bota PR #93 tura 5).
 *
 * Po co: wycena `play_land` musi wiedzieć, co produkuje ląd leżący JESZCZE w
 * ręce. Obiekt w `playerView.zones.hand` nie ma ani zmaterializowanych
 * zdolności, ani podtypów — `getSourceForObject` nie ma z czego rozwiązać, a
 * kopia logiki w kontrolerze byłaby drugim definiowaniem tej samej reguły
 * (klasa L21). Dlatego jest to CIEŃK I adapter: buduje obiekt-pozorny z pól
 * definicji i deleguje do `getSourceForObject`, więc podtypy podstawowe
 * (CR 305.6), deskryptor zdolności, zdolność skarbowa i mapa źródeł zostają w
 * jednym miejscu.
 *
 * `state` bywa potrzebny tylko do warunków sprawdzających inne permanenty
 * (tron Urzy); bez niego wynik jest zachowawczy.
 */
export function manaSourceOfCardDefinition(cardId, definition = null, state = null) {
  const def = definition ?? null;
  if (!def || !(def.types ?? []).includes('Land')) return null;
  return getSourceForObject({
    id: `definition:${cardId}`,
    cardId,
    kind: 'land',
    zone: 'hand',
    types: def.types ?? [],
    subtypes: def.subtypes ?? [],
    abilities: def.abilities ?? [],
    colors: def.colors ?? [],
  }, state);
}

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

/** Czy to zdolność many (CR 605.1a): dodaje manę i nie ma celów. */
export function isActivatedManaAbility(ability) {
  if ((ability.targets ?? []).length > 0) return false;
  const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
  // M154 (Batch 38, Pristine Talisman): „{T}: Add {C}. You gain 1 life." —
  // zdolność many z dojazdem zysku życia. Mana abilities rozstrzygają się
  // natychmiast bez stosu (CR 605.1a). Zysk życia dopuszczamy TYLKO jako
  // rider obok add_mana (sam gain_life — Soulmender {T}: zyskaj 1 życia — to
  // zwykła zdolność na stosie, nie mana ability).
  return effects.length > 0 && effects.some((e) => e?.type === 'add_mana')
    && effects.every((e) => e?.type === 'add_mana' || e?.type === 'gain_life');
}

/**
 * F (zgłoszenie z gry 2026-09-22 — Pristine Talisman): „Ten artefakt produkuje
 * manę, ale także dodaje 1 life. Nie powinien być traktowany jak zwykły
 * permanent do produkcji many, czyli cały czas wyciszony. Tylko takie które
 * nie robią nic innego tylko produkują manę za tapnięcie powinny być
 * wyciszone w auto-pasie.”
 *
 * `isActivatedManaAbility` (CR 605.1a) odpowiada na inne pytanie — „czy to
 * zdolność many”, czyli czy OMIJA STOS — i rider zysku życia tego nie zmienia
 * (M154). Wyciszanie w panelu i w auto-pasie to jednak pytanie o DECYZJĘ
 * GRACZA: zdolność z dodatkowym skutkiem (życie, scry, licznik) bywa warta
 * aktywacji sama w sobie, więc nie wolno jej chować. Stąd osobny, WĘŻSZY
 * predykat: wyciszamy wyłącznie zdolności, których jedynym efektem jest
 * `add_mana`. Reguła po deskryptorze (ADR 0002), nie po nazwie karty.
 */
export function isSilentManaAbility(ability) {
  if (!isActivatedManaAbility(ability)) return false;
  const effects = Array.isArray(ability.effect) ? ability.effect : [ability.effect];
  return effects.every((e) => e?.type === 'add_mana');
}

/**
 * J (zgłoszenie właściciela 2026-09-19b): pola komendy, które czynią z
 * aktywacji zdolności many REALNĄ decyzję (cel, X, koszt wskazujący permanent).
 * Wariant z którymkolwiek z nich nie jest „czystą" zdolnością many — zostaje
 * ofertą panelu i przerywa auto-pass (gracz ma tam co wybrać).
 *
 * Lista mieszka w SILNIKU, bo opisuje KONTRAKT KOMEND (game-state: targets,
 * xValue, crewCreatureIds, tapPermanentCostId…), a nie wygląd stołu: dotąd
 * trzymał ją panel (render.js), więc auto-pass nie umiał tej samej reguły
 * zastosować i zatrzymywał grę w każdym kroku na „{T}: Add {C}" źródła
 * (Seer's Lantern, dorki) — mimo że panel tych akcji nie pokazywał.
 */
export const MANA_ABILITY_PAYLOAD_KEYS = Object.freeze([
  'targets', 'attackerId', 'tapCreatureId', 'tapOtherCreatureId', 'tapArtifactIds',
  'sacrificeLandId', 'sacrificeCreatureId', 'sacrificeCreatureIds', 'tapPermanentCostId',
  'grantedFromEquipment', 'xValue',
]);

/**
 * Czy komenda `activate_ability` to CZYSTA zdolność many (CR 605.1a) bez
 * dodatkowego wyboru? JEDNO ŹRÓDŁO PRAWDY (L41) dla dwóch odbiorców:
 *  - panel „Twoje działania" (render.js `isManaAbilityCommand` — M369/G),
 *  - auto-pass sesji (session.js `hasMeaningfulDecision` — J).
 * `object` to obiekt stanu gry; `fallbackAbilities` to deskryptory z rejestru
 * (widok nie niesie abilities dla tokenów/obiektów spoza stanu).
 */
export function isPureManaAbilityCommand(command, object, fallbackAbilities = null) {
  if (command?.type !== 'activate_ability') return false;
  for (const key of MANA_ABILITY_PAYLOAD_KEYS) {
    const value = command[key];
    if (Array.isArray(value) ? value.length > 0 : value != null) return false;
  }
  const ability = object?.abilities?.[command.abilityIndex]
    ?? fallbackAbilities?.[command.abilityIndex]
    ?? null;
  // F (2026-09-22): wyciszamy wyłącznie zdolności BEZ skutku ubocznego —
  // patrz `isSilentManaAbility` (Pristine Talisman „{T}: Add {C}. You gain
  // 1 life.” zostaje w panelu i przerywa auto-pass).
  return Boolean(ability && isSilentManaAbility(ability));
}
