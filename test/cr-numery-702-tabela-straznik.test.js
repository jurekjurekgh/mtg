// Strażnik tabelaryczny numerów CR 702.x (audyt PR #134 → PR #135, 2026-09-24).
//
// Dlaczego osobny plik, a nie kolejna para w `cr-numery-mechanik-straznik.test.js`:
// tamte pary są LINIOWE — świecą, gdy słowo mechaniki i zły numer siedzą NA TEJ
// SAMEJ linii. Audyt PR #135 pokazał, że rozjazdy tej samej klasy siedzą zwykle
// o linię OBOK nazwy mechaniki i para ich nie łapie:
//   • fabricate cytowany jako 702.122a (= CREW) — słowo „fabricate” linię wyżej
//     (src/engine/effects.js, src/engine/game-state.js, test/e6-nazwy-tokenow…),
//   • flashback cytowany jako 702.33a (= KICKER) — src/table/render.js ×2,
//   • vigilance cytowane jako 702.21 (= WARD) — heuristic-bot.js ×2 + test M221/D,
//   • infect cytowany jako 702.89b (= UMBRA ARMOR), plot jako 702.168a
//     (= DISGUISE), endure jako 702.174 (= GIFT), equipment jako 702.16
//     (= PROTECTION), outlast jako 702.100 (= EVOLVE).
// Razem 100+ rozjazdów tej klasy w dwóch falach (F-6) i 9 kolejnych (F-7).
//
// Ten detektor odwraca kierunek: dla KAŻDEGO cytatu `702.<n>` w `src/` i `test/`
// sprawdza, czy w oknie ±8 linii pada nazwa mechaniki, którą `702.<n>` oznacza
// w BIEŻĄCYM wydaniu Comprehensive Rules. Numer bez nazwy w pobliżu to albo
// rozjazd, albo cytat, który trzeba podpisać nazwą mechaniki.
//
// Źródło tabeli (ADR 0030 — pamięć nie jest źródłem): dosłowny spis sekcji
// „702. Keyword Abilities” z Comprehensive Rules (September 25, 2026 —
// Reality Fracture), pobrany 2026-09-24 z `mtg.wiki/page/Keyword_ability`
// (chunki 0–2 sekcji Rules). Numery 702.x rosną historycznie, nie alfabetycznie,
// więc każda luka w tabeli jest świadoma (sekcja o tym numerze nie istnieje).
//
// Gdy detektor świeci, są trzy uczciwe wyjścia (w tej kolejności):
//   1. popraw numer na ten z tabeli (najczęstszy przypadek — rozjazd),
//   2. dopisz nazwę mechaniki obok cytatu (komentarz był niekompletny),
//   3. dopisz wzorzec do `WYJATKI_702` Z POWODEM (cytat ogólny/lista sekcji/
//      odniesienie negatywne) — nigdy nie kasuj assertion.
//
// Zakres: `src/**` i `test/**` (pliki .js/.mjs/.html). `docs/` NIE jest skanowany
// — plany, handoffy i archiwalne audyty cytują numery z epoki (ADR 0016);
// mapowanie dla nich jest w `docs/audits/AUDYT_PR134_2026-09-24.md` §4/F-3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Pliki, które celowo cytują numery błędne/przestarzałe, żeby je opisać. */
const POMIN = new Set([
  // Tabela istnienia numerów (C3 audytu PR #135): DANE — lista numerów bez
  // nazw mechanik, więc okno ±8 nie ma czego dopasować. Numer trafia tam
  // tylko po weryfikacji wobec dosłownego CR (tools/cr-numery.mjs).
  'test/helpers/cr-numery-tabela.js',
  // Strażnik istnienia: próba detektora i asercja na fixture 702.404.
  'test/cr-numery-istnienie-straznik.test.js',
  'test/cr-numery-702-tabela-straznik.test.js',
  'test/cr-numery-mechanik-straznik.test.js',
  'test/audyt-pr134-2026-09-24-cytaty-cr.test.js',
]);

