# Academic Defense: SASRec Evaluation Methodology (NDCG, Hit Rate & Popularity Bias)

*Target: Defending the evaluation metrics used for the Recommendation System and proving the model's validity against naive baselines.*

## 1. Why Accuracy/RMSE are Meaningless in RecSys
In traditional Machine Learning, models are evaluated using Accuracy, Precision, or RMSE. In E-Commerce Sequential Recommendation, these metrics are completely discarded.
- **The Problem with RMSE/Accuracy:** Recommending a catalog of 100,000 items is a ranking problem, not a regression or binary classification problem. Predicting the exact rating a user gives is less important than ensuring the item they want to buy is in the Top 5 slots on their screen.
- **The Industry Standard:** We use **Top-K Ranking Metrics**:
  - **Hit Rate (HR@K):** Did the true next item appear anywhere in the Top K recommendations? (Measures recall).
  - **NDCG@K (Normalized Discounted Cumulative Gain):** Rewards the model heavily if the true item is at rank #1, and exponentially decays the reward if it's at rank #5 or #10. (Measures sorting quality).

*Defense Point:* By using HR@10 and NDCG@10, the project strictly follows the evaluation framework established by top-tier conferences (SIGIR, RecSys, KDD).

## 2. The Mandatory Baselines: Recency & Popularity
A common trap in academic theses is comparing an advanced model (SASRec) only to other advanced models (GRU4Rec, BERT4Rec). However, in production e-commerce, the most dangerous competitors are simple rules.
- **The POP Baseline (Popularity):** Always recommend the top 10 best-selling items globally.
- **The REC Baseline (Recency):** Always recommend the last 10 items the user just viewed.
- **Why this matters:** In real-world clickstream data, users frequently click an item, browse away, and return to buy that exact item. Therefore, **Recency** is an incredibly strong heuristic. 
- *Defense Point:* If SASRec cannot outperform the Recency baseline on HR@10 and NDCG@10, the deployment of a heavy Transformer architecture is unjustified. The project acknowledges this reality and uses these heuristics as the ultimate test of the AI's actual ROI.

## 3. Addressing "Popularity Bias" and Measuring "Coverage"
A major critique of Deep Learning recommendation models is that they often "cheat" to get high NDCG scores by simply memorizing and over-recommending popular items (Head items), while completely ignoring niche items (Long-tail items).
- **The Feedback Loop:** If the AI only recommends iPhones, more people click iPhones, making the AI think iPhones are even more relevant. The system degenerates into a POP baseline.
- **The Defense (Coverage@K):** To prove the model actually learned nuanced sequential patterns, we must measure **Catalog Coverage** (what percentage of the entire catalog did the AI recommend across all users?). 
- If SASRec has a high NDCG but a Coverage of only 2%, it is suffering from extreme Popularity Bias.
- By tracking and optimizing Coverage alongside NDCG, the project proves that the model is actively helping users discover the *long-tail* of the catalog, which is the true business value of a Recommendation Engine (increasing cross-sells and average order value).

## Conclusion for Thesis Defense
When asked *"How do you know your SASRec model is actually performing well and not just recommending bestsellers?"*
**Answer:** "High NDCG and Hit Rate alone do not prove a model's worth in e-commerce. To ensure our Transformer model wasn't just memorizing popular items, we evaluated it against strict non-ML baselines like Recency and Popularity. Furthermore, we monitor Coverage metrics to guarantee the model actively mitigates Popularity Bias, ensuring it recommends long-tail niche items that drive actual business discovery."

