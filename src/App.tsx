import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { ChatPage } from "@/app/pages/ChatPage";

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<ChatPage />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
