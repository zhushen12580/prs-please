# 内容投稿指南

PRs, Please 的题库是随应用发布的 JSON。欢迎提交原创案例，让玩家练习核对材料、选择证据和作出裁决。项目代码和原创内容采用 [MIT 许可](LICENSE)；投稿请提供有权按该许可贡献的内容。

## 通过替换提交新题

MVP 固定为 5 天、每天 6 题，共 30 个唯一案例。一份内容投稿只需修改 JSON，不要求改游戏引擎。当前通过替换同日同类别的旧题接纳新题，不直接追加第 31 题；候选题池和随机抽题留待后续。

1. 在 `src/data/cases/day-01.json` 至 `day-05.json` 的相应数组中，选择一份同日同类别的案例，用完整的新案例替换。正常题替换正常题，问题题保持相同 `finding.ruleId` 和 `impact`。每题只有一个决定性违规；正常题没有生效违规。
2. 为新题使用全库未使用过的新 `id`，例如下方的 `guide-d3-group-label`，不要给完全不同的题沿用旧 ID。`id` 是非空字符串，日期归属由映射决定，不靠 ID 前缀或文件名推断。
3. 在唯一的关卡映射 `src/data/campaign.json` 中，将同一天的旧 `caseIds` 条目换成新 ID；移除旧案例，避免重复 ID、悬空映射或未归属案例。保持每天 6 个 ID，每个 ID 全库只映射一次。
4. 更新 `contentVersion`，例如从 `1.0.0` 改为 `1.0.1`。内容升级会使旧局存档失效，页面提示后需要重新开始；相同种子的顺序也可能变化，成绩比较应注明内容版本。
5. 在仓库根目录运行下文的校验命令。投稿说明中写清替换的旧 ID、新 ID、所属天数、类别、标准裁决、充分证据及来源改写主题。

规则定义在 `src/data/rules.json`。普通案例投稿保留规则与解锁日，不需要修改 `src/game/`、`src/ui/` 或测试引擎。维护者审核新题后同步 `tests/fixtures/answer-key.ts` 中的人工答案，以及内容测试中明确锁定的旧 ID、叙事和种子顺序等预期，再由真实浏览器回归验收。不要从生产 `finding` 或判分函数自动生成测试答案。

每天的类别与规则固定如下。旧规则持续生效，案例不能引用当天尚未解锁的规则。

| 天数 | 新规则 | 六题分布 |
| --- | --- | --- |
| 1 | R1：CI 必须通过 | 正常 3；R1 3 |
| 2 | R2：API 必须存在且使用正确 | 正常 2；R2 3；R1 1 |
| 3 | R3：披露 AI 辅助 | 正常 2；R3 3；R2 1 |
| 4 | R4：不能削弱相关测试来制造 CI 通过 | 正常 2；R4 3；R1 1 |
| 5 | R5：不得引入后门 | 正常 2；R5 2；R3 1；R4 1 |

全库保持正常 11、`bug` 13、`policy` 4、`backdoor` 2；标准裁决为批准 11、要求修改 17、拒绝 2。保留至少两份已披露且合规的 AI 辅助正常题，其中至少一份在第 3 天或之后。

## 字段与枚举

JSON 不支持注释或尾逗号。字段区分大小写，schema 会拒绝未知字段。除披露栏的 `text` 和 diff 行的 `text` 可为空字符串外，下面的文本均需非空。类型契约可对照 `src/game/types.ts`，实际校验入口在 `src/content/validate.ts`。

