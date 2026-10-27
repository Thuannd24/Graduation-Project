package com.ecommerce.promotionservice.delegate.support;

/**
 * Decides whether a failure inside a Camunda delegate is a business outcome (record it in a
 * process variable and continue) or a technical/transient one (rethrow so the async job is
 * retried by Camunda and ends in an incident when retries run out).
 *
 * Every service task is compiled with camunda:asyncBefore="true" (see BpmnCompilerService), so a
 * thrown exception rolls back only that job and Camunda retries it. Voucher issuance and point
 * credit are idempotent per processInstanceId:activityId, so a retry never double-issues.
 */
public final class DelegateFailurePolicy {

    private DelegateFailurePolicy() {
    }

    /**
     * Business rule violations (budget exhausted, invalid node parameters, invalid user) will
     * fail the same way on every retry, so retrying only wastes job executions.
     */
    public static boolean isBusinessFailure(Throwable ex) {
        return ex instanceof IllegalArgumentException || ex instanceof IllegalStateException;
    }
}
