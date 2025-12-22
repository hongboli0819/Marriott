-- ============================================
-- 添加追踪列：支持每次 Dify 新对话策略
-- 
-- 策略：每次调用 Dify 都是新对话，通过 chat_history 传递上下文
-- 在我们的数据库中追踪逻辑对话和问询序号
-- ============================================

-- 1. 为 chat_conversations 添加 frontend_id 列
-- 用于通过前端生成的对话 ID 来查找对话
ALTER TABLE chat_conversations 
ADD COLUMN IF NOT EXISTS frontend_id TEXT;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_chat_conversations_frontend_id 
ON chat_conversations(frontend_id);

-- 2. 为 chat_messages 添加 dify_conversation_id 列
-- 每次 Dify 返回的新 conversation_id（每次问询都不同）
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS dify_conversation_id TEXT;

-- 3. 为 chat_messages 添加 query_sequence 列
-- 问询序号 (1, 2, 3...)，用于追踪这是逻辑对话的第几次问询
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS query_sequence INTEGER DEFAULT 1;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_chat_messages_dify_conversation_id 
ON chat_messages(dify_conversation_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_query_sequence 
ON chat_messages(query_sequence);

-- 4. 添加注释
COMMENT ON COLUMN chat_conversations.frontend_id IS '前端生成的对话 ID，用于关联同一逻辑对话';
COMMENT ON COLUMN chat_messages.dify_conversation_id IS '每次 Dify 返回的 conversation_id（每次问询都是新的）';
COMMENT ON COLUMN chat_messages.query_sequence IS '问询序号：这是逻辑对话的第几次问询 (1, 2, 3...)';

