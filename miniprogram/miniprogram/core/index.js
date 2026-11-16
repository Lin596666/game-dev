"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/mp/entry.ts
var entry_exports = {};
__export(entry_exports, {
  BEAD_MM: () => BEAD_MM,
  BOARD_SIZE: () => BOARD_SIZE,
  BeadGrid: () => BeadGrid,
  COLORS: () => COLORS,
  COLOR_SETS: () => COLOR_SETS,
  EMPTY: () => EMPTY,
  IRON_FINISHES: () => IRON_FINISHES,
  LIBRARY: () => LIBRARY,
  RAINBOW_COLORS: () => RAINBOW_COLORS,
  UndoStack: () => UndoStack,
  base64ToCells: () => base64ToCells,
  cellsToBase64: () => cellsToBase64,
  colorByHex: () => colorByHex,
  colorById: () => colorById,
  colorUsage: () => colorUsage,
  colorsOfSet: () => colorsOfSet,
  createProjectFile: () => createProjectFile,
  decodeShare: () => decodeShare,
  diffSnapshot: () => diffSnapshot,
  encodeShare: () => encodeShare,
  estimateCost: () => estimateCost,
  finishById: () => finishById,
  fitToColorSet: () => fitToColorSet,
  fitToColors: () => fitToColors,
  groupedColors: () => groupedColors,
  inkOn: () => inkOn,
  instructionText: () => instructionText,
  nearestColorToRgb: () => nearestColorToRgb,
  parseProjectFile: () => parseProjectFile,
  parseProjectText: () => parseProjectText,
  physicalInfo: () => physicalInfo,
  printLayout: () => printLayout,
  purchaseText: () => purchaseText,
  quantizeImage: () => quantizeImage,
  shareCodeFromUrl: () => shareCodeFromUrl,
  sparkleAt: () => sparkleAt,
  stockReport: () => stockReport,
  totalBeads: () => totalBeads
});
module.exports = __toCommonJS(entry_exports);

// src/core/grid.ts
var EMPTY = 0;
var BeadGrid = class _BeadGrid {
  constructor(width, height, data) {
    __publicField(this, "width");
    __publicField(this, "height");
    __publicField(this, "data");
    /** 自增版本号，渲染器据此判断是否需要重建位图 */
    __publicField(this, "version", 0);
    if (width <= 0 || height <= 0) throw new Error("网格尺寸必须大于 0");
    this.width = width;
    this.height = height;
    this.data = data && data.length === width * height ? data : new Uint16Array(width * height);
  }
  get length() {
    return this.width * this.height;
  }
  index(x, y) {
    return y * this.width + x;
  }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
  get(x, y) {
    if (!this.inBounds(x, y)) return EMPTY;
    return this.data[this.index(x, y)];
  }
  /** 返回是否真的发生了变化，便于撤销栈判断 */
  set(x, y, color) {
    if (!this.inBounds(x, y)) return false;
    const i = this.index(x, y);
    if (this.data[i] === color) return false;
    this.data[i] = color;
    return true;
  }
  fill(color) {
    this.data.fill(color);
    this.version++;
  }
  clear() {
    this.fill(EMPTY);
  }
  isEmpty() {
    return this.data.every((v) => v === EMPTY);
  }
  /** 已放置的珠子数量 */
  usedCount() {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== EMPTY) n++;
    return n;
  }
  countByColor() {
    var _a;
    const map = /* @__PURE__ */ new Map();
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      if (v === EMPTY) continue;
      map.set(v, ((_a = map.get(v)) != null ? _a : 0) + 1);
    }
    return map;
  }
  clone() {
    const g = new _BeadGrid(this.width, this.height, this.data.slice());
    g.version = this.version;
    return g;
  }
  snapshot() {
    return this.data.slice();
  }
  restore(snapshot) {
    if (snapshot.length !== this.data.length) throw new Error("快照尺寸不匹配");
    this.data.set(snapshot);
    this.version++;
  }
  /** 四个顶点确定的矩形区域（含端点），自动裁剪到边界 */
  extractRect(x0, y0, w, h) {
    const out = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) {
      const sy = y0 + y;
      for (let x = 0; x < w; x++) {
        const sx = x0 + x;
        out[y * w + x] = this.inBounds(sx, sy) ? this.data[this.index(sx, sy)] : EMPTY;
      }
    }
    return out;
  }
  blitRect(x0, y0, w, h, region) {
    for (let y = 0; y < h; y++) {
      const sy = y0 + y;
      for (let x = 0; x < w; x++) {
        const sx = x0 + x;
        if (!this.inBounds(sx, sy)) continue;
        this.data[this.index(sx, sy)] = region[y * w + x];
      }
    }
    this.version++;
  }
  /** 油漆桶：四连通，遇到不同色停止 */
  floodFill(x, y, color) {
    if (!this.inBounds(x, y)) return 0;
    const target = this.get(x, y);
    if (target === color) return 0;
    let changed = 0;
    const stack = [this.index(x, y)];
    const seen = new Uint8Array(this.data.length);
    while (stack.length) {
      const i = stack.pop();
      if (seen[i]) continue;
      if (this.data[i] !== target) continue;
      seen[i] = 1;
      this.data[i] = color;
      changed++;
      const cx = i % this.width;
      const cy = (i - cx) / this.width;
      if (cx > 0) stack.push(i - 1);
      if (cx < this.width - 1) stack.push(i + 1);
      if (cy > 0) stack.push(i - this.width);
      if (cy < this.height - 1) stack.push(i + this.width);
    }
    if (changed) this.version++;
    return changed;
  }
  setFat(x, y, color, size) {
    let changed = 0;
    const r = Math.floor((size - 1) / 2);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (this.set(x + dx, y + dy, color)) changed++;
      }
    }
    return changed;
  }
  line(x0, y0, x1, y1, color, size = 1) {
    let changed = 0;
    let dx = Math.abs(x1 - x0);
    let dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (; ; ) {
      changed += this.setFat(x, y, color, size);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    if (changed) this.version++;
    return changed;
  }
  rect(x0, y0, x1, y1, color, filled, size = 1) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    let changed = 0;
    if (filled) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.setFat(x, y, color, size)) changed++;
        }
      }
    } else {
      changed += this.line(minX, minY, maxX, minY, color, size);
      changed += this.line(maxX, minY, maxX, maxY, color, size);
      changed += this.line(maxX, maxY, minX, maxY, color, size);
      changed += this.line(minX, maxY, minX, minY, color, size);
    }
    if (changed) this.version++;
    return changed;
  }
  ellipse(x0, y0, x1, y1, color, filled, size = 1) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = Math.max((maxX - minX) / 2, 0.5);
    const ry = Math.max((maxY - minY) / 2, 0.5);
    let changed = 0;
    const inside = (x, y) => {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      return nx * nx + ny * ny <= 1.001;
    };
    if (filled) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (inside(x, y) && this.setFat(x, y, color, size)) changed++;
        }
      }
    } else {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (!inside(x, y)) continue;
          const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
          if (edge && this.setFat(x, y, color, size)) changed++;
        }
      }
    }
    if (changed) this.version++;
    return changed;
  }
  /** 全图替换某个色号（换色/批量替换） */
  replaceColor(from, to) {
    let changed = 0;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] === from) {
        this.data[i] = to;
        changed++;
      }
    }
    if (changed) this.version++;
    return changed;
  }
  /** 水平/垂直/对角翻转 */
  transform(kind) {
    const { width: w, height: h } = this;
    const src = this.data.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const from = kind === "flipX" ? src[y * w + (w - 1 - x)] : kind === "flipY" ? src[(h - 1 - y) * w + x] : src[(h - 1 - y) * w + (w - 1 - x)];
        this.data[y * w + x] = from;
      }
    }
    this.version++;
  }
  /** 顺时针旋转 90°：宽高互换，返回新网格（原网格不动） */
  rotated90() {
    const g = new _BeadGrid(this.height, this.width);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        g.data[x * g.width + (this.height - 1 - y)] = this.data[y * this.width + x];
      }
    }
    g.version++;
    return g;
  }
  /** 裁切（用于「按内容裁切」） */
  trimmed() {
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.data[this.index(x, y)] !== EMPTY) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return this.clone();
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    return new _BeadGrid(w, h, this.extractRect(minX, minY, w, h));
  }
};

