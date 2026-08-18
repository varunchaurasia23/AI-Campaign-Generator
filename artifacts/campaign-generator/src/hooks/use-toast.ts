import { toast as sonnerToast } from "sonner"

export const toast = ({
  title,
  description,
  variant,
}: {
  title?: string
  description?: string
  variant?: "default" | "destructive"
}) => {
  if (variant === "destructive") {
    return sonnerToast.error(title, { description })
  }
  return sonnerToast(title, { description })
}

export function useToast() {
  return { toast }
}
