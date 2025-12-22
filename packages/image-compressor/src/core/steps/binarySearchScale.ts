/**
 * 二分法查找最佳缩放比例
 * 
 * 核心算法：保持固定高画质，通过调整尺寸来达到目标大小
 * 
 * 算法说明：
 * 1. 目标区间: [targetSize - maxDiff, targetSize)
 * 2. 二分查找 scale，找到最大的 scale 使得压缩后大小在目标区间内
 * 3. 如果 currentSize >= targetSize，说明太大，需要缩小尺寸 (high = mid)
 * 4. 如果 currentSize < targetSize，满足硬约束，尝试更大的 scale (low = mid)
 */

import type { CompressProgress } from '../types/io';

export interface BinarySearchScaleInput {
  image: Blob | File;
  targetSize: number;
  maxDifferenceThreshold: number;
  fixedQuality: number;
  minScale: number;
  maxIterations: number;
  outputFormat: 'image/jpeg' | 'image/webp';
  onProgress?: (progress: CompressProgress) => void;
}

export interface BinarySearchScaleOutput {
  blob: Blob;
  scale: number;
  width: number;
  height: number;
  iterations: number;
}

export async function binarySearchScale(
  input: BinarySearchScaleInput
): Promise<BinarySearchScaleOutput> {
  const {
    image,
    targetSize,
    maxDifferenceThreshold,
    fixedQuality,
    minScale,
    maxIterations,
    outputFormat,
    onProgress,
  } = input;
  
  // 1. 获取原始图片尺寸
  const imageBitmap = await createImageBitmap(image);
  const originalWidth = imageBitmap.width;
  const originalHeight = imageBitmap.height;
  
  // 2. 二分法查找最佳 scale
  let low = minScale;  // 最小缩放比例
  let high = 1.0;      // 最大缩放比例（原始尺寸）
  
  let bestBlob: Blob | null = null;
  let bestScale = 1.0;
  let bestWidth = originalWidth;
  let bestHeight = originalHeight;
  let iteration = 0;
  
  while (iteration < maxIterations && high - low > 0.01) {
    iteration++;
    const mid = (low + high) / 2;
    
    // 计算缩放后的尺寸
    const newWidth = Math.round(originalWidth * mid);
    const newHeight = Math.round(originalHeight * mid);
    
    // 创建缩放后的 Canvas
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('[binarySearchScale] 无法创建 Canvas 2D 上下文');
    }
    
    // 高质量缩放
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);
    
    // 用固定高画质压缩
    const blob = await canvas.convertToBlob({
      type: outputFormat,
      quality: fixedQuality,
    });
    
    const currentSize = blob.size;
    
    onProgress?.({
      iteration,
      currentScale: mid,
      currentSize,
      targetSize,
      currentDimensions: `${newWidth}x${newHeight}`,
    });
    
    if (currentSize >= targetSize) {
      // 还是太大，需要更小的尺寸
      high = mid;
    } else {
      // currentSize < targetSize，满足硬约束
      // 记录为候选解
      bestBlob = blob;
      bestScale = mid;
      bestWidth = newWidth;
      bestHeight = newHeight;
      
      // 尝试更大的 scale（追求更高分辨率）
      low = mid;
      
      // 提前退出：差异足够小（< 100KB）
      const difference = targetSize - currentSize;
      if (difference < maxDifferenceThreshold && difference < 100 * 1024) {
        break;
      }
    }
  }
  
  // 清理资源
  imageBitmap.close();
  
  // 返回结果
  if (bestBlob) {
    return {
      blob: bestBlob,
      scale: bestScale,
      width: bestWidth,
      height: bestHeight,
      iterations: iteration,
    };
  }
  
  // 极端情况：即使最小 scale 也无法满足目标大小
  throw new Error(
    `[binarySearchScale] 无法将图片压缩到目标大小。` +
    `原始尺寸: ${originalWidth}x${originalHeight}, ` +
    `最小 scale: ${minScale}, ` +
    `目标大小: ${targetSize} bytes`
  );
}


