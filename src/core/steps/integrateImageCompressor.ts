/**
 * 集成 image-compressor 子项目
 * 
 * 遵循 L-Project 规范：父项目通过标准方式调用子项目的 Core
 * 
 * 功能：
 * - 所有图片在上传到 Supabase Storage 前压缩到 4MB 以下
 * - 支持 File、Blob、base64、dataURL 多种输入格式
 * - 每个图片只压缩一次
 */

import {
  compressImage,
  type CompressImageInput,
  type CompressImageOutput,
} from "@internal/image-compressor";

// ==================== 常量 ====================

/** 目标大小：4MB */
export const TARGET_SIZE = 4 * 1024 * 1024;

// ==================== 类型重导出 ====================

export type { CompressImageInput, CompressImageOutput };

// ==================== 工具函数 ====================

/**
 * 根据 base64 内容推断 MIME 类型
 */
function inferMimeType(base64: string): string {
  if (base64.startsWith("data:")) {
    const match = base64.match(/^data:(image\/\w+);base64,/);
    if (match) return match[1];
  }
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBORw")) return "image/png";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/png"; // 默认
}

/**
 * 将 base64 字符串转换为 Blob
 */
function base64ToBlob(base64: string): Blob {
  // 移除 data URL 前缀（如果存在）
  let base64Data = base64;
  let mimeType = "image/png";
  
  if (base64.startsWith("data:")) {
    const match = base64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }
  } else {
    mimeType = inferMimeType(base64);
  }
  
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * 将 dataURL 转换为 Blob
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid dataURL format");
  }
  
  const mimeType = match[1];
  const base64Data = match[2];
  
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// ==================== 压缩函数 ====================

/**
 * 压缩 File 对象
 * 
 * @param file - 原始文件
 * @returns 压缩后的 Blob（如果已小于目标大小则直接返回原文件）
 */
export async function compressFile(file: File): Promise<Blob> {
  // 小于目标大小，直接返回
  if (file.size <= TARGET_SIZE) {
    console.log(`[ImageCompressor] 文件已小于 ${TARGET_SIZE / 1024 / 1024}MB，无需压缩: ${(file.size / 1024).toFixed(1)}KB`);
    return file;
  }
  
  console.log(`[ImageCompressor] 开始压缩文件: ${(file.size / 1024 / 1024).toFixed(2)}MB → 目标 <${TARGET_SIZE / 1024 / 1024}MB`);
  
  const result = await compressImage({
    image: file,
    targetSize: TARGET_SIZE,
  });
  
  console.log(`[ImageCompressor] 压缩完成: ${(result.originalSize / 1024 / 1024).toFixed(2)}MB → ${(result.finalSize / 1024 / 1024).toFixed(2)}MB (${(result.compressionRatio * 100).toFixed(1)}%)`);
  
  return result.blob;
}

/**
 * 压缩 Blob 对象
 * 
 * @param blob - 原始 Blob
 * @returns 压缩后的 Blob（如果已小于目标大小则直接返回）
 */
export async function compressBlob(blob: Blob): Promise<Blob> {
  // 小于目标大小，直接返回
  if (blob.size <= TARGET_SIZE) {
    console.log(`[ImageCompressor] Blob 已小于 ${TARGET_SIZE / 1024 / 1024}MB，无需压缩: ${(blob.size / 1024).toFixed(1)}KB`);
    return blob;
  }
  
  console.log(`[ImageCompressor] 开始压缩 Blob: ${(blob.size / 1024 / 1024).toFixed(2)}MB → 目标 <${TARGET_SIZE / 1024 / 1024}MB`);
  
  const result = await compressImage({
    image: blob,
    targetSize: TARGET_SIZE,
  });
  
  console.log(`[ImageCompressor] 压缩完成: ${(result.originalSize / 1024 / 1024).toFixed(2)}MB → ${(result.finalSize / 1024 / 1024).toFixed(2)}MB (${(result.compressionRatio * 100).toFixed(1)}%)`);
  
  return result.blob;
}

/**
 * 压缩 base64 字符串，返回压缩后的 Blob
 * 
 * @param base64 - base64 编码的图片（可带或不带 data URL 前缀）
 * @returns 压缩后的 Blob
 */
export async function compressBase64(base64: string): Promise<Blob> {
  const blob = base64ToBlob(base64);
  return compressBlob(blob);
}

/**
 * 压缩 dataURL，返回压缩后的 Blob
 * 
 * @param dataUrl - 完整的 dataURL（data:image/xxx;base64,...）
 * @returns 压缩后的 Blob
 */
export async function compressDataUrl(dataUrl: string): Promise<Blob> {
  const blob = dataUrlToBlob(dataUrl);
  return compressBlob(blob);
}
