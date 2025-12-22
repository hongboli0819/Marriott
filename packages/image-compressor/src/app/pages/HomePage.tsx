import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4">🖼️ Image Compressor</h1>
        <p className="text-xl text-muted-foreground mb-8">
          图片智能压缩模块 - 保持高画质，通过调整尺寸达到目标大小
        </p>
        
        <div className="grid gap-6 md:grid-cols-2 mb-12">
          <div className="p-6 border rounded-lg bg-card text-left">
            <h3 className="font-semibold mb-2">🎯 核心特性</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 固定高画质（quality=0.92）</li>
              <li>• 二分法查找最佳缩放比例</li>
              <li>• 确保最终大小 &lt; 目标大小</li>
              <li>• 差异控制在 1MB 以内</li>
            </ul>
          </div>
          
          <div className="p-6 border rounded-lg bg-card text-left">
            <h3 className="font-semibold mb-2">⚙️ 算法策略</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 不牺牲压缩质量</li>
              <li>• 智能调整分辨率</li>
              <li>• 追求最高分辨率解</li>
              <li>• 支持 JPEG/WebP 输出</li>
            </ul>
          </div>
        </div>
        
        <div className="p-6 border rounded-lg bg-muted/50 mb-8">
          <h3 className="font-semibold mb-3">📦 使用方式</h3>
          <pre className="text-left text-sm bg-background p-4 rounded-md overflow-x-auto">
{`import { compressImage } from '@muse/image-compressor';

const result = await compressImage({
  image: myImageBlob,
  targetSize: 5 * 1024 * 1024, // 5MB
});

console.log(\`缩放比例: \${result.finalScale * 100}%\`);
console.log(\`最终尺寸: \${result.finalWidth}x\${result.finalHeight}\`);`}
          </pre>
        </div>
        
        <Link
          to="/playground"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
        >
          前往 Playground 体验 →
        </Link>
      </div>
    </div>
  );
}


