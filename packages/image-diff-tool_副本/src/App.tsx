import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { HomePage } from "@/app/pages/HomePage";
import { PlaygroundPage } from "@/app/pages/PlaygroundPage";

/**
 * L-App 根组件
 */
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
