// =============================================================================
// PMSSB-35 — rodzina ODROCZENIA ZAGRANIA:
// `plot_card` / `suspend_card` / `warp_card` + rzut karty czekającej z wygnania.
//
// Wejście (nowy dowód, sonda `/home/user/scratch/pmssb35-odroczenie-przed.mjs`):
//  (1) `case 'cast_permanent'` czytał kartę WYŁĄCZNIE z ręki (`handCard`), więc
//      rzut karty czekającej w wygnaniu (plot CR 702.170d, poczekalnia warp,
//      okno impulsu CR 701.18) dostawał puste `P.creatureBase` × waga = 63,000
//      NIEZALEŻNIE od ciała i kosztu:
//        Sheriff 0/0 · Hill Giant 3/3 · Paladin 5/4 · Weftblade 3/4 → 63,000;
//        Hill Giant z P/T 20/20 → dalej 63,000; z 0 lądów → dalej 63,000,
//      a ten sam stwór rzucany z ręki liczył się z ciała i kosztu (59,396).
//  (2) akcje odroczenia były płaskie: `plot_card` = 55 + token/mill bez kosztu
//      plotu; `warp_card` = ciało − 15 + 5 ETB bez kosztu warp (70,000 przy
//      4 i przy 6 polach); `suspend_card` = 30/8 wg legacy `manaAvailableNow`
//      (pula + nietapnięte LĄDY) — z Seer's Lantern rzut był w ofertach
//      silnika, a bot dawał 30 „nie stać mnie” (S3).
//  (3) DOWÓD DECYZYJNY (S6): Tumbleweed Rising {1}{G} z plotem {3}{G}, t3,
//      4 lasy → plot 55,000 wygrywał z rzutem 49,980, czyli bot płacił
//      4 many i czekał turę, mając rzut za 2 many dostępny od ręki.
//
// PO (ta sama sonda): wypłata liczona z karty, darmowy rzut nie płaci many,
// odroczenie ma cenę i zwłokę, rzut dostępny teraz wygrywa z plotem.
// Anty-over-fix: przy braku oferty rzutu plot zachowuje bazę 55 (minus koszt),
// warp zachowuje −15/+5, rzut darmowy nie dostaje premii — tylko brak kary.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createGameState, playerView, addObject, execute } from '../src/engine/game-state.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { addMana } from '../src/engine/resources.js';
import { hasFreeCastStamp, impulseWindowOf } from '../src/engine/impulse-window.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game({ turn = 4 } = {}) {
  const state = createGameState({ seed: 4012, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = turn;
  return state;
}

function dodaj(state, id, cardId, zone, kind = null, over = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1',
    zone, kind: kind ?? (def.types.includes('Creature') ? 'creature' : 'spell'),
    ...gameObjectDataOf(def),
    types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], abilities: def.abilities ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...over }));
  return state.objects.get(id);
}

const reka = (state, id, cardId, over = {}) => dodaj(state, id, cardId, 'hand', null, over);
const wExile = (state, id, cardId, over = {}) => dodaj(state, id, cardId, 'exile', null, over);

function lądy(state, cardId, n, prefix = 'l') {
  for (let i = 0; i < n; i += 1) dodaj(state, `${prefix}${i}`, cardId, 'battlefield', 'land');
}

const bagno = (s, n) => lądy(s, 'basic-swamp', n, 'sw');
const las = (s, n) => lądy(s, 'basic-forest', n, 'fo');
const pole = (s, n) => lądy(s, 'basic-plains', n, 'pl');

/**
 * Pełny obraz oferty (nie tylko wybrany wariant — lekcja z PMSSB-34/A2):
 * wybrany typ komendy + mapa etykiet ofert na wyniki.
 */
function oferta(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 4012, params });
  const cmd = bot.chooseCommand(playerView(state, 'p1'), {});
  const opcje = new Map();
  for (const o of bot.trace().at(-1)?.options ?? []) opcje.set(o.cmd, o.score);
  return { cmd, opcje };
}

/** Wynik JEDNEJ oferty o danym prefiksie etykiety (assert na jednoznaczność). */
function wynik(state, prefix, params = undefined) {
  const { opcje } = oferta(state, params);
  const trafienia = [...opcje.entries()].filter(([label]) => label.startsWith(prefix));
  assert.equal(trafienia.length, 1, `oczekiwano jednej oferty „${prefix}", jest: ${[...opcje.keys()].join(' | ')}`);
  return trafienia[0][1];
}

