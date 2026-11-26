/**
 * src/platform.js — 平台适配层
 * 小游戏用 wx.*，浏览器预览用等价 DOM 实现，业务代码只依赖本模块。
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.PLATFORM = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var isWx = typeof wx !== 'undefined' && !!wx.createCanvas;

  var canvas, ctx, sysInfo;
  var touchHandlers = { start: [], move: [], end: [] };

  function getCanvas() {
    if (canvas) return canvas;
    if (isWx) {
      canvas = wx.createCanvas();
      sysInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    } else {
      canvas = document.getElementById('game');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'game';
        document.body.appendChild(canvas);
      }
      // 逻辑坐标 = 容器实际显示尺寸，保证绘制与点击换算一致
      var frame = canvas.parentNode;
      var cw = (frame && frame.clientWidth) || window.innerWidth;
      var ch = (frame && frame.clientHeight) || window.innerHeight;
      sysInfo = { windowWidth: cw, windowHeight: ch, pixelRatio: window.devicePixelRatio || 1 };
    }
    var dpr = sysInfo.pixelRatio || 1;
    canvas.width = Math.floor(sysInfo.windowWidth * dpr);
    canvas.height = Math.floor(sysInfo.windowHeight * dpr);
    if (!isWx) {
      canvas.style.width = sysInfo.windowWidth + 'px';
      canvas.style.height = sysInfo.windowHeight + 'px';
    }
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    // 逻辑坐标系 = CSS 像素
    return canvas;
  }

  function getContext() { getCanvas(); return ctx; }
  function size() {
    getCanvas();
    return { width: sysInfo.windowWidth, height: sysInfo.windowHeight, dpr: sysInfo.pixelRatio || 1 };
  }

  function onTouch(kind, handler) {
    if (touchHandlers[kind].indexOf(handler) < 0) touchHandlers[kind].push(handler);
  }
  function emitTouch(kind, x, y) {
    touchHandlers[kind].slice().forEach(function (h) { h(x, y); });
  }

  function bindInput() {
    if (isWx) {
      wx.onTouchStart(function (e) {
        var t = e.touches && e.touches[0]; if (t) emitTouch('start', t.clientX, t.clientY);
      });
      wx.onTouchMove(function (e) {
        var t = e.touches && e.touches[0]; if (t) emitTouch('move', t.clientX, t.clientY);
      });
      wx.onTouchEnd(function (e) {
        var t = e.changedTouches && e.changedTouches[0]; if (t) emitTouch('end', t.clientX, t.clientY);
      });
    } else {
      function pos(e) {
        var r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }
      canvas.addEventListener('mousedown', function (e) { var p = pos(e); emitTouch('start', p.x, p.y); });
      canvas.addEventListener('mousemove', function (e) { var p = pos(e); emitTouch('move', p.x, p.y); });
      canvas.addEventListener('mouseup', function (e) { var p = pos(e); emitTouch('end', p.x, p.y); });
      canvas.addEventListener('touchstart', function (e) {
        e.preventDefault(); var t = e.changedTouches[0]; emitTouch('start', t.clientX, t.clientY);
      }, { passive: false });
      canvas.addEventListener('touchmove', function (e) {
        e.preventDefault(); var t = e.changedTouches[0]; emitTouch('move', t.clientX, t.clientY);
      }, { passive: false });
      canvas.addEventListener('touchend', function (e) {
        e.preventDefault(); var t = e.changedTouches[0]; emitTouch('end', t.clientX, t.clientY);
      }, { passive: false });
    }
  }

  function getStorage(key) {
    try {
      var raw = isWx ? wx.getStorageSync(key) : localStorage.getItem(key);
      return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    } catch (e) { return null; }
  }
  function setStorage(key, value) {
    try {
      var raw = JSON.stringify(value);
      if (isWx) wx.setStorageSync(key, raw); else localStorage.setItem(key, raw);
    } catch (e) { /* 存储失败不阻断游戏 */ }
  }
  function removeStorage(key) {
    try { if (isWx) wx.removeStorageSync(key); else localStorage.removeItem(key); } catch (e) {}
  }

  function raf(fn) {
    if (isWx) return requestAnimationFrame(fn);
    return window.requestAnimationFrame(fn);
  }

  function toast(title) {
    if (isWx) wx.showToast({ title: title, icon: 'none', duration: 1200 });
    else if (root.__browserToast) root.__browserToast(title);
  }

  function vibrate() {
    try { if (isWx) wx.vibrateShort({ type: 'light' }); } catch (e) {}
  }

  return {
    isWx: isWx,
    getCanvas: getCanvas,
    getContext: getContext,
    size: size,
    onTouch: onTouch,
    bindInput: bindInput,
    getStorage: getStorage,
    setStorage: setStorage,
    removeStorage: removeStorage,
    raf: raf,
    toast: toast,
    vibrate: vibrate
  };
});
