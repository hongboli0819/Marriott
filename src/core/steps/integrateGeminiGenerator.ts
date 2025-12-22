/**
 * 集成 gemini-image-generator 子项目
 * 
 * 遵循 L-Project 规范：父项目通过标准方式调用子项目的 Core
 * 
 * 支持两种模式：
 * 1. 同步模式（直接调用子项目，用于本地测试）
 * 2. 异步轮询模式（通过 Edge Function，用于生产环境）
 */

import {
  runProject as runGeminiGenerator,
  type RunProjectInput as GeminiInput,
  type RunProjectOutput as GeminiOutput,
  type ImageData,
  type AspectRatio,
} from "@internal/gemini-image-generator";

import { executeAsyncTaskBatch, type SubmitTaskInput } from "../services/asyncTaskService";

// ==================== 类型重导出 ====================

export type { GeminiInput, GeminiOutput, ImageData, AspectRatio };

// ==================== 核心上下文（可选） ====================

interface CoreContext {
  logger?: {
    info?: (message: string, data?: unknown) => void;
    warn?: (message: string, data?: unknown) => void;
    error?: (message: string, data?: unknown) => void;
    debug?: (message: string, data?: unknown) => void;
  };
}

// ==================== 宽高比映射 ====================

/** 
 * 将父项目的尺寸格式转换为子项目的 AspectRatio
 * 父项目格式：'1024x1024' | '1536x1024' | '1024x1536' | '1920x1080' | '1080x1920'
 * 子项目格式：'1:1' | '16:9' | '9:16' | '3:2' | '2:3'
 */
export function mapSizeToAspectRatio(size: string): AspectRatio {
  const mapping: Record<string, AspectRatio> = {
    "1024x1024": "1:1",
    "1536x1024": "3:2",
    "1024x1536": "2:3",
    "1920x1080": "16:9",
    "1080x1920": "9:16",
  };
  return mapping[size] || "1:1";
}

// ==================== 主集成函数 ====================

export interface GenerateDesignImagesInput {
  /** 用户确认的文案（用于日志，暂不参与生成） */
  confirmedText: string;
  
  /** 参考图片 URL 列表 */
  referenceImageUrls: string[];
  
  /** 用户选择的尺寸（父项目格式） */
  size: string;
  
  /** 自定义提示词（可选） */
  customPrompt?: string;
  
  /** 生成数量（默认 3） */
  count?: number;
  
  /** 对话ID（异步模式必需） */
  conversationId?: string;
  
  /** 任务类型（异步模式必需） */
  taskType?: "gemini-image-step1" | "gemini-image-step2";
}

export interface GenerateDesignImagesOutput {
  success: boolean;
  /** 生成的图片 base64 列表 */
  generatedImages: string[];
  /** 成功数量 */
  successCount: number;
  /** 总数量 */
  totalCount: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 默认提示词 - 用于"提供设计参考图"模式的第一步
 */
export const DEFAULT_REFERENCE_IMAGE_PROMPT = `请你基于输入的参考图，提取和学习其中的设计思路，然后请你设计一个背景图，背景图的中心要有大面积的留白，这个留白的部分后续会设计花字，所以你要有足够多的留白，然后确保背景图上没有任何的文字，也就是生成无文字版的图。`;

/**
 * 检查字符串是否是 base64 编码的图片
 */
function isBase64Image(str: string): boolean {
  // 检查是否以常见的 base64 图片开头
  // JPEG: /9j/
  // PNG: iVBORw
  // GIF: R0lGOD
  // WebP: UklGR
  return /^(\/9j\/|iVBORw|R0lGOD|UklGR|data:image\/)/.test(str);
}

/**
 * 根据 base64 内容推断 MIME 类型
 */
function inferMimeTypeFromBase64(base64: string): string {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBORw")) return "image/png";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/png"; // 默认
}

/**
 * 将 URL 或 base64 字符串转换为 ImageData
 */
async function urlToImageData(urlOrBase64: string): Promise<ImageData | null> {
  try {
    // 如果已经是 base64 字符串，直接返回
    if (isBase64Image(urlOrBase64)) {
      // 处理 data URL 格式
      if (urlOrBase64.startsWith("data:image/")) {
        const match = urlOrBase64.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          return { base64: match[2], mimeType: match[1] };
        }
      }
      
      // 纯 base64 字符串
      const mimeType = inferMimeTypeFromBase64(urlOrBase64);
      console.log(`[integrateGemini] 检测到 base64 图片，类型: ${mimeType}`);
      return { base64: urlOrBase64, mimeType };
    }
    
    // 否则是 URL，需要 fetch
    console.log(`[integrateGemini] 开始获取图片: ${urlOrBase64.substring(0, 100)}...`);
    const response = await fetch(urlOrBase64);
    if (!response.ok) {
      console.error(`[integrateGemini] 获取图片失败: ${urlOrBase64}`, response.status);
      return null;
    }
    
    const blob = await response.blob();
    const mimeType = blob.type || "image/png";
    
    // 转换为 base64
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );
    