const WOLNE = { plotRedundantPenalty: 0, plotDelayPenalty: 0, suspendWaitPenalty: 0 };

/**
 * Arytmetyka wyceny jest zmiennoprzecinkowa, a sonda raportuje 3 miejsca po
 * przecinku — kotwice porównujemy z tolerancją 1e-3 (mniejszą niż odstęp
 * między realnymi wariantami, więc nie maskuje różnic wymiarów).
 */
function blisko(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1e-3, `${msg} (jest ${actual}, oczekiwano ${expected})`);
}

// --- A. Wypłata odroczenia: rzut karty czekającej w wygnaniu (L41) ---------

test('A1: zaplotowana karta w exile liczy CIAŁO, nie puste 0/0 (PRZED: wszystkie 63,000)', () => {
  const sheriff = (() => { const s = game(); wExile(s, 'sh', 'sheriff-of-safe-passage', { plotted: true, plottedAtTurn: 3 }); return s; })();
  const giant = (() => { const s = game(); wExile(s, 'hg', 'hill-giant', { plotted: true, plottedAtTurn: 3 }); return s; })();
  const paladin = (() => { const s = game(); wExile(s, 'sp', 'spinewoods-paladin', { plotted: true, plottedAtTurn: 3 }); return s; })();
  blisko(wynik(sheriff, 'cast_permanent(sh)'), 62.996, 'Sheriff 0/0 (wchodzi z licznikami — ciało bazowe 0)');
  blisko(wynik(giant, 'cast_permanent(hg)'), 71.104, 'Hill Giant 3/3 — ciało wchodzi do wyceny');
  blisko(wynik(paladin, 'cast_permanent(sp)'), 77.407, 'Paladin 5/4 — największe ciało, najwyższy wynik');
  assert.ok(wynik(paladin, 'cast_permanent(sp)') > 63, 'PRZED wszystkie trzy karty miały 63,000 (ślepota)');
});

test('A2: darmowy rzut z wygnania nie płaci many, płatny płaci — różnica = koszt karty', () => {
  const darmowy = (() => { const s = game(); wExile(s, 'sh', 'sheriff-of-safe-passage', { plotted: true, plottedAtTurn: 3 }); return s; })();
  const platny = (() => { const s = game(); pole(s, 6); wExile(s, 'sh', 'sheriff-of-safe-passage', { warpReady: true, warpedAtTurn: 3 }); return s; })();
  const wolny = wynik(darmowy, 'cast_permanent(sh)');
  const oplacony = wynik(platny, 'cast_permanent(sh)');
  // Koszt Sheriffa {2}{W} = 3 many + 1 pip × 0,9 wagi rodziny `permanent`.
  blisko(wolny - oplacony, 3.6, 'darmowy rzut = płatny + koszt karty (CR 702.170d)');
});

test('A3: reguła jest KLASOWA — stempel darmowego rzutu (CR 701.18) działa jak plot', () => {
  const impuls = (() => {
    const s = game();
    wExile(s, 'hg', 'hill-giant', { playableWithoutPaying: true, playableUntilTurn: 12 });
    return s;
  })();
  const zaplotowany = (() => { const s = game(); wExile(s, 'hg', 'hill-giant', { plotted: true, plottedAtTurn: 3 }); return s; })();
  assert.equal(wynik(impuls, 'cast_permanent(hg)'), wynik(zaplotowany, 'cast_permanent(hg)'),
    'dwie różne drogi do tego samego zwolnienia z kosztu liczą tę samą wartość');
});

test('A4: rzut płatny z wygnania = rzut z ręki (L41: jedna arytmetyka dla stref)', () => {
  const zReki = (() => { const s = game(); pole(s, 6); reka(s, 'we', 'weftblade-enhancer'); return s; })();
  const zWygnania = (() => { const s = game(); pole(s, 6); wExile(s, 'we', 'weftblade-enhancer', { warpReady: true, warpedAtTurn: 3 }); return s; })();
  assert.equal(wynik(zWygnania, 'cast_permanent(we)'), wynik(zReki, 'cast_permanent(we)'));
  // PMSSB-36/B: ETB-licznik na „target creature" (cel dowolny — także własny)
  // dostaje wartość 6×0,9 niezależnie od wroga na stole (dawniej 0 bez wroga):
  // 65.703 → 71.103 w obu strefach.
  blisko(wynik(zReki, 'cast_permanent(we)'), 71.103, 'kotwica PO (płatny rzut {5}{W})');
});

