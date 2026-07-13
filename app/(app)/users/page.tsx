"use client"

import { useMemo, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import {
  useCreateUser,
  useCurrentUser,
  useDeleteUser,
  useUpdateUser,
  useUsers,
  type AdminUser,
  type UpdateUserInput,
} from "@/hooks/use-users"
import {
  PERMISSION_INFO,
  PERMISSION_KEYS,
  type PermissionKey,
  type UserRole,
} from "@/lib/permissions"
import {
  Ban,
  CircleCheck,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react"

function initials(user: { name: string | null; email: string }): string {
  const source = user.name?.trim() || user.email
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?"
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (isNaN(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function generatePassword(): string {
  // 24 chars from a set without look-alikes — long enough for the 18-char
  // minimum with headroom, easy to read out to the new user.
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*+"
  const values = new Uint32Array(24)
  crypto.getRandomValues(values)
  return Array.from(values, (v) => charset[v % charset.length]).join("")
}

function RoleBadge({ role }: { role: UserRole }) {
  return role === "admin" ? (
    <Badge className="gap-1"><ShieldCheck className="size-3" />Admin</Badge>
  ) : (
    <Badge variant="secondary">User</Badge>
  )
}

function StatusBadge({ disabled }: { disabled: boolean }) {
  return disabled ? (
    <Badge variant="destructive" className="gap-1"><Ban className="size-3" />Disabled</Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-green-600/40 text-green-600 dark:text-green-500">
      <CircleCheck className="size-3" />Active
    </Badge>
  )
}

// ─────────────────────────────────────────────────────────────
// Create user dialog
// ─────────────────────────────────────────────────────────────

function CreateUserDialog({
  open,
  onOpenChange,
  canCreateAdmins,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  canCreateAdmins: boolean
}) {
  const { toast } = useToast()
  const createUser = useCreateUser()
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<UserRole>("user")

  const reset = () => {
    setEmail("")
    setFirstName("")
    setLastName("")
    setPassword("")
    setRole("user")
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const created = await createUser.mutateAsync({
        email: email.trim(),
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        role,
      })
      toast({ title: "User created", description: `${created.email} can now sign in.` })
      reset()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "Could not create user",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!createUser.isPending) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Create an account and share the credentials with the new user. Permissions can be
            adjusted after creation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-first">First name</Label>
              <Input id="new-user-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-last">Last name</Label>
              <Input id="new-user-last" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-email">Email</Label>
            <Input
              id="new-user-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-password">Password</Label>
            <div className="flex gap-2">
              <Input
                id="new-user-password"
                type="text"
                required
                minLength={18}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                title="Generate a strong password"
                onClick={() => setPassword(generatePassword())}
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">At least 18 characters.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                {canCreateAdmins && <SelectItem value="admin">Admin</SelectItem>}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {role === "admin"
                ? "Admins hold every permission automatically."
                : "Users start with module and settings access; grant more from their profile."}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createUser.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createUser.isPending || !email || password.length < 18}>
              {createUser.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────
// User detail sheet
// ─────────────────────────────────────────────────────────────

function UserDetailSheet({
  user,
  isSelf,
  isLastActiveAdmin,
  actorPermissions,
  canEdit,
  onClose,
}: {
  user: AdminUser
  isSelf: boolean
  isLastActiveAdmin: boolean
  actorPermissions: Record<PermissionKey, boolean>
  canEdit: boolean
  onClose: () => void
}) {
  const { toast } = useToast()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()

  const [firstName, setFirstName] = useState(user.first_name ?? "")
  const [lastName, setLastName] = useState(user.last_name ?? "")
  const [email, setEmail] = useState(user.email)
  const [newPassword, setNewPassword] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)

  const profileDirty =
    firstName !== (user.first_name ?? "") ||
    lastName !== (user.last_name ?? "") ||
    email !== user.email

  const canChangeRole = actorPermissions.manage_admins && !isSelf
  const isAdmin = user.role === "admin"

  const mutate = async (updates: Omit<UpdateUserInput, "id">, success: string) => {
    try {
      await updateUser.mutateAsync({ id: user.id, ...updates })
      toast({ title: success })
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async () => {
    try {
      await deleteUser.mutateAsync(user.id)
      toast({ title: "User deleted", description: `${user.email} has been removed.` })
      onClose()
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Identity header */}
      <div className="flex items-center gap-4">
        <Avatar className="size-14">
          {user.image && <AvatarImage src={user.image} alt={user.name ?? user.email} />}
          <AvatarFallback className="text-lg">{initials(user)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-semibold">{user.name || user.email}</span>
            {isSelf && <Badge variant="outline">You</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <RoleBadge role={user.role} />
            <StatusBadge disabled={user.disabled} />
            {user.two_factor_enabled && (
              <Badge variant="outline" className="gap-1"><Lock className="size-3" />2FA</Badge>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Profile */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Profile</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-first">First name</Label>
            <Input id="edit-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-last">Last name</Label>
            <Input id="edit-last" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-email">Email</Label>
          <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canEdit} />
        </div>
        {canEdit && (
          <Button
            size="sm"
            className="self-start"
            disabled={!profileDirty || updateUser.isPending}
            onClick={() =>
              mutate(
                {
                  firstName: firstName.trim() || null,
                  lastName: lastName.trim() || null,
                  email: email.trim(),
                },
                "Profile updated"
              )
            }
          >
            {updateUser.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save profile
          </Button>
        )}
      </section>

      {/* Role */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Role</h3>
        <Select
          value={user.role}
          disabled={!canChangeRole || updateUser.isPending}
          onValueChange={(value) => {
            const nextRole = value as UserRole
            if (nextRole !== user.role) {
              void mutate({ role: nextRole }, nextRole === "admin" ? "Promoted to admin" : "Changed to user")
            }
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {isSelf
            ? "You cannot change your own role."
            : isLastActiveAdmin && isAdmin
              ? "This is the last active admin — promote another admin before demoting."
              : !actorPermissions.manage_admins
                ? "Changing roles requires the manage_admins permission."
                : "Admins hold every permission automatically."}
        </p>
      </section>

      {/* Permissions */}
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">Permissions</h3>
        <p className="pb-2 text-xs text-muted-foreground">
          {isAdmin
            ? "Admins always hold every permission — toggles are locked on."
            : isSelf
              ? "You cannot change your own permissions."
              : "You can only change permissions you hold yourself."}
        </p>
        <div className="flex flex-col divide-y divide-border rounded-lg border">
          {PERMISSION_KEYS.map((key) => {
            const info = PERMISSION_INFO[key]
            const value = isAdmin ? true : user.permissions[key]
            const toggleDisabled =
              isAdmin || isSelf || !canEdit || !actorPermissions[key] || updateUser.isPending
            return (
              <div key={key} className="flex items-start justify-between gap-4 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{info.label}</div>
                  <div className="text-xs text-muted-foreground">{info.description}</div>
                </div>
                <Switch
                  checked={value}
                  disabled={toggleDisabled}
                  onCheckedChange={(checked) =>
                    mutate(
                      { permissions: { [key]: checked } },
                      checked ? `Granted ${info.label.toLowerCase()}` : `Revoked ${info.label.toLowerCase()}`
                    )
                  }
                  aria-label={info.label}
                />
              </div>
            )
          })}
        </div>
      </section>

      {canEdit && (
        <>
          {/* Security */}
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-foreground">Reset password</h3>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="New password (min 18 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                title="Generate a strong password"
                onClick={() => setNewPassword(generatePassword())}
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              disabled={newPassword.length < 18 || updateUser.isPending}
              onClick={async () => {
                await mutate({ password: newPassword }, "Password reset — existing sessions signed out")
                setNewPassword("")
              }}
            >
              <KeyRound className="mr-2 size-4" />
              Set new password
            </Button>
          </section>

          <Separator />

          {/* Danger zone */}
          <section className="flex flex-col gap-3 pb-4">
            <h3 className="text-sm font-medium text-destructive">Danger zone</h3>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">{user.disabled ? "Re-enable account" : "Disable account"}</div>
                <div className="text-xs text-muted-foreground">
                  {isSelf
                    ? "You cannot disable your own account."
                    : isLastActiveAdmin
                      ? "The last active admin cannot be disabled."
                      : user.disabled
                        ? "Allow this user to sign in again."
                        : "Blocks sign-in, revokes sessions and stops API keys."}
                </div>
              </div>
              <Switch
                checked={!user.disabled}
                disabled={isSelf || (isLastActiveAdmin && !user.disabled) || updateUser.isPending}
                onCheckedChange={(enabled) =>
                  mutate({ disabled: !enabled }, enabled ? "Account re-enabled" : "Account disabled")
                }
                aria-label="Account enabled"
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 p-3">
              <div>
                <div className="text-sm font-medium">Delete account</div>
                <div className="text-xs text-muted-foreground">
                  {isSelf
                    ? "You cannot delete your own account."
                    : isLastActiveAdmin
                      ? "The last active admin cannot be deleted."
                      : "Permanently removes the account, sessions and API keys."}
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={isSelf || isLastActiveAdmin || deleteUser.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-2 size-4" />
                Delete
              </Button>
            </div>
          </section>

          <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {user.email}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the account, its sessions and API keys. Content the user
                  created (tasks, documents, …) is kept. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDelete}
                >
                  Delete user
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser()
  const canView =
    currentUser?.role === "admin" ||
    currentUser?.permissions.manage_users === true ||
    currentUser?.permissions.manage_admins === true

  const { data: users, isLoading: usersLoading, error } = useUsers({ enabled: canView === true })
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => users?.find((u) => u.id === selectedId) ?? null,
    [users, selectedId]
  )
  const activeAdminCount = useMemo(
    () => users?.filter((u) => u.role === "admin" && !u.disabled).length ?? 0,
    [users]
  )

  const isLoading = currentUserLoading || (canView === true && usersLoading)

  return (
    <div className="bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Users</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Manage who can sign in to this ARI install. Click an account to edit its profile,
              role and permissions.
            </p>
          </div>
          {canView && (
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus className="mr-2 size-4" />
              Add user
            </Button>
          )}
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="flex flex-col gap-3 p-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : !canView ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Lock className="size-8 text-muted-foreground" />
              <div className="text-sm font-medium">You don&apos;t have permission to manage users</div>
              <p className="max-w-sm text-xs text-muted-foreground">
                Ask an admin to grant you the &ldquo;Manage users&rdquo; permission.
              </p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="p-12 text-center text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load users"}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden sm:table-cell">Permissions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => {
                    const grantedCount = PERMISSION_KEYS.filter((k) => user.permissions[k]).length
                    return (
                      <TableRow
                        key={user.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedId(user.id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="size-9">
                              {user.image && <AvatarImage src={user.image} alt={user.name ?? user.email} />}
                              <AvatarFallback>{initials(user)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 truncate text-sm font-medium">
                                {user.name || user.email}
                                {user.id === currentUser?.id && (
                                  <Badge variant="outline" className="text-[10px]">You</Badge>
                                )}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><RoleBadge role={user.role} /></TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                          {user.role === "admin" ? "All permissions" : `${grantedCount} of ${PERMISSION_KEYS.length}`}
                        </TableCell>
                        <TableCell><StatusBadge disabled={user.disabled} /></TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                          {formatDate(user.created_at)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canCreateAdmins={currentUser?.permissions.manage_admins === true}
      />

      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null) }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="pb-4">
            <SheetTitle>Account</SheetTitle>
            <SheetDescription className="sr-only">Edit user account</SheetDescription>
          </SheetHeader>
          {selected && currentUser && (
            <UserDetailSheet
              key={selected.id}
              user={selected}
              isSelf={selected.id === currentUser.id}
              isLastActiveAdmin={selected.role === "admin" && !selected.disabled && activeAdminCount === 1}
              actorPermissions={currentUser.permissions}
              canEdit={
                selected.role === "admin"
                  ? currentUser.permissions.manage_admins === true
                  : currentUser.permissions.manage_users === true || currentUser.permissions.manage_admins === true
              }
              onClose={() => setSelectedId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
