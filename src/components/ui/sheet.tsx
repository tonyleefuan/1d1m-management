'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Sheet ──────────────────────────────────────────
 *  사이드 패널 (Drawer) — 상세 보기, 필터 패널, 설정 등
 *
 *  사용법:
 *    <Sheet open={open} onOpenChange={setOpen}>
 *      <SheetTrigger asChild>
 *        <Button>열기</Button>
 *      </SheetTrigger>
 *      <SheetContent side="right" size="md">
 *        <SheetHeader>
 *          <SheetTitle>상품 상세</SheetTitle>
 *          <SheetDescription>HH-2401 오버사이즈 코트</SheetDescription>
 *        </SheetHeader>
 *        <div className="py-4">...콘텐츠...</div>
 *        <SheetFooter>
 *          <Button>저장</Button>
 *        </SheetFooter>
 *      </SheetContent>
 *    </Sheet>
 * ──────────────────────────────────────────────────── */

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom: 'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        right: 'inset-y-0 right-0 h-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
      },
      size: {
        sm: '',
        md: '',
        lg: '',
        xl: '',
        full: '',
      },
    },
    compoundVariants: [
      // 좌우 패널 사이즈
      { side: 'right', size: 'sm', class: 'w-[320px]' },
      { side: 'right', size: 'md', class: 'w-[480px]' },
      { side: 'right', size: 'lg', class: 'w-[640px]' },
      { side: 'right', size: 'xl', class: 'w-[800px]' },
      { side: 'right', size: 'full', class: 'w-[95vw]' },
      { side: 'left', size: 'sm', class: 'w-[320px]' },
      { side: 'left', size: 'md', class: 'w-[480px]' },
      { side: 'left', size: 'lg', class: 'w-[640px]' },
      { side: 'left', size: 'xl', class: 'w-[800px]' },
      { side: 'left', size: 'full', class: 'w-[95vw]' },
      // 상하 패널 사이즈
      { side: 'top', size: 'sm', class: 'h-[200px]' },
      { side: 'top', size: 'md', class: 'h-[320px]' },
      { side: 'top', size: 'lg', class: 'h-[480px]' },
      { side: 'bottom', size: 'sm', class: 'h-[200px]' },
      { side: 'bottom', size: 'md', class: 'h-[320px]' },
      { side: 'bottom', size: 'lg', class: 'h-[480px]' },
    ],
    defaultVariants: {
      side: 'right',
      size: 'md',
    },
  },
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', size = 'md', className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side, size }), 'flex flex-col', className)}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
        <X className="h-4 w-4" />
        <span className="sr-only">닫기</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = DialogPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-2 px-6 pt-6 pb-4', className)} {...props} />
)
SheetHeader.displayName = 'SheetHeader'

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex items-center justify-end gap-2 border-t px-6 py-4 mt-auto', className)}
    {...props}
  />
)
SheetFooter.displayName = 'SheetFooter'

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
))
SheetTitle.displayName = DialogPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
SheetDescription.displayName = DialogPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
