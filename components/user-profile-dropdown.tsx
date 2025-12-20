"use client"

import { useSupabase } from "@/components/providers"
import { authClient } from "@/lib/auth-client"
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
import { Settings, LogOut, Shield } from "lucide-react"

export function UserProfileDropdown() {
  const { user } = useSupabase()
  const router = useRouter()

  const handleLogout = async () => {
    await authClient.signOut()
    // Use router.push for consistent navigation behavior
    router.push('/sign-in')
  }

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

  // Better Auth uses different property names
  const firstName = user.firstName || user.name?.split(' ')[0]
  const lastName = user.lastName || user.name?.split(' ')[1]
  const userInitials =
    firstName && lastName
      ? `${firstName[0]}${lastName[0]}`
      : user.email?.[0].toUpperCase() || "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-12 w-12 rounded-full p-0">
          <Avatar className="h-12 w-12">
            <AvatarImage src={user.image || "/placeholder.svg"} alt={user.name || "User"} />
            <AvatarFallback className="text-sm font-medium">{userInitials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name || "User"}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/settings')}>
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/security')}>
          <Shield className="mr-2 h-4 w-4" />
          <span>Security</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-600 focus:text-red-600 cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
