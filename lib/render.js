/**
 * Turns the scanner's JSON report into the canonical tool value and the model-facing
 * text.
 *
 * This is a projection, not a second implementation of the report: the scanner owns
 * the wording of every finding (evidence / basis / fix), and this module only groups
 * and counts. Anything that needs the full human report should run the scanner with
 * `--format md` instead of expecting this file to reproduce it.
 */

const CATEGORY_NAMES = {
	A: '开源许可证兼容性',
	B: '复制的第三方代码',
	C: '文档/图片/字体素材',
	D: '品牌与商标',
	E: '密钥与隐私',
};

const SEVERITY_ORDER = { BLOCK: 0, WARN: 1, INFO: 2 };

/** Count findings per severity; missing keys are reported as zero rather than absent. */
export function countFindings(findings = []) {
	const counts = { block: 0, warn: 0, info: 0 };
	for (const finding of findings) {
		if (finding?.severity === 'BLOCK') counts.block += 1;
		else if (finding?.severity === 'WARN') counts.warn += 1;
		else counts.info += 1;
	}
	return counts;
}

/** Normalize one scanner finding into the declared output shape. */
function normalizeFinding(finding) {
	return {
		id: String(finding?.id ?? ''),
		category: String(finding?.category ?? ''),
		severity: String(finding?.severity ?? 'INFO'),
		title: String(finding?.title ?? ''),
		evidence: String(finding?.evidence ?? ''),
		basis: String(finding?.basis ?? ''),
		fix: String(finding?.fix ?? ''),
	};
}

/** Canonical tool value: exactly the shape declared by `output.schema`. */
export function toToolValue(report, exitCode) {
	const findings = Array.isArray(report?.findings) ? report.findings.map(normalizeFinding) : [];
	return {
		project: String(report?.project ?? ''),
		verdict: String(report?.verdict ?? ''),
		exitCode: Number.isFinite(exitCode) ? exitCode : -1,
		counts: countFindings(findings),
		findings,
		report: renderReport(report, findings),
	};
}

/** Model-facing markdown: verdict, counts, then findings grouped by category. */
export function renderReport(report, normalized) {
	const findings = normalized ?? (Array.isArray(report?.findings)
		? report.findings.map(normalizeFinding)
		: []);
	const counts = countFindings(findings);
	const lines = [
		'# 发布前侵权风险审核',
		'',
		`- 项目: \`${report?.project ?? ''}\``,
		`- 结论: ${report?.verdict ?? ''}`,
		`- 发现: BLOCK ×${counts.block} · WARN ×${counts.warn} · INFO ×${counts.info}`,
	];

	if (findings.length === 0) {
		lines.push('', '✅ 未发现自动化可识别的侵权风险点。');
		lines.push('', '> 仍建议人工复核：README 引用的外部图片、大段引文、图标是否原创。');
	}

	for (const category of Object.keys(CATEGORY_NAMES)) {
		const items = findings
			.filter((finding) => finding.category === category)
			.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
		if (items.length === 0) continue;
		lines.push('', `## ${category} ${CATEGORY_NAMES[category]}`);
		for (const item of items) {
			lines.push(`- **[${item.severity}] ${item.title}**`);
			if (item.evidence) lines.push(`  - 证据: ${item.evidence}`);
			if (item.basis) lines.push(`  - 依据: ${item.basis}`);
			if (item.fix) lines.push(`  - 处置: ${item.fix}`);
		}
	}

	lines.push('', '---', String(report?.disclaimer ?? '自动化初筛，不构成法律意见。'));
	return lines.join('\n');
}
