'use client';

import { useTranslations } from "next-intl";
import { WifiOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  const t = useTranslations("offline");

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <WifiOff className="h-16 w-16 text-muted-foreground mb-4" />
          <h1 className="text-xl font-bold mb-2">{t("title")}</h1>
          <p className="text-muted-foreground mb-6">
            {t("description")}
          </p>
          <Button onClick={() => window.location.reload()}>
            {t("reload")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
