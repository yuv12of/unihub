-- Applied 14.11.2026. A milestone can be split into steps: a step is a task of the same goal
-- that points at its milestone. Deleting the milestone deletes its steps.
alter table public.tasks add column if not exists milestone_id uuid references public.goal_milestones on delete cascade;
create index if not exists tasks_milestone on public.tasks (milestone_id);
