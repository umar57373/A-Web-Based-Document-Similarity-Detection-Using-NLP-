import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { FileSearch, LogOut, GraduationCap, BookOpen } from "lucide-react";

const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const { user, role, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <FileSearch className="h-7 w-7 text-primary" />
            <span className="text-xl font-display font-bold text-foreground">DocScan</span>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {role === "faculty" ? <BookOpen className="h-3 w-3" /> : <GraduationCap className="h-3 w-3" />}
              {role === "faculty" ? "Faculty" : "Student"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="container px-4 py-8">{children}</main>
    </div>
  );
};

export default DashboardLayout;
