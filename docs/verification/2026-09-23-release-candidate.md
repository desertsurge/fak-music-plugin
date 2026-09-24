# Fak Music 发布候选版验证记录

日期：2026-09-23  
范围：Task 4 文档与发布候选版验收证据  
目录：`E:\git\AI\case\fak-music-plugin`

## 自动化与构建

以下命令已独立运行：

```text
npm run test:run
```

结果：通过，5 个测试文件、35 个测试全部通过。

```text
npm run build
```

结果：通过，TypeScript 检查和 Vite 生产构建均成功，产物位于 `dist/`，可按 `dist/manifest.json` 加载为未打包扩展。

测试类型为 helper/unit 测试和 jsdom UI 测试，覆盖目录校验和许可证过滤、主/备用播放地址切换、候选耗尽后的队列跳过、队列循环、音量边界、目录刷新失败回退，以及 Popup 类型筛选、卡片播放/暂停、播放错误重试、刷新失败重试和移动端播放器 safe-area。当前没有 Service Worker/background 或 Offscreen Document 的集成测试；这些测试也没有把真实音频服务连通性当作通过条件。

## 浏览器检查

使用构建产物检查 Popup 的首屏、类型筛选菜单和桌面/窄窗口布局：

| 视口 | 结果 |
| --- | --- |
| 1280 px 桌面视口 | 通过，`innerWidth=1280`、`scrollWidth=1280`，首屏和筛选状态无明显布局溢出 |
| 390 px 窄视口 | 通过，`innerWidth=390`、`scrollWidth=390`，底部两行播放器可见，无横向滚动 |

两种视口均检查 `scrollWidth === viewport width`，结果为通过（无横向溢出）。

浏览器检查没有执行真实音频的端到端播放、备用地址切换或全队列错误重试；这些行为仅由 helper/unit 测试覆盖，不能据此宣称真实音频错误恢复已验证。

截图证据：

- `artifacts/fak-music-plugin/desktop-final.png`
- `artifacts/fak-music-plugin/desktop-filter-final.png`
- `artifacts/fak-music-plugin/mobile-final-bottom.png`

## 飞书交付

已使用以下命令发送上述最终桌面、筛选和移动端截图：

```text
cc-connect send --image artifacts/fak-music-plugin/desktop-final.png --image artifacts/fak-music-plugin/desktop-filter-final.png --image artifacts/fak-music-plugin/mobile-final-bottom.png -m "Fak Music 发布候选版 UI 验证"
```

以本轮命令输出为证：命令返回成功（exit code 0），当前会话已收到图片证据。

## 未验证事项

本记录不声明 placeholder 音频地址的真实播放成功，不声明真实音频错误重试已通过浏览器验证，不声明第三方电台持续可用，也不声明 Chrome/Edge 扩展商店已提交或发布。当前也没有 background/offscreen 集成测试。正式发布前仍需替换并审核真实目录、补充项目 `LICENSE`、隐私说明和商店材料。

## 2026-09-24 真实运行复核（历史快照）

以下记录对应当时包含 Classical fallback 条目的构建，保留作历史证据；当前 fallback 已移除该未验证电台，当前目录以仓库中的 `public/presets-fallback.json` 为准。

在 Microsoft Edge 使用 `dist/` 以未打包扩展方式加载，Service Worker 和 Offscreen Document 均成功启动。

实际 Popup/播放结果：

- 首屏加载 4 个 fallback 条目；类型筛选后显示 3 个电台。
- 点击 Lo-fi 后，Offscreen `<audio>` 读取到 `readyState=3`、`paused=false`、`currentTime` 持续增长，Popup 显示“正在播放”。
- 点击下一项后 Jazz Radio 也进入 `readyState=3`、`paused=false`。
- Classical 源在 8 秒内没有进入可播放状态，新增的播放加载超时将其跳过并进入 Open Skies；Open Skies 同样超时后继续回到 Lo-fi，队列没有卡死。
- 历史示例远程目录 URL `https://raw.githubusercontent.com/fak-music/music-presets/main/generated/presets.json` 实测返回 HTTP 404；当前代码已将默认远程目录配置置空，因此不会在启动时反复请求该失效地址。配置合法 HTTPS URL 后，失败仍会保留本地目录。

外部源探测：

- I Love Radio：返回 `audio/mpeg`，Edge 实际播放成功。
- Jazz Radio：返回 `audio/mpeg`，Edge 实际播放成功。
- Classical Radio：连接超时，已由播放加载超时机制处理。
- Internet Archive placeholder：当前环境连接超时，未宣称播放成功。

本轮新增播放加载超时、远程目录 URL 校验和空配置短路测试后，最终自动化结果为 5 个测试文件、35 个测试通过，`npm run build` 成功。真实 Edge 验证截图保存为 `artifacts/fak-music-plugin/extension-real-final.png` 和 `artifacts/fak-music-plugin/extension-real-playing.png`；真实运行证据仍不代表所有第三方源长期可用。当前默认远程目录为空配置，Edge 实测启动后直接显示“本地目录”、4 个 fallback 条目且无刷新错误。
