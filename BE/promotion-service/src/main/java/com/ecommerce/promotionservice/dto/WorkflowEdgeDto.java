package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowEdgeDto {
    private String id;
    private String from;          // source node id
    private String to;            // target node id
    private String condition;     // JUEL expression for conditional flows
    private Boolean isDefault;    // marks the default/else branch out of a Condition gateway
    private Map<String, Object> properties; // structured properties (e.g. operator, value)
}
