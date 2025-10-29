"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit, AlertCircle, Quote as QuoteIcon } from "lucide-react";
import { useSupabase } from "@/components/providers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TaskAnnouncement } from "@/components/task-announcement";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface Quote {
  id: string;
  quote: string;
  author?: string;
  created_at: string;
  updated_at: string;
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [quoteText, setQuoteText] = useState("");
  const [author, setAuthor] = useState("");
  const { supabase, session } = useSupabase();
  const { toast } = useToast();

  useEffect(() => {
    if (session) {
      loadQuotes();
    }
  }, [session]);

  const loadQuotes = async () => {
    try {
      setError(null);
      setLoading(true);

      const response = await fetch("/api/quotes", {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load quotes");
      }

      const data = await response.json();
      setQuotes(data);
    } catch (error: any) {
      console.error("Error loading quotes:", error);
      setError(error.message || "Failed to load quotes");
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuote = async () => {
    if (!quoteText.trim()) {
      toast({
        title: "Error",
        description: "Quote text is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          quote: {
            quote: quoteText,
            author: author || null,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add quote");
      }

      toast({
        title: "Success",
        description: "Quote added successfully",
      });

      setQuoteText("");
      setAuthor("");
      setIsAddModalOpen(false);
      loadQuotes();
    } catch (error) {
      console.error("Error adding quote:", error);
      toast({
        title: "Error",
        description: "Failed to add quote",
        variant: "destructive",
      });
    }
  };

  const handleEditQuote = async () => {
    if (!editingQuote || !quoteText.trim()) {
      toast({
        title: "Error",
        description: "Quote text is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch("/api/quotes", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          id: editingQuote.id,
          updates: {
            quote: quoteText,
            author: author || null,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update quote");
      }

      toast({
        title: "Success",
        description: "Quote updated successfully",
      });

      setQuoteText("");
      setAuthor("");
      setEditingQuote(null);
      setIsEditModalOpen(false);
      loadQuotes();
    } catch (error) {
      console.error("Error updating quote:", error);
      toast({
        title: "Error",
        description: "Failed to update quote",
        variant: "destructive",
      });
    }
  };

  const handleDeleteQuote = async (id: string) => {
    if (!confirm("Are you sure you want to delete this quote?")) {
      return;
    }

    try {
      const response = await fetch(`/api/quotes?id=${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete quote");
      }

      toast({
        title: "Success",
        description: "Quote deleted successfully",
      });

      loadQuotes();
    } catch (error) {
      console.error("Error deleting quote:", error);
      toast({
        title: "Error",
        description: "Failed to delete quote",
        variant: "destructive",
      });
    }
  };

  const openEditModal = (quote: Quote) => {
    setEditingQuote(quote);
    setQuoteText(quote.quote);
    setAuthor(quote.author || "");
    setIsEditModalOpen(true);
  };

  const openAddModal = () => {
    setQuoteText("");
    setAuthor("");
    setIsAddModalOpen(true);
  };

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
                <BreadcrumbItem>
                  <BreadcrumbLink href="/motivation">Motivation</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Quotes</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col gap-4 p-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-medium">Quotes</h1>
                <p className="text-sm text-[#aa2020] mt-1">
                  Your collection of inspirational quotes
                </p>
              </div>
              <Button onClick={openAddModal}>
                <Plus className="h-4 w-4 mr-2" />
                Add Quote
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
              </div>
            ) : quotes.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border">
                <QuoteIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  No quotes yet
                </p>
                <Button onClick={openAddModal}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Quote
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {quotes.map((quote) => (
                  <div
                    key={quote.id}
                    className="bg-white rounded-lg border p-6 relative group hover:shadow-md transition-shadow"
                  >
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                      <button
                        onClick={() => openEditModal(quote)}
                        className="bg-blue-500 text-white p-2 rounded-full hover:bg-blue-600 transition-colors"
                      >
                        <Edit className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteQuote(quote.id)}
                        className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <QuoteIcon className="h-8 w-8 text-gray-300 mb-3" />
                    <p className="text-gray-800 text-lg mb-3 italic">
                      "{quote.quote}"
                    </p>
                    {quote.author && (
                      <p className="text-gray-500 text-sm">
                        — {quote.author}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* Add Quote Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="quote">Quote *</Label>
              <Textarea
                id="quote"
                placeholder="Enter the quote text..."
                value={quoteText}
                onChange={(e) => setQuoteText(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="author">Author (optional)</Label>
              <Input
                id="author"
                placeholder="Who said this?"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddQuote}>Add Quote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Quote Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-quote">Quote *</Label>
              <Textarea
                id="edit-quote"
                placeholder="Enter the quote text..."
                value={quoteText}
                onChange={(e) => setQuoteText(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-author">Author (optional)</Label>
              <Input
                id="edit-author"
                placeholder="Who said this?"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingQuote(null);
                setQuoteText("");
                setAuthor("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleEditQuote}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
