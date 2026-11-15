-- Applied 15.11.2026. A task can be split into sub-tasks: a sub-task is a task that points at its
-- parent (one level only, kept by the app). Deleting the task deletes its sub-tasks.
alter table public.tasks add column if not exists parent_id uuid references public.tasks on delete cascade;
create index if not exists tasks_parent on public.tasks (parent_id);
