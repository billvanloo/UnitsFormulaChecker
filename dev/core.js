// Units and Formula Checker core (spec 06). A worksheet is a list of text lines.
// Each line is parsed (a small expression language with units on numbers),
// evaluated with physical dimensions tracked through every step, checked by the
// mistake detectors of §3.5, and shown in a display unit. Also: unit conversion,
// the formula library (§3.6) and the rearrange helper (§3.7).
// Pure functions; tested in dev/test.js.
const UnitsCore = (function () {
  'use strict';
  const isNum = v => typeof v === 'number' && isFinite(v);
  const PI = Math.PI;

  /* ================================================================ exact definitions (§3.3) */
  // Every conversion factor below is built from these, and the help panel lists them.
  const DEF = {
    inch: 0.0254,                     // 1 in = 0.0254 m
    foot: 12 * 0.0254,                // 1 ft = 12 in
    pound: 0.45359237,                // 1 lb = 0.45359237 kg
    g0: 9.80665,                      // standard gravity, for unit definitions only
    lbf: 0.45359237 * 9.80665,        // 1 lbf = 4.4482216152605 N
    hp: 33000 * 12 * 0.0254 * 0.45359237 * 9.80665 / 60,   // 1 hp = 33,000 ft·lbf/min
    rev: 2 * PI,                      // 1 rev = 2π rad
    minute: 60, hour: 3600,
  };
  const DEFINITIONS = [
    ['1 in', '0.0254 m (exact)'], ['1 ft', '12 in'], ['1 lb (mass)', '0.45359237 kg (exact)'],
    ['g₀ (unit definitions only)', '9.80665 m/s²'], ['1 lbf', '4.4482216152605 N (1 lb × g₀)'], ['1 ozf', '1/16 lbf'],
    ['1 kgf', '9.80665 N'], ['1 hp', '33,000 ft·lbf/min = 745.70 W'], ['1 psi', '1 lbf/in²'], ['1 ksi', '1000 psi'],
    ['1 rev', '2π rad'], ['1 rpm', '1 rev/min'], ['1 min', '60 s'], ['1 h', '3600 s'],
    ['g in calculations', '9.81 m/s² (the value the unit uses)'],
  ];
  const G_CALC = 9.81;

  /* ================================================================ units (§3.2) */
  // dims: [M, L, T, Θ, I]. f: SI value of 1 unit. ang: angle tag. kind: torque or energy.
  const D0 = [0, 0, 0, 0, 0];
  const U = {};
  function def(sym, f, dims, extra) { U[sym] = Object.assign({ sym, f, dims }, extra || {}); }
  def('m', 1, [0, 1, 0, 0, 0]); def('mm', 1e-3, [0, 1, 0, 0, 0]); def('cm', 1e-2, [0, 1, 0, 0, 0]); def('km', 1e3, [0, 1, 0, 0, 0]);
  def('µm', 1e-6, [0, 1, 0, 0, 0]); def('um', 1e-6, [0, 1, 0, 0, 0], { show: 'µm' }); def('in', DEF.inch, [0, 1, 0, 0, 0]); def('ft', DEF.foot, [0, 1, 0, 0, 0]);
  def('kg', 1, [1, 0, 0, 0, 0]); def('g', 1e-3, [1, 0, 0, 0, 0]); def('lb', DEF.pound, [1, 0, 0, 0, 0]);
  def('N', 1, [1, 1, -2, 0, 0]); def('kN', 1e3, [1, 1, -2, 0, 0]); def('mN', 1e-3, [1, 1, -2, 0, 0]);
  def('lbf', DEF.lbf, [1, 1, -2, 0, 0]); def('ozf', DEF.lbf / 16, [1, 1, -2, 0, 0]); def('kgf', DEF.g0, [1, 1, -2, 0, 0]);
  def('Pa', 1, [1, -1, -2, 0, 0]); def('kPa', 1e3, [1, -1, -2, 0, 0]); def('MPa', 1e6, [1, -1, -2, 0, 0]); def('GPa', 1e9, [1, -1, -2, 0, 0]);
  def('psi', DEF.lbf / (DEF.inch * DEF.inch), [1, -1, -2, 0, 0]); def('ksi', 1000 * DEF.lbf / (DEF.inch * DEF.inch), [1, -1, -2, 0, 0]);
  def('J', 1, [1, 2, -2, 0, 0], { kind: 'energy' }); def('kJ', 1e3, [1, 2, -2, 0, 0], { kind: 'energy' });
  def('W', 1, [1, 2, -3, 0, 0]); def('kW', 1e3, [1, 2, -3, 0, 0]); def('hp', DEF.hp, [1, 2, -3, 0, 0]);
  def('s', 1, [0, 0, 1, 0, 0]); def('min', DEF.minute, [0, 0, 1, 0, 0]); def('h', DEF.hour, [0, 0, 1, 0, 0]);
  def('rad', 1, D0, { ang: 'rad' }); def('deg', PI / 180, D0, { ang: 'deg', show: '°' }); def('°', PI / 180, D0, { ang: 'deg' }); def('rev', DEF.rev, D0, { ang: 'rev' });
  def('rpm', DEF.rev / DEF.minute, [0, 0, -1, 0, 0], { ang: 'rev' });
  def('°C', 1, [0, 0, 0, 1, 0], { temp: true }); def('K', 1, [0, 0, 0, 1, 0], { temp: true });
  def('%', 0.01, D0, { pct: true });
  const SYMS = Object.keys(U).sort((a, b) => b.length - a.length);       // longest match first

  /* ================================================================ dimensions */
  const dAdd = (a, b) => a.map((x, i) => x + b[i]);
  const dSub = (a, b) => a.map((x, i) => x - b[i]);
  const dMul = (a, k) => a.map(x => x * k);
  const dEq = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  const dZero = a => dEq(a, D0);
  const DIMS = {
    length: [0, 1, 0, 0, 0], mass: [1, 0, 0, 0, 0], time: [0, 0, 1, 0, 0], temp: [0, 0, 0, 1, 0], force: [1, 1, -2, 0, 0],
    torque: [1, 2, -2, 0, 0], power: [1, 2, -3, 0, 0], pressure: [1, -1, -2, 0, 0], speed: [0, 1, -1, 0, 0], accel: [0, 1, -2, 0, 0],
    rate: [0, 0, -1, 0, 0], area: [0, 2, 0, 0, 0], volume: [0, 3, 0, 0, 0], cheat: [0, 2, -2, -1, 0], inertia: [1, 2, 0, 0, 0], none: D0,
  };
  // Quantity families: the units the display dropdown offers, SI-friendly ones first.
  const FAMILIES = {
    length: ['m', 'mm', 'cm', 'km', 'µm', 'in', 'ft'], mass: ['kg', 'g', 'lb'], time: ['s', 'min', 'h'], temp: ['°C', 'K'],
    force: ['N', 'kN', 'mN', 'lbf', 'ozf', 'kgf'], torque: ['N·m', 'N·mm', 'N·cm', 'lbf·in', 'lbf·ft', 'ozf·in', 'kgf·cm'],
    energy: ['J', 'kJ', 'N·m', 'ft·lbf'], power: ['W', 'kW', 'hp'], pressure: ['Pa', 'kPa', 'MPa', 'GPa', 'psi', 'ksi', 'N/mm²'],
    speed: ['m/s', 'mm/s', 'ft/min'], angspeed: ['rad/s', 'rpm', 'rev/s', 'deg/s'], rate: ['1/s', 'rad/s', 'rpm'], angle: ['rad', 'deg', 'rev'],
    accel: ['m/s²'], area: ['m²', 'mm²', 'cm²', 'in²'], volume: ['m³', 'mm³', 'cm³', 'in³'], cheat: ['J/(kg·°C)', 'J/(kg·K)'], inertia: ['kg·m²'], none: [''],
    pct: ['', '%'],
  };
  const KIND_NAMES = { length: 'a length', mass: 'a mass', time: 'a time', temp: 'a temperature change', force: 'a force', torque: 'a torque', energy: 'an energy', torqueOrEnergy: 'a torque or energy', power: 'a power', pressure: 'a pressure or stress', speed: 'a speed', accel: 'an acceleration', rate: 'a rate (per second)', angspeed: 'an angular speed', area: 'an area', volume: 'a volume', cheat: 'a specific heat', inertia: 'a moment of inertia', angle: 'an angle', none: 'a plain number', pct: 'a percentage' };
  function family(q) {
    for (const k of Object.keys(DIMS)) if (dEq(q.dims, DIMS[k])) {
      if (k === 'torque') return q.kind === 'energy' ? 'energy' : q.kind === 'torque' ? 'torque' : 'torqueOrEnergy';
      if (k === 'rate') return q.ang ? 'angspeed' : 'rate';
      if (k === 'none') return q.ang ? 'angle' : q.pct ? 'pct' : 'none';
      return k;
    }
    return null;
  }
  function kindName(q) { const f = family(q); return f ? KIND_NAMES[f] : 'a quantity in ' + siUnit(q.dims); }
  // Base SI expression for any dims, for families with no name.
  function siUnit(dims) {
    const names = ['kg', 'm', 's', 'K', 'A'], sup = n => String(n).replace(/-/g, '⁻').replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);
    const parts = dims.map((e, i) => e === 0 ? '' : names[i] + (e === 1 ? '' : sup(e))).filter(Boolean);
    return parts.length ? parts.join('·') : '';
  }

  /* ================================================================ unit expressions */
  // Parse a unit expression at s[i]: symbols joined by ·, *, ×, /, spaces, powers (^n, ², ³) and parentheses.
  // Returns { f, dims, ang, kind, temp, pct, text, end } or null if no unit starts here.
  function symAt(s, i) {
    for (const sym of SYMS) {
      if (s.startsWith(sym, i)) {
        const nx = s.charAt(i + sym.length);
        if (/[A-Za-z0-9_µ]/.test(nx) && /[A-Za-z]$/.test(sym)) continue;     // must end at a word boundary
        return sym;
      }
    }
    return null;
  }
  function parseUnit(s, i, nested) {
    let j = i;
    const skip = () => { while (s[j] === ' ' || s[j] === '\t') j++; };
    const term = () => {
      skip();
      let u;
      if (s[j] === '(') {
        const k = j; j++;
        const inner = parseUnit(s, j, true);
        if (!inner) { j = k; return null; }
        j = inner.end; skip();
        if (s[j] !== ')') { j = k; return null; }
        j++;
        u = Object.assign({}, inner, { text: '(' + inner.text + ')' });
      } else {
        const sym = symAt(s, j);
        if (!sym) return null;
        j += sym.length;
        const b = U[sym];
        u = { f: b.f, dims: b.dims.slice(), ang: b.ang || null, kind: b.kind || null, temp: !!b.temp, pct: !!b.pct, text: b.show || sym, syms: [sym] };
      }
      let p = null;
      if (s[j] === '^') { const m = /^\^\s*(-?\d+)/.exec(s.slice(j)); if (m) { p = +m[1]; j += m[0].length; } }
      else if (s[j] === '²') { p = 2; j++; } else if (s[j] === '³') { p = 3; j++; }
      if (p !== null) u = Object.assign({}, u, { f: Math.pow(u.f, p), dims: dMul(u.dims, p), text: u.text + (p === 2 ? '²' : p === 3 ? '³' : '^' + p), kind: null, ang: u.ang });
      return u;
    };
    let u = term();
    if (!u) return null;
    let syms = (u.syms || []).slice();
    for (;;) {
      const save = j;
      skip();
      const c = s[j];
      let op = null;
      // * and / join units only with no space before them: "5 N*m" is N·m, "2 kg * g" is 2 kg times g.
      if ((c === '*' || c === '/') && j > save) { j = save; break; }
      if (c === '*' || c === '·' || c === '×') { op = '·'; j++; }
      else if (c === '/') { op = '/'; j++; }
      else if (j > save) op = ' ';                                  // a space between two symbols multiplies
      else break;
      const v = term();
      if (!v) { j = save; break; }
      syms = syms.concat(v.syms || []);
      if (op === '/') u = { f: u.f / v.f, dims: dSub(u.dims, v.dims), ang: u.ang || v.ang, temp: u.temp || v.temp, pct: false, text: u.text + '/' + v.text };
      else u = { f: u.f * v.f, dims: dAdd(u.dims, v.dims), ang: u.ang || v.ang, temp: u.temp || v.temp, pct: false, text: u.text + '·' + v.text };
      u.kind = null;
    }
    u.end = j; u.syms = syms;
    // Torque against energy (§3.1): a force times a length is a torque; a length times a force (ft·lbf) or J is an energy.
    if (dEq(u.dims, DIMS.torque) && syms.length) {
      const force = ['N', 'kN', 'mN', 'lbf', 'ozf', 'kgf'], len = ['m', 'mm', 'cm', 'km', 'in', 'ft'];
      if (syms.length === 1) u.kind = U[syms[0]].kind || null;
      else if (force.indexOf(syms[0]) >= 0 && len.indexOf(syms[1]) >= 0) u.kind = 'torque';
      else if (len.indexOf(syms[0]) >= 0 && force.indexOf(syms[1]) >= 0) u.kind = 'energy';
    }
    if (dEq(u.dims, DIMS.temp) && !u.temp) u.temp = false;
    return u;
  }
  // A whole string that is exactly one unit expression, or null.
  function unitOf(text) {
    const s = String(text).trim();
    if (s === '') return { f: 1, dims: D0.slice(), ang: null, kind: null, temp: false, pct: false, text: '', syms: [] };
    if (s === '1/s') return { f: 1, dims: DIMS.rate.slice(), ang: null, kind: null, temp: false, pct: false, text: '1/s', syms: [] };
    const u = parseUnit(s, 0);
    return u && u.end === s.length ? u : null;
  }
  const prettyUnit = t => String(t).replace(/\*/g, '·').replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/\bdeg\b/g, 'deg');

  /* ================================================================ expression parser */
  const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ', eta: 'η', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', Delta: 'Δ', epsilon: 'ε' };
  const FUNCS = ['sqrt', 'cbrt', 'sin', 'cos', 'tan', 'atan', 'asin', 'acos', 'exp', 'ln', 'abs'];
  const CONSTS = { pi: PI, e: Math.E };
  class ParseError extends Error { constructor(msg) { super(msg); this.parse = true; } }

  function tokenize(src) {
    const toks = [];
    let i = 0;
    const s = src;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      const num = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(s.slice(i));
      if (num) {
        i += num[0].length;
        const tok = { t: 'num', v: Number(num[0]), text: num[0], unit: null };
        // A unit can follow a number directly or after spaces, but not after * (so 0.5*m*v^2 keeps m a variable).
        let j = i; while (s[j] === ' ') j++;
        if (s[j] !== '*' && s[j] !== '/' && s[j] !== '·') {
          const u = parseUnit(s, j);
          if (u) { tok.unit = u; i = u.end; tok.text = num[0] + ' ' + u.text; }
          else {
            const id = /^[A-Za-z_µ][A-Za-z0-9_]*/.exec(s.slice(j));
            if (id && j === i && !/^e\d/.test(id[0])) throw new ParseError('"' + id[0] + '" after ' + num[0] + ' is not a unit this tool knows. Check the spelling, or put * between a number and a variable.');
            if (id && FUNCS.indexOf(id[0]) < 0 && !CONSTS[id[0]]) throw new ParseError('"' + id[0] + '" is not a unit this tool knows. Write ' + num[0] + '*' + id[0] + ' to multiply by a variable.');
          }
        }
        toks.push(tok);
        continue;
      }
      const id = /^[A-Za-zΑ-Ωα-ωµ_][A-Za-z0-9_Α-Ωα-ω]*/.exec(s.slice(i));
      if (id) { toks.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
      if ('+-−*/^(),·×'.indexOf(c) >= 0) { toks.push({ t: 'op', v: c === '−' ? '-' : (c === '·' || c === '×') ? '*' : c }); i++; continue; }
      if (c === '²' || c === '³') { toks.push({ t: 'op', v: '^' }); toks.push({ t: 'num', v: c === '²' ? 2 : 3, text: c, unit: null }); i++; continue; }
      throw new ParseError('"' + c + '" is not something this tool can read here.');
    }
    return toks;
  }
  function parseExpr(src) {
    const toks = tokenize(src);
    let k = 0;
    const peek = () => toks[k], next = () => toks[k++];
    const isOp = (t, v) => t && t.t === 'op' && t.v === v;
    function primary() {
      const t = next();
      if (!t) throw new ParseError('The line ends too soon.');
      if (t.t === 'num') return { t: 'num', v: t.v, unit: t.unit, text: t.text };
      if (t.t === 'id') {
        if (isOp(peek(), '(')) {
          next();
          const args = [expr(0)];
          while (isOp(peek(), ',')) { next(); args.push(expr(0)); }
          if (!isOp(next(), ')')) throw new ParseError('A bracket is missing after ' + t.v + '(…');
          if (FUNCS.indexOf(t.v) < 0) throw new ParseError('"' + t.v + '" is not a function this tool knows. It knows ' + FUNCS.join(', ') + '.');
          return { t: 'call', f: t.v, args };
        }
        return { t: 'var', name: t.v };
      }
      if (isOp(t, '(')) { const e = expr(0); if (!isOp(next(), ')')) throw new ParseError('A closing bracket ) is missing.'); return e; }
      if (isOp(t, '-')) return { t: 'neg', a: expr(25) };
      if (isOp(t, '+')) return expr(25);
      throw new ParseError('"' + t.v + '" cannot start a value here.');
    }
    const BP = { '+': 10, '-': 10, '*': 20, '/': 20, '^': 30 };
    function expr(minBp) {
      let left = primary();
      for (;;) {
        const t = peek();
        if (!t || t.t !== 'op' || !(t.v in BP)) {
          if (t && (t.t === 'num' || t.t === 'id')) throw new ParseError('Two values sit side by side. Put * between them to multiply.');
          break;
        }
        const bp = BP[t.v];
        if (bp < minBp) break;
        next();
        const right = expr(t.v === '^' ? bp : bp + 1);          // ^ is right-associative
        left = { t: 'bin', op: t.v, a: left, b: right };
      }
      return left;
    }
    const e = expr(0);
    if (k < toks.length) throw new ParseError('"' + (toks[k].v || toks[k].text) + '" is left over at the end of the line.');
    return e;
  }

  /* ================================================================ lines */
  // Split a line into its form: given or step (name = expr), target (name in unit), convert (expr in unit) or expr.
  function splitLine(raw) {
    const s = String(raw == null ? '' : raw).replace(/ /g, ' ').trim();
    if (s === '' || /^#/.test(s)) return { form: 'blank', text: s };
    // The target keyword is the last " in " followed by a complete unit to the end of the line.
    let target = null, body = s;
    const re = /\sin\s/g; let m, last = -1;
    while ((m = re.exec(s))) last = m.index;
    if (last >= 0) {
      const ut = s.slice(last + 4).trim(), u = unitOf(ut);
      if (u) { target = { unit: u, text: ut }; body = s.slice(0, last).trim(); }
    }
    const eq = /^([A-Za-zΑ-Ωα-ωµ_][A-Za-z0-9_Α-Ωα-ω]*)\s*=(?!=)\s*(.*)$/.exec(body);
    if (eq) return { form: 'assign', name: eq[1], expr: eq[2], target, text: s };
    if (target) return /^[A-Za-zΑ-Ωα-ωµ_][A-Za-z0-9_Α-Ωα-ω]*$/.test(body) ? { form: 'target', name: body, target, text: s } : { form: 'convert', expr: body, target, text: s };
    return { form: 'expr', expr: body, text: s };
  }

  /* ================================================================ evaluation */
  // A quantity: v (SI), dims, ang ('rad'|'deg'|'rev'|null), kind ('torque'|'energy'|null), absT (an absolute
  // temperature), pct, uf (SI value of one display unit), unit (display text), lens (length units seen).
  const Q = (o) => Object.assign({ v: 0, dims: D0.slice(), ang: null, kind: null, absT: false, pct: false, uf: 1, unit: '', lens: [] }, o);
  const plain = v => Q({ v });
  class EvalError extends Error { constructor(msg, type) { super(msg); this.type = type || 'error'; } }
  const LENSYMS = ['m', 'mm', 'cm', 'km', 'µm', 'um', 'in', 'ft'];
  const uniq = a => a.filter((x, i) => a.indexOf(x) === i);

  function evaluate(node, env, ctx) {
    switch (node.t) {
      case 'num': {
        if (!node.unit) return plain(node.v);
        const u = node.unit;
        if (u.ang === 'deg') ctx.lastDeg = { name: null, rad: node.v * u.f };
        return Q({ v: node.v * u.f, dims: u.dims.slice(), ang: u.ang, kind: u.kind, pct: u.pct, uf: u.f, unit: u.text, lens: uniq((u.syms || []).filter(x => LENSYMS.indexOf(x) >= 0)), temp: u.temp, fromNum: node.v });
      }
      case 'var': {
        if (env[node.name]) {
          const q = env[node.name];
          if (q.error) throw new EvalError(node.name + ' has no value (line ' + q.line + ').', 'novalue');
          if (q.ang === 'deg') ctx.lastDeg = { name: node.name, rad: q.v };
          return Object.assign({}, q, { varName: node.name });
        }
        if (node.name === 'g') { ctx.notes.push({ type: 'g', text: 'g is taken as 9.81 m/s², the value the unit uses.' }); return Q({ v: G_CALC, dims: DIMS.accel.slice(), unit: 'm/s²', varName: 'g' }); }
        if (CONSTS[node.name] !== undefined) return Object.assign(plain(CONSTS[node.name]), { isConst: true });
        throw new EvalError(node.name + ' is not defined yet. Give it a value on an earlier line.', 'novalue');
      }
      case 'neg': { const a = evaluate(node.a, env, ctx); return Object.assign({}, a, { v: -a.v }); }
      case 'call': return call(node, env, ctx);
      case 'bin': {
        if (node.op === '*' || node.op === '/') { const conv = convertPattern(node, env, ctx); if (conv) return conv; }
        const a = evaluate(node.a, env, ctx), b = evaluate(node.b, env, ctx);
        return binary(node.op, a, b, ctx, node);
      }
    }
    throw new EvalError('This line cannot be worked out.');
  }

  const unitShow = q => q.unit || (dZero(q.dims) ? 'no unit' : siUnit(q.dims));
  const what = q => (q.varName ? q.varName + ' (' + unitShow(q) + ')' : (isNum(q.fromNum) ? q.fromNum + ' ' + unitShow(q) : unitShow(q)));

  function binary(op, a, b, ctx, node) {
    if (op === '+' || op === '-') {
      if (!dEq(a.dims, b.dims)) {
        throw new EvalError('You are ' + (op === '+' ? 'adding ' : 'subtracting ') + kindName(a) + ' (' + unitShow(a) + ') ' + (op === '+' ? 'to ' : 'and ') + kindName(b) + ' (' + unitShow(b) + '). These cannot be ' + (op === '+' ? 'added' : 'subtracted') + '.', 'add');
      }
      if (a.kind && b.kind && a.kind !== b.kind) ctx.flags.push({ type: 'kind', level: 'warn', text: (a.varName || 'One value') + ' is ' + (a.kind === 'torque' ? 'a torque' : 'an energy') + ' and ' + (b.varName || 'the other') + ' is ' + (b.kind === 'torque' ? 'a torque' : 'an energy') + '. They have the same units (N·m = J) but are different kinds of quantity, so adding them is almost always a mistake.' });
      const v = op === '+' ? a.v + b.v : a.v - b.v;
      const absT = op === '-' && a.absT && b.absT ? false : (a.absT || b.absT);
      return Q({ v, dims: a.dims, ang: a.ang || b.ang, kind: a.kind || b.kind, absT, uf: a.uf, unit: a.unit || b.unit, lens: uniq(a.lens.concat(b.lens)), temp: a.temp || b.temp });
    }
    if (op === '*' || op === '/') {
      checkRpm(a, b, ctx, op); checkRpm(b, a, ctx, op);
      [a, b].forEach(x => {
        if (x.pct && !ctx.pctNoted) { ctx.pctNoted = true; ctx.notes.push({ type: 'percent', text: (x.varName ? x.varName + ' = ' : '') + fmtPlain(x.v * 100) + '% is ' + fmtPlain(x.v) + ' in this formula.' }); }
        if (x.absT) ctx.flags.push({ type: 'temp', level: 'warn', text: (x.varName || 'This temperature') + ' is a temperature, not a temperature change. Q = mcΔT uses a temperature change ΔT: subtract the starting temperature from the final one. A name that starts with d or Δ (for example dT) marks a change.' });
      });
      const dims = op === '*' ? dAdd(a.dims, b.dims) : dSub(a.dims, b.dims);
      if (op === '/' && b.v === 0) throw new EvalError('This divides by zero' + (b.varName ? ': ' + b.varName + ' is 0' : '') + '.', 'zero');
      const v = op === '*' ? a.v * b.v : a.v / b.v;
      let ang = null;
      if (a.ang && dZero(b.dims) && !b.ang) ang = a.ang; else if (b.ang && dZero(a.dims) && !a.ang && op === '*') ang = b.ang;
      return Q({ v, dims, ang, lens: uniq(a.lens.concat(b.lens)), degIn: a.ang === 'deg' || b.ang === 'deg' || a.degIn || b.degIn });
    }
    if (op === '^') {
      if (!dZero(b.dims)) throw new EvalError('A power must be a plain number, not ' + kindName(b) + '.', 'power');
      if (dZero(a.dims)) return Q({ v: Math.pow(a.v, b.v), degIn: a.ang === 'deg' || a.degIn });
      const p = b.v;
      if (Math.abs(p * 6 - Math.round(p * 6)) > 1e-9) throw new EvalError('A quantity with units can only be raised to a simple power (2, 3, ½ and so on).', 'power');
      const dims = dMul(a.dims, p);
      if (dims.some(x => Math.abs(x - Math.round(x)) > 1e-9)) throw new EvalError('(' + unitShow(a) + ')^' + fmtPlain(p) + ' does not give a whole unit.', 'power');
      return Q({ v: Math.pow(a.v, p), dims: dims.map(Math.round), lens: a.lens });
    }
    throw new EvalError('Unknown operation ' + op + '.');
  }
  const fmtPlain = v => String(Number(Number(v).toPrecision(4)));

  // §3.5 rpm used as rad/s: an rpm (or deg/s) speed multiplied or divided with a power, torque, energy, force or length.
  function checkRpm(w, other, ctx, op) {
    if (!(w.ang === 'rev' || w.ang === 'deg') || !dEq(w.dims, DIMS.rate)) return;
    const f = family(Object.assign({}, other, { kind: other.kind }));
    if (['power', 'torque', 'energy', 'torqueOrEnergy', 'length', 'force'].indexOf(f) < 0) return;
    const nm = w.varName || 'This speed', unit = w.ang === 'rev' ? 'rpm' : 'deg/s';
    const formula = (f === 'length') ? 'v = ωr' : 'P = τω';
    ctx.flags.push({
      type: 'rpm', level: 'warn',
      text: nm + ' is in ' + unit + '. ' + formula + ' needs rad/s. Multiply by ' + (unit === 'rpm' ? '2π/60' : 'π/180') + '. The tool converted it for you, but a hand calculation with ' + fmtPlain(w.v / w.uf) + ' would be wrong.',
      fix: w.varName && unit === 'rpm' ? { kind: 'omega', from: w.varName } : null,
    });
  }

  // Numeric-value conversions written with bare numbers (QUESTIONS Q24): 2*pi*N/60 with N in rpm is the
  // rpm-to-rad/s conversion, not 2π × (N in rad/s) / 60. Same for theta*pi/180 and their reverses.
  const CONV = [
    { from: 'rpm', k: 2 * PI / 60, ang: 'rad', unit: 'rad/s', note: 'Read as converting {n} from rpm to rad/s: 2π rad per turn, 60 s per minute.' },
    { from: 'deg', k: PI / 180, ang: 'rad', unit: 'rad', note: 'Read as converting {n} from degrees to radians.' },
    { from: 'rev', k: 2 * PI, ang: 'rad', unit: 'rad', note: 'Read as converting {n} from turns to radians.' },
    { from: 'rad/s', k: 60 / (2 * PI), ang: 'rev', unit: 'rpm', note: 'Read as converting {n} from rad/s to rpm.' },
    { from: 'rad', k: 180 / PI, ang: 'deg', unit: 'deg', note: 'Read as converting {n} from radians to degrees.' },
  ];
  function flatten(node, num, den, inDen) {
    if (node.t === 'bin' && (node.op === '*' || node.op === '/')) { flatten(node.a, num, den, inDen); flatten(node.b, node.op === '/' ? den : num, node.op === '/' ? num : den, inDen); return; }
    (inDen ? den : num).push(node);
  }
  function convertPattern(node, env, ctx) {
    const num = [], den = [];
    flatten(node, num, den, false);
    const all = num.map(n => ({ n, d: false })).concat(den.map(n => ({ n, d: true })));
    const isConst = n => (n.t === 'num' && !n.unit) || (n.t === 'var' && CONSTS[n.name] !== undefined && !env[n.name]);
    const vars = all.filter(x => !isConst(x.n));
    if (vars.length !== 1 || vars[0].d || vars[0].n.t !== 'var' || !env[vars[0].n.name] || env[vars[0].n.name].error) return null;
    const q = env[vars[0].n.name];
    const cval = x => x.n.t === 'num' ? x.n.v : CONSTS[x.n.name];
    let k = 1;
    all.filter(x => isConst(x.n)).forEach(x => { k = x.d ? k / cval(x) : k * cval(x); });
    const unitKey = q.ang === 'rev' && dEq(q.dims, DIMS.rate) ? 'rpm' : q.ang === 'deg' && dZero(q.dims) ? 'deg' : q.ang === 'rev' && dZero(q.dims) ? 'rev'
      : dEq(q.dims, DIMS.rate) && (q.ang === 'rad' || q.ang === null) ? 'rad/s' : q.ang === 'rad' && dZero(q.dims) ? 'rad' : null;
    const c = CONV.find(x => x.from === unitKey && Math.abs(k - x.k) < 1e-9 * x.k);
    if (!c || (unitKey === 'rad/s' && !q.ang && !/^(omega|w)/.test(vars[0].n.name))) return null;
    ctx.notes.push({ type: 'conv', text: c.note.replace('{n}', vars[0].n.name) });
    const out = U[c.unit] || { f: 1 };
    return Q({ v: q.v, dims: q.dims, ang: c.ang, uf: c.unit === 'rad/s' ? 1 : out.f, unit: c.unit === 'deg' ? '°' : c.unit, convPattern: true });
  }

  function call(node, env, ctx) {
    const f = node.f;
    if (node.args.length !== 1) throw new EvalError(f + ' takes one value.');
    const a = evaluate(node.args[0], env, ctx);
    const trig = ['sin', 'cos', 'tan'].indexOf(f) >= 0;
    if (['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'ln'].indexOf(f) >= 0 && !dZero(a.dims)) {
      throw new EvalError(f + (trig ? ' needs an angle or a ratio. ' : ' needs a plain number. ') + what(a) + ' is ' + kindName(a) + '.', 'func');
    }
    if ((f === 'exp' || f === 'ln') && (a.ang === 'deg' || a.degIn)) {
      const dg = ctx.lastDeg || { rad: PI };
      ctx.flags.push({ type: 'deg', level: 'note', text: 'e^(μθ) needs θ in radians. Converted ' + fmtPlain(dg.rad * 180 / PI) + '° to ' + String(Number(dg.rad.toPrecision(3))) + ' rad.', fix: { kind: 'deg' } });
    }
    switch (f) {
      case 'sqrt': case 'cbrt': {
        const n = f === 'sqrt' ? 2 : 3;
        if (a.dims.some(x => Math.abs(x / n - Math.round(x / n)) > 1e-9)) throw new EvalError((f === 'sqrt' ? '√' : '∛') + ' of ' + unitShow(a) + ' does not give a whole unit. Check the formula.', 'power');
        if (f === 'sqrt' && a.v < 0) throw new EvalError('√ of a negative number is not defined.', 'domain');
        return Q({ v: f === 'sqrt' ? Math.sqrt(a.v) : Math.cbrt(a.v), dims: a.dims.map(x => Math.round(x / n)), lens: a.lens });
      }
      case 'sin': return plain(Math.sin(a.v));
      case 'cos': return plain(Math.cos(a.v));
      case 'tan': return plain(Math.tan(a.v));
      case 'asin': case 'acos': if (Math.abs(a.v) > 1) throw new EvalError(f + ' needs a value between −1 and 1.', 'domain'); return Q({ v: Math[f](a.v), ang: 'rad', unit: 'rad' });
      case 'atan': return Q({ v: Math.atan(a.v), ang: 'rad', unit: 'rad' });
      case 'exp': return plain(Math.exp(a.v));
      case 'ln': if (!(a.v > 0)) throw new EvalError('ln needs a number greater than 0.', 'domain'); return plain(Math.log(a.v));
      case 'abs': return Object.assign({}, a, { v: Math.abs(a.v), varName: undefined });
    }
    throw new EvalError('Unknown function ' + f + '.');
  }

  /* ================================================================ display units */
  const nameKindHint = name => /^(T|M|tau_?t|Tq)/.test(name) && !/^T_?e$/.test(name) ? 'torque' : /^(E|KE|PE|W|Q|U)\b|^(E|KE|PE|W|Q|U)_/.test(name) ? 'energy' : null;
  function famOf(q) { const f = family(q); return f === 'torqueOrEnergy' ? 'energy' : f; }
  function displayUnits(q) { const f = famOf(q); return f ? FAMILIES[f] : [siUnit(q.dims)]; }
  // A family unit whose value sits in [1, 1000), else the first (SI) one.
  function niceUnit(q) {
    const list = displayUnits(q);
    if (q.ang === 'rev' && dEq(q.dims, DIMS.rate)) return 'rpm';
    if (q.ang === 'deg' && dZero(q.dims)) return '°';
    for (const t of list) { const u = unitOf(t); if (u) { const x = Math.abs(q.v / u.f); if (x >= 1 && x < 1000) return t; } }
    return list[0];
  }
  function inUnit(q, text) { const u = unitOf(text); return u ? q.v / u.f : null; }

  /* ================================================================ worksheet */
  // lines: [{ text, unit (display override or ''), kind ('' | 'torque' | 'energy') }]
  function evaluateSheet(lines) {
    const env = {}, out = [];
    lines.forEach((ln, i) => {
      const r = { i, n: i + 1, text: ln.text || '', form: 'blank', flags: [], notes: [], q: null, error: null, name: null };
      const sp = splitLine(ln.text);
      r.form = sp.form; r.name = sp.name || null; r.target = sp.target || null;
      if (sp.form === 'blank') { out.push(r); return; }
      const ctx = { flags: r.flags, notes: r.notes };
      try {
        let q;
        if (sp.form === 'target') {
          if (!env[sp.name]) throw new EvalError(sp.name + ' is not defined yet. Give it a value on an earlier line.', 'novalue');
          if (env[sp.name].error) throw new EvalError(sp.name + ' has no value (line ' + env[sp.name].line + ').', 'novalue');
          q = Object.assign({}, env[sp.name], { varName: sp.name });
        } else {
          const ast = parseExpr(sp.expr);
          r.ast = ast;
          q = evaluate(ast, env, ctx);
          if (sp.form === 'assign') r.given = ast.t === 'num' || (ast.t === 'neg' && ast.a.t === 'num');
        }
        // Kind: the line's tag, then the unit typed, then the name (torque and energy share N·m = J).
        if (dEq(q.dims, DIMS.torque)) q.kind = ln.kind || q.kind || (r.name ? nameKindHint(r.name) : null);
        // An absolute temperature: a temperature given to a name that does not mark a change (QUESTIONS Q25).
        if (r.given && dEq(q.dims, DIMS.temp)) q.absT = !/^(d|Δ|delta)/.test(r.name);
        if (r.given && q.pct) r.notes.push({ type: 'percent', text: fmtPlain(q.v * 100) + '% is ' + fmtPlain(q.v) + ' as a fraction; the tool uses ' + fmtPlain(q.v) + ' in formulas.' });
        // Mixed length units in a stress (§3.5): converted to SI first.
        if (dEq(q.dims, DIMS.pressure) && q.lens.length > 1 && !r.given) r.notes.push({ type: 'prefix', text: 'This step mixes ' + q.lens.join(' and ') + '. The tool turned everything into N and m before dividing, so the stress is right.' });
        if (sp.target) {
          if (!dEq(sp.target.unit.dims, q.dims)) {
            r.flags.push({ type: 'target', level: 'error', text: 'This result is ' + kindName(q) + '. You asked for it in ' + prettyUnit(sp.target.text) + ', which is ' + kindName(Q({ dims: sp.target.unit.dims, ang: sp.target.unit.ang })) + '.', fix: { kind: 'target', unit: niceUnit(q) } });
            r.error = 'units do not match';
          } else { r.matches = true; r.dispUnit = prettyUnit(sp.target.text); }
        }
        r.q = q;
        if (!r.dispUnit) r.dispUnit = ln.unit && unitOf(ln.unit) && dEq(unitOf(ln.unit).dims, q.dims) ? ln.unit : (r.given && q.unit ? q.unit : niceUnit(q));
        r.disp = r.error ? null : (r.dispUnit === '1/s' ? q.v : inUnit(q, r.dispUnit));
        if (r.disp === null && !r.error) { r.dispUnit = siUnit(q.dims); r.disp = q.v; }
        r.family = famOf(q);
        r.units = r.family ? FAMILIES[r.family] : [siUnit(q.dims)];
        if (sp.form === 'assign') env[sp.name] = Object.assign({}, q, { line: r.n, varName: sp.name, unit: r.dispUnit, uf: unitOf(r.dispUnit) ? unitOf(r.dispUnit).f : 1 });
      } catch (e) {
        if (!(e instanceof EvalError) && !e.parse) throw e;
        r.error = e.message;
        r.flags.push({ type: e.parse ? 'syntax' : e.type, level: 'error', text: e.message });
        if (sp.form === 'assign') env[sp.name] = { error: true, line: r.n };
      }
      if (r.flags.length && !r.error) r.flagged = r.flags.some(f => f.level === 'warn');
      out.push(r);
    });
    return { lines: out, env };
  }

  /* ================================================================ fixes */
  // Apply a flag's fix. Returns a new list of line objects.
  function applyFix(lines, i, fix, env) {
    const L = lines.map(x => Object.assign({}, x));
    if (fix.kind === 'omega') {
      let w = 'omega', k = 2;
      const used = new Set(L.map(x => (splitLine(x.text).name || '')));
      while (used.has(w)) w = 'omega' + k++;
      // Replace the rpm variable with ω only on the right of "=".
      const eq = L[i].text.indexOf('=');
      const lhs = lines[i].text.slice(0, eq + 1), rhs = lines[i].text.slice(eq + 1);
      L[i].text = lhs + rhs.replace(new RegExp('\\b' + fix.from + '\\b', 'g'), w);
      L.splice(i, 0, { text: w + ' = 2*pi*' + fix.from + '/60', unit: '', kind: '' });
      return L;
    }
    if (fix.kind === 'target') { const sp = splitLine(L[i].text); L[i].text = (sp.name || sp.expr) + ' in ' + fix.unit; return L; }
    if (fix.kind === 'deg') {
      // Rewrite the first degree given that feeds this line as radians.
      for (let j = 0; j < i; j++) {
        const sp = splitLine(L[j].text);
        if (sp.form === 'assign' && /\d\s*(deg|°)\s*$/.test(sp.expr)) {
          const v = Number(/^([-+]?[\d.]+)/.exec(sp.expr)[1]);
          L[j].text = sp.name + ' = ' + String(Number((v * PI / 180).toPrecision(6))) + ' rad';
          return L;
        }
      }
      return L;
    }
    return L;
  }

  /* ================================================================ formula library (§3.6) */
  const S = {
    torque: 'OpenStax College Physics 2e, 9.2', rot: 'OpenStax University Physics Vol. 1, 10.8', ke: 'OpenStax College Physics 2e, 10.4',
    heat: 'OpenStax College Physics 2e, 14.2', stress: 'OpenStax College Physics 2e, 5.3', khk: 'KHK Gears, basic gear terminology and calculation',
    khkC: 'KHK Gears, center distance', dh: 'Drivetrain Hub, gear force analysis', shig: "Shigley's Mechanical Engineering Design, ch. 8",
    ee: 'Engineers Edge, power screws', shaft: 'Steltech, combined torsion and bending in shafts', pc: 'PackagingConveyor.com, conveyor engineering calculations',
    rul: 'Rulmeca, how to calculate conveyor belt tensions', cap: 'Wikipedia, capstan equation',
  };
  const LIBRARY = [
    { id: 'torque', show: 'τ = rF', line: 'tau = r*F', src: S.torque },
    { id: 'omega', show: 'ω = 2πN/60', line: 'omega = 2*pi*N/60', src: S.rot },
    { id: 'Ptw', show: 'P = τω', line: 'P = tau*omega', src: S.rot },
    { id: 'Pfv', show: 'P = Fv', line: 'P = F*v', src: S.rul },
    { id: 'ratio', show: 'i = z₂/z₁', line: 'i = z2/z1', src: S.khk },
    { id: 'pitch', show: 'd = zm', line: 'd = z*m', src: S.khk },
    { id: 'centre', show: 'a = m(z₁ + z₂)/2', line: 'a = m*(z1 + z2)/2', src: S.khkC },
    { id: 'Ft', show: 'F_t = 2T/d', line: 'F_t = 2*T/d', src: S.dh },
    { id: 'Fr', show: 'F_r = F_t tan α', line: 'F_r = F_t*tan(alpha)', src: S.dh },
    { id: 'lead', show: 'tan λ = l/(π d_m)', line: 'lambda = atan(l/(pi*d_m))', src: S.shig },
    { id: 'eff', show: 'η = Wl/(2πT)', line: 'eta = W*l/(2*pi*T)', src: S.ee },
    { id: 'sFA', show: 'σ = F/A', line: 'sigma = F/A', src: S.stress },
    { id: 'sb', show: 'σ = 32M/(πd³)', line: 'sigma = 32*M/(pi*d^3)', src: S.shaft },
    { id: 'tt', show: 'τ = 16T/(πd³)', line: 'tau = 16*T/(pi*d^3)', src: S.shaft },
    { id: 'ke', show: 'KE = ½Iω²', line: 'KE = 0.5*I*omega^2', src: S.ke },
    { id: 'q', show: 'Q = mcΔT', line: 'Q = m*c*dT', src: S.heat },
    { id: 'te', show: 'T_e = μg(m′_b + m′_p)L + m′_p gH', line: 'T_e = mu*g*(mb + mp)*L + mp*g*H', src: S.pc },
    { id: 'cap', show: 'T₁/T₂ = e^(μθ)', line: 'T1 = T2*exp(mu*theta)', src: S.cap },
  ];
  function varsOf(node, set) {
    set = set || [];
    if (!node) return set;
    if (node.t === 'var' && CONSTS[node.name] === undefined && node.name !== 'g' && set.indexOf(node.name) < 0) set.push(node.name);
    ['a', 'b'].forEach(k => node[k] && varsOf(node[k], set));
    (node.args || []).forEach(a => varsOf(a, set));
    return set;
  }
  function libraryVars(entry) { const sp = splitLine(entry.line); return [sp.name].concat(varsOf(parseExpr(sp.expr))); }

  /* ================================================================ rearrange (§3.7) */
  const count = (node, x) => !node ? 0 : (node.t === 'var' && node.name === x ? 1 : 0) + count(node.a, x) + count(node.b, x) + (node.args || []).reduce((s, a) => s + count(a, x), 0);
  const N = v => ({ t: 'num', v, unit: null, text: String(v) });
  const bin = (op, a, b) => ({ t: 'bin', op, a, b });
  // Light tidying so the answer reads like a hand rearrangement: (A/B)/C = A/(B C), A/(B/C) = A C/B,
  // and products with numbers and π first.
  function tidy(n) {
    if (!n || n.t !== 'bin') return n.t === 'call' ? Object.assign({}, n, { args: n.args.map(tidy) }) : n.t === 'neg' ? { t: 'neg', a: tidy(n.a) } : n;
    let a = tidy(n.a), b = tidy(n.b);
    if (n.op === '/' && a.t === 'bin' && a.op === '/') return tidy(bin('/', a.a, bin('*', a.b, b)));
    if (n.op === '/' && b.t === 'bin' && b.op === '/') return tidy(bin('/', bin('*', a, b.b), b.a));
    if (n.op === '*') {
      const fs = []; const fl = x => (x.t === 'bin' && x.op === '*') ? (fl(x.a), fl(x.b)) : fs.push(x); fl(a); fl(b);
      const rank = x => x.t === 'num' ? 0 : (x.t === 'var' && x.name === 'pi') ? 1 : 2;
      fs.sort((p, q) => rank(p) - rank(q));
      return fs.reduce((acc, x) => acc ? bin('*', acc, x) : x, null);
    }
    return bin(n.op, a, b);
  }
  const INV = { sqrt: r => bin('^', r, N(2)), cbrt: r => bin('^', r, N(3)), exp: r => ({ t: 'call', f: 'ln', args: [r] }), ln: r => ({ t: 'call', f: 'exp', args: [r] }), sin: r => ({ t: 'call', f: 'asin', args: [r] }), cos: r => ({ t: 'call', f: 'acos', args: [r] }), tan: r => ({ t: 'call', f: 'atan', args: [r] }), asin: r => ({ t: 'call', f: 'sin', args: [r] }), acos: r => ({ t: 'call', f: 'cos', args: [r] }), atan: r => ({ t: 'call', f: 'tan', args: [r] }) };
  const FNAME = { sqrt: 'square root', cbrt: 'cube root', exp: 'exponential', ln: 'natural log', sin: 'sine', cos: 'cosine', tan: 'tangent', asin: 'arcsine', acos: 'arccosine', atan: 'arctangent' };
  function rearrange(lineText, x) {
    const sp = splitLine(lineText);
    if (sp.form !== 'assign') return { ok: false, message: 'Rearrange works on a formula of the form name = expression.' };
    let L = { t: 'var', name: sp.name }, R = parseExpr(sp.expr);
    const total = count(L, x) + count(R, x);
    if (total === 0) return { ok: false, message: x + ' is not in this formula.' };
    if (total > 1) return { ok: false, message: 'This one needs algebra the helper does not do yet: ' + x + ' appears ' + (total === 2 ? 'twice' : total + ' times') + '.' };
    const steps = [];
    const eqText = () => show(L) + ' = ' + show(R);
    if (count(L, x) === 0) { const t = L; L = R; R = t; steps.push({ say: 'Swap the sides so ' + sym(x) + ' is on the left.', eq: eqText() }); }
    for (let guard = 0; guard < 40 && !(L.t === 'var' && L.name === x); guard++) {
      const n = L;
      if (n.t === 'neg') { L = n.a; R = { t: 'neg', a: R }; steps.push({ say: 'Multiply both sides by −1.', eq: eqText() }); continue; }
      if (n.t === 'call') {
        if (!INV[n.f]) return { ok: false, message: 'This one needs algebra the helper does not do yet: it cannot undo ' + n.f + '.' };
        L = n.args[0]; R = INV[n.f](R); steps.push({ say: 'Undo the ' + FNAME[n.f] + ' on both sides.', eq: eqText() }); continue;
      }
      if (n.t !== 'bin') return { ok: false, message: 'This one needs algebra the helper does not do yet.' };
      const inA = count(n.a, x) > 0, other = inA ? n.b : n.a;
      const o = show(other);
      if (n.op === '+') { L = inA ? n.a : n.b; R = bin('-', R, other); steps.push({ say: 'Subtract ' + o + ' from both sides.', eq: eqText() }); }
      else if (n.op === '-') {
        if (inA) { L = n.a; R = bin('+', R, other); steps.push({ say: 'Add ' + o + ' to both sides.', eq: eqText() }); }
        else { L = n.b; R = bin('-', other, R); steps.push({ say: 'Move ' + sym(x) + '\'s term to one side: ' + show(n.b) + ' = ' + o + ' − (the rest).', eq: eqText() }); }
      } else if (n.op === '*') { L = inA ? n.a : n.b; R = tidy(bin('/', R, other)); steps.push({ say: 'Divide both sides by ' + o + '.', eq: eqText() }); }
      else if (n.op === '/') {
        if (inA) { L = n.a; R = tidy(bin('*', R, other)); steps.push({ say: 'Multiply both sides by ' + o + '.', eq: eqText() }); }
        else { L = n.b; R = tidy(bin('/', other, R)); steps.push({ say: 'Multiply both sides by ' + show(n.b) + ', then divide by ' + show(R.b || R) + '.', eq: eqText() }); }
      } else if (n.op === '^') {
        if (!inA) return { ok: false, message: 'This one needs algebra the helper does not do yet: ' + x + ' is in a power.' };
        const p = n.b.t === 'num' ? n.b.v : null;
        L = n.a; R = p === 2 ? { t: 'call', f: 'sqrt', args: [R] } : p === 3 ? { t: 'call', f: 'cbrt', args: [R] } : bin('^', R, bin('/', N(1), n.b));
        steps.push({ say: p === 2 ? 'Take the square root of both sides.' : p === 3 ? 'Take the cube root of both sides.' : 'Raise both sides to the power 1/' + show(n.b) + '.', eq: eqText() });
      }
    }
    R = tidy(R);
    return { ok: true, steps, result: sym(x) + ' = ' + show(R), line: x + ' = ' + ascii(R) };
  }

  /* ================================================================ printing */
  const sym = name => {
    if (/^(d|delta)T$/.test(name)) return 'ΔT';
    const m = /^([A-Za-z]+)(_?)(.*)$/.exec(name);
    if (!m) return name;
    const base = GREEK[m[1]] || m[1];
    return base + (m[3] ? (m[2] ? '_' : '') + m[3] : '');
  };
  // Human form: implicit multiplication with spaces, π, ∛ and √.
  function show(n, parent, side) {
    if (n.t === 'num') return n.unit ? n.text : String(n.v);
    if (n.t === 'var') return n.name === 'pi' ? 'π' : sym(n.name);
    if (n.t === 'neg') return '−' + show(n.a, 'neg');
    if (n.t === 'call') { const a = show(n.args[0]); return n.f === 'sqrt' ? '√(' + a + ')' : n.f === 'cbrt' ? '∛(' + a + ')' : n.f + '(' + a + ')'; }
    const P = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 }[n.op];
    let s;
    if (n.op === '*') s = show(n.a, n, 'a') + ' ' + show(n.b, n, 'b');
    else if (n.op === '/') s = show(n.a, n, 'a') + ' / ' + (n.b.t === 'bin' && (n.b.op === '*' || n.b.op === '/') ? '(' + show(n.b) + ')' : show(n.b, n, 'b'));
    else if (n.op === '^') s = show(n.a, n, 'a') + (n.b.t === 'num' && n.b.v === 2 ? '²' : n.b.t === 'num' && n.b.v === 3 ? '³' : '^' + show(n.b, n, 'b'));
    else s = show(n.a, n, 'a') + (n.op === '+' ? ' + ' : ' − ') + show(n.b, n, 'b');
    if (parent && parent.t === 'bin') {
      const pp = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 }[parent.op];
      if (P < pp || (P === pp && side === 'b' && (parent.op === '-' || parent.op === '/') && !(parent.op === '/' && n.op === '*'))) return '(' + s + ')';
    }
    return s;
  }
  // Worksheet form (can be typed back in).
  function ascii(n, parent, side) {
    if (n.t === 'num') return String(n.v);
    if (n.t === 'var') return n.name;
    if (n.t === 'neg') return '-' + ascii(n.a, { t: 'bin', op: '^' }, 'a');
    if (n.t === 'call') return n.f + '(' + ascii(n.args[0]) + ')';
    const P = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 }[n.op];
    const s = ascii(n.a, n, 'a') + n.op + ascii(n.b, n, 'b');
    if (parent && parent.t === 'bin') { const pp = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 }[parent.op]; if (P < pp || (P === pp && side === 'b' && parent.op !== '+' && parent.op !== '*') || (parent.op === '^' && P <= pp)) return '(' + s + ')'; }
    return s;
  }
  // Pretty line text for the drawing and the working: Greek names, ·, ², π.
  function prettyLine(text) {
    const sp = splitLine(text);
    try {
      if (sp.form === 'assign') return sym(sp.name) + ' = ' + show(parseExpr(sp.expr)) + (sp.target ? ' in ' + prettyUnit(sp.target.text) : '');
      if (sp.form === 'convert') return show(parseExpr(sp.expr)) + ' in ' + prettyUnit(sp.target.text);
      if (sp.form === 'target') return sym(sp.name) + ' in ' + prettyUnit(sp.target.text);
      if (sp.form === 'expr') return show(parseExpr(sp.expr));
    } catch (e) { /* show the text as typed */ }
    return text;
  }
  const dimsText = dims => {
    const L = ['M', 'L', 'T', 'Θ', 'I'], sup = n => String(n).replace(/-/g, '⁻').replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);
    const p = dims.map((e, i) => e === 0 ? '' : L[i] + (e === 1 ? '' : sup(e))).filter(Boolean);
    return p.length ? p.join(' ') : 'no dimensions';
  };

  /* ================================================================ convert helper */
  function convert(value, from, to) {
    const a = unitOf(from), b = unitOf(to);
    if (!a) return { error: '"' + from + '" is not a unit this tool knows.' };
    if (!b) return { error: '"' + to + '" is not a unit this tool knows.' };
    if (!dEq(a.dims, b.dims)) return { error: 'These cannot be converted: ' + kindName(Q({ dims: a.dims, ang: a.ang })) + ' and ' + kindName(Q({ dims: b.dims, ang: b.ang })) + '.' };
    return { value: value * a.f / b.f, from: prettyUnit(a.text), to: prettyUnit(b.text) };
  }

  /* ================================================================ targets, working, description, snapshot */
  function targets(sheet) {
    return sheet.lines.filter(r => r.form === 'assign' && !r.given && !r.error && r.q).map(r => ({ key: 'L' + r.n, quantity: r.name, label: 'Line ' + r.n + ': ' + sym(r.name), unit: r.dispUnit, model: r.disp }));
  }
  function working(sheet, f) {
    const steps = [];
    sheet.lines.forEach(r => {
      if (r.form === 'blank') return;
      const lib = r.form === 'assign' ? LIBRARY.find(e => e.line.replace(/\s/g, '') === (r.name + '=' + (splitLine(r.text).expr || '')).replace(/\s/g, '')) : null;
      const val = r.error ? 'no value' : f(r.disp) + (r.dispUnit ? ' ' + r.dispUnit : '');
      steps.push({
        title: 'Line ' + r.n + (r.given ? ' (given)' : r.form === 'target' ? ' (check the unit)' : r.form === 'convert' ? ' (convert)' : ''),
        formula: prettyLine(r.text),
        sub: r.q && !r.given && r.form === 'assign' ? dimsText(r.q.dims) + ': ' + kindName(r.q) : '',
        result: (r.name && r.form === 'assign' ? sym(r.name) + ' = ' : '') + val + (r.matches ? ' (units match)' : ''),
        note: r.flags.concat(r.notes).map(x => x.text).join(' '),
        source: lib ? lib.src : r.form === 'convert' || r.form === 'target' ? 'Exact unit definitions (spec 06 §3.3)' : 'Your worksheet',
      });
    });
    return steps;
  }
  function describe(sheet, f, masked) {
    const ls = sheet.lines.filter(r => r.form !== 'blank');
    const flagged = ls.filter(r => r.error || r.flagged).length;
    let t = 'Worksheet with ' + ls.length + ' line' + (ls.length === 1 ? '' : 's') + (flagged ? ', ' + flagged + ' flagged' : ', no flags') + '. ';
    ls.forEach(r => { t += 'Line ' + r.n + ': ' + prettyLine(r.text) + (r.error ? ', no value. ' : masked && r.form === 'assign' && !r.given ? '. ' : ', ' + f(r.disp) + ' ' + (r.dispUnit || '') + '. '); });
    return t.trim();
  }
  function snapshot(sheet) {
    const values = {}, units = {};
    sheet.lines.forEach(r => { if (r.given && r.q) { values[r.name] = r.q.v; units[r.name] = siUnit(r.q.dims) || (r.q.ang ? 'rad' : ''); } });
    return { values, units };
  }
  function toText(sheet, f) {
    return sheet.lines.filter(r => r.form !== 'blank').map(r => r.n + '  ' + r.text + (r.error ? '    [no value: ' + r.error + ']' : (r.form === 'assign' && !r.given) || r.form === 'convert' || r.form === 'target' ? '    = ' + f(r.disp) + ' ' + (r.dispUnit || '') : '') + (r.flagged ? '    [flag]' : '')).join('\n');
  }

  return {
    DEF, DEFINITIONS, G_CALC, UNITS: U, FAMILIES, LIBRARY, D0, DIMS,
    unitOf, parseUnit, prettyUnit, tokenize, parseExpr, splitLine, evaluateSheet, applyFix, family, kindName, siUnit, dimsText,
    niceUnit, inUnit, convert, rearrange, libraryVars, show, ascii, sym, prettyLine, targets, working, describe, snapshot, toText,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UnitsCore;
