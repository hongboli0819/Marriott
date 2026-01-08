/**
 * submit-task Edge Function
 * 
 * 职责：接收任务请求，创建数据库记录，异步触发处理
 * 
 * 按照开发规范第10章实现：
 * 1. 立即返回 taskId，不阻塞用户
 * 2. 异步触发 process-task
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface GeminiImageInputData {
  prompt: string;
  images: Array<{ base64: string; mimeType: string }>;
  aspectRatio: string;
  imageSize: string;
  count: number;
}

interface OcrInputData {
  wording: string;
  imageData: string;
  imageName?: string;
}

interface SubmitTaskRequest {
  taskType: string;  // "gemini-image-step1" | "gemini-image-step2" | "dify-ocr"
  conversationId: string;
  inputData: GeminiImageInputData | OcrInputData;
}

serve(async (req) => {
  // CORS 预检
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = `submit-${Date.now()}`;
  console.log(`[${requestId}] ========== submit-task ==========`);

  try {
    const body: SubmitTaskRequest = await req.json();
    const { taskType, conversationId, inputData } = body;

    console.log(`[${requestId}] 任务类型: ${taskType}`);
    console.log(`[${requestId}] 对话ID: ${conversationId}`);
    console.log(`[${requestId}] 图片数量: ${inputData.images?.length || 0}`);

    // 验证参数
    if (!taskType || !conversationId || !inputData) {
      return new Response(
        JSON.stringify({ success: false, error: "缺少必要参数" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 生成 trigger_id（乐观锁）
    const triggerId = crypto.randomUUID();

    // 创建任务记录
    // 注意：不使用 conversation_id 字段（有外键约束），将其存储在 input_data 中
    const { data: task, error: insertError } = await supabase
      .from("async_tasks")
      .insert({
        task_type: taskType,
        status: "pending",
        trigger_id: triggerId,
        // conversation_id 有外键约束，改为存储在 input_data 中
        input_data: {
          ...inputData,
          frontendConversationId: conversationId,
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error(`[${requestId}] 创建任务失败:`, insertError);
      return new Response(
        JSON.stringify({ success: false, error: "创建任务失败" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] 任务创建成功: ${task.id}`);

    // 根据任务类型选择不同的处理函数
    const isOcrTask = taskType === "dify-ocr";
    const processUrl = isOcrTask 
      ? `${SUPABASE_URL}/functions/v1/process-ocr-task`
      : `${SUPABASE_URL}/functions/v1/process-task`;
    
    console.log(`[${requestId}] 异步触发 ${isOcrTask ? 'process-ocr-task' : 'process-task'}...`);
    
    // 使用 EdgeRuntime.waitUntil 或直接 fire-and-forget
    fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        taskId: task.id,
        triggerId: triggerId,
      }),
    }).catch((err) => {
      console.error(`[${requestId}] 触发处理函数失败:`, err);
    });

    // 立即返回 taskId
    console.log(`[${requestId}] 返回 taskId: ${task.id}`);
    return new Response(
      JSON.stringify({
        success: true,
        taskId: task.id,
        status: "pending",
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
