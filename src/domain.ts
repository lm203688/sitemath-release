// SiteMath · 领域内核 v0.2（零依赖纯函数）
//
// 设计原则：
// 1) 所有公式统一走英制基准（英寸 / 平方英尺 / 立方英尺 / 短吨），
//    公制只在"输入边界"和"输出边界"做换算 —— 只有一套公式要维护和测试。
// 2) 每个结果同时给出英制与公制，UI 按用户选的单位系统展示。
// 3) 所有材料假设值集中在 ASSUMPTIONS，UI 必须明示；不得散落在公式里。
// 4) 不做结构计算（配筋率/承载力），只算"备料用量"。

export const DATA_VERSION = "2026-11-16";
export const DATA_DATE = "2026-11-16";

export const REFERENCE_DISCLAIMER =
  "Estimates only. Results use the assumptions listed in the app (bag yields, densities, coverage, block counts). " +
  "Verify against your supplier's data and the project drawings before ordering.";

export type UnitSystem = "imperial" | "metric";
export type BagSpec = "80 lb" | "60 lb" | "40 lb" | "25 kg";
export type RebarSize = "#3" | "#4" | "#5" | "#6";
export type BlockSpec = "8x8x16" | "8x8x8" | "6x8x16";
export type SheetSpec = "4x8" | "4x9" | "4x12";

// ——— 换算系数（单一来源） ———
export const CONV = {
  cmPerInch: 2.54,
  inPerCm: 1 / 2.54,
  sqFtPerSqM: 10.7639104167,
  cuYdPerCuM: 1.3079506193,
  cuFtPerCuYd: 27,
  kgPerLb: 0.45359237,
  shortTonPerTonne: 1.1023113109,
} as const;

// ——— 明示假设 ———
export const ASSUMPTIONS = {
  concreteDensityLbPerCuFt: 150, // ≈ 4,050 lb/yd³
  bagYieldCuFt: { "80 lb": 0.6, "60 lb": 0.45, "40 lb": 0.3 } as Record<string, number>, // 美制预拌袋
  bagYieldCuM: { "25 kg": 0.012 } as Record<string, number>, // 公制预拌袋（≈12 L 出浆）
  gravelTonPerCuYd: 1.4,
  soilTonPerCuYd: 1.1,
  mulchTonPerCuYd: 0.55,
  asphaltTonPerCuYd: 1.95,
  rebarLbPerFt: { "#3": 0.376, "#4": 0.668, "#5": 1.043, "#6": 1.502 } as Record<string, number>,
  rebarStockFt: 20,
  drywallSheetSqFt: { "4x8": 32, "4x9": 36, "4x12": 48 } as Record<string, number>,
  paintCoverageSqFtPerGal: 350,
  blocksPerMortarBag: 21, // 80 lb 砂浆袋 ≈ 21 块 8" 砌块
  blockFillCuFtPerBlock: { "8x8x16": 0.45, "8x8x8": 0.34, "6x8x16": 0.34 } as Record<string, number>,
  blockFaceSqFt: { "8x8x16": (8 * 16) / 144, "8x8x8": (8 * 8) / 144, "6x8x16": (6 * 16) / 144 } as Record<string, number>,
  bulkBagCuFt: 2, // 常见 2 cu ft 袋装砂石/覆盖物
} as const;

