/**
 * 字体解析工具
 * 使用 opentype.js 解析字体文件元数据
 */

import opentype from "opentype.js";

export interface FontVariant {
  id: string;
  fileName: string;
  fontWeight: number;        // 100-900
  fontStyle: "normal" | "italic";
  blobUrl: string;           // 用于 @font-face
  loaded: boolean;           // 是否已加载到浏览器
}

export interface FontFamily {
  id: string;
  name: string;              // "GriffithGothic"
  displayName: string;       // "Griffith Gothic"
  variants: FontVariant[];   // 所有字重变体
  middleWeight: number;      // 计算出的中间字重
}

/**
 * 字体文件格式
 */
const FONT_EXTENSIONS = [".otf", ".ttf", ".woff", ".woff2"];

/**
 * 检查文件是否为字体文件
 */
export function isFontFile(fileName: string): boolean {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return FONT_EXTENSIONS.includes(ext);
}

/**
 * 解析字体文件，提取元数据
 */
export async function parseFontFile(file: File): Promise<{
  fontFamily: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
} | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const font = opentype.parse(arrayBuffer);

    // 获取字体家族名称
    let fontFamily = font.names.fontFamily?.en || font.names.fontFamily?.zh || "";
    if (!fontFamily) {
      // 从文件名推断
      fontFamily = file.name.replace(/\.(otf|ttf|woff|woff2)$/i, "");
    }

    // 获取字重
    let fontWeight = 400; // 默认 Regular
    if (font.tables.os2) {
      fontWeight = font.tables.os2.usWeightClass || 400;
    }

    // 从文件名推断字重（作为备用）
    const fileName = file.name.toLowerCase();
    if (fontWeight === 400) {
      if (fileName.includes("thin") || fileName.includes("hairline")) fontWeight = 100;
      else if (fileName.includes("extralight") || fileName.includes("ultralight")) fontWeight = 200;
      else if (fileName.includes("light")) fontWeight = 300;
      else if (fileName.includes("medium")) fontWeight = 500;
      else if (fileName.includes("semibold") || fileName.includes("demibold")) fontWeight = 600;
      else if (fileName.includes("extrabold") || fileName.includes("ultrabold")) fontWeight = 800;
      else if (fileName.includes("black") || fileName.includes("heavy")) fontWeight = 900;
      else if (fileName.includes("bold")) fontWeight = 700;
    }

    // 获取样式（正常/斜体）
    let fontStyle: "normal" | "italic" = "normal";
    if (font.tables.os2) {
      // fsSelection bit 0 = italic
      const fsSelection = font.tables.os2.fsSelection;
      if (fsSelection & 1) {
        fontStyle = "italic";
      }
    }
    // 从文件名推断样式
    if (fileName.includes("italic") || fileName.includes("oblique")) {
      fontStyle = "italic";
    }

    return {
      fontFamily,
      fontWeight,
      fontStyle,
    };
  } catch (error) {
    console.error("[fontParser] 解析字体文件失败:", file.name, error);
    return null;
  }
}

/**
 * 计算中间字重
 */
export function getMiddleWeight(weights: number[]): number {
  if (weights.length === 0) return 400;
  if (weights.length === 1) return weights[0];

  const sorted = [...weights].sort((a, b) => a - b);
  const middleIndex = Math.floor(sorted.length / 2);
  return sorted[middleIndex];
}

/**
 * 将字重数值转换为显示名称
 */
export function weightToName(weight: number): string {
  const weightNames: Record<number, string> = {
    100: "Thin",
    200: "Extra Light",
    300: "Light",
    400: "Regular",
    500: "Medium",
    600: "Semi Bold",
    700: "Bold",
    800: "Extra Bold",
    900: "Black",
  };
  return weightNames[weight] || `Weight ${weight}`;
}

/**
 * 动态注册字体到浏览器
 */
export async function registerFont(
  fontFamily: string,
  variant: FontVariant
): Promise<boolean> {
  try {
    const fontFace = new FontFace(fontFamily, `url(${variant.blobUrl})`, {
      weight: String(variant.fontWeight),
      style: variant.fontStyle,
    });

    await fontFace.load();
    document.fonts.add(fontFace);
    return true;
  } catch (error) {
    console.error("[fontParser] 注册字体失败:", fontFamily, variant.fileName, error);
    return false;
  }
}

/**
 * 批量处理字体文件，按家族分组
 */
export async function processFontFiles(files: File[]): Promise<FontFamily[]> {
  const familyMap = new Map<string, FontFamily>();

  for (const file of files) {
    if (!isFontFile(file.name)) continue;

    const metadata = await parseFontFile(file);
    if (!metadata) continue;

    const blobUrl = URL.createObjectURL(file);
    const variantId = `font-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const variant: FontVariant = {
      id: variantId,
      fileName: file.name,
      fontWeight: metadata.fontWeight,
      fontStyle: metadata.fontStyle,
      blobUrl,
      loaded: false,
    };

    // 获取或创建字体家族
    let family = familyMap.get(metadata.fontFamily);
    if (!family) {
      family = {
        id: `family-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: metadata.fontFamily,
        displayName: metadata.fontFamily.replace(/([A-Z])/g, " $1").trim(),
        variants: [],
        middleWeight: 400,
      };
      familyMap.set(metadata.fontFamily, family);
    }

    // 检查是否已存在相同字重的变体
    const existingIndex = family.variants.findIndex(
      (v) => v.fontWeight === variant.fontWeight && v.fontStyle === variant.fontStyle
    );
    if (existingIndex >= 0) {
      // 替换旧的
      URL.revokeObjectURL(family.variants[existingIndex].blobUrl);
      family.variants[existingIndex] = variant;
    } else {
      family.variants.push(variant);
    }
  }

  // 计算中间字重并注册字体
  const families = Array.from(familyMap.values());
  for (const family of families) {
    // 按字重排序
    family.variants.sort((a, b) => a.fontWeight - b.fontWeight);
    // 计算中间字重
    family.middleWeight = getMiddleWeight(family.variants.map((v) => v.fontWeight));
    // 注册所有字体
    for (const variant of family.variants) {
      const success = await registerFont(family.name, variant);
      variant.loaded = success;
    }
  }

  return families;
}


