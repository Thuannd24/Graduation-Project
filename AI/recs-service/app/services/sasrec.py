import torch
import torch.nn as nn
from typing import List, Dict, Any
from app.core.config import recs_settings
from shared_common.logger import get_logger

logger = get_logger(__name__)

# Dummy SASRec class for compiling & loading model weights safely
class SASRecModel(nn.Module):
    def __init__(self, item_num=10000, hidden_units=50, num_blocks=2, num_heads=1):
        super(SASRecModel, self).__init__()
        self.item_emb = nn.Embedding(item_num + 1, hidden_units, padding_idx=0)
        # Simplify model architecture for baseline compilation
        self.lstm = nn.LSTM(hidden_units, hidden_units, num_blocks, batch_first=True)
        self.output_linear = nn.Linear(hidden_units, item_num + 1)

    def forward(self, log_seqs):
        seqs = self.item_emb(log_seqs)
        out, _ = self.lstm(seqs)
        logits = self.output_linear(out[:, -1, :]) # predict next item
        return logits

class SasRecService:
    def __init__(self):
        logger.info("Initializing SASRec recommendation service...")
        self.model = None
        
    def _load_model(self):
        if self.model is None:
            # Safe loading or initialization
            self.model = SASRecModel()
            try:
                # Load state dict if weight file exists
                import os
                if os.path.exists(recs_settings.MODEL_WEIGHTS_PATH):
                    logger.info(f"Loading SASRec weights from {recs_settings.MODEL_WEIGHTS_PATH}...")
                    self.model.load_state_dict(torch.load(recs_settings.MODEL_WEIGHTS_PATH))
                else:
                    logger.warning("SASRec model weights not found, using initialized weights.")
            except Exception as e:
                logger.error(f"Error loading SASRec model weights: {e}")
            self.model.eval()
        return self.model

    def recommend(self, item_history: List[int], top_k: int = 10) -> List[Dict[str, Any]]:
        """
        Takes item interaction history IDs and returns top_k recommendations.
        """
        logger.info(f"Generating personalized recommendations for history: {item_history}")
        if not item_history:
            return []
            
        model = self._load_model()
        
        # Prepare input tensor
        log_seq = torch.zeros((1, 50), dtype=torch.long) # Pad to max length 50
        history_len = len(item_history)
        for i in range(min(50, history_len)):
            log_seq[0, -1 - i] = item_history[-1 - i]
            
        with torch.no_grad():
            predictions = model(log_seq)
            # Get top indices
            _, top_indices = torch.topk(predictions[0], top_k)
            scores = predictions[0][top_indices].tolist()
            indices = top_indices.tolist()
            
        results = []
        for idx, score in zip(indices, scores):
            if idx == 0:
                continue # ignore padding index
            results.append({
                "id": f"prod_{idx}",
                "name": f"Product recommendation matching item #{idx}",
                "price": 490000.0,
                "score": float(score)
            })
            
        return results

sasrec_service = SasRecService()