    return { base64, mimeType };
  } catch (error) {
    console.error(`[integrateGemini] 转换图片失败: ${urlOrBase64.substring(0, 100)}...`, error);
    return null;
  }
}

/**
 * 生成设计图片
 * 
 * 封装对 gemini-image-generator 子项目的调用
 */
export async function generateDesignImages(
  input: GenerateDesignImagesInput,
  ctx?: CoreContext
): Promise<GenerateDesignImagesOutput> {
  const { logger } = ctx || {};
  
  logger?.info?.("[integrateGemini] 开始生成设计图片", {
    confirmedText: input.confirmedText.substring(0, 50) + "...",
    referenceImagesCount: input.referenceImageUrls.length,
    size: input.size,
    count: input.count || 3,
    firstRefImageType: input.referenceImageUrls[0] ? 
      (isBase64Image(input.referenceImageUrls[0]) ? "base64" : "url") : "none",
  });

  try {
    // 1. 转换参考图片 URL 为 base64
    const imageDataPromises = input.referenceImageUrls.map(urlToImageData);
    const imageDataResults = await Promise.all(imageDataPromises);
    const referenceImages = imageDataResults.filter((img): img is ImageData => img !== null);
    
    if (referenceImages.length === 0 && input.referenceImageUrls.length > 0) {
      logger?.warn?.("[integrateGemini] 所有参考图片转换失败");
      return {
        success: false,
        generatedImages: [],
        successCount: 0,
        totalCount: input.count || 3,
        error: "参考图片加载失败",
      };
    }
    
    logger?.debug?.("[integrateGemini] 参考图片转换完成", {
      converted: referenceImages.length,
      total: input.referenceImageUrls.length,
    });

    // 2. 构建子项目输入
    const geminiInput: GeminiInput = {
      prompt: input.customPrompt || DEFAULT_REFERENCE_IMAGE_PROMPT,
      referenceImages,
      aspectRatio: mapSizeToAspectRatio(input.size),
      resolution: "1K",
      count: input.count || 3,
    };

    // 3. 调用子项目
    const result = await runGeminiGenerator(geminiInput, ctx as any);

    logger?.info?.("[integrateGemini] 生成完成", {
      success: result.success,
      successCount: result.successCount,
      totalCount: result.totalCount,
    });

    // 4. 转换输出
    return {
      success: result.success,
      generatedImages: result.generatedImages.map(img => img.base64),
      successCount: result.successCount,
      totalCount: result.totalCount,
      error: result.error,
    };
  } catch (error) {
    logger?.error?.("[integrateGemini] 生成失败", { error });
    
    return {
      success: false,
      generatedImages: [],
      successCount: 0,
      totalCount: input.count || 3,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

// ==================== 直接调用模式（推荐） ====================

/** Edge Function URL */
const GEMINI_IMAGE_URL = "https://qqlwechtvktkhuheoeja.supabase.co/functions/v1/gemini-image";

/** 最大重试次数 */
const MAX_RETRIES = 3;

/** 
 * 延迟函数 
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 直接调用 gemini-image Edge Function（带重试）
 */
async function callGeminiImageDirect(
  prompt: string,
  images: Array<{ base64: string; mimeType: string }>,
  aspectRatio: string,
  imageSize: string,
  index: number
): Promise<{ success: boolean; imageBase64?: string; error?: string }> {
  let lastError = "未知错误";
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[integrateGemini] 直接调用 gemini-image [${index}] (尝试 ${attempt}/${MAX_RETRIES})`);
      
      const response = await fetch(GEMINI_IMAGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          images,
          aspectRatio,
          imageSize,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = `HTTP ${response.status}: ${errorText}`;
        console.warn(`[integrateGemini] 调用失败 [${index}] (尝试 ${attempt}): ${lastError}`);
        
        if (attempt < MAX_RETRIES) {
          const delayMs = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
          await delay(delayMs);
          continue;
        }
        return { success: false, error: lastError };
      }

      const result = await response.json();
      
      if (result.success && result.imageBase64) {
        console.log(`[integrateGemini] ✅ 生成成功 [${index}]`);
        return { success: true, imageBase64: result.imageBase64 };
      }
      
      return { success: false, error: result.error || "未能生成图片" };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "网络错误";
      console.warn(`[integrateGemini] 调用异常 [${index}] (尝试 ${attempt}): ${lastError}`);
      
      if (attempt < MAX_RETRIES) {
        const delayMs = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
        await delay(delayMs);
        continue;
      }
    }
  }
  
  return { success: false, error: lastError };
}

/**
 * 直接调用模式生成设计图片（推荐）
 * 
 * 🚀 优势：
 * 1. 不经过 async_tasks 数据库，无数据库读写延迟
 * 2. 直接调用 gemini-image Edge Function
 * 3. 交错并发（1秒间隔），避免 API 过载
 * 4. 本地缓存结果，异步保存到数据库
 * 
 * @param input - 生成输入
 * @param onProgress - 进度回调 (completed, total)
 * @returns 生成结果
 */
export async function generateDesignImagesDirect(
  input: GenerateDesignImagesInput,
  onProgress?: (completed: number, total: number) => void
): Promise<GenerateDesignImagesOutput> {
  const totalCount = input.count || 3;
  
  console.log("[integrateGemini] 使用直接调用模式（无数据库）");
  console.log(`[integrateGemini] 策略: 交错并发 ${totalCount} 个请求，间隔 1 秒`);

  try {
    // 1. 转换参考图片 URL 为 base64
    const imageDataPromises = input.referenceImageUrls.map(urlToImageData);
    const imageDataResults = await Promise.all(imageDataPromises);
    const referenceImages = imageDataResults.filter((img): img is ImageData => img !== null);
    
    if (referenceImages.length === 0 && input.referenceImageUrls.length > 0) {
      console.warn("[integrateGemini] 所有参考图片转换失败");
      return {
        success: false,
        generatedImages: [],
        successCount: 0,
        totalCount,
        error: "参考图片加载失败",
      };
    }
    
    console.log(`[integrateGemini] 参考图片转换完成: ${referenceImages.length}/${input.referenceImageUrls.length}`);

    // 2. 准备请求参数
    const prompt = input.customPrompt || DEFAULT_REFERENCE_IMAGE_PROMPT;
    const images = referenceImages.map(img => ({
      base64: img.base64,
      mimeType: img.mimeType,
    }));
    const aspectRatio = mapSizeToAspectRatio(input.size);
    const imageSize = "1K";

    // 3. 交错并发调用（间隔 1 秒启动，避免 API 过载）
    const generatedImages: string[] = [];
    let successCount = 0;
    let completed = 0;
    const errors: string[] = [];

    // 创建所有 Promise（交错启动）
    const promises: Promise<void>[] = [];
    
    for (let i = 0; i < totalCount; i++) {
      const promise = (async () => {
        // 交错延迟：第 i 个请求延迟 i 秒启动
        if (i > 0) {
          await delay(i * 1000);
        }
        
        const result = await callGeminiImageDirect(prompt, images, aspectRatio, imageSize, i);
        
        completed++;
        onProgress?.(completed, totalCount);
        
        if (result.success && result.imageBase64) {
          generatedImages.push(result.imageBase64);
          successCount++;
        } else {
          errors.push(result.error || "未知错误");
        }
      })();
      
      promises.push(promise);
    }

    // 等待所有请求完成
    await Promise.all(promises);

    console.log("[integrateGemini] 直接调用完成", {
      successCount,
      totalCount,
      errors: errors.length > 0 ? errors : undefined,
    });

    return {
      success: successCount > 0,
      generatedImages,
      successCount,
      totalCount,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  } catch (error) {
    console.error("[integrateGemini] 直接调用失败", error);
    
    return {
      success: false,
      generatedImages: [],
      successCount: 0,
      totalCount,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}

// ==================== 异步轮询模式（旧模式，保留兼容） ====================

/**
 * 使用异步轮询模式生成设计图片（批量模式）
 * 
 * ⚠️ 旧模式，涉及数据库读写，较慢
 * 推荐使用 generateDesignImagesDirect
 * 
 * 策略：每个任务只生成 1 张图片，提交多个独立任务并行执行
 * 
 * @param input - 生成输入
 * @param onProgress - 进度回调
 * @returns 生成结果
 */
export async function generateDesignImagesAsync(
  input: GenerateDesignImagesInput,
  onProgress?: (status: string) => void
): Promise<GenerateDesignImagesOutput> {
  const totalCount = input.count || 3;
  
  console.log("[integrateGemini] 使用异步轮询模式（批量）- 旧模式");
  console.log(`[integrateGemini] 策略: 提交 ${totalCount} 个独立任务，每个生成 1 张图片`);
  
  if (!input.conversationId) {
    return {
      success: false,
      generatedImages: [],
      successCount: 0,
      totalCount,
      error: "缺少 conversationId",
    };
  }

  try {
    // 1. 转换参考图片 URL 为 base64
    const imageDataPromises = input.referenceImageUrls.map(urlToImageData);
    const imageDataResults = await Promise.all(imageDataPromises);
    const referenceImages = imageDataResults.filter((img): img is ImageData => img !== null);
    
    if (referenceImages.length === 0 && input.referenceImageUrls.length > 0) {
      console.warn("[integrateGemini] 所有参考图片转换失败");
      return {
        success: false,
        generatedImages: [],
        successCount: 0,
        totalCount,
        error: "参考图片加载失败",
      };
    }
    
    console.log(`[integrateGemini] 参考图片转换完成: ${referenceImages.length}/${input.referenceImageUrls.length}`);

    // 2. 构建异步任务输入
    const taskInput: SubmitTaskInput = {
      taskType: input.taskType || "gemini-image-step1",
      conversationId: input.conversationId,
      prompt: input.customPrompt || DEFAULT_REFERENCE_IMAGE_PROMPT,
      images: referenceImages.map(img => ({
        base64: img.base64,
        mimeType: img.mimeType,
      })),
      aspectRatio: mapSizeToAspectRatio(input.size),
      imageSize: "1K",
      count: totalCount,  // 总数，批量模式会拆分成多个单任务
    };

    // 3. 执行批量异步任务（每个任务生成 1 张，自动轮询）
    const result = await executeAsyncTaskBatch(taskInput, (status) => {
      onProgress?.(status);
    });

    console.log("[integrateGemini] 批量异步任务完成", {
      success: result.success,
      successCount: result.successCount,
      totalCount: result.totalCount,
    });

    return {
      success: result.success,
      generatedImages: result.generatedImages,
      successCount: result.successCount,
      totalCount: result.totalCount,
      error: result.error,
    };
  } catch (error) {
    console.error("[integrateGemini] 批量异步生成失败", error);
    
    return {
      success: false,
      generatedImages: [],
      successCount: 0,
      totalCount,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}
