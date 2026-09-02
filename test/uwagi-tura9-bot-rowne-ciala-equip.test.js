// Pytanie kontrolne właściciela po turze 8 (2026-09-02), dotyczy uwagi C:
//   „W zgłoszeniu chodziło głównie o to, że bot przerzucił equipment dwa razy na
//   równe swoje kreatury. Żadna z nich nie weszła na stół w tej turze. Naprawiłeś
//   to, żeby nie przerzucał na kreaturę, której ten equipment nic nie daje, i to
//   jest super. Ale gdyby były dwie kreatury, którym obu ten equipment daje pompę,
//   to czy zablokowane jest bezsensowne wydawanie many na dwukrotne przerzucanie?
//   Chodzi o to, żeby wybrał najlepszy cel i tam już zostawił, a nie zaraz
//   przerzucał na inną kreaturę, której też coś daje."
//
// Odpowiedź, którą poniżej zaciskamy: TAK. Gałąź przeniesienia (`wornByMine` w
// `heuristic-bot.js`) jest DRABINĄ o trzech szczeblach i każdy z nich jest
// jest antysymetryczna, więc ruch w tę i z powrotem nie ma jak być dodatni po
// obu stronach:
//   1) celowi sprzęt nic nie dodaje            -> score -= 12  (veto z tury 8)
//   2) celowi dodaje WIĘCEJ niż nosicielowi    -> score += 4 + różnica  (naprawa)
//   3) ciało o >= 2 siły większe I ładunek nie gorszy -> score += 4 + delta
//   4) cokolwiek innego (w tym dwa równe ciała, którym pompuje tak samo)
//                                              -> score -= 6  (pass wygrywa)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId = 'p1') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `brak karty ${cardId} w katalogu`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def),
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    abilities: def.abilities ?? [], equipment: def.equipment,
    power: def.power, toughness: def.toughness,
  });
}

/**
 * Stół z SAMYMI prawdziwymi kartami (bez nadpisywania statystyk — patrz L120:
 * widok projektuje to, co liczy silnik, a nie to, co wstawimy w obiekt).
 * Sprzęt `eqCard` przypięty do `worn`, na polu bitwy `kreatury`.
 */
function stow({ eqCard = 'wooden-stake', worn = null, creatury = ['highland-game', 'leafcrown-dryad'] } = {}) {
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 20, { W: 4, U: 4, B: 4, R: 4, G: 4 });
  addMana(state, 'p2', 2);
  put(state, 'eq', eqCard);
  for (const karta of creatury) put(state, karta, karta);
  if (worn) state.objects.set('eq', Object.freeze({ ...state.objects.get('eq'), attachedTo: worn }));
  return state;
}

/** Oceny wszystkich ofert equipu sprzętu `eq` w bieżącym stanie stołu. */
function oceny(state) {
  const bot = createHeuristicBot({ seed: 1 });
  const pick = bot.chooseCommand(playerView(state, 'p1'), {});
  const opcje = bot.trace()[0].options;
  const equip = opcje
    .filter((o) => o.cmd.startsWith('activate_ability(eq'))
    .map((o) => ({ cel: (o.cmd.match(/->([\w-]+)/) ?? [null, null])[1], score: o.score, cmd: o.cmd }));
  return { pick, equip, wszystkie: opcje };
}

const cel = (ocenyObj, nazwa) => ocenyObj.equip.find((o) => o.cel === nazwa)?.score;

// Bot ma pełne prawo wybrać w tym kroku inną aktywację (np. zdolność własnego
// stwora) — badamy tylko, czy NIE płaci za equip złamanego sprzętu.
function placZaEquip(r) {
  return r.pick.type === 'activate_ability' && r.pick.objectId === 'eq';
}

test('T9/1: dwa równe ciała, oba profitują z pompy — przeniesienie jest ujemne', () => {
  // Wooden Stake: +1/+0, equip {1}. Highland Game 2/1 nosi, Leafcrown Dryad 2/2
  // czeka. Oba ciała dostają dokładnie tyle samo pumpy, różnią się tylko
  // wytrzymałością — czyli przeprowadzka to czysta strata many.
  const r = oceny(stow({ worn: 'highland-game' }));
  const naDryade = cel(r, 'leafcrown-dryad');
  assert.ok(naDryade !== undefined, `oczekiwano oferty na drugie ciało: ${JSON.stringify(r.equip)}`);
  assert.ok(naDryade < 0, `przepięcie między równymi nosicielami musi być karane: ${naDryade.toFixed(2)}`);
  assert.equal(placZaEquip(r), false,
    `bot nie płaci za ruch, który nie zmienia planszy (wybrał: ${JSON.stringify(r.pick)})`);
});

