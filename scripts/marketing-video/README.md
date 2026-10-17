# Marketing video

Builds the vertical (1080×1920, 30 fps, H.264, about 50 s, under 10 MB) WhatsApp video of
RideKmer in French and English from the real interface and the showcase sample data
(`prisma/seed-data/showcase.ts`). Captions live in `copy.json`.

Requirements: a local build of the app, PostgreSQL, Python 3 with Pillow, ffmpeg, Playwright's
Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE` if it is not the default one).

```bash
# 1. A clean database with only reference, demo and showcase data
createdb ridekmer_video
DATABASE_URL=…/ridekmer_video DIRECT_DATABASE_URL=…/ridekmer_video pnpm db:migrate:deploy
DATABASE_URL=…/ridekmer_video DIRECT_DATABASE_URL=…/ridekmer_video ALLOW_DEMO_SEED=true pnpm db:seed
#    hide the 3 older demo cars so the catalogue shows the 10 samples only
psql …/ridekmer_video -c "update \"Vehicle\" set status='DRAFT' where \"registrationNumber\" not like 'EX-%'"

# 2. Serve the production build on :3000 against that database
pnpm build && DATABASE_URL=…/ridekmer_video pnpm start

# 3. Screens, cards and offsets (IDs of EX-102-YDE and EX-108-DLA from the database)
IDS='{"prado":"<id of EX-102-YDE>","hiace":"<id of EX-108-DLA>"}'
node scripts/marketing-video/capture.mjs out/fr fr "$IDS"
node scripts/marketing-video/cards.mjs out/cards-fr fr ridekmerw.vercel.app
node scripts/marketing-video/measure.mjs fr "$IDS"   # prints the offsets JSON

# 4. Video
python3 scripts/marketing-video/compose.py out/fr out/cards-fr '<offsets JSON>' RideKmer-FR.mp4
```

Repeat steps 3–4 with `en`. The closing card credits every Commons photo author and licence
(required by CC BY / CC BY-SA) and states that the vehicles and data are examples.
