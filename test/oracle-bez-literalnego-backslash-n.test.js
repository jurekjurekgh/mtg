/**
 * PROWENIENCJA ORACLE (E4 sesji 2026-09-19, ADR 0028 / ADR 0030): ani katalog,
 * ani snapshoty Scryfalla nie mogą nieść LITERALNEGO `\n` (backslash + „n”) —
 * w danych to zawsze uszkodzony separator wierszy, nie zamierzona treść.
 *
 * Znalezienie (polowanie na niezgodności INNĄ ścieżką niż poprzednia sesja:
 * pełny diff katalog↔snapshot po wszystkich 480 kartach z snapshotem):
 *  - 20 wpisów katalogu miało w `oracleText` literalny `\n` zamiast nowej linii
 *    (m.in. instant-ramen, crew-captain, moonlit-meditation),
 *  - 7 plików `docs/cards/scryfall-*.json` miało literalny `\n` w `oracle_text`
 *    (m.in. altar-of-the-goyf, consuming-spirit: consume-spirit, gurmag-drowner).
 * Skutek: sesyjna weryfikacja „karta vs Oracle” czytała separator jako treść —
 * a gdyby kiedykolwiek oracleText trafił do UI, gracz zobaczyłby „\n” w opisie.
 *
 * Strażnik pilnuje OBIE STRONY (katalog i snapshoty) oraz tego, że przegląd
 * faktycznie objął katalog (bramka na degenerację: minimum sprawdzonych kart).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCardRegistry } from '../src/cards/card-data.js';

const REPO = new URL('../', import.meta.url);
const KATALOG_KART = new URL('docs/cards/', REPO);
const REGISTRY = createCardRegistry();
const LITERALNY = '\\n'; // backslash + „n” — dwuznak, nie nowa linia

const nazwaSnapshotu = (id) => `scryfall-${id}.json`;
const wczytajSnapshot = (id) => {
  const plik = new URL(nazwaSnapshotu(id), KATALOG_KART);
  if (!fs.existsSync(plik)) return null;
  return JSON.parse(fs.readFileSync(plik, 'utf8'));
};
const oracleZeSnapshotu = (snap) => snap.card_faces?.[0]?.oracle_text ?? snap.oracle_text ?? null;

test('E4/Oracle: żaden wpis katalogu nie ma literalnego „\\n” w oracleText', () => {
  const karty = REGISTRY.all();
  assert.ok(karty.length > 400, `katalog ma sensowną wielkość (jest ${karty.length})`);
  const winne = karty.filter((def) => (def.oracleText ?? '').includes(LITERALNY)).map((def) => def.id);
  assert.deepEqual(winne, [], `wpisy z literalnym „\\n” zamiast nowej linii: ${JSON.stringify(winne)}`);
});

test('E4/Oracle: żaden snapshot nie ma literalnego „\\n” w oracle_text', () => {
  const pliki = fs.readdirSync(KATALOG_KART).filter((f) => f.startsWith('scryfall-') && f.endsWith('.json'));
  assert.ok(pliki.length > 400, `snapshotów jest sensownie dużo (jest ${pliki.length})`);
  const winne = [];
  for (const plik of pliki) {
    const snap = JSON.parse(fs.readFileSync(new URL(plik, KATALOG_KART), 'utf8'));
    const teksty = [snap.oracle_text, ...(snap.card_faces ?? []).map((f) => f.oracle_text)];
    if (teksty.some((t) => (t ?? '').includes(LITERALNY))) winne.push(plik);
  }
  assert.deepEqual(winne, [], `snapshoty z literalnym „\\n” w oracle_text: ${JSON.stringify(winne)}`);
});

test('E4/Oracle: katalog zgadza się ze snapshotem tam, gdzie uszkodzenie było', () => {
  // Reprezentanci obu stron naprawy + karta dwustronna (Lodestone Needle //
  // Guidestone Compass) — dowód, że strażnik czyta właściwą twarz.
  for (const id of ['instant-ramen', 'crew-captain', 'consume-spirit', 'gurmag-drowner']) {
    const snap = wczytajSnapshot(id);
    assert.ok(snap, `snapshot ${id} istnieje`);
    assert.equal(REGISTRY.get(id).oracleText, oracleZeSnapshotu(snap), `oracleText ${id} == snapshot`);
  }
  for (const id of ['moonlit-meditation', 'deepwood-denizen', 'village-bell-ringer', 'trained-arynx']) {
    const snap = wczytajSnapshot(id);
    assert.ok(snap, `snapshot ${id} istnieje`);
    assert.equal(REGISTRY.get(id).oracleText, oracleZeSnapshotu(snap), `oracleText ${id} == snapshot`);
  }
  const igla = wczytajSnapshot('lodestone-needle');
  assert.equal(REGISTRY.get('lodestone-needle').oracleText, oracleZeSnapshotu(igla),
    'karta dwustronna: katalog == twarz przednia (nie „name” całego DFC)');
  assert.ok(igla.name.includes(' // '), 'snapshot Lodestone Needle faktycznie jest DFC (strażnik nie mierzy pustki)');
});

test('E4/Oracle: separator wierszy w katalogu to prawdziwa nowa linia', () => {
  const ramen = REGISTRY.get('instant-ramen').oracleText;
  assert.equal(ramen.split('\n').length, 3, 'trzy wiersze Oracle oddzielone nowymi liniami');
  assert.ok(ramen.includes('{2}, {T}, Sacrifice this artifact: You gain 3 life.'));
});
