"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { DM_Sans } from "next/font/google"
import { AppSidebar } from "../../../../components/app-sidebar"
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
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Plus, X, Star, Loader2, UserPlus, Mail, Phone, Building2, MapPin, Globe, Tag, Save } from "lucide-react"
import { getContact, updateContact, getContactFullName, type Contact } from "@/lib/contacts"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export default function EditContactPage({ params }: { params: { id: string } }) {
  const { user } = useUser()
  const { toast } = useToast()
  const router = useRouter()
  
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [contact, setContact] = useState<Contact | null>(null)
  
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company: "",
    job_title: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    country: "",
    website: "",
    notes: "",
    favorite: false,
    avatar_url: "",
    social_links: {
      linkedin: "",
      twitter: "",
      facebook: "",
      instagram: "",
    }
  })
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")

  // Load contact data on mount
  useEffect(() => {
    const loadContact = async () => {
      try {
        setInitialLoading(true)
        const contactData = await getContact(params.id)
        
        if (!contactData) {
          toast({
            title: "Error",
            description: "Contact not found.",
            variant: "destructive",
          })
          router.push("/contacts")
          return
        }

        setContact(contactData)
        
        // Populate form with existing data
        setFormData({
          first_name: contactData.first_name || "",
          last_name: contactData.last_name || "",
          email: contactData.email || "",
          phone: contactData.phone || "",
          company: contactData.company || "",
          job_title: contactData.job_title || "",
          address: contactData.address || "",
          city: contactData.city || "",
          state: contactData.state || "",
          zip_code: contactData.zip_code || "",
          country: contactData.country || "",
          website: contactData.website || "",
          notes: contactData.notes || "",
          favorite: contactData.favorite || false,
          avatar_url: contactData.avatar_url || "",
          social_links: {
            linkedin: contactData.social_links?.linkedin || "",
            twitter: contactData.social_links?.twitter || "",
            facebook: contactData.social_links?.facebook || "",
            instagram: contactData.social_links?.instagram || "",
          }
        })
        
        setTags(contactData.tags || [])
      } catch (error: any) {
        console.error("Failed to load contact:", error)
        toast({
          title: "Error",
          description: "Failed to load contact. Please try again.",
          variant: "destructive",
        })
        router.push("/contacts")
      } finally {
        setInitialLoading(false)
      }
    }

    loadContact()
  }, [params.id, toast, router])

  const handleInputChange = (field: string, value: string | boolean) => {
    if (field.startsWith("social_links.")) {
      const socialField = field.replace("social_links.", "")
      setFormData(prev => ({
        ...prev,
        social_links: {
          ...prev.social_links,
          [socialField]: value
        }
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }))
    }
  }

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag("")
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast({
        title: "Error",
        description: "First name and last name are required.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      // Clean up social links - remove empty values
      const cleanSocialLinks = Object.fromEntries(
        Object.entries(formData.social_links).filter(([_, value]) => value.trim() !== "")
      )

      const contactData: Partial<Contact> = {
        ...formData,
        email: formData.email || null,
        phone: formData.phone || null,
        company: formData.company || null,
        job_title: formData.job_title || null,
        address: formData.address || null,
        city: formData.city || null,
        state: formData.state || null,
        zip_code: formData.zip_code || null,
        country: formData.country || null,
        website: formData.website || null,
        notes: formData.notes || null,
        avatar_url: formData.avatar_url || null,
        tags,
        social_links: cleanSocialLinks,
      }

      const updatedContact = await updateContact(params.id, contactData)

      toast({
        title: "Success",
        description: "Contact updated successfully!",
      })

      router.push("/contacts")
    } catch (error: any) {
      console.error("Failed to update contact:", error)
      
      let errorMessage = "Failed to update contact. Please try again."
      if (error.message?.includes("duplicate key")) {
        errorMessage = "A contact with this email already exists."
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
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

  if (!contact) {
    return null
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
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Edit {getContactFullName(contact)}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => router.push("/contacts")}
                  className="bg-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div>
                  <h1 className="text-3xl font-bold">Edit Contact</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Update {getContactFullName(contact)}'s information
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="max-w-4xl">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserPlus className="w-5 h-5" />
                      Basic Information
                    </CardTitle>
                    <CardDescription>
                      Essential contact details
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="first_name" className="text-sm font-medium">
                          First Name *
                        </label>
                        <Input
                          id="first_name"
                          placeholder="John"
                          value={formData.first_name}
                          onChange={(e) => handleInputChange("first_name", e.target.value)}
                          className="bg-white"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="last_name" className="text-sm font-medium">
                          Last Name *
                        </label>
                        <Input
                          id="last_name"
                          placeholder="Doe"
                          value={formData.last_name}
                          onChange={(e) => handleInputChange("last_name", e.target.value)}
                          className="bg-white"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Email
                      </label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="john.doe@example.com"
                        value={formData.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                        className="bg-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="phone" className="text-sm font-medium flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Phone
                      </label>
                      <Input
                        id="phone"
                        placeholder="+1-555-0123"
                        value={formData.phone}
                        onChange={(e) => handleInputChange("phone", e.target.value)}
                        className="bg-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="avatar_url" className="text-sm font-medium">
                        Avatar URL
                      </label>
                      <Input
                        id="avatar_url"
                        placeholder="https://example.com/avatar.jpg"
                        value={formData.avatar_url}
                        onChange={(e) => handleInputChange("avatar_url", e.target.value)}
                        className="bg-white"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleInputChange("favorite", !formData.favorite)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-colors ${
                          formData.favorite
                            ? "bg-yellow-50 border-yellow-200 text-yellow-700"
                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <Star className={`w-4 h-4 ${formData.favorite ? "fill-yellow-400 text-yellow-500" : ""}`} />
                        {formData.favorite ? "Favorite Contact" : "Add to Favorites"}
                      </button>
                    </div>
                  </CardContent>
                </Card>

                {/* Professional Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="w-5 h-5" />
                      Professional Details
                    </CardTitle>
                    <CardDescription>
                      Work and business information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="company" className="text-sm font-medium">
                        Company
                      </label>
                      <Input
                        id="company"
                        placeholder="Tech Corp"
                        value={formData.company}
                        onChange={(e) => handleInputChange("company", e.target.value)}
                        className="bg-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="job_title" className="text-sm font-medium">
                        Job Title
                      </label>
                      <Input
                        id="job_title"
                        placeholder="Software Engineer"
                        value={formData.job_title}
                        onChange={(e) => handleInputChange("job_title", e.target.value)}
                        className="bg-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="website" className="text-sm font-medium flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        Website
                      </label>
                      <Input
                        id="website"
                        placeholder="https://example.com"
                        value={formData.website}
                        onChange={(e) => handleInputChange("website", e.target.value)}
                        className="bg-white"
                      />
                    </div>

                    {/* Social Links */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium">Social Links</label>
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          placeholder="LinkedIn URL"
                          value={formData.social_links.linkedin}
                          onChange={(e) => handleInputChange("social_links.linkedin", e.target.value)}
                          className="bg-white text-sm"
                        />
                        <Input
                          placeholder="Twitter URL"
                          value={formData.social_links.twitter}
                          onChange={(e) => handleInputChange("social_links.twitter", e.target.value)}
                          className="bg-white text-sm"
                        />
                        <Input
                          placeholder="Facebook URL"
                          value={formData.social_links.facebook}
                          onChange={(e) => handleInputChange("social_links.facebook", e.target.value)}
                          className="bg-white text-sm"
                        />
                        <Input
                          placeholder="Instagram URL"
                          value={formData.social_links.instagram}
                          onChange={(e) => handleInputChange("social_links.instagram", e.target.value)}
                          className="bg-white text-sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Address Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5" />
                      Address
                    </CardTitle>
                    <CardDescription>
                      Location and address details
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="address" className="text-sm font-medium">
                        Street Address
                      </label>
                      <Input
                        id="address"
                        placeholder="123 Main Street"
                        value={formData.address}
                        onChange={(e) => handleInputChange("address", e.target.value)}
                        className="bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="city" className="text-sm font-medium">
                          City
                        </label>
                        <Input
                          id="city"
                          placeholder="New York"
                          value={formData.city}
                          onChange={(e) => handleInputChange("city", e.target.value)}
                          className="bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="state" className="text-sm font-medium">
                          State
                        </label>
                        <Input
                          id="state"
                          placeholder="NY"
                          value={formData.state}
                          onChange={(e) => handleInputChange("state", e.target.value)}
                          className="bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="zip_code" className="text-sm font-medium">
                          ZIP Code
                        </label>
                        <Input
                          id="zip_code"
                          placeholder="10001"
                          value={formData.zip_code}
                          onChange={(e) => handleInputChange("zip_code", e.target.value)}
                          className="bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="country" className="text-sm font-medium">
                          Country
                        </label>
                        <Input
                          id="country"
                          placeholder="United States"
                          value={formData.country}
                          onChange={(e) => handleInputChange("country", e.target.value)}
                          className="bg-white"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Additional Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Tag className="w-5 h-5" />
                      Additional Information
                    </CardTitle>
                    <CardDescription>
                      Tags, notes, and other details
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Tags */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tags</label>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Add tag"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                          className="bg-white"
                        />
                        <Button type="button" onClick={handleAddTag} variant="outline" size="icon">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {tags.map((tag) => (
                            <div
                              key={tag}
                              className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-md text-sm"
                            >
                              <span>{tag}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveTag(tag)}
                                className="text-gray-500 hover:text-red-500"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="notes" className="text-sm font-medium">
                        Notes
                      </label>
                      <Textarea
                        id="notes"
                        placeholder="Additional notes about this contact..."
                        value={formData.notes}
                        onChange={(e) => handleInputChange("notes", e.target.value)}
                        className="bg-white"
                        rows={4}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Submit Button */}
              <div className="flex items-center gap-3 pt-6">
                <Button type="submit" disabled={loading} className="bg-black hover:bg-gray-800">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating Contact...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Update Contact
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/contacts")}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}