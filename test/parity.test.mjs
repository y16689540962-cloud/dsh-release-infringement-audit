/**
 * Parity: the plugin's runner must return exactly what the scanner CLI returns.
 *
 * The rules live in the python scanner. If the runner ever starts post-processing
 * findings — renaming, filtering, reordering — the tool and the CLI would disagree and
 * only this test would notice. Deep equality on the findings array is the cheap guard.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

import { SCANNER_PATH, resolvePython, runAudit } from '../lib/audit-runner.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

function cliReport(projectPath) {
	// Exit codes 1 and 2 are normal verdicts (warnings / blockers), so a non-zero exit
	// must be read rather than treated as a crash — exactly the contract the runner has.
	try {
		const stdout = execFileSync(resolvePython(), [SCANNER_PATH, projectPath, '--format', 'json'], {
			encoding: 'utf8',
		});
		return JSON.parse(stdout);
	} catch (error) {
		if (typeof error?.stdout === 'string' && error.stdout.trim() !== '') {
			return JSON.parse(error.stdout);
		}
		throw error;
	}
}

for (const fixture of ['clean', 'gpl-dep']) {
	test(`plugin runner and CLI agree on fixtures/${fixture}`, async () => {
		const projectPath = path.join(FIXTURES, fixture);
		const viaRunner = await runAudit({ projectPath });
		const viaCli = cliReport(projectPath);

		assert.deepEqual(viaRunner.report.findings, viaCli.findings);
		assert.equal(viaRunner.report.verdict, viaCli.verdict);
		assert.equal(viaRunner.report.project, viaCli.project);
		assert.equal(viaRunner.exitCode, viaCli.exit_hint);
	});
}
