// =============================================================================
// M293 (2026-09-03, tura 14 — decyzja właściciela: „jeśli można te dwa ostatnie
// sparametryzować i obsłużyć tym samym wizardem, powinniśmy to zrobić dla
// czystości projektu — poza tym thicket-card brzmi bardzo blisko zabronionego
// kodu pod nazwaną kartę").
//
// Dwa dawne kreatory („obejrzyj i zdecyduj" oraz „zajrzyj → weź jeden land →
// reszta na spód") rysują teraz to samo: chipa z `src/table/picker.js` (kształt
// `chip`) i kroki z jednego silnika `renderPeekWizard`. Ten plik pinuje trzy
// rzeczy, których nie widać w testach behawioralnych dawnych kreatorów:
//   1. RYSUNEK ma jedno źródło (zero drugiego budowniczego listy chipów i zero
//      kopii przycisku „Zamknij"),
//   2. polityka klucza sondy jest JEDNA i policzalna — klik niesie klucz wtedy,
//      gdy po nim nie ma już żadnego kroku (naprawia to rozjazd dawnego
//      kreatora „weź land": przy jednej karcie pozostałej klik domykał wizard,
//      a klucza nie było),
//   3. warstwa rysująca NIE zna karty po imieniu (ADR 0002 / strażnik m212);
//      nazwy typu protokołu zostają i są długiem policzonym, nie tajemnicą.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { MiniEl, withDocument } from './harness/css-effective.js';

const { renderLookWizard, renderPeekPickOrderWizard, lookWizardKindOf } =
  await import('../src/table/choice-request.js');

const CARDS = [
  { id: 'l1', cardId: 'island', name: 'Island' },
  { id: 'l2', cardId: 'mountain', name: 'Mountain' },
  { id: 'l3', cardId: 'guard', name: 'Highland Game' },
];

/**
 * Scenariusz na stubie DOM-u. CAŁA interakcja musi dziać się w środku: każdy
 * klik przerenderowuje krok, a `picker.js` tworzy elementy przez
 * `document.createElement` (stąd pierwszy pomiar sypiący się poza `withDocument`
 * — nie był to błąd produktu, tylko harnesu).
 */
function scenariusz(uruchom) {
  return withDocument(() => {
    const host = new MiniEl('div');
    uruchom(host);
    return host;
  });
}

/** Treść pliku bez komentarzy — strażniki liczą KOD, nie prozę. */
const bezKomentarzy = (tekst) => tekst.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const findAll = (el, out = []) => {
  if (el) out.push(el);
  for (const child of el.children ?? []) findAll(child, out);
  return out;
};
const buttonsOf = (host) => findAll(host).filter((el) => el.tagName === 'button');
const buttonWith = (host, fragment) => {
  const btn = buttonsOf(host).find((b) => String(b.textContent).includes(fragment));
  assert.ok(btn, `brak przycisku z „${fragment}”; są: ${buttonsOf(host).map((b) => b.textContent).join(' | ')}`);
  return btn;
};
const buttonStarting = (host, prefix) => {
  const btn = buttonsOf(host).find((b) => String(b.textContent).trim().startsWith(prefix));
  assert.ok(btn, `brak przycisku „${prefix}”; są: ${buttonsOf(host).map((b) => b.textContent).join(' | ')}`);
  return btn;
};
const hasClass = (el, cls) => String(el.className).split(/\s+/).includes(cls);
const chipsOf = (host) => findAll(host).filter((el) => hasClass(el, 'look-wizard-card'));

// ---------------------------------------------------------------------------
// 1. jedno źródło rysunku
// ---------------------------------------------------------------------------

