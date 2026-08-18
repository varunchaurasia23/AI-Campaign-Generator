import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"
import { useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAdminLogin, useAdminMe, getAdminMeQueryKey } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import { Lock, ShieldAlert } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"

const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
})

export default function AdminLogin() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()

  // Check existing session AND seed the CSRF cookie.
  // GET /admin/me calls setCsrfCookie middleware on the server, so by the time
  // the user submits the login form the _csrf cookie is already present and
  // customFetch will automatically include it as X-CSRF-Token.
  const { data: auth, isLoading: authLoading } = useAdminMe({
    query: {
      retry: false,
      queryKey: getAdminMeQueryKey(),
    },
  })

  // Redirect immediately if already authenticated
  useEffect(() => {
    if (auth?.authenticated) {
      setLocation("/admin")
    }
  }, [auth, setLocation])

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { password: "" },
  })

  const loginMutation = useAdminLogin()

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    loginMutation.mutate(
      { data: { password: data.password } },
      {
        onSuccess: (res) => {
          if (res.authenticated) {
            setLocation("/admin")
          }
        },
        onError: (err) => {
          toast({
            title: "Access Denied",
            description: (err.data as { error?: string })?.error || err.message || "Invalid password",
            variant: "destructive",
          })
          form.reset()
        },
      }
    )
  }

  // While checking existing session, show a spinner rather than the form
  // so the CSRF cookie has time to arrive before the user can submit.
  if (authLoading) {
    return (
      <div className="w-full min-h-[80vh] flex items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div className="w-full min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 flex items-center justify-center rounded-xl mb-6">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Gateway</h1>
          <p className="text-muted-foreground mt-2">Restricted access area.</p>
        </div>

        <Card className="glass-panel border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-primary" /> Authentication Required
            </CardTitle>
            <CardDescription>Enter the master password to access campaign logs.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full electric-glow"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? <Spinner size={16} className="mr-2 text-primary-foreground" /> : null}
                  Authenticate
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
