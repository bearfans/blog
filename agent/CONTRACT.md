# 模板契约 · slow-writer blog

本文件是 `article-writer` Agent 与当前站点模板之间的唯一接口。

Agent 每次开始任务前读取本文件。修改页面模板、页面构建脚本、Agent 脚本、目录结构或页面结构后，必须同步更新这里；不要把模板细节写回 Agent 提示词。

## 1. 模板标识

- 模板名：slow-writer blog
- 页面生成标记：`<meta name="generator" content="slow-writer">`
- 输出：纯静态 HTML，可直接在本地浏览器打开
- 依赖：不依赖外部 CSS / JS / CDN
- 部署：GitHub Pages，配置文件见 `.github/workflows/pages.yml`

## 2. 目录

| 用途 | 路径 |
| --- | --- |
| Agent 完整提示词 | `agent/AGENT.md` |
| Agent 契约 | `agent/CONTRACT.md` |
| Agent 复用说明 | `agent/README.md` |
| 站点配置 | `site.json` |
| 文章清单 | `articles.json` |
| 首页 | `index.html` |
| 文章源目录 | `content/<slug>/` |
| 正文 | `content/<slug>/article.md` |
| 元数据 | `content/<slug>/meta.json` |
| 图片生成结果 | `content/<slug>/images.json` |
| 文章页 | `articles/<slug>.html` |
| 图片资源 | `assets/images/<slug>/` |
| 文章模板 | `templates/article.html` |
| 首页模板 | `templates/index.html` |
| 页面构建脚本 | `scripts/build-article.mjs` |
| 图片生成脚本 | `agent/scripts/generate-images.mjs` |
| 图片处理脚本 | `agent/scripts/process-image.py` |
| 验收脚本 | `agent/scripts/verify-article.mjs` |

## 3. 占位符与命令

占位符：

- `{slug}`：文章 slug
- `{contentDir}`：`content/{slug}`
- `{meta}`：`content/{slug}/meta.json`
- `{article}`：`articles/{slug}.html`
- `{index}`：`index.html`
- `{cover}`：`assets/images/{slug}/cover.jpg`

| 用途 | 命令 | 说明 |
| --- | --- | --- |
| 生成图片 | `node agent/scripts/generate-images.mjs {meta}` | 加 `--force` 强制重画；已有图片默认复用 |
| 构建页面 | `node scripts/build-article.mjs {contentDir}` | 生成文章页、更新 `articles.json` 和 `index.html` |
| 验收 | `node agent/scripts/verify-article.mjs {contentDir}` | 必须显示「验收通过」 |
| 重建全部文章 | `node scripts/build-article.mjs --all` | 可选 |
| 只重建首页 | `node scripts/build-article.mjs --index` | 可选；自定义首页会先备份 |
| 不动首页 | `node scripts/build-article.mjs {contentDir} --no-index` | 可选 |
| 强制重建首页 | `node scripts/build-article.mjs {contentDir} --force-index` | 仅在用户同意后使用 |

图片生成命令建议 timeout 设为 `600000`。免费额度下 5 张图可能需要 3–5 分钟。

## 4. `meta.json`

严格使用 JSON，不要加注释。示例：

```json
{
  "title": "把早晨还给自己",
  "slug": "take-back-the-morning",
  "date": "2026-10-27T15:30:00+08:00",
  "summary": "一段 40–90 字的摘要，具体、有画面，不要写成内容简介模板。",
  "author": "慢慢写",
  "tags": ["生活", "节奏", "观察"],
  "kicker": "生活观察",
  "imageStyle": "bright editorial photography, warm morning light, soft cream and sage palette, quiet Chinese everyday life, shallow depth of field, subtle film grain, no text, no letters, no watermark, no logo",
  "cover": {
    "prompt": "close-up of a ceramic cup of tea on a wooden desk, steam rising, morning sunlight through a window, bright airy apartment, lived-in details, editorial photography",
    "alt": "清晨窗边的书桌和一杯热茶"
  },
  "images": [
    {
      "prompt": "a person tying running shoes by the door in early morning light, cropped composition, bright quiet apartment",
      "alt": "清晨出门前系鞋带",
      "caption": "出门前的那几分钟，往往决定了一天的节奏。"
    }
  ]
}
```

约束：

- `slug` 只能使用小写字母、数字和连字符。
- `date` 使用带时区的 ISO 8601。
- `title` 8–26 个汉字；`summary` 40–90 字。
- `tags` 3–5 个；`kicker` 可选，2–6 个字。
- `imageStyle` 为英文，必须包含 `no text, no letters, no watermark, no logo`。
- `cover.prompt` 使用 16:9 构图；`images` 为 1–4 张正文图，使用 4:3 构图。
- 所有图片 prompt 都要避免文字、logo、水印、二维码、UI 界面；避免真实名人、品牌、政治符号。
- 如果文章使用已有的仓库图片，可以只保留 `meta.json` 的标题、摘要、日期、标签等字段；图片信息仍以 `images.json` 为准。

