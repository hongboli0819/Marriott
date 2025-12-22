# Image Compressor 集成文档

## 功能概述

图片智能压缩模块，采用"保持高画质，调整尺寸"策略，将图片压缩到目标大小。

## 核心特性

- **固定高画质**：quality 固定为 0.92，不牺牲压缩质量
- **二分法查找**：通过调整缩放比例找到最优解
- **硬约束满足**：确保最终大小 < 目标大小
- **软约束优化**：差异尽量 < 1MB，追求最大分辨率

## 算法说明

```
输入：图片 + 目标大小（如 5MB）

1. 预检查：如果原图 ≤ 目标大小，直接返回
2. 二分法查找最佳 scale（缩放比例）：
   - 如果压缩后 ≥ 目标大小 → 缩小尺寸
   - 如果压缩后 < 目标大小 → 记录候选解，尝试更大尺寸
3. 返回满足条件的最大 scale 对应的压缩结果

特点：
- Quality 始终固定（0.92），保证画质
- 只调整分辨率，不牺牲压缩质量
```

## 作为 Lovable 项目运行

```bash
cd packages/pdf-to-images/packages/image-compressor
npm install
npm run dev  # 启动在 8094 端口
```

访问 http://localhost:8094 可以看到演示页面。

## 作为函数模块集成

### 在父项目 vite.config.ts 中配置别名

```typescript
resolve: {
  alias: {
    "@muse/image-compressor": path.resolve(__dirname, 
      "./packages/image-compressor/src/core/index.ts"),
  },
},
```

### 使用示例

```typescript
import { compressImage } from '@muse/image-compressor';

// 基本用法
const result = await compressImage({
  image: myImageBlob,           // Blob 或 File
  targetSize: 5 * 1024 * 1024,  // 5MB
});

if (result.wasCompressed) {
  console.log(`原始大小: ${result.originalSize} bytes`);
  console.log(`最终大小: ${result.finalSize} bytes`);
  console.log(`缩放比例: ${result.finalScale * 100}%`);
  console.log(`最终尺寸: ${result.finalWidth}x${result.finalHeight}`);
}

// 使用压缩后的图片
const downloadUrl = URL.createObjectURL(result.blob);
```

### 高级配置

```typescript
const result = await compressImage({
  image: myImageBlob,
  targetSize: 5 * 1024 * 1024,
  options: {
    quality: 0.92,                    // 固定画质（默认 0.92）
    maxDifferenceThreshold: 1048576,  // 最大差异阈值（默认 1MB）
    minScale: 0.1,                    // 最小缩放比例（默认 10%）
    maxIterations: 20,                // 最大迭代次数（默认 20）
    outputFormat: 'image/jpeg',       // 输出格式（默认 JPEG）
  },
}, {
  adapters: {
    logger: {
      info: (msg, data) => console.log(msg, data),
    },
  },
});
```

### 输出类型

```typescript
interface CompressImageOutput {
  blob: Blob;              // 压缩后的图片
  originalSize: number;    // 原始大小（字节）
  finalSize: number;       // 最终大小（字节）
  wasCompressed: boolean;  // 是否进行了压缩
  finalScale: number;      // 最终缩放比例
  finalQuality: number;    // 使用的画质
  finalWidth: number;      // 最终宽度
  finalHeight: number;     // 最终高度
  compressionRatio: number;// 压缩比
  stats: {
    iterations: number;           // 迭代次数
    duration: number;             // 耗时（毫秒）
    differenceFromTarget: number; // 与目标的差异（字节）
  };
}
```

## 在 pdf-to-images 中调用

```typescript
// pdf-to-images/src/core/steps/compressPageImages.ts
import { compressImage } from '@muse/image-compressor';
import type { PageImage } from '../types/io';

export async function compressPageImages(
  images: PageImage[],
  targetSize: number
): Promise<PageImage[]> {
  const results: PageImage[] = [];
  
  for (const image of images) {
    const compressed = await compressImage({
      image: image.blob,
      targetSize,
    });
    
    results.push({
      ...image,
      blob: compressed.blob,
      fileSize: compressed.finalSize,
      width: compressed.finalWidth ?? image.width,
      height: compressed.finalHeight ?? image.height,
    });
  }
  
  return results;
}
```

## packages 目录

当前为空，预留给未来的子模块扩展。

## 常见问题

### Q: 为什么不调整 quality？

A: 调整 quality 会导致画质损失（如压缩噪点）。本模块的策略是保持高画质，通过调整分辨率来达到目标大小，更适合需要打印或放大查看的场景。

### Q: 如果即使 10% 缩放也无法满足目标怎么办？

A: 函数会抛出错误。这种情况非常罕见，通常意味着目标大小设置得太小。

### Q: 支持 PNG 输入吗？

A: 支持，但输出会转换为 JPEG（或 WebP），因为这些格式更适合有损压缩。


