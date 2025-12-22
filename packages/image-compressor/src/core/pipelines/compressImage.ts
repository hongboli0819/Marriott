/**
 * 图片压缩主管线
 * 
 * 策略：保持高画质（quality 固定），通过调整尺寸来达到目标大小
 * 
 * 遵循规范：CoreFn<I, O> = (input, ctx) => Promise<O>
 */

import type { CoreFn } from '../types/context';
import type { CompressImageInput, CompressImageOutput } from '../types/io';
import { checkNeedCompress } from '../steps/checkNeedCompress';
import { binarySearchScale } from '../steps/binarySearchScale';

const DEFAULT_QUALITY = 0.92; // 固定高画质
const DEFAULT_MAX_DIFFERENCE = 1 * 1024 * 1024; // 1MB

export const compressImage: CoreFn<CompressImageInput, CompressImageOutput> = async (
  input,
  ctx
) => {
  const logger = ctx?.adapters?.logger;
  const startTime = Date.now();
  
  const { image, targetSize, options = {} } = input;
  
  const {
    maxDifferenceThreshold = DEFAULT_MAX_DIFFERENCE,
    quality = DEFAULT_QUALITY,
    minScale = 0.1,
    maxIterations = 20,
    outputFormat = 'image/jpeg',
  } = options;
  
  const originalSize = image.size;
  
  logger?.info?.('[compressImage] 开始处理（高画质模式）', {
    originalSize,
    targetSize,
    fixedQuality: quality,
  });
  
  // 预检查：无需压缩
  if (!checkNeedCompress(originalSize, targetSize)) {
    logger?.info?.('[compressImage] 无需压缩，原始大小已满足目标');
    
    return {
      blob: image,
      originalSize,
      finalSize: originalSize,
      wasCompressed: false,
      finalScale: 1.0,
      finalQuality: quality,
      finalWidth: null,
      finalHeight: null,
      compressionRatio: 1,
      stats: {
        iterations: 0,
        duration: Date.now() - startTime,
        differenceFromTarget: targetSize - originalSize,
      },
    };
  }
  
  // 二分法查找最佳 Scale
  logger?.info?.('[compressImage] 开始二分法查找最佳尺寸');
  
  const result = await binarySearchScale({
    image,
    targetSize,
    maxDifferenceThreshold,
    fixedQuality: quality,
    minScale,
    maxIterations,
    outputFormat,
    onProgress: (progress) => {
      logger?.info?.('[compressImage] 压缩进度', progress);
    },
  });
  
  const duration = Date.now() - startTime;
  
  logger?.info?.('[compressImage] 压缩完成', {
    originalSize,
    finalSize: result.blob.size,
    finalScale: result.scale,
    finalDimensions: `${result.width}x${result.height}`,
    iterations: result.iterations,
    duration,
  });
  
  return {
    blob: result.blob,
    originalSize,
    finalSize: result.blob.size,
    wasCompressed: true,
    finalScale: result.scale,
    finalQuality: quality,
    finalWidth: result.width,
    finalHeight: result.height,
    compressionRatio: result.blob.size / originalSize,
    stats: {
      iterations: result.iterations,
      duration,
      differenceFromTarget: targetSize - result.blob.size,
    },
  };
};


