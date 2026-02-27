import { useState } from "react";
import type { SessionUser } from "../lib/session";
import {
  useCompanies,
  createCompany,
  updateCompany,
  deleteCompany
} from "../hooks/use-companies";
import { ApiError } from "../lib/api-client";
import type { CompanyResponse } from "@jurnapod/shared";

type CompaniesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | null;

type CompanyFormData = {
  code: string;
  name: string;
};

const emptyForm: CompanyFormData = {
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

export function CompaniesPage(props: CompaniesPageProps) {
  const { accessToken } = props;
  
  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingCompany, setEditingCompany] = useState<CompanyResponse | null>(null);
  const [formData, setFormData] = useState<CompanyFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof CompanyFormData, string>>>({});
  
  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // API hooks
  const companiesQuery = useCompanies(accessToken);
  
  // Handlers
  const openCreateDialog = () => {
    setFormData(emptyForm);
    setFormErrors({});
    setEditingCompany(null);
    setDialogMode("create");
    setError(null);
    setSuccessMessage(null);
  };
  
  const openEditDialog = (company: CompanyResponse) => {
    setFormData({
      code: company.code,
      name: company.name
    });
    setFormErrors({});
    setEditingCompany(company);
    setDialogMode("edit");
    setError(null);
    setSuccessMessage(null);
  };
  
  const closeDialog = () => {
    setDialogMode(null);
    setEditingCompany(null);
    setFormData(emptyForm);
    setFormErrors({});
  };
  
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof CompanyFormData, string>> = {};
    
    if (dialogMode === "create") {
      if (!formData.code.trim()) {
        errors.code = "Company code is required";
      } else if (!/^[A-Z0-9_-]+$/.test(formData.code)) {
        errors.code = "Company code must be uppercase letters, numbers, hyphens, and underscores only";
      }
    }
    
    if (!formData.name.trim()) {
      errors.name = "Company name is required";
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
        await createCompany({
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim()
        }, accessToken);
        setSuccessMessage("Company created successfully");
        await companiesQuery.refetch();
        closeDialog();
      } else if (dialogMode === "edit" && editingCompany) {
        await updateCompany(editingCompany.id, {
          name: formData.name.trim()
        }, accessToken);
        setSuccessMessage("Company updated successfully");
        await companiesQuery.refetch();
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
  
  const handleDelete = async (company: CompanyResponse) => {
    if (!confirm(`Delete company "${company.name}"? This will also delete all associated data. This cannot be undone.`)) return;
    
    setError(null);
    setSuccessMessage(null);
    
    try {
      await deleteCompany(company.id, accessToken);
      setSuccessMessage(`Company "${company.name}" deleted successfully`);
      await companiesQuery.refetch();
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete company");
      }
    }
  };
  
  return (
    <>
      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>Company Management</h2>
        <p>Manage companies in the system. Each company can have multiple users and outlets.</p>
        
        <div style={{ marginTop: "16px" }}>
          <button type="button" onClick={openCreateDialog} style={primaryButtonStyle}>
            Create Company
          </button>
        </div>
        
        {companiesQuery.loading && <p>Loading companies...</p>}
        {companiesQuery.error && <p style={{ color: "#8d2626" }}>{companiesQuery.error}</p>}
        {error && <p style={{ color: "#8d2626" }}>{error}</p>}
        {successMessage && (
          <p style={{ color: "#155724", backgroundColor: "#d4edda", padding: "8px", borderRadius: "4px", marginTop: "8px" }}>
            {successMessage}
          </p>
        )}
      </section>
      
      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Companies ({(companiesQuery.data || []).length})</h3>
        
        {(companiesQuery.data || []).length === 0 && !companiesQuery.loading ? (
          <p>No companies found</p>
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
              {(companiesQuery.data || []).map((company) => (
                <tr key={company.id}>
                  <td style={cellStyle}>
                    <code style={{ backgroundColor: "#f5f1e8", padding: "2px 6px", borderRadius: "4px" }}>
                      {company.code}
                    </code>
                  </td>
                  <td style={cellStyle}>{company.name}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => openEditDialog(company)}
                      style={{ ...buttonStyle, fontSize: "12px", padding: "4px 8px" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(company)}
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
              {dialogMode === "create" && "Create New Company"}
              {dialogMode === "edit" && "Edit Company"}
            </h3>
            
            {dialogMode === "create" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Company Code <span style={{ color: "#8d2626" }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  style={inputStyle}
                  placeholder="e.g., ACME, COMPANY1"
                  maxLength={32}
                />
                {formErrors.code && (
                  <small style={{ color: "#8d2626", fontSize: "11px" }}>{formErrors.code}</small>
                )}
                <small style={{ display: "block", marginTop: "4px", color: "#6b5d48", fontSize: "11px" }}>
                  Uppercase letters, numbers, hyphens, and underscores only
                </small>
              </div>
            )}
            
            {dialogMode === "edit" && editingCompany && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Company Code
                </label>
                <input
                  type="text"
                  value={editingCompany.code}
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
                Company Name <span style={{ color: "#8d2626" }}>*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={inputStyle}
                placeholder="e.g., ACME Corporation"
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
