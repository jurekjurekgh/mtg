// PMSSB-62 (batch 67) — powtarzalna sonda pomiarowa.
//
// Metoda (M429): realny `createHeuristicBot`, randomness/lookahead = 0, seed
// 2067, punkty z `trace()`. Wartości PRZED zapisano w planie PMSSB-62; ta sama
// macierz służy do pomiaru PO, więc nie porównujemy różnych fixture'ów.
//
// Uruchomienie: node tools/pmssb62-batch67-sonda.mjs
//
// Findingi mierzone (z rozpoznania kodu, plan PMSSB-62):
//   F1 `you_draw_second_card_each_turn` (Improbable Alliance) — brak w bocie
//   F2 obniżka kosztu zdolności aktywowanej (Battlefield Butcher)
//   F3 obniżka kosztu CZARU `perCreatureAttackingYou` (Sentry Bot)
//   F4 koszt ENERGII na ścieżce triggera (`trigger.payEnergy`, Sentry Bot)
//   F5 wartość `get_energy` (stała vs dynamiczna kwota; konsument w talii)
//   F6 rider `dies` → Food na tokenie Boara (Wolf's Quarry)
//   Kontrole dodatnie: F7 battle cry (Kuldotha), F8 Cancel, F9 Spellkeeper
//     (zwrot z grobu), F10 Intrepid Tenderfoot (licznik w main).
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry, REAL_CARDS, VIRTUAL_BASIC_LANDS } from '../src/cards/card-data.js';
import { createRegistry } from '../src/cards/registry.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
const SEED = 2067;
const allDefs = () => [...REAL_CARDS, ...VIRTUAL_BASIC_LANDS];
function registryKontra(id, mut, extras = []) {
  return createRegistry([...allDefs().map((c) => (c.id === id ? mut({ ...c }) : c)), ...extras]);
}
function scene({ registry = REG, many = 14, step = 'main', active = 'p1', priority = active,
  lib = 30, setup = () => {} } = {}) {
  const s = createGameState({ seed: SEED, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, active);
  s.turn.activePlayerId = active; s.turn.priorityPlayerId = priority;
  if (many > 0) addMana(s, priority, many);
  for (const pid of ['p1', 'p2']) for (let i = 0; i < lib; i++) {
    addObject(s, {
      id: `lb-${pid}-${i}`, instanceId: `i-lb-${pid}-${i}`, cardId: 'x',
      controllerId: pid, ownerId: pid, zone: 'library', kind: 'sorcery', power: 0,
      toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [],
      types: ['Sorcery'], colors: [], cardName: 'lb',
    });
  }
  setup(s, registry);
  s.__registry = registry;
  return s;
}
function put(s, id, cardId, controllerId = 'p1', zone = 'battlefield', registry = REG, patch = {}) {
  const def = registry.get(cardId);
  if (!def) throw new Error(`brak karty ${cardId}`);
  addObject(s, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  const cur = s.objects.get(id);
  s.objects.set(id, Object.freeze({ ...cur, summoningSickness: false, ...patch }));
  return s.objects.get(id);
}
function creature(s, id, who, p, t, patch = {}) {
  addObject(s, { id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId: who,
    ownerId: who, zone: 'battlefield', kind: 'creature', power: p, toughness: t,
    manaCost: Math.max(p, 1), abilities: [], keywords: [], subtypes: [], types: ['Creature'],
    colors: [], cardName: id, summoningSickness: false, ...patch });
  const cur = s.objects.get(id);
  s.objects.set(id, Object.freeze({ ...cur, summoningSickness: false, ...patch }));
}
function options(s, botOptions = {}) {
  const b = createHeuristicBot({ seed: SEED + 1, registry: s.__registry ?? REG, ...botOptions });
  const choice = b.chooseCommand(playerView(s, s.turn.priorityPlayerId));
  return { choice, options: b.trace().at(-1)?.options ?? [] };
}
function show(label, s, filter = () => true, botOptions = {}) {
  const got = options(s, botOptions);
  const rows = got.options.filter(filter);
  console.log(`\n${label}`);
  console.log(` choice: ${JSON.stringify(got.choice)}`);
  console.log(rows.length
    ? rows.map((o) => `  ${o.cmd} = ${o.score.toFixed(4)}`).join('\n')
    : `  BRAK; all=${got.options.slice(0, 14).map((o) => `${o.cmd}:${o.score.toFixed(2)}`).join(' | ')}`);
  return rows;
}
const starts = (prefix) => (o) => o.cmd.startsWith(prefix);
const includes = (piece) => (o) => o.cmd.includes(piece);

/** Atak p2 na p1: `n` atakujących (widok obu graczy niesie `combat`). */
function atakNaP1(st, n, { attackerPower = 2 } = {}) {
  const ids = [];
  for (let i = 1; i <= n; i += 1) {
    const id = `atk${i}`;
    creature(st, id, 'p2', attackerPower, attackerPower, { attacking: true });
    ids.push(id);
  }
  st.combat = {
    attackingPlayerId: 'p2', defendingPlayerId: 'p1', attackers: ids,
    blockers: new Map(), blockedAttackers: new Set(),
  };
  return ids;
}

console.log('=== PMSSB-62 batch 67 — powtarzalna sonda scoringu ===');

// F1 Improbable Alliance: trigger drugiej karty → token; wycena rzutu zaklęcia.
const iaBezTriggera = registryKontra('improbable-alliance', (d) => ({
  ...d, abilities: (d.abilities ?? []).filter((a) => a.trigger?.event !== 'you_draw_second_card_each_turn'),
}));
function iaCast(registry = REG) {
  return scene({ registry, setup: (st, r) => put(st, 'ia', 'improbable-alliance', 'p1', 'hand', r) });
}
// F1 BRAMKA (anty-over-fix M429): ten sam trigger, ale BEZ źródła drugiego
// dobrania w widoku (karta traci własną aktywację doboru) → dowód znika.
const iaBezDobierania = registryKontra('improbable-alliance', (d) => ({
  ...d, abilities: (d.abilities ?? []).filter((a) => a.type !== 'activated'),
}));
show('F1 Improbable Alliance — rzut (pełna)', iaCast(), includes('(ia'));
show('F1 KONTRA bez triggera drugiej karty — rzut', iaCast(iaBezTriggera), includes('(ia'));
show('F1 BRAMKA trigger bez źródła dobrania — rzut', iaCast(iaBezDobierania), includes('(ia'));

// F2 Battlefield Butcher: aktywacja {5},{T} z obniżką za karty-stwory w grobie.
function butcherScene(licznikGrobow) {
  return scene({ many: 8, setup: (st) => {
    put(st, 'butcher', 'battlefield-butcher', 'p1', 'battlefield');
    for (let i = 1; i <= licznikGrobow; i += 1) put(st, `gr${i}`, 'intrepid-tenderfoot', 'p1', 'graveyard');
  }});
}
show('F2 Butcher — 0 kart w grobie (koszt {5})', butcherScene(0), starts('activate_ability'));
show('F2 Butcher — 3 karty w grobie (koszt {2})', butcherScene(3), starts('activate_ability'));
show('F2 Butcher — 5 kart w grobie (koszt {0})', butcherScene(5), starts('activate_ability'));
// Kontrfakt MUSI ciąć obniżkę tam, gdzie ona JEST: u Butchera siedzi na
// zdolności AKTYWOWANEJ (`abilities[0].costReduction`), nie na karcie —
// stara wersja (fala A) była bezskuteczna (oba warianty dawały tę samą liczbę).
const butcherBezObnizki = registryKontra('battlefield-butcher', (d) => ({
  ...d, abilities: (d.abilities ?? []).map((a) => ({ ...a, costReduction: undefined })),
}));
function butcherKontra(reg) {
  return scene({ registry: reg, many: 8, setup: (st, r) => {
    put(st, 'butcher', 'battlefield-butcher', 'p1', 'battlefield', r);
    for (let i = 1; i <= 5; i += 1) put(st, `gr${i}`, 'intrepid-tenderfoot', 'p1', 'graveyard', r);
  }});
}
show('F2 KONTRA bez obniżki (5 kart w grobie) — aktywacja', butcherKontra(butcherBezObnizki), starts('activate_ability'));

// F3 Sentry Bot: obniżka kosztu CZARU za każdego atakującego ciebie (S11).
const sentryBezObnizki = registryKontra('sentry-bot', (d) => ({ ...d, costReduction: undefined }));
function sentryCast(liczbaAtakujacych, { registry = REG, many = 5 } = {}) {
  return scene({ registry, many, step: 'main', setup: (st, r) => {
    put(st, 'bot', 'sentry-bot', 'p1', 'hand', r);
    if (liczbaAtakujacych > 0) atakNaP1(st, liczbaAtakujacych);
  }});
}
show('F3 Sentry Bot — 0 atakujących (koszt {4}{W})', sentryCast(0), includes('(bot'));
show('F3 Sentry Bot — 2 atakujących (koszt {2}{W})', sentryCast(2), includes('(bot'));
show('F3 Sentry Bot — 4 atakujących (koszt {W})', sentryCast(4), includes('(bot'));
show('F3 KONTRA bez obniżki, 2 atakujących — rzut', sentryCast(2, { registry: sentryBezObnizki }), includes('(bot'));
// Dokładnie tyle many, ile wymaga silnik po obniżce ({2}{W} = 3 many).
show('F3 Sentry Bot — 2 atakujących i DOKŁADNIE 3 many', sentryCast(2, { many: 3 }), includes('(bot'));
show('F3 KONTRA bez obniżki, 2 atakujących, 3 many (silnik: brak oferty)',
  sentryCast(2, { registry: sentryBezObnizki, many: 3 }), includes('(bot'));

// F4 Sentry Bot: opcjonalna opłata {E}{E}{E} na początku walki.
function sentryPay(energia, atakujacych = 2, ownDeck = null) {
  return {
    state: scene({ many: 0, step: 'beginning_of_combat', setup: (st) => {
      put(st, 'bot', 'sentry-bot', 'p1', 'battlefield');
      creature(st, 'moj', 'p1', 1, 1);
      st.players.find((p) => p.id === 'p1').energy = energia;
      st.pendingOptionalPay = {
        playerId: 'p1', sourceId: 'bot',
        ability: { type: 'triggered', trigger: { event: 'beginning_of_combat', payEnergy: 3 }, effect: { type: 'add_counter_to_creatures_you_control', counter: '+1/+1', amount: 1 } },
        onResolution: true,
      };
    }}),
    ownDeck,
  };
}
{
  const { state } = sentryPay(3);
  show('F4 Sentry Bot — decyzja o opłacie {E}{E}{E} (3 liczniki, jest mój stwór)',
    state, (o) => o.cmd.startsWith('resolve_optional_pay_choice'));
}
{
  // S11: koszt 3 liczników energii NIE MOŻE remisować z darmową opłatą —
  // kontrfakt: ten sam stan, ale trigger bez `payEnergy` (opłata darmowa).
  const s = scene({ many: 0, step: 'beginning_of_combat', setup: (st) => {
    put(st, 'bot', 'sentry-bot', 'p1', 'battlefield');
    creature(st, 'moj', 'p1', 1, 1);
    st.players.find((p) => p.id === 'p1').energy = 3;
    st.pendingOptionalPay = {
      playerId: 'p1', sourceId: 'bot',
      ability: { type: 'triggered', trigger: { event: 'beginning_of_combat' }, effect: { type: 'add_counter_to_creatures_you_control', counter: '+1/+1', amount: 1 } },
      onResolution: true,
    };
  }});
  show('F4 KONTRA — ta sama decyzja bez kosztu energii (darmowa)', s,
    (o) => o.cmd.startsWith('resolve_optional_pay_choice'));
}
{
  // Antycypacja: rzut Sentry Bota z energią w puli vs bez energii — na stole
  // cztery własne stwory, bo payoff opłaty („+1/+1 na każdym") rośnie z pulpą.
  const plansza = (st) => {
    put(st, 'bot', 'sentry-bot', 'p1', 'hand');
    for (let i = 1; i <= 4; i += 1) creature(st, `moj${i}`, 'p1', 3, 3);
  };
  const bez = scene({ setup: plansza });
  show('F4 Antycypacja rzutu — 0 energii, 4 własne stwory', bez, includes('(bot'));
  const z = scene({ setup: (st) => { plansza(st); st.players.find((p) => p.id === 'p1').energy = 3; } });
  show('F4 Antycypacja rzutu — 3 liczniki, 4 własne stwory', z, includes('(bot'));
}

// F5 Energia: wartość `get_energy` (stała vs dynamiczna) przy konsumencie w talii.
function morayScene() {
  return scene({ many: 0, setup: (st) => {
    put(st, 'moray', 'shipwreck-moray', 'p1', 'battlefield');
    creature(st, 'moj', 'p1', 2, 2);
    st.players.find((p) => p.id === 'p1').energy = 1;
  }});
}
show('F5 Shipwreck Moray — aktywacja {E} (konsument energii, cel: własny stwór)', morayScene(), starts('activate_ability'));

// F6 Wolf's Quarry: rider `dies` → Food na tokenie Boara.
// KONTRA musi ciąć deskryptor `create_token` CZARU (nie definicję tokena!):
// `tokenRiderDamage`/`tokenGrantedEffects` czytają `effect.abilities` z legu
// i dopiero w drugiej kolejności definicję tokena — mutacja samej definicji
// nie zmienia więc wyceny (lekcja z fali A: kontrfakt był bezskuteczny).
const boarBezFood = registryKontra('wolfs-quarry', (d) => ({
  ...d,
  spell: { ...d.spell, effects: (d.spell?.effects ?? []).map((e) => (e?.type === 'create_token' ? { ...e, abilities: [] } : e)) },
}));
function wqCast(registry = REG) {
  return scene({ registry, many: 7, setup: (st, r) => put(st, 'wq', 'wolfs-quarry', 'p1', 'hand', r) });
}
show('F6 Wolf\'s Quarry — rzut (3× Boar, każdy z dies → Food)', wqCast(), includes('(wq'));
show('F6 KONTRA — token Boar bez triggera śmierci', wqCast(boarBezFood), includes('(wq'));
// F6 pod presją życia: bank życia Fooda ({2}, Poświęć: +3 życia) przebija
// drabinę dopiero, gdy życie jest niskie — tam rider ma widoczną wartość.
function wqCastLowLife(registry = REG) {
  return scene({ registry, many: 7, setup: (st, r) => {
    put(st, 'wq', 'wolfs-quarry', 'p1', 'hand', r);
    st.players.find((p) => p.id === 'p1').life = 8;
  }});
}
show('F6 WQ przy 8 życia — rzut (dies → Food)', wqCastLowLife(), includes('(wq'));
show('F6 WQ przy 8 życia KONTRA bez triggera śmierci', wqCastLowLife(boarBezFood), includes('(wq'));

// F7 kontrola dodatnia: battle cry w decyzji ataku (Kuldotha Ringleader).
const ringBezBattleCry = registryKontra('kuldotha-ringleader', (d) => ({
  ...d, keywords: (d.keywords ?? []).filter((k) => k !== 'battle_cry'),
  abilities: (d.abilities ?? []).filter((a) => !(a.effect?.type === 'buff_attacking_creatures' || (Array.isArray(a.effect) && a.effect.some((e) => e?.type === 'buff_attacking_creatures')))),
}));
function ringAttack(registry = REG) {
  return scene({ registry, many: 0, step: 'declare_attackers', active: 'p1', priority: 'p1', setup: (st, r) => {
    put(st, 'ring', 'kuldotha-ringleader', 'p1', 'battlefield', r);
    creature(st, 'other', 'p1', 1, 1);
    creature(st, 'blocker', 'p2', 1, 1);
  }});
}
show('F7 Kuldotha z battle cry — decyzja ataku', ringAttack(), starts('declare_attackers'));
show('F7 KONTRA bez battle cry — decyzja ataku', ringAttack(ringBezBattleCry), starts('declare_attackers'));
// F7 sonda ROZSTRZYGAJĄCA: 2/2 atakujący kontra 3/3 bloker to bez battle cry
// wymiana stratna (2/2 ginie, bloker przeżywa), a Z battle cry (+1/+0 od
// Ringleadera) — 3/2 zabija blokera i ginie (realny zysk). Wybór zestawu
// atakujących MUSI się różnić, jeśli bot widzi nagrodę.
function ringDiscriminating(registry = REG) {
  return scene({ registry, many: 0, step: 'declare_attackers', active: 'p1', priority: 'p1', setup: (st, r) => {
    put(st, 'ring', 'kuldotha-ringleader', 'p1', 'battlefield', r);
    creature(st, 'other', 'p1', 2, 2);
    creature(st, 'blocker', 'p2', 3, 3);
  }});
}
show('F7 ROZSTRZYGAJĄCA z battle cry — 2/2 vs bloker 3/3', ringDiscriminating(), starts('declare_attackers'));
show('F7 ROZSTRZYGAJĄCA KONTRA bez battle cry', ringDiscriminating(ringBezBattleCry), starts('declare_attackers'));

// F8 kontrola dodatnia: Cancel (kontra) — cel czar na stosie.
{
  const s = scene({ many: 3, setup: (st) => {
    put(st, 'cancel', 'cancel', 'p1', 'hand');
    addObject(st, { id: 'foe-spell', instanceId: 'i-foe-spell', cardId: 'wolfs-quarry',
      controllerId: 'p2', ownerId: 'p2', zone: 'stack', kind: 'sorcery', power: 0,
      toughness: 0, manaCost: 6, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'],
      colors: ['G'], cardName: 'Foe', onStack: true });
    st.zones.stack = ['foe-spell'];
  }});
  show('F8 Cancel — kontra na czar przeciwnika', s, includes('(cancel'));
}

// F9 kontrola dodatnia: Spellkeeper Weird — zwrot instantu z własnego grobu.
{
  const s = scene({ many: 2, setup: (st) => {
    put(st, 'weird', 'spellkeeper-weird', 'p1', 'battlefield');
    put(st, 'inst', 'cancel', 'p1', 'graveyard');
  }});
  show('F9 Spellkeeper — aktywacja {2},{T},Poświęć', s, starts('activate_ability'));
}

// F10 kontrola dodatnia: Intrepid Tenderfoot — licznik w swojej fazie głównej.
{
  const s = scene({ many: 0, setup: (st) => {
    put(st, 'tender', 'intrepid-tenderfoot', 'p1', 'battlefield');
    addMana(st, 'p1', 2, { colors: ['W'] });
  }});
  show('F10 Intrepid Tenderfoot — aktywacja w main', s, starts('activate_ability'));
}

console.log('\n=== koniec sondy PMSSB-62 ===');
