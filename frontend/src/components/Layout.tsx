import { NavLink, Outlet } from "react-router-dom";
import { FileText, LayoutDashboard, LogOut, Microscope, Users } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Avatar } from "./ui";

export default function Layout() {
  const { me, logout, isAdmin } = useAuth();
  if (!me) return null;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo"><Microscope size={18} /></span>
          <span>PathoSlide</span>
        </div>

        <NavLink to="/" end className="nav-link">
          <LayoutDashboard className="ico" size={18} /> Dashboard
        </NavLink>
        <NavLink to="/reports" className="nav-link">
          <FileText className="ico" size={18} /> Reports
        </NavLink>
        {isAdmin && (
          <NavLink to="/users" className="nav-link">
            <Users className="ico" size={18} /> Users & Roles
          </NavLink>
        )}

        <div className="org-chip">
          <div className="small" style={{ color: "var(--sidebar-muted)" }}>
            Organization
          </div>
          <div style={{ color: "#fff", fontWeight: 600 }}>{me.organization.name}</div>
          <div className="small mono" style={{ color: "var(--sidebar-muted)" }}>
            /{me.organization.slug}
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="grow" />
          <div className="row gap-12">
            <Avatar name={me.user.name || me.user.email} src={me.user.picture} />
            <div className="stack">
              <span style={{ fontWeight: 600, lineHeight: 1.2 }}>
                {me.user.name || me.user.email}
              </span>
              <span className="small muted" style={{ textTransform: "capitalize" }}>
                {me.user.role}
              </span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout} title="Log out" aria-label="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