test('T9/2: droższy sprzęt z pompą +2/+2 i keywordem — ten sam wyrok', () => {
  // Brawler's Plate (equip {4}, +2/+2, trample). Keyword nie robi tu różnicy:
  // oba ciała dostają identyczny ładunek, więc próg „wyraźnej poprawy" nie pada.
  const r = oceny(stow({ eqCard: 'brawlers-plate', worn: 'highland-game' }));
  const naDryade = cel(r, 'leafcrown-dryad');
  assert.ok(naDryade < 0, `pompowanie równorzędnego ciała za {4}: ${naDryade?.toFixed(2)}`);
});

test('T9/3: drabina jest antysymetryczna — ping-pong nie ma jak powstać', () => {
  // Własność, o którą pyta właściciel: jeśli przeniesienie X->Y jest dodatnie,
  // to Y->X musi być ujemne. Badamy wszystkie pary na jednym stole, na dwóch
  // różnych sprzętach — 40 konfiguracji, zero wyjątków.
  const ciala = ['highland-game', 'leafcrown-dryad', 'midnight-guard', 'undead-servant', 'marut'];
  let dodatnich = 0;
  for (const eqCard of ['wooden-stake', 'brawlers-plate']) {
    for (const x of ciala) {
      for (const y of ciala) {
        if (x === y) continue;
        const naY = cel(oceny(stow({ eqCard, worn: x, creatury: ciala })), y);
        const naX = cel(oceny(stow({ eqCard, worn: y, creatury: ciala })), x);
        if (naY === undefined || naX === undefined) continue;
        if (naY > 0) {
          dodatnich += 1;
          assert.ok(naX < 0,
            `${eqCard}: ${x}->${y} = ${naY.toFixed(2)} dodatnie, a odwrotne ${y}->${x} = ${naX.toFixed(2)} `
            + 'też dodatnie — drabina przestała być antysymetryczna (ping-pong możliwy)');
        }
      }
    }
  }
  assert.ok(dodatnich >= 3,
    `test musi realnie widzieć dozwolone awanse (inaczej nic nie sprawdza): ${dodatnich}`);
});

test('T9/4: w jednym kroku wybiera NAJLEPSZE ciało, nie idzie po schodkach', () => {
  // Sprzęt na Highland Game (2/1), obok Leafcrown Dryad (2/2) i Marut (7/7).
  // Sensowny ruch jest jeden: od razu na Maruta (ciało +5 siły); sucha wycena
  // dryady musi pozostać poniżej zera — bez tego bot płaciłby equip dwukrotnie
  // w tej samej turze (2/1 -> 2/2 -> 7/7).
  const r = oceny(stow({ worn: 'highland-game', creatury: ['highland-game', 'leafcrown-dryad', 'marut'] }));
  const dodatnie = r.equip.filter((o) => o.score > 0).map((o) => o.cel);
  assert.deepEqual(dodatnie, ['marut'],
    `tylko lepsze ciało ma dodatnią wycenę equipu: ${JSON.stringify(r.equip)}`);
  if (placZaEquip(r)) {
    assert.deepEqual(r.pick.targets, ['marut'],
      `jeśli bot już płaci za equip, to tylko za najlepszy cel: ${JSON.stringify(r.pick)}`);
  }
});

test('T9/5: sprzęt na ciele, które nie może atakować, schodzi na atakującego', () => {
  // Anty-over-fix dla T9/1: blokada przepięcia między RÓWNYMI ciałami nie może
  // uwięznąć pumpu na defenderze. Monastery Flock (0/5, defender) nosi Wooden
  // Stake, a obok stoi Undead Servant (3/2) — przeniesienie jest awansem i musi
  // mieć dodatnią wycenę.
  const r = oceny(stow({ worn: 'monastery-flock', creatury: ['monastery-flock', 'undead-servant'] }));
  const naSerwanta = cel(r, 'undead-servant');
  assert.ok(naSerwanta > 0,
    `przeniesienie znad defenddera na atakującego to poprawa planszy: ${naSerwanta?.toFixed(2)}`);
});

