import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { GraduationCap, Calendar, FileSpreadsheet, Clock, ArrowRight } from "lucide-react";
import { SiGoogle } from "react-icons/si";

export default function LoginPage() {
  const features = [
    {
      icon: Calendar,
      title: "View Your Timetable",
      description: "See your classes synced from Google Calendar",
    },
    {
      icon: FileSpreadsheet,
      title: "Track Attendance",
      description: "Update student attendance directly in the portal",
    },
    {
      icon: Clock,
      title: "Manage Availability",
      description: "Block or open time slots in your calendar",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary p-1.5">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-medium text-lg">Teacher Portal</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild data-testid="button-login-header">
              <a href="/api/login">
                Sign In
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="pt-14">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/10" />
          <div className="relative max-w-7xl mx-auto px-4 py-24 sm:py-32">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <div className="space-y-4">
                  <h1 className="text-4xl sm:text-5xl font-serif font-medium tracking-tight">
                    Your Teaching Hub,{" "}
                    <span className="text-primary">Simplified</span>
                  </h1>
                  <p className="text-lg text-muted-foreground max-w-lg">
                    Access your timetable, track student attendance, manage your availability, 
                    and submit leave requests — all in one place.
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button size="lg" className="gap-2" asChild data-testid="button-login-hero">
                    <a href="/api/login">
                      <SiGoogle className="h-4 w-4" />
                      Sign in with Google
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>
                </div>

                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    Secure Google login
                  </span>
                  <span className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    Real-time sync
                  </span>
                </div>
              </div>

              <div className="relative lg:block hidden">
                <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-accent/20 rounded-2xl blur-3xl opacity-50" />
                <Card className="relative bg-card/80 backdrop-blur border-card-border">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="rounded-full bg-primary/10 p-2">
                        <GraduationCap className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">Welcome Back</CardTitle>
                        <CardDescription>Sign in to continue</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button className="w-full gap-2" size="lg" asChild data-testid="button-login-card">
                      <a href="/api/login">
                        <SiGoogle className="h-4 w-4" />
                        Continue with Google
                      </a>
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      By signing in, you agree to our terms of service
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 py-16">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-medium mb-2">Everything You Need</h2>
              <p className="text-muted-foreground">Streamlined tools for busy teachers</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              {features.map((feature) => (
                <Card key={feature.title} className="hover-elevate bg-background">
                  <CardContent className="pt-6">
                    <div className="rounded-lg bg-primary/10 p-3 w-fit mb-4">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-medium mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <footer className="border-t py-8">
          <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} ESL School Teacher Portal. All rights reserved.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
