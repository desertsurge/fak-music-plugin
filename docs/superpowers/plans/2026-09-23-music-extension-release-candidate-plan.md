# Fak Music 发布候选版实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 Fak Music MVP 推进为可验收的发布候选版，补齐播放恢复、目录刷新、Popup 交互、自动化测试和浏览器证据。

**Architecture:** 保留 Popup + Service Worker + Offscreen Document 架构。用小型状态/事件边界修复播放恢复，用可注入的目录刷新依赖保证缓存行为可测试，用 Popup 本地状态实现类型筛选和错误反馈。

**Tech Stack:** TypeScript、React、Vite、Vitest、jsdom、Chrome Manifest V3、cc-connect。

---

### Task 1: 播放恢复与状态一致性

**Files:**
- Modify: `src/background.ts`
- Modify: `src/offscreen.ts`
- Modify: `src/shared/messages.ts`
- Test: `src/shared/player.test.ts`

- [ ] **Step 1: Write failing tests for exhausted candidates and next-item selection**

在 `src/shared/player.test.ts` 增加测试，断言候选地址耗尽后返回下一项索引，并保留原有候选顺序测试。测试应调用新增的纯函数，不依赖 Chrome API。

- [ ] **Step 2: Run the focused test and verify it fails**

运行 `npm test -- src/shared/player.test.ts --run`。预期新增断言失败，因为当前实现没有“候选耗尽后跳过”的纯函数。

- [ ] **Step 3: Implement minimal playback transition helpers**

在 `src/shared/player.ts` 增加 `nextPlayableIndex(queueIndex, candidateCount, direction, length)` 或等价的纯函数；在 `background.ts` 让候选耗尽分支调用队列跳转，而不是直接写入 error。为每次 `LOAD` 生成递增令牌，并在 `OffscreenEvent` 中携带令牌，忽略旧加载的迟到事件。

- [ ] **Step 4: Make card-level pause use the existing toggle message**

在 `src/popup/App.tsx` 中将 `playItem` 改为：当前 item 且状态为 `playing`/`loading` 时发送 `TOGGLE_PLAY`，否则发送 `PLAY_ITEM`。保持服务端消息协议不增加重复命令。

- [ ] **Step 5: Run all focused tests and build**

运行 `npm test -- src/shared/player.test.ts --run` 和 `npm run build`，确认候选耗尽、队列循环和 TypeScript 构建均通过。

### Task 2: 首次目录刷新与缓存回退

**Files:**
- Modify: `src/background.ts`
- Modify: `src/shared/catalog-refresh.ts`
- Modify: `src/shared/catalog-refresh.test.ts`
- Modify: `src/shared/storage.ts`

- [ ] **Step 1: Write failing tests for immediate refresh and failure preservation**

为目录刷新增加可注入 URL/fetcher 的测试；覆盖成功替换、超时、格式错误和失败后保留旧 catalog/source。若刷新入口仍绑定常量，先让测试暴露该耦合。

- [ ] **Step 2: Run the focused tests and verify the new assertions fail**

运行 `npm test -- src/shared/catalog-refresh.test.ts --run`，确认失败原因是缺少可注入配置或失败回退行为，而不是测试拼写错误。

- [ ] **Step 3: Implement immediate background refresh**

在 `ensureState` 完成 fallback/cache 初始化和 alarm 创建后调用一次后台刷新，不阻塞 `GET_STATE`；刷新失败只记录错误并保留现有状态。将远程地址提取为模块级配置入口，确保测试可以传入测试 URL。

- [ ] **Step 4: Keep last-known-good catalog on all refresh failures**

让 `refreshCatalog` 只有在 `fetchRemoteCatalog` 和 `parseCatalog` 都成功后才替换 catalog、source 和 queue；失败路径返回错误结果但不写入失败目录。

- [ ] **Step 5: Run all tests and build**

运行 `npm run test:run` 和 `npm run build`，确认目录刷新和已有测试全部通过。

### Task 3: Popup 筛选与错误状态

**Files:**
- Modify: `src/popup/App.tsx`
- Modify: `src/popup/components/PresetCard.tsx`
- Modify: `src/popup/components/PlayerBar.tsx`
- Modify: `src/popup/styles.css`
- Create: `src/popup/app.test.tsx`

- [ ] **Step 1: Add failing jsdom tests for filter and card pause**

新增测试：点击筛选按钮后可选择“电台/单曲”，筛选结果只保留对应类型；当前播放卡片点击暂停会发送 `TOGGLE_PLAY`，非当前卡片仍发送 `PLAY_ITEM`。

- [ ] **Step 2: Run the UI tests and verify the expected failures**

运行 `npm test -- src/popup/app.test.tsx --run`，确认失败来自缺少筛选交互或错误消息分支。

- [ ] **Step 3: Implement filter state and accessible menu**

在 `App.tsx` 增加 `typeFilter` 状态和可关闭的筛选菜单，筛选条件与现有 view/query 组合；为按钮和菜单项提供 aria 属性和键盘操作。

- [ ] **Step 4: Implement playback error and refresh feedback**

在 Popup 中识别 `player.status === 'error'` 和刷新失败结果，展示可读状态与重试入口；不清空现有目录。更新 CSS，确保桌面和窄窗口下文字不溢出。

- [ ] **Step 5: Run UI tests and build**

运行 `npm test -- src/popup/app.test.tsx --run` 和 `npm run build`，确认交互测试和生产构建通过。

### Task 4: 浏览器验证、截图与文档

**Files:**
- Modify: `README.md`
- Modify: `docs/extension-usage.md`
- Create: `docs/verification/2026-09-23-release-candidate.md`

- [x] **Step 1: Build the unpacked extension**

运行 `npm run test:run` 和 `npm run build`，记录测试数量、构建产物和 manifest 路径。

- [x] **Step 2: Load `dist/` in Chromium with browser automation**

启动本地服务或使用扩展加载方式，验证 Popup 首屏和类型筛选；检查桌面与窄窗口布局及 `scrollWidth === viewport width`。本步骤不覆盖真实音频播放、备用地址切换或错误重试的端到端验证。

- [x] **Step 3: Capture and send UI evidence**

保存桌面和窄窗口截图到 `artifacts/fak-music-plugin/`，执行 `cc-connect send --image <desktop.png> --image <mobile.png> -m "Fak Music 发布候选版 UI 验证"`。记录命令退出码和发送结果；失败时在验证文档中注明。

- [x] **Step 4: Update usage and known limitations**

更新 README 和使用说明，明确首次刷新、缓存回退、开发样例目录、许可证边界和当前未支持的真实数据源。

- [x] **Step 5: Final verification**

重新运行 `npm run test:run`、`npm run build`，记录 `dist/` 构建产物和验证边界；浏览器证据仅覆盖首屏、筛选、布局和 `scrollWidth`，不扩展为真实音频或 background/offscreen 集成验收。
