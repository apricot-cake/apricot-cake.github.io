export interface FilterNode {
	slug: string;
	label: string;
	children?: readonly FilterNode[];
}

export const filterTree = [
	{ slug: 'apps', label: 'アプリ' },
] as const satisfies readonly FilterNode[];

export function getFilterPaths(nodes: readonly FilterNode[] = filterTree, parent: string[] = []): string[][] {
	return nodes.flatMap((node) => {
		const path = [...parent, node.slug];
		return [path, ...getFilterPaths(node.children ?? [], path)];
	});
}

export function getFilterLabel(path: readonly string[], nodes: readonly FilterNode[] = filterTree): string | undefined {
	let currentNodes = nodes;
	let label: string | undefined;

	for (const segment of path) {
		const node = currentNodes.find((candidate) => candidate.slug === segment);
		if (!node) return undefined;
		label = node.label;
		currentNodes = node.children ?? [];
	}

	return label;
}