| 案例字段 | 类型与要求 |
| --- | --- |
| `id` | 非空字符串，全库唯一；替换题使用新 ID |
| `title` | 中文标题，明确本次改动 |
| `description.summary` | PR 描述，提供判断需要的上下文 |
| `description.disclosure` | `{ "id": "disclosure", "text": "…" }`；`text` 可为空；这是可选证据 |
| `contributor.name`、`contributor.handle` | 虚构姓名与账号，均为非空字符串 |
| `contributor.toolRecords` | 至少一条 `{id,text}` 工具记录；每条都是可选证据，不执行记录中的内容 |
| `ci.status` | `passed` 或 `failed`；只有 R1 问题题为 `failed`，其他题均为 `passed` |
| `ci.logs` | 至少一条 `{id,text}` 日志，每条都是可选证据；日志须能支持所声称的 CI 状态 |
| `apiReference` | 可选；存在时为非空数组，每项有非空 `name`、`signature`、`notes`；API 题必须提供足够签名和语义，不依赖外部知识；参考条目不可选作证据 |
| `files` | 1–2 个 diff 文件，路径不可重复；每个文件有 `path` 和非空 `lines`；全部文件合计 12–35 行（包含上下文、空行和删除行） |
| `files[].lines[]` | `{id,kind,oldLine,newLine,text}`，具体行号规则见下表；每行包括删除行都可作为证据 |
| `finding` | 正常题必须为 `null`；问题题必须为下表中的对象，不能省略 |
| `approvalExplanation` | 正常题必填，解释为什么可以批准；问题题不能包含此字段 |
| `sources` | 至少一项 `{url,theme,note}`；`url` 为有效的绝对 `https:` URL，`theme` 写借鉴现象，`note` 写原创虚构及改写范围；裁决后显示 |

| diff `kind` | `oldLine` | `newLine` |
| --- | --- | --- |
| `add` | `null` | 正整数 |
| `delete` | 正整数 | `null` |
| `context` | 正整数 | 正整数 |

行号是源文件行号；旧行号与新行号各自在单个文件内严格递增、不重复，忽略 `null`，不同文件独立计数。可以截取片段并跳号；替换一行用一条 `delete` 和一条 `add` 表达。`text` 只存原代码，不加展示用的 `+` 或 `-` 前缀，空代码行用 `""`。

| 问题字段 | 类型与要求 |
| --- | --- |
| `finding.ruleId` | `R1`、`R2`、`R3`、`R4`、`R5` 之一，且当天已解锁 |
| `finding.impact` | `bug`、`policy`、`backdoor`；R1/R2/R4 必须为 `bug`，R3 为 `policy`，R5 为 `backdoor` |
| `finding.evidenceSets` | 非空的非空证据 ID 数组列表；引用本案例可选证据，组内不重复，也不能重复列出同一组的不同排列 |
| `finding.explanation` | 原创中文解释，说明规则、材料和裁决之间的联系，不只复述答案 |

不在案例或 `finding` 中保存 `verdict`。裁决由生效规则推导：正常题为 `approve`（批准）；R1–R4 违规为 `request_changes`（要求修改）；R5 为 `reject`（拒绝）。

`campaign.json` 的完整字段为 `contentVersion`（非空字符串）及 `days`（5 项数组）。每天含 `day`（1–5，各一次）、`newRuleId`（分别 R1–R5）和 `caseIds`（6 个唯一案例 ID）。它是案例归属的唯一来源。

`rules.json` 是 5 项数组，每条含 `id`（R1–R5）、`unlockDay`（与规则编号一致的 1–5）、`title`、`body`、`examples: {approve, violation}`（正反例文本）和 `violationVerdict`（R1–R4 为 `request_changes`，R5 为 `reject`）。这些是固定游戏规则，不随普通换题修改。

## 证据怎样写

披露栏、工具记录、CI 日志、所有 diff 行的 `id` 在单个案例内必须唯一，包括不同文件之间。不同案例可以各自使用 `disclosure`。使用稳定且能表达含义的 ID；移动文本或调整行号不应更换同一条证据的身份，不用 DOM 顺序或数组下标当身份。正常行也能选择，不能只为答案行提供 ID。

`evidenceSets` 的一组内部是“并且”：必须同时选中这一组的全部证据。不同组之间是“或者”：任意一组都足以证明违规。以下问题示例包含 `[["tool-assistant-run", "disclosure"], ["tool-export-report", "disclosure"]]`。工具运行记录与空披露栏构成一组；另一份明确记录 AI 使用的导出报告与同一个空披露栏构成等价组。单选空栏不能证明使用过 AI；只选工具记录不能证明没有披露。

