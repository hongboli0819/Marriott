/**
 * 按行分组差异区域（改进版）
 * 将同一行的差异区域聚合在一起，便于整行 OCR 识别
 * 
 * 改进点：
 * 1. 使用中心点 Y 坐标分组，而非 boundingBox 重叠判断
 * 2. 支持动态计算中心点 Y 差异阈值
 * 3. 对包含关系增加中心点距离检查
 * 4. 添加行合并后处理，合并重叠或相邻的行
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
  /** 中心点 Y 坐标最大差异（像素，默认自动计算） */
  maxCenterYDiff?: number;
  /** 是否启用行合并后处理（默认 true） */
  enableLineMerge?: boolean;
  /** 行合并的中心点 Y 差异阈值（像素，默认 30） */
  lineMergeCenterYThreshold?: number;
  /** 行合并的 Y 重叠比例阈值（默认 0.3，即 30%） */
  lineMergeOverlapThreshold?: number;
  /** X 距离阈值（像素，默认 20） */
  maxXGap?: number;
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
 * 判断两个区域是否在同一行（改进版）
 * 
 * 改进：
 * 1. 增加 X 距离检查（固定像素阈值），防止远距离噪声块"桥接"不同行
 * 2. 增加中心点 Y 坐标距离检查
 */
function isSameLine(
  a: DiffRegion,
  b: DiffRegion,
  overlapThreshold: number,
  maxCenterYDiff: number,
  maxXGap: number
): boolean {
  // ========== 第一步：X 距离检查 ==========
  // 计算两个区域在 X 方向上的间距
  const aLeft = a.boundingBox.x;
  const aRight = a.boundingBox.x + a.boundingBox.width;
  const bLeft = b.boundingBox.x;
  const bRight = b.boundingBox.x + b.boundingBox.width;
  
  // X 方向的间距（如果重叠则为 0）
  const xGap = Math.max(0, Math.max(aLeft - bRight, bLeft - aRight));
  
  // 如果 X 间距超过阈值，不归为同一行
  // （防止远距离的噪声块把不相关的行"桥接"起来）
  if (xGap > maxXGap) {
    return false;
  }
  // ==========================================

  // 首先检查中心点 Y 坐标差异
  const centerYDiff = Math.abs(a.center.y - b.center.y);
  
  // 如果中心点 Y 坐标差异太大，肯定不是同一行
  if (centerYDiff > maxCenterYDiff) {
    return false;
  }

  const [aTop, aBottom] = getYRange(a);
  const [bTop, bBottom] = getYRange(b);

  const aHeight = aBottom - aTop;
  const bHeight = bBottom - bTop;

  // 规则 2：完全包含（处理大小不一的字符）
  // 改进：即使完全包含，也需要检查中心点距离
  const aContainsB = aTop <= bTop && aBottom >= bBottom;
  const bContainsA = bTop <= aTop && bBottom >= aBottom;
  
  if (aContainsB || bContainsA) {
    // 使用较小的 boundingBox 高度作为参考
    const referenceHeight = Math.min(aHeight, bHeight);
    // 如果中心点差异超过参考高度的 80%，不归为一行
    if (centerYDiff > referenceHeight * 0.8) {
      return false;
    }
    return true;
  }

  // 规则 1：Y 范围重叠超过阈值
  const overlapTop = Math.max(aTop, bTop);
  const overlapBottom = Math.min(aBottom, bBottom);
  const overlapHeight = Math.max(0, overlapBottom - overlapTop);

  // 使用较小高度作为基准
  const minHeight = Math.min(aHeight, bHeight);
  if (minHeight === 0) return false;

  const overlapRatio = overlapHeight / minHeight;
  
  // 改进：同时检查重叠比例和中心点差异
  if (overlapRatio >= overlapThreshold) {
    // 如果重叠比例高，但中心点差异也很大，需要更高的阈值
    if (centerYDiff > minHeight * 0.5) {
      return overlapRatio >= overlapThreshold * 1.5;
    }
    return true;
  }

  return false;
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
 * 计算动态的中心点 Y 差异阈值
 * 基于所有区域的平均高度
 */
function computeDynamicMaxCenterYDiff(regions: DiffRegion[]): number {
  if (regions.length === 0) {
    return 30; // 默认值
  }

  // 计算所有区域的平均高度
  const avgHeight = regions.reduce((sum, r) => sum + r.boundingBox.height, 0) / regions.length;
  
  // 使用平均高度的 60% 作为阈值
  // 这样同一行的文字（中心点 Y 差异小于平均高度的 60%）会被归为一行
  return Math.max(30, avgHeight * 0.6);
}

/**
 * 判断两行是否应该合并
 * 
 * 改进：增加 X 距离检查，防止远距离的行被错误合并
 */
function shouldMergeLines(
  lineA: LineGroup,
  lineB: LineGroup,
  centerYThreshold: number,
  overlapThreshold: number,
  maxXGap: number
): boolean {
  const boxA = lineA.boundingBox;
  const boxB = lineB.boundingBox;
  
  // ========== X 距离检查 ==========
  // 计算两行在 X 方向上的间距
  const aLeft = boxA.x;
  const aRight = boxA.x + boxA.width;
  const bLeft = boxB.x;
  const bRight = boxB.x + boxB.width;
  
  const xGap = Math.max(0, Math.max(aLeft - bRight, bLeft - aRight));
  
  // 如果 X 间距超过阈值，不合并
  if (xGap > maxXGap) {
    return false;
  }
  // ==========================================
  
  // 计算中心点 Y 坐标
  const centerYA = boxA.y + boxA.height / 2;
  const centerYB = boxB.y + boxB.height / 2;
  const centerYDiff = Math.abs(centerYA - centerYB);
  
  // 条件 1：中心点 Y 差异小于阈值
  if (centerYDiff <= centerYThreshold) {
    return true;
  }
  
  // 计算 Y 范围
  const topA = boxA.y;
  const bottomA = boxA.y + boxA.height;
  const topB = boxB.y;
  const bottomB = boxB.y + boxB.height;
  
  // 条件 2：Y 范围有重叠
  const overlapTop = Math.max(topA, topB);
  const overlapBottom = Math.min(bottomA, bottomB);
  const overlapHeight = Math.max(0, overlapBottom - overlapTop);
  
  if (overlapHeight > 0) {
    // 使用较小高度作为基准计算重叠比例
    const minHeight = Math.min(boxA.height, boxB.height);
    const overlapRatio = overlapHeight / minHeight;
    
    if (overlapRatio >= overlapThreshold) {
      return true;
    }
  }
  
  // 条件 3：一行完全包含另一行（增加中心点距离检查）
  const aContainsB = topA <= topB && bottomA >= bottomB;
  const bContainsA = topB <= topA && bottomB >= bottomA;
  
  if (aContainsB || bContainsA) {
    // 即使包含，也要检查中心点 Y 距离
    const minHeight = Math.min(boxA.height, boxB.height);
    if (centerYDiff > minHeight * 0.5 && centerYDiff > centerYThreshold) {
      return false;  // 中心点差距太大，不合并
    }
    return true;
  }
  
  return false;
}

/**
 * 后处理：合并重叠或相邻的行
 */
function mergeOverlappingLines(
  lines: LineGroup[],
  centerYThreshold: number,
  overlapThreshold: number,
  maxXGap: number,
  logger?: CoreContext["adapters"]["logger"]
): LineGroup[] {
  if (lines.length <= 1) {
    return lines;
  }
  
  logger?.info?.(`[LineMerge] 开始行合并后处理, 输入 ${lines.length} 行`);
  logger?.info?.(`[LineMerge] 参数: 中心点Y阈值=${centerYThreshold}px, 重叠比例阈值=${(overlapThreshold * 100).toFixed(0)}%, X距离阈值=${maxXGap}px`);
  
  // 按 Y 坐标排序
  const sortedLines = [...lines].sort((a, b) => a.boundingBox.y - b.boundingBox.y);
  
  const mergedLines: LineGroup[] = [];
  let currentLine = { ...sortedLines[0], regions: [...sortedLines[0].regions] };
  
  for (let i = 1; i < sortedLines.length; i++) {
    const nextLine = sortedLines[i];
    
    if (shouldMergeLines(currentLine, nextLine, centerYThreshold, overlapThreshold, maxXGap)) {
      // 合并区域
      logger?.info?.(
        `[LineMerge] 合并行 ${currentLine.lineIndex + 1} 和行 ${nextLine.lineIndex + 1}: ` +
        `Y=${currentLine.boundingBox.y}~${currentLine.boundingBox.y + currentLine.boundingBox.height} ` +
        `与 Y=${nextLine.boundingBox.y}~${nextLine.boundingBox.y + nextLine.boundingBox.height}`
      );
      
      currentLine.regions = [...currentLine.regions, ...nextLine.regions];
      currentLine.boundingBox = mergeBoundingBoxes(currentLine.regions);
    } else {
      // 保存当前行，开始新行
      mergedLines.push(currentLine);
      currentLine = { ...nextLine, regions: [...nextLine.regions] };
    }
  }
  
  // 添加最后一行
  mergedLines.push(currentLine);
  
  // 重新排序（按中心点 Y）
  mergedLines.sort((a, b) => {
    const centerYA = a.boundingBox.y + a.boundingBox.height / 2;
    const centerYB = b.boundingBox.y + b.boundingBox.height / 2;
    return centerYA - centerYB;
  });
  
  // 更新行号
  mergedLines.forEach((line, idx) => {
    line.lineIndex = idx;
  });
  
  logger?.info?.(`[LineMerge] 合并完成, 输出 ${mergedLines.length} 行`);
  
  return mergedLines;
}

/**
 * 后处理：拆分 X 间距过大的行
 * 
 * 对每一行：
 * 1. 按 X 坐标排序所有区域
 * 2. 计算相邻区域之间的 X 间隙
 * 3. 如果某个间隙超过阈值，从这里拆分成两行
 * 
 * 这可以解决"噪声区域桥接不同行"的问题
 */
function splitLinesByXGap(
  lines: LineGroup[],
  maxXGap: number,
  logger?: CoreContext["adapters"]["logger"]
): LineGroup[] {
  if (lines.length === 0) {
    return lines;
  }

  logger?.info?.(`[LineSplit] 开始 X 间距拆分, 输入 ${lines.length} 行, X距离阈值=${maxXGap}px`);

  const result: LineGroup[] = [];
  let splitCount = 0;

  for (const line of lines) {
    // 按 X 坐标排序
    const sortedRegions = [...line.regions].sort(
      (a, b) => a.boundingBox.x - b.boundingBox.x
    );

    if (sortedRegions.length <= 1) {
      result.push(line);
      continue;
    }

    // 找出需要拆分的位置
    const splitIndices: number[] = [];

    for (let i = 0; i < sortedRegions.length - 1; i++) {
      const current = sortedRegions[i];
      const next = sortedRegions[i + 1];

      // 计算 X 间隙
      const currentRight = current.boundingBox.x + current.boundingBox.width;
      const nextLeft = next.boundingBox.x;
      const xGap = nextLeft - currentRight;

      // 如果间隙超过阈值，标记拆分点
      if (xGap > maxXGap) {
        splitIndices.push(i + 1);
        logger?.info?.(
          `[LineSplit] 行 ${line.lineIndex + 1}: 在位置 ${i + 1} 拆分, ` +
          `X间隙=${xGap.toFixed(0)}px > ${maxXGap}px`
        );
        splitCount++;
      }
    }

    // 根据拆分点生成新行
    if (splitIndices.length === 0) {
      result.push(line);
    } else {
      let startIdx = 0;
      for (const splitIdx of [...splitIndices, sortedRegions.length]) {
        const subRegions = sortedRegions.slice(startIdx, splitIdx);
        if (subRegions.length > 0) {
          result.push({
            lineIndex: 0, // 后面重新编号
            regions: subRegions,
            boundingBox: mergeBoundingBoxes(subRegions),
          });
        }
        startIdx = splitIdx;
      }
    }
  }

  // 重新按 Y 排序并编号
  result.sort((a, b) => {
    const centerYA = a.boundingBox.y + a.boundingBox.height / 2;
    const centerYB = b.boundingBox.y + b.boundingBox.height / 2;
    return centerYA - centerYB;
  });

  result.forEach((line, idx) => {
    line.lineIndex = idx;
  });

  logger?.info?.(`[LineSplit] 拆分完成, 共拆分 ${splitCount} 处, 输出 ${result.length} 行`);

  return result;
}

/**
 * 按行分组差异区域（改进版）
 */
export async function groupRegionsByLine(
  input: GroupRegionsByLineInput,
  ctx?: CoreContext
): Promise<GroupRegionsByLineOutput> {
  const logger = ctx?.adapters?.logger;
  const { 
    regions, 
    overlapThreshold = 0.4,
    maxCenterYDiff: inputMaxCenterYDiff,
    enableLineMerge = true,
    lineMergeCenterYThreshold = 30,
    lineMergeOverlapThreshold = 0.3,
    maxXGap = 55,
  } = input;

  logger?.info?.("[GroupByLine] 开始行分组（改进版）, 区域数:", regions.length);
  logger?.info?.("[GroupByLine] 配置: enableLineMerge=", enableLineMerge, 
    ", lineMergeCenterYThreshold=", lineMergeCenterYThreshold,
    ", lineMergeOverlapThreshold=", lineMergeOverlapThreshold,
    ", maxXGap=", maxXGap, "px");

  if (regions.length === 0) {
    return { lines: [], lineCount: 0 };
  }

  // 计算动态的中心点 Y 差异阈值
  const maxCenterYDiff = inputMaxCenterYDiff ?? computeDynamicMaxCenterYDiff(regions);
  logger?.info?.("[GroupByLine] 使用中心点 Y 差异阈值:", maxCenterYDiff.toFixed(1), "px");

  // 使用 Union-Find 进行分组
  const uf = new UnionFind(regions.map((r) => r.id));

  // 两两比较，判断是否在同一行
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      if (isSameLine(regions[i], regions[j], overlapThreshold, maxCenterYDiff, maxXGap)) {
        uf.union(regions[i].id, regions[j].id);
      }
    }
  }

  // 获取分组结果
  const groups = uf.getGroups();
  const regionMap = new Map(regions.map((r) => [r.id, r]));

  // 构建 LineGroup
  let lines: LineGroup[] = [];
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
      a.regions.reduce((sum, r) => sum + r.center.y, 0) / a.regions.length;
    const avgYB =
      b.regions.reduce((sum, r) => sum + r.center.y, 0) / b.regions.length;
    return avgYA - avgYB;
  });

  // 更新行号
  lines.forEach((line, index) => {
    line.lineIndex = index;
  });

  logger?.info?.("[GroupByLine] 初步分组完成, 行数:", lines.length);

  // ========== 行合并后处理 ==========
  if (enableLineMerge && lines.length > 1) {
    lines = mergeOverlappingLines(
      lines,
      lineMergeCenterYThreshold,
      lineMergeOverlapThreshold,
      maxXGap,
      logger
    );
  }
  // ==========================================

  // ========== X 间距拆分后处理 ==========
  // 对每一行，检查内部区域之间的 X 距离
  // 如果某两个区域之间的间距太大，就把这一行拆分成两个独立的行
  lines = splitLinesByXGap(lines, maxXGap, logger);
  // ==========================================

  logger?.info?.("[GroupByLine] 最终行数:", lines.length);
  
  // 输出每行的区域数量和位置信息
  lines.forEach((line, index) => {
    const avgCenterY = line.regions.reduce((sum, r) => sum + r.center.y, 0) / line.regions.length;
    logger?.info?.(
      `[GroupByLine] 第 ${index + 1} 行: ${line.regions.length} 个区域, ` +
      `平均中心点 Y=${avgCenterY.toFixed(0)}, ` +
      `boundingBox Y=${line.boundingBox.y}~${line.boundingBox.y + line.boundingBox.height}`
    );
  });

  return {
    lines,
    lineCount: lines.length,
  };
}
