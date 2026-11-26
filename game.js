/**
 * CyberPet 微信小游戏入口
 * 阶段二 Demo：随机蛋 → 计时孵化 → 基础照顾 → 死亡与单线继承
 *
 * 微信小游戏无 DOM，全部通过 Canvas + wx API；模块用 CommonJS（require）。
 */
require('./src/config');
require('./src/store');
require('./src/render');
require('./src/input');
require('./src/main').start();
