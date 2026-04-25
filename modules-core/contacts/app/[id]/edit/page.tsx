"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
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
import { getContact, updateContact, createContact, type Contact } from "@/modules/contacts/lib/contacts"
import { useAuth } from "@/components/providers"

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

export default function EditContactPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { session } = useAuth()

  // Get params from URL - works with both direct routing and catch-all module routing
  const routeParams = useParams()
  const id = (routeParams.id as string) || (routeParams.slug as string[])?.[0] || 'new'

  const [loading, setLoading] = useState(id !== 'new')
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const isNewContact = id === 'new'

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
    if (id !== 'new') {
      loadContact(id)
    }
  }, [id])

  const loadContact = async (id: string) => {
    try {
      setLoading(true)
      const tokenFn = async () => session?.access_token || null
      const contact = await getContact(id, tokenFn)
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
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const handleSave = async () => {
    // Validate fields
    const errors: Record<string, string> = {}
    const UNSAFE_RE = /[<>\x00-\x1F\x7F]/

    if (!formData.name) {
      errors.name = "Name is required"
    } else if (formData.name.length > 255) {
      errors.name = "Name is too long (max 255 characters)"
    } else if (UNSAFE_RE.test(formData.name)) {
      errors.name = "Name contains invalid characters"
    }

    if (!formData.email) {
      errors.email = "Email is required"
    } else if (formData.email.length > 255) {
      errors.email = "Email is too long"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Please enter a valid email address"
    }

    if (formData.phone && !/^[+\d\s\-().]+$/.test(formData.phone)) {
      errors.phone = "Please enter a valid phone number"
    } else if (formData.phone && formData.phone.length > 50) {
      errors.phone = "Phone number is too long"
    }

    if (formData.description && formData.description.length > 2000) {
      errors.description = "Notes are too long (max 2000 characters)"
    }

    if (formData.company && (formData.company.length > 255 || UNSAFE_RE.test(formData.company))) {
      errors.company = formData.company.length > 255 ? "Company name is too long" : "Company contains invalid characters"
    }

    if (formData.website && formData.website.length > 0 && !/^https?:\/\//i.test(formData.website)) {
      errors.website = "URL must start with http:// or https://"
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      toast({
        title: "Validation Error",
        description: Object.values(errors)[0],
        variant: "destructive",
      })
      return
    }

    try {
      setSaving(true)
      
      const contactData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        category: formData.category,
        description: formData.description || null,
        company: formData.company || null,
        address: formData.address || null,
        website: formData.website || null,
        birthday: formData.birthday || null,
        next_contact_date: formData.nextContactDate ? formData.nextContactDate.toISOString() : null
      }

      const tokenFn = async () => session?.access_token || null
      
      if (isNewContact) {
        await createContact(contactData, tokenFn)
        toast({
          title: "Success",
          description: "Contact created successfully",
        })
      } else if (id) {
        await updateContact(id, contactData, tokenFn)
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
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading contact...</span>
        </div>
      </div>
    )
  }

  return (
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
                  <h1 className="text-2xl font-medium">{isNewContact ? "New Contact" : "Edit Contact"}</h1>
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
                          maxLength={255}
                          className={fieldErrors.name ? "ring-2 ring-destructive border-destructive" : ""}
                        />
                        {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
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
                          maxLength={255}
                          className={fieldErrors.email ? "ring-2 ring-destructive border-destructive" : ""}
                        />
                        {fieldErrors.email && <p className="text-sm text-destructive">{fieldErrors.email}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input
                          id="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => handleInputChange("phone", e.target.value)}
                          placeholder="+1 (555) 123-4567"
                          maxLength={50}
                          className={fieldErrors.phone ? "ring-2 ring-destructive border-destructive" : ""}
                        />
                        {fieldErrors.phone && <p className="text-sm text-destructive">{fieldErrors.phone}</p>}
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
                        maxLength={2000}
                      />
                      {fieldErrors.description && <p className="text-sm text-destructive">{fieldErrors.description}</p>}
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
                          maxLength={255}
                          className={fieldErrors.company ? "ring-2 ring-destructive border-destructive" : ""}
                        />
                        {fieldErrors.company && <p className="text-sm text-destructive">{fieldErrors.company}</p>}
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
                        maxLength={500}
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
                        maxLength={255}
                        className={fieldErrors.website ? "ring-2 ring-destructive border-destructive" : ""}
                      />
                      {fieldErrors.website && <p className="text-sm text-destructive">{fieldErrors.website}</p>}
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
  )
}