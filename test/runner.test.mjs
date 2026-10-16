/**
 * Integration tests: the bundled scanner really runs, on real fixtures, through the
 * same path the plugin uses. A stubbed runner proves nothing about python resolution,
 * exit-code handling or JSON parsing, so these tests spawn the process.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { AuditRunError, resolvePython, runAudit } from '../lib/audit-runner.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

test('resolvePython prefers config, then env, then PATH', () => {
	assert.equal(resolvePython({ python: '/opt/py3' }), '/opt/py3');
	assert.equal(resolvePython({ python: '   ' }), process.env.DSH_AUDIT_PYTHON || process.env.PYTHON || 'python3');
});

test('clean fixture: exit code 0 and no blockers', async () => {
	const { exitCode, report } = await runAudit({
		projectPath: path.join(FIXTURES, 'clean'),
	});
	assert.equal(exitCode, 0);
	assert.deepEqual(report.findings, []);
	assert.match(report.verdict, /可发布/);
});

test('GPL dependency fixture: exit code 2 and a blocker in category A', async () => {
	const { exitCode, report } = await runAudit({
		projectPath: path.join(FIXTURES, 'gpl-dep'),
	});
	assert.equal(exitCode, 2, 'a blocked release must not look like a clean one');
	const blockers = report.findings.filter((finding) => finding.severity === 'BLOCK');
	assert.ok(blockers.length >= 1, 'expected at least one BLOCK');
	assert.ok(blockers.every((finding) => finding.category === 'A'));
	assert.match(blockers[0].title, /GPL/);
});

test('secrets fixture: built-in fallback path still finds a key', async () => {
	// Built at runtime: a key-shaped string must never sit in the repository, or the
	// workspace's own check-secrets.sh would flag the fixture on every commit.
	const dir = mkdtempSync(path.join(tmpdir(), 'ria-leaky-'));
	writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'leaky', license: 'MIT' }));
	writeFileSync(path.join(dir, 'LICENSE'), 'MIT License\n');
	writeFileSync(path.join(dir, 'config.js'), `const KEY = 'sk-${'A'.repeat(24)}';\n`);
	const { exitCode, report } = await runAudit({ projectPath: dir });
	assert.equal(exitCode, 2);
	assert.ok(report.findings.some((f) => f.category === 'E' && f.severity === 'BLOCK'));
});

test('a missing directory is rejected before any process is spawned', async () => {
	await assert.rejects(
		() => runAudit({ projectPath: path.join(tmpdir(), 'ria-does-not-exist-xyz') }),
		(error) => error instanceof AuditRunError && /目录不存在/.test(error.message),
	);
});

test('an empty path is rejected', async () => {
	await assert.rejects(() => runAudit({ projectPath: '' }), /path 不能为空/);
});

test('a file (not directory) is rejected', async () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'ria-file-'));
	const file = path.join(dir, 'not-a-dir.txt');
	writeFileSync(file, 'x');
	await assert.rejects(() => runAudit({ projectPath: file }), /不是目录/);
});

test('a missing interpreter becomes a readable error, not a crash', async () => {
	await assert.rejects(
		() => runAudit({
			projectPath: path.join(FIXTURES, 'clean'),
			python: '/nonexistent/python3-for-ria-test',
		}),
		(error) => error instanceof AuditRunError && /python3/.test(error.message),
	);
});

test('timeout kills the run and explains the slow case', async () => {
	const dir = mkdtempSync(path.join(tmpdir(), 'ria-slow-'));
	mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
	writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'slow', license: 'MIT' }));
	writeFileSync(path.join(dir, 'LICENSE'), 'MIT License\n');
	await assert.rejects(
		() => runAudit({ projectPath: dir, timeoutMs: 1 }),
		(error) => error instanceof AuditRunError && /超时/.test(error.message),
	);
});
