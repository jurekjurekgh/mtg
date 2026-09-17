// A — znalezisko właściciela (Mana Cylix {1},{T}: dowolny kolor): artefakt
// jest IGNOROWANY przy ofercie rzutów (np. czar {B} + Cylix + 2 nietapnięte
// lądy, brak Swampa → brak oferty) i przy płatności. Root cause: Cylix to
// źródło KOSZTOWE (netto 0, konwerter walut) — silnik widział tylko źródła
// DARMOWE (untappedFreeManaSources: koszt to dokładnie samo {T}):
// (1) oferta (producibleMana/planGrantManaColors) nie doliczała jego kolorów;
// (2) kreator (manaSourcesOf) odrzucał go regułą „netto ≤ 0 → pomiń";
// (3) płatność (spendMana) nie umiała go odpalić (koszt {1} z puli/innych).
// Naprawa: A1 — kosztowe źródła many w ofercie (bramka warstwowa: koszt musi
// pokryć baza darmowa, kosztowe nie finansują kosztowych); A2 — konwertery
// walut na liście kreatora; A3 — spendMana odpala kosztowe (pip: ostatnia
// deska + pokrywa brakujący kolor; amount: tylko netto-dodatnie).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { spendMana, addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { countPaymentVariants, manaSourcesOf } from '../src/table/mana-wizard.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function castOffer(view, objectId) {
  return (view.legalCommands ?? []).find((c) => c.type === 'cast_spell' && c.objectId === objectId);
}

test('A/0: kontrola — Swamp + Szczury laboratoryjne ({B}) → oferta (bug jest w źródłach kosztowych)', () => {
  const state = game('p1');
  putCard(state, 's', 'basic-swamp', 'p1');
  putCard(state, 'rats', 'lab-rats', 'p1', 'hand');
  assert.ok(castOffer(playerView(state, 'p1'), 'rats'), 'rzut {B} przy Swampie oferowany');
});

