// 上传的图片
export interface UploadedImage {
  id: string;
  file: File;
  preview: string;  // base64 预览
  base64: string;   // 用于 API 调用的 base64 数据（不含前缀）
  mimeType: string;
}

// 生成的图片
export interface GeneratedImage {
  id: string;
  base64: string;
  text?: string;      // AI 返回的文字说明
  timestamp: number;
}

// 宽高比选项
export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3" | "21:9";

// 分辨率选项
export type ImageSize = "1K" | "2K" | "4K";

// 生成请求
export interface GenerateRequest {
  prompt: string;
  images: {
    base64: string;
    mimeType: string;
  }[];
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
}

// API 响应
export interface GenerateResponse {
  success: boolean;
  imageBase64?: string;
  text?: string;
  error?: string;
}

// 宽高比配置
export const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: "1:1", label: "1:1 (正方形)" },
  { value: "16:9", label: "16:9 (横屏)" },
  { value: "9:16", label: "9:16 (竖屏)" },
  { value: "4:3", label: "4:3 (标准)" },
  { value: "3:4", label: "3:4 (竖版)" },
  { value: "3:2", label: "3:2 (相机)" },
  { value: "2:3", label: "2:3 (竖版相机)" },
  { value: "21:9", label: "21:9 (超宽)" },
];

// 分辨率配置
export const IMAGE_SIZES: { value: ImageSize; label: string }[] = [
  { value: "1K", label: "1K (标准)" },
  { value: "2K", label: "2K (高清)" },
  { value: "4K", label: "4K (超高清)" },
];
