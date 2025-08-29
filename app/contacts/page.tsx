"use client"

import type React from "react"
import { useSupabase } from "@/components/providers"
import { DM_Sans } from "next/font/google"
import { TaskAnnouncement } from "@/components/task-announcement"
import { AppSidebar } from "../../components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Filter, Plus, Phone, Mail, MoreVertical, Grid3X3, List, Edit, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  getContacts, 
  getCategoryColor, 
  getAvatarColor, 
  getInitials, 
  formatNextContactDate,
  type Contact 
} from "@/lib/contacts"
import { supabase } from "@/lib/supabase"
import { useToast } from "@/hooks/use-toast"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export default function ContactsPage() {
  const { session, supabase } = useSupabase()
  const user = session?.user
  const router = useRouter()
  const { toast } = useToast()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All Categories")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const categories = ["All Categories", "Work", "Friends", "Family", "Business", "Other"]

  // Load contacts from Supabase
  useEffect(() => {
    if (user?.id) {
      loadContacts()

      // Set up real-time subscription
      const channel = supabase
        .channel("contacts-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "contacts",
          },
          (payload) => {
            console.log("Real-time update:", payload)

            if (payload.eventType === "INSERT") {
              setContacts((prev) => [...prev, payload.new as Contact].sort((a, b) => a.name.localeCompare(b.name)))
            } else if (payload.eventType === "UPDATE") {
              setContacts((prev) => {
                const updated = prev.map((contact) => 
                  contact.id === payload.new.id ? (payload.new as Contact) : contact
                )
                return updated.sort((a, b) => a.name.localeCompare(b.name))
              })
            } else if (payload.eventType === "DELETE") {
              setContacts((prev) => prev.filter((contact) => contact.id !== payload.old.id))
            }
          }
        )
        .subscribe()

      // Cleanup subscription on unmount
      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [user?.id])

  const loadContacts = async () => {
    if (!user?.id) {
      console.log("User not authenticated, skipping contacts load")
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const data = await getContacts()
      setContacts(data)
    } catch (error) {
      console.error("Failed to load contacts:", error)
      toast({
        title: "Error",
        description: "Failed to load contacts. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch = 
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.phone.includes(searchQuery)
    
    const matchesCategory = 
      selectedCategory === "All Categories" || contact.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <TaskAnnouncement />
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <div className="flex items-center justify-center h-96">
              <div className="flex items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Loading contacts...</span>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <TaskAnnouncement />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">People</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>All Contacts</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-medium">Contact Manager</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage your contacts efficiently with categories and search
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import/Export
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Categories
                </Button>
                <Button 
                  className="bg-black hover:bg-gray-800 flex items-center gap-2"
                  onClick={() => router.push("/contacts/new/edit")}
                >
                  <Plus className="w-4 h-4" />
                  Add Contact
                </Button>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-lg border">
                <p className="text-sm text-gray-600 mb-2">Total Contacts</p>
                <p className="text-3xl font-medium">{contacts.length}</p>
              </div>
              <div className="bg-white p-6 rounded-lg border">
                <p className="text-sm text-gray-600 mb-2">Categories</p>
                <p className="text-3xl font-medium">5</p>
              </div>
              <div className="bg-white p-6 rounded-lg border">
                <p className="text-sm text-gray-600 mb-2">This Month</p>
                <p className="text-3xl font-medium">
                  {contacts.filter(c => {
                    const createdDate = new Date(c.created_at)
                    const now = new Date()
                    return createdDate.getMonth() === now.getMonth() && 
                           createdDate.getFullYear() === now.getFullYear()
                  }).length}
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg border">
                <p className="text-sm text-gray-600 mb-2">Filtered Results</p>
                <p className="text-3xl font-medium">{filteredContacts.length}</p>
              </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search contacts by name, email, or phone..."
                  className="pl-10 bg-white"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[180px] bg-white">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center rounded-lg border bg-white">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`rounded-r-none ${viewMode === "grid" ? "bg-gray-100" : ""}`}
                  onClick={() => setViewMode("grid")}
                >
                  <Grid3X3 className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`rounded-l-none ${viewMode === "list" ? "bg-gray-100" : ""}`}
                  onClick={() => setViewMode("list")}
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Contacts Grid/List */}
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredContacts.map((contact) => (
                  <div key={contact.id} className="bg-white p-6 rounded-lg border hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full ${getAvatarColor(contact.category)} text-white flex items-center justify-center font-medium`}>
                          {getInitials(contact.name)}
                        </div>
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <span className={`w-2 h-2 rounded-full ${getCategoryColor(contact.category)}`}></span>
                          {contact.category}
                        </Badge>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => router.push(`/contacts/${contact.id}/edit`)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <h3 className="font-medium text-lg mb-2">{contact.name}</h3>
                    
                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        <span>{contact.phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        <span className="truncate">{contact.email}</span>
                      </div>
                    </div>
                    
                    <p className="text-sm text-gray-500 line-clamp-2 mb-2">
                      {contact.description || "No description"}
                    </p>
                    
                    {contact.next_contact_date && (
                      <p className="text-sm font-medium text-green-600 mb-4">
                        Next Contact: {formatNextContactDate(contact.next_contact_date)}
                      </p>
                    )}
                    
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 h-9">
                        <Phone className="w-4 h-4 mr-1" />
                        Call
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 h-9">
                        <Mail className="w-4 h-4 mr-1" />
                        Email
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredContacts.map((contact) => (
                  <div key={contact.id} className="bg-white p-4 rounded-lg border hover:shadow-sm transition-shadow flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full ${getAvatarColor(contact.category)} text-white flex items-center justify-center font-medium flex-shrink-0`}>
                      {getInitials(contact.name)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{contact.name}</h3>
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <span className={`w-2 h-2 rounded-full ${getCategoryColor(contact.category)}`}></span>
                          {contact.category}
                        </Badge>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          <span>{contact.phone}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Mail className="w-4 h-4" />
                          <span>{contact.email}</span>
                        </div>
                      </div>
                      
                      <p className="text-sm text-gray-500 mt-1">
                        {contact.description || "No description"}
                      </p>
                      {contact.next_contact_date && (
                        <p className="text-sm font-medium text-green-600 mt-1">
                          Next Contact: {formatNextContactDate(contact.next_contact_date)}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm">
                        <Phone className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm">
                        <Mail className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => router.push(`/contacts/${contact.id}/edit`)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filteredContacts.length === 0 && !loading && (
              <div className="text-center py-12 text-gray-500">
                {searchQuery || selectedCategory !== "All Categories"
                  ? "No contacts found matching your criteria."
                  : "No contacts yet. Click 'Add Contact' to get started!"}
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}