// src/core/colors.ts
var COLOR_SETS = [
  { id: "basic", label: "基础色", desc: "通用拼豆配色，覆盖度高" },
  { id: "candy", label: "日系糖果", desc: "柔和粉彩，适合小物与角色" },
  { id: "morandi", label: "莫兰迪", desc: "低饱和灰调，适合风景与静物" },
  { id: "nature", label: "自然色", desc: "植物、动物与写实题材" }
];
var BASIC = [
  { name: "白", hex: "#F7F5F2" },
  { name: "米白", hex: "#F0E7D8" },
  { name: "浅灰", hex: "#D8D4CE" },
  { name: "灰", hex: "#A9A4A0" },
  { name: "深灰", hex: "#6B6763" },
  { name: "黑", hex: "#2E2C2A" },
  { name: "奶油黄", hex: "#F7E7B2" },
  { name: "柠檬黄", hex: "#F5D547" },
  { name: "向日葵", hex: "#F2B705" },
  { name: "橘黄", hex: "#F59A23" },
  { name: "橘红", hex: "#ED6A33" },
  { name: "朱红", hex: "#D93A2B" },
  { name: "正红", hex: "#C0182B" },
  { name: "玫红", hex: "#D23C6E" },
  { name: "樱粉", hex: "#F3B6C2" },
  { name: "淡粉", hex: "#F7D6DC" },
  { name: "藕粉", hex: "#E5B8B8" },
  { name: "紫红", hex: "#A63B6B" },
  { name: "葡萄紫", hex: "#6E4A8E" },
  { name: "薰衣草", hex: "#B7A6D6" },
  { name: "雪青", hex: "#8E7FC0" },
  { name: "深蓝", hex: "#22406E" },
  { name: "宝蓝", hex: "#2A5DB0" },
  { name: "天蓝", hex: "#6BB8E0" },
  { name: "水蓝", hex: "#A8D8E8" },
  { name: "薄荷绿", hex: "#A6D9C4" },
  { name: "草绿", hex: "#5FA860" },
  { name: "森林绿", hex: "#2E6B47" },
  { name: "橄榄绿", hex: "#7A8B3F" },
  { name: "黄绿", hex: "#B8CC4A" },
  { name: "卡其", hex: "#C9B38A" },
  { name: "浅棕", hex: "#B98A5E" },
  { name: "棕", hex: "#8A5A34" },
  { name: "深棕", hex: "#5C3B22" },
  { name: "巧克力", hex: "#3E2A1C" },
  { name: "肤色", hex: "#F2CDB2" },
  { name: "浅肤", hex: "#F8E0CD" },
  { name: "驼色", hex: "#D2B48C" },
  { name: "砖红", hex: "#A65A3E" },
  { name: "陶土", hex: "#C97B5A" },
  { name: "雾霾蓝", hex: "#7E93A8" },
  { name: "灰蓝", hex: "#5E7182" },
  { name: "藏青", hex: "#33415C" },
  { name: "苔藓", hex: "#6B7A5A" },
  { name: "藕荷", hex: "#C7A9B8" },
  { name: "奶茶", hex: "#D8C3AE" },
  { name: "麦色", hex: "#E3CFA8" },
  { name: "珊瑚", hex: "#F08A7A" }
];
var CANDY = [
  { name: "棉花糖", hex: "#FDE8EF" },
  { name: "草莓奶", hex: "#F9C6D4" },
  { name: "蜜桃", hex: "#F5A3B7" },
  { name: "玫瑰糖", hex: "#EF7D9E" },
  { name: "树莓", hex: "#E85D86" },
  { name: "杏子", hex: "#FFD9C0" },
  { name: "蜜柑", hex: "#FFC49B" },
  { name: "焦糖橙", hex: "#F7A96A" },
  { name: "奶油黄", hex: "#FFE9A8" },
  { name: "布丁", hex: "#FBE38E" },
  { name: "青苹果", hex: "#E9EFA6" },
  { name: "抹茶奶", hex: "#C6E6A0" },
  { name: "薄荷", hex: "#A8DCA0" },
  { name: "苏打绿", hex: "#8FD3C0" },
  { name: "汽水蓝", hex: "#A9DCE9" },
  { name: "天空", hex: "#BBD7F0" },
  { name: "矢车菊", hex: "#A9C0E8" },
  { name: "薰衣草奶", hex: "#C3B8E8" },
  { name: "紫罗兰糖", hex: "#D6C2E8" },
  { name: "紫阳花", hex: "#E2C6DC" },
  { name: "樱花", hex: "#F0C6C6" },
  { name: "白桃", hex: "#EFD5C4" },
  { name: "米色奶", hex: "#E8E0D4" },
  { name: "雾灰", hex: "#D9D9E0" }
];
var MORANDI = [
  { name: "灰绿", hex: "#C9CFC9" },
  { name: "橄榄灰", hex: "#AEBBAE" },
  { name: "松绿", hex: "#93A39B" },
  { name: "墨绿灰", hex: "#7C8C88" },
  { name: "米灰", hex: "#B8B2A7" },
  { name: "岩石", hex: "#A79E92" },
  { name: "咖啡灰", hex: "#8E8577" },
  { name: "深灰褐", hex: "#6E675E" },
  { name: "驼灰", hex: "#C7B8AE" },
  { name: "豆沙", hex: "#B99F94" },
  { name: "灰砖", hex: "#A8847C" },
  { name: "赤陶灰", hex: "#8C6760" },
  { name: "藕灰", hex: "#C4A8A3" },
  { name: "灰粉", hex: "#B79AA2" },
  { name: "灰紫", hex: "#9E8A93" },
  { name: "紫灰", hex: "#8A7C8C" },
  { name: "蓝紫灰", hex: "#A8A3B5" },
  { name: "蓝灰", hex: "#8B91A3" },
  { name: "石板蓝", hex: "#74809A" },
  { name: "藏蓝灰", hex: "#5F6B82" },
  { name: "雾蓝", hex: "#9FB0BC" },
  { name: "浅灰蓝", hex: "#B9C6CE" },
  { name: "亚麻", hex: "#D5C9B8" },
  { name: "米白", hex: "#E2D8C8" }
];
var NATURE = [
  { name: "雪白", hex: "#FFFFFF" },
  { name: "银", hex: "#EDEDED" },
  { name: "铅灰", hex: "#BFBFBF" },
  { name: "中灰", hex: "#8C8C8C" },
  { name: "炭", hex: "#4D4D4D" },
  { name: "墨黑", hex: "#000000" },
  { name: "咖啡", hex: "#7B4B2A" },
  { name: "陶", hex: "#A9745B" },
  { name: "沙", hex: "#D9B08C" },
  { name: "浅肤", hex: "#F0D2B4" },
  { name: "蜜肤", hex: "#F7E0C9" },
  { name: "嫩芽", hex: "#DEEBC8" },
  { name: "竹青", hex: "#B5D99C" },
  { name: "苔绿", hex: "#8CC084" },
  { name: "翡翠", hex: "#4F9E6A" },
  { name: "松针", hex: "#2F7D5B" },
  { name: "浅水色", hex: "#A7D8DE" },
  { name: "湖蓝", hex: "#6FC3D1" },
  { name: "孔雀", hex: "#3E9DB8" },
  { name: "深海", hex: "#2B6E8F" },
  { name: "麦穗", hex: "#F2E2A0" },
  { name: "金", hex: "#E8C766" },
  { name: "铜", hex: "#C98F3C" },
  { name: "褐金", hex: "#8C6B2F" }
];
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function rgbToLab(r, g, b) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
  const f = (t) => t > 8856e-6 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function deltaE(a, b) {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}
