/**
 * 按行分组差异区域
 * 将同一行的差异区域聚合在一起，便于整行 OCR 识别
 */

import type { CoreContext } from "../types/context";
import type { DiffRegion, BoundingBox } from "../types/io";

export interface LineGroup {
  /** 行号（从上到下，从 0 开始） */
  lineIndex: number;
  /** 该行包含的区域 */
  regions: DiffRegion[];
  /** 合并后的边界框（包含整行） */
  boundingBox: BoundingBox;
  /** 识别出的文字（OCR 后填充） */
  recognizedText?: string;
}

export interface GroupRegionsByLineInput {
  /** 差异区域列表 */
  regions: DiffRegion[];
  /** Y 范围重叠阈值（默认 0.4，即 40%） */
  overlapThreshold?: number;
}

export interface GroupRegionsByLineOutput {
  /** 按行分组的结果 */
  lines: LineGroup[];
  /** 总行数 */
  lineCount: number;
}

/**
 * 获取区域的 Y 范围
 */
function getYRange(region: DiffRegion): [number, number] {
  return [
    region.boundingBox.y,
    region.boundingBox.y + region.boundingBox.height,
  ];
}

/**
 * 判断两个区域是否在同一行
 */
function isSameLine(
  a: DiffRegion,
  b: DiffRegion,
  overlapThreshold: number
): boolean {
  const [aTop, aBottom] = getYRange(a);
  const [bTop, bBottom] = getYRange(b);

  const aHeight = aBottom - aTop;
  const bHeight = bBottom - bTop;

  // 规则 2：完全包含（处理大小不一的字符）
  const aContainsB = aTop <= bTop && aBottom >= bBottom;
  const bContainsA = bTop <= aTop && bBottom >= aBottom;
  if (aContainsB || bContainsA) {
    return true;
  }

  // 规则 1：Y 范围重叠超过阈值
  const overlapTop = Math.max(aTop, bTop);
  const overlapBottom = Math.min(aBottom, bBottom);
  const overlapHeight = Math.max(0, overlapBottom - overlapTop);

  // 使用较小高度作为基准
  const minHeight = Math.min(aHeight, bHeight);
  if (minHeight === 0) return false;

  return overlapHeight / minHeight >= overlapThreshold;
}

/**
 * Union-Find 数据结构
 */
class UnionFind {
  private parent: Map<number, number> = new Map();

  constructor(ids: number[]) {
    ids.forEach((id) => this.parent.set(id, id));
  }

  find(id: number): number {
    if (this.parent.get(id) !== id) {
      this.parent.set(id, this.find(this.parent.get(id)!));
    }
    return this.parent.get(id)!;
  }

  union(id1: number, id2: number): void {
    const root1 = this.find(id1);
    const root2 = this.find(id2);
    if (root1 !== root2) {
      this.parent.set(root1, root2);
    }
  }

  getGroups(): Map<number, number[]> {
    const groups = new Map<number, number[]>();
    this.parent.forEach((_, id) => {
      const root = this.find(id);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(id);
    });
    return groups;
  }
}

/**
 * 合并多个区域的边界框
 */
function mergeBoundingBoxes(regions: DiffRegion[]): BoundingBox {
  if (regions.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const minX = Math.min(...regions.map((r) => r.boundingBox.x));
  const minY = Math.min(...regions.map((r) => r.boundingBox.y));
  const maxX = Math.max(
    ...regions.map((r) => r.boundingBox.x + r.boundingBox.width)
  );
  const maxY = Math.max(
    ...regions.map((r) => r.boundingBox.y + r.boundingBox.height)
  );

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * 按行分组差异区域
 */
export async function groupRegionsByLine(
  input: GroupRegionsByLineInput,
  ctx?: CoreContext
): Promise<GroupRegionsByLineOutput> {
  const logger = ctx?.adapters?.logger;
  const { regions, overlapThreshold = 0.4 } = input;

  logger?.info?.("[GroupByLine] 开始行分组, 区域数:", regions.length);

  if (regions.length === 0) {
    return { lines: [], lineCount: 0 };
  }

  // 使用 Union-Find 进行分组
  const uf = new UnionFind(regions.map((r) => r.id));

  // 两两比较，判断是否在同一行
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      if (isSameLine(regions[i], regions[j], overlapThreshold)) {
        uf.union(regions[i].id, regions[j].id);
      }
    }
  }

  // 获取分组结果
  const groups = uf.getGroups();
  const regionMap = new Map(regions.map((r) => [r.id, r]));

  // 构建 LineGroup
  const lines: LineGroup[] = [];
  groups.forEach((ids) => {
    const lineRegions = ids
      .map((id) => regionMap.get(id)!)
      .filter(Boolean)
      // 组内按 X 坐标排序（从左到右）
      .sort((a, b) => a.boundingBox.x - b.boundingBox.x);

    if (lineRegions.length > 0) {
      lines.push({
        lineIndex: 0, // 稍后排序后更新
        regions: lineRegions,
        boundingBox: mergeBoundingBoxes(lineRegions),
      });
    }
  });

  // 按平均 Y 坐标排序（从上到下）
  lines.sort((a, b) => {
    const avgYA =
      a.regions.reduce((sum, r) => sum + r.boundingBox.y, 0) / a.regions.length;
    const avgYB =
      b.regions.reduce((sum, r) => sum + r.boundingBox.y, 0) / b.regions.length;
    return avgYA - avgYB;
  });

  // 更新行号
  lines.forEach((line, index) => {
    line.lineIndex = index;
  });

  logger?.info?.("[GroupByLine] 分组完成, 行数:", lines.length);

  return {
    lines,
    lineCount: lines.length,
  };
}
