// Uwaga z gry właściciela (2026-09-21, M405/B) — Jeskai Devotee a Mana Wizard.
//
// Zgłoszenie: „Karta Jeskai Devotee. Mam go na stole. Może przekształcić jedną
// dowolną manę na manę U, R lub W. Mam też na stole jeden Plains i 4 Mountains.
// Rzucam czar za jedną białą manę. Powinien się otworzyć Mana Wizard w którym
// wybieram czy wolno tapnąć Plains czy przekształcić manę Jeskai Devotee
// z czerwonej na białą. Niestety nie dostaję takiego wyboru i silnik
// automatycznie tapuje Plains. To trzeba naprawić.”
//
// Przyczyna u root cause (sonda probe-devotee): `abilityInfo` w main.js czytał
// produkcję zdolności many z `getSourceForObject(obiekt)` — to produkcja
// „za samo {T}” (M193/A celowo pomija zdolności z KOSZTEM many), więc dla
// konwertera walut „{1}: Add {U}, {R}, or {W}” wychodziło amount 0 i puste
// kolory → `manaSourcesOf` wyrzucał źródło (`produkcja <= 0`) → solver wariantów
// widział 1 kształt płatności (sam Plains) → `shouldOpenManaWizard` = false →
// auto-tap. Silnik przy rozstrzyganiu czyta DESKRYPTOR zdolności (M67) — rozjazd
// warstw cichy (L14/L41). Naprawa: helper `manaAbilityProductionOf` (jedno
// źródło prawdy, L28) czytający effect.colors/effect.amount, podpięty w obu
// miejscach.
//
// Piny mierzą REGUŁĘ, nie kartę:
//   D/1 — produkcja KONKRETNEJ zdolności z deskryptora (konwerter walut:
//         kolory z effect.colors, amount = suma effect.amount ?? 1);
//   D/2 — łańcuch decyzji kreatora: scenariusz właściciela (Devotee + Plains
//         + 4 Mountains, koszt {W}) → źródło-zdolność na liście z kosztem
//         aktywacji, solver = 2 kształty, `shouldOpenManaWizard` = true;
//   D/3 — anty-over-fix: produkcja „za samo {T}” (Apprentice Wizard, mapa)
//         NIE rusza się (amount 3, bezbarwne) i klasa netto-≤0 bez nowych
//         kolorów dalej wypada z listy (M311/A Mana Cylix działa tylko
//         dla konwerterów);
//   D/4 — strażnik użycia (L83): main.js `abilityInfo` czyta produkcję przez
//         helpera (zakomentowane wywołanie nie zostawia zielonego strażnika).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { getSourceForObject, manaAbilityProductionOf } from '../src/engine/mana-sources.js';
import { manaSourcesOf, countPaymentVariants, shouldOpenManaWizard } from '../src/table/mana-wizard.js';

const REGISTRY = createCardRegistry();

function fullObject(cardId, id, controllerId) {
  const card = REGISTRY.get(cardId);
  const data = gameObjectDataOf(card);
  return {
    id, cardId, controllerId, kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: card.keywords ?? [], subtypes: card.subtypes ?? [], types: card.types ?? [],
    colors: data.colors ?? [], zone: 'battlefield', tapped: false,
  };
}

/** abilityInfo jak w main.js po naprawie — produkcja przez helpera. */
function abilityInfoFactory(objectsById) {
  return (objectId, abilityIndex) => {
    const obj = objectsById.get(objectId);
    if (!obj) return null;
    if (abilityIndex == null) {
      const src = getSourceForObject(obj);
      if (!src || (src.amount ?? 0) <= 0) return null;
      return {
        cardId: obj.cardId, colors: src.colors ?? [], amount: src.amount ?? 1,
        manaCost: 0, costColors: [],
        isLand: obj.kind === 'land' || (obj.types ?? []).includes('Land'),
        spendOnly: src?.spendOnly ?? null,
      };
    }
    const ability = obj.abilities?.[abilityIndex];
    const effects = Array.isArray(ability?.effect) ? ability.effect : [ability?.effect];
    if (!effects.some((e) => e?.type === 'add_mana')) return null;
    const production = manaAbilityProductionOf(obj, ability);
    const src = getSourceForObject(obj);
    const spendOnly = effects.find((e) => e?.type === 'add_mana')?.spendOnly ?? null;
    return {
      cardId: obj.cardId,
      colors: production?.colors ?? src?.colors ?? [],
      amount: production?.amount ?? src?.amount ?? 0,
      manaCost: ability?.cost?.mana ?? 0, costColors: ability?.cost?.colors ?? [],
      isLand: obj.kind === 'land' || (obj.types ?? []).includes('Land'),
      spendOnly,
    };
  };
}

