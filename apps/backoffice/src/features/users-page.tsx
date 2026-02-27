import { useState, useMemo } from "react";
import type { SessionUser } from "../lib/session";
import {
  useUsers,
  useRoles,
  useOutlets,
  createUser,
  updateUser,
  updateUserRoles,
  updateUserOutlets,
  updateUserPassword,
  deactivateUser,
  reactivateUser
} from "../hooks/use-users";
import { ApiError } from "../lib/api-client";
import type { UserResponse, RoleResponse, OutletResponse } from "@jurnapod/shared";

type UsersPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | "roles" | "outlets" | "password" | null;

type UserFormData = {
  email: string;
  password: string;
  role_codes: string[];
  outlet_ids: number[];
  is_active: boolean;
};

const emptyForm: UserFormData = {
  email: "",
  password: "",
  role_codes: [],
  outlet_ids: [],
  is_active: true
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
  padding: "6px 8px"
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

const badgeStyle = {
  display: "inline-block",
  padding: "2px 6px",
  borderRadius: "4px",
  fontSize: "11px",
  fontWeight: "bold" as const,
  marginRight: "4px",
  marginBottom: "2px"
};

const activeBadgeStyle = {
  ...badgeStyle,
  backgroundColor: "#d4edda",
  color: "#155724"
} as const;

const inactiveBadgeStyle = {
  ...badgeStyle,
  backgroundColor: "#f8d7da",
  color: "#721c24"
} as const;

const roleBadgeStyle = {
  ...badgeStyle,
  backgroundColor: "#d1ecf1",
  color: "#0c5460"
} as const;

const outletBadgeStyle = {
  ...badgeStyle,
  backgroundColor: "#fff3cd",
  color: "#856404"
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
  maxWidth: "600px",
  width: "90%",
  maxHeight: "90vh",
  overflow: "auto"
};

export function UsersPage(props: UsersPageProps) {
  const { user, accessToken } = props;
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  
  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null);
  const [formData, setFormData] = useState<UserFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof UserFormData, string>>>({});
  
  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // API hooks
  const usersQuery = useUsers(user.company_id, accessToken, {
    is_active: statusFilter === "all" ? undefined : statusFilter === "active",
    search: searchTerm || undefined
  });
  
  const rolesQuery = useRoles(accessToken);
  const outletsQuery = useOutlets(user.company_id, accessToken);
  
  // Filtered users
  const filteredUsers = useMemo(() => {
    let result = usersQuery.data;
    
    if (roleFilter !== "all") {
      result = result.filter(u => u.roles.includes(roleFilter as any));
    }
    
    return result;
  }, [usersQuery.data, roleFilter]);
  
  // Handlers
  const openCreateDialog = () => {
    setFormData(emptyForm);
    setFormErrors({});
    setEditingUser(null);
    setDialogMode("create");
    setError(null);
    setSuccessMessage(null);
  };
  
  const openEditDialog = (targetUser: UserResponse) => {
    setFormData({
      email: targetUser.email,
      password: "",
      role_codes: targetUser.roles,
      outlet_ids: targetUser.outlets.map(o => o.id),
      is_active: targetUser.is_active
    });
    setFormErrors({});
    setEditingUser(targetUser);
    setDialogMode("edit");
    setError(null);
    setSuccessMessage(null);
  };
  
  const openRolesDialog = (targetUser: UserResponse) => {
    setFormData({
      ...emptyForm,
      role_codes: targetUser.roles
    });
    setFormErrors({});
    setEditingUser(targetUser);
    setDialogMode("roles");
    setError(null);
    setSuccessMessage(null);
  };
  
  const openOutletsDialog = (targetUser: UserResponse) => {
    setFormData({
      ...emptyForm,
      outlet_ids: targetUser.outlets.map(o => o.id)
    });
    setFormErrors({});
    setEditingUser(targetUser);
    setDialogMode("outlets");
    setError(null);
    setSuccessMessage(null);
  };
  
  const openPasswordDialog = (targetUser: UserResponse) => {
    setFormData({ ...emptyForm, password: "" });
    setFormErrors({});
    setEditingUser(targetUser);
    setDialogMode("password");
    setError(null);
    setSuccessMessage(null);
  };
  
  const closeDialog = () => {
    setDialogMode(null);
    setEditingUser(null);
    setFormData(emptyForm);
    setFormErrors({});
  };
  
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof UserFormData, string>> = {};
    
    if (dialogMode === "create" || dialogMode === "edit") {
      if (!formData.email.trim()) {
        errors.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errors.email = "Invalid email format";
      }
      
      if (dialogMode === "create" && !formData.password) {
        errors.password = "Password is required";
      }
      
      if (formData.password && formData.password.length < 8) {
        errors.password = "Password must be at least 8 characters";
      }
    }
    
    if (dialogMode === "password") {
      if (!formData.password) {
        errors.password = "Password is required";
      } else if (formData.password.length < 8) {
        errors.password = "Password must be at least 8 characters";
      }
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
        await createUser({
          company_id: user.company_id,
          email: formData.email,
          password: formData.password,
          role_codes: formData.role_codes.length > 0 ? formData.role_codes as any : undefined,
          outlet_ids: formData.outlet_ids.length > 0 ? formData.outlet_ids : undefined,
          is_active: formData.is_active
        }, accessToken);
        setSuccessMessage("User created successfully");
        await usersQuery.refetch({ force: true });
        closeDialog();
      } else if (dialogMode === "edit" && editingUser) {
        await updateUser(editingUser.id, {
          email: formData.email !== editingUser.email ? formData.email : undefined
        }, accessToken);
        setSuccessMessage("User updated successfully");
        await usersQuery.refetch({ force: true });
        closeDialog();
      } else if (dialogMode === "roles" && editingUser) {
        await updateUserRoles(editingUser.id, {
          role_codes: formData.role_codes as any
        }, accessToken);
        setSuccessMessage("User roles updated successfully");
        await usersQuery.refetch({ force: true });
        closeDialog();
      } else if (dialogMode === "outlets" && editingUser) {
        await updateUserOutlets(editingUser.id, {
          outlet_ids: formData.outlet_ids
        }, accessToken);
        setSuccessMessage("User outlets updated successfully");
        await usersQuery.refetch({ force: true });
        closeDialog();
      } else if (dialogMode === "password" && editingUser) {
        await updateUserPassword(editingUser.id, {
          password: formData.password
        }, accessToken);
        setSuccessMessage("Password changed successfully");
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
  
  const handleDeactivate = async (targetUser: UserResponse) => {
    if (!confirm(`Deactivate user ${targetUser.email}?`)) return;
    
    setError(null);
    setSuccessMessage(null);
    
    try {
      await deactivateUser(targetUser.id, accessToken);
      setSuccessMessage("User deactivated successfully");
      await usersQuery.refetch({ force: true });
    } catch (deactivateError) {
      if (deactivateError instanceof ApiError) {
        setError(deactivateError.message);
      } else {
        setError("Failed to deactivate user");
      }
    }
  };
  
  const handleReactivate = async (targetUser: UserResponse) => {
    if (!confirm(`Reactivate user ${targetUser.email}?`)) return;
    
    setError(null);
    setSuccessMessage(null);
    
    try {
      await reactivateUser(targetUser.id, accessToken);
      setSuccessMessage("User reactivated successfully");
      await usersQuery.refetch({ force: true });
    } catch (reactivateError) {
      if (reactivateError instanceof ApiError) {
        setError(reactivateError.message);
      } else {
        setError("Failed to reactivate user");
      }
    }
  };
  
  return (
    <>
      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>User Management</h2>
        <p>Manage users, roles, and permissions for your organization.</p>
        
        <div style={{ marginTop: "16px" }}>
          <button type="button" onClick={openCreateDialog} style={primaryButtonStyle}>
            Create User
          </button>
        </div>
        
        {usersQuery.loading && <p>Loading users...</p>}
        {usersQuery.error && <p style={{ color: "#8d2626" }}>{usersQuery.error}</p>}
        {error && <p style={{ color: "#8d2626" }}>{error}</p>}
        {successMessage && (
          <p style={{ color: "#155724", backgroundColor: "#d4edda", padding: "8px", borderRadius: "4px", marginTop: "8px" }}>
            {successMessage}
          </p>
        )}
      </section>
      
      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Filters</h3>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search by email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, minWidth: "250px" }}
          />
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={inputStyle}
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All Roles</option>
            {rolesQuery.data.map(role => (
              <option key={role.code} value={role.code}>{role.name}</option>
            ))}
          </select>
        </div>
      </section>
      
      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Users ({filteredUsers.length})</h3>
        
        {filteredUsers.length === 0 && !usersQuery.loading ? (
          <p>No users found</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: "#f5f1e8" }}>
                <th style={{ ...cellStyle, textAlign: "left" }}>Email</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Roles</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Outlets</th>
                <th style={{ ...cellStyle, textAlign: "center" }}>Status</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((targetUser) => (
                <tr key={targetUser.id}>
                  <td style={cellStyle}>{targetUser.email}</td>
                  <td style={cellStyle}>
                    {targetUser.roles.length === 0 ? (
                      <span style={{ color: "#999" }}>No roles</span>
                    ) : (
                      targetUser.roles.map(role => (
                        <span key={role} style={roleBadgeStyle}>{role}</span>
                      ))
                    )}
                  </td>
                  <td style={cellStyle}>
                    {targetUser.outlets.length === 0 ? (
                      <span style={{ color: "#999" }}>No outlets</span>
                    ) : (
                      targetUser.outlets.map(outlet => (
                        <span key={outlet.id} style={outletBadgeStyle}>{outlet.name}</span>
                      ))
                    )}
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <span style={targetUser.is_active ? activeBadgeStyle : inactiveBadgeStyle}>
                      {targetUser.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => openEditDialog(targetUser)}
                      style={{ ...buttonStyle, fontSize: "12px", padding: "4px 8px" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => openRolesDialog(targetUser)}
                      style={{ ...buttonStyle, fontSize: "12px", padding: "4px 8px" }}
                    >
                      Roles
                    </button>
                    <button
                      type="button"
                      onClick={() => openOutletsDialog(targetUser)}
                      style={{ ...buttonStyle, fontSize: "12px", padding: "4px 8px" }}
                    >
                      Outlets
                    </button>
                    <button
                      type="button"
                      onClick={() => openPasswordDialog(targetUser)}
                      style={{ ...buttonStyle, fontSize: "12px", padding: "4px 8px" }}
                    >
                      Password
                    </button>
                    {targetUser.is_active ? (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(targetUser)}
                        style={{ ...dangerButtonStyle, fontSize: "12px", padding: "4px 8px" }}
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReactivate(targetUser)}
                        style={{ ...primaryButtonStyle, fontSize: "12px", padding: "4px 8px" }}
                      >
                        Reactivate
                      </button>
                    )}
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
              {dialogMode === "create" && "Create New User"}
              {dialogMode === "edit" && "Edit User"}
              {dialogMode === "roles" && "Manage User Roles"}
              {dialogMode === "outlets" && "Manage User Outlets"}
              {dialogMode === "password" && "Change Password"}
            </h3>
            
            {(dialogMode === "create" || dialogMode === "edit") && (
              <>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                    Email <span style={{ color: "#8d2626" }}>*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{ ...inputStyle, width: "100%" }}
                    placeholder="user@example.com"
                  />
                  {formErrors.email && (
                    <small style={{ color: "#8d2626", fontSize: "11px" }}>{formErrors.email}</small>
                  )}
                </div>
                
                {dialogMode === "create" && (
                  <>
                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                        Password <span style={{ color: "#8d2626" }}>*</span>
                      </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        style={{ ...inputStyle, width: "100%" }}
                        placeholder="Minimum 8 characters"
                      />
                      {formErrors.password && (
                        <small style={{ color: "#8d2626", fontSize: "11px" }}>{formErrors.password}</small>
                      )}
                    </div>
                    
                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                        Roles
                      </label>
                      <div style={{ border: "1px solid #cabfae", borderRadius: "6px", padding: "8px", maxHeight: "150px", overflow: "auto" }}>
                        {rolesQuery.data.map(role => (
                          <label key={role.code} style={{ display: "block", marginBottom: "4px" }}>
                            <input
                              type="checkbox"
                              checked={formData.role_codes.includes(role.code)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({ ...formData, role_codes: [...formData.role_codes, role.code] });
                                } else {
                                  setFormData({ ...formData, role_codes: formData.role_codes.filter(c => c !== role.code) });
                                }
                              }}
                            />
                            {" "}{role.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                        Outlets
                      </label>
                      <div style={{ border: "1px solid #cabfae", borderRadius: "6px", padding: "8px", maxHeight: "150px", overflow: "auto" }}>
                        {outletsQuery.data.map(outlet => (
                          <label key={outlet.id} style={{ display: "block", marginBottom: "4px" }}>
                            <input
                              type="checkbox"
                              checked={formData.outlet_ids.includes(outlet.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({ ...formData, outlet_ids: [...formData.outlet_ids, outlet.id] });
                                } else {
                                  setFormData({ ...formData, outlet_ids: formData.outlet_ids.filter(id => id !== outlet.id) });
                                }
                              }}
                            />
                            {" "}{outlet.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        />
                        Active
                      </label>
                    </div>
                  </>
                )}
              </>
            )}
            
            {dialogMode === "roles" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Select Roles
                </label>
                <div style={{ border: "1px solid #cabfae", borderRadius: "6px", padding: "8px", maxHeight: "300px", overflow: "auto" }}>
                  {rolesQuery.data.map(role => (
                    <label key={role.code} style={{ display: "block", marginBottom: "4px" }}>
                      <input
                        type="checkbox"
                        checked={formData.role_codes.includes(role.code)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, role_codes: [...formData.role_codes, role.code] });
                          } else {
                            setFormData({ ...formData, role_codes: formData.role_codes.filter(c => c !== role.code) });
                          }
                        }}
                      />
                      {" "}{role.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            
            {dialogMode === "outlets" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Select Outlets
                </label>
                <div style={{ border: "1px solid #cabfae", borderRadius: "6px", padding: "8px", maxHeight: "300px", overflow: "auto" }}>
                  {outletsQuery.data.map(outlet => (
                    <label key={outlet.id} style={{ display: "block", marginBottom: "4px" }}>
                      <input
                        type="checkbox"
                        checked={formData.outlet_ids.includes(outlet.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, outlet_ids: [...formData.outlet_ids, outlet.id] });
                          } else {
                            setFormData({ ...formData, outlet_ids: formData.outlet_ids.filter(id => id !== outlet.id) });
                          }
                        }}
                      />
                      {" "}{outlet.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            
            {dialogMode === "password" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  New Password <span style={{ color: "#8d2626" }}>*</span>
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  style={{ ...inputStyle, width: "100%" }}
                  placeholder="Minimum 8 characters"
                />
                {formErrors.password && (
                  <small style={{ color: "#8d2626", fontSize: "11px" }}>{formErrors.password}</small>
                )}
              </div>
            )}
            
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
