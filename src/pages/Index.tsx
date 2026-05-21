import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  FileSearch, Shield, Zap, GraduationCap,
  Upload, Search, BarChart2, ChevronDown, ArrowRight,
  CheckCircle, Mail, Twitter, Github, Linkedin, ExternalLink
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const faqs = [
  {
    q: "How does DocScan detect similarity?",
    a: "DocScan uses a hybrid AI model combining TF-IDF cosine similarity and semantic text analysis to compare submitted documents against all previously submitted assignments in the system.",
  },
  {
    q: "What file formats are supported?",
    a: "DocScan supports .txt, .md, .doc, .docx, and .pdf files. PDF text is automatically extracted using PDF.js for accurate comparison.",
  },
  {
    q: "What does the similarity percentage mean?",
    a: "0–19% means the document is largely original. 20–49% indicates moderate similarity that may need review. 50%+ is flagged as high similarity and requires faculty attention.",
  },
  {
    q: "Can students see each other's submissions?",
    a: "No. Students can only see their own submissions. Faculty can view all submissions across the platform.",
  },
  {
    q: "Is my document data secure?",
    a: "Yes. All documents are stored with 256-bit encryption via Supabase secure storage. Only authorized users with the correct role can access submission data.",
  },
  {
    q: "Can faculty create assignments for specific students?",
    a: "Yes. Faculty can create assignment slots with titles, descriptions, and due dates. Students see and submit to active assignment slots only.",
  },
];

const steps = [
  {
    icon: Upload,
    step: "01",
    title: "Student Submits",
    desc: "Students upload their assignment (PDF, DOC, TXT) with their register number and title.",
    color: "hsl(168, 60%, 34%)",
  },
  {
    icon: Search,
    step: "02",
    title: "AI Analyses",
    desc: "Our hybrid AI model extracts text and compares it against all existing submissions instantly.",
    color: "hsl(221, 68%, 42%)",
  },
  {
    icon: BarChart2,
    step: "03",
    title: "Report Generated",
    desc: "A detailed similarity score is generated with flagged content highlighted for review.",
    color: "hsl(38, 90%, 48%)",
  },
  {
    icon: CheckCircle,
    step: "04",
    title: "Faculty Reviews",
    desc: "Faculty reviews reports, marks scores, adds remarks, and exports results as CSV.",
    color: "hsl(168, 60%, 34%)",
  },
];

const features = [
  { icon: Zap, title: "AI-Powered Analysis", desc: "Advanced text comparison using hybrid AI to detect similarities between submitted documents with high accuracy." },
  { icon: Shield, title: "Academic Integrity", desc: "Ensure originality with detailed similarity scores, flagged content detection, and faculty score tracking." },
  { icon: GraduationCap, title: "Role-Based Access", desc: "Students submit assignments, faculty reviews results. Clean, role-specific dashboards for each user type." },
  { icon: BarChart2, title: "Detailed Reports", desc: "Visual similarity scores, bar charts, highlighted flagged text, and exportable CSV reports for faculty." },
  { icon: Upload, title: "Multiple Formats", desc: "Support for PDF, DOC, DOCX, TXT, and MD files. PDF text is auto-extracted for accurate comparison." },
  { icon: CheckCircle, title: "Instant Results", desc: "Similarity analysis completes in under 5 seconds. Faculty can batch-check all submissions at once." },
];

