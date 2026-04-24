import { CredentialsSignin } from "next-auth";

/** Thrown from Credentials `authorize` with a clear message and stable `code` for logs. */
export class DetailedCredentialsSignin extends CredentialsSignin {
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/** Auth.js appends "Read more at https://errors.authjs.dev#…" to every AuthError message. */
export function stripAuthJsErrorSuffix(message: string): string {
  return message
    .replace(/\.\s*Read more at https:\/\/errors\.authjs\.dev#\S+$/i, "")
    .trim();
}
