// Units and Formula Checker: every test case in spec 06 §5 (UF-1 to UF-14), the
// parser's rules for ambiguous input, the exact definitions of §3.3, each mistake
// detector of §3.5, the formula library and the rearrange helper.
// Run: node dev/test.js
'use strict';
const C = require('./core.js');
const Shell = require('./vendor/shell.js');
const PL = require('./vendor/prediction-log.js');

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? ': ' + detail : '')); }
}
// 00 §10: 0.5% relative, or 0.01 in the displayed unit for values under 1.
function near(name, got, exp) {
  const good = typeof got === 'number' && isFinite(got) &&
    (Math.abs(exp) < 1 ? Math.abs(got - exp) <= 0.01 : Math.abs(got - exp) / Math.abs(exp) <= 0.005);
  ok(name, good, 'got ' + got + ', expected ' + exp);
}
const close = (name, got, exp, rel) => ok(name, typeof got === 'number' && Math.abs(got - exp) <= (rel || 1e-12) * Math.abs(exp), 'got ' + got + ', expected ' + exp);
const L = arr => arr.map(t => typeof t === 'string' ? { text: t, unit: '', kind: '' } : t);
const run = arr => C.evaluateSheet(L(arr)).lines;
const flagTypes = r => r.flags.map(f => f.type).join(',');
const f3 = v => Shell.util.fmtSig(v, 3);

console.log('UF-1: rpm used where rad/s is needed');
{
  const lines = ['P = 500 W', 'N = 300 rpm', 'T = P/N', 'T in N·m'];
  const r = run(lines);
  ok('UF-1 line 3 is flagged: rpm used in place of rad/s', r[2].flags.some(f => f.type === 'rpm' && f.level === 'warn' && f.text.startsWith('N is in rpm. P = τω needs rad/s. Multiply by 2π/60.')));
  ok('UF-1 the flag offers a fix', r[2].flags[0].fix && r[2].flags[0].fix.kind === 'omega' && r[2].flags[0].fix.from === 'N');
  ok('UF-1 the target line matches the units', r[3].matches === true && r[3].dispUnit === 'N·m');
  const fixed = C.applyFix(L(lines), 2, r[2].flags[0].fix);
  ok('UF-1 Apply fix inserts ω = 2πN/60 and uses it', fixed.map(x => x.text).join(' | ') === 'P = 500 W | N = 300 rpm | omega = 2*pi*N/60 | T = P/omega | T in N·m');
  const r2 = C.evaluateSheet(fixed).lines;
  near('UF-1 after the fix ω = 31.4 rad/s', r2[2].disp, 31.4); ok('UF-1 ω is shown in rad/s', r2[2].dispUnit === 'rad/s');
  near('UF-1 after the fix T = 15.9 N·m', r2[3].disp, 15.9);
  ok('UF-1 no flags after the fix', r2.every(x => !x.flags.length));
  ok('the ω line notes the rpm conversion (QUESTIONS Q24)', r2[2].notes.some(n => n.type === 'conv'));
}

console.log('UF-2: required diameter');
{
  const r = run(['T = 10 N·m', 'tau = 50 MPa', 'd = cbrt(16*T/(pi*tau))', 'd in mm']);
  near('UF-2 d = 10.1 mm (10.06)', r[3].disp, 10.06);
  ok('UF-2 shown in mm without asking', r[2].dispUnit === 'mm');
  ok('UF-2 no flags', r.every(x => !x.flags.length));
}

console.log('UF-3 and UF-4: things that cannot be done');
{
  const r3 = run(['a = 5 N + 2 m'])[0];
  ok('UF-3 add mismatch flag, no value', r3.error && flagTypes(r3) === 'add' && r3.disp === undefined);
  ok('UF-3 message', r3.error === 'You are adding a force (N) to a length (m). These cannot be added.', r3.error);
  const r4 = run(['x = tan(4 mm)'])[0];
  ok('UF-4 function argument flag', r4.error === 'tan needs an angle or a ratio. 4 mm is a length.' && flagTypes(r4) === 'func', r4.error);
  ok('a later line that uses a value-less line says why', run(['a = 5 N + 2 m', 'b = 2*a'])[1].error === 'a has no value (line 1).');
}

