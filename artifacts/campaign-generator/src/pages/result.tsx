import { useEffect, useState } from "react"
import { useRoute } from "wouter"
import { useGetCampaign, getGetCampaignQueryKey } from "@workspace/api-client-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AlertCircle, CheckCircle2, ChevronRight, BarChart3, Target, Activity, Lightbulb, MessageSquare, Zap } from "lucide-react"

export default function ResultsPage() {
  const [, params] = useRoute("/results/:id")
  const id = params?.id ? parseInt(params.id, 10) : null

  // Polling happens automatically if we configure React Query, 
  // but we can also manage refetch logic via useEffect if status is processing
  const { data: campaign, isLoading, isError, error, refetch } = useGetCampaign(id!, {
    query: {
      enabled: !!id,
      queryKey: getGetCampaignQueryKey(id!),
    }
  })

  useEffect(() => {
    if (!campaign) return undefined;
    if (campaign.status === "processing") {
      const interval = setInterval(() => {
        refetch()
      }, 2000)
      return () => clearInterval(interval)
    }
    return undefined;
  }, [campaign?.status, refetch])

  if (!id) {
    return (
      <div className="w-full max-w-4xl mx-auto py-12 px-4 flex flex-col items-center justify-center text-center">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold">Invalid Campaign ID</h2>
      </div>
    )
  }

  if (isLoading || !campaign) {
    return <LoadingState />
  }

  if (isError) {
    return (
      <div className="w-full max-w-2xl mx-auto py-24 px-4 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Failed to load campaign</h2>
        <p className="text-muted-foreground">{(error?.data as { error?: string })?.error || error?.message || "Unknown error occurred"}</p>
      </div>
    )
  }

  if (campaign.status === "failed") {
    return (
      <div className="w-full max-w-2xl mx-auto py-24 px-4 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Generation Failed</h2>
        <p className="text-muted-foreground mb-6">
          {campaign.result?.errorMessage || "The AI encountered an error processing your campaign."}
        </p>
      </div>
    )
  }

  if (campaign.status === "processing") {
    return <ProcessingState />
  }

  const result = campaign.result!

  return (
    <div className="w-full max-w-6xl mx-auto py-10 px-4 md:px-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-end border-b border-border/50 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="success" className="gap-1.5"><CheckCircle2 className="w-3.5 h-3.5"/> Complete</Badge>
            <span className="text-sm font-mono text-muted-foreground">ID: {campaign.id}</span>
            <span className="text-sm font-mono text-muted-foreground">BUDGET: ${campaign.budget.toLocaleString()}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Campaign Strategy Report</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Optimized channel mix and creative concepts generated based on your input parameters.
          </p>
        </div>
        
        {/* Fit Score + Risk Level */}
        <div className="flex items-center gap-3 bg-card border border-border p-4 rounded-xl shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10" />
          <div className="relative z-10 flex flex-col items-center justify-center">
            <span className="text-xs font-mono font-semibold tracking-wider text-muted-foreground mb-1">FIT SCORE</span>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-bold tracking-tighter text-primary data-mono">{result.fitScore}</span>
              <span className="text-lg text-muted-foreground font-medium">/100</span>
            </div>
          </div>
          {result.riskLevel && (
            <div className="relative z-10 flex flex-col items-center justify-center border-l border-border pl-3">
              <span className="text-xs font-mono font-semibold tracking-wider text-muted-foreground mb-1">RISK</span>
              <Badge
                variant={result.riskLevel === "low" ? "success" : result.riskLevel === "high" ? "destructive" : "outline"}
                className="text-xs font-mono tracking-widest px-2 py-0.5"
              >
                {result.riskLevel.toUpperCase()}
              </Badge>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Budget & Channels */}
        <div className="lg:col-span-1 space-y-8">
          <Card className="glass-panel overflow-hidden">
            <CardHeader className="bg-muted/30 pb-4 border-b border-border/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" /> Budget Allocation
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {result.budgetAllocation.map((alloc, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">{alloc.channel}</span>
                    <span className="font-mono text-muted-foreground">${alloc.amount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={alloc.percentage} className="h-2 bg-muted/50" />
                    <span className="text-xs font-mono font-bold w-10 text-right">{alloc.percentage}%</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-panel overflow-hidden">
            <CardHeader className="bg-muted/30 pb-4 border-b border-border/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" /> Recommended Mix
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-2">
                {result.channelMix.map(channel => (
                  <Badge key={channel} variant="secondary" className="px-3 py-1 text-sm bg-secondary/60">
                    {channel}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Creative & Copy */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Campaign Ideas */}
          {result.campaignIdeas && result.campaignIdeas.length > 0 && (
            <Card className="glass-panel">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-primary" /> Core Concepts
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-border/50">
                {result.campaignIdeas.map((idea, idx) => (
                  <div key={idx} className="p-6 hover:bg-muted/20 transition-colors">
                    <h3 className="text-xl font-bold mb-2">{idea.title}</h3>
                    <p className="text-muted-foreground mb-4">{idea.description}</p>
                    <div className="bg-background/50 p-4 rounded-lg border border-border/50 text-sm">
                      <span className="font-mono font-semibold text-primary block mb-1">RATIONALE</span>
                      {idea.rationale}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Ad Copy */}
          {result.adCopy && result.adCopy.length > 0 && (
            <Card className="glass-panel">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" /> Generated Copy
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {result.adCopy.map((copy, idx) => (
                  <div key={idx} className="bg-card border border-border rounded-xl p-5 space-y-4">
                    <Badge variant="outline" className="mb-2 font-mono text-xs">{copy.channel}</Badge>
                    <div>
                      <h4 className="font-bold text-lg leading-tight mb-2">{copy.headline}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-3">{copy.body}</p>
                    </div>
                    <div className="pt-4 border-t border-border/50">
                      <span className="inline-flex items-center text-xs font-bold uppercase tracking-wider text-primary">
                        {copy.callToAction} <ChevronRight className="w-3 h-3 ml-1" />
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* A/B Test Plan */}
          {result.abTestPlan && result.abTestPlan.length > 0 && (
            <Card className="glass-panel">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" /> Testing Matrix
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-8">
                {result.abTestPlan.map((test, idx) => (
                  <div key={idx} className="space-y-4">
                    <h4 className="font-semibold text-lg border-l-2 border-primary pl-3">{test.channel}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Variant A */}
                      <div className="bg-card border border-border rounded-lg p-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-muted px-2 py-1 text-[10px] font-mono font-bold rounded-bl-lg">VAR A</div>
                        <div className="text-xs font-mono text-muted-foreground mb-1">{test.variantA.type}</div>
                        <div className="font-medium mb-3">{test.variantA.angle}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-semibold block mb-1">HYPOTHESIS:</span>
                          {test.variantA.hypothesis}
                        </div>
                      </div>
                      {/* Variant B */}
                      <div className="bg-card border border-border rounded-lg p-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-primary/20 text-primary px-2 py-1 text-[10px] font-mono font-bold rounded-bl-lg">VAR B</div>
                        <div className="text-xs font-mono text-muted-foreground mb-1">{test.variantB.type}</div>
                        <div className="font-medium mb-3">{test.variantB.angle}</div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-semibold block mb-1">HYPOTHESIS:</span>
                          {test.variantB.hypothesis}
                        </div>
                      </div>
                    </div>
                    <div className="bg-muted/30 py-2 px-4 rounded-md text-sm flex items-center justify-between border border-border/50">
                      <span className="text-muted-foreground font-mono text-xs">PRIMARY METRIC</span>
                      <span className="font-semibold">{test.variantA.primaryMetric}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  )
}


function ProcessingState() {
  const [progress, setProgress] = useState(10)
  
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(p => {
        if (p >= 95) return p;
        return p + Math.random() * 5;
      })
    }, 800)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="w-full max-w-xl mx-auto py-32 px-4 flex flex-col items-center text-center space-y-8">
      <div className="relative w-24 h-24 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <div className="absolute inset-2 rounded-full border-2 border-primary/10 border-b-primary animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        <Zap className="w-8 h-8 text-primary animate-pulse" />
      </div>
      
      <div className="space-y-2 w-full">
        <h2 className="text-2xl font-bold tracking-tight">Synthesizing Strategy</h2>
        <p className="text-muted-foreground">Running predictive models against baseline data...</p>
      </div>

      <div className="w-full max-w-sm space-y-2">
        <Progress value={progress} className="h-1.5" />
        <div className="flex justify-between text-xs font-mono text-muted-foreground">
          <span>COMPUTING</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="w-full h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
    </div>
  )
}
