/**
 * 15f (zlecenie właściciela) — nastrojowe dźwięki czarów, INNE dla każdego
 * typu (summon/instant/sorcery/enchantment/artifact/land + default).
 *
 * Synteza Web Audio (oscylatory + filtrowany szum + obwiednie), zero plików
 * dźwiękowych w repo. Moduł CZYSTY — bez DOM-u: kontekst audio dostaje
 * wstrzyknięty fabryką `createContext` (przeglądarka: leniwy AudioContext,
 * testy: fake). Używamy wyłącznie minimalnego interfejsu: createOscillator /
 * createGain / createBiquadFilter / createBuffer / createBufferSource,
 * currentTime, destination, state, resume().
 *
 * Głośność: każdy przepis szczytuje ≤0,35 (nastrojowo, nie ogłuszająco),
 * czas ≤2,1 s. Strukturę trzyma tabela RECIPES za fasadą `play(key)` —
 * gdyby właściciel zapragnął wavów, podmiana to jedna funkcja na klucz.
 *
 * 15g/A: warstwa koloru. `play('sorcery:R')` gra bazę typu + nastrojową
 * warstwę koloru (ogień/woda/mrok/chime/wzrost + bezbarwny/multi).
 * Kompozycja, nie macierz receptur: 7 baz + 7 warstw = 49 brzmień.
 */

/** Rodziny typów (słowa z `card.types` rejestru) → klucz brzmienia. */
const ARTIFACT_SUBTYPES = new Set([
  'Equipment', 'Vehicle', 'Spacecraft', 'Clue', 'Food', 'Treasure',
  'Powerstone', 'Contraption', 'Fortification',
]);
const ENCHANTMENT_SUBTYPES = new Set([
  'Aura', 'Saga', 'Curse', 'Shrine', 'Cartouche', 'Rune',
]);
const LAND_SUBTYPES = new Set([
  'Basic', 'Forest', 'Island', 'Mountain', 'Plains', 'Swamp', 'Gate', 'Town',
  'Desert', 'Locus', 'Mine', 'Power-Plant', 'Tower', 'Urza’s', 'Urza',
  'Sphere', 'Cloud', 'Layer',
]);
/** Znaczniki nie-typowe (nie świadczą o rodzinie). */
const NON_TYPES = new Set(['Token', 'Legendary', 'Snow', 'Ongoing']);

/**
 * Klucz brzmienia dla tablicy `types` karty. Priorytet wielotypów:
 * Instant > Sorcery > Creature > Enchantment > Artifact > Land.
 * Gołe podtypy stwora (Angel, Zombie — rejestr pomija wtedy słowo
 * 'Creature') wpadają do 'creature'; puste/znacznikowe → 'default'.
 */
export function soundKeyForTypes(types) {
  const words = new Set(Array.isArray(types) ? types : []);
  if (words.has('Instant')) return 'instant';
  if (words.has('Sorcery')) return 'sorcery';
  if (words.has('Creature')) return 'creature';
  if (words.has('Enchantment') || [...words].some((w) => ENCHANTMENT_SUBTYPES.has(w))) {
    return 'enchantment';
  }
  if (words.has('Artifact') || [...words].some((w) => ARTIFACT_SUBTYPES.has(w))) {
    return 'artifact';
  }
  if (words.has('Land') || [...words].some((w) => LAND_SUBTYPES.has(w))) return 'land';
  const meaningful = [...words].some((w) => !NON_TYPES.has(w));
  return meaningful ? 'creature' : 'default';
}

/**
 * 15g/A: klucz koloru karty. Dokładnie jeden kolor → on; dwa lub więcej →
 * 'multi'; brak (landy, artefakty, czary bezbarwne) → 'colorless'.
 * Basic landy zostają neutralne (puste `colors`; tożsamość z many to
 * osobny temat, nie ten tor).
 */
export function colorKeyForCard(card) {
  const declared = Array.isArray(card?.colors) ? card.colors.filter((c) => 'WUBRG'.includes(c)) : [];
  if (declared.length === 1) return declared[0];
  if (declared.length > 1) return 'multi';
  return 'colorless';
}

/** Pełny klucz brzmienia: typ + kolor (`sorcery:R`, `land:colorless`). */
export function soundKeyForCard(card) {
  return `${soundKeyForTypes(card?.types)}:${colorKeyForCard(card)}`;
}

/** Pojedynczy ton z obwiednią atak→wybrzmienie (do `dest`, zwykle głośnik). */
function tone(ctx, dest, {
  type = 'sine', freq = 440, freqEnd = null, at = 0,
  attack = 0.1, peak = 0.2, dur = 1.0, detune = 0,
} = {}) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  if (detune) osc.detune.setValueAtTime(detune, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  return osc;
}

