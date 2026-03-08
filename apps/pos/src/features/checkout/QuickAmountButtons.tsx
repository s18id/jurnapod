// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import { Button } from "../../shared/components/index.js";
import { formatMoney } from "../../shared/utils/money.js";

export interface QuickAmountButtonsProps {
  total: number;
  onSelectAmount: (amount: number) => void;
}

export function QuickAmountButtons({ total, onSelectAmount }: QuickAmountButtonsProps): JSX.Element {
  const quickAmounts = React.useMemo(() => {
    const amounts: number[] = [];
    const roundedTotal = Math.ceil(total / 1000) * 1000;
    
    if (roundedTotal > 0) {
      amounts.push(roundedTotal);
    }
    
    for (let i = 1; i <= 3; i++) {
      amounts.push(roundedTotal + i * 10000);
    }
    
    return amounts;
  }, [total]);

  if (quickAmounts.length === 0) {
    return <></>;
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
      {quickAmounts.map((amount) => (
        <Button
          key={amount}
          id={`checkout-quick-amount-${amount}`}
          name={`checkoutQuickAmount-${amount}`}
          size="small"
          variant="secondary"
          onClick={() => onSelectAmount(amount)}
        >
          {formatMoney(amount)}
        </Button>
      ))}
    </div>
  );
}
