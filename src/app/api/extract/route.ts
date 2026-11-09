import { NextResponse } from "next/server";
import { z } from "zod";
import { sniffImage, toPrefill } from "@/lib/extraction";
import { extractWithClaude, ServiceUnavailableError, UsageLimitError } from "@/server/claude";
import { clientIp, readCapped, sameOrigin } from "@/server/request";

export const maxDuration = 60;

// 4 MB of image is about 5.4 MB as base64; cap the JSON body accordingly.
const maxBodyBytes = 5_600_000;
const requestSchema = z.object({
  image: z.string().regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/),
});

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const body = await readCapped(request, maxBodyBytes);
  if (body === null) return json({ error: "Image too large (4 MB max)" }, 413);
  let image: string;
  try {
    image = requestSchema.parse(JSON.parse(body)).image;
  } catch {
    return json({ error: "Upload a PNG or JPEG image" }, 400);
  }
  const base64 = image.slice(image.indexOf(",") + 1);
  const mediaType = sniffImage(base64);
  if (!mediaType) return json({ error: "Upload a PNG or JPEG image" }, 400);
  try {
    // The image is processed in memory and never stored.
    const extraction = await extractWithClaude({ ip: clientIp(request), mediaType, base64 });
    return json({ extraction, prefill: toPrefill(extraction) });
  } catch (error) {
    if (error instanceof UsageLimitError) return json({ error: "Request limit reached" }, 429);
    if (error instanceof ServiceUnavailableError)
      return json({ error: "Extraction unavailable" }, 503);
    return json({ error: "Extraction unavailable" }, 502);
  }
}
