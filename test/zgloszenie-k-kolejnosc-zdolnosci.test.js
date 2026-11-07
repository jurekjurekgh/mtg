// Zgłoszenie „K” (uwaga właściciela 2026-11-07): rozstrzyganie dwóch
// równoczesnych zdolności triggerowanych atakiem dawało modal
// „Wybierz: Która zdolność ma rozstrzygnąć się jako następna? — wskaż
// kartę:” z dwiema opcjami „?” — gracz nie miał po czym wybrać („I jak ja
// mam to wybrać???”).
//
// Root cause (dwie warstwy):
//  1. UI: ogólna rodzina jednowyborowa (M299) porywała grupę
//     `resolve_trigger_order` po polu `cardId` ŹRÓDŁA zdolności jak „wybór
//     karty” — kreator „wskaż kartę” etykietował wiersze przez objectId w
//     strefach, a cardId nim nie jest, stąd „?”.
//  2. UI: opis skutku brał z komendy sam `effectTypes` (typ efektu bez
//     parametrów) — „? obrażeń obrońcy” zamiast „1 obrażenie obrońcy”.
//
// Piny:
//   K/1 — kaskada UI: żaden kreator „wskaż kartę/cel” nie przejmuje grupy
//         kolejności (singleTargetPlanOf = null); grupa trafia do wspólnego
//         helpera przyciskowego M302 (buttonsPlanOf);
//   K/2 — etykieta opcji nazywa KARTĘ, ZDARZENIE i SKUTEK z parametrami
//         (pełne deskryptory abilityEffects ze stosu — ADR 0017);
//   K/3 — tytuł grupy/modala pyta o kolejność (bez „wskaż kartę”);
//   K/4 — podgląd opcji (lupa) pokazuje KARTĘ ŹRÓDŁA zdolności, nie cel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { singleTargetPlanOf, buttonsPlanOf } from '../src/table/multi-target.js';
import { commandLabel, choiceGroupTitle } from '../src/table/render.js';
import { previewCardIdOfOption } from '../src/table/choice-request.js';

const reg = createCardRegistry();

function put(s, id, cardId, zone = 'battlefield', player = 'p1') {
  const d = reg.get(cardId);
  assert.ok(d, `karta ${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, ownerId: player, controllerId: player, zone,
    ...gameObjectDataOf(d), types: d.types ?? [], subtypes: d.subtypes ?? [], keywords: d.keywords ?? [],
  });
}

/** Scena zgłoszenia: dwa stwory z triggerem „gdy atakuje" atakują naraz. */
function attackScene() {
  const s = createGameState({ seed: 2107, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  // Scorch Spitter — „gdy atakuje: 1 obrażenie obrońcy"; Gruul Beastmaster —
  // „gdy atakuje: +X/+0, X = moc źródła". Dwa RÓWNOCZESNE triggery ataku.
  put(s, 'spitter', 'scorch-spitter');
  put(s, 'beast', 'gruul-beastmaster');
  s.objects.set('spitter', Object.freeze({ ...s.objects.get('spitter'), summoningSickness: false }));
  s.objects.set('beast', Object.freeze({ ...s.objects.get('beast'), summoningSickness: false }));
  for (let i = 0; i < 5; i += 1) put(s, `lib${i}`, 'basic-mountain', 'library');
  assert.ok(execute(s, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['spitter', 'beast'] }).ok,
    'deklaracja obu atakujących');
  return s;
}

function sessionStub() {
  return {
    nameOf: (id) => reg.get(id)?.name ?? String(id),
    nameOfObject: (id) => String(id),
    abilitiesOf: (id) => reg.get(id)?.abilities ?? [],
  };
}

function choicesOf(view) {
  const choices = view.legalCommands.filter((c) => c.type === 'resolve_trigger_order');
  assert.equal(choices.length, 2, 'dwie równoczesne zdolności do ułożenia');
  return choices;
}

// ---- K/1: kaskada UI — decyzja o kolejności NIE jest wyborem karty ---------

test('K/1: grupa kolejności zdolności nie trafia do kreatora „wskaż kartę” (M302)', () => {
  const view = playerView(attackScene(), 'p1');
  const choices = choicesOf(view);
  // Wcześniej: singleTargetPlanOf łapał pole cardId → modal „…— wskaż
  // kartę:” z wierszami „?” (cardId nie jest objectId w strefach).
  assert.equal(singleTargetPlanOf(choices), null,
    'kolejność zdolności to nie wybór jednej karty z listy kandydatów');
  // Grupa trafia do wspólnego helpera przyciskowego — pełne etykiety komend.
  const buttons = buttonsPlanOf(choices);
  assert.ok(buttons, 'buttonsPlanOf przejmuje grupę (wspólny helper M302)');
  assert.equal(buttons.buttonsMode, true);
});

// ---- K/2: etykieta opcji — karta + zdarzenie + skutek z parametrami --------

test('K/2: etykieta nazywa kartę, zdarzenie i skutek zdolności (pełne efekty ze stosu)', () => {
  const view = playerView(attackScene(), 'p1');
  const session = sessionStub();
  const byCard = new Map(choicesOf(view).map((c) => [c.cardId, c]));

  const spitter = commandLabel(byCard.get('scorch-spitter'), session, view);
  assert.ok(spitter.startsWith('Najpierw: Scorch Spitter'), `nazwa karty na początku: „${spitter}”`);
  assert.ok(spitter.includes('atak'), `zdarzenie triggera: „${spitter}”`);
  assert.ok(spitter.includes('1 obrażenie obrońcy'), `skutek z parametrem (nie „? obrażeń”): „${spitter}”`);

  const beast = commandLabel(byCard.get('gruul-beastmaster'), session, view);
  assert.ok(beast.startsWith('Najpierw: Gruul Beastmaster'), `nazwa karty: „${beast}”`);
  assert.ok(beast.includes('moc źródła'), `dynamiczna wartość pumpa opisana: „${beast}”`);
});

// ---- K/3: tytuł grupy/modala pyta o kolejność --------------------------------

test('K/3: tytuł grupy pyta o kolejność zdolności (bez „wskaż kartę”)', () => {
  const view = playerView(attackScene(), 'p1');
  const session = sessionStub();
  const title = choiceGroupTitle({ type: 'command', options: choicesOf(view) }, session, view);
  assert.ok(title.includes('Która zdolność ma rozstrzygnąć się jako następna'),
    `tytuł nazywa decyzję: „${title}”`);
  assert.ok(!title.includes('wskaż kartę'), `bez mylącego „wskaż kartę”: „${title}”`);
});

// ---- K/4: podgląd opcji pokazuje kartę ŹRÓDŁA zdolności ----------------------

test('K/4: lupa opcji kolejności pokazuje kartę źródła zdolności (nie cel)', () => {
  const view = playerView(attackScene(), 'p1');
  const resolveCardId = (id) => (reg.get(id) ? id : null);
  for (const choice of choicesOf(view)) {
    const preview = previewCardIdOfOption(choice, resolveCardId, view);
    assert.equal(preview, choice.cardId,
      `podgląd = karta źródła (${choice.cardId}), nie cel triggera`);
  }
});
