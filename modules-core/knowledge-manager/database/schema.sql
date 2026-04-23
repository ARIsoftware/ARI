-- =============================================================================
-- KNOWLEDGE MANAGER MODULE - DATABASE SCHEMA
-- =============================================================================
-- Idempotent: safe to run on every module enable.
-- Mirrors modules-core/knowledge-manager/database/schema.ts
-- =============================================================================

-- =============================================================================
-- TABLE: knowledge_collections
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#6b7280',
  icon VARCHAR(50) DEFAULT 'Folder',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_collections_user_id
  ON knowledge_collections(user_id);

ALTER TABLE knowledge_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own knowledge_collections" ON knowledge_collections;
CREATE POLICY "Users can view their own knowledge_collections"
  ON knowledge_collections FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS "Users can insert their own knowledge_collections" ON knowledge_collections;
CREATE POLICY "Users can insert their own knowledge_collections"
  ON knowledge_collections FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS "Users can update their own knowledge_collections" ON knowledge_collections;
CREATE POLICY "Users can update their own knowledge_collections"
  ON knowledge_collections FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')))
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS "Users can delete their own knowledge_collections" ON knowledge_collections;
CREATE POLICY "Users can delete their own knowledge_collections"
  ON knowledge_collections FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

CREATE OR REPLACE FUNCTION update_knowledge_collections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS knowledge_collections_updated_at ON knowledge_collections;
CREATE TRIGGER knowledge_collections_updated_at
  BEFORE UPDATE ON knowledge_collections
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_collections_updated_at();

