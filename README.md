# PRs, Please

A single-player browser game about maintaining an open-source project. Review 30 fictional pull requests over five working days: read the description, diff, CI logs and supporting records, select evidence, then approve, request changes or reject. A shift takes about 15–25 minutes. The game interface and cases are in Simplified Chinese; the code examples use JavaScript/TypeScript.

Play requires no login or API key. The app runs entirely in the browser with no backend, remote model or runtime service. Case code is displayed as text and never executed. The source uses native TypeScript DOM components and Vite.

## Run locally

1. Install **Node.js 24** and npm. Node 24 is also the version used by CI.
2. Clone this repository using its repository page, then open a terminal in the cloned repository's root directory, alongside `package.json`. Run all commands below from that directory.
3. Install the dependencies pinned in `package-lock.json`:

   ```bash
   npm ci
   ```

4. Start the development server:

   ```bash
   npm run dev -- --host 127.0.0.1
   ```

5. Open [http://127.0.0.1:5173/prs-please/](http://127.0.0.1:5173/prs-please/) in your browser. Keep the terminal running while playing; press **Ctrl+C** there to stop the server.

No `.env` file, secrets, global tools or separate backend setup is required. Run from the source checkout; you do not need a published npm/PyPI application package. `npm ci` installs the project's local development tools. Installing dependencies and Chromium requires network access; after the app's static resources load, playing, reviewing results and exporting a scorecard need no further network requests. Offline reloading is not supported.

## Play a shift

1. Keep the default seed, `maintainer-001`, or enter your own. A seed must contain **1–32 ASCII letters, digits, underscores or hyphens** (`A–Z`, `a–z`, `0–9`, `_`, `-`). Leading and trailing whitespace is trimmed; spaces within the seed are invalid. The same seed and content version reproduce the same order, shuffling only within each day's six cases.
2. Click **开始值班** (start shift), read the day's briefing, then click **开始评审** (start reviewing).
3. Read the PR description, AI disclosure, contributor/tool records, CI status and logs, diff and any supplied API reference. Click evidence to select it; click again to deselect it. Deleted lines also count as selectable evidence. Keyboard users can use Tab to reach controls and Enter or Space to activate them.
4. Open **规则手册** (rule manual) whenever needed. One new rule unlocks each day; earlier rules stay active. Future rules remain locked. Close the manual with its close button or Escape to return to the same PR and evidence selection.
5. Choose one verdict, then click **提交裁决** (submit verdict):

   | Verdict | When to use it | Evidence needed to submit |
   | --- | --- | --- |
   | **批准** — Approve | The PR meets all active rules. | None; selections are ignored for scoring. |
   | **要求修改** — Request changes | The PR has a fixable rule violation. | At least one selected item. |
   | **拒绝** — Reject | The PR introduces a hidden backdoor. | At least one selected item. |

6. Read the feedback: it explains the standard verdict, rule and sufficient evidence, including alternative evidence groups. Submission locks that PR's verdict. Click **下一份** (next PR) to continue. Requesting changes finishes this review; there is no resubmission round.
7. After the sixth PR, click **查看日结** (day summary), review the results, then **下一天** (next day). After day five, click **查看最终成绩** (final results) to see all 30 reviews and your totals.

The daily rules are:

| Day | New rule | Verdict for a violation |
| --- | --- | --- |
| 1 | R1: CI must pass. | Request changes |
| 2 | R2: Project APIs must exist and match the supplied reference. | Request changes |
| 3 | R3: AI assistance must be disclosed in the PR description. | Request changes |
| 4 | R4: Do not delete or weaken relevant tests to manufacture passing CI. | Request changes |
| 5 | R5: Do not introduce hidden execution, credential exfiltration or validation bypasses. | Reject |

R3 relies on explicit tool records, not writing style or contributor identity. Disclosed AI assistance is allowed when the PR meets the other active rules. These are the fictional project's rules; case sources provide background rather than defining real projects' policies.

The work clock starts at 09:00 and advances 90 minutes per submission, reaching 18:00 after six reviews. Reading and choosing evidence take no game time; there is no real-time countdown.

Each PR is worth 10 points, for a maximum of **300**. A correct approval earns 10. A correct request for changes or rejection earns 5, plus 5 when the selected evidence exactly matches one sufficient group. Missing items or extra unrelated items lose that evidence bonus; an incorrect verdict earns 0. Results also track correct verdicts, violations approved, bugs/backdoors approved, and good PRs wrongly rejected or sent back.

### Save, resume and restart

The game keeps one current shift in your browser's `localStorage`, including submitted reviews and your current evidence/verdict draft. After reloading or reopening the same site in the same browser, the home screen offers **继续值班** (continue shift). Click it to resume; reloading feedback does not score the review twice. Saves are local to that browser and origin (scheme, host and port), with no account or cloud sync.

Use **返回首页** (return home) to reach the seed form. **重新开始** (restart) or **同种子再来一次** (replay with the same seed) asks for confirmation before replacing the current shift. **确认覆盖** confirms and clears its scores, reviews and drafts; cancelling preserves them.

If storage is unavailable, **进度仅保留至本页关闭** warns that progress is kept only in memory. You can finish the shift in the current page, but reloading or closing it loses that progress. Corrupt saves and saves from an incompatible content or save version are discarded with **旧进度不可用**; start a new shift when this appears.

### Download the scorecard

On the final results screen, click **下载成绩卡** (download scorecard). For the default seed, the download is `prs-please-maintainer-001.png`: a **1200×630 PNG** containing the project name, score, correct verdicts, error totals, seed and content version, with no personal information. Repeated or cancelled downloads do not change the results.

All cases and answers ship in the client. This is a local game with no anti-cheat guarantee or server-verified scores.

## Check the project

On a fresh **Ubuntu 24.04** machine with Node.js 24 and npm installed, run this complete sequence from the repository root:

```bash
npm ci
npx playwright install --with-deps chromium
npm test
npm run build
npm run test:e2e
```

The Chromium installer also installs its Linux system dependencies; the user running it needs permission to install system packages. Tools use their default cache and browser locations.

`npm test` runs all Vitest unit, content and documentation tests once, without watch mode. `npm run build` runs strict type checking and content checks before producing `dist/`. The [CI workflow](.github/workflows/ci.yml) runs the same sequence on Ubuntu.

For standalone checks:

```bash
npm run typecheck
npm run check:content
```

The content check reports 30 unique cases, six per day, and validates rules, evidence references, distributions and source URLs. Errors identify the file and field.

Playwright tests the built app in Chromium, including desktop and mobile layouts, keyboard controls, complete campaigns, persistence failures and PNG downloads. **Build before running browser tests.** Playwright starts its own preview server on **127.0.0.1:4173** and stops it when tests end. Leave port 4173 free; stop any manual preview with Ctrl+C first. The tests refuse to reuse an existing server.

After building, run any of these user-story checks individually. The Chinese filters match the test names:

```bash
npm run test:e2e -- --grep "逐日规则"
npm run test:e2e -- --grep "证据与三种裁决"
npm run test:e2e -- --grep "完整五天"
npm run test:e2e -- --grep "种子复现"
npm run test:e2e -- --grep "存档与降级"
npm run test:e2e -- --grep "成绩卡下载"
```

These cover accumulating rules, evidence and verdicts, all five days, reproducible seeds, save recovery/degradation, and real PNG downloads, respectively.

## Preview the static build

`dist/` contains only static HTML, CSS, JavaScript and local assets. The default public base path is **`/prs-please/`**. To build and preview it locally:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Open [http://127.0.0.1:4173/prs-please/](http://127.0.0.1:4173/prs-please/). Press **Ctrl+C** to stop preview; it is a local verification server.

For a concrete alternate public path, stop preview, then run:

```bash
npm run build -- --base=/review-lab/
PRS_PLEASE_BASE=/review-lab/ npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Open [http://127.0.0.1:4173/review-lab/](http://127.0.0.1:4173/review-lab/). The build flag sets asset URLs; the preview environment variable makes the preview server use the matching base. For another repository name, replace `/review-lab/` in both commands with its public path, including the leading and trailing slashes. `PRS_PLEASE_BASE` is a public path setting, not a secret.

The game changes screens inside the root HTML document without History API routes, so refreshing that base URL needs no server-side route fallback. A static host must serve `dist/` at the same public path used for the build. Before returning to the default browser-test sequence, stop preview with Ctrl+C and run `npm run build` to restore `/prs-please/`.

## Contribute and license

Read [CONTRIBUTING.md](CONTRIBUTING.md) (in Simplified Chinese) for the JSON schema, complete normal/problem examples, evidence writing, original-source requirements and validation commands. Content contributions replace a case of the same day and category, update the campaign mapping and content version, and preserve the 30-case distribution.

Code and original case content are available under the [MIT license](LICENSE).

Built with Claude Code & Codex
