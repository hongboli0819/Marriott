import React, { useState, useMemo } from "react";
import { DesignMode, DesignModeConfig, ImageSize, DESIGN_MODE_OPTIONS } from "@/core/types/io";
import { SparklesIcon, ImageIcon, TemplateIcon, CheckIcon } from "./Icon";
import { ImageUploader } from "./ImageUploader";
import { SizeSelector } from "./SizeSelector";

interface DesignModeSelectionProps {
  onConfirm: (config: DesignModeConfig, files: File[]) => void;
  selectedConfig?: DesignModeConfig;  // 已确认的配置（从数据库加载）
}

export const DesignModeSelection: React.FC<DesignModeSelectionProps> = ({
  onConfirm,
  selectedConfig,
}) => {
  // 临时选择状态
  const [pendingMode, setPendingMode] = useState<DesignMode | null>(null);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [pendingSize, setPendingSize] = useState<ImageSize | null>(null);
  
  // 是否已经最终确认过
  const isConfirmed = selectedConfig != null;
  
  // 当前高亮的模式
  const highlightedMode = selectedConfig?.mode || pendingMode;

  const getIcon = (iconName: string, className: string) => {
    switch (iconName) {
      case 'sparkles':
        return <SparklesIcon className={className} />;
      case 'image':
        return <ImageIcon className={className} />;
      case 'template':
        return <TemplateIcon className={className} />;
      default:
        return null;
    }
  };

  const handleOptionClick = (mode: DesignMode) => {
    if (isConfirmed) return;
    setPendingMode(mode);
    // 切换模式时清空输入
    setPendingImages([]);
    setPendingSize(null);
  };

  // 判断确认按钮是否可用
  const canConfirm = useMemo(() => {
    if (!pendingMode || isConfirmed) return false;
    
    const modeOption = DESIGN_MODE_OPTIONS.find((o) => o.id === pendingMode);
    
    // 开发中的模式不可确认
    if (modeOption?.status === 'developing') return false;
    
    // reference-image: 需要图片和尺寸
    if (pendingMode === 'reference-image') {
      return pendingImages.length > 0 && pendingSize !== null;
    }
    
    // template-text: 需要恰好1张图片和尺寸
    if (pendingMode === 'template-text') {
      return pendingImages.length === 1 && pendingSize !== null;
    }
    
    return false;
  }, [pendingMode, pendingImages, pendingSize, isConfirmed]);

  const handleConfirm = () => {
    if (!canConfirm || !pendingMode || !pendingSize) return;
    
    let config: DesignModeConfig;
    
    if (pendingMode === 'reference-image') {
      config = {
        mode: 'reference-image',
        images: [], // URLs will be filled after upload
        size: pendingSize,
      };
    } else if (pendingMode === 'template-text') {
      config = {
        mode: 'template-text',
        image: '', // URL will be filled after upload
        size: pendingSize,
      };
    } else {
      config = { mode: 'ai-creative' };
    }
    
    onConfirm(config, pendingImages);
  };

  // 渲染模式特定的输入区域
  const renderModeInput = () => {
    if (isConfirmed) {
      // 已确认，显示只读信息
      return renderConfirmedInfo();
    }
    
    if (!pendingMode) return null;
    
    const modeOption = DESIGN_MODE_OPTIONS.find((o) => o.id === pendingMode);
    
    // 开发中模式
    if (modeOption?.status === 'developing') {
      return (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-2 text-amber-700">
            <span className="text-lg">🚧</span>
            <span className="font-medium">该模块正在开发中，敬请期待...</span>
          </div>
        </div>
      );
    }
    
    // reference-image 模式
    if (pendingMode === 'reference-image') {
      return (
        <div className="mt-4 p-4 bg-card/60 border border-border/50 rounded-xl space-y-4">
          <h4 className="font-medium text-foreground">上传参考图片</h4>
          <ImageUploader
            files={pendingImages}
            onChange={setPendingImages}
            multiple={true}
            maxCount={5}
          />
          <SizeSelector
            value={pendingSize}
            onChange={setPendingSize}
          />
        </div>
      );
    }
    
    // template-text 模式
    if (pendingMode === 'template-text') {
      return (
        <div className="mt-4 p-4 bg-card/60 border border-border/50 rounded-xl space-y-4">
          <h4 className="font-medium text-foreground">上传模版图片</h4>
          <ImageUploader
            files={pendingImages}
            onChange={setPendingImages}
            multiple={false}
          />
          <SizeSelector
            value={pendingSize}
            onChange={setPendingSize}
          />
        </div>
      );
    }
    
    return null;
  };

  // 渲染已确认的信息
  const renderConfirmedInfo = () => {
    if (!selectedConfig) return null;
    
    if (selectedConfig.mode === 'ai-creative') {
      return (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 text-green-700">
            <CheckIcon className="w-5 h-5" />
            <span className="font-medium">已选择 AI 自主创意模式</span>
          </div>
        </div>
      );
    }
    
    if (selectedConfig.mode === 'reference-image') {
      return (
        <div className="mt-4 p-4 bg-card/60 border border-border/50 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckIcon className="w-4 h-4" />
            <span className="text-sm font-medium">已上传 {selectedConfig.images.length} 张参考图</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedConfig.images.map((url, i) => (
              <img 
                key={i} 
                src={url} 
                alt={`参考图 ${i + 1}`} 
                className="w-16 h-16 object-cover rounded-lg border border-border/50"
              />
            ))}
          </div>
          <div className="text-sm text-muted-foreground">
            尺寸：{selectedConfig.size}
          </div>
        </div>
      );
    }
    
    if (selectedConfig.mode === 'template-text') {
      return (
        <div className="mt-4 p-4 bg-card/60 border border-border/50 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckIcon className="w-4 h-4" />
            <span className="text-sm font-medium">已上传模版图片</span>
          </div>
          <img 
            src={selectedConfig.image} 
            alt="模版图" 
            className="w-24 h-24 object-cover rounded-lg border border-border/50"
          />
          <div className="text-sm text-muted-foreground">
            尺寸：{selectedConfig.size}
          </div>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="space-y-3 mt-4">
      {/* 选项列表 */}
      {DESIGN_MODE_OPTIONS.map((option, index) => {
        const isHighlighted = highlightedMode === option.id;
        const isDisabled = isConfirmed && !isHighlighted;
        const isDeveloping = option.status === 'developing';

        return (
          <button
            key={option.id}
            onClick={() => handleOptionClick(option.id)}
            disabled={isDisabled}
            className={`
              w-full flex items-start gap-4 p-4 rounded-xl text-left transition-all duration-200
              ${isHighlighted
                ? 'bg-marriott-600 text-white shadow-lg shadow-marriott-600/30 scale-[1.02]'
                : isDisabled
                  ? 'bg-muted/50 text-muted-foreground cursor-not-allowed opacity-50'
                  : 'bg-card/80 hover:bg-card border border-border/50 hover:border-marriott-300 hover:shadow-md cursor-pointer'
              }
            `}
          >
            {/* 序号 */}
            <div
              className={`
                flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                ${isHighlighted ? 'bg-white/20 text-white' : 'bg-marriott-100 text-marriott-600'}
                ${isDisabled ? 'opacity-50' : ''}
              `}
            >
              {index + 1}
            </div>

            {/* 图标 */}
            <div
              className={`
                flex-shrink-0 p-2 rounded-lg
                ${isHighlighted ? 'bg-white/20' : 'bg-marriott-50'}
                ${isDisabled ? 'opacity-50' : ''}
              `}
            >
              <span className={isHighlighted ? 'text-white' : 'text-marriott-600'}>
                {getIcon(option.icon, 'w-6 h-6')}
              </span>
            </div>

            {/* 文字内容 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`font-semibold text-base ${
                    isHighlighted ? 'text-white' : isDisabled ? 'text-muted-foreground' : 'text-foreground'
                  }`}
                >
                  {option.label}
                </span>
                {isDeveloping && !isHighlighted && (
                  <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                    开发中
                  </span>
                )}
              </div>
              <div
                className={`text-sm mt-1 ${
                  isHighlighted ? 'text-white/80' : 'text-muted-foreground'
                }`}
              >
                {option.description}
              </div>
            </div>

            {/* 勾选标记 */}
            {isConfirmed && isHighlighted && (
              <div className="flex-shrink-0 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                <CheckIcon className="w-4 h-4 text-marriott-600" />
              </div>
            )}
          </button>
        );
      })}

      {/* 模式特定输入区域 */}
      {renderModeInput()}

      {/* 确认按钮 */}
      {pendingMode && !isConfirmed && (
        <div className="flex justify-end mt-4 pt-2">
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`
              flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-md
              ${canConfirm
                ? 'bg-marriott-600 hover:bg-marriott-700 text-white shadow-marriott-600/30'
                : 'bg-muted text-muted-foreground cursor-not-allowed shadow-none'
              }
            `}
          >
            <CheckIcon className="w-4 h-4" />
            确认选择
          </button>
        </div>
      )}

      {/* 已确认提示 */}
      {isConfirmed && (
        <div className="flex items-center gap-2 mt-4 pt-2 text-green-600 text-sm">
          <CheckIcon className="w-4 h-4" />
          配置已保存，正在生成背景图...
        </div>
      )}
    </div>
  );
};
