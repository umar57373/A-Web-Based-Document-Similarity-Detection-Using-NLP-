// @ts-nocheck
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Upload, FileText, Trash2, CheckCircle, AlertTriangle,
  Loader2, Eye, ChevronUp, Star, BookOpen,
  Calendar, Lock, Users, X, Key, ShieldCheck, RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ══════════════════════════════════════════════════════════
// TEXT EXTRACTION — PDF, DOCX, TXT
// ══════════════════════════════════════════════════════════

// Load a CDN script once and resolve when ready
const loadScript = (src: string): Promise<void> =>
  new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });

// ── PDF extraction (PDF.js) ───────────────────────────────
// Strategy: extract ALL text items per page, reconstruct lines by Y-position.
// Works for text-based PDFs (Word-exported, typed PDFs).
// Scanned/image PDFs have no text layer → returns [Scanned:...].
const extractPdfText = async (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const typedArray = new Uint8Array(e.target?.result as ArrayBuffer);

        // Load PDF.js from CDN
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const loadingTask = (window as any).pdfjsLib.getDocument({
          data: typedArray,
          disableFontFace: false,
          useSystemFonts: true,
          // CMap needed for non-latin/encoded fonts (common in student PDFs)
          cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
          cMapPacked: true,
        });

        const pdf = await loadingTask.promise;
        const allPages: string[] = [];

        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const tc = await page.getTextContent({
            normalizeWhitespace: true,
            disableCombineTextItems: false,
          });

          const items = tc.items as any[];
          if (!items.length) continue;

          // ── Strategy 1: use hasEOL markers if present (modern PDF.js) ──
          // hasEOL=true on an item means it ends a line. Walk items in order.
          const hasEOLMarkers = items.some((it: any) => it.hasEOL === true);

          let pageText = "";

          if (hasEOLMarkers) {
            // Items are already in reading order — just join with spaces/newlines
            for (const item of items) {
              const str = (item.str || "").replace(/\u00a0/g, " ");
              if (!str.trim() && !item.hasEOL) continue;
              if (item.hasEOL) {
                pageText += str + "\n";
              } else {
                pageText += str + (str.endsWith(" ") || str.endsWith("-") ? "" : " ");
              }
            }
          } else {
            // ── Strategy 2: group by Y coordinate (older PDFs, complex layouts) ──
            type Chunk = { x: number; text: string; w: number };
            type Line  = { y: number; chunks: Chunk[] };
            const lines: Line[] = [];

            for (const item of items) {
              const str = (item.str || "").replace(/\u00a0/g, " ");
              if (!str.trim()) continue;
              const y = Math.round(item.transform[5] * 10) / 10;
              const x = item.transform[4];
              const w = item.width || 0;
              const line = lines.find(l => Math.abs(l.y - y) <= 5);
              if (line) line.chunks.push({ x, text: str, w });
              else lines.push({ y, chunks: [{ x, text: str, w }] });
            }

            lines.sort((a, b) => b.y - a.y); // top → bottom

            for (const line of lines) {
              line.chunks.sort((a, b) => a.x - b.x);
              let lineText = "";
              let prevX = 0, prevW = 0;
              for (const chunk of line.chunks) {
                if (!lineText) {
                  lineText = chunk.text;
                } else {
                  const gap = chunk.x - (prevX + prevW);
                  // Add space if there's a visual gap between text chunks
                  const needSpace = gap > 1 &&
                    !lineText.endsWith(" ") &&
                    !lineText.endsWith("-") &&
                    !chunk.text.startsWith(" ");
                  lineText += (needSpace ? " " : "") + chunk.text;
                }
                prevX = chunk.x;
                prevW = chunk.w;
              }
              if (lineText.trim()) pageText += lineText.trim() + "\n";
            }
          }

          const cleaned = pageText
            .replace(/([a-z])-\n([a-z])/g, "$1$2")   // rejoin hyphenated words
            .replace(/\n{3,}/g, "\n\n")
            .trim();

          if (cleaned.length > 0) allPages.push(cleaned);
        }

        const full = allPages
          .join("\n\n")
          .replace(/[ \t]{2,}/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        // If we got meaningful text, return it.
        // Threshold: 30 chars (a short assignment title is still useful).
        if (full.length >= 30) {
          resolve(full);
        } else {
          // Likely a scanned/image PDF — no selectable text
          resolve(`[Scanned:${file.name}|pages:${pdf.numPages}]`);
        }
      } catch (err) {
        console.error("PDF extraction error:", err);
        resolve(`[PDFError:${file.name}]`);
      }
    };
    reader.onerror = () => resolve(`[ReadError:${file.name}]`);
    reader.readAsArrayBuffer(file);
  });
};

