'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Check, Trash2 } from 'lucide-react';
import { getJournalEntry, saveJournalEntry } from '@/lib/journal';
import { useToast } from '@/hooks/use-toast';
import { getWinterArcGoals, createWinterArcGoal, toggleWinterArcGoal, deleteWinterArcGoal, type WinterArcGoal } from '@/modules-core/winter-arc/lib/winter-arc-goals';

const QUESTIONS = [
  {
    id: 'limiting_thoughts',
    question: "What limiting thoughts are currently holding you back from achieving your goals in health, wealth, or freedom?",
  },
  {
    id: 'barrier_behaviors',
    question: "What specific behaviors or speech patterns might be creating barriers to your progress?",
  },
  {
    id: 'stuck_emotions',
    question: "Which emotions keep you stuck in your current situation, and why do they feel familiar or safe?",
  },
  {
    id: 'empowering_thoughts',
    question: "What new empowering thoughts do you want to consciously rewire into your brain?",
  },
  {
    id: 'daily_behaviors',
    question: "What daily behaviors reflect the person you want to become?",
  },
  {
    id: 'reinforcement_practices',
    question: "How can you practice and reinforce these new thought and behavior patterns each day?",
  },
  {
    id: 'future_feelings',
    question: "What would it feel like emotionally to have already achieved your goals?",
  },
  {
    id: 'embody_now',
    question: "How can you embody that future feeling right now, in your present state?",
  },
  {
    id: 'daily_actions',
    question: "What small daily actions could help your body and mind align with your desired future?",
  },
];

export default function WinterArcPage() {
  const { session } = useSupabase();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [goals, setGoals] = useState<WinterArcGoal[]>([]);
  const [newGoalTitle, setNewGoalTitle] = useState('');

  // Calculate countdown to Dec 31st 2025
  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      const target = new Date('2025-12-31T23:59:59');
      const difference = target.getTime() - now.getTime();

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        setCountdown({ days, hours, minutes, seconds });
      }
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);

    return () => clearInterval(interval);
  }, []);

  // Load existing journal entry and goals
  useEffect(() => {
    async function loadData() {
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }

      try {
        const tokenFn = async () => session?.access_token || null;

        // Load journal entry
        const data = await getJournalEntry('winter_arc', tokenFn);
        if (data) {
          const loadedAnswers: Record<string, string> = {};
          QUESTIONS.forEach(q => {
            if (data[q.id]) {
              loadedAnswers[q.id] = data[q.id];
            }
          });
          setAnswers(loadedAnswers);
        }

        // Load goals
        const goalsData = await getWinterArcGoals();
        setGoals(goalsData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    if (session) {
      loadData();
    }
  }, [session]);

  const handleAddGoal = async () => {
    if (!newGoalTitle.trim()) {
      toast({
        title: "Error",
        description: "Please enter a goal title",
        variant: "destructive",
      });
      return;
    }

    try {
      const newGoal = await createWinterArcGoal(newGoalTitle.trim());
      setGoals([...goals, newGoal]);
      setNewGoalTitle('');
      toast({
        title: "Success",
        description: "Goal added successfully",
      });
    } catch (error: any) {
      console.error('Error adding goal:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add goal",
        variant: "destructive",
      });
    }
  };

  const handleToggleGoal = async (goal: WinterArcGoal) => {
    try {
      const updatedGoal = await toggleWinterArcGoal(goal.id, !goal.completed);
      setGoals(goals.map(g => g.id === goal.id ? updatedGoal : g));
    } catch (error: any) {
      console.error('Error toggling goal:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to toggle goal",
        variant: "destructive",
      });
    }
  };

  const handleDeleteGoal = async (goalId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent toggle when clicking delete

    if (!confirm('Are you sure you want to delete this goal?')) {
      return;
    }

    try {
      await deleteWinterArcGoal(goalId);
      setGoals(goals.filter(g => g.id !== goalId));
      toast({
        title: "Success",
        description: "Goal deleted successfully",
      });
    } catch (error: any) {
      console.error('Error deleting goal:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete goal",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!session?.user?.id) {
      toast({
        title: "Error",
        description: "You must be logged in to save entries.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const tokenFn = async () => session?.access_token || null;

      const journalData = {
        entry_type: 'winter_arc',
        limiting_thoughts: answers.limiting_thoughts || null,
        barrier_behaviors: answers.barrier_behaviors || null,
        stuck_emotions: answers.stuck_emotions || null,
        empowering_thoughts: answers.empowering_thoughts || null,
        daily_behaviors: answers.daily_behaviors || null,
        reinforcement_practices: answers.reinforcement_practices || null,
        future_feelings: answers.future_feelings || null,
        embody_now: answers.embody_now || null,
        daily_actions: answers.daily_actions || null,
      };

      await saveJournalEntry(journalData, tokenFn);

      toast({
        title: "Success",
        description: "Your Winter Arc journal has been saved!",
      });
    } catch (error: any) {
      console.error('Error saving journal entry:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save your journal entry.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
            <div className="max-w-4xl mx-auto w-full">
              {/* Header with countdown */}
              <div className="mb-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h1 className="text-4xl font-bold mb-2">Winter Arc 2026</h1>
                    <p className="text-muted-foreground">
                      Transform yourself through conscious rewiring. Answer these questions to align your thoughts, behaviors, and emotions with your desired future.
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600">{countdown.days} Days Until Dec 31st, 2025</div>
                  </div>
                </div>

                {/* Winter Arc Goals */}
                <Card className="mb-8">
                  <CardHeader>
                    <CardTitle>Winter Arc Goals</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      {goals.map((goal) => (
                        <button
                          key={goal.id}
                          onClick={() => handleToggleGoal(goal)}
                          className="relative bg-gray-50 hover:bg-gray-100 border-2 rounded-lg p-6 text-center transition-all group"
                          style={{
                            opacity: goal.completed ? 0.3 : 1,
                          }}
                        >
                          <div className="text-sm font-semibold uppercase tracking-wide break-words">
                            {goal.title}
                          </div>
                          {/* Checkmark - shows when completed and not hovering */}
                          {goal.completed && (
                            <div className="absolute top-2 right-2 bg-green-500 rounded-full p-2 group-hover:opacity-0 transition-opacity">
                              <Check className="h-6 w-6 text-white" />
                            </div>
                          )}
                          {/* Delete button - shows on hover for all goals */}
                          <button
                            onClick={(e) => handleDeleteGoal(goal.id, e)}
                            className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Delete goal"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-white" />
                          </button>
                        </button>
                      ))}
                    </div>

                    {/* Add Goal Input */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a new goal..."
                        value={newGoalTitle}
                        onChange={(e) => setNewGoalTitle(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleAddGoal();
                          }
                        }}
                      />
                      <Button onClick={handleAddGoal} size="icon">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Journal Questions */}
              <div className="space-y-6">
                {QUESTIONS.map((item, index) => (
                  <Card key={item.id}>
                    <CardHeader>
                      <CardTitle className="text-lg">Question {index + 1}</CardTitle>
                      <CardDescription className="text-base">{item.question}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={answers[item.id] || ''}
                        onChange={(e) => setAnswers({ ...answers, [item.id]: e.target.value })}
                        placeholder="Type your answer here..."
                        className="min-h-[150px]"
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Save Button */}
              <div className="mt-8 flex justify-center">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Journal Entry'
                  )}
                </Button>
            </div>
          </div>
    </div>
  );
}
