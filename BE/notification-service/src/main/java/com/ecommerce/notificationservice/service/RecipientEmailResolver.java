package com.ecommerce.notificationservice.service;

import java.util.Optional;

/**
 * Looks up the real e-mail address of a customer when an event does not carry one
 * (e.g. OrderShippedEvent only has userId). Implementations must never invent an address.
 */
public interface RecipientEmailResolver {

    /** @param userId Keycloak user id (UUID) or internal numeric user id */
    Optional<String> resolveEmail(String userId);
}
