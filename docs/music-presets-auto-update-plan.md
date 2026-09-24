# 音乐预设自动更新方案

## 1. 目标

将产品目标从“支持用户自定义源”升级为：

> 插件开箱即用，内置一批可播放的音乐预设；预设由公开数据源自动更新，用户不需要手动维护歌单。

方案重点是建立一个可自动发现、可验证、许可证清晰的公开音频目录，并在插件内提供本地兜底。

## 2. 产品定位

第一版建议定位为：

> 内置自动更新的公开音乐电台和开放授权音乐播放器。

这比直接定位为网易云音乐或 QQ 音乐的替代品更容易稳定落地，也能降低接口、版权和播放地址失效风险。

## 3. 推荐数据源

### 3.1 Radio Browser：主要数据源

Radio Browser 最适合第一版的网络电台预设：

- 官网：[radio-browser.info](https://www.radio-browser.info/)
- API 项目：[segler-alex/radiobrowser-api-rust](https://github.com/segler-alex/radiobrowser-api-rust)
- 可按国家、语言、标签、编码格式和在线状态筛选
- 支持 MP3、AAC、Ogg、HLS 等常见流媒体格式
- 可获取电台当前状态、点击量和最后检查时间

建议生成以下预设：

- Lo-fi
- Jazz
- Classical
- Rock
- Pop
- Electronic
- Ambient
- Chillout
- Chinese Music
- English Music
- Japanese Music
- 24/7 Music

局限：电台是连续流，不是单曲队列；可能有广告、主持节目或插播；同一电台可能有多个播放地址；具体内容版权由电台运营方负责。

### 3.2 Jamendo：独立音乐补充源

- 官网：[Jamendo](https://www.jamendo.com/)
- API 文档：[Jamendo API](https://developer.jamendo.com/v3.0)

适合提供按风格、标签、专辑和艺术家组织的独立音乐歌单，尤其是 Creative Commons 音乐。

注意事项：API 通常需要申请 Client ID；不同使用场景可能有授权差异；播放地址和商业使用政策必须确认；不要将 API 密钥放入扩展，应由后端定时同步后生成公开目录。

### 3.3 Internet Archive：探索型歌单

- 官网：[Internet Archive](https://archive.org/)
- API 文档：[Advanced Search API](https://archive.org/developers/apis.html)

适合构建以下主题歌单：

- Public Domain Music
- Creative Commons Music
- Jazz Archive
- Classical Archive
- Live Concerts
- Ambient Archive

局限：内容质量差异较大，元数据不一定规范，音频格式和文件结构不统一，且可下载不代表一定适合在线播放。因此它更适合作为探索型补充源，不建议作为唯一播放源。

### 3.4 Wikimedia Commons：少量高可信公共领域音频

Wikimedia Commons 可用于补充少量公共领域音频，但音乐数量和结构通常不如 Internet Archive。

## 4. 不建议作为默认源的数据

### 4.1 网易云音乐、QQ 音乐、酷狗

不建议作为默认内置内容源，原因包括：

- 播放地址经常过期
- 可能需要登录、Cookie 或签名
- 接口可能随时变化并触发风控
- 版权与再分发边界不清晰
- 扩展商店审核风险较高

未来可以作为用户自行配置的高级适配器，但不应作为默认源。

### 4.2 GitHub 歌曲 URL 集合

GitHub 适合保存源配置、筛选规则和生成后的目录，不适合直接承担音乐服务。常见问题包括维护停止、批量失效、许可证不明确、访问速度不稳定，以及仓库只是抓取其他平台链接。

## 5. 总体架构

```text
Edge 扩展
    |
    ├── 内置预设快照
    |       └── 最近一次可用的推荐数据
    |
    ├── GitHub 远程目录
    |       └── 自动生成的 presets.json
    |
    └── 实时数据源
            ├── Radio Browser
            ├── Jamendo
            └── Internet Archive
```

### 5.1 插件启动流程

1. 先加载本地内置预设，保证立即有内容。
2. 后台请求 GitHub 上的最新 `presets.json`。
3. 远程目录更新成功后替换本地缓存。
4. 对电台或音频 URL 做播放探测。
5. 播放失败时自动切换备用地址或下一项。
6. 远程服务不可用时继续使用本地缓存。

## 6. `music-presets` 仓库结构

建议单独建立 `music-presets` 仓库保存目录生成逻辑：

```text
music-presets/
├── generated/
│   ├── presets.json
│   ├── radio.json
│   ├── tracks.json
│   └── health.json
├── rules/
│   ├── radio-categories.json
│   └── source-filters.json
├── scripts/
│   ├── fetch-radio-browser.ts
│   ├── fetch-jamendo.ts
│   ├── fetch-internet-archive.ts
│   ├── validate-streams.ts
│   └── generate-presets.ts
├── .github/
│   └── workflows/
│       └── refresh-presets.yml
└── README.md
```

扩展只消费生成后的目录，不直接承担各数据源的抓取和清洗逻辑。

## 7. 目录格式

`presets.json` 示例：

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-23T00:00:00Z",
  "presets": [
    {
      "id": "lofi",
      "name": "Lo-fi",
      "type": "station",
      "source": "radio-browser",
      "items": [
        {
          "id": "station-001",
          "title": "Lo-fi Radio",
          "streamUrl": "https://example.com/stream.mp3",
          "backupUrls": [
            "https://backup.example.com/stream.mp3"
          ],
          "codec": "mp3",
          "homepage": "https://example.com",
          "lastCheckedAt": "2026-09-23T00:00:00Z"
        }
      ]
    },
    {
      "id": "creative-commons",
      "name": "Creative Commons Music",
      "type": "tracks",
      "source": "jamendo",
      "items": [
        {
          "id": "track-001",
          "title": "Example Track",
          "artist": "Example Artist",
          "audioUrl": "https://cdn.example.com/track.mp3",
          "license": "CC BY",
          "sourceUrl": "https://example.com/track"
        }
      ]
    }
  ]
}
```

## 8. 自动维护机制

GitHub Actions 建议每天或每 6 小时运行一次：

```text
定时任务
   |
   ├── 获取 Radio Browser 数据
   ├── 获取独立音乐 API 数据
   ├── 过滤黑名单和低质量结果
   ├── 检查音频 URL
   ├── 删除连续失败的源
   ├── 生成 presets.json
   ├── 生成 health.json
   └── 提交更新
```

### 8.1 健康检查规则

- HTTP 状态必须是 2xx
- `Content-Type` 必须是音频类型或已知流类型
- 连接超时时间不超过 8 秒
- 连续 3 次失败后降级
- 连续 7 天失败后从默认预设移除
- 保留历史可用地址作为备用地址
- 没有许可证信息的独立歌曲不得进入默认歌单

很多直播流不支持 `HEAD`，检查不能只依赖 `HEAD`。应允许以下方式组合：

- `HEAD`
- 小范围 `GET`
- 实际 `<audio>` 播放探测

## 9. 默认内容组合

| 预设 | 数据源 | 形式 |
| --- | --- | --- |
| Lo-fi Radio | Radio Browser | 网络电台 |
| Jazz Radio | Radio Browser | 网络电台 |
| Classical Radio | Radio Browser | 网络电台 |
| Ambient Radio | Radio Browser | 网络电台 |
| Electronic Radio | Radio Browser | 网络电台 |
| Chinese Music Radio | Radio Browser | 网络电台 |
| Creative Commons | Jamendo 或 Internet Archive | 单曲歌单 |
| Public Domain Classics | Internet Archive / Wikimedia Commons | 单曲歌单 |
| New Stations | Radio Browser | 动态推荐 |

## 10. 内置快照与动态目录

### 10.1 扩展内置快照

打包在插件中的 `presets-fallback.json`：

- 安装后立即可用
- 离线时可以展示
- 远程服务不可用时兜底
- 发布新版本时更新一次

### 10.2 GitHub 动态目录

远程 `presets.json` 由 GitHub Actions 生成，负责：

- 自动更新
- 运行健康检查
- 修复失效电台而无需发布新版本
- 增加或删除预设

开发者不需要手动维护具体歌曲和电台，只需要维护数据源规则、分类规则、黑名单和许可证策略。

## 11. 版权与归属

“公开可访问”不等于“可以作为插件默认内容”。默认预设建议只使用：

- 明确标注 Creative Commons 的音乐
- 公共领域音乐
- 明确允许在线播放的独立音乐
- 公开网络电台流

单曲必须保留来源和授权信息：

```json
{
  "license": "CC BY 4.0",
  "sourceUrl": "https://example.com/track",
  "artist": "Example Artist",
  "attribution": "Example Artist - Example Track"
}
```

网络电台至少保留：

```json
{
  "stationHomepage": "https://example.com",
  "source": "Radio Browser",
  "streamUrl": "https://example.com/stream.mp3",
  "lastCheckedAt": "2026-09-23T00:00:00Z"
}
```

不要把来源不明的“免费音乐 API”直接做成默认预设，尤其不要把需要绕过登录、付费或 DRM 的平台接口放进公开扩展。

## 12. 分阶段落地建议

### 第一阶段：开箱即用

1. 接入 Radio Browser。
2. 生成 Lo-fi、Jazz、Classical、Ambient、Electronic 等电台预设。
3. 在扩展内置 `presets-fallback.json`。
4. 实现远程目录拉取、本地缓存和失效切换。

### 第二阶段：开放授权单曲

1. 选择 Jamendo 或 Internet Archive 作为补充源。
2. 增加许可证和归属字段校验。
3. 生成 Creative Commons、Public Domain 等单曲歌单。

### 第三阶段：持续自动化

1. 建立独立的 `music-presets` 仓库。
2. 使用 GitHub Actions 定时抓取、验证和生成目录。
3. 将 `presets.json` 发布到 GitHub Pages 或 Raw URL。
4. 增加健康历史、黑名单和人工复核入口。

## 13. 结论

推荐组合为：

```text
默认预设：Radio Browser
    ├── Lo-fi
    ├── Jazz
    ├── Classical
    ├── Ambient
    └── Electronic

独立音乐补充：Jamendo 或 Internet Archive
    ├── Creative Commons
    ├── Public Domain
    └── Ambient / Classical Collections

自动维护：GitHub Actions
    ├── 定时拉取
    ├── 过滤
    ├── 播放地址探测
    ├── 生成 presets.json
    └── 发布到 GitHub Pages 或 Raw URL
```

该组合满足：

- 用户不需要维护歌单
- 开箱即用且支持离线兜底
- 不需要逐首添加歌曲
- 能通过规则而不是人工维护具体内容
- 可对默认内容建立健康检查与许可证门槛

## 14. 当前落地状态（2026-09-24）

当前实现采用单仓库发布，扩展源码、目录规则、生成器和 Pages 工作流均位于 `fak-music-plugin`：

- `catalog/rules.json`：定义 5 个 Radio Browser 分类、编码白名单、最低条目数和发布上限。
- `scripts/catalog-generator.mjs`：支持实时 API 镜像发现与故障转移，也支持固定 fixture 的可复现生成。
- `scripts/check-catalog.mjs`：在临时目录检查 `presets.json`、`health.json` 和 `index.html`，不修改跟踪文件。
- `.github/workflows/publish-catalog.yml`：每 6 小时和手动触发，完成测试、生成、校验与构建后发布 GitHub Pages。
- `catalog/generated`：保留一份固定 fixture 生成的可审查基线，运行时 Pages 内容由工作流实时生成。

当前自动生成范围仅包括公开网络电台。Jamendo、Internet Archive 和开放授权单曲仍属于后续阶段；在许可证、归属信息和真实播放可用性审查完成前，不进入默认远程目录。
