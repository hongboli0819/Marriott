/**
 * 图像加载工具
 * 将 base64 DataURL 转换为 ImageData
 */

import type { CoreContext } from "../types/context";

/**
 * 从 DataURL 加载图像并获取 ImageData
 */
export async function loadImageAsImageData(
  dataUrl: string,
  ctx?: CoreContext
): Promise<ImageData> {
  const logger = ctx?.adapters?.logger;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      logger?.info?.("[LoadImage] 图像加载成功:", img.width, "x", img.height);

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const canvasCtx = canvas.getContext("2d")!;
      canvasCtx.drawImage(img, 0, 0);

      const imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
      resolve(imageData);
    };

    img.onerror = () => {
      const error = new Error("图像加载失败");
      logger?.error?.("[LoadImage]", error);
      reject(error);
    };

    img.src = dataUrl;
  });
}

/**
 * 将 ImageData 转换为 DataURL
 */
export function imageDataToDataUrl(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}
