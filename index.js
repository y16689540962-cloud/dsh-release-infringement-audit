/**
 * Release infringement audit — Host half.
 *
 * Registers exactly one agent tool (`release_infringement_audit`) that runs the bundled
 * scanner against a project directory and returns a graded report. The tool is a thin
 * wrapper on purpose: the scanner owns the rules and their evidence, so there is one
 * implementation to verify and nothing in this file to drift from it.
 *
 * The tool never writes to the audited project and takes no locking, so parallel calls
 * are safe; the only shared state is the process-wide interpreter choice.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { resolvePython, runAudit } from './lib/audit-runner.js';
import { toToolValue } from './lib/render.js';

/** Plugin identity, exported for the loader. */
export const name = 'release-infringement-audit';

/** The tool registry must exist; without it the plugin stays inactive instead of throwing. */
export const inject = ['tools'];

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Findings are data; the scanner's own wording is the contract. `additionalProperties:
 * false` is mandatory in the schema DSL — an object never silently accepts a new key.
 */
const FINDING_PROPERTIES = {
	id: { type: 'string', required: true, description: 'Category-local finding id' },
	category: { type: 'string', required: true, description: 'A/B/C/D/E' },
	severity: { type: 'string', required: true, description: 'BLOCK | WARN | INFO' },
	title: { type: 'string', required: true, description: 'One-line finding' },
	evidence: { type: 'string', required: true, description: 'file/line or concrete evidence' },
	basis: { type: 'string', required: true, description: '外部依据' },
	fix: { type: 'string', required: true, description: '处置建议' },
};

/**
 * Build the tool definition.
 *
 * @param {object} [config] Bundle config (see cordis.patch.yml).
 * @param {object} [deps] Injection seam: `runAudit` is replaced in unit tests.
 * @returns {ReturnType<typeof defineTool>}
 */
export function createTool(config = {}, deps = {}) {
	const python = resolvePython(config);
	const timeoutMs = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : DEFAULT_TIMEOUT_MS;
	const online = config.online === true;
	const audit = deps.runAudit ?? runAudit;

	return defineTool({
		name: 'release_infringement_audit',
		description:
			'发布前侵权/法律风险审核：扫描一个项目目录，返回分级清单（BLOCK/WARN/INFO）。'
			+ '覆盖五类风险：A 开源许可证兼容性（GPL 传染、CC-NC）、B 复制的第三方代码（SPDX 头、他人版权行）、'
			+ 'C 文档/图片/字体素材、D 品牌商标冲突、E 密钥泄漏。'
			+ '在把项目发布到 npm / ClawHub / GitHub 之前调用它；存在 BLOCK 项时应先处置再发布。'
			+ '结果为自动化初筛，不构成法律意见。只读，不修改被审项目。',
		parameters: {
			path: {
				type: 'string',
				required: true,
				description: '要审核的项目目录绝对路径',
			},
		},
		output: {
			schema: {
				type: 'object',
				additionalProperties: false,
				properties: {
					project: { type: 'string', required: true, description: '审核的目录' },
					verdict: { type: 'string', required: true, description: '结论文案' },
					exitCode: {
						type: 'integer',
						required: true,
						description: '0 干净 / 1 仅警告 / 2 存在阻断项',
					},
					counts: {
						type: 'object',
						required: true,
						additionalProperties: false,
						properties: {
							block: { type: 'integer', required: true },
							warn: { type: 'integer', required: true },
							info: { type: 'integer', required: true },
						},
					},
					findings: {
						type: 'array',
						required: true,
						description: '分级发现清单',
						items: {
							type: 'object',
							additionalProperties: false,
							properties: FINDING_PROPERTIES,
						},
					},
					report: { type: 'string', required: true, description: 'Markdown 报告，供直接展示' },
				},
			},
			render: (_args, value) => [{ type: 'text', text: value.report }],
		},
		isConcurrencySafe: () => true,
		// The runner owns its own, friendlier timeout message; leave it room to fire first.
		timeoutMs: timeoutMs + 5_000,
		async execute(args, exec) {
			const { exitCode, report } = await audit({
				projectPath: args.path,
				python,
				timeoutMs,
				online,
				signal: exec?.signal,
			});
			return toToolValue(report, exitCode);
		},
	});
}

/** Register the tool. Cordis calls this once the injected services are available. */
export function apply(ctx, config = {}) {
	ctx.tools.register(createTool(config));
}
