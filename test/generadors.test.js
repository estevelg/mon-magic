// Proves dels generadors del joc.
//
// El joc viu en un únic index.html sense build, així que aquí n'extraiem el
// <script>, l'executem amb un DOM simulat i comprovem que cap ronda pugui
// arribar trencada a les nenes: resposta sempre present i vàlida, opcions
// sense duplicats, i prou varietat perquè un bloc de 10 no es repeteixi.
//
//   npm test
//
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const arrel = dirname(dirname(fileURLToPath(import.meta.url)));

// ---------- DOM simulat ----------
// Prou de debò com per poder clicar: els elements guarden fills, textContent i
// onclick, i getElementById sempre torna el mateix element per a cada id.
function creaElement(tag = 'div') {
  return {
    tag,
    style: {},
    dataset: {},
    children: [],
    _classes: new Set(),
    textContent: '',
    _html: '',
    // com al navegador: assignar innerHTML llença els fills que hi hagués
    set innerHTML(v) { this._html = v; this.children = []; },
    get innerHTML() { return this._html; },
    value: '',
    disabled: false,
    onclick: null,
    classList: {
      add(...c) { c.forEach((x) => this._el._classes.add(x)); },
      remove(...c) { c.forEach((x) => this._el._classes.delete(x)); },
      contains(c) { return this._el._classes.has(c); },
      toggle(c) { this._el._classes.has(c) ? this._el._classes.delete(c) : this._el._classes.add(c); },
    },
    set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get className() { return Array.from(this._classes).join(' '); },
    appendChild(fill) { this.children.push(fill); return fill; },
    removeChild(fill) { this.children = this.children.filter((c) => c !== fill); },
    remove() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return creaElement(); },
    querySelectorAll() { return []; },
    setAttribute() {}, getAttribute() { return null; },
    insertAdjacentHTML() {},
    focus() {}, click() { if (this.onclick) this.onclick(); },
    getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100 }; },
  };
}
function ambClassList(el) { el.classList._el = el; return el; }

function carregaJoc() {
  const html = readFileSync(join(arrel, 'index.html'), 'utf8');
  const script = html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/)[1];
  const ancora = '  // init: carreguem perfils desats i mostrem la pantalla de selecció';
  if (!script.includes(ancora)) throw new Error('index.html ha canviat: no trobo l\'àncora de l\'init');
  const codi = script.replace(
    ancora,
    '  globalThis.__JOC = {GENS, GENS_LLETRES, GENS_MUSICA, TYPE_LABELS, state, renderRound};\n' + ancora
  );

  const elements = new Map();
  const magatzem = {};
  const sandbox = {
    console,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, ambClassList(creaElement()));
        return elements.get(id);
      },
      createElement(tag) { return ambClassList(creaElement(tag)); },
      querySelector() { return ambClassList(creaElement()); },
      querySelectorAll() { return []; },
      addEventListener() {},
      body: ambClassList(creaElement('body')),
      documentElement: ambClassList(creaElement('html')),
    },
    localStorage: {
      getItem(k) { return k in magatzem ? magatzem[k] : null; },
      setItem(k, v) { magatzem[k] = String(v); },
      removeItem(k) { delete magatzem[k]; },
    },
    navigator: { userAgent: 'node' },
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (f) => setTimeout(f, 0),
    Math, Date, JSON,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(codi, sandbox);
  return { ...sandbox.__JOC, elements };
}

