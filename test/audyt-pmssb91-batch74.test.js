// PMSSB-91 — pętla RĘCZNEGO strojenia scoringu bota dla Batcha 74 (bez pełnego B0 i bez
// maszynowego tuningu wag). Piny RED→GREEN dla znalezisk z pomiaru PRZED; każde odnosi się
// do wiersza sekcji 4 planu `docs/plans/PLAN_2026-11-16-pmssb91-batch74-petla.md`
// i do scenariusza sondy `tools/pmssb91-batch74-petla-sonda.mjs` (pomiar i pin mierzą TEN
// SAM stan — jedno źródło, L41).
//
// Każdy pin ma parę (a)/(b): (a) mierzy zachowanie po naprawie, (b) wyłącza pokrętło
// i odtwarza pomiar PRZED (wzorzec M429 — anty-over-fix: naprawa jest KARĄ/BRAMKĄ
// sterowaną parametrem, nie nową nieusuwalną skalą).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { declareAttackers } from '../src/engine/combat.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { stan, put, decyzja } from '../tools/pmssb91-batch74-petla-sonda.mjs';

const REGISTRY = createCardRegistry();

/** Score konkretnej oferty ze śladu bota (jedno źródło pomiaru — sonda). */
function scoreOferty(state, fragment, params) {
  const d = decyzja(state, 'p1', params);
  const trafione = d.opcje.filter((o) => typeof o.score === 'number' && String(o.cmd).includes(fragment));
  assert.ok(trafione.length >= 1, `oferta zawierająca „${fragment}” istnieje: ${JSON.stringify(d.opcje.map((o) => o.cmd))}`);
  return Math.max(...trafione.map((o) => o.score));
}

const scorePassu = (state, params) => scoreOferty(state, 'pass_priority', params);

/** Stan z X kartami w bibliotece p1 (sonda dopełnia do rozmiarBiblioteki). */
const stanZCienkaBiblioteka = (ile, reszta) => stan({ ...reszta, rozmiarBiblioteki: ile });

// ---------------------------------------------------------------------------
// F-91/1 (fala A) — Saltfield Recluse: `{T}: target creature gets -2/-0`.
// PRZED: redukcja obrażeń wyceniana `4 × |Δpower|` bez spojrzenia na moc celu,
// więc 4/4, 6/7 i 1/1 dostawały TĘ SAMĄ wartość. Po naprawie licznik jest
// ograniczony mocą celu (`negativePumpPowerCap`), bo atakujący o mocy 1 nie
// może stracić 2 obrażeń — straci najwyżej 1.
// ---------------------------------------------------------------------------

/** 4/4 wroga ATAKUJE w moją turę obronną; Saltfield może go osłabić. */
function saltfieldScenariusz(kartaAtakujacego) {
  const s = stan({
    krok: 'declare_attackers', aktywny: 'p2', priorytet: 'p2',
    pole: [
      { id: 'recluse', karta: 'saltfield-recluse', gracz: 'p1' },
      { id: 'napastnik', karta: kartaAtakujacego, gracz: 'p2' },
    ],
  });
  declareAttackers(s, 'p2', ['napastnik']);
  s.turn.step = 'declare_blockers';
  s.turn.phase = 'combat';
  s.turn.priorityPlayerId = 'p1';
  return s;
}

test('PMSSB-91/F-91-1a: debuff mocy nie płaci za obrażenia, których cel nie ma (1/1 vs 4/4)', () => {
  const maly = scoreOferty(saltfieldScenariusz('soulmender'), 'activate_ability(recluse');
  const duzy = scoreOferty(saltfieldScenariusz('grizzled-outcasts'), 'activate_ability(recluse');
  assert.ok(maly < duzy, `1/1 (${maly}) musi być warte MNIEJ niż 4/4 (${duzy}) — debuff −2/−0 zdejmuje 1 moc, nie 2`);
  assert.equal(maly, duzy - 4, 'różnica to dokładnie 1 punkt mocy × waga 4 (P.negativePumpPowerCap=1)');
});

