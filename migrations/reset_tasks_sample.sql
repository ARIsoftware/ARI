-- Reset tasks table to 3 sample tasks
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  my_user_id TEXT;
BEGIN
  -- Get user ID from Better Auth user table
  SELECT id INTO my_user_id FROM public."user" LIMIT 1;

  -- Delete all existing tasks for this user
  DELETE FROM public.tasks WHERE user_id = my_user_id::uuid;

  -- Insert 3 new tasks
  INSERT INTO public.tasks (user_id, title, status, priority)
  VALUES
    (my_user_id::uuid, 'Post on X.com about ARI.Software', 'Pending', 'Medium'),
    (my_user_id::uuid, 'Create my first ARI module', 'Pending', 'Medium'),
    (my_user_id::uuid, 'Add 3 important people to the Contact module', 'Pending', 'Medium');
END $$;
