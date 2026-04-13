// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { AccountMappingsPage as AccountMappingsSettingsPage } from "./account-mappings-page";
import { AccountTypesPage as AccountTypesManagementPage } from "./account-types-page";
import { AccountsPage as ChartOfAccountsPage } from "./accounts-page";
import { AuditLogsPage as AuditLogsManagementPage } from "./audit-logs-page";
import { CashBankPage as CashBankManagementPage } from "./cash-bank-page";
import { CompaniesPage as CompaniesManagementPage } from "./companies-page";
import { FeatureSettingsPage as FeatureSettingsFeaturePage } from "./feature-settings-page";
import { FiscalYearsPage as FiscalYearsManagementPage } from "./fiscal-years-page";
import { FixedAssetsPage as FixedAssetsManagementPage } from "./fixed-assets/FixedAssetsPage";
import { ItemGroupsPage as ItemGroupsManagementPage } from "./item-groups-page";
import { ItemsPage as ItemsManagementPage } from "./items-page";
import { TransactionsPage as TransactionInputPage } from "./transactions-page";
import { PricesPage as PricesManagementPage } from "./prices-page";
import { TransactionTemplatesPage as TransactionTemplatesManagementPage } from "./transaction-templates-page";
import {
  AccountingWorksheetPage as AccountingWorksheetReportPage,
  DailySalesPage as DailySalesReportPage,
  GeneralLedgerPage as GeneralLedgerReportPage,
  JournalsPage as JournalsReportPage,
  ProfitLossPage as ProfitLossReportPage,
  PosPaymentsPage as PosPaymentsReportPage,
  PosTransactionsPage as PosTransactionsReportPage
} from "./reports-pages";
import { SalesInvoicesPage as SalesInvoicesManagementPage } from "./sales-invoices-page";
import { SalesPaymentsPage as SalesPaymentsManagementPage } from "./sales-payments-page";
import { SalesCreditNotesPage as SalesCreditNotesManagementPage } from "./sales-credit-notes-page";
import { SalesOrdersPage as SalesOrdersManagementPage } from "./sales-orders-page";
import { SuppliesPage as SuppliesManagementPage } from "./supplies-page";
import { ModulesPage as ModulesFeaturePage } from "./modules-page";
import { TaxRatesPage as TaxRatesFeaturePage } from "./tax-rates-page";
import { StaticPagesPage as StaticPagesManagementPage } from "./static-pages-page";
import { UsersPage as UsersManagementPage } from "./users-page";
import { RolesPage as RolesManagementPage } from "./roles-page";
import { ModuleRolesPage as ModuleRolesManagementPage } from "./module-roles-page";
import { OutletsPage as OutletsManagementPage } from "./outlets-page";
import { InventorySettingsPage as InventorySettingsFeaturePage } from "./inventory-settings-page";
import { PlatformSettingsPage as PlatformSettingsManagementPage } from "./platform-settings-page";

type PlaceholderProps = {
  title: string;
  description: string;
  ownerHint?: string;
};

const cardStyle = {
  border: "1px solid #e2ddd2",
  borderRadius: "10px",
  padding: "16px",
  backgroundColor: "#fcfbf8"
} as const;

function PlaceholderPanel(props: PlaceholderProps) {
  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>{props.title}</h2>
      <p>{props.description}</p>
      {props.ownerHint ? <p style={{ marginBottom: 0 }}>{props.ownerHint}</p> : null}
    </section>
  );
}

export const AccountsPage = ChartOfAccountsPage;

export const AccountTypesPage = AccountTypesManagementPage;

export const TransactionsPage = TransactionInputPage;

export const TransactionTemplatesPage = TransactionTemplatesManagementPage;

export const ItemsPage = ItemsManagementPage;

export const PricesPage = PricesManagementPage;

export const ItemGroupsPage = ItemGroupsManagementPage;

export const SuppliesPage = SuppliesManagementPage;

export const FixedAssetsPage = FixedAssetsManagementPage;

export const PosTransactionsPage = PosTransactionsReportPage;

export const PosPaymentsPage = PosPaymentsReportPage;

export const DailySalesPage = DailySalesReportPage;

export const GeneralLedgerPage = GeneralLedgerReportPage;

export const JournalsPage = JournalsReportPage;

export const ProfitLossPage = ProfitLossReportPage;

export const AccountingWorksheetPage = AccountingWorksheetReportPage;

export const SalesInvoicesPage = SalesInvoicesManagementPage;

export const SalesPaymentsPage = SalesPaymentsManagementPage;

export const SalesCreditNotesPage = SalesCreditNotesManagementPage;

export const SalesOrdersPage = SalesOrdersManagementPage;

export const AccountMappingsPage = AccountMappingsSettingsPage;

export const FeatureSettingsPage = FeatureSettingsFeaturePage;

export const ModulesPage = ModulesFeaturePage;

export const TaxRatesPage = TaxRatesFeaturePage;

export const InventorySettingsPage = InventorySettingsFeaturePage;

export const StaticPagesPage = StaticPagesManagementPage;

export const UsersPage = UsersManagementPage;

export const RolesPage = RolesManagementPage;

export const ModuleRolesPage = ModuleRolesManagementPage;

export const CompaniesPage = CompaniesManagementPage;

export const OutletsPage = OutletsManagementPage;

export const PlatformSettingsPage = PlatformSettingsManagementPage;

export const FiscalYearsPage = FiscalYearsManagementPage;

export const AuditLogsPage = AuditLogsManagementPage;

export const CashBankPage = CashBankManagementPage;

export function ForbiddenPage() {
  return (
    <PlaceholderPanel
      title="Forbidden"
      description="Your role does not have access to this screen."
    />
  );
}
