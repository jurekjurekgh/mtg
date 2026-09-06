// M312 (zgłoszenie właściciela z testów żywej gry, tor B): Village Rites —
// modal wyboru ofiary pokazywał SUROWE encje HTML:
//   „Rzuć: Village Rites (koszt &lt;span class="ms-group"&gt;…)”.
//
// Przyczyna (klasa L41/M104-A2 w nowym miejscu): etykiety wierszy od
// wywołującego (`labelOverride`) pochodzą z `commandLabel` i zawierają HTML
// ikon many (`manaCostHtml`) — ten sam kontrakt co opcje modala (M104/A2:
// „textContent pokazywał surowy <span…"). Panel akcji i lista opcji modala
// renderują je przez innerHTML, ale ścieżka wierszy kreatora (buttonsMode,
// okna rzutu) podawała je przez kanał `label` → `textContent` → przeglądarka
// pokazywała nieparse'owany markup.
//
// Naprawa: `addRow` przekazuje `labelOverride` kanałem `html` (innerHTML —
// markup powstaje u nas z escape'owanych nazw, ten sam poziom zaufania co
// M104/A2); zwykłe nazwy obiektów/graczy zostają tekstem (textContent).
import test from 'node:test';
import assert from 'node:assert/strict';

const VIEW = {
  playerId: 'p1',
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Bot' }],
  zones: { battlefield: [{ id: 'v1', cardId: 'hill-giant', controllerId: 'p1' }] },
};
const SESSION = { nameOf: (id) => id ?? '?', nameOfObject: (id) => id ?? '?', faceDownName: () => 'morph' };

const IKONA = '<span class="ms-group"><span class="ms ms-b">B</span></span>';

function withMiniDom(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false;
      this.type = ''; this.checked = false; this.name = '';
      this.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
    }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    // Przeglądarka zjada tagi: z markupu zostaje sam tekst.
    set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...n) { this.children = n.flat(); }
    addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
    click() {
      const input = this.tagName === 'input' ? this
        : (this.children ?? []).find((c) => c.tagName === 'input') ?? null;
      if (input && (input.type === 'checkbox' || input.type === 'radio')) {
        if (input.disabled) return;
        input.checked = input.type === 'radio' ? true : !input.checked;
        for (const l of input.listeners.change ?? []) l({ stopPropagation() {}, preventDefault() {} });
        return;
      }
      for (const l of this.listeners.click ?? []) l({});
    }
    all() { return [this, ...this.children.flatMap((c) => (c.all ? c.all() : [c]))]; }
    find(pred) { return this.all().find(pred); }
    findAll(pred) { return this.all().filter(pred); }
  }
  globalThis.document = globalThis.document ?? {};
  const old = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => new MiniEl(tag);
  try { return run(new MiniEl('div')); } finally {
    if (old) globalThis.document.createElement = old; else delete globalThis.document.createElement;
  }
}

test('M312/1: etykieta wiersza trybu przyciskowego z HTML ikon many renderuje się jako MARKUP, nie encje', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const plan = {
    type: 'cast_spell', buttonsMode: true, targets: [], hasX: false,
    rows: [{ id: 'opt-0', label: `Rzuć: Village Rites (koszt ${IKONA}) — poświęć Maritime Guard (Ty)` }],
  };
  const { host } = withMiniDom((root) => {
    renderMultiTargetWizard(root, {
      view: VIEW, session: SESSION, plan,
      commands: [{ type: 'cast_spell', playerId: 'p1', objectId: 'vr', targets: [] }],
      intro: 'Poświęć stwora — Village Rites',
      onComplete: () => {}, onCancel: () => {},
    });
    return { host: root };
  });
  const name = host.findAll((n) => String(n.className).includes('picker-name'))[0];
  assert.ok(name, 'wiersz etykiety wyrenderowany');
  assert.doesNotMatch(name.textContent, /&lt;|<span/,
    `markup nie trafia do tekstu wiersza (u właściciela: „koszt &lt;span…”): ${JSON.stringify(name.textContent)}`);
  assert.match(name.textContent, /koszt B\)/, 'po sparsowaniu zostaje czytelny tekst „koszt B)"');
});

test('M312/2 (ta sama ścieżka): okno rzutu (castWindow rows) renderuje etykiety jak markup', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const plan = {
    type: 'cast_spell', castWindowMode: true, targets: [], hasX: false,
    rows: [{ id: 'opt-0', label: `Rzut K1 (koszt ${IKONA})` }],
  };
  const { host } = withMiniDom((root) => {
    renderMultiTargetWizard(root, {
      view: VIEW, session: SESSION, plan,
      commands: [{ type: 'cast_spell', playerId: 'p1', objectId: 'k', targets: [] }],
      intro: 'Wybierz wariant:',
      onComplete: () => {}, onCancel: () => {},
    });
    return { host: root };
  });
  const name = host.findAll((n) => String(n.className).includes('picker-name'))[0];
  assert.ok(name);
  assert.doesNotMatch(name.textContent, /<span/, 'markup nie trafia do tekstu');
});

test('M312/3 (anty-over-fix): zwykłe wiersze (nazwy obiektów) zostają tekstem — wiersze radio/ptaszek bez labelOverride', async () => {
  const { renderMultiTargetWizard } = await import('../src/table/choice-request.js');
  const plan = {
    type: 'cast_spell', targets: ['v1'], minTargets: 1, maxTargets: 1,
  };
  const { host } = withMiniDom((root) => {
    renderMultiTargetWizard(root, {
      view: VIEW, session: SESSION, plan,
      commands: [{ type: 'cast_spell', playerId: 'p1', objectId: 'x', targets: ['v1'] }],
      onComplete: () => {}, onCancel: () => {},
    });
    return { host: root };
  });
  const name = host.findAll((n) => String(n.className).includes('picker-name'))[0];
  assert.ok(name);
  // objectOrPlayerName → tekst: mini-DOM pokazuje treść dosłownie.
  assert.match(name.textContent, /hill-giant/, 'nazwa obiektu w wierszu (tekst, bez markupu)');
});
