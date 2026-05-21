from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer, util
import numpy as np
import re
import torch
import io
import base64
import os
import tempfile

app = Flask(__name__)
CORS(app)

print("Loading BERT model...")
model = SentenceTransformer('all-MiniLM-L6-v2')
print("Model loaded successfully!")

# ── Optional OCR dependencies (graceful fallback if missing) ──
try:
    import pdfplumber
    HAS_PDFPLUMBER = True
    print("pdfplumber available ✓")
except ImportError:
    HAS_PDFPLUMBER = False
    print("pdfplumber not installed — install with: pip install pdfplumber")

try:
    from pdf2image import convert_from_bytes
    import pytesseract
    HAS_OCR = True
    print("pdf2image + pytesseract available ✓")
except ImportError:
    HAS_OCR = False
    print("pdf2image/pytesseract not installed — OCR unavailable")

try:
    import requests as req_lib
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# ── Text helpers ──────────────────────────────────────────

STOPWORDS = set([
    "the","a","an","is","in","it","of","to","and","or","for","on",
    "at","by","as","be","was","are","were","been","that","this",
    "with","from","has","have","had","not","but","its","their",
    "they","we","our","you","your","he","she","his","her","which",
    "can","will","would","could","should","do","does","did","also",
    "may","into","than","then","so","if","all","any","about","up",
    "out","more","some","no","one","two","each","when","how","what"
])

def clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r'[^\w\s.,!?;:\'\"-]', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def split_sentences(text: str) -> list:
    if not text:
        return []
    text = re.sub(r'\n+', ' ', text)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    result = []
    for s in sentences:
        s = s.strip()
        words = s.split()
        if len(s) < 30 or len(words) < 7:
            continue
        content_words = [w for w in words if w.lower() not in STOPWORDS]
        if len(content_words) < 4:
            continue
        result.append(s)
    return result

def is_readable(text: str) -> bool:
    if not text or len(text.strip()) < 50:
        return False
    if text.startswith("["):
        return False
    words = text.split()
    if len(words) < 20:
        return False
    content = [w for w in words if w.lower() not in STOPWORDS and len(w) > 2]
    return len(content) >= 10

# ── PDF text extraction (server-side) ────────────────────

def extract_pdf_pdfplumber(pdf_bytes: bytes) -> str:
    """Extract text from digital PDF using pdfplumber (fast, accurate)."""
    try:
        text_pages = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                t = page.extract_text(x_tolerance=2, y_tolerance=2)
                if t and t.strip():
                    text_pages.append(t.strip())
        return "\n\n".join(text_pages).strip()
    except Exception as e:
        print(f"pdfplumber error: {e}")
        return ""

def extract_pdf_ocr(pdf_bytes: bytes) -> str:
    """OCR a scanned/image PDF using pdf2image + pytesseract."""
    try:
        images = convert_from_bytes(
            pdf_bytes,
            dpi=200,           # 200dpi is enough for student assignments
            fmt="jpeg",
            thread_count=2,
        )
        pages = []
        for img in images[:15]:  # limit to 15 pages
            text = pytesseract.image_to_string(
                img,
                lang="eng",    # English
                config="--psm 6 --oem 3",  # assume uniform block of text
            )
            if text.strip():
                pages.append(text.strip())
        return "\n\n".join(pages).strip()
    except Exception as e:
        print(f"OCR error: {e}")
        return ""

def extract_pdf_text(pdf_bytes: bytes) -> dict:
    """
    Extract text from a PDF.
    1. Try pdfplumber (digital PDF — fast)
    2. If text too short → try OCR (scanned PDF — slower)
    Returns { text, method }
    """
    text = ""
    method = "none"

    # Step 1: pdfplumber
    if HAS_PDFPLUMBER:
        text = extract_pdf_pdfplumber(pdf_bytes)
        if len(text.strip()) >= 50:
            method = "pdfplumber"
            print(f"  pdfplumber extracted {len(text)} chars")
            return {"text": text, "method": method}
        else:
            print(f"  pdfplumber got only {len(text)} chars — trying OCR")

    # Step 2: OCR fallback
    if HAS_OCR:
        print("  Running OCR (this may take 10-30s per doc)...")
        text = extract_pdf_ocr(pdf_bytes)
        if len(text.strip()) >= 50:
            method = "ocr"
            print(f"  OCR extracted {len(text)} chars")
            return {"text": text, "method": method}
        else:
            print(f"  OCR also got {len(text)} chars — document may be blank/corrupted")

    return {"text": text, "method": method}

