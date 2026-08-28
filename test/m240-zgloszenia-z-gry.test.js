// M240 — zgłoszenia z gry właściciela (2026-08-27).
//
// A: Manor Gate (i każdy nie-aur wybierający kolor) — teksty zdarzeń
// color_choice_* brały nazwę WYŁĄCZNIE z `auraId`; dla lądu wychodziło
// „null — wybrany kolor: czarny”. Gracz nie dostawał żadnej czytelnej
// informacji o tym, jaki kolor bot wybrał dla bramy.
// Dawniej „(ochrona przed nim)” doklejano nawet dla lądów — sens aneksu
// zależy od tego, CO wybiera kolor (aura = ochrona, ląd z chooseColor =
// produkowana mana), ale tekst nie może być „null”.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';

const HELPERS = {
  nameOf: (cardId) => cardId === 'manor-gate' ? 'Manor Gate' : (cardId ?? null),
  nameOfObject: (id) => id === 'blessing1' ? 'Benevolent Blessing' : null,
  cardIdByName: () => null,
  effectiveKeywordsOf: () => [],
  isPlayer: () => false,
  controllerOf: () => null,
};
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const describe = (event) => describeGameEvent(event, HELPERS, NAMES);

test('M240/A: color_choice_resolved dla lądu (Manor Gate) nazywa kartę, gracza i kolor — nie „null”', () => {
  const text = describe({
    type: 'color_choice_resolved', playerId: 'p2', color: 'B',
    auraId: null, objectId: 'gate1', cardId: 'manor-gate',
  });
  assert.ok(text, 'tekst decyzji musi istnieć');
  assert.ok(!/null/.test(text), `bez śmieci „null”: ${text}`);
  assert.match(text, /Manor Gate/, `nazwa karty: ${text}`);
  assert.match(text, /Nieprzyjaciel/, `kto wybrał: ${text}`);
  assert.match(text, /czarny/, `jaki kolor: ${text}`);
  assert.ok(!/ochrona przed nim/.test(text), `ląd nie zwiastuje ochrony: ${text}`);
});

test('M240/A: color_choice_required dla lądu też nazywa kartę i cel decyzji', () => {
  const text = describe({
    type: 'color_choice_required', playerId: 'p2',
    auraId: null, objectId: 'gate1', cardId: 'manor-gate', excludeColors: ['G'],
  });
  assert.ok(text, 'tekst decyzji musi istnieć');
  assert.ok(!/null/.test(text), `bez śmieci „null”: ${text}`);
  assert.match(text, /Manor Gate/, `nazwa karty: ${text}`);
});

test('M240/A: aura (Benevolent Blessing) zachowuje sens „ochrona przed nim” (strażnik)', () => {
  const text = describe({
    type: 'color_choice_resolved', playerId: 'p2', color: 'U',
    auraId: 'blessing1', objectId: 'blessing1', cardId: null,
  });
  assert.ok(text, 'tekst decyzji musi istnieć');
  assert.match(text, /Benevolent Blessing/, `nazwa aury: ${text}`);
  assert.match(text, /ochrona/, `aura nadal mówi o ochronie: ${text}`);
  assert.match(text, /niebieski/, `kolor: ${text}`);
});

// =============================================================================
// B/K: tytuł grupy wyboru w „Twoje działania” (i nagłówek modala) musi nazywać
// KARTĘ ŹRÓDŁA decyzji, gdy tylko jest na widoku (ADR 0017 — deskryptory).
// =============================================================================
import { choiceGroupTitle } from '../src/table/render.js';

const SESSION_NAMES = {
  'satyr-wayfinder': 'Satyr Wayfinder',
  'sleep-of-the-dead': 'Sleep of the Dead',
  'sweet-oblivion': 'Sweet Oblivion',
  'spread-the-sickness': 'Spread the Sickness',
  'springbloom-druid': 'Springbloom Druid',
  'basic-forest': 'Forest',
};
const mkSession = () => ({ nameOf: (cardId) => SESSION_NAMES[cardId] ?? cardId });

