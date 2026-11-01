// Browser checks for the Units and Formula Checker: the standard shell checks,
// then spec 06's test cases and acceptance criteria through the interface.
// Run: node dev/e2e.js   (needs Playwright: npm i --no-save playwright)
'use strict';
const path = require('path');
const fs = require('fs');
const kit = require('./vendor/e2e-kit.js');

(async () => {
  const root = path.join(__dirname, '..');
  const t = await kit.start(root);
  const { page } = t;
  const shots = path.join(root, 'docs', 'screenshots');
  await kit.standard(t, {
    drawing: '#ufRows',
    predictKeys: ['L3'],
    change: async p => { await p.fill('#ufIn0', 'P = 600 W'); },
    mutate: async p => { await p.fill('#ufIn1', 'N = 400 rpm'); },
    shotDir: shots, shotName: 'units-formula-checker',
  });

  const val = i => page.textContent('#ufV' + i);
  const cls = i => page.getAttribute('#ufIn' + i, 'class').then(() => page.evaluate(k => document.getElementById('ufIn' + k).closest('li').className, i));
  const detail = () => page.textContent('#shResultsBody');
  // Type a fresh worksheet with the keyboard, one line per Enter.
  const typeSheet = async lines => {
    await page.click('#ufClearWs');
    for (const l of lines) { await page.keyboard.type(l); await page.keyboard.press('Enter'); }
  };

  console.log('UF-1: the default worksheet, the flag and Apply fix');
  await t.fresh();
  t.ok('UF-1 line 3 is flagged', (await cls(2)).includes('flag') && (await page.textContent('#ufS2')) === '⚑');
  await page.click('#ufS2');
  t.ok('UF-1 the flag explains: rpm used where rad/s is needed', (await detail()).includes('N is in rpm. P = τω needs rad/s. Multiply by 2π/60.'));
  t.ok('UF-1 line 4 says the units match', (await val(3)).includes('matches'));
  await page.click('#shResultsBody .fixbtn');
  t.ok('UF-1 Apply fix adds ω = 2πN/60 and uses it', (await page.inputValue('#ufIn2')) === 'omega = 2*pi*N/60' && (await page.inputValue('#ufIn3')) === 'T = P/omega');
  t.ok('UF-1 after the fix: ω = 31.4 rad/s, T = 15.9 N·m', (await val(2)).startsWith('31.4 rad/s') && (await val(3)).startsWith('15.9 N·m'));
  t.ok('UF-1 no flags left', await page.evaluate(() => [...document.querySelectorAll('#ufRows li')].every(li => !/flag|error/.test(li.className))));
  const live = async txt => page.waitForFunction(x => document.getElementById('shLive').textContent.includes(x), txt, { timeout: 2000 }).then(() => true).catch(() => false);
  t.ok('the fix is announced', await live('Fix applied. Added ω = 2πN/60 above'));

  console.log('UF-2: typed with the keyboard');
  await typeSheet(['T = 10 N·m', 'tau = 50 MPa', 'd = cbrt(16*T/(pi*tau))', 'd in mm']);
  t.ok('UF-2 d = 10.1 mm, no flags', (await val(2)).startsWith('10.1 mm') && (await val(3)).startsWith('10.1 mm') && (await cls(2)).includes('ok'));
  t.ok('Enter at the end makes a new line and moves to it', await page.evaluate(() => document.activeElement.id === 'ufIn4'));
  t.ok('each line is announced (acceptance)', await live('Line 4: d in mm. 10.1 mm. The units match.'), await page.textContent('#shLive'));
  await page.keyboard.press('ArrowUp');
  t.ok('↑ goes to the line above', await page.evaluate(() => document.activeElement.id === 'ufIn3'));
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Backspace');
  t.ok('Backspace in an empty line removes it', await page.locator('#ufRows li').count() === 4);

  console.log('UF-3 to UF-9');
  await typeSheet(['a = 5 N + 2 m', 'x = tan(4 mm)', '1 hp in W', '85 N·cm in N·m', '1 MPa in N/mm^2', '100 lbf·in in N·m', 'Q = 3000 J', 'm = 1 kg', 'c = 452 J/(kg·°C)', 'dT = Q/(m*c)']);
  t.ok('UF-3 no value', (await val(0)).includes('no value') && (await cls(0)).includes('error'));
  await page.click('#ufS0');
  t.ok('UF-3 add mismatch message', (await detail()).includes('You are adding a force (N) to a length (m). These cannot be added.'));
  await page.click('#ufS1');
  t.ok('UF-4 function argument message', (await detail()).includes('tan needs an angle or a ratio. 4 mm is a length.'));
  t.ok('UF-5 1 hp = 745.70 W', (await val(2)).startsWith('745.70 W'));
  t.ok('UF-6 85 N·cm = 0.85 N·m', (await val(3)).startsWith('0.85 N·m'));
  t.ok('UF-7 1 MPa = 1 N/mm²', (await val(4)).startsWith('1 N/mm²'));
  t.ok('UF-9 100 lbf·in = 11.298 N·m', (await val(5)).startsWith('11.298 N·m'));
  t.ok('UF-8 ΔT = 6.64 °C', (await val(9)).startsWith('6.64 °C'));
  await kit.noBadNumbers(t, 'UF-3 to UF-9');

  console.log('UF-10, UF-11 and UF-14: notes and warnings');
  await typeSheet(['mu = 0.3', 'theta = 180 deg', 'k = exp(mu*theta)', 'T = 2 N·m', 'E = 3 J', 'x = T + E', 'eta = 90 %', 'Pin = 100 W', 'Pout = eta*Pin']);
  t.ok('UF-10 k = 2.57', (await val(2)).startsWith('2.57'));
  t.ok('the degree value shows as 180°', (await val(1)).startsWith('180°'));
  await page.click('#ufS1');
  await page.focus('#ufIn5'); await page.keyboard.press('Enter');
  t.ok('a flag is announced with its line (acceptance)', await live('Line 6: x = T + E. 5.00 N m. Flag: T is a torque and E is an energy'), await page.textContent('#shLive'));
  await page.click('#ufS2');
  t.ok('UF-10 the degree note', (await detail()).includes('e^(μθ) needs θ in radians. Converted 180° to 3.14 rad.'));
  await page.click('#ufS5');
  t.ok('UF-11 kind warning', (await cls(5)).includes('flag') && (await detail()).includes('different kinds of quantity'));
  await page.click('#ufIn3');
  t.ok('a torque-or-energy line offers a kind choice', await page.isVisible('#ufKind'));
  await page.selectOption('#ufKind', 'energy');
  t.ok('tagging T as an energy clears the UF-11 warning', !(await cls(5)).includes('flag'));
  await page.click('#ufS8');
  t.ok('UF-14 percent note, 90 W', (await detail()).includes('90% is 0.9 in this formula') && (await val(8)).startsWith('90.0 W'));

  console.log('Display units');
  await page.selectOption('#ufU7', 'hp');
  t.ok('the dropdown changes the display: 100 W = 0.134 hp', (await val(7)).startsWith('0.134 hp'));
  t.ok('it lists only compatible units', (await page.evaluate(() => [...document.querySelectorAll('#ufU7 option')].map(o => o.value).join())) === 'W,kW,hp');

  console.log('UF-12 and UF-13: the formula library');
  await page.click('#shTab_library');
  await page.click('[data-lib="tt"]'); await page.click('[data-rearr="d"]');
  t.ok('UF-12 d = ∛(16 T / (π τ)) with four steps', (await page.textContent('#ufRearrRes')) === 'd = ∛(16 T / (π τ))' && await page.locator('#ufSteps li').count() === 4);
  await page.click('[data-insline]');
  t.ok('Insert puts the rearranged line in the worksheet', (await page.evaluate(() => window.__app.state.tab)) === 'worksheet' && await page.evaluate(() => window.__app.state.lines.some(l => l.text === 'd = cbrt(16*T/(pi*tau))')));
  await page.click('#shTab_library');
  await page.click('[data-lib="te"]'); await page.click('[data-rearr="mp"]');
  t.ok('UF-13 the helper declines: mp appears twice', (await page.textContent('#ufRearrMsg')) === 'This one needs algebra the helper does not do yet: mp appears twice.');
  await page.click('#shTab_worksheet');
  await page.click('#ufIn0');
  await page.click('#ufLibSide [data-insert="Ptw"]');
  t.ok('Insert from the side list adds below the selected line', (await page.inputValue('#ufIn1')) === 'P = tau*omega');

  console.log('Convert tab');
  await page.click('#shTab_convert');
  await page.fill('#ufCvV', '85'); await page.fill('#ufCvF', 'N·cm'); await page.fill('#ufCvT', 'N·m');
  t.ok('85 N·cm = 0.85 N·m', (await page.textContent('#ufCvOut')).includes('= 0.85 N·m'));
  await page.fill('#ufCvT', 'N');
  t.ok('unlike units are refused', (await page.textContent('#ufCvOut')).includes('cannot be converted'));
  const cvText = await page.textContent('#ufTabCv');
  t.ok('the exact definitions are listed on the Convert tab', ['0.0254 m', '0.45359237 kg', '9.80665 m/s²', '4.4482216152605 N', '33,000 ft·lbf/min', '1 lbf/in²', '2π rad'].every(x => cvText.includes(x)));
  await page.click('#shHelp');
  const help = await page.textContent('#shHelpDlg');
  t.ok('help lists every exact definition (acceptance)', ['0.0254 m', '0.45359237 kg', '9.80665 m/s²', '4.4482216152605 N', '1/16 lbf', '33,000 ft·lbf/min', '1 lbf/in²', '1000 psi', '2π rad', '1 rev/min', '9.81 m/s²'].every(x => help.includes(x)));
  await page.keyboard.press('Escape');

  console.log('Predict first');
  await t.fresh();
  await page.click('#shPredict');
  t.ok('worked-out lines hide their values; givens stay', (await val(0)).startsWith('500 W') && (await val(2)) === '?' && (await val(3)).includes('?'));
  await page.fill('#shPf_L3', '1.67');
  await page.click('#shPfBox [data-check]');
  t.ok('Check reveals and logs the line\'s quantity', (await val(2)).startsWith('15.9') && await page.evaluate(() => window.__app.log.slice(-1)[0].quantity === 'T'));
  t.ok('the classic rpm mistake is far off', (await page.textContent('#shPfBox')).includes('−89.5%'));

  console.log('Text export and report');
  await page.click('#shPredict');
  const txt = await kit.download(t, () => page.click('#ufTxt'));
  t.ok('text export', /_units-formula-checker_worksheet_\d{4}-\d{2}-\d{2}\.txt$/.test(txt.name) && txt.buf.toString('utf8').includes('3  T = P/N    = 15.9 N·m    [flag]'));
  await page.evaluate(() => { window.print = () => { }; });
  await page.click('#shReport');
  const rep = await page.textContent('#sh-report');
  t.ok('report has the worksheet text and the flags', rep.includes('Worksheet as text') && rep.includes('Flags and notes') && rep.includes('N is in rpm'));

  console.log('Performance (acceptance: 30 lines under 50 ms)');
  await page.evaluate(() => {
    const L = [];
    for (let k = 0; k < 10; k++) L.push({ text: 'P' + k + ' = ' + (500 + k) + ' W', unit: '', kind: '' }, { text: 'N' + k + ' = ' + (300 + k) + ' rpm', unit: '', kind: '' }, { text: 'T' + k + ' = P' + k + '/(2*pi*N' + k + '/60)', unit: '', kind: '' });
    window.__app.state.lines = L; window.__app.changed();
  });
  t.ok('30 lines on the page', await page.locator('#ufRows li').count() === 30);
  const ms = await kit.timeIt(page, 'window.__app.changed()', 15);
  t.ok('a 30-line worksheet recalculates and redraws in under 50 ms (' + ms.toFixed(1) + ' ms)', ms < 50);
  fs.writeFileSync(path.join(shots, 'perf.txt'), '30-line worksheet, full update (change + render), median of 15: ' + ms.toFixed(1) + ' ms\n');
  await kit.noBadNumbers(t, '30 lines');

  await t.finish();
})().catch(e => { console.error(e); process.exit(1); });
