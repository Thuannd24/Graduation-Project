import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "../types/campaign";

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isStrongPassword(password: string): boolean {
  return /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password) && password.length >= 8;
}

export function validateLoginForm(email: string, password: string): string[] {
  const errors: string[] = [];
  if (!email.trim()) errors.push("Email là bắt buộc.");
  else if (!isValidEmail(email)) errors.push("Email không đúng định dạng.");
  if (!password) errors.push("Mật khẩu là bắt buộc.");
  return errors;
}

export function validateRegisterForm(values: { fullName: string; email: string; password: string; confirmPassword: string; acceptedTerms: boolean }): string[] {
  const errors: string[] = [];
  const fullName = values.fullName.trim();
  if (!fullName) errors.push("Họ tên là bắt buộc.");
  else if (fullName.length < 2 || fullName.length > 80) errors.push("Họ tên phải từ 2 đến 80 ký tự.");
  if (!values.email.trim()) errors.push("Email là bắt buộc.");
  else if (!isValidEmail(values.email)) errors.push("Email không đúng định dạng.");
  if (!values.password) errors.push("Mật khẩu là bắt buộc.");
  else if (!isStrongPassword(values.password)) errors.push("Mật khẩu phải tối thiểu 8 ký tự và có chữ hoa, chữ thường, số, ký tự đặc biệt.");
  if (!values.confirmPassword) errors.push("Xác nhận mật khẩu là bắt buộc.");
  else if (values.confirmPassword !== values.password) errors.push("Xác nhận mật khẩu phải trùng mật khẩu.");
  if (!values.acceptedTerms) errors.push("Bạn cần đồng ý điều khoản sử dụng.");
  return errors;
}

function outgoing(edges: WorkflowEdge[], nodeId: string): WorkflowEdge[] {
  return edges.filter((edge) => edge.from === nodeId);
}

function incoming(edges: WorkflowEdge[], nodeId: string): WorkflowEdge[] {
  return edges.filter((edge) => edge.to === nodeId);
}

function hasPath(edges: WorkflowEdge[], from: string, to: string, visited = new Set<string>()): boolean {
  if (from === to) return true;
  if (visited.has(from)) return false;
  visited.add(from);
  return outgoing(edges, from).some((edge) => hasPath(edges, edge.to, to, visited));
}

function hasCycle(edges: WorkflowEdge[]): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const nodes = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cycle = outgoing(edges, id).some((edge) => visit(edge.to));
    visiting.delete(id);
    visited.add(id);
    return cycle;
  };
  return Array.from(nodes).some(visit);
}

