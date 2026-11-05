-- Carry the original Night Hack IV sponsors into editable event data.
-- New events have no default sponsors. Existing customized lists are retained.
UPDATE public.hackbuddy_events
SET data = jsonb_set(data, '{config,settings,sponsors}', '[
 {"id":"bolt-new","name":"bolt.new","logo":"/sponsors/bolt-new.svg"},
 {"id":"ai","name":"AI","logo":"/sponsors/ai.svg"},
 {"id":"mercury","name":"Mercury","logo":"/sponsors/mercury.svg"},
 {"id":"heypcb","name":"heypcb","logo":"/sponsors/heypcb.svg"},
 {"id":"firecrawl","name":"Firecrawl","logo":"/sponsors/firecrawl.svg"}
]'::jsonb), revision = revision + 1
WHERE id = 'recbSwdY0G9XnuDpt'
AND data->'config'->>'slug' = 'nighthack4'
AND coalesce(jsonb_array_length(data #> '{config,settings,sponsors}'), 0) = 0;
