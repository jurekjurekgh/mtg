import { execute, playerView } from '../engine/game-state.js';
import { makeSimulate } from '../engine/lookahead.js';
import { setupCardMatch } from '../cards/materialize.js';
import { parseReplay, playReplay, replayFromState, serializeReplay } from '../engine/replay.js';
import { stateFingerprint } from '../engine/fingerprint.js';
import { createHeuristicBot } from '../controllers/heuristic-bot.js';
import { probeCommandEffect } from './noop-probe.js';

/**
 * Sesja stołu: łączy UI z protokołem engine, zgodnie z granicą
 * „kontroler → intencja → engine → zdarzenia i nowy widok → UI".
 *
 * Sesja prowadzi partię człowiek–bot: ruchy bota rozgrywa od razu, a okna,
 * w których człowiek ma do wyboru wyłącznie pass/concede, przewija
 * automatycznie — do człowieka docierają tylko prawdziwe decyzje.
 * Opcja `pauseOnBotMoves` (UI stołu) zatrzymuje przebieg po KAŻDYM istotnym
 * zagraniu bota (rzut, ląd, zdolność, zmiana strefy karty) — gracz klika
 * „Rozumiem" w modalu „Ruch bota", a sesja wznawia przez continueBotPlay.
 *
 * Moduł nie dotyka DOM-u (testowalny headless); renderowanie i zdarzenia
 * myszy są w render.js/main.js.
 */

export const HUMAN_ID = 'p1';
export const BOT_ID = 'p2';
export const PLAYER_NAMES = { [HUMAN_ID]: 'Ty', [BOT_ID]: 'Nieprzyjaciel' };

/**
 * M127 (uwaga A właściciela, 2026-08-17): „Jeśli w Rozgrywce podawane są
 * informacje o kreaturze zagranej jako morph to zręczniej byłoby pisać go
 * z wielkiej litery: Morph.\"
 *
 * `Morph` jest NAZWĄ MECHANIKI (CR 702.37), tak jak Flash czy Persist w mapie
 * KEYWORD_LABELS — a nie rzeczownikiem pospolitym. W UI pełni dodatkowo rolę
 * ZASTĘPCZEJ NAZWY zakrytej karty (CR 708.2: permanent twarzą w dół nie ma
 * nazwy), więc stoi dokładnie tam, gdzie normalnie stoi nazwa karty pisana
 * wielką literą — „Nieprzyjaciel zagrywa morph twarzą w dół\" czytało się
 * jak literówka.
 *
 * Etykieta była dotąd SUROWYM LITERAŁEM w ośmiu miejscach czterech modułów
 * stołu (log, kafle, wizardy walki i obrażeń, etykiety celów, stos). To
 * wzorzec z lekcji L28/L30: punktowa zmiana brzmienia w miejscu zgłoszenia
 * zostawiłaby siedem pozostałych ścieżek starą pisownią. Dlatego jedna stała
 * + dwa helpery, a test-niezmiennik (L31) czyta ŹRÓDŁO i pilnuje, że żaden
 * moduł stołu nie wpisuje tej etykiety z palca.
 */
export const FACE_DOWN_LABEL = 'Morph';

/** Znacznik przy nazwie WŁASNEJ zakrytej karty: „Segmented Krotiq (Morph)". */
export function faceDownSuffix() {
  return ` (${FACE_DOWN_LABEL})`;
}

/**
 * Nazwa zakrytego permanentu/czaru wg CR 708.2 i 708.6.
 *
 * - cudzy face-down: bezimienny (Fog of War) — sama etykieta mechaniki;
 * - własny face-down: kontroler zna swoją kartę, więc nazwa + znacznik, żeby
 *   gracz nie wziął zakrytego 2/2 za pełnego stwora (decyzja z M100/E12).
 */
export function faceDownName(cardName) {
  return cardName == null ? FACE_DOWN_LABEL : `${cardName}${faceDownSuffix()}`;
}

/**
 * Feature 2026-08-11: stabilny klucz POJEDYNCZEJ opcji akcji (rzut czaru /
 * aktywacja zdolności) — do „ptaszka wyciszenia" w panelu „Twoje działania".
 * Zaznaczona opcja nie przerywa auto-passu (hasMeaningfulDecision ją pomija).
 * Klucz obejmuje wszystkie pola rozróżniające warianty: cel(e), X, tryb,
 * buyback/escape/adventure/bestow/morph, koszt alternatywny, crew/tap.
 */
export function commandOptionKey(cmd) {
  const fields = [
    'type', 'objectId', 'abilityIndex', 'targets', 'xValue', 'modeIndex',
    'buyback', 'payAltCost', 'bestow', 'faceDown', 'sacrificeTargetId',
    'stunTargetId', 'attackerId', 'crewCreatureIds', 'tapCreatureId',
    'tapOtherCreatureId', 'escapeExileIds',
    // M112: komendy WALKI budowane przez wizard (declare_attackers /
    // declare_blockers) — bez tych pól wszystkie warianty ataku miały ten sam
    // klucz, więc sonda „oferta bez skutku" mierzyłaby nie tę komendę,
    // a ptaszek wyciszenia obejmowałby przypadkiem cały wizard.
    'attackerIds', 'assignments',
    // M112: decyzje wizarda scry/surveil (klucz sondy musi rozróżniać warianty).
    'bottomIds', 'millIds', 'topOrder', 'order',
  ];
  const out = {};
  for (const k of fields) if (cmd[k] !== undefined) out[k] = cmd[k];
  return JSON.stringify(out);
}
/**
 * Imiona do sekcji „Przebieg tur (dla AI)" — decyzja właściciela 2026-08-03:
 * Czarodziejka (człowiek) i Nieprzyjaciel (bot). Reszta stołu zachowuje
 * dotychczasowe „Ty"/„Bot".
 */
export const TURN_NAMES = { [HUMAN_ID]: 'Czarodziejka', [BOT_ID]: 'Nieprzyjaciel' };

function defaultBotFactory(seed, ctx) {
  // B3: bot modeluje rękę przeciwnika (człowieka) — zna jego talię.
  return createHeuristicBot({ seed, opponentDeck: ctx?.opponentDeck });
}

  /**
   * Krótkie polskie opisy efektów zdolności aktywowanych — do logu stołu
   * zamiast „(?)\". Klucze = `effect.type` z deskryptorni zdolności; wpis
   * bez opisu zostawia samo „Bot aktywuje: <karta>".
   */
  const ABILITY_EFFECT_LABELS = Object.freeze({
    add_counter: 'licznik na celu',
    add_mana: 'dodanie many do puli',
    bounce_permanent: 'zerzucenie permanentu na rękę',
    cant_block: 'docelowy stwór nie może blokować do końca tury',
    craft_transform: 'craft — przemiana artefaktu',
    damage: 'obrażenia w cel',
    discover: 'discover',
    draw_cards: 'dobranie kart',
    exile_return_transformed: 'wygnanie i powrót przemieniony',
    explore: 'explore (odsłonięcie wierzchu biblioteki)',
    gain_life: 'zdobycie życia',
    grant_keywords_until_end_of_turn: 'nadanie słów kluczowych do końca tury',
    lock_untap: 'cel nie odtapuje podczas następnego untap kontrolera',
    lose_life: 'cel traci życie',
    mill_cards: 'mielenie kart do grobu',
    prevent_damage_this_turn: 'niwelowanie obrażeń do końca tury',
    pump: 'zmiana statystyk celu',
    scry: 'scry na wierzchu biblioteki',
    search_library_to_battlefield: 'szukanie karty w bibliotece na pole bitwy',
    station_counters: 'liczniki charge ze Station',
    take_initiative: 'objęcie inicjatywy',
    transform: 'transform karty',
    untap_permanent: 'odtapnięcie celu',
    venture_into_undercity: 'zagłębienie w Podziemia',
  });

/**
 * Czytelnik zdarzeń silnika na polskie linie logu (modułowy, czysty —
 * testowalny bez sesji). helpers: { nameOf(cardId), nameOfObject(objectId) };
 * names: mapa playerId → imię stołu („Ty"/„Nieprzyjaciel"). Zwraca null dla
 * zdarzeń-dubletów (pomijanych w logu) albo surowy typ, gdy brak opisu —
 * KAŻDY nowy typ zdarzenia powinien dostać case (uwagi A/D 2026-08-10).
 */
/** Odmiana polska rzeczownika wg liczby: (1 → one, 2-4 → few, 5+ → many). */
function polishPlural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (n === 1) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

/** Diament (2026-08-11): odmiana „obrażenie/obrażenia/obrażeń" wg liczby. */
function dmgCount(n) {
    return `${n} ${polishPlural(n, 'obrażenie', 'obrażenia', 'obrażeń')}`;
  }

/** Polska lista wieloelementowa: „A", „A i B", „A, B i C" (audyt M83). */
function polishList(items) {
  const arr = items.filter(Boolean);
  if (arr.length <= 1) return arr.join('');
  if (arr.length === 2) return `${arr[0]} i ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')} i ${arr[arr.length - 1]}`;
}



/**
 * M122/#8 — POWÓD ODRZUCENIA RUCHU po polsku.
 *
 * Żywy Tester (wiedzmin vs tokens, seed 5008) pokazał w logu gracza:
 * „Ruch odrzucony: wrong_combat_timing". `reason` to kod techniczny z silnika
 * (jest ich w `src/engine/` ponad 60) i szedł do interfejsu bez tłumaczenia.
 *
 * Mapujemy najczęstsze wprost, a resztę obsługuje fallback po PREFIKSIE —
 * dzięki temu nowy kod z rodziny `illegal_*` też dostanie sensowne zdanie
 * zamiast sluga. Kod zostaje w nawiasie: gracz widzi po polsku, a zgłoszenie
 * błędu wciąż niesie dokładny identyfikator dla nas.
 */
export const REJECTION_REASON_LABELS = Object.freeze({
  not_priority: 'nie masz teraz priorytetu',
  wrong_combat_timing: 'nie ta faza walki',
  illegal_land: 'nie możesz teraz zagrać lądu',
  illegal_cast: 'nie możesz teraz rzucić tego czaru',
  illegal_spell: 'ten czar jest w tej chwili nielegalny',
  illegal_ability: 'nie możesz teraz użyć tej zdolności',
  illegal_move: 'ten ruch jest w tej chwili nielegalny',
  illegal_attack: 'ten atak jest nielegalny',
  illegal_block: 'ten blok jest nielegalny',
  unsupported_command: 'ta akcja nie jest obsługiwana',
  no_legal_targets: 'brak legalnych celów',
  no_targets: 'brak celów',
  empty_library: 'biblioteka jest pusta',
  insufficient_mana: 'za mało many',
});

/** Zdanie dla gracza + kod techniczny w nawiasie (do zgłoszeń błędów). */
export function rejectionReasonLabel(reason) {
  if (!reason || typeof reason !== 'string') return 'ruch odrzucony przez zasady gry';
  const known = REJECTION_REASON_LABELS[reason];
  if (known) return `${known} (${reason})`;
  // Fallback po rodzinie kodów — nowy `illegal_*` nie wycieknie jako goły slug.
  if (reason.startsWith('illegal_')) return `ruch niezgodny z zasadami (${reason})`;
  if (reason.startsWith('wrong_')) return `niewłaściwy moment na tę akcję (${reason})`;
  if (reason.startsWith('no_') || reason.startsWith('empty_')) return `brak wymaganego elementu (${reason})`;
  return `ruch odrzucony przez zasady gry (${reason})`;
}

export const TRIGGER_EVENT_LABELS = Object.freeze({
  another_creature_enters: 'wejście innego stworzenia',
  creature_you_control_enters: 'wejście stwora pod twoją kontrolą',
  // audyt M100/E6 (Żywy Tester, azorius vs green seed 34): surowy slug
  // w LOGU zamiast etykiety (Setessan Skirmisher).
  enchantment_you_control_enters: 'wejście enchantmentu pod twoją kontrolę',
  // M146 (Steelfin Whale): „Whenever an artifact you control enters".
  artifact_you_control_enters: 'wejście artefaktu pod twoją kontrolę',
  // M146 (suspend, Mindstab): „When the last time counter is removed".
  suspend_ready: 'zdjęcie ostatniego licznika czasu',
  other_creature_you_control_dies: 'śmierć kontrolowanego stwora',
  any_combat_damage_to_player: 'obrażenia bojowe zadane graczowi',
  any_creature_dies: 'śmierć stworzenia',
  attacks: 'atak',
  attacks_alone: 'samotny atak',
  aura_host_targeted_by_spell: 'gospodarz aury celem czaru',
  spell_targets_this_creature: 'twoja karta celuje w to stworzenie',
  bat_attacks: 'atak nietoperza',
  beginning_of_combat: 'początek walki',
  card_put_into_graveyard_from_nonbattlefield: 'karta do grobu spoza pola bitwy',
  combat_damage_to_player: 'obrażenia bojowe graczowi',
  dies: 'śmierć stwora',
  enchanted_creature_damage_to_opponent: 'obrażenia zaczarowanego stwora',
  end_step: 'krok końca tury',
  enter_battlefield: 'wejście na pole bitwy',
  equipped_creature_attacks: 'atak wyposażonego stwora',
  exploits: 'exploit',
  land_entered_under_opponent_control: 'wejście landa przeciwnika',
  land_entered_under_your_control: 'Landfall',
  leaves_battlefield: 'opuszczenie pola bitwy',
  mentor_attacks: 'atak mentora',
  noncombat_damage_to_opponent: 'niebojowe obrażenia przeciwnikowi',
  other_permanent_you_control_dies: 'śmierć innego twojego permanentu',
  permanents_you_control_leave_battlefield: 'odejście twoich permanentów z pola bitwy',
  player_casts_spell: 'rzucenie czaru przez gracza',
  turned_face_up: 'odkrycie twarzy',
  upkeep: 'krok upkeep',
  when_you_cast_spell: 'rzucenie czaru',
  you_cast_noncreature_spell: 'rzucenie czaru niebędącego stworem',
  you_cast_second_spell_each_turn: 'drugi czar w turze',
  saga_chapter: 'rozdział sagi',
  // M122/#3 (Żywy Tester, mechanicy vs graveyard seed 2002): w logu gracza
  // świecił surowy slug „Chronic Flooding — trigger (enchanted_permanent_tapped)".
  // Przy okazji audytu WSZYSTKICH 35 eventów triggerów w bazie znalazł się
  // drugi brak (Tiller of Flesh), którego tester jeszcze nie trafił —
  // strażnik niżej pilnuje, żeby kolejny nowy event nie wyciekł do gracza.
  // M122/#6: `delayed` nie pochodzi z karty, tylko z SILNIKA (triggers.js —
  // „exile at end of turn", reanimate). Strażnik skanujący wyłącznie
  // card-data.js go nie widział, a w logu gracza świeciło „trigger (delayed)".
  delayed: 'opóźniony trigger',
  enchanted_permanent_tapped: 'zatapnięcie zaczarowanego permanentu',
  you_cast_spell_targeting_permanent: 'rzucenie czaru celującego w permanent',
});

/**
 * M146 (uwaga właściciela): etykiety z „twoich/twój" opisują trigger z
 * PERSPEKTYWY kontrolera źródła. Gdy źródło należy do PRZECIWNIKA (np.
 * Nefarious Imp gracza-bota), „odejście twoich permanentów" myli — zamiast
 * zaimka wstawiamy nazwę gracza: „odejście permanentów (Nieprzyjaciel)".
 */
const OPPONENT_TRIGGER_LABELS = Object.freeze({
  permanents_you_control_leave_battlefield: 'odejście permanentów ({enemy}) z pola bitwy',
  other_permanent_you_control_dies: 'śmierć innego permanentu ({enemy})',
  other_creature_you_control_dies: 'śmierć kontrolowanego stwora ({enemy})',
  creature_you_control_enters: 'wejście stwora pod kontrolę ({enemy})',
  enchantment_you_control_enters: 'wejście enchantmentu pod kontrolę ({enemy})',
  artifact_you_control_enters: 'wejście artefaktu pod kontrolę ({enemy})',
});

/** Etykieta zdarzenia triggera z uwzględnieniem KONTROLERA źródła. */
export function triggerEventLabel(event, sourceController) {
  const base = TRIGGER_EVENT_LABELS[event] ?? event;
  if (sourceController == null || sourceController === HUMAN_ID) return base;
  const enemy = PLAYER_NAMES[sourceController] ?? 'przeciwnik';
  const template = OPPONENT_TRIGGER_LABELS[event];
  return template ? template.replace('{enemy}', enemy) : base;
}

/**
 * Polskie nazwy stref (M96, audyt Żywym Testerem): modal „Rozgrywka"
 * pokazywał graczowi surowe identyfikatory z engine — „Segmented Krotiq —
 * library → hand". Reszta UI jest po polsku, więc to był przeciek techniczny.
 */
export const ZONE_LABELS = Object.freeze({
  battlefield: 'pole bitwy',
  hand: 'ręka',
  graveyard: 'cmentarz',
  exile: 'wygnanie',
  library: 'biblioteka',
  stack: 'stos',
});

