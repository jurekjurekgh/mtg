// PMSSB-64 (batch 68) — sonda POMIARU PRZED / PO: słowa kluczowe stworzenia rzucanego z ręki.
// Problem: wycena rzutu `cast_permanent` czyta tylko P/T i koszt — lifelink, latanie, deathtouch,
// haste itd. dają identyczny wynik (PRZED: 64.80 dla wszystkich wariantów Child of Night).
// Uruchomienie: node tools/pmssb64-keywords-sonda.mjs
import { playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { botTurn, putSynthCreature } from './pmssb63-batch68-sonda.mjs';

const REGISTRY = createCardRegistry();

// Ciało testowe: definicja Hill Giant (3/3, koszt 4, czerwony) z podanymi słowami kluczowymi.
// Bot czyta słowa z DEFINICJI (cardDef = registry.get), nie z widoku ręki (widok nie ma pola keywords),
// więc rejestr jest podmieniany przez opcję `registry` createHeuristicBot. Stan gry nie jest zmieniany.
const BODY_ID = 'synth-body';
function bodyRegistry(keywords, body = {}) {
  const real = createCardRegistry();
  const base = real.get('hill-giant');
  const def = { ...base, keywords: [...keywords], ...(body.power != null ? { power: body.power } : {}), ...(body.toughness != null ? { toughness: body.toughness } : {}), ...(body.mv != null ? { manaCost: body.mv } : {}) };
  // Rejestr to zwykły obiekt z metodami domknięć (get/has/all/supported) — kopia z podmienionym get.
  return { ...real, get: (id) => (id === BODY_ID ? def : real.get(id)), has: (id) => id === BODY_ID || real.has(id) };
}

/** Wynik rzutu ciała `BODY_ID` z ręki (cast_permanent) przy danych słowach kluczowych i stole. */
export function castScore({ keywords, life = 20, board = () => {}, morph = false, body = {}, mana = 4, params = undefined }) {
  const state = botTurn({ life });
  addMana(state, 'p2', mana, { colors: ['R'] });
  const base = REGISTRY.get('hill-giant');
  const bodyDef = bodyRegistry(keywords, body).get(BODY_ID);
  const data = gameObjectDataOf(bodyDef);
  addObject(state, {
    id: 'x', instanceId: 'i-x', cardId: BODY_ID, controllerId: 'p2', ownerId: 'p2', zone: 'hand',
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: [...keywords],
    subtypes: base.subtypes ?? [], types: base.types ?? [], colors: data.colors ?? [],
    ...(morph ? { morph: { cost: 3 } } : {}),
  });
  board(state);
  const bot = createHeuristicBot({ seed: 68, registry: bodyRegistry(keywords, body), params });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const entry = bot.trace().at(-1);
  // Zwykły rzut dodawany jest PRZED rzutem zakrytym (game-state.js: morph ~8948) — kolejność
  // opcji jest deterministyczna: [normalny, zakryty?]. Zwracamy wszystkie wyniki.
  return (entry?.options ?? []).filter((o) => o?.cmd?.startsWith('cast_permanent(x')).map((o) => o.score);
}

const enemyFlyer = (s) => putSynthCreature(s, 'ef', 'p1', { power: 2, toughness: 2, mv: 2, keywords: ['flying'] });
const enemyVanilla = (s) => putSynthCreature(s, 'ev', 'p1', { power: 2, toughness: 2, mv: 2 });

export const KW_SCENARIOS = [
  { id: 'KW1-lifelink-vs-vanilla', opis: 'ten sam 4/3 MV4: lifelink ma być wyżej niż vanilla (przy życiu 20)', a: { keywords: ['lifelink'] }, b: { keywords: [] }, oczekuje: (a, b) => a > b },
  { id: 'KW2-flying-bez-latajacych-blokerow', opis: 'latanie, wróg bez latających/zasięgu → ewazja 8 (×0.9 waga rodziny cast = 7.2)', a: { keywords: ['flying'], board: enemyVanilla }, b: { keywords: [], board: enemyVanilla }, oczekuje: (a, b) => Math.abs((a - b) - 7.2) < 0.01 },
  { id: 'KW3-flying-blokowany-latajacym', opis: 'latanie, wróg MA latającego blokera → residuum obrony 3 (×0.9 = 2.7), nie ewazja', a: { keywords: ['flying'], board: enemyFlyer }, b: { keywords: [], board: enemyFlyer }, oczekuje: (a, b) => Math.abs((a - b) - 2.7) < 0.01 },
  { id: 'KW4-haste-tempo', opis: 'haste: tempo 6 (×0.9 = 5.4), jak haste w equipValuation', a: { keywords: ['haste'] }, b: { keywords: [] }, oczekuje: (a, b) => Math.abs((a - b) - 5.4) < 0.01 },
  { id: 'KW5-deathtouch', opis: 'deathtouch: nie do przejścia w walce (wartość > 0)', a: { keywords: ['deathtouch'] }, b: { keywords: [] }, oczekuje: (a, b) => a > b },
  { id: 'KW6-lifelink-zalezy-od-zycia', opis: 'lifelink przy życiu 3 (zagrożenie) waży więcej niż przy życiu 20', a: { keywords: ['lifelink'], life: 3 }, b: { keywords: ['lifelink'], life: 20 }, oczekuje: (a, b) => a > b, roznica: true },
  { id: 'KW7-morph-zakryty-bez-slow', opis: 'rzut twarzą w dół (ostatni wpis): słowa awersu ukryte (CR 708.2a) — zakryty wynik identyczny', a: { keywords: ['lifelink'], morph: true }, b: { keywords: [], morph: true }, zakryty: true, oczekuje: (a, b) => Math.abs(a - b) < 0.01 },
  { id: 'KW8-antioverfix-vanilla-bez-zmian', opis: 'vanilla bez słów: wynik identyczny (brak słów = brak premii)', a: { keywords: [] }, b: { keywords: [] }, oczekuje: (a, b) => a === b },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const sc of KW_SCENARIOS) {
    const aa = castScore({ ...sc.a });
    const bb = castScore({ ...sc.b });
    const idx = sc.zakryty ? aa.length - 1 : 0;
    const a = aa[idx];
    const b = bb[idx];
    const ok = a != null && b != null && sc.oczekuje(a, b);
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${sc.id.padEnd(36)} a=${a?.toFixed(2)} b=${b?.toFixed(2)} Δ=${(a - b).toFixed(2)}`);
  }
}
