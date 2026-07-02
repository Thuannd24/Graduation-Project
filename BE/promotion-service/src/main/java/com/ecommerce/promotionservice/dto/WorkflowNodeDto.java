package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowNodeDto {
    private String id;
    private String type;  // e.g. Trigger_Event_NewUser, Condition_MemberRank, Action_IssueVoucher_Percent, End_Event
    private String name;
    private double x;
    private double y;
    private Map<String, Object> properties;
}
