# Fak Music

Fak Music 是一个 Chrome/Edge Manifest V3 音乐扩展开发样例。安装后可以播放内置的真实网络电台；目录在后台尝试更新，远程服务不可用时继续使用最后一次可用的本地数据。开放授权单曲会在完成真实可用性和许可证审核后再进入默认目录。

## 特性

- 内置可播放电台，首次打开无需配置；配置远程目录后启动时后台会立即刷新
- Popup 播放器支持搜索、推荐/电台/单曲/收藏视图、类型筛选菜单、收藏、音量和上一项/下一项
- Offscreen Document 保持后台音频，不因关闭 Popup 立即中断
- 主播放地址失败时自动尝试备用地址；候选地址全部失败后跳过到队列中的下一项，整个队列都失败时显示播放失败状态
- 远程目录按计划刷新；请求失败、超时或格式错误时保留上一份可用缓存，Popup 提供手动刷新和失败重试
- 单曲目录要求保留许可证和来源链接

## 本地开发

环境要求：Node.js 22.22.2+、npm。仓库级 `.npmrc` 固定使用公开 npm registry，避免把本机私有镜像写入可公开复现的 lockfile。

```bash
npm install
npm run dev
```

开发页面默认监听所有网卡，可通过 `http://localhost:5173/` 或本机局域网 IP（例如 `http://192.168.23.47:5173/`）访问。该页面现在包含本地 `HTMLAudioElement` 播放适配器，点击 I LOVE RADIO 或 Jazz Radio 即可直接试听；浏览器扩展模式则使用 Service Worker + Offscreen Document。扩展构建：

```bash
npm run build
```

构建产物位于 `dist/`。

## 加载扩展

1. 打开 Chrome 或 Edge 的扩展管理页（Chrome 为 `chrome://extensions`，Edge 为 `edge://extensions`）。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展”，选中本项目的 `dist/` 目录。
4. 点击工具栏中的 Fak Music 图标开始播放。

详细的操作说明见 [`docs/extension-usage.md`](docs/extension-usage.md)。

## 远程目录

扩展默认从 [`https://desertsurge.github.io/fak-music-plugin/presets.json`](https://desertsurge.github.io/fak-music-plugin/presets.json) 获取动态目录，同时支持通过构建变量覆盖为其他 HTTP(S) 地址。首次初始化会先加载 [`public/presets-fallback.json`](public/presets-fallback.json)，已有缓存优先作为当前内容；远程刷新不会阻塞首屏。覆盖目录地址并构建：

```powershell
$env:VITE_CATALOG_URL = 'https://your-maintained-host.example/presets.json'
npm run build
```

远程响应只有在通过目录校验后才会替换当前目录。网络错误、HTTP 错误、超时或格式校验失败都不会清空或覆盖最后一次可用的 fallback/cache，Popup 中的“更新目录”按钮可再次尝试，失败时可点击“重试”。后台定时任务每 6 小时再次刷新。

默认 fallback 只保留已经实测可播放的 I LOVE RADIO 和 Jazz Radio；开放授权单曲在通过真实连通性、许可证和归属审核前不会进入默认目录。目录结构、自动更新设想和许可证策略见 [`docs/music-presets-auto-update-plan.md`](docs/music-presets-auto-update-plan.md)。

## 自动发布静态目录

仓库内的 [`catalog/rules.json`](catalog/rules.json) 定义 Lo-fi、Jazz、Classical、Ambient 和 Electronic 分类及最低条目数。[`scripts/catalog-generator.mjs`](scripts/catalog-generator.mjs) 从 Radio Browser 获取数据，过滤不健康、重复或编码不受支持的电台，并生成 GitHub Pages 所需文件：

```text
catalog/generated/
├── index.html
├── presets.json
└── health.json
```

本地命令：

```bash
# 从 Radio Browser 实时生成
npm run catalog:generate

# 使用固定 fixture 生成可复现快照
npm run catalog:generate:fixture

# 在临时目录用 fixture 验证目录协议，不修改跟踪文件
npm run catalog:check

# 验证已经生成的实际 Pages 产物
npm run catalog:check -- --input catalog/generated
```

[`publish-catalog.yml`](.github/workflows/publish-catalog.yml) 每 6 小时运行一次，也支持在 GitHub Actions 中手动触发。工作流依次执行依赖安装、全量测试、实时目录生成、目录契约检查和扩展构建，全部通过后才把 `catalog/generated` 部署到 GitHub Pages。生成失败不会发布空目录，Pages 保留上一份成功部署。

## 项目结构

```text
src/
├── background.ts              # Service Worker：状态、目录同步、消息路由
├── offscreen.ts               # 后台 HTMLAudioElement 播放内核
├── shared/                    # 类型、校验、存储、更新和播放工具
└── popup/                     # React 播放器界面
public/
├── manifest.json
└── presets-fallback.json
catalog/
├── rules.json                 # Radio Browser 分类与质量门槛
└── generated/                # GitHub Pages 静态目录
scripts/
├── catalog-generator.mjs     # 目录生成器
└── check-catalog.mjs         # 独立目录契约检查
```

## 验证

```bash
npm run test:run
npm run catalog:check
npm run build
```

当前测试是 helper/unit 测试和 jsdom UI 测试，覆盖目录校验、HTTP(S) 远程目录、许可证过滤、播放候选切换、播放加载超时、全队列失败、音量边界、回退、Popup 类型筛选、播放错误重试、刷新失败重试和移动端播放器 safe-area；当前没有 Service Worker/background 或 Offscreen Document 的集成测试。浏览器证据覆盖 Popup 首屏、类型筛选、桌面/窄窗口布局及 `scrollWidth`，并在 Edge 未打包扩展中实测 Lo-fi/Jazz 播放和失效源超时跳过；不代表所有第三方音频源长期可用。证据及截图索引见 [`docs/verification/2026-09-23-release-candidate.md`](docs/verification/2026-09-23-release-candidate.md)。

## 设计文档

- [`docs/superpowers/specs/2026-09-23-music-extension-design.md`](docs/superpowers/specs/2026-09-23-music-extension-design.md)
- [`docs/superpowers/plans/2026-09-23-music-extension-plan.md`](docs/superpowers/plans/2026-09-23-music-extension-plan.md)

## 许可证

项目许可证尚未指定，当前仓库没有声明可供再分发的项目许可证。发布前必须补充 `LICENSE`，逐项确认默认目录中每个音频的授权、来源和归属要求，并补充隐私说明及商店所需材料。目录中的“开放授权”字段是数据校验门槛，不是本项目对第三方内容拥有版权的声明；网络电台的播放权、地区限制和运营方条款仍需单独核实。

本轮验证了构建、自动化测试、Popup/UI 交互，以及 Edge 未打包扩展中的 I LOVE RADIO/Jazz Radio 真实音频播放。没有把第三方电台长期可用或浏览器扩展商店发布当作已完成事项。