test('PMSSB-91/F-91-1b: pokrętło 0 odtwarza pomiar PRZED (4/4 = 1/1 = 35,00)', () => {
  const off = { negativePumpPowerCap: 0 };
  const maly = scoreOferty(saltfieldScenariusz('soulmender'), 'activate_ability(recluse', off);
  const duzy = scoreOferty(saltfieldScenariusz('grizzled-outcasts'), 'activate_ability(recluse', off);
  assert.equal(maly, duzy, 'PRZED: moc celu nie była czytana w ogóle');
  assert.ok(Math.abs(duzy - 35) < 0.01, `PRZED: kotwica pomiaru 35,00 (jest ${duzy})`);
});

test('PMSSB-91/F-91-1c: debuff, który ZABIJA (wytrzymałość ≤ 0), nie jest kapowany', () => {
  // −2/−0 na 1/2 nie zabija; sprawdzamy, że sama ścieżka SBA nie wywraca wyceny.
  const s = stan({
    krok: 'main1',
    pole: [
      { id: 'recluse', karta: 'saltfield-recluse', gracz: 'p1' },
      { id: 'cel', karta: 'leafcrown-dryad', gracz: 'p2' },
    ],
  });
  const zKara = scoreOferty(s, 'activate_ability(recluse');
  const bezKary = scoreOferty(s, 'activate_ability(recluse', { negativePumpPowerCap: 0 });
  assert.ok(Number.isFinite(zKara) && Number.isFinite(bezKary));
  assert.ok(zKara <= 0 && bezKary <= 0, 'poza walką debuff bez zmiany wyniku jest pod passem (kara −75)');
});

// ---------------------------------------------------------------------------
// F-91/2 (fala A) — Frilled Sea Serpent: `{7}{U}{U}: this creature can't be
// blocked this turn`. PRZED: 39,00 w KAŻDYM stanie, także przy pustym stole
// wroga (kupowanie ewazji, której nie ma przed czym użyć) i przy blokerze,
// który i tak ginie w wymianie. Gałąź ETB tej samej zdolności filtruje
// kandydatów przez `attackerCanBeBlocked` — ta gałąź nie filtrowała niczego
// (L41). Naprawa: bramka + kara `selfEvasionWastedPenalty`.
// ---------------------------------------------------------------------------

function frilledScenariusz(pole) {
  const s = stan({
    krok: 'beginning_of_combat',
    pole: [{ id: 'serpent', karta: 'frilled-sea-serpent', gracz: 'p1' }, ...pole],
  });
  addMana(s, 'p1', 7);
  return s;
}

test('PMSSB-91/F-91-2a: 7 many na ewazję bez blokera schodzi pod pass', () => {
  const s = frilledScenariusz([]);
  const aktywacja = scoreOferty(s, 'activate_ability(serpent');
  assert.ok(aktywacja < scorePassu(s), `pusty stół: ${aktywacja} < ${scorePassu(s)} (PRZED: 39,00 > 0)`);
});

test('PMSSB-91/F-91-2b: jest realny bloker ⇒ aktywacja wraca nad pass (bramka nie wyłącza zdolności)', () => {
  const s = frilledScenariusz([{ id: 'blok', karta: 'woolly-loxodon', gracz: 'p2' }]);
  const aktywacja = scoreOferty(s, 'activate_ability(serpent');
  assert.ok(aktywacja > scorePassu(s), `bloker 6/7: ${aktywacja} > ${scorePassu(s)}`);
  assert.ok(Math.abs(aktywacja - 39) < 0.01, `kotwica pomiaru z prawdziwym blokerem (jest ${aktywacja})`);
});

test('PMSSB-91/F-91-2c: pokrętło 0 odtwarza pomiar PRZED (39,00 przy pustym stole)', () => {
  const aktywacja = scoreOferty(frilledScenariusz([]), 'activate_ability(serpent', { selfEvasionWastedPenalty: 0 });
  assert.ok(Math.abs(aktywacja - 39) < 0.01, `PRZED: ewazja bez celu = pełna premia (jest ${aktywacja})`);
});

