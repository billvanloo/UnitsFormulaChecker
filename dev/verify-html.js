// Confirms the code inlined in index.html is exactly the tested code, then runs
// spec cases on the inline copy. Run: node dev/verify-html.js   (--fix copies dev/core.js in)
'use strict';
const path = require('path');
const vb = require('./vendor/verify-blocks.js');
const root = path.join(__dirname, '..');
if (process.argv.includes('--fix') && vb.syncCore(root)) console.log('Copied dev/core.js into index.html.');
let passed = 0, failed = 0;
const ok = (n, c, d) => { if (c) { passed++; console.log('  PASS ' + n); } else { failed++; console.log('  FAIL ' + n + (d ? ': ' + d : '')); } };
const near = (n, g, e) => ok(n, typeof g === 'number' && (Math.abs(e) < 1 ? Math.abs(g - e) <= 0.01 : Math.abs(g - e) / Math.abs(e) <= 0.005), 'got ' + g + ', expected ' + e);

console.log('Inline blocks match dev/core.js and dev/vendor/');
const problems = vb.verify(root);
problems.forEach(p => ok(p, false));
ok('every inline block matches its tested copy', problems.length === 0);

console.log('Inline copy runs the spec cases');
const C = vb.loadInline(root, 'core');
const L = a => a.map(t => ({ text: t, unit: '', kind: '' }));
const r1 = C.evaluateSheet(L(['P = 500 W', 'N = 300 rpm', 'T = P/N', 'T in N·m'])).lines;
ok('UF-1 flag (inline)', r1[2].flags.some(f => f.type === 'rpm'));
near('UF-2 d (inline)', C.evaluateSheet(L(['T = 10 N·m', 'tau = 50 MPa', 'd = cbrt(16*T/(pi*tau))', 'd in mm'])).lines[3].disp, 10.06);
ok('UF-12 (inline)', C.rearrange('tau = 16*T/(pi*d^3)', 'd').result === 'd = ∛(16 T / (π τ))');
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
