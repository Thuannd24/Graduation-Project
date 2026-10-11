# Academic Defense: Churn Risk Math, Isotonic Regression & Expected Loss

*Target: Defending the use of Probability Calibration (Isotonic Regression) and Expected Loss over standard classification metrics (Accuracy/F1).*
*Context: The project explicitly states that Isotonic Regression reduced the ECE (Expected Calibration Error) from 0.1797 to 0.0391, and uses Expected Loss to trigger Camunda workflows.*

## 1. The Base-Rate Fallacy in Churn Prediction
Churn is inherently an **imbalanced classification problem** (e.g., only 5% of users churn, 95% stay). To make machine learning models learn anything, data scientists often use techniques like SMOTE (oversampling the minority class) or class weights.
- **The Mathematical Trap:** When you oversample churners to a 50/50 ratio, you distort the prior probability (the base rate). A model trained on this data might output a "score" of 0.6. If you interpret this as a 60% probability of churn, you fall into the **Base-Rate Fallacy**. In reality, because the true base rate is only 5%, that 0.6 score might correspond to a true real-world probability of just 15%.
- **The Business Impact:** If marketing treats that 15% risk as a 60% risk, they will waste massive amounts of money giving discounts to users who were likely going to stay anyway.

## 2. Why Isotonic Regression?
To convert the model's abstract "scores" into **True Probabilities**, we must perform **Probability Calibration**.
- **Platt Scaling (Sigmoid):** Assumes the scores follow a strict S-curve (logistic distribution). Often fails on tree-based models (Random Forest, XGBoost) which push scores away from 0 and 1.
- **Isotonic Regression:** A non-parametric approach. It fits a strictly non-decreasing, piecewise-constant function (a step function) to the data. It maps the raw scores to the actual empirical frequency of churn observed in a hold-out validation set.
- **Defense Point:** By applying Isotonic Regression, the project successfully reduced the ECE (Expected Calibration Error) from 0.1797 (uncalibrated) to 0.0391. This proves mathematically that if the calibrated model now says "70% probability," the business can trust that exactly 7 out of 10 such users will actually churn.

## 3. Expected Loss: The Ultimate Business Objective
In academia, models are evaluated by ROC-AUC, F1-Score, or Accuracy. In E-commerce production, these metrics are insufficient because they treat all customers equally. Losing a customer who spends \$10 is treated the same as losing a customer who spends \$1,000.

**The Expected Loss (EL) Formula:**
$$ \text{Expected Loss} = P(\text{Churn}) \times \text{Customer Value (Monetary)} $$
*Where $P(\text{Churn})$ is the strictly calibrated probability.*

**Why this is the pinnacle of MLOps Architecture:**
Instead of setting an arbitrary threshold (e.g., "target anyone with $P > 0.5$"), the system calculates the Expected Loss in currency (e.g., VND or USD). 
- If $EL > \text{Cost of Campaign}$, the system triggers an intervention.
- The project implements this flawlessly by piping the Expected Loss values into **Kafka**, which triggers **Camunda** (a BPMN engine) to execute the Next-Best-Action (sending vouchers, emails). 

## Conclusion for Thesis Defense
When asked *"Why did you spend time on Calibration instead of just using a deeper Neural Network for Churn?"*
**Answer:** "A more complex model might improve AUC slightly, but its raw outputs are still distorted by the base-rate fallacy of imbalanced data. In a business context, an uncalibrated score is unusable for financial ROI calculations. By applying Isotonic Regression, we minimized the Expected Calibration Error (ECE) to 0.0391. This allowed us to calculate a mathematically sound Expected Loss, ensuring that our automated Camunda workflows only spend marketing budget where the ROI is positive."

