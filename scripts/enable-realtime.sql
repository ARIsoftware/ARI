-- Enable real-time for the ari-database table
ALTER TABLE "ari-database" REPLICA IDENTITY FULL;

-- Enable real-time on the table (run this in Supabase SQL editor)
ALTER PUBLICATION supabase_realtime ADD TABLE "ari-database";
