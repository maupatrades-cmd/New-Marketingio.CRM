-- 37_scoreboard_glow_up.sql
-- Scoreboard glow-up v1: goal columns on profiles + 25 motivational quotes.
-- No money/bonus engine changes.

alter table public.profiles
  add column if not exists monthly_goal_wins integer not null default 5;
alter table public.profiles
  add column if not exists dream_caption text;

update public.profiles
   set monthly_goal_wins = 5
 where id in (
   '346eed88-dae5-4d93-a22f-288262890413',  -- admin@marketingio.co.za
   '4f1bccdd-be68-420f-9b7c-233fefaf52c2',  -- business.lekgoro@gmail.com (Thapelo)
   'b6cee0b9-e5cd-4075-9709-1e49776da781',  -- cpc1@marketingio.co.za
   'f35a3a06-2178-412a-917d-fcb58f94f3eb'   -- field1@marketingio.co.za
 );

insert into public.system_settings(key, value) values (
  'motivational_quotes.v1',
  '[
    {"quote":"It always seems impossible until it''s done.","author":"Nelson Mandela","category":"sa_legend"},
    {"quote":"Do not judge me by my successes, judge me by how many times I fell down and got back up again.","author":"Nelson Mandela","category":"sa_legend"},
    {"quote":"Education is the most powerful weapon which you can use to change the world.","author":"Nelson Mandela","category":"sa_legend"},
    {"quote":"Lead from the back — and let others believe they are in front.","author":"Nelson Mandela","category":"sa_legend"},
    {"quote":"Hope is being able to see that there is light despite all of the darkness.","author":"Archbishop Desmond Tutu","category":"sa_legend"},
    {"quote":"Do your little bit of good where you are; it''s those little bits of good put together that overwhelm the world.","author":"Archbishop Desmond Tutu","category":"sa_legend"},
    {"quote":"Ubuntu — I am because we are.","author":"Archbishop Desmond Tutu","category":"sa_legend"},
    {"quote":"The most potent weapon of the oppressor is the mind of the oppressed.","author":"Steve Biko","category":"sa_legend"},
    {"quote":"In time, we shall be in a position to bestow on South Africa the greatest possible gift — a more human face.","author":"Steve Biko","category":"sa_legend"},
    {"quote":"We spend so much time being afraid of failure, afraid of rejection. But regret is the thing we should fear most.","author":"Trevor Noah","category":"sa_legend"},
    {"quote":"Language brings with it an identity and a culture. A shared language says we''re the same.","author":"Trevor Noah","category":"sa_legend"},
    {"quote":"You do not rise to the level of your goals. You fall to the level of your systems.","author":"James Clear — Atomic Habits","category":"business_book"},
    {"quote":"Every action you take is a vote for the type of person you wish to become.","author":"James Clear — Atomic Habits","category":"business_book"},
    {"quote":"Make it obvious. Make it attractive. Make it easy. Make it satisfying.","author":"James Clear — Atomic Habits","category":"business_book"},
    {"quote":"Success is the product of daily habits — not once-in-a-lifetime transformations.","author":"James Clear — Atomic Habits","category":"business_book"},
    {"quote":"Enthusiasm is common. Endurance is rare.","author":"Angela Duckworth — Grit","category":"business_book"},
    {"quote":"Grit is living life like it''s a marathon, not a sprint.","author":"Angela Duckworth — Grit","category":"business_book"},
    {"quote":"Becoming is better than being.","author":"Carol Dweck — Mindset","category":"business_book"},
    {"quote":"The view you adopt for yourself profoundly affects the way you lead your life.","author":"Carol Dweck — Mindset","category":"business_book"},
    {"quote":"Small, seemingly insignificant steps completed consistently over time will create a radical difference.","author":"Darren Hardy — The Compound Effect","category":"business_book"},
    {"quote":"You make your choices, and then your choices make you.","author":"Darren Hardy — The Compound Effect","category":"business_book"},
    {"quote":"Hard things are hard because there are no easy answers or recipes. They are hard because your emotions are at odds with your logic.","author":"Ben Horowitz — The Hard Thing About Hard Things","category":"business_book"},
    {"quote":"I can do all things through Christ who strengthens me.","author":"Philippians 4:13","category":"faith"},
    {"quote":"For I know the plans I have for you — plans to prosper you and not to harm you, plans to give you hope and a future.","author":"Jeremiah 29:11","category":"faith"},
    {"quote":"With God all things are possible.","author":"Matthew 19:26","category":"faith"}
  ]'::jsonb
) on conflict (key) do update set value = excluded.value;
