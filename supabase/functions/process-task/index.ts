/**
 * process-task Edge Function
 * 
 * 职责：执行实际的图片生成任务
 * 
 * 按照开发规范第10章实现：
 * 1. 使用乐观锁（trigger_id）防止重复处理
 * 2. 串行调用 Gemini API（避免并发限制）
 * 3. 更新任务状态和结果
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = "gemini-3-pro-image-preview";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProcessTaskRequest {
  taskId: string;
  triggerId: string;
}

interface InputData {
  prompt: string;
  images: Array<{ base64: string; mimeType: string }>;
  aspectRatio: string;
  imageSize: string;
  count: number;
}

// 单次调用 Gemini API（带重试）
async function callGeminiWithRetry(
  prompt: string,
  images: Array<{ base64: string; mimeType: string }>,
  aspectRatio: string,
  imageSize: string,
  requestId: string,
  maxRetries = 3
): Promise<{ success: boolean; imageBase64?: string; error?: string }> {
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = 3000 + attempt * 2000 + Math.random() * 2000;
      console.log(`[${requestId}] 第 ${attempt} 次重试，等待 ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      // 构建请求
      const parts: any[] = [{ text: prompt }];
      for (const img of images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64,
          },
        });
      }

      const geminiRequest = {
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["Text", "Image"],
          imageConfig: {
            aspectRatio: aspectRatio || "1:1",
            imageSize: imageSize || "1K",
          },
        },
      };

      console.log(`[${requestId}] 调用 Gemini API (attempt ${attempt})...`);
      const startTime = Date.now();
      
      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiRequest),
      });

      const elapsed = Date.now() - startTime;
      console.log(`[${requestId}] API 响应: ${response.status}, 耗时: ${elapsed}ms`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${requestId}] API 错误:`, errorText);
        
        // 如果是 overloaded 错误，继续重试
        if (errorText.includes("overloaded") && attempt < maxRetries) {
          continue;
        }
        
        return { success: false, error: `API 错误: ${response.status}` };
      }

      const result = await response.json();
      
      // 解析响应
      let imageBase64 = "";
      if (result.candidates?.[0]?.content?.parts) {
        for (const part of result.candidates[0].content.parts) {
          if (part.inlineData) {
            imageBase64 = part.inlineData.data;
            break;
          }
        }
      }

      if (!imageBase64) {
        console.log(`[${requestId}] 未生成图片`);
        if (attempt < maxRetries) continue;
        return { success: false, error: "未能生成图片" };
      }

      console.log(`[${requestId}] ✅ 成功生成图片 (${imageBase64.length} chars)`);
      return { success: true, imageBase64 };

    } catch (error) {
      console.error(`[${requestId}] 异常:`, error);
      if (attempt < maxRetries) continue;
      return { success: false, error: error.message || "网络错误" };
    }
  }

  return { success: false, error: "达到最大重试次数" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = `process-${Date.now()}`;
  console.log(`[${requestId}] ========== process-task ==========`);

  try {
    const body: ProcessTaskRequest = await req.json();
    const { taskId, triggerId } = body;

    console.log(`[${requestId}] 任务ID: ${taskId}`);
    console.log(`[${requestId}] 触发ID: ${triggerId}`);

    if (!taskId || !triggerId) {
      return new Response(
        JSON.stringify({ success: false, error: "缺少必要参数" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 使用乐观锁获取并更新任务状态
    const { data: task, error: updateError } = await supabase
      .from("async_tasks")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("trigger_id", triggerId)  // 乐观锁
      .eq("status", "pending")       // 只处理 pending 状态的任务
      .select()
      .single();

    if (updateError || !task) {
      console.log(`[${requestId}] 任务已被其他实例处理或不存在`);
      return new Response(
        JSON.stringify({ success: false, error: "任务已被处理" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] 开始处理任务: ${task.task_type}`);
    
    const inputData: InputData = task.input_data;
    const { prompt, images, aspectRatio, imageSize, count } = inputData;

    console.log(`[${requestId}] 需要生成 ${count} 张图片`);

    // 串行生成图片（避免 Gemini API 并发限制）
    const generatedImages: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < count; i++) {
      console.log(`[${requestId}] 生成第 ${i + 1}/${count} 张图片...`);
      
      const result = await callGeminiWithRetry(
        prompt,
        images,
        aspectRatio,
        imageSize,
        `${requestId}-img${i}`
      );

      if (result.success && result.imageBase64) {
        generatedImages.push(result.imageBase64);
      } else {
        errors.push(result.error || "未知错误");
      }

      // 每张图片之间间隔 1 秒
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`[${requestId}] 生成完成: 成功 ${generatedImages.length}/${count} 张`);

    // 更新任务结果
    const isSuccess = generatedImages.length > 0;
    const { error: finalUpdateError } = await supabase
      .from("async_tasks")
      .update({
        status: isSuccess ? "done" : "failed",
        completed_at: new Date().toISOString(),
        output_data: {
          generatedImages,
          successCount: generatedImages.length,
          totalCount: count,
        },
        error_message: errors.length > 0 ? errors.join("; ") : null,
      })
      .eq("id", taskId);

    if (finalUpdateError) {
      console.error(`[${requestId}] 更新任务状态失败:`, finalUpdateError);
    }

    console.log(`[${requestId}] 任务处理完成`);
    return new Response(
      JSON.stringify({
        success: isSuccess,
        successCount: generatedImages.length,
        totalCount: count,
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
