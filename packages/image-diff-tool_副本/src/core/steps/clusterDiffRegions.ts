/**
 * 差异区域聚类（改进版）
 * 使用连通域分析将分散的差异像素聚合成区域
 * 
 * 改进点：
 * 1. 添加腐蚀操作，分离背景和文字区域
 * 2. 添加区域特征过滤，过滤掉背景区域
 */

import type { CoreContext } from "../types/context";
import type {
  ClusterDiffRegionsInput,
  ClusterDiffRegionsOutput,
  DiffRegion,
  BoundingBox,
} from "../types/io";

/**
 * 默认配置
 */
const DEFAULT_DILATE_RADIUS = 3;
const DEFAULT_MIN_AREA_SIZE = 100;

/**
 * 腐蚀操作
 * 缩小差异区域，断开弱连接
 */
function erode(mask: ImageData, radius: number): ImageData {
  const { width, height, data } = mask;
  const result = new ImageData(width, height);
  const resultData = result.data;

  // 初始化为黑色
  for (let i = 0; i < resultData.length; i += 4) {
    resultData[i] = 0;
    resultData[i + 1] = 0;
    resultData[i + 2] = 0;
    resultData[i + 3] = 255;
  }

  // 腐蚀操作：只有周围所有像素都是白色时，才保留
  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx] === 255) {
        // 检查周围是否都是白色
        let allWhite = true;
        outerLoop:
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nidx = ((y + dy) * width + (x + dx)) * 4;
            if (data[nidx] !== 255) {
              allWhite = false;
              break outerLoop;
            }
          }
        }

        if (allWhite) {
          resultData[idx] = 255;
          resultData[idx + 1] = 255;
          resultData[idx + 2] = 255;
        }
      }
    }
  }

  return result;
}

/**
 * 膨胀操作
 * 扩展差异区域，连接邻近像素
 */
function dilate(mask: ImageData, radius: number): ImageData {
  const { width, height, data } = mask;
  const result = new ImageData(width, height);
  const resultData = result.data;

  // 复制原数据
  for (let i = 0; i < data.length; i++) {
    resultData[i] = data[i];
  }

  // 膨胀操作
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx] === 255) {
        // 当前像素是差异像素，扩展到周围
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nidx = (ny * width + nx) * 4;
              resultData[nidx] = 255;
              resultData[nidx + 1] = 255;
              resultData[nidx + 2] = 255;
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * 连通域标记（Flood Fill 算法）
 */
function floodFill(
  mask: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  label: number,
  labels: Int32Array
): number {
  const stack: [number, number][] = [[startX, startY]];
  let pixelCount = 0;

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const idx = y * width + x;

    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (labels[idx] !== 0) continue;
    if (mask[idx] === 0) continue;

    labels[idx] = label;
    pixelCount++;

    // 4-连通
    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }

  return pixelCount;
}

/**
 * 判断区域是否为文字区域（而非背景）
 * 通过区域特征进行过滤
 */
function isTextRegion(
  region: DiffRegion,
  imageWidth: number,
  imageHeight: number,
  logger?: CoreContext["adapters"]
): boolean {
  const { boundingBox, pixelCount } = region;
  const { width, height } = boundingBox;

  // 1. 宽高比：文字通常是横向的（宽 > 高）
  const aspectRatio = width / height;

  // 2. 像素密度：文字区域的像素密度应该较高
  // 密度 = 实际差异像素数 / boundingBox 面积
  const boundingBoxArea = width * height;
  const pixelDensity = pixelCount / boundingBoxArea;

  // 3. 区域大小：背景区域通常很大，文字区域相对较小
  const regionAreaRatio = boundingBoxArea / (imageWidth * imageHeight);

  // 4. 高度：文字行的高度通常不会太大
  const heightRatio = height / imageHeight;

  // 5. 紧凑度：圆形/方形区域（宽高比接近 1:1）通常是背景
  const isSquareLike = aspectRatio > 0.7 && aspectRatio < 1.5;

  // 综合判断
  // 背景区域特征（更严格的阈值）：
  // - 面积占比 > 0.08（大块区域）
  // - 高度占比 > 0.15（太高的区域）
  // - 像素密度 < 0.20（稀疏区域，背景差异分散）
  // - 接近正方形且面积较大

  const isLargeArea = regionAreaRatio > 0.08;
  const isTooTall = heightRatio > 0.15;
  const isSparseDensity = pixelDensity < 0.20;
  const isLargeSquare = isSquareLike && regionAreaRatio > 0.05;

  // 如果满足任意两个背景特征，则判定为背景
  const backgroundFeatures = [isLargeArea, isTooTall, isSparseDensity, isLargeSquare];
  const backgroundFeatureCount = backgroundFeatures.filter(Boolean).length;
  const isBackground = backgroundFeatureCount >= 2;

  if (isBackground) {
    logger?.logger?.info?.(
      `[Cluster] 过滤背景区域 #${region.id}: ` +
      `宽高比=${aspectRatio.toFixed(2)}, ` +
      `密度=${pixelDensity.toFixed(3)}, ` +
      `面积占比=${regionAreaRatio.toFixed(3)}, ` +
      `高度占比=${heightRatio.toFixed(3)}, ` +
      `特征=[${isLargeArea ? '大面积' : ''}${isTooTall ? ' 太高' : ''}${isSparseDensity ? ' 稀疏' : ''}${isLargeSquare ? ' 方形' : ''}]`
    );
  }

  return !isBackground;
}

