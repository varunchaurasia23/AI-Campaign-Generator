import { Link as WouterLink } from "wouter"
import { cn } from "@/lib/utils"

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center px-4 md:px-8 max-w-7xl justify-between">
          <WouterLink href="/" className="flex items-center gap-2 mr-6 font-mono font-bold tracking-tighter text-primary">
            <div className="h-6 w-6 rounded-sm bg-primary flex items-center justify-center text-primary-foreground">
              <span className="text-xs leading-none">AI</span>
            </div>
            NEXUS
          </WouterLink>
          <nav className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
            <WouterLink href="/admin" className="hover:text-primary transition-colors data-[active]:text-foreground">
              Dashboard
            </WouterLink>
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center">{children}</main>
    </div>
  )
}
