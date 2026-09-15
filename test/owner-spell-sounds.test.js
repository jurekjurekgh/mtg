import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SOUND_KEYS, soundKeyForTypes, createSpellSoundPlayer, playCastSound,
} from '../src/table/spell-sounds.js';
import {
  PREFS_KEY, DEFAULT_PREFS, TOGGLE_ICONS, loadPrefs, createTopbarToggles,
} from '../src/table/topbar-toggles.js';

/**
 * 15f (zlecenie właściciela): dźwięki czarów + ikonki toggle w belce.
 * Dźwięk gra w chwili pokazania warstwy wysoko-graficznej (albo w chwili
 * rzutu, gdy warstwy nie będzie), INNY dla każdego typu czaru. Dźwięki
 * domyślnie OFF, hi-gfx domyślnie ON. Synteza Web Audio (zero plików wav)
 * z wstrzykiwanym kontekstem — tu fake, w przeglądarce prawdziwy.
 */

// ---------- Fake AudioContext (minimalny interfejs gracza) ----------

function fakeParam(log, label) {
  return {
    _param: label,
    _owner: null,
    value: 0,
    setValueAtTime(v, t) { this.value = v; log.push([label, 'set', v, t, this._owner]); },
    linearRampToValueAtTime(v, t) { log.push([label, 'lin', v, t, this._owner]); },
    exponentialRampToValueAtTime(v, t) { log.push([label, 'exp', v, t, this._owner]); },
    setTargetAtTime(v, t, tc) { log.push([label, 'tgt', v, t, tc, this._owner]); },
  };
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx; this.kind = kind; this.log = ctx.log;
    this.startedAt = null; this.stoppedAt = null; this.connectedTo = [];
    if (kind === 'osc') { this.type = 'sine'; this.frequency = fakeParam(ctx.log, 'freq'); this.detune = fakeParam(ctx.log, 'detune'); }
    if (kind === 'gain') { this.gain = fakeParam(ctx.log, 'gain'); }
    if (kind === 'filter') { this.type = 'lowpass'; this.frequency = fakeParam(ctx.log, 'ffreq'); this.Q = fakeParam(ctx.log, 'fq'); }
    if (kind === 'source') { this.buffer = null; this.loop = false; }
    for (const prm of [this.frequency, this.detune, this.gain, this.Q]) {
      if (prm) prm._owner = this;
    }
  }

  connect(dest) { this.connectedTo.push(dest?._param ?? dest?.kind ?? '?'); return dest; }

  start(t) { this.startedAt = t ?? 0; }

  stop(t) { this.stoppedAt = t ?? 0; }
}

class FakeAudioContext {
  constructor() {
    this.log = []; this.nodes = []; this.state = 'running';
    this.currentTime = 100; this.destination = { kind: 'destination' }; this.resumed = 0;
  }

  createOscillator() { const n = new FakeNode(this, 'osc'); this.nodes.push(n); return n; }

  createGain() { const n = new FakeNode(this, 'gain'); this.nodes.push(n); return n; }

  createBiquadFilter() { const n = new FakeNode(this, 'filter'); this.nodes.push(n); return n; }

  createBuffer() { return { _buffer: true }; }

  createBufferSource() { const n = new FakeNode(this, 'source'); this.nodes.push(n); return n; }

  resume() { this.resumed += 1; this.state = 'running'; return Promise.resolve(); }
}

// ---------- Mini-DOM dla przełączników ----------

class MiniEl {
  constructor(tag, id = '') {
    this.tagName = tag; this.id = id; this.children = []; this.listeners = {};
    this.attrs = {}; this._html = '';
  }

  set innerHTML(v) { this._html = String(v); this.children = []; }

  get innerHTML() { return this._html; }

  setAttribute(k, v) { this.attrs[k] = String(v); }

  getAttribute(k) { return this.attrs[k] ?? null; }

  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }

  click() { for (const fn of this.listeners.click ?? []) fn({}); }
}

const memStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); },
  };
};

// ---------- Mapowanie typ → dźwięk ----------

