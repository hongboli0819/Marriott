-- ============================================
-- Marriott AI Chat 数据库表
-- 用于存储用户对话和消息历史
-- ============================================

-- 1. 对话表 (chat_conversations)
CREATE TABLE IF NOT EXISTS chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    title TEXT,
    dify_conversation_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_dify_conversation_id ON chat_conversations(dify_conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_created_at ON chat_conversations(created_at DESC);

-- 2. 消息表 (chat_messages)
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    dify_message_id TEXT,
    query TEXT NOT NULL,
    status TEXT,
    content TEXT,
    response TEXT,
    has_images BOOLEAN DEFAULT FALSE,
    image_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- 3. 更新 updated_at 触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. 为 chat_conversations 添加触发器
DROP TRIGGER IF EXISTS update_chat_conversations_updated_at ON chat_conversations;
CREATE TRIGGER update_chat_conversations_updated_at
    BEFORE UPDATE ON chat_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS 策略（允许所有操作，因为我们使用 service_role）
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- 允许 service_role 访问
CREATE POLICY "Allow service role full access to chat_conversations"
    ON chat_conversations
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow service role full access to chat_messages"
    ON chat_messages
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 6. 添加注释
COMMENT ON TABLE chat_conversations IS 'Marriott AI 聊天对话表';
COMMENT ON TABLE chat_messages IS 'Marriott AI 聊天消息表';
COMMENT ON COLUMN chat_messages.status IS 'Dify 返回的 status 字段';
COMMENT ON COLUMN chat_messages.content IS 'Dify 返回的 content 字段';
COMMENT ON COLUMN chat_messages.response IS 'Dify 返回的 response 字段（展示给用户）';

