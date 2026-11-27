/**
 * PMSSB-92 — piny pętli strojenia Batcha 75 (karty 666–675 + token Junk).
 *
 * Zasada pętli (docs/PMSSB.md §PMSSB-90, L41): piny NIE duplikują stanu —
 * budują scenariusze Z SONDY (`tools/pmssb92-batch75-sonda.mjs`, eksport
 * `SCENARIUSZE` + helpery `stan`/`decyzja`) i twierdzą o wynikach decyzji.
 * Pomiar PRZED/PO: `tools/pmssb92-batch75-pomiar-po.txt` (40 rekordów).
 *
 * Werdykty pro z audytu macierzowego (F-92/x w §PMSSB-92):
 *  - F-92/2 naprawione generycznie: kwota obrażeń `creatures_you_control` w
 *    łańcuchu wyceny czarów (silnik rozwiązywał, wycena nie — salwa CM była
 *    stała 84 niezależnie od liczby własnych stworów),
 *  - M431-suffix: warianty modalne w śladzie rozróżnione `,m<N>` (klasa
 *    L34/L40 — wcześniej audyt remisów parował po indeksie sortowania),
 *  - harness blokowy: krok `declare_attackers` + deklaracja + jump do
 *    `declare_blockers` (wzorzec pmssb91 G-02) — INV-02/HUR-02/VAP-02 mierzą.
 *  - F-92/1 (flashback vs koszt many) ROZSTRZYGNIĘTY jako akceptowalny:
 *    ręka i flashback tej samej wypłaty mają IDENTYCZNĄ cenę (kotwica
 *    58/C32 w audyt-pmssb58-kombinacje) — koszt many celowo niewyceniany.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIUSZE, stan, decyzja } from '../tools/pmssb92-batch75-sonda.mjs';
import { execute, playerView } from '../src/engine/game-state.js';
import { declareAttackers, blockerDeclarationViolation } from '../src/engine/combat.js';

const scenariusz = (id) => {
  const s = SCENARIUSZE.find((x) => x.id === id);
  assert.ok(s, `brak scenariusza ${id} w sondzie`);
  return s;
};
const warianty = (id) => scenariusz(id).warianty.map((w) => ({ scen: scenariusz(id), w }));
const mierz = ({ scen, w }) => decyzja(scen.budowa(w));
const opcja = (m, frag) => m.opcje.find((o) => o.cmd === frag || o.cmd.startsWith(frag));
const score = (m, frag) => opcja(m, frag)?.score;

// ---------------------------------------------------------------------------
// 671TDM Coordinated Maneuver — F-92/2 (generyczna gałąź kwoty
// `creatures_you_control`; mutacyjna kotwica: bez gałęzi salwa była STAŁA).
// ---------------------------------------------------------------------------

test('CM-01 (C, F-92/2): przy 4 stworach salwa zabija, bot wybiera destroy enchantmentu', () => {
  const [w1] = warianty('CM-01');
  const m = mierz(w1);
  // 4 moje stworów: salwa 4 dmg = kill 2/2 reach (33,00), destroy = 84,00.
  assert.equal(score(m, 'cast_spell(cm-hand->wrog-3-3,m1)'), 84);
  assert.equal(score(m, 'cast_spell(cm-hand->wrog-3-3,m0)'), 33);
  assert.equal(m.wybrano, 'cast_spell(cm-hand->wrog-3-3,m1)');
});

test('CM-01 (C, F-92/2, mutacyjna kotwica): przy 1 stworze salwa NIE jest stała — zakaz poniżej passu', () => {
  const [, w2] = warianty('CM-01');
  const m = mierz(w2);
  // PRZED naprawą salwa była 84,00 STAŁE (kwota nieczytana) i wygrywała
  // z destroy przy 1 stworze. PO: 1 dmg nie zabija 2/2 → wycena salwy ≤ 0.
  const salwa = score(m, 'cast_spell(cm-hand->wrog-3-3,m0)');
  assert.ok(salwa != null && salwa <= 0, `salwa=${salwa} ma być zakazem (≤0), destroy wygrywa`);
  assert.equal(score(m, 'cast_spell(cm-hand->wrog-3-3,m1)'), 84);
  assert.equal(m.wybrano, 'cast_spell(cm-hand->wrog-3-3,m1)');
});

test('CM-02 (S): destroy na enchantment creature jest legalny i wyceniony (Fear 4/4) — nie „czar bez sensu"', () => {
  const [w] = warianty('CM-02');
  const m = mierz(w);
  assert.equal(m.wybrano, 'cast_spell(cm-hand->duzy,m1)');
  assert.equal(score(m, 'cast_spell(cm-hand->duzy,m1)'), 100);
  // Salwa 1 dmg w 4/4 = nieletalny chip → zakaz (≤0).
  assert.ok(score(m, 'cast_spell(cm-hand->duzy,m0)') <= 0);
});

test('M431-suffix (mutacyjna kotwica): warianty trybów CM są rozróżnialne w śladzie', () => {
  const [w1] = warianty('CM-01');
  const m = mierz(w1);
  const tryby = m.opcje.filter((o) => o.cmd.includes('cast_spell(cm-hand->wrog-3-3'))
    .map((o) => o.cmd);
  assert.ok(tryby.some((c) => /,m0\)$/.test(c)), `brak sufiksu trybu salwy: ${tryby.join(' | ')}`);
  assert.ok(tryby.some((c) => /,m1\)$/.test(c)), `brak sufiksu trybu destroy: ${tryby.join(' | ')}`);
});

// ---------------------------------------------------------------------------
// 666KHM Undersea Invader + 668WWK Battle Hurda + 670THS Vaporkin —
// harness blokowy (wzorzec pmssb91 G-02): deklaracja przy declare_attackers,
// potem jump do declare_blockers; atakujący z katalogu (grollub 3/3,
// grizzled 4/4, nefarious-imp 2/1 flying).
// ---------------------------------------------------------------------------

test('INV-02 (S): Invader tapnięty (wszedł w tej turze) nie blokuje; nietapnięty blokuje 3/3 bez straty', () => {
  const [tap, kontrola] = warianty('INV-02');
  const mTap = mierz(tap);
  assert.equal(mTap.wybrano, 'block[]');
  const mKontrola = mierz(kontrola);
  assert.equal(mKontrola.wybrano, 'block[atk-3-3<inv-bf]');
  assert.ok((score(mKontrola, 'block[atk-3-3<inv-bf]') ?? 0) >= 10);
});

test('HUR-02 (S): first strike blokuje 3/3 za darmo (14); 4/4 — Hurda ginie, bot trzyma (oferta <0)', () => {
  const [dobra, zla] = warianty('HUR-02');
  const mDobra = mierz(dobra);
  assert.equal(mDobra.wybrano, 'block[atk-3-3<hurda-bf]');
  assert.ok((score(mDobra, 'block[atk-3-3<hurda-bf]') ?? 0) >= 10);
  const mZla = mierz(zla);
  assert.equal(mZla.wybrano, 'block[]');
  assert.ok((score(mZla, 'block[atk-4-4<hurda-bf]') ?? 0) < 0, 'blok samobójczy ma być karany');
});

test('VAP-01: opisane stany to faktycznie nieblokowalny lotnik oraz legalny latający bloker', () => {
  const [ground, flyer] = warianty('VAP-01');
  const first = ground.scen.budowa(ground.w);
  declareAttackers(first, 'p1', ['vap-bf']);
  for (const blocker of ['b1', 'b2']) {
    assert.ok(blockerDeclarationViolation(first, 'p2', { 'vap-bf': [blocker] }),
      `${blocker} NIE może blokować Vaporkina`);
  }
  const second = flyer.scen.budowa(flyer.w);
  declareAttackers(second, 'p1', ['vap-bf']);
  assert.equal(blockerDeclarationViolation(second, 'p2', { 'vap-bf': ['lotnik'] }), null,
    'latający bloker musi móc zablokować Vaporkina');
  // Kontrola anty-over-fix: nielatająca Dryada ma reach i BLOKUJE lotnika.
  const reach = ground.scen.budowa({ ...ground.w, poleWrog: [{ id: 'reach', karta: 'leafcrown-dryad' }] });
  declareAttackers(reach, 'p1', ['vap-bf']);
  assert.equal(blockerDeclarationViolation(reach, 'p2', { 'vap-bf': ['reach'] }), null);
});

test('VAP-02 (S): nielegalny blok ground NIE jest enumerowany; lotnik 2/1 — legalna wymiana', () => {
  const [ground, flyer] = warianty('VAP-02');
  const mGround = mierz(ground);
  assert.ok(!mGround.opcje.some((o) => o.cmd.includes('<vap-bf]')),
    `nielegalny blok w ofercie: ${JSON.stringify(mGround.opcje)}`);
  const mFlyer = mierz(flyer);
  assert.equal(mFlyer.wybrano, 'block[flyer<vap-bf]');
  assert.ok((score(mFlyer, 'block[flyer<vap-bf]') ?? 0) >= 5);
});

// ---------------------------------------------------------------------------
// 669MH2 Lightning Spear — SPE-01 wymagał przebudowy: equip {1} = „only as a
// sorcery" (CR 702.6b), beginning_of_combat nie jest oknem sorcery.
// ---------------------------------------------------------------------------

test('SPE-01 (C): equip {1} idzie na największego atakującego (4/4 → 21 > 1/1 → 15)', () => {
  const [w1, w2] = warianty('SPE-01');
  const m = mierz(w1);
  const duzy = score(m, 'activate_ability(spear-bf#0->duzy)');
  const maly = score(m, 'activate_ability(spear-bf#0->maly)');
  assert.ok(duzy != null && maly != null, `hosty w ofercie: ${JSON.stringify(m.opcje)}`);
  assert.ok(duzy > maly, `duzy=${duzy} ma być lepszy od maly=${maly}`);
  assert.equal(m.wybrano, 'activate_ability(spear-bf#0->duzy)');
  const mKontrola = mierz(w2);
  assert.equal(mKontrola.wybrano, 'activate_ability(spear-bf#0->maly)');
});

// ---------------------------------------------------------------------------
// 675OGW Kozilek's Translator — koszt życia {1} (TRA-01, rozstrzygnięty):
// aktywacja z zyskiem (mana 4) vs odmowa przy marnowaniu many i niskim życiu.
// ---------------------------------------------------------------------------

test('TRA-01 (K): {C} za 1 życia — dopłata przy mane 4; odmowa przy mane 0 i przy życiu 3', () => {
  const [w1, w2, w3] = warianty('TRA-01');
  const m1 = mierz(w1);
  assert.equal(m1.wybrano, 'activate_ability(tra-bf#0)');
  assert.equal(score(m1, 'activate_ability(tra-bf#0)'), 4);
  const m2 = mierz(w2);
  assert.equal(m2.wybrano, 'pass_priority');
  assert.ok((score(m2, 'activate_ability(tra-bf#0)') ?? 0) < 0);
  const m3 = mierz(w3);
  assert.equal(m3.wybrano, 'pass_priority');
  assert.equal(score(m3, 'activate_ability(tra-bf#0)'), -74);
});

// ---------------------------------------------------------------------------
// 672ELD Malevolent Noble (NOB-01) + 674PIP Mister Gutsy (GUT-02, token
// Junk) — aktywacje z kosztem ofiary: odmowa świadoma vs impulse z zyskiem.
// ---------------------------------------------------------------------------

test('NOB-01 (C): {2}+ofiara za +1/+1 w main1 — bot NIE aktywuje (pass 0 > aktywacje <0)', () => {
  const [w1] = warianty('NOB-01');
  const m = mierz(w1);
  assert.equal(m.wybrano, 'pass_priority');
  const aktywacje = m.opcje.filter((o) => o.cmd.includes('noble-bf#0') || o.cmd.includes('kand-0#0'));
  assert.ok(aktywacje.length > 0, `aktywacje mają być W OFERCIE (sonda mierzy odmowę): ${JSON.stringify(m.opcje)}`);
  for (const o of aktywacje) assert.ok(o.score < 0, `${o.cmd}=${o.score} ma być odmową`);
});

test('GUT-02 (K, token Junk): impulse aktywacja = jedyny ruch (+2) — też przy Outcasts w ręce', () => {
  for (const w of warianty('GUT-02')) {
    const m = mierz(w);
    assert.equal(m.wybrano, 'activate_ability(junk-bf#0)');
    assert.ok((score(m, 'activate_ability(junk-bf#0)') ?? 0) > 0);
  }
});

// GUT-02: dodatkowa kontrola stanu, nie wnioskujemy z samej etykiety.
test('GUT-02: ląd z Junk jest dostępny, lecz nie dopłaca Outcasts z dwóch many', () => {
  const [, w] = warianty('GUT-02');
  const state = w.scen.budowa(w.w);
  const commands = (p) => playerView(state, p).legalCommands;
  const junk = commands('p1').find(c => c.type === 'activate_ability' && c.objectId === 'junk-bf');
  assert.ok(junk);
  assert.equal(execute(state, junk).ok, true);
  for (let i = 0; i < 2; i += 1) {
    const p = state.turn.priorityPlayerId;
    const pass = commands(p).find(c => c.type === 'pass_priority');
    assert.ok(pass);
    assert.equal(execute(state, pass).ok, true);
  }
  const exiled = state.zones.exile.find(id => state.objects.get(id)?.cardId === 'basic-forest');
  assert.ok(exiled, 'wierzch biblioteki to Forest');
  const land = commands('p1').find(c => c.type === 'play_land' && c.objectId === exiled);
  assert.ok(land, 'Forest z wygnania można zagrać');
  assert.equal(execute(state, land).ok, true);
  assert.ok(!commands('p1').some(c => c.type === 'cast_permanent' && c.objectId === 'hand-grizzled-outcasts'),
    'dwie many i jeden zagrany ląd nie wystarczają na koszt pięć');
});

// ---------------------------------------------------------------------------
// 667FIN Gysahl Greens (GYS-02, F-92/1 rozstrzygnięty): oferta flashback
// istnieje; idle 7 many = jedyny ruch; spójność ręka/flashback (kotwica 58/C32).
// ---------------------------------------------------------------------------

test('GYS-02 (K): flashback z grobu jest w ofercie i wygrywa przy idle 7 many (pusta ręka)', () => {
  const [idle] = warianty('GYS-02');
  const m = mierz(idle);
  assert.equal(m.wybrano, 'cast_flashback(k-1->)');
  assert.ok((score(m, 'cast_flashback(k-1->)') ?? 0) > 0);
});

test('GYS-02 (K, F-92/1): ta sama wypłata z ręki i flashbacku ma tę samą wycenę', () => {
  const [zReki] = warianty('GYS-01');
  const [, zdrowa] = warianty('GYS-02');
  const m = mierz(zdrowa);
  const fb = score(m, 'cast_flashback(k-2->)');
  const greensZReki = score(mierz(zReki), 'cast_spell(hand-gysahl-greens->)');
  const outcasts = score(m, 'cast_permanent(hand-grizzled-outcasts)');
  assert.ok(fb != null && greensZReki != null, 'oba warianty Greens są w ofercie');
  // Kotwica 58/C32: porównujemy TĘ SAMĄ wypłatę, a nie inne stworzenie.
  assert.equal(fb, greensZReki, 'koszt many flashbacku nie jest odliczany');
  assert.ok(outcasts != null && fb > outcasts, `obecna decyzja: fb=${fb}, Outcasts=${outcasts}`);
  assert.equal(m.wybrano, 'cast_flashback(k-2->)');
});
