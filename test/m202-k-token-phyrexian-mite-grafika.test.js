// M202/K — zgłoszenie właściciela: „Token Phyrexian Mite nie ma grafiki
// scryfall” (kafel pokazywał syntetyczną zaślepkę).
//
// Przyczyna: token NIE MIAŁ WPISU w katalogu. Sam token działał poprawnie —
// tworzy go efekt `create_token` Crawling Chorus, który niesie cechy i
// `cantBlock` inline (ADR 0002) — ale kafel bierze `imageUri` z
// `session.cardDetails(cardId)`, a to czyta rejestr kart. Brak wpisu =
// `details` puste = `artOf` bez `imageUri` = `tileImageSources` zwraca [] =
// brak <img> i syntetyczna twarz zamiast obrazu.
//
// Fix: wpis w katalogu z drukiem tokena i obrazem ze Scryfall (set „tone”,
// Phyrexia: All Will Be One Tokens). Ten test idzie całą drogą renderu, żeby
// przyszły token bez wpisu złapał się tutaj, a nie dopiero na telefonie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { tileImageSources } from '../src/table/card-images.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

test('M202/K: token Phyrexian Mite ma wpis w katalogu z grafiką Scryfall', () => {
  const details = REGISTRY.get('token_phyrexian_mite');
  assert.ok(details, 'token musi mieć wpis w katalogu — inaczej kafel nie ma skąd wziąć obrazu');
  assert.match(details.imageUri ?? '', /^https:\/\/cards\.scryfall\.io\//, 'grafika ze Scryfall');
  assert.equal(details.power, 1);
  assert.equal(details.toughness, 1);
  assert.deepEqual(details.types, ['Artifact', 'Creature', 'Token']);
  assert.ok((details.keywords ?? []).includes('toxic'), 'druk tokena: toxic 1');
});

test('M202/K: token stworzony przez Crawling Chorus renderuje się z obrazem, nie zaślepką', () => {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn('p1'), ...TURN_STEPS[3], stepIndex: 3, activePlayerId: 'p1', priorityPlayerId: 'p1', passes: 0 };
  const def = REGISTRY.get('crawling-chorus');
  addObject(state, {
    id: 'chorus', instanceId: 'i-chorus', cardId: 'crawling-chorus', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, types: ['Creature'],
    abilities: def.abilities ?? [],
  });
  const chorus = state.objects.get('chorus');
  const createToken = (chorus.abilities ?? [])
    .flatMap((a) => (Array.isArray(a.effect) ? a.effect : [a.effect]))
    .find((e) => e?.type === 'create_token' && e.cardId === 'token_phyrexian_mite');
  assert.ok(createToken, 'Crawling Chorus tworzy token Phyrexian Mite');
  applyEffect(state, createToken, chorus, []);
  const mite = [...state.objects.values()].find((o) => o.cardId === 'token_phyrexian_mite' && o.zone === 'battlefield');
  assert.ok(mite, 'token wszedł na pole bitwy');

  // Dokładnie ta ścieżka, którą idzie kafel: cardId → cardDetails → imageUri.
  const details = REGISTRY.get(mite.cardId);
  const sources = tileImageSources({ name: mite.name ?? details?.name, imageUri: details?.imageUri ?? null });
  assert.equal(sources.length, 1, 'kafel dostaje źródło obrazu (bez wpisu byłoby 0 = zaślepka)');
  assert.match(sources[0], /^https:\/\/cards\.scryfall\.io\//);
});
