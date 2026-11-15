// Audyt PR #185 — F-20 (nowe znalezisko z E2.12/F-16, NISKI→ŚREDNI, narzędzie
// pomiarowe): sonda PMSSB-89 nie drukuje NIC przy komendzie z własnego nagłówka.
//
// `tools/pmssb89-batch73-scoring-sonda.mjs` zaczyna się od „Run with: node
// tools/pmssb89-batch73-scoring-sonda.mjs", a blok main był strzeżony przez
// `import.meta.url === process.argv[1]`. `process.argv[1]` to ŚCIEŻKA WZGLĘDNA
// (`tools/…`), `import.meta.url` to URL pliku (`file:///home/user/mtg/tools/…`),
// więc porównanie jest zawsze fałszywe: komenda kończy się kodem 0 i pustym
// stdoutem. Pomiar PRZED (`.arena/sonda-pmssb89-przed.log`): 0 bajtów wyjścia.
// Skutek: „pomiar przed→po" deklarowany w `docs/PMSSB.md` §PMSSB-89 nie był
// odtwarzalny narzędziem, które ten pomiar miało robić (L24: skutek bez śladu
// nie istnieje). Konwencja repo dla tego strażnika jest inna —
// `tools/benchmark.mjs:763` i `tools/bot-scoring-snapshot.mjs:176` używają
// `pathToFileURL(path.resolve(fs.realpathSync(process.argv[1]))).href`.
//
// F-16 (ten sam krok): etykiety kart w tej sondzie kłamały wobec Oracle
// (ADR 0030/L57) — „Leonin Lightbringer ({W},{T} tap target)", „Kessig
// Flamebreather ({1}{R},{T} damage 2)", „Messenger's Speed (aura +1/+1 …)",
// „Seton's Desire (aura +2/+2 ward {2})", „Necrosavant (reanimate
// minGraveyardCards)", „Might Beyond Reason (+X/+X board pump)". Pin poniżej
// trzyma etykiety przy tekście Oracle i pilnuje, żeby main znowu nie zamilkł.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const SONDA = 'tools/pmssb89-batch73-scoring-sonda.mjs';
const KARTY_BATCHA = [
  'plummet', 'get-the-point', 'messengers-speed', 'might-beyond-reason', 'river-herald-guide',
  'setons-desire', 'spring-loaded-sawblades', 'leonin-lightbringer', 'necrosavant',
  'kessig-flamebreather',
];
const uruchom = () => execFileSync(process.execPath, [SONDA], { encoding: 'utf8' });
const oracleOf = (cardId) => JSON.parse(
  fs.readFileSync(`docs/cards/scryfall-${cardId}.json`, 'utf8'),
).oracle_text ?? '';

test('F-20/1: `node tools/pmssb89-batch73-scoring-sonda.mjs` drukuje pomiar (main nie jest martwy)', () => {
  const out = uruchom();
  assert.ok(out.includes('=== PMSSB-89'), `brak nagłówka sondy w wyjściu: ${JSON.stringify(out.slice(0, 200))}`);
  assert.ok(out.includes('=== Probe complete ==='), `brak końca przebiegu: ${JSON.stringify(out.slice(-200))}`);
  for (const cardId of KARTY_BATCHA) {
    assert.ok(out.includes(`"cardId":"${cardId}"`),
      `sonda nie zmierzyła karty ${cardId} (main nie objął wszystkich kart batcha)`);
  }
});

test('F-20/2: każda linia pomiaru niesie decyzję bota, nie pusty obiekt', () => {
  const linie = uruchom().split('\n').filter((l) => l.includes('"cardId"'));
  assert.equal(linie.length, KARTY_BATCHA.length, `liczba linii pomiaru: ${linie.length}`);
  for (const linia of linie) {
    assert.ok(linia.includes('"chosen"'), `linia bez decyzji bota: ${linia}`);
    assert.ok(!/"chosen":"\(none\)"/.test(linia) || /hasCastOffer/.test(linia),
      `brak wyboru i brak pola wyjaśniającego: ${linia}`);
  }
});

test('F-16/5: etykiety kart w sondzie są zgodne z Oracle (ADR 0030), nie z fabrykacją', () => {
  const out = uruchom();
  // Fabrykowane zdolności aktywowane (usunięte z katalogu w ostatnim commicie
  // PR #185) nie mogą wracać jako etykiety pomiaru.
  assert.ok(!out.includes('({W},{T} tap target)'), 'Leonin: etykieta zdolności, której karta nie ma');
  assert.ok(!/Kessig Flamebreather \(\{1\}\{R\},\{T\} damage 2\)/.test(out),
    'Kessig: etykieta zdolności {1}{R},{T} damage 2 — Oracle zna tylko trigger');
  assert.ok(!out.includes('minGraveyardCards'), 'Necrosavant: etykieta z kluczem, którego karta nie ma');
  assert.ok(!/Messenger's Speed \(aura \+1\/\+1/.test(out),
    "Messenger's Speed: Oracle nie daje +1/+1 (tylko trample i haste)");
  assert.ok(!/Seton's Desire \(aura \+2\/\+2 ward \{2\}\)/.test(out),
    "Seton's Desire: ward {2} ma Leonin Lightbringer, nie ta aura");
  assert.ok(!out.includes('+X/+X board pump'),
    'Might Beyond Reason: to liczniki +1/+1 na CEL (2, delirium 3), nie pump X/X całej planszy');
  // Etykieta ma mówić to, co Oracle (sprawdzone per karta, nie „na oko").
  assert.match(out, /Leonin Lightbringer \(ward \{2\}/, 'Leonin: etykieta z ward {2} z Oracle');
  assert.match(out, /Kessig Flamebreather \(trigger/, 'Kessig: etykieta nazywa trigger');
  assert.ok(oracleOf('leonin-lightbringer').startsWith('Ward {2}'), 'snapshot Oracle Leonina: Ward {2}');
  assert.ok(oracleOf('kessig-flamebreather').startsWith('Whenever you cast a noncreature spell'),
    'snapshot Oracle Kessiga: trigger na noncreature spell');
});
