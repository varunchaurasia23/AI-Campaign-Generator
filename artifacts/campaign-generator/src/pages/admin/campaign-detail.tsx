import { useEffect } from "react"
import { useRoute, useLocation } from "wouter"
import { useAdminMe, getAdminMeQueryKey, useAdminGetCampaign, getAdminGetCampaignQueryKey } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ArrowLeft, User, Mail, Globe, Phone, Building2, Code } from "lucide-react"
import { format } from "date-fns"

export default function AdminCampaignDetail() {
  const [, params] = useRoute("/admin/campaigns/:id")
  const id = params?.id ? parseInt(params.id, 10) : null
  const [, setLocation] = useLocation()
  
  // Auth Check
  const { data: auth, isLoading: authLoading, isError: authError } = useAdminMe({
    query: { retry: false, queryKey: getAdminMeQueryKey() }
  })

  useEffect(() => {
    if ((!authLoading && !auth) || authError) {
      setLocation("/admin/login")
    }
  }, [auth, authLoading, authError, setLocation])

  const { data: campaign, isLoading } = useAdminGetCampaign(id!, {
    query: {
      enabled: !!id && !!auth,
      queryKey: getAdminGetCampaignQueryKey(id!)
    }
  })

  if (authLoading || isLoading) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }

  if (!campaign) return null

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 md:px-8 space-y-8 animate-in fade-in">
      
      {/* Top Nav */}
      <Button variant="ghost" onClick={() => setLocation("/admin")} className="gap-2 -ml-4 mb-2 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Button>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-border/50 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-mono text-muted-foreground">ID: {campaign.id}</span>
            <Badge variant={campaign.status === 'complete' ? 'success' : campaign.status === 'failed' ? 'destructive' : 'processing'}>
              {campaign.status.toUpperCase()}
            </Badge>
            <span className="text-sm font-mono text-muted-foreground">
              {format(new Date(campaign.createdAt), "MMM d, yyyy HH:mm")}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{campaign.companyName} Campaign</h1>
        </div>
        
        <div className="flex items-center gap-3">
          {campaign.result?.fitScore !== undefined && (
            <div className="bg-card border border-border px-6 py-3 rounded-lg flex items-center gap-4">
              <span className="text-xs font-mono font-semibold tracking-wider text-muted-foreground">FIT SCORE</span>
              <span className="text-3xl font-bold tracking-tighter text-primary data-mono">{campaign.result.fitScore}</span>
            </div>
          )}
          {campaign.result?.riskLevel && (
            <div className="bg-card border border-border px-4 py-3 rounded-lg flex flex-col items-center gap-1">
              <span className="text-xs font-mono font-semibold tracking-wider text-muted-foreground">RISK</span>
              <Badge
                variant={campaign.result.riskLevel === "low" ? "success" : campaign.result.riskLevel === "high" ? "destructive" : "outline"}
                className="text-xs font-mono tracking-widest px-2"
              >
                {campaign.result.riskLevel.toUpperCase()}
              </Badge>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Lead Info & Input Params */}
        <div className="space-y-6">
          <Card className="glass-panel">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Lead Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{campaign.leadName}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <a href={`mailto:${campaign.leadEmail}`} className="text-primary hover:underline">{campaign.leadEmail}</a>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span>{campaign.companyName}</span>
              </div>
              {campaign.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono">{campaign.phone}</span>
                </div>
              )}
              {campaign.website && (
                <div className="flex items-center gap-3 text-sm">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <a href={campaign.website} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate">
                    {campaign.website}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Input Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-xs font-mono text-muted-foreground block mb-1">BUDGET</span>
                <span className="font-mono text-lg">${campaign.budget.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-xs font-mono text-muted-foreground block mb-1">TARGET AUDIENCE</span>
                <p className="text-sm">{campaign.targetAudience}</p>
              </div>
              <div>
                <span className="text-xs font-mono text-muted-foreground block mb-1">PRODUCT DESCRIPTION</span>
                <p className="text-sm bg-muted/20 p-3 rounded-md border border-border/50 mt-1">
                  {campaign.productDescription}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: AI Outputs */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-panel overflow-hidden h-full flex flex-col">
            <CardHeader className="border-b border-border/50 bg-muted/10">
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5 text-primary" /> Raw Engine Response
              </CardTitle>
              <CardDescription>
                JSON output from the LLM endpoint for debugging.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 relative bg-black/40">
              {campaign.status === "processing" ? (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <Spinner />
                    <span className="text-xs font-mono">AWAITING_RESPONSE</span>
                  </div>
                </div>
              ) : campaign.rawAiResponse ? (
                <pre className="p-6 overflow-auto text-[11px] md:text-xs font-mono text-green-400/90 h-[600px] scrollbar-thin">
                  <code>{campaign.rawAiResponse}</code>
                </pre>
              ) : (
                <div className="p-6 text-muted-foreground text-sm font-mono text-center">
                  NO_RAW_DATA_AVAILABLE
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
