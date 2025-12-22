/**
 * @muse/image-compressor
 * 
 * 图片智能压缩模块 - 保持高画质，通过调整尺寸达到目标大小
 * 
 * @example
 * ```ts
 * import { compressImage } from '@muse/image-compressor';
 * 
 * const result = await compressImage({
 *   image: myImageBlob,
 *   targetSize: 5 * 1024 * 1024, // 5MB
 * });
 * 
 * if (result.wasCompressed) {
 *   console.log(`压缩后: ${result.finalSize} bytes`);
 *   console.log(`缩放比例: ${result.finalScale * 100}%`);
 *   console.log(`最终尺寸: ${result.finalWidth}x${result.finalHeight}`);
 * }
 * ```
 */

// ============================================
// Project Identity（规范要求）
// ============================================

export const projectId = 'image-compressor';
export const projectName = 'Image Compressor';
export const projectVersion = '0.1.0';

// ============================================
// Types
// ============================================

export type {
  CoreContext,
  CoreFn,
  Logger,
} from './types/context';

export type {
  CompressImageInput,
  CompressImageOutput,
  CompressProgress,
} from './types/io';

// ============================================
// Main Pipeline (Primary API)
// ============================================

export { compressImage } from './pipelines/compressImage';

// ============================================
// Steps (Advanced Usage)
// ============================================

export { checkNeedCompress } from './steps/checkNeedCompress';
export { binarySearchScale } from './steps/binarySearchScale';
export type { BinarySearchScaleInput, BinarySearchScaleOutput } from './steps/binarySearchScale';


