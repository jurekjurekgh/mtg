import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { commandLabel, describeSpellEffects } from '../src/table/render.js';

/**
 * Diamentowa odznaka — challenge 2 (2026-08-12): 15 błędów wykrytych żywym
 * testerem stołu. Testy regresyjne etykiet (RED→GREEN).
 */

const REGISTRY = createCardRegistry();

function sessionWith(registry, battlefield = [], hand = [], graveyard = []) {
  return {
    view: () => ({
      status: 'active', winnerId: null, playerId: 'p1',
      players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'On', life: 20 }],
      zones: { battlefield, hand, stack: [], graveyard, exile: [], library: [] },
      turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
      legalCommands: [],
    }),
    nameOf: (id) => registry.get(id)?.name ?? id,
    nameOfObject: (id) => id,
    cardDetails: (id) => registry.get(id) ?? null,
    colorsOf: (id) => registry.get(id)?.colors ?? [],
    abilitiesOf: (id) => registry.get(id)?.abilities ?? [],
    log: [], reasoning: [], state: { seed: 1 },
  };
}

// --- 1. Banishment Decree: bounce_to_library_top opisany po polsku ----------
test('D2.1: bounce_to_library_top opisany po polsku (nie „efekt (…)")', () => {
  const handObj = { id: 'ban', cardId: 'banishment-decree', controllerId: 'p1', zone: 'hand', kind: 'instant', spell: REGISTRY.get('banishment-decree').spell };
  const session = sessionWith(REGISTRY, [], [handObj]);
  const label = commandLabel({ type: 'cast_spell', objectId: 'ban', targets: ['art'] }, session, session.view());
  assert.ok(!label.includes('efekt ('), `surowy efekt: ${label}`);
});

// --- 2. Escape: koszt pokazany (nie „?") ------------------------------------
test('D2.2: escape pokazuje koszt, nie „?"', () => {
  const graveObj = { id: 'so', cardId: 'sweet-oblivion', controllerId: 'p1', zone: 'graveyard' };
  const session = sessionWith(REGISTRY, [], [], [graveObj]);
  const label = commandLabel({ type: 'cast_escape', objectId: 'so', targets: ['p2'], escapeExileIds: [] }, session, session.view());
  assert.ok(!label.includes('(koszt ?)'), `escape bez kosztu: ${label}`);
  // Koszt many jest ikoną (span.ms) — sprawdzamy, że nie ma „?" i jest cena.
  // M267/C: Oracle Sweet Oblivion to „Escape {3}{U}", więc etykieta pokazuje
  // {3}{U} (trzy generyczne + pip niebieski), a nie zsumowane „4" — cztery
  // many bezbarwne nie zapłaciłyby tego kosztu. Pin zaktualizowany razem
  // z decyzją; próg „nie ?" (sedno tego testu) bez zmian.
  assert.ok(label.includes('>3</span>') || label.includes('3'), label);
  assert.match(label, /\bU\b|ms-u/i, `pip koloru w koszcie escape: ${label}`);
});

// --- 3. Inspiring Bard: mode names po polsku --------------------------------
test('D2.3: Inspiring Bard tryby po polsku', () => {
  const names = REGISTRY.get('inspiring-bard').abilities[0].trigger.modes.map((m) => m.name);
  assert.ok(!names.includes('Bardic Inspiration'), `angielski tryb: ${names}`);
  assert.ok(names.includes('Inspiracja barda') && names.includes('Pieśń odpoczynku'), names.join(', '));
});

// --- 4. Ainok Artillerist: reach nie dublowany w zdolności ------------------
test('D2.4: Ainok Artillerist ma reach tylko raz (nie „Zasięg · Zasięg")', () => {
  const abilities = REGISTRY.get('ainok-artillerist').abilities;
  const reachCount = abilities.filter((a) => a.keywords?.includes('reach')).length;
  assert.equal(reachCount, 1, 'reach tylko raz w zdolności');
});

// --- 5. Howl: dynamiczna liczba tokenów widoczna ----------------------------
test('D2.5: Howl pokazuje „za każdy land tego podtypu"', () => {
  const text = describeSpellEffects(REGISTRY.get('howl-of-the-night-pack').spell);
  assert.ok(!/Stwórz 2\/2 Wolf$/.test(text), `brak dynamicznej liczby: ${text}`);
  assert.ok(text.includes('za każdy land tego podtypu'), text);
});

// --- 6. Modalne tryby: nazwy po polsku (nie angielskie) ---------------------
test('D2.6: modalne tryby Choose one po polsku', () => {
  const checks = [
    ['aerith-rescue-mission', ['Winda', 'Schody']],
    ['ruinous-rampage', ['3 obrażenia dla każdego przeciwnika', 'Wygnaj artefakty']],
    ['youre-confronted-by-robbers', ['Zyskiwanie czasu', 'Wezwanie pomocy']],
    ['your-temple-is-under-attack', ['Modlitwa o ochronę', 'Zawrzyj pakt']],
    ['selesnya-charm', ['Wygnanie', 'Rycerz']],
  ];
  for (const [cardId, expected] of checks) {
    const modes = REGISTRY.get(cardId).spell.modes.map((m) => m.name);
    for (const name of expected) assert.ok(modes.includes(name), `${cardId}: brak ${name} w ${modes}`);
  }
});

// --- 7. Jyoti: moc źródła raz, nie „moc źródła/moc źródła" -------------------
test('D2.7: Jyoti opisuje pump raz (nie „moc źródła/moc źródła")', () => {
  const text = describeSpellEffects({ effects: [{ type: 'buff_land_creatures', power: 'source_power', toughness: 'source_power' }] });
  assert.equal((text.match(/moc źródła/g) || []).length, 1, `dublet: ${text}`);
});

// --- 8. escape/bounce/effect slugi nie występują w opisach ------------------
test('D2.8: efekty batcha 30 opisane po polsku (bez surowych slugów)', () => {
  for (const cardId of ['gurmag-drowner', 'epic-experiment', 'altar-of-the-goyf', 'banishment-decree']) {
    const card = REGISTRY.get(cardId);
    const abilities = card.abilities ?? [];
    const spell = card.spell;
    // Sprawdź, że opis zdolności (trigger effect) nie wypada jako „efekt (<slug>)"
    // — weryfikujemy przez mapę: istnieje pole type, a describeEffect ma wpis.
    for (const ab of abilities) {
      const effects = Array.isArray(ab.effect) ? ab.effect : ab.effect ? [ab.effect] : [];
      for (const ef of effects) {
        if (ef?.type) {
          const text = describeSpellEffects({ effects: [ef] });
          assert.ok(!/efekt \(/.test(text) && !text.includes(ef.type), `${cardId}: surowy slug ${ef.type} w "${text}"`);
        }
      }
    }
    if (spell) {
      for (const ef of spell.effects ?? []) {
        const text = describeSpellEffects({ effects: [ef] });
        assert.ok(!/efekt \(/.test(text) && !text.includes(ef.type), `${cardId}: surowy slug ${ef.type} w "${text}"`);
      }
    }
  }
});

// --- 9. Exalted po polsku ---------------------------------------------------
test('D2.9: exalted_pump „egzaltacja", nie „(exalted)"', () => {
  const text = describeSpellEffects({ effects: [{ type: 'exalted_pump', power: 1, toughness: 1 }] });
  assert.ok(!text.includes('(exalted)'), `surowe exalted: ${text}`);
});
