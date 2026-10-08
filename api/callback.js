export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ResultCode: 1,
      ResultDesc: "Method not allowed"
    });
  }

  try {
    const callback = req.body?.Body?.stkCallback;

    if (!callback) {
      return res.status(400).json({
        ResultCode: 1,
        ResultDesc: "Invalid callback"
      });
    }

    const resultCode = callback.ResultCode;
    const resultDesc = callback.ResultDesc;

    console.log("M-PESA PAYMENT RESULT:", {
      resultCode,
      resultDesc,
      checkoutRequestID: callback.CheckoutRequestID,
      merchantRequestID: callback.MerchantRequestID
    });

    if (resultCode === 0) {
      const items = callback.CallbackMetadata?.Item || [];

      const receipt =
        items.find(item => item.Name === "MpesaReceiptNumber")?.Value;

      const amount =
        items.find(item => item.Name === "Amount")?.Value;

      const phone =
        items.find(item => item.Name === "PhoneNumber")?.Value;

      console.log("PAYMENT SUCCESSFUL:", {
        receipt,
        amount,
        phone
      });
    } else {
      console.log("PAYMENT NOT COMPLETED:", resultDesc);
    }

    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: "Accepted"
    });

  } catch (error) {

    console.error("CALLBACK ERROR:", error);

    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: "Accepted"
    });
  }
}
