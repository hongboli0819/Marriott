import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/shared/ui/Sidebar";
import { SunIcon, MoonIcon } from "@/shared/ui/Icon";
import { ChatSession } from "@/core/types/io";
import { fetchConversations, deleteConversation } from "@/core/services/chatHistoryService";

export const AppShell: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [brightness, setBrightness] = useState(100);
  const [showBrightnessPanel, setShowBrightnessPanel] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // 加载历史对话
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const conversations = await fetchConversations();
        setChatSessions(conversations);
        console.log(`[AppShell] Loaded ${conversations.length} conversations from database`);
      } catch (error) {
        console.error("[AppShell] Failed to load history:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNewChat = () => {
    setCurrentSessionId(null);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    // 查找 session，获取数据库 UUID
    const session = chatSessions.find((s) => s.id === sessionId);
    const dbId = session?.dbId || sessionId;  // 优先使用 dbId，兼容新会话
    
    // 从数据库删除（使用 UUID）
    const deleted = await deleteConversation(dbId);
    if (deleted) {
      setChatSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
      }
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  return (
    <div className="flex h-screen overflow-hidden font-sans relative bg-gradient-to-br from-marriott-100 via-marriott-50 to-marriott-200">
      {/* ===== 动态背景 ===== */}
      <div
        className="fixed inset-0 z-0 overflow-hidden transition-all duration-300"
        style={{ filter: `brightness(${brightness}%)` }}
      >
        {/* 彩色光斑 - Marriott 红色主题 */}
        <div className="absolute top-[-15%] left-[-10%] w-[55vw] h-[55vw] bg-primary/40 rounded-full blur-[80px] animate-blob"></div>
        <div className="absolute top-[30%] right-[-10%] w-[50vw] h-[50vw] bg-marriott-400/30 rounded-full blur-[70px] animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[-15%] left-[25%] w-[50vw] h-[50vw] bg-marriott-200/40 rounded-full blur-[80px] animate-blob animation-delay-4000"></div>
        <div className="absolute top-[50%] left-[10%] w-[30vw] h-[30vw] bg-gold-400/25 rounded-full blur-[60px] animate-blob animation-delay-3000"></div>

        {/* 网格图案 */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: `
              linear-gradient(hsl(var(--primary) / 0.5) 1px, transparent 1px),
              linear-gradient(90deg, hsl(var(--primary) / 0.5) 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px",
          }}
        ></div>

        {/* 点状图案 */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--primary)) 2px, transparent 0)`,
            backgroundSize: "30px 30px",
          }}
        ></div>
      </div>

      {/* 移动端侧边栏遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 z-30 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ===== 亮度控制面板 ===== */}
      <div className="fixed top-4 right-4 z-50 flex items-start gap-2">
        <div
          className={`
          overflow-hidden transition-all duration-300 ease-out
          ${showBrightnessPanel ? "w-64 opacity-100" : "w-0 opacity-0"}
        `}
        >
          <div className="glass-strong rounded-2xl shadow-lg shadow-primary/20 p-4 min-w-[250px]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-foreground">亮度调节</span>
              <span className="text-xs font-bold text-marriott-600 bg-primary/20 px-2 py-1 rounded-full">
                {brightness}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <MoonIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                type="range"
                min="50"
                max="130"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="flex-1 h-2 bg-gradient-to-r from-muted to-primary rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-5
                  [&::-webkit-slider-thumb]:h-5
                  [&::-webkit-slider-thumb]:bg-card
                  [&::-webkit-slider-thumb]:border-2
                  [&::-webkit-slider-thumb]:border-primary
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-webkit-slider-thumb]:transition-transform
                  [&::-webkit-slider-thumb]:hover:scale-110
                "
              />
              <SunIcon className="w-4 h-4 text-primary flex-shrink-0" />
            </div>
            <div className="flex justify-between mt-3 gap-2">
              <button
                onClick={() => setBrightness(80)}
                className="flex-1 text-xs py-1.5 px-2 bg-muted hover:bg-muted/80 rounded-lg text-muted-foreground transition-colors"
              >
                暗
              </button>
              <button
                onClick={() => setBrightness(100)}
                className="flex-1 text-xs py-1.5 px-2 bg-primary/20 hover:bg-primary/30 rounded-lg text-marriott-600 font-semibold transition-colors"
              >
                标准
              </button>
              <button
                onClick={() => setBrightness(120)}
                className="flex-1 text-xs py-1.5 px-2 bg-muted hover:bg-muted/80 rounded-lg text-muted-foreground transition-colors"
              >
                亮
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowBrightnessPanel(!showBrightnessPanel)}
          className={`
            p-3 rounded-xl transition-all duration-300 shadow-lg
            ${
              showBrightnessPanel
                ? "bg-primary text-primary-foreground shadow-primary/40"
                : "glass text-marriott-600 hover:bg-card/80"
            }
          `}
          aria-label="Toggle Brightness"
        >
          <SunIcon className="w-5 h-5" />
        </button>
      </div>

      {/* ===== 浮动布局 ===== */}
      <div className="flex w-full h-full p-3 md:p-4 gap-3 md:gap-4 relative z-10">
        <Sidebar
          isOpen={sidebarOpen}
          onNewChat={handleNewChat}
          toggleSidebar={toggleSidebar}
          chatSessions={chatSessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
        />

        {/* ===== 主内容区域 ===== */}
        <main
          className={`
          flex-1 flex flex-col relative overflow-hidden
          glass-strong rounded-3xl
          shadow-[0_8px_32px_hsl(var(--primary)/0.2),inset_0_1px_0_hsl(var(--card)/0.6)]
          transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
        `}
        >
          {/* 玻璃高光 */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-card/50 via-transparent to-transparent pointer-events-none"></div>
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-card to-transparent"></div>
          <div className="absolute inset-y-0 left-0 w-[1px] bg-gradient-to-b from-card via-card/50 to-transparent"></div>

          <Outlet
            context={{
              sidebarOpen,
              setSidebarOpen,
              chatSessions,
              setChatSessions,
              currentSessionId,
              setCurrentSessionId,
            }}
          />
        </main>
      </div>
    </div>
  );
};

