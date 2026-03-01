// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState } from "react";
import type { SessionUser } from "../lib/session";
import {
  useOutletsFull,
  createOutlet,
  updateOutlet,
  deleteOutlet
} from "../hooks/use-outlets";
import { useCompanies } from "../hooks/use-companies";
import { ApiError } from "../lib/api-client";
import type { OutletFullResponse } from "@jurnapod/shared";

type OutletsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | null;

type OutletFormData = {
  company_id: number;
  code: string;
  name: string;
};

const emptyForm: OutletFormData = {
  company_id: 0,
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
  maxWidth: "520px",
  width: "90%"
};

export function OutletsPage(props: OutletsPageProps) {
  const { user, accessToken } = props;
  const isOwner = user.roles.includes("OWNER");
  const isSuperAdmin = user.roles.includes("SUPER_ADMIN");
  const canManageCompanies = isOwner || isSuperAdmin;

  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(user.company_id);

  const outletsQuery = useOutletsFull(
    canManageCompanies ? selectedCompanyId : user.company_id,
    accessToken
  );
  const companiesQuery = useCompanies(accessToken, { enabled: canManageCompanies });

  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingOutlet, setEditingOutlet] = useState<OutletFullResponse | null>(null);
  const [formData, setFormData] = useState<OutletFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof OutletFormData, string>>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const outlets = outletsQuery.data || [];
  const companies = companiesQuery.data || [];

  const getCompanyLabel = (companyId: number) => {
    const company = companies.find((item) => item.id === companyId);
    if (company) {
      return `${company.code} - ${company.name}`;
    }
    return `Company #${companyId}`;
  };

  const openCreateDialog = () => {
    setFormData({
      company_id: isOwner ? selectedCompanyId : user.company_id,
      code: "",
      name: ""
    });
    setFormErrors({});
    setEditingOutlet(null);
    setDialogMode("create");
    setError(null);
    setSuccessMessage(null);
  };

  const openEditDialog = (outlet: OutletFullResponse) => {
    setFormData({
      company_id: outlet.company_id,
      code: outlet.code,
      name: outlet.name
    });
    setFormErrors({});
    setEditingOutlet(outlet);
    setDialogMode("edit");
    setError(null);
    setSuccessMessage(null);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setEditingOutlet(null);
    setFormData(emptyForm);
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof OutletFormData, string>> = {};

    if (dialogMode === "create") {
      if (!formData.company_id) {
        errors.company_id = "Company is required";
      }
      if (!formData.code.trim()) {
        errors.code = "Outlet code is required";
      }
    }

    if (!formData.name.trim()) {
      errors.name = "Outlet name is required";
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
        await createOutlet(
          {
            company_id: formData.company_id,
            code: formData.code.trim(),
            name: formData.name.trim()
          },
          accessToken
        );
        setSuccessMessage("Outlet created successfully");
        await outletsQuery.refetch();
        closeDialog();
      } else if (dialogMode === "edit" && editingOutlet) {
        await updateOutlet(
          editingOutlet.id,
          {
            name: formData.name.trim()
          },
          accessToken
        );
        setSuccessMessage("Outlet updated successfully");
        await outletsQuery.refetch();
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

  const handleDelete = async (outlet: OutletFullResponse) => {
    if (!confirm(`Delete outlet "${outlet.name}"? This cannot be undone.`)) return;

    setError(null);
    setSuccessMessage(null);

    try {
      await deleteOutlet(outlet.id, accessToken);
      setSuccessMessage(`Outlet "${outlet.name}" deleted successfully`);
      await outletsQuery.refetch();
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete outlet");
      }
    }
  };

  return (
    <>
      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>Outlet Management</h2>
        <p>Manage outlets for your company. Outlets represent physical locations or branches.</p>

        {canManageCompanies && (
          <div style={{ marginTop: "16px", maxWidth: "360px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
              Company
            </label>
            {companies.length === 0 ? (
              <input
                type="text"
                value="No companies available"
                disabled
                style={{ ...inputStyle, backgroundColor: "#f5f1e8", cursor: "not-allowed" }}
              />
            ) : (
              <select
                value={String(selectedCompanyId)}
                onChange={(e) => setSelectedCompanyId(Number(e.target.value))}
                style={inputStyle}
              >
                {companies.map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.code} - {company.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div style={{ marginTop: "16px" }}>
          <button
            type="button"
            onClick={openCreateDialog}
            style={primaryButtonStyle}
            disabled={canManageCompanies && companies.length === 0}
          >
            Create Outlet
          </button>
        </div>

        {canManageCompanies && companiesQuery.loading && <p>Loading companies...</p>}
        {canManageCompanies && companiesQuery.error && <p style={{ color: "#8d2626" }}>{companiesQuery.error}</p>}
        {outletsQuery.loading && <p>Loading outlets...</p>}
        {outletsQuery.error && <p style={{ color: "#8d2626" }}>{outletsQuery.error}</p>}
        {error && <p style={{ color: "#8d2626" }}>{error}</p>}
        {successMessage && (
          <p
            style={{
              color: "#155724",
              backgroundColor: "#d4edda",
              padding: "8px",
              borderRadius: "4px",
              marginTop: "8px"
            }}
          >
            {successMessage}
          </p>
        )}
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Outlets ({outlets.length})</h3>

        {outlets.length === 0 && !outletsQuery.loading ? (
          <p>No outlets found for this company</p>
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
              {outlets.map((outlet) => (
                <tr key={outlet.id}>
                  <td style={cellStyle}>
                    <code style={{ backgroundColor: "#f5f1e8", padding: "2px 6px", borderRadius: "4px" }}>
                      {outlet.code}
                    </code>
                  </td>
                  <td style={cellStyle}>{outlet.name}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => openEditDialog(outlet)}
                      style={{ ...buttonStyle, fontSize: "12px", padding: "4px 8px" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(outlet)}
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

      {dialogMode && (
        <div style={dialogOverlayStyle} onClick={closeDialog}>
          <div style={dialogStyle} onClick={(event) => event.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>
              {dialogMode === "create" && "Create New Outlet"}
              {dialogMode === "edit" && "Edit Outlet"}
            </h3>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                Company <span style={{ color: "#8d2626" }}>*</span>
              </label>
              {dialogMode === "create" && canManageCompanies ? (
                companies.length === 0 ? (
                  <input
                    type="text"
                    value="No companies available"
                    disabled
                    style={{ ...inputStyle, backgroundColor: "#f5f1e8", cursor: "not-allowed" }}
                  />
                ) : (
                  <select
                    value={String(formData.company_id)}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        company_id: Number(event.target.value)
                      })
                    }
                    style={inputStyle}
                  >
                    {companies.map((company) => (
                      <option key={company.id} value={String(company.id)}>
                        {company.code} - {company.name}
                      </option>
                    ))}
                  </select>
                )
              ) : (
                <input
                  type="text"
                  value={
                    editingOutlet
                      ? getCompanyLabel(editingOutlet.company_id)
                      : getCompanyLabel(formData.company_id || user.company_id)
                  }
                  disabled
                  style={{ ...inputStyle, backgroundColor: "#f5f1e8", cursor: "not-allowed" }}
                />
              )}
              {formErrors.company_id && (
                <small style={{ color: "#8d2626", fontSize: "11px" }}>
                  {formErrors.company_id}
                </small>
              )}
              {dialogMode === "edit" && (
                <small style={{ display: "block", marginTop: "4px", color: "#6b5d48", fontSize: "11px" }}>
                  Company cannot be changed
                </small>
              )}
            </div>

            {dialogMode === "create" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Outlet Code <span style={{ color: "#8d2626" }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(event) => setFormData({ ...formData, code: event.target.value })}
                  style={inputStyle}
                  placeholder="e.g., MAIN, BRANCH1"
                  maxLength={32}
                />
                {formErrors.code && (
                  <small style={{ color: "#8d2626", fontSize: "11px" }}>{formErrors.code}</small>
                )}
                <small style={{ display: "block", marginTop: "4px", color: "#6b5d48", fontSize: "11px" }}>
                  Code must be unique within the company
                </small>
              </div>
            )}

            {dialogMode === "edit" && editingOutlet && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Outlet Code
                </label>
                <input
                  type="text"
                  value={editingOutlet.code}
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
                Outlet Name <span style={{ color: "#8d2626" }}>*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                style={inputStyle}
                placeholder="e.g., Main Branch"
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
              <button type="button" onClick={closeDialog} style={buttonStyle} disabled={submitting}>
                Cancel
              </button>
              <button type="button" onClick={handleSubmit} style={primaryButtonStyle} disabled={submitting}>
                {submitting ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