// --- B. suspend_card: dostępność z oferty silnika + cena + zwłoka ----------

test('B1: rzut nieosiągalny → suspend opłacalny, ale z ceną kosztu i zwłoki (PRZED: 30)', () => {
  const s = game({ turn: 4 }); bagno(s, 5); reka(s, 'ms', 'mindstab');
  const { cmd, opcje } = oferta(s);
  assert.equal(cmd.type, 'suspend_card', 'jedyna sensowna akcja w oknie');
  assert.equal(opcje.get('suspend_card'), 24, '30 bazy − koszt {B} (1 mana + 1 pip) − 4 liczniki × 1');
});

test('B2: rzut osiągalny (latarnia) → oferta silnika decyduje, rzut bije odroczenie', () => {
  const s = game({ turn: 4 }); bagno(s, 5);
  dodaj(s, 'lamp', 'seers-lantern', 'battlefield', 'artifact');
  reka(s, 'ms', 'mindstab');
  // Wróg z kartami w ręce: discard 3 MA co zabrać (inaczej rzut jest jałowy
  // i odroczenie wygrywa — poprawnie, patrz sonda S3).
  for (let i = 0; i < 3; i += 1) dodaj(s, `f${i}`, 'hill-giant', 'hand', null, { controllerId: 'p2' });
  const { cmd, opcje } = oferta(s);
  assert.equal(opcje.get('suspend_card'), 2, '8 bazy − 2 kosztu − 4 zwłoki; rzut ma 6 many dzięki latarni');
  assert.equal(cmd.type, 'cast_spell', 'bot rzuca, a nie odracza (PRZED: 30 za „nie stać mnie”)');
  assert.ok(opcje.get('cast_spell(ms->p2)') > opcje.get('suspend_card'), 'rzut bije odroczenie');
});

test('B3: wymiar ZWŁOKI jest osobny (mutacja pokrętła) — 1 licznik vs 4 liczniki', () => {
  const s = game({ turn: 4 }); bagno(s, 5); reka(s, 'ms', 'mindstab');
  const czekanieZero = wynik(s, 'suspend_card', { suspendWaitPenalty: 0 });
  const czekanieDwa = wynik(s, 'suspend_card', { suspendWaitPenalty: 2 });
  assert.equal(czekanieZero, 28, 'baza 30 − koszt 2 (bez zwłoki)');
  assert.equal(czekanieDwa, 20, 'każdy z 4 liczników kosztuje 2 pkt');
});

test('B4: wymiar KOSZTU jest osobny — plan {B} płaci 1 manę + 1 pip', () => {
  const s = game({ turn: 4 }); bagno(s, 5); reka(s, 'ms', 'mindstab');
  assert.equal(wynik(s, 'suspend_card', WOLNE), 28, 'bez zwłoki zostaje baza minus koszt');
  assert.equal(wynik(s, 'suspend_card'), 24, 'domyślnie: 30 − 2 − 4');
});

test('B5: faza gry jest w modelu — ten sam Mindstab w t14 (14 lądów) = 2, nie 24 jak w t4', () => {
  const s = game({ turn: 14 }); bagno(s, 14); reka(s, 'ms', 'mindstab');
  // Cel rzutu nie może być jałowy — inaczej rzut (nie odroczenie) jest karany
  // przez `allEffectsInertNow` i suspend wygrywa z pustą ręką wroga (S5).
  for (let i = 0; i < 3; i += 1) dodaj(s, `w${i}`, 'hill-giant', 'hand', null, { controllerId: 'p2' });
  const { cmd, opcje } = oferta(s);
  assert.equal(opcje.get('suspend_card'), 2, '8 bazy (rzut osiągalny) − 2 kosztu − 4 zwłoki');
  assert.equal(cmd.type, 'cast_spell', 'późna gra: rzut (62) bije odroczenie (2) — PRZED oba warianty były płaskie');
});

// --- C. plot_card: cena plotu + gra dominowana (dowód decyzyjny S6) --------