/**
 * Nazwa strefy do logu. Brak strefy → „?"; nieznany identyfikator → surowa
 * wartość (odsłona błędu korzystniejsza niż dyskretna heurystyka; M100/E11:
 * docstring poprawiony — wcześniej głosił „?" także dla nieznanej strefy,
 * a kod słusznie pokazuje surowy identyfikator).
 */
export function zoneLabel(zone) {
  if (!zone) return '?';
  return ZONE_LABELS[zone] ?? zone;
}

/**
 * Polskie nazwy keywordów w logu (M96): nadanie pośpiechu (Awaken the Sleeper,
 * Cogwork Assembler) było dla gracza niewidoczne — stwór bota nagle atakował
 * w turze wejścia bez śladu w modalu „Rozgrywka".
 * Osobny słownik od render.js: render.js importuje z tego modułu, więc
 * zależność w drugą stronę utworzyłaby cykl (build.mjs by go nie skleił).
 */
const KEYWORD_EVENT_LABELS = Object.freeze({
  haste: 'pośpiech', flying: 'latanie', trample: 'zadeptywanie', reach: 'zasięg',
  vigilance: 'czujność', menace: 'postrach', lifelink: 'dotykanie życia',
  deathtouch: 'dotykanie śmierci', first_strike: 'pierwsze uderzenie',
  double_strike: 'podwójne uderzenie', hexproof: 'hexproof', indestructible: 'niezniszczalność',
  defender: 'obrońca', flash: 'flash', infect: 'infect', persist: 'persist',
  saddled: 'osiodłanie', exalted: 'egzaltacja',
});

/**
 * M101/C (zgłoszenie właściciela 2026-08-15): komunikaty o CZŁOWIEKU muszą być
 * w 2. osobie — „Dobierasz: Idyllic Grange", nie „Ty dobiera: Idyllic Grange".
 *
 * Root cause: wszystkie ~124 opisy w `describeGameEvent` powstają wzorcem
 * `${whoN(playerId)} <czasownik w 3. osobie>`, bo jeden szablon obsługuje
 * obu graczy. Dla przeciwnika 3. osoba jest poprawna („Nieprzyjaciel dobiera"),
 * dla gracza — nie. Zamiast rozsypywać warunek po 124 gałęziach `switch`,
 * odmieniamy w JEDNYM miejscu: wyjście opisu przechodzi przez tę warstwę,
 * która dla podmiotu „Ty" stawia czasownik w 2. osobie i opuszcza podmiot
 * (po polsku zaimek jest wtedy zbędny).
 *
 * Mapa pokrywa czasowniki faktycznie używane w opisach; nieznany czasownik
 * zostawiamy nietknięty (lepiej stara forma niż zepsuty tekst), a test
 * `panel-odmiana-drugiej-osoby` pilnuje, żeby żaden nie umknął.
 */
const DRUGA_OSOBA = Object.freeze({
  aktywuje: 'aktywujesz', bierze: 'bierzesz', dobiera: 'dobierasz',
  kieruje: 'kierujesz', kopiuje: 'kopiujesz', korzysta: 'korzystasz',
  kładzie: 'kładziesz', kończy: 'kończysz', mieli: 'mielisz',
  mulliganuje: 'mulliganujesz', może: 'możesz', niszczy: 'niszczysz',
  obejmuje: 'obejmujesz', odkłada: 'odkładasz', odrzuca: 'odrzucasz',
  odsłania: 'odsłaniasz', ogląda: 'oglądasz', otrzymuje: 'otrzymujesz',
  patrzy: 'patrzysz', plotuje: 'plotujesz', poddaje: 'poddajesz',
  poświęca: 'poświęcasz', przegrywa: 'przegrywasz', przeszukuje: 'przeszukujesz',
  przygotowuje: 'przygotowujesz', płaci: 'płacisz', rezygnuje: 'rezygnujesz',
  rozdziela: 'rozdzielasz', rozstrzyga: 'rozstrzygasz', rzuca: 'rzucasz',
  szuka: 'szukasz', tworzy: 'tworzysz', układa: 'układasz', używa: 'używasz',
  wskazuje: 'wskazujesz', wybiera: 'wybierasz', wygrywa: 'wygrywasz',
  wykonuje: 'wykonujesz',
  wzmacnia: 'wzmacniasz', zagłębia: 'zagłębiasz', zagrywa: 'zagrywasz',
  zatrzymuje: 'zatrzymujesz', znajduje: 'znajdujesz', zostawia: 'zostawiasz',
  zwiększa: 'zwiększasz',
});

const wielkaLitera = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Odmienia zdania o graczu na 2. osobę (patrz DRUGA_OSOBA). */
export function odmienNaDrugaOsobe(text, humanName = PLAYER_NAMES[HUMAN_ID]) {
  if (typeof text !== 'string' || !text.includes(humanName)) return text;
  const wzorzec = new RegExp(`(^|[^\\p{L}])${humanName} (nie )?(\\p{L}+)`, 'u');
  return text.replace(wzorzec, (dopasowanie, przed, negacja, czasownik) => {
    const odmieniony = DRUGA_OSOBA[czasownik];
    if (!odmieniony) return dopasowanie;
    // Podmiot znika; jeśli zdanie zaczynało się od „Ty", czasownik (albo
    // „nie") przejmuje wielką literę.
    const naPoczatku = przed === '';
    const reszta = negacja ? `${negacja}${odmieniony}` : odmieniony;
    return `${przed}${naPoczatku ? wielkaLitera(reszta) : reszta}`;
  });
}

export function describeGameEvent(e, helpers, names = PLAYER_NAMES) {
  const opis = describeGameEventRaw(e, helpers, names);
  return typeof opis === 'string' ? odmienNaDrugaOsobe(opis, names[HUMAN_ID]) : opis;
}

