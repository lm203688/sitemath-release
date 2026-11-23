// SiteMath 工具规格与计算编排（把 domain.ts 的纯函数映射成 UI 可渲染的结果）
import * as D from "./domain.ts";

D.validateAssumptions();

export type Units = "imperial" | "metric";
export type Group = "Concrete" | "Masonry" | "Steel" | "Aggregate" | "Finishes" | "Tools";

export type FieldKind = "length" | "area" | "count" | "number" | "percent";

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  def: number; // 基准单位：长度=英寸，面积=平方英尺，其余=原值
  optional?: boolean;
}

export interface Choice {
  key: string;
  label: string;
  def: string;
  options: { value: string; label: string }[];
}

export interface Row {
  label: string;
  value: string;
}

export interface JobItem {
  label: string;
  qty: number;
  unit: string;
}

export interface CalcOut {
  primary: string;
  primaryUnit: string;
  rows: Row[];
  note: string;
  job: JobItem[];
}

export interface Tool {
  id: string;
  name: string;
  group: Group;
  blurb: string;
  fields: Field[];
  choices?: Choice[];
  calc: (n: Record<string, number>, s: Record<string, string>, u: Units) => CalcOut;
}

// ——— 输入边界：文本 ↔ 基准单位 ———
// 基准单位：长度=英寸，面积=平方英尺；英制接受 10' 6 1/2"、10-6 1/2、126.5、3.25'，
// 公制接受 3.05（默认米）、305cm、3050mm。
export function parseFieldValue(f: Field, text: string, u: Units): number {
  const t = (text ?? "").trim();
  if (!t) return 0;
  if (f.kind === "length") {
    if (u === "imperial") {
      const v = D.parseFeetInches(t);
      return v == null ? 0 : v;
    }
    const m = t.match(/^([\d.,]+)\s*(cm|mm|m)?$/i);
    if (!m) return 0;
    const num = Number(m[1].replace(",", "."));
    if (!Number.isFinite(num)) return 0;
    const suffix = (m[2] ?? "m").toLowerCase();
    const meters = suffix === "cm" ? num / 100 : suffix === "mm" ? num / 1000 : num;
    return D.metersToInches(meters);
  }
  const num = Number(t.replace(",", "."));
  if (!Number.isFinite(num)) return 0;
  if (f.kind === "area" && u === "metric") return D.sqMToSqFt(num);
  return num;
}

export function encodeValue(f: Field, canonical: number, u: Units): string {
  if (!Number.isFinite(canonical)) return "";
  if (f.kind === "length") {
    return u === "imperial"
      ? D.formatFeetInches(canonical)
      : (canonical * D.CONV.cmPerInch / 100).toFixed(2);
  }
  if (f.kind === "area") {
    return u === "imperial" ? String(Math.round(canonical)) : D.sqFtToSqM(canonical).toFixed(2);
  }
  if (f.kind === "count") return String(Math.round(canonical));
  return String(canonical);
}

