// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

function ok(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS });
}

// ── Fallback TF-IDF (when BERT unavailable) ───────────────
function getWords(t) {
  if (!t || typeof t !== "string") return [];
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
}
function buildVec(t) {
  const ws = getWords(t); const f = {};
  ws.forEach(w => (f[w] = (f[w] || 0) + 1));
  const n = ws.length || 1;
  Object.keys(f).forEach(k => (f[k] /= n));
  return f;
}
function cosine(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, na = 0, nb = 0;
  keys.forEach(k => { const va = a[k]||0, vb = b[k]||0; dot+=va*vb; na+=va*va; nb+=vb*vb; });
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
function overlapCoeff(a, b) {
  const sa = new Set(getWords(a)), sb = new Set(getWords(b));
  if (!sa.size || !sb.size) return 0;
  let inter = 0; sa.forEach(w => { if (sb.has(w)) inter++; });
  return inter / Math.min(sa.size, sb.size);
}
function splitSentences(text) {
  if (!text || typeof text !== "string") return [];
  try {
    return text.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/)
      .map(s => s.trim()).filter(s => s.length > 15 && getWords(s).length >= 4);
  } catch { return []; }
}
function isReadable(text) {
  return text && typeof text === "string" && text.trim().length > 30 && !text.startsWith("[");
}

// ── BERT API calls ────────────────────────────────────────
async function bertCompareGroup(docs, bertUrl) {
  try {
    const res = await fetch(`${bertUrl}/compare-group`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docs, sentence_threshold: 0.75 }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.results || null;
  } catch (e) {
    console.log("BERT unavailable, falling back to TF-IDF:", e.message);
    return null;
  }
}

// ── TF-IDF fallback comparison ────────────────────────────
function tfidfCompareGroup(docs) {
  return docs.map(doc => {
    const others = docs.filter(d => d.id !== doc.id);
    let maxSim = 0, mostSimilarId = null;
    const sentMap = new Map();
    const docSents = splitSentences(doc.text);

    for (const other of others) {
      const sim = Math.max(cosine(buildVec(doc.text), buildVec(other.text)), overlapCoeff(doc.text, other.text));
      if (sim > maxSim) { maxSim = sim; mostSimilarId = other.id; }

      const otherSents = splitSentences(other.text);
      const otherRegno = other.register_number || "Unknown";
      for (const ts of docSents) {
        let best = 0;
        for (const ss of otherSents) {
          const s = Math.max(cosine(buildVec(ts), buildVec(ss)), overlapCoeff(ts, ss));
          if (s > best) best = s;
        }
        if (best >= 0.50) {
          const key = ts.substring(0, 80).toLowerCase().trim();
          const ex = sentMap.get(key);
          if (!ex || ex.similarity < best) sentMap.set(key, { sentence: ts, matchedRegno: otherRegno, similarity: Math.round(best * 100) });
        }
      }
    }

    return {
      id: doc.id,
      register_number: doc.register_number,
      submitted_at: doc.submitted_at,
      score: Math.min(100, Math.round(maxSim * 100)),
      most_similar_id: mostSimilarId,
      sentence_matches: Array.from(sentMap.values()).sort((a, b) => b.similarity - a.similarity).slice(0, 50),
    };
  });
}

// ── Main ──────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });

  try {
    let body;
    try { body = await req.json(); } catch { return ok({ success: false, message: "Invalid JSON", results: [] }); }

    const { slot_title } = body;
    if (!slot_title) return ok({ success: false, message: "slot_title required", results: [] });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_KEY) return ok({ success: false, message: "Supabase env missing", results: [] });

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Fetch slot to check if all students submitted
    const { data: slot } = await supabase
      .from("assignment_slots")
      .select("*")
      .eq("title", slot_title)
      .maybeSingle();

    // Fetch all submissions for this slot
    const { data: allDocs, error: fetchErr } = await supabase
      .from("assignments")
      .select("id, extracted_text, file_name, register_number, user_id, created_at, title")
      .eq("title", slot_title)
      .order("created_at", { ascending: true });

    if (fetchErr) return ok({ success: false, message: fetchErr.message, results: [] });
    if (!allDocs || allDocs.length === 0) return ok({ success: true, message: "No submissions found", results: [], score: 0 });

    const maxStudents = slot?.max_students || 0;
    const submitted = allDocs.length;

    // RULE: Cannot check until ALL students submit
    if (maxStudents > 0 && submitted < maxStudents) {
      return ok({
        success: false,
        locked: true,
        message: `Only ${submitted}/${maxStudents} students have submitted. Similarity check is locked until all ${maxStudents} students submit.`,
        results: [],
        score: 0,
        submitted,
        maxStudents,
      });
    }

    const readableDocs = allDocs.filter(d => isReadable(d.extracted_text));

    if (readableDocs.length < 2) {
      return ok({
        success: true,
        message: `Only ${readableDocs.length} readable document(s). Need at least 2 to compare.`,
        results: [], score: 0,
      });
    }

    // Prepare docs for comparison
    const docsForComparison = readableDocs.map(d => ({
      id: d.id,
      text: d.extracted_text,
      register_number: d.register_number || "Unknown",
      submitted_at: d.created_at,
    }));

    // Try BERT first, fallback to TF-IDF
    const bertUrl = Deno.env.get("BERT_API_URL") || null;
    let comparisonResults = null;
    let method = "tfidf";

    if (bertUrl) {
      console.log("Trying BERT at:", bertUrl);
      comparisonResults = await bertCompareGroup(docsForComparison, bertUrl);
      if (comparisonResults) method = "bert";
    }

    if (!comparisonResults) {
      console.log("Using TF-IDF fallback");
      comparisonResults = tfidfCompareGroup(docsForComparison);
    }

    // Save scores back to DB
    const results = [];
    for (const cr of comparisonResults) {
      try {
        await supabase.from("assignments")
          .update({ similarity_score: cr.score, similar_to: cr.most_similar_id })
          .eq("id", cr.id);
      } catch {}

      // Find original doc data
      const originalDoc = allDocs.find(d => d.id === cr.id);
      results.push({
        assignment_id: cr.id,
        register_number: cr.register_number,
        file_name: originalDoc?.file_name || "",
        submitted_at: cr.submitted_at,
        score: cr.score,
        sentence_matches: cr.sentence_matches || [],
        extracted_text: originalDoc?.extracted_text || "",
        method,
      });
    }

    // Sort by submission time — earliest first (original, not plagiarized)
    results.sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());

    const overallScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
      : 0;

    return ok({
      success: true,
      score: overallScore,
      results,
      method,
      submitted,
      maxStudents,
    });

  } catch (topErr) {
    console.error("Top error:", topErr);
    return ok({ success: false, message: topErr instanceof Error ? topErr.message : "Unknown error", results: [], score: 0 });
  }
});