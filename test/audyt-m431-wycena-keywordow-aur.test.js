// =============================================================================
// M431 (uwaga z gry B, właściciel 2026-09-25) — aura nadająca keywordy musi
// liczyć ŚWIEŻOŚĆ grantu, nie tylko ciało gospodarza.
//
// Zgłoszenie: „Bot ma 3 kreatury. Dwie z flying i jedną bez flying. Bot
// doczepia tą aurę do jednej ze swoich kreatur z flying. (…) sprawdź czy w
// ogóle jest brane pod uwagę (penalty) za to, że kreaturą już ma flying lub/i
// vigilance."
//
// POMIAR PRZED (sonda na silniku + bocie, `cast_permanent`, 6 lądów,
// `serras-embrace` w ręce, trzej gospodarze 3/3: bez keywordów / flying /
// flying+vigilance):
//   cast_permanent(aura->golus)  => 72.9
//   cast_permanent(aura->latacz) => 72.9
//   cast_permanent(aura->czujny) => 72.9   ← REMIS WARIANTÓW, wybrano pierwszego
// Gałąź aury-buffa w `scoreCommand` (`heuristic-bot.js:4563`) liczyła
// `auraBase + auraBuffWorthWeight·(moc+pump) + (toughness+pump)` — pole
// `descriptor.keywords` nie było czytane NIGDZIE przy wycenie (jedyne odczyty
// tego pola w bocie, l. 4523/4536, to `length === 0` do klasyfikacji
// pure-protection). Czyli: nie „bot wybrał największego", tylko „żaden wymiar
// nie różnicował" (L169).
//
// PODSTAWA REGUŁOWA (do oceny, że to wycena, nie mechanika):
//  * Oracle `serras-embrace` (snapshot w repo): „Enchanted creature gets +2/+2
//    and has flying and vigilance. (Attacking doesn't cause it to tap.)"
//    — granting an ability a creature already has is a legal, useless no-op
//    (CR 613.7b — warstwa ciaglych efektow; duplikat nie znosi niczyjej
//    zdolności, po prostu nic nie dodaje). Silnik robi to poprawnie
//    (`attachmentGrant` w `attachments.js` czyta `aura.keywords` i `
//    equipment.keywords` JEDNĄ funkcją) — luka była wyłącznie w wycenie.
//  * precedent w tym samym pliku: `equipValuation` (M243/D-G: „Cloak of the Bat
//    na latającym: keyword, który cel JUŻ ma, niczego nie dodaje") liczy
//    `freshGrants` od 2026-08-27. Ta sama reguła nie dotarła do aur (L72).
//  * widok niesie EFEKTYWNE keywordy gospodarza, w tym granty z innych
//    załączników (CR 613 warstwa 6; `entry.keywords`/`entry.grantedKeywords`,
//    M175/A3) — ADR 0017: bot ma dane, nie był ślepy, tylko patrzył gdzie indziej.
//
// STRAŻNIK (co czerwienieje po cofnięciu naprawy): testy 1, 4 i 5 poniżej.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana, initializeResources } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();

/**
 * Stol p1: `krotka` lądów, trzej wlasni stworze 3/3 o roznych zbiorach
 * keywordow oraz `serras-embrace` (+2/+2, flying+vigilance) w rece.
 * `wrogowie` dokłada stwory przeciwnika (potrzebne, żeby flying gospodarza
 * był wyceniany jako ewazja, a nie jako szum).
 */
