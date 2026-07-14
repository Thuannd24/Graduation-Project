const VOUCHER_ACTIONS = new Set([
  "Action_IssueVoucher_Percent",
  "Action_IssueVoucher_Fixed",
  "Action_IssueVoucher_Freeship"
]);

/** True when workflow contains any voucher-issuing action. */
export function workflowRequiresBudget(nodes) {
  return (nodes || []).some(n => VOUCHER_ACTIONS.has(n.type));
}

/** VNĐ reserved from campaign pool per single issuance on this node. */
export function reservePerIssue(node) {
  if (!node || !VOUCHER_ACTIONS.has(node.type)) return 0;
  const p = node.properties || {};
  switch (node.type) {
    case "Action_IssueVoucher_Percent":
      return Number(p.maxDiscountAmount) || 0;
    case "Action_IssueVoucher_Fixed":
      return Number(p.discountAmount) || 0;
    case "Action_IssueVoucher_Freeship":
      return Number(p.maxShippingDiscount) || 0;
    default:
      return 0;
  }
}

/** Conservative minimum pool = sum of per-node reserves. */
export function estimateMinimumPool(nodes) {
  return (nodes || [])
    .filter(n => VOUCHER_ACTIONS.has(n.type))
    .reduce((sum, n) => sum + reservePerIssue(n), 0);
}

export function formatVnd(amount) {
  return Number(amount || 0).toLocaleString("vi-VN") + " VNĐ";
}