// ── DOCX extraction (mammoth.js) ──────────────────────────
const extractDocxText = async (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js");
        const mammoth = (window as any).mammoth;
        if (!mammoth) { resolve(`[DOCX:${file.name}]`); return; }

        const arrayBuffer = e.target?.result as ArrayBuffer;
        const result = await mammoth.extractRawText({ arrayBuffer });
        const text = (result.value || "").trim();
        resolve(text.length >= 50 ? text : `[EmptyDOCX:${file.name}]`);
      } catch (err) {
        console.error("DOCX error:", err);
        resolve(`[DOCX:${file.name}|${file.size}]`);
      }
    };
    reader.onerror = () => resolve(`[Err:${file.name}]`);
    reader.readAsArrayBuffer(file);
  });
};

// ── TXT extraction ────────────────────────────────────────
const extractTxtText = async (file: File): Promise<string> => {
  try {
    const text = await file.text();
    const clean = text.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return clean.length >= 30 ? clean : `[EmptyTXT:${file.name}]`;
  } catch {
    return `[TXT:${file.name}]`;
  }
};

// ── Main dispatcher ───────────────────────────────────────
const extractText = async (file: File): Promise<string> => {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const mime = file.type.toLowerCase();

  if (mime === "application/pdf" || ext === "pdf") {
    return extractPdfText(file);
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    ext === "docx" || ext === "doc"
  ) {
    return extractDocxText(file);
  }
  // TXT and everything else
  return extractTxtText(file);
};

// ── Preview helper ────────────────────────────────────────
const getFileIcon = (fileName: string) => {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "📄";
  if (ext === "docx" || ext === "doc") return "📝";
  return "📃";
};

