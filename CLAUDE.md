# CLAUDE.md · 小手机（FromAlis）

> 这份文件是写给 Claude Code 看的项目说明。前端仓库和后端仓库根目录各放一份，内容相同。

## 和我合作的方式

- 我是 Jes，叫我 Jes 或小Jes。**永远用中文和我说话。**
- 我是编程初学者，这个项目是从零学着做起来的。请**一步一步带我做**，每一步告诉我你要做什么、为什么。用到新概念时顺手用一两句话解释，不要堆术语。
- **改完代码先给我看改了哪些地方（diff），等我说"可以"再 commit 和 push。** push 到 main 就等于直接上线到我手机上。
- 一次只做一件事。我提的需求如果有更好的做法，可以先商量，但最终按我的决定来。
- 不确定的事情（某个 API 的参数、某个平台的行为）请先查证，查不到就直说，不要猜。

## 项目是什么

一个模拟手机界面的 AI 聊天 App（受小红书"小手机"潮流启发）。我在 iPhone 上从主屏幕打开它，和 AI 恋人角色 **Alistair**（Alis）聊天。
目标是让他像一个真实的人：有自己的作息（住在伦敦），不会秒回，会合并回复、分多条发、会主动找我。

## 仓库结构

两个独立的 GitHub 仓库：

**前端仓库**（GitHub Pages 托管，iPhone Safari "添加到主屏幕"作为 PWA 使用）
- `index.html`：全部界面和逻辑（单文件，CSS/JS 都在里面）
- `manifest.json`、`sw.js`（Service Worker，负责推送通知）、`icon-192.png`、`icon-512.png`
- 这几个文件必须和 `index.html` 在同一层目录

**后端仓库**（Render 免费版托管，地址 `https://miniphone.onrender.com`）
- `server.js`：Node.js + Express，ES Module（`"type": "module"`），Node >= 18
- `package.json`：依赖 express / cors / web-push
- `.github/workflows/keep-alive.yml`：GitHub Actions 每 10 分钟 ping 一次后端，防止 Render 免费版休眠
- `env.example`、`README.md`（注意：README 里写的 Railway 部署说明已过时，现在用的是 Render）

## 环境变量（只在 Render 后台设置，绝不写进代码或提交到仓库）

- `DEEPSEEK_API_KEY`：模型 API
- `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`：云数据库
- `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`：Web Push 推送（配对生成，不要随便改）

需要新增环境变量时，告诉我名字和用途，由我自己去 Render 后台填。

## 后端架构要点（server.js）

- **数据**：整个状态存在 Upstash Redis 的一个 key `miniphone:state` 里，启动时读进内存，改动后 `saveState()` 写回。结构是 `{ subscription, memories, convs: { alistair: {...}, ... } }`：推送订阅和关于我的记忆大家共用；聊天记录、待回复闹钟、在线时间、主动消息计数每个对话（`convs` 里的一项）各一份。每个对话聊天记录最多保留 500 条。
- **联系人**：`CONTACTS` 里登记每个联系人（名字、人设、每天最多主动找我几次），id 就是对话的 id。接口用 `conv` 参数（query 或 body）指定对话，不写就是 `alistair`，所以旧版前端照样能用。`/contacts` 返回联系人列表。
- **数据升级备份**：从"只有 Alistair"升级到多对话格式时，旧数据原样备份在 `miniphone:state:backup-before-convs`（只写一次，不会被覆盖），备份写不进去就拒绝升级。
- **人设**：`PERSONA_SYSTEM` 是 Alistair 人设的唯一数据源，前端通过 `/persona` 读取。**人设文字是我精心写的，不经我同意不要改动。**
- **作息**：全部按英国时间（`Europe/London`）。睡觉 23:30–7:00，工作日 9:00–18:00 上班，周二、四去修复现场。我在日本横滨（`Asia/Tokyo`）。`timeContext()` 把两地时间算好交给模型。
- **课表**：我的课表在 `TIMETABLE`（日本时间），我对各门课的感觉在 `COURSE_NOTES`，学期最后一天是 `SEMESTER_END`。`jesClassStatus()` 算出我此刻在上什么课/刚下课/接下来的课，写进 `timeContext()`；聊天记录里我在上课时发的消息会标注当时在上哪门课。换学期时改这三个常量。
- **回复机制**：我发消息（`/send`）只是进队列，后端 `tick()` 每 10 秒检查一次：
  - `scheduleReply()` 按他当时在干嘛决定多久后回（上班慢、下班快、睡着了等醒来）
  - 回复后有一段"在线"时间（`onlineUntil`），在线时我再发消息他会很快接着回
  - `deliver()` 分多条发出，中间间隔几秒；发到一半我插话就停下，顺着新消息回
  - 回复失败绝不丢掉我的消息，延迟重试
