import { ScrollArea, Table, Text } from "@mantine/core";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef
} from "@tanstack/react-table";

type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  minWidth?: number;
  emptyState?: string;
  stickyHeader?: boolean;
};

export function DataTable<TData>({
  columns,
  data,
  minWidth,
  emptyState = "No data available",
  stickyHeader = false
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  const rows = table.getRowModel().rows;

  return (
    <ScrollArea type="auto" scrollbarSize={8} offsetScrollbars>
      <Table stickyHeader={stickyHeader} style={minWidth ? { minWidth } : undefined}>
        <Table.Thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <Table.Tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <Table.Th key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </Table.Th>
              ))}
            </Table.Tr>
          ))}
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={columns.length}>
                <Text size="sm" c="dimmed">
                  {emptyState}
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            rows.map((row) => (
              <Table.Tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <Table.Td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}
