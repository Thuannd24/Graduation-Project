package com.ecommerce.promotionservice.delegate;

import com.ecommerce.promotionservice.client.UserClient;
import com.ecommerce.promotionservice.delegate.support.CampaignUserContextResolver;
import com.ecommerce.promotionservice.delegate.support.DelegateVariableHelper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.camunda.bpm.engine.delegate.DelegateExecution;
import org.camunda.bpm.engine.delegate.JavaDelegate;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Set;

@Component("upgradeMemberRankDelegate")
@RequiredArgsConstructor
@Slf4j
public class UpgradeMemberRankDelegate implements JavaDelegate {

    private static final Set<String> ALLOWED_TIERS = Set.of("SILVER", "GOLD", "VIP");

    private final UserClient userClient;
    private final CampaignUserContextResolver userContextResolver;

    @Override
    public void execute(DelegateExecution execution) throws Exception {
        var userDbId = userContextResolver.resolveUserDbId(execution);
        String targetTier = DelegateVariableHelper.getStr(execution, "targetTier").trim().toUpperCase();

        log.info("[UpgradeMemberRank] userId={}, targetTier={}",
                userDbId.map(String::valueOf).orElse("?"), targetTier);

        if (userDbId.isEmpty()) {
            log.warn("[UpgradeMemberRank] Missing user db id. Skipping upgrade.");
            execution.setVariable("rankUpgraded", false);
            return;
        }
        if (targetTier.isBlank()) {
            log.warn("[UpgradeMemberRank] Missing targetTier. Skipping upgrade.");
            execution.setVariable("rankUpgraded", false);
            return;
        }
        if (!ALLOWED_TIERS.contains(targetTier)) {
            log.warn("[UpgradeMemberRank] Invalid targetTier={}. Allowed: {}", targetTier, ALLOWED_TIERS);
            execution.setVariable("rankUpgraded", false);
            return;
        }

        String previousRank = DelegateVariableHelper.getStr(execution, "memberRank");

        try {
            userClient.updateTier(userDbId.get(), Map.of("tier", targetTier));
            execution.setVariable("rankUpgraded", true);
            execution.setVariable("previousMemberRank", previousRank);
            execution.setVariable("memberRank", targetTier);
            log.info("[UpgradeMemberRank] Upgraded user {} to {}", userDbId.get(), targetTier);
        } catch (Exception ex) {
            log.error("[UpgradeMemberRank] Failed to upgrade user tier: {}", ex.getMessage());
            execution.setVariable("rankUpgraded", false);
        }
    }
}
