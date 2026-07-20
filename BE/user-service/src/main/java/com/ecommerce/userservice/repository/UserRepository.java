package com.ecommerce.userservice.repository;

import com.ecommerce.userservice.entity.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByKeycloakUserId(String keycloakUserId);

    Optional<User> findByEmail(String email);

    Optional<User> findByUsername(String username);

    Page<User> findByActiveTrue(Pageable pageable);

    // ──────────────────────────────────────────────────────────────────────────
    // Admin search/filter
    // ──────────────────────────────────────────────────────────────────────────

    @Query("SELECT u FROM User u WHERE " +
           "(:search IS NULL OR :search = '' OR " +
           "LOWER(u.username) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(u.email) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(u.fullName) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(u.phoneNumber) LIKE LOWER(CONCAT('%', :search, '%'))) " +
           "AND (:tier IS NULL OR :tier = '' OR u.customerTier = :tier) " +
           "AND (:blacklisted IS NULL OR u.isBlacklisted = :blacklisted) " +
           "AND (:active IS NULL OR u.active = :active)")
    Page<User> searchUsers(@Param("search") String search,
                           @Param("tier") String tier,
                           @Param("blacklisted") Boolean blacklisted,
                           @Param("active") Boolean active,
                           Pageable pageable);

    long countByCustomerTier(String tier);

    long countByIsBlacklistedTrue();

    // BUG FIX: adjustPoints() used a plain findById() (no lock) to read loyaltyPoints before
    // writing it back in the same transaction - two concurrent point adjustments for the same
    // user (redeem/refund/campaign-award) could both read the same balance before either
    // commits, both pass the sufficient-balance check, and both write - a lost update that lets
    // redemption spend more points than the user actually has. Mirrors CampaignRepository's
    // findByIdForUpdate fix for the same class of bug on campaign budgets.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.id = :id")
    Optional<User> findByIdForUpdate(@Param("id") Long id);
}