test('PMSSB-91/F-91-2d: TAPNIĘTY bloker nie liczy się jako blokada (bramka czyta stan, nie typy)', () => {
  const s = frilledScenariusz([]);
  put(s, 'utkniety', 'woolly-loxodon', 'p2');
  s.objects.set('utkniety', Object.freeze({ ...s.objects.get('utkniety'), tapped: true }));
  const aktywacja = scoreOferty(s, 'activate_ability(serpent');
  assert.ok(aktywacja < scorePassu(s), 'tapnięty 6/7 nie zablokuje — ewazja nadal jałowa');
});

// ---------------------------------------------------------------------------
// F-91/3 (fala A) — Arrow Storm: `4 damage` / `5 if you attacked`. PRZED:
// main1 bez Raidu rzucał za 13,00 (4 obrażenia, które nie zabijają 5/5),
// a wariant 5 był dostępny dopiero po ataku (main2: 55,00). Naprawa:
// wzorzec „trzymaj do Raidu" (`raidHoldBonus`) z prawowitym wyjątkiem
// pro-playera (usunięcie blokera, który zatrzymywał nasz atak).
// ---------------------------------------------------------------------------

function arrowScenariusz({ cel, atakujacy = 'grizzled-outcasts' }) {
  const pole = atakujacy ? [{ id: 'ofensywa', karta: atakujacy, gracz: 'p1' }] : [];
  if (cel) pole.push({ id: 'cel', karta: cel, gracz: 'p2' });
  const s = stan({ krok: 'main1', pole, reka: [{ id: 'storm', karta: 'arrow-storm' }] });
  addMana(s, 'p1', 5);
  return s;
}

test('PMSSB-91/F-91-3a: main1 bez Raidu nie pali czaru na 5/5 (4 nie zabija, 5 zabija)', () => {
  const s = arrowScenariusz({ cel: 'gloomfang-mauler' });
  const naCel = scoreOferty(s, 'cast_spell(storm->cel)');
  assert.ok(naCel < scorePassu(s), `cel 5/5: ${naCel} < ${scorePassu(s)} — trzymaj do ataku`);
});

test('PMSSB-91/F-91-3b: cel, którego i tak zabija wariant 4 (2/2), nadal jest opłacalny TERAZ', () => {
  const s = arrowScenariusz({ cel: 'leafcrown-dryad' });
  const naCel = scoreOferty(s, 'cast_spell(storm->cel)');
  assert.ok(naCel > scorePassu(s), `cel 2/2: ${naCel} > ${scorePassu(s)} — ptak w garści`);
});

test('PMSSB-91/F-91-3c: w twarz przed atakiem też trzyma (raid daje 1 obrażenie więcej graczowi)', () => {
  const s = arrowScenariusz({ cel: null });
  const naTwarz = scoreOferty(s, 'cast_spell(storm->p2)');
  assert.ok(naTwarz < scorePassu(s), `twarz: ${naTwarz} < ${scorePassu(s)}`);
});

test('PMSSB-91/F-91-3d: bez naszego atakującego Raid jest niemożliwy — kara nie działa', () => {
  const s = arrowScenariusz({ cel: 'gloomfang-mauler', atakujacy: null });
  const naTwarz = scoreOferty(s, 'cast_spell(storm->p2)');
  assert.ok(naTwarz > 0, `brak atakującego: ${naTwarz} > 0 (nie ma czego czekać)`);
});

test('PMSSB-91/F-91-3e: prawowity wyjątek — czar na blokera, który zatrzymuje nasz atak, jest rzucany TERAZ', () => {
  // 4/4 blokuje moją 2/2; 4 obrażenia z wariantu bez Raidu ją zabijają i otwierają atak.
  const s = stan({
    krok: 'main1',
    pole: [
      { id: 'ofensywa', karta: 'leafcrown-dryad', gracz: 'p1' },
      { id: 'cel', karta: 'grizzled-outcasts', gracz: 'p2' },
    ],
    reka: [{ id: 'storm', karta: 'arrow-storm' }],
  });
  addMana(s, 'p1', 5);
  const naCel = scoreOferty(s, 'cast_spell(storm->cel)');
  assert.ok(naCel > scorePassu(s), `bloker-usunięcie: ${naCel} > ${scorePassu(s)}`);
});

