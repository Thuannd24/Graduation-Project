package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.ValidationResultDto;
import com.ecommerce.promotionservice.dto.WorkflowGraphDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static com.ecommerce.promotionservice.service.WorkflowFixtures.validGraph;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * Bug thật ở WorkflowValidatorService. Chạy riêng: mvn -pl promotion-service test -Dtest=*BugCheck
 */
class WorkflowValidatorServiceBugCheck {

    private final WorkflowValidatorService validator = new WorkflowValidatorService();

    @Test
    @DisplayName("TC_PH6_WF_06: Cạnh trỏ tới node không tồn tại (xóa node End e1 nhưng còn cạnh a1 -> e1) phải bị báo lỗi; nếu không BPMN sinh ra có sequenceFlow targetRef rỗng và Camunda từ chối khi deploy")
    void danglingEdge_mustBeReported() {
        WorkflowGraphDto g = validGraph();
        g.getNodes().removeIf(n -> n.getId().equals("e1"));

        ValidationResultDto r = validator.validate(g);

        assertFalse(r.isValid(), "Graph có cạnh f4 trỏ tới node 'e1' không tồn tại nhưng validator báo hợp lệ");
    }
}
