/**
 * 模版提取器 - 输入/输出类型定义
 */

// ==================== 基础类型 ====================

/** 支持的宽高比 */
export type SupportedAspectRatio =
  | "1:1"
  | "2:3"
  | "3:2"
  | "3:4"
  | "4:3"
  | "4:5"
  | "5:4"
  | "9:16"
  | "16:9"
  | "21:9";

/** 分辨率 */
export type ImageResolution = "1K" | "2K" | "4K";

/** 宽高比配置 */
export interface AspectRatioConfig {
  ratio: SupportedAspectRatio;
  value: number;
  label: string;
}

/** 宽高比配置列表 */
export const ASPECT_RATIO_CONFIG: AspectRatioConfig[] = [
  { ratio: "1:1", value: 1, label: "1:1 正方形" },
  { ratio: "2:3", value: 2 / 3, label: "2:3 竖版" },
  { ratio: "3:2", value: 3 / 2, label: "3:2 横版" },
  { ratio: "3:4", value: 3 / 4, label: "3:4 竖版" },
  { ratio: "4:3", value: 4 / 3, label: "4:3 横版" },
  { ratio: "4:5", value: 4 / 5, label: "4:5 竖版" },
  { ratio: "5:4", value: 5 / 4, label: "5:4 横版" },
  { ratio: "9:16", value: 9 / 16, label: "9:16 竖屏" },
  { ratio: "16:9", value: 16 / 9, label: "16:9 横屏" },
  { ratio: "21:9", value: 21 / 9, label: "21:9 超宽" },
];

// ==================== 文字区域 ====================

/** 边界框 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 点 */
export interface Point {
  x: number;
  y: number;
}

/** RGB 颜色 */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/** 文字区域信息 */
export interface TextRegion {
  /** 区域 ID */
  id: number;
  /** 边界框 */
  boundingBox: BoundingBox;
  /** 中心点 */
  center: Point;
  /** 识别的文字内容 */
  text?: string;
  /** 文字颜色 */
  color?: RGBColor;
  /** 字体大小（估算） */
  fontSize?: number;
}

/** 行信息 */
export interface LineInfo {
  /** 行索引 */
  lineIndex: number;
  /** 行边界框 */
  boundingBox: BoundingBox;
  /** 行内的文字区域 */
  regions: TextRegion[];
  /** 识别的行文字 */
  text?: string;
  /** 主要颜色 */
  dominantColor?: RGBColor;
}

/** Canvas 文字对象（用于编辑器） */
export interface CanvasTextObject {
  id: string;
  type: "text";
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fill: string;
  textAlign: "left" | "center" | "right";
}

// ==================== 处理进度 ====================

/** 处理阶段 */
export type ProcessingStage =
  | "idle"
  | "analyzing"           // 分析宽高比
  | "copying"             // 第一轮：复制
  | "removing-text"       // 第二轮：剔除文字
  | "diff-analyzing"      // 第三轮：差异分析
  | "completed"
  | "failed";

/** 进度信息 */
export interface ProgressInfo {
  stage: ProcessingStage;
  progress: number;        // 0-100
  message: string;
}

/** 进度回调类型 */
export type ProgressCallback = (info: ProgressInfo) => void;

// ==================== 主函数输入/输出 ====================

/** runTemplateExtraction 输入 */
export interface TemplateExtractionInput {
  /** 原始图片（base64 DataURL 或 URL） */
  sourceImage: string;
  
  /** 分辨率（默认 "4K"） */
  resolution?: ImageResolution;
  
  /** 进度回调 */
  onProgress?: ProgressCallback;
}

/** 各阶段耗时 */
export interface TimingInfo {
  analyze: number;
  copy: number;
  removeText: number;
  diffAnalysis: number;
  total: number;
}

/** runTemplateExtraction 输出 */
export interface TemplateExtractionOutput {
  /** 是否成功 */
  success: boolean;
  
  /** 原始图片尺寸 */
  originalSize?: { width: number; height: number };
  
  /** 匹配的宽高比 */
  matchedAspectRatio?: SupportedAspectRatio;
  
  /** 第一轮结果：高质量复刻（有文字版） */
  copyImage?: string;
  
  /** 第二轮结果：无文字版（背景图） */
  backgroundImage?: string;
  
  /** 识别的行信息 */
  lines?: LineInfo[];
  
  /** 可编辑的 Canvas 文字对象 */
  canvasTextObjects?: CanvasTextObject[];
  
  /** 差异可视化图 */
  diffVisualization?: string;
  
  /** 重建图（在背景上绘制识别的文字） */
  reconstructedImage?: string;
  
  /** 错误信息 */
  error?: string;
  
  /** 各阶段耗时（毫秒） */
  timing?: TimingInfo;
}