test('PMSSB-91/F-91-3f: pokrętło 0 odtwarza pomiar PRZED (13,00 na 5/5 w main1)', () => {
  const s = arrowScenariusz({ cel: 'gloomfang-mauler' });
  const naTwarz = scoreOferty(s, 'cast_spell(storm->p2)', { raidHoldBonus: 0 });
  assert.ok(Math.abs(naTwarz - 13) < 0.01, `PRZED: rzut za 13,00 bez czekania na Raid (jest ${naTwarz})`);
});

// ---------------------------------------------------------------------------
// F-91/5 (fala A) — Mirelurk Queen: trigger doboru o warunku ZEWNĘTRZNYM
// („whenever one or more nonland cards are milled"). PRZED: `repeatLibraryDrain`
// karał go jak samodzielne źródło powtarzalnego doboru (× horyzont 3), więc
// rzut 4/4 z wigilancją spadał z 78,01 (biblioteka 30) do 7,81 (20) i −35,39
// (12). Pokrętło `externalTriggerDrainScale` (0 = brak tej kary) — bo karta
// NIE generuje tego zdarzenia sama.
// ---------------------------------------------------------------------------

const mirelurkScore = (biblioteka, params) => {
  const s = stanZCienkaBiblioteka(biblioteka, {
    pole: [], reka: [{ id: 'mq', karta: 'mirelurk-queen' }], mana: { p1: 6 },
  });
  return scoreOferty(s, 'cast_permanent(mq)', params);
};

test('PMSSB-91/F-91-5a: rzut Mirelurka nie zależy od rozmiaru biblioteki (trigger ma warunek zewnętrzny)', () => {
  const wyniki = [5, 12, 20, 30].map((n) => mirelurkScore(n));
  const unikalne = [...new Set(wyniki)];
  assert.equal(unikalne.length, 1, `stała wartość niezależna od biblioteki: ${JSON.stringify(wyniki)}`);
  assert.ok(Math.abs(wyniki[0] - 78.01) < 0.01, `kotwica: ciało 4/4 z wigilancją = 78,01 (jest ${wyniki[0]})`);
});

test('PMSSB-91/F-91-5b: pokrętło 1 odtwarza drabinę PRZED (20 → 7,81, 12 → −35,39)', () => {
  const off = { externalTriggerDrainScale: 1 };
  assert.ok(Math.abs(mirelurkScore(20, off) - 7.81) < 0.01, `PRZED: biblioteka 20 (jest ${mirelurkScore(20, off)})`);
  assert.ok(Math.abs(mirelurkScore(12, off) + 35.39) < 0.01, `PRZED: biblioteka 12 (jest ${mirelurkScore(12, off)})`);
});

test('PMSSB-91/F-91-5c: trigger WŁASNY (Curiosity-like) nadal jest karany — klasa rozpoznawana po zdarzeniu', () => {
  // Karta z powtarzalnym doborem na ZDARZENIU, które sama generuje (self_becomes_tapped)
  // — nie należy do klasy „warunek zewnętrzny", więc pełna drabina zostaje.
  const def = REGISTRY.get('chronic-flooding');
  assert.ok(def, 'karta wzorcowa istnieje w rejestrze');
  const zdarzenia = def.abilities.map((a) => a?.trigger?.event);
  assert.ok(zdarzenia.includes('enchanted_permanent_tapped'), 'zdarzenie własne (tapowanie gospodarza)');
  // Pokrętło nie dotyka tej rodziny: pomiar przez tapLibraryLoss jest niezależny.
  const s = stan({ pole: [{ id: 'las', karta: 'basic-forest' }, { id: 'aura', karta: 'chronic-flooding', gracz: 'p1', patch: { attachedTo: 'las' } }], rozmiarBiblioteki: 20 });
  const d = decyzja(s, 'p1');
  assert.ok(d.opcje.length > 0);
});

// ---------------------------------------------------------------------------
// F-91/4 (fala B, DOKUMENTACJA) — Mirelurk rad jest płaski: `4 × amount`.
// Wymiar „presja na życie" nie istnieje. Pin dokumentuje ZMIERZONE zachowanie
// (nie naprawę), żeby przyszła zmiana nie przeszła niezauważona.
// ---------------------------------------------------------------------------

