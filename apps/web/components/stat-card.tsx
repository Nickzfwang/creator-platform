import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon?: LucideIcon;
  className?: string;
}

export function StatCard({
  label,
  value,
  change,
  icon: Icon,
  className,
}: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <p className="text-2xl font-bold">{value}</p>
          {change !== undefined && (
            <span
              className={cn(
                "text-xs font-medium",
                change >= 0 ? "text-green-600" : "text-red-600",
              )}
            >
              {change >= 0 ? "+" : ""}
              {change.toFixed(1)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
