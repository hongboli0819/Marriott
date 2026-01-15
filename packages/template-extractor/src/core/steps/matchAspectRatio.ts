/**
 * 计算图片宽高比，匹配最接近的标准比例
 */

import { ASPECT_RATIO_CONFIG, SupportedAspectRatio } from "../types/io";

// ==================== 类型定义 ====================

export interface MatchAspectRatioInput {
  width: number;
  height: number;
}

export interface MatchAspectRatioOutput {
  /** 匹配的宽高比 */
  matchedRatio: SupportedAspectRatio;
  /** 原始比例值 */
  originalRatio: number;
  /** 匹配的比例值 */
  matchedValue: number;
  /** 差异百分比 */
  diffPercent: number;
  /** 匹配的配置标签 */
  label: string;
}

// ==================== 主函数 ====================

/**
 * 匹配最接近的标准宽高比
 */
export function matchAspectRatio(
  input: MatchAspectRatioInput
): MatchAspectRatioOutput {
  const { width, height } = input;
  const originalRatio = width / height;

  let bestMatch = ASPECT_RATIO_CONFIG[0];
  let minDiff = Math.abs(originalRatio - bestMatch.value);

  for (const config of ASPECT_RATIO_CONFIG) {
    const diff = Math.abs(originalRatio - config.value);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = config;
    }
  }

  const diffPercent = (minDiff / originalRatio) * 100;

  return {
    matchedRatio: bestMatch.ratio,
    originalRatio,
    matchedValue: bestMatch.value,
    diffPercent,
    label: bestMatch.label,
  };
}

// ==================== 辅助函数 ====================

/**
 * 从 base64 图片获取尺寸
 */
export function getImageSize(
  imageDataUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      reject(new Error("无法加载图片"));
    };
    img.src = imageDataUrl;
  });
}

/**
 * 解析 DataURL，提取 base64 和 mimeType
 */
export function parseDataUrl(dataUrl: string): {
  base64: string;
  mimeType: string;
} {
  if (dataUrl.startsWith("data:")) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], base64: match[2] };
    }
  }
  // 假设是纯 base64，默认 PNG
  return { base64: dataUrl, mimeType: "image/png" };
}

/**
 * 将 base64 转为 DataURL
 */
export function toDataUrl(base64: string, mimeType = "image/png"): string {
  if (base64.startsWith("data:")) {
    return base64;
  }
  return `data:${mimeType};base64,${base64}`;
}


