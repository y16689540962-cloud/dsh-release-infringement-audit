/**
 * Unit tests for the tool definition itself: the model-facing contract (name, required
 * parameter, declared output keys) and the projection from a scanner report to the
 * canonical tool value. The scanner is stubbed here on purpose — its own behaviour is
 * covered by the integration and parity suites.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { apply, createTool, inject, name as pluginName } from '../index.js';

const SAMPLE_REPORT = {
	project: '/tmp/demo',
	verdict: '🚫 不建议发布（存在阻断项）',
	exit_hint: 2,
	findings: [
		{
			id: 'A1',
			severity: 'BLOCK',
			category: 'A',
			title: '依赖许可证与发布冲突: gpl-dep (GPL-3.0-only)',
			evidence: "license 字段 = 'GPL-3.0-only'（来源 node_modules）",
			basis: 'FSF GPL FAQ',
			fix: '移除该依赖，或换等效宽松许可实现',
		},
		{
			id: 'D1',
			severity: 'WARN',
			category: 'D',
			title: '项目命名命中知名商标「ChatGPT」: package.json name',
			evidence: 'package.json name = super-chatgpt-tool',
			basis: '《商标法》',
			fix: '若为描述性用途注明「不隶属于」',
		},
	],
	disclaimer: '⚠️ 本报告为自动化初筛，不构成法律意见。',
};

const stub = (report, exitCode) => async () => ({ exitCode, report, stderr: '' });

test('plugin identity and injection', () => {
	assert.equal(pluginName, 'release-infringement-audit');
	assert.deepEqual(inject, ['tools']);
});

test('tool exposes one required path parameter and a full declared output', () => {
	const tool = createTool({}, { runAudit: stub(SAMPLE_REPORT, 2) });
	assert.equal(tool.name, 'release_infringement_audit');
	assert.match(tool.description, /发布前/);
	assert.match(tool.description, /侵权/);
	// defineTool returns the COMPILED definition: parameters is already JSON Schema and
	// `required: true` has been lifted into the object-level required array.
	assert.deepEqual(tool.parameters.required, ['path']);
	assert.equal(tool.parameters.properties.path.type, 'string');
	assert.equal(tool.parameters.type, 'object');
	// Declared output keys are the contract: the runtime validates values against them.
	const schema = tool.output.schema;
	assert.equal(schema.additionalProperties, false);
	for (const key of ['project', 'verdict', 'exitCode', 'counts', 'findings', 'report']) {
		assert.ok(key in schema.properties, `output schema is missing ${key}`);
	}
	assert.deepEqual(schema.properties.findings.items.additionalProperties, false);
	assert.equal(typeof tool.output.render, 'function');
});

test('execute projects the scanner report into counts, findings and markdown', async () => {
	const tool = createTool({}, { runAudit: stub(SAMPLE_REPORT, 2) });
	const value = await tool.execute({ path: '/tmp/demo' }, {});
	assert.equal(value.exitCode, 2);
	assert.deepEqual(value.counts, { block: 1, warn: 1, info: 0 });
	assert.equal(value.findings.length, 2);
	assert.equal(value.findings[0].severity, 'BLOCK');
	// Evidence strings survive verbatim — the model needs the real file/line, not a summary.
	assert.match(value.findings[0].evidence, /GPL-3\.0-only/);
	assert.match(value.report, /# 发布前侵权风险审核/);
	assert.match(value.report, /BLOCK ×1/);
	assert.match(value.report, /## A 开源许可证兼容性/);
	assert.match(value.report, /## D 品牌与商标/);
});

test('a clean report renders the all-clear branch and never claims a category', async () => {
	const clean = {
		project: '/tmp/clean',
		verdict: '✅ 可发布',
		findings: [],
		disclaimer: '⚠️ 自动化初筛。',
	};
	const tool = createTool({}, { runAudit: stub(clean, 0) });
	const value = await tool.execute({ path: '/tmp/clean' }, {});
	assert.deepEqual(value.counts, { block: 0, warn: 0, info: 0 });
	assert.equal(value.exitCode, 0);
	assert.match(value.report, /未发现自动化可识别的侵权风险点/);
	assert.doesNotMatch(value.report, /## A/);
});

test('render returns model-facing content blocks', async () => {
	const tool = createTool({}, { runAudit: stub(SAMPLE_REPORT, 2) });
	const value = await tool.execute({ path: '/tmp/demo' }, {});
	const blocks = tool.output.render({ path: '/tmp/demo' }, value);
	assert.equal(blocks.length, 1);
	assert.equal(blocks[0].type, 'text');
	assert.equal(blocks[0].text, value.report);
});

test('runner failures reach the caller unchanged', async () => {
	const tool = createTool({}, {
		runAudit: async () => {
			throw new Error('目录不存在：/tmp/nope');
		},
	});
	await assert.rejects(() => tool.execute({ path: '/tmp/nope' }, {}), /目录不存在/);
});

test('config flows into the runner: python override and timeout budget', async () => {
	let seen = null;
	const tool = createTool(
		{ python: '/opt/custom/python3', timeoutMs: 4321 },
		{
			runAudit: async (options) => {
				seen = options;
				return { exitCode: 0, report: { project: 'x', verdict: '✅ 可发布', findings: [] }, stderr: '' };
			},
		},
	);
	assert.equal(tool.timeoutMs, 4321 + 5000, 'the runner must get room to time out first');
	await tool.execute({ path: '/tmp/x' }, {});
	assert.equal(seen.python, '/opt/custom/python3');
	assert.equal(seen.timeoutMs, 4321);
	assert.equal(seen.projectPath, '/tmp/x');
});

test('apply registers exactly one tool into the registry', () => {
	const registered = [];
	const ctx = { tools: { register: (tool) => registered.push(tool) } };
	apply(ctx, {});
	assert.equal(registered.length, 1);
	assert.equal(registered[0].name, 'release_infringement_audit');
});
