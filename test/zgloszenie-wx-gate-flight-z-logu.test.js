// Zgłoszenia W (Basilisk Gate) i X (Fleeting Flight) — piny z LOGU WŁAŚCICIELA
// (seed 424051, tura 13/17), nie z wymyślonych scenariuszy.
//
// W: bot aktywuje +X/+X na stworze, który w tej turze NIE atakuje.
//    Pomiar (tura 17, stół Druid 3/3 + Anioł 3/3 + Ettercap 2/5):
//    warianty bramy 3/3/3 i wybór = pierwszy z listy.
//    Przyczyna: `zamiarAtakuWybranego` porównuje MAKSIMA dwóch różnych
//    zbiorów podzbiorów atakujących, a nie JEDEN optymalny plan. Przy stole
//    2/4 + 1/1 vs bloker 2/2: max(z 2/4)=10 (plan [duzy,maly]),
//    max(bez 2/4)=1 → 10>1 „tak"; max(z 1/1)=10, max(bez 1/1)=5 → 10>5 „tak".
//    Obaj dostają „tak", więc oba warianty bramy mają 3 pkt i rozstrzyga
//    kolejność enumeracji.
//
// X: bot rzuca combat trick w PODTRZYMANIU na stwora, który nie może atakować.
//    Pomiar (tura 17): smok 4/4 z `cantAttackStatic` (brak flyera u obrońcy),
//    życie człowieka = 5. Karta → smok: +124 → RZUCA. Kara
//    `counterInstantHoldPenalty` (120) została przebita, bo `closesGame`
//    liczy „domknie grę w tym ataku" przez `canAttackNow`, które sprawdza
//    TYLKO tap/chorobę — nie ograniczenie „can't attack".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { put, game, addMana, playerView, execute } from './helpers/pmssb58.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/** Stół z logu, tura 17: Druid 3/3, Anioł 3/3, Ettercap 2/5, 2 bramy. */
function stolZLogu() {
  const s = game({ step: 'main1', active: 'p2' });
  put(s, 'gate', 'basilisk-gate', 'p2');
  put(s, 'gond', 'gond-gate', 'p2');
  put(s, 'forest', 'basic-forest', 'p2');
  put(s, 'druid', 'circle-of-the-land-druid', 'p2', 'battlefield', { summoningSickness: false, power: 3, toughness: 3 });
  put(s, 'angel', 'angel-of-the-dawn', 'p2', 'battlefield', { summoningSickness: false });
  put(s, 'ettercap', 'ettercap', 'p2', 'battlefield', { summoningSickness: false });
  put(s, 'tenderfoot', 'intrepid-tenderfoot', 'p1', 'battlefield', { summoningSickness: false });
  put(s, 'rager', 'frontline-war-rager', 'p1', 'battlefield', { summoningSickness: false });
  s.players.find((p) => p.id === 'p1').life = 5;
  addMana(s, 'p2', 4, {});
  return s;
}

/** Warianty bramy na WŁASNE stwory (wrogi cel ma osobną, niższą cenę — nie
 *  maskuje remisu, który widzi gracz). */
const wariantyBramy = (bot, wlasne) => bot.trace().at(-1).options
  .filter((o) => o.cmd.startsWith('activate_ability(gate'))
  .map((o) => ({ cel: o.cmd.match(/->(\w+)/)?.[1], score: o.score, cmd: o.cmd }))
  .filter((o) => wlasne.includes(o.cel));

test('W/1: brama nie może remisować między stworami o różnym planie ataku', () => {
  // Stół, gdzie plan ataku JEST jednoznaczny co do roli: 2/4 wchodzi do
  // ataku (przeżywa blok 2/2), 1/1 ginie — polityka ataku i tak wysyła oba
  // (10 > 5), ale to nie znaczy, że oba należy buffować tak samo.
  const s = game({ step: 'main1', active: 'p2' });
  put(s, 'gate', 'basilisk-gate', 'p2');
  put(s, 'gond', 'gond-gate', 'p2');
  put(s, 'forest', 'basic-forest', 'p2');
  put(s, 'duzy', 'ettercap', 'p2', 'battlefield', { summoningSickness: false });
  put(s, 'maly', 'intrepid-tenderfoot', 'p2', 'battlefield', { summoningSickness: false });
  put(s, 'blk', 'highland-game', 'p1', 'battlefield', { summoningSickness: false });
  addMana(s, 'p2', 4, {});
  const bot = createHeuristicBot({ seed: 7 });
  bot.chooseCommand(playerView(s, 'p2'), {});
  const w = wariantyBramy(bot, ['duzy', 'maly']);
  assert.ok(w.length >= 2, `setup: są warianty bramy: ${JSON.stringify(w)}`);
  const uniq = new Set(w.map((o) => o.score));
  assert.ok(uniq.size > 1,
    `warianty bramy MUSZĄ się różnić (inaczej remis rozstrzyga enumeracja): ${JSON.stringify(w)}`);
});

