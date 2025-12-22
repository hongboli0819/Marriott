import type { GenerateRequest, GenerateResponse } from '../types';

// Supabase Edge Function URL
const EDGE_FUNCTION_URL = "https://qqlwechtvktkhuheoeja.supabase.co/functions/v1/gemini-image";

/**
 * 调用 Gemini API 生成图片
 */
export async function generateImage(request: GenerateRequest): Promise<GenerateResponse> {
  try {
    console.log('[geminiApi] 发送生成请求:', {
      prompt: request.prompt.substring(0, 50) + '...',
      imagesCount: request.images.length,
      aspectRatio: request.aspectRatio,
      imageSize: request.imageSize,
    });

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[geminiApi] HTTP 错误:', response.status, errorText);
      return {
        success: false,
        error: `请求失败: ${response.status}`,
      };
    }

    const result: GenerateResponse = await response.json();
    console.log('[geminiApi] 响应:', result.success ? '成功' : '失败');
    
    return result;
  } catch (error) {
    console.error('[geminiApi] 网络错误:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败',
    };
  }
}

/**
 * 将 File 转换为 base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 移除 data:image/xxx;base64, 前缀
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 下载 base64 图片
 */
export function downloadImage(base64: string, filename: string = 'generated-image.png'): void {
  const link = document.createElement('a');
  link.href = `data:image/png;base64,${base64}`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 下载多张图片
 */
export function downloadAllImages(images: { base64: string; index: number }[]): void {
  images.forEach((img, i) => {
    setTimeout(() => {
      downloadImage(img.base64, `generated-image-${img.index + 1}.png`);
    }, i * 500); // 间隔 500ms 下载，避免浏览器阻止
  });
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
