import React, { useState, useCallback, useRef, useEffect } from "react";
import type { Canvas as FabricCanvas } from "fabric";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import { Select, SelectOption } from "@/shared/ui/select";
import { Slider } from "@/shared/ui/slider";
import { cn, fileToDataUrl, downloadDataUrl } from "@/shared/lib/utils";
import { runImageDiff } from "@/core/pipelines/runImageDiff";
import { setConversationId, createPlaygroundConversation } from "@/core/services/difyClient";
import {
  integrateTextEditor,
  linesToEditableLines,
  linesToCanvasTextObjects,
  DEFAULT_FONT_CONFIG,
} from "@/core/steps/integrateTextEditor";
import type { RunImageDiffOutput, DiffConfig } from "@/core/types/io";
import type { EditableLine, FontConfig, CanvasTextObject } from "@/core/steps/integrateTextEditor";
import { FabricCanvas as FabricCanvasComponent } from "@/app/components/FabricCanvas";
import { FloatingToolbar } from "@/app/components/FloatingToolbar";
import { useCanvasHistory } from "@/app/hooks/useCanvasHistory";

interface UploadedImage {
  dataUrl: string;
  name: string;
}

/**
 * Playground 页面
 */
export function PlaygroundPage() {
  // 上传的图片
  const [imageA, setImageA] = useState<UploadedImage | null>(null);
  const [imageB, setImageB] = useState<UploadedImage | null>(null);

  // 配置
  const [threshold, setThreshold] = useState(100);
  const [minAreaSize, setMinAreaSize] = useState(10);
  const [dilateRadius, setDilateRadius] = useState(0);
  const [lineOverlapThreshold, setLineOverlapThreshold] = useState(40);
  
  // 行合并配置（新增）
  const [enableLineMerge, setEnableLineMerge] = useState(true);
  const [lineMergeCenterYThreshold, setLineMergeCenterYThreshold] = useState(30);
  const [lineMergeOverlapThreshold, setLineMergeOverlapThreshold] = useState(30);
  
  // X 距离阈值（像素）
  const [maxXGap, setMaxXGap] = useState(55);
  
  // Wording（参考文字，用于 Dify 识别）
  const [wording, setWording] = useState("");

  // 结果
  const [result, setResult] = useState<RunImageDiffOutput | null>(null);
  const [resultTab, setResultTab] = useState("visualized");

  // 状态
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConversationReady, setIsConversationReady] = useState(false);

  // 拖拽
  const [draggingA, setDraggingA] = useState(false);
  const [draggingB, setDraggingB] = useState(false);
  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  // 文字编辑器状态
  const [editableLines, setEditableLines] = useState<EditableLine[]>([]);
  const [globalFont, setGlobalFont] = useState<Partial<FontConfig>>({
    fontFamily: DEFAULT_FONT_CONFIG.fontFamily,
    fontWeight: DEFAULT_FONT_CONFIG.fontWeight,
    fontStyle: DEFAULT_FONT_CONFIG.fontStyle,
    letterSpacing: DEFAULT_FONT_CONFIG.letterSpacing,
    fontSizeScale: DEFAULT_FONT_CONFIG.fontSizeScale,
  });
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  // Fabric Canvas 编辑器状态
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [canvasTextObjects, setCanvasTextObjects] = useState<CanvasTextObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<CanvasTextObject | null>(null);
  const {
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    initHistory,
    saveState,
    undo,
    redo,
    clearHistory,
  } = useCanvasHistory(fabricCanvas);

  // 初始化 Dify conversationId（创建真实的数据库记录）
  // 如果创建失败，将使用本地 Tesseract.js OCR 作为降级方案
  useEffect(() => {
    let mounted = true;
    
    async function initConversation() {
      console.log("[Playground] 尝试初始化 Dify...");
      // 创建一个真实的 conversation 记录，满足外键约束
      const conversationId = await createPlaygroundConversation();
      if (!mounted) return;
      
      if (conversationId) {
        console.log("[Playground] ✓ Dify 已就绪:", conversationId);
        setIsConversationReady(true);
      } else {
        // Dify 不可用，但这不是致命错误
        // 用户仍然可以使用本地 OCR（不填写 Wording）
        console.warn("[Playground] ⚠ Dify 不可用，将使用本地 Tesseract.js OCR");
        console.warn("[Playground] 提示：如需使用 Dify AI 识别，请在主 Marriott 应用中测试");
        // 仍然设置为 ready，让用户可以使用本地 OCR
        setIsConversationReady(true);
      }
    }
    
    initConversation();
    
    return () => {
      mounted = false;
      // 组件卸载时清除
      setConversationId(null);
      setIsConversationReady(false);
    };
  }, []);

  // 处理文件选择
  const handleFileSelect = useCallback(
    async (files: FileList | null, target: "A" | "B") => {
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file.type.startsWith("image/")) {
        setError("请选择图片文件");
        return;
      }

      try {
        const dataUrl = await fileToDataUrl(file);
        const image = { dataUrl, name: file.name };

        if (target === "A") {
          setImageA(image);
        } else {
          setImageB(image);
        }
        setError(null);
        setResult(null);
      } catch {
        setError("图片读取失败");
      }
    },
    []
  );

  // 拖拽处理
  const createDragHandlers = (target: "A" | "B") => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      target === "A" ? setDraggingA(true) : setDraggingB(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      target === "A" ? setDraggingA(false) : setDraggingB(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      target === "A" ? setDraggingA(false) : setDraggingB(false);
      handleFileSelect(e.dataTransfer.files, target);
    },
  });

  // 执行差异检测
  const handleAnalyze = useCallback(async () => {
    if (!imageA || !imageB) {
      setError("请上传两张图片");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const config: Partial<DiffConfig> = {
        threshold,
        minAreaSize,
        dilateRadius,
        enableLineGrouping: true,
        lineOverlapThreshold: lineOverlapThreshold / 100,
        // 行合并配置
        enableLineMerge,
        lineMergeCenterYThreshold,
        lineMergeOverlapThreshold: lineMergeOverlapThreshold / 100,
        // X 距离阈值
        maxXGap,
      };

      const diffResult = await runImageDiff(
        {
          imageA: imageA.dataUrl,
          imageB: imageB.dataUrl,
          config,
          wording: wording.trim() || undefined,
        },
        { adapters: { logger: console } }
      );

      setResult(diffResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setIsProcessing(false);
    }
  }, [imageA, imageB, threshold, minAreaSize, dilateRadius, lineOverlapThreshold, enableLineMerge, lineMergeCenterYThreshold, lineMergeOverlapThreshold, maxXGap, wording]);

  // 下载结果
  const handleDownload = useCallback(
    (type: "visualized" | "mask" | "reconstructed") => {
      if (!result) return;
      let dataUrl: string | undefined;
      if (type === "visualized") dataUrl = result.visualizedImage;
      else if (type === "mask") dataUrl = result.diffMaskImage;
      else if (type === "reconstructed") dataUrl = result.reconstructedImage;
      if (dataUrl) {
        downloadDataUrl(dataUrl, `diff_${type}_${Date.now()}.png`);
      }
    },
    [result]
  );

  // 复制 OCR 结果
  const handleCopyOcrResult = useCallback(() => {
    if (!result?.fullText) return;
    navigator.clipboard.writeText(result.fullText);
  }, [result]);

  // 当分析完成后，初始化可编辑行数据和 Canvas 文字对象
  useEffect(() => {
    if (result?.lines) {
      const lines = linesToEditableLines(result.lines);
      setEditableLines(lines);
      setEditedImage(null); // 重置编辑后的图片

      // 初始化 Canvas 文字对象
      const textObjects = linesToCanvasTextObjects(result.lines, globalFont);
      setCanvasTextObjects(textObjects);
    }
  }, [result?.lines]);

  // Canvas 准备就绪后初始化历史
  const handleCanvasReady = useCallback((canvas: FabricCanvas) => {
    setFabricCanvas(canvas);
  }, []);

  // 初始化历史（在 canvas 和 textObjects 都准备好后）
  useEffect(() => {
    if (fabricCanvas && canvasTextObjects.length > 0) {
      // 延迟一下等待 canvas 渲染完成
      const timer = setTimeout(() => {
        initHistory();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [fabricCanvas, canvasTextObjects, initHistory]);

  // 修改选中对象的样式
  const handleStyleChange = useCallback(
    (property: string, value: string | number) => {
      if (!fabricCanvas || !selectedObject) return;

      const activeObject = fabricCanvas.getActiveObject();
      if (!activeObject) return;

      activeObject.set(property as keyof typeof activeObject, value);
      fabricCanvas.renderAll();
      saveState();

      // 更新选中对象状态
      setSelectedObject((prev) =>
        prev ? { ...prev, [property]: value } : null
      );
    },
    [fabricCanvas, selectedObject, saveState]
  );

  // 删除选中对象
  const handleDeleteObject = useCallback(() => {
    if (!fabricCanvas) return;
    const activeObject = fabricCanvas.getActiveObject();
    if (activeObject) {
      fabricCanvas.remove(activeObject);
      fabricCanvas.renderAll();
      setSelectedObject(null);
    }
  }, [fabricCanvas]);

  // 导出 Canvas 图片
  const handleExportCanvas = useCallback(() => {
    if (!fabricCanvas) return;
    const dataUrl = fabricCanvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 1,
    });
    downloadDataUrl(dataUrl, `canvas_export_${Date.now()}.png`);
  }, [fabricCanvas]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z 撤销
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Ctrl+Shift+Z 或 Ctrl+Y 重做
      if (
        (e.ctrlKey && e.shiftKey && e.key === "z") ||
        (e.ctrlKey && e.key === "y")
      ) {
        e.preventDefault();
        redo();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // 更新某一行的文字
  const handleTextChange = useCallback((lineIndex: number, newText: string) => {
    setEditableLines((prev) =>
      prev.map((line) =>
        line.lineIndex === lineIndex ? { ...line, editedText: newText } : line
      )
    );
  }, []);

  // 应用编辑，重新渲染
  const handleApplyEdits = useCallback(async () => {
    if (!imageA || editableLines.length === 0) return;

    setIsRendering(true);
    try {
      const output = await integrateTextEditor(
        imageA.dataUrl,
        editableLines,
        globalFont,
        { adapters: { logger: console } }
      );
      setEditedImage(output.renderedImage);
    } catch (err) {
      console.error("渲染失败:", err);
      setError(err instanceof Error ? err.message : "渲染失败");
    } finally {
      setIsRendering(false);
    }
  }, [imageA, editableLines, globalFont]);

  return (
    <div className="space-y-6">
      {/* 上传区域 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 图片 A */}
        <Card>
          <CardHeader>
            <CardTitle>📷 原图 (Before)</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "drop-zone flex min-h-[200px] cursor-pointer flex-col items-center justify-center p-4",
                draggingA && "dragging"
              )}
              {...createDragHandlers("A")}
              onClick={() => fileInputARef.current?.click()}
            >
              <input
                ref={fileInputARef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files, "A")}
              />
              {imageA ? (
                <div className="text-center">
                  <img
                    src={imageA.dataUrl}
                    alt="Image A"
                    className="mx-auto max-h-[180px] max-w-full rounded-md object-contain"
                  />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {imageA.name}
                  </p>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <svg
                    className="mx-auto mb-2 h-10 w-10"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p>拖拽或点击上传原图</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 图片 B */}
        <Card>
          <CardHeader>
            <CardTitle>📷 新图 (After)</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "drop-zone flex min-h-[200px] cursor-pointer flex-col items-center justify-center p-4",
                draggingB && "dragging"
              )}
              {...createDragHandlers("B")}
              onClick={() => fileInputBRef.current?.click()}
            >
              <input
                ref={fileInputBRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files, "B")}
              />
              {imageB ? (
                <div className="text-center">
                  <img
                    src={imageB.dataUrl}
                    alt="Image B"
                    className="mx-auto max-h-[180px] max-w-full rounded-md object-contain"
                  />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {imageB.name}
                  </p>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <svg
                    className="mx-auto mb-2 h-10 w-10"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p>拖拽或点击上传新图</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 配置和操作 */}
      <Card>
        <CardHeader>
          <CardTitle>⚙️ 检测配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="threshold">差异阈值: {threshold}</Label>
              <Input
                id="threshold"
                type="range"
                min={10}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                越大越不敏感
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minArea">最小区域: {minAreaSize}px</Label>
              <Input
                id="minArea"
                type="range"
                min={10}
                max={500}
                step={10}
                value={minAreaSize}
                onChange={(e) => setMinAreaSize(Number(e.target.value))}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                忽略小区域
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dilate">膨胀半径: {dilateRadius}px</Label>
              <Input
                id="dilate"
                type="range"
                min={0}
                max={10}
                value={dilateRadius}
                onChange={(e) => setDilateRadius(Number(e.target.value))}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                连接邻近像素
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lineOverlap">行重叠阈值: {lineOverlapThreshold}%</Label>
              <Input
                id="lineOverlap"
                type="range"
                min={20}
                max={80}
                step={5}
                value={lineOverlapThreshold}
                onChange={(e) => setLineOverlapThreshold(Number(e.target.value))}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                Y重叠比例判定同行
              </p>
            </div>
          </div>

          {/* 行合并后处理配置（新增） */}
          <div className="grid gap-4 md:grid-cols-4 pt-4 border-t border-border">
            <div className="space-y-2">
              <Label htmlFor="enableLineMerge" className="flex items-center gap-2">
                <input
                  id="enableLineMerge"
                  type="checkbox"
                  checked={enableLineMerge}
                  onChange={(e) => setEnableLineMerge(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                启用行合并后处理
              </Label>
              <p className="text-xs text-muted-foreground">
                合并重叠或相邻的行
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lineMergeCenterY">
                行合并Y差异阈值: {lineMergeCenterYThreshold}px
              </Label>
              <Input
                id="lineMergeCenterY"
                type="range"
                min={10}
                max={100}
                step={5}
                value={lineMergeCenterYThreshold}
                onChange={(e) => setLineMergeCenterYThreshold(Number(e.target.value))}
                className="h-2"
                disabled={!enableLineMerge}
              />
              <p className="text-xs text-muted-foreground">
                中心点Y差异小于此值则合并
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lineMergeOverlap">
                行合并重叠阈值: {lineMergeOverlapThreshold}%
              </Label>
              <Input
                id="lineMergeOverlap"
                type="range"
                min={10}
                max={80}
                step={5}
                value={lineMergeOverlapThreshold}
                onChange={(e) => setLineMergeOverlapThreshold(Number(e.target.value))}
                className="h-2"
                disabled={!enableLineMerge}
              />
              <p className="text-xs text-muted-foreground">
                Y范围重叠比例超过此值则合并
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxXGap">
                X距离阈值: {maxXGap}px
              </Label>
              <Input
                id="maxXGap"
                type="range"
                min={5}
                max={100}
                step={5}
                value={maxXGap}
                onChange={(e) => setMaxXGap(Number(e.target.value))}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                区域X间距超过此值则分行
              </p>
            </div>
          </div>

          {/* Wording 输入框 */}
          <div className="space-y-2">
            <Label htmlFor="wording" className="flex items-center gap-2">
              📝 参考文字 (Wording)
              {wording.trim() && (
                <span className="text-xs text-primary font-normal">
                  ✓ 将使用 Dify AI 识别
                </span>
              )}
            </Label>
            <textarea
              id="wording"
              value={wording}
              onChange={(e) => setWording(e.target.value)}
              placeholder="输入参考文字（多行），AI 将根据此内容识别图片中的文字...&#10;如果留空，将使用 OCR 识别"
              className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              提供参考文字后，每行白底图会调用 Dify AI 进行识别（并发 5 个，可能需要较长时间）
            </p>
          </div>

          <div className="flex gap-4">
            <Button
              size="lg"
              onClick={handleAnalyze}
              disabled={!imageA || !imageB || isProcessing}
            >
              {isProcessing ? (
                <>
                  <svg
                    className="mr-2 h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  分析中...
                </>
              ) : (
                <>🔍 开始检测</>
              )}
            </Button>

            {result && (
              <Button
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setImageA(null);
                  setImageB(null);
                  setEditableLines([]);
                  setEditedImage(null);
                  setCanvasTextObjects([]);
                  setSelectedObject(null);
                  setFabricCanvas(null);
                  setWording("");
                  clearHistory();
                }}
              >
                🔄 重新开始
              </Button>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 结果展示 */}
      {result && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>📊 检测结果</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload("visualized")}
              >
                下载标注图
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload("mask")}
              >
                下载掩码图
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 统计信息 */}
            <div className="grid gap-4 md:grid-cols-5">
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground">差异区域</p>
                <p className="text-2xl font-bold text-primary">
                  {result.regions.length}
                </p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground">文字行数</p>
                <p className="text-2xl font-bold text-primary">
                  {result.lines?.length || 0}
                </p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground">差异像素</p>
                <p className="text-2xl font-bold">
                  {result.totalDiffPixels.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground">差异占比</p>
                <p className="text-2xl font-bold">
                  {(
                    (result.totalDiffPixels /
                      (result.imageSize.width * result.imageSize.height)) *
                    100
                  ).toFixed(2)}%
                </p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm text-muted-foreground">图片尺寸</p>
                <p className="text-2xl font-bold">
                  {result.imageSize.width}×{result.imageSize.height}
                </p>
              </div>
            </div>

            {/* 行分组信息 */}
            {result.lines && result.lines.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">📝 按行分组（共 {result.lines.length} 行，已自动 OCR 识别）</p>
                  {result.fullText && (
                    <Button size="sm" variant="outline" onClick={handleCopyOcrResult}>
                      📋 复制识别结果
                    </Button>
                  )}
                </div>

                <div className="max-h-[400px] overflow-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr>
                        <th className="px-3 py-2 text-left w-16">行号</th>
                        <th className="px-3 py-2 text-left w-28">行白底图</th>
                        <th className="px-3 py-2 text-left w-36">颜色</th>
                        <th className="px-3 py-2 text-left w-16">区域数</th>
                        <th className="px-3 py-2 text-left w-28">中心坐标</th>
                        <th className="px-3 py-2 text-left w-24">尺寸</th>
                        <th className="px-3 py-2 text-left">识别文字</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.lines.map((line, index) => {
                        // 边框颜色（用于区分不同行）
                        const lineColor = line.lineColor || [255, 0, 0];
                        const lineColorStyle = `rgb(${lineColor[0]}, ${lineColor[1]}, ${lineColor[2]})`;
                        // 内容主色调（从原图提取）
                        const contentColor = line.contentColor || [128, 128, 128];
                        const contentColorStyle = `rgb(${contentColor[0]}, ${contentColor[1]}, ${contentColor[2]})`;
                        
                        return (
                          <tr key={line.lineIndex} className="border-t border-border">
                            <td className="px-3 py-2 font-medium">
                              <span 
                                className="inline-block px-2 py-0.5 rounded text-white text-xs font-bold"
                                style={{ backgroundColor: lineColorStyle }}
                              >
                                行{index + 1}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {line.linePreviewImage ? (
                                <img
                                  src={line.linePreviewImage}
                                  alt={`行${index + 1}预览`}
                                  className="max-h-10 max-w-24 rounded border border-border object-contain bg-white"
                                />
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-4 h-4 rounded border border-border shrink-0"
                                  style={{ backgroundColor: contentColorStyle }}
                                />
                                <code className="text-xs text-muted-foreground">
                                  rgb({contentColor[0]}, {contentColor[1]}, {contentColor[2]})
                                </code>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {line.regionIds.length} 个
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              ({Math.round(line.boundingBox.x + line.boundingBox.width / 2)}, {Math.round(line.boundingBox.y + line.boundingBox.height / 2)})
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {line.boundingBox.width}×{line.boundingBox.height}
                            </td>
                            <td className="px-3 py-2">
                              {line.recognizedText ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {line.recognizedText}
                                  </span>
                                  {line.confidence && line.confidence > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      ({line.confidence.toFixed(0)}%)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  (未识别)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* OCR 全文结果 */}
                {result.fullText && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">📄 识别全文</p>
                    <div className="rounded-md bg-muted p-4 font-mono text-sm whitespace-pre-wrap">
                      {result.fullText}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 图片预览 */}
            <Tabs value={resultTab} onValueChange={setResultTab}>
              <TabsList>
                <TabsTrigger value="visualized">边界框标注</TabsTrigger>
                <TabsTrigger value="mask">差异掩码</TabsTrigger>
                <TabsTrigger value="reconstructed">文字重建</TabsTrigger>
                <TabsTrigger value="compare">对比</TabsTrigger>
              </TabsList>

              <TabsContent value="visualized">
                <div className="flex justify-center rounded-md border border-border bg-muted/30 p-4">
                  <img
                    src={result.visualizedImage}
                    alt="Visualized"
                    className="max-h-[500px] max-w-full object-contain"
                  />
                </div>
              </TabsContent>

              <TabsContent value="mask">
                <div className="flex justify-center rounded-md border border-border bg-muted/30 p-4">
                  <img
                    src={result.diffMaskImage}
                    alt="Diff Mask"
                    className="max-h-[500px] max-w-full object-contain"
                  />
                </div>
              </TabsContent>

              <TabsContent value="reconstructed">
                <div className="space-y-4">
                  {/* 顶部工具栏 */}
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    {/* 撤销/重做 */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={undo}
                      disabled={!canUndo}
                      title="撤销 (Ctrl+Z)"
                    >
                      ← 撤销 {undoCount > 0 && `(${undoCount})`}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={redo}
                      disabled={!canRedo}
                      title="重做 (Ctrl+Shift+Z)"
                    >
                      重做 → {redoCount > 0 && `(${redoCount})`}
                    </Button>

                    <div className="w-px h-6 bg-border" />

                    {/* 导出 */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportCanvas}
                      disabled={!fabricCanvas}
                    >
                      📥 导出图片
                    </Button>

                    <div className="flex-1" />

                    {/* 提示 */}
                    <span className="text-xs text-muted-foreground">
                      快捷键: Ctrl+Z 撤销 | Ctrl+Shift+Z 重做 | Delete 删除
                    </span>
                  </div>

                  {/* 浮动工具栏（选中时显示） */}
                  {selectedObject && (
                    <FloatingToolbar
                      selectedObject={selectedObject}
                      onFontFamilyChange={(v) => handleStyleChange("fontFamily", v)}
                      onFontWeightChange={(v) => handleStyleChange("fontWeight", v)}
                      onFontStyleChange={(v) => handleStyleChange("fontStyle", v)}
                      onFontSizeChange={(v) => handleStyleChange("fontSize", v)}
                      onFillChange={(v) => handleStyleChange("fill", v)}
                      onDelete={handleDeleteObject}
                    />
                  )}

                  {/* Fabric Canvas 编辑器 */}
                  {imageA && (
                    <FabricCanvasComponent
                      backgroundImage={imageA.dataUrl}
                      initialTextObjects={canvasTextObjects}
                      globalFontConfig={{
                        fontFamily: globalFont.fontFamily,
                        fontWeight: globalFont.fontWeight,
                        fontStyle: globalFont.fontStyle,
                        fontSize: 24,
                      }}
                      onSelectionChange={setSelectedObject}
                      onCanvasReady={handleCanvasReady}
                      onStateChange={saveState}
                    />
                  )}

                  {!imageA && (
                    <div className="flex justify-center rounded-md border border-border bg-muted/30 p-8">
                      <p className="text-muted-foreground">
                        请先上传图片并运行差异检测
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="compare">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-center text-sm font-medium">原图</p>
                    <div className="flex justify-center rounded-md border border-border bg-muted/30 p-2">
                      <img
                        src={imageA?.dataUrl}
                        alt="Original"
                        className="max-h-[300px] max-w-full object-contain"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-center text-sm font-medium">新图（含标注）</p>
                    <div className="flex justify-center rounded-md border border-border bg-muted/30 p-2">
                      <img
                        src={result.visualizedImage}
                        alt="Modified"
                        className="max-h-[300px] max-w-full object-contain"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