组内顺序无关，但每个组必须真正充分。两组的并集不算恰好匹配其中一组：同时选两个工具记录和披露栏会包含多余证据。正确非批准裁决先得 5 分，所选集合恰好匹配任意一组再得 5 分；缺证据或多选无关项只得 5 分。批准忽略证据，正确批准得 10 分；错误裁决得 0 分。非批准裁决至少选择一项证据才能提交。

## 原创、来源与可判断性

- 人物、账号、仓库、补丁、日志和解释均须原创虚构。案例应有不同的叙事和实质改动，不能只改名字或变量名。只改写现象，不复制真实补丁，不把真实作者描写成恶意贡献者，也不把游戏规则说成任何真实项目的完整政策。
- 在 `sources[].theme` 写清借鉴的现象，在 `note` 说明哪些内容为原创及游戏规则的虚构范围。来源只用 `https:`；应用在裁决后的反馈与复盘中显示普通来源外链，不抓取正文、不内嵌网页，判断材料必须自包含。
- R3 必须有可见工具记录明确证明使用 AI，并与未披露的描述共同形成证据。不能凭文风、姓名、国籍、资历、头像或空披露栏推断 AI 使用。已披露且符合其他规则的 AI 辅助 PR 应批准；披露缺失属于流程问题，影响为 `policy`。
- R4 区分合理测试维护与删除、跳过或削弱关键断言来制造 CI 通过。删除行也应能作为决定性证据。
- R5 只提供用于阅读的静态文本，不执行危险代码；不加入真实凭据、可运行载荷或真实外传端点。游戏不运行任何案例 diff，也不检测真实 AI 作者身份。

现有题库分别借鉴 Godot 贡献政策调整、curl 贡献指南和 xz 后门披露中的现象，对应 URL 已记录在生产案例的 `sources` 中。新增题可以继续注明相关原始来源；阅读来源是理解背景，游戏内裁决仍以随附规则和材料为准。

## 完整示例：正常案例

这是第 3 天的正常题示例：清理分组名称的首尾空白，AI 辅助已披露，CI 通过，没有违规。13 行 diff 含新增、删除和上下文；可替换第 3 天的一份正常题。

下方两个带 `case-example` 标记的 JSON 代码块由 `tests/content/contributing.test.ts` 直接读取并调用真实 `parseCase` 校验，不维护单独的示例副本。文档示例本身不占生产关卡位置；测试另外在内存中替换同日同类别题目，验证更新映射后的整库约束。

