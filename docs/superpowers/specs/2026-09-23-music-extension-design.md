# Fak Music Plugin 设计

## 目标

构建一个 Chrome/Edge Manifest V3 音乐扩展，安装后无需配置即可播放内置的网络电台和开放授权单曲；目录可后台更新，源失效时自动回退到本地快照或下一条可用地址。

## 方案选择

1. **纯 Popup + HTMLAudioElement**：实现简单，但关闭弹窗后播放会中断，不满足播放器预期。
2. **Popup + Service Worker + Offscreen Document（推荐）**：Popup 只负责交互，Service Worker 负责状态与缓存，Offscreen Document 持有音频元素，兼容 MV3 的后台播放模型。
3. **外部 Web 播放页**：播放能力强，但引入第三方页面、跨域和离线依赖，安装即用体验不稳定。

采用方案 2。目录同步不放入扩展构建流程，扩展内置 `presets-fallback.json`，远程目录通过 `chrome.storage.local` 缓存并在后台更新。

## 用户体验

- Popup 首屏展示当前播放、播放/暂停、上一首/下一首和音量控制。
- “推荐、 电台、单曲、收藏”四个视图，搜索和类型筛选即时生效。
- 电台卡片显示风格、地区和在线状态；单曲卡片显示艺术家、许可证和来源链接。
- 播放失败自动尝试备用 URL，再失败则跳过当前项并提示原因。
- 首次打开无网络时仍展示本地快照；远程目录更新在后台静默完成。
- 所有图标按钮提供 `aria-label` 和 tooltip，键盘可操作。

## 架构

```text
Popup React UI
    | chrome.runtime.sendMessage
Service Worker
    ├── chrome.storage.local: catalog / queue / favorites / settings
    ├── chrome.alarms: periodic catalog refresh
    ├── remote catalog fetch + schema validation
    └── Offscreen Document lifecycle
            └── HTMLAudioElement + playback events
```

## 数据模型

- `Catalog`: schemaVersion、generatedAt、presets。
- `Preset`: id、name、type（station/tracks）、source、items。
- `StationItem`: streamUrl、backupUrls、codec、homepage、lastCheckedAt。
- `TrackItem`: audioUrl、artist、license、sourceUrl、attribution。
- `PlayerState`: status、currentItemId、presetId、position、volume、error。

所有远程数据在进入 UI 前必须通过 schema 校验：未知类型丢弃，缺少必需 URL 的条目丢弃，许可证缺失的单曲不得进入默认推荐。

## 消息协议

Popup 到 Service Worker：`GET_STATE`、`PLAY_ITEM`、`TOGGLE_PLAY`、`NEXT`、`PREVIOUS`、`SET_VOLUME`、`TOGGLE_FAVORITE`、`REFRESH_CATALOG`。

Service Worker 到 Popup：`STATE_UPDATED`、`CATALOG_UPDATED`、`PLAYBACK_ERROR`。

Service Worker 到 Offscreen：`LOAD`、`PLAY`、`PAUSE`、`SEEK`、`SET_VOLUME`、`STOP`。

## 更新与回退

1. 安装时写入内置目录并创建每日刷新 alarm。
2. Popup 首次打开立即读本地目录。
3. Service Worker 在后台请求远程 `presets.json`，超时 8 秒。
4. 校验成功后写入缓存；失败保留旧缓存和内置快照。
5. 每次播放先按主 URL、备用 URL 顺序尝试；连续失败后跳过条目。
6. 最近一次成功目录和内置目录都保留，远程目录不可用时自动降级。

## 视觉设计

- 深色音乐工作台风格，背景使用近黑蓝灰，强调色为青绿色，错误使用暖红色。
- 采用紧凑的两栏结构：左侧导航，右侧内容；小尺寸 Popup 自动变为单栏。
- 当前播放区域固定在底部，避免列表滚动时失去控制。
- 卡片圆角不超过 8px，重复内容使用卡片，页面分区保持无额外嵌套卡片。
- 使用 CSS 变量统一颜色、间距、阴影和焦点环；尊重 `prefers-reduced-motion`。

## 测试策略

- 单元测试：目录校验、目录合并、回退排序、消息 reducer、收藏持久化。
- 集成测试：Service Worker 与 Offscreen 消息往返、播放错误切换备用 URL。
- 构建检查：TypeScript 类型检查、Vite production build、Manifest 关键字段检查。
- 浏览器验证：加载 unpacked extension，覆盖首屏、搜索、播放控制、错误状态、窄视口和键盘操作，并保存桌面截图。

## 非目标

- 不绕过登录、付费、DRM 或平台签名接口。
- 不在首版提供用户自定义远程源编辑器。
- 不保证第三方电台内容本身的版权，由目录生成规则保留来源和许可证信息。
