# Academic Defense: SASRec Math & Optimization (Sampled Softmax vs BCE)

*Target: Defending the Loss Function and Negative Sampling strategies in the SASRec implementation.*
*Context: The project explicitly uses "Sampled Softmax (không BCE) — tránh overconfidence đã ghi nhận ở gSASRec".*

## 1. The Bottleneck of Full Cross-Entropy (CE) Loss
In standard classification tasks (like predicting the next word in NLP), models use **Full Cross-Entropy (CE) Loss**. This requires computing the probability of *every* possible class (using Softmax) and penalizing the model.
- **The Problem in E-commerce:** NLP has a vocabulary of ~50,000 words. An e-commerce catalog can have millions of products. Computing $e^{x}$ for 1,000,000 items at every single sequence step, for every user, in every epoch, requires massive VRAM and computational power. It is mathematically intractable for standard hardware (especially CPU-only environments like Intel UHD).
- **The Solution:** We must approximate this distribution. We do this by evaluating the true next item against a small subset of "Negative Samples" (items the user did *not* interact with).

## 2. Binary Cross-Entropy (BCE) vs. Softmax
The original SASRec paper (Kang & McAuley, 2018) proposed using **Binary Cross-Entropy (BCE) with 1 Negative Sample**. 
- *How it works:* The model predicts a score for the true item ($S_{pos}$) and a score for one random item ($S_{neg}$). It applies a Sigmoid function and uses BCE to push $S_{pos} \to 1$ and $S_{neg} \to 0$.

### Why BCE Fails in Practice (The "Overconfidence" Problem)
Recent academic papers (notably research around **gSASRec** and comparisons with BERT4Rec) have exposed a fatal flaw in BCE with simple negative sampling:
1. **Distribution Skew:** In reality, a user interacts with 1 out of 100,000 items. But under BCE with 1 negative sample, the model sees a world where 50% of items are positive and 50% are negative.
2. **Overconfidence:** Because the task is artificially easy, the model becomes wildly "overconfident". It pushes the probability of the positive item to 0.999 very quickly. 
3. **Loss of Ranking Nuance:** Because the model thinks it's already "perfect", the gradients vanish. It stops learning the subtle differences between a "good" recommendation and a "great" recommendation. This is why original SASRec often loses to BERT4Rec in Top-10 ranking metrics.

## 3. The Superiority of Sampled Softmax (The Project's Choice)
To solve the overconfidence problem without blowing up RAM, the project implements **Sampled Softmax with $N$ negatives** (e.g., $N=50$ or $256$).

**The Mathematical Mechanism:**
Instead of treating the problem as $N$ independent Binary classifications, we treat it as a **Multi-class classification over a restricted set**.
The loss function becomes:
$$ \mathcal{L} = -\log \left( \frac{\exp(S_{pos})}{\exp(S_{pos}) + \sum_{j=1}^{N} \exp(S_{neg, j})} \right) $$

**Why this wins in a Thesis Defense:**
1. **Prevents Overconfidence:** The model is no longer predicting independent Sigmoids. It must allocate a total probability of 1.0 across the positive item AND the $N$ negative items. It forces the model to constantly push $S_{pos}$ higher than all $S_{neg}$ simultaneously, maintaining healthy gradients.
2. **Computational Feasibility:** By restricting the denominator to $1 + N$ items (instead of the entire catalog), the matrix multiplication $O(B \times L \times |I|)$ drops to $O(B \times L \times N)$, allowing the model to train efficiently on a CPU.
3. **Academic Alignment:** This perfectly aligns with findings that Cross-Entropy fundamentally outperforms BCE for ranking tasks. Sampled Softmax acts as a highly efficient estimator of Full CE (approximating Scalable Cross Entropy - SCE).

## Conclusion for Thesis Defense
If asked *"Why didn't you just use the standard loss function from the original SASRec paper?"*
**Answer:** "The original paper used BCE with 1 negative sample, which recent literature proves leads to overconfidence and poor fine-grained ranking (as noted in gSASRec studies). We upgraded the architecture to use Sampled Softmax with multiple negatives. This approximates the superior Full Cross-Entropy loss used by BERT4Rec, delivering better Top-K ranking accuracy while keeping memory usage strictly bounded, allowing the model to train successfully on CPU."

