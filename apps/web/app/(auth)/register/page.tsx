"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const registerSchema = z.object({
  displayName: z
    .string()
    .min(2, "名稱至少 2 個字元")
    .max(50, "名稱最多 50 個字元"),
  email: z.string().email("請輸入有效的電子郵件"),
  password: z
    .string()
    .min(8, "密碼至少 8 個字元")
    .max(72, "密碼最多 72 個字元")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "密碼需包含大寫字母、小寫字母和數字",
    ),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setError(null);
    try {
      await registerUser(data.email, data.password, data.displayName);
      toast.success("帳號建立成功");
      router.push("/");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "註冊失敗，請稍後再試";
      setError(message);
      toast.error(message);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">建立帳號</CardTitle>
        <CardDescription>開始使用 Creator Platform</CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">顯示名稱</Label>
            <Input
              id="displayName"
              type="text"
              placeholder="你的名稱"
              {...register("displayName")}
            />
            {errors.displayName && (
              <p className="text-xs text-destructive">
                {errors.displayName.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">電子郵件</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密碼</Label>
            <Input
              id="password"
              type="password"
              placeholder="至少 8 個字元，含大小寫和數字"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "建立中..." : "建立帳號"}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          已有帳號？{" "}
          <Link
            href="/login"
            className="font-medium text-primary hover:underline"
          >
            登入
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