test('C1 (dowód S6): rzut tańszy wygrywa z plotem droższym o manę i turę', () => {
  const s = game({ turn: 3 }); las(s, 4); reka(s, 'tr', 'tumbleweed-rising');
  const { cmd, opcje } = oferta(s);
  assert.equal(cmd.type, 'cast_spell', 'PRZED wybierał plot_card (55 vs 49,98)');
  assert.equal(opcje.get('plot_card'), 16, '55 bazy − 4 kosztu plotu − 5 zwłoki − 30 surcharge (plot nie oszczędza many)');
});

test('C2 (anty-over-fix): bez oferty rzutu plot zachowuje dawną bazę minus koszt', () => {
  const s = game({ turn: 3 }); las(s, 4); reka(s, 'sp', 'spinewoods-paladin');
  const { cmd, opcje } = oferta(s);
  assert.equal(cmd.type, 'plot_card', 'plot jest jedyną drogą do karty (rzut {4}{G} nieosiągalny przy 4 lasach)');
  assert.equal(opcje.get('plot_card'), 50, '55 bazy (nietknięte) − koszt {3}{G} = 4 many + 1 pip');
});

test('C3: wymiar KOSZTU plotu — {1}{W} i {3}{G} nie mogą remisować (kontrola (b))', () => {
  const sheriff = (() => { const s = game({ turn: 3 }); pole(s, 3); reka(s, 'sh', 'sheriff-of-safe-passage'); return s; })();
  const tumbleweed = (() => { const s = game({ turn: 3 }); las(s, 4); reka(s, 'tr', 'tumbleweed-rising'); return s; })();
  const tani = wynik(sheriff, 'plot_card', { ...WOLNE, plotRedundantPenalty: 0 });
  const drogi = wynik(tumbleweed, 'plot_card', { ...WOLNE, plotRedundantPenalty: 0 });
  assert.equal(tani, 52, '55 − 3 (plot {1}{W} = 2 many + 1 pip)');
  assert.equal(drogi, 51, '55 − 4 (plot {3}{G} = 3 many + 1 pip)');
  assert.notEqual(tani, drogi, 'różne koszty nie remisują');
});

test('C4: przy rzucie dostępnym tylko zwłoka i surcharge — czysty plot droższy o turę', () => {
  const zSurcharge = (() => { const s = game({ turn: 3 }); pole(s, 3); reka(s, 'sh', 'sheriff-of-safe-passage'); return s; })();
  const zDelay = (() => { const s = game({ turn: 3 }); pole(s, 3); reka(s, 'sh', 'sheriff-of-safe-passage'); return s; })();
  assert.equal(wynik(zSurcharge, 'plot_card'), 47, '55 − 3 kosztu − 5 zwłoki (plot oszczędza manę, więc bez surcharge)');
  assert.equal(wynik(zDelay, 'plot_card', { plotDelayPenalty: 0 }), 52, 'zerowanie zwłoki wraca do ceny kosztu');
});

// --- D. warp_card: cena kosztu warp ---------------------------------------

test('D1: koszt warp jest w wycenie (PRZED: 70,000 przy 4 i przy 6 polach)', () => {
  const cztery = (() => { const s = game({ turn: 5 }); pole(s, 4); reka(s, 'we', 'weftblade-enhancer'); return s; })();
  const szesc = (() => { const s = game({ turn: 5 }); pole(s, 6); reka(s, 'we', 'weftblade-enhancer'); return s; })();
  assert.equal(wynik(cztery, 'warp_card'), 66,
    '70 bazy (ciało 3/4: 70 + 2×3 + 4 = 80, − 15 tymczasowości, + 5 ETB) − 4 (warp {2}{W} = 3 many + 1 pip); gałąź w rodzinie `spell` (×1)');
  assert.equal(wynik(szesc, 'warp_card'), 66, 'ten sam wariant = ten sam wynik (rzut stały to osobna oferta)');
  // (próg 6: ETB-licznik rzutu stałego wyceniony wg PMSSB-36/B, warp ma stałe +5)
  assert.ok(wynik(szesc, 'cast_permanent(we)') < wynik(szesc, 'warp_card') + 6,
    'rzut stały pozostaje w zasięgu warpu — wycena nie „wybiera za gracza”');
});

// --- E. Kontrola anty-over-fix: darmowy rzut bez premii --------------------

