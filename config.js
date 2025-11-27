import dotenv from "dotenv";
dotenv.config();

export const BLIZZARD_CLIENT_ID = process.env.BLIZZARD_CLIENT_ID;
export const BLIZZARD_CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET;
export const BLIZZARD_REGION = process.env.BLIZZARD_REGION || 'us';
export const BLIZZARD_LOCALE = process.env.BLIZZARD_LOCALE || 'pt_BR';