const joc = carregaJoc();
const AREES = { mates: joc.GENS, lletres: joc.GENS_LLETRES, musica: joc.GENS_MUSICA };
const CURSOS = ['i3', 'i4', 'i5', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const REPETICIONS = 200;

function rondes(gens, nivell, quantes = REPETICIONS) {
  joc.state.level = nivell;
  return Array.from({ length: quantes }, () => gens());
}

// ---------- Validesa de cada ronda ----------
describe('cada generador dona rondes jugables', () => {
  for (const [area, mapa] of Object.entries(AREES)) {
    for (const curs of CURSOS) {
      it(`${area} · ${curs}`, () => {
        expect(mapa[curs], `${area}/${curs} no té generadors`).toBeTruthy();
        mapa[curs].forEach((gen, idx) => {
          for (let nivell = 1; nivell <= 3; nivell++) {
            for (const r of rondes(gen, nivell)) {
              const on = `${area}/${curs} gen#${idx} nivell ${nivell}`;
              expect(r, on).toBeTruthy();

              // la resposta ha d'existir i no pot ser un accident de càlcul
              expect(r.answer, `${on}: answer buit`).not.toBeUndefined();
              expect(r.answer, `${on}: answer nul`).not.toBeNull();
              expect(String(r.answer), `${on}: answer buit`).not.toBe('');
              expect(String(r.answer), `${on}: answer amb NaN/undefined`).not.toMatch(/NaN|undefined/);
              if (typeof r.answer === 'number') expect(Number.isFinite(r.answer), `${on}: answer no finit`).toBe(true);

              expect(String(r.question), `${on}: question invàlida`).not.toMatch(/NaN|undefined/);
              expect(r.question, `${on}: sense question`).toBeTruthy();
              expect(r.label, `${on}: sense label`).toBeTruthy();

              // tot tipus ha de tenir etiqueta, o la zona de pares el mostraria buit
              expect(r.type, `${on}: sense type`).toBeTruthy();
              expect(joc.TYPE_LABELS[r.type], `${on}: type «${r.type}» sense etiqueta a TYPE_LABELS`).toBeTruthy();

              if (r.format === 'multi') {
                expect(Array.isArray(r.items) && r.items.length >= 2, `${on}: items invàlids`).toBe(true);
                expect(r.answerText, `${on}: multi sense answerText`).toBeTruthy();
                const parts = String(r.answer).split('|');
                const disponibles = r.items.map(String);
                for (const x of parts) {
                  const i = disponibles.indexOf(x);
                  expect(i >= 0, `${on}: la resposta demana «${x}», que no és a items`).toBe(true);
                  disponibles.splice(i, 1);
                }
                expect(parts.length, `${on}: cal tocar-ho tot, no discrimina`).toBeLessThan(r.items.length);
                expect(String(r.answer), `${on}: la clau no està ordenada com la de clauMulti`)
                  .toBe(parts.slice().sort().join('|'));
              } else if (r.format === 'ordena') {
                expect(Array.isArray(r.items) && r.items.length >= 2, `${on}: items invàlids`).toBe(true);
                const parts = String(r.answer).split(' ');
                expect(parts.length, `${on}: la resposta no té tantes peces com items`).toBe(r.items.length);
                expect(parts.slice().sort().join('|'), `${on}: la resposta no és una ordenació dels items`)
                  .toBe(r.items.map(String).slice().sort().join('|'));
                r.items.forEach((x) =>
                  expect(String(x).includes(' '), `${on}: item amb espais, trencaria la comparació`).toBe(false));
              } else if (r.format === 'teclat') {
                expect(typeof r.answer, `${on}: amb teclat la resposta ha de ser text`).toBe('string');
                expect(r.answer, `${on}: amb teclat la resposta ha de ser un número escrit`).toMatch(/^\d+$/);
              } else {
                expect(r.format, `${on}: format desconegut «${r.format}»`).toBeUndefined();
                expect(Array.isArray(r.options) && r.options.length >= 2, `${on}: options invàlides`).toBe(true);
                const opcions = r.options.map(String);
                expect(opcions, `${on}: la resposta no és a les opcions (${r.question})`).toContain(String(r.answer));
                expect(new Set(opcions).size, `${on}: opcions duplicades ${JSON.stringify(r.options)}`).toBe(opcions.length);
                opcions.forEach((o) =>
                  expect(o === '' || /NaN|undefined/.test(o), `${on}: opció trencada ${JSON.stringify(r.options)}`).toBe(false));
              }
            }
          }
        });
      });
    }
  }
});

// ---------- Varietat ----------
// La queixa que va originar tot això era "sempre surt el mateix". Aquí es mesura
// quantes rondes diferents veu una nena en 1.000 tirades. A Música el llindar és
// més baix a propòsit: allà el que canvia a cada ronda és el SO, i el so no es
// pot comptar mirant el text de la pregunta i les opcions.
const LLINDARS = {
  mates:   { infantil: 700, primaria: 800 },
  lletres: { infantil: 650, primaria: 750 },
  musica:  { infantil: 200, primaria: 280 },
};
describe('hi ha prou varietat de rondes', () => {
  for (const [area, mapa] of Object.entries(AREES)) {
    for (const curs of CURSOS) {
      it(`${area} · ${curs}`, () => {
        const vistes = new Set();
        for (let i = 0; i < 1000; i++) {
          joc.state.level = (i % 3) + 1;
          const gen = mapa[curs][i % mapa[curs].length];
          const r = gen();
          vistes.add(`${r.question}|${(r.options || r.items || []).join(',')}|${r.visualHTML || ''}`);
        }
        const minim = LLINDARS[area][curs[0] === 'i' ? 'infantil' : 'primaria'];
        expect(vistes.size, `${area}/${curs}: només ${vistes.size} rondes diferents de 1.000`).toBeGreaterThanOrEqual(minim);
      });
    }
  }
  it('cada curs i àrea té prou reptes diferents per omplir un bloc de 10', () => {
    for (const [area, mapa] of Object.entries(AREES)) {
      for (const curs of CURSOS) {
        expect(mapa[curs].length, `${area}/${curs} té menys de 8 generadors`).toBeGreaterThanOrEqual(8);
      }
    }
  });
});

// ---------- Formats de resposta ----------
// Es simula el que faria un dit: tocar fitxes, ordenar-les o teclejar, i es
// comprova que el valor que arriba a handleAnswer és exactament el que el
// generador considera correcte.
describe('els formats de resposta nous es poden respondre', () => {
  function pinta(ronda) {
    joc.state.current = ronda;
    joc.renderRound();
    return joc.elements.get('optionsGrid');
  }
  const buscaGen = (mapa, curs, format) =>
    mapa[curs].find((g) => { joc.state.level = 2; return g().format === format; });

  it('tria múltiple: tocar les fitxes bones i confirmar', () => {
    const gen = buscaGen(joc.GENS, 'p2', 'multi');
    expect(gen, 'cap generador de 2n fa servir el format multi').toBeTruthy();
    joc.state.level = 2;
    const ronda = gen();
    const grid = pinta(ronda);
    const fitxes = grid.children[0].children;
    const confirma = grid.children[1];
    expect(confirma.disabled, 'el botó de confirmar hauria de començar desactivat').toBe(true);

    const pendents = String(ronda.answer).split('|');
    for (const fitxa of fitxes) {
      const i = pendents.indexOf(String(fitxa.textContent));
      if (i >= 0) { pendents.splice(i, 1); fitxa.click(); }
    }
    expect(pendents, 'no he trobat totes les fitxes bones').toHaveLength(0);
    expect(confirma.disabled).toBe(false);
    confirma.click();
    expect(joc.elements.get('feedback').className, `feedback: ${joc.elements.get('feedback').textContent}`).toContain('good');
  });

  it('ordenar: tocar les peces en ordre', () => {
    const gen = buscaGen(joc.GENS, 'i5', 'ordena');
    expect(gen, 'cap generador d\'I5 fa servir el format ordena').toBeTruthy();
    joc.state.level = 2;
    const ronda = gen();
    const grid = pinta(ronda);
    const fitxes = grid.children[1].children;
    for (const peça of String(ronda.answer).split(' ')) {
      const btn = fitxes.find((b) => String(b.textContent) === peça && !b.disabled);
      expect(btn, `no trobo la peça «${peça}»`).toBeTruthy();
      btn.click();
    }
    expect(joc.elements.get('feedback').className).toContain('good');
  });

  it('teclat: escriure el número i validar', () => {
    const gen = buscaGen(joc.GENS, 'p1', 'teclat');
    expect(gen, 'cap generador de 1r fa servir el format teclat').toBeTruthy();
    joc.state.level = 2;
    const ronda = gen();
    const grid = pinta(ronda);
    const visor = grid.children[0];
    const tecles = grid.children[1].children;
    const tecla = (t) => tecles.find((b) => b.textContent === t);

    for (const xifra of String(ronda.answer)) tecla(xifra).click();
    expect(visor.textContent).toBe(String(ronda.answer));
    tecla('⌫').click();
    expect(visor.textContent).toBe(String(ronda.answer).slice(0, -1));
    tecla(String(ronda.answer).slice(-1)).click();
    tecla('✅').click();
    expect(joc.elements.get('feedback').className).toContain('good');
  });

  it('una resposta equivocada no dona per bona la ronda', () => {
    const gen = buscaGen(joc.GENS, 'p1', 'teclat');
    joc.state.level = 2;
    const ronda = gen();
    const grid = pinta(ronda);
    const tecles = grid.children[1].children;
    const dolenta = String(Number(ronda.answer) + 1);
    for (const xifra of dolenta) tecles.find((b) => b.textContent === xifra).click();
    tecles.find((b) => b.textContent === '✅').click();
    const feedback = joc.elements.get('feedback');
    expect(feedback.className).toContain('bad');
    expect(feedback.textContent).toContain(String(ronda.answer));
  });
});