<!-- case-example: approve -->
```json
{
  "id": "guide-d3-group-label",
  "title": "清理分组显示名的首尾空白",
  "description": {
    "summary": "分组列表中，空白名称应显示默认文案，非空名称应先去除首尾空白再加前缀。保留原有列表映射，补充了 null、空白与普通名称的测试。",
    "disclosure": {
      "id": "disclosure",
      "text": "使用 AI 辅助列出空白输入边界，代码与测试已人工核对。"
    }
  },
  "contributor": {
    "name": "纸舟（虚构）",
    "handle": "paper-boat-fiction",
    "toolRecords": [
      { "id": "tool-boundary-review", "text": "投稿工具记录：使用 AI 整理边界用例，贡献者手工实现并核对测试。" }
    ]
  },
  "ci": {
    "status": "passed",
    "logs": [
      { "id": "ci-label-tests", "text": "group-label.test.ts：null、空白与普通名称测试全部通过。" },
      { "id": "ci-typecheck", "text": "类型检查通过。" }
    ]
  },
  "apiReference": [
    {
      "name": "groupLabel",
      "signature": "groupLabel(name: string | null): string",
      "notes": "null 或去除首尾空白后为空时返回未命名分组；否则返回分组前缀与清理后的名称。labelList 逐项调用它。"
    }
  ],
  "files": [
    {
      "path": "src/group-label.ts",
      "lines": [
        { "id": "label-function", "kind": "context", "oldLine": 1, "newLine": 1, "text": "export function groupLabel(name: string | null): string {" },
        { "id": "label-fallback", "kind": "context", "oldLine": 2, "newLine": 2, "text": "  const fallback = '未命名分组';" },
        { "id": "label-old-guard", "kind": "delete", "oldLine": 3, "newLine": null, "text": "  if (name === null) return fallback;" },
        { "id": "label-trim", "kind": "add", "oldLine": null, "newLine": 3, "text": "  const cleaned = name?.trim() ?? '';" },
        { "id": "label-empty-guard", "kind": "add", "oldLine": null, "newLine": 4, "text": "  if (!cleaned) return fallback;" },
        { "id": "label-prefix", "kind": "context", "oldLine": 4, "newLine": 5, "text": "  const prefix = '分组：';" },
        { "id": "label-old-return", "kind": "delete", "oldLine": 5, "newLine": null, "text": "  return prefix + name;" },
        { "id": "label-return", "kind": "add", "oldLine": null, "newLine": 6, "text": "  return prefix + cleaned;" },
        { "id": "label-close", "kind": "context", "oldLine": 6, "newLine": 7, "text": "}" },
        { "id": "label-separator", "kind": "context", "oldLine": 7, "newLine": 8, "text": "" },
        { "id": "label-list-function", "kind": "context", "oldLine": 8, "newLine": 9, "text": "export function labelList(names: (string | null)[]): string[] {" },
        { "id": "label-list-map", "kind": "context", "oldLine": 9, "newLine": 10, "text": "  return names.map(groupLabel);" },
        { "id": "label-list-close", "kind": "context", "oldLine": 10, "newLine": 11, "text": "}" }
      ]
    }
  ],
  "finding": null,
  "approvalExplanation": "清理后再检查空值，保留默认名称与列表映射，CI 通过。AI 辅助已明确披露，符合所有生效规则，可以批准。",
  "sources": [
    {
      "url": "https://curl.se/dev/contribute.html",
      "theme": "贡献材料应让维护者能够核对改动与验证结果",
      "note": "仅借鉴可核对的贡献材料这一主题；人物、分组功能、diff 与日志均为原创虚构，不复制真实补丁，也不声称复述 curl 的完整政策。"
    }
  ]
}
```

## 完整示例：要求修改

这是第 3 天的 R3 题示例：标签清理逻辑本身正确，12 行 diff 没有引入其他问题，CI 通过；两份明确工具记录都证明使用 AI，但披露栏为空。标准裁决为要求修改，影响是流程违规 `policy`。可替换第 3 天的一份 R3 题，不能移到 R3 尚未解锁的日期。