test('A/1: Cylix + Wyspa + Plains (brak Swampa) → rzut {B} OFEROWANY (A1)', () => {
  // {1} kosztu Cylixa płacą lądy (2 many darmowe ≥ 1), produkcja daje {B}.
  const state = game('p1');
  putCard(state, 'cylix', 'mana-cylix', 'p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'p', 'basic-plains', 'p1');
  putCard(state, 'rats', 'lab-rats', 'p1', 'hand');
  assert.ok(castOffer(playerView(state, 'p1'), 'rats'), 'Cylix finansuje {B} (lądy płacą {1})');
});

test('A/2: pełny rzut przez Cylix — lądy i Cylix tapnięte, Szczury zeszły z ręki (A3)', () => {
  const state = game('p1');
  putCard(state, 'cylix', 'mana-cylix', 'p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'p', 'basic-plains', 'p1');
  putCard(state, 'rats', 'lab-rats', 'p1', 'hand');
  const offer = castOffer(playerView(state, 'p1'), 'rats');
  assert.ok(offer, 'oferta istnieje (A1)');
  execute(state, { ...offer });
  // Rzut przenosi kartę ręka→stos pod NOWYM id (silnik) — szukamy po karcie.
  const rats = [...state.objects.values()].find((o) => o.cardId === 'lab-rats');
  assert.ok(rats && rats.zone !== 'hand', 'Szczury rzucone (stos/rozpatrzone)');
  assert.equal(state.objects.get('cylix').tapped, true, 'Cylix zużyty (produkcja {B})');
  assert.equal(state.objects.get('i').tapped, true, 'Wyspa tapnięta (finansuje {1})');
  // Auto-tap płaci MINIMALNIE (M34): {1} to jedna mana — drugi ląd nietknięty.
  assert.equal(state.objects.get('p').tapped ?? false, false, 'Plains nietapnięty (nadmiar niepotrzebny)');
});

test('A/3: kreator WYSTAWIA konwerter netto-0 (Cylix: produkcja ⊄ koszt) z kosztem (A2)', () => {
  // Syntetyczny widok: ląd + legalna zdolność many artefaktu.
  const view = {
    players: [{ id: 'p1' }],
    zones: { battlefield: [{ id: 'i', cardId: 'basic-island', controllerId: 'p1', tapped: false }] },
    legalCommands: [{ type: 'tap_for_mana', playerId: 'p1', objectId: 'i' },
      { type: 'activate_ability', playerId: 'p1', objectId: 'cylix', abilityIndex: 0 }],
  };
  const abilityInfo = (id) => (id === 'cylix'
    ? { cardId: 'mana-cylix', colors: ['W', 'U', 'B', 'R', 'G'], amount: 1, manaCost: 1, costColors: [], isLand: false }
    : null);
  const sources = manaSourcesOf(view, 'p1', abilityInfo);
  const cylix = sources.find((s) => s.id === 'cylix');
  assert.ok(cylix, 'Cylix na liście kreatora (konwerter walut, nie strata)');
  assert.deepEqual(cylix.activationCost, { generic: 1, colors: [] }, 'koszt {1} osobno (M311)');
  assert.equal(cylix.amount, 1, 'pełna produkcja (nie netowana, M311)');
});

test('A/4: Cylix + JEDEN ląd → rzut {B} oferowany (1 mana finansuje {1})', () => {
  const state = game('p1');
  putCard(state, 'cylix', 'mana-cylix', 'p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'rats', 'lab-rats', 'p1', 'hand');
  assert.ok(castOffer(playerView(state, 'p1'), 'rats'), '1 ląd wystarcza na koszt {1}');
});

test('A/5: SAM Cylix (zero lądów) → BRAK oferty (nie ma czym zapłacić {1})', () => {
  const state = game('p1');
  putCard(state, 'cylix', 'mana-cylix', 'p1');
  putCard(state, 'rats', 'lab-rats', 'p1', 'hand');
  assert.equal(castOffer(playerView(state, 'p1'), 'rats'), undefined, 'bez many na koszt — cisza (anty-over-fix)');
});

test('A/6: DWA Cylixy, zero lądów → BRAK oferty (kosztowe nie finansują kosztowych)', () => {
  // Warstwowość A1: koszt {1} musi pokryć baza DARMOWA (pula/lądy/wolne).
  const state = game('p1');
  putCard(state, 'c1', 'mana-cylix', 'p1');
  putCard(state, 'c2', 'mana-cylix', 'p1');
  putCard(state, 'rats', 'lab-rats', 'p1', 'hand');
  assert.equal(castOffer(playerView(state, 'p1'), 'rats'), undefined, 'łańcuch Cylix→Cylix zabroniony');
});

test('A/7: solver liczy wariant z kosztem — [Wyspa, Cylix] przy {B} to 1 (auto, wymuszone)', () => {
  // Uścisk A2→solver: Cylix z activationCost wchodzi do pokrycia (M311:
  // koszt {1} doliczony do sumy), zbiór minimalny = oba źródła = 1 wariant.
  const sources = [
    { id: 'i', cardId: 'basic-island', colors: ['U'], amount: 1 },
    {
      id: 'cylix', cardId: 'mana-cylix', colors: ['W', 'U', 'B', 'R', 'G'], amount: 1,
      activationCost: { generic: 1, colors: [] },
    },
  ];
  assert.equal(countPaymentVariants(sources, 0, 1, [['B']]), 1);
});

test('A/8: czysta strata netto-0 (produkcja ⊆ kosztu) ZOSTAJE poza listą', () => {
  // Anty-over-fix A2: hipotetyczne {1},{T}: Add {C} (tap za nic) to nie wybór —
  // kreator milczy. (Pipowo-kosztowe {R}→{R} lista pokazuje (netto w generic),
  // ale solver nigdy nie liczy go jako minimalnego (jednostka kryje tylko
  // własny pip) — nieszkodliwe.)
  const view = {
    players: [{ id: 'p1' }],
    zones: { battlefield: [] },
    legalCommands: [{ type: 'activate_ability', playerId: 'p1', objectId: 'loop', abilityIndex: 0 }],
  };
  const abilityInfo = (id) => (id === 'loop'
    ? { cardId: 'x', colors: [], amount: 1, manaCost: 1, costColors: [], isLand: false }
    : null);
  assert.equal(manaSourcesOf(view, 'p1', abilityInfo).find((s) => s.id === 'loop'), undefined);
});

test('A/9: Apprentice w gałęzi sumy — rezerwa świeżej bazy (anty-korupcja M201)', () => {
  // Wyspa + Apprentice ({U},{T}:+{C}{C}{C}), płatność {3}: gałąź amount NIE
  // może zjeść Wyspy przed sfinansowaniem kosztu {U} — inaczej pula rozjeżdża
  // się z licznikiem (cicha krótka konsumpcja, mana ujemna).
  const state = game('p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'ap', 'apprentice-wizard', 'p1');
  spendMana(state, 'p1', 3, [], {});
  const player = state.players.find((pl) => pl.id === 'p1');
  const mapsSum = Object.values(player.manaPool ?? {}).reduce((a, b) => a + b, 0)
    + Object.values(player.restrictedPool ?? {}).reduce((a, b) => a + b, 0);
  assert.equal(player.mana, mapsSum, 'M201: licznik = suma map (brak korupcji)');
  assert.equal(player.mana >= 0, true, 'mana nieujemna');
  assert.equal(state.objects.get('i').tapped, true, 'Wyspa tapnięta (finansuje {U})');
  assert.equal(state.objects.get('ap').tapped, true, 'Apprentice odpalony (produkcja {C}{C}{C})');
});

test('A/10: kształt crash-2 (benchmark seed 2033) — oferta→płatność bez rejectu', () => {
  // Pula {B,B} + Swampy + Cylix (Wyspa/Plains tapnięte WCZEŚNIEJ) + Goblin
  // Deathraiders ({B}{R}): gałąź pipów tapowała Swampy w pokrytym kolorze {B},
  // zjadając świeżą bazę bramki — re-bramka wpadała w tryb ścisły i płatność
  // padała (oferta→reject, L48). Rezerwa: ostatni ląd finansowania nietknięty.
  const state = game('p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 's1', 'basic-swamp', 'p1');
  putCard(state, 's2', 'basic-swamp', 'p1');
  putCard(state, 'pl', 'basic-plains', 'p1');
  putCard(state, 'cylix', 'mana-cylix', 'p1');
  // Wyspa/Plains tapnięte WCZEŚNIEJ (stan bojowy po dodaniu — kontrakt L21).
  for (const id of ['i', 'pl']) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  addMana(state, 'p1', 2, { colors: ['B'] });
  putCard(state, 'raid', 'goblin-deathraiders', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const offer = (view.legalCommands ?? []).find((c) => c.type === 'cast_permanent' && c.objectId === 'raid');
  assert.ok(offer, 'oferta istnieje');
  const result = execute(state, { ...offer });
  assert.equal(result.ok, true, 'płatność przechodzi (bez rejectu)');
  const raid = [...state.objects.values()].find((o) => o.cardId === 'goblin-deathraiders');
  assert.ok(raid && raid.zone !== 'hand', 'Raidersi rzuceni');
});

test('A/11: kształt crash-1 (benchmark seed 2026) — pula-any + Cylix + 2 pipy', () => {
  // Pula {dowolna} + I+P+S + Cylix + Exploding Borders ({2}{R}{G}): finansowanie
  // {1} tapuje ŚWIEŻE (nie zjada puli przypisanej pipom), pin regresji.
  const state = game('p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'pl', 'basic-plains', 'p1');
  putCard(state, 's', 'basic-swamp', 'p1');
  putCard(state, 'cylix', 'mana-cylix', 'p1');
  addMana(state, 'p1', 1, { colors: ['W', 'U', 'B', 'R', 'G'] });
  putCard(state, 'eb', 'exploding-borders', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const offer = (view.legalCommands ?? []).find((c) => c.type === 'cast_spell' && c.objectId === 'eb');
  assert.ok(offer, 'oferta istnieje');
  const result = execute(state, { ...offer });
  assert.equal(result.ok, true, 'płatność przechodzi (bez rejectu)');
});

test('A/12: kształt crash-3 (benchmark seed 2027) — koszt źródła kosztowego nie zjada pipa płatności', () => {
  // random(wiedzmin-wur) vs heuristic(innistrad-wu), seed 2027: Inspiration
  // {3}{U} przy 2 Wyspach + Apprentice Wizard („{U}, {T}: Add {C}{C}{C}").
  // Auto-tap zapłacił koszt {U} zdolności jednostką odłożoną na {U} rzucanego
  // czaru → pula {C}{C}{C} bez pokrycia → consumeManaPool rzucał „Brak
  // kolorowej many w puli" i zostawiał mutację (jedna Wyspa tapnięta, pula
  // bez koloru). Legalna płatność to Wyspa+Wyspa+Wizard: druga Wyspa płaci
  // koszt zdolności, produkcja {C}{C}{C} idzie na generic czaru.
  const state = game('p1');
  putCard(state, 'i1', 'basic-island', 'p1');
  putCard(state, 'i2', 'basic-island', 'p1');
  putCard(state, 'wiz', 'apprentice-wizard', 'p1');
  state.objects.set('wiz', Object.freeze({ ...state.objects.get('wiz'), summoningSickness: false }));
  putCard(state, 'insp', 'inspiration', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const offer = (view.legalCommands ?? []).find((c) => c.type === 'cast_spell' && c.objectId === 'insp');
  assert.ok(offer, 'oferta rzutu {3}{U} istnieje (oferta = płatność, L48)');
  const result = execute(state, { ...offer });
  assert.equal(result.ok, true, 'płatność przechodzi (bez rejectu)');
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.equal(p1.mana, 0, 'mana rozliczona do zera');
  assert.deepEqual(p1.manaPool, {}, 'pula pusta po zapłacie');
  for (const id of ['i1', 'i2', 'wiz']) {
    assert.equal(state.objects.get(id).tapped, true, `${id} tapnięty (cała produkcja zużyta)`);
  }
  const onStack = [...state.objects.values()].find((o) => o.cardId === 'inspiration' && o.zone === 'stack');
  assert.ok(onStack, 'czar na stosie');
});

test('A/13: kształt crash-3 — JEDNA Wyspa + Wizard to za mało na {3}{U} (brak oferty)', () => {
  // Ten sam układ bez drugiej Wyspy: produkcja 4 many wymaga zapłaty kosztu
  // {U} zdolności (1 mana) — razem dostępne 3 → oferty nie ma, a nieudana
  // płatność nie może zostawić tapniętej Wyspy ani manu w puli.
  const state = game('p1');
  putCard(state, 'i1', 'basic-island', 'p1');
  putCard(state, 'wiz', 'apprentice-wizard', 'p1');
  state.objects.set('wiz', Object.freeze({ ...state.objects.get('wiz'), summoningSickness: false }));
  putCard(state, 'insp', 'inspiration', 'p1', 'hand');
  const view = playerView(state, 'p1');
  assert.equal((view.legalCommands ?? []).some((c) => c.type === 'cast_spell' && c.objectId === 'insp'), false,
    'brak oferty rzutu {3}{U}');
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.equal(p1.mana, 0, 'pula nietknięta (oferta nie mutuje)');
  assert.equal(state.objects.get('i1').tapped, false, 'Wyspa odkręcona (zero częściowej płatności)');
});
