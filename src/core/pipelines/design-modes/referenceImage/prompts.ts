/**
 * 提供设计参考图模式 - 提示词配置
 */

/**
 * 第一步：生成背景图的提示词
 */
export const STEP1_PROMPT = `请你基于输入的参考图，提取和学习其中的设计思路，然后请你设计一个背景图，背景图的中心要有大面积的留白，这个留白的部分后续会设计花字，所以你要有足够多的留白，然后确保背景图上没有任何的文字，也就是生成无文字版的图。`;

/**
 * 第二步：添加文字的提示词模板
 * @param confirmedText 用户确认的文案
 */
export const getStep2Prompt = (confirmedText: string): string => {
  return `请你基于用户输入的图片，然后只可以在图上添加文字，注意不可以修改任何的背景元素，只可以添加文字，文字之外不可以添加任何元素，哪怕给文字加边框也不可以，就是纯文字，确保设计的文字美观，整体视觉协调有美感。你需要添加的文字是：

${confirmedText}`;
};

/**
 * 默认生成数量
 */
export const DEFAULT_COUNT = 3;

/**
 * 默认分辨率
 */
export const DEFAULT_RESOLUTION = "1K";
