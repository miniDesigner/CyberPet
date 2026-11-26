/**
 * src/config.js — 静态配置（物种、数值、文案）
 * 数值口径来自 docs/游戏设计文档.md v0.6
 * 纯数据模块，无副作用，可在 Node / 小游戏 / 浏览器共用。
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.CONFIG = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAY = 24 * 60 * 60 * 1000;

  // 物种配置：阶段天数以「基准寿命」为准，个体实际寿命浮动时按比例缩放
  var SPECIES = {
    trex: {
      key: 'trex',
      name: '霸王龙',
      latin: 'Tyrannosaurus',
      diet: '肉食',
      habitat: '陆地/丛林',
      hatchDays: 3,
      lifespanRange: [70, 90],
      baseLifespan: 80,
      // 阶段结束日（自破壳起，基准寿命下）
      stages: { baby: 10, adult: 35, mature: 60, senior: 80 },
      egg: { color: '#7a3b2e', mark: '#c96a4b', pattern: 'scale' },
      colors: { body: '#8c5a3c', belly: '#d8b98c', mark: '#5e3423', eye: '#f2c14e' },
      games: { single: ['猎物追击', '咆哮节奏'], friend: ['领地争锋', '双龙竞速'] }
    },
    plesiosaurus: {
      key: 'plesiosaurus',
      name: '蛇颈龙',
      latin: 'Plesiosaurus',
      diet: '肉食',
      habitat: '水域',
      hatchDays: 4,
      lifespanRange: [80, 100],
      baseLifespan: 90,
      stages: { baby: 12, adult: 42, mature: 70, senior: 90 },
      egg: { color: '#2f6f8f', mark: '#7fc4d8', pattern: 'wave' },
      colors: { body: '#4a7c9b', belly: '#bcd9e2', mark: '#2b5670', eye: '#e8d36a' },
      games: { single: ['深潜捕鱼', '洋流穿梭'], friend: ['深海接力', '波纹共鸣'] }
    },
    triceratops: {
      key: 'triceratops',
      name: '三角龙',
      latin: 'Triceratops',
      diet: '植食',
      habitat: '陆地/草原',
      hatchDays: 5,
      lifespanRange: [100, 120],
      baseLifespan: 110,
      stages: { baby: 15, adult: 50, mature: 85, senior: 110 },
      egg: { color: '#a98a3c', mark: '#e0c674', pattern: 'shield' },
      colors: { body: '#8f8452', belly: '#d6cf9c', mark: '#5a5330', eye: '#c96a4b' },
      games: { single: ['顶角推球', '植食觅途'], friend: ['角力顶撞', '坚盾守护'] }
    }
  };

  var SPECIES_KEYS = ['trex', 'plesiosaurus', 'triceratops'];

  // 阶段衰减（每小时），key 与 SPECIES.stages 对应
  var DECAY = {
    baby:   { satiety: -4,   hygiene: -3,   mood: -3,   energy: -2 },
    adult:  { satiety: -3,   hygiene: -2,   mood: -2,   energy: -1.5 },
    mature: { satiety: -2.5, hygiene: -2,   mood: -2,   energy: -1.5 },
    senior: { satiety: -3,   hygiene: -2.5, mood: -2.5, energy: -2 }
  };

  var OFFLINE = {
    protectHours: 4,
    protectFactor: 0.5,
    normalHours: 12,
    floorAtLongAbsence: { satiety: 15, health: 15, energy: 20 }
  };

  var HEALTH = {
    weakThreshold: 40,       // 健康 < 40 进入虚弱
    weakDeathHours: 24,      // 虚弱持续 24h 死亡
    lowSatiety: 30,          // 饱食 < 30 健康缓降
    lowHygiene: 30,          // 清洁 < 30 健康降、心情加速降
    lowMood: 30              // 心情 < 30 体征偏移
  };

  var INTERACT = {
    meat:      { satiety: 25, mood: 5, label: '肉类' },
    plant:     { satiety: 22, mood: 5, label: '植食' },
    bath:      { hygiene: 30, label: '泥浴' },
    pet:       { mood: 8, cooldownMs: 10000, label: '抚摸' },
    rest:      { energyPerMinute: 2, label: '休息' },
    herb:      { health: 30, label: '药草' },
    careEgg:   { mood: 10, label: '照看蛋' }
  };

  var STAGE_LABEL = {
    egg: '蛋', baby: '幼体', adult: '成体', mature: '成熟体', senior: '老年体'
  };

  var FORM_LABEL = {
    strong: '强壮型', agile: '敏捷型', standard: '标准型', weathered: '沧桑型'
  };

  // 调试加速档位（仅 Demo，正式版移除）
  var TIME_SCALE = [1, 60, 3600, 86400];

  return {
    DAY: DAY,
    SPECIES: SPECIES,
    SPECIES_KEYS: SPECIES_KEYS,
    DECAY: DECAY,
    OFFLINE: OFFLINE,
    HEALTH: HEALTH,
    INTERACT: INTERACT,
    STAGE_LABEL: STAGE_LABEL,
    FORM_LABEL: FORM_LABEL,
    TIME_SCALE: TIME_SCALE,
    GENDER_MALE_RATE: 0.55,
    SAVE_KEY: 'cyberpet_save_v1'
  };
});
