/**
 * tools/screenshot.js — 用 Playwright 对浏览器预览截图，验证渲染与交互
 * 运行：node tools/screenshot.js（先启动 python -m http.server 8901）
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', '.workbuddy', 'tmp', 'shots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 800 }, deviceScaleFactor: 1 });

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('favicon') && !m.text().includes('404')) errors.push('CONSOLE: ' + m.text());
  });

  await page.goto('http://127.0.0.1:8901/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '01-adopt.png') });

  // 领养（按钮中心约 y=404）
  await page.mouse.click(210, 404);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, '02-egg.png') });

  // 用调试接口直接推进到孵化完成，再点破壳按钮（右，中心约 x=290,y=670）
  await page.evaluate(() => { MAIN.getStore().debugAdvance(24 * 6); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '03-egg-ready.png') });
  await page.mouse.click(290, 670);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, '04-hatch.png') });

  // 关闭破壳弹层（按钮在面板底部，约 y=454）
  await page.mouse.click(210, 454);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, '05-care.png') });

  // 调试面板（右上）
  await page.mouse.click(385, 29);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, '06-debug.png') });
  // 关闭
  await page.mouse.click(210, 740);
  await page.waitForTimeout(200);

  // 注入后代 + 强制自然死亡 → 继承
  await page.evaluate(() => {
    const st = MAIN.getStore();
    st.debugInjectOffspring();
    st.debugKill('age');
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '07-death.png') });

  const state = await page.evaluate(() => {
    const st = MAIN.getStore();
    return {
      scene: MAIN._getScene(),
      hasMainPet: !!st.save.mainPet,
      petSpecies: st.save.mainPet && st.save.mainPet.species,
      inheritedFrom: st.save.mainPet && st.save.mainPet.parents,
      offspringSlot: !!st.save.offspringSlot,
      albumCount: st.save.album.length,
      eggCount: st.save.eggs.length
    };
  });

  console.log('运行时状态:', JSON.stringify(state));
  console.log(errors.length ? '运行时错误:\n' + errors.join('\n') : '无运行时错误');
  console.log('截图目录:', OUT);

  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