-- =============================================================================
-- TABLE: knowledge_articles
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  collection_id UUID REFERENCES knowledge_collections(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- For existing installs that predate collections/status columns
ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES knowledge_collections(id) ON DELETE SET NULL;
ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft';
ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_articles_status_check'
  ) THEN
    ALTER TABLE knowledge_articles
      ADD CONSTRAINT knowledge_articles_status_check
      CHECK (status IN ('draft', 'published'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_user_id
  ON knowledge_articles(user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_created_at
  ON knowledge_articles(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_tags
  ON knowledge_articles USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_collection_id
  ON knowledge_articles(collection_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_status
  ON knowledge_articles(status);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_is_favorite
  ON knowledge_articles(is_favorite) WHERE is_favorite = true;

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_is_deleted
  ON knowledge_articles(is_deleted);

ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own knowledge_articles" ON knowledge_articles;
CREATE POLICY "Users can view their own knowledge_articles"
  ON knowledge_articles FOR SELECT
  USING (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS "Users can insert their own knowledge_articles" ON knowledge_articles;
CREATE POLICY "Users can insert their own knowledge_articles"
  ON knowledge_articles FOR INSERT
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS "Users can update their own knowledge_articles" ON knowledge_articles;
CREATE POLICY "Users can update their own knowledge_articles"
  ON knowledge_articles FOR UPDATE
  USING (user_id = (SELECT current_setting('app.current_user_id')))
  WITH CHECK (user_id = (SELECT current_setting('app.current_user_id')));

DROP POLICY IF EXISTS "Users can delete their own knowledge_articles" ON knowledge_articles;
CREATE POLICY "Users can delete their own knowledge_articles"
  ON knowledge_articles FOR DELETE
  USING (user_id = (SELECT current_setting('app.current_user_id')));

CREATE OR REPLACE FUNCTION update_knowledge_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS knowledge_articles_updated_at ON knowledge_articles;
CREATE TRIGGER knowledge_articles_updated_at
  BEFORE UPDATE ON knowledge_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_articles_updated_at();

-- =============================================================================
-- SAMPLE DATA (only inserted on first install when tables are empty)
-- =============================================================================

DO $$
DECLARE
  my_user_id TEXT;
  travel_collection_id UUID;
  recipes_collection_id UUID;
  tech_collection_id UUID;
  personal_collection_id UUID;
  article_count INTEGER;
BEGIN
  -- Skip if articles already exist
  SELECT COUNT(*) INTO article_count FROM knowledge_articles;
  IF article_count > 0 THEN
    RETURN;
  END IF;

  -- Get the first user ID
  SELECT id INTO my_user_id FROM public."user" LIMIT 1;

  IF my_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Create collections
  INSERT INTO knowledge_collections (user_id, name, color, icon, sort_order)
  VALUES (my_user_id, 'Travel', '#3b82f6', 'Folder', 1)
  RETURNING id INTO travel_collection_id;

  INSERT INTO knowledge_collections (user_id, name, color, icon, sort_order)
  VALUES (my_user_id, 'Recipes', '#f59e0b', 'Folder', 2)
  RETURNING id INTO recipes_collection_id;

  INSERT INTO knowledge_collections (user_id, name, color, icon, sort_order)
  VALUES (my_user_id, 'Tech Notes', '#8b5cf6', 'Folder', 3)
  RETURNING id INTO tech_collection_id;

  INSERT INTO knowledge_collections (user_id, name, color, icon, sort_order)
  VALUES (my_user_id, 'Personal', '#ec4899', 'Folder', 4)
  RETURNING id INTO personal_collection_id;

  INSERT INTO knowledge_articles (user_id, title, content, tags, status, is_favorite, collection_id)
  VALUES (
    my_user_id,
    'Japan Trip Planning',
    E'# Japan Trip 2025\n\nPlanning a 2-week trip to Japan in spring for cherry blossom season.\n\n## Cities to Visit\n- Tokyo (5 days)\n- Kyoto (4 days)\n- Osaka (3 days)\n- Day trip to Nara\n\n## Must-Do Activities\n- Visit Fushimi Inari shrine at sunrise\n- Try authentic ramen in Tokyo\n- See cherry blossoms at Maruyama Park\n- Experience a traditional ryokan\n- Visit teamLab Borderless\n\n## Budget Estimate\n- Flights: $1,200\n- Accommodation: $1,500\n- JR Pass: $300\n- Food & Activities: $1,000\n\nTotal: ~$4,000',
    ARRAY['travel', 'japan', 'planning'],
    'draft',
    false,
    travel_collection_id
  );

  INSERT INTO knowledge_articles (user_id, title, content, tags, status, is_favorite, collection_id)
  VALUES (
    my_user_id,
    'Homemade Fresh Pasta',
    E'# Fresh Pasta Recipe\n\nNothing beats homemade pasta!\n\n## Ingredients\n- 2 cups 00 flour (or all-purpose)\n- 3 large eggs\n- 1 tbsp olive oil\n- Pinch of salt\n\n## Instructions\n1. Make a well in the flour\n2. Add eggs, oil, and salt to center\n3. Gradually incorporate flour into eggs\n4. Knead for 10 minutes until smooth\n5. Rest for 30 minutes\n6. Roll out thin and cut into desired shape\n\n## Tips\n- The dough should be slightly tacky but not sticky\n- Let it rest - this relaxes the gluten\n- Dust with semolina to prevent sticking',
    ARRAY['recipes', 'italian', 'cooking'],
    'published',
    true,
    recipes_collection_id
  );

  INSERT INTO knowledge_articles (user_id, title, content, tags, status, is_favorite, collection_id)
  VALUES (
    my_user_id,
    'Git Commands',
    E'# Essential Git Commands\n\n## Daily Workflow\n```bash\ngit status              # Check current state\ngit add .               # Stage all changes\ngit commit -m "msg"     # Commit with message\ngit push                # Push to remote\ngit pull                # Pull latest changes\n```\n\n## Branching\n```bash\ngit branch              # List branches\ngit checkout -b feature # Create and switch\ngit merge feature       # Merge branch\ngit branch -d feature   # Delete branch\n```\n\n## Useful Commands\n```bash\ngit log --oneline       # Compact history\ngit stash               # Stash changes\ngit stash pop           # Apply stashed changes\ngit reset --hard HEAD   # Discard all changes\n```\n\n## Pro Tips\n- Always pull before starting work\n- Write meaningful commit messages\n- Use branches for features',
    ARRAY['git', 'programming', 'reference'],
    'published',
    true,
    tech_collection_id
  );

  INSERT INTO knowledge_articles (user_id, title, content, tags, status, is_favorite, collection_id)
  VALUES (
    my_user_id,
    'My Morning Routine',
    E'# Morning Routine for Productivity\n\n## 5:30 AM - Wake Up\n- No snooze button!\n- Drink a full glass of water\n- 5 minutes of stretching\n\n## 5:45 AM - Exercise\n- 30-minute workout or run\n- Shower and get ready\n\n## 6:30 AM - Mindfulness\n- 10-minute meditation\n- Journal for 5 minutes\n- Review daily goals\n\n## 7:00 AM - Breakfast\n- Healthy breakfast (oatmeal or eggs)\n- No phone during meals\n- Review calendar for the day\n\n## 7:30 AM - Deep Work\n- Start with most important task\n- No meetings before 10 AM\n\n## Key Principles\n- Consistency is more important than perfection\n- Prepare everything the night before\n- Track progress weekly',
    ARRAY['productivity', 'habits', 'personal'],
    'published',
    false,
    personal_collection_id
  );

  INSERT INTO knowledge_articles (user_id, title, content, tags, status, is_favorite, collection_id)
  VALUES (
    my_user_id,
    'Thai Green Curry',
    E'# Thai Green Curry\n\nAuthentic and delicious!\n\n## Ingredients\n- 400ml coconut milk\n- 2 tbsp green curry paste\n- 500g chicken thigh, sliced\n- 1 cup Thai basil\n- 2 tbsp fish sauce\n- 1 tbsp palm sugar\n- Thai eggplant or regular eggplant\n- Bamboo shoots\n- Kaffir lime leaves\n\n## Method\n1. Heat thick coconut cream, add curry paste\n2. Cook until fragrant and oil separates\n3. Add chicken, cook through\n4. Pour in remaining coconut milk\n5. Add vegetables and seasonings\n6. Simmer 10 minutes\n7. Finish with Thai basil\n\nServe with jasmine rice!',
    ARRAY['recipes', 'thai', 'cooking', 'dinner'],
    'published',
    false,
    recipes_collection_id
  );

  INSERT INTO knowledge_articles (user_id, title, content, tags, status, is_favorite, collection_id)
  VALUES (
    my_user_id,
    'Ultimate Travel Packing List',
    E'# Travel Packing List\n\nMinimalist packing for any trip.\n\n## Clothing (1 week)\n- [ ] 4 t-shirts\n- [ ] 2 pants/shorts\n- [ ] 7 underwear\n- [ ] 4 pairs socks\n- [ ] 1 jacket/sweater\n- [ ] Sleepwear\n- [ ] Swimsuit (if needed)\n\n## Electronics\n- [ ] Phone + charger\n- [ ] Laptop + charger\n- [ ] Power bank\n- [ ] Universal adapter\n- [ ] Earbuds\n- [ ] Kindle\n\n## Toiletries\n- [ ] Toothbrush + paste\n- [ ] Deodorant\n- [ ] Sunscreen\n- [ ] Medications\n- [ ] First aid basics\n\n## Documents\n- [ ] Passport\n- [ ] ID\n- [ ] Travel insurance\n- [ ] Booking confirmations\n- [ ] Credit cards\n\n## Pro Tips\n- Roll clothes to save space\n- Wear bulky items on plane\n- Pack a day bag separately',
    ARRAY['travel', 'packing', 'checklist'],
    'published',
    true,
    travel_collection_id
  );

  INSERT INTO knowledge_articles (user_id, title, content, tags, status, is_favorite, collection_id)
  VALUES (
    my_user_id,
    'Atomic Habits - Key Takeaways',
    E'# Atomic Habits by James Clear\n\n## Core Concepts\n\n### The 4 Laws of Behavior Change\n1. **Make it obvious** - Design your environment\n2. **Make it attractive** - Bundle with enjoyment\n3. **Make it easy** - Reduce friction\n4. **Make it satisfying** - Immediate reward\n\n### The Habit Loop\nCue -> Craving -> Response -> Reward\n\n## Key Quotes\n> "You do not rise to the level of your goals. You fall to the level of your systems."\n\n> "Every action you take is a vote for the type of person you wish to become."\n\n## Implementation Ideas\n- Habit stacking: After [current habit], I will [new habit]\n- Environment design: Make good habits obvious, bad habits invisible\n- Two-minute rule: Scale down habits to 2 minutes\n- Never miss twice: If you skip once, get back on track immediately\n\n## Rating: 9/10\nOne of the best books on building habits. Practical and actionable.',
    ARRAY['books', 'productivity', 'habits', 'notes'],
    'published',
    false,
    personal_collection_id
  );

  INSERT INTO knowledge_articles (user_id, title, content, tags, status, is_favorite, collection_id)
  VALUES (
    my_user_id,
    'Sourdough Bread Guide',
    E'# Sourdough Bread\n\n## Starter Maintenance\n- Feed daily: 1:1:1 ratio (starter:flour:water)\n- Keep at room temp if baking often\n- Refrigerate if baking weekly\n\n## Basic Recipe\n\n### Ingredients\n- 100g active starter\n- 375g water\n- 500g bread flour\n- 10g salt\n\n### Timeline\n- 9 AM: Mix dough, autolyse 30 min\n- 9:30 AM: Add salt, begin stretch & folds\n- 10 AM - 1 PM: Stretch & fold every 30 min\n- 1 PM - 5 PM: Bulk fermentation\n- 5 PM: Shape and into banneton\n- Overnight: Cold proof in fridge\n- Next morning: Bake at 500F in Dutch oven\n\n### Baking\n- Preheat Dutch oven 1 hour\n- Score the top\n- 20 min covered\n- 25 min uncovered\n- Cool completely before cutting!\n\n## Troubleshooting\n- Dense crumb? Longer bulk ferment\n- Flat loaf? Better shaping or stronger starter',
    ARRAY['recipes', 'baking', 'bread', 'sourdough'],
    'draft',
    false,
    recipes_collection_id
  );

END $$;