console.log('UF-5 to UF-9: conversions');
{
  near('UF-5 1 hp = 745.70 W', run(['1 hp in W'])[0].disp, 745.70);
  near('UF-6 85 N·cm = 0.85 N·m', run(['85 N·cm in N·m'])[0].disp, 0.85);
  const r7 = run(['1 MPa in N/mm^2'])[0];
  near('UF-7 1 MPa = 1 N/mm²', r7.disp, 1); ok('UF-7 shown as N/mm²', r7.dispUnit === 'N/mm²');
  const r8 = run(['Q = 3000 J', 'm = 1 kg', 'c = 452 J/(kg·°C)', 'dT = Q/(m*c)']);
  near('UF-8 ΔT = 6.64 °C (6.637)', r8[3].disp, 6.637); ok('UF-8 in °C', r8[3].dispUnit === '°C');
  ok('UF-8 no temperature flag: dT is a change', !r8[3].flags.length);
  near('UF-9 100 lbf·in = 11.3 N·m (11.298)', run(['100 lbf·in in N·m'])[0].disp, 11.298);
  ok('a conversion between different kinds is refused', run(['1 hp in N'])[0].flags[0].type === 'target');
}

console.log('UF-10: degrees in e^(μθ)');
{
  const r = run(['mu = 0.3', 'theta = 180 deg', 'k = exp(mu*theta)']);
  near('UF-10 k = 2.57', r[2].disp, 2.57);
  ok('UF-10 degree flag: "e^(μθ) needs θ in radians. Converted 180° to 3.14 rad."', r[2].flags.some(f => f.type === 'deg' && f.text === 'e^(μθ) needs θ in radians. Converted 180° to 3.14 rad.'), JSON.stringify(r[2].flags));
  ok('"2 kg * g" is not kg·grams', Math.abs(run(['F = 2 kg * g'])[0].q.v - 19.62) < 1e-9 && C.unitOf('N*m') && C.unitOf('N*m').kind === 'torque');
  const fx = C.applyFix(L(['mu = 0.3', 'theta = 180 deg', 'k = exp(mu*theta)']), 2, r[2].flags[0].fix);
  ok('Apply fix writes θ in radians', fx[1].text === 'theta = 3.14159 rad');
  near('and k is still 2.57', C.evaluateSheet(fx).lines[2].disp, 2.57);
  near('180° typed with the symbol', run(['a = 180°', 'b = sin(a/2)'])[1].disp, 1);
}

console.log('UF-11: torque and energy');
{
  const r = run(['T = 2 N·m', 'E = 3 J', 'x = T + E']);
  ok('UF-11 kind warning: same dimensions, different kinds', r[2].flags.some(f => f.type === 'kind' && /same units \(N·m = J\) but are different kinds/.test(f.text)));
  ok('UF-11 the value is still worked out', Math.abs(r[2].q.v - 5) < 1e-12);
  const tagged = C.evaluateSheet([{ text: 'T = 2 N·m', unit: '', kind: 'energy' }, { text: 'E = 3 J', unit: '', kind: '' }, { text: 'x = T + E', unit: '', kind: '' }]).lines;
  ok('tagging T as an energy clears the warning', !tagged[2].flags.length);
  ok('ft·lbf is an energy and lbf·ft a torque', C.unitOf('ft·lbf').kind === 'energy' && C.unitOf('lbf·ft').kind === 'torque');
}

console.log('UF-12 and UF-13: rearranging');
{
  const r = C.rearrange('tau = 16*T/(pi*d^3)', 'd');
  ok('UF-12 d = ∛(16 T / (π τ))', r.ok && r.result === 'd = ∛(16 T / (π τ))', r.result);
  ok('UF-12 with steps shown', r.steps.length === 4 && r.steps[3].say === 'Take the cube root of both sides.' && r.steps[2].eq === 'd³ = 16 T / (π τ)');
  ok('UF-12 the answer can be typed back in', r.line === 'd = cbrt(16*T/(pi*tau))');
  const back = run(['T = 10 N·m', 'tau = 50 MPa', r.line]);
  near('UF-12 the rearranged line gives UF-2\'s diameter', back[2].disp, 10.06);
  const r13 = C.rearrange('T_e = mu*g*(mb + mp)*L + mp*g*H', 'mp');
  ok('UF-13 declines: mp appears twice', !r13.ok && r13.message === 'This one needs algebra the helper does not do yet: mp appears twice.');
  ok('ω from P = τω', C.rearrange('P = tau*omega', 'omega').result === 'ω = P / τ');
  ok('ω from KE = ½Iω²', C.rearrange('KE = 0.5*I*omega^2', 'omega').result === 'ω = √(KE / (0.5 I))', C.rearrange('KE = 0.5*I*omega^2', 'omega').result);
  ok('θ from T₁ = T₂ e^(μθ) undoes the exponential', C.rearrange('T1 = T2*exp(mu*theta)', 'theta').result === 'θ = ln(T1 / T2) / μ', C.rearrange('T1 = T2*exp(mu*theta)', 'theta').result);
  ok('a variable that is not there', !C.rearrange('P = F*v', 'x').ok);
  ok('the left side can be the unknown', C.rearrange('P = F*v', 'P').ok && C.rearrange('P = F*v', 'P').result === 'P = F v');
  ok('subtraction', C.rearrange('a = b - c', 'c').result === 'c = b − a', C.rearrange('a = b - c', 'c').result);
}

