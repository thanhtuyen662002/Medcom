import type {ComponentProps} from "react"
import {cn} from "@/lib/utils"

// Structural shadcn primitives shared by button-based server pagination and
// the link helpers in pagination.tsx. No anchor styling is needed by buttons.
function Pagination({className, ...props}:ComponentProps<"nav">) {
  return <nav role="navigation" aria-label="pagination" data-slot="pagination" className={cn("mx-auto flex w-full justify-center",className)} {...props}/>
}
function PaginationContent({className, ...props}:ComponentProps<"ul">) {
  return <ul data-slot="pagination-content" className={cn("flex flex-row items-center gap-1",className)} {...props}/>
}
function PaginationItem(props:ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props}/>
}
export {Pagination,PaginationContent,PaginationItem}