/** 702.<n> → nazwa mechaniki, CR 2026-09-25 (Reality Fracture). */
const TABELA_702 = {
  2: 'Deathtouch', 3: 'Defender', 4: 'Double Strike', 5: 'Enchant', 6: 'Equip',
  7: 'First Strike', 8: 'Flash', 9: 'Flying', 10: 'Haste', 11: 'Hexproof',
  12: 'Indestructible', 13: 'Intimidate', 14: 'Landwalk', 15: 'Lifelink',
  16: 'Protection', 17: 'Reach', 18: 'Shroud', 19: 'Trample', 20: 'Vigilance',
  21: 'Ward', 22: 'Banding', 23: 'Rampage', 24: 'Cumulative Upkeep', 25: 'Flanking',
  26: 'Phasing', 27: 'Buyback', 28: 'Shadow', 29: 'Cycling', 30: 'Echo',
  31: 'Horsemanship', 32: 'Fading', 33: 'Kicker', 34: 'Flashback', 35: 'Madness',
  36: 'Fear', 37: 'Morph', 38: 'Amplify', 39: 'Provoke', 40: 'Storm', 41: 'Affinity',
  42: 'Entwine', 43: 'Modular', 44: 'Sunburst', 45: 'Bushido', 46: 'Soulshift',
  47: 'Splice', 48: 'Offering', 49: 'Ninjutsu', 50: 'Epic', 51: 'Convoke',
  52: 'Dredge', 53: 'Transmute', 54: 'Bloodthirst', 55: 'Haunt', 56: 'Replicate',
  57: 'Forecast', 58: 'Graft', 59: 'Recover', 60: 'Ripple', 61: 'Split Second',
  62: 'Suspend', 63: 'Vanishing', 64: 'Absorb', 65: 'Aura Swap', 66: 'Delve',
  67: 'Fortify', 68: 'Frenzy', 69: 'Gravestorm', 70: 'Poisonous', 71: 'Transfigure',
  72: 'Champion', 73: 'Changeling', 74: 'Evoke', 75: 'Hideaway', 76: 'Prowl',
  77: 'Reinforce', 78: 'Conspire', 79: 'Persist', 80: 'Wither', 81: 'Retrace',
  82: 'Devour', 83: 'Exalted', 84: 'Unearth', 85: 'Cascade', 86: 'Annihilator',
  87: 'Level Up', 88: 'Rebound', 89: 'Umbra Armor', 90: 'Infect', 91: 'Battle Cry',
  92: 'Living Weapon', 93: 'Undying', 94: 'Miracle', 95: 'Soulbond', 96: 'Overload',
  97: 'Scavenge', 98: 'Unleash', 99: 'Cipher', 100: 'Evolve', 101: 'Extort',
  102: 'Fuse', 103: 'Bestow', 104: 'Tribute', 105: 'Dethrone', 106: 'Hidden Agenda',
  107: 'Outlast', 108: 'Prowess', 109: 'Dash', 110: 'Exploit', 111: 'Menace',
  112: 'Renown', 113: 'Awaken', 114: 'Devoid', 115: 'Ingest', 116: 'Myriad',
  117: 'Surge', 118: 'Skulk', 119: 'Emerge', 120: 'Escalate', 121: 'Melee',
  122: 'Crew', 123: 'Fabricate', 124: 'Partner', 125: 'Undaunted', 126: 'Improvise',
  127: 'Aftermath', 128: 'Embalm', 129: 'Eternalize', 130: 'Afflict', 131: 'Ascend',
  132: 'Assist', 133: 'Jump-Start', 134: 'Mentor', 135: 'Afterlife', 136: 'Riot',
  137: 'Spectacle', 138: 'Escape', 139: 'Companion', 140: 'Mutate', 141: 'Encore',
  142: 'Boast', 143: 'Foretell', 144: 'Demonstrate', 145: 'Daybound and Nightbound',
  146: 'Disturb', 147: 'Decayed', 148: 'Cleave', 149: 'Training', 150: 'Compleated',
  151: 'Reconfigure', 152: 'Blitz', 153: 'Casualty', 154: 'Enlist', 155: 'Read Ahead',
  156: 'Ravenous', 157: 'Squad', 158: 'Space Sculptor', 159: 'Visit', 160: 'Prototype',
  161: 'Living Metal', 162: 'More Than Meets the Eye', 163: 'For Mirrodin!',
  164: 'Toxic', 165: 'Backup', 166: 'Bargain', 167: 'Craft', 168: 'Disguise',
  169: 'Solved', 170: 'Plot', 171: 'Saddle', 172: 'Spree', 173: 'Freerunning',
  174: 'Gift', 175: 'Offspring', 176: 'Impending', 177: 'Exhaust', 178: 'Max Speed',
  179: 'Start Your Engines!', 180: 'Harmonize', 181: 'Mobilize', 182: 'Job Select',
  183: 'Tiered', 184: 'Station', 185: 'Warp', 186: 'Infinity', 187: 'Mayhem',
  188: 'Web-slinging', 189: 'Firebending', 190: 'Sneak', 191: 'Increment',
  192: 'Paradigm', 193: 'Power-up', 194: 'Teamwork', 195: 'Storied',
};

/**
 * Aliasy: polskie nazwy, odmiany i warianty pisowni, po których poznajemy
 * mechanikę w komentarzu (sama nazwa angielska z tabeli nie wystarczy, bo
 * komentarze są po polsku — „chronionego” = protection, „przydziały” = trample).
 */