console.log('UF-14: percent');
{
  const r = run(['eta = 90 %', 'Pout = eta*Pin']);
  ok('UF-14 percent note on the given', r[0].notes.some(n => n.type === 'percent' && /0.9/.test(n.text)));
  ok('UF-14 uses 0.90', Math.abs(r[0].q.v - 0.9) < 1e-12);
  const r2 = run(['eta = 90 %', 'Pin = 100 W', 'Pout = eta*Pin']);
  near('with P_in given, P_out = 90 W', r2[2].disp, 90);
  ok('and the step notes the percent', r2[2].notes.some(n => n.type === 'percent' && /90% is 0.9 in this formula/.test(n.text)));
}

console.log('Parser rules for ambiguous input');
{
  near('0.5*m*v^2: m is a variable, not metres', run(['m = 2 kg', 'v = 3 m/s', 'KE = 0.5*m*v^2'])[2].disp, 9);
  ok('5 g after a number is grams', Math.abs(run(['x = 5 g'])[0].q.v - 0.005) < 1e-15);
  const rg = run(['F = 2 kg * g']);
  ok('g on its own is 9.81 m/s², with a note', Math.abs(rg[0].q.v - 19.62) < 1e-9 && rg[0].notes.some(n => n.type === 'g'));
  ok('your own g wins', Math.abs(run(['g = 10 m/s^2', 'F = 2 kg * g'])[1].q.v - 20) < 1e-12);
  near('25 in is 25 inches', run(['x = 25 in', 'x in mm'])[1].disp, 635);
  ok('a space multiplies units: 10 N m', C.splitLine('T = 10 N m').form === 'assign' && run(['T = 10 N m'])[0].q.kind === 'torque');
  ok('unit after a number with no space: 5N', Math.abs(run(['F = 5N'])[0].q.v - 5) < 1e-12);
  ok('5Nm is not a unit this tool knows', /is not a unit this tool knows/.test(run(['T = 5Nm'])[0].error));
  ok('two values side by side', /Put \* between them/.test(run(['a = 2', 'b = a a'])[1].error));
  ok('unknown function', /not a function this tool knows/.test(run(['x = foo(2)'])[0].error));
  ok('missing bracket', /bracket/.test(run(['x = (2 + 3'])[0].error));
  near('N/mm² typed with the superscript', run(['1 MPa in N/mm²'])[0].disp, 1);
  near('m/s^2 and division after a unit', run(['a = 9.81 m/s^2', 't = 2 s', 'v = a*t'])[2].disp, 19.62);
  near('20 mm/2: the 2 divides', run(['r = 20 mm/2', 'r in mm'])[1].disp, 10);
  ok('variables are case sensitive', run(['t = 2 s', 'x = 3*T'])[1].error === 'T is not defined yet. Give it a value on an earlier line.');
  ok('the last " in " followed by a unit is the target', C.splitLine('100 lbf·in in N·m').form === 'convert' && C.splitLine('100 lbf·in in N·m').target.text === 'N·m');
  ok('a blank line or a # comment is skipped', run(['', '# notes', 'x = 1'])[2].disp === 1 && run(['# notes'])[0].form === 'blank');
  ok('Greek names display as symbols', C.prettyLine('tau = 16*T/(pi*d^3)') === 'τ = 16 T / (π d³)' && C.sym('dT') === 'ΔT' && C.sym('omega') === 'ω');
  ok('a power must be a plain number', /plain number/.test(run(['a = 2 m', 'b = 3^a'])[1].error));
  ok('√ of m³ is not a whole unit', /does not give a whole unit/.test(run(['V = 8 m^3', 's = sqrt(V)'])[1].error));
  ok('divide by zero is explained, not Infinity', /divides by zero/.test(run(['a = 0 m', 'b = 1/a'])[1].error));
}