test('W/2: stół z logu — brama nie buffuje stwora poza planem ataku', () => {
  const s = stolZLogu();
  const bot = createHeuristicBot({ seed: 7 });
  const dec = bot.chooseCommand(playerView(s, 'p2'), {});
  const w = wariantyBramy(bot, ['druid', 'angel', 'ettercap']);
  assert.ok(w.length >= 2, `setup: ${JSON.stringify(w)}`);
  const uniq = new Set(w.map((o) => o.score));
  assert.ok(uniq.size > 1,
    `stół z logu (Druid/Anioł/Ettercap) — remis 3/3/3 jak u właściciela: ${JSON.stringify(w)}`);
  // Wybrany odbiorca musi być tym samym, którego plan ataku realnie używa.
  const plan = createHeuristicBot({ seed: 7 });
  const s2 = game({ step: 'declare_attackers', active: 'p2' });
  for (const [id, cid, patch] of [
    ['druid', 'circle-of-the-land-druid', { power: 3, toughness: 3 }],
    ['angel', 'angel-of-the-dawn', {}], ['ettercap', 'ettercap', {}],
  ]) put(s2, id, cid, 'p2', 'battlefield', { summoningSickness: false, ...patch });
  plan.chooseCommand(playerView(s2, 'p2'), {});
  const atakujacy = plan.trace().at(-1).chosen.match(/attack\[(.*?)\]/)?.[1].split(',') ?? [];
  if (dec.type === 'activate_ability' && dec.targets?.[0]) {
    assert.ok(atakujacy.includes(dec.targets[0]),
      `buffowany stwór ${dec.targets[0]} musi być w planie ataku ${JSON.stringify(atakujacy)}`);
  }
});

test('W/3: gdy żaden własny stwór nie atakuje, bot nie aktywuje bramy', () => {
  const s = game({ step: 'main1', active: 'p2' });
  put(s, 'gate', 'basilisk-gate', 'p2');
  put(s, 'gond', 'gond-gate', 'p2');
  put(s, 'forest', 'basic-forest', 'p2');
  // sam bloker 0/10 wroga → polityka ataku pasuje (jak w pomiarze)
  put(s, 'moj', 'intrepid-tenderfoot', 'p2', 'battlefield', { summoningSickness: false });
  put(s, 'wall', 'segmented-krotiq', 'p1', 'battlefield', { summoningSickness: false });
  addMana(s, 'p2', 4, {});
  const bot = createHeuristicBot({ seed: 7 });
  const dec = bot.chooseCommand(playerView(s, 'p2'), {});
  assert.notEqual(dec.type === 'activate_ability' && dec.objectId === 'gate', true,
    `bot nie aktywuje bramy bez ataku: ${JSON.stringify(dec)}`);
});

test('W/4: brama nigdy nie buffuje stwora przeciwnika (M146, pin regresyjny)', () => {
  const s = stolZLogu();
  const bot = createHeuristicBot({ seed: 7 });
  const dec = bot.chooseCommand(playerView(s, 'p2'), {});
  const wrogowie = ['tenderfoot', 'rager'];
  if (dec.type === 'activate_ability' && dec.objectId === 'gate') {
    assert.ok(!wrogowie.includes(dec.targets?.[0]),
      `cel bramy nie może być wrogi: ${JSON.stringify(dec)}`);
  }
});

// ---------- X ----------

