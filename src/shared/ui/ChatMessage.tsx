import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message, Role, DesignModeConfig } from "@/core/types/io";
import { SparklesIcon, UserIcon, CheckIcon, EditIcon } from "./Icon";
import { DesignModeSelection } from "./DesignModeSelection";
import { GeneratedImagesSelector } from "./GeneratedImagesSelector";

// 保存图标
const SaveIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

interface ChatMessageProps {
  message: Message;
  canEdit?: boolean;                 // 是否可以编辑（status=yes）
  isEditing?: boolean;               // 是否处于编辑中
  editedContent?: string;            // 编辑中的内容
  onStartEdit?: () => void;          // 点击编辑按钮
  onContentChange?: (content: string) => void;  // 内容变化回调
  onSave?: () => void;               // 保存按钮回调（只保存）
  onConfirm?: () => void;            // 确认按钮回调（保存并确认）
  saveStatus?: 'idle' | 'saving' | 'saved';     // 保存状态
  onDesignModeConfirm?: (config: DesignModeConfig, files: File[]) => void;  // 设计模式确认回调
  
  // 图片选择相关（用于 image-generation-result 消息类型）
  onImageSelect?: (index: number) => void;   // 选择生成的图片
  onRegenerate?: () => void;         // 重新生成
  isGenerating?: boolean;            // 是否正在生成（用于显示 loading 状态）
  
  // 文字编辑相关（用于 text-edit-ready 消息类型）
  onOpenTextEditor?: () => void;     // 打开文字编辑弹窗
  onDownloadImage?: () => void;      // 下载图片
  onFinalConfirm?: () => void;       // 最终确认
  isTextEditFinalized?: boolean;     // 是否已最终确认
}

// Markdown 渲染组件
const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // 标题样式
        h1: ({ children }) => (
          <h1 className="text-xl font-bold text-foreground mb-3 mt-4 first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-bold text-foreground mb-2 mt-4 first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold text-foreground mb-2 mt-3 first:mt-0">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-sm font-semibold text-foreground mb-1 mt-2">
            {children}
          </h4>
        ),
        // 段落
        p: ({ children }) => (
          <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
        ),
        // 粗体
        strong: ({ children }) => (
          <strong className="font-bold text-foreground">{children}</strong>
        ),
        // 斜体
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        // 列表
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-3 space-y-1 pl-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-3 space-y-1 pl-1">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        // 表格
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded-lg border border-border/50">
            <table className="min-w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/50">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-border/30">{children}</tbody>
        ),
        tr: ({ children }) => (
          <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
            {children}
          </td>
        ),
        // 代码块
        code: ({ className, children }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-muted/70 text-sm font-mono text-foreground">
                {children}
              </code>
            );
          }
          return (
            <code className="block p-3 rounded-lg bg-muted/50 text-sm font-mono overflow-x-auto my-2">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-2">{children}</pre>
        ),
        // 分隔线
        hr: () => (
          <hr className="my-4 border-border/50" />
        ),
        // 引用块
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-marriott-500 pl-4 my-3 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
        // 链接
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-marriott-600 hover:underline"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