// ══════════════════════════════════════════════════════════
// PASSWORD GATE
// ══════════════════════════════════════════════════════════
const PasswordGate = ({
  section,
  onUnlock,
  onCancel,
}: {
  section: any;
  onUnlock: () => void;
  onCancel: () => void;
}) => {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const verify = async () => {
    if (!pw.trim()) { setError("Enter the section password"); return; }
    setChecking(true);
    setError("");
    try {
      const { data, error: dbErr } = await (supabase as any)
        .from("assignment_slots")
        .select("section_password, max_students")
        .eq("id", section.id)
        .maybeSingle();

      if (dbErr || !data) {
        setError("Could not verify. Try again.");
        setChecking(false);
        return;
      }

      // Live count check
      const { count } = await (supabase as any)
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("title", section.title);

      if (data.max_students > 0 && (count ?? 0) >= data.max_students) {
        setError("This section is now full. No more submissions.");
        setChecking(false);
        return;
      }

      if (data.section_password && pw.trim() === data.section_password.trim()) {
        onUnlock();
      } else {
        setError("Wrong password. Ask your faculty.");
      }
    } catch {
      setError("Verification failed. Try again.");
    }
    setChecking(false);
  };

  return (
    <div className="border-t border-border p-4 bg-orange-50/40 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-orange-800">
        <Key className="h-4 w-4 text-orange-500" />
        Enter Section Password to Submit
      </div>
      <p className="text-xs text-muted-foreground">Ask your faculty for the section password.</p>
      <div className="flex items-center gap-2 max-w-sm">
        <Input
          type="password"
          placeholder="Section password…"
          value={pw}
          onChange={e => { setPw(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && verify()}
          className={error ? "border-red-400" : ""}
        />
        <Button size="sm" onClick={verify} disabled={checking}>
          {checking
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><ShieldCheck className="h-4 w-4 mr-1" />Unlock</>}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
};

// ══════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════════
const StudentDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // openSectionId: null | "password:{id}" | "upload:{id}"
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  const [unlockedSections, setUnlockedSections] = useState<Set<string>>(new Set());
  const [registerNumber, setRegisterNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractPreview, setExtractPreview] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resubmitId, setResubmitId] = useState<string | null>(null); // assignment id being replaced
  const [sectionCounts, setSectionCounts] = useState<Record<string, number>>({});

  // ── Fetch sections ───────────────────────────────────────
  const { data: sections = [] } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("assignment_slots")
        .select("id, title, description, due_date, max_students, is_active, section_password")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return data || [];
    },
    refetchInterval: 15000,
  });

  // ── Section counts (bypasses student RLS) ───────────────
  useEffect(() => {
    const fetchCounts = async () => {
      // Try RPC first (SECURITY DEFINER — sees all rows)
      const { data: rpcData, error: rpcErr } = await (supabase as any)
        .rpc("get_assignment_counts_per_section");

      if (!rpcErr && rpcData) {
        const counts: Record<string, number> = {};
        rpcData.forEach((row: any) => { counts[row.title] = Number(row.count); });
        setSectionCounts(counts);
        return;
      }

      // Fallback: individual count query per section
      const { data: slotData } = await (supabase as any)
        .from("assignment_slots").select("title").eq("is_active", true);
      if (!slotData) return;
      const counts: Record<string, number> = {};
      await Promise.all(
        slotData.map(async (slot: any) => {
          const { count } = await (supabase as any)
            .from("assignments")
            .select("id", { count: "exact", head: true })
            .eq("title", slot.title);
          counts[slot.title] = count ?? 0;
        })
      );
      setSectionCounts(counts);
    };

    fetchCounts();

    // Realtime updates
    const channel = (supabase as any)
      .channel("assignments-count-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, fetchCounts)
      .subscribe();

    return () => { (supabase as any).removeChannel(channel); };
  }, []);

  // ── My assignments ───────────────────────────────────────
  const { data: myAssignments = [], isLoading } = useQuery({
    queryKey: ["my-assignments", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("assignments")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // ── Close form when section fills up ────────────────────
  useEffect(() => {
    if (!openSectionId) return;
    const sectionId = openSectionId.replace(/^(password|upload):/, "");
    const openSection = (sections as any[]).find((s: any) => s.id === sectionId);
    if (!openSection) return;
    const maxStu = openSection.max_students || 0;
    const currentCount = sectionCounts[openSection.title] || 0;
    const alreadySubmitted = (myAssignments as any[]).some((a: any) => a.title === openSection.title);
    if (maxStu > 0 && currentCount >= maxStu && !alreadySubmitted) {
      setOpenSectionId(null);
      setFile(null);
      setRegisterNumber("");
      setExtractPreview("");
      toast({
        title: "🚫 Section is now full",
        description: `${openSection.title} reached ${maxStu} submissions.`,
        variant: "destructive",
      });
    }
  }, [sectionCounts]);

  // ── Submit (new or resubmit) ─────────────────────────────
  const submitMutation = useMutation({
    mutationFn: async ({ section, isResubmit, oldAssignmentId }: {
      section: any; isResubmit: boolean; oldAssignmentId?: string
    }) => {
      if (!file) throw new Error("Please select a file");
      if (!registerNumber.trim()) throw new Error("Register number is required");

      const maxStu = section.max_students || 0;

      // If resubmit: delete old assignment first (count won't change)
      // If new: confirm section not full
      if (!isResubmit) {
        const { count: preCount } = await (supabase as any)
          .from("assignments")
          .select("id", { count: "exact", head: true })
          .eq("title", section.title);
        if (maxStu > 0 && (preCount ?? 0) >= maxStu) {
          throw new Error(`Section is full (${preCount}/${maxStu}). No more submissions.`);
        }
        const { count: myCount } = await (supabase as any)
          .from("assignments")
          .select("id", { count: "exact", head: true })
          .eq("title", section.title)
          .eq("user_id", user!.id);
        if ((myCount ?? 0) > 0)
          throw new Error("You already submitted. Use the Resubmit button instead.");
      }

      // Extract text
      setExtracting(true);
      let extractedText = "";
      try {
        extractedText = await extractText(file);
        if (extractedText && !extractedText.startsWith("[")) {
          setExtractPreview(extractedText.substring(0, 200) + "…");
        }
      } finally {
        setExtracting(false);
      }

      // Warn if scanned PDF — but do NOT block. Faculty will see the file_url.
      if (extractedText.startsWith("[Scanned:") || extractedText.startsWith("[PDFError:")) {
        toast({
          title: "⚠ Scanned PDF detected",
          description: "Your PDF appears to be a scanned image. Text could not be extracted — plagiarism check may not work for your file. Please re-upload as a text-based PDF or DOCX if possible.",
          variant: "destructive",
        });
        // Don't block — let them submit so faculty can at least see the file
      }

      // For resubmit: re-check count after extraction (section might have refilled)
      if (!isResubmit) {
        const { count: postCount } = await (supabase as any)
          .from("assignments")
          .select("id", { count: "exact", head: true })
          .eq("title", section.title);
        if (maxStu > 0 && (postCount ?? 0) >= maxStu) {
          throw new Error(`Section filled while processing your file (${postCount}/${maxStu}).`);
        }
      }

      // Upload file to storage
      const ext = file.name.split(".").pop() || "pdf";
      const safeName = section.title.replace(/[^a-zA-Z0-9]/g, "_");
      const path = `${user!.id}/${safeName}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("assignments").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("assignments").getPublicUrl(path);

      if (isResubmit && oldAssignmentId) {
        // Delete old record first, then insert new one
        const { error: delErr } = await (supabase as any)
          .from("assignments").delete().eq("id", oldAssignmentId).eq("user_id", user!.id);
        if (delErr) throw delErr;

        // Direct insert (slot count unchanged — we just replaced)
        const { error: dbErr } = await (supabase as any).from("assignments").insert({
          user_id: user!.id,
          title: section.title,
          description: section.description || "",
          file_url: urlData.publicUrl,
          file_name: file.name,
          extracted_text: extractedText,
          register_number: registerNumber.trim().toUpperCase(),
        });
        if (dbErr) throw dbErr;
      } else {
        // New submission — use atomic RPC
        const { data: rpcData, error: rpcErr } = await (supabase as any).rpc(
          "insert_assignment_if_slot_not_full",
          {
            p_user_id: user!.id,
            p_title: section.title,
            p_description: section.description || "",
            p_file_url: urlData.publicUrl,
            p_file_name: file.name,
            p_extracted_text: extractedText,
            p_register_number: registerNumber.trim().toUpperCase(),
            p_max_students: maxStu,
          }
        );

        if (rpcErr) {
          // RPC not yet deployed — fallback direct insert
          const { error: dbErr } = await (supabase as any).from("assignments").insert({
            user_id: user!.id,
            title: section.title,
            description: section.description || "",
            file_url: urlData.publicUrl,
            file_name: file.name,
            extracted_text: extractedText,
            register_number: registerNumber.trim().toUpperCase(),
          });
          if (dbErr) throw dbErr;
        } else if (rpcData === "full") {
          throw new Error("Section is full. Submission rejected by server.");
        } else if (rpcData === "duplicate") {
          throw new Error("You already submitted to this section.");
        }
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["my-assignments", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["section-counts"] });
      setOpenSectionId(null);
      setFile(null);
      setRegisterNumber("");
      setExtractPreview("");
      setResubmitId(null);
      setUnlockedSections(prev => {
        const next = new Set(prev);
        next.delete(vars.section.id);
        return next;
      });
      toast({
        title: vars.isResubmit ? "🔄 Resubmitted!" : "✅ Submitted!",
        description: vars.isResubmit
          ? "Your assignment has been replaced successfully."
          : "Your assignment has been submitted successfully.",
      });
    },
    onError: (err: any) =>
      toast({ title: "Submission failed", description: err.message, variant: "destructive" }),
  });

  // ── Delete my submission ─────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("assignments").delete().eq("id", id).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-assignments", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["section-counts"] });
      toast({ title: "Deleted" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const submittedTitles = new Set((myAssignments as any[]).map((a: any) => a.title));

  const closeForm = () => {
    setOpenSectionId(null);
    setFile(null);
    setRegisterNumber("");
    setExtractPreview("");
    setResubmitId(null);
  };

  // ── Upload form (shared between new + resubmit) ──────────
  const UploadForm = ({ section, isResubmit, oldId }: {
    section: any; isResubmit: boolean; oldId?: string
  }) => (
    <div className={`border-t border-border p-4 space-y-4 ${isResubmit ? "bg-blue-50/20" : "bg-green-50/20"}`}>
      {isResubmit ? (
        <div className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold">
          <RefreshCw className="h-4 w-4 text-blue-600" />
          Resubmitting — your previous submission will be replaced
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-green-700 font-semibold">
          <ShieldCheck className="h-4 w-4 text-green-600" />
          Section unlocked — you can now submit
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm">Register Number <span className="text-red-500">*</span></Label>
          <Input
            placeholder="e.g. 221FA04484"
            value={registerNumber}
            onChange={e => setRegisterNumber(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">File Type Accepted</Label>
          <div className="flex items-center gap-2 flex-wrap">
            {["PDF","DOCX","DOC","TXT"].map(t => (
              <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded font-mono font-semibold">
                .{t.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Assignment File <span className="text-red-500">*</span></Label>
        <div
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
            ${file
              ? extractPreview
                ? "border-green-400 bg-green-50/50"
                : "border-blue-400 bg-blue-50/30"
              : "border-border hover:border-blue-400 hover:bg-blue-50/20"
            }`}
          onClick={() => document.getElementById(`file-${section.id}`)?.click()}
        >
          <input
            id={`file-${section.id}`}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={e => {
              setFile(e.target.files?.[0] || null);
              setExtractPreview("");
            }}
          />
          {file ? (
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-700">
                  {getFileIcon(file.name)} {file.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              {extractPreview && (
                <p className="text-xs text-muted-foreground italic text-left bg-muted/50 rounded p-2 mt-2 max-h-16 overflow-hidden">
                  "{extractPreview}"
                </p>
              )}
              {extracting && (
                <p className="text-xs text-blue-600 flex items-center justify-center gap-1 mt-1">
                  <Loader2 className="h-3 w-3 animate-spin" />Extracting text…
                </p>
              )}
            </div>
          ) : (
            <div>
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to upload <span className="font-medium">PDF, DOCX, DOC, or TXT</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Text extracted automatically for plagiarism analysis
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => submitMutation.mutate({ section, isResubmit, oldAssignmentId: oldId })}
          disabled={submitMutation.isPending || extracting || !file || !registerNumber.trim()}
          variant={isResubmit ? "outline" : "default"}
          className={isResubmit ? "border-blue-400 text-blue-700 hover:bg-blue-50" : ""}
        >
          {extracting
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Extracting text…</>
            : submitMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</>
              : isResubmit
                ? <><RefreshCw className="h-4 w-4 mr-2" />Resubmit</>
                : <><Upload className="h-4 w-4 mr-2" />Submit Assignment</>}
        </Button>
        <Button variant="ghost" size="sm" onClick={closeForm}>Cancel</Button>
      </div>
    </div>
  );

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold">Student Dashboard</h1>
        <p className="text-muted-foreground mt-1">Submit assignments · Password-protected sections</p>
      </motion.div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-3">
        {[
          { label: "Open Sections", value: sections.length, icon: BookOpen, color: "text-blue-600" },
          { label: "Submitted", value: (myAssignments as any[]).length, icon: CheckCircle, color: "text-green-600" },
          { label: "Pending", value: sections.filter((s: any) => !submittedTitles.has(s.title)).length, icon: AlertTriangle, color: "text-yellow-600" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <Card><CardContent className="flex items-center gap-3 p-4">
              <s.icon className={`h-6 w-6 shrink-0 ${s.color}`} />
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent></Card>
          </motion.div>
        ))}
      </div>

      {/* Open Sections */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5 text-blue-600" /> Open Sections
            <Badge variant="outline" className="text-xs ml-1">{sections.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sections.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>No open sections yet. Wait for your faculty to create one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sections.map((section: any) => {
                const alreadySubmitted = submittedTitles.has(section.title);
                const maxStu = section.max_students || 0;
                const currentCount = sectionCounts[section.title] || 0;
                const isFull = maxStu > 0 && currentCount >= maxStu && !alreadySubmitted;
                const isPasswordOpen = openSectionId === `password:${section.id}`;
                const isUploadOpen = openSectionId === `upload:${section.id}`;
                const isUnlocked = unlockedSections.has(section.id);
                const pct = maxStu > 0 ? Math.min(100, Math.round((currentCount / maxStu) * 100)) : 0;
                const mySubmission = (myAssignments as any[]).find((a: any) => a.title === section.title);
                const isResubmitOpen = openSectionId === `upload:${section.id}` && resubmitId !== null;

                return (
                  <div key={section.id}
                    className={`border rounded-xl overflow-hidden transition-all
                      ${isFull ? "border-red-200 bg-red-50/20 opacity-80" : "border-border"}`}>
                    <div className="flex items-start justify-between p-4 gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{section.title}</h3>
                          {alreadySubmitted
                            ? <Badge className="bg-green-100 text-green-700 border border-green-300 text-xs">✅ Submitted</Badge>
                            : isFull
                              ? <Badge className="bg-red-100 text-red-700 border border-red-300 text-xs">🚫 Full</Badge>
                              : <Badge className="bg-blue-100 text-blue-700 border border-blue-300 text-xs">📤 Open</Badge>
                          }
                        </div>
                        {section.description && (
                          <p className="text-xs text-muted-foreground mt-1">{section.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          {section.due_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Due: {new Date(section.due_date).toLocaleDateString()}
                            </span>
                          )}
                          {maxStu > 0 && (
                            <span className={`flex items-center gap-1 font-medium ${isFull ? "text-red-600" : ""}`}>
                              <Users className="h-3 w-3" />
                              {currentCount}/{maxStu}{isFull ? " — FULL" : ""}
                            </span>
                          )}
                        </div>
                        {maxStu > 0 && (
                          <div className="mt-2 max-w-[200px]">
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${isFull ? "bg-red-500" : "bg-blue-400"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        {/* Submit button */}
                        {!alreadySubmitted && !isFull && (
                          <Button
                            size="sm"
                            variant={isPasswordOpen || isUploadOpen ? "outline" : "default"}
                            onClick={async () => {
                              if (isPasswordOpen || isUploadOpen) { closeForm(); return; }
                              // Live count check before opening
                              const { count: liveCount } = await (supabase as any)
                                .from("assignments")
                                .select("id", { count: "exact", head: true })
                                .eq("title", section.title);
                              if ((section.max_students || 0) > 0 && (liveCount ?? 0) >= section.max_students) {
                                queryClient.invalidateQueries({ queryKey: ["section-counts"] });
                                return;
                              }
                              if (isUnlocked) {
                                setResubmitId(null);
                                setOpenSectionId(`upload:${section.id}`);
                              } else {
                                setOpenSectionId(`password:${section.id}`);
                              }
                            }}
                          >
                            {isPasswordOpen || isUploadOpen
                              ? <><X className="h-4 w-4 mr-1" />Cancel</>
                              : <><Upload className="h-4 w-4 mr-1" />Submit</>}
                          </Button>
                        )}

                        {/* Resubmit button (when already submitted) */}
                        {alreadySubmitted && mySubmission && (
                          <Button
                            size="sm"
                            variant={isResubmitOpen ? "outline" : "ghost"}
                            className="text-blue-600 border-blue-300 hover:bg-blue-50 text-xs"
                            onClick={() => {
                              if (isResubmitOpen) { closeForm(); return; }
                              // Resubmit always requires password re-entry for security
                              setResubmitId(mySubmission.id);
                              if (isUnlocked) {
                                setOpenSectionId(`upload:${section.id}`);
                              } else {
                                setOpenSectionId(`password:${section.id}`);
                              }
                            }}
                          >
                            {isResubmitOpen
                              ? <><X className="h-4 w-4 mr-1" />Cancel</>
                              : <><RefreshCw className="h-4 w-4 mr-1" />Resubmit</>}
                          </Button>
                        )}

                        {/* Full badge */}
                        {isFull && (
                          <div className="flex items-center gap-1.5 bg-red-100 border border-red-300 text-red-700 text-xs font-semibold px-3 py-2 rounded-lg">
                            <Lock className="h-3.5 w-3.5" />No more submissions
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Password gate */}
                    <AnimatePresence>
                      {isPasswordOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <PasswordGate
                            section={section}
                            onUnlock={() => {
                              setUnlockedSections(prev => new Set([...prev, section.id]));
                              setOpenSectionId(`upload:${section.id}`);
                            }}
                            onCancel={closeForm}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Upload form */}
                    <AnimatePresence>
                      {isUploadOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <UploadForm
                            section={section}
                            isResubmit={resubmitId !== null}
                            oldId={resubmitId ?? undefined}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* My Submissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-blue-600" /> My Submissions
            <Badge variant="outline" className="text-xs ml-1">{(myAssignments as any[]).length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Loading…</div>
          ) : (myAssignments as any[]).length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>No submissions yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(myAssignments as any[]).map((a: any, i: number) => (
                <motion.div key={a.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <div className="border border-border rounded-xl overflow-hidden hover:bg-muted/10 transition-colors">
                    <div className="flex items-center justify-between p-4 gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{a.title}</h3>
                          {a.similarity_score !== null
                            ? a.similarity_score < 20
                              ? <Badge className="bg-green-100 text-green-700 border border-green-300 text-xs">✅ Original</Badge>
                              : a.similarity_score < 50
                                ? <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-300 text-xs">⚠ Review</Badge>
                                : <Badge className="bg-red-100 text-red-700 border border-red-300 text-xs">🚨 Flagged</Badge>
                            : <Badge variant="outline" className="text-xs">Pending check</Badge>
                          }
                          <span className="text-xs text-muted-foreground">
                            {getFileIcon(a.file_name)} {a.file_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                          {a.register_number && <span className="text-blue-600 font-medium">#{a.register_number}</span>}
                          <span>•</span>
                          <span>{new Date(a.created_at).toLocaleString()}</span>
                        </div>

                        {/* Scores */}
                        {(a.similarity_score !== null || a.faculty_score !== null) && (
                          <div className="mt-3 p-3 rounded-lg border border-border bg-muted/30 space-y-2">
                            {a.similarity_score !== null && (
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">Similarity Score</span>
                                  <span className={`font-bold ${a.similarity_score < 20 ? "text-green-600" : a.similarity_score < 50 ? "text-yellow-600" : "text-red-600"}`}>
                                    {a.similarity_score}%
                                  </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${a.similarity_score < 20 ? "bg-green-500" : a.similarity_score < 50 ? "bg-yellow-500" : "bg-red-500"}`}
                                    style={{ width: `${a.similarity_score}%` }}
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                  <Lock className="h-3 w-3" />Detailed report visible to faculty only.
                                </p>
                              </div>
                            )}
                            {a.faculty_score !== null && (
                              <div className="flex items-center justify-between pt-1 border-t border-border">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Star className="h-3 w-3 text-yellow-500" /> Faculty Score
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold">{a.faculty_score}/100</span>
                                  {a.faculty_remarks && (
                                    <span className="text-xs text-muted-foreground italic">"{a.faculty_remarks}"</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant="ghost" size="sm"
                          onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                          {expandedId === a.id ? <ChevronUp className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm"
                          onClick={() => {
                            if (confirm("Delete this submission? You can resubmit after deleting."))
                              deleteMutation.mutate(a.id);
                          }}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    {/* Extracted text preview */}
                    <AnimatePresence>
                      {expandedId === a.id && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="border-t border-border p-4 bg-muted/10">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">
                              Extracted Text Preview:
                            </p>
                            {a.extracted_text && !a.extracted_text.startsWith("[") ? (
                              <pre className="text-xs text-foreground leading-relaxed max-h-48 overflow-y-auto
                                bg-background rounded-lg p-3 border border-border whitespace-pre-wrap font-sans">
                                {a.extracted_text.substring(0, 1500)}
                                {a.extracted_text.length > 1500 ? "…" : ""}
                              </pre>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">
                                Text extraction unavailable (scanned/image PDF).
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                              <Lock className="h-3 w-3" />Full plagiarism report visible to faculty only.
                            </p>
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

export default StudentDashboard;