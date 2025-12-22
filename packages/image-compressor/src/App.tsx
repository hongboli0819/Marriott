// 规范要求：只做壳子布局 + 自己项目的页面
import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { HomePage } from "@/app/pages/HomePage";
import { PlaygroundPage } from "@/app/pages/PlaygroundPage";

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/playground" element={<PlaygroundPage />} />
        </Routes>
      </AppShell>
    </div>
  );
}

export default App;


