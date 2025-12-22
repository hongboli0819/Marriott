/**
 * 检查是否需要压缩
 * 
 * 纯函数，无副作用
 */

export function checkNeedCompress(
  originalSize: number,
  targetSize: number
): boolean {
  return originalSize > targetSize;
}


