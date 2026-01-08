/**
 * 应用字体配置
 * 将全局配置和行级配置合并
 */

import { FontConfig, EditableLine, DEFAULT_FONT_CONFIG } from "../types/io";

/**
 * 合并全局字体配置和行级字体配置
 */
export function applyFontConfig(
  line: EditableLine,
  globalConfig?: Partial<FontConfig>
): FontConfig {
  return {
    ...DEFAULT_FONT_CONFIG,
    ...(globalConfig || {}),
    ...(line.fontConfig || {}),
  };
}