test('E1: zwolnienie z kosztu to BRAK kary, nie premia (stała bazy nietknięta)', () => {
  const s = game();
  wExile(s, 'hg', 'hill-giant', { plotted: true, plottedAtTurn: 3 });
  const darmowy = wynik(s, 'cast_permanent(hg)');
  const bazowy = 70 + 2 * 3 + 1 * 3; // creatureBase + waga mocy + waga wytrzymałości
  assert.ok(Math.abs(darmowy - bazowy * 0.9) < 6,
    `darmowy rzut ≈ sama baza ciała × waga (${darmowy.toFixed(3)}) — bez bonusu za zwolnienie`);
});

// --- F. Silnik: pieczęć odroczenia nie przeżywa WYJŚCIA z wygnania (CR 400.7) --
//
// Znalezisko pomiaru wypłaty (`/home/user/scratch/pmssb35-wyplata.mjs`):
// w partii worek-legend|dominaria-brg seed 1000 ta sama karta była rzucana
// z wygnania DWA razy (t12 i t14) — drugi raz po tym, jak Faceless Butcher
// wygnał ją ponownie. Pieczęć (`warpReady`/`plotted`) jechała z obiektem przez
// zmianę strefy, a oferta rzutu z wygnania czyta ją bez pytania o źródło
// wygnania. CR 702.185b: „warped card in exile" to karta wygnana triggerem
// warp; glosariusz „Plotted": plotted jest karta wygnana akcją plot (albo
// efektem, który tak stanowi). Nowy obiekt nie pamięta poprzedniego istnienia.

function oferty(s, objectId) {
  return playerView(s, 'p1').legalCommands.filter((c) => c.objectId === objectId).map((c) => c.type);
}

function rozstrzygnij(s) {
  for (let i = 0; i < 24 && s.zones.stack.length > 0; i += 1) {
    const view = playerView(s, s.turn.priorityPlayerId);
    const cmd = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!cmd) break;
    execute(s, cmd);
  }
  return s.zones.stack.length === 0;
}

const naStole = (s, cardId) => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === 'battlefield');

test('F1 (CR 702.185a/b): pieczęć warp gaśnie przy rzucie — ponowne wygnanie nie daje oferty', () => {
  const s = game({ turn: 7 });
  pole(s, 6);
  wExile(s, 'we', 'weftblade-enhancer', { warpReady: true, warped: false, warpedAtTurn: 6 });
  assert.deepEqual(oferty(s, 'we'), ['cast_permanent'], 'póki karta LEŻY w wygnaniu, pieczęć działa (anty-over-fix)');
  addMana(s, 'p1', 6, { colors: Array(6).fill('W') });
  assert.ok(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'we' }).ok, 'rzut z wygnania przyjęty');
  assert.ok(rozstrzygnij(s), 'stos pusty');
  const perm = naStole(s, 'weftblade-enhancer');
  assert.equal(perm.warpReady, false, 'permanent nie nosi pieczęci wygnania (CR 400.7)');
  const ex = moveObjectDirectly(s, perm.id, 'exile', 'exile-f1', { exiledBy: 'effect' });
  assert.equal(ex.warpReady, false, 'stempel nie wraca po ponownym wygnaniu innym efektem');
  addMana(s, 'p1', 6, { colors: Array(6).fill('W') });
  assert.deepEqual(oferty(s, ex.id), [], '702.185b: warped card to karta wygnana triggerem warp, nie dowolne wygnanie');
});

test('F2 (glosariusz „Plotted"): darmowy rzut zaplotowanej karty gasi pieczęć plot', () => {
  const s = game({ turn: 4 });
  wExile(s, 'sh', 'sheriff-of-safe-passage', { plotted: true, plottedAtTurn: 3 });
  assert.deepEqual(oferty(s, 'sh'), ['cast_permanent'], 'zaplotowana karta jest rzucalna (CR 702.170d)');
  assert.ok(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'sh' }).ok, 'rzut bez kosztu many przyjęty');
  assert.ok(rozstrzygnij(s), 'stos pusty');
  const perm = naStole(s, 'sheriff-of-safe-passage');
  assert.equal(perm.plotted, false, 'permanent nie jest „plotted" (to cecha karty W WYGNANIU)');
  const ex = moveObjectDirectly(s, perm.id, 'exile', 'exile-f2', { exiledBy: 'effect' });
  assert.equal(ex.plotted, false);
  assert.equal(ex.plottedAtTurn, null);
  assert.deepEqual(oferty(s, ex.id), [], 'ponowne wygnanie innym efektem nie czyni karty plotted');
});

