// What a request can end in other than its answer: an HTTP status, what to say, and (for a form) the field it's about
export class HttpError extends Error {
  constructor(status, message, field) { super(message); this.status = status; this.field = field; }
}
