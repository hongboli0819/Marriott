import { Link } from "react-router-dom";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/ui/card";

/**
 * 首页
 */
export function HomePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* 介绍区 */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-foreground">图片差异检测工具</h2>
        <p className="mt-2 text-lg text-muted-foreground">
          对比两张图片，自动识别并定位新增的元素和文字
        </p>
      </div>

      {/* 功能卡片 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>🔍 智能差异检测</CardTitle>
            <CardDescription>基于像素级分析的差异识别</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>逐像素比较，精确定位差异</li>
              <li>支持 JPEG 压缩噪声过滤</li>
              <li>连通域分析聚合差异区域</li>
              <li>自动生成边界框</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>📊 可视化结果</CardTitle>
            <CardDescription>直观展示检测结果</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>边界框标注差异区域</li>
              <li>差异掩码高亮显示</li>
              <li>区域统计信息</li>
              <li>支持结果下载</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* 开始按钮 */}
      <div className="text-center">
        <Link to="/playground">
          <Button size="lg">
            开始检测
            <svg
              className="ml-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Button>
        </Link>
      </div>
    </div>
  );
}
