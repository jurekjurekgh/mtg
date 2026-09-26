import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_MODELS, AI_MODES, AI_STORAGE_KEY, aiAllModels, aiDefaultConfig,
  aiKeyStatus, aiModelLabel, loadAiConfig, saveAiConfig,
} from '../src/table/ai-config.js';

const memStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
};

test('AI-E1 config: 15 predefiniowanych modeli, bez duplikatów', () => {
  assert.equal(AI_MODELS.length, 15);
  assert.equal(new Set(AI_MODELS).size, 15);
  assert.equal(AI_MODELS[0], 'stealth/space-bunny-alpha');
});

test('AI-E1 config: etykieta = po slasha, bez sufiksu', () => {
  assert.equal(aiModelLabel('google/gemini-3.5-flash:floor'), 'gemini-3.5-flash');
  assert.equal(aiModelLabel('stealth/space-bunny-alpha'), 'space-bunny-alpha');
  assert.equal(aiModelLabel('nvidia/nemotron-3-ultra-550b-a55b:free'), 'nemotron-3-ultra-550b-a55b');
});

test('AI-E1 config: all = predefiniowane + lokalne, dedupe', () => {
  const all = aiAllModels(['x/y:free', 'google/gemini-3.5-flash:floor', '  ', 'x/y:free']);
  assert.equal(all.length, 16);
  assert.ok(all.includes('x/y:free'));
  assert.equal(all.filter((m) => m === 'google/gemini-3.5-flash:floor').length, 1);
});

test('AI-E1 config: tryb domyślny = lore-bot', () => {
  assert.equal(aiDefaultConfig().mode, 'lore-bot');
  assert.equal(AI_MODES[0].sheetName, 'lore-bot');
});

test('AI-E1 config: roundtrip load/save, default modelu = ostatni', () => {
  const storage = memStorage();
  assert.equal(loadAiConfig(storage).modelId, AI_MODELS[0]);
  const cfg = { ...aiDefaultConfig(), apiKey: 'sk-or-v1-x', modelId: AI_MODELS[5], customModels: ['x/y:free'], appScriptUrl: 'https://exec' };
  assert.equal(saveAiConfig(storage, cfg), true);
  assert.deepEqual(loadAiConfig(storage), cfg);
  assert.ok(storage.getItem(AI_STORAGE_KEY).includes('sk-or-v1-x'));
});

test('AI-E1 config: uszkodzona pamięć / zły model / zły tryb = domyślne', () => {
  assert.equal(loadAiConfig(memStorage({ [AI_STORAGE_KEY]: 'nie-json' })).modelId, AI_MODELS[0]);
  assert.equal(loadAiConfig(null).modelId, AI_MODELS[0]);
  const bad = memStorage({ [AI_STORAGE_KEY]: JSON.stringify({ modelId: 'nie/ma:free', mode: 'nie-ma', customModels: 'xx' }) });
  const loaded = loadAiConfig(bad);
  assert.equal(loaded.modelId, AI_MODELS[0]);
  assert.equal(loaded.mode, 'lore-bot');
  assert.deepEqual(loaded.customModels, []);
});

test('AI-E1 config: status klucza (missing/suspicious/ok)', () => {
  assert.equal(aiKeyStatus(''), 'missing');
  assert.equal(aiKeyStatus('   '), 'missing');
  assert.equal(aiKeyStatus('sk-abc'), 'suspicious');
  assert.equal(aiKeyStatus('sk-or-v1-xyz'), 'ok');
});
