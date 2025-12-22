/**
 * Supabase Storage 服务
 * 用于上传设计相关的图片
 * 
 * 所有图片在上传前会自动压缩到 4MB 以下
 */

import { 
  compressFile, 
  compressBase64, 
  compressDataUrl 
} from "@/core/steps/integrateImageCompressor";

// Supabase 配置
const SUPABASE_URL = "https://qqlwechtvktkhuheoeja.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbHdlY2h0dmt0a2h1aGVvZWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTk2OTgsImV4cCI6MjA3OTczNTY5OH0.yGSijURBrllzdHYSqnqA792GAapWW9tK3y_ukUfj4XQ";

const BUCKET_NAME = "design-images";

/**
 * 上传单个图片到 Supabase Storage（带重试）
 * @param file 图片文件
 * @param conversationId 对话 ID
 * @param mode 模式类型 (reference 或 template)
 * @param maxRetries 最大重试次数
 * @returns 图片的公开 URL
 */
export async function uploadDesignImage(
  file: File,
  conversationId: string,
  mode: 'reference' | 'template',
  maxRetries: number = 3
): Promise<string> {
  // 🔧 压缩图片到 4MB 以下
  const compressedBlob = await compressFile(file);
  
  // 生成唯一文件名
  const timestamp = Date.now();
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  // 压缩后可能变成 jpeg，更新扩展名
  const extension = compressedBlob.type === 'image/jpeg' ? 'jpg' : 
                    compressedBlob.type === 'image/webp' ? 'webp' : 
                    safeFileName.split('.').pop() || 'jpg';
  const baseName = safeFileName.replace(/\.[^/.]+$/, '');
  const filePath = `${conversationId}/${mode}/${timestamp}-${baseName}.${extension}`;

  console.log(`[Storage] Uploading image: ${filePath} (${(compressedBlob.size / 1024).toFixed(1)}KB)`);

  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 上传压缩后的文件
      const response = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${filePath}`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": compressedBlob.type || file.type,
            "x-upsert": "true",
          },
          body: compressedBlob,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`上传失败: ${response.status} - ${error}`);
      }

      // 构建公开 URL
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${filePath}`;
      console.log(`[Storage] Upload success: ${publicUrl}`);
      
      return publicUrl;
    } catch (error) {
      lastError = error as Error;
      console.warn(`[Storage] 上传失败 (尝试 ${attempt}/${maxRetries}):`, error);
      
      if (attempt < maxRetries) {
        // 指数退避重试
        const delay = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`[Storage] 等待 ${Math.round(delay)}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error("[Storage] 所有重试均失败:", lastError);
  throw lastError || new Error("上传失败");
}

/**
 * 批量上传图片
 * @param files 图片文件数组
 * @param conversationId 对话 ID
 * @param mode 模式类型
 * @returns 图片 URL 数组
 */
export async function uploadDesignImages(
  files: File[],
  conversationId: string,
  mode: 'reference' | 'template'
): Promise<string[]> {
  console.log(`[Storage] Uploading ${files.length} images...`);
  
  const uploadPromises = files.map((file) =>
    uploadDesignImage(file, conversationId, mode)
  );
  
  const urls = await Promise.all(uploadPromises);
  console.log(`[Storage] All ${urls.length} images uploaded successfully`);
  
  return urls;
}

/**
 * 将 File 对象转换为 base64 预览 URL（本地预览用）
 */
export function fileToPreviewUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ==================== Base64 图片上传 ====================

/**
 * 将 base64 字符串转换为 Blob
 */
function base64ToBlob(base64: string, mimeType: string = 'image/png'): Blob {
  // 移除 data URL 前缀（如果存在）
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

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
 * 获取 MIME 类型对应的文件扩展名
 */
function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return map[mimeType] || "png";
}

/**
 * 上传单个 base64 图片到 Supabase Storage
 * 
 * @param base64 - base64 编码的图片数据
 * @param conversationId - 对话 ID
 * @param step - 步骤标识 (step1 或 step2)
 * @param index - 图片索引
 * @returns 图片的公开 URL
 */
export async function uploadBase64Image(
  base64: string,
  conversationId: string,
  step: 'step1' | 'step2',
  index: number
): Promise<string> {
  // 🔧 压缩图片到 4MB 以下
  const compressedBlob = await compressBase64(base64);
  
  // 推断 MIME 类型和扩展名
  const mimeType = compressedBlob.type || inferMimeType(base64);
  const extension = getExtension(mimeType);
  
  // 生成唯一文件名
  const timestamp = Date.now();
  const filePath = `${conversationId}/generated/${step}/${timestamp}-${index}.${extension}`;

  console.log(`[Storage] Uploading base64 image: ${filePath} (${(compressedBlob.size / 1024).toFixed(1)}KB)`);

  // 上传压缩后的文件
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${filePath}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": mimeType,
        "x-upsert": "true",
      },
      body: compressedBlob,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("[Storage] Upload failed:", error);
    throw new Error(`上传失败: ${response.status}`);
  }

  // 构建公开 URL
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${filePath}`;
  console.log(`[Storage] Upload success: ${publicUrl}`);
  
  return publicUrl;
}

/**
 * 批量上传 base64 图片到 Supabase Storage
 * 
 * @param base64Images - base64 编码的图片数组
 * @param conversationId - 对话 ID
 * @param step - 步骤标识 (step1 或 step2)
 * @returns 图片 URL 数组
 */
export async function uploadBase64Images(
  base64Images: string[],
  conversationId: string,
  step: 'step1' | 'step2'
): Promise<string[]> {
  console.log(`[Storage] Uploading ${base64Images.length} base64 images for ${step}...`);
  
  const uploadPromises = base64Images.map((base64, index) =>
    uploadBase64Image(base64, conversationId, step, index)
  );
  
  const urls = await Promise.all(uploadPromises);
  console.log(`[Storage] All ${urls.length} images uploaded successfully`);
  
  return urls;
}

/**
 * 上传单个编辑后的图片到 Supabase Storage
 * 
 * 带重试机制，最多重试 3 次（共 4 次尝试）
 * 
 * @param dataUrl 图片 dataUrl（data:image/...）
 * @param conversationId 对话 ID
 * @param maxRetries 最大重试次数，默认 3
 * @returns 图片的公开 URL，失败返回 null
 */
export async function uploadEditedImage(
  dataUrl: string,
  conversationId: string,
  maxRetries: number = 3
): Promise<string | null> {
  // 从 dataUrl 提取扩展名用于文件命名
  const base64Match = dataUrl.match(/^data:image\/(\w+);base64,/);
  if (!base64Match) {
    console.error("[Storage] Invalid dataUrl format");
    return null;
  }
  
  // 🔧 压缩图片到 4MB 以下
  let compressedBlob: Blob;
  try {
    compressedBlob = await compressDataUrl(dataUrl);
  } catch (error) {
    console.error("[Storage] Compression failed:", error);
    return null;
  }
  
  // 获取扩展名（压缩后可能变为 jpeg）
  const mimeType = compressedBlob.type || `image/${base64Match[1]}`;
  const extension = getExtension(mimeType);
  
  // 生成唯一文件名（使用固定的 timestamp，重试时不会改变）
  const timestamp = Date.now();
  const filePath = `${conversationId}/edited/${timestamp}.${extension}`;
  
  console.log(`[Storage] Uploading edited image: ${filePath} (${(compressedBlob.size / 1024).toFixed(1)}KB)`);
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      // 上传压缩后的文件到 Storage
      const formData = new FormData();
      formData.append('', compressedBlob, filePath.split('/').pop());
      
      const response = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${filePath}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: formData,
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }
      
      // 返回公开 URL
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${filePath}`;
      console.log(`[Storage] Edited image uploaded: ${publicUrl}`);
      return publicUrl;
      
    } catch (error) {
      lastError = error as Error;
      console.warn(`[Storage] ⚠️ 上传失败 (尝试 ${attempt}/${maxRetries + 1}): ${lastError.message}`);
      
      if (attempt <= maxRetries) {
        // 指数退避 + 抖动
        const delay = 1000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`[Storage] ${Math.round(delay)}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error("[Storage] ❌ 上传失败，已达最大重试次数:", lastError?.message);
  return null;
}
