# 慢慢写 · 微信公众号文章 Agent

给一个主题或概要，自动完成：

1. 扩写成一篇有人味的中文文章；
2. 去掉常见的 AI 腔、模板句；
3. 生成 1 张封面 + 最多 4 张正文配图；
4. 生成微信公众号 HTML 预览页，底部带「复制到公众号」按钮；
5. 自动维护瀑布流首页 `index.html`，最新文章在最上面。

## 快速开始

在 OpenCode 中运行：

```bash
# 一次性生成
opencode run --agent wechat-writer "写一篇关于『为什么我们越来越难读完一篇文章』的文章"

# 或者进入 TUI，把 agent 切换到 wechat-writer，再直接输入主题
opencode
```

也可以给提纲：

```bash
opencode run --agent wechat-writer "
主题：把早晨还给自己
提纲：
1. 被手机切碎的早晨
2. 早起不是目的，拿回节奏才是
3. 一个不完美的早晨方案
"
```

环境要求：Node.js 22+；建议装 Python 3 + Pillow（用于裁掉图片角标、统一比例和压缩；没有时会保留原图）。

## 生成的文件

```text
articles/<slug>.html      文章预览页
assets/images/<slug>/     封面与正文图
content/<slug>/           文章源文件（article.md / meta.json / images.json）
articles.json             文章清单
index.html                首页
```

首次运行会自动创建 `index.html`。之后再发文，构建脚本会把新卡片按日期排到最上面。

## 复制到公众号

1. 浏览器打开 `articles/<slug>.html`；
2. 点底部「复制到公众号」；
3. 打开微信公众号后台的图文编辑器，直接粘贴。

正文样式全部是内联样式，正文图片以 base64 内嵌，粘贴后微信会自动转存。封面不进正文，发布时在公众号后台单独上传：

```text
assets/images/<slug>/cover.jpg
```

如果浏览器不支持 Clipboard API（例如某些本地 `file://` 场景），按钮会自动回退到选中正文并复制；仍然失败时，手动全选正文复制即可。

## 图片生成说明

默认使用 [Pollinations](https://pollinations.ai) 的免费图像接口，不需要 API key，但免费额度大约 **每 45 秒 1 张图**：

- 1 张封面 + 2 张配图，大约 1–2 分钟；
- 1 张封面 + 4 张配图，大约 3–5 分钟；
- 脚本会自动等待、重试，并裁掉免费接口右下角的小角标。若你想保留角标/署名，可以设置 `IMAGE_CROP_BOTTOM=0`。

如果你有 Pollinations 的 key，可以加速并提高稳定性：

```bash
export POLLINATIONS_API_KEY="sk_..."
```

然后正常让 agent 生成即可。脚本会自动改用认证接口。

> 图片生成失败时，agent 不会发布带破图的页面；它会告诉你失败原因，等你决定是否重试。

## 常用命令

```bash
# 只生成图片（已有图片会复用；加 --force 重画）
node scripts/generate-images.mjs content/<slug>/meta.json
node scripts/generate-images.mjs content/<slug>/meta.json --force

# 只构建一篇文章
node scripts/build-article.mjs content/<slug>

# 验收：页面结构、图片、清单排序、首页卡片
node scripts/verify-article.mjs content/<slug>

# 重建所有文章和首页
node scripts/build-article.mjs --all

# 只按 articles.json 重建首页
node scripts/build-article.mjs --index
```

`--index` 会按清单重排全部卡片；如果首页是自定义的，会先备份为 `index.html.bak-*`。

自定义首页时：

```bash
# 不修改 index.html，只生成文章页和清单
node scripts/build-article.mjs content/<slug> --no-index

# 备份并强制用本工具的瀑布流模板替换首页
node scripts/build-article.mjs content/<slug> --force-index
```

## 自定义

- **站点名、副标题、作者、页脚**：改 `site.json`。
- **页面样式**：改 `templates/article.html`、`templates/index.html`。
- **默认模型**：改 `.opencode/agents/wechat-writer.md` 里的 `model`。
- **图片风格**：在每篇文章的 `meta.json` 里改 `imageStyle`，或在 agent 提示词里改默认风格。
- **文章源文件**：`content/<slug>/article.md`、`meta.json` 和 `images.json`。

## 目录结构

```text
.opencode/agents/wechat-writer.md   Agent 定义（写作规则、流程、验收）
scripts/generate-images.mjs         图片生成与重试
scripts/process-image.py            裁角标、统一比例、压缩
scripts/build-article.mjs           页面生成、清单维护、首页更新
scripts/verify-article.mjs          发布前验收
scripts/lib/markdown.mjs            轻量 Markdown → 公众号内联 HTML
scripts/lib/utils.mjs               日期、字数、转义等工具
templates/                          文章页与首页模板
```

## 常见问题

**为什么正文图片要 base64 内嵌？**

微信公众号编辑器会过滤外部图片链接。把本地图片转成 base64 再复制，粘贴时微信会自动上传到自己的图床，正文图片不容易丢。

**为什么封面不在正文里？**

公众号的封面是单独设置的字段，放在正文里会重复。文章页顶部仍然会显示封面，首页卡片也用它。

**首页卡片没有更新？**

如果是自定义首页，构建脚本只在找到 `article-grid`、`masonry`、`article-list` 等列表容器时自动插入卡片。没有容器时，让 agent 按你的首页结构手动加一张卡片，或者用 `--force-index` 重建（会先备份原文件）。

**没有 API key 能跑吗？**

可以。图片走 Pollinations 免费额度，只是每张之间要等一会儿。文字生成使用 agent 里配置的模型（默认 `deepseek/deepseek-v4-pro#high`，可在 `.opencode/agents/wechat-writer.md` 里改）。
