/**
 * 差异区域聚类
 * 使用连通域分析将分散的差异像素聚合成区域
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
 * 聚类差异区域
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

  logger?.info?.("[Cluster] 开始区域聚类, 膨胀半径:", dilateRadius);

  const { width, height } = diffMask;

  // 膨胀操作
  const dilatedMask = dilate(diffMask, dilateRadius);

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
  const regions: DiffRegion[] = [];
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

      regions.push({
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

  logger?.info?.("[Cluster] 找到", regions.length, "个差异区域");

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