test('F3 (CR 400.7, okno impulsu): stempel „zagrywalna do końca tury" nie przeżywa strefy', () => {
  const s = game({ turn: 4 });
  wExile(s, 'hg', 'hill-giant', { playableUntilTurn: 9, playableWithoutPaying: true });
  assert.equal(impulseWindowOf(s.objects.get('hg')), 9, 'stempel okna na karcie w wygnaniu');
  assert.equal(hasFreeCastStamp(s.objects.get('hg')), true);
  const ex = moveObjectDirectly(s, 'hg', 'graveyard', 'grave-f3');
  assert.equal(impulseWindowOf(ex), null, 'para pól gaśnie razem z wyjściem z wygnania');
  assert.equal(hasFreeCastStamp(ex), false);
  assert.deepEqual(s.objects.get('grave-f3').playableUntilTurn ?? null, null, 'i nie wraca na nowym obiekcie');
});

// --- D. Pin O1 z audytu PR #149: rezerwacja many dla rzutu, który NIE płaci
//        kosztu karty (kolejka handoffu 2026-10-01g/02 → domknięta 2026-10-02f)
//
// Audyt PR #149 odłożył ten pin z uzasadnieniem „żadna wspierana karta z plotem
// nie ma celów (ward nieosiągalny), a darmowy impuls ze stemplem + cel nie ma
// sondy". Pin jest dziś wykonalny BEZ warda i bez celu: ten sam warunek
// (`castsWithoutPayingMana` w `reservedManaOf`) jest czytany przez wycenę
// WYPŁATY triggerów „manaSpentBelow/AtLeast" (Opus — Tackle Artist), a ta nie
// patrzy na cele. Silnik dla darmowego rzutu z wygnania emituje
// `spell_cast.manaSpent = 0` → 1 licznik; dla płatnego 5 → 2 liczniki
// (CR 601.2f: mana wydana NA CZAR). Wycena bota musi liczyć to samo (L41).
//
// Ścieżka WARD nadal czeka na kartę: zakryty permanent (disguise) nie niesie
// w widoku `keywords`/`ward` (CR 708), a w katalogu nie ma odkrytego stworu
// z ward — pin wardowy zostaje w kolejce razem z taką kartą.

function liczniki(s, id) {
  return (s.objects.get(id)?.counters ?? {})['+1/+1'] ?? 0;
}

/**
 * Plansza do porównania: Tackle Artist (Opus) + ofiara rzutu. Zwraca stan
 * i wynik wariantu rzutu z wygnania — `free` dodaje stempel darmowego impulsu
 * (CR 701.18), bez niego karta płaci pełny koszt {4}{R}.
 */
function opusRzutZWygnania(free) {
  const s = game({ turn: 6 });
  lądy(s, 'basic-mountain', 5, 'mo');
  dodaj(s, 'art', 'tackle-artist', 'battlefield', 'creature', { summoningSickness: false });
  dodaj(s, 'b', 'hill-giant', 'battlefield', 'creature', { summoningSickness: false });
  wExile(s, 'ex', 'rage-of-purphoros', free
    ? { playableUntilTurn: 12, playableWithoutPaying: true }
    : { playableUntilTurn: 12 });
  return s;
}

