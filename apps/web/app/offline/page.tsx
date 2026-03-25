import { WifiOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <WifiOff className="h-16 w-16 text-muted-foreground mb-4" />
          <h1 className="text-xl font-bold mb-2">目前離線</h1>
          <p className="text-muted-foreground mb-6">
            請檢查網路連線後重試
          </p>
          <Button onClick={() => window.location.reload()}>
            重新載入
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