// ——— 英尺-英寸-分数 ———
export function parseFeetInches(input: string): number | null {
  if (!input) return null;
  const s = input
    .trim()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
  if (!s) return null;

  let feet = 0;
  let rest = s;

  const feetMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)/i);
  if (feetMatch) {
    feet = Number(feetMatch[1]);
    rest = s.slice(feetMatch[0].length);
  } else {
    const dash = s.match(/^(\d+)\s*-\s*(.+)$/);
    if (dash) {
      feet = Number(dash[1]);
      rest = dash[2];
    }
  }

  rest = rest.replace(/"/g, " ").replace(/\bin\b/gi, " ").trim();
  if (!rest) return feet * 12;

  const frac = rest.match(/^(\d+(?:\.\d+)?)?\s*(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const whole = frac[1] ? Number(frac[1]) : 0;
    const num = Number(frac[2]);
    const den = Number(frac[3]);
    if (den === 0) return null;
    return feet * 12 + whole + num / den;
  }

  const plain = rest.match(/^(\d+(?:\.\d+)?)$/);
  if (!plain) return null;
  return feet * 12 + Number(plain[1]);
}

export function formatFeetInches(totalInches: number, fractionDen = 16): string {
  if (!Number.isFinite(totalInches)) return "—";
  const sign = totalInches < 0 ? "-" : "";
  const abs = Math.abs(totalInches);
  let feet = Math.floor(abs / 12);
  let inches = Math.round((abs - feet * 12) * fractionDen) / fractionDen;
  if (inches >= 12) {
    feet += 1;
    inches -= 12;
  }
  const whole = Math.floor(inches + 1e-9);
  let num = Math.round((inches - whole) * fractionDen);
  let den = fractionDen;
  while (num > 0 && num % 2 === 0 && den % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  const inchStr = num > 0 ? `${whole} ${num}/${den}"` : `${whole}"`;
  return `${sign}${feet}' ${inchStr}`;
}

export function addLengths(aInches: number, bInches: number): number {
  return aInches + bInches;
}
export function subtractLengths(aInches: number, bInches: number): number {
  return aInches - bInches;
}
export function scaleLength(aInches: number, factor: number): number {
  return aInches * factor;
}
export function divideLength(aInches: number, divisor: number): number | null {
  if (divisor === 0) return null;
  return aInches / divisor;
}

// ——— 单位边界换算 ———
export function cmToInches(cm: number): number {
  return cm * CONV.inPerCm;
}
export function inchesToCm(inches: number): number {
  return inches * CONV.cmPerInch;
}
export function metersToInches(m: number): number {
  return m * 100 * CONV.inPerCm;
}
export function sqMToSqFt(sqM: number): number {
  return sqM * CONV.sqFtPerSqM;
}
export function sqFtToSqM(sqFt: number): number {
  return sqFt / CONV.sqFtPerSqM;
}
export function m3ToCuYd(m3: number): number {
  return m3 * CONV.cuYdPerCuM;
}
export function cuYdToM3(cuYd: number): number {
  return cuYd / CONV.cuYdPerCuM;
}
export function tonnesToShortTons(t: number): number {
  return t * CONV.shortTonPerTonne;
}
export function shortTonsToTonnes(t: number): number {
  return t / CONV.shortTonPerTonne;
}

// 体积基础
export function cuFtOf(areaSqFt: number, thicknessIn: number): number {
  return areaSqFt * (thicknessIn / 12);
}
export function cuYdOf(areaSqFt: number, thicknessIn: number): number {
  return cuFtOf(areaSqFt, thicknessIn) / CONV.cuFtPerCuYd;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface BagCount {
  spec: BagSpec;
  count: number;
}

export interface ConcreteResult {
  cuFt: number;
  cuYd: number;
  cuM: number;
  weightLb: number;
  weightKg: number;
  bags: BagCount[];
}

const IMPERIAL_BAGS: BagSpec[] = ["80 lb", "60 lb", "40 lb"];
const METRIC_BAGS: BagSpec[] = ["25 kg"];

function concreteFromCuFt(rawCuFt: number, wastePct: number, bagSpecs?: BagSpec[]): ConcreteResult {
  const cuFt = Math.max(0, rawCuFt) * (1 + wastePct / 100);
  const cuYd = cuFt / CONV.cuFtPerCuYd;
  const cuM = cuYdToM3(cuYd);
  const weightLb = cuFt * ASSUMPTIONS.concreteDensityLbPerCuFt;
  const specs = bagSpecs && bagSpecs.length > 0 ? bagSpecs : [...IMPERIAL_BAGS, ...METRIC_BAGS];
  const bags: BagCount[] = specs.map((spec) => {
    const imperialYield = ASSUMPTIONS.bagYieldCuFt[spec];
    const metricYield = ASSUMPTIONS.bagYieldCuM[spec];
    if (imperialYield != null) {
      return { spec, count: Math.ceil(cuFt / imperialYield) };
    }
    const yieldCuM = metricYield ?? 0;
    return { spec, count: yieldCuM > 0 ? Math.ceil(cuM / yieldCuM) : 0 };
  });
  return {
    cuFt: round2(cuFt),
    cuYd: round2(cuYd),
    cuM: round3(cuM),
    weightLb: Math.round(weightLb),
    weightKg: Math.round(weightLb * CONV.kgPerLb),
    bags,
  };
}

// ——— 9 种混凝土形态 ———
export function rectangularSlab(lengthIn: number, widthIn: number, thicknessIn: number, wastePct = 5): ConcreteResult {
  const areaSqFt = (lengthIn / 12) * (widthIn / 12);
  return concreteFromCuFt(cuFtOf(areaSqFt, thicknessIn), wastePct);
}

export function roundSlab(diameterIn: number, thicknessIn: number, wastePct = 5): ConcreteResult {
  const radiusFt = diameterIn / 24;
  const areaSqFt = Math.PI * radiusFt * radiusFt;
  return concreteFromCuFt(cuFtOf(areaSqFt, thicknessIn), wastePct);
}

export function footing(lengthIn: number, widthIn: number, depthIn: number, wastePct = 5): ConcreteResult {
  const areaSqFt = (lengthIn / 12) * (widthIn / 12);
  return concreteFromCuFt(cuFtOf(areaSqFt, depthIn), wastePct);
}

export function roundColumn(diameterIn: number, heightIn: number, wastePct = 5): ConcreteResult {
  const radiusFt = diameterIn / 24;
  const areaSqFt = Math.PI * radiusFt * radiusFt;
  return concreteFromCuFt(cuFtOf(areaSqFt, heightIn), wastePct);
}

export function squareColumn(lengthIn: number, widthIn: number, heightIn: number, wastePct = 5): ConcreteResult {
  const areaSqFt = (lengthIn / 12) * (widthIn / 12);
  return concreteFromCuFt(cuFtOf(areaSqFt, heightIn), wastePct);
}

export function pouredWall(lengthIn: number, heightIn: number, thicknessIn: number, wastePct = 5): ConcreteResult {
  const areaSqFt = (lengthIn / 12) * (heightIn / 12);
  return concreteFromCuFt(cuFtOf(areaSqFt, thicknessIn), wastePct);
}

// 台阶：把每级看作一个高度递增的盒体，合计 = 宽 × 踏面 × 踏步高 × n(n+1)/2
export function stepsSteps(riseIn: number, runIn: number, widthIn: number, stepCount: number, wastePct = 5): ConcreteResult {
  const n = Math.max(0, Math.floor(stepCount));
  const cuIn = widthIn * runIn * riseIn * ((n * (n + 1)) / 2);
  const cuFt = cuIn / 1728;
  return concreteFromCuFt(cuFt, wastePct);
}

export function postHoles(diameterIn: number, depthIn: number, count: number, wastePct = 5): ConcreteResult {
  const radiusFt = diameterIn / 24;
  const areaSqFt = Math.PI * radiusFt * radiusFt;
  const per = cuFtOf(areaSqFt, depthIn);
  return concreteFromCuFt(per * Math.max(0, count), wastePct);
}

// ——— 砌体 ———
export interface BlockResult {
  blocks: number;
  mortarBags: number;
  fillCuFt: number;
  fillCuM: number;
  fillBags60Lb: number;
}

export function blockWall(areaSqFt: number, spec: BlockSpec = "8x8x16", wastePct = 5): BlockResult {
  const face = ASSUMPTIONS.blockFaceSqFt[spec];
  const blocks = face > 0 ? Math.ceil((Math.max(0, areaSqFt) * (1 + wastePct / 100)) / face) : 0;
  const fillCuFt = blocks * ASSUMPTIONS.blockFillCuFtPerBlock[spec];
  return {
    blocks,
    mortarBags: Math.ceil(blocks / ASSUMPTIONS.blocksPerMortarBag),
    fillCuFt: round2(fillCuFt),
    fillCuM: round3(cuYdToM3(fillCuFt / CONV.cuFtPerCuYd)),
    fillBags60Lb: Math.ceil(fillCuFt / ASSUMPTIONS.bagYieldCuFt["60 lb"]),
  };
}

export function blockFill(blocks: number, spec: BlockSpec = "8x8x16"): { cuFt: number; cuM: number; bags60Lb: number } {
  const cuFt = Math.max(0, blocks) * ASSUMPTIONS.blockFillCuFtPerBlock[spec];
  return {
    cuFt: round2(cuFt),
    cuM: round3(cuYdToM3(cuFt / CONV.cuFtPerCuYd)),
    bags60Lb: Math.ceil(cuFt / ASSUMPTIONS.bagYieldCuFt["60 lb"]),
  };
}

export function mortarBags(blocks: number): { bags: number } {
  return { bags: Math.ceil(Math.max(0, blocks) / ASSUMPTIONS.blocksPerMortarBag) };
}

// ——— 钢筋 / 网 ———
export interface RebarResult {
  linearFeet: number;
  linearMeters: number;
  stockBars: number;
  weightLb: number;
  weightKg: number;
  barSize: RebarSize;
}

export function rebarGrid(lengthIn: number, widthIn: number, spacingIn: number, barSize: RebarSize = "#4", wastePct = 5): RebarResult {
  const lengthFt = lengthIn / 12;
  const widthFt = widthIn / 12;
  const spacingFt = spacingIn / 12;
  if (spacingFt <= 0) {
    return { linearFeet: 0, linearMeters: 0, stockBars: 0, weightLb: 0, weightKg: 0, barSize };
  }
  const alongLength = Math.ceil(widthFt / spacingFt) + 1;
  const alongWidth = Math.ceil(lengthFt / spacingFt) + 1;
  const totalFt = (alongLength * lengthFt + alongWidth * widthFt) * (1 + wastePct / 100);
  return rebarFromFeet(totalFt, barSize);
}

export function rebarLinear(barCount: number, barLengthIn: number, barSize: RebarSize = "#4", wastePct = 5): RebarResult {
  const totalFt = Math.max(0, barCount) * (barLengthIn / 12) * (1 + wastePct / 100);
  return rebarFromFeet(totalFt, barSize);
}

function rebarFromFeet(totalFt: number, barSize: RebarSize): RebarResult {
  const lbPerFt = ASSUMPTIONS.rebarLbPerFt[barSize];
  return {
    linearFeet: Math.round(totalFt),
    linearMeters: round2(totalFt * 0.3048),
    stockBars: Math.ceil(totalFt / ASSUMPTIONS.rebarStockFt),
    weightLb: Math.round(totalFt * lbPerFt),
    weightKg: Math.round(totalFt * lbPerFt * CONV.kgPerLb),
    barSize,
  };
}

export function meshRolls(areaSqFt: number, rollWidthFt: number, rollLengthFt: number, wastePct = 10): { rolls: number; rollSqFt: number } {
  const rollSqFt = rollWidthFt * rollLengthFt;
  if (rollSqFt <= 0) return { rolls: 0, rollSqFt: 0 };
  return {
    rolls: Math.ceil((Math.max(0, areaSqFt) * (1 + wastePct / 100)) / rollSqFt),
    rollSqFt: round2(rollSqFt),
  };
}

// ——— 骨料 / 沥青 ———
export type AggregateKind = "gravel" | "soil" | "mulch";

export interface AggregateResult {
  cuYd: number;
  cuM: number;
  shortTons: number;
  tonnes: number;
  bagsBulk: number;
}

export function aggregate(kind: AggregateKind, areaSqFt: number, depthIn: number, wastePct = 5): AggregateResult {
  const cuYd = cuYdOf(areaSqFt, depthIn) * (1 + wastePct / 100);
  const density =
    kind === "gravel"
      ? ASSUMPTIONS.gravelTonPerCuYd
      : kind === "soil"
        ? ASSUMPTIONS.soilTonPerCuYd
        : ASSUMPTIONS.mulchTonPerCuYd;
  const shortTons = cuYd * density;
  return {
    cuYd: round2(cuYd),
    cuM: round3(cuYdToM3(cuYd)),
    shortTons: round2(shortTons),
    tonnes: round2(shortTonsToTonnes(shortTons)),
    bagsBulk: Math.ceil((cuYd * CONV.cuFtPerCuYd) / ASSUMPTIONS.bulkBagCuFt),
  };
}

export function asphalt(areaSqFt: number, thicknessIn: number, wastePct = 5): { cuYd: number; cuM: number; shortTons: number; tonnes: number } {
  const cuYd = cuYdOf(areaSqFt, thicknessIn) * (1 + wastePct / 100);
  const shortTons = cuYd * ASSUMPTIONS.asphaltTonPerCuYd;
  return {
    cuYd: round2(cuYd),
    cuM: round3(cuYdToM3(cuYd)),
    shortTons: round2(shortTons),
    tonnes: round2(shortTonsToTonnes(shortTons)),
  };
}

// ——— 饰面 ———
export interface TileResult {
  tiles: number;
  boxes: number;
  perBox: number;
  costPerBox?: number;
  totalCost?: number;
}

export function tileWithGrout(
  areaSqFt: number,
  tileWidthIn: number,
  tileHeightIn: number,
  groutIn = 0,
  wastePct = 10,
  perBox = 10,
  costPerBox?: number
): TileResult {
  const effSqFt = ((tileWidthIn + groutIn) * (tileHeightIn + groutIn)) / 144;
  if (effSqFt <= 0) return { tiles: 0, boxes: 0, perBox };
  const tiles = Math.ceil((Math.max(0, areaSqFt) * (1 + wastePct / 100)) / effSqFt);
  const boxes = Math.ceil(tiles / Math.max(1, perBox));
  return {
    tiles,
    boxes,
    perBox,
    costPerBox,
    totalCost: costPerBox != null ? round2(boxes * costPerBox) : undefined,
  };
}

export function drywallSheets(areaSqFt: number, sheet: SheetSpec = "4x8", wastePct = 10): { sheets: number; sheet: SheetSpec } {
  const sheetSqFt = ASSUMPTIONS.drywallSheetSqFt[sheet];
  return { sheets: Math.ceil((Math.max(0, areaSqFt) * (1 + wastePct / 100)) / sheetSqFt), sheet };
}

export function paintGallons(
  areaSqFt: number,
  coats = 2,
  coverageSqFtPerGal: number = ASSUMPTIONS.paintCoverageSqFtPerGal,
  wastePct = 5,
  openingsSqFt = 0,
  primerCoats = 0
): { gallons: number; litres: number; quarts: number } {
  const paintable = Math.max(0, areaSqFt - openingsSqFt);
  const coatArea = paintable * (coats + primerCoats);
  if (coverageSqFtPerGal <= 0) return { gallons: 0, litres: 0, quarts: 0 };
  const gallons = (coatArea * (1 + wastePct / 100)) / coverageSqFtPerGal;
  return {
    gallons: round2(gallons),
    litres: round2(gallons * 3.785411784),
    quarts: Math.ceil(gallons * 4),
  };
}

// ——— 整活汇总（Job Takeoff） ———
export interface JobLine {
  id: string;
  tool: string;
  label: string;
  qty: number;
  unit: string;
  unitPrice?: number;
  total?: number;
}

export function newJobLine(tool: string, label: string, qty: number, unit: string, unitPrice?: number): JobLine {
  const total = unitPrice != null ? round2(qty * unitPrice) : undefined;
  return {
    id: `${tool}-${label}-${Math.round(qty * 1000)}`,
    tool,
    label,
    qty: round2(qty),
    unit,
    unitPrice,
    total,
  };
}

export function addLine(job: JobLine[], line: JobLine): JobLine[] {
  return [...job, line];
}

export function jobTotal(job: JobLine[]): number {
  return round2(job.reduce((sum, l) => sum + (l.total ?? 0), 0));
}

export function jobToText(job: JobLine[], currencySymbol = "$"): string {
  const lines = job.map((l) => {
    const price = l.unitPrice != null ? ` @ ${currencySymbol}${l.unitPrice}` : "";
    return `• ${l.label}: ${l.qty} ${l.unit}${price}`;
  });
  const total = jobTotal(job);
  const money = job.some((l) => l.unitPrice != null) ? `\nTotal: ${currencySymbol}${total}` : "";
  return `SiteMath material list\n${lines.join("\n")}${money}\n\n${REFERENCE_DISCLAIMER}`;
}

// ——— 自检 ———
export function validateAssumptions(): string[] {
  const errors: string[] = [];
  for (const [spec, yieldCuFt] of Object.entries(ASSUMPTIONS.bagYieldCuFt)) {
    if (!(yieldCuFt > 0)) errors.push(`bag yield ${spec} must be > 0`);
  }
  for (const [spec, yieldCuM] of Object.entries(ASSUMPTIONS.bagYieldCuM)) {
    if (!(yieldCuM > 0)) errors.push(`bag yield ${spec} must be > 0`);
  }
  if (!(ASSUMPTIONS.concreteDensityLbPerCuFt > 0)) errors.push("concrete density must be > 0");
  for (const key of ["gravelTonPerCuYd", "soilTonPerCuYd", "mulchTonPerCuYd", "asphaltTonPerCuYd"] as const) {
    if (!(ASSUMPTIONS[key] > 0)) errors.push(`${key} must be > 0`);
  }
  for (const [size, lb] of Object.entries(ASSUMPTIONS.rebarLbPerFt)) {
    if (!(lb > 0)) errors.push(`rebar ${size} weight must be > 0`);
  }
  for (const [spec, face] of Object.entries(ASSUMPTIONS.blockFaceSqFt)) {
    if (!(face > 0)) errors.push(`block face ${spec} must be > 0`);
  }
  if (!(ASSUMPTIONS.paintCoverageSqFtPerGal > 0)) errors.push("paint coverage must be > 0");
  if (!(ASSUMPTIONS.blocksPerMortarBag > 0)) errors.push("blocks per mortar bag must be > 0");
  if (DATA_VERSION.trim().length === 0) errors.push("DATA_VERSION must not be empty");
  return errors;
}
