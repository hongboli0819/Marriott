/**
 * L-Core 输入/输出类型定义
 */

/**
 * 差异检测配置
 */
export interface DiffConfig {
  /** 
   * 颜色差异阈值（0-255）
   * RGB 三通道差值之和超过此值认为是差异
   * 默认 30，较高值可过滤压缩噪声
   */
  threshold: number;

  /**
   * 最小差异区域面积（像素数）
   * 小于此值的差异区域会被忽略
   * 默认 100
   */
  minAreaSize: number;

  /**
   * 膨胀半径（像素）
   * 用于连接邻近的差异像素
   * 默认 3
   */
  dilateRadius: number;

  /**
   * 边界框内边距（像素）
   * 在检测到的区域外扩展此距离
   * 默认 5
   */
  boundingBoxPadding: number;

  /**
   * 差异高亮颜色
   * 默认红色
   */
  highlightColor: string;

  /**
   * 是否启用行分组
   * 默认 true
   */
  enableLineGrouping: boolean;

  /**
   * 行分组 Y 重叠阈值
   * 默认 0.4（40%）
   */
  lineOverlapThreshold: number;

  /**
   * 是否启用 OCR 识别
   * 默认 false（需要手动触发）
   */
  enableOcr: boolean;

  /**
   * OCR 语言
   * 默认 "chi_sim+eng"（中文简体 + 英文）
   */
  ocrLanguage: string;

  /**
   * 是否启用行合并后处理
   * 合并重叠或相邻的行
   * 默认 true
   */
  enableLineMerge: boolean;

  /**
   * 行合并的中心点 Y 差异阈值（像素）
   * 中心点 Y 差异小于此值的行会被合并
   * 默认 30
   */
  lineMergeCenterYThreshold: number;

  /**
   * 行合并的 Y 重叠比例阈值
   * Y 范围重叠比例超过此值的行会被合并
   * 默认 0.3（30%）
   */
  lineMergeOverlapThreshold: number;

  /**
   * X 距离阈值（像素）
   * 两个区域的 X 间距超过此值时，不归为同一行
   * 用于防止远距离噪声块"桥接"不同行
   * 默认 20
   */
  maxXGap: number;
}

/**
 * 像素点
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * 边界框
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 差异区域
 */
export interface DiffRegion {
  /** 区域 ID */
  id: number;
  /** 边界框 */
  boundingBox: BoundingBox;
  /** 区域内像素数量 */
  pixelCount: number;
  /** 区域中心点 */
  center: Point;
}

/**
 * 像素差异计算输入
 */
export interface ComputePixelDiffInput {
  /** 原图（base64 DataURL 或 ImageData） */
  imageA: string | ImageData;
  /** 新图（base64 DataURL 或 ImageData） */
  imageB: string | ImageData;
  /** 差异阈值 */
  threshold?: number;
}

/**
 * 像素差异计算输出
 */
export interface ComputePixelDiffOutput {
  /** 差异掩码（二值图像 ImageData） */
  diffMask: ImageData;
  /** 差异像素数量 */
  diffPixelCount: number;
  /** 图像尺寸 */
  size: { width: number; height: number };
}

/**
 * 区域聚类输入
 */
export interface ClusterDiffRegionsInput {
  /** 差异掩码 */
  diffMask: ImageData;
  /** 膨胀半径 */
  dilateRadius?: number;
  /** 最小区域面积 */
  minAreaSize?: number;
}

/**
 * 区域聚类输出
 */
export interface ClusterDiffRegionsOutput {
  /** 差异区域列表 */
  regions: DiffRegion[];
  /** 带标签的掩码（每个区域用不同值标识） */
  labeledMask: ImageData;
}

/**
 * 图像差异检测主流程输入
 */
export interface RunImageDiffInput {
  /** 原图（base64 DataURL） */
  imageA: string;
  /** 新图（base64 DataURL） */
  imageB: string;
  /** 配置（可选） */
  config?: Partial<DiffConfig>;
  /** 
   * 参考文字（wording）
   * 如果提供，将使用 Dify 进行文字识别（替代 OCR）
   * 用户输入的多行文字，作为 AI 识别的参考
   */
  wording?: string;
}

/**
 * RGB 颜色类型
 */
export type RGBColor = [number, number, number];

/**
 * 行分组信息
 */
export interface LineGroupInfo {
  /** 行号（从上到下，从 0 开始） */
  lineIndex: number;
  /** 该行包含的区域 ID 列表 */
  regionIds: number[];
  /** 合并后的边界框（包含整行） */
  boundingBox: BoundingBox;
  /** 识别出的文字（OCR 后填充） */
  recognizedText?: string;
  /** OCR 置信度（0-100） */
  confidence?: number;
  /** 该行边框的颜色（RGB，用于区分不同行） */
  lineColor?: RGBColor;
  /** 该行差异内容的主色调（从原图提取） */
  contentColor?: RGBColor;
  /** 该行的白底预览图（dataUrl） */
  linePreviewImage?: string;
}

/**
 * 图像差异检测主流程输出
 */
export interface RunImageDiffOutput {
  /** 差异区域列表 */
  regions: DiffRegion[];
  /** 差异可视化图（在原图上标注差异区域） */
  visualizedImage: string;
  /** 差异掩码图（高亮显示所有差异像素） */
  diffMaskImage: string;
  /** 差异像素总数 */
  totalDiffPixels: number;
  /** 图像尺寸 */
  imageSize: { width: number; height: number };
  /** 按行分组的结果 */
  lines?: LineGroupInfo[];
  /** OCR 识别的全部文字（按行拼接） */
  fullText?: string;
  /** 重建图（在原图 Before 上用 OCR 文字绘制） */
  reconstructedImage?: string;
}

