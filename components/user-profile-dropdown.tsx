"use client"

import { useSupabase } from "@/components/providers"
import { useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { User, Settings, LogOut, Shield } from "lucide-react"

export function UserProfileDropdown() {
  const { session, supabase } = useSupabase()
  const router = useRouter()
  const user = session?.user

  // Fallback for when user is not authenticated
  if (!user) {
    return (
      <Button variant="ghost" className="relative h-12 w-12 rounded-full p-0">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="text-sm font-medium">U</AvatarFallback>
        </Avatar>
      </Button>
    )
  }

  const firstName = user.user_metadata?.first_name || user.user_metadata?.full_name?.split(' ')[0]
  const lastName = user.user_metadata?.last_name || user.user_metadata?.full_name?.split(' ')[1]
  const userInitials =
    firstName && lastName
      ? `${firstName[0]}${lastName[0]}`
      : user.email?.[0].toUpperCase() || "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-12 w-12 rounded-full p-0">
          <Avatar className="h-12 w-12">
            <AvatarImage src={user.user_metadata?.avatar_url || "/placeholder.svg"} alt={user.user_metadata?.full_name || "User"} />
            <AvatarFallback className="text-sm font-medium">{userInitials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.user_metadata?.full_name || "User"}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/profile')}>
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/settings')}>
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/security')}>
          <Shield className="mr-2 h-4 w-4" />
          <span>Security</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => {
          await supabase.auth.signOut()
          router.push('/sign-in')
        }} className="text-red-600 focus:text-red-600">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
