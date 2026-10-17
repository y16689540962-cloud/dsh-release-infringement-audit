# Release Infringement Audit

**A DSH plugin that gives the agent one tool — `release_infringement_audit(path)` — to check a
project for infringement risk *before* it is published to npm / ClawHub / GitHub.**

**中文文档见 [README.md](README.md)。**

```text
model → release_infringement_audit(path)
      → skill/scripts/release_audit.py (five risk classes)
      → graded BLOCK / WARN / INFO list + Markdown report
```

## Why this exists

The legal side of a release used to depend on remembering to ask: does a dependency drag in
GPL? Is this file copied? Do the fonts and icons have a licence? Does the name collide with a
trademark? Did a key slip in? This plugin turns that into one tool call whose verdicts are
anchored to **SPDX official metadata, the FSF GPL FAQ, Creative Commons' own position, and
choosealicense** — not to model intuition.

## Install

```bash
# from a local checkout (development)
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add file:/path/to/dsh-release-infringement-audit

# from npm (after publishing)
dsh plugin --profile desktop add dsh-release-infringement-audit
```

Restart DSH afterwards; every session can then call the tool.

## Configuration (`cordis.patch.yml`)

| Field | Default | Meaning |
|---|---|---|
| `python` | empty | Interpreter for the scanner. Empty = `$DSH_AUDIT_PYTHON` → `$PYTHON` → `python3` |
| `timeoutMs` | `120000` | Budget for one audit. Uninstalled dependencies make it slower (each falls back to a registry lookup) |

## Tool contract

**Parameter**: `path` (required) — absolute path of the project to audit.

**Result**:

| Field | Meaning |
|---|---|
| `verdict` | ✅ publishable / 🟡 fix warnings first / 🚫 do not publish |
| `exitCode` | `0` clean · `1` warnings only · `2` blockers present |
| `counts` | `{block, warn, info}` |
| `findings[]` | each with `category` (A–E), `severity`, `title`, `evidence`, `basis`, `fix` |
| `report` | Markdown report, safe to show the user as-is |

Exit codes 1 and 2 are **normal verdicts**, not failures: the runner reads them as results
instead of throwing.

## Five risk classes

| Class | Covers | Blocking example |
|---|---|---|
| A Licences | dependency licence vs project licence | a GPL-3.0 dependency; a CC-BY-NC asset package; no licence at all |
| B Third-party code | SPDX headers, foreign copyright lines, copied-from markers | a source file headed `SPDX-License-Identifier: GPL-2.0-only` |
| C Assets | font redistribution, CC-NC, uncredited images | a `.ttf` with no accompanying licence |
| D Trademarks | project name / title vs well-known marks | a name containing a known brand (WARN only — nominative use is defensible) |
| E Secrets | built-in rules; **never executes scripts from the audited project** | `sk-` / `ghp_` / `AKIA` / private key material |

## Verification (the project's own discipline)

```bash
npm install          # devDependency only (@deepseek-ai/dsh-tools, for unit tests)
npm test             # 19 node cases: contract + real python integration + CLI parity
npm run selftest     # 21 python cases: known-bad inputs prove the scanner works
```

Three things were proven, and none of them can be skipped:

1. **The scanner works** — 21 known-bad inputs all detected, plus a clean project with zero
   false positives.
2. **The tool really registers at runtime** — booting an isolated profile with an inspector
   plugin that queries `ctx.tools.schemas()` prints `total=2 audit=true`.
   Control experiment: a plugin with a deliberately malformed schema fails the boot with
   `JsonSchemaError: schema.additionalProperties must be explicitly true or false` — so
   "no error" is meaningful evidence.
3. **Plugin path == CLI path** — `test/parity.test.mjs` deep-compares `findings` on the same
   fixture, so the runner can never quietly rewrite the scanner's verdict.

The most valuable step was dogfooding: auditing itself surfaced **13 false positives** (licence
examples *quoted* in docs read as real headers, test fixtures read as live secrets, prose
explaining NC rules read as NC material). Rules were tightened — class B now requires a source
file, a comment line, and the head-of-file window; NC/ND only warns in licence/credit files and
downgrades to INFO in prose — and the self-audit returned to `✅ publishable`.

## Standalone skill (optional)

The plugin carries the full skill payload (`skill/`). Without the plugin:

```bash
./scripts/install-skill.sh          # copies into $DSH_HOME/skills/release-infringement-audit
python3 ~/.dsh/skills/release-infringement-audit/scripts/release_audit.py <project>
```

## Limitations (stated plainly)

- Automated triage, **not legal advice**. BLOCK/WARN items need a human decision.
- Image/icon provenance and similarity cannot be judged offline; listed for manual review.
- Trademark detection is keyword triage; a hit is not infringement.
- Copy detection uses headers, copyright lines and source markers; no large-scale fingerprinting,
  so a rewritten copy will pass.
- Without `npm install` and without network, some dependency licences stay unresolved (INFO).

## Licence

MIT, see [LICENSE](LICENSE).
