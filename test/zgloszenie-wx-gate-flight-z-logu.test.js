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

test('W/1: stwór POZA planem ataku ma niższą ocenę bramy niż stwór w planie', () => {
  // Pomiar z logu (tura 17): plan ataku = [druid, angel] (35 pkt) — Ettercap
  // 2/5 zostaje w domu. Przed naprawą wszystkie trzy warianty bramy dawały
  // 3 pkt (remis → enumeracja → „buffuje kreaturę, która potem nie atakuje").
  const s = game({ step: 'main1', active: 'p2' });
  put(s, 'gate', 'basilisk-gate', 'p2');
  put(s, 'gond', 'gond-gate', 'p2');
  put(s, 'forest', 'basic-forest', 'p2');
  put(s, 'druid', 'circle-of-the-land-druid', 'p2', 'battlefield', { summoningSickness: false, power: 3, toughness: 3 });
  put(s, 'angel', 'angel-of-the-dawn', 'p2', 'battlefield', { summoningSickness: false });
  put(s, 'ettercap', 'ettercap', 'p2', 'battlefield', { summoningSickness: false });
  put(s, 'tenderfoot', 'intrepid-tenderfoot', 'p1', 'battlefield', { summoningSickness: false });
  put(s, 'rager', 'frontline-war-rager', 'p1', 'battlefield', { summoningSickness: false });
  put(s, 'pangolin', 'oreplate-pangolin', 'p1', 'battlefield', { summoningSickness: false });
  s.players.find((p) => p.id === 'p1').life = 5;
  addMana(s, 'p2', 4, {});
  const bot = createHeuristicBot({ seed: 7 });
  bot.chooseCommand(playerView(s, 'p2'), {});
  const w = wariantyBramy(bot, ['druid', 'angel', 'ettercap']);
  const ocena = Object.fromEntries(w.map((o) => [o.cel, o.score]));
  assert.ok(ocena.ettercap != null && ocena.druid != null,
    `setup: są oceny obu stron planu: ${JSON.stringify(w)}`);
  assert.ok(ocena.ettercap < ocena.druid,
    `stwór poza planem ataku (Ettercap) MUSI być niżej niż w planie (Druid): ${JSON.stringify(ocena)}`);
});

test('W/2: wybrany odbiorca bramy należy do planu ataku', () => {
  const s = game({ step: 'main1', active: 'p2' });
  put(s, 'gate', 'basilisk-gate', 'p2');
  put(s, 'gond', 'gond-gate', 'p2');
  put(s, 'forest', 'basic-forest', 'p2');
  put(s, 'druid', 'circle-of-the-land-druid', 'p2', 'battlefield', { summoningSickness: false, power: 3, toughness: 3 });
  put(s, 'angel', 'angel-of-the-dawn', 'p2', 'battlefield', { summoningSickness: false });
  put(s, 'ettercap', 'ettercap', 'p2', 'battlefield', { summoningSickness: false });
  put(s, 'tenderfoot', 'intrepid-tenderfoot', 'p1', 'battlefield', { summoningSickness: false });
  put(s, 'rager', 'frontline-war-rager', 'p1', 'battlefield', { summoningSickness: false });
  put(s, 'pangolin', 'oreplate-pangolin', 'p1', 'battlefield', { summoningSickness: false });
  s.players.find((p) => p.id === 'p1').life = 5;
  addMana(s, 'p2', 4, {});
  const dec = createHeuristicBot({ seed: 7 }).chooseCommand(playerView(s, 'p2'), {});
  // Ta sama scena na kroku deklaracji: kogo polityka ataku NAPRAWDĘ wysyła.
  const s2 = game({ step: 'declare_attackers', active: 'p2' });
  put(s2, 'druid', 'circle-of-the-land-druid', 'p2', 'battlefield', { summoningSickness: false, power: 3, toughness: 3 });
  put(s2, 'angel', 'angel-of-the-dawn', 'p2', 'battlefield', { summoningSickness: false });
  put(s2, 'ettercap', 'ettercap', 'p2', 'battlefield', { summoningSickness: false });
  put(s2, 'tenderfoot', 'intrepid-tenderfoot', 'p1', 'battlefield', { summoningSickness: false });
  put(s2, 'rager', 'frontline-war-rager', 'p1', 'battlefield', { summoningSickness: false });
  put(s2, 'pangolin', 'oreplate-pangolin', 'p1', 'battlefield', { summoningSickness: false });
  s2.players.find((p) => p.id === 'p1').life = 5;
  const bot2 = createHeuristicBot({ seed: 7 });
  const dek2 = bot2.chooseCommand(playerView(s2, 'p2'), {});
  const atakujacy = (dek2.attackerIds ?? []);
  assert.ok(atakujacy.length > 0 && atakujacy.length < 3,
    `setup: plan ataku jest WŁAŚCIWY (nie wszyscy): ${JSON.stringify(atakujacy)}`);
  assert.ok(dec.type === 'activate_ability' && dec.objectId === 'gate',
    `bot aktywuje bramę: ${JSON.stringify(dec)}`);
  assert.ok(atakujacy.includes(dec.targets?.[0]),
    `buffowany ${dec.targets?.[0]} MUSI być w planie ataku ${JSON.stringify(atakujacy)}`);
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
//
// ŚWIADOMIE bez pinu „duże ciało (>=19/19) w podtrzymaniu": taki przypadek
// NIE wystąpił u właściciela i jest sprzeczny z pinem zgłoszenia D/5
// (`zgloszenie-d-dragonscale-okno`), który dopuszcza rzut przed atakiem, gdy
// licznik realnie domyka grę w tej turze. Kara proporcjonalna (max z wartością
// gospodarza) została zmierzona jako regresja — czerwieniła D/5 i PMSSB-23/C4.
// Otwarta klasa do ewentualnej decyzji właściciela: stała kara vs liniowa
// premia od ciała. Nie naprawiana tutaj (poza zakresem zgłoszenia X).


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
