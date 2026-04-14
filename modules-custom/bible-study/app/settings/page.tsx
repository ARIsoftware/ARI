'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, Settings, Save } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useBibleStudySettings, useUpdateBibleStudySettings } from '../../hooks/use-bible-study'
import type { KidInfo } from '../../types'
import { ACTIVE_VERSIONS } from '../../lib/bible-versions'

export default function BibleStudySettingsPage() {
  const { toast } = useToast()
  const { data: settings, isLoading } = useBibleStudySettings()
  const updateSettings = useUpdateBibleStudySettings()

  const [kids, setKids] = useState<KidInfo[]>([])
  const [selectedTranslations, setSelectedTranslations] = useState<string[]>([])
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')

  useEffect(() => {
    if (settings) {
      setKids(settings.kids || [])
      setSelectedTranslations(settings.preferredTranslations || [])
      setApiKey(settings.openrouterApiKey || '')
      setModel(settings.openrouterModel || '')
    }
  }, [settings])

  const updateKid = (index: number, field: keyof KidInfo, value: string | number) => {
    setKids((prev) => prev.map((k, i) => i === index ? { ...k, [field]: value } : k))
  }

  const addKid = () => setKids((prev) => [...prev, { name: '', age: 1 }])

  const removeKid = (index: number) => {
    setKids((prev) => prev.filter((_, i) => i !== index))
  }

  const toggleTranslation = (t: string) => {
    setSelectedTranslations((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
  }

  const handleSave = () => {
    const validKids = kids.filter((k) => k.name.trim())
    updateSettings.mutate(
      {
        kids: validKids,
        preferredTranslations: selectedTranslations,
        openrouterApiKey: apiKey.trim(),
        openrouterModel: model.trim(),
      },
      {
        onSuccess: () => toast({ title: 'Settings saved' }),
        onError: () => toast({ variant: 'destructive', title: 'Failed to save settings' }),
      }
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-4xl font-medium flex items-center gap-2">
          <Settings className="w-8 h-8" />
          Settings
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kids</CardTitle>
          <CardDescription>Manage your children&apos;s names and ages</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {kids.map((kid, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Name"
                value={kid.name}
                onChange={(e) => updateKid(i, 'name', e.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                placeholder="Age"
                value={kid.age}
                onChange={(e) => updateKid(i, 'age', parseInt(e.target.value) || 0)}
                className="w-20"
                min={0}
                max={18}
              />
              <Button variant="ghost" size="sm" onClick={() => removeKid(i)} className="text-red-500 px-2">
                &times;
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addKid}>
            <Plus className="w-3 h-3 mr-1" /> Add Kid
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bible Translations</CardTitle>
          <CardDescription>Select your preferred translations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ACTIVE_VERSIONS.map((v) => (
              <Button
                key={v.id}
                variant={selectedTranslations.includes(v.id) ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleTranslation(v.id)}
                title={v.name}
              >
                {v.code}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            New versions can be added to <code className="bg-muted px-1 rounded">modules-custom/bible-study/lib/bible-versions.ts</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Configuration</CardTitle>
          <CardDescription>OpenRouter settings for chat and word studies</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">OpenRouter API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="anthropic/claude-sonnet-4"
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={updateSettings.isPending} className="w-full">
        {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        Save Settings
      </Button>
    </div>
  )
}
