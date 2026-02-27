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

export function OutletsPage(props: OutletsPageProps) {
  const { user, accessToken } = props;
  
  const outletsQuery = useOutletsFull(user.company_id, accessToken);
  const companiesQuery = useCompanies(accessToken);
  
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const boxStyle = {
    border: "1px solid #e2ddd2",
    borderRadius: "10px",
    padding: "16px",
    backgroundColor: "#fcfbf8",
    marginBottom: "14px"
  } as const;
  
  return (
    <>
      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>Outlet Management</h2>
        <p>Manage outlets for your company. Outlets represent physical locations or branches.</p>
        
        {outletsQuery.loading && <p>Loading outlets...</p>}
        {outletsQuery.error && <p style={{ color: "#8d2626" }}>{outletsQuery.error}</p>}
        {error && <p style={{ color: "#8d2626" }}>{error}</p>}
        {successMessage && (
          <p style={{ color: "#155724", backgroundColor: "#d4edda", padding: "8px", borderRadius: "4px", marginTop: "8px" }}>
            {successMessage}
          </p>
        )}
      </section>
      
      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Outlets ({(outletsQuery.data || []).length})</h3>
        
        {(outletsQuery.data || []).length === 0 && !outletsQuery.loading ? (
          <p>No outlets found for your company</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
            <thead>
              <tr style={{ backgroundColor: "#f5f1e8" }}>
                <th style={{ borderBottom: "1px solid #ece7dc", padding: "8px", textAlign: "left" }}>Code</th>
                <th style={{ borderBottom: "1px solid #ece7dc", padding: "8px", textAlign: "left" }}>Name</th>
              </tr>
            </thead>
            <tbody>
              {(outletsQuery.data || []).map((outlet) => (
                <tr key={outlet.id}>
                  <td style={{ borderBottom: "1px solid #ece7dc", padding: "8px" }}>
                    <code style={{ backgroundColor: "#f5f1e8", padding: "2px 6px", borderRadius: "4px" }}>
                      {outlet.code}
                    </code>
                  </td>
                  <td style={{ borderBottom: "1px solid #ece7dc", padding: "8px" }}>{outlet.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
