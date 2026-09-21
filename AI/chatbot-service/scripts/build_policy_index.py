"""
Build a FAISS vector index over data/policies/*.md for the Policy RAG.

Usage:
    python scripts/build_policy_index.py

Rerun whenever a policy .md file changes — this fully rebuilds the index.
"""
import json
import os
import re
import sys

import faiss
from sentence_transformers import SentenceTransformer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.config import chatbot_settings

CHUNK_WORDS = 450
OVERLAP_WORDS = 80

TITLE_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)
CATEGORY_RE = re.compile(r"^>\s*\*\*Danh mục:\*\*\s*(.+)$", re.MULTILINE)
H2_SPLIT_RE = re.compile(r"^##\s+(.+)$", re.MULTILINE)


def load_markdown_files(policies_dir: str):
    for filename in sorted(os.listdir(policies_dir)):
        if not filename.endswith(".md"):
            continue
        path = os.path.join(policies_dir, filename)
        with open(path, "r", encoding="utf-8") as f:
            yield filename[:-3], f.read()


def parse_sections(slug: str, raw_text: str):
    title_match = TITLE_RE.search(raw_text)
    title = title_match.group(1).strip() if title_match else slug

    category_match = CATEGORY_RE.search(raw_text)
    category = category_match.group(1).strip() if category_match else "Khác"

    # Body = everything after the first "---" divider (drops title/metadata blockquote)
    body = raw_text.split("---", 1)[1] if "---" in raw_text else raw_text

    headings = list(H2_SPLIT_RE.finditer(body))
    if not headings:
        return [{"heading": title, "text": body.strip()}], title, category

    sections = []
    for i, match in enumerate(headings):
        start = match.end()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(body)
        heading_text = match.group(1).strip()
        section_text = body[start:end].strip()
        if section_text:
            sections.append({"heading": heading_text, "text": section_text})
    return sections, title, category


def chunk_words(text: str, chunk_size: int, overlap: int):
    words = text.split()
    if len(words) <= chunk_size:
        return [text]
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start = end - overlap
    return chunks


def build_chunks(policies_dir: str):
    chunks = []
    for slug, raw_text in load_markdown_files(policies_dir):
        sections, title, category = parse_sections(slug, raw_text)
        for section in sections:
            for piece in chunk_words(section["text"], CHUNK_WORDS, OVERLAP_WORDS):
                chunks.append({
                    "slug": slug,
                    "title": title,
                    "category": category,
                    "heading": section["heading"],
                    "text": piece,
                })
    return chunks


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    policies_dir = os.path.join(base_dir, chatbot_settings.POLICY_DATA_DIR)
    index_dir = os.path.join(base_dir, chatbot_settings.POLICY_INDEX_DIR)
    os.makedirs(index_dir, exist_ok=True)

    print(f"Reading policy markdown files from {policies_dir} ...")
    chunks = build_chunks(policies_dir)
    print(f"Built {len(chunks)} chunks from policy files.")

    print(f"Loading embedding model '{chatbot_settings.POLICY_EMBEDDING_MODEL}' ...")
    model = SentenceTransformer(chatbot_settings.POLICY_EMBEDDING_MODEL)

    passages = [f"passage: {c['title']} - {c['heading']}\n{c['text']}" for c in chunks]
    print("Encoding chunks...")
    embeddings = model.encode(passages, normalize_embeddings=True, show_progress_bar=True)

    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings)

    index_path = os.path.join(index_dir, "policy.index")
    meta_path = os.path.join(index_dir, "policy_meta.json")
    faiss.write_index(index, index_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False, indent=2)

    print(f"Saved FAISS index to {index_path}")
    print(f"Saved chunk metadata to {meta_path}")


if __name__ == "__main__":
    main()