export const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message,
  canEdit = false,
  isEditing = false,
  editedContent,
  onStartEdit,
  onContentChange,
  onSave,
  onConfirm,
  saveStatus = 'idle',
  onDesignModeConfirm,
  onImageSelect,
  onRegenerate,
  isGenerating = false,
  onOpenTextEditor,
  onDownloadImage,          // 下载图片回调
  onFinalConfirm,           // 最终确认回调
  isTextEditFinalized = false,  // 是否已最终确认
}) => {
  const isUser = message.role === Role.USER;
  const isDesignModeSelection = message.messageType === 'design-mode-selection';
  const isImageGenerationLoading = message.messageType === 'image-generation-loading';
  const isImageGenerationResult = message.messageType === 'image-generation-result';
  const isTextEditReady = message.messageType === 'text-edit-ready';
  const isTextEditLoading = message.messageType === 'text-edit-loading';  // Step3 专用 loading
  const [localContent, setLocalContent] = useState(editedContent ?? message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 同步外部传入的编辑内容
  useEffect(() => {
    if (editedContent !== undefined) {
      setLocalContent(editedContent);
    }
  }, [editedContent]);

  // 自动调整文本框高度
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [localContent, isEditing]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setLocalContent(newContent);
    onContentChange?.(newContent);
    
    // 自动调整高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  return (
    <div
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-6 animate-slide-up group`}
    >
      <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} ${isEditing ? "max-w-full" : "max-w-[90%] md:max-w-[85%]"}`}>
        {/* Avatar - Glass style */}
        <div
          className={`
          flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-1 backdrop-blur-md
          bg-card/70 text-marriott-600 border border-border/60 shadow-sm
        `}
        >
          {isUser ? <UserIcon className="w-4 h-4" /> : <SparklesIcon className="w-4 h-4" />}
        </div>

        {/* Message Content - Glassmorphism */}
        <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} ${isEditing ? "flex-1" : ""}`}>
          <div
            className={`
            px-5 py-4 rounded-2xl text-[15px] leading-relaxed relative overflow-hidden transition-all duration-300
            ${isEditing ? "w-full min-w-[300px]" : ""}
            ${
              isUser
                ? "bg-white backdrop-blur-xl text-gray-800 rounded-tr-sm shadow-lg border border-gray-200"
                : "glass-strong text-foreground rounded-tl-sm shadow-lg shadow-primary/10"
            }
            ${isEditing ? "border-2 border-marriott-500/50" : ""}
            ${canEdit && !isEditing ? "border border-marriott-300/50" : ""}
          `}
          >
            {/* Glass highlight overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-card/30 to-transparent pointer-events-none rounded-2xl"></div>
            {/* Top highlight line */}
            <div
              className={`absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-card/60 to-transparent`}
            ></div>

            <div className="relative font-medium tracking-wide">
              {isUser ? (
                <span className="whitespace-pre-wrap text-gray-800">{message.content}</span>
              ) : isDesignModeSelection ? (
                // 设计模式选择消息
                <div>
                  <p className="mb-2">{message.content}</p>
                  <DesignModeSelection
                    onConfirm={onDesignModeConfirm!}
                    selectedConfig={message.designModeConfig}
                  />
                </div>
              ) : isImageGenerationLoading ? (
                // 图片生成中 loading 状态 (Step1/Step2)
                (() => {
                  // 根据消息 ID 判断是 Step1 还是 Step2
                  const isStep2 = message.id.startsWith('step2-');
                  const title = isStep2 ? '正在添加文字...' : '正在生成背景图...';
                  const desc = isStep2 
                    ? 'AI 正在将文字添加到背景图上，生成 3 张效果图，请稍候'
                    : 'AI 正在根据参考图生成 3 张背景图，请稍候';
                  
                  return (
                    <div className="flex flex-col items-center py-8 px-4">
                      <div className="relative w-16 h-16 mb-4">
                        {/* 外圈旋转 */}
                        <div className="absolute inset-0 border-4 border-marriott-200 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-transparent border-t-marriott-600 rounded-full animate-spin"></div>
                        {/* 内部图标 */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-6 h-6 text-marriott-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-base font-medium text-foreground mb-1">{title}</p>
                      <p className="text-sm text-muted-foreground text-center">{desc}</p>
                    </div>
                  );
                })()
              ) : isTextEditLoading ? (
                // Step3: 生成可编辑版本 loading 状态
                <div className="flex flex-col items-center py-8 px-4">
                  <div className="relative w-16 h-16 mb-4">
                    {/* 外圈旋转 */}
                    <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
                    {/* 内部图标 - 文字编辑 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-base font-medium text-foreground mb-1">正在生成可编辑版本...</p>
                  <p className="text-sm text-muted-foreground text-center">AI 正在识别图片中的文字，准备进入编辑模式</p>
                </div>
              ) : isImageGenerationResult ? (
                // 图片生成结果消息
                (() => {
                  // 根据消息 ID 判断是 Step1 还是 Step2
                  const isStep2 = message.id.startsWith('step2-');
                  return (
                    <div>
                      <GeneratedImagesSelector
                        images={message.generatedImages || []}
                        selectedIndex={message.selectedImageIndex ?? null}
                        onConfirmSelect={onImageSelect || (() => {})}
                        onRegenerate={onRegenerate}
                        disabled={message.selectedImageIndex !== undefined && message.selectedImageIndex !== null}
                        step={isStep2 ? 2 : 1}
                        isGenerating={isGenerating}
                      />
                    </div>
                  );
                })()
              ) : isTextEditReady ? (
                // 文字编辑就绪消息
                <div className="space-y-4">
                  <div className="text-foreground">
                    <MarkdownContent content={message.content} />
                  </div>
                  
                  {/* 编辑后的图片预览 */}
                  {message.editedImageUrl && (
                    <div className="rounded-lg overflow-hidden border border-border max-w-sm">
                      <img 
                        src={message.editedImageUrl} 
                        alt="编辑后的设计图" 
                        className="w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={onOpenTextEditor}
                        title="点击继续编辑"
                      />
                      <div className={`px-3 py-2 text-sm flex items-center gap-2 ${isTextEditFinalized ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                        {isTextEditFinalized ? (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            已最终确认
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            点击图片继续编辑
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* 操作按钮区 */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 进入编辑按钮 - 始终显示（除非已最终确认） */}
                    {onOpenTextEditor && !isTextEditFinalized && (
                      <button
                        onClick={onOpenTextEditor}
                        className="flex items-center gap-2 px-4 py-2.5 bg-marriott-600 hover:bg-marriott-700 text-white rounded-lg font-medium transition-colors shadow-md"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        {message.editedImageUrl ? '继续编辑' : '进入编辑模式'}
                      </button>
                    )}
                    
                    {/* 下载按钮 - 有编辑图片时显示 */}
                    {message.editedImageUrl && onDownloadImage && (
                      <button
                        onClick={onDownloadImage}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg font-medium transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        下载图片
                      </button>
                    )}
                    
                    {/* 最终确认按钮 - 有编辑图片且未最终确认时显示 */}
                    {message.editedImageUrl && onFinalConfirm && !isTextEditFinalized && (
                      <button
                        onClick={onFinalConfirm}
                        className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors shadow-md"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        最终确认
                      </button>
                    )}
                  </div>
                </div>
              ) : isEditing ? (
                // 编辑中：显示可编辑文本框（自动高度，无滚动条）
                <textarea
                  ref={textareaRef}
                  value={localContent}
                  onChange={handleContentChange}
                  className="w-full bg-transparent border-none focus:ring-0 focus:outline-none resize-none text-foreground placeholder:text-muted-foreground leading-relaxed overflow-hidden"
                  placeholder="编辑内容..."
                  style={{ minHeight: '100px' }}
                />
              ) : (
                // 显示内容（始终显示 message.content，编辑后的内容已经更新到 message 里了）
                <MarkdownContent content={message.content} />
              )}
              {message.isStreaming && (
                <span className="inline-block ml-1.5">
                  <span className="inline-flex gap-1 h-4 items-center">
                    <span className="w-1.5 h-1.5 bg-marriott-600 rounded-full typing-dot"></span>
                    <span className="w-1.5 h-1.5 bg-marriott-600 rounded-full typing-dot"></span>
                    <span className="w-1.5 h-1.5 bg-marriott-600 rounded-full typing-dot"></span>
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* 状态1：可编辑但未在编辑中 - 显示「编辑」和「确认」按钮 */}
          {canEdit && !isEditing && !message.isStreaming && saveStatus !== 'saved' && (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={onStartEdit}
                className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-sm font-medium transition-colors"
              >
                <EditIcon className="w-4 h-4" />
                编辑
              </button>
              <button
                onClick={onConfirm}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-1.5 px-4 py-2 bg-marriott-600 hover:bg-marriott-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckIcon className="w-4 h-4" />
                确认
              </button>
            </div>
          )}

          {/* 状态2：编辑中 - 显示「保存」和「确认」按钮 */}
          {isEditing && !message.isStreaming && (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={onSave}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveStatus === 'saving' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-600 rounded-full animate-spin"></span>
                    保存中...
                  </>
                ) : (
                  <>
                    <SaveIcon className="w-4 h-4" />
                    保存
                  </>
                )}
              </button>
              <button
                onClick={onConfirm}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-1.5 px-4 py-2 bg-marriott-600 hover:bg-marriott-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckIcon className="w-4 h-4" />
                确认
              </button>
            </div>
          )}

          {/* 已保存/已确认提示 */}
          {saveStatus === 'saved' && !isEditing && (
            <div className="flex items-center gap-1.5 mt-2 text-green-600 text-sm">
              <CheckIcon className="w-4 h-4" />
              已确认
            </div>
          )}
        </div>
      </div>
    </div>
  );
};