export function validateWorkflowLocal(workflow?: WorkflowDefinition | null): string[] {
  const errors: string[] = [];
  if (!workflow) return ["Workflow là bắt buộc."];
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];
  const ids = nodes.map((node) => node.id);
  const uniqueIds = new Set(ids);

  if (nodes.filter((node) => node.type === "START").length !== 1) errors.push("Workflow phải có đúng 1 START.");
  if (nodes.filter((node) => node.type === "END").length < 1) errors.push("Workflow phải có ít nhất 1 END.");
  if (uniqueIds.size !== ids.length) errors.push("Mỗi node phải có id duy nhất.");

  const start = nodes.find((node) => node.type === "START");
  if (start) {
    nodes.forEach((node) => {
      if (node.id !== start.id && !hasPath(edges, start.id, node.id)) errors.push(`Node ${node.id} đang rời rạc.`);
    });
  }
  if (hasCycle(edges)) errors.push("Workflow không được có vòng lặp.");

  nodes.forEach((node: WorkflowNode) => {
    const config = node.config || {};
    if (node.type !== "START" && node.type !== "END" && incoming(edges, node.id).length === 0) errors.push(`Node ${node.id} chưa có đường vào.`);
    if (node.type !== "END" && outgoing(edges, node.id).length === 0) errors.push(`Node ${node.id} chưa có đường ra.`);
    if (node.type === "APPROVAL" && !String(config.role || "").trim()) errors.push("APPROVAL phải có role.");
    if (node.type === "WAIT_UNTIL" && !["startTime", "endTime"].includes(String(config.timeField))) errors.push("WAIT_UNTIL chỉ cho phép timeField là startTime hoặc endTime.");
    if (node.type === "WAIT_DURATION") {
      if (Number(config.duration) <= 0) errors.push("WAIT_DURATION duration phải lớn hơn 0.");
      if (!["MINUTES", "HOURS", "DAYS"].includes(String(config.unit))) errors.push("WAIT_DURATION unit chỉ là MINUTES, HOURS hoặc DAYS.");
    }
    if (node.type === "SEND_PUSH" && (!String(config.title || "").trim() || !String(config.message || "").trim())) errors.push("SEND_PUSH bắt buộc title và message.");
    if (node.type === "SEND_EMAIL" && (!String(config.templateId || "").trim() || !String(config.subject || "").trim())) errors.push("SEND_EMAIL bắt buộc templateId và subject.");
  });

  nodes.filter((node) => node.type === "CHECK_PURCHASED").forEach((node) => {
    const conditions = outgoing(edges, node.id).map((edge) => edge.condition);
    if (!conditions.includes("purchased == true") || !conditions.includes("purchased == false")) errors.push("CHECK_PURCHASED phải có đủ 2 nhánh purchased == true và purchased == false.");
  });
  nodes.filter((node) => node.type === "APPROVAL").forEach((node) => {
    const conditions = outgoing(edges, node.id).map((edge) => edge.condition).filter(Boolean);
    if (conditions.length > 0 && (!conditions.includes("approved == true") || !conditions.includes("approved == false"))) errors.push("APPROVAL khi rẽ nhánh phải có approved == true và approved == false.");
  });

  const activate = nodes.find((node) => node.type === "ACTIVATE_FLASH_SALE");
  const deactivate = nodes.find((node) => node.type === "DEACTIVATE_FLASH_SALE");
  const waitStart = nodes.find((node) => node.type === "WAIT_UNTIL" && node.config?.timeField === "startTime");
  const waitEnd = nodes.find((node) => node.type === "WAIT_UNTIL" && node.config?.timeField === "endTime");
  if (activate && deactivate && !hasPath(edges, activate.id, deactivate.id)) errors.push("ACTIVATE_FLASH_SALE phải trước DEACTIVATE_FLASH_SALE.");
  if (waitStart && activate && !hasPath(edges, waitStart.id, activate.id)) errors.push("WAIT_UNTIL startTime nên trước ACTIVATE_FLASH_SALE.");
  if (waitEnd && deactivate && !hasPath(edges, waitEnd.id, deactivate.id)) errors.push("WAIT_UNTIL endTime nên trước DEACTIVATE_FLASH_SALE.");
  return Array.from(new Set(errors));
}

export function validateCampaignForm(form: any, workflow?: WorkflowDefinition | null): string[] {
  const errors: string[] = [];
  const name = String(form.name || "").trim();
  if (!name) errors.push("Tên chiến dịch là bắt buộc.");
  else if (name.length < 3 || name.length > 120) errors.push("Tên chiến dịch phải từ 3 đến 120 ký tự.");
  if (!String(form.targetSegment || "").trim()) errors.push("Phân khúc khách hàng là bắt buộc.");
  if (!form.discountType) errors.push("Loại giảm giá là bắt buộc.");
  const discountValue = Number(form.discountValue);
  if (!Number.isFinite(discountValue)) errors.push("Giá trị giảm giá là bắt buộc.");
  if (form.discountType === "PERCENT" && (discountValue <= 0 || discountValue > 100)) errors.push("Giảm theo phần trăm phải lớn hơn 0 và nhỏ hơn hoặc bằng 100.");
  if (form.discountType === "FIXED_AMOUNT" && discountValue <= 0) errors.push("Giảm theo số tiền phải lớn hơn 0.");
  if (!form.startTime) errors.push("Thời gian bắt đầu là bắt buộc.");
  if (!form.endTime) errors.push("Thời gian kết thúc là bắt buộc.");
  const start = form.startTime ? new Date(form.startTime) : null;
  const end = form.endTime ? new Date(form.endTime) : null;
  if (start && start.getTime() < Date.now() - 30000) errors.push("Thời gian bắt đầu không được nhỏ hơn thời điểm hiện tại.");
  if (start && end && end <= start) errors.push("Thời gian kết thúc phải sau thời gian bắt đầu.");
  if (!Array.isArray(form.products) || form.products.length < 1) errors.push("Phải có ít nhất 1 sản phẩm.");
  const productIds = new Set<string>();
  form.products?.forEach((product: any, index: number) => {
    const prefix = `Sản phẩm ${index + 1}:`;
    const productId = String(product.productId || "").trim();
    if (!productId) errors.push(`${prefix} mã sản phẩm là bắt buộc.`);
    if (productIds.has(productId)) errors.push(`${prefix} không được chọn trùng sản phẩm.`);
    productIds.add(productId);
    if (Number(product.salePrice) <= 0) errors.push(`${prefix} giá Flash Sale phải lớn hơn 0.`);
    if (Number(product.stockLimit) <= 0) errors.push(`${prefix} giới hạn tồn kho phải lớn hơn 0.`);
  });
  return [...errors, ...validateWorkflowLocal(workflow)];
}
