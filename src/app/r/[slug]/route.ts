import { NextRequest, NextResponse } from "next/server";
import { affiliateService } from "@/services/affiliate.service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  if (!slug) {
    return new NextResponse("Link not found", { status: 404 });
  }

  // Extract optional tracking context
  const searchParams = req.nextUrl.searchParams;
  const postId = searchParams.get("pid") || searchParams.get("post_id") || undefined;
  const userAgent = req.headers.get("user-agent") || undefined;
  const referer = req.headers.get("referer") || undefined;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined;
  const country =
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("cf-ipcountry") ||
    undefined;

  const result = await affiliateService.recordClick({
    slug,
    postId,
    userAgent,
    referer,
    ip,
    country,
  });

  if (!result) {
    return new NextResponse(
      `<!DOCTYPE html>
      <html>
        <head><title>Link Not Found</title></head>
        <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:80vh;flex-direction:column;">
          <h2>404 - Link Not Found</h2>
          <p>The affiliate link you are trying to visit is either inactive, expired, or does not exist.</p>
        </body>
      </html>`,
      {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }

  // Temporary 307 Redirect with strict cache disabling and SEO robot exclusion
  const response = NextResponse.redirect(result.destinationUrl, {
    status: 307,
  });
  response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  return response;
}