# ── Document similarity (coverage-based) ─────────────────

def doc_similarity(text1: str, text2: str) -> float:
    sents1 = split_sentences(text1)[:60]
    sents2 = split_sentences(text2)[:60]
    if not sents1 or not sents2:
        return 0.0
    embs1 = model.encode(sents1, convert_to_tensor=True, normalize_embeddings=True, batch_size=32)
    embs2 = model.encode(sents2, convert_to_tensor=True, normalize_embeddings=True, batch_size=32)
    sim_matrix = util.cos_sim(embs1, embs2)
    HIGH_THRESHOLD = 0.85
    matched = sum(1 for i in range(len(sents1)) if float(torch.max(sim_matrix[i]).item()) >= HIGH_THRESHOLD)
    return max(0.0, min(1.0, matched / len(sents1)))

# ── Sentence matching ─────────────────────────────────────

def get_sentence_matches(target_text: str, source_text: str, source_regno: str, threshold: float = 0.85):
    target_sents = split_sentences(target_text)[:80]
    source_sents = split_sentences(source_text)[:80]
    if not target_sents or not source_sents:
        return []
    target_embs = model.encode(target_sents, convert_to_tensor=True, normalize_embeddings=True, batch_size=32)
    source_embs = model.encode(source_sents, convert_to_tensor=True, normalize_embeddings=True, batch_size=32)
    sim_matrix = util.cos_sim(target_embs, source_embs)
    matches = []
    for i, ts in enumerate(target_sents):
        best_j = int(torch.argmax(sim_matrix[i]).item())
        best_sim = float(sim_matrix[i][best_j].item())
        if best_sim >= threshold:
            matches.append({
                "sentence": ts,
                "matchedSentence": source_sents[best_j],
                "matchedRegno": source_regno,
                "similarity": round(best_sim * 100)
            })
    return matches

# ══════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "model": "all-MiniLM-L6-v2",
        "ocr": HAS_OCR,
        "pdfplumber": HAS_PDFPLUMBER,
    })

# ── NEW: Extract text from a PDF URL (called by edge function) ──
@app.route('/extract-pdf', methods=['POST'])
def extract_pdf_route():
    """
    Called by the edge function for docs whose browser extraction failed.
    Accepts:
      { docs: [{ id, file_url, register_number }] }
    Returns:
      { results: [{ id, text, method, register_number }] }
    """
    data = request.json
    docs = data.get('docs', [])

    if not docs:
        return jsonify({"error": "No docs provided"}), 400

    if not HAS_PDFPLUMBER and not HAS_OCR:
        return jsonify({"error": "No PDF extraction libraries installed on server"}), 503

    results = []

    for doc in docs:
        doc_id = doc.get('id')
        file_url = doc.get('file_url', '')
        regno = doc.get('register_number', 'Unknown')

        print(f"Extracting PDF for {regno}: {file_url}")

        if not file_url:
            results.append({"id": doc_id, "text": "", "method": "no_url", "register_number": regno})
            continue

        # Download the PDF
        try:
            if not HAS_REQUESTS:
                import urllib.request
                with urllib.request.urlopen(file_url, timeout=30) as resp:
                    pdf_bytes = resp.read()
            else:
                resp = req_lib.get(file_url, timeout=30)
                resp.raise_for_status()
                pdf_bytes = resp.content
        except Exception as e:
            print(f"  Download failed for {regno}: {e}")
            results.append({"id": doc_id, "text": "", "method": "download_failed", "register_number": regno})
            continue

        # Extract text
        extracted = extract_pdf_text(pdf_bytes)
        text = extracted["text"]
        method = extracted["method"]

        print(f"  {regno}: {method}, {len(text)} chars")
        results.append({
            "id": doc_id,
            "text": text,
            "method": method,
            "register_number": regno,
        })

    return jsonify({"results": results})

