import { useState, useCallback, useRef } from "react";
import { compressImage, type CompressImageOutput } from "@/core";
import { cn, formatBytes, formatPercent } from "@/shared/lib/utils";

export function PlaygroundPage() {
  const [file, setFile] = useState<File | null>(null);
  const [targetSizeMB, setTargetSizeMB] = useState(5);
  const [result, setResult] = useState<CompressImageOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type.startsWith("image/")) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
      setLogs([]);
    }
  }, []);
  
  const handleCompress = useCallback(async () => {
    if (!file) return;
    
    setLoading(true);
    setError(null);
    setLogs([]);
    
    try {
      const output = await compressImage(
        {
          image: file,
          targetSize: targetSizeMB * 1024 * 1024,
        },
        {
          adapters: {
            logger: {
              info: (msg, data) => {
                const logEntry = data 
                  ? `${msg} ${JSON.stringify(data)}`
                  : msg;
                setLogs(prev => [...prev, logEntry]);
              },
            },
          },
        }
      );
      
      setResult(output);
    } catch (err) {
      setError(err instanceof Error ? err.message : "压缩失败");
    } finally {
      setLoading(false);
    }
  }, [file, targetSizeMB]);
  
  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compressed_${file.name.replace(/\.[^.]+$/, '')}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, file]);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Playground</h1>
      <p className="text-muted-foreground mb-8">
        上传图片，体验智能压缩（保持高画质，调整尺寸）
      </p>
      
      {/* 配置 */}
      <div className="mb-6 p-4 border rounded-lg bg-card">
        <label className="block text-sm font-medium mb-2">
          目标大小: <span className="text-primary font-semibold">{targetSizeMB} MB</span>
        </label>
        <input
          type="range"
          min="1"
          max="20"
          step="0.5"
          value={targetSizeMB}
          onChange={(e) => setTargetSizeMB(Number(e.target.value))}
          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
          disabled={loading}
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>1 MB</span>
          <span>20 MB</span>
        </div>
      </div>
      
      {/* 上传区域 */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors mb-6",
          loading ? "opacity-50 cursor-not-allowed" : "hover:border-primary"
        )}
        onClick={() => !loading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          disabled={loading}
        />
        {file ? (
          <div>
            <p className="font-medium text-lg">{file.name}</p>
            <p className="text-muted-foreground">
              原始大小: <span className="font-semibold">{formatBytes(file.size)}</span>
            </p>
          </div>
        ) : (
          <div>
            <p className="text-2xl mb-2">📷</p>
            <p className="text-muted-foreground">点击选择图片</p>
          </div>
        )}
      </div>
      
      {/* 压缩按钮 */}
      {file && (
        <button
          onClick={handleCompress}
          disabled={loading}
          className="w-full bg-primary text-primary-foreground py-3 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors mb-6"
        >
          {loading ? "压缩中..." : "开始压缩"}
        </button>
      )}
      
      {/* 日志 */}
      {logs.length > 0 && (
        <div className="mb-6 p-4 border rounded-lg bg-muted/30">
          <h3 className="font-medium mb-2 text-sm">处理日志</h3>
          <div className="max-h-40 overflow-y-auto text-xs font-mono space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="text-muted-foreground">{log}</div>
            ))}
          </div>
        </div>
      )}
      
      {/* 错误 */}
      {error && (
        <div className="p-4 border border-destructive rounded-lg bg-destructive/10 text-destructive mb-6">
          ❌ {error}
        </div>
      )}
      
      {/* 结果 */}
      {result && (
        <div className="border rounded-lg p-6 bg-card">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            ✅ 压缩完成
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <div className="text-xs text-muted-foreground mb-1">原始大小</div>
              <div className="font-semibold">{formatBytes(result.originalSize)}</div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <div className="text-xs text-muted-foreground mb-1">最终大小</div>
              <div className="font-semibold text-primary">{formatBytes(result.finalSize)}</div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <div className="text-xs text-muted-foreground mb-1">缩放比例</div>
              <div className="font-semibold">{formatPercent(result.finalScale)}</div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <div className="text-xs text-muted-foreground mb-1">压缩比</div>
              <div className="font-semibold">{formatPercent(result.compressionRatio)}</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm mb-6">
            <div className="flex justify-between">
              <span className="text-muted-foreground">是否压缩:</span>
              <span>{result.wasCompressed ? "是" : "否"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">画质:</span>
              <span>{formatPercent(result.finalQuality)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">最终尺寸:</span>
              <span>{result.finalWidth}x{result.finalHeight}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">迭代次数:</span>
              <span>{result.stats.iterations}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">耗时:</span>
              <span>{result.stats.duration} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">与目标差异:</span>
              <span>{formatBytes(result.stats.differenceFromTarget)}</span>
            </div>
          </div>
          
          {result.wasCompressed && (
            <button
              onClick={handleDownload}
              className="w-full border py-2 rounded-md hover:bg-muted transition-colors"
            >
              下载压缩后的图片
            </button>
          )}
        </div>
      )}
    </div>
  );
}


