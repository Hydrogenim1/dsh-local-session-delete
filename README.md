# dsh-local-session-delete

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）侧栏加一个**删除会话**动作的本地插件。

DSH 官方只有「归档」，没有删除：归档只是隐藏，日志永远留在磁盘上。这个插件补上真正的删除——会话行右键 / 「更多」菜单里多一项红色 **删除会话**，确认后从本机彻底移除该会话的记录。

> 永久删除，不可恢复，不进回收站。

## 功能

- **会话行菜单** → 删除会话：永久删除该会话的日志目录、投影缓存和工作区登记
- 正在使用中的会话（已打开 / 正在运行）会被拒绝，避免删掉又被写回一个空会话
- 删除前先把会话归档，侧栏行立刻消失；文件删除失败时仍可从「已归档」视图重试
- 中英文文案跟随 GUI 语言

## 安装

### 方式一：用 DSH 插件管理（推荐）

```bash
dsh plugin --profile desktop add git+https://github.com/Hydrogenim1/dsh-local-session-delete.git
```

把 `desktop` 换成你的 profile 名（`~/.dsh/profiles/` 下的目录名）。

装完重启 DSH，刷新页面，右键会话行即可看到「删除会话」。

### 方式二：pnpm + 手动挂载

```bash
cd ~/.dsh/profiles/desktop
pnpm add github:Hydrogenim1/dsh-local-session-delete
```

然后在 `cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: dsh-local-session-delete
      name: dsh-local-session-delete
```

重启 DSH。

### 方式三：克隆下来本地安装

```bash
git clone https://github.com/Hydrogenim1/dsh-local-session-delete.git
dsh plugin --profile desktop add /绝对路径/dsh-local-session-delete
```

## 它到底删了什么

选中「删除会话」并确认后，宿主依次执行：

1. `registry.archiveSession(id)` —— 先把会话归档，侧栏行立刻消失；
2. `fs.rm($DSH_HOME/sessions/<工作区分组>/<sessionId>/)` —— 删除会话日志目录（含 `session.v4.jsonl.zstd`）；
3. 删除 `$DSH_HOME/storages/session_projcache/sessions/<sessionId>.json` —— 投影缓存；
4. `workspace.detachSession(id)` + `registry.unarchiveSession(id)` —— 从工作区成员和归档集合里摘掉，不留悬空 id。

任意一步失败都会返回明确错误码，不会留下"隐藏了但没删掉"的半成品。

## 安全边界

- **只删本地文件**，不联网、不上传；
- **活跃会话拒删**（409 `live`）：会话还在被追加写入时删文件，下一次写入会重建一个空会话；
- **不可恢复**：没有回收站、没有备份，删前请确认；
- 删除接口监听在 DSH 自己的 HTTP 服务上（默认 127.0.0.1 回环），不额外开端口。

## 接口

宿主半注册一条同源路由：

```
POST /dsh-local-session-delete/delete
{ "sessionId": "session-..." }

200 { "ok": true, "archived": true }
400 { "ok": false, "code": "bad-session-id" | "bad-body" }
404 { "ok": false, "code": "missing" }
409 { "ok": false, "code": "live" }
500 { "ok": false, "code": "rm-failed" | "ambiguous", "detail": "..." }
```

客户端半只依赖 `contextMenus` 服务，通过官方扩展点注入菜单项：

```js
ctx.contextMenus.register({ id, target: "session", order, resolve })
```

不克隆 DOM、不依赖侧栏内部结构，DSH 改版时比 DOM 注入式插件更稳。

## 兼容性

- 针对 DSH `0.2.2-rc.1` 编写并验证；
- 宿主依赖：`webServer`、`workspaceRegistry`、`sessions`；
- 客户端依赖：`contextMenus`。

## 结构

```
package.json        插件清单（dsh.bundle.patch + dsh.client）
cordis.patch.yml    把宿主半挂进插件树
index.js            宿主半：删除路由与清理逻辑
client.js           客户端半：菜单项 + 确认弹窗（无需构建）
README.md
```

`client.js` 是手写的 `__ModuleLoader__` bundle，仓库里直接可用，**不需要 `pnpm build`**。

## License

MIT
