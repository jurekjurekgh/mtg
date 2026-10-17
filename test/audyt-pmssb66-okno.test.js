// PMSSB-66 (batch 68) — okno many: aktywacja produkująca manę (lasting mana) jest płacona w oknie,
// w którym ta mana i tak się zmarnuje (koniec tury PRZECIWNIKA: nasze lądy odtapują się w naszym
// untap). Reguła generyczna: create_token, countery ±1/±1, stun, oil. Odroczenie poza oknem:
// score = min(score, −koszt many). Walka przeciwnika (declare_blockers) — bez odroczenia.
// Sonda z pełnym opisem: tools/pmssb66-okno-many-sonda.mjs. Lekki test (bez symulacji 167k komend).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OKNO_SCENARIOS, oknoDecision, syntheticRegistry } from '../tools/pmssb66-okno-many-sonda.mjs';

const decide = (sc, params) => {
  const args = { ...sc.args };
  if (args.registryOverride) args.registryOverride = syntheticRegistry(args.registryOverride);
  return { r: oknoDecision({ ...args, params }), oid: args.objectId ?? 'halo' };
};
const byPrefix = (prefix) => {
  const sc = OKNO_SCENARIOS.find((s) => s.id.startsWith(prefix));
  assert.ok(sc, `brak scenariusza ${prefix}`);
  return decide(sc);
};

for (const sc of OKNO_SCENARIOS) {
  test(`PMSSB-66 ${sc.id}: ${sc.opis}`, () => {
    const { r } = decide(sc);
    assert.ok(sc.oczekuje(r), `wybór=${r.chosenCmd}`);
  });
}

test('PMSSB-66 okno: Halo w end step przeciwnika ma wynik dodatni (aktywacja), w naszej głównej ujemny (odroczenie)', () => {
  const okno = byPrefix('W1-').r.options.find((o) => o.cmd?.startsWith('activate_ability(halo'));
  const nasza = byPrefix('W2-').r.options.find((o) => o.cmd?.startsWith('activate_ability(halo'));
  assert.ok(okno && okno.score > 0, `okno=${okno?.score}`);
  assert.ok(nasza && nasza.score < 0, `nasza=${nasza?.score}`);
});

test('PMSSB-66 odroczenie: poza oknem wynik nie przekracza −koszt many (W6 → −1 przy koszcie 1)', () => {
  const act = byPrefix('W6-').r.options.find((o) => o.cmd?.startsWith('activate_ability(cnt'));
  assert.ok(act && act.score <= -1 + 1e-9, `score=${act?.score}`);
});

// Pokrętło ×0: `lastingManaWindowOn: 0` wyłącza cały mechanizm. Dawne zachowanie (PRZED):
// Halo w end step przeciwnika → pass (−11); licznik +1/+1 w NASZEJ głównej → activate (+25 — ten
// błąd właściciel odrzucił; przy 0 wraca, przy 1 jest naprawiony → pass). Jeden przełącznik.
test('PMSSB-66 pokrętło ×0: lastingManaWindowOn=0 przywraca dawne Halo (pass) i dawny licznik w naszej głównej (activate)', () => {
  const off = { lastingManaWindowOn: 0 };
  const halo = OKNO_SCENARIOS.find((s) => s.id.startsWith('W1-'));
  const cntMain = OKNO_SCENARIOS.find((s) => s.id.startsWith('W6-'));
  assert.equal(decide(halo, off).r.chosenCmd, 'pass_priority');
  const haloOff = decide(halo, off).r.options.find((o) => o.cmd?.startsWith('activate_ability(halo'));
  assert.ok(haloOff && haloOff.score < 0, `halo off=${haloOff?.score}`);
  assert.equal(decide(cntMain, off).r.chosenCmd, 'activate_ability(cnt#0)');
  assert.equal(decide(cntMain).r.chosenCmd, 'pass_priority');
});
