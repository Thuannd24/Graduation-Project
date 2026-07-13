import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Any
from shared_common.logger import get_logger

logger = get_logger(__name__)

class DemandForecastingService:
    def forecast_demand(self, product_id: int, days: int = 30) -> List[Dict[str, Any]]:
        """
        Predicts stock demand for the next N days.
        Uses Prophet / LightGBM.
        """
        logger.info(f"Generating demand forecast for product: {product_id} over {days} days")
        
        # In production:
        # 1. Fetch historical inventory snapshots from DB
        # 2. Fit LightGBM or Prophet
        # 3. Predict next N days
        
        # Mocking time-series predictions
        start_date = datetime.now()
        predictions = []
        for i in range(days):
            current_date = start_date + timedelta(days=i)
            # Create a mock seasonal pattern (sine wave + small random noise)
            base_demand = 15.0
            weekly_seasonality = 5.0 * np.sin(2 * np.pi * current_date.weekday() / 7)
            noise = np.random.normal(0, 1.5)
            predicted_qty = max(0.0, float(base_demand + weekly_seasonality + noise))
            
            predictions.append({
                "date": current_date.strftime("%Y-%m-%d"),
                "predicted_quantity": round(predicted_qty, 2),
                "lower_bound": round(max(0.0, predicted_qty - 3.0), 2),
                "upper_bound": round(predicted_qty + 3.0, 2)
            })
            
        return predictions

demand_forecasting_service = DemandForecastingService()
