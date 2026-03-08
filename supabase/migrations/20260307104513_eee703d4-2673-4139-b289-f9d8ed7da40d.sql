
CREATE TABLE public.saved_algorithm_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  algorithm_id TEXT NOT NULL,
  algorithm_name TEXT NOT NULL,
  input_data TEXT NOT NULL,
  steps_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  title TEXT
);

ALTER TABLE public.saved_algorithm_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON public.saved_algorithm_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sessions"
  ON public.saved_algorithm_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own sessions"
  ON public.saved_algorithm_sessions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
