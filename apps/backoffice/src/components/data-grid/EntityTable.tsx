// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { DataTable, type DataTableProps } from "@/components/ui/DataTable";

export type EntityTableProps<TData> = DataTableProps<TData> & {
  entityName?: string;
};

export function EntityTable<TData>(props: EntityTableProps<TData>) {
  const { entityName, _caption, ...rest } = props;
  return (
    <DataTable
      {...rest}
      _caption={_caption ?? (entityName ? `${entityName} table` : undefined)}
    />
  );
}