test('mapowanie: główne typy po angielsku (dane rejestru)', () => {
  assert.equal(soundKeyForTypes(['Instant']), 'instant');
  assert.equal(soundKeyForTypes(['Sorcery']), 'sorcery');
  assert.equal(soundKeyForTypes(['Creature']), 'creature');
  assert.equal(soundKeyForTypes(['Enchantment']), 'enchantment');
  assert.equal(soundKeyForTypes(['Artifact']), 'artifact');
  assert.equal(soundKeyForTypes(['Land']), 'land');
  assert.equal(soundKeyForTypes(['Basic', 'Land']), 'land');
});

test('mapowanie: gołe podtypy artefaktu/zaklęcia/lądu → rodzina', () => {
  assert.equal(soundKeyForTypes(['Equipment']), 'artifact');
  assert.equal(soundKeyForTypes(['Treasure']), 'artifact');
  assert.equal(soundKeyForTypes(['Aura']), 'enchantment');
  assert.equal(soundKeyForTypes(['Saga']), 'enchantment');
  assert.equal(soundKeyForTypes(['Swamp']), 'land');
  assert.equal(soundKeyForTypes(['Gate']), 'land');
});

test('mapowanie: gołe podtypy stwora (bez „Creature") → creature', () => {
  assert.equal(soundKeyForTypes(['Angel']), 'creature');
  assert.equal(soundKeyForTypes(['Zombie']), 'creature');
  assert.equal(soundKeyForTypes(['Human', 'Soldier']), 'creature');
});

test('mapowanie: priorytet wielotypów Instant > Sorcery > Creature > Enchantment > Artifact > Land', () => {
  assert.equal(soundKeyForTypes(['Artifact', 'Creature']), 'creature');
  assert.equal(soundKeyForTypes(['Enchantment', 'Creature']), 'creature');
  assert.equal(soundKeyForTypes(['Artifact', 'Land']), 'artifact');
  assert.equal(soundKeyForTypes(['Land', 'Creature']), 'creature'); // np. Dryad Arbor
});

test('mapowanie: puste/nieznane/token bez typów → default', () => {
  assert.equal(soundKeyForTypes([]), 'default');
  assert.equal(soundKeyForTypes(undefined), 'default');
  assert.equal(soundKeyForTypes(['Token']), 'default');
});

test('mapowanie: każdy klucz ma recepturę (kompletność)', () => {
  const probe = createSpellSoundPlayer({ createContext: () => new FakeAudioContext() });
  probe.setEnabled(true);
  for (const key of SOUND_KEYS) {
    const ctx = new FakeAudioContext();
    const p = createSpellSoundPlayer({ createContext: () => ctx });
    p.setEnabled(true);
    assert.equal(p.play(key), 'played', `klucz ${key} ma grać`);
    assert.ok(ctx.nodes.length > 0, `klucz ${key} tworzy węzły`);
  }
});

// ---------- Odtwarzacz: kształty brzmień ----------

const featuresOf = (ctx) => {
  const oscs = ctx.nodes.filter((n) => n.kind === 'osc');
  const freqs = oscs.map((o) => o.frequency.value);
  const isFmDepth = (owner) => owner?.connectedTo?.includes('freq') ?? false;
  const gainVals = ctx.log.filter(([l, , , , owner]) => l === 'gain' && !isFmDepth(owner)).map(([, , v]) => v);
  const peakTimes = ctx.log.filter(([l]) => l === 'gain').map(([, , , t]) => t);
  const fm = ctx.nodes.some((n) => n.connectedTo.includes('freq'));
  const stops = ctx.nodes.map((n) => n.stoppedAt).filter((t) => t != null);
  return {
    oscs: oscs.length,
    filters: ctx.nodes.filter((n) => n.kind === 'filter').length,
    sources: ctx.nodes.filter((n) => n.kind === 'source').length,
    minFreq: Math.min(...freqs), maxFreq: Math.max(...freqs),
    maxGain: Math.max(0, ...gainVals), maxPeakTime: Math.max(0, ...peakTimes),
    fm, maxStop: Math.max(0, ...stops),
  };
};

test('brzmienia: 7 kluczy = 7 różnych sygnatur (wymóg właściciela)', () => {
  const sigs = new Set();
  for (const key of SOUND_KEYS) {
    const ctx = new FakeAudioContext();
    const p = createSpellSoundPlayer({ createContext: () => ctx });
    p.setEnabled(true);
    p.play(key);
    sigs.add(JSON.stringify(featuresOf(ctx)));
  }
  assert.equal(sigs.size, SOUND_KEYS.length, 'każdy typ brzmi inaczej');
});

