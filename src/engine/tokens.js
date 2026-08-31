import { event } from '../protocol/types.js';
import { createGameObject } from './identity.js';
import { effectivePower, effectiveToughness } from './permanents.js';

/**
 * Tokeny: uproszczone stałe obiekty gry, tworzone z reguły (np. efekt czaru).
 * Moduł celowo nie importuje game-state.js (unika cykli w sklejaniu artefaktu);
 * tworzy obiekt bezpośrednio przez createGameObject i jawne strefy.
 */

/** Stała definicja tokenu (do rozszerzeń poza engine). */
export function createToken({ name = 'Token', kind = 'creature', power = 1, toughness = 1, colors = [], types = [], subtypes = [] }) {
  if (!name || !kind) throw new TypeError('Token musi mieć nazwę i rodzaj');
  return Object.freeze({
    kind, cardId: 'token_' + name.toLowerCase().replace(/\s+/g, '_'),
    name, colors, power, toughness, summoningSickness: true,
    tapped: false, damage: 0, zone: 'battlefield', controllerId: null,
    types: Object.freeze([...types]), subtypes: Object.freeze([...subtypes]),
  });
}

/**
 * Tworzy token na polu bitwy kontrolera. Wywoływane z efektu czaru/zdolności;
 * token dostaje `summoningSickness` (jak świeżo zagrany permanent).
 * `types`/`subtypes` pozwalają tworzyć tokeny-landy (np. Forest Dryad Jyoti:
 * land creature — walczy jako stwór, a dzięki types ['Land','Creature'] może
 * też być tapnięty na manę).
 */
/**
 * M172/D (uwaga właściciela): kolejny wolny numer kopii dla nazwy —
 * token-kopia wyświetla się jako „Nazwa (kopia N)", żeby dało się ją
 * odróżnić od oryginału przy wyborze celów i bloków. Numer po ŻYWYCH
 * kopiach tej nazwy na polu bitwy (deterministycznie, ADR 0005).
 */
export function nextCopyNumber(state, name) {
  let max = 0;
  for (const id of state.zones.battlefield) {
    const object = state.objects.get(id);
    if (object?.copyNumber > 0 && object.name === name) max = Math.max(max, object.copyNumber);
  }
  return max + 1;
}

