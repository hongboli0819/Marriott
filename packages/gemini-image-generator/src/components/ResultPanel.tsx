import React from 'react';
import type { GeneratedImage } from '../types';
import { downloadImage, downloadAllImages } from '../services/geminiApi';

interface ResultPanelProps {
  results: GeneratedImage[];
  isGenerating: boolean;
  progress: number;
  total: number;
  error?: string;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  results,
  isGenerating,
  progress,
  total,
  error,
}) => {
  const handleDownload = (image: GeneratedImage, index: number) => {
    downloadImage(image.base64, `generated-image-${index + 1}.png`);
  };

  const handleDownloadAll = () => {
    downloadAllImages(results.map((img, index) => ({ base64: img.base64, index })));
  };

  // 空状态
  if (results.length === 0 && !isGenerating && !error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400">
        <svg className="w-24 h-24 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-lg">生成的图片将在这里显示</p>
        <p className="text-sm mt-1">输入指令后点击"生成图片"</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-800">
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-marriott-500 rounded-full animate-pulse"></span>
              生成中 {progress}/{total}
            </span>
          ) : results.length > 0 ? (
            `生成结果 (${results.length} 张)`
          ) : (
            '生成结果'
          )}
        </h3>
        {results.length > 1 && !isGenerating && (
          <button
            onClick={handleDownloadAll}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            全部下载
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* 图片网格 */}
      <div className="flex-1 overflow-y-auto">
        <div className={`grid gap-4 ${results.length === 1 ? 'grid-cols-1' : results.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {results.map((image, index) => (
            <div key={image.id} className="relative group">
              <div className="aspect-square rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white">
                <img
                  src={`data:image/png;base64,${image.base64}`}
                  alt={`Generated ${index + 1}`}
                  className="w-full h-full object-contain"
                />
              </div>
              {/* 下载按钮悬浮层 */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                <button
                  onClick={() => handleDownload(image, index)}
                  className="bg-white text-gray-800 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-100 transition-colors shadow-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  下载
                </button>
              </div>
              {/* 序号标签 */}
              <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md">
                {index + 1}/{results.length}
              </div>
            </div>
          ))}

          {/* 生成中的占位 */}
          {isGenerating && Array.from({ length: total - results.length }).map((_, i) => (
            <div key={`placeholder-${i}`} className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50/50">
              <div className="text-center text-gray-400">
                <svg className="w-8 h-8 mx-auto mb-2 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm">等待生成...</span>
              </div>
            </div>
          ))}
        </div>

        {/* 文字说明 */}
        {results.length > 0 && results.some(r => r.text) && (
          <div className="mt-4 p-4 bg-gray-50 rounded-xl">
            <h4 className="text-sm font-medium text-gray-700 mb-2">AI 说明</h4>
            {results.map((image, index) => image.text && (
              <p key={image.id} className="text-sm text-gray-600 mb-2 last:mb-0">
                <span className="font-medium">图 {index + 1}：</span>{image.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
