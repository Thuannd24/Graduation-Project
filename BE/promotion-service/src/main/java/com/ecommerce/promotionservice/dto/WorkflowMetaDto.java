package com.ecommerce.promotionservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * Campaign-level metadata stored alongside the workflow graph.
 * Budget cap applies only when the workflow issues vouchers.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowMetaDto {
    /** Total budget pool (VNĐ) — required when workflow contains voucher actions. */
    private BigDecimal totalBudget;
}
