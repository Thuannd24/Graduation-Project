import { apiClient } from "./apiClient";

export interface CampaignDto {
  id?: number;
  name: string;
  totalBudget?: number;
  remainingBudget?: number;
  startDate?: string;
  endDate?: string;
  bpmnProcessDefinitionKey?: string;
  active?: boolean;
  workflowJson?: string;
  bpmnXml?: string;
}

export interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  x?: number;
  y?: number;
  properties: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  from?: string;
  to?: string;
  condition?: string;
  isDefault?: boolean;
  properties?: Record<string, unknown>;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface ValidationError {
  nodeId?: string;
  errorType?: string;
  field?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  summary?: string;
  errors?: ValidationError[];
}

export interface CampaignStats {
  campaignId: number;
  campaignName: string;
  bpmnProcessDefinitionKey?: string;
  triggerType?: string;
  active?: boolean;
  startDate?: string;
  endDate?: string;
  totalBudget: number;
  remainingBudget: number;
  committedBudget: number;
  totalIssued: number;
  totalUnused: number;
  totalUsed: number;
  totalExpired: number;
  totalReserved: number;
  totalPercent: number;
  totalFixed: number;
  totalFreeship: number;
  conversionRate: number;
  activeProcessInstances: number;
}

export interface PromotionDashboard {
  totalCampaigns: number;
  activeCampaigns: number;
  totalIssued: number;
  totalUsed: number;
  totalUnused: number;
  totalExpired: number;
  totalReserved: number;
  totalPercent: number;
  totalFixed: number;
  totalFreeship: number;
  totalBudget: number;
  remainingBudget: number;
  committedBudget: number;
  averageConversionRate: number;
  campaigns: CampaignStats[];
}

export interface IssuedVoucher {
  id: number;
  code: string;
  userId: number;
  campaignId: number;
  voucherType: string;
  status: string;
  discountPercent?: number;
  maxDiscountAmount?: number;
  discountAmount?: number;
  minOrderValue?: number;
  maxShippingDiscount?: number;
  expiresAt: string;
  usedAt?: string;
  usedOrderId?: number;
  createdAt: string;
}

export const campaignApi = {
  validateWorkflow(graph: WorkflowGraph): Promise<ValidationResult> {
    return apiClient.postAuth<ValidationResult>("/admin/campaigns/validate", graph);
  },

  createCampaign(campaign: CampaignDto): Promise<CampaignDto> {
    return apiClient.postAuth<CampaignDto>("/admin/campaigns", campaign);
  },

  updateCampaign(id: number, campaign: CampaignDto): Promise<CampaignDto> {
    return apiClient.putAuth<CampaignDto>(`/admin/campaigns/${id}`, campaign);
  },

  getCampaign(id: number): Promise<CampaignDto> {
    return apiClient.get<CampaignDto>(`/admin/campaigns/${id}`, { requireAuth: true });
  },

  listCampaigns(): Promise<CampaignDto[]> {
    return apiClient.get<CampaignDto[]>("/admin/campaigns", { requireAuth: true });
  },

  deleteCampaign(id: number): Promise<void> {
    return apiClient.deleteAuth(`/admin/campaigns/${id}`);
  },

  toggleCampaignActive(id: number, active: boolean): Promise<CampaignDto> {
    return apiClient.putAuth<CampaignDto>(`/admin/campaigns/${id}/toggle-active?active=${active}`);
  },

  getActiveCampaigns(): Promise<CampaignDto[]> {
    return apiClient.get<CampaignDto[]>("/public/campaigns/active");
  },

  getPromotionDashboard(): Promise<PromotionDashboard> {
    return apiClient.get<PromotionDashboard>("/admin/campaigns/dashboard", { requireAuth: true });
  },

  getCampaignStats(id: number): Promise<CampaignStats> {
    return apiClient.get<CampaignStats>(`/admin/campaigns/${id}/stats`, { requireAuth: true });
  },

  listCampaignVouchers(id: number): Promise<IssuedVoucher[]> {
    return apiClient.get<IssuedVoucher[]>(`/admin/campaigns/${id}/vouchers`, { requireAuth: true });
  }
};
