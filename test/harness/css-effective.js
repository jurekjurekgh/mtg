// Wspólna maszyneria testów wyglądu stołu (M293, wyciągnięta z `m129-*`).
//
// Po co: od tury 13 strażnicy dotyku liczą STYL EFEKTYWNY (klasy elementu →
// reguły z `src/table/index.html` → scalone deklaracje), bo test czytający
// TEKST CSS pilnuje duplikatu, nie faktu (lekcja L125). Żeby ten sam pomiar
// można było zrobić dla drugiej rodziny (chipy) bez wycinania trzeciej kopii
// kodu, maszyna mieszka tutaj.
//
// Uwaga na parser: komentarze są wycinane PRZED dzieleniem na reguły — bez
// tego reguła stojąca zaraz po bloku komentarza znika z listy i strażnik
// fałszywie zieloneje (przypadek z tury 13).
import fs from 'node:fs';

export const TABLE_HTML_PATH = 'src/table/index.html';

export function loadRules(path = TABLE_HTML_PATH) {
  const html = fs.readFileSync(path, 'utf8');
  const raw = (html.match(/<style>([\s\S]*?)<\/style>/) ?? ['', ''])[1];
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].replace(/\s+/g, ' ').trim(), body: m[2] }))
    .filter((r) => !r.selector.startsWith('@') && !r.selector.includes('/*'));
}

/** Klasy wskazane przez selektor jako OSTATNI człon (czyli to, co jest stylowane). */
export function subjectClasses(selector) {
  const last = selector.split(/[\s>]+/).filter(Boolean).pop() ?? '';
  const stripped = last.replace(/:has\([^)]*\)/g, '').replace(/::?[a-z-]+(\([^)]*\))?/g, '');
  return [...stripped.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
}

/**
 * Deklaracje, które realnie trafią na element o danej liście klas: reguła
 * aplikuje się, gdy WSZYSTKIE klasy jej przedmiotu są na elemencie; późniejsze
 * reguły wygrywają (kaskada w kolejności pliku).
 */
export function effectiveDeclarationsFor(rules, classList) {
  const tokens = new Set(String(classList).split(/\s+/).filter(Boolean));
  const merged = new Map();
  const matched = [];
  for (const rule of rules) {
    const subj = subjectClasses(rule.selector);
    if (subj.length === 0 || !subj.every((c) => tokens.has(c))) continue;
    matched.push(rule.selector);
    for (const decl of rule.body.split(';')) {
      const [prop, ...rest] = decl.split(':');
      const value = rest.join(':').trim();
      if (prop && value) merged.set(prop.trim(), value);
    }
  }
  return { decls: Object.fromEntries(merged), matched };
}

export function pxOf(decls, property) {
  const raw = decls[property];
  const m = typeof raw === 'string' ? raw.match(/(\d+(?:\.\d+)?)px/) : null;
  return m ? Number(m[1]) : null;
}

/** Jasność względna koloru #rrggbb (0 = czarny, 1 = biały). */
export function lightness(hex) {
  const v = parseInt(String(hex).slice(1), 16);
  const r = (v >> 16) & 255; const g = (v >> 8) & 255; const b = v & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Stub DOM-u w stylu reszty testów UI (bez jsdom — liczymy tylko klasy). */
export class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {}; this.className = '';
    this.text = ''; this.type = ''; this.checked = false; this.disabled = false; this.dataset = {};
    this.classList = { toggle: () => {}, add: () => {} };
  }

  set textContent(value) { this.text = String(value); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  set innerHTML(value) { this.text = String(value).replace(/<[^>]*>/g, ''); this.html = String(value); this.children = []; }

  get innerHTML() { return this.html ?? this.textContent; }

  appendChild(child) { this.children.push(child); return child; }

  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }

  fire(type, ev = { stopPropagation() {}, preventDefault() {} }) {
    for (const l of this.listeners[type] ?? []) l(ev);
  }

  click() { this.fire('click'); }

  descendants() {
    const out = [];
    const walk = (n) => { for (const c of n.children ?? []) { out.push(c); walk(c); } };
    walk(this);
    return out;
  }

  find(pred) { return this.descendants().find(pred); }

  findAll(pred) { return this.descendants().filter(pred); }
}

export const MIN_TOUCH_TARGET_PX = 44;

export function withDocument(fn) {
  const old = globalThis.document;
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  try {
    return fn();
  } finally {
    globalThis.document = old;
  }
}
