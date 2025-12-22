-- 添加编辑后的图片字段
-- 用于保存用户在文字编辑器中编辑后的最终图片

-- 添加字段
ALTER TABLE chat_conversations
ADD COLUMN IF NOT EXISTS edited_image TEXT,
ADD COLUMN IF NOT EXISTS diff_analysis JSONB;

-- 添加注释
COMMENT ON COLUMN chat_conversations.edited_image IS '用户编辑后的最终图片 URL';
COMMENT ON COLUMN chat_conversations.diff_analysis IS '图片差异分析结果（JSON）';