test('M293/1: chipa i stopkę rysuje WYŁĄCZNIE picker (zero drugiego budowniczego)', () => {
  const src = fs.readFileSync('src/table/choice-request.js', 'utf8');
  // Klasy haka wolno podać JEDEN raz (w silniku) — dawna para kreatorów miała
  // dwóch niezależnych budowniczych pętli chipów.
  const kod = bezKomentarzy(src);
  assert.equal((kod.match(/'look-wizard-card'/g) ?? []).length, 1,
    'budowniczy listy chipów może być tylko jeden — w renderPeekWizard');
  assert.equal((kod.match(/look-wizard-card-name/g) ?? []).length, 1,
    'hak klikalnej nazwy też pochodzi z jednego miejsca');
  assert.equal((kod.match(/choiceNode\([^)]*'div', 'look-wizard-card'/g) ?? []).length, 0,
    'żaden kreator nie składa chipa ręcznie — robi to renderPickerChipList');
  assert.match(src, /renderPickerChipList\(/, 'silnik woła wspólny rysownik chipów');
  assert.equal((kod.match(/Zamknij \(dokończysz później\)/g) ?? []).length, 0,
    'żaden kreator nie napisz-stopkuje sam — trzy kreatory (przeglądanie, walka, '
    + 'przydział obrażeń) miały identyczne cztery linie tego przycisku');
  const picker = fs.readFileSync('src/table/picker.js', 'utf8');
  assert.match(picker, /export function renderPickerCancel/,
    'stopka kreatora jest częścią komponentu wierszy, nie trzecią kopią');
  assert.equal((bezKomentarzy(picker).match(/Zamknij \(dokończysz później\)/g) ?? []).length, 1,
    'napis stopki żyje w jednym miejscu na całą warstwę stołu (komentarz wolno go wymienić)');
  // Hook `.look-wizard-cancel` wędrował z kopiami do kreatorów niemających nic
  // wspólnego z „look" — przycisk należy do rodziny `.picker-cancel`.
  for (const plik of ['src/table/choice-request.js', 'src/table/render.js', 'src/table/index.html']) {
    assert.equal((bezKomentarzy(fs.readFileSync(plik, 'utf8')).match(/look-wizard-cancel/g) ?? []).length, 0,
      `${plik}: zakaz przestarzałego haka .look-wizard-cancel`);
  }
});

test('M293/2: oba publiczne kreatorzy to adaptery jednego silnika', () => {
  const src = fs.readFileSync('src/table/choice-request.js', 'utf8');
  const silnik = src.slice(src.indexOf('function renderPeekWizard('), src.indexOf('const LOOK_WIZARD_LABELS'));
  assert.ok(silnik.length > 3000, `silnik niesie wspólne kroki (ma ${silnik.length} znaków)`);
  for (const krok of ['stepGate', 'stepDecide', 'stepPick', 'stepOrder', 'renderCancel', 'decideKey', 'pickKey', 'finalView']) {
    assert.match(silnik, new RegExp(`${krok} =`), `krok ${krok} musi mieszkać w silniku, nie w kreatorze`);
  }
  for (const nazwa of ['renderLookWizard', 'renderPeekPickOrderWizard']) {
    const i = src.indexOf(`export function ${nazwa}(`);
    assert.ok(i > 0, `${nazwa} istnieje`);
    const dalej = src.indexOf('\nexport function', i + 10);
    const body = src.slice(i, dalej > 0 ? dalej : undefined);
    assert.match(body, /renderPeekWizard\(host,/, `${nazwa} jest adapterem silnika, nie rysownikiem`);
    assert.equal((body.match(/choiceNode\(/g) ?? []).length, 0,
      `${nazwa} nie rysuje niczego samodzielnie`);
  }
});

test('M293/3: chip w DOM-ie to rodzina picker-chip + hak kreatora, bez inputów', () => {
  scenariusz((host) => {
    renderLookWizard(host, { kind: 'scry', cards: CARDS, onComplete: () => {}, onOpenCard: () => {} });
    const chips = chipsOf(host);
    assert.equal(chips.length, 3, 'trzy obejrzane karty = trzy chipy');
    for (const [i, chip] of chips.entries()) {
      assert.ok(hasClass(chip, 'picker-chip'), `chip ${i} należy do rodziny .picker-chip`);
      assert.ok(!hasClass(chip, 'picker-row'), 'chip ŚWIADOMIE nie jest wierszem 44 px (to pigułka w linii)');
      assert.ok(hasClass(chip, 'look-wizard-card'), 'hak kreatora zostaje na elemencie');
      assert.equal(chip.find((el) => el.tagName === 'input'), undefined, 'chip nie lepi inputu');
    }
    // M87: każdy chip zaczyna się od nowej linii + numeru — bez tego body skleja
    // nazwy („Curate2. Woolly").
    assert.match(chips[1].textContent, /^\n2\. /, 'numer chipa zaczyna się od znaku nowej linii');
    assert.match(chips[0].textContent, /Island/, 'nazwa w chipie');
  });
});

// ---------------------------------------------------------------------------
// 2. polityka klucza sondy — jedna reguła dla obu rodzin
// ---------------------------------------------------------------------------

test('M293/4: klucz sondy niesie klik DOMYKAJĄCY, nie „ostatni w kroku" (scry, 2 karty)', () => {
  scenariusz((host) => {
    const seen = [];
    renderLookWizard(host, {
      kind: 'scry',
      cards: [CARDS[0], CARDS[1]],
      onComplete: () => {},
      probeKeyFor: (built) => { seen.push(built); return `k:${JSON.stringify(built)}`; },
    });
    // Pierwsza z dwóch decyzji: po niej jest jeszcze krok → bez klucza.
    assert.equal(buttonWith(host, 'Na spód biblioteki').dataset.optionKey, undefined,
      'krok pośredni bez klucza');
    buttonWith(host, 'Na spód biblioteki').click();
    // Ostatnia karta wysłana na spód → nic nie zostaje na wierzchu → sorter nie
    // pyta → to kliknięcie zamyka wizard i zna całą komendę.
    const good = buttonWith(host, 'Zostaw na wierzchu');
    assert.ok(good.dataset.optionKey, 'klucz na kliknięciu domykającym');
    assert.match(good.dataset.optionKey, /bottomIds/, 'klucz opisuje realną komendę (spód)');
    assert.equal(seen.length, 2,
      'każda opcja kroku domykającego niesie SWÓJ klucz (to dwie różne, ale pełne komendy)');
  });
});

test('M293/5: sorter kolejności ma klucz na OSTATNIM kliknięciu i tylko tam', () => {
  scenariusz((host) => {
    renderLookWizard(host, {
      kind: 'index',
      cards: CARDS,
      onComplete: () => {},
      probeKeyFor: (built) => `k:${JSON.stringify(built)}`,
    });
    assert.equal(buttonStarting(host, '1. na wierzchu: Island').dataset.optionKey, undefined,
      'pierwsza z trzech bez klucza');
    buttonStarting(host, '1. na wierzchu: Island').click();
    assert.equal(buttonStarting(host, '2. na wierzchu: Mountain').dataset.optionKey, undefined,
      'druga z trzech bez klucza');
    buttonStarting(host, '2. na wierzchu: Mountain').click();
    assert.ok(buttonStarting(host, '3. na wierzchu: Highland Game').dataset.optionKey,
      'ostatnia pozycja = pełna permutacja = klucz');
  });
});

test('M293/6: „zajrzyj → weź land" — rezygnacja ma klucz, wybór przy pełnym sorterze nie', () => {
  scenariusz((host) => {
    renderPeekPickOrderWizard(host, {
      cards: CARDS,
      basicLandIds: ['l1', 'l2'],
      sourceName: 'Źródło decyzji',
      onComplete: () => {},
      onCancel: () => {},
      probeKeyFor: (built) => `k:${JSON.stringify(built)}`,
    });
    const decline = buttonWith(host, 'Zrezygnuj');
    assert.ok(decline.dataset.optionKey, 'rezygnacja domyka decyzję — klucz musi być');
    assert.match(decline.dataset.optionKey, /skip/, 'klucz rezygnacji opisuje skip, nie wybór');
    buttonWith(host, 'Zaglądnij').click();
    assert.equal(buttonWith(host, 'na wierzch biblioteki').dataset.optionKey, undefined,
      'po wyborze zostaje sorter (reszta kart) — komenda jeszcze nieznana');
  });
});

test('M293/7: naprawiony rozjazd — wybór landa DOMYKAJĄCY wizard niesie klucz (1 karta do odłożenia)', () => {
  scenariusz((host) => {
    const wyslane = [];
    renderPeekPickOrderWizard(host, {
      cards: [CARDS[0], CARDS[1]],
      basicLandIds: ['l1'],
      onComplete: (built) => wyslane.push(built),
      probeKeyFor: (built) => `k:${JSON.stringify(built)}`,
    });
    buttonWith(host, 'Zaglądnij').click();
    const pick = buttonStarting(host, 'Island na wierzch');
    assert.ok(pick.dataset.optionKey,
      'sorter nie zapyta (zostaje jedna karta), więc ten klik zna całą komendę — '
      + 'przed M293 klucza tu nie było, choć komenda była znana');
    pick.click();
    assert.deepEqual(wyslane, [{ chosenCardId: 'l1', bottomOrder: ['l2'] }],
      'payload onComplete i klucz opisują tę samą komendę');
  });
});

// ---------------------------------------------------------------------------
// 3. szczelność zachowań przeniesionych do silnika
// ---------------------------------------------------------------------------

test('M293/8: przed „Zaglądnij" UI nie zna żadnej nazwy karty (M260/A1 — rezygnacja nie może być pozorna)', () => {
  scenariusz((host) => {
    renderPeekPickOrderWizard(host, {
      cards: CARDS, basicLandIds: ['l1'], sourceName: 'Źródło', onComplete: () => {},
    });
    const txt = String(host.textContent);
    for (const card of CARDS) {
      assert.ok(!txt.includes(card.name), `krok decydujący o patrzeniu nie może zdradzać „${card.name}"`);
    }
    assert.match(txt, /Zaglądnij/, 'samo zaglądanie jest opcją');
    assert.match(txt, /Źródło/, 'nazwa źródła decyzji pochodzi z danych (M201/F)');
  });
});

test('M293/9: dopisek i znacznik chipa pochodzą z modelu (basic land, pozycja spodu)', () => {
  scenariusz((host) => {
    renderPeekPickOrderWizard(host, {
      cards: CARDS, basicLandIds: ['l1', 'l2'], onComplete: () => {}, onCancel: () => {},
    });
    buttonWith(host, 'Zaglądnij').click();
    let chips = chipsOf(host);
    assert.equal(chips.length, 3, 'lista obejrzanych po zajrzeniu');
    assert.match(chips[0].textContent, / · basic land/, 'eligibilne karty są oznaczone');
    assert.ok(!/basic land/.test(chips[2].textContent), 'nie-land nie jest oznaczony');
    buttonStarting(host, 'Island na wierzch').click();
    chips = chipsOf(host);
    assert.match(chips[0].textContent, /→ wierzch/, 'wybrana karta oznaczona na wierzchu');
    assert.ok(!/→ spód \(/.test(chips[1].textContent), 'przed kliknięciem kolejność spodu nieustalona');
    buttonStarting(host, '1. na spód: Highland Game').click();
    chips = chipsOf(host);
    assert.match(chips[2].textContent, /→ spód \(1\.\)/, 'sorter pokazuje przypisaną pozycję');
  });
});

test('M293/10: krok „która karta" i brak kart mają jedno źródło textu', () => {
  scenariusz((host) => {
    renderLookWizard(host, { kind: 'surveil', cards: CARDS, onComplete: () => {} });
    assert.match(String(host.textContent), /Karta 1 z 3: Island/,
      'M149: komunikat enumeruje konkretną kartę i jej pozycję');
    assert.match(String(host.textContent), /Surveil 3 — obejrzane karty:/, 'nagłówek listy nosi nazwę trybu');
  });
  scenariusz((host) => {
    renderPeekPickOrderWizard(host, { cards: [], basicLandIds: [], onComplete: () => {} });
    assert.match(String(host.textContent), /Brak kart do decyzji\./, 'pusta lista = komunikat z silnika rysownika');
  });
});

test('M293/11: RYSOWANIE nie zna karty po imieniu (ADR 0002); protokół — dług policzony', () => {
  const picker = fs.readFileSync('src/table/picker.js', 'utf8');
  assert.deepEqual(bezKomentarzy(picker).match(/[Ff]ertile|thicket/gi) ?? [], [],
    'picker nie może znać żadnej rodziny kart — jest komponentem');
  // Kreator rysujący (od silnika w dół pliku) też nie: nazwa karty przychodzi
  // JEDYNYM kanałem, przez parametr `sourceName` z danych. ROUTING wyżej wolno
  // rozgałęziać się po polu widoku (`pendingFertileThicket`) — to protokół.
  const src = fs.readFileSync('src/table/choice-request.js', 'utf8');
  const rysowanie = bezKomentarzy(src.slice(src.indexOf('function renderPeekWizard(')));
  assert.deepEqual(rysowanie.match(/thicket/gi) ?? [], [],
    'rysowanie wyborów nie może rozpoznawać karty po imieniu');
  assert.match(src.slice(0, src.indexOf('function renderPeekWizard(')), /pendingFertileThicket/,
    'dokumentalnie: rozgałęzienie zostaje TYLKO w rozpoznaniu decyzji z widoku');
  // Dług zostaje w PROTOKOLE i silniku i jest policzony, żeby nikt nie udawał,
  // że go nie ma: typ komendy `resolve_fertile_thicket` żyje w 8 plikach src, a
  // COMMAND_TYPES jest zapisywany w partii — renama wymaga migracji
  // autosave/replay, więc idzie osobną decyzją (docs/backlog.md §2, §18 raportu).
  const pliki = ['src/engine/game-state.js', 'src/protocol/types.js', 'src/engine/effects.js',
    'src/engine/fingerprint.js', 'src/table/render.js', 'src/table/session.js', 'src/table/main.js',
    'src/table/choice-request.js'];
  const suma = pliki
    .reduce((acc, f) => acc + (fs.readFileSync(f, 'utf8').match(/fertile_thicket|FertileThicket/g) ?? []).length, 0);
  assert.ok(suma >= 40, `odwołania protokołowe do nazwy karty: ${suma} (oczekiwane ≥40) — liczba idzie do §18`);
});

test('M293/12: routing decyduje po CZYNNOŚCI, nie po karcie', () => {
  const options = [
    { type: 'resolve_fertile_thicket', playerId: 'p1', skip: true },
    { type: 'resolve_fertile_thicket', playerId: 'p1', chosenCardId: null },
  ];
  const view = { playerId: 'p1', pendingFertileThicket: { playerId: 'p1', cards: [{ id: 'fa' }] } };
  assert.equal(lookWizardKindOf({ options }, view), 'peek-pick',
    'klucz routingu nazywa czynność (było „fertile" od nazwy karty)');
  assert.equal(lookWizardKindOf({ options }, { playerId: 'p1' }), null,
    'bez danych widoku — zwykła lista opcji (fallback)');
});