const Index = () => {
  const { user } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Nav ── */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2">
            <FileSearch className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold text-foreground tracking-tight">DocScan</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            {user ? (
              <Button asChild><Link to="/dashboard">Dashboard</Link></Button>
            ) : (
              <>
                <Button variant="ghost" asChild><Link to="/login">Sign in</Link></Button>
                <Button asChild><Link to="/register">Get Started</Link></Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, hsl(222, 36%, 11%) 0%, hsl(222, 40%, 18%) 50%, hsl(180, 32%, 18%) 100%)" }}
      >
        <div className="relative container px-4 py-28 sm:py-36">
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="max-w-2xl mx-auto text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6"
              style={{ background: "hsl(168 60% 32% / 0.25)", border: "1px solid hsl(168 60% 42% / 0.4)", color: "hsl(168, 60%, 70%)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              AI-Powered Academic Integrity
            </motion.div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight" style={{ color: "#ffffff" }}>
              Detect Document{" "}
              <span style={{ color: "hsl(168, 60%, 55%)" }}>Similarity</span>{" "}
              Instantly
            </h1>
            <p className="mt-6 text-lg leading-relaxed max-w-xl mx-auto" style={{ color: "hsl(220, 15%, 72%)" }}>
              AI-powered academic integrity tool. Students submit assignments, faculty gets instant similarity reports. Keep academic standards high.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="text-white font-semibold px-8" style={{ background: "hsl(168, 60%, 34%)" }} asChild>
                <Link to="/register">Start Free</Link>
              </Button>
              <Button size="lg" variant="outline" className="font-semibold px-8"
                style={{ borderColor: "hsl(220, 20%, 40%)", color: "#ffffff", background: "transparent" }} asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
            <div className="mt-14 grid grid-cols-3 gap-4 max-w-sm mx-auto">
              {[{ value: "99%", label: "Accuracy" }, { value: "< 5s", label: "Analysis Time" }, { value: "256-bit", label: "Encryption" }].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl font-bold" style={{ color: "hsl(168, 60%, 55%)" }}>{s.value}</p>
                  <p className="text-xs mt-1" style={{ color: "hsl(220, 15%, 55%)" }}>{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16" style={{ background: "linear-gradient(to bottom, transparent, hsl(220, 18%, 97%))" }} />
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="container px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} className="text-center mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">Process</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">How DocScan Works</h2>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">Four simple steps from submission to verified academic integrity.</p>
        </motion.div>
        <div className="relative">
          <div className="hidden md:block absolute top-10 left-[12.5%] right-[12.5%] h-0.5 bg-border" />
          <div className="grid gap-8 md:grid-cols-4">
            {steps.map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.12 }}
                className="flex flex-col items-center text-center relative"
              >
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5 relative z-10 bg-background border-2" style={{ borderColor: s.color }}>
                  <s.icon className="h-8 w-8" style={{ color: s.color }} />
                </div>
                <span className="text-xs font-bold text-muted-foreground mb-1 tracking-widest">{s.step}</span>
                <h3 className="font-bold text-foreground mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                {i < steps.length - 1 && (
                  <div className="md:hidden mt-4 text-muted-foreground">
                    <ArrowRight className="h-5 w-5 mx-auto rotate-90" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="bg-muted/30 py-24">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} className="text-center mb-12"
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">Features</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Everything you need for academic integrity</h2>
            <p className="mt-3 text-muted-foreground max-w-lg mx-auto">Simple, powerful tools for students and faculty alike.</p>
          </motion.div>
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                className="rounded-xl border border-border bg-card p-6 hover:shadow-lg transition-shadow duration-200"
              >
                <div className="w-11 h-11 rounded-lg flex items-center justify-center mb-4" style={{ background: "hsl(221, 68%, 38%, 0.1)" }}>
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="container px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} className="text-center mb-12"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">FAQ</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Frequently Asked Questions</h2>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">Everything you need to know about DocScan.</p>
        </motion.div>
        <div className="max-w-2xl mx-auto space-y-3">
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.06 }}
              className="border border-border rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left bg-card hover:bg-muted/30 transition-colors"
              >
                <span className="font-medium text-foreground pr-4">{faq.q}</span>
                <motion.div animate={{ rotate: openFaq === i ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                </motion.div>
              </button>
              <AnimatePresence initial={false}>
                {openFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border pt-4 bg-muted/10">
                      {faq.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-20">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl p-10 text-center"
            style={{ background: "linear-gradient(135deg, hsl(222, 36%, 11%) 0%, hsl(180, 32%, 18%) 100%)" }}
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: "#ffffff" }}>
              Ready to maintain academic integrity?
            </h2>
            <p className="mb-8 max-w-md mx-auto" style={{ color: "hsl(220, 15%, 68%)" }}>
              Join institutions already using DocScan to keep their academic standards high.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="font-semibold px-8 text-white" style={{ background: "hsl(168, 60%, 34%)" }} asChild>
                <Link to="/register">Get Started Free</Link>
              </Button>
              <Button size="lg" variant="outline" className="font-semibold px-8"
                style={{ borderColor: "hsl(220, 20%, 40%)", color: "#ffffff", background: "transparent" }} asChild>
                <Link to="/login">Sign In <ArrowRight className="h-4 w-4 ml-2" /></Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background: "hsl(222, 36%, 10%)" }}>
        <div className="container px-4 py-16">
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">

            {/* Brand / About */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <FileSearch className="h-7 w-7" style={{ color: "hsl(168, 60%, 55%)" }} />
                <span className="text-xl font-bold" style={{ color: "#ffffff" }}>DocScan</span>
              </div>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "hsl(220, 15%, 60%)" }}>
                An AI-powered academic integrity platform that helps institutions detect document similarity and maintain high academic standards.
              </p>
              {/* Social links */}
              <div className="flex items-center gap-3">
                {[
                  { icon: Twitter, href: "https://twitter.com", label: "Twitter" },
                  { icon: Github, href: "https://github.com", label: "GitHub" },
                  { icon: Linkedin, href: "https://linkedin.com", label: "LinkedIn" },
                ].map(s => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: "hsl(222, 28%, 16%)", color: "hsl(220, 15%, 60%)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "hsl(168, 60%, 55%)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "hsl(220, 15%, 60%)")}
                  >
                    <s.icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div>
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider" style={{ color: "#ffffff" }}>Navigation</h4>
              <ul className="space-y-3">
                {[
                  { label: "Home", href: "/" },
                  { label: "How it Works", href: "#how-it-works" },
                  { label: "Features", href: "#features" },
                  { label: "FAQ", href: "#faq" },
                ].map(link => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm transition-colors hover:text-white"
                      style={{ color: "hsl(220, 15%, 60%)" }}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Platform */}
            <div>
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider" style={{ color: "#ffffff" }}>Platform</h4>
              <ul className="space-y-3">
                {[
                  { label: "Student Dashboard", href: "/dashboard" },
                  { label: "Faculty Dashboard", href: "/dashboard" },
                  { label: "Sign In", href: "/login" },
                  { label: "Register", href: "/register" },
                ].map(link => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-sm transition-colors hover:text-white"
                      style={{ color: "hsl(220, 15%, 60%)" }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider" style={{ color: "#ffffff" }}>Contact</h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="mailto:support@docscan.edu"
                    className="text-sm flex items-center gap-2 transition-colors hover:text-white"
                    style={{ color: "hsl(220, 15%, 60%)" }}
                  >
                    <Mail className="h-4 w-4 shrink-0" />
                    support@docscan.edu
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:admin@docscan.edu"
                    className="text-sm flex items-center gap-2 transition-colors hover:text-white"
                    style={{ color: "hsl(220, 15%, 60%)" }}
                  >
                    <Mail className="h-4 w-4 shrink-0" />
                    admin@docscan.edu
                  </a>
                </li>
              </ul>

              <div className="mt-6 p-3 rounded-lg" style={{ background: "hsl(222, 28%, 16%)", border: "1px solid hsl(222, 22%, 22%)" }}>
                <p className="text-xs font-medium mb-1" style={{ color: "hsl(168, 60%, 55%)" }}>Built with</p>
                <div className="flex flex-wrap gap-1">
                  {["React", "TypeScript", "Supabase", "Tailwind"].map(tech => (
                    <span
                      key={tech}
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ background: "hsl(222, 36%, 14%)", color: "hsl(220, 15%, 65%)" }}
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div
            className="mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs"
            style={{ borderTop: "1px solid hsl(222, 22%, 18%)", color: "hsl(220, 15%, 45%)" }}
          >
            <p>© {new Date().getFullYear()} DocScan — Document Similarity Detection Platform. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
              <a
                href="https://supabase.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-white transition-colors"
              >
                Powered by Supabase <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;