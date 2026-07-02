import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  useCreateUser,
  useDeleteUser,
  usePermissionCatalog,
  useUpdateUser,
  useUsers,
} from "../api/hooks";
import { apiError } from "../api/client";
import { Avatar, CenterSpinner, Modal, StatusBadge, formatDate } from "../components/ui";
import type { Permission, Role, User } from "../api/types";

export default function UsersPage() {
  const { me } = useAuth();
  const users = useUsers();
  const catalog = usePermissionCatalog();
  const deleteUser = useDeleteUser();
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  if (users.isLoading || catalog.isLoading) return <CenterSpinner />;

  return (
    <div className="content">
      <div className="page-head">
        <div className="stack">
          <h1>Users & Roles</h1>
          <span className="muted">Invite teammates and control what each can do.</span>
        </div>
        <button className="btn btn-primary right" onClick={() => setCreating(true)}>
          <Plus size={16} /> Invite user
        </button>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Permissions</th>
              <th>Status</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.data!.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="row gap-12">
                    <Avatar name={u.name || u.email} src={u.picture} />
                    <div className="stack">
                      <span style={{ fontWeight: 600 }}>
                        {u.name || u.email.split("@")[0]}
                        {u.id === me?.user.id && <span className="muted small"> (you)</span>}
                      </span>
                      <span className="small muted">{u.email}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`badge ${u.role === "admin" ? "badge-blue" : ""}`} style={{ textTransform: "capitalize" }}>
                    {u.role}
                  </span>
                </td>
                <td className="muted small">
                  {u.role === "admin" ? "All permissions" : `${u.permissions.length} granted`}
                </td>
                <td>
                  <StatusBadge status={u.is_active ? u.status : "disabled"} />
                </td>
                <td className="muted small">{formatDate(u.created_at)}</td>
                <td>
                  <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
                    <button className="btn btn-sm" onClick={() => setEditing(u)}>Edit</button>
                    {u.id !== me?.user.id && (
                      <button
                        className="btn btn-sm btn-ghost"
                        title="Delete user"
                        aria-label="Delete user"
                        onClick={() => confirm(`Remove ${u.email}?`) && deleteUser.mutate(u.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(creating || editing) && catalog.data && (
        <UserModal
          user={editing}
          groups={catalog.data.groups}
          defaultMember={catalog.data.default_member}
          isSelf={editing?.id === me?.user.id}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function UserModal({
  user,
  groups,
  defaultMember,
  isSelf,
  onClose,
}: {
  user: User | null;
  groups: Record<string, Permission[]>;
  defaultMember: Permission[];
  isSelf: boolean;
  onClose: () => void;
}) {
  const editMode = !!user;
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "member");
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [perms, setPerms] = useState<Set<Permission>>(
    new Set(user ? user.permissions : defaultMember),
  );
  const [error, setError] = useState<string | null>(null);

  const allPerms = useMemo(() => Object.values(groups).flat(), [groups]);
  const isAdminRole = role === "admin";
  const busy = createUser.isPending || updateUser.isPending;

  function toggle(p: Permission) {
    setPerms((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  async function save() {
    setError(null);
    const permissions = isAdminRole ? allPerms : Array.from(perms);
    try {
      if (editMode) {
        await updateUser.mutateAsync({
          id: user!.id,
          body: { name, role, is_active: isActive, permissions } as Partial<User>,
        });
      } else {
        await createUser.mutateAsync({ email, name, role, permissions });
      }
      onClose();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <Modal
      title={editMode ? `Edit ${user!.email}` : "Invite user"}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || (!editMode && !email)}>
            {busy ? "Saving…" : editMode ? "Save changes" : "Invite user"}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}

      <div className="row gap-16 wrap">
        <div className="field grow" style={{ minWidth: 220 }}>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            disabled={editMode}
            placeholder="teammate@lab.com"
            onChange={(e) => setEmail(e.target.value)}
          />
          {!editMode && <p className="hint">They'll join automatically on their first Google Sign-In.</p>}
        </div>
        <div className="field grow" style={{ minWidth: 220 }}>
          <label className="label">Name</label>
          <input className="input" value={name} placeholder="Dr. Jane Doe" onChange={(e) => setName(e.target.value)} />
        </div>
      </div>

      <div className="row gap-16 wrap">
        <div className="field" style={{ minWidth: 160 }}>
          <label className="label">Role</label>
          <select
            className="input"
            value={role}
            disabled={isSelf}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          {isSelf && <p className="hint">You can't change your own role.</p>}
        </div>
        {editMode && (
          <div className="field" style={{ minWidth: 160 }}>
            <label className="label">Account</label>
            <label className="checkbox-row">
              <input type="checkbox" checked={isActive} disabled={isSelf} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>
        )}
      </div>

      <label className="label" style={{ marginTop: 8 }}>Permissions</label>
      {isAdminRole ? (
        <div className="alert alert-info">Admins have full access to every permission.</div>
      ) : (
        <div className="row gap-24 wrap" style={{ alignItems: "flex-start" }}>
          {Object.entries(groups).map(([group, perlist]) => (
            <div key={group} className="stack" style={{ minWidth: 200 }}>
              <div className="small" style={{ fontWeight: 700, margin: "6px 0" }}>{group}</div>
              {perlist.map((p) => (
                <label key={p} className="checkbox-row">
                  <input type="checkbox" checked={perms.has(p)} onChange={() => toggle(p)} />
                  <span className="mono small">{p}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