function buildColors() {
  const groups = [
    ["basic", "B", BASIC],
    ["candy", "C", CANDY],
    ["morandi", "M", MORANDI],
    ["nature", "N", NATURE]
  ];
  const seen = /* @__PURE__ */ new Map();
  const out = [];
  for (const [set, prefix, list] of groups) {
    let n = 0;
    for (const raw of list) {
      const key = raw.hex.toUpperCase();
      const existing = seen.get(key);
      if (existing !== void 0) {
        continue;
      }
      n += 1;
      const rgb = hexToRgb(raw.hex);
      const id = out.length + 1;
      seen.set(key, id);
      out.push({
        id,
        code: `${prefix}${String(n).padStart(2, "0")}`,
        name: raw.name,
        hex: key,
        rgb,
        lab: rgbToLab(rgb[0], rgb[1], rgb[2]),
        set
      });
    }
  }
  return out;
}
var COLORS = buildColors();
var COLOR_COUNT = COLORS.length;
var byHex = new Map(COLORS.map((c) => [c.hex.toUpperCase(), c]));
function colorById(id) {
  if (id <= 0 || id > COLORS.length) return null;
  return COLORS[id - 1];
}
function colorByHex(hex) {
  var _a;
  return (_a = byHex.get(hex.toUpperCase())) != null ? _a : null;
}
function nearestColorToRgb(r, g, b, set) {
  const lab = rgbToLab(r, g, b);
  let best = COLORS[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of COLORS) {
    if (set && c.set !== set) continue;
    const d = deltaE(lab, c.lab);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
function groupedColors() {
  return COLOR_SETS.map((set) => ({
    set,
    colors: COLORS.filter((c) => c.set === set.id)
  }));
}
function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function inkOn(hex) {
  return relativeLuminance(hex) > 0.45 ? "#3A342E" : "#FFFFFF";
}

// src/core/history.ts
function diffSnapshot(before, after, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (before[row + x] !== after[row + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const beforeCrop = new Uint16Array(w * h);
  const afterCrop = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) {
    const src = (minY + y) * width + minX;
    const dst = y * w;
    beforeCrop.set(before.subarray(src, src + w), dst);
    afterCrop.set(after.subarray(src, src + w), dst);
  }
  return { x: minX, y: minY, w, h, before: beforeCrop, after: afterCrop };
}
var UndoStack = class {
  constructor(limit = 80) {
    __publicField(this, "undoList", []);
    __publicField(this, "redoList", []);
    __publicField(this, "limit");
    /** 每次变更自增，方便 UI 响应 canUndo/canRedo */
    __publicField(this, "version", 0);
    this.limit = limit;
  }
  get canUndo() {
    return this.undoList.length > 0;
  }
  get canRedo() {
    return this.redoList.length > 0;
  }
  get undoDepth() {
    return this.undoList.length;
  }
  get redoDepth() {
    return this.redoList.length;
  }
  push(patch) {
    this.undoList.push(patch);
    if (this.undoList.length > this.limit) this.undoList.shift();
    this.redoList.length = 0;
    this.version++;
  }
  undo(grid) {
    const patch = this.undoList.pop();
    if (!patch) return false;
    grid.blitRect(patch.x, patch.y, patch.w, patch.h, patch.before);
    this.redoList.push(patch);
    this.version++;
    return true;
  }
  redo(grid) {
    const patch = this.redoList.pop();
    if (!patch) return false;
    grid.blitRect(patch.x, patch.y, patch.w, patch.h, patch.after);
    this.undoList.push(patch);
    this.version++;
    return true;
  }
  clear() {
    this.undoList.length = 0;
    this.redoList.length = 0;
    this.version++;
  }
};

// src/core/pattern.ts
function colorUsage(grid) {
  const out = [];
  for (const [id, count] of grid.countByColor()) {
    const color = colorById(id);
    if (color) out.push({ id, color, count });
  }
  return out.sort((a, b) => b.count - a.count);
}
function totalBeads(grid) {
  return grid.usedCount();
}
function estimateCost(beads, pricePerBead = 0.03) {
  return Math.round(beads * pricePerBead * 100) / 100;
}
function instructionRows(grid) {
  const rows = [];
  for (let y = 0; y < grid.height; y++) {
    const runs = [];
    let x = 0;
    while (x < grid.width) {
      const id = grid.get(x, y);
      if (id === EMPTY) {
        x++;
        continue;
      }
      let len = 1;
      while (x + len < grid.width && grid.get(x + len, y) === id) len++;
      const color = colorById(id);
      if (color) runs.push({ start: x + 1, length: len, id, color });
      x += len;
    }
    if (runs.length) rows.push({ row: y + 1, runs });
  }
  return rows;
}
function instructionText(grid, name = "拼豆图纸") {
  const lines = [];
  const beads = totalBeads(grid);
  lines.push(`${name}　${grid.width} × ${grid.height}`);
  lines.push(`总豆数：${beads} 颗　用色：${colorUsage(grid).length} 色`);
  lines.push("");
  lines.push("【色号清单】");
  for (const u of colorUsage(grid)) {
    lines.push(`${u.color.code} ${u.color.name} ${u.color.hex}　${u.count} 颗`);
  }
  lines.push("");
  lines.push("【逐行说明】");
  for (const row of instructionRows(grid)) {
    const parts = row.runs.map((r) => `${r.start}号起${r.length}颗${r.color.code}`).join("，");
    lines.push(`第 ${row.row} 行：${parts}`);
  }
  return lines.join("\n");
}

// src/core/project.ts
var PROJECT_VERSION = 1;
function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function cellsToBase64(data) {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return bytesToBase64(bytes);
}
function base64ToCells(b64, expectedLength) {
  const bytes = base64ToBytes(b64);
  const out = new Uint16Array(expectedLength);
  const view = new Uint16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  out.set(view.subarray(0, Math.min(view.length, expectedLength)));
  return out;
}
function doneToBase64(done) {
  return bytesToBase64(done);
}
function base64ToDone(b64, length) {
  const out = new Uint8Array(length);
  if (!b64) return out;
  const bytes = base64ToBytes(b64);
  out.set(bytes.subarray(0, Math.min(bytes.length, length)));
  return out;
}
function createProjectFile(grid, meta) {
  var _a;
  const now = Date.now();
  return {
    v: PROJECT_VERSION,
    id: meta.id,
    name: meta.name,
    width: grid.width,
    height: grid.height,
    cells: cellsToBase64(grid.data),
    done: meta.done ? doneToBase64(meta.done) : void 0,
    pricePerBead: meta.pricePerBead,
    finish: meta.finish,
    createdAt: (_a = meta.createdAt) != null ? _a : now,
    updatedAt: now
  };
}
function parseProjectFile(raw) {
  var _a, _b, _c;
  if (typeof raw !== "object" || raw === null) throw new Error("工程文件格式不正确");
  const doc = raw;
  if (doc.v !== PROJECT_VERSION) throw new Error(`不支持的工程版本：${String(doc.v)}`);
  if (!doc.width || !doc.height || !doc.cells) throw new Error("工程文件缺少必要字段");
  const width = Math.floor(doc.width);
  const height = Math.floor(doc.height);
  if (width < 1 || height < 1 || width > 600 || height > 600) throw new Error("网格尺寸超出范围");
  const cells = base64ToCells(doc.cells, width * height);
  const grid = new BeadGrid(width, height, cells);
  return {
    grid,
    done: base64ToDone(doc.done, width * height),
    name: doc.name || "未命名图纸",
    id: doc.id || crypto.randomUUID(),
    pricePerBead: (_a = doc.pricePerBead) != null ? _a : 0.03,
    finish: typeof doc.finish === "string" ? doc.finish : null,
    createdAt: (_b = doc.createdAt) != null ? _b : Date.now(),
    updatedAt: (_c = doc.updatedAt) != null ? _c : Date.now()
  };
}
function parseProjectText(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error("无法解析工程文件（不是有效的 JSON）");
  }
  return parseProjectFile(json);
}

// src/core/library.ts
function pick(hex) {
  var _a, _b;
  const c = colorByHex(hex);
  return c ? c.id : (_b = (_a = COLORS[0]) == null ? void 0 : _a.id) != null ? _b : 1;
}
function snap(hex) {
  const c = colorByHex(hex);
  if (c) return c.id;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return nearestColorToRgb(r, g, b).id;
}
function heartGrid(size) {
  const g = new BeadGrid(size, size);
  const pink = pick("#F3B6C2");
  const deep = pick("#D23C6E");
  const light = pick("#F7D6DC");
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size * 2.5 - 1.25;
      const ny = -((y + 0.5) / size * 2.5 - 1.25) - 0.12;
      const f = Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * ny * ny * ny;
      if (f > 0) continue;
      const hl = (x - size * 0.34) ** 2 + (y - size * 0.32) ** 2 < (size * 0.16) ** 2;
      const sh = (x - size * 0.6) ** 2 + (y - size * 0.72) ** 2 < (size * 0.2) ** 2;
      g.set(x, y, hl ? light : sh ? deep : pink);
    }
  }
  g.version++;
  return g;
}
function starGrid(size) {
  const g = new BeadGrid(size, size);
  const body = pick("#F5D547");
  const edge = pick("#F2B705");
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.46;
  const r = R * 0.46;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 === 0 ? R : r;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (!pointInPolygon(px, py, pts)) continue;
      const nearEdge = !pointInPolygonScale(px, py, pts, cx, cy, 0.86);
      g.set(x, y, nearEdge ? edge : body);
    }
  }
  g.version++;
  return g;
}
function flowerGrid(size) {
  const g = new BeadGrid(size, size);
  const petal = pick("#F3B6C2");
  const petalDeep = pick("#E5B8B8");
  const core = pick("#F7E7B2");
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.47;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - cx) / R;
      const dy = (y + 0.5 - cy) / R;
      const rr = Math.hypot(dx, dy);
      if (rr > 1) continue;
      const ang = Math.atan2(dy, dx);
      const boundary = 0.52 + 0.44 * Math.pow(Math.abs(Math.cos(2.5 * ang)), 1.5);
      if (rr > boundary) continue;
      if (rr < 0.2) {
        g.set(x, y, core);
      } else if (rr > boundary * 0.82) {
        g.set(x, y, petalDeep);
      } else {
        g.set(x, y, petal);
      }
    }
  }
  g.version++;
  return g;
}
function dotGrid(size) {
  const g = new BeadGrid(size, size);
  const dot = pick("#A6D9C4");
  const alt = pick("#F3B6C2");
  const step = Math.max(4, Math.round(size / 6));
  const rad = step * 0.3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x + 0.5) % step - step / 2;
      const gy = (y + 0.5) % step - step / 2;
      if (Math.hypot(gx, gy) > rad) continue;
      g.set(x, y, (Math.floor(x / step) + Math.floor(y / step)) % 2 === 0 ? dot : alt);
    }
  }
  g.version++;
  return g;
}
function sakuraGrid(size) {
  const g = new BeadGrid(size, size);
  const petal = snap("#F6C6D2");
  const petalLight = snap("#FBE4EA");
  const petalEdge = snap("#E48CA4");
  const stamen = snap("#F2D06B");
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.47;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - cx) / R;
      const dy = (y + 0.5 - cy) / R;
      const rr = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const boundary = 0.3 + 0.55 * Math.pow(Math.abs(Math.cos(2.5 * ang)), 1.6);
      if (rr > boundary) continue;
      if (rr < 0.15) g.set(x, y, stamen);
      else if (rr > boundary * 0.88) g.set(x, y, petalEdge);
      else if (rr < 0.42) g.set(x, y, petalLight);
      else g.set(x, y, petal);
    }
  }
  g.version++;
  return g;
}
function pawGrid(size) {
  const g = new BeadGrid(size, size);
  const pad = snap("#F3B6C2");
  const toe = snap("#F8D2D9");
  const s = size;
  const cx = s * 0.5;
  const padCy = s * 0.66;
  const rx = s * 0.3;
  const ry = s * 0.23;
  const toes = [
    [cx - s * 0.215, s * 0.33, s * 0.115],
    [cx - s * 0.075, s * 0.22, s * 0.105],
    [cx + s * 0.075, s * 0.22, s * 0.105],
    [cx + s * 0.215, s * 0.33, s * 0.115]
  ];
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let filled = false;
      const ex = (px - cx) / rx;
      const ey = (py - padCy) / ry;
      if (ex * ex + ey * ey <= 1) {
        g.set(x, y, pad);
        filled = true;
      }
      if (!filled) {
        for (const [tx, ty, tr] of toes) {
          if (Math.hypot(px - tx, py - ty) <= tr) {
            g.set(x, y, toe);
            filled = true;
            break;
          }
        }
      }
    }
  }
  g.version++;
  return g;
}
function strawberryGrid(size) {
  const g = new BeadGrid(size, size);
  const body = snap("#E8636F");
  const bodyLight = snap("#F7B9BE");
  const seed = snap("#FFE9B8");
  const leaf = snap("#6FA36B");
  const s = size;
  const cx = s * 0.5;
  const cy = s * 0.58;
  const R = s * 0.46;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const nx = (x + 0.5 - cx) / R;
      const ny = (y + 0.5 - cy) / R;
      let scaleW = 1;
      if (ny < 0) scaleW = 1 - 0.26 * Math.min(1, -ny);
      if (ny > 0.5) scaleW = 1 - 0.5 * (ny - 0.5);
      if (scaleW <= 0.05) continue;
      const ex = nx / scaleW;
      if (ex * ex + ny * ny > 1) continue;
      if (ny < -0.74) {
        g.set(x, y, leaf);
      } else if ((x * 2 + y * 3) % 7 === 0 && ny > -0.5) {
        g.set(x, y, seed);
      } else if (ex > 0.1 && ny < 0.35) {
        g.set(x, y, bodyLight);
      } else {
        g.set(x, y, body);
      }
    }
  }
  const stemTop = Math.round(cy - R * 1.02);
  const stemBottom = Math.round(cy - R * 0.78);
  const stemX = Math.round(cx - 0.5);
  for (let y = Math.max(0, stemTop); y <= Math.min(s - 1, stemBottom); y++) {
    g.set(stemX, y, leaf);
  }
  g.version++;
  return g;
}
function cloudGrid(size) {
  const g = new BeadGrid(size, size);
  const top = snap("#FBF8F3");
  const edge = snap("#E6DCD0");
  const s = size;
  const R = s * 0.44;
  const cx = s * 0.5;
  const cy = s * 0.5;
  const bubbles = [
    [-0.44, 0.06, 0.3],
    [-0.12, -0.2, 0.4],
    [0.26, -0.02, 0.34],
    [0.52, 0.14, 0.23]
  ];
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const nx = (x + 0.5 - cx) / R;
      const ny = (y + 0.5 - cy) / R;
      if (ny > 0.44) continue;
      let inside = false;
      for (const [bx, by, br] of bubbles) {
        if (Math.hypot(nx - bx, ny - by) <= br) {
          inside = true;
          break;
        }
      }
      if (!inside) continue;
      g.set(x, y, ny > 0.26 ? edge : top);
    }
  }
  g.version++;
  return g;
}
function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > py !== yj > py && px < (xj - xi) * (py - yi) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointInPolygonScale(px, py, poly, cx, cy, k) {
  const scaled = poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
  return pointInPolygon(px, py, scaled);
}
var LIBRARY = [
  {
    id: "heart-29",
    name: "小爱心",
    desc: "29×29，新手第一张，两三种粉色就够",
    size: 29,
    build: () => heartGrid(29)
  },
  {
    id: "star-25",
    name: "奶油星星",
    desc: "25×25，边角料友好，可以做成挂件",
    size: 25,
    build: () => starGrid(25)
  },
  {
    id: "flower-29",
    name: "五瓣小花",
    desc: "29×29，日系小物配色",
    size: 29,
    build: () => flowerGrid(29)
  },
  {
    id: "dot-24",
    name: "波点方巾",
    desc: "24×24，格子感强，适合练习按色数豆",
    size: 24,
    build: () => dotGrid(24)
  },
  {
    id: "sakura-31",
    name: "樱花",
    desc: "31×31，五瓣带花蕊，日系配色（约 300 颗）",
    size: 31,
    build: () => sakuraGrid(31)
  },
  {
    id: "paw-25",
    name: "猫爪",
    desc: "25×25，极省豆，半小时能拼完",
    size: 25,
    build: () => pawGrid(25)
  },
  {
    id: "strawberry-25",
    name: "草莓",
    desc: "25×25，红色系练习，带籽和叶子",
    size: 25,
    build: () => strawberryGrid(25)
  },
  {
    id: "cloud-29",
    name: "云朵",
    desc: "29×29，奶白渐变，适合做床头挂件",
    size: 29,
    build: () => cloudGrid(29)
  }
];

