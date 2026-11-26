/**
 * src/store.js — 核心数据层（纯逻辑，可在 Node / 小游戏 / 浏览器共用）
 *
 * 负责：存档读写、随机蛋、孵化计时、离线衰减结算、年龄与阶段推进、
 *       病变/自然死亡、单线继承与补偿蛋、互动操作、纪念相册、调试加速。
 *
 * 时间口径：全部用「游戏时间」ageMs 推进；真实经过时间 × timeScale = 游戏时间增量。
 * Debug 加速档位见 CONFIG.TIME_SCALE，正式版应将 timeScale 固定为 1。
 */
(function (root, factory) {
  // 三种环境：真 Node（单测）/ 浏览器预览 / 微信小游戏（CommonJS + wx API）
  // 小游戏同样存在 module.exports，不能据此判定为 Node，否则平台层丢失、存档退化为内存。
  var useReq = (typeof module !== 'undefined' && module.exports);
  var isWx = typeof wx !== 'undefined' && !!wx.createCanvas;
  var CFG = useReq ? require('./config') : root.CONFIG;
  var PLAT = isWx ? require('./platform') : (useReq ? null : root.PLATFORM);
  var mod = factory(CFG, PLAT);
  if (useReq) module.exports = mod;
  else root.STORE = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CFG, PLAT) {
  'use strict';

  var HOUR = 3600 * 1000;

  // ---------- 工具 ----------
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function uid(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function now() { return Date.now(); }

  function defaultSave() {
    return {
      version: 1,
      player: { kinship: 0, achievements: [] },
      mainPet: null,
      offspringSlot: null,
      eggs: [],
      records: [],
      album: [],
      encyclopedia: { trex: false, plesiosaurus: false, triceratops: false, hybrid: [] },
      meta: {
        lastSettleAt: now(),
        timeScaleIndex: 0,
        debug: true,
        createdAt: now()
      }
    };
  }

  // ---------- Store 实例 ----------
  function Store(options) {
    options = options || {};
    this.memoryOnly = !!options.memoryOnly; // Node 单测用
    this.save = this._load() || defaultSave();
    this.events = [];
    this.listeners = [];
  }

  Store.prototype._load = function () {
    if (this.memoryOnly) return null;
    var raw = PLAT && PLAT.getStorage && PLAT.getStorage(CFG.SAVE_KEY);
    // 兼容旧存档：自动休息字段缺失时按清醒初始化
    if (raw && raw.version === 1) {
      [raw.mainPet, raw.offspringSlot].forEach(function (pet) {
        if (pet && typeof pet.sleeping !== 'boolean') pet.sleeping = false;
      });
    }
    return raw && raw.version === 1 ? raw : null;
  };

  Store.prototype.persist = function () {
    if (!this.memoryOnly && PLAT && PLAT.setStorage) PLAT.setStorage(CFG.SAVE_KEY, this.save);
  };

  Store.prototype.reset = function () {
    this.save = defaultSave();
    this.events = [];
    this.persist();
    this._emit('reset', {});
  };

  Store.prototype.on = function (fn) { this.listeners.push(fn); };
  Store.prototype._emit = function (type, data) {
    var evt = { type: type, data: data || {}, at: now() };
    this.events.push(evt);
    this.listeners.slice().forEach(function (fn) { fn(evt); });
  };
  Store.prototype.drainEvents = function () {
    var out = this.events.slice();
    this.events = [];
    return out;
  };

  // ---------- 蛋 ----------
  Store.prototype._makeEgg = function (key, source) {
    var sp = CFG.SPECIES[key];
    return {
      id: uid('egg'),
      species: key,
      appearance: sp.egg.pattern,
      color: sp.egg.color,
      source: source || 'random',
      hatchDays: sp.hatchDays,
      hatchDueMs: sp.hatchDays * CFG.DAY,
      ageMs: 0,
      careCount: 0,
      createdAt: now()
    };
  };

  // 补偿蛋 / 测试用：单枚随机蛋
  Store.prototype.adoptEgg = function (source) {
    var egg = this._makeEgg(pick(CFG.SPECIES_KEYS), source);
    this.save.eggs.push(egg);
    this.persist();
    this._emit('egg_obtained', { egg: egg });
    return egg;
  };

  // 随机抽三枚蛋：种类可重复（每枚独立从蛋池抽取），外观固定绑定种类，靠颜色×纹理辨识
  Store.prototype._drawEggs = function () {
    var out = [];
    for (var i = 0; i < 3; i++) out.push(this._makeEgg(pick(CFG.SPECIES_KEYS), 'random'));
    return out;
  };

  // 领养：推送三枚随机蛋（种类可重复）
  Store.prototype.adoptEggs = function () {
    this.save.eggs = this._drawEggs();
    this.persist();
    this._emit('eggs_offered', { eggs: this.save.eggs.slice() });
    return this.save.eggs.slice();
  };

  // 看广告刷新：仅在三枚待选阶段有效；重抽三枚，不限次数，记录观看次数用于埋点
  Store.prototype.refreshEggs = function () {
    if (this.save.eggs.length <= 1) return null; // 已选定/孵化中不允许刷新
    this.save.eggs = this._drawEggs();
    var ad = this.save.meta.adDaily || (this.save.meta.adDaily = { date: '', refreshed: 0, watched: 0 });
    var today = new Date().toISOString().slice(0, 10);
    if (ad.date !== today) { ad.date = today; ad.refreshed = 0; ad.watched = 0; }
    ad.refreshed += 1;
    ad.watched += 1;
    this.persist();
    this._emit('eggs_refreshed', { eggs: this.save.eggs.slice(), count: ad.refreshed });
    return this.save.eggs.slice();
  };

  // 广告观看计数（通用埋点，不发奖；发奖由调用方在确认看完后执行）
  Store.prototype.recordAdWatch = function (placement) {
    var ad = this.save.meta.adDaily || (this.save.meta.adDaily = { date: '', refreshed: 0, watched: 0 });
    var today = new Date().toISOString().slice(0, 10);
    if (ad.date !== today) { ad.date = today; ad.refreshed = 0; ad.watched = 0; }
    ad.watched += 1;
    this._emit('ad_watched', { placement: placement || 'unknown' });
    this.persist();
  };

  // 选定一枚带走，其余退回；此后才开始孵化计时
  Store.prototype.chooseEgg = function (eggId) {
    var chosen = this.save.eggs.filter(function (e) { return e.id === eggId; })[0];
    if (!chosen) return null;
    this.save.eggs = [chosen];
    this.persist();
    this._emit('egg_chosen', { egg: chosen });
    return chosen;
  };

  Store.prototype.currentEgg = function () {
    return this.save.eggs.length ? this.save.eggs[0] : null;
  };

  Store.prototype.careEgg = function () {
    var egg = this.currentEgg();
    if (!egg) return false;
    egg.careCount += 1;
    this.persist();
    this._emit('egg_cared', { egg: egg });
    return true;
  };

  Store.prototype.eggProgress = function () {
    var egg = this.currentEgg();
    if (!egg) return 0;
    return clamp(egg.ageMs / egg.hatchDueMs, 0, 1);
  };

  Store.prototype.canHatch = function () {
    var egg = this.currentEgg();
    return !!egg && egg.ageMs >= egg.hatchDueMs;
  };

  // 破壳：揭晓种类与性别，创建主宠
  Store.prototype.hatch = function () {
    if (!this.canHatch()) return null;
    var egg = this.save.eggs.shift();
    var sp = CFG.SPECIES[egg.species];
    var actualLifespan = randInt(sp.lifespanRange[0], sp.lifespanRange[1]);
    var gender = Math.random() < CFG.GENDER_MALE_RATE ? 'male' : 'female';
    var moodBonus = Math.min(10, egg.careCount * 3);
    var pet = {
      id: uid('pet'),
      name: this._autoName(sp.name),
      species: egg.species,
      gender: gender,
      eggAppearance: egg.appearance,
      eggSource: egg.source,
      stage: 'baby',
      form: 'standard',
      stats: {
        satiety: 70,
        hygiene: 70,
        mood: clamp(80 + moodBonus, 0, 100),
        energy: 80,
        health: 100
      },
      ageMs: 0,
      ageDays: 0,
      lifespanRange: sp.lifespanRange.slice(),
      actualLifespan: actualLifespan,
      parents: [],
      offspring: [],
      pregnancy: null,
      postpartum: null,
      bloodlineContribution: 0,
      weakMs: 0,
      sleeping: false,
      sleepCount: 0,
      alive: true,
      deathAt: null,
      deathReason: null
    };
    this.save.mainPet = pet;
    this.save.encyclopedia[egg.species] = true;
    this._record(pet.id, 'hatch', { species: egg.species, gender: gender, lifespan: actualLifespan });
    this._album(pet.id, 'baby', 0, '破壳那一刻', '一声脆响，' + sp.name + '来到这个世界。');
    this.persist();
    this._emit('hatched', { pet: pet });
    return pet;
  };

  Store.prototype._autoName = function (speciesName) {
    var prefixes = ['小', '阿', '大'];
    var suffix = ['斑', '牙', '鳞', '角', '浪', '岩', '影'];
    return pick(prefixes) + pick(suffix);
  };

  // ---------- 阶段 ----------
  // 个体实际寿命不同 → 各阶段结束日按 actual/base 等比缩放
  Store.prototype.stageBoundary = function (pet, stageKey) {
    var sp = CFG.SPECIES[pet.species];
    var ratio = pet.actualLifespan / sp.baseLifespan;
    return Math.round(sp.stages[stageKey] * ratio);
  };

  Store.prototype.computeStage = function (pet) {
    var day = pet.ageDays;
    var order = ['baby', 'adult', 'mature', 'senior'];
    var stage = 'baby';
    for (var i = 0; i < order.length; i++) {
      if (day >= this.stageBoundary(pet, order[i])) stage = order[i];
    }
    return stage;
  };

  Store.prototype.stageLabel = function (pet) { return CFG.STAGE_LABEL[pet.stage] || '幼体'; };

  // ---------- 结算 ----------
  /**
   * 按真实经过时间推进游戏时间并结算状态。
   * @param {number} nowMs 当前时间戳（可注入做确定性测试）
   */
  Store.prototype.settle = function (nowMs) {
    var t = typeof nowMs === 'number' ? nowMs : now();
    var meta = this.save.meta;
    var scale = CFG.TIME_SCALE[meta.timeScaleIndex] || 1;
    var deltaReal = clamp(t - meta.lastSettleAt, 0, 30 * CFG.DAY);
    meta.lastSettleAt = t;
    if (deltaReal <= 0) return;
    var deltaGameMs = deltaReal * scale;
    var hours = deltaGameMs / HOUR;

    // 蛋计时（不衰减）：三枚待选阶段不计时，选定后才开始
    var egg = this.save.eggs.length === 1 ? this.currentEgg() : null;
    if (egg) {
      var before = egg.ageMs;
      egg.ageMs += deltaGameMs;
      if (before < egg.hatchDueMs && egg.ageMs >= egg.hatchDueMs) {
        this._emit('egg_ready', { egg: egg });
      }
    }

    var pet = this.save.mainPet;
    if (!pet || !pet.alive) { this.persist(); return; }

    // 年龄推进
    var oldStage = pet.stage;
    pet.ageMs += deltaGameMs;
    pet.ageDays = pet.ageMs / CFG.DAY;
    pet.stage = this.computeStage(pet);
    if (pet.stage !== oldStage) {
      this._emit('stage_up', { pet: pet, from: oldStage, to: pet.stage });
      this._record(pet.id, 'stage', { from: oldStage, to: pet.stage, day: Math.floor(pet.ageDays) });
      this._album(pet.id, pet.stage, Math.floor(pet.ageDays),
        '进入' + CFG.STAGE_LABEL[pet.stage], '它又长大了一点。');
    }

    // 衰减（离线保护系数按真实离线时长）
    var factor = this._offlineFactor(deltaReal);
    var dec = CFG.DECAY[pet.stage] || CFG.DECAY.baby;
    var s = pet.stats;
    s.satiety = clamp(s.satiety + dec.satiety * hours * factor, 0, 100);
    s.hygiene = clamp(s.hygiene + dec.hygiene * hours * factor, 0, 100);
    s.mood    = clamp(s.mood    + dec.mood    * hours * factor, 0, 100);
    // 休息是自动行为：睡眠中精力自行恢复，不再叠加衰减
    if (pet.sleeping) {
      s.energy = clamp(s.energy + CFG.REST.recoverPerHour * hours * factor, 0, 100);
    } else {
      s.energy = clamp(s.energy + dec.energy * hours * factor, 0, 100);
    }

    // 健康派生
    var healthDelta = 0;
    if (s.satiety < CFG.HEALTH.lowSatiety) healthDelta -= 2 * hours * factor;
    if (s.hygiene < CFG.HEALTH.lowHygiene) {
      healthDelta -= 2 * hours * factor;
      s.mood = clamp(s.mood - 1 * hours * factor, 0, 100);
    }
    if (s.satiety >= 50 && s.hygiene >= 50 && s.energy >= 30 && s.mood >= 40) {
      healthDelta += 0.5 * hours * factor; // 照顾良好缓慢恢复
    }
    s.health = clamp(s.health + healthDelta, 0, 100);

    // 自动入睡 / 自然醒：精力过低自行休息，恢复到阈值自行醒来
    if (!pet.sleeping && s.energy < CFG.REST.enterEnergy && s.health >= CFG.REST.weakGuard) {
      this._sleep(pet);
    } else if (pet.sleeping && s.energy >= CFG.REST.wakeEnergy) {
      this._wake(pet);
    } else if (pet.sleeping && s.health < CFG.REST.weakGuard) {
      // 睡眠中转为虚弱时强制唤醒，否则禁止喂食会造成无法救治
      this._wake(pet, true);
    }

    // 虚弱计时与病变死亡
    if (s.health < CFG.HEALTH.weakThreshold) {
      var wasWeak = pet.weakMs > 0;
      pet.weakMs += deltaGameMs;
      if (!wasWeak) {
        this._emit('weak_start', { pet: pet });
        this._record(pet.id, 'weak_start', { health: Math.round(s.health) });
      }
      if (pet.weakMs >= CFG.HEALTH.weakDeathHours * HOUR) {
        this._die(pet, 'illness');
        this.persist();
        return;
      }
    } else if (pet.weakMs > 0) {
      pet.weakMs = 0;
      this._emit('weak_recovered', { pet: pet });
      this._record(pet.id, 'weak_recovered', {});
    }

    // 自然衰老死亡
    if (pet.ageDays >= pet.actualLifespan) {
      this._die(pet, 'age');
      this.persist();
      return;
    }

    // 体征分化（成熟体后按长期均值）
    if (pet.stage === 'mature' || pet.stage === 'senior') pet.form = this._computeForm(pet);

    // 长离线保底
    if (deltaReal > CFG.OFFLINE.normalHours * HOUR) {
      var floor = CFG.OFFLINE.floorAtLongAbsence;
      s.satiety = Math.max(s.satiety, floor.satiety);
      s.health = Math.max(s.health, floor.health);
      s.energy = Math.max(s.energy, floor.energy);
      if (pet.weakMs >= CFG.HEALTH.weakDeathHours * HOUR) pet.weakMs = 0; // 保底避免离线中猝死
    }

    this.persist();
  };

  // ---------- 自动休息 ----------
  Store.prototype._sleep = function (pet) {
    pet.sleeping = true;
    pet.sleepStartedAt = now();
    pet.sleepCount = (pet.sleepCount || 0) + 1;
    this._emit('sleep_start', { pet: pet });
    this._record(pet.id, 'sleep_start', { energy: Math.round(pet.stats.energy) });
    if (pet.sleepCount === 1) {
      this._album(pet.id, pet.stage, Math.floor(pet.ageDays),
        '它自己睡着了', '玩累了，蜷起来打了个盹。');
    }
  };

  Store.prototype._wake = function (pet, forced) {
    pet.sleeping = false;
    pet.sleepStartedAt = null;
    this._emit('sleep_end', { pet: pet, forced: !!forced });
    this._record(pet.id, 'sleep_end', { forced: !!forced, energy: Math.round(pet.stats.energy) });
  };

  // 调试：强制入睡 / 唤醒，用于验证自动休息相关表现
  Store.prototype.debugSetSleep = function (on) {
    var pet = this.save.mainPet;
    if (!pet || !pet.alive) return false;
    if (on && !pet.sleeping) {
      pet.stats.energy = Math.min(pet.stats.energy, CFG.REST.enterEnergy - 1);
      this._sleep(pet);
    } else if (!on && pet.sleeping) {
      pet.stats.energy = CFG.REST.wakeEnergy;
      this._wake(pet);
    }
    this.persist();
    return true;
  };

  Store.prototype._offlineFactor = function (deltaReal) {
    var h = deltaReal / HOUR;
    if (h <= CFG.OFFLINE.protectHours) return CFG.OFFLINE.protectFactor;
    return 1;
  };

  Store.prototype._computeForm = function (pet) {
    var s = pet.stats;
    if (s.health >= 90 && s.satiety >= 80) return 'strong';
    if (s.mood >= 80 && s.energy >= 75) return 'agile';
    if (s.health < 50 || s.mood < 40) return 'weathered';
    return 'standard';
  };

  // ---------- 死亡与继承 ----------
  Store.prototype._die = function (pet, reason) {
    pet.alive = false;
    pet.deathAt = now();
    pet.deathReason = reason;
    pet.weakMs = 0;
    this._record(pet.id, 'death', { reason: reason, ageDays: Math.floor(pet.ageDays) });
    var outcome;

    // 单线继承：唯一后代存活则直接继位；否则补偿随机蛋
    var offspring = this.save.offspringSlot;
    if (offspring && offspring.alive) {
      // 保留后代原有 id，确保父代 offspring[] 中的谱系引用有效
      offspring.name = offspring.name || this._autoName(CFG.SPECIES[offspring.species].name);
      offspring.parents = [pet.id];
      this.save.mainPet = offspring;
      this.save.offspringSlot = null;
      outcome = 'inherited';
      this._record(offspring.id, 'inherit', { from: pet.id });
      this._album(offspring.id, offspring.stage, Math.floor(offspring.ageDays),
        '接过生命的接力', '它继承了' + pet.name + '的足迹。');
    } else {
      this.save.mainPet = null;
      this.save.offspringSlot = null;
      this.adoptEgg('compensation');
      outcome = 'compensated';
    }
    this._emit('death', { pet: pet, reason: reason, outcome: outcome });
  };

  // 调试：注入一个存活后代，用于验证继承分支（阶段三繁育上线后由孕期自然产生）
  Store.prototype.debugInjectOffspring = function () {
    if (!this.save.mainPet) return false;
    var parent = this.save.mainPet;
    var gender = parent.gender === 'male' ? 'female' : 'male';
    var sp = CFG.SPECIES[parent.species];
    var child = {
      id: uid('pet'), name: this._autoName(sp.name), species: parent.species,
      gender: gender, eggAppearance: sp.egg.pattern, eggSource: 'debug',
      stage: 'baby', form: 'standard',
      stats: { satiety: 75, hygiene: 75, mood: 80, energy: 80, health: 100 },
      ageMs: 0, ageDays: 0,
      lifespanRange: sp.lifespanRange.slice(),
      actualLifespan: randInt(sp.lifespanRange[0], sp.lifespanRange[1]),
      parents: [parent.id], offspring: [], pregnancy: null, postpartum: null,
      bloodlineContribution: 0, weakMs: 0, sleeping: false, sleepCount: 0,
      alive: true, deathAt: null, deathReason: null
    };
    parent.offspring.push(child.id);
    this.save.offspringSlot = child;
    this.persist();
    this._emit('offspring_injected', { child: child });
    return true;
  };

  // ---------- 互动 ----------
  Store.prototype.interact = function (action) {
    var pet = this.save.mainPet;
    if (!pet || !pet.alive) return false;
    var s = pet.stats;
    var inc = CFG.INTERACT[action];
    if (!inc) return false;
    if (action === 'pet') {
      var last = pet._lastPetAt || 0;
      if (now() - last < inc.cooldownMs) return false;
      pet._lastPetAt = now();
    }
    if (action === 'herb' && s.health >= 80) return false;
    if (action === 'bath' && s.hygiene >= 90) return false;

    if (inc.satiety) s.satiety = clamp(s.satiety + inc.satiety, 0, 100);
    if (inc.hygiene) s.hygiene = clamp(s.hygiene + inc.hygiene, 0, 100);
    if (inc.mood) s.mood = clamp(s.mood + inc.mood, 0, 100);
    if (inc.health) s.health = clamp(s.health + inc.health, 0, 100);
    if (s.health >= CFG.HEALTH.weakThreshold && pet.weakMs > 0) {
      pet.weakMs = 0;
      this._emit('weak_recovered', { pet: pet });
    }
    this.persist();
    this._emit('interact', { action: action, pet: pet });
    return true;
  };

  Store.prototype.feed = function () {
    var pet = this.save.mainPet;
    if (!pet) return false;
    // 睡眠期间禁止喂食：宠物自行恢复精力，此时打扰会打断休息
    if (pet.sleeping) {
      this._emit('feed_blocked', { pet: pet, reason: 'sleeping' });
      return false;
    }
    var food = CFG.SPECIES[pet.species].diet === '植食' ? 'plant' : 'meat';
    return this.interact(food);
  };

  // ---------- 记录与相册 ----------
  Store.prototype._record = function (petId, event, detail) {
    this.save.records.push({ petId: petId, event: event, timestamp: now(), detail: detail || {} });
  };

  Store.prototype._album = function (petId, stage, day, title, note) {
    this.save.album.push({
      id: uid('ph'), petId: petId, stage: stage, day: day,
      title: title, note: note, createdAt: now()
    });
  };

  Store.prototype.albumFor = function (petId) {
    return this.save.album.filter(function (p) { return p.petId === petId; });
  };

  // ---------- 调试接口 ----------
  Store.prototype.setTimeScale = function (index) {
    index = clamp(index, 0, CFG.TIME_SCALE.length - 1);
    this.save.meta.timeScaleIndex = index;
    this.persist();
    this._emit('timescale', { index: index, value: CFG.TIME_SCALE[index] });
  };
  Store.prototype.timeScale = function () { return CFG.TIME_SCALE[this.save.meta.timeScaleIndex] || 1; };

  Store.prototype.debugAdvance = function (gameHours) {
    var meta = this.save.meta;
    // 直接把 lastSettleAt 前移，使下次 settle 按指定游戏时长结算（scale=1 口径）
    meta.lastSettleAt -= (gameHours * HOUR);
    this.persist();
  };

  Store.prototype.debugKill = function (reason) {
    var pet = this.save.mainPet;
    if (!pet || !pet.alive) return false;
    if (reason === 'age') pet.ageDays = pet.actualLifespan;
    else pet.stats.health = 0;
    // 直接走死亡结算，不依赖微小时间推进（否则虚弱计时不足）
    this._die(pet, reason === 'age' ? 'age' : 'illness');
    this.persist();
    return true;
  };

  Store.prototype.currentSpecies = function () {
    var egg = this.currentEgg();
    if (egg) return CFG.SPECIES[egg.species];
    var pet = this.save.mainPet;
    if (pet && pet.alive) return CFG.SPECIES[pet.species];
    return null;
  };

  return {
    Store: Store,
    defaultSave: defaultSave,
    HOUR: HOUR,
    clamp: clamp,
    uid: uid
  };
});
