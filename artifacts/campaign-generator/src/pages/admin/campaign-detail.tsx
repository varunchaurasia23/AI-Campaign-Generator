import { useEffect, useState } from "react"
import { useRoute, useLocation } from "wouter"
import {
  useAdminMe,
  getAdminMeQueryKey,
  useAdminGetCampaign,
  getAdminGetCampaignQueryKey,
} from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Spinner } from "@/components/ui/spinner"
import {
  ArrowLeft,
  User,
  Mail,
  Globe,
  Phone,
  Building2,
  Code,
  AlertCircle,
  Lightbulb,
  MessageSquare,
  Target,
  Activity,
  BarChart3,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { format } from "date-fns"

// ── Types mirroring the API response shape ────────────────────────────────────

interface BudgetAllocation {
  channel: string
  percentage: number
  amount: number
}

interface CampaignIdea {
  title: string
  description: string
  rationale?: string
}

interface AdCopyItem {
  channel: string
  headline: string
  body: string
  callToAction: string
}

interface AbVariant {
  angle: string
  type: string
  hypothesis: string
  primaryMetric: string
}

interface AbTestItem {
  channel: string
  variantA: AbVariant
  variantB: AbVariant
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminCampaignDetail() {
  const [, params] = useRoute("/admin/campaigns/:id")
  const id = params?.id ? parseInt(params.id, 10) : null
  const [, setLocation] = useLocation()
  const [rawOpen, setRawOpen] = useState(false)

  // Auth gate
  const { data: auth, isLoading: authLoading, isError: authError } = useAdminMe({
    query: { retry: false, queryKey: getAdminMeQueryKey() },
  })

  useEffect(() => {
    if ((!authLoading && !auth) || authError) {
      setLocation("/admin/login")
    }
  }, [auth, authLoading, authError, setLocation])

  const { data: campaign, isLoading } = useAdminGetCampaign(id!, {
    query: {
      enabled: !!id && !!auth,
      queryKey: getAdminGetCampaignQueryKey(id!),
    },
  })

  if (authLoading || isLoading) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }

  if (!campaign) return null

  const result = campaign.result
  const isFailed = campaign.status === "failed"
  const isProcessing = campaign.status === "processing"
  const isComplete = campaign.status === "complete"

  // Cast jsonb fields (they arrive as unknown from the generated types)
  const channelMix: string[] = Array.isArray(result?.channelMix) ? result.channelMix : []
  const budgetAllocation: BudgetAllocation[] = Array.isArray(result?.budgetAllocation) ? result.budgetAllocation : []
  const campaignIdeas: CampaignIdea[] = Array.isArray(result?.campaignIdeas) ? result.campaignIdeas : []
  const adCopy: AdCopyItem[] = Array.isArray(result?.adCopy) ? result.adCopy : []
  const abTestPlan: AbTestItem[] = Array.isArray(result?.abTestPlan) ? result.abTestPlan : []

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 md:px-8 space-y-8 animate-in fade-in">

      {/* Back nav */}
      <Button
        variant="ghost"
        onClick={() => setLocation("/admin")}
        className="gap-2 -ml-4 mb-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Button>

      {/* ── Section 1: Header summary ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-border/50 pb-6 gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="text-sm font-mono text-muted-foreground">ID: {campaign.id}</span>
            <Badge
              variant={
                campaign.status === "complete"
                  ? "success"
                  : campaign.status === "failed"
                  ? "destructive"
                  : "processing"
              }
            >
              {campaign.status.toUpperCase()}
            </Badge>
            <span className="text-sm font-mono text-muted-foreground">
              {format(new Date(campaign.createdAt), "MMM d, yyyy HH:mm")}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{campaign.companyName} Campaign</h1>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> {campaign.leadName}
            </span>
            <a
              href={`mailto:${campaign.leadEmail}`}
              className="flex items-center gap-1.5 text-primary hover:underline"
            >
              <Mail className="w-3.5 h-3.5" /> {campaign.leadEmail}
            </a>
          </div>
        </div>

        {/* Fit score + risk badge — only when we have results */}
        {isComplete && result && (
          <div className="flex items-stretch gap-3 bg-card border border-border p-4 rounded-xl shadow-lg relative overflow-hidden flex-shrink-0">
            <div className="absolute right-0 top-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10" />
            <div className="relative z-10 flex flex-col items-center justify-center min-w-[80px]">
              <span className="text-xs font-mono font-semibold tracking-wider text-muted-foreground mb-1">
                FIT SCORE
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tighter text-primary">
                  {result.fitScore}
                </span>
                <span className="text-base text-muted-foreground">/100</span>
              </div>
            </div>
            {result.riskLevel && (
              <div className="relative z-10 flex flex-col items-center justify-center border-l border-border pl-3">
                <span className="text-xs font-mono font-semibold tracking-wider text-muted-foreground mb-1">
                  RISK
                </span>
                <Badge
                  variant={
                    result.riskLevel === "low"
                      ? "success"
                      : result.riskLevel === "high"
                      ? "destructive"
                      : "outline"
                  }
                  className="text-xs font-mono tracking-widest px-2 py-0.5"
                >
                  {result.riskLevel.toUpperCase()}
                </Badge>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Main grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left column — lead info + input params (unchanged) */}
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
                <a href={`mailto:${campaign.leadEmail}`} className="text-primary hover:underline">
                  {campaign.leadEmail}
                </a>
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
                  <a
                    href={campaign.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline truncate"
                  >
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
                <span className="font-mono text-lg">
                  ₹{campaign.budget.toLocaleString("en-IN")}
                </span>
              </div>
              <div>
                <span className="text-xs font-mono text-muted-foreground block mb-1">
                  TARGET AUDIENCE
                </span>
                <p className="text-sm">{campaign.targetAudience}</p>
              </div>
              <div>
                <span className="text-xs font-mono text-muted-foreground block mb-1">
                  PRODUCT DESCRIPTION
                </span>
                <p className="text-sm bg-muted/20 p-3 rounded-md border border-border/50 mt-1">
                  {campaign.productDescription}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column — AI output sections */}
        <div className="lg:col-span-2 space-y-6">

          {/* ── Failed state ──────────────────────────────────────────────── */}
          {isFailed && (
            <Card className="glass-panel border-destructive/30">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="w-7 h-7 text-destructive" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Generation Failed</h3>
                  <p className="text-muted-foreground max-w-md">
                    {result?.errorMessage ||
                      "The AI encountered an error processing this campaign. Check the raw response below for details."}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Processing state ──────────────────────────────────────────── */}
          {isProcessing && (
            <Card className="glass-panel">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <Spinner size={32} />
                <p className="text-muted-foreground font-mono text-sm">
                  AWAITING AI RESPONSE…
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── Section 2: Campaign Ideas ─────────────────────────────────── */}
          {isComplete && campaignIdeas.length > 0 && (
            <Card className="glass-panel">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Lightbulb className="w-5 h-5 text-primary" /> Campaign Ideas
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-border/50">
                {campaignIdeas.map((idea, idx) => (
                  <div key={idx} className="p-6 hover:bg-muted/20 transition-colors">
                    <h3 className="text-lg font-bold mb-1">{idea.title}</h3>
                    <p className="text-muted-foreground text-sm mb-3">{idea.description}</p>
                    {idea.rationale && (
                      <div className="bg-background/50 p-3 rounded-lg border border-border/50 text-sm">
                        <span className="font-mono font-semibold text-primary block mb-1 text-xs">
                          RATIONALE
                        </span>
                        {idea.rationale}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Section 3: Channel Mix & Budget Allocation ────────────────── */}
          {isComplete && (channelMix.length > 0 || budgetAllocation.length > 0) && (
            <Card className="glass-panel">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="w-5 h-5 text-primary" /> Channel Mix &amp; Budget Allocation
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {budgetAllocation.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Channel</TableHead>
                        <TableHead className="text-right">Budget</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                        <TableHead className="w-40 hidden sm:table-cell">Allocation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budgetAllocation.map((alloc, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Activity className="w-3.5 h-3.5 text-primary" />
                              {alloc.channel}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ₹{alloc.amount.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-primary">
                            {alloc.percentage}%
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Progress value={alloc.percentage} className="h-2 bg-muted/50" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  /* Fallback: just show channel mix badges if no budget breakdown */
                  <div className="flex flex-wrap gap-2 pt-2">
                    {channelMix.map((ch) => (
                      <Badge key={ch} variant="secondary" className="px-3 py-1 text-sm">
                        {ch}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Section 4: Ad Copy by Channel ─────────────────────────────── */}
          {isComplete && adCopy.length > 0 && (
            <Card className="glass-panel">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="w-5 h-5 text-primary" /> Ad Copy by Channel
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {adCopy.map((copy, idx) => (
                  <div key={idx} className="bg-card border border-border rounded-xl p-5 space-y-3">
                    <Badge variant="outline" className="font-mono text-xs">
                      {copy.channel}
                    </Badge>
                    <div>
                      <h4 className="font-bold text-base leading-tight mb-1">{copy.headline}</h4>
                      <p className="text-sm text-muted-foreground">{copy.body}</p>
                    </div>
                    <div className="pt-3 border-t border-border/50">
                      <span className="inline-flex items-center text-xs font-bold uppercase tracking-wider text-primary">
                        {copy.callToAction}{" "}
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Section 5: A/B Test Plan ──────────────────────────────────── */}
          {isComplete && abTestPlan.length > 0 && (
            <Card className="glass-panel">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="w-5 h-5 text-primary" /> A/B Test Plan
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Channel</TableHead>
                      <TableHead>Variant A</TableHead>
                      <TableHead>Variant B</TableHead>
                      <TableHead className="w-44">Primary Metric</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {abTestPlan.map((test, idx) => (
                      <TableRow key={idx} className="align-top">
                        <TableCell className="font-semibold pt-4">{test.channel}</TableCell>
                        <TableCell className="pt-4">
                          <p className="font-medium text-sm mb-1">{test.variantA.angle}</p>
                          <p className="text-xs text-muted-foreground leading-snug">
                            {test.variantA.hypothesis}
                          </p>
                        </TableCell>
                        <TableCell className="pt-4">
                          <p className="font-medium text-sm mb-1">{test.variantB.angle}</p>
                          <p className="text-xs text-muted-foreground leading-snug">
                            {test.variantB.hypothesis}
                          </p>
                        </TableCell>
                        <TableCell className="pt-4">
                          <Badge variant="secondary" className="text-xs font-mono whitespace-normal text-center">
                            {test.variantA.primaryMetric}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ── Empty state when complete but no AI data ──────────────────── */}
          {isComplete && !result && (
            <Card className="glass-panel">
              <CardContent className="py-12 text-center text-muted-foreground text-sm font-mono">
                NO_RESULT_DATA
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Section 6: Raw AI Response (collapsed by default) ────────────────── */}
      <div className="border-t border-border/50 pt-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground font-mono text-xs mb-3"
          onClick={() => setRawOpen((v) => !v)}
        >
          <Code className="w-3.5 h-3.5" />
          {rawOpen ? "Hide" : "View"} Raw Response
          {rawOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </Button>

        {rawOpen && (
          <Card className="glass-panel overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-muted/10 py-3">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                <Code className="w-4 h-4" /> Raw Engine Response
              </CardTitle>
              <CardDescription className="text-xs">
                JSON output from the LLM endpoint — for debugging only.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 bg-black/40">
              {campaign.rawAiResponse ? (
                <pre className="p-6 overflow-auto text-[11px] md:text-xs font-mono text-green-400/90 max-h-[500px] scrollbar-thin">
                  <code>{campaign.rawAiResponse}</code>
                </pre>
              ) : (
                <div className="p-6 text-muted-foreground text-sm font-mono text-center">
                  NO_RAW_DATA_AVAILABLE
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
