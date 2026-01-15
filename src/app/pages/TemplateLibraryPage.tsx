import React, { useState, useRef, useCallback, useMemo } from "react";
// Core 层 - 纯函数
import {
  runTemplateExtraction,
  type TemplateExtractionOutput,
  type ProgressInfo,
  type ProcessingStage,
  ASPECT_RATIO_CONFIG,
} from "@internal/template-extractor";

// Shared 层 - UI 组件和 Hooks
import {
  TextEditModal,
  FontUploader,
  useFontStore,
  cn,
  type CanvasState,
  type EditorMode,
  type LineGroupInfo,
} from "@internal/template-extractor/shared";

// ==================== 阶段配置 ====================

const STAGE_INFO: Record<ProcessingStage, { label: string; color: string }> = {
  idle: { label: "等待上传", color: "bg-muted" },
  analyzing: { label: "分析图片", color: "bg-blue-500" },
  copying: { label: "复制图片 (4K)", color: "bg-indigo-500" },
  "removing-text": { label: "剔除文字", color: "bg-purple-500" },
  "diff-analyzing": { label: "差异分析", color: "bg-pink-500" },
  completed: { label: "完成", color: "bg-green-500" },
  failed: { label: "失败", color: "bg-destructive" },
};

// ==================== 组件 ====================

