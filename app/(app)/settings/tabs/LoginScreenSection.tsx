"use client"

import { useRef } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Image as ImageIcon, Upload, Trash2, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useCurrentUser } from "@/hooks/use-users"
import {
  useLoginBranding,
  useUploadLoginLogo,
  useDeleteLoginLogo,
} from "@/hooks/use-login-branding"
import {
  LOGIN_LOGO_ACCEPT,
  LOGIN_LOGO_MAX_BYTES,
  LOGIN_LOGO_MAX_MB,
  LOGIN_LOGO_TYPE_LABEL,
  isAllowedLogoType,
} from "@/lib/branding"

export function LoginScreenSection(): React.ReactElement | null {
  const { data: currentUser } = useCurrentUser()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: branding } = useLoginBranding()
  const uploadLogo = useUploadLoginLogo()
  const deleteLogo = useDeleteLoginLogo()

  // The login screen is global; only admins may change it. The API enforces
  // this independently — hiding the card is purely cosmetic.
  if (currentUser?.role !== "admin") return null

  const hasLogo = branding?.hasLogo === true
  const isBusy = uploadLogo.isPending || deleteLogo.isPending

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input so re-selecting the same file still fires onChange.
    e.target.value = ""
    if (!file) return

    if (!isAllowedLogoType(file.type)) {
      toast({
        variant: "destructive",
        title: "Unsupported file type",
        description: `Please upload a ${LOGIN_LOGO_TYPE_LABEL} image.`,
      })
      return
    }

    if (file.size > LOGIN_LOGO_MAX_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
      toast({
        variant: "destructive",
        title: "Image too large",
        description: `That image is ${sizeMb}MB, which is over the ${LOGIN_LOGO_MAX_MB}MB limit. Please choose a smaller logo.`,
      })
      return
    }

    try {
      await uploadLogo.mutateAsync(file)
      toast({
        title: "Logo updated",
        description: "Your new login-screen logo is now live.",
      })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Something went wrong.",
      })
    }
  }

  const handleRemove = async () => {
    try {
      await deleteLogo.mutateAsync()
      toast({
        title: "Logo removed",
        description: "The login screen has been reverted to its default.",
      })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't remove logo",
        description: err instanceof Error ? err.message : "Something went wrong.",
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ImageIcon className="h-5 w-5 text-primary" />
          Login Screen
        </CardTitle>
        <CardDescription>
          Upload a logo to display above the sign-in box on the login screen. This
          applies to everyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preview. The ?v=<updatedAt> makes the URL content-addressed: it changes
            on every save, so the browser always shows the current logo (and the
            serve endpoint can cache it immutably). */}
        <div className="flex items-center justify-center rounded-lg border border-dashed bg-muted/30 p-6">
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/branding/login-logo?v=${encodeURIComponent(branding?.updatedAt ?? "")}`}
              alt="Login screen logo"
              className="h-auto w-full max-w-[375px] object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-center text-muted-foreground">
              <ImageIcon className="h-8 w-8 opacity-50" />
              <p className="text-sm">No logo set — the default login screen is shown.</p>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={LOGIN_LOGO_ACCEPT}
          className="hidden"
          onChange={handleFileSelected}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
          >
            {uploadLogo.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {hasLogo ? "Replace logo" : "Upload logo"}
          </Button>
          {hasLogo && (
            <Button
              type="button"
              variant="outline"
              onClick={handleRemove}
              disabled={isBusy}
            >
              {deleteLogo.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Recommended width 375px. Maximum file size {LOGIN_LOGO_MAX_MB}MB.{" "}
          {LOGIN_LOGO_TYPE_LABEL}. Images wider than 375px are fine — the
          recommendation is a guideline, not a hard limit.
        </p>
      </CardContent>
    </Card>
  )
}
