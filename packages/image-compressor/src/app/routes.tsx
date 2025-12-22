/**
 * App 级路由配置
 * 
 * 遵循规范：路由只服务于本项目自己的前端体验
 */

import { RouteObject } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { PlaygroundPage } from "./pages/PlaygroundPage";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/playground",
    element: <PlaygroundPage />,
  },
];


