# article-writer

通用文章写作 Agent。

- Agent 文件：`.opencode/agents/article-writer.md`
- 调用命令：`opencode run --agent article-writer "..."`
- 模板契约：`templates/CONTRACT.md`

## 为什么能复用

Agent 提示词只负责：

- 写作判断和去 AI 味；
- 视觉方向；
- 工作流程和质量验收。

Agent 不包含当前项目的目录、脚本命令、模板结构或页面选择器。这些全部由目标项目的 `templates/CONTRACT.md` 提供。

## 在另一个项目复用

1. 把 `.opencode/agents/article-writer.md` 复制到目标项目的同名位置。
2. 在目标项目创建 `templates/CONTRACT.md`，可以参考本仓库的契约，改成目标项目的路径、命令、字段和页面结构。
3. 按需修改 Agent 的 `model`、`color`、`steps` 和权限。
4. 运行：

   ```bash
   opencode run --agent article-writer "写一篇关于……的文章"
   ```

## 修改边界

- 换模板、换目录、换构建脚本：只改 `templates/`、`scripts/` 和 `templates/CONTRACT.md`。
- 换写作风格、视觉判断、工作流：改 `.opencode/agents/article-writer.md`。
- 不要把模板路径、选择器、构建命令写回 Agent，否则 Agent 又会和当前站点绑死。