test('M240/B: Satyr Wayfinder ETB — tytuł nazywa kartę („Satyr Wayfinder — …”), nie „Wariant”', () => {
  const cmd = { type: 'resolve_satyr_look_choice', playerId: 'p1', pickId: 'lib-forest' };
  const view = {
    pendingSatyrLook: { sourceCardId: 'satyr-wayfinder' },
    zones: { library: [{ id: 'lib-forest', cardId: 'basic-forest' }] },
  };
  const title = choiceGroupTitle({ type: 'satyr_look', options: [cmd] }, mkSession(), view);
  assert.match(title, /Satyr Wayfinder/, `tytuł nazywa kartę źródła: ${title}`);
  assert.doesNotMatch(title, /Wariant/, `bez generycznego „Wariant”: ${title}`);
});

test('M240/K: Escape (Sleep of the Dead) — tytuł nazywa CZAR, nie tylko „Ucieczka (Escape) — karty do wygnania”', () => {
  const cmd = { type: 'cast_escape', playerId: 'p1', objectId: 'g7', targets: [], escapeExileIds: ['g1', 'g2', 'g3'] };
  const view = { zones: { graveyard: [{ id: 'g7', cardId: 'sleep-of-the-dead', zone: 'graveyard' }] } };
  const title = choiceGroupTitle({ type: 'escape', options: [cmd] }, mkSession(), view);
  assert.match(title, /Sleep of the Dead/, `tytuł nazywa czar: ${title}`);
  assert.match(title, /Escape/, `mechanika nadal czytelna: ${title}`);
});

test('M240/K: dwie karty Escape na cmentarzu → DWA różne tytuły', () => {
  const view = {
    zones: {
      graveyard: [
        { id: 'g7', cardId: 'sleep-of-the-dead', zone: 'graveyard' },
        { id: 'g9', cardId: 'sweet-oblivion', zone: 'graveyard' },
      ],
    },
  };
  const cmdA = { type: 'cast_escape', playerId: 'p1', objectId: 'g7', targets: [], escapeExileIds: ['g1', 'g2', 'g3'] };
  const cmdB = { type: 'cast_escape', playerId: 'p1', objectId: 'g9', targets: [], escapeExileIds: ['g1', 'g2', 'g3'] };
  const titleA = choiceGroupTitle({ type: 'escape', options: [cmdA] }, mkSession(), view);
  const titleB = choiceGroupTitle({ type: 'escape', options: [cmdB] }, mkSession(), view);
  assert.notEqual(titleA, titleB, `niedozwolone nierozróżnialne tytuły: ${titleA}`);
});

test('M240/K (audyt): decyzje z rozpoznanym źródłem nigdy nie spadają do „Wariant”', () => {
  const session = mkSession();
  const scenarios = [
    {
      note: 'springbloom — ląd do poświęcenia (precedens M212/B, strażnik)',
      request: { type: null, options: [{ type: 'resolve_springbloom', playerId: 'p1', sacrificeId: 'land1' }] },
      view: { pendingSpringbloom: { sourceCardId: 'springbloom-druid' }, zones: {} },
      expect: 'Springbloom Druid',
    },
    {
      note: 'proliferate — cel licznika (sourceCardId z pendingu)',
      request: { type: null, options: [{ type: 'resolve_proliferate', playerId: 'p1', targetId: 'x1' }] },
      view: { pendingProliferate: { sourceCardId: 'spread-the-sickness' }, zones: {} },
      expect: 'Spread the Sickness',
    },
    {
      note: 'satyr look — ląd z odkrytych (M240/B)',
      request: { type: null, options: [{ type: 'resolve_satyr_look_choice', playerId: 'p1', pickId: 'f1' }] },
      view: { pendingSatyrLook: { sourceCardId: 'satyr-wayfinder' }, zones: {} },
      expect: 'Satyr Wayfinder',
    },
    {
      note: 'escape — karty do wygnania (M240/K)',
      request: { type: 'escape', options: [{ type: 'cast_escape', playerId: 'p1', objectId: 'g7', targets: [], escapeExileIds: ['g1'] }] },
      view: { zones: { graveyard: [{ id: 'g7', cardId: 'sleep-of-the-dead', zone: 'graveyard' }] } },
      expect: 'Sleep of the Dead',
    },
  ];
  for (const scenario of scenarios) {
    const title = choiceGroupTitle(scenario.request, session, scenario.view);
    assert.ok(!/Wariant/.test(title ?? ''), `${scenario.note}: spadło do „Wariant”: ${title}`);
    assert.match(title ?? '', new RegExp(scenario.expect), `${scenario.note}: tytuł nazywa kartę: ${title}`);
  }
});
