-- 创建异步任务表
-- 用于实现图片生成的轮询模式

CREATE TABLE IF NOT EXISTS async_tasks (
  -- 主键
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 任务类型：gemini-image-step1, gemini-image-step2
  task_type TEXT NOT NULL,
  
  -- 任务状态：pending（等待）, processing（处理中）, done（完成）, failed（失败）
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  
  -- 乐观锁ID：每次触发生成新的，确保只有一个实例处理
  trigger_id UUID NOT NULL,
  
  -- 任务输入参数（JSON格式）
  input_data JSONB NOT NULL DEFAULT '{}',
  
  -- 任务输出结果（JSON格式）
  output_data JSONB,
  
  -- 关联的对话ID
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
  
  -- 错误信息
  error_message TEXT,
  
  -- 重试次数
  retry_count INTEGER NOT NULL DEFAULT 0,
  
  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_async_tasks_status ON async_tasks(status);
CREATE INDEX IF NOT EXISTS idx_async_tasks_conversation_id ON async_tasks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_async_tasks_trigger_id ON async_tasks(trigger_id);
CREATE INDEX IF NOT EXISTS idx_async_tasks_created_at ON async_tasks(created_at);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_async_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_async_tasks_updated_at ON async_tasks;
CREATE TRIGGER trigger_async_tasks_updated_at
  BEFORE UPDATE ON async_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_async_tasks_updated_at();

-- RLS 策略
ALTER TABLE async_tasks ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户读取任务状态
CREATE POLICY "Allow public read async_tasks"
  ON async_tasks FOR SELECT
  USING (true);

-- 允许匿名用户创建任务
CREATE POLICY "Allow public insert async_tasks"
  ON async_tasks FOR INSERT
  WITH CHECK (true);

-- 允许服务角色更新任务
CREATE POLICY "Allow service role update async_tasks"
  ON async_tasks FOR UPDATE
  USING (true);
