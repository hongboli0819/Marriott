/**
 * 集成 image-diff-tool 子项目
 * 
 * 用于分析背景图和效果图之间的文字差异，
 * 识别出文字位置和内容，供编辑器使用
 */

import {
  runImageDiff,
  linesToCanvasTextObjects,
  setConversationId,
  type RunImageDiffInput,
  type RunImageDiffOutput,
  type LineGroupInfo,
  type CanvasTextObject,
} from "@internal/image-diff-tool";

// 重新导出类型和配置函数供外部使用
export type { RunImageDiffOutput, LineGroupInfo, CanvasTextObject };
export { setConversationId };

/**
 * 文字差异分析输入
 */
export interface TextDiffAnalysisInput {
  /** 背景图 URL 或 base64 */
  backgroundImage: string;
  /** 效果图 URL 或 base64 */
  effectImage: string;
  /** 用户确认的文案（用于 Dify AI 识别） */
  confirmedText: string;
}

/**
 * 文字差异分析输出
 */
export interface TextDiffAnalysisOutput {
  /** 是否成功 */
  success: boolean;
  /** 重建图（在背景图上绘制识别的文字） */
  reconstructedImage?: string;
  /** 行信息（含识别文字、位置、颜色） */
  lines?: LineGroupInfo[];
  /** 识别的全文 */
  fullText?: string;
  /** Canvas 文字对象（可直接用于编辑器） */
  canvasTextObjects?: CanvasTextObject[];
  /** 原始差异分析结果 */
  rawResult?: RunImageDiffOutput;
  /** 错误信息 */
  error?: string;
}

/**
 * 将图片 URL 转换为 base64 DataURL
 */
async function imageUrlToDataUrl(url: string): Promise<string> {
  // 如果已经是 data URL，直接返回
  if (url.startsWith('data:')) {
    return url;
  }
  
  // 如果是 base64 字符串（不含前缀），添加前缀
  if (url.startsWith('/9j/')) {
    return `data:image/jpeg;base64,${url}`;
  }
  if (url.startsWith('iVBOR')) {
    return `data:image/png;base64,${url}`;
  }
  
  // 否则是 URL，需要 fetch
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("[integrateImageDiff] Failed to fetch image:", error);
    throw error;
  }
}

/**
 * 执行文字差异分析
 * 
 * 调用 image-diff-tool 的 runImageDiff 函数，
 * 分析背景图和效果图之间的差异，识别出添加的文字
 */
export async function runTextDiffAnalysis(
  input: TextDiffAnalysisInput
): Promise<TextDiffAnalysisOutput> {
  const { backgroundImage, effectImage, confirmedText } = input;
  
  console.log("[integrateImageDiff] 开始文字差异分析...");
  
  try {
    // 转换图片为 DataURL
    console.log("[integrateImageDiff] 转换图片为 DataURL...");
    const [imageA, imageB] = await Promise.all([
      imageUrlToDataUrl(backgroundImage),
      imageUrlToDataUrl(effectImage),
    ]);
    
    console.log("[integrateImageDiff] 调用 runImageDiff...");
    
    // 调用 image-diff-tool
    const diffInput: RunImageDiffInput = {
      imageA,
      imageB,
      wording: confirmedText,
      config: {
        threshold: 50,           // 较敏感的差异检测
        minAreaSize: 10,
        enableLineGrouping: true,
        lineOverlapThreshold: 0.4,
      },
    };
    
    const result = await runImageDiff(diffInput, {
      adapters: {
        logger: console,
      },
    });
    
    console.log("[integrateImageDiff] 分析完成:", {
      regions: result.regions.length,
      lines: result.lines?.length || 0,
      fullText: result.fullText?.substring(0, 50) + "...",
    });
    
    // 转换为 Canvas 文字对象
    let canvasTextObjects: CanvasTextObject[] = [];
    if (result.lines && result.lines.length > 0) {
      canvasTextObjects = linesToCanvasTextObjects(result.lines);
    }
    
    return {
      success: true,
      reconstructedImage: result.reconstructedImage,
      lines: result.lines,
      fullText: result.fullText,
      canvasTextObjects,
      rawResult: result,
    };
  } catch (error) {
    console.error("[integrateImageDiff] 分析失败:", error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : "差异分析失败",
    };
  }
}
