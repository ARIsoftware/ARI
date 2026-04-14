'use client'

import { useState, useEffect } from 'react'
import { useModuleEnabled } from '@/lib/modules/module-hooks'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, BookOpen, Baby, User, Plus } from 'lucide-react'
import {
  useBibleStudySettings,
  useUpdateBibleStudySettings,
  useKidsStudies,
  usePersonalStudies,
} from '../hooks/use-bible-study'
import type { KidInfo } from '../types'
import BibleChat from '../components/bible-chat'
import { ACTIVE_VERSIONS } from '../lib/bible-versions'

export default function BibleStudyPage() {
  const { toast } = useToast()
  const { enabled: quotesEnabled, loading: quotesLoading } = useModuleEnabled('quotes')

  const { data: settings, isLoading: settingsLoading } = useBibleStudySettings()
  const updateSettings = useUpdateBibleStudySettings()
  const { data: kidsStudies = [] } = useKidsStudies()
  const { data: personalStudies = [] } = usePersonalStudies()

  const [randomQuote, setRandomQuote] = useState<{ quote: string; author?: string } | null>(null)

  // Onboarding state
  const [kids, setKids] = useState<KidInfo[]>([
    { name: '', age: 8 },
    { name: '', age: 6 },
    { name: '', age: 3 },
  ])
  const [selectedTranslations, setSelectedTranslations] = useState<string[]>(['ESV', 'KJV'])
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('anthropic/claude-sonnet-4')

  useEffect(() => {
    if (!quotesEnabled || quotesLoading) return
    let cancelled = false
    fetch('/api/modules/quotes/quotes')
      .then((res) => (res.ok ? res.json() : []))
      .then((quotes) => {
        if (!cancelled && quotes.length > 0) {
          setRandomQuote(quotes[Math.floor(Math.random() * quotes.length)])
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [quotesEnabled, quotesLoading])

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Onboarding screen
  if (!settings?.onboardingCompleted) {
    const updateKid = (index: number, field: keyof KidInfo, value: string | number) => {
      setKids((prev) => prev.map((k, i) => i === index ? { ...k, [field]: value } : k))
    }

    const addKid = () => setKids((prev) => [...prev, { name: '', age: 1 }])

    const removeKid = (index: number) => {
      if (kids.length <= 1) return
      setKids((prev) => prev.filter((_, i) => i !== index))
    }

    const toggleTranslation = (t: string) => {
      setSelectedTranslations((prev) =>
        prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
      )
    }

    const handleSetup = () => {
      const validKids = kids.filter((k) => k.name.trim())
      if (validKids.length === 0) {
        toast({ variant: 'destructive', title: 'Please enter at least one kid\'s name' })
        return
      }
      if (!apiKey.trim()) {
        toast({ variant: 'destructive', title: 'Please enter your OpenRouter API key' })
        return
      }

      updateSettings.mutate(
        {
          onboardingCompleted: true,
          kids: validKids,
          preferredTranslations: selectedTranslations,
          openrouterApiKey: apiKey.trim(),
          openrouterModel: model.trim() || 'anthropic/claude-sonnet-4',
        },
        {
          onError: () => toast({ variant: 'destructive', title: 'Failed to save settings' }),
        }
      )
    }

    return (
      <div className="p-6 max-w-lg mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Welcome to Bible Studies</CardTitle>
            <CardDescription>
              Build studies for your kids and deep-dive into scripture with Hebrew and Greek word analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label className="text-base font-medium">Your Kids</Label>
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
                  {kids.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeKid(i)} className="text-red-500 px-2">
                      &times;
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addKid}>
                <Plus className="w-3 h-3 mr-1" /> Add Kid
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-medium">Preferred Bible Translations</Label>
              <div className="flex flex-wrap gap-2">
                {ACTIVE_VERSIONS.map((v) => (
                  <Button
                    key={v.id}
                    variant={selectedTranslations.includes(v.id) ? 'default' : 'outline'}
                    size="sm"
                    title={v.name}
                    onClick={() => toggleTranslation(v.id)}
                  >
                    {v.code}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">OpenRouter API Key *</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-..."
              />
              <p className="text-xs text-muted-foreground">Required for AI chat and Hebrew/Greek translations</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">OpenRouter Model</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="anthropic/claude-sonnet-4"
              />
            </div>

            <Button className="w-full" onClick={handleSetup} disabled={updateSettings.isPending}>
              {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Get Started
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Main overview
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-4xl font-medium">Bible Studies</h1>
        {quotesEnabled && randomQuote && (
          <p className="text-sm text-[#aa2020] mt-1">{randomQuote.quote}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Baby className="w-5 h-5" />
              Kids Studies
            </CardTitle>
            <CardDescription>Bible studies for your children</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-medium mb-2">{kidsStudies.length}</div>
            <p className="text-sm text-muted-foreground mb-4">studies created</p>
            <Button variant="outline" className="w-full" onClick={() => (window.location.href = '/bible-study/kids')}>
              View Kids Studies
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Personal Studies
            </CardTitle>
            <CardDescription>Deep-dive scripture analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-medium mb-2">{personalStudies.length}</div>
            <p className="text-sm text-muted-foreground mb-4">studies created</p>
            <Button variant="outline" className="w-full" onClick={() => (window.location.href = '/bible-study/personal')}>
              View Personal Studies
            </Button>
          </CardContent>
        </Card>
      </div>

      {(kidsStudies.length > 0 || personalStudies.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Studies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...kidsStudies.slice(0, 3).map((s) => ({ ...s, _type: 'kids' as const })), ...personalStudies.slice(0, 3).map((s) => ({ ...s, _type: 'personal' as const }))]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 5)
                .map((study) => (
                  <div key={study.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                    <div>
                      <p className="font-medium">{study.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {study.book} {study.chapter} &middot; {study._type === 'kids' ? 'Kids' : 'Personal'} &middot; {new Date(study.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => (window.location.href = `/bible-study/${study._type === 'kids' ? 'kids' : 'personal'}`)}
                    >
                      View
                    </Button>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <BibleChat />
    </div>
  )
}