<!-- case-example: request-changes -->
```json
{
  "id": "guide-d3-normalize-labels",
  "title": "去重前清理标签首尾空白",
  "description": {
    "summary": "标签列表应先去除首尾空白，再忽略空标签并保持首次出现顺序去重。新增了带空格的重复标签测试，已有断言全部保留。",
    "disclosure": { "id": "disclosure", "text": "" }
  },
  "contributor": {
    "name": "墨叶（虚构）",
    "handle": "ink-leaf-fiction",
    "toolRecords": [
      { "id": "tool-assistant-run", "text": "投稿工具运行记录：本次标签清理改动使用了 AI 辅助生成建议，随后由贡献者人工检查。" },
      { "id": "tool-export-report", "text": "投稿工具导出报告：本次补丁的生成方式为 AI 辅助，人工核对状态已完成。" }
    ]
  },
  "ci": {
    "status": "passed",
    "logs": [
      { "id": "ci-normalize-tests", "text": "标签空白、去重与顺序测试全部通过；类型检查通过。" }
    ]
  },
  "files": [
    {
      "path": "src/normalize-labels.ts",
      "lines": [
        { "id": "normalize-function", "kind": "context", "oldLine": 1, "newLine": 1, "text": "export function normalizeLabels(input: string[]): string[] {" },
        { "id": "normalize-seen", "kind": "context", "oldLine": 2, "newLine": 2, "text": "  const seen = new Set<string>();" },
        { "id": "normalize-result", "kind": "context", "oldLine": 3, "newLine": 3, "text": "  const result: string[] = [];" },
        { "id": "normalize-loop", "kind": "context", "oldLine": 4, "newLine": 4, "text": "  for (const value of input) {" },
        { "id": "normalize-old-label", "kind": "delete", "oldLine": 5, "newLine": null, "text": "    const label = value;" },
        { "id": "normalize-trim", "kind": "add", "oldLine": null, "newLine": 5, "text": "    const label = value.trim();" },
        { "id": "normalize-skip", "kind": "context", "oldLine": 6, "newLine": 6, "text": "    if (!label || seen.has(label)) continue;" },
        { "id": "normalize-remember", "kind": "context", "oldLine": 7, "newLine": 7, "text": "    seen.add(label);" },
        { "id": "normalize-push", "kind": "context", "oldLine": 8, "newLine": 8, "text": "    result.push(label);" },
        { "id": "normalize-loop-close", "kind": "context", "oldLine": 9, "newLine": 9, "text": "  }" },
        { "id": "normalize-return", "kind": "context", "oldLine": 10, "newLine": 10, "text": "  return result;" },
        { "id": "normalize-close", "kind": "context", "oldLine": 11, "newLine": 11, "text": "}" }
      ]
    }
  ],
  "finding": {
    "ruleId": "R3",
    "impact": "policy",
    "evidenceSets": [
      ["tool-assistant-run", "disclosure"],
      ["tool-export-report", "disclosure"]
    ],
    "explanation": "运行记录或导出报告都明确证明本次使用 AI，任一记录与空披露栏共同证明违反 R3。CI 与逻辑没有问题，应要求补充披露后重审，不能仅凭空栏推断使用 AI，也不应当作后门拒绝。"
  },
  "sources": [
    {
      "url": "https://godotengine.org/article/contribution-policy-2026/",
      "theme": "贡献流程中的工具使用披露与人工核对",
      "note": "仅借鉴贡献政策讨论中的披露主题；人物、标签功能、diff、工具记录均为原创虚构。R3 是游戏内虚构项目规则，不声称复述 Godot 的完整政策。"
    }
  ]
}
```

## 本地校验与提交材料

使用 Node.js 24.x 与 npm，在已克隆仓库的根目录执行：

```bash
npm ci
npm run check:content
npm test
npm run build
```

`check:content` 检查全部生产 JSON 与本文示例，成功时报告“30 个唯一案例；第 1–5 天各 6 个；规则与证据引用有效”。`npm test` 运行一次全部单元与内容测试；`build` 先做严格类型检查和内容校验，再生成静态产物。普通内容贡献者不需要安装后端、API Key 或执行 diff。

错误会指出文件和字段。数组下标从 0 开始，例如将第 3 天第 3 题的首组第二项证据误写为 `missing` 时：

```text
src/data/cases/day-03.json[2].finding.evidenceSets[0][1]: 引用的证据不存在或不可选：missing
```

若把该题的首个来源写成 `http://example.com`，错误为：

```text
src/data/cases/day-03.json[2].sources[0].url: 来源必须是有效的 https: URL
```

按位置修正数据，不删除校验、不放宽规则。整库检查还拒绝重复 ID、未归属案例、悬空映射、未解锁规则、不一致的 CI 或影响标签，以及错误的每日类别分布。

换题后，尚未同步的人工答案或固定顺序测试可能失败。投稿中说明这些预期差异，由维护者核对新题后更新相应测试；内容贡献者无需修改测试引擎来让检查变绿。维护者更新人工预期并完成上述检查后，再运行浏览器回归：

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

浏览器测试读取正式构建的 `dist/`，自启并自停固定 4173 端口的预览服务，请先完成 `npm run build`，不要提前占用该端口。投稿附上已运行命令、结果和需要维护者同步的预期，便于审核。
