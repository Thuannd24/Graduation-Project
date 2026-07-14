export function flattenCategoryTree(nodes, prefix = "", level = 0) {
  const result = [];
  if (!Array.isArray(nodes)) return result;
  for (const node of nodes) {
    const name = node.name || node.label || String(node.id);
    const path = prefix ? `${prefix} › ${name}` : name;
    result.push({ id: String(node.id), name, path, level });
    if (node.children?.length) {
      result.push(...flattenCategoryTree(node.children, path, level + 1));
    }
  }
  return result;
}
