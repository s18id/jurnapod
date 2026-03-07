// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Button } from "../../shared/components/index.js";

export interface GoogleAuthButtonProps {
  onClick: () => void;
  disabled?: boolean;
  companyCode: string;
}

export function GoogleAuthButton({
  onClick,
  disabled = false,
  companyCode
}: GoogleAuthButtonProps): JSX.Element {
  return (
    <Button
      variant="secondary"
      onClick={onClick}
      disabled={disabled || companyCode.trim().length === 0}
    >
      Sign in with Google
    </Button>
  );
}
