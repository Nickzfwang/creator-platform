"use client";

import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function OrderSuccessPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const token = searchParams.get("token");

  if (!success) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Processing your payment...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
          <h1 className="text-2xl font-bold">Payment Successful!</h1>
          <p className="text-muted-foreground">
            Thank you for your purchase. A download link has been sent to your email.
          </p>
          <p className="text-xs text-muted-foreground">
            Order ID: {orderId}
          </p>
          {token && (
            <Button asChild className="mt-4">
              <a href={`${process.env.NEXT_PUBLIC_API_URL || '/api'}/v1/products/download/${orderId}?token=${token}`}>
                <Download className="mr-2 h-4 w-4" /> Download Now
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