/**
 * 过滤背景区域
 */
function filterBackgroundRegions(
  regions: DiffRegion[],
  imageWidth: number,
  imageHeight: number,
  logger?: CoreContext["adapters"]
): DiffRegion[] {
  const textRegions: DiffRegion[] = [];

  for (const region of regions) {
    if (isTextRegion(region, imageWidth, imageHeight, logger)) {
      textRegions.push(region);
    }
  }

  logger?.logger?.info?.(
    `[Cluster] 过滤结果: ${textRegions.length} 个文字区域, ${regions.length - textRegions.length} 个背景区域被过滤`
  );

  return textRegions;
}

/**
 * 聚类差异区域（改进版）
 */
export async function clusterDiffRegions(
  input: ClusterDiffRegionsInput,
  ctx?: CoreContext
): Promise<ClusterDiffRegionsOutput> {
  const logger = ctx?.adapters?.logger;
  const {
    diffMask,
    dilateRadius = DEFAULT_DILATE_RADIUS,
    minAreaSize = DEFAULT_MIN_AREA_SIZE,
  } = input;

  logger?.info?.("[Cluster] 开始区域聚类（改进版）, 膨胀半径:", dilateRadius);

  const { width, height } = diffMask;

  // ========== 改进：形态学操作序列 ==========
  // 1. 先腐蚀，断开弱连接（背景和文字之间的连接）
  logger?.info?.("[Cluster] Step 1: 腐蚀操作，断开弱连接");
  const erodedMask = erode(diffMask, Math.max(1, Math.floor(dilateRadius / 2)));

  // 2. 再膨胀，恢复文字区域
  logger?.info?.("[Cluster] Step 2: 膨胀操作，恢复文字区域");
  const dilatedMask = dilate(erodedMask, dilateRadius);
  // ==========================================

  // 提取二值掩码（只取 R 通道）
  const binaryMask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    binaryMask[i] = dilatedMask.data[i * 4] > 0 ? 1 : 0;
  }

  // 连通域标记
  const labels = new Int32Array(width * height);
  let currentLabel = 0;
  const regionStats: Map<number, { pixels: number; minX: number; maxX: number; minY: number; maxY: number; sumX: number; sumY: number }> = new Map();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binaryMask[idx] === 1 && labels[idx] === 0) {
        currentLabel++;
        const pixelCount = floodFill(binaryMask, width, height, x, y, currentLabel, labels);
        
        if (pixelCount >= minAreaSize) {
          regionStats.set(currentLabel, {
            pixels: 0,
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity,
            sumX: 0,
            sumY: 0,
          });
        }
      }
    }
  }

  // 收集每个区域的统计信息
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const label = labels[idx];
      const stats = regionStats.get(label);
      if (stats) {
        stats.pixels++;
        stats.minX = Math.min(stats.minX, x);
        stats.maxX = Math.max(stats.maxX, x);
        stats.minY = Math.min(stats.minY, y);
        stats.maxY = Math.max(stats.maxY, y);
        stats.sumX += x;
        stats.sumY += y;
      }
    }
  }

  // 构建区域列表
  const allRegions: DiffRegion[] = [];
  let regionId = 0;

  regionStats.forEach((stats, label) => {
    if (stats.pixels >= minAreaSize) {
      regionId++;
      const boundingBox: BoundingBox = {
        x: stats.minX,
        y: stats.minY,
        width: stats.maxX - stats.minX + 1,
        height: stats.maxY - stats.minY + 1,
      };

      allRegions.push({
        id: regionId,
        boundingBox,
        pixelCount: stats.pixels,
        center: {
          x: Math.round(stats.sumX / stats.pixels),
          y: Math.round(stats.sumY / stats.pixels),
        },
      });
    }
  });

  logger?.info?.("[Cluster] 初步找到", allRegions.length, "个差异区域");

  // ========== 改进：过滤背景区域 ==========
  logger?.info?.("[Cluster] Step 3: 过滤背景区域");
  const regions = filterBackgroundRegions(allRegions, width, height, ctx?.adapters);

  // 重新分配区域 ID
  regions.forEach((region, index) => {
    region.id = index + 1;
  });
  // ==========================================

  logger?.info?.("[Cluster] 最终找到", regions.length, "个有效差异区域");

  // 创建带标签的掩码（用于可视化）
  const labeledMask = new ImageData(width, height);
  const colors = [
    [255, 0, 0],    // 红
    [0, 255, 0],    // 绿
    [0, 0, 255],    // 蓝
    [255, 255, 0],  // 黄
    [255, 0, 255],  // 品红
    [0, 255, 255],  // 青
    [255, 128, 0],  // 橙
    [128, 0, 255],  // 紫
  ];

  for (let i = 0; i < width * height; i++) {
    const label = labels[i];
    if (label > 0 && regionStats.has(label)) {
      const color = colors[(label - 1) % colors.length];
      labeledMask.data[i * 4] = color[0];
      labeledMask.data[i * 4 + 1] = color[1];
      labeledMask.data[i * 4 + 2] = color[2];
      labeledMask.data[i * 4 + 3] = 180; // 半透明
    } else {
      labeledMask.data[i * 4 + 3] = 0; // 透明
    }
  }

  return {
    regions,
    labeledMask,
  };
}
