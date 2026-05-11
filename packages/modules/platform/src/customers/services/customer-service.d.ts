import type { KyselySchema } from "@jurnapod/db";
import type { CustomerDetail, CreateCustomerInput, UpdateCustomerInput, CustomerListFilters, CustomerActor } from "../types/customers.js";
import type { CustomerRepository } from "../interfaces/customer-repository.js";
import type { AccessScopeChecker } from "../../users/interfaces/access-scope-checker.js";
export interface CustomerService {
    /**
     * List customers for a company with pagination and filtering.
     */
    listCustomers(params: {
        companyId: number;
        filters?: CustomerListFilters;
        actor: CustomerActor;
    }): Promise<{
        customers: CustomerDetail[];
        total: number;
    }>;
    /**
     * Get a customer by ID.
     */
    getCustomer(params: {
        companyId: number;
        customerId: number;
        actor: CustomerActor;
    }): Promise<CustomerDetail>;
    /**
     * Create a new customer.
     */
    createCustomer(params: {
        companyId: number;
        input: CreateCustomerInput;
        actor: CustomerActor;
    }): Promise<CustomerDetail>;
    /**
     * Update an existing customer.
     */
    updateCustomer(params: {
        companyId: number;
        customerId: number;
        input: UpdateCustomerInput;
        actor: CustomerActor;
    }): Promise<CustomerDetail>;
    /**
     * Soft delete a customer.
     */
    deleteCustomer(params: {
        companyId: number;
        customerId: number;
        actor: CustomerActor;
    }): Promise<void>;
}
export interface CustomerServiceDeps {
    db: KyselySchema;
    customerRepository: CustomerRepository;
    accessScopeChecker: AccessScopeChecker;
}
/**
 * Factory to create CustomerService instance.
 */
export declare function createCustomerService(deps: CustomerServiceDeps): CustomerService;
//# sourceMappingURL=customer-service.d.ts.map