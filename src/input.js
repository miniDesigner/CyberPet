/**
 * src/input.js — 触摸命中检测
 * 统一接收平台层归一化后的坐标，分发给当前场景的热区。
 */
(function (root, factory) {
  var isNode = (typeof module !== 'undefined' && module.exports);
  var mod = factory();
  if (isNode) module.exports = mod;
  else root.INPUT = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function hit(btn, x, y) {
    return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
  }

  function find(hotspots, x, y) {
    // 逆序命中，后绘制的在上层
    for (var i = hotspots.length - 1; i >= 0; i--) {
      if (hit(hotspots[i], x, y)) return hotspots[i];
    }
    return null;
  }

  // 生成网格按钮布局
  function gridButtons(labels, opts) {
    opts = opts || {};
    var cols = opts.cols || 2;
    var gap = opts.gap || 10;
    var w = opts.w || 140;
    var h = opts.h || 46;
    var startX = opts.x || 0;
    var startY = opts.y || 0;
    return labels.map(function (label, i) {
      return {
        label: label,
        x: startX + (i % cols) * (w + gap),
        y: startY + Math.floor(i / cols) * (h + gap),
        w: w, h: h
      };
    });
  }

  return { hit: hit, find: find, gridButtons: gridButtons };
});
