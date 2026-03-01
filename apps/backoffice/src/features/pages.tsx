import type { SessionUser } from "../lib/session";
import { AccountsPage as ChartOfAccountsPage } from "./accounts-page";
import { AccountTypesPage as AccountTypesManagementPage } from "./account-types-page";
import { TransactionsPage as TransactionInputPage } from "./transactions-page";
import { ItemsPricesPage as ItemsPricesManagementPage } from "./items-prices-page";
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
import { SuppliesPage as SuppliesManagementPage } from "./supplies-page";
import { FixedAssetPage as FixedAssetsManagementPage } from "./fixed-assets-page";
import { AccountMappingsPage as AccountMappingsSettingsPage } from "./account-mappings-page";
import { FeatureSettingsPage as FeatureSettingsFeaturePage } from "./feature-settings-page";
import { ModulesPage as ModulesFeaturePage } from "./modules-page";
import { TaxRatesPage as TaxRatesFeaturePage } from "./tax-rates-page";
import { StaticPagesPage as StaticPagesManagementPage } from "./static-pages-page";
import { UsersPage as UsersManagementPage } from "./users-page";
import { RolesPage as RolesManagementPage } from "./roles-page";
import { CompaniesPage as CompaniesManagementPage } from "./companies-page";
import { OutletsPage as OutletsManagementPage } from "./outlets-page";
import { InventorySettingsPage as InventorySettingsFeaturePage } from "./inventory-settings-page";

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

export const ItemsPricesPage = ItemsPricesManagementPage;

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

export const AccountMappingsPage = AccountMappingsSettingsPage;

export const FeatureSettingsPage = FeatureSettingsFeaturePage;

export const ModulesPage = ModulesFeaturePage;

export const TaxRatesPage = TaxRatesFeaturePage;

export const InventorySettingsPage = InventorySettingsFeaturePage;

export const StaticPagesPage = StaticPagesManagementPage;

export const UsersPage = UsersManagementPage;

export const RolesPage = RolesManagementPage;

export const CompaniesPage = CompaniesManagementPage;

export const OutletsPage = OutletsManagementPage;

export function ForbiddenPage() {
  return (
    <PlaceholderPanel
      title="Forbidden"
      description="Your role does not have access to this screen."
    />
  );
}
