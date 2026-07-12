package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowGraphDto {
    /** Optional campaign metadata (budget cap, etc.). */
    private WorkflowMetaDto meta;
    private List<WorkflowNodeDto> nodes;
    private List<WorkflowEdgeDto> edges;
}
