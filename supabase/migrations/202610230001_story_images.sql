-- Image advertised by the story's source feed (media:*, enclosure, inline img,
-- or a YouTube thumbnail). Only the URL is stored; the image stays on the
-- publisher's host.
alter table public.stories
  add column if not exists image_url text;
