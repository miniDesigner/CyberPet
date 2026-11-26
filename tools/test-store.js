/**
 * tools/test-store.js — 数据层确定性单测（Node 运行，不参与小游戏打包）
 * 运行：node tools/test-store.js
 */
const assert = require('assert');
const CFG = require('../src/config');
const { Store } = require('../src/store');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + ' → ' + e.message); fail++; }
}

function mk() {
  const st = new Store({ memoryOnly: true });
  return st;
}
// 基于当前存档结算时间推进 N 小时
function step(st, hours) {
  const end = st.save.meta.lastSettleAt + hours * 3600 * 1000;
  st.settle(end);
  return end;
}
// 孵化一只宠物（推进到蛋成熟 → 破壳）
function hatchPet(st) {
  const egg = st.adoptEgg();
  step(st, egg.hatchDays * 24 + 1);
  return st.hatch();
}

console.log('\n== CyberPet Store 单测 ==');

test('存档默认值结构正确', () => {
  const st = mk();
  assert(st.save.mainPet === null);
  assert(Array.isArray(st.save.eggs));
  assert(st.save.meta.timeScaleIndex === 0);
});

test('随机蛋种类合法且孵化时间匹配物种', () => {
  for (let i = 0; i < 30; i++) {
    const st = mk();
    const egg = st.adoptEgg();
    assert(CFG.SPECIES_KEYS.includes(egg.species));
    assert.strictEqual(egg.hatchDays, CFG.SPECIES[egg.species].hatchDays);
    assert.strictEqual(egg.hatchDueMs, egg.hatchDays * CFG.DAY);
  }
});

test('蛋计时未到不可孵化，到期可孵化并揭晓属性', () => {
  const st = mk();
  const egg = st.adoptEgg();
  step(st, egg.hatchDays * 24 - 2);
  assert.strictEqual(st.canHatch(), false, '提前不应孵化');
  step(st, 3);
  assert(st.canHatch(), '到期应可孵化');
  const pet = st.hatch();
  assert(pet && pet.alive);
  assert(pet.actualLifespan >= CFG.SPECIES[pet.species].lifespanRange[0]);
  assert(pet.actualLifespan <= CFG.SPECIES[pet.species].lifespanRange[1]);
  assert(['male', 'female'].includes(pet.gender));
  assert.strictEqual(st.save.mainPet.id, pet.id);
  assert.strictEqual(st.currentEgg(), null);
});

test('照看蛋提升初始心情但不加速孵化', () => {
  const st = mk();
  const egg = st.adoptEgg();
  st.careEgg(); st.careEgg();
  assert.strictEqual(egg.ageMs, 0, '照看不改变孵化计时');
  step(st, egg.hatchDays * 24 + 1);
  const pet = st.hatch();
  assert(pet.stats.mood > 80, '初始心情应获加成');
});

// 保持健康推进（每 6 小时补满状态），避免病变死亡干扰阶段测试
function stepHealthy(st, hours) {
  const pet = st.save.mainPet;
  let left = hours;
  while (left > 0) {
    const chunk = Math.min(6, left);
    if (pet && pet.alive) {
      pet.stats.satiety = 100; pet.stats.hygiene = 100;
      pet.stats.health = 100; pet.stats.energy = 100; pet.stats.mood = 100;
    }
    step(st, chunk);
    left -= chunk;
  }
}

test('按物种阶段边界推进（个体寿命缩放）', () => {
  const st = mk();
  const pet = hatchPet(st);
  pet.actualLifespan = pet.lifespanRange[1]; // 用寿命上限放大阶段边界
  const boundaryDays = st.stageBoundary(pet, 'adult');
  assert(boundaryDays > CFG.SPECIES[pet.species].stages.adult * 0.9, '边界应随寿命缩放');
  stepHealthy(st, boundaryDays * 24 + 2);
  assert(st.save.mainPet === pet, '宠物应存活');
  assert(['adult', 'mature', 'senior'].includes(pet.stage), '应进入成体或更高，实际=' + pet.stage);
});

test('离线保护期衰减减半', () => {
  const shortAway = mk();
  const petA = hatchPet(shortAway);
  const satA0 = petA.stats.satiety;
  step(shortAway, 2); // 2h 保护期

  const longAway = mk();
  const petB = hatchPet(longAway);
  const satB0 = petB.stats.satiety;
  // 模拟离开 20h（跨过保护期）后再推进 2h，共 22h
  step(longAway, 22);

  const dropA = satA0 - petA.stats.satiety;
  const dropB = satB0 - petB.stats.satiety;
  const rateA = dropA / 2;      // 每小时
  const rateB = dropB / 22;
  assert(rateA < rateB, '保护期单位小时衰减应更小 rateA=' + rateA.toFixed(3) + ' rateB=' + rateB.toFixed(3));
});