export const TemplateLibraryPage: React.FC = () => {
  // 状态
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [result, setResult] = useState<TemplateExtractionOutput | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo>({
    stage: "idle",
    progress: 0,
    message: "等待上传图片",
  });
  const [selectedTab, setSelectedTab] = useState<
    "copy" | "background" | "diff" | "reconstructed" | "edited"
  >("copy");

  // 编辑器状态
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [savedCanvasState, setSavedCanvasState] = useState<CanvasState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("template-edit");

  // 字体管理
  const {
    store: fontStore,
    activeFamily,
    uploadFonts,
    removeFamily,
    clearAll: clearAllFonts,
    getDefaultFontFamily,
    getDefaultFontWeight,
  } = useFontStore();

  // 是否显示字体设置面板
  const [showFontPanel, setShowFontPanel] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理文件选择
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        alert("请选择图片文件");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setSourceImage(dataUrl);
        setResult(null);
        setProgress({
          stage: "idle",
          progress: 0,
          message: "图片已加载，点击「开始提取」按钮",
        });
      };
      reader.readAsDataURL(file);
    },
    []
  );

  // 开始提取
  const handleExtract = useCallback(async () => {
    if (!sourceImage) return;

    setIsProcessing(true);
    setResult(null);

    try {
      const extractionResult = await runTemplateExtraction(
        {
          sourceImage,
          resolution: "4K",
          onProgress: setProgress,
        },
        {
          adapters: {
            logger: console,
          },
        }
      );

      setResult(extractionResult);

      if (extractionResult.success) {
        setSelectedTab("copy");
      }
    } catch (error) {
      console.error("提取失败:", error);
      setProgress({
        stage: "failed",
        progress: 0,
        message: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [sourceImage]);

  // 重置
  const handleReset = useCallback(() => {
    setSourceImage(null);
    setResult(null);
    setEditedImage(null);
    setSavedCanvasState(null);
    setProgress({
      stage: "idle",
      progress: 0,
      message: "等待上传图片",
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // 编辑器导出处理
  const handleEditorExport = useCallback((imageDataUrl: string, canvasState: CanvasState) => {
    setIsSaving(true);
    
    if (editorMode === "template-use") {
      // 使用模版模式：直接下载图片，不更新模版状态
      const link = document.createElement('a');
      link.download = `edited-${Date.now()}.png`;
      link.href = imageDataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setIsEditorOpen(false);
    } else {
      // 模版编辑模式：保存模版状态
      setEditedImage(imageDataUrl);
      setSavedCanvasState(canvasState);
      setSelectedTab("edited");
      setIsEditorOpen(false);
    }
    
    setIsSaving(false);
  }, [editorMode]);

  // 将 result.lines 转换为 LineGroupInfo
  const editorLines: LineGroupInfo[] = useMemo(() => {
    if (!result?.lines) return [];
    return result.lines.map((line, idx) => ({
      lineIndex: idx,
      boundingBox: line.boundingBox,
      recognizedText: line.text || `文字区域 ${idx + 1}`,
      contentColor: line.dominantColor 
        ? [line.dominantColor.r, line.dominantColor.g, line.dominantColor.b] as [number, number, number] 
        : [255, 255, 255],
    }));
  }, [result?.lines]);

  // 如果有现成的 canvasTextObjects，直接使用
  const hasCanvasObjects = result?.canvasTextObjects && result.canvasTextObjects.length > 0;

  // 下载图片
  const handleDownload = useCallback(
    (dataUrl: string, filename: string) => {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      link.click();
    },
    []
  );

  const stageInfo = STAGE_INFO[progress.stage];

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 overflow-auto">
      {/* 标题区 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <span className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
            📐
          </span>
          模版库
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          上传图片 → Gemini 复制 (4K) → 剔除文字 → 差异分析 → 可编辑模版
        </p>
      </div>

      {/* 主内容区 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        {/* 左侧：上传和控制 */}
        <div className="space-y-4">
          {/* 上传区域 */}
          <div className="glass rounded-2xl p-5 border border-card/30">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span>📤</span> 上传模版图片
            </h2>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {!sourceImage ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-40 border-2 border-dashed border-muted rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
              >
                <svg
                  className="w-10 h-10 mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-sm">点击选择图片</span>
              </button>
            ) : (
              <div className="relative">
                <img
                  src={sourceImage}
                  alt="原图"
                  className="w-full rounded-xl max-h-60 object-contain bg-muted/20"
                />
                <button
                  onClick={handleReset}
                  className="absolute top-2 right-2 p-2 bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded-lg transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* 字体设置面板 */}
          <div className="glass rounded-2xl border border-card/30 overflow-hidden">
            <button
              onClick={() => setShowFontPanel(!showFontPanel)}
              className="w-full px-5 py-4 flex items-center justify-between text-foreground hover:bg-card/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🔤</span>
                <span className="font-semibold text-sm">字体设置</span>
                {fontStore.families.length > 0 && (
                  <span className="px-2 py-0.5 bg-primary/20 rounded-full text-xs text-primary">
                    {fontStore.families.length} 个字体
                  </span>
                )}
              </div>
              <svg
                className={cn(
                  "w-5 h-5 transition-transform text-muted-foreground",
                  showFontPanel && "rotate-180"
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showFontPanel && (
              <div className="px-5 pb-5 border-t border-card/20">
                <div className="pt-4">
                  <p className="text-xs text-muted-foreground mb-4">
                    上传自定义字体后，编辑器将只使用这些字体。支持多个字重变体。
                  </p>
                  <FontUploader
                    families={fontStore.families}
                    isLoading={fontStore.isLoading}
                    onUpload={uploadFonts}
                    onRemove={removeFamily}
                    onClearAll={clearAllFonts}
                  />
                  
                  {activeFamily && (
                    <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                      <p className="text-sm text-primary">
                        ✨ 默认字体: <strong>{activeFamily.displayName}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        新添加的文字将使用此字体的中间字重 ({activeFamily.middleWeight})
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 进度条 */}
          <div className="glass rounded-2xl p-5 border border-card/30">
            <div className="flex items-center justify-between mb-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium text-white ${stageInfo.color}`}
              >
                {stageInfo.label}
              </span>
              <span className="text-foreground font-medium text-sm">
                {progress.progress}%
              </span>
            </div>

            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${stageInfo.color}`}
                style={{ width: `${progress.progress}%` }}
              />
            </div>

            <p className="mt-2 text-muted-foreground text-xs">
              {progress.message}
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <button
              onClick={handleExtract}
              disabled={!sourceImage || isProcessing}
              className={`flex-1 py-3 px-5 rounded-xl font-semibold text-sm transition-all ${
                sourceImage && !isProcessing
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {isProcessing ? "处理中..." : "🚀 开始提取"}
            </button>

            <button
              onClick={handleReset}
              disabled={isProcessing}
              className="py-3 px-5 rounded-xl font-semibold text-sm bg-card text-foreground hover:bg-card/80 transition-colors disabled:opacity-50"
            >
              重置
            </button>
          </div>

          {/* 结果信息 */}
          {result?.success && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-green-600 mb-3">
                ✅ 提取成功
              </h3>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  📐 宽高比:{" "}
                  <span className="text-foreground">
                    {result.matchedAspectRatio}
                  </span>
                </p>
                <p>
                  📏 原图尺寸:{" "}
                  <span className="text-foreground">
                    {result.originalSize?.width} × {result.originalSize?.height}
                  </span>
                </p>
                <p>
                  📝 识别行数:{" "}
                  <span className="text-foreground">
                    {result.lines?.length || 0} 行
                  </span>
                </p>
                <p>
                  ⏱️ 总耗时:{" "}
                  <span className="text-foreground">
                    {((result.timing?.total || 0) / 1000).toFixed(1)} 秒
                  </span>
                </p>
              </div>
              
              {/* 耗时详情 */}
              {result.timing && (
                <div className="mt-3 pt-3 border-t border-green-500/20">
                  <p className="text-xs text-muted-foreground mb-2">各阶段耗时：</p>
                  <div className="grid grid-cols-2 gap-1 text-xs text-foreground">
                    <div>分析: {(result.timing.analyze / 1000).toFixed(1)}s</div>
                    <div>复制: {(result.timing.copy / 1000).toFixed(1)}s</div>
                    <div>剔除文字: {(result.timing.removeText / 1000).toFixed(1)}s</div>
                    <div>差异分析: {(result.timing.diffAnalysis / 1000).toFixed(1)}s</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {result?.error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-destructive mb-2">
                ❌ 提取失败
              </h3>
              <p className="text-muted-foreground text-xs">{result.error}</p>
            </div>
          )}

          {/* 支持的宽高比 */}
          <div className="glass rounded-2xl p-5 border border-card/30">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              📐 支持的宽高比
            </h3>
            <div className="flex flex-wrap gap-2">
              {ASPECT_RATIO_CONFIG.map((config) => (
                <span
                  key={config.ratio}
                  className="px-2 py-1 bg-muted rounded-lg text-xs text-muted-foreground"
                >
                  {config.label || config.ratio}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧：结果展示 */}
        <div className="glass rounded-2xl p-5 border border-card/30 flex flex-col">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <span>🖼️</span> 结果预览
          </h2>

          {result?.success ? (
            <div className="space-y-4 flex-1 flex flex-col">
              {/* Tab 切换 */}
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: "copy", label: "有文字版", image: result.copyImage },
                  {
                    key: "background",
                    label: "背景图",
                    image: result.backgroundImage,
                  },
                  {
                    key: "diff",
                    label: "差异图",
                    image: result.diffVisualization,
                  },
                  {
                    key: "reconstructed",
                    label: "重建图",
                    image: result.reconstructedImage,
                  },
                  {
                    key: "edited",
                    label: "✏️ 编辑后",
                    image: editedImage,
                  },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() =>
                      setSelectedTab(
                        tab.key as
                          | "copy"
                          | "background"
                          | "diff"
                          | "reconstructed"
                          | "edited"
                      )
                    }
                    disabled={!tab.image}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selectedTab === tab.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    } ${!tab.image && "opacity-50 cursor-not-allowed"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 图片展示 */}
              <div className="flex-1 flex items-center justify-center bg-muted/20 rounded-xl overflow-hidden min-h-[300px]">
                {selectedTab === "copy" && result.copyImage && (
                  <img
                    src={result.copyImage}
                    alt="有文字版"
                    className="max-w-full max-h-[400px] object-contain"
                  />
                )}
                {selectedTab === "background" && result.backgroundImage && (
                  <img
                    src={result.backgroundImage}
                    alt="无文字版"
                    className="max-w-full max-h-[400px] object-contain"
                  />
                )}
                {selectedTab === "diff" && result.diffVisualization && (
                  <img
                    src={result.diffVisualization}
                    alt="差异可视化"
                    className="max-w-full max-h-[400px] object-contain"
                  />
                )}
                {selectedTab === "reconstructed" &&
                  result.reconstructedImage && (
                    <img
                      src={result.reconstructedImage}
                      alt="重建图"
                      className="max-w-full max-h-[400px] object-contain"
                    />
                  )}
                {selectedTab === "edited" && editedImage && (
                  <img
                    src={editedImage}
                    alt="编辑后"
                    className="max-w-full max-h-[400px] object-contain"
                  />
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2 flex-wrap">
                {/* 继续编辑按钮 */}
                {result.backgroundImage && (editorLines.length > 0 || hasCanvasObjects) && (
                  <button
                    onClick={() => {
                      setEditorMode("template-edit");
                      setIsEditorOpen(true);
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    ✏️ 继续编辑
                  </button>
                )}
                
                {/* 使用模版按钮 - 仅当有保存的模版状态时显示 */}
                {savedCanvasState && result.backgroundImage && (
                  <button
                    onClick={() => {
                      setEditorMode("template-use");
                      setIsEditorOpen(true);
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    📋 使用模版
                  </button>
                )}

                {/* 下载按钮 */}
                {result.copyImage && (
                  <button
                    onClick={() =>
                      handleDownload(result.copyImage!, "copy.png")
                    }
                    className="px-3 py-2 bg-indigo-500/80 hover:bg-indigo-500 text-white rounded-lg text-xs transition-colors"
                  >
                    下载有文字版
                  </button>
                )}
                {result.backgroundImage && (
                  <button
                    onClick={() =>
                      handleDownload(
                        result.backgroundImage!,
                        "background.png"
                      )
                    }
                    className="px-3 py-2 bg-purple-500/80 hover:bg-purple-500 text-white rounded-lg text-xs transition-colors"
                  >
                    下载背景图
                  </button>
                )}
                {editedImage && (
                  <button
                    onClick={() => handleDownload(editedImage, "edited.png")}
                    className="px-3 py-2 bg-pink-500/80 hover:bg-pink-500 text-white rounded-lg text-xs transition-colors"
                  >
                    下载编辑后
                  </button>
                )}
              </div>

              {/* 识别的文字 */}
              {result.lines && result.lines.length > 0 && (
                <div className="pt-4 border-t border-muted">
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    📝 识别的文字 ({result.lines.length} 行)
                  </h3>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {result.lines.map((line, idx) => (
                      <div
                        key={idx}
                        className="bg-muted/50 rounded-lg px-3 py-2 text-xs"
                      >
                        <span className="text-muted-foreground">
                          第 {idx + 1} 行:
                        </span>{" "}
                        <span className="text-foreground">
                          {line.text || "(未识别)"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <svg
                  className="w-12 h-12 mx-auto mb-3 opacity-50"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm">上传图片并点击「开始提取」</p>
                <p className="text-xs mt-1">查看提取结果</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 文字编辑弹窗 */}
      {result?.backgroundImage && (editorLines.length > 0 || hasCanvasObjects) && (
        <TextEditModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          backgroundImage={result.backgroundImage}
          lines={editorLines}
          initialCanvasObjects={hasCanvasObjects ? result.canvasTextObjects : undefined}
          fontFamilies={fontStore.families}
          defaultFontConfig={
            activeFamily
              ? {
                  fontFamily: getDefaultFontFamily(),
                  fontWeight: getDefaultFontWeight(),
                }
              : undefined
          }
          onExport={handleEditorExport}
          isSaving={isSaving}
          savedCanvasState={savedCanvasState}
          editorMode={editorMode}
        />
      )}
    </div>
  );
};
