# AGENTS.md

このリポジトリは、Xの時事ネタから「裏の物語」パロディ台本を書くためのスキル置き場です。Claude Code と Codex の両方で使えます。

- スキル本体: `.claude/skills/x-parody-script/SKILL.md`（Codex ではプラグイン `x-parody` として読み込まれる）
- サブエージェント: `.claude/agents/*.md`（Codex 用の定義は `.codex/agents/*.toml`。中身は .md を参照する）
- 台本の保存先: `parody-scripts/`
- `.claude/workflows/x-parody-writers-room.js` は Claude Code 専用のワークフローで、Codex では使えない。Codex では x-parody-writer で書き、x-parody-punchup でパンチアップする。

台本を書く依頼では、必ず SKILL.md の NEVER と guardrails.md の安全トリアージに従うこと。
