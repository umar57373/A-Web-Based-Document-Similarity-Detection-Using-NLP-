import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FileSearch, Mail, Lock, User, GraduationCap, BookOpen, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AppRole = "student" | "faculty";

// ── Validation ─────────────────────────────────────────────
const validateFullName = (v: string) => {
  if (!v.trim()) return "Full name is required";
  if (v.trim().length < 2) return "Name must be at least 2 characters";
  return "";
};
const validateEmail = (v: string) => {
  if (!v.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email address";
  return "";
};
const validatePassword = (v: string) => {
  if (!v) return "Password is required";
  if (v.length < 6) return "Password must be at least 6 characters";
  return "";
};

// ── Password strength ──────────────────────────────────────
const getPasswordStrength = (password: string) => {
  if (!password) return { score: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { score, label: "Weak", color: "bg-destructive" };
  if (score <= 2) return { score, label: "Fair", color: "bg-warning" };
  if (score <= 3) return { score, label: "Good", color: "bg-primary" };
  return { score, label: "Strong", color: "bg-success" };
};

const Register = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("student");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [touched, setTouched] = useState({ fullName: false, email: false, password: false });

  const { signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const fullNameError = touched.fullName ? validateFullName(fullName) : "";
  const emailError = touched.email ? validateEmail(email) : "";
  const passwordError = touched.password ? validatePassword(password) : "";
  const isFormValid = !validateFullName(fullName) && !validateEmail(email) && !validatePassword(password);

  const passwordStrength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ fullName: true, email: true, password: true });
    if (!isFormValid) return;
    setIsLoading(true);
    try {
      await signUp(email.trim(), password, fullName.trim(), role);
      toast({ title: "Account created!", description: "You can now sign in." });
      navigate("/dashboard");
    } catch (err: any) {
      const msg = err.message?.includes("already registered")
        ? "This email is already registered. Try signing in instead."
        : err.message;
      toast({ title: "Registration failed", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Google sign-in failed", description: err.message, variant: "destructive" });
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div
        className="hidden lg:flex lg:w-1/2 items-center justify-center p-12"
        style={{ background: "linear-gradient(145deg, hsl(222, 36%, 11%) 0%, hsl(222, 40%, 18%) 50%, hsl(180, 32%, 18%) 100%)" }}
      >
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="max-w-md text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <FileSearch className="h-12 w-12" style={{ color: "hsl(168, 60%, 55%)" }} />
            <h1 className="text-4xl font-bold tracking-tight" style={{ color: "#ffffff" }}>DocScan</h1>
          </div>
          <div className="w-16 h-1 rounded-full mx-auto mb-8" style={{ background: "hsl(168, 60%, 42%)" }} />
          <p className="text-lg leading-relaxed" style={{ color: "hsl(220, 15%, 72%)" }}>
            Join your institution's academic integrity platform. Students submit assignments, faculty reviews similarity reports.
          </p>
          <div className="mt-10 space-y-3 text-left">
            {[
              "Instant AI similarity detection",
              "Role-based student & faculty dashboards",
              "Detailed similarity reports",
              "Secure encrypted document storage",
            ].map(item => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "hsl(168, 60%, 32%)" }}>
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-sm" style={{ color: "hsl(220, 15%, 72%)" }}>{item}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background overflow-y-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md py-8">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <FileSearch className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">DocScan</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">Create your account</h2>
          <p className="text-muted-foreground mb-8">Select your role and get started</p>

          {/* Google Sign In */}
          <Button
            type="button" variant="outline" className="w-full mb-4 font-medium gap-2" size="lg"
            onClick={handleGoogleSignIn} disabled={isGoogleLoading}
          >
            {isGoogleLoading ? (
              <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </Button>

          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs text-muted-foreground"><span className="bg-background px-3">or register with email</span></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-foreground font-medium">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="fullName" placeholder="John Doe" value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  onBlur={() => setTouched(t => ({ ...t, fullName: true }))}
                  className={`pl-10 ${fullNameError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
              </div>
              {fullNameError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{fullNameError}</p>}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email" type="email" placeholder="you@university.edu" value={email}
                  onChange={e => setEmail(e.target.value)}
                  onBlur={() => setTouched(t => ({ ...t, email: true }))}
                  className={`pl-10 ${emailError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
              </div>
              {emailError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{emailError}</p>}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password" type={showPassword ? "text" : "password"} placeholder="Min 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onBlur={() => setTouched(t => ({ ...t, password: true }))}
                  className={`pl-10 pr-10 ${passwordError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  minLength={6}
                />
                <button
                  type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Password strength bar */}
              {password && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all ${i <= passwordStrength.score ? passwordStrength.color : "bg-muted"}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Password strength: <span className={`font-medium ${passwordStrength.score >= 4 ? "text-success" : passwordStrength.score >= 3 ? "text-primary" : passwordStrength.score >= 2 ? "text-warning" : "text-destructive"}`}>{passwordStrength.label}</span>
                  </p>
                </div>
              )}
              {passwordError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{passwordError}</p>}
            </div>

            {/* Role */}
            <div className="space-y-3">
              <Label className="text-foreground font-medium">I am a...</Label>
              <RadioGroup value={role} onValueChange={v => setRole(v as AppRole)} className="grid grid-cols-2 gap-3">
                <Label
                  htmlFor="student"
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all ${role === "student" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <RadioGroupItem value="student" id="student" className="sr-only" />
                  <GraduationCap className={`h-8 w-8 ${role === "student" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`font-semibold text-sm ${role === "student" ? "text-primary" : "text-foreground"}`}>Student</span>
                  <span className="text-xs text-muted-foreground text-center">Submit assignments</span>
                </Label>
                <Label
                  htmlFor="faculty"
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all ${role === "faculty" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <RadioGroupItem value="faculty" id="faculty" className="sr-only" />
                  <BookOpen className={`h-8 w-8 ${role === "faculty" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`font-semibold text-sm ${role === "faculty" ? "text-primary" : "text-foreground"}`}>Faculty</span>
                  <span className="text-xs text-muted-foreground text-center">Review reports</span>
                </Label>
              </RadioGroup>
            </div>

            <Button type="submit" className="w-full font-semibold" size="lg" disabled={isLoading}>
              {isLoading ? (
                <><span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />Creating account...</>
              ) : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-semibold hover:underline">Sign in</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Register;