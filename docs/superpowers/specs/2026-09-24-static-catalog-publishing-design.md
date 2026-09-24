# Fak Music 静态目录发布设计

## 目标

将 `fak-music-plugin` 作为单一 Public GitHub 仓库发布，并使用 GitHub Actions 定时生成音乐预设目录，再通过 GitHub Pages 提供稳定的静态 JSON 地址。扩展不依赖传统服务端，安装后仍以本地 fallback 保证开箱即用。

## 范围

本阶段包含：

- 将当前 Git 仓库上传为 Public GitHub 仓库。
- 在仓库内维护预设分类规则和目录生成脚本。
- 从 Radio Browser 获取公开电台元数据，过滤无效、重复或缺少可播放地址的记录。
- 生成 `presets.json`、`health.json` 和便于人工检查的静态首页。
- 使用 GitHub Actions 每 6 小时刷新并部署 GitHub Pages。
- 将扩展的默认远程目录指向发布后的 Pages 地址，同时保留本地 fallback 和最后一次可用缓存。
- 使用自动化测试、构建、工作流运行结果和远程 HTTP 读取完成验收。

本阶段不包含用户账户、跨设备同步、个性化推荐、音频代理、商业音乐平台适配器或密钥托管服务。

## 方案选择

采用单仓库方案：扩展源码、目录规则、生成脚本和 Pages 产物由同一仓库管理。

与双仓库方案相比，单仓库减少权限、发布和版本协调成本。目录生成与扩展契约在同一提交中演进，适合当前规模。未来若目录运营和扩展开发需要独立发布节奏，再迁移为独立目录仓库；JSON URL 通过构建配置隔离，不影响扩展的数据模型。

## 目录结构

```text
catalog/
├── rules.json                 # 分类、标签、数量和最低质量规则
└── generated/                # 本地生成结果，供测试与审查
    ├── index.html
    ├── presets.json
    └── health.json
scripts/
└── generate-catalog.mjs      # 无密钥、可复现的目录生成器
.github/workflows/
└── publish-catalog.yml       # 定时生成、验证并部署 Pages
```

`catalog/generated` 纳入版本控制，作为最新已审查快照和 Actions 故障时的可见基线。GitHub Pages 每次只发布通过校验的新产物。

## 数据源与筛选

第一版只接入 Radio Browser，不接入需要密钥的 Jamendo。生成器先发现可用的 Radio Browser API 镜像，再按规则查询 Lo-fi、Jazz、Classical、Ambient 和 Electronic 分类。

每条电台必须满足：

- `lastcheckok` 为可用状态。
- 存在 HTTP 或 HTTPS 播放地址。
- 名称和稳定 UUID 完整。
- 同一 UUID 和规范化播放地址不重复。
- 优先选择 HTTPS、MP3/AAC、较高点击量和明确主页的条目。

生成结果严格使用扩展现有 `schemaVersion: 1` 协议。每个音频条目保留来源、主页、编码、码率和最近检查时间，便于归属展示与故障审计。

## 数据流

```text
GitHub Actions schedule / manual dispatch
    -> Radio Browser API discovery
    -> category queries and filtering
    -> schema validation and deterministic sort
    -> catalog/generated/*
    -> unit tests and extension build
    -> GitHub Pages deployment
    -> extension background refresh every 6 hours
    -> chrome.storage.local last-known-good cache
```

扩展启动时继续先读本地 fallback。远程目录只有在请求成功且通过 schema 校验后才原子替换缓存；超时、HTTP 错误或无效 JSON 不改变当前目录。

## 失败处理

- Radio Browser 镜像不可用：生成任务失败，不部署空目录。
- 某一分类无合格电台：任务失败，保留上一版 Pages 部署。
- 个别电台失效：过滤该条目，不阻断其他分类。
- 生成结果不符合扩展协议：验证失败，禁止部署。
- Pages 暂时不可达：扩展继续使用 last-known-good 缓存或内置 fallback。
- 远程播放失败：扩展继续使用现有备用地址和自动跳过机制。

## 安全与权限

- 生成流程不保存任何 API 密钥或用户数据。
- GitHub Actions 使用最小权限：读取仓库内容、写 Pages、签发部署令牌。
- 扩展只需要访问目录 Pages 域名和目录中允许的 HTTP(S) 音频地址。
- 不代理、复制或重新托管音频文件；目录只保存公开电台元数据和原始播放地址。

## 测试与验收

本地门槛：

1. 生成器的纯函数测试覆盖字段映射、去重、排序、分类不足和非法 URL。
2. 使用固定 fixture 生成目录，结果通过扩展现有 schema parser。
3. `npm run test:run` 全量通过。
4. `npm run build` 通过。
5. 工作流 YAML 和生成文件通过格式检查。

远程门槛：

1. GitHub 仓库为 Public，默认分支为 `main`。
2. `publish-catalog` Actions 工作流成功。
3. GitHub Pages 部署成功。
4. 匿名 HTTP 请求可以读取 `presets.json`，状态为 200，内容通过本地 schema parser。
5. 仓库远端分支与本地提交一致。

## 完成定义

只有本地测试和构建、GitHub Actions、Pages 部署、远程目录读取及 Git 同步状态全部有成功证据时，本阶段才算完成。UI 未发生变更，因此本阶段不要求新的 UI 截图或飞书发送。
