import React from 'react';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">
        ✏️ 生成指令 <span className="text-red-500">*</span>
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="描述你想生成的图片...&#10;&#10;例如：&#10;- 一只可爱的橘猫戴着圣诞帽，背景是雪景&#10;- 将图片中的人物放到海边日落场景中&#10;- 生成一个现代简约风格的咖啡店 logo"
        className="w-full h-40 p-4 rounded-xl border border-gray-200 bg-white/80 backdrop-blur-sm resize-none focus:ring-2 focus:ring-marriott-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <p className="text-xs text-gray-400">
        提示：描述越详细，生成效果越好。可以指定风格、颜色、光线等细节。
      </p>
    </div>
  );
};
