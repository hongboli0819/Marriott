import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = "AIzaSyBr-RyZJ6fRB5KBPmZOnvddYX5gDQnP2Yc";

// 使用 gemini-3-pro-image-preview 模型（高级图片生成模型）
const GEMINI_MODEL = "gemini-3-pro-image-preview";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ImageInput {
  base64: string;
  mimeType: string;
}

interface RequestBody {
  prompt: string;
  images: ImageInput[];
  aspectRatio: string;
  imageSize: string;
}

serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = `req-${Date.now()}`;
  console.log(`[${requestId}] ========== 新请求 ==========`);

  try {
    const body: RequestBody = await req.json();
    const { prompt, images, aspectRatio, imageSize } = body;

    console.log(`[${requestId}] 参数:`, {
      prompt: prompt?.substring(0, 100),
      imagesCount: images?.length || 0,
      aspectRatio,
      imageSize,
    });

    if (!prompt) {
      console.log(`[${requestId}] 错误: 缺少 prompt`);
      return new Response(
        JSON.stringify({ success: false, error: "请输入生成指令" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 构建请求内容
    const parts: any[] = [{ text: prompt }];

    // 添加图片
    if (images && images.length > 0) {
      console.log(`[${requestId}] 添加 ${images.length} 张图片`);
      for (const img of images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64,
          },
        });
      }
    }

    // 构建 Gemini API 请求
    // 参考: https://ai.google.dev/gemini-api/docs/image-generation
    // imageConfig 放在 generationConfig 内部，使用 camelCase
    const geminiRequest = {
      contents: [{ 
        parts 
      }],
      generationConfig: {
        responseModalities: ["Text", "Image"],
        // 图片配置 - 控制宽高比和分辨率
        imageConfig: {
          aspectRatio: aspectRatio || "1:1",
          imageSize: imageSize || "2K",
        },
      },
    };

    console.log(`[${requestId}] 调用模型: ${GEMINI_MODEL}`);
    console.log(`[${requestId}] 图片配置: aspectRatio=${aspectRatio}, imageSize=${imageSize}`);
    console.log(`[${requestId}] 请求体:`, JSON.stringify(geminiRequest).substring(0, 500));

    const startTime = Date.now();
    const response = await fetch(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(geminiRequest),
      }
    );

    const elapsed = Date.now() - startTime;
    console.log(`[${requestId}] API 响应: ${response.status}, 耗时: ${elapsed}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] API 错误详情:`, errorText);
      
      // 解析错误信息
      let errorMessage = `Gemini API 错误: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {}
      
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log(`[${requestId}] 响应结构:`, JSON.stringify(result).substring(0, 500));

    // 解析响应
    let imageBase64 = "";
    let text = "";

    if (result.candidates && result.candidates[0]?.content?.parts) {
      console.log(`[${requestId}] parts 数量: ${result.candidates[0].content.parts.length}`);
      
      for (const part of result.candidates[0].content.parts) {
        if (part.text) {
          text += part.text;
          console.log(`[${requestId}] 找到文本: ${part.text.substring(0, 100)}...`);
        } else if (part.inlineData) {
          imageBase64 = part.inlineData.data;
          console.log(`[${requestId}] 找到图片: ${imageBase64.substring(0, 50)}... (${imageBase64.length} chars)`);
        }
      }
    } else {
      console.log(`[${requestId}] 响应中没有 candidates 或 parts`);
      console.log(`[${requestId}] 完整响应:`, JSON.stringify(result));
    }

    if (!imageBase64) {
      console.log(`[${requestId}] 未生成图片，返回文本: ${text}`);
      return new Response(
        JSON.stringify({ success: false, error: "未能生成图片，请尝试修改指令", text }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] ✅ 成功生成图片`);
    return new Response(
      JSON.stringify({
        success: true,
        imageBase64,
        text,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[${requestId}] 异常:`, error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "服务器内部错误" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

