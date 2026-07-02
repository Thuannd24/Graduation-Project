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

export interface ValidationResult {
  valid: boolean;
  summary?: string;
  errors?: Array<{ nodeId?: string; message: string }>;
}

export const campaignApi = {
  validateWorkflow(graph: WorkflowGraph): Promise<{ code: string; data: ValidationResult }> {
    return apiClient.postAuth("/admin/campaigns/validate", graph);
  },

  createCampaign(campaign: CampaignDto): Promise<CampaignDto> {
    return apiClient.postAuth<CampaignDto>("/admin/campaigns", campaign);
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
};
