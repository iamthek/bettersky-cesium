import { createDemoConfig } from './vite.config.js';

// demo2 仅用于本地联调：复用主 Demo 的配置，只替换入口目录和开发端口，
// 使 `pnpm dev`（demo/，3000）与 `pnpm dev:demo2`（demo2/，3001）可以同时运行。
export default createDemoConfig({ demoRoot: './demo2/', port: 3001 });
