import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "./ui/card";

interface StatsCardProps {
  title: string;
  value: string;
  change: string;
  icon: LucideIcon;
  trend?: "up" | "down";
}

export function StatsCard({ title, value, change, icon: Icon, trend = "up" }: StatsCardProps) {
  return (
    <Card className="border-border bg-card transition-all duration-300 hover:bg-card/80 hover:shadow-lg group">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground">
              {value}
            </p>
            <p className="text-xs text-muted-foreground">{change} from last month</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-foreground transition-all duration-300 group-hover:bg-muted/80 group-hover:scale-105">
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
