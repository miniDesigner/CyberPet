/**
 * 微信小游戏环境模拟测试
 *
 * 目的：验证模块在「CommonJS + wx API」环境下不会误判为 Node，
 *       画布能创建、主循环能启动、交互能落存档、绘制不抛异常，
 *       以及激励视频「看完才发奖」的判定。
 * 运行：node tools/test-wx-mock.js
 */
'use strict';

let canvasCreated = 0;
let rafCount = 0;
let toastCount = 0;
const storage = {};
let rewardedHandlers = [];
let rewardedShowResult = Promise.resolve();

function makeCtx() {
  const grad = { addColorStop() {} };
  const base = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 40 })
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {}; // 其余 Canvas 2D 方法一律 noop
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

const canvas = { width: 0, height: 0, getContext: () => makeCtx() };

global.wx = {
  createCanvas() { canvasCreated++; return canvas; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 2 }; },
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
  getStorageSync(key) { return storage[key] || ''; },
  setStorageSync(key, val) { storage[key] = val; },
  removeStorageSync(key) { delete storage[key]; },
  showToast() { toastCount++; },
  vibrateShort() {},
  createRewardedVideoAd(opts) {
    return {
      adUnitId: opts.adUnitId,
      show() { return rewardedShowResult; },
      load() { return Promise.resolve(); },
      onClose(fn) { rewardedHandlers.push(fn); },
      offClose(fn) { rewardedHandlers = rewardedHandlers.filter(h => h !== fn); }
    };
  }
};
global.requestAnimationFrame = () => { rafCount++; };

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.log('  FAIL ' + msg); }
}
function fireClose(res) {
  rewardedHandlers.slice().forEach(fn => fn(res));
}

async function run() {
  console.log('=== 微信小游戏环境模拟 ===');
  try {
    // 加载真实入口：game.js 会自动 start()
    require('../game.js');
    const MAIN = require('../src/main');
    const PLAT = require('../src/platform');

    assert(canvasCreated === 1, '小游戏环境下创建画布（未跳过初始化）');
    assert(rafCount >= 1, '主循环已启动（requestAnimationFrame 被调用）');

    // 模拟点击「领养一枚蛋」按钮
    MAIN._onTouch(187, 344);
    MAIN._draw();
    const store = MAIN.getStore();
    assert(!!store.currentEgg(), '点击领养后生成蛋');
    assert(Object.keys(storage).length > 0, '存档写入 wx.setStorageSync（未退化为内存）');

    // 模拟点击「调试」→ 强制病变死亡，验证绘制不抛异常
    MAIN._onTouch(350, 29);
    MAIN._onTouch(100, 180);
    MAIN._draw();
    assert(true, '调试面板与死亡结算后绘制无异常');

    // 激励视频：真实广告位，完整看完才 resolve(true)
    let done = null;
    const p1 = PLAT.showRewardedVideo('adunit-real').then(v => { done = v; });
    await Promise.resolve();
    fireClose({ isEnded: true });
    await p1;
    assert(done === true, '激励视频完整看完 → 发奖');

    done = null;
    const p2 = PLAT.showRewardedVideo('adunit-real').then(v => { done = v; });
    await Promise.resolve();
    fireClose({ isEnded: false });
    await p2;
    assert(done === false, '激励视频中途关闭 → 不发奖');

    // 无广告位：降级 mock，预览态视为看完
    done = null;
    const p3 = PLAT.showRewardedVideo('').then(v => { done = v; });
    await p3;
    assert(done === true, '无广告位降级 mock → 预览态发奖');
  } catch (err) {
    failed++;
    console.log('  FAIL 运行时异常: ' + (err && err.stack ? err.stack : err));
  }
  console.log('结果: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

run();