/** Tura 17 z logu: smok 4/4 flying z „can't attack" + życie człowieka 5. */
function scenaSmoka(step = 'upkeep') {
  const s = game({ step, active: 'p2' });
  put(s, 'dragon', 'lurking-green-dragon', 'p2', 'battlefield', { summoningSickness: false });
  put(s, 'flight', 'fleeting-flight', 'p2', 'hand');
  put(s, 'tenderfoot', 'intrepid-tenderfoot', 'p1', 'battlefield', { summoningSickness: false });
  put(s, 'rager', 'frontline-war-rager', 'p1', 'battlefield', { summoningSickness: false });
  put(s, 'pangolin', 'oreplate-pangolin', 'p1', 'battlefield', { summoningSickness: false });
  s.players.find((p) => p.id === 'p1').life = 5;
  addMana(s, 'p2', 1, { colors: ['W'] });
  return s;
}

test('X/1: smok, który NIE MOŻE atakować, nie jest „domknięciem gry" (tura 17 z logu)', () => {
  const s = scenaSmoka('upkeep');
  const v = playerView(s, 'p2');
  const smok = v.zones.battlefield.find((o) => o.id === 'dragon');
  assert.equal(smok.cantAttackStatic, true,
    'setup: widok MUSI nieść informację „can\'t attack" (inaczej to ślepota L1)');
  assert.equal(v.zones.battlefield.some((o) => o.controllerId === 'p1' && (o.keywords ?? []).includes('flying')), false,
    'setup: obrońca bez latania');
  const bot = createHeuristicBot({ seed: 7 });
  const dec = bot.chooseCommand(v, {});
  assert.notEqual(dec.type === 'cast_spell' && dec.objectId === 'flight', true,
    `bot NIE rzuca triku w podtrzymaniu na stwora bez możliwości ataku: ${JSON.stringify(dec)}`);
});

test('X/2: ten sam smok w oknie walki (już zadeklarowany atakujący) — rzuca', () => {
  const s = scenaSmoka('declare_blockers');
  s.turn.phase = 'combat';
  // smok JEST atakującym (w tej scenie może, bo atak już zadeklarowany)
  s.combat = { attackers: ['dragon'], attackingPlayerId: 'p2' };
  const v = playerView(s, 'p2');
  const bot = createHeuristicBot({ seed: 7 });
  const dec = bot.chooseCommand(v, {});
  assert.equal(dec.type === 'cast_spell' && dec.objectId === 'flight', true,
    `w oknie walki trik jest rzucany: ${JSON.stringify(dec)}`);
});

test('X/3: proporcjonalność — duży stwór bez okna walki też trzyma kartę', () => {
  // Właściciel nie miał 20/20, ale ten sam defekt (stała kara vs liniowa
  // premia) jest realny: bez tej bramki dowolne ciało ≥ 19/19 łamie karę.
  const s = game({ step: 'upkeep', active: 'p2' });
  put(s, 'flight', 'fleeting-flight', 'p2', 'hand');
  put(s, 'big', 'colossodon-yearling', 'p2', 'battlefield', { summoningSickness: false, power: 20, toughness: 20 });
  addMana(s, 'p2', 1, { colors: ['W'] });
  const bot = createHeuristicBot({ seed: 7 });
  const dec = bot.chooseCommand(playerView(s, 'p2'), {});
  assert.notEqual(dec.type === 'cast_spell' && dec.objectId === 'flight', true,
    `20/20 w podtrzymaniu: trik trzymany: ${JSON.stringify(dec)}`);
});

test('X/4: mały stwór w podtrzymaniu — zachowanie bez zmian (kara działała)', () => {
  const s = game({ step: 'upkeep', active: 'p2' });
  put(s, 'flight', 'fleeting-flight', 'p2', 'hand');
  put(s, 'small', 'intrepid-tenderfoot', 'p2', 'battlefield', { summoningSickness: false });
  addMana(s, 'p2', 1, { colors: ['W'] });
  const bot = createHeuristicBot({ seed: 7 });
  const dec = bot.chooseCommand(playerView(s, 'p2'), {});
  assert.notEqual(dec.type === 'cast_spell' && dec.objectId === 'flight', true,
    `2/1 w podtrzymaniu: trik trzymany: ${JSON.stringify(dec)}`);
});
