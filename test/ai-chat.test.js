import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiChat } from '../src/table/ai-chat.js';

test('AI-R7 chat: ten sam numer tury = jeden wpis (materiał nadpisany)', () => {
  const chat = createAiChat();
  chat.recordTurn(1, 'materiał-A');
  chat.recordTurn(1, 'materiał-B');
  assert.deepEqual(chat.snapshot(), [{ turn: 1, user: 'materiał-B', assistant: '' }]);
});

test('AI-R7 chat: retry nadpisuje odpowiedź TEJ SAMEJ tury', () => {
  const chat = createAiChat();
  chat.recordTurn(2, 'tura-2');
  chat.recordReply(2, 'ODP-stara');
  chat.recordReply(2, 'ODP-nowa');
  assert.deepEqual(chat.snapshot(), [{ turn: 2, user: 'tura-2', assistant: 'ODP-nowa' }]);
});

test('AI-R7 chat: repliesBefore — tylko wcześniejsze, tylko niepuste', () => {
  const chat = createAiChat();
  chat.recordTurn(1, 't1');
  chat.recordReply(1, 'ODP-1');
  chat.recordTurn(2, 't2'); // błąd — brak odpowiedzi
  chat.recordTurn(3, 't3');
  chat.recordReply(3, 'ODP-3');
  assert.deepEqual(chat.repliesBefore(3), { 1: 'ODP-1' }); // bez bieżącej i bez pustej
  assert.deepEqual(chat.repliesBefore(2), { 1: 'ODP-1' }); // retry tury 2: tylko przeszłość
  assert.deepEqual(chat.repliesBefore(1), {});
});

test('AI-R7 chat: pusta odpowiedź nie wchodzi do historii', () => {
  const chat = createAiChat();
  chat.recordTurn(1, 't1');
  chat.recordReply(1, '   ');
  chat.recordReply(2, '');
  assert.deepEqual(chat.snapshot(), [{ turn: 1, user: 't1', assistant: '' }]);
  assert.deepEqual(chat.repliesBefore(9), {});
});

test('AI-R7 chat: reset czyści wszystko, snapshot to kopia', () => {
  const chat = createAiChat();
  chat.recordTurn(1, 't1');
  chat.recordReply(1, 'ODP-1');
  const snap = chat.snapshot();
  snap[0].assistant = 'ZHACKOWANE';
  assert.equal(chat.snapshot()[0].assistant, 'ODP-1');
  chat.reset();
  assert.deepEqual(chat.snapshot(), []);
  assert.deepEqual(chat.repliesBefore(9), {});
});
