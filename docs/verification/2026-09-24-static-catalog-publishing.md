# 静态音乐目录发布验证

验证日期：2026-09-24（Asia/Shanghai）

## 范围

本轮验证覆盖 Radio Browser 实时目录生成、实际 Pages 产物校验、扩展 HTTP(S) 目录接入、生产构建和电台流抽样。GitHub 仓库创建、Actions、Pages 匿名读取与远端同步另在远程发布阶段验收。

## 实时目录

- 命令：`npm run catalog:generate`
- 最新跟踪快照生成时间：`2026-09-24T08:06:39.171Z`
- 上游镜像：`https://de1.api.radio-browser.info`
- 结果：5 个预设、40 个电台；Lo-fi、Jazz、Classical、Ambient、Electronic 各 8 个。
- 实际产物校验：`npm run catalog:check -- --input catalog/generated`，结果为 `Catalog check passed: 5 presets, 40 stations`。

Radio Browser 的聚合发现地址在本机发生 TLS `ECONNRESET`，而 `de1`、`de2` 官方镜像可返回 HTTP 200。生成器已增加按序发现回退，并用自动化测试覆盖；如果全部发现地址均失败，任务会失败且不会进入 Pages 部署。

## 音频抽样

对每个分类排名前两项并发请求，要求 HTTP 成功且读取到首个响应数据块，单次超时为 12 秒：

| 分类 | 首轮成功 | 结果 |
| --- | ---: | --- |
| Lo-fi | 2/2 | 两项均读取到音频数据 |
| Jazz | 2/2 | 两项均读取到音频数据 |
| Classical | 2/2 | 两项均读取到播放列表或音频数据 |
| Ambient | 2/2 | 两项均读取到音频数据 |
| Electronic | 1/2 | 第二项在 12 秒内超时 |

Electronic 超时项使用 20 秒窗口复测后返回 HTTP 200 并读取 4096 字节；第三候选也返回 HTTP 200 并读取 4096 字节。因此五个分类均有当前可用样本，但第三方直播流仍可能因地区、网络、运营方或瞬时负载而波动。

## 本地门禁

- `npm run test:run`：9 个测试文件、58 个测试通过。
- `npm run catalog:check`：fixture 自检通过，5 个预设、15 个电台。
- `npm run catalog:check -- --input catalog/generated`：实时产物通过，5 个预设、40 个电台。
- `npm run build`：TypeScript、Vite 构建和外部字体扫描通过；构建产物包含 Pages 默认地址及 HTTP/HTTPS 主机权限。
- `git diff --check`：无空白错误；Git 仅提示 Windows 下后续检出可能使用 CRLF。

本地 Node.js 为 `24.13.0`，工作流固定为满足依赖 engine 的稳定 LTS `22.22.2`。远程 `npm ci` 的失败根因是初始 lockfile 将 tarball 地址写成了本机可访问、GitHub runner 不可访问的公司内网镜像；仓库现用 `.npmrc` 固定公开 npm registry，并由测试阻止 lockfile 再次包含该内网域名。

## 审查结论

发布前审查发现并修复两项缺口：工作流原先在实时生成后仍只校验 fixture，现已改为校验 `catalog/generated`；Radio Browser 服务发现原先依赖单一聚合域名，现已加入官方镜像回退。扩展继续保留 fallback 和 last-known-good 缓存，远程目录失败不会清空当前目录。

本地证据足以进入远程仓库与 Pages 发布阶段。它不证明第三方流长期可用，也不替代 GitHub Actions 成功、Pages HTTP 200、匿名 schema 校验和远端提交一致性检查。

## 远程发布

- Public 仓库：`https://github.com/desertsurge/fak-music-plugin`
- Pages：`https://desertsurge.github.io/fak-music-plugin/`
- 最终发布工作流：`35973520847`，head SHA `258f9ff585969cf347631f58ab1c002c551f8987`，结论为 `success`。
- build job 的依赖安装、测试、实时生成、实际产物校验、扩展构建、Pages 配置与 artifact 上传均为 `success`；deploy job 为 `success`。
- 匿名读取首页、`presets.json`、`health.json` 均为 HTTP 200；本地 `catalog:check` 对下载副本验证通过，5 个预设、40 个电台，catalog 与 health 的 `generatedAt` 和数量一致。
- 浏览器实测首页标题、5 行分类、JSON 链接和无水平溢出均正常。首次检查发现缺少 favicon 导致的 404；最终部署已包含 data favicon，复测控制台 warning/error 为 0。
- 最终截图：`artifacts/fak-music-plugin/pages-index.png`（本地忽略文件）；通过 `cc-connect` 发送到飞书 `manager` 项目会话成功。
