# Text Editor Module

文字编辑器模块 - 支持编辑文字内容和调整字体配置，在背景图上渲染文字。

## 功能概述

- ✅ 编辑每行的文字内容
- ✅ 全局字体配置（字体、字重、字号缩放、字间距）
- ✅ 每行独立字体配置（覆盖全局配置）
- ✅ Canvas 渲染文字到背景图

## 作为 Lovable 项目运行

```bash
cd packages/text-editor-module
npm install
npm run dev
```

访问 http://127.0.0.1:5177

## 作为函数模块集成

### 安装

在父项目中通过 Vite 别名引用：

```typescript
// vite.config.ts
resolve: {
  alias: {
    "@internal/text-editor-module": path.resolve(
      __dirname,
      "./packages/text-editor-module/src/core/index.ts"
    ),
  },
}
```

### 使用

```typescript
import {
  runTextEditor,
  type EditableLine,
  type FontConfig,
} from "@internal/text-editor-module";

// 准备输入
const input = {
  backgroundImage: "data:image/png;base64,...",
  lines: [
    {
      lineIndex: 0,
      originalText: "Hello",
      editedText: "你好",
      boundingBox: { x: 100, y: 50, width: 200, height: 30 },
      contentColor: [255, 0, 0] as [number, number, number],
    },
  ],
  globalFontConfig: {
    fontFamily: "Microsoft YaHei",
    fontWeight: "bold",
    fontSizeScale: 1.0,
  },
};

// 执行
const result = await runTextEditor(input);
console.log(result.renderedImage); // data:image/png;base64,...
```

## API

### runTextEditor

主函数，编辑文字并渲染到背景图。

**输入 (RunTextEditorInput)**

| 字段 | 类型 | 说明 |
|------|------|------|
| backgroundImage | string | 背景图 dataUrl |
| lines | EditableLine[] | 可编辑的行数据 |
| globalFontConfig | Partial<FontConfig> | 可选，全局字体配置 |

**输出 (RunTextEditorOutput)**

| 字段 | 类型 | 说明 |
|------|------|------|
| renderedImage | string | 渲染后的图片 dataUrl |
| processedLines | EditableLine[] | 处理后的行数据 |

### FontConfig

字体配置类型。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| fontFamily | string | "Microsoft YaHei" | 字体族 |
| fontWeight | string | "bold" | 字重 |
| fontStyle | "normal" \| "italic" | "normal" | 字体样式 |
| letterSpacing | number | 0 | 字间距（像素） |
| fontSizeScale | number | 1.0 | 字号缩放比例 |

## 目录结构

```
text-editor-module/
├── src/
│   ├── core/           # L-Core 纯函数能力
│   │   ├── index.ts    # 对外导出入口
│   │   ├── pipelines/
│   │   │   └── runTextEditor.ts
│   │   ├── steps/
│   │   │   ├── applyFontConfig.ts
│   │   │   └── renderTextOnCanvas.ts
│   │   └── types/
│   │       ├── io.ts
│   │       ├── context.ts
│   │       └── functional.ts
│   └── ...
├── package.json
└── INTEGRATION.md
```

