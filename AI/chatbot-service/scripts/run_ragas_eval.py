"""
Offline RAGAS evaluation for the Policy RAG pipeline, using the
policy_faq questions (with clean ground_truth text) from
data/test-qa-dataset.md.

Answer generation uses this service's own DeepSeek-backed LLM client
(app/services/llm_client.py). By default RAGAS itself needs an OpenAI
key for its judge LLM — pass a different judge via ragas' LLM wrapper
if you don't have one.

Usage:
    python scripts/run_ragas_eval.py [--limit N]
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.rag import policy_rag_service, product_rag_service
from app.services.prompt import prompt_builder_service

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_FILE = os.path.join(BASE_DIR, "data", "test-qa-dataset.md")

SECTION_RE = re.compile(r"## INTENT 1: policy_faq.*?\n(.*?)\n---", re.DOTALL)
ROW_RE = re.compile(r"^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$", re.MULTILINE)


def load_policy_faq_qna():
    with open(DATASET_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    section_match = SECTION_RE.search(content)
    if not section_match:
        raise RuntimeError("Could not find the policy_faq section in test-qa-dataset.md")

    rows = []
    for match in ROW_RE.finditer(section_match.group(1)):
        _, question, ground_truth = match.groups()
        if question == "Câu hỏi":  # header row
            continue
        rows.append({"question": question.strip(), "ground_truth": ground_truth.strip()})
    return rows


def answer_question(question: str):
    items = policy_rag_service.retrieve(question)
    contexts = [item["text"] for item in items]
    context_str = policy_rag_service.format_context_string(items)
    max_score = max((item["score"] for item in items), default=0.0)
    confidence = policy_rag_service.classify_confidence(max_score)

    system_prompt = prompt_builder_service.build_system_prompt(
        "Khách hàng", context_str, confidence=confidence
    )

    answer = product_rag_service.generate_reply(system_prompt, [], question)
    return answer, contexts


def build_eval_rows(qna_rows):
    results = []
    for i, row in enumerate(qna_rows):
        print(f"[{i + 1}/{len(qna_rows)}] {row['question']}")
        answer, contexts = answer_question(row["question"])
        results.append({
            "question": row["question"],
            "answer": answer,
            "contexts": contexts if contexts else [""],
            "ground_truth": row["ground_truth"],
        })
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Only evaluate the first N questions")
    args = parser.parse_args()

    qna_rows = load_policy_faq_qna()
    if args.limit:
        qna_rows = qna_rows[: args.limit]
    print(f"Loaded {len(qna_rows)} policy_faq questions from test-qa-dataset.md")

    eval_rows = build_eval_rows(qna_rows)

    from datasets import Dataset
    from ragas import evaluate
    from ragas.metrics import faithfulness, answer_relevancy, context_recall

    dataset = Dataset.from_list(eval_rows)
    results = evaluate(dataset, metrics=[faithfulness, answer_relevancy, context_recall])
    print("\n=== RAGAS Results ===")
    print(results)


if __name__ == "__main__":
    main()