console.log('Exact definitions (§3.3, acceptance: every constant traces to them)');
{
  close('1 in = 0.0254 m', C.UNITS.in.f, 0.0254); close('1 ft = 12 in', C.UNITS.ft.f, 12 * 0.0254);
  close('1 lb = 0.45359237 kg', C.UNITS.lb.f, 0.45359237);
  close('1 lbf = 4.4482216152605 N', C.UNITS.lbf.f, 4.4482216152605, 1e-13);
  close('1 ozf = 1/16 lbf', C.UNITS.ozf.f, 4.4482216152605 / 16, 1e-13);
  close('1 kgf = 9.80665 N', C.UNITS.kgf.f, 9.80665);
  close('1 hp = 33,000 ft·lbf/min = 745.70 W', C.UNITS.hp.f, 33000 * 0.3048 * 4.4482216152605 / 60, 1e-12); near('which is 745.70 W', C.UNITS.hp.f, 745.70);
  close('1 psi = 1 lbf/in²', C.UNITS.psi.f, 4.4482216152605 / 0.0254 ** 2, 1e-12);
  close('1 ksi = 1000 psi', C.UNITS.ksi.f, 1000 * C.UNITS.psi.f, 1e-12);
  close('1 rev = 2π rad', C.UNITS.rev.f, 2 * Math.PI); close('1 rpm = 1 rev/min', C.UNITS.rpm.f, 2 * Math.PI / 60);
  ok('g for calculations is 9.81 m/s²', C.G_CALC === 9.81);
  const listed = C.DEFINITIONS.map(d => d[0]).join(' | ');
  ok('the help list names every defined unit', ['1 in', '1 ft', '1 lb', 'g₀', '1 lbf', '1 ozf', '1 kgf', '1 hp', '1 psi', '1 ksi', '1 rev', '1 rpm', '1 min', '1 h', 'g in calculations'].every(k => listed.includes(k)), listed);
  ok('every non-metric unit in the table is built from those definitions', ['in', 'ft', 'lb', 'lbf', 'ozf', 'kgf', 'hp', 'psi', 'ksi', 'rev', 'rpm', 'min', 'h'].every(k => C.UNITS[k]));
}

console.log('Other detectors (§3.5)');
{
  const ra = run(['w = 300 rpm', 'r = 0.1 m', 'v = w*r']);
  ok('rpm in v = ωr is flagged', ra[2].flags.some(f => f.type === 'rpm' && /v = ωr needs rad\/s/.test(f.text)));
  near('and converted: v = 3.14 m/s', ra[2].disp, 3.14);
  const rp = run(['M = 5000 N·mm', 'd = 0.02 m', 'sigma = 32*M/(pi*d^3)']);
  ok('mixed mm and m in a stress: converted and noted', rp[2].notes.some(n => n.type === 'prefix' && /mm and m/.test(n.text)));
  near('σ = 6.37 MPa', rp[2].disp, 6.37); ok('stress shown in MPa', rp[2].dispUnit === 'MPa');
  const rt = run(['T = 10 N·m', 'T in MPa']);
  ok('target unit mismatch: "This result is a torque. You asked for it in MPa."', rt[1].flags[0].text.startsWith('This result is a torque. You asked for it in MPa'));
  ok('its fix asks for N·m', C.applyFix(L(['T = 10 N·m', 'T in MPa']), 1, rt[1].flags[0].fix)[1].text === 'T in N·m');
  const rT = run(['T1 = 20 °C', 'm = 1 kg', 'c = 452 J/(kg·°C)', 'Q = m*c*T1']);
  ok('absolute temperature in Q = mcΔT is flagged (QUESTIONS Q25)', rT[3].flags.some(f => f.type === 'temp' && /temperature change/.test(f.text)));
  const rD = run(['T1 = 20 °C', 'T2 = 35 °C', 'dT = T2 - T1', 'm = 1 kg', 'c = 452 J/(kg·°C)', 'Q = m*c*dT']);
  ok('a difference of two temperatures is a change: no flag', !rD[5].flags.length);
  near('Q = 6780 J', rD[5].disp, 6.78); ok('in kJ', rD[5].dispUnit === 'kJ');
}