test('brzmienia: instant jasny i krótki, sorcery głębokie i wolne', () => {
  const play = (key) => {
    const ctx = new FakeAudioContext();
    const p = createSpellSoundPlayer({ createContext: () => ctx });
    p.setEnabled(true); p.play(key);
    return featuresOf(ctx);
  };
  const ins = play('instant');
  const sor = play('sorcery');
  assert.ok(ins.maxFreq >= 1200, `instant jasny (max ${ins.maxFreq})`);
  assert.ok(ins.maxStop <= 100 + 1.2, `instant krótki (${ins.maxStop})`);
  assert.ok(sor.minFreq <= 150, `sorcery głębokie (min ${sor.minFreq})`);
  assert.ok(sor.maxPeakTime >= 100 + 0.4, 'sorcery z wolnym atakiem');
});

test('brzmienia: creature akordem (≥2 osc), artifact metaliczny (FM)', () => {
  const play = (key) => {
    const ctx = new FakeAudioContext();
    const p = createSpellSoundPlayer({ createContext: () => ctx });
    p.setEnabled(true); p.play(key);
    return featuresOf(ctx);
  };
  assert.ok(play('creature').oscs >= 2, 'summon to akord, nie pisk');
  assert.ok(play('artifact').fm, 'artefakt moduluje częstotliwość (metal)');
});

test('brzmienia: land niski, enchantment eteryczny (wolny atak + shimmer)', () => {
  const play = (key) => {
    const ctx = new FakeAudioContext();
    const p = createSpellSoundPlayer({ createContext: () => ctx });
    p.setEnabled(true); p.play(key);
    return featuresOf(ctx);
  };
  assert.ok(play('land').minFreq <= 120, 'ląd to pomruk, nie dzwonek');
  const ench = play('enchantment');
  assert.ok(ench.maxPeakTime >= 100 + 0.5 && ench.maxFreq >= 2000, 'zaklęcie: wolny atak + shimmer');
});

test('odtwarzacz: OFF = zero węzłów; nieznany klucz i brak audio to no-op', () => {
  const ctx = new FakeAudioContext();
  const p = createSpellSoundPlayer({ createContext: () => ctx });
  assert.equal(p.play('instant'), 'disabled');
  assert.equal(ctx.nodes.length, 0);
  p.setEnabled(true);
  assert.equal(p.play('nie-ma-takiego'), 'unknown-key');
  assert.equal(ctx.nodes.length, 0);
  const mute = createSpellSoundPlayer({ createContext: () => null });
  mute.setEnabled(true);
  assert.equal(mute.play('instant'), 'no-audio');
});

test('odtwarzacz: zawieszony kontekst wznawiany przy grze; głośność i czas w ryzach', () => {
  const ctx = new FakeAudioContext();
  ctx.state = 'suspended';
  const p = createSpellSoundPlayer({ createContext: () => ctx });
  p.setEnabled(true);
  assert.equal(p.play('sorcery'), 'played');
  assert.equal(ctx.resumed, 1, 'resume na granicy odtwarzania (autoplay)');
  for (const key of SOUND_KEYS) {
    const c2 = new FakeAudioContext();
    const p2 = createSpellSoundPlayer({ createContext: () => c2 });
    p2.setEnabled(true); p2.play(key);
    const f = featuresOf(c2);
    assert.ok(f.maxGain <= 0.5, `${key}: nastrojowo, nie ogłuszająco (${f.maxGain})`);
    assert.ok(f.maxStop <= 100 + 2.5, `${key}: ≤2,5 s (${f.maxStop})`);
  }
});

test('playCastSound: karta → klucz z typów; brak karty = no-op', () => {
  const calls = [];
  const stub = { play: (k) => { calls.push(k); return 'played'; } };
  assert.equal(playCastSound({ player: stub, card: { types: ['Sorcery'] } }), 'played');
  assert.deepEqual(calls, ['sorcery']);
  assert.equal(playCastSound({ player: stub, card: null }), 'no-card');
  assert.equal(calls.length, 1);
});

// ---------- Przełączniki belki ----------

