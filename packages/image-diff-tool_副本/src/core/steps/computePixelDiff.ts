/**
 * 像素差异计算（改进版）
 * 逐像素比较两张图片，生成差异掩码
 * 
 * 改进点：
 * 1. 添加边缘检测增强，优先检测文字边缘
 * 2. 对边缘区域使用较低阈值，对平滑区域使用较高阈值
 * 3. 过滤掉大面积的平滑色差（如背景色差）
 */

import type { CoreContext } from "../types/context";
import type { ComputePixelDiffInput, ComputePixelDiffOutput } from "../types/io";
import { loadImageAsImageData } from "./loadImage";

/**
 * 默认差异阈值
 */
const DEFAULT_THRESHOLD = 30;

/**
 * 计算图像的边缘强度（Sobel 算子）
 */
function computeEdgeStrength(imageData: ImageData): Uint8Array {
  const { width, height, data } = imageData;
  const edges = new Uint8Array(width * height);

  // Sobel 算子
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;

      // 计算梯度
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          // 使用灰度值
          const gray = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          gx += gray * sobelX[kernelIdx];
          gy += gray * sobelY[kernelIdx];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[y * width + x] = Math.min(255, Math.round(magnitude));
    }
  }

  return edges;
}

/**
 * 计算局部方差（用于检测纹理/文字区域）
 */
function computeLocalVariance(imageData: ImageData, blockSize: number = 5): Float32Array {
  const { width, height, data } = imageData;
  const variance = new Float32Array(width * height);
  const halfBlock = Math.floor(blockSize / 2);

  for (let y = halfBlock; y < height - halfBlock; y++) {
    for (let x = halfBlock; x < width - halfBlock; x++) {
      let sum = 0;
      let sumSq = 0;
      let count = 0;

      for (let ky = -halfBlock; ky <= halfBlock; ky++) {
        for (let kx = -halfBlock; kx <= halfBlock; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const gray = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
          sum += gray;
          sumSq += gray * gray;
          count++;
        }
      }

      const mean = sum / count;
      const localVar = (sumSq / count) - (mean * mean);
      variance[y * width + x] = localVar;
    }
  }

  return variance;
}

/**
 * 计算两张图片的像素差异（改进版）
 * 
 * @param input - 两张图片和阈值
 * @param ctx - 上下文
 * @returns 差异掩码
 */
export async function computePixelDiff(
  input: ComputePixelDiffInput,
  ctx?: CoreContext
): Promise<ComputePixelDiffOutput> {
  const logger = ctx?.adapters?.logger;
  const { imageA, imageB, threshold = DEFAULT_THRESHOLD } = input;

  logger?.info?.("[PixelDiff] 开始计算像素差异（改进版）, 基础阈值:", threshold);

  // 加载图像
  const imgDataA = typeof imageA === "string" 
    ? await loadImageAsImageData(imageA, ctx)
    : imageA;
  
  const imgDataB = typeof imageB === "string"
    ? await loadImageAsImageData(imageB, ctx)
    : imageB;

  // 验证尺寸
  if (imgDataA.width !== imgDataB.width || imgDataA.height !== imgDataB.height) {
    throw new Error(
      `图片尺寸不匹配: ${imgDataA.width}x${imgDataA.height} vs ${imgDataB.width}x${imgDataB.height}`
    );
  }

  const width = imgDataA.width;
  const height = imgDataA.height;
  const dataA = imgDataA.data;
  const dataB = imgDataB.data;

  // ========== 改进：计算边缘强度 ==========
  logger?.info?.("[PixelDiff] Step 1: 计算边缘强度");
  const edgesA = computeEdgeStrength(imgDataA);
  const edgesB = computeEdgeStrength(imgDataB);

  // ========== 改进：计算局部方差 ==========
  logger?.info?.("[PixelDiff] Step 2: 计算局部方差");
  const varianceB = computeLocalVariance(imgDataB, 7);

  // 计算方差的统计信息，用于自适应阈值
  let maxVariance = 0;
  for (let i = 0; i < varianceB.length; i++) {
    if (varianceB[i] > maxVariance) maxVariance = varianceB[i];
  }
  logger?.info?.("[PixelDiff] 最大局部方差:", maxVariance.toFixed(2));
  // ==========================================

  // 创建差异掩码（白色表示差异，黑色表示相同）
  const diffMask = new ImageData(width, height);
  const diffData = diffMask.data;

  let diffPixelCount = 0;
  let edgeDiffCount = 0;
  let nonEdgeDiffCount = 0;

  // 阈值设置
  const edgeThreshold = threshold * 0.8;       // 边缘区域使用较低阈值
  const nonEdgeThreshold = threshold * 2.0;    // 非边缘区域使用较高阈值
  const edgeStrengthMin = 30;                  // 边缘强度阈值
  const highVarianceThreshold = maxVariance * 0.1;  // 高方差阈值

  logger?.info?.("[PixelDiff] 边缘阈值:", edgeThreshold.toFixed(1), ", 非边缘阈值:", nonEdgeThreshold.toFixed(1));

  // 逐像素比较
  for (let i = 0; i < dataA.length; i += 4) {
    const pixelIdx = i / 4;
    const x = pixelIdx % width;
    const y = Math.floor(pixelIdx / width);

    const diffR = Math.abs(dataA[i] - dataB[i]);
    const diffG = Math.abs(dataA[i + 1] - dataB[i + 1]);
    const diffB = Math.abs(dataA[i + 2] - dataB[i + 2]);
    const totalDiff = diffR + diffG + diffB;

    // 获取边缘强度和局部方差
    const edgeStrength = Math.max(edgesA[pixelIdx], edgesB[pixelIdx]);
    const localVariance = varianceB[pixelIdx];

    // 判断是否为边缘区域或高纹理区域
    const isEdge = edgeStrength > edgeStrengthMin;
    const isHighVariance = localVariance > highVarianceThreshold;
    const isTextLikeRegion = isEdge || isHighVariance;

    // 使用自适应阈值
    const currentThreshold = isTextLikeRegion ? edgeThreshold : nonEdgeThreshold;

    if (totalDiff > currentThreshold) {
      // 差异像素标记为白色
      diffData[i] = 255;     // R
      diffData[i + 1] = 255; // G
      diffData[i + 2] = 255; // B
      diffData[i + 3] = 255; // A
      diffPixelCount++;

      if (isTextLikeRegion) {
        edgeDiffCount++;
      } else {
        nonEdgeDiffCount++;
      }
    } else {
      // 相同像素标记为黑色
      diffData[i] = 0;
      diffData[i + 1] = 0;
      diffData[i + 2] = 0;
      diffData[i + 3] = 255;
    }
  }

  logger?.info?.("[PixelDiff] 差异像素数:", diffPixelCount, "/", width * height);
  logger?.info?.("[PixelDiff] 边缘差异:", edgeDiffCount, ", 非边缘差异:", nonEdgeDiffCount);

  return {
    diffMask,
    diffPixelCount,
    size: { width, height },
  };
}
