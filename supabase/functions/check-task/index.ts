/**
 * check-task Edge Function
 * 
 * 职责：查询任务状态，支持批量查询
 * 
 * 按照开发规范第10章实现：
 * 1. 支持单个任务查询
 * 2. 支持批量任务查询
 * 3. 返回任务状态和结果
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

interface CheckTaskRequest {
  taskIds: string[];  // 支持批量查询
}

interface TaskResult {
  taskId: string;
  status: "pending" | "processing" | "done" | "failed";
  outputData?: {
    generatedImages: string[];
    successCount: number;
    totalCount: number;
  };
  errorMessage?: string;
  triggerId?: string;  // 用于重新触发 pending 任务
  createdAt: string;
  updatedAt: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = `check-${Date.now()}`;
  console.log(`[${requestId}] ========== check-task ==========`);

  try {
    const body: CheckTaskRequest = await req.json();
    const { taskIds } = body;

    if (!taskIds || taskIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "缺少 taskIds 参数" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[${requestId}] 查询 ${taskIds.length} 个任务`);

    // 批量查询任务（包含 trigger_id 用于重新触发）
    const { data: tasks, error: queryError } = await supabase
      .from("async_tasks")
      .select("id, status, output_data, error_message, trigger_id, created_at, updated_at")
      .in("id", taskIds);

    if (queryError) {
      console.error(`[${requestId}] 查询失败:`, queryError);
      return new Response(
        JSON.stringify({ success: false, error: "查询失败" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 格式化结果
    const results: TaskResult[] = (tasks || []).map((task) => ({
      taskId: task.id,
      status: task.status,
      outputData: task.output_data,
      errorMessage: task.error_message,
      triggerId: task.trigger_id,  // 用于重新触发 pending 任务
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    }));

    console.log(`[${requestId}] 返回 ${results.length} 个结果`);

    // 统计状态
    const statusCounts = {
      pending: results.filter(r => r.status === "pending").length,
      processing: results.filter(r => r.status === "processing").length,
      done: results.filter(r => r.status === "done").length,
      failed: results.filter(r => r.status === "failed").length,
    };
    console.log(`[${requestId}] 状态统计:`, statusCounts);

    return new Response(
      JSON.stringify({
        success: true,
        tasks: results,
        allCompleted: statusCounts.pending === 0 && statusCounts.processing === 0,
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