// src/core/palette.ts
function colorsOfSet(set) {
  return COLORS.filter((c) => c.set === set);
}
function fitToColorSet(grid, set) {
  return fitToColors(grid, colorsOfSet(set));
}
function fitToColors(grid, allowed) {
  const targets = allowed.length > 0 ? allowed : COLORS;
  const mapping = /* @__PURE__ */ new Map();
  const resolve = (from) => {
    const hit = mapping.get(from);
    if (hit) return hit;
    const src = COLORS.find((c) => c.id === from);
    let best = targets[0];
    let bestD = Infinity;
    if (src) {
      for (const t of targets) {
        if (t.id === from) {
          best = t;
          bestD = 0;
          break;
        }
        const d = deltaE(src.lab, t.lab);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
    }
    const out = { to: best.id, distance: bestD === Infinity ? 0 : Math.round(bestD * 10) / 10 };
    mapping.set(from, out);
    return out;
  };
  const counts = /* @__PURE__ */ new Map();
  let changed = 0;
  for (let i = 0; i < grid.data.length; i++) {
    const v = grid.data[i];
    if (v === EMPTY) continue;
    const { to, distance } = resolve(v);
    if (to !== v) {
      grid.data[i] = to;
      changed++;
    }
    if (distance > 0) {
      const e = counts.get(v);
      counts.set(v, (e != null ? e : 0) + 1);
    }
  }
  if (changed > 0) grid.version++;
  const after = /* @__PURE__ */ new Set();
  for (let i = 0; i < grid.data.length; i++) {
    const v = grid.data[i];
    if (v !== EMPTY) after.add(v);
  }
  const entries = [];
  for (const [from, count] of counts) {
    const { to, distance } = resolve(from);
    if (to === from) continue;
    entries.push({ from, to, count, distance });
  }
  entries.sort((a, b) => b.count - a.count);
  return { changed, colorsAfter: after.size, entries };
}

// src/core/physical.ts
var BEAD_MM = 5;
var BOARD_SIZE = 29;
var round1 = (n) => Math.round(n * 10) / 10;
function printLayout(width, height, opts = {}) {
  var _a, _b, _c, _d;
  const cellMm = (_a = opts.cellMm) != null ? _a : 6;
  const pageW = (_b = opts.pageW) != null ? _b : 210;
  const pageH = (_c = opts.pageH) != null ? _c : 297;
  const margin = (_d = opts.margin) != null ? _d : 10;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const cols = Math.max(1, Math.floor(usableW / cellMm));
  const rows = Math.max(1, Math.floor(usableH / cellMm));
  const pagesX = Math.max(1, Math.ceil(width / cols));
  const pagesY = Math.max(1, Math.ceil(height / rows));
  return {
    cellMm,
    pageW,
    pageH,
    margin,
    cols,
    rows,
    pagesX,
    pagesY,
    pages: pagesX * pagesY
  };
}
function physicalInfo(width, height, opts = {}) {
  var _a, _b;
  const beadMm = (_a = opts.beadMm) != null ? _a : BEAD_MM;
  const board = (_b = opts.board) != null ? _b : BOARD_SIZE;
  const widthMm = width * beadMm;
  const heightMm = height * beadMm;
  return __spreadValues({
    widthMm,
    heightMm,
    widthCm: round1(widthMm / 10),
    heightCm: round1(heightMm / 10),
    boardsX: Math.max(1, Math.ceil(width / board)),
    boardsY: Math.max(1, Math.ceil(height / board)),
    boards: Math.max(1, Math.ceil(width / board)) * Math.max(1, Math.ceil(height / board))
  }, printLayout(width, height));
}

// src/core/quantize.ts
function sampleImage(source, tw, th) {
  const r = new Float32Array(tw * th);
  const g = new Float32Array(tw * th);
  const b = new Float32Array(tw * th);
  const a = new Float32Array(tw * th);
  const sx = source.width / tw;
  const sy = source.height / th;
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      let n = 0;
      for (let yy = y0; yy < y1 && yy < source.height; yy++) {
        for (let xx = x0; xx < x1 && xx < source.width; xx++) {
          const i = (yy * source.width + xx) * 4;
          const alpha = source.data[i + 3] / 255;
          sr += source.data[i] * alpha;
          sg += source.data[i + 1] * alpha;
          sb += source.data[i + 2] * alpha;
          sa += alpha;
          n++;
        }
      }
      const idx = y * tw + x;
      if (n === 0 || sa === 0) {
        a[idx] = 0;
        continue;
      }
      r[idx] = sr / n;
      g[idx] = sg / n;
      b[idx] = sb / n;
      a[idx] = sa / n;
    }
  }
  return { width: tw, height: th, r, g, b, a };
}
function candidatesFor(set) {
  return set ? COLORS.filter((c) => c.set === set) : COLORS;
}
function nearest(r, g, b, pool) {
  const lab = rgbToLab(r, g, b);
  let best = pool[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of pool) {
    const d = deltaE(lab, c.lab);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
function quantizeImage(source, options) {
  var _a, _b, _c, _d, _e;
  const tw = Math.max(1, Math.floor(options.targetWidth));
  const th = Math.max(1, Math.floor(options.targetHeight));
  const alphaThreshold = (_a = options.alphaThreshold) != null ? _a : 0.35;
  const s = sampleImage(source, tw, th);
  let pool = candidatesFor(options.set);
  const usage = /* @__PURE__ */ new Map();
  const firstPass = new Uint16Array(tw * th);
  for (let i = 0; i < tw * th; i++) {
    if (s.a[i] < alphaThreshold) continue;
    const c = nearest(s.r[i], s.g[i], s.b[i], pool);
    firstPass[i] = c.id;
    usage.set(c.id, ((_b = usage.get(c.id)) != null ? _b : 0) + 1);
  }
  const maxColors = (_c = options.maxColors) != null ? _c : 0;
  if (maxColors > 0 && usage.size > maxColors) {
    const keep = [...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxColors).map(([id]) => id);
    const keepSet = new Set(keep);
    pool = pool.filter((c) => keepSet.has(c.id));
  }
  const out = new Uint16Array(tw * th);
  const counts = /* @__PURE__ */ new Map();
  if (!options.dither) {
    for (let i = 0; i < tw * th; i++) {
      if (s.a[i] < alphaThreshold) {
        out[i] = EMPTY;
        continue;
      }
      const c = nearest(s.r[i], s.g[i], s.b[i], pool);
      out[i] = c.id;
      counts.set(c.id, ((_d = counts.get(c.id)) != null ? _d : 0) + 1);
    }
  } else {
    const errR = new Float32Array(tw * th);
    const errG = new Float32Array(tw * th);
    const errB = new Float32Array(tw * th);
    const distribute = (x, y, er, eg, eb) => {
      if (x < 0 || x >= tw || y < 0 || y >= th) return;
      const i = y * tw + x;
      if (s.a[i] < alphaThreshold) return;
      errR[i] += er;
      errG[i] += eg;
      errB[i] += eb;
    };
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const i = y * tw + x;
        if (s.a[i] < alphaThreshold) {
          out[i] = EMPTY;
          continue;
        }
        const r = Math.max(0, Math.min(255, s.r[i] + errR[i]));
        const g = Math.max(0, Math.min(255, s.g[i] + errG[i]));
        const b = Math.max(0, Math.min(255, s.b[i] + errB[i]));
        const c = nearest(r, g, b, pool);
        out[i] = c.id;
        counts.set(c.id, ((_e = counts.get(c.id)) != null ? _e : 0) + 1);
        const dr = r - c.rgb[0];
        const dg = g - c.rgb[1];
        const db = b - c.rgb[2];
        distribute(x + 1, y, dr * 7 / 16, dg * 7 / 16, db * 7 / 16);
        distribute(x - 1, y + 1, dr * 3 / 16, dg * 3 / 16, db * 3 / 16);
        distribute(x, y + 1, dr * 5 / 16, dg * 5 / 16, db * 5 / 16);
        distribute(x + 1, y + 1, dr * 1 / 16, dg * 1 / 16, db * 1 / 16);
      }
    }
  }
  const used = [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
  return { data: out, used };
}

// src/core/iron.ts
var IRON_FINISHES = [
  {
    id: "raw",
    name: "未烫成品",
    desc: "圆珠带孔，看得出每一颗豆子的样子",
    ironed: false,
    sparkle: 0,
    rainbow: false,
    flatten: 1,
    roughness: 0.42
  },
  {
    id: "cloth",
    name: "布烫",
    desc: "隔着棉布轻压，表面哑光，豆孔变浅",
    ironed: true,
    sparkle: 0,
    rainbow: false,
    flatten: 0.72,
    roughness: 0.78
  },
  {
    id: "baking",
    name: "烤纸烫",
    desc: "烘焙纸压得最平，豆孔几乎合上",
    ironed: true,
    sparkle: 0,
    rainbow: false,
    flatten: 0.55,
    roughness: 0.62
  },
  {
    id: "coarse",
    name: "粗闪",
    desc: "大颗粒闪粉，灯下星星点点",
    ironed: true,
    sparkle: 0.08,
    rainbow: false,
    flatten: 0.62,
    roughness: 0.5
  },
  {
    id: "fine",
    name: "细闪",
    desc: "细密闪粉，整体微微发亮",
    ironed: true,
    sparkle: 0.2,
    rainbow: false,
    flatten: 0.62,
    roughness: 0.45
  },
  {
    id: "rainbowCoarse",
    name: "彩虹粗闪",
    desc: "闪粉带七彩反光，颗粒偏大",
    ironed: true,
    sparkle: 0.1,
    rainbow: true,
    flatten: 0.6,
    roughness: 0.42
  },
  {
    id: "rainbowFine",
    name: "彩虹细闪",
    desc: "七彩细闪铺满，最亮的一种",
    ironed: true,
    sparkle: 0.24,
    rainbow: true,
    flatten: 0.6,
    roughness: 0.4
  }
];
function finishById(id) {
  var _a;
  return (_a = IRON_FINISHES.find((f) => f.id === id)) != null ? _a : IRON_FINISHES[0];
}
function cellHash(x, y) {
  let h = Math.imul(x + 40503, 2246822507) ^ Math.imul(y + 31161, 3266489909);
  h ^= h >>> 15;
  h = Math.imul(h, 625341585);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
function sparkleAt(x, y, finish) {
  const none = { on: false, px: 0.5, py: 0.5, size: 0, hue: 0 };
  if (finish.sparkle <= 0) return none;
  const h1 = cellHash(x, y);
  if (h1 >= finish.sparkle) return none;
  const h2 = cellHash(y + 17, x + 31);
  const h3 = cellHash(x + 101, y + 7);
  return {
    on: true,
    px: 0.22 + h2 * 0.56,
    py: 0.22 + h3 * 0.56,
    size: 0.12 + cellHash(x + 5, y + 5) * 0.16,
    hue: Math.floor(cellHash(x + 3, y + 9) * 6)
  };
}
var RAINBOW_COLORS = ["#FF8FA3", "#FFC978", "#FFF1A8", "#A8E0C0", "#A8C8F0", "#D0B3F0"];

// src/core/share.ts
var PREFIX = "b1";
function writeVarint(out, value) {
  let v = value;
  while (v >= 128) {
    out.push(v & 127 | 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
}
function readVarint(bytes, pos) {
  let result = 0;
  let shift = 1;
  while (pos.i < bytes.length) {
    const b = bytes[pos.i++];
    result += (b & 127) * shift;
    if ((b & 128) === 0) return result;
    shift *= 128;
  }
  throw new Error("分享码不完整");
}
function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(text) {
  const pad = text.length % 4 === 0 ? "" : "=".repeat(4 - text.length % 4);
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function encodeShare(payload) {
  const { width, height, cells } = payload;
  const out = [];
  let run = 0;
  let current = -1;
  for (let i = 0; i < cells.length; i++) {
    const id = cells[i];
    if (id === current) {
      run++;
      continue;
    }
    if (current >= 0) {
      writeVarint(out, run);
      writeVarint(out, current);
    }
    current = id;
    run = 1;
  }
  if (current >= 0) {
    writeVarint(out, run);
    writeVarint(out, current);
  }
  const body = toBase64Url(new Uint8Array(out));
  return `${PREFIX}.${width}.${height}.${body}`;
}
function decodeShare(code) {
  const text = code.trim();
  const parts = text.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("不是有效的分享码");
  }
  const width = Number(parts[1]);
  const height = Number(parts[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error("分享码尺寸不对");
  if (width <= 0 || height <= 0 || width > 600 || height > 600) {
    throw new Error("分享码尺寸超出范围");
  }
  const bytes = fromBase64Url(parts[3]);
  const cells = new Uint16Array(width * height);
  const pos = { i: 0 };
  let filled = 0;
  while (pos.i < bytes.length) {
    const run = readVarint(bytes, pos);
    const id = readVarint(bytes, pos);
    for (let k = 0; k < run && filled < cells.length; k++) cells[filled++] = id;
  }
  if (filled !== cells.length) throw new Error("分享码格子数量对不上");
  return { name: "", width, height, cells };
}
function shareCodeFromUrl(hash) {
  const m = /[#&]p=([^&]+)/.exec(hash);
  return m ? decodeURIComponent(m[1]) : "";
}

// src/core/stock.ts
function stockReport(grid, stock = {}, fallbackHave = 0) {
  const rows = colorUsage(grid).map((u) => {
    var _a;
    const have = (_a = stock[u.id]) != null ? _a : fallbackHave;
    return {
      id: u.id,
      code: u.color.code,
      name: u.color.name,
      hex: u.color.hex,
      need: u.count,
      have,
      short: Math.max(0, u.count - have)
    };
  });
  return {
    rows,
    totalNeed: rows.reduce((s, r) => s + r.need, 0),
    totalShort: rows.reduce((s, r) => s + r.short, 0),
    shortColors: rows.filter((r) => r.short > 0).length
  };
}
function purchaseText(report, docName = "拼豆图纸") {
  const short = report.rows.filter((r) => r.short > 0);
  const head = `${docName} · 采购清单`;
  if (short.length === 0) return `${head}

手上的豆子够拼这张图，不用买。
`;
  const lines = short.map((r) => `${r.code} ${r.name}  缺 ${r.short} 颗（共需 ${r.need}，手上 ${r.have}）`);
  return [
    head,
    "",
    ...lines,
    "",
    `合计：${short.length} 种颜色，${report.totalShort} 颗`
  ].join("\n");
}