export function createBattlefieldToken(state, controllerId, { cardId, name, kind = 'creature', power = 1, toughness = 1, colors = [], types = [], subtypes = [], keywords = [], abilities = [], cantBlock = false, toxic = null, transformTo = null, frontFaceId = null, station = null, saga = null, tapped = false, copyNumber = null, manaCost = 0 }) {
  if (!state || !state.players.some((p) => p.id === controllerId)) throw new Error('Nieznany kontroler tokenu');
  if (!cardId || !name) throw new TypeError('Token wymaga cardId i nazwy');
  // Token niebędący stworem (np. Treasure — artefakt) nie ma statystyk:
  // power/toughness są wtedy null, jak u każdego permanentu bez P/T.
  const isCreature = kind === 'creature';
  if (!isCreature) { power = null; toughness = null; }
  if (isCreature && (!Number.isInteger(power) || !Number.isInteger(toughness) || power < 0 || toughness < 0)) {
    throw new RangeError('Statystyki tokenu muszą być nieujemnymi liczbami całkowitymi');
  }
  const instanceId = `token-instance-${state.objectSequence}`;
  const id = `token-${state.objectSequence++}`;
  const base = createGameObject({
    id, instanceId, cardId, controllerId, zone: 'battlefield',
    kind, power, toughness,
    // CR 707.3/202.3b (M258): zwykły token ma MV 0, ale token-KOPIA
    // dziedziczy koszt many pierwowzoru (wywołujący przekazuje
    // copyManaValueOf(...) — patrz create_copy_token, Moonlit Meditation).
    manaCost, abilities,
    keywords, types, subtypes, colors,
    // Właścicielem tokenu jest gracz, pod czyją kontrolą wszedł na pole bitwy
    // (CR 111.2) — istotne przy efektach „creatures they own".
    ownerId: controllerId,
    // CR 111: jawny znacznik tokenu — SBA CR 704.5e usuwa token, który
    // znalazł się poza polem bitwy.
    isToken: true,
    ...(station ? { station } : {}),
    ...(saga ? { saga } : {}),
  });
  const token = Object.freeze({
    ...base, name, summoningSickness: true,
    // M172/D: numer kopii (tylko tokeny-kopie) — warstwy nazw pokazują
    // „Nazwa (kopia N)".
    ...(copyNumber ? { copyNumber } : {}),
    // Static Net (BRO): „create a tapped Powerstone token\" — token WCHODZI
    // na pole bitwy zatapniętny (enters tapped), co nie jest „becomes tapped\"
    // (CR 701.21a — brak zdarzenia object_tapped jest poprawny). L24/C.
    ...(tapped ? { tapped: true } : {}),
    enteredOnTurn: state.turn.number,
    // „This token can't block\" (Phyrexian Mite, Goblin Construct) to cecha
    // WYDRUKOWANA na tokenie, a nie efekt „until end of turn\" — cleanup
    // (CR 514.2) zdejmuje wyłącznie te drugie. Pole `cantBlock` niesie oba
    // znaczenia naraz (klasa L14: jedna instrukcja, dwie zasady), więc token
    // dostaje DODATKOWO trwały znacznik `cantBlockPrinted`, którego cleanup
    // nie rusza. Odczyt idzie przez creatureCantBlock() (permanents.js).
    ...(cantBlock ? { cantBlock: true, cantBlockPrinted: true } : {}),
    ...(toxic != null ? { toxic } : {}),
    // CR 707.8a: token-kopia permanentu dwustronnego jest tokenem
    // dwustronnym — niesie deskryptor drugiej strony i może się przemienić
    // (craft/transform). Tokeny tworzone „z własnym zestawem cech" (Treasure,
    // Insect itd.) nie dostają tego pola.
    ...(transformTo ? { transformTo } : {}),
    // M264/2.3 (CR 707.8a): tożsamość twarzy PRZEDNIEJ pary — inaczej
    // `copyManaValueOf` (MV 0 dla kopii tyłu, 202.3b) i reset K5 (711.4a)
    // nie rozpoznają dwustronnego tokenu. Idzie w parze z transformTo:
    // bez drugiej strony nie ma czego identyfikować jako pary.
    ...(transformTo && frontFaceId ? { frontFaceId } : {}),
  });
  state.objects.set(id, token);
  state.zones.battlefield.push(id);
  // M100/E10 (P3 — Żywy Tester h04): zdarzenie niesie statystyki EFEKTYWNE
  // (widziane po wejściu na pole bitwy), nie surowe z definicji — CDA jak
  // „Tarmogoyf: typy kart w grobach" działa od razu (CR 613.3, SBA po ETB),
  // a komunikat „tworzysz token Tarmogoyf (0/0)" kłamał (na stole 3/4).
  // Import permanents.js jest bezpieczny (brak cyklu: permanents nie
  // importuje tokens).
  const effPower = isCreature ? effectivePower(token, state) : null;
  const effToughness = isCreature ? effectiveToughness(token, state) : null;
  state.events.push(event('token_created', { objectId: id, cardId, controllerId, name, power: effPower, toughness: effToughness }));
  // Token wchodzi na pole bitwy natychmiast po utworzeniu; jawne zdarzenie ETB
  // pozwala generycznym zdolnościom tokenu działać tak samo jak zdolnościom
  // zwykłego permanenta (np. Reliquary Dragon z Dragonbroods' Relic).
  state.events.push(event('permanent_entered_battlefield', {
    objectId: id, object: token, cardId, controllerId, token: true,
  }));
  return token;
}
