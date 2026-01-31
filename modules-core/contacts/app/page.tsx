"use client"

import type React from "react"
import { useSupabase } from "@/components/providers"
import { DM_Sans } from "next/font/google"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Filter, Plus, Phone, Mail, MoreVertical, Grid3X3, List, Edit } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getCategoryColor,
  getAvatarColor,
  getInitials,
  formatNextContactDate,
  type Contact
} from "@/modules/contacts/lib/contacts"
import { useContacts } from "../hooks/use-contacts"
import { useToast } from "@/hooks/use-toast"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export default function ContactsPage() {
  const { session } = useSupabase()
  const user = session?.user
  const router = useRouter()
  const { toast } = useToast()

  // TanStack Query for contacts - replaces local state + realtime subscription
  const { data: contacts = [], isLoading: loading } = useContacts()

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All Categories")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const categories = ["All Categories", "Work", "Friends", "Family", "Business", "Other"]

  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch = 
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.phone.includes(searchQuery)
    
    const matchesCategory = 
      selectedCategory === "All Categories" || contact.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  return (
    <div className="p-6 space-y-6">
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
                  className="flex items-center gap-2"
                  onClick={() => router.push("/contacts/new/edit")}
                >
                  <Plus className="w-4 h-4" />
                  Add Contact
                </Button>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-card p-6 rounded-lg border">
                <p className="text-sm text-muted-foreground mb-2">Total Contacts</p>
                <p className="text-3xl font-medium">{contacts.length}</p>
              </div>
              <div className="bg-card p-6 rounded-lg border">
                <p className="text-sm text-muted-foreground mb-2">Categories</p>
                <p className="text-3xl font-medium">5</p>
              </div>
              <div className="bg-card p-6 rounded-lg border">
                <p className="text-sm text-muted-foreground mb-2">This Month</p>
                <p className="text-3xl font-medium">
                  {contacts.filter(c => {
                    const createdDate = new Date(c.created_at)
                    const now = new Date()
                    return createdDate.getMonth() === now.getMonth() &&
                           createdDate.getFullYear() === now.getFullYear()
                  }).length}
                </p>
              </div>
              <div className="bg-card p-6 rounded-lg border">
                <p className="text-sm text-muted-foreground mb-2">Filtered Results</p>
                <p className="text-3xl font-medium">{filteredContacts.length}</p>
              </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search contacts by name, email, or phone..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[180px]">
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
              <div className="flex items-center rounded-lg border bg-card">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`rounded-r-none ${viewMode === "grid" ? "bg-muted" : ""}`}
                  onClick={() => setViewMode("grid")}
                >
                  <Grid3X3 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`rounded-l-none ${viewMode === "list" ? "bg-muted" : ""}`}
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
                  <div key={contact.id} className="bg-card p-6 rounded-lg border hover:shadow-md transition-shadow">
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
                    
                    <div className="space-y-2 text-sm text-muted-foreground mb-4">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        <span>{contact.phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        <span className="truncate">{contact.email}</span>
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
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
                  <div key={contact.id} className="bg-card p-4 rounded-lg border hover:shadow-sm transition-shadow flex items-center gap-4">
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
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          <span>{contact.phone}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Mail className="w-4 h-4" />
                          <span>{contact.email}</span>
                        </div>
                      </div>
                      
                      <p className="text-sm text-muted-foreground mt-1">
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
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery || selectedCategory !== "All Categories"
                  ? "No contacts found matching your criteria."
                  : "No contacts yet. Click 'Add Contact' to get started!"}
              </div>
            )}
    </div>
  )
}