test('T9/6: pompa NIE zostaje na ciele, które nie umie jej użyć (M289)', () => {
  // To jest druga strona T9/1 i odpowiada na drugą część pytania właściciela
  // („żeby wybrał najlepszy cel i tam zostawił"). Wishful Merfolk (3/2, defender)
  // nosi Wooden Stake, kandydatem jest Undead Servant (3/2). Przed turą 9 ładunek
  // liczono od samej pompy, więc oba ciała były równe i drabina kazała stać —
  // sprzęt zakotwiczał się na stworze, który nigdy nie zaatakuje. Po M289
  // `equipValuation` pyta, czy nosiciel umie spożytkować siłę: na defenderze
  // +1 siły warte jest połowę (bilans bloku), na atakującym całe (obrażenia
  // graczowi), więc przeprowadzka jest poprawą i ma dodatnią wycenę.
  const r = oceny(stow({ worn: 'wishful-merfolk', creatury: ['wishful-merfolk', 'undead-servant'] }));
  const naSerwanta = cel(r, 'undead-servant');
  assert.ok(naSerwanta > 0,
    `wyciągnięcie pompy znad defenddera to poprawa, nie ruch boczny: ${naSerwanta?.toFixed(2)}`);
  // Anty-over-fix w drugą stronę: dwa ciała, OBA atakujące, pompa daje im tyle
  // samo — tu nadal nie ma po co płacić (por. T9/1).
  const bocznie = oceny(stow({ worn: 'highland-game', creatury: ['highland-game', 'leafcrown-dryad'] }));
  assert.ok(cel(bocznie, 'leafcrown-dryad') < 0, 'ruch boczny między atakującymi zostaje zablokowany');
});

test('T9/7: strażnik progów — drabina ma trzy szczeble w jednym miejscu', () => {
  // Numery progów są tu, a nie w głowie następnego autora: luzowanie „delta >= 2"
  // albo kary „-6" to zmiana wagowa i wymaga benchmarku (ADR 0018).
  const src = fs.readFileSync('src/controllers/heuristic-bot.js', 'utf8');
  const start = src.indexOf('const wornByMine');
  assert.ok(start > 0, 'gałąź przeniesienia sprzętu istnieje');
  const cialo = src.slice(start, start + 2200);
  assert.match(cialo, /if \(payload\.nothingAdded\) score -= 12;/, '1) szczebel: przeniesienie w próżnię = kara jak przy rzucie');
  assert.match(cialo, /payload\.value > wornPayload\.value/, '2) szczebel: naprawa = wyraźnie lepszy ładunek');
  assert.match(cialo, /delta >= 2 && payload\.value >= wornPayload\.value/, '3) szczebel: ciało >= 2 siły i ładunek nie gorszy');
  assert.match(cialo, /else score -= 6;/, '4) szczebel: wszystko inne (w tym dwa równe ciała) jest karane');
});

test('T9/8: „czy nosiciel umie użyć pompy" ma JEDNO miejsce w modelu (L28)', () => {
  // Reguła z M289 nie może urodzić się drugi raz w gałęzi przeniesienia —
  // wtedy mielibyśmy dwa modele świata i znowu rozjazd typu „przeniesienie
  // liczy tylko delta" (to była przyczyna zgłoszenia C).
  const src = fs.readFileSync('src/controllers/heuristic-bot.js', 'utf8');
  const start = src.indexOf('function equipValuation');
  assert.ok(start > 0, 'wspólna wycena ładunku istnieje');
  const cialo = src.slice(start, src.indexOf('\n  }', start));
  const atk = (cialo.match(/attackerNeutralizedByProtection\(/g) ?? []).length;
  assert.equal(atk, 1, `obrona przed jałowym atakiem liczona raz (jest ${atk})`);
  assert.match(cialo, /creature\.cantAttackStatic === true/, 'obrona przed defenderem/detainem liczona w tej samej funkcji');
  assert.match(cialo, /atakJa\u0142owy \? pumpPower : 2 \* pumpPower/, 'waga pompy zależy od spożytkowania (pół na ciele, które nie atakuje)');
  const uses = (src.match(/equipValuation\(view, source,/g) ?? []).length;
  assert.ok(uses >= 3, `wycena wywoływana w definicji i w obu gałęziach equipu (jest ${uses})`);
});
