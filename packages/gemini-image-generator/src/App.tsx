import React, { useState, useCallback } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { PromptInput } from './components/PromptInput';
import { SizeSelector } from './components/SizeSelector';
import { CountSelector } from './components/CountSelector';
import { GenerateButton } from './components/GenerateButton';
import { ResultPanel } from './components/ResultPanel';
import { generateImage, generateId } from './services/geminiApi';
import type { UploadedImage, GeneratedImage, AspectRatio, ImageSize } from './types';

function App() {
  // 上传的图片
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  
  // 生成指令
  const [prompt, setPrompt] = useState('');
  
  // 尺寸设置
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [imageSize, setImageSize] = useState<ImageSize>('2K');
  
  // 生成数量
  const [count, setCount] = useState(1);
  
  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // 生成结果
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | undefined>();

  // 开始生成（并发）
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('请输入生成指令');
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setResults([]);
    setError(undefined);

    // 构建请求参数
    const requestParams = {
      prompt: prompt.trim(),
      images: uploadedImages.map(img => ({
        base64: img.base64,
        mimeType: img.mimeType,
      })),
      aspectRatio,
      imageSize,
    };

    // 创建并发请求数组
    const promises = Array.from({ length: count }, (_, i) => 
      generateImage(requestParams).then(result => {
        // 每完成一个，更新进度
        setProgress(prev => prev + 1);
        return { index: i, result };
      })
    );

    try {
      // 并发执行所有请求
      const responses = await Promise.allSettled(promises);
      
      // 收集成功的结果
      const successResults: GeneratedImage[] = [];
      let firstError: string | undefined;

      responses.forEach((response, i) => {
        if (response.status === 'fulfilled') {
          const { result } = response.value;
          if (result.success && result.imageBase64) {
            successResults.push({
              id: generateId(),
              base64: result.imageBase64,
              text: result.text,
              timestamp: Date.now(),
            });
          } else {
            console.error(`第 ${i + 1} 张生成失败:`, result.error);
            if (!firstError) firstError = result.error;
          }
        } else {
          console.error(`第 ${i + 1} 张生成异常:`, response.reason);
          if (!firstError) firstError = response.reason?.message || '生成失败';
        }
      });

      // 按时间戳排序（保持顺序）
      successResults.sort((a, b) => a.timestamp - b.timestamp);
      setResults(successResults);

      if (successResults.length === 0 && firstError) {
        setError(firstError);
      }
    } catch (err) {
      console.error('并发生成异常:', err);
      setError(err instanceof Error ? err.message : '生成失败，请重试');
    }

    setIsGenerating(false);
  }, [prompt, uploadedImages, aspectRatio, imageSize, count]);

  return (
    <div className="min-h-screen p-6 md:p-8">
      {/* 头部 */}
      <header className="max-w-7xl mx-auto mb-8">
        <div className="glass-strong rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-marriott-500 to-marriott-700 flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Gemini Image Generator</h1>
              <p className="text-sm text-gray-500">使用 Gemini AI 生成高质量图片</p>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧：设置面板 */}
          <div className="glass-strong rounded-2xl p-6 shadow-xl space-y-6">
            {/* 图片上传 */}
            <ImageUploader
              images={uploadedImages}
              onImagesChange={setUploadedImages}
              maxImages={14}
            />

            {/* 分隔线 */}
            <hr className="border-gray-200" />

            {/* 指令输入 */}
            <PromptInput
              value={prompt}
              onChange={setPrompt}
              disabled={isGenerating}
            />

            {/* 尺寸选择 */}
            <SizeSelector
              aspectRatio={aspectRatio}
              imageSize={imageSize}
              onAspectRatioChange={setAspectRatio}
              onImageSizeChange={setImageSize}
              disabled={isGenerating}
            />

            {/* 数量选择 */}
            <CountSelector
              count={count}
              onChange={setCount}
              min={1}
              max={10}
              disabled={isGenerating}
            />

            {/* 生成按钮 */}
            <GenerateButton
              onClick={handleGenerate}
              isGenerating={isGenerating}
              progress={progress}
              total={count}
              disabled={!prompt.trim()}
            />
          </div>

          {/* 右侧：结果面板 */}
          <div className="glass-strong rounded-2xl p-6 shadow-xl min-h-[500px]">
            <ResultPanel
              results={results}
              isGenerating={isGenerating}
              progress={progress}
              total={count}
              error={error}
            />
          </div>
        </div>
      </main>

      {/* 底部 */}
      <footer className="max-w-7xl mx-auto mt-8 text-center text-sm text-gray-400">
        <p>Powered by Google Gemini API • Built with React + Vite</p>
      </footer>
    </div>
  );
}

export default App;
