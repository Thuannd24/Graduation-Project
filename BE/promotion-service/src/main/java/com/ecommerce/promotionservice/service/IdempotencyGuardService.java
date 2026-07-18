package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.entity.ExecutedAction;
import com.ecommerce.promotionservice.repository.ExecutedActionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Guards Camunda delegates whose side effect (send email, credit points) is not otherwise
 * idempotent, against Camunda re-running a failed job's delegate.execute() from scratch.
 *
 * Usage: check {@link #alreadyExecuted} BEFORE performing the side effect (skip if true), perform
 * it, then call {@link #markExecuted} AFTER it succeeds - never before. Marking before the call
 * would let a retry silently skip an action whose first attempt actually failed (e.g.
 * notification-service was down), because REQUIRES_NEW commits the mark independently of whether
 * the real action later throws.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class IdempotencyGuardService {

    private final ExecutedActionRepository repository;

    @Transactional(readOnly = true)
    public boolean alreadyExecuted(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return false;
        }
        return repository.existsByIdempotencyKey(idempotencyKey);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markExecuted(String idempotencyKey, String actionType) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return;
        }
        try {
            repository.save(ExecutedAction.builder()
                    .idempotencyKey(idempotencyKey)
                    .actionType(actionType)
                    .build());
        } catch (DataIntegrityViolationException e) {
            // Already marked by a concurrent attempt - fine, the point was already made.
            log.debug("ExecutedAction {} already recorded: {}", idempotencyKey, e.getMessage());
        }
    }
}
