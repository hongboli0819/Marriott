-- ============================================
-- 为 chat_conversations 添加 design_mode 字段
-- 记录用户选择的设计模式
-- ============================================

-- 添加字段（带约束）
ALTER TABLE chat_conversations 
ADD COLUMN IF NOT EXISTS design_mode TEXT 
CHECK (design_mode IN ('ai-creative', 'reference-image', 'template-text'));

-- 添加注释
COMMENT ON COLUMN chat_conversations.design_mode IS '用户选择的设计模式：ai-creative(AI自主创意)、reference-image(参考图)、template-text(模版替换)';

-- ============================================
-- 为 chat_messages 添加 is_confirmed 字段
-- 记录用户是否确认了 status=yes 的消息
-- ============================================

ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN chat_messages.is_confirmed IS '用户是否点击了确认按钮（仅对 status=yes 的消息有意义）';

-- ============================================
-- 为 chat_conversations 添加 design_mode_config 字段
-- 存储模式相关的完整配置（图片URLs、尺寸等）
-- ============================================

ALTER TABLE chat_conversations 
ADD COLUMN IF NOT EXISTS design_mode_config JSONB;

COMMENT ON COLUMN chat_conversations.design_mode_config IS '设计模式配置，包含图片URLs和尺寸选择';

-- ============================================
-- Storage 策略：允许上传和读取 design-images bucket
-- ============================================

-- 允许上传图片
CREATE POLICY "Allow public uploads" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'design-images');

-- 允许读取图片
CREATE POLICY "Allow public reads" ON storage.objects 
FOR SELECT USING (bucket_id = 'design-images');