test('D1 (pin O1, PR #149): darmowy impuls nie rezerwuje kosztu karty — wycena = silnik', () => {
  // Silnik: darmowy rzut nie wydaje many na czar (1 licznik), płatny wydaje 5 (2).
  const darmowy = opusRzutZWygnania(true);
  const offer = playerView(darmowy, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'ex' && c.targets?.[0] === 'b');
  assert.ok(offer, 'karta z exile ma ofertę rzutu (stempel okna impulsu)');
  assert.ok(execute(darmowy, { type: 'cast_spell', playerId: 'p1', objectId: 'ex', targets: ['b'] }).ok);
  assert.ok(rozstrzygnij(darmowy), 'stos pusty');
  assert.equal(darmowy.events.filter((e) => e.type === 'spell_cast').at(-1)?.manaSpent, 0,
    'darmowy rzut: manaSpent = 0 (CR 118.9)');
  assert.equal(liczniki(darmowy, 'art'), 1, 'Opus: poniżej progu = 1 licznik');

  const platny = opusRzutZWygnania(false);
  assert.ok(execute(platny, { type: 'cast_spell', playerId: 'p1', objectId: 'ex', targets: ['b'] }).ok);
  assert.ok(rozstrzygnij(platny), 'stos pusty');
  assert.equal(platny.events.filter((e) => e.type === 'spell_cast').at(-1)?.manaSpent, 5,
    'płatny rzut: manaSpent = koszt karty');
  assert.equal(liczniki(platny, 'art'), 2, 'Opus: od progu = 2 liczniki');

  // Bot: ta sama arytmetyka (L41). Δ = udział wypłaty Opusa w wyniku wariantu.
  const delta = (s) => wynik(s, 'cast_spell(ex->b)') - wynik(s, 'cast_spell(ex->b)', { boardPayoffWeight: 0 });
  const deltaDarmowy = delta(opusRzutZWygnania(true));
  const deltaPlatny = delta(opusRzutZWygnania(false));
  blisko(deltaDarmowy, 14, 'darmowy rzut: wycena liczy gałąź „poniżej pięciu many"');
  blisko(deltaPlatny, 16, 'płatny rzut: wycena liczy gałąź „pięć lub więcej"');
  blisko(deltaPlatny - deltaDarmowy, 4 * 0.5,
    'różnica = jeden licznik (counterAmountWeight 4 × boardPayoffWeight 0,5)');
  assert.ok(deltaDarmowy < deltaPlatny,
    'mutacja: usunięcie gałęzi darmowego rzutu w `reservedManaOf` zrównuje obie wartości (16 = 16)');
});

// --- G. Odmowa rzutu z ZAWIESZENIA gasi uprawnienie (CR 702.62c) -----------
//
// Znalezisko 2026-10-02f (ta sama rodzina co F1/F2 z audytu PR #149 —
// „uprawnienie do rzutu istnieje tylko wtedy, gdy daje je mechanika"):
// decyzja `resolve_suspend_cast` przy odmowie zmieniała wyłącznie
// `suspended`, a flagą czytaną przez ścieżki rzutu jest `suspendReady`
// (`requireSpell`, `manaCostWaived` w `castSpell`, oferta `legalSpellCasts`,
// `castModalSpell`) — karta zostawała więc w wygnaniu rzucalna BEZ KOSZTU
// MANY, w dowolnej fazie i bez terminu (sonda: po odmowie 2 oferty
// `cast_spell` i rzut PRZYJĘTY). Bliźniaczy rebound (CR 702.88a) gasi swoją
// flagę `reboundReady` przy odmowie od dawna (L41: bliźniacze ścieżki nie
// mogą się rozjeżdżać).

test('G1 (CR 702.62c): po odmowie rzutu z zawieszenia karta NIE jest rzucalna', () => {
  const s = game({ turn: 6 });
  wExile(s, 'ms', 'mindstab', { suspended: true, timeCounters: 0, suspendReady: true });
  s.pendingSuspendCast = { playerId: 'p1', objectId: 'ms', cardId: 'mindstab', restorePriorityTo: 'p1' };
  s.turn.priorityPlayerId = 'p1';
  assert.deepEqual(oferty(s, 'ms').filter((type) => type === 'cast_spell'), [],
    'póki decyzja jest otwarta, rzut idzie wyłącznie przez nią');
  assert.ok(execute(s, { type: 'resolve_suspend_cast', playerId: 'p1', objectId: 'ms', cast: false }).ok,
    'odmowa przyjęta');
  const obj = s.objects.get('ms');
  assert.equal(obj.zone, 'exile', 'karta zostaje w wygnaniu');
  assert.equal(obj.suspended, false, 'bez statusu „zawieszonej"');
  assert.equal(obj.suspendReady, false, 'uprawnienie jest JEDNORAZOWE (CR 702.62c)');
  assert.deepEqual(oferty(s, 'ms'), [], 'brak ofert dla karty (PRZED: 2 × cast_spell)');
  const recznie = execute(s, { type: 'cast_spell', playerId: 'p1', objectId: 'ms', targets: ['p2'] });
  assert.equal(recznie.ok, false, 'ręcznie zbudowana komenda też odrzucona (L48: oferta = walidacja)');
  const reason = recznie.events.find((e) => e.type === 'command_rejected')?.reason ?? '';
  assert.ok(reason.startsWith('illegal_spell'), `reason jawny (${reason})`);
});