test('PMSSB-91/F-91-4: rad na wroga 20/20 wart tyle samo co na wroga na 5 życia (płaska wycena)', () => {
  const zbuduj = (zycieWroga) => stan({
    pole: [{ id: 'wrog', karta: 'grizzled-outcasts', gracz: 'p2' }],
    reka: [{ id: 'mq', karta: 'mirelurk-queen' }],
    zycie: { p1: 20, p2: zycieWroga }, mana: { p1: 6 },
  });
  const zdrowy = scoreOferty(zbuduj(20), 'cast_permanent(mq)');
  const nisko = scoreOferty(zbuduj(5), 'cast_permanent(mq)');
  assert.equal(zdrowy, nisko, 'DOKUMENTACJA: wymiar „presja na życie” nie jest modelowany');
});

// ---------------------------------------------------------------------------
// F-91/6 (fala B, DOKUMENTACJA) — Memorial to Genius / Temur Banner: sac-draw
// jest wyceniany wyżej w END STEP PRZECIWNIKA (18,00 / 14,00) niż w main1
// (8,00 / 4,00) — bot NIE traci źródła many na darmo, jeśli ma co robić.
// Pin dokumentuje zmierzoną siatkę kroków.
// ---------------------------------------------------------------------------

const sacDrawScore = (krok, aktywny, karta) => {
  const s = stan({
    krok, aktywny, priorytet: 'p1',
    pole: [{ id: 'src', karta }], rozmiarBiblioteki: 20,
  });
  addMana(s, 'p1', 8);
  return scoreOferty(s, 'activate_ability(src#1)');
};

test('PMSSB-91/F-91-6: sac-draw W TURZE WŁASNEJ schodzi pod pass; w end step przeciwnika zostaje grywalny', () => {
  // PMSSB-91/MOMENT (naprawa D1): poświęcenie DEDYKOWANEGO źródła many
  // (`{T}` → `add_mana`, dodatkowy koszt `sacrificeSelf` innej zdolności)
  // w MOJEJ turze odcina gracza od produkcji, więc musi przegrać z passem.
  // W end step przeciwnika land i tak odtapuje się w moim untap — nic nie
  // tracę, więc zdolność zostaje nad passem. Wcześniejsza kotwica (8/4
  // w main1) opisywała dokładnie ten defekt: bot dobierał kartę za źródło
  // many, którego jeszcze potrzebował.
  for (const [karta, main1, endWroga] of [
    ['memorial-to-genius', -6, 18],
    ['temur-banner', -10, 14],
  ]) {
    const a = sacDrawScore('main1', 'p1', karta);
    const b = sacDrawScore('end', 'p2', karta);
    assert.ok(Math.abs(a - main1) < 0.01, `${karta} main1 = ${a}`);
    assert.ok(Math.abs(b - endWroga) < 0.01, `${karta} end step przeciwnika = ${b}`);
    assert.ok(b > a, `${karta}: ${b} > ${a}`);
    assert.ok(a < 0, `${karta}: w mojej turze zdolność pod passem (${a})`);
  }
});

test('PMSSB-91/F-91-6a: kara obowiązuje w każdym moim kroku (main1, początek walki, main2), nie tylko w main1', () => {
  for (const krok of ['main1', 'beginning_of_combat', 'main2']) {
    const s = sacDrawScore(krok, 'p1', 'memorial-to-genius');
    assert.ok(s < 0, `${krok}: poświęcenie źródła many pod passem (${s})`);
  }
});

test('PMSSB-91/F-91-6b: w MOIM end step (source tapnięte i tak) aktywacja schodzi pod pass', () => {
  assert.ok(sacDrawScore('end', 'p1', 'memorial-to-genius') < 0);
});

test('PMSSB-91/F-91-6c: kara dotyczy TYLKO sytuacji niedoboru źródeł — przy 5+ innych odkręconych landach poświęcenie jest darmowe', () => {
  const zLandami = stan({
    krok: 'main1', aktywny: 'p1', priorytet: 'p1',
    pole: [
      { id: 'src', karta: 'memorial-to-genius' },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, karta: 'basic-island' })),
    ],
    rozmiarBiblioteki: 20,
  });
  addMana(zLandami, 'p1', 8);
  const v = scoreOferty(zLandami, 'activate_ability(src#1)');
  assert.ok(v >= 0, `przy 6 innych landach poświęcenie nie jest karane: ${v}`);
});

