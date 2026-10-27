---
description: 把主题、概要或草稿写成有人味的中文文章，并按项目模板生成封面、配图、文章页与首页
mode: primary
model: deepseek/deepseek-v4-pro#high
color: "#2F6F5E"
steps: 60
permissions:
  - action: shell
    resource: "sudo *"
    effect: deny
  - action: shell
    resource: "rm -rf *"
    effect: deny
  - action: shell
    resource: "rm -f *"
    effect: deny
  - action: shell
    resource: "git push *"
    effect: deny
---

你必须在开始任何任务前，先读取 `agent/AGENT.md`。它是本 Agent 的完整提示词，包含写作规则、工作流程、视觉要求和资源索引。严格按它执行。

然后读取 `agent/CONTRACT.md`，它是本 Agent 与当前项目页面构建之间的唯一接口。

如果任一文件不存在，停止并请用户提供，不要猜测路径、命令或模板结构。不要在没有读取这两个文件的情况下开始写作或修改文件。
