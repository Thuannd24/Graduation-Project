# Academic Defense: Churn Risk Math, Isotonic Regression & Expected Loss

> **Ghi chú tham khảo do AI tổng hợp — không phải mô tả hệ thống, không dùng làm trích dẫn.**

*Target: Defending the use of Probability Calibration (Isotonic Regression) and Expected Loss over standard classification metrics (Accuracy/F1).*
*Context: The project measured isotonic calibration reducing ECE from 0.1797 to 0.0391 (run 2026-07-31 on synthetic data — see comment in `app/training/train.py`), and uses Expected Loss to rank which at-risk users get a Camunda workflow.*

## 1. The Base-Rate Fallacy in Churn Prediction
Churn is inherently an **imbalanced classification problem** (e.g., only 5% of users churn, 95% stay). To make machine learning models learn anything, data scientists often use techniques like SMOTE (oversampling the minority class) or class weights.
- **The Mathematical Trap:** When you oversample churners to a 50/50 ratio, you distort the prior probability (the base rate). A model trained on this data might output a "score" of 0.6. If you interpret this as a 60% probability of churn, you fall into the **Base-Rate Fallacy**. In reality, because the true base rate is only 5%, that 0.6 score might correspond to a true real-world probability of just 15%.
- **The Business Impact:** If marketing treats that 15% risk as a 60% risk, they will waste massive amounts of money giving discounts to users who were likely going to stay anyway.

## 2. Why Isotonic Regression?
To convert the model's abstract "scores" into **True Probabilities**, we must perform **Probability Calibration**.
- **Platt Scaling (Sigmoid):** Assumes the scores follow a strict S-curve (logistic distribution). Often fails on tree-based models (Random Forest, XGBoost) which push scores away from 0 and 1.
- **Isotonic Regression:** A non-parametric approach. It fits a strictly non-decreasing, piecewise-constant function (a step function) to the data. It maps the raw scores to the actual empirical frequency of churn observed in a hold-out validation set.
- **Defense Point:** By applying Isotonic Regression, the project successfully reduced the ECE (Expected Calibration Error) from 0.1797 (uncalibrated) to 0.0391. Calibration means that, **on average**, among users scored around 70% roughly 7 in 10 churn — a statement about frequencies over groups (with residual error measured by ECE), not a guarantee that exactly 7 of any 10 users will churn.

## 3. Expected Loss: The Ultimate Business Objective
In academia, models are evaluated by ROC-AUC, F1-Score, or Accuracy. In E-commerce production, these metrics are insufficient because they treat all customers equally. Losing a customer who spends \$10 is treated the same as losing a customer who spends \$1,000.

**The Expected Loss (EL) Formula:**
$$ \text{Expected Loss} = P(\text{Churn}) \times \text{Customer Value (Monetary)} $$
*Where $P(\text{Churn})$ is the strictly calibrated probability.*

**Why this is the pinnacle of MLOps Architecture:**
Instead of setting an arbitrary threshold (e.g., "target anyone with $P > 0.5$"), the system calculates the Expected Loss in currency (e.g., VND or USD). 
- In general theory, one would trigger an intervention when $EL > \text{Cost of Campaign}$.
- **What the project's code actually does** (`risk_scoring.py`, `risk_scheduler.py`): `expected_loss = churn_probability × monetary` (monetary = total value of DELIVERED orders, a spend proxy). Users must pass segment = "At Risk", calibrated probability ≥ threshold, and an abandoned cart in the last 24h; the survivors are **sorted by expected loss and cut at a fixed budget** (`RISK_MAX_VOUCHERS_PER_SCAN`, default 50), then published to **Kafka** → **Camunda**. There is **no campaign cost / ROI term** in the code.

## Conclusion for Thesis Defense
When asked *"Why did you spend time on Calibration instead of just using a deeper Neural Network for Churn?"*
**Answer:** "A more complex model might improve AUC slightly, but its raw outputs are still distorted by the base-rate fallacy of imbalanced data. In a business context, an uncalibrated score is unusable for financial ROI calculations. By applying Isotonic Regression, we minimized the Expected Calibration Error (ECE) to 0.0391. This allowed us to rank users by Expected Loss (probability × spend), so a fixed voucher budget goes to the customers whose loss would hurt most. We do not model campaign cost or ROI — that would need outcome data we do not have."

