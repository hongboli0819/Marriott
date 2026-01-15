import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/shared/lib/utils";
import {
  runTemplateExtraction,
  type TemplateExtractionOutput,
  type ProgressInfo,
  type ProcessingStage,
  ASPECT_RATIO_CONFIG,
} from "@/core";
import { TextEditModal } from "@/shared/ui/TextEditModal";
import { FontUploader } from "@/shared/ui/FontUploader";
import { useFontStore } from "@/shared/hooks/useFontStore";
import type { LineGroupInfo, CanvasState, EditorMode } from "@/shared/types/canvasEditorTypes";

// ==================== 阶段配置 ====================

const STAGE_INFO: Record<ProcessingStage, { label: string; color: string }> = {
  idle: { label: "等待上传", color: "bg-gray-500" },
  analyzing: { label: "分析图片", color: "bg-blue-500" },
  copying: { label: "复制图片 (4K)", color: "bg-indigo-500" },
  "removing-text": { label: "剔除文字", color: "bg-purple-500" },
  "diff-analyzing": { label: "差异分析", color: "bg-pink-500" },
  completed: { label: "完成", color: "bg-green-500" },
  failed: { label: "失败", color: "bg-red-500" },
};

// ==================== 组件 ====================

export const PlaygroundPage: React.FC = () => {
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

      // 验证文件类型
      if (!file.type.startsWith("image/")) {
        alert("请选择图片文件");
        return;
      }

      // 读取文件
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
      // 🔑 使用模版模式：直接下载图片，不更新模版状态
      const link = document.createElement('a');
      link.download = `edited-${Date.now()}.png`;
      link.href = imageDataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // 关闭编辑器
      setIsEditorOpen(false);
    } else {
      // 🔑 模版编辑模式：保存模版状态
      setEditedImage(imageDataUrl);
      setSavedCanvasState(canvasState);
      setSelectedTab("edited");
      
      // 关闭编辑器
      setIsEditorOpen(false);
    }
    
    setIsSaving(false);
  }, [editorMode]);

  // 将 result.lines 转换为 LineGroupInfo
  // 优先使用 result.canvasTextObjects（已由 image-diff-tool 转换好）
  const editorLines: LineGroupInfo[] = React.useMemo(() => {
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 标题 */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🎨 模版提取器
          </h1>
          <p className="text-gray-400">
            上传图片 → Gemini 复制 → 剔除文字 → 差异分析 → 可编辑模版
          </p>
        </header>

        {/* 主内容区 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧：上传和控制 */}
          <div className="space-y-6">
            {/* 上传区域 */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
              <h2 className="text-xl font-semibold text-white mb-4">
                📤 上传图片
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
                  className="w-full h-48 border-2 border-dashed border-white/30 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-white/50 hover:text-white transition-colors"
                >
                  <svg
                    className="w-12 h-12 mb-2"
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
                  <span>点击选择图片</span>
                </button>
              ) : (
                <div className="relative">
                  <img
                    src={sourceImage}
                    alt="原图"
                    className="w-full rounded-xl"
                  />
                  <button
                    onClick={handleReset}
                    className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                  >
                    <svg
                      className="w-5 h-5"
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
            <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 overflow-hidden">
              <button
                onClick={() => setShowFontPanel(!showFontPanel)}
                className="w-full px-6 py-4 flex items-center justify-between text-white hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🔤</span>
                  <span className="font-semibold">字体设置</span>
                  {fontStore.families.length > 0 && (
                    <span className="px-2 py-0.5 bg-indigo-500/30 rounded-full text-xs text-indigo-300">
                      {fontStore.families.length} 个字体
                    </span>
                  )}
                </div>
                <svg
                  className={cn(
                    "w-5 h-5 transition-transform",
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
                <div className="px-6 pb-6 border-t border-white/10">
                  <div className="pt-4">
                    <p className="text-sm text-gray-400 mb-4">
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
                      <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                        <p className="text-sm text-indigo-300">
                          ✨ 默认字体: <strong>{activeFamily.displayName}</strong>
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          新添加的文字将使用此字体的中间字重 ({activeFamily.middleWeight})
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 进度条 */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
              <div className="flex items-center justify-between mb-3">
                <span
                  className={cn(
                    "px-3 py-1 rounded-full text-sm font-medium text-white",
                    stageInfo.color
                  )}
                >
                  {stageInfo.label}
                </span>
                <span className="text-white font-medium">
                  {progress.progress}%
                </span>
              </div>

              <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-300",
                    stageInfo.color
                  )}
                  style={{ width: `${progress.progress}%` }}
                />
              </div>

              <p className="mt-3 text-gray-300 text-sm">{progress.message}</p>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-4">
              <button
                onClick={handleExtract}
                disabled={!sourceImage || isProcessing}
                className={cn(
                  "flex-1 py-3 px-6 rounded-xl font-semibold transition-all",
                  sourceImage && !isProcessing
                    ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600"
                    : "bg-gray-600 text-gray-400 cursor-not-allowed"
                )}
              >
                {isProcessing ? "处理中..." : "🚀 开始提取"}
              </button>

              <button
                onClick={handleReset}
                disabled={isProcessing}
                className="py-3 px-6 rounded-xl font-semibold bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                重置
              </button>
            </div>

            {/* 结果信息 */}
            {result?.success && (
              <div className="bg-green-500/20 border border-green-500/30 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-green-400 mb-3">
                  ✅ 提取成功
                </h3>
                <div className="space-y-2 text-sm text-gray-300">
                  <p>
                    📐 宽高比:{" "}
                    <span className="text-white">
                      {result.matchedAspectRatio}
                    </span>
                  </p>
                  <p>
                    📏 原图尺寸:{" "}
                    <span className="text-white">
                      {result.originalSize?.width} × {result.originalSize?.height}
                    </span>
                  </p>
                  <p>
                    📝 识别行数:{" "}
                    <span className="text-white">
                      {result.lines?.length || 0} 行
                    </span>
                  </p>
                  <p>
                    ⏱️ 总耗时:{" "}
                    <span className="text-white">
                      {((result.timing?.total || 0) / 1000).toFixed(1)} 秒
                    </span>
                  </p>
                </div>

                {/* 耗时详情 */}
                {result.timing && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-xs text-gray-400 mb-2">各阶段耗时：</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>分析: {(result.timing.analyze / 1000).toFixed(1)}s</div>
                      <div>复制: {(result.timing.copy / 1000).toFixed(1)}s</div>
                      <div>
                        剔除文字: {(result.timing.removeText / 1000).toFixed(1)}s
                      </div>
                      <div>
                        差异分析: {(result.timing.diffAnalysis / 1000).toFixed(1)}s
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {result?.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-red-400 mb-2">
                  ❌ 提取失败
                </h3>
                <p className="text-gray-300">{result.error}</p>
              </div>
            )}
          </div>

          {/* 右侧：结果展示 */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-semibold text-white mb-4">
              🖼️ 结果预览
            </h2>

            {result?.success ? (
              <div className="space-y-4">
                {/* Tab 切换 */}
                <div className="flex gap-2 flex-wrap">
                  {[
                    { key: "copy", label: "有文字版", image: result.copyImage },
                    {
                      key: "background",
                      label: "无文字版（背景）",
                      image: result.backgroundImage,
                    },
                    {
                      key: "diff",
                      label: "差异可视化",
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
                          tab.key as "copy" | "background" | "diff" | "reconstructed" | "edited"
                        )
                      }
                      disabled={!tab.image}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        selectedTab === tab.key
                          ? "bg-white/20 text-white"
                          : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white",
                        !tab.image && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* 图片展示 */}
                <div className="relative">
                  {selectedTab === "copy" && result.copyImage && (
                    <img
                      src={result.copyImage}
                      alt="有文字版"
                      className="w-full rounded-xl"
                    />
                  )}
                  {selectedTab === "background" && result.backgroundImage && (
                    <img
                      src={result.backgroundImage}
                      alt="无文字版"
                      className="w-full rounded-xl"
                    />
                  )}
                  {selectedTab === "diff" && result.diffVisualization && (
                    <img
                      src={result.diffVisualization}
                      alt="差异可视化"
                      className="w-full rounded-xl"
                    />
                  )}
                  {selectedTab === "reconstructed" &&
                    result.reconstructedImage && (
                      <img
                        src={result.reconstructedImage}
                        alt="重建图"
                        className="w-full rounded-xl"
                      />
                    )}
                  {selectedTab === "edited" && editedImage && (
                    <img
                      src={editedImage}
                      alt="编辑后"
                      className="w-full rounded-xl"
                    />
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 flex-wrap">
                  {/* 继续编辑按钮（模版制作模式） */}
                  {result.backgroundImage && (editorLines.length > 0 || hasCanvasObjects) && (
                    <button
                      onClick={() => {
                        setEditorMode("template-edit");
                        setIsEditorOpen(true);
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                    >
                      ✏️ 继续编辑
                    </button>
                  )}
                  
                  {/* 使用模版按钮（模版使用模式） - 仅当有保存的模版状态时显示 */}
                  {savedCanvasState && result.backgroundImage && (
                    <button
                      onClick={() => {
                        setEditorMode("template-use");
                        setIsEditorOpen(true);
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
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
                      className="px-4 py-2 bg-indigo-500/80 hover:bg-indigo-500 text-white rounded-lg text-sm transition-colors"
                    >
                      下载有文字版
                    </button>
                  )}
                  {result.backgroundImage && (
                    <button
                      onClick={() =>
                        handleDownload(result.backgroundImage!, "background.png")
                      }
                      className="px-4 py-2 bg-purple-500/80 hover:bg-purple-500 text-white rounded-lg text-sm transition-colors"
                    >
                      下载背景图
                    </button>
                  )}
                  {editedImage && (
                    <button
                      onClick={() =>
                        handleDownload(editedImage, "edited.png")
                      }
                      className="px-4 py-2 bg-pink-500/80 hover:bg-pink-500 text-white rounded-lg text-sm transition-colors"
                    >
                      下载编辑后
                    </button>
                  )}
                </div>

                {/* 文字区域信息 */}
                {result.lines && result.lines.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-3">
                      📝 识别的文字区域 ({result.lines.length} 行)
                    </h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {result.lines.map((line, idx) => (
                        <div
                          key={idx}
                          className="bg-white/5 rounded-lg p-3 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">第 {idx + 1} 行</span>
                            <span className="text-gray-500 text-xs">
                              {line.boundingBox.width.toFixed(0)} ×{" "}
                              {line.boundingBox.height.toFixed(0)}
                            </span>
                          </div>
                          {line.text && (
                            <p className="text-white mt-1">{line.text}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Canvas 文字对象 */}
                {result.canvasTextObjects &&
                  result.canvasTextObjects.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <h3 className="text-lg font-semibold text-white mb-3">
                        🎯 可编辑对象 ({result.canvasTextObjects.length} 个)
                      </h3>
                      <pre className="bg-black/30 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto max-h-40">
                        {JSON.stringify(result.canvasTextObjects, null, 2)}
                      </pre>
                    </div>
                  )}
              </div>
            ) : (
              <div className="h-96 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 opacity-50"
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
                  <p>上传图片并点击「开始提取」</p>
                  <p className="text-sm mt-2">查看提取结果</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 支持的宽高比 */}
        <div className="mt-8 bg-white/5 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            📐 支持的宽高比
          </h3>
          <div className="flex flex-wrap gap-3">
            {ASPECT_RATIO_CONFIG.map((config) => (
              <span
                key={config.ratio}
                className="px-3 py-1 bg-white/10 rounded-full text-sm text-gray-300"
              >
                {config.label}
              </span>
            ))}
          </div>
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