function ownerScenarioView() {
  const dev = fullObject('jeskai-devotee', 'dev', 'p1');
  const pl = fullObject('basic-plains', 'pl', 'p1');
  const mountains = [1, 2, 3, 4].map((i) => fullObject('basic-mountain', `m${i}`, 'p1'));
  const objectsById = new Map([dev, pl, ...mountains].map((o) => [o.id, { ...o }]));
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Bot' }],
    zones: { battlefield: [...objectsById.values()].map((o) => ({ ...o })) },
    legalCommands: [
      { type: 'activate_ability', playerId: 'p1', objectId: 'dev', abilityIndex: 1 },
    ],
  };
  return { view, objectsById };
}

test('D/1 produkcja zdolności z deskryptora add_mana (konwerter walut)', () => {
  const dev = fullObject('jeskai-devotee', 'dev', 'p1');
  const activated = dev.abilities.find((a) => a.type === 'activated');
  assert.ok(activated, 'Devotee ma zdolność aktywowaną w katalogu');
  const production = manaAbilityProductionOf(dev, activated);
  assert.ok(production, `produkcja odczytana z deskryptora: ${JSON.stringify(production)}`);
  assert.deepEqual([...production.colors].sort(), ['R', 'U', 'W'],
    `{1}: Add {U}, {R}, or {W} — kolory wprost z effect.colors (nie z produkcji „za samo {T}")`);
  assert.equal(production.amount, 1, 'amount = suma effect.amount ?? 1');
});

test('D/2 scenariusz właściciela: Devotee + Plains + 4 Mountains przy {W} — kreator ma się otworzyć', () => {
  const { view, objectsById } = ownerScenarioView();
  const sources = manaSourcesOf(view, 'p1', abilityInfoFactory(objectsById), {});
  const devSource = sources.find((s) => s.id === 'dev');
  assert.ok(devSource, `Devotee jest źródłem many w kreatorze: ${JSON.stringify(sources.map((s) => s.id))}`);
  assert.deepEqual([...devSource.colors].sort(), ['R', 'U', 'W'], 'kolory produkcji konwertera');
  assert.equal(devSource.amount, 1, 'pełna produkcja (nie net)');
  assert.equal(devSource.activationCost?.generic, 1, 'koszt aktywacji {1} osobno (M311)');
  const variants = countPaymentVariants(sources, 0, 1, [['W']]);
  assert.equal(variants, 2,
    'dwa kształty płatności: [Plains] albo [Mountain→konwersja Devotee]');
  const open = shouldOpenManaWizard({ sources, poolMana: 0, totalNeeded: 1, requirements: [['W']] });
  assert.equal(open, true,
    'Mana Wizard otwiera się — wybór „tapnąć Plains czy przekształcić czerwoną na białą”');
});

test('D/3 anty-over-fix: produkcja „za samo {T}" i klasa netto-≤0 nietknięte', () => {
  // Apprentice Wizard ({U},{T}: Add {C}{C}{C}) — produkcja z mapy M193 przy
  // abilityIndex null (ścieżka lądów/tap) — amount 3, bezbarwne, bez zmian.
  const wiz = fullObject('apprentice-wizard', 'wiz', 'p1');
  const src = getSourceForObject(wiz);
  assert.equal(src?.amount, 3, 'mapa: 3 bezbarwne — produkcja obiektu bez zmian');
  assert.deepEqual(src?.colors ?? [], [], 'bezbarwne — bez zmian');
  // Helper dla tap-only zdolności też czyta deskryptor (M67-parity): effect
  // niesie amount 3 — zgodnie z silnikiem (rozstrzygnięcie dodaje 3).
  const tapAbility = wiz.abilities.find((a) => a.type === 'activated');
  const production = manaAbilityProductionOf(wiz, tapAbility);
  assert.equal(production?.amount, 3, 'deskryptor zdolności: amount 3 (jak M67)');
  // Klasa netto-straty (M311/A): {1},{T}: Add {C} — produkcja ⊆ kosztu i brak
  // nowych kolorów → źródło wypada z listy kreatora (bez zmian).
  const losser = {
    id: 'loss', cardId: 'x-loss', controllerId: 'p1', kind: 'artifact', zone: 'battlefield',
    types: ['Artifact'], subtypes: [], colors: [], tapped: false,
    abilities: [{ type: 'activated', cost: { mana: 1, tap: true }, effect: { type: 'add_mana', amount: 1, colors: [] } }],
  };
  const objectsById = new Map([['loss', losser]]);
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1' }, { id: 'p2' }],
    zones: { battlefield: [losser] },
    legalCommands: [{ type: 'activate_ability', playerId: 'p1', objectId: 'loss', abilityIndex: 0 }],
  };
  const sources = manaSourcesOf(view, 'p1', abilityInfoFactory(objectsById), {});
  assert.equal(sources.find((s) => s.id === 'loss'), undefined,
    'czysta strata (netto ≤ 0, produkcja ⊆ kosztu) dalej wypada z listy');
});

test('D/4 strażnik użycia (L83): main.js czyta produkcję przez manaAbilityProductionOf', () => {
  const text = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.ok(/manaAbilityProductionOf\s*\(/.test(stripped),
    'abilityInfo w main.js wywołuje helpera (nie surowe getSourceForObject dla produkcji)');
});
