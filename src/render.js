/**
 * src/render.js — Canvas 渲染层（拟真史前风格，纯矢量绘制，零外部资源）
 *
 * 负责：蛋（三种辨识外观）、恐龙（三种剪影 + 体征/性别差异）、状态条、
 *       主界面、破壳/死亡/相册弹层、调试面板。所有绘制基于逻辑坐标。
 */
(function (root, factory) {
  var isNode = (typeof module !== 'undefined' && module.exports);
  var CFG = isNode ? require('./config') : root.CONFIG;
  var mod = factory(CFG);
  if (isNode) module.exports = mod;
  else root.RENDER = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CFG) {
  'use strict';

  var C = {
    bg: '#e8e2d1', bgDark: '#d6cdb6', panel: '#f5f0e2',
    ink: '#3a3228', inkSoft: '#6b5f4e',
    green: '#3E6B4F', brown: '#8B6B4A', blue: '#4A7C9B', yellow: '#E8C87A',
    red: '#c0563f', bar: '#e0d8c4', shadow: 'rgba(0,0,0,0.12)',
    white: '#fffdf6'
  };

  var STATE_COLOR = {
    satiety: '#c98b3f', hygiene: '#4A7C9B', mood: '#d8a13c',
    energy: '#3E6B4F', health: '#c0563f'
  };
  var STATE_LABEL = {
    satiety: '饱食', hygiene: '清洁', mood: '心情', energy: '精力', health: '健康'
  };

  // ---------- 基础绘图 ----------
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(ctx, str, x, y, size, color, align, weight) {
    ctx.font = (weight || '') + ' ' + size + 'px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = color || C.ink;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  function bg(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, C.bg);
    g.addColorStop(1, C.bgDark);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // 柔和装饰纹理（远景丘陵）
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = C.green;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.quadraticCurveTo(w * 0.3, h * 0.62, w * 0.6, h * 0.74);
    ctx.quadraticCurveTo(w * 0.85, h * 0.66, w, h * 0.72);
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---------- 蛋 ----------
  function drawEgg(ctx, egg, cx, cy, scale, t) {
    var sp = CFG.SPECIES[egg.species];
    scale = scale || 1;
    // 轻微晃动（照看后或待机呼吸）
    var wobble = Math.sin(t / 420) * 0.03;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wobble);
    ctx.scale(scale, scale);

    // 阴影
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 78, 62, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var w = egg.appearance === 'wave' ? 56 : (egg.appearance === 'shield' ? 68 : 64);
    var h = egg.appearance === 'wave' ? 92 : 82;

    // 蛋体
    var g = ctx.createRadialGradient(-w * 0.3, -h * 0.3, 4, 0, 0, h);
    g.addColorStop(0, lighten(sp.egg.color, 0.25));
    g.addColorStop(1, sp.egg.color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.bezierCurveTo(w, -h, w, h * 0.35, 0, h);
    ctx.bezierCurveTo(-w, h * 0.35, -w, -h, 0, -h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 纹理（三态辨识）
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = sp.egg.mark;
    ctx.fillStyle = sp.egg.mark;
    if (egg.appearance === 'scale') {
      for (var y = -h + 12; y < h; y += 14) {
        for (var x = -w; x < w; x += 16) {
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.arc(x + ((y / 14) % 2) * 8, y, 6, 0, Math.PI);
          ctx.stroke();
        }
      }
    } else if (egg.appearance === 'wave') {
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 3;
      for (var wy = -h + 10; wy < h; wy += 16) {
        ctx.beginPath();
        for (var wx = -w; wx <= w; wx += 4) {
          var yy = wy + Math.sin(wx * 0.12 + t / 600) * 4;
          if (wx === -w) ctx.moveTo(wx, yy); else ctx.lineTo(wx, yy);
        }
        ctx.stroke();
      }
    } else if (egg.appearance === 'shield') {
      ctx.globalAlpha = 0.45;
      for (var sy = -h + 20; sy < h; sy += 26) {
        ctx.beginPath();
        ctx.moveTo(0, sy - 10);
        ctx.lineTo(14, sy);
        ctx.lineTo(0, sy + 10);
        ctx.lineTo(-14, sy);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // 高光
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-w * 0.35, -h * 0.35, w * 0.18, h * 0.3, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function lighten(hex, amt) {
    var c = hex.replace('#', '');
    var r = parseInt(c.substring(0, 2), 16), g = parseInt(c.substring(2, 4), 16), b = parseInt(c.substring(4, 6), 16);
    r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // ---------- 恐龙 ----------
  function drawPet(ctx, pet, cx, cy, scale, t, mood, sleeping) {
    var sp = CFG.SPECIES[pet.species];
    var col = sp.colors;
    scale = scale || 1;
    var breathe = sleeping ? Math.sin(t / 1400) * 3 : Math.sin(t / 700) * 2;
    ctx.save();
    ctx.translate(cx, cy + breathe);
    ctx.scale(scale, scale);
    if (pet.form === 'weathered') ctx.globalAlpha = 0.9;

    // 阴影
    ctx.save();
    ctx.globalAlpha = 0.16; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 70, 80, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    var bodyColor = pet.form === 'weathered' ? desaturate(col.body) : col.body;
    if (pet.species === 'trex') drawTrex(ctx, bodyColor, col, t, mood);
    else if (pet.species === 'plesiosaurus') drawPlesio(ctx, bodyColor, col, t, mood);
    else drawTrike(ctx, bodyColor, col, t, mood);

    // 性别标识（细微：雄性冠色更艳）
    if (pet.gender === 'male') {
      ctx.save();
      ctx.globalAlpha = 0.5; ctx.fillStyle = col.eye;
      ctx.beginPath(); ctx.arc(-52, -66, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 睡眠表现：闭眼 + 缓慢浮动的 Zzz（休息是自动行为，不出现在玩家操作中）
    if (sleeping) {
      var eye = pet.species === 'trex' ? [-64, -30, 8, -30, -84]
        : pet.species === 'plesiosaurus' ? [-98 + Math.sin(t / 800) * 6, -106, 6, -66, -140]
          : [-56, -18, 7, -30, -80];
      ctx.fillStyle = bodyColor; // 盖住原本睁开的眼睛
      ctx.beginPath();
      ctx.ellipse(eye[0], eye[1], eye[2], eye[2] * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = col.mark; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(eye[0], eye[1] + 2, eye[2] * 0.72, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      var float = Math.sin(t / 900) * 3;
      ctx.fillStyle = C.blue; ctx.textAlign = 'center';
      ctx.font = '700 14px sans-serif'; ctx.fillText('Z', eye[3], eye[4] + float);
      ctx.font = '700 10px sans-serif'; ctx.fillText('z', eye[3] + 12, eye[4] - 10 + float);
      ctx.font = '700 8px sans-serif';  ctx.fillText('z', eye[3] + 20, eye[4] - 18 + float);
    }
    ctx.restore();
  }

  function drawTrex(ctx, body, col, t, mood) {
    // 尾巴 + 身体
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(10, 20);
    ctx.quadraticCurveTo(90, 10, 120, -30);
    ctx.quadraticCurveTo(70, 30, 20, 55);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 20, 52, 40, -0.15, 0, Math.PI * 2); ctx.fill();
    // 腹部
    ctx.fillStyle = col.belly;
    ctx.beginPath(); ctx.ellipse(-6, 34, 34, 22, -0.1, 0, Math.PI * 2); ctx.fill();
    // 腿
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-18, 60, 14, 22, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(14, 62, 13, 20, -0.2, 0, Math.PI * 2); ctx.fill();
    // 小前肢
    ctx.strokeStyle = body; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-28, 10); ctx.lineTo(-44, 22); ctx.stroke();
    // 头
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-52, -22, 36, 28, -0.1, 0, Math.PI * 2); ctx.fill();
    // 吻部
    ctx.beginPath();
    ctx.moveTo(-80, -18); ctx.quadraticCurveTo(-110, -14, -104, 2);
    ctx.quadraticCurveTo(-80, 8, -60, 2); ctx.closePath(); ctx.fill();
    // 嘴缝
    ctx.strokeStyle = col.mark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-104, -4); ctx.lineTo(-66, -4); ctx.stroke();
    // 眼
    ctx.fillStyle = col.eye;
    ctx.beginPath(); ctx.arc(-64, -30, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1410';
    ctx.beginPath(); ctx.arc(-64, -30, 2.2, 0, Math.PI * 2); ctx.fill();
    // 背脊
    ctx.fillStyle = col.mark;
    for (var i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-10 + i * 20, -18 + i * 2);
      ctx.lineTo(0 + i * 20, -30 + i * 2);
      ctx.lineTo(10 + i * 20, -16 + i * 2);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawPlesio(ctx, body, col, t, mood) {
    // 身体
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 25, 56, 34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col.belly;
    ctx.beginPath(); ctx.ellipse(0, 36, 40, 18, 0, 0, Math.PI * 2); ctx.fill();
    // 四鳍
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-30, 52, 12, 26, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(28, 52, 12, 26, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-46, 16, 22, 9, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(46, 16, 22, 9, 0.4, 0, Math.PI * 2); ctx.fill();
    // 长颈（S 形，随呼吸摆动）
    var sw = Math.sin(t / 800) * 6;
    ctx.strokeStyle = body; ctx.lineWidth = 20; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-30, 8);
    ctx.bezierCurveTo(-70, -10, -60 + sw, -70, -90 + sw, -96);
    ctx.stroke();
    // 头
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-94 + sw, -102, 20, 13, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-108 + sw, -104); ctx.lineTo(-122 + sw, -100); ctx.lineTo(-108 + sw, -96);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = col.eye;
    ctx.beginPath(); ctx.arc(-98 + sw, -106, 3.6, 0, Math.PI * 2); ctx.fill();
    // 水波纹理
    ctx.strokeStyle = col.mark; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
    for (var i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 20, 30 + i * 10, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawTrike(ctx, body, col, t, mood) {
    // 身体
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(6, 22, 58, 38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col.belly;
    ctx.beginPath(); ctx.ellipse(6, 36, 40, 20, 0, 0, Math.PI * 2); ctx.fill();
    // 四足
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-28, 58, 13, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(30, 58, 13, 18, 0, 0, Math.PI * 2); ctx.fill();
    // 尾巴
    ctx.beginPath();
    ctx.moveTo(52, 12); ctx.quadraticCurveTo(100, 6, 118, 22);
    ctx.quadraticCurveTo(80, 30, 52, 34); ctx.closePath(); ctx.fill();
    // 头盾
    ctx.fillStyle = col.mark;
    ctx.beginPath();
    ctx.moveTo(-44, -30);
    ctx.quadraticCurveTo(-70, -60, -96, -44);
    ctx.quadraticCurveTo(-104, -10, -76, 8);
    ctx.quadraticCurveTo(-56, 4, -44, -30);
    ctx.closePath(); ctx.fill();
    // 面部
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(-58, -16, 26, 22, 0, 0, Math.PI * 2); ctx.fill();
    // 三只角
    ctx.fillStyle = C.white;
    ctx.beginPath(); ctx.moveTo(-74, -28); ctx.lineTo(-88, -56); ctx.lineTo(-64, -30); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-52, -32); ctx.lineTo(-54, -62); ctx.lineTo(-42, -32); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-50, -6); ctx.lineTo(-70, 2); ctx.lineTo(-48, 2); ctx.closePath(); ctx.fill();
    // 眼
    ctx.fillStyle = col.eye;
    ctx.beginPath(); ctx.arc(-56, -18, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1410';
    ctx.beginPath(); ctx.arc(-56, -18, 1.8, 0, Math.PI * 2); ctx.fill();
  }

  function desaturate(hex) {
    var c = hex.replace('#', '');
    var r = parseInt(c.substring(0, 2), 16), g = parseInt(c.substring(2, 4), 16), b = parseInt(c.substring(4, 6), 16);
    var gray = Math.round((r + g + b) / 3);
    return 'rgb(' + Math.round((r + gray) / 2) + ',' + Math.round((g + gray) / 2) + ',' + Math.round((b + gray) / 2) + ')';
  }

  // ---------- UI 组件 ----------
  function drawBar(ctx, x, y, w, h, key, value, label) {
    text(ctx, label || STATE_LABEL[key], x, y + h / 2, 13, C.inkSoft, 'left');
    var bx = x + 34, bw = w - 34;
    rr(ctx, bx, y, bw, h, h / 2); ctx.fillStyle = C.bar; ctx.fill();
    var v = Math.max(0, Math.min(100, value));
    if (v > 0) {
      rr(ctx, bx, y, Math.max(h, bw * v / 100), h, h / 2);
      ctx.fillStyle = STATE_COLOR[key]; ctx.fill();
    }
    text(ctx, Math.round(v), bx + bw + 6, y + h / 2, 12, C.inkSoft, 'left');
  }

  function drawButton(ctx, btn, t) {
    var hover = btn.hovered;
    ctx.save();
    ctx.shadowColor = C.shadow; ctx.shadowBlur = hover ? 10 : 5; ctx.shadowOffsetY = 2;
    rr(ctx, btn.x, btn.y, btn.w, btn.h, 12);
    ctx.fillStyle = btn.primary ? (hover ? lighten(btn.color, 0.12) : btn.color) : (hover ? C.white : C.panel);
    ctx.fill();
    ctx.restore();
    rr(ctx, btn.x, btn.y, btn.w, btn.h, 12);
    ctx.strokeStyle = btn.primary ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1; ctx.stroke();
    text(ctx, btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2, btn.fontSize || 15,
      btn.primary ? '#fffdf6' : C.ink, 'center', '600');
  }

  function drawPanel(ctx, x, y, w, h) {
    ctx.save();
    ctx.shadowColor = C.shadow; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
    rr(ctx, x, y, w, h, 18); ctx.fillStyle = C.panel; ctx.fill();
    ctx.restore();
  }

  function drawOverlay(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(30,26,20,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function formatDuration(ms) {
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    if (h > 0) return h + '小时' + m + '分';
    if (m > 0) return m + '分' + s + '秒';
    return s + '秒';
  }

  return {
    C: C,
    bg: bg,
    rr: rr,
    text: text,
    drawEgg: drawEgg,
    drawPet: drawPet,
    drawBar: drawBar,
    drawButton: drawButton,
    drawPanel: drawPanel,
    drawOverlay: drawOverlay,
    formatDuration: formatDuration,
    lighten: lighten
  };
});