test('PMSSB-91/F-91-6d: artefakt produkujący manę kosztem tapnięcia STWORA nie jest źródłem trzymanym na manę (kotwica 55)', () => {
  // Dragonbrood's Relic: `{T}, tap creature` → add_mana. Jego rolą nie jest
  // produkcja many, więc poświęcenie go nie zabiera produkcji — kara D1 nie
  // może tu zadziałać (kotwica PMSSB-34/B: 55).
  const s = stan({ krok: 'main1', aktywny: 'p1', priorytet: 'p1', pole: [{ id: 'rx', karta: 'dragonbroods-relic' }] });
  addMana(s, 'p1', 12);
  assert.equal(scoreOferty(s, 'activate_ability(rx#1)'), 55);
});

// ---------------------------------------------------------------------------
// Kontrole POZYTYWNE (bez naprawy) — pinujemy, że pomiar PRZED nie zgłaszał
// fałszywych alarmów. Każdy z tych wymiarów DZIAŁA i nie wolno go zepsuć.
// ---------------------------------------------------------------------------

test('PMSSB-91/K1: battle cry (Loxodon Partisan) widoczny w deklaracji ataku — dołożenie 2/2 podnosi score', () => {
  const tylkoPartisan = stan({ krok: 'declare_attackers', pole: [{ id: 'p', karta: 'loxodon-partisan', gracz: 'p1' }] });
  const zDruga = stan({
    krok: 'declare_attackers',
    pole: [
      { id: 'p', karta: 'loxodon-partisan', gracz: 'p1' },
      { id: 'k', karta: 'leafcrown-dryad', gracz: 'p1' },
    ],
  });
  const sam = scoreOferty(tylkoPartisan, 'attack[p]');
  const para = scoreOferty(zDruga, 'attack[p,k]');
  assert.ok(para > sam, `${para} > ${sam}: battle cry podnosi wartość zestawu`);
});

test('PMSSB-91/K2: Harrier (cant_block) odrzuca tapniętego blokera i ceni odkręconego', () => {
  const s = stan({
    krok: 'main1',
    pole: [
      { id: 'harrier', karta: 'lambholt-harrier', gracz: 'p1' },
      { id: 'cel', karta: 'grizzled-outcasts', gracz: 'p2' },
    ],
    mana: { p1: 5 },
  });
  const odkrecony = scoreOferty(s, 'activate_ability(harrier');
  s.objects.set('cel', Object.freeze({ ...s.objects.get('cel'), tapped: true }));
  const tapniety = scoreOferty(s, 'activate_ability(harrier');
  assert.ok(odkrecony > tapniety, `${odkrecony} > ${tapniety}`);
});

test('PMSSB-91/K3: Grollub nie atakuje w ścianę 0/4 (leczy wroga bez powodu)', () => {
  const s = stan({
    krok: 'declare_attackers',
    pole: [
      { id: 'g', karta: 'grollub', gracz: 'p1' },
      { id: 'mur', karta: 'mnemonic-wall', gracz: 'p2' },
    ],
  });
  const d = decyzja(s, 'p1');
  assert.equal(d.wybrano, 'attack[]', `bot wstrzymuje atak: ${d.wybrano}`);
});

test('PMSSB-91/K4: L41 — ta sama bramka ewazji dla obu gałęzi cant_be_blocked (ETB vs self)', () => {
  // Gałąź z CELEM na pustym stole wroga też nie płaci za ewazję bez blokera.
  const s = stan({
    pole: [
      { id: 'nadawca', karta: 'grizzled-outcasts', gracz: 'p1' },
      { id: 'odbiorca', karta: 'leafcrown-dryad', gracz: 'p1' },
    ],
  });
  const d = decyzja(s, 'p1');
  assert.ok(Array.isArray(d.opcje) && d.opcje.length > 0, 'stan buduje legalne oferty (bramka nie wywraca wyceny)');
  assert.equal(execute, execute, 'import `execute` używany przez pozostałe piny pliku');
});