console.log('Display units and conversion helper');
{
  const r = run(['P = 5000 W', 'P2 = P*2']);
  ok('a computed power of 10 kW is shown in kW', r[1].dispUnit === 'kW' && r[1].disp === 10);
  ok('a given keeps its typed unit', r[0].dispUnit === 'W');
  const chosen = C.evaluateSheet([{ text: 'P = 5000 W', unit: 'hp', kind: '' }]).lines[0];
  near('a display unit can be chosen: 5000 W = 6.71 hp', chosen.disp, 6.705);
  ok('the dropdown lists only compatible units', r[0].units.join() === 'W,kW,hp');
  ok('a chosen unit that does not fit is ignored', C.evaluateSheet([{ text: 'P = 5000 W', unit: 'm', kind: '' }]).lines[0].dispUnit === 'W');
  near('convert 85 N·cm to N·m', C.convert(85, 'N·cm', 'N·m').value, 0.85);
  ok('convert refuses unlike units', /cannot be converted/.test(C.convert(1, 'hp', 'N').error));
  ok('convert names an unknown unit', C.convert(1, 'furlong', 'm').error === '"furlong" is not a unit this tool knows.');
  ok('dimensions text', C.dimsText([1, 2, -2, 0, 0]) === 'M L² T⁻²');
  ok('every family has a name (a percent line once had none)', ['eta = 90 %', 'x = 2 rad', 'w = 3 rpm', 'k = 2', 'V = 1 m^3', 'A = 1 m^4'].every(t => { const q = run([t])[0].q; return typeof C.kindName(q) === 'string' && C.kindName(q).length > 3; }));
}

console.log('Formula library (§3.6)');
{
  ok('18 formulas from the unit plan, each with a source', C.LIBRARY.length === 18 && C.LIBRARY.every(e => e.src && e.show && e.line));
  ok('every library line parses', C.LIBRARY.every(e => { try { C.parseExpr(C.splitLine(e.line).expr); return true; } catch (x) { return false; } }));
  ok('library variables', C.libraryVars(C.LIBRARY.find(e => e.id === 'tt')).join() === 'tau,T,d');
  const ws = run(['r = 0.2 m', 'F = 50 N', 'tau = r*F']);
  ok('a library line in a worksheet cites its source in the working', C.working({ lines: ws }, f3)[2].source === 'OpenStax College Physics 2e, 9.2');
}

console.log('Targets, working, text export and records');
{
  const sheet = C.evaluateSheet(L(['P = 500 W', 'N = 300 rpm', 'omega = 2*pi*N/60', 'T = P/omega', 'T in N·m']));
  const t = C.targets(sheet);
  ok('predict targets are the computed lines (QUESTIONS Q23)', t.map(x => x.key).join() === 'L3,L4' && t[1].quantity === 'T' && t[1].unit === 'N·m');
  near('target model in the display unit', t[1].model, 15.9);
  const w = C.working(sheet, f3);
  ok('one working step per line, with dimensions', w.length === 5 && w[3].sub === 'M L² T⁻²: a torque' && w[3].result === 'T = 15.9 N·m');
  ok('text export is copyable', C.toText(sheet, f3).split('\n')[3] === '4  T = P/omega    = 15.9 N·m');
  const rec = PL.makeRecord({ tool: 'Units and Formula Checker', toolVersion: '1.0.0', student: 'A', problemId: 'sandbox-x', quantity: t[1].quantity, unit: t[1].unit, predicted: 1.67, model: t[1].model, attempt: 1, inputs: C.snapshot(sheet) });
  ok('record: the classic rpm mistake is 90% off', rec.pctPredVsModel < -89);
  ok('snapshot holds the givens in SI', Math.abs(rec.inputs.values.N - 10 * Math.PI) < 1e-9 && rec.inputs.values.P === 500);
  ok('description is plain text with no NaN', !/NaN|undefined/.test(C.describe(sheet, f3, false)) && /Line 4: T = P \/ ω, 15.9 N·m/.test(C.describe(sheet, f3, false)));
}

console.log('Performance (acceptance: 30 lines in under 50 ms)');
{
  const lines = [];
  for (let k = 0; k < 10; k++) lines.push('P' + k + ' = ' + (500 + k) + ' W', 'N' + k + ' = ' + (300 + k) + ' rpm', 'T' + k + ' = P' + k + '/(2*pi*N' + k + '/60)');
  const t0 = process.hrtime.bigint();
  for (let k = 0; k < 20; k++) C.evaluateSheet(L(lines));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  ok('30 lines recalculate in ' + ms.toFixed(2) + ' ms (Node)', ms < 50);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
