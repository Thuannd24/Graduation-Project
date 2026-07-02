package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignDto {
    private Long id;
    private String name;
    private BigDecimal totalBudget;
    private BigDecimal remainingBudget;
    private LocalDateTime startDate;
    private LocalDateTime endDate;
    private String bpmnProcessDefinitionKey;
    private Boolean active;
    private String workflowJson;  // raw JSON from the Campaign Builder Frontend
    private String bpmnXml;       // compiled Camunda BPMN XML (may be null if not yet compiled)
}
