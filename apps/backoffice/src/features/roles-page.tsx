import { useState } from "react";
import type { SessionUser } from "../lib/session";
import {
  useRoles,
  createRole,
  updateRole,
  deleteRole
} from "../hooks/use-users";
import { ApiError } from "../lib/api-client";
import type { RoleResponse } from "@jurnapod/shared";

type RolesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | null;

type RoleFormData = {
  code: string;
  name: string;
};

const emptyForm: RoleFormData = {
  code: "",
  name: ""
};

const boxStyle = {
  border: "1px solid #e2ddd2",
  borderRadius: "10px",
  padding: "16px",
  backgroundColor: "#fcfbf8",
  marginBottom: "14px"
} as const;

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const
};

const cellStyle = {
  borderBottom: "1px solid #ece7dc",
  padding: "8px"
} as const;

const inputStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "6px 8px",
  width: "100%",
  boxSizing: "border-box" as const
} as const;

const buttonStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "6px 12px",
  backgroundColor: "#fff",
  cursor: "pointer",
  marginRight: "8px"
} as const;

const primaryButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#2f5f4a",
  color: "#fff",
  border: "1px solid #2f5f4a"
} as const;

const dangerButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#8d2626",
  color: "#fff",
  border: "1px solid #8d2626"
} as const;

const dialogOverlayStyle = {
  position: "fixed" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000
};

const dialogStyle = {
  backgroundColor: "#fff",
  borderRadius: "10px",
  padding: "24px",
  maxWidth: "500px",
  width: "90%"
};

export function RolesPage(props: RolesPageProps) {
  const { accessToken } = props;
  
  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingRole, setEditingRole] = useState<RoleResponse | null>(null);
  const [formData, setFormData] = useState<RoleFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof RoleFormData, string>>>({});
  
  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // API hooks
  const rolesQuery = useRoles(accessToken);
  
  // Handlers
  const openCreateDialog = () => {
    setFormData(emptyForm);
    setFormErrors({});
    setEditingRole(null);
    setDialogMode("create");
    setError(null);
    setSuccessMessage(null);
  };
  
  const openEditDialog = (role: RoleResponse) => {
    setFormData({
      code: role.code,
      name: role.name
    });
    setFormErrors({});
    setEditingRole(role);
    setDialogMode("edit");
    setError(null);
    setSuccessMessage(null);
  };
  
  const closeDialog = () => {
    setDialogMode(null);
    setEditingRole(null);
    setFormData(emptyForm);
    setFormErrors({});
  };
  
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof RoleFormData, string>> = {};
    
    if (dialogMode === "create") {
      if (!formData.code.trim()) {
        errors.code = "Role code is required";
      } else if (!/^[A-Z_]+$/.test(formData.code)) {
        errors.code = "Role code must be uppercase letters and underscores only";
      }
    }
    
    if (!formData.name.trim()) {
      errors.name = "Role name is required";
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      if (dialogMode === "create") {
        await createRole({
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim()
        }, accessToken);
        setSuccessMessage("Role created successfully");
        await rolesQuery.refetch();
        closeDialog();
      } else if (dialogMode === "edit" && editingRole) {
        await updateRole(editingRole.id, {
          name: formData.name.trim()
        }, accessToken);
        setSuccessMessage("Role updated successfully");
        await rolesQuery.refetch();
        closeDialog();
      }
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("An error occurred");
      }
    } finally {
      setSubmitting(false);
    }
  };
  
  const handleDelete = async (role: RoleResponse) => {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    
    setError(null);
    setSuccessMessage(null);
    
    try {
      await deleteRole(role.id, accessToken);
      setSuccessMessage(`Role "${role.name}" deleted successfully`);
      await rolesQuery.refetch();
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete role");
      }
    }
  };
  
  return (
    <>
      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>Role Management</h2>
        <p>Manage system roles for access control.</p>
        
        <div style={{ marginTop: "16px" }}>
          <button type="button" onClick={openCreateDialog} style={primaryButtonStyle}>
            Create Role
          </button>
        </div>
        
        {rolesQuery.loading && <p>Loading roles...</p>}
        {rolesQuery.error && <p style={{ color: "#8d2626" }}>{rolesQuery.error}</p>}
        {error && <p style={{ color: "#8d2626" }}>{error}</p>}
        {successMessage && (
          <p style={{ color: "#155724", backgroundColor: "#d4edda", padding: "8px", borderRadius: "4px", marginTop: "8px" }}>
            {successMessage}
          </p>
        )}
      </section>
      
      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Roles ({(rolesQuery.data || []).length})</h3>
        
        {(rolesQuery.data || []).length === 0 && !rolesQuery.loading ? (
          <p>No roles found</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: "#f5f1e8" }}>
                <th style={{ ...cellStyle, textAlign: "left" }}>Code</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Name</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(rolesQuery.data || []).map((role) => (
                <tr key={role.id}>
                  <td style={cellStyle}>
                    <code style={{ backgroundColor: "#f5f1e8", padding: "2px 6px", borderRadius: "4px" }}>
                      {role.code}
                    </code>
                  </td>
                  <td style={cellStyle}>{role.name}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => openEditDialog(role)}
                      style={{ ...buttonStyle, fontSize: "12px", padding: "4px 8px" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(role)}
                      style={{ ...dangerButtonStyle, fontSize: "12px", padding: "4px 8px" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      
      {/* Dialogs */}
      {dialogMode && (
        <div style={dialogOverlayStyle} onClick={closeDialog}>
          <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>
              {dialogMode === "create" && "Create New Role"}
              {dialogMode === "edit" && "Edit Role"}
            </h3>
            
            {dialogMode === "create" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Role Code <span style={{ color: "#8d2626" }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  style={inputStyle}
                  placeholder="e.g., MANAGER, SUPERVISOR"
                  maxLength={64}
                />
                {formErrors.code && (
                  <small style={{ color: "#8d2626", fontSize: "11px" }}>{formErrors.code}</small>
                )}
                <small style={{ display: "block", marginTop: "4px", color: "#6b5d48", fontSize: "11px" }}>
                  Uppercase letters and underscores only
                </small>
              </div>
            )}
            
            {dialogMode === "edit" && editingRole && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Role Code
                </label>
                <input
                  type="text"
                  value={editingRole.code}
                  disabled
                  style={{ ...inputStyle, backgroundColor: "#f5f1e8", cursor: "not-allowed" }}
                />
                <small style={{ display: "block", marginTop: "4px", color: "#6b5d48", fontSize: "11px" }}>
                  Code cannot be changed
                </small>
              </div>
            )}
            
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                Role Name <span style={{ color: "#8d2626" }}>*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={inputStyle}
                placeholder="e.g., Manager, Supervisor"
                maxLength={191}
              />
              {formErrors.name && (
                <small style={{ color: "#8d2626", fontSize: "11px" }}>{formErrors.name}</small>
              )}
            </div>
            
            {error && (
              <p style={{ color: "#8d2626", backgroundColor: "#f8d7da", padding: "8px", borderRadius: "4px" }}>
                {error}
              </p>
            )}
            
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                type="button"
                onClick={closeDialog}
                style={buttonStyle}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                style={primaryButtonStyle}
                disabled={submitting}
              >
                {submitting ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
