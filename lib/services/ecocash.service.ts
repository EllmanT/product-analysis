import EcocashTransaction, {
  IEcocashTransaction,
} from "@/database/ecocashTransaction.model";
import dbConnect from "@/lib/mongoose";
import { convertFromUsd, convertToUsd } from "@/lib/utils/exchangeRate";
import { recordPayment } from "@/lib/utils/recordPayment";
import { Types } from "mongoose";

interface InitiatePaymentInput {
  quotationId: string;
  customerId: string;
  phoneNumber: string;
  currency: string;
  usdAmount: number;
}

interface InitiatePaymentResult {
  referenceCode: string;
  clientCorrelator: string;
  localAmount: number;
  localCurrency: string;
  status: string;
}

function buildPayload(
  phoneNumber: string,
  amount: number,
  currency: string,
  clientCorrelator: string,
  referenceCode: string
): Record<string, unknown> {
  const notifyUrl = process.env.ECOCASH_NOTIFY_URL ?? "";

  return {
    clientCorrelator,
    notifyUrl,
    referenceCode,
    tranType: "MER",
    endUserId: phoneNumber,
    remarks: "STOCKFLOW ONLINE PAYMENT",
    transactionOperationStatus: "Charged",
    paymentAmount: {
      charginginformation: {
        amount,
        currency,
        description: "StockFlow Invoice Payment",
      },
      chargeMetaData: {
        channel: "WEB",
        purchaseCategoryCode: "Online Payment",
        onBeHalfOf: process.env.ECOCASH_MERCHANT_NAME ?? "StockFlow",
      },
    },
    merchantCode: process.env.ECOCASH_MERCHANT_CODE,
    merchantPin: process.env.ECOCASH_MERCHANT_PIN,
    merchantNumber: phoneNumber,
    currencyCode: currency,
    countryCode: "ZW",
    terminalID: process.env.ECOCASH_TERMINAL_ID,
    location: process.env.ECOCASH_LOCATION,
    superMerchantName: process.env.ECOCASH_SUPER_MERCHANT,
    merchantName: process.env.ECOCASH_MERCHANT_NAME,
  };
}

export async function initiatePayment(
  input: InitiatePaymentInput
): Promise<InitiatePaymentResult> {
  const { quotationId, customerId, phoneNumber, currency, usdAmount } = input;
  const localCurrency = currency.toUpperCase();

  await dbConnect();

  const localAmount = await convertFromUsd(usdAmount, localCurrency);
  const clientCorrelator = crypto.randomUUID();
  const referenceCode = `SFLOW${Date.now()}`;

  const payload = buildPayload(
    phoneNumber,
    localAmount,
    localCurrency,
    clientCorrelator,
    referenceCode
  );

  const txn = await EcocashTransaction.create({
    quotationId,
    customerId,
    clientCorrelator,
    referenceCode,
    phoneNumber,
    localAmount,
    localCurrency,
    usdAmount,
    status: "pending",
    ecocashResponse: {},
  });

  const apiUrl = process.env.ECOCASH_API_URL;
  const username = process.env.ECOCASH_USERNAME?.trim();
  const password = process.env.ECOCASH_PASSWORD?.trim();

  if (!apiUrl) throw new Error("ECOCASH_API_URL is not configured");

  const basicAuth = Buffer.from(`${username}:${password}`).toString("base64");

  let response: Response;
  let responseData: Record<string, unknown> = {};

  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify(payload),
    });

    try {
      responseData = (await response.json()) as Record<string, unknown>;
    } catch {
      responseData = {};
    }
  } catch (err) {
    txn.ecocashResponse = { fetchError: String(err) };
    await txn.save();
    throw new Error(
      `EcoCash API connection failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  txn.ecocashResponse = responseData;
  await txn.save();

  if (!response.ok) {
    console.error("[EcoCash] initiation failed", {
      clientCorrelator,
      httpStatus: response.status,
      response: responseData,
    });
    throw new Error(
      (responseData.message as string) ??
        `EcoCash returned HTTP ${response.status}`
    );
  }

  console.log("[EcoCash] initiation successful", {
    clientCorrelator,
    ecocashStatus: responseData.transactionOperationStatus ?? null,
  });

  return {
    referenceCode,
    clientCorrelator,
    localAmount,
    localCurrency,
    status:
      typeof responseData.transactionOperationStatus === "string"
        ? responseData.transactionOperationStatus
        : "Pending",
  };
}

export async function handleWebhookNotification(
  payload: Record<string, unknown>
): Promise<void> {
  // Redact merchantPin before logging
  const logPayload = { ...payload };
  for (const key of ["merchantPin", "merchant_pin"]) {
    if (key in logPayload) logPayload[key] = "***";
  }
  console.log("[EcoCash] webhook notification", logPayload);

  const clientCorrelator =
    typeof payload.clientCorrelator === "string"
      ? payload.clientCorrelator
      : null;
  const referenceCode =
    typeof payload.referenceCode === "string" ? payload.referenceCode : null;
  const operationStatus =
    typeof payload.transactionOperationStatus === "string"
      ? payload.transactionOperationStatus.toUpperCase()
      : "";
  const responseCode =
    typeof payload.ecocashResponseCode === "string"
      ? payload.ecocashResponseCode.toUpperCase()
      : "";

  await dbConnect();

  let txn = null;
  if (clientCorrelator) {
    txn = await EcocashTransaction.findOne({ clientCorrelator });
  }
  if (!txn && referenceCode) {
    txn = await EcocashTransaction.findOne({ referenceCode });
  }

  if (!txn) {
    console.error("[EcoCash] no transaction found for webhook", {
      clientCorrelator,
      referenceCode,
    });
    return;
  }

  txn.ecocashResponse = payload;
  await txn.save();

  if (txn.status !== "pending") {
    console.log("[EcoCash] webhook skipped — transaction not pending", {
      clientCorrelator: txn.clientCorrelator,
      currentStatus: txn.status,
    });
    return;
  }

  const isSuccess =
    ["CHARGED", "COMPLETED", "SUCCESS", "SUCCEEDED"].includes(operationStatus) ||
    responseCode === "SUCCEEDED";

  const isFailure =
    ["DELIVERYIMPOSSIBLE", "CANCELLED", "FAILED"].includes(operationStatus) ||
    responseCode === "FAILED";

  if (isSuccess) {
    try {
      const usdAmount = await convertToUsd(txn.localAmount, txn.localCurrency);
      await recordPayment({
        quotationId: txn.quotationId.toString(),
        usdAmount,
        method: "ecocash",
        reference: txn.referenceCode,
      });
      txn.status = "completed";
      txn.completedAt = new Date();
      txn.paymentId = txn.referenceCode;
      await txn.save();
      console.log("[EcoCash] payment recorded successfully", {
        clientCorrelator: txn.clientCorrelator,
        referenceCode: txn.referenceCode,
      });
    } catch (err) {
      console.error("[EcoCash] failed to record payment after successful notification", {
        clientCorrelator: txn.clientCorrelator,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (isFailure) {
    txn.status = "failed";
    await txn.save();
    console.log("[EcoCash] payment failed/cancelled", {
      clientCorrelator: txn.clientCorrelator,
      referenceCode: txn.referenceCode,
      operationStatus,
      responseCode,
    });
  }
}

export interface EcocashTransactionLean extends IEcocashTransaction {
  _id: Types.ObjectId;
}

export async function getTransaction(
  referenceCode: string
): Promise<EcocashTransactionLean | null> {
  await dbConnect();
  return EcocashTransaction.findOne({ referenceCode }).lean<EcocashTransactionLean>();
}
