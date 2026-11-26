/**
 * src/main.js — 主循环与场景管理
 *
 * 场景：adopt（领养/蛋）→ care（照顾）→ death（死亡告别）
 * 弹层：album（纪念相册）、debug（调试面板）、hatch（破壳揭晓）
 * 每帧：结算状态 → 处理事件 → 绘制 → 响应输入
 */
(function (root, factory) {
  // 三种环境：真 Node（单测）/ 浏览器预览 / 微信小游戏（CommonJS + wx API）
  // 小游戏也有 module.exports，若按 isNode 处理会跳过画布与主循环导致黑屏。
  var useReq = (typeof module !== 'undefined' && module.exports);
  var isWx = typeof wx !== 'undefined' && !!wx.createCanvas;
  var CFG = useReq ? require('./config') : root.CONFIG;
  var R = useReq ? require('./render') : root.RENDER;
  var I = useReq ? require('./input') : root.INPUT;
  var PLAT = isWx ? require('./platform') : (useReq ? null : root.PLATFORM);
  var Store = useReq ? require('./store').Store : root.STORE.Store;
  var mod = factory(CFG, R, I, PLAT, Store, root);
  if (useReq) module.exports = mod;
  else root.MAIN = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CFG, R, I, PLAT, Store, root) {
  'use strict';

  var store, ctx, size, hotspots = [], overlay = null;
  var t = 0, lastFrame = 0, toastMsg = '', toastUntil = 0;
  var scene = 'adopt';
  var deathInfo = null, hatchInfo = null;
  var debugPage = false;
  var adRefreshing = false;

  function layout() {
    var w = size.width, h = size.height;
    var cx = w / 2;
    return {
      w: w, h: h, cx: cx,
      stageY: h * 0.44,
      stageScale: Math.min(1.15, w / 380),
      barX: 22, barY: h * 0.62, barW: w - 100, barH: 12, barGap: 20,
      btnY: h - 150
    };
  }

  function start(options) {
    options = options || {};
    store = options.store || new Store();
    store.on(onEvent);
    if (PLAT) {
      ctx = PLAT.getContext();
      size = PLAT.size();
      PLAT.bindInput();
      PLAT.onTouch('start', onTouch);
      // 浏览器预览：视口变化重设画布
      if (!PLAT.isWx && typeof window !== 'undefined') {
        window.addEventListener('resize', function () {
          size = PLAT.size();
        });
      }
      lastFrame = Date.now();
      loop();
    }
    return store;
  }

  function onEvent(evt) {
    if (evt.type === 'death') {
      deathInfo = evt.data;
      scene = 'death';
      overlay = null;
    } else if (evt.type === 'hatched') {
      hatchInfo = evt.data.pet;
      overlay = 'hatch';
    } else if (evt.type === 'egg_ready') {
      showToast('蛋孵化完成，点击破壳！');
      PLAT && PLAT.vibrate && PLAT.vibrate();
    } else if (evt.type === 'stage_up') {
      showToast('它进入了' + CFG.STAGE_LABEL[evt.data.to] + '阶段');
    } else if (evt.type === 'weak_start') {
      showToast('宠物状态虚弱，请细心照料！');
    } else if (evt.type === 'interact') {
      var m = { meat: '喂食成功', plant: '喂食成功', bath: '清洁完成', pet: '抚摸', herb: '治疗完成' };
      showToast(m[evt.data.action] || '完成');
    } else if (evt.type === 'sleep_start') {
      showToast('精力耗尽，它自己睡着了');
    } else if (evt.type === 'sleep_end') {
      showToast(evt.data.forced ? '它虚弱地醒来了' : '它睡醒了，精神不错');
    } else if (evt.type === 'feed_blocked') {
      showToast('它正在睡觉，等醒来再喂');
    }
  }

  function showToast(msg) {
    toastMsg = msg;
    toastUntil = Date.now() + 1500;
  }

  function loop() {
    t = Date.now();
    store.settle(t);
    draw();
    PLAT.raf(loop);
  }

  // ---------- 绘制 ----------
  function draw() {
    var L = layout();
    R.bg(ctx, L.w, L.h);
    hotspots = [];

    var pet = store.save.mainPet;
    if (scene === 'death') {
      drawDeath(L);
    } else if (store.currentEgg()) {
      drawAdopt(L);
    } else if (pet && pet.alive) {
      drawCare(L);
    } else {
      drawAdopt(L); // 无宠物无蛋 → 领养
    }

    if (overlay === 'album') drawAlbum(L);
    if (overlay === 'debug') drawDebug(L);
    if (overlay === 'hatch') drawHatch(L);

    if (toastMsg && Date.now() < toastUntil) {
      var tw = Math.min(L.w - 40, 260);
      R.drawPanel(ctx, L.cx - tw / 2, L.h * 0.2, tw, 40);
      R.text(ctx, toastMsg, L.cx, L.h * 0.2 + 20, 14, R.C.ink, 'center');
    }
  }

  function drawHeader(L, title, sub) {
    R.text(ctx, title, 18, 26, 18, R.C.ink, 'left', '700');
    if (sub) R.text(ctx, sub, 18, 50, 12, R.C.inkSoft, 'left');
    // 调试入口
    var dbg = { x: L.w - 62, y: 14, w: 48, h: 30, label: '调试', id: 'debug', fontSize: 12 };
    hotspots.push(dbg);
    R.drawButton(ctx, dbg, t);
  }

  function drawAdopt(L) {
    var eggs = store.save.eggs;
    drawHeader(L, 'CyberPet', '电子宠物 · 阶段二 Demo');
    if (!eggs.length) {
      R.text(ctx, '你还没有宠物', L.cx, L.h * 0.4, 18, R.C.inkSoft, 'center');
      var b = { x: L.cx - 85, y: L.h * 0.48, w: 170, h: 48, label: '挑选一枚蛋', id: 'adopt', primary: true, color: R.C.green };
      hotspots.push(b); R.drawButton(ctx, b, t);
      return;
    }
    if (eggs.length > 1) { drawEggChoice(L, eggs); return; }
    var egg = eggs[0];
    R.text(ctx, '一枚来路不明的蛋', L.cx, L.h * 0.24, 17, R.C.ink, 'center', '600');
    R.text(ctx, '观察它的外形，猜猜是谁', L.cx, L.h * 0.24 + 24, 12, R.C.inkSoft, 'center');
    R.drawEgg(ctx, egg, L.cx, L.stageY, L.stageScale, t);

    // 孵化进度（仅时间，不揭晓文字种类）
    var prog = store.eggProgress();
    var pw = Math.min(L.w - 60, 280), px = L.cx - pw / 2, py = L.h * 0.66;
    R.rr(ctx, px, py, pw, 10, 5); ctx.fillStyle = R.C.bar; ctx.fill();
    R.rr(ctx, px, py, Math.max(10, pw * prog), 10, 5); ctx.fillStyle = R.C.green; ctx.fill();
    var remain = Math.max(0, egg.hatchDueMs - egg.ageMs);
    R.text(ctx, store.canHatch() ? '孵化完成！' : '还需 ' + R.formatDuration(remain), L.cx, py + 26, 13, R.C.inkSoft, 'center');

    var btns = [
      { x: L.cx - 150, y: L.btnY, w: 140, h: 48, label: '照看蛋', id: 'careEgg' },
      { x: L.cx + 10, y: L.btnY, w: 140, h: 48, label: store.canHatch() ? '破壳！' : '还不能破壳', id: 'hatch', primary: store.canHatch(), color: R.C.yellow }
    ];
    btns.forEach(function (b) { hotspots.push(b); R.drawButton(ctx, b, t); });
    drawSpeedBar(L, L.h - 58);
  }

  // 领养：三枚并排任选其一，纯靠颜色 × 纹理辨识，无任何种类文字提示
  function drawEggChoice(L, eggs) {
    R.text(ctx, '挑一枚带回家', L.cx, L.h * 0.2, 18, R.C.ink, 'center', '700');
    R.text(ctx, '颜色与纹理是唯一线索，图鉴里有对照', L.cx, L.h * 0.2 + 26, 12, R.C.inkSoft, 'center');
    var gap = Math.min(120, L.w / 3);
    eggs.forEach(function (egg, i) {
      var x = L.cx + (i - 1) * gap, y = L.stageY;
      R.rr(ctx, x - 46, y + 62, 92, 10, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fill();
      R.drawEgg(ctx, egg, x, y, 0.62, t + i * 320);
      hotspots.push({ x: x - 50, y: y - 70, w: 100, h: 150, id: 'chooseEgg', eggId: egg.id });
    });
    R.text(ctx, '点击任意一枚带走', L.cx, L.h * 0.62, 12, R.C.inkSoft, 'center');
    // 看广告刷新：看完才重抽，不限次数
    var rb = {
      x: L.cx - 90, y: L.btnY + 42, w: 180, h: 40,
      label: adRefreshing ? '广告播放中…' : '▶ 看广告换一批',
      id: 'adRefresh', fontSize: 13, color: R.C.blue, disabled: !!adRefreshing
    };
    hotspots.push(rb); R.drawButton(ctx, rb, t);
    drawSpeedBar(L, L.h - 58);
  }

  function drawCare(L) {
    var pet = store.save.mainPet;
    var sp = CFG.SPECIES[pet.species];
    drawHeader(L, pet.name, sp.name + ' · ' + store.stageLabel(pet) + ' · ' + CFG.FORM_LABEL[pet.form] + ' · ' + (pet.gender === 'male' ? '♂' : '♀'));

    // 年龄与寿命进度（不显示终点数字）
    var lifeProg = Math.min(1, pet.ageDays / pet.actualLifespan);
    var lw = Math.min(L.w - 60, 280), lx = L.cx - lw / 2;
    R.text(ctx, '第 ' + Math.floor(pet.ageDays) + ' 天 · ' + store.stageLabel(pet), L.cx, 70, 13, R.C.inkSoft, 'center');
    var isSenior = pet.stage === 'senior';
    R.rr(ctx, lx, 84, lw, 8, 4); ctx.fillStyle = R.C.bar; ctx.fill();
    R.rr(ctx, lx, 84, Math.max(8, lw * lifeProg), 8, 4);
    ctx.fillStyle = isSenior ? R.C.red : R.C.brown; ctx.fill();

    // 睡眠状态提示（宠物上方）
    if (pet.sleeping) {
      // 蛇颈龙头部更高，提示相应上移，避免与 Zzz 重叠
      var tipY = L.stageY - (pet.species === 'plesiosaurus' ? 185 : 134);
      R.text(ctx, '💤 睡眠中 · 精力恢复 ' + Math.round(pet.stats.energy) + '→' + CFG.REST.wakeEnergy,
        L.cx, tipY, 12, R.C.blue, 'center', '600');
    }

    // 宠物
    R.drawPet(ctx, pet, L.cx, L.stageY, L.stageScale, t, pet.stats.mood, pet.sleeping);

    // 后代槽位小窗（Demo 调试注入后可见）
    if (store.save.offspringSlot) {
      R.drawPanel(ctx, L.w - 104, L.stageY - 40, 88, 88);
      R.text(ctx, '后代蛋', L.w - 60, L.stageY - 20, 11, R.C.inkSoft, 'center');
      R.drawEgg(ctx, { species: store.save.offspringSlot.species, appearance: store.save.offspringSlot.eggAppearance },
        L.w - 60, L.stageY + 20, 0.42, t);
    }

    // 状态条
    var keys = ['satiety', 'hygiene', 'mood', 'energy', 'health'];
    keys.forEach(function (k, i) {
      R.drawBar(ctx, L.barX, L.barY + i * L.barGap, L.barW, L.barH, k, pet.stats[k]);
    });

    if (pet.weakMs > 0) {
      R.text(ctx, '⚠ 虚弱中 · 请细心照料', L.cx, L.barY + 5 * L.barGap + 8, 13, R.C.red, 'center', '600');
    }

    // 操作按钮
    var diet = sp.diet === '植食' ? '植食' : '肉类';
    var btns = [
      { x: L.cx - 150, y: L.btnY, w: 140, h: 44,
        label: pet.sleeping ? '喂食(睡眠中)' : '喂食(' + diet + ')',
        id: 'feed', primary: true, color: pet.sleeping ? '#9a9184' : R.C.green },
      { x: L.cx + 10, y: L.btnY, w: 140, h: 44, label: '清洁', id: 'bath' },
      { x: L.cx - 150, y: L.btnY + 52, w: 140, h: 44, label: '抚摸', id: 'petact' },
      { x: L.cx + 10, y: L.btnY + 52, w: 140, h: 44, label: '纪念相册', id: 'album', fontSize: 13 }
    ];
    btns.forEach(function (b) { hotspots.push(b); R.drawButton(ctx, b, t); });
    drawSpeedBar(L, L.h - 14);
  }

  function drawSpeedBar(L, y) {
    var idx = store.save.meta.timeScaleIndex;
    var scales = CFG.TIME_SCALE;
    var label = scales[idx] === 1 ? '正常' : (scales[idx] >= 86400 ? '×86400' : '×' + scales[idx]);
    var b = { x: L.w - 118, y: y - 16, w: 104, h: 28, label: '时间: ' + label, id: 'speed', fontSize: 11 };
    hotspots.push(b); R.drawButton(ctx, b, t);
  }

  // ---------- 弹层 ----------
  function drawHatch(L) {
    R.drawOverlay(ctx, L.w, L.h);
    var px = L.cx - 150, py = L.h * 0.26, pw = 300, ph = 300;
    R.drawPanel(ctx, px, py, pw, ph);
    var pet = hatchInfo || store.save.mainPet;
    if (pet) {
      R.text(ctx, '它破壳而出了！', L.cx, py + 32, 18, R.C.ink, 'center', '700');
      var sp = CFG.SPECIES[pet.species];
      R.text(ctx, sp.name + ' · ' + (pet.gender === 'male' ? '雄性 ♂' : '雌性 ♀'), L.cx, py + 58, 14, R.C.inkSoft, 'center');
      R.drawPet(ctx, pet, L.cx, py + 150, 0.85, t, pet.stats.mood);
      R.text(ctx, '预计寿命 ' + pet.lifespanRange[0] + '–' + pet.lifespanRange[1] + ' 天', L.cx, py + 220, 12, R.C.inkSoft, 'center');
    }
    var b = { x: L.cx - 70, y: py + ph - 56, w: 140, h: 42, label: '开始照顾', id: 'closeHatch', primary: true, color: R.C.green };
    hotspots.push(b); R.drawButton(ctx, b, t);
  }

  function drawDeath(L) {
    R.bg(ctx, L.w, L.h);
    var pet = deathInfo && deathInfo.pet;
    R.text(ctx, '生命旅程', L.cx, L.h * 0.18, 22, R.C.ink, 'center', '700');
    if (pet) {
      var sp = CFG.SPECIES[pet.species];
      ctx.save();
      R.drawPet(ctx, pet, L.cx, L.h * 0.38, 0.95, t, 30);
      ctx.restore();
      R.text(ctx, pet.name + ' · ' + sp.name, L.cx, L.h * 0.52, 16, R.C.ink, 'center', '600');
      R.text(ctx, '度过了 ' + Math.floor(pet.ageDays) + ' 天 · ' +
        (deathInfo.reason === 'age' ? '自然衰老' : '虚弱未愈'), L.cx, L.h * 0.52 + 24, 13, R.C.inkSoft, 'center');
      var outcomeText = deathInfo.outcome === 'inherited'
        ? '它的后代继承了血脉，继续陪伴你。'
        : '一枚新的蛋已送到你手中，生命将继续。';
      R.text(ctx, outcomeText, L.cx, L.h * 0.6, 13, R.C.green, 'center');
    }
    var b = { x: L.cx - 80, y: L.h * 0.72, w: 160, h: 46, label: '继续', id: 'deathContinue', primary: true, color: R.C.green };
    hotspots.push(b); R.drawButton(ctx, b, t);
  }

  function drawAlbum(L) {
    R.drawOverlay(ctx, L.w, L.h);
    var px = 20, py = 40, pw = L.w - 40, ph = L.h - 100;
    R.drawPanel(ctx, px, py, pw, ph);
    R.text(ctx, '纪念相册', L.cx, py + 28, 18, R.C.ink, 'center', '700');
    R.text(ctx, '从蛋期起全程记录', L.cx, py + 52, 12, R.C.inkSoft, 'center');
    var pet = store.save.mainPet;
    var photos = pet ? store.albumFor(pet.id) : [];
    R.text(ctx, '共 ' + photos.length + ' 张留影', px + 20, py + 78, 12, R.C.inkSoft, 'left');
    var startY = py + 100;
    photos.slice(-4).forEach(function (p, i) {
      var yy = startY + i * 78;
      R.rr(ctx, px + 16, yy, pw - 32, 68, 10); ctx.fillStyle = R.C.white; ctx.fill();
      R.text(ctx, '第 ' + p.day + ' 天 · ' + CFG.STAGE_LABEL[p.stage] + ' · ' + p.title, px + 30, yy + 22, 13, R.C.ink, 'left', '600');
      R.text(ctx, p.note, px + 30, yy + 46, 12, R.C.inkSoft, 'left');
    });
    if (photos.length === 0) R.text(ctx, '暂无留影，照顾它就会留下回忆', L.cx, startY + 20, 12, R.C.inkSoft, 'center');
    var b = { x: L.cx - 60, y: py + ph - 50, w: 120, h: 38, label: '返回', id: 'closeOverlay', primary: true, color: R.C.green };
    hotspots.push(b); R.drawButton(ctx, b, t);
  }

  function drawDebug(L) {
    R.drawOverlay(ctx, L.w, L.h);
    var px = 16, py = 30, pw = L.w - 32, ph = L.h - 70;
    R.drawPanel(ctx, px, py, pw, ph);
    R.text(ctx, '调试面板（Demo 专用）', L.cx, py + 26, 16, R.C.ink, 'center', '700');
    R.text(ctx, '时间: ' + store.timeScale() + '× · 加速用于验证孵化/寿命', L.cx, py + 50, 11, R.C.inkSoft, 'center');
    var labels = ['速度×' + CFG.TIME_SCALE[store.save.meta.timeScaleIndex], '+6小时', '注入后代', '入睡/唤醒', '强制病变死亡', '强制自然死亡', '重置存档'];
    var ids = ['speed', 'adv6h', 'inject', 'sleepToggle', 'killIllness', 'killAge', 'reset'];
    var cols = 2, bw = (pw - 60) / 2, bh = 42;
    labels.forEach(function (label, i) {
      var b = {
        x: px + 24 + (i % cols) * (bw + 12),
        y: py + 80 + Math.floor(i / cols) * (bh + 12),
        w: bw, h: bh, label: label, id: ids[i], fontSize: 12
      };
      if (ids[i] === 'killIllness' || ids[i] === 'killAge' || ids[i] === 'reset') {
        b.color = R.C.red; b.primary = true;
      }
      hotspots.push(b); R.drawButton(ctx, b, t);
    });
    R.text(ctx, '提示：可验证自动入睡、单线继承与死亡分支', L.cx, py + ph - 76, 11, R.C.inkSoft, 'center');
    var b = { x: L.cx - 60, y: py + ph - 46, w: 120, h: 36, label: '返回', id: 'closeOverlay', primary: true, color: R.C.green };
    hotspots.push(b); R.drawButton(ctx, b, t);
  }

  // ---------- 输入 ----------
  function onTouch(x, y) {
    var btn = I.find(hotspots, x, y);
    if (!btn) return;
    PLAT && PLAT.vibrate && PLAT.vibrate();
    var pet = store.save.mainPet;
    switch (btn.id) {
      case 'adopt': store.adoptEggs(); break;
      case 'adRefresh':
        if (adRefreshing) break;
        adRefreshing = true;
        (PLAT && PLAT.showRewardedVideo
          ? PLAT.showRewardedVideo(CFG.AD && CFG.AD.rewardedUnitId)
          : Promise.resolve(false)
        ).then(function (done) {
          adRefreshing = false;
          if (done) {
            store.refreshEggs();
            showToast('换了一批蛋');
          } else {
            showToast('看完广告才能换蛋');
          }
        });
        break;
      case 'chooseEgg':
        if (adRefreshing) break;
        if (store.chooseEgg(btn.eggId)) showToast('带走了一枚蛋');
        break;
      case 'careEgg':
        if (store.careEgg()) showToast('你轻轻照看了蛋');
        break;
      case 'hatch':
        if (store.canHatch()) store.hatch();
        else showToast('还没有孵化完成');
        break;
      case 'closeHatch': overlay = null; break;
      case 'feed': store.feed(); break;
      case 'bath': store.interact('bath'); break;
      case 'petact': store.interact('pet'); break;
      case 'sleepToggle':
        var sleepingNow = !!(store.save.mainPet && store.save.mainPet.sleeping);
        if (store.debugSetSleep(!sleepingNow)) showToast(sleepingNow ? '已唤醒' : '已强制入睡');
        break;
      case 'album': overlay = 'album'; break;
      case 'debug': overlay = 'debug'; break;
      case 'closeOverlay': overlay = null; break;
      case 'speed':
        var next = (store.save.meta.timeScaleIndex + 1) % CFG.TIME_SCALE.length;
        store.setTimeScale(next);
        showToast('时间倍率: ' + CFG.TIME_SCALE[next] + '×');
        break;
      case 'adv6h': store.debugAdvance(6); showToast('已推进 6 小时'); break;
      case 'inject':
        if (store.debugInjectOffspring()) showToast('已注入一个后代');
        else showToast('需要先有主宠');
        break;
      case 'killIllness': store.debugKill('illness'); break;
      case 'killAge': store.debugKill('age'); break;
      case 'reset':
        store.reset(); overlay = null; scene = 'adopt'; deathInfo = null; hatchInfo = null;
        showToast('存档已重置');
        break;
      case 'deathContinue':
        scene = 'adopt'; deathInfo = null;
        break;
      default: break;
    }
  }

  // ---------- 导出（供浏览器/测试注入画布） ----------
  return {
    start: start,
    getStore: function () { return store; },
    _setScene: function (s) { scene = s; },
    _getScene: function () { return scene; },
    _onTouch: function (x, y) { return onTouch(x, y); },
    _draw: function () { if (ctx) draw(); }
  };
});
