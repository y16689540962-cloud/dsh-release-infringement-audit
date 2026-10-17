/**
 * Runs the bundled scanner and parses its JSON report.
 *
 * Exit codes are part of the contract with the scanner:
 *   0 = clean, 1 = warnings only, 2 = blockers present.
 * A non-zero exit is therefore a NORMAL result and not a failure — only a failed
 * process (missing python, killed by signal, unparsable stdout) is an error. Getting
 * this wrong would turn every blocked release into a tool crash the model cannot read.
 */
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Absolute path of the bundled scanner; the plugin owns exactly one copy. */
export const SCANNER_PATH = fileURLToPath(
	new URL('../skill/scripts/release_audit.py', import.meta.url),
);

/** Failure that the caller may surface verbatim: the message is written for a human. */
export class AuditRunError extends Error {
	constructor(message) {
		super(message);
		this.name = 'AuditRunError';
	}
}

/** Pick the interpreter: explicit config, then env overrides, then PATH lookup. */
export function resolvePython(config = {}) {
	const explicit = typeof config.python === 'string' ? config.python.trim() : '';
	return explicit || process.env.DSH_AUDIT_PYTHON || process.env.PYTHON || 'python3';
}

/** Reject a target that cannot be audited before spending a process on it. */
export function assertAuditable(projectPath) {
	if (typeof projectPath !== 'string' || projectPath.trim() === '') {
		throw new AuditRunError('path 不能为空：请给出要审核的项目目录绝对路径。');
	}
	let stat;
	try {
		stat = statSync(projectPath);
	} catch {
		throw new AuditRunError(`目录不存在：${projectPath}`);
	}
	if (!stat.isDirectory()) {
		throw new AuditRunError(`不是目录：${projectPath}`);
	}
}

/**
 * Run one audit.
 *
 * @param {object} options
 * @param {string} options.projectPath Absolute path of the project to audit.
 * @param {string} [options.python] Interpreter override.
 * @param {number} [options.timeoutMs] Cooperative budget; the child is killed on expiry.
 * @param {AbortSignal} [options.signal] Caller cancellation from the tool runtime.
 * @param {typeof spawn} [options.spawnImpl] Injection seam for tests.
 * @returns {Promise<{exitCode: number, report: object, stderr: string}>}
 */
export async function runAudit({
	projectPath,
	python = resolvePython(),
	timeoutMs = 120_000,
	online = false,
	signal,
	spawnImpl = spawn,
} = {}) {
	// Async on purpose: a rejected promise reaches tool callers as a normal error result,
	// while a synchronous throw here would escape the tool pipeline.
	assertAuditable(projectPath);

	return await new Promise((resolve, reject) => {
		let child;
		try {
			const args = [SCANNER_PATH, projectPath, '--format', 'json'];
			if (online) args.push('--online');
			child = spawnImpl(python, args, {
				stdio: ['ignore', 'pipe', 'pipe'],
				signal,
			});
		} catch (error) {
			reject(new AuditRunError(
				`无法启动扫描器（${python}）：${error?.message ?? error}。`
				+ '请确认已安装 python3，或用 config.python 指定解释器。',
			));
			return;
		}

		let stdout = '';
		let stderr = '';
		let settled = false;
		let timer = null;
		const finish = (fn, value) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			fn(value);
		};

		if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
			timer = setTimeout(() => {
				try {
					child.kill('SIGKILL');
				} catch {
					/* already gone */
				}
				finish(reject, new AuditRunError(
					`审核超时（${timeoutMs}ms）。可以调大 config.timeoutMs，`
					+ '或先在同一目录执行 npm install 让依赖许可证可本地解析。',
				));
			}, timeoutMs);
			timer.unref?.();
		}

		child.stdout?.on('data', (chunk) => { stdout += chunk; });
		child.stderr?.on('data', (chunk) => { stderr += chunk; });

		child.on('error', (error) => {
			const detail = error?.code === 'ENOENT'
				? `找不到 python3（${python}）`
				: String(error?.message ?? error);
			finish(reject, new AuditRunError(`${detail}：无法运行扫描器。`));
		});

		child.on('close', (code) => {
			const text = stdout.trim();
			if (text === '') {
				const tail = stderr.trim().split('\n').slice(-3).join(' / ');
				finish(reject, new AuditRunError(
					`扫描器没有产出报告（退出码 ${code}）。${tail ? ` stderr: ${tail}` : ''}`,
				));
				return;
			}
			let report;
			try {
				report = JSON.parse(text);
			} catch {
				finish(reject, new AuditRunError(
					`扫描器输出不是 JSON（退出码 ${code}）：${text.slice(0, 200)}`,
				));
				return;
			}
			finish(resolve, { exitCode: typeof code === 'number' ? code : -1, report, stderr });
		});
	});
}
