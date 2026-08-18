import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useSubmitCampaign } from "@workspace/api-client-react"
import { useToast } from "@/hooks/use-toast"
import { Zap, Briefcase, Target, User, Mail, Globe, Phone } from "lucide-react"

const intakeSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email address"),
  companyName: z.string().min(1, "Company name is required"),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  productDescription: z.string().min(10, "Must be at least 10 characters"),
  targetAudience: z.string().min(5, "Must be at least 5 characters"),
  budget: z.coerce.number().min(1, "Budget must be at least ₹1"),
})

type IntakeValues = z.infer<typeof intakeSchema>

export default function IntakePage() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  
  const form = useForm<IntakeValues>({
    resolver: zodResolver(intakeSchema),
    defaultValues: {
      fullName: "",
      email: "",
      companyName: "",
      website: "",
      phone: "",
      productDescription: "",
      targetAudience: "",
      budget: 5000,
    },
  })

  const submitMutation = useSubmitCampaign()

  const onSubmit = (data: IntakeValues) => {
    submitMutation.mutate(
      {
        data: {
          fullName: data.fullName,
          email: data.email,
          companyName: data.companyName,
          website: data.website || null,
          phone: data.phone || null,
          productDescription: data.productDescription,
          targetAudience: data.targetAudience,
          budget: data.budget,
        },
      },
      {
        onSuccess: (res) => {
          setLocation(`/results/${res.campaignId}`)
        },
        onError: (err) => {
          toast({
            title: "Submission failed",
            description: (err.data as { error?: string })?.error || err.message || "An unexpected error occurred",
            variant: "destructive",
          })
        },
      }
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto py-12 px-4 md:px-8">
      <div className="text-center mb-12 space-y-4">
        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-2">
          <Zap className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">AI Campaign Intelligence</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Deploy predictive models to generate mathematically optimal channel mixes, budget allocations, and tailored ad copy in seconds.
        </p>
      </div>

      <Card className="glass-panel border-primary/20 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
        <CardHeader className="pb-8 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-2xl">Campaign Parameters</CardTitle>
          <CardDescription>Input your brand baseline to compute your strategy</CardDescription>
        </CardHeader>
        <CardContent className="pt-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              {/* Section 1: Contact */}
              <div className="space-y-4">
                <h3 className="text-sm font-mono text-primary flex items-center gap-2">
                  <span className="w-4 h-px bg-primary"></span>
                  01. LEAD IDENTIFICATION
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2"><User className="w-3.5 h-3.5"/> Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane Doe" {...field} className="bg-background/50" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2"><Mail className="w-3.5 h-3.5"/> Work Email</FormLabel>
                        <FormControl>
                          <Input placeholder="jane@company.com" {...field} className="bg-background/50" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2"><Briefcase className="w-3.5 h-3.5"/> Company Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Corp" {...field} className="bg-background/50" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 text-muted-foreground"><Phone className="w-3.5 h-3.5"/> Phone (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="+1 (555) 000-0000" {...field} className="bg-background/50" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="flex items-center gap-2 text-muted-foreground"><Globe className="w-3.5 h-3.5"/> Website URL (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://acme.com" {...field} className="bg-background/50" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Section 2: Strategy */}
              <div className="space-y-4 pt-4">
                <h3 className="text-sm font-mono text-primary flex items-center gap-2">
                  <span className="w-4 h-px bg-primary"></span>
                  02. CAMPAIGN INPUTS
                </h3>
                <div className="grid grid-cols-1 gap-6">
                  <FormField
                    control={form.control}
                    name="productDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product/Service Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Describe what you are selling, its unique value proposition, and key benefits..." 
                            className="h-32 bg-background/50"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="targetAudience"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2"><Target className="w-3.5 h-3.5"/> Target Audience</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. B2B SaaS Founders, 25-45" {...field} className="bg-background/50" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="budget"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">Monthly Budget (₹)</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} {...field} className="bg-background/50 font-mono" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 flex justify-end">
                <Button 
                  type="submit" 
                  size="lg" 
                  className="w-full md:w-auto min-w-[200px] gap-2 electric-glow text-base font-semibold"
                  disabled={submitMutation.isPending}
                >
                  {submitMutation.isPending ? (
                    <>
                      <Spinner size={18} className="text-primary-foreground" />
                      Computing...
                    </>
                  ) : (
                    <>
                      Generate Strategy <Zap className="w-4 h-4 fill-current" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
