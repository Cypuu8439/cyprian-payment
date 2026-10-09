export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const { phone, amount } = req.body || {};

    if (!phone || amount === undefined || amount === null || amount === "") {
      return res.status(400).json({
        success: false,
        message: "Phone number and amount are required."
      });
    }

    const cleanPhone = String(phone).replace(/\D/g, "");
    let mpesaPhone = cleanPhone;

    if (cleanPhone.startsWith("07") || cleanPhone.startsWith("01")) {
      mpesaPhone = "254" + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith("7") || cleanPhone.startsWith("1")) {
      mpesaPhone = "254" + cleanPhone;
    }

    if (!/^254[71]\d{8}$/.test(mpesaPhone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Kenyan phone number."
      });
    }

    const paymentAmount = Number(amount);

    if (!Number.isInteger(paymentAmount) || paymentAmount < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount."
      });
    }

    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const passkey = process.env.MPESA_PASSKEY;
    const shortcode = process.env.MPESA_SHORTCODE;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

    const missing = [];

    if (!consumerKey) missing.push("MPESA_CONSUMER_KEY");
    if (!consumerSecret) missing.push("MPESA_CONSUMER_SECRET");
    if (!passkey) missing.push("MPESA_PASSKEY");
    if (!shortcode) missing.push("MPESA_SHORTCODE");
    if (!callbackUrl) missing.push("MPESA_CALLBACK_URL");

    if (missing.length > 0) {
      console.error("Missing M-PESA configuration:", missing);

      return res.status(500).json({
        success: false,
        message: "M-PESA configuration is incomplete.",
        missing
      });
    }

    if (!callbackUrl.startsWith("https://")) {
      console.error("M-PESA callback URL must use HTTPS.");

      return res.status(500).json({
        success: false,
        message: "The M-PESA callback URL must use HTTPS."
      });
    }

    // Safaricom timestamps use the local transaction time.
    const dateParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());

    const dateValues = Object.fromEntries(
      dateParts.map(part => [part.type, part.value])
    );

    const timestamp =
      dateValues.year +
      dateValues.month +
      dateValues.day +
      dateValues.hour +
      dateValues.minute +
      dateValues.second;

    const auth = Buffer.from(
      `${consumerKey}:${consumerSecret}`
    ).toString("base64");

    const authResponse = await fetch(
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`
        }
      }
    );

    const authData = await authResponse.json().catch(() => ({}));

    if (!authResponse.ok || !authData.access_token) {
      console.error("Daraja OAuth failed:", {
        httpStatus: authResponse.status,
        errorCode: authData.errorCode,
        errorMessage: authData.errorMessage
      });

      return res.status(502).json({
        success: false,
        message: "Unable to obtain M-PESA access token."
      });
    }

    const password = Buffer.from(
      `${shortcode}${passkey}${timestamp}`
    ).toString("base64");

    const stkResponse = await fetch(
      "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authData.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerBuyGoodsOnline",
          Amount: paymentAmount,
          PartyA: mpesaPhone,
          PartyB: shortcode,
          PhoneNumber: mpesaPhone,
          CallBackURL: callbackUrl,
          AccountReference: "CYPRIAN",
          TransactionDesc: "Payment to Cyprian Kipchumba"
        })
      }
    );

    const stkData = await stkResponse.json().catch(() => ({}));

    // Diagnostic log: does not log your consumer secret or passkey.
    console.log("Safaricom STK response:", JSON.stringify({
      httpStatus: stkResponse.status,
      ResponseCode: stkData.ResponseCode,
      ResponseDescription: stkData.ResponseDescription,
      CustomerMessage: stkData.CustomerMessage,
      errorCode: stkData.errorCode,
      errorMessage: stkData.errorMessage,
      MerchantRequestID: stkData.MerchantRequestID,
      CheckoutRequestID: stkData.CheckoutRequestID
    }));

    if (stkResponse.ok && stkData.ResponseCode === "0") {
      return res.status(200).json({
        success: true,
        message: "Safaricom accepted the STK Push request.",
        responseDescription: stkData.ResponseDescription,
        customerMessage: stkData.CustomerMessage,
        checkoutRequestID: stkData.CheckoutRequestID
      });
    }

    return res.status(502).json({
      success: false,
      message:
        stkData.errorMessage ||
        stkData.ResponseDescription ||
        "Safaricom rejected the STK Push request.",
      errorCode: stkData.errorCode || null
    });

  } catch (error) {
    console.error("STK Push server error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Payment service error."
    });
  }
        }
      
