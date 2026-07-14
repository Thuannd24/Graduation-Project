package com.ecommerce.promotionservice.repository;

import com.ecommerce.promotionservice.entity.Campaign;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface CampaignRepository extends JpaRepository<Campaign, Long> {
    List<Campaign> findByActiveTrueAndStartDateBeforeAndEndDateAfter(LocalDateTime now1, LocalDateTime now2);
    List<Campaign> findByActiveTrueAndTriggerTypeAndStartDateBeforeAndEndDateAfter(
            String triggerType, LocalDateTime now1, LocalDateTime now2);
    List<Campaign> findByBpmnProcessDefinitionKeyAndActiveTrue(String bpmnProcessDefinitionKey);
    boolean existsByBpmnProcessDefinitionKey(String bpmnProcessDefinitionKey);
    boolean existsByBpmnProcessDefinitionKeyAndIdNot(String bpmnProcessDefinitionKey, Long id);

    // BUG FIX: reserveBudget()/releaseReservedBudget() used a plain findById() (no lock), so two
    // concurrent budget reservations for the same campaign could both read the same
    // "remaining" value before either commits, both pass the sufficient-funds check, and both
    // subtract - a classic lost update that lets a campaign's voucher spend exceed its budget.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Campaign c WHERE c.id = :id")
    Optional<Campaign> findByIdForUpdate(@Param("id") Long id);
}
