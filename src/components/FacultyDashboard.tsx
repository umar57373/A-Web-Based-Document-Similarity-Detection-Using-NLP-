// @ts-nocheck
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText, Users, CheckCircle, AlertTriangle, Loader2, ExternalLink,
  PlusCircle, Star, X, ChevronDown, ChevronUp, Search, Download,
  BarChart2, RefreshCw, Filter, Lock, Clock, Edit2, Eye, Key, Shield, Trash2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";

const exportToCSV = (assignments: any[]) => {
  const headers = ["Title","Student","Register No","File","Similarity %","Faculty Score","Remarks","Submitted"];
  const rows = assignments.map(a => [
    `"${a.title}"`,`"${a.profile?.full_name||a.profile?.email||"Unknown"}"`,
    `"${a.register_number||""}"`,`"${a.file_name||""}"`,
    a.similarity_score??"",a.faculty_score??"",
    `"${a.faculty_remarks||""}"`,`"${new Date(a.created_at).toLocaleDateString()}"`,
  ]);
  const csv=[headers.join(","),...rows.map(r=>r.join(","))].join("\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;
  a.download=`submissions_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();URL.revokeObjectURL(url);
};

// ── Turnitin highlighter ──────────────────────────────────
const TurnitinHighlight = ({ text, sentenceMatches }: { text: string; sentenceMatches: any[] }) => {
  if (!text || text.startsWith("[")) {
    return <p className="text-xs text-muted-foreground italic">Text preview unavailable for scanned documents.</p>;
  }

  const matches = sentenceMatches || [];

  // Build lookup map: sentence text → { regno, similarity }
  const matchMap = new Map<string, { regno: string; similarity: number }>();
  for (const m of matches) {
    if (m.sentence && m.sentence.trim().length > 10) {
      matchMap.set(m.sentence.trim(), { regno: m.matchedRegno, similarity: m.similarity });
    }
  }

  if (matchMap.size === 0) {
    const clean = text.replace(/\n+/g, " ").trim();
    return (
      <div className="text-sm leading-7 text-foreground">
        {clean.substring(0, 2000)}
        {clean.length > 2000 && <span className="text-muted-foreground">…</span>}
        <p className="mt-3 text-xs text-muted-foreground italic border-t pt-2">
          No similar sentences detected above threshold.
        </p>
      </div>
    );
  }

  // Tokenise into sentences for rendering
  const flatText = text.replace(/\n+/g, " ").trim();
  const rawSentences = flatText.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 8);

  // Find match for a rendered sentence
  const findMatch = (sentence: string): { regno: string; similarity: number } | null => {
    // 1. Exact match
    if (matchMap.has(sentence)) return matchMap.get(sentence)!;
    // 2. Stored sentence contained in rendered, or vice versa (first 55 chars)
    for (const [stored, val] of matchMap.entries()) {
      const a = sentence.substring(0, 55).toLowerCase().trim();
      const b = stored.substring(0, 55).toLowerCase().trim();
      if (a === b && a.length > 15) return val;
      if (a.length > 20 && stored.toLowerCase().includes(a.substring(0, 40))) return val;
    }
    return null;
  };

  return (
    <div className="text-sm leading-8 select-text">
      {rawSentences.slice(0, 150).map((sentence, i) => {
        const match = findMatch(sentence);
        if (match) {
          return (
            <span key={i} className="relative group inline">
              <mark style={{
                backgroundColor: "#fee2e2",
                borderBottom: "2px solid #ef4444",
                borderRadius: "2px",
                padding: "0 2px",
                cursor: "pointer",
              }}>
                {sentence}
              </mark>
              {/* Hover tooltip */}
              <span style={{
                position: "absolute", bottom: "110%", left: 0, zIndex: 60,
                backgroundColor: "#1f2937", color: "white", borderRadius: "7px",
                padding: "7px 12px", fontSize: "11px", whiteSpace: "nowrap",
                boxShadow: "0 6px 20px rgba(0,0,0,0.35)", pointerEvents: "none",
                display: "none", minWidth: "180px",
              }} className="group-hover:!block">
                <span style={{ color: "#f87171", fontWeight: "700" }}>⚠ Matches #{match.regno}</span>
                <br />
                <span style={{ color: "#d1d5db" }}>{match.similarity}% similarity</span>
              </span>
              {" "}
            </span>
          );
        }
        return <span key={i} className="text-foreground">{sentence} </span>;
      })}
    </div>
  );
};

// ── Similarity report panel ───────────────────────────────
const SimilarityReport = ({ results }: { results: any[] }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (!results || results.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">No results yet.</p>;

  return (
    <div className="space-y-4 mt-2">
      {/* Time inference tip */}
      <div className="flex items-start gap-2 text-xs bg-blue-50 border border-blue-200 rounded-lg p-3">
        <Clock className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <span className="text-blue-800">
          <strong>Authorship inference:</strong> The student who submitted <strong>earliest</strong> is treated as the original author.
          High-score students who submitted <strong>later</strong> may have copied.
        </span>
      </div>

      {/* Results table */}
      <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              {["#","Reg No","File","Submitted At","Score","Verdict","Report"].map(h => (
                <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r, idx) => {
              const isFirst = idx === 0;
              const score = r.score ?? 0;
              const extractionFailed = r.extraction_failed === true;
              const verdict = extractionFailed
                ? { label: "⚠ No text", cls: "bg-gray-100 text-gray-600 border-gray-300" }
                : score < 20
                ? { label: "✅ Original", cls: "bg-green-100 text-green-700 border-green-300" }
                : score < 50
                  ? { label: "⚠ Moderate", cls: "bg-yellow-100 text-yellow-700 border-yellow-300" }
                  : isFirst
                    ? { label: "📄 Source", cls: "bg-orange-100 text-orange-700 border-orange-300" }
                    : { label: "🚨 Copied", cls: "bg-red-100 text-red-700 border-red-300" };
              return (
                <tr key={r.assignment_id} className={`border-t border-border hover:bg-muted/20 ${isFirst ? "bg-green-50/30" : ""} ${extractionFailed ? "bg-gray-50/60 opacity-70" : ""}`}>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-xs font-bold text-blue-700">#{r.register_number}</span>
                    {isFirst && <span className="ml-1 text-xs text-green-600">(first)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[90px] truncate">{r.file_name}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {r.submitted_at ? (
                      <div>
                        <div className="font-semibold text-foreground/80">{new Date(r.submitted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                        <div className="text-muted-foreground/60">{new Date(r.submitted_at).toLocaleDateString()}</div>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold
                      ${score < 20 ? "bg-green-100 text-green-700" : score < 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                      {score}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={`text-xs border ${verdict.cls}`}>{verdict.label}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="text-xs h-7"
                        onClick={() => setExpandedId(expandedId === r.assignment_id ? null : r.assignment_id)}>
                        {expandedId === r.assignment_id
                          ? <><ChevronUp className="h-3 w-3 mr-1" />Hide</>
                          : <><Eye className="h-3 w-3 mr-1" />Report</>}
                      </Button>
                      {r.file_url && (
                        <a href={r.file_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm" className="text-xs h-7 px-2" title="View original document">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Turnitin report panel */}
      <AnimatePresence>
        {expandedId && (() => {
          const r = results.find(x => x.assignment_id === expandedId);
          if (!r) return null;
          const mc = (r.sentence_matches || []).length;
          return (
            <motion.div key={expandedId}
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              <div className="border-2 border-red-300 rounded-xl overflow-hidden shadow-lg">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-200 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="h-4 w-4 text-red-600" />
                    <span className="font-bold text-sm text-red-800">Turnitin Report — #{r.register_number}</span>
                    <Badge className="bg-red-100 text-red-700 border border-red-300 text-xs">{r.score}% similarity</Badge>
                    <Badge className="bg-gray-100 text-gray-600 border border-gray-300 text-xs">BERT</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{mc} matched sentence{mc !== 1 ? "s" : ""}</span>
                    {r.file_url && (
                      <a href={r.file_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="text-xs h-7">
                          <ExternalLink className="h-3 w-3 mr-1" />View File
                        </Button>
                      </a>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpandedId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-5 h-3 rounded-sm" style={{ backgroundColor: "#fee2e2", borderBottom: "2px solid #ef4444" }}></span>
                    Similar text — hover to see source RegNo
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-5 h-3 rounded-sm bg-white border border-gray-200"></span>
                    Original text
                  </span>
                </div>

                {/* Highlighted text */}
                <div className="p-5 max-h-[450px] overflow-y-auto bg-white">
                  <TurnitinHighlight text={r.extracted_text} sentenceMatches={r.sentence_matches || []} />
                </div>

                {/* Matched sentences list */}
                {mc > 0 && (
                  <div className="border-t border-red-100 p-4 bg-red-50/40">
                    <p className="text-xs font-semibold text-red-800 mb-2 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> {mc} Matched Sentence{mc !== 1 ? "s" : ""}
                    </p>
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {(r.sentence_matches || []).map((m: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 bg-white border border-red-100 rounded-lg px-3 py-2 text-xs shadow-sm">
                          <span className="shrink-0 bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded text-xs">#{m.matchedRegno}</span>
                          <span className="flex-1 text-foreground leading-relaxed">{m.sentence}</span>
                          <span className="shrink-0 font-bold text-red-600">{m.similarity}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

// ── Main component ────────────────────────────────────────
const FacultyDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [checkingSlot, setCheckingSlot] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editSlotId, setEditSlotId] = useState<string | null>(null);
  const [editMaxStudents, setEditMaxStudents] = useState(10);
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [simResults, setSimResults] = useState<Record<string, any[]>>({});
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSimilarity, setFilterSimilarity] = useState<"all"|"low"|"medium"|"high"|"unchecked">("all");
  const [slotTitle, setSlotTitle] = useState("");
  const [slotDescription, setSlotDescription] = useState("");
  const [slotDueDate, setSlotDueDate] = useState("");
  const [maxStudents, setMaxStudents] = useState(10);
  const [sectionPassword, setSectionPassword] = useState("");
  const [scoreValue, setScoreValue] = useState("");
  const [scoreRemarks, setScoreRemarks] = useState("");
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // ── Queries ─────────────────────────────────────────────
  const { data: slots = [] } = useQuery({
    queryKey: ["assignment-slots", user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("assignment_slots")
        .select("*").eq("faculty_id", user!.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["faculty-assignments"],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any).from("assignments")
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const uids = [...new Set(rows.map((a: any) => a.user_id))];
      const { data: profs } = await (supabase as any).from("profiles")
        .select("user_id, full_name, email").in("user_id", uids);
      const pm = new Map((profs || []).map((p: any) => [p.user_id, p]));
      return rows.map((a: any) => ({ ...a, profile: pm.get(a.user_id) || null }));
    },
  });

  // ── Derived ─────────────────────────────────────────────
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a: any) => {
      const q = searchQuery.toLowerCase();
      const ms = !q || a.title?.toLowerCase().includes(q) || a.profile?.full_name?.toLowerCase().includes(q) ||
        a.profile?.email?.toLowerCase().includes(q) || a.register_number?.toLowerCase().includes(q);
      const mf = filterSimilarity === "all" ? true :
        filterSimilarity === "unchecked" ? a.similarity_score === null :
        filterSimilarity === "low" ? a.similarity_score !== null && a.similarity_score < 20 :
        filterSimilarity === "medium" ? a.similarity_score !== null && a.similarity_score >= 20 && a.similarity_score < 50 :
        filterSimilarity === "high" ? a.similarity_score !== null && a.similarity_score >= 50 : true;
      return ms && mf;
    });
  }, [assignments, searchQuery, filterSimilarity]);

  const stats = useMemo(() => ({
    total: assignments.length,
    checked: assignments.filter((a: any) => a.similarity_score !== null).length,
    flagged: assignments.filter((a: any) => a.similarity_score !== null && a.similarity_score >= 50).length,
    scored: assignments.filter((a: any) => a.faculty_score !== null).length,
  }), [assignments]);

  // ── Mutations ────────────────────────────────────────────
  const createSlotMutation = useMutation({
    mutationFn: async () => {
      if (!slotTitle.trim()) throw new Error("Title required");
      if (!sectionPassword.trim()) throw new Error("Section password required");
      const { error } = await (supabase as any).from("assignment_slots").insert({
        faculty_id: user!.id,
        title: slotTitle.trim(),
        description: slotDescription.trim(),
        due_date: slotDueDate || null,
        is_active: true,
        max_students: maxStudents,
        section_password: sectionPassword.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignment-slots"] });
      setSlotTitle(""); setSlotDescription(""); setSlotDueDate("");
      setMaxStudents(10); setSectionPassword(""); setShowCreateForm(false);
      toast({ title: "✅ Section created!" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const editSlotMutation = useMutation({
    mutationFn: async ({ id, max_students }: any) => {
      const { error } = await (supabase as any).from("assignment_slots").update({ max_students }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["assignment-slots"] }); setEditSlotId(null); toast({ title: "Size updated!" }); },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const toggleSlotMutation = useMutation({
    mutationFn: async ({ id, is_active }: any) => {
      const { error } = await (supabase as any).from("assignment_slots").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignment-slots"] }),
  });

  // ── Delete entire section (slot + all its assignments) ──
  const deleteSlotMutation = useMutation({
    mutationFn: async (slot: any) => {
      // 1. Delete all assignments under this section title
      const { error: aErr } = await (supabase as any)
        .from("assignments").delete().eq("title", slot.title);
      if (aErr) throw aErr;
      // 2. Delete the slot itself
      const { error: sErr } = await (supabase as any)
        .from("assignment_slots").delete().eq("id", slot.id);
      if (sErr) throw sErr;
    },
    onSuccess: (_, slot) => {
      queryClient.invalidateQueries({ queryKey: ["assignment-slots"] });
      queryClient.invalidateQueries({ queryKey: ["faculty-assignments"] });
      // Clear any cached sim results for this slot
      setSimResults(prev => { const n = { ...prev }; delete n[slot.title]; return n; });
      if (expandedSlot === slot.title) setExpandedSlot(null);
      toast({ title: "🗑 Section deleted", description: `"${slot.title}" and all its submissions removed.` });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  // ── Delete individual student assignment ────────────────
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faculty-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-slots"] });
      toast({ title: "🗑 Submission deleted" });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const saveScoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const score = parseInt(scoreValue);
      if (isNaN(score) || score < 0 || score > 100) throw new Error("Score must be 0–100");
      const { error } = await (supabase as any).from("assignments")
        .update({ faculty_score: score, faculty_remarks: scoreRemarks.trim() || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faculty-assignments"] });
      setScoringId(null); setScoreValue(""); setScoreRemarks("");
      toast({ title: "Score saved!" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const checkSimilarity = useCallback(async (slotTitleArg: string) => {
    setCheckingSlot(slotTitleArg);
    try {
      const { data, error } = await supabase.functions.invoke("check-similarity", {
        body: { slot_title: slotTitleArg },
      });
      if (error) throw new Error(error.message || "Edge function error");
      if (data?.locked) {
        toast({ title: "🔒 Locked", description: data.message });
        return;
      }
      if (!data?.success) throw new Error(data?.message || data?.error || "Check failed");
      queryClient.invalidateQueries({ queryKey: ["faculty-assignments"] });
      if (data.results?.length > 0) {
        setSimResults(prev => ({ ...prev, [slotTitleArg]: data.results }));
        setExpandedSlot(slotTitleArg);
      }
      // Show warning if some files had extraction errors
      if (data.warning) {
        toast({ title: "⚠ Partial check", description: data.warning, variant: "destructive" });
      } else {
        toast({ title: "✅ Done", description: `${data.results?.length || 0} docs analysed · BERT` });
      }
    } catch (err: any) {
      toast({ title: "Check failed", description: err.message, variant: "destructive" });
    } finally {
      setCheckingSlot(null);
    }
  }, [queryClient, toast]);

  const getSimilarityBadge = (score: number | null) => {
    if (score === null || score === undefined) return <Badge variant="outline" className="text-xs">Not checked</Badge>;
    if (score < 20) return <Badge className="bg-green-100 text-green-800 border border-green-300 text-xs"><CheckCircle className="h-3 w-3 mr-1" />{score}%</Badge>;
    if (score < 50) return <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300 text-xs"><AlertTriangle className="h-3 w-3 mr-1" />{score}%</Badge>;
    return <Badge className="bg-red-100 text-red-800 border border-red-300 text-xs"><AlertTriangle className="h-3 w-3 mr-1" />{score}% Flagged</Badge>;
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">Faculty Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage sections · Password-protected · Turnitin-style plagiarism detection</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportToCSV(filteredAssignments)}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {[
          { label: "Total", value: stats.total, icon: FileText, color: "text-blue-600" },
          { label: "Checked", value: stats.checked, icon: CheckCircle, color: "text-green-600" },
          { label: "Flagged ≥50%", value: stats.flagged, icon: AlertTriangle, color: "text-red-600" },
          { label: "Scored", value: stats.scored, icon: Star, color: "text-yellow-600" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <Card><CardContent className="flex items-center gap-3 p-4">
              <s.icon className={`h-6 w-6 shrink-0 ${s.color}`} />
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent></Card>
          </motion.div>
        ))}
      </div>

      {/* Sections */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <PlusCircle className="h-5 w-5 text-blue-600" /> Assignment Sections
            </CardTitle>
            <Button variant={showCreateForm ? "outline" : "default"} size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
              {showCreateForm ? <><X className="h-4 w-4 mr-1" />Cancel</> : <><PlusCircle className="h-4 w-4 mr-1" />Create Section</>}
            </Button>
          </div>
        </CardHeader>

        {/* Create form */}
        {showCreateForm && (
          <CardContent className="border-t pt-5">
            <form onSubmit={e => { e.preventDefault(); createSlotMutation.mutate(); }} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Section Name <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. DSA Assignment 1" value={slotTitle} onChange={e => setSlotTitle(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Key className="h-3.5 w-3.5 text-orange-500" /> Section Password <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. DSA2025"
                  value={sectionPassword}
                  onChange={e => setSectionPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">Students must enter this password to submit.</p>
              </div>
              <div className="space-y-2">
                <Label>Max Students <span className="text-red-500">*</span></Label>
                <Input type="number" min={2} max={500} value={maxStudents} onChange={e => setMaxStudents(parseInt(e.target.value) || 2)} />
                <p className="text-xs text-muted-foreground">Section closes after {maxStudents} students submit. Check similarity unlocks when all submit.</p>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={slotDueDate} onChange={e => setSlotDueDate(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Instructions</Label>
                <Textarea placeholder="Optional assignment instructions…" value={slotDescription} onChange={e => setSlotDescription(e.target.value)} rows={2} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={createSlotMutation.isPending}>
                  {createSlotMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : <><PlusCircle className="h-4 w-4 mr-2" />Create Section</>}
                </Button>
              </div>
            </form>
          </CardContent>
        )}

        {/* Slots list */}
        {slots.length > 0 && (
          <CardContent className={showCreateForm ? "border-t pt-4" : ""}>
            <div className="space-y-4">
              {slots.map((slot: any) => {
                const slotDocs = (assignments as any[]).filter((a: any) => a.title === slot.title);
                const submitted = slotDocs.length;
                const maxStu = slot.max_students || 0;
                const allSubmitted = maxStu > 0 && submitted >= maxStu;
                const isFull = maxStu > 0 && submitted >= maxStu;
                const pct = maxStu > 0 ? Math.min(100, Math.round((submitted / maxStu) * 100)) : 0;
                const results = simResults[slot.title];
                const showPw = showPasswords[slot.id];

                return (
                  <div key={slot.id} className="border border-border rounded-xl overflow-hidden">
                    <div className="flex items-start justify-between p-4 bg-muted/10 gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{slot.title}</h3>
                          <Badge variant={slot.is_active ? "default" : "outline"} className="text-xs">{slot.is_active ? "Active" : "Closed"}</Badge>
                          {allSubmitted
                            ? <Badge className="bg-green-100 text-green-700 border border-green-300 text-xs">✅ Full — Ready to check</Badge>
                            : <Badge className="bg-orange-100 text-orange-700 border border-orange-300 text-xs"><Lock className="h-3 w-3 mr-1" />{submitted}/{maxStu} submitted</Badge>
                          }
                        </div>

                        {/* Password display */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                            <Key className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                            <span className="text-xs text-orange-700 font-medium">Password:</span>
                            <span className="text-xs font-mono font-bold text-orange-900">
                              {showPw ? (slot.section_password || "—") : "••••••"}
                            </span>
                            <button
                              className="text-orange-400 hover:text-orange-700 ml-1 text-xs"
                              onClick={() => setShowPasswords(prev => ({ ...prev, [slot.id]: !prev[slot.id] }))}
                            >
                              {showPw ? "hide" : "show"}
                            </button>
                          </div>
                        </div>

                        {/* Progress */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${allSubmitted ? "bg-green-500" : "bg-blue-400"}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{submitted}/{maxStu}</span>
                        </div>
                        {slot.due_date && <p className="text-xs text-muted-foreground mt-1">Due: {new Date(slot.due_date).toLocaleDateString()}</p>}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        {/* Edit size */}
                        {editSlotId === slot.id ? (
                          <div className="flex items-center gap-1">
                            <Input type="number" min={2} max={500} value={editMaxStudents}
                              onChange={e => setEditMaxStudents(parseInt(e.target.value) || 2)} className="w-20 h-8 text-xs" />
                            <Button size="sm" className="h-8 text-xs"
                              onClick={() => editSlotMutation.mutate({ id: slot.id, max_students: editMaxStudents })}
                              disabled={editSlotMutation.isPending}>Save</Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditSlotId(null)}>✕</Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" className="text-xs h-8"
                            onClick={() => { setEditSlotId(slot.id); setEditMaxStudents(slot.max_students || 10); }}>
                            <Edit2 className="h-3 w-3 mr-1" />Edit Size
                          </Button>
                        )}

                        {/* Check similarity */}
                        <Button size="sm"
                          variant={allSubmitted ? "default" : "outline"}
                          disabled={!allSubmitted || checkingSlot === slot.title}
                          onClick={() => checkSimilarity(slot.title)}
                          className="text-xs h-8">
                          {checkingSlot === slot.title
                            ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Checking…</>
                            : allSubmitted
                              ? <><RefreshCw className="h-3.5 w-3.5 mr-1" />Check Similarity</>
                              : <><Lock className="h-3.5 w-3.5 mr-1" />Locked</>}
                        </Button>

                        <Button variant="ghost" size="sm" className="text-xs h-8"
                          onClick={() => toggleSlotMutation.mutate({ id: slot.id, is_active: !slot.is_active })}>
                          {slot.is_active ? "Close" : "Reopen"}
                        </Button>

                        {/* Delete Section */}
                        <Button
                          variant="ghost" size="sm"
                          className="text-xs h-8 text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200"
                          disabled={deleteSlotMutation.isPending}
                          onClick={() => {
                            if (!confirm(
                              `Delete section "${slot.title}"?\n\nThis will permanently remove the section AND all ${submitted} student submission${submitted !== 1 ? "s" : ""} inside it.\n\nThis cannot be undone.`
                            )) return;
                            deleteSlotMutation.mutate(slot);
                          }}>
                          {deleteSlotMutation.isPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</>}
                        </Button>
                      </div>
                    </div>

                    {/* Similarity results */}
                    {results && (
                      <div className="border-t border-border p-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <BarChart2 className="h-4 w-4 text-blue-600" /> Plagiarism Report
                          </h4>
                          <Button variant="ghost" size="sm" className="text-xs"
                            onClick={() => setExpandedSlot(expandedSlot === slot.title ? null : slot.title)}>
                            {expandedSlot === slot.title ? <><ChevronUp className="h-4 w-4 mr-1" />Collapse</> : <><ChevronDown className="h-4 w-4 mr-1" />Expand</>}
                          </Button>
                        </div>
                        {expandedSlot === slot.title && <SimilarityReport results={results} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>

      {/* All Submissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-blue-600" /> All Submissions
            <Badge variant="outline" className="text-xs ml-1">{filteredAssignments.length}</Badge>
          </CardTitle>
          <div className="flex flex-wrap gap-2 mt-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {(["all","unchecked","low","medium","high"] as const).map(f => (
                <Button key={f} size="sm" variant={filterSimilarity === f ? "default" : "outline"}
                  onClick={() => setFilterSimilarity(f)} className="capitalize text-xs h-8">{f}</Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading…</div>
          ) : filteredAssignments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" /><p>No submissions found.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAssignments.map((a: any, i: number) => (
                <motion.div key={a.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}>
                  <div className="rounded-lg border border-border hover:bg-muted/20 transition-colors">
                    <div className="flex items-center justify-between p-4 gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{a.title}</h3>
                          {getSimilarityBadge(a.similarity_score)}
                          {a.faculty_score !== null && a.faculty_score !== undefined && (
                            <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300 text-xs">
                              <Star className="h-3 w-3 mr-1" />{a.faculty_score}/100
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span className="font-medium">{a.profile?.full_name || a.profile?.email || "Unknown"}</span>
                          {a.register_number && <><span>•</span><span className="text-blue-600 font-medium">#{a.register_number}</span></>}
                          <span>•</span><span>{a.file_name}</span>
                          <span>•</span><span>{new Date(a.created_at).toLocaleString()}</span>
                        </div>
                        {a.faculty_remarks && <p className="mt-1 text-xs bg-muted px-2 py-1 rounded inline-block">💬 {a.faculty_remarks}</p>}
                        {a.similarity_score !== null && (
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${a.similarity_score < 20 ? "bg-green-500" : a.similarity_score < 50 ? "bg-yellow-500" : "bg-red-500"}`}
                                style={{ width: `${a.similarity_score}%` }} />
                            </div>
                            <span className={`text-xs font-bold w-10 text-right ${a.similarity_score < 20 ? "text-green-600" : a.similarity_score < 50 ? "text-yellow-600" : "text-red-600"}`}>
                              {a.similarity_score}%
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant={scoringId === a.id ? "default" : "outline"} size="sm" className="text-xs"
                          onClick={() => {
                            if (scoringId === a.id) { setScoringId(null); setScoreValue(""); setScoreRemarks(""); }
                            else { setScoringId(a.id); setScoreValue(a.faculty_score?.toString() || ""); setScoreRemarks(a.faculty_remarks || ""); }
                          }}>
                          <Star className="h-3.5 w-3.5 mr-1" />
                          {a.faculty_score !== null ? "Edit Score" : "Score"}
                        </Button>
                        {a.file_url && (
                          <a href={a.file_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" title="View document">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                        <Button
                          variant="ghost" size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          title="Delete this submission"
                          disabled={deleteAssignmentMutation.isPending}
                          onClick={() => {
                            if (!confirm(
                              `Delete submission by ${a.profile?.full_name || a.register_number || "this student"}?\n\nThis cannot be undone.`
                            )) return;
                            deleteAssignmentMutation.mutate(a.id);
                          }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {scoringId === a.id && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="border-t px-4 py-4 bg-muted/20">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Score (0–100)</Label>
                                <Input type="number" min={0} max={100} placeholder="85" value={scoreValue} onChange={e => setScoreValue(e.target.value)} />
                              </div>
                              <div className="space-y-1.5 sm:col-span-2">
                                <Label className="text-xs">Remarks</Label>
                                <Input placeholder="e.g. Good work, needs improvement in…" value={scoreRemarks} onChange={e => setScoreRemarks(e.target.value)} />
                              </div>
                            </div>
                            <div className="flex gap-2 mt-3">
                              <Button size="sm" onClick={() => saveScoreMutation.mutate(a.id)} disabled={saveScoreMutation.isPending || !scoreValue}>
                                {saveScoreMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Saving…</> : <><CheckCircle className="h-3.5 w-3.5 mr-1" />Save Score</>}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => { setScoringId(null); setScoreValue(""); setScoreRemarks(""); }}>Cancel</Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FacultyDashboard;