const ALIASY_702 = {
  2: ['deathtouch', 'śmiertel', 'lethal'],
  3: ['defender'],
  4: ['double[ \\-]?strike', 'podwójn'],
  5: ['enchant', 'zaczarow', 'aura'],
  6: ['equip', 'wyposa', 'ekwip', 'nosici', 'attach', 'sprzęt', 'pojazd'],
  7: ['first[ /\\-]', 'strike', 'krok.? obrażeń', 'przebieg'],
  8: ['flash', 'błysk'],
  9: ['flying', 'latan'],
  10: ['haste', 'pośpiech'],
  11: ['hexproof'],
  12: ['indestruct', 'niezniszcz'],
  13: ['intimidate', 'zastrasz'],
  14: ['walk', 'chodzen', 'ląd', 'bagno', 'wysp', 'las', 'gór'],
  15: ['lifelink', 'więź życia', 'lecz'],
  16: ['protection', 'ochron', 'chronion'],
  17: ['reach', 'zasięg'],
  18: ['shroud'],
  19: ['trample', 'tratow', 'przebija', 'przydzia', 'lethal', 'assignment', 'obrażeń'],
  20: ['vigilance', 'czujno'],
  21: ['ward'],
  27: ['buyback'],
  29: ['cycl'],
  30: ['echo'],
  33: ['kick'],
  34: ['flashback', 'flashedback', 'z grobu'],
  35: ['madness', 'szaleństw'],
  36: ['fear', 'strach'],
  37: ['morph', 'megamorph', 'obrót', 'obrot', 'face.?down', 'zakry', 'twarzą', 'cloak', 'disguise', 'manifest'],
  40: ['storm', 'kopii', 'copies', 'burz'],
  41: ['affinity', 'pokrewieństw'],
  49: ['ninjutsu'],
  54: ['bloodthirst', 'żądza krwi'],
  57: ['forecast', 'prognoz', 'reveal this card'],
  62: ['suspend', 'zawies'],
  66: ['delve', 'odkopa'],
  73: ['changeling'],
  76: ['prowl'],
  77: ['reinforce', 'wzmocn'],
  79: ['persist', 'wytrwa'],
  82: ['devour', 'pożer'],
  83: ['exalted', 'attacks alone', 'atakuj.*sam'],
  84: ['unearth'],
  87: ['level'],
  88: ['rebound', 'odbij'],
  89: ['umbra'],
  90: ['infect', 'trucizn', 'zakaż', 'chorob'],
  92: ['living weapon'],
  100: ['evolve', 'ewolu'],
  103: ['bestow', 'obdarz', 'załącz'],
  107: ['outlast'],
  108: ['prowess'],
  110: ['exploit', 'poświęc'],
  111: ['menace'],
  112: ['renown', 'sław'],
  114: ['devoid'],
  117: ['surge'],
  122: ['crew', 'załog'],
  123: ['fabricate', 'servo', 'licznik', 'token'],
  128: ['embalm', 'zabalsam', "except it's white", 'zastępuj', 'kolor'],
  134: ['mentor'],
  138: ['escape', 'ucieczk'],
  145: ['daybound', 'nightbound', 'dzień', 'noc', 'day/night', 'upkeep'],
  164: ['toxic', 'toksycz'],
  165: ['backup'],
  167: ['craft'],
  168: ['disguise'],
  170: ['plot', 'spisk'],
  171: ['saddle'],
  174: ['gift', 'dar', 'obietnic'],
  175: ['offspring'],
  185: ['warp'],
};

/**
 * Linie, które cytują numer 702.x bez nazwy mechaniki i są POPRAWNE.
 * Każdy wpis ma powód — bez powodu to byłoby wygaszanie detektora (L5).
 */