## 5. `images.json`

由 `agent/scripts/generate-images.mjs` 生成，不要手写。结构：

```json
{
  "slug": "<slug>",
  "cover": {
    "file": "assets/images/<slug>/cover.jpg",
    "width": 1536,
    "height": 864,
    "alt": "封面替代文本",
    "prompt": "封面提示词或来源说明"
  },
  "inline": [
    {
      "file": "assets/images/<slug>/inline-1.jpg",
      "width": 1230,
      "height": 573,
      "alt": "正文图片替代文本",
      "caption": "可选的图片说明"
    }
  ]
}
```

## 6. 图片契约

- 1 张封面 + 1–4 张正文图，总计最多 5 张。
- 默认 1 张封面 + 2–3 张正文图；最少 1 张封面。
- 封面比例 16:9；正文图比例 4:3。
- 文件命名：`cover.jpg`、`inline-1.jpg`、`inline-2.jpg`……
- 正文图片位置使用单独一行的标记：

```markdown
{{image:1}}
```

- `images.inline` 的第 1 张对应 `{{image:1}}`，依此类推。
- 图片跟着内容走，放在它说明的段落附近；不要在开头第一段之前放图。
- 图片要有统一色调、光线和媒介；不要生成文字、字母、logo、水印、二维码、手机 UI、聊天记录。
- 图片生成失败时不要发布破图页面，先告诉用户。

## 7. 页面契约

### 文章页

`articles/<slug>.html` 由 `templates/article.html` 生成，必须包含：

- 封面、标题、摘要、正文、标签、页脚；
- 正文容器 `id="article-content"`；
- 文末复制图标按钮 `id="copy-btn"`，使用 `aria-label="复制文章内容"`；
- 点击复制按钮复制正文的富文本和纯文本，不复制整个页面；
- 页面不出现任何平台专属文案、按钮或引流信息；
- 所有资源使用相对路径，图片以 base64 内嵌到正文；
- 页面包含 `<meta name="generator" content="slow-writer">`。

### 首页

`index.html` 是瀑布流文章列表，必须包含：

- 最新文章在最上面，按 `articles.json` 的日期倒序；
- 卡片属性 `data-article="<slug>"`；
- 卡片链接指向 `articles/<slug>.html`；
- 卡片至少包含封面、日期、标题、摘要、标签、阅读全文链接。

首页是自动生成的（含 generator 标记）时，构建脚本会整体重建。首页是自定义结构时：

- 构建脚本会尝试在 `#article-grid`、`.masonry`、`.article-list` 等容器顶部插入卡片；
- 插入成功时要检查位置和链接；
- 插入失败时，按自定义首页的卡片结构手动补一张卡片，并保留 `data-article="<slug>"`；
- 未经用户同意不要使用 `--force-index` 覆盖自定义首页。

### 清单与发布文件

- `articles.json` 由构建脚本维护，按日期倒序。
- `CNAME`、`sitemap.xml`、`robots.txt` 由构建脚本根据 `site.json` 的 `url` 生成。
- 不要手动编辑生成后的文章页或首页；要改结构就改模板后重新构建。

## 8. 验收

先运行：

```bash
node agent/scripts/verify-article.mjs {contentDir}
```

通过后人工确认：

- `{article}` 存在，封面、标题、正文、配图都正常；
- 正文里没有残留的 `{{image:n}}` 或模板变量；
- 页面里有 `id="article-content"` 和 `id="copy-btn"`；
- 复制按钮复制的是正文，图片已 base64 内嵌；
- 首页有 `data-article="{slug}"` 的卡片，链接正确；
- 最新文章在首页最上面；
- 图片数量在 1–5 张之间，文件命名和比例符合契约；
- 页面没有外部 CSS/JS/CDN 依赖；
- 浏览器控制台没有明显 JS 报错。

汇报格式：

```text
已生成《标题》
- 文章：{article}
- 首页：{index}（已更新，最新一篇在最上面）
- 配图：1 张封面 + N 张正文图
- 使用：打开文章页，点文末复制图标即可复制正文；封面在 {cover}
```

## 9. 复用 Agent

- Agent 完整提示词在 `agent/AGENT.md`，OpenCode 入口是 `.opencode/agents/article-writer.md`，入口只负责加载提示词和本契约。
- 在另一个项目复用 Agent 时，复制 `agent/` 目录和 `.opencode/agents/article-writer.md`，再按目标项目修改 `agent/CONTRACT.md`；具体步骤见 `agent/README.md`。
- 换模板、换目录、换命令时只改本契约和根目录的页面构建实现，不改 Agent 提示词。
- 本文件是项目模板层的一部分，不属于 Agent。
