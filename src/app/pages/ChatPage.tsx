import React, { useState, useRef, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { ChatMessage } from "@/shared/ui/ChatMessage";
import { SendIcon, SparklesIcon, PanelLeftIcon, ImageIcon, XIcon, LoadingIcon } from "@/shared/ui/Icon";
import { Message, Role, ChatSession, DesignModeConfig, ImageSize } from "@/core/types/io";
import { integrateDifyChat, filesToFileInfos, FileInfo } from "@/core/steps/integrateDifyChat";
import { fetchMessages, fetchConversationImages, updateMessageResponse, updateMessageConfirmed, updateConversationDesignModeConfig, saveGeneratedImages, saveSelectedImageIndex, saveStep2GeneratedImages, saveStep2SelectedIndex, saveEditedImage, saveDiffAnalysis } from "@/core/services/chatHistoryService";
import { uploadDesignImages, uploadBase64Images, uploadEditedImage } from "@/core/services/storageService";
import { useImageGeneration } from "@/shared/hooks/useImageGeneration";
import type { Step1Input, Step2Input } from "@/core/pipelines/design-modes/types";
import { TextEditModal } from "@/shared/ui/TextEditModal";
import { runTextDiffAnalysis, setConversationId, type LineGroupInfo } from "@/core/steps/integrateImageDiff";
import { compressFile } from "@/core/steps/integrateImageCompressor";

// ===== 辅助函数：压缩文件并转为 data URL =====
async function compressFileToDataUrl(file: File): Promise<string> {
  console.log(`[ChatPage] 🔧 开始压缩图片 (用于 Gemini): ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
  
  // 压缩文件
  const compressedBlob = await compressFile(file);
  
  console.log(`[ChatPage] ✓ 压缩完成 (用于 Gemini): ${(compressedBlob.size / 1024).toFixed(1)}KB`);
  
  // 转为 data URL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(compressedBlob);
  });
}

// ===== 辅助函数：判断是否需要显示设计模式选择消息 =====
function shouldShowDesignModeSelection(messages: Message[]): boolean {
  // 检查是否已有选择消息
  const hasSelectionMessage = messages.some(
    (msg) => msg.messageType === 'design-mode-selection'
  );
  if (hasSelectionMessage) return false;

  // 找到最后一条 AI 消息（排除选择消息）
  const lastAiMessage = [...messages]
    .reverse()
    .find((msg) => msg.role === Role.MODEL && msg.messageType !== 'design-mode-selection');

  // ⭐ 关键修改：只有当 status=yes 且 isConfirmed=true 时才显示选择界面
  // isConfirmed 表示用户已经点击了"确认"按钮
  return lastAiMessage?.status === 'yes' && lastAiMessage?.isConfirmed === true;
}

// ===== 辅助函数：创建设计模式选择消息 =====
function createDesignModeSelectionMessage(existingConfig?: DesignModeConfig): Message {
  return {
    id: `selection-${Date.now()}`,
    role: Role.MODEL,
    content: "现在准备开始制作设计图，请你从以下三个选项选择：",
    timestamp: Date.now(),
    messageType: 'design-mode-selection',
    designMode: existingConfig?.mode,
    designModeConfig: existingConfig,  // 完整配置
  };
}

// ===== 辅助函数：创建图片生成结果消息 =====
function createImageGenerationResultMessage(
  step: 1 | 2,
  images: string[],
  selectedIndex: number | null
): Message {
  return {
    id: `step${step}-result-restored-${Date.now()}`,
    role: Role.MODEL,
    content: "",
    timestamp: Date.now(),
    messageType: 'image-generation-result',
    generatedImages: images,
    selectedImageIndex: selectedIndex,
    step,
  };
}

// ===== 辅助函数：根据会话状态恢复图片生成结果消息 =====
function restoreImageGenerationMessages(
  session: ChatSession | undefined,
  existingMessages: Message[]
): Message[] {
  if (!session) return [];
  
  const restoredMessages: Message[] = [];
  
  // 检查是否已有 Step1 结果消息
  const hasStep1Result = existingMessages.some(
    msg => msg.messageType === 'image-generation-result' && (msg.step === 1 || msg.id.includes('step1'))
  );
  
  // 检查是否已有 Step2 结果消息
  const hasStep2Result = existingMessages.some(
    msg => msg.messageType === 'image-generation-result' && (msg.step === 2 || msg.id.includes('step2'))
  );
  
  // 恢复 Step1 结果（如果有数据且没有现有消息）
  if (!hasStep1Result && session.generatedImages && session.generatedImages.length > 0) {
    console.log("[ChatPage] 恢复 Step1 图片结果:", session.generatedImages.length, "张");
    restoredMessages.push(
      createImageGenerationResultMessage(1, session.generatedImages, session.selectedImageIndex ?? null)
    );
  }
  
  // 恢复 Step2 结果（如果有数据且没有现有消息）
  if (!hasStep2Result && session.step2GeneratedImages && session.step2GeneratedImages.length > 0) {
    console.log("[ChatPage] 恢复 Step2 图片结果:", session.step2GeneratedImages.length, "张");
    restoredMessages.push(
      createImageGenerationResultMessage(2, session.step2GeneratedImages, session.step2SelectedIndex ?? null)
    );
  }
  
  return restoredMessages;
}

interface ChatContextType {
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  chatSessions: ChatSession[];
  setChatSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  currentSessionId: string | null;
  setCurrentSessionId: React.Dispatch<React.SetStateAction<string | null>>;
}

// 图片预览组件
interface ImagePreviewProps {
  file: File;
  onRemove: () => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ file, onRemove }) => {
  const [preview, setPreview] = useState<string>("");

  useEffect(() => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, [file]);

  return (
    <div className="relative group">
      <div className="w-16 h-16 rounded-lg overflow-hidden border border-border/50 bg-card/50">
        {preview ? (
          <img src={preview} alt={file.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <LoadingIcon className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      >
        <XIcon className="w-3 h-3" />
      </button>
    </div>
  );
};

export const ChatPage: React.FC = () => {
  const {
    sidebarOpen,
    setSidebarOpen,
    chatSessions,
    setChatSessions,
    currentSessionId,
    setCurrentSessionId,
  } = useOutletContext<ChatContextType>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 存储每个会话的 conversationId（Dify 返回的）
  const [difyConversationIds, setDifyConversationIds] = useState<Record<string, string>>({});
  
  const isInternalUpdateRef = useRef(false);
  const prevSessionIdRef = useRef<string | null>(null);
  
  // 用于取消未完成的请求，防止并发冲突
  const abortControllerRef = useRef<AbortController | null>(null);
  // 防止重复发送（比 isLoading 更严格）
  const isSendingRef = useRef(false);
  // 当前请求 ID，用于忽略过期响应
  const currentRequestIdRef = useRef<string | null>(null);

  // ===== 图片生成结果消息 ID (使用 ref 避免闭包问题) =====
  const step1MessageIdRef = useRef<string | null>(null);
  const step2MessageIdRef = useRef<string | null>(null);
  
  // ===== 保存 Step1 数据，用于 Step2 =====
  const step1SelectedImageRef = useRef<string | null>(null);  // 选中的图片（base64，用于 Step2 生成）
  const step1SelectedImageUrlRef = useRef<string | null>(null); // 选中的图片 URL（用于差异分析和编辑器）
  const step1SelectedIndexRef = useRef<number | null>(null);  // 选中的图片索引
  const step1ImagesRef = useRef<string[]>([]);                // Step1 所有图片 URL（上传后）
  const confirmedTextRef = useRef<string>("");
  const selectedSizeRef = useRef<ImageSize>("1024x1024");
  
  // ===== Step3: 文字编辑相关状态 =====
  const [isTextEditModalOpen, setIsTextEditModalOpen] = useState(false);
  const [textEditBackgroundImage, setTextEditBackgroundImage] = useState<string>("");
  const [textEditLines, setTextEditLines] = useState<LineGroupInfo[]>([]);
  const [isAnalyzingDiff, setIsAnalyzingDiff] = useState(false);
  const [isSavingEditedImage, setIsSavingEditedImage] = useState(false);
  const [cachedEditedImageUrl, setCachedEditedImageUrl] = useState<string | null>(null);  // 缓存的编辑后图片 URL
  const [cachedCanvasState, setCachedCanvasState] = useState<unknown>(null);  // 缓存的 canvas 状态（用于持续编辑）
  const step2SelectedImageRef = useRef<string | null>(null);  // Step2 选中的效果图
  const step2ImagesRef = useRef<string[]>([]);  // Step2 所有图片 URL（上传后）
  
  // ===== 使用 ref 保存最新值，避免闭包问题 =====
  const chatSessionsRef = useRef(chatSessions);
  const currentSessionIdRef = useRef(currentSessionId);
  
  // 同步更新 ref
  useEffect(() => {
    chatSessionsRef.current = chatSessions;
  }, [chatSessions]);
  
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // ===== 图片生成 Hook =====
  const {
    task: generationTask,
    startStep1,
    startStep2,
    confirmSelection,
    regenerate,
    // reset: resetGeneration, // 后续切换会话时可用
  } = useImageGeneration({
    // Step1 成功回调
    onStep1Success: async (images) => {
      console.log("[ChatPage] Step1 生成成功:", images.length, "张 (base64)");
      
      const loadingMsgId = step1MessageIdRef.current;
      // 使用 ref 避免闭包问题
      const session = chatSessionsRef.current.find((s) => s.id === currentSessionIdRef.current);
      const dbId = session?.dbId || currentSessionIdRef.current || '';
      
      // 先用 base64 显示（快速响应）
      if (loadingMsgId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === loadingMsgId
              ? {
                  ...msg,
                  messageType: 'image-generation-result' as const,
                  generatedImages: images,
                  selectedImageIndex: null,
                }
              : msg
          )
        );
      } else {
        const resultMessageId = `step1-result-${Date.now()}`;
        const resultMessage: Message = {
          id: resultMessageId,
          role: Role.MODEL,
          content: "",
          timestamp: Date.now(),
          messageType: 'image-generation-result',
          generatedImages: images,
          selectedImageIndex: null,
        };
        step1MessageIdRef.current = resultMessageId;
        setMessages((prev) => [...prev, resultMessage]);
      }
      
      // 异步上传到 Storage 并保存 URL 到数据库
      if (dbId) {
        try {
          console.log("[ChatPage] 开始上传 Step1 图片到 Storage...");
          const imageUrls = await uploadBase64Images(images, dbId, 'step1');
          console.log("[ChatPage] Step1 图片上传成功:", imageUrls.length, "张");
          
          // 保存 URL 到数据库（而非 base64）
          const success = await saveGeneratedImages(dbId, imageUrls);
          if (success) {
            console.log("[ChatPage] Step1 图片 URL 已保存到数据库");
          }
          
          // 更新消息中的图片为 URL（可选，用于后续加载）
          const msgId = step1MessageIdRef.current;
          if (msgId) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === msgId
                  ? { ...msg, generatedImages: imageUrls }
                  : msg
              )
            );
          }
          
          // 更新 ref 中的图片为 URL
          step1ImagesRef.current = imageUrls;
        } catch (error) {
          console.error("[ChatPage] Step1 图片上传失败:", error);
          // 即使上传失败，base64 图片仍然可用
        }
      }
    },
    
    // Step1 选择确认回调 - 触发 Step2
    onStep1SelectConfirm: (selectedImage, index) => {
      console.log("[ChatPage] Step1 用户选择了图片:", index);
      
      // 更新 Step1 消息的选中状态
      const msgId = step1MessageIdRef.current;
      if (msgId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId
              ? { ...msg, selectedImageIndex: index }
              : msg
          )
        );
      }
      
      // 保存 Step1 选择到数据库（使用 ref 避免闭包问题）
      const session = chatSessionsRef.current.find((s) => s.id === currentSessionIdRef.current);
      const dbId = session?.dbId || currentSessionIdRef.current || '';
      if (dbId) {
        saveSelectedImageIndex(dbId, index);
      }
      
      // 使用原始 base64 进行 Step2 生成（避免重新生成时 CORS 问题）
      // selectedImage 是从 task.generatedImages[index] 获取的原始数据
      step1SelectedImageRef.current = selectedImage;
      step1SelectedIndexRef.current = index;
      
      // 如果有已上传的 URL，保存供差异分析使用
      if (step1ImagesRef.current[index]) {
        step1SelectedImageUrlRef.current = step1ImagesRef.current[index];
        console.log("[ChatPage] Step2: base64 用于生成, URL 用于后续分析");
      } else {
        step1SelectedImageUrlRef.current = selectedImage; // fallback
        console.log("[ChatPage] Step2: 使用 base64（无 URL 可用）");
      }
      
      // 插入 Step2 loading 消息
      const step2LoadingId = `step2-loading-${Date.now()}`;
      const step2LoadingMessage: Message = {
        id: step2LoadingId,
        role: Role.MODEL,
        content: "",
        timestamp: Date.now(),
        messageType: 'image-generation-loading',
      };
      step2MessageIdRef.current = step2LoadingId;
      setMessages((prev) => [...prev, step2LoadingMessage]);
      
      // 触发 Step2 生成
      if (dbId && selectedImage && confirmedTextRef.current) {
        const step2Input: Step2Input = {
          conversationId: dbId,
          confirmedText: confirmedTextRef.current,
          selectedBackgroundImage: selectedImage, // 使用原始 base64
          size: selectedSizeRef.current,
        };
        
        console.log("[ChatPage] 触发 Step2 生成:", step2Input);
        startStep2(step2Input);
      }
    },
    
    // Step2 成功回调
    onStep2Success: async (images) => {
      console.log("[ChatPage] Step2 生成成功:", images.length, "张 (base64)");
      
      const loadingMsgId = step2MessageIdRef.current;
      // 使用 ref 避免闭包问题
      const session = chatSessionsRef.current.find((s) => s.id === currentSessionIdRef.current);
      const dbId = session?.dbId || currentSessionIdRef.current || '';
      
      // 先用 base64 显示（快速响应）
      if (loadingMsgId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === loadingMsgId
              ? {
                  ...msg,
                  messageType: 'image-generation-result' as const,
                  generatedImages: images,
                  selectedImageIndex: null,
                }
              : msg
          )
        );
      } else {
        const resultMessageId = `step2-result-${Date.now()}`;
        const resultMessage: Message = {
          id: resultMessageId,
          role: Role.MODEL,
          content: "",
          timestamp: Date.now(),
          messageType: 'image-generation-result',
          generatedImages: images,
          selectedImageIndex: null,
        };
        step2MessageIdRef.current = resultMessageId;
        setMessages((prev) => [...prev, resultMessage]);
      }
      
      // 异步上传到 Storage 并保存 URL 到数据库
      if (dbId) {
        try {
          console.log("[ChatPage] 开始上传 Step2 图片到 Storage...");
          const imageUrls = await uploadBase64Images(images, dbId, 'step2');
          console.log("[ChatPage] Step2 图片上传成功:", imageUrls.length, "张");
          
          // 保存 URL 到数据库（而非 base64）
          const success = await saveStep2GeneratedImages(dbId, imageUrls);
          if (success) {
            console.log("[ChatPage] Step2 图片 URL 已保存到数据库");
          }
          
          // 保存 URL 到 ref（用于差异分析）
          step2ImagesRef.current = imageUrls;
          
          // 更新消息中的图片为 URL
          const msgId = step2MessageIdRef.current;
          if (msgId) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === msgId
                  ? { ...msg, generatedImages: imageUrls }
                  : msg
              )
            );
          }
        } catch (error) {
          console.error("[ChatPage] Step2 图片上传失败:", error);
          // 即使上传失败，base64 图片仍然可用
        }
      }
    },
    
    // Step2 选择确认回调 - 最终确认，然后触发差异分析
    onStep2SelectConfirm: async (selectedImage, index) => {
      console.log("[ChatPage] Step2 用户最终选择了图片:", index);
      
      // 保存选中的效果图
      step2SelectedImageRef.current = selectedImage;
      
      // 更新 Step2 消息的选中状态
      const msgId = step2MessageIdRef.current;
      if (msgId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId
              ? { ...msg, selectedImageIndex: index }
              : msg
          )
        );
      }
      
      // 保存 Step2 选择到数据库（使用 ref 避免闭包问题）
      const session = chatSessionsRef.current.find((s) => s.id === currentSessionIdRef.current);
      const dbId = session?.dbId || currentSessionIdRef.current || '';
      console.log("[ChatPage] Step2 保存到数据库, dbId:", dbId);
      if (dbId) {
        const success = await saveStep2SelectedIndex(dbId, index);
        if (success) {
          console.log("[ChatPage] 最终效果图已保存到数据库");
        } else {
          console.error("[ChatPage] 最终效果图保存失败");
        }
      } else {
        console.error("[ChatPage] 无法保存 Step2 选择：缺少 dbId");
      }
      
      // ===== Step3: 触发文字差异分析 =====
      // 优先使用 Storage URL（避免 base64 太长导致问题）
      const backgroundImage = step1SelectedImageUrlRef.current || step1SelectedImageRef.current;
      // 优先使用已上传的 Step2 图片 URL
      const effectImage = step2ImagesRef.current[index] || selectedImage;
      const confirmedText = confirmedTextRef.current;
      
      console.log("[ChatPage] Step3: 背景图类型:", 
        backgroundImage?.startsWith('http') ? 'URL' : 
        backgroundImage?.startsWith('data:') ? 'DataURL' : 'base64');
      console.log("[ChatPage] Step3: 效果图类型:", 
        effectImage?.startsWith('http') ? 'URL' : 
        effectImage?.startsWith('data:') ? 'DataURL' : 'base64');
      
      if (backgroundImage && effectImage && confirmedText) {
        console.log("[ChatPage] Step3: 开始文字差异分析...");
        setIsAnalyzingDiff(true);
        
        // 设置 conversationId（用于 OCR 异步任务关联）
        setConversationId(dbId);
        console.log("[ChatPage] Step3: 设置 conversationId:", dbId);
        
        // 添加分析中的消息（Step3 专用样式）
        const analysisMessageId = `analysis-${Date.now()}`;
        const analysisMessage: Message = {
          id: analysisMessageId,
          role: Role.MODEL,
          content: "✨ 正在生成可编辑版本，请稍候...",
          timestamp: Date.now(),
          messageType: 'text-edit-loading',  // Step3 专用 loading 类型
        };
        setMessages((prev) => [...prev, analysisMessage]);
        
        try {
          const diffResult = await runTextDiffAnalysis({
            backgroundImage,
            effectImage,
            confirmedText,
          });
          
          console.log("[ChatPage] Step3: 差异分析完成", {
            success: diffResult.success,
            lines: diffResult.lines?.length || 0,
          });
          
          const lines = diffResult.lines;
          if (diffResult.success && lines && lines.length > 0) {
            // 保存差异分析结果到数据库
            if (dbId) {
              saveDiffAnalysis(dbId, {
                lines: lines,
                fullText: diffResult.fullText,
              });
            }
            
            // 保存分析结果到状态
            setTextEditBackgroundImage(backgroundImage);
            setTextEditLines(lines);
            // 🔧 清除旧的 canvas 缓存，强制使用新的 OCR 识别结果
            setCachedCanvasState(null);
            setCachedEditedImageUrl(null);
            
            // 替换分析消息为编辑入口消息
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === analysisMessageId
                  ? {
                      ...msg,
                      messageType: 'text-edit-ready' as const,
                      content: `✨ 已识别出 ${lines.length} 行文字，点击下方按钮进入编辑模式`,
                      diffAnalysisResult: diffResult,
                    }
                  : msg
              )
            );
          } else {
            // 分析失败或没有识别到文字
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === analysisMessageId
                  ? {
                      ...msg,
                      messageType: 'text' as const,
                      content: diffResult.error || "未能识别到文字差异，您可以直接下载最终效果图",
                    }
                  : msg
              )
            );
          }
        } catch (error) {
          console.error("[ChatPage] Step3: 差异分析失败", error);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === analysisMessageId
                ? {
                    ...msg,
                    messageType: 'text' as const,
                    content: `分析失败: ${error instanceof Error ? error.message : '未知错误'}`,
                  }
                : msg
            )
          );
        } finally {
          setIsAnalyzingDiff(false);
        }
      }
    },
    
    // 错误回调
    onError: (error, step) => {
      console.error(`[ChatPage] Step${step} 生成失败:`, error);
      
      const loadingMsgId = step === 1 ? step1MessageIdRef.current : step2MessageIdRef.current;
      
      // 替换 loading 消息为错误消息
      if (loadingMsgId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === loadingMsgId
              ? {
                  ...msg,
                  messageType: 'text' as const,
                  content: `Step${step} 生成失败：${error}。请刷新页面后重试。`,
                }
              : msg
          )
        );
      } else {
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: Role.MODEL,
          content: `Step${step} 生成失败：${error}。请刷新页面后重试。`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    },
  });

  // ===== 可编辑状态管理（status=yes 时启用） =====
  const [editableMessageId, setEditableMessageId] = useState<string | null>(null);  // 可以编辑的消息（status=yes）
  const [isEditingMessageId, setIsEditingMessageId] = useState<string | null>(null); // 正在编辑中的消息
  const [editedContent, setEditedContent] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirmedMessageId, setConfirmedMessageId] = useState<string | null>(null);  // 已确认的消息ID

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  // 组件卸载时取消未完成的请求
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 当 currentSessionId 改变时，加载对应的消息
  useEffect(() => {
    if (prevSessionIdRef.current === currentSessionId) {
      return;
    }

    // 切换会话时取消未完成的请求
    if (abortControllerRef.current) {
      console.log("[ChatPage] 切换会话，取消未完成的请求");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      isSendingRef.current = false;
    }

    // 保存旧会话的消息
    if (prevSessionIdRef.current && messages.length > 0) {
      const oldSessionId = prevSessionIdRef.current;
      setChatSessions((prev) =>
        prev.map((session) =>
          session.id === oldSessionId ? { ...session, messages } : session
        )
      );
    }

    prevSessionIdRef.current = currentSessionId;

    // 加载新会话的消息
    const loadMessages = async () => {
      if (currentSessionId) {
        const session = chatSessions.find((s) => s.id === currentSessionId);
        
        let loadedMessages: Message[] = [];
        
        // 如果 session 已有消息（内存中），直接使用
        if (session && session.messages.length > 0) {
          loadedMessages = session.messages;
        } else if (session) {
          // 否则从数据库加载
          // 使用 dbId（数据库 UUID）查询消息，兼容新会话（可能还没有 dbId）
          const queryId = session.dbId || currentSessionId;
          console.log(`[ChatPage] Loading messages for session ${currentSessionId}, dbId=${session.dbId}`);
          loadedMessages = await fetchMessages(queryId);
        }

        // ⭐ 检查是否需要恢复设计模式选择消息
        if (shouldShowDesignModeSelection(loadedMessages)) {
          // 生成选择消息，传入之前的完整配置（如果有）
          const selectionMessage = createDesignModeSelectionMessage(session?.designModeConfig);
          loadedMessages = [...loadedMessages, selectionMessage];
          console.log("[ChatPage] 恢复选择消息, config:", session?.designModeConfig);
        }

        // ⭐ 按需加载图片数据（只在需要时加载，避免初始加载慢）
        let sessionWithImages = session;
        if (session && session.dbId && (!session.generatedImages && !session.step2GeneratedImages)) {
          console.log("[ChatPage] 按需加载图片数据...");
          const imageData = await fetchConversationImages(session.dbId);
          if (imageData) {
            sessionWithImages = {
              ...session,
              generatedImages: imageData.generatedImages,
              step2GeneratedImages: imageData.step2GeneratedImages,
            };
            // 更新 session 缓存
            setChatSessions((prev) =>
              prev.map((s) =>
                s.id === currentSessionId ? {
                  ...s,
                  generatedImages: imageData.generatedImages,
                  step2GeneratedImages: imageData.step2GeneratedImages,
                } : s
              )
            );
            console.log("[ChatPage] 图片数据加载完成");
          }
        }

        // ⭐ 恢复图片生成结果消息（Step1 和 Step2）
        const restoredImageMessages = restoreImageGenerationMessages(sessionWithImages, loadedMessages);
        if (restoredImageMessages.length > 0) {
          loadedMessages = [...loadedMessages, ...restoredImageMessages];
          console.log("[ChatPage] 恢复图片结果消息:", restoredImageMessages.length, "条");
        }

        // ⭐ 恢复编辑状态（Step3: edited_image, canvas_state, diff_analysis）
        if (sessionWithImages?.editedImage || sessionWithImages?.diffAnalysis) {
          console.log("[ChatPage] 恢复编辑状态, editedImage:", !!sessionWithImages.editedImage, ", canvasState:", !!sessionWithImages.canvasState);
          
          // 恢复缓存的编辑图片和 canvas 状态
          if (sessionWithImages.editedImage) {
            setCachedEditedImageUrl(sessionWithImages.editedImage);
          }
          if (sessionWithImages.canvasState) {
            setCachedCanvasState(sessionWithImages.canvasState);
          }
          
          // 如果有差异分析结果，恢复 text-edit-ready 消息
          if (sessionWithImages.diffAnalysis) {
            const diffResult = sessionWithImages.diffAnalysis as any;
            const lines = diffResult?.lines || [];
            
            // 设置文字编辑相关状态
            if (lines.length > 0) {
              setTextEditLines(lines);
            }
            
            // 设置背景图（使用 Step1 选中的图片 URL）
            const step1Images = sessionWithImages.generatedImages || [];
            const step1SelectedIdx = sessionWithImages.selectedImageIndex;
            if (step1SelectedIdx !== undefined && step1SelectedIdx !== null && step1Images[step1SelectedIdx]) {
              setTextEditBackgroundImage(step1Images[step1SelectedIdx]);
            }
            
            // 添加 text-edit-ready 消息（如果不存在）
            const hasTextEditMessage = loadedMessages.some(msg => msg.messageType === 'text-edit-ready');
            if (!hasTextEditMessage && lines.length > 0) {
              const textEditMessage: Message = {
                id: `text-edit-ready-${Date.now()}`,
                role: Role.MODEL,
                content: `✨ 已识别出 ${lines.length} 行文字，点击下方按钮进入编辑模式`,
                timestamp: Date.now(),
                messageType: 'text-edit-ready',
                diffAnalysisResult: diffResult,
                editedImageUrl: sessionWithImages.editedImage,
              };
              loadedMessages = [...loadedMessages, textEditMessage];
              console.log("[ChatPage] 恢复 text-edit-ready 消息");
            }
          }
        }

        setMessages(loadedMessages);
        
        // 更新 session 中的消息
        if (session) {
          setChatSessions((prev) =>
            prev.map((s) =>
              s.id === currentSessionId ? { ...s, messages: loadedMessages } : s
            )
          );
        }

        // 检查最后一条 AI 消息是否是 status=yes，如果是则设置为可编辑（但不自动进入编辑模式）
        // 注意：如果已经有选择消息，说明用户已确认过，不需要再设置可编辑状态
        const hasSelectionMessage = loadedMessages.some(
          (msg) => msg.messageType === 'design-mode-selection'
        );
        
        if (!hasSelectionMessage && loadedMessages.length > 0) {
          const lastMessage = loadedMessages[loadedMessages.length - 1];
          if (lastMessage.role === Role.MODEL && lastMessage.status === 'yes' && lastMessage.messageDbId) {
            console.log("[ChatPage] 历史消息最后一条 status=yes，设置为可编辑");
            setEditableMessageId(lastMessage.id);
            setIsEditingMessageId(null);  // 不自动进入编辑模式
            setEditedContent("");
            setSaveStatus('idle');
            setConfirmedMessageId(null);
          } else {
            // 清除可编辑状态
            setEditableMessageId(null);
            setIsEditingMessageId(null);
            setEditedContent("");
          }
        } else {
          // 有选择消息，清除可编辑状态
          setEditableMessageId(null);
          setIsEditingMessageId(null);
          setEditedContent("");
        }
      } else {
        setMessages([]);
        setEditableMessageId(null);
        setIsEditingMessageId(null);
        setEditedContent("");
      }
    };

    loadMessages();
    
    // 切换会话时清空上传的图片
    setUploadedImages([]);
  }, [currentSessionId, chatSessions]);

  // 当消息变化时，同步到当前 session
  useEffect(() => {
    if (!currentSessionId || messages.length === 0) return;
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false;
      return;
    }

    setChatSessions((prev) =>
      prev.map((session) =>
        session.id === currentSessionId ? { ...session, messages } : session
      )
    );
  }, [messages, currentSessionId, setChatSessions]);

  // 处理图片上传
  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );

    if (imageFiles.length > 0) {
      setUploadedImages((prev) => [...prev, ...imageFiles]);
    }

    // 重置 input，允许重复选择相同文件
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // ===== 点击编辑按钮，进入编辑模式 =====
  const handleStartEdit = useCallback(() => {
    if (!editableMessageId) return;
    
    const message = messages.find((m) => m.id === editableMessageId);
    if (message) {
      setIsEditingMessageId(editableMessageId);
      setEditedContent(message.content);
      console.log("[ChatPage] 进入编辑模式");
    }
  }, [editableMessageId, messages]);

  // ===== 保存编辑的内容（保存后退出编辑模式，回到「编辑」「确认」按钮状态） =====
  const handleSaveEdit = useCallback(async () => {
    if (!editableMessageId || !editedContent) return;

    const message = messages.find((m) => m.id === editableMessageId);
    if (!message?.messageDbId) {
      console.error("[ChatPage] 无法保存：找不到消息的数据库ID");
      return;
    }

    setSaveStatus('saving');

    try {
      const success = await updateMessageResponse(message.messageDbId, editedContent);
      if (success) {
        // 更新本地消息内容
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === editableMessageId ? { ...msg, content: editedContent } : msg
          )
        );
        // 退出编辑模式，回到「编辑」「确认」按钮状态
        setIsEditingMessageId(null);
        setEditedContent("");
        setSaveStatus('idle');
        console.log("[ChatPage] 保存成功，退出编辑模式");
      } else {
        setSaveStatus('idle');
        alert("保存失败，请重试");
      }
    } catch (error) {
      console.error("[ChatPage] 保存失败:", error);
      setSaveStatus('idle');
      alert("保存失败，请重试");
    }
  }, [editableMessageId, editedContent, messages]);

  // ===== 确认（保存并退出编辑模式） =====
  // ⭐ 乐观更新：先更新 UI，数据库异步保存
  const handleConfirmEdit = useCallback(() => {
    if (!editableMessageId) return;

    const message = messages.find((m) => m.id === editableMessageId);
    const messageDbId = message?.messageDbId;
    const contentToSave = isEditingMessageId ? editedContent : null;

    // ========== 1. 立即更新 UI（不等待数据库） ==========
    
    // 更新本地消息状态
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === editableMessageId 
          ? { 
              ...msg, 
              content: contentToSave || msg.content,
              isConfirmed: true 
            } 
          : msg
      )
    );

    // 设置确认成功状态
    setSaveStatus('saved');
    setConfirmedMessageId(editableMessageId);
    setEditableMessageId(null);
    setIsEditingMessageId(null);
    setEditedContent("");

    // 立即插入设计模式选择消息
    const selectionMessage = createDesignModeSelectionMessage();
    setMessages((prev) => [...prev, selectionMessage]);
    console.log("[ChatPage] 已确认，立即显示选择界面");

    // 3秒后清除"已确认"提示
    setTimeout(() => {
      setSaveStatus('idle');
      setConfirmedMessageId(null);
    }, 3000);

    // ========== 2. 后台异步保存到数据库（不阻塞 UI） ==========
    
    if (messageDbId) {
      // 如果有编辑内容，异步保存
      if (contentToSave) {
        updateMessageResponse(messageDbId, contentToSave)
          .then((success) => {
            if (success) {
              console.log("[ChatPage] 内容已异步保存到数据库");
            } else {
              console.error("[ChatPage] 异步保存内容失败");
            }
          })
          .catch((error) => console.error("[ChatPage] 异步保存内容错误:", error));
      }

      // 异步保存 is_confirmed=true
      updateMessageConfirmed(messageDbId, true)
        .then((success) => {
          if (success) {
            console.log("[ChatPage] is_confirmed 已异步保存到数据库");
          } else {
            console.error("[ChatPage] 异步保存 is_confirmed 失败");
          }
        })
        .catch((error) => console.error("[ChatPage] 异步保存 is_confirmed 错误:", error));
    }
  }, [editableMessageId, isEditingMessageId, editedContent, messages]);

  // ===== 处理设计模式确认（包含图片上传） =====
  // ⭐ 优化：本地压缩 → 立即开始流程 → 异步上传（不阻塞）
  const handleDesignModeConfirm = useCallback(async (config: DesignModeConfig, files: File[]) => {
    console.log("[ChatPage] 用户确认设计模式:", config.mode, "文件数:", files.length);

    const session = chatSessions.find((s) => s.id === currentSessionId);
    const dbId = session?.dbId || currentSessionId || '';

    // ========== 1. 立即更新 UI ==========
    
    const tempConfig = { ...config };
    
    setMessages((prev) =>
      prev.map((msg) =>
        msg.messageType === 'design-mode-selection'
          ? { ...msg, designMode: config.mode, designModeConfig: tempConfig }
          : msg
      )
    );

    if (currentSessionId) {
      setChatSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? { ...s, designMode: config.mode, designModeConfig: tempConfig }
            : s
        )
      );
    }

    // ========== 2. 本地压缩图片并转为 data URL ==========
    
    try {
      let localDataUrls: string[] = [];
      
      if (files.length > 0) {
        console.log("[ChatPage] 开始本地压缩图片...");
        
        // 并发压缩所有图片
        const compressPromises = files.map(file => compressFileToDataUrl(file));
        localDataUrls = await Promise.all(compressPromises);
        
        console.log("[ChatPage] 本地压缩完成:", localDataUrls.length, "张图片");
      }

      // ========== 3. 立即开始下一步流程（使用本地 data URL） ==========
      
      switch (config.mode) {
        case 'ai-creative':
          console.log("[ChatPage] 进入 AI 创意流程（开发中）");
          break;
          
        case 'reference-image': {
          console.log("[ChatPage] 进入参考图流程");
          
          // 找到确认的文案
          const confirmedMessage = [...messages]
            .reverse()
            .find((msg) => msg.role === Role.MODEL && msg.status === 'yes' && msg.isConfirmed);
          const confirmedText = confirmedMessage?.content || '';
          const selectedSize = config.mode === 'reference-image' ? config.size : '1024x1024' as ImageSize;
          
          // 保存确认文案和尺寸，供 Step2 使用
          confirmedTextRef.current = confirmedText;
          selectedSizeRef.current = selectedSize;
          
          // 使用本地 data URL 立即开始 Step1
          if (dbId && localDataUrls.length > 0) {
            const input: Step1Input = {
              conversationId: dbId,
              confirmedText,
              referenceImageUrls: localDataUrls,  // 使用本地 data URL
              size: selectedSize,
            };
            
            // 先插入 Step1 loading 消息
            const loadingMessageId = `step1-loading-${Date.now()}`;
            const loadingMessage: Message = {
              id: loadingMessageId,
              role: Role.MODEL,
              content: "",
              timestamp: Date.now(),
              messageType: 'image-generation-loading',
            };
            setMessages((prev) => [...prev, loadingMessage]);
            step1MessageIdRef.current = loadingMessageId;
            
            console.log("[ChatPage] 🚀 启动 Step1 图片生成（使用已压缩的本地 data URL）");
            startStep1(input);
          }
          break;
        }
        
        case 'template-text':
          console.log("[ChatPage] 进入模版流程");
          // TODO: 调用模版替换 API
          break;
      }

      // ========== 4. 异步上传图片到 Storage（不阻塞流程） ==========
      
      if (files.length > 0 && dbId) {
        // 异步上传，不等待（注意：这里的压缩日志会和 Gemini 调用日志交错，但不影响 Gemini 使用的是已压缩的图片）
        (async () => {
          try {
            console.log("[ChatPage] 📤 开始异步上传图片到 Storage（不阻塞 Gemini 调用）...");
            
            let imageUrls: string[] = [];
            if (config.mode === 'reference-image') {
              imageUrls = await uploadDesignImages(files, dbId, 'reference');
            } else if (config.mode === 'template-text') {
              imageUrls = await uploadDesignImages(files, dbId, 'template');
            }
            
            console.log("[ChatPage] 图片上传完成:", imageUrls.length, "张");
            
            // 更新配置
            let finalConfig: DesignModeConfig;
            if (config.mode === 'reference-image') {
              finalConfig = { mode: 'reference-image', images: imageUrls, size: config.size };
            } else if (config.mode === 'template-text') {
              finalConfig = { mode: 'template-text', image: imageUrls[0], size: config.size };
            } else {
              finalConfig = { mode: 'ai-creative' };
            }
            
            // 保存到数据库
            const saved = await updateConversationDesignModeConfig(dbId, finalConfig);
            if (saved) {
              console.log("[ChatPage] 设计模式配置已保存到数据库");
            }
            
            // 更新 UI（替换 data URL 为真实 URL）
            setMessages((prev) =>
              prev.map((msg) =>
                msg.messageType === 'design-mode-selection'
                  ? { ...msg, designModeConfig: finalConfig }
                  : msg
              )
            );
          } catch (uploadError) {
            console.error("[ChatPage] 异步上传图片失败:", uploadError);
          }
        })();
      } else if (dbId) {
        // 没有图片，直接保存配置到数据库
        updateConversationDesignModeConfig(dbId, config)
          .then((saved) => {
            if (saved) {
              console.log("[ChatPage] 设计模式配置已保存到数据库");
            }
          })
          .catch((error) => console.error("[ChatPage] 保存配置失败:", error));
      }
    } catch (error) {
      console.error("[ChatPage] 处理设计模式确认失败:", error);
    }
  }, [currentSessionId, chatSessions, setChatSessions, messages, startStep1]);

  // ===== 处理图片选择（由 ChatMessage 的 GeneratedImagesSelector 调用） =====
  const handleImageSelectForMessage = useCallback((messageId: string, index: number) => {
    // 判断是 Step1 还是 Step2（根据消息 ID 前缀）
    const isStep2 = messageId.startsWith('step2-');
    const step = isStep2 ? 2 : 1;
    
    console.log("[ChatPage] 用户选择了图片:", index, "消息ID:", messageId, "步骤:", step);
    
    // 如果 hook 状态正常（正在 selecting），使用 hook 的 confirmSelection
    if (generationTask.status === 'selecting') {
      confirmSelection(index);
      return;
    }
    
    // 否则（页面刷新后或其他情况），直接处理保存逻辑
    console.log("[ChatPage] Hook 状态不是 selecting，直接处理保存");
    
    // 更新消息的选中状态
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, selectedImageIndex: index }
          : msg
      )
    );
    
    // 获取 dbId（使用 ref 避免闭包问题）
    const session = chatSessionsRef.current.find((s) => s.id === currentSessionIdRef.current);
    const dbId = session?.dbId || currentSessionIdRef.current || '';
    
    if (!dbId) {
      console.error("[ChatPage] 无法保存选择：缺少 dbId");
      return;
    }
    
    if (isStep2) {
      // Step2: 保存最终效果图选择
      console.log("[ChatPage] 保存 Step2 选择到数据库, dbId:", dbId, "index:", index);
      saveStep2SelectedIndex(dbId, index).then((success) => {
        if (success) {
          console.log("[ChatPage] 最终效果图已保存到数据库");
        } else {
          console.error("[ChatPage] 最终效果图保存失败");
        }
      });
    } else {
      // Step1: 保存背景图选择
      console.log("[ChatPage] 保存 Step1 选择到数据库, dbId:", dbId, "index:", index);
      saveSelectedImageIndex(dbId, index);
      
      // Step1 确认后需要启动 Step2（如果图片可用）
      // 查找消息中的图片
      const msg = messages.find((m) => m.id === messageId);
      if (msg?.generatedImages && msg.generatedImages[index]) {
        const selectedImage = msg.generatedImages[index];
        step1SelectedImageRef.current = selectedImage;
        
        // 启动 Step2
        console.log("[ChatPage] Step1 确认完成，开始 Step2...");
        
        // 创建 Step2 loading 消息
        const step2LoadingId = `step2-loading-${Date.now()}`;
        step2MessageIdRef.current = step2LoadingId;
        const step2LoadingMessage: Message = {
          id: step2LoadingId,
          role: Role.MODEL,
          content: "",
          timestamp: Date.now(),
          messageType: 'image-generation-loading',
          step: 2,
        };
        setMessages((prev) => [...prev, step2LoadingMessage]);
        
        // 调用 Step2
        const confirmedText = confirmedTextRef.current || '';
        const size = selectedSizeRef.current || '1024x1024';
        
        startStep2({
          selectedBackgroundImage: selectedImage,
          confirmedText,
          size,
          conversationId: dbId,
        });
      }
    }
  }, [generationTask.status, confirmSelection, messages, startStep2]);

  // ===== 处理打开文字编辑弹窗 =====
  const handleOpenTextEditor = useCallback(() => {
    console.log("[ChatPage] 打开文字编辑弹窗");
    setIsTextEditModalOpen(true);
  }, []);

  // ===== 处理下载编辑后的图片 =====
  const handleDownloadImage = useCallback(() => {
    // 优先使用缓存的图片 URL
    const imageUrl = cachedEditedImageUrl;
    if (!imageUrl) {
      console.warn("[ChatPage] 没有可下载的图片");
      return;
    }
    
    console.log("[ChatPage] 下载图片:", imageUrl.slice(0, 100));
    
    // 创建下载链接
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `design-${Date.now()}.png`;
    
    // 如果是 data URL，直接下载
    if (imageUrl.startsWith('data:')) {
      link.click();
    } else {
      // 如果是远程 URL，需要 fetch 后转为 blob
      fetch(imageUrl)
        .then(res => res.blob())
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          link.href = blobUrl;
          link.click();
          URL.revokeObjectURL(blobUrl);
        })
        .catch(err => {
          console.error("[ChatPage] 下载图片失败:", err);
          // 尝试直接打开
          window.open(imageUrl, '_blank');
        });
    }
  }, [cachedEditedImageUrl]);

  // ===== 处理最终确认 =====
  const [isTextEditFinalized, setIsTextEditFinalized] = useState(false);
  
  const handleFinalConfirm = useCallback(() => {
    console.log("[ChatPage] 最终确认设计图");
    setIsTextEditFinalized(true);
    
    // 添加确认消息
    const confirmMessage: Message = {
      id: `final-confirm-${Date.now()}`,
      role: Role.MODEL,
      content: "✅ 设计图已最终确认！您可以随时使用下载按钮保存图片。",
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, confirmMessage]);
  }, []);

  // ===== 处理文字编辑弹窗导出 =====
  const handleTextEditorExport = useCallback(async (imageDataUrl: string, canvasState: unknown) => {
    console.log("[ChatPage] 文字编辑导出, 图片大小:", imageDataUrl.length);
    
    // ===== 乐观更新：先缓存并关闭弹窗，再异步保存 =====
    // 1. 立即缓存编辑后的图片和 canvas 状态
    setCachedEditedImageUrl(imageDataUrl);
    setCachedCanvasState(canvasState);
    
    // 2. 立即更新消息中的图片（乐观更新，用户立即看到）
    setMessages((prev) =>
      prev.map((msg) =>
        msg.messageType === 'text-edit-ready'
          ? { ...msg, editedImageUrl: imageDataUrl }
          : msg
      )
    );
    
    // 3. 立即关闭弹窗（用户体验优先）
    setIsTextEditModalOpen(false);
    
    // 4. 异步上传和保存（后台进行）
    const session = chatSessionsRef.current.find((s) => s.id === currentSessionIdRef.current);
    const dbId = session?.dbId || currentSessionIdRef.current || '';
    
    if (!dbId) {
      console.error("[ChatPage] 无法保存编辑图片：缺少会话 ID");
      return;
    }
    
    // 异步保存到云端（不阻塞用户操作）
    (async () => {
      try {
        console.log("[ChatPage] 后台上传编辑后的图片到 Storage...");
        const imageUrl = await uploadEditedImage(imageDataUrl, dbId);
        
        if (imageUrl) {
          // 保存 URL 和 canvas 状态到数据库
          const success = await saveEditedImage(dbId, imageUrl, canvasState);
          if (success) {
            console.log("[ChatPage] 编辑后的图片和 canvas 状态已保存到云端:", imageUrl);
            
            // 更新缓存为云端 URL（更稳定）
            setCachedEditedImageUrl(imageUrl);
            
            // 更新消息中的编辑结果（找到 text-edit-ready 消息并更新）
            setMessages((prev) =>
              prev.map((msg) =>
                msg.messageType === 'text-edit-ready'
                  ? { ...msg, editedImageUrl: imageUrl }
                  : msg
              )
            );
          } else {
            console.error("[ChatPage] 保存到数据库失败");
          }
        } else {
          console.error("[ChatPage] 上传图片失败");
        }
      } catch (error) {
        console.error("[ChatPage] 后台保存编辑图片失败:", error);
      }
    })();
  }, []);

  const sendMessage = useCallback(async () => {
    // 双重检查防止重复发送
    if ((!input.trim() && uploadedImages.length === 0) || isLoading || isSendingRef.current) return;
    
    // 立即标记为发送中（比 setState 更快）
    isSendingRef.current = true;

    // 发送新消息时，清除可编辑状态（用户没点确认就继续对话了）
    if (editableMessageId) {
      console.log("[ChatPage] 用户继续对话，清除可编辑状态");
      setEditableMessageId(null);
      setIsEditingMessageId(null);
      setEditedContent("");
      setSaveStatus('idle');
    }
    
    // 取消之前未完成的请求（如果有）
    if (abortControllerRef.current) {
      console.log("[ChatPage] 取消之前的请求");
      abortControllerRef.current.abort();
    }

    const messageContent = input.trim() || "(发送了图片)";
    const imagesToSend = [...uploadedImages];
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: Role.USER,
      content: messageContent,
      timestamp: Date.now(),
    };

    setInput("");
    setUploadedImages([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = Date.now().toString();
      const newSession: ChatSession = {
        id: sessionId,
        title: messageContent.slice(0, 30) + (messageContent.length > 30 ? "..." : ""),
        messages: [userMessage],
        createdAt: Date.now(),
      };
      
      prevSessionIdRef.current = sessionId;
      isInternalUpdateRef.current = true;
      
      setChatSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(sessionId);
      setMessages([userMessage]);
    } else {
      setMessages((prev) => [...prev, userMessage]);
    }

    setIsLoading(true);
    
    // 生成请求 ID，用于检查响应是否过期
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    currentRequestIdRef.current = requestId;
    console.log(`[ChatPage] 发送请求: ${requestId}`);

    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage: Message = {
      id: aiMessageId,
      role: Role.MODEL,
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, aiMessage]);

    try {
      // 转换图片为 FileInfo 格式
      let files: FileInfo[] | undefined;
      if (imagesToSend.length > 0) {
        files = await filesToFileInfos(imagesToSend);
      }

      // 获取当前会话的 Dify conversationId（优先从 session 中获取，否则从内存 map 中获取）
      const currentSession = chatSessions.find((s) => s.id === sessionId);
      const difyConversationId = currentSession?.difyConversationId || (sessionId ? difyConversationIds[sessionId] : undefined);

      // 调用 Dify API（传递本地 sessionId 和 Dify conversationId）
      const result = await integrateDifyChat(
        {
          query: messageContent,
          files,
          conversationId: sessionId,          // 本地对话 ID
          difyConversationId: difyConversationId, // Dify 的 conversation_id
        },
        (chunk: string) => {
          // 流式更新消息
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, content: msg.content + chunk } : msg
            )
          );
        }
      );

      // 检查请求是否已被取消（响应过期）
      if (currentRequestIdRef.current !== requestId) {
        console.log(`[ChatPage] 忽略过期响应: ${requestId}, 当前: ${currentRequestIdRef.current}`);
        return;
      }

      if (result.success) {
        // 存储 Dify 返回的 conversationId（用于多轮对话）
        if (sessionId && result.difyConversationId) {
          setDifyConversationIds((prev) => ({
            ...prev,
            [sessionId]: result.difyConversationId,
          }));
        }

        // 保存数据库返回的 dbId（用于查询消息）
        if (sessionId && result.conversationId) {
          setChatSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId ? { ...s, dbId: result.conversationId } : s
            )
          );
        }

        // 如果没有流式回调，直接设置完整内容
        // 同时添加 status 和 messageDbId 用于可编辑功能
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? { 
                  ...msg, 
                  content: result.response, 
                  isStreaming: false,
                  status: result.status,           // 保存 status
                  messageDbId: result.messageId,   // 保存数据库消息 ID
                }
              : msg
          )
        );

        // 如果 status === 'yes'，设置为可编辑状态
        if (result.status === 'yes') {
          console.log("[ChatPage] status=yes，启用可编辑模式");
          setEditableMessageId(aiMessageId);
          setEditedContent(result.response);
          setSaveStatus('idle');
          setConfirmedMessageId(null);
        }
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? { ...msg, content: `抱歉，请求失败：${result.error}`, isStreaming: false }
              : msg
          )
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId
            ? { ...msg, content: `抱歉，发生错误：${errorMessage}`, isStreaming: false }
            : msg
        )
      );
    } finally {
      // 清理状态，允许下次发送
      setIsLoading(false);
      isSendingRef.current = false;
      abortControllerRef.current = null;
      setMessages((prev) =>
        prev.map((msg) => (msg.id === aiMessageId ? { ...msg, isStreaming: false } : msg))
      );
    }
  }, [input, uploadedImages, isLoading, currentSessionId, setChatSessions, setCurrentSessionId, difyConversationIds, chatSessions, editableMessageId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const canSend = (input.trim() || uploadedImages.length > 0) && !isLoading;

  return (
    <>
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-4 md:px-8 relative z-20 border-b border-border/40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-2 -ml-2 text-muted-foreground hover:text-marriott-600 hover:bg-card/50 rounded-xl transition-all ${
              sidebarOpen ? "md:opacity-0 md:pointer-events-none" : "opacity-100"
            }`}
            aria-label="Toggle Menu"
          >
            <PanelLeftIcon className="w-5 h-5" />
          </button>

          {/* Model Badge */}
          <div
            className={`hidden md:flex items-center gap-2.5 px-4 py-2 glass rounded-full transition-all duration-500 ${
              !sidebarOpen ? "translate-x-0" : "-translate-x-2"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse-slow shadow-[0_0_8px_hsl(var(--primary)/0.8)]"></span>
            <span className="text-xs font-bold text-marriott-600 tracking-wider uppercase">MARRIOTT AI</span>
          </div>
        </div>
      </header>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 custom-scrollbar pt-8 pb-4 scroll-smooth">
        <div className="max-w-3xl mx-auto min-h-full flex flex-col">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in px-4">
              {/* Hero Icon */}
              <div className="relative mb-10">
                <div className="absolute inset-0 bg-primary rounded-3xl blur-xl opacity-50 scale-110 animate-pulse-slow"></div>
                <div className="relative w-24 h-24 bg-primary/80 backdrop-blur-md rounded-3xl flex items-center justify-center rotate-3 transition-transform hover:rotate-6 duration-700 group shadow-lg shadow-primary/30 border border-card/40">
                  <SparklesIcon className="w-10 h-10 text-primary-foreground group-hover:scale-110 transition-transform duration-300 drop-shadow-md" />
                </div>
              </div>

              <h2 className="text-4xl md:text-6xl font-bold mb-4 tracking-tight text-foreground">Welcome.</h2>
              <p className="text-muted-foreground text-lg max-w-md">
                我是 Marriott 智能助手，可以帮您预订酒店、规划旅行、管理会员权益。
              </p>
              <p className="text-muted-foreground/70 text-sm mt-2">
                支持上传图片进行咨询
              </p>
            </div>
          ) : (
            <div className="py-4">
              {messages.map((msg) => (
                <ChatMessage 
                  key={msg.id} 
                  message={msg}
                  canEdit={msg.id === editableMessageId}
                  isEditing={msg.id === isEditingMessageId}
                  editedContent={msg.id === editableMessageId ? editedContent : undefined}
                  onStartEdit={handleStartEdit}
                  onContentChange={(content) => setEditedContent(content)}
                  onSave={handleSaveEdit}
                  onConfirm={handleConfirmEdit}
                  saveStatus={msg.id === confirmedMessageId ? saveStatus : 'idle'}
                  onDesignModeConfirm={handleDesignModeConfirm}
                  // 图片选择相关（仅对 image-generation-result 消息传递）
                  onImageSelect={msg.messageType === 'image-generation-result' 
                    ? (index: number) => handleImageSelectForMessage(msg.id, index) 
                    : undefined}
                  onRegenerate={msg.messageType === 'image-generation-result' ? regenerate : undefined}
                  // 只有当前步骤的消息才显示 loading 状态
                  isGenerating={
                    msg.messageType === 'image-generation-result' && 
                    generationTask.status === 'generating' &&
                    // 根据消息 ID 判断是否是当前正在生成的步骤
                    ((generationTask.currentStep === 1 && msg.id.startsWith('step1-')) ||
                     (generationTask.currentStep === 2 && msg.id.startsWith('step2-')))
                  }
                  // 文字编辑相关（仅对 text-edit-ready 消息传递）
                  onOpenTextEditor={msg.messageType === 'text-edit-ready' ? handleOpenTextEditor : undefined}
                  onDownloadImage={msg.messageType === 'text-edit-ready' && cachedEditedImageUrl ? handleDownloadImage : undefined}
                  onFinalConfirm={msg.messageType === 'text-edit-ready' && cachedEditedImageUrl ? handleFinalConfirm : undefined}
                  isTextEditFinalized={msg.messageType === 'text-edit-ready' ? isTextEditFinalized : undefined}
                />
              ))}
            </div>
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 md:p-6 relative z-20">
        <div className="max-w-3xl mx-auto">
          {/* 图片预览区域 */}
          {uploadedImages.length > 0 && (
            <div className="flex gap-3 mb-3 flex-wrap px-2">
              {uploadedImages.map((file, index) => (
                <ImagePreview
                  key={`${file.name}-${index}`}
                  file={file}
                  onRemove={() => removeImage(index)}
                />
              ))}
            </div>
          )}

          <div className="relative flex items-end gap-3 glass-strong rounded-2xl p-2 transition-all duration-300 hover:border-primary/50 focus-within:border-primary focus-within:shadow-lg focus-within:shadow-primary/20 shadow-lg shadow-primary/10">
            {/* Glass highlight */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-card/50 to-transparent pointer-events-none"></div>
            <div className="absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-card to-transparent"></div>

            {/* 隐藏的文件输入 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            {/* 图片上传按钮 */}
            <button
              onClick={handleImageUpload}
              disabled={isLoading}
              className="p-3 rounded-xl flex-shrink-0 mb-0.5 ml-0.5 transition-all duration-300 relative z-10 text-muted-foreground hover:text-marriott-600 hover:bg-card/50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="上传图片"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入您的问题，或上传图片..."
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none resize-none max-h-48 text-foreground placeholder:text-muted-foreground px-2 py-3 leading-relaxed custom-scrollbar text-[15px] relative z-10"
              rows={1}
            />

            <button
              onClick={sendMessage}
              disabled={!canSend}
              className={`
                p-3 rounded-xl flex-shrink-0 mb-0.5 mr-0.5 transition-all duration-300 ease-out relative z-10
                ${
                  canSend
                    ? "bg-primary text-primary-foreground hover:scale-105 active:scale-95 shadow-lg shadow-primary/40 font-semibold hover:bg-marriott-600"
                    : "bg-card/50 text-muted-foreground cursor-not-allowed backdrop-blur-sm"
                }
              `}
            >
              {isLoading ? (
                <LoadingIcon className="w-5 h-5" />
              ) : (
                <SendIcon className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-center text-muted-foreground text-xs mt-3">
            Marriott AI 由 Dify 提供支持，可能会产生错误。请核实重要信息。
          </p>
        </div>
      </div>
      
      {/* 文字编辑弹窗 */}
      <TextEditModal
        isOpen={isTextEditModalOpen}
        onClose={() => setIsTextEditModalOpen(false)}
        backgroundImage={textEditBackgroundImage}
        lines={textEditLines}
        onExport={handleTextEditorExport}
        isSaving={isSavingEditedImage}
        savedCanvasState={cachedCanvasState as any}
      />
    </>
  );
};
