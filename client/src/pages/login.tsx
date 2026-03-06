import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { LogIn, UserPlus, ArrowLeft } from "lucide-react";
import logoImage from "@assets/bright-horizon-text-logo.png";
import airplaneImage from "@assets/paper-airplane.png";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const handleLogin = async (data: LoginValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        toast({
          title: "Login failed",
          description: error.message || "Invalid email or password",
          variant: "destructive",
        });
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch (error) {
      toast({
        title: "Login failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (data: RegisterValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        toast({
          title: "Setup failed",
          description: error.message || "Unable to set up your account",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Account set up",
        description: "Your password has been set. Welcome!",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch (error) {
      toast({
        title: "Setup failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <img src={logoImage} alt="Bright Horizon" className="h-8 object-contain" />
            <span className="font-medium text-lg">Teacher Portal</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="pt-14">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/10" />
          <div className="relative max-w-7xl mx-auto px-4 py-16 sm:py-24">
            <div className="relative grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <div className="space-y-6">
                  <img src={logoImage} alt="Bright Horizon" className="w-[270px] object-contain" data-testid="img-login-logo" />
                  <h1 className="text-3xl sm:text-4xl font-serif font-medium tracking-tight">
                    Teacher Portal
                  </h1>
                  <p className="text-lg text-muted-foreground max-w-lg">
                    Access your timetable, track student lessons, 
                    and submit leave requests — all in one place.
                  </p>
                </div>

                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Secure login
                  </span>
                  <span className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    Real-time sync
                  </span>
                </div>
              </div>

              <img
                src={airplaneImage}
                alt=""
                className="hidden lg:block absolute left-[45%] top-0 h-full -translate-x-1/2 object-contain opacity-30 pointer-events-none dark:invert"
                data-testid="img-paper-airplane"
              />

              <Card className="relative bg-card/80 backdrop-blur border-card-border">
                {mode === "login" ? (
                  <>
                    <CardHeader className="pb-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="rounded-full bg-primary/10 p-2">
                          <LogIn className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-xl">Sign In</CardTitle>
                          <CardDescription>Enter your email and password</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Form {...loginForm}>
                        <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                          <FormField
                            control={loginForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                  <Input
                                    type="email"
                                    placeholder="your@email.com"
                                    autoComplete="email"
                                    {...field}
                                    data-testid="input-login-email"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={loginForm.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                  <Input
                                    type="password"
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    {...field}
                                    data-testid="input-login-password"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button
                            type="submit"
                            className="w-full gap-2"
                            size="lg"
                            disabled={isSubmitting}
                            data-testid="button-login-submit"
                          >
                            {isSubmitting ? "Signing in..." : "Sign In"}
                          </Button>
                        </form>
                      </Form>
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => { setMode("register"); registerForm.reset(); }}
                          className="text-sm text-primary hover:underline"
                          data-testid="link-setup-account"
                        >
                          First time? Set up your account
                        </button>
                      </div>
                    </CardContent>
                  </>
                ) : (
                  <>
                    <CardHeader className="pb-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="rounded-full bg-primary/10 p-2">
                          <UserPlus className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-xl">Set Up Account</CardTitle>
                          <CardDescription>Create your password to get started</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                        Your administrator must have already added your email to the system. 
                        Enter the same email and choose a password.
                      </div>
                      <Form {...registerForm}>
                        <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                          <FormField
                            control={registerForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                  <Input
                                    type="email"
                                    placeholder="your@email.com"
                                    autoComplete="email"
                                    {...field}
                                    data-testid="input-register-email"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                  <Input
                                    type="password"
                                    placeholder="At least 6 characters"
                                    autoComplete="new-password"
                                    {...field}
                                    data-testid="input-register-password"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="confirmPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Confirm Password</FormLabel>
                                <FormControl>
                                  <Input
                                    type="password"
                                    placeholder="Re-enter your password"
                                    autoComplete="new-password"
                                    {...field}
                                    data-testid="input-register-confirm-password"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button
                            type="submit"
                            className="w-full gap-2"
                            size="lg"
                            disabled={isSubmitting}
                            data-testid="button-register-submit"
                          >
                            {isSubmitting ? "Setting up..." : "Set Up Account"}
                          </Button>
                        </form>
                      </Form>
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => { setMode("login"); loginForm.reset(); }}
                          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                          data-testid="link-back-to-login"
                        >
                          <ArrowLeft className="h-3 w-3" />
                          Back to sign in
                        </button>
                      </div>
                    </CardContent>
                  </>
                )}
              </Card>
            </div>
          </div>
        </section>


        <footer className="border-t py-8">
          <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} Bright Horizon Online Teacher Portal. All rights reserved.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
