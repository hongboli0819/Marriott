# @internal/template-extractor

模版提取器 - 从图片中提取可编辑模版

## 功能概述

1. **宽高比匹配**: 自动计算图片宽高比，匹配最接近的标准比例
2. **第一轮 Gemini**: 4K 高清复制原图（保留文字）
3. **第二轮 Gemini**: 剔除图片中的文字，只保留背景
4. **差异分析**: 使用 image-diff-tool 对比两轮结果，识别文字区域
5. **输出模版**: 背景图 + 文字对象列表（可编辑）
6. **可视化编辑**: 基于 Fabric.js 的 Canvas 编辑器，支持：
   - 拖拽移动文字
   - 双击编辑文字内容
   - 调整字体、字号、颜色
   - 撤销/重做
   - 添加新文字
   - 导出编辑后的图片

## 支持的宽高比

| 比例 | 值 | 说明 |
|------|-----|------|
| 1:1 | 1.00 | 正方形 |
| 2:3 | 0.67 | 竖版 |
| 3:2 | 1.50 | 横版 |
| 3:4 | 0.75 | 竖版 |
| 4:3 | 1.33 | 横版 |
| 4:5 | 0.80 | 竖版 |
| 5:4 | 1.25 | 横版 |
| 9:16 | 0.56 | 竖屏 |
| 16:9 | 1.78 | 横屏 |
| 21:9 | 2.33 | 超宽 |

## 运行方式

### 独立运行 (开发测试)

```bash
cd packages/template-extractor
npm install
npm run dev
# 访问 http://localhost:5180
```

### 作为库集成

```typescript
import { runTemplateExtraction } from '@internal/template-extractor';

const result = await runTemplateExtraction({
  sourceImage: imageDataUrl,  // base64 DataURL
  resolution: "4K",           // 默认 4K
  onProgress: (info) => {
    console.log(`[${info.stage}] ${info.progress}% - ${info.message}`);
  },
});

if (result.success) {
  console.log(`识别 ${result.lines?.length} 行文字`);
  console.log(`背景图:`, result.backgroundImage);
  console.log(`可编辑对象:`, result.canvasTextObjects);
}
```

## API 详情

### runTemplateExtraction

主流程函数，接收一张图片，返回可编辑模版。

**输入参数 (TemplateExtractionInput)**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sourceImage | string | ✅ | 原始图片（base64 DataURL） |
| resolution | "1K" \| "2K" \| "4K" | ❌ | 分辨率，默认 "4K" |
| onProgress | (info: ProgressInfo) => void | ❌ | 进度回调 |

**输出结果 (TemplateExtractionOutput)**

| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 是否成功 |
| originalSize | { width, height } | 原图尺寸 |
| matchedAspectRatio | string | 匹配的宽高比 |
| copyImage | string | 第一轮结果（有文字版 4K） |
| backgroundImage | string | 第二轮结果（无文字版背景） |
| lines | LineInfo[] | 识别的行信息 |
| canvasTextObjects | CanvasTextObject[] | 可编辑的 Canvas 对象 |
| diffVisualization | string | 差异可视化图 |
| reconstructedImage | string | 重建图 |
| error | string | 错误信息 |
| timing | TimingInfo | 各阶段耗时 |

## 处理流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                        输入图片                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: 分析宽高比                                               │
│   - 计算 width / height                                         │
│   - 匹配最接近的标准比例                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: 第一轮 Gemini - 复制                                     │
│   - prompt: "请你原封不动的复制这个图的所有细节..."                  │
│   - aspectRatio: 匹配的比例                                      │
│   - resolution: 4K                                              │
│   - 输出: copyImage (有文字版)                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: 第二轮 Gemini - 剔除文字                                  │
│   - 输入: copyImage (第一轮结果)                                  │
│   - prompt: "请你剔除图片中的文字..."                              │
│   - 保持相同 aspectRatio 和 resolution                           │
│   - 输出: backgroundImage (无文字版)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: 差异分析 (image-diff-tool)                               │
│   - imageA: backgroundImage (无文字版 = 原图)                     │
│   - imageB: copyImage (有文字版 = 新图)                           │
│   - 差异区域 = 文字区域                                           │
│   - 输出: lines, canvasTextObjects, diffVisualization            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         输出模版                                  │
│   - backgroundImage: 背景图（无文字）                             │
│   - canvasTextObjects: 可编辑文字对象列表                         │
└─────────────────────────────────────────────────────────────────┘
```

## 目录结构

```
template-extractor/
├── src/
│   ├── core/                       # 核心模块（可独立发布）
│   │   ├── types/
│   │   │   ├── io.ts               # 输入/输出类型
│   │   │   ├── context.ts          # 上下文类型
│   │   │   └── functional.ts       # 函数类型
│   │   ├── steps/
│   │   │   ├── matchAspectRatio.ts # 宽高比匹配
│   │   │   ├── callGeminiCopy.ts   # 第一轮：复制
│   │   │   ├── callGeminiRemoveText.ts # 第二轮：剔除文字
│   │   │   └── analyzeTextDiff.ts  # 差异分析
│   │   ├── pipelines/
│   │   │   └── runTemplateExtraction.ts # 主流程
│   │   └── index.ts                # 入口
│   ├── app/
│   │   └── pages/
│   │       └── PlaygroundPage.tsx  # 测试页面（含编辑功能）
│   ├── shared/
│   │   ├── types/
│   │   │   └── canvasEditorTypes.ts # Canvas 编辑器类型
│   │   ├── hooks/
│   │   │   └── useCanvasHistory.ts  # 撤销/重做 Hook
│   │   ├── ui/
│   │   │   ├── FabricCanvas.tsx     # Fabric.js Canvas 组件
│   │   │   ├── FloatingToolbar.tsx  # 浮动工具栏
│   │   │   └── TextEditModal.tsx    # 编辑弹窗
│   │   └── lib/
│   │       └── utils.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── index.html
└── INTEGRATION.md
```

## 依赖关系

- **@internal/image-diff-tool**: 图片差异分析
- **Gemini API**: 通过 Supabase Edge Function 调用

## 编辑器功能

提取完成后，点击「✏️ 继续编辑」按钮进入编辑器：

### 编辑器操作

| 操作 | 说明 |
|------|------|
| 双击文字 | 编辑文字内容 |
| 拖拽文字 | 调整文字位置 |
| 选中后 | 显示浮动工具栏，可调整字体、字号、颜色 |
| 双击空白处 | 添加新文字 |
| Delete/Backspace | 删除选中文字 |
| Ctrl+Z | 撤销 |
| Ctrl+Shift+Z | 重做 |
| ESC | 关闭编辑器 |

### 编辑器输出

编辑完成后点击「保存并下载」：
- 导出编辑后的图片（PNG 格式）
- 保存 Canvas 状态（支持继续编辑）

## 注意事项

1. **分辨率**: 默认使用 4K 分辨率，确保文字清晰可识别
2. **API 限流**: Gemini API 有调用频率限制，内置重试机制
3. **图片格式**: 支持 PNG、JPEG、WebP 等常见格式
4. **大图处理**: 大尺寸图片处理时间可能较长，请耐心等待
5. **编辑器**: 基于 Fabric.js，需要现代浏览器支持

