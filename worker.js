const BAKONG_API_BASE = "https://api-bakong.nbc.gov.kh";

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

function tlv(id, value) {
  const str = String(value);
  return `${id}${String(str.length).padStart(2, "0")}${str}`;
}

function crc16Ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function generateKhqrString({ bankAccount, merchantName, merchantCity, amount, billNumber }) {
  const payloadFormat = tlv("00", "01");
  const poiMethod = tlv("01", "12");
  // Bakong Tag 29: subtag 00 = account ID, subtag 01 = institution / acquirer tag if needed
  const merchantAccountInfo = tlv("29", tlv("00", bankAccount));
  const mcc = tlv("52", "5999");
  const currency = tlv("53", "840"); // USD
  const txnAmount = tlv("54", Number(amount).toFixed(2));
  const country = tlv("58", "KH");
  const name = tlv("59", String(merchantName || "KhmerSMM").slice(0, 25));
  const city = tlv("60", String(merchantCity || "Phnom Penh").slice(0, 15));
  const additional = tlv("62", tlv("01", String(billNumber || "ORDER").slice(0, 25)));

  const rawWithoutCrc =
    payloadFormat +
    poiMethod +
    merchantAccountInfo +
    mcc +
    currency +
    txnAmount +
    country +
    name +
    city +
    additional +
    "6304";

  return `${rawWithoutCrc}${crc16Ccitt(rawWithoutCrc)}`;
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

    try {
      const body = await request.json();

      if (url.pathname.endsWith("/generate-khqr")) {
        const bankAccount = (body.bankAccount || "mon_samnang@bkrt").trim();
        const merchantName = (body.merchantName || "KhmerSMM").trim();
        const merchantCity = (body.merchantCity || "Phnom Penh").trim();
        const amount = Number(body.amount || 0);
        const billNumber = (body.billNumber || `KSM${Date.now()}`).trim();

        if (!bankAccount || amount <= 0) {
          return jsonResponse({ error: "Invalid bankAccount or amount" }, 400);
        }

        const qrString = generateKhqrString({
          bankAccount,
          merchantName,
          merchantCity,
          amount,
          billNumber
        });

        return jsonResponse({
          qrString,
          bankAccount,
          merchantName,
          amount: amount.toFixed(2)
        });
      }

      if (url.pathname.endsWith("/check-payment")) {
        if (!env.BAKONG_TOKEN) {
          return jsonResponse({ paid: false, error: "Missing BAKONG_TOKEN secret" }, 500);
        }

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
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (err) {
      return jsonResponse({ paid: false, error: err.message }, 500);
    }
  }
};
