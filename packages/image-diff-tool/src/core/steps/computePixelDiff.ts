/**
 * 像素差异计算
 * 逐像素比较两张图片，生成差异掩码
 */

import type { CoreContext } from "../types/context";
import type { ComputePixelDiffInput, ComputePixelDiffOutput } from "../types/io";
import { loadImageAsImageData } from "./loadImage";

/**
 * 默认差异阈值
 */
const DEFAULT_THRESHOLD = 30;

/**
 * 计算两张图片的像素差异
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

  logger?.info?.("[PixelDiff] 开始计算像素差异, 阈值:", threshold);

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

  // 创建差异掩码（白色表示差异，黑色表示相同）
  const diffMask = new ImageData(width, height);
  const diffData = diffMask.data;

  let diffPixelCount = 0;

  // 逐像素比较
  for (let i = 0; i < dataA.length; i += 4) {
    const diffR = Math.abs(dataA[i] - dataB[i]);
    const diffG = Math.abs(dataA[i + 1] - dataB[i + 1]);
    const diffB = Math.abs(dataA[i + 2] - dataB[i + 2]);

    const totalDiff = diffR + diffG + diffB;

    if (totalDiff > threshold) {
      // 差异像素标记为白色
      diffData[i] = 255;     // R
      diffData[i + 1] = 255; // G
      diffData[i + 2] = 255; // B
      diffData[i + 3] = 255; // A
      diffPixelCount++;
    } else {
      // 相同像素标记为黑色
      diffData[i] = 0;
      diffData[i + 1] = 0;
      diffData[i + 2] = 0;
      diffData[i + 3] = 255;
    }
  }

  logger?.info?.("[PixelDiff] 差异像素数:", diffPixelCount, "/", width * height);

  return {
    diffMask,
    diffPixelCount,
    size: { width, height },
  };
}