function describeGameEventRaw(e, helpers, names = PLAYER_NAMES) {
  const { nameOf, nameOfObject } = helpers;
  // Rozpoznanie „cel to gracz" — sesja przekazuje isPlayer (lookup state),
  // a testy mogą polegać na mapie imion (oba stołowe słowniki mapują p1/p2).
  const isPlayer = helpers.isPlayer ?? ((id) => names[id] != null);
  const whoN = (id) => names[id] ?? id;
  // M100 (BUG A — zgłoszenie właściciela 2026-08-15; FoW, CR 708.2): fixy
  // M66/M74 („LKI cardId zamiast ?") nazywały po cardId nawet obiekty WCIĄŻ
  // leżące zakryte na stole („Nieprzyjaciel zagrywa Segmented Krotiq twarzą
  // w dół", „atakuje mnie zakryta kreatura Segmented Krotiq"). Pierwszeństwo
  // ma ŻYWY obiekt — face-down ⇒ „morph"; LKI cardId wolno użyć dopiero, gdy
  // obiekt zniknął ze stanu (zmiana strefy odsłania morpha — CR 708.8/708.9
  // — dlatego „Segmented Krotiq ginie" po śmierci jest poprawne).
  const objectOrLki = (objectId, cardId) => {
    if (objectId != null) {
      const live = nameOfObject(objectId);
      if (live !== '?') return live;
    }
    if (cardId != null) return nameOf(cardId);
    return '?';
  };
    switch (e.type) {
      // Zdarzenia techniczne/ulotne — zbyt gadatliwe dla logu stołu.
      case 'priority_passed':
      case 'mana_changed':
      case 'object_tapped':
      case 'object_untapped':
      case 'damage_marked':
      case 'game_created':
        return null;
      case 'object_moved': {
        if (e.bounced) {
          const whoOwner = e.object?.controllerId ? whoN(e.object.controllerId) : 'właściciela';
          return `${nameOf(e.object?.cardId)} wraca do ręki (${whoOwner})`;
        }
        // M103/D (zgłoszenie właściciela): wygnanie kart za koszt Escape było
        // w logu niewidzialne (zwykłe zmiany stref log celowo pomija, ale to
        // jest PŁATNOŚĆ KOSZTU — jak mana, która jest widoczna). Log nazywa
        // koszt, modal „Rozgrywka" pokazuje go jak dotąd (strefy).
        if (e.escape) {
          return `${nameOf(e.object?.cardId)} zostaje wygnane (koszt Escape)`;
        }
        return null;
      }
      case 'command_rejected': return `Odrzucono: ${e.reason ?? 'nielegalna komenda'}`;
      case 'cant_block_granted': return `${nameOfObject(e.objectId)} nie może blokować do końca tury`;
      case 'spell_countered': return `${nameOf(e.cardId)} zostaje skontrowany${e.counteredByCardId ? ` (${nameOf(e.counteredByCardId)})` : (e.counteredBy ? ` (${nameOfObject(e.counteredBy)})` : '')}`;
      case 'sacrifice_choice_required': return `${whoN(e.playerId)} wskazuje stwora do poświęcenia`;
      case 'food_choice_required': return `${whoN(e.playerId)} rozstrzyga: poświęcić Food na +3 życia?`;
      case 'food_choice_resolved': return e.auto
        ? null
        : (e.sacrificed
          ? `${whoN(e.playerId)} poświęca Food i zdobywa 3 życia`
          : `${whoN(e.playerId)} nie poświęca Food`);
      case 'amass_choice_required': return `${whoN(e.playerId)} rozstrzyga: która Armia dostaje ${e.amount}/+${e.amount}?`;
      case 'amass_choice_resolved': return `${whoN(e.playerId)} wzmacnia Armię o ${e.amount} (amass)`;
      case 'discover_started': {
        const hits = e.foundCardId ? ` — trafiono ${nameOf(e.foundCardId)}` : '';
        return `${whoN(e.playerId)} wykonuje discover (${e.amount})${hits}`;
      }
      case 'discover_resolved': return e.foundCardId
        ? `${nameOf(e.foundCardId)} — discover${e.castFree ? ' (rzut za darmo)' : ''}`
        : null;
      case 'explore_choice_required': return `${whoN(e.playerId)} rozstrzyga explore — ${nameOf(e.cardId)} na wierzchu biblioteki`;
      case 'explore_resolved': {
        if (e.isLand) return `Explore: ${nameOf(e.foundCardId)} trafia do ręki`;
        if (e.putInGraveyard) return `Explore: ${nameOf(e.foundCardId)} trafia do grobu (+1/+1 na stworze)`;
        if (e.found === false) return 'Explore: wierzch biblioteki nie jest lądem — +1/+1 na stworze';
        return `Explore: ${nameOf(e.foundCardId)} zostaje na wierzchu (+1/+1 na stworze)`;
      }
      case 'craft_exile_required': return `${whoN(e.playerId)} wybiera karty do craftu (${nameOfObject(e.sourceId)})`;
      case 'step_advanced': return `— ${e.phase}/${e.step} —`;
      case 'turn_started': return `Tura gracza ${whoN(e.playerId)}`;
      case 'card_drawn': {
        if (e.object?.cardId && e.playerId === HUMAN_ID) {
          return `${whoN(e.playerId)} dobiera: ${nameOf(e.object.cardId)}`;
        }
        if (e.object?.cardId && e.playerId === BOT_ID) {
          // FoW: nie pokazujemy nazwy dobranej karty przeciwnika
          return `${whoN(e.playerId)} dobiera kartę`;
        }
        return `${whoN(e.playerId)} dobiera kartę`;
      }
      case 'land_played': return `${whoN(e.playerId)} zagrywa ${nameOf(e.object?.cardId)}${e.entersTapped ? ' (wchodzi zatapnięty)' : ''}`;
      case 'mana_produced': return `${whoN(e.playerId)} przygotowuje manę (${nameOfObject(e.source)})`;
      case 'permanent_cast': {
        // M100 (BUG A): face-down rzut PRZECIWNIKA jest bezimienny (CR 708.2)
        // — własny morph znamy (rzucający widzi swoją kartę, CR 708.6).
        if (e.faceDown) {
          // M127: etykieta z jednego źródła (FACE_DOWN_LABEL) — pisownia
          // mechaniki jest wspólna dla logu, kafli i wizardów.
          const shown = e.playerId === HUMAN_ID ? nameOf(e.object?.cardId) : FACE_DOWN_LABEL;
          return `${whoN(e.playerId)} zagrywa ${shown} twarzą w dół (2/2)`;
        }
        // Phyrexian mana (Batch 11): symbole {W/P} opłacone maną albo 2 życiem.
        const paidWithLife = e.phyrexianPaidWithLife ?? 0;
        const phyrexian = e.phyrexianSymbols
          ? ` — phyrexian: ${paidWithLife > 0 ? `${paidWithLife}× po 2 życia` : 'za manę'}`
          : '';
        return `${whoN(e.playerId)} zagrywa ${nameOf(e.object?.cardId)}${phyrexian}`;
      }
      case 'spell_cast': {
        // M73d (C): cel-gracz (Inspiration/Sweet Oblivion) — imię zamiast „?"
        // (nameOfObject helpersów nie zna graczy; audyt żywym testerem).
        // Diament (2026-08-11): cele niosą LKI (targetCardIds) — cel, który
        // zniknął z state.objects (token/śmierć), nie wyświetla się jako „?"
        // (audyt: „Bone Splinters → cel: ?"). Gracze (bez cardId) po imieniu.
        const targets = (e.targets ?? []).map((id, i) => {
          if (isPlayer(id)) return whoN(id);
          // M100 (BUG A): LKI dopiero, gdy cel zniknął ze stanu (objectOrLki).
          return objectOrLki(id, e.targetCardIds?.[i]);
        }).join(', ');
        const plotted = e.plotted ? ' z exile po plot' : '';
        const cleaved = e.cleaved ? ' z kosztem Cleave' : '';
        const adventure = e.adventure ? ' (przygoda)' : '';
        // M91 (uwaga D): czar modalny („Choose one" — Ruinous Rampage) bez
        // nazwy trybu był w logu bezużyteczny: gracz nie wiedział, czy dostanie
        // 3 obrażenia, czy straci artefakty.
        const mode = e.modeName ? ` — tryb: ${e.modeName}` : '';
        return `${whoN(e.playerId)} rzuca ${nameOf(e.cardId)}${mode}${plotted}${cleaved}${adventure}${targets ? ` → cel: ${targets}` : ''}`;
      }
      case 'spell_resolved': {
        // M102/U6 (CR 708.2): zakryty permanent PRZECIWNIKA zostaje bezimienny
        // — inaczej log zdradzał kartę tuż pod zamaskowanym „morph wchodzi na
        // pole bitwy". Własny morph nazywamy (kontroler zna kartę — CR 708.6),
        // dokładnie jak w gałęzi `permanent_cast`.
        if (e.faceDown) {
          const own = e.controllerId === HUMAN_ID;
          const shown = own ? nameOf(e.cardId) : FACE_DOWN_LABEL;
          return `${shown} zostaje rozstrzygnięty (twarzą w dół)`;
        }
        const clashReturn = e.returnToHand ? ' — wygrany clash zwraca czar do ręki właściciela' : '';
        const adventureReturn = e.adventure ? ' — przygoda rozstrzygnięta, karta czeka w exile (można rzucić stwora)' : '';
        // M91 (uwaga D): rozstrzygnięcie czaru modalnego nazywa wybrany tryb.
        const modeName = e.modeName ? ` — tryb: ${e.modeName}` : '';
        return `${nameOf(e.cardId)}${modeName} zostaje rozstrzygnięty${e.fizzled ? ' (cel nielegalny — bez efektu)' : ''}${clashReturn}${adventureReturn}`;
      }
      case 'aura_spell_cast': {
        const targets = (e.targets ?? []).map((id) => (isPlayer(id) ? whoN(id) : nameOfObject(id))).join(', ');
        // M100/E10 (P6 — Żywy Tester h08): „za koszt bestow" tylko dla
        // prawdziwego bestow (karta-stwór rzucona jako aura). Czysta aura —
        // także curse na gracza — to zwykły rzut („Curse of the Pierced
        // Heart za koszt bestow" było błędem).
        const asBestow = e.bestow ? ' za koszt bestow' : '';
        return `${whoN(e.playerId)} rzuca ${nameOf(e.cardId)}${asBestow} → cel: ${targets}`;
      }
      case 'permanent_entered_battlefield': {
        // M100 (BUG A): zakryty permanent wchodzący na pole bitwy jest
        // bezimienny dla przeciwnika — „morph wchodzi na pole bitwy".
        const entered = objectOrLki(e.objectId, e.cardId);
        if (e.unattached) return `${entered} wchodzi na pole bitwy jako stwór (cel bestow nielegalny przy rozstrzygnięciu)`;
        return `${entered} wchodzi na pole bitwy`;
      }
      case 'object_attached': {
        // M73d/Gold: hostCardId niesie LKI — objectId hosta mógł się zmienić
        // przy re-equip/re-attach i nameOfObject(hostId) zwracał „?".
        const hostName = objectOrLki(e.hostId, e.hostCardId);
        if (e.via === 'equip') return `${nameOf(e.cardId)} wyposaża ${hostName}`;
        if (e.via === 'aura') return `${nameOf(e.cardId)} zaczarowuje ${hostName}`;
        // M102/U2: job select („stwórz token 1/1 Hero i przypnij ten
        // ekwipunek") to NIE bestow — gałąź domyślna kłamała o mechanice.
        if (e.via === 'job_select') return `${nameOf(e.cardId)} wyposaża ${hostName} (job select)`;
        return `${nameOf(e.cardId)} zostaje załączony do ${hostName} (bestow)`;
      }
      case 'object_detached': return e.becameKind === 'creature'
        ? `${nameOf(e.cardId)} odłącza się i znów jest stworem`
        : `${nameOf(e.cardId)} odłącza się i zostaje na polu bitwy`;
      case 'stats_modified': {
        // M146 (audyt Żywym Testerem): zdarzenie niesie RÓŻNE warianty skutku
        // (lock_untap, skipsNextUntap, base PT, copy) — opis bez modyfikatorów
        // renderował „dostaje undefined/undefined". Każdy wariant ma własny,
        // czytelny komunikat (L6: zdarzenie musi nieść to, czego opis nie
        // odtworzy; L24: skutek bez sensownego opisu jest dla gracza szumem).
        if (e.untapLocked) {
          const src = e.sourceId ? nameOfObject(e.sourceId) : 'źródło';
          return `${nameOfObject(e.objectId)} nie odkręca się, dopóki ${src} jest na polu bitwy i zatapnięte`;
        }
        if (e.skipsNextUntap) return `${nameOfObject(e.objectId)} nie odkręca się w następnym kroku odkręcania`;
        if (e.basePower != null || e.baseToughness != null) {
          return `${nameOfObject(e.objectId)} staje się ${e.basePower ?? '?'}/${e.baseToughness ?? '?'} do końca tury`;
        }
        if (e.copy) return `${nameOfObject(e.objectId)} kopiuje cechy celu`;
        const sign = (v) => (v >= 0 ? `+${v}` : `${v}`);
        return `${nameOfObject(e.objectId)} dostaje ${sign(e.powerModifier)}/${sign(e.toughnessModifier)}`;
      }
      // M106/Z1: masowy buff „do końca tury" — jedyny skutek takich czarów
      // (Hysterical Blindness, Turn the Tide, Angel of the Dawn, Jyoti).
      // Bez tego opisu gracz widział wyłącznie „czar zostaje rozstrzygnięty".
      case 'mass_stats_modified': {
        // Konwencja MtG: „creatures get -4/-0" (zero po ujemnej ma minus).
        const negative = (e.powerModifier ?? 0) < 0 || (e.toughnessModifier ?? 0) < 0;
        const sign = (v) => (v > 0 ? `+${v}` : v < 0 ? `${v}` : (negative ? '-0' : '+0'));
        const count = (e.objectIds ?? []).length;
        if (count === 0) return null;
        const who = e.scope === 'opponents' ? 'stwory przeciwnika'
          : e.scope === 'your_lands' ? 'twoje stwory-lądy'
          : 'twoje stwory';
        const stats = (e.powerModifier || e.toughnessModifier)
          ? `${sign(e.powerModifier)}/${sign(e.toughnessModifier)}` : null;
        const keywords = (e.keywords ?? []).map((k) => KEYWORD_EVENT_LABELS[k] ?? k).filter(Boolean);
        const parts = [stats, keywords.length ? keywords.join(', ') : null].filter(Boolean);
        const plural = polishPlural(count, 'stwór', 'stwory', 'stworów');
        return `${who} (${count} ${plural}): ${parts.join(' i ') || 'bez zmian'} do końca tury`;
      }
      case 'attackers_declared': {
        // M66 (C): cardIds niosą LKI — po SBA obiekt atakującego może nie
        // istnieć (nowe ID w grobie) i nameOfObject zwracał „?".
        const ids = e.attackerIds ?? [];
        const cards = e.attackerCardIds ?? [];
        const names = ids.map((id, i) => objectOrLki(id, cards[i]));
        return names.length ? `Atak: ${names.join(', ')}` : 'Brak ataku';
      }
      case 'blockers_declared': {
        // M66 (C): klucz przypisań to ATAKUJĄCY (wcześniej render mylił go
        // z blokerem); nazwy z mapy cards (LKI).
        const parts = Object.entries(e.assignments ?? {})
          .map(([attackerId, blockerIds]) => {
            const attackerName = objectOrLki(attackerId, e.cards?.[attackerId]);
            const blockers = blockerIds.map((id) => objectOrLki(id, e.cards?.[id]));
            const verb = blockers.length > 1 ? 'blokują' : 'blokuje';
            return `${polishList(blockers)} ${verb} ${attackerName}`;
          });
        return parts.length ? parts.join('; ') : 'Brak bloków';
      }
      case 'damage_dealt': {
        // M66 (C): cardIds niosą LKI — cel/source mógł umrzeć w SBA tego
        // samego rozstrzygnięcia (nameOfObject po starym ID dawał „?").
        const targetName = isPlayer(e.target)
          ? whoN(e.target)
          : objectOrLki(e.target, e.targetCardId);
        const sourceName = objectOrLki(e.source, e.sourceCardId);
        // M73d (E): 0 obrażeń to NIE zadane obrażenia (CR 119.3) — log nie
        // informuje „zadaje 0 obrażeń" (szum/mylące; audyt żywym testerem).
        if (e.amount <= 0) return null;
        return `${sourceName} zadaje ${dmgCount(e.amount)} (${targetName})`;
      }
      case 'damage_prevented': {
        const targetName = e.target != null && isPlayer(e.target)
          ? whoN(e.target)
          : objectOrLki(e.objectId, e.cardId);
        // Powód prewencji (audyt M84): protection / Inspire Awe / tarcza — żeby
        // gracz wiedział, DLACZEGO obrażenia nie doszły (nie tylko „zniwelowane").
        let reason = '';
        if (e.protection) reason = ' (ochrona przed kolorem)';
        else if (e.inspireAwe) reason = ' (Inspire Awe: prewencja obrażeń bojowych)';
        else if (e.shield) reason = ' (tarcza prewencji)';
        else reason = ' (prewencja)';
        return `Obrażenia (${e.amount}) do ${targetName} zapobiegnięte${reason}`;
      }
      case 'damage_fizzled': {
        // M133 (CR 608.2b): cel zniknął z pola bitwy, zanim zdolność/czar
        // się rozstrzygnął — obrażenia po prostu nie nastąpiły. Gracz musi
        // wiedzieć DLACZEGO nic się nie stało (L24: skutek bez wpisu w logu
        // wygląda jak zawieszona gra).
        const sourceName = objectOrLki(e.source, e.sourceCardId);
        return `${sourceName} — obrażenia przepadają: cel opuścił pole bitwy`;
      }
      case 'regeneration_shield_added': return `${nameOf(e.cardId)} — tarcza regeneracji (następne zniszczenie w tej turze)`;
      case 'permanent_regenerated': return `${nameOf(e.cardId)} zostaje zregenerowany — odtapowany, bez obrażeń`;
      case 'damage_shield_created': {
        const targetName = isPlayer(e.target)
          ? whoN(e.target) : nameOfObject(e.target);
        return `${nameOf(e.cardId)}: tarcza chroni ${targetName} przed ${e.remaining} kolejnymi obrażeniami`;
      }
      case 'permanent_animation_ended': return `${nameOfObject(e.objectId)} przestaje być stworzeniem (animacja źródła dobiegła końca)`;
      case 'damage_prevention_started': return `${nameOf(e.cardId)}: obrażenia zadawane ${e.filterDescription ?? 'chronionym obiektom'} będą niwelowane do końca tury`;
      case 'creature_destroyed': {
        // A/D (2026-08-11): w momencie rozstrzygnięcia walki obiekt ma NOWE id
        // w grobie (moveObjectDirectly), więc nameOfObject(fromId) zwracał „?".
        // Nazwa jedzie z cardId zdarzenia (jak permanent_destroyed w M70).
        const name = e.cardId ? nameOf(e.cardId) : nameOfObject(e.fromId);
        return `${name} ginie`;
      }
      case 'life_changed': return `${whoN(e.playerId)}: życie ${e.before} → ${e.after}`;
      case 'poison_counters_added': return `${whoN(e.playerId)} otrzymuje znaki trucizny (+${e.amount}, łącznie: ${e.after})`;
      case 'permanent_animated': {
        const duration = e.linkedTo ? ' (dopóki źródło jest na polu bitwy)' : ' do końca tury';
        return `${nameOfObject(e.objectId)} staje się stworzeniem ${e.power}/${e.toughness}${duration}`;
      }
      case 'player_lost': {
        const reasons = {
          life_zero: 'brak życia',
          poison_ten: '10 znaków trucizny',
          empty_library: 'pusta biblioteka',
        };
        // CR 104.4b: gdy wszyscy gracze przegrywają jednocześnie, partia kończy
        // się REMISEM — bez tego log mówił tylko „przegrywa", a gracz nie
        // wiedział, że nikt nie wygrał.
        const draw = e.draw ? ' — partia kończy się REMISEM' : '';
        return `${whoN(e.playerId)} przegrywa (${reasons[e.reason] ?? e.reason})${draw}`;
      }
      case 'player_conceded': return `${whoN(e.playerId)} poddaje partię`;
      case 'ability_activated': {
        if (e.attackerId) return `${whoN(e.playerId)} używa Ninjutsu (${nameOfObject(e.objectId)} wchodzi zamiast ${nameOfObject(e.attackerId)})`;
        if (e.cycling) return `${whoN(e.playerId)} aktywuje cycling: ${nameOf(e.cardId)}`;
        if (e.keyword === 'equip') {
          const targets = (e.targets ?? []).map((id) => nameOfObject(id)).join(', ');
          // M100/E13 (zgłoszenie A): „wyposaża: X → Y" wyglądało jak SKUTEK,
          // a to dopiero intencja (zdolność na stosie) — skutek opisuje linia
          // object_attached. Nazwa zdolności (Equip) usuwa też niejasność
          // „co się rozstrzyga".
          return `${whoN(e.playerId)} aktywuje Equip: ${nameOfObject(e.objectId)} → cel: ${targets}`;
        }
        const targets = (e.targets ?? []).map((id) => nameOfObject(id)).join(', ');
        const xPart = e.xValue != null ? ` (X=${e.xValue})` : '';
        // Crew (CR 701.36): zatapnione stwory w logu.
        const crewPart = (e.crewCreatureIds ?? []).length
          ? ` — załoga: ${e.crewCreatureIds.map((id) => nameOfObject(id)).join(', ')}`
          : '';
        // Źródło mogło zniknąć w koszcie (Sacrifice this) — nazwa jedzie
        // wtedy z e.cardId, nie z lookupu po id obiektu (naprawione „?\" w logu).
        const sourceName = e.cardId ? nameOf(e.cardId) : nameOfObject(e.objectId);
        const desc = (e.effectTypes ?? [])
          .map((type) => ABILITY_EFFECT_LABELS[type])
          .filter(Boolean)
          .join(', ');
        // M150/C2: zdolność dodająca manę (Jeskai Devotee „{1}: Add {U}, {R},
        // or {W}\") loguje też, JAKĄ manę produkuje — „dodanie many do puli
        // ({U}, {R}, {W})” zamiast milczeć o kolorze (uwaga właściciela).
        const manaPart = (e.manaColors?.length)
          ? ` (${e.manaColors.map((color) => `{${color}}`).join(', ')})`
          : '';
        // M153/A1: Station — nazwa zatapianego INNEGO stwora (koszt
        // tapOtherCreature), albo Morph, gdy zakryty (CR 708.2).
        const stationPart = e.stationTappedCreatureId
          ? ` (tapuje: ${nameOfObject(e.stationTappedCreatureId)})`
          : '';
        return `${whoN(e.playerId)} aktywuje zdolność: ${sourceName}${desc ? ` — ${desc}` : ''}${manaPart}${xPart}${targets ? ` → cel: ${targets}` : ''}${crewPart}${stationPart}`;
      }
      // D (2026-08-11): zdolność aktywowana rozstrzygnięta ze stosu.
      case 'ability_resolved': {
        const srcName = e.cardId ? nameOf(e.cardId) : nameOfObject(e.sourceId);
        // M100/E13 (zgłoszenie A): rozstrzygnięcie equipa z sukcesem kończy
        // się przepięciem sprzętu — to opisuje linia object_attached
        // („X wyposaża Y"). Bez tej gałęzi JEDNA aktywacja dawała TRZY
        // podobne linie („wydaje się zdublowane" — cytat), z których środkowa
        // nie mówiła, co się rozstrzyga. Fizzle zostaje — attach wtedy nie
        // następuje (CR 608.2b).
        if (e.keyword === 'equip') {
          if (!e.fizzled) return null;
          return `${whoN(e.playerId)}: zdolność Equip ${srcName} rozstrzygnięta bez efektu (cel nielegalny — sprzęt zostaje odłączony)`;
        }
        const kw = e.keyword ? (KEYWORD_EVENT_LABELS[e.keyword] ?? e.keyword) : null;
        // M102/U10 (Żywy Tester, innistrad vs wiedzmin): zdolność, która
        // straciła wszystkie cele, fizzluje (CR 608.2b) — silnik oznacza to
        // `fizzled: true`, ale czytelnik honorował tę flagę TYLKO dla equipa.
        // Log meldował fizzle identycznie jak sukces („zdolność rozstrzygnięta"),
        // więc trzy aktywacje Barkform Harvester w ten sam cel dały jeden
        // skutek i żadnego wyjaśnienia. Nazywamy to wprost — jak przy czarach
        // („(cel nielegalny — bez efektu)").
        if (e.fizzled) {
          const why = e.reason === 'no_legal_targets'
            ? 'cel nielegalny' : 'brak legalnych celów';
          return `${whoN(e.playerId)}: zdolność ${kw ? `${kw} ` : ''}${srcName} rozstrzygnięta bez efektu (${why})`;
        }
        return `${whoN(e.playerId)}: zdolność ${kw ? `${kw} ` : ''}${srcName} rozstrzygnięta`;
      }
      case 'ability_triggered': {
        // Wybór celu już opisuje trigger_target_required — nie dubluj.
        if (e.awaitingTarget) return null;
        if (e.backup) return `${nameOf(e.cardId)} — trigger Backup: kontroler wskazuje stwora na liczniki`;
        // M124 (zgłoszenie właściciela: „Chronic Flooding — trigger
        // (enchanted_permanent_tapped)"). M122 dodało etykietę i strażnika na
        // KOMPLETNOŚĆ mapy, ale ten `case` ma TRZY ścieżki renderu i tylko
        // ostatnia mapowała slug — dwie wcześniejsze wstawiały `e.trigger`
        // wprost. Strażnik sprawdzał słownik, nie miejsca użycia, więc luka
        // przeszła (dokładnie ten sam wzorzec co L30: jedno zabezpieczenie,
        // wiele ścieżek). Etykietę liczymy RAZ i używamy wszędzie.
        const sourceCtrl = e.playerId ?? e.controllerId
          ?? helpers.controllerOf?.(e.objectId ?? e.sourceId) ?? null;
        const triggerLabel = triggerEventLabel(e.trigger, sourceCtrl);
        if (e.sacrificed) return `${nameOf(e.cardId)} — trigger (${triggerLabel}): brak zapłaty, permanent poświęcony`;
        if (e.paid != null) return `${nameOfObject(e.objectId)} — trigger (${triggerLabel}): zapłacono {${e.paid}}${e.autoTapped ? ` (auto-tap: ${nameOfObject(e.autoTapped)})` : ''}`;
        const src = e.cardId ? nameOf(e.cardId) : nameOfObject(e.objectId);
        return `${src} — trigger (${triggerLabel})`;
      }
      case 'land_type_changed': return `${nameOfObject(e.objectId)} staje się typem ${e.subtype} do końca tury`;
      case 'control_changed': return `${nameOf(e.cardId)} przechodzi pod kontrolę gracza ${whoN(e.controllerId)}`;
      case 'object_exiled': return `${nameOf(e.cardId)} zostaje wygnany${e.delayed ? ' (opóźniony trigger)' : ''}`;
      case 'permanent_sacrificed': return `${nameOf(e.cardId)} zostaje poświęcony`;
      // Uwagi właściciela A (2026-08-10): fromId NIE istnieje już w objects
      // (śmierć = nowy obiekt w grobie/exile) — nazwa jedzie z cardId
      // zdarzenia, inaczej log pokazywał „? zostaje zniszczony".
      case 'permanent_destroyed': {
        const name = e.cardId ? nameOf(e.cardId) : nameOfObject(e.fromId);
        const exileSuffix = e.toZone === 'exile' ? ' — odchodzi do wygnania (licznik finality)' : '';
        return `${name} zostaje zniszczony${exileSuffix}`;
      }
      // A/D: ban regeneracji (Rage of Purphoros, Expunge) — było surowe „cant_be_regenerated_set".
      case 'cant_be_regenerated_set': return `${nameOf(e.cardId)} nie może być regenerowany do końca tury`;
      // D: modalny trigger (Etherwrought Page — „At the beginning of your
      // upkeep, choose one") — było surowe „modal_trigger_required".
      case 'modal_trigger_required': return `${nameOf(e.cardId)} — wybierz tryb zdolności triggerowanej`;
      case 'modal_trigger_resolved': {
        const mode = e.modeName ? ` — tryb: ${e.modeName}` : '';
        return `${nameOf(e.cardId ?? nameOfObject(e.sourceId))} — gracz ${whoN(e.playerId)} wybiera tryb${mode}`;
      }
      case 'hand_creature_choice_required': return `${whoN(e.playerId)} wybiera wielokolorowego stwora z ręki (Dragon Arch)`;
      case 'hand_creature_choice_resolved': return e.putCreature
        ? `${nameOf(e.cardId)} wchodzi na pole bitwy z ręki (Dragon Arch)`
        : `${whoN(e.playerId)} rezygnuje z położenia stwora`;
      case 'permanent_put_into_graveyard': return `${nameOf(e.cardId)} trafia do grobu (aura bez legalnego gospodarza)`;
      case 'card_discarded': return `${whoN(e.playerId)} odrzuca ${nameOf(e.cardId)}`;
      case 'card_milled': return `${whoN(e.playerId)} mieli ${nameOf(e.cardId)} do grobu`;
      case 'card_plotted': return `${whoN(e.playerId)} plotuje ${nameOf(e.cardId)} (karta trafia do exile)`;
      case 'card_suspended': return `${whoN(e.playerId)} zawiesza ${nameOf(e.cardId)} (${e.timeCounters ?? 4} liczników czasu)`;
      case 'time_counter_removed': {
        const ready = e.ready ? ' — ostatni licznik zdjęty, zdolność wyzwalana idzie na stos' : '';
        return `${whoN(e.playerId)} zdejmuje licznik czasu z ${nameOf(e.cardId)} (zostało ${e.remaining ?? 0})${ready}`;
      }
      case 'suspend_ready_required': return `${whoN(e.playerId)}: ostatni licznik czasu zdjęty z ${nameOf(e.cardId)} — możesz rzucić ją bez kosztu many albo zostawić w wygnaniu`;
      case 'suspend_declined': return `${whoN(e.playerId)} zostawia ${nameOf(e.cardId)} w wygnaniu (koniec zawieszenia)`;
      case 'rebound_ready_required': return `${whoN(e.playerId)}: ${nameOf(e.cardId)} odbija się — możesz rzucić ją bez kosztu many albo zostawić w wygnaniu`;
      case 'rebound_declined': return `${whoN(e.playerId)} zostawia ${nameOf(e.cardId)} w wygnaniu (koniec odbicia)`;
      case 'card_revealed': return `${whoN(e.playerId)} odsłania ${nameOf(e.cardId)}`;
      case 'library_searched': return e.foundCardId
        ? `${whoN(e.playerId)} przeszukuje bibliotekę i tasuje`
        : `${whoN(e.playerId)} przeszukuje bibliotekę (bez trafienia) i tasuje`;
      case 'backup_resolved': {
        const grants = e.grantedKeywords?.length ? ` i zyskuje ${e.grantedKeywords.join(', ')} do końca tury` : '';
        return `Backup (${nameOf(e.sourceCardId)}): ${nameOfObject(e.targetId)} dostaje ${e.counters}× +1/+1${grants}`;
      }
      // M96 (audyt Żywym Testerem): nadanie keywordu było dla gracza
      // niewidoczne — stwór bota z Awaken the Sleeper / Cogwork Assembler
      // nagle atakował w turze wejścia bez śladu w logu i w modalu.
      // Wyciszamy WYŁĄCZNIE keywordy z backupu (opisuje je backup_resolved,
      // kolejna linia byłaby dubletem) — reszta trafia do gracza.
      case 'keyword_granted': {
        if (e.viaBackup) return null;
        const granted = (e.keywords ?? [])
          .map((k) => KEYWORD_EVENT_LABELS[k] ?? k)
          .filter(Boolean);
        if (granted.length === 0) return null;
        const what = objectOrLki(e.objectId, e.cardId);
        return `${what} zyskuje: ${granted.join(', ')}`;
      }
      case 'scry_started': {
        // M100/E10 (P4 — Żywy Tester h05): odmiana „1 kartę / 2 karty / 5 kart"
        // — polishPlural zamiast sztywnego „kart".
        const karty = polishPlural(e.amount, 'kartę', 'karty', 'kart');
        if (e.cardIds?.length && e.playerId === HUMAN_ID) {
          const names = e.cardIds.map((cid) => nameOf(cid)).join(', ');
          return `${whoN(e.playerId)} wykonuje scry (patrzy na ${e.amount} ${karty}: ${names})`;
        }
        return `${whoN(e.playerId)} wykonuje scry (patrzy na ${e.amount} ${karty})`;
      }
      case 'scry_resolved': {
        // M100/E4: spód/wierzch biblioteki to wiedza WŁASNA patrzącego —
        // człowiekowi pokazujemy nazwy, przeciwnikowi tylko liczby (FoW).
        if (e.playerId === HUMAN_ID && (e.bottomCardIds?.length || e.topCardIds?.length)) {
          // Filtrowanie po samych NAZWACH: puste pole danych (np. brak
          // wierzchu po decyzji „wszystko na spód") nie może zostawić
          // śmieciowego segmentu w tekście.
          const bottomNames = (e.bottomCardIds ?? []).map((cid) => nameOf(cid)).filter(Boolean);
          const topNames = (e.topCardIds ?? []).map((cid) => nameOf(cid)).filter(Boolean);
          const parts = [];
          if (bottomNames.length) parts.push(`na spód (${e.bottomCount}/${e.total}): ${bottomNames.join(', ')}`);
          if (topNames.length) parts.push(`na wierzchu: ${topNames.join(', ')}`);
          return `${whoN(e.playerId)} kończy scry — ${parts.join('; ') || 'bez zmian'}`;
        }
        return e.bottomCount > 0
          ? `${whoN(e.playerId)} kończy scry — odkłada na spód biblioteki (${e.bottomCount}/${e.total})`
          : `${whoN(e.playerId)} kończy scry — zostawia na wierzchu biblioteki`;
      }
      case 'surveil_started': {
        // M100/E10 (P4): jak przy scry — odmiana (było „patrzy na 2 kart",
        // a dla 1 nawet „patrzy na 1 kart").
        const karty = polishPlural(e.amount, 'kartę', 'karty', 'kart');
        if (e.cardIds?.length && e.playerId === HUMAN_ID) {
          const names = e.cardIds.map((cid) => nameOf(cid)).join(', ');
          return `${whoN(e.playerId)} wykonuje surveil (patrzy na ${e.amount} ${karty}: ${names})`;
        }
        return `${whoN(e.playerId)} wykonuje surveil (patrzy na ${e.amount} ${karty})`;
      }
      // M126/#7 (Żywy Tester): warunek `=== 1 ? 'karta idzie' : 'karty idą'`
      // rozróżniał tylko jedynkę, więc 0 i 5 dawały „0 karty idą do grobu"
      // (podwójny błąd: odmiana rzeczownika I czasownika). `polishPlural`
      // istniał już w tym pliku — po prostu nie został tu użyty (L: skoro
      // helper istnieje, to każdy licznik w logu ma przez niego przechodzić).
      case 'surveil_resolved': {
        const n = e.milledCount ?? 0;
        const noun = polishPlural(n, 'karta', 'karty', 'kart');
        // Czasownik idzie ZA tą samą regułą co rzeczownik: „1 karta idzie",
        // „2/3/4 karty idą", ale „0 kart / 5 kart / 12 kart IDZIE" (dopełniacz
        // liczby mnogiej łączy się z czasownikiem w liczbie pojedynczej).
        const verb = polishPlural(n, 'idzie', 'idą', 'idzie');
        return `${whoN(e.playerId)} kończy surveil — ${n} ${noun} ${verb} do grobu`;
      }
      case 'index_started': {
        if (e.cardIds?.length && e.playerId === HUMAN_ID) {
          const names = e.cardIds.map((cid) => nameOf(cid)).join(', ');
          return `${whoN(e.playerId)} wykonuje Index (patrzy na ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')}: ${names})`;
        }
        return `${whoN(e.playerId)} wykonuje Index (patrzy na ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')})`;
      }
      case 'index_resolved': {
        // M100/E4: ustalona kolejność to wiedza własna patrzącego.
        if (e.playerId === HUMAN_ID && e.orderCardIds?.length) {
          return `${whoN(e.playerId)} kończy Index — kolejność na wierzchu (od góry): ${e.orderCardIds.map((cid) => nameOf(cid)).join(', ')}`;
        }
        return `${whoN(e.playerId)} kończy Index — przestawia karty na wierzchu biblioteki`;
      }
      case 'look_top_started': {
        if (e.cardIds?.length && e.playerId === HUMAN_ID) {
          const names = e.cardIds.map((cid) => nameOf(cid)).join(', ');
          return `${whoN(e.playerId)} patrzy na ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')} z wierzchu biblioteki (${names})`;
        }
        return `${whoN(e.playerId)} patrzy na ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')} z wierzchu biblioteki`;
      }
      case 'look_top_resolved': {
        // M100/E4: wzięta karta to wiedza własna; reszta do grobu opisują
        // jawne zdarzenia przeniesienia (grób publiczny).
        const pickName = (e.playerId === HUMAN_ID && e.pickCardId) ? nameOf(e.pickCardId) : 'kartę';
        return `${whoN(e.playerId)} bierze ${pickName} z wierzchu do ręki (reszta do grobu)`;
      }
      case 'satyr_look_started': {
        if (e.cardIds?.length && e.playerId === HUMAN_ID) {
          const names = e.cardIds.map((cid) => nameOf(cid)).join(', ');
          return `${whoN(e.playerId)} odsłania ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')} z wierzchu biblioteki (${names}) — może wziąć ląd do ręki`;
        }
        return `${whoN(e.playerId)} odsłania ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')} z wierzchu biblioteki — może wziąć ląd do ręki`;
      }
      case 'satyr_look_resolved': {
        const pickName = (e.pickId != null && e.playerId === HUMAN_ID && e.pickCardId) ? nameOf(e.pickCardId) : 'żadnego lądu';
        return `${whoN(e.playerId)} bierze ${pickName} z wierzchu do ręki (reszta do grobu)`;
      }
      // M100/E4: karty Epic Experiment lecą na ODKRYTY exile (publiczne) —
      // nazwy dla obu graczy.
      case 'epic_experiment_started': {
        const exiled = (e.cardIds ?? []).map((cid) => nameOf(cid)).join(', ');
        return `${whoN(e.playerId)} wykonuje Epic Experiment — wygnano ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')} z wierzchu biblioteki${exiled ? `: ${exiled}` : ''}`;
      }
      case 'epic_experiment_resolved': return `${whoN(e.playerId)} kończy Epic Experiment (${e.restToGrave} ${polishPlural(e.restToGrave, 'karta', 'karty', 'kart')} do grobu)`;
      case 'initiative_taken': {
        const first = e.firstTime ? ' — obejmuje ją po raz pierwszy i zagłębia się w Podziemia' : '';
        return `${whoN(e.playerId)} obejmuje inicjatywę${first}`;
      }
      case 'ventured_into_undercity': return `${whoN(e.playerId)} zagłębia się w Podziemiach (pokój ${e.room}/${e.total}: ${e.roomName})`;
      case 'clash_resolved': {
        const mine = e.myManaValue ?? '—';
        const theirs = e.opponentManaValue ?? '—';
        return `Clash: ${whoN(e.playerId)} ${e.won ? 'wygrywa' : 'przegrywa'} (mana value ${mine} vs ${theirs})`;
      }
      case 'clash_choice_resolved': return `${whoN(e.playerId)} ${e.putOnBottom ? 'odkłada odsłoniętą kartę na spód' : 'zostawia odsłoniętą kartę na wierzchu'} biblioteki`;
      case 'object_goaded': return `${nameOfObject(e.objectId)} jest sprowokowany (goad) — musi atakować do końca tury`;
      case 'hexproof_granted': return `${nameOfObject(e.objectId)} dostaje hexproof do początku następnej tury kontrolera`;
      case 'room_target_required': return `${whoN(e.playerId)} wybiera cel pokoju ${e.roomName}`;
      case 'room_target_resolved': {
        if (e.kind === 'player') return `${whoN(e.playerId)} wskazuje gracza ${whoN(e.targetId)} (pokój ${e.roomName})`;
        const what = e.cardId ? nameOf(e.cardId) : nameOfObject(e.targetId);
        return `${whoN(e.playerId)} wskazuje ${what} (pokój ${e.roomName})`;
      }
      case 'object_transformed': return `${nameOf(e.fromCardId)} przemienia się w ${nameOf(e.cardId)}`;
      case 'legend_rule_choice_started': return `Prawo legend: ${whoN(e.playerId)} wybiera, który permanent „${e.name}” zostaje na polu bitwy (pozostałe idą do grobu)`;
      case 'legend_rule_resolved': {
        const buried = (e.buriedCardIds ?? []).map((cid) => nameOf(cid)).join(', ');
        return `Prawo legend: zostaje ${nameOfObject(e.keepId)}${buried ? `, do grobu: ${buried}` : ''}`;
      }
      case 'token_created': {
        const who = whoN(e.controllerId);
        const verb = who === 'Ty' ? 'tworzysz' : 'tworzy';
        // Token niestworowy (Treasure/Clue/Food): bez „(null/null)" —
        // detektor Żywego Testera (audyt M100/E6, azorius vs black seed 42).
        const pt = (e.power != null && e.toughness != null) ? ` (${e.power}/${e.toughness})` : '';
        return `${who} ${verb} token ${e.name}${pt}`;
      }
      case 'token_ceased_to_exist': {
        // CR 111.7: token poza polem bitwy przestaje istnieć. Gracz musi
        // wiedzieć, czemu token zniknął z grobu/wygnania zamiast tam leżeć.
        const zoneName = { graveyard: 'grobu', exile: 'wygnania', hand: 'ręki', library: 'biblioteki' }[e.zone] ?? e.zone;
        return `token ${e.name} przestaje istnieć (trafił do ${zoneName} — token istnieje tylko na polu bitwy)`;
      }
      case 'shield_consumed': return `${nameOfObject(e.objectId)} zużywa tarczę (shield)`;
      // M119/Z1 (audyt żywym testerem): odmiana liczby mnogiej. Log pokazywał
      // graczowi „dostaje +2 licznik +1/+1” i „traci 2 licznik stun” —
      // `polishPlural` istniał w tym pliku (obrażenia, karty), ale liczniki
      // go nie używały.
      case 'counter_added':
        return `${objectOrLki(e.objectId, e.cardId)} dostaje +${e.amount} ${polishPlural(e.amount, 'licznik', 'liczniki', 'liczników')} ${e.counter} (razem ${e.total})`;
      case 'counter_removed': {
        if (e.annihilated || e.counter === 'mixed') {
          return `${objectOrLki(e.objectId, e.cardId)}: anihilacja ${e.amount} par liczników +1/+1 i −1/−1`;
        }
        return `${objectOrLki(e.objectId, e.cardId)} traci ${e.amount} ${polishPlural(e.amount, 'licznik', 'liczniki', 'liczników')} ${e.counter} (zostało ${e.total})`;
      }
      case 'station_status_changed': return e.becameCreature
        ? `${nameOfObject(e.objectId)} osiąga ${e.chargeCounters} ${polishPlural(e.chargeCounters, 'licznik', 'liczniki', 'liczników')} charge i staje się artefaktowym stworem (Station)`
        : `${nameOfObject(e.objectId)} spada poniżej progu Station i przestaje być stworem`;
      case 'saga_chapter_fired': return `${nameOf(e.cardId)} — rozdział Sagi ${['', 'I', 'II', 'III', 'IV'][e.chapter] ?? e.chapter}`;
      case 'opponents_lands_tapped': return `Landy przeciwników ${whoN(e.playerId)} zostają zatapnięte (${e.count})`;
      case 'delayed_trigger_armed': return `${nameOf(e.cardId)} — opóźniony trigger: powrót na pole bitwy w następnym upkeep gracza ${whoN(e.playerId)}`;
      case 'devour_choice_required': return `Devour (${nameOf(e.cardId)}): ${whoN(e.playerId)} może poświęcać inne swoje stwory (po ${e.counters}× +1/+1 za każdego)`;
      case 'devour_choice_resolved': {
        if (e.skipped) return `Devour (${nameOf(e.cardId)}): brak stworów do poświęcenia — decyzja gaśnie bez efektu`;
        if (e.targetCardId) {
          const counters = e.applied === false ? ' — źródło opuściło pole bitwy, bez liczników' : ` — ${e.counters}× licznik +1/+1 na źródle`;
          return `Devour (${nameOf(e.cardId)}): ${nameOf(e.targetCardId)} poświęcony${counters}${e.autoClosed ? ' (brak dalszych stworów — koniec)' : ''}`;
        }
        return `Devour (${nameOf(e.cardId)}): ${whoN(e.playerId)} kończy poświęcanie`;
      }
      case 'endure_choice_required': return `Endure (${nameOf(e.cardId)}): ${whoN(e.playerId)} wybiera — ${e.counters}× licznik +1/+1 albo token Spirit ${e.counters}/${e.counters}`;
      case 'endure_choice_resolved': return e.mode === 'token'
        ? `Endure (${nameOf(e.cardId)}): ${whoN(e.playerId)} wybiera token Spirit ${e.counters}/${e.counters}`
        : `Endure (${nameOf(e.cardId)}): ${whoN(e.playerId)} wybiera ${e.counters}× licznik +1/+1 na źródle`;
      case 'delirium_target_required': return `Delirium (${nameOf(e.cardId)}): ${whoN(e.playerId)} wybiera stwora gracza ${whoN(e.opponentId)} — zdolność zada ${dmgCount(e.amount)}`;
      case 'delirium_target_resolved': {
        if (e.noEffect) return `Delirium (${nameOf(e.cardId)}): zdolność nic nie robi (za mało typów kart w grobie albo brak celu)`;
        const deliriumTarget = objectOrLki(e.targetId, e.targetCardId);
        return `Delirium (${nameOf(e.cardId)}): ${deliriumTarget} otrzymuje ${dmgCount(e.amount)}`;
      }
      case 'mentor_target_required': return `Mentor (${nameOf(e.cardId)}): ${whoN(e.playerId)} wybiera swojego atakującego o sile mniejszej niż ${e.sourcePower} — dostanie licznik +1/+1`;
      case 'mentor_target_resolved': {
        const mentorName = e.cardId ? nameOf(e.cardId) : 'źródło bez nazwy';
        if (e.noEffect) return `Mentor (${mentorName}): zdolność nic nie robi (brak legalnego celu przy rozstrzyganiu)`;
        const mentorTarget = objectOrLki(e.targetId, e.targetCardId);
        return `Mentor (${mentorName}): ${mentorTarget} otrzymuje licznik +1/+1`;
      }
      case 'search_choice_required': {
        const source = e.sourceCardId ? ` (${nameOf(e.sourceCardId)})` : '';
        const dest = e.destination === 'battlefield' ? 'na pole bitwy' : 'do ręki';
        return `${whoN(e.playerId)} szuka karty w bibliotece${source} — wybiera, którą wziąć ${dest} albo rezygnuje`;
      }
      case 'search_choice_resolved': {
        // M100/E4: szukanie wg kryterium = jawny reveal (CR 701.20) — nazwa
        // znalezionej karty jest publiczna (obaj gracze).
        if (e.found) {
          const what = e.foundCardId ? nameOf(e.foundCardId) : 'kartę';
          return `${whoN(e.playerId)} znajduje ${what} i tasuje bibliotekę`;
        }
        return `${whoN(e.playerId)} rezygnuje z szukania i tasuje bibliotekę`;
      }
      case 'pay_or_sacrifice_required': return `${nameOfObject(e.sourceId)} — zapłać {${e.amount}} albo ją poświęć (wybór gracza)`;
      case 'pay_or_sacrifice_resolved': return e.paid
        ? `${whoN(e.playerId)} płaci {${e.amount}} za ${nameOfObject(e.sourceId)}`
        : `${whoN(e.playerId)} poświęca ${nameOfObject(e.sourceId)}`;
      case 'optional_pay_required': {
        const parts = [];
        if (e.payMana) parts.push(`{${e.payMana}}`);
        if (e.payLife) parts.push(`${e.payLife} życia`);
        return `${nameOf(e.cardId)} — zapłacić ${parts.join(' i ')}? (wybór gracza)`;
      }
      case 'optional_pay_resolved': return e.paid
        ? `${whoN(e.playerId)} płaci i odpala trigger`
        : `${whoN(e.playerId)} nie płaci — trigger nie odpala`;
      case 'trigger_target_required': {
        const hint = e.effectType === 'bounce_permanent'
          ? 'inny permanent do zwrotu na rękę'
          : (e.effectType === 'cant_be_blocked' ? 'stwora, który nie może być blokowany'
            : 'cel triggera');
        return `${nameOf(e.cardId)} — wybierz ${hint} (${e.allowNone ? 'można odmówić' : 'wymagany'})`;
      }
      case 'trigger_resolved': {
        // M106/Z2: powód „braku efektu" jest treścią dla gracza — inaczej
        // pusty nagłówek triggera wygląda jak zgubiona zdolność.
        if (e.noEffect) {
          const why = e.reason === 'no_targets' ? 'brak legalnych celów'
            : e.reason === 'no_result' ? 'nic się nie wydarzyło (zerowy wynik)'
            : 'warunek/cele nieaktualne';
          return `${nameOf(e.cardId)} — trigger bez efektu (${why})`;
        }
        return `${nameOf(e.cardId)} — trigger się rozstrzyga${e.delayed ? ' (opóźniony)' : ''}${e.saga ? ` (rozdział ${e.chapter})` : ''}`;
      }
      // D: cel triggera może być GRACZEM (Selhoff Occultist: „target player
      // mills") — nameOfObject dawał „?". Źródło: cardId zdarzenia, inaczej
      // lookup po sourceId (nigdy pusta nazwa przed myślnikiem).
      case 'trigger_target_resolved': {
        const src = e.cardId ? nameOf(e.cardId) : nameOfObject(e.sourceId);
        if (e.noEffect) return `${src} — cel odrzucony, trigger bez efektu`;
        const target = e.targetId == null
          ? 'nic'
          : (isPlayer(e.targetId) ? whoN(e.targetId) : nameOfObject(e.targetId));
        return `${src} — cel: ${target}`;
      }
      case 'optional_trigger_required': return `${nameOf(e.cardId)} — skorzystać z efektu „you may"? (wybór gracza)`;
      // M138/Z7 (audyt Żywym Testerem): „Nieprzyjaciel korzysta z efektu «you
      // may»” nie mówiło Z CZEGO. W partii chodziło o Soulbright Flamekin
      // (8 many z trzeciej aktywacji) — zapowiedź dużego ruchu, a gracz widział
      // zdanie bez podmiotu. Nazwa karty JEST w payloadzie (`sourceCardId`)
      // i była po prostu wyrzucana (oś 2: „wszystko poza szumem powinno tam być”).
      case 'optional_trigger_resolved': {
        const from = e.sourceCardId ? ` (${nameOf(e.sourceCardId)})` : '';
        return e.fired
          ? `${whoN(e.playerId)} korzysta z efektu „you may"${from}`
          : `${whoN(e.playerId)} rezygnuje z efektu „you may"${from}`;
      }
      case 'mulligan_choice_resolved': return e.kept
        ? `${whoN(e.playerId)} zatrzymuje rękę otwarcia`
        : `${whoN(e.playerId)} mulliganuje`;
      case 'mulligan_taken': return `${whoN(e.playerId)} bierze mulligan (${e.count}) — nowa ręka 7 kart`;
      // M119/Z2: „odłóż 5 karty” → „5 kart” (ta sama klasa co proliferate).
      case 'mulligan_bottom_required': return `${whoN(e.playerId)} — odłóż ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')} na spód biblioteki (mulligan londyński)`;
      case 'mulligan_bottom_resolved': return `${whoN(e.playerId)} odkłada karty na spód po mulliganie`;
      case 'game_started': return 'Obie ręce zatrzymane — gra się zaczyna';
      case 'moonlit_choice_required': return `${whoN(e.playerId)} — Moonlit Meditation: zastąpić tokeny kopiami zaczarowanego permanentu (${e.enchantedCardId ? nameOf(e.enchantedCardId) : ''})?`;
      case 'moonlit_choice_resolved': return e.replaced
        ? `${whoN(e.playerId)} tworzy kopie zaczarowanego permanentu`
        : `${whoN(e.playerId)} tworzy zwykłe tokeny`;
      case 'land_type_choice_required': return `${whoN(e.playerId)} wybiera podstawowy typ landa (${e.sourceCardId ? nameOf(e.sourceCardId) : 'Unstable Frontier'})`;
      case 'land_type_choice_resolved': return `${nameOfObject(e.targetId)} staje się typem ${e.landType} do końca tury`;
      // M116 (Cuombajj Witches): drugi cel wskazuje PRZECIWNIK (CR 601.2c).
      case 'opponent_target_required':
        return `${nameOf(e.cardId)}: ${whoN(e.playerId)} wskazuje drugi cel obrażeń`;
      case 'opponent_target_resolved':
        return `${nameOf(e.cardId)}: ${whoN(e.playerId)} wskazuje ${nameOfObject(e.targetId)}`;
      // M110 (storm): wybór nowych celów dla kopii (CR 702.40a/706.10c).
      case 'copy_targets_required':
        return `Storm (${nameOf(e.cardId)}): ${whoN(e.playerId)} wybiera cele dla ${(e.copyIds ?? []).length} ${polishPlural((e.copyIds ?? []).length, 'kopii', 'kopii', 'kopii')}`;
      case 'copy_targets_resolved':
        return `Storm (${nameOf(e.cardId)}): kopia celuje w ${nameOfObject(e.targetId)}`;
      // M109 (Spreading Insurrection): storm — kopie czaru na stosie.
      case 'spell_copied':
        return `Storm (${nameOf(e.cardId)}): kopia ${e.copyNumber} z ${e.totalCopies} trafia na stos`;
      // M109 (Spare from Evil): ochrona przed jakością — log nazywa zakres
      // (efekt bez zdarzenia nie istnieje dla gracza, lekcja L24).
      case 'protection_granted': {
        const source = e.sourceCardId ? ` (${nameOf(e.sourceCardId)})` : '';
        const quality = e.protection?.notSubtype
          ? `stworami innymi niż ${e.protection.notSubtype}`
          : e.protection?.subtype ? `stworami typu ${e.protection.subtype}` : 'wskazanymi źródłami';
        const count = (e.objectIds ?? []).length;
        // Odmiana liczebnika (lekcja P4 z M100): „1 stwór / 2 stwory / 5 stworów".
        const ile = `${count} ${polishPlural(count, 'stwór', 'stwory', 'stworów')}`;
        return `${whoN(e.playerId)}: ochrona przed ${quality} do końca tury${source} — ${ile}`;
      }
      // M109 (Nightsnare): odsłonięcie ręki celu — log nazywa karty, bo są
      // jawne dla obu graczy (CR 701.16a).
      case 'hand_revealed': {
        const source = e.sourceCardId ? ` (${nameOf(e.sourceCardId)})` : '';
        const cards = (e.cardNames ?? []).filter(Boolean).map((cid) => nameOf(cid)).join(', ');
        return `${whoN(e.playerId)} odsłania rękę${source}${cards ? `: ${cards}` : ''}`;
      }
      // M109 (Nightsnare): „If you don't" — wybierający rezygnuje, więc
      // właściciel ręki odrzuca dwie karty wedle własnego wyboru.
      case 'discard_choice_declined': {
        const source = e.sourceCardId ? ` (${nameOf(e.sourceCardId)})` : '';
        return e.count
          ? `${whoN(e.chooserId)} nie wskazuje karty${source} — ${whoN(e.playerId)} odrzuca ${e.count} ${polishPlural(e.count, 'kartę', 'karty', 'kart')} wedle własnego wyboru`
          : `${whoN(e.chooserId)} nie wskazuje karty${source} — nie ma czego odrzucić`;
      }
      case 'discard_choice_required': {
        const source = e.sourceCardId ? ` (${nameOf(e.sourceCardId)})` : '';
        // M109: gdy kartę wskazuje KTO INNY niż odrzucający (Nightsnare),
        // log musi nazwać wybierającego — inaczej gracz nie wie, czyj to ruch.
        if (e.chooserId && e.chooserId !== e.playerId) {
          return `${whoN(e.chooserId)} wybiera z odsłoniętej ręki gracza ${whoN(e.playerId)} kartę do odrzucenia${source}`;
        }
        // Uwaga D (2026-08-11): rozróżniamy POWÓD odrzucenia — limit ręki
        // w cleanup to nie „efekt" (niegramatyczne i mylące).
        const why = e.purpose === 'cost' ? 'jako koszt'
          : e.purpose === 'hand_size' ? 'przy limicie ręki'
          : 'efektem';
        return `${whoN(e.playerId)} wybiera, którą kartę odrzucić ${why}${source}`;
      }
      case 'discard_choice_resolved': return e.purpose === 'cost'
        ? `${whoN(e.playerId)} odrzuca kartę (koszt zdolności)`
        : `${whoN(e.playerId)} odrzuca kartę z ręki`;
      case 'hand_top_choice_required': {
        const src = e.sourceCardId ? ` (${nameOf(e.sourceCardId)})` : '';
        return `${whoN(e.playerId)} wybiera kartę z ręki na wierzch biblioteki${src}`;
      }
      // M144 (audyt PR #61): nazwa tylko dla WŁASNEJ karty (ręka gracza
      // jest jego wiedzą — CR 400.2). Przeciwnikowi zostaje „kartę”
      // (FoW M142). Wzorzec jak card_drawn / look_top_resolved.
      case 'hand_top_choice_resolved': {
        const card = (e.playerId === HUMAN_ID && e.cardId) ? nameOf(e.cardId) : 'kartę';
        return `${whoN(e.playerId)} kładzie ${card} na wierzch biblioteki`;
      }
      case 'graveyard_top_choice_required': return `${whoN(e.playerId)} wybiera karty-stwory z grobu na wierzch biblioteki (Forever Young)${e.candidateIds?.length ? ` — do wyboru ${e.candidateIds.length}` : ''}`;
      case 'graveyard_top_choice_resolved': return e.done
        ? `${whoN(e.playerId)} kończy wybieranie kart na wierzch biblioteki`
        : `${nameOf(e.cardId)} wraca z grobu na wierzch biblioteki`;
      case 'object_flipped': return null; // dublet turned_face_up (audyt M86)
      // --- Uwagi D (2026-08-10): żaden typ zdarzenia nie może wypaść w logu ---
      // --- surowo. „return null" = świadome pominięcie (dublet informacji). ---
      case 'cant_be_blocked_granted': return `${nameOf(e.cardId)} nie może być blokowany do końca tury`;
      case 'cards_milled': {
        // M73d (G2): odmiana „karta/karty/kart" (audyt żywym testerem).
        // M86: od spodu to NIE zawsze Sweet Oblivion (Cellar Door też mieli
        // od dołu) — bez twardej nazwy karty (ADR 0002).
        const karta = polishPlural(e.amount, 'kartę', 'karty', 'kart');
        return e.fromBottom
          ? `${whoN(e.playerId)} mieli ${e.amount} ${karta} od spodu biblioteki`
          : `${whoN(e.playerId)} mieli ${e.amount} ${karta} do grobu`;
      }
      case 'color_choice_required': return `${nameOfObject(e.auraId)} — wybór koloru (ochrona przed nim)`;
      case 'color_choice_resolved': {
        const COLOR_NAMES = { W: 'biały', U: 'niebieski', B: 'czarny', R: 'czerwony', G: 'zielony' };
        return `${nameOfObject(e.auraId)} — wybrany kolor: ${COLOR_NAMES[e.color] ?? e.color}`;
      }
      case 'damage_assignment_required': return `${whoN(e.playerId)} rozdziela obrażenia bojowe (trample albo wielu blokerów)`;
      case 'damage_assignment_resolved': return null; // linie damage_dealt zaraz to opiszą
      // M72 (Batch 29): generyczne rozdzielanie obrażeń niecombat (Fireball).
      case 'damage_target_required': return `${whoN(e.playerId)} wybiera cel ${dmgCount(e.amount)}${e.fromRevealed ? ` (odsłonięto „${e.fromRevealed}")` : ''}`;
      case 'damage_target_resolved': return `${whoN(e.playerId)} kieruje ${dmgCount(e.amount)} w ${isPlayer(e.targetId) ? whoN(e.targetId) : nameOfObject(e.targetId)}`;
      case 'day_night_changed': return `${e.designation === 'night' ? 'Zapada noc' : 'Wstaje dzień'} — karty z daybound/nightbound obracają się`;
      case 'exploit_choice_required': return `Exploit (${nameOf(e.cardId)}): ${whoN(e.playerId)} może poświęcić swojego stwora`;
      case 'exploited': return `Exploit: ${nameOfObject(e.exploitedId)} zostaje poświęcony dla ${nameOfObject(e.exploiterId)}`;
      case 'exploit_choice_resolved': return e.skipped
        ? `Exploit: ${whoN(e.playerId)} nie poświęca — zdolność odpada`
        : null; // poświęcenie opisuje linia „exploited"
      case 'fertile_thicket_reveal_started': return `Fertile Thicket: ${whoN(e.controllerId)} odsłania ${e.cardCount} ${polishPlural(e.cardCount, 'kartę', 'karty', 'kart')} z wierzchu biblioteki (bazowych landów: ${e.basicLandCount})`;
      case 'fertile_thicket_resolved': return e.skipped
        ? `Fertile Thicket: ${whoN(e.controllerId)} odkłada wszystkie odsłonięte karty na spód`
        : `Fertile Thicket: ${whoN(e.controllerId)} kładzie wybranego landa na wierzch, resztę na spód`;
      case 'springbloom_choice_required': return `Springbloom Druid: ${whoN(e.controllerId)} może poświęcić land`;
      case 'springbloom_resolved': return `Springbloom Druid: ${whoN(e.controllerId)} poświęca land — szuka do dwóch bazowych lądów`;
      case 'springbloom_skipped': return `Springbloom Druid: ${whoN(e.controllerId)} nie poświęca landa`;
      case 'optional_draw_required': return `${whoN(e.playerId)} może dobrać kartę (potem odrzuci — Force Away)`;
      case 'optional_draw_resolved': return e.drew
        ? `${whoN(e.playerId)} dobiera kartę (i zaraz odrzuci)`
        : `${whoN(e.playerId)} nie dobiera karty`;
      case 'proliferate_started': return `${whoN(e.playerId)} wykonuje proliferate — wskazuje permanenty/graczy z licznikami`;
      // M119/Z2: „2 celów” → „2 cele” (odmiana na piechotę myliła 2–4 z 5+).
      case 'proliferated': return `Proliferate: ${e.count} ${polishPlural(e.count, 'cel', 'cele', 'celów')} dostaje dodatkowe liczniki`;
      // M96: bez tej gałęzi log pokazywał dosłownie „proliferate_resolved"
      // (fallback na nazwę zdarzenia) — przeciek identyfikatora do UI.
      case 'proliferate_resolved': return null;
      case 'proliferate_target_resolved': return e.count === 0
        ? `${whoN(e.playerId)} kończy proliferate bez celów`
        : null; // opisuje linia „proliferated"
      case 'redirect_choice_required': return `Willbender: ${whoN(e.playerId)} może zmienić cel czaru ${nameOf(e.cardId)}`;
      case 'redirect_choice_resolved': return e.toTarget == null
        ? `Willbender: cel czaru ${nameOf(e.cardId)} zostaje bez zmian`
        : `Willbender zmienia cel czaru ${nameOf(e.cardId)} na ${isPlayer(e.toTarget) ? whoN(e.toTarget) : nameOfObject(e.toTarget)}`;
      case 'reveal_started': {
        const names = (e.cardIds ?? []).filter(Boolean).map((cid) => nameOf(cid)).join(', ');
        return names
          ? `${whoN(e.playerId)} odsłania ${e.amount} ${polishPlural(e.amount, 'kartę', 'karty', 'kart')} z wierzchu biblioteki: ${names}`
          : `${whoN(e.playerId)} odsłania ${e.amount} ${polishPlural(e.amount, 'kartę', 'karty', 'kart')} z wierzchu biblioteki`;
      }
      case 'reveal_exile_required': return `Dreams of Steel and Oil: ${whoN(e.playerId)} ogląda rękę i grób gracza ${whoN(e.opponentId)} i wybiera kartę do wygnania`;
      // M99: gdy w ręce nie ma kandydata (artefakt/stwór), engine pomija etap
      // i wysyła cardId: null — log musi to powiedzieć wprost, a nie pokazywać
      // „wskazuje ? z ręki przeciwnika" (symetrycznie do wariantu grobu).
      case 'reveal_exile_hand_chosen': return e.cardId
        ? `${whoN(e.playerId)} wskazuje ${nameOf(e.cardId)} z ręki przeciwnika`
        : `${whoN(e.playerId)} nie wskazuje karty z ręki przeciwnika`;
      case 'reveal_exile_grave_required': return `Dreams of Steel and Oil: ${whoN(e.playerId)} wybiera kartę z grobu przeciwnika do wygnania`;
      case 'reveal_exile_grave_chosen': return e.cardId
        ? `${whoN(e.playerId)} wskazuje ${nameOf(e.cardId)} z grobu przeciwnika`
        : `${whoN(e.playerId)} nie wskazuje karty z grobu`;
      case 'reveal_exile_resolved': return `Dreams of Steel and Oil: wybrane karty zostają wygnane`;
      case 'reveal_order_resolved': return `Stomping Slabs: ${whoN(e.playerId)} układa odsłonięte karty na spodzie biblioteki`;
      case 'speed_changed': return `${whoN(e.playerId)} zwiększa prędkość (speed: ${e.speed})`;
      case 'turned_face_up': return `${nameOf(e.cardId)} zostaje obrócony twarzą do góry`;
      case 'enter_as_copy_resolved': return e.targetId
        ? `${whoN(e.playerId)} kopiuje ${nameOfObject(e.targetId)} przy wejściu`
        : `${whoN(e.playerId)} nie kopiuje — stwór wchodzi jako 0/0`;
      case 'destroy_equipment_choice_resolved': return e.destroy
        ? `${whoN(e.playerId)} niszczy equipment na ${nameOfObject(e.targetId)}`
        : `${whoN(e.playerId)} zostawia equipment na ${nameOfObject(e.targetId)}`;
      default: return e.type;
    }
  }

/**
 * @param {{ seed: number, registry: object, decks: Map<string, string[]>,
 *   humanId?: string, botFactory?: (seed: number) => object,
 *   pauseOnBotMoves?: boolean }} config
 */
export function createSession(config) {
  const { seed, registry, decks } = config;
  // Feature 2026-08-11: opcje wyciszone przez gracza (ptaszek w panelu akcji)
  // nie przerywają auto-passu. Zbiór współdzielony z UI (main.js) — sesja
  // tylko czyta, UI mutuje.
  const ignoredOptionKeys = config.ignoredOptionKeys ?? new Set();
  if (!(decks instanceof Map) || decks.size !== 2) throw new TypeError('Sesja wymaga dwóch talii (Map)');
  if (!decks.has(HUMAN_ID) || !decks.has(BOT_ID)) throw new TypeError('Talia musi istnieć dla gracza i bota');
  const botFactory = config.botFactory ?? defaultBotFactory;
  const botCtx = { opponentDeck: decks.get(HUMAN_ID) };
  let bot = botFactory(seed + 1, botCtx);
  const names = Object.entries(PLAYER_NAMES).map(([id, name]) => ({ id, name }));
  let state = setupCardMatch({ seed, players: names, decks, registry });
  const nameById = new Map(registry.all().map((card) => [card.id, card.name]));
  const colorsById = new Map(registry.all().map((card) => [card.id, card.colors ?? []]));
  const log = []; // { kind: 'event'|'rejection'|'system', text }
  const sessionLog = (kind, text) => log.push({ kind, text });
  // Ślad decyzji bota (B5, docs/BOT_ROADMAP.md): po każdym ruchu bota z jego
  // trace() zapisujemy najnowszy wpis — co wybrał, z jaką oceną i które
  // opcje brał pod uwagę. Bufor ograniczony (60), najnowsze na końcu.
  const reasoning = [];
  /**
   * Istotne ruchy bota od ostatniego okna decyzyjnego człowieka (M18).
   * Bot gra „w tle", a większość jego zagrań (czar z ręki, zdolność, trigger)
   * nie zostawia niczego na stole — gracz dowiadywał się o nich wyłącznie
   * z logu, którego łatwo nie zauważyć. Sesja zbiera je tutaj, a UI pokazuje
   * w modalu „Ruch bota" (decyzja właściciela 2026-08-02).
   *
   * Świadomie POMIJAMY passy i tapowanie many — to szum, który zamieniłby
   * modal w klikanie bez treści (decyzja właściciela).
   */
  const botMoves = [];
  /**
   * Przebieg pełnych tur (M25): co robił gracz i bot w poprzednich turach,
   * do zasilania AI fabularnym opisem. Każda ukończona tura to rekord
   * { number, activePlayerId, lines: string[] } w kolejności zakończenia
   * (najstarsza pierwsza). „Pełna tura" = zakończona (nastąpił turn_started
   * następnej); tura bieżąca dołącza dopiero, gdy partia się skończy.
   * Imiona: TURN_NAMES (Czarodziejka / Nieprzyjaciel).
   */
  const turnHistory = [];
  let currentTurn = {
    number: state.turn.number,
    activePlayerId: state.turn.activePlayerId,
    lines: [],
  };
  const TURN_NOISE = new Set(['step_advanced', 'mana_produced', 'turn_started']);
  /**
   * M151 (audyt żywym testerem): szum GŁÓWNEGO LOGU gracza. TESTER_STOLU.md
   * (oś 2) dokumentuje `mana_produced` i `step_advanced` jako wyciszone, a
   * `describeEvent` zwraca dla nich tekst — więc `apply()`/`streamAutoEvents`
   * wpisywały je do logu (18× „przygotowuje manę" i 140× „— faza/krok —"
   * w jednej partii). Modal „Ruch bota" i tak ma własną bramkę BOT_MOVE_NOISE.
   * `turn_started` NIE jest szumem (decyzja właściciela — początek tury to
   * istotna informacja), więc zostaje.
   */
  const MAIN_LOG_NOISE = new Set(['mana_produced', 'step_advanced']);
  function recordTurnEvent(e) {
    if (e.type === 'turn_started') {
      turnHistory.push(currentTurn);
      currentTurn = { number: state.turn.number, activePlayerId: e.playerId, lines: [] };
      return;
    }
    if (TURN_NOISE.has(e.type)) return;
    const text = describeEvent(e, TURN_NAMES);
    if (!text) return;
    currentTurn.lines.push(text);
  }
  /** Formatuje N ostatnich pełnych tur (1 albo 2) do tekstu dla AI. */
  function turnHistoryText(count = 1) {
    // Po zakończeniu partii ostatnia, przerwana tura też jest pełna.
    if (state.status === 'finished' && currentTurn.lines.length > 0) {
      turnHistory.push(currentTurn);
      currentTurn = { number: state.turn.number, activePlayerId: state.turn.activePlayerId, lines: [] };
    }
    const records = turnHistory.slice(-Math.max(1, Math.min(2, count)));
    if (records.length === 0) return '';
    const blocks = records.map((record) => {
      const whoName = TURN_NAMES[record.activePlayerId] ?? record.activePlayerId;
      const header = `**Tura ${record.number} — ${whoName}**`;
      const lines = record.lines.length > 0
        ? record.lines.map((line) => `• ${line}`)
        : ['• (nic znaczącego)'];
      return [header, ...lines].join('\n');
    });
    return blocks.join('\n\n');
  }
  const captureBotReasoning = () => {
    const last = bot.trace?.().at(-1);
    if (!last) return;
    reasoning.push({
      turn: last.turn,
      step: last.step,
      chosen: last.chosen,
      score: last.score,
      options: (last.options ?? []).slice(0, 5).map((option) => ({ ...option })),
    });
    if (reasoning.length > 60) reasoning.shift();
  };

  function nameOf(cardId) {
    return nameById.get(cardId) ?? cardId ?? '?';
  }

  /** Nazwa obiektu gry (po id obiektu, nie karty) — do opisów ataków i celów. */
  function nameOfObject(objectId) {
    // M73d (C): cel-gracz (np. Inspiration „target player draws") — imię
    // zamiast „?" (audyt żywym testerem: „rzuca Inspiration → cel: ?").
    if (state.players.some((pl) => pl.id === objectId)) return who(objectId);
    const object = state.objects.get(objectId);
    if (!object) return '?';
    // Face-down (morph/megamorph, CR 708.2): tożsamość ukryta przed
    // przeciwnikiem — „morph" zamiast „?" w etykietach celów/logu
    // (audyt żywym testerem M73c).
    // M100/E10 (P12 — Żywy Tester h01): własny morph jest nazwany —
    // właściciel może patrzeć na swoje zakryte karty (CR 708.6), a etykieta
    // „poświęć morph" nie pozwalała odróżnić własnych morfów.
    // M100/E12 (pytanie właściciela): nazwa NIE może ukrywać, że to wciąż
    // morph — znacznik „(Morph)" odróżnia zakryte 2/2 od pełnego stwora.
    // M127: brzmienie i wielkość litery z jednego źródła (faceDownName).
    if (object.faceDown) {
      return faceDownName(object.controllerId === HUMAN_ID ? nameOf(object.cardId) : null);
    }
    return nameOf(object.cardId);
  }

  function who(playerId) {
    return PLAYER_NAMES[playerId] ?? playerId;
  }

  /** M73d (D): polskie nazwy zdarzeń triggerów — log i stos (audyt żywym testerem). */


/** Opis zdarzenia przez modułowego czytelnika (wstrzyknięte nazwy stanu). */
  function describeEvent(e, names = PLAYER_NAMES) {
    // Uwaga A (2026-08-12): tłumimy natychmiastowy library_searched po
    // search_choice_resolved — search_choice_resolved już opisuje wynik
    // („znajduje kartę i tasuje bibliotekę"). library_searched z innych ścieżek
    // (typecycling, pokoje lochu, bez search_choice) nadal się loguje.
    if (e.type === 'library_searched' && suppressNextLibrarySearched) {
      suppressNextLibrarySearched = false;
      return null;
    }
    if (e.type === 'search_choice_resolved') {
      suppressNextLibrarySearched = true;
    }
    return describeGameEvent(e, {
      nameOf, nameOfObject,
      isPlayer: (id) => state.players.some((player) => player.id === id),
      controllerOf: (objectId) => state.objects.get(objectId)?.controllerId ?? null,
    }, names);
  }

  /**
   * Czy zdarzenie bota warto pokazać graczowi w modalu? Pomijamy szum
   * (passy, mana, kroki tury, techniczne przenosiny obiektów) — reszta
   * (czary, zdolności, triggery, walka, tokeny, liczniki, życie) to realna
   * informacja o tym, co zrobił przeciwnik.
   */
  // Uwaga C (2026-08-12): w modalu ruchu bota pokazujemy zmiany TURY i FAZY
  // („Tura 5 — Nieprzyjaciel"/„Faza: Walka") podczas ciągłego ruchu bota —
  // bez tego gracz nie wie, że przed akcją zaczęła się nowa tura/faza.
  const STEP_LABELS = Object.freeze({
    untap: 'Odkręcenie', upkeep: 'Podtrzymanie', draw: 'Dobieranie',
    beginning_of_combat: 'Początek walki', declare_attackers: 'Deklaracja atakujących',
    declare_blockers: 'Deklaracja blokujących', combat_damage: 'Obrażenia w walce',
    end_of_combat: 'Koniec walki', end: 'Krok końcowy', cleanup: 'Sprzątanie',
  });
  // Etykieta fazy dla nagłówka „Faza: …" — BEZ słowa „faza" w środku, żeby
  // nie dublować prefiksu (audyt M83: „Faza: Faza główna").
  const stepLabelOf = (e) => (e.step === 'main'
    ? (e.phase === 'postcombat_main' ? 'Główna 2' : 'Główna 1')
    : (STEP_LABELS[e.step] ?? e.step));

  // card_drawn z draw_step to szum (krok tury) — pomijamy w modalu.
  // card_drawn z source="effect" (draw_cards z czaru: Curate, Phyrexian
  // Rager, Evangel, Curiosity itd.) jest istotny — gracz chce widzieć,
  // że przeciwnik dobrał X kart (zgłoszenie właściciela 2026-08-13,
  // M89 zadanie A).
  const BOT_MOVE_NOISE = new Set([
    'priority_passed', 'mana_changed', 'mana_produced', 'step_advanced',
    'turn_started', 'object_tapped', 'object_untapped', 'damage_marked',
    'object_moved', 'game_created', 'stats_modified',
  ]);
  // M100/E8 (uwaga właściciela 2026-08-15): własne dobranie w kroku
  // dobierania jest komunikatem „Rozgrywka" (pełna legalność — własna
  // wiedza; lepszy UX przy grze przez modale). Dobranie BOTA w kroku
  // dobierania zostaje szumem; dobrania z efektu (obu) były treścią od E3.
  const isCardDrawnNoise = (e) => e.type === 'card_drawn' && e.source !== 'effect' && e.playerId !== HUMAN_ID;

  /** M100/E5: nagłówkowe zagrania CZŁOWIEKA w panelu „Rozgrywka" — panel
   * jest wspólnym streszczeniem rozgrywki (uwaga właściciela: „inne istotne
   * zagrania obu graczy"), a samo kliknięcie nie zawsze odzwierciedla stan
   * (pauza przychodzi dopiero z odpowiedzią bota). Szum (mana, tap, passy,
   * markery) zostaje odfiltrowany — jak u bota. */
  const HUMAN_DIGEST_EVENTS = new Set([
    'spell_cast', 'permanent_cast', 'aura_spell_cast', 'land_played',
    'ability_activated', 'permanent_entered_battlefield', 'object_transformed',
  ]);

  /** Zdarzenia, przy których warto pokazać ilustrację zagranej karty. */
  const BOT_MOVE_CARD_EVENTS = new Set([
    'spell_cast', 'permanent_cast', 'aura_spell_cast', 'ability_activated', 'trigger_target_required', 'trigger_target_resolved', 'trigger_resolved', 'modal_trigger_required', 'modal_trigger_resolved', 'optional_trigger_required', 'optional_trigger_resolved', 'mulligan_choice_resolved', 'mulligan_taken', 'mulligan_bottom_required', 'mulligan_bottom_resolved', 'game_started', 'regeneration_shield_added', 'permanent_regenerated', 'permanent_destroyed', 'cant_be_regenerated_set',
    'ability_triggered', 'spell_resolved', 'permanent_entered_battlefield',
    // Zagranie lądu też pokazuje skan (zgłoszenie 2026-08-06: „zagrywa
    // Swamp" bez ilustracji) — landy podstawowe mają imageUri.
    'land_played',
    // M89 (Curate modal): card_drawn z draw_cards efektu — modal ruchu
    // bota pokazuje dobraną kartę (gracz chce widzieć, co bot dobrał
    // z efektu czaru, np. Curate Surveil 2 + Draw 1).
    'card_drawn',
    // M89 cd. (bug C): token_created (Carrion Call, Raise the Alarm,
    // Scourge of Skemfar itd.) — modal ruchu bota MUSI pokazać wpis
    // o tokenie, choćby z syntetyczną twarzą (tokeny mają cardId typu
    // `token_*` bez imageUri — render wyświetli syntetyczną miniaturę).
    // Wcześniej token_created było w BOT_PAUSE_EVENTS (pauza), ale brak
    // cardId w botMoves powodował pominięcie wpisu w modalu.
    'token_created',
  ]);

  /**
   * „Istotne zagranie" — po takim zdarzeniu z akcji bota/auto-przewijania
   * sesja pauzuje na klik gracza (opcja `pauseOnBotMoves`; decyzja
   * właściciela 2026-08-05: pauza po każdym rzuceniu czaru przez bota,
   * wystawieniu lądu, użyciu zdolności i zmianie strefy karty — nawet gdy
   * gracz nie ma żadnej możliwej odpowiedzi). Tylko `object_moved` jest
   * jednocześnie szumem logu — dostaje własny opis w noteBotMove.
   */
  const BOT_PAUSE_EVENTS = new Set([
    'spell_cast', 'permanent_cast', 'aura_spell_cast',
    'land_played',
    'ability_activated', 'ability_resolved', 'ability_triggered',
    'object_moved', 'object_exiled', 'permanent_destroyed', 'creature_destroyed',
    'permanent_sacrificed', 'permanent_put_into_graveyard',
    'token_created', 'permanent_entered_battlefield',
  ]);

  // Uwaga C (2026-08-12): śledzimy ostatnią FAZĘ pokazaną w modalu ruchu bota,
  // żeby dodawać nagłówek „Faza: …" tylko przy ZMIANIE fazy (nie co krok).
  let lastBotPhaseKey = null;
  // Uwaga A (2026-08-12, po merge PR #44): nagłówek fazy jest OCZEKUJĄCY —
  // wypychamy go dopiero, gdy w tej fazie pojawi się prawdziwa akcja.
  // Puste „Faza: Odkręcenie / Dobieranie / Sprzątanie" znikały z raportu.
  let pendingBotPhase = null;
  // Uwaga A (2026-08-12): search_choice_resolved i library_searched są emitowane
  // razem dla tego samego szukania (game-state). W logu/modalu pokazujemy tylko
  // search_choice_resolved („znajduje kartę i tasuje"); natychmiastowy
  // library_searched był DUBLETEM. Flaga tłumi go, dopóki nie pojawi się
  // inny event (szukania z innych ścieżek — typecycling, pokoje — logują się).
  let suppressNextLibrarySearched = false;
  // Uwaga A: dla modala — jeśli poprzednim ruchem był search_choice_resolved,
  // kolejny library_searched (ten sam szukanie) pomijamy (dublet).
  let lastBotMoveWasSearchResolved = false;
  // M99 + M100/E2 (symetria, uwaga właściciela): dopóki na stosie jest
  // czar/zdolność KTÓREGOKOLWIEK z graczy, jego rozstrzygnięcie i skutki
  // są treścią modala „Rozgrywka" — nawet gdy technicznie wywołał je pass
  // drugiego gracza. M99 śledził wyłącznie czary BOTA; E2 dokłada
  // rozstrzygnięcia (i skutki) czarów CZŁOWIEKA, także modalnych z trybem.
  const stackObjects = new Set();
  // Typy zdarzeń, które opisują SKUTEK rozstrzygnięcia (a nie decyzje człowieka).
  const BOT_RESOLUTION_EVENTS = new Set([
    'spell_resolved', 'ability_resolved',
    'damage_dealt', 'life_changed', 'life_lost', 'life_gained',
    'counter_added', 'counter_removed', 'keyword_granted', 'stats_modified',
    // M106/Z1: masowy buff to CAŁA treść takiego czaru — nigdy szum.
    'mass_stats_modified',
    'permanent_entered_battlefield', 'permanent_destroyed', 'creature_destroyed',
    'permanent_sacrificed', 'permanent_put_into_graveyard',
    'object_moved', 'object_exiled', 'token_created',
    'cards_drawn', 'card_drawn', 'cards_milled', 'card_discarded',
    // M100/E13 (zgłoszenie A): przypięcie sprzętu/aury TO skutek
    // rozstrzygnięcia — bez wpuszczenia object_attached deduplikacja equipa
    // (ability_resolved → null) ukryłaby w modalu wynik aktywacji.
    'object_attached',
    // M100/E4 (uwaga właściciela): manipulacja biblioteką jako SKUTEK
    // rozstrzygnięcia — podgląd/skutek, nie ukryta decyzja. Nazwy niosą
    // wyłącznie warstwy legalne FoW: własne podejrzenia (opis w
    // describeGameEvent nazywa tylko gdy playerId === HUMAN_ID), grób
    // publiczny (card_milled) i jawne odsłonięcia (card_revealed, epic,
    // tutor z kryterium — CR 701.20).
    'card_milled', 'card_revealed',
    // M101/D (zgłoszenie właściciela, „poważny błąd"): przejęcie kontroli nad
    // permanentem to NAJWAŻNIEJSZY skutek, jaki gracz może przegapić — Puppeteer
    // Clique zabierał mu stwora z cmentarza, atakował nim i wygnaniał w cleanup,
    // a panel milczał. Kontrola nad obiektem zmienia ocenę całej pozycji.
    'control_changed',
    // M101/D cd.: trigger jest obiektem na stosie (CR 603.3) i jego
    // rozstrzygnięcie jest takim samym skutkiem jak rozstrzygnięcie czaru —
    // dotyczy to również triggerów opóźnionych (CR 603.7), które odpalają się
    // w upkeep/cleanup, całkowicie poza jakąkolwiek komendą gracza.
    'ability_triggered', 'trigger_resolved', 'delayed_trigger_armed',
    'trigger_target_resolved', 'modal_trigger_resolved', 'optional_trigger_resolved',
    'scry_started', 'scry_resolved', 'surveil_started', 'surveil_resolved',
    'index_started', 'index_resolved', 'look_top_started', 'look_top_resolved',
    'epic_experiment_started', 'epic_experiment_resolved',
    'clash_resolved', 'clash_choice_resolved',
  ]);

  /** Utrzymuje `stackObjects` — obiekty stosu OBU graczy (M100/E2 symetria). */
  function trackStack(e) {
    const PUTS_OBJECT_ON_STACK = ['spell_cast', 'permanent_cast', 'aura_spell_cast', 'ability_activated', 'ability_triggered'];
    if (!PUTS_OBJECT_ON_STACK.includes(e.type)) return;
    // M101/D (root cause nr 2): wymaganie kontrolera Z POLA ZDARZENIA gubiło
    // wszystkie triggery — `ability_triggered` niesie tylko
    // { objectId, cardId, trigger }, bez controllerId/playerId. Trigger nie
    // otwierał więc okna rozstrzygnięcia i gdy był JEDYNYM obiektem na stosie
    // (opóźniony trigger w upkeep/cleanup, trigger śmierci po walce), cały jego
    // skutek przepadał: `stackObjects` było puste, więc `isStackResolution`
    // nigdy nie stawało się prawdą. Kontrolera dobieramy z obiektu w stanie gry,
    // a gdy i tego nie ma — trigger i tak jest obiektem na stosie (CR 603.3)
    // i jego rozstrzygnięcie należy do panelu.
    const controller = e.controllerId ?? e.playerId
      ?? state.objects.get(e.objectId ?? e.sourceId)?.controllerId ?? null;
    if (!controller && !['ability_triggered'].includes(e.type)) return;
    stackObjects.add(e.toId ?? e.objectId ?? e.sourceId ?? e.cardId ?? true);
    // spell_resolved/ability_resolved NIE zamykają okna — skutki czaru idą
    // zaraz po rozstrzygnięciu (M99). Okno zamyka turn_started (noteBotMove).
  }

  function noteBotMove(e) {
    trackStack(e);
    // Rejestrujemy zdarzenia z RZECZYWISTEGO ruchu bota (botActing).
    // Uwaga D/E (2026-08-11): isBotAdvancing jest prawdą także podczas
    // auto-przewijania faz CZŁOWIEKA (advance() passuje też jego end/cleanup),
    // więc zdarzenia decyzji człowieka (np. discard_choice_required przy limicie
    // ręki) trafiały do modala „Rozgrywka". botActing jest prawdą tylko
    // w gałęzi BOTA w advance().
    //
    // Wyjątki (uwagi A/B1, 2026-08-12):
    // - turn_started ZAWSZE (początek tury dowolnego gracza — także po
    //   auto-passie cleanup człowieka, gdy zaczyna się tura bota);
    // - CAŁA faza walki (phase === 'combat'): resolve_combat człowieka idzie
    //   w advance() bez botActing. Whitelista typów (tylko damage_dealt z
    //   flagą combat) gubiła bloki, obrażenia stwór–stwór (event bez
    //   combat:true), truciznę (infect) i triggery z walki — to, co działało
    //   przed M75, gdy isBotAdvancing obejmował auto-resolve.
    const inCombatReport = state.turn.phase === 'combat';
    // M99 (oś 2, audyt żywym testerem): czar bota rozstrzyga się dopiero, gdy
    // OBAJ gracze spasują — czyli w wyniku komendy CZŁOWIEKA, gdy `botActing`
    // jest już false. Rozstrzygnięcie i skutki („Servant of the Scale dostaje
    // +3/+3") lądowały wyłącznie w logu, a modal kończył się na „Nieprzyjaciel
    // rzuca Awaken the Bear". Gracz grający przez modale nie dowiadywał się,
    // co czar zrobił. Kwalifikujemy po KONTROLERZE obiektu na stosie (dane
    // zdarzenia), nie po nazwie karty ani fazie.
    const isStackResolution = !botActing && stackObjects.size > 0
      && BOT_RESOLUTION_EVENTS.has(e.type);
    // M100/E5: nagłówkowe zagranie CZŁOWIEKA (jego własna komenda w apply)
    // też dostaje wpis — kontekst dla odpowiedzi bota w tym samym bloku.
    const isHumanHeadline = !botActing && HUMAN_DIGEST_EVENTS.has(e.type)
      && (e.playerId === HUMAN_ID || e.controllerId === HUMAN_ID
        || e.object?.controllerId === HUMAN_ID || e.sourceControllerId === HUMAN_ID);
    // M100/E8: dobranie CZŁOWIEKA (także w kroku dobierania) — komunikat
    // w Rozgrywka (para nagłówkowa każdej własnej tury: „Tura N — Ty"
    // + „Ty dobiera: X").
    const isHumanDraw = !botActing && e.type === 'card_drawn' && e.playerId === HUMAN_ID;
    // M106/Z3 (audyt stołu): nagłówek fazy MUSI aktualizować się zawsze.
    // Przejścia faz w turze bota wykonuje auto-pass CZŁOWIEKA (botActing =
    // false), więc `step_advanced` dla „Główna 1” wypadał z bufora i przy
    // zagraniu landa panel pokazywał nieaktualne „Faza: Podtrzymanie” —
    // czyli land drop w upkeepie, coś nielegalnego wg CR 305.1. Nagłówek
    // i tak jest OCZEKUJĄCY (pokazuje się tylko razem z realną akcją).
    if (!botActing && e.type !== 'turn_started' && e.type !== 'step_advanced'
      && !inCombatReport && !isStackResolution && !isHumanHeadline && !isHumanDraw) return;
    let text;
    // Nowa tura: nagłówek „Tura N — <gracz>". Zawsze (uwaga A).
    if (e.type === 'turn_started') {
      pendingBotPhase = null;
      lastBotPhaseKey = null;
      stackObjects.clear();
      botMoves.push({ type: 'turn_started', text: `Tura ${state.turn.number} — ${who(e.playerId)}`, cardId: null });
      return;
    }
    // Uwaga A (modal): pomiń library_searched bezpośrednio po
    // search_choice_resolved — wynik szukania już pokazany.
    if (e.type === 'library_searched' && lastBotMoveWasSearchResolved) {
      lastBotMoveWasSearchResolved = false;
      return;
    }
    if (e.type === 'search_choice_resolved') lastBotMoveWasSearchResolved = true;
    else lastBotMoveWasSearchResolved = false;
    if (e.type === 'step_advanced') {
      const key = `${e.number}:${e.phase}:${e.step}`;
      if (key !== lastBotPhaseKey) {
        lastBotPhaseKey = key;
        pendingBotPhase = { type: 'step_advanced', text: `Faza: ${stepLabelOf(e)}`, cardId: null };
      }
      return;
    }

    // M80 (audyt żywym testerem): „Brak ataku" to nie-pozycja — brak ataku
    // przeciwnika nie zasługuje na modal „Rozgrywka" (szum, pusta faza).
    // Zdarzenie z pustą listą atakujących pomijamy w całości (także nie zostawiamy
    // pustego nagłówka fazy dla tej akcji).
    if (e.type === 'attackers_declared' && !(e.attackerIds?.length)) return;
    // M83 (audyt żywym testerem): „Brak bloków" (puste przypisania) to też
    // nie-pozycja — nie zasługuje na modal (szum jak „Brak ataku").
    if (e.type === 'blockers_declared' && Object.keys(e.assignments ?? {}).length === 0) return;
    // M99 (oś 2): `stats_modified` jest globalnie szumem (P/T przelicza się
    // przy każdym zdarzeniu), ALE gdy rozstrzyga się czar/zdolność BOTA, to
    // jest właśnie SKUTEK, o który pyta gracz: „Servant of the Scale dostaje
    // +3/+3". Bez tego modal mówił tylko „zyskuje: zadeptywanie", a gracz nie
    // rozumiał, dlaczego przegrywa walkę.
    const isResolutionEffect = !botActing && stackObjects.size > 0;
    if ((BOT_MOVE_NOISE.has(e.type) || isCardDrawnNoise(e))
        && !(e.type === 'stats_modified' && isResolutionEffect)) {
      // Szum logu — pomijamy, CHYBA że zdarzenie jest pauzowalne: zmiana
      // strefy karty (object_moved) ma być pokazana w modalu ruchu bota,
      // choć do logu nie trafia (decyzja o gadatliwości logu zostaje).
      if (!BOT_PAUSE_EVENTS.has(e.type)) return;
      const movedName = nameOf(e.object?.cardId ?? state.objects.get(e.fromId)?.cardId);
      text = `${who(e.object?.controllerId)}: ${movedName} — ${zoneLabel(e.fromZone)} → ${zoneLabel(e.toZone)}`;
    } else {
      text = describeEvent(e);
      if (!text) return;
    }
    // Faza tylko razem z akcją (uwaga A).
    if (pendingBotPhase) {
      botMoves.push(pendingBotPhase);
      pendingBotPhase = null;
    }
    // Kartę do podglądu bierzemy z samego zdarzenia (cardId) albo z obiektu,
    // którego zdarzenie dotyczy — UI pokaże jej skan ze Scryfalla.
    let cardId = null;
    // Ślad audytowy (M123): zapamiętujemy, że skan ZOSTAŁ ZDJĘTY z powodu
    // ukrytej strefy. Testy regresyjne sprawdzają dzięki temu intencję, a nie
    // tylko brak `cardId` (który może wynikać z całkiem innego powodu).
    let hiddenDestination = null;
    if (BOT_MOVE_CARD_EVENTS.has(e.type)) {
      cardId = e.cardId ?? e.object?.cardId ?? e.sourceCardId ?? null;
      if (!cardId && e.objectId) cardId = state.objects.get(e.objectId)?.cardId ?? null;
      // M100 (BUG A): skan karty face-down PRZECIWNIKA to wyciek nazwy
      // (morph na stosie/stole jest bezimienny — CR 708.2). Odsłonięty przy
      // zmianie strefy (grób/exile — śmierć, kontruj) nazywać wolno
      // (CR 708.8/708.9) — dlatego patrzymy na ŻYWY zakryty obiekt albo
      // flagę faceDown samego zdarzenia, nie na samo cardId.
      if (cardId) {
        const hiddenLive = [e.objectId, e.object?.id]
          .filter((id) => id != null)
          .map((id) => state.objects.get(id))
          .some((o) => o?.faceDown && o.controllerId !== HUMAN_ID);
        const explicitFaceDown = e.faceDown === true && e.playerId !== HUMAN_ID;
        if (hiddenLive || explicitFaceDown) cardId = null;
      }
      // M123 (zgłoszenie właściciela): modal „Rozgrywka" pokazywał SKAN karty
      // przy wpisie „Nieprzyjaciel dobiera kartę". TEKST poprawnie ukrywał
      // nazwę (FoW), ale miniaturka szła obok tekstu z `e.object.cardId`
      // i zdradzała dokładnie tę kartę, którą bot wziął do RĘKI — czyli
      // informację ukrytą (CR 400.2). Właściciel rozpoznał ilustracje jako
      // „swoje", bo obie talie mają te same landy; w istocie to był podgląd
      // ręki przeciwnika.
      //
      // Reguła generyczna: karta wędrująca do UKRYTEJ strefy przeciwnika
      // (ręka, biblioteka) nie ma prawa do miniaturki. Grób i wygnanie są
      // jawne (CR 400.2) — tam skan zostaje.
      if (cardId && e.playerId != null && e.playerId !== HUMAN_ID) {
        const destination = e.object?.zone
          ?? (e.object?.id ? state.objects.get(e.object.id)?.zone : null);
        if (destination === 'hand' || destination === 'library') {
          cardId = null;
          hiddenDestination = destination;
        }
      }
    }
    botMoves.push({ type: e.type, text, cardId, hiddenDestination });
  }

  // Filter: only record bot events in the modal
  function isHumanEvent(e) {
    return (e.playerId ?? e.object?.controllerId ?? e.sourceControllerId) === HUMAN_ID;
  }

  // Pauza po każdym istotnym zagraniu bota (decyzja właściciela 2026-08-05):
  // gdy `pauseOnBotMoves` jest włączone, sesja zatrzymuje się po zagraniu,
  // którego strumień zdarzeń niesie BOT_PAUSE_EVENTS, i czeka na klik
  // (session.continueBotPlay). Domyślnie wyłączone, żeby konsumenci
  // synchroniczni (testy, narzędzia) zachowali dotychczasowy przebieg.
  const pauseOnBotMoves = config.pauseOnBotMoves === true;
  let awaitingBotAck = false;
  let isBotAdvancing = false;
  // Uwaga D/E: prawda tylko w gałęzi BOTA w advance() — botMoves/pauza dotyczą
  // wyłącznie ruchu bota, nie auto-passu faz człowieka.
  let botActing = false;

  /**
   * Wspólny strumień auto-przewijania (ruch bota, auto-resolve walki,
   * auto-pass człowieka): logowanie opisanych zdarzeń + bufor modala
   * + przebieg tur. Zwraca, czy strumień niosł zdarzenie pauzowalne
   * (istotne zagranie / zmiana strefy). Historia: rozstrzygnięcia stosu przy
   * auto-passie wcześniej NIE trafiały do logu ani przebiegu tur — teraz
   * są ujęte tą samą ścieżką co ruchy bota.
   */
  function streamAutoEvents(events) {
    let significant = false;
    for (const e of events) {
      // M151: główny log gracza nie przyjmuje szumu (mana/fazy) — patrz
      // MAIN_LOG_NOISE. noteBotMove/recordTurnEvent mają własne bramki.
      if (MAIN_LOG_NOISE.has(e.type)) { noteBotMove(e); recordTurnEvent(e); continue; }
      const text = describeEvent(e);
      if (text) sessionLog('event', text);
      noteBotMove(e);
      recordTurnEvent(e);
      if (BOT_PAUSE_EVENTS.has(e.type)) significant = true;
      // M100/E8: bez pauzy własna linia dobrania zginęłaby wyczyszczona
      // przez następną komendę gracza (apply czyści bufor) — komunikat
      // pojawia się na starcie własnej tury jak ruch bota.
      if (e.type === 'card_drawn' && e.playerId === HUMAN_ID) significant = true;
    }
    return significant;
  }

  /**
   * Prowadzi partię do przodu: ruchy bota i auto-przewijanie okien człowieka
   * bez realnej decyzji (sam pass, puste deklaracje, rozstrzyganie walki).
   * Zatrzymuje się na pierwszym z: koniec partii, okno decyzyjne człowieka
   * albo — przy włączonym pauseOnBotMoves — istotne zagranie z pauzą
   * (`awaitingBotAck`, wznowienie przez continueBotPlay).
   */
  function advance() {
    let guard = 0;
    awaitingBotAck = false;
    isBotAdvancing = true;
    while (state.status === 'active') {
      if (guard++ > 5000) throw new Error('advance: brak postępu sesji');
      if (state.turn.priorityPlayerId === BOT_ID) {
        const helpers = { simulate: makeSimulate(state) };
        const cmd = bot.chooseCommand(playerView(state, BOT_ID), helpers);
        captureBotReasoning();
        botActing = true;
        const result = execute(state, cmd);
        if (!result.ok) throw new Error(`Bot wybrał nielegalną komendę: ${result.events[0]?.reason}`);
        const significant = streamAutoEvents(result.events);
        botActing = false;
        if (pauseOnBotMoves && significant) { awaitingBotAck = true; isBotAdvancing = false; return; }
        continue;
      }
      const view = playerView(state, HUMAN_ID);
      if (hasMeaningfulDecision(view)) { isBotAdvancing = false; return; }
      // Rozstrzygnięcie walki idzie automatycznie (pass jest tam zablokowany).
      const resolve = view.legalCommands.find((cmd) => cmd.type === 'resolve_combat');
      if (resolve) {
        const result = execute(state, resolve);
        if (!result.ok) throw new Error(`Auto-resolve odrzucony: ${result.events[0]?.reason}`);
        // Uwaga E (2026-08-11): pauza dotyczy ruchów BOTA — auto-resolve walki
        // CZŁOWIEKA nie otwiera „Ruchu przeciwnika". Log/botMoves mimo to
        // zbieramy (streamAutoEvents); significant ignorujemy.
        streamAutoEvents(result.events);
        continue;
      }
      const pass = execute(state, { type: 'pass_priority', playerId: HUMAN_ID });
      if (!pass.ok) throw new Error(`Auto-pass odrzucony: ${pass.events[0]?.reason}`);
      // Uwaga E: auto-pass faz CZŁOWIEKA (koniec tury, cleanup) nie pauzuje —
      // „Brak akcji"/modale ruchu przeciwnika w środku własnej tury (audyt:
      // auto-pass zatrzymał się w Głównej 2 po wyciszeniu opcji).
      streamAutoEvents(pass.events);
    }
  }

  /**
   * Czy człowiek ma teraz realną decyzję? Sam pass, samo tapnięcie lądu,
   * pusta deklaracja ataku/bloków i rozstrzygnięcie walki bez odpowiedzi
   * NIE są decyzją — auto-pass ma przewijać sekcje tury, w których gracz
   * nie może zrobić nic sensownego (untap, upkeep, własne puste main itd.).
   *
   * Źródłem prawdy jest wyłącznie PlayerView.legalCommands — to engine
   * (a nie heurystyki UI) decyduje, co jest wykonalne: oferty rzutów idą
   * po manie PRODUKOWALNEJ z auto-tapem (M34) i po kolorowej walidacji
   * many (M41), a zdolności/cele — po pełnej legalności. Historia: sesja
   * liczyła „potencjał" ręcznie (mana za nietapnięte landy, bez kolorów)
   * i zatrzymywała grę w oknach, gdzie gracz miał tylko pass — np. biała
   * karta w ręce przy samych górach (pip koloru niespłacalny) albo zdolność
   * z wymaganiami, których engine nie oferuje. Takie okna to fałszywe
   * pozytywy: gracz klikał „Dalej" w każdej sekcji tury.
   */
  function hasMeaningfulDecision(view) {
    if (view.status !== 'active') return false;
    const decisions = view.legalCommands.filter((c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type));
    return decisions.some((cmd) => {
      // Feature 2026-08-11: gracz może wyciszyć konkretną opcję (ptaszek
      // w panelu akcji) — taka opcja nie przerywa auto-passu. Inne opcje
      // nadal przerywają; odznaczenie przywraca przerywanie.
      if (ignoredOptionKeys.has(commandOptionKey(cmd))) return false;
      // Puste deklaracje ataku/bloków nie są decyzją (engine oferuje je
      // zawsze w kroku deklaracji — bez stworów to czysty pass).
      if (cmd.type === 'declare_attackers') return (cmd.attackerIds?.length ?? 0) > 0;
      if (cmd.type === 'declare_blockers') return Object.keys(cmd.assignments ?? {}).length > 0;
      // Wszystko inne w legalCommands (rzut, ląd, zdolność, resolve_*,
      // draw_card) to realna, wykonalna akcja — engine za nią ręczy.
      return true;
    });
  }

  sessionLog('system', `Nowa partia (seed ${seed}). Powodzenia!`);
  // Log ręki startowej gracza (A) – FoW: pokazujemy tylko własną rękę, nie przeciwnika.
  {
    const humanHandIds = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === HUMAN_ID);
    const humanHandNames = humanHandIds.map((id) => nameOf(state.objects.get(id)?.cardId)).filter(Boolean);
    if (humanHandNames.length > 0) {
      sessionLog('system', `Ręka startowa ${PLAYER_NAMES[HUMAN_ID]}: ${humanHandNames.join(', ')}`);
    }
    const botHandCount = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === BOT_ID).length;
    if (botHandCount > 0) {
      sessionLog('system', `Ręka startowa ${PLAYER_NAMES[BOT_ID]}: ${botHandCount} kart`);
    }
  }
  advance();

  const exposed = {
    get state() { return state; },
    nameOf,
    nameOfObject,
    /** Kolory karty (do akcentów w UI); nieznane id → pusta lista. */
    colorsOf(cardId) {
      return colorsById.get(cardId) ?? [];
    },
    cardDetails(cardId) {
      return registry.get(cardId) ?? null;
    },
    abilitiesOf(cardId) {
      const card = registry.get(cardId);
      return card?.abilities ?? [];
    },
    log,
    reasoning,
    /** Istotne ruchy bota od ostatniego okna decyzji człowieka (M18). */
    botMoves,
    /** Czyści bufor po pokazaniu go graczowi. */
    clearBotMoves() { botMoves.length = 0; lastBotPhaseKey = null; pendingBotPhase = null; lastBotMoveWasSearchResolved = false; },
    /** Pełne tury w kolejności zakończenia (M25, sekcja „Przebieg tur"). */
    turnHistory,
    /** Tekst N ostatnich pełnych tur (1–2) dla AI — imiona Czarodziejka/Nieprzyjaciel. */
    turnHistoryText,
    exportReplayText() {
      return serializeReplay(replayFromState(state));
    },
    view() {
      return playerView(state, HUMAN_ID);
    },
    /**
     * M103 (L15): fingerprint surowego stanu — mostek diagnostyczny dla
     * Żywego Testera (window.__mtgDebug, artefakt otwarty z ?tester=1).
     * Służy do weryfikacji, czy kliknięcie cokolwiek zmieniło (applied).
     */
    debugFingerprint() {
      return stateFingerprint(state);
    },
    /**
     * M103 (L15): sonda „oferta bez skutku" — komenda z panelu (po kluczu
     * commandOptionKey) wykonana na KLONIE stanu z pasywnym przeciwnikiem;
     * opis skutku dla detektora detectNoEffectOffers. Nigdy nie dotyka
     * prawdziwej partii — klon jest w pełni niezależny (structuredClone).
     */
    probeCommandEffect(optionKey) {
      const view = playerView(state, HUMAN_ID);
      const cmd = view.legalCommands.find((c) => commandOptionKey(c) === optionKey);
      if (!cmd) return { ok: false, reason: 'option_not_found' };
      if (cmd.type === 'pass_priority' || cmd.type === 'concede') {
        return { ok: false, reason: 'pass_or_concede' };
      }
      return probeCommandEffect(state, cmd);
    },
    /** Wykonuje komendę człowieka przez protokół; zwraca { ok, reason?, botPause? }. */
    apply(cmd) {
      // M90 (bug B, zgłoszenie właściciela 2026-08-14): stan sesji zmienia
      // WYŁĄCZNIE zaakceptowana komenda. Wcześniej `apply` czyścił bufor
      // modala i kasował pauzę bota PRZED `execute()` — gdy engine odrzucił
      // komendę (`not_priority`, bo priorytet miał bot wstrzymany pauzą),
      // gracz zostawał bez pauzy i bez „▶ Wznów grę bota": w legalCommands
      // było samo `concede`, czyli ekran „Poddaj partię" bez wyjścia.
      const result = execute(state, cmd);
      if (!result.ok) {
        sessionLog('rejection', `Ruch odrzucony: ${rejectionReasonLabel(result.events[0]?.reason)}`);
        return { ok: false, reason: result.events[0]?.reason };
      }
      // Modal „Ruch bota" ma pokazywać odpowiedź na TEN ruch gracza,
      // a nie historię od początku partii.
      // M100/E8: zapamiętaj niepokazany nagłówek tury (para z dobraniem —
      // patrz niżej). Zwykła odpowiedź na komendę historii nagłówków nie
      // zatrzymuje (M90 stoi).
      const pendingTurnHeader = botMoves.find((m) => m.type === 'turn_started');
      botMoves.length = 0;
      // Konsument nie powinien aplikować komendy w trakcie pauzy (UI blokuje
      // ją modalem) — po UDANEJ komendzie niedokończoną pauzę ignorujemy
      // i gramy dalej.
      awaitingBotAck = false;
      let ownDraw = false;
      for (const e of result.events) {
        // M151: główny log gracza nie przyjmuje szumu (mana/fazy) — patrz
        // MAIN_LOG_NOISE; noteBotMove/recordTurnEvent mają własne bramki.
        if (MAIN_LOG_NOISE.has(e.type)) { noteBotMove(e); recordTurnEvent(e); continue; }
        const text = describeEvent(e);
        if (text) sessionLog('event', text);
        // M100/E2 (symetria rozstrzygnięć): komenda CZŁOWIEKA też może
        // rozstrzygnąć stos (jego własny pass, pass bota po jego rzucie).
        // noteBotMove rejestruje rzut na stosie i wpuszcza do modala linie
        // z rodziny rozstrzygnięć; echo decyzji człowieka (jego własny rzut,
        // ląd) filtruje ta sama bramka co dotychczas.
        noteBotMove(e);
        recordTurnEvent(e);
        // M100/E8: własne dobranie (klik „dobierz kartę" w kroku dobierania
        // albo dobranie z efektu rozstrzygniętego w tej komendzie) ma dać
        // komunikat w „Rozgrywka" (UX właściciela 2026-08-15).
        if (e.type === 'card_drawn' && e.playerId === HUMAN_ID) ownDraw = true;
      }
      advance();
      // M100/E8: modal własnego dobrania pokazuje parę nagłówkową tury
      // („Tura N — Ty" + „Ty dobiera: X"), nie samą linię — kontekst M98.
      if (ownDraw && pendingTurnHeader && pendingTurnHeader.text.startsWith(`Tura ${state.turn.number} — `)) {
        botMoves.unshift(pendingTurnHeader);
      }
      if (ownDraw && pauseOnBotMoves && !awaitingBotAck) awaitingBotAck = true;
      return { ok: true, botPause: awaitingBotAck };
    },
    /** Sesja czeka na potwierdzenie istotnego zagraniu bota (klik gracza). */
    get botPausePending() { return awaitingBotAck; },
    /**
     * Wznawia grę po pauzie na istotnym zagraniu bota: rozgrywa kolejne ruchy
     * do następnej pauzy albo okna decyzyjnego człowieka (klik = „rozumiem").
     * Bez pauzy jest no-op.
     */
    continueBotPlay() {
      if (!awaitingBotAck) return { ok: true, botPause: false };
      advance();
      return { ok: true, botPause: awaitingBotAck };
    },
    /**
     * Feature 2026-08-11: po zmianie zbioru wyciszonych opcji przewija grę,
     * jeśli bieżące okno człowieka nie ma już żadnej nie-wyciszonej decyzji
     * (auto-pass do następnego realnego okna / tury bota). No-op, gdy okno
     * nadal wymaga decyzji.
     */
    recheckAutoPass() {
      advance();
      return { ok: true, botPause: awaitingBotAck };
    },
    /** Odtwarza zapis partii w TYM samym składzie talii; zwraca podsumowanie. */
    resumeReplayText(text) {
      const replay = parseReplay(text);
      const fresh = setupCardMatch({ seed: replay.seed, players: names, decks, registry });
      const played = playReplay(replay, () => fresh, execute);
      const rejected = played.results.filter((r) => !r.ok);
      if (rejected.length > 0) {
        throw new Error(`Zapis zawiera ${rejected.length} odrzuconych komend — nie da się wznowić`);
      }
      state = played.state;
      bot = botFactory(seed + 1 + replay.commands.length, botCtx);
      reasoning.length = 0; // świeży bot = świeży ślad decyzji
      // Świeży przebieg tur: historia przed wznowieniem nie dotyczy nowej gry.
      turnHistory.length = 0;
      currentTurn = { number: state.turn.number, activePlayerId: state.turn.activePlayerId, lines: [] };
      sessionLog('system', `Wznowiono zapis (${replay.commands.length} komend).`);
      // Bufor modala mógł napełnić się przy startowym advance() świeżej
      // sesji (startGame) — wznowienie pokazuje wyłącznie akcję po zapisie.
      botMoves.length = 0;
      advance();
      return { steps: replay.commands.length, status: state.status };
    },
    importReplayText(text) {
      const replay = parseReplay(text);
      const fresh = setupCardMatch({ seed: replay.seed, players: names, decks, registry });
      const played = playReplay(replay, () => fresh, execute);
      const rejected = played.results.filter((r) => !r.ok);
      return {
        steps: replay.commands.length,
        rejected: rejected.length,
        status: played.state.status,
        winner: played.state.winnerId == null ? null : who(played.state.winnerId),
        fingerprint: stateFingerprint(played.state),
      };
    },
  };
  return exposed;
}
