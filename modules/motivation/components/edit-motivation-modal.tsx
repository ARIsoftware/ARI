"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Youtube, Instagram, Twitter, Image as ImageIcon } from "lucide-react";
import { useSupabase } from "@/components/providers";

interface MotivationItem {
  id: string;
  type: "youtube" | "instagram" | "photo" | "twitter";
  title?: string;
  url?: string;
  thumbnail_url?: string;
  image_url?: string;
  position?: number;
  created_at: string;
}

interface EditMotivationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item: MotivationItem | null;
}

export function EditMotivationModal({
  isOpen,
  onClose,
  onSuccess,
  item,
}: EditMotivationModalProps) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const { supabase } = useSupabase();

  // Reset form when item changes
  useEffect(() => {
    if (item) {
      setTitle(item.title || "");
      setUrl(item.url || "");
    } else {
      setTitle("");
      setUrl("");
    }
  }, [item]);

  const handleSubmit = async () => {
    if (!item || !title.trim()) {
      alert("Please enter a title");
      return;
    }

    // For URL-based content, validate URL
    if ((item.type === "youtube" || item.type === "instagram" || item.type === "twitter") && !url.trim()) {
      alert("Please enter a URL");
      return;
    }

    setLoading(true);
    try {
      let updateData: any = {
        title: title.trim(),
      };

      // Add URL for URL-based content types
      if (item.type !== "photo") {
        updateData.url = url.trim();

        // Update thumbnail for YouTube if URL changed
        if (item.type === "youtube" && url !== item.url) {
          const videoId = url.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/
          )?.[1];

          if (videoId) {
            updateData.thumbnail_url = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
          }
        }

        // Update thumbnail for Instagram if URL changed
        if (item.type === "instagram" && url !== item.url) {
          try {
            const metadataResponse = await fetch("/api/instagram/metadata", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ url }),
            });

            if (metadataResponse.ok) {
              const metadata = await metadataResponse.json();
              if (metadata.thumbnail && !metadata.thumbnail.includes('placeholder')) {
                updateData.thumbnail_url = metadata.thumbnail;
              }
            }
          } catch (metadataError) {
            console.log("Could not fetch new Instagram metadata");
          }
        }

        // Update thumbnail for Twitter if URL changed
        if (item.type === "twitter" && url !== item.url) {
          try {
            const metadataResponse = await fetch("/api/twitter/metadata", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ url }),
            });

            if (metadataResponse.ok) {
              const metadata = await metadataResponse.json();
              if (metadata.thumbnail && !metadata.thumbnail.includes('placeholder')) {
                updateData.thumbnail_url = metadata.thumbnail;
              }
            }
          } catch (metadataError) {
            console.log("Could not fetch new Twitter metadata");
          }
        }
      }

      const { error } = await supabase
        .from("motivation_content")
        .update(updateData)
        .eq("id", item.id);

      if (error) {
        alert(`Error: ${error.message}`);
        throw error;
      }

      onSuccess();
    } catch (error: any) {
      console.error("Error updating item:", error);
    } finally {
      setLoading(false);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case "youtube":
        return <Youtube className="h-5 w-5 text-red-600" />;
      case "instagram":
        return <Instagram className="h-5 w-5 text-pink-600" />;
      case "twitter":
        return <Twitter className="h-5 w-5 text-black" />;
      case "photo":
        return <ImageIcon className="h-5 w-5 text-blue-600" />;
      default:
        return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "youtube":
        return "YouTube Video";
      case "instagram":
        return "Instagram Post";
      case "twitter":
        return "Twitter/X Post";
      case "photo":
        return "Photo";
      default:
        return "Content";
    }
  };

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getIconForType(item.type)}
            Edit {getTypeLabel(item.type)}
          </DialogTitle>
          <DialogDescription>
            Update the title and {item.type !== "photo" ? "URL" : "details"} for this {getTypeLabel(item.type).toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              placeholder="Enter a title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {item.type !== "photo" && (
            <div className="space-y-2">
              <Label htmlFor="edit-url">
                {item.type === "youtube" && "YouTube URL"}
                {item.type === "instagram" && "Instagram URL"}
                {item.type === "twitter" && "Twitter/X URL"}
              </Label>
              <Input
                id="edit-url"
                placeholder={`Enter ${item.type} URL`}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          )}

          {item.type === "photo" && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Photo editing is limited to title changes. To change the image, please delete this item and upload a new photo.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline" disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Updating..." : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}