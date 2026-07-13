import numpy as np
from sklearn.ensemble import IsolationForest
from typing import List, Dict, Any
from shared_common.logger import get_logger

logger = get_logger(__name__)

class AnomalyDetectionService:
    def detect_anomaly(self, data: List[float]) -> Dict[str, Any]:
        """
        Detects if the last value in a sequence is anomalous.
        """
        logger.info(f"Analyzing data sequence of length {len(data)} for anomalies")
        if len(data) < 5:
            return {
                "is_anomaly": False,
                "confidence_score": 0.0,
                "threshold_value": 0.0,
                "actual_value": data[-1] if data else 0.0
            }
            
        # Fit an Isolation Forest on the historical data
        X = np.array(data).reshape(-1, 1)
        # We fit on all data except the last one (training on normal history)
        train_data = X[:-1]
        target_val = X[-1]
        
        clf = IsolationForest(contamination=0.05, random_state=42)
        clf.fit(train_data)
        
        # Predict on target value. -1 is anomaly, 1 is normal
        pred = clf.predict([target_val])[0]
        is_anomaly = bool(pred == -1)
        
        # Compute threshold and confidence (distance to separating hyperplane)
        score = float(clf.decision_function([target_val])[0])
        confidence_score = float(1.0 / (1.0 + np.exp(score))) # Sigmoid mapping
        
        # Simple threshold representation
        threshold_val = float(np.percentile(train_data, 5)) # 5th percentile as lower threshold
        
        return {
            "is_anomaly": is_anomaly,
            "confidence_score": round(confidence_score, 4),
            "threshold_value": round(threshold_val, 2),
            "actual_value": float(target_val[0])
        }

anomaly_detection_service = AnomalyDetectionService()
