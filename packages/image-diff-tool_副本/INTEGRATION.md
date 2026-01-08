# Image Diff Tool - 集成文档

## 1. 功能概述

图片差异检测工具，对比两张图片（原图和添加了新元素的新图），自动识别并定位新增的内容。

核心功能：
- 像素级差异检测
- 连通域分析聚合差异区域
- 自动生成边界框定位
- 可视化结果展示

## 2. 作为 Lovable 项目运行（L-App）

### 安装依赖

```bash
cd packages/image-diff-tool
npm install
```

### 开发模式

```bash
npm run dev
# 访问 http://127.0.0.1:5176
```

### 构建前端应用

```bash
npm run build:app
```

## 3. 作为函数模块集成（L-Core）

### 安装

```bash
npm install @internal/image-diff-tool
```

### 对外主函数

#### `runImageDiff(input, ctx)`

执行完整的图像差异检测流程。

```typescript
import { runImageDiff } from "@internal/image-diff-tool";
import type { RunImageDiffInput, CoreContext } from "@internal/image-diff-tool";

const input: RunImageDiffInput = {
  imageA: "data:image/png;base64,...", // 原图
  imageB: "data:image/png;base64,...", // 新图（添加了元素）
  config: {
    threshold: 30,        // 差异阈值（0-255）
    minAreaSize: 100,     // 最小区域面积
    dilateRadius: 3,      // 膨胀半径
    boundingBoxPadding: 5,// 边界框内边距
    highlightColor: "#FF0000", // 高亮颜色
  },
};

const ctx: CoreContext = {
  adapters: {
    logger: console,
  },
};

const result = await runImageDiff(input, ctx);

console.log(result.regions);          // 差异区域列表
console.log(result.visualizedImage);  // 带边界框标注的图片
console.log(result.diffMaskImage);    // 差异掩码图
console.log(result.totalDiffPixels);  // 差异像素总数
```

### 步骤函数

可以单独使用各个步骤函数：

```typescript
import { 
  computePixelDiff,    // 计算像素差异
  clusterDiffRegions,  // 聚类差异区域
  visualizeDiff,       // 可视化差异
} from "@internal/image-diff-tool";

// Step 1: 计算像素差异
const pixelDiff = await computePixelDiff({
  imageA: "data:image/...",
  imageB: "data:image/...",
  threshold: 30,
});

// Step 2: 聚类差异区域
const clusters = await clusterDiffRegions({
  diffMask: pixelDiff.diffMask,
  dilateRadius: 3,
  minAreaSize: 100,
});

// Step 3: 可视化
const visual = await visualizeDiff({
  originalImage: "data:image/...",
  regions: clusters.regions,
  padding: 5,
  highlightColor: "#FF0000",
});
```

### 类型定义

```typescript
interface DiffConfig {
  threshold: number;        // 差异阈值（0-255）
  minAreaSize: number;      // 最小区域面积
  dilateRadius: number;     // 膨胀半径
  boundingBoxPadding: number; // 边界框内边距
  highlightColor: string;   // 高亮颜色
}

interface DiffRegion {
  id: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pixelCount: number;
  center: { x: number; y: number };
}

interface RunImageDiffOutput {
  regions: DiffRegion[];      // 差异区域列表
  visualizedImage: string;    // 带标注的图片（base64）
  diffMaskImage: string;      // 差异掩码图（base64）
  totalDiffPixels: number;    // 差异像素总数
  imageSize: { width: number; height: number };
}
```

## 4. 算法说明

### 像素差异检测

1. 逐像素比较 RGB 值
2. 计算三通道差值之和：`|R1-R2| + |G1-G2| + |B1-B2|`
3. 超过阈值（默认 30）的标记为差异像素

### 区域聚类

1. **膨胀操作**：扩展差异像素，连接邻近区域
2. **连通域标记**：使用 Flood Fill 算法标记连通区域
3. **过滤小区域**：忽略面积小于 `minAreaSize` 的区域
4. **计算边界框**：为每个区域计算最小外接矩形

### 参数调优建议

| 场景 | threshold | minAreaSize | dilateRadius |
|-----|-----------|-------------|--------------|
| JPEG 图片 | 30-50 | 100-200 | 3-5 |
| PNG 图片 | 10-20 | 50-100 | 2-3 |
| 细小文字 | 20-30 | 30-50 | 5-8 |
| 大块图形 | 30-40 | 200-500 | 2-3 |

## 5. 限制和注意事项

1. **图片尺寸必须相同**：两张图片的宽高必须一致
2. **图片需对齐**：如果图片有位移，需要先进行配准
3. **半透明元素**：检测效果可能不理想，建议提高阈值
4. **浏览器环境**：依赖 Canvas API，不支持 Node.js

## 6. 项目结构

```
image-diff-tool/
├── src/
│   ├── app/                        # L-App
│   │   ├── AppShell.tsx
│   │   └── pages/
│   │       ├── HomePage.tsx
│   │       └── PlaygroundPage.tsx
│   ├── core/                       # L-Core
│   │   ├── index.ts
│   │   ├── pipelines/
│   │   │   └── runImageDiff.ts
│   │   ├── steps/
│   │   │   ├── loadImage.ts
│   │   │   ├── computePixelDiff.ts
│   │   │   ├── clusterDiffRegions.ts
│   │   │   └── visualizeDiff.ts
│   │   └── types/
│   │       ├── context.ts
│   │       ├── functional.ts
│   │       └── io.ts
│   ├── shared/
│   │   ├── lib/utils.ts
│   │   └── ui/
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       └── tabs.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── packages/
├── package.json
├── tailwind.config.ts
├── vite.config.ts
└── INTEGRATION.md
```