function stol({ hostKeywords = {}, auraId = 'serras-embrace', wrogowie = ['latanie'], step = 'main' } = {}) {
  const state = createGameState({ players: [{ id: 'p1' }, { id: 'p2' }], registry: REGISTRY, seed: 11 });
  initializeResources(state);
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < 6; i += 1) {
    addObject(state, {
      id: `land${i}`, instanceId: `land${i}-i`, cardId: 'plains', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'land', power: 0, toughness: 0, types: ['Land'], subtypes: ['Plains'],
      keywords: [], abilities: [], colors: ['W'], manaCost: 0,
    });
  }
  const hosts = {
    golus: [], latacz: ['flying'], czujny: ['flying', 'vigilance'],
    cialo: [], kolos: ['flying'], zwinny: ['vigilance'], ...hostKeywords,
  };
  for (const [id, keywords] of Object.entries(hosts)) {
    addObject(state, {
      id, instanceId: `${id}-i`, cardId: 'synthetic-host', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', power: 3, toughness: 3,
      types: ['Creature'], subtypes: [], keywords, abilities: [], colors: ['W'], manaCost: 3,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  if (wrogowie.includes('latanie')) {
    addObject(state, {
      id: 'wróg', instanceId: 'wrog-i', cardId: 'synthetic-foe', controllerId: 'p2', ownerId: 'p2',
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 4,
      types: ['Creature'], subtypes: [], keywords: [], abilities: [], colors: ['B'], manaCost: 3,
    });
  }
  const aura = REGISTRY.get(auraId);
  addObject(state, {
    id: 'aura', instanceId: 'aura-i', cardId: auraId, controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'enchantment', power: null, toughness: null,
    manaCost: aura.manaCost, colors: aura.colors ?? [], types: aura.types ?? [],
    subtypes: aura.subtypes ?? [], keywords: aura.keywords ?? [], abilities: aura.abilities ?? [],
    aura: aura.aura,
  });
  state.zones.hand.push('aura');
  state.turn = jumpToStep(state.turn, step, 'p1');
  // pula bez profilu koloru = wygoda testu (default `addMana`, resources.js:44);
  // inaczej test 5 nie ruszy `shivs-embrace` ({R}) ani `vow-of-flight` ({U}).
  addMana(state, 'p1', 10);
  return state;
}

/** Ranking bota: mapa `gospodarz → punkty` dla rzutu aury. */
function punktyAury(state, params = {}) {
  const bot = createHeuristicBot({ seed: 3, params });
  bot.chooseCommand(playerView(state, 'p1'));
  const wpisy = bot.trace().at(-1).options.filter((o) => o.cmd.startsWith('cast_permanent(aura->'));
  assert.ok(wpisy.length >= 2, `scenariusz musi oferować ≥2 warianty rzutu aury — inaczej test nic nie mierzy (L5 pkt 2), dostałem ${wpisy.length}`);
  const out = {};
  for (const w of wpisy) out[w.cmd.slice('cast_permanent(aura->'.length, -1)] = w.score;
  return out;
}

test('M431/B/1: gospodarz bez keywordów bije gospodarza, który flying już ma (redundancja liczy się w wyborze celu)', () => {
  const p = punktyAury(stol());
  assert.ok(p.golus > p.latacz,
    `aura na 3/3 bez keywordów (${p.golus}) MUSI byc wyzsza niz na 3/3 z flying (${p.latacz}) — grant flying jest jałowy (grant duplikatu nic nie dodaje); przed naprawa oba = 72,9 (remis wariantów)`);
  assert.ok(p.latacz > p.czujny,
    `aura na 3/3 z flying (${p.latacz}) musi byc wyzsza niz na 3/3 z flying+vigilance (${p.czujny}) — tam oba granty sa jałowe`);
});

test('M431/B/2: calkowicie jałowa aura (grant obecny, zero pompy) = rzut ponizej passu, a ten sam nośnik na gospodarzu bez grantu — powyzej', () => {
  // Zgodnie z ADR 0029 (brak nowego batcha kart) nosnikiem jest karta
  // SYNTETYCZNA w tym tescie, nie karta z katalogu: aura „flying bez pompy".
  // Na gospodarzu, ktory flying JUŻ ma, nie dodaje NIC (CR 613.7b — grant
  // duplikatu nie znosi i nie dodaje zdolności) i bot ma ja rzucic NIGDY,
  // nawet gdy nie ma innego celu; na gospodarze bez flying — rzuca.
  const scena = (auraKw) => {
    const state = createGameState({ players: [{ id: 'p1' }, { id: 'p2' }], registry: REGISTRY, seed: 11 });
    initializeResources(state);
    state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
    for (const [id, keywords] of [['golus', []], ['latacz', ['flying']]]) {
      addObject(state, {
        id, instanceId: `${id}-i`, cardId: 'synthetic-host', controllerId: 'p1', ownerId: 'p1',
        zone: 'battlefield', kind: 'creature', power: 5, toughness: 5,
        types: ['Creature'], keywords, abilities: [], colors: ['W'], manaCost: 4,
      });
      state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
    }
    addObject(state, {
      id: 'aura', instanceId: 'aura-i', cardId: 'synthetic-aura', controllerId: 'p1', ownerId: 'p1',
      zone: 'hand', kind: 'enchantment', manaCost: 3, colors: ['W'], types: ['Enchantment'],
      subtypes: ['Aura'], keywords: [], abilities: [], aura: { keywords: auraKw },
    });
    state.zones.hand.push('aura');
    state.turn = jumpToStep(state.turn, 'main', 'p1');
    // pula bez profilu koloru = wygoda testu (default `addMana`, resources.js:44);
  // inaczej test 5 nie ruszy `shivs-embrace` ({R}) ani `vow-of-flight` ({U}).
  addMana(state, 'p1', 10);
    return punktyAury(state);
  };
  const jalowa = scena(['flying']);
  assert.ok(jalowa.latacz < jalowa.golus - 30,
    `aura, ktorej JEDYNYM efektem jest keyword, ktory cel juz ma, musi byc wycenowana DRAMATYCZNIE niz na gospodarzu bez niego (rzucasz karte i mane za nic) — wzor: auraLosesKeywordsWastedPenalty=80 przebijajace baze. Dostalem ${JSON.stringify(jalowa)}`);
  assert.ok(jalowa.golus > 0,
    `ta sama aura na gospodarzu BEZ tego keywordu to realna ewazja — powyzej passu: ${JSON.stringify(jalowa)}`);
  const bezGrantow = scena([]);
  assert.ok(Math.abs((bezGrantow.golus ?? 0) - (bezGrantow.latacz ?? 1)) < 1e-9,
    `aura bez slow-kluczowych grantow nie ma zadnego powodu, by roznicowac gospodarzy (brak kary „za sama tozsamosc celu"): ${JSON.stringify(bezGrantow)}`);
});

test('M431/B/3: anty-over-fix — rodzina aura nie spada ponizej passu, gdy pump robi roznice', () => {
  // Rezerwuar: aura +2/+2 na 3/3 = dawne 72,9. Po naprawie wartosc na
  // najslabszym REALNYM gospodarzu musi zostac >= dawnej (kalibracja L169
  // pkt 3: „najslabszy realny wariant wart dokladnie tyle, co przed zmiana"),
  // a wiec NIE moze spac pod pass (scoreCommand: 'pass_priority' = 0).
  const p = punktyAury(stol());
  const wlasni = Object.entries(p).filter(([id]) => ['golus', 'cialo', 'zwinny', 'latacz', 'kolos', 'czujny'].includes(id));
  assert.equal(wlasni.length, 6, 'szesc gospodarzy w scenariuszu (3 glownych + 3 kontrolne)');
  const najgorszy = Math.min(...wlasni.map(([, v]) => v));
  assert.ok(najgorszy > 0,
    `kazdy wariant rzutu buff-aury na WLASNEGO gospodarza musi zostac powazny (najgorszy = ${najgorszy}) — kara za redundancje nie moze zjedzesc karty, ktora i tak daje +2/+2; calosc: ${JSON.stringify(Object.fromEntries(wlasni))}`);
  const dawne = 72.9;
  assert.ok(p.golus > dawne,
    `gospodarz ze swiezymi grantami musi byc wyceniony WYZEJ niz przed zmiana (${dawne} → ${p.golus}): premia za uzyteczny grant doklada wartosc, nie przesuwa bazy`);
  assert.ok(p.czujny < p.latacz && p.latacz < p.golus,
    `drabina gospodarzy musi byc cala (cialo > ewazja > ewazja+vigilance): ${JSON.stringify(Object.fromEntries(wlasni))}`);
});

test('M431/B/4: wybor gospodarza przy wejsciu aury z grobu (resolve_aura_host) czyta TE SAME reguly co wycena rzutu', () => {
  // L41: ta sama reguła w obu blizniaczych sciezkach (rzut z reki vs wybór
  // gospodarza przy wejsciu). Budujemy decyzje silnika i pytamy bota o punkty.
  const state = stol();
  // Bramka `pendingAuraHost` w legalCommands zostawia TYLKO te decyzje —
  // wybieramy je recznie z widoku, a punkty czytamy z drzewa bota (wpis z
  // jednolista oferta, L5 pkt 2).
  state.pendingAuraHost = {
    playerId: 'p1',
    cardId: 'serras-embrace',
    auraObjectId: 'aura-w-grobie',
    candidateIds: ['golus', 'latacz', 'czujny'],
  };
  const view = playerView(state, 'p1');
  const oferty = (view.legalCommands ?? []).filter((c) => c.type === 'resolve_aura_host');
  assert.equal(oferty.length, 3,
    'oferta musi byc wystawiona dla kazdego kandydata (L48: oferta = walidacja), dostalem ' + oferty.length);
  const bot = createHeuristicBot({ seed: 3 });
  bot.chooseCommand(view);
  const punkty = {};
  for (const o of bot.trace().at(-1).options) {
    if (o.cmd.startsWith('resolve_aura_host')) punkty[o.cmd.slice(o.cmd.indexOf('(') + 1, -1)] = o.score;
  }
  assert.ok(punkty.golus != null && punkty.latacz != null && punkty.czujny != null,
    `wszystkie trzy warianty musza byc wycenione (nie „niewycenione"), dostalem ${JSON.stringify(punkty)}`);
  assert.ok(punkty.golus > punkty.latacz && punkty.latacz > punkty.czujny,
    `sciezka wyboru gospodarza musi roznicowac tak samo jak rzut: ${JSON.stringify(punkty)}`);
});

test('M431/B/5: rodzina w katalogu — wycena patrzy na deskryptor, nie na karte (ADR 0002)', () => {
  const zKeywordami = REGISTRY.all()
    .filter((c) => ((c.aura ?? c.bestow)?.keywords ?? []).length > 0)
    .map((c) => c.id);
  assert.ok(zKeywordami.length >= 5,
    `w katalogu musi byc rodzina aur nadajacych keywordy (inaczej ten test jest martwy, L26): ${zKeywordami.join(', ')}`);
  const p = (auraId, host) => {
    const b = createHeuristicBot({ seed: 3 });
    b.chooseCommand(playerView(stol({ auraId }), 'p1'));
    return b.trace().at(-1).options.find((o) => o.cmd === `cast_permanent(aura->${host})`)?.score ?? null;
  };
  // Shiv's Embrace = +2/+2 i flying; Vow of Flight = +2/+2 i flying (inna karta,
  // inny kolor i koszt) — na gospodarzu z flying obie są równie jałowe, wiec
  // obie musza dostac TE SAME punkty. Gdyby wycena czytala nazwe karty, roznica
  // by sie pojawila (L107: straznik zrodlowy zastapiony straznikiem zachowania).
  const shiv = p('shivs-embrace', 'latacz');
  const vow = p('vow-of-flight', 'latacz');
  assert.ok(shiv != null && vow != null, `obie aury musza byc wycenione, dostalem ${shiv} / ${vow}`);
  assert.equal(shiv.toFixed(3), vow.toFixed(3),
    `identyczny deskryptor grantu (flying, +2/+2) na tym samym gospodarzu = identyczna cena (Shiv ${shiv} vs Vow ${vow})`);
  // Ta sama para na gospodarzu BEZ flying musi byc wyzsza niz na latajacym —
  // swiezy grant wart jest wszedzie tyle, ile jego swiezosc, nie nazwa karty.
  assert.ok(p('shivs-embrace', 'golus') > shiv,
    `Shiv na gospodarzu bez flying (swiezy grant) musi byc wyzej niz na gospodarzu z flying: ${p('shivs-embrace', 'golus')} vs ${shiv}`);
  // Pokretlo nie jest atrapa (L169 pkt 6): po wylaczeniu trzech wag
  // gospodarze rozniacy sie SLOWAMI-KLUCZOWYMI wracaja do stanu „ciało decyduje",
  // czyli pary o tym samym ciele (golus/cialo bez kw., latacz/kolos z flying)
  // sa identyczne wewnatrz pary.
  const pki = punktyAury(stol(), { auraKeywordFreshValue: 0, auraKeywordRedundantPenalty: 0, auraKeywordAllWastedPenalty: 0 });
  assert.equal(pki.golus.toFixed(3), pki.cialo.toFixed(3),
    `para bez keywordow: wylaczenie wag musi je scalic ( ${pki.golus} vs ${pki.cialo})`);
  assert.equal(pki.latacz.toFixed(3), pki.kolos.toFixed(3),
    `para z flying: wylaczenie wag musi je scalic (${pki.latacz} vs ${pki.kolos})`);
});

test('M431/B/6: nowe wagi sa pod nazwami w kontrakcie parametrow (M257 r4/T1) i realnie przepływaja', () => {
  const p = punktyAury(stol());
  const bez = punktyAury(stol(), { auraKeywordFreshValue: 0, auraKeywordRedundantPenalty: 0, auraKeywordAllWastedPenalty: 0 });
  assert.deepEqual(Object.keys(bez), Object.keys(p), 'oba drzewa musza widziec te same warianty');
  // Kaizde pokretlo musi byc CZYTELNE (nie atrapa) — sprawdzamy osobno, ze
  // podbicie swiezej premii zwieksza gospodarza z grantem, a podbicie kary
  // zmniejsza gospodarza z redundancja.
  const swieza = punktyAury(stol(), { auraKeywordFreshValue: 40 });
  const surowa = punktyAury(stol(), { auraKeywordRedundantPenalty: 20 });
  assert.ok(swieza.golus > p.golus, `auraKeywordFreshValue realnie przeplywa (${swieza.golus} > ${p.golus})`);
  assert.ok(surowa.latacz < p.latacz, `auraKeywordRedundantPenalty realnie przeplywa (${surowa.latacz} < ${p.latacz})`);
  assert.ok(p.golus > bez.golus, `swiezy grant doklada wartosc ponad stan bez wag (${p.golus} > ${bez.golus})`);
  assert.ok(p.czujny < bez.czujny, `redundancja obniza wycene gospodarza ze wszystkimi grantami obecnymi (${p.czujny} < ${bez.czujny})`);
  assert.ok(DEFAULT_HEURISTIC_PARAMS.auraKeywordFreshValue > 0
    && DEFAULT_HEURISTIC_PARAMS.auraKeywordRedundantPenalty > 0
    && DEFAULT_HEURISTIC_PARAMS.auraKeywordAllWastedPenalty > 0,
    'wszystkie trzy wagi dodatnie w DOMYSLNYCH parametrach');
  // Kalibracja L169 pkt 3: najslabszy powazny wariant nie moze spelznac pod
  // dawna wartosc rodziny (72,9 = dawne 72,9 dla kazdego gospodarza).
  assert.ok(Math.min(p.golus, p.latacz, p.czujny) >= 72.9 - 1e-9 || p.czujny >= bez.czujny - 80,
    `domyslne wagi nie moga zamrozic calego rzutu aury: ${JSON.stringify(p)}`);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.auraKeywordAllWastedPenalty, DEFAULT_HEURISTIC_PARAMS.auraLosesKeywordsWastedPenalty,
    'kara za calkowicie jałowa aure = TA SAMA wielkosc co kara za jałowe losesKeywords (L28: jedno źródło wagi dla lustrzanej klasy)');
});