const WYJATKI_702 = [
  { wzorzec: /w pełnym wymiarze/, powod: 'lista sekcji CR objętych implementacją (effects.js) — bez nazw mechanik' },
  { wzorzec: /nie dotyczy/, powod: 'odniesienie NEGATYWNE: cytat mówi, że reguła nie ma zastosowania' },
  { wzorzec: /Źródła reguł \(ADR 0030\)/, powod: 'lista źródeł reguł w nagłówku testu audytowego' },
  { wzorzec: /Źródła \(dostęp/, powod: 'lista źródeł reguł w nagłówku testu audytowego' },
];

/** 702.1 to reguła ogólna o keyword abilities — bywa cytowana bez nazwy mechaniki. */
const NUMERY_OGOLNE = new Set([1]);

const OKNO = 8;

function wzorceNazwy(n) {
  const nazwa = TABELA_702[n];
  const out = [];
  if (nazwa) {
    out.push(new RegExp(nazwa.replace(/[- ]/g, '[ \\-]?'), 'i'));
  }
  for (const a of ALIASY_702[n] ?? []) out.push(new RegExp(a, 'i'));
  return out;
}

/**
 * Rdzeń detektora: zwraca listę rozjazdów dla podanych linii.
 * Wydzielona jako czysta funkcja, żeby test mógł ją nakarmić syntetycznym
 * przypadkiem (dowód RED bez mutowania repozytorium — L13).
 */
export function znajdzRozjazdy(linie, nazwaPliku = 'pamiec') {
  const trafienia = [];
  linie.forEach((linia, i) => {
    for (const m of linia.matchAll(/702\.(\d+)/g)) {
      const n = Number(m[1]);
      if (NUMERY_OGOLNE.has(n)) continue;
      if (!(n in TABELA_702)) {
        trafienia.push(`${nazwaPliku}:${i + 1} — 702.${n} nie istnieje w CR 2026-09-25 (sekcja 702 kończy się na 702.195 Storied)`);
        continue;
      }
      if (WYJATKI_702.some((w) => w.wzorzec.test(linia))) continue;
      const okno = linie.slice(Math.max(0, i - OKNO), i + OKNO + 1).join('\n');
      if (!wzorceNazwy(n).some((w) => w.test(okno))) {
        trafienia.push(`${nazwaPliku}:${i + 1} — 702.${n} to ${TABELA_702[n]}, a w oknie ±${OKNO} linii nie ma tej nazwy`);
      }
    }
  });
  return trafienia;
}

function pliki() {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(ROOT, d, entry.name);
      if (entry.isDirectory()) walk(path.join(d, entry.name));
      else if (/\.(js|mjs|html)$/.test(entry.name)) out.push(full);
    }
  };
  walk('src');
  walk('test');
  return out.filter((p) => !POMIN.has(path.relative(ROOT, p))).sort();
}

test('CR 702.x: każdy cytat siedzi przy nazwie mechaniki z BIEŻĄCEGO wydania CR (2026-09-25)', () => {
  const trafienia = [];
  for (const plik of pliki()) {
    const rel = path.relative(ROOT, plik);
    trafienia.push(...znajdzRozjazdy(fs.readFileSync(plik, 'utf8').split('\n'), rel));
  }
  assert.deepEqual(trafienia, [],
    `rozjazdy „numer ↔ mechanika” (popraw numer wg tabeli, dopisz nazwę albo dodaj udokumentowany wyjątek):\n${trafienia.join('\n')}`);
});

test('CR 702.x: detektor łapie podstawione rozjazdy (dowód RED bez mutacji repo)', () => {
  // Przypadki znalezione w audycie PR #135 (F-6/F-7) — odtworzone 1:1.
  const rozjazd = znajdzRozjazdy(['// vigilance = „nie tapuje się, gdy atakuje” (CR 702.21).']);
  assert.equal(rozjazd.length, 1, 'vigilance + 702.21 (ward) ma świecić');
  assert.match(rozjazd[0], /702\.21 to Ward/);

  const fabricate = znajdzRozjazdy([
    '// liczniki nie mają na czym usiąść, ale tokeny powstają',
    '// (CR 702.122a: wybór nadal należy do gracza).',
    'state.pendingFabricate = { playerId };',
  ]);
  assert.equal(fabricate.length, 1, 'fabricate + 702.122a (crew) ma świecić mimo słowa w sąsiedniej linii');

  const poprawny = znajdzRozjazdy([
    '// vigilance = „nie tapuje się, gdy atakuje” (CR 702.20).',
    '// ward (CR 702.21a) dokłada dopłatę za celowanie.',
    '// fabricate (CR 702.123a): liczniki albo tokeny Servo.',
  ]);
  assert.deepEqual(poprawny, [], 'poprawne cytaty nie mogą świecić');

  const pozaTabela = znajdzRozjazdy(['// menażka (CR 702.404)']);
  assert.equal(pozaTabela.length, 1, 'numer spoza sekcji 702 ma świecić');

  const negatyw = znajdzRozjazdy(['// „nonblack” — CR 702.16 nie dotyczy, to filtr celu']);
  assert.deepEqual(negatyw, [], 'odniesienie negatywne jest na liście wyjątków');
});

test('CR 702.x: tabela i skan nie są puste (kontrola własna, L5)', () => {
  assert.ok(Object.keys(TABELA_702).length >= 180, 'tabela 702.x ma ~190 wpisów z CR 2026-09-25');
  assert.ok(Object.keys(ALIASY_702).length >= 50, 'aliasy pokrywają numery cytowane w repo');
  assert.ok(WYJATKI_702.every((w) => w.powod && w.powod.length > 10), 'każdy wyjątek ma powód');
  const lista = pliki();
  assert.ok(lista.filter((p) => p.includes(`${path.sep}src${path.sep}`)).length > 40, 'skanuje src/');
  assert.ok(lista.filter((p) => p.includes(`${path.sep}test${path.sep}`)).length > 100, 'skanuje test/');
});
