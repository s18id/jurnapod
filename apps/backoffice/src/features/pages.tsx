import { ItemsPricesPage as ItemsPricesManagementPage } from "./items-prices-page";
import {
  DailySalesPage as DailySalesReportPage,
  JournalsPage as JournalsReportPage,
  PosTransactionsPage as PosTransactionsReportPage
} from "./reports-pages";

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

export const ItemsPricesPage = ItemsPricesManagementPage;

export const PosTransactionsPage = PosTransactionsReportPage;

export const DailySalesPage = DailySalesReportPage;

export const JournalsPage = JournalsReportPage;

export function ForbiddenPage() {
  return (
    <PlaceholderPanel
      title="Forbidden"
      description="Your role does not have access to this screen."
    />
  );
}