# ── Similarity comparison ─────────────────────────────────
@app.route('/similarity', methods=['POST'])
def similarity():
    data = request.json
    docs = data.get('docs', [])
    sentence_threshold = max(0.85, float(data.get('sentence_threshold', 0.85)))

    if len(docs) < 2:
        return jsonify({"error": "Need at least 2 documents"}), 400

    valid_docs = [d for d in docs if is_readable(d.get('text', ''))]

    if len(valid_docs) < 2:
        return jsonify({"error": f"Only {len(valid_docs)} readable docs. Need at least 2."}), 400

    print(f"Comparing {len(valid_docs)} docs with threshold={sentence_threshold}")

    results = []
    for doc in valid_docs:
        others = [d for d in valid_docs if d['id'] != doc['id']]
        max_sim = 0.0
        most_similar_id = None
        all_matches = {}

        for other in others:
            sim = doc_similarity(doc['text'], other['text'])
            print(f"  {doc.get('register_number')} vs {other.get('register_number')}: {sim:.3f}")
            if sim > max_sim:
                max_sim = sim
                most_similar_id = other['id']
            regno = other.get('register_number') or other.get('id', 'Unknown')
            matches = get_sentence_matches(doc['text'], other['text'], regno, sentence_threshold)
            for m in matches:
                key = m['sentence'][:80].lower().strip()
                if key not in all_matches or all_matches[key]['similarity'] < m['similarity']:
                    all_matches[key] = m

        score = min(100, round(max_sim * 100))
        sentence_matches = sorted(all_matches.values(), key=lambda x: -x['similarity'])[:50]
        print(f"  -> Score: {score}%, Sentences: {len(sentence_matches)}")

        results.append({
            "id": doc['id'],
            "register_number": doc.get('register_number', 'Unknown'),
            "submitted_at": doc.get('submitted_at', ''),
            "score": score,
            "most_similar_id": most_similar_id,
            "sentence_matches": sentence_matches,
        })

    return jsonify({"results": results})
# ── Root route ────────────────────────────────────────────
@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "status": "ok",
        "message": "DocScan BERT API is running!",
        "routes": ["/health", "/similarity", "/compare-group", "/extract-pdf"]
    })

# ── compare-group (called by Supabase edge function) ──────
@app.route('/compare-group', methods=['POST'])
def compare_group():
    data = request.json
    docs = data.get('docs', [])
    sentence_threshold = float(data.get('sentence_threshold', 0.75))

    if len(docs) < 2:
        return jsonify({"error": "Need at least 2 documents"}), 400

    valid_docs = [d for d in docs if is_readable(d.get('text', ''))]
    if len(valid_docs) < 2:
        return jsonify({"results": []})

    results = []
    for doc in valid_docs:
        others = [d for d in valid_docs if d['id'] != doc['id']]
        max_sim = 0.0
        most_similar_id = None
        all_matches = {}

        for other in others:
            sim = doc_similarity(doc['text'], other['text'])
            if sim > max_sim:
                max_sim = sim
                most_similar_id = other['id']
            regno = other.get('register_number') or other.get('id', 'Unknown')
            matches = get_sentence_matches(
                doc['text'], other['text'], regno, sentence_threshold
            )
            for m in matches:
                key = m['sentence'][:80].lower().strip()
                if key not in all_matches or all_matches[key]['similarity'] < m['similarity']:
                    all_matches[key] = m

        score = min(100, round(max_sim * 100))
        sentence_matches = sorted(
            all_matches.values(), key=lambda x: -x['similarity']
        )[:50]

        results.append({
            "id": doc['id'],
            "register_number": doc.get('register_number', 'Unknown'),
            "submitted_at": doc.get('submitted_at', ''),
            "score": score,
            "most_similar_id": most_similar_id,
            "sentence_matches": sentence_matches,
        })

    return jsonify({"results": results})
# ── Start ─────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n" + "="*50)
    print("DocScan BERT API — http://0.0.0.0:5000")
    print(f"OCR support:        {'YES (pdf2image + pytesseract)' if HAS_OCR else 'NO  — install: pip install pdf2image pytesseract'}")
    print(f"PDF text extract:   {'YES (pdfplumber)' if HAS_PDFPLUMBER else 'NO  — install: pip install pdfplumber'}")
    print("="*50 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
