# article-writer Agent

通用文章写作 Agent 的完整资源目录。

```text
agent/
├── AGENT.md                完整提示词：写作、视觉、流程、验收
├── CONTRACT.md             与当前项目页面构建之间的契约
├── README.md               本文件
└── scripts/
    ├── generate-images.mjs 图片生成
    ├── process-image.py    图片裁切与压缩
    ├── verify-article.mjs  发布前验收
    └── lib/utils.mjs       Agent 脚本专用工具
```

OpenCode 入口是 `.opencode/agents/article-writer.md`，它只负责加载 `agent/AGENT.md` 和 `agent/CONTRACT.md`。真正的 Agent 资源全部在本目录。

调用命令：

```bash
opencode run --agent article-writer "..."
```

## 为什么能复用

Agent 提示词只负责：

- 写作判断和去 AI 味；
- 视觉方向；
- 工作流程和质量验收。

Agent 不包含当前项目的目录、页面模板或页面构建命令。这些全部由目标项目的 `agent/CONTRACT.md` 提供。

## 在另一个项目复用

1. 把整个 `agent/` 目录复制到目标项目根目录。
2. 把 `.opencode/agents/article-writer.md` 复制到目标项目的同名位置。
3. 修改 `agent/CONTRACT.md`，改成目标项目的目录、命令、字段和页面结构。
4. 按需修改 `.opencode/agents/article-writer.md` 里的 `model`、`color`、`steps` 和权限。
5. 运行：

   ```bash
   opencode run --agent article-writer "写一篇关于……的文章"
   ```

## 修改边界

- Agent 的写作规则、视觉判断和工作流：改 `agent/AGENT.md`。
- Agent 使用的图片、验收等脚本：改 `agent/scripts/`。
- 当前项目的页面构建：改根目录的 `scripts/`、`templates/`、`site.json`。
- 页面构建和 Agent 之间的接口：改 `agent/CONTRACT.md`。
- 不要把页面模板、选择器或页面构建命令写进 `agent/AGENT.md`。