const docWithButtons = () => {
  const sound = new MiniEl('button', 'sound-toggle');
  const hiGfx = new MiniEl('button', 'hi-gfx');
  const byId = { 'sound-toggle': sound, 'hi-gfx': hiGfx };
  return { document: { getElementById: (id) => byId[id] ?? null }, sound, hiGfx };
};

test('toggles: domyślnie dźwięki OFF, hi-gfx ON (wymóg właściciela)', () => {
  assert.deepEqual(DEFAULT_PREFS, { sounds: false, hiGfx: true });
  const { document } = docWithButtons();
  const t = createTopbarToggles({ document, storage: memStorage() });
  assert.equal(t.soundsOn(), false);
  assert.equal(t.hiGfxOn(), true);
});

test('toggles: klik odwraca stan, aria-pressed i ikonka jadą razem', () => {
  const { document, sound } = docWithButtons();
  const t = createTopbarToggles({ document, storage: memStorage() });
  assert.equal(sound.getAttribute('aria-pressed'), 'false');
  assert.equal(sound.innerHTML, TOGGLE_ICONS.sounds.off);
  sound.click();
  assert.equal(t.soundsOn(), true);
  assert.equal(sound.getAttribute('aria-pressed'), 'true');
  assert.equal(sound.innerHTML, TOGGLE_ICONS.sounds.on);
});

test('toggles: preferencje zapisane i odczytane (pusta/uszkodzona pamięć = domyślne)', () => {
  const storage = memStorage();
  const d1 = docWithButtons();
  createTopbarToggles({ document: d1.document, storage });
  d1.sound.click();
  assert.ok(storage.getItem(PREFS_KEY).includes('"sounds":true'));
  const d2 = docWithButtons();
  const t2 = createTopbarToggles({ document: d2.document, storage });
  assert.equal(t2.soundsOn(), true, 'wybór gracza przetrwał');
  assert.deepEqual(loadPrefs(null), DEFAULT_PREFS);
  assert.deepEqual(loadPrefs({ getItem: () => '{ups' }), DEFAULT_PREFS);
});

test('toggles: callbacki zmian (strona podpina resume audio)', () => {
  const { document, hiGfx } = docWithButtons();
  const seen = [];
  createTopbarToggles({
    document, storage: memStorage(),
    onSoundsChange: (v) => seen.push(['sounds', v]),
    onHiGfxChange: (v) => seen.push(['hiGfx', v]),
  });
  hiGfx.click();
  assert.deepEqual(seen, [['hiGfx', false]]);
});

test('toggles: brak przycisku w DOM = czytelny błąd, nie krach w wiring', () => {
  assert.throws(() => createTopbarToggles({
    document: { getElementById: () => null }, storage: memStorage(),
  }), /sound-toggle/);
});

// ---------- Pin-y integracji (plik HTML + wiring main.js) ----------

test('pin: belka ma OBA przyciski-toggle z ikonami SVG (te same ciągi co moduł)', () => {
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  for (const id of ['sound-toggle', 'hi-gfx']) {
    assert.match(html, new RegExp(`<button[^>]*id="${id}"[^>]*aria-pressed=`), `${id} to button z aria-pressed`);
  }
  assert.ok(!html.includes('type="checkbox" id="hi-gfx"'), 'ptaszek hi-gfx zniknął');
  // Statyczny HTML niesie ikony STANU DOMYŚLNEGO (te same ciągi co moduł —
  // anty-dryf); JS przemalowuje z pamięci przy starcie strony.
  const btnInner = (id) => {
    const m = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>([\\s\\S]*?)</button>`));
    assert.ok(m, `przycisk ${id} istnieje`);
    return m[1];
  };
  assert.ok(btnInner('sound-toggle').includes(TOGGLE_ICONS.sounds.off), 'dźwięki startują zgaszone');
  assert.ok(btnInner('hi-gfx').includes(TOGGLE_ICONS.hiGfx.on), 'hi-gfx startuje zapalone');
});

test('pin: main.js podpina moduły dźwięku i nie czyta już ptaszka', () => {
  const main = fs.readFileSync('src/table/main.js', 'utf8');
  assert.ok(main.includes("from './spell-sounds.js'"), 'import odtwarzacza');
  assert.ok(main.includes("from './topbar-toggles.js'"), 'import przełączników');
  assert.ok(!main.includes('hiGfxToggle?.checked'), 'koniec ery checkboxa');
});
