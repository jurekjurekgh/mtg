// =====================================================================
// REPRO zgłoszenia właściciela 2026-11-25 (seed 79892) na PRAWDZIWYM
// main.js (Mini-DOM jak table-ui.test.js): talie gracza/bota z jego
// logu (warhammer-wrg vs innistrad-wu), sekwencja jego decyzji.
// Cel: odpowiedzieć, czy modal „Rozgrywka" z nagłówkiem „Tura N —
// Nieprzyjaciel" OTWIERA SIĘ z pauzą na granicach tur 12 i 20.
// =====================================================================
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.text = '';
    this.html = '';
    this.value = '';
    this.disabled = false;
    this.attrs = {};
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  prepend(child) { this.children.unshift(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({}); }
  emit(type) { for (const fn of this.listeners[type] ?? []) fn({}); }
}

function installMiniDom() {
  const htmlIds = [...fs.readFileSync('src/table/index.html', 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const ids = ['selftest', 'seed', 'deck-human', 'deck-bot', 'new-game', 'notice', 'notice-body', 'notice-ok', 'notice-close',
    'banner', 'stack-zone', 'bf-enemy', 'bf-own', 'grave-enemy', 'grave-own', 'exile-zone', 'hand', 'actions', 'log',
    'card-preview', 'card-preview-body', 'card-preview-close', 'hover-preview', 'context-menu', 'context-menu-body',
    'context-menu-close', 'export-replay', 'import-replay', 'resume-replay', 'resume-save', 'autosave-info', 'shuffle-seed',
    'turn-indicator', 'life-own', 'life-enemy', 'library-own', 'library-enemy', 'meta-foe', 'meta-own', 'replay-out',
    'replay-summary', 'replay-download', 'replay-file', 'actions-drawer', 'actions-drawer-close', 'actions-fab',
    'actions-fab-count', 'turn-history', 'turn-history-count', 'turn-history-copy', 'turn-history-copy-all',
    'turn-history-select', 'daynight', 'undercity', 'poison', 'card-fullscreen', 'card-fullscreen-body',
    'card-fullscreen-close', 'choice-request', 'choice-request-body', 'choice-request-close', 'bot-move', 'bot-move-body',
    'bot-move-close', 'bot-move-ok', 'mana-wizard', 'mana-wizard-body', 'mana-wizard-close'];
  const registry = new Map([...new Set([...htmlIds, ...ids])].map((id) => [id, new MiniEl(`#${id}`)]));
  registry.get('seed').value = '13';
  const documentListeners = {};
  globalThis.document = {
    listeners: documentListeners,
    getElementById(id) { if (!registry.has(id)) throw new Error(`Mini-DOM: nieznane id ${id}`); return registry.get(id); },
    createElement: (tag) => new MiniEl(tag),
    createTextNode: (text) => ({ isText: true, text: String(text), get textContent() { return this.text; } }),
    addEventListener(type, fn) { (documentListeners[type] ??= []).push(fn); },
  };
  globalThis.window = { confirm: () => false, location: { href: 'http://localhost/?tester=1' } };
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => mem.clear(),
    _mem: mem,
  };
  return registry;
}

const dom = installMiniDom();
globalThis.REPO_DECKS = {
  'war': fs.readFileSync('decks/warhammer-wrg.txt', 'utf8'),
  'wu': fs.readFileSync('decks/innistrad-wu.txt', 'utf8'),
};
const { PREFS_KEY } = await import('../src/table/topbar-toggles.js');
globalThis.localStorage.setItem(PREFS_KEY, JSON.stringify({ sounds: false, hiGfx: true }));
await import('../src/table/main.js');

const textOf = (el) => el.textContent;
const walk = (el, acc = []) => { for (const c of el.children ?? []) { acc.push(c); walk(c, acc); } return acc; };

// --- zegar: obejście bramek odprysku (450/350 ms) — klik świadomy ---
// Zegar MOCK rośnie monotonicznie: modal otwarty pod mockiem (openedAt z
// przyszłości) musi dostać klik z zegara jeszcze dalej — stałe +600 od
// czasu rzeczywistego zatrzymywałoby się pod własnym openedAt (martwa pętla).
let mockClock = 0;
function timedClick(fn) {
  const base = Math.max(Date.now(), mockClock);
  mockClock = base + 600;
  mock.timers.enable({ apis: ['Date'] });
  mock.timers.setTime(mockClock);
  try { fn(); } finally { mock.timers.reset(); }
}

// --- sekwencja właściciela z logu (jego tury) ---
const HIS = new Map([
  [1, { lands: ['Forest'], casts: [] }],
  [3, { lands: ['Mountain'], casts: ['Cherished Hatchling'] }],
  [5, { lands: [], casts: ['Goblin Piker'], attack: 'Cherished Hatchling' }],
  [7, { lands: [], casts: ['Wooden Stake'] }],
  [9, { lands: [], casts: [], attack: 'Goblin Piker', equip: ['Wooden Stake', 'Goblin Piker'], attackFirst: true }],
  [11, { lands: [], casts: ['Goblin Piker'] }],
  [13, { lands: [], casts: [], equip: ['Wooden Stake', 'Goblin Piker'], attack: 'Goblin Piker', discard: 'Hobble' }],
  [15, { lands: [], casts: [], discard: 'Acidic Slime' }],
  [17, { lands: [], casts: [], discard: 'Gorehorn Minotaurs' }],
  [19, { lands: ['Mountain'], casts: [] }],
  [21, { lands: [], casts: ['Fireball'] }],
  [23, { lands: [], casts: [], discard: 'Irontread Crusher' }],
  [25, { lands: [], casts: [], discard: 'Goblin Battle Jester' }],
  [27, { lands: ['Forest'], casts: ['Hill Giant'] }],
]);
const progress = new Map();
function scriptFor(turn) {
  const s = HIS.get(turn);
  if (!s) return null;
  const st = progress.get(turn) ?? { landI: 0, castI: 0, equipped: false, attacked: false, discarded: false };
  progress.set(turn, st);
  return { s, st };
}

const headerSeen = new Map(); // 'Tura N — Nieprzyjaciel' → pause flag at modal open
const violations = [];
let lastModalText = '';

function recordModalOpen() {
  const body = textOf(dom.get('bot-move-body'));
  if (body === lastModalText) return;
  lastModalText = body;
  const pause = globalThis.window.__mtgDebug.botPausePending();
  for (const m of body.matchAll(/Tura \d+ — Nieprzyjaciel/g)) {
    if (!headerSeen.has(m[0])) headerSeen.set(m[0], pause);
  }
}

function currentTurn() {
  const m = textOf(dom.get('turn-indicator')).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function buttons() {
  return dom.get('actions').children.filter((c) => (c.listeners.click ?? []).length > 0 && !c.disabled);
}

test('seed 79892: modal pauzy tury przeciwnika na granicach (repro właściciela)', () => {
  dom.get('seed').value = '79892';
  dom.get('deck-human').value = 'war';
  dom.get('deck-bot').value = 'wu';
  dom.get('new-game').click();
  assert.doesNotMatch(dom.get('notice').className, /active/, textOf(dom.get('notice-body')));

  let seenWizard = 0;
  for (let i = 0; i < 4000; i += 1) {
    if (textOf(dom.get('banner')).includes('Koniec gry')) break;

    // 1) warstwa grafiki — jedno kliknięcie zegara poza oknem odprysku
    if (dom.get('art-showcase').className === 'art-showcase active') {
      timedClick(() => dom.get('art-showcase').click());
      continue;
    }
    // 2) modal „Rozgrywka" — zapis nagłówków + świadomy Rozumiem
    if (dom.get('bot-move').className === 'modal active') {
      recordModalOpen();
      timedClick(() => dom.get('bot-move-ok').click());
      continue;
    }
    // 3) choice-request: keep / discard / wizard ataku-bloków / cele
    if (dom.get('choice-request').className === 'modal active') {
      seenWizard += 1;
      const tree = walk(dom.get('choice-request-body'));
      const turn = currentTurn();
      const scr = scriptFor(turn);
      const script = scr?.s;
      const st = scr?.st;
      const pickByText = (re) => tree.find((el) => el.tagName === 'button' && re.test(el.textContent ?? '') && (el.listeners.click ?? []).length > 0);
      // wiersz-radio (label + input.change) + „Zatwierdź wybór”
      const confirmBtn = tree.find((el) => el.tagName === 'button' && /Zatwierdź/.test(el.textContent ?? '') && (el.listeners.click ?? []).length > 0);
      const rowBy = (re) => tree.find((el) => /picker-row/.test(String(el.className)) && re.test(el.textContent ?? ''));
      const selectRow = (row) => {
        const inp = tree.find((el) => el.tagName === 'input' && row.children.includes(el))
          ?? (row.children ?? []).find((c) => c.tagName === 'input');
        if (inp) {
          inp.checked = true;
          for (const fn of inp.listeners.change ?? []) fn({ target: inp });
        } else {
          row.click();
        }
        if (confirmBtn) confirmBtn.click();
      };
      // keep ręki
      const keepRow = rowBy(/Zatrzymaj rękę/);
      if (keepRow) { selectRow(keepRow); continue; }
      // odrzucenie przy limicie — nazwa karty ze skryptu
      if (script?.discard && !st.discarded) {
        const row = rowBy(new RegExp(script.discard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        if (row) { st.discarded = true; selectRow(row); continue; }
      }
      // wizard: Bez ataku / Bez bloków
      const clear = tree.find((el) => /combat-wizard-clear/.test(String(el.className)) && (el.listeners.click ?? []).length > 0);
      if (clear) { clear.click(); continue; }
      // cel kreatora (equip itp.)
      if (script?.equip && !st.equipped) {
        const tgt = pickByText(new RegExp(script.equip[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        if (tgt) { st.equipped = true; tgt.click(); continue; }
      }
      // pierwsza opcja jako fallback (z logowaniem)
      const opt = tree.find((el) => el.tagName === 'button' && /choice-request-option/.test(String(el.className)) && (el.listeners.click ?? []).length > 0);
      if (opt) { violations.push(`T${turn}: choice fallback „${(opt.text ?? '').slice(0, 60)}"`); opt.click(); continue; }
      const anyBtn = tree.find((el) => el.tagName === 'button' && (el.listeners.click ?? []).length > 0);
      if (anyBtn) { violations.push(`T${turn}: choice any „${(anyBtn.text ?? '').slice(0, 60)}"`); anyBtn.click(); continue; }
      dom.get('choice-request-close').click();
      continue;
    }
    // 4) kreator many
    if (dom.get('mana-wizard').className === 'modal active') {
      const tree = walk(dom.get('mana-wizard-body'));
      const confirm = tree.find((el) => /mana-wizard-confirm/.test(String(el.className)) && !el.disabled && (el.listeners.click ?? []).length > 0);
      if (confirm) { confirm.click(); continue; }
      const source = tree.find((el) => /mana-wizard-source/.test(String(el.className)) && (el.listeners.click ?? []).length > 0);
      if (source) { source.click(); continue; }
      const cancel = tree.find((el) => /Anuluj płatność/.test(el.text ?? ''));
      if (cancel) { cancel.click(); continue; }
      violations.push('mana-wizard bez akcji');
      break;
    }

    // 5) panel akcji — sekwencja właściciela
    const turn = currentTurn();
    const scr = scriptFor(turn);
    const script = scr?.s;
    const st = scr?.st;
    const btns = buttons();
    const byRe = (re) => btns.find((b) => re.test(b.textContent ?? ''));

    // mulligan startowy — w realnym UI bywa przyciskiem panelu akcji
    const mull = byRe(/Mulligan/);
    if (mull) { mull.click(); continue; }
    // sprzątanie: „Wybierz: Karta do odrzucenia” otwiera picker kart
    const discardAction = byRe(/Karta do odrzucenia/);
    if (discardAction) { discardAction.click(); continue; }

    if (script) {
      if (st.landI < script.lands.length) {
        const b = byRe(new RegExp(`Zagraj ląd: ${script.lands[st.landI]}`));
        if (b) { st.landI += 1; b.click(); continue; }
      }
      if (script.attackFirst && !st.attacked && script.attack) {
        const b = byRe(new RegExp(`Atak: ${script.attack}`));
        if (b) { st.attacked = true; b.click(); continue; }
      }
      if (st.castI < script.casts.length) {
        const name = script.casts[st.castI];
        const b = byRe(new RegExp(`(Zagraj|Rzuć): .*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        if (b) { st.castI += 1; b.click(); continue; }
      }
      if (script.equip && !st.equipped) {
        const b = byRe(new RegExp(`Aktywuj: ${script.equip[0]}`));
        if (b) { b.click(); continue; } // cel → choice-request wyżej
      }
      if (!script.attackFirst && !st.attacked && script.attack) {
        const b = byRe(new RegExp(`Atak: ${script.attack}`));
        if (b) { st.attacked = true; b.click(); continue; }
      }
    }
    // pass — reszta sama się przewinie
    const pass = byRe(/Dalej \(pass\)|^Pass/);
    if (pass) { pass.click(); continue; }
    // nic — koniec
    violations.push(`T${turn}: brak przycisku pass; actions=${btns.map((b) => b.textContent).slice(0, 6).join(' / ')}`);
    break;
  }

  // --- diagnostyka przed asercją ---
  console.log('  banner:', textOf(dom.get('banner')).slice(0, 80));
  console.log('  notice:', textOf(dom.get('notice')).slice(0, 120), '|', dom.get('notice').className);
  console.log('  choice:', dom.get('choice-request').className, '|', textOf(dom.get('choice-request-body')).slice(0, 120));
  console.log('  actions:', buttons().map((b) => b.textContent).slice(0, 8).join(' / '));
  console.log('  turn:', textOf(dom.get('turn-indicator')), '| art:', dom.get('art-showcase').className, '| move:', dom.get('bot-move').className);
  for (const v of violations.slice(0, 12)) console.log('    -', v);

  // --- asercje ---
  const logText = textOf(dom.get('log'));
  const botTurnCount = [...logText.matchAll(/Tura gracza Nieprzyjaciel/g)].length;
  const shown = [...headerSeen.entries()];
  const shownPaused = shown.filter(([, v]) => v === true);
  const shownUnpaused = shown.filter(([, v]) => v !== true);
  assert.ok(botTurnCount > 0, 'log nie zawiera tur przeciwnika');
  const missing = shownUnpaused.map(([k]) => `${k}(pause=false)`);
  if (shownPaused.length < botTurnCount) {
    missing.push(`pokazanych z pauzą ${shownPaused.length} < tur w logu ${botTurnCount}`);
  }
  console.log(`  tur bota w logu: ${botTurnCount}; nagłówki w modalach: ${shown.map(([k, v]) => `${k}→${v}`).join(' | ') || 'brak'}`);
  console.log(`  choice-wizard kliknięć: ${seenWizard}; naruszenia: ${violations.length}`);
  for (const v of violations.slice(0, 10)) console.log('    -', v);
  assert.deepEqual(missing, [],
    `nagłówki tur przeciwnika bez pauzy/pokazania: ${missing.join(', ')}`);
});
