export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const { phone, amount } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({
        success: false,
        message: "Phone number and amount are required."
      });
    }

    const cleanPhone = phone.replace(/\D/g, "");

    let mpesaPhone = cleanPhone;

    if (cleanPhone.startsWith("07")) {
      mpesaPhone = "254" + cleanPhone.substring(1);
    }

    if (
      !/^2547\d{8}$/.test(mpesaPhone) &&
      !/^2541\d{8}$/.test(mpesaPhone)
    ) {
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

    if (
      !consumerKey ||
      !consumerSecret ||
      !passkey ||
      !shortcode ||
      !callbackUrl
    ) {
      return res.status(500).json({
        success: false,
        message: "M-PESA configuration is incomplete."
      });
    }

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

    const authData = await authResponse.json();

    if (!authData.access_token) {
      return res.status(500).json({
        success: false,
        message: "Unable to obtain M-PESA access token."
      });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/\D/g, "")
      .substring(0, 14);

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

    const stkData = await stkResponse.json();

    if (stkData.ResponseCode === "0") {
      return res.status(200).json({
        success: true,
        message: "STK Push sent successfully.",
        checkoutRequestID: stkData.CheckoutRequestID
      });
    }

    return res.status(400).json({
      success: false,
      message: stkData.errorMessage ||
        stkData.ResponseDescription ||
        "STK Push failed."
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Payment service error."
    });
  }
}
