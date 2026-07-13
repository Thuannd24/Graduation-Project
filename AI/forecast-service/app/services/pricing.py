from typing import Dict, Any
from shared_common.logger import get_logger

logger = get_logger(__name__)

class DynamicPricingService:
    def calculate_price_sensitivity(
        self, user_id: int, product_id: int, customer_tier: str, segmentation_label: str, cart_total: float
    ) -> Dict[str, Any]:
        """
        Calculates pricing sensitivity score (0.0 to 1.0).
        High sensitivity = recommend discount to prevent churn.
        Low sensitivity = recommend no discount.
        """
        logger.info(f"Evaluating price sensitivity for user {user_id} and product {product_id}")
        
        # Base sensitivity
        sensitivity_score = 0.45
        
        # Rule adjustments representing XGBoost classifier outputs
        if customer_tier.upper() == "VIP":
            # VIPs have lower price sensitivity, they care more about brand/service
            sensitivity_score -= 0.15
        elif customer_tier.upper() == "GOLD":
            sensitivity_score -= 0.05
            
        if "At Risk" in segmentation_label:
            # Customers about to churn have high price sensitivity, need incentives
            sensitivity_score += 0.35
        elif "New" in segmentation_label:
            sensitivity_score += 0.15
            
        # Large cart size increases price sensitivity
        if cart_total > 2000000.0:
            sensitivity_score += 0.10
        elif cart_total < 200000.0:
            sensitivity_score -= 0.10
            
        # Bound score between 0.0 and 1.0
        sensitivity_score = max(0.0, min(1.0, sensitivity_score))
        
        # Recommended action thresholds
        if sensitivity_score >= 0.70:
            action = "GIVE_HIGH_DISCOUNT"
        elif sensitivity_score >= 0.40:
            action = "GIVE_LOW_DISCOUNT"
        else:
            action = "NO_DISCOUNT"
            
        return {
            "aiPriceScore": round(sensitivity_score, 2),
            "recommendedAction": action
        }

dynamic_pricing_service = DynamicPricingService()
