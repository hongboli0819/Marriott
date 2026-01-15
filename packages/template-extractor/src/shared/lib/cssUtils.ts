/**
 * CSS 工具函数
 * 用于在 Canvas (Fabric.js) 中使用 CSS 变量定义的颜色
 */

/**
 * 获取 CSS 变量值
 * @param name CSS 变量名（带或不带 -- 前缀）
 */
export function getCssVariable(name: string): string {
  const varName = name.startsWith("--") ? name : `--${name}`;
  return getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
}

/**
 * 将 HSL 字符串转换为带透明度的 hsla 格式
 * @param hsl HSL 值，格式如 "142 76% 36%"
 * @param alpha 透明度 0-1
 */
export function hslToHsla(hsl: string, alpha: number): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length !== 3) {
    console.warn("[cssUtils] Invalid HSL format:", hsl);
    return `hsla(0, 0%, 50%, ${alpha})`;
  }
  const [h, s, l] = parts;
  return `hsla(${h}, ${s}, ${l}, ${alpha})`;
}

/**
 * 将 HSL 字符串转换为 hsl 格式
 * @param hsl HSL 值，格式如 "142 76% 36%"
 */
export function hslToHslString(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length !== 3) {
    console.warn("[cssUtils] Invalid HSL format:", hsl);
    return "hsl(0, 0%, 50%)";
  }
  const [h, s, l] = parts;
  return `hsl(${h}, ${s}, ${l})`;
}

/**
 * 获取可编辑区域颜色（带透明度）
 */
export function getEditableZoneColor(alpha: number = 1): string {
  const hsl = getCssVariable("editable-zone");
  return alpha === 1 ? hslToHslString(hsl) : hslToHsla(hsl, alpha);
}

/**
 * 获取锁定区域颜色（带透明度）
 */
export function getLockedZoneColor(alpha: number = 1): string {
  const hsl = getCssVariable("locked-zone");
  return alpha === 1 ? hslToHslString(hsl) : hslToHsla(hsl, alpha);
}

/**
 * 获取默认区域颜色（带透明度）
 */
export function getDefaultZoneColor(alpha: number = 1): string {
  const hsl = getCssVariable("default-zone");
  return alpha === 1 ? hslToHslString(hsl) : hslToHsla(hsl, alpha);
}

/**
 * 获取可替换区域颜色（带透明度）
 */
export function getReplaceableZoneColor(alpha: number = 1): string {
  const hsl = getCssVariable("replaceable-zone");
  return alpha === 1 ? hslToHslString(hsl) : hslToHsla(hsl, alpha);
}