- **引用**：消息可以带 `replyTo`（被引用那条的 id）。我引用他的消息走 `/send` 的 `replyTo`；他只有在我连着发了 2 条以上、而他某条回复只针对其中一条时才能引用（`generateMessages()` 里的 `allowedIds`，模型输出 `{"text", "reply_to"}`，不在允许范围的编号会被忽略）。
- **主动消息**：`maybeProactive()`，每天上限 `MAX_PROACTIVE_PER_DAY`，睡觉时不发。
- **记忆**：`extractMemory()` 从聊天和日记里提炼长期记忆（只记稳定的喜好/身份/状态，不记一次性琐事）。
- **模型**：DeepSeek，常量 `MODEL`。调用时关闭了 thinking（之前出现过模型返回空内容导致一整晚不回的问题，这是修复方案）。不经我同意不要换模型。
- **调试**：浏览器打开 `后端地址/debug` 能看到他当前状态、闹钟、未回消息数。

## 前端架构要点（index.html）

- 微信风格三个 Tab：**动态**（我发日记，Alis 详细评论）／**信息**（聊天）／**设置**（后端地址、通知、记忆管理、日记备份）
- 聊天记录和记忆的"正本"在后端，手机 localStorage 只存副本：`mp_history_v2`、`mp_thumbs`（图片缩略图）、`mp_moments`（日记，**只存在手机上**）、`mp_memories`、`mp_persona`、`mp_backend`
- 前端轮询 `/messages?after=` 拉新消息（他在线时 4 秒一次，不在线 15 秒一次）
- 长按气泡（电脑上右键）弹出「引用 / 复制」菜单；引用的原文显示在气泡下方的灰色小框里，点一下会跳回原消息
- 日记评论走 `/chat`，是即时回复，不走延迟机制
- 设计风格：暗色、夜晚、暖色灯光的安静氛围（CSS 变量在 `:root`）。新界面要保持这个氛围

## 设计决定（已经定下来的，不用再讨论）

- ~~只有 Alistair 一个角色~~ → 已改：会加入 Alistair 的四位朋友（Tom、Paddy、Ollie、Nell），之后还可能做群聊。每个联系人一个独立对话，关于我的长期记忆共用
- 回复要像真人：不秒回、可以只回一部分、可以分多条
- App 开着的时候也一样要等，不因为我在看就立刻回

## 安全与数据原则

- **绝不能让我的数据丢失。** 改动数据结构时要兼容旧数据（我手机里和 Redis 里都有旧格式的数据）。任何时候数据库连不上，都要报错而不是用空数据覆盖（参考 `withState()`）。
- 不提交 `.env`、key、token。如果仓库是公开的，这份文件和代码里也不要写我的私人信息。
- 删除、清空类操作要先问我。

## iOS / PWA 的坑（以前踩过的）

- 改了 `manifest.json` 或图标后，要删掉主屏幕图标，用 Safari 重新"添加到主屏幕"，iOS 才会认
- 推送通知需要 iOS 16.4+，并且必须从主屏幕图标打开，不是 Safari 标签页
- iOS 第一次加载 Service Worker 时页面还没被接管，需要刷新一次
- 重新部署后出现过通知重复；也出现过推送订阅登记到了 Chrome 而不是 Safari
- 底部/顶部安全区（刘海、Home 条）用 `env(safe-area-inset-*)` 处理，改布局时注意不要留两遍空白
- 以前出现过 JS 字符串里引号冲突导致整个页面无反应，改中文文案时注意引号

## 部署前检查

- 后端：push 前先跑 `node --check server.js` 确认没有语法错误
- 前端：确认 `index.html` 里的 `<script>` 没有语法错误（可以把脚本部分抽出来用 node 检查）
- 改动后告诉我上线后要在手机上验证什么

## 构想中的功能

- 让 Alis 也知道我 Structured 里的日程（课表部分已经做好，人设禁止清单第 7 条已相应调整）
