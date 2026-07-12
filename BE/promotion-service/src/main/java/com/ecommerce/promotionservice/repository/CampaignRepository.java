package com.ecommerce.promotionservice.repository;

import com.ecommerce.promotionservice.entity.Campaign;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface CampaignRepository extends JpaRepository<Campaign, Long> {
    List<Campaign> findByActiveTrueAndStartDateBeforeAndEndDateAfter(LocalDateTime now1, LocalDateTime now2);
    List<Campaign> findByActiveTrueAndTriggerTypeAndStartDateBeforeAndEndDateAfter(
            String triggerType, LocalDateTime now1, LocalDateTime now2);
    List<Campaign> findByBpmnProcessDefinitionKeyAndActiveTrue(String bpmnProcessDefinitionKey);
    boolean existsByBpmnProcessDefinitionKey(String bpmnProcessDefinitionKey);
    boolean existsByBpmnProcessDefinitionKeyAndIdNot(String bpmnProcessDefinitionKey, Long id);
}
