# Academic Defense: Architecture Choices in Sequential Recommendation

*Target: Defending the use of SASRec over RNNs/Matrix Factorization, and explaining Causal Masking.*
*Core Paper: "Self-Attentive Sequential Recommendation" (Kang & McAuley, ICDM 2018).*

## 1. Why SASRec? (Overcoming the Limits of MC and RNN)
Before SASRec, sequential recommendation was dominated by two paradigms:
1. **Markov Chains (MCs):** Assumes the next action depends *only* on the immediately preceding action (or a very short window). Excellent for high-sparsity datasets but fails to capture long-term user preferences.
2. **Recurrent Neural Networks (RNNs / GRU4Rec):** Uses a hidden state passed step-by-step to capture the entire sequence. However, RNNs struggle with the "vanishing gradient" on long sequences and are inherently sequential, making them impossible to parallelize during training. Furthermore, RNNs often overfit in highly sparse e-commerce environments.

**The SASRec Breakthrough:** 
SASRec abandons recurrence entirely in favor of the **Transformer's Self-Attention mechanism**. By calculating attention scores between *all* items in the sequence simultaneously, SASRec:
- Captures long-range dependencies as effectively as RNNs.
- Is highly parallelizable, training up to an order of magnitude faster than GRU4Rec.
- Dynamically shifts its "attention" based on data density: on sparse datasets, it acts like an MC (focusing only on recent items); on dense datasets, it focuses across the entire sequence.

## 2. The Absolute Necessity of Causal Masking
The Transformer architecture (as originally designed for translation) is bidirectional. It looks at the entire sentence (past and future words) to understand context.

However, in **Sequential Recommendation**, the arrow of time is strictly unidirectional. If the model is trying to predict the user's action at time $t+1$, it **must not** have access to any interactions that occurred at $t+1, t+2$, etc. 

**Causal Masking (or Future Masking)** solves this:
- Inside the Self-Attention block, before the Softmax function is applied, the attention score matrix is masked. 
- Any connection from a current position $t$ to a future position $t_k$ (where $t_k > t$) is overridden with $-\infty$. 
- When Softmax is applied, $e^{-\infty} = 0$, meaning the attention weight becomes exactly zero. 
- *Defense Point:* Without Causal Masking, the model suffers from massive **Information Leakage** during training. It would achieve near 100% accuracy offline by "peeking" at the answer, but completely fail in production where the future is genuinely unknown.

## 3. Position Embeddings in Sequence
Unlike NLP where words have strict grammatical rules, user clicks are noisy. Yet, the *order* matters immensely. Because Self-Attention operations are permutation-invariant (they don't inherently know which item came first), SASRec explicitly adds **Learnable Positional Embeddings** to the item embeddings at the input layer. This allows the model to differentiate between "an item viewed 1 step ago" vs. "an item viewed 20 steps ago".

## Conclusion for Thesis Defense
When defending the choice of SASRec:
1. **Efficiency vs GRU4Rec:** State that SASRec parallelizes computation across the sequence, bypassing the step-by-step bottleneck of RNNs.
2. **Versatility vs Matrix Factorization:** State that MF ignores the sequence entirely. SASRec leverages exact temporal order, which is critical for identifying session-based intent (e.g., browsing phones -> browsing phone cases).
3. **Validity:** Emphasize that Causal Masking guarantees the model is evaluated fairly, preventing future-data leakage during the training phase.

