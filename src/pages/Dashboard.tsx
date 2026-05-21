import { useAuth } from "@/contexts/AuthContext";
import StudentDashboard from "@/components/StudentDashboard";
import FacultyDashboard from "@/components/FacultyDashboard";
import DashboardLayout from "@/components/DashboardLayout";
import { Navigate } from "react-router-dom";

const Dashboard = () => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <DashboardLayout>
      {role === "faculty" ? <FacultyDashboard /> : <StudentDashboard />}
    </DashboardLayout>
  );
};

export default Dashboard;
