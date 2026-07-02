export type CampaignStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "SCHEDULED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

export type WorkflowNodeType =
  | "START"
  | "END"
  | "APPROVAL"
  | "WAIT_UNTIL"
  | "WAIT_DURATION"
  | "ACTIVATE_FLASH_SALE"
  | "DEACTIVATE_FLASH_SALE"
  | "SEND_PUSH"
  | "SEND_EMAIL"
  | "SEND_SMS"
  | "CHECK_PURCHASED"
  | "GENERATE_REPORT"
  | "REJECT_CAMPAIGN";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface WorkflowDefinition {
  workflowName: string;
  processKey: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface CampaignProduct {
  productId: string;
  salePrice: number;
  stockLimit: number;
}

export interface Campaign {
  id?: string | number;
  campaignId?: string | number;
  name: string;
  status: CampaignStatus | string;
  targetSegment: string;
  startTime: string;
  endTime: string;
  discountType: "PERCENT" | "AMOUNT" | string;
  discountValue: number;
  needApproval: boolean;
  processInstanceId?: string;
  camundaProcessInstanceId?: string;
  products: CampaignProduct[];
  workflow?: WorkflowDefinition;
  timeline?: Array<Record<string, unknown>>;
  reportMetrics?: Record<string, unknown>;
}

export interface ApprovalTask {
  id: string;
  taskId?: string;
  name: string;
  processInstanceId: string;
  campaignId?: string;
  createdTime?: string;
}