test('健康过低进入虚弱并持续计时', () => {
  const st = mk();
  const pet = hatchPet(st);
  pet.stats.satiety = 0; pet.stats.hygiene = 0; pet.stats.health = 20;
  step(st, 3);
  assert(pet.stats.health < CFG.HEALTH.weakThreshold, '健康应保持低位');
  assert(pet.weakMs > 0, '应进入虚弱计时');
});

test('病变死亡：虚弱满 24h 触发', () => {
  const st = mk();
  const pet = hatchPet(st);
  pet.stats.satiety = 0; pet.stats.hygiene = 0; pet.stats.health = 5;
  step(st, 25);
  assert.strictEqual(pet.alive, false, '应死亡');
  assert.strictEqual(pet.deathReason, 'illness');
});

test('自然衰老：达到个体寿命触发', () => {
  const st = mk();
  const pet = hatchPet(st);
  pet.actualLifespan = 3; // 缩短以便测试
  // 持续补满状态避免病变提前干扰
  for (let i = 0; i < 4; i++) {
    pet.stats.satiety = 100; pet.stats.hygiene = 100; pet.stats.health = 100;
    step(st, 24);
  }
  assert.strictEqual(pet.alive, false, '应自然死亡');
  assert.strictEqual(pet.deathReason, 'age');
});

test('无后代死亡 → 补偿随机蛋，可重新开养', () => {
  const st = mk();
  hatchPet(st);
  st.debugKill('illness');
  assert.strictEqual(st.save.mainPet, null);
  assert.strictEqual(st.save.eggs.length, 1);
  assert.strictEqual(st.save.eggs[0].source, 'compensation');
});

test('有后代死亡 → 后代单线继承为主宠', () => {
  const st = mk();
  const parent = hatchPet(st);
  st.debugInjectOffspring();
  const childId = st.save.offspringSlot.id;
  st.debugKill('age');
  assert(st.save.mainPet && st.save.mainPet.alive, '后代应继位');
  assert.strictEqual(st.save.mainPet.id, childId);
  assert.strictEqual(st.save.offspringSlot, null);
  assert(st.save.mainPet.parents.indexOf(parent.id) >= 0, '谱系引用应保留父代 id');
});

test('互动操作恢复属性且无货币消耗', () => {
  const st = mk();
  const pet = hatchPet(st);
  pet.stats.satiety = 20; pet.stats.health = 50;
  st.feed();
  assert(pet.stats.satiety > 20);
  st.interact('herb');
  assert(pet.stats.health > 50);
  assert.strictEqual(typeof st.save.player.kinship, 'number', '亲缘值存在');
  assert(!('coins' in st.save), '不应有金币字段');
});

test('纪念相册从破壳起记录，阶段升级继续入册', () => {
  const st = mk();
  const pet = hatchPet(st);
  const photos = st.albumFor(pet.id);
  assert(photos.length >= 1, '破壳应入册');
  assert.strictEqual(photos[0].stage, 'baby');
  assert.strictEqual(photos[0].title, '破壳那一刻');
  const before = photos.length;
  const boundaryDays = st.stageBoundary(pet, 'adult');
  stepHealthy(st, boundaryDays * 24 + 2);
  assert(st.albumFor(pet.id).length > before, '阶段升级应继续入册');
});

test('调试加速档位生效', () => {
  const st = mk();
  st.adoptEgg();
  st.setTimeScale(3); // 86400x：1 真实小时 = 86400 游戏小时
  step(st, 1);
  assert(st.currentEgg().ageMs > 0, '加速后应推进蛋龄');
  assert(st.canHatch(), '高倍速 1 小时应已孵化');
  st.setTimeScale(0);
});

test('领养推送三枚随机蛋（种类可重复），选择后只剩一枚', () => {
  const st = mk();
  const eggs = st.adoptEggs();
  assert.strictEqual(eggs.length, 3, '应推送三枚');
  assert(eggs.every(e => CFG.SPECIES_KEYS.includes(e.species)), '每枚种类应合法');
  const picked = eggs[1];
  assert.strictEqual(st.chooseEgg(picked.id).id, picked.id, '选中的应是点击的那枚');
  assert.strictEqual(st.save.eggs.length, 1, '其余两枚应退回');
  assert.strictEqual(st.currentEgg().species, picked.species);
});

test('随机三枚允许种类重复（统计 200 次应出现重复组合）', () => {
  let sawDup = false;
  for (let i = 0; i < 200 && !sawDup; i++) {
    const st = mk();
    const eggs = st.adoptEggs();
    if (new Set(eggs.map(e => e.species)).size < 3) sawDup = true;
  }
  assert(sawDup, '随机抽取应能出现两枚或三枚同种');
});

