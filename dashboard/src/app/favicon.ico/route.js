export async function GET() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
