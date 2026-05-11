import type { KyselySchema } from "@jurnapod/db";
import type { CompanyResponse, CompanyActor, CreateCompanyInput, CreateCompanyInputWithActor, UpdateCompanyInput, ListCompaniesInput, GetCompanyInput, DeactivateCompanyInput, ReactivateCompanyInput } from "../types/index.js";
/**
 * CompanyService - Handles company CRUD operations and provisioning.
 * This service requires a database connection to be passed in.
 */
export declare class CompanyService {
    private db;
    constructor(db: KyselySchema);
    /**
     * Create a company with minimal setup (no bootstrap defaults).
     * Use this for testing - it only inserts the company row.
     * For production use, use createCompany() which includes bootstrap.
     */
    createCompanyBasic(params: CreateCompanyInput, db?: KyselySchema): Promise<{
        id: number;
        code: string;
        name: string;
    }>;
    /**
     * Create a new company with full bootstrap (for production use).
     * For testing, use createCompanyBasic() instead.
     */
    createCompany(params: CreateCompanyInputWithActor): Promise<CompanyResponse>;
    /**
     * List companies (optionally scoped to a company id)
     */
    listCompanies(params?: ListCompaniesInput): Promise<CompanyResponse[]>;
    /**
     * Get a single company by ID
     */
    getCompany(params: GetCompanyInput): Promise<CompanyResponse>;
    /**
     * Update a company
     */
    updateCompany(params: UpdateCompanyInput): Promise<CompanyResponse>;
    /**
     * Delete a company (soft delete via deactivation)
     */
    deleteCompany(params: {
        companyId: number;
        actor: CompanyActor;
    }): Promise<void>;
    /**
     * Deactivate a company (soft delete)
     */
    deactivateCompany(params: DeactivateCompanyInput): Promise<CompanyResponse>;
    /**
     * Reactivate a deactivated company
     */
    reactivateCompany(params: ReactivateCompanyInput): Promise<CompanyResponse>;
}
//# sourceMappingURL=company-service.d.ts.map