/** Porcja szumu przez filtr (oddech, świst, pomruk w tle tonów). */
function noise(ctx, dest, buffer, {
  at = 0, attack = 0.2, peak = 0.12, dur = 1.2,
  filterType = 'lowpass', filterFreq = 800, filterFreqEnd = null, q = 0.7,
} = {}) {
  const t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFreq, t0);
  if (filterFreqEnd != null) filter.frequency.exponentialRampToValueAtTime(filterFreqEnd, t0 + dur);
  filter.Q.setValueAtTime(q, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/** 7 receptur: (ctx, dest, noiseBuffer) → gra. */
const RECIPES = {
  /** Błyskawica: ostry zjazd + shimmer + trzask. Krótko (<0,8 s). */
  instant(ctx, dest, buf) {
    tone(ctx, dest, { type: 'sawtooth', freq: 1800, freqEnd: 220, attack: 0.01, peak: 0.2, dur: 0.5 });
    tone(ctx, dest, { type: 'sine', freq: 2500, attack: 0.02, peak: 0.09, dur: 0.7 });
    noise(ctx, dest, buf, { attack: 0.01, peak: 0.11, dur: 0.25, filterType: 'highpass', filterFreq: 3000 });
  },
  /** Głęboki huk + wolny pomruk. Atak do 0,5 s. */
  sorcery(ctx, dest, buf) {
    tone(ctx, dest, { type: 'sine', freq: 110, freqEnd: 36, attack: 0.05, peak: 0.32, dur: 1.6 });
    tone(ctx, dest, { type: 'triangle', freq: 220, attack: 0.5, peak: 0.13, dur: 1.8 });
    noise(ctx, dest, buf, { attack: 0.4, peak: 0.11, dur: 1.8, filterFreq: 300 });
  },
  /** Summon: ciepły akord (3 osc) + oddech. */
  creature(ctx, dest, buf) {
    for (const freq of [110, 164.8, 220]) {
      tone(ctx, dest, { type: 'triangle', freq, attack: 0.3, peak: 0.15, dur: 1.6 });
    }
    noise(ctx, dest, buf, { attack: 0.35, peak: 0.07, dur: 1.7, filterType: 'bandpass', filterFreq: 600 });
  },
  /** Eteryczna poduszka: wolny atak + wysoki shimmer. */
  enchantment(ctx, dest) {
    tone(ctx, dest, { type: 'sine', freq: 440, attack: 0.6, peak: 0.11, dur: 2.0 });
    tone(ctx, dest, { type: 'sine', freq: 660, attack: 0.6, peak: 0.1, dur: 2.0 });
    tone(ctx, dest, { type: 'sine', freq: 2400, at: 0.2, attack: 0.8, peak: 0.045, dur: 1.8 });
  },
  /** Metal: FM (modulator w częstotliwość nośnej) + ping. */
  artifact(ctx, dest) {
    const t0 = ctx.currentTime;
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(620, t0);
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(930, t0);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(300, t0);
    mod.connect(depth);
    depth.connect(carrier.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
    carrier.connect(g);
    g.connect(dest);
    carrier.start(t0);
    carrier.stop(t0 + 1.25);
    mod.start(t0);
    mod.stop(t0 + 1.25);
    tone(ctx, dest, { type: 'sine', freq: 1860, at: 0.15, attack: 0.01, peak: 0.06, dur: 0.5 });
  },
  /** Pomruk ziemi + powietrze. Najniższy dźwięk zestawu. */
  land(ctx, dest, buf) {
    tone(ctx, dest, { type: 'sine', freq: 65, freqEnd: 38, attack: 0.02, peak: 0.3, dur: 0.7 });
    noise(ctx, dest, buf, { attack: 0.15, peak: 0.09, dur: 1.4, filterFreq: 500 });
  },
  /** Delikatny dzwonek na karty bez rodziny (puste typy, tokeny). */
  default(ctx, dest) {
    tone(ctx, dest, { type: 'sine', freq: 520, attack: 0.08, peak: 0.11, dur: 0.9 });
  },
};

export const SOUND_KEYS = Object.keys(RECIPES);

/**
 * 15g/A: 7 warstw koloru — ciche (szczyt ≤0,15) dodatki do bazy typu.
 * W: promienny chime; U: płynąca woda + krople; B: mroczny pomruk
 * (dudnienie półtonu); R: trzask ognia + ryk; G: rosnący pomruk ziemi;
 * colorless: puste metaliczne bicie; multi: migotliwe arpeggio.
 */
const COLOR_LAYERS = {
  W(ctx, dest) {
    tone(ctx, dest, { type: 'sine', freq: 1568, attack: 0.05, peak: 0.09, dur: 1.2 });
    tone(ctx, dest, { type: 'sine', freq: 2093, at: 0.1, attack: 0.05, peak: 0.06, dur: 1.0 });
  },
  U(ctx, dest, buf) {
    noise(ctx, dest, buf, { attack: 0.3, peak: 0.1, dur: 1.4, filterFreq: 400, filterFreqEnd: 2200 });
    tone(ctx, dest, { type: 'sine', freq: 1200, freqEnd: 2400, at: 0.2, attack: 0.01, peak: 0.07, dur: 0.3 });
    tone(ctx, dest, { type: 'sine', freq: 900, freqEnd: 1800, at: 0.5, attack: 0.01, peak: 0.06, dur: 0.3 });
  },
  B(ctx, dest) {
    tone(ctx, dest, { type: 'sine', freq: 55, attack: 0.4, peak: 0.14, dur: 1.8 });
    tone(ctx, dest, { type: 'sine', freq: 58.3, attack: 0.4, peak: 0.1, dur: 1.8 });
  },
  R(ctx, dest, buf) {
    for (const at of [0, 0.18, 0.36, 0.55]) {
      noise(ctx, dest, buf, { at, attack: 0.01, peak: 0.1, dur: 0.08, filterType: 'bandpass', filterFreq: 2000, q: 1.5 });
    }
    tone(ctx, dest, { type: 'sine', freq: 90, attack: 0.1, peak: 0.12, dur: 0.9 });
  },
  G(ctx, dest, buf) {
    tone(ctx, dest, { type: 'triangle', freq: 130, freqEnd: 260, attack: 0.5, peak: 0.12, dur: 1.6 });
    noise(ctx, dest, buf, { attack: 0.4, peak: 0.08, dur: 1.6, filterFreq: 400 });
  },
  colorless(ctx, dest) {
    tone(ctx, dest, { type: 'sine', freq: 440, attack: 0.1, peak: 0.08, dur: 1.2 });
    tone(ctx, dest, { type: 'sine', freq: 466, attack: 0.1, peak: 0.08, dur: 1.2 });
    tone(ctx, dest, { type: 'sine', freq: 3200, at: 0.15, attack: 0.2, peak: 0.035, dur: 1.0 });
  },
  multi(ctx, dest) {
    const notes = [660, 830, 990];
    notes.forEach((freq, i) => {
      tone(ctx, dest, { type: 'sine', freq, at: i * 0.12, attack: 0.02, peak: 0.05, dur: 0.5 });
    });
  },
};

export const COLOR_KEYS = Object.keys(COLOR_LAYERS);

/**
 * Odtwarzacz. `createContext: () => AudioContext|null` — strona podaje
 * leniwy konstruktor (autoplay: kontekst powstaje dopiero na potrzebę,
 * wznawiany na gestach); brak audio (wyjątek/null) = cichy no-op.
 * Wyniki `play`: 'played' | 'disabled' | 'unknown-key' | 'no-audio'.
 */
export function createSpellSoundPlayer({ createContext }) {
  if (typeof createContext !== 'function') {
    throw new TypeError('Odtwarzacz wymaga fabryki createContext');
  }
  let enabled = false;
  let ctx = null;
  let noiseBuffer = null;
  const ensureCtx = () => {
    if (!ctx) {
      try {
        ctx = createContext();
      } catch {
        ctx = null;
      }
    }
    return ctx;
  };
  /** Bufor białego szumu (jeden na kontekst; fake go pomija). */
  const ensureNoise = (c) => {
    if (!noiseBuffer) {
      const rate = c.sampleRate ?? 44100;
      noiseBuffer = c.createBuffer(1, Math.floor(rate * 1.5), rate);
      const data = noiseBuffer.getChannelData?.(0);
      if (data) {
        for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      }
    }
    return noiseBuffer;
  };
  const player = {
    get enabled() { return enabled; },
    setEnabled(v) { enabled = Boolean(v); },
    /** Wznawia zawieszony kontekst (autoplay). `true` = jest na czym grać. */
    resume() {
      const c = ensureCtx();
      if (!c) return false;
      if (c.state === 'suspended' && typeof c.resume === 'function') {
        try {
          c.resume();
        } catch {
          return false;
        }
      }
      return true;
    },
    play(key) {
      if (!enabled) return 'disabled';
      const [base, color] = String(key).split(':');
      const recipe = RECIPES[base];
      if (!recipe) return 'unknown-key';
      const layer = color == null ? null : COLOR_LAYERS[color];
      if (color != null && !layer) return 'unknown-key';
      const c = ensureCtx();
      if (!c) return 'no-audio';
      player.resume();
      const buf = ensureNoise(c);
      recipe(c, c.destination, buf);
      if (layer) layer(c, c.destination, buf);
      return 'played';
    },
  };
  return player;
}

/**
 * Dźwięk rzutu: klucz z typów karty → odtwarzacz (bramka OFF siedzi
 * w `play`). Brak karty (token bez wpisu, null) = 'no-card', no-op.
 */
export function playCastSound({ player, card }) {
  if (!card) return 'no-card';
  return player.play(soundKeyForCard(card));
}
