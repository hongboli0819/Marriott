/**
 * Image Compressor - Input/Output Types
 * 
 * 策略：保持高画质，通过调整尺寸来达到目标大小
 */

/** 压缩图片的输入 */
export interface CompressImageInput {
  /** 原始图片（Blob 或 File） */
  image: Blob | File;
  
  /** 目标大小（字节），例如 5 * 1024 * 1024 表示 5MB */
  targetSize: number;
  
  /** 可选配置 */
  options?: {
    /** 最大差异阈值（字节），默认 1MB */
    maxDifferenceThreshold?: number;
    /** 固定画质（0-1），默认 0.92（高画质） */
    quality?: number;
    /** 最小缩放比例，默认 0.1（10%） */
    minScale?: number;
    /** 二分查找最大迭代次数，默认 20 */
    maxIterations?: number;
    /** 输出格式，默认 'image/jpeg' */
    outputFormat?: 'image/jpeg' | 'image/webp';
  };
}

/** 压缩图片的输出 */
export interface CompressImageOutput {
  /** 处理后的图片 Blob */
  blob: Blob;
  
  /** 原始文件大小（字节） */
  originalSize: number;
  
  /** 最终文件大小（字节） */
  finalSize: number;
  
  /** 是否进行了压缩 */
  wasCompressed: boolean;
  
  /** 最终使用的缩放比例 */
  finalScale: number;
  
  /** 使用的画质（固定值） */
  finalQuality: number;
  
  /** 最终图片宽度（像素） */
  finalWidth: number | null;
  
  /** 最终图片高度（像素） */
  finalHeight: number | null;
  
  /** 压缩比（finalSize / originalSize） */
  compressionRatio: number;
  
  /** 统计信息 */
  stats: {
    /** 迭代次数 */
    iterations: number;
    /** 耗时（毫秒） */
    duration: number;
    /** 与目标大小的差异（字节） */
    differenceFromTarget: number;
  };
}

/** 压缩进度 */
export interface CompressProgress {
  /** 当前迭代次数 */
  iteration: number;
  /** 当前缩放比例 */
  currentScale: number;
  /** 当前压缩后大小 */
  currentSize: number;
  /** 目标大小 */
  targetSize: number;
  /** 当前尺寸 */
  currentDimensions: string;
}


