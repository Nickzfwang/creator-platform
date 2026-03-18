"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";

export interface Column<T> {
  key: string;
  header: string;
  cell: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: string;
  onEmptyAction?: () => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  emptyTitle = "尚無資料",
  emptyDescription,
  emptyAction,
  onEmptyAction,
  hasMore,
  onLoadMore,
  loadingMore,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={emptyAction}
        onAction={onEmptyAction}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.cell(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hasMore && onLoadMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "載入中..." : "載入更多"}
          </Button>
        </div>
      )}
    </div>
  );
}
