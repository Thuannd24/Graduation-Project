package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowGraphDto {
    private List<WorkflowNodeDto> nodes;
    private List<WorkflowEdgeDto> edges;
}