// ——— 显示格式化 ———
export const commas = (n: number): string => {
  if (!Number.isFinite(n)) return "—";
  const s = Math.abs(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0 ? `-${s}` : s;
};

const len = (inches: number, u: Units): string =>
  u === "imperial" ? D.formatFeetInches(inches) : `${(inches * D.CONV.cmPerInch / 100).toFixed(2)} m`;

const area = (sqft: number, u: Units): string =>
  u === "imperial" ? `${commas(sqft)} sq ft` : `${D.sqFtToSqM(sqft).toFixed(2)} m²`;

const bagSpecs = (u: Units): string[] => (u === "imperial" ? ["80 lb", "60 lb", "40 lb"] : ["25 kg"]);

function concreteOut(r: D.ConcreteResult, u: Units, wastePct: number): CalcOut {
  const specs = bagSpecs(u);
  const rows: Row[] = specs.map((spec) => {
    const bag = r.bags.find((b) => b.spec === spec);
    return { label: `${spec} bags`, value: bag ? commas(bag.count) : "0" };
  });
  rows.push({
    label: "Weight",
    value: u === "imperial" ? `${commas(r.weightLb)} lb` : `${commas(r.weightKg)} kg`,
  });
  rows.push({
    label: "Volume",
    value: u === "imperial" ? `${r.cuFt.toFixed(2)} cu ft` : `${r.cuM.toFixed(3)} m³`,
  });
  const spec = specs[0];
  const bag = r.bags.find((b) => b.spec === spec);
  const yieldText =
    spec === "25 kg"
      ? "≈0.012 m³ (12 L)"
      : `≈${D.ASSUMPTIONS.bagYieldCuFt[spec]} cu ft`;
  return {
    primary: u === "imperial" ? r.cuYd.toFixed(2) : r.cuM.toFixed(3),
    primaryUnit: u === "imperial" ? "cu yd" : "m³",
    rows,
    note: `${spec} bag ${yieldText} · mix ${D.ASSUMPTIONS.concreteDensityLbPerCuFt} lb/cu ft · waste ${wastePct}%`,
    job: [{ label: `${spec} bags`, qty: bag ? bag.count : 0, unit: "bag" }],
  };
}

const wasteField: Field = { key: "waste", label: "Waste", kind: "percent", def: 5 };

export const TOOLS: Tool[] = [
  // ————— CONCRETE —————
  {
    id: "slab-rect",
    name: "Rectangular slab",
    group: "Concrete",
    blurb: "Patio, driveway, pad",
    fields: [
      { key: "l", label: "Length", kind: "length", def: 120 },
      { key: "w", label: "Width", kind: "length", def: 120 },
      { key: "t", label: "Thickness", kind: "length", def: 4 },
      wasteField,
    ],
    calc: (n, _s, u) => concreteOut(D.rectangularSlab(n.l, n.w, n.t, n.waste), u, n.waste),
  },
  {
    id: "slab-round",
    name: "Round slab",
    group: "Concrete",
    blurb: "Fire pit, round pad",
    fields: [
      { key: "dia", label: "Diameter", kind: "length", def: 96 },
      { key: "t", label: "Thickness", kind: "length", def: 4 },
      wasteField,
    ],
    calc: (n, _s, u) => concreteOut(D.roundSlab(n.dia, n.t, n.waste), u, n.waste),
  },
  {
    id: "footing",
    name: "Footing",
    group: "Concrete",
    blurb: "Continuous or pad footing",
    fields: [
      { key: "l", label: "Length", kind: "length", def: 240 },
      { key: "w", label: "Width", kind: "length", def: 18 },
      { key: "d", label: "Depth", kind: "length", def: 12 },
      wasteField,
    ],
    calc: (n, _s, u) => concreteOut(D.footing(n.l, n.w, n.d, n.waste), u, n.waste),
  },
  {
    id: "column-round",
    name: "Round column",
    group: "Concrete",
    blurb: "Poured round pier",
    fields: [
      { key: "dia", label: "Diameter", kind: "length", def: 12 },
      { key: "h", label: "Height", kind: "length", def: 96 },
      wasteField,
    ],
    calc: (n, _s, u) => concreteOut(D.roundColumn(n.dia, n.h, n.waste), u, n.waste),
  },
  {
    id: "column-square",
    name: "Square column",
    group: "Concrete",
    blurb: "Poured square pier",
    fields: [
      { key: "l", label: "Length", kind: "length", def: 12 },
      { key: "w", label: "Width", kind: "length", def: 12 },
      { key: "h", label: "Height", kind: "length", def: 96 },
      wasteField,
    ],
    calc: (n, _s, u) => concreteOut(D.squareColumn(n.l, n.w, n.h, n.waste), u, n.waste),
  },
  {
    id: "wall-poured",
    name: "Poured wall",
    group: "Concrete",
    blurb: "Foundation / stem wall",
    fields: [
      { key: "l", label: "Length", kind: "length", def: 120 },
      { key: "h", label: "Height", kind: "length", def: 96 },
      { key: "t", label: "Thickness", kind: "length", def: 8 },
      wasteField,
    ],
    calc: (n, _s, u) => concreteOut(D.pouredWall(n.l, n.h, n.t, n.waste), u, n.waste),
  },
  {
    id: "steps",
    name: "Steps",
    group: "Concrete",
    blurb: "Stacked risers and treads",
    fields: [
      { key: "rise", label: "Rise", kind: "length", def: 7 },
      { key: "run", label: "Run", kind: "length", def: 11 },
      { key: "width", label: "Width", kind: "length", def: 36 },
      { key: "count", label: "Steps", kind: "count", def: 4 },
      wasteField,
    ],
    calc: (n, _s, u) => concreteOut(D.stepsSteps(n.rise, n.run, n.width, n.count, n.waste), u, n.waste),
  },
  {
    id: "post-holes",
    name: "Post holes",
    group: "Concrete",
    blurb: "Deck and fence posts",
    fields: [
      { key: "dia", label: "Hole diameter", kind: "length", def: 12 },
      { key: "depth", label: "Depth", kind: "length", def: 36 },
      { key: "count", label: "Holes", kind: "count", def: 4 },
      wasteField,
    ],
    calc: (n, _s, u) => concreteOut(D.postHoles(n.dia, n.depth, n.count, n.waste), u, n.waste),
  },

  // ————— MASONRY —————
  {
    id: "block-wall",
    name: "Block wall",
    group: "Masonry",
    blurb: "CMU count, mortar and fill",
    fields: [
      { key: "area", label: "Wall area", kind: "area", def: 100 },
      wasteField,
    ],
    choices: [
      {
        key: "spec",
        label: "Block",
        def: "8x8x16",
        options: [
          { value: "8x8x16", label: "8×8×16" },
          { value: "8x8x8", label: "8×8×8" },
          { value: "6x8x16", label: "6×8×16" },
        ],
      },
    ],
    calc: (n, s, u) => {
      const spec = s.spec as D.BlockSpec;
      const r = D.blockWall(n.area, spec, n.waste);
      return {
        primary: commas(r.blocks),
        primaryUnit: "blocks",
        rows: [
          { label: "Mortar bags", value: commas(r.mortarBags) },
          { label: "Grout fill", value: u === "imperial" ? `${r.fillCuFt.toFixed(2)} cu ft` : `${r.fillCuM.toFixed(3)} m³` },
          { label: "60 lb fill bags", value: commas(r.fillBags60Lb) },
        ],
        note: `face ${(D.ASSUMPTIONS.blockFaceSqFt[spec] * 144).toFixed(0)} sq in · ${D.ASSUMPTIONS.blocksPerMortarBag} blocks per 80 lb mortar bag · ${D.ASSUMPTIONS.blockFillCuFtPerBlock[spec]} cu ft grout per block`,
        job: [
          { label: `${spec} blocks`, qty: r.blocks, unit: "block" },
          { label: "80 lb mortar bags", qty: r.mortarBags, unit: "bag" },
        ],
      };
    },
  },
  {
    id: "block-fill",
    name: "Block fill",
    group: "Masonry",
    blurb: "Grout for a known block count",
    fields: [{ key: "blocks", label: "Blocks", kind: "count", def: 100 }],
    choices: [
      {
        key: "spec",
        label: "Block",
        def: "8x8x16",
        options: [
          { value: "8x8x16", label: "8×8×16" },
          { value: "8x8x8", label: "8×8×8" },
          { value: "6x8x16", label: "6×8×16" },
        ],
      },
    ],
    calc: (n, s, u) => {
      const spec = s.spec as D.BlockSpec;
      const r = D.blockFill(n.blocks, spec);
      return {
        primary: u === "imperial" ? r.cuFt.toFixed(2) : r.cuM.toFixed(3),
        primaryUnit: u === "imperial" ? "cu ft" : "m³",
        rows: [{ label: "60 lb bags", value: commas(r.bags60Lb) }],
        note: `${D.ASSUMPTIONS.blockFillCuFtPerBlock[spec]} cu ft per ${spec} block · 60 lb bag ≈0.45 cu ft`,
        job: [{ label: "60 lb fill bags", qty: r.bags60Lb, unit: "bag" }],
      };
    },
  },
  {
    id: "mortar",
    name: "Mortar",
    group: "Masonry",
    blurb: "Bags for a block count",
    fields: [{ key: "blocks", label: "Blocks", kind: "count", def: 100 }],
    calc: (n) => {
      const r = D.mortarBags(n.blocks);
      return {
        primary: commas(r.bags),
        primaryUnit: "bags",
        rows: [],
        note: `${D.ASSUMPTIONS.blocksPerMortarBag} blocks per 80 lb mortar bag`,
        job: [{ label: "80 lb mortar bags", qty: r.bags, unit: "bag" }],
      };
    },
  },

  // ————— STEEL —————
  {
    id: "rebar-grid",
    name: "Rebar grid",
    group: "Steel",
    blurb: "Mat or mesh-style layout",
    fields: [
      { key: "l", label: "Length", kind: "length", def: 120 },
      { key: "w", label: "Width", kind: "length", def: 120 },
      { key: "spacing", label: "Spacing", kind: "length", def: 12 },
      wasteField,
    ],
    choices: [
      {
        key: "size",
        label: "Bar",
        def: "#4",
        options: [
          { value: "#3", label: "#3" },
          { value: "#4", label: "#4" },
          { value: "#5", label: "#5" },
          { value: "#6", label: "#6" },
        ],
      },
    ],
    calc: (n, s, u) => {
      const size = s.size as D.RebarSize;
      const r = D.rebarGrid(n.l, n.w, n.spacing, size, n.waste);
      return {
        primary: u === "imperial" ? commas(r.linearFeet) : r.linearMeters.toFixed(1),
        primaryUnit: u === "imperial" ? "ft of bar" : "m of bar",
        rows: [
          { label: `20 ft bars`, value: commas(r.stockBars) },
          { label: "Weight", value: u === "imperial" ? `${commas(r.weightLb)} lb` : `${commas(r.weightKg)} kg` },
        ],
        note: `${size} = ${D.ASSUMPTIONS.rebarLbPerFt[size]} lb/ft · ${D.ASSUMPTIONS.rebarStockFt} ft stock · waste ${n.waste}%`,
        job: [{ label: `${size} 20 ft bars`, qty: r.stockBars, unit: "bar" }],
      };
    },
  },
  {
    id: "rebar-linear",
    name: "Rebar linear",
    group: "Steel",
    blurb: "Bars by count and length",
    fields: [
      { key: "count", label: "Bars", kind: "count", def: 10 },
      { key: "length", label: "Bar length", kind: "length", def: 240 },
      wasteField,
    ],
    choices: [
      {
        key: "size",
        label: "Bar",
        def: "#4",
        options: [
          { value: "#3", label: "#3" },
          { value: "#4", label: "#4" },
          { value: "#5", label: "#5" },
          { value: "#6", label: "#6" },
        ],
      },
    ],
    calc: (n, s, u) => {
      const size = s.size as D.RebarSize;
      const r = D.rebarLinear(n.count, n.length, size, n.waste);
      return {
        primary: u === "imperial" ? commas(r.linearFeet) : r.linearMeters.toFixed(1),
        primaryUnit: u === "imperial" ? "ft of bar" : "m of bar",
        rows: [
          { label: "20 ft bars", value: commas(r.stockBars) },
          { label: "Weight", value: u === "imperial" ? `${commas(r.weightLb)} lb` : `${commas(r.weightKg)} kg` },
        ],
        note: `${size} = ${D.ASSUMPTIONS.rebarLbPerFt[size]} lb/ft · waste ${n.waste}%`,
        job: [{ label: `${size} 20 ft bars`, qty: r.stockBars, unit: "bar" }],
      };
    },
  },
  {
    id: "mesh-roll",
    name: "Mesh roll",
    group: "Steel",
    blurb: "Rolls for a slab area",
    fields: [
      { key: "area", label: "Area", kind: "area", def: 400 },
      { key: "rw", label: "Roll width", kind: "length", def: 60 },
      { key: "rl", label: "Roll length", kind: "length", def: 600 },
      { key: "waste", label: "Waste", kind: "percent", def: 10 },
    ],
    calc: (n, _s, u) => {
      const r = D.meshRolls(n.area, n.rw / 12, n.rl / 12, n.waste);
      return {
        primary: commas(r.rolls),
        primaryUnit: "rolls",
        rows: [
          { label: "Coverage per roll", value: area(r.rollSqFt, u) },
          { label: "Area", value: area(n.area, u) },
        ],
        note: `Roll ${len(n.rw, u)} × ${len(n.rl, u)} · waste ${n.waste}%`,
        job: [{ label: "mesh rolls", qty: r.rolls, unit: "roll" }],
      };
    },
  },

  // ————— AGGREGATE —————
  {
    id: "aggregate",
    name: "Gravel · soil · mulch",
    group: "Aggregate",
    blurb: "Volume, tons and bulk bags",
    fields: [
      { key: "area", label: "Area", kind: "area", def: 100 },
      { key: "depth", label: "Depth", kind: "length", def: 2 },
      wasteField,
    ],
    choices: [
      {
        key: "kind",
        label: "Material",
        def: "gravel",
        options: [
          { value: "gravel", label: "Gravel" },
          { value: "soil", label: "Soil" },
          { value: "mulch", label: "Mulch" },
        ],
      },
    ],
    calc: (n, s, u) => {
      const kind = s.kind as D.AggregateKind;
      const r = D.aggregate(kind, n.area, n.depth, n.waste);
      return {
        primary: u === "imperial" ? r.cuYd.toFixed(2) : r.cuM.toFixed(3),
        primaryUnit: u === "imperial" ? "cu yd" : "m³",
        rows: [
          { label: "Weight", value: u === "imperial" ? `${commas(r.shortTons)} tons` : `${r.tonnes.toFixed(2)} t` },
          { label: "2 cu ft bags", value: commas(r.bagsBulk) },
        ],
        note: `${kind} ≈${D.ASSUMPTIONS[kind === "gravel" ? "gravelTonPerCuYd" : kind === "soil" ? "soilTonPerCuYd" : "mulchTonPerCuYd"]} tons/cu yd · waste ${n.waste}%`,
        job: [
          u === "imperial"
            ? { label: `${kind} tons`, qty: r.shortTons, unit: "ton" }
            : { label: `${kind} tonnes`, qty: r.tonnes, unit: "t" },
        ],
      };
    },
  },
  {
    id: "asphalt",
    name: "Asphalt",
    group: "Aggregate",
    blurb: "Tons for a paved area",
    fields: [
      { key: "area", label: "Area", kind: "area", def: 400 },
      { key: "t", label: "Thickness", kind: "length", def: 2 },
      wasteField,
    ],
    calc: (n, _s, u) => {
      const r = D.asphalt(n.area, n.t, n.waste);
      return {
        primary: u === "imperial" ? r.cuYd.toFixed(2) : r.cuM.toFixed(3),
        primaryUnit: u === "imperial" ? "cu yd" : "m³",
        rows: [
          { label: "Weight", value: u === "imperial" ? `${commas(r.shortTons)} tons` : `${r.tonnes.toFixed(2)} t` },
        ],
        note: `asphalt ≈${D.ASSUMPTIONS.asphaltTonPerCuYd} tons/cu yd · waste ${n.waste}%`,
        job: [
          u === "imperial"
            ? { label: "asphalt tons", qty: r.shortTons, unit: "ton" }
            : { label: "asphalt tonnes", qty: r.tonnes, unit: "t" },
        ],
      };
    },
  },

  // ————— FINISHES —————
  {
    id: "tile",
    name: "Tile",
    group: "Finishes",
    blurb: "Tiles, boxes and cost",
    fields: [
      { key: "area", label: "Area", kind: "area", def: 100 },
      { key: "tw", label: "Tile width", kind: "length", def: 12 },
      { key: "th", label: "Tile height", kind: "length", def: 12 },
      { key: "grout", label: "Grout joint", kind: "length", def: 0 },
      { key: "waste", label: "Waste", kind: "percent", def: 10 },
      { key: "perBox", label: "Tiles per box", kind: "count", def: 10 },
      { key: "price", label: "Price per box", kind: "number", def: 0, optional: true },
    ],
    calc: (n, _s, u) => {
      const r = D.tileWithGrout(n.area, n.tw, n.th, n.grout, n.waste, n.perBox, n.price > 0 ? n.price : undefined);
      const rows: Row[] = [
        { label: "Boxes", value: commas(r.boxes) },
        { label: "Tiles per box", value: commas(r.perBox) },
      ];
      if (r.totalCost != null) rows.push({ label: "Cost", value: `$${r.totalCost.toFixed(2)}` });
      return {
        primary: commas(r.tiles),
        primaryUnit: "tiles",
        rows,
        note: `tile ${len(n.tw, u)} × ${len(n.th, u)} · joint ${n.grout > 0 ? len(n.grout, u) : "none"} · waste ${n.waste}%`,
        job: [{ label: "tile boxes", qty: r.boxes, unit: "box" }],
      };
    },
  },
  {
    id: "drywall",
    name: "Drywall",
    group: "Finishes",
    blurb: "Sheets for a wall area",
    fields: [
      { key: "area", label: "Area", kind: "area", def: 320 },
      { key: "waste", label: "Waste", kind: "percent", def: 10 },
    ],
    choices: [
      {
        key: "sheet",
        label: "Sheet",
        def: "4x8",
        options: [
          { value: "4x8", label: `4×8 (${D.ASSUMPTIONS.drywallSheetSqFt["4x8"]} sq ft)` },
          { value: "4x9", label: `4×9 (${D.ASSUMPTIONS.drywallSheetSqFt["4x9"]} sq ft)` },
          { value: "4x12", label: `4×12 (${D.ASSUMPTIONS.drywallSheetSqFt["4x12"]} sq ft)` },
        ],
      },
    ],
    calc: (n, s, u) => {
      const sheet = s.sheet as D.SheetSpec;
      const r = D.drywallSheets(n.area, sheet, n.waste);
      return {
        primary: commas(r.sheets),
        primaryUnit: "sheets",
        rows: [{ label: "Area", value: area(n.area, u) }],
        note: `${sheet} sheet = ${D.ASSUMPTIONS.drywallSheetSqFt[sheet]} sq ft · waste ${n.waste}%`,
        job: [{ label: `${sheet} drywall sheets`, qty: r.sheets, unit: "sheet" }],
      };
    },
  },
  {
    id: "paint",
    name: "Paint",
    group: "Finishes",
    blurb: "Gallons with openings deducted",
    fields: [
      { key: "area", label: "Wall area", kind: "area", def: 700 },
      { key: "coats", label: "Finish coats", kind: "count", def: 2 },
      { key: "coverage", label: "Coverage sq ft/gal", kind: "number", def: 350 },
      { key: "openings", label: "Doors & windows", kind: "area", def: 0, optional: true },
      { key: "primer", label: "Primer coats", kind: "count", def: 0, optional: true },
      { key: "waste", label: "Waste", kind: "percent", def: 5 },
    ],
    calc: (n, _s, u) => {
      const r = D.paintGallons(n.area, n.coats, n.coverage, n.waste, n.openings, n.primer);
      return {
        primary: u === "imperial" ? r.gallons.toFixed(2) : r.litres.toFixed(1),
        primaryUnit: u === "imperial" ? "gal" : "L",
        rows: [
          { label: "Quarts", value: commas(r.quarts) },
          { label: "Coats charged", value: commas(n.coats + n.primer) },
        ],
        note: `coverage ${n.coverage} sq ft/gal · openings deducted · waste ${n.waste}%`,
        job: [
          u === "imperial"
            ? { label: "paint gallons", qty: r.gallons, unit: "gal" }
            : { label: "paint litres", qty: r.litres, unit: "L" },
        ],
      };
    },
  },

  // ————— TOOLS —————
  {
    id: "length-math",
    name: "Feet · inch · fraction",
    group: "Tools",
    blurb: `Add, subtract, multiply, divide sizes`,
    fields: [
      { key: "a", label: "Size A", kind: "length", def: 40.5 },
      { key: "b", label: "Size B", kind: "length", def: 7.75 },
    ],
    choices: [
      {
        key: "op",
        label: "Operation",
        def: "+",
        options: [
          { value: "+", label: "+" },
          { value: "-", label: "−" },
          { value: "*", label: "×" },
          { value: "/", label: "÷" },
        ],
      },
    ],
    calc: (n, s, u) => {
      const op = s.op;
      let result: number | null;
      if (op === "+") result = D.addLengths(n.a, n.b);
      else if (op === "-") result = D.subtractLengths(n.a, n.b);
      else if (op === "*") result = D.scaleLength(n.a, n.b);
      else result = D.divideLength(n.a, n.b);
      const valid = result != null && Number.isFinite(result);
      return {
        primary: valid ? len(result as number, u) : "—",
        primaryUnit: "",
        rows: [
          { label: "Decimal inches", value: valid ? (result as number).toFixed(3) : "—" },
          { label: "Centimeters", value: valid ? D.inchesToCm(result as number).toFixed(2) : "—" },
        ],
        note: `Type 10' 6 1/2", 10-6 1/2, 126.5 or 3.25' · ÷ by zero returns nothing`,
        job: [],
      };
    },
  },
];

export const GROUPS: Group[] = ["Concrete", "Masonry", "Steel", "Aggregate", "Finishes", "Tools"];

export const toolById = (id: string): Tool | undefined => TOOLS.find((t) => t.id === id);