test('看广告刷新：待选阶段重抽三枚、不限次数、计数递增', () => {
  const st = mk();
  st.adoptEggs();
  const before = st.save.eggs.map(e => e.id);
  const after = st.refreshEggs();
  assert.strictEqual(after.length, 3, '刷新后仍为三枚');
  const afterIds = after.map(e => e.id);
  assert(afterIds.every(id => !before.includes(id)), '应是全新三枚蛋');
  st.refreshEggs(); st.refreshEggs(); st.refreshEggs();
  assert(st.save.meta.adDaily.refreshed >= 4, '刷新不限次数且计数递增');
});

test('已选定或孵化中不可刷新', () => {
  const st = mk();
  st.adoptEggs();
  st.chooseEgg(st.save.eggs[0].id);
  assert.strictEqual(st.refreshEggs(), null, '选定后不能刷新');
  assert.strictEqual(st.save.eggs.length, 1, '存档不应被改变');
});

test('三枚待选期间不计时，选定后才开始孵化', () => {
  const st = mk();
  st.adoptEggs();
  step(st, 24);
  assert(st.save.eggs.every(e => e.ageMs === 0), '待选阶段不应推进孵化');
  st.chooseEgg(st.save.eggs[0].id);
  step(st, 24);
  assert(st.currentEgg().ageMs > 0, '选定后应开始计时');
});

test('蛋外观为组合主导：共享底色 + 共享纹理，单看一维无法定种', () => {
  const a = CFG.SPECIES.trex.egg, b = CFG.SPECIES.plesiosaurus.egg, c = CFG.SPECIES.triceratops.egg;
  assert.strictEqual(a.color, b.color, '霸王龙与蛇颈龙共享赤陶底色');
  assert.strictEqual(a.pattern, c.pattern, '霸王龙与三角龙共享鳞纹');
  assert.notStrictEqual(b.color, c.color, '蛇颈龙与三角龙底色不同');
  assert.notStrictEqual(b.pattern, c.pattern, '蛇颈龙与三角龙纹理不同');
});

test('精力低于阈值自动入睡，玩家没有主动休息操作', () => {
  const st = mk();
  const pet = hatchPet(st);
  assert.strictEqual(CFG.INTERACT.rest, undefined, '休息不应是玩家互动项');
  assert.strictEqual(pet.sleeping, false, '破壳时应清醒');
  pet.stats.energy = CFG.REST.enterEnergy + 5; // 幼体 -2/h，6h 后跌破阈值
  step(st, 6);
  assert.strictEqual(pet.sleeping, true, '精力过低应自动入睡');
  assert(st.save.records.some(r => r.event === 'sleep_start'), '入睡应写入豢养记录');
});

test('睡眠期间禁止喂食，其他护理仍可进行', () => {
  const st = mk();
  const pet = hatchPet(st);
  st.debugSetSleep(true);
  pet.stats.satiety = 30;
  const before = pet.stats.satiety;
  assert.strictEqual(st.feed(), false, '睡眠中喂食应被拦截');
  assert.strictEqual(pet.stats.satiety, before, '被拦截的喂食不应改变饱食');
  assert(st.drainEvents().some(e => e.type === 'feed_blocked'), '应发出喂食被拦截事件');
  assert.strictEqual(st.interact('bath'), true, '睡眠中清洁不受影响');
  assert(pet.stats.hygiene > 70);
});

test('睡眠中精力自动恢复，达到阈值自然醒', () => {
  const st = mk();
  const pet = hatchPet(st);
  st.debugSetSleep(true);
  assert.strictEqual(pet.sleeping, true);
  step(st, 10); // 单帧 10h：恢复 +10/h，越过 wakeEnergy
  assert.strictEqual(pet.sleeping, false, '精力恢复后应自动醒来');
  assert(pet.stats.energy >= CFG.REST.wakeEnergy, '醒来时精力应达阈值');
  assert(st.save.records.some(r => r.event === 'sleep_end'), '醒来应写入豢养记录');
});

test('虚弱时不入睡，睡眠中转虚弱则强制唤醒', () => {
  const st = mk();
  const pet = hatchPet(st);
  pet.stats.health = 30;
  pet.stats.energy = 5;
  step(st, 1);
  assert.strictEqual(pet.sleeping, false, '虚弱时不应入睡，否则喂食被拦无法救治');
  st.debugSetSleep(true);
  assert.strictEqual(pet.sleeping, true);
  pet.stats.health = 30;
  step(st, 1);
  assert.strictEqual(pet.sleeping, false, '睡眠中转虚弱应强制醒来');
});

test('后代继承后默认清醒，不继承睡眠状态', () => {
  const st = mk();
  const parent = hatchPet(st);
  st.debugInjectOffspring();
  st.debugSetSleep(true);
  assert.strictEqual(parent.sleeping, true);
  st.debugKill('age');
  const child = st.save.mainPet;
  assert.strictEqual(child.sleeping, false, '继位后代应清醒');
});

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed\n');
if (fail > 0) process.exit(1);
