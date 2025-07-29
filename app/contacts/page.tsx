"use client"

import type React from "react"
import { useUser } from "@clerk/nextjs"
import { DM_Sans } from "next/font/google"
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
import { Card, CardContent } from "@/components/ui/card"
import { 
  Search, 
  Filter, 
  List, 
  Grid3X3, 
  Plus, 
  Loader2, 
  Star, 
  Mail, 
  Phone, 
  Building2, 
  MapPin,
  Globe,
  Edit,
  Trash2,
  UserCircle,
  StarOff
} from "lucide-react"
import { useState, useEffect } from "react"
import { 
  getContacts, 
  toggleContactFavorite, 
  deleteContact, 
  searchContacts,
  getFavoriteContacts,
  getContactsByTag,
  getAllTags,
  getContactFullName,
  getContactInitials,
  type Contact 
} from "@/lib/contacts"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export default function ContactsPage() {
  const { user } = useUser()
  const { toast } = useToast()
  const router = useRouter()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState("All")
  const [viewMode, setViewMode] = useState<"list" | "card">("card")
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const filters = ["All", "Favorites", "Recent"]

  // Load contacts and set up real-time subscription
  useEffect(() => {
    loadContacts()
    loadTags()

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
            setContacts((prev) => [payload.new as Contact, ...prev])
          } else if (payload.eventType === "UPDATE") {
            setContacts((prev) => prev.map((contact) => (contact.id === payload.new.id ? (payload.new as Contact) : contact)))
          } else if (payload.eventType === "DELETE") {
            setContacts((prev) => prev.filter((contact) => contact.id !== payload.old.id))
          }
        },
      )
      .subscribe()

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const loadContacts = async () => {
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

  const loadTags = async () => {
    try {
      const tags = await getAllTags()
      setAvailableTags(tags)
    } catch (error) {
      console.error("Failed to load tags:", error)
    }
  }

  const handleSearch = async (query: string) => {
    setSearchQuery(query)
    if (query.trim() === "") {
      loadContacts()
      return
    }

    try {
      const results = await searchContacts(query)
      setContacts(results)
    } catch (error) {
      console.error("Search failed:", error)
      toast({
        title: "Error",
        description: "Search failed. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleFilterChange = async (filter: string) => {
    setActiveFilter(filter)
    setSelectedTag(null)
    
    try {
      let data: Contact[]
      
      switch (filter) {
        case "Favorites":
          data = await getFavoriteContacts()
          break
        case "Recent":
          data = await getContacts()
          // Sort by created_at desc for recent
          data = data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          break
        default:
          data = await getContacts()
      }
      
      setContacts(data)
    } catch (error) {
      console.error("Filter failed:", error)
      toast({
        title: "Error",
        description: "Failed to filter contacts.",
        variant: "destructive",
      })
    }
  }

  const handleTagFilter = async (tag: string) => {
    setSelectedTag(tag)
    setActiveFilter("All")
    
    try {
      const data = await getContactsByTag(tag)
      setContacts(data)
    } catch (error) {
      console.error("Tag filter failed:", error)
      toast({
        title: "Error",
        description: "Failed to filter by tag.",
        variant: "destructive",
      })
    }
  }

  const handleToggleFavorite = async (contactId: string) => {
    try {
      const updatedContact = await toggleContactFavorite(contactId)
      setContacts(contacts.map((contact) => (contact.id === contactId ? updatedContact : contact)))
      toast({
        title: "Success",
        description: `Contact ${updatedContact.favorite ? "added to" : "removed from"} favorites.`,
      })
    } catch (error) {
      console.error("Failed to toggle favorite:", error)
      toast({
        title: "Error",
        description: "Failed to update contact. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteContact = async (contactId: string, contactName: string) => {
    if (!confirm(`Are you sure you want to delete ${contactName}?`)) {
      return
    }

    try {
      await deleteContact(contactId)
      setContacts(contacts.filter((contact) => contact.id !== contactId))
      toast({
        title: "Success",
        description: `${contactName} has been deleted.`,
      })
    } catch (error) {
      console.error("Failed to delete contact:", error)
      toast({
        title: "Error",
        description: "Failed to delete contact. Please try again.",
        variant: "destructive",
      })
    }
  }

  const ContactCard = ({ contact }: { contact: Contact }) => (
    <Card className="hover:shadow-md transition-all">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {contact.avatar_url ? (
              <img 
                src={contact.avatar_url} 
                alt={getContactFullName(contact)}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-gray-600 font-medium">
                  {getContactInitials(contact)}
                </span>
              </div>
            )}
            <div>
              <h3 className="font-semibold text-gray-900">{getContactFullName(contact)}</h3>
              {contact.job_title && (
                <p className="text-sm text-gray-600">{contact.job_title}</p>
              )}
              {contact.company && (
                <p className="text-sm text-gray-500">{contact.company}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleToggleFavorite(contact.id)}
              className="text-gray-400 hover:text-yellow-500"
            >
              {contact.favorite ? (
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-500" />
              ) : (
                <StarOff className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/contacts/edit/${contact.id}`)}
              className="text-gray-400 hover:text-blue-600"
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteContact(contact.id, getContactFullName(contact))}
              className="text-gray-400 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {contact.email && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail className="w-4 h-4" />
              <a href={`mailto:${contact.email}`} className="hover:text-blue-600">
                {contact.email}
              </a>
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="w-4 h-4" />
              <a href={`tel:${contact.phone}`} className="hover:text-blue-600">
                {contact.phone}
              </a>
            </div>
          )}
          {(contact.city || contact.state) && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4" />
              <span>{[contact.city, contact.state].filter(Boolean).join(", ")}</span>
            </div>
          )}
          {contact.website && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Globe className="w-4 h-4" />
              <a 
                href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-blue-600"
              >
                {contact.website}
              </a>
            </div>
          )}
        </div>

        {contact.tags && contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {contact.tags.map((tag) => (
              <Badge 
                key={tag} 
                variant="secondary" 
                className="text-xs cursor-pointer hover:bg-gray-200"
                onClick={() => handleTagFilter(tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )

  const ContactListItem = ({ contact }: { contact: Contact }) => (
    <div className="flex items-center gap-4 p-4 border rounded-lg hover:shadow-sm transition-all bg-white">
      {contact.avatar_url ? (
        <img 
          src={contact.avatar_url} 
          alt={getContactFullName(contact)}
          className="w-10 h-10 rounded-full object-cover"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
          <span className="text-gray-600 text-sm font-medium">
            {getContactInitials(contact)}
          </span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-medium text-gray-900">{getContactFullName(contact)}</h3>
          {contact.favorite && (
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-500" />
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          {contact.job_title && (
            <span>{contact.job_title}</span>
          )}
          {contact.company && (
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {contact.company}
            </span>
          )}
          {contact.email && (
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {contact.email}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {contact.tags && contact.tags.length > 0 && (
          <div className="flex gap-1">
            {contact.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {contact.tags.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{contact.tags.length - 2}
              </Badge>
            )}
          </div>
        )}
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleToggleFavorite(contact.id)}
            className="text-gray-400 hover:text-yellow-500 h-8 w-8"
          >
            {contact.favorite ? (
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-500" />
            ) : (
              <StarOff className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/contacts/edit/${contact.id}`)}
            className="text-gray-400 hover:text-blue-600 h-8 w-8"
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDeleteContact(contact.id, getContactFullName(contact))}
            className="text-gray-400 hover:text-red-600 h-8 w-8"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50">
        <div className="h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
          <span className={`text-white font-medium ${dmSans.className}`}>ARI</span>
        </div>
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
      <div className="h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
        <span className={`text-white font-medium ${dmSans.className}`}>ARI</span>
      </div>
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
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-lg">
                  <UserCircle className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">All Contacts</h1>
                  {user && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Manage your personal contacts ({contacts.length} contacts)
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={loadContacts} disabled={loading} className="bg-white">
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                  Refresh
                </Button>
                <Button className="bg-black hover:bg-gray-800" onClick={() => router.push("/contacts/add")}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Contact
                </Button>
              </div>
            </div>

            {/* Filters and Search */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1 p-1 bg-gray-200/75 rounded-lg">
                {filters.map((filter) => (
                  <Button
                    key={filter}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleFilterChange(filter)}
                    className={`h-8 px-4 rounded-md transition-colors ${
                      activeFilter === filter ? "bg-white text-gray-800 shadow-sm" : "text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {filter}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search contacts..."
                    className="pl-10 w-64 bg-white"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon" className="bg-white">
                  <Filter className="w-4 h-4" />
                </Button>
                <div className="flex items-center rounded-lg border bg-white">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`rounded-r-none ${viewMode === "list" ? "bg-gray-100" : ""}`}
                    onClick={() => setViewMode("list")}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`rounded-l-none ${viewMode === "card" ? "bg-gray-100" : ""}`}
                    onClick={() => setViewMode("card")}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Tags Filter */}
            {availableTags.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Tags:</span>
                <div className="flex flex-wrap gap-2">
                  {selectedTag && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedTag(null)
                        loadContacts()
                      }}
                      className="h-7 px-2"
                    >
                      Clear filter
                    </Button>
                  )}
                  {availableTags.slice(0, 8).map((tag) => (
                    <Badge
                      key={tag}
                      variant={selectedTag === tag ? "default" : "secondary"}
                      className="cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => handleTagFilter(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Contacts List/Grid */}
            {viewMode === "card" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {contacts.map((contact) => (
                  <ContactCard key={contact.id} contact={contact} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {contacts.map((contact) => (
                  <ContactListItem key={contact.id} contact={contact} />
                ))}
              </div>
            )}

            {contacts.length === 0 && !loading && (
              <div className="text-center py-12 text-gray-500">
                {searchQuery || selectedTag || activeFilter !== "All"
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