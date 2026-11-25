const BAKONG_API_BASE = "https://api-bakong.nbc.gov.kh"; // ឬ https://sit-api-bakong.nbc.gov.kh បើប្រើ SIT

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return jsonResponse({}, 204);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const url = new URL(request.url);
    if (!url.pathname.endsWith("/check-payment")) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (!env.BAKONG_TOKEN) {
      return jsonResponse({ error: "Missing BAKONG_TOKEN secret" }, 500);
    }

    try {
      const body = await request.json();
      const md5 = (body.md5 || "").trim();

      if (!md5) {
        return jsonResponse({ paid: false, error: "Missing md5" }, 400);
      }

      const bakongRes = await fetch(`${BAKONG_API_BASE}/v1/check_transaction_by_md5`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.BAKONG_TOKEN}`
        },
        body: JSON.stringify({ md5 })
      });

      const bakongData = await bakongRes.json();
      const paid =
        bakongRes.ok &&
        (bakongData.responseCode === 0 ||
          bakongData.status === "SUCCESS" ||
          Boolean(bakongData.data));

      return jsonResponse({
        paid,
        raw: bakongData
      });
    } catch (err) {
      return jsonResponse({ paid: false, error: err.message }, 500);
    }
  }
};
