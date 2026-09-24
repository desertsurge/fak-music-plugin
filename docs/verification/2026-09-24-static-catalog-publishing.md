# 静态音乐目录发布验证

验证日期：2026-09-24（Asia/Shanghai）

## 范围

本轮验证覆盖 Radio Browser 实时目录生成、实际 Pages 产物校验、扩展 HTTP(S) 目录接入、生产构建和电台流抽样。GitHub 仓库创建、Actions、Pages 匿名读取与远端同步另在远程发布阶段验收。

## 实时目录

- 命令：`npm run catalog:generate`
- 生成时间：`2026-09-24T07:34:07.137Z`
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

- `npm run test:run`：9 个测试文件、57 个测试通过。
- `npm run catalog:check`：fixture 自检通过，5 个预设、15 个电台。
- `npm run catalog:check -- --input catalog/generated`：实时产物通过，5 个预设、40 个电台。
- `npm run build`：TypeScript、Vite 构建和外部字体扫描通过；构建产物包含 Pages 默认地址及 HTTP/HTTPS 主机权限。
- `git diff --check`：无空白错误；Git 仅提示 Windows 下后续检出可能使用 CRLF。

本地 Node.js 为 `24.13.0`，工作流固定为稳定 LTS `22.22.0`，两者都满足依赖要求的 Node `22.12+` 范围。首次远程运行使用 Node `24.15.0` 时，`npm ci` 两次复现 npm 自身的 `Exit handler never called!`；因此 CI 改用稳定 LTS，不涉及依赖或业务代码变更。

## 审查结论

发布前审查发现并修复两项缺口：工作流原先在实时生成后仍只校验 fixture，现已改为校验 `catalog/generated`；Radio Browser 服务发现原先依赖单一聚合域名，现已加入官方镜像回退。扩展继续保留 fallback 和 last-known-good 缓存，远程目录失败不会清空当前目录。

本地证据足以进入远程仓库与 Pages 发布阶段。它不证明第三方流长期可用，也不替代 GitHub Actions 成功、Pages HTTP 200、匿名 schema 校验和远端提交一致性检查。
