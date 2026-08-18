import * as React from "react"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

export function Spinner({ className, size = 24, ...props }: React.HTMLAttributes<SVGElement> & { size?: number }) {
  return (
    <Loader2 
      size={size} 
      className={cn("animate-spin text-primary", className)} 
      {...props} 
    />
  )
}
