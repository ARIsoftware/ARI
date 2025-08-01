"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { DM_Sans } from "next/font/google"
import { AppSidebar } from "@/components/app-sidebar"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Save, X, CalendarIcon, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { getContact, updateContact, createContact, type Contact } from "@/lib/contacts"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

interface ContactFormData {
  name: string
  email: string
  phone: string
  category: string
  description: string
  company?: string
  address?: string
  website?: string
  birthday?: string
  nextContactDate?: Date
}

export default function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [contactId, setContactId] = useState<string | null>(null)
  const [isNewContact, setIsNewContact] = useState(false)
  
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    phone: "",
    category: "Work",
    description: "",
    company: "",
    address: "",
    website: "",
    birthday: "",
    nextContactDate: undefined
  })

  useEffect(() => {
    const initializeParams = async () => {
      const resolvedParams = await params
      const id = resolvedParams.id
      setContactId(id)
      setIsNewContact(id === 'new')
      
      if (id !== 'new') {
        loadContact(id)
      } else {
        setLoading(false)
      }
    }
    
    initializeParams()
  }, [])

  const loadContact = async (id: string) => {
    try {
      setLoading(true)
      const contact = await getContact(id)
      if (contact) {
        setFormData({
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          category: contact.category,
          description: contact.description || "",
          company: contact.company || "",
          address: contact.address || "",
          website: contact.website || "",
          birthday: contact.birthday || "",
          nextContactDate: contact.next_contact_date ? new Date(contact.next_contact_date) : undefined
        })
      } else {
        toast({
          title: "Error",
          description: "Contact not found",
          variant: "destructive",
        })
        router.push("/contacts")
      }
    } catch (error) {
      console.error("Failed to load contact:", error)
      toast({
        title: "Error",
        description: "Failed to load contact. Please try again.",
        variant: "destructive",
      })
      router.push("/contacts")
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof ContactFormData, value: string | Date | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    // Validate required fields
    if (!formData.name || !formData.email || !formData.phone) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    try {
      setSaving(true)
      
      const contactData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        category: formData.category,
        description: formData.description || null,
        company: formData.company || null,
        address: formData.address || null,
        website: formData.website || null,
        birthday: formData.birthday || null,
        next_contact_date: formData.nextContactDate ? formData.nextContactDate.toISOString() : null
      }

      if (isNewContact) {
        await createContact(contactData)
        toast({
          title: "Success",
          description: "Contact created successfully",
        })
      } else if (contactId) {
        await updateContact(contactId, contactData)
        toast({
          title: "Success",
          description: "Contact updated successfully",
        })
      }
      
      router.push("/contacts")
    } catch (error) {
      console.error("Failed to save contact:", error)
      toast({
        title: "Error",
        description: "Failed to save contact. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    router.push("/contacts")
  }

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
                <span>Loading contact...</span>
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
                  <BreadcrumbLink href="/contacts">All Contacts</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{isNewContact ? "New Contact" : "Edit Contact"}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-6 p-6 overflow-visible">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push("/contacts")}
                  className="rounded-full"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold">{isNewContact ? "New Contact" : "Edit Contact"}</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isNewContact ? "Add a new contact to your list" : "Update contact information"}
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="max-w-4xl overflow-visible">
              <div className="grid gap-6 overflow-visible">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                    <CardDescription>
                      Essential contact details
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 overflow-visible">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleInputChange("name", e.target.value)}
                          placeholder="Enter full name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="category">Category *</Label>
                        <Select
                          value={formData.category}
                          onValueChange={(value) => handleInputChange("category", value)}
                        >
                          <SelectTrigger id="category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Work">Work</SelectItem>
                            <SelectItem value="Friends">Friends</SelectItem>
                            <SelectItem value="Family">Family</SelectItem>
                            <SelectItem value="Business">Business</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange("email", e.target.value)}
                          placeholder="email@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number *</Label>
                        <Input
                          id="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => handleInputChange("phone", e.target.value)}
                          placeholder="+1 (555) 123-4567"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Notes</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => handleInputChange("description", e.target.value)}
                        placeholder="Add any notes about this contact..."
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Next Contact Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !formData.nextContactDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.nextContactDate ? (
                              format(formData.nextContactDate, "MMMM dd, yyyy")
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-50" align="start" side="bottom" sideOffset={4}>
                          <Calendar
                            mode="single"
                            selected={formData.nextContactDate}
                            onSelect={(date) => handleInputChange("nextContactDate", date)}
                            initialFocus
                            className="rounded-md border"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </CardContent>
                </Card>

                {/* Additional Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Additional Information</CardTitle>
                    <CardDescription>
                      Optional details to enrich the contact profile
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="company">Company</Label>
                        <Input
                          id="company"
                          value={formData.company || ""}
                          onChange={(e) => handleInputChange("company", e.target.value)}
                          placeholder="Company name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="birthday">Birthday</Label>
                        <Input
                          id="birthday"
                          type="date"
                          value={formData.birthday || ""}
                          onChange={(e) => handleInputChange("birthday", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        value={formData.address || ""}
                        onChange={(e) => handleInputChange("address", e.target.value)}
                        placeholder="Street address"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        type="url"
                        value={formData.website || ""}
                        onChange={(e) => handleInputChange("website", e.target.value)}
                        placeholder="https://example.com"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={handleCancel} disabled={saving}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving} className="bg-black hover:bg-gray-800">
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {isNewContact ? "Create Contact" : "Save Changes"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}