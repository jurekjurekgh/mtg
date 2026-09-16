// Srebrny audyt danych v2: keywordy, timingi, kolory vs koszt.
import fs from 'node:fs';
import { createCardRegistry } from './src/cards/card-data.js';

const REGISTRY = createCardRegistry();
const snaps = {};
for (const f of fs.readdirSync('docs/cards')) {
  if (!f.startsWith('scryfall-') || !f.endsWith('.json')) continue;
  snaps[f.slice('scryfall-'.length, -'.json'.length)] = JSON.parse(fs.readFileSync('docs/cards/' + f, 'utf8'));
}

const KW = ['Flying', 'Haste', 'Trample', 'Vigilance', 'Menace', 'Reach', 'Defender', 'Lifelink', 'Deathtouch', 'First strike', 'Double strike', 'Hexproof', 'Shroud', 'Indestructible', 'Flash', 'Hexproof'];
const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s-]+/g, '_');
const miss = { keywordMissing: [], keywordExtra: [], timing: [], colors: [] };

for (const card of REGISTRY.all()) {
  if (card.support?.status !== 'supported') continue;
  const snap = snaps[card.id];
  // 1. keywordy drukowane: „Keyword” na początku linii / po przecinku (nie „gains/has X”).
  if (snap?.oracle_text) {
    const text = snap.oracle_text;
    for (const kw of KW) {
      const printed = new RegExp(`(^|\\n|, )${kw}( |$|\\n|,|\\()`).test(text);
      const has = (card.keywords ?? []).some((k) => norm(k) === norm(kw));
      if (printed && !has) miss.keywordMissing.push(`${card.id}: Oracle drukuje ${kw}, dane nie`);
    }
    // extra: keyword w danych, którego Oracle w ogóle nie wspomina (ani drukowany, ani nadany)?
    for (const k of (card.keywords ?? [])) {
      const words = String(k).split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('[ -]');
      if (!new RegExp(words, 'i').test(text) && !/^(changeling|devoid)$/i.test(k)) {
        miss.keywordExtra.push(`${card.id}: dane mają ${k}, Oracle nie wspomina`);
      }
    }
    // 2. kolory vs pipy w koszcie (devoid usprawiedliwia brak).
    const pips = new Set([...String(snap.mana_cost ?? '').matchAll(/\{([WUBRG])\}/g)].map((m) => m[1]));
    const devoid = (card.keywords ?? []).includes('devoid');
    for (const pip of pips) {
      if (!(card.colors ?? []).includes(pip) && !devoid) {
        miss.colors.push(`${card.id}: pip ${pip} w koszcie ${snap.mana_cost}, colors=${JSON.stringify(card.colors)}`);
      }
    }
  }
  // 3. timing czaru vs typy (wewnętrzne).
  if (card.spell?.timing) {
    const isInstant = (card.types ?? []).includes('Instant');
    if (isInstant && card.spell.timing !== 'instant') miss.timing.push(`${card.id}: Instant z timingiem ${card.spell.timing}`);
    if (!isInstant && (card.types ?? []).includes('Sorcery') && card.spell.timing !== 'sorcery') {
      miss.timing.push(`${card.id}: Sorcery z timingiem ${card.spell.timing}`);
    }
  }
}
for (const [k, v] of Object.entries(miss)) {
  console.log(`--- ${k}: ${v.length}`);
  for (const m of v.slice(0, 30)) console.log('  ' + m);
}
