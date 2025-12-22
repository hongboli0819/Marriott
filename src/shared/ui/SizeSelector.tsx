import React from "react";
import { ImageSize, IMAGE_SIZE_OPTIONS } from "@/core/types/io";

interface SizeSelectorProps {
  value: ImageSize | null;
  onChange: (size: ImageSize) => void;
  disabled?: boolean;
}

// 尺寸图标组件
const SizeIcon: React.FC<{ icon: string; className?: string }> = ({ icon, className = "w-6 h-6" }) => {
  const baseClass = `${className} border-2 border-current rounded`;
  
  switch (icon) {
    case 'square':
      return <div className={`${baseClass} aspect-square w-5 h-5`} />;
    case 'landscape':
      return <div className={`${baseClass} w-6 h-4`} />;
    case 'portrait':
      return <div className={`${baseClass} w-4 h-6`} />;
    case 'wide':
      return <div className={`${baseClass} w-7 h-4`} />;
    case 'tall':
      return <div className={`${baseClass} w-3 h-6`} />;
    default:
      return <div className={`${baseClass} aspect-square w-5 h-5`} />;
  }
};

export const SizeSelector: React.FC<SizeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">选择尺寸</label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {IMAGE_SIZE_OPTIONS.map((option) => {
          const isSelected = value === option.id;
          
          return (
            <button
              key={option.id}
              onClick={() => !disabled && onChange(option.id)}
              disabled={disabled}
              className={`
                flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all
                ${isSelected
                  ? 'bg-marriott-600 text-white shadow-md'
                  : disabled
                    ? 'bg-muted/50 text-muted-foreground cursor-not-allowed opacity-50'
                    : 'bg-card/80 hover:bg-card border border-border/50 hover:border-marriott-300 cursor-pointer'
                }
              `}
            >
              <SizeIcon 
                icon={option.icon} 
                className={isSelected ? 'text-white' : 'text-marriott-500'}
              />
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-foreground'}`}>
                  {option.label}
                </div>
                <div className={`text-xs ${isSelected ? 'text-white/70' : 'text-muted-foreground'}`}>
                  {option.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
