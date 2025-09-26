"use client";

import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Youtube, Instagram, Image as ImageIcon, Upload, Twitter } from "lucide-react";
import { useSupabase } from "@/components/providers";

interface AddMotivationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddMotivationModal({
  isOpen,
  onClose,
  onSuccess,
}: AddMotivationModalProps) {
  const [loading, setLoading] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [instagramTitle, setInstagramTitle] = useState("");
  const [photoTitle, setPhotoTitle] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [twitterTitle, setTwitterTitle] = useState("");

  const { supabase, session } = useSupabase();

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadPhoto = async () => {
    if (!photoFile || !session?.user?.id) return null;

    const fileExt = photoFile.name.split(".").pop();
    const fileName = `${session.user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError, data } = await supabase.storage
      .from("motivation-photos")
      .upload(fileName, photoFile);

    if (uploadError) {
      console.error("Error uploading photo:", uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("motivation-photos")
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const getNextPosition = async () => {
    const { data, error } = await supabase
      .from("motivation_content")
      .select("position")
      .eq("user_id", session?.user?.id)
      .order("position", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return 0;
    }

    return (data[0].position || 0) + 1;
  };

  const handleYoutubeSubmit = async () => {
    if (!youtubeUrl || !session?.user?.id) {
      alert("Please enter a YouTube URL");
      return;
    }

    setLoading(true);
    try {
      const videoId = youtubeUrl.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/
      )?.[1];

      if (!videoId) {
        alert("Please enter a valid YouTube URL");
        setLoading(false);
        return;
      }

      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      const position = await getNextPosition();

      const { error } = await supabase.from("motivation_content").insert({
        user_id: session.user.id,
        type: "youtube",
        title: youtubeTitle || "YouTube Video",
        url: youtubeUrl,
        thumbnail_url: thumbnailUrl,
        position: position,
      });

      if (error) {
        if (error.message.includes("relation") && error.message.includes("does not exist")) {
          alert("The Motivation feature needs to be set up. Please contact support or run the database migration.");
        } else {
          alert(`Error: ${error.message}`);
        }
        throw error;
      }

      setYoutubeUrl("");
      setYoutubeTitle("");
      onSuccess();
    } catch (error: any) {
      console.error("Error adding YouTube video:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInstagramSubmit = async () => {
    if (!instagramUrl || !session?.user?.id) {
      alert("Please enter an Instagram URL");
      return;
    }

    setLoading(true);
    try {
      // Try to fetch Instagram metadata for thumbnail
      let thumbnailUrl = null;
      let fetchedTitle = null;

      try {
        const metadataResponse = await fetch("/api/instagram/metadata", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: instagramUrl }),
        });

        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json();
          thumbnailUrl = metadata.thumbnail;
          // Only use fetched title if user didn't provide one
          if (!instagramTitle && metadata.title) {
            fetchedTitle = metadata.title.substring(0, 100); // Limit length
          }
        }
      } catch (metadataError) {
        console.log("Could not fetch Instagram metadata, continuing without thumbnail");
      }

      const position = await getNextPosition();

      const { error } = await supabase.from("motivation_content").insert({
        user_id: session.user.id,
        type: "instagram",
        title: instagramTitle || fetchedTitle || "Instagram Post",
        url: instagramUrl,
        thumbnail_url: thumbnailUrl,
        position: position,
      });

      if (error) {
        if (error.message.includes("relation") && error.message.includes("does not exist")) {
          alert("The Motivation feature needs to be set up. Please contact support or run the database migration.");
        } else {
          alert(`Error: ${error.message}`);
        }
        throw error;
      }

      setInstagramUrl("");
      setInstagramTitle("");
      onSuccess();
    } catch (error: any) {
      console.error("Error adding Instagram post:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoSubmit = async () => {
    if (!photoFile || !session?.user?.id) {
      alert("Please select a photo to upload");
      return;
    }

    setLoading(true);
    try {
      const imageUrl = await uploadPhoto();
      if (!imageUrl) {
        alert("Failed to upload photo. Please try again.");
        setLoading(false);
        return;
      }

      const position = await getNextPosition();

      const { error } = await supabase.from("motivation_content").insert({
        user_id: session.user.id,
        type: "photo",
        title: photoTitle || "Photo",
        image_url: imageUrl,
        position: position,
      });

      if (error) {
        if (error.message.includes("relation") && error.message.includes("does not exist")) {
          alert("The Motivation feature needs to be set up. Please contact support or run the database migration.");
        } else {
          alert(`Error: ${error.message}`);
        }
        throw error;
      }

      setPhotoFile(null);
      setPhotoPreview("");
      setPhotoTitle("");
      onSuccess();
    } catch (error: any) {
      console.error("Error adding photo:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTwitterSubmit = async () => {
    if (!twitterUrl || !session?.user?.id) {
      alert("Please enter a Twitter/X URL");
      return;
    }

    setLoading(true);
    try {
      const position = await getNextPosition();

      const { error } = await supabase.from("motivation_content").insert({
        user_id: session.user.id,
        type: "twitter",
        title: twitterTitle || "Twitter Post",
        url: twitterUrl,
        position: position,
      });

      if (error) {
        if (error.message.includes("relation") && error.message.includes("does not exist")) {
          alert("The Motivation feature needs to be set up. Please contact support or run the database migration.");
        } else {
          alert(`Error: ${error.message}`);
        }
        throw error;
      }

      setTwitterUrl("");
      setTwitterTitle("");
      onSuccess();
    } catch (error: any) {
      console.error("Error adding Twitter post:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Motivation Content</DialogTitle>
          <DialogDescription>
            Add a YouTube video, Instagram post, or upload a photo to your
            motivation board.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="youtube" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="youtube">
              <Youtube className="h-4 w-4 mr-2" />
              YouTube
            </TabsTrigger>
            <TabsTrigger value="instagram">
              <Instagram className="h-4 w-4 mr-2" />
              Instagram
            </TabsTrigger>
            <TabsTrigger value="twitter">
              <Twitter className="h-4 w-4 mr-2" />
              X/Twitter
            </TabsTrigger>
            <TabsTrigger value="photo">
              <ImageIcon className="h-4 w-4 mr-2" />
              Photo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="youtube" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="youtube-url">YouTube URL</Label>
              <Input
                id="youtube-url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="youtube-title">Title (optional)</Label>
              <Input
                id="youtube-title"
                placeholder="Enter a title for this video"
                value={youtubeTitle}
                onChange={(e) => setYoutubeTitle(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button onClick={onClose} variant="outline">
                Cancel
              </Button>
              <Button onClick={handleYoutubeSubmit} disabled={loading || !youtubeUrl}>
                Add Video
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="instagram" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="instagram-url">Instagram URL</Label>
              <Input
                id="instagram-url"
                placeholder="https://www.instagram.com/p/..."
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram-title">Title (optional)</Label>
              <Input
                id="instagram-title"
                placeholder="Enter a title for this post"
                value={instagramTitle}
                onChange={(e) => setInstagramTitle(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button onClick={onClose} variant="outline">
                Cancel
              </Button>
              <Button onClick={handleInstagramSubmit} disabled={loading || !instagramUrl}>
                Add Post
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="twitter" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="twitter-url">X/Twitter URL</Label>
              <Input
                id="twitter-url"
                placeholder="https://x.com/username/status/..."
                value={twitterUrl}
                onChange={(e) => setTwitterUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twitter-title">Title (optional)</Label>
              <Input
                id="twitter-title"
                placeholder="Enter a title for this post"
                value={twitterTitle}
                onChange={(e) => setTwitterTitle(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button onClick={onClose} variant="outline">
                Cancel
              </Button>
              <Button onClick={handleTwitterSubmit} disabled={loading || !twitterUrl}>
                Add Post
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="photo" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="photo-upload">Upload Photo</Label>
              <div className="flex items-center justify-center w-full">
                <label
                  htmlFor="photo-upload"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="h-full w-auto object-contain rounded"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-3 text-gray-400" />
                      <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                        Click to upload
                      </p>
                    </div>
                  )}
                  <input
                    id="photo-upload"
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handlePhotoChange}
                  />
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="photo-title">Title (optional)</Label>
              <Input
                id="photo-title"
                placeholder="Enter a title for this photo"
                value={photoTitle}
                onChange={(e) => setPhotoTitle(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button onClick={onClose} variant="outline">
                Cancel
              </Button>
              <Button onClick={handlePhotoSubmit} disabled={loading || !photoFile}>
                Upload Photo
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}