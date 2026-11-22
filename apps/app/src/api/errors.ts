// خطأ من الخادم (الحقيقي أو التجريبي): رمز الخطأ والحالة، والواجهة تحوّله لرسالة (mapping.ts).
export class ApiClientError extends Error {
  code: string;
  status: number;
  retryAfterSeconds?: number;
  constructor(status: number, code: string, retryAfterSeconds?: number) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
