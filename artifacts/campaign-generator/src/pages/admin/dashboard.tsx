import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { 
  useAdminMe,
  getAdminMeQueryKey,
  useAdminGetStats,
  getAdminGetStatsQueryKey,
  useAdminListCampaigns,
  getAdminListCampaignsQueryKey,
  useAdminLogout,
  AdminListCampaignsStatus,
  AdminListCampaignsSortBy,
  AdminListCampaignsSortOrder
} from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Users, FileText, CheckCircle2, TrendingUp, LogOut, ArrowRight, ArrowDownAZ, ArrowUpZA, Search } from "lucide-react"
import { format } from "date-fns"

export default function AdminDashboard() {
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

  const logoutMutation = useAdminLogout()
  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => setLocation("/admin/login")
    })
  }

  // Filters & Sorting state
  const [statusFilter, setStatusFilter] = useState<AdminListCampaignsStatus | "all">("all")
  const [sortBy, setSortBy] = useState<AdminListCampaignsSortBy>("createdAt")
  const [sortOrder, setSortOrder] = useState<AdminListCampaignsSortOrder>("desc")

  // Data fetching
  const { data: stats, isLoading: statsLoading } = useAdminGetStats({
    query: { enabled: !!auth, queryKey: getAdminGetStatsQueryKey() }
  })

  const { data: listData, isLoading: listLoading } = useAdminListCampaigns(
    { 
      status: statusFilter === "all" ? undefined : statusFilter,
      sortBy,
      sortOrder,
      limit: 50
    },
    { query: { enabled: !!auth, queryKey: getAdminListCampaignsQueryKey({ status: statusFilter === "all" ? undefined : statusFilter, sortBy, sortOrder, limit: 50 }) } }
  )

  const toggleSort = (field: AdminListCampaignsSortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc")
    } else {
      setSortBy(field)
      setSortOrder("desc")
    }
  }

  const SortIcon = ({ field }: { field: AdminListCampaignsSortBy }) => {
    if (sortBy !== field) return <ArrowDownAZ className="w-3 h-3 opacity-20 ml-1 inline-block" />
    return sortOrder === "desc" ? 
      <ArrowDownAZ className="w-3 h-3 text-primary ml-1 inline-block" /> : 
      <ArrowUpZA className="w-3 h-3 text-primary ml-1 inline-block" />
  }

  if (authLoading || !auth) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 md:px-8 space-y-8 animate-in fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground">System-wide campaign intelligence and metrics.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2 text-muted-foreground hover:text-foreground">
          <LogOut className="w-4 h-4" /> Disconnect
        </Button>
      </div>

      {/* Stats row */}
      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Card key={i} className="h-32 animate-pulse bg-muted/20" />)}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Submissions</CardTitle>
              <FileText className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold data-mono">{stats.totalSubmissions}</div>
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold data-mono">{Math.round(stats.completionRate)}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.statusBreakdown.failed} failed
              </p>
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Budget</CardTitle>
              <TrendingUp className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold data-mono">
                ${Math.round(stats.averageBudget).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Top Channel</CardTitle>
              <Users className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold truncate">
                {stats.topChannels[0]?.channel || "N/A"}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Main Table Area */}
      <Card className="glass-panel border-primary/10 shadow-lg">
        <CardHeader className="border-b border-border/50 bg-muted/10 pb-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <CardTitle>Campaign Log</CardTitle>
            <div className="flex items-center gap-2">
              <Select 
                value={statusFilter} 
                onValueChange={(val) => setStatusFilter(val as any)}
              >
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {listLoading ? (
            <div className="p-8 flex justify-center"><Spinner /></div>
          ) : listData?.campaigns.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <Search className="w-8 h-8 mb-4 opacity-20" />
              <p>No campaigns found matching criteria.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[100px] cursor-pointer" onClick={() => toggleSort("createdAt")}>
                    DATE <SortIcon field="createdAt" />
                  </TableHead>
                  <TableHead>LEAD / COMPANY</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("budget")}>
                    BUDGET <SortIcon field="budget" />
                  </TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("fitScore")}>
                    SCORE <SortIcon field="fitScore" />
                  </TableHead>
                  <TableHead>RISK</TableHead>
                  <TableHead className="text-right">ACTION</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listData?.campaigns.map((camp) => (
                  <TableRow key={camp.id} className="group cursor-pointer" onClick={() => setLocation(`/admin/campaigns/${camp.id}`)}>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(camp.createdAt), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{camp.leadName}</div>
                      <div className="text-xs text-muted-foreground">{camp.companyName}</div>
                    </TableCell>
                    <TableCell className="font-mono">${camp.budget.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={camp.status === 'complete' ? 'success' : camp.status === 'failed' ? 'destructive' : 'processing'}>
                        {camp.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {camp.fitScore !== null && camp.fitScore !== undefined ? (
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${camp.fitScore > 75 ? 'bg-emerald-500' : camp.fitScore > 50 ? 'bg-yellow-500' : 'bg-destructive'}`} />
                          <span className="font-mono font-medium">{camp.fitScore}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {camp.riskLevel ? (
                        <Badge
                          variant={camp.riskLevel === "low" ? "success" : camp.riskLevel === "high" ? "destructive" : "outline"}
                          className="text-[10px] font-mono tracking-widest"
                        >
                          {camp.riskLevel.toUpperCase()}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); setLocation(`/admin/campaigns/${camp.id}`); }}>
                        View <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
