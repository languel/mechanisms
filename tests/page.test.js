/* Smoke-test the page wiring without a browser.

   The page script is a module that talks to the DOM. This test gives it just
   enough of a DOM to run: elements that record their children and respond to
   the events the script dispatches, no WebGL (so the page takes its documented
   fallback path), and no layout. What it proves is that a mechanism page builds,
   renders its parameter panel, parts list, readouts and export card, and that
   the controls work — the parts of the page a headless check would cover. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.style = {};
    this.dataset = {};
    this.listeners = new Map();
    this.value = '';
    this._text = '';
    this.nodeType = 1;
    this.hidden = false;
    this.className = '';
    this.classList = {
      _set: new Set(),
      add: (c) => this.classList._set.add(c),
      remove: (c) => this.classList._set.delete(c),
      contains: (c) => this.classList._set.has(c),
    };
  }

  get childNodes() {
    const self = this;
    const nodes = [...this.children];
    if (self._text) nodes.unshift({ nodeType: 3, nodeValue: self._text });
    return nodes;
  }

  get firstChild() { return this.childNodes[0] || null; }

  get textContent() {
    return this._text + this.children.map((c) => c.textContent || '').join('');
  }

  set textContent(v) { this._text = String(v); this.children = []; }

  set innerHTML(v) { if (v === '') { this.children = []; this._text = ''; } else this._text = String(v); }
  get innerHTML() { return this._text; }

  append(...kids) {
    for (const k of kids) {
      if (k == null) continue;
      if (typeof k === 'string' || typeof k === 'number') {
        const node = new El('#text');
        node._text = String(k);
        this.children.push(node);
      } else this.children.push(k);
    }
  }

  appendChild(k) { this.append(k); return k; }

  remove() { this.removed = true; }

  setAttribute(k, v) { this.attributes.set(k, String(v)); if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  removeAttribute(k) { this.attributes.delete(k); }
  hasAttribute(k) { return this.attributes.has(k); }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  dispatch(type, event = {}) {
    for (const fn of this.listeners.get(type) || []) {
      fn({ target: this, currentTarget: this, preventDefault() {}, ...event });
    }
  }

  matches(sel) {
    return sel.startsWith('#') ? `#${this.id}` === sel : this.tagName === sel.toUpperCase();
  }

  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
  getContext() { return null; }             // no WebGL in Node: the fallback path
  setPointerCapture() {}
  releasePointerCapture() {}
  removeEventListener() {}
  addEventListenerIfMissing() {}
  get clientWidth() { return 800; }
  get clientHeight() { return 600; }
  focus() {}
  click() { this.dispatch('click', { currentTarget: this }); }
}

class Frag extends El {
  constructor() { super('#fragment'); }
}

function makeDom(slug) {
  const ids = new Map();
  const byId = (id) => {
    if (!ids.has(id)) {
      const el = new El(id === 'stage-canvas' ? 'canvas' : 'div');
      el.id = id;
      ids.set(id, el);
    }
    return ids.get(id);
  };

  for (const id of ['viewport', 'stage-canvas', 'tooltip', 'fallback', 'params', 'checks', 'explode',
    'steps', 'parts', 'part-detail', 'export', 'hardware-list', 'notes', 'title', 'tagline', 'kicker',
    'question', 'bigidea', 'readouts', 'play', 'scrub', 'speed', 'speed-out', 'ghost', 'hardware',
    'reset', 'angle', 'play-label']) {
    byId(id);
  }

  const document = {
    body: new El('body'),
    baseURI: pathToFileURL(path.join(ROOT, 'mechanisms', slug, 'index.html')).href,
    documentElement: new El('html'),
    title: '',
    querySelector(sel) {
      if (sel.startsWith('#')) return byId(sel.slice(1));
      if (sel.startsWith('output[for="')) return null;
      return null;
    },
    querySelectorAll() { return []; },
    getElementById: (id) => (ids.has(id) ? ids.get(id) : null),
    createElement: (tag) => new El(tag),
    createTextNode: (text) => {
      const n = new El('#text');
      n.nodeType = 3;
      n._text = String(text);
      return n;
    },
    createDocumentFragment: () => new Frag(),
    addEventListener() {},
  };
  document.body.dataset = { mechanism: slug, module: './mechanism.js' };
  return { document, byId };
}

// The page runs an animation loop. Switch it off and give it a frame to settle
// before the globals go away, so no callback fires against a torn-down DOM.
let rafEnabled = true;
const pending = new Set();
const raf = (fn) => {
  if (!rafEnabled) return 0;
  const id = setTimeout(() => { pending.delete(id); fn(performance.now()); }, 0);
  pending.add(id);
  return id;
};
const caf = (id) => { pending.delete(id); clearTimeout(id); };

const slug = 'crank-slider';
const { document, byId } = makeDom(slug);
const windowShim = {
  location: { href: `https://example.test/mechanisms/${slug}/` },
  history: { replaceState() {} },
  matchMedia: () => ({ matches: true, addEventListener() {} }),
  devicePixelRatio: 1,
  addEventListener() {},
  requestAnimationFrame: raf,
  cancelAnimationFrame: caf,
  URL,
  Blob: class { constructor(parts) { this.parts = parts; } },
};

const GLOBALS = {
  document,
  window: windowShim,
  matchMedia: windowShim.matchMedia,
  requestAnimationFrame: raf,
  cancelAnimationFrame: caf,
  IntersectionObserver: class { observe() {} disconnect() {} },
  ResizeObserver: class { observe() {} disconnect() {} },
  URL,
  Blob: windowShim.Blob,
  location: windowShim.location,
  navigator: { userAgent: 'node' },
  HTMLCanvasElement: class {},
  self: windowShim,
};

const saved = new Map();
test.before(() => {
  for (const [k, v] of Object.entries(GLOBALS)) {
    saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
});
test.after(async () => {
  // stop the loop, then wait out the page's own 240 ms URL-sync timer, so
  // nothing is left holding a reference to the shims below
  rafEnabled = false;
  await new Promise((r) => setTimeout(r, 400));
  for (const [k, d] of saved) {
    if (d) Object.defineProperty(globalThis, k, d);
    else delete globalThis[k];
  }
});

let errors = [];

test('the page script runs', async () => {
  const onError = (e) => errors.push(e.message);
  process.on('uncaughtException', onError);
  try {
    const url = pathToFileURL(path.join(ROOT, 'assets', 'js', 'mechanism-page.js')).href;
    await import(`${url}?t=${Date.now()}`);   // a fresh module registry per run
    await new Promise((r) => setTimeout(r, 120));   // let a frame or two run
  } finally {
    process.off('uncaughtException', onError);
  }
  assert.deepEqual(errors, [], 'the page script threw');
});

test('panels render from the mechanism module', () => {
  assert.ok(byId('title').textContent.includes('Crank'), `title: ${byId('title').textContent}`);
  assert.ok(byId('bigidea').textContent.length > 40, 'the big idea is rendered');
  assert.ok(byId('params').children.length >= 3, 'parameter rows are rendered');
  assert.ok(byId('steps').children.length >= 3, 'steps are rendered');
  assert.ok(byId('parts').children.length >= 5, 'the parts list is rendered');
  assert.ok(byId('export').children.length >= 2, 'the print pack card is rendered');
  assert.ok(byId('readouts').children.length >= 3, 'readouts are rendered');
  assert.ok(byId('checks').children.length >= 3, 'printability checks are rendered');
});

test('without WebGL the isometric figure stays and the page says so', () => {
  const notes = byId('viewport').children.filter((c) => c.className === 'stage-note');
  assert.equal(notes.length, 1, 'the no-WebGL note is shown');
  assert.equal(byId('fallback').classList.contains('hidden'), false, 'the isometric figure stays visible');
});

test('the controls work', () => {
  const play = byId('play');
  const label = byId('play-label');
  const before = label.textContent;
  play.dispatch('click');
  assert.notEqual(label.textContent, before, 'the play button changes state');

  const scrub = byId('scrub');
  assert.doesNotThrow(() => scrub.dispatch('input', { target: { value: '90' } }));

  const explode = byId('explode');
  assert.doesNotThrow(() => explode.dispatch('input', { target: { value: '0.5' } }));

  const ghost = byId('ghost');
  assert.doesNotThrow(() => ghost.dispatch('click'));
});

test('a breakdown step applies its own parameters', () => {
  const stepButtons = byId('steps').children.map((li) => li.children[0]).filter(Boolean);
  assert.ok(stepButtons.length >= 4);
  for (const button of stepButtons) {
    assert.doesNotThrow(() => button.dispatch('click'), 'a step threw when clicked');
  }
});
